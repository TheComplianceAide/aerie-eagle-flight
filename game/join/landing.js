(() => {
  'use strict';

  const byId = id => document.getElementById(id);
  const canonicalUrl = document.querySelector('link[rel="canonical"]').href;
  const api = '/api/aerie';
  const fields = {
    signup: { unavailable: 'Email signup is currently unavailable.', accepted: 'You’re on the flight list.' },
    checkout: { unavailable: 'Checkout is currently unavailable.' },
    'share-claim': { unavailable: 'Claims are currently unavailable.', accepted: 'Your post is queued for review. Use Restore access to check whether your worlds are unlocked.' },
    restore: { unavailable: 'Access recovery is currently unavailable.', accepted: 'If we can send an access link to that address, it will arrive by email.' }
  };
  const configKeys = { signup: 'signup', checkout: 'checkout', 'share-claim': 'shareClaims', restore: 'restore' };
  const forms = [...document.querySelectorAll('form[data-form]')];

  async function request(path, body) {
    const opts = { credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store' };
    if (body) {
      opts.method = 'POST';
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const response = await fetch(api + path, opts);
    if (response.ok && response.headers.get('content-type')?.includes('application/json')) return response.json();
    throw new Error(response.status === 429 ? 'Too many attempts. Try again in a few minutes.' :
      'This could not be completed. Please try again.');
  }

  function show(dialog) {
    if (!dialog.open) dialog.showModal();
  }

  for (const button of document.querySelectorAll('[data-close]')) {
    button.addEventListener('click', () => button.closest('dialog').close());
  }

  const filmDialog = byId('film-dialog');
  const featureFilm = byId('feature-film');
  const heroFlight = byId('mount-major-flight');
  const heroMotion = byId('hero-motion');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const saveData = navigator.connection?.saveData;
  let backgroundEnabled = true;
  let heroInView = true;

  function updateHeroFlight() {
    if (backgroundEnabled && heroInView && !document.hidden && !filmDialog.open && !reducedMotion.matches && !saveData) {
      if (!heroFlight.getAttribute('src')) heroFlight.src = heroFlight.dataset.src;
      heroFlight.play().catch(() => {});
    } else {
      heroFlight.pause();
    }
  }

  heroFlight.addEventListener('playing', () => {
    heroFlight.classList.add('is-visible');
    heroMotion.hidden = false;
  });
  heroMotion.addEventListener('click', () => {
    backgroundEnabled = !backgroundEnabled;
    heroMotion.textContent = backgroundEnabled ? 'Pause background' : 'Play background';
    updateHeroFlight();
  });
  reducedMotion.addEventListener('change', updateHeroFlight);
  document.addEventListener('visibilitychange', updateHeroFlight);
  new IntersectionObserver(([entry]) => {
    heroInView = entry.isIntersecting;
    if (document.readyState === 'complete') updateHeroFlight();
  }).observe(heroFlight.parentElement);
  if (document.readyState === 'complete') updateHeroFlight();
  else window.addEventListener('load', updateHeroFlight, {once:true});

  byId('watch-film').addEventListener('click', () => {
    show(filmDialog);
    updateHeroFlight();
    if (!featureFilm.getAttribute('src')) featureFilm.src = featureFilm.dataset.src;
    featureFilm.play().catch(() => {});
  });
  filmDialog.addEventListener('close', () => {
    featureFilm.pause();
    updateHeroFlight();
  });

  const worldGallery = byId('worlds');
  const previewCards = [...worldGallery.querySelectorAll('[data-world-preview]')];
  const connection = navigator.connection;
  const previewVideo = document.createElement('video');
  previewVideo.muted = true;
  previewVideo.defaultMuted = true;
  previewVideo.loop = true;
  previewVideo.playsInline = true;
  previewVideo.preload = 'none';
  previewVideo.setAttribute('aria-hidden', 'true');
  let previewsEnabled;
  let activeCard;
  let queuedCard;
  let previewTimer;
  let previewPlayback;
  let hold;
  const previewObserver = new IntersectionObserver(entries => {
    for (const {target, isIntersecting} of entries) {
      if (!isIntersecting) stopPreview(target);
    }
  });

  function stopPreview(card) {
    if (!card) return;
    if (queuedCard === card) {
      clearTimeout(previewTimer);
      queuedCard = null;
    }
    if (activeCard === card) {
      activeCard = null;
      previewPlayback = null;
      previewObserver.unobserve(card);
      previewVideo.classList.remove('is-visible');
      previewVideo.pause();
    }
  }

  function startPreview(card) {
    if (!previewsEnabled || document.hidden || activeCard === card) return;
    stopPreview(activeCard);
    activeCard = card;
    card.append(previewVideo);
    previewObserver.observe(card);
    const src = 'media/world-previews/' + card.dataset.worldPreview + '.mp4';
    if (previewVideo.getAttribute('src') !== src) previewVideo.src = src;
    const playback = previewVideo.play();
    previewPlayback = playback;
    playback.then(() => {
      if (previewPlayback === playback) previewVideo.classList.add('is-visible');
    }).catch(() => {
      if (previewPlayback === playback) stopPreview(card);
    });
  }

  function queuePreview(card, delay) {
    if (!previewsEnabled) return;
    stopPreview(queuedCard);
    queuedCard = card;
    previewTimer = setTimeout(() => {
      queuedCard = null;
      startPreview(card);
    }, delay);
  }

  function finishHold(event) {
    if (!hold || (event && hold.pointerId !== event.pointerId)) return;
    stopPreview(hold.card);
    hold = null;
  }

  function stopAllPreviews() {
    finishHold();
    stopPreview(queuedCard);
    stopPreview(activeCard);
  }

  function updatePreviewPreference() {
    previewsEnabled = !reducedMotion.matches && !connection?.saveData;
    worldGallery.classList.toggle('previews-static', !previewsEnabled);
    for (const card of previewCards) {
      card.disabled = !previewsEnabled;
    }
    if (!previewsEnabled) stopAllPreviews();
  }

  for (const card of previewCards) {
    card.addEventListener('pointerenter', event => {
      if (event.pointerType === 'mouse') queuePreview(card, 110);
    });
    card.addEventListener('pointerleave', event => {
      if (event.pointerType === 'mouse') stopPreview(card);
    });
    card.addEventListener('focus', () => {
      if (!hold && card.matches(':focus-visible')) startPreview(card);
    });
    card.addEventListener('blur', () => stopPreview(card));
    card.addEventListener('click', event => {
      if (event.detail === 0 && card.matches(':focus-visible')) startPreview(card);
    });
    card.addEventListener('pointerdown', event => {
      if (!previewsEnabled || event.pointerType === 'mouse' || !event.isPrimary) return;
      finishHold();
      hold = {card, pointerId: event.pointerId, x: event.clientX, y: event.clientY};
      queuePreview(card, 240);
    });
    card.addEventListener('contextmenu', event => {
      if (hold?.card === card) event.preventDefault();
    });
  }
  window.addEventListener('pointermove', event => {
    if (hold?.pointerId === event.pointerId && Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > 12) finishHold(event);
  }, {passive: true});
  window.addEventListener('pointerup', finishHold);
  window.addEventListener('pointercancel', finishHold);
  window.addEventListener('blur', stopAllPreviews);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopAllPreviews();
  });
  reducedMotion.addEventListener('change', updatePreviewPreference);
  connection?.addEventListener?.('change', updatePreviewPreference);
  updatePreviewPreference();

  async function copy(value, status, success) {
    try {
      if (!navigator.clipboard) throw new Error();
      await navigator.clipboard.writeText(value);
      status.textContent = success;
    } catch {
      status.textContent = 'Select and copy ' + value;
    }
  }

  const shareMessage = byId('share-message');
  const shareDialog = byId('share-dialog');
  const shareIntro = 'Hey, I like this game. I hope you do too!';
  const claimStarter = 'Aerie offered me three additional worlds for sharing my experience. I flew as an eagle over Lake Winnipesaukee.';
  const suggestedPost = byId('suggested-post');
  const nativeShare = byId('native-share');
  let sharingClaim = false;

  function openShare(isClaim) {
    sharingClaim = isClaim;
    byId('share-title').textContent = isClaim ? 'Share a flight' : 'Tell a friend';
    byId('share-instructions').textContent = isClaim
      ? 'After flying Aerie, share your experience and mention the three-world reward.'
      : 'Send a friend a free flight at Lake Winnipesaukee.';
    byId('claim-details').hidden = !isClaim;
    suggestedPost.value = claimStarter + ' ' + canonicalUrl;
    shareMessage.textContent = '';
    nativeShare.hidden = typeof navigator.share !== 'function';
    byId('linkedin-share').href = 'https://www.linkedin.com/sharing/share-offsite/?' + new URLSearchParams({ url: canonicalUrl });
    byId('x-share').href = 'https://twitter.com/intent/tweet?' + new URLSearchParams({
      url: canonicalUrl,
      text: isClaim ? claimStarter : shareIntro
    });
    show(shareDialog);
  }

  byId('copy-share').addEventListener('click', () => copy(canonicalUrl, shareMessage, 'Aerie link copied.'));
  byId('copy-post').addEventListener('click', () => copy(suggestedPost.value, shareMessage, 'Post copied.'));
  function shareAerie(isClaim) {
    return navigator.share({ title: 'Aerie · Take Flight', text: isClaim ? claimStarter : shareIntro, url: canonicalUrl });
  }

  nativeShare.addEventListener('click', async () => {
    try {
      await shareAerie(sharingClaim);
    } catch (error) {
      if (error.name !== 'AbortError') shareMessage.textContent = 'You can use Copy link to share Aerie.';
    }
  });

  byId('send-free-flight').addEventListener('click', async () => {
    if (typeof navigator.share !== 'function') {
      openShare(false);
      return;
    }
    try {
      await shareAerie(false);
    } catch (error) {
      if (error.name !== 'AbortError') openShare(false);
    }
  });

  const params = new URLSearchParams(location.search);
  const fragment = new URLSearchParams(location.hash.slice(1));
  const pendingGiftKey = 'aerie.pendingGift';
  let restoreToken = fragment.get('restore');
  let pendingGift = fragment.get('gift') || params.get('gift');
  try {
    if (pendingGift) sessionStorage.setItem(pendingGiftKey, pendingGift);
    else pendingGift = sessionStorage.getItem(pendingGiftKey);
  } catch {
    // An existing link remains usable when browser storage is disabled.
  }

  function clearLinkParameter(key) {
    const cleanedUrl = new URL(location.href);
    cleanedUrl.searchParams.delete(key);
    fragment.delete(key);
    cleanedUrl.hash = fragment.toString();
    history.replaceState(null, '', cleanedUrl);
  }

  if (pendingGift && (fragment.has('gift') || params.has('gift'))) clearLinkParameter('gift');

  const restoreDialog = byId('restore-dialog');
  const restoreIntro = byId('restore-intro');
  const restoreForm = byId('restore-form');
  const confirmRestore = byId('confirm-restore');
  const confirmMessage = byId('restore-confirm-message');
  const giftDetails = byId('gift-details');
  const giftMessage = byId('gift-message');
  const redeemGift = byId('redeem-gift');
  const copyGift = byId('copy-gift');
  const playUnlocked = byId('play-unlocked');
  let status;
  let giftUrl;
  let restoreAvailable = false;

  function readGift(value) {
    try {
      const url = new URL(value, location.origin);
      if (url.origin === location.origin && /\/join\/?$/.test(url.pathname) &&
          (url.hash.startsWith('#gift=') || url.searchParams.has('gift'))) return url.href;
    } catch {}
  }

  function updateRestore() {
    const authenticated = status?.authenticated === true;
    const emailVerified = status?.emailVerified === true;
    const needsConfirmation = Boolean(restoreToken);
    confirmRestore.hidden = !needsConfirmation;
    confirmRestore.disabled = !restoreAvailable;
    confirmMessage.hidden = !needsConfirmation;
    restoreForm.hidden = needsConfirmation || (authenticated && !(pendingGift && !emailVerified));
    restoreIntro.textContent = needsConfirmation ? 'Confirm that you want to open your Aerie access on this device.' :
      pendingGift ? 'Verify your email to claim the pass a friend sent you.' :
      authenticated ? 'Your email is verified on this device.' :
      'Use your purchase or claim email to restore access on this device.';

    giftUrl = readGift(status?.giftUrl);
    const extraWorlds = Array.isArray(status?.worlds) && status.worlds.some(world => world !== 'winnipesaukee');
    const hasAccess = authenticated && (status.fullAccess === true || extraWorlds);
    redeemGift.hidden = !pendingGift || !emailVerified || needsConfirmation;
    copyGift.hidden = !giftUrl;
    playUnlocked.hidden = !hasAccess;
    giftDetails.hidden = !pendingGift && !giftUrl && !hasAccess;
    giftMessage.textContent = pendingGift && emailVerified ? 'Your Founder Pass gift is ready to redeem.' :
      pendingGift ? 'Your gift is held by its private link until you verify your email.' :
      giftUrl ? 'Your gift link opens the full game for one friend.' :
      hasAccess ? 'Your unlocked worlds are ready to fly.' : '';
  }

  async function refreshStatus() {
    try { status = await request('/status'); } catch { status = null; }
    updateRestore();
  }

  confirmRestore.addEventListener('click', async () => {
    confirmRestore.disabled = true;
    confirmMessage.textContent = 'Confirming your access…';
    try {
      const result = await request('/restore/confirm', { token: restoreToken });
      if (result.ok !== true) throw new Error('This access link could not be confirmed.');
      if (typeof result.giftCode === 'string' && result.giftCode) {
        pendingGift = result.giftCode;
        try { sessionStorage.setItem(pendingGiftKey, pendingGift); } catch {}
      }
      restoreToken = null;
      clearLinkParameter('restore');
      await refreshStatus();
      if (!status?.authenticated) throw new Error('Please request a fresh access link.');
    } catch (error) {
      confirmMessage.hidden = false;
      confirmMessage.textContent = error.message;
      confirmRestore.disabled = !restoreAvailable;
      restoreForm.hidden = false;
    }
  });

  redeemGift.addEventListener('click', async () => {
    redeemGift.disabled = true;
    try {
      const result = await request('/gift/redeem', { code: pendingGift });
      if (result.ok !== true) throw new Error('This gift could not be redeemed.');
      pendingGift = null;
      try { sessionStorage.removeItem(pendingGiftKey); } catch {}
      await refreshStatus();
      if (status?.fullAccess === true) giftMessage.textContent = 'Gift redeemed. All worlds are ready to fly.';
    } catch (error) {
      giftMessage.textContent = error.message;
    } finally {
      redeemGift.disabled = false;
    }
  });

  copyGift.addEventListener('click', () => {
    if (giftUrl) copy(giftUrl, giftMessage, 'Gift link copied. Send it privately to your friend.');
  });

  const checkoutLaunch = byId('checkout-launch');
  const checkoutAvailability = byId('checkout-availability');
  let checkoutCollectsEmail = false;

  async function openStripeCheckout(payload) {
    const {url} = await request('/checkout', payload);
    const destination = new URL(url);
    if (destination.origin !== 'https://checkout.stripe.com') throw new Error('A verified Stripe Checkout address was unavailable.');
    location.assign(destination.href);
  }

  checkoutLaunch.addEventListener('click', async () => {
    if (!checkoutCollectsEmail) {
      show(byId('purchase-dialog'));
      return;
    }
    checkoutLaunch.disabled = true;
    checkoutAvailability.textContent = 'Opening Stripe…';
    try {
      await openStripeCheckout({});
    } catch (error) {
      checkoutAvailability.textContent = error instanceof TypeError ? 'Checkout could not be opened. Please try again.' : error.message;
    } finally {
      checkoutLaunch.disabled = false;
    }
  });

  for (const button of document.querySelectorAll('[data-open]')) {
    button.addEventListener('click', () => {
      const action = button.dataset.open;
      if (action === 'restore') {
        updateRestore();
        show(restoreDialog);
        refreshStatus();
      }
      if (action === 'claim' || action === 'share') openShare(action === 'claim');
    });
  }

  for (const form of forms) {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const name = form.dataset.form;
      const fieldset = form.querySelector('fieldset');
      const output = form.querySelector('.form-status');
      if (fieldset.disabled) return;
      const payload = Object.fromEntries(new FormData(form));
      for (const key of Object.keys(payload)) payload[key] = payload[key].trim();
      if (name === 'restore' && pendingGift) payload.gift = pendingGift;
      if (name === 'share-claim') {
        try {
          if (new URL(payload.postUrl).protocol !== 'https:') throw new Error();
        } catch {
          output.textContent = 'Enter the HTTPS link to your public post.';
          return;
        }
      }

      fieldset.disabled = true;
      output.textContent = name === 'checkout' ? 'Opening Stripe…' : 'Submitting…';
      try {
        if (name === 'checkout') {
          await openStripeCheckout(payload);
          return;
        }
        const result = await request('/' + name, payload);
        if (result.ok !== true) throw new Error('This could not be completed. Please try again.');
        output.textContent = fields[name].accepted;
        form.reset();
      } catch (error) {
        output.textContent = error instanceof TypeError ? 'This could not be completed. Please try again.' : error.message;
      } finally {
        fieldset.disabled = false;
      }
    });
  }

  async function prepare() {
    let config;
    try { config = await request('/config'); } catch {}
    function enabled(key) {
      return (config?.[key] ?? config?.features?.[key] ??
        (key === 'shareClaims' ? config?.features?.shareClaim : false)) === true;
    }
    for (const form of forms) {
      const name = form.dataset.form;
      const available = enabled(configKeys[name]);
      form.querySelector('fieldset').disabled = !available;
      form.querySelector('.form-status').textContent = available ? '' : fields[name].unavailable;
    }
    restoreAvailable = enabled('restore');
    if (enabled('checkout')) {
      const testCheckout = config.checkoutMode === 'test';
      checkoutCollectsEmail = enabled('checkoutCollectsEmail');
      if (testCheckout) {
        byId('checkout-label').textContent = 'Open test checkout';
        byId('purchase-mode-note').hidden = false;
      }
      checkoutAvailability.textContent = testCheckout ? 'Test checkout. No real payment will be collected.' : 'Applicable tax is calculated at checkout.';
      byId('flight-price').textContent = typeof config.priceLabel === 'string' && config.priceLabel
        ? config.priceLabel + ' for both passes'
        : 'One-time purchase';
    }

    const checkoutState = params.get('checkout');
    if (checkoutState || pendingGift || restoreToken) await refreshStatus();
    const messages = {
      success: status?.fullAccess === true ? 'Your Founder Pass is ready. Open Restore access to get your gift link.' :
        'Use your checkout email to restore your Founder Pass.',
      pending: 'Your payment is still being confirmed. You can use Restore access with your checkout email.',
      cancel: 'Checkout canceled. Lake Winnipesaukee is ready whenever you want to fly.'
    };
    if (Object.hasOwn(messages, checkoutState)) {
      byId('return-notice').hidden = false;
      byId('return-message').textContent = messages[checkoutState];
      clearLinkParameter('checkout');
    }
    if (pendingGift || restoreToken || (checkoutState === 'success' && status?.fullAccess === true)) show(restoreDialog);
  }

  prepare();
})();
