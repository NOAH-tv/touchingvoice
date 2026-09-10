import { metricPriority } from '../research-policy.js';
import { ANALYZER_FIELDS, ANALYZER_BANDS } from './analyzer-metrics.js';
import { analysisJson, datasetCsv } from './file-analysis-service.js';
import { downloadBlob } from './storage.js';
import { getContext } from '../context.js';
import { coreMetricSummary } from '../../core-metrics.js?v=core-summary-20260910';
const metricDefinitions=[['f0','F0','Hz'],['level','입력 레벨','dBFS'],['clarity','음성 주기성','0–1'],['brilliance','상부 밝기','dB'],['f1dom','저역 공명 우세','dB'],['aesprom','3 kHz 돌출','dB'],['negh1h2','H2–H1','dB'],['ring3k','3 kHz 대역비','dB'],['lowmid','저중역 비','dB'],['tilt','대역 기울기','dB']];
const coreNumber=(value,digits=1)=>Number.isFinite(value)?Number(value.toFixed(digits)).toLocaleString('ko-KR',{maximumFractionDigits:digits}):'—';
const noteFromHz=hz=>{if(!(Number.isFinite(hz)&&hz>0))return '—';const midi=Math.round(69+12*Math.log2(hz/440));return ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][((midi%12)+12)%12]+(Math.floor(midi/12)-1);};
const coreField=(label,value,unit,digits=1)=>({label,value:Number.isFinite(value)?value:null,text:Number.isFinite(value)?coreNumber(value,digits)+(unit?' '+unit:''):'—',unit});

/** Small coaching result. Missing measurements never become zero; original
 * statistics and frame matrices remain untouched in their research archive. */
export function buildCoreAnalysisResult(entry){
 const summary=coreMetricSummary(entry),get=key=>summary.byKey[key]?.value??null,q=summary.quality;
 const median=get('f0_median'),std=get('f0_std'),min=get('f0_min'),max=get('f0_max'),levelMedian=get('level_median'),dynamicRange=get('dynamic_range');
 const rangeValid=Number.isFinite(min)&&Number.isFinite(max)&&min>0&&max>=min;
 const layerNames={nas:'상인두',oro:'중인두',aes:'하인두',src:'성문'};
 const layers=Object.entries(layerNames).map(([key,label])=>({...coreField(label,get(key+'_mean'),'%',1),key}));
 const formants=q.formants||{},formantsReady=typeof formants.method==='string'&&!['not_extracted','pending','unknown',''].includes(formants.method);
 const groups=[
  {id:'pitch',title:'대표 음높이와 변동',fields:[coreField('F0 중앙값',median,'Hz'),coreField('음높이 변동 · 표준편차',std,'Hz')],note:'이 녹음에서의 높이 변화입니다. 선율에 따라 변동이 커질 수 있습니다.'},
  {id:'observed-range',title:'이번 과제의 관측 음역',lead:rangeValid?`${noteFromHz(min)} → ${noteFromHz(max)}`:'—',fields:[coreField('관측 최저',rangeValid?min:null,'Hz'),coreField('관측 최고',rangeValid?max:null,'Hz')],note:'이번 녹음에서 검출된 범위이며, 낼 수 있는 전체 음역을 뜻하지 않습니다.'},
  {id:'level',title:'상대 음량',fields:[coreField('입력 레벨 중앙값',levelMedian,'dBFS'),coreField('음량 변화 폭 · P90−P10',dynamicRange,'dB')],note:'같은 마이크·거리에서 비교하세요. 실제 음압이나 호흡 압력은 아닙니다.'},
  {id:'periodicity',title:'음성 주기성',fields:[coreField('CPP · 추정',get('cpp_median'),'dB',2),coreField('HNR · 추정',get('hnr_median'),'dB',2)],note:'자체 분석법의 참고값입니다. 같은 발성 과제에서 비교하세요.'},
  {id:'layers',title:'네 영역의 화면 반응',fields:layers,note:'개인 튜닝에 따른 반응입니다. 근육의 발달 점수가 아닙니다.'},
  {id:'formants',title:'포먼트 F1–F3',fields:['F1','F2','F3'].map(label=>coreField(label,formantsReady?formants[label]:null,'Hz')),badge:formantsReady?'기준 도구 결과':'미측정',note:formantsReady?'별도로 추출한 포먼트 측정 결과입니다.':'포먼트 측정 결과가 준비되면 표시합니다.'},
 ];
 const voiced=q.voicedSeconds,duration=q.durationSeconds,clipping=Number.isFinite(q.clippedFraction)?q.clippedFraction*100:null;
 const quality={status:clipping>0?'클리핑 확인 필요':q.hasVoice?'유효 음성 확인':q.noVoice?'유효 음성 없음':'결과 확인 필요',attention:!q.hasVoice||clipping>0,
  fields:[coreField('녹음 길이',duration,'초',2),coreField('유효 음성',voiced,'초',2),coreField('클리핑',clipping,'%',3)],
  note:'— 는 측정할 수 없거나 아직 준비되지 않은 값입니다.'};
 return {groups,quality};
}
export function mountFileAnalysisView({getProfileId,getSessions,getJobs,upload,analyzeExisting,cancel,play,saveLabels,toast,beforePick,onSelectionChange=()=>{}}){
 const $=id=>document.getElementById(id);let selectedId=null,lastRenderKey='',mode='batch',holdEmpty=true,pendingUpload=null,selectionEpoch=0,observedProfileId=getProfileId();document.body.dataset.analysisMode=mode;
 const fmt=(v,d=1)=>Number.isFinite(v)?Number(v.toFixed(d)).toLocaleString('ko-KR',{maximumFractionDigits:d}):'—';
 const safe=fn=>Promise.resolve().then(fn).catch(e=>toast(e.message||'요청을 완료하지 못했습니다.',true));
 const current=()=>getSessions().find(s=>s.id===selectedId&&s.profileId===getProfileId());
 const makeText=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!=null)node.textContent=String(text);return node;};
 const qualityStrip=makeText('section','batch-core-quality');qualityStrip.id='batchCoreQuality';qualityStrip.setAttribute('aria-label','검사 품질과 유효 구간');$('batchSummaryCards').before(qualityStrip);
 const coreHeading=makeText('div','batch-core-heading');coreHeading.append(makeText('h3','','코칭에 필요한 핵심 결과'),makeText('p','','12개 핵심 수치로 먼저 확인하고, 필요한 경우 연구용 상세 지표를 펼쳐보세요.'));$('batchSummaryCards').before(coreHeading);$('batchSummaryCards').classList.add('batch-core-grid');$('batchSummaryCards').setAttribute('aria-label','음성 검사 핵심 결과');
 const researchDetails=$('batchDetails').closest('details');if(researchDetails){researchDetails.open=false;researchDetails.classList.add('batch-research-details');const title=researchDetails.querySelector('summary b'),hint=researchDetails.querySelector('summary small');if(title)title.textContent='연구용 상세 지표';if(hint)hint.textContent='전체 통계 · 주파수 대역 · 분석 조건';researchDetails.addEventListener('toggle',()=>{if(researchDetails.open&&current()?.fileAnalysis)renderResearch(current());});const firstHeading=$('batchOriginalMetrics').previousElementSibling?.querySelector('h3');if(firstHeading)firstHeading.textContent='보관 중인 추가·탐색 지표';const formantHint=researchDetails.querySelector('.field-hint');if(formantHint)formantHint.textContent='추정 방법과 원본 수치를 함께 보관합니다. F1–F7로 표기된 기존 값은 고정 주파수 대역의 피크이며, 실제 포먼트 측정값으로 사용하지 않습니다. 빈칸은 측정 불가입니다.';}
 const assessmentToolbar=document.createElement('div');assessmentToolbar.style.cssText='display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:0 0 16px';const assessmentButton=document.createElement('button');assessmentButton.type='button';assessmentButton.className='button primary';assessmentButton.textContent='▦ 성격검사 QR';assessmentButton.setAttribute('aria-label','성격검사 QR');const assessmentHint=document.createElement('span');assessmentHint.textContent='학생 휴대폰으로 Big Five 성격검사 진행';assessmentHint.style.cssText='color:#cbb8df;font-size:13px';assessmentToolbar.append(assessmentButton,assessmentHint);$('examWorkflow').before(assessmentToolbar);
 assessmentButton.onclick=()=>safe(async()=>{const url='https://touchingvoice.app/touchingvoice_v3.html';let dialog=$('assessmentQRDialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='assessmentQRDialog';dialog.setAttribute('aria-labelledby','assessmentQRTitle');dialog.style.cssText='box-sizing:border-box;width:min(440px,calc(100vw - 32px));border:1px solid #76559a;border-radius:22px;padding:28px;background:#1a102b;color:#f3e9d0;text-align:center;box-shadow:0 24px 90px #0009';dialog.innerHTML='<h2 id="assessmentQRTitle" style="font-size:24px;margin:0 0 12px">성격검사</h2><p style="line-height:1.7;color:#d4c3e5">휴대폰 카메라로 QR을 스캔해 주세요.<br>회원가입 없이 검사를 시작할 수 있습니다.</p><div id="assessmentQRCode" style="display:flex;justify-content:center;margin:22px 0"></div><p style="font-size:12px;line-height:1.7;color:#cbb8df">음성검사와 같은 이름으로 입력해 주세요.<br>검사 완료 후 결과를 지도사에게 보여주세요.<br>현재는 코칭 학생 기록에 점수를 자동 합치지 않습니다.</p><div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><a class="button primary" id="assessmentOpen" target="_blank" rel="noopener">이 PC에서 열기</a><button type="button" class="button" id="assessmentCopy">링크 복사</button><button type="button" class="button" id="assessmentClose">닫기</button></div>';document.body.append(dialog);$('assessmentOpen').href=url;$('assessmentClose').onclick=()=>dialog.close();$('assessmentCopy').onclick=()=>safe(async()=>{await navigator.clipboard.writeText(url);toast('성격검사 링크를 복사했습니다.');});dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});}dialog.showModal();const {renderQR}=await import('../../qr.js');const canvas=await renderQR(url,$('assessmentQRCode'));canvas.setAttribute('aria-label','터칭보이스 성격검사 QR 코드');});
 const reportButton=document.createElement('button');reportButton.id='batchReportBtn';reportButton.type='button';reportButton.textContent='발성심리보고서 발급';reportButton.className='btn primary';$('batchJsonBtn').before(reportButton);
 reportButton.onclick=()=>safe(async()=>{const entry=current();if(!entry?.fileAnalysis)throw new Error('검사 결과를 먼저 선택해 주세요.');if(entry.franchiseUpload?.state!=='complete'||!entry.franchiseUpload?.examId)throw new Error('검사 기록의 서버 저장이 완료된 뒤 보고서를 발급할 수 있습니다.');const c=getContext();const url=new URL('../../report.html',location.href);url.hash=new URLSearchParams({exam:entry.franchiseUpload.examId,branch:c.branchId}).toString();window.open(url.href,'_blank');});
 const input=document.createElement('input');input.type='file';input.accept='audio/*,.wav,.mp3,.m4a,.webm,.ogg,.flac';input.multiple=true;input.hidden=true;input.id='batchAudioFiles';document.body.append(input);input.onchange=()=>{const files=[...input.files],owner=pendingUpload;pendingUpload=null;input.value='';if(files.length)safe(()=>upload(files,owner));};
 const pick=()=>safe(async()=>{pendingUpload=await beforePick?.();input.click();});$('batchUploadBtn').onclick=pick;$('analysisDropzone').onclick=pick;$('analysisDropzone').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick();}};
 const zone=$('analysisDropzone');zone.ondragover=e=>{e.preventDefault();zone.classList.add('dragover');};zone.ondragleave=()=>zone.classList.remove('dragover');zone.ondrop=e=>{e.preventDefault();zone.classList.remove('dragover');const files=[...e.dataTransfer.files];if(files.length)safe(()=>upload(files));};
 function setMode(next){mode=next;document.body.dataset.analysisMode=mode;$('batchAnalysisView').hidden=mode!=='batch';$('liveAnalysisView').hidden=mode!=='live';$('batchModeBtn').setAttribute('aria-selected',String(mode==='batch'));$('liveModeBtn').setAttribute('aria-selected',String(mode==='live'));refresh();}
 $('batchModeBtn').onclick=()=>setMode('batch');$('liveModeBtn').onclick=()=>setMode('live');$('analysisSavedSelect').onchange=e=>{syncProfile();selectionEpoch++;selectedId=e.target.value;holdEmpty=false;lastRenderKey='';refresh();};$('analyzeExistingBtn').onclick=()=>safe(analyzeExisting);
 $('batchSaveLabelsBtn').onclick=()=>safe(async()=>{const entry=current();if(!entry)return;const annotation={...entry.annotation,task:$('batchTaskLabel').value.trim(),conditions:$('batchConditionsLabel').value.trim()};await saveLabels(entry,annotation);toast('이 기록의 데이터 라벨을 저장했습니다.');});
 $('batchPlayBtn').onclick=()=>safe(async()=>{const s=current();if(s)await play(s);});
 $('batchJsonBtn').onclick=()=>safe(async()=>{const s=current();if(s)await downloadBlob(new Blob([JSON.stringify(analysisJson(s),null,2)],{type:'application/json'}),`analysis-${s.id}.json`);});
 $('batchCsvBtn').onclick=()=>safe(async()=>{const s=current();if(s)await downloadBlob(await datasetCsv(s),`analysis-${s.id}-frames.csv`);});
 function syncProfile(){const id=getProfileId();if(id!==observedProfileId){observedProfileId=id;selectionEpoch++;selectedId=null;lastRenderKey='';}}
 // Automatic imports retain the epoch captured at file selection. A later manual
 // choice, new-participant reset or profile switch owns the screen from then on.
 function select(entry,{epoch}={}){syncProfile();if(entry.profileId!==getProfileId()||(epoch!==undefined&&epoch!==selectionEpoch))return false;if(epoch===undefined)selectionEpoch++;holdEmpty=false;selectedId=entry.id;lastRenderKey='';setMode('batch');return true;}
 function clearSelection(){syncProfile();selectionEpoch++;holdEmpty=true;selectedId=null;lastRenderKey='';refresh();}
 function refresh(){
  syncProfile();
  const entries=getSessions().filter(s=>s.profileId===getProfileId()&&(s.fileAnalysis||s.analysisStatus));if(!entries.some(s=>s.id===selectedId))selectedId=holdEmpty?null:entries[0]?.id||null;const optionsKey=entries.map(s=>s.id+':'+s.analysisStatus).join('|');
  if($('analysisSavedSelect').dataset.key!==optionsKey){$('analysisSavedSelect').dataset.key=optionsKey;const options=entries.map(s=>{const o=document.createElement('option');o.value=s.id;o.textContent=`${s.sourceFileName||s.name} · ${new Date(s.createdAt).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})} · ${s.fileAnalysis?'분석 완료':s.analysisStatus==='error'?'분석 오류':s.analysisStatus==='cancelled'?'분석 취소':'분석 대기'}`;return o;});if(!options.length){const o=document.createElement('option');o.value='';o.textContent='아직 분석 기록이 없습니다.';options.push(o);}$('analysisSavedSelect').replaceChildren(...options);}$('analysisSavedSelect').value=selectedId||'';
  const jobs=getJobs().filter(j=>j.entry.profileId===getProfileId()&&j.status!=='complete').slice(-5);const jobKey=jobs.map(j=>j.id+j.status+Math.floor(j.progress*100)).join('|');
  if($('batchJobList').dataset.key!==jobKey){$('batchJobList').dataset.key=jobKey;$('batchJobList').replaceChildren();for(const j of jobs){const row=document.createElement('div');row.className='batch-job';const line=document.createElement('div');line.className='batch-job-line';const title=document.createElement('b');title.textContent=j.entry.sourceFileName||j.entry.name;const status=document.createElement('span');status.textContent={queued:'대기 중',decoding:'파일 해독 중',analyzing:`전체 분석 ${Math.round(j.progress*100)}%`,saving:'원음·지표 저장 중',error:'분석 오류',cancelled:'취소됨'}[j.status]||j.status;line.append(title,status);if(['queued','decoding','analyzing'].includes(j.status)){const b=document.createElement('button');b.textContent='분석 취소';b.onclick=()=>cancel(j.id);line.append(b);}row.append(line);if(j.status==='analyzing'){const p=document.createElement('progress');p.max=1;p.value=j.progress;row.append(p);}if(j.error){const e=document.createElement('small');e.textContent=j.error;row.append(e);}$('batchJobList').append(row);}}
  const entry=current(),report=entry?.fileAnalysis;$('batchResult').hidden=!report;$('batchEmpty').hidden=!!report;onSelectionChange(entry);if(!report)return;
  const key=entry.id+report.analyzedAt+entry.analysisStatus+entry.unsaved;if(key===lastRenderKey){drawCharts(report);return;}lastRenderKey=key;
  $('batchTaskLabel').value=entry.annotation?.task||'';$('batchConditionsLabel').value=entry.annotation?.conditions||'';$('batchFileName').textContent=entry.sourceFileName||entry.name;$('batchSaveBadge').textContent=entry.unsaved?'기기 저장 실패 · 내보내기 필요':entry.saving?'저장 중':entry.analysisStatus==='error'?'저장된 결과 · 오류 내역 확인':'PC 분석 저장 완료';$('batchMethodLine').textContent=`${fmt(report.duration,2)}초 녹음 · 분석 완료 · ${fmt(report.sampleRate,0)} Hz 분석`;
  renderCore(entry);
  if(researchDetails?.open)renderResearch(entry);else for(const id of ['batchOriginalMetrics','batchBands','batchDetails'])$(id).replaceChildren();
  drawCharts(report);
 }
 function renderCore(entry){
  const core=buildCoreAnalysisResult(entry),q=core.quality;
  qualityStrip.replaceChildren();
  qualityStrip.append(makeText('strong','batch-quality-badge'+(q.attention?' attention':''),q.status));
  for(const field of q.fields){const item=makeText('div','batch-quality-item');item.append(makeText('span','',field.label),makeText('b','',field.text));qualityStrip.append(item);}
  qualityStrip.append(makeText('small','batch-quality-note',q.note));
  $('batchSummaryCards').replaceChildren(...core.groups.map(group=>{
   const card=makeText('article','batch-core-card batch-core-'+group.id);card.dataset.coreGroup=group.id;
   const heading=makeText('div','batch-core-card-heading');heading.append(makeText('h4','',group.title));if(group.badge)heading.append(makeText('span','batch-core-badge',group.badge));card.append(heading);
   if(group.lead)card.append(makeText('strong','batch-core-lead',group.lead));
   const values=makeText('div',group.id==='layers'?'batch-core-layer-values':'batch-core-values');
   for(const field of group.fields){
    const row=makeText('div',group.id==='layers'?'batch-core-layer':'batch-core-value');
    if(group.id==='layers'){
     row.dataset.layer=field.key;
     const line=makeText('div','batch-core-layer-line');line.append(makeText('span','',field.label),makeText('b','',field.text));
     const track=makeText('div','batch-core-layer-track'),bar=makeText('i','');bar.style.width=(field.value??0)+'%';track.append(bar);track.setAttribute('aria-label',field.label+' 평균 화면 반응'+(field.value===null?' · 측정값 없음':''));if(field.value!==null){track.setAttribute('role','meter');track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');track.setAttribute('aria-valuenow',String(field.value));}else track.setAttribute('role','img');row.append(line,track);
    }else row.append(makeText('span','',field.label),makeText('b',field.value===null?'unavailable':'',field.text));
    values.append(row);
   }
   card.append(values,makeText('p','batch-core-card-note',group.note));return card;
  }));
 }
 function renderResearch(entry){
  const report=entry.fileAnalysis,f=report.voiceMetrics?.metrics?.f0||{},extra=report.additionalStats||{};
  const dr=coreMetricSummary(entry).byKey.dynamic_range?.value;
  const originals=[['F0',f.median,'Hz',false],...Array.from({length:7},(_,i)=>['대역 피크 '+(i+1),extra['F'+(i+1)]?.median,'Hz',true]),['RMS',extra.RMS?.median,'FS',false],['DR',dr,'dB',false],['HNR',extra.HNR?.median,'dB',true],['Jitter',extra.JIT?.median,'%',true],['Shimmer',extra.SHI?.median,'%',true],['CPP',extra.CPP?.median,'dB',true],['VTL 모델값',extra.VTL?.median,'cm',true]];
  $('batchOriginalMetrics').replaceChildren(...originals.map(([label,value,unit,estimated])=>{const a=document.createElement('article');a.className='batch-original';const l=document.createElement('span');l.textContent=label+(estimated?' · 추정':'');const v=document.createElement('b');v.textContent=fmt(value,label==='RMS'?5:2);const u=document.createElement('small');u.textContent=unit+(estimated?' · 방법 구분 저장':'');a.append(l,v,u);return a;}));
  $('batchBands').replaceChildren(...ANALYZER_BANDS.map(([key,,,label])=>{const value=extra[key]?.mean,a=document.createElement('article');a.className='batch-band';const row=document.createElement('div'),l=document.createElement('span'),v=document.createElement('b'),bar=document.createElement('span'),fill=document.createElement('i');l.textContent=label;v.textContent=fmt(value,2)+'%';fill.style.width=Math.max(0,Math.min(100,value||0))+'%';row.append(l,v);bar.append(fill);a.append(row,bar);return a;}));
  $('batchDatasetCount').textContent=`${metricDefinitions.length+ANALYZER_FIELDS.length}종 보관 지표 · ${fmt(report.dataset?.rowCount,0)}행`;
  const rows=[...metricDefinitions.map(([key,label,unit])=>({key,label,unit,stats:report.voiceMetrics?.metrics?.[key]})),...ANALYZER_FIELDS.map(d=>({...d,stats:extra[d.key]}))];$('batchDetails').replaceChildren(...rows.sort((a,b)=>({core:0,quality:1,candidate:2,exploratory:3,hold:4}[metricPriority(a.key).tier]-{core:0,quality:1,candidate:2,exploratory:3,hold:4}[metricPriority(b.key).tier])).map(d=>{const tr=document.createElement('tr');const label=document.createElement('td'),b=document.createElement('b'),small=document.createElement('small'),bandPeak=/^F[1-7]$/.test(d.key);b.textContent=bandPeak?`고정 대역 피크 ${d.key.slice(1)}`:d.label;small.textContent=`${d.unit} · ${d.key}${d.quality==='estimate'?' · 추정':''}`;label.append(b,small);const priority=metricPriority(d.key);const tag=document.createElement('small');tag.textContent=bandPeak?'포먼트 측정값 아님':priority.label;tag.style.color=priority.tier==='core'?'#f2d18b':'#bba7d2';label.append(tag);label.title=(d.method||'유효 음성 프레임 통계')+' · '+priority.note;tr.append(label);for(const key of ['median','mean','p10','p90','std','count']){const td=document.createElement('td');td.textContent=fmt(d.stats?.[key],key==='count'?0:d.unit==='FS'?5:2);tr.append(td);}return tr;}));
  $('batchMetadata').textContent=JSON.stringify({source:report.source,analysisVersion:report.analysisVersion,method:report.method,windowSize:report.windowSize,hopSize:report.hopSize,sampleRate:report.sampleRate,channelPolicy:report.channelPolicy,decodedChannels:report.decodedChannels,profileId:entry.profileId,profile:entry.profile,captureSettings:entry.captureSettings,dataset:report.dataset,signal:report.signal},null,2);
 }
 function context(id){const canvas=$(id),w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return null;const scale=Math.min(devicePixelRatio||1,2);if(canvas.width!==Math.round(w*scale)||canvas.height!==Math.round(h*scale)){canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);}const c=canvas.getContext('2d');c.setTransform(scale,0,0,scale,0,0);c.clearRect(0,0,w,h);c.font='10px Paperlogy';c.fillStyle='#997faa';for(let i=0;i<=4;i++){const x=30+i*(w-42)/4;c.fillText((current()?.fileAnalysis.duration*i/4).toFixed(1)+'s',Math.min(w-36,x),h-4);}return {c,w,h};}
 function drawCharts(report){let chart=context('batchWave');if(chart){const {c,w,h}=chart;c.strokeStyle='#b795ef';c.lineWidth=1;c.beginPath();for(const p of report.waveform){const x=30+(p.t/report.duration)*(w-42);c.moveTo(x,h/2-(p.max||0)*(h-30)*.45);c.lineTo(x,h/2-(p.min||0)*(h-30)*.45);}c.stroke();}chart=context('batchPitch');if(chart){const {c,w,h}=chart,values=report.pitchTrace.filter(p=>p.f0>0).map(p=>p.f0),lo=values.length?Math.min(...values)*.85:50,hi=values.length?Math.max(...values)*1.15:500;c.strokeStyle='#66d4cd';c.lineWidth=1.5;c.beginPath();let pen=false;for(const p of report.pitchTrace){if(!(p.f0>0)){pen=false;continue;}const x=30+p.t/report.duration*(w-42),y=12+(hi-p.f0)/(hi-lo||1)*(h-36);pen?c.lineTo(x,y):c.moveTo(x,y);pen=true;}c.stroke();c.fillStyle='#9c7daf';c.fillText(fmt(hi,0)+'Hz',0,10);c.fillText(fmt(lo,0)+'Hz',0,h-19);}}
 return {refresh,select,clearSelection,current,setMode,get selectionEpoch(){syncProfile();return selectionEpoch;},chooseFiles:pick,paint(){if(mode==='batch'&&current()?.fileAnalysis)drawCharts(current().fileAnalysis);}};
}
