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
        if (/^[\w-]{1,64}\.js$/.test(name)) file = name;
      } catch {}
    }
    const line = Number.isInteger(lineNumber) ? Math.max(0, Math.min(100000, lineNumber)) : 0;
    const key = [kind, world, file, line].join('|');
    if (reported.has(key)) return;
    reported.add(key);
    fetch(endpoint, {method:'POST', credentials:'omit', keepalive:true,
      headers:{'Content-Type':'application/json'}, body:JSON.stringify({kind, world, version, file, line})}).catch(() => {});
  }

  window.addEventListener('error', event => {
    const source = event.filename || event.target?.src;
    report('script', source, event.lineno);
  }, true);
  window.addEventListener('unhandledrejection', () => report('promise'));
  document.addEventListener('webglcontextlost', () => report('graphics'), true);
  const title = document.getElementById('dialogTitle');
  if (title) new MutationObserver(() => {
    if (title.textContent === 'Unable to start flight') report('startup');
  }).observe(title, {childList:true, characterData:true, subtree:true});
})();
