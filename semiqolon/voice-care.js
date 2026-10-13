/* 목소리 날씨 · 으·이·아 연습 — 기기 안에서만 재고 판정한다.
   사용자 화면에는 숫자를 보여 주지 않는다(날씨 아이콘과 한 줄만). 숫자는 기록과 지도사·관리자 확인용.
   의료기기가 아니다: 병명·진단을 말하지 않고, 병원으로 보내지 않는다.
   기획: 목소리날씨_으이아_연습기획_v1 (2026-10-06) */
const VoiceCare=(()=>{
 // ---------- 신호 처리 ----------
 function fft(re,im){const n=re.length;for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){let t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t;}}
  for(let len=2;len<=n;len<<=1){const a=-2*Math.PI/len,wr=Math.cos(a),wi=Math.sin(a),h=len>>1;for(let i=0;i<n;i+=len){let cr=1,ci=0;for(let j=0;j<h;j++){const k=i+j,q=k+h,tr=cr*re[q]-ci*im[q],ti=cr*im[q]+ci*re[q];re[q]=re[k]-tr;im[q]=im[k]-ti;re[k]+=tr;im[k]+=ti;const t=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=t;}}}}
 // 앱과 같은 YIN(실시간 음높이)
 function pitch(input,sampleRate){const step=Math.max(1,Math.floor(sampleRate/8000)),rate=sampleRate/step,n=Math.floor(input.length/step),x=new Float32Array(n);let mean=0,power=0;for(let i=0;i<n;i++){let sum=0;for(let j=0;j<step;j++)sum+=input[i*step+j];x[i]=sum/step;mean+=x[i];}mean/=n;for(let i=0;i<n;i++){x[i]-=mean;power+=x[i]*x[i];}if(Math.sqrt(power/n)<.003)return null;const lo=Math.floor(rate/800),hi=Math.ceil(rate/65),w=Math.min(384,n-hi-2);if(w<160)return null;const d=new Float32Array(hi+2);for(let t=1;t<=hi+1;t++){let sum=0;for(let j=0;j<w;j++){const a=x[j]-x[j+t];sum+=a*a;}d[t]=sum;}let run=0;d[0]=1;for(let t=1;t<=hi+1;t++){run+=d[t];d[t]=run?d[t]*t/run:1;}let best=-1;for(let t=lo;t<=hi;t++){if(d[t]<.15){while(t<hi&&d[t+1]<d[t])t++;best=t;break;}}if(best<0)return null;const a=d[best-1],b=d[best],z=d[best+1],den=a-2*b+z,hz=rate/(best+(den?.5*(a-z)/den:0));return hz>=65&&hz<=800?hz:null;}
 const db=v=>10*Math.log10(v+1e-12);
 function rmsDb(x,from=0,to=x.length){let s=0;for(let i=from;i<to;i++)s+=x[i]*x[i];return db(s/Math.max(1,to-from));}
 function quantile(values,p){const a=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!a.length)return null;const at=(a.length-1)*p,i=Math.floor(at);return a[i]+(a[Math.min(i+1,a.length-1)]-a[i])*(at-i);}
 const median=v=>quantile(v,.5);
 function concat(chunks){let n=0;for(const c of chunks)n+=c.length;const out=new Float32Array(n);let o=0;for(const c of chunks){out.set(c,o);o+=c.length;}return out;}
 // 16kHz 안팎으로 낮추기: 7kHz 저역 통과(63탭 윈도 sinc) 뒤 솎기 — 높은 배음이 접혀 들어와 고르기 값이 흔들리지 않게
 const FIR=new Map();
 function lowpass(sr,cut,taps=63){const key=sr+':'+cut;if(FIR.has(key))return FIR.get(key);const h=new Float32Array(taps),m=(taps-1)/2,fc=cut/sr;let sum=0;for(let i=0;i<taps;i++){const t=i-m,sinc=t===0?2*fc:Math.sin(2*Math.PI*fc*t)/(Math.PI*t),w=.42-.5*Math.cos(2*Math.PI*i/(taps-1))+.08*Math.cos(4*Math.PI*i/(taps-1));h[i]=sinc*w;sum+=h[i];}for(let i=0;i<taps;i++)h[i]/=sum;FIR.set(key,h);return h;}
 function decimate(x,sr){const f=Math.max(1,Math.floor(sr/16000));if(f===1)return {y:x,sr};const h=lowpass(sr,7000),T=h.length,m=(T-1)>>1,n=Math.floor(x.length/f),y=new Float32Array(n);for(let i=0;i<n;i++){const c=i*f;let s=0;for(let k=0;k<T;k++){const j=c+k-m;if(j>=0&&j<x.length)s+=h[k]*x[j];}y[i]=s;}return {y,sr:sr/f};}
 // 주변 소음: 20ms 덩어리의 중앙값(dBFS). 소리 내기 전 0.5초로 잰다
 function noiseDb(x,sr){const h=Math.round(sr*.02),v=[];for(let i=0;i+h<=x.length;i+=h)v.push(rmsDb(x,i,i+h));return median(v);}

 /* 한 구간을 잰다. 결과(숫자)는 사용자에게 보여 주지 않는다.
    voiced 유성 시간(초) · level 소리 크기(dBFS) · hz 음높이 중앙값 · cpps 고르기(dB, 기기 근사) ·
    breaks 음높이 끊김(9반음 이상 튐/유성 1초) · breath 숨 새는 소리(4–8kHz − 2–4kHz, dB) · hf 2–4kHz 세기(dB) */
 function analyze(pcm,sr,opt={}){
  const out={voiced:0,level:null,hz:null,cpps:null,breaks:null,breath:null,hf:null,frames:0};if(!pcm||pcm.length<sr*.3)return out;
  const {y,sr:sr2}=decimate(pcm,sr),N=1024,hop=Math.round(sr2*.01),half=N>>1,win=new Float32Array(N);for(let i=0;i<N;i++)win[i]=.5-.5*Math.cos(2*Math.PI*i/(N-1));
  const floor=Math.max(-62,(Number.isFinite(opt.noise)?opt.noise:-70)+6),pitches=[],levels=[],ceps=[];let prev=null,breaks=0,voicedFrames=0;
  const re=new Float64Array(N),im=new Float64Array(N);
  for(let at=0,k=0;at+N<=y.length;at+=hop,k++){const L=rmsDb(y,at,at+N);if(L<floor){prev=null;continue;}const hz=pitch(y.subarray(at,at+N),sr2);if(!hz){prev=null;continue;}
   voicedFrames++;pitches.push(hz);levels.push(L);if(prev&&Math.abs(12*Math.log2(hz/prev))>=9)breaks++;prev=hz;
   if(k%2)continue;// 고르기는 20ms마다
   for(let i=0;i<N;i++){re[i]=y[at+i]*win[i];im[i]=0;}fft(re,im);
   const spec=new Float64Array(N);for(let i=0;i<=half;i++){const v=db(re[i]*re[i]+im[i]*im[i]);spec[i]=v;if(i&&i<half)spec[N-i]=v;}
   for(let i=0;i<N;i++){re[i]=spec[i];im[i]=0;}fft(re,im);const c=new Float32Array(half);for(let i=0;i<half;i++)c[i]=db(re[i]*re[i]+im[i]*im[i]);ceps.push(c);}
  out.frames=voicedFrames;out.voiced=voicedFrames*hop/sr2;if(!voicedFrames)return out;
  out.level=median(levels);out.hz=median(pitches);out.breaks=out.voiced>0?breaks/out.voiced:null;
  // CPPS: 7프레임(시간)·3칸(켑스트럼) 평균 → 60–600Hz 봉우리와 회귀선 사이의 높이
  if(ceps.length>=7){const qLo=Math.ceil(sr2/600),qHi=Math.min(half-2,Math.floor(sr2/60)),fLo=Math.ceil(sr2/1000),vals=[];
   for(let f=3;f<ceps.length-3;f++){const s=new Float32Array(half);for(let t=f-3;t<=f+3;t++){const c=ceps[t];for(let i=0;i<half;i++)s[i]+=c[i]/7;}
    const sm=new Float32Array(half);for(let i=1;i<half-1;i++)sm[i]=(s[i-1]+s[i]+s[i+1])/3;
    let n=0,sx=0,sy=0,sxx=0,sxy=0;for(let q=fLo;q<=qHi;q++){n++;sx+=q;sy+=sm[q];sxx+=q*q;sxy+=q*sm[q];}const b=(n*sxy-sx*sy)/(n*sxx-sx*sx),a=(sy-b*sx)/n;
    let pk=qLo;for(let q=qLo;q<=qHi;q++)if(sm[q]>sm[pk])pk=q;vals.push(sm[pk]-(a+b*pk));}
   out.cpps=median(vals);}
  // 숨 새는 소리: 원래 표본률에서(8kHz까지 있어야 함)
  if(sr>=16000){const M=2048,w2=new Float32Array(M);for(let i=0;i<M;i++)w2[i]=.5-.5*Math.cos(2*Math.PI*i/(M-1));const r2=new Float64Array(M),i2=new Float64Array(M),hop2=Math.round(sr*.03),br=[],hf=[];
   for(let at=0;at+M<=pcm.length;at+=hop2){const L=rmsDb(pcm,at,at+M);if(L<floor)continue;const hz=pitch(pcm.subarray(at,at+M),sr);if(!hz)continue;for(let i=0;i<M;i++){r2[i]=pcm[at+i]*w2[i];i2[i]=0;}fft(r2,i2);
    const band=(lo,hi)=>{let s=0,n=0;for(let j=Math.ceil(lo*M/sr);j<=Math.floor(hi*M/sr)&&j<=M/2;j++){s+=r2[j]*r2[j]+i2[j]*i2[j];n++;}return db(s/Math.max(1,n));};const mid=band(2000,4000);br.push(band(4000,8000)-mid);hf.push(mid);}
   out.breath=median(br);out.hf=median(hf);}
  return out;}

 // ---------- 기준선과 날씨 ----------
 const LEARN_DAYS=7,FLOOR={cpps:.4,breaks:.05,breath:1},CPPS_DROP=.6;
 function stat(v,floor){const m=median(v);if(m==null)return null;const mad=median(v.filter(Number.isFinite).map(x=>Math.abs(x-m)));return {med:m,spread:Math.max(floor,1.4826*(mad||0))};}
 // days: 이 기기에서 잰 날들(최신 먼저). 처음 7일 + 그 뒤 맑은 날, 최근 28개로 기준선
 function baseline(days){const ok=days.filter(d=>d.m&&!d.noisy);const learn=ok.slice(-LEARN_DAYS),later=ok.slice(0,Math.max(0,ok.length-LEARN_DAYS)).filter(d=>d.w==='sun'),use=[...later,...learn].slice(0,28),pick=k=>use.map(d=>d.m[k]).filter(Number.isFinite);
  return {count:ok.length,ready:ok.length>=LEARN_DAYS,cpps:stat(pick('cpps'),FLOOR.cpps),breaks:stat(pick('breaks'),FLOOR.breaks),breath:stat(pick('breath'),FLOOR.breath),top:stat(use.map(d=>d.top).filter(Number.isFinite),.5)};}
 // 임시 문턱(검증 전): 고르기 0.6dB 이상 하락 또는 지표 1개가 흔들림 폭(2σ) 밖 = 조금 다름, 2개 이상 = 많이 다름
 function judge(m,base){if(!base?.ready)return {w:'learn',flags:{}};const f={};
  if(base.cpps&&Number.isFinite(m.cpps)){const drop=base.cpps.med-m.cpps;f.cpps=drop>=CPPS_DROP||drop>2*base.cpps.spread;}
  if(base.breaks&&Number.isFinite(m.breaks))f.breaks=m.breaks-base.breaks.med>Math.max(2*base.breaks.spread,FLOOR.breaks);
  if(base.breath&&Number.isFinite(m.breath))f.breath=m.breath-base.breath.med>Math.max(2*base.breath.spread,FLOOR.breath);
  const n=Object.values(f).filter(Boolean).length;return {w:n>=2?'cloud':n===1?'partly':'sun',flags:f};}
 // 4주 카드(식약처 검토 전이라 화면에는 쓰지 않음): 최근 28일 측정한 날의 절반 이상이 많이 다름, 첫 흐린 날이 3주 이상 전
 function referral(days,now=Date.now()){const recent=days.filter(d=>now-d.ts<28*864e5&&d.m&&!d.noisy),cloud=recent.filter(d=>d.w==='cloud');return recent.length>=8&&cloud.length*2>=recent.length&&now-Math.min(...cloud.map(d=>d.ts))>=21*864e5;}

 // ---------- 날씨별 처방(으·이·아 6동작) ----------
 // kind: u1 으 고르게 · u2 으 길게 · i1 이 작게 올라가기 · i1hold 이 편한 음 근처 · i2 이 통통 끊기 · a1 으~아/이~아 열기 · a2 아 길게
 function plan(w,flags={},base=null,todayHz=null){const sun=w==='sun'||w==='learn',steps=[];let u1=w==='cloud'?3:2;if(flags.cpps||flags.breaks)u1=Math.min(3,u1+1);
  steps.push({kind:'u1',reps:u1});if(sun)steps.push({kind:'u2'});
  const capTop=w==='partly'&&base?.top?.med?base.top.med*Math.pow(2,-1/12):null;
  if(w==='cloud')steps.push({kind:'i1hold',soft:!!flags.breath});else steps.push({kind:'i1',reps:2,cap:capTop,soft:!!flags.breath});
  if(sun)steps.push({kind:'i2'});
  steps.push({kind:'a1',variants:w==='cloud'?['으','이'].slice(0,1):['으','이']});if(sun)steps.push({kind:'a2'});return steps;}

 return {analyze,noiseDb,concat,baseline,judge,referral,plan,median,quantile,pitch,LEARN_DAYS};
})();
if(typeof module!=='undefined')module.exports=VoiceCare;
