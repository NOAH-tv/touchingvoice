import {call,config} from './api.js';
const token=location.hash.slice(1);
history.replaceState(null,'',location.pathname);
const button=document.querySelector('#checkin'),status=document.querySelector('#status');
if(config.preview)document.querySelector('#previewNote').style.display='block';
const requestId=crypto.randomUUID();
if(!/^[A-Za-z0-9_-]{32,256}$/.test(token)){button.disabled=true;status.textContent='유효한 출석 QR을 다시 스캔해 주세요.';}
button.addEventListener('click',async()=>{
  button.disabled=true;status.textContent='출석을 확인하고 있습니다.';
  try{const result=await call('qr.checkin',{token},'',{requestId});status.textContent=result.message||'출석을 확인했습니다.';button.textContent='확인 완료';}
  catch(error){status.textContent=error.message||'출석을 확인하지 못했습니다. 담당 선생님에게 알려주세요.';button.disabled=false;}
});
