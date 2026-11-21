// The water should meet the same triangles that draw Hamnøy's tidal rock.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');

const game = path.resolve(process.env.AERIE_HAMNOY_GAME || path.join(__dirname, '..', 'game'));
const shared = path.resolve(process.env.AERIE_HAMNOY_RUNTIME || game);
const T = require(path.join(shared, 'three.min.js'));
const window = {};

async function fetchSurvey(asset) {
  const bytes = await fs.readFile(path.join(game, asset));
  return {ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)};
}

(async () => {
  const env = {window, fetch: fetchSurvey, console, Math, DataView, Uint16Array, Uint8Array, Uint32Array, Int16Array};
  vm.runInNewContext(await fs.readFile(path.join(shared, 'regional-landforms.js'), 'utf8'), env);
  vm.runInNewContext(await fs.readFile(path.join(game, 'lofoten-hamnoy.js'), 'utf8'), env);
  await window.aerieRegionalLandforms.prepare('hamnoy');
  const coast = window.aerieRegionalLandforms.get('hamnoy');
  const base = () => -2;
  const harbor = coast.add(T, new T.Scene(), new T.ShaderMaterial(), base, () => new T.Texture());
  const level = .16;
  const water = new T.Mesh(new T.PlaneGeometry(43200, 43200, 64, 64), new T.MeshBasicMaterial());
  water.position.y = level;
  water.rotation.x = -Math.PI / 2;
  water.updateMatrixWorld(true);
  window.fitHamnoyTidalWater(T, water, harbor);

  const firstIndex = water.geometry.index;
  window.fitHamnoyTidalWater(T, water, harbor);
  assert.equal(water.geometry.index, firstIndex, 'repeated preparation keeps the fitted sea surface');
  const surface = coast.surfacePatch(3867, 3146, 137, base);
  const down = new T.Vector3(0, -1, 0);
  const ray = new T.Raycaster();
  function waterCount(x, z) {
    ray.set(new T.Vector3(x, 80, z), down);
    return ray.intersectObject(water, false).length;
  }

  let wet = 0;
  let dry = 0;
  for (let z = 3035.3; z < 3258; z += 7.9) {
    for (let x = 3750.7; x < 3984; x += 8.1) {
      const ground = surface(x, z);
      assert.ok(Number.isFinite(ground), 'complete field coverage');
      if (Math.abs(ground - level) < .02) continue;
      if (ground > level) {
        assert.equal(waterCount(x, z), 0, 'water crossed exposed rock at ' + x + ', ' + z);
        dry++;
      } else {
        assert.equal(waterCount(x, z), 1, 'a gap or overlap in the intertidal water at ' + x + ', ' + z);
        wet++;
      }
    }
  }
  assert.ok(wet > 50 && dry > 50);
  for (const [x, z] of [[3710.1, 3100.2], [4005.1, 3100.2], [3815.1, 2970.2], [3815.1, 3280.2]]) {
    assert.equal(waterCount(x, z), 1, 'the original fjord surface is continuous around the cut');
  }
  console.log('Hamnøy surveyed tidal rock and continuous fjord surface passed at ' + (wet + dry) + ' locations.');
})().catch(error => {console.error(error); process.exitCode = 1;});
