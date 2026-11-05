/**
 * 터칭보이스 목소리 유형 테스트 — 측정값·녹음 저장소 (쓰기 전용)
 * 시트 "터칭보이스_목소리유형테스트"에 붙은 Apps Script. 웹 앱으로 배포(실행: 나, 접근: 모든 사용자).
 * voicetest.html / voicetype_app_v3.html 의 sendRecord()가 결과 한 번마다 POST 한다.
 * 녹음: payload.audio = {sent: base64 WAV, ah: base64 WAV} 이면 드라이브 폴더 FOLDER에 wav로 저장하고
 *       링크를 '녹음(문장)' · '녹음(아)' 칸에 적는다. (11/4 대표: 녹음도 저장)
 * 상황 문장: 자기소개 · 정보 전달 · 협상 · 공감·위로 · 발표·설득 중 무엇을 읽었는지 적는다(11/4).
 * 녹음 품질: 마이크가 실제로 받은 샘플레이트('48kHz' · '16kHz 낮음(이어폰 추정)' · '파일'). 11/5부터 녹음은 48kHz 원음(최소 44.1kHz)으로 온다.
 * 읽기 기능은 없다. 데이터는 시트와 드라이브에서만 본다.
 * 권한(appsscript.json oauthScopes): spreadsheets.currentonly(이 시트만) + drive(DriveApp은 drive.file로는 폴더·파일을 못 만든다).
 *   코드는 녹음 폴더에 파일을 '만들기'만 한다. 처음 한 번 setup()을 편집기에서 실행해 권한 허용 + 폴더 생성.
 * 재배포: 배포 관리 → 기존 배포 편집(연필) → 새 버전 (새 배포를 만들면 주소가 바뀐다)
 * @OnlyCurrentDoc
 */
const TAB = '목소리유형테스트';
const FOLDER = '터칭보이스_목소리유형테스트_녹음';
const HEAD = ['저장일시', '출처', '이름', '성별', '나이', '하는 일', '유형', '예상 유형', 'TIPI 10문항',
  '평균 높이(Hz)', '기준 대비(반음)', '억양 폭(반음)', '흔들림 SD', '속도(음절/초)', '음절 수', '말한 시간(초)',
  '크기 SD(dB)', '강약 폭(dB)', '소음 대비(dB)', '문장 끝 기울기', '저음%', '중저음%', '중고음%', '고음%',
  '아~ 길이(초)', '잡음비 HNR(dB)', 'CPP', '떨림', '소음 바닥(dB)',
  '컨디션 CPPS', '컨디션 음 끊김', '컨디션 소리 난 시간', '컨디션 소음 대비',
  '점수 숨', '점수 맑기', '점수 억양', '점수 크기', '총점',
  '인상 E', '인상 A', '인상 C', '인상 S', '인상 O',
  '자기보고 E', '자기보고 A', '자기보고 C', '자기보고 S', '자기보고 O',
  '일치도%', '목소리 나이', '목소리 호감도%', '원본(JSON)', '녹음(문장)', '녹음(아)', '상황 문장', '녹음 품질'];

function doGet() {
  return out({ ok: true, msg: '터칭보이스 목소리 유형 테스트 저장소' });
}

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) || '';
    if (raw.length > 12000000) return out({ ok: false, error: 'too_large' });
    const p = JSON.parse(raw);
    if (p && p.type === 'waitlist') return saveWaitlist(p);
    if (!p || p.type !== 'voicetype') return out({ ok: false, error: 'bad_type' });
    if (p.src !== 'web' && p.src !== 'app') return out({ ok: false, error: 'bad_source' });
    const at = new Date();
    if (p.src === 'web' && p.ver === 3) {
      // 11/5 대표 "익명 숫자 + 앱 할인": 웹 검사는 이름·녹음 없이 측정 숫자만 받는다(녹음은 앱에서 동의·구독 할인으로)
      ['audio', 'tipi', 'self', 'match', 'developmentConsent'].forEach(k => delete p[k]);
      p.name = '익명';
      p.at = at.toISOString();
    } else if (p.src === 'web') {
      const consent = p.developmentConsent;
      if (p.ver !== 2 || !consent || consent.version !== VOICE_CONSENT ||
          consent.retentionYears !== 3 || !Number.isFinite(Date.parse(consent.acceptedAt))) {
        return out({ ok: false, error: 'commercial_consent_required' });
      }
      if (!p.audio || !['sent', 'ah'].every(k => typeof p.audio[k] === 'string' && p.audio[k].length > 0 && p.audio[k].length <= 8000000)) return out({ ok: false, error: 'missing_recordings' });
      p.at = at.toISOString();
      p.captureId = Utilities.getUuid();
      p.expiresAt = voiceExpiry(at).toISOString();
      delete p.tipi;
      delete p.self;
      delete p.match;
    }
    const audio = p.audio || null;
    delete p.audio;
    const rec = JSON.stringify(p);
    if (rec.length > 20000) return out({ ok: false, error: 'too_large' });
    const name = txt(p.name, 20);
    if (!name) return out({ ok: false, error: 'no_name' });
    const s = p.score || {}, vo = p.voice || {}, se = p.self || {}, c = p.cond || {};
    const b = Array.isArray(p.bands) ? p.bands : [];
    const links = audio ? saveAudio(audio, at, name, txt(p.code, 4), p.src === 'web' ? p.captureId : null) : ['', ''];
    const row = [at, txt(p.src, 10), name, txt(p.sex, 2), num(p.age), txt(p.job, 20), txt(p.code, 4), txt(p.guess, 4),
      (Array.isArray(p.tipi) ? p.tipi.slice(0, 10).map(num) : []).join(' '),
      num(p.f0), num(p.stRel), num(p.rangeSt), num(p.sdSt), num(p.rate), num(p.syl), num(p.speakDur),
      num(p.dbsd), num(p.dyn), num(p.snr), num(p.endSlope), num(b[0]), num(b[1]), num(b[2]), num(b[3]),
      num(p.mpt), num(p.hnr), num(p.cpp), num(p.trem), num(p.noiseDb),
      num(c.cpps), num(c.breaks), num(c.voiced), num(c.snr),
      num(s.breath), num(s.clear), num(s.tune), num(s.steady), num(p.total),
      num(vo.E), num(vo.A), num(vo.C), num(vo.S), num(vo.O),
      num(se.E), num(se.A), num(se.C), num(se.S), num(se.O),
      num(p.match), num(p.voiceAge), num(p.attr), "'" + rec, links[0], links[1], txt(p.sitName || p.sit, 10), txt(p.recQ, 24)];
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let sh = ss.getSheetByName(TAB);
      if (!sh) {
        sh = ss.insertSheet(TAB);
        sh.appendRow(HEAD);
        sh.setFrozenRows(1);
      } else {
        // 칸을 새로 늘렸으면 기존 마지막 칸 뒤에만 제목을 붙인다
        const lc = sh.getLastColumn(), mc = sh.getMaxColumns();
        if (mc < HEAD.length) sh.insertColumnsAfter(mc, HEAD.length - mc);
        if (lc < HEAD.length) sh.getRange(1, lc + 1, 1, HEAD.length - lc).setValues([HEAD.slice(lc)]);
      }
      sh.appendRow(row);
    } finally {
      lock.releaseLock();
    }
    return out({ ok: true, audio: links.filter(String).length });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

// 11/5 대표: 웹 테스트 → 원하는 목소리 → 1분 체험 → 앱 대기예약. 새 탭 '앱대기예약'에 한 줄씩 쌓는다(기존 탭은 건드리지 않음)
const WL_TAB = '앱대기예약';
const WL_HEAD = ['신청일시', '출처', '이름', '휴대폰', '성별', '나이', '내 유형', '원하는 유형', '체험 결과', '동의'];
function saveWaitlist(p) {
  const name = txt(p.name, 20), phone = String(p.phone == null ? '' : p.phone).replace(/\D/g, '');
  if (!name) return out({ ok: false, error: 'no_name' });
  if (!/^01[016789]\d{7,8}$/.test(phone)) return out({ ok: false, error: 'bad_phone' });
  if (p.agree !== true) return out({ ok: false, error: 'no_agree' });
  const row = [new Date(), txt(p.src, 10), name, "'" + phone, txt(p.sex, 2), num(p.age), txt(p.code, 4), txt(p.target, 4), txt(p.trial, 200), '동의'];
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sh = ss.getSheetByName(WL_TAB);
    if (!sh) {
      sh = ss.insertSheet(WL_TAB);
      sh.appendRow(WL_HEAD);
      sh.setFrozenRows(1);
    }
    sh.appendRow(row);
  } finally {
    lock.releaseLock();
  }
  return out({ ok: true });
}

// 녹음 두 개(문장 · '아')를 wav로 저장하고 파일 링크를 돌려준다
function saveAudio(a, at, name, code, captureId) {
  const folder = getFolder();
  const base = Utilities.formatDate(at, 'Asia/Seoul', 'yyyyMMdd_HHmmss') + '_' + name.replace(/[\\/:*?"<>|']/g, '') + '_' + code;
  return [['sent', '문장'], ['ah', '아']].map(function (k) {
    const b64 = a[k[0]];
    if (typeof b64 !== 'string' || !b64 || b64.length > 8000000) return '';
    const blob = Utilities.newBlob(Utilities.base64Decode(b64), 'audio/wav', base + '_' + k[1] + '.wav');
    if (!captureId) return folder.createFile(blob).getUrl();
    const file = Drive.Files.create({ name: blob.getName(), parents: [folder.getId()],
      appProperties: { voiceCapture: captureId, consentVersion: VOICE_CONSENT } }, blob, { fields: 'id,webViewLink' });
    return file.webViewLink || 'https://drive.google.com/open?id=' + file.id;
  });
}

// 편집기에서 한 번 실행: 권한 허용 창을 띄우고 녹음 폴더를 만든다
function setup() {
  return getFolder().getUrl();
}

// 처음 만든 폴더 ID를 스크립트 속성에 기억해 두고 계속 같은 폴더에 저장한다
function getFolder() {
  const props = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const id = props.getProperty('FOLDER_ID');
    if (id) {
      try { return DriveApp.getFolderById(id); } catch (e) { /* 지워졌으면 새로 만든다 */ }
    }
    const f = DriveApp.createFolder(FOLDER);
    props.setProperty('FOLDER_ID', f.getId());
    return f;
  } finally {
    lock.releaseLock();
  }
}

// 숫자가 아니면 빈칸
function num(v) {
  return typeof v === 'number' && isFinite(v) ? v : '';
}

// 글자 길이 제한 + 시트 수식으로 읽히지 않게(= + - @ 로 시작하면 앞에 ' 를 붙인다)
function txt(v, max) {
  const t = String(v == null ? '' : v).trim().slice(0, max);
  return /^[=+\-@]/.test(t) ? "'" + t : t;
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

const VOICE_CONSENT = 'voice-dev-2026-11-05';

function voiceExpiry(collected) {
  const expiry = new Date(collected);
  expiry.setUTCFullYear(expiry.getUTCFullYear() + 3);
  if (expiry.getUTCMonth() !== collected.getUTCMonth()) expiry.setUTCDate(0);
  return expiry;
}

// 새 동의로 만든 파일만 조회한다. 링크·파일명·이름만으로 삭제 대상을 정하지 않는다.
function listCaptures(folderId, extraQuery) {
  const tagged = "appProperties has { key='consentVersion' and value='" + VOICE_CONSENT + "' }";
  const query = "'" + folderId + "' in parents and " + tagged + " and " + extraQuery;
  const files = [];
  let pageToken;
  do {
    const page = Drive.Files.list({q: query, fields: 'nextPageToken,files(id,createdTime,appProperties)', pageSize: 200, pageToken: pageToken});
    files.push.apply(files, page.files || []);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return files;
}

function storedCapture(raw) {
  try {
    const record = JSON.parse(String(raw).replace(/^'/, ''));
    return record.src === 'web' && record.ver === 2 &&
      record.developmentConsent && record.developmentConsent.version === VOICE_CONSENT &&
      /^[0-9a-f-]{36}$/i.test(record.captureId) ? record : null;
  } catch (e) { return null; }
}

// Apps Script 트리거에서 매일 실행. 행 저장 전에 중단된 녹음도 수집 시각으로 만료 처리한다.
function purgeExpiredWebRecordings() {
  const now = new Date(), cutoff = new Date(now);
  cutoff.setUTCFullYear(now.getUTCFullYear() - 3);
  cutoff.setUTCDate(cutoff.getUTCDate() + 1); // 윤일 경계까지 조회하고 실제 만료일을 검사한다.
  const folderId = PropertiesService.getScriptProperties().getProperty('FOLDER_ID');
  if (!folderId) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const files = listCaptures(folderId, "createdTime <= '" + cutoff.toISOString() + "'");
    files.forEach(file => {
      if (voiceExpiry(new Date(file.createdTime)) <= now) Drive.Files.remove(file.id);
    });
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB);
    if (!sheet || sheet.getLastRow() < 2) return;
    const col = HEAD.indexOf('원본(JSON)') + 1;
    const rows = sheet.getRange(2, col, sheet.getLastRow() - 1, 1).getValues();
    for (let i = rows.length - 1; i >= 0; i--) {
      const record = storedCapture(rows[i][0]);
      if (record && new Date(record.expiresAt) <= now) {
        // 같은 수집 건의 두 파일과 행을 함께 정리하고, 중단 시 다음 실행에서 재개한다.
        eraseCapture(sheet, i + 2, record, folderId);
      }
    }
  } finally { lock.releaseLock(); }
}

function eraseCapture(sheet, row, record, folderId) {
  const byId = "appProperties has { key='voiceCapture' and value='" + record.captureId + "' }";
  listCaptures(folderId, byId).forEach(file => Drive.Files.remove(file.id));
  sheet.deleteRow(row);
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('녹음 동의 관리')
    .addItem('철회 요청한 녹음 한 건 삭제', 'withdrawSelectedWebRecording').addToUi();
}

// 본인 확인 후 운영자가 해당 검사 행을 선택한다. 공개 웹 요청으로는 호출할 수 없다.
function withdrawSelectedWebRecording() {
  const sheet = SpreadsheetApp.getActiveSheet(), range = sheet.getActiveRange(), ui = SpreadsheetApp.getUi();
  if (sheet.getName() !== TAB || !range || range.getNumRows() !== 1 || range.getRow() < 2) return;
  const row = range.getRow(), col = HEAD.indexOf('원본(JSON)') + 1;
  const record = storedCapture(sheet.getRange(row, col).getValue());
  if (!record) { ui.alert('이번 선택 동의로 수집된 웹 검사 행을 선택해 주세요.'); return; }
  if (ui.alert('동의 철회', record.name + ' · ' + record.at + ' 검사 행과 녹음을 영구 삭제할까요?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const current = storedCapture(sheet.getRange(row, col).getValue());
    const folderId = PropertiesService.getScriptProperties().getProperty('FOLDER_ID');
    if (!folderId || !current || current.captureId !== record.captureId) throw Error('저장 위치나 행이 바뀌었어요. 다시 선택해 주세요.');
    eraseCapture(sheet, row, current, folderId);
  } finally { lock.releaseLock(); }
}
