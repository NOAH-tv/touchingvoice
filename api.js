import {config} from './config.js';
import {getIdToken} from './auth.js';
export {config};
const reads=new Set(['session','dashboard','hq.dashboard','exam.list','exam.read','exam.authorize','exam.audio','assets.read','branch.application.read','notification.plan']);

export async function call(action,payload={},branchId='',options={}) {
  const anonymous=action==='qr.checkin';
  const endpoint=config.preview ? '/__preview__/api' : config.apiUrl;
  if (!endpoint) throw Object.assign(new Error('서버 연결을 준비하고 있습니다.'),{code:'NOT_CONFIGURED'});
  if (!config.preview) {
    const url=new URL(endpoint);
    if (url.protocol!=='https:' || url.hostname!=='script.google.com' || !/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname)) {
      throw new Error('서버 주소 설정을 확인해 주세요.');
    }
  }
  const requestId=options.requestId || crypto.randomUUID();
  const request={action,payload,branchId,requestId,idToken:anonymous?'':await getIdToken()};
  const control=new AbortController();
  const timeout=Math.min(120000,Math.max(5000,options.timeoutMs||(action==='exam.upload'?120000:45000)));
  const timer=setTimeout(()=>control.abort(),timeout);
  try {
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(request),signal:control.signal,cache:'no-store',credentials:config.preview?'same-origin':'omit',redirect:'follow'});
    // Permission denials can use HTTP 4xx and still contain a useful API error.
    let envelope;
    try { envelope=await response.json(); }
    catch { throw Object.assign(new Error('서버 응답을 확인하지 못했습니다.'),{code:'HTTP_ERROR'}); }
    if (!envelope.ok) throw Object.assign(new Error(envelope.error?.message || '요청을 처리하지 못했습니다.'),{code:envelope.error?.code || 'API_ERROR',requestId});
    if (!response.ok) throw Object.assign(new Error('서버 응답을 확인하지 못했습니다.'),{code:'HTTP_ERROR'});
    return envelope.data;
  } catch(err) {
    if (err.name==='AbortError' || err instanceof TypeError || err.code==='HTTP_ERROR') {
      const message=reads.has(action) ? '서버와 연결하지 못했습니다. 잠시 후 다시 조회해 주세요.' : '저장 결과를 확인하지 못했습니다. 목록을 새로고침해 반영 여부를 확인해 주세요.';
      throw Object.assign(new Error(message),{code:reads.has(action)?'CONNECTION_FAILED':'RESULT_UNCERTAIN',requestId});
    }
    throw err;
  } finally { clearTimeout(timer); }
}
