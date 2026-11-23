(() => {
  const deck = document.getElementById('flights');
  const lastLink = document.getElementById('last-departure');
  const worldNames = new Map([...document.querySelectorAll('[data-world-preview]')].map(card =>
    [card.dataset.worldPreview, card.querySelector('strong').textContent]));
  const entry = new URL(location.href);
  const explicitReturn = entry.searchParams.get('return') === '1';
  const homeIcon = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const legacyIcon = homeIcon && entry.hash === '#play';
  const ordinaryVisit = !entry.search && !entry.hash;
  let access;

  function localRecord(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  function lastDeparture() {
    let cookieIds;
    try {
      const cookie = document.cookie.split('; ').find(item => item.startsWith('aerie_departure='));
      if (cookie) cookieIds = decodeURIComponent(cookie.slice('aerie_departure='.length)).split('/');
    } catch {}
    const saved = localRecord('aerie:last-flight');
    if (cookieIds) {
      const [world, launch] = cookieIds;
      return saved?.world === world && saved.launch === launch ? saved : { world, launch };
    }
    if (saved) return saved;
    const snapshot = localRecord('aerie:resume');
    return snapshot?.region ? { world: snapshot.region, launch: snapshot.launch } : localRecord('aerie:last-paid-flight');
  }
  const launchLabel = id => id.split('-').filter(Boolean).map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
  function update() {
    const last = lastDeparture();
    const valid = last && worldNames.has(last.world) && typeof last.launch === 'string' && /^[a-z][a-z0-9-]{0,50}$/.test(last.launch);
    const canReturn = valid && (last.world === 'winnipesaukee' || access?.fullAccess || access?.worlds?.includes(last.world));
    lastLink.hidden = !canReturn;
    if (canReturn) {
      const name = typeof last.title === 'string' && last.title ? last.title : launchLabel(last.launch);
      lastLink.textContent = 'Fly again · ' + name + ' · ' + worldNames.get(last.world);
      lastLink.href = '../?play=1&fly=1#' + new URLSearchParams({world: last.world, launch: last.launch});
    }
    if (explicitReturn || legacyIcon || (ordinaryVisit && valid)) {
      const notice = document.getElementById('return-notice');
      if (notice.nextElementSibling !== deck) notice.after(deck);
    }
    const flight = window.aerieDailyFlight?.(access || {worlds: ['winnipesaukee'], fullAccess: false});
    if (!flight) return;
    document.getElementById('daily-departure').href = flight.href;
    document.getElementById('daily-title').textContent = flight.title;
    document.getElementById('daily-region').textContent = flight.region;
    const image = document.getElementById('daily-image');
    if (image.getAttribute('src') !== flight.image) image.src = flight.image;
  }
  window.addEventListener('aerie:ticket-status', event => { access = event.detail; update(); });
  window.addEventListener('pageshow', update);
  window.addEventListener('storage', event => { if (event.key === 'aerie:last-flight') update(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
  update();
})();
