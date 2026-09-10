import { call } from '../../api.js';
import { getContext, postParent } from '../context.js';
import { prepareUploadArtifacts, legacyUploadPayload, blobBase64, blobSha256, MAX_ARTIFACT_BYTES, UPLOAD_CHUNK_BYTES } from '../upload-data.js?v=pcm-upload-20260910';
const retryableCodes=new Set(['RESULT_UNCERTAIN','CONNECTION_FAILED','HTTP_ERROR','BUSY','UPLOAD_BUSY','UPLOAD_CHECKSUM_PENDING','UPLOAD_VERIFICATION_PENDING','ARTIFACT_CHECKSUM_PENDING','EXAM_UPLOAD_INCOMPLETE','ANALYSIS_SHEET_PENDING','CHECKSUM_PENDING','UPLOAD_RETRY','UPLOAD_RESPONSE','UPLOAD_OFFSET']);
const sameOwner=(a,b)=>a.uid===b.uid&&a.branchId===b.branchId&&a.student?.id===b.student?.id;
const uploadError=(code,message)=>Object.assign(new Error(message),{code});
const descriptor=artifact=>({size:artifact.size,mimeType:artifact.mimeType,name:artifact.name,sha256:artifact.sha256});
/** The name matches the host interface; no legacy Drive proxy is used. */
export class DriveBackupService {
  constructor({persist,onChange=()=>{},apiCall,context,notify,prepareArtifacts,sleep}={}) {Object.assign(this,{persist,onChange,apiCall,context,notify,prepareArtifacts,sleep});this.jobs=[];this.notified=new Set();this.queue=Promise.resolve();this.pending=new Map();}
  current(){return this.context?this.context():getContext();}
  post(message){return this.notify?this.notify(message):postParent(message);}
  checkOwner(context,entry){const now=this.current();if(!sameOwner(context,now)||entry.profileId!==now.student.id||now.student.active===false||now.student.consent?.service===false||now.student.consent?.voice===false)throw uploadError('UPLOAD_OWNER_CHANGED','학생 또는 로그인 권한이 바뀌어 전송을 중지했습니다. 원음은 이 PC에 보관됩니다.');}
  async request(action,payload,context,requestId,entry){this.checkOwner(context,entry);const result=await(this.apiCall||call)(action,payload,context.branchId,{requestId,timeoutMs:120000});this.checkOwner(context,entry);return result;}
  async pause(attempt){await(this.sleep?this.sleep(Math.min(1500,300*(attempt+1))):new Promise(resolve=>setTimeout(resolve,Math.min(1500,300*(attempt+1)))));}
  async repeat(operation){let last;for(let attempt=0;attempt<3;attempt++){try{return await operation();}catch(error){last=error;if(!retryableCodes.has(error?.code)||attempt===2)throw error;await this.pause(attempt);}}throw last;}
  async progress(entry,patch){entry.franchiseUpload={...entry.franchiseUpload,...patch};this.onChange();await this.persist(entry);}
  verifyResult(result,artifacts){
    const ref=result?.artifact;
    if(!result?.id||!ref?.fileId||!ref?.analysisFileId)throw uploadError('RESULT_UNCERTAIN','원음·전체 분석 파일의 서버 저장 완료 응답을 확인하지 못했습니다.');
    if(ref.size!==artifacts.audio.size||ref.sha256!==artifacts.audio.sha256||ref.analysisSize!==artifacts.analysis.size||ref.analysisSha256!==artifacts.analysis.sha256)throw uploadError('ARTIFACT_INTEGRITY','서버에 보관된 원음·분석 파일이 전송한 파일과 일치하지 않습니다. 완료로 표시하지 않았습니다.');
    return result;
  }
  async chunkedUpload(artifacts,context,requestId,entry){
    const manifest={studentId:artifacts.studentId,recordId:artifacts.recordId,metrics:artifacts.metrics,metadata:artifacts.metadata,audio:descriptor(artifacts.audio),analysis:descriptor(artifacts.analysis)};
    let state=await this.repeat(()=>this.request('exam.upload.begin',manifest,context,requestId+'-begin',entry));
    if(state?.complete&&typeof state.complete==='object')return this.verifyResult(state.complete,artifacts);
    if(typeof state?.uploadId!=='string'||!state.uploadId||state.uploadId.length>200||state.chunkBytes!==UPLOAD_CHUNK_BYTES)throw uploadError('UPLOAD_PROTOCOL','서버 분할 전송 설정을 확인하지 못했습니다.');
    const uploadId=state.uploadId,totalBytes=artifacts.audio.size+artifacts.analysis.size;
    const checkedOffset=(value,kind)=>{const offset=value?.[kind]?.offset,size=value?.[kind]?.size;if(!Number.isInteger(offset)||offset<0||offset>artifacts[kind].size||size!==artifacts[kind].size)throw uploadError('UPLOAD_PROTOCOL','서버 전송 위치를 확인하지 못했습니다.');return offset;};
    const offsets={audio:checkedOffset(state,'audio'),analysis:checkedOffset(state,'analysis')};
    await this.progress(entry,{uploadId,transport:'chunked',totalBytes,sentBytes:offsets.audio+offsets.analysis,progress:Math.floor((offsets.audio+offsets.analysis)/totalBytes*100)});
    for(const kind of ['audio','analysis']){
      const artifact=artifacts[kind];let stalled=0;
      while(offsets[kind]<artifact.size){
        this.checkOwner(context,entry);
        const start=offsets[kind],chunk=artifact.blob.slice(start,Math.min(start+UPLOAD_CHUNK_BYTES,artifact.size));
        const base64=await blobBase64(chunk),sha256=await blobSha256(chunk);
        this.checkOwner(context,entry);
        let next;
        try{
          const result=await this.request('exam.upload.chunk',{uploadId,kind,offset:start,base64,sha256},context,`${requestId}-${kind}-${start}`,entry);
          next=result?.nextOffset??result?.offset;
          if(!Number.isInteger(next)||next<0||next>artifact.size)throw uploadError('UPLOAD_PROTOCOL','서버가 확인한 전송 위치가 올바르지 않습니다.');
          if(next<start||next>start+chunk.size)throw uploadError('UPLOAD_OFFSET','다른 전송에서 확인한 위치를 서버에서 다시 확인합니다.');
        }catch(error){
          if(!retryableCodes.has(error?.code))throw error;
          state=await this.repeat(()=>this.request('exam.upload.status',{uploadId},context,`${requestId}-status-${kind}-${start}`,entry));
          if(state?.complete&&typeof state.complete==='object')return this.verifyResult(state.complete,artifacts);
          if(state?.uploadId!==uploadId)throw uploadError('UPLOAD_PROTOCOL','서버의 업로드 번호가 일치하지 않습니다.');
          next=checkedOffset(state,kind);
          offsets[kind==='audio'?'analysis':'audio']=checkedOffset(state,kind==='audio'?'analysis':'audio');
        }
        if(next===start){if(++stalled>2)throw uploadError('RESULT_UNCERTAIN','전송 확인이 지연되고 있습니다. 이 PC의 원음을 유지했으며 다시 시도하면 확인된 위치부터 이어집니다.');await this.pause(stalled);}
        else stalled=0;
        offsets[kind]=next;
        const sentBytes=offsets.audio+offsets.analysis;
        await this.progress(entry,{phase:kind,sentBytes,totalBytes,progress:Math.min(99,Math.floor(sentBytes/totalBytes*100))});
      }
    }
    await this.progress(entry,{phase:'verifying',progress:99});
    const result=await this.repeat(()=>this.request('exam.upload.complete',{uploadId},context,requestId+'-complete',entry));
    return this.verifyResult(result,artifacts);
  }
  get active(){return this.jobs.some(j=>j.status==='uploading');}
  async status(){return {configured:true,reachable:true,manual:false};}
  async enqueue(entry){
    const c=this.current();
    if(entry.profileId!==c.student.id)throw new Error('학생 기록 번호를 확인해 주세요.');
    if(!this.notified.has(entry.id)&&entry.fileAnalysis&&!entry.unsaved){this.notified.add(entry.id);this.post({type:'tv:exam-ready',branchId:c.branchId,studentId:c.student.id,recordId:entry.id,createdAt:entry.createdAt,duration:entry.duration,metricsAvailable:true});}
    this.onChange();
    if(!entry.fileAnalysis||entry.unsaved||entry.franchiseUpload?.state==='complete')return entry;
    if(this.pending.has(entry.id))return this.pending.get(entry.id);
    const task=this.queue.catch(()=>{}).then(()=>this.retry(entry));
    const tracked=task.finally(()=>this.pending.delete(entry.id));
    this.pending.set(entry.id,tracked);this.queue=tracked;
    return tracked;
  }
  async retry(entry){
    const current=this.current(),c={...current,student:{...current.student}};if(entry.profileId!==c.student.id)throw new Error('다른 학생의 기록은 저장할 수 없습니다.');
    if(this.active)throw new Error('진행 중인 서버 저장을 마친 뒤 다시 시도해 주세요.');
    if(entry.franchiseUpload?.state==='complete')return entry;
    const job={id:entry.id,status:'uploading'};this.jobs.push(job);
    entry.franchiseUpload={state:'uploading',phase:'preparing',progress:0,startedAt:new Date().toISOString()};this.onChange();
    let sent=false;
    try {
      this.checkOwner(c,entry);
      const artifacts=await(this.prepareArtifacts||prepareUploadArtifacts)(entry,c);
      this.checkOwner(c,entry);
      await this.persist(entry);
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([c.uid,c.branchId,c.student.id,entry.id])));
      const requestId=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,40);
      sent=true;
      let result;
      if(artifacts.audio.size<=MAX_ARTIFACT_BYTES&&artifacts.analysis.size<=MAX_ARTIFACT_BYTES){
        const payload=await legacyUploadPayload(artifacts);await this.progress(entry,{phase:'uploading',transport:'legacy',totalBytes:artifacts.audio.size+artifacts.analysis.size,sentBytes:0});
        result=this.verifyResult(await this.request('exam.upload',payload,c,requestId,entry),artifacts);
      }else result=await this.chunkedUpload(artifacts,c,requestId,entry);
      this.checkOwner(c,entry);
      entry.franchiseUpload={state:'complete',progress:100,examId:result.id,storage:result.storage,completedAt:new Date().toISOString(),artifact:{fileId:result.artifact.fileId,analysisFileId:result.artifact.analysisFileId,size:result.artifact.size,sha256:result.artifact.sha256,analysisSize:result.artifact.analysisSize,analysisSha256:result.artifact.analysisSha256}};
      await this.persist(entry);job.status='complete';
      this.post({type:'tv:exam-saved',branchId:c.branchId,studentId:c.student.id,recordId:entry.id,examId:result.id});return entry;
    } catch(error) {
      job.status='error';
      if(entry.franchiseUpload?.state!=='complete')entry.franchiseUpload={...entry.franchiseUpload,state:sent&&(!error?.code||retryableCodes.has(error.code))?'uncertain':'error',error:error?.message||'서버 저장 실패',updatedAt:new Date().toISOString()};
      try{await this.persist(entry);}catch{}
      throw error;
    } finally {this.onChange();}
  }
}
