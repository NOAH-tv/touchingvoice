import { ANALYZER_BANDS } from './analyzer-metrics.js?v=monitor-fix-20260913';

/** Same non-overlapping power bands as the stored analyzer. Never sums dB. */
export function spectrumComposition(spectrum, sampleRate) {
  if (!spectrum?.length || !Number.isFinite(sampleRate) || sampleRate < 17000) return null;
  const binHz=sampleRate/(2*spectrum.length);
  const powers=ANALYZER_BANDS.map(([,lo,hi])=>{
    let sum=0;
    for(let i=Math.max(1,Math.ceil(lo/binHz));i<Math.min(spectrum.length,Math.ceil(hi/binHz));i++) {
      const db=spectrum[i];
      if(Number.isNaN(db)||db===Infinity)return NaN;
      sum+=Number.isFinite(db)?10**(Math.max(-120,db)/10):0;
    }
    return sum;
  });
  return compositionPercent(powers);
}

export function compositionPercent(values) {
  if(values?.length!==ANALYZER_BANDS.length||values.some(v=>!Number.isFinite(v)||v<0))return null;
  const sum=values.reduce((a,b)=>a+b,0);
  return sum>0?values.map(value=>value/sum*100):null;
}

/** Display rounding alone: largest remainders keep nine displayed values at 100.0%. */
export function displayPercentages(values) {
  const percent=compositionPercent(values);if(!percent)return null;
  const units=percent.map(v=>Math.floor(v*10));
  const order=percent.map((v,i)=>({i,remainder:v*10-units[i]})).sort((a,b)=>b.remainder-a.remainder||a.i-b.i);
  for(let n=1000-units.reduce((a,b)=>a+b,0),i=0;i<n;i++)units[order[i%order.length].i]++;
  return units.map(v=>v/10);
}

export function storedComposition(stats) {
  const bands=ANALYZER_BANDS.map(([key])=>stats?.[key]);
  if(!bands[0]?.count||bands.some(b=>b?.count!==bands[0].count))return null;
  return compositionPercent(bands.map(b=>b.mean));
}

export function mountFrequencyDistribution(container,{note}={}) {
  const colors=['#c6b2ef','#b89be8','#a782df','#9470d5','#8660cb','#a668cc','#bb78c8','#d091c7','#e4b2d3'];
  container.className='frequency-distribution';
  container.innerHTML='<div class="frequency-heading"><h3>소리의 주파수 구성 · 100 Hz–8 kHz</h3><b class="frequency-total">입력 대기</b></div><p class="frequency-note"></p><div class="frequency-stack" aria-hidden="true"></div><div class="frequency-grid"></div><details class="frequency-help"><summary>구성비는 어떻게 읽나요?</summary><p>표시한 9개 대역의 에너지를 합쳐 100%로 봅니다. 숫자는 대표 주파수이며 실제 분석 범위는 60–8,500 Hz입니다. 비중이 크면 해당 대역의 소리가 상대적으로 많이 포함된 것입니다. 각 대역의 적정 비율은 발음·음높이·마이크에 따라 달라집니다. 인두 위치나 성문하부 압력·마찰을 직접 측정한 비율은 아닙니다.</p></details>';
  container.querySelector('.frequency-note').textContent=note||'';
  const total=container.querySelector('.frequency-total'),stack=container.querySelector('.frequency-stack'),grid=container.querySelector('.frequency-grid');
  const cells=ANALYZER_BANDS.map(([,lo,hi,label],i)=>{
    const segment=document.createElement('i');segment.style.background=colors[i];stack.append(segment);
    const cell=document.createElement('details');cell.className='frequency-band';cell.style.setProperty('--band-color',colors[i]);
    cell.innerHTML=`<summary title="${lo}–${hi} Hz 대역의 에너지 비중"><span>${label}</span><b>—</b><span class="frequency-track"><i></i></span></summary><p>${lo.toLocaleString()}–${hi.toLocaleString()} Hz의 에너지 비중</p>`;
    grid.append(cell);return {segment,label:cell.querySelector('b'),bar:cell.querySelector('.frequency-track i')};
  });
  return {update(values){const percentages=displayPercentages(values);total.textContent=percentages?'합계 100.0%':'유효 입력 없음';container.dataset.available=String(Boolean(percentages));cells.forEach((cell,i)=>{const value=percentages?.[i];cell.label.textContent=value===undefined?'—':value.toFixed(1)+'%';cell.segment.style.width=cell.bar.style.width=(value??0)+'%';});}};
}
