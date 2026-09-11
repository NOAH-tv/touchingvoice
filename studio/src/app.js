import {config as franchiseConfig} from '../../config.js';
import {readProtectedAsset,clearProtectedAssetCache} from '../protected-assets.js?v=practice-20260911';
import { getContext, postParent } from '../context.js';
const franchiseContext=getContext();
import { AnatomyView } from './anatomy.js?v=nasal-smooth-20260906';
import { ANATOMY_REFERENCE } from './anatomy-reference.js';
import { AudioEngine } from './audio.js?v=pcm24-20260910';
import { DEFAULT_PROFILE, FEATURES, LAYER_KEYS, sanitizeProfile, processLayers, suggestCalibration } from './tuning.js?v=cumulative-20260910';
import { store, uid, downloadBlob } from './storage.js';
import { icon, hydrateIcons } from './icons.js?v=magnifier-20260906';
import { CORE_MODES, createSessionAccumulator, summarizeWeek } from './session-metrics.js';
import { captureChunksToWav } from './pcm-capture.js?v=pcm24-20260910';
import { createVoiceMetricsAccumulator, compareVoiceReports } from './pro-metrics.js';
import { ScaleTrainer, buildScale } from './scale-trainer.js?v=guided-1';
import { mountGuidedCalibration } from './guided-calibration-controller.js?v=cumulative-20260910';
import { mountCalibrationLibrary } from './calibration-library.js';
import { CalibrationLibraryService, observationFromRecord } from './calibration-library-service.js';
import { buildPersonalModel } from './personal-calibration.js';
import { mountStudioTools } from './studio-tools.js?v=pcm24-20260910';
import { FileAnalysisService } from './file-analysis-service.js?v=cumulative-20260910';
import { mountFileAnalysisView } from './file-analysis-view.js?v=practice-20260911';
import { ANALYZER_FIELDS } from './analyzer-metrics.js';
import { mountParticipantIntake } from './participant-intake.js?v=practice-20260911';
import { resolveParticipant } from './participant-data.js';
import { mountMemberHistory } from './member-history.js';
import { DriveBackupService } from './franchise-backup.js?v=flac-20260911';
import { selectExamProgress } from './examination-workflow.js';

const $ = id => document.getElementById(id);
const copy = value => structuredClone(value);
const META = {
  nas:{name:'상인두',en:'NASOPHARYNX',description:'비인두 · 상부 공명',color:'#b995ff'},
  oro:{name:'중인두',en:'OROPHARYNX',description:'구강인두 · 중부 공명',color:'#f2c46e'},
  aes:{name:'하인두',en:'HYPOPHARYNX',description:'후두인두 · AES',color:'#54d8d1'},
  src:{name:'성문',en:'GLOTTAL SOURCE',description:'성대 · 음원',color:'#f18bc8'},
};
const EMPTY = {valid:false,level:-120,f0:0,rms:0,clarity:0};
let profile = sanitizeProfile({...DEFAULT_PROFILE,name:franchiseContext.student.name}), saved = copy(profile), profileId = franchiseContext.student.id, refs = {}, savedRefs = {};
let profiles = [], sessions = [], selectedLayer = 'nas', selectedFocus = null, tab = 'studio', dirty = false, comparing = false;
let audioState = {mode:'idle',playing:false,recording:false,duration:0,currentTime:0};
let lastFrame = null, levels = {}, originalLevels = {}, demo = false, recordingSnapshot = null, recordingStarted = 0;
let capture = null, suggestion = null, lastPaint = 0, lastDetailPaint = -Infinity, lastHistoryPaint = -Infinity, toastTimer, busy = false, microphoneAction = null, visibilityStopping = false, loopPlayback = false;
let coreRun = null, coreStarting = false, coreFinishing = false, coreGeneration = 0, coreTimer = null, recordingSavePromise = null, currentResult = null, replayProfile = null;
let selectedStructure = null, freeVoiceAccumulator = null, studioTools = null, fileAnalyzer = null, fileAnalysisView = null, loadedAnalysisSource = null;
let participantIntake=null, memberHistory=null, driveBackup=null, driveConnection=null, lastDriveStatusPaint=0;
let reportedRecording=false;
let studioSuspended=false,studioInputEpoch=0,modelLoad=null,guidedCalibration=null,calibrationLibrary=null,calibrationService=null;
const proHistory = [];
const sessionLocked = () => Boolean(calibrationService?.busy || guidedCalibration?.active || studioSuspended || coreRun || coreStarting || coreFinishing || audioState.recording || studioTools?.trainingActive);
const effectiveProfile = () => replayProfile || (comparing ? saved : profile);
const history = Object.fromEntries(LAYER_KEYS.map(k => [k, {before:[],after:[]}]));
hydrateIcons();

function toast(message, error=false) { $('toast').textContent=message; $('toast').hidden=false; $('toast').style.background=error?'#714558':'#322242'; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').hidden=true,error?7500:4200); }
async function safe(fn) { try{return await fn();}catch(e){if(e?.code!=='CANCELLED')toast(e?.message || '요청을 처리하지 못했습니다.',true);} }
function markDirty(){replayProfile=null;dirty=JSON.stringify(profile)!==JSON.stringify(saved)||JSON.stringify(refs)!==JSON.stringify(savedRefs);$('dirtyDot').hidden=!dirty;$('saveProfileBtn').title=dirty?'저장하지 않은 튜닝 값이 있습니다':'프로필 저장';}
function time(seconds){if(!Number.isFinite(seconds))return '00:00';return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;}
function sameProfile(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function stopDemo(){demo=false;$('demoNotice').hidden=true;$('demoBtn').textContent='반응 데모';if(!audioState.playing)lastFrame=null;}
function cancelCapture(message){if(!capture)return;capture=null;$('captureBtn').disabled=false;$('captureBtn').textContent='5초 기준 수집';$('captureHint').textContent=message||'기준 수집이 취소되었습니다.';}
function clearSuggestion(){suggestion=null;$('calibrationSuggestion').hidden=true;}
function clearAnalysisHistory(){lastFrame=null;levels={};originalLevels={};proHistory.length=0;for(const layer of Object.values(history)){layer.before.length=0;layer.after.length=0;}}
function setTab(next){
  if(next==='booth')next='analyzer';
  if(guidedCalibration?.active||coreRun||coreStarting||coreFinishing){toast('진행 중인 발성 기록을 마친 뒤 이동할 수 있어요.');return;}
  studioTools?.beforeTabChange(next);tab=next;document.body.dataset.tab=next;
  if(next==='studio')void ensureAnatomyLoaded();
  document.querySelectorAll('button[data-tab]').forEach(e=>{e.classList.toggle('active',e.dataset.tab===next);if(e.dataset.tab===next)e.setAttribute('aria-current','page');else e.removeAttribute('aria-current');});
  ['studio','analyzer','training','tuning','sessions'].forEach(k=>$(k+'Panel').hidden=k!==next);
  const titles={studio:'3D 발성체크',analyzer:'음성 검사',training:'훈련 스튜디오',tuning:'설정 · 백업',sessions:'회원 · 기록'};
  $('pageTitle').textContent=titles[next];$('breadcrumbTitle').textContent=titles[next];
  $('pageDescription').textContent={studio:'영역 이름을 선택하면 근육 목록과 확대가 같은 화면에서 이어집니다.',analyzer:'대상자를 확인하고 녹음하세요. 음성 지표 추출과 회원별 저장이 자동으로 이어집니다.',training:'음정 가이드와 실제 목소리를 함께 보며 훈련합니다.',tuning:'개인별 보정과 기준 음성, 데이터 저장을 관리합니다.',sessions:'회원마다 남긴 목소리와 분석 기록을 전후로 비교합니다.'}[next]||'';
  if(next!=='training')scaleTrainer.stop();if(next==='tuning')renderTuning();if(next==='sessions')renderSessions();if(next==='training')renderTraining();if(next==='analyzer')fileAnalysisView?.refresh();renderCore();requestAnimationFrame(()=>{anatomy.resize();if(next==='sessions')memberHistory?.resize();});
}

const anatomy = new AnatomyView($('anatomyViewport'),{
  onReady(meta){$('modelLoading').hidden=true;$('modelBadge').textContent='3D MODEL · READY';$('modelBadge').title=`원본 ${meta.meshCount}개 메시 · 표시 ${meta.renderedMeshes}개 · 상태 보간 ${meta.morphPairs}개`;window.__tvModelMetadata=meta;renderStructures();},
  onError(){},
  onSelect(key,mesh,structureId){if(META[key]){if(tab!=='studio'&&!sessionLocked())setTab('studio');if(structureId){if(selectedFocus!==key)selectLayer(key);focusStructure(structureId);}else selectLayer(key,true);}},
});
function ensureAnatomyLoaded(){
  if(modelLoad)return modelLoad;
  const loader=$('modelLoading'),spinner=document.createElement('span'),label=document.createElement('span');spinner.className='spinner';loader.hidden=false;loader.replaceChildren(spinner,label);
  const started=performance.now(),paintLoading=()=>{label.textContent='3D 발성기관 준비 중 · '+Math.floor((performance.now()-started)/1000)+'초';};paintLoading();
  const timer=setInterval(paintLoading,1000);
  modelLoad=(async()=>{
    if(franchiseConfig.preview)return anatomy.load('./assets/Vocal_01.glb');
    const bytes=await readProtectedAsset('model-vocal-01');
    const url=URL.createObjectURL(new Blob([bytes],{type:'model/gltf-binary'}));
    try{await anatomy.load(url);}finally{URL.revokeObjectURL(url);}
  })().catch(error=>{modelLoad=null;const retry=document.createElement('button');retry.className='button primary';retry.textContent='3D 모델 다시 연결';retry.onclick=()=>void ensureAnatomyLoaded();loader.replaceChildren(document.createTextNode(error?.message||'3D 모델 연결을 다시 시도해 주세요.'),retry);}).finally(()=>clearInterval(timer));
  return modelLoad;
}

const engine = new AudioEngine({
  onFrame(frame){guidedCalibration?.onFrame(frame);studioTools?.onFrame(frame);lastFrame=frame;const frameNow=performance.now()/1000;proHistory.push({t:frameNow,f0:frame.features.valid?frame.features.f0:null});while(proHistory.length&&proHistory[0].t<frameNow-10)proHistory.shift();if(freeVoiceAccumulator&&audioState.recording&&!coreRun)freeVoiceAccumulator.add(frame);if(coreRun){const now=performance.now()/1000;const mapped=processLayers(frame.features,coreRun.snapshot.profile,coreRun.levels,Math.min(200,(now-coreRun.lastFrameTime)*1000));coreRun.levels=mapped.levels;coreRun.lastFrameTime=now;coreRun.accumulator.add({...frame,time:now},mapped.levels);coreRun.voiceAccumulator.add(frame);}if(capture){capture.frames.push({...frame.features});if(performance.now()-capture.start>=5000)finishCapture();}},
  onState(state){if(state.mode!==audioState.mode||state.fileName!==audioState.fileName)clearAnalysisHistory();audioState=state;if(reportedRecording!==(state.recording===true)){reportedRecording=state.recording===true;postParent({type:'tv:recording-state',recording:reportedRecording,branchId:franchiseContext.branchId,studentId:franchiseContext.practice?'':franchiseContext.student.id});}guidedCalibration?.onState(state);renderTransport();updateLocks();if(!state.playing){lastFrame=null;cancelCapture('입력이 중지되어 수집을 취소했습니다. 다시 재생한 뒤 수집하세요.');}if(coreRun&&(!state.playing||(coreRun.source==='mic'&&!state.recording))){const reached=coreRun.source==='file'&&state.mode==='file'&&state.currentTime>=CORE_MODES[coreRun.kind].duration-.1;safe(()=>finishCore(reached));}if(loopPlayback&&!coreRun&&!coreStarting&&!coreFinishing&&!busy&&!studioSuspended&&!document.hidden&&state.mode==='file'&&!state.playing&&state.duration>0&&state.currentTime>=state.duration-.01)safe(()=>engine.play());},
  onError(error){toast(error.message,true);},
  onRecording(recording){recordingSavePromise=safe(()=>saveRecording(recording));},
});

function renderCards(){
  $('layerCards').replaceChildren();$('layerTabs').replaceChildren();
  for(const key of LAYER_KEYS){const m=META[key];const b=document.createElement('button');b.className='layer-card';b.dataset.layer=key;b.style.setProperty('--layer',m.color);b.setAttribute('aria-label',`${m.name} 선택`);b.innerHTML=`<div class="layer-card-top"><div class="layer-name"><i class="layer-dot"></i><div><b>${m.name}</b><small>${m.en}</small></div></div><span class="layer-percent" id="percent-${key}">0<small>%</small></span></div><div class="layer-bar"><i id="bar-${key}"></i></div><div class="layer-card-foot"><span>${m.description}</span><b id="gain-${key}">감도 ×1.0</b></div>`;b.addEventListener('click',()=>selectLayer(key,true));$('layerCards').append(b);
    const t=document.createElement('button');t.textContent=m.name;t.dataset.layer=key;t.style.setProperty('--layer',m.color);t.setAttribute('role','tab');t.addEventListener('click',()=>selectLayer(key));$('layerTabs').append(t);
  }
  for(const [key,feature] of Object.entries(FEATURES)){const o=document.createElement('option');o.value=key;o.textContent=`${feature.label} · ${feature.unit}`;$('featureSelect').append(o);}
}
function selectLayer(key,toggle=false){if(!META[key])return;cancelCapture();clearSuggestion();selectedStructure=null;selectedLayer=key;selectedFocus=(toggle&&selectedFocus===key)?null:key;anatomy.selectLayer(selectedFocus&&anatomy.getLayerVisibility(selectedFocus)!=='hidden'?selectedFocus:null);document.querySelectorAll('.layer-card').forEach(e=>e.classList.toggle('selected',e.dataset.layer===selectedFocus));if(selectedFocus){$('focusLabel').textContent=META[key].name;$('focusDescription').textContent=META[key].description;}else{$('focusLabel').innerHTML='하나의 목소리,<br>네 개의 층위.';$('focusDescription').innerHTML='층위를 선택해<br>반응을 자세히 살펴보세요.';}renderStructures();renderTuning();}
const FIELDS = [
  ['반응이 시작하고 채워지는 범위',[['inputMin','입력 하한','dB',-120,120,.01],['inputMax','입력 상한','dB',-120,120,.01]]],
  ['개인별 후보정',[['gain','감도','배',0,5,.05],['offset','후보정','%p',-100,100,1],['gamma','반응 곡선','γ',.2,5,.05],['outputMax','최대 움직임','%',0,100,1]]],
  ['움직임의 속도와 바닥값',[['attackMs','반응 시간','ms',0,3000,10],['releaseMs','복귀 시간','ms',0,5000,10],['outputMin','최소 움직임','%',0,100,1]]],
];
function renderTuning(){
  const assessment=profiles.find(p=>p.id===profileId)?.calibrationAssessment;
  if($('guidedLatest'))$('guidedLatest').textContent=assessment?`최근 측정 ${new Date(assessment.createdAt).toLocaleDateString('ko-KR')} · 확인 음역 ${midiName(assessment.testedRange?.minMidi)} – ${midiName(assessment.testedRange?.maxMidi)} · 이 PC 저장`:'네 발성의 확인 음역과 음향 반응으로 개인 범위를 맞춥니다.';
  const l=profile.layers[selectedLayer];$('tuningLayerLabel').textContent=META[selectedLayer].name;
  document.querySelectorAll('#layerTabs button').forEach(e=>{e.classList.toggle('active',e.dataset.layer===selectedLayer);e.setAttribute('aria-selected',String(e.dataset.layer===selectedLayer));});
  $('featureSelect').value=l.feature;$('featureSelect').title=FEATURES[l.feature].description;$('layerEnabled').checked=l.enabled;
  $('tuningFields').replaceChildren();for(const [title,fields] of FIELDS){const section=document.createElement('div');section.className='field-section';const h=document.createElement('h3');h.textContent=title;section.append(h);const grid=document.createElement('div');grid.className='field-grid';for(const [key,label,unit,min,max,step] of fields){const lab=document.createElement('label');lab.append(document.createTextNode(label));const u=document.createElement('span');u.textContent=key.startsWith('input')?FEATURES[l.feature].unit:unit;lab.append(u);const input=document.createElement('input');Object.assign(input,{type:'number',min,max,step,value:l[key],id:'tune-'+key});input.dataset.field=key;input.setAttribute('aria-label',`${META[selectedLayer].name} ${label}`);input.addEventListener('input',()=>{if(audioState.recording||comparing)return;try{const next=copy(profile);next.layers[selectedLayer][key]=input.valueAsNumber;profile=sanitizeProfile(next);input.removeAttribute('aria-invalid');clearSuggestion();markDirty();}catch{input.setAttribute('aria-invalid','true');}});input.addEventListener('change',()=>changeLayerValue(key,input.valueAsNumber));lab.append(input);grid.append(lab);}section.append(grid);$('tuningFields').append(section);}
  $('inputGain').value=profile.global.inputGainDb;$('noiseGate').value=profile.global.noiseGateDb;$('profileName').value=profile.name;
  $('referenceName').textContent=refs[selectedLayer]?.fileName || '1:1 세션에서 녹음한 목소리를 연결하세요.';$('referencePlayBtn').disabled=!refs[selectedLayer]||audioState.recording||busy;
  $('compareBtn').classList.toggle('on',comparing);$('compareBtn').setAttribute('aria-pressed',String(comparing));$('compareBtn').textContent=comparing?'저장값 듣는 중':'저장값 비교';
  updateLocks();
  for(const key of LAYER_KEYS)$('gain-'+key).textContent=profile.layers[key].enabled?`감도 ×${profile.layers[key].gain.toFixed(2)}`:'반응 꺼짐';
}
function changeLayerValue(key,value){if(audioState.recording||comparing)return;try{const next=copy(profile);next.layers[selectedLayer][key]=value;profile=sanitizeProfile(next);clearSuggestion();markDirty();renderTuning();}catch(e){toast(e.message,true);renderTuning();}}
function updateLocks(){const locked=sessionLocked()||comparing;$('tuningFields').querySelectorAll('input').forEach(e=>e.disabled=locked);for(const id of ['featureSelect','layerEnabled','inputGain','noiseGate','resetLayerBtn','applySuggestionBtn'])$(id).disabled=locked;for(const id of ['compareBtn','profileName','profileSelect','newProfileBtn','duplicateProfileBtn','importBtn'])$(id).disabled=sessionLocked()||busy;
document.querySelectorAll('button[data-tab]').forEach(e=>e.disabled=Boolean(guidedCalibration?.active||coreRun||coreStarting||coreFinishing));}
function renderTransport(){
  document.body.dataset.audioActive=String(Boolean(audioState.playing||audioState.mode==='file'||demo));
  participantIntake?.updateLocks(audioState.recording);renderExamWorkflow();
  if($('examPlaybackStop'))$('examPlaybackStop').disabled=audioState.mode!=='file'||sessionLocked()||busy;
  if($('batchPlayBtn'))$('batchPlayBtn').textContent=audioState.mode==='file'&&audioState.playing&&loadedAnalysisSource?.sessionId===fileAnalysisView?.current?.()?.id?'원음 일시정지':'원음 재생';
  const s=audioState,live=s.mode==='mic'&&s.playing,micLocked=Boolean(guidedCalibration?.active||busy||microphoneAction||coreRun||coreStarting||coreFinishing||studioTools?.trainingActive);
  if($('recordingFormatStatus')){
    const track=engine.stream?.getAudioTracks?.()[0],settings=track?.getSettings?.()||{},rate=engine.context?.sampleRate;
    $('recordingFormatStatus').textContent=live?`WAV PCM 24bit · 48 kHz · 모노 | ${track?.label||'선택한 입력'} · 장치 ${settings.sampleRate?settings.sampleRate/1000+' kHz':'샘플레이트 확인 불가'}${settings.sampleRate&&settings.sampleRate!==48000?' → 48 kHz 변환':''}`:'저장 형식 WAV PCM 24bit · 48 kHz · 모노 | 인터페이스를 선택한 뒤 마이크를 연결하세요.';
  }
  const micLabel=microphoneAction==='starting'?'마이크 연결 중':microphoneAction==='saving'?'녹음 저장 중':microphoneAction==='stopping'?'마이크 종료 중':s.recording?'녹음 저장 · 마이크 끄기':live?'마이크 끄기':'마이크 시작';
  $('micBtn').innerHTML=icon('mic')+`<span>${micLabel}</span>`;$('micBtn').classList.toggle('active',live);$('micBtn').disabled=micLocked;$('micBtn').setAttribute('aria-pressed',String(live));
  const stageMic=$('stageMicBtn');if(stageMic){stageMic.disabled=micLocked;stageMic.classList.toggle('active',live);stageMic.setAttribute('aria-pressed',String(live));stageMic.setAttribute('aria-label',micLabel);$('stageMicLabel').textContent=micLabel;
    $('stageMicState').textContent=microphoneAction==='starting'?'마이크 권한과 연결을 확인하고 있습니다':microphoneAction==='saving'?'녹음을 저장한 뒤 마이크를 끕니다':microphoneAction==='stopping'?'마이크 입력을 종료하고 있습니다':studioTools?.trainingActive?'리듬 훈련에서 입력을 사용하고 있습니다':coreRun||coreStarting||coreFinishing?'발성 기록을 진행하고 있습니다':busy?'음성 작업을 준비하고 있습니다':s.recording?'현재 회원의 목소리를 녹음하고 있습니다':live?'실시간 목소리로 3D가 반응합니다':s.mode==='file'&&s.playing?'재생 중인 음성 파일의 반응을 표시합니다':demo?'반응 데모 · 마이크를 켜면 실제 음성으로 전환합니다':'마이크를 켜고 목소리의 변화를 살펴보세요';
  }
  $('playBtn').disabled=s.mode!=='file'||busy;$('playBtn').innerHTML=icon(s.playing?'pause':'play');$('playBtn').setAttribute('aria-label',s.playing?'녹음 일시 정지':'녹음 재생');$('stopBtn').disabled=(s.mode==='idle'&&!demo)||busy;
  $('recordBtn').disabled=s.mode!=='mic'||!s.playing||busy;$('recordBtn').classList.toggle('active',s.recording);$('recordBtn').innerHTML=`<i></i><span>${s.recording?'녹음 종료':'녹음'}</span>`;$('fileBtn').disabled=s.recording||busy;$('demoBtn').disabled=s.recording||busy;
  $('referenceBtn').disabled=s.recording||busy;$('referencePlayBtn').disabled=!refs[selectedLayer]||s.recording||busy;
  $('loopBtn').disabled=s.mode!=='file'||busy;$('loopBtn').setAttribute('aria-pressed',String(loopPlayback));$('seekBar').disabled=s.mode!=='file';
  $('sourceDot').classList.toggle('on',s.playing||demo);$('sourceTitle').textContent=demo?'4층위 반응 데모':s.mode==='mic'?'마이크 실시간 입력':s.mode==='file'?(s.fileName || '녹음 파일'):'음성을 연결해 주세요';$('sourceSubtitle').textContent=demo?'움직임 확인용 시뮬레이션 · 실제 음성 분석 아님':s.recording?'녹음 중 · 종료하면 이 기기에 저장됩니다':s.mode==='mic'?'내 목소리를 들려주고 모델의 변화를 살펴보세요':s.mode==='file'?'같은 녹음으로 보정 전후를 비교해 보세요':'마이크 또는 녹음 파일로 시작할 수 있습니다';
  $('wavePlaceholder').hidden=s.playing||demo;$('liveBadge').textContent=demo?'데모':s.playing?'입력 중':'입력 대기';$('liveBadge').classList.toggle('live',s.playing&&!demo);
  if(replayProfile)$('sourceSubtitle').textContent=`녹음 당시 프로필 · ${replayProfile.name}`;
  if(coreRun||coreStarting||coreFinishing||studioTools?.trainingActive){for(const id of ['micBtn','fileBtn','playBtn','recordBtn','demoBtn','referenceBtn','referencePlayBtn','loopBtn','seekBar'])$(id).disabled=true;}

}
async function withAudio(fn){if(studioSuspended)throw new Error('코칭 화면을 다시 열어 주세요.');if(busy)throw new Error('음성을 준비 중입니다. 잠시 후 다시 시도해 주세요.');busy=true;renderTransport();try{cancelCapture();stopDemo();return await fn();}finally{busy=false;renderTransport();}}
async function toggleMicrophone(){
  if(guidedCalibration?.active||busy||microphoneAction||coreRun||coreStarting||coreFinishing||studioTools?.trainingActive)return false;
  microphoneAction=audioState.recording?'saving':audioState.mode==='mic'&&audioState.playing?'stopping':'starting';
  try{return await withAudio(async()=>{
    replayProfile=null;loopPlayback=false;
    if(audioState.recording){
      // The final chunk owns the existing recording snapshot; save it before disconnecting.
      try{await engine.stopRecording();if(recordingSavePromise)await recordingSavePromise;}
      finally{engine.stop();}
      return false;
    }
    if(audioState.mode==='mic'&&audioState.playing){engine.stop();return false;}
    await engine.startMic($('boothInputSelect')?.value||undefined);return audioState.mode==='mic'&&audioState.playing;
  });}finally{microphoneAction=null;renderTransport();updateLocks();}
}
async function loadAudio(file,autoplay=true){if(sessionLocked())throw new Error('현재 발성 기록을 마친 뒤 음성을 바꿔 주세요.');const entryId=profileId,inputEpoch=studioInputEpoch;replayProfile=null;return await withAudio(async()=>{const loaded=await engine.loadFile(file);if(!loaded||profileId!==entryId||studioSuspended||inputEpoch!==studioInputEpoch)return false;loadedAnalysisSource={file,profileId:entryId};if(autoplay)await engine.play();return profileId===entryId;});}
function setComparing(value){comparing=value;renderTuning();}

function currentParticipantSnapshot(){const snapshot=participantIntake?.readSnapshot();return snapshot?copy({participant:snapshot.participant,examination:snapshot.examination}):{};}
async function commitParticipant(data){
  if(sessionLocked()||busy)throw new Error('진행 중인 음성 작업을 마친 뒤 대상자를 저장해 주세요.');
  const match=resolveParticipant(profiles,data);if(match.kind==='choose')return {choose:true,candidates:match.candidates};
  busy=true;renderTransport();updateLocks();
  try{
    if(dirty)await saveProfile();
    let entry=match.kind==='existing'?profiles.find(p=>p.id===match.entry.id):null;
    if(!entry){const next=sanitizeProfile(DEFAULT_PROFILE);next.name=data.name;entry={id:uid(),profile:next,refs:{},member:{type:'개인 레슨'},updatedAt:new Date().toISOString()};await store.put('profiles',entry);profiles.push(entry);}
    if(profileId!==entry.id)await changeProfile(entry.id);if(profileId!==entry.id)throw new Error('검사 대상자 선택을 완료하지 못했습니다.');
    profile.name=data.name;const updated=copy({...entry,profile,refs,member:{...entry.member,gender:data.gender,age:data.age,phone:data.phone},updatedAt:new Date().toISOString()});await store.put('profiles',updated);profiles=profiles.map(p=>p.id===updated.id?updated:p);
    if(profileId===updated.id){saved=copy(updated.profile);savedRefs=copy(updated.refs);markDirty();$('analysisTask').value=[data.song,data.section].filter(Boolean).join(' · ');$('analysisConditions').value=data.conditions;}
    renderProfileSelect();renderClients();renderSessions();
    const participant={id:updated.id,name:data.name,gender:data.gender,age:data.age,phone:data.phone};
    const examination={song:data.song,section:data.section,conditions:data.conditions,note:data.note,big5:copy(data.big5),consent:{...data.consent,version:'tv-pc-intake-20260906-v1',checkedAt:new Date().toISOString(),serviceText:'개인정보·음성 수집 및 이용 동의 확인 · 검사 정보·원음·분석 기록 보관',driveText:'Google Drive에 회원 정보·원음·분석 데이터를 보관하는 데 동의 확인'}};
    return {profileId:updated.id,participant,examination};
  }finally{busy=false;renderTransport();updateLocks();}
}
async function startAnalyzerRecording(){
  if(audioState.recording){await withAudio(async()=>{await engine.stopRecording();if(recordingSavePromise)await recordingSavePromise;});fileAnalysisView?.setMode('batch');return;}
  if(sessionLocked()||busy)throw new Error('진행 중인 음성 작업을 마친 뒤 녹음을 시작해 주세요.');
  const inputEpoch=studioInputEpoch;
  const intake=participantIntake?await participantIntake.prepare():null;
  if(studioSuspended||inputEpoch!==studioInputEpoch)return;
  if(intake&&intake.profileId!==profileId)throw new Error('검사 대상자가 바뀌었습니다. 대상자를 다시 확인해 주세요.');
  const effective=copy(effectiveProfile()),snapshot={profile:effective,profileId,name:effective.name,refs:copy(refs),annotation:analysisAnnotation(),...(intake?copy({participant:intake.participant,examination:intake.examination}):currentParticipantSnapshot())};
  await withAudio(async()=>{
    if(audioState.mode!=='mic'||!audioState.playing)await engine.startMic($('boothInputSelect')?.value||undefined);
    if(studioSuspended||inputEpoch!==studioInputEpoch||profileId!==snapshot.profileId||audioState.mode!=='mic'||!audioState.playing){engine.stop();throw new Error('대상자 또는 마이크 상태가 바뀌었습니다. 다시 녹음을 시작해 주세요.');}
    replayProfile=null;recordingSnapshot={...snapshot,captureSettings:engine.stream?.getAudioTracks()[0]?.getSettings()||null};
    freeVoiceAccumulator=createVoiceMetricsAccumulator({profile:effective,profileId:snapshot.profileId});recordingStarted=performance.now();
    try{await engine.startRecording();fileAnalysisView?.setMode('batch');}catch(error){recordingSnapshot=null;freeVoiceAccumulator=null;throw error;}
  });
}
function renderDriveStatus(){
  if(franchiseContext.practice){const label='자유 사용 · 학생을 선택해야 기록이 저장됩니다.';participantIntake?.setDriveStatus(label);$('driveConnectionState').textContent=label;$('batchDriveState').textContent=label;renderExamWorkflow();return;}
  const current=fileAnalysisView?.current?.(),state=current?.franchiseUpload?.state;
  const label=state==='complete'?(franchiseContext.preview?'로컬 시안 저장 완료 · Drive 전송 없음':'프랜차이즈 서버 저장 완료'):state==='uploading'?`원음 · 전체 분석 서버 저장 중${Number.isFinite(current.franchiseUpload.progress)?' · '+Math.round(current.franchiseUpload.progress)+'%':''}`:state==='uncertain'?'서버 저장 결과 확인 필요':state==='error'?'서버 저장 다시 확인':'선택 학생 · 프랜차이즈 기록 연결';
  $('backupTopBtn').textContent='저장 · 개인 튜닝';participantIntake?.setDriveStatus(label);$('driveConnectionState').textContent=label;
  $('driveConnectionDescription').textContent='선택한 지점과 학생의 권한으로 원음·전체 프레임 분석을 비공개 서버 저장소에 보관합니다.';
  $('batchDriveState').textContent=label;renderExamWorkflow();
}
async function checkDriveConnection(){driveConnection=await driveBackup.status();renderDriveStatus();}
async function retryDrive(entry){await driveBackup.retry(entry);renderSessions();renderDriveStatus();}
function renderExamWorkflow(){
  const root=$('examWorkflow');if(!root)return;
  const entry=fileAnalysisView?.current?.(),state=entry?.franchiseUpload?.state;
  const local=Boolean(entry?.fileAnalysis&&entry?.datasetBlob&&!entry.unsaved&&!entry.saving&&entry.analysisStatus==='complete');
  document.body.dataset.examView=local&&!audioState.recording?'result':'capture';
  if(!root.dataset.ready){root.dataset.ready='true';root.innerHTML='<div class="exam-steps"><div class="exam-step" id="frStepPerson"><span class="exam-step-number">01</span><div><b>학생 · 동의 확인</b><small>등록된 학생 기록에 연결</small></div></div><div class="exam-step" id="frStepCapture"><span class="exam-step-number">02</span><div><b>녹음 · 파일 입력</b><small>원음을 이 PC에 보관</small></div></div><div class="exam-step" id="frStepAnalysis"><span class="exam-step-number">03</span><div><b>전체 지표 · 프레임 분석</b><small>전체 구간을 자동 분석</small></div></div><div class="exam-step" id="frStepServer"><span class="exam-step-number">04</span><div><b>프랜차이즈 서버 저장</b><small>원음 · 전체 분석 파일</small></div></div></div><div class="exam-status"><div role="status"><b id="examStatusLabel"></b><p id="examStatusDetail"></p></div><div class="exam-status-actions"><button id="examRetryAnalysis" class="button secondary" hidden>분석 다시 시도</button><button id="franchiseSaveBtn" class="button primary" hidden>프랜차이즈 기록에 저장</button></div></div>';
    $('franchiseSaveBtn').onclick=()=>safe(async()=>{const selected=fileAnalysisView?.current?.();if(selected&&!sessionLocked()&&!busy)await retryDrive(selected);});
    $('examRetryAnalysis').onclick=()=>{const selected=fileAnalysisView?.current?.();if(selected&&!sessionLocked()&&!busy)queueFullAnalysis(selected);};
  }
  const analyzing=fileAnalyzer?.active,uploading=driveBackup?.active;
  $('frStepPerson').dataset.state='complete';$('frStepCapture').dataset.state=audioState.recording?'active':entry?.blob?'complete':'pending';$('frStepAnalysis').dataset.state=local?'complete':analyzing?'active':'pending';$('frStepServer').dataset.state=state==='complete'?'complete':state==='uploading'?'active':state==='error'||state==='uncertain'?'error':'pending';
  const label=audioState.recording?'목소리를 녹음하고 있습니다.':analyzing?'전체 음성을 분석하고 있습니다.':state==='complete'?(franchiseContext.preview?'원음과 전체 분석을 로컬 시안 서버에 저장했습니다.':'원음과 전체 분석이 서버에 저장되었습니다.'):state==='uploading'?'원음과 전체 프레임 분석을 서버에 저장합니다.':local?'PC 분석 완료 · 서버에 저장할 준비가 됐습니다.':'선택한 학생의 목소리를 기록하세요.';
  const detail=state==='error'||state==='uncertain'?entry.franchiseUpload.error:state==='complete'?(franchiseContext.preview?'실제 Drive에 전송하지 않았습니다. 시안의 임시 저장소에서 학생 고유 번호로 보관합니다.':'학생 고유 번호로 누적 저장되었습니다.'):state==='uploading'&&Number.isFinite(entry.franchiseUpload.totalBytes)?`서버 전송 ${Math.round(entry.franchiseUpload.progress||0)}% · ${(entry.franchiseUpload.sentBytes/1048576).toFixed(1)} / ${(entry.franchiseUpload.totalBytes/1048576).toFixed(1)} MB · 원음과 분석을 확인한 뒤 저장 완료로 표시합니다.`:local?'전체 프레임과 보정값을 함께 저장합니다. 원음은 150 MB, 전체 분석 파일은 64 MB까지 지원합니다. 큰 파일은 전송 진행률을 확인할 수 있습니다.':'녹음 종료 또는 파일 선택 후 원음 · 음향 지표 · 프레임 데이터가 이 PC에 자동 저장됩니다.';
  $('examStatusLabel').textContent=label;$('examStatusDetail').textContent=detail;
  $('franchiseSaveBtn').hidden=!local||state==='complete';$('franchiseSaveBtn').disabled=Boolean(uploading||audioState.recording||busy);$('franchiseSaveBtn').textContent=uploading?'서버에 저장 중…':state==='uncertain'?'저장 결과 확인 · 재시도':state==='error'?'서버 저장 다시 시도':'프랜차이즈 기록에 저장';
  if(franchiseContext.practice){$('frStepPerson').querySelector('b').textContent='자유 사용';$('frStepPerson').querySelector('small').textContent='학생 연결 없음';$('frStepCapture').querySelector('small').textContent='현재 화면에서만 분석';$('frStepServer').hidden=true;$('franchiseSaveBtn').hidden=true;$('examStatusLabel').textContent=audioState.recording?'녹음 중':analyzing?'음성 분석 중':local?'분석 완료 · 현재 화면에서 확인':'학생 없이 바로 사용하세요.';$('examStatusDetail').textContent='기록은 저장되지 않습니다. 누적 기록이 필요하면 운영 화면에서 학생을 선택한 뒤 검사하세요.';}
  $('examRetryAnalysis').hidden=!(entry?.blob&&['error','cancelled'].includes(entry.analysisStatus));
}

async function prepareAnalysisUpload(){
  const intake=participantIntake?await participantIntake.prepare():null;
  if(intake&&intake.profileId!==profileId)throw new Error('검사 대상자가 바뀌었습니다. 대상자를 다시 확인해 주세요.');
  return {...copy({profileId,profile:effectiveProfile(),refs:comparing?savedRefs:refs,annotation:analysisAnnotation(),participant:intake?.participant||null,examination:intake?.examination||null}),selectionEpoch:fileAnalysisView?.selectionEpoch};
}

function renderProfileSelect(){studioTools?.profileChanged();participantIntake?.refresh();const el=$('profileSelect');el.replaceChildren();for(const entry of profiles){const o=document.createElement('option');o.value=entry.id;o.textContent=entry.profile.name;el.append(o);}el.value=profileId;}
async function saveProfile(){profile.name=franchiseContext.student.name;
  profile=sanitizeProfile(profile);
  const entry=copy({...(profiles.find(p=>p.id===profileId)||{}),id:profileId,profile,refs,updatedAt:new Date().toISOString()});
  await store.put('profiles',entry);
  profiles=profiles.filter(e=>e.id!==entry.id);profiles.push(entry);
  if(profileId===entry.id){saved=copy(entry.profile);savedRefs=copy(entry.refs);markDirty();renderTuning();renderComparison();}
  renderProfileSelect();renderClients();toast(franchiseContext.practice?'이번 사용에 튜닝을 적용했습니다.':`${entry.profile.name}의 튜닝 프로필을 저장했습니다.`);
}
async function changeProfile(id){if(id!==franchiseContext.student.id)throw new Error('운영 화면에서 학생을 다시 선택해 주세요.');
  if(sessionLocked()){toast('진행 중인 발성 기록을 마친 뒤 프로필을 바꿔 주세요.');renderProfileSelect();return;}
  const entry=profiles.find(e=>e.id===id);if(!entry||entry.id===profileId)return;
  if(dirty&&!confirm('저장하지 않은 튜닝 값이 있습니다. 변경을 버리고 프로필을 바꿀까요?')){renderProfileSelect();return;}
  cancelCapture();stopDemo();scaleTrainer.stop();loopPlayback=false;replayProfile=null;engine.clearInput();clearAnalysisHistory();
  profileId=entry.id;$('analysisTask').value='';$('analysisConditions').value='';
  profile=sanitizeProfile(entry.profile);saved=copy(profile);refs=copy(entry.refs||{});savedRefs=copy(refs);comparing=false;clearSuggestion();markDirty();renderProfileSelect();renderTuning();renderSessions();renderTraining();
}
async function newProfile(){throw new Error('새 학생은 운영 화면에서 등록해 주세요.');}
async function exportProfile(){const payload={format:'touchingvoice-studio',version:1,exportedAt:new Date().toISOString(),profile:sanitizeProfile(profile),calibrationAssessment:profiles.find(p=>p.id===profileId)?.calibrationAssessment||null};const fileName=profile.name.replace(/[^\p{L}\p{N} _-]/gu,'_');await downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),`${fileName}.touchingvoice.json`);}
async function importProfile(file){if(audioState.recording)throw new Error('녹음을 종료한 뒤 프로필을 가져와 주세요.');if(file.size>1024*1024)throw new Error('1 MB 이하의 프로필 JSON을 선택해 주세요.');const payload=JSON.parse(await file.text());if(payload.format&&payload.format!=='touchingvoice-studio')throw new Error('터칭보이스 프로필 파일이 아닙니다.');if(payload.version!==undefined&&payload.version!==1)throw new Error('지원하지 않는 내보내기 버전입니다.');const input=payload.profile||payload;if(!input.layers||!LAYER_KEYS.every(k=>input.layers[k]))throw new Error('네 층위 설정이 모두 포함된 프로필이 필요합니다.');const next=sanitizeProfile(input);if(dirty)await saveProfile();const entry={id:uid(),profile:next,refs:{},updatedAt:new Date().toISOString()};await store.put('profiles',entry);profiles.push(entry);await changeProfile(entry.id);toast('프로필을 새 항목으로 가져왔습니다.');}

async function attachReference(file){if(file.size>32*1024*1024)throw new Error('기준 음성은 32 MB 이하로 연결해 주세요.');const layer=selectedLayer,entryId=profileId;if(!await loadAudio(file,false)||profileId!==entryId)return;const pcm=engine.buffer?.getChannelData(0);const preview=pcm?Array.from({length:100},(_,i)=>{const start=Math.floor(i*pcm.length/100),end=Math.max(start+1,Math.floor((i+1)*pcm.length/100));let peak=0;for(let n=start;n<end;n+=Math.max(1,Math.floor((end-start)/100)))peak=Math.max(peak,Math.abs(pcm[n]));return peak;}):[];const ref={id:uid(),blob:file,fileName:file.name,layer,preview,createdAt:new Date().toISOString()};await store.put('references',ref);if(profileId!==entryId)return;refs[layer]={id:ref.id,fileName:file.name,preview:ref.preview};markDirty();renderTuning();toast(`${META[layer].name} 기준 음성을 연결했습니다. 재생 후 기준을 수집해 주세요.`);}
async function playReference(){const ref=refs[selectedLayer],entryId=profileId;if(!ref)return;const data=await store.get('references',ref.id);if(profileId!==entryId)return;if(!data?.blob)throw new Error('이 기기에서 기준 음성을 찾지 못했습니다. 다시 연결해 주세요.');await loadAudio(new File([data.blob],data.fileName,{type:data.blob.type}));}
function startCapture(){if(demo||!audioState.playing){toast('실제 마이크 또는 녹음 파일을 재생한 뒤 기준을 수집해 주세요.');return;}if(comparing){toast('저장값 비교를 끈 뒤 기준을 수집해 주세요.');return;}clearSuggestion();capture={layer:selectedLayer,start:performance.now(),profile:copy(profile),frames:[]};$('captureBtn').disabled=true;$('captureBtn').textContent='수집 중 5초';$('captureHint').textContent='약한 소리와 강한 소리를 포함해 반응 범위를 들려주세요.';}
function finishCapture(){const c=capture;if(!c)return;capture=null;$('captureBtn').disabled=false;$('captureBtn').textContent='5초 기준 수집';if(c.layer!==selectedLayer||!sameProfile(c.profile,profile)){$('captureHint').textContent='설정이 바뀌었습니다. 현재 설정으로 다시 수집해 주세요.';return;}const proposal=suggestCalibration(c.frames,c.profile),p=proposal.profile.layers[c.layer],old=c.profile.layers[c.layer];if(proposal.counts[c.layer]<30||(p.inputMin===old.inputMin&&p.inputMax===old.inputMax)){$('captureHint').textContent=proposal.warnings.find(s=>s.startsWith(c.layer==='src'?'성대':META[c.layer].name))||'유효 음성과 변화 폭이 부족합니다. 다시 수집해 주세요.';return;}suggestion={layer:c.layer,min:p.inputMin,max:p.inputMax};$('suggestionText').textContent=`제안 ${p.inputMin.toFixed(2)} ~ ${p.inputMax.toFixed(2)} dB`;$('calibrationSuggestion').hidden=false;$('captureHint').textContent=`유효 ${proposal.counts[c.layer]}프레임 · 낮은 10% / 높은 10%를 제외한 범위입니다.`;}
async function saveRecording({blob,duration,mimeType,captureSettings}){
  const snapshot=recordingSnapshot||{profile:copy(profile),name:profile.name,profileId,refs:copy(refs)};if(!snapshot.voiceMetrics&&freeVoiceAccumulator)snapshot.voiceMetrics=freeVoiceAccumulator.finalize();freeVoiceAccumulator=null;recordingSnapshot=null;
  const entry={id:uid(),blob,mimeType,duration,calibrationAssessment:copy(profiles.find(p=>p.id===snapshot.profileId)?.calibrationAssessment||null),sourceKind:snapshot.report?.source==='file'?'check-clip':'recording',analysisStatus:'queued',captureSettings:captureSettings||snapshot.captureSettings||null,annotation:snapshot.annotation||{},participant:snapshot.participant||null,examination:snapshot.examination||null,createdAt:new Date().toISOString(),name:snapshot.name,profileId:snapshot.profileId,profile:snapshot.profile,refs:snapshot.refs,...(snapshot.report?{report:snapshot.report}:{}),...(snapshot.voiceMetrics?{voiceMetrics:snapshot.voiceMetrics}:{})};
  sessions.unshift(entry);
  try{await store.put('sessions',entry);toast(franchiseContext.practice?'녹음 완료 · 현재 화면에서만 분석합니다.':entry.report?'발성 반응과 음성을 기록했습니다.':'녹음과 당시 튜닝 값을 저장했습니다.');}catch(e){entry.unsaved=true;toast('기기 저장에 실패했습니다. 기록의 ‘음성 저장’으로 보관해 주세요. 창을 닫으면 사라집니다.',true);}
  $('localSaveStatus').textContent=franchiseContext.practice?'현재 화면에서만 사용 · 기록 안 함':entry.unsaved?'기기 저장 실패 · 파일로 별도 보관해 주세요.':`마지막 저장 ${new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}`;renderSessions();renderTraining();if(entry.report)showResult(entry);if(tab==='analyzer'&&entry.profileId===profileId)fileAnalysisView?.select(entry);queueFullAnalysis(entry);return entry;
}
function analysisAnnotation(){return {task:$('analysisTask')?.value.trim()||'',conditions:$('analysisConditions')?.value.trim()||''};}
function queueFullAnalysis(entry){
  if(!entry.blob?.size||!fileAnalyzer)return;
  if(fileAnalyzer.jobs?.some(j=>j.entry.id===entry.id&&['queued','decoding','analyzing','saving'].includes(j.status)))return;
  entry.analysisStatus='queued';
  void fileAnalyzer.enqueue(entry).then(result=>{renderSessions();renderTraining();if(result){$('localSaveStatus').textContent=franchiseContext.practice?'분석 완료 · 기록 안 함':'원음 · 전체 지표 · 프레임 데이터 자동 저장 완료';if(result.profileId===profileId)toast(franchiseContext.practice?'분석 완료 · 학생을 선택하면 기록을 저장할 수 있습니다.':'PC 분석 완료 · 원음과 분석 데이터를 서버에 자동 저장합니다.');if(driveBackup)void driveBackup.enqueue(result).catch(e=>toast(e.message,true));}else if(entry.analysisStatus==='error')toast('원음 기록은 유지됩니다. '+entry.analysisError,true);});
}
async function importAnalysisFiles(files,preparedOwner=null){
  if(sessionLocked()||busy)throw new Error('진행 중인 녹음을 마친 뒤 파일을 추가해 주세요.');
  const intake=preparedOwner?null:participantIntake?await participantIntake.prepare():null;
  if(intake&&intake.profileId!==profileId)throw new Error('검사 대상자가 바뀌었습니다. 대상자를 다시 확인해 주세요.');
  if(preparedOwner&&preparedOwner.profileId!==profileId)throw new Error('파일 선택 중 대상자가 바뀌었습니다. 현재 대상자를 확인하고 파일을 다시 선택해 주세요.');
  if(preparedOwner?.selectionEpoch!==undefined&&preparedOwner.selectionEpoch!==fileAnalysisView?.selectionEpoch)throw new Error('파일 선택 중 검사 화면이 바뀌었습니다. 대상자를 확인하고 파일을 다시 선택해 주세요.');
  const {selectionEpoch:discardedEpoch,...owner}=copy(preparedOwner||{profileId,profile:effectiveProfile(),refs:comparing?savedRefs:refs,annotation:analysisAnnotation(),participant:intake?.participant||null,examination:intake?.examination||null});
  stopDemo();cancelCapture();setTab('analyzer');fileAnalysisView?.setMode('batch');
  const selectionEpoch=fileAnalysisView?.selectionEpoch;
  for(const file of files){
    if(!file.size||file.size>150*1024*1024){toast(`${file.name}: 0보다 크고 150 MB 이하인 음성 파일을 선택하세요.`,true);continue;}
    const entry={id:uid(),...copy(owner),name:owner.profile.name,sourceFileName:file.name,sourceKind:'import',blob:file,mimeType:file.type,duration:0,createdAt:new Date().toISOString(),analysisStatus:'queued',saving:true};
    sessions.unshift(entry);renderSessions();try{await store.put('sessions',{...entry,saving:false});entry.saving=false;}catch{entry.saving=false;entry.unsaved=true;toast('원음 기기 저장에 실패했습니다. 분석 후 저장을 다시 시도합니다.',true);}
    queueFullAnalysis(entry);fileAnalysisView?.select(entry,{epoch:selectionEpoch});
  }
}
async function replaySession(s){
  if(sessionLocked())throw new Error('현재 발성 기록을 마친 뒤 재생해 주세요.');
  const entryId=profileId,snapshot=copy(s);if(snapshot.profileId!==entryId)return;
  if(!await loadAudio(new File([snapshot.blob],`${snapshot.name} · ${snapshot.report?CORE_MODES[snapshot.report.kind].name:'녹음'}`,{type:snapshot.mimeType}),false)||profileId!==entryId)return;
  if(loadedAnalysisSource)loadedAnalysisSource.sessionId=snapshot.id;replayProfile=snapshot.profile;renderTransport();await engine.play();
}
async function toggleReplaySession(entry){
  if(sessionLocked())throw new Error('현재 녹음을 마친 뒤 재생해 주세요.');
  if(entry.profileId!==profileId)return;
  if(loadedAnalysisSource?.sessionId===entry.id&&audioState.mode==='file'){
    if(audioState.playing)engine.pause();else await engine.play();
    return;
  }
  await replaySession(entry);
}
function renderSessions(){
  fileAnalysisView?.refresh();if(driveBackup)renderDriveStatus();renderClients();renderComparison();const memberSessions=sessions.filter(s=>s.profileId===profileId);$('sessionCount').textContent=`${memberSessions.length}개`;$('profileName').value=profile.name;const list=$('sessionList');list.replaceChildren();
  const latest=sessions.find(s=>s.report&&s.profileId===profileId);$('lastCheckSummary').hidden=!latest;
  if(latest)$('lastCheckText').textContent=`${new Date(latest.createdAt).toLocaleDateString('ko-KR',{month:'long',day:'numeric'})} · ${latest.report.completed?'완료':'중간 기록'} · 음성 ${latest.report.validSeconds.toFixed(1)}초`;
  if(!memberSessions.length){const box=document.createElement('div');box.className='empty-archive';box.innerHTML=icon('wave')+'<h3>첫 목소리를 남겨보세요</h3><p>10초 체크를 마치면 음성과<br>네 층위의 반응이 여기에 남습니다.</p>';list.append(box);return;}
  for(const s of memberSessions){
    const c=document.createElement('article');c.className='session-card';const h=document.createElement('h3');h.textContent=s.trainingResult?`${s.trainingResult.trackTitle||s.trainingResult.track?.name||'리듬 트레이닝'} · ${s.trainingResult.partial?'중간 훈련':'훈련 완료'}`:s.report?`${CORE_MODES[s.report.kind].name} · ${s.report.completed?'완료':'중간 기록'}`:s.name;
    const p=document.createElement('p');p.textContent=`${new Date(s.createdAt).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})} · ${time(Math.round(s.report?.elapsed??s.duration))} · ${s.name}`;
    if(s.report)p.textContent+=` · ${s.report.source==='file'?'파일 분석':'마이크 녹음'}${s.report.sourceName&&s.report.source==='file'?' · '+s.report.sourceName:''} · 음성 ${s.report.validSeconds.toFixed(1)}초`;
    if(s.trainingResult){const r=s.trainingResult;p.textContent+=` · 리듬 훈련${Number.isFinite(r.accuracy)?' · 음정 일치 '+r.accuracy.toFixed(1)+'%':''}${!s.blob?' · 원음 없음':''}`;}if(s.franchiseUpload?.state)p.textContent+=' · '+({complete:'프랜차이즈 서버 저장 완료',uploading:'서버 저장 중',error:'서버 저장 실패',uncertain:'서버 응답 확인 필요'}[s.franchiseUpload.state]||'PC 저장')+(s.franchiseUpload.state==='uploading'&&Number.isFinite(s.franchiseUpload.progress)?' '+Math.round(s.franchiseUpload.progress)+'%':'');if(s.driveBackup?.state)p.textContent+=' · '+({complete:'Drive 백업 완료',uploading:'Drive 백업 중',queued:'Drive 백업 대기',error:'Drive 오류',uncertain:'Drive 확인 필요','not-consented':'PC 보관'}[s.driveBackup.state]||'Drive 대기');if(s.analysisStatus)p.textContent+=s.fileAnalysis?' · 전체 분석 저장':s.analysisStatus==='error'?' · 분석 오류':s.analysisStatus==='cancelled'?' · 분석 취소':' · 전체 분석 중';if(s.unsaved)p.textContent+=' · 기기 저장 실패 · 음성 저장 필요';c.append(h,p);
    const buttons=document.createElement('div');buttons.className='session-buttons';const add=(text,className,fn)=>{const b=document.createElement('button');b.className=className;b.textContent=text;b.addEventListener('click',()=>safe(fn));buttons.append(b);};
    if(s.report)add('반응 기록','button secondary',()=>showResult(s));if(s.blob)add('재생','button secondary',()=>replaySession(s));if(s.blob)add(s.fileAnalysis?'분석 결과':'전체 분석','button secondary',()=>{setTab('analyzer');fileAnalysisView?.select(s);if(!s.fileAnalysis)queueFullAnalysis(s);});
    add('당시 설정','text-button',async()=>{if(sessionLocked())throw new Error('발성 기록을 마친 뒤 설정을 불러와 주세요.');if(dirty&&!confirm('현재 변경을 버리고 녹음 당시 설정을 불러올까요?'))return;profile=sanitizeProfile(s.profile);refs=copy(s.refs||{});comparing=false;markDirty();clearSuggestion();renderTuning();setTab('tuning');toast('녹음 당시 설정을 불러왔습니다. 저장하면 현재 프로필에 반영됩니다.');});
    if(s.blob&&!franchiseContext.practice)add('음성 저장','text-button',()=>downloadBlob(s.blob,s.sourceFileName||`touchingvoice-${s.id}.${s.mimeType.includes('wav')?'wav':s.mimeType.includes('mp4')?'m4a':s.mimeType.includes('ogg')?'ogg':'webm'}`));
    if(!franchiseContext.practice&&s.fileAnalysis&&s.franchiseUpload?.state!=='complete')add('프랜차이즈 서버 저장','text-button',()=>retryDrive(s));
    if(s.driveBackup?.artifacts?.analysis?.url){const link=document.createElement('a');const url=s.driveBackup.artifacts.analysis.url;if(/^https:\/\/(drive|docs)\.google\.com\//.test(url)){link.href=url;link.target='_blank';link.rel='noopener';link.className='text-button';link.textContent='Drive 파일';buttons.append(link);}}
    add('삭제','text-button delete-session',async()=>{if(driveBackup?.jobs.some(j=>j.id===s.id&&['queued','uploading'].includes(j.status)))throw new Error('Drive 백업을 마친 뒤 삭제하세요.');if(fileAnalyzer?.jobs.some(j=>j.entry.id===s.id&&['queued','decoding','analyzing','saving'].includes(j.status)))throw new Error('분석을 마치거나 취소한 뒤 삭제하세요.');if(!confirm('이 기기에 저장된 녹음을 삭제할까요?'))return;await store.delete('sessions',s.id);sessions=sessions.filter(x=>x.id!==s.id);if(currentResult?.id===s.id)currentResult=null;renderSessions();renderTraining();});c.append(buttons);list.append(c);
  }
}

function renderStructures(){
  document.body.dataset.structureOpen=String(Boolean(selectedFocus));$('structurePanel').hidden=!selectedFocus;requestAnimationFrame(()=>anatomy.resize());const list=$('structureList');list.replaceChildren();
  document.querySelectorAll('[data-region]').forEach(b=>{b.classList.toggle('selected',b.dataset.region===selectedFocus);b.setAttribute('aria-expanded',String(b.dataset.region===selectedFocus));});
  renderVisibility();if(!selectedFocus)return;
  const structures=anatomy.getStructures(selectedFocus);$('structureTitle').textContent=`${META[selectedFocus].name} · ${structures.length}개 구조`;
  for(const structure of structures){const b=document.createElement('button');b.className='structure-item';b.dataset.structure=structure.id;b.style.setProperty('--layer',META[selectedFocus].color);b.setAttribute('aria-pressed',String(structure.id===selectedStructure));b.setAttribute('aria-expanded',String(structure.id===selectedStructure));b.setAttribute('aria-controls',`structure-details-${structure.id}`);
    const title=document.createElement('b');title.textContent=structure.name;const english=document.createElement('small');english.textContent=structure.english;const description=document.createElement('p');description.textContent=structure.description;
    const content=document.createElement('div');content.className='structure-details';content.id=`structure-details-${structure.id}`;content.hidden=structure.id!==selectedStructure;content.append(description);b.append(title,english,content);
    const reference=ANATOMY_REFERENCE[structure.id];if(reference){const details=document.createElement('div');details.className='structure-reference';for(const [key,label] of [['actions','작용'],['origin','기시 · 시작 부위'],['insertion','정지 · 붙는 부위'],['relations','주변 구조']]){if(!reference[key])continue;const section=document.createElement('div'),heading=document.createElement('span'),body=document.createElement('p');heading.textContent=label;body.textContent=reference[key];section.append(heading,body);details.append(section);}content.append(details);}
    const row=document.createElement('div');row.className='structure-row';const visibility=document.createElement('button');visibility.className='visibility-button';visibility.dataset.visibilityStructure=structure.id;visibility.dataset.partName=structure.name;visibility.addEventListener('click',()=>{anatomy.setStructureVisible(structure.id,!anatomy.isStructureVisible(structure.id));selectedStructure=anatomy.selectedStructure;renderStructureSelection();renderVisibility();});
    b.addEventListener('click',()=>focusStructure(structure.id));row.append(b,visibility);list.append(row);
  }
  renderVisibility();
}
function renderStructureSelection(){document.querySelectorAll('[data-structure]').forEach(b=>{const expanded=b.dataset.structure===selectedStructure;b.setAttribute('aria-pressed',String(expanded));b.setAttribute('aria-expanded',String(expanded));const content=b.querySelector('.structure-details');if(content)content.hidden=!expanded;});}
function focusStructure(id){selectedStructure=id&&id!==selectedStructure?id:null;if(selectedStructure&&!anatomy.isStructureVisible(selectedStructure))anatomy.setStructureVisible(selectedStructure,true);anatomy.selectStructure(selectedStructure);renderStructureSelection();renderVisibility();}
function renderVisibility(){
  const update=(button,name,state)=>{const visible=state==='visible',label=visible?`${name} 숨기기`:`${name} ${state==='partial'?'모두 ': '다시 '}보이기`;button.innerHTML=icon(state==='hidden'?'magnifierOff':'magnifier');button.dataset.visibility=state;button.setAttribute('aria-pressed',state==='partial'?'mixed':String(visible));button.setAttribute('aria-label',label);button.title=state==='partial'?label+' · 일부 부위 숨김':label;};
  document.querySelectorAll('[data-visibility-layer]').forEach(b=>{const key=b.dataset.visibilityLayer,state=anatomy.getLayerVisibility(key);update(b,META[key].name,state);b.parentElement.dataset.visibility=state;});
  document.querySelectorAll('[data-visibility-structure]').forEach(b=>{const state=anatomy.isStructureVisible(b.dataset.visibilityStructure)?'visible':'hidden';update(b,b.dataset.partName,state);b.parentElement.dataset.visibility=state;b.parentElement.querySelector('.structure-item').title=state==='hidden'?'눌러 다시 표시하고 확대':'';});
  const count=anatomy.getHiddenStructureCount();$('showAllPartsBtn').disabled=count===0;$('hiddenPartsCount').textContent=count?`${count}개 부위 숨김`:'모든 부위 표시 중';
}
function renderTraining(){
  const steps=$('trainingSteps');steps.replaceChildren();CORE_MODES.training.stages.forEach((stage,i)=>{const el=document.createElement('div');el.className='training-step';el.dataset.step=i;el.innerHTML=`<span>0${i+1}</span><div><b>${stage.label}<small>${stage.duration}초</small></b><p>${stage.instruction}</p></div>`;steps.append(el);});
  const week=summarizeWeek(sessions.filter(s=>s.profileId===profileId));$('weekDays').textContent=week.days;$('weekTime').textContent=time(week.seconds);$('weekCount').textContent=week.count;
}
function renderCore(){
  const running=Boolean(coreRun),locked=running||coreStarting||coreFinishing;
  document.body.dataset.coreActive=String(Boolean(locked));
  $('coreStartBtn').hidden=running||coreFinishing;$('coreStartBtn').disabled=coreStarting||busy||audioState.recording;
  $('coreStopBtn').hidden=!running;$('coreStopBtn').disabled=coreFinishing;$('coreHud').hidden=!running;$('coreProgress').hidden=!running;
  $('startTrainingBtn').disabled=Boolean(locked||busy||audioState.recording);$('trainingCheckBtn').disabled=Boolean(locked||busy||audioState.recording);
  if(running){
    const mode=CORE_MODES[coreRun.kind],elapsed=Math.min(mode.duration,(performance.now()-coreRun.start)/1000),left=Math.max(0,mode.duration-elapsed);let acc=0,index=0;
    for(let i=0;i<mode.stages.length;i++){acc+=mode.stages[i].duration;if(elapsed<acc||i===mode.stages.length-1){index=i;break;}}
    const stage=mode.stages[index];$('coreOverline').textContent=coreRun.source==='file'?'FILE ANALYSIS / RECORDING':'LIVE VOICE / RECORDING';$('coreTitle').textContent=stage.label;$('coreInstruction').textContent=coreRun.source==='file'?'열린 파일의 시작 구간을 분석하고 있습니다. 네 층위의 반응을 살펴보세요.':stage.instruction;
    $('coreStageLabel').textContent=`${index+1} / ${mode.stages.length} · ${stage.label}`;$('coreTimer').textContent=time(Math.ceil(left));$('coreProgress').max=mode.duration;$('coreProgress').value=elapsed;
    document.querySelectorAll('[data-step]').forEach(e=>e.classList.toggle('active',Number(e.dataset.step)===index));
  }else{
    $('coreOverline').textContent='01 / CHECK YOUR VOICE';$('coreTitle').textContent=coreFinishing?'목소리를 기록하고 있어요.':coreStarting?'마이크와 녹음을 준비하고 있어요.':'오늘의 목소리, 10초면 시작.';
    $('coreInstruction').textContent=audioState.mode==='file'?'열린 음성의 처음 10초를 분석하고, 해당 구간과 반응을 저장합니다.':'편한 소리로 짧게 발성하고 쉬어 보세요. 반응과 음성을 함께 기록합니다.';
    const buttonLabel=coreStarting?'준비 중…':audioState.mode==='file'?'이 파일로 10초 체크':'10초 발성 체크';if($('coreStartBtn').textContent!==buttonLabel)$('coreStartBtn').innerHTML=icon(audioState.mode==='file'?'wave':'mic')+`<span>${buttonLabel}</span>`;
  }
}
async function startCore(kind){
  if(sessionLocked()||busy)return;
  if(!CORE_MODES[kind])throw new Error('지원하지 않는 발성 기록입니다.');
  setTab('studio');scaleTrainer.stop();replayProfile=null;stopDemo();cancelCapture();clearSuggestion();
  const generation=++coreGeneration,source=kind==='measurement'&&audioState.mode==='file'?'file':'mic';
  const effective=effectiveProfile(),snapshot={profile:copy(effective),profileId,name:effective.name,refs:copy(comparing?savedRefs:refs),annotation:analysisAnnotation()};
  coreStarting=true;loopPlayback=false;renderTransport();updateLocks();renderCore();
  let buffer=null;
  try{
    if(source==='file'){buffer=engine.buffer;engine.pause();await engine.seek(0);if(generation!==coreGeneration||studioSuspended||document.hidden)return;await engine.play();}
    else{if(audioState.mode!=='mic'||!audioState.playing)await engine.startMic($('boothInputSelect')?.value||undefined);if(generation!==coreGeneration||studioSuspended||document.hidden){engine.stop();return;}snapshot.captureSettings=engine.stream?.getAudioTracks()[0]?.getSettings()||null;recordingSnapshot=snapshot;recordingStarted=performance.now();await engine.startRecording();}
    if(generation!==coreGeneration||studioSuspended||document.hidden){engine.stop();return;}
    if(!audioState.playing||(source==='mic'&&!audioState.recording))throw new Error('음성 입력을 시작하지 못했습니다. 다시 시도해 주세요.');
    const now=performance.now();coreRun={kind,source,start:now,snapshot,buffer,levels:{},lastFrameTime:now/1000,voiceAccumulator:createVoiceMetricsAccumulator({profile:snapshot.profile,profileId:snapshot.profileId}),accumulator:createSessionAccumulator({kind,source,profile:snapshot.profile})};
    coreTimer=setTimeout(()=>safe(()=>finishCore(true)),CORE_MODES[kind].duration*1000);
    $('anatomyViewport').scrollIntoView({behavior:'instant',block:'center'});
  }catch(e){recordingSnapshot=null;if(source==='mic')engine.stop();throw e;}
  finally{coreStarting=false;renderTransport();updateLocks();renderCore();}
}
async function finishCore(completed){
  if(!coreRun||coreFinishing)return;
  const run=coreRun;coreRun=null;coreFinishing=true;clearTimeout(coreTimer);coreTimer=null;
  const duration=Math.min(CORE_MODES[run.kind].duration,(performance.now()-run.start)/1000,...(run.source==='file'?[engine.currentTime]:[]));
  // Ending a short source or a hidden screen remains a partial record.
  const report=run.accumulator.finalize({elapsed:duration,completed:Boolean(completed&&duration>=CORE_MODES[run.kind].duration-.1)});
  report.sourceName=run.source==='file'?audioState.fileName:'마이크';run.snapshot.report=report;run.snapshot.voiceMetrics=run.voiceAccumulator.finalize();recordingSnapshot=run.snapshot;renderCore();renderTransport();updateLocks();
  try{
    if(run.source==='mic'){
      const blob=await engine.stopRecording();engine.stop();
      if(recordingSavePromise)await recordingSavePromise;
      if(!blob&&!recordingSavePromise){recordingSnapshot=null;toast('녹음 파일을 만들지 못했습니다. 마이크를 확인한 뒤 다시 시도해 주세요.',true);}
    }else{
      engine.pause();const clipDuration=Math.min(duration,run.buffer.duration);report.elapsed=Math.min(report.elapsed,clipDuration);
      const count=Math.floor(clipDuration*run.buffer.sampleRate),mono=new Float32Array(count);for(let channel=0;channel<run.buffer.numberOfChannels;channel++){const input=run.buffer.getChannelData(channel);for(let i=0;i<count;i++)mono[i]+=input[i]/run.buffer.numberOfChannels;}const clip=await captureChunksToWav([mono],run.buffer.sampleRate);await saveRecording({blob:clip.blob,duration:clip.duration,mimeType:'audio/wav',captureSettings:{format:'wav-pcm',containerBits:24,outputSampleRate:48000,sourceSampleRate:run.buffer.sampleRate,resampled:run.buffer.sampleRate!==48000,channelCount:1,derivedClip:true,adcBitDepth:null}});
    }
  }finally{coreFinishing=false;recordingSnapshot=null;recordingSavePromise=null;renderCore();renderTransport();updateLocks();}
}
function showResult(entry){
  if(!entry?.report)return;currentResult=entry;const r=entry.report;
  $('resultEyebrow').textContent=`${r.kind==='training'?'VOICE PRACTICE':'VOICE CHECK'} / ${r.completed?'COMPLETE':'PARTIAL'}`;
  $('resultTitle').textContent=r.validFrameCount===0?'소리는 기록했지만, 음성 감지가 부족해요.':r.completed?'오늘의 목소리를 기록했어요.':'여기까지의 목소리를 남겼어요.';
  $('resultDescription').textContent=`${entry.name} · ${r.source==='file'?'음성 파일 분석':'마이크 녹음'} · ${new Date(entry.createdAt).toLocaleString('ko-KR',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'})}${entry.unsaved?' · 기기 저장 실패: 음성을 별도로 저장해 주세요.':''}`;
  $('resultDuration').textContent=`${r.elapsed.toFixed(1)}초`;$('resultVoiced').textContent=`${r.validSeconds.toFixed(1)}초`;$('resultPitch').textContent=r.pitch.median===null?'—':Math.round(r.pitch.median);
  $('resultLayers').replaceChildren();for(const key of LAYER_KEYS){const layer=r.layers[key],row=document.createElement('div');row.className='result-layer';row.style.setProperty('--layer',META[key].color);row.innerHTML=`<span>${META[key].name}</span><div class="result-meter"><i style="width:${Math.round((layer.mean||0)*100)}%"></i></div><b>${layer.mean===null?'—':Math.round(layer.mean*100)} / ${layer.peak===null?'—':Math.round(layer.peak*100)}</b>`;$('resultLayers').append(row);}
  $('continueResultBtn').textContent=r.kind==='training'?'한 번 더 연습하기 →':'60초 연습으로 이어가기 →';
  if(!$('resultDialog').open)$('resultDialog').showModal();requestAnimationFrame(drawResultTrace);
}
function drawResultTrace(){
  const c=canvasContext('resultTrace'),report=currentResult?.report;if(!c||!report)return;const {ctx,w,h}=c;
  ctx.strokeStyle='#30213f';ctx.lineWidth=1;for(const fraction of [0,.5,1]){ctx.beginPath();ctx.moveTo(0,8+fraction*(h-20));ctx.lineTo(w,8+fraction*(h-20));ctx.stroke();}
  for(const key of LAYER_KEYS){ctx.strokeStyle=META[key].color;ctx.lineWidth=1.6;ctx.beginPath();let pen=false;for(const point of report.trace){if(!point.valid){pen=false;continue;}const x=point.t/Math.max(.1,report.elapsed)*w,y=h-12-point.levels[key]*(h-20);if(pen)ctx.lineTo(x,y);else ctx.moveTo(x,y);pen=true;}ctx.stroke();}
}
function bindCore(){
  // The anatomy list remains available alongside every inspector tab.
  document.querySelector('.anatomy-card').append($('structurePanel'));
  document.querySelectorAll('[data-region]').forEach(b=>b.addEventListener('click',()=>selectLayer(b.dataset.region,true)));
  document.querySelectorAll('[data-visibility-layer]').forEach(b=>b.addEventListener('click',()=>{const key=b.dataset.visibilityLayer;anatomy.setLayerVisible(key,anatomy.getLayerVisibility(key)!=='visible');selectedStructure=anatomy.selectedStructure;renderStructureSelection();renderVisibility();}));
  $('showAllPartsBtn').onclick=()=>{anatomy.showAllStructures();selectedStructure=null;anatomy.selectLayer(null);renderStructureSelection();renderVisibility();};
  $('closeStructuresBtn').onclick=()=>{selectedFocus=null;selectedStructure=null;anatomy.selectLayer(null);renderStructures();document.querySelectorAll('.layer-card').forEach(e=>e.classList.remove('selected'));};
  $('coreStartBtn').onclick=()=>safe(()=>startCore('measurement'));$('coreStopBtn').onclick=()=>safe(()=>finishCore(false));
  $('startTrainingBtn').onclick=()=>safe(()=>startCore('training'));$('trainingCheckBtn').onclick=()=>safe(()=>startCore('measurement'));
  $('viewLastResultBtn').onclick=()=>showResult(sessions.find(s=>s.report&&s.profileId===profileId));$('closeResultBtn').onclick=()=>$('resultDialog').close();
  $('replayResultBtn').onclick=()=>safe(async()=>{if(!currentResult)return;$('resultDialog').close();await replaySession(currentResult);});
  $('continueResultBtn').onclick=()=>{$('resultDialog').close();setTab('training');};
  $('openArchiveBtn').onclick=()=>{$('resultDialog').close();setTab('sessions');};
}

function canvasContext(id){const c=$(id),r=c.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);if(r.width<1)return null;if(c.width!==Math.round(r.width*dpr)||c.height!==Math.round(r.height*dpr)){c.width=Math.round(r.width*dpr);c.height=Math.round(r.height*dpr);}const ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,r.width,r.height);return {ctx,w:r.width,h:r.height};}
function drawWave(wave){const c=canvasContext('mainWave');if(!c)return;const {ctx,w,h}=c;ctx.strokeStyle='#36274c';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,h/2);ctx.lineTo(w,h/2);ctx.stroke();for(let x=0;x<w;x+=36){ctx.beginPath();ctx.moveTo(x,8);ctx.lineTo(x,h-8);ctx.strokeStyle='#21182f';ctx.stroke();}if(!wave)return;const grad=ctx.createLinearGradient(0,0,w,0);grad.addColorStop(0,'#604c92');grad.addColorStop(.45,'#c1a0ff');grad.addColorStop(1,'#604c92');ctx.strokeStyle=grad;ctx.lineWidth=1.5;ctx.beginPath();const step=Math.max(1,Math.floor(wave.length/w));for(let x=0,i=0;i<wave.length;i+=step,x++){const y=h/2-Math.max(-1,Math.min(1,wave[i]*2.5))*h*.4;x?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}
function drawReference(){const c=canvasContext('referenceWave');if(!c)return;const {ctx,w,h}=c,arr=refs[selectedLayer]?.preview||[];ctx.strokeStyle='#c3adcf';ctx.lineWidth=2;ctx.lineCap='round';arr.forEach((v,i)=>{const hh=Math.max(1,Math.min(h*.8,v*h*3));const x=(i+.5)*w/100;ctx.beginPath();ctx.moveTo(x,(h-hh)/2);ctx.lineTo(x,(h+hh)/2);ctx.stroke();});}
function drawLayerHistory(){const c=canvasContext('layerWave');if(!c)return;const {ctx,w,h}=c,d=history[selectedLayer];for(const [key,color,width] of [['before','#cec4d8',1],['after',META[selectedLayer].color,2]]){const arr=d[key];ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();arr.forEach((v,i)=>{const x=w-(arr.length-1-i)*w/150,y=h-4-v*(h-8);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();}}
function paint(now){
  requestAnimationFrame(paint);
  const stageVisible=tab==='studio';
  if(studioSuspended||document.hidden||(!stageVisible&&now-lastPaint<32))return;
  const dt=Math.min(now-lastPaint||1000/60,200);lastPaint=now;
  let f=lastFrame?.features || EMPTY,wave=lastFrame?.waveform;
  if(demo){const t=now/1000;f={valid:true,level:-24,f0:220,rms:.06,clarity:.95};for(const [i,key] of LAYER_KEYS.entries()){const l=DEFAULT_PROFILE.layers[key];f[l.feature]=l.inputMin+(l.inputMax-l.inputMin)*(.5+.4*Math.sin(t*1.4+i*1.2));}wave=Float32Array.from({length:512},(_,i)=>.12*Math.sin(i*.25+t*2)*Math.sin(i*.013));}
  const activeProfile=coreRun?.snapshot.profile||(audioState.recording&&recordingSnapshot?recordingSnapshot.profile:effectiveProfile());
  const result=processLayers(f,activeProfile,levels,dt);levels=result.levels;
  if(stageVisible){
    anatomy.setLevels(levels);
    for(const key of LAYER_KEYS){
      const level=levels[key]||0;
      textIfChanged('hud-'+key,Math.round(level*100)+'%');
      const bar=$('hud-bar-'+key),transform=`scaleX(${level.toFixed(4)})`;
      if(bar.style.width!=='100%')bar.style.width='100%';
      if(bar.style.transform!==transform)bar.style.transform=transform;
    }
  }
  // Keep history at its original cadence; the model follows display frames.
  if(now-lastHistoryPaint>=32){
    const historyDt=Math.min(Number.isFinite(lastHistoryPaint)?now-lastHistoryPaint:33,200);lastHistoryPaint=now;
    originalLevels=processLayers(f,DEFAULT_PROFILE,originalLevels,historyDt).levels;
    for(const key of LAYER_KEYS){history[key].before.push(originalLevels[key]);history[key].after.push(levels[key]);if(history[key].after.length>150){history[key].after.shift();history[key].before.shift();}}
  }
  // Text panels and off-stage charts must not compete with the 3D render loop.
  if(now-lastDetailPaint<(stageVisible?100:32))return;lastDetailPaint=now;
  if(!stageVisible){
    for(const key of LAYER_KEYS){
      const pct=Math.round((levels[key]||0)*100),label=$('percent-'+key),width=pct+'%';
      if(label.firstChild?.nodeValue!==String(pct))label.firstChild.nodeValue=String(pct);
      if($('bar-'+key).style.width!==width)$('bar-'+key).style.width=width;
    }
  }
  if(tab==='tuning'){const featureKey=activeProfile.layers[selectedLayer].feature;if(audioState.playing&&!demo)$('liveBadge').textContent=result.valid?'음성 감지':'음성 대기';const val=f[featureKey]+(featureKey==='level'?activeProfile.global.inputGainDb:0);$('rawFeature').textContent=f.valid&&Number.isFinite(val)?val.toFixed(1)+' '+FEATURES[featureKey].unit:'—';const tuned=$('tunedOutput'),pct=String(Math.round((levels[selectedLayer]||0)*100));if(tuned.firstChild?.nodeValue!==pct)tuned.firstChild.nodeValue=pct;}
  if(!stageVisible){$('levelReadout').textContent=Number.isFinite(f.level)&&f.level>-119?`${(f.level+activeProfile.global.inputGainDb).toFixed(1)} dBFS`:'— dB';$('pitchReadout').textContent=f.f0>0?`${Math.round(f.f0)} Hz`:'— Hz';$('timeDisplay').textContent=audioState.mode==='mic'?`${time(engine.currentTime)} · LIVE`:`${time(engine.currentTime)} / ${time(audioState.duration)}`;drawWave(wave);if(document.activeElement!==$('seekBar'))$('seekBar').value=audioState.duration?engine.currentTime/audioState.duration*1000:0;if(tab==='tuning'){drawLayerHistory();drawReference();}}
  if(tab==='analyzer'||tab==='training')updatePro(lastFrame);if(tab==='training')studioTools?.paint();renderCore();if($('resultDialog').open)drawResultTrace();
  if(capture){const left=Math.max(0,5-(performance.now()-capture.start)/1000);$('captureBtn').textContent=`수집 중 ${left.toFixed(1)}초`;if(left===0)finishCapture();}
  if(!coreRun&&!coreFinishing&&audioState.recording&&performance.now()-recordingStarted>=180000)safe(()=>engine.stopRecording());
}

const PRO_METRICS = [
  {key:'f0',name:'기본 주파수',unit:'Hz',decimals:0,description:'현재 음높이 · F0'},
  {key:'level',name:'디지털 입력 레벨',unit:'dBFS',decimals:1,description:'입력 게인 적용 · 음성 구간'},
  {key:'clarity',name:'음성 주기성',unit:'%',decimals:0,factor:100,description:'반복되는 음성 파형의 정도'},
  {key:'negh1h2',name:'배음 차이',unit:'dB',decimals:1,description:'H2 − H1 · 상대 음향 특징'},
  {key:'brilliance',name:'상부 밝기',unit:'dB',decimals:1,description:'4–8 kHz와 저·중역의 차이'},
  {key:'f1dom',name:'저역 공명 우세',unit:'dB',decimals:1,description:'저역 대역의 상대 에너지'},
  {key:'aesprom',name:'3 kHz 돌출',unit:'dB',decimals:1,description:'인접 대역 대비 돌출 정도'},
  {key:'tilt',name:'스펙트럼 기울기',unit:'dB',decimals:1,description:'주파수 대역 간 기울기'},
];
let editingClient = false, backupBusy = false, scaleState = {playing:false,elapsed:0,duration:0,targetMidi:null,progress:0,notes:[]};
const scaleTrainer = new ScaleTrainer({onState(state){scaleState=state;$('scaleStartBtn').disabled=state.playing;$('scaleStopBtn').disabled=!state.playing;for(const id of ['scalePattern','scaleRoot','scaleBpm','scaleRepeats'])$(id).disabled=state.playing;},onFinish(){toast('스케일 가이드를 마쳤습니다. 녹음 중이라면 세션을 종료해 기록하세요.');}});
const noteName = hz => {if(!Number.isFinite(hz)||hz<=0)return '—';const midi=Math.round(69+12*Math.log2(hz/440));return midiName(midi);};
function midiName(midi){if(!Number.isFinite(midi))return '—';const names=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];const n=Math.round(midi);return names[(n%12+12)%12]+(Math.floor(n/12)-1);}
function textIfChanged(id,text){const el=$(id);if(el&&el.textContent!==String(text))el.textContent=String(text);}
function metricText(value,metric){return Number.isFinite(value)?Number((value*(metric.factor||1)).toFixed(metric.decimals)).toFixed(metric.decimals):'—';}
function deltaText(value,metric){if(!Number.isFinite(value))return '—';const formatted=metricText(value,metric);return (Number(formatted)>0?'+':'')+formatted;}
function initPro(){
  for(const m of PRO_METRICS){const card=document.createElement('article');card.className='metric-card';card.innerHTML=`<span class="metric-label">${m.name}</span><div><b class="metric-number" id="metric-${m.key}">—</b><span class="metric-unit">${m.unit}</span></div><p class="metric-description">${m.description}</p>`;$('voiceMetricCards').append(card);}
  for(let midi=36;midi<=76;midi++){const option=document.createElement('option');option.value=midi;option.textContent=midiName(midi);$('scaleRoot').append(option);}$('scaleRoot').value='60';
  for(const id of ['headerNewClientBtn','addClientBtn'])$(id).onclick=()=>openClientDialog(false);$('editClientBtn').onclick=()=>openClientDialog(true);$('closeClientDialogBtn').onclick=()=>$('clientDialog').close();$('clientForm').onsubmit=e=>{e.preventDefault();safe(saveClientForm);};
  $('clientSearch').oninput=renderClients;
  $('analysis3dBtn').onclick=()=>setTab('studio');$('clientCheckBtn').onclick=()=>setTab('studio');
  $('analysisRecordBtn').onclick=()=>safe(startAnalyzerRecording);
  if($('examPlaybackStop'))$('examPlaybackStop').onclick=()=>{if(sessionLocked())return;engine.stop();renderTransport();};
  for(const id of ['beforeSession','afterSession'])$(id).onchange=renderComparison;
  $('replayBeforeBtn').onclick=()=>safe(()=>replayComparison('beforeSession'));$('replayAfterBtn').onclick=()=>safe(()=>replayComparison('afterSession'));
  $('exportBackupBtn').onclick=()=>safe(exportMemberBackup);$('drivePlanBtn').onclick=()=>safe(checkDriveConnection);$('closeDriveDialogBtn').onclick=()=>$('driveDialog').close();$('backupTopBtn').onclick=()=>{setTab('tuning');$('backupPanel').scrollIntoView({block:'nearest',behavior:'instant'});};
  $('scaleStartBtn').onclick=()=>safe(async()=>{if(coreRun||coreStarting||coreFinishing||studioTools?.trainingActive)throw new Error('진행 중인 발성 체크나 리듬 훈련을 마친 뒤 가이드를 시작해 주세요.');stopDemo();if(audioState.mode==='file')engine.pause();await scaleTrainer.start({rootMidi:Number($('scaleRoot').value),pattern:$('scalePattern').value,bpm:Number($('scaleBpm').value),repeats:Number($('scaleRepeats').value),transposeStep:1});});
  $('scaleStopBtn').onclick=()=>scaleTrainer.stop();
  renderClients();renderComparison();
}
function updatePro(frame){
  const f=frame?.features||EMPTY,active=effectiveProfile();const valid=f.valid&&Number.isFinite(f.level)&&f.level+active.global.inputGainDb>=active.global.noiseGateDb;
  if(tab==='analyzer'){if(driveBackup&&performance.now()-lastDriveStatusPaint>1000){lastDriveStatusPaint=performance.now();renderDriveStatus();}for(const m of PRO_METRICS){const value=valid?(m.key==='level'?f.level+active.global.inputGainDb:f[m.key]):null;textIfChanged('metric-'+m.key,metricText(value,m));}drawProCharts();}
  if(tab==='training')drawScale();
  const stateLabel=audioState.recording?'녹음 종료':audioState.mode==='file'?'파일 전체 분석':'세션 녹음';textIfChanged('analysisRecordBtn',stateLabel);$('analysisRecordBtn').disabled=Boolean(busy||coreRun||coreStarting||coreFinishing||studioTools?.trainingActive);$('scaleStartBtn').disabled=scaleState.playing||Boolean(studioTools?.trainingActive);
}
function drawProCharts(){
  const pitch=canvasContext('pitchChart');if(pitch){const {ctx,w,h}=pitch,now=performance.now()/1000;const observed=proHistory.filter(p=>p.f0>0&&p.t>now-10);const values=observed.map(p=>p.f0),lo=Math.max(50,Math.floor((values.length?Math.min(...values)*.8:80)/10)*10),hi=Math.max(lo+100,Math.ceil((values.length?Math.max(...values)*1.15:500)/10)*10);
    ctx.font='10px Paperlogy';ctx.lineWidth=1;for(let i=0;i<=4;i++){const y=18+i*(h-40)/4;ctx.strokeStyle='#9c70c51e';ctx.beginPath();ctx.moveTo(38,y);ctx.lineTo(w-10,y);ctx.stroke();ctx.fillStyle='#8e76a5';ctx.fillText(Math.round(hi-i*(hi-lo)/4),3,y+3);}
    ctx.strokeStyle='#bd8dff';ctx.lineWidth=2;ctx.beginPath();let pen=false;for(const point of proHistory){if(point.t<now-10)continue;if(!point.f0){pen=false;continue;}const x=38+(point.t-(now-10))/10*(w-50),y=18+(hi-point.f0)/(hi-lo)*(h-40);pen?ctx.lineTo(x,y):ctx.moveTo(x,y);pen=true;}ctx.stroke();
    ctx.fillStyle='#725987';ctx.fillText('-10초',38,h-3);ctx.fillText('현재',w-33,h-3);
  }
  const spectrum=canvasContext('spectrumChart');if(spectrum){const {ctx,w,h}=spectrum,arr=lastFrame?.spectrum,rate=engine.context?.sampleRate||44100;ctx.font='10px Paperlogy';for(const db of [-20,-40,-60,-80]){const y=14+(-db/100)*(h-38);ctx.strokeStyle='#9c70c51e';ctx.beginPath();ctx.moveTo(32,y);ctx.lineTo(w-10,y);ctx.stroke();ctx.fillStyle='#8e76a5';ctx.fillText(db,1,y+3);}for(const hz of [100,500,1000,4000,8000]){const x=32+Math.log(hz/80)/Math.log(100)*(w-45);ctx.fillStyle='#806594';ctx.fillText(hz>=1000?hz/1000+'k':hz,x-9,h-3);}
    if(arr){ctx.strokeStyle='#67d5cd';ctx.lineWidth=1.6;ctx.beginPath();for(let x=0;x<w-45;x++){const hz=80*Math.pow(100,x/(w-45)),bin=Math.min(arr.length-1,Math.round(hz/(rate/2)*arr.length)),db=Number.isFinite(arr[bin])?arr[bin]:-100,y=14+Math.max(0,Math.min(100,-db))/100*(h-38);x?ctx.lineTo(x+32,y):ctx.moveTo(x+32,y);}ctx.stroke();}
  }
}
function renderClients(){
  const list=$('clientList');if(!list)return;memberHistory?.refresh();const filter=$('clientSearch').value.trim().normalize('NFC').toLowerCase();list.replaceChildren();
  for(const entry of profiles.filter(p=>p.profile.name.normalize('NFC').toLowerCase().includes(filter)||(filter&&String(p.member?.phone||'').replace(/\D/g,'').includes(filter.replace(/\D/g,'')||'no-number')))){const b=document.createElement('button');b.className='client-row';b.disabled=sessionLocked()||busy;b.classList.toggle('selected',entry.id===profileId);b.setAttribute('aria-pressed',String(entry.id===profileId));const avatar=document.createElement('span');avatar.className='client-avatar';avatar.textContent=entry.profile.name.slice(0,1);const labels=document.createElement('div'),name=document.createElement('b'),sub=document.createElement('small');name.textContent=entry.profile.name;sub.textContent=`${entry.member?.type||'개인 레슨'} · ${sessions.filter(s=>s.profileId===entry.id).length}개 기록`;labels.append(name,sub);b.append(avatar,labels);b.onclick=()=>safe(()=>changeProfile(entry.id));list.append(b);}
  const current=profiles.find(p=>p.id===profileId),own=sessions.filter(s=>s.profileId===profileId);$('clientName').textContent=profile.name;$('clientDescription').textContent=current?.member?.goal||'훈련 목표를 등록하고, 회원별로 발성 기록을 쌓아갑니다.';$('clientRecordCount').textContent=own.length;$('clientRecordTime').textContent=time(Math.round(own.reduce((sum,s)=>sum+(Number(s.report?.elapsed??s.duration)||0),0)));$('clientLastDate').textContent=own.length?new Date(own[0].createdAt).toLocaleDateString('ko-KR',{month:'long',day:'numeric'}):'—';
  const candidates=own.filter(s=>s.voiceMetrics||s.report);for(const [id,defaultIndex] of [['beforeSession',candidates.length-1],['afterSession',0]]){const el=$(id),prior=el.value;el.replaceChildren();if(!candidates.length){const o=document.createElement('option');o.textContent='분석 기록이 필요합니다';o.value='';el.append(o);}else for(const s of candidates){const o=document.createElement('option');o.value=s.id;o.textContent=`${new Date(s.createdAt).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})} · ${s.report?CORE_MODES[s.report.kind].name:'코칭 세션'} · ${time(Math.round(s.duration))}`;el.append(o);}el.value=candidates.some(s=>s.id===prior)?prior:candidates[defaultIndex]?.id||'';}
  for(const id of ['headerNewClientBtn','addClientBtn','editClientBtn'])$(id).disabled=sessionLocked()||busy;
}
function openClientDialog(){toast('학생 정보는 운영 화면에서 관리합니다.');}
async function saveClientForm(){throw new Error('학생 정보는 운영 화면에서 관리합니다.');}

function renderComparison(){
  const a=sessions.find(s=>s.id===$('beforeSession').value&&s.profileId===profileId),b=sessions.find(s=>s.id===$('afterSession').value&&s.profileId===profileId);const target=$('comparisonTable');target.replaceChildren();$('replayBeforeBtn').disabled=!a||sessionLocked();$('replayAfterBtn').disabled=!b||sessionLocked();
  if(!a||!b){$('comparisonNotice').textContent='이 회원의 분석 기록이 두 개 이상 쌓이면 전후 수치를 비교할 수 있습니다.';return;}
  const comparison=compareVoiceReports(a,b),same=a.id===b.id;const calibrationSame=JSON.stringify(a.profile?.global)===JSON.stringify(b.profile?.global)&&JSON.stringify(a.profile?.layers)===JSON.stringify(b.profile?.layers)&&(a.profile?.personalModel?.id||null)===(b.profile?.personalModel?.id||null);
  $('comparisonNotice').textContent=same?'현재 같은 기록을 선택했습니다. 다른 두 기록을 선택해 비교하세요.':comparison.comparable?'동일한 회원·보정 설정의 기록입니다. 마이크와 발성 과제도 같은 조건인지 확인하세요.':comparison.reason+' 변화량은 동일한 보정 설정에서 확인할 수 있습니다.';
  if(!same&&!calibrationSame)$('comparisonNotice').textContent+=' 개인 반응 기준이 달라 네 영역의 백분율 변화는 비교하지 않습니다.';
  const table=document.createElement('table');table.className='comparison-data';table.innerHTML='<thead><tr><th>음향 지표</th><th>이전</th><th>이후</th><th>변화</th></tr></thead>';const tbody=document.createElement('tbody');
  for(const m of PRO_METRICS){const stat=m.key==='f0'?'median':'mean';let av=a.voiceMetrics?.metrics?.[m.key]?.[stat],bv=b.voiceMetrics?.metrics?.[m.key]?.[stat];if(m.key==='f0'){av??=a.report?.pitch?.median;bv??=b.report?.pitch?.median;}const delta=!same&&comparison.comparable&&Number.isFinite(av)&&Number.isFinite(bv)?bv-av:null;const tr=document.createElement('tr');for(const text of [m.name+' · '+m.unit,metricText(av,m),metricText(bv,m),deltaText(delta,m)]){const td=document.createElement('td');td.textContent=text;tr.append(td);}tbody.append(tr);}
  if(a.fileAnalysis||b.fileAnalysis)for(const field of ANALYZER_FIELDS.filter(f=>!f.key.endsWith('_relative'))){const av=a.fileAnalysis?.additionalStats?.[field.key]?.median,bv=b.fileAnalysis?.additionalStats?.[field.key]?.median,m={decimals:field.unit==='FS'?5:2},delta=!same&&comparison.comparable&&Number.isFinite(av)&&Number.isFinite(bv)?bv-av:null;const tr=document.createElement('tr');for(const text of [field.label+' · '+field.unit,metricText(av,m),metricText(bv,m),deltaText(delta,m)]){const td=document.createElement('td');td.textContent=text;tr.append(td);}tbody.append(tr);}
  for(const key of LAYER_KEYS){const av=a.fileAnalysis?a.fileAnalysis.fileLayers?.[key]?.mean:a.report?.layers?.[key]?.mean,bv=b.fileAnalysis?b.fileAnalysis.fileLayers?.[key]?.mean:b.report?.layers?.[key]?.mean,compatible=calibrationSame&&(!(a.fileAnalysis||b.fileAnalysis)||comparison.comparable),delta=!same&&compatible&&Number.isFinite(av)&&Number.isFinite(bv)?(bv-av)*100:null;const tr=document.createElement('tr');tr.className='comparison-region';const m={decimals:0,factor:100};for(const text of [META[key].name+' 반응 · %',metricText(av,m),metricText(bv,m),delta===null?'—':deltaText(delta,{decimals:0})+' %p']){const td=document.createElement('td');td.textContent=text;tr.append(td);}tbody.append(tr);}table.append(tbody);target.append(table);
}
async function replayComparison(selectId){const s=sessions.find(s=>s.id===$(selectId).value&&s.profileId===profileId);if(s)await replaySession(s);}
async function blobExport(blob){if(!blob)return null;return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({encoding:'base64',mimeType:blob.type,data:String(reader.result).split(',')[1]});reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});}
async function exportMemberBackup(){
  if(backupBusy||sessionLocked())throw new Error('현재 녹음이나 백업을 마친 뒤 다시 시도해 주세요.');backupBusy=true;$('exportBackupBtn').disabled=true;
  try{const snapshot=copy({profileId,name:profile.name,profile,refs,member:profiles.find(p=>p.id===profileId),sessions:sessions.filter(s=>s.profileId===profileId),createdAt:new Date().toISOString()});
    const own=snapshot.sessions,refIds=new Set(Object.values(snapshot.refs).map(r=>r.id).filter(Boolean));for(const s of own)for(const ref of Object.values(s.refs||{}))if(ref.id)refIds.add(ref.id);const referenceData=[];for(const id of refIds){const ref=await store.get('references',id);if(ref)referenceData.push(copy(ref));}
    const bytes=own.reduce((n,s)=>n+(s.blob?.size||0)+(s.datasetBlob?.size||0),0)+referenceData.reduce((n,r)=>n+(r.blob?.size||0),0);if(bytes>64*1024*1024)throw new Error('이 회원의 원음·지표 합계가 64 MB를 넘습니다. 기록별 음성·CSV·JSON을 내보내 주세요.');
    const payload={format:'touchingvoice-pro-member-backup',version:1,createdAt:snapshot.createdAt,member:{...snapshot.member,id:snapshot.profileId,profile:snapshot.profile,refs:snapshot.refs},sessions:[],references:[]};for(const s of own){const {blob,datasetBlob,...rest}=s;payload.sessions.push({...rest,audio:await blobExport(blob),datasetData:datasetBlob?await blobExport(datasetBlob):null});}for(const r of referenceData){const {blob,...rest}=r;payload.references.push({...rest,audio:await blobExport(blob)});}const safeName=snapshot.name.replace(/[^\p{L}\p{N} _-]/gu,'_');await downloadBlob(new Blob([JSON.stringify(payload)],{type:'application/json'}),`${safeName}-TouchingVoice-backup-${snapshot.createdAt.slice(0,10)}.json`);toast(`${snapshot.name}의 프로필·음성·지표 백업 파일을 만들었습니다.`);
  }finally{backupBusy=false;$('exportBackupBtn').disabled=false;}
}
function drawScale(){
  const target=scaleState.targetMidi,features=lastFrame?.features||EMPTY,hz=features.valid?features.f0:null;
  textIfChanged('scaleTarget',midiName(target));textIfChanged('scaleActual',noteName(hz));const cents=Number.isFinite(target)&&hz>0?1200*Math.log2(hz/(440*Math.pow(2,(target-69)/12))):null;textIfChanged('scaleCents',cents===null?'— cent':(cents>0?'+':'')+Math.round(cents)+' cent');textIfChanged('scaleTime',`${time(scaleState.elapsed)} / ${time(scaleState.duration)}`);
  const c=canvasContext('scalePiano');if(!c)return;const {ctx,w,h}=c,root=Number($('scaleRoot').value)||60;const notes=scaleState.notes?.length?scaleState.notes:buildScale({rootMidi:root,pattern:$('scalePattern').value,bpm:Number($('scaleBpm').value),repeats:Number($('scaleRepeats').value)}).notes;
  const min=Math.min(...notes.map(n=>n.midi))-2,max=Math.max(...notes.map(n=>n.midi))+2,span=max-min,windowSeconds=12,now=scaleState.playing?scaleState.elapsed:0;const yFor=midi=>h-27-(midi-min)/span*(h-48);
  ctx.font='10px Paperlogy';for(let midi=min;midi<=max;midi++){const y=yFor(midi);ctx.strokeStyle=midi%12===0?'#ac7bdd44':'#ac7bdd16';ctx.beginPath();ctx.moveTo(42,y);ctx.lineTo(w,y);ctx.stroke();if(midi%2===0){ctx.fillStyle='#8f75a7';ctx.fillText(midiName(midi),3,y+3);}}
  const playX=70;for(const note of notes){const x=playX+(note.start-now)*(w-90)/windowSeconds,noteW=note.duration*(w-90)/windowSeconds;if(x+noteW<43||x>w)continue;ctx.fillStyle=target===note.midi&&now>=note.start&&now<note.start+note.duration?'#c89bff':'#7f4abf';ctx.fillRect(Math.max(44,x),yFor(note.midi)-5,Math.min(noteW-2,w-Math.max(44,x)),10);}
  ctx.strokeStyle='#c398ff88';ctx.beginPath();ctx.moveTo(playX,12);ctx.lineTo(playX,h-20);ctx.stroke();if(hz>0){const actual=69+12*Math.log2(hz/440),y=yFor(Math.max(min,Math.min(max,actual)));ctx.beginPath();ctx.arc(playX,y,5,0,Math.PI*2);ctx.fillStyle='#66ddd0';ctx.fill();}
}

document.querySelectorAll('button[data-tab]').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));$('openTuningBtn').onclick=()=>setTab('tuning');
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{anatomy.setView(b.dataset.view);document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x===b));}));
$('explodeBtn').onclick=()=>{const next=$('explodeBtn').getAttribute('aria-pressed')!=='true';$('explodeBtn').setAttribute('aria-pressed',String(next));anatomy.setExploded(next);};
$('resetViewBtn').onclick=()=>{selectedFocus=null;selectedStructure=null;renderStructures();anatomy.selectLayer(null);anatomy.setView('iso');document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view==='iso'));document.querySelectorAll('.layer-card').forEach(x=>x.classList.remove('selected'));$('focusLabel').innerHTML='하나의 목소리,<br>네 개의 층위.';$('focusDescription').innerHTML='층위를 선택해<br>반응을 자세히 살펴보세요.';};
for(const id of ['micBtn','stageMicBtn']){const button=$(id);if(button)button.onclick=()=>safe(toggleMicrophone);}
$('fileBtn').onclick=()=>$('audioFile').click();$('audioFile').onchange=e=>{const f=e.target.files[0];if(f)safe(()=>importAnalysisFiles([f]));e.target.value='';};
$('playBtn').onclick=()=>safe(async()=>{stopDemo();if(audioState.playing)engine.pause();else await engine.play();});
$('stopBtn').onclick=()=>{if(coreRun){safe(()=>finishCore(false));return;}stopDemo();cancelCapture();engine.stop();lastFrame=null;renderTransport();};
$('recordBtn').onclick=()=>safe(async()=>{if(tab==='analyzer')return startAnalyzerRecording();if(audioState.recording){await engine.stopRecording();}else{cancelCapture();replayProfile=null;const effective=effectiveProfile();recordingSnapshot={profile:copy(effective),profileId,name:effective.name,refs:copy(comparing?savedRefs:refs),captureSettings:engine.stream?.getAudioTracks()[0]?.getSettings()||null,annotation:analysisAnnotation(),...currentParticipantSnapshot()};freeVoiceAccumulator=createVoiceMetricsAccumulator({profile:effective,profileId});recordingStarted=performance.now();try{await engine.startRecording();}catch(e){recordingSnapshot=null;freeVoiceAccumulator=null;throw e;}}});
$('demoBtn').onclick=()=>{if(audioState.recording)return;if(demo){stopDemo();}else{engine.stop();cancelCapture();demo=true;$('demoNotice').hidden=false;$('demoBtn').textContent='데모 종료';}renderTransport();};
$('featureSelect').onchange=e=>changeLayerValue('feature',e.target.value);$('layerEnabled').onchange=e=>changeLayerValue('enabled',e.target.checked);
$('inputGain').onchange=e=>{if(audioState.recording||comparing)return;try{const next=copy(profile);next.global.inputGainDb=e.target.valueAsNumber;profile=sanitizeProfile(next);markDirty();clearSuggestion();renderTuning();}catch(err){toast(err.message,true);renderTuning();}};
$('noiseGate').onchange=e=>{if(audioState.recording||comparing)return;try{const next=copy(profile);next.global.noiseGateDb=e.target.valueAsNumber;profile=sanitizeProfile(next);markDirty();clearSuggestion();renderTuning();}catch(err){toast(err.message,true);renderTuning();}};
$('compareBtn').onclick=()=>{if(audioState.recording)return;cancelCapture();setComparing(!comparing);toast(comparing?'저장된 설정으로 반응을 비교합니다. 현재 편집값은 유지됩니다.':'현재 편집값으로 돌아왔습니다.');};
$('resetLayerBtn').onclick=()=>{if(audioState.recording||comparing)return;profile.layers[selectedLayer]=copy(DEFAULT_PROFILE.layers[selectedLayer]);comparing=false;clearSuggestion();markDirty();renderTuning();toast(`${META[selectedLayer].name} 설정을 기본값으로 되돌렸습니다.`);};
for(const id of ['saveProfileBtn','saveTuningBtn'])$(id).onclick=()=>safe(saveProfile);
$('profileSelect').onchange=e=>safe(()=>changeProfile(e.target.value));$('profileName').oninput=()=>{$('profileName').value=franchiseContext.student.name;};
$('newProfileBtn').onclick=()=>safe(()=>newProfile());$('duplicateProfileBtn').onclick=()=>safe(()=>newProfile(true));$('exportBtn').onclick=()=>safe(exportProfile);$('importBtn').onclick=()=>$('importFile').click();$('importFile').onchange=e=>{const f=e.target.files[0];if(f)safe(()=>importProfile(f));e.target.value='';};
$('referenceBtn').onclick=()=>$('referenceFile').click();$('referenceFile').onchange=e=>{const f=e.target.files[0];if(f)safe(()=>attachReference(f));e.target.value='';};$('referencePlayBtn').onclick=()=>safe(playReference);$('captureBtn').onclick=startCapture;
$('applySuggestionBtn').onclick=()=>{if(!suggestion||audioState.recording||comparing)return;const {layer,min,max}=suggestion;const next=copy(profile);next.layers[layer].inputMin=min;next.layers[layer].inputMax=max;profile=sanitizeProfile(next);markDirty();clearSuggestion();renderTuning();toast(`${META[layer].name}에 제안 범위를 적용했습니다. 소리를 들으며 감도를 조절하세요.`);};
$('loopBtn').onclick=()=>{loopPlayback=!loopPlayback;renderTransport();};$('seekBar').oninput=e=>safe(()=>engine.seek(Number(e.target.value)/1000*audioState.duration));
for(const [id,key] of [['inputGain','inputGainDb'],['noiseGate','noiseGateDb']])$(id).addEventListener('input',e=>{if(audioState.recording||comparing)return;try{const next=copy(profile);next.global[key]=e.target.valueAsNumber;profile=sanitizeProfile(next);markDirty();clearSuggestion();}catch{}});
$('helpBtn').onclick=()=>$('helpDialog').showModal();$('closeHelpBtn').onclick=()=>$('helpDialog').close();$('startFittingBtn').onclick=()=>{$('helpDialog').close();setTab('tuning');};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&!visibilityStopping){visibilityStopping=true;void guidedCalibration?.close();studioTools?.stopRhythm();scaleTrainer.stop();stopDemo();cancelCapture();if(audioState.recording&&!coreRun){visibilityStopping=false;return;}if(coreRun)safe(()=>finishCore(false));else{const wasStarting=coreStarting;if(wasStarting){coreGeneration++;coreStarting=false;}if(audioState.mode==='mic'||wasStarting)engine.stop();else engine.pause();}visibilityStopping=false;}});
window.addEventListener('beforeunload',e=>{if(dirty||sessionLocked()||fileAnalyzer?.active||sessions.some(s=>s.unsaved||s.saving)||driveBackup?.active){e.preventDefault();e.returnValue='';}});

studioTools=mountStudioTools({
  getTrainingAsset:franchiseConfig.preview?null:readProtectedAsset,
  engine,getProfile:()=>({profileId,profileName:profile.name,profile:copy(profile),refs:copy(refs),inputDeviceId:$('boothInputSelect')?.value||''}),getTab:()=>tab,
  isBusy:()=>busy||studioSuspended||guidedCalibration?.active,isRecordLocked:()=>Boolean(guidedCalibration?.active||coreRun||coreStarting||coreFinishing||audioState.recording),
  getRecordElapsed:()=>audioState.recording?(performance.now()-recordingStarted)/1000:0,
  stopHostInput:async()=>{scaleTrainer.stop();loopPlayback=false;stopDemo();cancelCapture();replayProfile=null;engine.clearInput();clearAnalysisHistory();},
  onLocks:()=>{updateLocks();renderTransport();},setTab,toast,recordToggle:()=>safe(startAnalyzerRecording),
  getLatestRecording:()=>sessions.find(s=>s.profileId===profileId&&s.blob&&!s.trainingResult),playEntry:toggleReplaySession,
  downloadEntry:s=>downloadBlob(s.blob,s.sourceFileName||`touchingvoice-${s.id}.${s.mimeType.includes('wav')?'wav':s.mimeType.includes('mp4')?'m4a':s.mimeType.includes('ogg')?'ogg':'webm'}`),
  onTrainingResult:async(message,snapshot)=>{
    const r=message.result,blob=message.audioBlob instanceof Blob?message.audioBlob:null;
    const entry={id:uid(),blob,mimeType:blob?.type||'',duration:Number(r.duration??r.elapsed)||0,createdAt:new Date().toISOString(),name:snapshot.profileName,profileId:snapshot.profileId,profile:snapshot.profile,refs:snapshot.refs,sourceKind:'rhythm',captureSettings:message.captureSettings||null,analysisStatus:blob?.size?'queued':null,annotation:{task:'리듬 훈련',track:r.trackTitle||r.track?.name||''},trainingResult:copy(r),...(message.voiceMetrics?{voiceMetrics:copy(message.voiceMetrics)}:{})};
    sessions.unshift(entry);entry.saving=true;try{await store.put('sessions',{...entry,saving:false});entry.saving=false;$('localSaveStatus').textContent=franchiseContext.practice?'훈련 완료 · 기록 안 함':'리듬 훈련과 음성을 이 PC에 저장했습니다.';toast(franchiseContext.practice?'훈련 결과를 확인하세요. 기록은 저장되지 않습니다.':`${snapshot.profileName}의 리듬 훈련을 기록했습니다.`);}catch{entry.saving=false;entry.unsaved=true;toast('훈련의 기기 저장에 실패했습니다. 회원 기록에서 원음을 별도 저장하세요.',true);}renderSessions();renderTraining();if(blob?.size)queueFullAnalysis(entry);
  },
});
guidedCalibration=mountGuidedCalibration({
  engine,getSnapshot:()=>({profileId,profile:copy(profile),refs:copy(refs),assessment:copy(profiles.find(p=>p.id===profileId)?.calibrationAssessment||null)}),
  isBusy:()=>sessionLocked()||busy||comparing||Boolean(microphoneAction),
  prepareInput:()=>withAudio(async()=>{scaleTrainer.stop();studioTools?.stopRhythm();replayProfile=null;loopPlayback=false;await engine.startMic($('boothInputSelect')?.value||undefined);}),
  onLocks:()=>{updateLocks();renderTransport();},onError:error=>toast(error.message,true),
  saveTask:async({snapshot,result,sequence,samples,blob,duration,guideOffsetSeconds,captureSettings})=>{
    if(studioSuspended||snapshot.profileId!==profileId)throw new Error('측정 대상자와 저장 상태를 다시 확인해 주세요.');
    const id=uid(),createdAt=new Date().toISOString(),layer=result.layerKey;
    const sourceFileName=`개인 튜닝_${META[layer].name}_${result.vowel}_${createdAt.slice(0,19).replace(/:/g,'-')}.${blob.type.includes('wav')?'wav':blob.type.includes('mp4')?'m4a':blob.type.includes('ogg')?'ogg':'webm'}`;
    const preview=Array.from({length:100},(_,i)=>samples[Math.min(samples.length-1,Math.floor(i*samples.length/100))]?.peak||0);
    const reference={id,blob,fileName:sourceFileName,layer,preview,createdAt};
    const entry={id,profileId:snapshot.profileId,name:snapshot.profile.name,profile:snapshot.profile,refs:snapshot.refs,blob,mimeType:blob.type,duration,sourceFileName,sourceKind:'guided-calibration',analysisStatus:'queued',createdAt,captureSettings:captureSettings||null,annotation:{task:`개인 튜닝 · ${META[layer].name} /${result.vowel}/ · 5음 상행`,conditions:`시작 ${midiName(sequence.settings.rootMidi)} · ${sequence.settings.bpm} BPM · ${sequence.settings.repeats}회 · 이어폰 확인`},guidedCalibration:{protocol:result.protocol,runId:snapshot.runId,layerKey:layer,result,sequence,samples,guideOffsetSeconds},...currentParticipantSnapshot()};
    await store.put('sessions',entry);sessions.unshift(entry);
    await store.put('references',reference);renderSessions();renderTraining();queueFullAnalysis(entry);
    return {id,reference:{id,fileName:sourceFileName,preview}};
  },
  applyProfile:async({snapshot,assessment,records})=>{
    if(studioSuspended||snapshot.profileId!==profileId||!sameProfile(snapshot.profile,profile))throw new Error('대상자 또는 개인 설정이 바뀌어 적용하지 않았습니다.');
    const prior=profiles.find(p=>p.id===profileId)||{},observations=copy(prior.calibrationObservations||[]),nextRefs=copy(refs);
    let added=0;
    for(const record of Object.values(records)){
      const source=sessions.find(item=>item.id===record.id&&item.profileId===profileId);
      if(!source?.guidedCalibration?.result?.accepted)throw new Error('확인된 원음 기록을 찾지 못했습니다.');
      const layer=source.guidedCalibration.layerKey;
      const observation=await observationFromRecord(source,layer,true);
      if(observations.some(item=>item.sourceHash===observation.sourceHash))continue;
      observations.push(observation);if(observation.usable)added++;
      if(record.reference)nextRefs[layer]=record.reference;
    }
    if(!added)throw new Error('누적할 안정 음정이 부족합니다. 각 음을 일정하게 유지하고 다시 측정하세요. 원음은 기록에 남아 있습니다.');
    const model=buildPersonalModel(observations,{profile,mode:profile.personalModel?.mode==='fixed'?'fixed':'adaptive',suppressCommon:profile.personalModel?.suppressCommon===true});
    assessment.profileAfter={...copy(profile),personalModel:model};assessment.personalModelId=model.id;
    await persistCalibrationLibrary({snapshot,observations,model,apply:true,assessment,nextRefs});
    $('scalePattern').value='five-ascending';if(assessment.testedRange)$('scaleRoot').value=String(Math.max(36,Math.min(76,Math.round(assessment.testedRange.minMidi))));
  },
});
for(const id of ['guidedOpenTuning'])$(id).onclick=()=>safe(()=>guidedCalibration.open());
function calibrationSnapshot(){
  const entry=profiles.find(p=>p.id===profileId)||{};
  return {profileId,name:profile.name,profile,refs,observations:entry.calibrationObservations||[],
    model:profile.personalModel||null,mode:profile.personalModel?.mode||'adaptive',suppressCommon:profile.personalModel?.suppressCommon===true,status:calibrationService?.status||''};
}
async function persistCalibrationLibrary({snapshot,observations,model,apply,assessment,nextRefs}){
  if(studioSuspended||snapshot.profileId!==profileId||!sameProfile(snapshot.profile,profile))throw new Error('학생이나 입력 설정이 바뀌어 반영하지 않았습니다.');
  const prior=profiles.find(p=>p.id===profileId)||{},next=apply?sanitizeProfile({...profile,personalModel:model}):copy(profile);
  const revisions=copy(prior.calibrationRevisions||[]);
  if(apply)revisions.push({id:model.id,createdAt:model.createdAt,mode:model.mode,suppressCommon:model.suppressCommon,sourceIds:model.sources.map(item=>item.id)});
  const entry={...prior,id:profileId,profile:next,refs:copy(nextRefs||refs),calibrationObservations:observations,calibrationRevisions:revisions,updatedAt:new Date().toISOString(),...(assessment?{calibrationAssessment:assessment}:{})};
  await store.put('profiles',entry);profiles=profiles.filter(p=>p.id!==entry.id);profiles.push(entry);
  if(apply){profile=copy(next);saved=copy(next);refs=copy(entry.refs);savedRefs=copy(refs);clearSuggestion();markDirty();renderTuning();renderProfileSelect();renderComparison();}
  calibrationLibrary?.refresh();
}
calibrationService=new CalibrationLibraryService({
  getSnapshot:calibrationSnapshot,persistLibrary:persistCalibrationLibrary,
  saveRecord:async entry=>{Object.assign(entry,currentParticipantSnapshot());await store.put('sessions',entry);sessions.unshift(entry);renderSessions();},
  analyze:entry=>fileAnalyzer.enqueue(entry),cancelAnalysis:id=>{const job=fileAnalyzer.jobs.find(item=>item.entry.id===id);if(job)fileAnalyzer.cancel(job.id);},
  backup:entry=>driveBackup?.enqueue(entry),onChange:()=>{calibrationLibrary?.refresh();updateLocks();renderTransport();renderSessions();}
});
calibrationLibrary=mountCalibrationLibrary({getSnapshot:calibrationSnapshot,isBusy:()=>calibrationService.busy,
  onImport:async options=>{if(sessionLocked()||busy||comparing||microphoneAction)throw new Error('녹음·훈련을 마친 뒤 파일을 등록하세요.');scaleTrainer.stop();engine.stop();await calibrationService.importFiles(options);},
  onApply:options=>calibrationService.apply(options),onRemove:options=>calibrationService.toggle(options),
  onCancel:()=>calibrationService.cancel(),onError:error=>toast(error.message,true)
});
for(const id of ['calibrationOpenTuning'])$(id).onclick=()=>safe(()=>{if(sessionLocked()||busy||comparing||microphoneAction)throw new Error('진행 중인 녹음·훈련을 마쳐 주세요.');calibrationLibrary.open();});

fileAnalyzer=new FileAnalysisService({persist:entry=>store.put('sessions',entry),onChange:()=>{fileAnalysisView?.refresh();calibrationLibrary?.refresh();renderExamWorkflow();}});
fileAnalysisView=mountFileAnalysisView({getProfileId:()=>profileId,getSessions:()=>sessions,getJobs:()=>fileAnalyzer.jobs,upload:importAnalysisFiles,analyzeExisting:()=>{const entries=sessions.filter(s=>s.profileId===profileId&&s.blob?.size&&!s.fileAnalysis);if(!entries.length){toast('이 회원의 녹음은 모두 분석되어 있습니다.');return;}for(const entry of entries)queueFullAnalysis(entry);fileAnalysisView.select(entries[0]);},cancel:id=>fileAnalyzer.cancel(id),play:toggleReplaySession,saveLabels:async(entry,annotation)=>{if(fileAnalyzer.jobs.some(j=>j.entry.id===entry.id&&['queued','decoding','analyzing','saving'].includes(j.status)))throw new Error('분석 저장이 끝난 뒤 라벨을 저장해 주세요.');await store.put('sessions',{...entry,annotation});entry.annotation=annotation;},toast,beforePick:prepareAnalysisUpload,onSelectionChange:()=>renderExamWorkflow()});
window.addEventListener('resize',()=>{if(tab==='analyzer')fileAnalysisView?.paint();if(tab==='sessions')memberHistory?.resize();});
participantIntake=mountParticipantIntake({container:$('participantIntake'),getProfiles:()=>profiles,getProfileId:()=>profileId,getSessions:()=>sessions,isLocked:()=>sessionLocked()||busy,isRecording:()=>audioState.recording,commit:commitParticipant,onRecord:startAnalyzerRecording,onChooseFiles:()=>fileAnalysisView?.chooseFiles(),onHistory:async ownerId=>{if(sessionLocked()||busy)throw new Error('진행 중인 검사를 마친 뒤 차트를 열어 주세요.');if(ownerId!==profileId)await changeProfile(ownerId);if(profileId!==ownerId)return;setTab('sessions');requestAnimationFrame(()=>memberHistory?.resize());},onNewParticipant:()=>{fileAnalysisView?.clearSelection();renderExamWorkflow();},onDraftChange:()=>{fileAnalysisView?.clearSelection();renderExamWorkflow();},onError:error=>toast(error.message,true)});
memberHistory=mountMemberHistory({container:$('memberHistory'),getProfileId:()=>profileId,getSessions:()=>sessions,onOpenRecord:entry=>{setTab('analyzer');fileAnalysisView?.select(entry);}});
driveBackup=new DriveBackupService({persist:entry=>store.patch('sessions',entry.id,{franchiseUpload:entry.franchiseUpload,uploadArtifacts:entry.uploadArtifacts},{profileId:entry.profileId}),onChange:()=>{renderSessions();renderDriveStatus();}});
window.addEventListener('online',()=>{if(franchiseContext.practice)return;for(const s of sessions)if(s.uploadArtifacts&&s.franchiseUpload?.state!=='complete')void driveBackup.enqueue(s).catch(e=>toast(e.message,true));});
void checkDriveConnection();
initPro();renderCards();renderTuning();renderTransport();renderSessions();renderTraining();bindCore();setTab('analyzer');requestAnimationFrame(paint);
await (async()=>{
  const identityLabel=document.createElement('strong');identityLabel.className='franchise-profile-name';identityLabel.textContent=franchiseContext.student.name;$('profileSelect').after(identityLabel);
  if(franchiseContext.practice){document.body.classList.add('practice-mode');$('localSaveStatus').textContent='자유 사용 · 기록 안 함';$('saveProfileBtn').textContent='이번 사용에 적용';document.querySelector('.local-badge').textContent='자유 사용 · 기록 안 함';$('backupTopBtn').textContent='개인 튜닝';document.querySelector('#boothPanel .booth-transport > span')?.replaceChildren(document.createTextNode('WAV 24bit · 48 kHz · 현재 화면에서만 분석'));}
  if(franchiseContext.preview){const notice=document.createElement('p');notice.className='franchise-preview-label';notice.textContent='로컬 시안 · 실제 Drive 전송 없음';document.querySelector('.workspace-label')?.after(notice);}
  profiles=(await store.all('profiles')).filter(p=>p.id===franchiseContext.student.id);
  if(!profiles.length){const first={id:franchiseContext.student.id,profile:copy(profile),refs:{},member:{type:'프랜차이즈 학생'},updatedAt:new Date().toISOString()};await store.put('profiles',first);profiles=[first];}
  profileId=franchiseContext.student.id;const entry=profiles[0];profile=sanitizeProfile({...entry.profile,name:franchiseContext.student.name});saved=copy(profile);refs=copy(entry.refs||{});savedRefs=copy(refs);
  sessions=(await store.all('sessions')).filter(s=>s.profileId===profileId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  renderProfileSelect();renderTuning();renderSessions();renderTraining();
  if(entry.calibrationAssessment?.testedRange){$('scalePattern').value='five-ascending';$('scaleRoot').value=String(Math.max(36,Math.min(76,Math.round(entry.calibrationAssessment.testedRange.minMidi))));}
  if(!franchiseContext.practice)for(const s of sessions)if(s.uploadArtifacts&&s.franchiseUpload?.state!=='complete')void driveBackup.enqueue(s).catch(e=>toast(e.message,true));
  for(const s of sessions)if(s.blob?.size&&['queued','decoding','analyzing','saving'].includes(s.analysisStatus))queueFullAnalysis(s);
})();
export async function suspendStudio(){
  studioSuspended=true;studioInputEpoch++;coreGeneration++;loopPlayback=false;document.body.dataset.suspended='true';
  calibrationService?.cancel();calibrationLibrary?.close();await guidedCalibration?.close();stopDemo();scaleTrainer.stop();studioTools?.stopRhythm();cancelCapture();
  if(coreRun||coreStarting)await safe(()=>finishCore(false));
  if(audioState.recording&&!coreRun)return; // Navigation hides UI but keeps the existing examination capture.
  await engine.stopRecording();engine.stop();
  if(recordingSavePromise)await recordingSavePromise;
}
export async function stopBackgroundRecording(){
  await engine.stopRecording();
  if(recordingSavePromise)await recordingSavePromise;
  if(studioSuspended)engine.stop();
}
export function resumeStudio(){
  studioSuspended=false;document.body.dataset.suspended='false';anatomy.resize();
  if(tab==='studio')void ensureAnatomyLoaded();
  studioTools?.resume();studioTools?.paint();
}
export async function shutdownStudio(){
  studioSuspended=true;studioInputEpoch++;coreGeneration++;clearProtectedAssetCache();anatomy.dispose();
  calibrationService?.cancel();calibrationLibrary?.close();await guidedCalibration?.close();stopDemo();scaleTrainer.stop();studioTools?.stopRhythm();
  await engine.destroy();if(recordingSavePromise)await recordingSavePromise;
  for(const job of fileAnalyzer?.jobs||[])fileAnalyzer.cancel(job.id);
  document.querySelectorAll('iframe').forEach(frame=>frame.remove());
}

// Read-only diagnostics make model/data-flow verification reproducible without exposing recordings.
window.touchingVoiceDiagnostics=()=>({tab,selectedLayer,profile:copy(profile),saved:copy(saved),dirty,comparing,levels:{...levels},audio:{...audioState},demo,model:window.__tvModelMetadata,sessionCount:sessions.length});
