/** Each job owns a Worker; errors/timeouts always terminate it and release PCM. */
export async function encodeWavToFlac(blob,{onProgress=()=>{},timeoutMs=120000,workerFactory=url=>new Worker(url)}={}) {
  const buffer=await blob.arrayBuffer();
  return new Promise((resolve,reject)=>{
    let worker,timer,settled=false;
    const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);worker?.terminate();error?reject(error):resolve(result);};
    try {
      worker=workerFactory(new URL('./flac-worker.js',import.meta.url));
      timer=setTimeout(()=>finish(new Error('FLAC encoding timeout')),timeoutMs);
      worker.onerror=()=>finish(new Error('FLAC Worker failed'));
      worker.onmessageerror=()=>finish(new Error('FLAC Worker response failed'));
      worker.onmessage=({data})=>{if(data.error)finish(new Error(data.error));else if(data.result){const {buffer,...metadata}=data.result;if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<42)return finish(new Error('Invalid FLAC response'));finish(null,{blob:new Blob([buffer],{type:'audio/flac'}),...metadata});}else if(Number.isFinite(data.progress))onProgress(data.progress);};
      worker.postMessage({buffer},[buffer]);
    }catch(error){finish(error);}
  });
}
