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
const receiptFixture = 'https://pay.stripe.com/receipts/payment/fixture?source=aerie&mode=test';
const root = configuration({
  AERIE_SITE_URL: site, AERIE_ALLOWED_ORIGINS: alias,
  AERIE_IDENTITY_SECRET: 'fictional-test-identity-key-no-real-credentials',
  AERIE_STRIPE_WEBHOOK_SECRET: signingSecret, AERIE_STRIPE_PRICE_ID: priceId,
  AERIE_SHARE_CLAIMS_ENABLED: 'true', AERIE_SIGNUP_ENABLED: 'true', AERIE_CHECKOUT_ENABLED: 'true'
});

function fixture({ config = {}, purchaseEmailOperations, now = Date.now } = {}) {
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
    prices: { retrieve: async () => ({ id: priceId, active: true, type: 'one_time', currency: 'usd', unit_amount: 499, livemode: settings.live }) },
    paymentIntents: { retrieve: async () => ({ metadata: { product: 'aerie-founder-and-gift' } }) },
    checkout: { sessions: {
      async create(input) {
        sessions.push(input);
        const id = `cs_${settings.mode}_fixture${sessions.length}`;
        const checkout = {
          ...input, id, url: `https://checkout.stripe.com/c/pay/${id}`, currency: 'usd', livemode: settings.live,
          amount_subtotal: 499, amount_total: 531, payment_intent: `pi_fixture${sessions.length}`, payment_status: 'unpaid',
          line_items: { data: [{ quantity: 1, price: { id: priceId } }] }, customer_details: { email: input.customer_email }
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
    store, stripe, purchaseEmailOperations, now,
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
  assert.match(message.content.plainText, /To restore access/);
  assert.ok(message.content.plainText.includes(`${alias}/join/help/`));
  assert.ok(message.content.plainText.includes(receiptFixture));
  assert.ok(message.content.html.includes(receiptFixture.replace('&', '&amp;')));
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

test('a signed refund received before Checkout fulfillment prevents both purchase and gift grants', async () => {
  const { call, dispatch, checkouts, rows } = fixture();
  const start = await call('checkout', { body: { email: 'refund-first@example.test' } });
  const checkout = [...checkouts.values()][0];
  checkout.payment_status = 'paid';
  const payment = { payment_intent: checkout.payment_intent, refunded: true };
  assert.equal((await dispatch('charge.refunded', payment)).jsonBody.ok, true);
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
