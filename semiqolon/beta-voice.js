// Shared v3 analysis and optional practice, adapted from the one-sentence beta.
const BetaVoice=((host)=>{
let view='tuning',practiceBase=null,practicePlan=null,source=null;
const icons={arrow:icon('arrow')},analysisJobs={has:id=>analyzing.has(id)};
const BALANCE_BASIS='tilt-corrected-band-rms-v1';
const VOICE_STATUS={quiet:'30cm를 유지하고 조금 더 크게 읽어주세요.',clipped:'조금 작고 편하게 읽어주세요.',short:'3초 이상 읽어주세요.',uncertain:'조용한 곳에서 다시 읽어주세요.'};
const adapt=r=>({...r,metrics:r?.voiceMetrics||null,pace:r?.voicePace||null});
function goalSettings(){const g=host.localGet('pilsa-beta-goal',{});return {kind:g.kind==='trust'?'trust':'friendly',hz:g.hz||voiceProfile?.targetHz||null};}
function goalMarkup(){return '';}
function localPut(key,value){host.localPut('pilsa-beta-goal',value);if(voiceProfile){voiceProfile.targetHz=value.hz;host.localPut('pilsa-voice-profile',voiceProfile);}}
function render(){if(view==='practice'){const r=source;host.newReading(r,'read',r);session.practice=structuredClone(practicePlan);session.targetPitch=practicePlan?.goal?.hz||null;host.render();}else host.render();}
function hz(value){return Number.isFinite(value)?Math.round(value).toLocaleString('ko-KR'):'—';}

function voiceNote(value){if(!Number.isFinite(value)||value<=0)return '';const midi=Math.round(69+12*Math.log2(value/440));return ['도','도♯','레','레♯','미','파','파♯','솔','솔♯','라','라♯','시'][(midi%12+12)%12]+(Math.floor(midi/12)-1);}

function voiceSummary(r){if(r?.metrics?.status==='ready')return hz(r.metrics.pitchMean)+' Hz'+(r.pace?.status==='ready'?' · '+r.pace.syllablesPerSecond.toFixed(1)+'음절/초':'');return analysisJobs.has(r?.id)?'분석 중':r?.metrics?'다시 확인':'녹음 분석';}
function pitchComparison(value){if(!Number.isFinite(value))return '';const rel=ref=>Math.abs(value-ref)<10?'비슷해요':value>ref?'높아요':'낮아요';return `남성 평균보다 ${rel(120.8)} · 여성 평균보다 ${rel(217.1)}`.replaceAll('보다 비슷해요','과 비슷해요');}

function pitchScale(m){const position=v=>Math.max(0,Math.min(100,Math.log2(Math.max(60,v)/60)/Math.log2(500/60)*100));return `<div class="pitch-scale" role="img" aria-label="목소리 높이: 나 ${hz(m.pitchMean)} Hz, 남성 참고 평균 121 Hz, 여성 참고 평균 217 Hz"><div class="pitch-track"><i class="pitch-own-range" style="left:${position(m.pitchRange.low)}%;width:${position(m.pitchRange.high)-position(m.pitchRange.low)}%"></i><b class="pitch-reference male" style="left:${position(120.8)}%"><span>남성<small>121 Hz</small></span></b><b class="pitch-reference female" style="left:${position(217.1)}%"><span>여성<small>217 Hz</small></span></b><b class="pitch-self" style="left:${position(m.pitchMean)}%"><span>나</span></b></div><div class="pitch-axis"><span>60 Hz</span><span>500 Hz</span></div></div><p class="pitch-range-copy">자주 낸 음 ${hz(m.pitchRange.low)}–${hz(m.pitchRange.high)} Hz</p>`;}

function paceMarkup(r){const p=r.pace,working=analysisJobs.has(r.id);if(p?.status==='offline')return '<div class="metric-title"><h3>말의 빠르기 · 울림</h3></div><p>정밀 분석에 연결하면 확인할 수 있어요.</p><button class="quiet-link" data-action="connect-analysis">연결하기</button>';if(p?.status==='ready'){return `<div class="metric-title"><h3>말의 빠르기</h3><strong>${p.syllablesPerSecond.toFixed(1)} <small>음절/초</small></strong></div><div class="pace-options"><span class="${p.pace==='slow'?'active':''}">천천히</span><span class="${p.pace==='within'?'active':''}">연습 범위</span><span class="${p.pace==='fast'?'active':''}">빠르게</span></div><p>${p.pace==='fast'?'문장 사이에 한 박자 쉬어보세요.':p.pace==='slow'?'뜻이 이어지는 말은 조금 더 연결해보세요.':'지금은 연습 범위 안이에요.'}</p><small>연습 기준 3–5음절/초 · 인식 오차가 있을 수 있어요</small><details class="voice-note"><summary>인식한 말</summary><p>${esc(p.transcript)}</p><small>${p.syllables}음절 / ${p.seconds.toFixed(1)}초 · 중간 쉼 포함</small></details>`;}
return `<div class="metric-title"><h3>말의 빠르기</h3><strong>—</strong></div><p>${working?'말을 인식하고 있어요. 먼저 들어도 좋아요.':p?.status==='unavailable'?'말 인식 모델을 불러오지 못했어요.':p?.status==='loading'?'말 인식 모델을 준비 중이에요.':p?.status==='busy'?'다른 녹음을 분석 중이에요. 잠시 후 다시 눌러주세요.':p?.status==='uncertain'?'인식한 말이 부족해 빠르기를 계산하지 않았어요.':'말의 빠르기를 다시 확인할 수 있어요.'}</p>${!working?`<button class="quiet-link" data-analyze="${esc(r.id)}" data-pace-only="true">빠르기 다시 확인</button>`:''}`;}
function voiceImage(m){
 const fs=m?.formants;if(!fs||fs.length<3||!fs.every(Number.isFinite)||!(fs[0]<fs[1]&&fs[1]<fs[2]))return {label:'울림을 더 살펴볼게요',copy:'다음 문장을 편하게 읽어주세요.'};
 // A provisional timbre description, not a personality or listener-impression classifier.
 const spread=(fs[2]-fs[0])/2;
 return spread<1100?{label:'묵직한 울림',copy:'낮고 넓은 울림으로 들릴 수 있어요.'}:spread>1450?{label:'밝은 울림',copy:'가볍고 밝은 울림으로 들릴 수 있어요.'}:{label:'담백한 울림',copy:'중간 톤의 담백한 울림으로 들릴 수 있어요.'};
}

function levelMarkup(m){const level=m?.level;if(!level)return '';const labels={soft:'조금 더 크게',usable:'잘 담겼어요',loud:'조금 더 편하게',clipped:'소리를 줄여주세요'};let guide=level.state==='soft'?'30cm 거리를 유지하고, 소리를 조금 더 크게 내보세요.':level.state==='clipped'||level.state==='loud'?'30cm 거리를 유지하고, 힘을 빼고 조금 작게 말해보세요.':level.span==='narrow'?'중요한 말을 조금 더 크게, 편하게 읽어보세요.':'지금 크기로 편하게 읽어주세요.';return `<div class="voice-metric"><div class="metric-title"><h3>소리 크기 · 강약</h3><span class="metric-word">${labels[level.state]||'확인 중'}</span></div>${level.span?`<div class="range-options"><span class="${level.span==='narrow'?'active':''}">강약이 작아요</span><span class="${level.span==='varied'?'active':''}">강약이 있어요</span></div>`:''}<p>${guide}</p><small>같은 30cm 거리에서 비교해요.</small></div>`;}

function stabilityLabel(m){if(Number.isFinite(m?.regularity))return m.regularity>=.92?'안정 쪽':m.regularity<.8?'흔들림 쪽':'중간';return !Number.isFinite(m?.hnr)?'—':m.hnr>18?'안정 쪽':m.hnr<11?'흔들림 쪽':'중간';}
function stabilityMarkup(m){const device=Number.isFinite(m?.regularity);if(!device&&!Number.isFinite(m?.hnr))return '';const position=Math.max(0,Math.min(100,device?(1-m.regularity)/.4*100:(25-m.hnr)/20*100)),label=stabilityLabel(m);return `<div class="voice-metric"><div class="metric-title"><h3>소리 안정감</h3><span class="metric-word">${label}</span></div><div class="stability-track" role="img" aria-label="소리 안정감: ${label}"><i style="left:${position}%"></i></div><div class="stability-labels"><span>안정</span><span>흔들림</span></div><small>소리 반복의 규칙성을 보는 연습용 표시예요.</small></div>`;}

function balanceMarkup(r){const b=r.metrics?.balance,working=analysisJobs.has(r.id),old=r.metrics?.version<3||b&&b.basis!==BALANCE_BASIS;let html='<div class="voice-metric"><div class="metric-title"><h3>저음 · 중음 · 고음</h3><small>보정된 대역 비중</small></div>';
 if(old)return html+`<p>${working?'새 기준으로 살펴보고 있어요.':r.analysisError?'분석에 연결하지 못했어요. 다시 눌러주세요.':'저음에 몰리던 계산 기준을 바꿨어요.'}</p>${working?'':`<button class="secondary" data-analyze="${esc(r.id)}" data-acoustic-only="true">새 기준으로 보기</button>`}</div>`;
 if(!b)return html+'<p>비율을 읽을 만큼 또렷한 구간이 부족해요.</p><small>같은 휴대폰·30cm 거리에서 다시 읽어주세요.</small></div>';
 html+=`<div class="balance-track" aria-hidden="true">${b.percent.map((v,i)=>`<i class="band-${i}" style="flex:${v}"></i>`).join('')}</div><div class="balance-labels">${['저음','중음','고음'].map((name,i)=>`<div><span>${name}</span><strong>${b.percent[i]}<small>%</small></strong><small>(${b.bandsHz[i][0].toLocaleString('ko-KR')}–${b.bandsHz[i][1].toLocaleString('ko-KR')} Hz)</small></div>`).join('')}</div><p>같은 휴대폰·30cm 거리에서 비교해요.</p><small>비교용 비중이에요. 세 수치를 같게 맞출 필요는 없어요.</small></div>`;return html;}

function voiceDetails(r){const m=r.metrics,ready=m?.status==='ready',working=analysisJobs.has(r.id);let content='';
 if(ready){const image=voiceImage(m);content=`${m.method==='device'?'<p class="tiny">기기 분석</p>':''}${m.formants?`<div class="voice-metric voice-image"><small>울림으로 본 참고 이미지</small><h3>${image.label}</h3><p>${image.copy}</p><small>읽은 모음과 녹음 환경에 따라 달라져요.</small></div>`:''}<div class="voice-metric"><div class="metric-title"><h3>목소리 높이</h3><strong>${hz(m.pitchMean)} <small>Hz · ${voiceNote(m.pitchMean)}</small></strong></div>${pitchScale(m)}<p>${pitchComparison(m.pitchMean)}</p><small>남성·여성 표시는 연구 평균 · 맞춰야 할 높이는 아니에요</small></div>${balanceMarkup(r)}${levelMarkup(m)}${stabilityMarkup(m)}<div class="voice-metric">${paceMarkup(r)}</div>`;}
 else content=`<div class="voice-metric"><p role="status">${working?'목소리를 분석하고 있어요.':m?VOICE_STATUS[m.status]||'분석을 다시 시도해 주세요.':r.analysisError?'분석에 연결하지 못했어요. 녹음은 그대로 남아 있어요.':'이 녹음의 높이와 음역대를 확인해요.'}</p>${!working?`<button class="secondary" data-analyze="${esc(r.id)}">${m?'다시 분석':'목소리 분석'}</button>`:''}</div>`;
 content+=goalMarkup(m);
 return content+`<button class="quiet-link method-link" data-action="voice-method">측정 기준</button>${r.unsaved?'<p class="storage-warning">분석 결과를 기기에 저장하지 못했어요. 음성은 내려받을 수 있어요.</p>':''}`;
}
function coachAdvice(r,goal=goalSettings()){
 const m=r.metrics,tips=[];const add=(finding,action)=>tips.push({finding,action});
 if(m?.status!=='ready')return [{finding:'목소리를 한 번 더 담아볼까요?',action:VOICE_STATUS[m?.status]||'같은 문장을 편하게 끝까지 읽어주세요.'}];
 if(m.level?.state==='soft')add('소리가 작게 담겼어요','30cm를 유지하고, 지금보다 조금 더 크게 읽어보세요.');
 else if(['clipped','loud'].includes(m.level?.state))add('소리가 크게 담겼어요','30cm를 유지하고, 조금 작고 편하게 읽어보세요.');
 if(r.pace?.status==='ready'&&r.pace.pace==='fast')add('말이 조금 빨라요','쉼표에서 한 박자 쉬고, 마지막 말까지 또렷하게.');
 else if(r.pace?.status==='ready'&&r.pace.pace==='slow')add('말이 조금 느려요','뜻이 이어지는 말은 한 덩어리로 읽어보세요.');
 if(goal.hz&&classifyPitch(m.pitchMean,goal.hz)!=='match')add(`정한 높이보다 ${m.pitchMean>goal.hz?'높아요':'낮아요'}`,`기준음 ${hz(goal.hz)} Hz를 듣고, 편한 만큼 ${m.pitchMean>goal.hz?'낮춰':'높여'} 읽어보세요.`);
 if((Number.isFinite(m.regularity)&&m.regularity<.8)||(Number.isFinite(m.hnr)&&m.hnr<11))add('소리가 고르지 않게 담겼어요','조용한 곳에서, 문장 끝까지 비슷한 크기로 읽어보세요.');
 if(m.level?.span==='narrow')add('소리 크기의 변화가 작아요','중요한 단어 하나를 골라 조금 더 힘을 실어보세요.');
 const b=m.balance;if(b?.basis===BALANCE_BASIS&&Math.max(...b.percent)>=60){const i=b.percent.indexOf(Math.max(...b.percent));add(`${['저음','중음','고음'][i]} 쪽 비중이 커요`,['가볍게 “음—” 하고, 말끝까지 또렷하게 읽어보세요.','중요한 단어에 표정을 담아, 높낮이를 조금 바꿔보세요.','첫 말을 조금 낮고 편하게 시작해보세요.'][i]);}
 if(!tips.length)add('지금 흐름을 유지해요','중요한 단어 하나에 뜻을 담아 다시 읽어보세요.');
 return tips.slice(0,2);
}
function deltaLabel(a,b,unit='',digits=0){if(!Number.isFinite(a)||!Number.isFinite(b))return '—';const d=Number((Number(b.toFixed(digits))-Number(a.toFixed(digits))).toFixed(digits));return d===0?'같음':`${d>0?'+':'−'}${Math.abs(d).toFixed(digits)}${unit}`;}

function comparisonRows(first,last){
 const sameEngine=(first.metrics?.comparisonKey||'praat-v3')===(last.metrics?.comparisonKey||'praat-v3');
 const a=first.metrics?.status==='ready'?first.metrics:null,b=last.metrics?.status==='ready'?last.metrics:null;
 const rows=[{label:'목소리 높이',a:a?hz(a.pitchMean)+' Hz':'—',b:b?hz(b.pitchMean)+' Hz':'—',change:sameEngine?deltaLabel(a?.pitchMean,b?.pitchMean,' Hz'):'기준 다름'}];
 const aBands=a?.balance?.basis===BALANCE_BASIS,bBands=b?.balance?.basis===BALANCE_BASIS,sameBasis=aBands&&bBands&&sameEngine;
 ['저음','중음','고음'].forEach((label,i)=>rows.push({label,band:i,a:aBands?a.balance.percent[i]+'%':'—',b:bBands?b.balance.percent[i]+'%':'—',change:sameBasis?deltaLabel(a.balance.percent[i],b.balance.percent[i],'%p'):'—'}));
 const stableA=stabilityLabel(a),stableB=stabilityLabel(b);
 rows.push({label:'안정감',a:stableA,b:stableB,change:!sameEngine||stableA==='—'||stableB==='—'?'—':stableA===stableB?'같음':stableB+'으로'});
 const paceA=first.pace?.status==='ready'?first.pace.syllablesPerSecond:null,paceB=last.pace?.status==='ready'?last.pace.syllablesPerSecond:null;
 rows.push({label:'빠르기',a:Number.isFinite(paceA)?paceA.toFixed(1):'—',b:Number.isFinite(paceB)?paceB.toFixed(1):'—',change:deltaLabel(paceA,paceB,'',1)});
 const levels={soft:'작게 담김',usable:'잘 담김',loud:'크게 담김',clipped:'소리 잘림'},la=levels[a?.level?.state]||'—',lb=levels[b?.level?.state]||'—';
 rows.push({label:'소리 크기',a:la,b:lb,change:la==='—'||lb==='—'?'—':la===lb?'같음':'달라짐'});
 return rows;
}
function classifyPitch(hz,target){if(!Number.isFinite(hz)||!Number.isFinite(target)||hz<=0||target<=0)return 'idle';const cents=1200*Math.log2(hz/target);return Math.abs(cents)<=200?'match':cents>0?'high':'low';}

function resetPitchFeedback(){const edge=$('pitch-edge');if(edge)edge.dataset.state='idle';const text=$('pitch-status');if(text)text.textContent='';}

function detectLivePitch(input,sampleRate){const step=Math.max(1,Math.floor(sampleRate/8000)),rate=sampleRate/step,n=Math.floor(input.length/step),x=new Float32Array(n);let mean=0,power=0;for(let i=0;i<n;i++){let sum=0;for(let j=0;j<step;j++)sum+=input[i*step+j];x[i]=sum/step;mean+=x[i];}mean/=n;for(let i=0;i<n;i++){x[i]-=mean;power+=x[i]*x[i];}if(Math.sqrt(power/n)<.006)return null;const lo=Math.floor(rate/800),hi=Math.ceil(rate/65),w=Math.min(384,n-hi-2);if(w<160)return null;const d=new Float32Array(hi+2);for(let t=1;t<=hi+1;t++){let sum=0;for(let j=0;j<w;j++){const a=x[j]-x[j+t];sum+=a*a;}d[t]=sum;}let run=0;d[0]=1;for(let t=1;t<=hi+1;t++){run+=d[t];d[t]=run?d[t]*t/run:1;}let best=-1;for(let t=lo;t<=hi;t++){if(d[t]<.15){while(t<hi&&d[t+1]<d[t])t++;best=t;break;}}if(best<0)return null;const a=d[best-1],b=d[best],z=d[best+1],den=a-2*b+z,hz=rate/(best+(den?.5*(a-z)/den:0));return hz>=65&&hz<=800?hz:null;}

// Short, optional practice between the two saved sentence recordings.
// No practice audio, camera frames, or face landmarks are stored.
let trainer=null, trainingDraft=null, trainerToneContext=null;
const TRAINER_TOLERANCE=50; // cents, sustained vowel only; speech keeps its natural intonation.
function trainerText(id,text){const el=$(id);if(el&&el.textContent!==text)el.textContent=text;}
function trainerStart(){stopTrainer();trainingDraft={target:goalSettings().hz||null,matchedSeconds:0,mouth:null};view='tuning';}
function trainerMarkup(){
 const d=trainingDraft||{},active=!!trainer?.stream,pending=!!trainer&&!active;
 if(view==='tuning')return `<section class="scene trainer-scene"><p class="eyebrow">01 / 02 · 짧은 연습</p><h1>음정 맞추기</h1><p class="trainer-caption">편하게 “아—”</p><div class="tuner-readout" aria-label="현재 음정"><strong id="tuner-hz">—</strong><span>Hz</span></div><div class="tuner-scale" role="img" aria-label="목표 높이를 가운데로 표시하는 음정 바늘"><div class="tuner-center"></div><i id="tuner-needle" hidden></i><span>낮게</span><b>목표</b><span>높게</span></div><p id="trainer-status" class="trainer-status" role="status">${d.message||'원하는 높이를 정해요'}</p><div class="trainer-goal"><label for="trainer-target">목표 <input id="trainer-target" type="number" inputmode="numeric" min="65" max="450" step="1" value="${d.target||''}" placeholder="Hz"> Hz</label><button class="quiet-link" data-action="trainer-tone">기준음 듣기</button></div>${!d.target&&practiceBase?.metrics?.pitchMedian?`<button class="quiet-link trainer-suggestion" data-action="trainer-use-first">처음 높이 ${Math.round(practiceBase.metrics.pitchMedian)} Hz 사용</button>`:''}<div class="trainer-progress" aria-label="목표에 맞춰 2초 유지"><i id="trainer-progress" style="width:${Math.min(100,(d.matchedSeconds||0)/2*100)}%"></i></div><div class="trainer-actions"><button class="primary" data-action="${active?'trainer-stop':'trainer-listen'}" ${pending?'disabled':''}>${active?'잠시 멈추기':pending?'마이크 준비 중':'음정 맞추기 시작'}</button><button class="secondary" data-action="trainer-next">다음 ${icons.arrow}</button></div><p class="tiny">휴대폰은 30cm 앞 · 편한 높이로</p><button class="quiet-link" data-action="trainer-skip">바로 다시 읽기</button><button class="quiet-link trainer-back" data-action="cancel-practice">돌아가기</button></section>`;
 return `<section class="scene trainer-scene mouth-scene"><p class="eyebrow">02 / 02 · 선택 연습</p><h1>입모양과 울림</h1><p class="trainer-caption">같은 “아—”, 조금 다른 울림</p><div class="mouth-camera" id="mouth-camera"><video id="mouth-video" playsinline muted autoplay aria-label="내 입모양 미리보기"></video><canvas id="mouth-overlay" aria-hidden="true"></canvas><div id="mouth-placeholder"><svg viewBox="0 0 120 100" aria-hidden="true"><path d="M20 50Q60 15 100 50Q60 88 20 50Z"/><ellipse cx="60" cy="50" rx="23" ry="16"/></svg><span>카메라는 선택이에요</span></div></div><p id="trainer-status" class="trainer-status" role="status">${d.message||'편한 “아—”로 시작해요'}</p><div id="mouth-controls" ${active?'':'hidden'}><button id="mouth-baseline" class="secondary" data-action="trainer-baseline" disabled>편한 소리 기준 담기</button><div id="mouth-target-wrap" hidden><label class="mouth-target" for="mouth-target">입 벌림 <input id="mouth-target" type="range" min="8" max="85" step="1" value="30"><span>편한 만큼</span></label><button class="quiet-link" data-action="trainer-reset-mouth">기준 다시 담기</button></div><div class="resonance-panel"><div class="resonance-title"><span>울림 변화</span><span id="resonance-status">같은 소리로 비교해요</span></div><div class="resonance-plot" role="img" aria-label="같은 아 소리의 두 울림 위치. 점 사이 거리는 개선 점수가 아닙니다"><i id="resonance-first" hidden></i><i id="resonance-now" hidden></i><span>처음</span><b>지금</b></div></div></div><div class="trainer-actions">${!active?`<button class="primary" data-action="trainer-camera" ${pending?'disabled':''}>${pending?'준비 중…':'카메라로 연습'}</button>`:''}<button class="${active?'primary':'secondary'}" data-action="trainer-skip">같은 문장 다시 읽기 ${icons.arrow}</button></div><p class="tiny">영상은 기기 안에서만 처리하고 저장하지 않아요.</p><button class="quiet-link trainer-back" data-action="trainer-back">음정으로 돌아가기</button></section>`;
}
function saveTrainerSummary(){if(!practicePlan||!trainingDraft)return;const d=trainingDraft;practicePlan.goal=goalSettings();practicePlan.tips=coachAdvice(practiceBase,practicePlan.goal);practicePlan.training={targetHz:d.target,matchedSeconds:Math.round(d.matchedSeconds*10)/10};if(d.mouth)practicePlan.training.mouth={vowel:'아',first:d.mouth.formants,last:d.lastFormants||null};}
function stopTrainer(){
 const r=trainer;trainer=null;
 if(trainerToneContext){const ac=trainerToneContext;trainerToneContext=null;ac.close().catch(()=>{});}
 if(r){clearInterval(r.timer);clearTimeout(r.timeout);clearTimeout(r.workerTimeout);r.controller?.abort();r.worker?.terminate();r.stream?.getTracks().forEach(t=>t.stop());r.nodes?.forEach(n=>{try{n.disconnect();}catch{}});r.ac?.close().catch(()=>{});if(r.video){r.video.pause();r.video.srcObject=null;}}
 Water.quiet();resetPitchFeedback();
}
function failTrainer(r,message){if(trainer!==r)return;stopTrainer();trainingDraft.message=message;render();}
function readTrainerTarget(){const input=$('trainer-target');if(!input?.reportValidity())return null;const hz=Number(input.value);if(!Number.isFinite(hz)||hz<65||hz>450){input.focus();toast('목표 높이를 65–450 Hz 사이로 정해주세요.');return null;}trainingDraft.target=hz;localPut('sq-voice-goal',{...goalSettings(),hz});return hz;}
async function trainerTone(){
 const target=readTrainerTarget();if(!target)return;
 stopTrainer();trainingDraft.message='기준음을 듣고 따라 해보세요';render();
 const ac=new (window.AudioContext||window.webkitAudioContext)();trainerToneContext=ac;
 try{await ac.resume();if(trainerToneContext!==ac)return;const osc=ac.createOscillator(),gain=ac.createGain(),now=ac.currentTime;osc.frequency.value=target;gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.07,now+.1);gain.gain.setValueAtTime(.07,now+.8);gain.gain.linearRampToValueAtTime(0,now+1);osc.connect(gain);gain.connect(ac.destination);osc.onended=()=>{if(trainerToneContext===ac)trainerToneContext=null;ac.close().catch(()=>{});};osc.start();osc.stop(now+1.05);}catch{if(trainerToneContext===ac)trainerToneContext=null;ac.close().catch(()=>{});toast('기준음을 다시 눌러주세요.');}
}
async function beginTrainer(kind){
 if(kind==='pitch'&&!readTrainerTarget())return;
 stopTrainer();const r={kind,nodes:[],history:[],hold:0,matched:false,lastSample:0,lastFace:0,face:null,resonance:null};trainer=r;trainingDraft.message=kind==='mouth'?'카메라와 마이크를 준비해요':'마이크를 준비해요';render();
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw Error('unsupported');
  r.ac=new (window.AudioContext||window.webkitAudioContext)({sampleRate:48000});await r.ac.resume();if(trainer!==r)return;
  const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:kind==='mouth'?{facingMode:'user',width:{ideal:640},height:{ideal:480},frameRate:{ideal:15,max:24}}:false});
  if(trainer!==r||document.hidden){stream.getTracks().forEach(t=>t.stop());if(trainer===r)stopTrainer();return;}
  r.stream=stream;await r.ac.resume();if(trainer!==r)return;
  const source=r.ac.createMediaStreamSource(stream),sink=r.ac.createGain();sink.gain.value=0;r.an=r.ac.createAnalyser();r.an.fftSize=4096;r.meter=new Float32Array(4096);source.connect(r.an);r.an.connect(sink);sink.connect(r.ac.destination);r.nodes=[source,r.an,sink];
  stream.getTracks().forEach(t=>t.addEventListener('ended',()=>failTrainer(r,'입력이 멈췄어요. 다시 시작할 수 있어요.')));
  trainingDraft.message=kind==='mouth'?'입모양을 준비하고 있어요':'“아—” 하고 소리 내보세요';render();
  if(kind==='mouth'){
   trainingDraft.mouth=null;trainingDraft.lastFormants=null;
   r.sample=r.ac.createAnalyser();r.sample.fftSize=32768;source.connect(r.sample);r.nodes.push(r.sample);r.samples=new Float32Array(r.sample.fftSize);
   r.video=$('mouth-video');r.video.srcObject=stream;await r.video.play();if(trainer!==r)return;
   $('mouth-placeholder').hidden=true;$('mouth-camera').style.aspectRatio=`${r.video.videoWidth} / ${r.video.videoHeight}`;
   r.worker=new Worker('mouth-worker.js');r.worker.onmessage=e=>receiveMouth(r,e.data);r.worker.onerror=()=>failTrainer(r,'입모양을 불러오지 못했어요. 다시 읽기로 이어갈 수 있어요.');r.worker.postMessage({type:'init'});
   r.workerTimeout=setTimeout(()=>failTrainer(r,'카메라 연습을 시작하지 못했어요. 다시 시도하거나 건너뛰세요.'),20000);
  }
  r.timer=setInterval(()=>tickTrainer(r),100);r.timeout=setTimeout(()=>failTrainer(r,'잠시 쉬었다 이어가세요.'),120000);
 }catch{failTrainer(r,kind==='mouth'?'카메라·마이크를 사용할 수 없어요. 건너뛰어도 괜찮아요.':'마이크를 사용할 수 없어요. 권한을 확인해주세요.');}
}
function pitchPracticeState(value,target){if(!Number.isFinite(value)||value<=0||!Number.isFinite(target)||target<=0)return {state:'idle',cents:0};const cents=1200*Math.log2(value/target);return {state:Math.abs(cents)<=TRAINER_TOLERANCE?'match':cents>0?'high':'low',cents};}
function tickTrainer(r){
 if(trainer!==r)return;r.an.getFloatTimeDomainData(r.meter);const rms=Math.sqrt(r.meter.reduce((s,x)=>s+x*x,0)/r.meter.length),clipped=r.meter.some(x=>Math.abs(x)>=.995);Water.voice(r,rms);
 const pitch=clipped?null:detectLivePitch(r.meter,r.ac.sampleRate);r.history=pitch?r.history.concat(pitch).slice(-5):[];const sorted=[...r.history].sort((a,b)=>a-b);r.pitch=sorted.length>=3?sorted[Math.floor(sorted.length/2)]:null;
 if(r.kind==='pitch'){
  const result=pitchPracticeState(r.pitch,trainingDraft.target),needle=$('tuner-needle'),edge=$('pitch-edge');if(needle){needle.hidden=result.state==='idle';needle.style.left=`${50+Math.max(-1,Math.min(1,result.cents/300))*48}%`;}
  if(edge){edge.dataset.state=result.state==='idle'?'idle':result.state==='match'?'match':'outside';edge.style.setProperty('--pitch-power',Math.min(1,Math.max(.4,rms*12)));}
  trainerText('tuner-hz',r.pitch?Math.round(r.pitch):'—');r.hold=result.state==='match'?r.hold+.1:0;trainingDraft.matchedSeconds=Math.max(trainingDraft.matchedSeconds,Math.min(2,r.hold));if(r.hold>=2)r.matched=true;
  $('trainer-progress').style.width=`${Math.min(100,r.hold/2*100)}%`;
  trainerText('trainer-status',result.state==='idle'?'“아—” 하고 소리 내보세요':result.state==='match'?(r.matched?'맞았어요 · 편하게 유지해요':'맞아요'):result.state==='high'?'조금 낮춰보세요':'조금 높여보세요');
 }else{
  const now=performance.now();if(r.ready&&!r.framePending&&now-r.lastFace>=180)sendMouthFrame(r,now);
  if(now-r.faceAt>800){r.face=null;r.resonance=null;}
  if(!r.pitch){r.resonance=null;updateMouthUI(r);}
  if(r.pitch&&r.face&&!r.controller&&now-r.lastSample>=650)sampleResonance(r,now);
 }
}
async function sendMouthFrame(r,time){r.framePending=true;r.lastFace=time;let bitmap;try{bitmap=await createImageBitmap(r.video);if(trainer!==r){bitmap.close();return;}r.worker.postMessage({type:'frame',bitmap,time},[bitmap]);r.workerTimeout=setTimeout(()=>failTrainer(r,'입모양 인식이 멈췄어요. 다시 시도해주세요.'),5000);}catch{bitmap?.close();failTrainer(r,'이 브라우저에서는 카메라 연습이 어려워요. 다시 읽기로 이어가세요.');}}
function mouthGeometry(points,width,height){
 if(!points)return null;const p=i=>({x:points[i].x*width,y:points[i].y*height}),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const left=p(61),right=p(291),top=p(13),bottom=p(14),eyeL=p(33),eyeR=p(263),nose=p(1),w=dist(left,right),eyes=dist(eyeL,eyeR);
 if(w<width*.05||eyes<width*.15||Math.abs(eyeL.y-eyeR.y)/eyes>.22||Math.abs(dist(nose,eyeL)-dist(nose,eyeR))/eyes>.3)return null;
 return {ratio:dist(top,bottom)/w,open:dist(top,bottom)/eyes,width:w,x:(top.x+bottom.x)/2,y:(top.y+bottom.y)/2,angle:Math.atan2(right.y-left.y,right.x-left.x)};
}
function receiveMouth(r,data){
 if(trainer!==r)return;clearTimeout(r.workerTimeout);
 if(data.type==='error'){console.warn('Mouth model:',data.message);failTrainer(r,'입모양 인식을 준비하지 못했어요. 다시 읽기로 이어가세요.');return;}
 if(data.type==='ready'){r.ready=true;return;}
 if(data.type!=='face')return;r.framePending=false;r.faceAt=performance.now();r.face=mouthGeometry(data.points,r.video.videoWidth,r.video.videoHeight);if(!r.face)r.resonance=null;
 const canvas=$('mouth-overlay');if(canvas){canvas.width=r.video.videoWidth;canvas.height=r.video.videoHeight;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);if(r.face){const f=r.face,target=trainingDraft.mouth?.target,match=target&&Math.abs(f.ratio-target)<=Math.max(.035,target*.12);ctx.strokeStyle=match?'#61efbb':'#ffffffb0';ctx.lineWidth=2;ctx.setLineDash([5,5]);ctx.beginPath();ctx.ellipse(f.x,f.y,f.width*.5,f.width*(target||Math.max(.1,f.ratio))*.5,f.angle,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.strokeStyle='#65d1eb';ctx.lineWidth=2;ctx.beginPath();[78,191,81,82,13,312,311,415,308,324,318,402,317,14,87,178,88,95,78].filter(i=>data.points[i]).forEach((i,n)=>{const p=data.points[i];n?ctx.lineTo(p.x*canvas.width,p.y*canvas.height):ctx.moveTo(p.x*canvas.width,p.y*canvas.height);});ctx.closePath();ctx.stroke();}}
 updateMouthUI(r);
}
async function sampleResonance(r,time){
 r.lastSample=time;r.sample.getFloatTimeDomainData(r.samples);const x=r.samples.slice(-Math.round(r.ac.sampleRate*.65)),pcm=resample(x,r.ac.sampleRate,24000),controller=new AbortController();r.controller=controller;const timeout=setTimeout(()=>controller.abort(),5000);
 try{const response=await fetch('/api/resonance',{method:'POST',headers:{'Content-Type':'audio/wav'},body:wavBlob(pcm),signal:controller.signal});if(!response.ok)throw Error('resonance');const result=await response.json();if(trainer!==r)return;r.serverError=false;r.resonance=result.status==='ready'&&Array.isArray(result.formants)&&result.formants.length===3&&result.formants.every(Number.isFinite)&&r.face&&r.pitch?result:null;if(r.resonance&&trainingDraft.mouth){trainingDraft.lastFormants=result.formants;}updateMouthUI(r);
 }catch{if(trainer===r){r.resonance=null;r.serverError=true;updateMouthUI(r);}}finally{clearTimeout(timeout);if(r.controller===controller)r.controller=null;}
}
function formantPosition(fs){return {x:Math.max(4,Math.min(96,(fs[1]-500)/2500*100)),y:Math.max(4,Math.min(96,100-(fs[0]-150)/1250*100))};}
function updateMouthUI(r){
 if(trainer!==r)return;const d=trainingDraft,button=$('mouth-baseline');if(button){button.hidden=!!d.mouth;button.disabled=!r.face||!r.resonance||!r.pitch;}
 if(!r.face)trainerText('trainer-status',r.ready?'얼굴을 정면으로 보여주세요':'입모양을 준비하고 있어요');
 else if(!d.mouth)trainerText('trainer-status',r.resonance?'편하다면 기준을 담아주세요':'같은 “아—”를 잠깐 이어주세요');
 else {const difference=r.face.ratio-d.mouth.target,match=Math.abs(difference)<=Math.max(.035,d.mouth.target*.12);trainerText('trainer-status',match?'정한 입모양에 맞아요':difference<0?'편한 만큼 조금 더 열어보세요':'조금 덜 열어보세요');}
 const now=$('resonance-now');if(now){now.hidden=!r.resonance;if(r.resonance){const p=formantPosition(r.resonance.formants);now.style.left=p.x+'%';now.style.top=p.y+'%';}}
 trainerText('resonance-status',r.serverError?'울림 연결을 확인해주세요':!r.resonance?'같은 “아—”를 이어주세요':d.mouth?'빈 점은 처음 · 빛나는 점은 지금':'기준을 담으면 비교해요');
}
function captureMouthBaseline(){const r=trainer;if(r?.kind!=='mouth'||!r.face||!r.resonance||!r.pitch)return;const ratio=r.face.ratio;trainingDraft.mouth={formants:[...r.resonance.formants],target:Math.min(.85,Math.max(.08,ratio*1.15))};trainingDraft.lastFormants=null;
 const target=$('mouth-target');target.value=Math.round(trainingDraft.mouth.target*100);trainingDraft.mouth.target=Number(target.value)/100;$('mouth-target-wrap').hidden=false;const p=formantPosition(trainingDraft.mouth.formants),dot=$('resonance-first');dot.hidden=false;dot.style.left=p.x+'%';dot.style.top=p.y+'%';updateMouthUI(r);
}
async function handleTrainerAction(action){
 if(action==='trainer-listen')await beginTrainer('pitch');
 else if(action==='trainer-camera')await beginTrainer('mouth');
 else if(action==='trainer-tone')await trainerTone();
 else if(action==='trainer-use-first'){const n=Math.round(practiceBase?.metrics?.pitchMedian);if(n>=65&&n<=450){trainingDraft.target=n;render();}}
 else if(action==='trainer-stop'){stopTrainer();trainingDraft.message='이어서 연습하거나 다음으로';render();}
 else if(action==='trainer-next'||action==='trainer-back'){saveTrainerSummary();stopTrainer();trainingDraft.message='';view=action==='trainer-next'?'mouth':'tuning';render();window.scrollTo({top:0,behavior:'instant'});$('main').focus({preventScroll:true});}
 else if(action==='trainer-skip'){saveTrainerSummary();stopTrainer();view='practice';render();window.scrollTo({top:0,behavior:'instant'});$('main').focus({preventScroll:true});}
 else if(action==='trainer-baseline')captureMouthBaseline();
 else if(action==='trainer-reset-mouth'){trainingDraft.mouth=null;trainingDraft.lastFormants=null;$('mouth-target-wrap').hidden=true;$('resonance-first').hidden=true;if(trainer)updateMouthUI(trainer);}
}

function details(r){return '<div class="beta-voice">'+voiceDetails(adapt(r))+'</div>';}
function comparison(a,b){const rows=comparisonRows(adapt(a),adapt(b));return `<section class="practice-card beta-voice"><h2>다시 읽고 달라진 점</h2><table class="comparison-table"><thead><tr><th>항목</th><th>처음</th><th>다시</th><th>변화</th></tr></thead><tbody>${rows.map(x=>`<tr><th scope="row">${x.label}</th><td>${esc(x.a)}</td><td class="after-value">${esc(x.b)}</td><td>${esc(x.change)}</td></tr>`).join('')}</tbody></table><p class="small muted">같은 휴대폰 · 30cm에서 비교해요.<br>빠르기: 음절/초 · 비율 차이: %p</p></section>`;}
function advice(r){return `<div class="beta-voice"><ol class="coach-tips">${coachAdvice(adapt(r)).map(x=>`<li><strong>${esc(x.finding)}</strong><p>${esc(x.action)}</p></li>`).join('')}</ol></div>`;}
function start(r){if(!r||recording||starting)return;source=r;practiceBase=adapt(r);practicePlan={baselineId:r.id,goal:goalSettings(),tips:coachAdvice(practiceBase)};trainerStart();host.go('practice');}
function bind(){const target=$('trainer-target');target?.addEventListener('input',()=>{stopTrainer();trainingDraft.target=null;trainingDraft.matchedSeconds=0;trainerText('tuner-hz','—');trainerText('trainer-status','새 목표로 다시 시작해요');const b=document.querySelector('[data-action=trainer-stop],[data-action=trainer-listen]');if(b){b.disabled=false;b.dataset.action='trainer-listen';b.textContent='음정 맞추기 시작';}const n=$('tuner-needle');if(n)n.hidden=true;const p=$('trainer-progress');if(p)p.style.width='0%';});$('mouth-target')?.addEventListener('input',e=>{if(trainingDraft?.mouth)trainingDraft.mouth.target=Number(e.target.value)/100;});}
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b||b.disabled)return;const action=b.dataset.action;if(action?.startsWith('trainer-')){e.stopImmediatePropagation();await handleTrainerAction(action);}else if(action==='cancel-practice'){e.stopImmediatePropagation();stopTrainer();host.go('result');}else if(b.dataset.analyze){e.stopImmediatePropagation();const r=records.find(x=>x.id===b.dataset.analyze);if(r)analyzeRecord(r);}else if(action==='voice-method'){e.stopImmediatePropagation();showDialog('측정 기준','높이는 기본주파수(F0), 저음·중음·고음은 기울기를 보정한 대역 비중이에요. 안정감은 소리의 규칙성을 참고해요. 신체 위치나 건강 상태를 진단하는 값은 아니에요. 남녀 표시는 낭독 연구의 참고 평균이에요.','확인');}},true);
function suspend(){if(trainer){stopTrainer();if(trainingDraft)trainingDraft.message='다시 시작할 수 있어요';host.render();}}
window.addEventListener('pagehide',()=>stopTrainer());document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();});
return {get active(){return !!trainer?.stream;},details,comparison,advice,start,markup:trainerMarkup,bind,stop:stopTrainer,summary:r=>voiceSummary(adapt(r)),pitch:detectLivePitch,feedback:classifyPitch,reset:resetPitchFeedback};
})({render,go,localGet,localPut,newReading});
