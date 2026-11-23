(() => {
  'use strict';

  const root = document.documentElement;
  if (root.dataset.flightIntro !== 'playing') return;

  const video = document.getElementById('mount-major-flight');
  const skip = document.getElementById('flight-intro-skip');
  const mobile = matchMedia('(max-width: 740px) and (prefers-reduced-motion: no-preference)');
  const events = new AbortController();
  const listen = { signal: events.signal };
  const introSeconds = 15;
  const stallMs = 4000;
  let watchdog;
  let lastPosition = 0;

  function finish(focusHeading = false) {
    if (root.dataset.flightIntro !== 'playing') return;
    root.dataset.flightIntro = 'shown';
    document.dispatchEvent(new Event('aerie:flight-intro-end'));
    if (focusHeading) {
      const heading = document.getElementById('hero-title');
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }

  function armWatchdog() {
    clearTimeout(watchdog);
    watchdog = setTimeout(finish, stallMs);
  }

  document.addEventListener('aerie:flight-intro-end', () => {
    clearTimeout(watchdog);
    skip.hidden = true;
    events.abort();
  }, { once: true });

  skip.hidden = false;
  skip.addEventListener('click', event => finish(event.detail === 0), listen);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') finish(document.activeElement === skip);
  }, listen);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) finish();
  }, listen);
  window.addEventListener('hashchange', () => finish(), listen);
  window.addEventListener('aerie:ticket-status', event => {
    if (event.detail?.fullAccess) finish();
  }, listen);
  mobile.addEventListener('change', () => {
    if (!mobile.matches) finish();
  }, listen);

  video.addEventListener('playing', () => video.classList.add('is-visible'), listen);
  video.addEventListener('timeupdate', () => {
    const seconds = video.currentTime;
    if (seconds >= introSeconds) finish();
    else if (seconds > lastPosition) {
      lastPosition = seconds;
      armWatchdog();
    }
  }, listen);
  video.addEventListener('error', () => finish(), listen);

  try { sessionStorage.setItem('aerie.flightIntroSeen', '1'); } catch {}
  armWatchdog();
  window.setAerieHeroPlaying(true);
})();
