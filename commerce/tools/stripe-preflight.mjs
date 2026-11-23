import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import Stripe from 'stripe';
import { createCommerce } from '../src/commerce.mjs';
import { configuration } from '../src/settings.mjs';

const site = 'https://playaerie.com';
const webhookUrl = site + '/api/aerie/stripe/webhook';
const productName = 'Support the Founder — Aerie + one gift copy';
const events = [
  'checkout.session.completed', 'checkout.session.async_payment_succeeded',
  'charge.refunded', 'charge.dispute.created', 'charge.dispute.closed'
];

class CheckError extends Error {}
function requireCheck(ok, message) {
  if (!ok) throw new CheckError(message);
}

export function options(args) {
  const { values } = parseArgs({ args, options: {
    mode: { type: 'string' }, account: { type: 'string' }, price: { type: 'string' },
    registrations: { type: 'string' }, smoke: { type: 'boolean' }, audit: { type: 'boolean' }
  } });
  requireCheck(['test', 'live'].includes(values.mode), 'Choose --mode test or --mode live.');
  requireCheck(/^acct_[a-zA-Z0-9]+$/.test(values.account || ''), 'Supply the intended Stripe --account acct_….');
  requireCheck(!values.price || /^price_[a-zA-Z0-9]+$/.test(values.price), 'Invalid --price.');
  const inputs = values.registrations?.toUpperCase().split(',').map(s => s.trim());
  if (inputs && values.registrations !== 'none') {
    requireCheck(inputs.every(s => /^[A-Z]{2}(-[A-Z0-9]{1,3})?$/.test(s)), 'Use registration locations such as US-ME,CA-QC,GB or none.');
  }
  return { ...values, registrations: values.registrations === 'none' ? [] : inputs };
}

function registrationLocation({ country, country_options: details }) {
  const state = details?.us?.state || details?.ca?.province_standard?.province;
  return (state ? country + '-' + state : country).toUpperCase();
}

async function selectPrice(stripe, priceId, cents) {
  if (!priceId) {
    const matches = [];
    for await (const product of stripe.products.search({ query: "active:'true' AND name:'" + productName + "'" })) {
      if (product.name === productName) matches.push(product);
    }
    requireCheck(matches.length === 1, 'Could not identify one Aerie gift product. Supply its confirmed --price price_….');
    const available = [];
    for await (const p of stripe.prices.list({ product: matches[0].id, type: 'one_time', currency: 'usd', active: true })) {
      available.push(p);
    }
    const exact = available.filter(p => p.unit_amount === cents);
    const choices = exact.length ? exact : available;
    requireCheck(choices.length === 1, 'Select the intended Aerie one-time USD catalog price with --price.');
    priceId = choices[0].id;
  }
  const price = await stripe.prices.retrieve(priceId);
  const product = await stripe.products.retrieve(price.product);
  return { ...price, product };
}

// Exercise the same Checkout builder as the site. No customer-facing URL, durable
// pending order, confirmation email, payment submission or entitlement is created.
async function smokeCheckout(runtime, opts, target, cents, signingSecret) {
  let created;
  const stripe = {
    prices: runtime.prices,
    checkout: { sessions: { create: async input => {
      created = await runtime.checkout.sessions.create({ ...input, expires_at: Math.floor(Date.now() / 1000) + 35 * 60 });
      return created;
    } } }
  };
  const config = configuration({
    AERIE_STRIPE_MODE: opts.mode, AERIE_SITE_URL: site, AERIE_CHECKOUT_ENABLED: 'true',
    AERIE_STRIPE_PRICE_ID: target.id, AERIE_TICKET_PRICE_CENTS: String(cents),
    AERIE_IDENTITY_SECRET: 'ephemeral-preflight-state-never-used-for-customers',
    AERIE_STRIPE_WEBHOOK_SECRET: signingSecret
  });
  let pending;
  const store = { async transaction(actions) { pending = actions[0][1]; } };
  const app = createCommerce(config, { stripe, store, sendEmail() {}, assetUrl() {} });
  try {
    const request = new Request(site + '/api/aerie/checkout', {
      method: 'POST', headers: { Origin: site, 'Content-Type': 'application/json' }, body: '{}'
    });
    const response = await app.handle('checkout', request, { error() {}, warn() {} });
    requireCheck(created && response.jsonBody?.url && created.livemode === (opts.mode === 'live'), 'Checkout creation or mode verification failed.');
    const session = await runtime.checkout.sessions.retrieve(created.id, { expand: ['line_items'] });
    const item = session.line_items?.data?.[0];
    requireCheck(session.status === 'open' && session.payment_status === 'unpaid' && session.mode === 'payment' &&
      session.livemode === created.livemode && session.currency === 'usd' && session.amount_subtotal === cents &&
      session.automatic_tax?.enabled && session.metadata?.product === 'aerie-founder-and-gift' && item?.quantity === 1 &&
      item.price?.product === target.product.id && item.price.id === pending?.priceId &&
      !session.line_items.has_more && session.line_items.data.length === 1, 'Hosted Checkout did not confirm the expected ticket.');
  } finally {
    if (created) {
      const expired = await runtime.checkout.sessions.expire(created.id);
      requireCheck(expired.status === 'expired' && expired.payment_status === 'unpaid', 'Could not confirm that the unopened session expired unpaid.');
    }
  }
  return 'Unopened $1.99 Checkout Session expired unpaid.';
}

export async function preflight(opts, { runtime, inspector = runtime, signingSecret, priceId, configuredCents }) {
  const checks = [];
  async function check(name, fn) {
    try {
      const detail = await fn();
      checks.push({ name, status: 'pass', detail });
      return true;
    } catch (e) {
      const unavailable = !(e instanceof CheckError);
      const detail = !unavailable ? e.message : e.type === 'StripePermissionError'
        ? 'Stripe denied this read. Verify in the Dashboard or use a scoped audit key.'
        : 'Provider request failed. Verify provider access and retry.';
      checks.push({ name, status: unavailable ? 'unverified' : 'fail', detail });
      return false;
    }
  }
  const result = () => ({ mode: opts.mode, ready: checks.every(c => c.status === 'pass'), signedDeliveryVerified: false, checks });
  let account;
  const matched = await check('seller account', async () => {
    account = await inspector.accounts.retrieve();
    requireCheck(account.id === opts.account, 'Authenticated Stripe account differs from the intended seller.');
    return account.id;
  });
  if (account && !matched) return result();
  if (matched && typeof account.charges_enabled === 'boolean' && typeof account.capabilities?.card_payments === 'string') {
    await check('card acquiring', () => {
      requireCheck(account.charges_enabled && account.capabilities?.card_payments === 'active', 'Charges or card payments are inactive.');
      return 'Charges enabled and card_payments active.';
    });
  } else checks.push({ name: 'card acquiring', status: 'unverified', detail: 'Account capabilities unavailable.' });

  const live = opts.mode === 'live';
  let selected, cents;
  const priceOk = await check('ticket and gift', async () => {
    selected = await selectPrice(inspector, opts.price || priceId, 199);
    const product = selected.product;
    requireCheck(product?.active && product.livemode === live && (product.name === productName || product.metadata?.product === 'aerie-founder-and-gift'),
      'Price does not identify an active Aerie ticket-and-gift product in this mode.');
    // The audit key, when used, must see the same object as the actual application key.
    const actual = await runtime.prices.retrieve(selected.id);
    requireCheck(actual.active && actual.livemode === live && actual.product === product.id &&
      actual.currency === 'usd' && actual.type === 'one_time' && actual.tax_behavior === 'exclusive' &&
      Number.isSafeInteger(actual.unit_amount) && actual.unit_amount > 0 && !!product.tax_code,
      'Aerie catalog price, product tax code, mode, currency or tax behavior is inconsistent.');
    cents = configuredCents ?? actual.unit_amount;
    requireCheck(cents === 199, 'Effective ticket amount must be 199 USD cents.');
    return { price: actual.id, product: product.id, cents, taxCode: product.tax_code, source: actual.unit_amount === cents ? 'catalog' : 'server-configured inline price' };
  });
  await check('webhook endpoint', async () => {
    const matching = [];
    for await (const e of inspector.webhookEndpoints.list({ limit: 100 })) if (e.url === webhookUrl && e.livemode === live) matching.push(e);
    const valid = matching.some(e => e.status === 'enabled' && events.every(t => e.enabled_events.includes(t) || e.enabled_events.includes('*')));
    requireCheck(valid, 'No enabled matching webhook endpoint subscribes to every required Aerie event.');
    return webhookUrl;
  });
  const secretOk = await check('webhook secret', () => {
    requireCheck(/^whsec_[a-zA-Z0-9_]+$/.test(signingSecret || ''), 'Mode-specific webhook signing secret is unavailable.');
    return 'Key Vault secret present. A genuine signed Stripe delivery confirms the endpoint/secret pairing.';
  });
  await check('Stripe Tax settings', async () => {
    const tax = await inspector.tax.settings.retrieve();
    requireCheck(tax.livemode === live && tax.status === 'active', 'Stripe Tax is pending or belongs to the wrong mode.');
    return 'Active.';
  });
  await check('active tax registrations', async () => {
    const observed = new Set();
    for await (const r of inspector.tax.registrations.list({ status: 'active', limit: 100 })) {
      requireCheck(r.livemode === live && r.status === 'active', 'Unexpected registration mode or status.');
      observed.add(registrationLocation(r));
    }
    const locations = [...observed].sort();
    requireCheck(Array.isArray(opts.registrations), 'Owner confirmation needed. Active Stripe registration locations: ' + (locations.join(', ') || 'none') + '.');
    const expected = [...new Set(opts.registrations)].sort();
    requireCheck(expected.join(',') === locations.join(','), 'Owner-confirmed and active Stripe registration locations differ. Stripe: ' + (locations.join(', ') || 'none') + '.');
    return locations.length ? locations : 'Owner confirmed none; no active registrations.';
  });
  if (opts.smoke) {
    if (priceOk && secretOk && (!live || result().ready)) {
      await check('unopened Checkout', () => smokeCheckout(runtime, opts, selected, cents, signingSecret));
    } else checks.push({ name: 'unopened Checkout', status: 'skipped', detail: 'Prerequisites incomplete; no session created.' });
  }
  return result();
}

function azure(args) {
  try {
    return execFileSync('az', [...args, '--subscription', 'Azure subscription 1', '--only-show-errors', '--output', 'tsv'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000
    }).trim();
  } catch {
    throw new CheckError('Azure read failed for ' + (args.includes('--vault-name') ? args[args.indexOf('--name') + 1] : 'Aerie Function settings') + '. Check the named resource and identity permissions.');
  }
}

async function main() {
  const opts = options(process.argv.slice(2));
  const prefix = 'stripe-' + (opts.mode === 'test' ? 'sandbox' : 'live') + '-';
  const vault = name => azure(['keyvault', 'secret', 'show', '--vault-name', 'kv-playaerie-prod', '--name', prefix + name, '--query', 'value']);
  function client(secret) {
    requireCheck(new RegExp('^(sk|rk)_' + opts.mode + '_').test(secret), 'Stripe credential does not match the chosen mode.');
    return new Stripe(secret, { timeout: 12000, maxNetworkRetries: 1 });
  }
  const runtime = client(vault('api-key'));
  const inspector = opts.audit ? client(vault('preflight-read-key')) : runtime;
  let signingSecret;
  try { signingSecret = vault('webhook-secret'); } catch { /* The independent checks can still run. */ }
  const values = azure(['functionapp', 'config', 'appsettings', 'list', '-g', 'rg-aerie-prod', '-n', 'func-playaerie-prod',
    '--query', "[?name=='AERIE_STRIPE_MODE'||name=='AERIE_STRIPE_PRICE_ID'||name=='AERIE_TICKET_PRICE_CENTS'].[name,value]"]);
  const config = Object.fromEntries(values.split('\n').filter(Boolean).map(row => row.split('\t')));
  const report = await preflight(opts, { runtime, inspector, signingSecret,
    priceId: config.AERIE_STRIPE_MODE === opts.mode ? config.AERIE_STRIPE_PRICE_ID : undefined,
    configuredCents: config.AERIE_TICKET_PRICE_CENTS ? Number(config.AERIE_TICKET_PRICE_CENTS) : undefined
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ready) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error(e instanceof CheckError ? e.message : 'Preflight failed; check the arguments and provider access.'); process.exitCode = 1; });
}
