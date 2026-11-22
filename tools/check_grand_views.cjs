// Check the authored departures against flight bounds and native terrain surveys.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const game = path.join(__dirname, '../game');
const window = {};
const context = vm.createContext({ window });
function load(file, exposure = '') {
  const source = fs.readFileSync(path.join(game, file), 'utf8');
  vm.runInContext(source.replace(/}\)\(\);\s*$/, exposure + '\n})();'), context, { filename: file });
}
for (const file of fs.readdirSync(game).filter(name => /^atlas-.*-survey\.js$/.test(name))) load(file);
for (const file of ['alaska-survey.js', 'alpine-survey.js', 'canyon-survey.js', 'scenic-flights.js']) load(file);

function sampleGrid(encoded, left, north, step, units, bilinear = false) {
  const bytes = Uint8Array.from(Buffer.from(encoded, 'base64'));
  const heights = new Int16Array(bytes.buffer);
  const size = Math.sqrt(heights.length);
  const limit = value => Math.max(0, Math.min(size - 1, value));
  return (x, z) => {
    const u = limit((x - left) / step), v = limit((z - north) / step);
    const i = Math.min(size - 2, Math.floor(u)), j = Math.min(size - 2, Math.floor(v));
    const a = u - i, b = v - j, k = j * size + i;
    const nw = heights[k], ne = heights[k + 1], sw = heights[k + size], se = heights[k + size + 1];
    if (bilinear) return ((nw * (1 - a) + ne * a) * (1 - b) + (sw * (1 - a) + se * a) * b) / units;
    if (a + b <= 1) return (nw * (1 - a - b) + ne * a + sw * b) / units;
    return (se * (a + b - 1) + ne * (1 - b) + sw * (1 - a)) / units;
  };
}

function squareBounds(half) {
  return { minX: -half, minZ: -half, maxX: half, maxZ: half };
}
function atlasWorld(region, survey) {
  const profile = window.ATLAS_PROFILES[region] || {};
  const waterLevel = profile.water ?? { crater: 1880.62, lofoten: 0 }[region];
  const bounds = squareBounds((profile.flightHalf || survey.half) - 90);
  if (region === 'acadia') bounds.maxZ = 9780;
  if (region === 'lofoten') bounds.maxZ = 5500;
  if (region === 'crater') bounds.maxX += 520;
  const count = data => Math.sqrt(Buffer.from(data, 'base64').length / 2);
  const near = sampleGrid(survey.terrain, -survey.half, -survey.half, 2 * survey.half / (count(survey.terrain) - 1), 4);
  const far = sampleGrid(survey.outer, -survey.farHalf, -survey.farHalf, 2 * survey.farHalf / (count(survey.outer) - 1), 4);
  const [centerX, centerZ] = survey.innerCenter || [0, 0];
  const tight = survey.inner && sampleGrid(survey.inner, centerX - 1450, centerZ - 1450, 2900 / (count(survey.inner) - 1), 4);
  const elevation = (x, z) => {
    if (Math.max(Math.abs(x), Math.abs(z)) >= survey.half) return far(x, z);
    if (tight && Math.max(Math.abs(x - centerX), Math.abs(z - centerZ)) < 1395) return tight(x, z);
    return near(x, z);
  };
  return { bounds, waterLevel, elevation };
}

const basin = sampleGrid(window.CANYON_SURVEY.basin, -3200, -3200, 8, 8, true);
const bend = sampleGrid(window.CANYON_SURVEY.fine, -1600, -800, 3.125, 8, true);
const worlds = Object.fromEntries(Object.entries(window.ATLAS_SURVEYS).map(([region, survey]) => [region, atlasWorld(region, survey)]));
worlds.alaska = { bounds: squareBounds(6890), waterLevel: 0, elevation: sampleGrid(window.ALASKA_SURVEY.inner, -4800, -4800, 10, 8) };
worlds.swiss = { bounds: squareBounds(3700), waterLevel: 0, elevation: sampleGrid(window.ALPINE_SURVEY.elevation, -4000, -4000, 8, 8) };
worlds.canyon = { bounds: squareBounds(2950), elevation: (x, z) => x > -1568 && x < -32 && Math.abs(z) < 768 ? bend(x, z) : basin(x, z) };

load('yellowstone-world.js', 'window.testYellowstoneElevation = elevationReader;');
const surveyDir = path.join(game, 'yellowstone-data');
const yellowstone = JSON.parse(fs.readFileSync(path.join(surveyDir, 'terrain.json')));
const elevations = new Map([...yellowstone.tiles.map(([x,z]) => `${x}_${z}`),...yellowstone.details.map(([key]) => key)].map(name => {
  const file = Uint8Array.from(fs.readFileSync(path.join(surveyDir, name + '.bin')));
  return [name,new Uint16Array(file.buffer)];
}));
worlds.yellowstone = {bounds:{minX:-5400,maxX:5450,minZ:-11350,maxZ:5730},
  elevation:window.testYellowstoneElevation(yellowstone,elevations)};

const menu = fs.readFileSync(path.join(game, 'world-menu.js'), 'utf8');
const regions = Array.from(menu.matchAll(/^\s{4}([a-z]+):\s*\{\s*name:/gm), match => match[1]);
assert.ok(regions.every(region => worlds[region]), 'Every selectable world has a verified elevation reader');
for (const region of regions) {
  const { bounds, elevation, waterLevel } = worlds[region];
  const margin = (x, z) => Math.min(x - bounds.minX, bounds.maxX - x, z - bounds.minZ, bounds.maxZ - z);
  const surface = (x, z) => Math.max(waterLevel ?? -Infinity, elevation(x, z));
  let target;
  const launch = window.aerieScenicFlight.grandView({
    region, bounds, waterLevel, flightClearance: surface,
    elevation(x, z) {
      target = { x, z };
      return elevation(x, z);
    }
  });
  const { x, y, z, yaw, lookDown } = launch;
  assert.ok(Object.values(launch).every(Number.isFinite), `${region} launch values must be finite`);
  assert.ok(margin(x, z) > 180, `${region} starts outside the automatic turn area`);
  const minimumRise = region === 'yellowstone' ? 430 : 600;
  assert.ok(y - surface(x, z) >= minimumRise - .001, `${region} starts at least ${minimumRise} m above the local surface`);
  assert.ok(lookDown >= 8 && lookDown <= 35, `${region} frames terrain and horizon`);
  assert.ok(margin(target.x, target.z) > 180, `${region} heads to a feature within the flight bounds`);
  const dx = target.x - x, dz = target.z - z;
  assert.ok((-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / Math.hypot(dx, dz) > 0.98, `${region} heads toward the feature`);
  for (let i = 1; i <= 90; i++) {
    const t = i / 100;
    const sightLine = y + (surface(target.x, target.z) - y) * t;
    assert.ok(sightLine > surface(x + dx * t, z + dz * t), `${region} has a clear broad view toward the feature`);
  }
}
console.log(`Grand View bounds, orientation and survey sight lines verified for ${regions.length} worlds`);
