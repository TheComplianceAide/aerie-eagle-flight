const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const source = readFileSync(join(__dirname, '../game/join/return/confirm.js'), 'utf8');
const apex = 'https://playaerie.com';
const sessionId = 'cs_live_AerieExample123';

async function visit({ hash = '', initialState, origin = apex, responses = [] }) {
  const requests = [];
  const status = {};
  const retry = { hidden: true, addEventListener(name, listener) { this[name] = listener; } };
  const location = { hash, origin, pathname: '/join/return/', replace(url) { this.destination = url; } };
  const history = { state: initialState, replaceState(value, title, path) {
    assert.equal(path, location.pathname);
    this.state = value;
    location.hash = '';
  } };
  vm.runInNewContext(source, {
    location, history, URLSearchParams, AbortController,
    document: { getElementById: id => ({status, retry})[id] },
    setTimeout(callback, ms) { if (ms !== 8000) queueMicrotask(callback); }, clearTimeout() {},
    async fetch(path, options) {
      assert.equal(path, '/api/aerie/checkout/confirm');
      assert.equal(options.method, 'POST');
      assert.equal(options.credentials, 'same-origin');
      assert.equal(options.redirect, 'error');
      requests.push(JSON.parse(options.body));
      const result = responses.shift();
      assert.ok(result, 'Unexpected confirmation attempt');
      return typeof result === 'string' ? { ok: true, json: () => ({state: result}) } : { ok: false, status: result };
    }
  });
  await new Promise(resolve => setImmediate(resolve));
  return { history, location, requests, retry, status };
}

test('a delayed payment link waits for confirmation and keeps the session for reload', async () => {
  const page = await visit({hash: '#session=' + sessionId, responses: ['pending', 'pending', 'success']});
  assert.deepEqual(page.requests, Array(3).fill({sessionId}));
  assert.equal(page.location.hash, '');
  assert.equal(page.history.state.sessionId, sessionId);
  assert.equal(page.location.destination, '../?checkout=success');
  const reloaded = await visit({initialState: page.history.state, responses: ['success']});
  assert.deepEqual(reloaded.requests, [{sessionId}]);
});

test('an order from www returns to the host that owns its checkout cookie', async () => {
  const page = await visit({hash: '#session=' + sessionId, responses: ['return-to-www']});
  assert.equal(page.location.destination, 'https://www.playaerie.com/join/return/#session=' + sessionId);
  const other = await visit({origin: 'https://www.playaerie.com', hash: '#session=' + sessionId, responses: ['restore']});
  assert.equal(other.location.destination, '../#restore-ticket');
});

test('a pending or interrupted Payment Link offers retry before a buyer pays again', async () => {
  const responses = Array(6).fill('pending');
  const page = await visit({hash: '#session=' + sessionId, responses});
  assert.equal(page.requests.length, 6);
  assert.equal(page.retry.hidden, false);
  assert.match(page.status.textContent, /pending/i);
  responses.push(503, 'success');
  await page.retry.click();
  assert.equal(page.location.destination, '../?checkout=success');
});

test('legacy checkout still confirms its order and supports expired sandbox purchases', async () => {
  const order = 'f'.repeat(64);
  for (const state of ['success', 'preview-ended']) {
    const page = await visit({hash: '#order=' + order, responses: [state]});
    assert.deepEqual(page.requests, [{order}]);
    assert.equal(page.location.destination, '../?checkout=' + state);
  }
});

test('malformed or ambiguous references are removed and offer email recovery', async () => {
  for (const hash of ['#session=unexpected', '#session=cs_live_%2Fvalue', '#order=' + '1'.repeat(64) + '&session=' + sessionId]) {
    const page = await visit({hash});
    assert.deepEqual(page.requests, []);
    assert.equal(page.location.hash, '');
    assert.match(page.status.textContent, /restore/i);
  }
});
