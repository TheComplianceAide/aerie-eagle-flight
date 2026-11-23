(() => {
  const freeWorld = 'winnipesaukee';
  const policy = document.querySelector('meta[name="aerie-access"]')?.content;
  const required = policy === 'required';
  const limited = required || new URLSearchParams(location.search).get('access') === 'free';
  if (location.protocol === 'file:') return;
  if (limited && !new URLSearchParams(location.hash.slice(1)).has('world')) {
    history.replaceState(null, '', '#world='+freeWorld+'&launch=mount-major');
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
    link.textContent = 'Aerie home';
    fly.after(link);
    if (!limited) return;

    let pass = {fullAccess:false, worlds:[]};
    const canFly = region => region === freeWorld || pass.fullAccess || pass.worlds.includes(region);
    function refreshMenu() {
      const allowed = canFly(picker.value);
      fly.lastChild.textContent = allowed ? (window.aerieFlyText?.() || 'Take flight') : 'Unlock this world';
      for (const button of document.querySelectorAll('#worldList [data-choice]')) {
        button.dataset.pass = canFly(button.dataset.choice) ? 'open' : 'locked';
      }
    }
    app.dataset.passMode = 'limited';
    refreshMenu();
    window.addEventListener('worldchange', refreshMenu);

    // Count rendered free-world play across launches. The renderer calls this only
    // after pause, background, world and graphics-recovery checks.
    const progressKey = 'aerie:firstFlightOffer:v1';
    const threshold = 300;
    let seconds = 0, saved = 0;
    function readProgress(value) {
      const stored = Number(value);
      if (Number.isFinite(stored) && stored > seconds) seconds = Math.min(stored, threshold);
      saved = seconds;
    }
    try { readProgress(localStorage.getItem(progressKey)); } catch {}
    window.addEventListener('storage', event => {
      if (event.key === progressKey && event.newValue !== null) readProgress(event.newValue);
    });
    function saveProgress() {
      if (seconds <= saved) return;
      try {
        const previous = Number(localStorage.getItem(progressKey));
        if (Number.isFinite(previous)) seconds = Math.max(seconds, Math.min(previous, threshold));
        localStorage.setItem(progressKey, String(seconds));
      } catch {}
      saved = seconds;
    }
    window.addEventListener('pagehide', saveProgress);
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveProgress(); });
    window.aerieFirstFlightOffer = delta => {
      if (seconds >= threshold || app.dataset.freePlayer !== 'true') return false;
      // Ignore a suspended tab's stale frame interval.
      seconds = Math.min(threshold, seconds + Math.min(delta, 1));
      const due = seconds >= threshold;
      if (due || seconds - saved >= 10) saveProgress();
      return due;
    };

    let passRequest = 0;
    function refreshPass() {
      const request = ++passRequest;
      const signal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(4000) : undefined;
      return fetch(new URL('status', endpoint), {credentials:'include', cache:'no-store', signal})
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (request === passRequest && data && Array.isArray(data.worlds)) {
          pass = {fullAccess:data.fullAccess === true, worlds:data.worlds};
          app.dataset.freePlayer = String(!pass.fullAccess && pass.worlds.length === 1 && pass.worlds.includes(freeWorld));
          if (app.dataset.mode === 'title' && !fly.disabled) refreshMenu();
        }
      }).catch(() => {});
    }
    let ticketPriceRequest;
    window.addEventListener('aerie:show-flight-offers', () => {
      if (ticketPriceRequest) return;
      ticketPriceRequest = fetch(new URL('config', endpoint), { credentials:'omit' })
        .then(response => response.ok ? response.json() : null)
        .then(offer => {
          if (offer?.checkout === true && offer.priceCurrency === 'usd' && Number.isSafeInteger(offer.priceAmount)) {
            document.getElementById('flightTicketPrice').textContent = '$' + (offer.priceAmount / 100).toFixed(2);
          } else ticketPriceRequest = null;
        }).catch(() => { ticketPriceRequest = null; });
    });
    let status = refreshPass();
    const entry = new URL(location.href);
    const targetWorld = new URLSearchParams(entry.hash.slice(1)).get('world');
    if (entry.searchParams.get('fly') === '1' && targetWorld) {
      status.then(() => {
        const requested = targetWorld === 'lac-berte' ? 'labrador' : targetWorld;
        if (!pass.fullAccess || !canFly(requested) || picker.value !== requested ||
            app.dataset.mode !== 'title' || fly.disabled) return;
        // Consume this one navigation so a later refresh still restores the usual pause menu.
        const current = new URL(location.href);
        current.searchParams.delete('fly');
        history.replaceState(null, '', current.href);
        app.dataset.ticketLaunch = 'true';
        fly.click();
      });
    }
    window.addEventListener('aerie:flight-started', () => {
      if (picker.value === freeWorld || !pass.fullAccess) return;
      try {
        localStorage.setItem('aerie:last-paid-flight', JSON.stringify({
          world: picker.value, launch: document.getElementById('launchPoint').value
        }));
      } catch {}
    });
    window.addEventListener('pageshow', event => { if (event.persisted) status = refreshPass(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) status = refreshPass(); });

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
