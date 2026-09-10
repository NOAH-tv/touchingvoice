import { sanitizePersonalModel, personalResponseRange } from './personal-calibration.js';

/**
 * TouchingVoice per-singer calibration. No network or browser dependencies.
 * Values describe a visual response to audio, not measured muscle activity.
 * Input is a feature in dB; output is a normalized 0..1 visual activation.
 */
export const LAYER_KEYS = Object.freeze(['nas', 'oro', 'aes', 'src']);
export const LAYER_META = Object.freeze({
  nas: { name: '상인두', subtitle: '비인두 · 상부 공명', color: '#91cdb1' },
  oro: { name: '중인두', subtitle: '구강인두 · 중부 공명', color: '#e2bd79' },
  aes: { name: '하인두', subtitle: '후두인두 · AES', color: '#83bcec' },
  src: { name: '성대', subtitle: '성문 · 음원', color: '#cf9dde' },
});
export const FEATURES = Object.freeze({
  brilliance: { label: '상부 밝기', unit: 'dB', description: '4–8 kHz와 저·중역의 평균 스펙트럼 차이' },
  f1dom: { label: '저역 공명 우세', unit: 'dB', description: '기본음 위~1.1 kHz와 1.1–3.5 kHz의 차이' },
  aesprom: { label: '3 kHz 돌출', unit: 'dB', description: '2.8–3.4 kHz의 최고점과 양쪽 대역의 차이' },
  negh1h2: { label: '배음 차이 (H2−H1)', unit: 'dB', description: '두 번째 배음과 첫 번째 배음의 차이 · 성문 접촉의 직접 측정 아님' },
  ring3k: { label: '3 kHz 링', unit: 'dB', description: '2.6–3.8 kHz와 1–2.6 kHz의 차이' },
  lowmid: { label: '저중역 무게', unit: 'dB', description: '기본음 위~900 Hz와 0.9–5 kHz의 차이' },
  tilt: { label: '스펙트럼 기울기', unit: 'dB', description: '50–1,500 Hz와 1.5–6 kHz의 차이' },
  level: { label: '전체 음량', unit: 'dBFS', description: '디지털 입력의 RMS 음량 · 실제 음압(SPL) 아님' },
});

const makeLayer = (feature, inputMin, inputMax) => ({
  enabled: true, feature, inputMin, inputMax, gain: 1, offset: 0,
  gamma: 1, attackMs: 100, releaseMs: 250, outputMin: 0, outputMax: 100,
});
// Original SEP_CAL score=(feature+c)/s: preserve exactly before smoothing.
export const DEFAULT_PROFILE = Object.freeze({
  schemaVersion: 1, name: '기본 프로필',
  global: Object.freeze({ noiseGateDb: -48, inputGainDb: 0 }),
  layers: Object.freeze({
    nas: Object.freeze(makeLayer('brilliance', -11.85, 1.37)),
    oro: Object.freeze(makeLayer('f1dom', 4.14, 15.37)),
    aes: Object.freeze(makeLayer('aesprom', 16.88, 35.14)),
    src: Object.freeze(makeLayer('negh1h2', -18, 6)),
  }),
});

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new TypeError(message); };
function number(value, fallback, min, max, label) {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label}: 유한한 숫자가 필요합니다.`);
  return clamp(value, min, max);
}

/**
 * Returns a fresh, allowlisted profile. Missing fields get defaults. Strings,
 * nulls, unsupported versions/features, and inverted ranges are rejected;
 * finite out-of-bounds values are clamped to safe UI limits.
 * Does not retain unknown keys, HTML, recordings, or prototype-bearing input.
 */
export function sanitizeProfile(input = DEFAULT_PROFILE) {
  if (!isRecord(input)) fail('프로필은 JSON 객체여야 합니다.');
  if (input.schemaVersion !== undefined && input.schemaVersion !== 1) fail('지원하지 않는 프로필 버전입니다.');
  if (input.name !== undefined && typeof input.name !== 'string') fail('프로필 이름은 문자열이어야 합니다.');
  if (input.global !== undefined && !isRecord(input.global)) fail('전체 입력 설정 형식이 올바르지 않습니다.');
  if (input.layers !== undefined && !isRecord(input.layers)) fail('층위 설정 형식이 올바르지 않습니다.');
  const global = input.global || {};
  const result = {
    schemaVersion: 1,
    name: (input.name ?? DEFAULT_PROFILE.name).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80) || '이름 없는 프로필',
    global: {
      noiseGateDb: number(global.noiseGateDb, -48, -96, -6, '무음 기준'),
      inputGainDb: number(global.inputGainDb, 0, -24, 24, '입력 보정'),
    },
    layers: {},
  };
  for (const key of LAYER_KEYS) {
    const base = DEFAULT_PROFILE.layers[key];
    const source = input.layers?.[key] ?? {};
    if (input.layers && key in input.layers && !isRecord(input.layers[key])) fail(`${LAYER_META[key].name} 설정 형식이 올바르지 않습니다.`);
    if (source.feature !== undefined && (typeof source.feature !== 'string' || !Object.hasOwn(FEATURES, source.feature))) fail('지원하지 않는 음향 특징입니다.');
    if (source.enabled !== undefined && typeof source.enabled !== 'boolean') fail('층위 사용 여부는 true 또는 false여야 합니다.');
    const layer = {
      enabled: source.enabled ?? base.enabled,
      feature: source.feature ?? base.feature,
      inputMin: number(source.inputMin, base.inputMin, -120, 120, '입력 하한'),
      inputMax: number(source.inputMax, base.inputMax, -120, 120, '입력 상한'),
      gain: number(source.gain, 1, 0, 5, '감도'),
      offset: number(source.offset, 0, -100, 100, '후보정'),
      gamma: number(source.gamma, 1, 0.2, 5, '반응 곡선'),
      attackMs: number(source.attackMs, 100, 0, 3000, '반응 시간'),
      releaseMs: number(source.releaseMs, 250, 0, 5000, '복귀 시간'),
      outputMin: number(source.outputMin, 0, 0, 100, '출력 하한'),
      outputMax: number(source.outputMax, 100, 0, 100, '출력 상한'),
    };
    if (layer.inputMax - layer.inputMin < 0.01) fail(`${LAYER_META[key].name}: 입력 상한은 하한보다 최소 0.01 dB 커야 합니다.`);
    if (layer.outputMax < layer.outputMin) fail(`${LAYER_META[key].name}: 출력 상한은 하한 이상이어야 합니다.`);
    result.layers[key] = layer;
  }
  if (input.personalModel !== undefined) result.personalModel = sanitizePersonalModel(input.personalModel);
  return result;
}

/** Pure mapping, independent of frame rate. profile should be sanitized first.
 * raw: target activation before attack/release; levels: smoothed activation.
 * Calibration offset is in percentage points. Input gain affects only dBFS
 * level and the gate; relative spectral features are invariant to input gain.
 * Invalid/silent input always targets zero, regardless of output minimum or
 * positive offset. Release smoothing still decays naturally back to zero.
 */
export function processLayers(features, profile = DEFAULT_PROFILE, previous = {}, dtMs = 1000 / 30) {
  const input = features || {};
  const gainDb = profile.global.inputGainDb;
  const valid = input.valid === true && Number.isFinite(input.level)
    && input.level + gainDb >= profile.global.noiseGateDb;
  const raw = {}, levels = {};
  const dt = Number.isFinite(dtMs) ? clamp(dtMs, 0, 1000) : 1000 / 30;
  for (const key of LAYER_KEYS) {
    const layer = profile.layers[key];
    const feature = input[layer.feature];
    let target = 0;
    if (valid && layer.enabled && Number.isFinite(feature)) {
      const value = feature + (layer.feature === 'level' ? gainDb : 0);
      const personal = personalResponseRange(profile.personalModel, key, input, profile);
      const low = personal?.inputMin ?? layer.inputMin, high = personal?.inputMax ?? layer.inputMax;
      const normalized = clamp((value - low) / (high - low), 0, 1);
      const curved = Math.pow(normalized, layer.gamma);
      const adjusted = clamp(curved * layer.gain + layer.offset / 100, 0, 1);
      target = (layer.outputMin + adjusted * (layer.outputMax - layer.outputMin)) / 100;
      if (personal) target *= personal.attenuation;
    }
    raw[key] = target;
    const old = Number.isFinite(previous[key]) ? clamp(previous[key], 0, 1) : 0;
    const tau = target > old ? layer.attackMs : layer.releaseMs;
    const alpha = tau <= 0 ? 1 : 1 - Math.exp(-dt / tau);
    let value = old + alpha * (target - old);
    if (!layer.enabled || (target === 0 && value < 0.0001)) value = 0;
    levels[key] = clamp(value, 0, 1);
  }
  return { raw, levels, valid };
}

export function percentile(values, fraction) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const index = clamp(fraction, 0, 1) * (sorted.length - 1);
  const lo = Math.floor(index), hi = Math.ceil(index);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
}

/** Proposes P10/P90 input ranges only; never changes the supplied profile.
 * Needs >=30 valid frames/layer and >=0.5 dB spread. A sustained constant tone
 * therefore cannot accidentally create near-infinite sensitivity. Frame count
 * is not a claim of independent samples or scientific model validation.
 * Result {profile, counts:{layer:n}, warnings:string[], usable:boolean}.
 */
export function suggestCalibration(featureSamples, profile = DEFAULT_PROFILE) {
  if (!Array.isArray(featureSamples)) fail('보정 샘플은 배열이어야 합니다.');
  const proposed = sanitizeProfile(profile), counts = {}, warnings = [];
  let changed = 0;
  for (const key of LAYER_KEYS) {
    const layer = proposed.layers[key];
    const values = featureSamples.filter(f => f?.valid === true && Number.isFinite(f.level)
      && f.level + proposed.global.inputGainDb >= proposed.global.noiseGateDb
      && Number.isFinite(f[layer.feature]))
      .map(f => f[layer.feature] + (layer.feature === 'level' ? proposed.global.inputGainDb : 0));
    counts[key] = values.length;
    if (!layer.enabled) continue;
    if (values.length < 30) {
      warnings.push(`${LAYER_META[key].name}: 유효 음성 ${values.length}프레임 — 30프레임 이상 필요합니다.`);
      continue;
    }
    const low = percentile(values, 0.1), high = percentile(values, 0.9);
    if (high - low < 0.5) {
      warnings.push(`${LAYER_META[key].name}: 변화 폭이 작습니다. 약한 소리와 강한 소리를 함께 녹음해 주세요.`);
      continue;
    }
    const inputMin = Math.round(clamp(low, -120, 120) * 100) / 100;
    const inputMax = Math.round(clamp(high, -120, 120) * 100) / 100;
    if (inputMax - inputMin < 0.5) {
      warnings.push(`${LAYER_META[key].name}: 보정 범위를 벗어난 입력입니다.`);
      continue;
    }
    layer.inputMin = inputMin;
    layer.inputMax = inputMax;
    changed++;
  }
  return { profile: proposed, counts, warnings, usable: changed > 0 };
}
