const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = readFileSync(join(__dirname, '../game/access-pass.js'), 'utf8');
const free = 'winnipesaukee';
const key = 'aerie:firstFlightOffer:v1';

async function player(worlds, storage = new Map()) {
  const win = new EventTarget(), doc = new EventTarget();
  const app = { dataset: { mode: 'flight' } };
  const picker = { value: free };
  const fly = Object.assign(new EventTarget(), { after() {}, lastChild: {} });
  Object.assign(doc, {
    querySelector: () => null, querySelectorAll: () => [], createElement: () => ({}),
    getElementById: id => ({ fly, app, worldPicker: picker })[id]
  });
  vm.runInNewContext(source, {
    document: doc, window: win, URL, URLSearchParams, AbortSignal,
    location: new URL('https://aerie.test/?access=free#world=winnipesaukee'),
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v) },
    fetch: async () => ({ ok: true, json: async () => ({ fullAccess: worlds.length === 13, worlds }) })
  });
  doc.dispatchEvent(new Event('DOMContentLoaded'));
  await new Promise(resolve => setImmediate(resolve));
  return { tick: win.aerieFirstFlightOffer, leave: () => win.dispatchEvent(new Event('pagehide')) };
}

test('free flight accumulates exactly five active minutes across visits and displays the offer once', async () => {
  const storage = new Map();
  const first = await player([free], storage);
  for (let t = 0; t < 147; t++) assert.equal(first.tick(1), false);
  first.leave();
  assert.equal(Number(storage.get(key)), 147);
  const next = await player([free], storage);
  for (let t = 147; t < 299; t++) assert.equal(next.tick(1), false);
  assert.equal(next.tick(.75), false);
  assert.equal(next.tick(.25), true);
  assert.equal(next.tick(1), false);
  assert.equal((await player([free], storage)).tick(1), false);
});

test('a suspended frame cannot skip the countdown and reward holders are exempt', async () => {
  const guest = await player([free]);
  assert.equal(guest.tick(600), false);
  for (const worlds of [[free,'alaska'], Array(13).fill(free)]) {
    const storage = new Map([[key, '299']]);
    const owner = await player(worlds, storage);
    assert.equal(owner.tick(1), false);
    assert.equal(storage.get(key), '299');
  }
});
