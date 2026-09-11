/* Classic Worker: libflac's distribution loads its WASM relative to this URL. */
self.FLAC_SCRIPT_LOCATION=new URL('../vendor/libflac/',self.location.href).href;
importScripts(new URL('../vendor/libflac/libflac.min.wasm.js',self.location.href).href);
const ready=new Promise(resolve=>Flac.isReady()?resolve():Flac.on('ready',resolve));
self.onmessage=async({data})=>{
  try {await ready;const {encodePcmWav}=await import('./flac-core.js');const result=encodePcmWav(Flac,data.buffer,progress=>self.postMessage({progress}));self.postMessage({result},[result.buffer]);}
  catch(error){self.postMessage({error:String(error?.message||error)});}
};
