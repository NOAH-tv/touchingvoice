import {call} from './api.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date = value => new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
const phases={planned:'발송 예정 시각 전',ready:'발송 조건 충족',blocked:'확인 필요',disabled:'안내 꺼짐',expired:'수업 시작으로 종료'};
const blockers={student_inactive:'활성 학생·서비스 동의 확인',consent_required:'수업·결제 안내 수신 동의 필요',phone_required:'연락처 확인 필요',branch_suspended:'지점 이용 상태 확인',payment_link_required:'결제 링크 연결 필요',amount_required:'결제 금액 설정 필요',delivery_reconciliation:'기존 발송 결과 확인 필요'};
let epoch=0;
function reset(){epoch++;}
window.addEventListener('tv:logout',reset);
window.addEventListener('tv:branch-change',reset);
window.addEventListener('tv:navigate', event=>{if(event.detail?.page!=='notifications')reset();});
window.addEventListener('tv:notifications-open', async event=>{
  const {container,branchId,session}=event.detail||{};
  const host=typeof container==='string'?document.querySelector(container):container;
  if(!host || !['owner','manager'].includes(session?.staff?.role))return;
  const active=++epoch;
  host.innerHTML='<div class="panel"><div class="panel-body" role="status">발송 조건을 확인하고 있습니다.</div></div>';
  let data;
  const current=()=>active===epoch&&host.isConnected;
  async function load(){data=await call('notification.plan',{},branchId);}
  function content(){
    if(!current())return;
    host.innerHTML=`<div class="page-heading"><div><p class="eyebrow">LESSON & RENEWAL NOTIFICATIONS</p><h1>자동 알림</h1><p>수업 하루 전 안내와 4회 종료 후 재등록 안내를 관리합니다.</p></div><button class="button secondary" data-notification="reload">다시 확인</button></div><div class="info-strip"><span>발송 규칙과 문구를 확인하는 시안입니다. 문자 업체와 예약 실행을 연결하면 자동 발송할 수 있습니다. 현재 실제 문자는 전송되지 않습니다.</span></div><div class="notification-branch"><strong>${esc(data.branchName)}</strong><span class="badge">한국 시간 기준</span></div><div class="notification-layout"><section class="panel"><div class="panel-header"><h2>안내 규칙</h2></div><div class="panel-body"><form id="notificationPolicy" class="notification-policy"><div class="notification-rule"><h3>01 · 수업 하루 전</h3><label class="checkbox-label"><input type="checkbox" name="lessonEnabled" ${data.policy.lessonEnabled?'checked':''}><span>예약된 수업 안내</span></label><div class="notification-hour"><label for="notificationHour">전날 발송 시각</label><select id="notificationHour" name="lessonHour">${Array.from({length:12},(_,i)=>i+9).map(h=>`<option value="${h}" ${h===data.policy.lessonHour?'selected':''}>${h}:00</option>`).join('')}</select></div><p>수업 날짜·시간, 지점 주소, 문의 연락처가 문구에 들어갑니다.</p></div><div class="notification-rule"><h3>02 · 4회 종료 후</h3><label class="checkbox-label"><input type="checkbox" name="renewalEnabled" ${data.policy.renewalEnabled?'checked':''}><span>다음 수강권 결제 안내</span></label><p>강사가 4번째 수업을 완료하면 해당 수강권당 한 번 안내합니다. 20시 이후에는 다음 날 9시부터 안내하도록 계획합니다.</p></div><div class="form-footer"><button class="button primary" type="submit">안내 규칙 저장</button></div></form><p id="notificationFeedback" class="notification-feedback" role="status"></p></div></section><section class="panel"><div class="panel-header"><div><h2>발송 계획 <span>${data.candidates.length}</span></h2><p>예정 수업과 미납 결제 요청에서 계산합니다.</p></div></div><div class="table-wrap"><table><thead><tr><th>종류 · 대상</th><th>예정 시각</th><th>조건</th><th>문구</th></tr></thead><tbody>${data.candidates.length?data.candidates.map((row,index)=>`<tr><td><strong>${row.type==='lesson_reminder'?'수업 전날 안내':'다음 수강권 안내'}</strong><span class="secondary-line">${esc(row.studentName)} · ${esc(row.recipientMasked)}</span></td><td>${esc(date(row.dueAt))}</td><td><span class="badge ${row.phase==='blocked'?'amber':''}">${esc(phases[row.phase])}</span><span class="secondary-line">${esc(row.blockers.map(key=>blockers[key]).join(' · ')||'문자 발송 연결 대기')}</span></td><td><button class="button small ghost" data-notification="message" data-index="${index}">미리보기</button></td></tr>`).join(''):'<tr><td colspan="4" class="empty-cell">안내할 예정 수업이나 4회 종료 결제 요청이 없습니다.</td></tr>'}</tbody></table></div><p class="notification-caption">수업 취소·시작, 안내 동의 철회, 납부 완료, 다음 수강권 발급 시 발송 조건을 다시 확인합니다. 표시된 시각은 계획이며 실제 예약·전송 완료 상태가 아닙니다.</p></section></div><div id="notificationPreview" class="notification-preview" hidden></div>`;
  }
  try{await load();content();}catch(error){if(current())host.innerHTML=`<div class="page-error"><h2>알림 정보를 불러오지 못했습니다.</h2><p>${esc(error.message)}</p></div>`;return;}
  host.onclick=async event=>{
    const button=event.target.closest('[data-notification]');if(!button||!current())return;
    if(button.dataset.notification==='message'){
      const row=data.candidates[Number(button.dataset.index)];if(!row)return;
      const panel=host.querySelector('#notificationPreview');panel.hidden=false;panel.innerHTML=`<section class="panel"><div class="panel-header"><h2>안내 문자 미리보기</h2><button class="button small ghost" data-notification="close-message">← 이전 단계</button></div><div class="panel-body"><p class="notification-label">${esc(row.studentName)} · ${esc(row.recipientMasked)} · ${esc(date(row.dueAt))}</p><div class="notification-message">${esc(row.messagePreview)}</div><p class="help">실제 전송 전에는 수신 동의와 예약·결제 상태를 다시 확인합니다.</p></div></section>`;panel.scrollIntoView({behavior:'smooth',block:'nearest'});
    }else if(button.dataset.notification==='close-message'){host.querySelector('#notificationPreview').hidden=true;}
    else if(button.dataset.notification==='reload'){button.disabled=true;try{await load();content();}catch(error){if(current())button.textContent='다시 확인 필요';}finally{button.disabled=false;}}
  };
  host.onsubmit=async event=>{
    if(event.target.id!=='notificationPolicy'||!current())return;
    event.preventDefault();const form=event.target,button=form.querySelector('button[type=submit]');button.disabled=true;
    const fields=new FormData(form),feedback=host.querySelector('#notificationFeedback');
    try{
      await call('notification.settings.update',{lessonEnabled:fields.has('lessonEnabled'),renewalEnabled:fields.has('renewalEnabled'),lessonHour:Number(fields.get('lessonHour'))},branchId);
      if(!current())return;await load();content();host.querySelector('#notificationFeedback').textContent='안내 규칙을 저장했습니다. 실제 문자 발송은 연결 전입니다.';
    }catch(error){if(current()){feedback.textContent=error.message;feedback.classList.add('error');}}
    finally{button.disabled=false;}
  };
});
