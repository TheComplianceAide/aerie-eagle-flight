// Regression checks for the changing buffers in live Web Audio graphs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {node, page, makeContext} = require('./check_directional_sound.cjs');
const game = path.join(__dirname, '../game');
const drain = async () => { for (let i = 0; i < 3; i++) await new Promise(r => setImmediate(r)); };

async function flight(region, blocked = []) {
  const context = makeContext(), held = new Map(), requested = new Set();
  const windField = {direction: {x: 1, z: 0}, weatherAt: () => ({rain: region === 'labrador' ? .6 : 0, gust: 0, exposure: 1})};
  const world = {region, height: x => x < 0 ? -2 : 3, waterLevel: 0, windField,
    habitat: {wet: x => x < 0, nearestTree: (x, z) => x > 0 && x < 90 ? {x, z, y: 3, height: 13} : null},
    landmarks: [{name: 'Reine fishing quay', x: 0, z: 0}], waterfalls: {impacts: [{name: 'Nugget Falls', x: 3, z: 0, y: 0}]}};
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
  function observe(x, z = 0, delta = .8) {
    context.currentTime += delta;
    camera.position.set(x, 10, z);
    scape.update({x, y: 10, z, airspeed: 13, elapsed: context.currentTime}, camera, delta);
  }
  const sources = label => Array.from(scape.engine.sources).filter(s => s.label === label && s.gain > 0);
  return {scape, world, context, requested, observe, sources, held};
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
  norway.scape.setEnabled(false);
  assert.equal(norway.sources('shore').length, 0, 'muting retires the active regional water source');

  const lake = await flight('moosehead');
  assert.ok(!Array.from(lake.requested).some(n => n.startsWith('voice-')), 'regional wildlife is not a startup download');
  console.log('Passed rain surface, late waterfall, coastal position and crossfade, mute cleanup, and lazy wildlife loading checks.');
})().catch(error => { console.error(error); process.exitCode = 1; });
