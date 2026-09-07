/** Read-only longitudinal views. Identity always comes from profileId, never a display name. */
const finite = value => typeof value === 'number' && Number.isFinite(value);
const text = value => typeof value === 'string' ? value.trim() : '';
const voiceOf = session => session.voiceMetrics || session.fileAnalysis?.voiceMetrics;
const stat = (summary, key) => summary?.count > 0 && finite(summary[key]) ? summary[key] : null;

export const HISTORY_METRICS = Object.freeze([
  { key:'f0', label:'F0 중앙값', unit:'Hz', decimals:1, note:'유효 음성의 기본 주파수 중앙값', read:s => {const value=stat(voiceOf(s)?.metrics?.f0,'median');return value>0?value:null;} },
  { key:'range', label:'관측 음역 폭', unit:'반음', decimals:1, note:'해당 검사에서 관측한 최저·최고 F0의 폭', read:s => {
    const f=voiceOf(s)?.metrics?.f0, lo=stat(f,'min'), hi=stat(f,'max');
    return lo>0 && hi>=lo ? 12*Math.log2(hi/lo) : null;
  } },
  { key:'level', label:'입력 레벨 평균', unit:'dBFS', decimals:1, note:'개인별 입력 보정이 적용된 유효 음성 프레임 평균', read:s => stat(voiceOf(s)?.metrics?.level,'mean') },
  { key:'rms', label:'전체 RMS', unit:'dBFS', decimals:1, note:'파일 전체의 디지털 신호 크기 · 실제 음압(SPL)과 구분', read:s => s.fileAnalysis?.signal?.rmsDbFS },
  ...[['HNR','HNR 추정','dB'],['JIT','Jitter 추정','%'],['SHI','Shimmer 추정','%'],['CPP','CPP 추정','dB']].map(([key,label,unit]) => ({
    key,label,unit,decimals:2,note:'전체 파일 분석의 유효 추정값 중앙값 · 동일한 발성 과제에서 비교',
    read:s => stat(s.fileAnalysis?.additionalStats?.[key],'median'),
  })),
].map(Object.freeze));

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}
const keyOf = value => JSON.stringify(canonical(value));
function contextOf(session) {
  const voice=voiceOf(session), file=session.fileAnalysis;
  const profile=voice?.profileConfig || session.profile;
  const config=profile?.global && profile?.layers ? {global:profile.global,layers:profile.layers} : null;
  const version=file?.analysisVersion ?? file?.dataset?.analysisVersion ?? file?.version;
  const algorithm=file ? (version==null ? null : keyOf({method:file.method||'offline-full-file',version,
    sampleRate:file.sampleRate,windowSize:file.windowSize,hopSize:file.hopSize,
    windowFunction:file.windowFunction,channelPolicy:file.channelPolicy}))
    : voice?.version===1 ? voice.analysisMethod||'realtime-v1' : null;
  const task=text(session.annotation?.task)||text(session.report?.kind);
  const conditions=text(session.annotation?.conditions);
  return {algorithm,config:config ? keyOf(config) : null,task,conditions,
    source:text(session.sourceKind)||text(session.report?.source),
    capture:session.captureSettings ? keyOf(session.captureSettings) : null};
}

/** Unknown recording conditions are not silently treated as matching conditions. */
export function historyBoundaryReasons(before, after) {
  const a=contextOf(before),b=contextOf(after),reasons=[];
  if (!before.profileId || before.profileId!==after.profileId) reasons.push('회원이 다름');
  if (!a.algorithm || !b.algorithm) reasons.push('분석 방법 미확인');
  else if (a.algorithm!==b.algorithm) reasons.push('분석 방법·버전이 다름');
  if (!a.config || !b.config) reasons.push('보정 설정 미확인');
  else if (a.config!==b.config) reasons.push('보정 설정이 다름');
  if (!a.task || !b.task) reasons.push('발성 과제 미입력');
  else if (a.task!==b.task) reasons.push('발성 과제가 다름');
  if (!a.conditions || !b.conditions) reasons.push('녹음 조건 미입력');
  else if (a.conditions!==b.conditions) reasons.push('녹음 조건이 다름');
  if (a.source!==b.source) reasons.push('음성 입력 방식이 다름');
  if (a.capture!==b.capture) reasons.push('마이크 설정이 다름');
  return reasons;
}

/** Produces separate segments around missing values, missing dates, and changed conditions. */
export function buildMemberHistory(sessions, profileId, metricKey='f0') {
  const metric=HISTORY_METRICS.find(m=>m.key===metricKey)||HISTORY_METRICS[0];
  const owned=typeof profileId==='string' && profileId.trim()
    ? (Array.isArray(sessions)?sessions:[]).filter(s=>s?.profileId===profileId) : [];
  const rows=owned.map((session,index)=>{
    const candidate=metric.read(session),timestamp=typeof session.createdAt==='string' ? Date.parse(session.createdAt) : NaN;
    return {session,index,timestamp:finite(timestamp)?timestamp:null,value:finite(candidate)?candidate:null};
  }).sort((a,b)=>(a.timestamp??Infinity)-(b.timestamp??Infinity)||a.index-b.index);
  const segments=[],warnings=new Map();let segment=null;
  const warn=reason=>warnings.set(reason,(warnings.get(reason)||0)+1);
  for(let index=0;index<rows.length;index++) {
    const row=rows[index];row.order=index+1;row.boundaryReasons=[];
    if(row.timestamp===null) {warn('검사 날짜 미확인');row.boundaryReasons.push('검사 날짜 미확인');}
    if(row.value===null) {warn('선택 지표의 유효값 없음');row.boundaryReasons.push('선택 지표의 유효값 없음');}
    if(row.timestamp===null || row.value===null) {segment=null;continue;}
    const previous=rows[index-1];
    if(previous && previous.timestamp!==null && previous.value!==null) {
      row.boundaryReasons=historyBoundaryReasons(previous.session,row.session);
      row.boundaryReasons.forEach(warn);
    }
    else if(previous) row.boundaryReasons.push('직전 기록의 유효값 또는 날짜 없음');
    if(!segment || row.boundaryReasons.length) {segment=[];segments.push(segment);}
    segment.push(row);
  }
  const points=segments.flat();
  return {metric,rows,segments,points,warnings:[...warnings].map(([reason,count])=>({reason,count})),
    missingCount:rows.filter(row=>row.value===null).length};
}

const formatValue=(value,metric)=>finite(value) ? value.toLocaleString('ko-KR',{maximumFractionDigits:metric.decimals,minimumFractionDigits:metric.decimals}) : '—';
const dateLabel=(timestamp,full=false)=>timestamp===null ? '날짜 미확인' : new Date(timestamp).toLocaleString('ko-KR',full
  ? {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}
  : {month:'numeric',day:'numeric'});

export function mountMemberHistory({container,getProfileId,getSessions,onOpenRecord=()=>{}}) {
  if(!container) throw new Error('회원 차트를 표시할 영역이 필요합니다.');
  const doc=container.ownerDocument;
  const el=(tag,className,content)=>{const node=doc.createElement(tag);if(className)node.className=className;if(content!==undefined)node.textContent=content;return node;};
  const svgEl=(tag,attrs={})=>{const node=doc.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));return node;};
  const section=el('section','member-history'),heading=el('div','member-history-heading'),titleGroup=el('div');
  titleGroup.append(el('span','member-history-overline','VOICE HISTORY'),el('h2','','누적 검사 차트'));
  const metricLabel=el('label','member-history-metric'),select=el('select');select.setAttribute('aria-label','누적 차트 음성 지표');
  for(const metric of HISTORY_METRICS){const option=el('option','',metric.label+' · '+metric.unit);option.value=metric.key;select.append(option);}
  metricLabel.append(el('span','','변화 지표'),select);heading.append(titleGroup,metricLabel);
  const summary=el('div','member-history-summary'),metricNote=el('p','member-history-note'),chartWrap=el('div','member-history-chart');
  const svg=svgEl('svg',{'aria-label':'회원 음성 지표 누적 차트',role:'group'});chartWrap.append(svg);
  const empty=el('div','member-history-empty');empty.hidden=true;chartWrap.append(empty);
  const legend=el('p','member-history-legend','검사 순서 · 날짜순으로 표시합니다. 점을 선택하면 해당 기록을 엽니다.');
  const notice=el('p','member-history-conditions');notice.setAttribute('role','status');
  const details=el('details','member-history-data'),detailSummary=el('summary','','검사별 수치와 조건 보기'),tableWrap=el('div','member-history-table-scroll');
  details.append(detailSummary,tableWrap);section.append(heading,summary,metricNote,chartWrap,legend,notice,details);container.replaceChildren(section);
  let data=null;
  select.onchange=()=>refresh();
  function openRecord(row){onOpenRecord(row.session);}
  function paint() {
    if(!data)return;
    svg.replaceChildren();const width=Math.max(300,Math.round(chartWrap.clientWidth||600)),height=276;
    svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
    svg.setAttribute('aria-label',`${data.metric.label} 누적 차트, 유효 기록 ${data.points.length}개. 아래 표에서도 기록을 선택할 수 있습니다.`);
    svg.toggleAttribute('hidden',!data.points.length);empty.hidden=!!data.points.length;
    if(!data.points.length){empty.textContent=data.rows.length?'이 지표의 유효 분석값이 아직 없습니다. 파일 전체 분석이 완료되면 이곳에 표시됩니다.':'아직 검사 기록이 없습니다. 음성 분석에서 이 회원의 첫 검사를 저장해 주세요.';return;}
    const left=66,right=22,top=26,bottom=46,plotWidth=width-left-right,plotHeight=height-top-bottom;
    let lo=Infinity,hi=-Infinity;for(const point of data.points){lo=Math.min(lo,point.value);hi=Math.max(hi,point.value);}
    const padding=(hi-lo)*.16 || Math.max(Math.abs(hi)*.06, data.metric.decimals>1?.1:1);
    lo-=padding;hi+=padding;
    const dated=data.rows.filter(row=>row.timestamp!==null),positions=new Map(dated.map((row,index)=>[row,left+(dated.length===1?.5:index/(dated.length-1))*plotWidth]));
    const y=value=>top+(hi-value)/(hi-lo)*plotHeight;
    const label=(content,x,yPos,anchor='start',className='member-history-axis')=>{const node=svgEl('text',{x,y:yPos,'text-anchor':anchor,class:className});node.textContent=content;svg.append(node);};
    for(let i=0;i<=4;i++) {const value=lo+(hi-lo)*i/4,at=y(value);svg.append(svgEl('line',{x1:left,y1:at,x2:width-right,y2:at,class:'member-history-grid'}));label(formatValue(value,data.metric),left-10,at+4,'end');}
    label(data.metric.unit,left,13);
    const labelCount=Math.min(dated.length,Math.max(2,Math.floor(plotWidth/105)));
    const labelIndexes=new Set(Array.from({length:labelCount},(_,i)=>labelCount===1?0:Math.round(i*(dated.length-1)/(labelCount-1))));
    for(const index of labelIndexes){const row=dated[index];label(`${row.order} · ${dateLabel(row.timestamp)}`,positions.get(row),height-18,'middle');}
    for(const segment of data.segments) {
      if(segment.length>1)svg.append(svgEl('polyline',{points:segment.map(row=>`${positions.get(row)},${y(row.value)}`).join(' '),class:'member-history-line'}));
      for(const row of segment){
        const point=svgEl('g',{class:'member-history-point',role:'button',tabindex:0,'aria-label':`${dateLabel(row.timestamp,true)}, ${data.metric.label} ${formatValue(row.value,data.metric)} ${data.metric.unit}, 기록 열기`});
        const title=svgEl('title');title.textContent=`${dateLabel(row.timestamp,true)} · ${formatValue(row.value,data.metric)} ${data.metric.unit}`;
        point.append(title,svgEl('circle',{cx:positions.get(row),cy:y(row.value),r:15,class:'member-history-hit'}),svgEl('circle',{cx:positions.get(row),cy:y(row.value),r:5,class:'member-history-dot'}));
        point.addEventListener('click',()=>openRecord(row));point.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openRecord(row);}});svg.append(point);
      }
    }
  }
  function refresh() {
    data=buildMemberHistory(getSessions(),getProfileId(),select.value||'f0');
    summary.replaceChildren();const latest=data.points.at(-1);
    for(const [label,value] of [['누적 검사',`${data.rows.length}회`],['유효 지표',`${data.points.length}회`],['최근 측정값',latest?`${formatValue(latest.value,data.metric)} ${data.metric.unit}`:'—']]){
      const item=el('div');item.append(el('span','',label),el('strong','',value));summary.append(item);
    }
    metricNote.textContent=data.metric.note;
    const warnings=data.warnings.map(item=>`${item.reason} ${item.count}건`).join(' · ');
    notice.textContent=data.rows.length<2?'기록이 한 개여도 측정값을 점으로 표시합니다. 같은 과제와 녹음 조건으로 다음 검사를 이어가세요.'
      :warnings?`선이 끊긴 구간: ${warnings}. 분석 방법·보정·과제·녹음 조건이 확인되고 같은 인접 기록만 연결합니다.`
      :'저장된 분석 방법·보정·과제·녹음 조건이 같은 기록을 연결했습니다. 수치 변화에는 검사 당시의 발성 내용도 영향을 줍니다.';
    notice.hidden=!data.rows.length;legend.hidden=!data.points.length;details.hidden=!data.rows.length;
    const table=el('table'),caption=el('caption','','회원의 검사 날짜, 선택 지표와 검사 조건'),head=el('thead'),headRow=el('tr'),body=el('tbody');
    for(const name of ['검사','일시',`${data.metric.label} (${data.metric.unit})`,'과제 · 녹음 조건','연결 조건']){const th=el('th','',name);th.scope='col';headRow.append(th);}head.append(headRow);
    for(const row of data.rows){const tr=el('tr'),actionCell=el('td'),button=el('button','member-history-record',`${row.order}회 기록 열기`);button.type='button';button.onclick=()=>openRecord(row);actionCell.append(button);
      const conditions=[text(row.session.annotation?.task)||text(row.session.report?.kind)||'과제 미입력',text(row.session.annotation?.conditions)||'녹음 조건 미입력'].join(' · ');
      tr.append(actionCell,el('td','',dateLabel(row.timestamp,true)),el('td','member-history-number',formatValue(row.value,data.metric)),el('td','',conditions),el('td','',row.boundaryReasons.join(' · ')||(row.order===1?'첫 기록':'인접 기록과 조건 일치')));body.append(tr);
    }
    table.append(caption,head,body);tableWrap.replaceChildren(table);paint();
  }
  refresh();
  return {refresh,resize:paint};
}
