import { getContext } from '../context.js';
/** Fixed server-owned student. Identity and consent are never edited in Studio. */
export function mountParticipantIntake({container,getProfileId,isLocked,isRecording=()=>false,onRecord,onChooseFiles,onHistory,onError,onDraftChange=()=>{},getVoicePreset=()=>undefined,onVoicePresetChange=()=>{}}) {
  const {student,branchId,practice}=getContext();
  container.className='participant-intake';
  container.innerHTML=`<section class="franchise-intake"><div class="franchise-person"><span class="intake-step">01</span><div><h2 id="franchiseStudentName"></h2><p>운영 화면에서 선택한 학생 · 개인정보·음성 동의 확인됨</p></div><span class="franchise-identity">학생 기록 연결</span></div>
    <div class="intake-grid intake-essentials"><label>성별 선택<select id="participantGender" aria-label="성별 선택"><option value="">선택</option><option value="male">남자</option><option value="female">여자</option></select></label><label>이름<input id="participantName" maxlength="100" autocomplete="off" placeholder="검사하는 분의 이름"></label><label>곡 이름<input id="participantSong" maxlength="160" placeholder="곡 이름 · 선택"></label></div>
    <details class="intake-examination intake-personality"><summary>성격검사 점수 <small>검사 결과가 있을 때 입력</small></summary><div class="intake-scores"><label>외향성 E<input id="participantScoreE" type="number" min="0" max="100" step="any" placeholder="선택 · 0–100"></label><label>성실성 C<input id="participantScoreC" type="number" min="0" max="100" step="any" placeholder="선택 · 0–100"></label><label>우호성 A<input id="participantScoreA" type="number" min="0" max="100" step="any" placeholder="선택 · 0–100"></label><label>정서 민감성 N<input id="participantScoreN" type="number" min="0" max="100" step="any" placeholder="선택 · 0–100"></label><label>개방성 O<input id="participantScoreO" type="number" min="0" max="100" step="any" placeholder="선택 · 0–100"></label><label>보컬특성 V<input id="participantScoreV" type="number" min="0" max="100" step="any" placeholder="선택 · 0–100"></label></div><p class="field-hint">별도 검사에서 받은 점수만 입력합니다. 목소리에서 성격을 추정하지 않습니다.</p></details>
    <div class="intake-actions"><div><span id="participantReadyState" role="status">녹음하거나 음성 파일을 선택하세요.</span><small id="intakeDriveStatus">완료한 분석은 저장 버튼으로 서버에 보관합니다.</small></div><button id="participantRecord" type="button" class="button primary">녹음 시작</button><button id="participantUpload" type="button" class="button secondary">음성 파일 분석</button><button id="participantHistory" type="button" class="text-button">이 PC의 누적 차트 →</button></div></section>`;
  const $=id=>document.getElementById(id);$('franchiseStudentName').textContent=student.name;
  $('participantName').value=practice?'':student.name;$('participantName').readOnly=!practice;
  $('participantName').title=practice?'자유 사용 이름 · 학생 기록에는 저장하지 않습니다.':'선택한 학생의 이름입니다. 이름 변경은 학생 관리에서 할 수 있습니다.';
  document.getElementById('examCaptureActions').append(container.querySelector('.intake-actions'));
  if(practice){container.querySelector('.franchise-person p').textContent='녹음·분석·훈련을 바로 사용하세요. 학생을 선택하면 기록됩니다.';container.querySelector('.franchise-identity').textContent='기록 안 함';}
  function snapshot() {
    return {profileId:student.id,participant:{id:student.id,name:practice?$('participantName').value.trim():student.name,gender:getVoicePreset()==='female'?'여자':getVoicePreset()==='male'?'남자':''},examination:{voicePreset:getVoicePreset()||null,song:$('participantSong').value.trim(),section:'',conditions:'',note:'',big5:Object.fromEntries(['E','C','A','N','O','V'].map(key=>[key,$('participantScore'+key).value===''?null:Number($('participantScore'+key).value)])),branchId,consent:{service:student.consent.service===true,voice:student.consent.voice===true,drive:false,version:'tv-franchise-student-consent-v1',source:'server-student',checkedAt:student.updatedAt||student.createdAt||null}}};
  }
  async function prepare() {
    if(isLocked())throw new Error('진행 중인 음성 작업을 먼저 마쳐 주세요.');
    if(getProfileId()!==student.id)throw new Error('학생 연결을 준비하고 있습니다. 잠시 후 다시 시도해 주세요.');
    if(!practice&&(student.consent?.service!==true||student.consent?.voice!==true))throw new Error('학생 관리에서 음성 이용 동의를 확인해 주세요.');
    for(const key of ['E','C','A','N','O','V']){const field=$('participantScore'+key);if(field.value!==''&&(!Number.isFinite(Number(field.value))||Number(field.value)<0||Number(field.value)>100))throw new Error(key+' 점수는 0–100으로 입력해 주세요.');}
    return snapshot();
  }
  const safe=fn=>Promise.resolve().then(fn).catch(onError);
  function updateLocks(recording=isRecording()) {
    $('participantGender').value=getVoicePreset()||'';const locked=isLocked();container.querySelectorAll('input,select').forEach(input=>input.disabled=locked);
    $('participantRecord').disabled=locked&&!recording;$('participantRecord').textContent=recording?'■ 녹음 정지':'● 녹음 시작';
    $('participantRecord').classList.toggle('recording',recording);$('participantRecord').setAttribute('aria-pressed',String(recording));
    $('participantUpload').disabled=locked;$('participantHistory').disabled=locked;
    $('participantReadyState').textContent=recording?'녹음 중 · 종료하면 전체 구간을 분석합니다.':practice?'학생 없이 사용 중 · 기록은 저장되지 않습니다.':'선택한 학생의 고유 번호로 기록합니다.';
  }
  $('participantGender').onchange=()=>{const value=$('participantGender').value;safe(async()=>{try{await onVoicePresetChange(value);}finally{updateLocks();}});};
  $('participantRecord').onclick=()=>safe(onRecord);
  $('participantUpload').onclick=()=>safe(async()=>{await prepare();await onChooseFiles();});
  $('participantHistory').onclick=()=>safe(()=>onHistory(student.id));
  container.addEventListener('input',onDraftChange);
  updateLocks();
  return {reset(){if(isLocked())return;for(const input of container.querySelectorAll('input:not(#participantName)'))input.value='';onDraftChange();updateLocks();},refresh:updateLocks,updateLocks,prepare,startNew:()=>false,readSnapshot:()=>getProfileId()===student.id?snapshot():null,setDriveStatus:text=>{$('intakeDriveStatus').textContent=text;}};
}
