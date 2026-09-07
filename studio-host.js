import {call,config} from './api.js';
let frame,context,openEpoch=0,expanded=false,returnScroll=null;
function setExpanded(next){
  next=next===true&&Boolean(frame&&context)&&!document.querySelector('#studioView')?.hidden&&!document.hidden;
  if(next===expanded)return;
  if(next)returnScroll={left:window.scrollX,top:window.scrollY};
  expanded=next;document.body.classList.toggle('studio-game-expanded',next);
  if(!next&&returnScroll){window.scrollTo({...returnScroll,behavior:'instant'});returnScroll=null;}
}
const dispose=()=>{openEpoch++;setExpanded(false);if(frame){frame.contentWindow?.postMessage({type:'tv:studio-stop'},location.origin);frame.remove();frame=null;}context=null;};
window.addEventListener('tv:logout',dispose);
window.addEventListener('pagehide',dispose);
window.addEventListener('tv:session',event=>{if(!event.detail)dispose();});
window.addEventListener('tv:branch-change',dispose);
window.addEventListener('tv:navigate',event=>{if(event.detail?.page!=='studio')dispose();});
document.addEventListener('change',event=>{if(event.target.id==='studioStudent')dispose();});
window.addEventListener('tv:open-studio',async event=>{
  const student=event.detail?.student,branchId=event.detail?.branchId||student?.branchId;
  if(!student?.id||!branchId)return;
  const mount=document.querySelector('#studioMount');if(!mount)return;
  const status=document.createElement('p');status.textContent='검사 대상자와 사용 권한을 확인하고 있습니다.';mount.replaceChildren(status);
  dispose();const epoch=openEpoch;
  try {
    const dashboard=await call('dashboard',{},branchId);
    if(epoch!==openEpoch)return;
    const allowed=dashboard.students.find(s=>s.id===student.id&&s.active);
    if(!allowed)throw new Error('이 학생의 코칭 권한을 확인할 수 없습니다.');
    const url=new URL(config.studioUrl,location.href);url.searchParams.set('branchId',branchId);url.searchParams.set('studentId',student.id);
    context={branchId,studentId:student.id};
    frame=document.createElement('iframe');frame.title='선택 학생의 3D 발성 체크와 음성 검사';frame.src=url.href;frame.allow='microphone; camera; autoplay; fullscreen';frame.allowFullscreen=true;frame.style.cssText='width:100%;height:min(850px,calc(100dvh - 180px));min-height:560px;border:1px solid #493459;border-radius:20px;background:#10091b';
    frame.addEventListener('load',()=>setExpanded(false));
    mount.replaceChildren(frame);
  } catch(error){if(epoch===openEpoch){status.textContent=error.message;mount.replaceChildren(status);}}
});
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==frame?.contentWindow||!context)return;
  if(event.data?.type==='tv:studio-presentation'&&typeof event.data.expanded==='boolean')setExpanded(event.data.expanded);
  if(event.data?.type==='tv:studio-request-context')frame.contentWindow.postMessage({type:'tv:studio-context',...context},location.origin);
  if(event.data?.type==='tv:exam-saved'&&event.data.branchId===context.branchId&&event.data.studentId===context.studentId)window.dispatchEvent(new CustomEvent('tv:data-updated'));
});
