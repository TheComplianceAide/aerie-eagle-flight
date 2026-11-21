// Run with node tools/check_approach_alarm.cjs. Each kind of animal keeps its
// own time. Undisturbed, it calls about as often as its entry in the timing
// table says. When the eagle comes close it answers in the way of its kind,
// without waiting for its turn: a flock of geese honks over itself and then
// settles, a loon gives a tremolo or two and no more, a raven croaks a short
// series.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const dir = path.join(__dirname, '../game');
const clips = [];
const disk = new Map();
// Seeded randomness, so every run schedules the same calls.
let seed = Number(process.env.SEED || 20261120) >>> 0;
const math = Object.create(Math);
math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const browser = {
  Math: math,
  window: {aerieEchoSurfaces: () => [], aerieCascadeSource: () => null, aerieSoundPath: () => 0, aerieWind: () => 0},
  THREE: {Vector3: class {}},
  fetch: async name => {
    if (!disk.has(name)) disk.set(name, fs.readFileSync(path.join(dir, name)));
    return {ok: true, arrayBuffer: async () => ({name, data: disk.get(name)})};
  }
};
vm.runInNewContext(fs.readFileSync(path.join(dir, 'field-audio.js'), 'utf8'), browser);
function param() { return {value: 0, cancelScheduledValues() {}, setTargetAtTime(v) { this.value = v; }}; }
function node() {
  return {gain: param(), pan: param(), frequency: param(), playbackRate: param(),
    connect(next) { this.out = next; return next; }, disconnect() {}, setPosition() {}, stop() {},
    start() { if (this.buffer?.name) clips.push({name: this.buffer.name, at: ctx.currentTime}); }};
}
const ctx = {
  sampleRate: 8000, currentTime: 0, destination: node(), createGain: node, createPanner: node,
  createStereoPanner: node, createBiquadFilter: node, createBufferSource: node,
  createBuffer: (channels, length) => ({getChannelData: () => new Float32Array(length)}),
  decodeAudioData: async f => ({name: f.name, duration: 1.2})
};
const eagle = {x: 0, y: 40, z: 600, yaw: 0, airspeed: 18};
const goose = {x: 0, y: 1, z: 0};
let only = /goose/;
const world = {
  height: () => 0,
  habitat: {surface: () => null, nearestTree: () => null, wet: () => false}, windField: {sample: () => ({gust: 0})},
  wildlife: {
    waterAt: () => NaN, nearby: () => [],
    // Only one kind of animal exists in each test world.
    nearest: (id, p, reach) => only.test(id) && Math.hypot(p.x - goose.x, p.y - goose.y, p.z - goose.z) < reach ? {...goose, actor: goose} : null
  }
};
(async () => {
  const fauna = browser.window.aerieFauna;
  // Every animal in every world has its own entry in the timing table.
  for (const [region, scene] of Object.entries(fauna.scenes)) for (const id of [...scene.birds, ...scene.animals])
    assert.ok(fauna.timing[fauna.birds[id]?.[0]] || fauna.timing[id], `${id} in ${region} has no timing entry`);
  const calls = re => (from, to) => clips.filter(c => re.test(c.name) && c.at >= from && c.at < to).length;
  let field = null, t = 0, clock = 0;
  const open = async (region, kind) => { clips.length = 0; only = kind; clock += 5000; t = 0; field = browser.window.makeFieldAudio(ctx, region); field.setEnabled(true); await new Promise(setImmediate); };
  const fly = (seconds, z) => { for (const end = t + seconds; t < end; t += .1) { eagle.z = z; ctx.currentTime = clock + t; field.update(eagle, world, .1, null, 'free'); } };
  const at = seconds => clock + seconds;

  // Geese: quiet at a distance, a clamour at once when the eagle arrives, then they settle.
  await open('moosehead', /goose/);
  const honks = calls(/goose/);
  fly(20, 600);
  assert.ok(honks(at(0), at(20)) <= 2, `honking with the eagle 600 m away: ${honks(at(0), at(20))}`);
  fly(75, 90);
  assert.ok(honks(at(20), at(20.6)) >= 1, 'no honk as the eagle came within range');
  assert.ok(honks(at(20), at(32)) >= 3, `only ${honks(at(20), at(32))} honks in 12 s beside the flock`);
  const first = clips.filter(c => /goose/.test(c.name) && c.at >= at(20)).slice(0, 3).map(c => c.at);
  assert.ok(first[2] - first[0] < 2 * 1.2 * 2 + 3, 'the first honks should come over one another');
  assert.ok(honks(at(20), at(95)) <= 10, `the flock kept honking: ${honks(at(20), at(95))} in 75 s`);
  assert.equal(honks(at(80), at(95)), 0, 'geese were still honking a minute after the eagle arrived');
  fly(20, 700);
  assert.ok(honks(at(95.5), at(115)) <= 1, 'geese kept up the alarm after the eagle left');

  // A loon: one wail or tremolo as the eagle arrives, then at most one every minute or more while it stays.
  let answered = 0, most = 0;
  for (let trial = 0; trial < 20; trial++) {
    await open('winnipesaukee', /loon/);
    const wails = calls(/loon/);
    fly(4, 600); const before = wails(at(0), at(4));
    fly(90, 60);
    const given = wails(at(4), at(94));
    if (given) { answered++; assert.ok(wails(at(4), at(5)) >= 1, 'a loon that answers does so as the eagle arrives'); }
    most = Math.max(most, given);
    assert.equal(wails(at(6), at(64)), 0, 'a loon called again within a minute of its first answer');
    assert.ok(before <= 1);
  }
  assert.ok(most <= 2, `a loon gave ${most} calls in one encounter`);
  assert.ok(answered >= 9 && answered <= 19, `loons answered the eagle in ${answered} of 20 encounters`);

  // Undisturbed: half an hour with a loon in earshot but not close. It calls a few times, not every minute.
  await open('winnipesaukee', /loon/);
  fly(1800, 300);
  const idle = calls(/loon/)(at(0), at(1800)), [low, high] = fauna.timing.loon.idle;
  assert.ok(idle >= Math.floor(1800 / high) - 1 && idle <= Math.ceil(1800 / low) + 1, `an undisturbed loon called ${idle} times in half an hour`);

  // A red-eyed vireo, by contrast, sings again and again.
  await open('winnipesaukee', /vireo/);
  eagle.y = 20; fly(600, 80); eagle.y = 40;
  const songs = calls(/vireo/)(at(0), at(600));
  assert.ok(songs >= 15, `a vireo sang only ${songs} times in ten minutes`);

  // A marmot says nothing all day, and whistles once at an eagle.
  await open('swiss', /marmot/);
  const whistles = calls(/marmot/);
  fly(900, 150);
  assert.equal(whistles(at(0), at(900)), 0, 'an undisturbed marmot called');
  let whistled = 0;
  for (let trial = 0; trial < 10; trial++) { const from = t; fly(30, 40); const n = whistles(at(from), at(from + 30)); assert.ok(n <= 1, `a marmot whistled ${n} times at one pass`); whistled += n; fly(40, 600); }
  assert.ok(whistled >= 6, `marmots whistled at only ${whistled} of 10 passes`);

  // A poorwill calls from dusk to dawn: never under a high sun, readily at dusk.
  await open('canyon', /poorwill/);
  eagle.y = 20; world.sunDirection = {y: .45}; fly(600, 100);
  assert.equal(calls(/poorwill/)(at(0), at(600)), 0, 'a poorwill called in daylight');
  world.sunDirection = {y: .02}; fly(600, 100);
  assert.ok(calls(/poorwill/)(at(600), at(1200)) >= 4, 'a poorwill kept silent at dusk');
  delete world.sunDirection; eagle.y = 40;

  // A raven: a short series of croaks, then quiet.
  let ravens = 0, croaked = 0;
  for (let trial = 0; trial < 10; trial++) {
    await open('alaska', /raven/);
    const croaks = calls(/raven/);
    fly(4, 600); fly(60, 45);
    const given = croaks(at(4), at(64));
    if (given) { ravens++; assert.ok(croaks(at(4), at(5)) >= 1, 'a raven that calls does so as the eagle closes in'); }
    croaked = Math.max(croaked, given);
  }
  assert.ok(ravens >= 6, `ravens called at the eagle in only ${ravens} of 10 encounters`);
  assert.ok(croaked >= 1 && croaked <= 6, `a raven croaked ${croaked} times in a minute beside the eagle`);
  console.log(`Passed call timing: geese clamour at once and settle; loons answered ${answered} of 20 encounters with at most ${most} calls, and called ${idle} times in an undisturbed half hour; a vireo sang ${songs} times in ten minutes; a marmot whistles once; a poorwill waits for dusk; ravens croak a short series.`);
})().catch(e => { console.error(e); process.exitCode = 1; });
