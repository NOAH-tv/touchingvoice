import { initAuth, signIn, signOut } from './auth.js?v=parallel-20260911';
import { call, config } from './api.js?v=parallel-20260911';
import { coreMetricSummary } from './core-metrics.js?v=core-summary-20260910';

const $ = (selector, root = document) => root.querySelector(selector);
const e = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const TZ = 'Asia/Seoul';
const dateParts = value => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value)).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
const dayKey = value => { const p = dateParts(value); return `${p.year}-${p.month}-${p.day}`; };
const today = () => dayKey(Date.now());
const addDays = (key, amount) => { const date = new Date(`${key}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); };
const time = value => value ? new Intl.DateTimeFormat('ko-KR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : '—';
const date = value => value ? new Intl.DateTimeFormat('ko-KR', { timeZone: TZ, month: 'long', day: 'numeric' }).format(new Date(value)) : '—';
const fullDate = value => value ? new Intl.DateTimeFormat('ko-KR', { timeZone: TZ, year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(value)) : '—';
const money = value => Number.isFinite(Number(value)) && Number(value) > 0 ? `${Number(value).toLocaleString('ko-KR')}원` : '금액 미설정';
const preview = config.preview === true && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && /\/preview\.html$/.test(location.pathname);
const roles = { owner: '본사 관리자', manager: '지점 관리자', instructor: '강사' };
const icons = {
  today: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2m-8 3h2"/>',
  students: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v2"/>',
  attendance: '<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M9 3h6v4H9zM8 14l3 3 5-6"/>',
  payments: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  studio: '<path d="M9 18h6M12 18v3m-6 0h12M5 10v2a7 7 0 0 0 14 0v-2"/><rect x="9" y="2" width="6" height="13" rx="3"/>',
  team: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5M8 10h1m6 0h1M8 13h1m6 0h1"/>',
  settings: '<path d="m9 3-1 3-3 1v4l2 1v2l-2 1v3l3 1 1 2h6l1-2 3-1v-3l-2-1v-2l2-1V7l-3-1-1-3z"/><circle cx="12" cy="12" r="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>', arrow: '<path d="m9 5 7 7-7 7"/>', refresh: '<path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/>', check: '<path d="m5 12 4 4L19 6"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>', qr: '<path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h2v2h-2zm4 0h2v4h-2zm-4 4h2v2h-2zm4 2h2"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>', lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>', copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.today}</svg>`;
const hqPages = [['hq', '본사 현황'], ['approvals', '계정·지점 승인'], ['database', '통합 데이터'], ['coaches', '발성심리지도사'], ['revenue', '매출·플랜'], ['issues', '장애·문의']];
const pages = [...hqPages, ['today', '오늘의 운영'], ['calendar', '수업 캘린더'], ['students', '학생'], ['attendance', '출석·수강권'], ['payments', '결제 요청'], ['notifications', '자동 알림'], ['studio', '코칭 스튜디오'], ['team', '지점·강사']];
Object.assign(icons, { coaches: icons.students, notifications: icons.clock, hq: icons.today, approvals: icons.lock, database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>', revenue: icons.payments, issues: icons.info });
const S = { user: null, session: null, data: null, hq: null, branchId: '', page: 'today', requestEpoch: 0, search: '', instructorFilter: '', calendarDate: today(), calendarMode: 'month', calendarDensity: 'overview', databaseBranch: '', databaseInstructor: '', coachBranch: '', coachSearch: '', approvalMode: 'accounts', calendarTrail: [], modalStack: [], modalRoute: null, restoringModal: false, pageState: {}, studioReturn: null, attendanceMode: 'packs', paymentFilter: 'open', databaseMode: 'voice', modalEpoch: 0, busy: false };
let calendarDrag = null, calendarClickSuppressedUntil = 0;
const admin = () => ['owner', 'manager'].includes(S.session?.staff?.role);
const owner = () => S.session?.staff?.role === 'owner';
const hqBranches = () => S.hq?.branches || [];
const hqStudents = () => S.hq?.students || [];
const hqStudent = id => hqStudents().find(student => student.id === id);
const hqBranch = id => hqBranches().find(branch => branch.id === id);
const applications = () => (S.hq?.applications || []).filter(application => application.status === 'pending');
const pendingApprovalCount = () => applications().length + (S.hq?.branchApplications || []).filter(application => application.status === 'pending').length;
const metricNumber = value => typeof value === 'number' && Number.isFinite(value) ? value : typeof value?.median === 'number' ? value.median : typeof value?.mean === 'number' ? value.mean : null;
const metric = (exam, key) => { const value = metricNumber(exam.metrics?.[key] ?? exam.metrics?.voiceMetrics?.[key] ?? exam.metadata?.metrics?.[key]); return value === null ? '—' : Number(value.toFixed(2)).toLocaleString('ko-KR'); };
const personality = record => record.personality || record.metadata?.personality || record.metadata?.big5 || null;
const kindLabel = kind => kind === 'direct' ? '직영점' : kind === 'franchise' ? '가맹점' : '미지정';
const planLabel = plan => ({ trial: '체험', standard: '스탠다드', pro: '프로' })[plan] || '플랜 미지정';
const planStatusLabel = status => ({ trial: '체험 중', active: '이용 중', suspended: '이용 중지' })[status] || '설정 전';
const students = () => S.data?.students || [];
const lessons = () => S.data?.lessons || [];
const attendances = () => S.data?.attendances || [];
const packs = () => S.data?.packs || [];
const payments = () => S.data?.paymentRequests || [];
const studentBy = id => students().find(student => student.id === id) || (owner() ? hqStudent(id) : null);
const studentName = id => studentBy(id)?.name || '학생 정보 없음';
const staffList = () => { const list = (S.data?.staff || []).filter(person => person.active !== false); if (S.session?.staff && !list.some(person => person.uid === S.session.staff.uid)) return [S.session.staff, ...list]; return list; };
const instructorName = uid => staffList().find(person => person.uid === uid)?.name || (owner() ? (S.hq?.staff || []).find(person => person.uid === uid)?.name : '') || '담당 지도사';
const activePack = id => packs().filter(pack => pack.studentId === id && pack.status === 'active').sort((a, b) => Number(b.cycle) - Number(a.cycle))[0];
const currentPack = id => activePack(id) || packs().filter(pack => pack.studentId === id).sort((a, b) => Number(b.cycle) - Number(a.cycle))[0];
const attendanceFor = lesson => attendances().find(row => row.lessonId === lesson.id && row.studentId === lesson.studentId && row.status !== 'void');
const upcoming = () => lessons().filter(lesson => lesson.status === 'scheduled').sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
const openPayments = () => payments().filter(payment => !['paid', 'cancelled'].includes(payment.status));
const lessonLabels = { scheduled: ['수업 예정', 'purple'], completed: ['수업 완료', 'green'], cancelled: ['취소', 'gray'] };
const paymentLabels = { pending_setup: ['연결 준비', 'amber'], queued: ['발송 대기', 'purple'], sent: ['링크 발송됨', 'blue'], uncertain: ['발송 확인 필요', 'red'], paid: ['납부 완료', 'green'], cancelled: ['취소', 'gray'] };
const badge = (text, tone = '') => `<span class="badge ${e(tone)}">${e(text)}</span>`;
const lessonBadge = lesson => { const checked = attendanceFor(lesson); return lesson.status === 'scheduled' && checked ? badge('출석 확인', 'green') : badge(...(lessonLabels[lesson.status] || ['상태 확인', 'gray'])); };
const paymentBadge = payment => badge(...(paymentLabels[payment.status] || ['상태 확인', 'gray']));
const button = (label, action, id = '', tone = 'secondary', extra = '') => `<button class="button ${e(tone)}" data-action="${e(action)}" data-id="${e(id)}" ${extra}>${label}</button>`;
const packProgress = pack => { const used = Math.min(4, Math.max(0, Number(pack?.used || 0))); return pack ? `<div class="pack-progress" aria-label="4회 중 ${used}회 완료">${[0,1,2,3].map(index => `<span class="pack-dot ${index < used ? 'done' : ''}"></span>`).join('')}<b>${used} / 4</b></div>` : '<span class="muted">수강권 미등록</span>'; };
const studentCell = student => `<div class="student-name"><span class="avatar">${e(student.name?.slice(0, 1) || '학')}</span><button class="text-button" data-action="student-detail" data-id="${e(student.id)}">${e(student.name)}<span class="secondary-line">${e(instructorName(student.instructorUid))} 강사</span></button></div>`;
const empty = (title, detail = '', action = '') => `<div class="empty-state">${icon('calendar')}<p>${e(title)}</p>${detail ? `<small>${e(detail)}</small>` : ''}${action}</div>`;
const table = (headers, rows, emptyText = '등록된 내역이 없습니다.') => `<div class="table-wrap"><table><thead><tr>${headers.map(header => `<th scope="col">${header}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td colspan="${headers.length}" class="empty-cell">${e(emptyText)}</td></tr>`}</tbody></table></div>`;
const heading = (eyebrow, title, description, actions = '') => `<div class="page-heading"><div><p class="eyebrow">${e(eyebrow)}</p><h1>${e(title)}</h1><p>${e(description)}</p></div><div class="heading-actions">${actions}</div></div>`;
const notice = (text, tone = '') => `<div class="info-strip ${e(tone)}">${icon('info')}<span>${e(text)}</span></div>`;
const detailItem = (label, value) => `<div class="detail-item"><small>${e(label)}</small><p>${e(value || '미입력')}</p></div>`;
const errorMessage = error => error?.message || '요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.';

function toast(message, isError = false) {
  const element = $('#toast'); element.textContent = message; element.classList.toggle('error', isError); element.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { element.hidden = true; }, isError ? 6500 : 3800);
}
function showScreen(name) { for (const id of ['bootState', 'loginScreen', 'pendingScreen', 'portal']) $(`#${id}`).hidden = id !== name; }
function loginError(error) { $('#loginError').textContent = errorMessage(error); $('#loginError').hidden = false; }
const BOOT_CACHE_KEY = 'tv:boot:display:v1';
function clearBootCache() { try { sessionStorage.removeItem(BOOT_CACHE_KEY); } catch {} }
function readBootCache(uid) {
  try {
    const record = JSON.parse(sessionStorage.getItem(BOOT_CACHE_KEY) || 'null');
    if (!record || record.uid !== uid || record.boot?.session?.staff?.uid !== uid || !Array.isArray(record.boot.session.branches) || !Number.isFinite(record.at) || Date.now() < record.at || Date.now() - record.at > 30 * 60 * 1000) { clearBootCache(); return null; }
    return record.boot;
  } catch { clearBootCache(); return null; }
}
function writeBootCache(boot) {
  try { sessionStorage.setItem(BOOT_CACHE_KEY, JSON.stringify({uid:S.user.uid, at:Date.now(), boot})); } catch { clearBootCache(); }
}
function showCachedBoot(boot) {
  // Display only: no tv:session event, studio initialization, or interactive controls.
  S.session = boot.session; S.data = boot.dashboard; S.hq = boot.hq;
  S.branchId = boot.session.activeBranchId || boot.session.branches[0]?.id || '';
  S.page = owner() ? 'hq' : 'today';
  try { renderNav(); render(); $('#portal').inert = true; $('#lastSynced').textContent = '이전 기록 · 현재 권한과 최신 정보 확인 중'; }
  catch { clearBootCache(); showConnectionShell(); }
  finally { S.session = null; S.data = null; S.hq = null; S.branchId = ''; }
}
function clearPrivateState({ preserveCache = false } = {}) { if (!preserveCache) clearBootCache(); S.requestEpoch++; S.user = null; S.session = null; S.data = null; S.hq = null; S.branchId = ''; S.studentReturn = null; resetHistory(); $('#branchApplicationStatus').replaceChildren(); $('#branchApplyForm').reset(); $('#applyForm').reset(); $('#pendingError').hidden = true; $('#mainContent').replaceChildren(); $('#studioMount').replaceChildren(); $('#studioStudent').replaceChildren(); $('#branchSelect').replaceChildren(); $('#staffName').textContent = ''; $('#staffRole').textContent = ''; $('#staffAvatar').textContent = ''; closeModal(); document.title = '터칭보이스 · 로그인'; window.dispatchEvent(new CustomEvent('tv:session', { detail: null })); }
async function onAuth(user) {
  const preserveCache = Boolean(user && !S.user);
  clearPrivateState({ preserveCache }); S.user = user;
  if (!user) { showScreen('loginScreen'); return; }
  showConnectionShell(); const cached = readBootCache(user.uid); if (cached) showCachedBoot(cached); await establishSession();
}
function showConnectionShell() {
  // No cached student, financial or permission data is exposed before approval.
  $('#portal').inert = true; $('#mainContent').hidden = false; $('#studioView').hidden = true;
  $('#mainNav').innerHTML = '<p class="nav-section">COACH WORKSPACE</p><p>코칭 스튜디오</p><p>오늘의 운영</p><p>수업 캘린더</p><p>학생 · 기록</p>';
  $('#mainContent').innerHTML = '<div class="page-heading"><div><p class="eyebrow">TOUCHINGVOICE</p><h1>코칭 워크스페이스</h1><p role="status">현재 접근 권한과 최신 기록을 함께 확인하고 있습니다.</p></div></div><div class="page-loading"><div class="skeleton"></div><div class="skeleton"></div></div>';
  showScreen('portal');
}
async function establishSession() {
  if (!S.user) return;
  const epoch = ++S.requestEpoch, startedAt = Date.now();
  try {
    const boot = await call('boot');
    const session = boot.session;
    if (epoch !== S.requestEpoch) return;
    if (session?.staff?.uid !== S.user.uid || !Array.isArray(session.branches)) throw new Error('이 계정의 운영 권한을 확인할 수 없습니다. 관리자에게 문의해 주세요.');
    writeBootCache(boot);
    S.session = session; S.branchId = session.activeBranchId || session.branches[0]?.id || ''; S.page = owner() ? 'hq' : 'today';
    $('#branchSelect').innerHTML = session.branches.map(branch => `<option value="${e(branch.id)}">${e(branch.name)}</option>`).join(''); $('#branchSelect').value = S.branchId;
    $('#staffName').textContent = session.staff.name || session.staff.email; $('#staffRole').textContent = roles[session.staff.role] || '승인된 구성원'; $('#staffAvatar').textContent = (session.staff.name || session.staff.email || 'T').slice(0, 1);
    $('#previewNotice').hidden = !preview; $('#previewRole').value = session.staff.role; S.data = boot.dashboard; S.hq = boot.hq; $('#lastSynced').title = `초기 데이터 연결 ${((Date.now() - startedAt) / 1000).toFixed(2)}초`; $('#portal').inert = false; showScreen('portal'); $('#lastSynced').textContent = `${time(Date.now())} 서버에서 동기화`; renderNav(); render(); window.dispatchEvent(new CustomEvent('tv:session', { detail: session }));
    if (!preview && owner() && S.session === session && S.data) { navigate('studio'); }
  } catch (error) {
    if (epoch !== S.requestEpoch) return;
    clearBootCache(); S.session = null; S.data = null; S.hq = null; $('#mainContent').replaceChildren(); $('#portal').inert = false; $('#pendingEmail').textContent = S.user?.email || '로그인된 계정'; $('#pendingMessage').textContent = errorMessage(error); showScreen('pendingScreen'); loadBranchApplications();
  }
}
async function refresh({ quiet = false } = {}) {
  if (!S.session) return;
  const epoch = ++S.requestEpoch; $('#refreshButton').disabled = true;
  if (!quiet) $('#mainContent').innerHTML = '<div class="page-loading" role="status" aria-label="운영 데이터 불러오는 중"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';
  try {
    const boot = await call('boot', {}, S.branchId); if (epoch !== S.requestEpoch) return;
    if (boot.session?.staff?.uid !== S.user?.uid) throw new Error('현재 로그인 계정의 권한을 다시 확인해 주세요.');
    if (boot.session.staff.role !== S.session.staff.role || JSON.stringify(boot.session.branches.map(b => b.id)) !== JSON.stringify(S.session.branches.map(b => b.id))) { await onAuth(S.user); return; }
    writeBootCache(boot); S.session = boot.session; S.data = boot.dashboard; S.hq = boot.hq; $('#lastSynced').textContent = `${time(Date.now())} 서버에서 동기화`; renderNav(); render();
  } catch (error) {
    if (epoch !== S.requestEpoch) return;
    if (['UNAUTHENTICATED','FORBIDDEN','STAFF_APPROVAL_REQUIRED','EMAIL_VERIFICATION_REQUIRED'].includes(error.code)) { await onAuth(S.user); return; }
    $('#lastSynced').textContent = '연결 상태 확인 필요';
    const message = error instanceof ReferenceError || error instanceof TypeError ? '화면을 준비하는 중 문제가 발생했습니다. 새로고침 후 다시 확인해 주세요.' : errorMessage(error);
    if (quiet && S.data) toast(message, true);
    else $('#mainContent').innerHTML = `<div class="page-error"><h2>운영 정보를 불러오지 못했습니다.</h2><p>${e(message)}</p>${button('다시 불러오기', 'refresh', '', 'primary')}</div>`;
  } finally { if (epoch === S.requestEpoch) $('#refreshButton').disabled = false; }
}
function renderNav() {
  const branchOrder = ['studio','today','calendar','students','attendance','payments','notifications','revenue','team','issues'];
  const orderedPages = owner() ? pages : pages.slice().sort((a, b) => branchOrder.indexOf(a[0]) - branchOrder.indexOf(b[0]));
  $('#mainNav').innerHTML = orderedPages.filter(([id]) => (!['team','notifications'].includes(id) || admin()) && (!hqPages.some(([key]) => key === id) || owner() || id === 'issues' || (id === 'revenue' && admin()))).map(([id, title]) => { const label = id === 'revenue' && !owner() ? '지점 매출' : title; return `${id === 'hq' ? '<p class="nav-section">HEADQUARTERS</p>' : id === 'today' && owner() ? '<p class="nav-section">BRANCH OPERATIONS</p>' : ''}<button class="nav-button ${S.page === id ? 'active' : ''}" data-page="${id}" title="${label}" ${S.page === id ? 'aria-current="page"' : ''}>${icon(id)}<span>${label}</span>${id === 'payments' && openPayments().length ? `<span class="nav-count">${openPayments().length}</span>` : id === 'approvals' && pendingApprovalCount() ? `<span class="nav-count">${pendingApprovalCount()}</span>` : ''}</button>`; }).join('');
  $('#settingsNav').innerHTML = `${icon('settings')}<span>설정</span>`; $('#settingsNav').classList.toggle('active', S.page === 'settings');
}
const viewKeys = ['search','instructorFilter','calendarDate','calendarMode','calendarDensity','databaseMode','databaseBranch','databaseInstructor','coachBranch','coachSearch','attendanceMode','paymentFilter','approvalMode','calendarTrail'];
function saveView() { S.pageState[S.page] = { ...Object.fromEntries(viewKeys.map(key => [key, S[key]])), scrollY: window.scrollY }; }
function restoreView(page) { const saved = S.pageState[page]; if (saved) { for (const key of viewKeys) if (key in saved) S[key] = saved[key]; } else { S.search = ''; S.instructorFilter = ''; } return saved?.scrollY || 0; }
function resetHistory() { S.studentReturn = null; clearCalendarDrag(); S.pageState = {}; S.studioReturn = null; S.databaseBranch = ''; S.databaseInstructor = ''; S.coachBranch = ''; S.coachSearch = ''; S.calendarTrail = []; closeModal(); }
function navigate(page, { openStudio = true } = {}) {
  clearCalendarDrag();
  if (['team','notifications'].includes(page) && !admin()) return;
  if (hqPages.some(([key]) => key === page) && !owner() && page !== 'issues' && !(page === 'revenue' && admin())) return;
  saveView();
  if (page === 'studio' && S.page !== 'studio' && openStudio) S.studioReturn = { page: S.page, branchId: S.branchId, showDetail: false, views: structuredClone(S.pageState) };
  S.page = [...pages.map(([id]) => id), 'settings'].includes(page) ? page : 'today'; const scrollY = restoreView(S.page); renderNav(); render();
  window.dispatchEvent(new CustomEvent('tv:navigate', { detail: { page: S.page, branchId: S.branchId } }));
  if (S.page === 'studio') {
    $('#studioStudent').focus({ preventScroll: true });
    if (openStudio) void launchStudio($('#studioStudent').value).catch(error => toast(errorMessage(error), true));
  } else { $('#mainContent').focus({ preventScroll: true }); requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'instant' })); }
}
function render() {
  clearCalendarDrag();
  if (!S.data || !S.session) return;
  $('#mainContent').classList.toggle('calendar-overview', S.page === 'calendar' && S.calendarMode === 'month' && S.calendarDensity === 'overview');
  const label = S.page === 'revenue' && !owner() ? '지점 매출' : pages.find(([id]) => id === S.page)?.[1] || '설정'; $('#breadcrumbLabel').textContent = label; document.title = `${label} · 터칭보이스`;
  $('#mainContent').hidden = S.page === 'studio'; $('#studioView').hidden = S.page !== 'studio';
  if (S.page === 'studio') { renderStudio(); return; }
  const renderers = { hq: renderHQ, approvals: renderApprovals, database: renderDatabase, coaches: renderCoaches, notifications: renderNotifications, revenue: renderRevenue, issues: renderIssues, today: renderToday, calendar: renderCalendar, students: renderStudents, attendance: renderAttendance, payments: renderPayments, team: renderTeam, settings: renderSettings };
  $('#mainContent').innerHTML = renderers[S.page]();
  if (S.page === 'notifications') window.dispatchEvent(new CustomEvent('tv:notifications-open', { detail: { container: $('#notificationsMount'), branchId: S.branchId, session: S.session } }));
}
function summaryCard(label, value, unit, note, symbol) { return `<div class="stat-card"><div class="stat-top">${e(label)}${icon(symbol)}</div><div class="stat-value ${String(value).length > 7 ? 'compact-value' : ''}">${e(value)}<span>${e(unit)}</span></div><div class="stat-note">${e(note)}</div></div>`; }
function branchRevenue(id) { const ready = S.hq?.revenueByBranch?.find(row => row.branchId === id); if (ready) return ready; const list = (S.hq?.paymentRequests || []).filter(payment => payment.branchId === id); return { confirmedAmount: list.filter(payment => payment.status === 'paid').reduce((sum, payment) => sum + Number(payment.amount || 0), 0), pendingAmount: list.filter(payment => !['paid', 'cancelled'].includes(payment.status)).reduce((sum, payment) => sum + Number(payment.amount || 0), 0) }; }
function branchTable() {
  return table(['지점', '운영 형태', '플랜', '학생 · 강사', '확인된 수강료', '관리'], hqBranches().map(branch => {
    const studentCount = hqStudents().filter(student => student.branchId === branch.id && student.active !== false).length; const staffCount = (S.hq?.staff || []).filter(person => person.active !== false && person.branchIds?.includes(branch.id)).length;
    return `<tr><td><strong>${e(branch.name)}</strong><small class="secondary-line">${branch.active === false ? '비활성 지점' : '등록된 지점'}</small></td><td>${badge(kindLabel(branch.kind), branch.kind === 'direct' ? 'purple' : 'amber')}</td><td>${e(planLabel(branch.plan))}<small class="secondary-line">${e(planStatusLabel(branch.planStatus))}</small></td><td>${studentCount}명 · ${staffCount}명</td><td class="amount">${Number(branchRevenue(branch.id).confirmedAmount || 0).toLocaleString('ko-KR')}원</td><td><div class="table-actions">${button('설정', 'branch-edit', branch.id, 'small ghost')}${button('운영 화면', 'branch-switch', branch.id, 'small secondary')}</div></td></tr>`;
  }), '아직 등록된 지점이 없습니다. 지점 추가로 시작하세요.');
}
function renderHQ() {
  const branches = hqBranches(); const direct = branches.filter(branch => branch.kind === 'direct').length; const franchise = branches.filter(branch => branch.kind === 'franchise').length; const exams = S.hq?.exams || []; const issues = (S.hq?.issues || []).filter(issue => issue.status !== 'resolved'); const revenue = S.hq?.revenue || {};
  return `${heading('HEADQUARTERS CONTROL ROOM', '본사 운영 현황', '지점, 구성원, 데이터와 매출을 한곳에서 확인합니다.', button(`${icon('plus')}지점 추가`, 'branch-new') + button(`${icon('lock')}계정·지점 승인 ${pendingApprovalCount()}`, 'go-approvals', '', 'primary'))}<div class="hq-command"><div><span class="command-light"></span><p>TOUCHINGVOICE NETWORK</p><h2>모든 지점의 운영을<br>하나의 기준으로.</h2><span>계정 승인부터 코칭 기록, 재결제 관리까지</span></div><div class="network-summary"><div><small>직영점</small><strong>${direct}<span>곳</span></strong></div><span class="network-divider"></span><div><small>가맹점</small><strong>${franchise}<span>곳</span></strong></div><span class="network-orbit" aria-hidden="true">${icon('team')}</span></div></div><div class="stats-grid">${summaryCard('운영 지점', branches.filter(branch => branch.active !== false).length, '곳', `직영 ${direct}곳 · 가맹 ${franchise}곳`, 'team')}${summaryCard('전체 학생', hqStudents().filter(student => student.active !== false).length, '명', `등록 구성원 ${(S.hq?.staff || []).filter(person => person.active !== false).length}명`, 'students')}${summaryCard('누적 음성 검사', exams.length, '건', '학생·지점에 연결된 저장 기록', 'studio')}${summaryCard('확인된 수강료', Number(revenue.confirmedAmount || 0).toLocaleString('ko-KR'), '원', '납부 완료로 확인된 결제 요청 합계', 'revenue')}</div><div class="hq-alert-row"><button data-page="approvals" class="action-card"><span class="action-card-icon">${icon('lock')}</span><span><strong>계정·지점 승인 대기 <b>${pendingApprovalCount()}</b></strong><small>본사에서 역할과 지점을 지정해 주세요.</small></span>${icon('arrow')}</button><button data-page="issues" class="action-card"><span class="action-card-icon amber">${icon('info')}</span><span><strong>미해결 장애·문의 <b>${issues.length}</b></strong><small>접수된 문의의 처리 상태를 관리합니다.</small></span>${icon('arrow')}</button></div><section class="panel"><div class="panel-header"><div><h2>지점별 운영 현황 <span>${branches.length}</span></h2><p>직영점과 가맹점의 현황을 구분해 확인하세요.</p></div><button class="button small ghost" data-page="revenue">매출·플랜 ${icon('arrow')}</button></div>${branchTable()}</section><div class="hq-bottom-grid"><section class="panel"><div class="panel-header"><h2>데이터 자산</h2><button class="button small ghost" data-page="database">통합 데이터 ${icon('arrow')}</button></div><div class="asset-metrics"><div><strong>${hqStudents().length}</strong><span>학생 프로필</span></div><div><strong>${exams.length}</strong><span>음성 검사</span></div><div><strong>${personalityRecords().length}</strong><span>성격 기록</span></div></div><div class="panel-footer"><span>실제로 등록·저장된 기록을 기준으로 집계합니다.</span></div></section><section class="panel"><div class="panel-header"><h2>서버 상태 수집</h2>${badge('연결 전', 'amber')}</div><div class="panel-body"><p class="help">현재는 강사가 접수한 장애·문의 내역을 확인할 수 있습니다. 서버 오류 자동 수집은 연결 전이며 정상 여부를 판단하지 않습니다.</p><div class="card-actions">${button('장애·문의 보기', 'go-issues', '', 'ghost')}</div></div></section></div>`;
}
function renderApprovals() {
  const pending = applications(); const branchRequests = (S.hq?.branchApplications || []).filter(application => application.status === 'pending'); const approved = (S.hq?.staff || []).filter(person => person.active !== false);
  const content = S.approvalMode === 'branches' ? `<section class="panel"><div class="panel-header"><div><h2>지점 가입 신청 <span>${branchRequests.length}</span></h2><p>주소와 담당자를 확인한 후 지점·관리자 계정을 함께 승인합니다.</p></div></div>${table(['신청 지점', '주소', '담당자', '신청 계정', '관리'], branchRequests.map(application => `<tr><td>${e(application.name)}<small class="secondary-line">${e(date(application.createdAt))} 신청</small></td><td class="wrap-cell">${e(application.address)}</td><td>${e(application.contactName)}<small class="secondary-line">${e(application.contactPhone)}</small></td><td>${e(application.applicantName)}<small class="secondary-line">${e(application.email)}</small></td><td>${button('지점 승인 검토', 'branch-approve', application.id, 'small primary')}</td></tr>`), '승인을 기다리는 지점 가입 신청이 없습니다.')}</section>` : `<section class="panel"><div class="panel-header"><div><h2>계정 승인 대기 <span>${pending.length}</span></h2><p>신청자의 실제 소속을 확인한 후 승인해 주세요.</p></div></div>${table(['신청자', '로그인 이메일', '신청일', '상태', '관리'], pending.map(application => `<tr><td>${e(application.name)}</td><td>${e(application.email)}</td><td>${e(date(application.createdAt))}</td><td>${badge('본사 승인 대기', 'amber')}</td><td>${button('역할 지정·승인', 'staff-approve', application.id, 'small primary')}</td></tr>`), '승인을 기다리는 계정이 없습니다.')}</section>`;
  return `${heading('ACCOUNT & BRANCH APPROVAL', '계정·지점 승인', '본사 승인을 받은 계정만 지점과 학생 데이터에 접근할 수 있습니다.', button(`${icon('plus')}초대 코드 발급`, 'staff-invite', '', 'primary'))}<div class="toolbar"><div class="segmented"><button data-action="approval-mode" data-id="accounts" class="${S.approvalMode === 'accounts' ? 'active' : ''}">강사 계정 ${pending.length}</button><button data-action="approval-mode" data-id="branches" class="${S.approvalMode === 'branches' ? 'active' : ''}">지점 가입 ${branchRequests.length}</button></div></div>${notice('로그인과 신청만으로 운영 권한이 생기지 않습니다. 지점 가입을 승인하면 해당 신청자에게 지점 관리자 권한이 함께 부여됩니다.')}${content}<section class="panel"><div class="panel-header"><h2>승인된 구성원 <span>${approved.length}</span></h2></div>${table(['이름', '이메일', '역할', '담당 지점'], approved.map(person => `<tr><td>${person.role === 'owner' ? e(person.name || '이름 미입력') : coachLink(person.uid)}</td><td>${e(person.email)}</td><td>${badge(roles[person.role] || '강사', person.role === 'owner' ? 'amber' : 'purple')}</td><td>${person.role === 'owner' ? '전체 지점' : e((person.branchIds || []).map(id => hqBranch(id)?.name || '지점').join(' · '))}</td></tr>`))}</section>`;
}
function personalityRecords() {
  const result = []; for (const student of hqStudents()) { const scores = personality(student); if (scores && Object.values(scores).some(value => Number.isFinite(Number(value)) && value !== null && value !== '')) result.push({ id: `student-${student.id}`, studentId: student.id, branchId: student.branchId, createdAt: student.createdAt, scores, source: '학생 프로필' }); }
  for (const exam of S.hq?.exams || []) { const scores = personality(exam); if (scores && Object.values(scores).some(value => Number.isFinite(Number(value)) && value !== null && value !== '')) result.push({ id: exam.id, studentId: exam.studentId, branchId: exam.branchId, createdAt: exam.createdAt, scores, source: '검사 기록' }); }
  return result;
}
function hqFilterStaff(branchId = S.databaseBranch) {
  return (S.hq?.staff || []).filter(person => person.active !== false && (!branchId || person.branchIds?.includes(branchId) || hqStudents().some(student => student.branchId === branchId && student.instructorUid === person.uid)) && (person.role !== 'owner' || hqStudents().some(student => student.instructorUid === person.uid)));
}
function databaseFilters() {
  return `<div class="toolbar-group database-filters"><div><label for="databaseBranch">1. 지점</label><select id="databaseBranch" class="filter-select"><option value="">전체 지점</option>${hqBranches().map(branch => `<option value="${e(branch.id)}" ${S.databaseBranch === branch.id ? 'selected' : ''}>${e(branch.name)}</option>`).join('')}</select></div><div><label for="databaseInstructor">2. 담당 발성심리지도사</label><select id="databaseInstructor" class="filter-select"><option value="">전체 지도사</option>${hqFilterStaff().map(person => `<option value="${e(person.uid)}" ${S.databaseInstructor === person.uid ? 'selected' : ''}>${e(person.name || person.email)}</option>`).join('')}</select></div><div class="search-field">${icon('search')}<input id="databaseSearch" type="search" aria-label="통합 데이터 검색" placeholder="학생 이름 또는 지점 검색" value="${e(S.search)}"></div></div>`;
}
function recordMatches(record) {
  const student = hqStudent(record.studentId || record.id); const branchId = record.branchId || student?.branchId;
  return (!S.databaseBranch || branchId === S.databaseBranch) && (!S.databaseInstructor || student?.instructorUid === S.databaseInstructor) && (!S.search.trim() || `${student?.name || ''} ${hqBranch(branchId)?.name || ''}`.toLocaleLowerCase().includes(S.search.trim().toLocaleLowerCase()));
}
function coachLink(uid) { const person = (S.hq?.staff || []).find(item => item.uid === uid); return person ? `<button class="text-button" data-action="coach-detail" data-id="${e(uid)}">${e(person.name || person.email)}</button>` : '<span class="muted">담당 정보 없음</span>'; }
function renderDatabase() {
  const exams = S.hq?.exams || []; const personalities = personalityRecords();
  return `${heading('INTEGRATED DATA LIBRARY', '통합 데이터', '지점을 선택한 뒤 담당 발성심리지도사별로 학생과 검사 기록을 탐색합니다.')}<div class="stats-grid three">${summaryCard('학생 프로필', hqStudents().length, '명', '학생 가입 계정과 구분되는 운영 프로필', 'students')}${summaryCard('음성 데이터', exams.length, '건', '검사 완료 후 저장된 분석 기록', 'studio')}${summaryCard('성격 데이터', personalities.length, '건', '직접 입력된 성격 점수 기록', 'database')}</div><div class="toolbar"><div class="segmented">${[['voice', '음성 데이터'], ['personality', '성격 데이터'], ['profiles', '학생 정보']].map(([id, label]) => `<button data-action="database-mode" data-id="${id}" class="${S.databaseMode === id ? 'active' : ''}">${label}</button>`).join('')}</div></div>${databaseFilters()}<section class="panel"><div id="databaseTable">${databaseTable()}</div></section>${notice('음성 지표와 성격 점수는 함께 저장·조회할 수 있지만, 상관관계나 진단 결과를 자동으로 의미하지 않습니다.')}`;
}
function databaseTable() {
  const studentLink = id => `<button class="text-button" data-action="hq-student" data-id="${e(id)}">${e(hqStudent(id)?.name || '학생 정보 없음')}</button>`;
  if (S.databaseMode === 'profiles') return table(['학생', '지점', '담당 발성심리지도사', '연락처', '음성 동의', '관리'], hqStudents().filter(recordMatches).map(student => `<tr><td>${studentLink(student.id)}</td><td>${e(hqBranch(student.branchId)?.name)}</td><td>${coachLink(student.instructorUid)}</td><td>${e(student.phone || '미입력')}</td><td>${badge(student.consent?.voice ? '동의' : '미동의', student.consent?.voice ? 'green' : 'gray')}</td><td>${button('학생 기록', 'hq-student', student.id, 'small ghost')}</td></tr>`), '선택한 지점·지도사 조건에 맞는 학생이 없습니다.');
  if (S.databaseMode === 'personality') { const score = (record, key) => { const value = record.scores[key] ?? record.scores[key.toLowerCase()]; return value === '' || value === null || value === undefined ? '—' : e(value); }; return table(['학생 · 지점', '담당 지도사', '외향 E', '성실 C', '우호 A', '정서 N', '개방 O', '기록'], personalityRecords().filter(recordMatches).map(record => `<tr><td>${studentLink(record.studentId)}<small class="secondary-line">${e(hqBranch(record.branchId)?.name)}</small></td><td>${coachLink(hqStudent(record.studentId)?.instructorUid)}</td>${['E','C','A','N','O'].map(key => `<td>${score(record, key)}</td>`).join('')}<td>${e(date(record.createdAt))}<small class="secondary-line">${e(record.source)}</small></td></tr>`), '선택한 조건에 해당하는 성격 기록이 없습니다.'); }
  return table(['검사일', '학생 · 지점', '담당 지도사', '기본 주파수', 'Jitter', 'Shimmer', 'HNR', '기록'], (S.hq?.exams || []).filter(recordMatches).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(exam => `<tr><td>${e(date(exam.createdAt))}<small class="secondary-line">${e(time(exam.createdAt))}</small></td><td>${studentLink(exam.studentId)}<small class="secondary-line">${e(hqBranch(exam.branchId)?.name)}</small></td><td>${coachLink(hqStudent(exam.studentId)?.instructorUid)}</td><td>${metric(exam, 'f0')} <small>Hz</small></td><td>${metric(exam, 'jitter')} <small>%</small></td><td>${metric(exam, 'shimmer')} <small>%</small></td><td>${metric(exam, 'hnr')} <small>dB</small></td><td>${button('상세 지표', 'exam-detail', exam.id, 'small ghost')}</td></tr>`), '선택한 조건에 해당하는 음성 검사 기록이 없습니다.');
}
const trainingLabels = { not_started: '미이수', in_progress: '이수 중', completed: '이수 완료', expired: '갱신 필요' };
const conditionLabels = { not_assessed: '점검 전', stable: '양호 · 수기 확인', follow_up: '후속 점검 필요' };
const coachQuality = uid => (S.hq?.staffQuality || []).find(item => item.uid === uid) || { uid, training: { status: 'not_started' }, voiceReviews: [] };
const trainingBadge = status => badge(trainingLabels[status] || '미이수', status === 'completed' ? 'green' : status === 'expired' ? 'amber' : status === 'in_progress' ? 'purple' : 'gray');
function renderCoaches() {
  const staff = hqFilterStaff(S.coachBranch); const list = staff.filter(person => !S.coachSearch || `${person.name} ${person.email}`.toLocaleLowerCase().includes(S.coachSearch.toLocaleLowerCase()));
  return `${heading('VOCAL PSYCHOLOGY COACHES', '발성심리지도사', '과정 이수 상태와 직접 확인한 발성 점검을 누적 관리합니다.')}<div class="stats-grid three">${summaryCard('등록 지도사', hqFilterStaff('').length, '명', '승인된 지도사·지점 관리 구성원', 'students')}${summaryCard('과정 이수 완료', hqFilterStaff('').filter(person => coachQuality(person.uid).training?.status === 'completed').length, '명', '본사가 확인한 이수 기록 기준', 'check')}${summaryCard('후속 발성 점검', hqFilterStaff('').filter(person => coachQuality(person.uid).voiceReview?.condition === 'follow_up').length, '명', '가장 최근 수기 점검 상태 기준', 'studio')}</div><div class="toolbar"><div class="toolbar-group"><select id="coachBranch" class="filter-select" aria-label="지도사 소속 지점"><option value="">전체 지점</option>${hqBranches().map(branch => `<option value="${e(branch.id)}" ${S.coachBranch === branch.id ? 'selected' : ''}>${e(branch.name)}</option>`).join('')}</select><div class="search-field">${icon('search')}<input id="coachSearch" type="search" placeholder="지도사 이름 또는 이메일" aria-label="지도사 검색" value="${e(S.coachSearch)}"></div></div><span class="list-count">${list.length}명</span></div><section class="panel"><div id="coachTable">${coachTable(list)}</div></section>${notice('이수 여부와 발성 상태는 담당자가 확인한 기록입니다. 자동 품질 점수나 음성 기반 성격 판정을 만들지 않습니다.')}`;
}
function coachTable(list = hqFilterStaff(S.coachBranch).filter(person => !S.coachSearch || `${person.name} ${person.email}`.toLocaleLowerCase().includes(S.coachSearch.toLocaleLowerCase()))) {
  return table(['지도사', '소속 지점', '과정 이수', '최근 발성 점검', '담당 학생', '관리'], list.map(person => { const quality = coachQuality(person.uid); const review = quality.voiceReview; return `<tr><td>${coachLink(person.uid)}<small class="secondary-line">${e(person.email)}</small></td><td>${e((person.branchIds || []).map(id => hqBranch(id)?.name || '지점').join(' · '))}</td><td>${trainingBadge(quality.training?.status)}<small class="secondary-line">${e(quality.training?.course || '과정 미등록')}</small></td><td>${review ? badge(conditionLabels[review.condition] || '점검 전', review.condition === 'stable' ? 'green' : review.condition === 'follow_up' ? 'amber' : 'gray') : badge('점검 전', 'gray')}<small class="secondary-line">${review?.assessedAt ? e(date(review.assessedAt)) : '기록 없음'} · ${Number(quality.voiceReviewCount || quality.voiceReviews?.length || 0)}회</small></td><td>${hqStudents().filter(student => student.instructorUid === person.uid).length}명</td><td>${button('이수·점검 관리', 'coach-detail', person.uid, 'small secondary')}</td></tr>`; }), '해당하는 발성심리지도사가 없습니다.');
}
function renderNotifications() { return `<div id="notificationsMount"><div class="empty-state" role="status"><p>알림 정보를 불러오고 있습니다.</p></div></div>`; }
function renderRevenue() {
  if (!owner()) return renderBranchRevenue();
  const revenue = S.hq?.revenue || {}; const requests = S.hq?.paymentRequests || []; const paid = requests.filter(payment => payment.status === 'paid'); const max = Math.max(1, ...hqBranches().map(branch => Number(branchRevenue(branch.id).confirmedAmount || 0)));
  return `${heading('REVENUE & BRANCH PLANS', '매출·플랜', '실제 확인된 수강료와 지점별 프로그램 이용 플랜을 구분해 관리합니다.')}<div class="stats-grid three">${summaryCard('납부 확인된 수강료', Number(revenue.confirmedAmount || 0).toLocaleString('ko-KR'), '원', `납부 완료 요청 ${paid.length}건`, 'payments')}${summaryCard('진행 중 결제 요청', Number(revenue.pendingAmount || 0).toLocaleString('ko-KR'), '원', '미납·발송 대기 상태의 설정 금액 합계', 'clock')}${summaryCard('유료 플랜 지점', hqBranches().filter(branch => branch.kind === 'franchise' && branch.plan !== 'trial' && branch.planStatus === 'active').length, '곳', '플랜 이용 상태 기준 · 구독 청구는 별도 연결', 'team')}</div><div class="hq-bottom-grid"><section class="panel"><div class="panel-header"><h2>지점별 확인된 수강료</h2></div><div class="revenue-bars">${hqBranches().map(branch => { const amount = Number(branchRevenue(branch.id).confirmedAmount || 0); return `<div class="revenue-bar-row"><div><span>${e(branch.name)}</span><strong>${amount.toLocaleString('ko-KR')}원</strong></div><div class="revenue-track"><i style="width:${amount / max * 100}%"></i></div></div>`; }).join('') || empty('등록된 지점이 없습니다.')}</div></section><section class="panel"><div class="panel-header"><h2>플랜 운영</h2>${badge('본사 관리', 'purple')}</div><div class="panel-body"><ul class="plain-list"><li>직영점<small>본사 직접 운영</small></li><li>가맹점<small>체험·스탠다드·프로</small></li><li>플랜 상태<small>체험·이용 중·이용 중지</small></li><li>월 이용료 청구<small>연결 준비</small></li></ul><p class="form-note">플랜 설정이 카드 결제나 정기 청구를 실행하지는 않습니다. 실제 요금과 청구 주기는 확정 후 결제 업체에 연결합니다.</p></div></section></div><section class="panel"><div class="panel-header"><h2>지점별 플랜과 매출</h2></div>${branchTable()}</section><section class="panel"><div class="panel-header"><h2>최근 납부 확인</h2></div>${table(['학생', '지점', '금액', '상태', '요청일'], paid.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10).map(payment => `<tr><td>${e(hqStudent(payment.studentId)?.name || '학생')}</td><td>${e(hqBranch(payment.branchId)?.name)}</td><td class="amount">${money(payment.amount)}</td><td>${badge('납부 완료', 'green')}</td><td>${e(date(payment.createdAt))}</td></tr>`), '아직 납부 확인된 요청이 없습니다.')}</section>`;
}
function renderIssues() {
  const issues = owner() ? S.hq?.issues || [] : S.data?.issues || []; const open = issues.filter(issue => issue.status === 'open').length; const inProgress = issues.filter(issue => issue.status === 'in_progress').length; const resolved = issues.filter(issue => issue.status === 'resolved').length;
  return `${heading('SUPPORT & INCIDENTS', '장애·문의', owner() ? '모든 지점의 오류 제보와 운영 문의를 접수하고 처리합니다.' : '사용 중 발생한 문제를 본사에 접수하고 진행 상황을 확인합니다.', button(`${icon('plus')}문의·오류 접수`, 'issue-new', '', 'primary'))}<div class="stats-grid three">${summaryCard('새 접수', open, '건', '확인 대기 중인 문의', 'info')}${summaryCard('처리 중', inProgress, '건', '담당자가 확인 중인 문의', 'clock')}${summaryCard('해결 완료', resolved, '건', '처리 내용이 기록된 문의', 'check')}</div>${notice('이 목록은 직접 접수한 문의입니다. 서버 오류 자동 수집은 연결 전이므로 미접수 오류 수를 표시하지 않습니다.', 'amber')}<section class="panel">${table(['제목', '지점', '유형', '상태', '접수일', '관리'], issues.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(issue => `<tr><td>${e(issue.title)}</td><td>${e(owner() ? hqBranch(issue.branchId)?.name : S.data.branch?.name)}</td><td>${e(({ bug: '기능 오류', server: '연결·서버', other: '운영 문의' })[issue.kind] || '운영 문의')}</td><td>${issueBadge(issue.status)}</td><td>${e(date(issue.createdAt))}</td><td>${button(owner() ? '확인·처리' : '진행 보기', 'issue-detail', issue.id, 'small secondary')}</td></tr>`), '접수된 장애·문의가 없습니다.')}</section>`;
}
function renderBranchRevenue() {
  const revenue = S.data?.revenue || {}; const list = payments().slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return `${heading('BRANCH REVENUE', '지점 매출', `${S.data.branch?.name || '현재 지점'}의 납부 확인된 수강료와 진행 중 결제를 확인합니다.`)}<div class="stats-grid three">${summaryCard('납부 확인된 수강료', Number(revenue.confirmedAmount || 0).toLocaleString('ko-KR'), '원', '납부가 확인된 결제 요청의 누적 합계', 'payments')}${summaryCard('진행 중 결제 금액', Number(revenue.pendingAmount || 0).toLocaleString('ko-KR'), '원', '미납·발송 대기 요청의 설정 금액 합계', 'clock')}${summaryCard('납부 완료', list.filter(payment => payment.status === 'paid').length, '건', '완료된 납부 확인 기록', 'check')}</div><section class="panel"><div class="panel-header"><h2>학생별 결제 내역</h2><button class="button small ghost" data-page="payments">결제 요청 관리 ${icon('arrow')}</button></div>${table(['요청일', '학생', '결제 금액', '상태', '관리'], list.map(payment => `<tr><td>${e(date(payment.createdAt))}</td><td>${e(studentName(payment.studentId))}</td><td class="amount">${money(payment.amount)}</td><td>${paymentBadge(payment)}</td><td>${button('요청 보기', 'payment-detail', payment.id, 'small ghost')}</td></tr>`), '아직 등록된 결제 요청이 없습니다.')}</section>${notice('이 합계는 서비스에 기록된 결제 요청 중 납부가 확인된 금액입니다. 외부에서 받은 수강료 전체를 자동 수집한 값은 아닙니다.')}`;
}
function issueBadge(status) { return badge(({ open: '접수됨', in_progress: '처리 중', resolved: '해결 완료' })[status] || '접수됨', status === 'resolved' ? 'green' : status === 'in_progress' ? 'purple' : 'amber'); }
function renderToday() {
  const todays = lessons().filter(lesson => dayKey(lesson.startAt) === today() && lesson.status !== 'cancelled').sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  const completed = todays.filter(lesson => lesson.status === 'completed').length; const checked = todays.filter(lesson => lesson.status === 'scheduled' && attendanceFor(lesson)).length;
  const renewals = openPayments().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const stat = (label, value, unit, note, symbol) => `<div class="stat-card"><div class="stat-top">${label}${icon(symbol)}</div><div class="stat-value">${value}<span>${unit}</span></div><div class="stat-note">${e(note)}</div></div>`;
  const rows = todays.map(lesson => `<tr><td class="time-cell">${e(time(lesson.startAt))}<small>${e(time(lesson.endAt))} 종료</small></td><td>${studentBy(lesson.studentId) ? studentCell(studentBy(lesson.studentId)) : e(studentName(lesson.studentId))}</td><td>${lessonBadge(lesson)}</td><td><div class="table-actions">${button('수업 보기', 'lesson-detail', lesson.id, 'small ghost')}${lesson.status === 'scheduled' && !attendanceFor(lesson) ? button('출석 확인', 'attendance-mark', lesson.id, 'small secondary') : ''}</div></td></tr>`);
  return `${heading('YOUR DAILY WORKSPACE', '오늘의 운영', `${fullDate(Date.now())} · ${S.data.branch?.name || '선택한 지점'}`, button(`${icon('plus')}학생 등록`, 'student-new') + button(`${icon('calendar')}수업 예약`, 'lesson-new', '', 'primary'))}<div class="stats-grid">${stat('오늘의 수업', todays.length, '건', `수업 완료 ${completed}건 · 진행 대기 ${todays.length - completed}건`, 'calendar')}${stat('출석 확인', checked + completed, '명', `수업 전 출석 ${checked}명 · 완료 ${completed}명`, 'attendance')}${stat('재결제 관리', renewals.length, '건', '4회 수강을 마친 후 생성된 결제 요청', 'payments')}${stat('관리 중인 학생', students().filter(student => student.active !== false).length, '명', '현재 계정이 담당하는 활성 학생', 'students')}</div><div class="content-columns"><div><section class="panel"><div class="panel-header"><div><h2>오늘의 수업 <span>${todays.length}</span></h2><p>출석을 확인하고 수업이 끝나면 완료 처리해 주세요.</p></div><button class="button small ghost" data-page="calendar">캘린더 ${icon('arrow')}</button></div>${table(['시간', '학생 · 담당 강사', '상태', '진행'], rows, '오늘 예정된 수업이 없습니다. 수업 예약으로 일정을 추가하세요.')}<div class="panel-footer"><span>${checked ? `${checked}명이 출석 후 수업 완료를 기다리고 있습니다.` : 'QR 출석 확인만으로 수강 횟수가 차감되지는 않습니다.'}</span></div></section><section class="panel"><div class="panel-header"><div><h2>재결제 요청 <span>${renewals.length}</span></h2><p>4회 완료 → 결제 요청 생성 → 결제 확인 → 다음 수강권</p></div><button class="button small ghost" data-page="payments">전체 보기 ${icon('arrow')}</button></div>${table(['학생', '요청 금액', '진행 상태', '관리'], renewals.slice(0, 4).map(payment => `<tr><td><button class="text-button" data-action="student-detail" data-id="${e(payment.studentId)}">${e(studentName(payment.studentId))}</button><small class="secondary-line">${e(date(payment.createdAt))} 생성</small></td><td class="amount">${money(payment.amount)}</td><td>${paymentBadge(payment)}</td><td>${button('요청 보기', 'payment-detail', payment.id, 'small ghost')}</td></tr>`), '아직 재결제 요청이 없습니다. 4회 수업을 완료하면 자동 생성됩니다.')}</section></div><div class="side-stack"><section class="panel"><div class="panel-header"><div><h2>다음 수업</h2><p>등록된 일정에서 가까운 수업을 보여드립니다.</p></div>${icon('clock')}</div>${upcoming().filter(lesson => new Date(lesson.endAt) >= Date.now()).slice(0, 4).length ? `<div class="lesson-list">${upcoming().filter(lesson => new Date(lesson.endAt) >= Date.now()).slice(0, 4).map(lesson => `<div class="lesson-list-item"><div class="lesson-list-time">${e(time(lesson.startAt))}<small>${e(date(lesson.startAt))}</small></div><div class="lesson-list-info"><button class="text-button" data-action="lesson-detail" data-id="${e(lesson.id)}"><strong>${e(studentName(lesson.studentId))}</strong></button><small>${e(lesson.title || '보컬 코칭')} · ${e(instructorName(lesson.instructorUid))}</small></div>${lessonBadge(lesson)}</div>`).join('')}</div>` : empty('다음 일정을 준비해 주세요.', '수업을 예약하면 이곳에 표시됩니다.')}</section><section class="panel"><div class="panel-header"><h2>한 번에 이어지는 수업 운영</h2></div><div class="pipeline">${[['01', '학생 등록', '정보·동의 입력, 담당 강사 지정'], ['02', '수업 예약과 QR 출석', '학생은 회원가입 없이 출석'], ['03', '코칭과 수업 완료', '목소리 기록, 4회 수강권 차감'], ['04', '다음 수강권 준비', '결제 요청과 납부 확인']].map(([number, title, subtitle]) => `<div class="pipeline-row"><span class="pipeline-number">${number}</span><div><strong>${title}</strong><small>${subtitle}</small></div>${icon('arrow')}</div>`).join('')}</div></section></div></div>`;
}
function instructorOptions(selected = '', all = false, branchId = S.branchId) { const available = owner() && S.hq ? (S.hq.staff || []).filter(person => person.active !== false && (person.role === 'owner' || person.branchIds?.includes(branchId))) : staffList(); return `${all ? '<option value="">전체 강사</option>' : '<option value="">담당 강사 선택</option>'}${available.filter(person => admin() || person.uid === S.session.staff.uid).map(person => `<option value="${e(person.uid)}" ${person.uid === selected ? 'selected' : ''}>${e(person.name || person.email)} · ${e(roles[person.role] || '강사')}</option>`).join('')}`; }
function studentOptions(selected = '') { return '<option value="">학생 선택</option>' + students().filter(student => student.active !== false || student.id === selected).map(student => `<option value="${e(student.id)}" ${student.id === selected ? 'selected' : ''}>${e(student.name)} · ${e(instructorName(student.instructorUid))}${student.phone ? ` · ${e(student.phone.slice(-4))}` : ''}</option>`).join(''); }
function renderStudents() {
  return `${heading('STUDENT MANAGEMENT', '학생', '이름이 같아도 별도 학생으로 관리하며, 검사·수업·결제 이력을 연결합니다.', button(`${icon('plus')}학생 등록`, 'student-new', '', 'primary'))}<div class="toolbar"><div class="toolbar-group"><div class="search-field">${icon('search')}<input id="studentSearch" type="search" placeholder="학생 이름 또는 연락처 검색" aria-label="학생 검색" value="${e(S.search)}"></div><select id="instructorFilter" class="filter-select" aria-label="강사 필터">${instructorOptions(S.instructorFilter, true)}</select></div><span class="list-count">총 ${students().length}명</span></div><section class="panel"><div id="studentTable">${studentTable()}</div></section>`;
}
function studentTable() {
  const query = S.search.trim().toLocaleLowerCase(); const list = students().filter(student => (!query || `${student.name} ${student.phone || ''} ${student.guardianPhone || ''}`.toLocaleLowerCase().includes(query)) && (!S.instructorFilter || student.instructorUid === S.instructorFilter));
  return table(['학생 · 담당', '연락처', '이번 수강권', '최근 수업', '동의', '관리'], list.map(student => { const last = lessons().filter(lesson => lesson.studentId === student.id && lesson.status === 'completed').sort((a, b) => new Date(b.startAt) - new Date(a.startAt))[0]; return `<tr class="member-row"><td>${studentCell(student)}${student.active === false ? `<small class="secondary-line">비활성 학생</small>` : ''}</td><td>${e(student.phone || '미입력')}${student.guardianPhone ? `<small class="secondary-line">보호자 ${e(student.guardianPhone)}</small>` : ''}</td><td>${packProgress(currentPack(student.id))}</td><td>${last ? `${e(date(last.startAt))}<small class="secondary-line">${e(time(last.startAt))}</small>` : '<span class="muted">수업 이력 없음</span>'}</td><td>${badge(student.consent?.voice ? '음성 활용 동의' : '음성 동의 없음', student.consent?.voice ? 'green' : 'gray')}</td><td><div class="table-actions">${button('상세', 'student-detail', student.id, 'small ghost')}${student.active !== false ? button(`${icon('qr')}QR`, 'qr-issue', student.id, 'small secondary') : ''}</div></td></tr>`; }), query ? '검색 조건에 맞는 학생이 없습니다.' : '아직 등록된 학생이 없습니다. 학생 등록으로 시작하세요.');
}
function rescheduleBlockedReason(lesson) {
  if (!lesson || lesson.status !== 'scheduled') return '수업 예정 상태에서만 일정을 변경할 수 있습니다.';
  if (attendanceFor(lesson)) return '출석 확인된 수업은 일정을 변경할 수 없습니다.';
  if (!admin() && lesson.instructorUid !== S.session?.staff?.uid) return '본인이 담당하는 수업만 변경할 수 있습니다.';
  return '';
}
function canRescheduleLesson(lesson) { return Boolean(S.session) && !rescheduleBlockedReason(lesson); }
function proposalForDrop(lesson, targetDate, minute = null) {
  const original = Date.parse(lesson.startAt), duration = Date.parse(lesson.endAt) - original;
  const midnight = Date.parse(`${targetDate}T00:00:00+09:00`);
  if (!Number.isFinite(original) || !Number.isFinite(midnight) || !Number.isFinite(duration) || duration <= 0) throw new Error('수업 시간을 확인할 수 없습니다.');
  const start = minute === null ? original + midnight - Date.parse(`${dayKey(lesson.startAt)}T00:00:00+09:00`) : midnight + Math.max(540, Math.min(1365, Math.round(minute / 15) * 15)) * 60000;
  return { startAt: new Date(start).toISOString(), endAt: new Date(start + duration).toISOString() };
}
function localInputValue(iso) { return `${dayKey(iso)}T${time(iso)}`; }
function parseLocalInput(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(value || '')) throw new Error('변경할 날짜와 시간을 입력해 주세요.');
  const parsed = new Date(`${value.length === 16 ? value + ':00' : value}+09:00`);
  if (!Number.isFinite(+parsed)) throw new Error('변경할 날짜와 시간을 확인해 주세요.');
  return parsed.toISOString();
}
function readRescheduleProposal(form) {
  const startValue = form.elements.startAt.value, endValue = form.elements.endAt.value;
  return { startAt: startValue === form.dataset.proposedStartValue ? form.dataset.proposedStartAt : parseLocalInput(startValue), endAt: endValue === form.dataset.proposedEndValue ? form.dataset.proposedEndAt : parseLocalInput(endValue) };
}
function rescheduleSummary(startAt, endAt) { return `${fullDate(startAt)} ${time(startAt)} → ${dayKey(startAt) === dayKey(endAt) ? '' : date(endAt) + ' '}${time(endAt)}`; }
function rescheduleForm(id, proposal = null) {
  const lesson = lessons().find(item => item.id === id); if (!canRescheduleLesson(lesson)) return toast(rescheduleBlockedReason(lesson), true);
  const proposed = proposal || { startAt: lesson.startAt, endAt: lesson.endAt }; const startValue = localInputValue(proposed.startAt), endValue = localInputValue(proposed.endAt);
  openModal('수업 일정 변경', `<form id="rescheduleForm" data-id="${e(id)}" data-branch-id="${e(lesson.branchId || S.branchId)}" data-expected-start-at="${e(lesson.startAt)}" data-expected-end-at="${e(lesson.endAt)}" data-proposed-start-at="${e(proposed.startAt)}" data-proposed-end-at="${e(proposed.endAt)}" data-proposed-start-value="${e(startValue)}" data-proposed-end-value="${e(endValue)}" data-duration="${Date.parse(lesson.endAt) - Date.parse(lesson.startAt)}"><p class="modal-subtitle">${e(studentName(lesson.studentId))} · ${e(instructorName(lesson.instructorUid))} · ${e(lesson.title || '보컬 수업')}</p><div class="reschedule-comparison"><div><small>변경 전</small><p>${e(rescheduleSummary(lesson.startAt, lesson.endAt))}</p></div><span aria-hidden="true">↓</span><div class="proposed"><small>변경 후 · 저장 전</small><p id="rescheduleSummary">${e(rescheduleSummary(proposed.startAt, proposed.endAt))}</p></div></div><div class="form-grid"><div><label for="rescheduleStart">변경할 시작 시간</label><input id="rescheduleStart" name="startAt" type="datetime-local" value="${e(startValue)}" required step="60"></div><div><label for="rescheduleEnd">변경할 종료 시간</label><input id="rescheduleEnd" name="endAt" type="datetime-local" value="${e(endValue)}" required step="60"></div><div class="span-2"><label for="rescheduleReason">변경 메모 <span class="muted">선택</span></label><input id="rescheduleReason" name="reason" maxlength="500" placeholder="예: 학생 요청으로 수업 시간 조정"></div></div><p class="form-note">시간은 한국 시간 기준입니다. 저장하기 전에는 실제 일정이 바뀌지 않습니다. 담당 강사나 학생의 다른 수업과 겹치면 저장할 수 없습니다.</p><div class="form-footer"><button class="button ghost" type="button" data-action="modal-back">이전 단계</button><button class="button primary" type="submit">일정 변경 저장</button></div></form>`, 'MOVE LESSON');
}
async function reloadReschedule(id) {
  const form = $('#rescheduleForm'); let proposed = null; try { if (form) proposed = readRescheduleProposal(form); } catch {}
  const epoch = S.modalEpoch; await refresh({ quiet: true }); if (epoch !== S.modalEpoch) return;
  const lesson = lessons().find(item => item.id === id);
  if (!canRescheduleLesson(lesson)) { formError(rescheduleBlockedReason(lesson)); if (form?.isConnected) form.querySelector('[type="submit"]').disabled = true; return; }
  S.restoringModal = true; try { rescheduleForm(id, proposed); } finally { S.restoringModal = false; }
}
function clearCalendarHover() {
  $('#mainContent')?.querySelectorAll('.calendar-drop-active').forEach(target => { target.classList.remove('calendar-drop-active'); delete target.dataset.dropLabel; });
  $('#mainContent')?.querySelectorAll('.calendar-drop-marker').forEach(marker => marker.remove());
}
function clearCalendarDrag() {
  calendarDrag?.source?.classList.remove('is-dragging'); clearCalendarHover(); calendarDrag = null; $('#mainContent')?.classList.remove('is-moving-lesson');
}
function dragProposal(event, target) {
  const lesson = lessons().find(item => item.id === calendarDrag?.id); if (!lesson || !canRescheduleLesson(lesson)) return null;
  const minute = target.dataset.calendarDrop === 'week' ? 540 + (event.clientY - target.getBoundingClientRect().top) / 70 * 60 - calendarDrag.offsetMinutes : null;
  return proposalForDrop(lesson, target.dataset.calendarDate, minute);
}
function handleCalendarDragStart(event) {
  const source = event.target.closest('[data-reschedule-id]'); if (!source) return;
  const lesson = lessons().find(item => item.id === source.dataset.rescheduleId);
  if (S.busy || !canRescheduleLesson(lesson) || !event.dataTransfer) { event.preventDefault(); return; }
  const duration = (Date.parse(lesson.endAt) - Date.parse(lesson.startAt)) / 60000;
  calendarDrag = { id: lesson.id, branchId: S.branchId, uid: S.session.staff.uid, source, offsetMinutes: source.classList.contains('calendar-event') ? Math.max(0, Math.min(duration, (event.clientY - source.getBoundingClientRect().top) / 70 * 60)) : 0 };
  event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-touchingvoice-lesson', lesson.id); event.dataTransfer.setData('text/plain', lesson.id);
  source.classList.add('is-dragging'); $('#mainContent').classList.add('is-moving-lesson');
  const status = $('#calendarDragStatus'); if (status) status.textContent = '수업을 놓을 날짜와 시간을 선택하세요. 놓은 후 이동 내용을 확인할 수 있습니다.';
}
function handleCalendarDragOver(event) {
  const target = event.target.closest('[data-calendar-drop]');
  if (!target || !calendarDrag || calendarDrag.branchId !== S.branchId || calendarDrag.uid !== S.session?.staff?.uid || S.busy) return;
  const proposal = dragProposal(event, target); if (!proposal) return;
  event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; clearCalendarHover(); target.classList.add('calendar-drop-active');
  if (target.dataset.calendarDrop === 'week') {
    const [hour, minute] = time(proposal.startAt).split(':').map(Number); const marker = document.createElement('div'); marker.className = 'calendar-drop-marker'; marker.style.top = `${(hour * 60 + minute - 540) / 60 * 70}px`; marker.textContent = `${time(proposal.startAt)} · 놓고 확인`; target.append(marker);
  } else target.dataset.dropLabel = `${date(proposal.startAt)}로 이동 · 놓고 확인`;
}
function handleCalendarDrop(event) {
  const target = event.target.closest('[data-calendar-drop]');
  if (!target || !calendarDrag || calendarDrag.branchId !== S.branchId || calendarDrag.uid !== S.session?.staff?.uid || S.busy) return;
  event.preventDefault(); const id = calendarDrag.id; const proposal = dragProposal(event, target); calendarClickSuppressedUntil = Date.now() + 450; clearCalendarDrag();
  if (proposal) rescheduleForm(id, proposal);
}
function weekStart(key) { const date = new Date(`${key}T12:00:00Z`); const day = date.getUTCDay(); return addDays(key, -(day === 0 ? 6 : day - 1)); }
function monthDates(key) {
  const first = key.slice(0, 7) + '-01'; const firstWeek = weekStart(first);
  return Array.from({ length: 42 }, (_, index) => addDays(firstWeek, index));
}
function shiftMonth(key, amount) {
  const date = new Date(`${key.slice(0, 7)}-01T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + amount);
  const year = date.getUTCFullYear(), month = date.getUTCMonth(); const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(Number(key.slice(-2)), last)).padStart(2, '0')}`;
}
function renderCalendar() {
  const first = weekStart(S.calendarDate); const days = S.calendarMode === 'month' ? monthDates(S.calendarDate) : Array.from({ length: 7 }, (_, index) => addDays(first, index));
  const selected = lessons().filter(lesson => lesson.status !== 'cancelled' && (S.calendarMode === 'day' ? dayKey(lesson.startAt) === S.calendarDate : days.includes(dayKey(lesson.startAt))) && (!S.instructorFilter || lesson.instructorUid === S.instructorFilter));
  const title = S.calendarMode === 'month' ? `${Number(S.calendarDate.slice(0,4))}년 ${Number(S.calendarDate.slice(5,7))}월` : S.calendarMode === 'week' ? `${date(`${first}T12:00:00+09:00`)} – ${date(`${days[6]}T12:00:00+09:00`)}` : fullDate(`${S.calendarDate}T12:00:00+09:00`);
  const calendar = S.calendarMode === 'month' ? monthCalendar(days, selected) : S.calendarMode === 'week' ? weekCalendar(days, selected) : `<section class="panel">${table(['시간', '학생', '수업', '상태', '관리'], selected.sort((a, b) => new Date(a.startAt) - new Date(b.startAt)).map(lesson => `<tr><td class="time-cell">${e(time(lesson.startAt))} – ${e(time(lesson.endAt))}</td><td>${e(studentName(lesson.studentId))}<small class="secondary-line">${e(instructorName(lesson.instructorUid))}</small></td><td>${e(lesson.title || '보컬 코칭')}</td><td>${lessonBadge(lesson)}</td><td>${button('수업 보기', 'lesson-detail', lesson.id, 'small secondary')}</td></tr>`), '이 날짜에 예약된 수업이 없습니다.')}</section>`;
  return `${heading('LESSON CALENDAR', '수업 캘린더', '월간 전체 일정부터 주간·일간 수업까지 이어서 확인합니다.', button(`${icon('plus')}수업 예약`, 'lesson-new', '', 'primary'))}<div class="toolbar"><div class="calendar-heading">${S.calendarTrail.length ? button('← 이전 보기', 'calendar-back', '', 'small ghost') : ''}<h2>${e(title)}</h2><div class="calendar-navigation">${button('‹', 'calendar-prev', '', 'small ghost', 'aria-label="이전 기간"')}${button('오늘', 'calendar-today', '', 'small secondary')}${button('›', 'calendar-next', '', 'small ghost', 'aria-label="다음 기간"')}</div></div><div class="toolbar-group" style="width:auto">${S.calendarMode === 'month' ? `<div class="segmented calendar-density" aria-label="월간 일정 표시"><button data-action="calendar-density" data-id="overview" class="${S.calendarDensity === 'overview' ? 'active' : ''}" aria-pressed="${S.calendarDensity === 'overview'}">한눈 보기</button><button data-action="calendar-density" data-id="detailed" class="${S.calendarDensity === 'detailed' ? 'active' : ''}" aria-pressed="${S.calendarDensity === 'detailed'}">상세 보기</button></div>` : ''}<select id="instructorFilter" class="filter-select" aria-label="지도사별 일정">${instructorOptions(S.instructorFilter, true)}</select><div class="segmented" aria-label="캘린더 보기">${[['month','월간'],['week','주간'],['day','일간']].map(([mode,label]) => `<button data-action="calendar-${mode}" class="${S.calendarMode === mode ? 'active' : ''}" aria-pressed="${S.calendarMode === mode}">${label}</button>`).join('')}</div></div></div><div class="schedule-summary"><span><i class="legend-dot"></i>수업 예정</span><span><i class="legend-dot green"></i>수업 완료</span><span>${S.calendarMode === 'month' ? '표시된 날짜의 ' : ''}수업 ${selected.length}건</span></div><div class="calendar-move-help">${icon('info')}<span>${S.calendarMode === 'month' ? '예정 수업을 다른 날짜로 끌어 이동하세요. 기존 시간은 유지되며, 이동 확인 후 저장합니다.' : S.calendarMode === 'week' ? '예정 수업을 끌어 날짜와 시간을 조정하세요. 15분 단위로 맞춘 뒤 확인하고 저장합니다.' : '수업 상세의 일정 변경에서 날짜와 시간을 조정할 수 있습니다.'} 출석 확인된 수업은 이동할 수 없습니다.</span></div><p id="calendarDragStatus" class="sr-only" role="status"></p>${calendar}`;
}
function monthCalendar(days, list) {
  const eventLimit = S.calendarDensity === 'overview' ? 1 : 3;
  return `<div class="calendar-shell"><div class="month-calendar ${S.calendarDensity === 'overview' ? 'is-overview' : 'is-detailed'}"><div class="month-weekdays">${['월','화','수','목','금','토','일'].map(day => `<span>${day}</span>`).join('')}</div><div class="month-days">${days.map(key => {
    const events = list.filter(lesson => dayKey(lesson.startAt) === key).sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
    return `<section data-calendar-date="${key}" data-calendar-drop="month" class="month-day ${key.slice(0,7) !== S.calendarDate.slice(0,7) ? 'outside-month' : ''} ${key === today() ? 'is-today' : ''}" aria-label="${e(fullDate(`${key}T12:00:00+09:00`))}"><div class="month-day-head"><button class="month-day-number" data-action="calendar-select-day" data-id="${key}" aria-label="${e(fullDate(`${key}T12:00:00+09:00`))} 일간 보기">${Number(key.slice(-2))}</button>${events.length ? `<span>${events.length}건</span>` : ''}</div><div class="month-events">${events.slice(0,eventLimit).map(lesson => `<button class="month-event ${e(lesson.status)} ${canRescheduleLesson(lesson) ? 'is-movable' : ''}" draggable="${canRescheduleLesson(lesson)}" data-reschedule-id="${e(lesson.id)}" data-action="lesson-detail" data-id="${e(lesson.id)}" title="${e(`${time(lesson.startAt)} ${studentName(lesson.studentId)} · ${instructorName(lesson.instructorUid)}`)}"><time>${e(time(lesson.startAt))}</time><span>${e(studentName(lesson.studentId))}</span></button>`).join('')}${events.length > eventLimit ? `<button class="month-more" data-action="calendar-select-day" data-id="${key}" aria-label="${e(date(`${key}T12:00:00+09:00`))} 수업 ${events.length}개 모두 보기">외 ${events.length - eventLimit}개 보기</button>` : ''}</div></section>`;
  }).join('')}</div></div></div>`;
}
function weekCalendar(days, list) {
  let outside = 0;
  const columns = days.map(key => {
    const events = list.filter(lesson => dayKey(lesson.startAt) === key).map(lesson => {
      const [hour, minute] = time(lesson.startAt).split(':').map(Number); const start = hour * 60 + minute; const duration = (new Date(lesson.endAt) - new Date(lesson.startAt)) / 60000;
      if (start < 540 || start >= 1380) { outside++; return null; } return { lesson, start, duration, lane: 0, count: 1 };
    }).filter(Boolean).sort((a, b) => a.start - b.start);
    let group = [], until = 0;
    const finish = () => { const lanes = []; for (const event of group) { let lane = lanes.findIndex(end => end <= event.start); if (lane < 0) lane = lanes.length; lanes[lane] = event.start + event.duration; event.lane = lane; } for (const event of group) event.count = lanes.length; group = []; };
    for (const event of events) { if (group.length && event.start >= until) finish(); group.push(event); until = Math.max(group.length === 1 ? 0 : until, event.start + event.duration); } finish();
    return `<div data-calendar-date="${key}" data-calendar-drop="week" class="calendar-day ${key === today() ? 'is-today' : ''}" aria-label="${e(fullDate(`${key}T12:00:00+09:00`))}">${events.map(({ lesson, start, duration, lane, count }) => `<button class="calendar-event ${e(lesson.status)} ${canRescheduleLesson(lesson) ? 'is-movable' : ''}" draggable="${canRescheduleLesson(lesson)}" data-reschedule-id="${e(lesson.id)}" data-action="lesson-detail" data-id="${e(lesson.id)}" style="top:${(start - 540) / 60 * 70}px;height:${Math.max(32, Math.min(duration, 1380 - start) / 60 * 70 - 4)}px;left:calc(${lane / count * 100}% + 4px);right:calc(${(count - lane - 1) / count * 100}% + 4px)" aria-label="${e(`${time(lesson.startAt)} ${studentName(lesson.studentId)} ${lesson.title || '수업'}`)}"><strong>${e(studentName(lesson.studentId))}</strong><small>${e(time(lesson.startAt))} · ${e(instructorName(lesson.instructorUid))}</small><small>${e(lesson.title || '보컬 코칭')}</small></button>`).join('')}</div>`;
  }).join('');
  return `<div class="calendar-shell"><div class="week-header"><div></div>${days.map(key => `<div class="${key === today() ? 'is-today' : ''}"><button class="text-button" data-action="calendar-select-day" data-id="${key}" aria-label="${e(fullDate(`${key}T12:00:00+09:00`))} 일간 보기">${e(new Intl.DateTimeFormat('ko-KR', { weekday: 'short', timeZone: TZ }).format(new Date(`${key}T12:00:00+09:00`)))}<b>${Number(key.slice(-2))}</b></button></div>`).join('')}</div><div class="week-body"><div class="time-axis">${Array.from({ length: 14 }, (_, index) => `<div>${String(9 + index).padStart(2, '0')}:00</div>`).join('')}</div>${columns}</div>${outside ? `<div class="calendar-outside">오전 9시 이전 또는 오후 11시 이후 수업 ${outside}건은 일간 보기에서 확인할 수 있습니다.</div>` : ''}</div>`;
}
function renderAttendance() {
  return `${heading('ATTENDANCE & CLASS PASS', '출석·수강권', '출석 확인 후 강사가 수업을 완료하면 4회 수강권에서 1회 차감됩니다.', button(`${icon('calendar')}수업 예약`, 'lesson-new', '', 'primary'))}<div class="toolbar"><div class="segmented"><button data-action="attendance-packs" class="${S.attendanceMode === 'packs' ? 'active' : ''}">수강권 현황</button><button data-action="attendance-checkins" class="${S.attendanceMode === 'checkins' ? 'active' : ''}">출석 이력</button></div><span class="list-count">진행 중 수강권 ${packs().filter(pack => pack.status === 'active').length}개</span></div>${notice('네 번째 수업 완료 시 다음 수강권 결제 요청이 한 번 생성됩니다. 납부 확인 후 새로운 4회 수강권이 발급됩니다.')}<section class="panel">${S.attendanceMode === 'packs' ? table(['학생', '수강권', '수업 완료', '상태', '관리'], packs().slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(pack => `<tr><td><button class="text-button" data-action="student-detail" data-id="${e(pack.studentId)}">${e(studentName(pack.studentId))}</button></td><td>${Number(pack.cycle || 1)}차 4회권<small class="secondary-line">${e(date(pack.createdAt))} 등록</small></td><td>${packProgress(pack)}</td><td>${badge(pack.status === 'active' ? '수강 중' : '4회 완료', pack.status === 'active' ? 'purple' : 'green')}</td><td>${button('학생 보기', 'student-detail', pack.studentId, 'small ghost')}</td></tr>`), '수강권이 없습니다. 학생 등록 시 첫 4회 수강권을 함께 등록할 수 있습니다.') : table(['출석 일시', '학생', '확인 방식', '상태', '관리'], attendances().slice().sort((a, b) => new Date(b.checkedAt) - new Date(a.checkedAt)).map(attendance => `<tr><td class="time-cell">${e(date(attendance.checkedAt))}<small>${e(time(attendance.checkedAt))}</small></td><td>${e(studentName(attendance.studentId))}</td><td>${attendance.method === 'qr' ? '학생 QR' : '강사 확인'}</td><td>${badge(({ checked_in: '출석 확인', completed: '수업 완료', void: '무효 처리' })[attendance.status] || attendance.status, attendance.status === 'completed' ? 'green' : attendance.status === 'void' ? 'gray' : 'purple')}</td><td><div class="table-actions">${button('수업 보기', 'lesson-detail', attendance.lessonId, 'small ghost')}${admin() && attendance.status !== 'void' ? button('무효 처리', 'attendance-void', attendance.id, 'small ghost') : ''}</div></td></tr>`), '출석 이력이 없습니다. QR 출석 또는 수업의 출석 확인을 사용하세요.')}</section>`;
}
function renderPayments() {
  const list = payments().filter(payment => S.paymentFilter === 'all' || (S.paymentFilter === 'paid' ? payment.status === 'paid' : !['paid', 'cancelled'].includes(payment.status))).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return `${heading('RENEWAL PAYMENTS', '결제 요청', '4회 수강이 끝난 학생의 재결제를 관리합니다.')}<div class="toolbar"><div class="segmented">${[['open', '진행 중'], ['paid', '납부 완료'], ['all', '전체']].map(([key, label]) => `<button data-action="payment-filter" data-id="${key}" class="${S.paymentFilter === key ? 'active' : ''}">${label}</button>`).join('')}</div><span class="list-count">${list.length}건</span></div>${notice('결제·알림 연동 전에는 요청이 ‘연결 준비’로 남습니다. 결제 링크를 등록해도 메시지가 자동 발송되거나 납부 완료 처리되지는 않습니다.', 'amber')}<section class="panel">${table(['요청일', '학생', '결제 금액', '진행 상태', '알림 상태', '관리'], list.map(payment => `<tr><td>${e(date(payment.createdAt))}</td><td><button class="text-button" data-action="student-detail" data-id="${e(payment.studentId)}">${e(studentName(payment.studentId))}</button></td><td class="amount">${money(payment.amount)}</td><td>${paymentBadge(payment)}</td><td><span class="secondary-line">${e(messageLabel(payment.messageStatus))}</span></td><td>${button('요청 관리', 'payment-detail', payment.id, 'small secondary')}</td></tr>`), '해당하는 결제 요청이 없습니다.')}</section>`;
}
function messageLabel(status) { return ({ sent: '발송 확인됨', delivered: '전달 확인됨', queued: '발송 대기', pending_setup: '발송 연동 준비', not_configured: '발송 연동 준비', uncertain: '확인 필요', failed: '발송 실패', cancelled: '발송 취소', not_sent: '미발송', consent_required: '알림 동의 없음' })[status] || '미발송'; }
function renderTeam() {
  return `${heading('BRANCH & INSTRUCTORS', '지점·강사', '승인된 구성원의 담당 지점과 역할을 확인합니다.', owner() ? button(`${icon('plus')}지점 추가`, 'branch-new') + button(`${icon('plus')}강사 초대`, 'staff-invite', '', 'primary') : '')}<div class="settings-grid"><section class="panel"><div class="panel-header"><h2>소속 구성원 <span>${staffList().length}</span></h2></div>${table(['이름', '이메일', '권한'], staffList().map(person => `<tr><td>${owner() || person.uid === S.session.staff.uid ? button(e(person.name || '이름 미입력'), 'staff-profile', person.uid, 'small ghost') : e(person.name || '이름 미입력')}</td><td>${e(person.email)}</td><td>${badge(roles[person.role] || '강사', person.role === 'owner' ? 'amber' : 'purple')}</td></tr>`))}</section><section class="panel"><div class="panel-header"><h2>접근 가능한 지점</h2></div><div class="panel-body"><ul class="plain-list">${S.session.branches.map(branch => `<li><span>${e(branch.name)}</span>${branch.id === S.branchId ? badge('현재 지점', 'green') : button('전환', 'branch-switch', branch.id, 'small ghost')}</li>`).join('')}</ul></div></section></div>${notice('학생은 로그인 계정을 만들지 않습니다. 강사·지점 관리자 계정의 초대와 승인은 본사에서 진행합니다.')}<section class="panel"><div class="panel-header"><h2>최근 운영 기록</h2></div><div class="audit-list">${(S.data.audit || []).slice(-8).reverse().map(item => `<div class="audit-entry"><span class="audit-action">${e(auditLabel(item.action))}</span><time>${e(date(item.createdAt || item.at))} ${e(time(item.createdAt || item.at))}</time></div>`).join('') || '<div class="empty-state"><p>표시할 운영 기록이 없습니다.</p></div>'}</div></section>`;
}
function auditLabel(action) { return ({ 'student.create': '학생 등록', 'student.update': '학생 정보 변경', 'lesson.create': '수업 예약', 'lesson.cancel': '수업 취소', 'lesson.reschedule': '수업 일정 변경', 'lesson.complete': '수업 완료', 'attendance.mark': '강사 출석 확인', 'attendance.void': '출석 무효 처리', 'qr.issue': '출석 QR 발급', 'qr.checkin': 'QR 출석 확인', 'payment.link': '결제 링크 등록', 'payment.confirmOffline': '관리자 납부 확인', 'staff.invite': '구성원 초대', 'invite.claim': '초대 수락', 'branch.create': '지점 생성', 'exam.save': '음성 검사 저장', 'pack.issueInitial': '첫 수강권 발급', 'pack.adjust': '수강 횟수 보정', 'staff.profile.update': '지도사 개인정보 변경', 'staff.settlement.record': '정산 지급 내역 기록', 'staff.settlement.void': '정산 기록 정정' })[action] || '운영 정보 변경'; }
function renderSettings() {
  return `${heading('WORKSPACE SETTINGS', '설정', '계정 권한과 서비스 연결 상태를 확인합니다.')}<div class="settings-grid"><section class="panel"><div class="panel-header"><h2>내 계정</h2>${icon('lock')}</div><div class="panel-body"><div class="detail-grid">${detailItem('이름', S.session.staff.name)}${detailItem('역할', roles[S.session.staff.role])}${detailItem('로그인 이메일', S.session.staff.email)}${detailItem('현재 지점', S.data.branch?.name)}</div><div class="card-actions">${button('내 개인정보·정산', 'staff-profile', S.session.staff.uid)}${button('로그아웃', 'logout', '', 'secondary')}</div></div></section><section class="panel"><div class="panel-header"><h2>연결 상태</h2></div><div class="panel-body"><div class="setting-row"><div><strong>운영 데이터 서버</strong><p>지점별 권한으로 학생과 수업을 불러옵니다.</p></div>${badge(preview ? '로컬 미리보기' : '연결됨', preview ? 'amber' : 'green')}</div><div class="setting-row"><div><strong>Google 로그인</strong><p>승인된 초대 계정만 서비스에 접근합니다.</p></div>${badge(config.providers?.google === false ? '연결 준비' : '사용 가능', config.providers?.google === false ? 'amber' : 'green')}</div><div class="setting-row"><div><strong>Apple 로그인</strong><p>Apple 계정 연결 설정이 필요합니다.</p></div>${badge(config.providers?.apple ? '사용 가능' : '연결 준비', config.providers?.apple ? 'green' : 'amber')}</div><div class="setting-row"><div><strong>FirstPay 결제·알림</strong><p>요청별 발송 상태와 실제 납부 상태를 구분합니다.</p></div>${badge('결제 요청에서 확인', 'purple')}</div></div></section><section class="panel"><div class="panel-header"><h2>학생 정보와 동의</h2></div><div class="panel-body"><div class="setting-row"><div><strong>학생별 이용 동의</strong><p>서비스 이용, 음성 활용, 알림, 보호자 동의를 구분해 기록합니다.</p></div></div><div class="setting-row"><div><strong>기록 연결</strong><p>동명이인은 별도 학생으로 관리합니다. 검사 전에 선택한 학생을 확인해 주세요.</p></div></div><div class="setting-row"><div><strong>권한 분리</strong><p>강사는 담당 학생과 수업을 관리하며, 지점 관리자는 배정된 지점을 관리합니다.</p></div></div></div></section><section class="panel"><div class="panel-header"><h2>수업과 결제 운영 기준</h2></div><div class="panel-body"><ul class="plain-list"><li>QR 출석 확인<small>횟수 차감 없음</small></li><li>강사의 수업 완료<small>수강권 1회 차감</small></li><li>4회 수업 완료<small>다음 결제 요청 생성</small></li><li>실제 납부 확인<small>다음 4회권 발급</small></li></ul></div></section></div>`;
}
function renderStudio() {
  const available = students().filter(student => student.active !== false && student.consent?.service === true && student.consent?.voice === true);
  const previous = $('#studioStudent').value;
  const selected = available.some(student => student.id === previous) ? previous : '';
  $('#studioStudent').innerHTML = studentOptions(selected); $('#studioStudent').innerHTML=$('#studioStudent').innerHTML.replace(/(<option value=""[^>]*>)[^<]*/, '$1자유 사용 · 기록 안 함'); $('#studioStudent').value = selected;
  $('#studioBack').textContent = '← 운영 화면으로'; $('#studioStudent').setAttribute('aria-label', '코칭할 학생 선택');
  $('#studioLaunch').textContent = '스튜디오 열기';
  if (!$('#studioNewStudent')) {
    const add = document.createElement('button'); add.id = 'studioNewStudent'; add.type = 'button';
    add.className = 'button secondary'; add.dataset.action = 'student-new'; add.textContent = '새 학생 등록';
    $('#studioBack').after(add);
  }
  if (!$('#studioMount iframe')) {
    $('#studioLaunch').hidden = false;
    $('#studioMount').innerHTML = `<div class="empty-state"><h2>코칭 스튜디오</h2><p>학생 없이 바로 사용할 수 있습니다. 학생을 선택하면 기록이 저장됩니다.</p><small>3D 발성체크 · 음성 검사 · 훈련 · 누적 기록</small><p>${button('새 학생 등록', 'student-new', '', 'primary')}${button('학생 정보 확인', 'studio-members', '', 'secondary')}</p></div>`;
  }
}
async function launchStudio(studentId, { reload = false } = {}) {
  const student = studentId ? studentBy(studentId) : null; if (studentId && !student) return toast('접근할 수 없는 학생입니다.', true);
  if (student && (student.active === false || student.consent?.service !== true || student.consent?.voice !== true)) return toast('활성 학생의 개인정보·음성 녹음 동의를 먼저 확인해 주세요.', true);
  if (S.page !== 'studio') {
    saveView(); const returnTo = { page: S.page, branchId: S.branchId, studentId, showDetail: $('#modal').open, hqStudent: S.modalRoute?.type === 'hq-student', views: structuredClone(S.pageState) };
    closeModal(); if (student?.branchId && student.branchId !== S.branchId) await changeBranch(student.branchId);
    S.studioReturn = returnTo;
  }
  navigate('studio', { openStudio: false }); $('#studioStudent').value = student?.id || '';
  window.dispatchEvent(new CustomEvent('tv:open-studio', { detail: { student, branchId: student?.branchId || S.branchId, reload } }));
}
async function returnFromStudio() {
  const previous = S.studioReturn; if (!previous) return navigate('today');
  if (previous.branchId !== S.branchId) await changeBranch(previous.branchId);
  S.pageState = previous.views; S.studioReturn = null; navigate(previous.page);
  if (previous.showDetail) { if (previous.hqStudent && owner()) hqStudentDetail(previous.studentId); else studentDetail(previous.studentId); }
}
function captureModal() {
  return { title: $('#modalTitle').textContent, eyebrow: $('#modalEyebrow').textContent, html: $('#modalBody').innerHTML, route: S.modalRoute, scrollTop: $('#modal').scrollTop, fields: Array.from($('#modalBody').querySelectorAll('input,select,textarea')).map((input, index) => ({ index, value: input.value, checked: input.checked, selected: input instanceof HTMLSelectElement ? Array.from(input.options).map(option => option.selected) : null })) };
}
function openModal(title, body, eyebrow = 'TOUCHINGVOICE WORKSPACE') {
  if ($('#modal').open && !S.restoringModal) { S.modalStack.push(captureModal()); if (S.modalStack.length > 30) S.modalStack.shift(); }
  S.modalEpoch++; S.modalRoute = null; $('#modalTitle').textContent = title; $('#modalEyebrow').textContent = eyebrow; $('#modalBody').innerHTML = body; $('#modalBack').hidden = false; $('#modalBack').textContent = S.modalStack.length ? '← 이전 단계' : '← 목록으로';
  if (!$('#modal').open) $('#modal').showModal(); $('#modal').scrollTop = 0; return S.modalEpoch;
}
function renderModalRoute(route) {
  const routes = { student: studentDetail, 'hq-student': hqStudentDetail, lesson: lessonDetail, payment: paymentDetail, issue: issueDetail, exam: examDetail, coach: coachDetail, 'staff-profile': staffProfile };
  if (!route || !routes[route.type]) return false; routes[route.type](route.id); return true;
}
function backModal({ refresh = true } = {}) {
  const frame = S.modalStack.pop(); if (!frame) return closeModal(); S.restoringModal = true;
  try {
    if (!refresh || !renderModalRoute(frame.route)) {
      openModal(frame.title, frame.html, frame.eyebrow); S.modalRoute = frame.route;
      const inputs = $('#modalBody').querySelectorAll('input,select,textarea'); for (const field of frame.fields) { const input = inputs[field.index]; if (!input || input.type === 'file') continue; input.value = field.value; if ('checked' in input) input.checked = field.checked; if (field.selected && input instanceof HTMLSelectElement) field.selected.forEach((selected, index) => { if (input.options[index]) input.options[index].selected = selected; }); }
      if ($('#qrCanvas') && $('#qrUrl')) { const target = $('#qrCanvas'), url = $('#qrUrl').value, epoch = S.modalEpoch; target.replaceChildren(); import('./qr.js').then(({ renderQR }) => { if (epoch === S.modalEpoch) return renderQR(url, target); }).catch(() => { if (epoch === S.modalEpoch) target.textContent = '아래 출석 링크를 사용해 주세요.'; }); }
    }
    $('#modalBack').hidden = false; $('#modalBack').textContent = S.modalStack.length ? '← 이전 단계' : '← 목록으로'; $('#modal').scrollTop = frame.scrollTop;
  } finally { S.restoringModal = false; }
}
function closeModal() { S.modalEpoch++; S.modalStack = []; S.modalRoute = null; if ($('#modal').open) $('#modal').close(); $('#modalBody').replaceChildren(); $('#modalBack').hidden = true; }
function formError(message) { let element = $('#modalBody .form-error'); if (!element) { element = document.createElement('p'); element.className = 'form-error'; element.setAttribute('role', 'alert'); $('#modalBody').append(element); } element.textContent = message; }
async function staffProfile(uid) {
  if (!owner() && uid !== S.session?.staff.uid) return;
  const epoch = openModal('개인정보·정산', '<p role="status">정보를 불러오고 있습니다.</p>', 'INSTRUCTOR PROFILE');
  S.modalRoute = { type: 'staff-profile', id: uid };
  try {
    const result = await call('staff.profile.read', { uid });
    if (epoch !== S.modalEpoch || !$('#modal').open) return;
    const { staff: person, profile, settlements = [] } = result, bank = profile.bank || {};
    $('#modalTitle').textContent = `${person.name} · 개인정보·정산`;
    $('#modalBody').innerHTML = `<form id="staffProfileForm" data-id="${e(uid)}" data-revision="${Number(profile.revision || 0)}"><p class="form-note">연락처·생년월일·계좌는 본인과 본사만 조회합니다. 로그인 계정과 권한은 이 화면에서 변경되지 않습니다.</p><div class="form-grid"><div><label for="staffProfileName">이름</label><input id="staffProfileName" name="name" required maxlength="80" value="${e(person.name)}"></div><div><label>로그인 이메일</label><input value="${e(person.email)}" disabled></div><div><label for="staffProfilePhone">연락처</label><input id="staffProfilePhone" name="phone" type="tel" maxlength="30" value="${e(profile.phone)}"></div><div><label for="staffProfileBirth">생년월일</label><input id="staffProfileBirth" name="birthDate" type="date" max="${today()}" value="${e(profile.birthDate)}"></div></div><p class="section-caption">소속 지점</p>${owner() && person.role !== 'owner' ? `<div class="consent-list">${hqBranches().filter(b => b.active !== false).map(b => `<label class="checkbox-label"><input type="checkbox" name="branchIds" value="${e(b.id)}" ${person.branchIds?.includes(b.id) ? 'checked' : ''}><span>${e(b.name)}</span></label>`).join('')}</div><p class="form-note">담당 학생이나 예정 수업이 남은 지점은 배정을 정리한 뒤 제외할 수 있습니다.</p>` : `<p>${e(person.role === 'owner' ? '전체 지점' : person.branchIds.map(id => S.session.branches.find(b => b.id === id)?.name || id).join(' · '))}</p>`}<p class="section-caption">정산 받을 계좌</p><div class="form-grid"><div><label for="staffBankName">은행</label><input id="staffBankName" name="bankName" maxlength="80" value="${e(bank.name)}" autocomplete="off"></div><div><label for="staffBankHolder">예금주</label><input id="staffBankHolder" name="bankHolder" maxlength="80" value="${e(bank.holder)}" autocomplete="off"></div><div class="span-2"><label for="staffBankAccount">계좌번호</label><input id="staffBankAccount" name="bankAccount" inputmode="numeric" maxlength="40" value="${e(bank.account)}" autocomplete="off"></div><div class="span-2"><label for="staffEditReason">변경 사유 <span class="muted">선택</span></label><input id="staffEditReason" name="reason" maxlength="500" placeholder="필요한 경우에만 입력하세요"></div></div><div class="form-footer"><button class="button ghost" type="button" data-action="modal-back">이전 단계</button><button class="button primary" type="submit">정보 저장</button></div></form><p class="section-caption">정산 지급 내역 · 실제 지급 확인 후 수기 기록</p>${owner() ? button('지급 내역 추가', 'settlement-new', uid, 'secondary') : ''}${table(['대상 월 · 지점', '지급일', '금액', '근거 · 상태', '관리'], settlements.map(row => `<tr><td>${e(row.period)}<small class="secondary-line">${e(hqBranch(row.branchId)?.name || S.session.branches.find(b => b.id === row.branchId)?.name || row.branchId)}</small></td><td>${e(date(row.paidAt))}</td><td>${money(row.amount)}</td><td>${e(row.reference)}<small class="secondary-line">${row.status === 'void' ? `정정 제외 · ${e(row.voidReason)}` : '지급 확인 기록'}</small></td><td>${owner() && row.status !== 'void' ? button('기록 정정', 'settlement-void', row.id, 'small ghost', `data-branch-id="${e(row.branchId)}"`) : '—'}</td></tr>`), '아직 기록된 정산 지급 내역이 없습니다.')}<p class="form-note">지급 내역을 저장해도 송금은 실행되지 않습니다. 잘못된 내역은 정정 사유와 함께 제외한 뒤 새 내역을 추가합니다.</p>`;
  } catch (error) { if (epoch === S.modalEpoch) formError(errorMessage(error)); }
}
function settlementForm(uid) {
  if (!owner()) return;
  const person = S.hq?.staff?.find(s => s.uid === uid); if (!person) return;
  const branches = hqBranches().filter(b => b.active !== false && (person.role === 'owner' || person.branchIds?.includes(b.id)));
  openModal(`${person.name} · 정산 지급 기록`, `<form id="settlementForm" data-id="${e(uid)}"><div class="form-grid"><div><label for="settlementBranch">지점</label><select id="settlementBranch" name="branchId" required>${branches.map(b => `<option value="${e(b.id)}">${e(b.name)}</option>`).join('')}</select></div><div><label for="settlementPeriod">대상 월</label><input id="settlementPeriod" name="period" type="month" required value="${today().slice(0,7)}"></div><div><label for="settlementPaidAt">실제 지급일</label><input id="settlementPaidAt" name="paidAt" type="date" max="${today()}" required value="${today()}"></div><div><label for="settlementAmount">실제 지급 금액 · 원</label><input id="settlementAmount" name="amount" type="number" min="1" max="1000000000" step="1" required></div><div class="span-2"><label for="settlementReference">지급 확인 근거</label><input id="settlementReference" name="reference" required maxlength="200" placeholder="이체 확인번호 또는 내부 정산번호"></div><div class="span-2"><label for="settlementNote">메모</label><textarea id="settlementNote" name="note" maxlength="1000"></textarea></div></div><label class="checkbox-label"><input type="checkbox" required><span>실제 지급이 완료되었고 금액과 대상을 확인했습니다.</span></label><div class="form-footer"><button class="button ghost" type="button" data-action="modal-back">이전 단계</button><button class="button primary" type="submit">지급 확인 기록</button></div></form>`);
}
function packAdjustForm(id) {
  if (!admin()) return; const pack = packs().find(p => p.id === id); if (!pack) return;
  const completed = attendances().filter(a => a.packId === id && a.status === 'completed').length;
  openModal(`${studentName(pack.studentId)} · 수강 횟수 보정`, `<form id="packAdjustForm" data-id="${e(id)}" data-expected-used="${Number(pack.used)}" data-branch-id="${e(pack.branchId)}"><p class="help">${Number(pack.cycle)}차 4회권 · 현재 사용 ${Number(pack.used)}회 · 연결된 완료 출석 ${completed}건</p><p class="form-note">출석 이력은 그대로 보존하고 수강권에 보정 내역을 추가합니다. 잘못 입력한 개별 출석은 해당 수업에서 무효 처리하세요.</p><div class="form-grid"><div><label for="packAdjustedUsed">보정 후 사용 횟수</label><input id="packAdjustedUsed" name="used" type="number" min="0" max="4" step="1" required value="${Number(pack.used)}"></div><div class="span-2"><label for="packAdjustmentReason">보정 사유</label><textarea id="packAdjustmentReason" name="reason" maxlength="500" required placeholder="예: 기존 수업 기록 이관 시 사용 횟수 정정"></textarea></div></div><div class="form-footer"><button class="button ghost" type="button" data-action="modal-back">이전 단계</button><button class="button primary" type="submit">보정 기록 저장</button></div></form>`);
}
function studentForm(id = '') {
  const student = studentBy(id) || {}; const consent = student.consent || {}; const editing = Boolean(student.id);
  openModal(editing ? '학생 정보 수정' : '새 학생 등록', `<form id="studentForm" data-id="${e(id)}" data-branch-id="${e(student.branchId || S.branchId)}"><div class="form-grid"><div><label for="studentName">이름 <span class="required">*</span></label><input id="studentName" name="name" value="${e(student.name)}" required maxlength="80" autocomplete="off" placeholder="학생 이름"></div><div><label for="studentInstructor">담당 강사 <span class="required">*</span></label><select id="studentInstructor" name="instructorUid" required>${instructorOptions(student.instructorUid || S.session.staff.uid, false, student.branchId || S.branchId)}</select></div><div><label for="studentPhone">학생 연락처</label><input id="studentPhone" name="phone" type="tel" value="${e(student.phone)}" maxlength="24" placeholder="010-0000-0000" autocomplete="off"></div><div><label for="guardianPhone">보호자 연락처</label><input id="guardianPhone" name="guardianPhone" type="tel" value="${e(student.guardianPhone)}" maxlength="24" placeholder="미성년 학생인 경우 입력" autocomplete="off"></div><div><label for="studentBirthDate">생년월일</label><input id="studentBirthDate" name="birthDate" type="date" max="${today()}" value="${e(student.birthDate)}"></div><div><label for="studentEmail">이메일</label><input id="studentEmail" name="email" type="email" maxlength="160" value="${e(student.email)}"></div><div class="span-2"><label for="studentAddress">주소</label><input id="studentAddress" name="address" maxlength="240" value="${e(student.address)}"></div><div><label for="studentBirthYear">출생 연도 · 생년월일 미입력 시</label><input id="studentBirthYear" name="birthYear" type="number" min="1900" max="${new Date().getFullYear()}" value="${e(student.birthYear)}" placeholder="예: 2000"></div>${editing && admin() ? `<div><label for="studentActive">학생 상태</label><select id="studentActive" name="active"><option value="true" ${student.active !== false ? 'selected' : ''}>활성</option><option value="false" ${student.active === false ? 'selected' : ''}>비활성</option></select></div>` : ''}<div class="span-2"><label for="studentNote">코칭 메모</label><textarea id="studentNote" name="note" maxlength="1500" placeholder="목표, 수업 시 참고할 내용을 입력하세요.">${e(student.note)}</textarea></div></div><details class="personality-fields"><summary>성격 점수 입력 <span>선택 · 검사 결과를 직접 입력</span></summary><div class="form-grid">${[['E','외향성'],['C','성실성'],['A','우호성'],['N','정서 민감성'],['O','개방성'],['V','보컬 특성']].map(([key,label]) => `<div><label for="score${key}">${label} ${key}</label><input id="score${key}" name="score${key}" type="number" min="0" max="100" step="0.1" placeholder="0–100" value="${e(student.personality?.[key])}"></div>`).join('')}</div><p class="field-help">입력된 점수만 저장합니다. 음성만으로 성격을 추정하지 않습니다.</p></details>${editing && admin() ? '<label class="checkbox-label"><input name="reassignScheduled" type="checkbox" checked><span>담당 강사 변경 시 예정 수업도 함께 배정합니다. 완료 수업의 담당 기록은 유지됩니다.</span></label>' : ''}<p class="section-caption">이용 동의 · 학생에게 내용을 안내하고 확인하세요</p><div class="consent-list"><label class="checkbox-label"><input name="service" type="checkbox" ${consent.service ? 'checked' : ''} ${editing ? '' : 'required'}><span><strong>[필수] 개인정보 수집·이용 및 서비스 이용 동의</strong><small>학생 정보·수업·출석·결제 기록을 수업 운영에 사용합니다.</small></span></label><label class="checkbox-label"><input name="voice" type="checkbox" ${consent.voice ? 'checked' : ''}><span><strong>[선택] 음성 녹음·분석 및 검사 기록 저장 동의</strong><small>코칭 스튜디오에서 녹음과 음성 분석을 사용하기 위해 필요합니다.</small></span></label><label class="checkbox-label"><input name="reminders" type="checkbox" ${consent.reminders ? 'checked' : ''}><span>수업·출석·재결제 안내 수신 동의</span></label><label class="checkbox-label"><input name="guardian" type="checkbox" ${consent.guardian ? 'checked' : ''}><span>보호자에게 내용을 안내하고 동의를 확인했습니다.</span></label></div>${!editing ? `<p class="section-caption">첫 수강권</p><label class="checkbox-label"><input name="initialPack" type="checkbox"><span><strong>첫 4회 수강권을 함께 등록합니다.</strong><small>첫 수강료 납부 또는 등록 근거를 확인한 경우 선택하세요.</small></span></label>` : '<p class="form-note">필수 서비스 동의를 철회하면 학생이 비활성화되고 기존 출석 QR이 폐기됩니다.</p>'}<div class="form-footer"><button type="button" class="button ghost" data-action="modal-close">취소</button><button type="submit" class="button primary">${editing ? '변경 저장' : '학생 등록'}</button></div></form>`, editing ? 'STUDENT PROFILE' : 'NEW STUDENT');
}
function studentDetail(id) {
  const student = studentBy(id); if (!student) return;
  const pack = currentPack(id); const history = lessons().filter(lesson => lesson.studentId === id).sort((a, b) => new Date(b.startAt) - new Date(a.startAt)).slice(0, 6);
  openModal(student.name, `<div class="detail-grid">${detailItem('담당 강사', instructorName(student.instructorUid))}${detailItem('학생 상태', student.active === false ? '비활성' : '활성')}${detailItem('학생 연락처', student.phone)}${detailItem('보호자 연락처', student.guardianPhone)}${detailItem('생년월일 · 출생 연도', student.birthDate || student.birthYear)}${detailItem('이메일', student.email)}${detailItem('주소', student.address)}${detailItem('등록일', fullDate(student.createdAt))}</div><div class="detail-section"><div class="completion-box"><div class="progress-label"><span>${pack ? `${Number(pack.cycle || 1)}차 수강권` : '수강권'}</span><span>${pack?.status === 'complete' ? '4회 완료' : pack ? '수강 중' : '미등록'}</span></div>${packProgress(pack)}</div></div><p class="section-caption">확인된 동의</p><div class="person-pills">${badge(student.consent?.service ? '서비스 동의' : '서비스 미동의', student.consent?.service ? 'green' : 'gray')}${badge(student.consent?.voice ? '음성 활용 동의' : '음성 동의 없음', student.consent?.voice ? 'green' : 'gray')}${badge(student.consent?.reminders ? '안내 수신 동의' : '안내 수신 미동의', student.consent?.reminders ? 'green' : 'gray')}</div>${student.note ? `<p class="section-caption">코칭 메모</p><p class="help" style="white-space:pre-wrap">${e(student.note)}</p>` : ''}<div class="detail-actions">${S.studentReturn?.id === id ? button('← 본사 학생 기록', 'student-operation-back', id, 'ghost') : ''}${button('정보 수정', 'student-edit', id)}${admin() && pack ? button('수강 횟수 보정', 'pack-adjust', pack.id) : ''}${admin() && !packs().some(item => item.studentId === id) && student.active !== false ? button('첫 4회권 등록', 'initial-pack', id, 'secondary') : ''}${student.active !== false ? button(`${icon('qr')}출석 QR`, 'qr-issue', id) + button('수업 예약', 'lesson-new', id) + button(`${icon('studio')}음성 검사`, 'studio-student', id, 'primary') : ''}</div><p class="section-caption">수강 횟수 보정 이력</p>${table(['보정 일시','사용 횟수','사유'], (S.data.packAdjustments || []).filter(row => row.studentId === id).slice().reverse().map(row => `<tr><td>${e(date(row.createdAt))}</td><td>${Number(row.beforeUsed)} → ${Number(row.afterUsed)}회</td><td>${e(row.reason)}</td></tr>`), '보정 내역이 없습니다.')}<p class="section-caption">최근 수업</p>${table(['일시', '수업', '상태'], history.map(lesson => `<tr><td>${e(date(lesson.startAt))} ${e(time(lesson.startAt))}</td><td><button class="text-button" data-action="lesson-detail" data-id="${e(lesson.id)}">${e(lesson.title || '보컬 코칭')}</button></td><td>${lessonBadge(lesson)}</td></tr>`), '아직 등록된 수업이 없습니다.')}`, 'STUDENT PROFILE'); S.modalRoute = { type: 'student', id };
}
function lessonForm(studentId = '') {
  if (!students().some(student => student.active !== false)) { toast('학생을 먼저 등록해 주세요.', true); studentForm(); return; }
  const key = S.page === 'calendar' ? S.calendarDate : today(); const student = studentBy(studentId);
  openModal('수업 예약', `<form id="lessonForm"><div class="form-grid"><div><label for="lessonStudent">학생 <span class="required">*</span></label><select id="lessonStudent" name="studentId" required>${studentOptions(studentId)}</select></div><div><label for="lessonInstructor">담당 강사 <span class="required">*</span></label><select id="lessonInstructor" name="instructorUid" required>${instructorOptions(student?.instructorUid || S.session.staff.uid)}</select></div><div><label for="lessonStart">수업 시작 <span class="required">*</span></label><input type="datetime-local" id="lessonStart" name="startAt" required value="${key}T14:00"></div><div><label for="lessonEnd">수업 종료 <span class="required">*</span></label><input type="datetime-local" id="lessonEnd" name="endAt" required value="${key}T15:00"></div><div class="span-2"><label for="lessonTitle">수업 이름</label><input id="lessonTitle" name="title" value="1:1 보컬 코칭" maxlength="120"></div><div class="span-2"><label for="lessonNote">수업 메모</label><textarea id="lessonNote" name="note" maxlength="1500" placeholder="이번 수업의 목표나 준비 사항"></textarea></div></div><p class="form-note">일정은 한국 시간 기준입니다. 같은 강사 또는 학생의 기존 일정과 겹치면 예약할 수 없습니다.</p><div class="form-footer"><button type="button" class="button ghost" data-action="modal-close">취소</button><button type="submit" class="button primary">수업 예약</button></div></form>`, 'NEW LESSON');
}
function lessonDetail(id) {
  const lesson = lessons().find(item => item.id === id); if (!lesson) return toast('현재 지점에서 해당 수업을 찾을 수 없습니다.', true);
  const attendance = attendanceFor(lesson); const pack = activePack(lesson.studentId);
  openModal(`${studentName(lesson.studentId)} · 수업`, `<p class="modal-subtitle">${e(fullDate(lesson.startAt))} · ${e(time(lesson.startAt))}–${e(time(lesson.endAt))}</p><div class="detail-grid">${detailItem('수업 이름', lesson.title || '보컬 코칭')}${detailItem('담당 강사', instructorName(lesson.instructorUid))}</div><div class="detail-actions">${lessonBadge(lesson)}${attendance ? badge(`출석 ${time(attendance.checkedAt)}`, 'green') : badge('출석 미확인', 'gray')}</div>${lesson.note ? `<p class="section-caption">수업 메모</p><p class="help" style="white-space:pre-wrap">${e(lesson.note)}</p>` : ''}<p class="section-caption">현재 수강권</p><div class="completion-box">${packProgress(currentPack(lesson.studentId))}</div>${lesson.status === 'scheduled' ? `${!pack ? notice('활성 수강권이 없어 수업 완료를 처리할 수 없습니다. 수강권 등록 또는 재결제 확인이 필요합니다.', 'amber') : ''}<div class="detail-actions">${attendance ? button('수업 완료 · 1회 차감', 'lesson-complete', id, 'primary', pack ? '' : 'disabled') : button('강사가 출석 확인', 'attendance-mark', id, 'primary')}${button('일정 변경', 'lesson-reschedule', id, 'secondary', canRescheduleLesson(lesson) ? '' : `disabled title="${e(rescheduleBlockedReason(lesson))}"`)}${button('음성 검사 열기', 'studio-student', lesson.studentId)}${button('수업 취소', 'lesson-cancel', id, 'ghost')}</div>` : ''}${admin() && attendance && attendance.status !== 'void' ? `<div class="detail-actions">${button('출석·차감 정정', 'attendance-void', attendance.id, 'ghost')}</div>` : ''}`, 'LESSON DETAIL'); S.modalRoute = { type: 'lesson', id };
}
async function issueQR(id) {
  const student = studentBy(id); if (!student) return;
  const epoch = openModal(`${student.name} · 출석 QR`, '<div class="empty-state" role="status"><p>출석 QR을 발급하고 있습니다.</p><small>재발급하면 기존 QR은 사용할 수 없습니다.</small></div>', 'STUDENT CHECK-IN');
  try {
    const result = await call('qr.issue', { studentId: id }, student.branchId || S.branchId); if (epoch !== S.modalEpoch || !$('#modal').open) return;
    if (!result?.url) { $('#modalBody').innerHTML = `${notice('이전 발급 요청이 이미 처리되었습니다. 안전을 위해 QR을 새로 발급해 주세요.')}${button('새 QR 발급', 'qr-issue', id, 'primary')}`; return; }
    const url = safeUrl(result.url, true); if (!url) throw new Error('올바른 출석 링크를 받지 못했습니다.');
    $('#modalBody').innerHTML = `${notice('학생은 이 QR을 열어 출석을 확인합니다. 회원가입은 필요하지 않으며 예약된 수업의 출석 가능 시간에만 작동합니다.')}<div id="qrCanvas" class="qr-card" role="img" aria-label="${e(student.name)} 출석 QR"></div><p class="qr-meta">유효기간 ${e(fullDate(result.expiresAt))} ${e(time(result.expiresAt))}</p><label for="qrUrl" class="section-caption">출석 링크</label><input id="qrUrl" readonly value="${e(url)}"><div class="detail-actions">${button(`${icon('copy')}링크 복사`, 'copy-qr', '', 'primary')}${button('새 QR 발급', 'qr-issue', id, 'secondary')}</div><p class="form-note">QR을 발급할 때마다 이전 QR이 폐기됩니다. 학생에게 최신 QR만 전달하세요.</p>`;
    try { const { renderQR } = await import('./qr.js'); if (epoch === S.modalEpoch && $('#qrCanvas')) await renderQR(url, $('#qrCanvas')); } catch { if (epoch === S.modalEpoch && $('#qrCanvas')) $('#qrCanvas').innerHTML = '<p>QR 표시를 불러오지 못했습니다.<br>아래 출석 링크를 사용해 주세요.</p>'; }
  } catch (error) { if (epoch === S.modalEpoch) $('#modalBody').innerHTML = `${notice(errorMessage(error), 'amber')}${button('다시 발급', 'qr-issue', id, 'primary')}`; }
}
function safeUrl(value, allowLocal = false) { try { const url = new URL(value); return url.protocol === 'https:' || (allowLocal && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)) ? url.href : ''; } catch { return ''; } }
function paymentDetail(id) {
  const payment = payments().find(item => item.id === id); if (!payment) return;
  const url = safeUrl(payment.paymentUrl); const editable = admin() && !['paid', 'cancelled'].includes(payment.status);
  openModal(`${studentName(payment.studentId)} · 결제 요청`, `<div class="detail-grid">${detailItem('요청일', fullDate(payment.createdAt))}${detailItem('결제 금액', money(payment.amount))}${detailItem('진행 상태', paymentLabels[payment.status]?.[0] || payment.status)}${detailItem('알림 상태', messageLabel(payment.messageStatus))}</div>${payment.status === 'uncertain' ? notice('이전 발송 결과가 확정되지 않았습니다. 재발송 전에 실제 전달 여부를 확인해 주세요.', 'amber') : ''}<p class="section-caption">결제 링크</p>${url ? `<a class="link-safe" href="${e(url)}" target="_blank" rel="noopener noreferrer">${e(url)}</a>` : '<p class="help">아직 등록된 결제 링크가 없습니다.</p>'}${editable ? `<form id="paymentLinkForm" data-id="${e(id)}" class="detail-section"><div class="form-grid"><div class="span-2"><label for="paymentUrl">FirstPay에서 발급한 결제 링크</label><input id="paymentUrl" name="paymentUrl" type="url" value="${e(url)}" required placeholder="https://…" maxlength="2048"></div><div><label for="paymentAmount">결제 금액 (원)</label><input id="paymentAmount" name="amount" type="number" min="1" step="1" value="${Number(payment.amount) > 0 ? Number(payment.amount) : ''}" required placeholder="금액 입력"></div></div><p class="form-note">FirstPay에서 발급한 실제 링크만 입력하세요. 등록은 자동 발송 또는 납부 완료를 의미하지 않습니다.</p><div class="form-footer"><button class="button primary" type="submit">결제 링크 저장</button>${button('직접 납부 확인', 'payment-offline', id, 'secondary')}</div></form>` : payment.status === 'paid' ? notice('납부가 확인되어 다음 4회 수강권이 발급되었습니다.') : ''}`, 'PAYMENT REQUEST'); S.modalRoute = { type: 'payment', id };
}
function confirmationForm(title, description, formId, id, label, { reason = false, danger = false, confirm = false } = {}) {
  openModal(title, `<form id="${formId}" data-id="${e(id)}"><p class="warning-text">${e(description)}</p>${reason ? `<div class="detail-section"><label for="confirmReason">${formId === 'offlineForm' ? '납부 확인 근거' : '처리 사유'} <span class="required">*</span></label><textarea id="confirmReason" name="reason" required minlength="3" maxlength="200" placeholder="${formId === 'offlineForm' ? '입금 확인 일시, 거래번호 등 확인 근거를 입력하세요.' : '사유를 입력하세요.'}"></textarea></div>` : ''}${confirm ? '<label class="checkbox-label detail-section"><input type="checkbox" name="confirmed" required><span>실제 납부 내역과 학생, 금액을 확인했습니다.</span></label>' : ''}<div class="form-footer"><button type="button" class="button ghost" data-action="modal-close">돌아가기</button><button class="button ${danger ? 'danger' : 'primary'}" type="submit">${e(label)}</button></div></form>`, 'CONFIRM ACTION');
}
function inviteForm() {
  if (!owner()) return;
  openModal('구성원 초대', `<form id="staffInviteForm"><div class="form-grid"><div><label for="staffInviteName">이름</label><input id="staffInviteName" name="name" required maxlength="80" placeholder="강사 이름"></div><div><label for="staffInviteEmail">로그인 이메일</label><input id="staffInviteEmail" name="email" type="email" required maxlength="254" placeholder="Google 또는 Apple 계정 이메일"></div><div class="span-2"><label for="staffInviteRole">역할</label><select id="staffInviteRole" name="role"><option value="instructor">강사 · 담당 학생과 수업 관리</option>${S.session.staff.role === 'owner' ? '<option value="manager">지점 관리자 · 해당 지점 전체 관리</option>' : ''}</select></div></div><p class="section-caption">담당 지점</p><div class="consent-list">${S.session.branches.map(branch => `<label class="checkbox-label"><input type="checkbox" name="branchIds" value="${e(branch.id)}" ${branch.id === S.branchId ? 'checked' : ''}><span>${e(branch.name)}</span></label>`).join('')}</div><p class="form-note">초대 코드는 입력한 이메일의 로그인 계정에 연결됩니다. 코드를 발급한 뒤 해당 구성원에게 직접 전달해 주세요.</p><div class="form-footer"><button type="button" class="button ghost" data-action="modal-close">취소</button><button type="submit" class="button primary">초대 코드 발급</button></div></form>`, 'INVITE STAFF');
}
function branchForm(id = '') {
  if (!owner()) return; const branch = hqBranch(id) || {};
  openModal(id ? '지점·플랜 설정' : '새 지점 추가', `<form id="branchForm" data-id="${e(id)}"><div class="form-grid"><div class="span-2"><label for="branchName">지점 이름 <span class="required">*</span></label><input id="branchName" name="name" required maxlength="80" value="${e(branch.name)}" placeholder="예: 터칭보이스 강남점"></div><div class="span-2"><label for="branchAddress">지점 주소 <span class="required">*</span></label><input id="branchAddress" name="address" required maxlength="240" value="${e(branch.address)}" placeholder="도로명 주소와 상세 주소"></div><div><label for="branchContactName">담당자 이름 <span class="required">*</span></label><input id="branchContactName" name="contactName" required maxlength="80" value="${e(branch.contactName)}"></div><div><label for="branchContactPhone">담당자 연락처 <span class="required">*</span></label><input id="branchContactPhone" name="contactPhone" type="tel" required maxlength="30" value="${e(branch.contactPhone)}" placeholder="010-0000-0000"></div><div><label for="branchKind">운영 형태</label><select id="branchKind" name="kind"><option value="direct" ${branch.kind === 'direct' ? 'selected' : ''}>직영점</option><option value="franchise" ${branch.kind === 'franchise' ? 'selected' : ''}>가맹점</option></select></div><div><label for="branchPlan">이용 플랜</label><select id="branchPlan" name="plan">${[['trial','체험'],['standard','스탠다드'],['pro','프로']].map(([value,label]) => `<option value="${value}" ${branch.plan === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div class="span-2"><label for="branchPlanStatus">플랜 상태</label><select id="branchPlanStatus" name="planStatus">${[['trial','체험 중'],['active','이용 중'],['suspended','이용 중지']].map(([value,label]) => `<option value="${value}" ${branch.planStatus === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div></div><p class="form-note">플랜 정보 변경은 실제 구독 결제나 월 이용료 청구를 실행하지 않습니다.</p><div class="form-footer"><button type="button" class="button ghost" data-action="modal-back">이전 단계</button><button type="submit" class="button primary">${id ? '설정 저장' : '지점 추가'}</button></div></form>`, 'BRANCH PLAN');
}
function approvalForm(id) {
  if (!owner()) return; const application = applications().find(row => row.id === id); if (!application) return;
  openModal('계정 접근 승인', `<form id="staffApproveForm" data-id="${e(id)}"><div class="detail-grid">${detailItem('신청자', application.name)}${detailItem('로그인 이메일', application.email)}</div><div class="detail-section"><label for="approvalRole">부여할 역할</label><select id="approvalRole" name="role"><option value="instructor">강사 · 담당 학생과 수업</option><option value="manager">지점 관리자 · 해당 지점 전체</option></select></div><p class="section-caption">접근할 지점</p><div class="consent-list">${hqBranches().filter(branch => branch.active !== false).map(branch => `<label class="checkbox-label"><input type="checkbox" name="branchIds" value="${e(branch.id)}"><span>${e(branch.name)} · ${e(kindLabel(branch.kind))}</span></label>`).join('')}</div><label class="checkbox-label detail-section"><input type="checkbox" name="verified" required><span>신청자의 소속과 부여할 권한을 확인했습니다.</span></label><div class="form-footer"><button type="button" class="button ghost" data-action="modal-close">취소</button><button type="submit" class="button primary">계정 승인</button></div></form>`, 'HEADQUARTERS APPROVAL');
}
function issueForm() {
  openModal('문의·오류 접수', `<form id="issueForm"><div class="form-grid"><div class="span-2"><label for="issueTitle">제목</label><input id="issueTitle" name="title" required maxlength="120" placeholder="발생한 문제를 간단히 적어 주세요."></div><div class="span-2"><label for="issueKind">유형</label><select id="issueKind" name="kind"><option value="bug">기능 오류</option><option value="server">연결·서버 문제</option><option value="other">운영 문의</option></select></div><div class="span-2"><label for="issueDetail">내용</label><textarea id="issueDetail" name="detail" required minlength="5" maxlength="2000" placeholder="어떤 화면에서, 어떤 동작을 했을 때 발생했는지 적어 주세요." rows="5"></textarea></div></div><p class="form-note">현재 선택한 지점의 문의로 접수됩니다. 비밀번호나 불필요한 학생 개인정보는 적지 마세요.</p><div class="form-footer"><button type="button" class="button ghost" data-action="modal-close">취소</button><button type="submit" class="button primary">본사에 접수</button></div></form>`, 'SUPPORT REQUEST');
}
function issueDetail(id) {
  const list = owner() ? S.hq?.issues : S.data?.issues; const issue = list?.find(row => row.id === id); if (!issue) return;
  openModal(issue.title, `<div class="detail-grid">${detailItem('접수 지점', owner() ? hqBranch(issue.branchId)?.name : S.data.branch?.name)}${detailItem('접수일', fullDate(issue.createdAt))}</div><div class="detail-actions">${issueBadge(issue.status)}</div><p class="section-caption">문의 내용</p><p class="help" style="white-space:pre-wrap">${e(issue.detail)}</p>${owner() ? `<form id="issueUpdateForm" data-id="${e(id)}" class="detail-section"><label for="issueStatus">처리 상태</label><select id="issueStatus" name="status">${[['open','접수됨'],['in_progress','처리 중'],['resolved','해결 완료']].map(([value,label]) => `<option value="${value}" ${issue.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select><div class="detail-section"><label for="issueResolution">처리 내용</label><textarea id="issueResolution" name="resolution" maxlength="1500" placeholder="확인한 내용과 조치 내용을 기록해 주세요.">${e(issue.resolution)}</textarea></div><div class="form-footer"><button class="button primary" type="submit">처리 상태 저장</button></div></form>` : issue.resolution ? `<p class="section-caption">본사 처리 내용</p><p class="help" style="white-space:pre-wrap">${e(issue.resolution)}</p>` : ''}`, 'SUPPORT DETAIL'); S.modalRoute = { type: 'issue', id };
}
function examDetail(id) {
  const exam = S.hq?.exams?.find(row => row.id === id); if (!exam) return; const rows = [];
  const walk = (object, prefix = '', depth = 0) => { if (!object || typeof object !== 'object' || depth > 2) return; for (const [key, value] of Object.entries(object)) { if (typeof value === 'number' && Number.isFinite(value)) rows.push([prefix + key, value]); else if (value && typeof value === 'object' && !Array.isArray(value)) walk(value, `${prefix}${key}.`, depth + 1); } }; walk(exam.metrics);
  const summary = coreMetricSummary(exam), quality = summary.quality;
  const format = (value, precision = 1) => Number.isFinite(value) ? value.toLocaleString('ko-KR', { maximumFractionDigits: precision }) : '미측정';
  const coreRows = summary.items.map(item => `<tr><td>${e(item.label)}</td><td>${format(item.value, item.precision)}${item.value === null ? '' : ` <span class="muted">${e(item.unit)}</span>`}</td></tr>`);
  const formants = ['F1', 'F2', 'F3'].map(key => `${key} ${format(quality.formants[key], 0)}${quality.formants[key] === null ? '' : ' Hz'}`).join(' · ');
  const qualityRows = [detailItem('분석 길이', `${format(quality.durationSeconds)}초`), detailItem('유효 발성 비율', quality.voicedFraction === null ? '미측정' : `${format(quality.voicedFraction * 100)}%`), detailItem('클리핑 비율', quality.clippedFraction === null ? '미측정' : `${format(quality.clippedFraction * 100, 2)}%`), detailItem('분석 버전', quality.analysisVersion ?? '미등록')].join('');
  openModal(`${hqStudent(exam.studentId)?.name || '학생'} · 검사 결과`, `<div class="detail-grid">${detailItem('지점', hqBranch(exam.branchId)?.name)}${detailItem('검사 일시', `${fullDate(exam.createdAt)} ${time(exam.createdAt)}`)}${detailItem('서비스', exam.sourceService || exam.metadata?.sourceService || '코칭 스튜디오')}${detailItem('연결 기록', exam.recordId || exam.id)}</div><div class="detail-actions">${button('발성심리보고서 발급', 'exam-report', exam.id, 'primary')}</div><p class="section-caption">핵심 검사 결과 · 12개</p>${quality.noVoice ? notice('유효한 발성 구간이 없어 음성 지표를 표시하지 않았습니다. 녹음 상태를 확인해 주세요.') : ''}${table(['지표', '값'], coreRows, '')}<p class="section-caption">녹음 품질 · 분석 조건</p><div class="detail-grid">${qualityRows}</div><p class="help">기준 포먼트: ${e(formants)}<br>동일한 과제·녹음 조건에서 비교하세요. CPP·HNR은 자체 추정값이며, 4층 반응은 개인 보정을 적용한 화면 반응입니다.</p><details class="detail-section"><summary>연구용 상세 지표 · ${rows.length}개 수치</summary><p class="help">기존 전체 결과를 보존합니다. 아래 F1–F7은 고정 주파수 대역의 피크이며 기준 포먼트와 다릅니다.</p>${table(['저장 경로', '값'], rows.map(([key, value]) => `<tr><td>${e(key)}</td><td>${Number(value.toFixed(4)).toLocaleString('ko-KR')}</td></tr>`), '이 검사에 저장된 수치 지표가 없습니다.')}</details>${notice('검사 당시 저장된 결과입니다. 음높이 변동에는 과제·멜로디가 반영됩니다. 기관 움직임·근육 발달·압력을 직접 측정하거나 의학적으로 진단한 값이 아닙니다.')}`, 'SAVED VOICE RESULTS'); S.modalRoute = { type: 'exam', id };
}
function hqStudentDetail(id) {
  if (!owner()) return; const student = hqStudent(id); if (!student) return toast('학생 정보를 찾을 수 없습니다.', true);
  const exams = (S.hq?.exams || []).filter(exam => exam.studentId === id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); const scores = personality(student) || {};
  openModal(`${student.name} · 통합 학생 기록`, `<div class="detail-grid">${detailItem('소속 지점', hqBranch(student.branchId)?.name)}<div class="detail-item"><small>담당 발성심리지도사</small><p>${coachLink(student.instructorUid)}</p></div>${detailItem('학생 연락처', student.phone)}${detailItem('보호자 연락처', student.guardianPhone)}${detailItem('생년월일 · 출생 연도', student.birthDate || student.birthYear)}${detailItem('이메일', student.email)}${detailItem('주소', student.address)}${detailItem('등록일', fullDate(student.createdAt))}</div><div class="detail-actions">${badge(student.active === false ? '비활성 학생' : '활성 학생', student.active === false ? 'gray' : 'green')}${badge(student.consent?.voice ? '음성 활용 동의' : '음성 동의 없음', student.consent?.voice ? 'green' : 'gray')}</div>${student.note ? `<p class="section-caption">코칭 메모</p><p class="help" style="white-space:pre-wrap">${e(student.note)}</p>` : ''}<div class="detail-actions">${button('학생 정보 수정', 'student-edit', id)}${button('수업·출석·횟수 관리', 'student-operate', id, 'secondary')}${student.active !== false ? button(`${icon('qr')}출석 QR`, 'qr-issue', id) + button(`${icon('studio')}음성 검사`, 'studio-student', id, 'primary') : ''}</div><p class="section-caption">직접 입력된 성격 점수</p><div class="personality-score-grid">${[['E','외향성'],['C','성실성'],['A','우호성'],['N','정서 민감성'],['O','개방성'],['V','보컬 특성']].map(([key,label]) => `<div><small>${label} ${key}</small><strong>${scores[key] !== undefined && scores[key] !== null && scores[key] !== '' ? e(scores[key]) : '—'}</strong></div>`).join('')}</div><p class="section-caption">누적 음성 검사 · ${exams.length}건</p>${table(['검사 일시', '기본 주파수', 'HNR', '기록'], exams.map(exam => `<tr><td>${e(date(exam.createdAt))} ${e(time(exam.createdAt))}</td><td>${metric(exam, 'f0')} Hz</td><td>${metric(exam, 'hnr')} dB</td><td>${button('상세 지표', 'exam-detail', exam.id, 'small ghost')}</td></tr>`), '아직 저장된 음성 검사 기록이 없습니다.')}`, 'HEADQUARTERS STUDENT RECORD'); S.modalRoute = { type: 'hq-student', id };
}
function coachDetail(uid) {
  if (!owner()) return; const person = (S.hq?.staff || []).find(item => item.uid === uid); if (!person) return;
  const quality = coachQuality(uid); const training = quality.training || {}; const review = quality.voiceReview; const history = (quality.voiceReviews || []).slice().sort((a,b) => new Date(b.assessedAt || b.recordedAt) - new Date(a.assessedAt || a.recordedAt)); const assigned = hqStudents().filter(student => student.instructorUid === uid);
  openModal(`${person.name || person.email} · 발성심리지도사`, `<div class="detail-grid">${detailItem('로그인 이메일', person.email)}${detailItem('소속 지점', (person.branchIds || []).map(id => hqBranch(id)?.name || '지점').join(' · '))}</div><div class="detail-actions">${button('개인정보·소속·정산 관리', 'staff-profile', uid, 'primary')}</div><p class="section-caption">과정 이수 관리</p><div class="completion-box"><div class="progress-label"><strong>${e(training.course || '등록된 과정 없음')}</strong>${trainingBadge(training.status)}</div><div class="detail-grid">${detailItem('이수일', training.completedAt ? date(training.completedAt) : '미등록')}${detailItem('수료 번호', training.certificateNo)}</div><div class="card-actions">${button('이수 정보 수정', 'coach-training', uid, 'secondary')}</div></div><p class="section-caption">최근 발성 점검 · 직접 확인한 기록</p><div class="completion-box"><div class="progress-label"><span>${review?.assessedAt ? e(fullDate(review.assessedAt)) : '점검 기록 없음'}</span>${badge(conditionLabels[review?.condition] || '점검 전', review?.condition === 'stable' ? 'green' : review?.condition === 'follow_up' ? 'amber' : 'gray')}</div><p class="help" style="white-space:pre-wrap">${e(review?.notes || '아직 기록된 점검 메모가 없습니다.')}</p><div class="review-metrics">${[['f0','기본 주파수','Hz'],['hnr','HNR','dB'],['jitter','Jitter','%'],['shimmer','Shimmer','%']].map(([key,label,unit]) => `<div><small>${label}</small><strong>${review?.metrics?.[key] === undefined ? '—' : e(review.metrics[key])}<span>${unit}</span></strong></div>`).join('')}</div><div class="card-actions">${button(`${icon('plus')}발성 점검 추가`, 'coach-review', uid, 'primary')}</div></div><p class="section-caption">누적 점검 기록 · ${history.length}회</p><div class="review-history">${history.map(item => `<details><summary><span>${e(fullDate(item.assessedAt || item.recordedAt))}</span>${badge(conditionLabels[item.condition] || '점검 전', item.condition === 'stable' ? 'green' : 'amber')}</summary><p class="help" style="white-space:pre-wrap">${e(item.notes || '메모 없음')}</p><div class="person-pills">${Object.entries(item.metrics || {}).map(([key,value]) => badge(`${key} ${value} ${{f0:'Hz',hnr:'dB',jitter:'%',shimmer:'%'}[key] || ''}`)).join('')}</div><small class="secondary-line">수기 입력 · ${e(date(item.recordedAt))} 저장</small></details>`).join('') || '<p class="help">누적된 점검 기록이 없습니다.</p>'}</div><p class="section-caption">담당 학생 · ${assigned.length}명</p>${table(['학생', '지점', '최근 음성 검사', '관리'], assigned.map(student => { const latest = (S.hq?.exams || []).filter(exam => exam.studentId === student.id).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))[0]; return `<tr><td><button class="text-button" data-action="hq-student" data-id="${e(student.id)}">${e(student.name)}</button></td><td>${e(hqBranch(student.branchId)?.name)}</td><td>${latest ? e(date(latest.createdAt)) : '기록 없음'}</td><td>${button('학생 기록', 'hq-student', student.id, 'small ghost')}</td></tr>`; }), '배정된 학생이 없습니다.')}`, 'COACH DEVELOPMENT'); S.modalRoute = { type: 'coach', id: uid };
}
function coachTrainingForm(uid) {
  if (!owner()) return; const quality = coachQuality(uid); const training = quality.training || {}; const person = (S.hq?.staff || []).find(item => item.uid === uid);
  openModal(`${person?.name || '지도사'} · 이수 정보`, `<form id="coachTrainingForm" data-id="${e(uid)}"><div class="form-grid"><div class="span-2"><label for="coachTrainingStatus">이수 상태</label><select id="coachTrainingStatus" name="status">${Object.entries(trainingLabels).map(([key,label]) => `<option value="${key}" ${training.status === key ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div class="span-2"><label for="coachCourse">과정 이름</label><input id="coachCourse" name="course" maxlength="160" value="${e(training.course)}" placeholder="실제 이수 과정 이름"></div><div><label for="coachCompletedAt">이수일</label><input id="coachCompletedAt" name="completedAt" type="date" max="${today()}" value="${training.completedAt ? dayKey(training.completedAt) : ''}"></div><div><label for="coachCertificate">수료 번호</label><input id="coachCertificate" name="certificateNo" maxlength="80" value="${e(training.certificateNo)}"></div></div><p class="form-note">이수 중은 과정 이름이 필요하며, 이수 완료·갱신 필요는 과정과 이수일을 함께 입력해 주세요.</p><div class="form-footer"><button class="button ghost" type="button" data-action="modal-back">이전 단계</button><button class="button primary" type="submit">이수 정보 저장</button></div></form>`, 'TRAINING RECORD');
}
function coachReviewForm(uid) {
  if (!owner()) return; const person = (S.hq?.staff || []).find(item => item.uid === uid); const now = `${today()}T${time(Date.now())}`;
  openModal(`${person?.name || '지도사'} · 발성 점검`, `<form id="coachReviewForm" data-id="${e(uid)}"><div class="form-grid"><div><label for="coachAssessedAt">점검 일시</label><input id="coachAssessedAt" name="assessedAt" type="datetime-local" required max="${now}" value="${now}"></div><div><label for="coachVoiceCondition">직접 확인한 상태</label><select id="coachVoiceCondition" name="condition" required><option value="">상태 선택</option><option value="stable">양호 · 수기 확인</option><option value="follow_up">후속 점검 필요</option></select></div><div class="span-2"><label for="coachVoiceNotes">점검 메모</label><textarea id="coachVoiceNotes" name="notes" maxlength="1500" placeholder="관찰한 발성 상태와 다음 점검 계획을 기록하세요." rows="4"></textarea></div></div><p class="section-caption">수기 지표 · 측정한 값만 입력</p><div class="form-grid">${[['f0','기본 주파수 (Hz)','0.01','5000'],['hnr','HNR (dB)','-100','100'],['jitter','Jitter (%)','0','100'],['shimmer','Shimmer (%)','0','100']].map(([key,label,min,max]) => `<div><label for="coachMetric${key}">${label}</label><input id="coachMetric${key}" name="${key}" type="number" min="${min}" max="${max}" step="any" placeholder="측정값 입력 · 선택"></div>`).join('')}</div><p class="form-note">입력한 평가는 누적 기록으로 추가됩니다. 이 화면은 자동 점수나 의학적 진단을 생성하지 않습니다.</p><div class="form-footer"><button class="button ghost" type="button" data-action="modal-back">이전 단계</button><button class="button primary" type="submit">점검 기록 추가</button></div></form>`, 'MANUAL VOICE REVIEW');
}
function branchApprovalForm(id) {
  if (!owner()) return; const application = (S.hq?.branchApplications || []).find(row => row.id === id && row.status === 'pending'); if (!application) return;
  openModal(`${application.name} · 가입 승인`, `<form id="branchApproveForm" data-id="${e(id)}"><div class="detail-grid">${detailItem('신청 지점', application.name)}${detailItem('주소', application.address)}${detailItem('담당자', application.contactName)}${detailItem('담당자 연락처', application.contactPhone)}${detailItem('관리자 계정 이름', application.applicantName)}${detailItem('관리자 로그인 이메일', application.email)}</div><div class="form-grid detail-section"><div><label for="approvalBranchPlan">이용 플랜</label><select id="approvalBranchPlan" name="plan"><option value="trial">체험</option><option value="standard">스탠다드</option><option value="pro">프로</option></select></div><div><label for="approvalBranchPlanStatus">플랜 상태</label><select id="approvalBranchPlanStatus" name="planStatus"><option value="trial">체험 중</option><option value="active">이용 중</option></select></div></div><label class="checkbox-label detail-section"><input name="confirmed" type="checkbox" required><span>지점 정보와 신청자의 소속을 확인했으며, 해당 계정에 지점 관리자 권한을 부여합니다.</span></label><p class="form-note">승인하면 가맹 지점과 관리자 계정이 함께 생성됩니다. 실제 구독 결제는 실행하지 않습니다.</p><div class="form-footer"><button class="button ghost" type="button" data-action="modal-back">이전 단계</button><button class="button primary" type="submit">지점·관리자 함께 승인</button></div></form>`, 'BRANCH ONBOARDING');
}
async function loadBranchApplications() {
  if (!S.user || S.session) return; const uid = S.user.uid; const target = $('#branchApplicationStatus');
  try { const result = await call('branch.application.read'); if (S.user?.uid !== uid || S.session) return; const records = Array.isArray(result) ? result : result?.applications || []; target.innerHTML = records.length ? `<p class="section-caption">내 지점 가입 신청</p>${records.map(item => `<div class="application-status"><strong>${e(item.name)}</strong>${badge(item.status === 'approved' ? '승인 완료' : '본사 검토 중', item.status === 'approved' ? 'green' : 'amber')}<small>${e(date(item.createdAt))} 신청</small></div>`).join('')}` : ''; }
  catch { if (S.user?.uid === uid && !S.session) target.innerHTML = '<p class="form-note">신청 내역을 불러오지 못했습니다. 승인 상태 다시 확인을 눌러 주세요.</p>'; }
}
async function mutate(action, payload, message, { keepModal = false, targetBranch = S.branchId } = {}) {
  const branchId = S.branchId; const uid = S.session?.staff?.uid; const modalEpoch = S.modalEpoch;
  const result = await call(action, payload, targetBranch);
  if (S.branchId !== branchId || S.session?.staff?.uid !== uid) return result;
  await refresh({ quiet: true });
  if (!keepModal && modalEpoch === S.modalEpoch) backModal();
  toast(message); return result;
}
async function submitModal(event) {
  const form = event.target; if (!(form instanceof HTMLFormElement)) return; event.preventDefault(); if (S.busy || !form.reportValidity()) return;
  const fields = new FormData(form); const values = Object.fromEntries(fields); const id = form.dataset.id; const epoch = S.modalEpoch;
  S.busy = true; const submit = form.querySelector('[type=submit]'); const submitLabel = submit?.textContent; if (submit) submit.disabled = true;
  if (form.id === 'rescheduleForm') { form.setAttribute('aria-busy', 'true'); if (submit) submit.textContent = '일정 변경 저장 중…'; }
  try {
    if (form.id === 'studentForm') {
      const consent = Object.fromEntries(['service', 'voice', 'reminders', 'guardian'].map(key => [key, fields.has(key)]));
      const payload = { name: values.name.trim(), instructorUid: values.instructorUid, phone: values.phone.trim(), guardianPhone: values.guardianPhone.trim(), birthYear: values.birthYear ? Number(values.birthYear) : '', birthDate: values.birthDate || '', email: (values.email || '').trim(), address: (values.address || '').trim(), reassignScheduled: fields.has('reassignScheduled'), note: values.note.trim(), consent, active: id ? values.active === 'true' : true };
      payload.personality = Object.fromEntries(['E','C','A','N','O','V'].filter(key => values[`score${key}`] !== '').map(key => [key, Number(values[`score${key}`])]));
      if (id) { payload.id = id; if (!admin()) { delete payload.instructorUid; delete payload.active; } } else payload.initialPack = fields.has('initialPack');
      await mutate(id ? 'student.update' : 'student.create', payload, id ? '학생 정보를 저장했습니다.' : '학생을 등록했습니다.', { targetBranch: form.dataset.branchId || S.branchId });
    } else if (form.id === 'staffProfileForm') {
      const payload = { uid:id, expectedRevision:Number(form.dataset.revision), name:values.name.trim(), phone:values.phone.trim(), birthDate:values.birthDate || '', bank:{name:values.bankName.trim(),account:values.bankAccount.trim(),holder:values.bankHolder.trim()}, reason:(values.reason || '').trim() };
      if (owner() && form.querySelector('[name=branchIds]')) payload.branchIds = fields.getAll('branchIds');
      await mutate('staff.profile.update', payload, '개인정보를 저장했습니다.', { targetBranch:'' });
      if (id === S.session.staff.uid) { S.session.staff.name = payload.name; $('#staffName').textContent = payload.name; $('#staffAvatar').textContent = payload.name.slice(0,1); }
    } else if (form.id === 'settlementForm') await mutate('staff.settlement.record', {uid:id,period:values.period,paidAt:values.paidAt,amount:Number(values.amount),reference:values.reference.trim(),note:values.note.trim()}, '지급 확인 내역을 기록했습니다.', {targetBranch:values.branchId});
    else if (form.id === 'settlementVoidForm') await mutate('staff.settlement.void', {id,reason:values.reason.trim()}, '원기록을 보존하고 정정 제외했습니다.', {targetBranch:form.dataset.branchId});
    else if (form.id === 'packAdjustForm') await mutate('pack.adjust', {id,expectedUsed:Number(form.dataset.expectedUsed),used:Number(values.used),reason:values.reason.trim()}, '수강 횟수 보정 이력을 저장했습니다.', {targetBranch:form.dataset.branchId});
    else if (form.id === 'lessonForm') {
      const startAt = new Date(`${values.startAt}:00+09:00`); const endAt = new Date(`${values.endAt}:00+09:00`);
      if (!Number.isFinite(+startAt) || !Number.isFinite(+endAt) || endAt <= startAt) throw new Error('수업 종료 시간을 시작 시간 이후로 입력해 주세요.');
      await mutate('lesson.create', { studentId: values.studentId, instructorUid: values.instructorUid, startAt: startAt.toISOString(), endAt: endAt.toISOString(), title: values.title.trim(), note: values.note.trim() }, '수업이 예약되었습니다.');
    } else if (form.id === 'rescheduleForm') {
      const proposal = readRescheduleProposal(form);
      if (new Date(proposal.endAt) <= new Date(proposal.startAt)) throw new Error('수업 종료 시간을 시작 시간 이후로 입력해 주세요.');
      const scrollY = window.scrollY;
      await mutate('lesson.reschedule', { id, startAt: proposal.startAt, endAt: proposal.endAt, expectedStartAt: form.dataset.expectedStartAt, expectedEndAt: form.dataset.expectedEndAt, reason: values.reason.trim() }, '수업 일정을 변경했습니다.', { targetBranch: form.dataset.branchId || S.branchId });
      window.scrollTo({ top: scrollY, behavior: 'instant' });
    } else if (form.id === 'initialPackForm') await mutate('pack.issueInitial', { studentId: id, reference: values.reason.trim() }, '첫 4회 수강권을 등록했습니다.');
    else if (form.id === 'completeForm') await mutate('lesson.complete', { id }, '수업을 완료하고 수강권 1회를 차감했습니다.');
    else if (form.id === 'cancelLessonForm') await mutate('lesson.cancel', { id, reason: values.reason.trim() }, '수업을 취소했습니다.');
    else if (form.id === 'voidAttendanceForm') await mutate('attendance.void', { id, reason: values.reason.trim() }, '출석을 무효 처리했습니다.');
    else if (form.id === 'offlineForm') await mutate('payment.confirmOffline', { id, reference: values.reason.trim() }, '납부 확인을 기록하고 다음 수강권을 발급했습니다.');
    else if (form.id === 'paymentLinkForm') {
      const url = new URL(values.paymentUrl); const hosts = config.firstpayAllowedHosts || ['pm.firstpay.co.kr'];
      if (url.protocol !== 'https:' || !hosts.includes(url.hostname) || url.username || url.password) throw new Error('허용된 FirstPay 주소의 HTTPS 결제 링크를 입력해 주세요.');
      await mutate('payment.link', { id, paymentUrl: url.href, amount: Number(values.amount) }, '결제 링크를 저장했습니다. 발송 상태는 별도로 확인해 주세요.');
    } else if (form.id === 'branchForm') {
      await call(id ? 'branch.update' : 'branch.create', { ...(id ? { id } : {}), name: values.name.trim(), address: values.address.trim(), contactName: values.contactName.trim(), contactPhone: values.contactPhone.trim(), kind: values.kind, plan: values.plan, planStatus: values.planStatus }, S.branchId);
      const retainedPage = S.page, retainedViews = structuredClone(S.pageState); closeModal(); await establishSession(); S.pageState = retainedViews; navigate(retainedPage); toast(id ? '지점 설정을 저장했습니다.' : '지점을 추가했습니다.');
    } else if (form.id === 'coachTrainingForm') {
      if (values.status !== 'not_started' && !values.course.trim()) throw new Error('이수 상태에 해당하는 과정 이름을 입력해 주세요.');
      if (['completed','expired'].includes(values.status) && !values.completedAt) throw new Error('이수일을 입력해 주세요.');
      await mutate('staff.quality.update', { uid: id, training: { status: values.status, course: values.course.trim(), completedAt: values.completedAt || null, certificateNo: values.certificateNo.trim() } }, '이수 정보를 저장했습니다.');
    } else if (form.id === 'coachReviewForm') {
      const metrics = Object.fromEntries(['f0','hnr','jitter','shimmer'].filter(key => values[key] !== '').map(key => [key, Number(values[key])]));
      await mutate('staff.quality.update', { uid: id, voiceReview: { assessedAt: new Date(`${values.assessedAt}:00+09:00`).toISOString(), condition: values.condition, notes: values.notes.trim(), metrics } }, '발성 점검을 누적 기록에 추가했습니다.');
    } else if (form.id === 'branchApproveForm') {
      await call('branch.approve', { id, plan: values.plan, planStatus: values.planStatus }); closeModal(); await establishSession(); navigate('approvals'); S.approvalMode = 'branches'; render(); toast('지점과 관리자 계정을 승인했습니다.');
    } else if (form.id === 'staffApproveForm') {
      const branchIds = fields.getAll('branchIds'); if (!branchIds.length) throw new Error('최소 한 곳의 담당 지점을 선택해 주세요.');
      await mutate('staff.approve', { id, role: values.role, branchIds }, '계정을 승인했습니다. 지정한 지점과 역할로 이용할 수 있습니다.');
    } else if (form.id === 'issueForm') await mutate('issue.create', { title: values.title.trim(), detail: values.detail.trim(), kind: values.kind }, '본사에 문의를 접수했습니다.');
    else if (form.id === 'issueUpdateForm') await mutate('issue.update', { id, status: values.status, resolution: values.resolution.trim() }, '문의 처리 상태를 저장했습니다.');
    else if (form.id === 'staffInviteForm') {
      const branchIds = fields.getAll('branchIds'); if (!branchIds.length) throw new Error('최소 한 곳의 담당 지점을 선택해 주세요.');
      const result = await call('staff.invite', { name: values.name.trim(), email: values.email.trim(), role: values.role, branchIds }, S.branchId);
      if (epoch !== S.modalEpoch) return;
      openModal('초대 코드가 준비되었습니다.', `${notice(`${values.email.trim()} 계정으로 로그인한 후 이 코드를 입력하면 초대를 수락할 수 있습니다.`)}${result.code ? `<div id="invitationResult" class="code-box">${e(result.code)}</div><div class="detail-actions">${button(`${icon('copy')}코드 복사`, 'copy-invite', '', 'primary')}</div>` : '<p class="warning-text">이 요청은 이미 처리되어 초대 코드를 다시 표시할 수 없습니다. 필요한 경우 새로운 초대를 발급해 주세요.</p>'}<p class="form-note">이메일은 자동 발송되지 않았습니다. 해당 구성원에게 코드를 직접 전달해 주세요.</p>`, 'INVITATION READY');
      await refresh({ quiet: true });
    }
  } catch (error) {
    if (epoch === S.modalEpoch) {
      formError(errorMessage(error));
      if (form.id === 'rescheduleForm' && ['SCHEDULE_CONFLICT','ATTENDANCE_EXISTS','LESSON_NOT_SCHEDULED'].includes(error.code) && !$('#modalBody [data-action="reschedule-reload"]')) { const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'button ghost small'; retry.dataset.action = 'reschedule-reload'; retry.dataset.id = id; retry.textContent = '최신 수업 다시 확인'; $('#modalBody').append(retry); }
    } else toast(errorMessage(error), true);
  } finally { S.busy = false; if (form.isConnected) form.removeAttribute('aria-busy'); if (submit?.isConnected) { submit.disabled = false; submit.textContent = submitLabel; } }
}
async function handleAction(action, id, source) {
  if (action === 'logout') { clearPrivateState(); showScreen('loginScreen'); try { await signOut(); } catch (error) { loginError(error); } return; }
  if (action === 'modal-close' || action === 'modal-back') return backModal();
  if (!S.session || !S.data) { if (action === 'refresh') return refresh(); return; }
  if (action === 'refresh') return refresh();
  if (action === 'student-new') return studentForm();
  if (action === 'studio-members') return navigate('students');
  if (action === 'staff-profile') return staffProfile(id);
  if (action === 'settlement-new') return settlementForm(id);
  if (action === 'settlement-void' && owner()) { confirmationForm('정산 기록 정정', '원래 지급 내역은 보존됩니다. 잘못된 기록의 제외 사유를 입력하고, 올바른 내역을 새로 추가해 주세요. 실제 송금을 취소하는 기능은 아닙니다.', 'settlementVoidForm', id, '정정 제외', {reason:true}); $('#settlementVoidForm').dataset.branchId = source.dataset.branchId; return; }
  if (action === 'pack-adjust') return packAdjustForm(id);
  if (action === 'student-operate' && owner()) { const student = hqStudent(id); if (!student) return; const back = {page:S.page,branchId:S.branchId,id}; await changeBranch(student.branchId); S.studentReturn = back; navigate('students'); return studentDetail(id); }
  if (action === 'student-operation-back' && S.studentReturn) { const back = S.studentReturn; S.studentReturn = null; await changeBranch(back.branchId); navigate(back.page); return hqStudentDetail(back.id); }
  if (action === 'student-edit') return studentForm(id);
  if (action === 'student-detail') return studentDetail(id);
  if (action === 'initial-pack' && admin()) return confirmationForm('첫 4회 수강권 등록', `${studentName(id)} 학생의 첫 수강료 납부 또는 등록 근거를 확인한 경우에만 진행하세요. 이미 수강권 이력이 있는 학생은 재결제 확인으로 갱신합니다.`, 'initialPackForm', id, '첫 4회권 등록', { reason: true, confirm: true });
  if (action === 'lesson-new') return lessonForm(id);
  if (action === 'lesson-detail') return lessonDetail(id);
  if (action === 'lesson-reschedule') return rescheduleForm(id);
  if (action === 'reschedule-reload') return reloadReschedule(id);
  if (action === 'qr-issue') return issueQR(id);
  if (action === 'studio-student') return launchStudio(id);
  if (action === 'studio-back') return returnFromStudio();
  if (action === 'attendance-mark') {
    source.disabled = true;
    try { await mutate('attendance.mark', { lessonId: id }, '출석을 확인했습니다. 수업이 끝나면 완료 처리해 주세요.'); if (!$('#modal').open) lessonDetail(id); } finally { if (source.isConnected) source.disabled = false; } return;
  }
  if (action === 'lesson-complete') {
    const lesson = lessons().find(item => item.id === id); const pack = activePack(lesson?.studentId); if (!lesson || !pack) return;
    return confirmationForm('수업을 완료할까요?', `${studentName(lesson.studentId)} 학생의 ${date(lesson.startAt)} ${time(lesson.startAt)} 수업을 완료하고 수강권 1회를 차감합니다.${Number(pack.used) === 3 ? ' 이번이 네 번째 수업으로, 다음 수강권 결제 요청이 생성됩니다.' : ''}`, 'completeForm', id, '수업 완료 · 1회 차감');
  }
  if (action === 'lesson-cancel') return confirmationForm('수업 취소', '수업을 취소하면 수강 횟수는 차감되지 않습니다. 취소 사유가 운영 기록에 남습니다.', 'cancelLessonForm', id, '수업 취소', { reason: true, danger: true });
  if (action === 'attendance-void' && admin()) return confirmationForm('출석 무효 처리', '잘못된 출석을 무효 처리합니다. 이미 차감된 수업은 수강권을 복원하며, 발송 또는 결제 완료된 요청과 충돌하면 처리할 수 없습니다.', 'voidAttendanceForm', id, '출석 무효 처리', { reason: true, danger: true });
  if (action === 'payment-detail') return paymentDetail(id);
  if (action === 'payment-offline' && admin()) { const payment = payments().find(item => item.id === id); return confirmationForm('직접 납부 확인', `${studentName(payment?.studentId)} 학생의 ${money(payment?.amount)} 납부를 실제로 확인한 경우에만 진행하세요. 처리하면 다음 4회 수강권이 발급되고 확인 근거가 운영 기록에 남습니다.`, 'offlineForm', id, '납부 확인 · 4회권 발급', { reason: true, confirm: true }); }
  if (action === 'staff-invite') return inviteForm();
  if (action === 'branch-new') return branchForm();
  if (action === 'branch-edit') return branchForm(id);
  if (action === 'staff-approve') return approvalForm(id);
  if (action === 'branch-approve') return branchApprovalForm(id);
  if (action === 'approval-mode') { S.approvalMode = id; return render(); }
  if (action === 'coach-detail') return coachDetail(id);
  if (action === 'coach-training') return coachTrainingForm(id);
  if (action === 'coach-review') return coachReviewForm(id);
  if (action === 'issue-new') return issueForm();
  if (action === 'issue-detail') return issueDetail(id);
  if (action === 'exam-detail') return examDetail(id);
  if (action === 'exam-report') { const exam = S.hq?.exams?.find(row => row.id === id); if (!exam) return; const url = new URL('./report.html', location.href); url.hash = new URLSearchParams({ exam: id, branch: exam.branchId }).toString(); return window.open(url.href, '_blank'); }
  if (action === 'go-approvals') return navigate('approvals');
  if (action === 'go-issues') return navigate('issues');
  if (action === 'database-mode') { S.databaseMode = id; return render(); }
  if (action === 'hq-student' && owner()) return hqStudentDetail(id);
  if (action === 'branch-switch') { $('#branchSelect').value = id; return changeBranch(id); }
  if (action === 'calendar-prev' || action === 'calendar-next') { S.calendarDate = S.calendarMode === 'month' ? shiftMonth(S.calendarDate, action === 'calendar-prev' ? -1 : 1) : addDays(S.calendarDate, (action === 'calendar-prev' ? -1 : 1) * (S.calendarMode === 'week' ? 7 : 1)); return render(); }
  if (action === 'calendar-density') { S.calendarDensity = id === 'detailed' ? 'detailed' : 'overview'; return render(); }
  if (action === 'calendar-today') { S.calendarDate = today(); return render(); }
  if (['calendar-month','calendar-week','calendar-day'].includes(action)) { S.calendarMode = action.slice(9); return render(); }
  if (action === 'calendar-select-day') { S.calendarTrail.push({ date: S.calendarDate, mode: S.calendarMode, scrollY: window.scrollY }); S.calendarDate = id; S.calendarMode = 'day'; render(); window.scrollTo({ top: 0, behavior: 'instant' }); return; }
  if (action === 'calendar-back') { const previous = S.calendarTrail.pop(); if (previous) { S.calendarDate = previous.date; S.calendarMode = previous.mode; render(); window.scrollTo({ top: previous.scrollY, behavior: 'instant' }); } return; }
  if (action === 'attendance-packs' || action === 'attendance-checkins') { S.attendanceMode = action === 'attendance-packs' ? 'packs' : 'checkins'; return render(); }
  if (action === 'payment-filter') { S.paymentFilter = id; return render(); }
  if (action === 'copy-qr' || action === 'copy-invite') {
    const value = action === 'copy-qr' ? $('#qrUrl')?.value : $('#invitationResult')?.textContent; if (!value) return;
    try { await navigator.clipboard.writeText(value); toast(action === 'copy-qr' ? '출석 링크를 복사했습니다.' : '초대 코드를 복사했습니다.'); } catch { if (action === 'copy-qr') $('#qrUrl')?.select(); toast('표시된 내용을 선택해 복사해 주세요.', true); } return;
  }
}
async function changeBranch(id) {
  if (!S.session.branches.some(branch => branch.id === id)) return;
  resetHistory(); S.branchId = id; S.data = null; S.instructorFilter = ''; S.search = ''; S.page = 'today'; $('#studioMount').replaceChildren(); $('#studioStudent').replaceChildren(); $('#mainContent').hidden = false; $('#studioView').hidden = true; renderNav(); window.dispatchEvent(new CustomEvent('tv:branch-change', { detail: { branchId: id } })); await refresh();
}
document.addEventListener('click', event => {
  const target = event.target.closest('button[data-action],button[data-page],a[href="#today"]'); if (!target || target.disabled) return;
  if (target.dataset.action === 'lesson-detail' && Date.now() < calendarClickSuppressedUntil) { event.preventDefault(); return; }
  if (target.matches('a')) { event.preventDefault(); if (S.session) navigate('today'); return; }
  if (target.dataset.page) { if (S.session) navigate(target.dataset.page); return; }
  handleAction(target.dataset.action, target.dataset.id || '', target).catch(error => toast(errorMessage(error), true));
});
$('#modalBody').addEventListener('submit', submitModal);
$('#modalClose').addEventListener('click', closeModal);
$('#modalBack').addEventListener('click', () => backModal());
$('#modal').addEventListener('cancel', event => { event.preventDefault(); backModal(); });
$('#modal').addEventListener('click', event => { if (event.target === $('#modal')) { const rect = $('#modal').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeModal(); } });
$('#branchSelect').addEventListener('change', event => changeBranch(event.target.value).catch(error => toast(errorMessage(error), true)));
$('#refreshButton').innerHTML = icon('refresh'); $('#refreshButton').addEventListener('click', () => refresh());
$('#pendingRetry').addEventListener('click', establishSession);
function setPendingMode(mode) { document.querySelectorAll('[data-pending-mode]').forEach(button => button.classList.toggle('active', button.dataset.pendingMode === mode)); $('#applyForm').hidden = mode === 'branch'; $('#branchApplyForm').hidden = mode !== 'branch'; }
document.querySelectorAll('[data-pending-mode]').forEach(button => button.addEventListener('click', () => setPendingMode(button.dataset.pendingMode)));
$('#previewApplicant').addEventListener('click', async () => { if (!preview) return; setPendingMode('branch'); const { setPreviewRole } = await import('./auth.js?v=parallel-20260911'); await setPreviewRole('applicant'); });
$('#pendingPreviewBack').addEventListener('click', async () => { if (!preview) return; const { setPreviewRole } = await import('./auth.js?v=parallel-20260911'); await setPreviewRole('owner'); });
$('#studioLaunch').addEventListener('click', () => launchStudio($('#studioStudent').value, { reload: true }).catch(error => toast(errorMessage(error), true)));
window.addEventListener('tv:studio-select', event => { void launchStudio(event.detail?.studentId || '').catch(error => toast(errorMessage(error), true)); });
window.addEventListener('tv:data-refresh', () => { if (S.session) refresh({ quiet: true }); });
$('#mainContent').addEventListener('dragstart', handleCalendarDragStart);
$('#mainContent').addEventListener('dragover', handleCalendarDragOver);
$('#mainContent').addEventListener('drop', handleCalendarDrop);
$('#mainContent').addEventListener('dragend', () => { if (calendarDrag) calendarClickSuppressedUntil = Date.now() + 450; clearCalendarDrag(); });
$('#mainContent').addEventListener('dragleave', event => { const target = event.target.closest('[data-calendar-drop]'); if (target && !target.contains(event.relatedTarget)) clearCalendarHover(); });
$('#modalBody').addEventListener('change', event => {
  const form = event.target.closest('#rescheduleForm'); if (!form || !['startAt','endAt'].includes(event.target.name)) return;
  try {
    if (event.target.name === 'startAt') {
      const startAt = parseLocalInput(form.elements.startAt.value), endAt = new Date(Date.parse(startAt) + Number(form.dataset.duration)).toISOString();
      form.dataset.proposedStartAt = startAt; form.dataset.proposedStartValue = form.elements.startAt.value; form.dataset.proposedEndAt = endAt; form.dataset.proposedEndValue = localInputValue(endAt); form.elements.endAt.value = form.dataset.proposedEndValue;
    }
    const proposal = readRescheduleProposal(form); $('#rescheduleSummary').textContent = rescheduleSummary(proposal.startAt, proposal.endAt);
  } catch { $('#rescheduleSummary').textContent = '변경할 날짜와 시간을 입력해 주세요.'; }
});
$('#mainContent').addEventListener('input', event => { if (event.target.id === 'studentSearch') { S.search = event.target.value; $('#studentTable').innerHTML = studentTable(); } else if (event.target.id === 'databaseSearch') { S.search = event.target.value; $('#databaseTable').innerHTML = databaseTable(); } else if (event.target.id === 'coachSearch') { S.coachSearch = event.target.value; $('#coachTable').innerHTML = coachTable(); } });
$('#mainContent').addEventListener('change', event => { if (event.target.id === 'instructorFilter') { S.instructorFilter = event.target.value; render(); } else if (event.target.id === 'databaseBranch') { S.databaseBranch = event.target.value; if (!hqFilterStaff().some(person => person.uid === S.databaseInstructor)) S.databaseInstructor = ''; render(); } else if (event.target.id === 'databaseInstructor') { S.databaseInstructor = event.target.value; $('#databaseTable').innerHTML = databaseTable(); } else if (event.target.id === 'coachBranch') { S.coachBranch = event.target.value; render(); } });
$('#modalBody').addEventListener('change', event => { if (event.target.id === 'lessonStudent') { const student = studentBy(event.target.value); if (student) $('#lessonInstructor').value = student.instructorUid; } });
$('#claimForm').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.target; if (!form.reportValidity()) return; const submit = form.querySelector('button'); submit.disabled = true; $('#pendingError').hidden = true;
  try { await call('invite.claim', { code: $('#inviteCode').value.trim() }); $('#inviteCode').value = ''; await establishSession(); }
  catch (error) { $('#pendingError').textContent = errorMessage(error); $('#pendingError').hidden = false; } finally { submit.disabled = false; }
});
$('#applyForm').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.target; if (!form.reportValidity()) return; const submit = form.querySelector('button'); submit.disabled = true; $('#pendingError').hidden = true;
  try { await call('staff.apply', { name: $('#applicantName').value.trim() }); $('#pendingMessage').textContent = '계정 승인을 요청했습니다. 본사에서 소속과 역할을 확인한 후 사용할 수 있습니다.'; toast('본사에 계정 승인을 요청했습니다.'); }
  catch (error) { $('#pendingError').textContent = errorMessage(error); $('#pendingError').hidden = false; } finally { submit.disabled = false; }
});
$('#branchApplyForm').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.target; if (!form.reportValidity()) return; const submit = form.querySelector('[type="submit"]'); submit.disabled = true; $('#pendingError').hidden = true;
  const values = Object.fromEntries(new FormData(form));
  try { await call('branch.apply', Object.fromEntries(['name','address','contactName','contactPhone','applicantName'].map(key => [key, values[key].trim()]))); $('#pendingMessage').textContent = '지점 가입 신청을 저장했습니다. 본사가 지점 정보와 담당자를 확인하고 있습니다.'; toast('정보를 저장하고 지점 가입을 신청했습니다.'); await loadBranchApplications(); }
  catch (error) { $('#pendingError').textContent = errorMessage(error); $('#pendingError').hidden = false; } finally { submit.disabled = false; }
});
$('#previewRole').addEventListener('change', async event => {
  if (!preview) return; const select = event.target; select.disabled = true;
  try { const { setPreviewRole } = await import('./auth.js?v=parallel-20260911'); await setPreviewRole(select.value); } catch (error) { toast(errorMessage(error), true); } finally { select.disabled = false; }
});
document.querySelectorAll('[data-provider]').forEach(button => {
  button.addEventListener('click', async () => {
    $('#loginError').hidden = true; button.disabled = true;
    try { await signIn(button.dataset.provider); } catch (error) { loginError(error); } finally { button.disabled = false; }
  });
});
$('#todayDate').textContent = fullDate(Date.now());
if (preview) {
  $('#previewApplicant').hidden = false; $('#pendingPreviewBack').hidden = false; $('#pendingPreviewNotice').hidden = false;
  document.querySelector('[data-provider="google"]').textContent = '운영자 미리보기'; document.querySelector('[data-provider="apple"]').hidden = true;
  $('#loginTitle').textContent = '운영 흐름 미리보기'; $('.login-description').textContent = '실제 로그인·발송이 아닌 로컬 기능 검증 화면입니다.';
  $('.secure-label').textContent = '운영 흐름 미리보기 · 실제 로그인·발송 아님';
}
const branchDeepLink = new URLSearchParams(location.search).get('apply') === 'branch';
if (branchDeepLink) setPendingMode('branch');
try { if (preview && branchDeepLink) { const { setPreviewRole } = await import('./auth.js?v=parallel-20260911'); await setPreviewRole('applicant'); } await initAuth(onAuth); } catch (error) { clearPrivateState(); showScreen('loginScreen'); loginError(error); }
