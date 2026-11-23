import { EmailClient } from '@azure/communication-email';
import { DefaultAzureCredential } from '@azure/identity';
import { BlobSASPermissions, BlobServiceClient, SASProtocol, generateBlobSASQueryParameters } from '@azure/storage-blob';
import Stripe from 'stripe';
import { tableStore } from './store.mjs';

export const freeWorld = 'winnipesaukee';
export const allWorlds = [
  'alaska', 'canyon', 'swiss', freeWorld, 'surry', 'dixville', 'labrador',
  'moosehead', 'yosemite', 'crater', 'lofoten', 'acadia', 'yellowstone'
];
const defaultRewards = ['moosehead', 'canyon', 'labrador', 'alaska', 'acadia'];

function configuredEmail(value = '') {
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@,<>]+@[^\s@,.<>]+(?:\.[^\s@,.<>]+)+$/.test(email) ? email : '';
}

export function configuration(env = process.env) {
  const mode = env.AERIE_STRIPE_MODE || 'test';
  const cents = env.AERIE_TICKET_PRICE_CENTS || '';
  if (cents && (!/^[1-9]\d{0,7}$/.test(cents) || Number(cents) < 50)) {
    throw new Error('AERIE_TICKET_PRICE_CENTS must be a whole USD amount in cents between 50 and 99999999.');
  }
  if (!['test', 'live'].includes(mode)) throw new Error('AERIE_STRIPE_MODE must be test or live.');
  const configured = env.AERIE_REWARD_WORLDS?.split(',').map(value => value.trim()) || defaultRewards;
  // Preserve all three previously promised worlds when upgrading an existing deployment.
  const rewards = configured.length === 3 && new Set(configured).size === 3
    ? [...configured, ...defaultRewards.filter(world => !configured.includes(world))].slice(0, 5)
    : configured;
  if (rewards.length !== 5 || new Set(rewards).size !== 5 ||
      rewards.some(world => world === freeWorld || !allWorlds.includes(world))) {
    throw new Error('AERIE_REWARD_WORLDS must identify five distinct paid worlds.');
  }
  const site = env.AERIE_SITE_URL ? new URL(env.AERIE_SITE_URL) : null;
  if (site && site.protocol !== 'https:' && !(mode === 'test' && site.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(site.hostname))) {
    throw new Error('AERIE_SITE_URL must use HTTPS outside loopback testing.');
  }
  const origins = new Set(site ? [site.origin] : []);
  for (const origin of (env.AERIE_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean)) {
    if (new URL(origin).origin !== origin) throw new Error('AERIE_ALLOWED_ORIGINS must contain exact origins.');
    origins.add(origin);
  }
  const stripeKey = env.AERIE_STRIPE_SECRET_KEY || '';
  if (stripeKey && !new RegExp(`^(sk|rk)_${mode}_`).test(stripeKey)) {
    throw new Error('Stripe API key and mode do not match.');
  }
  const secret = env.AERIE_IDENTITY_SECRET || '';
  if (secret && Buffer.byteLength(secret) < 32) throw new Error('AERIE_IDENTITY_SECRET needs at least 32 bytes.');
  const tableName = env.AERIE_TABLE_NAME || 'AerieCommerce';
  const storage = env.AERIE_BLOB_URL || '';
  const container = env.AERIE_PRIVATE_CONTAINER || '';
  const account = storage ? new URL(storage).hostname.split('.')[0] : '';
  const sandboxPurchaseEmail = configuredEmail(env.AERIE_SANDBOX_PURCHASE_EMAIL_RECIPIENT);
  const testPayer = configuredEmail(env.AERIE_SANDBOX_PURCHASE_TEST_PAYER);
  return {
    mode, live: mode === 'live', site: site?.origin || '', origins, rewards, secret,
    stripeKey, ticketPriceCents: cents ? Number(cents) : null, priceId: env.AERIE_STRIPE_PRICE_ID || '', webhookSecret: env.AERIE_STRIPE_WEBHOOK_SECRET || '',
    tableName, tableUrl: env.AERIE_TABLE_URL || '', storage, account, container,
    emailUrl: env.AERIE_EMAIL_ENDPOINT || '', sender: env.AERIE_EMAIL_SENDER || '',
    signup: env.AERIE_SIGNUP_ENABLED === 'true', checkout: env.AERIE_CHECKOUT_ENABLED === 'true',
    claims: env.AERIE_SHARE_CLAIMS_ENABLED === 'true',
    monitoring: env.AERIE_MONITORING_ENABLED === 'true',
    purchaseHelp: env.AERIE_PURCHASE_HELP_ENABLED === 'true',
    purchaseEmails: env.AERIE_PURCHASE_EMAILS_ENABLED === 'true',
    sandboxPurchaseEmail,
    sandboxPurchaseTestPayer: /@example\.(?:com|net|org)$/.test(testPayer) ? testPayer : ''
  };
}

function emailOperations(endpoint, credential) {
  const host = new URL(endpoint).origin;
  const retryAfter = response => (Number(response?.headers.get('retry-after')) || 0) * 1000;
  async function request(path, options = {}) {
    try {
      const signal = AbortSignal.timeout(12_000);
      const { token } = await credential.getToken('https://communication.azure.com//.default', { abortSignal: signal });
      return await fetch(`${host}${path}?api-version=2025-09-01`, {
        ...options, signal, redirect: 'error',
        headers: { Authorization: `Bearer ${token}`, ...options.headers }
      });
    } catch {
      return null;
    }
  }
  return {
    async status(operationId) {
      const response = await request(`/emails/operations/${operationId}`);
      if (response?.status === 404) return { state: 'missing' };
      if (!response?.ok) return { state: 'unknown', retryAfter: retryAfter(response) };
      const { status } = await response.json();
      if (status === 'Succeeded') return { state: 'accepted' };
      if (status === 'Failed' || status === 'Canceled') return { state: 'failed' };
      return { state: 'pending', retryAfter: retryAfter(response) };
    },
    async submit(message, operationId, firstSentAt) {
      const response = await request('/emails:send', {
        method: 'POST', body: JSON.stringify(message),
        headers: {
          'Content-Type': 'application/json',
          'Operation-Id': operationId,
          'Repeatability-Request-ID': operationId,
          'Repeatability-First-Sent': new Date(firstSentAt).toUTCString()
        }
      });
      const status = response?.status || 0;
      const wait = retryAfter(response);
      if (status === 202 || status === 409) return { state: 'pending', retryAfter: wait };
      if (status === 429) return { state: 'throttled', retryAfter: wait };
      return { state: status >= 400 && status < 500 ? 'failed' : 'unknown', retryAfter: wait };
    }
  };
}

export function configuredServices(config) {
  const credential = new DefaultAzureCredential();
  const store = config.tableUrl && config.secret
    ? tableStore(config.tableUrl, config.tableName, credential, `aerie-${config.mode}`)
    : null;
  const preview = store && config.live
    ? tableStore(config.tableUrl, config.tableName, credential, 'aerie-test')
    : null;
  const stripe = config.stripeKey ? new Stripe(config.stripeKey) : null;
  const email = config.emailUrl && config.sender ? new EmailClient(config.emailUrl, credential) : null;
  const blobs = config.storage && config.container ? new BlobServiceClient(config.storage, credential) : null;
  let delegation;
  let keyExpires = 0;
  return {
    store, stripe,
    hasPreviewReward: preview && (async uid => (await preview.get(`account:${uid}`))?.reward === true),
    previewCheckoutId: preview && (async order => {
      const id = (await preview.get(`pending:${order}`))?.checkoutId;
      return /^cs_test_[\w]+$/.test(id || '') ? id : null;
    }),
    purchaseEmailOperations: email && config.purchaseEmails ? emailOperations(config.emailUrl, credential) : null,
    sendEmail: email && (async (address, subject, { plainText, html }) => {
      const send = await email.beginSend({
        senderAddress: config.sender,
        recipients: { to: [{ address }] },
        content: { subject, plainText, html }
      });
      const result = await send.pollUntilDone();
      if (result.status !== 'Succeeded') throw new Error('The email provider did not accept the message.');
    }),
    assetUrl: blobs && (async (world, path) => {
      const now = Date.now();
      if (keyExpires < now + 20 * 60_000) {
        const expiry = now + 60 * 60_000;
        delegation = await blobs.getUserDelegationKey(new Date(now - 5 * 60_000), new Date(expiry));
        keyExpires = expiry;
      }
      const blobName = `${world}/${path}`;
      const signature = generateBlobSASQueryParameters({
        containerName: config.container, blobName,
        permissions: BlobSASPermissions.parse('r'), protocol: SASProtocol.Https,
        startsOn: new Date(now - 60_000), expiresOn: new Date(now + 15 * 60_000)
      }, delegation, config.account).toString();
      return `${blobs.getContainerClient(config.container).getBlobClient(blobName).url}?${signature}`;
    })
  };
}
