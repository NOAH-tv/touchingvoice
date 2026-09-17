/* Server SMS for the standalone analyzer. No provider credentials or local Mac bridge. */
const TVSMS={auth:null,setup:null,user:null,ready:false,busy:false,record:null,fingerprint:'',requestId:''};
async function tvSmsApi(action,payload={},requestId=''){
  const {config}=await import('./config.js');
  const idToken=action==='analyzer.sms.public'?'':await TVSMS.auth.getIdToken();
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),60000);
  try{
    const r=await fetch(config.apiUrl,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({action,payload,requestId,idToken}),signal:ctl.signal});
    const j=await r.json();if(!r.ok||!j.ok)throw Object.assign(new Error(j.error?.message||'문자 서버에 연결하지 못했습니다.'),{code:j.error?.code});return j.data;
  }finally{clearTimeout(timer);}
}
function tvSmsNotice(text){const el=document.getElementById('tvr-bridge');if(el)el.textContent=text;}
function tvSmsClear(){TVSMS.ready=false;TVSMS.record=null;TVSMS.fingerprint='';TVSMS.requestId='';}
async function tvSmsInit(){
  TVSMS.setup ||= (async()=>{
    TVSMS.auth=await import('./auth.js');
    await TVSMS.auth.initAuth(user=>{
      TVSMS.user=user;tvSmsClear();
      const login=document.getElementById('tvr-sms-login'),logout=document.getElementById('tvr-sms-logout');
      if(login){login.hidden=!!user;login.disabled=false;}if(logout)logout.hidden=!user;
      if(!user)tvSmsNotice('문자 발송은 승인된 운영자 로그인 후 사용할 수 있습니다.');
    });
  })();
  return TVSMS.setup;
}
async function tvSmsStatus(){
  try{
    await tvSmsInit();if(!TVSMS.user)return false;
    const uid=TVSMS.user.uid,c=await tvSmsApi('analyzer.sms.config');
    if(TVSMS.user?.uid!==uid)return false;
    TVSMS.ready=c.ready;tvSmsNotice(c.ready?c.operator+' · 문자 서버 연결됨 · 발신 '+c.sender:'운영자 확인됨 · 문자 발송 서비스 설정 대기');return c.ready;
  }catch(e){TVSMS.ready=false;tvSmsNotice(e.message);return false;}
}
async function tvSmsLogin(){
  const b=document.getElementById('tvr-sms-login');if(b)b.disabled=true;
  try{await tvSmsInit();await TVSMS.auth.signIn('google');await tvSmsStatus();}
  catch(e){tvSmsNotice(e.message||'로그인을 완료하지 못했습니다.');}
  finally{if(b)b.disabled=false;}
}
async function tvSmsLogout(){if(TVSMS.busy)return;await TVSMS.auth?.signOut();tvSmsClear();tvSmsNotice('로그아웃되었습니다.');}
function tvNormPhone(p){return String(p||'').replace(/[\s()-]/g,'').replace(/^\+82/,'0');}
function tvSmsDisplay(r){
  const labels={prepared:'보내기 전',sending:'접수 확인 중 · 다시 발송하지 마세요',accepted:'발송 접수됨 · 수신 결과 확인 가능',delivered:'전달 완료',rejected:'접수 거절 · 발신번호와 잔액 확인',failed:'전달 실패 · 발송 내역 확인',uncertain:'결과 미확인 · 중복 발송 차단',revoked:'결과 링크 종료됨'};
  const message='문자 '+(labels[r.status]||'상태 확인 필요');
  tvrStep('sms',['accepted','delivered'].includes(r.status)?'ok':['rejected','failed','uncertain'].includes(r.status)?'err':'run',message);
  const note=document.getElementById('tvo-note');if(note)note.textContent='수신번호: '+r.phone+' · '+message;
  const check=document.getElementById('tvo-sms-check');if(check)check.hidden=false;
  return ['accepted','delivered'].includes(r.status);
}
async function tvSendSms(phone){
  if(TVSMS.busy)return false;
  const last=TVR.last,ph=tvNormPhone(phone),packed=(last.reportUrl||'').split('#r=')[1];
  if(!/^01[016789]\d{7,8}$/.test(ph)||!packed){alert('보고서를 생성하고 휴대전화 수신번호를 확인해 주세요.');return false;}
  if(last.smsConsent!==true){alert('개인정보·음성 이용 및 결과 전달 동의를 먼저 확인해 주세요.');return false;}
  const button=document.getElementById('tvo-sms');TVSMS.busy=true;if(button)button.disabled=true;
  try{
    if(!await tvSmsStatus())throw new Error(TVSMS.user?'문자 서버 설정이 아직 완료되지 않았습니다.':'검사 화면의 [문자 발송용 구글 로그인]으로 먼저 로그인해 주세요.');
    const fingerprint=ph+'|'+packed;
    if(TVSMS.fingerprint!==fingerprint){TVSMS.record=null;TVSMS.fingerprint=fingerprint;TVSMS.requestId=crypto.randomUUID();}
    const r=TVSMS.record ||= await tvSmsApi('analyzer.sms.prepare',{phone:ph,packed,consent:true},TVSMS.requestId);
    const result=await tvSmsApi(r.status==='prepared'?'analyzer.sms.send':'analyzer.sms.status',{id:r.id,consent:true});
    TVSMS.record=result;return tvSmsDisplay(result);
  }catch(e){
    const message=e.name==='AbortError'?'서버 응답 대기 시간이 지났습니다. [발송 상태 확인]으로 먼저 확인해 주세요.':e.message;
    tvrStep('sms','err','문자 확인 필요');tvrLog(message);const note=document.getElementById('tvo-note');if(note)note.textContent=message;
    const check=document.getElementById('tvo-sms-check');if(check)check.hidden=false;return false;
  }finally{TVSMS.busy=false;if(button)button.disabled=false;}
}
async function tvoSendSms(){return tvSendSms(TVR.last.phone);}
async function tvSmsCheck(){
  if(TVSMS.busy)return;TVSMS.busy=true;
  try{
    if(!TVSMS.record){
      if(!TVSMS.requestId)throw new Error('아직 문자 발송 요청이 없습니다.');
      const split=TVSMS.fingerprint.indexOf('|');
      TVSMS.record=await tvSmsApi('analyzer.sms.prepare',{phone:TVSMS.fingerprint.slice(0,split),packed:TVSMS.fingerprint.slice(split+1),consent:true},TVSMS.requestId);
    }
    TVSMS.record=await tvSmsApi('analyzer.sms.status',{id:TVSMS.record.id});tvSmsDisplay(TVSMS.record);
  }catch(e){const note=document.getElementById('tvo-note');if(note)note.textContent=e.message;}
  finally{TVSMS.busy=false;}
}
async function tvSmsOpenResult(token){
  const loading=document.createElement('p');loading.textContent='검사 결과를 불러오고 있습니다…';loading.style.cssText='padding:32px;color:#43227d;background:#f5eee0;font:18px sans-serif';
  document.body.replaceChildren(loading);
  try{
    const r=await tvSmsApi('analyzer.sms.public',{token});
    const html=window.tvBuildReportHTML(tvUnpackReport(r.packed));document.open();document.write(html);document.close();
  }catch(e){loading.textContent=e.message||'검사 결과를 불러오지 못했습니다. 터칭보이스에 문의해 주세요.';}
}
