import { GUIDED_TASKS, buildGuidedSequence, evaluateGuidedTask, suggestGuidedCalibration } from './guided-calibration.js';
import { createGuidedCalibrationView } from './guided-calibration-view.js';
import { ScaleTrainer } from './scale-trainer.js?v=guided-1';

const clone = value => structuredClone(value);
const noteName = midi => Number.isFinite(midi) ? ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][(Math.round(midi)%12+12)%12] + (Math.floor(Math.round(midi)/12)-1) : '—';
const rangeName = range => range ? `${noteName(range.minMidi)} – ${noteName(range.maxMidi)}` : '아직 확인되지 않음';

/** Prompted acquisition: the coach confirms the vowel; no anatomical or speech classifier is implied. */
export function mountGuidedCalibration({engine,getSnapshot,isBusy,prepareInput,saveTask,applyProfile,onLocks=()=>{},onError=()=>{}}) {
  const dialog=createGuidedCalibrationView(); document.body.append(dialog);
  const el=id=>dialog.querySelector('#'+id);
  let snapshot=null,selected='nas',results={},records={},confirmed={},generation=0,run=null;
  let phase='idle',listening=false,startPending=false,saved=false,closed=true,lastPaint=0,guideState={notes:[],elapsed:0,playing:false};
  const active=()=>phase!=='idle'||listening||startPending;
  const sameOwner=()=>{const current=getSnapshot();return current.profileId===snapshot?.profileId&&JSON.stringify(current.profile)===JSON.stringify(snapshot.profile);};
  const feedback=message=>{el('gcFeedback').textContent=message;};
  const safe=async fn=>{try{await fn();}catch(error){feedback(error?.message||'측정 상태를 확인해 주세요.');onError(error);}};
  const guide=new ScaleTrainer({onState(state){guideState=state;paint();},onFinish(){if(run&&phase==='recording')void safe(finish);else{listening=false;refresh();}}});
  function settings(){return {rootMidi:Number(el('gcRoot').value),bpm:Number(el('gcBpm').value),repeats:Number(el('gcRepeats').value),transposeStep:1,countIn:2};}
  function proposal(){return suggestGuidedCalibration(GUIDED_TASKS.map(t=>results[t.key]).filter(Boolean),snapshot?.profile);}
  function refresh(){
    const locked=active(),task=GUIDED_TASKS.find(t=>t.key===selected),result=results[selected];
    el('gcMember').textContent=snapshot?.profile?.name||'';
    el('gcLayer').textContent=task?.name||({nas:'상인두',oro:'중인두',aes:'하인두',src:'성문'})[selected];
    el('gcVowel').textContent=task?.vowel||'';
    el('gcInstruction').textContent=`5음 상행 · 각 음에 ‘${task?.vowel}’를 편하게 소리 내세요. 힘들면 중지하고 시작 음을 낮춰 주세요.`;
    dialog.querySelectorAll('[data-gc-task]').forEach(button=>{button.disabled=locked;button.classList.toggle('active',button.dataset.gcTask===selected);button.setAttribute('aria-pressed',String(button.dataset.gcTask===selected));button.setAttribute('aria-current',button.dataset.gcTask===selected?'step':'false');});
    for(const task of GUIDED_TASKS)el('gcStatus-'+task.key).textContent=results[task.key]?.accepted?(confirmed[task.key]?'확인 완료':'발음 확인 필요'):results[task.key]?'재측정':'측정 전';
    for(const id of ['gcRoot','gcBpm','gcRepeats','gcHeadphones'])el(id).disabled=locked;
    el('gcListen').disabled=locked;el('gcStart').disabled=locked||!el('gcHeadphones').checked;
    el('gcStart').textContent=result?'이 발성 다시 측정':'측정 시작';el('gcStop').disabled=!locked||phase==='saving';
    el('gcConfirmVowel').disabled=locked||!result?.accepted;el('gcConfirmVowel').checked=!!confirmed[selected];
    el('gcNext').disabled=locked||!result?.accepted||!confirmed[selected];
    const all=GUIDED_TASKS.every(t=>results[t.key]?.accepted&&confirmed[t.key]);
    el('gcApply').disabled=locked||!all||saved;el('gcExport').disabled=locked||!Object.keys(results).length;
    el('gcSaved').textContent=saved?'개인 튜닝을 이 PC에 적용·저장했습니다.':snapshot?.assessment?`이 PC의 최근 측정: ${new Date(snapshot.assessment.createdAt).toLocaleDateString('ko-KR')} · 확인 음역 ${rangeName(snapshot.assessment.testedRange)}`:'현재 학생의 측정과 튜닝을 이 PC에 보관합니다.';
    el('gcTimeline').setAttribute('aria-label',`${task.name} ‘${task.vowel}’ 과제의 목표 음정과 실제 발성 음정${result?` · ${result.completedNotes}/${result.notes.length}음 측정 완료 · 확인 음역 ${rangeName(result.testedRange)}`:''}`);
    renderResult();onLocks();paint();
  }
  function renderResult(){
    const target=el('gcResult');target.replaceChildren();
    const result=results[selected];if(!result)return;
    const summary=document.createElement('p');summary.textContent=`${result.accepted?'측정 완료':'다시 측정해 주세요'} · 확인 음역 ${rangeName(result.testedRange)} · 음성 확보 ${Math.round((result.coverage||0)*100)}% · 목표 음정 ${Math.round((result.pitchAccuracy||0)*100)}%`;target.append(summary);
    if(result.featureRange){const p=document.createElement('p');p.textContent=`3D 반응 범위 제안 ${result.featureRange.inputMin.toFixed(2)} ~ ${result.featureRange.inputMax.toFixed(2)} dB`;target.append(p);}
    for(const warning of result.warnings||[]){const p=document.createElement('p');p.className='gc-warning';p.textContent=warning;target.append(p);}
  }
  function paint(features){
    if(closed)return;
    const target=guideState.targetMidi,actual=features?.valid&&features.f0>0?69+12*Math.log2(features.f0/440):null;
    el('gcTarget').textContent=noteName(target);
    if(features){el('gcActual').textContent=noteName(actual);el('gcCents').textContent=actual!==null&&Number.isFinite(target)?`${Math.round((actual-target)*100)} cent`:'—';}
    el('gcMeter').style.width=`${Math.min(100,(guideState.progress||0)*100)}%`;
    const canvas=el('gcTimeline'),rect=canvas.getBoundingClientRect();if(!rect.width)return;
    const ratio=Math.min(2,devicePixelRatio||1),width=rect.width,height=rect.height||230;
    if(canvas.width!==Math.round(width*ratio)||canvas.height!==Math.round(height*ratio)){canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);}
    const ctx=canvas.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);
    const result=results[selected];
    const recordedSequence=result?{notes:result.notes.map(n=>({midi:n.targetMidi,start:n.start,duration:n.duration})),duration:Math.max(...result.notes.map(n=>n.start+n.duration))}:null;
    const sequence=run?.sequence||recordedSequence||buildGuidedSequence(settings()),notes=sequence.notes;
    const low=Math.min(...notes.map(n=>n.midi))-2,high=Math.max(...notes.map(n=>n.midi))+2;
    const x=t=>48+t/sequence.duration*(width-64),y=m=>height-27-(m-low)/(high-low)*(height-48);
    ctx.font='12px Paperlogy, sans-serif';
    for(let midi=low;midi<=high;midi++){ctx.strokeStyle='#b995ff18';ctx.beginPath();ctx.moveTo(42,y(midi));ctx.lineTo(width,y(midi));ctx.stroke();if(midi%2===0){ctx.fillStyle='#baa7cf';ctx.fillText(noteName(midi),3,y(midi)+4);}}
    notes.forEach(n=>{ctx.fillStyle=guideState.playing&&guideState.elapsed>=n.start&&guideState.elapsed<n.start+n.duration?'#eadac0':'#8757bb';ctx.fillRect(x(n.start),y(n.midi)-6,Math.max(2,x(n.start+n.duration)-x(n.start)-2),12);});
    const samples=run?.samples||[];ctx.strokeStyle='#60d7c9';ctx.lineWidth=2;ctx.beginPath();let connected=false,previousTime=-1;
    for(const sample of samples){const f=sample.features;if(!f.valid||!f.f0){connected=false;continue;}const midi=69+12*Math.log2(f.f0/440);if(midi<low||midi>high){connected=false;continue;}if(connected&&sample.time-previousTime<.2)ctx.lineTo(x(sample.time),y(midi));else ctx.moveTo(x(sample.time),y(midi));connected=true;previousTime=sample.time;}ctx.stroke();
    if(!run&&result){for(const note of result.notes){if(!Number.isFinite(note.medianMidi))continue;ctx.fillStyle=note.accepted?'#60d7c9':'#e3b46b';ctx.beginPath();ctx.arc(x(note.start+note.duration/2),y(note.medianMidi),4,0,Math.PI*2);ctx.fill();}}
    if(guideState.playing){ctx.strokeStyle='#f5eee0aa';ctx.beginPath();ctx.moveTo(x(guideState.elapsed),10);ctx.lineTo(x(guideState.elapsed),height-14);ctx.stroke();}
  }
  function makeRecorder(stream){
    if(!globalThis.MediaRecorder)throw new Error('이 브라우저에서는 녹음할 수 없습니다. Chrome 또는 Edge에서 열어 주세요.');
    const recorder=new MediaRecorder(stream),chunks=[];
    let resolve,reject;const done=new Promise((yes,no)=>{resolve=yes;reject=no;});done.catch(()=>{});
    recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};recorder.onerror=e=>reject(e.error||new Error('기준 음성 녹음에 실패했습니다.'));
    recorder.onstop=()=>resolve(new Blob(chunks,{type:recorder.mimeType||'audio/webm'}));
    recorder.start(250);
    return {recorder,done};
  }
  async function stopRecorder(recording){
    if(!recording)return null;
    if(recording.recorder.state!=='inactive')recording.recorder.stop();
    let timer;try{return await Promise.race([recording.done,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('녹음 마무리를 확인하지 못했습니다. 다시 측정해 주세요.')),6000);})]);}finally{clearTimeout(timer);}
  }
  async function start(){
    if(active()||!el('gcHeadphones').checked)return;
    if(!sameOwner())throw new Error('개인 설정이 바뀌었습니다. 창을 닫고 다시 측정해 주세요.');
    const epoch=++generation;phase='starting';startPending=true;saved=false;feedback('마이크 연결 중 · 권한을 허용해 주세요.');refresh();
    let current;
    try{
      await prepareInput();if(epoch!==generation||closed){engine.stop();return;}
      if(!sameOwner())throw new Error('마이크 연결 중 대상자나 개인 설정이 바뀌었습니다. 창을 닫고 다시 측정해 주세요.');
      if(engine.state.mode!=='mic'||!engine.state.playing)throw new Error('실제 마이크 입력이 필요합니다.');
      current={layerKey:selected,sequence:buildGuidedSequence(settings()),samples:[],recording:makeRecorder(engine.stream),startedAt:performance.now(),epoch};run=current;
      phase='recording';delete results[selected];delete confirmed[selected];delete records[selected];
      const started=await guide.startSequence(current.sequence);
      if(epoch!==generation||closed){await stopRecorder(current.recording);engine.stop();return;}
      if(!started)throw new Error('스케일 가이드가 시작되지 않았습니다. 다시 측정해 주세요.');
      current.guideOffsetSeconds=(performance.now()-current.startedAt)/1000-guide.currentTime;
      feedback(`준비 후 ‘${GUIDED_TASKS.find(t=>t.key===selected).vowel}’로 다섯 음을 따라 하세요.`);refresh();
    }catch(error){if(epoch===generation){phase='idle';run=null;guide.stop();engine.stop();refresh();}if(current)await stopRecorder(current.recording).catch(()=>{});throw error;}
    finally{startPending=false;refresh();}
  }
  async function finish(){
    if(!run||phase!=='recording')return;
    const current=run;phase='finishing';feedback('측정 결과와 원음을 저장하고 있습니다.');refresh();
    try{
      const captureSettings=clone(engine.stream?.getAudioTracks?.()?.[0]?.getSettings?.()||null);
      const blob=await stopRecorder(current.recording);engine.stop();
      if(current.epoch!==generation||closed)return;
      if(!sameOwner())throw new Error('측정 중 대상자나 설정이 바뀌어 적용하지 않았습니다.');
      const result=evaluateGuidedTask({layerKey:current.layerKey,samples:current.samples,sequence:current.sequence,profile:snapshot.profile});
      if(!blob?.size)throw new Error('기준 음성이 비어 있습니다. 다시 측정해 주세요.');
      const record=await saveTask({snapshot:clone(snapshot),result,sequence:current.sequence,samples:current.samples,blob,duration:(performance.now()-current.startedAt)/1000,guideOffsetSeconds:current.guideOffsetSeconds||0,captureSettings});
      if(current.epoch!==generation||closed)return;
      results[current.layerKey]=result;records[current.layerKey]=record;
      feedback(result.accepted?'측정했습니다. 지도사가 안내 발음을 확인한 뒤 다음 영역으로 진행하세요.':'입력 조건이 부족합니다. 아래 안내를 확인하고 이 발성을 다시 측정하세요.');
    }finally{if(current.epoch===generation){phase='idle';run=null;refresh();}}
  }
  async function cancel(){
    ++generation;const current=run;run=null;guide.stop();listening=false;phase='idle';
    const pending=stopRecorder(current?.recording).catch(()=>{});if(current||engine.state.mode==='mic')engine.stop();await pending;
    feedback('측정을 중지했습니다. 완료된 발성 결과는 유지됩니다.');refresh();
  }
  async function close(){if(phase==='saving')return;closed=true;await cancel();dialog.close();onLocks();}
  async function apply(){
    if(active()||saved||!GUIDED_TASKS.every(t=>confirmed[t.key]))return;
    if(!sameOwner())throw new Error('개인 설정이 바뀌었습니다. 다시 측정한 뒤 적용해 주세요.');
    const proposed=proposal();if(!proposed.usable)throw new Error(proposed.warnings.join(' '));
    phase='saving';refresh();
    try{
      const assessment={version:1,protocol:'tv-guided-four-layer-v1',runId:snapshot.runId,createdAt:new Date().toISOString(),profileId:snapshot.profileId,interpretation:'과제별 음향 반응 보정 · 기관 발달 또는 압력의 직접 측정 아님',vowelConfirmation:'instructor',testedRange:proposed.testedRange,results:clone(results),recordIds:Object.fromEntries(Object.entries(records).map(([key,value])=>[key,value.id])),profileBefore:clone(snapshot.profile),profileAfter:clone(proposed.profile)};
      await applyProfile({snapshot:clone(snapshot),profile:proposed.profile,assessment,records:clone(records)});
      saved=true;snapshot={...getSnapshot(),runId:snapshot.runId};feedback('네 영역의 반응 범위를 적용했습니다. 3D 발성체크에서 개인 반응을 확인하세요.');
    }finally{phase='idle';refresh();}
  }
  dialog.querySelectorAll('[data-gc-task]').forEach(button=>button.onclick=()=>{if(active())return;selected=button.dataset.gcTask;refresh();});
  for(const id of ['gcRoot','gcBpm','gcRepeats','gcHeadphones'])el(id).addEventListener('change',refresh);
  el('gcConfirmVowel').onchange=()=>{confirmed[selected]=el('gcConfirmVowel').checked;refresh();};
  el('gcStart').onclick=()=>void safe(start);el('gcStop').onclick=()=>void safe(cancel);el('gcClose').onclick=()=>void safe(close);
  el('gcNext').onclick=()=>{if(active()||!results[selected]?.accepted||!confirmed[selected])return;const index=GUIDED_TASKS.findIndex(t=>t.key===selected);selected=GUIDED_TASKS[Math.min(index+1,3)].key;refresh();};
  el('gcListen').onclick=()=>void safe(async()=>{if(active())return;listening=true;refresh();try{await guide.startSequence(buildGuidedSequence(settings()));feedback('가이드 듣기 · 실제 목소리는 측정하지 않습니다.');}catch(error){listening=false;refresh();throw error;}});
  el('gcApply').onclick=()=>void safe(apply);
  el('gcExport').onclick=()=>{const data={format:'touchingvoice-guided-calibration',version:1,createdAt:new Date().toISOString(),profileId:snapshot.profileId,runId:snapshot.runId,results,confirmed,saved};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='TouchingVoice-four-layer-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  dialog.addEventListener('cancel',event=>{event.preventDefault();void safe(close);});
  return {
    get active(){return active();},
    open(){if(active()||isBusy())throw new Error('진행 중인 녹음이나 훈련을 마친 뒤 개인 튜닝을 시작해 주세요.');snapshot={...clone(getSnapshot()),runId:crypto.randomUUID()};results={};records={};confirmed={};selected='nas';saved=false;closed=false;dialog.showModal();feedback('편한 시작 음을 고르고 이어폰을 착용하세요. 네 발성을 하나씩 측정합니다.');refresh();},
    cancel,close,
    onFrame(frame){if(!run||phase!=='recording'||!guideState.playing)return;let peak=0;for(const value of frame.waveform||[])peak=Math.max(peak,Math.abs(value));run.samples.push({time:guide.currentTime,features:{...frame.features},peak});const now=performance.now();if(now-lastPaint>60){lastPaint=now;paint(frame.features);}},
    onState(state){if(run&&phase==='recording'&&!state.playing){void safe(cancel);feedback('마이크 입력이 중지되어 이번 측정을 취소했습니다.');}},
  };
}
