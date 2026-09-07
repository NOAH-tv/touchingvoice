/* Production practice is opened by the approved Studio host, never as a standalone page. */
const rhythmAccess = (() => {
  const hostname = location.hostname;
  const local = location.protocol === 'file:' || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
  const embedded = window.parent !== window;
  let sameOriginHost = false;
  try { sameOriginHost = embedded && window.parent.location.origin === location.origin; } catch {}
  const canBoot = local || sameOriginHost;
  let authorized = local;
  function setAuthorized(value) {
    authorized = local || (canBoot && Boolean(value));
    const app = document.getElementById('app');
    if (app) { app.hidden = !authorized; app.inert = !authorized; }
    let gate = document.getElementById('rhythmAccessGate');
    if (!authorized && !gate) {
      gate = document.createElement('main'); gate.id = 'rhythmAccessGate';
      gate.style.cssText = 'position:fixed;inset:0;z-index:99999;display:grid;place-content:center;gap:18px;padding:32px;text-align:center;background:#160b24;color:#f5eee0;font:16px/1.8 Paperlogy,sans-serif';
      const title = document.createElement('p'); title.textContent = '로그인 후 코칭 스튜디오에서 열어 주세요.';
      const link = document.createElement('a'); link.href = '../../../portal.html'; link.target = '_top'; link.textContent = '터칭보이스 로그인'; link.style.cssText = 'color:#e8c97a';
      gate.append(title, link); document.body.append(gate);
    }
    if (gate) gate.hidden = authorized;
    if (gate) gate.style.display = authorized ? 'none' : 'grid';
  }
  setAuthorized(false);
  return { local, production: !local, canBoot, setAuthorized, get authorized() { return authorized; } };
})();
