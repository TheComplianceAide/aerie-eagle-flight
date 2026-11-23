import { randomUUID } from 'node:crypto';

const minute = 60_000;
const replayWindow = 4 * minute;
const maxAge = 24 * 60 * minute;
const isConflict = error => [409, 412].includes(error.statusCode);

export function stripeReceiptUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return '';
  try {
    const url = new URL(value);
    return url.origin === 'https://pay.stripe.com' && url.pathname.startsWith('/receipts/') &&
      !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}

const htmlAttribute = value => value.replace(/[&"<>]/g, char => ({
  '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;'
})[char]);

function confirmation(config, purchase, recipient, site) {
  const subject = config.live ? 'Aerie purchase confirmation' : '[Aerie sandbox] Purchase confirmation';
  const heading = 'Your Aerie Founder Pass';
  const total = `$${(purchase.amountTotal / 100).toFixed(2)} USD`;
  const amount = `Total paid including applicable tax was ${total}.`;
  const restore = 'To restore access, open Aerie and use the email you entered at checkout. Your one gift link is available under your pass.';
  const notice = config.live ? '' : 'This Stripe sandbox confirmation records a simulated payment.';
  const join = `${site}/join/`;
  const help = `${join}help/`;
  const receipt = stripeReceiptUrl(purchase.receiptUrl);
  return {
    senderAddress: config.sender,
    recipients: { to: [{ address: recipient }] },
    disableUserEngagementTracking: true,
    content: {
      subject,
      plainText: [heading, notice, amount, restore, `Open Aerie at ${join}`,
        receipt && `View your Stripe receipt at ${receipt}`, `Purchase help at ${help}`].filter(Boolean).join('\n\n'),
      html: `<h1>${heading}</h1>${notice ? `<p>${notice}</p>` : ''}<p>${amount}</p><p>${restore}</p>` +
        `<p><a href="${join}">Open Aerie</a></p>` +
        (receipt ? `<p><a href="${htmlAttribute(receipt)}">View your Stripe receipt</a></p>` : '') +
        `<p><a href="${help}">Purchase help</a></p>`
    }
  };
}

export function createPurchaseMail(config, { store, operations, now }) {
  const enabled = Boolean(config.purchaseEmails && config.site && config.sender && store && operations &&
    (config.live || (config.sandboxPurchaseEmail && config.sandboxPurchaseTestPayer)));

  function enqueue(purchase, buyerEmail, site) {
    if (!enabled || purchase.currency !== 'usd' || !Number.isSafeInteger(purchase.amountTotal) || purchase.amountTotal < 0) return null;
    if (!config.live && buyerEmail !== config.sandboxPurchaseTestPayer) return null;
    const recipient = config.live ? buyerEmail : config.sandboxPurchaseEmail;
    return {
      rowKey: `purchase-mail:${purchase.checkoutId}`,
      paymentIntent: purchase.paymentIntent,
      message: JSON.stringify(confirmation(config, purchase, recipient, site)),
      ...(!config.live && { sandboxPayer: buyerEmail }),
      queuedAt: now(),
      nextAt: now(),
      state: 'queued',
      rejectedSends: 0
    };
  }

  function update(job, fields) {
    return store.transaction([['replace', { ...job, ...fields }]]);
  }

  async function finish(job, state, context) {
    await store.transaction([['replace', {
      rowKey: job.rowKey, etag: job.etag, queuedAt: job.queuedAt,
      operationId: job.operationId, state
    }]]);
    if (state === 'review') context?.warn('aerie_purchase_confirmation_needs_review');
  }

  async function process(entry, context) {
    const time = now();
    const hadOperation = Boolean(entry.operationId);
    const operationId = entry.operationId || randomUUID();
    const leaseId = randomUUID();
    try {
      await update(entry, { operationId, firstSentAt: entry.firstSentAt || time, leaseId, nextAt: time + 2 * minute });
    } catch (error) {
      if (isConflict(error)) return;
      throw error;
    }
    const job = await store.get(entry.rowKey);
    if (job?.leaseId !== leaseId) return;
    const message = JSON.parse(job.message);
    if (!config.live && (message.recipients.to[0].address !== config.sandboxPurchaseEmail ||
        job.sandboxPayer !== config.sandboxPurchaseTestPayer)) {
      await finish(job, 'canceled', context);
      return;
    }
    if (time - job.queuedAt >= maxAge) {
      await finish(job, 'review', context);
      return;
    }

    if (hadOperation) {
      const result = await operations.status(operationId);
      if (result.state === 'accepted' || result.state === 'failed') {
        await finish(job, result.state === 'accepted' ? 'accepted' : 'review', context);
        return;
      }
      if (result.state !== 'missing' || job.state === 'submitted') {
        await update(job, { nextAt: time + Math.max(minute, result.retryAfter || 0) });
        return;
      }
      if (time - job.firstSentAt >= replayWindow) {
        await finish(job, 'review', context);
        return;
      }
    }
    const payment = await store.get(`payment:${job.paymentIntent}`);
    if (!payment || payment.refunded || payment.disputed) {
      await finish(job, 'canceled', context);
      return;
    }
    const result = await operations.submit(message, operationId, job.firstSentAt);
    if (result.state === 'failed') {
      await finish(job, 'review', context);
      return;
    }
    if (result.state === 'throttled' && !hadOperation) {
      const rejectedSends = job.rejectedSends + 1;
      await update(job, { operationId: '', firstSentAt: 0, rejectedSends,
        nextAt: time + Math.max(result.retryAfter || 0, Math.min(10, 2 ** rejectedSends) * minute) });
      return;
    }
    await update(job, { state: result.state === 'pending' ? 'submitted' : job.state,
      nextAt: time + Math.max(minute, result.retryAfter || 0) });
  }

  async function deliver(context) {
    const pending = [];
    for await (const job of store.pendingPurchaseMail(now())) {
      pending.push(job);
      if (pending.length === 8) break;
    }
    const results = await Promise.allSettled(pending.map(job => process(job, context)));
    for (const result of results) {
      if (result.status === 'rejected') context?.warn('aerie_purchase_confirmation_retry');
    }
  }

  return { enabled, enqueue, deliver };
}
