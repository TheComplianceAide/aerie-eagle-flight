(() => {
  'use strict';

  const byId = id => document.getElementById(id);
  const canonicalUrl = document.querySelector('link[rel="canonical"]').href;
  const api = '/api/aerie';
  const fields = {
    signup: { unavailable: 'Email signup is currently unavailable.', accepted: 'You’re on the flight list.' },
    checkout: { unavailable: 'Checkout is currently unavailable.' },
    'share-claim': { unavailable: 'Claims are currently unavailable.', accepted: 'Your post is queued for review. Use Restore access to check whether your five worlds are unlocked.' },
    restore: { unavailable: 'Access recovery is currently unavailable.', accepted: 'If we can send an access link to that address, it will arrive by email.' }
  };
  const configKeys = { signup: 'signup', checkout: 'checkout', 'share-claim': 'shareClaims', restore: 'restore' };
  const forms = [...document.querySelectorAll('form[data-form]')];

  async function request(path, body, timeout) {
    const opts = { credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store' };
    if (body) {
      opts.method = 'POST';
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const controller = timeout ? new AbortController() : null;
    const timer = controller && setTimeout(() => controller.abort(), timeout);
    if (controller) opts.signal = controller.signal;
    try {
      const response = await fetch(api + path, opts);
      if (response.ok && response.headers.get('content-type')?.includes('application/json')) return await response.json();
      const error = new Error(response.status === 429 ? 'Too many attempts. Try again in a few minutes.' :
        'This could not be completed. Please try again.');
      error.status = response.status;
      if (path === '/checkout' && response.status === 409 && response.headers.get('content-type')?.includes('application/json')) {
        const details = await response.json().catch(() => null);
        error.offerChanged = details?.offerChanged === true;
      }
      if (path === '/restore/confirm' && response.headers.get('content-type')?.includes('application/json')) {
        const details = await response.json().catch(() => null);
        error.codeInvalid = details?.codeInvalid === true;
        error.codeAttemptsExceeded = details?.codeAttemptsExceeded === true;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
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

  async function copy(value, status, success, onUnavailable) {
    try {
      if (!navigator.clipboard) throw new Error();
      await navigator.clipboard.writeText(value);
      status.textContent = success;
    } catch {
      if (onUnavailable) onUnavailable();
      else status.textContent = 'Select and copy ' + value;
    }
  }

  const shareMessage = byId('share-message');
  const shareDialog = byId('share-dialog');
  const shareIntro = 'Hey, I like this game. I hope you do too!';
  const friendInvite = `${shareIntro} Aerie offers me five more worlds for sharing with five friends.`;
  const claimStarter = `${shareIntro} Aerie offers me five additional worlds for sharing my experience.`;
  const suggestedPost = byId('suggested-post');
  const nativeShare = byId('native-share');
  const sharePhoto = byId('share-photo');
  const photoDownload = byId('instagram-image');
  let flightPhoto;
  let loadingPhoto = false;
  const friendConfirm = byId('confirm-friend-share');
  const friendShareStatus = byId('friend-share-status');
  let sharingClaim = false;
  let friendShareBusy = false;
  let friendRewardEarned = false;

  function shareOfferAvailable(config) {
    return enabled(config, 'shareClaims') && Array.isArray(config.rewardWorlds) && config.rewardWorlds.length === 5;
  }

  function hasFriendReward() {
    return friendRewardEarned || (shareOfferAvailable(checkoutConfig) &&
      checkoutConfig.rewardWorlds.every(world => status?.worlds?.includes(world)));
  }

  function updateFriendOffer() {
    const available = shareOfferAvailable(checkoutConfig);
    const earned = status?.fullAccess === true || hasFriendReward();
    friendConfirm.hidden = earned;
    friendConfirm.disabled = !available || friendShareBusy;
    const play = byId('friend-play');
    play.hidden = !earned;
    byId('friend-save').hidden = !earned || status?.authenticated === true || !enabled(checkoutConfig, 'restore');
    if (earned) {
      const flight = new URLSearchParams({ world: checkoutConfig?.rewardWorlds?.[0] || 'moosehead', launch: 'grand' });
      play.href = `../?play=1&fly=1#${flight}`;
      friendShareStatus.textContent = 'Your five worlds are ready to fly.';
    }
    else if (checkoutConfig === undefined) friendShareStatus.textContent = 'Checking unlock availability…';
    else if (!available) friendShareStatus.textContent = 'Friend unlocks are temporarily unavailable.';
  }

  function openShare(isClaim, channel = '') {
    sharingClaim = isClaim;
    byId('share-title').textContent = isClaim ? 'Unlock 5 worlds' : 'Tell a friend';
    byId('share-instructions').textContent = isClaim
      ? 'Invite five friends or submit an honest public post.'
      : 'Share the free flight at Lake Winnipesaukee.';
    byId('friend-details').hidden = !isClaim;
    byId('post-instructions').hidden = !isClaim;
    byId('claim-submission').hidden = !isClaim;
    byId('claim-details').open = !isClaim || Boolean(channel && channel !== 'messages');
    byId('instagram-instructions').hidden = channel !== 'instagram';
    byId('instagram-open').hidden = channel !== 'instagram';
    byId('post-share-summary').textContent = isClaim ? 'Post publicly for review' : 'Share on social media';
    suggestedPost.value = withShareLink(claimStarter);
    shareMessage.textContent = '';
    byId('copy-share').textContent = isClaim ? 'Copy invitation' : 'Copy link';
    nativeShare.hidden = typeof navigator.share !== 'function';
    byId('linkedin-share').href = 'https://www.linkedin.com/sharing/share-offsite/?' + new URLSearchParams({ url: canonicalUrl });
    const whatsapp = byId('whatsapp-share');
    if (whatsapp) {
      const message = isClaim ? friendInvite : shareIntro;
      whatsapp.href = 'https://wa.me/?' + new URLSearchParams({ text: withShareLink(message) });
      byId('telegram-share').href = 'https://t.me/share/url?' + new URLSearchParams({ url: canonicalUrl, text: message });
      byId('facebook-share').hidden = isClaim;
      byId('facebook-share').href = 'https://www.facebook.com/sharer/sharer.php?' + new URLSearchParams({ u: canonicalUrl });
      byId('bluesky-share').hidden = isClaim;
      byId('bluesky-share').href = 'https://bsky.app/intent/compose?' + new URLSearchParams({ text: withShareLink(shareIntro) });
    }
    updatePostLink();
    if (isClaim) updateFriendOffer();
    show(shareDialog);
  }

  function withShareLink(value) {
    const text = value.trim();
    const urls = text.match(/https?:\/\/[^\s<>"“”]+/gi) || [];
    return urls.some(url => url.replace(/[)\],.!?;:]+$/, '') === canonicalUrl)
      ? text : `${text}\n${canonicalUrl}`;
  }

  // Prepare the attachment before the tap that opens the system share sheet.
  byId('claim-details').addEventListener('toggle', async event => {
    if (!event.currentTarget.open || flightPhoto || loadingPhoto ||
        typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return;
    loadingPhoto = true;
    try {
      const response = await fetch(photoDownload.href);
      if (!response.ok) return;
      const blob = await response.blob();
      if (blob.type !== 'image/jpeg' || !blob.size) return;
      const photo = new File([blob], photoDownload.download, { type: blob.type });
      if (navigator.canShare({ files: [photo] })) {
        flightPhoto = photo;
        sharePhoto.hidden = false;
      }
    } catch {
      // Keep the download option when the browser cannot prepare the attachment.
    } finally {
      loadingPhoto = false;
    }
  });

  sharePhoto.addEventListener('click', async () => {
    if (!flightPhoto) return;
    shareMessage.textContent = '';
    const files = [flightPhoto];
    const text = withShareLink(sharingClaim ? suggestedPost.value : shareIntro);
    try {
      await navigator.share(navigator.canShare({ files, text }) ? { files, text } : { files });
    } catch (error) {
      if (error.name !== 'AbortError') {
        shareMessage.textContent = 'Save the Instagram image to share it from your photos.';
        photoDownload.focus();
      }
    }
  });

  function updatePostLink() {
    const text = withShareLink(sharingClaim ? suggestedPost.value : shareIntro);
    byId('x-share').href = 'https://twitter.com/intent/tweet?' + new URLSearchParams({ text });
  }

  suggestedPost.addEventListener('input', updatePostLink);
  byId('copy-share').addEventListener('click', () => {
    const value = sharingClaim ? withShareLink(friendInvite) : canonicalUrl;
    copy(value, shareMessage, sharingClaim ? 'Invitation copied.' : 'Aerie link copied.');
  });
  byId('copy-post').addEventListener('click', () => copy(withShareLink(suggestedPost.value), shareMessage, 'Post copied.'));
  function shareAerie(isClaim) {
    return navigator.share({ title: 'Aerie · Take Flight', text: isClaim ? friendInvite : shareIntro, url: canonicalUrl });
  }

  for (const link of document.querySelectorAll('a[href="#invite"]')) {
    link.addEventListener('click', event => {
      event.preventDefault();
      openShare(true);
    });
  }
  for (const button of document.querySelectorAll('[data-ticket-share]')) {
    button.addEventListener('click', () => {
      const channel = button.dataset.ticketShare;
      openShare(true, channel);
      if (channel === 'instagram') {
        if (flightPhoto) sharePhoto.click();
        else photoDownload.focus();
      } else if (channel === 'messages') {
        const action = nativeShare.hidden ? byId('copy-share') : nativeShare;
        action.focus();
        action.click();
      } else {
        const link = byId(`${channel}-share`);
        link.focus();
        link.click();
      }
    });
  }

  friendConfirm.addEventListener('click', async () => {
    if (friendConfirm.disabled || friendRewardEarned) return;
    friendShareBusy = true;
    friendShareStatus.textContent = 'Unlocking your worlds…';
    updateFriendOffer();
    try {
      const result = await request('/share-friends', { sharedWithFive: true }, 12000);
      if (result.ok !== true || !Array.isArray(result.worlds) || !checkoutConfig.rewardWorlds.every(world => result.worlds.includes(world))) {
        throw new Error('Your worlds could not be unlocked. Try again.');
      }
      friendRewardEarned = true;
      updateFriendOffer();
      byId('friend-play').focus();
      await refreshStatus(true);
    } catch (error) {
      friendShareStatus.textContent = error.name === 'AbortError' || error instanceof TypeError
        ? 'Your unlock could not be checked. Try again.' : error.message;
    } finally {
      friendShareBusy = false;
      updateFriendOffer();
    }
  });

  nativeShare.addEventListener('click', async () => {
    try {
      await shareAerie(sharingClaim);
    } catch (error) {
      if (error.name !== 'AbortError') shareMessage.textContent = 'You can use Copy link to share Aerie.';
    }
  });

  byId('send-free-flight').addEventListener('click', () => {
    openShare(false);
    if (!nativeShare.hidden) nativeShare.click();
  });

  const params = new URLSearchParams(location.search);
  const fragment = new URLSearchParams(location.hash.slice(1));
  const pendingGiftKey = 'aerie.pendingGift';
  const checkoutVisitKey = 'aerie.checkoutVisit';
  const checkoutReturn = params.get('checkout');
  const explicitCheckoutReturn = ['success', 'pending', 'cancel', 'preview-ended'].includes(checkoutReturn);
  let checkoutState = explicitCheckoutReturn ? checkoutReturn : null;
  try {
    if (!checkoutState) {
      const saved = JSON.parse(sessionStorage.getItem(checkoutVisitKey));
      if (saved?.until > Date.now() && ['started', 'pending', 'success'].includes(saved.state)) {
        checkoutState = saved.state;
      }
    }
  } catch {}

  function rememberCheckout(state) {
    checkoutState = state;
    try {
      if (state === 'cancel' || state === 'preview-ended') sessionStorage.removeItem(checkoutVisitKey);
      else sessionStorage.setItem(checkoutVisitKey, JSON.stringify({state, until: Date.now() + 86400000}));
    } catch {}
  }

  // Older home-screen icons and buyer email links both used #play.
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let playRequested = fragment.has('play') && !standalone;
  const restoreRequested = fragment.has('restore-ticket');
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
    if (fragment.has(key)) {
      fragment.delete(key);
      cleanedUrl.hash = fragment.toString();
    }
    history.replaceState(null, '', cleanedUrl);
  }

  if (pendingGift && (fragment.has('gift') || params.has('gift'))) clearLinkParameter('gift');
  if (explicitCheckoutReturn) {
    rememberCheckout(checkoutState);
    clearLinkParameter('checkout');
  }

  const restoreDialog = byId('restore-dialog');
  const restoreIntro = byId('restore-intro');
  const restoreForm = byId('restore-form');
  const confirmForm = byId('restore-confirm-form');
  const confirmRestore = byId('confirm-restore');
  const confirmMessage = byId('restore-confirm-message');
  const restoreCodeField = byId('restore-code-field');
  const restoreCode = byId('restore-code');
  const requestRestoreAgain = byId('request-restore-again');
  const giftDetails = byId('gift-details');
  const giftMessage = byId('gift-message');
  const redeemGift = byId('redeem-gift');
  const copyGift = byId('copy-gift');
  const shareGift = byId('share-gift');
  const giftLink = byId('gift-link');
  const giftSummary = giftLink.querySelector('summary');
  const giftInput = byId('gift-url');
  const playUnlocked = byId('play-unlocked');
  let status;
  let statusRequest;
  let statusCheckedAt = 0;
  let statusVersion = 0;
  let giftUrl;
  let receiptUrl;
  let restoreAvailable = false;
  let codeRequired = false;
  let confirmInProgress = false;
  let confirmLocked = false;
  let showRequestForm = false;

  function readGift(value) {
    try {
      const url = new URL(value, location.origin);
      if (url.origin === location.origin && /\/join\/?$/.test(url.pathname) &&
          (url.hash.startsWith('#gift=') || url.searchParams.has('gift'))) return url.href;
    } catch {}
  }

  function readReceipt(value) {
    if (typeof value !== 'string') return;
    try {
      const url = new URL(value);
      if (url.origin === 'https://pay.stripe.com' && !url.username && !url.password &&
          /^\/receipts\/payment\/[A-Za-z0-9_-]+$/.test(url.pathname)) return url.href;
    } catch {}
  }

  function updateReceiptLink(link) {
    link.hidden = !receiptUrl;
    if (receiptUrl) link.href = receiptUrl;
    else link.removeAttribute('href');
  }

  function updateRestore() {
    const authenticated = status?.authenticated === true;
    const emailVerified = status?.emailVerified === true;
    const needsConfirmation = Boolean(restoreToken);
    confirmForm.hidden = !needsConfirmation;
    confirmRestore.disabled = !restoreAvailable || confirmInProgress || confirmLocked;
    confirmRestore.textContent = codeRequired ? 'Verify code' : 'Continue to Aerie';
    restoreCodeField.hidden = !codeRequired;
    restoreCode.disabled = !codeRequired || confirmRestore.disabled;
    requestRestoreAgain.disabled = confirmInProgress;
    restoreForm.hidden = needsConfirmation || (!showRequestForm && authenticated && !(pendingGift && !emailVerified));
    restoreIntro.textContent = codeRequired ? 'Enter the 8-digit code from your Aerie access email.' :
      needsConfirmation ? 'Confirm that you want to open your Aerie access on this device.' :
      pendingGift ? (emailVerified ? 'Your email is verified. Redeem your gift to unlock all worlds.' :
        'Verify your email to claim the pass a friend sent you.') :
      emailVerified ? 'Your email is verified on this device.' :
      authenticated ? 'Your Aerie access is open here. Use your checkout email to restore it on another device.' :
      hasFriendReward() ? 'Verify your email to keep your five worlds on other devices.' :
      'Use your purchase or claim email to restore access on this device.';

    giftUrl = readGift(status?.giftUrl);
    receiptUrl = authenticated ? readReceipt(status?.receiptUrl) : undefined;
    updateReceiptLink(byId('pass-receipt'));
    const extraWorlds = Array.isArray(status?.worlds) && status.worlds.some(world => world !== 'winnipesaukee');
    const hasAccess = authenticated && (status.fullAccess === true || extraWorlds);
    byId('restore-title').textContent = hasAccess || receiptUrl ? 'My ticket' :
      !pendingGift && !needsConfirmation && hasFriendReward() ? 'Save your five worlds' : 'Restore ticket';
    redeemGift.hidden = !pendingGift || !emailVerified || needsConfirmation;
    copyGift.hidden = !giftUrl;
    shareGift.hidden = !giftUrl || typeof navigator.share !== 'function';
    giftLink.hidden = !giftUrl;
    if (!giftUrl) giftLink.open = false;
    giftInput.value = giftLink.open ? giftUrl : '';
    playUnlocked.hidden = !hasAccess;
    playUnlocked.href = hasAccess ? ticketFlightUrl(status) : '../?play=1';
    byId('play-unlocked-label').textContent = status?.fullAccess === true ? 'Play now' : 'Play unlocked worlds';
    giftDetails.hidden = !pendingGift && !giftUrl && !receiptUrl && !hasAccess;
    giftMessage.textContent = pendingGift && emailVerified ? 'Your Founder Pass gift is ready to redeem.' :
      pendingGift ? 'Your gift is held by its private link until you verify your email.' :
      giftUrl ? 'Send your gift link to one friend.' :
      hasAccess ? 'Your unlocked worlds are ready to fly.' : '';
  }

  function returningFromPayment() {
    return checkoutState === 'success' || checkoutState === 'pending';
  }

  function ticketFlightUrl(current) {
    const fullAccess = current?.fullAccess === true;
    const entitled = Array.isArray(current?.worlds) ? current.worlds.filter(world => world !== 'winnipesaukee') : [];
    const rewards = Array.isArray(checkoutConfig?.rewardWorlds) ? checkoutConfig.rewardWorlds : [];
    let world = fullAccess ? 'moosehead' : rewards.find(id => entitled.includes(id)) || entitled[0];
    if (!world) return '../?play=1';
    let launch = 'grand';
    try {
      const last = JSON.parse(localStorage.getItem('aerie:last-paid-flight') || 'null');
      const id = last?.world === 'lac-berte' ? 'labrador' : last?.world;
      if (id && entitled.includes(id)) {
        world = id;
        if (typeof last.launch === 'string' && /^[a-z][a-z0-9-]{0,50}$/.test(last.launch)) launch = last.launch;
      }
    } catch {}
    return `../?play=1${fullAccess ? '&fly=1' : ''}#${new URLSearchParams({world, launch})}`;
  }

  function updateCheckoutReturn(focus = false) {
    const notice = byId('return-notice');
    const owned = status?.fullAccess === true;
    notice.hidden = !checkoutState && !playRequested && !owned;
    if (notice.hidden) return;
    const checking = (playRequested || returningFromPayment()) && status === undefined;
    const couldNotCheck = (playRequested || returningFromPayment()) && status === null;
    const retry = !owned && ['cancel', 'started'].includes(checkoutState);
    const messages = {
      cancel: ['Checkout canceled', 'You can try again or restore access if you bought a pass earlier.'],
      started: ['Checkout interrupted', 'If you paid, restore access with your checkout email. If you left before paying, you can try again.'],
      pending: ['Checkout status pending', 'If you paid, restore with the email you used at checkout.'],
      'preview-ended': ['This preview checkout has ended', 'No payment was taken. You can still fly Lake Winnipesaukee free.'],
      success: ['Find your Founder Pass', 'Restore access with your checkout email if your worlds don’t appear here.']
    };
    const restoreTicket = ['Restore your ticket', 'Use your checkout email to pick up your ticket on this device.'];
    const guestPlay = playRequested && status && !owned;
    let [title, message] = guestPlay ? ['Your flights', 'Fly Lake Winnipesaukee free, or restore a ticket you already own.'] : playRequested ? restoreTicket : messages[checkoutState] || restoreTicket;
    if (owned) {
      title = returningFromPayment() ? 'Your worlds are ready' : 'Welcome back';
      message = 'Fly all worlds with your ticket.';
      if (checkoutConfig?.checkoutMode === 'test') {
        title = 'Your preview ticket is ready';
        message = 'Fly all 13 preview worlds. No payment was taken.';
      }
    } else if (checking) {
      title = 'Checking your pass…';
      message = 'We’re checking access to your Aerie worlds.';
    } else if (couldNotCheck) {
      title = 'We couldn’t check your pass';
      message = 'If you paid, you can still restore your pass with your checkout email.';
    }
    byId('return-title').textContent = title;
    byId('return-message').textContent = message;
    byId('returning-player-actions').hidden = !owned;
    if (owned) byId('return-play').href = ticketFlightUrl(status);
    byId('return-retry').hidden = !retry || playRequested;
    byId('return-status-retry').hidden = !couldNotCheck && !(playRequested && !owned && !checking);
    byId('return-free').hidden = !guestPlay && (owned || checkoutState !== 'preview-ended');
    byId('return-restore').hidden = checking || owned;
    if (focus) notice.focus();
  }

  function refreshStatus(afterMutation = false) {
    if (statusRequest && !afterMutation) return statusRequest;
    const version = ++statusVersion;
    if (((playRequested || returningFromPayment()) && status === null) || (playRequested && status && !status.fullAccess)) {
      status = undefined;
      updateCheckoutReturn();
      updateCheckoutOffer();
    }
    statusRequest = request('/status', undefined, 8000).catch(() => null).then(current => {
      if (version !== statusVersion) return;
      status = typeof current?.fullAccess === 'boolean' ? current : null;
      window.dispatchEvent(new CustomEvent('aerie:ticket-status', { detail: status }));
      statusCheckedAt = Date.now();
      updateRestore();
      updateCheckoutReturn();
      updateCheckoutOffer();
      updateFriendOffer();
      if (playRequested && status?.fullAccess === true) location.replace(ticketFlightUrl(status));
    }).finally(() => {
      if (version === statusVersion) statusRequest = null;
    });
    return statusRequest;
  }

  byId('return-status-retry').addEventListener('click', () => {
    refreshStatus();
    byId('return-notice').focus();
  });

  requestRestoreAgain.addEventListener('click', () => {
    restoreToken = null;
    codeRequired = false;
    confirmLocked = false;
    showRequestForm = true;
    restoreCode.value = '';
    confirmMessage.textContent = '';
    clearLinkParameter('restore');
    updateRestore();
    byId('restore-email').focus();
  });

  confirmForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (confirmRestore.disabled || !restoreToken) return;
    const payload = { token: restoreToken };
    if (codeRequired) payload.code = restoreCode.value;
    let focusCode = false;
    confirmInProgress = true;
    updateRestore();
    confirmMessage.textContent = 'Confirming your access…';
    try {
      const result = await request('/restore/confirm', payload, 12000);
      if (result.codeRequired === true && result.ok !== true) {
        codeRequired = true;
        focusCode = true;
        confirmMessage.textContent = '';
        return;
      }
      if (result.ok !== true) throw new Error('This access link could not be confirmed.');
      if (typeof result.giftCode === 'string' && result.giftCode) {
        pendingGift = result.giftCode;
        try { sessionStorage.setItem(pendingGiftKey, pendingGift); } catch {}
      }
      restoreToken = null;
      codeRequired = false;
      restoreCode.value = '';
      confirmMessage.textContent = '';
      clearLinkParameter('restore');
      await refreshStatus(true);
      if (!status?.authenticated) {
        showRequestForm = true;
        restoreForm.querySelector('.form-status').textContent = 'Request a new access link to open your worlds here.';
      }
    } catch (error) {
      if (error.codeInvalid) {
        focusCode = true;
        confirmMessage.textContent = 'That code didn’t match. Check the eight digits in your email and try again.';
      } else if (error.codeAttemptsExceeded || error.status === 400) {
        confirmLocked = true;
        confirmMessage.textContent = error.codeAttemptsExceeded
          ? 'Too many code attempts. Request a new access link.'
          : 'This access link has expired or was already used. Request a new link.';
      } else {
        confirmMessage.textContent = error.name === 'AbortError' || error instanceof TypeError
          ? 'Could not confirm your access. Try again.' : error.message;
      }
    } finally {
      confirmInProgress = false;
      updateRestore();
      if (focusCode && !restoreCode.disabled) {
        restoreCode.focus();
        restoreCode.select();
      }
    }
  });

  redeemGift.addEventListener('click', async () => {
    redeemGift.disabled = true;
    try {
      const result = await request('/gift/redeem', { code: pendingGift });
      if (result.ok !== true) throw new Error('This gift could not be redeemed.');
      pendingGift = null;
      try { sessionStorage.removeItem(pendingGiftKey); } catch {}
      await refreshStatus(true);
      if (status?.fullAccess === true) giftMessage.textContent = 'Gift redeemed. All worlds are ready to fly.';
    } catch (error) {
      giftMessage.textContent = error.message;
    } finally {
      redeemGift.disabled = false;
    }
  });

  function showGiftLink() {
    if (!giftUrl) return;
    giftLink.open = true;
    giftInput.value = giftUrl;
    giftInput.focus();
    giftMessage.textContent = 'Your private gift link is ready to copy.';
  }

  giftLink.addEventListener('toggle', () => {
    giftInput.value = giftLink.open && giftUrl ? giftUrl : '';
  });
  giftSummary.addEventListener('click', () => {
    giftInput.value = giftLink.open ? '' : giftUrl || '';
  });
  giftInput.addEventListener('focus', () => giftInput.select());
  copyGift.addEventListener('click', () => {
    if (giftUrl) copy(giftUrl, giftMessage, 'Gift link copied. Send it privately to your friend.', showGiftLink);
  });
  shareGift.addEventListener('click', async () => {
    if (!giftUrl || typeof navigator.share !== 'function') return;
    try {
      await navigator.share({ title: 'Aerie Founder Pass gift', text: 'I’m sending you an Aerie Founder Pass.', url: giftUrl });
    } catch (error) {
      if (error.name !== 'AbortError') showGiftLink();
    }
  });

  const checkoutLaunch = byId('checkout-launch');
  const heroCheckout = byId('hero-buy');
  const checkoutButtons = [checkoutLaunch, heroCheckout, ...document.querySelectorAll('[data-wallet-checkout]')];
  const heroCheckoutStatus = byId('hero-checkout-status');
  const checkoutAvailability = byId('checkout-availability');
  const walletOptions = document.querySelectorAll('.wallet-option');
  const flightPrice = byId('flight-price');
  const purchaseDialog = byId('purchase-dialog');
  const purchaseFields = byId('purchase-form').querySelector('fieldset');
  let checkoutConfig;
  let configRequest;
  let checkoutBusy = false;
  let checkoutAttempt = 0;

  function enabled(config, key) {
    return (config?.[key] ?? config?.features?.[key] ??
      (key === 'shareClaims' ? config?.features?.shareClaim : false)) === true;
  }

  function checkoutNote(config) {
    if (!config) return 'Could not check checkout. Try again.';
    if (!enabled(config, 'checkout')) return fields.checkout.unavailable;
    return 'One-time payment. Applicable tax shown at checkout.';
  }

  function updateCheckoutOffer() {
    const owned = status?.fullAccess === true;
    const available = enabled(checkoutConfig, 'checkout');
    const unconfirmedReturn = playRequested || (returningFromPayment() && !status);
    if (!checkoutBusy) {
      for (const button of checkoutButtons) button.disabled = !owned && checkoutConfig === undefined;
    }
    checkoutLaunch.hidden = unconfirmedReturn;
    heroCheckout.hidden = unconfirmedReturn;
    if (unconfirmedReturn || owned) heroCheckoutStatus.hidden = true;
    const label = owned ? 'Play now' : 'All worlds';
    byId('hero-buy-label').textContent = label;
    byId('checkout-label').textContent = label;
    byId('hero-buy-detail').textContent = owned ? 'Your ticket' : '+ a gift';
    const price = !owned && available && typeof checkoutConfig.priceLabel === 'string'
      ? checkoutConfig.priceLabel.replace(/\sUSD$/, '') : '↗';
    byId('hero-ticket-price').textContent = price;
    flightPrice.textContent = price;
    const mode = checkoutConfig?.checkoutMode;
    const note = mode === 'test' ? 'Preview checkout. Test cards only. No charge.' :
      mode === 'live' ? 'Sold by The ComplianceAide, maker of Aerie.' : '';
    for (const element of document.querySelectorAll('[data-offer-note]')) {
      element.textContent = note;
      element.hidden = !note || !available || owned || unconfirmedReturn;
    }
    byId('preview-owned').hidden = !owned || mode !== 'test';
    byId('pass-restore').hidden = owned || unconfirmedReturn;
    const walletAvailable = available && enabled(checkoutConfig, 'googlePayCheckout') && enabled(checkoutConfig, 'checkoutCollectsEmail');
    for (const option of walletOptions) option.hidden = owned || unconfirmedReturn || !walletAvailable;
    checkoutAvailability.hidden = unconfirmedReturn;
    if (!checkoutBusy) {
      checkoutAvailability.textContent = owned || available ? '' : checkoutConfig === undefined
        ? 'Checking checkout availability…' : checkoutNote(checkoutConfig);
    }
  }

  function playOwnedPass() {
    if (status?.fullAccess !== true) return false;
    if (checkoutBusy) setCheckoutBusy(false);
    if (purchaseDialog.open) purchaseDialog.close();
    location.assign(ticketFlightUrl(status));
    return true;
  }

  function checkCheckoutAccess() {
    return statusRequest || (Date.now() - statusCheckedAt >= 30000 ? refreshStatus() : null);
  }

  function loadConfig() {
    if (!configRequest) {
      configRequest = request('/config', undefined, 8000).catch(() => null).then(config => {
        checkoutConfig = config;
        window.dispatchEvent(new CustomEvent('aerie:traffic-config', { detail: config?.traffic === true }));
        for (const form of forms) {
          const name = form.dataset.form;
          const available = name === 'share-claim' ? shareOfferAvailable(config) : enabled(config, configKeys[name]);
          form.querySelector('fieldset').disabled = !available || (name === 'checkout' && checkoutBusy);
          form.querySelector('.form-status').textContent = available ? '' : fields[name].unavailable;
        }
        restoreAvailable = enabled(config, 'restore');
        updateRestore();
        updateCheckoutReturn();
        updateCheckoutOffer();
        friendShareStatus.textContent = '';
        updateFriendOffer();
        return config;
      }).finally(() => { configRequest = null; });
    }
    return configRequest;
  }

  function setCheckoutBusy(busy) {
    checkoutBusy = busy;
    for (const button of checkoutButtons) {
      button.disabled = busy;
      button.setAttribute('aria-busy', String(busy));
    }
    purchaseFields.disabled = busy || !enabled(checkoutConfig, 'checkout');
    return ++checkoutAttempt;
  }

  async function openStripeCheckout(payload, output, attempt) {
    output.textContent = 'Opening checkout…';
    try {
      const {checkoutMode: mode, priceAmount: amount, priceCurrency: currency} = checkoutConfig || {};
      const expectedOffer = ['test', 'live'].includes(mode) && Number.isSafeInteger(amount) && currency === 'usd'
        ? {mode, amount, currency} : undefined;
      const {url} = await request('/checkout', {...payload, expectedOffer}, 15000);
      if (attempt !== checkoutAttempt) return;
      const destination = new URL(url);
      const stripeOrigin = checkoutConfig?.checkoutProvider === 'payment_link'
        ? 'https://buy.stripe.com' : 'https://checkout.stripe.com';
      if (destination.origin !== stripeOrigin || destination.username || destination.password) {
        throw new Error('Checkout is unavailable right now.');
      }
      window.dispatchEvent(new Event('aerie:checkout-handoff'));
      location.assign(destination.href);
      rememberCheckout('started');
    } catch (error) {
      if (attempt !== checkoutAttempt) return;
      if (error.offerChanged) {
        const current = await loadConfig();
        if (attempt !== checkoutAttempt) return;
        output.textContent = enabled(current, 'checkout')
          ? 'The ticket offer changed. Review the new offer and select your ticket again.' : checkoutNote(current);
      } else {
        output.textContent = error.name === 'AbortError' || error instanceof TypeError
          ? 'Checkout could not open. Try again.' : error.message;
      }
      setCheckoutBusy(false);
    }
  }

  async function launchCheckout(event) {
    if (checkoutBusy || playOwnedPass()) return;
    const walletRequested = event.currentTarget.hasAttribute('data-wallet-checkout');
    const fromHero = Boolean(event.currentTarget.closest('.hero'));
    const output = fromHero ? heroCheckoutStatus : checkoutAvailability;
    if (fromHero) output.hidden = false;
    const attempt = setCheckoutBusy(true);
    output.textContent = 'Checking your Aerie access…';
    const hadOffer = enabled(checkoutConfig, 'checkout');
    const [config] = await Promise.all([
      hadOffer ? checkoutConfig : loadConfig(), checkCheckoutAccess()
    ]);
    if (attempt !== checkoutAttempt || playOwnedPass()) return;
    if (!enabled(config, 'checkout')) {
      setCheckoutBusy(false);
      updateCheckoutOffer();
      if (fromHero) output.textContent = checkoutNote(config);
      return;
    }
    if (!hadOffer) {
      setCheckoutBusy(false);
      updateCheckoutOffer();
      output.textContent = 'Checkout is available. Review your ticket and select it to continue.';
      return;
    }
    if (!enabled(config, 'checkoutCollectsEmail')) {
      output.textContent = checkoutNote(config);
      setCheckoutBusy(false);
      show(purchaseDialog);
      return;
    }
    await openStripeCheckout(walletRequested ? { wallet: 'google_pay' } : {}, output, attempt);
  }

  for (const button of checkoutButtons) button.addEventListener('click', launchCheckout);

  purchaseDialog.addEventListener('close', () => {
    if (checkoutBusy) setCheckoutBusy(false);
    byId('purchase-form').querySelector('.form-status').textContent = '';
  });

  window.addEventListener('pageshow', event => {
    if (!event.persisted || !checkoutBusy) return;
    heroCheckoutStatus.hidden = true;
    setCheckoutBusy(false);
    updateCheckoutOffer();
    if (purchaseDialog.open) purchaseDialog.close();
    updateCheckoutReturn(true);
    refreshStatus();
  });

  for (const button of document.querySelectorAll('[data-open]')) {
    button.addEventListener('click', event => {
      const action = button.dataset.open;
      if (action === 'restore' || action === 'save-worlds') {
        event.preventDefault();
        if (action === 'save-worlds') shareDialog.close();
        updateRestore();
        show(restoreDialog);
        if ((!returningFromPayment() && !playRequested) || status !== null) refreshStatus();
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
      if (name === 'checkout') {
        if (checkoutBusy || playOwnedPass()) return;
        const attempt = setCheckoutBusy(true);
        output.textContent = 'Checking your Aerie access…';
        await checkCheckoutAccess();
        if (attempt !== checkoutAttempt || playOwnedPass()) return;
        await openStripeCheckout(payload, output, attempt);
        return;
      }
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
      output.textContent = 'Submitting…';
      try {
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

  window.addEventListener('hashchange', () => {
    const route = new URLSearchParams(location.hash.slice(1));
    const wasPlaying = playRequested;
    playRequested = route.has('play') && !standalone;
    if (playRequested && !wasPlaying) {
      for (const dialog of [shareDialog, restoreDialog, purchaseDialog]) {
        if (dialog.open) dialog.close();
      }
      status = undefined;
      updateRestore();
      updateCheckoutReturn(true);
      updateCheckoutOffer();
      refreshStatus(true);
    } else if (wasPlaying && !playRequested) {
      updateCheckoutReturn();
      updateCheckoutOffer();
    }
    if (route.has('restore-ticket')) {
      if (shareDialog.open) shareDialog.close();
      updateRestore();
      show(restoreDialog);
    } else if (route.has('invite')) {
      if (restoreDialog.open) restoreDialog.close();
      openShare(true);
    }
  });

  updateRestore();
  updateCheckoutReturn(Boolean(checkoutState) || playRequested);
  updateCheckoutOffer();
  loadConfig();
  refreshStatus();
  if (pendingGift || restoreToken || restoreRequested) show(restoreDialog);
  else if (fragment.has('invite')) openShare(true);
})();
