/** Evidence-based collection priorities. These are project choices, not clinical norms. */
export const RESEARCH_POLICY_VERSION='TV-RESEARCH-2026-09-10-v1';
export function metricPriority(key){
 if(['time','duration','valid','RMS','peak','crestDb','clarity'].includes(key))return {tier:'quality',label:'품질 확인',note:'신호·유효 구간 확인용. 성격 또는 발달 점수가 아닙니다.'};
 if(key==='f0')return {tier:'core',label:'필수 수집 후보',note:'평균·중앙값·변동·범위를 과제별 비교. 검출기와 옥타브 오류 확인 필요.'};
 if(key==='level')return {tier:'core',label:'필수 수집 후보',note:'현재 dBFS 상대 레벨입니다. 보정된 dB SPL 음압과 구분합니다.'};
 if(key==='CPP')return {tier:'core',label:'필수 수집 후보',note:'국제 권고의 CPP 계열. 현재 앱 추정값은 CPPS/Praat와 동등성 미검증.'};
 if(['HNR','JIT','SHI','tilt','negh1h2','centroidHz','bandwidthHz','rolloff85Hz','flatness','singerCluster'].includes(key))return {tier:'candidate',label:'추가 검증 후보',note:['HNR','JIT','SHI'].includes(key)?'지속 모음·주기 검출·기준 도구 일치 검증 후 사용. 노래 전체의 임상 정상범위를 적용하지 않습니다.':'과제·마이크·음높이의 영향을 분리하고 중복성을 확인합니다.'};
 if(/^F[1-3]$/.test(key))return {tier:'candidate',label:'포먼트 검증 후보',note:'현재 값은 고정 대역 피크입니다. 기준 도구의 F1–F3·대역폭과 별도로 보관하며 인두 부위와 일대일 대응하지 않습니다.'};
 if(/^F[1-7]$/.test(key)||['VTL','HNR_legacy','envelopeVariation'].includes(key))return {tier:'hold',label:'표준 분석 제외',note:'현재 구현은 표준 포먼트·성도 실측·HNR·Shimmer와 다릅니다. 원본 호환 자료로만 보관합니다.'};
 if(key.startsWith('response_'))return {tier:'hold',label:'시각화 전용',note:'개인 보정값에 따른 화면 반응이며 실제 근육 활성 측정값이 아닙니다.'};
 return {tier:'exploratory',label:'탐색 보관',note:'일차 상관분석에서 제외하고 사전 계획된 별도 탐색에 사용합니다.'};
}
export function researchSnapshot(entry){
 const r=entry.examination?.research||{},a=entry.fileAnalysis||{};
 const missing=['task','timepoint','microphone','distanceCm','processing','assessmentId','assessmentVersion','assessmentDate','scoreUnit','researchConsentRef'].filter(k=>r[k]===undefined||r[k]===null||r[k]===''||r[k]==='unknown');
 if(r.accompaniment!=='none')missing.push('isolated_voice');
 return {policyVersion:RESEARCH_POLICY_VERSION,reviewStatus:'not_reviewed',readyForConfirmatoryAnalysis:false,missingContext:missing.join('|'),collection:r,coreFamilies:'F0|calibrated_SPL|CPP_CPPS',currentMethodStatus:'browser_estimates_not_reference_validated',referenceExtractionStatus:'pending',referenceFormants:{method:'not_extracted',F1:null,F2:null,F3:null,B1:null,B2:null,B3:null},clinicalNormsApplied:false,personalityInferenceEnabled:false,rawAudioPreserved:true,sampleRate:a.sampleRate||null,primaryCandidates:'f0|level|CPP',conditionalCandidates:'HNR|JIT|SHI|tilt|negh1h2|centroidHz|bandwidthHz|rolloff85Hz|flatness|singerCluster',excludedFromPrimary:'F1-F7_fixed_band_peaks|VTL_model|HNR_legacy|envelopeVariation|response_nas_oro_aes_src',consentStatus:'requires_source_document_review'};
}
