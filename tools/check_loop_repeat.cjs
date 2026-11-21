// Run with node tools/check_loop_repeat.cjs. No audio device is opened.
//
// A looped recording repeats itself exactly, and a listener on a perch hears
// the same sixteen seconds of lapping water come round again. The spatial
// engine's beds are shuffled instead: a stretch from one place in the
// recording crossfades into a stretch from another. This checks that the
// stretches start at different places, change before the recording would have
// come round, crossfade at equal power, and stop cleanly; and that a short
// texture or footsteps still loop plainly.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function param() {
  const p = {value: 0, curves: []};
  for (const k of ['setTargetAtTime', 'setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime']) p[k] = v => { if (typeof v === 'number') p.value = v; return p; };
  p.setValueCurveAtTime = (curve, when, duration) => { p.curves.push({curve: Array.from(curve), when, duration}); return p; };
  p.cancelScheduledValues = p.cancelAndHoldAtTime = () => p;
  return p;
}
function node() {
  const methods = new Set(['disconnect', 'setPosition', 'setOrientation', 'addEventListener', 'removeEventListener']);
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
// Sources remember when they start and stop; timers fire when the clock is advanced.
const sources = [], timers = [], gains = [];
const clock = {now: 100};
const context = new Proxy({sampleRate: 8000, get currentTime() { return clock.now; }, destination: node(), state: 'running',
  createGain: () => { const n = node(); gains.push(n); return n; },
  createBufferSource: () => { const n = node(); n.started = null; n.stopped = null; n.start = (when, offset) => { n.started = {when, offset}; sources.push(n); }; n.stop = when => { n.stopped = when ?? clock.now; }; return n; }
}, {get: (t, k) => k in t ? t[k] : typeof k === 'string' && k.startsWith('create') ? node : undefined});
const later = (fn, ms) => { timers.push({at: clock.now + ms / 1000, fn}); return timers.length; };
function advance(seconds) {
  const end = clock.now + seconds;
  for (;;) {
    const due = timers.filter(t => t.fn && t.at <= end).sort((a, b) => a.at - b.at)[0];
    if (!due) break;
    clock.now = Math.max(clock.now, due.at); const fn = due.fn; due.fn = null; fn();
  }
  clock.now = end;
}
let seed = 20261121; const math = Object.create(Math); math.random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;   // repeatable chance
const box = vm.createContext({console: Object.assign(Object.create(console), {warn() {}}), Math: math, Float32Array, WeakMap, Map, Set, Object, Number, Array, Promise, URL, AbortController,
  setTimeout: later, clearTimeout: id => { if (timers[id - 1]) timers[id - 1].fn = null; }, performance: {now: () => 0},
  matchMedia: () => ({matches: false}), navigator: {onLine: false}, location: {protocol: 'http:', hash: ''}, addEventListener() {},
  localStorage: {getItem: () => null, setItem: () => {}}, fetch: async () => { throw Error('offline'); },
  Omnitone: {createHOARenderer: () => ({initialize: async () => {}, input: node(), output: node()}), createFOARenderer: () => ({initialize: async () => {}, input: node(), output: node()})}});
box.window = box; box.globalThis = box; box.self = box;
for (const file of ['three.min.js', 'terrain-acoustics.js', 'spatial-audio.js'])
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../game', file), 'utf8'), box, {filename: file});
const engine = box.makeSpatialAudio(context, {height: () => 0, waterLevel: 0}, {});
const recording = seconds => ({numberOfChannels: 1, sampleRate: 8000, length: seconds * 8000, duration: seconds, getChannelData: () => new Float32Array(seconds * 8000)});

// 1. A sixteen-second bed: over two minutes it is rebuilt from stretches that start at different places and
//    each give way before the recording would have come round.
sources.length = 0;
const bed = engine.loop(recording(16), {x: 40, y: 0, z: 0}, {gain: 1, ref: 20, reach: 500});
advance(120);
assert.ok(sources.length >= 10 && sources.length <= 24, `${sources.length} stretches in two minutes of a 16 s bed`);
const offsets = new Set(sources.map(s => s.started.offset.toFixed(2)));
assert.ok(offsets.size >= sources.length - 1, 'stretches started at the same place');
for (let i = 1; i < sources.length; i++) {
  const held = sources[i].started.when - sources[i - 1].started.when;
  assert.ok(held >= 16 * .35 - 1e-6 && held <= 16 * .7 + .4, `a stretch was held ${held.toFixed(1)} s`);
  assert.ok(sources[i - 1].stopped !== null && sources[i - 1].stopped > sources[i].started.when && sources[i - 1].stopped < sources[i].started.when + 2, 'the earlier stretch was not stopped after its fade');
}
assert.equal(sources[sources.length - 1].stopped, null, 'the stretch in hand was stopped');

// 2. Stopping a bed stops its stretch in hand and starts no more.
const count = sources.length;
bed.stop(.5); advance(90);
assert.equal(sources.length, count, 'a stopped bed went on starting stretches');
assert.ok(sources.every(s => s.stopped !== null), 'a stopped bed left a stretch playing');

// 3. The crossfade keeps the power level: one stretch rises as the other falls, over the same time, and
//    the squares of the two curves sum to one all the way across.
sources.length = 0; gains.length = 0;
const direct = box.aerieShuffledLoop(context, recording(16), node());
advance(13);                                   // a stretch is held 5.6 to 11.2 s, so at least one change by now
assert.ok(sources.length >= 2, 'the loop did not change stretch within 13 s');
const curves = gains.flatMap(g => g.gain.curves).sort((p, q) => p.when - q.when);
assert.equal(curves.length, 2 * (sources.length - 1), `${curves.length} fades for ${sources.length - 1} changes of stretch`);
const [rise, fall] = curves[0].curve[0] < curves[0].curve.at(-1) ? curves : [curves[1], curves[0]];
assert.ok(rise.when === fall.when && rise.duration === fall.duration && rise.duration >= 1 && rise.duration <= 1.6, 'the two fades do not line up');
rise.curve.forEach((v, i) => assert.ok(Math.abs(v * v + fall.curve[i] ** 2 - 1) < 1e-6, 'the crossfade does not hold its power'));
const made = sources.length;
direct.stop(); advance(60);
assert.equal(sources.length, made, 'a stopped loop went on starting stretches');

// 4. Four copies of one recording round the listener (a family) change stretch at the same moments and
//    never play the same moment together: at every change their places in the recording are well apart.
sources.length = 0;
const family = {seed: 311.7, size: 4};
const copies = [0, 1, 2, 3].map(i => engine.loop(recording(16), {x: 18 * Math.cos(i), y: 0, z: 18 * Math.sin(i)}, {gain: 1, family, member: i}));
advance(300);
for (const copy of copies) copy.stop(.2);
const byTime = new Map();
for (const src of sources) { const key = src.started.when.toFixed(3); byTime.set(key, [...(byTime.get(key) || []), src.started.offset]); }
assert.ok(byTime.size >= 25, `${byTime.size} changes of stretch in five minutes`);
let nearest = Infinity;
for (const [when, offsets] of byTime) {
  assert.equal(offsets.length, 4, `at ${when} s only ${offsets.length} of the four copies changed stretch`);
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) { const d = Math.abs(offsets[i] - offsets[j]); nearest = Math.min(nearest, d, 16 - d); }
}
assert.ok(nearest > 1.5, `two copies came within ${nearest.toFixed(2)} s of each other in the recording`);
assert.ok(new Set([...byTime.values()].map(o => o[0].toFixed(1))).size > byTime.size * .7, 'the copies keep returning to the same places');
advance(5);

// 5. A short texture and footsteps loop plainly: one source, started once.
sources.length = 0;
engine.loop(recording(4), {x: 10, y: 0, z: 0}, {gain: 1});
engine.loop(recording(12.5), {x: 10, y: 0, z: 0}, {gain: 1, shuffle: false});
advance(90);
assert.equal(sources.length, 2, `${sources.length} sources for two plain loops`);
assert.ok(sources.every(s => s.loop === true && s.stopped === null));

console.log('Passed loop repeat checks: a 16 s bed is rebuilt from stretches at different places that change every 5.6 to 11.6 s, stopped beds stay stopped, four copies of one bed change together and keep apart, short textures and footsteps loop plainly.');
