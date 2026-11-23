import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { createPurchaseHelp } from './purchase-help.mjs';
import { createPurchaseMail, stripeReceiptUrl } from './purchase-mail.mjs';
import { allWorlds, freeWorld } from './settings.mjs';

// Stripe Checkout's ShippingAddressCollection.AllowedCountry values, excluding unknown region ZZ.
const checkoutAddressCountries = `
AC AD AE AF AG AI AL AM AO AQ AR AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ
BR BS BT BV BW BY BZ CA CD CF CG CH CI CK CL CM CN CO CR CV CW CY CZ DE DJ DK DM DO DZ EC
EE EG EH ER ES ET FI FJ FK FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY
HK HN HR HT HU ID IE IL IM IN IO IQ IS IT JE JM JO JP KE KG KH KI KM KN KR KW KY KZ LA LB
LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MK ML MM MN MO MQ MR MS MT MU MV MW MX MY MZ
NA NC NE NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PY QA RE RO RS RU
RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SZ TA TC TD TF TG TH TJ TK TL
TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VN VU WF WS XK YE YT ZA ZM ZW
`.trim().split(/\s+/);

const minute = 60_000;
const day = 24 * 60 * minute;
const disclosure = 'Aerie is giving me access to five extra worlds for sharing my experience.';
const newToken = () => randomBytes(32).toString('base64url');
const tokenPattern = /^[a-zA-Z0-9_-]{43}$/;
const restoreCodePattern = /^[0-9]{8}$/;
const restoreCodeLimit = 5;
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

async function readJson(request, limit = 8192) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) {
    throw new HttpError(415, 'Send JSON to this endpoint.');
  }
  if (Number(request.headers.get('content-length')) > limit) throw new HttpError(413, 'Request is too large.');
  const raw = await request.text();
  if (Buffer.byteLength(raw) > limit) throw new HttpError(413, 'Request is too large.');
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

export function createCommerce(config, { store, stripe, sendEmail, purchaseEmailOperations, assetUrl, now = Date.now }) {
  const restoreEnabled = Boolean(store && sendEmail && config.site);
  const canCheckout = Boolean(config.checkout && restoreEnabled && stripe && config.priceId && config.webhookSecret && assetUrl);
  const shareEnabled = Boolean(config.claims && restoreEnabled && assetUrl);
  const signupEnabled = Boolean(config.signup && store && config.site);
  const secureCookies = config.site.startsWith('https:');
  const sessionCookie = secureCookies ? '__Host-aerie_session' : 'aerie_session';
  const legacyCheckoutCookie = secureCookies ? '__Host-aerie_checkout' : 'aerie_checkout';
  const checkoutCookieFor = id => `${legacyCheckoutCookie}_${digest(id).slice(0, 24)}`;
  const restoreCookie = secureCookies ? '__Host-aerie_restore' : 'aerie_restore';
  const friendsCookie = secureCookies ? '__Host-aerie_friends' : 'aerie_friends';
  const joinPath = '/join/';
  const purchaseMail = createPurchaseMail(config, { store, operations: purchaseEmailOperations, now });
  const hash = (purpose, value) => createHmac('sha256', config.secret).update(`${purpose}:${value}`).digest('base64url');
  const userId = email => hash('email', email);
  const submitPurchaseHelp = createPurchaseHelp({ store, now, hash });
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
      const amount = config.ticketPriceCents ?? price.unit_amount;
      const currency = price.currency;
      const useInlinePrice = amount !== price.unit_amount;
      if (useInlinePrice && typeof price.product !== 'string') return null;
      const lineItem = useInlinePrice
        ? { price_data: { product: price.product, currency, unit_amount: amount, tax_behavior: price.tax_behavior }, quantity: 1 }
        : { price: price.id, quantity: 1 };
      priceCache = { price: { amount, currency, lineItem }, until: now() + 5 * minute };
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

  async function receiptFor(purchase) {
    const saved = stripeReceiptUrl(purchase?.receiptUrl);
    if (saved || !purchase || !stripe) return saved;
    let receipt = '';
    try {
      const checkout = await stripe.checkout.sessions.retrieve(purchase.checkoutId, { expand: ['payment_intent.latest_charge'] },
        { timeout: 2000, maxNetworkRetries: 0 });
      if (checkout.livemode === config.live && checkout.payment_status === 'paid' &&
          checkout.metadata?.product === 'aerie-founder-and-gift') {
        receipt = stripeReceiptUrl(checkout.payment_intent?.latest_charge?.receipt_url);
      }
    } catch {
      return '';
    }
    return receipt;
  }

  async function access(login, includePurchaseDetails = false) {
    const uid = login?.uid;
    const account = uid && !login.checkoutId ? await store.get(accountKey(uid)) : null;
    // A paid Checkout authorizes the current purchase. Email verification is
    // required to access any earlier purchases made with the same address.
    const ids = login?.checkoutId ? [login.checkoutId] : purchases(account);
    const records = (await Promise.all(ids.map(id => store.get(`purchase:${id}`)))).filter(Boolean);
    const payments = await Promise.all(records.map(activePayment));
    const active = records.filter((_purchase, index) => payments[index]);
    const worlds = active.length ? allWorlds : account?.reward ? [freeWorld, ...config.rewards] : [freeWorld];
    const result = { authenticated: Boolean(uid), emailVerified: Boolean(uid && !login.checkoutId), fullAccess: active.length > 0, worlds };
    if (includePurchaseDetails) {
      const receipt = await receiptFor(records.findLast(purchase => purchase.buyer === uid));
      if (receipt) result.receiptUrl = receipt;
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

  function friendPass(request) {
    const token = cookieValue(request, friendsCookie);
    const match = /^(\d{1,13})\.([\w-]{43})\.([\w-]{43})$/.exec(token);
    if (!match || Number(match[1]) <= now()) return false;
    const expected = hash('share-friends:' + config.mode, match[1] + '.' + match[2]);
    return timingSafeEqual(Buffer.from(match[3]), Buffer.from(expected));
  }

  async function playerAccess(request, includeGift = false) {
    const result = await access(await identity(request), includeGift);
    if (!result.fullAccess && friendPass(request)) result.worlds = [freeWorld, ...config.rewards];
    return result;
  }

  async function sharedWithFriends(request) {
    if (!shareEnabled) throw new HttpError(503, 'Sharing rewards are currently unavailable.');
    const body = await readJson(request);
    if (body.sharedWithFive !== true) throw new HttpError(400, 'Confirm that you shared Aerie with five friends.');
    const login = await identity(request);
    if (login && !login.checkoutId) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const account = await store.get(accountKey(login.uid));
        if (account?.reward) break;
        try {
          await store.transaction([[account ? 'replace' : 'create', row(accountKey(login.uid), { ...account, reward: true })]]);
          break;
        } catch (error) {
          if (!conflict(error) || attempt === 4) throw error;
        }
      }
    }
    const current = await access(login);
    const worlds = current.fullAccess ? allWorlds : [freeWorld, ...config.rewards];
    const value = (now() + 365 * day) + '.' + newToken();
    const signature = hash('share-friends:' + config.mode, value);
    return { jsonBody: { ok: true, worlds }, cookies: [cookie(friendsCookie, value + '.' + signature, 365 * day / 1000)] };
  }

  async function createCheckout(request, _context, browserOrigin) {
    const price = await offer();
    if (!price) throw new HttpError(503, 'Checkout is currently unavailable.');
    const { email: suppliedEmail, wallet, expectedOffer } = await readJson(request);
    if (expectedOffer !== undefined &&
        (expectedOffer?.mode !== config.mode ||
         expectedOffer?.amount !== price.amount ||
         expectedOffer?.currency !== price.currency)) {
      return { status: 409, jsonBody: { offerChanged: true, error: 'The ticket offer changed.' } };
    }
    if (wallet !== undefined && wallet !== 'google_pay') throw new HttpError(400, 'Unsupported checkout wallet.');
    const googlePay = wallet === 'google_pay';
    const customerEmail = suppliedEmail === undefined ? {} : { customer_email: emailAddress(suppliedEmail) };
    const token = newToken();
    const reference = digest(token);
    const checkout = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [price.lineItem],
      ...(price.lineItem.price_data && { expand: ['line_items'] }),
      automatic_tax: { enabled: true },
      adaptive_pricing: { enabled: false },
      billing_address_collection: 'auto',
      ...(googlePay && { shipping_address_collection: { allowed_countries: checkoutAddressCountries } }),
      custom_text: {
        ...(googlePay && { shipping_address: {
          message: 'Your ticket is digital. Stripe uses this address to calculate tax for Google Pay.'
        } }),
        submit: {
          message: 'Your bank may show Aerie’s publisher, The ComplianceAide, during verification.\n\n' + [
            '[Terms](https://playaerie.com/join/policies/#terms)',
            '[Refund policy](https://playaerie.com/join/policies/#refunds)',
            '[Privacy](https://playaerie.com/join/policies/#privacy)',
            '[Purchase help](https://playaerie.com/join/help/)'
          ].join(' · ')
        }
      },
      branding_settings: {
        display_name: 'Aerie',
        background_color: '#0d1919',
        button_color: '#efd092',
        ...(secureCookies && { logo: { type: 'url', url: `${config.site}${joinPath}media/aerie-checkout-logo.png` } })
      },
      ...customerEmail,
      client_reference_id: reference,
      metadata: { product: 'aerie-founder-and-gift' },
      payment_intent_data: {
        statement_descriptor_suffix: 'AERIE',
        metadata: { product: 'aerie-founder-and-gift' }
      },
      success_url: `${browserOrigin}${joinPath}return/#order=${reference}`,
      cancel_url: `${browserOrigin}${joinPath}?checkout=cancel`
    });
    if (!checkout.url || new URL(checkout.url).origin !== 'https://checkout.stripe.com') throw new Error('Unexpected hosted Checkout URL.');
    // Inline prices get an immutable Stripe ID only after Checkout creates the session.
    // Save that exact ID before handing out the payment link, just as for a catalog price.
    let priceId = price.lineItem.price;
    if (!priceId) {
      const expected = price.lineItem.price_data;
      const generated = checkout.line_items?.data?.[0]?.price;
      if (!generated?.id || generated.product !== expected.product || generated.unit_amount !== expected.unit_amount ||
          generated.currency !== expected.currency || generated.tax_behavior !== expected.tax_behavior ||
          checkout.amount_subtotal !== price.amount) {
        throw new Error('Hosted Checkout did not confirm the ticket price.');
      }
      priceId = generated.id;
    }
    await store.transaction([['create', row(`pending:${reference}`, {
      checkoutId: checkout.id, priceId, amount: price.amount, currency: price.currency, checkoutOrigin: browserOrigin, createdAt: now()
    })]]);
    return { jsonBody: { url: checkout.url }, cookies: [cookie(checkoutCookieFor(checkout.id), token, 24 * 60 * 60)] };
  }

  async function fulfill(checkoutId, expectedReference) {
    let checkout;
    try {
      checkout = await stripe.checkout.sessions.retrieve(checkoutId, { expand: ['line_items', 'payment_intent.latest_charge'] });
    } catch (error) {
      if (error.type !== 'StripePermissionError' && error.param !== 'expand') throw error;
      checkout = await stripe.checkout.sessions.retrieve(checkoutId, { expand: ['line_items'] });
    }
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
    const paymentIntent = typeof checkout.payment_intent === 'string' ? checkout.payment_intent : checkout.payment_intent?.id;
    if (typeof paymentIntent !== 'string' || !paymentIntent.startsWith('pi_')) throw new Error('Missing Stripe payment reference.');
    const buyerEmail = emailAddress(checkout.customer_details?.email);
    const uid = userId(buyerEmail);
    const receiptUrl = stripeReceiptUrl(checkout.payment_intent?.latest_charge?.receipt_url);
    const purchase = row(`purchase:${checkout.id}`, {
      checkoutId: checkout.id, paymentIntent, buyer: uid, currency: checkout.currency,
      ...(Number.isSafeInteger(checkout.amount_total) && { amountTotal: checkout.amount_total }),
      ...(receiptUrl && { receiptUrl })
    });
    const site = config.origins.has(pending.checkoutOrigin) ? pending.checkoutOrigin : config.site;
    const confirmation = purchaseMail.enqueue(purchase, buyerEmail, site);
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
          addPurchase(account, uid, checkout.id),
          ...(confirmation ? [['create', confirmation]] : [])
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

  async function verifiedCheckoutCookies(request, id) {
    if (!stripe || !store || !/^cs_(test|live)_[\w]+$/.test(id || '')) return;
    const scopedCookie = checkoutCookieFor(id);
    const scopedToken = cookieValue(request, scopedCookie);
    // Sessions opened before this version still return with the original cookie.
    const token = scopedToken || cookieValue(request, legacyCheckoutCookie);
    if (!tokenPattern.test(token)) return;
    const result = await fulfill(id, digest(token));
    if (!result?.paid) return;
    const sessionToken = newToken();
    await store.transaction([['create', session(sessionToken, result.uid, id)]]);
    const usedCookie = scopedToken ? scopedCookie : legacyCheckoutCookie;
    return [cookie(sessionCookie, sessionToken, 30 * 24 * 60 * 60), cookie(usedCookie, '', 0)];
  }

  async function completeCheckout(request) {
    const cookies = await verifiedCheckoutCookies(request, request.query.get('session_id'));
    return joinRedirect(cookies ? 'success' : 'pending', cookies);
  }

  async function confirmCheckout(request) {
    const { order } = await readJson(request);
    if (typeof order !== 'string' || !/^[a-f0-9]{64}$/.test(order)) throw new HttpError(400, 'Invalid ticket reference.');
    if (!store || !stripe) throw new HttpError(503, 'Ticket confirmation is temporarily unavailable.');
    const pending = await store.get(`pending:${order}`);
    if (!pending?.checkoutId) return { jsonBody: { state: 'pending' } };
    const cookies = await verifiedCheckoutCookies(request, pending.checkoutId);
    if (cookies) return { jsonBody: { state: 'success' }, cookies };
    // A response interrupted after Set-Cookie can leave the buyer signed in with the checkout cookie consumed.
    const login = await identity(request);
    if (login?.checkoutId === pending.checkoutId && await activePayment(await store.get(`purchase:${pending.checkoutId}`))) {
      return { jsonBody: { state: 'success' } };
    }
    return { jsonBody: { state: 'pending' } };
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
    const previousNonce = cookieValue(request, restoreCookie);
    const browserNonce = tokenPattern.test(previousNonce) ? previousNonce : newToken();
    const passcode = String(randomInt(100_000_000)).padStart(8, '0');
    const gift = typeof code === 'string' && tokenPattern.test(code) && await store.get(`gift:${digest(code)}`);
    try {
      await store.transaction([
        [previous ? 'replace' : 'create', row(key, { ...previous, nextSend: now() + minute })],
        ['create', row(`restore:${digest(token)}`, {
          uid, expiresAt: now() + 15 * minute,
          browserProof: digest(browserNonce),
          codeProof: hash('restore-code', `${token}:${passcode}`),
          codeAttempts: 0,
          giftCheckoutId: gift && (!gift.redeemedBy || gift.redeemedBy === uid) ? gift.checkoutId : ''
        })]
      ]);
    } catch (error) {
      if (conflict(error)) throw new HttpError(429, 'Please wait a minute before requesting another email.');
      throw error;
    }
    const restoreUrl = `${browserOrigin}${joinPath}#restore=${token}`;
    const instructions = 'Open this link to continue to Aerie.';
    const codeInstructions = 'If you open the link in another browser, enter this code:';
    const expiration = 'The link expires in 15 minutes and works once.';
    await sendEmail(email, 'Continue to Aerie', {
      plainText: `${instructions}\n\n${restoreUrl}\n\n${codeInstructions} ${passcode}\n\n${expiration}`,
      html: `<p>${instructions}</p><p><a href="${restoreUrl}">Continue to Aerie</a></p><p>${codeInstructions} <strong>${passcode}</strong></p><p>${expiration}</p>`
    });
    return { jsonBody: { ok: true }, cookies: [cookie(restoreCookie, browserNonce, 15 * 60)] };
  }

  async function confirmRestore(request) {
    if (!restoreEnabled) throw new HttpError(503, 'Email restoration is currently unavailable.');
    const { token, code } = await readJson(request);
    const expired = 'This link is no longer valid. Request a new access email.';
    if (typeof token !== 'string' || !tokenPattern.test(token)) throw new HttpError(400, expired);
    const nonce = cookieValue(request, restoreCookie);
    const browserProof = tokenPattern.test(nonce) ? digest(nonce) : '';
    const codeProof = typeof code === 'string' && restoreCodePattern.test(code)
      ? Buffer.from(hash('restore-code', `${token}:${code}`), 'base64url')
      : null;
    const key = `restore:${digest(token)}`;
    for (let retry = 0; retry <= restoreCodeLimit; retry++) {
      const link = await store.get(key);
      if (!link || link.used || link.expiresAt <= now() || !link.browserProof || !tokenPattern.test(link.codeProof || '')) {
        throw new HttpError(400, expired);
      }
      if (browserProof !== link.browserProof) {
        if (link.codeAttempts >= restoreCodeLimit) {
          return { status: 429, jsonBody: { error: 'Too many code attempts. Request a new access email.', codeAttemptsExceeded: true } };
        }
        if (code === undefined) return { jsonBody: { ok: false, codeRequired: true } };
        if (!codeProof || !timingSafeEqual(codeProof, Buffer.from(link.codeProof, 'base64url'))) {
          try {
            await store.transaction([['replace', { ...link, codeAttempts: link.codeAttempts + 1 }]]);
            return { status: 400, jsonBody: { error: 'Enter the eight-digit code from your email.', codeInvalid: true } };
          } catch (error) {
            if (conflict(error)) continue;
            if (error.statusCode === 404) throw new HttpError(400, expired);
            throw error;
          }
        }
      }
      const login = newToken();
      try {
        const actions = [['replace', { ...link, used: true }], ['create', session(login, link.uid)]];
        if (friendPass(request)) {
          const account = await store.get(accountKey(link.uid));
          if (!account?.reward) actions.push([account ? 'replace' : 'create', row(accountKey(link.uid), { ...account, reward: true })]);
        }
        await store.transaction(actions);
        return {
          cookies: [cookie(sessionCookie, login, 30 * 24 * 60 * 60)],
          jsonBody: { ok: true, ...(link.giftCheckoutId ? { giftCode: giftCode(link.giftCheckoutId) } : {}) }
        };
      } catch (error) {
        if (error.statusCode === 404) throw new HttpError(400, expired);
        if (!conflict(error)) throw error;
      }
    }
    throw new HttpError(429, 'This link is busy. Try confirming it again.');
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
      ...(price ? { priceLabel: `$${(price.amount / 100).toFixed(2)} USD`, priceAmount: price.amount, priceCurrency: price.currency } : {}),
      ...(config.releaseRevision && { releaseRevision: config.releaseRevision }),
      checkoutMode: config.mode, checkoutCollectsEmail: true, googlePayCheckout: features.checkout, disclosure, monitoring: Boolean(config.monitoring)
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
    status: ['GET', async request => ({ jsonBody: await playerAccess(request, true) })],
    signup: ['POST', signup],
    checkout: ['POST', createCheckout],
    'checkout/complete': ['GET', completeCheckout],
    'checkout/confirm': ['POST', confirmCheckout],
    restore: ['POST', requestRestore],
    'restore/confirm': ['POST', confirmRestore],
    'gift/redeem': ['POST', redeemGift],
    'share-claim': ['POST', submitClaim],
    'share-friends': ['POST', sharedWithFriends],
    'purchase-help': ['POST', async (request, context) => {
      if (!config.purchaseHelp || !store) throw new HttpError(503, 'Purchase help is temporarily unavailable.');
      const body = await readJson(request, 4096);
      return submitPurchaseHelp({ ...body, email: emailAddress(body.email) }, context);
    }],
    telemetry: ['POST', telemetry],
    'stripe/webhook': ['POST', webhook],
    asset: ['GET', async request => {
      const { world, path } = downloadTarget(request.query);
      if (!assetUrl) throw new HttpError(503, 'Private world downloads are not configured.');
      if (!(await playerAccess(request)).worlds.includes(world)) {
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

  return { handle, review, routes, purchaseMail };
}
