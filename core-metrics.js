/** Shared presentation summary. Retains no recordings and changes no source data.
 * The twelve displayed values do not reduce the complete analysis archive.
 */
const finite = value => typeof value === 'number' && Number.isFinite(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const count = value => finite(value) && Number.isInteger(value) && value >= 0 ? value : null;
const nonnegative = value => finite(value) && value >= 0 ? value : null;
const positive = value => finite(value) && value > 0 ? value : null;
const fraction = value => finite(value) && value >= 0 && value <= 1 ? value : null;
const string = (value, fallback = '', max = 160) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : fallback;
const firstNumber = (...values) => values.find(finite) ?? null;
const firstObject = (...values) => values.find(value => value && typeof value === 'object' && !Array.isArray(value)) || {};
function invalidCount(stats) {
  return Object.hasOwn(stats, 'count') && (stats.count === 0 || count(stats.count) === null);
}
function statistic(stats, key, fallback = null) {
  const input = object(stats);
  if (invalidCount(input)) return null;
  return firstNumber(input[key], fallback);
}
function captureSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const output = {};
  const numeric = ['containerBits','outputSampleRate','contextSampleRate','deviceSampleRate','deviceReportedSampleSize','adcBitDepth','channelCount','frameCount','captureStartContextSeconds','trainingStartOffsetSeconds','sampleRate','sampleSize','latency','sourceSampleRate'];
  const booleans = ['resampled','monitorEffectsRecorded','derivedClip','echoCancellation','noiseSuppression','autoGainControl'];
  for (const key of numeric) if (finite(value[key]) || value[key] === null) output[key] = value[key];
  for (const key of booleans) if (typeof value[key] === 'boolean') output[key] = value[key];
  for (const key of ['format','inputChannelPolicy','stopReason']) if (typeof value[key] === 'string') output[key] = string(value[key], '', 80);
  for (const key of ['deviceSettings','processingRequested']) if (value[key] && typeof value[key] === 'object') {
    output[key] = {};
    for (const field of ['sampleRate','sampleSize','channelCount','latency']) if (finite(value[key][field])) output[key][field] = value[key][field];
    for (const field of ['echoCancellation','noiseSuppression','autoGainControl']) if (typeof value[key][field] === 'boolean') output[key][field] = value[key][field];
  }
  return output;
}
function referenceFormants(entry, metadata) {
  const reference = firstObject(metadata.research?.referenceFormants, entry.research?.referenceFormants, entry.examination?.research?.referenceFormants);
  const method = string(reference.method, 'not_extracted');
  const pending = !method.trim() || /^(not_extracted|pending|unknown|not_available|none)$/i.test(method.trim())
    || /spectral[ _-]*peak|fixed[ _-]*band|proxy/i.test(method);
  const result = { method: pending ? 'not_extracted' : method };
  // F1-F7 in additionalStats are fixed-band spectral peaks. They are never used
  // as a fallback for a reference tool's actual formants and bandwidths.
  for (const key of ['F1','F2','F3','B1','B2','B3']) result[key] = pending ? null : positive(reference[key]);
  return result;
}

/** Local session ({fileAnalysis}) or server exam ({metrics, metadata}) -> twelve
 * nullable numbers, consistent units and acquisition quality. No zero-coercion,
 * clinical grading, vowel classification or inferred missing pitch coverage.
 */
export function coreMetricSummary(value) {
  const entry = object(value), metadata = object(entry.metadata);
  const report = firstObject(entry.fileAnalysis, entry.metrics, entry.voiceMetrics ? entry : null);
  const voice = object(report.voiceMetrics), metrics = object(voice.metrics), extra = object(report.additionalStats);
  const f0 = object(metrics.f0), level = object(metrics.level), signal = object(report.signal);
  const validFrames = count(voice.validFrameCount), totalFrames = count(firstNumber(report.frameCount, voice.totalFrameCount));
  const voicedSeconds = nonnegative(report.voicedSeconds), durationSeconds = nonnegative(firstNumber(report.duration, entry.duration, metadata.duration));
  const noVoice = validFrames === 0 || voicedSeconds === 0 || count(f0.count) === 0;
  const hasVoice = !noVoice && (validFrames > 0 || voicedSeconds > 0 || count(f0.count) > 0);
  const typed = (v, validator = firstNumber) => noVoice ? null : validator(v);
  const median = typed(statistic(f0, 'median', report.f0), positive);
  let minimum = typed(statistic(f0, 'min'), positive), maximum = typed(statistic(f0, 'max'), positive);
  if (minimum !== null && maximum !== null && maximum < minimum) { minimum = null; maximum = null; }
  const p10 = statistic(level, 'p10'), p90 = statistic(level, 'p90');
  const derivedRange = finite(p10) && finite(p90) && p90 >= p10 ? p90 - p10 : null;
  const dynamicRange = !invalidCount(level) ? typed(firstNumber(report.dynamicRangeDb, derivedRange), nonnegative) : null;
  const definitions = [
    ['f0_median','기본 주파수 중앙값','Hz',1,median,'pitch',true],
    ['f0_std','음높이 변동 · 과제 영향','Hz',1,typed(statistic(f0, 'std'), nonnegative),'pitch',true],
    ['f0_min','관측 최저 음높이','Hz',1,minimum,'pitch',true],
    ['f0_max','관측 최고 음높이','Hz',1,maximum,'pitch',true],
    ['level_median','입력 레벨 중앙값','dBFS',1,typed(statistic(level, 'median')),'level',false],
    ['dynamic_range','입력 레벨 변화 폭','dB',1,dynamicRange,'level',false],
    ['cpp_median','CPP 추정 중앙값','dB',2,typed(statistic(extra.CPP, 'median')),'voice_quality',true],
    ['hnr_median','HNR 추정 중앙값','dB',2,typed(statistic(extra.HNR, 'median', report.hnr)),'voice_quality',true],
    ...[['nas','상인두'],['oro','중인두'],['aes','하인두'],['src','성문']].map(([key,label]) => {
      const layer = object(report.fileLayers?.[key]);
      const mean = invalidCount(layer) ? null : fraction(layer.mean);
      return [`${key}_mean`,`${label} 평균 화면 반응`,'%',1,hasVoice && mean !== null ? mean * 100 : null,'visual_response',false];
    }),
  ];
  const items = definitions.map(([key,label,unit,precision,value,kind,estimated]) => ({ key,label,unit,precision,value,kind,estimated }));
  const hasReport = Object.keys(report).length > 0;
  const phase = ['queued','decoding','analyzing','saving'].includes(entry.analysisStatus) ? 'pending'
    : entry.analysisStatus === 'error' ? 'error' : entry.analysisStatus === 'cancelled' ? 'cancelled' : hasReport ? 'complete' : 'unavailable';
  const method = string(report.method || voice.analysisMethod || (voice.version === 1 ? 'realtime-v1' : null), 'unknown');
  const quality = {
    phase, noVoice, hasVoice, validFrames, totalFrames, voicedSeconds, durationSeconds,
    voicedFraction: durationSeconds > 0 && voicedSeconds !== null && voicedSeconds <= durationSeconds ? voicedSeconds / durationSeconds : null,
    validFrameFraction: totalFrames > 0 && validFrames !== null && validFrames <= totalFrames ? validFrames / totalFrames : null,
    clippedFraction: fraction(signal.clippedFraction), clippedSamples: count(signal.clippedSamples),
    silenceFraction: fraction(signal.silenceRatio), method,
    analysisVersion: finite(report.analysisVersion) ? report.analysisVersion : finite(metadata.analysisVersion) ? metadata.analysisVersion : finite(report.version) ? report.version : null,
    capture: captureSnapshot(entry.captureSettings || metadata.captureSettings), formants: referenceFormants(entry, metadata),
  };
  return { items, byKey: Object.fromEntries(items.map(item => [item.key,item])), quality,
    sourceKind: string(entry.sourceKind || metadata.sourceKind, 'unknown', 80) };
}
