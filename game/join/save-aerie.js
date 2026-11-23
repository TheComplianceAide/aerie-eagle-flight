(() => {
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const saves = [...document.querySelectorAll('[data-install-aerie]')];
  if (!saves.length) return;
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/join/aerie-app-worker.js', { scope:'/join/' }).catch(() => {});
    }, { once:true });
  }
  let prompt;
  function update() {
    for (const button of saves) button.hidden = standalone();
  }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    prompt = event;
    update();
  });
  window.addEventListener('appinstalled', () => {
    prompt = undefined;
    for (const button of saves) button.hidden = true;
  });
  const panel = document.createElement('dialog');
  panel.className = 'dialog';
  panel.setAttribute('aria-labelledby', 'save-aerie-title');
  panel.innerHTML = '<button class="dialog-close" type="button" aria-label="Close save options">×</button>' +
    '<h2 id="save-aerie-title">Save Aerie</h2><p id="save-aerie-steps"></p>' +
    '<button class="button button-gold" type="button" id="copy-aerie-return">Copy play link</button>' +
    '<p class="form-status" id="save-aerie-note" role="status"></p>';
  document.body.append(panel);
  panel.querySelector('.dialog-close').onclick = () => panel.close();
  const note = panel.querySelector('#save-aerie-note');
  const playLink = new URL('/join/#play', location.href).href;
  panel.querySelector('#copy-aerie-return').onclick = async () => {
    try {
      await navigator.clipboard.writeText(playLink);
      note.textContent = 'Play link copied.';
    } catch {
      note.textContent = playLink;
    }
  };
  const ua = navigator.userAgent;
  const appleMobile = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const safari = /Safari\//.test(ua) && !/Chrome\/|CriOS\/|FxiOS\/|EdgiOS\//.test(ua);
  let instructions;
  if (appleMobile && safari) instructions = 'Tap Share, then Add to Home Screen. Turn on Open as Web App if offered, then tap Add.';
  else if (appleMobile) instructions = 'In the browser’s Share menu, choose Add to Home Screen. If the option is missing, open Aerie in Safari.';
  else if (/Android/.test(ua)) instructions = 'Open the browser menu and choose Add to Home screen or Install app.';
  else instructions = /Macintosh/.test(ua) ? 'Press ⌘D to bookmark Aerie. In Safari, File → Add to Dock saves an app icon.' : 'Press Ctrl+D to bookmark Aerie, or use Install app in your browser’s menu.';
  panel.querySelector('#save-aerie-steps').textContent = instructions;
  async function save() {
    const current = prompt;
    prompt = undefined;
    if (current) {
      try {
        await current.prompt();
        const choice = await current.userChoice;
        if (choice.outcome === 'accepted') return;
      } catch {}
    }
    if (!panel.open && !standalone()) {
      note.textContent = '';
      panel.showModal();
    }
  }
  for (const button of saves) button.addEventListener('click', save);
  update();
})();
