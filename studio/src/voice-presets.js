// Test presets, not population norms or clinical thresholds. Singing search
// ranges remain wider than speaking-voice ranges; individual tuning takes priority.
// The female resonance factor is an exploratory 1.1 approximation, following
// https://fon.hum.uva.nl/praat/manual/Sound__Change_gender___.html
// It requires validation with female /a/ recordings; response dB limits are shared.
export const VOICE_PRESETS = Object.freeze({
  male: Object.freeze({ label: '남성', pitchFloor: 55, pitchCeiling: 1200, resonanceScale: 1, rootMidi: 48 }),
  female: Object.freeze({ label: '여성', pitchFloor: 80, pitchCeiling: 1600, resonanceScale: 1.1, rootMidi: 60 }),
});
export const voiceSettings = profile => Object.hasOwn(VOICE_PRESETS, profile?.voicePreset) ? VOICE_PRESETS[profile.voicePreset] : VOICE_PRESETS.male;
export function requireVoicePreset(profile) {
  if (!Object.hasOwn(VOICE_PRESETS, profile?.voicePreset)) throw new Error('먼저 성별에서 남자·여자를 선택해 주세요.');
}
export function voicePresetLabel(profile) {
  return profile?.voicePreset === 'female' ? '여성 · 임시 기준' : profile?.voicePreset === 'male' ? '남성 · 녹음 기준' : '음성 기준 선택 필요';
}
