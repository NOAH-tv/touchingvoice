export const MAX_ARTIFACT_BYTES=8*1024*1024;
const byteLength=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
export function summarizeMetrics(entry) {
  const a=entry.fileAnalysis;
  if(!a)throw new Error('전체 음성 분석이 끝난 뒤 저장할 수 있습니다.');
  const summary={format:'touchingvoice-franchise-metrics',version:1,analysisVersion:a.analysisVersion||a.version,method:a.method,f0:a.voiceMetrics?.metrics?.f0?.median??null,jitter:a.additionalStats?.JIT?.median??null,shimmer:a.additionalStats?.SHI?.median??null,hnr:a.additionalStats?.HNR?.median??null,duration:a.duration,sampleRate:a.sampleRate,frameCount:a.frameCount,voicedSeconds:a.voicedSeconds,unvoicedSeconds:a.unvoicedSeconds,signal:a.signal,dynamicRangeDb:a.dynamicRangeDb,voiceMetrics:a.voiceMetrics,fileLayers:a.fileLayers,additionalStats:a.additionalStats};
  if(byteLength(summary)>32*1024)throw new Error('요약 지표가 서버의 32 KB 한도를 넘었습니다. 전체 결과는 PC에 보관됩니다.');
  return summary;
}
export async function blobBase64(blob) {
  const bytes=new Uint8Array(await blob.arrayBuffer()),chunks=[];
  for(let i=0;i<bytes.length;i+=32768)chunks.push(String.fromCharCode(...bytes.subarray(i,i+32768)));
  return btoa(chunks.join(''));
}
export async function prepareUpload(entry,context) {
  if(entry.profileId!==context.student.id)throw new Error('선택한 학생과 기록 소유자가 일치하지 않습니다.');
  if(!(entry.blob instanceof Blob)||!entry.blob.size||!(entry.datasetBlob instanceof Blob)||!entry.fileAnalysis||entry.unsaved||entry.saving)throw new Error('원음·전체 분석·프레임 데이터를 PC에 저장한 뒤 서버에 보관할 수 있습니다.');
  if(entry.blob.size>MAX_ARTIFACT_BYTES)throw new Error('원음이 8 MB를 넘습니다. 이 PC에 저장되어 있으며 서버에는 아직 전송되지 않았습니다.');
  const metrics=summarizeMetrics(entry);
  const metadata={format:'touchingvoice-franchise-exam',version:1,createdAt:entry.createdAt,duration:entry.duration,sourceService:'franchise-studio',sourceKind:entry.sourceKind||'recording',sourceSha256:entry.fileAnalysis.source?.sha256||null,analysisVersion:entry.fileAnalysis.analysisVersion||entry.fileAnalysis.version,annotation:entry.annotation||{},personality:entry.examination?.big5||{},examination:entry.examination||{},calibration:entry.profile,frameData:{encoding:'float32-le;base64',columns:entry.fileAnalysis.dataset?.columnCount,rows:entry.fileAnalysis.dataset?.rowCount}};
  if(byteLength(metadata)>16*1024)throw new Error('검사 메타데이터가 서버의 16 KB 한도를 넘었습니다. 전체 결과는 PC에 보관됩니다.');
  // The complete binary frame matrix is preserved exactly; missing values remain IEEE NaN.
  const {blob,datasetBlob,saving,unsaved,franchiseUpload,driveBackup,...analysisRecord}=entry;
  const full={format:'touchingvoice-franchise-analysis',version:1,branchId:context.branchId,studentId:context.student.id,recordId:entry.id,analysisRecord,datasetData:{encoding:'base64',binaryFormat:'float32-le',mimeType:datasetBlob.type,byteLength:datasetBlob.size,data:await blobBase64(datasetBlob)}};
  const analysis=new Blob([JSON.stringify(full)],{type:'application/json'});
  if(analysis.size>MAX_ARTIFACT_BYTES)throw new Error('전체 프레임 분석 파일이 8 MB를 넘습니다. 원음과 분석은 PC에 보관되며 서버에는 아직 전송되지 않았습니다.');
  const mimeType=entry.blob.type.split(';')[0]||'audio/webm';
  const extension=({'audio/wav':'wav','audio/x-wav':'wav','audio/mpeg':'mp3','audio/mp4':'m4a','audio/aac':'aac','audio/ogg':'ogg','audio/webm':'webm','audio/flac':'flac'})[mimeType]||'bin';
  const safeId=String(entry.id).replace(/[^A-Za-z0-9_-]/g,'_');
  return {studentId:context.student.id,recordId:entry.id,metrics,metadata,audio:{base64:await blobBase64(entry.blob),mimeType,name:safeId+'.'+extension},analysis:{base64:await blobBase64(analysis),mimeType:'application/json',name:safeId+'-analysis.json'}};
}
