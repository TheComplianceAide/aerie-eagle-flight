import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import Stripe from 'stripe';
import { createCommerce } from '../src/commerce.mjs';
import { allWorlds, configuration } from '../src/settings.mjs';

const site = 'https://aerie.example';
const alias = 'https://www.aerie.example';
const functionsHost = 'https://aerie-functions.example';
const signingSecret = 'whsec_test_fixture_no_real_credentials';
const priceId = 'price_fixture';
const receiptFixture = 'https://pay.stripe.com/receipts/payment/fixture?source=aerie&mode=test';
const root = configuration({
  AERIE_SITE_URL: site, AERIE_ALLOWED_ORIGINS: alias,
  AERIE_IDENTITY_SECRET: 'fictional-test-identity-key-no-real-credentials',
  AERIE_STRIPE_WEBHOOK_SECRET: signingSecret, AERIE_STRIPE_PRICE_ID: priceId,
  AERIE_SHARE_CLAIMS_ENABLED: 'true', AERIE_SIGNUP_ENABLED: 'true', AERIE_CHECKOUT_ENABLED: 'true'
});

function fixture({ config = {}, purchaseEmailOperations, hasPreviewReward, previewCheckoutId, now = Date.now } = {}) {
  const settings = { ...root, ...config };
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
    },
    async *pendingPurchaseMail(time) {
      for (const [key, row] of [...rows.entries()]) {
        if (key.startsWith('purchase-mail:') && row.nextAt <= time) yield structuredClone(row);
      }
    }
  };
  const stripe = {
    webhooks: new Stripe('sk_test_synthetic_fixture').webhooks,
    prices: { retrieve: async () => ({ id: priceId, active: true, type: 'one_time', product: 'prod_aerie', tax_behavior: 'exclusive', currency: 'usd', unit_amount: 499, livemode: settings.live }) },
    paymentIntents: { retrieve: async id => ({
      metadata: [...checkouts.values()].find(session => session.payment_intent === id)?.metadata || {}
    }) },
    checkout: { sessions: {
      async list({ payment_intent }) {
        return { data: [...checkouts.values()].filter(session => session.payment_intent === payment_intent) };
      },
      async create(input) {
        sessions.push(input);
        const id = `cs_${settings.mode}_fixture${sessions.length}`;
        const data = input.line_items[0].price_data;
        const price = data ? { id: `price_inline${sessions.length}`, ...data } : { id: priceId };
        const subtotal = data?.unit_amount ?? 499;
        const checkout = {
          ...input, id, url: `https://checkout.stripe.com/c/pay/${id}`, currency: 'usd', livemode: settings.live,
          amount_subtotal: subtotal, amount_total: subtotal + Math.round(subtotal * 0.064), payment_intent: `pi_fixture${sessions.length}`, payment_status: 'unpaid',
          line_items: { data: [{ quantity: 1, price }] }, customer_details: { email: input.customer_email }
        };
        checkouts.set(id, checkout);
        return checkout;
      },
      async retrieve(id, params) {
        const checkout = structuredClone(checkouts.get(id));
        if (checkout && params?.expand?.includes('payment_intent.latest_charge')) {
          checkout.payment_intent = {
            id: checkout.payment_intent,
            latest_charge: { receipt_url: checkout.receiptUrl ?? receiptFixture }
          };
        }
        return checkout;
      }
    }}
  };
  const app = createCommerce(settings, {
    store, stripe, purchaseEmailOperations, hasPreviewReward, previewCheckoutId, now,
    sendEmail: async (email, subject, content) => messages.push({ email, subject, ...content }),
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
    const payload = JSON.stringify({ type, data: { object: value }, livemode: settings.live, created: Math.floor(now() / 1000) });
    const webhook = stripe.webhooks.generateTestHeaderString({ payload, secret: signingSecret });
    return call('stripe/webhook', { body: payload, origin: null, webhook: signatureValid ? webhook : 'not-a-signature' });
  }
  async function buy(email) {
    const start = await call('checkout', { body: { email, amount: 1 } });
    assert.equal(start.cookies[0].sameSite, 'Lax');
    assert.equal(start.cookies[0].httpOnly, true);
    assert.equal(sessions.at(-1).automatic_tax.enabled, true);
    assert.equal(sessions.at(-1).billing_address_collection, 'auto');
    assert.equal(sessions.at(-1).payment_intent_data.statement_descriptor_suffix, 'AERIE');
    assert.equal(sessions.at(-1).customer_email, email);
    assert.deepEqual(sessions.at(-1).line_items, [{ price: priceId, quantity: 1 }]);
    const state = asCookie(start.cookies[0]);
    const id = [...checkouts.keys()].at(-1);
    checkouts.get(id).payment_status = 'paid';
    const finish = await call('checkout/complete', { query: `?session_id=${id}`, cookie: state });
    assert.match(finish.headers.Location, /checkout=success$/);
    return { id, state, cookie: asCookie(finish.cookies[0]) };
  }
  async function restore(email, gift, friendCookie = '') {
    const started = await call('restore', { body: { email, gift } });
    assert.equal(started.jsonBody.ok, true);
    const token = messages.at(-1).plainText.match(/#restore=([\w-]+)/)[1];
    const ended = await call('restore/confirm', { body: { token }, cookie: [asCookie(started.cookies[0]), friendCookie].filter(Boolean).join('; ') });
    assert.equal(ended.jsonBody.ok, true);
    return { token, cookie: asCookie(ended.cookies[0]), result: ended.jsonBody };
  }
  return { app, call, buy, restore, dispatch, sessions, messages, rows, checkouts, settings };
}

const asCookie = cookie => `${cookie.name}=${cookie.value}`;

test('checkout config identifies the packaged revision when present', async () => {
  const releaseRevision = '0'.repeat(40);
  const packaged = fixture({ config: { releaseRevision } });
  assert.equal((await packaged.call('config')).jsonBody.releaseRevision, releaseRevision);
  assert.ok(!('releaseRevision' in (await fixture().call('config')).jsonBody));
});

test('an unconfigured site exposes only free play and cannot start paid Checkout', async () => {
  const config = configuration();
  const app = createCommerce(config, {});
  const req = new Request('https://aerie.example/api/aerie/config');
  const flags = await app.handle('config', req);
  assert.deepEqual(flags.jsonBody.features, { signup: false, checkout: false, shareClaim: false, restore: false });
  assert.equal(flags.jsonBody.freeWorld, 'winnipesaukee');
  assert.equal(flags.jsonBody.googlePayCheckout, false);
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

test('stale or malformed displayed offers never open a Stripe session or reserve a ticket', async () => {
  for (const mode of ['test', 'live']) {
    const { call, sessions, rows } = fixture({ config: { mode, live: mode === 'live', ticketPriceCents: 199 } });
    const displayed = { mode, amount: 199, currency: 'usd' };
    for (const expectedOffer of [
      { ...displayed, mode: mode === 'test' ? 'live' : 'test' },
      { ...displayed, amount: 99 }, { ...displayed, currency: 'cad' },
      { ...displayed, amount: '199' }, { mode, amount: 199 },
      null, false, 'test', [], {}
    ]) {
      const result = await call('checkout', { body: { expectedOffer, wallet: 'google_pay' } });
      assert.equal(result.status, 409);
      assert.deepEqual(result.jsonBody, { offerChanged: true, error: 'The ticket offer changed.' });
    }
    assert.equal(sessions.length, 0);
    assert.equal(rows.size, 0);
  }
});

test('standard and wallet checkout accept the displayed offer and keep the server price authoritative', async () => {
  const { call, sessions, rows } = fixture({ config: { ticketPriceCents: 199 } });
  const offer = (await call('config')).jsonBody;
  const displayed = { mode: offer.checkoutMode, amount: offer.priceAmount, currency: offer.priceCurrency };
  for (const wallet of [undefined, 'google_pay']) {
    for (const expectedOffer of [displayed, undefined]) {
      const result = await call('checkout', { body: { expectedOffer, wallet, amount: 1 } });
      assert.ok(result.jsonBody.url);
      const input = sessions.at(-1);
      assert.equal(input.line_items[0].price_data.unit_amount, 199);
      assert.equal(rows.get('pending:' + input.client_reference_id).amount, 199);
      assert.equal(Boolean(input.shipping_address_collection), wallet === 'google_pay');
    }
  }
});

test('only a Google Pay opt-in collects a Stripe tax address for the digital ticket', async () => {
  const { call, sessions, rows } = fixture();
  assert.equal((await call('config')).jsonBody.googlePayCheckout, true);
  for (const wallet of ['apple_pay', null, true, ['google_pay']]) {
    assert.equal((await call('checkout', { body: { wallet } })).status, 400);
  }
  assert.equal(sessions.length, 0);
  assert.equal(rows.size, 0);
  for (const body of [{}, { email: 'player@example.com' }]) {
    assert.ok((await call('checkout', { body })).jsonBody.url);
    assert.equal(sessions.at(-1).shipping_address_collection, undefined);
    assert.equal(sessions.at(-1).custom_text.shipping_address, undefined);
  }
  const walletCheckout = await call('checkout', { body: { wallet: 'google_pay' } });
  assert.ok(walletCheckout.jsonBody.url);
  const hosted = sessions.at(-1);
  assert.equal(hosted.automatic_tax.enabled, true);
  assert.equal(hosted.customer_email, undefined);
  assert.match(hosted.custom_text.shipping_address.message, /digital.*tax/i);
  assert.equal(hosted.custom_text.submit.message, sessions[0].custom_text.submit.message);
  const sdkTypes = new URL('resources/Checkout/Sessions.d.ts', import.meta.resolve('stripe'));
  const declarations = await readFile(sdkTypes, 'utf8');
  const allowed = declarations.match(/namespace ShippingAddressCollection\s*\{\s*type AllowedCountry = ([^;]+);/)[1];
  const expected = [...allowed.matchAll(/'([A-Z]{2})'/g)].map(match => match[1]).filter(code => code !== 'ZZ');
  assert.deepEqual(hosted.shipping_address_collection.allowed_countries, expected);
});

test('changing the ticket to 99 cents preserves pending $4.99 payments, old receipts and the gift', async () => {
  let time = Date.now();
  const { call, buy, rows, checkouts, settings, sessions } = fixture({ now: () => time });
  const original = await buy('early@example.test');
  const opened = await call('checkout', { body: { email: 'opened@example.test' } });
  const openId = [...checkouts.keys()].at(-1);
  settings.ticketPriceCents = 99;
  time += 6 * 60_000;
  assert.equal((await call('config')).jsonBody.priceLabel, '$0.99 USD');
  const earlier = (await call('status', { cookie: original.cookie })).jsonBody;
  assert.equal(earlier.receiptUrl, receiptFixture);
  assert.ok(earlier.fullAccess && earlier.giftUrl);
  checkouts.get(openId).payment_status = 'paid';
  const returned = await call('checkout/complete', { query: '?session_id=' + openId, cookie: asCookie(opened.cookies[0]) });
  assert.match(returned.headers.Location, /checkout=success$/);
  assert.equal(rows.get('purchase:' + openId).amountTotal, 531);
  for (const wallet of [undefined, 'google_pay']) {
    const start = await call('checkout', { body: { email: 'current@example.test', wallet, amount: 1, priceId: 'price_untrusted' } });
    const input = sessions.at(-1);
    assert.deepEqual(input.line_items, [{ quantity: 1, price_data: { product: 'prod_aerie', currency: 'usd', unit_amount: 99, tax_behavior: 'exclusive' } }]);
    assert.deepEqual(input.expand, ['line_items']);
    const current = [...checkouts.values()].at(-1);
    const pending = rows.get('pending:' + current.client_reference_id);
    const generatedId = current.line_items.data[0].price.id;
    assert.equal(pending.priceId, generatedId);
    assert.equal(pending.amount, 99);
    current.payment_status = 'paid';
    current.line_items.data[0].price.id = priceId;
    const request = { query: '?session_id=' + current.id, cookie: asCookie(start.cookies[0]) };
    assert.match((await call('checkout/complete', request)).headers.Location, /checkout=pending$/);
    current.line_items.data[0].price.id = generatedId;
    const confirmed = await call('checkout/complete', request);
    assert.match(confirmed.headers.Location, /checkout=success$/);
    const status = (await call('status', { cookie: asCookie(confirmed.cookies[0]) })).jsonBody;
    assert.ok(status.fullAccess && status.giftUrl);
    assert.equal(status.receiptUrl, receiptFixture);
  }
});

test('new $1.99 tickets leave an already-open 99-cent ticket and its receipt at the original price', async () => {
  let time = Date.now();
  const { call, rows, checkouts, settings } = fixture({ now: () => time, config: { ticketPriceCents: 99 } });
  const earlier = await call('checkout', { body: { email: 'old-price@example.test' } });
  const original = [...checkouts.values()].at(-1);
  const displayed = { mode: 'test', amount: original.amount_subtotal, currency: original.currency };
  settings.ticketPriceCents = 199;
  time += 6 * 60_000;
  assert.equal((await call('config')).jsonBody.priceLabel, '$1.99 USD');
  const stale = await call('checkout', { body: { expectedOffer: displayed } });
  assert.equal(stale.status, 409);
  assert.equal(checkouts.size, 1);
  assert.equal(rows.size, 1);
  for (const wallet of [undefined, 'google_pay']) {
    await call('checkout', { body: { wallet, amount: 99 } });
    const latest = [...checkouts.values()].at(-1);
    assert.equal(latest.amount_subtotal, 199);
    assert.equal(rows.get('pending:' + latest.client_reference_id).amount, 199);
  }
  assert.equal(original.amount_subtotal, 99);
  original.payment_status = 'paid';
  const returned = await call('checkout/complete', {
    query: '?session_id=' + original.id, cookie: asCookie(earlier.cookies[0])
  });
  assert.match(returned.headers.Location, /checkout=success$/);
  const purchase = rows.get('purchase:' + original.id);
  assert.equal(purchase.amountTotal, original.amount_total);
  const access = (await call('status', { cookie: asCookie(returned.cookies[0]) })).jsonBody;
  assert.equal(access.receiptUrl, receiptFixture);
  assert.ok(access.fullAccess && access.giftUrl);
});

test('invalid USD ticket amounts fail closed at configuration time', () => {
  assert.equal(configuration({ AERIE_TICKET_PRICE_CENTS: '199' }).ticketPriceCents, 199);
  for (const cents of ['0', '-99', '0.99', 'NaN', '499999999', '49']) {
    assert.throws(() => configuration({ AERIE_TICKET_PRICE_CENTS: cents }), /AERIE_TICKET_PRICE_CENTS/);
  }
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
  const { call, buy, dispatch, rows } = fixture();
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
});

test('a paid webhook is retried until its order can be verified without a browser return', async () => {
  const { call, dispatch, rows, checkouts } = fixture();
  await call('checkout', { body: { email: 'closed-tab@example.test' } });
  const [checkout] = checkouts.values();
  const key = 'pending:' + checkout.client_reference_id;
  const order = rows.get(key);
  rows.delete(key);
  const report = () => dispatch('checkout.session.completed', { id: checkout.id });
  assert.equal((await report()).jsonBody.ok, true); // Unpaid session.
  checkout.payment_status = 'paid';
  checkout.metadata.product = 'unrelated';
  assert.equal((await report()).jsonBody.ok, true);
  checkout.metadata.product = 'aerie-founder-and-gift';
  assert.equal((await report()).status, 503);
  assert.equal(rows.has('purchase:' + checkout.id), false);

  rows.set(key, order);
  assert.equal((await report()).jsonBody.ok, true);
  rows.delete(key);
  assert.equal((await report()).jsonBody.ok, true); // Duplicate of a durable purchase.
  assert.equal([...rows.keys()].filter(k => k.startsWith('purchase:')).length, 1);
  assert.equal([...rows.keys()].filter(k => k.startsWith('gift:')).length, 1);
});

test('an open preview checkout returning after launch can exit to free play', async () => {
  const preview = fixture();
  const started = await preview.call('checkout', { body: {} });
  const [checkout] = preview.checkouts.values();
  const order = checkout.client_reference_id;
  const live = fixture({
    config: { mode: 'live', live: true },
    previewCheckoutId: async reference => preview.rows.get('pending:' + reference)?.checkoutId ?? null
  });
  const owner = await live.call('checkout/confirm', { body: { order }, cookie: asCookie(started.cookies[0]) });
  assert.deepEqual(owner.jsonBody, { state: 'preview-ended' });
  assert.equal(owner.cookies, undefined);
  assert.deepEqual((await live.call('checkout/confirm', { body: { order } })).jsonBody, { state: 'pending' });
  const legacy = await live.call('checkout/complete', { query: '?session_id=' + checkout.id, cookie: asCookie(started.cookies[0]) });
  assert.equal(legacy.status, 303);
  assert.equal(legacy.headers.Location, '/join/?checkout=preview-ended');
  assert.equal(legacy.cookies, undefined);
  assert.equal(live.rows.size, 0);
});

test('static checkout returns recover only their own paid order, including after the checkout cookie is consumed', async () => {
  const { call, rows, checkouts, sessions } = fixture();
  const first = await call('checkout', { body: { email: 'first@example.test' } });
  const second = await call('checkout', { body: { email: 'second@example.test' } });
  const [one, two] = [...checkouts.values()];
  const firstCookie = asCookie(first.cookies[0]);
  const secondCookie = asCookie(second.cookies[0]);
  const body = { order: one.client_reference_id };
  const confirm = cookie => call('checkout/confirm', { body, cookie });
  assert.equal(one.success_url, `${site}/join/return/#order=${body.order}`);
  assert.equal(rows.get('pending:' + body.order).checkoutId, one.id);
  assert.equal((await confirm(firstCookie)).jsonBody.state, 'pending');
  one.payment_status = 'paid';
  assert.equal((await confirm(secondCookie)).jsonBody.state, 'pending');
  assert.equal((await confirm()).jsonBody.state, 'pending');
  assert.equal((await call('checkout/confirm', { body, cookie: firstCookie, origin: 'https://unrelated.example' })).status, 403);
  const confirmed = await confirm(firstCookie);
  assert.deepEqual(confirmed.jsonBody, { state: 'success' });
  assert.equal(confirmed.cookies[1].name, first.cookies[0].name);
  assert.equal(confirmed.cookies[1].maxAge, 0);
  const buyer = asCookie(confirmed.cookies[0]);
  assert.equal((await call('status', { cookie: buyer })).jsonBody.fullAccess, true);
  const replay = await confirm(buyer);
  assert.deepEqual(replay.jsonBody, { state: 'success' });
  assert.equal(replay.cookies, undefined);
  assert.equal((await call('checkout/confirm', { body: { order: two.client_reference_id }, cookie: buyer })).jsonBody.state, 'pending');
  rows.get('payment:' + one.payment_intent).refunded = true;
  assert.equal((await confirm(buyer)).jsonBody.state, 'pending');
  assert.equal(sessions.length, 2);
});

test('the static return accepts only an opaque order reference in a same-origin POST', async () => {
  const { call, sessions, rows } = fixture();
  for (const order of [null, 'cs_test_fixture', {}, 'a'.repeat(65)]) {
    assert.equal((await call('checkout/confirm', { body: { order } })).status, 400);
  }
  assert.equal((await call('checkout/confirm')).status, 405);
  assert.equal((await call('checkout/confirm', { body: { order: 'a'.repeat(64) } })).jsonBody.state, 'pending');
  assert.equal(sessions.length, 0);
  assert.equal(rows.size, 0);
});

test('a buyer can finish either checkout after opening two tabs', async () => {
  const { call, checkouts } = fixture();
  const email = 'two-tabs@example.test';
  const first = await call('checkout', { body: { email } });
  const second = await call('checkout', { body: { email, wallet: 'google_pay' }, cookie: asCookie(first.cookies[0]) });
  const browser = new Map([first, second].map(start => [start.cookies[0].name, start.cookies[0]]));
  for (const checkout of checkouts.values()) {
    checkout.payment_status = 'paid';
    const returned = await call('checkout/complete', {
      query: `?session_id=${checkout.id}`, cookie: [...browser.values()].map(asCookie).join('; ')
    });
    assert.match(returned.headers.Location, /checkout=success$/);
    const [session, consumed] = returned.cookies;
    assert.equal(consumed.maxAge, 0);
    assert.ok(browser.delete(consumed.name));
    assert.equal((await call('status', { cookie: asCookie(session) })).jsonBody.fullAccess, true);
  }
  assert.equal(browser.size, 0);
});

test('a checkout opened before the update can return beside a newer checkout', async () => {
  const { call, checkouts } = fixture();
  const first = await call('checkout', { body: { email: 'already-open@example.test' } });
  const legacy = { ...first.cookies[0], name: '__Host-aerie_checkout' };
  const newer = await call('checkout', { body: {}, cookie: asCookie(legacy) });
  const [checkout] = checkouts.values();
  checkout.payment_status = 'paid';
  const returned = await call('checkout/complete', {
    query: `?session_id=${checkout.id}`, cookie: [legacy, newer.cookies[0]].map(asCookie).join('; ')
  });
  assert.match(returned.headers.Location, /checkout=success$/);
  assert.equal(returned.cookies[1].name, legacy.name);
  assert.notEqual(returned.cookies[1].name, newer.cookies[0].name);
});

test('the verified buyer gets a Stripe receipt and one exact sandbox confirmation after racing returns and webhooks', async () => {
  let time = Date.now();
  const submitted = [];
  const { app, call, checkouts, dispatch, restore, rows } = fixture({
    now: () => time,
    config: { purchaseEmails: true, sender: 'aerie@example.test', sandboxPurchaseEmail: 'qa@example.test',
      sandboxPurchaseTestPayer: 'synthetic-buyer@example.com' },
    purchaseEmailOperations: {
      submit: async (message, operationId, date) => {
        submitted.push({ message, operationId, date });
        return { state: 'pending' };
      },
      status: async () => ({ state: 'accepted' })
    }
  });
  const started = await call('checkout', { body: { email: 'synthetic-buyer@example.com' }, origin: alias });
  const checkout = [...checkouts.values()][0];
  checkout.payment_status = 'paid';
  const finish = () => call('checkout/complete', {
    query: `?session_id=${checkout.id}`, origin: null, cookie: asCookie(started.cookies[0])
  });
  const [returned, hook, replay] = await Promise.all([
    finish(), dispatch('checkout.session.completed', { id: checkout.id }),
    dispatch('checkout.session.completed', { id: checkout.id })
  ]);
  assert.match(returned.headers.Location, /checkout=success$/);
  assert.ok(hook.jsonBody.ok && replay.jsonBody.ok);
  const buyerCookie = asCookie(returned.cookies[0]);
  const bought = (await call('status', { cookie: buyerCookie })).jsonBody;
  assert.equal(bought.receiptUrl, receiptFixture);
  const gift = new URL(bought.giftUrl, alias).hash.slice('#gift='.length);
  const friend = await restore('gift-recipient@example.test', gift);
  assert.ok((await call('gift/redeem', { body: { code: gift }, cookie: friend.cookie })).jsonBody.ok);
  assert.equal((await call('status', { cookie: friend.cookie })).jsonBody.receiptUrl, undefined);
  assert.equal((await call('status', { cookie: buyerCookie })).jsonBody.receiptUrl, receiptFixture);
  assert.equal([...rows.keys()].filter(key => key.startsWith('purchase-mail:')).length, 1);

  await Promise.all([app.purchaseMail.deliver(), app.purchaseMail.deliver()]);
  assert.equal(submitted.length, 1);
  const { message } = submitted[0];
  assert.deepEqual(message.recipients.to, [{ address: 'qa@example.test' }]);
  assert.match(message.content.subject, /Aerie sandbox/);
  assert.match(message.content.plainText, /\$5\.31 USD/);
  assert.ok(message.content.plainText.includes(`Play Aerie at ${alias}/join/#play`));
  assert.ok(message.content.plainText.includes(`Restore ticket at ${alias}/join/#restore-ticket`));
  assert.match(message.content.plainText, /My ticket in Aerie to copy your gift link/);
  assert.ok(message.content.html.includes(`href="${alias}/join/#play" style=`));
  assert.ok(message.content.html.includes(`href="${alias}/join/#restore-ticket">Restore ticket`));
  assert.ok(message.content.html.indexOf('Play Aerie') < message.content.html.indexOf('Restore ticket'));
  assert.ok(message.content.plainText.includes(`${alias}/join/help/`));
  assert.ok(message.content.html.includes(`href="${alias}/join/help/">Purchase help`));
  assert.ok(message.content.plainText.includes(receiptFixture));
  assert.ok(message.content.html.includes(receiptFixture.replace('&', '&amp;')));
  assert.ok(message.content.html.indexOf('Restore ticket') < message.content.html.indexOf('View your Stripe receipt'));
  assert.doesNotMatch(JSON.stringify(message), /#(?:gift|restore)=/);
  assert.ok(!JSON.stringify(message).includes(gift) && !JSON.stringify(message).includes('synthetic-buyer@'));
  time += 60_000;
  await app.purchaseMail.deliver();
  await dispatch('checkout.session.completed', { id: checkout.id });
  const notice = rows.get(`purchase-mail:${checkout.id}`);
  assert.equal(notice.state, 'accepted');
  assert.equal(notice.message, undefined);
  assert.equal(submitted.length, 1);
});

test('receipt lookup is buyer-only for historic purchases and sandbox email requires an explicit QA recipient', async () => {
  const { call, buy, rows } = fixture({
    config: { purchaseEmails: true, sender: 'aerie@example.test' },
    purchaseEmailOperations: { submit: async () => assert.fail('Unapproved sandbox recipient') }
  });
  const paid = await buy('legacy-buyer@example.test');
  const saved = rows.get(`purchase:${paid.id}`);
  delete saved.receiptUrl;
  assert.equal((await call('status', { cookie: paid.cookie })).jsonBody.receiptUrl, receiptFixture);
  assert.equal((await call('status')).jsonBody.receiptUrl, undefined);
  assert.equal([...rows.keys()].some(key => key.startsWith('purchase-mail:')), false);
});

test('sandbox redirects only the configured reserved payer and offers normal access to other sandbox purchases', async () => {
  const approved = 'authorized-checkout@example.com';
  assert.equal(configuration({ AERIE_SANDBOX_PURCHASE_TEST_PAYER: 'Someone@nonreserved.example' }).sandboxPurchaseTestPayer, '');
  assert.equal(configuration({ AERIE_SANDBOX_PURCHASE_TEST_PAYER: ' Authorized-Checkout@Example.com ' }).sandboxPurchaseTestPayer, approved);
  const { app, buy, call, rows } = fixture({
    config: { purchaseEmails: true, sender: 'aerie@example.test', sandboxPurchaseEmail: 'qa@example.test',
      sandboxPurchaseTestPayer: approved },
    purchaseEmailOperations: { submit: async () => assert.fail('Unapproved sandbox purchase was sent') }
  });
  assert.equal(app.purchaseMail.enabled, true);
  const unrelated = await buy('different-payer@example.com');
  const buyer = await call('status', { cookie: unrelated.cookie });
  assert.equal(buyer.jsonBody.fullAccess, true);
  assert.equal(buyer.jsonBody.receiptUrl, receiptFixture);
  assert.equal([...rows.keys()].some(key => key.startsWith('purchase-mail:')), false);
  await app.purchaseMail.deliver();
});

test('a live confirmation targets the final verified Stripe email and skips an unsafe receipt URL', async () => {
  const { call, checkouts, dispatch, rows } = fixture({
    config: { mode: 'live', live: true, purchaseEmails: true, sender: 'aerie@example.test', sandboxPurchaseEmail: 'qa@example.test' },
    purchaseEmailOperations: { submit: async () => assert.fail('This fixture does not send') }
  });
  await call('checkout', { body: { email: 'prefill@example.test' } });
  const checkout = [...checkouts.values()][0];
  checkout.payment_status = 'paid';
  checkout.customer_details.email = 'actual-checkout@example.test';
  checkout.receiptUrl = 'https://pay.stripe.com.untrusted.test/receipts/payment/fixture';
  assert.ok((await dispatch('checkout.session.completed', { id: checkout.id })).jsonBody.ok);
  const { message } = rows.get(`purchase-mail:${checkout.id}`);
  const confirmation = JSON.parse(message);
  assert.deepEqual(confirmation.recipients.to, [{ address: 'actual-checkout@example.test' }]);
  assert.equal(confirmation.content.subject, 'Aerie purchase confirmation');
  assert.ok(!message.includes('untrusted.test'));
});

test('an ambiguous send is retried with the same provider operation and never re-submitted outside the replay window', async () => {
  let time = Date.now();
  const submissions = [];
  const { app, buy, rows } = fixture({
    now: () => time,
    config: { purchaseEmails: true, sender: 'aerie@example.test', sandboxPurchaseEmail: 'qa@example.test',
      sandboxPurchaseTestPayer: 'retry-buyer@example.com' },
    purchaseEmailOperations: {
      submit: async (...args) => { submissions.push(args); return { state: 'unknown' }; },
      status: async () => ({ state: 'missing' })
    }
  });
  const paid = await buy('retry-buyer@example.com');
  await app.purchaseMail.deliver();
  time += 60_000;
  await app.purchaseMail.deliver();
  assert.equal(submissions.length, 2);
  assert.deepEqual(submissions[0], submissions[1]);
  time += 4 * 60_000;
  await app.purchaseMail.deliver();
  assert.equal(rows.get(`purchase-mail:${paid.id}`).state, 'review');
  assert.equal(submissions.length, 2);
});

test('a definitively throttled initial send retries later with a new provider operation without losing access', async () => {
  let time = Date.now();
  const submissions = [];
  const { app, buy, call, rows } = fixture({
    now: () => time,
    config: { purchaseEmails: true, sender: 'aerie@example.test', sandboxPurchaseEmail: 'qa@example.test',
      sandboxPurchaseTestPayer: 'throttled-buyer@example.com' },
    purchaseEmailOperations: {
      submit: async (_message, operationId) => {
        submissions.push(operationId);
        return { state: submissions.length === 1 ? 'throttled' : 'pending' };
      },
      status: async () => ({ state: 'accepted' })
    }
  });
  const paid = await buy('throttled-buyer@example.com');
  await app.purchaseMail.deliver();
  const status = await call('status', { cookie: paid.cookie });
  assert.equal(status.jsonBody.fullAccess, true);
  time += 3 * 60_000;
  await app.purchaseMail.deliver();
  assert.equal(submissions.length, 2);
  assert.notEqual(submissions[0], submissions[1]);
  time += 60_000;
  await app.purchaseMail.deliver();
  assert.equal(rows.get(`purchase-mail:${paid.id}`).state, 'accepted');
});

test('signed full refunds revoke the buyer and redeemed gift without revoking access on partial refunds', async () => {
  const { call, buy, restore, dispatch, checkouts } = fixture();
  const buyer = await buy('refund-buyer@example.test');
  const buyerStatus = await call('status', { cookie: buyer.cookie });
  const code = new URL(buyerStatus.jsonBody.giftUrl, site).hash.slice('#gift='.length);
  const friend = await restore('refund-friend@example.test', code);
  assert.equal((await call('gift/redeem', { body: { code }, cookie: friend.cookie })).jsonBody.ok, true);
  const charge = { payment_intent: checkouts.get(buyer.id).payment_intent };
  assert.equal((await dispatch('charge.refunded', { ...charge, refunded: true }, false)).status, 400);
  assert.equal((await dispatch('charge.refunded', { ...charge, refunded: false })).jsonBody.ok, true);
  for (const actor of [buyer, friend]) {
    assert.equal((await call('status', { cookie: actor.cookie })).jsonBody.fullAccess, true);
  }

  const refunded = await Promise.all(Array.from({ length: 2 }, () => dispatch('charge.refunded', { ...charge, refunded: true })));
  assert.ok(refunded.every(response => response.jsonBody.ok));
  assert.equal((await dispatch('checkout.session.completed', { id: buyer.id })).jsonBody.ok, true);
  for (const actor of [buyer, friend]) {
    const { jsonBody } = await call('status', { cookie: actor.cookie });
    assert.equal(jsonBody.authenticated, true);
    assert.equal(jsonBody.fullAccess, false);
    assert.deepEqual(jsonBody.worlds, ['winnipesaukee']);
    assert.equal(jsonBody.giftUrl, undefined);
    assert.equal((await call('asset', { query: '?world=moosehead&path=scene.bin', cookie: actor.cookie })).status, 403);
  }
  assert.equal((await call('gift/redeem', { body: { code }, cookie: friend.cookie })).status, 404);
});

test('signed dispute outcomes suspend and restore the correct buyer and redeemed gift independently per case', async () => {
  let time = 1_800_000_000_000;
  const { call, buy, restore, dispatch, checkouts, rows } = fixture({ now: () => time });
  const buyer = await buy('dispute-buyer@example.test');
  const other = await buy('unrelated@example.test');
  const { giftUrl } = (await call('status', { cookie: buyer.cookie })).jsonBody;
  const code = new URL(giftUrl, site).hash.slice('#gift='.length);
  const friend = await restore('gift-recipient@example.test', code);
  assert.equal((await call('gift/redeem', { body: { code }, cookie: friend.cookie })).jsonBody.ok, true);
  const pi = checkouts.get(buyer.id).payment_intent;
  const dispute = async (type, id, status) => {
    const result = await dispatch('charge.dispute.' + type, { id, status, payment_intent: pi });
    assert.equal(result.jsonBody.ok, true);
  };
  const access = async expected => {
    for (const cookie of [buyer.cookie, friend.cookie]) assert.equal((await call('status', { cookie })).jsonBody.fullAccess, expected);
    assert.equal((await call('status', { cookie: other.cookie })).jsonBody.fullAccess, true);
  };
  await dispute('created', 'du_inquiry', 'warning_needs_response');
  await dispute('updated', 'du_inquiry', 'warning_under_review');
  await access(true);
  await dispute('closed', 'du_inquiry', 'warning_closed');
  await access(true);
  await dispute('created', 'du_inquiry', 'warning_needs_response'); // Earlier same-second delivery.
  await access(true);
  time += 1000;
  await dispute('created', 'du_formal', 'warning_needs_response');
  await dispute('funds_withdrawn', 'du_formal', 'needs_response');
  await dispute('updated', 'du_formal', 'under_review');
  await dispute('updated', 'du_formal', 'warning_under_review');
  await dispute('closed', 'du_formal', 'warning_closed');
  await access(false);
  await dispute('created', 'du_prevention', 'needs_response');
  await dispute('updated', 'du_prevention', 'prevented');
  await access(false); // The other dispute is still open.
  time += 1000;
  await dispute('closed', 'du_formal', 'won');
  await access(true);
  await dispute('created', 'du_prevented_at_creation', 'prevented');
  await access(true);
  time += 1000;
  await dispute('closed', 'du_loss', 'lost');
  await dispute('closed', 'du_another', 'warning_closed');
  await access(false);
  time -= 1000;
  await dispute('closed', 'du_loss', 'won'); // Older delivery cannot reverse the loss.
  await access(false);
  await dispatch('charge.dispute.closed', { id: 'du_foreign', status: 'won', payment_intent: 'pi_elsewhere' });
  assert.equal(rows.has('payment:pi_elsewhere'), false);
});

test('an outcome for an unidentified historical hold requires review before restoring access', async () => {
  const { buy, checkouts, rows, dispatch, call } = fixture();
  const buyer = await buy('historical@example.test');
  const pi = checkouts.get(buyer.id).payment_intent;
  const payment = rows.get('payment:' + pi);
  Object.assign(payment, { disputed: true, disputeVersion: 12345 });
  const result = await dispatch('charge.dispute.closed', { id: 'du_new', payment_intent: pi, status: 'won' });
  assert.equal(result.jsonBody.ok, true);
  assert.equal(rows.get('payment:' + pi).legacyDisputeHold, true);
  assert.equal((await call('status', { cookie: buyer.cookie })).jsonBody.fullAccess, false);
});

test('a won pre-fulfillment dispute restores a paid ticket and one gift through webhook retries alone', async () => {
  const { call, restore, dispatch, checkouts, rows, sessions } = fixture();
  const email = 'early-dispute@example.test';
  await call('checkout', { body: { email } });
  const [checkout] = checkouts.values();
  checkout.payment_status = 'paid';
  const dispute = { id: 'du_early', payment_intent: checkout.payment_intent };
  await dispatch('charge.dispute.created', { ...dispute, status: 'needs_response' });
  await dispatch('checkout.session.completed', { id: checkout.id });
  assert.equal(rows.has('purchase:' + checkout.id), false);

  const key = 'pending:' + checkout.client_reference_id;
  const pending = rows.get(key);
  rows.delete(key);
  const won = () => dispatch('charge.dispute.closed', { ...dispute, status: 'won' });
  assert.equal((await won()).status, 503); // The release arrived but fulfillment still needs to be retried.
  rows.set(key, pending);
  const replays = await Promise.all([won(), won()]);
  assert.ok(replays.every(result => result.jsonBody.ok));
  const buyer = await restore(email);
  const access = (await call('status', { cookie: buyer.cookie })).jsonBody;
  assert.ok(access.fullAccess && access.giftUrl);
  assert.equal(sessions.length, 1);
  assert.equal([...rows.keys()].filter(k => k.startsWith('purchase:')).length, 1);
  assert.equal([...rows.keys()].filter(k => k.startsWith('gift:')).length, 1);
});

test('a signed refund received before Checkout fulfillment prevents both purchase and gift grants', async () => {
  const { call, dispatch, checkouts, rows } = fixture();
  const start = await call('checkout', { body: { email: 'refund-first@example.test' } });
  const checkout = [...checkouts.values()][0];
  checkout.payment_status = 'paid';
  const payment = { payment_intent: checkout.payment_intent, refunded: true };
  assert.equal((await dispatch('charge.refunded', payment)).jsonBody.ok, true);
  assert.equal((await dispatch('charge.dispute.closed', { ...payment, id: 'du_refunded', status: 'won' })).jsonBody.ok, true);
  assert.equal((await dispatch('checkout.session.completed', { id: checkout.id })).jsonBody.ok, true);
  const result = await call('checkout/complete', { query: `?session_id=${checkout.id}`, cookie: asCookie(start.cookies[0]) });
  assert.equal(result.headers.Location, '/join/?checkout=pending');
  assert.equal(result.cookies, undefined);
  assert.equal([...rows.keys()].some(key => key.startsWith('purchase:') || key.startsWith('gift:')), false);
});

test('an alias keeps checkout, hosted email recovery, and its gift on the originating host', async () => {
  const { call, sessions, checkouts, messages } = fixture();
  const flags = await call('config', { origin: null });
  assert.equal(flags.jsonBody.checkoutCollectsEmail, true);
  const start = await call('checkout', { body: {}, origin: alias });
  assert.equal(start.headers['Access-Control-Allow-Origin'], alias);
  assert.match(start.cookies[0].name, /^__Host-aerie_checkout_[a-f0-9]{24}$/);
  assert.equal(start.cookies[0].domain, undefined);
  assert.equal(start.cookies[0].secure, true);
  assert.equal(Object.hasOwn(sessions[0], 'customer_email'), false);
  assert.match(sessions[0].custom_text.submit.message, /bank may show Aerie’s publisher, The ComplianceAide, during verification/);
  const checkoutLinks = [...sessions[0].custom_text.submit.message.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)];
  assert.deepEqual(checkoutLinks.map(([, label, url]) => [label, url]), [
    ['Terms', 'https://playaerie.com/join/policies/#terms'],
    ['Refund policy', 'https://playaerie.com/join/policies/#refunds'],
    ['Privacy', 'https://playaerie.com/join/policies/#privacy'],
    ['Purchase help', 'https://playaerie.com/join/help/']
  ]);
  assert.deepEqual(sessions[0].branding_settings, {
    display_name: 'Aerie', background_color: '#0d1919', button_color: '#efd092',
    logo: { type: 'url', url: `${site}/join/media/aerie-checkout-logo.png` }
  });
  assert.equal(sessions[0].payment_intent_data.description, 'Aerie — all worlds plus one gift copy');
  assert.equal(sessions[0].success_url, `${alias}/join/return/#order=${sessions[0].client_reference_id}`);
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
  const restoreRequest = await call('restore', { origin: alias, body: { email: checkoutEmail } });
  assert.equal(messages[0].email, checkoutEmail);
  const link = messages[0].plainText.match(/https:\/\/\S+#restore=[\w-]+/)[0];
  assert.equal(new URL(link).origin, alias);
  assert.ok(messages[0].html.includes(`<a href="${link}">Continue to Aerie</a>`));
  const token = new URL(link).hash.slice('#restore='.length);
  const wrapped = `${token.slice(0, 24)}\n${token.slice(24)}`;
  assert.equal((await call('restore/confirm', { origin: alias, body: { token: wrapped } })).status, 400);
  const confirm = await call('restore/confirm', { origin: alias, body: { token }, cookie: asCookie(restoreRequest.cookies[0]) });
  const restored = (await call('status', { origin: null, cookie: asCookie(confirm.cookies[0]) })).jsonBody;
  assert.equal(restored.emailVerified, true);
  assert.equal(restored.giftUrl, bought.giftUrl);
});

test('opening a recovery link outside its requesting browser needs the emailed code and scanner requests never consume it', async () => {
  const { call, messages, rows } = fixture();
  const started = await call('restore', { origin: alias, body: { email: 'new-browser@example.test' } });
  const nonce = started.cookies[0];
  assert.equal(nonce.name, '__Host-aerie_restore');
  assert.equal(nonce.httpOnly, true);
  assert.equal(nonce.secure, true);
  assert.equal(nonce.sameSite, 'Lax');
  const { plainText, html } = messages[0];
  const token = plainText.match(/#restore=([\w-]+)/)[1];
  const code = plainText.match(/enter this code: (\d{8})/)[1];
  assert.ok(html.includes(`<strong>${code}</strong>`));
  assert.equal(html.includes(`#restore=${token}&code=`), false);
  const scanner = await Promise.all(Array.from({ length: 3 }, () => call('restore/confirm', { origin: alias, body: { token } })));
  for (const response of scanner) {
    assert.deepEqual(response.jsonBody, { ok: false, codeRequired: true });
    assert.equal(response.cookies, undefined);
  }
  const wrongNonce = '__Host-aerie_restore=' + 'a'.repeat(43);
  assert.deepEqual((await call('restore/confirm', { origin: alias, body: { token }, cookie: wrongNonce })).jsonBody,
    { ok: false, codeRequired: true });
  const row = [...rows.values()].find(entry => entry.rowKey.startsWith('restore:'));
  assert.equal(row.used, undefined);
  assert.equal(row.codeAttempts, 0);
  assert.notEqual(row.codeProof, code);
  const wrongCode = String((Number(code[0]) + 1) % 10) + code.slice(1);
  const rejected = await call('restore/confirm', { origin: alias, body: { token, code: wrongCode } });
  assert.equal(rejected.status, 400);
  assert.equal(rejected.jsonBody.codeInvalid, true);
  const newBrowser = await call('restore/confirm', { origin: alias, body: { token, code } });
  assert.equal(newBrowser.jsonBody.ok, true);
  const status = await call('status', { origin: alias, cookie: asCookie(newBrowser.cookies[0]) });
  assert.equal(status.jsonBody.emailVerified, true);
  assert.equal((await call('restore/confirm', { origin: alias, body: { token }, cookie: asCookie(nonce) })).status, 400);
});

test('concurrent wrong recovery codes have five durable attempts and do not lock the original browser out', async () => {
  const { call, messages, rows } = fixture();
  const opened = await call('restore', { body: { email: 'attempt-limit@example.test' } });
  const token = messages[0].plainText.match(/#restore=([\w-]+)/)[1];
  const code = messages[0].plainText.match(/enter this code: (\d{8})/)[1];
  const wrong = String((Number(code[0]) + 1) % 10) + code.slice(1);
  const attempts = await Promise.all(Array.from({ length: 6 }, () => call('restore/confirm', { body: { token, code: wrong } })));
  assert.equal(attempts.filter(result => result.jsonBody.codeInvalid).length, 5);
  assert.equal(attempts.filter(result => result.jsonBody.codeAttemptsExceeded).length, 1);
  const row = [...rows.values()].find(entry => entry.rowKey.startsWith('restore:'));
  assert.equal(row.codeAttempts, 5);
  assert.equal(row.used, undefined);
  const refused = await call('restore/confirm', { body: { token, code } });
  assert.equal(refused.status, 429);
  assert.equal(refused.jsonBody.codeAttemptsExceeded, true);
  const original = await call('restore/confirm', { body: { token }, cookie: asCookie(opened.cookies[0]) });
  assert.equal(original.jsonBody.ok, true);
  assert.equal((await call('restore/confirm', { body: { token, code } })).status, 400);
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

test('a guest can save the five earned worlds by confirming their email on a different device', async () => {
  let time = Date.now();
  const { call, restore, messages } = fixture({ now: () => time });
  const reward = await call('share-friends', { body: { sharedWithFive: true } });
  const friendCookie = asCookie(reward.cookies[0]);
  const email = 'travelling-friend@example.test';
  await call('restore', { body: { email }, cookie: friendCookie });
  const { plainText } = messages.at(-1);
  const token = plainText.match(/#restore=([\w-]+)/)[1];
  const code = plainText.match(/enter this code: (\d{8})/)[1];
  const unverified = await call('restore/confirm', { body: { token } });
  assert.equal(unverified.jsonBody.codeRequired, true);
  assert.equal(unverified.cookies, undefined);
  const verified = await call('restore/confirm', { body: { token, code } });
  const secondary = (await call('status', { cookie: asCookie(verified.cookies[0]) })).jsonBody;
  assert.deepEqual(secondary.worlds, reward.jsonBody.worlds);
  assert.equal(secondary.fullAccess, false);
  time += 61_000;
  const nextDevice = await restore(email);
  assert.deepEqual((await call('status', { cookie: nextDevice.cookie })).jsonBody.worlds, reward.jsonBody.worlds);
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
  assert.deepEqual((await call('status', { cookie: verified.cookie })).jsonBody.worlds, ['winnipesaukee', 'moosehead', 'canyon', 'labrador', 'alaska', 'acadia']);
  assert.equal((await call('asset', { query: '?world=canyon&path=scene.bin', cookie: verified.cookie })).status, undefined);
  assert.equal((await call('asset', { query: '?world=yosemite&path=scene.bin', cookie: verified.cookie })).status, 403);
});

test('launch honors existing sharing cookies and restored silver rewards while separating preview purchases', async () => {
  let time = Date.now();
  const preview = fixture({ now: () => time });
  const email = 'silver-preview@example.test';
  const buyer = await preview.buy(email);
  const verified = await preview.restore(email);
  await preview.call('share-friends', { body: { sharedWithFive: true }, cookie: verified.cookie });
  await preview.buy('gold-only-preview@example.test');

  const live = fixture({
    config: { mode: 'live', live: true }, now: () => time,
    hasPreviewReward: async uid => preview.rows.get('account:' + uid)?.reward === true
  });
  const worlds = ['winnipesaukee', ...live.settings.rewards];
  const oldValue = (time + 60_000) + '.' + 'a'.repeat(43);
  const legacySignature = createHmac('sha256', root.secret).update('share-friends:test:' + oldValue).digest('base64url');
  const legacy = '__Host-aerie_friends=' + oldValue + '.' + legacySignature;
  const guest = await live.call('status', { cookie: legacy });
  assert.equal(guest.jsonBody.authenticated, false);
  assert.deepEqual(guest.jsonBody.worlds, worlds);
  assert.deepEqual((await live.call('status', { cookie: buyer.cookie })).jsonBody.worlds, ['winnipesaukee']);

  const restored = await live.restore(email);
  const status = (await live.call('status', { cookie: restored.cookie, query: '?gift=1' })).jsonBody;
  assert.equal(status.emailVerified, true);
  assert.deepEqual(status.worlds, worlds);
  assert.equal(status.fullAccess, false);
  assert.equal(status.giftUrl, undefined);
  assert.equal(status.receiptUrl, undefined);
  assert.equal((await live.call('asset', { cookie: restored.cookie, query: '?world=moosehead&path=scene.bin' })).status ?? 200, 200);
  assert.equal((await live.call('asset', { cookie: restored.cookie, query: '?world=yellowstone&path=scene.bin' })).status, 403);
  const goldOnly = await live.restore('gold-only-preview@example.test');
  assert.deepEqual((await live.call('status', { cookie: goldOnly.cookie })).jsonBody.worlds, ['winnipesaukee']);

  time += 60_001;
  assert.deepEqual((await live.call('status', { cookie: legacy })).jsonBody.worlds, ['winnipesaukee']);
  const claimed = await live.call('share-friends', { body: { sharedWithFive: true } });
  assert.deepEqual((await preview.call('status', { cookie: asCookie(claimed.cookies[0]) })).jsonBody.worlds, worlds);
});

test('five-friend confirmation unlocks five worlds on this browser and survives email restore', async () => {
  const { call, restore } = fixture();
  const worlds = ['winnipesaukee', 'moosehead', 'canyon', 'labrador', 'alaska', 'acadia'];
  assert.deepEqual((await call('config')).jsonBody.rewardWorlds, worlds.slice(1));
  assert.equal((await call('share-friends', { body: { sharedWithFive: false } })).status, 400);
  const result = await call('share-friends', { body: { sharedWithFive: true } });
  assert.deepEqual(result.jsonBody.worlds, worlds);
  const cookie = asCookie(result.cookies[0]);
  assert.deepEqual((await call('status', { cookie })).jsonBody.worlds, worlds);
  const tampered = cookie.slice(0, -1) + (cookie.endsWith('A') ? 'B' : 'A');
  assert.deepEqual((await call('status', { cookie: tampered })).jsonBody.worlds, ['winnipesaukee']);
  assert.equal((await call('asset', { query: '?world=acadia&path=scene.bin', cookie })).jsonBody.url.includes('/acadia/'), true);
  assert.equal((await call('asset', { query: '?world=yellowstone&path=scene.bin', cookie })).status, 403);
  const verified = await restore('friends@example.test', undefined, cookie);
  assert.deepEqual((await call('status', { cookie: verified.cookie })).jsonBody.worlds, worlds);
  const another = await restore('second@example.test');
  await call('share-friends', { body: { sharedWithFive: true }, cookie: another.cookie });
  assert.deepEqual((await call('status', { cookie: another.cookie })).jsonBody.worlds, worlds);
});
