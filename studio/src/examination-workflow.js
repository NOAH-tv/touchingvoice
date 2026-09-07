const ANALYSIS_ACTIVE = new Set(['queued', 'decoding', 'analyzing', 'saving']);
const SERVER_ACTIVE = new Set(['queued', 'uploading']);
const ARTIFACTS = ['audio', 'frames', 'analysis'];
const ARTIFACT_LABELS = { audio: '원음', frames: '프레임 CSV', analysis: '분석 JSON' };
const id = value => typeof value === 'string' && value.length > 0 ? value : null;
const clamp = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
const sourceExists = entry => Number.isFinite(entry?.blob?.size) && entry.blob.size > 0;
const step = (key, state, label, detail, extra = {}) => ({ key, state, label, detail,
  progress: state === 'complete' ? 1 : null, canRetry: false, href: null, ...extra });

function latestJob(list, entry, server = false) {
  if (!Array.isArray(list) || !entry) return null;
  for (let i = list.length - 1; i >= 0; i--) {
    const job = list[i];
    // Analysis job.id identifies its worker, while Drive job.id identifies the
    // examination. Prefer the immutable owner/snapshot over mutable UI state.
    const sessionId = job?.owner?.sessionId ?? job?.snapshot?.id ?? job?.entry?.id ?? (server ? job?.id : null);
    const profileId = job?.owner?.profileId ?? job?.snapshot?.profileId ?? job?.entry?.profileId;
    if (sessionId === entry.id && profileId === entry.profileId) return job;
  }
  return null;
}

function safeDriveUrl(artifact) {
  if (!id(artifact?.id) || typeof artifact?.url !== 'string') return null;
  try {
    const url = new URL(artifact.url);
    return url.protocol === 'https:' && ['drive.google.com', 'docs.google.com'].includes(url.hostname)
      && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

/**
 * Pure per-examination state selector; never starts work or changes an entry.
 * `jobs` accepts {analysis: fileAnalyzer.jobs, server: driveBackup.jobs}; a raw
 * array is also accepted as analysis jobs. Pass the selected immutable-owner
 * record, not the current form draft. During a new recording, previous results
 * and Drive links are suppressed until its own saved entry is available.
 */
export function selectExamProgress({ entry = null, recording = false, busy = false,
  hasParticipant = false, connection = null, jobs = {} } = {}) {
  const current = recording ? null : entry;
  const owner = id(current?.id) && id(current?.profileId)
    ? { sessionId: current.id, profileId: current.profileId } : null;
  const backup = current?.driveBackup || {};
  const ownerConflict = !!(current && (!owner
    || (id(current.participant?.id) && current.participant.id !== owner.profileId)
    || (backup.owner && (backup.owner.sessionId !== owner.sessionId || backup.owner.profileId !== owner.profileId))));
  const consent = current?.examination?.consent;
  const serviceConsent = consent?.service === true, driveConsent = consent?.drive === true;
  const captureReady = sourceExists(current);
  const analysisJob = latestJob(Array.isArray(jobs) ? jobs : jobs?.analysis, current);
  const serverJob = latestJob(Array.isArray(jobs) ? [] : jobs?.server, current, true);
  const analysisStatus = analysisJob?.status || current?.analysisStatus;
  const analysisActive = ANALYSIS_ACTIVE.has(analysisStatus);
  const localComplete = !!(current?.fileAnalysis && current?.datasetBlob && !current.unsaved && !current.saving
    && !analysisActive && !['error', 'cancelled'].includes(analysisStatus));
  // Connected, analysis-complete, and even three in-memory file acknowledgments
  // do not independently mean that this examination's backup is complete.
  const serverComplete = !!(current && !ownerConflict && backup.state === 'complete');
  const driveUrl = serverComplete ? safeDriveUrl(backup.artifacts?.analysis) : null;

  let participant = current
    ? ownerConflict ? step('participant', 'blocked', '검사 소유자 확인 필요', '검사에 저장된 회원 번호가 일치하지 않습니다.')
      : serviceConsent ? step('participant', 'complete', '대상자 · 동의 확인', '이 검사에 저장된 회원 정보와 동의를 사용합니다.')
        : step('participant', 'blocked', '수집 동의 기록 없음', '이 기록에 서비스 수집·이용 동의가 확인되지 않았습니다.')
    : hasParticipant ? step('participant', 'complete', '대상자 확인 완료', '확인한 대상자의 새 검사를 진행합니다.')
      : step('participant', 'pending', '대상자 정보 확인', '이름과 개인정보·음성 수집 및 이용 동의를 확인해 주세요.');
  let capture = recording ? step('capture', 'active', '원음 녹음 중', '녹음을 종료하면 이 원음을 전체 분석합니다.')
    : captureReady ? current.unsaved ? step('capture', 'error', '원음 PC 저장 확인 필요', '원음은 현재 화면에 남아 있지만 기기 저장에 실패했습니다.')
      : current.saving && !current.fileAnalysis ? step('capture', 'active', '원음 PC 저장 중', '원음 파일을 이 PC에 저장하고 있습니다.')
        : step('capture', 'complete', '원음 확보 완료', '이 검사의 원음 파일을 확보했습니다.')
    : current ? step('capture', 'error', '원음 파일 없음', '이 기록에 분석할 원음 파일이 없습니다.')
      : busy && hasParticipant ? step('capture', 'active', '원음 준비 중', '마이크 또는 선택한 음성 파일을 준비하고 있습니다.')
        : step('capture', hasParticipant ? 'pending' : 'blocked', '녹음 또는 파일 선택', '녹음하거나 음성 파일을 선택해 주세요.');

  let analysis = step('analysis', 'pending', '전체 음성 분석 대기', '원음이 준비되면 전체 구간의 음향 지표와 프레임 데이터를 계산합니다.');
  if (current && analysisActive) {
    const descriptions = {
      queued: ['전체 분석 대기', '앞선 파일의 분석이 끝나면 이 검사를 시작합니다.'],
      decoding: ['음성 파일 읽는 중', '재생 없이 원음의 전체 구간을 읽고 있습니다.'],
      analyzing: ['전체 음성 분석 중', '전체 구간의 음향 지표와 프레임 데이터를 계산하고 있습니다.'],
      saving: ['분석 결과 PC 저장 중', '원음·전체 지표·프레임 데이터를 이 PC에 저장하고 있습니다.'],
    };
    analysis = step('analysis', 'active', ...descriptions[analysisStatus], {
      progress: analysisStatus === 'queued' ? 0 : analysisStatus === 'saving' ? .99 : clamp(analysisJob?.progress),
    });
  } else if (localComplete) {
    analysis = step('analysis', 'complete', 'PC 분석 저장 완료', '전체 음성 분석 결과와 프레임 데이터가 이 PC에 저장됐습니다.');
  } else if (current && (['error', 'cancelled'].includes(analysisStatus) || current.unsaved || (current.fileAnalysis && !current.datasetBlob))) {
    const cancelled = analysisStatus === 'cancelled';
    analysis = step('analysis', 'error', cancelled ? '전체 분석 취소됨' : '분석 · PC 저장 확인 필요',
      current.analysisError || (current.unsaved ? '기기 저장에 실패했습니다. 원음으로 분석과 저장을 다시 시도할 수 있습니다.'
        : '전체 분석과 프레임 데이터 저장을 마치지 못했습니다.'),
      { canRetry: !!(captureReady && owner && !ownerConflict && !busy) });
  }

  let server = step('server', 'pending', '서버 저장 대기', 'PC 분석 저장 후 동의한 검사 자료를 Drive에 저장합니다.');
  const serverRunning = serverJob && SERVER_ACTIVE.has(serverJob.status) && !serverJob.hold;
  const state = serverRunning ? serverJob.status : backup.state;
  const uncertain = state === 'uncertain' || serverJob?.hold === 'uncertain'
    || (state === 'uploading' && !serverRunning);
  const canRetryServer = !!(owner && !ownerConflict && serviceConsent && driveConsent && captureReady
    && localComplete && !busy && !serverRunning && (uncertain || state === 'error'));
  if (serverComplete) {
    server = step('server', 'complete', '서버 저장 완료', '이 검사의 원음·프레임 CSV·분석 JSON이 Drive에 저장됐습니다.', { href: driveUrl });
  } else if (ownerConflict) {
    server = step('server', 'blocked', '서버 저장 중단', '검사에 저장된 회원 번호를 확인해야 합니다.');
  } else if (current && (!serviceConsent || !driveConsent || state === 'not-consented')) {
    server = step('server', 'local-only', 'PC 보관 · 서버 저장 안 함',
      !serviceConsent ? '이 검사에 서비스 수집·이용 동의 기록이 없어 서버로 보내지 않습니다.'
        : '이 검사에 Drive 보관 동의가 없어 서버로 보내지 않습니다.');
  } else if (uncertain) {
    server = step('server', 'uncertain', '서버 저장 결과 확인 필요',
      backup.error || '응답을 확인하지 못했습니다. Drive의 파일을 확인한 뒤 재시도 여부를 선택해 주세요.', { canRetry: canRetryServer });
  } else if (state === 'error') {
    server = step('server', 'error', '서버 저장 실패', backup.error || 'PC 분석 결과는 유지됩니다. 서버 저장을 다시 시도할 수 있습니다.',
      { canRetry: canRetryServer });
  } else if (localComplete && (state === 'queued' || state === 'uploading')) {
    const acknowledged = ARTIFACTS.filter(key => safeDriveUrl(backup.artifacts?.[key])).length;
    const artifact = ARTIFACT_LABELS[backup.pendingArtifact?.key];
    server = step('server', 'active', state === 'queued' ? '서버 저장 대기 중' : '서버에 저장 중',
      `${artifact ? artifact + ' 전송 · ' : ''}원음·프레임 CSV·분석 JSON 중 ${acknowledged}/3개 저장 확인`,
      { progress: Math.min(.99, acknowledged / 3) });
  } else if (localComplete && connection?.reachable === false) {
    server = step('server', 'blocked', '서버 연결 확인 필요', connection.error || 'PC 분석 결과는 저장됐습니다. Drive 연결 상태를 확인해 주세요.');
  }

  const steps = [participant, capture, analysis, server];
  let phase = recording ? 'capture' : !current ? hasParticipant ? 'capture' : 'participant'
    : ownerConflict ? 'participant' : !captureReady ? 'capture'
      : analysis.state !== 'complete' ? 'analysis' : 'server';
  const selected = steps.find(item => item.key === phase);
  const label = phase === 'server' && serverComplete ? '검사 · 서버 저장 완료'
    : phase === 'server' && server.state === 'local-only' ? 'PC 분석 저장 완료 · 서버 저장 안 함'
      : phase === 'server' && server.state === 'pending' ? 'PC 분석 저장 완료 · 서버 저장 대기' : selected.label;
  return { owner, phase, label, detail: selected.detail, steps, localComplete, serverComplete,
    canRetryAnalysis: analysis.canRetry, canRetryServer: server.canRetry,
    requiresUncertainConfirmation: server.state === 'uncertain', driveUrl };
}
