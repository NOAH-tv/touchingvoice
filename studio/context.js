let current = null;
export function establishContext({ uid, branchId, student, staff, branch, preview=false, assetAccess=null, mode='student' }) {
  if (current) throw new Error('학생 컨텍스트는 변경할 수 없습니다. 코칭을 다시 열어 주세요.');
  const practice=mode==='practice'&&student===null;
  if(practice)student={id:'__practice__',name:'자유 사용 · 기록 안 함',branchId,active:true,consent:{service:false,voice:false}};
  if (![uid, branchId, student?.id].every(v => typeof v === 'string' && v.length > 0 && v.length <= 200)) throw new Error('유효한 학생 식별자가 필요합니다.');
  if (student.branchId !== branchId || student.active === false) throw new Error('이 지점의 활성 학생이 아닙니다.');
  current = Object.freeze({ uid, branchId, practice, mode:practice?'practice':'student', preview:preview===true, assetAccess:assetAccess?Object.freeze(structuredClone(assetAccess)):null, student: Object.freeze(structuredClone(student)), staff: Object.freeze(structuredClone(staff)), branch: Object.freeze(structuredClone(branch)) });
  return current;
}
export function getContext() {
  if (!current) throw new Error('로그인과 학생 권한 확인이 먼저 필요합니다.');
  return current;
}
export function storageName() {
  const c = getContext();
  return 'tv-franchise-studio-v1:' + [c.uid,c.branchId,c.student.id].map(encodeURIComponent).join(':');
}
export function authorizedStudent(dashboard, studentId, branchId) {
  if (!dashboard || dashboard.branch?.id !== branchId || !Array.isArray(dashboard.students)) throw new Error('지점 권한을 확인하지 못했습니다.');
  const student = dashboard.students.find(s => s.id === studentId && s.branchId === branchId && s.active !== false);
  if (!student) throw new Error('접근할 수 없는 학생입니다. 운영 화면에서 학생을 다시 선택해 주세요.');
  if (student.consent?.service !== true || student.consent?.voice !== true) throw new Error('학생 관리에서 개인정보·음성 수집 동의를 먼저 확인해 주세요.');
  return student;
}
export function postParent(message) {
  if (globalThis.parent && parent !== globalThis.window) parent.postMessage(message, location.origin);
}
export function isParentMessage(event) {
  return event.origin === location.origin && event.source === parent && parent !== window;
}
