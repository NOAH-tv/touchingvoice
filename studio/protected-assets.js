import {call} from '../api.js';
import {getContext} from './context.js';

const MAX_BYTES=8*1024*1024, CACHE_BYTES=32*1024*1024, CACHE_TTL_MS=10*60*1000;
const verified=new Map(),pending=new Map();
let cachedBytes=0,generation=0;
/** Private assets live only in this approved Studio's memory. Never persist tokens or bytes. */
export function clearProtectedAssetCache(){generation++;verified.clear();pending.clear();cachedBytes=0;}
function remove(key){const item=verified.get(key);if(item){cachedBytes-=item.buffer.byteLength;verified.delete(key);}}
function remember(key,buffer){
  remove(key);
  while(cachedBytes+buffer.byteLength>CACHE_BYTES&&verified.size)remove(verified.keys().next().value);
  verified.set(key,{buffer,expires:Date.now()+CACHE_TTL_MS});cachedBytes+=buffer.byteLength;
}
async function storageBytes(access,uid){
  const [{getApp},{getAuth},{getStorage,ref,getBytes}]=await Promise.all([
    import('https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/12.18.0/firebase-storage.js')
  ]);
  const app=getApp();
  if(getAuth(app).currentUser?.uid!==uid)throw new Error('로그인 계정이 변경되었습니다.');
  return getBytes(ref(getStorage(app,'gs://'+access.bucket),access.path),MAX_BYTES);
}
async function fetchStorageVerified(context){
  let access=context.assetAccess;
  if(Date.parse(access.expiresAt)<Date.now()+15000)access=await call('assets.access',{studentId:context.practice?'':context.student.id},context.branchId);
  if(access?.transport!=='firebase-storage'||access.assetId!=='model-vocal-01'||access.bucket!=='touchingvoice-d1b1b.firebasestorage.app'||access.path!=='protected/models/Vocal_01.glb'||access.size!==4631340||access.sha256!=='7fe03334bb3586591166e4701d456ca1d4d783e83c87ca7dc239315ae2add6b2'||!Number.isFinite(Date.parse(access.expiresAt)))throw new Error('3D 접근 권한을 확인하지 못했습니다.');
  const bytes=new Uint8Array(await storageBytes(access,context.uid));
  if(bytes.byteLength!==access.size)throw new Error('3D 모델을 모두 받지 못했습니다. 다시 시도해 주세요.');
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  if(hash!==access.sha256)throw new Error('3D 모델의 무결성을 확인하지 못했습니다.');
  return bytes.buffer;
}
async function fetchVerified(assetId,branchId,context){
  if(assetId==='model-vocal-01'&&context.assetAccess?.transport==='firebase-storage')return fetchStorageVerified(context);

  const result=await call('assets.read',{assetId},branchId,{timeoutMs:120000});
  if(result.assetId!==assetId||!Number.isInteger(result.size)||result.size<1||result.size>MAX_BYTES||
     typeof result.base64!=='string'||result.base64.length>Math.ceil(MAX_BYTES/3)*4||
     !/^[a-f0-9]{64}$/.test(result.sha256||''))throw new Error('훈련 자료 응답을 확인하지 못했습니다.');
  const binary=atob(result.base64),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  if(bytes.byteLength!==result.size)throw new Error('훈련 자료를 모두 받지 못했습니다. 다시 시도해 주세요.');
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  if(hash!==result.sha256)throw new Error('훈련 자료의 무결성을 확인하지 못했습니다.');
  return bytes.buffer;
}
/** Authenticated, branch-scoped bytes; duplicate requests share one verified download. */
export async function readProtectedAsset(assetId) {
  if(typeof assetId!=='string'||!/^[a-z0-9-]{1,100}$/.test(assetId))throw new Error('훈련 자료 식별자가 올바르지 않습니다.');
  const context=getContext(),key=JSON.stringify([context.uid,context.branchId,assetId]);
  const hit=verified.get(key);
  if(hit&&hit.expires>Date.now()){
    verified.delete(key);verified.set(key,hit);
    return hit.buffer.slice(0); // A consumer may transfer/detach or decode its own copy.
  }
  remove(key);
  let request=pending.get(key);
  if(!request){
    const started=generation;
    request=fetchVerified(assetId,context.branchId,context).then(buffer=>{
      if(started!==generation)throw new Error('종료된 코칭의 자료 요청이 취소되었습니다.');
      remember(key,buffer);return buffer;
    }).finally(()=>{if(pending.get(key)===request)pending.delete(key);});
    pending.set(key,request);
  }
  return (await request).slice(0);
}
