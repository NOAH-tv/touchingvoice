import { call } from '../../api.js';
import { getContext, postParent } from '../context.js';
import { prepareUpload } from '../upload-data.js';
/** The name matches the host interface; no legacy Drive proxy is used. */
export class DriveBackupService {
  constructor({persist,onChange=()=>{}}) {this.persist=persist;this.onChange=onChange;this.jobs=[];this.notified=new Set();this.queue=Promise.resolve();this.pending=new Map();}
  get active(){return this.jobs.some(j=>j.status==='uploading');}
  async status(){return {configured:true,reachable:true,manual:false};}
  async enqueue(entry){
    const c=getContext();
    if(entry.profileId!==c.student.id)throw new Error('학생 기록 번호를 확인해 주세요.');
    if(!this.notified.has(entry.id)&&entry.fileAnalysis&&!entry.unsaved){this.notified.add(entry.id);postParent({type:'tv:exam-ready',branchId:c.branchId,studentId:c.student.id,recordId:entry.id,createdAt:entry.createdAt,duration:entry.duration,metricsAvailable:true});}
    this.onChange();
    if(!entry.fileAnalysis||entry.unsaved||entry.franchiseUpload?.state==='complete')return entry;
    if(this.pending.has(entry.id))return this.pending.get(entry.id);
    const task=this.queue.catch(()=>{}).then(()=>this.retry(entry));
    const tracked=task.finally(()=>this.pending.delete(entry.id));
    this.pending.set(entry.id,tracked);this.queue=tracked;
    return tracked;
  }
  async retry(entry){
    const c=getContext();if(entry.profileId!==c.student.id)throw new Error('다른 학생의 기록은 저장할 수 없습니다.');
    if(this.active)throw new Error('진행 중인 서버 저장을 마친 뒤 다시 시도해 주세요.');
    if(entry.franchiseUpload?.state==='complete')return entry;
    const job={id:entry.id,status:'uploading'};this.jobs.push(job);
    entry.franchiseUpload={state:'uploading',startedAt:new Date().toISOString()};this.onChange();
    let sent=false;
    try {
      const payload=await prepareUpload(entry,c);
      await this.persist(entry);sent=true;
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([c.uid,c.branchId,c.student.id,entry.id])));
      const requestId=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,40);
      const result=await call('exam.upload',payload,c.branchId,{requestId,timeoutMs:120000});
      if(!result?.id||!result?.artifact?.fileId||!result?.artifact?.analysisFileId)throw new Error('원음·전체 분석 파일의 서버 저장 완료 응답을 확인하지 못했습니다.');
      entry.franchiseUpload={state:'complete',examId:result.id,storage:result.storage,completedAt:new Date().toISOString(),artifact:{fileId:result.artifact.fileId,analysisFileId:result.artifact.analysisFileId,size:result.artifact.size,sha256:result.artifact.sha256,analysisSize:result.artifact.analysisSize,analysisSha256:result.artifact.analysisSha256}};
      await this.persist(entry);job.status='complete';
      postParent({type:'tv:exam-saved',branchId:c.branchId,studentId:c.student.id,recordId:entry.id,examId:result.id});return entry;
    } catch(error) {
      job.status='error';
      if(entry.franchiseUpload?.state!=='complete')entry.franchiseUpload={state:sent&&(!error?.code||error.code==='RESULT_UNCERTAIN')?'uncertain':'error',error:error?.message||'서버 저장 실패',updatedAt:new Date().toISOString()};
      try{await this.persist(entry);}catch{}
      throw error;
    } finally {this.onChange();}
  }
}
