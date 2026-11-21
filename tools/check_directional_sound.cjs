// Run with node tools/check_directional_sound.cjs. No audio device is opened.
//
// The real soundscape, spatial engine and terrain screening are flown past a
// rock: an exposed approach over a wooded shore, a pass low along the rock's
// lee face, and a return the way it came. Every cue must stay tied to one
// actual source throughout:
//   - habitat callers sing from fixed posts and insects from fixed patches,
//     the same on the return as on the approach, and the same on a second
//     flight with different chance;
//   - a source never moves while it sounds;
//   - the rock screens what is behind it and stops screening on the return;
//   - wind noise at the ears masks quiet arrivals more at speed and in the
//     open, less in the lee;
//   - songbirds and frogs keep quiet close to the eagle; scolders do not.
// It also prints the cost of one audio update.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const dir = path.join(__dirname, '../game');

function param() {
  const p = {value: 0};
  for (const k of ['setTargetAtTime', 'setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setValueCurveAtTime'])
    p[k] = v => { if (typeof v === 'number') p.value = v; return p; };
  p.cancelScheduledValues = p.cancelAndHoldAtTime = () => p;
  return p;
}
// An audio node that accepts anything: methods do nothing, connect() chains,
// every other property is an audio parameter.
function node() {
  const methods = new Set(['disconnect', 'start', 'stop', 'setPosition', 'setOrientation', 'addEventListener', 'removeEventListener', 'getFloatTimeDomainData']);
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
// The page, for the sound controls: any element, any call, nothing happens.
function page() {
  return new Proxy(function () {}, {
    get: (t, k) => typeof k === 'symbol' || k === 'then' ? undefined : k in t && k !== 'name' && k !== 'length' ? t[k] : t[k] = page(),
    set: (t, k, v) => { t[k] = v; return true; },
    apply: () => page()
  });
}
function makeContext() {
  const ctx = {sampleRate: 8000, currentTime: 0, destination: node(), state: 'running',
    createBuffer: (channels, length, rate) => ({numberOfChannels: channels, length, sampleRate: rate, duration: length / rate, getChannelData: () => new Float32Array(length)}),
    decodeAudioData: async data => ({name: data.name, duration: 5, length: 40000, sampleRate: 8000, numberOfChannels: 1, getChannelData: () => new Float32Array(40000)})};
  return new Proxy(ctx, {get: (t, k) => k in t ? t[k] : typeof k === 'string' && k.startsWith('create') ? node : undefined});
}

// ---- the place ------------------------------------------------------------------
// Wind blows toward +x. A wooded shore lies upwind (west) of a 220 m rock
// wall; the lee water is east of it. The lake surface is at 0.
const smooth = (a, b, x) => { const v = Math.max(0, Math.min(1, (x - a) / (b - a))); return v * v * (3 - 2 * v); };
const rock = (x, z) => 220 * Math.exp(-((x / 55) ** 2)) * (1 - smooth(430, 560, Math.abs(z)));
const shore = (x, z) => x > -560 && x < -95 && Math.abs(z) < 700 ? 5 : -8;
const height = (x, z) => Math.max(rock(x, z), shore(x, z));
const trees = [];
for (let x = -540; x <= -110; x += 26) for (let z = -680; z <= 680; z += 26) trees.push({x: x + 7 * Math.sin(z), y: 5, z: z + 7 * Math.cos(x), height: 17});
function makeWorld() {
  return {region: 'moosehead', height, waterLevel: 0, landmarks: [], waterfalls: [],
    windField: {direction: {x: 1, z: 0}, advection: 6, sample: (x, y, z, t, out = {}) => { out.gust = .5; return out; }},
    habitat: {nearestTree(x, z, radius) {
      let best = null, bd = radius;
      for (const t of trees) { const d = Math.hypot(t.x - x, t.z - z); if (d < bd) { bd = d; best = t; } }
      return best;
    }}};
}

// ---- the flight -----------------------------------------------------------------
// Two laps over the shore, round the south end of the rock, two laps low in
// its lee, round the north end and two more laps over the shore.
function lap(cx, cz, rx, rz, y, turns, from) {
  const out = [];
  for (let i = 0; i <= 40 * turns; i++) { const a = from + i / 40 * Math.PI * 2; out.push([cx + rx * Math.cos(a), y, cz + rz * Math.sin(a)]); }
  return out;
}
const route = [
  ...lap(-250, 0, 110, 230, 70, 2, Math.PI / 2).map(p => [...p, 'approach']),
  ...[[-140, 70, -420], [-60, 70, -640], [60, 60, -640], [105, 50, -420]].map(p => [...p, 'round']),
  ...lap(105, 0, 28, 250, 50, 2, -Math.PI / 2).map(p => [...p, 'shelter']),
  ...[[105, 55, 420], [60, 65, 640], [-60, 70, 640], [-140, 70, 420]].map(p => [...p, 'round']),
  ...lap(-250, 0, 110, 230, 70, 2, Math.PI / 2).map(p => [...p, 'return'])
];
const lengths = [0];
for (let i = 1; i < route.length; i++) lengths.push(lengths[i - 1] + Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1], route[i][2] - route[i - 1][2]));
function along(distance) {
  let i = 1; while (i < route.length - 1 && lengths[i] < distance) i++;
  const u = Math.max(0, Math.min(1, (distance - lengths[i - 1]) / (lengths[i] - lengths[i - 1] || 1))), a = route[i - 1], b = route[i];
  return {x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, z: a[2] + (b[2] - a[2]) * u, leg: b[3]};
}

async function fly(seed, airspeed = 16) {
  const math = Object.create(Math);
  math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const context = makeContext(), world = makeWorld();
  // Timers run on the audio clock, so a finished recording is released on time.
  const timers = [];
  const later = (fn, ms = 0) => { timers.push({fn, at: context.currentTime + ms / 1000}); return timers.length; };
  const tick = engine => {
    for (const s of engine.sources) if (s.endsAt && context.currentTime > s.endsAt && s.source?.onended) { const ended = s.source.onended; s.source.onended = null; ended(); }
    for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= context.currentTime) timers.splice(i, 1)[0].fn();
  };
  const box = {Math: math, console, setTimeout: later, clearTimeout() {}, Promise, Float32Array, performance,
    matchMedia: () => ({matches: false}), localStorage: {getItem: () => null, setItem() {}},
    location: {protocol: 'http:', hash: ''}, addEventListener() {}, document: page(), navigator: {onLine: false}, AbortController, URL,
    Omnitone: {createHOARenderer: () => ({initialize: async () => {}, input: node(), output: node()}), createFOARenderer: () => ({initialize: async () => {}, input: node(), output: node()})},
    fetch: async name => /\.m4a$/.test(String(name)) && !/^https?:/.test(String(name)) && fs.existsSync(path.join(dir, String(name)))
      ? {ok: true, arrayBuffer: async () => ({name: String(name)})} : {ok: false, json: async () => null, arrayBuffer: async () => { throw Error('missing'); }}};
  box.window = box; box.globalThis = box; box.self = box;
  vm.createContext(box);
  box.console = Object.assign(Object.create(console), {warn() {}});
  for (const file of ['three.min.js', 'terrain-acoustics.js', 'spatial-audio.js', 'soundscapes.js'])
    vm.runInContext(fs.readFileSync(path.join(dir, file), 'utf8'), box, {filename: file});
  const scape = box.makeSoundscape(context, world, 'moosehead', node());
  for (let i = 0; i < 20; i++) await new Promise(r => setTimeout(r, 5));      // recordings "decode"
  scape.setEnabled(true);
  // Every call as it starts: which individual sang, and when.
  const calls = [], play = scape.engine.play;
  scape.engine.play = function (buffer, position, opt = {}) { const s = play.call(this, buffer, position, opt); if (s && opt.id) calls.push({id: opt.id, label: opt.label, x: s.x, y: s.y, z: s.z, ear: {...scape.engine.ear}}); return s; };
  const camera = {position: new box.THREE.Vector3(), quaternion: new box.THREE.Quaternion()};
  const dt = 1 / 30, rows = [], state = {x: 0, y: 0, z: 0, airspeed, elapsed: 0};
  let spent = 0, frames = 0;
  for (let distance = 0; distance < lengths[lengths.length - 1]; distance += airspeed * dt) {
    const p = along(distance);
    Object.assign(state, {x: p.x, y: p.y, z: p.z, elapsed: state.elapsed + dt});
    camera.position.set(p.x, p.y, p.z); context.currentTime += dt; tick(scape.engine);
    const t0 = process.hrtime.bigint();
    scape.update(state, camera, dt, {gust: .5, open: 1, exposure: 1 - .7 * scape.shelter, canopy: 0});
    spent += Number(process.hrtime.bigint() - t0); frames++;
    rows.push({t: context.currentTime, leg: p.leg, ear: p, masker: scape.engine.masker, shelter: scape.shelter, live: scape.trace()});
  }
  return {rows, scape, box, context, tick, calls, microseconds: spent / frames / 1000, frames};
}

(async () => {
  const first = await fly(20261120), second = await fly(77);
  const {windMasker, hushRadius, leeShelter, postFor, POST_CELL} = first.box.aerieSoundLogic, masking = first.box.aerieWindMasking;

  // One source, one place: follow every sounding source by identity.
  const seen = new Map();
  for (const run of [first, second]) for (const row of run.rows) for (const s of row.live) {
    const id = run === first ? 'a' : 'b';
    const key = id + '|' + s.id;
    const entry = seen.get(key) || seen.set(key, {label: s.label, id: s.id, x: s.x, y: s.y, z: s.z, run: id, legs: new Set(), shield: {}}).get(key);
    // One individual, one place: the identity a source carries never turns up somewhere else.
    assert.ok(s.follows || (entry.x === s.x && entry.y === s.y && entry.z === s.z), s.id + ' was heard from two places');
    entry.legs.add(row.leg); (entry.shield[row.leg] ||= []).push(s.shield);
  }
  const callers = [...seen.values()].filter(s => /ovenbird|black-throated|nuthatch|chipmunk/.test(s.label));
  assert.ok(callers.length >= 6, 'habitat callers should sing during the flight');

  // Fixed posts: every caller sits on a tree post (or the forest floor) found
  // by the repeatable search, never at a place invented for the moment.
  const posts = run => new Set([...run.scape.posts.values()].filter(Boolean).map(p => p.x.toFixed(1) + '|' + p.y.toFixed(1) + '|' + p.z.toFixed(1)));
  const postsA = posts(first), postsB = posts(second);
  for (const s of callers) assert.ok((s.run === 'a' ? postsA : postsB).has(s.x.toFixed(1) + '|' + s.y.toFixed(1) + '|' + s.z.toFixed(1)), s.label + ' sang away from a post');
  // The same posts exist on a flight with different chance.
  let shared = 0;
  for (const [key, post] of first.scape.posts) {
    if (!second.scape.posts.has(key)) continue;
    const twin = second.scape.posts.get(key); shared++;
    assert.ok(post === null ? twin === null : twin && post.x === twin.x && post.y === twin.y && post.z === twin.z, 'post ' + key + ' differs between flights');
  }
  assert.ok(shared > 100, 'the two flights should have searched the same ground (' + shared + ' cells in common)');
  // And the search itself is repeatable wherever the eagle happens to be.
  const world = makeWorld(), chance = () => first.box.Math.random(), inTrees = c => { const a = chance() * 6.283, r = 40 + 200 * chance(); return c.world.habitat.nearestTree(c.ear.x + Math.cos(a) * r, c.ear.z + Math.sin(a) * r, 40); };
  const one = postFor(inTrees, 3, -2, 1, {world, ear: {x: 0, y: 50, z: 0}}), two = postFor(inTrees, 3, -2, 1, {world, ear: {x: 900, y: 10, z: -400}});
  assert.ok(one && two && one.x === two.x && one.z === two.z, 'a post must not depend on where the eagle is');
  const other = postFor(inTrees, 4, -2, 1, {world, ear: {x: 0, y: 50, z: 0}});
  assert.ok(other && (other.x !== one.x || other.z !== one.z), 'different callers keep different posts');
  assert.equal(POST_CELL, 160);

  // The same bird on the approach and on the return.
  const both = callers.filter(s => s.run === 'a' && s.legs.has('approach')).map(s => s.id);
  const back = new Set(callers.filter(s => s.run === 'a' && s.legs.has('return')).map(s => s.id));
  const again = both.filter(k => back.has(k));
  assert.ok(again.length >= 1, `callers heard on the approach should be heard from the same posts on the return (${again.length})`);
  // A bird sings in bouts from one post: while the last singer is still in
  // earshot, the next song is usually its own.
  let followed = 0, songs = 0; const lastSinger = new Map(), reach = {};
  for (const e of first.box.aerieSoundscapes.moosehead.events) reach[e.clip] = e.reach;
  for (const call of first.calls) {
    if (!/ post /.test(call.id)) continue;
    const last = lastSinger.get(call.label);
    if (last && Math.hypot(last.x - call.ear.x, last.y - call.ear.y, last.z - call.ear.z) < .9 * reach[call.label]) { songs++; if (last.id === call.id) followed++; }
    lastSinger.set(call.label, call);
  }
  assert.ok(songs >= 15 && followed / songs > .55, `a singer still in earshot should carry on from its post (${followed} of ${songs} songs)`);

  // Insect patches are places too: the crickets left behind are found again.
  const patches = [...seen.values()].filter(s => /crickets/.test(s.label) && s.run === 'a');
  assert.ok(patches.length >= 4 && patches.every(s => / patch /.test(s.id)), 'crickets should sound from fixed patches');
  const patchesAgain = patches.filter(s => s.legs.has('approach') && s.legs.has('return')).length;
  assert.ok(patchesAgain >= 3, `cricket patches heard on the approach should be heard again on the return (${patchesAgain})`);

  // A source never moves while it sounds: each engine source keeps its place.
  for (const run of [first]) {
    const place = new Map();
    for (const row of run.rows) for (const s of run.scape.engine.sources) {
      if (!s.alive || !s.label || /^move-/.test(s.label)) continue;
      const was = place.get(s);
      if (was) assert.ok(was[0] === s.x && was[1] === s.y && was[2] === s.z, s.label + ' moved while sounding');
      else place.set(s, [s.x, s.y, s.z]);
    }
  }

  // The rock screens the shore from the lee water and not from the open side.
  const mean = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const screened = callers.filter(s => s.shield.shelter), open = callers.filter(s => s.shield.approach || s.shield.return);
  assert.ok(screened.length >= 2, 'some shore callers should still be heard from behind the rock');
  const shieldLee = mean(screened.map(s => mean(s.shield.shelter))), shieldOpen = mean(open.map(s => mean([...(s.shield.approach || []), ...(s.shield.return || [])])));
  assert.ok(shieldLee > .6, `the rock should screen shore callers from its lee (${shieldLee.toFixed(2)})`);
  assert.ok(shieldOpen < .1, `nothing should screen them over the shore (${shieldOpen.toFixed(2)})`);

  // Wind masking: stronger at speed and in the open, weaker in the lee.
  const legs = {};
  for (const row of first.rows) (legs[row.leg] ||= []).push(row);
  const maskOpen = mean(legs.approach.map(r => r.masker)), maskLee = mean(legs.shelter.slice(60).map(r => r.masker)), maskBack = mean(legs.return.slice(60).map(r => r.masker));
  assert.ok(mean(legs.shelter.slice(60).map(r => r.shelter)) > .8 && mean(legs.approach.map(r => r.shelter)) < .05, 'the lee face should shelter, the shore should not');
  assert.ok(maskLee < .5 * maskOpen, `wind noise should fall in the lee (${maskOpen.toFixed(4)} open, ${maskLee.toFixed(4)} lee)`);
  assert.ok(Math.abs(maskBack - maskOpen) < .05 * maskOpen, 'wind noise should come back on the return');
  assert.equal(leeShelter(world, 105, 300, 0), 0, 'above the summit there is no shelter');
  assert.ok(leeShelter(world, 105, 50, 0) > .9 && leeShelter(world, -250, 50, 0) === 0);
  assert.ok(windMasker(24, .5, 1) > 2 * windMasker(16, .5, 1) && windMasker(16, .5, 1) > 3 * windMasker(9, .5, 1), 'wind noise grows steeply with airspeed');
  assert.ok(windMasker(16, 1, 1) > windMasker(16, 0, 1) && windMasker(16, .5, 1) > windMasker(16, .5, .2));
  // A loud arrival is hardly touched, one at the wind's level is halved, a faint one is lost.
  const m = windMasker(16, .5, 1);
  assert.ok(masking(m * 20, m) > .95 * m * 20 && Math.abs(masking(m, m) - m / 2) < 1e-12 && masking(m / 20, m) < .05 * m / 20 * 1.01);
  assert.equal(masking(.3, 0), .3);
  for (const row of first.rows) for (const s of row.live) assert.ok(s.heard <= s.arrived + 1e-9, 'masking never adds level');

  // Species-appropriate quiet: no songbird sounds inside its hush radius.
  assert.equal(hushRadius('scape-moosehead-ovenbird'), 45); assert.equal(hushRadius('scape-surry-gray-treefrog'), 60);
  assert.equal(hushRadius('scape-moosehead-red-breasted-nuthatch'), 0); assert.equal(hushRadius('scape-winnipesaukee-chipmunk'), 0);
  for (const run of [first, second]) for (const row of run.rows) for (const s of row.live) {
    const hush = hushRadius(s.label); if (!hush || s.arrived <= 0) continue;
    assert.ok(Math.hypot(s.x - row.ear.x, s.y - row.ear.y, s.z - row.ear.z) >= hush - 1.5, s.label + ' sang with the eagle ' + s.distance + ' m away');
  }
  // A low pass straight over a singing ovenbird's post silences it mid-phrase.
  {
    const low = await fly(5, 16), scape = low.scape, engine = scape.engine, post = [...scape.posts.values()].find(p => p && /^1:/.test(p.key));
    const buffer = scape.buffers.get('scape-moosehead-ovenbird'), camera = {position: new low.box.THREE.Vector3(post.x - 200, post.y + 12, post.z), quaternion: new low.box.THREE.Quaternion()};
    assert.ok(buffer && post, 'ovenbird recording and post');
    let voice = null, cut = null;
    for (let x = post.x - 200; x < post.x + 5; x += 16 / 30) {
      camera.position.x = x; low.context.currentTime += 1 / 30;
      scape.update({x, y: camera.position.y, z: post.z, airspeed: 16, elapsed: 0}, camera, 1 / 30, {gust: .5, open: 1, exposure: 1});
      if (!voice && post.x - x < 90) { voice = engine.play(buffer, post, {gain: .55, ref: 16, reach: 420, label: 'scape-moosehead-ovenbird'}); scape.hush(voice, 45); }
      if (voice && cut === null && voice.gain === 0) cut = post.x - x;
    }
    assert.ok(cut !== null && cut > 30 && cut < 47, `the ovenbird should stop as the eagle closes to its hush radius (stopped at ${cut && cut.toFixed(1)} m)`);
  }

  const lee = legs.shelter.slice(60), kept = rows => mean(rows.flatMap(r => r.live.filter(s => s.arrived > 0).map(s => s.heard / s.arrived)));
  console.log(`Passed directional sound: ${callers.length} caller posts, ${again.length} heard again from the same post on the return, ${followed} of ${songs} songs with the last singer in earshot were its own, ${patchesAgain} of ${patches.length} cricket patches found again; ` +
    `rock screening ${shieldOpen.toFixed(2)} open, ${shieldLee.toFixed(2)} in the lee; wind masker ${maskOpen.toFixed(4)} open, ${maskLee.toFixed(4)} lee ` +
    `(level kept ${(100 * kept(legs.approach)).toFixed(0)}% open, ${(100 * kept(lee)).toFixed(0)}% lee).`);
  console.log(`Audio update cost: ${first.microseconds.toFixed(1)} microseconds a frame over ${first.frames} frames (node, no rendering).`);
})().catch(error => { console.error(error); process.exit(1); });
