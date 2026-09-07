import { DEFAULT_PROFILE, sanitizeProfile } from './tuning.js';

export const VOICE_METRIC_KEYS = Object.freeze([
  'f0', 'level', 'clarity', 'brilliance', 'f1dom', 'aesprom',
  'negh1h2', 'ring3k', 'lowmid', 'tilt',
]);
const STAT_KEYS = ['count', 'mean', 'min', 'max', 'std', 'median'];
const finite = value => typeof value === 'number' && Number.isFinite(value);
const nullable = value => finite(value) ? value : null;
const emptyStats = () => ({ count: 0, mean: null, min: null, max: null, std: null, median: null });
const configOf = profile => ({ global: { ...profile.global }, layers: Object.fromEntries(Object.entries(profile.layers).map(([key, layer]) => [key, { ...layer }])) });

/**
 * Scalar summaries of actual voiced/gated AudioEngine frames. Add each audio
 * frame once (not each animation frame). Level is gain-adjusted digital dBFS,
 * never calibrated SPL. Relative spectral features receive no extra gain.
 * std is population standard deviation (ddof=0). Median is exact over retained
 * scalar values; this module stores no waveforms and computes no clinical score.
 */
export function createVoiceMetricsAccumulator({ profile = DEFAULT_PROFILE, profileId = null } = {}) {
  const snapshot = sanitizeProfile(profile);
  const identity = typeof profileId === 'string' && profileId.trim() ? profileId : null;
  let totalFrameCount = 0, validFrameCount = 0;
  const columns = Object.fromEntries(VOICE_METRIC_KEYS.map(key => [key, { count: 0, mean: 0, m2: 0, min: Infinity, max: -Infinity, values: [] }]));
  function add(frame) {
    totalFrameCount++;
    const features = frame?.features || {};
    if (features.valid !== true || !finite(features.level)
      || features.level + snapshot.global.inputGainDb < snapshot.global.noiseGateDb) return false;
    validFrameCount++;
    for (const key of VOICE_METRIC_KEYS) {
      let value = features[key];
      if (!finite(value) || (key === 'f0' && value <= 0) || (key === 'clarity' && (value < 0 || value > 1))) continue;
      if (key === 'level') value += snapshot.global.inputGainDb;
      if (!finite(value)) continue;
      const column = columns[key];
      column.count++;
      const delta = value - column.mean;
      column.mean += delta / column.count;
      column.m2 += delta * (value - column.mean);
      column.min = Math.min(column.min, value);
      column.max = Math.max(column.max, value);
      column.values.push(value);
    }
    return true;
  }
  function finalize() {
    const metrics = {};
    for (const key of VOICE_METRIC_KEYS) {
      const column = columns[key];
      if (!column.count) { metrics[key] = emptyStats(); continue; }
      const sorted = [...column.values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 ? sorted[mid] : sorted[mid - 1] / 2 + sorted[mid] / 2;
      metrics[key] = { count: column.count, mean: nullable(column.mean), min: nullable(column.min), max: nullable(column.max),
        std: nullable(Math.sqrt(Math.max(0, column.m2 / column.count))), median: nullable(median) };
    }
    return { version: 1, profileId: identity, profileConfig: configOf(snapshot),
      totalFrameCount, validFrameCount, metrics };
  }
  return { add, finalize };
}

function unwrap(value) {
  const report = value?.voiceMetrics || (value?.metrics ? value : null);
  const profileId = value?.profileId ?? report?.profileId ?? null;
  const inputConfig = value?.profile || report?.profileConfig || report?.profile;
  let profileConfig = null;
  if (inputConfig && typeof inputConfig === 'object' && inputConfig.global && inputConfig.layers) {
    try { profileConfig = configOf(sanitizeProfile(inputConfig)); } catch { /* A malformed old record is not comparable. */ }
  }
  return { report: report?.version === 1 ? report : null,
    profileId: typeof profileId === 'string' && profileId.trim() ? profileId : null, profileConfig };
}

/**
 * Accepts either session envelopes ({profileId, profile, voiceMetrics}) or raw
 * reports returned by finalize(). Comparable means same identified person and
 * identical saved calibration settings, NOT proof of matching microphones,
 * rooms, vowels or tasks. Deltas are always after minus before, without any
 * good/bad/health inference. Missing or non-finite statistics produce null.
 */
export function compareVoiceReports(before, after) {
  const a = unwrap(before), b = unwrap(after), reasons = [];
  if (!a.report || !b.report) reasons.push('양쪽 기록에 지원하는 음향 분석 결과가 필요합니다.');
  if (!a.profileId || !b.profileId) reasons.push('사용자 식별 정보가 없어 같은 사용자인지 확인할 수 없습니다.');
  else if (a.profileId !== b.profileId) reasons.push('서로 다른 사용자의 기록입니다.');
  if (!a.profileConfig || !b.profileConfig) reasons.push('녹음 당시 보정 설정이 없어 조건을 확인할 수 없습니다.');
  else if (JSON.stringify(a.profileConfig) !== JSON.stringify(b.profileConfig)) reasons.push('녹음 당시 보정 설정이 다릅니다.');
  if ((a.report?.analysisMethod||'realtime-v1') !== (b.report?.analysisMethod||'realtime-v1')) reasons.push('분석 방법 또는 버전이 다릅니다. 양쪽 원음을 전체 분석한 뒤 비교하세요.');
  const deltas = {};
  let sharedMetricCount = 0;
  for (const key of VOICE_METRIC_KEYS) {
    const beforeStats = a.report?.metrics?.[key], afterStats = b.report?.metrics?.[key];
    if (finite(beforeStats?.mean) && finite(afterStats?.mean) && beforeStats.count > 0 && afterStats.count > 0) sharedMetricCount++;
    deltas[key] = Object.fromEntries(STAT_KEYS.map(stat => {
      const av = beforeStats?.[stat], bv = afterStats?.[stat];
      // A zero frame count is valid metadata, but not a measured acoustic value.
      const hasSamples = stat === 'count' || (beforeStats?.count > 0 && afterStats?.count > 0);
      return [stat, hasSamples && finite(av) && finite(bv) ? nullable(bv - av) : null];
    }));
  }
  if (a.report && b.report && sharedMetricCount === 0) reasons.push('양쪽에서 함께 측정된 유효 음향 지표가 없습니다.');
  return { comparable: reasons.length === 0, reasons, reason: reasons.join(' '), deltas };
}
