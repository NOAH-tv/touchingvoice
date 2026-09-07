import { storageName, getContext } from '../context.js';
const DB_NAME = storageName();
let dbPromise;
function openDB() {
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('이 환경에서는 기기 저장을 사용할 수 없습니다.')); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      for (const name of ['profiles', 'sessions', 'references'])
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('다른 창의 스튜디오를 닫은 뒤 다시 시도해 주세요.'));
  });
  return dbPromise;
}
async function transaction(store, mode, operation) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = operation(tx.objectStore(store));
    let result;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('저장을 완료하지 못했습니다.'));
  });
}
export const store = {
  all: name => transaction(name, 'readonly', s => s.getAll()),
  get: (name, id) => transaction(name, 'readonly', s => s.get(id)),
  put: (name, item) => {
    const studentId=getContext().student.id;
    if(name==='profiles' && item.id!==studentId || name==='sessions' && item.profileId!==studentId) return Promise.reject(new Error('선택 학생의 기록만 저장할 수 있습니다.'));
    return transaction(name, 'readwrite', s => s.put(item));
  },
  delete: (name, id) => transaction(name, 'readwrite', s => s.delete(id)),
  async patch(name, id, patch, {profileId} = {}) {
    const db = await openDB();
    return new Promise((resolve,reject) => {
      const tx=db.transaction(name,'readwrite'),table=tx.objectStore(name),request=table.get(id);let merged,error;
      request.onsuccess=()=>{
        const current=request.result;
        if(!current || profileId!==undefined && current.profileId!==profileId){error=new Error('저장할 회원 기록을 확인하지 못했습니다.');tx.abort();return;}
        merged={...current,...patch,id:current.id};table.put(merged);
      };
      tx.oncomplete=()=>resolve(merged);tx.onerror=()=>reject(tx.error||error);tx.onabort=()=>reject(error||tx.error||new Error('기록을 갱신하지 못했습니다.'));
    });
  },
};
export const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
export async function downloadBlob(blob, name) {
  if (window.Capacitor?.isNativePlatform?.()) {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return window.Capacitor.Plugins.StudioFiles.save({ name, mimeType: blob.type || 'application/octet-stream', base64 });
  }
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
