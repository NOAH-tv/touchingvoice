import { initAuth } from '../auth.js';
import { call, config } from '../api.js';
import { establishContext, authorizedStudent, isParentMessage, postParent } from './context.js';

let shutdown = null, appModule=null, authorizedContext=null, closed=false,suspended=false,resumeEpoch=0,suspendPromise=Promise.resolve();
function deny(message) {
  const status = document.getElementById('studioGateStatus');
  if (status) status.textContent = message;
  else document.body.replaceChildren(Object.assign(document.createElement('p'), { textContent: message }));
}
async function stop() {
  if (closed) return;
  closed = true;resumeEpoch++;
  document.documentElement.style.visibility = 'hidden';
  try { await shutdown?.(); } finally { postParent({type:'tv:studio-stopped'}); }
}
async function suspend(){
  suspended=true;resumeEpoch++;document.documentElement.style.visibility='hidden';
  if(appModule)suspendPromise=Promise.resolve(appModule.suspendStudio?.());
  try{await suspendPromise;}catch(error){postParent({type:'tv:studio-error',message:error?.message||'입력 정리를 확인해 주세요.'});}
}
async function resume(){
  const epoch=++resumeEpoch;suspended=false;
  if(!appModule||!authorizedContext)return; // First boot still checks access before revealing the shell.
  document.documentElement.style.visibility='hidden';
  try{
    await suspendPromise;
    const {selected,user,context}=authorizedContext;
    const fresh=await call('studio.context',{studentId:selected.studentId},selected.branchId);
    if(closed||suspended||epoch!==resumeEpoch)return;
    if(fresh?.staff?.uid!==user.uid)throw new Error('승인된 강사 계정이 필요합니다.');
    authorizedStudent({branch:fresh.branch,students:[fresh.student]},selected.studentId,selected.branchId);
    if(JSON.stringify(fresh)!==JSON.stringify(context)){postParent({type:'tv:studio-reload-required'});return;}
    await appModule.resumeStudio?.();
    if(closed||suspended||epoch!==resumeEpoch)return;
    document.documentElement.style.visibility='';
    postParent({type:'tv:studio-ready',branchId:selected.branchId,studentId:selected.studentId});
  }catch(error){if(!closed&&epoch===resumeEpoch){suspended=true;postParent({type:'tv:studio-error',message:error?.message||'코칭 접근 권한을 확인하지 못했습니다.'});}}
}
window.addEventListener('message', event => {
  if(!isParentMessage(event))return;
  if(['tv:studio-stop','tv:logout'].includes(event.data?.type))void stop();
  else if(event.data?.type==='tv:studio-suspend')void suspend();
  else if(event.data?.type==='tv:studio-resume')void resume();
});
window.addEventListener('pagehide', () => { void stop(); });
async function selection() {
  const params = new URLSearchParams(location.search), branchId=params.get('branchId'),studentId=params.get('studentId');
  if (branchId && studentId) return {branchId,studentId};
  if (parent === window) throw new Error('운영 화면에서 학생을 선택한 뒤 코칭을 열어 주세요.');
  return new Promise((resolve,reject) => {
    const timer=setTimeout(()=>{window.removeEventListener('message',listener);reject(new Error('학생 연결 시간이 초과되었습니다. 운영 화면에서 다시 열어 주세요.'));},12000);
    function listener(event) {
      if (!isParentMessage(event) || event.data?.type !== 'tv:studio-context') return;
      const {branchId,studentId}=event.data;
      if (![branchId,studentId].every(v=>typeof v==='string'&&v.length>0&&v.length<=200)) return;
      clearTimeout(timer);window.removeEventListener('message',listener);resolve({branchId,studentId});
    }
    window.addEventListener('message',listener);postParent({type:'tv:studio-request-context'});
  });
}
async function authenticated() {
  return new Promise((resolve,reject) => {
    let settled=false,authenticatedUid=null;
    const timer=setTimeout(()=>{settled=true;reject(new Error('로그인 상태 확인 시간이 초과되었습니다.'));},20000);
    Promise.resolve(initAuth(user=>{
      if (settled) { if (!user || authenticatedUid && user.uid!==authenticatedUid) void stop(); return; }
      settled=true;clearTimeout(timer);
      if (!user) {
        postParent({type:'tv:studio-auth-required'});
        if(parent===window)location.replace('../index.html');
        reject(new Error('로그인이 필요합니다. 운영 화면으로 돌아가 로그인해 주세요.'));
      } else {authenticatedUid=user.uid;resolve(user);}
    })).catch(error=>{clearTimeout(timer);settled=true;reject(error);});
  });
}
try {
  const [user,selected]=await Promise.all([authenticated(),selection()]);
  const context=await call('studio.context',{studentId:selected.studentId},selected.branchId);
  if (!context?.staff || context.staff.uid!==user.uid) throw new Error('승인된 강사 계정이 필요합니다.');
  const student=authorizedStudent({branch:context.branch,students:[context.student]},selected.studentId,selected.branchId);
  if (closed) throw new Error('코칭 연결이 종료되었습니다.');
  authorizedContext={selected,user,context};
  establishContext({uid:user.uid,branchId:selected.branchId,student,staff:context.staff,branch:context.branch,preview:config.preview});
  // No Studio HTML, 3D assets, worker, or audio module is requested until authorization passes.
  const response=await fetch('./app-shell.html',{cache:'no-store'});
  if (!response.ok) throw new Error('코칭 화면을 불러오지 못했습니다.');
  const parsed=new DOMParser().parseFromString(await response.text(),'text/html');
  if (closed) throw new Error('코칭 연결이 종료되었습니다.');
  document.documentElement.style.visibility='hidden';
  for (const node of parsed.head.querySelectorAll('link,script[type="importmap"]')) {
    if(node.tagName==='SCRIPT') {const map=document.createElement('script');map.type='importmap';map.textContent=node.textContent;document.head.append(map);}
    else document.head.append(document.importNode(node,true));
  }
  const css=document.createElement('link');css.rel='stylesheet';css.href='./franchise.css';document.head.append(css);
  document.body.replaceChildren(...Array.from(parsed.body.childNodes, node=>document.importNode(node,true)));
  const app=await import('./src/app.js');appModule=app;shutdown=app.shutdownStudio;
  if(closed){await shutdown?.();throw new Error('코칭 연결이 종료되었습니다.');}
  if(suspended)await suspend();
  document.documentElement.style.visibility=suspended?'hidden':'';document.title='터칭보이스 · 코칭 스튜디오';
  postParent({type:'tv:studio-ready',branchId:selected.branchId,studentId:student.id});
} catch(error) {
  if(!closed){document.documentElement.style.visibility='';deny(error?.message||'접근 권한을 확인하지 못했습니다.');postParent({type:'tv:studio-error',message:error?.message||'코칭 연결 실패'});}
}
