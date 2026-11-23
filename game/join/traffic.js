(() => {
  'use strict';

  const host = location.hostname;
  const isAerie = hostname => hostname === 'playaerie.com' || hostname === 'www.playaerie.com';
  const page = document.currentScript?.dataset.trafficPage;
  if (location.protocol !== 'https:' || !isAerie(host) || !page) return;

  const cookieName = '__Secure-aerie_traffic';
  const visitKey = 'aerie:traffic-visit:v1';
  const maxAge = 90 * 24 * 60 * 60;
  const visitLength = 30 * 60 * 1000;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const sourceMarker = /&__aerie_source=([a-z-]+)$/;
  const sources = new Set([
    'direct', 'search', 'other-referral', 'google', 'bing', 'duckduckgo', 'yahoo', 'brave', 'ecosia', 'x',
    'linkedin', 'facebook', 'instagram', 'reddit', 'bluesky', 'threads', 'tiktok', 'youtube', 'discord',
    'whatsapp', 'telegram', 'newsletter', 'email', 'qr'
  ]);
  const referringSites = {
    'bing.com': 'bing', 'duckduckgo.com': 'duckduckgo', 'yahoo.com': 'yahoo', 'search.brave.com': 'brave',
    'ecosia.org': 'ecosia', 'x.com': 'x', 'twitter.com': 'x', 't.co': 'x', 'facebook.com': 'facebook',
    'fb.com': 'facebook', 'instagram.com': 'instagram', 'linkedin.com': 'linkedin', 'lnkd.in': 'linkedin',
    'reddit.com': 'reddit', 'redd.it': 'reddit', 'youtube.com': 'youtube', 'youtu.be': 'youtube',
    'bsky.app': 'bluesky', 'threads.net': 'threads', 'threads.com': 'threads', 'tiktok.com': 'tiktok',
    'discord.com': 'discord', 'discord.gg': 'discord', 'whatsapp.com': 'whatsapp', 'wa.me': 'whatsapp',
    'telegram.org': 'telegram', 't.me': 'telegram'
  };

  const entryUrl = new URL(location.href);
  const marker = sourceMarker.exec(entryUrl.hash);
  const utmSource = entryUrl.searchParams.get('utm_source')?.toLowerCase();
  const entrySource = sources.has(utmSource) ? utmSource : sources.has(marker?.[1]) ? marker[1] : referrerSource();
  if (marker) {
    entryUrl.hash = marker.index > 1 ? entryUrl.hash.slice(0, marker.index) : '';
    try { history.replaceState(history.state, '', entryUrl.href); } catch {}
  }

  function referrerSource() {
    let referrer;
    try { referrer = new URL(document.referrer).hostname; } catch { return 'direct'; }
    const isDomain = domain => referrer === domain || referrer.endsWith('.' + domain);
    if (isAerie(referrer) || isDomain('stripe.com')) return 'direct';
    if (/(?:^|\.)google\.(?:com|[a-z]{2}|(?:com|co)\.[a-z]{2})$/.test(referrer)) return 'google';
    return Object.entries(referringSites).find(([domain]) => isDomain(domain))?.[1] || 'other-referral';
  }

  let redirected = false;
  window.aerieTraffic = { carryTo(url) {
    redirected = true;
    if (entrySource !== 'direct') url.hash = (url.hash || '#') + '&__aerie_source=' + entrySource;
  } };

  const privacySignal = () => navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' ||
    navigator.doNotTrack === 'yes' || window.doNotTrack === '1';
  let enabled = false;
  let pendingFlight = false;
  let localVisit;
  let prompt;
  let promptTimer;

  function choice() {
    try {
      return document.cookie.split('; ').find(value => value.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
    } catch { return undefined; }
  }

  function saveChoice(value) {
    try { document.cookie = `${cookieName}=${value}; Domain=playaerie.com; Path=/; Max-Age=${maxAge}; Secure; SameSite=Lax`; } catch {}
    return choice() === value;
  }

  function loadVisit() {
    try { return JSON.parse(localStorage.getItem(visitKey)) ?? localVisit; } catch { return localVisit; }
  }

  function saveVisit(visit) {
    localVisit = visit;
    try { localStorage.setItem(visitKey, JSON.stringify(visit)); } catch {}
  }

  function clearVisit() {
    localVisit = undefined;
    pendingFlight = false;
    try { localStorage.removeItem(visitKey); } catch {}
  }

  function collect(stage) {
    const visitor = choice();
    if (!enabled || privacySignal() || !uuid.test(visitor || '')) return;
    const now = Date.now();
    let current = loadVisit();
    if (current?.visitor !== visitor || !uuid.test(current.visit) || !sources.has(current.source) ||
        !Array.isArray(current.sent) || !Number.isSafeInteger(current.lastAt) ||
        current.lastAt > now || now - current.lastAt >= visitLength) {
      if (typeof crypto.randomUUID !== 'function') return;
      current = { visitor, visit: crypto.randomUUID(), source: entrySource, landed: false, sent: [] };
    }

    const fromLanding = (stage === 'flight' || stage === 'checkout') && current.landed === true;
    const event = fromLanding ? stage + '-from-landing' : stage;
    const seen = current.sent.includes(event) || (stage === 'visit' && current.landed === true);
    current.lastAt = now;
    if (stage === 'landing') current.landed = true;
    if (!seen) current.sent.push(event);
    saveVisit(current);
    if (seen) return;

    fetch('/api/aerie/traffic', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
      referrerPolicy: 'origin', keepalive: true,
      body: JSON.stringify({ visitor, visit: current.visit, stage, source: current.source, fromLanding })
    }).then(response => { if (!response.ok) throw new Error(); }).catch(() => {
      const latest = loadVisit();
      if (choice() === visitor && latest?.visit === current.visit && Array.isArray(latest.sent)) {
        latest.sent = latest.sent.filter(key => key !== event);
        saveVisit(latest);
      }
    });
  }

  function updateSettings() {
    const settings = document.getElementById('traffic-settings');
    if (!settings) return;
    const active = uuid.test(choice() || '');
    const blocked = privacySignal();
    const button = document.getElementById('traffic-toggle');
    settings.hidden = false;
    button.textContent = active ? 'Turn off analytics' : 'Allow analytics';
    button.disabled = !active && (!enabled || blocked);
    document.getElementById('traffic-status').textContent = blocked ? 'Your browser’s privacy preference keeps analytics off.'
      : active ? 'Analytics is allowed on this browser.' : 'Analytics is off on this browser.';
  }

  function optIn() {
    if (!enabled || privacySignal() || typeof crypto.randomUUID !== 'function') return;
    if (!uuid.test(choice() || '') && !saveChoice(crypto.randomUUID())) return;
    if (prompt) prompt.hidden = true;
    if (page === 'landing' || page === 'game') collect(page === 'landing' ? 'landing' : 'visit');
    updateSettings();
  }

  function optOut() {
    saveChoice('off');
    clearVisit();
    if (prompt) prompt.hidden = true;
    updateSettings();
  }

  function showChoice() {
    if (!enabled || privacySignal() || choice() || page === 'privacy' || prompt ||
        document.visibilityState !== 'visible' || document.documentElement.dataset.flightIntro === 'playing') return;
    prompt = document.createElement('aside');
    prompt.className = 'traffic-choice';
    prompt.setAttribute('aria-label', 'Optional analytics');
    prompt.innerHTML = '<p>Help us understand how people find and play Aerie.</p><div>' +
      '<button type="button">Allow analytics</button><button type="button">No thanks</button>' +
      '<a href="/join/policies/#traffic-privacy">Privacy</a></div>';
    const [allow, decline] = prompt.querySelectorAll('button');
    allow.addEventListener('click', optIn);
    decline.addEventListener('click', optOut);
    document.body.append(prompt);
  }

  function offerChoice(delay = 600) {
    clearTimeout(promptTimer);
    if (enabled && !privacySignal() && !choice() && page !== 'privacy') promptTimer = setTimeout(showChoice, delay);
  }

  function configure(allowed) {
    if (redirected) return;
    const wasEnabled = enabled;
    enabled = allowed === true;
    if (!enabled) {
      pendingFlight = false;
      if (prompt) prompt.hidden = true;
    } else if (!wasEnabled) {
      if (page === 'landing' || page === 'game') collect(page === 'landing' ? 'landing' : 'visit');
      if (pendingFlight) collect('flight');
      pendingFlight = false;
      if (prompt) prompt.hidden = Boolean(choice()) || privacySignal();
      else offerChoice();
    }
    updateSettings();
  }

  if (!uuid.test(choice() || '')) clearVisit();
  else if (privacySignal()) optOut();
  document.addEventListener('aerie:flight-intro-end', () => offerChoice(800));
  document.addEventListener('visibilitychange', () => offerChoice());
  window.addEventListener('aerie:traffic-config', event => configure(event.detail));
  window.addEventListener('aerie:checkout-handoff', () => collect('checkout'));
  window.addEventListener('aerie:flight-started', () => {
    if (enabled) collect('flight');
    else pendingFlight = !privacySignal() && uuid.test(choice() || '');
  });
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    if (page === 'landing' || page === 'game') collect(page === 'landing' ? 'landing' : 'visit');
    if (prompt && choice()) prompt.hidden = true;
    else offerChoice();
  });

  if (page !== 'landing') document.addEventListener('DOMContentLoaded', () => {
    if (redirected) return;
    if (page === 'privacy') {
      document.getElementById('traffic-toggle')?.addEventListener('click', () => {
        if (uuid.test(choice() || '')) optOut();
        else optIn();
      });
      updateSettings();
    }
    fetch('/api/aerie/config', { credentials: 'omit' })
      .then(response => response.ok ? response.json() : null)
      .then(config => configure(config?.traffic === true))
      .catch(() => configure(false));
  }, { once: true });
})();
