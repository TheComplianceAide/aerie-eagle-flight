(() => {
  const destination = document.querySelector('meta[name="aerie-monitor"]')?.content;
  if (!destination || location.protocol === 'file:') return;
  const endpoint = new URL(destination, location.href);
  if (endpoint.protocol !== 'https:' && !['127.0.0.1','localhost'].includes(endpoint.hostname)) return;
  const version = document.querySelector('meta[name="application-version"]')?.content || 'unknown';
  const reported = new Set();
  const worldPicker = document.getElementById('worldPicker');

  function report(kind, filename = '', lineNumber = 0) {
    if (reported.size >= 6) return;
    const selection = worldPicker?.value || '';
    const world = /^[a-z]{1,24}$/.test(selection) ? selection : 'menu';
    let file = '';
    if (filename) {
      try {
        const name = new URL(filename, location.href).pathname.split('/').pop();
        if (/^[\w.-]{1,72}\.js$/.test(name)) file = name;
      } catch {}
    }
    const line = Number.isInteger(lineNumber) ? Math.max(0, Math.min(100000, lineNumber)) : 0;
    const key = [kind, world, file, line].join('|');
    if (reported.has(key)) return;
    reported.add(key);
    fetch(endpoint, {method:'POST', credentials:'omit', keepalive:true,
      headers:{'Content-Type':'application/json'}, body:JSON.stringify({kind, world, version, file, line})}).catch(() => {});
  }

  // The OS can kill a phone tab that runs out of memory without any error event.
  // During flight a heartbeat is stored every two seconds and marked closed when the
  // page is hidden or unloaded. A heartbeat still open on the next load is a crash.
  const sessionKey = 'aerie:session';
  const store = value => { try { localStorage.setItem(sessionKey, JSON.stringify(value)); } catch {} };
  let prior = null;
  try { prior = JSON.parse(localStorage.getItem(sessionKey) || 'null'); localStorage.removeItem(sessionKey); } catch {}
  const ua = navigator.userAgent;
  const platform = (/(?:iPhone|iPad|iPod).*? OS (\d+)/.exec(ua) && 'ios' + /OS (\d+)/.exec(ua)[1]) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1 && 'ipados') ||
    (/Android (\d+)/.exec(ua) && 'and' + /Android (\d+)/.exec(ua)[1]) ||
    (/Macintosh/.test(ua) ? 'mac' : /Windows/.test(ua) ? 'win' : 'other');
  const clean = value => String(value).replace(/[^A-Za-z0-9-]/g, '').slice(0, 10);
  if (prior && prior.open && Date.now() - prior.at < 20 * 60 * 1000 && /^[a-z]{1,24}$/.test(prior.world || '')) {
    const d = prior.diag || {};
    const name = ['crash', 't' + clean(d.t), 'f' + clean(d.fps), 'd' + clean(Math.round((d.dpr || 0) * 100)),
      'k' + clean(d.ktris), 'c' + clean(d.calls), 'x' + clean(d.tex), 's' + clean(d.sound ?? ''), clean(prior.platform), clean(d.stage || '')].join('.') + '.js';
    const send = () => fetch(endpoint, {method:'POST', credentials:'omit', keepalive:true,
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({kind:'graphics', world:prior.world, version:/^[\w.-]{1,24}$/.test(prior.version) ? prior.version : version,
        file:name.length <= 75 ? name : 'crash.js', line:Math.max(0, Math.min(100000, Math.round(d.t) || 0))})}).catch(() => {});
    send();
  }
  let open = false;
  setInterval(() => {
    const diag = window.aerieDiag?.();
    if (!diag || document.hidden) return;
    const selection = worldPicker?.value || '';
    open = true;
    store({open:true, at:Date.now(), world:/^[a-z]{1,24}$/.test(selection) ? selection : 'menu', version, platform, diag});
  }, 2000);
  const close = () => {
    if (!open) return;
    open = false;
    try { const value = JSON.parse(localStorage.getItem(sessionKey) || 'null'); if (value) store({...value, open:false}); } catch {}
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) close(); });
  window.addEventListener('pagehide', close);

  window.addEventListener('error', event => {
    const source = event.filename || event.target?.src;
    report('script', source, event.lineno);
  }, true);
  window.addEventListener('unhandledrejection', () => report('promise'));
  document.addEventListener('webglcontextlost', () => report('graphics'), true);
  const title = document.getElementById('dialogTitle');
  if (title) new MutationObserver(() => {
    if (title.textContent === 'Unable to start flight') {
      const reason = String(window.aerieLaunchFailure || 'unknown').replace(/[^A-Za-z0-9-]/g, '').slice(0, 44) || 'unknown';
      report('startup', 'startup.' + platform + '.' + reason + '.js');
    }
  }).observe(title, {childList:true, characterData:true, subtree:true});
})();
