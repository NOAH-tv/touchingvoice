/** Firebase SDK resumable transfer; no public download URLs or persisted tokens. */
const BUCKET='touchingvoice-d1b1b.firebasestorage.app';
export async function uploadDirect({artifacts,context,request,requestId,entry,checkOwner,progress}){
 const manifest={studentId:artifacts.studentId,recordId:artifacts.recordId,metrics:artifacts.metrics,metadata:artifacts.metadata,audio:descriptor(artifacts.audio),analysis:descriptor(artifacts.analysis),chunkBytes:4*1024*1024};
 const access=await request('exam.storage.begin',manifest,requestId+'-begin');
 if(access?.complete&&typeof access.complete==='object')return access.complete;
 if(access?.transport!=='firebase-storage'||access.bucket!==BUCKET||!/^upload_[a-f0-9]{64}$/.test(access.uploadId)||!Number.isFinite(Date.parse(access.expiresAt)))throw new Error('직접 전송 권한을 확인하지 못했습니다.');
 for(const kind of ['audio','analysis']){const expected='staging-recordings/'+encodeURIComponent(context.branchId)+'/'+encodeURIComponent(context.student.id)+'/'+access.uploadId+'/';if(typeof access.paths?.[kind]!=='string'||!access.paths[kind].startsWith(expected+kind+'-'+artifacts[kind].sha256+'.')||access.paths[kind].slice(expected.length).includes('/'))throw new Error('직접 저장 경로가 일치하지 않습니다.');}
 const [{getApp},{getAuth},{getStorage,ref,getMetadata,uploadBytesResumable}]=await Promise.all([
  import('https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js'),import('https://www.gstatic.com/firebasejs/12.18.0/firebase-storage.js')]);
 const app=getApp(),auth=getAuth(app),storage=getStorage(app,'gs://'+BUCKET),sent={audio:0,analysis:0},totalBytes=artifacts.audio.size+artifacts.analysis.size;
 const guard=()=>{checkOwner();if(auth.currentUser?.uid!==context.uid)throw new Error('로그인 계정이 변경되어 전송을 중지했습니다.');};
 guard();await progress({transport:'firebase-storage',uploadId:access.uploadId,phase:'uploading',sentBytes:0,totalBytes,progress:0});
 const tasks=new Set();let lastProgress=0;
 try{await Promise.all(['audio','analysis'].map(async kind=>{
  const artifact=artifacts[kind],target=ref(storage,access.paths[kind]);
  try{const m=await getMetadata(target);guard();if(m.size!==artifact.size||m.contentType!==artifact.mimeType||m.customMetadata?.uid!==context.uid||m.customMetadata?.sha256!==artifact.sha256)throw new Error('기존 전송 파일과 정보가 다릅니다.');sent[kind]=artifact.size;return;}catch(error){if(error.code!=='storage/object-not-found')throw error;}
  guard();const task=uploadBytesResumable(target,artifact.blob,{contentType:artifact.mimeType,customMetadata:{uid:context.uid,sha256:artifact.sha256,firebaseStorageDownloadTokens:''}});tasks.add(task);
  await new Promise((resolve,reject)=>{const timer=setInterval(()=>{try{guard();}catch(error){task.cancel();clearInterval(timer);reject(error);}},500);task.on('state_changed',snap=>{sent[kind]=snap.bytesTransferred;if(Date.now()-lastProgress>500){lastProgress=Date.now();void progress({phase:'uploading',sentBytes:sent.audio+sent.analysis,totalBytes,progress:Math.min(95,Math.floor((sent.audio+sent.analysis)/totalBytes*95))}).catch(()=>{});}},error=>{clearInterval(timer);reject(error);},()=>{clearInterval(timer);tasks.delete(task);sent[kind]=artifact.size;resolve();});});
 }));}catch(error){for(const task of tasks)task.cancel();throw error;}
 guard();await progress({phase:'verifying',sentBytes:totalBytes,totalBytes,progress:96});
 for(let attempt=0;attempt<12;attempt++){
  guard();const result=await request('exam.storage.complete',{uploadId:access.uploadId},requestId+'-register');
  if(result?.complete&&typeof result.complete==='object')return result.complete;
  if(result?.pending!==true||result.uploadId!==access.uploadId)throw new Error('최종 저장 응답을 확인하지 못했습니다.');
  await progress({phase:'verifying',progress:96,verifiedBytes:result.verifiedBytes});
 }
 throw new Error('원본 검증을 계속하려면 저장을 다시 시도해 주세요. 전송 파일은 보관되어 있습니다.');
}
const descriptor=a=>({name:a.name,mimeType:a.mimeType,size:a.size,sha256:a.sha256});
