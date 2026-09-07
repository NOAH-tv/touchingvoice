import { analyzeFrame } from './audio.js';
import { createVoiceMetricsAccumulator, VOICE_METRIC_KEYS } from './pro-metrics.js';
import { ANALYZER_FIELDS, extractAnalyzerFeatures } from './analyzer-metrics.js';
import { DEFAULT_PROFILE, LAYER_KEYS, processLayers, sanitizeProfile } from './tuning.js';

export const FILE_ANALYSIS_VERSION = 1;
export const FILE_FFT_SIZE = 4096;
export const FILE_TRACE_LIMIT = 1500;
export const FILE_SPECTRUM_FLOOR_DB = -120;
const dbFS = amplitude => amplitude > 0 ? 20 * Math.log10(amplitude) : null;
const zeroLayers = () => Object.fromEntries(LAYER_KEYS.map(key => [key, 0]));
const datasetFields = () => [
  { key: 'time', label: '프레임 시작', unit: 's', method: '원본 PCM 홉 시작 / sampleRate', quality: 'measured' },
  { key: 'duration', label: '프레임 담당 시간', unit: 's', method: '중복되지 않는 실제 홉 샘플 수 / sampleRate', quality: 'measured' },
  { key: 'valid', label: '유효 음성', unit: '0/1', method: '기존 F0 검출 + 프로필 노이즈 게이트', quality: 'derived' },
  ...VOICE_METRIC_KEYS.map(key => ({ key, label: key,
    unit: key === 'f0' ? 'Hz' : key === 'clarity' ? '0–1' : key === 'level' ? 'dBFS' : 'dB',
    method: `기존 analyzeFrame ${key} · 유효 음성 프레임만${key === 'level' ? ' · 입력 보정 1회 적용' : ''}`, quality: 'derived' })),
  ...ANALYZER_FIELDS.map(field => ({ ...field })),
  ...LAYER_KEYS.map(key => ({ key: `response_${key}`, label: `${key} 보정 시각 반응`, unit: '0–1',
    method: '저장된 프로필의 보정 및 attack/release 적용 시각 반응. 무효/게이트 미달 프레임은 0. 실제 근육·생리 활동의 직접 측정 아님.',
    quality: 'visualization' })),
];

function summarizeDatasetColumn(values, column, width, rowCount) {
  const sorted = [];
  let mean = 0, m2 = 0;
  for (let row = 0; row < rowCount; row++) {
    const value = values[row * width + column];
    if (!Number.isFinite(value)) continue;
    sorted.push(value);
    const delta = value - mean;
    mean += delta / sorted.length; m2 += delta * (value - mean);
  }
  const count = sorted.length;
  if (!count) return { count: 0, mean: null, min: null, max: null, std: null, median: null, p10: null, p90: null };
  sorted.sort((a, b) => a - b);
  const quantile = fraction => {
    const index = fraction * (count - 1), lower = Math.floor(index), upper = Math.ceil(index);
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
  };
  return { count, mean, min: sorted[0], max: sorted[count - 1], std: Math.sqrt(Math.max(0, m2 / count)),
    median: quantile(.5), p10: quantile(.1), p90: quantile(.9) };
}

/**
 * Reusable radix-2 FFT with the Web Audio Blackman window and 1/N magnitude
 * normalization. No analyser temporal smoothing is applied offline.
 * https://webaudio.github.io/web-audio-api/#fft-windowing-and-smoothing-over-time
 * The returned spectrum is scratch storage; copy it if retaining a frame.
 */
export function createFileSpectrumAnalyzer(size = FILE_FFT_SIZE) {
  if (!Number.isInteger(size) || size < 32 || size > 32768 || (size & (size - 1))) {
    throw new TypeError('FFT 크기는 32–32768 범위의 2의 거듭제곱이어야 합니다.');
  }
  const real = new Float64Array(size), imaginary = new Float64Array(size);
  const window = new Float64Array(size), reversed = new Uint32Array(size);
  const cosines = new Float64Array(size / 2), sines = new Float64Array(size / 2);
  const spectrum = new Float32Array(size / 2);
  const bits = Math.log2(size);
  for (let i = 0; i < size; i++) {
    window[i] = .42 - .5 * Math.cos(2 * Math.PI * i / size) + .08 * Math.cos(4 * Math.PI * i / size);
    let value = i, reverse = 0;
    for (let bit = 0; bit < bits; bit++) { reverse = (reverse << 1) | (value & 1); value >>>= 1; }
    reversed[i] = reverse;
  }
  for (let i = 0; i < size / 2; i++) {
    cosines[i] = Math.cos(-2 * Math.PI * i / size);
    sines[i] = Math.sin(-2 * Math.PI * i / size);
  }
  return waveform => {
    if (!waveform || waveform.length !== size) throw new TypeError('FFT 입력 길이가 올바르지 않습니다.');
    imaginary.fill(0);
    for (let i = 0; i < size; i++) {
      const sample = waveform[i];
      if (!Number.isFinite(sample)) throw new TypeError('오디오에 유효하지 않은 샘플이 있습니다.');
      real[reversed[i]] = sample * window[i];
    }
    for (let length = 2; length <= size; length *= 2) {
      const half = length / 2, step = size / length;
      for (let start = 0; start < size; start += length) {
        for (let j = 0; j < half; j++) {
          const a = start + j, b = a + half, twiddle = j * step;
          const re = real[b] * cosines[twiddle] - imaginary[b] * sines[twiddle];
          const im = real[b] * sines[twiddle] + imaginary[b] * cosines[twiddle];
          real[b] = real[a] - re;
          imaginary[b] = imaginary[a] - im;
          real[a] += re;
          imaginary[a] += im;
        }
      }
    }
    for (let i = 0; i < spectrum.length; i++) {
      const magnitude = Math.hypot(real[i], imaginary[i]) / size;
      spectrum[i] = magnitude > 0 ? Math.max(FILE_SPECTRUM_FLOOR_DB, 20 * Math.log10(magnitude)) : FILE_SPECTRUM_FLOOR_DB;
    }
    return spectrum;
  };
}

/**
 * Analyze every hop of a decoded mono file without playback, a microphone,
 * wall-clock pacing, or a browser audio graph. Runs synchronously in a worker.
 *
 * Each disjoint hop owns its exact number of source samples for duration,
 * silence and time-weighted summaries. Its acoustic context is a centred
 * 4096-sample FFT window, zero-padded only at the file boundaries. Pitch/RMS
 * receive the real context samples, so boundary padding is never measured as
 * extra silence. Scalar voice metrics use the existing voiced/gated accumulator
 * over EVERY frame; only chart points are reduced into full-duration bins.
 *
 * Raw signal RMS/peak/clipping and the waveform envelope inspect every PCM
 * sample. Silence is hop RMS below the profile gate after input gain. A silent
 * signal's logarithmic RMS/peak is null (negative infinity is not JSON-safe).
 * Absent voice metrics and layers remain null. Spectrum bins have an explicit
 * -120 dB floor and are averaged in dB, weighted by each hop's real duration.
 */
export function analyzePcm({ pcm, sampleRate, profile = DEFAULT_PROFILE, profileId = null, onProgress } = {}) {
  if (!(pcm instanceof Float32Array) || !pcm.length) throw new TypeError('분석할 PCM 오디오 샘플이 없습니다.');
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 384000) {
    throw new TypeError('오디오 샘플레이트는 8000–384000 Hz 범위여야 합니다.');
  }
  const snapshot = sanitizeProfile(profile);
  const sampleCount = pcm.length, duration = sampleCount / sampleRate;
  const hopSize = Math.min(1024, Math.max(1, Math.round(sampleRate * .02)));
  const frameCount = Math.ceil(sampleCount / hopSize);
  const notify = typeof onProgress === 'function' ? onProgress : () => {};
  notify(0);

  // A whole-file envelope retains every sample's signed extrema, even if a
  // transient is shorter than an analysis hop or falls in the very last sample.
  const waveform = [], envelopeCount = Math.min(FILE_TRACE_LIMIT, sampleCount);
  const hopEnergy = new Float64Array(frameCount);
  let energy = 0, peak = 0, sampleSum = 0, clippedSamples = 0;
  for (let bin = 0; bin < envelopeCount; bin++) {
    const first = Math.floor(bin * sampleCount / envelopeCount);
    const end = Math.floor((bin + 1) * sampleCount / envelopeCount);
    let min = Infinity, max = -Infinity, binEnergy = 0;
    for (let i = first; i < end; i++) {
      const value = pcm[i];
      if (!Number.isFinite(value)) throw new TypeError(`오디오의 ${i + 1}번째 샘플이 유효하지 않습니다.`);
      const squared = value * value, absolute = Math.abs(value);
      binEnergy += squared;
      hopEnergy[Math.floor(i / hopSize)] += squared;
      sampleSum += value;
      min = Math.min(min, value); max = Math.max(max, value);
      peak = Math.max(peak, absolute);
      if (absolute >= 1) clippedSamples++;
    }
    energy += binEnergy;
    waveform.push({ t: (first + end) / (2 * sampleRate), start: first / sampleRate, end: end / sampleRate,
      min, max, rms: Math.sqrt(binEnergy / (end - first)) });
    if ((bin + 1) % 150 === 0) notify(.1 * (bin + 1) / envelopeCount);
  }

  const accumulator = createVoiceMetricsAccumulator({ profile: snapshot, profileId });
  const fields = datasetFields(), columns = fields.map(field => field.key);
  const columnCount = columns.length, datasetValues = new Float32Array(frameCount * columnCount);
  datasetValues.fill(NaN);
  const fft = createFileSpectrumAnalyzer(), window = new Float32Array(FILE_FFT_SIZE);
  const meanSpectrum = new Float64Array(FILE_FFT_SIZE / 2);
  const layerSums = zeroLayers(), layerPeaks = zeroLayers();
  const traceCount = Math.min(FILE_TRACE_LIMIT, frameCount), traces = [];
  const silenceThresholdDbFS = snapshot.global.noiseGateDb - snapshot.global.inputGainDb;
  const silenceThresholdEnergy = 10 ** (silenceThresholdDbFS / 10);
  let levels = {}, voicedSamples = 0, silenceSamples = 0, lastProgress = .1;
  notify(lastProgress);
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
    const start = frameIndex * hopSize, end = Math.min(sampleCount, start + hopSize), weight = end - start;
    const windowStart = start + Math.floor(weight / 2) - FILE_FFT_SIZE / 2;
    const realStart = Math.max(0, windowStart), realEnd = Math.min(sampleCount, windowStart + FILE_FFT_SIZE);
    window.fill(0);
    window.set(pcm.subarray(realStart, realEnd), realStart - windowStart);
    const spectrum = fft(window);
    const realWaveform = pcm.subarray(realStart, realEnd);
    const features = analyzeFrame(realWaveform, spectrum, sampleRate);
    const accepted = accumulator.add({ features });
    const extra = extractAnalyzerFeatures({ waveform: realWaveform, spectrum, sampleRate,
      features: { ...features, valid: accepted } });
    const row = frameIndex * columnCount;
    datasetValues[row] = start / sampleRate;
    datasetValues[row + 1] = weight / sampleRate;
    datasetValues[row + 2] = accepted ? 1 : 0;
    for (let index = 0; index < VOICE_METRIC_KEYS.length; index++) {
      const key = VOICE_METRIC_KEYS[index];
      const value = features[key] + (key === 'level' ? snapshot.global.inputGainDb : 0);
      if (accepted && Number.isFinite(value)) datasetValues[row + 3 + index] = value;
    }
    for (let index = 0; index < ANALYZER_FIELDS.length; index++) {
      const value = extra[ANALYZER_FIELDS[index].key];
      // A Float32 dataset must never turn an extreme finite input into infinity.
      if (Number.isFinite(value) && Number.isFinite(Math.fround(value))) {
        datasetValues[row + 3 + VOICE_METRIC_KEYS.length + index] = value;
      }
    }
    const mapped = processLayers(features, snapshot, levels, weight / sampleRate * 1000);
    levels = mapped.levels;
    for (let index = 0; index < LAYER_KEYS.length; index++) {
      datasetValues[row + 3 + VOICE_METRIC_KEYS.length + ANALYZER_FIELDS.length + index] = accepted ? levels[LAYER_KEYS[index]] : 0;
    }
    if (hopEnergy[frameIndex] / weight < silenceThresholdEnergy) silenceSamples += weight;
    if (accepted) {
      voicedSamples += weight;
      for (const key of LAYER_KEYS) {
        layerSums[key] += levels[key] * weight;
        layerPeaks[key] = Math.max(layerPeaks[key], levels[key]);
      }
    }
    for (let bin = 0; bin < spectrum.length; bin++) meanSpectrum[bin] += spectrum[bin] * weight;

    const bucket = Math.floor(frameIndex * traceCount / frameCount);
    let point = traces[bucket];
    if (!point) point = traces[bucket] = { start: start / sampleRate, end: end / sampleRate,
      samples: 0, voicedSamples: 0, pitchSum: 0, f0Min: Infinity, f0Max: -Infinity,
      levelSum: 0, levelSamples: 0, layerSums: zeroLayers() };
    point.end = end / sampleRate; point.samples += weight;
    if (features.rms > 0 && Number.isFinite(features.level)) {
      point.levelSum += (features.level + snapshot.global.inputGainDb) * weight;
      point.levelSamples += weight;
    }
    if (accepted) {
      point.voicedSamples += weight;
      point.pitchSum += features.f0 * weight;
      point.f0Min = Math.min(point.f0Min, features.f0); point.f0Max = Math.max(point.f0Max, features.f0);
      for (const key of LAYER_KEYS) point.layerSums[key] += levels[key] * weight;
    }
    const progress = .1 + .9 * (frameIndex + 1) / frameCount;
    if (progress - lastProgress >= .01 && frameIndex + 1 < frameCount) { notify(progress); lastProgress = progress; }
  }
  const voiceMetrics = accumulator.finalize();
  // Extend only the offline result. The shared live accumulator and its saved
  // version-1 schema keep their existing count/mean/min/max/std/median values.
  for (let index = 0; index < VOICE_METRIC_KEYS.length; index++) {
    const { p10, p90 } = summarizeDatasetColumn(datasetValues, 3 + index, columnCount, frameCount);
    Object.assign(voiceMetrics.metrics[VOICE_METRIC_KEYS[index]], { p10, p90 });
  }
  const levelStats = voiceMetrics.metrics.level;
  const dynamicRangeDb = Number.isFinite(levelStats.p10) && Number.isFinite(levelStats.p90)
    ? levelStats.p90 - levelStats.p10 : null;
  const additionalStats = Object.fromEntries(ANALYZER_FIELDS.map((field, index) => [field.key,
    summarizeDatasetColumn(datasetValues, 3 + VOICE_METRIC_KEYS.length + index, columnCount, frameCount)]));
  const pitchTrace = traces.map(point => ({ t: (point.start + point.end) / 2, start: point.start, end: point.end,
    f0: point.voicedSamples ? point.pitchSum / point.voicedSamples : null,
    f0Min: point.voicedSamples ? point.f0Min : null, f0Max: point.voicedSamples ? point.f0Max : null,
    valid: point.voicedSamples > 0, validFraction: point.voicedSamples / point.samples,
    level: point.levelSamples ? point.levelSum / point.levelSamples : null,
    levels: Object.fromEntries(LAYER_KEYS.map(key => [key, point.voicedSamples ? point.layerSums[key] / point.voicedSamples : null])) }));
  const fileLayers = Object.fromEntries(LAYER_KEYS.map(key => [key, {
    mean: voicedSamples ? layerSums[key] / voicedSamples : null,
    peak: voicedSamples ? layerPeaks[key] : null,
  }]));
  const rms = Math.sqrt(energy / sampleCount);
  const result = {
    version: FILE_ANALYSIS_VERSION, method: 'offline-full-file',
    sampleRate, sampleCount, duration, frameCount, windowSize: FILE_FFT_SIZE, hopSize,
    windowSeconds: FILE_FFT_SIZE / sampleRate, hopSeconds: hopSize / sampleRate,
    windowFunction: 'blackman', spectrumNormalization: '1/N', spectrumSmoothing: 0,
    spectrumAverage: 'duration-weighted-mean-dB', spectrumFloorDb: FILE_SPECTRUM_FLOOR_DB,
    frameLayout: 'hop-centred-zero-padded-boundaries', traceAggregation: 'duration-weighted-bins-with-pitch-extrema',
    voiceQuantileMethod: 'All finite voiced/gated Float32 dataset observations; linearly interpolated P10/P90.',
    dynamicRangeDb, dynamicRangeMethod: 'voiced-gated-level-P90-minus-P10-dBFS',
    voiceMetrics, voicedSeconds: voicedSamples / sampleRate, unvoicedSeconds: (sampleCount - voicedSamples) / sampleRate,
    signal: { rms, peak, rmsDbFS: dbFS(rms), peakDbFS: dbFS(peak), dcOffset: sampleSum / sampleCount,
      clippedSamples, clippedSeconds: clippedSamples / sampleRate, clippedFraction: clippedSamples / sampleCount,
      clippingThreshold: 1, silenceSeconds: silenceSamples / sampleRate, silenceRatio: silenceSamples / sampleCount,
      silenceThresholdDbFS, silenceMethod: 'disjoint-hop-rms-below-profile-gate' },
    waveform, pitchTrace, meanSpectrum: Array.from(meanSpectrum, value => value / sampleCount), fileLayers,
    additionalStats, analyzerFields: ANALYZER_FIELDS.map(field => ({ ...field })),
    dataset: { version: 1, format: 'float32-row-major', missing: 'NaN', columns, fields, columnCount,
      rowCount: frameCount, values: datasetValues, sampleRate, sampleCount, hopSize,
      timePrecision: 'Float32 seconds; exact sample offsets are row index × hopSize, bounded by sampleCount.',
      method: 'offline-full-file', analysisVersion: FILE_ANALYSIS_VERSION,
      statistics: 'Additional statistics use all finite Float32 dataset values; population SD, linearly interpolated P10/P50/P90.' },
  };
  notify(1);
  return result;
}
