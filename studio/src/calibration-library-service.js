import { buildCalibrationObservation, buildPersonalModel, PERSONAL_LAYERS } from './personal-calibration.js';

const clone=value=>structuredClone(value);
export const MAX_REFERENCE_BYTES=150*1024*1024;
export async function sourceDigest(blob){
  const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
}
/** File datasets contain gain-adjusted dBFS; live calibration expects the original input. */
export async function observationFromRecord(entry,layerKey,confirmed=true){
  let features,sourceHash=entry.fileAnalysis?.source?.sha256;
  if(entry.guidedCalibration?.samples){
    features=entry.guidedCalibration.samples;
    sourceHash ||= await sourceDigest(entry.blob);
  }else{
    const dataset=entry.fileAnalysis?.dataset;
    if(!dataset||!entry.datasetBlob)throw new Error('전체 파일 분석이 완료되지 않았습니다.');
    const columns=dataset.columns.map(value=>typeof value==='string'?value:value.key);
    const values=new Float32Array(await entry.datasetBlob.arrayBuffer());
    if(values.length!==dataset.rowCount*columns.length)throw new Error('분석 프레임의 크기가 일치하지 않습니다.');
    if(!['time','valid','f0','level','clarity'].every(key=>columns.includes(key)))throw new Error('음정·음량 프레임이 필요합니다.');
    features=Array.from({length:dataset.rowCount},(_,row)=>{
      const f=Object.fromEntries(columns.map((key,col)=>[key,values[row*columns.length+col]]));
      f.valid=f.valid===1;f.level-=entry.profile.global.inputGainDb;
      return {time:f.time,features:f};
    });
    sourceHash ||= await sourceDigest(entry.blob);
  }
  const observation=buildCalibrationObservation({id:entry.id,layerKey,createdAt:entry.createdAt,sourceHash,
    sourceKind:entry.sourceKind||'calibration-reference',features,profile:entry.profile,confirmed});
  const clipping=entry.fileAnalysis?.signal?.clippedFraction||0;
  if(clipping>0.001){observation.usable=false;observation.quality.warnings.push('클리핑이 0.1%를 넘어 보정에서 제외했습니다. 입력 크기를 낮춰 다시 녹음하세요.');}
  return {...observation,fileName:entry.sourceFileName||entry.name,excluded:false,
    pipeline:entry.guidedCalibration?'live-fft4096-smoothing0.25':'offline-fft4096-smoothing0',
    recordId:entry.id,analysisVersion:entry.fileAnalysis?.analysisVersion||null};
}

/** Records stay immutable; only their inclusion and the active model change. */
export class CalibrationLibraryService {
  constructor({getSnapshot,saveRecord,analyze,cancelAnalysis,persistLibrary,backup=()=>{},onChange=()=>{}}){
    Object.assign(this,{getSnapshot,saveRecord,analyze,cancelAnalysis,persistLibrary,backup,onChange});
    this.busy=false;this.epoch=0;this.status='';this.currentId=null;
  }
  changed(message){if(message!==undefined)this.status=message;this.onChange();}
  cancel(){this.epoch++;if(this.currentId)this.cancelAnalysis?.(this.currentId);this.changed('중지 요청 · 저장된 원음은 유지하며 미완료 분석은 반영하지 않습니다.');}
  check(snapshot,epoch){const current=this.getSnapshot();if(epoch!==this.epoch||current.profileId!==snapshot.profileId||JSON.stringify(current.profile)!==JSON.stringify(snapshot.profile))throw new Error('대상자 또는 설정이 바뀌었거나 등록을 중지해 적용하지 않았습니다.');}
  async importFiles({layerKey,files,confirmed}){
    if(this.busy)throw new Error('현재 파일 분석을 마친 뒤 추가해 주세요.');
    if(!PERSONAL_LAYERS.includes(layerKey)||!confirmed)throw new Error('영역과 지도사의 발음 확인이 필요합니다.');
    if(!Array.isArray(files)||!files.length)return;
    if(files.some(file=>!(file instanceof Blob)||!file.size||file.size>MAX_REFERENCE_BYTES))throw new Error('파일별 150 MB 이하의 음성을 선택해 주세요.');
    const snapshot=clone(this.getSnapshot()),epoch=++this.epoch;
    this.busy=true;let accepted=0,skipped=0;
    try{
      for(const [index,file] of files.entries()){
        this.check(snapshot,epoch);this.changed(`${index+1}/${files.length} · ${file.name||'기준 음성'} 확인 중`);
        const sourceHash=await sourceDigest(file);this.check(snapshot,epoch);
        const observations=this.getSnapshot().observations||[];
        if(observations.length>=512)throw new Error('기준 기록 512개가 보관되어 있습니다. 원본 백업 후 관리가 필요합니다. 기존 기록은 삭제하지 않았습니다.');
        const duplicate=observations.find(item=>item.sourceHash===sourceHash);
        if(duplicate){skipped++;this.changed(duplicate.layerKey===layerKey?'같은 파일은 중복 반영하지 않습니다.':'다른 영역에 등록된 같은 파일입니다. 구분된 음성을 사용하세요.');continue;}
        const entry={id:crypto.randomUUID(),profileId:snapshot.profileId,name:snapshot.name||snapshot.profile.name,
          profile:clone(snapshot.profile),refs:clone(snapshot.refs||{}),createdAt:new Date().toISOString(),blob:file,
          sourceFileName:file.name||'기준 음성',mimeType:file.type,sourceKind:'calibration-reference',analysisStatus:'queued',
          annotation:{task:`전체 음역 기준 · ${layerKey}`,conditions:'지도사 발음 확인 · 개인 반응 보정'},
          referenceCalibration:{layerKey,confirmed:true,sourceHash,version:1}};
        this.currentId=entry.id;await this.saveRecord(entry);this.check(snapshot,epoch);
        this.changed(`${index+1}/${files.length} · ${entry.sourceFileName} 전체 파형 분석 중`);
        const result=await this.analyze(entry);this.check(snapshot,epoch);
        if(!result)throw new Error(entry.analysisError||'파일 분석을 완료하지 못했습니다. 원음은 기록에 보관했습니다.');
        const observation=await observationFromRecord(result,layerKey,true);this.check(snapshot,epoch);
        const next=[...(this.getSnapshot().observations||[]),observation];
        await this.persistLibrary({snapshot,observations:next,model:null,apply:false});
        if(observation.usable)accepted++;else skipped++;
        // Cloud status is separately recorded by the normal backup pipeline; local success is not cloud success.
        void Promise.resolve().then(()=>this.backup(result)).catch(()=>{});
      }
      this.changed(`등록 완료 · 사용 가능 ${accepted}개 · 중복·품질 제외 ${skipped}개. 아래에서 누적 기준을 적용하세요.`);
    }finally{this.currentId=null;this.busy=false;this.onChange();}
  }
  async apply({mode='adaptive',suppressCommon=false}={}){
    if(this.busy)throw new Error('분석을 마친 뒤 기준을 적용해 주세요.');
    const snapshot=clone(this.getSnapshot());
    const model=buildPersonalModel(snapshot.observations||[],{profile:snapshot.profile,mode,suppressCommon});
    if(mode!=='off'&&!Object.values(model.layers).some(layer=>layer.bins.length))throw new Error('현재 입력 설정에 맞는 유효 기록이 없습니다. 입력 조건을 확인해 다시 측정하세요.');
    await this.persistLibrary({snapshot,observations:snapshot.observations||[],model,apply:true});
    this.changed(mode==='off'?'누적 보정을 껐습니다. 원음과 기준 기록은 유지됩니다.':'누적 기준을 이 PC의 현재 학생에게 적용했습니다.');
  }
  async toggle({id}){
    if(this.busy)throw new Error('분석을 마친 뒤 변경해 주세요.');
    const snapshot=clone(this.getSnapshot()),observations=clone(snapshot.observations||[]),item=observations.find(value=>value.id===id);
    if(!item)throw new Error('기준 기록을 찾지 못했습니다.');
    item.excluded=!item.excluded;
    const model=snapshot.model?buildPersonalModel(observations,{profile:snapshot.profile,mode:snapshot.mode,suppressCommon:snapshot.suppressCommon}):null;
    await this.persistLibrary({snapshot,observations,model,apply:!!model});this.changed(item.excluded?'보정에서 제외했습니다. 원음은 유지됩니다.':'이 기록을 다시 포함했습니다.');
  }
}
