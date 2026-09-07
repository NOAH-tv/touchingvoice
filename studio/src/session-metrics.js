import { DEFAULT_PROFILE, LAYER_KEYS, sanitizeProfile, clamp } from './tuning.js';

/** Guided observation, not an assessment of vocal health or muscle strength. */
export const CORE_MODES = Object.freeze({
  measurement: Object.freeze({
    duration: 10,
    name: '10초 발성 체크',
    stages: Object.freeze([
      Object.freeze({ label: '내 목소리 확인', instruction: '편한 높이로 짧게 아— 소리를 내세요. 숨은 자연스럽게 쉬어도 좋아요.', duration: 10 }),
    ]),
  }),
  training: Object.freeze({
    duration: 60,
    name: '60초 편안한 발성',
    stages: Object.freeze([
      Object.freeze({ label: '가볍게 준비', instruction: '편한 높이에서 짧게 아—. 자연스럽게 쉬면서 목소리를 시작하세요.', duration: 15 }),
      Object.freeze({ label: '내 반응 살펴보기', instruction: '짧게 소리 내고 쉬기를 반복하며 네 층위의 변화를 살펴보세요.', duration: 30 }),
      Object.freeze({ label: '편안하게 마무리', instruction: '편한 소리로 한 번 더 확인하세요. 숨은 자연스럽게, 끝나면 쉬어 주세요.', duration: 15 }),
    ]),
  }),
});

const finite = value => typeof value === 'number' && Number.isFinite(value);
const zeroLevels = () => Object.fromEntries(LAYER_KEYS.map(key => [key, 0]));
const rounded = value => Math.round(value * 1000) / 1000;
function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Call add once per AudioEngine frame, NEVER once per rendering frame.
 * frame.time is the engine's source timestamp in seconds, normalized to the
 * first received frame. Backwards/invalid timestamps cannot create duration.
 * Valid duration counts adjacent voiced observations, capped at 200 ms/gap.
 * layer means/peaks summarize valid frames only; they are visual response
 * values (0..1), not physiological measurements. trace is <=10 Hz / 1800 rows.
 */
export function createSessionAccumulator({ kind = 'measurement', profile = DEFAULT_PROFILE, source = 'mic' } = {}) {
  if (!Object.hasOwn(CORE_MODES, kind) && kind !== 'free') throw new TypeError('지원하지 않는 세션 종류입니다.');
  const frozenProfile = sanitizeProfile(profile);
  let totalFrameCount = 0, validFrameCount = 0, validSeconds = 0;
  let firstTime = null, latestTime = null, previousValid = false, lastTraceBucket = -1;
  const sums = zeroLevels(), peaks = zeroLevels(), pitches = [], trace = [];

  function add(frame, inputLevels = {}) {
    const features = frame?.features || {};
    totalFrameCount++;
    const valid = features.valid === true && finite(features.level)
      && features.level + frozenProfile.global.inputGainDb >= frozenProfile.global.noiseGateDb;
    const time = finite(frame?.time) ? frame.time : null;
    let delta = 0, elapsed = null;
    if (time !== null) {
      if (firstTime === null) firstTime = time;
      if (latestTime !== null) delta = clamp(time - latestTime, 0, 0.2);
      latestTime = latestTime === null ? time : Math.max(latestTime, time);
      elapsed = Math.max(0, time - firstTime);
    }
    const levels = zeroLevels();
    for (const key of LAYER_KEYS) {
      if (valid && frozenProfile.layers[key].enabled && finite(inputLevels?.[key])) levels[key] = clamp(inputLevels[key], 0, 1);
    }
    const f0 = valid && finite(features.f0) && features.f0 > 0 ? features.f0 : null;
    if (valid) {
      validFrameCount++;
      if (previousValid) validSeconds += delta;
      for (const key of LAYER_KEYS) { sums[key] += levels[key]; peaks[key] = Math.max(peaks[key], levels[key]); }
      if (f0 !== null) pitches.push(f0);
    }
    previousValid = valid && time !== null;
    if (elapsed !== null && trace.length < 1800) {
      const bucket = Math.floor(elapsed * 10 + 1e-7);
      if (bucket > lastTraceBucket) {
        trace.push({ t: rounded(elapsed), f0, valid, levels });
        lastTraceBucket = bucket;
      }
    }
    return valid;
  }

  function finalize({ elapsed, completed = false } = {}) {
    const measured = firstTime === null || latestTime === null ? 0 : Math.max(0, latestTime - firstTime);
    const duration = finite(elapsed) ? Math.max(0, elapsed) : measured;
    const layers = Object.fromEntries(LAYER_KEYS.map(key => [key, {
      mean: validFrameCount ? rounded(sums[key] / validFrameCount) : null,
      peak: validFrameCount ? rounded(peaks[key]) : null,
    }]));
    return {
      kind, source, completed: completed === true, elapsed: rounded(duration),
      validSeconds: rounded(Math.min(duration, validSeconds)), validFrameCount, totalFrameCount,
      pitch: { min: pitches.length ? Math.min(...pitches) : null,
        max: pitches.length ? Math.max(...pitches) : null, median: median(pitches) },
      layers,
      trace: trace.map(point => ({ ...point, levels: { ...point.levels } })),
    };
  }
  return { add, finalize };
}

/** Today's local calendar day and six preceding days. Counts real guided
 * measurement/training records with observed voice; duration is actual elapsed
 * seconds (including natural rests), not planned duration. Partial sessions
 * count as activity, without being promoted to completed sessions or streaks.
 * Expected parent envelope: {createdAt: ISO timestamp, report: accumulatorReport}.
 */
export function summarizeWeek(sessions, now = new Date()) {
  const current = new Date(now);
  if (!Number.isFinite(current.getTime()) || !Array.isArray(sessions)) return { days: 0, seconds: 0, count: 0 };
  const end = new Date(current); end.setHours(0, 0, 0, 0); end.setDate(end.getDate() + 1);
  const start = new Date(end); start.setDate(start.getDate() - 7);
  const activeDays = new Set();
  let seconds = 0, count = 0;
  for (const session of sessions) {
    const report = session?.report;
    const date = new Date(session?.createdAt);
    if (!Number.isFinite(date.getTime()) || date < start || date >= end || date > current) continue;
    if (!report || !Object.hasOwn(CORE_MODES, report.kind) || !finite(report.elapsed) || report.elapsed <= 0
      || !finite(report.validSeconds) || report.validSeconds <= 0 || !finite(report.validFrameCount) || report.validFrameCount <= 0) continue;
    activeDays.add(`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`);
    seconds += report.elapsed;
    count++;
  }
  return { days: activeDays.size, seconds: rounded(seconds), count };
}
