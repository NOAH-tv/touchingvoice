import { encodeWavToFlac } from './src/flac-encode.js';
import { researchSnapshot } from './research-policy.js';
export const MAX_ARTIFACT_BYTES=20*1024*1024;
export const MAX_AUDIO_BYTES=150*1024*1024;
export const MAX_ANALYSIS_BYTES=64*1024*1024;
export const UPLOAD_CHUNK_BYTES=4*1024*1024;
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
export async function blobSha256(blob) {
  const bytes=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
  return [...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,'0')).join('');
}
/** The complete personal model belongs to the private analysis archive. The
 * bounded exam/Sheet metadata only carries a reference to that exact snapshot. */
export function calibrationMetadata(profile) {
  if(!profile?.personalModel)return profile;
  const {personalModel,...calibration}=profile;
  if(personalModel.version!==1||typeof personalModel.id!=='string'||personalModel.id.length>80
    ||!['adaptive','fixed','off'].includes(personalModel.mode))throw new Error('개인 반응 모델의 저장 정보가 올바르지 않습니다.');
  calibration.personalModelRef={version:personalModel.version,id:personalModel.id,mode:personalModel.mode,
    suppressCommon:personalModel.suppressCommon===true,createdAt:personalModel.createdAt,
    archivePath:'analysisRecord.profile.personalModel',
    observedNotes:Object.fromEntries(['nas','oro','aes','src'].map(key=>[key,(personalModel.layers?.[key]?.bins||[]).map(bin=>bin.midi)])),
    normalization:'personal_acoustic_response_not_development_score'};
  return calibration;
}
/** Freeze source/analysis once. Large source audio is never base64-expanded here;
 * the transport only expands the next 4 MiB slice. */
export async function prepareUploadArtifacts(entry,context,{maxAudioBytes=MAX_AUDIO_BYTES,maxAnalysisBytes=MAX_ANALYSIS_BYTES,encodeFlac=encodeWavToFlac,legacy=false}={}) {
  if(entry.profileId!==context.student.id)throw new Error('선택한 학생과 기록 소유자가 일치하지 않습니다.');
  if(!(entry.blob instanceof Blob)||!entry.blob.size||!(entry.datasetBlob instanceof Blob)||!entry.fileAnalysis||entry.unsaved||entry.saving)throw new Error('원음·전체 분석·프레임 데이터를 PC에 저장한 뒤 서버에 보관할 수 있습니다.');
  if(entry.blob.size>maxAudioBytes)throw new Error(`원음이 ${maxAudioBytes/1024/1024} MB를 넘습니다. 이 PC에 저장되어 있으며 서버에는 아직 전송되지 않았습니다.`);
  if(entry.datasetBlob.size>Math.floor(maxAnalysisBytes*3/4))throw new Error(`전체 프레임 분석 파일이 ${maxAnalysisBytes/1024/1024} MB를 넘습니다. 원음과 분석은 PC에 보관되며 서버에는 아직 전송되지 않았습니다.`);
  const metrics=JSON.parse(JSON.stringify(summarizeMetrics(entry)));
  const metadata=JSON.parse(JSON.stringify({research:researchSnapshot(entry),format:'touchingvoice-franchise-exam',version:1,createdAt:entry.createdAt,duration:entry.duration,sourceService:'franchise-studio',sourceKind:entry.sourceKind||'recording',sourceSha256:entry.fileAnalysis.source?.sha256||null,analysisVersion:entry.fileAnalysis.analysisVersion||entry.fileAnalysis.version,annotation:entry.annotation||{},personality:entry.examination?.big5||{},examination:entry.examination||{},captureSettings:entry.captureSettings||null,calibration:calibrationMetadata(entry.profile),frameData:{encoding:'float32-le;base64',columns:entry.fileAnalysis.dataset?.columnCount,rows:entry.fileAnalysis.dataset?.rowCount}}));
  if(byteLength(metadata)>16*1024)throw new Error('검사 메타데이터가 서버의 16 KB 한도를 넘었습니다. 전체 결과는 PC에 보관됩니다.');
  // The complete binary frame matrix is preserved exactly; missing values remain IEEE NaN.
  const {blob,datasetBlob,saving,unsaved,franchiseUpload,uploadArtifacts,driveBackup,...recordFields}=entry;
  // Freeze the JSON snapshot before awaiting binary reads; later personal tuning
  // must not change which model produced this archived examination.
  const analysisRecord=JSON.parse(JSON.stringify(recordFields));
  const sourceHash=await blobSha256(blob);
  if(/^[a-f0-9]{64}$/.test(metadata.sourceSha256||'')&&metadata.sourceSha256!==sourceHash)throw new Error('분석한 원음과 저장할 파일이 일치하지 않습니다. 원음을 다시 분석해 주세요.');
  metadata.sourceSha256=sourceHash;
  let audioBlob=blob,encoding=null;
  if(!legacy&&['audio/wav','audio/x-wav'].includes(blob.type.split(';')[0])&&typeof Worker!=='undefined'){
    try {const result=await encodeFlac(blob);const {blob:encoded,...info}=result;if(encoded.size<blob.size){audioBlob=encoded;encoding=info;}}
    catch { /* Preserve the original WAV on unsupported input, Worker or WASM failure. */ }
  }
  const audioHash=audioBlob===blob?sourceHash:await blobSha256(audioBlob);
  if(!legacy)metadata.storageAudio={format:audioBlob===blob?'original':'flac',mimeType:audioBlob.type,sha256:audioHash,sourceSha256:sourceHash,lossless:true,...encoding};
  const full={format:'touchingvoice-franchise-analysis',version:1,branchId:context.branchId,studentId:context.student.id,recordId:entry.id,analysisRecord,storageAudio:metadata.storageAudio};
  const datasetHeader={encoding:'base64',binaryFormat:'float32-le',mimeType:datasetBlob.type,byteLength:datasetBlob.size};
  const analysis=new Blob([JSON.stringify(full).slice(0,-1),',"datasetData":',JSON.stringify(datasetHeader).slice(0,-1),',"data":"',await blobBase64(datasetBlob),'"}}'],{type:'application/json'});
  if(analysis.size>maxAnalysisBytes)throw new Error(`전체 프레임 분석 파일이 ${maxAnalysisBytes/1024/1024} MB를 넘습니다. 원음과 분석은 PC에 보관되며 서버에는 아직 전송되지 않았습니다.`);
  const mimeType=audioBlob.type.split(';')[0]||'audio/webm';
  const extension=({'audio/wav':'wav','audio/x-wav':'wav','audio/mpeg':'mp3','audio/mp4':'m4a','audio/aac':'aac','audio/ogg':'ogg','audio/webm':'webm','audio/flac':'flac'})[mimeType]||'bin';
  const safeId=String(analysisRecord.id).replace(/[^A-Za-z0-9_-]/g,'_');
  const analysisHash=await blobSha256(analysis);
  if(byteLength(metadata)>16*1024)throw new Error('검사 메타데이터가 서버의 16 KB 한도를 넘었습니다. 전체 결과는 PC에 보관됩니다.');
  return {studentId:context.student.id,recordId:analysisRecord.id,metrics,metadata,
    audio:{blob:audioBlob,mimeType,name:safeId+'.'+extension,size:audioBlob.size,sha256:audioHash},
    analysis:{blob:analysis,mimeType:'application/json',name:safeId+'-analysis.json',size:analysis.size,sha256:analysisHash}};
}
export async function legacyUploadPayload(artifacts) {
  if(artifacts.audio.size>MAX_ARTIFACT_BYTES||artifacts.analysis.size>MAX_ARTIFACT_BYTES||artifacts.audio.size+artifacts.analysis.size>MAX_ARTIFACT_BYTES)throw new Error('큰 원음은 분할 전송으로 저장해야 합니다.');
  const {studentId,recordId,metrics,metadata,audio,analysis}=artifacts;
  return {studentId,recordId,metrics,metadata,audio:{base64:await blobBase64(audio.blob),mimeType:audio.mimeType,name:audio.name},analysis:{base64:await blobBase64(analysis.blob),mimeType:analysis.mimeType,name:analysis.name}};
}
export async function prepareUpload(entry,context) {
  return legacyUploadPayload(await prepareUploadArtifacts(entry,context,{maxAudioBytes:MAX_ARTIFACT_BYTES,maxAnalysisBytes:MAX_ARTIFACT_BYTES}));
}
