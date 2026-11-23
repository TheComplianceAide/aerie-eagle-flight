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
    link.href = new URL('?return=1', join).href;
    link.textContent = 'Your flights';
    fly.after(link);
    if (!limited) return;

    let pass = {fullAccess:false, worlds:[]};
    let passKnown = false, checkingPass = false;
    const canFly = region => region === freeWorld || pass.fullAccess || pass.worlds.includes(region);
    function refreshMenu() {
      const allowed = canFly(picker.value);
      fly.lastChild.textContent = allowed ? (window.aerieFlyText?.() || 'Take flight') : passKnown ? 'Unlock this world' : checkingPass ? 'Checking your ticket…' : 'Retry ticket check';
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

    const shareChooser = document.getElementById('flightShareChooser');
    const shareFallback = document.getElementById('flightShareFallback');
    const shareConfirm = document.getElementById('flightShareConfirm');
    const rewardStatus = document.getElementById('flightRewardStatus');
    let shareChosen = false, shareMounted = false, claimBusy = false;
    let rewardWorlds = [], accessRevision = 0;

    function reflectShareAccess() {
      if (!shareChooser || !rewardWorlds.length) return;
      if (window.AerieShare?.hasChosen?.()) shareChosen = true;
      const unlocked = pass.fullAccess || rewardWorlds.every(world => pass.worlds.includes(world));
      shareFallback.hidden = shareMounted || unlocked;
      shareChooser.hidden = !shareMounted || unlocked;
      shareConfirm.hidden = !shareChosen || unlocked;
      shareConfirm.disabled = claimBusy;
      if (unlocked) {
        document.getElementById('flightSupportCopy').textContent = pass.fullAccess
          ? 'Your ticket includes all worlds.' : 'You can keep flying here or choose another world.';
        rewardStatus.textContent = pass.fullAccess ? '' : 'Five more worlds unlocked.';
        const support = document.getElementById('flightSupport');
        if (!support.hidden && support.closest('.modal')?.dataset.dialog === 'support') {
          document.getElementById('dialogTitle').textContent = 'Your flight ticket';
          document.getElementById('end').hidden = false;
        }
      }
    }

    function applyAccess(data) {
      pass = {fullAccess:data.fullAccess === true, worlds:data.worlds};
      passKnown = true;
      app.dataset.freePlayer = String(!pass.fullAccess && pass.worlds.length === 1 && pass.worlds.includes(freeWorld));
      reflectShareAccess();
    }

    function setupShareOffer(offer) {
      if (!shareChooser || offer?.shareClaims !== true || !Array.isArray(offer.rewardWorlds) ||
          offer.rewardWorlds.length !== 5) return;
      rewardWorlds = offer.rewardWorlds;
      if (!shareMounted && window.AerieShare?.mount) {
        window.AerieShare.mount(document.getElementById('flightShareActions'), {
          channels:['messages', 'whatsapp', 'x', 'instagram', 'facebook', 'linkedin', 'bluesky', 'telegram', 'copy'],
          status:document.getElementById('flightShareStatus'),
          onChoose() {
            shareChosen = true;
            reflectShareAccess();
          }
        });
        shareMounted = true;
      }
      reflectShareAccess();
    }

    shareConfirm?.addEventListener('click', async () => {
      if (claimBusy || !shareChosen || !rewardWorlds.length || pass.fullAccess) return;
      claimBusy = true;
      rewardStatus.textContent = 'Unlocking your worlds…';
      reflectShareAccess();
      try {
        const response = await fetch(new URL('share-friends', endpoint), {
          method:'POST', credentials:'include', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({sharedWithFriends:true}),
          signal:typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(12000) : undefined
        });
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (result.ok !== true || !Array.isArray(result.worlds) ||
            !rewardWorlds.every(world => result.worlds.includes(world))) throw new Error();
        accessRevision++;
        applyAccess({fullAccess:pass.fullAccess, worlds:result.worlds});
        shareChosen = false;
        window.AerieShare?.clearChoice?.();
        refreshMenu();
        const chooseWorld = document.getElementById('end');
        if (!chooseWorld.closest('.modal')?.hidden && !chooseWorld.hidden) chooseWorld.focus({preventScroll:true});
      } catch {
        rewardStatus.textContent = 'Your unlock could not be confirmed. Try again.';
      } finally {
        claimBusy = false;
        reflectShareAccess();
      }
    });

    let activePassRequest;
    function refreshPass() {
      if (activePassRequest) return activePassRequest;
      const revision = accessRevision;
      checkingPass = true;
      if (app.dataset.mode === 'title' && !fly.disabled) refreshMenu();
      activePassRequest = (async () => {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const signal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(9000) : undefined;
            const response = await fetch(new URL('status', endpoint), {credentials:'include', cache:'no-store', signal});
            if (!response.ok) continue;
            const data = await response.json();
            if (!Array.isArray(data.worlds)) continue;
            if (revision === accessRevision) applyAccess(data);
            break;
          } catch {}
        }
      })().finally(() => {
        activePassRequest = null;
        checkingPass = false;
        if (app.dataset.mode === 'title' && !fly.disabled) refreshMenu();
      });
      return activePassRequest;
    }
    let ticketPriceRequest;
    window.addEventListener('aerie:show-flight-offers', () => {
      if (ticketPriceRequest) return;
      ticketPriceRequest = fetch(new URL('config', endpoint), { credentials:'omit' })
        .then(response => response.ok ? response.json() : null)
        .then(offer => {
          setupShareOffer(offer);
          if (offer?.checkout === true && offer.priceCurrency === 'usd' && Number.isSafeInteger(offer.priceAmount)) {
            document.getElementById('flightTicketPrice').textContent = '$' + (offer.priceAmount / 100).toFixed(2);
            const notice = document.getElementById('flightTicketMode');
            if (notice) {
              notice.textContent = 'Preview checkout. Test cards only. No charge.';
              notice.hidden = offer.checkoutMode !== 'test';
            }
          } else ticketPriceRequest = null;
        }).catch(() => { ticketPriceRequest = null; });
    });
    let status = refreshPass();
    const entry = new URL(location.href);
    const targetWorld = new URLSearchParams(entry.hash.slice(1)).get('world');
    if (entry.searchParams.get('fly') === '1' && targetWorld) {
      (targetWorld === freeWorld ? Promise.resolve() : status).then(() => {
        const requested = targetWorld === 'lac-berte' ? 'labrador' : targetWorld;
        if (!canFly(requested) || picker.value !== requested ||
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
      const launches = document.getElementById('launchPoint');
      const last = { world: picker.value, launch: launches.value,
        title: launches.selectedOptions[0]?.textContent, region: picker.selectedOptions[0]?.textContent };
      // Home-screen web apps on iOS can import site cookies on installation.
      // This preference identifies a departure. Access is checked by the server.
      try {
        const departure = [last.world, last.launch, (last.title || '').slice(0, 120)].join('/');
        document.cookie = 'aerie_departure=' + encodeURIComponent(departure) +
          '; Path=/; Max-Age=31536000; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');
      } catch {}
      try {
        localStorage.setItem('aerie:last-flight', JSON.stringify(last));
        if (last.world !== freeWorld && pass.fullAccess) localStorage.setItem('aerie:last-paid-flight', JSON.stringify(last));
      } catch {}
    });
    window.addEventListener('pageshow', event => { if (event.persisted) status = refreshPass(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) status = refreshPass(); });

    let pendingLaunch = false;
    fly.addEventListener('click', async event => {
      if (canFly(picker.value)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!passKnown) {
        if (pendingLaunch) return;
        pendingLaunch = true;
        const requested = picker.value;
        await refreshPass();
        pendingLaunch = false;
        if (app.dataset.mode !== 'title' || fly.disabled || picker.value !== requested || !passKnown) return;
        if (canFly(requested)) { fly.click(); return; }
      }
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
