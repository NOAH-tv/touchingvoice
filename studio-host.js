import {config} from './api.js';
let recording=false;
let frame,context,expanded=false,returnScroll=null,suspended=false,waiting=false,loadTimer;
const view=()=>document.querySelector('#studioView');
function setWorkspace(next){document.body.classList.toggle('studio-workspace-active',next===true);}
function showStatus(message,busy=true){
  const mount=document.querySelector('#studioMount');if(!mount)return;
  let status=document.querySelector('#studioLoadStatus');
  if(!status){status=document.createElement('p');status.id='studioLoadStatus';status.className='studio-load-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');mount.append(status);}
  status.textContent=message;status.hidden=!message;mount.classList.toggle('studio-is-loading',Boolean(message)&&busy);
  const launch=document.querySelector('#studioLaunch');if(launch){launch.hidden=busy||Boolean(frame&&!message);launch.textContent=frame?'다시 연결':'스튜디오 열기';}
}
function setExpanded(next){
  next=next===true&&Boolean(frame&&context)&&!suspended&&!view()?.hidden&&!document.hidden;
  if(next===expanded)return;
  if(next)returnScroll={left:window.scrollX,top:window.scrollY};
  expanded=next;document.body.classList.toggle('studio-game-expanded',next);
  if(!next&&returnScroll){window.scrollTo({...returnScroll,behavior:'instant'});returnScroll=null;}
}
function recordingNotice(){
  let notice=document.querySelector('#backgroundRecordingNotice');
  if(!notice&&!recording)return;
  if(!notice){
    notice=document.createElement('div');notice.id='backgroundRecordingNotice';notice.setAttribute('role','status');
    notice.style.cssText='position:fixed;bottom:24px;right:24px;z-index:9999;background:#251439;color:#fff;border:1px solid #b07add;border-radius:14px;padding:16px;box-shadow:0 8px 30px #0006;display:flex;gap:16px;align-items:center';
    const label=document.createElement('span'),stop=document.createElement('button');stop.className='button primary';stop.textContent='녹음 종료 · 저장';
    stop.onclick=()=>{stop.disabled=true;frame?.contentWindow?.postMessage({type:'tv:studio-stop-recording'},location.origin);};
    notice.append(label,stop);document.body.append(notice);
  }
  notice.hidden=!recording;notice.style.display=recording?'flex':'none';
  notice.firstChild.textContent='● '+(context?.student?.name||'자유 사용 · 기록 안 함')+' · 녹음 중';
  notice.lastChild.textContent=context?.student?'녹음 종료 · 저장':'녹음 종료 · 분석';notice.lastChild.disabled=false;
}
function dispose(){
  clearTimeout(loadTimer);setExpanded(false);
  if(frame){frame.contentWindow?.postMessage({type:'tv:studio-stop'},location.origin);frame.remove();frame=null;}
  context=null;suspended=false;waiting=false;recording=false;recordingNotice();
}
function closeWorkspace(){dispose();setWorkspace(false);}
function suspend(){
  clearTimeout(loadTimer);setExpanded(false);setWorkspace(false);
  if(frame&&!suspended){suspended=true;frame.contentWindow?.postMessage({type:'tv:studio-suspend'},location.origin);}
}
function watchLoading(){clearTimeout(loadTimer);loadTimer=setTimeout(()=>{if(waiting&&!suspended)showStatus('연결이 지연되고 있습니다. 잠시 기다리거나 다시 연결해 주세요.',false);},20000);}
function openStudio(student,branchId,{reload=false}={}){
  if(!branchId||student&&(!student.id||student.branchId!==branchId||student.active===false||student.consent?.service!==true||student.consent?.voice!==true))return;
  const studentId=student?.id||'';
  const mount=document.querySelector('#studioMount');if(!mount)return;
  setWorkspace(true);
  if(!reload&&frame&&context?.studentId===studentId&&context.branchId===branchId){
    if(suspended){suspended=false;waiting=true;showStatus('코칭 워크스페이스를 다시 연결하고 있습니다.');frame.contentWindow?.postMessage({type:'tv:studio-resume'},location.origin);watchLoading();}
    return;
  }
  dispose();mount.replaceChildren();
  context={branchId,studentId,student};waiting=true;
  // The child gate and every server action validate the signed-in instructor independently.
  // Do not repeat the full dashboard download before the child can start loading.
  const url=new URL(config.studioUrl,location.href);url.searchParams.set('branchId',branchId);url.searchParams.set('studentId',studentId);
  frame=document.createElement('iframe');frame.title='선택 학생의 3D 발성 체크와 음성 검사';frame.src=url.href;frame.allow='microphone; camera; autoplay; fullscreen';frame.allowFullscreen=true;frame.className='coaching-workspace-frame';
  mount.append(frame);showStatus('코칭 워크스페이스를 준비하고 있습니다.');watchLoading();
}
window.addEventListener('tv:logout',closeWorkspace);
window.addEventListener('pagehide',closeWorkspace);
window.addEventListener('tv:session',event=>{if(!event.detail)closeWorkspace();});
window.addEventListener('tv:branch-change',closeWorkspace);
window.addEventListener('tv:navigate',event=>{if(event.detail?.page==='studio')setWorkspace(true);else suspend();});
document.addEventListener('change',event=>{if(event.target.id==='studioStudent'){dispose();document.querySelector('#studioMount')?.replaceChildren();showStatus('코칭할 학생을 선택해 주세요.',false);window.dispatchEvent(new CustomEvent('tv:studio-select',{detail:{studentId:event.target.value}}));}});
window.addEventListener('tv:open-studio',event=>{
  const student=event.detail?.student;openStudio(student,event.detail?.branchId||student?.branchId,{reload:event.detail?.reload===true});
});
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==frame?.contentWindow||!context)return;
  if(event.data?.type==='tv:recording-state'&&event.data.branchId===context.branchId&&event.data.studentId===context.studentId){recording=event.data.recording===true;recordingNotice();}
  if(event.data?.type==='tv:studio-ready'&&event.data.branchId===context.branchId&&event.data.studentId===context.studentId){waiting=false;clearTimeout(loadTimer);showStatus('',false);if(suspended)frame.contentWindow?.postMessage({type:'tv:studio-suspend'},location.origin);}
  if(event.data?.type==='tv:studio-error'){waiting=false;clearTimeout(loadTimer);showStatus(event.data.message||'코칭 연결을 확인해 주세요.',false);}
  if(event.data?.type==='tv:studio-reload-required'&&!suspended)openStudio(context.student,context.branchId,{reload:true});
  if(event.data?.type==='tv:studio-presentation'&&typeof event.data.expanded==='boolean')setExpanded(event.data.expanded);
  if(event.data?.type==='tv:studio-request-context')frame.contentWindow.postMessage({type:'tv:studio-context',branchId:context.branchId,studentId:context.studentId},location.origin);
  if(event.data?.type==='tv:exam-saved'&&event.data.branchId===context.branchId&&event.data.studentId===context.studentId)window.dispatchEvent(new CustomEvent('tv:data-updated'));
});
