import assert from 'node:assert/strict';
import test from 'node:test';
import Stripe from 'stripe';
import { createCommerce } from '../src/commerce.mjs';
import { allWorlds, configuration } from '../src/settings.mjs';

const site = 'https://aerie.example';
const alias = 'https://www.aerie.example';
const functionsHost = 'https://aerie-functions.example';
const signingSecret = 'whsec_test_fixture_no_real_credentials';
const priceId = 'price_fixture';
const root = configuration({
  AERIE_SITE_URL: site, AERIE_ALLOWED_ORIGINS: alias,
  AERIE_IDENTITY_SECRET: 'fictional-test-identity-key-no-real-credentials',
  AERIE_STRIPE_WEBHOOK_SECRET: signingSecret, AERIE_STRIPE_PRICE_ID: priceId,
  AERIE_SHARE_CLAIMS_ENABLED: 'true', AERIE_SIGNUP_ENABLED: 'true', AERIE_CHECKOUT_ENABLED: 'true'
});

function fixture() {
  const rows = new Map();
  const checkouts = new Map();
  const messages = [];
  const sessions = [];
  let version = 1;
  const store = {
    async get(key) {
      return structuredClone(rows.get(key) ?? null);
    },
    async transaction(actions) {
      for (const [action, row] of actions) {
        const stored = rows.get(row.rowKey);
        if (action === 'create' && stored) throw Object.assign(new Error('duplicate'), { statusCode: 409 });
        if (action === 'replace' && (!stored || stored.etag !== row.etag)) {
          throw Object.assign(new Error('stale'), { statusCode: 412 });
        }
      }
      for (const [, row] of actions) rows.set(row.rowKey, { ...row, etag: String(version++) });
    }
  };
  const stripe = {
    webhooks: new Stripe('sk_test_synthetic_fixture').webhooks,
    prices: { retrieve: async () => ({ id: priceId, active: true, type: 'one_time', currency: 'usd', unit_amount: 499, livemode: false }) },
    paymentIntents: { retrieve: async () => ({ metadata: { product: 'aerie-founder-and-gift' } }) },
    checkout: { sessions: {
      async create(input) {
        sessions.push(input);
        const id = `cs_test_fixture${sessions.length}`;
        const checkout = {
          ...input, id, url: `https://checkout.stripe.com/c/pay/${id}`, currency: 'usd', livemode: false,
          amount_subtotal: 499, payment_intent: `pi_fixture${sessions.length}`, payment_status: 'unpaid',
          line_items: { data: [{ quantity: 1, price: { id: priceId } }] }, customer_details: { email: input.customer_email }
        };
        checkouts.set(id, checkout);
        return checkout;
      },
      async retrieve(id) {
        return structuredClone(checkouts.get(id));
      }
    }}
  };
  const app = createCommerce(root, {
    store, stripe,
    sendEmail: async (email, subject, body) => messages.push({ email, subject, body }),
    assetUrl: async (world, path) => `https://blob.example/private/${world}/${path}?fixture=read-only`
  });
  const call = (route, { body, cookie, query = '', origin = site, method, webhook, requestBase = functionsHost } = {}) => {
    const headers = {};
    if (origin) headers.origin = origin;
    if (cookie) headers.cookie = cookie;
    if (body) headers['content-type'] = 'application/json';
    if (webhook) headers['stripe-signature'] = webhook;
    const raw = typeof body === 'string' ? body : body && JSON.stringify(body);
    const req = new Request(`${requestBase}/api/aerie/${route}${query}`, {
      headers, body: raw, method: method || (raw ? 'POST' : 'GET')
    });
    req.query = new URL(req.url).searchParams;
    return app.handle(route, req);
  };
  async function dispatch(type, value, signatureValid = true) {
    const payload = JSON.stringify({ type, data: { object: value }, livemode: false, created: Math.floor(Date.now() / 1000) });
    const webhook = stripe.webhooks.generateTestHeaderString({ payload, secret: signingSecret });
    return call('stripe/webhook', { body: payload, origin: null, webhook: signatureValid ? webhook : 'not-a-signature' });
  }
  async function buy(email) {
    const start = await call('checkout', { body: { email, amount: 1 } });
    assert.equal(start.cookies[0].sameSite, 'Lax');
    assert.equal(start.cookies[0].httpOnly, true);
    assert.equal(sessions.at(-1).automatic_tax.enabled, true);
    assert.equal(sessions.at(-1).customer_email, email);
    assert.deepEqual(sessions.at(-1).line_items, [{ price: priceId, quantity: 1 }]);
    const state = asCookie(start.cookies[0]);
    const id = [...checkouts.keys()].at(-1);
    checkouts.get(id).payment_status = 'paid';
    const finish = await call('checkout/complete', { query: `?session_id=${id}`, cookie: state });
    assert.match(finish.headers.Location, /checkout=success$/);
    return { id, state, cookie: asCookie(finish.cookies[0]) };
  }
  async function restore(email, gift) {
    const started = await call('restore', { body: { email, gift } });
    assert.equal(started.jsonBody.ok, true);
    const token = messages.at(-1).body.match(/#restore=([\w-]+)/)[1];
    const ended = await call('restore/confirm', { body: { token } });
    assert.equal(ended.jsonBody.ok, true);
    return { token, cookie: asCookie(ended.cookies[0]), result: ended.jsonBody };
  }
  return { app, call, buy, restore, dispatch, sessions, messages, rows, checkouts };
}

const asCookie = cookie => `${cookie.name}=${cookie.value}`;

test('an unconfigured site exposes only free play and cannot start paid Checkout', async () => {
  const config = configuration();
  const app = createCommerce(config, {});
  const req = new Request('https://aerie.example/api/aerie/config');
  const flags = await app.handle('config', req);
  assert.deepEqual(flags.jsonBody.features, { signup: false, checkout: false, shareClaim: false, restore: false });
  assert.equal(flags.jsonBody.freeWorld, 'winnipesaukee');
  const status = await app.handle('status', req);
  assert.deepEqual(status.jsonBody.worlds, ['winnipesaukee']);
});

test('origin, email and offer are checked server-side before granting assets', async () => {
  const { call } = fixture();
  assert.equal((await call('config')).jsonBody.priceLabel, '$4.99 USD');
  assert.equal((await call('checkout', { body: { email: 'bad' } })).status, 400);
  assert.equal((await call('checkout', { body: { email: 'first@example.test' }, origin: 'https://untrusted.example' })).status, 403);
  assert.equal((await call('asset', { query: '?world=alaska&path=scene.bin' })).status, 403);
  assert.equal((await call('asset', { query: '?world=winnipesaukee&path=../alaska/scene.bin' })).status, 400);
  const publicFile = await call('asset', { query: '?world=winnipesaukee&path=scene.bin&redirect=1' });
  assert.equal(publicFile.status, 302);
  assert.match(publicFile.headers.Location, /\/winnipesaukee\/scene.bin\?/);
});

test('client monitoring strips private content, deduplicates errors and limits each app instance', async () => {
  const app = createCommerce({ ...root, monitoring: true }, {});
  const notices = [];
  const context = { warn: message => notices.push(message) };
  const report = { kind: 'startup', world: 'menu', version: '0.32.2', file: 'game.js', line: 42 };
  const reportError = (body, origin = site) => app.handle('telemetry', new Request(`${site}/api/aerie/telemetry`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body)
  }), context);
  assert.equal((await reportError({ ...report, email: 'person@example.test' })).status, 400);
  assert.equal((await reportError({ ...report, file: 'https://untrusted.example/script.js' })).status, 400);
  assert.equal((await reportError(report, 'https://untrusted.example')).status, 403);
  assert.equal((await reportError(report)).status, 204);
  assert.equal((await reportError(report)).status, 204);
  assert.equal(notices.length, 1);
  assert.deepEqual(JSON.parse(notices[0].slice('aerie_client_error '.length)), report);
  for (let line = 100; line < 129; line++) assert.equal((await reportError({ ...report, line })).status, 204);
  assert.equal((await reportError({ ...report, line: 130 })).status, 429);
});

test('checkout return verifies exact purchase and single fulfillment survives webhook retries', async () => {
  const { call, buy, dispatch, checkouts, rows } = fixture();
  const bought = await buy('buyer@example.test');
  const unrelated = await call('checkout/complete', { query: `?session_id=${bought.id}` });
  assert.match(unrelated.headers.Location, /checkout=pending$/);
  assert.equal(unrelated.cookies, undefined);
  assert.equal((await dispatch('checkout.session.completed', { id: bought.id }, false)).status, 400);
  const receipts = await Promise.all(Array.from({ length: 3 }, () => dispatch('checkout.session.completed', { id: bought.id })));
  assert.ok(receipts.every(receipt => receipt.jsonBody.ok));
  assert.equal([...rows.keys()].filter(key => key.startsWith('purchase:')).length, 1);
  assert.equal([...rows.keys()].filter(key => key.startsWith('gift:')).length, 1);
  assert.deepEqual((await call('status', { cookie: bought.cookie })).jsonBody.worlds, allWorlds);
  await dispatch('charge.refunded', { payment_intent: checkouts.get(bought.id).payment_intent, refunded: true });
  assert.deepEqual((await call('status', { cookie: bought.cookie })).jsonBody.worlds, ['winnipesaukee']);
});

test('an alias keeps checkout, hosted email recovery, and its gift on the originating host', async () => {
  const { call, sessions, checkouts, messages } = fixture();
  const flags = await call('config', { origin: null });
  assert.equal(flags.jsonBody.checkoutCollectsEmail, true);
  const start = await call('checkout', { body: {}, origin: alias });
  assert.equal(start.headers['Access-Control-Allow-Origin'], alias);
  assert.equal(start.cookies[0].name, '__Host-aerie_checkout');
  assert.equal(start.cookies[0].domain, undefined);
  assert.equal(start.cookies[0].secure, true);
  assert.equal(Object.hasOwn(sessions[0], 'customer_email'), false);
  assert.deepEqual(sessions[0].branding_settings, {
    display_name: 'Aerie', background_color: '#0d1919', button_color: '#efd092',
    logo: { type: 'url', url: `${site}/join/media/aerie-checkout-logo.png` }
  });
  assert.equal(sessions[0].success_url, `${alias}/api/aerie/checkout/complete?session_id={CHECKOUT_SESSION_ID}`);
  assert.equal(sessions[0].cancel_url, `${alias}/join/?checkout=cancel`);

  const checkout = [...checkouts.values()][0];
  const checkoutEmail = 'hosted-checkout@example.test';
  checkout.payment_status = 'paid';
  checkout.customer_details = { email: checkoutEmail };
  const query = `?session_id=${checkout.id}`;
  const wrongHost = await call('checkout/complete', { query, origin: null });
  assert.equal(wrongHost.headers.Location, '/join/?checkout=pending');
  const finish = await call('checkout/complete', { query, origin: null, cookie: asCookie(start.cookies[0]) });
  assert.equal(finish.status, 303);
  assert.equal(finish.headers.Location, '/join/?checkout=success');

  const bought = (await call('status', { origin: null, cookie: asCookie(finish.cookies[0]) })).jsonBody;
  assert.equal(bought.fullAccess, true);
  assert.match(bought.giftUrl, /^\/join\/#gift=[\w-]+$/);
  assert.equal(new URL(bought.giftUrl, alias).origin, alias);
  await call('restore', { origin: alias, body: { email: checkoutEmail } });
  assert.equal(messages[0].email, checkoutEmail);
  const link = messages[0].body.match(/https:\/\/\S+#restore=[\w-]+/)[0];
  assert.equal(new URL(link).origin, alias);
  const token = new URL(link).hash.slice('#restore='.length);
  const confirm = await call('restore/confirm', { origin: alias, body: { token } });
  const restored = (await call('status', { origin: null, cookie: asCookie(confirm.cookies[0]) })).jsonBody;
  assert.equal(restored.emailVerified, true);
  assert.equal(restored.giftUrl, bought.giftUrl);
});

test('verified email can restore access; checkout scoped cookies cannot see another purchase or consume a gift', async () => {
  const { call, buy, restore } = fixture();
  const older = await buy('buyer@example.test');
  const olderGift = (await call('status', { cookie: older.cookie })).jsonBody.giftUrl;
  const newer = await buy('buyer@example.test');
  const newerStatus = (await call('status', { cookie: newer.cookie })).jsonBody;
  assert.equal(newerStatus.emailVerified, false);
  assert.notEqual(newerStatus.giftUrl, olderGift);
  const code = new URL(olderGift, site).hash.split('=')[1];
  assert.equal((await call('gift/redeem', { body: { code }, cookie: newer.cookie })).status, 401);
  const { cookie, token } = await restore('buyer@example.test');
  const restored = (await call('status', { cookie })).jsonBody;
  assert.equal(restored.emailVerified, true);
  assert.equal(restored.giftUrl, olderGift);
  assert.equal((await call('restore/confirm', { body: { token } })).status, 400);
});

test('two verified friends cannot redeem the same gift', async () => {
  const { call, buy, restore, rows } = fixture();
  const buyer = await buy('buyer@example.test');
  const status = (await call('status', { cookie: buyer.cookie })).jsonBody;
  const code = new URL(status.giftUrl, site).hash.split('=')[1];
  const first = await restore('first@example.test', code);
  const second = await restore('second@example.test');
  assert.equal(first.result.giftCode, code);
  assert.equal(second.result.giftCode, undefined);
  const claims = await Promise.all([first, second].map(({ cookie }) => call('gift/redeem', { body: { code }, cookie })));
  assert.equal(claims.filter(claim => claim.jsonBody.ok).length, 1);
  assert.equal(claims.filter(claim => claim.status === 409).length, 1);
  assert.equal([...rows.values()].filter(row => row.rowKey.startsWith('gift:') && row.redeemedBy).length, 1);
  for (const [index, friend] of [first, second].entries()) {
    const state = (await call('status', { cookie: friend.cookie })).jsonBody;
    assert.equal(state.fullAccess, claims[index].jsonBody.ok === true);
  }
});

test('signup persists and public links remain locked until a human approves a claim', async () => {
  const { app, call, restore, rows } = fixture();
  const email = 'player@example.test';
  assert.ok((await call('signup', { body: { email } })).jsonBody.ok);
  assert.ok((await call('signup', { body: { email } })).jsonBody.ok);
  assert.equal([...rows.keys()].filter(key => key.startsWith('signup:')).length, 1);
  const verified = await restore(email);
  const pending = await call('share-claim', { body: { email, postUrl: 'https://twitter.com/player/status/123456?s=20' } });
  assert.equal(pending.jsonBody.status, 'pending');
  const duplicate = await call('share-claim', { body: { email: 'elsewhere@example.test', postUrl: 'https://x.com/i/web/status/123456' } });
  assert.equal(duplicate.status, 409);
  assert.deepEqual((await call('status', { cookie: verified.cookie })).jsonBody.worlds, ['winnipesaukee']);
  const claim = [...rows.values()].find(row => row.rowKey.startsWith('claim:'));
  await app.review(claim.uid, 'approved');
  assert.deepEqual((await call('status', { cookie: verified.cookie })).jsonBody.worlds, ['winnipesaukee', 'moosehead', 'canyon', 'labrador']);
  assert.equal((await call('asset', { query: '?world=canyon&path=scene.bin', cookie: verified.cookie })).status, undefined);
  assert.equal((await call('asset', { query: '?world=alaska&path=scene.bin', cookie: verified.cookie })).status, 403);
});
