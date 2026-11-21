// Run with node tools/check_approach_alarm.cjs. Animals must call when the
// eagle comes close, without waiting for their turn in the rotation: geese
// honk over one another as it passes a flock, other birds repeat their call,
// and all settle if the eagle stays near.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const dir = path.join(__dirname, '../game');
const clips = [];
const disk = new Map();
const browser = {
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
  const field = browser.window.makeFieldAudio(ctx, 'moosehead');
  field.setEnabled(true);
  await new Promise(setImmediate);
  const honks = (from, to) => clips.filter(c => /goose/.test(c.name) && c.at >= from && c.at < to).length;
  let t = 0;
  const fly = (seconds, z) => { for (const end = t + seconds; t < end; t += .1) { eagle.z = z(t); ctx.currentTime = t; field.update(eagle, world, .1, null, 'free'); } };
  fly(20, () => 600);
  // Far away only the birds' ordinary rotation can voice a goose now and then.
  assert.ok(honks(0, 20) <= 2, `alarm honking with the eagle 600 m away: ${honks(0, 20)}`);
  const arrive = t;
  fly(12, () => 90);
  assert.ok(honks(arrive, arrive + .6) >= 1, 'no honk as the eagle came within range');
  assert.ok(honks(arrive, arrive + 12) >= 4, `only ${honks(arrive, arrive + 12)} honks in 12 s beside the flock`);
  fly(30, () => 90);
  const early = honks(arrive, arrive + 12) / 12, late = honks(arrive + 20, arrive + 42) / 22;
  assert.ok(late > 0 && late < .55 * early, `the flock should settle to an occasional honk: ${early.toFixed(2)}/s at first, ${late.toFixed(2)}/s later`);
  const leave = t;
  fly(20, () => 700);
  assert.ok(honks(leave + .5, leave + 20) <= 2, 'geese kept up the alarm after the eagle left');
  // A raven: one call at once on approach, then repeats spaced by its own length.
  clips.length = 0; only = /raven/; t = 0;
  const alaska = browser.window.makeFieldAudio(ctx, 'alaska');
  alaska.setEnabled(true);
  await new Promise(setImmediate);
  const croaks = (from, to) => clips.filter(c => /raven/.test(c.name) && c.at >= from && c.at < to).length;
  const pass = (seconds, z) => { for (const end = t + seconds; t < end; t += .1) { eagle.z = z; ctx.currentTime = 1000 + t; alaska.update(eagle, world, .1, null, 'free'); } };
  pass(15, 600);
  const far = croaks(1000, 1015);
  const near = 1000 + t;
  pass(12, 45);
  assert.ok(croaks(near, near + .7) >= 1, 'the raven did not call as the eagle closed in');
  const beside = croaks(near, near + 12);
  assert.ok(beside >= 3 && beside <= 6, `raven calls beside the eagle in 12 s: ${beside}`);
  assert.ok(beside > far, 'approach brought no more calls than the rotation');
  console.log('Passed approach alarm: geese immediate and overlapping then settling; a raven calls at once and repeats.');
})().catch(e => { console.error(e); process.exitCode = 1; });
