/** Extended descriptors from the supplied touchingvoice_analyzer batch workflow.
 * Spectral peaks and voice-quality proxies remain explicit estimates, not clinical measures.
 */
const fields=[];
const add=(key,label,unit,method,quality='derived')=>fields.push({key,label,unit,method,quality});
const ranges=[[250,900],[800,3000],[2500,4200],[3800,5200],[4800,6200],[5800,7200],[6800,8500]];
for(let i=0;i<7;i++)add('F'+(i+1),'F'+(i+1)+' 추정 피크','Hz',`원본 analyzer의 ${ranges[i].join('–')} Hz 고정 대역 · Gaussian 6-bin 평활 피크. LPC 포먼트 아님.`,'estimate');
export const ANALYZER_BANDS=[['hz100',60,200,'100 Hz'],['hz300',200,500,'300 Hz'],['hz600',500,900,'600 Hz'],['hz1200',900,1800,'1.2 kHz'],['hz2500',1800,3500,'2.5 kHz'],['hz4000',3500,5000,'4 kHz'],['hz5500',5000,6200,'5.5 kHz'],['hz7000',6200,7500,'7 kHz'],['hz8000',7500,8500,'8 kHz']];
for(const [key,lo,hi,label] of ANALYZER_BANDS){add(key,label+' 에너지','%',`${lo}≤f<${hi} Hz 전력 합 / 60–8500 Hz 전력 합. 원본의 최대 대역 대비 정규화와 구분.`);add(key+'_relative',label+' 상대 강도','%',`원본 호환: ${lo}–${hi} Hz 평균 진폭 / 프레임에서 가장 큰 대역 평균 진폭.`);}
add('RMS','프레임 RMS','FS','DC 제거 PCM RMS');add('peak','피크 진폭','FS','프레임 PCM 절댓값 최대');add('crestDb','크레스트 팩터','dB','20 log10(peak / RMS)');add('zcr','영교차율','1/s','DC 제거 신호의 부호 변경 수 / 프레임 초');
add('centroidHz','스펙트럼 중심','Hz','20 Hz–Nyquist 전력 가중 평균 주파수');add('bandwidthHz','스펙트럼 폭','Hz','전력 가중 주파수 표준편차');add('rolloff85Hz','85% 롤오프','Hz','누적 전력이 85%인 주파수');add('rolloff95Hz','95% 롤오프','Hz','누적 전력이 95%인 주파수');add('flatness','스펙트럼 평탄도','ratio','전력 기하평균 / 산술평균, 분석 바닥 -120 dB');add('entropy','스펙트럼 엔트로피','0–1','전력 분포의 정규화 Shannon 엔트로피');
add('subBass','150 Hz 이하 에너지','%','20–150 Hz 전력 / 20 Hz–Nyquist 전력');add('singerCluster','2.8–3.4 kHz 에너지','%','2800–3400 Hz 전력 / 20 Hz–Nyquist 전력');
add('HNR','HNR 추정','dB','검출 F0 주기 주변 정규화 자기상관 ρ → 10log10(ρ/(1−ρ)). Praat와 동등성 미검증, 수치 상한 60dB.','estimate');
add('HNR_legacy','원본 HNR 대역비','dB','원본 대역 평균 진폭 80–3000 / 7000–9000 Hz 비 +8 dB. 원본의 0–35 강제 제한 제거. 조화/잡음 분해 아님.','estimate');
add('JIT','Jitter 추정','%','F0 주기 ±25%인 보간 상향 영교차 간격의 연속 차이 / 평균. 지속 모음 참고값.','estimate');
add('SHI','Shimmer 추정','%','위 주기에 대응하는 peak-to-peak 진폭의 연속 차이 / 평균. 지속 모음 참고값.','estimate');
add('envelopeVariation','20ms 진폭 변화','%','원본 Shimmer 방식: 20ms 블록 피크의 연속 변화율. 주기 기반 Shimmer와 구분.','estimate');
add('CPP','CPP 추정','dB','대칭 log magnitude의 real cepstrum, 55–1200 Hz quefrency 피크와 회귀 기저 차이 ×20/ln10. CPPS/Praat 동등성 미검증.','estimate');
add('VTL','성도 길이 모델값','cm','F3–F5 추정 피크에 균일 폐관 1/4파장 모델(c=340m/s) 적용. 실제 해부학 길이 아님.','estimate');
export const ANALYZER_FIELDS=Object.freeze(fields.map(Object.freeze));
const finite=n=>Number.isFinite(n)?n:null;
function fft(re,im){const n=re.length;for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}for(let len=2;len<=n;len*=2){const angle=-2*Math.PI/len,wr0=Math.cos(angle),wi0=Math.sin(angle);for(let start=0;start<n;start+=len){let wr=1,wi=0;for(let j=0;j<len/2;j++){const a=start+j,b=a+len/2,tr=wr*re[b]-wi*im[b],ti=wr*im[b]+wi*re[b];re[b]=re[a]-tr;im[b]=im[a]-ti;re[a]+=tr;im[a]+=ti;const next=wr*wr0-wi*wi0;wi=wr*wi0+wi*wr0;wr=next;}}}}
function relativeChange(values){if(values.length<3)return null;let total=0,diff=0;for(let i=0;i<values.length;i++){total+=values[i];if(i)diff+=Math.abs(values[i]-values[i-1]);}return total>0?100*diff/(values.length-1)/(total/values.length):null;}
export function extractAnalyzerFeatures({waveform,spectrum,sampleRate,features={}}){
  const out=Object.fromEntries(ANALYZER_FIELDS.map(f=>[f.key,null]));if(!waveform?.length||!spectrum?.length||!Number.isFinite(sampleRate)||sampleRate<8000)return out;
  let mean=0,peak=0,squares=0;for(const x of waveform){if(!Number.isFinite(x))return out;mean+=x;peak=Math.max(peak,Math.abs(x));}mean/=waveform.length;
  let crossings=0;for(let i=0;i<waveform.length;i++){const x=waveform[i]-mean;squares+=x*x;if(i&&(waveform[i-1]-mean>=0)!==(x>=0))crossings++;}const rms=Math.sqrt(squares/waveform.length);out.RMS=rms;out.peak=peak;out.zcr=crossings/(waveform.length/sampleRate);if(rms<1e-7)return out;out.crestDb=peak>0?20*Math.log10(peak/rms):null;
  const n=spectrum.length*2,binHz=sampleRate/n,mag=new Float64Array(spectrum.length),power=new Float64Array(spectrum.length);let maxMag=0;
  for(let i=0;i<mag.length;i++){const db=Number.isFinite(spectrum[i])?spectrum[i]:-120;mag[i]=Math.pow(10,Math.max(-120,db)/20);power[i]=mag[i]*mag[i];maxMag=Math.max(maxMag,mag[i]);}
  const aHz=hz=>Math.max(1,Math.ceil(hz/binHz)),bHz=hz=>Math.min(power.length,Math.ceil(hz/binHz));
  const sumBand=(lo,hi,arr=power)=>{if(hi>sampleRate/2||lo>=sampleRate/2)return null;let value=0;for(let i=aHz(lo);i<bHz(hi);i++)value+=arr[i];return value;};
  const meanBand=(lo,hi)=>{const sum=sumBand(lo,hi,mag);return sum===null?null:sum/Math.max(1,bHz(hi)-aHz(lo));};
  let total=0,centroid=0,logSum=0,count=0;for(let i=aHz(20);i<power.length;i++){total+=power[i];centroid+=i*binHz*power[i];logSum+=Math.log(Math.max(power[i],1e-12));count++;}if(!total||!count)return out;centroid/=total;let variance=0,entropy=0,cumulative=0;for(let i=aHz(20);i<power.length;i++){const p=power[i]/total;variance+=(i*binHz-centroid)**2*p;if(p>0)entropy-=p*Math.log(p);cumulative+=p;if(out.rolloff85Hz===null&&cumulative>=.85)out.rolloff85Hz=i*binHz;if(out.rolloff95Hz===null&&cumulative>=.95)out.rolloff95Hz=i*binHz;}
  out.centroidHz=centroid;out.bandwidthHz=Math.sqrt(variance);out.flatness=Math.exp(logSum/count)/(total/count);out.entropy=count>1?entropy/Math.log(count):0;
  const reference=sumBand(60,8500),bandMeans=ANALYZER_BANDS.map(([,lo,hi])=>meanBand(lo,hi)),maxMean=Math.max(...bandMeans.filter(x=>x!==null));
  ANALYZER_BANDS.forEach(([key,lo,hi],i)=>{const band=sumBand(lo,hi);out[key]=reference>0&&band!==null?100*band/reference:null;out[key+'_relative']=bandMeans[i]!==null&&maxMean>0?100*bandMeans[i]/maxMean:null;});
  const sub=sumBand(20,150),singer=sumBand(2800,3400);out.subBass=sub===null?null:100*sub/total;out.singerCluster=singer===null?null:100*singer/total;
  if(features.valid){
    const weights=Array.from({length:13},(_,i)=>Math.exp(-.5*((i-6)/6)**2));
    ranges.forEach(([lo,hi],index)=>{if(hi>sampleRate/2)return;let best=0,at=-1;for(let i=aHz(lo);i<bHz(hi);i++){let sum=0,weight=0;for(let j=-6;j<=6;j++){const k=i+j;if(k>=0&&k<mag.length){sum+=mag[k]*weights[j+6];weight+=weights[j+6];}}sum/=weight;if(sum>best){best=sum;at=i;}}if(best>maxMag*1e-4&&at>aHz(lo)&&at<bHz(hi)-1)out['F'+(index+1)]=at*binHz;});
    const harm=meanBand(80,3000),noise=meanBand(7000,9000);out.HNR_legacy=harm>0&&noise>0?10*Math.log10(harm/noise)+8:null;
    const f0=features.f0,period=sampleRate/f0,low=Math.max(1,Math.floor(period*.95)),high=Math.min(waveform.length>>1,Math.ceil(period*1.05));let rho=-1;
    for(let lag=low;lag<=high;lag++){let xy=0,xx=0,yy=0;for(let i=0;i<waveform.length-lag;i++){const x=waveform[i]-mean,y=waveform[i+lag]-mean;xy+=x*y;xx+=x*x;yy+=y*y;}if(xx&&yy)rho=Math.max(rho,xy/Math.sqrt(xx*yy));}if(rho>0&&rho<=1.000001){rho=Math.min(rho,.999999);out.HNR=10*Math.log10(rho/(1-rho));}
    const cycles=[],amplitudes=[];let last=null;for(let i=1;i<waveform.length;i++){const left=waveform[i-1]-mean,right=waveform[i]-mean;if(left<0&&right>=0){const crossing=i-1-left/(right-left);if(last!==null){const length=crossing-last;if(length>=period*.75&&length<=period*1.25){cycles.push(length);let min=Infinity,max=-Infinity;for(let j=Math.ceil(last);j<=Math.floor(crossing);j++){min=Math.min(min,waveform[j]);max=Math.max(max,waveform[j]);}amplitudes.push(max-min);}else{cycles.length=0;amplitudes.length=0;}}last=crossing;}}
    out.JIT=relativeChange(cycles);out.SHI=relativeChange(amplitudes);
    const cre=new Float64Array(n),cim=new Float64Array(n);cre[0]=Math.log(Math.max(mag[0],1e-6));cre[n/2]=Math.log(Math.max(mag[mag.length-1],1e-6));for(let i=1;i<mag.length;i++)cre[i]=cre[n-i]=Math.log(Math.max(mag[i],1e-6));fft(cre,cim);
    const qMin=Math.max(2,Math.floor(sampleRate/1200)),qMax=Math.min(n/2-1,Math.ceil(sampleRate/55));let sx=0,sy=0,sxy=0,sxx=0,k=0,peakValue=-Infinity,peakQ=0;for(let q=qMin;q<=qMax;q++){const value=cre[q]/n;sx+=q;sy+=value;sxy+=q*value;sxx+=q*q;k++;if(value>peakValue){peakValue=value;peakQ=q;}}const denominator=k*sxx-sx*sx;if(k>2&&denominator){const slope=(k*sxy-sx*sy)/denominator,intercept=(sy-slope*sx)/k;out.CPP=Math.max(0,(peakValue-slope*peakQ-intercept)*20/Math.LN10);}
    const vtl=[3,4,5].map(i=>out['F'+i]>0?(2*i-1)*34000/(4*out['F'+i]):null).filter(x=>x!==null);out.VTL=vtl.length===3?vtl.reduce((a,b)=>a+b)/vtl.length:null;
  }
  const amplitudes=[],block=Math.round(sampleRate*.02);for(let i=0;i+block<=waveform.length;i+=block){let value=0;for(let j=i;j<i+block;j++)value=Math.max(value,Math.abs(waveform[j]-mean));if(value>1e-7)amplitudes.push(value);}out.envelopeVariation=relativeChange(amplitudes);
  for(const key of Object.keys(out))out[key]=finite(out[key]);return out;
}
