const minute = 60_000;
const requestsPerMinute = 20;
const queueKey = 'purchase-help-limit:queue';
const issues = new Set(['charge', 'access', 'gift', 'other']);
const submissionPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const longNumber = /(?:\d[\s-]*){12}\d/;
const controlCharacters = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function rateLimited(retryMs) {
  return {
    status: 429,
    headers: { 'Retry-After': String(Math.ceil(retryMs / 1000)) },
    jsonBody: { error: 'Please wait a moment before sending another request.' }
  };
}

function save(rowKey, previous, fields) {
  return [previous ? 'replace' : 'create', { ...previous, ...fields, rowKey }];
}

export function createPurchaseHelp({ store, now, hash }) {
  return async function submit({ issue, email, message: rawMessage, submissionId, ...extra }, context) {
    const message = typeof rawMessage === 'string' ? rawMessage.trim() : '';
    if (Object.keys(extra).length || !issues.has(issue) || typeof submissionId !== 'string' ||
        !submissionPattern.test(submissionId) || message.length < 10 || message.length > 800 ||
        controlCharacters.test(message)) {
      return { status: 400, jsonBody: { error: 'Choose an issue and write a message between 10 and 800 characters.' } };
    }
    if (longNumber.test(message)) {
      return { status: 400, jsonBody: { error: 'Remove any card or other long account numbers from your message.' } };
    }

    // A retry from the same form returns its receipt without creating another case or alert.
    const caseId = `AER-${hash('purchase-help-case', JSON.stringify([submissionId, email, issue, message])).slice(0, 22)}`;
    const rowKey = `purchase-help:${caseId}`;
    const receipt = { jsonBody: { caseId } };
    const emailKey = `purchase-help-limit:email:${hash('purchase-help-email', email)}`;
    for (let attempt = 0; attempt < 5; attempt++) {
      if (await store.get(rowKey)) return receipt;
      const time = now();
      const [emailLimit, queue] = await Promise.all([store.get(emailKey), store.get(queueKey)]);
      const windowEnd = queue?.windowEnd > time ? queue.windowEnd : time + minute;
      const count = queue?.windowEnd > time ? queue.count : 0;
      const nextSend = Math.max(emailLimit?.nextSend || 0, count >= requestsPerMinute ? windowEnd : 0);
      if (nextSend > time) return await store.get(rowKey) ? receipt : rateLimited(nextSend - time);
      try {
        await store.transaction([
          ['create', { rowKey, issue, email, message, status: 'open', submittedAt: time }],
          save(emailKey, emailLimit, { nextSend: time + minute }),
          save(queueKey, queue, { windowEnd, count: count + 1 })
        ]);
      } catch (error) {
        if (error.statusCode === 409 || error.statusCode === 412) continue;
        // Avoid passing storage diagnostics or buyer text into telemetry.
        throw new Error('Purchase help storage unavailable.');
      }
      context?.warn(`aerie_purchase_help ${caseId}`);
      return { ...receipt, status: 201 };
    }
    return rateLimited(1000);
  };
}
