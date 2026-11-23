import assert from 'node:assert/strict';
import test from 'node:test';
import { options, preflight } from '../tools/stripe-preflight.mjs';

const args = ['--mode', 'test', '--account', 'acct_Aerie'];
const opts = options([...args, '--registrations', 'none']);
const requiredEvents = [
  'checkout.session.completed', 'checkout.session.async_payment_succeeded',
  'charge.refunded', 'charge.dispute.created', 'charge.dispute.closed'
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
        id: 'cs_fixture', url: 'https://checkout.stripe.com/fixture', livemode,
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
    configuredCents: 199, signingSecret: 'whsec_fixture' };
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
  assert.equal(report.ready, true);
  assert.equal(report.signedDeliveryVerified, false);
  assert.equal(status(report, 'unopened Checkout'), 'pass');
  assert.deepEqual(f.expired, ['cs_fixture']);
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
  assert.deepEqual(f.expired, ['cs_fixture']);
});
