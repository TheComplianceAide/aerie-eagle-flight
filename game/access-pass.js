(() => {
  const freeWorld = 'winnipesaukee';
  const policy = document.querySelector('meta[name="aerie-access"]')?.content;
  const required = policy === 'required';
  const limited = required || new URLSearchParams(location.search).get('access') === 'free';
  if (location.protocol === 'file:') return;
  if (limited && !new URLSearchParams(location.hash.slice(1)).has('world')) {
    history.replaceState(null, '', '#world='+freeWorld);
  }
  document.addEventListener('DOMContentLoaded', setup, {once:true});
  function setup() {
    const endpoint = new URL(document.querySelector('meta[name="aerie-commerce-url"]')?.content || '/api/aerie/', location.href);
    const picker = document.getElementById('worldPicker');
    const fly = document.getElementById('fly');
    const app = document.getElementById('app');
    const join = new URL('join/', location.href);
    const link = document.createElement('a');
    link.className = 'aerie-pass-link';
    link.href = join.href;
    link.textContent = 'Flight passes & gifts';
    fly.after(link);
    if (!limited) return;

    let pass = {fullAccess:false, worlds:[]};
    const canFly = region => region === freeWorld || pass.fullAccess || pass.worlds.includes(region);
    function refreshMenu() {
      const allowed = canFly(picker.value);
      fly.lastChild.textContent = allowed ? 'Take flight' : 'Unlock this world';
      for (const button of document.querySelectorAll('#worldList [data-choice]')) {
        button.dataset.pass = canFly(button.dataset.choice) ? 'open' : 'locked';
      }
    }
    app.dataset.passMode = 'limited';
    refreshMenu();
    window.addEventListener('worldchange', refreshMenu);

    const signal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(4000) : undefined;
    const status = fetch(new URL('status', endpoint), {credentials:'include', cache:'no-store', signal})
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (data && Array.isArray(data.worlds)) {
          pass = {fullAccess:data.fullAccess === true, worlds:data.worlds};
          if (app.dataset.mode === 'title' && !fly.disabled) refreshMenu();
        }
      }).catch(() => {});

    fly.addEventListener('click', event => {
      if (canFly(picker.value)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      location.assign(new URL('#passes', join));
    }, true);

    const load = window.loadFlightRange;
    window.loadFlightRange = async region => {
      if (region !== freeWorld) await status;
      if (!canFly(region)) throw new Error('Flight access is required for '+region);
      if (required && region !== freeWorld) {
        const primary = {alaska:'alaska-world.js', canyon:'canyon.js', swiss:'world.js', yellowstone:'yellowstone-world.js'};
        const entry = primary[region] || 'atlas-'+region+'-survey.js';
        const prior = window.aerieAssetURL;
        window.aerieAssetURL = file => {
          if (file !== entry) return prior?.(file) || file;
          const url = new URL('asset', endpoint);
          const versioned = region === 'yellowstone' && document.querySelector('meta[name="aerie-yellowstone-entry"]')?.content;
          const path = /^yellowstone-world-v[0-9]{4,8}\.js$/.test(versioned || '') ? versioned : entry;
          url.search = new URLSearchParams({world:region, path, redirect:'1'});
          return url.href;
        };
      }
      return load(region);
    };
  }
})();
