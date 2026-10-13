/* Shared device ASR; verse navigation and the saved WAV do not depend on recognition. */
const BibleSpeech=(()=>{
 function begin(r){
  if(!settings.transcribe||r.session.kind==='vowel'||!DeviceSpeech.enabled)return;
  r.speech=DeviceSpeech.capture(r,{active:()=>recording===r||r.stopping,onStatus:message=>{const el=document.getElementById('bible-speech-status');if(el)el.textContent=message;},onResult:m=>{
   const s=r.session,start=s.continuous?(s.passages?.at(-1)?.start||0):0;
   const heard=(m.words||[]).filter(w=>w.start>=start-.1).map(w=>w.text).join(' ');
   // Only confirmed text persists as read. Interim matches are a reversible preview.
   const preview={...s,reading:structuredClone(s.reading)};
   const result=trackReading(m.final?s:preview,heard),lit=new Set(result?.lit||[]),confirmed=new Set(s.reading?.lit||[]);
   if(typeof armAutoNext==='function')armAutoNext(r,result,(m.words||[]).filter(w=>w.start>=start-.1));
   document.querySelectorAll('#reading-verse [data-syllable]').forEach(el=>{const n=Number(el.dataset.syllable);el.classList.toggle('speech-heard',confirmed.has(n));el.classList.toggle('speech-hearing',lit.has(n)&&!confirmed.has(n));});
   const el=document.getElementById('bible-speech-status');if(el){el.textContent='';if(m.text&&!el.dataset.firstResultMs)el.dataset.firstResultMs=String(Date.now()-r.started);}
  }});
 }
 async function finish(r){const result=await r.speech?.finish();if(result)r.session.deviceTranscript=result;return result?.transcript||'';}
 function apply(r,result){
  if(!result||result.status!=='ready'||!result.transcript)return;
  r.transcript=result;r.heard=result.transcript;r.stt='browser';r.model='korean-zipformer-device';
  r.accuracy=r.kind==='read'?textAccuracy(r.heard,r.text):null;
  const rate=result.syllablesPerSecond;
  r.voicePace={...result,status:Number.isFinite(rate)?'ready':'uncertain',syllables:(r.heard.match(/[가-힣]/g)||[]).length,pace:result.pace==='steady'?'within':result.pace};
 }
 async function transcribe(r,signal){
  if(r.transcript?.status==='ready'||!settings.transcribe||!DeviceSpeech.enabled||r.kind==='vowel')return;
  // Re-analysis is optional. Long readings use incremental live ASR instead of a large duplicate PCM buffer.
  if(r.duration>92)return;
  const ac=new (window.AudioContext||window.webkitAudioContext)();
  try{const buffer=await ac.decodeAudioData(await r.audio.arrayBuffer());apply(r,await DeviceSpeech.recognize(buffer.getChannelData(0),buffer.sampleRate,{final:true,signal}));}finally{await ac.close().catch(()=>{});}
 }
 window.addEventListener('pagehide',()=>recording?.speech?.cancel());
 return {begin,finish,apply,transcribe};
})();
