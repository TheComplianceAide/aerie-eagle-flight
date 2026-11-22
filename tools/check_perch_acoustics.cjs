const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const THREE = require('../game/three.min.js');

const browser = {window: {}};
const asset = name => path.join(__dirname, '..', 'game', name);
for (const name of ['perch-flight.js', 'perch-routes.js', 'perch-acoustics.js']) {
  vm.runInNewContext(fs.readFileSync(asset(name), 'utf8'), browser);
}
const {makePerchFlight, makePerchAcoustics, PERCH_ROUTE_NAMES} = browser.window;
const input = {climb: 0, turn: 0, look: 0};

function fly(region, substrate, family, wetness = 0, gust = .73) {
  const branch = substrate === 'bark';
  const tree = branch ? {x: 0, y: 0, z: -3.1, height: 8, width: 4, aerieSpecies: {family}} : null;
  const site = {
    id: region, type: branch ? 'branch' : 'rock', substrate, seed: .52,
    x: 0, y: 5, z: 0, yaw: 0, direction: {x: 0, z: 1},
    root: tree, tree, length: branch ? 3.1 : 0,
    approach: {x: 0, y: 6, z: 9}, exit: {x: -13, y: 11, z: 13}
  };
  const world = {height: () => 0, clearance: () => 0, waterLevel: 0, windField: {direction: {x: 1, z: 0}}};
  let bend = 0;
  const habitat = {
    select() {}, clearance: () => 0, surface: () => 0, resolveRoute: () => site,
    flexBranch(site, load, dt) { bend += (-load * .17 - bend) * (1 - Math.exp(-18 * dt)); return bend; }
  };
  const s = {
    x: 0, y: 7, z: 20, yaw: 0, pitch: 0, bank: 0, airspeed: 15, path: -.12,
    wingExtension: 1, effort: 0, brakeSpread: 0, elapsed: 0, verticalSpeed: 0,
    distance: 0, phase: 0, turnTrim: 0
  };
  const context = {currentTime: 0};
  const buffers = new Map(), clips = [];
  const engine = {play(buffer, position, opt) {
    assert.equal(buffer.name, opt.label);
    assert.ok(Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z));
    const source = {alive: true, endsAt: context.currentTime + .23, stop() { this.alive = false; }};
    clips.push({position, ...opt, t: context.currentTime, source});
    return source;
  }};
  function load(name) {
    const file = fs.readFileSync(asset(name + '.m4a'));
    assert.equal(file.subarray(4, 8).toString(), 'ftyp');
    assert.ok(file.length < 27_000);
    buffers.set(name, {name});
  }
  const flight = makePerchFlight(THREE, world, habitat, {perch: site, approach: site.approach});
  const audio = makePerchAcoustics(context, engine, world, region, load, buffers);
  flight.reset(s, true);
  flight.land(s);
  const events = new Map();
  let landed = null;
  for (let i = 0; i < 3000; i++) {
    const dt = 1 / 120;
    flight.advance(s, dt, input);
    context.currentTime += dt;
    if (i % 4 === 0) audio.update(s, {wetness, gust, canopyMotion: gust, perchStage: flight.stage, perch: site});
    for (const cue of s.perchSound) events.set(cue.id, cue);
    if (flight.stage === 'perched') {
      landed ??= context.currentTime;
      if (context.currentTime - landed > 2.5) flight.push(s);
    }
    if (flight.stage === 'free') break;
  }
  assert.equal(flight.stage, 'free');
  assert.equal(s.perchSoundSite, null);
  audio.reset();
  const cues = [...events.values()];
  assert.equal(cues[0].kind, 'touchdown');
  assert.equal(cues.at(-1).kind, 'release');
  assert.ok(cues.some(cue => cue.kind === 'step' && Math.abs(cue.foot) === 1));
  assert.equal(cues.filter(cue => cue.kind === 'strain').length, branch ? 2 : 0);
  assert.equal(clips.filter(clip => clip.label === `perch-${substrate}`).length, cues.filter(cue => cue.kind !== 'strain').length);
  assert.equal(clips.filter(clip => clip.label.startsWith('perch-creak-')).length, branch ? 2 : 0);
  const canopy = clips.filter(clip => clip.label === (family === 'needle' ? 'perch-needle' : 'perch-leaf'));
  assert.equal(canopy.length, branch && gust > .5 ? 1 : 0);
  if (canopy.length) assert.ok(canopy[0].t > landed + .85 && canopy[0].position.y > site.y);
  const damp = clips.filter(clip => clip.label === 'perch-wet');
  assert.equal(damp.length > 0, wetness > .42 && (substrate === 'sand' || substrate === 'grit'));
  assert.ok(new Set(clips.filter(clip => clip.label === `perch-${substrate}`).map(clip => clip.rate)).size > 2);
}

const forest = new Set(['swiss', 'alaska', 'yosemite', 'crater', 'moosehead', 'winnipesaukee', 'surry']);
for (const region of Object.keys(PERCH_ROUTE_NAMES)) {
  const substrate = forest.has(region) ? 'bark' : region === 'canyon' ? 'grit' : 'stone';
  fly(region, substrate, ['surry', 'winnipesaukee'].includes(region) ? 'broadleaf' : 'needle');
}
fly('acadia', 'sand', null, .84);
fly('labrador', 'grit', null, .83);
fly('alaska', 'ice', null, .80);
fly('moosehead', 'bark', 'needle', 0, .08);
console.log(`Passed event and audio routing for ${Object.keys(PERCH_ROUTE_NAMES).length} world fixtures and four wet, ice, or calm scenarios.`);
