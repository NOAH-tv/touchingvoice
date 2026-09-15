/** Server summaries are read-only. Match immutable student/record IDs, never names. */
export function mergeServerHistory(localSessions, exams, context) {
  if (!Array.isArray(exams)) throw new Error('서버의 검사 목록을 확인하지 못했습니다.');
  if (context.practice) return localSessions.filter(s => s.profileId === context.student.id);
  const local = localSessions.filter(s => s.profileId === context.student.id && !s.serverOnly);
  const records = new Map(local.map(s => [s.id, s]));
  for (const exam of exams) {
    if (!exam?.id || !exam.recordId || exam.studentId !== context.student.id ||
        exam.branchId && exam.branchId !== context.branchId) continue;
    const m = exam.metrics || {}, meta = exam.metadata || {}, existing = records.get(exam.recordId);
    const remote = {
      id: exam.recordId, profileId: context.student.id, name: context.student.name,
      createdAt: meta.createdAt || exam.createdAt, duration: m.duration ?? meta.duration ?? 0,
      sourceKind: meta.sourceKind, annotation: meta.annotation || {}, examination: meta.examination,
      captureSettings: meta.captureSettings, profile: meta.calibration,
      research: meta.research, voiceMetrics: m.voiceMetrics, serverOnly: true,
      fileAnalysis: {...m, waveform: [], pitchTrace: [], dataset: {
        rowCount: meta.frameData?.rows, columnCount: meta.frameData?.columns
      }}, analysisStatus: 'complete'
    };
    const archive = {state: 'complete', examId: exam.id, storage: exam.storage, completedAt: exam.createdAt};
    // Keep this device's original Blob, complete frame matrix, and saved calibration.
    records.set(exam.recordId, existing ? Object.assign(existing, {
      franchiseUpload: {...existing.franchiseUpload, ...archive}}) : {...remote, franchiseUpload: archive});
  }
  return [...records.values()].sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}
