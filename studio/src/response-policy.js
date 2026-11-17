// Versioned, user-defined visual response. Not physiological activity or diagnosis.
// No DOM, persistence, network, source audio or human labels in this module.
import {FOCUS_DEFAULTS,FEMALE_FOCUS_PRESET,FEMALE_FOCUS_DEFAULTS} from './spectral-focus.js?v=monitor-fix-20260913';
export const RESPONSE_VERSION='four-layer-response-20261117-v2';
export const RESPONSE_POLICY=Object.freeze({version:RESPONSE_VERSION,upperBand:[4000,7800],denominator:[80,7800],upperAnchorRatio:.02811668637798218,sensitivity:.7,lowerStrength:.2,lowerCutoffMidi:{male:48,female:53},transitionSemitones:1,minimumLevelDbfs:-48,minimumClarity:.7,sampleRate:48000,fftSize:4096});
export const isNewResponse=p=>p?.responseVersion===RESPONSE_VERSION;
export function activateResponseProfile(profile){return {...profile,responseVersion:RESPONSE_VERSION};}
export function responseQuality(f,p){
 const c=f?.responseCue;
 if(!c||c.sampleRate!==48000||c.fftSize!==4096)return {valid:false,reason:'unsupported_context'};
 if(!['male','female'].includes(p?.voicePreset))return {valid:false,reason:'profile_unconfirmed'};
 const [lo,hi]=p.voicePreset==='female'?[80,1600]:[55,1200];
 if(f.valid!==true||!Number.isFinite(f.f0)||f.f0<lo||f.f0>hi||!Number.isFinite(f.clarity)||f.clarity<.7||f.clarity>1)return {valid:false,reason:'pitch_quality'};
 if(!Number.isFinite(f.level)||f.level< -48||f.level+p.global.inputGainDb<p.global.noiseGateDb)return {valid:false,reason:'low_level'};
 if(!Number.isFinite(c.peak)||c.peak>=1||c.peak<0)return {valid:false,reason:'decoded_peak'};
 if(!Number.isFinite(c.highRatio)||c.highRatio<0||c.highRatio>1)return {valid:false,reason:'no_power'};
 return {valid:true,reason:null};
}
export function measureResponseCue(wave,spectrum,sampleRate){
 let peak=0;for(const x of wave||[]){if(!Number.isFinite(x))return {sampleRate,fftSize:spectrum?.length*2,peak:NaN,highRatio:null};peak=Math.max(peak,Math.abs(x));}
 let total=0,high=0;const bin=sampleRate/(spectrum?.length*2);
 for(let i=1;i<(spectrum?.length||0);i++){const hz=i*bin;if(hz<80||hz>=7800)continue;const db=spectrum[i];if(db===-Infinity)continue;if(!Number.isFinite(db))return {sampleRate,fftSize:spectrum.length*2,peak,highRatio:null};const power=10**(db/10);total+=power;if(hz>=4000)high+=power;}
 return {sampleRate,fftSize:spectrum?.length*2,peak,highRatio:total>0?high/total:null};
}
// A different feature, edited tuning or a non-off upper personal model keeps its
// existing cue/calibration. Old upper-band calibration is never applied to4–7.8kHz.
export function usesUpperReference(profile){
 const layer=profile?.layers?.nas;if(!layer?.enabled)return false;
 if(profile.personalModel?.mode!=='off'&&profile.personalModel?.layers?.nas?.bins?.length)return false;
 const [feature,inputMin,inputMax]=(profile.focusPreset===FEMALE_FOCUS_PRESET?FEMALE_FOCUS_DEFAULTS:FOCUS_DEFAULTS).nas;
 const expected={feature,inputMin,inputMax,gain:1,offset:0,gamma:1,outputMin:0,outputMax:100};
 return Object.entries(expected).every(([k,v])=>layer[k]===v);
}
export function lowerBoostFactor(f0,voicePreset){
 if(!Number.isFinite(f0)||f0<=0||!Object.hasOwn(RESPONSE_POLICY.lowerCutoffMidi,voicePreset))return 0;
 const midi=69+12*Math.log2(f0/440),cut=RESPONSE_POLICY.lowerCutoffMidi[voicePreset];
 const u=Math.max(0,Math.min(1,cut+.5-midi));return u*u*(3-2*u);
}
export function adjustResponseTarget(key,target,features,profile){
 if(!profile.layers[key].enabled)return 0;
 if(key==='nas'&&usesUpperReference(profile))return Math.min(1,features.responseCue.highRatio/RESPONSE_POLICY.upperAnchorRatio);
 if(key==='aes')return target+.2*lowerBoostFactor(features.f0,profile.voicePreset)*(1-target);
 return target;
}
export function responseVersionOf(entry){return entry?.fileAnalysis?.responseVersion||entry?.report?.responseVersion||entry?.profile?.responseVersion||'legacy-profile-v1';}
export const sameResponseVersion=(a,b)=>responseVersionOf(a)===responseVersionOf(b);
