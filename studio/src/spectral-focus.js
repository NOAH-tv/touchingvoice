/** Exploratory /a/ sound cues from the 2026-09-13 recordings; not anatomical activity. */
export const FOCUS_FEATURES = Object.freeze({
  upperFocus: { label: '상부 특징 대역', unit: 'dB', description: '1.5–2.2 + 3.5–4.1 kHz 전력 / 80–7,800 Hz 전력' },
  middleFocus: { label: '중부 특징 대역', unit: 'dB', description: '750–1,000 Hz 전력 / 80–7,800 Hz 전력 · 다른 발성과 겹칠 수 있음' },
  lowerFocus: { label: '하부 특징 대역', unit: 'dB', description: '2,300–2,800 Hz 전력 / 80–7,800 Hz 전력' },
  frictionFocus: { label: '마찰음색 특징 대역', unit: 'dB', description: '6,000–7,800 Hz 전력 / 80–7,800 Hz 전력 · 성문하압 측정 아님' },
});
export const FOCUS_KEYS = Object.freeze(Object.keys(FOCUS_FEATURES));
// P10/P90 of voiced, gated frames (F0 below 600 Hz to exclude onset outliers) from the supplied habitual /a/ recording, computed
// with the production 48 kHz / 4096 Blackman FFT. These are response limits.
// Each cue responds independently; the four outputs are not class probabilities.
export const FOCUS_DEFAULTS = Object.freeze({
  nas: ["upperFocus", -21.72, -8.87],
  oro: ["middleFocus", -21.21, -2.77],
  aes: ["lowerFocus", -26.19, -15.15],
  src: ["frictionFocus", -36.41, -27.31],
});
// One supplied female speaker, /a/ only. Equal-file/equal-note P10/P90,
// not population norms; keep the identifier in snapshots to preserve old replays.
export const FEMALE_FOCUS_PRESET = 'female-a-20260913';
export const FEMALE_FOCUS_DEFAULTS = Object.freeze({
  nas: ['upperFocus', -51.24, -36.09], oro: ['middleFocus', -40.63, -27.83],
  aes: ['lowerFocus', -55.16, -37.78], src: ['frictionFocus', -51.18, -38.88],
});
export function spectralFocus(spectrum, sampleRate, resonanceScale = 1, focusPreset) {
  const missing = () => Object.fromEntries(FOCUS_KEYS.map(key => [key, NaN]));
  if (!spectrum?.length || !Number.isFinite(sampleRate) || sampleRate / 2 < 7800) return missing();
  const binHz = sampleRate / (spectrum.length * 2);
  let total = 0, upper = 0, middle = 0, lower = 0, friction = 0;
  for (let i = Math.max(1, Math.ceil(80 / binHz)); i < spectrum.length && i * binHz < 7800; i++) {
    const db = spectrum[i];
    if (db === -Infinity) continue;
    if (!Number.isFinite(db)) return missing();
    const hz = i * binHz, power = 10 ** (db / 10);
    total += power;
    if (focusPreset === FEMALE_FOCUS_PRESET) {
      if (hz >= 7200 && hz < 7600) upper += power;
      if (hz >= 4600 && hz < 5300) middle += power;
      if (hz >= 6100 && hz < 6700) lower += power;
      if (hz >= 5400 && hz < 5800) friction += power;
      continue;
    }
    if (hz >= 1500 * resonanceScale && hz < 2200 * resonanceScale || hz >= 3500 * resonanceScale && hz < 4100 * resonanceScale) upper += power;
    if (hz >= 750 * resonanceScale && hz < 1000 * resonanceScale) middle += power;
    if (hz >= 2300 * resonanceScale && hz < 2800 * resonanceScale) lower += power;
    if (hz >= 6000) friction += power;
  }
  if (!(total > 0) || !Number.isFinite(total)) return missing();
  return Object.fromEntries([upper, middle, lower, friction].map((power, i) =>
    [FOCUS_KEYS[i], Math.max(-120, 10 * Math.log10(power / total))]));
}

