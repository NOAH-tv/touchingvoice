/** Pure intake helpers. Display names are never used to generate member IDs. */
const SCORE_KEYS = ['E', 'C', 'A', 'N', 'O', 'V'];
const isRecord = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const stripControls = value => value.normalize('NFC').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

export function normalizeParticipantName(value) {
  return typeof value === 'string' ? stripControls(value).replace(/\s+/gu, ' ').trim().toLowerCase() : '';
}

export function normalizePhone(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).normalize('NFKC').replace(/\D/g, '');
}

function participants(profiles, includeDefault = false) {
  return Array.isArray(profiles) ? profiles.filter(entry => isRecord(entry)
    && typeof entry.id === 'string' && entry.id.trim()
    && (includeDefault || entry.id !== 'default') && isRecord(entry.profile)) : [];
}

const entryName = entry => normalizeParticipantName(entry.profile.name);
const entryPhone = entry => normalizePhone(entry.member?.phone);

/** Suggestions only: a partial name or phone suffix is never enough to auto-merge. */
export function findParticipantMatches(profiles, {name, phone} = {}) {
  const normalizedName = normalizeParticipantName(name), normalizedPhone = normalizePhone(phone);
  if (!normalizedName && !normalizedPhone) return [];
  return participants(profiles).filter(entry =>
    (normalizedName && entryName(entry).includes(normalizedName))
    || (normalizedPhone && entryPhone(entry).endsWith(normalizedPhone)));
}

export function resolveParticipant(profiles, {memberId, name, phone, forceNew = false} = {}) {
  if (forceNew === true) return {kind: 'new'};
  const explicitId = typeof memberId === 'string' ? memberId.trim() : '';
  if (explicitId) {
    const entry = participants(profiles, true).find(candidate => candidate.id === explicitId);
    // A stale selection must not silently resolve to somebody else.
    return entry ? {kind: 'existing', entry} : {kind: 'new'};
  }
  const normalizedName = normalizeParticipantName(name), normalizedPhone = normalizePhone(phone);
  const entries = participants(profiles);
  const sameName = normalizedName ? entries.filter(entry => entryName(entry) === normalizedName) : [];
  if (!normalizedPhone) return sameName.length ? {kind: 'choose', candidates: sameName} : {kind: 'new'};
  const exact = sameName.filter(entry => entryPhone(entry) === normalizedPhone);
  if (exact.length === 1) return {kind: 'existing', entry: exact[0]};
  if (exact.length > 1) return {kind: 'choose', candidates: exact};
  // A changed name or a legacy member without a phone requires an explicit choice.
  const candidates = entries.filter(entry => entryPhone(entry) === normalizedPhone
    || (normalizedName && entryName(entry) === normalizedName && !entryPhone(entry)));
  return candidates.length ? {kind: 'choose', candidates} : {kind: 'new'};
}

function text(value, label, limit, collapseWhitespace = false) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new Error(`${label}을(를) 올바르게 입력해 주세요.`);
  const clean = stripControls(value).trim();
  const result = collapseWhitespace ? clean.replace(/\s+/gu, ' ') : clean;
  if (result.length > limit) throw new Error(`${label}은(는) ${limit}자 이내로 입력해 주세요.`);
  return result;
}

function optionalNumber(value, label, maximum) {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) return null;
  if (typeof value !== 'number' && typeof value !== 'string') throw new Error(`${label}은(는) 숫자로 입력해 주세요.`);
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > maximum) {
    throw new Error(`${label}은(는) 0~${maximum} 사이의 숫자로 입력해 주세요.`);
  }
  return number;
}

export function validateParticipantDraft(draft) {
  if (!isRecord(draft)) throw new Error('참여자 정보를 입력해 주세요.');
  const name = text(draft.name, '이름', 80, true);
  if (!name) throw new Error('이름을 입력해 주세요.');
  const rawPhone = text(draft.phone, '연락처', 64).normalize('NFKC');
  const phone = normalizePhone(rawPhone);
  if (rawPhone && (!/^[+\d\s().-]+$/u.test(rawPhone) || phone.length < 7 || phone.length > 15)) {
    throw new Error('연락처는 숫자 7~15자리로 입력해 주세요. 공백과 하이픈은 사용할 수 있습니다.');
  }
  const inputConsent = isRecord(draft.consent) ? draft.consent : {};
  const consent = {
    service: inputConsent.service === true,
    research: inputConsent.research === true,
    marketing: inputConsent.marketing === true,
    drive: inputConsent.drive === true,
  };
  if (!consent.service) throw new Error('서비스 이용 동의를 확인해 주세요.');
  const scores = isRecord(draft.big5) ? draft.big5 : {};
  const big5 = Object.fromEntries(SCORE_KEYS.map(key => [key, optionalNumber(scores[key], `${key} 점수`, 100)]));
  return {
    memberId: text(draft.memberId, '회원 식별값', 160),
    forceNew: draft.forceNew === true,
    name, phone,
    gender: text(draft.gender, '성별', 40, true),
    age: optionalNumber(draft.age, '나이', 120),
    song: text(draft.song, '곡명', 200),
    section: text(draft.section, '구간', 200),
    conditions: text(draft.conditions, '녹음 조건', 2000),
    note: text(draft.note, '메모', 4000),
    big5, consent,
  };
}

/** Detached values recorded for this examination; later form edits cannot alter them. */
export function createParticipantSnapshot(draft, {profileId, recordedAt} = {}) {
  const validated = validateParticipantDraft(draft);
  const identity = text(profileId, '회원 식별값', 160);
  if (!identity) throw new Error('저장할 회원을 먼저 선택해 주세요.');
  if (recordedAt === null || recordedAt === '') throw new Error('기록 시각을 확인해 주세요.');
  const date = recordedAt === undefined ? new Date() : new Date(recordedAt);
  if (!Number.isFinite(date.getTime())) throw new Error('기록 시각을 확인해 주세요.');
  const timestamp = date.toISOString();
  return {
    ...validated, version: 1, profileId: identity, recordedAt: timestamp,
    consent: {...validated.consent, checkedAt: timestamp},
  };
}
