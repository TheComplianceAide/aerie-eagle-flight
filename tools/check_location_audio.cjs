// Regression checks for the changing buffers in live Web Audio graphs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {node, page, makeContext} = require('./check_directional_sound.cjs');
const game = path.join(__dirname, '../game');
const drain = async () => { for (let i = 0; i < 3; i++) await new Promise(r => setImmediate(r)); };

async function flight(region, blocked = [], changes = {}) {
  const context = makeContext(), held = new Map(), requested = new Set();
  const windField = {direction: {x: 1, z: 0}, weatherAt: () => ({rain: region === 'labrador' ? .6 : 0, gust: 0, exposure: 1})};
  const world = {region, height: x => x < 0 ? -2 : 3, waterLevel: 0, windField,
    habitat: {wet: x => x < 0, nearestTree: (x, z) => x > 0 && x < 90 ? {x, z, y: 3, height: 13} : null},
    landmarks: [{name: 'Reine fishing quay', x: 0, z: 0}], waterfalls: {impacts: [{name: 'Nugget Falls', x: 3, z: 0, y: 0}]},
    ...changes};
  const renderer = () => ({initialize: async () => {}, input: node(), output: node()});
  const box = {console, performance, matchMedia: () => ({matches: true}), localStorage: {getItem: () => null, setItem() {}},
    location: {protocol: 'http:', hash: ''}, document: page(), navigator: {onLine: false}, AbortController, URL,
    setTimeout: () => 0, clearTimeout() {}, addEventListener() {}, removeEventListener() {},
    Omnitone: {createFOARenderer: renderer, createHOARenderer: renderer},
    fetch: name => new Promise(resolve => {
      requested.add(name);
      const release = () => resolve({ok: true, arrayBuffer: async () => ({name})});
      if (blocked.includes(name)) held.set(name, release); else release();
    })};
  box.window = box; vm.createContext(box);
  for (const file of ['three.min.js', 'terrain-acoustics.js', 'spatial-audio.js', 'regional-recordings.js', 'soundscapes.js'])
    vm.runInContext(fs.readFileSync(path.join(game, file), 'utf8'), box, {filename: file});
  const scape = box.makeSoundscape(context, world, region, node()); await drain(); scape.setEnabled(true);
  const camera = {position: new box.THREE.Vector3(), quaternion: new box.THREE.Quaternion()};
  function observe(x, z = 0, delta = .8, stage = 'free', y = 10, fixedTime) {
    context.currentTime += delta;
    camera.position.set(x, y, z);
    scape.update({x, y, z, airspeed: stage === 'perched' ? 0 : 13, indicatedAirspeed: 13, elapsed: fixedTime ?? context.currentTime}, camera, delta,
      {perchStage: stage, canopy: x > 0 && x < 90 ? .75 : 0});
  }
  const sources = label => Array.from(scape.engine.sources).filter(s => s.label === label && s.gain > 0);
  return {scape, world, context, requested, observe, sources, held, box};
}

(async () => {
  const rain = await flight('labrador');
  rain.observe(-20);
  const emitters = rain.sources('rain surface');
  assert.equal(emitters.length, 2);
  assert.ok(emitters.every(s => s.buffer.name === 'scape-labrador-rain-on-lake.m4a'));
  rain.observe(20);
  assert.deepEqual(rain.sources('rain surface'), emitters);
  assert.ok(emitters.every(s => s.buffer.name === 'scape-labrador-rain-on-spruce.m4a'));
  rain.observe(200, 0, .3);
  assert.ok(emitters.every(s => s.buffer.name === 'scape-labrador-rain-on-spruce.m4a'), 'a source completes the current crossfade before taking another');
  rain.observe(200);
  assert.ok(emitters.every(s => !s.buffer.name), 'bare rock uses its own impact texture');
  rain.observe(-20);
  assert.ok(emitters.every(s => s.buffer.name === 'scape-labrador-rain-on-lake.m4a'));
  rain.world.windField.weatherAt = () => ({rain: 0, gust: 0, exposure: 1});
  rain.observe(-20);
  assert.equal(rain.sources('rain surface').length, 0);
  rain.world.windField.weatherAt = x => ({rain: x > 100 ? .8 : 0, wetness: .5, gust: 0, exposure: 1});
  rain.observe(20);
  assert.ok(rain.sources('rain front').some(s => s.x > 100), 'rain on the approaching side is audible from that direction');
  assert.ok(rain.sources('wet canopy drips').length, 'wet canopy continues to drip after local rain stops');
  rain.observe(20, 0, .8, 'perched');
  assert.equal(rain.scape.acousticState().speed, 0, 'on a perch the previous indicated airspeed does not mask wildlife');
  assert.equal(rain.scape.engine.masker, 0);
  rain.scape.setEnabled(false);
  assert.equal(rain.sources('rain front').length, 0, 'pausing retires the passing rain source');

  const recording = 'scape-alaska-nugget-falls.m4a';
  const alaska = await flight('alaska', [recording]);
  alaska.scape.adopt('cascade', {name: 'fallback', duration: 5});
  alaska.observe(3);
  const found = alaska.sources('falls')[0];
  assert.equal(found.buffer.name, 'fallback');
  const previous = found.source;
  alaska.held.get(recording)(); await drain();
  alaska.observe(3);
  assert.equal(alaska.sources('falls')[0], found);
  assert.equal(found.buffer.name, recording);
  assert.ok(previous.onended && found.source !== previous, 'the fading input retires independently of the spatial source');
  assert.equal(found.images.length, 2, 'echo graph survives the switch');

  const norway = await flight('lofoten');
  norway.observe(-980, 0);
  assert.equal(norway.sources('shore').length, 0, 'shore sound must not follow below open-water flight');
  norway.observe(-20, 0);
  const shore = norway.sources('shore')[0];
  assert.ok(shore && Math.abs(shore.x) < 2);
  assert.equal(shore.buffer.name, 'landscape-lofoten-nusfjord-lap.m4a');
  norway.observe(-20, 960);
  assert.equal(norway.sources('shore')[0], shore);
  assert.equal(shore.buffer.name, 'landscape-lofoten-fredvang-surf.m4a');
  const shoreLevel = shore.gain;
  norway.observe(-20, 960, 4);
  assert.ok(Math.abs(shore.gain - shoreLevel) > .01, 'swell changes shore sound at a stationary observer');
  norway.context.currentTime += norway.scape.acousticState().spacing + .01;
  const quietCaller = {alive: true, gain: .6, endsAt: norway.context.currentTime + 2};
  norway.scape.noteVoice(quietCaller, 1.5);
  assert.equal(norway.scape.canVoice(), false, 'another incidental caller waits through the foreground phrase and its tail');
  const alarm = {alive: true, gain: .6, endsAt: norway.context.currentTime + 1, stop() { this.alive = false; }};
  norway.scape.noteVoice(alarm, .7, true);
  assert.ok(quietCaller.gain < .2 && alarm.gain === .6, 'a nearby alarm can answer immediately while the older incidental call recedes');
  norway.context.currentTime += 4;
  assert.equal(norway.scape.canVoice(), true);
  norway.scape.setEnabled(false);
  assert.equal(norway.sources('shore').length, 0, 'muting retires the active regional water source');
  assert.equal(alarm.alive, false, 'muting retires a positioned alarm even without a hush radius');

  const lake = await flight('moosehead');
  assert.ok(!Array.from(lake.requested).some(n => n.startsWith('voice-')), 'regional wildlife is not a startup download');

  const db = (a, b) => 20 * Math.log10(a / b);
  const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < .04, `expected ${expected} dB, got ${actual.toFixed(3)} dB`);
  alaska.world.height = () => 152;
  alaska.observe(490, 0, .8, 'perched', 162, 12);
  const trail = alaska.sources('falls')[0].gain;
  alaska.world.height = () => 762;
  alaska.observe(490, 0, .8, 'perched', 772, 12);
  close(db(alaska.sources('falls')[0].gain, trail), -10);

  const canyon = await flight('canyon');
  canyon.observe(-20, 0, .8, 'perched', 130, 12);
  const high = canyon.sources('river')[0].gain;
  canyon.observe(-20, 0, .8, 'perched', 10, 12);
  close(db(canyon.sources('river')[0].gain, high), 5.2);

  const notch = await flight('dixville');
  const wind = speed => ({direction: {x: 1, z: 0}, weatherAt: () => ({windX: speed, windZ: 0, gust: .3, exposure: 1})});
  notch.world.windField = wind(4);
  notch.observe(20);
  const low = notch.scape.ambientWindTrim;
  notch.world.windField = wind(10);
  notch.observe(20);
  close(db(notch.scape.ambientWindTrim, low), 6);

  for (const [region, expected] of [['labrador', -3.3], ['moosehead', -1.4]]) {
    const coast = await flight(region);
    coast.scape.adopt('lake', {name: 'reference lake', duration: 5});
    coast.world.sunDirection = {y: .5};
    coast.observe(-20, 0, .8, 'perched', 10, 12);
    const daylight = coast.sources('shore')[0].gain;
    coast.world.sunDirection.y = -.25;
    coast.observe(-20, 0, .8, 'perched', 10, 12);
    close(db(coast.sources('shore')[0].gain, daylight), expected);
  }

  const quietWaterfront = await flight('winnipesaukee', [], {landmarks: [
    {name: 'Weirs Beach Boardwalk', x: 22, z: 1000}, {name: 'Alton Bay Water Bandstand', x: 20, z: 0},
  ]});
  quietWaterfront.observe(20, 0);
  assert.equal(quietWaterfront.requested.has('scape-road-pass.m4a'), false, 'quiet Alton does not download Weirs traffic');
  quietWaterfront.observe(20, 1000); await drain();
  quietWaterfront.observe(20, 1000);
  assert.equal(quietWaterfront.sources('scape-road-pass').length, 1);
  quietWaterfront.observe(20, 0);
  assert.equal(quietWaterfront.sources('scape-road-pass').length, 0, 'traffic leaves the mix outside the developed waterfront');

  const keene = await flight('surry', [], {landmarks: [{name: 'Central Square', x: 65, z: 1000}]});
  keene.observe(40, 915); await drain();
  keene.observe(40, 915);
  assert.equal(keene.sources('scape-road-pass').length, 1);
  keene.observe(40, 915, .8, 'free', 500);
  assert.equal(keene.sources('scape-road-pass').length, 0, 'street activity falls out of reach on a high glide');

  const alpine = await flight('swiss');
  const fall = alpine.world.waterfalls.impacts[0];
  fall.width = 5;
  alpine.observe(3, 0, .8, 'perched', 10, 12);
  const thin = alpine.sources('falls')[0].gain / (.55 + 40 / 160 + 5 / 80);
  fall.width = 34;
  alpine.observe(3, 0, .8, 'perched', 10, 12);
  const broad = alpine.sources('falls')[0].gain / (.55 + 40 / 160 + 34 / 80);
  close(db(broad, thin), 3.04);

  const surf = await flight('lofoten');
  const setSeaGust = gust => { surf.world.windField.weatherAt = () => ({gust, exposure: 1, windX: 4.5, windZ: 0}); };
  setSeaGust(0);
  surf.observe(-20, 960, .8, 'perched', 10, 12);
  const openSeaCalm = surf.sources('shore')[0].gain;
  setSeaGust(1);
  surf.observe(-20, 960, .8, 'perched', 10, 12.12);
  const openSeaRough = surf.sources('shore')[0].gain;
  setSeaGust(0);
  surf.observe(-20, 0, .8, 'perched', 10, 12);
  const harborCalm = surf.sources('shore')[0].gain;
  setSeaGust(1);
  surf.observe(-20, 0, .8, 'perched', 10, 12.12);
  close(db(openSeaRough, openSeaCalm) - db(surf.sources('shore')[0].gain, harborCalm), 6);

  const rock = (x, z) => x < 48 || Math.abs(z) > 80 ? 0 : Math.min(160, (x - 48) * 40);
  const cliffs = await flight('canyon', [], {height: rock});
  cliffs.observe(0, 0, .8, 'perched', 10);
  assert.ok(cliffs.scape.engine.walls.length, 'a low listener sees the cliff beyond flat ground');
  const facing = cliffs.scape.engine.walls[0], ear = {x: 0, y: 10, z: 0};
  const makePath = (source, listener = ear) => cliffs.box.aerieCliffReturn(cliffs.world, source, listener, facing);
  const returnPath = makePath(ear);
  assert.ok(returnPath && Math.abs(Math.hypot(returnPath.x, returnPath.y - ear.y, returnPath.z) / 343 - .28) < .015,
    'the low call returns directionally from the real cliff after its round-trip delay');
  assert.equal(makePath({x: 63, y: 10, z: 0}), null, 'a source behind the face has no specular path');
  assert.equal(makePath({x: 0, y: 170, z: 0}, {x: 0, y: 170, z: 0}), null, 'no return above the cliff lip');
  assert.equal(makePath({x: 0, y: 10, z: 190}), null, 'no return past the end of the face');
  cliffs.world.height = (x, z) => x > 18 && x < 28 ? 36 : rock(x, z);
  assert.equal(makePath(ear), null, 'an intervening ridge blocks the two real reflection legs');
  cliffs.world.height = rock;
  cliffs.world.groundCover = () => 1;
  const wooded = makePath(ear);
  assert.ok(wooded.strength < returnPath.strength && wooded.cutoff < returnPath.cutoff, 'vegetation weakens and darkens the cliff return');
  const wall = cliffs.scape.engine.loop(cliffs.scape.buffers.get('scape-canyon-colorado-river'), ear,
    {label: 'reflection witness', echo: true});
  cliffs.observe(0, 0, .8, 'perched', 10);
  assert.ok(wall.images.some(s => s.gain > 0 && s.reflectionCutoff < 10000), 'the acoustic graph uses the screened return');
  const clamp = value => Math.max(0, Math.min(1, value));
  const foothill = x => Math.max(0, x) * .065 + 160 * clamp((x - 125) / 5);
  cliffs.world.height = foothill;
  assert.ok(cliffs.box.aerieEchoSurfaces(cliffs.world, ear, true).some(face => face.x > 125),
    'an earlier gentle rise cannot hide a real cliff farther along the ray');
  const narrow = x => 160 * Math.min(clamp((x - 48) / 4), clamp((61 - x) / 4));
  cliffs.world.height = narrow;
  const narrowFace = cliffs.box.aerieEchoSurfaces(cliffs.world, ear, true)[0];
  assert.ok(narrowFace && cliffs.box.aerieCliffReturn(cliffs.world, ear, ear, narrowFace),
    'a thin ridge still shows its exposed near face');
  console.log('Passed location audio, land and water field trims, local traffic loading, and finite cliff paths.');
})().catch(error => { console.error(error); process.exitCode = 1; });
