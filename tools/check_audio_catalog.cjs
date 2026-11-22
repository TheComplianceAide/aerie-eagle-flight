// Verify the reachable recording inventory and protect regional assignments.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const dir = path.join(__dirname, '../game');
const context = vm.createContext({window: {}});
function expose(file, expression) {
  let source = fs.readFileSync(path.join(dir, file), 'utf8');
  const end = source.lastIndexOf('})();');
  if (expression) source = source.slice(0, end) + '\n' + expression + '\n' + source.slice(end);
  vm.runInContext(source, context, {filename: file});
}
expose('field-audio.js', 'window.audioCheck = {scenes, species, defaultTiming, playerCalls, aacCalls};');
expose('soundscapes.js'); expose('perch-acoustics.js'); expose('game-ranges.js'); expose('regional-recordings.js');
const {scenes, species, defaultTiming, playerCalls, aacCalls} = context.window.audioCheck;
const scapes = context.window.aerieSoundscapes, banks = context.window.aerieRegionalRecordings;
const field = id => `field-${id}.${aacCalls.has(id) ? 'm4a' : 'mp3'}`;
const player = new Set([...playerCalls.map(field), 'eagle-wing-a.m4a', 'eagle-wing-b.m4a', 'eagle-wing-c.m4a', 'wind-at-ears.m4a']);
const mammalCalls = new Set(['moose', 'white-tailed-deer', 'red-deer', 'alpine-ibex', 'desert-bighorn', 'eurasian-otter']);
const baseline = {alaska:33, canyon:30, swiss:31, yosemite:34, crater:33, lofoten:29, acadia:24, dixville:36, labrador:35, winnipesaukee:33, surry:36, moosehead:35};
const report = {};
for (const [region, profile] of Object.entries(scenes)) {
  const spec = scapes[region], clips = new Map();
  const add = (name, type) => { if (!clips.has(name)) clips.set(name, type); };
  for (const name of player) add(name, 'player');
  for (const id of Object.values(profile.beds)) add(field(id), 'habitat');
  for (const id of [...profile.birds, ...profile.animals]) {
    const timing = defaultTiming(id);
    if (species[id] && (timing.idle || timing.alarm)) add(field(id), 'wildlife');
  }
  if (profile.birds.includes('loon-moosehead')) add(field('maine-loon-reply'), 'wildlife');
  for (const id of context.window.aerieLandWildlife.regions[region].animals) {
    if (mammalCalls.has(id)) add(field('land-' + id), 'wildlife');
  }
  for (const entry of [spec.falls, spec.surge, ...(spec.fallTakes || []), ...(spec.water || []), ...(spec.beds || []), ...(spec.loops || [])]) {
    if (entry?.clip) add(entry.clip + '.m4a', entry.kind === 'traffic' ? 'traffic' : 'habitat');
    for (const alternate of entry?.alternates || []) add(alternate + '.m4a', 'habitat');
  }
  for (const entry of [...(spec.choruses || []), ...(spec.events || [])]) {
    for (const id of [entry.clip].flat()) add(id + '.m4a', /salmon|bird|chipmunk|[a-z]-(?:owl|frog|cricket)/.test(id) ? 'wildlife' : 'event');
  }
  for (const suffix of spec.rainSurfaces || []) add(`scape-${region}-rain-on-${suffix}.m4a`, 'habitat');
  if (spec.rainAmbience) add(spec.rainAmbience + '.m4a', 'habitat');
  if (spec.storm) for (const name of ['rain-steady','scape-crater-rain-approach','scape-crater-thunder-near','scape-crater-thunder-far']) add(name + '.m4a', 'habitat');
  assert.equal(player.size, 14);
  const beforeNewWildlife = clips.size;
  for (const bank of banks[region] || []) {
    assert.ok(bank.clips.length && ['canopy','understory','meadow','cliff','water','shore'].includes(bank.habitat));
    assert.ok(['day','night','any'].includes(bank.period));
    assert.ok(region !== 'acadia' || bank.period !== 'day', 'Acadia stays at night');
    for (const id of bank.clips) {
      assert.ok(id.startsWith(`voice-${region}-`), `${id} belongs in ${region}`);
      add(id + '.m4a', 'wildlife');
    }
  }
  if (!process.argv.includes('--counts-only')) {
    assert.ok(clips.size >= 2 * baseline[region], `${region} only has ${clips.size} eligible sounds, needs ${2 * baseline[region]}`);
    for (const file of clips.keys()) assert.ok(fs.existsSync(path.join(dir, file)), `${region} is missing ${file}`);
  }
  const localizedWildlife = clips.size - beforeNewWildlife;
  const perchSounds = context.window.aeriePerchRecordingIds(region);
  for (const id of perchSounds) {
    const file = id + '.m4a';
    add(file, 'perch contact');
    assert.ok(fs.existsSync(path.join(dir, file)), `${region} is missing ${file}`);
  }
  report[region] = {baseline: baseline[region], total: clips.size, beforeNewWildlife, localizedWildlife, perchSounds: perchSounds.length, files: Object.fromEntries(clips)};
}
const reused = new Map();
for (const {files} of Object.values(report)) for (const [file, role] of Object.entries(files)) {
  assert.ok(!reused.has(file) || role !== 'habitat', `shared nonwildlife recording ${file}`);
  reused.set(file, role);
}
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else console.table(Object.fromEntries(Object.entries(report).map(([id, {files, ...stats}]) => [id, stats])));
