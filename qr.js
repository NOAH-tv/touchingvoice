let library;
export async function renderQR(value,target) {
  const url=new URL(value);
  if(!['https:','http:'].includes(url.protocol)||value.length>2048)throw new Error('QR 주소를 확인해 주세요.');
  library ||= new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=new URL('./qrcode.js',import.meta.url).href;
    script.onload=resolve;script.onerror=()=>reject(new Error('QR 생성 도구를 읽지 못했습니다.'));
    document.head.append(script);
  });
  await library;
  const qr=window.qrcode(0,'M');qr.addData(value,'Byte');qr.make();
  const count=qr.getModuleCount(),quiet=4,scale=5,canvas=document.createElement('canvas');
  canvas.width=canvas.height=(count+quiet*2)*scale;
  canvas.setAttribute('aria-label','학생 출석 QR 코드');canvas.setAttribute('role','img');
  canvas.style.cssText='width:min(260px,100%);height:auto;border-radius:12px;image-rendering:pixelated';
  const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.fillStyle='#170b29';
  for(let row=0;row<count;row++)for(let col=0;col<count;col++)if(qr.isDark(row,col))context.fillRect((col+quiet)*scale,(row+quiet)*scale,scale,scale);
  target.replaceChildren(canvas);
  return canvas;
}
