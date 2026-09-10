/** Reference-library UI. Analysis, persistence and personal tuning belong to the host. */
const LAYERS = [
  { key: 'nas', name: '상인두', vowel: '에', color: '#bca2ff' },
  { key: 'oro', name: '중인두', vowel: '아', color: '#eac580' },
  { key: 'aes', name: '하인두', vowel: '으', color: '#70d8c8' },
  { key: 'src', name: '성문', vowel: '하', color: '#ef9bc5' },
];
const MAX_BYTES = 150 * 1024 * 1024;
const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const noteName = midi => `${NOTE_NAMES[((Math.round(midi) % 12) + 12) % 12]}${Math.floor(Math.round(midi) / 12) - 1}`;
const numeric = value => value !== null && value !== '' && Number.isFinite(Number(value));
const asText = value => value == null ? '' : String(value);

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content != null) node.textContent = String(content);
  return node;
}

function observedMidis(source) {
  if (!source) return [];
  const candidates = source.measuredMidi || source.observedMidi || source.midiNotes || source.coverage?.notes || source.coverage?.midis;
  if (Array.isArray(candidates)) return candidates.filter(numeric).map(Number);
  const bins = source.bins || source.pitchBins || source;
  if (Array.isArray(bins)) return bins.map(bin => typeof bin === 'number' ? bin : bin?.midi ?? bin?.note).filter(numeric).map(Number);
  if (bins && typeof bins === 'object') return Object.entries(bins).filter(([key, value]) => numeric(key) && value && (!numeric(value.count) || Number(value.count) > 0)).map(([key]) => Number(key));
  return [];
}

function summaryText(observation) {
  const quality = observation.quality || {};
  const notes = [...new Set(observedMidis(observation))].sort((a, b) => a - b);
  const parts = [notes.length ? `${noteName(notes[0])}–${noteName(notes.at(-1))} · ${notes.length}개 음` : '유효 음정 확인 중'];
  const frames = quality.acceptedFrames ?? quality.validFrames ?? observation.acceptedFrames;
  if (numeric(frames)) parts.push(`유효 프레임 ${Number(frames).toLocaleString('ko-KR')}`);
  if (observation.usable === false) parts.push(asText(quality.reason || observation.reason || quality.warnings?.[0] || '품질 기준 미충족'));
  return parts.join(' · ');
}

function formatDate(value) {
  if (!value) return '날짜 없음';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '날짜 확인 필요';
  return date.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * getSnapshot: {profileId,name,observations,model,mode,suppressCommon,status}
 * onRemove({id}) toggles exclusion. It must preserve the source recording.
 * onCancel cancels/invalidates host work when closing or cancelling analysis.
 */
export function mountCalibrationLibrary({ getSnapshot, onImport, onApply, onRemove, onError = () => {}, isBusy = () => false, onCancel } = {}) {
  if (typeof getSnapshot !== 'function') throw new TypeError('개인 튜닝 상태를 읽을 수 없습니다.');
  const dialog = el('dialog', 'cl-dialog');
  dialog.id = 'calibrationLibraryDialog';
  dialog.setAttribute('aria-labelledby', 'clTitle');
  dialog.setAttribute('aria-describedby', 'clIntro');
  dialog.innerHTML = `
    <header class="cl-header">
      <div><p class="cl-eyebrow">TOUCHINGVOICE · PERSONAL TUNING</p><h2 id="clTitle">음역을 쌓아, 내 목소리에 맞추기</h2></div>
      <div class="cl-header-actions"><div class="cl-member"><span>튜닝 대상</span><strong id="clMember">학생 확인 중</strong></div><button type="button" class="cl-button cl-close" id="clClose" aria-label="음역별 개인 튜닝 닫기">닫기 <span aria-hidden="true">×</span></button></div>
    </header>
    <div class="cl-content">
      <p id="clIntro" class="cl-intro">풀 스케일 음성 파일로 넓은 음역을 등록하고, 짧은 5음 측정으로 반응을 미세 조정하세요. 같은 사람의 측정은 음정별로 겹쳐 쌓입니다.<span>에 · 아 · 으 · 하는 지도사가 확인하는 과제 구분입니다. 음향 반응을 개인화하며, 각 기관을 분리 측정하거나 발달 정도를 진단하지 않습니다.</span></p>
      <div class="cl-overview" aria-label="누적 튜닝 현황"><div><span>누적된 원음 기록</span><strong id="clTotalCount">0<small>개</small></strong></div><div><span>현재 반응에 적용한 기록</span><strong id="clUsableCount">0<small>개</small></strong></div><p>같은 원음을 다시 넣어도 중복 학습하지 않습니다.<br>측정하지 않은 음은 빈칸으로 남깁니다.</p></div>
      <div class="cl-section-head"><div><p class="cl-eyebrow">01 · FULL SCALE REFERENCES</p><h3>영역별 풀 스케일 파일</h3></div><p>반주 없는 목소리 · 같은 마이크와 거리<br>WAV · MP3 · M4A 등 / 파일당 최대 150 MB</p></div>
      <div id="clCards" class="cl-cards"></div>
      <section class="cl-mode-section" aria-labelledby="clModeTitle"><div class="cl-section-head"><div><p class="cl-eyebrow">02 · RESPONSE BASELINE</p><h3 id="clModeTitle">100%의 기준을 정하는 방법</h3></div></div>
        <div class="cl-modes" role="radiogroup" aria-label="개인 튜닝 기준 모드">
          <label class="cl-mode"><input type="radio" name="clMode" value="adaptive"><span><strong>누적 적응</strong><small>측정을 쌓으며 최근의 목소리에 맞춰 반응 기준을 갱신합니다.</small></span><em>추천</em></label>
          <label class="cl-mode"><input type="radio" name="clMode" value="fixed"><span><strong>기준 고정</strong><small>각 음정의 첫 유효 기록을 기준으로 유지해 이후 반응을 비교합니다.</small></span></label>
          <label class="cl-mode"><input type="radio" name="clMode" value="off"><span><strong>수동 튜닝 사용</strong><small>누적 기록은 보관하고 영역별 수동 설정으로 반응합니다.</small></span></label>
        </div>
        <p class="cl-baseline-note">화면의 100%는 각 녹음의 반응값(P90)을 모아 정한 기준입니다. 발성 능력의 최대치나 건강 점수가 아닙니다. 기준을 바꾸면 화면의 백분율도 달라질 수 있습니다.</p>
        <label class="cl-experiment"><input id="clSuppressCommon" type="checkbox"><span><strong>공통 특징 영향 줄이기 <em>실험</em></strong><small>같은 음정의 네 과제를 비교해 공통 특징의 비중을 낮춥니다. 소리의 발생 기관을 물리적으로 분리하는 기능은 아니며, 비교할 데이터가 부족하면 기본 반응을 사용합니다.</small></span></label>
      </section>
      <section class="cl-history-section" aria-labelledby="clHistoryTitle"><div class="cl-section-head"><div><p class="cl-eyebrow">03 · MEASUREMENT HISTORY</p><h3 id="clHistoryTitle">누적 기록</h3></div><label class="cl-show-excluded"><input id="clShowExcluded" type="checkbox" checked>제외한 기록도 보기</label></div><p class="cl-history-hint">잘못 분류했거나 조건이 달랐던 녹음은 반영에서 제외할 수 있습니다. 원음과 검사 기록은 유지됩니다.</p><div id="clHistory" class="cl-history"></div></section>
    </div>
    <footer class="cl-footer"><div class="cl-footer-copy"><strong id="clFooterTitle">한 사람의 음역별 반응을 함께 쌓습니다.</strong><p id="clStatus" role="status" aria-live="polite">파일을 등록하거나 기존 측정 기록을 확인하세요.</p></div><div class="cl-footer-actions"><button type="button" class="cl-button cl-secondary" id="clCancel" hidden>분석 취소</button><button type="button" class="cl-button cl-primary" id="clApply">개인 튜닝에 반영</button></div></footer>`;
  document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector);
  const cards = new Map();
  let localBusy = false;
  let activeOperation = 0;
  let profileId = null;
  let changedMode = false;
  let returnFocus = null;
  let localMessage = '';
  let localError = false;
  let lastHistoryKey = '';
  let lastRenderKey = '';
  const hostBusy = () => localBusy || Boolean(typeof isBusy === 'function' ? isBusy() : isBusy);
  const snapshot = () => getSnapshot() || {};

  function setStatus(message, error = false) {
    localMessage = asText(message);
    localError = error;
    $('#clStatus').textContent = localMessage;
    $('#clStatus').classList.toggle('cl-error', error);
  }

  function report(error) {
    const message = error?.message || '작업을 완료하지 못했습니다. 다시 시도해 주세요.';
    setStatus(message, true);
    onError(error instanceof Error ? error : new Error(message));
  }

  function selectedFiles(card) {
    return Array.from(card.file.files || []);
  }

  async function importFiles(layer, card) {
    if (hostBusy()) return;
    const files = selectedFiles(card);
    if (!files.length || !card.confirm.checked) return;
    const tooLarge = files.find(file => file.size > MAX_BYTES);
    if (tooLarge) return report(new Error(`${tooLarge.name}: 파일당 150 MB 이하로 나누어 등록해 주세요.`));
    const empty = files.find(file => !file.size);
    if (empty) return report(new Error(`${empty.name}: 비어 있는 파일입니다.`));
    if (typeof onImport !== 'function') return report(new Error('파일 분석 기능이 아직 연결되지 않았습니다.'));
    const operation = ++activeOperation;
    localBusy = true;
    setStatus(`${layer.name} ‘${layer.vowel}’ ${files.length}개 파일을 분석하고 있습니다.`);
    refresh();
    try {
      await onImport({ layerKey: layer.key, files, confirmed: true });
      if (operation !== activeOperation) return;
      card.file.value = '';
      card.confirm.checked = false;
      card.selection.textContent = '파일을 여러 개 선택할 수 있습니다.';
      setStatus('분석 기록을 확인한 뒤 개인 튜닝에 반영하세요.');
    } catch (error) {
      if (operation === activeOperation) report(error);
    } finally {
      if (operation === activeOperation) { localBusy = false; refresh(); }
    }
  }

  for (const layer of LAYERS) {
    const card = el('section', 'cl-card');
    card.style.setProperty('--cl-layer', layer.color);
    card.setAttribute('aria-labelledby', `clLayer-${layer.key}`);
    card.innerHTML = `<div class="cl-card-title"><div><span class="cl-layer-dot" aria-hidden="true"></span><h4 id="clLayer-${layer.key}">${layer.name}</h4><span class="cl-vowel">${layer.vowel}</span></div><span class="cl-count">0개 적용</span></div><p class="cl-coverage-summary">아직 등록한 음역이 없습니다.</p><div class="cl-note-grid" aria-label="${layer.name} 측정한 음정"></div><div class="cl-note-legend"><span><i></i>적용 중</span><span><i class="cl-pending-key"></i>적용 대기</span><span><i class="cl-gap"></i>미측정</span></div><p class="cl-reference-value"></p><label class="cl-file-label"><span class="cl-upload-icon" aria-hidden="true">＋</span><span>${layer.name} ‘${layer.vowel}’ 파일 선택</span><input type="file" multiple accept="audio/*,.wav,.mp3,.m4a,.aac,.flac,.ogg,.webm,.aiff,.aif" aria-label="${layer.name} ${layer.vowel} 풀 스케일 파일"></label><p class="cl-file-selection">파일을 여러 개 선택할 수 있습니다.</p><label class="cl-confirm"><input type="checkbox"><span>지도사가 이 파일의 ‘${layer.vowel}’ 발음을 확인했습니다.</span></label><button type="button" class="cl-button cl-import" disabled>${layer.name} 파일 분석·누적</button>`;
    $('#clCards').append(card);
    const entry = {
      element: card,
      file: card.querySelector('input[type="file"]'),
      confirm: card.querySelector('input[type="checkbox"]'),
      selection: card.querySelector('.cl-file-selection'),
      button: card.querySelector('.cl-import'),
      count: card.querySelector('.cl-count'),
      coverage: card.querySelector('.cl-coverage-summary'),
      grid: card.querySelector('.cl-note-grid'),
      reference: card.querySelector('.cl-reference-value'),
      selectedMidi: null,
    };
    entry.confirm.setAttribute('aria-label', `${layer.name} ${layer.vowel} 발음 지도사 확인`);
    entry.file.addEventListener('change', () => {
      entry.confirm.checked = false;
      const files = selectedFiles(entry);
      entry.selection.textContent = files.length ? files.map(file => `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`).join(' · ') : '파일을 여러 개 선택할 수 있습니다.';
      const tooLarge = files.find(file => file.size > MAX_BYTES);
      if (tooLarge) setStatus(`${tooLarge.name}: 파일당 150 MB 이하로 나누어 등록해 주세요.`, true);
      refreshControls();
    });
    entry.confirm.addEventListener('change', refreshControls);
    entry.button.addEventListener('click', () => importFiles(layer, entry));
    cards.set(layer.key, entry);
  }

  function refreshControls(state = snapshot()) {
    // Event callbacks pass an Event argument; use a fresh state only in that case.
    if (!state || typeof state.profileId === 'undefined') state = snapshot();
    const busy = hostBusy();
    for (const card of cards.values()) {
      card.file.disabled = busy;
      card.confirm.disabled = busy;
      const files = selectedFiles(card);
      card.button.disabled = busy || !files.length || !card.confirm.checked || files.some(file => file.size > MAX_BYTES || !file.size);
      card.element.classList.toggle('cl-card-selected', files.length > 0);
    }
    for (const input of dialog.querySelectorAll('input[name="clMode"], #clSuppressCommon, .cl-history-toggle')) input.disabled = busy;
    $('#clApply').disabled = busy || !state.profileId;
    $('#clCancel').hidden = !busy || typeof onCancel !== 'function';
    $('#clApply').textContent = busy ? '처리 중…' : '개인 튜닝에 반영';
    dialog.setAttribute('aria-busy', String(busy));
  }

  function renderCoverage(layer, observations, model) {
    const card = cards.get(layer.key);
    const valid = observations.filter(item => item.layerKey === layer.key && item.confirmed !== false && item.usable !== false && !item.excluded);
    const layerModel = model?.layers?.[layer.key] || model?.[layer.key];
    const modelBins = Array.isArray(layerModel?.bins) ? layerModel.bins : [];
    const enabled = model && model.mode !== 'off';
    const modelSourceIds = new Set((enabled ? model.sources || [] : []).filter(source => source.layerKey === layer.key).map(source => source.id));
    const pending = valid.filter(item => !modelSourceIds.has(item.id));
    const appliedNotes = new Set(enabled ? observedMidis(layerModel).map(Math.round) : []);
    const pendingNotes = new Set(pending.flatMap(observedMidis).map(Math.round));
    card.count.textContent = `${modelSourceIds.size}개 적용${pending.length ? ` · ${pending.length}개 대기` : ''}`;
    const notes = [...new Set([...appliedNotes, ...pendingNotes].filter(midi => midi >= 0 && midi <= 127))].sort((a, b) => a - b);
    if (!notes.includes(card.selectedMidi)) card.selectedMidi = notes[0] ?? null;
    const updateReference = () => {
      const bin = modelBins.find(item => item.midi === card.selectedMidi);
      const baseline = bin?.baseline?.[layerModel?.feature]?.p90;
      const current = bin?.current?.[layerModel?.feature]?.p90;
      const selectedStats = model?.mode === 'fixed' ? bin?.baseline?.[layerModel?.feature] : bin?.current?.[layerModel?.feature];
      const limitedSpread = selectedStats && selectedStats.p90 - selectedStats.p10 < .5;
      card.reference.textContent = numeric(baseline) && numeric(current) && enabled
        ? `${noteName(card.selectedMidi)} · 첫 기준 ${Number(baseline).toFixed(2)} dB / 누적 기준 ${Number(current).toFixed(2)} dB${limitedSpread ? ' · 변화 폭 부족 · 수동 범위 사용' : ' · 화면 100% 기준'}`
        : pendingNotes.has(card.selectedMidi) ? `${noteName(card.selectedMidi)} 등록·적용 대기 · 개인 튜닝에 반영하면 이 음의 기준을 계산합니다.`
        : '측정한 음정을 선택하면 그 음의 반응 기준을 확인할 수 있습니다.';
      for (const button of card.grid.querySelectorAll('button[data-midi]')) button.setAttribute('aria-pressed', String(Number(button.dataset.midi) === card.selectedMidi));
    };
    card.grid.replaceChildren();
    if (notes.length) {
      const first = notes[0];
      const last = notes.at(-1);
      const measured = new Set(notes);
      const missing = [];
      for (let midi = first; midi <= last; midi++) {
        const applied = appliedNotes.has(midi);
        const cell = el(measured.has(midi) ? 'button' : 'span', measured.has(midi) ? `cl-note ${applied ? 'measured' : 'pending'}` : 'cl-note', noteName(midi));
        cell.title = `${noteName(midi)} · ${applied ? `적용 중${pendingNotes.has(midi) ? ' · 추가 기록 적용 대기' : ''}` : pendingNotes.has(midi) ? '등록·적용 대기' : '미측정'}`;
        cell.setAttribute('aria-label', `${layer.name} ${cell.title}${measured.has(midi) ? ' 반응 기준 확인' : ''}`);
        if (measured.has(midi)) {
          cell.type = 'button';
          cell.dataset.midi = String(midi);
          cell.addEventListener('click', () => { card.selectedMidi = midi; updateReference(); });
        }
        card.grid.append(cell);
        if (!measured.has(midi)) missing.push(noteName(midi));
      }
      card.coverage.textContent = `${noteName(first)}–${noteName(last)} · 적용 ${appliedNotes.size}개 음${pendingNotes.size ? ` · 추가 기록 ${pendingNotes.size}개 음` : ''}${missing.length ? ` · 중간 미측정 ${missing.length}개 음` : ''}`;
      card.grid.setAttribute('aria-label', `${layer.name} 측정 음역. ${missing.length ? `미측정 음: ${missing.join(', ')}` : '표시된 구간의 모든 반음에 측정 기록이 있습니다.'}`);
    } else {
      card.coverage.textContent = '아직 반영할 음역이 없습니다.';
      card.grid.append(el('span', 'cl-empty-notes', '음성 파일을 등록하면 측정한 음이 표시됩니다.'));
    }
    updateReference();
  }

  function renderHistory(observations) {
    const showExcluded = $('#clShowExcluded').checked;
    const items = observations.filter(item => showExcluded || !item.excluded).slice().sort((a, b) => asText(b.createdAt).localeCompare(asText(a.createdAt)));
    const historyKey = JSON.stringify(items.map(item => [item.id, item.excluded, item.fileName, item.confirmed, item.usable, item.createdAt, summaryText(item)]));
    if (lastHistoryKey === historyKey) return;
    lastHistoryKey = historyKey;
    const target = $('#clHistory');
    target.replaceChildren();
    if (!items.length) {
      target.append(el('div', 'cl-empty-history', observations.length ? '표시할 기록이 없습니다. 제외한 기록도 보기를 선택해 주세요.' : '아직 누적 기록이 없습니다. 풀 스케일 파일이나 5음 미세 튜닝으로 시작하세요.'));
      return;
    }
    for (const item of items) {
      const layer = LAYERS.find(entry => entry.key === item.layerKey);
      const row = el('article', `cl-history-row${item.excluded ? ' excluded' : ''}`);
      const body = el('div', 'cl-history-body');
      const heading = el('div', 'cl-history-heading');
      const badge = el('span', 'cl-history-layer', layer ? `${layer.name} · ${layer.vowel}` : '영역 미지정');
      if (layer) badge.style.setProperty('--cl-layer', layer.color);
      heading.append(badge, el('strong', '', item.fileName || (item.sourceKind === 'guided' ? '5음 미세 튜닝' : '음성 측정 기록')));
      body.append(heading, el('p', '', summaryText(item)), el('small', '', `${formatDate(item.createdAt)} · ${item.excluded ? '반영 제외' : item.usable === false ? '품질 기준 미충족' : item.confirmed === false ? '지도사 확인 필요' : '반영 대상'}`));
      const toggle = el('button', 'cl-button cl-history-toggle', item.excluded ? '다시 포함' : '반영 제외');
      toggle.type = 'button';
      toggle.setAttribute('aria-label', `${layer?.name || '음성'} ${item.fileName || formatDate(item.createdAt)} ${item.excluded ? '다시 포함' : '반영 제외'}`);
      toggle.addEventListener('click', async () => {
        if (hostBusy() || typeof onRemove !== 'function') return;
        localBusy = true;
        refreshControls();
        try { await onRemove({ id: item.id }); setStatus(item.excluded ? '기록을 반영 대상으로 다시 포함했습니다.' : '기록을 반영에서 제외했습니다. 원음은 유지됩니다.'); }
        catch (error) { report(error); }
        finally { localBusy = false; refresh(); }
      });
      row.append(body, toggle);
      target.append(row);
    }
  }

  function refresh(force = false) {
    if (!dialog.open && force !== true) return;
    const state = snapshot();
    if (profileId !== state.profileId) {
      profileId = state.profileId;
      changedMode = false;
      localMessage = '';
      localError = false;
      lastHistoryKey = '';
      lastRenderKey = '';
      for (const card of cards.values()) { card.file.value = ''; card.confirm.checked = false; card.selectedMidi = null; card.selection.textContent = '파일을 여러 개 선택할 수 있습니다.'; }
    }
    if (!changedMode) {
      const mode = ['adaptive', 'fixed', 'off'].includes(state.mode) ? state.mode : 'adaptive';
      for (const input of dialog.querySelectorAll('input[name="clMode"]')) input.checked = input.value === mode;
      $('#clSuppressCommon').checked = Boolean(state.suppressCommon);
    }
    const observations = Array.isArray(state.observations) ? state.observations : [];
    const renderKey = JSON.stringify([state.profileId, state.name, state.model?.id, state.mode, $('#clShowExcluded').checked, observations.map(item => [item.id, item.excluded, item.usable, item.confirmed])]);
    if (renderKey !== lastRenderKey) {
      lastRenderKey = renderKey;
      $('#clMember').textContent = state.name || '학생을 먼저 선택하세요';
      $('#clTotalCount').replaceChildren(document.createTextNode(String(observations.length)), el('small', '', '개'));
      const usableCount = state.model?.mode !== 'off' && numeric(state.model?.counts?.observations) ? Number(state.model.counts.observations) : 0;
      $('#clUsableCount').replaceChildren(document.createTextNode(String(usableCount)), el('small', '', '개'));
      for (const layer of LAYERS) renderCoverage(layer, observations, state.model);
      renderHistory(observations);
    }
    const message = typeof state.status === 'string' ? state.status : state.status?.message;
    if (localError && localMessage) $('#clStatus').textContent = localMessage;
    else if (message) $('#clStatus').textContent = message;
    else if (localMessage) $('#clStatus').textContent = localMessage;
    else $('#clStatus').textContent = '파일을 등록하거나 기존 측정 기록을 확인하세요.';
    refreshControls(state);
  }

  async function cancel() {
    activeOperation++;
    try { if (typeof onCancel === 'function') await onCancel(); }
    catch (error) { report(error); }
    finally { localBusy = false; setStatus('분석을 중지했습니다. 완료된 기록은 누적 목록에서 확인할 수 있습니다.'); refresh(); }
  }

  function close() {
    if (hostBusy()) void cancel();
    if (dialog.open) dialog.close();
    if (returnFocus?.isConnected) returnFocus.focus();
  }
  $('#clClose').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  $('#clCancel').addEventListener('click', cancel);
  $('#clShowExcluded').addEventListener('change', refresh);
  for (const input of dialog.querySelectorAll('input[name="clMode"], #clSuppressCommon')) input.addEventListener('change', () => { changedMode = true; });
  $('#clApply').addEventListener('click', async () => {
    if (hostBusy() || typeof onApply !== 'function') return;
    localBusy = true;
    refreshControls();
    try {
      await onApply({ mode: $('input[name="clMode"]:checked')?.value || 'adaptive', suppressCommon: $('#clSuppressCommon').checked });
      changedMode = false;
      setStatus('이 사람의 음역별 반응 기준을 적용했습니다.');
    } catch (error) { report(error); }
    finally { localBusy = false; refresh(); }
  });

  return {
    open() { returnFocus = document.activeElement; if (!dialog.open) dialog.showModal(); refresh(); },
    close,
    refresh,
    get active() { return dialog.open; },
  };
}
