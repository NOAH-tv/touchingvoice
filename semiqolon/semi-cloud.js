/* SEMI 클라우드: 구글·애플 로그인 + 기록 백업.
   터칭보이스 Firebase(touchingvoice-d1b1b)의 semi/{uid} 칸만 쓴다(본인만 읽고 쓰기 — 보안 규칙에서 막음).
   기록 내용은 Firestore semi/{uid}/records/{id}(JSON 문자열), 녹음은 Storage semi/{uid}/audio/{id}.wav,
   설정·날씨·연습 기록은 semi/{uid}/state/main. 공개 웹 설정값만 들어 있다(비밀 키 아님). */
const SemiCloud=(()=>{
 const FB={apiKey:'AIzaSyALL2p6zE5_AzS6V025MzPElXqjUUhhqp8',authDomain:'touchingvoice-d1b1b.firebaseapp.com',projectId:'touchingvoice-d1b1b',storageBucket:'touchingvoice-d1b1b.firebasestorage.app',appId:'1:548781546332:web:b5b60389e164858e627f99'};
 const B='https://www.gstatic.com/firebasejs/12.18.0/';
 let A,F,S,auth,db,st,user=null,ready=null;const listeners=new Set();
 function load(){return ready||=(async()=>{
  const [app,a,f,s]=await Promise.all(['firebase-app','firebase-auth','firebase-firestore','firebase-storage'].map(n=>import(B+n+'.js')));A=a;F=f;S=s;
  const inst=app.getApps().find(x=>x.name==='semi')||app.initializeApp(FB,'semi');
  auth=a.getAuth(inst);await a.setPersistence(auth,a.browserLocalPersistence);db=f.getFirestore(inst);st=s.getStorage(inst);
  try{await a.getRedirectResult(auth);}catch{}
  a.onAuthStateChanged(auth,u=>{user=u;listeners.forEach(fn=>{try{fn(info());}catch{}});});
  await auth.authStateReady();user=auth.currentUser;})();}
 function info(){if(!user)return null;const p=user.providerData?.[0]?.providerId||'';return {uid:user.uid,name:user.displayName||user.email||'나',email:user.email||'',provider:p.includes('apple')?'apple':'google'};}
 const uid=()=>{if(!user)throw Object.assign(Error('login'),{code:'login'});return user.uid;};
 async function init(fn){if(fn)listeners.add(fn);await load();return info();}
 async function signIn(kind){await load();const p=kind==='apple'?new A.OAuthProvider('apple.com'):new A.GoogleAuthProvider();
  if(kind==='apple'){p.addScope('email');p.addScope('name');p.setCustomParameters({locale:'ko_KR'});}else p.setCustomParameters({prompt:'select_account'});
  try{await A.signInWithPopup(auth,p);}catch(e){if(e?.code==='auth/popup-blocked'){await A.signInWithRedirect(auth,p);return null;}throw e;}return info();}
 async function signOut(){await load();await A.signOut(auth);}
 // 기록: 내용은 JSON 문자열 한 칸(Firestore의 겹친 배열 제한을 피함), 녹음은 따로
 async function pushRecord(r,withAudio){await load();const u=uid(),{audio,unsaved,...meta}=r;let extra={};
  if(withAudio&&audio){const path=`semi/${u}/audio/${r.id}.wav`;await S.uploadBytes(S.ref(st,path),audio,{contentType:audio.type||'audio/wav'});extra={audioPath:path,audioSize:audio.size};}
  const json=JSON.stringify(meta);if(json.length>900000)throw Error('record too big');
  await F.setDoc(F.doc(db,'semi',u,'records',r.id),{ts:r.ts||Date.now(),kind:r.kind||'',json,...extra,updatedAt:F.serverTimestamp()},{merge:true});}
 async function removeRecord(id){await load();const u=uid();await F.deleteDoc(F.doc(db,'semi',u,'records',id)).catch(()=>{});await S.deleteObject(S.ref(st,`semi/${u}/audio/${id}.wav`)).catch(()=>{});}
 async function listRecords(){await load();const snap=await F.getDocs(F.collection(db,'semi',uid(),'records'));return snap.docs.map(d=>{const x=d.data();let meta={};try{meta=JSON.parse(x.json);}catch{}return {...meta,id:d.id,cloudAudio:x.audioPath||null};});}
 async function fetchAudio(path){await load();return S.getBlob(S.ref(st,path));}
 async function pushState(obj){await load();await F.setDoc(F.doc(db,'semi',uid(),'state','main'),{json:JSON.stringify(obj),at:Date.now()});}
 async function pullState(){await load();const d=await F.getDoc(F.doc(db,'semi',uid(),'state','main'));if(!d.exists())return null;const x=d.data();try{return {at:x.at,data:JSON.parse(x.json)};}catch{return null;}}
 return {init,signIn,signOut,pushRecord,removeRecord,listRecords,fetchAudio,pushState,pullState,info};
})();
