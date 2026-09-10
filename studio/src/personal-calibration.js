/** Personal, pitch-specific acoustic response. No anatomical inference or ML classifier. */
export const PERSONAL_MODEL_VERSION = 1;
export const PERSONAL_LAYERS = Object.freeze(['nas', 'oro', 'aes', 'src']);
export const PERSONAL_FEATURES = Object.freeze(['brilliance', 'f1dom', 'aesprom', 'negh1h2', 'ring3k', 'lowmid', 'tilt', 'level']);
export const PERSONAL_QUALITY = Object.freeze({ minimumClarity: 0.7, minimumFramesPerBin: 8,
  minimumSecondsPerBin: 0.24, minimumFrames: 30, maximumFrameGap: 0.1,
  maximumPitchSpan: 0.45, maximumGlideSemitonesPerSecond: 0.5, minimumSpreadDb: 0.5 });
const MAX_RECORDS = 512, MAX_RECENT = 12, HALF_LIFE_DAYS = 180;
const finite = Number.isFinite;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const plain = v => !!v && typeof v === 'object' && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const fail = message => { throw new TypeError(message); };
const round = v => Number(v.toFixed(5));
function q(values, fraction) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b), pos = fraction * (sorted.length - 1);
  return sorted[Math.floor(pos)] + (sorted[Math.ceil(pos)] - sorted[Math.floor(pos)]) * (pos % 1);
}
function text(value, label, max = 128) {
  if (typeof value !== 'string' || !value.length || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) fail(`${label} 형식이 올바르지 않습니다.`);
  return value;
}
function num(value, low, high, label, integer = false) {
  if (!finite(value) || value < low || value > high || (integer && !Number.isInteger(value))) fail(`${label} 범위가 올바르지 않습니다.`);
  return value;
}
function date(value) {
  if (typeof value !== 'string' || value.length > 40 || !finite(Date.parse(value))) fail('측정 시각이 올바르지 않습니다.');
  return new Date(value).toISOString();
}
function compatibility(profile) {
  if (!plain(profile) || !plain(profile.global) || !plain(profile.layers)) fail('측정 프로필이 필요합니다.');
  const result = { noiseGateDb: num(profile.global.noiseGateDb, -96, -6, '무음 기준'),
    inputGainDb: num(profile.global.inputGainDb, -24, 24, '입력 보정'), features: {} };
  for (const key of PERSONAL_LAYERS) {
    const feature = profile.layers[key]?.feature;
    if (!PERSONAL_FEATURES.includes(feature)) fail('지원하지 않는 음향 특징입니다.');
    result.features[key] = feature;
  }
  return result;
}
function checkedCompatibility(input) {
  if (!plain(input) || !plain(input.features)) fail('측정 조건이 올바르지 않습니다.');
  return compatibility({ global: input, layers: Object.fromEntries(PERSONAL_LAYERS.map(key => [key, { feature: input.features[key] }])) });
}
function compatible(a, b, key) {
  return a?.noiseGateDb === b?.noiseGateDb && a?.inputGainDb === b?.inputGainDb && a?.features?.[key] === b?.features?.[key];
}
function fingerprint(value) {
  // Deterministic content identifier only, not a security or authentication hash.
  let h = 2166136261;
  for (const c of JSON.stringify(value)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
function checkedStats(input) {
  if (!plain(input)) fail('음향 통계 형식이 올바르지 않습니다.');
  const output = {};
  for (const feature of PERSONAL_FEATURES) {
    if (!Object.hasOwn(input, feature)) continue;
    const item = input[feature];
    if (!plain(item)) fail('음향 통계 항목이 올바르지 않습니다.');
    const p10 = num(item.p10, -120, 120, 'P10'), p50 = num(item.p50, -120, 120, '중앙값'), p90 = num(item.p90, -120, 120, 'P90');
    if (p10 > p50 || p50 > p90) fail('음향 분위수의 순서가 올바르지 않습니다.');
    output[feature] = { p10, p50, p90 };
  }
  if (!Object.keys(output).length) fail('음향 통계가 비어 있습니다.');
  return output;
}
function checkedSource(input) {
  if (!plain(input) || !PERSONAL_LAYERS.includes(input.layerKey)) fail('측정 영역이 올바르지 않습니다.');
  const sourceHash = text(input.sourceHash, '음원 식별값');
  if (!/^[A-Za-z0-9_.:-]+$/.test(sourceHash)) fail('음원 식별값이 올바르지 않습니다.');
  return { id: text(input.id, '측정 번호'), layerKey: input.layerKey, sourceHash,
    sourceKind: text(input.sourceKind || 'file', '입력 종류', 32), createdAt: date(input.createdAt) };
}
function checkedObservation(input) {
  if (input?.version !== 1) fail('지원하지 않는 측정 기록입니다.');
  const result = { ...checkedSource(input), compatibility: checkedCompatibility(input.compatibility), confirmed: input.confirmed === true, usable: input.usable === true, bins: [] };
  if (!Array.isArray(input.bins) || input.bins.length > 49) fail('관측 음정 수가 올바르지 않습니다.');
  const seen = new Set();
  for (const bin of input.bins) {
    if (!plain(bin)) fail('관측 음정 형식이 올바르지 않습니다.');
    const midi = num(bin.midi, 36, 84, '관측 음정', true);
    if (seen.has(midi)) fail('관측 음정이 중복되었습니다.');
    seen.add(midi);
    result.bins.push({ midi, frames: num(bin.frames, 8, 1000000, '유효 프레임', true),
      seconds: num(bin.seconds, 0.24, 36000, '유효 시간'), stats: checkedStats(bin.stats) });
  }
  if (result.usable && result.bins.reduce((sum, bin) => sum + bin.frames, 0) < PERSONAL_QUALITY.minimumFrames) fail('안정적인 측정 프레임이 부족합니다.');
  return result;
}

/**
 * Accepts flattened frames or {time, features}. With missing timestamps the
 * declared frameIntervalSeconds (default 1/30s) is recorded as an assumption.
 * Stable, voiced runs only: pauses, clipped input, glides and pitch transients
 * do not fill unknown semitones. "confirmed" is instructor confirmation of
 * the prompted sound, not automatic vowel recognition.
 */
export function buildCalibrationObservation({ id, layerKey, createdAt = new Date().toISOString(), sourceHash,
  sourceKind = 'file', features, profile, confirmed = false, frameIntervalSeconds = 1 / 30 } = {}) {
  const source = checkedSource({ id, layerKey, createdAt, sourceHash, sourceKind });
  const conditions = compatibility(profile), rules = PERSONAL_QUALITY;
  if (!Array.isArray(features) || features.length > 1000000) fail('측정 프레임 배열이 필요합니다.');
  num(frameIntervalSeconds, 0.001, 0.1, '프레임 간격');
  const feature = conditions.features[layerKey];
  let assumedTiming = false;
  const rows = features.map((sample, index) => {
    const f = sample?.features || sample || {};
    const explicitTime = sample?.time ?? f.time;
    const time = finite(explicitTime) && explicitTime >= 0 ? explicitTime : (assumedTiming = true, index * frameIntervalSeconds);
    const midi = finite(f.f0) && f.f0 > 0 ? 69 + 12 * Math.log2(f.f0 / 440) : NaN;
    const bin = Math.round(midi);
    const valid = f.valid === true && finite(f.clarity) && f.clarity >= rules.minimumClarity
      && finite(f.level) && f.level + conditions.inputGainDb >= conditions.noiseGateDb
      && f.clipped !== true && sample?.clipped !== true
      && !(finite(f.peak ?? sample?.peak) && (f.peak ?? sample.peak) >= 0.999)
      && finite(midi) && bin >= 36 && bin <= 84 && finite(f[feature]) && Math.abs(f[feature]) <= 120;
    return { f, time, midi, bin, valid };
  }).sort((a, b) => a.time - b.time).filter((row, index, ordered) => !index || row.time !== ordered[index - 1].time);
  const runs = []; let run = [];
  for (const row of rows) {
    const last = run.at(-1);
    if (!row.valid || (last && (row.bin !== last.bin || row.time - last.time > rules.maximumFrameGap
      || Math.abs(row.midi - last.midi) > 0.4 || Math.abs(row.f.level - last.f.level) > 8))) {
      if (run.length) runs.push(run);
      run = [];
    }
    if (row.valid) run.push(row);
  }
  if (run.length) runs.push(run);
  const byMidi = new Map(); let stableFrames = 0;
  for (const segment of runs) {
    // Remove onset/offset transitions; continuity alone must not accept a glide.
    const trimmed = segment.filter(row => row.time - segment[0].time >= 0.055 && segment.at(-1).time - row.time >= 0.055);
    if (trimmed.length < rules.minimumFramesPerBin) continue;
    const pitches = trimmed.map(row => row.midi);
    if (q(pitches, 0.9) - q(pitches, 0.1) > rules.maximumPitchSpan) continue;
    const meanTime = trimmed.reduce((sum, row) => sum + row.time, 0) / trimmed.length;
    const meanPitch = pitches.reduce((sum, value) => sum + value, 0) / pitches.length;
    const variance = trimmed.reduce((sum, row) => sum + (row.time - meanTime) ** 2, 0);
    const slope = variance ? trimmed.reduce((sum, row) => sum + (row.time - meanTime) * (row.midi - meanPitch), 0) / variance : Infinity;
    if (Math.abs(slope) > rules.maximumGlideSemitonesPerSecond) continue;
    const duration = trimmed.at(-1).time - trimmed[0].time + Math.min(frameIntervalSeconds, rules.maximumFrameGap);
    if (duration < rules.minimumSecondsPerBin) continue;
    stableFrames += trimmed.length;
    const entry = byMidi.get(trimmed[0].bin) || { rows: [], seconds: 0 };
    entry.rows.push(...trimmed); entry.seconds += duration;
    byMidi.set(trimmed[0].bin, entry);
  }
  const bins = [];
  for (const [midi, entry] of byMidi) {
    const stats = {};
    for (const metric of PERSONAL_FEATURES) {
      const values = entry.rows.map(row => row.f[metric] + (metric === 'level' ? conditions.inputGainDb : 0)).filter(value => finite(value) && Math.abs(value) <= 120);
      if (values.length < rules.minimumFramesPerBin) continue;
      const median = q(values, 0.5), iqr = q(values, 0.75) - q(values, 0.25);
      const robust = values.filter(value => Math.abs(value - median) <= Math.max(1, iqr * 4));
      if (robust.length >= rules.minimumFramesPerBin)
        stats[metric] = { p10: round(q(robust, 0.1)), p50: round(q(robust, 0.5)), p90: round(q(robust, 0.9)) };
    }
    if (stats[feature]) bins.push({ midi, frames: entry.rows.length, seconds: round(entry.seconds), stats });
  }
  bins.sort((a, b) => a.midi - b.midi);
  const acceptedFrames = bins.reduce((sum, bin) => sum + bin.frames, 0), warnings = [];
  if (!confirmed) warnings.push('지도사가 지정 발음을 확인한 뒤 반영할 수 있습니다.');
  if (acceptedFrames < rules.minimumFrames) warnings.push('안정적인 음정 구간이 부족합니다. 각 음을 편안하게 유지해 다시 녹음해 주세요.');
  if (bins.length && bins.every(bin => bin.stats[feature].p90 - bin.stats[feature].p10 < rules.minimumSpreadDb))
    warnings.push('음정별 변화 폭이 작습니다. 기록은 보관하며 반응 범위가 충분한 음정부터 적용합니다.');
  return { version: 1, ...source, compatibility: conditions, confirmed: confirmed === true,
    usable: confirmed === true && acceptedFrames >= rules.minimumFrames && bins.length > 0, bins,
    quality: { totalFrames: features.length, validFrames: rows.filter(row => row.valid).length, stableFrames,
      acceptedFrames, assumedTiming, frameIntervalSeconds, rules: { ...rules }, warnings } };
}

function aggregate(entries, now) {
  const stats = {};
  for (const metric of PERSONAL_FEATURES) {
    const available = entries.filter(entry => entry.bin.stats[metric]);
    if (!available.length) continue;
    let weightSum = 0; const values = { p10: 0, p50: 0, p90: 0 };
    for (const entry of available) {
      const ageDays = Math.max(0, (now - Date.parse(entry.observation.createdAt)) / 86400000);
      const weight = Math.max(0.000001, 2 ** (-ageDays / HALF_LIFE_DAYS));
      weightSum += weight;
      for (const key of ['p10', 'p50', 'p90']) values[key] += entry.bin.stats[metric][key] * weight;
    }
    stats[metric] = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, round(value / weightSum)]));
  }
  return stats;
}

/** Equal contribution per recording, never per number of frames. First baseline
 * remains available while the latest 12 distinct recordings per note refine the
 * current response. These are weighted averages of within-record quantiles,
 * not pooled population percentiles or a validated development score. */
export function buildPersonalModel(observations, { profile, mode = 'adaptive', suppressCommon = false, now = new Date().toISOString() } = {}) {
  if (!Array.isArray(observations) || observations.length > MAX_RECORDS) fail('누적 측정은 최대 512개까지 묶을 수 있습니다.');
  if (!['adaptive', 'fixed', 'off'].includes(mode)) fail('개인 반응 모드가 올바르지 않습니다.');
  if (typeof suppressCommon !== 'boolean') fail('공통 반응 완화 설정이 올바르지 않습니다.');
  const conditions = compatibility(profile), createdAt = date(typeof now === 'number' ? new Date(now).toISOString() : now);
  const valid = [], ids = new Set(), hashes = new Set();
  const counts = { observations: 0, bins: 0, duplicates: 0, incompatible: 0, rejected: 0 };
  for (const input of observations) {
    if (!input || input.excluded === true || input.usable !== true || input.confirmed !== true) { counts.rejected++; continue; }
    const observation = checkedObservation(input);
    if (!compatible(observation.compatibility, conditions, observation.layerKey)) { counts.incompatible++; continue; }
    if (ids.has(observation.id) || hashes.has(`${observation.layerKey}:${observation.sourceHash}`)) { counts.duplicates++; continue; }
    ids.add(observation.id); hashes.add(`${observation.layerKey}:${observation.sourceHash}`); valid.push(observation);
  }
  // Reusing one source as different instructed sounds cannot establish contrast.
  const hashLabels = new Map();
  for (const observation of valid) {
    const labels = hashLabels.get(observation.sourceHash) || new Set(); labels.add(observation.layerKey); hashLabels.set(observation.sourceHash, labels);
  }
  const unambiguous = valid.filter(observation => {
    if (hashLabels.get(observation.sourceHash).size > 1) { counts.rejected++; return false; }
    return true;
  }).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const layers = {};
  for (const layerKey of PERSONAL_LAYERS) {
    const bins = [], feature = conditions.features[layerKey];
    for (let midi = 36; midi <= 84; midi++) {
      const entries = unambiguous.filter(observation => observation.layerKey === layerKey)
        .flatMap(observation => observation.bins.filter(bin => bin.midi === midi && bin.stats[feature]).map(bin => ({ observation, bin })));
      if (!entries.length) continue;
      const recent = entries.slice(-MAX_RECENT), first = entries[0];
      bins.push({ midi, recordCount: entries.length, usedRecordCount: recent.length,
        frameCount: recent.reduce((sum, entry) => sum + entry.bin.frames, 0), seconds: round(recent.reduce((sum, entry) => sum + entry.bin.seconds, 0)),
        current: aggregate(recent, Date.parse(createdAt)), baseline: checkedStats(first.bin.stats),
        baselineId: first.observation.id, sourceIds: [...new Set([first.observation.id, ...recent.map(entry => entry.observation.id)])] });
    }
    layers[layerKey] = { feature, bins }; counts.bins += bins.length;
  }
  counts.observations = unambiguous.length;
  const model = { version: PERSONAL_MODEL_VERSION, mode, suppressCommon, compatibility: conditions, createdAt,
    policy: { maxRecordsPerBin: MAX_RECENT, halfLifeDays: HALF_LIFE_DAYS, aggregation: 'record-balanced-quantile-mean', pitchBinSemitones: 1 },
    layers, sources: unambiguous.map(checkedSource), counts };
  model.id = `pcm-${fingerprint(model)}`;
  return sanitizePersonalModel(model);
}

/** Strict allowlist prevents arbitrary profile data or large PCM payloads from
 * entering the realtime path. Unknown keys are dropped; malformed bounds fail. */
export function sanitizePersonalModel(input) {
  if (!plain(input) || input.version !== PERSONAL_MODEL_VERSION) fail('지원하지 않는 개인 반응 모델입니다.');
  if (!['adaptive', 'fixed', 'off'].includes(input.mode) || typeof input.suppressCommon !== 'boolean') fail('개인 반응 설정이 올바르지 않습니다.');
  const conditions = checkedCompatibility(input.compatibility);
  if (!Array.isArray(input.sources) || input.sources.length > MAX_RECORDS || !plain(input.layers) || !plain(input.counts)) fail('개인 반응 자료 형식이 올바르지 않습니다.');
  const sources = input.sources.map(checkedSource), byId = new Map(sources.map(source => [source.id, source]));
  if (byId.size !== sources.length) fail('측정 번호가 중복되었습니다.');
  if (new Set(sources.map(source => source.sourceHash)).size !== sources.length) fail('동일 음원이 중복 반영되었습니다.');
  const model = { version: PERSONAL_MODEL_VERSION, id: text(input.id, '모델 번호', 80), mode: input.mode, suppressCommon: input.suppressCommon,
    compatibility: conditions, createdAt: date(input.createdAt),
    policy: { maxRecordsPerBin: MAX_RECENT, halfLifeDays: HALF_LIFE_DAYS, aggregation: 'record-balanced-quantile-mean', pitchBinSemitones: 1 }, layers: {}, sources, counts: {} };
  for (const key of ['observations', 'bins', 'duplicates', 'incompatible', 'rejected']) model.counts[key] = num(input.counts[key], 0, key === 'bins' ? 196 : MAX_RECORDS, '집계 수', true);
  for (const key of PERSONAL_LAYERS) {
    const layer = input.layers[key];
    if (!plain(layer) || layer.feature !== conditions.features[key] || !Array.isArray(layer.bins) || layer.bins.length > 49) fail('영역별 개인 반응이 올바르지 않습니다.');
    const seen = new Set();
    const bins = layer.bins.map(bin => {
      if (!plain(bin)) fail('음정별 개인 반응이 올바르지 않습니다.');
      const midi = num(bin.midi, 36, 84, '관측 음정', true);
      if (seen.has(midi)) fail('음정별 반응이 중복되었습니다.'); seen.add(midi);
      if (!Array.isArray(bin.sourceIds) || !bin.sourceIds.length || bin.sourceIds.length > MAX_RECENT + 1) fail('음정별 출처가 올바르지 않습니다.');
      const sourceIds = bin.sourceIds.map(id => {
        if (!byId.has(id) || byId.get(id).layerKey !== key) fail('개인 반응 출처가 일치하지 않습니다.'); return id;
      });
      if (new Set(sourceIds).size !== sourceIds.length || !sourceIds.includes(bin.baselineId)) fail('기준 기록이 올바르지 않습니다.');
      const recordCount = num(bin.recordCount, 1, MAX_RECORDS, '녹음 수', true), usedRecordCount = num(bin.usedRecordCount, 1, MAX_RECENT, '반영 녹음 수', true);
      const availableSources = sources.filter(source => source.layerKey === key).length;
      if (recordCount > availableSources || usedRecordCount !== Math.min(recordCount, MAX_RECENT)
          || sourceIds.length !== usedRecordCount + (recordCount > MAX_RECENT ? 1 : 0)) fail('반영 녹음 수가 일치하지 않습니다.');
      const current = checkedStats(bin.current), baseline = checkedStats(bin.baseline);
      if (!current[layer.feature] || !baseline[layer.feature]) fail('영역 음향 특징이 누락되었습니다.');
      return { midi, recordCount, usedRecordCount, frameCount: num(bin.frameCount, 8, MAX_RECENT * 1000000, '프레임 수', true),
        seconds: num(bin.seconds, 0.24, MAX_RECENT * 36000, '측정 시간'), current, baseline, baselineId: bin.baselineId, sourceIds };
    }).sort((a, b) => a.midi - b.midi);
    model.layers[key] = { feature: layer.feature, bins };
  }
  if (model.counts.observations !== sources.length || model.counts.bins !== PERSONAL_LAYERS.reduce((sum, key) => sum + model.layers[key].bins.length, 0)) fail('개인 반응 집계가 일치하지 않습니다.');
  return model;
}

// Cache constant-time semitone lookups by immutable/sanitized model instance.
const indexes = new WeakMap();
function indexFor(model) {
  let index = indexes.get(model);
  if (!index) { index = Object.fromEntries(PERSONAL_LAYERS.map(key => [key, new Map((model.layers?.[key]?.bins || []).map(bin => [bin.midi, bin]))])); indexes.set(model, index); }
  return index;
}
function contrastAttenuation(model, layerKey, midi, features, profile, index) {
  if (!model.suppressCommon) return { attenuation: 1, discriminativeFeatures: 0 };
  const bins = PERSONAL_LAYERS.map(key => index[key].get(midi));
  if (bins.some((bin, i) => !bin || bin.usedRecordCount < 2 || !compatible(model.compatibility, compatibility(profile), PERSONAL_LAYERS[i])))
    return { attenuation: 1, discriminativeFeatures: 0 };
  // Compare matched digital input level as well as pitch; different recording
  // gain/loudness is not evidence of sound-category specificity.
  const type = model.mode === 'fixed' ? 'baseline' : 'current';
  const levels = bins.map(bin => bin[type]?.level?.p50);
  const inputLevel = features.level + profile.global.inputGainDb;
  if (levels.some(level => !finite(level) || Math.abs(level - inputLevel) > 6)
      || Math.max(...levels) - Math.min(...levels) > 6) return { attenuation: 1, discriminativeFeatures: 0 };
  let totalWeight = 0, weightedEvidence = 0, featureCount = 0;
  const targetIndex = PERSONAL_LAYERS.indexOf(layerKey);
  for (const metric of PERSONAL_FEATURES.filter(key => key !== 'level')) {
    if (!finite(features[metric]) || bins.some(bin => !bin[type]?.[metric])) continue;
    const groups = bins.map(bin => bin[type][metric]), target = groups[targetIndex];
    const within = Math.max(0.5, ...groups.map(group => (group.p90 - group.p10) / 2));
    const separation = Math.min(...groups.filter((_, i) => i !== targetIndex).map(group => Math.abs(group.p50 - target.p50))) / within;
    if (separation < 1.5) continue; // Common/nondiscriminative features get no weight.
    const distance = Math.abs(features[metric] - target.p50) / within;
    const otherDistance = Math.min(...groups.filter((_, i) => i !== targetIndex).map(group => Math.abs(features[metric] - group.p50))) / within;
    const weight = Math.min(3, separation - 1);
    weightedEvidence += weight * clamp(0.5 + (otherDistance - distance) / 3, 0, 1); totalWeight += weight; featureCount++;
  }
  // Two independently discriminative features are required; never erase F0,
  // harmonics or force the four output channels to sum to 100 percent.
  if (featureCount < 2) return { attenuation: 1, discriminativeFeatures: 0 };
  return { attenuation: round(0.35 + 0.65 * clamp(weightedEvidence / totalWeight * 2, 0, 1)), discriminativeFeatures: featureCount };
}

/** Lightweight exact-observed-note lookup. Null means use existing manual range.
 * The function trusts a model returned by sanitizePersonalModel/buildPersonalModel;
 * profile/global compatibility is checked every frame to honor manual changes. */
export function personalResponseRange(model, layerKey, features, profile) {
  if (!model || model.version !== 1 || model.mode === 'off' || !PERSONAL_LAYERS.includes(layerKey)) return null;
  const f = features || {}, current = { noiseGateDb: profile?.global?.noiseGateDb, inputGainDb: profile?.global?.inputGainDb,
    features: { [layerKey]: profile?.layers?.[layerKey]?.feature } };
  if (!compatible(model.compatibility, current, layerKey) || !profile.layers[layerKey].enabled
      || f.valid !== true || !finite(f.f0) || f.f0 <= 0 || !finite(f.clarity) || f.clarity < PERSONAL_QUALITY.minimumClarity
      || !finite(f.level) || f.level + current.inputGainDb < current.noiseGateDb || f.clipped === true || (finite(f.peak) && f.peak >= 0.999)) return null;
  const midi = Math.round(69 + 12 * Math.log2(f.f0 / 440));
  if (midi < 36 || midi > 84) return null;
  const index = indexFor(model), bin = index[layerKey].get(midi);
  const stats = bin?.[model.mode === 'fixed' ? 'baseline' : 'current']?.[current.features[layerKey]];
  if (!stats || stats.p90 - stats.p10 < PERSONAL_QUALITY.minimumSpreadDb || !finite(f[current.features[layerKey]])) return null;
  return { inputMin: stats.p10, inputMax: stats.p90, matched: true, midi, recordCount: bin.recordCount,
    ...contrastAttenuation(model, layerKey, midi, f, profile, index) };
}
