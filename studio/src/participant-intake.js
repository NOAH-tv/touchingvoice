import { getContext } from '../context.js';
/** Fixed server-owned student. Identity and consent are never edited in Studio. */
export function mountParticipantIntake({container,getProfileId,isLocked,isRecording=()=>false,onRecord,onChooseFiles,onHistory,onError,onDraftChange=()=>{}}) {
  const {student,branchId}=getContext();
  container.className='participant-intake';
  container.innerHTML=`<section class="franchise-intake"><div class="franchise-person"><span class="intake-step">01</span><div><h2 id="franchiseStudentName"></h2><p>운영 화면에서 선택한 학생 · 개인정보·음성 동의 확인됨</p></div><span class="franchise-identity">학생 기록 연결</span></div>
    <details class="intake-examination"><summary>이번 검사 조건 <small>발성 과제 · 녹음 조건 · 메모</small></summary><div class="intake-grid">
    <label>곡 · 발성 과제<input id="participantSong" maxlength="160" placeholder="예: /아/ 지속음"></label><label>검사 구간<input id="participantSection" maxlength="120" placeholder="훈련 전 · 훈련 후"></label>
    <label>녹음 조건<input id="participantConditions" maxlength="500" placeholder="마이크 · 거리 · 공간"></label><label>검사 메모<input id="participantNote" maxlength="1200" placeholder="오늘의 관찰 내용"></label></div><div class="intake-scores"><label>외향성 E<input id="participantScoreE" type="number" min="0" max="100" step="any" placeholder="선택 · 0–100"></label><label>성실성 C<input id="participantScoreC" type="number" min="0" max="100" step="any" placeholder="선택 · 0–100"></label><label>우호성 A<input id="participantScoreA" type="number" min="0" max="100" step="any" placeholder="선택 · 0–100"></label><label>정서 민감성 N<input id="participantScoreN" type="number" min="0" max="100" step="any" placeholder="선택 · 0–100"></label><label>개방성 O<input id="participantScoreO" type="number" min="0" max="100" step="any" placeholder="선택 · 0–100"></label><label>보컬특성 V<input id="participantScoreV" type="number" min="0" max="100" step="any" placeholder="선택 · 0–100"></label></div><p class="field-hint">별도 검사에서 받은 점수만 입력합니다. 목소리에서 성격을 추정하지 않습니다.</p></details>
<details class="intake-examination"><summary>연구용 측정 조건 <small>같은 과제·장비로 비교하기 위한 기록</small></summary><p class="field-hint">일반 검사에는 선택 사항입니다. 항목을 입력해도 연구 동의·표준 측정 검증이 자동으로 완료되지는 않습니다.</p><div class="intake-grid">
<label>측정 과제<select id="researchTask"><option value="unknown">미분류</option><option value="sustained_vowel">편안한 /아/ 지속 모음</option><option value="reading">고정 문장 읽기</option><option value="spontaneous">자유 발화</option><option value="range">최저·최고 음역 과제</option><option value="mpt">최대발성지속시간 과제</option><option value="singing">노래</option></select></label>
<label>측정 시점<select id="researchTimepoint"><option value="unknown">미분류</option><option value="baseline">훈련 전</option><option value="post">훈련 후</option><option value="followup">추적 검사</option></select></label>
<label>반복 번호<input id="researchReplicate" type="number" min="1" max="20" placeholder="1–3회 권장"></label>
<label>마이크·녹음기 모델<input id="researchMicrophone" maxlength="120"></label>
<label>입과 마이크 거리 cm<input id="researchDistanceCm" type="number" min="1" max="300" step="any"></label>
<label>입과 마이크 각도 °<input id="researchAngleDeg" type="number" min="0" max="180" step="any"></label>
<label>자동 증폭·노이즈 제거<select id="researchProcessing"><option value="unknown">확인 안 됨</option><option value="off">꺼짐 확인</option><option value="on">켜짐</option></select></label>
<label>반주·다른 사람 목소리<select id="researchAccompaniment"><option value="unknown">확인 안 됨</option><option value="none">없음 · 단독 목소리</option><option value="present">포함됨</option></select></label>
<label>성격검사 결과 ID<input id="researchAssessmentId" maxlength="100" placeholder="결과지 고유 번호"></label>
<label>성격검사 도구·버전<input id="researchAssessmentVersion" maxlength="120" placeholder="예: 사용한 한국어 검사판·문항 수"></label>
<label>성격검사 날짜<input id="researchAssessmentDate" type="date"></label>
<label>성격 점수 단위<select id="researchScoreUnit"><option value="unknown">확인 안 됨</option><option value="mean_times_20">문항 평균 × 20</option><option value="percentile">백분위</option><option value="other">기타 · 메모에 기록</option></select></label>
<label>발성 노력도 0–10<input id="researchEffort" type="number" min="0" max="10" step="1" placeholder="본인이 직접 응답"></label>
<label>목소리 피로 0–10<input id="researchFatigue" type="number" min="0" max="10" step="1" placeholder="본인이 직접 응답"></label>
<label>연구 동의 기록 번호<input id="researchConsentRef" maxlength="120" placeholder="동의서 보관 번호 · 없으면 미입력"></label>
</div><p class="field-hint">노력도·피로 단일 문항은 현장 기록이며 VHI·CAPE-V와 같은 표준 척도 점수가 아닙니다. 연구를 위한 임상·설문 평가는 별도 프로토콜을 사용합니다.</p></details>
    <div class="intake-actions"><div><span id="participantReadyState" role="status">녹음하거나 음성 파일을 선택하세요.</span><small id="intakeDriveStatus">완료한 분석은 저장 버튼으로 서버에 보관합니다.</small></div><button id="participantRecord" type="button" class="button primary">녹음 시작</button><button id="participantUpload" type="button" class="button secondary">음성 파일 분석</button><button id="participantHistory" type="button" class="text-button">이 PC의 누적 차트 →</button></div></section>`;
  const $=id=>container.querySelector('#'+id);$('franchiseStudentName').textContent=student.name;
  function research(){const text=id=>$('research'+id).value;const number=id=>text(id)===''?null:Number(text(id));return {task:text('Task'),timepoint:text('Timepoint'),replicate:number('Replicate'),microphone:text('Microphone'),distanceCm:number('DistanceCm'),angleDeg:number('AngleDeg'),processing:text('Processing'),accompaniment:text('Accompaniment'),assessmentId:text('AssessmentId'),assessmentVersion:text('AssessmentVersion'),assessmentDate:text('AssessmentDate'),scoreUnit:text('ScoreUnit'),effort:number('Effort'),fatigue:number('Fatigue'),researchConsentRef:text('ConsentRef')};}
  function snapshot() {
    return {profileId:student.id,participant:{id:student.id,name:student.name},examination:{research:research(),song:$('participantSong').value,section:$('participantSection').value,conditions:$('participantConditions').value,note:$('participantNote').value,big5:Object.fromEntries(['E','C','A','N','O','V'].map(key=>[key,$('participantScore'+key).value===''?null:Number($('participantScore'+key).value)])),branchId,consent:{service:student.consent.service===true,voice:student.consent.voice===true,drive:false,version:'tv-franchise-student-consent-v1',source:'server-student',checkedAt:student.updatedAt||student.createdAt||null}}};
  }
  async function prepare() {
    if(isLocked())throw new Error('진행 중인 음성 작업을 먼저 마쳐 주세요.');
    if(getProfileId()!==student.id)throw new Error('학생 연결을 준비하고 있습니다. 잠시 후 다시 시도해 주세요.');
    if(student.consent?.service!==true||student.consent?.voice!==true)throw new Error('학생 관리에서 음성 이용 동의를 확인해 주세요.');
    for(const key of ['E','C','A','N','O','V']){const field=$('participantScore'+key);if(field.value!==''&&(!Number.isFinite(Number(field.value))||Number(field.value)<0||Number(field.value)>100))throw new Error(key+' 점수는 0–100으로 입력해 주세요.');}
    for(const field of container.querySelectorAll('input[type=number]'))if(!field.checkValidity())throw new Error('연구 조건의 숫자 범위를 확인해 주세요.');
    return snapshot();
  }
  const safe=fn=>Promise.resolve().then(fn).catch(onError);
  function updateLocks(recording=isRecording()) {
    const locked=isLocked();container.querySelectorAll('input,select').forEach(input=>input.disabled=locked);
    $('participantRecord').disabled=locked&&!recording;$('participantRecord').textContent=recording?'녹음 종료 · 전체 분석':'녹음 시작';
    $('participantUpload').disabled=locked;$('participantHistory').disabled=locked;
    $('participantReadyState').textContent=recording?'녹음 중 · 종료하면 전체 구간을 분석합니다.':'선택한 학생의 고유 번호로 기록합니다.';
  }
  $('participantRecord').onclick=()=>safe(onRecord);
  $('participantUpload').onclick=()=>safe(async()=>{await prepare();await onChooseFiles();});
  $('participantHistory').onclick=()=>safe(()=>onHistory(student.id));
  container.addEventListener('input',onDraftChange);
  updateLocks();
  return {refresh:updateLocks,updateLocks,prepare,startNew:()=>false,readSnapshot:()=>getProfileId()===student.id?snapshot():null,setDriveStatus:text=>{$('intakeDriveStatus').textContent=text;}};
}
