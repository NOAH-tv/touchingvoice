import {createFileSpectrumAnalyzer} from './response-spectrum.js?v=response-20261117';
import {writeSpectrogramColor} from './spectrogram-palette.js?v=exam-spectrum-20261117';

export const frequencyAt = (y, low, high, scale) => scale==='linear' ? high-y*(high-low) : high*(low/high)**y;
export function waveformEnvelope(channels, width=2400){
 const length=channels[0].length,n=Math.min(width,length),min=new Float32Array(n),max=new Float32Array(n);
 for(let x=0;x<n;x++)for(const channel of channels)for(let i=Math.floor(x*length/n);i<Math.floor((x+1)*length/n);i++){
  min[x]=Math.min(min[x],channel[i]);max[x]=Math.max(max[x],channel[i]);
 }
 return {min,max};
}
// Display only: periodic Blackman FFT4096. Stereo is power-averaged rather than
// summed as waveforms, so opposite-phase channels do not erase the display.
export async function rasterize(channels,sampleRate,options,cancelled=()=>false){
 const {start,end,low,high,scale}=options,width=Math.max(2,Math.min(1600,Math.round(options.width))),height=Math.max(64,Math.min(512,Math.round(options.height)));
 const fft=createFileSpectrumAnalyzer(),wave=new Float32Array(4096),power=new Float64Array(2048),rgba=new Uint8ClampedArray(width*height*4),binHz=sampleRate/4096;
 const bands=Array.from({length:height},(_,y)=>[Math.max(1,Math.floor(frequencyAt((y+1)/height,low,high,scale)/binHz)),Math.min(2047,Math.ceil(frequencyAt(y/height,low,high,scale)/binHz))]);
 for(let x=0;x<width;x++){
  if(cancelled())return null;power.fill(0);
  const center=Math.round((start+(x+.5)/width*(end-start))*sampleRate);
  for(const channel of channels){wave.fill(0);const first=center-2048,a=Math.max(0,first),b=Math.min(channel.length,first+4096);if(b>a)wave.set(channel.subarray(a,b),a-first);
   const db=fft(wave);for(let k=1;k<2048;k++)power[k]+=10**(db[k]/10)/channels.length;
  }
  for(let y=0;y<height;y++){let p=0;for(let k=bands[y][0];k<=bands[y][1];k++)p=Math.max(p,power[k]);const db=p>0?10*Math.log10(p):-120;writeSpectrogramColor(rgba,4*(y*width+x),(db+100)/100);}
  if(x%24===23)await new Promise(resolve=>setTimeout(resolve,0));
 }
 return {rgba,width,height,start,end,low,high,scale,timeStep:(end-start)/width,fftSize:4096,sampleRate};
}
if(typeof self!=='undefined'&&typeof document==='undefined'){
 let channels=null,sampleRate=48000,epoch=0;
 self.onmessage=async({data:m})=>{const current=++epoch;try{
  if(m.type==='init'){channels=m.channels;sampleRate=m.sampleRate;if(!channels?.length||channels.some(c=>!(c instanceof Float32Array)||c.length!==channels[0].length)||channels.reduce((n,c)=>n+c.byteLength,0)>128*1024*1024)throw Error('표시용 오디오 크기 또는 형식을 확인해 주세요.');const wave=waveformEnvelope(channels);self.postMessage({type:'ready',id:m.id,wave},[wave.min.buffer,wave.max.buffer]);}
  else if(m.type==='render'&&channels){const result=await rasterize(channels,sampleRate,m.options,()=>current!==epoch);if(result&&current===epoch)self.postMessage({type:'raster',id:m.id,...result},[result.rgba.buffer]);}
 }catch(e){self.postMessage({type:'error',id:m.id,message:e.message});}};
}
