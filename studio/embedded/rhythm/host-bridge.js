/* Training Studio <-> original rhythm v4. No member writes occur in this frame. */
const hostBridge = (() => {
  const embedded = window.parent !== window;
  const origin = location.origin;
  let profile = Object.freeze({profileId:null,profileName:''});
  const requests = new Map();
  const assetRequests = new Map();
  const profileWaiters = new Set();
  const production = typeof rhythmAccess !== 'undefined' ? rhythmAccess.production : !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(origin);
  let profileReceived = false;
  let protectedAssets = false;
  let stopPromise = null;
  let grantedRunId = null;
  let metricsModules = null;
  const post = (type, payload = {}) => {
    if (embedded && origin !== 'null') window.parent.postMessage({type,...payload},origin);
  };
  const abort = () => new DOMException('시작 요청 취소','AbortError');
  const accessError = () => new Error('로그인 후 코칭 스튜디오에서 회원을 선택해 주세요.');
  const authorized = () => !production || (embedded && profileReceived && protectedAssets && Boolean(profile.profileId));
  function waitForProfile() {
    if (!production || authorized()) return Promise.resolve();
    if (!embedded || profileReceived) return Promise.reject(accessError());
    return new Promise((resolve,reject) => {
      const waiter = {resolve,reject,timer:setTimeout(() => {profileWaiters.delete(waiter);reject(accessError());},10000)};
      profileWaiters.add(waiter);
    });
  }
  function cancelAssetRequests(cancelWaiters=true) {
    for (const request of assetRequests.values()) {clearTimeout(request.timer);request.reject(abort());}
    assetRequests.clear();
    if(cancelWaiters){for (const waiter of profileWaiters) {clearTimeout(waiter.timer);waiter.reject(abort());}profileWaiters.clear();}
  }
  async function readAsset(assetId) {
    await waitForProfile();
    if(stopPromise)throw abort();
    if (!embedded || !protectedAssets || !profile.profileId || !/^[a-z0-9-]+-(?:midi|audio)$/.test(assetId)) throw accessError();
    const requestId = 'asset-' + (crypto.randomUUID?.() || Date.now()+'-'+Math.random().toString(36).slice(2));
    return new Promise((resolve,reject) => {
      const timer=setTimeout(() => {assetRequests.delete(requestId);reject(new Error('트랙 연결 시간이 초과됐습니다. 다시 선택해 주세요.'));},120000);
      assetRequests.set(requestId,{resolve,reject,timer,profileId:profile.profileId});
      post('tv-rhythm-asset-request',{requestId,assetId,profileId:profile.profileId});
    });
  }
  function snapshot(mode) {
    return {runId:'rhythm-'+(crypto.randomUUID?.() || Date.now()+'-'+Math.random().toString(36).slice(2)),
      profileId:profile.profileId,profileName:profile.profileName,mode,startedAt:new Date().toISOString()};
  }
  function stateChanged(phase) {
    const s = state.session;
    const active = Boolean(state.starting || state.finalizing || s || challenge.requesting || challenge.stream || stopPromise);
    post('tv-rhythm-state',{active,phase:phase || (s?.status || (state.starting?'starting':challenge.stream?'camera-preview':'idle')),
      mode:s?.mode || state.mode,runId:s?.hostRun?.runId || grantedRunId,
      profileId:s?.hostRun?.profileId || profile.profileId});
  }
  async function requestStart(run, purpose = 'play') {
    if (!authorized()) throw accessError();
    if (!embedded) return run;
    if (origin === 'null') throw new Error('Training Studio와 같은 localhost 주소에서 열어 주세요.');
    const requestId = run.runId+'-'+Date.now().toString(36);
    const granted = await new Promise((resolve,reject) => {
      const timer = setTimeout(() => {requests.delete(requestId);reject(new Error('Training Studio 연결을 확인한 뒤 다시 시작해 주세요.'));},10000);
      requests.set(requestId,{resolve,reject,timer});
      post('tv-rhythm-request-start',{requestId,runId:run.runId,mode:run.mode,purpose,profileId:run.profileId,profileName:run.profileName});
    });
    grantedRunId = run.runId;
    run.profile = granted.profile || null;
    run.refs = granted.refs || null;
    // The owner is frozen before permission, never taken from a later profile message.
    post('tv-rhythm-state',{active:true,phase:'starting',mode:run.mode,runId:run.runId,profileId:run.profileId});
    return run;
  }
  function cancelRequests() {
    for (const request of requests.values()) {clearTimeout(request.timer);request.reject(abort());}
    requests.clear();
  }
  async function prepareMetrics(run) {
    if (run.mode !== 'voice') return;
    try {
      metricsModules ||= Promise.all([import('../../src/audio.js'),import('../../src/pro-metrics.js')]);
      const [audio,metrics] = await metricsModules;
      run.analyzeFrame = audio.analyzeFrame;
      run.accumulator = metrics.createVoiceMetricsAccumulator({...(run.profile?{profile:run.profile}:{}),profileId:run.profileId});
    } catch (error) {console.warn('실제 음향 분석 모듈을 불러오지 못했습니다.',error);}
  }
  function attachMicrophone(session) {
    if (session.mode !== 'voice' || !state.micStream) return;
    const run = session.hostRun;
    run.pitchSamples=[];
    if (run.accumulator) {
      run.rawSource = state.audioCtx.createMediaStreamSource(state.micStream);
      run.rawAnalyser = state.audioCtx.createAnalyser();run.rawAnalyser.fftSize=4096;
      run.rawAnalyser.smoothingTimeConstant=0;
      run.waveform=new Float32Array(4096);run.spectrum=new Float32Array(2048);
      run.rawSource.connect(run.rawAnalyser);
    }
    if (typeof MediaRecorder !== 'function') return;
    try {
      const mime = ['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t));
      const recorder = new MediaRecorder(new MediaStream(state.micStream.getAudioTracks()),mime?{mimeType:mime}:undefined);
      const chunks=[];let bytes=0;let resolve;
      run.rawRecorder=recorder;run.audioPromise=new Promise(done=>{resolve=done});
      let finalized=false;
      const finish=()=>{if(finalized)return;finalized=true;clearTimeout(run.audioStopTimer);resolve(chunks.length?new Blob(chunks,{type:recorder.mimeType||chunks[0].type}):null);};
      recorder.ondataavailable=event=>{if(event.data?.size){bytes+=event.data.size;if(bytes<=48*1024*1024)chunks.push(event.data);else if(recorder.state!=='inactive'){run.audioTruncated=true;recorder.stop();}}};
      recorder.onstop=finish;recorder.onerror=()=>{run.audioError=true;if(recorder.state!=='inactive'){try{recorder.stop();}catch{finish();}}else finish();};
      run.finishRaw=finish;
      // Start at the actual track downbeat in sample(), after the countdown.
    } catch(error) {run.audioError=true;console.warn('목소리 파일 녹음 미지원',error);}
  }
  function sample(session,detected,target,timeline,raw) {
    const run=session.hostRun;if(!run || session.mode!=='voice')return;
    if(run.rawRecorder && !run.rawStarted){try{run.rawRecorder.start(1000);run.rawStarted=true;}catch{run.audioError=true;run.finishRaw?.();}}
    if(run.pitchSamples.length<20000) run.pitchSamples.push({t:Math.max(0,raw),hz:detected.hz||null,rms:detected.rms,confidence:detected.confidence,
      targetMidi:target?.midi ?? null,cents:target&&detected.hz?pitchDifference(detected.hz,target.midi):null});
    if(run.rawAnalyser){try{
      run.rawAnalyser.getFloatTimeDomainData(run.waveform);run.rawAnalyser.getFloatFrequencyData(run.spectrum);
      run.accumulator.add({features:run.analyzeFrame(run.waveform,run.spectrum,state.audioCtx.sampleRate)});
    }catch(error){if(!run.metricsError)console.warn('음향 프레임 분석 오류',error);run.metricsError=true;}}
  }
  function pause(session) {const r=session?.hostRun?.rawRecorder;if(r?.state==='recording'){try{r.pause();}catch{}}stateChanged('paused');}
  function resume(session) {const r=session?.hostRun?.rawRecorder;if(r?.state==='paused'){try{r.resume();}catch{}}stateChanged('playing');}
  function stopRaw(session) {
    const run=session?.hostRun;if(!run)return Promise.resolve(null);
    try{run.rawSource?.disconnect();run.rawAnalyser?.disconnect();}catch{}
    if(!run.rawRecorder)return Promise.resolve(null);
    if(!run.rawStarted){run.finishRaw?.();return run.audioPromise;}
    if(run.rawRecorder.state!=='inactive'){try{run.rawRecorder.stop();}catch{run.finishRaw?.();}}
    // Browser failures must not keep the user's input locked forever.
    run.audioStopTimer=setTimeout(()=>run.finishRaw?.(),4000);
    return run.audioPromise;
  }
  function publishResult(session,result,audioBlob) {
    const run=session.hostRun;
    if(!run || session.mode!=='voice' || !run.profileId || result.duration<=0)return;
    if(run.sent)return;run.sent=true;
    const samples=run.pitchSamples || [], voiced=samples.filter(s=>s.hz>0), errors=voiced.filter(s=>Number.isFinite(s.cents));
    const pitchMetrics={totalFrames:samples.length,voicedFrames:voiced.length,
      meanHz:voiced.length?voiced.reduce((n,s)=>n+s.hz,0)/voiced.length:null,
      minHz:voiced.length?Math.min(...voiced.map(s=>s.hz)):null,maxHz:voiced.length?Math.max(...voiced.map(s=>s.hz)):null,
      meanAbsoluteCents:errors.length?errors.reduce((n,s)=>n+Math.abs(s.cents),0)/errors.length:null};
    const voiceMetrics=run.accumulator?.finalize() || null;
    post('tv-rhythm-result',{profileId:run.profileId,profileName:run.profileName,runId:run.runId,
      audioBlob:audioBlob?.size?audioBlob:null,voiceMetrics,
      result:{...result,track:{id:session.track.id,name:session.track.name,category:session.track.category},
        trackId:session.track.id,trackTitle:session.track.name,trackCategory:session.track.category,
        profileId:run.profileId,profileName:run.profileName,runId:run.runId,
        startedAt:run.startedAt,endedAt:new Date().toISOString(),completed:!result.partial,
        durationSeconds:result.duration,plannedDuration:session.totalDuration,
        pitchMetrics,pitchSamples:samples,voiceMetrics,audioRecorded:Boolean(audioBlob?.size),audioTruncated:Boolean(run.audioTruncated)}});
  }
  function stop(reason='host-stop') {
    if(typeof rhythmPresentation!=='undefined')rhythmPresentation.collapse();
    if(stopPromise)return stopPromise;
    cancelRequests();cancelAssetRequests();state.startToken=(state.startToken||0)+1;state.starting=false;state.hostReturnToLibrary=true;
    $('cancelStart').hidden=true;$('clipPreview').pause();
    stopPromise=Promise.resolve().then(async()=>{
      if(state.finishPromise) await state.finishPromise;
      else if(state.session) await finishGame(true,{returnToLibrary:true});
      else {stopMicrophone();stopChallengeCamera(true);}
      if(state.audioCtx?.state==='running') await state.audioCtx.suspend();
      $('savedClipsOverlay').classList.remove('on');showScreen('libraryScreen');refreshChallengeUI();
    }).finally(()=>{stopPromise=null;state.hostReturnToLibrary=false;grantedRunId=null;setStartReady(Boolean(state.asset));stateChanged(reason);});
    return stopPromise;
  }
  window.addEventListener('message',event=>{
    if(!embedded || event.source!==window.parent || origin==='null' || event.origin!==origin)return;
    const message=event.data;if(!message || typeof message!=='object')return;
    if(message.type==='tv-host-profile'){
      const previousId=profile.profileId;
      profile=Object.freeze({profileId:typeof message.profileId==='string'?message.profileId:null,profileName:typeof message.profileName==='string'?message.profileName:''});
      profileReceived=true;protectedAssets=message.protectedAssets===true;
      if (previousId!==profile.profileId || !authorized()) cancelAssetRequests(false);
      if(typeof rhythmAccess!=='undefined')rhythmAccess.setAuthorized(authorized());
      for(const waiter of profileWaiters){clearTimeout(waiter.timer);authorized()?waiter.resolve():waiter.reject(accessError());}profileWaiters.clear();
      if((previousId!==profile.profileId || !authorized()) && typeof clearHostMemberView==='function')clearHostMemberView();
      if(!authorized())void stop('host-unauthorized');
      const label=document.getElementById('hostProfileLabel');if(label)label.textContent=profile.profileName?'현재 회원 · '+profile.profileName:'회원을 선택해 주세요';
      refreshSavedClipsButton();
    } else if(message.type==='tv-host-asset'){
      const request=assetRequests.get(message.requestId);if(!request)return;
      assetRequests.delete(message.requestId);clearTimeout(request.timer);
      if(!authorized() || request.profileId!==profile.profileId || message.approved!==true)request.reject(new Error(message.message || message.error || '트랙에 접근할 수 없습니다.'));
      else if(Object.prototype.toString.call(message.bytes)!=='[object ArrayBuffer]' || message.bytes.byteLength<=0 || message.bytes.byteLength>8*1024*1024)request.reject(new Error('트랙 데이터 형식 또는 크기가 올바르지 않습니다.'));
      else request.resolve(message.bytes);
    } else if(message.type==='tv-host-start-ready'){
      const request=requests.get(message.requestId);if(!request)return;
      requests.delete(message.requestId);clearTimeout(request.timer);
      if(message.approved===false)request.reject(new Error(message.message || 'Training Studio에서 입력 작업을 마친 뒤 시작해 주세요.'));
      else request.resolve(message);
    } else if(message.type==='tv-host-resume'){
      if(authorized())void Promise.resolve(stopPromise).then(()=>{if(!authorized()||state.asset||state.session||state.starting)return;if(state.selected)void selectTrack(state.selected);else if(!state.catalog?.length)void initCatalog().catch(()=>{});});
    } else if(message.type==='tv-host-stop'){void stop(message.reason || 'host-stop');}
  });
  return {embedded,snapshot,requestStart,prepareMetrics,attachMicrophone,sample,pause,resume,stopRaw,publishResult,stateChanged,cancelRequests,stop,readAsset,waitForProfile,
    get protectedAssets(){return protectedAssets;},get production(){return production;},get authorized(){return authorized();},
    presentation(expanded){post('tv-rhythm-presentation',{expanded:Boolean(expanded)});},
    get profileId(){return profile.profileId;},get stopping(){return Boolean(stopPromise);},ready(){post('tv-rhythm-ready',{version:1});stateChanged();}};
})();
