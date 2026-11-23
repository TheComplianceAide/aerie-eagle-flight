import { createHash, createHmac, randomBytes } from 'node:crypto';
import { allWorlds, freeWorld } from './settings.mjs';

const minute = 60_000;
const day = 24 * 60 * minute;
const disclosure = 'Aerie is giving me access to three extra worlds for sharing my experience.';
const newToken = () => randomBytes(32).toString('base64url');
const tokenPattern = /^[a-zA-Z0-9_-]{43}$/;
const digest = value => createHash('sha256').update(value).digest('hex');
const conflict = error => error.statusCode === 409 || error.statusCode === 412;
const clientErrorKinds = new Set(['startup', 'script', 'graphics', 'promise']);
const versionPattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}(?:-[A-Za-z0-9.-]{1,12})?$/;
const basenamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,71}\.(?:js|mjs|html)$/;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function emailAddress(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>.]+(?:\.[^\s@<>.]+)+$/.test(email) || /[\x00-\x1f\x7f]/.test(email)) {
    throw new HttpError(400, 'Enter a valid email address.');
  }
  return email;
}

function normalizePost(value) {
  if (typeof value !== 'string' || value.length > 500) throw new HttpError(400, 'Enter a public link to your post.');
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new HttpError(400, 'Enter a public link to your post.');
  }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) {
    throw new HttpError(400, 'Enter a public HTTPS link to your post.');
  }
  const host = url.hostname.replace(/^(?:www|mobile)\./, '');
  const path = url.pathname.replace(/\/$/, '');
  if (['x.com', 'twitter.com'].includes(host)) {
    const match = path.match(/^\/[\w]+\/(?:web\/)?status\/(\d+)$/);
    if (match) return { href: `https://x.com/i/status/${match[1]}`, key: `x:${match[1]}` };
  }
  if (host === 'instagram.com' && /^\/(?:p|reel)\/[\w-]+$/.test(path)) {
    return { href: `https://www.instagram.com${path}/`, key: `instagram:${path.split('/')[2]}` };
  }
  if (host === 'linkedin.com') {
    const match = path.match(/^\/feed\/update\/urn:li:(?:activity|share|ugcPost):(\d+)$/) ||
      path.match(/^\/posts\/[\w%-]+_(?:activity|share|ugcPost)-(\d+)-[\w-]+$/);
    if (match) return { href: `https://www.linkedin.com${path}/`, key: `linkedin:${match[1]}` };
  }
  throw new HttpError(400, 'Use a public post link from LinkedIn, X, or Instagram.');
}

function cookieValue(request, name) {
  for (const cookie of (request.headers.get('cookie') || '').split(';')) {
    const value = cookie.trim();
    if (value.startsWith(`${name}=`)) return value.slice(name.length + 1);
  }
  return '';
}

function downloadTarget(query) {
  const world = query.get('world');
  const path = query.get('path');
  if (!allWorlds.includes(world) || !path || path.length > 512 || !/^[A-Za-z0-9_./-]+$/.test(path) ||
      path.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new HttpError(400, 'Invalid world asset.');
  }
  return { world, path };
}

async function readJson(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) {
    throw new HttpError(415, 'Send JSON to this endpoint.');
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 8192) throw new HttpError(413, 'Request is too large.');
  try {
    const body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new HttpError(400, 'Enter the requested information.');
  }
}

function purchases(account) {
  return account ? JSON.parse(account.purchases || '[]') : [];
}

export function createCommerce(config, { store, stripe, sendEmail, assetUrl, now = Date.now }) {
  const restoreEnabled = Boolean(store && sendEmail && config.site);
  const canCheckout = Boolean(config.checkout && restoreEnabled && stripe && config.priceId && config.webhookSecret && assetUrl);
  const shareEnabled = Boolean(config.claims && restoreEnabled && assetUrl);
  const signupEnabled = Boolean(config.signup && store && config.site);
  const secureCookies = config.site.startsWith('https:');
  const sessionCookie = secureCookies ? '__Host-aerie_session' : 'aerie_session';
  const checkoutCookie = secureCookies ? '__Host-aerie_checkout' : 'aerie_checkout';
  const joinPath = '/join/';
  const hash = (purpose, value) => createHmac('sha256', config.secret).update(`${purpose}:${value}`).digest('base64url');
  const userId = email => hash('email', email);
  const accountKey = uid => `account:${uid}`;
  const giftCode = sessionId => hash('gift', sessionId);
  const row = (rowKey, fields) => ({ ...fields, rowKey });
  const cookie = (name, value, maxAge) => ({
    name, value, maxAge, path: '/', secure: secureCookies, httpOnly: true, sameSite: 'Lax'
  });
  let priceCache;
  let telemetryUntil = 0;
  const telemetrySeen = new Set();

  async function offer() {
    if (!canCheckout) return null;
    if (!priceCache || priceCache.until < now()) {
      const price = await stripe.prices.retrieve(config.priceId);
      if (!price.active || price.type !== 'one_time' || !Number.isSafeInteger(price.unit_amount) ||
          price.unit_amount <= 0 || price.currency !== 'usd' || price.livemode !== config.live) {
        return null;
      }
      priceCache = { price, until: now() + 5 * minute };
    }
    return priceCache.price;
  }

  function session(token, uid, checkoutId = '') {
    return row(`session:${digest(token)}`, { uid, checkoutId, expiresAt: now() + 30 * day });
  }

  async function identity(request) {
    const token = cookieValue(request, sessionCookie);
    if (!store || !tokenPattern.test(token)) return null;
    const login = await store.get(`session:${digest(token)}`);
    return login?.expiresAt > now() ? login : null;
  }

  function addPurchase(account, uid, sessionId) {
    return [account ? 'replace' : 'create',
      row(accountKey(uid), { ...account, purchases: JSON.stringify([...new Set([...purchases(account), sessionId])]) })];
  }

  async function activePayment(purchase) {
    const payment = purchase && await store.get(`payment:${purchase.paymentIntent}`);
    return Boolean(payment && !payment.refunded && !payment.disputed);
  }

  async function access(login, includeGift = false) {
    const uid = login?.uid;
    const account = uid && !login.checkoutId ? await store.get(accountKey(uid)) : null;
    // A paid Checkout authorizes the current purchase. Email verification is
    // required to access any earlier purchases made with the same address.
    const ids = login?.checkoutId ? [login.checkoutId] : purchases(account);
    const active = (await Promise.all(ids.map(async id => {
      const purchase = await store.get(`purchase:${id}`);
      return await activePayment(purchase) ? purchase : null;
    }))).filter(Boolean);
    const worlds = active.length ? allWorlds : account?.reward ? [freeWorld, ...config.rewards] : [freeWorld];
    const result = { authenticated: Boolean(uid), emailVerified: Boolean(uid && !login.checkoutId), fullAccess: active.length > 0, worlds };
    if (includeGift) {
      for (const own of active.filter(purchase => purchase.buyer === uid)) {
        const code = giftCode(own.checkoutId);
        const gift = await store.get(`gift:${digest(code)}`);
        if (gift && !gift.redeemedBy) {
          result.giftUrl = `${joinPath}#gift=${code}`;
          break;
        }
      }
    }
    return result;
  }

  async function createCheckout(request, _context, browserOrigin) {
    const price = await offer();
    if (!price) throw new HttpError(503, 'Checkout is currently unavailable.');
    const { email: suppliedEmail } = await readJson(request);
    const customerEmail = suppliedEmail === undefined ? {} : { customer_email: emailAddress(suppliedEmail) };
    const token = newToken();
    const reference = digest(token);
    await store.transaction([['create', row(`pending:${reference}`, {
      priceId: price.id, amount: price.unit_amount, currency: price.currency, createdAt: now()
    })]]);
    const checkout = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: price.id, quantity: 1 }],
      automatic_tax: { enabled: true },
      adaptive_pricing: { enabled: false },
      billing_address_collection: 'required',
      branding_settings: {
        display_name: 'Aerie',
        background_color: '#0d1919',
        button_color: '#efd092',
        ...(secureCookies && { logo: { type: 'url', url: `${config.site}${joinPath}media/aerie-checkout-logo.png` } })
      },
      ...customerEmail,
      client_reference_id: reference,
      metadata: { product: 'aerie-founder-and-gift' },
      payment_intent_data: { metadata: { product: 'aerie-founder-and-gift' } },
      success_url: `${browserOrigin}/api/aerie/checkout/complete?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${browserOrigin}${joinPath}?checkout=cancel`
    });
    if (!checkout.url || new URL(checkout.url).origin !== 'https://checkout.stripe.com') throw new Error('Unexpected hosted Checkout URL.');
    return { jsonBody: { url: checkout.url }, cookies: [cookie(checkoutCookie, token, 24 * 60 * 60)] };
  }

  async function fulfill(checkoutId, expectedReference) {
    const checkout = await stripe.checkout.sessions.retrieve(checkoutId, { expand: ['line_items'] });
    const lines = checkout.line_items;
    const reference = checkout.client_reference_id;
    if (checkout.mode !== 'payment' || checkout.livemode !== config.live ||
        checkout.metadata?.product !== 'aerie-founder-and-gift' || !/^[0-9a-f]{64}$/.test(reference || '') ||
        (expectedReference && reference !== expectedReference)) return null;
    const pending = await store.get(`pending:${reference}`);
    if (!pending || lines?.has_more || lines?.data?.length !== 1 || lines.data[0].quantity !== 1 ||
        lines.data[0].price?.id !== pending.priceId || checkout.amount_subtotal !== pending.amount ||
        checkout.currency !== pending.currency) return null;
    if (checkout.payment_status !== 'paid') return { paid: false };
    const paymentIntent = checkout.payment_intent;
    if (typeof paymentIntent !== 'string' || !paymentIntent.startsWith('pi_')) throw new Error('Missing Stripe payment reference.');
    const uid = userId(emailAddress(checkout.customer_details?.email));
    const purchase = row(`purchase:${checkout.id}`, { checkoutId: checkout.id, paymentIntent, buyer: uid });
    const paymentKey = `payment:${paymentIntent}`;
    for (let attempt = 0; attempt < 5; attempt++) {
      const [existing, payment, account] = await Promise.all([
        store.get(purchase.rowKey), store.get(paymentKey), store.get(accountKey(uid))
      ]);
      if (payment?.refunded || payment?.disputed) return { paid: false };
      if (existing) return { paid: true, uid: existing.buyer };
      try {
        await store.transaction([
          ['create', purchase],
          ['create', row(`gift:${digest(giftCode(checkout.id))}`, { checkoutId: checkout.id, buyer: uid, redeemedBy: '' })],
          payment ? ['replace', { ...payment, checkoutId: checkout.id }] : ['create', row(paymentKey, { checkoutId: checkout.id })],
          addPurchase(account, uid, checkout.id)
        ]);
        return { paid: true, uid };
      } catch (error) {
        if (!conflict(error)) throw error;
      }
    }
    throw new Error('Purchase processing is busy.');
  }

  function joinRedirect(state, cookies) {
    return { status: 303, headers: { Location: `${joinPath}?checkout=${state}` }, cookies };
  }

  async function completeCheckout(request) {
    const id = request.query.get('session_id');
    const token = cookieValue(request, checkoutCookie);
    if (!stripe || !store || !/^cs_(test|live)_[\w]+$/.test(id || '') || !tokenPattern.test(token)) {
      return joinRedirect('pending');
    }
    const result = await fulfill(id, digest(token));
    if (!result?.paid) return joinRedirect('pending');
    const sessionToken = newToken();
    await store.transaction([['create', session(sessionToken, result.uid, id)]]);
    return joinRedirect('success', [cookie(sessionCookie, sessionToken, 30 * 24 * 60 * 60), cookie(checkoutCookie, '', 0)]);
  }

  async function changePayment(event) {
    const paymentIntent = event.data.object.payment_intent;
    if (typeof paymentIntent !== 'string' || !paymentIntent.startsWith('pi_')) return;
    const key = `payment:${paymentIntent}`;
    for (let attempt = 0; attempt < 5; attempt++) {
      const current = await store.get(key);
      if (!current) {
        const intent = await stripe.paymentIntents.retrieve(paymentIntent);
        if (intent.metadata?.product !== 'aerie-founder-and-gift') return;
      }
      const payment = row(key, current || {});
      if (event.type === 'charge.refunded') {
        if (!event.data.object.refunded) return;
        payment.refunded = true;
      } else {
        const closed = event.type === 'charge.dispute.closed';
        const disputeVersion = event.created * 2 + Number(closed);
        if (disputeVersion <= (payment.disputeVersion || 0)) return;
        payment.disputeVersion = disputeVersion;
        payment.disputed = !closed || event.data.object.status !== 'won';
      }
      try {
        await store.transaction([[current ? 'replace' : 'create', payment]]);
        return;
      } catch (error) {
        if (!conflict(error)) throw error;
      }
    }
    throw new Error('Payment update is busy.');
  }

  async function webhook(request) {
    if (!store || !stripe || !config.webhookSecret) throw new HttpError(503, 'Webhook is not configured.');
    const payload = Buffer.from(await request.arrayBuffer());
    if (payload.length > 512 * 1024) throw new HttpError(413, 'Webhook is too large.');
    let event;
    try {
      event = stripe.webhooks.constructEvent(payload, request.headers.get('stripe-signature') || '', config.webhookSecret);
    } catch {
      throw new HttpError(400, 'Invalid webhook signature.');
    }
    if (event.livemode !== config.live) throw new HttpError(400, 'Stripe event mode does not match.');
    if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
      await fulfill(event.data.object.id);
    } else if (['charge.refunded', 'charge.dispute.created', 'charge.dispute.closed'].includes(event.type)) {
      await changePayment(event);
    }
    return { jsonBody: { ok: true } };
  }

  async function requestRestore(request, _context, browserOrigin) {
    if (!restoreEnabled) throw new HttpError(503, 'Email restoration is currently unavailable.');
    const { email: suppliedEmail, gift: code } = await readJson(request);
    const email = emailAddress(suppliedEmail);
    const uid = userId(email);
    const key = `mail:${uid}`;
    const previous = await store.get(key);
    if (previous?.nextSend > now()) throw new HttpError(429, 'Please wait a minute before requesting another email.');
    const token = newToken();
    const gift = typeof code === 'string' && tokenPattern.test(code) && await store.get(`gift:${digest(code)}`);
    try {
      await store.transaction([
        [previous ? 'replace' : 'create', row(key, { ...previous, nextSend: now() + minute })],
        ['create', row(`restore:${digest(token)}`, {
          uid, expiresAt: now() + 15 * minute,
          giftCheckoutId: gift && (!gift.redeemedBy || gift.redeemedBy === uid) ? gift.checkoutId : ''
        })]
      ]);
    } catch (error) {
      if (conflict(error)) throw new HttpError(429, 'Please wait a minute before requesting another email.');
      throw error;
    }
    const restoreUrl = `${browserOrigin}${joinPath}#restore=${token}`;
    const instructions = 'Open this link to continue to Aerie on this device.';
    const expiration = 'The link expires in 15 minutes and works once.';
    await sendEmail(email, 'Continue to Aerie', {
      plainText: `${instructions}\n\n${restoreUrl}\n\n${expiration}`,
      html: `<p>${instructions}</p><p><a href="${restoreUrl}">Continue to Aerie</a></p><p>${expiration}</p>`
    });
    return { jsonBody: { ok: true } };
  }

  async function confirmRestore(request) {
    if (!restoreEnabled) throw new HttpError(503, 'Email restoration is currently unavailable.');
    const { token } = await readJson(request);
    const link = typeof token === 'string' && tokenPattern.test(token) && await store.get(`restore:${digest(token)}`);
    if (!link || link.used || link.expiresAt <= now()) throw new HttpError(400, 'This link has expired or already been used.');
    const login = newToken();
    try {
      await store.transaction([['replace', { ...link, used: true }], ['create', session(login, link.uid)]]);
    } catch (error) {
      if (conflict(error) || error.statusCode === 404) throw new HttpError(400, 'This link has expired or already been used.');
      throw error;
    }
    return {
      cookies: [cookie(sessionCookie, login, 30 * 24 * 60 * 60)],
      jsonBody: { ok: true, ...(link.giftCheckoutId ? { giftCode: giftCode(link.giftCheckoutId) } : {}) }
    };
  }

  async function redeemGift(request) {
    const login = await identity(request);
    if (!login || login.checkoutId) throw new HttpError(401, 'Verify your email before claiming a gift.');
    const { uid } = login;
    const { code } = await readJson(request);
    if (typeof code !== 'string' || !tokenPattern.test(code)) throw new HttpError(400, 'This gift link is invalid.');
    const key = `gift:${digest(code)}`;
    for (let attempt = 0; attempt < 5; attempt++) {
      const gift = await store.get(key);
      if (!gift) throw new HttpError(404, 'This gift is unavailable.');
      if (gift.buyer === uid) throw new HttpError(400, 'Your purchase already includes access. Give this link to your friend.');
      if (gift.redeemedBy && gift.redeemedBy !== uid) throw new HttpError(409, 'This gift has already been claimed.');
      if (!await activePayment(await store.get(`purchase:${gift.checkoutId}`))) {
        throw new HttpError(404, 'This gift is unavailable.');
      }
      if (gift.redeemedBy === uid) return { jsonBody: { ok: true } };
      const account = await store.get(accountKey(uid));
      try {
        await store.transaction([
          ['replace', { ...gift, redeemedBy: uid }],
          addPurchase(account, uid, gift.checkoutId)
        ]);
        return { jsonBody: { ok: true } };
      } catch (error) {
        if (!conflict(error)) throw error;
      }
    }
    throw new HttpError(503, 'Please try claiming this gift again.');
  }

  async function signup(request) {
    if (!signupEnabled) throw new HttpError(503, 'Signup is currently unavailable.');
    const email = emailAddress((await readJson(request)).email);
    try {
      await store.transaction([['create', row(`signup:${userId(email)}`, { email, optedInAt: now(), source: 'join' })]]);
    } catch (error) {
      if (error.statusCode !== 409) throw error;
    }
    return { jsonBody: { ok: true } };
  }

  async function submitClaim(request) {
    if (!shareEnabled) throw new HttpError(503, 'Social claims are currently unavailable.');
    const body = await readJson(request);
    const email = emailAddress(body.email);
    const uid = userId(email);
    const post = normalizePost(body.postUrl);
    const key = `claim:${uid}`;
    const postKey = `post:${digest(post.key)}`;
    const previous = await store.get(key);
    if (previous?.postKey === postKey) return { jsonBody: { ok: true, status: previous.status } };
    if (previous && previous.status !== 'rejected') {
      throw new HttpError(409, 'This email already has a claim. Check your access after review.');
    }
    try {
      await store.transaction([
        ['create', row(postKey, { uid })],
        [previous ? 'replace' : 'create', row(key, { ...previous, uid, postKey, postUrl: post.href, status: 'pending', submittedAt: now() })]
      ]);
    } catch (error) {
      if (!conflict(error)) throw error;
      const claim = await store.get(key);
      if (claim?.postKey === postKey) return { jsonBody: { ok: true, status: claim.status } };
      throw new HttpError(409, 'This post or email already has a claim.');
    }
    return { jsonBody: { ok: true, status: 'pending' } };
  }

  async function review(uid, decision) {
    if (!store || !tokenPattern.test(uid || '') || !['approved', 'rejected'].includes(decision)) {
      throw new Error('Specify a valid claim and review decision.');
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      const claim = await store.get(`claim:${uid}`);
      if (!claim || claim.status !== 'pending') throw new Error('Claim is not pending.');
      const actions = [['replace', { ...claim, status: decision, reviewedAt: now() }]];
      if (decision === 'approved') {
        const account = await store.get(accountKey(uid));
        actions.push([account ? 'replace' : 'create', row(accountKey(uid), { ...account, reward: true })]);
      }
      try {
        await store.transaction(actions);
        return;
      } catch (error) {
        if (!conflict(error)) throw error;
      }
    }
    throw new Error('Claim review is busy.');
  }

  async function configResponse() {
    let price;
    try {
      price = await offer();
    } catch {
      price = null;
    }
    const features = { signup: signupEnabled, checkout: Boolean(price), shareClaim: shareEnabled, restore: restoreEnabled };
    return { jsonBody: {
      ...features, shareClaims: features.shareClaim, features, freeWorld, rewardWorlds: config.rewards,
      ...(price ? { priceLabel: `$${(price.unit_amount / 100).toFixed(2)} USD`, priceAmount: price.unit_amount, priceCurrency: price.currency } : {}),
      checkoutMode: config.mode, checkoutCollectsEmail: true, disclosure, monitoring: Boolean(config.monitoring)
    }};
  }

  async function telemetry(request, context) {
    if (!config.monitoring) throw new HttpError(503, 'Client monitoring is unavailable.');
    const body = await readJson(request);
    const { kind, world, version, file, line } = body;
    if (Object.keys(body).length !== 5 || !clientErrorKinds.has(kind) ||
        (world !== 'menu' && !allWorlds.includes(world)) ||
        typeof version !== 'string' || !versionPattern.test(version) ||
        typeof file !== 'string' || (file !== '' && !basenamePattern.test(file)) ||
        !Number.isSafeInteger(line) || line < 0 || line > 10_000_000) {
      throw new HttpError(400, 'Invalid client error.');
    }
    const time = now();
    if (time >= telemetryUntil) {
      telemetryUntil = time + minute;
      telemetrySeen.clear();
    }
    const data = JSON.stringify({ kind, world, version, file, line });
    if (telemetrySeen.has(data)) return { status: 204 };
    if (telemetrySeen.size >= 30) {
      return { status: 429, headers: { 'Retry-After': String(Math.ceil((telemetryUntil - time) / 1000)) } };
    }
    telemetrySeen.add(data);
    context?.warn(`aerie_client_error ${data}`);
    return { status: 204 };
  }

  const routes = {
    config: ['GET', configResponse],
    status: ['GET', async request => ({ jsonBody: await access(await identity(request), true) })],
    signup: ['POST', signup],
    checkout: ['POST', createCheckout],
    'checkout/complete': ['GET', completeCheckout],
    restore: ['POST', requestRestore],
    'restore/confirm': ['POST', confirmRestore],
    'gift/redeem': ['POST', redeemGift],
    'share-claim': ['POST', submitClaim],
    telemetry: ['POST', telemetry],
    'stripe/webhook': ['POST', webhook],
    asset: ['GET', async request => {
      const { world, path } = downloadTarget(request.query);
      if (!assetUrl) throw new HttpError(503, 'Private world downloads are not configured.');
      if (!(await access(await identity(request))).worlds.includes(world)) {
        throw new HttpError(403, 'Unlock this world to download its assets.');
      }
      const url = await assetUrl(world, path);
      return request.query.get('redirect') === '1'
        ? { status: 302, headers: { Location: url } }
        : { jsonBody: { url } };
    }]
  };

  async function handle(action, request, context) {
    const [method, run] = routes[action];
    const origin = request.headers.get('origin');
    const allowed = origin && config.origins.has(origin);
    const headers = {
      'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff', Vary: 'Origin'
    };
    if (allowed) Object.assign(headers, {
      'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': `${method}, OPTIONS`, 'Access-Control-Allow-Headers': 'Content-Type'
    });
    try {
      if (request.method === 'OPTIONS' && allowed) return { status: 204, headers };
      if (request.method !== method) throw new HttpError(405, 'Unsupported method.');
      if ((origin && !allowed) || (!allowed && method === 'POST' && action !== 'stripe/webhook')) {
        throw new HttpError(403, 'Request did not come from Aerie.');
      }
      const result = await run(request, context, origin || config.site);
      return { ...result, headers: { ...headers, ...result.headers } };
    } catch (error) {
      if (!(error instanceof HttpError)) context?.error(`Aerie ${action} failed (${error.code || error.name || 'unknown'}).`);
      return {
        status: error instanceof HttpError ? error.status : 503, headers,
        jsonBody: { error: error instanceof HttpError ? error.message : 'This service is temporarily unavailable. Please try again.' }
      };
    }
  }

  return { handle, review, routes };
}
