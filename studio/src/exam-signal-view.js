import {writeSpectrogramColor} from './spectrogram-palette.js?v=exam-spectrum-20261117';
import {frequencyAt} from './exam-spectrogram-worker.js?v=exam-spectrum-20261117';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const clock=t=>`${Math.floor(t/60)}:${(t%60).toFixed(2).padStart(5,'0')}`;

/** Local visualization and independent source playback. No analysis results,
 * profiles, learning labels, 3D targets or network uploads are written here. */
export function mountExamSignalView({anchor,beforePlay=()=>{},isLocked=()=>false,onPlaybackChange=()=>{}}){
 const host=document.createElement('section');host.className='exam-signal';host.hidden=true;
 host.innerHTML=`<div class="exam-signal-head"><h3>파형 · RX 스타일 스펙트로그램</h3><div class="exam-signal-tools"><button type="button" data-action="all">전체 보기</button><button type="button" data-action="expand">확대 보기</button><details><summary>표시</summary><div class="exam-signal-settings"><label>하한 Hz<input data-setting="low" type="number" min="20" max="18000" step="10" value="100"></label><label>상한 Hz<input data-setting="high" type="number" min="200" max="24000" step="100" value="12000"></label><label>주파수 축<select data-setting="scale"><option value="log">로그</option><option value="linear">선형</option></select></label><p>표시 범위만 변경합니다. 원음과 분석값은 그대로입니다. 파랑 → 초록 → 빨강 → 흰색, −100~0dB 표시. FFT4096 · 보기 폭에 따라 시간 표본화.</p></div></details></div></div><div class="exam-signal-plots"><div class="exam-signal-plot"><canvas id="examSignalWave" tabindex="0" aria-label="오디오 파형: 클릭 탐색, 드래그 구간 선택, Space 재생 또는 일시정지"></canvas><span>파형</span></div><div class="exam-signal-split" role="separator" tabindex="0" aria-label="파형과 스펙트로그램 높이 조절" aria-orientation="horizontal" aria-valuemin="15" aria-valuemax="70" aria-valuenow="30"></div><div class="exam-signal-plot"><canvas id="examSignalSpectrum" tabindex="0" aria-label="RX 스타일 스펙트로그램: 클릭 탐색, 드래그 구간 선택, Space 재생 또는 일시정지"></canvas><span>RX 스타일</span></div></div><div class="exam-signal-foot"><output data-time>—</output><span data-axis>100–12,000 Hz · 로그축</span></div><p class="exam-signal-status" role="status"></p>`;
 anchor.before(host);const home=document.createComment('signal-view-home');host.before(home);
 const q=s=>host.querySelector(s),wave=q('#examSignalWave'),spectrum=q('#examSignalSpectrum'),plots=q('.exam-signal-plots'),status=q('.exam-signal-status'),time=q('[data-time]'),axis=q('[data-axis]'),split=q('.exam-signal-split');
 const audio=document.createElement('audio');audio.preload='metadata';
 let entry=null,sourceURL=null,worker=null,epoch=0,request=0,ready=false,renderPending=false,decodeFailed=false,duration=0,sampleRate=48000,channelCount=0,envelope=null,raster=null,view=[0,1],selection=null,low=100,high=12000,scale='log',active=true,live=false,liveTime=0,liveColumns=0;
 let frame=0,renderTimer=0,drag=null,splitDrag=false,transportPending=false,staticKey='',cachedWave=null;
 const liveImage=document.createElement('canvas');liveImage.width=360;liveImage.height=256;
 let liveMin=[],liveMax=[];
 const dialog=document.createElement('dialog');dialog.className='exam-signal-dialog';dialog.setAttribute('aria-label','파형과 스펙트로그램 확대');document.body.append(dialog);
 function settings(){return {low,high,scale};}
 function axisText(){axis.textContent=`${low.toLocaleString()}–${Math.round(high).toLocaleString()} Hz · ${scale==='log'?'로그':'선형'} · ${live?'실시간 입력':channelCount>1?'채널 전력 평균 · 원채널 재생':'모노'}${raster?.timeStep?' · 시간 간격 '+raster.timeStep.toFixed(3)+'초':''}`;}
 function stopFrame(){cancelAnimationFrame(frame);frame=0;}
 function pause(){audio.pause();stopFrame();draw();}
 function release(){epoch++;request++;worker?.terminate();worker=null;ready=false;renderPending=false;decodeFailed=false;clearTimeout(renderTimer);pause();audio.removeAttribute('src');audio.load();if(sourceURL)URL.revokeObjectURL(sourceURL);sourceURL=null;envelope=null;raster=null;cachedWave=null;selection=null;staticKey='';}
 function showMessage(message){status.textContent=message;}
 function requestRaster(){clearTimeout(renderTimer);if(!ready||live)return;renderPending=true;const id=++request;showMessage('스펙트로그램 표시 갱신 중…');renderTimer=setTimeout(()=>{
  worker.postMessage({type:'render',id,options:{start:view[0],end:view[1],...settings(),width:clamp(spectrum.clientWidth||1000,320,1600),height:clamp(spectrum.clientHeight||256,128,512)}});
 },100);}
 async function setEntry(next){
  if(next?.id===entry?.id&&next?.blob===entry?.blob&&!live)return;
  release();entry=next||null;live=false;duration=Number(next?.duration||next?.fileAnalysis?.duration)||0;host.hidden=!next;view=[0,duration||1];
  if(!next){showMessage('');return;}
  const report=next.fileAnalysis;
  if(report?.waveform?.length)envelope={min:Float32Array.from(report.waveform,p=>p.min),max:Float32Array.from(report.waveform,p=>p.max)};
  if(!next.blob?.size){showMessage('원음이 이 브라우저에 없어 스펙트로그램과 재생을 준비할 수 없습니다. 저장된 파형은 유지합니다.');draw();return;}
  sourceURL=URL.createObjectURL(next.blob);audio.src=sourceURL;draw();
  if(report?.sampleCount*(report.decodedChannels||1)*4>128*1024*1024){showMessage('큰 파일은 저장된 전체 파형과 재생을 제공합니다. 표시용 PCM 128MiB 제한으로 정밀 스펙트로그램은 생략합니다.');return;}
  const token=epoch;showMessage('브라우저에서 파형·스펙트로그램 준비 중…');
  try{
   const bytes=await next.blob.arrayBuffer();if(token!==epoch)return;
   const Ctor=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;
   if(!Ctor)throw Error('이 브라우저는 스펙트로그램 디코딩을 지원하지 않습니다.');
   const context=new Ctor(1,1,48000),buffer=await context.decodeAudioData(bytes);if(token!==epoch)return;
   if(buffer.length*buffer.numberOfChannels*4>128*1024*1024)throw Error('표시용 PCM 128MiB 제한: 전체 파형·원음 재생은 유지합니다.');
   duration=buffer.duration;sampleRate=buffer.sampleRate;channelCount=buffer.numberOfChannels;view=[0,duration];high=Math.min(+q('[data-setting=high]').value,sampleRate/2);low=Math.min(+q('[data-setting=low]').value,high-1);
   const channels=Array.from({length:channelCount},(_,i)=>buffer.getChannelData(i).slice());
   worker=new Worker(new URL('./exam-spectrogram-worker.js?v=exam-spectrum-20261117',import.meta.url),{type:'module'});
   worker.onerror=()=>{if(token===epoch)showMessage('스펙트로그램을 준비하지 못했습니다. 원음 재생과 저장된 결과는 유지됩니다.');};
   worker.onmessage=({data:m})=>{if(token!==epoch)return;
    if(m.type==='ready'){envelope=m.wave;ready=true;requestRaster();draw();}
    if(m.type==='raster'&&m.id===request){renderPending=false;const image=document.createElement('canvas');image.width=m.width;image.height=m.height;image.getContext('2d').putImageData(new ImageData(m.rgba,m.width,m.height),0,0);raster={...m,image};axisText();showMessage('클릭: 선택 해제·탐색 · 드래그: 구간 선택 · Space: 재생/일시정지 · 휠: 시간 확대 · Shift+휠: 이동');draw();}
    if(m.type==='error')showMessage(m.message);
   };worker.postMessage({type:'init',id:++request,channels,sampleRate},channels.map(c=>c.buffer));axisText();
  }catch(e){if(token===epoch){decodeFailed=true;showMessage('표시 준비 실패 · '+e.message);}}
 }
 function size(canvas){const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return null;const d=Math.min(devicePixelRatio||1,2),w=Math.round(r.width*d),h=Math.round(r.height*d);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}const ctx=canvas.getContext('2d');ctx.setTransform(d,0,0,d,0,0);return {ctx,w:r.width,h:r.height};}
 function draw(){if(!active||host.hidden)return;axisText();const a=size(wave),b=size(spectrum);if(!a||!b)return;const total=live?Math.max(.001,view[1]-view[0]):duration;
  const env=live?{min:liveMin,max:liveMax}:envelope;
  const key=[a.w,a.h,...view,live?liveTime:'file'].join(':');
  if(env&&(key!==staticKey||!cachedWave)){
   cachedWave=document.createElement('canvas');cachedWave.width=wave.width;cachedWave.height=wave.height;const c=cachedWave.getContext('2d'),d=wave.width/a.w;c.setTransform(d,0,0,d,0,0);c.strokeStyle='#ac94db';c.lineWidth=1;c.beginPath();
   for(let x=0;x<a.w;x++){const first=live?Math.floor(x/a.w*env.min.length):Math.floor((view[0]+x/a.w*(view[1]-view[0]))/total*env.min.length),last=live?Math.ceil((x+1)/a.w*env.min.length):Math.ceil((view[0]+(x+1)/a.w*(view[1]-view[0]))/total*env.min.length);let min=0,max=0;for(let i=Math.max(0,first);i<Math.min(env.min.length,Math.max(first+1,last));i++){min=Math.min(min,env.min[i]);max=Math.max(max,env.max[i]);}c.moveTo(x,a.h*.5-max*a.h*.42);c.lineTo(x,a.h*.5-min*a.h*.42);}c.stroke();staticKey=key;
  }
  a.ctx.clearRect(0,0,a.w,a.h);if(cachedWave)a.ctx.drawImage(cachedWave,0,0,a.w,a.h);b.ctx.clearRect(0,0,b.w,b.h);
  if(live&&liveColumns)b.ctx.drawImage(liveImage,360-liveColumns,0,liveColumns,256,0,0,b.w,b.h);
  else if(raster){const x=(raster.start-view[0])/(view[1]-view[0])*b.w,w=(raster.end-raster.start)/(view[1]-view[0])*b.w;b.ctx.drawImage(raster.image,x,0,w,b.h);}
  for(const item of [a,b]){const {ctx,w,h}=item;const x=t=>(t-view[0])/(view[1]-view[0])*w;if(selection){ctx.fillStyle='#a879ff35';ctx.fillRect(x(selection[0]),0,x(selection[1])-x(selection[0]),h);ctx.strokeStyle='#c7a1ff';ctx.strokeRect(x(selection[0]),0,x(selection[1])-x(selection[0]),h);}const pos=live?liveTime:audio.currentTime;ctx.fillStyle='#fff';ctx.fillRect(x(pos),0,1.5,h);ctx.font='11px sans-serif';ctx.fillStyle='#cfc0dc';for(let i=0;i<=4;i++)ctx.fillText(clock(view[0]+i/4*(view[1]-view[0])),clamp(i*w/4,4,w-54),h-5);}
  let last=Infinity;for(const hz of [100,300,1000,2000,4000,6000,8000,12000,20000])if(hz>=low&&hz<=high){const y=(scale==='log'?Math.log(high/hz)/Math.log(high/low):(high-hz)/(high-low))*b.h;if(last-y>17){b.ctx.fillStyle='#fff';b.ctx.font='11px sans-serif';b.ctx.fillText((hz>=1000?hz/1000+'k':hz)+' Hz',6,clamp(y,14,b.h-20));last=y;}}
  time.textContent=live?'실시간 · 최근 화면 (약 '+(view[1]-view[0]).toFixed(1)+'초)':`${clock(audio.currentTime)} / ${clock(duration)}${selection?' · 선택 '+clock(selection[0])+'–'+clock(selection[1]):''}`;
  host.dataset.selection=selection?JSON.stringify(selection):'';host.dataset.view=JSON.stringify(view);host.dataset.mode=live?'live':'file';
 }
 function tick(){frame=0;if(!active){pause();return;}if(selection&&audio.currentTime>=selection[1])audio.pause();draw();if(!audio.paused)frame=requestAnimationFrame(tick);}
 async function togglePlayback(){if(live||!entry?.blob?.size||isLocked()||transportPending)return;transportPending=true;const token=epoch;
  try{if(!audio.paused)pause();else{await beforePlay();if(token!==epoch)return;if(selection&&(audio.currentTime<selection[0]||audio.currentTime>=selection[1]))audio.currentTime=selection[0];if(audio.currentTime>=duration-.005)audio.currentTime=selection?.[0]||0;await audio.play();if(token!==epoch){audio.pause();return;}stopFrame();frame=requestAnimationFrame(tick);}}catch(e){showMessage('재생하지 못했습니다 · '+e.message);}finally{transportPending=false;}
 }
 audio.addEventListener('play',onPlaybackChange);audio.addEventListener('pause',()=>{stopFrame();draw();onPlaybackChange();});audio.addEventListener('ended',()=>{stopFrame();draw();onPlaybackChange();});audio.addEventListener('seeked',draw);audio.addEventListener('loadedmetadata',()=>{if(!duration&&Number.isFinite(audio.duration)){duration=audio.duration;view=[0,duration];}draw();});audio.addEventListener('error',()=>{if(audio.error&&sourceURL&&audio.currentSrc===sourceURL&&!decodeFailed)showMessage('원음을 재생할 수 없습니다. 저장된 분석 결과는 유지됩니다.');});
 function point(e,c){const r=c.getBoundingClientRect();return view[0]+clamp((e.clientX-r.left)/r.width,0,1)*(view[1]-view[0]);}
 for(const c of [wave,spectrum]){
  c.setAttribute('aria-keyshortcuts','Space');
  c.addEventListener('pointerdown',e=>{if(e.button!==0||live||!duration||isLocked())return;c.focus({preventScroll:true});e.preventDefault();drag={id:e.pointerId,x:e.clientX,y:e.clientY,t:point(e,c),moved:false};c.setPointerCapture(e.pointerId);});
  c.addEventListener('pointermove',e=>{if(drag?.id!==e.pointerId)return;if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>=4)drag.moved=true;if(drag.moved){const t=point(e,c);selection=[Math.min(drag.t,t),Math.max(drag.t,t)];draw();}});
  c.addEventListener('pointerup',e=>{if(drag?.id!==e.pointerId)return;const d=drag;drag=null;if(c.hasPointerCapture(e.pointerId))c.releasePointerCapture(e.pointerId);pause();const t=point(e,c);if(!d.moved){selection=null;if(sourceURL)audio.currentTime=t;}else{selection=[Math.min(d.t,t),Math.max(d.t,t)];if(sourceURL)audio.currentTime=selection[0];}draw();});
  c.addEventListener('pointercancel',()=>{drag=null;});c.addEventListener('lostpointercapture',()=>{drag=null;});
  c.addEventListener('keydown',e=>{if((e.code==='Space'||e.key===' ')&&!e.isComposing&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&!e.shiftKey){if(live||!sourceURL||isLocked())return;e.preventDefault();if(!e.repeat)void togglePlayback();}});
  c.addEventListener('wheel',e=>{if(live||!duration||isLocked())return;e.preventDefault();const span=view[1]-view[0];if(e.shiftKey){const start=clamp(view[0]+e.deltaY/400*span,0,Math.max(0,duration-span));view=[start,start+span];}else{const t=point(e,c),next=clamp(span*Math.exp(e.deltaY*.002),Math.min(.1,duration),duration),start=clamp(t-(t-view[0])/span*next,0,duration-next);view=[start,start+next];}staticKey='';requestRaster();draw();},{passive:false});
 }
 function setSplit(value){const v=clamp(value,15,70);plots.style.setProperty('--wave-part',v+'%');split.setAttribute('aria-valuenow',Math.round(v));staticKey='';draw();requestRaster();}
 split.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();splitDrag=true;split.setPointerCapture(e.pointerId);});split.addEventListener('pointermove',e=>{if(splitDrag){const r=plots.getBoundingClientRect();setSplit((e.clientY-r.top)/r.height*100);}});split.addEventListener('pointerup',()=>{splitDrag=false;});split.addEventListener('pointercancel',()=>{splitDrag=false;});split.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();setSplit(+split.getAttribute('aria-valuenow')+(e.key==='ArrowUp'?-5:5));}});
 q('[data-action=all]').onclick=()=>{view=[0,duration||1];selection=null;staticKey='';requestRaster();draw();};
 const expand=q('[data-action=expand]');expand.onclick=()=>{if(dialog.open){dialog.close();return;}dialog.append(host);dialog.showModal();expand.textContent='원래 크기';draw();requestRaster();};dialog.addEventListener('close',()=>{home.after(host);expand.textContent='확대 보기';draw();requestRaster();expand.focus({preventScroll:true});});
 for(const input of host.querySelectorAll('[data-setting]'))input.addEventListener('change',()=>{const l=+q('[data-setting=low]').value,h=+q('[data-setting=high]').value;if(!(l>=20&&h>l&&h<=24000)){showMessage('표시 하한은 20Hz 이상, 상한은 하한보다 크고 24,000Hz 이하여야 합니다.');return;}low=l;high=Math.min(h,sampleRate/2);if(low>=high){low=100;high=Math.min(12000,sampleRate/2);}scale=q('[data-setting=scale]').value;raster=null;if(live){liveColumns=0;liveMin=[];liveMax=[];liveImage.getContext('2d').clearRect(0,0,360,256);}requestRaster();draw();});
 const resize=new ResizeObserver(()=>{staticKey='';draw();requestRaster();});resize.observe(plots);
 function pushLive(frame,sr){if(!active||!frame?.spectrum?.length)return;if(!live){release();entry=null;live=true;liveColumns=0;liveMin=[];liveMax=[];liveImage.getContext('2d').clearRect(0,0,360,256);host.hidden=false;showMessage('실시간 입력의 표시입니다. 녹음을 마치면 선택한 파일 전체를 확인할 수 있습니다.');}sampleRate=sr;high=Math.min(+q('[data-setting=high]').value,sr/2);liveTime=frame.time;liveColumns=Math.min(360,liveColumns+1);view=[Math.max(0,liveTime-liveColumns/30),Math.max(.001,liveTime)];
  const ctx=liveImage.getContext('2d');ctx.drawImage(liveImage,-1,0);const im=ctx.createImageData(1,256),bin=sr/(frame.spectrum.length*2);for(let y=0;y<256;y++){let db=-120;const a=Math.max(1,Math.floor(frequencyAt((y+1)/256,low,high,scale)/bin)),b=Math.min(frame.spectrum.length-1,Math.ceil(frequencyAt(y/256,low,high,scale)/bin));for(let k=a;k<=b;k++)db=Math.max(db,frame.spectrum[k]);writeSpectrogramColor(im.data,y*4,(db+100)/100);}ctx.putImageData(im,359,0);let min=0,max=0;for(const x of frame.waveform||[]){min=Math.min(min,x);max=Math.max(max,x);}liveMin.push(min);liveMax.push(max);if(liveMin.length>360){liveMin.shift();liveMax.shift();}cachedWave=null;draw();
 }
 function setActive(value){active=value;if(!value){pause();if(dialog.open)dialog.close();}else draw();}
 function clear(){release();entry=null;live=false;host.hidden=true;}
 return {setEntry,pushLive,setActive,togglePlayback,pause,clear,paint:draw,destroy(){release();resize.disconnect();dialog.remove();host.remove();home.remove();},get playing(){return !audio.paused},get currentTime(){return audio.currentTime},get entryId(){return entry?.id},get selection(){return selection?.slice()},get state(){return {ready,renderPending,duration,live,view:[...view],...settings(),timeStep:raster?.timeStep}}};
}
