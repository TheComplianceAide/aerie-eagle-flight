import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import test from 'node:test';
import { createCommerce } from '../src/commerce.mjs';
import { configuration } from '../src/settings.mjs';

const site = 'https://aerie.example';
const secret = 'fixture-identity-secret-for-analytics-tests-only';
const start = Date.parse('2026-11-23T23:59:50Z');
const payload = {
  visitor: 'ac1f4e3b-d26f-48fc-8fce-1475c7b4b700',
  visit: '2db6b6c0-8eea-4f0f-ba56-9c38f163ec2a',
  stage: 'landing', source: 'linkedin', fromLanding: false
};
const hash = (purpose, value) => createHmac('sha256', secret).update(`${purpose}:${value}`).digest('base64url');

function fixture({ enabled = true } = {}) {
  let now = start;
  let writes = 0;
  const rows = new Map();
  const cutoffs = [];
  const store = {
    async merge(row) {
      writes += 1;
      const key = `${row.partitionKey}:${row.rowKey}`;
      rows.set(key, { ...rows.get(key), ...row });
    },
    async prune(cutoff) { cutoffs.push(cutoff); }
  };
  const config = configuration({ AERIE_SITE_URL: site, AERIE_IDENTITY_SECRET: secret, AERIE_TRAFFIC_ENABLED: String(enabled) });
  const app = createCommerce(config, { trafficStore: store, now: () => now });
  const send = (action, body, headers = {}) => app.handle(action, new Request(`${site}/api/aerie/${action}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Origin: site, 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : body === undefined ? undefined : JSON.stringify(body)
  }));
  return { app, send, store, rows, cutoffs, advance: ms => { now += ms; }, writes: () => writes };
}

test('traffic keeps pseudonymous attribution and merges delayed, duplicate and crossing-midnight stages', async () => {
  const f = fixture();
  assert.equal((await f.send('config')).jsonBody.traffic, true);
  const flight = { ...payload, stage: 'flight', fromLanding: true };
  const results = await Promise.all([f.send('traffic', flight), f.send('traffic', flight), f.send('traffic', payload)]);
  assert.deepEqual(results.map(result => result.status), [204, 204, 204]);
  assert.equal(f.writes(), 2);
  const rowKey = hash('analytics-visit-v1', `${payload.visitor}:${payload.visit}`);
  const visitorId = hash('analytics-visitor-v1', payload.visitor);
  assert.deepEqual([...f.rows.values()], [{
    partitionKey: '2026-11-23', rowKey, visitorId, source: 'linkedin', landed: true, flew: true, flightFromLanding: true
  }]);
  await f.send('traffic', { ...payload, stage: 'checkout', fromLanding: true });
  await f.send('traffic', { ...payload, stage: 'checkout', fromLanding: false });
  assert.equal(f.rows.get(`2026-11-23:${rowKey}`).checkoutFromLanding, true);
  f.advance(15_000);
  assert.equal((await f.send('traffic', { ...payload, stage: 'checkout', fromLanding: true })).status, 204);
  assert.deepEqual(f.rows.get(`2026-11-24:${rowKey}`), {
    partitionKey: '2026-11-24', rowKey, visitorId, source: 'linkedin', landed: true, checkout: true, checkoutFromLanding: true
  });
});

test('traffic rejects cross-origin, abusive or private payloads and honors privacy opt-outs', async () => {
  const f = fixture();
  assert.equal((await f.send('traffic', payload, { Origin: 'https://other.example' })).status, 403);
  assert.equal((await f.send('traffic', payload, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await f.send('traffic', payload, { 'Sec-GPC': '1' })).status, 204);
  assert.equal((await f.send('traffic', payload, { DNT: '1' })).status, 204);
  assert.equal((await f.send('traffic', payload, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await f.send('traffic', ' '.repeat(513))).status, 413);
  assert.equal((await f.send('traffic', { ...payload, source: 'https://example.test/private' })).status, 400);
  assert.equal((await f.send('traffic', { ...payload, email: 'fixture@example.test' })).status, 400);
  assert.equal((await f.send('traffic', { ...payload, visit: 'session-token' })).status, 400);
  assert.equal(f.rows.size, 0);
  const off = fixture({ enabled: false });
  assert.equal((await off.send('config')).jsonBody.traffic, false);
  assert.equal((await off.send('traffic', payload)).status, 503);
  await off.app.traffic.retain();
  assert.deepEqual(off.cutoffs, []);
});

test('traffic isolates temporary storage failures and bounds accepted writes within a minute', async () => {
  const f = fixture();
  const merge = f.store.merge;
  f.store.merge = async () => { throw new Error('private resource details'); };
  const unavailable = await f.send('traffic', payload);
  assert.deepEqual(unavailable.jsonBody, { error: 'Traffic collection is temporarily unavailable.' });
  assert.equal(unavailable.status, 503);
  assert.deepEqual((await f.send('status')).jsonBody.worlds, ['winnipesaukee']);
  f.store.merge = merge;
  assert.equal((await f.send('traffic', payload)).status, 204);
  const distinct = await Promise.all(Array.from({ length: 1198 }, () => f.send('traffic', { ...payload, visit: randomUUID() })));
  assert.ok(distinct.every(result => result.status === 204));
  assert.equal((await f.send('traffic', { ...payload, visit: randomUUID() })).status, 429);
  assert.equal((await f.send('traffic', payload)).status, 204);
  f.advance(60_000);
  assert.equal((await f.send('traffic', { ...payload, visit: randomUUID() })).status, 204);
  await f.app.traffic.retain();
  assert.deepEqual(f.cutoffs, ['2026-08-27']);
});
