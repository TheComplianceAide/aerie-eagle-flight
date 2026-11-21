// Run with node tools/check_call_variety.cjs. No audio device is opened.
//
// An animal that calls again must not repeat itself note for note. The spatial
// engine finds where the calls fall in a recording and plays a different run
// of them each time. This checks that the cuts fall in the quiet between calls,
// that successive excerpts differ, that a recording with no gaps is left whole,
// and that a cut excerpt is faded in and out.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function param() {
  const p = {value: 0, ramps: []};
  for (const k of ['setTargetAtTime', 'setValueAtTime', 'exponentialRampToValueAtTime', 'setValueCurveAtTime']) p[k] = v => { if (typeof v === 'number') p.value = v; return p; };
  p.linearRampToValueAtTime = (v, t) => { p.ramps.push([v, t]); p.value = v; return p; };
  p.cancelScheduledValues = p.cancelAndHoldAtTime = () => p;
  return p;
}
function node() {
  const methods = new Set(['disconnect', 'stop', 'setPosition', 'setOrientation', 'addEventListener', 'removeEventListener']);
  return new Proxy({}, {
    get(t, k) {
      if (typeof k === 'symbol' || k === 'then' || k === 'toJSON') return undefined;
      if (k in t) return t[k];
      if (k === 'connect') return next => next;
      if (methods.has(k)) return () => {};
      return t[k] = param();
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}
const starts = [], gains = [];
const context = new Proxy({sampleRate: 8000, currentTime: 10, destination: node(), state: 'running',
  createBufferSource: () => { const n = node(); n.start = (...a) => starts.push(a); return n; },
  createGain: () => { const n = node(); gains.push(n); return n; }
}, {get: (t, k) => k in t ? t[k] : typeof k === 'string' && k.startsWith('create') ? node : undefined});
const box = vm.createContext({console: Object.assign(Object.create(console), {warn() {}}), Math, Float32Array, WeakMap, Map, Set, Object, Number, Array, setTimeout: () => 0, performance: {now: () => 0},
  matchMedia: () => ({matches: false}), navigator: {onLine: false}, Promise, URL, AbortController, location: {protocol: 'http:', hash: ''}, addEventListener() {}, clearTimeout() {}, localStorage: {getItem: () => null, setItem: () => {}}, fetch: async () => { throw Error('offline'); },
  Omnitone: {createHOARenderer: () => ({initialize: async () => {}, input: node(), output: node()}), createFOARenderer: () => ({initialize: async () => {}, input: node(), output: node()})}});
box.window = box; box.globalThis = box; box.self = box;
for (const file of ['three.min.js', 'terrain-acoustics.js', 'spatial-audio.js'])
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../game', file), 'utf8'), box, {filename: file});
const engine = box.makeSpatialAudio(context, {height: () => 0, waterLevel: 0}, {});

// A recording at 8 kHz: faint hiss with a 600 Hz call wherever `calls` says.
function recording(seconds, calls) {
  const rate = 8000, data = new Float32Array(seconds * rate);
  let seed = 7; const noise = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2147483648 - 1);
  for (let i = 0; i < data.length; i++) {
    const t = i / rate, on = calls.some(([a, b]) => t >= a && t < b);
    data[i] = .002 * noise() + (on ? .4 * Math.sin(2 * Math.PI * 600 * t) : 0);
  }
  return {numberOfChannels: 1, sampleRate: rate, length: data.length, duration: seconds, getChannelData: () => data};
}
function seeded(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

// 1. Six calls in twelve seconds: the engine finds all six.
const calls = [[.5, 1.3], [2.1, 2.9], [4.0, 4.6], [6.2, 7.4], [8.5, 9.0], [10.3, 11.4]];
const song = recording(12, calls), found = engine.phrases(song);
assert.equal(found?.length, 6, `found ${found?.length} calls of 6`);
found.forEach(([a, b], i) => assert.ok(Math.abs(a - calls[i][0]) < .03 && Math.abs(b - calls[i][1]) < .03, `call ${i + 1} found at ${a.toFixed(2)}-${b.toFixed(2)} s`));

// 2. Every excerpt is cut in the quiet between calls and holds at least one whole call; successive ones differ.
const random = seeded(11), seen = new Set(); let whole = 0;
for (let k = 0; k < 60; k++) {
  const part = engine.excerpt(song, random);
  if (!part) { whole++; continue; }
  const from = part.offset, to = part.offset + part.duration;
  for (const [a, b] of calls) assert.ok(!(from > a + .01 && from < b - .01) && !(to > a + .01 && to < b - .01), `excerpt ${from.toFixed(2)}-${to.toFixed(2)} s cuts through the call at ${a}-${b} s`);
  assert.ok(calls.some(([a, b]) => a >= from && b <= to), 'an excerpt with no whole call in it');
  assert.ok(part.duration >= 1, `an excerpt only ${part.duration.toFixed(2)} s long`);
  seen.add(from.toFixed(2) + ' ' + to.toFixed(2));
}
assert.ok(seen.size >= 8, `only ${seen.size} different excerpts in 60 draws`);
assert.ok(whole < 20, `played whole ${whole} times in 60`);

// 3. A recording with no gaps is played whole unless the caller says it may start anywhere (a colony, an
// insect, a dense chatter); then every window lies inside it. A single call in silence is never cut.
assert.equal(engine.excerpt(recording(6, [[0, 6]])), null);
assert.equal(engine.excerpt(recording(6, [[.2, 5.9]])), null);
assert.equal(engine.excerpt(recording(6, [[2, 3.5]]), seeded(3), true), null, 'a single call in silence was cut');
assert.equal(engine.excerpt(recording(3, [[0, 3]]), seeded(3), true), null, 'a short continuous call was cut');
const windows = new Set(), anywhere = seeded(5), colony = recording(8, [[0, 8]]);
for (let k = 0; k < 20; k++) {
  const part = engine.excerpt(colony, anywhere, true);
  assert.ok(part && part.offset >= 0 && part.offset + part.duration <= 8 + 1e-9 && part.duration >= 4, 'a window outside the recording or too short');
  windows.add(part.offset.toFixed(2));
}
assert.ok(windows.size >= 15, `only ${windows.size} different windows in 20`);

// 4. A cut excerpt starts at its offset for its duration and is faded in and out; a whole recording is not touched.
starts.length = 0; gains.length = 0;
engine.play(song, {x: 30, y: 5, z: 0}, {offset: 3.88, duration: 3.7, rate: 1});
assert.deepEqual(starts[0].slice(1), [3.88, 3.7]);
const faded = gains.find(g => g.gain.ramps.length === 2);
assert.ok(faded, 'the excerpt was not faded');
assert.deepEqual(faded.gain.ramps.map(r => r[0]), [1, 0]);
assert.ok(Math.abs(faded.gain.ramps[1][1] - (10 + 3.7)) < 1e-6, 'the fade-out does not end with the excerpt');
starts.length = 0; gains.length = 0;
engine.play(song, {x: 30, y: 5, z: 0}, {rate: 1});
assert.ok(!gains.some(g => g.gain.ramps.length), 'a whole recording was faded');

console.log(`Passed call variety checks: ${found.length} calls found, ${seen.size} different excerpts in 60, all cut in the quiet, a continuous recording left whole, cuts faded.`);
