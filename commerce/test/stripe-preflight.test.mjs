import assert from 'node:assert/strict';
import test from 'node:test';
import Stripe from 'stripe';
import { createCommerce, expiryProbeMarker, expiryProbeTag } from '../src/commerce.mjs';
import { configuration } from '../src/settings.mjs';
import { options, preflight } from '../tools/stripe-preflight.mjs';

const args = ['--mode', 'test', '--account', 'acct_Aerie'];
const opts = options([...args, '--registrations', 'none']);
const requiredEvents = [
  'checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.expired',
  'charge.refunded', 'charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.funds_withdrawn', 'charge.dispute.closed'
];
const url = 'https://playaerie.com/api/aerie/stripe/webhook';
const status = (report, name) => report.checks.find(c => c.name === name)?.status;

function fixture(livemode = false) {
  const product = { id: 'prod_Aerie', active: true, livemode, name: 'Support the Founder — Aerie + one gift copy', tax_code: 'txcd_10201000' };
  const price = { id: 'price_Aerie', product: product.id, livemode, active: true, unit_amount: 499, type: 'one_time', currency: 'usd', tax_behavior: 'exclusive' };
  const account = { id: 'acct_Aerie', charges_enabled: true, capabilities: { card_payments: 'active' } };
  const webhook = { url, status: 'enabled', livemode, enabled_events: [...requiredEvents] };
  const registrations = [];
  const expired = [];
  const sessions = {
    async create(input) {
      assert.equal(input.customer_email, undefined);
      assert.equal(input.payment_method, undefined);
      assert.ok(input.expires_at - Date.now() / 1000 > 1800);
      const line = input.line_items[0];
      sessions.opened = {
        id: livemode ? 'cs_live_fixture' : 'cs_test_fixture', url: 'https://checkout.stripe.com/fixture', livemode,
        amount_subtotal: 199, status: 'open', payment_status: 'unpaid', currency: 'usd',
        metadata: input.metadata, mode: input.mode, automatic_tax: input.automatic_tax,
        line_items: { has_more: false, data: [{ quantity: 1, price: line.price_data
          ? { ...line.price_data, id: 'price_inline' } : price }] }
      };
      return sessions.opened;
    },
    async retrieve() { return sessions.opened; },
    async expire(id) { expired.push(id); return { status: 'expired', payment_status: 'unpaid' }; }
  };
  const runtime = {
    accounts: { retrieve: async () => account },
    products: { search: () => [product], retrieve: async () => product },
    prices: { list: () => [price], retrieve: async () => price },
    webhookEndpoints: { list: () => [webhook] }, checkout: { sessions },
    tax: {
      settings: { retrieve: async () => ({ status: 'active', livemode }) },
      registrations: { list: () => registrations }
    }
  };
  return { product, price, account, webhook, registrations, expired, sessions, runtime,
    configuredCents: 199, signingSecret: 'whsec_fixture', readReceipt: async () => null };
}

test('operator has to select mode and seller; no registrations is a valid explicit confirmation', () => {
  assert.throws(() => options(['--account', 'acct_Aerie']));
  assert.throws(() => options(['--mode', 'live']));
  assert.throws(() => options([...args, '--registrations', 'US-']));
  assert.deepEqual(opts.registrations, []);
  assert.equal(options(args).registrations, undefined);
});

test('discovers one gift product and confirms the effective price, typed tax areas and an unpaid sandbox Checkout', async () => {
  const f = fixture();
  f.registrations.push(...[
    { country: 'US', country_options: { us: { state: 'ME' } } },
    { country: 'CA', country_options: { ca: { province_standard: { province: 'QC' } } } },
    { country: 'GB' }
  ].map(r => ({ ...r, livemode: false, status: 'active' })));
  const report = await preflight(options([...args, '--registrations', 'US-ME,CA-QC,GB', '--smoke']), f);
  assert.equal(report.configurationVerified, true);
  assert.equal(report.ready, false);
  assert.equal(report.signedDeliveryVerified, false);
  assert.equal(status(report, 'signed expiry delivery'), 'unverified');
  assert.equal(status(report, 'unopened Checkout'), 'pass');
  assert.deepEqual(f.expired, ['cs_test_fixture']);
});

test('an identified catalog $1.99 ticket requires no override or new session', async () => {
  const f = fixture();
  f.price.unit_amount = 199;
  f.runtime.products.search = () => assert.fail('unnecessary product search');
  const report = await preflight(opts, { ...f, priceId: f.price.id, configuredCents: undefined });
  assert.equal(report.ready, true);
  assert.deepEqual(f.expired, []);
});

test('seller mismatch stops before any catalog lookups or session creation', async () => {
  const f = fixture();
  f.runtime.prices.retrieve = () => assert.fail('wrong seller queried');
  f.account.id = 'acct_Another';
  const report = await preflight({ ...opts, smoke: true }, f);
  assert.equal(report.ready, false);
  assert.equal(report.checks.length, 1);
  assert.equal(status(report, 'seller account'), 'fail');
  assert.equal(f.sessions.opened, undefined);
});

test('rejects an invalid price, wrong product, incomplete webhook events and missing secret', async () => {
  for (const change of [
    f => { f.product.name = 'Other game'; },
    f => { f.price.currency = 'eur'; },
    f => { f.price.livemode = true; },
    f => { f.configuredCents = NaN; },
    f => { f.configuredCents = 99; },
    f => { f.product.tax_code = null; }
  ]) {
    const f = fixture();
    change(f);
    const report = await preflight({ ...opts, price: f.price.id, smoke: true }, f);
    assert.equal(status(report, 'ticket and gift'), 'fail');
    assert.equal(status(report, 'unopened Checkout'), 'skipped');
  }
  const f = fixture();
  f.webhook.enabled_events.pop();
  f.signingSecret = 'whsec_';
  const report = await preflight(opts, f);
  assert.equal(status(report, 'webhook endpoint'), 'fail');
  assert.equal(status(report, 'webhook secret'), 'fail');
});

test('preflight detects missing formal escalation or dispute update notifications', async () => {
  for (const event of ['charge.dispute.updated', 'charge.dispute.funds_withdrawn']) {
    const f = fixture();
    f.webhook.enabled_events = requiredEvents.filter(type => type !== event);
    assert.equal(status(await preflight(opts, f), 'webhook endpoint'), 'fail');
  }
});

test('tax confirmation is required for live smoke; neither none nor an empty Stripe list by itself implies confirmation', async () => {
  for (const registrations of [undefined, ['US-ME']]) {
    const f = fixture(true);
    const report = await preflight({ ...opts, mode: 'live', smoke: true, registrations }, f);
    assert.equal(status(report, 'active tax registrations'), 'fail');
    assert.equal(status(report, 'unopened Checkout'), 'skipped');
    assert.equal(f.sessions.opened, undefined);
  }
  assert.equal((await preflight({ ...opts, mode: 'live' }, fixture(true))).ready, true);
});

test('restricted or omitted account capabilities are unverified and provider errors stay private', async () => {
  const f = fixture(true);
  delete f.account.capabilities;
  const inspector = { ...f.runtime, webhookEndpoints: { list() {
    throw Object.assign(new Error('private provider detail'), { type: 'StripePermissionError' });
  } } };
  const report = await preflight({ ...opts, mode: 'live', smoke: true }, { ...f, inspector });
  assert.equal(status(report, 'card acquiring'), 'unverified');
  assert.equal(status(report, 'webhook endpoint'), 'unverified');
  assert.equal(status(report, 'unopened Checkout'), 'skipped');
  assert.doesNotMatch(JSON.stringify(report), /private provider detail/);
});

test('an opened smoke session expires even when Stripe returns an unexpected subtotal', async () => {
  const f = fixture();
  f.sessions.retrieve = async () => ({ ...f.sessions.opened, amount_subtotal: 99 });
  const report = await preflight({ ...opts, smoke: true }, f);
  assert.equal(status(report, 'unopened Checkout'), 'fail');
  assert.deepEqual(f.expired, ['cs_test_fixture']);
});


function localWebhook(live, secret) {
  const rows = new Map();
  const config = configuration({ AERIE_STRIPE_MODE: live ? 'live' : 'test', AERIE_SITE_URL: 'https://playaerie.com',
    AERIE_CHECKOUT_ENABLED: 'false', AERIE_STRIPE_WEBHOOK_SECRET: secret });
  const store = {
    async transaction([[action, row]]) {
      assert.equal(action, 'create');
      if (rows.has(row.rowKey)) throw Object.assign(new Error('Duplicate'), { statusCode: 409 });
      rows.set(row.rowKey, row);
    },
    async get(key) { return rows.get(key); }
  };
  const { webhooks } = new Stripe('sk_test_local_fixture');
  const app = createCommerce(config, { store, stripe: { webhooks } });
  async function deliver(checkout, eventLive = live, signer = secret) {
    const payload = JSON.stringify({ type: 'checkout.session.expired', livemode: eventLive, data: { object: checkout } });
    const signature = webhooks.generateTestHeaderString({ payload, secret: signer });
    return app.handle('stripe/webhook', new Request(url, {
      method: 'POST', headers: { 'stripe-signature': signature }, body: payload
    }));
  }
  return { rows, store, deliver };
}

test('both modes verify exactly one signed expiry through the staged commerce handler', async () => {
  for (const live of [false, true]) {
    const f = fixture(live);
    const mode = live ? 'live' : 'test';
    const receiver = localWebhook(live, f.signingSecret);
    f.stagedLiveReceiver = async () => true;
    f.sessions.expire = async () => {
      const expired = { ...f.sessions.opened, status: 'expired' };
      for (let retry = 0; retry < 2; retry++) assert.equal((await receiver.deliver(expired)).jsonBody.ok, true);
      return expired;
    };
    f.readReceipt = async (requestedMode, rowKey) => {
      assert.equal(requestedMode, mode);
      return receiver.rows.get(rowKey) || null;
    };
    const result = await preflight({ ...opts, mode, smoke: true }, f);
    assert.equal(result.configurationVerified, true);
    assert.equal(result.signedDeliveryVerified, true);
    assert.equal(result.ready, true);
    assert.equal(result.deliveryMarker, expiryProbeMarker(f.sessions.opened.id));
    assert.equal(receiver.rows.size, 1);
    assert.doesNotMatch(JSON.stringify([...receiver.rows.values()]), /cs_(live|test)|whsec_fixture|@|client_reference_id/);
    f.sessions.create = () => assert.fail('receipt recheck created a new Checkout');
    const replay = await preflight({ ...opts, mode, 'verify-delivery': result.deliveryMarker }, f);
    assert.equal(replay.signedDeliveryVerified, true);
    const rotated = await preflight({ ...opts, mode, 'verify-delivery': result.deliveryMarker },
      { ...f, signingSecret: 'whsec_rotated' });
    assert.equal(rotated.signedDeliveryVerified, false);
    const unrelated = await preflight({ ...opts, mode, 'verify-delivery': '0'.repeat(64) }, f);
    assert.equal(unrelated.configurationVerified, true);
    assert.equal(unrelated.signedDeliveryVerified, false);
    assert.equal(unrelated.ready, false);
  }
});

test('a marked expiry is accepted only after signature, event mode and session details are verified', async () => {
  const f = fixture();
  const r = localWebhook(false, f.signingSecret);
  const candidate = { id: 'cs_test_abc', livemode: false, status: 'expired', mode: 'payment',
    payment_status: 'unpaid', metadata: { product: 'aerie-founder-and-gift', aerie_preflight: expiryProbeTag } };
  assert.equal((await r.deliver(candidate, false, 'whsec_other')).status, 400);
  assert.equal((await r.deliver(candidate, true)).status, 400);
  for (const override of [{ metadata: {} }, { metadata: { product: 'aerie-founder-and-gift' } },
    { metadata: { product: 'unrelated', aerie_preflight: expiryProbeTag } }, { livemode: true },
    { id: 'cs_live_other' }, { status: 'open' }, { payment_status: 'paid' }, { mode: 'setup' }]) {
    assert.equal((await r.deliver({ ...candidate, ...override })).jsonBody.ok, true);
  }
  assert.equal(r.rows.size, 0);
  r.store.transaction = async () => { throw new Error('Unavailable'); };
  assert.equal((await r.deliver(candidate)).status, 503);
  assert.equal(r.rows.size, 0);
});

test('a smoke run requires the expiry subscription and a live site must first disable public checkout', async () => {
  for (const live of [false, true]) {
    const f = fixture(live);
    f.webhook.enabled_events = f.webhook.enabled_events.filter(t => t !== 'checkout.session.expired');
    const report = await preflight({ ...opts, smoke: true, mode: live ? 'live' : 'test' }, f);
    assert.equal(status(report, 'webhook endpoint'), 'fail');
    assert.equal(status(report, 'unopened Checkout'), 'skipped');
    assert.equal(f.sessions.opened, undefined);
  }
  const f = fixture(true);
  f.stagedLiveReceiver = async () => false;
  const result = await preflight({ ...opts, mode: 'live', smoke: true }, f);
  assert.equal(status(result, 'staged live receiver'), 'fail');
  assert.equal(status(result, 'unopened Checkout'), 'skipped');
  assert.equal(f.sessions.opened, undefined);
  assert.throws(() => options([...args, '--verify-delivery', 'cs_test_not_a_digest']));
  assert.throws(() => options([...args, '--verify-delivery', 'a'.repeat(64), '--smoke']));
});

test('table read restrictions remain distinct from a signed delivery', async () => {
  const f = fixture();
  f.readReceipt = async () => { throw new Error('private provider error'); };
  const result = await preflight({ ...opts, 'verify-delivery': 'a'.repeat(64) }, f);
  assert.equal(result.configurationVerified, true);
  assert.equal(result.signedDeliveryVerified, false);
  assert.equal(status(result, 'signed expiry delivery'), 'unverified');
  assert.doesNotMatch(JSON.stringify(result), /private provider error/);
});
