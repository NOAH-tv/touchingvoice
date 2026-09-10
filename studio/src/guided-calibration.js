import { DEFAULT_PROFILE, LAYER_KEYS, clamp, percentile, sanitizeProfile } from './tuning.js';

/** Prompted acoustic calibration, not vowel recognition or anatomy assessment. */
export const GUIDED_PROTOCOL = 'tv-guided-four-layer-v1';
export const GUIDED_TASKS = Object.freeze([
  Object.freeze({ key: 'nas', name: '상인두', vowel: '에' }),
  Object.freeze({ key: 'oro', name: '중인두', vowel: '아' }),
  Object.freeze({ key: 'aes', name: '하인두', vowel: '으' }),
  Object.freeze({ key: 'src', name: '성문', vowel: '하' }),
]);

// These are versioned recording acceptance rules, never clinical thresholds.
export const GUIDED_QUALITY = Object.freeze({
  pitchToleranceCents: 75,
  minimumClarity: 0.7,
  minimumNoteCoverage: 0.55,
  minimumPitchAccuracy: 0.65,
  minimumMatchedCoverage: 0.4,
  minimumMatchedFrames: 5,
  maximumFrameGap: 0.1,
  minimumFeatureFrames: 30,
  minimumFeatureSpreadDb: 0.5,
});
const finite = Number.isFinite;
const rounded = (value, places = 4) => finite(value) ? Number(value.toFixed(places)) : null;
const hzToMidi = hz => 69 + 12 * Math.log2(hz / 440);
const midiToHz = midi => 440 * 2 ** ((midi - 69) / 12);
const integer = (value, fallback, low, high) => clamp(finite(Number(value)) ? Math.round(Number(value)) : fallback, low, high);
const emptyRange = values => values.length ? {
  minMidi: rounded(Math.min(...values)), maxMidi: rounded(Math.max(...values)),
  minHz: rounded(midiToHz(Math.min(...values)), 2), maxHz: rounded(midiToHz(Math.max(...values)), 2),
} : null;

/** Five-note ascent. Times are relative to the audio guide, in seconds. */
export function buildGuidedSequence(options = {}) {
  const input = options && typeof options === 'object' ? options : {};
  const rootMidi = integer(input.rootMidi, 60, 36, 76);
  const repeats = integer(input.repeats, 2, 1, 3);
  let transposeStep = integer(input.transposeStep, 1, -2, 2);
  // Keep every transposition within the live pitch detector's usable task range.
  if (repeats > 1) transposeStep = clamp(transposeStep,
    Math.ceil((36 - rootMidi) / (repeats - 1)), Math.floor((84 - 7 - rootMidi) / (repeats - 1)));
  const bpm = integer(input.bpm, 60, 50, 100);
  const countIn = finite(input.countIn) ? clamp(input.countIn, 0, 5) : 1;
  const beat = 60 / bpm;
  const settings = { rootMidi, bpm, repeats, transposeStep, countIn, pattern: 'five-ascending' };
  const notes = [];
  let cursor = countIn;
  for (let repeat = 0; repeat < repeats; repeat++) {
    for (const interval of [0, 2, 4, 5, 7]) {
      notes.push({ midi: rootMidi + repeat * transposeStep + interval, start: cursor,
        duration: beat, repeat, index: notes.length });
      cursor += beat;
    }
    if (repeat < repeats - 1) cursor += beat;
  }
  return { protocol: GUIDED_PROTOCOL, notes, duration: cursor, settings };
}

function checkedNotes(sequence) {
  if (!sequence || !Array.isArray(sequence.notes) || sequence.notes.length < 5 || sequence.notes.length > 15
      || sequence.notes.length % 5 !== 0 || !finite(sequence.duration)) throw new TypeError('5음 상행 과제가 필요합니다.');
  let end = 0;
  return sequence.notes.map((note, index) => {
    if (!note || !finite(note.start) || note.start < end - 0.000001 || !finite(note.duration)
        || note.duration < 0.5 || note.duration > 2 || !finite(note.midi) || note.midi < 33 || note.midi > 86)
      throw new TypeError('음정 또는 과제 시간이 올바르지 않습니다.');
    const root = sequence.notes[index - index % 5].midi;
    if (note.midi !== root + [0, 2, 4, 5, 7][index % 5]) throw new TypeError('과제는 5음 상행이어야 합니다.');
    end = note.start + note.duration;
    if (end > sequence.duration + 0.000001) throw new TypeError('과제 길이가 음정 일정과 다릅니다.');
    return note;
  });
}

function uniqueSamples(samples) {
  const ordered = samples.filter(sample => sample && finite(sample.time) && sample.time >= 0
    && sample.features && typeof sample.features === 'object').sort((a, b) => a.time - b.time);
  return ordered.filter((sample, index) => !index || sample.time !== ordered[index - 1].time);
}

/**
 * Evaluate one instructed syllable. A matching pitch is not evidence that the
 * instructed vowel was produced, or that a particular muscle was activated.
 * The caller must use headphones and supervise the prompt. Samples use the
 * guide clock, not microphone wall-clock timestamps. Octaves are never folded.
 */
export function evaluateGuidedTask({ layerKey, samples, sequence, profile = DEFAULT_PROFILE } = {}) {
  const task = GUIDED_TASKS.find(item => item.key === layerKey);
  if (!task) throw new TypeError('지원하지 않는 영역입니다.');
  if (!Array.isArray(samples)) throw new TypeError('측정 프레임이 필요합니다.');
  const targets = checkedNotes(sequence), current = sanitizeProfile(profile);
  const layer = current.layers[layerKey], rows = uniqueSamples(samples), rules = GUIDED_QUALITY;
  const warnings = [], usableValues = [], observed = [];
  let totalWindow = 0, totalVoice = 0, totalMatched = 0, totalClipped = 0;
  const notes = targets.map(target => {
    // Allow onset/release movement without accepting only one instantaneous hit.
    const start = target.start + Math.min(0.12, target.duration * 0.15);
    const end = target.start + target.duration - Math.min(0.06, target.duration * 0.08);
    const window = end - start;
    let voicedSeconds = 0, matchedSeconds = 0, clippedSeconds = 0, matchedFrames = 0;
    const matched = [];
    for (let i = 0; i < rows.length; i++) {
      const sample = rows[i];
      if (sample.time >= end) break;
      const next = rows[i + 1];
      const gap = next ? next.time - sample.time : (i ? sample.time - rows[i - 1].time : 0);
      const sampleEnd = sample.time + Math.min(rules.maximumFrameGap, Math.max(0, gap));
      const span = Math.min(end, sampleEnd) - Math.max(start, sample.time);
      if (span <= 0) continue;
      const f = sample.features, peak = finite(sample.peak) ? sample.peak : f.peak;
      const clipped = sample.clipped === true || f.clipped === true || (finite(peak) && peak >= 0.999);
      if (clipped) { clippedSeconds += span; continue; }
      const voice = f.valid === true && finite(f.level)
        && f.level + current.global.inputGainDb >= current.global.noiseGateDb
        && finite(f.f0) && f.f0 >= 55 && f.f0 <= 1200
        && finite(f.clarity) && f.clarity >= rules.minimumClarity;
      if (!voice) continue;
      voicedSeconds += span;
      const midi = hzToMidi(f.f0);
      if (Math.abs(midi - target.midi) * 100 > rules.pitchToleranceCents) continue;
      matchedSeconds += span; matchedFrames++;
      matched.push({ midi, value: finite(f[layer.feature])
        ? f[layer.feature] + (layer.feature === 'level' ? current.global.inputGainDb : 0) : NaN });
    }
    const coverage = voicedSeconds / window;
    const pitchAccuracy = voicedSeconds > 0 ? matchedSeconds / voicedSeconds : 0;
    const accepted = coverage >= rules.minimumNoteCoverage && pitchAccuracy >= rules.minimumPitchAccuracy
      && matchedSeconds / window >= rules.minimumMatchedCoverage && matchedFrames >= rules.minimumMatchedFrames
      && clippedSeconds === 0;
    if (accepted) {
      for (const entry of matched) if (finite(entry.value)) usableValues.push(entry.value);
      // Per-note medians prevent a single pitch outlier from defining the range.
      observed.push(percentile(matched.map(entry => entry.midi), 0.5));
    }
    totalWindow += window; totalVoice += voicedSeconds; totalMatched += matchedSeconds; totalClipped += clippedSeconds;
    return { targetMidi: target.midi, start: target.start, duration: target.duration,
      matchedFrames, coverage: rounded(coverage), pitchAccuracy: rounded(pitchAccuracy),
      matchedSeconds: rounded(matchedSeconds), medianMidi: rounded(percentile(matched.map(entry => entry.midi), 0.5)), accepted };
  });
  const completedNotes = notes.filter(note => note.accepted).length;
  if (completedNotes < notes.length) warnings.push(`${notes.length}개 음 중 ${completedNotes}개만 충분히 측정되었습니다. 편안한 시작음에서 다시 측정해 주세요.`);
  if (totalVoice / totalWindow < rules.minimumNoteCoverage) warnings.push('유효 음성이 짧거나 입력이 약합니다. 마이크와 무음 기준을 확인해 주세요.');
  if (totalClipped > 0) warnings.push('입력 과부하가 감지되었습니다. 마이크 입력을 낮춘 뒤 다시 측정해 주세요.');
  if (usableValues.length < rules.minimumFeatureFrames) warnings.push(`보정에 사용할 음향 프레임이 ${usableValues.length}개입니다. 지속해서 발성해 주세요.`);
  let featureRange = null;
  if (usableValues.length >= rules.minimumFeatureFrames) {
    const low = percentile(usableValues, 0.1), high = percentile(usableValues, 0.9);
    const inputMin = rounded(clamp(low, -120, 120), 2), inputMax = rounded(clamp(high, -120, 120), 2);
    if (high - low < rules.minimumFeatureSpreadDb || inputMax - inputMin < rules.minimumFeatureSpreadDb)
      warnings.push('음향 반응의 변화 폭이 작아 감도를 자동 설정할 수 없습니다. 동일한 과제를 다시 확인하거나 수동 튜닝해 주세요.');
    else featureRange = { feature: layer.feature, inputMin, inputMax, count: usableValues.length };
  }
  const accepted = completedNotes === notes.length && totalClipped === 0 && featureRange !== null;
  return { version: 1, protocol: GUIDED_PROTOCOL, layerKey, vowel: task.vowel, accepted, warnings,
    notes, completedNotes, coverage: rounded(totalVoice / totalWindow),
    pitchAccuracy: rounded(totalVoice > 0 ? totalMatched / totalVoice : 0),
    testedRange: emptyRange(observed), featureRange, settings: { ...sequence.settings },
    qualityRules: { ...rules }, sourceProfile: current,
    interpretation: '지정 발음 과제의 음향 반응과 관측 음역입니다. 발음 자동 인식·기관 활성·근육 발달·압력을 측정한 값이 아닙니다.' };
}

/** All four completed tasks are required. Apply only after instructor review. */
export function suggestGuidedCalibration(results, profile = DEFAULT_PROFILE) {
  if (!Array.isArray(results)) throw new TypeError('영역별 측정 결과가 필요합니다.');
  const current = sanitizeProfile(profile), warnings = [];
  const byKey = new Map();
  for (const result of results) {
    if (!result || !LAYER_KEYS.includes(result.layerKey) || byKey.has(result.layerKey)) {
      warnings.push('영역별 결과가 중복되었거나 올바르지 않습니다.'); continue;
    }
    byKey.set(result.layerKey, result);
  }
  for (const key of LAYER_KEYS) {
    const result = byKey.get(key), task = GUIDED_TASKS.find(item => item.key === key);
    if (!result || result.protocol !== GUIDED_PROTOCOL || result.version !== 1 || !result.accepted) {
      warnings.push(`${task.name} ‘${task.vowel}’ 과제를 완료해 주세요.`); continue;
    }
    const range = result.featureRange;
    if (!range || range.feature !== current.layers[key].feature || !finite(range.inputMin) || !finite(range.inputMax)
        || range.inputMax - range.inputMin < GUIDED_QUALITY.minimumFeatureSpreadDb
        || range.inputMin < -120 || range.inputMax > 120 || range.count < GUIDED_QUALITY.minimumFeatureFrames) {
      warnings.push(`${task.name} 음향 특징 또는 보정 범위가 변경되었습니다. 다시 측정해 주세요.`);
    }
    if (JSON.stringify(result.sourceProfile?.global) !== JSON.stringify(current.global))
      warnings.push(`${task.name} 측정 이후 입력 보정이 변경되었습니다. 동일한 입력 설정에서 다시 측정해 주세요.`);
  }
  if (warnings.length) return { usable: false, profile: null, warnings, testedRange: null, protocol: GUIDED_PROTOCOL };
  const proposed = sanitizeProfile(current);
  const ranges = [];
  for (const key of LAYER_KEYS) {
    const result = byKey.get(key);
    proposed.layers[key].inputMin = result.featureRange.inputMin;
    proposed.layers[key].inputMax = result.featureRange.inputMax;
    if (result.testedRange) ranges.push(result.testedRange.minMidi, result.testedRange.maxMidi);
  }
  return { usable: true, profile: sanitizeProfile(proposed), warnings: [], testedRange: emptyRange(ranges),
    protocol: GUIDED_PROTOCOL, counts: Object.fromEntries(LAYER_KEYS.map(key => [key, byKey.get(key).featureRange.count])) };
}
