// Test presets, not population norms or clinical thresholds. Singing search
// ranges remain wider than speaking-voice ranges; individual tuning takes priority.
// resonanceScale remains the legacy formant-search approximation; measured /a/
// cue windows are selected separately by the snapshot's focusPreset identifier.
export const VOICE_PRESETS = Object.freeze({
  male: Object.freeze({ label: '남성', pitchFloor: 55, pitchCeiling: 1200, resonanceScale: 1, rootMidi: 48 }),
  female: Object.freeze({ label: '여성', pitchFloor: 80, pitchCeiling: 1600, resonanceScale: 1.1, rootMidi: 60 }),
});
export const voiceSettings = profile => Object.hasOwn(VOICE_PRESETS, profile?.voicePreset) ? VOICE_PRESETS[profile.voicePreset] : VOICE_PRESETS.male;
export function requireVoicePreset(profile) {
  if (!Object.hasOwn(VOICE_PRESETS, profile?.voicePreset)) throw new Error('먼저 성별에서 남자·여자를 선택해 주세요.');
}
export function voicePresetLabel(profile) {
  return profile?.voicePreset === 'female' ? (profile.focusPreset ? '여성 · 녹음 기준' : '여성 · 이전 임시 기준') : profile?.voicePreset === 'male' ? '남성 · 녹음 기준' : '음성 기준 선택 필요';
}
