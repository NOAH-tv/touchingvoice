import {config} from './config.js';

let auth, sdk, setup, previewUser=null;
const listeners = new Set();
const deliveries = new WeakMap();
const error = message => Object.assign(new Error(message), {code:'AUTH_CONFIGURATION'});
function deliver(fn, user) {
  const key = JSON.stringify(user ? [user.uid, user.email, user.emailVerified, user.role] : null);
  const previous = deliveries.get(fn);
  if (previous?.key === key) return previous.promise;
  // Store before invoking the subscriber: Firebase may deliver its initial state
  // while initAuth is also delivering the already-ready current user.
  const promise = Promise.resolve().then(() => fn(user));
  deliveries.set(fn, {key, promise});
  return promise;
}
const notify = user => { for (const fn of listeners) deliver(fn, user).catch(() => {}); };

async function initialize() {
  if (config.preview) {
    const response = await fetch('/__preview__/session',{cache:'no-store'});
    if (response.ok) previewUser = (await response.json()).user;
    return;
  }
  if (!config.firebase.apiKey || !config.firebase.projectId || !config.apiUrl) {
    throw error('직원 로그인 연결을 준비하고 있습니다. 본사 관리자에게 문의해 주세요.');
  }
  const [appSDK, authSDK] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js'),
  ]);
  sdk = authSDK;
  const app = appSDK.initializeApp(config.firebase);
  auth = sdk.getAuth(app);
  await sdk.setPersistence(auth, sdk.browserSessionPersistence);
  await auth.authStateReady();
  sdk.onAuthStateChanged(auth, notify);
}

export async function initAuth(onChange) {
  listeners.add(onChange);
  setup ||= initialize();
  try {
    await setup;
    await deliver(onChange, config.preview ? previewUser : auth.currentUser);
  } catch (err) {
    await deliver(onChange, null);
    throw err;
  }
  return () => { listeners.delete(onChange); deliveries.delete(onChange); };
}

export async function signIn(provider) {
  if (!['google','apple'].includes(provider)) throw error('지원하지 않는 로그인 방식입니다.');
  setup ||= initialize();
  await setup;
  if (config.preview) {
    const response=await fetch('/__preview__/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    if (!response.ok) throw error('로컬 미리보기 서버가 필요합니다.');
    previewUser=(await response.json()).user;
    notify(previewUser);
    return previewUser;
  }
  if (!config.providers[provider]) throw error('이 로그인 방식은 아직 연결되지 않았습니다.');
  const credentialProvider=provider==='google' ? new sdk.GoogleAuthProvider() : new sdk.OAuthProvider('apple.com');
  if (provider==='google') credentialProvider.setCustomParameters({prompt:'select_account'});
  else { credentialProvider.addScope('email'); credentialProvider.addScope('name'); }
  const result=await sdk.signInWithPopup(auth,credentialProvider);
  return result.user;
}

export async function signOut() {
  if (config.preview) {
    await fetch('/__preview__/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    previewUser=null; notify(null);
  } else if (auth) await sdk.signOut(auth);
  window.dispatchEvent(new CustomEvent('tv:logout'));
}

export async function setPreviewRole(role) {
  if(!config.preview||!['owner','manager','instructor','applicant'].includes(role))throw error('미리보기에서만 역할을 바꿀 수 있습니다.');
  const response=await fetch('/__preview__/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role})});
  if(!response.ok)throw error('미리보기 역할을 변경하지 못했습니다.');
  window.dispatchEvent(new CustomEvent('tv:logout'));
  previewUser=(await response.json()).user;
  notify(previewUser);
}

export async function getIdToken() {
  setup ||= initialize(); await setup;
  if (config.preview) {
    if (!previewUser) throw Object.assign(new Error('로그인이 필요합니다.'),{code:'UNAUTHENTICATED'});
    return 'LOCAL_PREVIEW_ONLY';
  }
  if (!auth?.currentUser) throw Object.assign(new Error('로그인이 필요합니다.'),{code:'UNAUTHENTICATED'});
  return auth.currentUser.getIdToken();
}
