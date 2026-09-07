/** Local host integration: DAW monitoring + original rhythm game, one member per take. */
export function mountStudioTools({engine,getProfile,getTab,isBusy,isRecordLocked,stopHostInput,onLocks,setTab,onTrainingResult,getLatestRecording,getRecordElapsed,playEntry,downloadEntry,toast,recordToggle,getTrainingAsset=null}) {
  const $=id=>document.getElementById(id), origin=location.origin, frame=$('rhythmFrame');
  let trainingActive=false,rhythmMode=true,latestFrame=null,devicesBusy=false,outputBusy=false,requestEpoch=0,rhythmReady=false;
  const snapshots=new Map(),completed=new Set();
  const notify=()=>{onLocks();paint();};
  const run=async fn=>{try{return await fn();}catch(e){toast(e?.message||'오디오 작업을 완료하지 못했습니다.',true);}};
  const post=(message,transfer=[])=>frame.contentWindow?.postMessage(message,origin,transfer);
  const ensureRhythm=()=>{if(!frame.getAttribute('src')&&frame.dataset.src){rhythmReady=false;frame.src=frame.dataset.src;}};
  const sendProfile=()=>{if(rhythmReady)post({type:'tv-host-profile',...getProfile(),protectedAssets:typeof getTrainingAsset==='function'});};
  let rhythmExpanded=false,returnScroll=null;
  function setRhythmExpanded(expanded){
    expanded=expanded===true&&getTab()==='training'&&rhythmMode&&!document.hidden;
    if(expanded===rhythmExpanded)return;
    if(expanded)returnScroll={left:window.scrollX,top:window.scrollY};
    rhythmExpanded=expanded;document.body.classList.toggle('rhythm-expanded',expanded);
    // Keep both iframes alive: resizing must not interrupt the member's recording.
    if(window.parent!==window)window.parent.postMessage({type:'tv:studio-presentation',expanded},origin);
    if(!expanded&&returnScroll){window.scrollTo({...returnScroll,behavior:'instant'});returnScroll=null;}
  }
  const stopRhythm=()=>{requestEpoch++;setRhythmExpanded(false);post({type:'tv-host-stop'});};
  window.addEventListener('pagehide',()=>{requestEpoch++;setRhythmExpanded(false);});
  const settings=()=>({enabled:$('boothMonitorOn').checked,gainDb:Number($('boothMonitorGain').value),compressor:$('boothCompOn').checked,thresholdDb:Number($('boothThreshold').value),reverb:$('boothReverbOn').checked,mix:Number($('boothMix').value),seconds:Number($('boothReverbSeconds').value),volume:Number($('boothVolume').value)});
  const effectIds=['boothMonitorOn','boothMonitorGain','boothCompOn','boothThreshold','boothReverbOn','boothMix','boothReverbSeconds','boothVolume'];
  function applyEffects(){engine.setMonitorSettings(settings());paint();}
  for(const id of effectIds)$(id).addEventListener('input',()=>run(applyEffects));
  function fillDevices(el,items,label){const previous=el.value;el.replaceChildren();const o=document.createElement('option');o.value='';o.textContent=label;el.append(o);for(const [i,item] of items.entries()){if(!item.deviceId||item.deviceId==='default')continue;const option=document.createElement('option');option.value=item.deviceId;option.textContent=item.label||`장치 ${i+1} · 연결 후 이름 표시`;el.append(option);}if([...el.options].some(o=>o.value===previous))el.value=previous;}
  async function refreshDevices(){if(devicesBusy)return;devicesBusy=true;paint();try{const list=await engine.listDevices();fillDevices($('boothInputSelect'),list.inputs,'시스템 기본 입력');fillDevices($('boothOutputSelect'),list.outputs,'시스템 기본 출력');$('boothOutputSelect').disabled=!list.outputSupported; $('boothOutputSelect').title=list.outputSupported?'헤드폰 출력 장치를 선택합니다.':'이 브라우저는 시스템 기본 출력을 사용합니다.';if(!list.supported)toast('장치 목록을 지원하지 않는 환경입니다.',true);}finally{devicesBusy=false;paint();}}
  $('boothRefreshDevices').onclick=()=>run(refreshDevices);
  $('boothConnectBtn').onclick=()=>run(async()=>{if(isRecordLocked()||trainingActive||isBusy())throw new Error('진행 중인 기록이나 훈련을 마친 뒤 연결하세요.');if(engine.state.mode==='mic'&&engine.state.playing){engine.stop();return;}await stopHostInput();if(isBusy())throw new Error('코칭 화면을 다시 열어 주세요.');await engine.startMic($('boothInputSelect').value);await refreshDevices();if(engine.state.mode==='mic'&&$('boothOutputSelect').value&&engine.monitorStatus.outputSupported)await engine.setOutputDevice($('boothOutputSelect').value);paint();});
  $('boothOutputSelect').onchange=()=>run(async()=>{outputBusy=true;paint();try{await engine.setOutputDevice($('boothOutputSelect').value);}finally{outputBusy=false;paint();}});
  $('boothRecordBtn').onclick=()=>recordToggle();
  $('boothPlayBtn').onclick=()=>run(async()=>{const take=getLatestRecording();if(take)await playEntry(take);});
  $('boothDownloadBtn').onclick=()=>run(async()=>{const take=getLatestRecording();if(take)await downloadEntry(take);});
  $('boothAnalysisBtn').onclick=()=>setTab('analyzer');$('boothArchiveBtn').onclick=()=>setTab('sessions');
  $('boothMRBtn').onclick=()=>{const query=$('boothMRQuery').value.trim();if(!query){$('boothMRQuery').focus();return;}window.open('https://www.youtube.com/results?search_query='+encodeURIComponent(query+' MR'),'_blank','noopener,noreferrer');};
  $('boothMRQuery').onkeydown=e=>{if(e.key==='Enter'){$('boothMRBtn').click();e.preventDefault();}};
  function setTrainingMode(rhythm){rhythmMode=rhythm;if(!rhythm)stopRhythm();$('rhythmWorkspace').hidden=!rhythm;$('quickTraining').hidden=rhythm;$('rhythmModeBtn').setAttribute('aria-selected',String(rhythm));$('quickModeBtn').setAttribute('aria-selected',String(!rhythm));if(rhythm){ensureRhythm();sendProfile();post({type:'tv-host-resume'});}}
  $('rhythmModeBtn').onclick=()=>setTrainingMode(true);$('quickModeBtn').onclick=()=>setTrainingMode(false);
  // The child announces readiness before its iframe load event may fire.
  // Only that handshake starts a new request generation; late DOM load must not cancel its downloads.
  frame.addEventListener('load',()=>{if(rhythmReady)sendProfile();});
  window.addEventListener('message',event=>{
    if(event.origin!==origin||event.source!==frame.contentWindow)return;const message=event.data;if(!message||typeof message.type!=='string')return;
    if(message.type==='tv-rhythm-asset-request'){
      if(typeof message.requestId!=='string'||message.requestId.length>160)return;
      const reply=data=>post({type:'tv-host-asset',requestId:message.requestId,...data},data.bytes?[data.bytes]:[]);
      if(typeof getTrainingAsset!=='function'||message.profileId!==getProfile().profileId||typeof message.assetId!=='string'||!/^[a-z0-9-]{1,100}$/.test(message.assetId)){reply({approved:false,message:'훈련 자료 접근 권한을 확인해 주세요.'});return;}
      const epoch=requestEpoch;
      Promise.resolve().then(()=>getTrainingAsset(message.assetId)).then(bytes=>{
        if(epoch!==requestEpoch||message.profileId!==getProfile().profileId){reply({approved:false,message:'훈련 자료 요청을 취소했습니다.'});return;}
        if(!(bytes instanceof ArrayBuffer)||!bytes.byteLength||bytes.byteLength>8*1024*1024)throw new Error('훈련 자료의 크기를 확인해 주세요.');
        reply({approved:true,bytes});
      }).catch(error=>reply({approved:false,message:error?.message||'훈련 자료를 불러오지 못했습니다.'}));return;
    }
    if(message.type==='tv-rhythm-presentation'){if(typeof message.expanded==='boolean')setRhythmExpanded(message.expanded);return;}
    if(message.type==='tv-rhythm-ready'){requestEpoch++;rhythmReady=true;setRhythmExpanded(false);trainingActive=false;sendProfile();if(getTab()!=='training')stopRhythm();notify();return;}
    if(message.type==='tv-rhythm-request-start')run(async()=>{
      const {requestId,runId}=message;const denied=reason=>post({type:'tv-host-start-ready',requestId,approved:false,message:reason});
      if(getTab()!=='training'||!rhythmMode||document.hidden)return denied('훈련 화면에서 시작해 주세요.');
      if(isRecordLocked()||isBusy())return denied('진행 중인 녹음을 마친 뒤 훈련을 시작해 주세요.');
      if(typeof runId!=='string'||runId.length>120)return denied('훈련 식별 정보를 다시 확인해 주세요.');
      const snapshot=structuredClone(getProfile());if(message.profileId!==snapshot.profileId){sendProfile();return denied('회원이 변경되었습니다. 현재 회원을 확인한 뒤 다시 시작해 주세요.');}
      const epoch=++requestEpoch;trainingActive=true;notify();
      try{await stopHostInput();if(epoch!==requestEpoch||getTab()!=='training'||!rhythmMode||document.hidden){trainingActive=false;notify();return denied('훈련 시작을 취소했습니다.');}snapshots.set(runId,snapshot);if(snapshots.size>30)snapshots.delete(snapshots.keys().next().value);post({type:'tv-host-start-ready',requestId,approved:true,...snapshot});$('rhythmStatus').textContent=message.mode==='demo'?'미리 듣기 · 회원 기록에 포함하지 않습니다':`${snapshot.profileName} · 훈련 입력 사용 중`;}
      catch(e){trainingActive=false;notify();denied(e.message||'입력을 준비하지 못했습니다.');}
    });
    if(message.type==='tv-rhythm-state'){trainingActive=Boolean(message.active);if(!trainingActive){setRhythmExpanded(false);$('rhythmStatus').textContent='곡을 선택해 시작하세요';sendProfile();}notify();}
    if(message.type==='tv-rhythm-result')run(async()=>{
      const snapshot=snapshots.get(message.runId),result=message.result;if(!snapshot||completed.has(message.runId)||!result)return;
      if(message.profileId!==snapshot.profileId||result.mode!=='voice')return;
      const duration=Number(result.duration??result.elapsed);if(!Number.isFinite(duration)||duration<=0||duration>7200)return;
      completed.add(message.runId);snapshots.delete(message.runId);
      await onTrainingResult({...message,voiceMetrics:message.voiceMetrics||result.voiceMetrics},snapshot);notify();
    });
  });
  function paint(){
    const s=engine.state,live=s.mode==='mic'&&s.playing,monitor=engine.monitorStatus;
    const set=(id,value)=>{if($(id).textContent!==value)$(id).textContent=value;};
    const seconds=s.recording?getRecordElapsed():engine.currentTime;
    set('boothTime',`${String(Math.floor(seconds/60)||0).padStart(2,'0')}:${String(Math.floor(seconds%60)||0).padStart(2,'0')}`);
    set('boothSource',s.recording?'REC · 원음 녹음 중':live?'마이크 연결됨 · '+(monitor.active?'헤드폰 모니터 ON':'모니터 OFF'):s.mode==='file'?'녹음 재생 · '+(s.fileName||'파일'):'마이크 연결 전');
    $('boothConnectBtn').disabled=isRecordLocked()||trainingActive||isBusy()||devicesBusy;set('boothConnectBtn',live?'마이크 연결 해제':'선택한 마이크 연결');
    $('boothInputSelect').disabled=live||isRecordLocked()||trainingActive||isBusy();$('boothRefreshDevices').disabled=devicesBusy;
    $('boothOutputSelect').disabled=outputBusy||!monitor.outputSupported; $('boothMonitorOn').disabled=!live||!monitor.supported;
    $('boothMonitorOn').checked=monitor.settings.enabled;
    set('boothGainValue',`${monitor.settings.gainDb} dB`);set('boothThresholdValue',`${monitor.settings.thresholdDb} dB`);set('boothMixValue',`${Math.round(monitor.settings.mix*100)}%`);set('boothReverbValue',`${monitor.settings.seconds.toFixed(1)} s`);set('boothVolumeValue',`${Math.round(monitor.settings.volume*100)}%`);set('boothReduction',`${monitor.gainReductionDb.toFixed(1)} dB`);
    $('boothRecordBtn').disabled=!live||trainingActive||isBusy();$('boothRecordBtn').classList.toggle('recording',s.recording);set('boothRecordBtn',s.recording?'■ 녹음 종료 · 저장':'● 녹음 시작');
    const take=getLatestRecording();set('boothPlayBtn',s.mode==='file'&&s.playing?'재생 일시정지':'최근 음원 재생');$('boothPlayBtn').disabled=!take||isRecordLocked()||trainingActive||isBusy();$('boothDownloadBtn').disabled=!take;set('boothLastTake',take?`${take.name} · ${new Date(take.createdAt).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}`:'첫 테이크를 녹음해 보세요.');
    set('boothTakeNote',take?`${Math.round(take.duration||0)}초 · ${take.voiceMetrics?'음향 지표 저장됨':'원음 보관'} · ${take.unsaved?'기기 저장 실패':'이 회원의 기록에 저장됨'}`:'녹음 종료 → 음향 지표 저장 → 회원별 전후 비교');
    const f=s.playing?latestFrame?.features:null,db=f?.level;set('boothLevel',Number.isFinite(db)&&db>-119?`${db.toFixed(1)} dBFS`:'— dBFS');$('boothMeter').style.width=(Number.isFinite(db)?Math.max(0,Math.min(100,(db+60)/60*100)):0)+'%';$('boothClip').hidden=!(f?.rms>=.99||latestFrame?.waveform?.some(v=>Math.abs(v)>=.999));
    if(getTab()==='analyzer'||getTab()==='booth')drawBooth(s.playing?latestFrame?.waveform:null,s.recording);
  }
  function drawBooth(wave,recording){const canvas=$('boothWave'),w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;const scale=Math.min(devicePixelRatio||1,2);if(canvas.width!==Math.round(w*scale)||canvas.height!==Math.round(h*scale)){canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);}const c=canvas.getContext('2d');if(!c)return;c.setTransform(scale,0,0,scale,0,0);c.clearRect(0,0,w,h);c.strokeStyle=recording?'#f599cd':'#bc93ff';c.lineWidth=1.4;c.beginPath();for(let x=0;x<w;x++){const sample=wave?.length?wave[Math.floor(x/w*wave.length)]:0,y=h/2+sample*h*.45;x?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();if(!wave){c.fillStyle='#8e759f';c.font='12px Paperlogy';c.textAlign='center';c.fillText('마이크를 연결하면 원음 파형이 표시됩니다.',w/2,h/2-18);}}
  return {resume(){sendProfile();if(frame.getAttribute('src'))post({type:'tv-host-resume'});},get trainingActive(){return trainingActive;},onFrame(frame){latestFrame=frame;},paint,profileChanged(){latestFrame=null;sendProfile();paint();},beforeTabChange(next){if(next==='training'){ensureRhythm();sendProfile();post({type:'tv-host-resume'});}else stopRhythm();if(next!=='booth'&&next!=='analyzer'&&engine.monitorSettings.enabled)engine.setMonitorSettings({enabled:false});},stopRhythm};
}
