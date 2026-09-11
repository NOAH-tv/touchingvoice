/** Lossless integer PCM packing. No resampling, dithering or Float32 round trip. */
export function readPcmWav(buffer) {
  const v=new DataView(buffer),ascii=(p,n)=>String.fromCharCode(...new Uint8Array(buffer,p,n));
  if(buffer.byteLength<44||ascii(0,4)!=='RIFF'||ascii(8,4)!=='WAVE'||v.getUint32(4,true)+8!==buffer.byteLength)throw new Error('Unsupported WAV container');
  let fmt,data;
  for(let p=12;p+8<=buffer.byteLength;){const n=v.getUint32(p+4,true),start=p+8;if(start+n>buffer.byteLength)throw new Error('Truncated WAV');const id=ascii(p,4);if(id==='fmt '){if(fmt||n<16)throw new Error('Invalid WAV format');fmt={format:v.getUint16(start,true),channels:v.getUint16(start+2,true),sampleRate:v.getUint32(start+4,true),align:v.getUint16(start+12,true),bitDepth:v.getUint16(start+14,true)};}if(id==='data'){if(data)throw new Error('Multiple PCM chunks');data={start,size:n};}p=start+n+(n&1);}
  if(!fmt||!data||fmt.format!==1||![16,24].includes(fmt.bitDepth)||fmt.channels<1||fmt.channels>2||fmt.sampleRate<8000||fmt.sampleRate>192000||fmt.align!==fmt.channels*fmt.bitDepth/8||!data.size||data.size%fmt.align)throw new Error('Unsupported integer PCM');
  return {...fmt,...data,frames:data.size/fmt.align};
}
export function encodePcmWav(Flac,buffer,onProgress=()=>{}) {
  const info=readPcmWav(buffer),v=new DataView(buffer),parts=[];let meta,encoder=0;
  try {
    encoder=Flac.create_libflac_encoder(info.sampleRate,info.channels,info.bitDepth,5,info.frames,true,4096);
    if(!encoder||Flac.init_encoder_stream(encoder,d=>parts.push(new Uint8Array(d)),m=>{meta=m;})!==0)throw new Error('FLAC initialization failed');
    const step=16384,pcm=new Int32Array(step*info.channels);
    for(let frame=0;frame<info.frames;frame+=step){const count=Math.min(step,info.frames-frame);let p=info.start+frame*info.align;for(let i=0;i<count*info.channels;i++){pcm[i]=info.bitDepth===16?v.getInt16(p,true):(v.getUint8(p)|(v.getUint8(p+1)<<8)|(v.getInt8(p+2)<<16));p+=info.bitDepth/8;}if(!Flac.FLAC__stream_encoder_process_interleaved(encoder,pcm.subarray(0,count*info.channels),count))throw new Error('FLAC verification failed');if(frame%(step*8)===0)onProgress(frame/info.frames);}
    if(!Flac.FLAC__stream_encoder_finish(encoder)||!meta||meta.total_samples!==info.frames||!/^[a-f0-9]{32}$/i.test(meta.md5sum)||/^0+$/.test(meta.md5sum))throw new Error('FLAC integrity metadata missing');
    const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let pos=0;for(const p of parts){out.set(p,pos);pos+=p.length;}
    if(out.length<42||String.fromCharCode(...out.subarray(0,4))!=='fLaC'||(out[4]&127)!==0||out[7]!==34)throw new Error('Invalid FLAC output');
    // The streaming encoder cannot seek back to STREAMINFO. Patch final frame
    // sizes and PCM MD5, leaving its predeclared sample count/format unchanged.
    for(const [offset,value] of [[12,meta.min_framesize],[15,meta.max_framesize]]){out[offset]=value>>>16;out[offset+1]=value>>>8;out[offset+2]=value;}
    for(let i=0;i<16;i++)out[26+i]=parseInt(meta.md5sum.slice(i*2,i*2+2),16);
    return {buffer:out.buffer,pcmMd5:meta.md5sum,sampleRate:info.sampleRate,bitDepth:info.bitDepth,channels:info.channels,frames:info.frames,encoder:'libflacjs-5.6.0',compression:5};
  } finally {if(encoder)Flac.FLAC__stream_encoder_delete(encoder);}
}
