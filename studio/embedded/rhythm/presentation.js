/* Fullscreen is optional: the same live game always has a viewport-sized fallback. */
const rhythmPresentation = (() => {
  let expanded = false;
  let requestedNative = false;
  let nativeEntered = false;
  let nativePending = false;
  let generation = 0;
  let onExit = () => {};
  let onResize = () => {};
  const root = document.documentElement;
  function setExpanded(value) {
    if (expanded === value) return;
    expanded = value;
    document.body.classList.toggle('rhythm-expanded', value);
    hostBridge.presentation(value);
    onResize();
  }
  function exitNative() {
    if (!requestedNative || document.fullscreenElement !== root || !document.exitFullscreen) return;
    try { Promise.resolve(document.exitFullscreen()).catch(() => {}); } catch {}
  }
  function enter() {
    if (expanded) return;
    const current = ++generation;
    setExpanded(true);
    // Called directly in a start/resume click, before any permission or host await.
    if (nativePending || document.fullscreenElement || !root.requestFullscreen || document.fullscreenEnabled === false) return;
    requestedNative = true;
    nativePending = true;
    try {
      Promise.resolve(root.requestFullscreen()).then(() => {
        // A new start may reuse a pending request after a quick cancel/retry.
        if (!expanded) exitNative();
      }).catch(() => { if (current === generation || !nativeEntered) requestedNative = false; })
        .finally(() => { nativePending = false; });
    } catch { requestedNative = false; nativePending = false; }
  }
  function collapse() {
    ++generation;
    setExpanded(false);
    exitNative();
  }
  function leave() {
    onExit(); // Pause or cancel synchronously before changing the presentation.
    collapse();
  }
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement === root) {
      nativeEntered = requestedNative;
      if (!expanded) exitNative();
      return;
    }
    if (nativeEntered) {
      nativeEntered = false;
      requestedNative = false;
      if (expanded) leave();
    }
  });
  return { enter, collapse, leave,
    configure(handlers) { onExit = handlers.onExit; onResize = handlers.onResize; },
    get expanded() { return expanded; }
  };
})();
