/** DOM-only view. The host owns microphone access, capture and profile updates. */
export function createGuidedCalibrationView() {
  const dialog = document.createElement('dialog');
  dialog.id = 'gcDialog';
  dialog.className = 'gc-dialog';
  dialog.setAttribute('aria-labelledby', 'gcTitle');
  dialog.setAttribute('aria-describedby', 'gcDescription');
  dialog.innerHTML = `
    <header class="gc-header">
      <div><p class="gc-eyebrow">터칭보이스 · 개인 튜닝</p><h2 id="gcTitle">음역별로 쌓아가는 미세 튜닝</h2></div>
      <div class="gc-header-actions"><div class="gc-member"><span>측정 대상</span><strong id="gcMember">학생 확인 중</strong></div><button id="gcClose" class="gc-button gc-close" type="button" aria-label="개인 튜닝 닫기">닫기 <span aria-hidden="true">×</span></button></div>
    </header>
    <div class="gc-content">
      <p id="gcDescription" class="gc-intro">에 · 아 · 으 · 하를 5음 상행 스케일로 발성합니다. 각 과제의 음정과 음향 반응을 모아, 이 사람에게 맞는 반응 범위를 조절합니다.<span>안내된 발음은 지도사가 확인합니다. 결과는 과제 수행 기록이며, 기관의 발달 정도를 직접 측정한 값은 아닙니다.</span></p>
      <nav class="gc-steps" aria-label="네 영역 측정 순서">
        <button type="button" data-gc-task="nas" class="gc-step active" aria-current="step"><span class="gc-step-number">01</span><span class="gc-step-title"><strong>상인두 <em>에</em></strong><small id="gcStatus-nas">측정 대기</small></span></button>
        <button type="button" data-gc-task="oro" class="gc-step"><span class="gc-step-number">02</span><span class="gc-step-title"><strong>중인두 <em>아</em></strong><small id="gcStatus-oro">측정 대기</small></span></button>
        <button type="button" data-gc-task="aes" class="gc-step"><span class="gc-step-number">03</span><span class="gc-step-title"><strong>하인두 <em>으</em></strong><small id="gcStatus-aes">측정 대기</small></span></button>
        <button type="button" data-gc-task="src" class="gc-step"><span class="gc-step-number">04</span><span class="gc-step-title"><strong>성문 <em>하</em></strong><small id="gcStatus-src">측정 대기</small></span></button>
      </nav>
      <div class="gc-workspace">
        <section class="gc-session" aria-label="발성 측정">
          <div class="gc-task-heading"><div class="gc-vowel" id="gcVowel">에</div><div><p class="gc-eyebrow" id="gcLayer">상인두 · 첫 번째 과제</p><h3>가이드를 따라 편안하게 발성하세요.</h3><p id="gcInstruction">한 음씩 올라가며 ‘에’를 발성합니다. 무리해서 음을 올리지 않아도 됩니다.</p></div></div>
          <div class="gc-readouts" aria-label="실시간 음정"><div><span>목표 음정</span><strong id="gcTarget">—</strong></div><div><span>내 목소리</span><strong id="gcActual">—</strong></div><div><span>음정 차이</span><strong id="gcCents">—</strong></div></div>
          <div class="gc-chart"><canvas id="gcTimeline" width="1000" height="250" aria-label="시간에 따른 목표 음정과 실제 발성 음정 그래프"></canvas><div class="gc-chart-key"><span><i class="gc-key-target"></i>목표 음정</span><span><i class="gc-key-voice"></i>내 목소리</span></div></div>
          <div class="gc-progress" aria-hidden="true"><div id="gcMeter"></div></div>
          <p id="gcFeedback" class="gc-feedback" role="status" aria-live="polite">시작 음을 고르고 가이드를 들어보세요.</p>
          <div class="gc-transport"><button type="button" id="gcListen" class="gc-button gc-secondary">가이드 듣기</button><button type="button" id="gcStart" class="gc-button gc-primary">측정 시작</button><button type="button" id="gcStop" class="gc-button gc-stop" disabled>측정 중지</button><button type="button" id="gcNext" class="gc-button gc-next" disabled>다음 영역 <span aria-hidden="true">→</span></button></div>
          <label class="gc-check gc-vowel-confirm"><input type="checkbox" id="gcConfirmVowel"><span>지도사가 안내 발음을 확인했습니다.<small>측정된 음정과 함께 발음이 맞는지 직접 확인해 주세요.</small></span></label>
        </section>
        <aside class="gc-settings" aria-labelledby="gcSettingsTitle">
          <div class="gc-section-heading"><span>측정 준비</span><h3 id="gcSettingsTitle">편안한 음역에서 시작</h3></div>
          <label class="gc-field"><span>시작 음</span><select id="gcRoot" aria-label="5음 스케일 시작 음"></select><small>선택한 음부터 다섯 음을 올라갑니다.</small></label>
          <div class="gc-settings-pair"><label class="gc-field"><span>속도 · BPM</span><input type="number" id="gcBpm" min="50" max="100" step="1" value="60" inputmode="numeric"></label><label class="gc-field"><span>반복 횟수</span><input type="number" id="gcRepeats" min="1" max="3" step="1" value="2" inputmode="numeric"></label></div>
          <label class="gc-check gc-headphones"><input type="checkbox" id="gcHeadphones"><span>이어폰을 착용했습니다.<small>스피커의 가이드 소리가 마이크에 들어가면 목소리로 측정될 수 있습니다.</small></span></label>
          <div class="gc-guide"><h4>측정은 이렇게 진행돼요</h4><ol><li>시작 음과 속도를 고릅니다.</li><li>가이드를 듣고 발성합니다.</li><li>발음을 확인하고 다른 음역이나 영역을 측정합니다.</li><li>확인한 측정을 기존 기준에 더해 적용합니다.</li></ol></div>
        </aside>
      </div>
      <div id="gcResult" class="gc-result" aria-label="개인 튜닝 측정 결과"></div>
    </div>
    <footer class="gc-footer"><div><strong>네 영역의 기록을 한 사람의 기준으로</strong><p id="gcSaved" role="status">한 영역부터 측정하고 기존 기록에 계속 더할 수 있습니다.</p></div><div class="gc-footer-actions"><button type="button" id="gcExport" class="gc-button gc-secondary" disabled>측정 결과 내보내기</button><button type="button" id="gcApply" class="gc-button gc-primary" disabled>이 사람에게 튜닝 적용</button></div></footer>`;
  const root = dialog.querySelector('#gcRoot');
  const names = ['도', '도♯', '레', '레♯', '미', '파', '파♯', '솔', '솔♯', '라', '라♯', '시'];
  const letters = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  for (let midi = 36; midi <= 76; midi += 1) {
    const option = document.createElement('option');
    option.value = String(midi);
    option.textContent = `${names[midi % 12]} · ${letters[midi % 12]}${Math.floor(midi / 12) - 1}`;
    option.selected = midi === 60;
    root.append(option);
  }
  return dialog;
}
