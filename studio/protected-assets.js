import {call} from '../api.js';
import {getContext} from './context.js';

const MAX_BYTES=8*1024*1024;
/** Authenticated, branch-scoped bytes; no public Drive URL or client-supplied Drive ID. */
export async function readProtectedAsset(assetId) {
  if(typeof assetId!=='string'||!/^[a-z0-9-]{1,100}$/.test(assetId))throw new Error('훈련 자료 식별자가 올바르지 않습니다.');
  const context=getContext();
  const result=await call('assets.read',{assetId},context.branchId,{timeoutMs:120000});
  if(result.assetId!==assetId||!Number.isInteger(result.size)||result.size<1||result.size>MAX_BYTES||
     typeof result.base64!=='string'||result.base64.length>Math.ceil(MAX_BYTES/3)*4||
     !/^[a-f0-9]{64}$/.test(result.sha256||''))throw new Error('훈련 자료 응답을 확인하지 못했습니다.');
  const binary=atob(result.base64),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
  if(bytes.byteLength!==result.size)throw new Error('훈련 자료를 모두 받지 못했습니다. 다시 시도해 주세요.');
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  if(hash!==result.sha256)throw new Error('훈련 자료의 무결성을 확인하지 못했습니다.');
  return bytes.buffer;
}
