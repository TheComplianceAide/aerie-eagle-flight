import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createCommerce } from '../src/commerce.mjs';
import { configuration } from '../src/settings.mjs';

const site = 'https://aerie.example';
const config = configuration({
  AERIE_SITE_URL: site,
  AERIE_IDENTITY_SECRET: 'fictional-test-identity-key-no-real-credentials',
  AERIE_PURCHASE_HELP_ENABLED: 'true'
});
const purchaseHelp = (extra = {}) => ({
  issue: 'gift', email: 'buyer@example.test', message: 'Synthetic request about the gift copy.',
  submissionId: randomUUID(), ...extra
});

function fixture({ enabled = config.purchaseHelp, storageError = null } = {}) {
  const rows = new Map();
  const notices = [];
  const errors = [];
  let time = Date.now();
  let version = 0;
  const store = {
    async get(key) { return structuredClone(rows.get(key) ?? null); },
    async transaction(actions) {
      if (storageError) throw storageError;
      for (const [action, row] of actions) {
        const stored = rows.get(row.rowKey);
        if (action === 'create' && stored) throw Object.assign(new Error('duplicate'), { statusCode: 409 });
        if (action === 'replace' && stored?.etag !== row.etag) throw Object.assign(new Error('stale'), { statusCode: 412 });
      }
      for (const [, row] of actions) rows.set(row.rowKey, { ...row, etag: String(++version) });
    }
  };
  const app = createCommerce({ ...config, purchaseHelp: enabled }, { store, now: () => time });
  const call = (body, { origin = site, method = 'POST', type = 'application/json', length } = {}) => {
    const headers = { 'Content-Type': type };
    if (origin !== null) headers.origin = origin;
    if (length !== undefined) headers['Content-Length'] = String(length);
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    return app.handle('purchase-help', new Request(`${site}/api/aerie/purchase-help`, { method, headers, body: payload }), {
      warn: value => notices.push(value), error: value => errors.push(value)
    });
  };
  return { call, rows, notices, errors, advance: ms => { time += ms; } };
}

test('purchase help stores a private case and emits a receipt-only notification after commit', async () => {
  const { call, rows, notices, errors } = fixture();
  const input = purchaseHelp({ email: ' Buyer@EXAMPLE.TEST ', message: '  Synthetic case description for QA.  ' });
  const result = await call(input);
  assert.equal(result.status, 201);
  assert.equal(result.headers['Cache-Control'], 'private, no-store');
  assert.deepEqual(Object.keys(result.jsonBody), ['caseId']);
  const { caseId } = result.jsonBody;
  assert.match(caseId, /^AER-[A-Za-z0-9_-]{22}$/);
  const stored = rows.get(`purchase-help:${caseId}`);
  assert.equal(stored.email, 'buyer@example.test');
  assert.equal(stored.issue, 'gift');
  assert.equal(stored.message, input.message.trim());
  assert.equal(stored.status, 'open');
  assert.ok(Number.isSafeInteger(stored.submittedAt));
  assert.deepEqual(notices, [`aerie_purchase_help ${caseId}`]);
  assert.deepEqual(errors, []);
  assert.equal((await call(undefined, { method: 'GET' })).status, 405);
  assert.equal((await call(undefined, { method: 'OPTIONS' })).status, 204);
});

test('simultaneous retries reuse the same receipt without another stored case or notice', async () => {
  const { call, rows, notices } = fixture();
  const input = purchaseHelp();
  const results = await Promise.all([call(input), call(input), call(input)]);
  assert.equal(results.filter(r => r.status === 201).length, 1);
  assert.ok(results.every(r => r.jsonBody.caseId === results[0].jsonBody.caseId));
  assert.equal([...rows.keys()].filter(key => key.startsWith('purchase-help:')).length, 1);
  assert.equal(notices.length, 1);
});

test('purchase help rejects untrusted, oversized, unrecognized and card-number submissions', async () => {
  const { call, rows, notices } = fixture();
  const input = purchaseHelp();
  assert.equal((await call(input, { origin: 'https://untrusted.example' })).status, 403);
  assert.equal((await call(input, { origin: null })).status, 403);
  assert.equal((await call(input, { type: 'text/plain' })).status, 415);
  assert.equal((await call(input, { length: 4097 })).status, 413);
  assert.equal((await call(purchaseHelp({ message: '湖'.repeat(1400) }))).status, 413);
  assert.equal((await call('{')).status, 400);
  assert.equal((await call(purchaseHelp({ issue: 'unrecognized' }))).status, 400);
  assert.equal((await call(purchaseHelp({ email: 'bad email' }))).status, 400);
  assert.equal((await call(purchaseHelp({ submissionId: 'invalid' }))).status, 400);
  assert.equal((await call(purchaseHelp({ message: 'short' }))).status, 400);
  assert.equal((await call(purchaseHelp({ message: 'a'.repeat(801) }))).status, 400);
  assert.equal((await call(purchaseHelp({ message: 'synthetic card 4242-4242 4242 4242' }))).status, 400);
  assert.equal((await call(purchaseHelp({ cardNumber: 'anything' }))).status, 400);
  assert.equal(rows.size, 0);
  assert.deepEqual(notices, []);
});

test('private storage limits repeated email and global bursts across requests', async () => {
  const { call, advance, notices } = fixture();
  assert.equal((await call(purchaseHelp())).status, 201);
  const retry = await call(purchaseHelp({ email: 'BUYER@example.test' }));
  assert.equal(retry.status, 429);
  assert.equal(retry.headers['Retry-After'], '60');
  for (let index = 0; index < 19; index++) {
    assert.equal((await call(purchaseHelp({ email: `buyer${index}@example.test` }))).status, 201);
  }
  assert.equal((await call(purchaseHelp({ email: 'overflow@example.test' }))).status, 429);
  assert.equal(notices.length, 20);
  advance(60_000);
  assert.equal((await call(purchaseHelp())).status, 201);
});

test('disabled or failed intake cannot claim success or expose storage diagnostics', async () => {
  const disabled = fixture({ enabled: false });
  assert.equal((await disabled.call(purchaseHelp())).status, 503);
  assert.equal(disabled.rows.size, 0);
  const failed = fixture({ storageError: new Error('synthetic private text example@example.test') });
  assert.equal((await failed.call(purchaseHelp())).status, 503);
  assert.equal(failed.rows.size, 0);
  assert.deepEqual(failed.notices, []);
  assert.deepEqual(failed.errors, ['Aerie purchase-help failed (Error).']);
});
