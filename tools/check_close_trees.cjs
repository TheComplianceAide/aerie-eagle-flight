// Load every shipped vegetation pack through the game's decoder, including the
// largest near meshes. Browser flybys separately exercise textures and shaders.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const THREE = require('../game/three.min.js');
const catalog = require('../game/canopy-data/regional-vegetation.json');
const game = path.join(__dirname, '../game');

global.window = globalThis;
window.matchMedia = () => ({ matches: false });
window.getCanopyWind = () => ({ glsl: '', uniforms: {} });
window.aerieCanopyProfile = () => ({});
global.fetch = async name => new Response(await fs.readFile(path.join(game, name)));
THREE.TextureLoader.prototype.loadAsync = async name => {
  const texture = new THREE.Texture();
  texture.name = name;
  return texture;
};
require('../game/moosehead-crowns.js');
require('../game/close-tree-detail.js');
require('../game/close-bark-material.js');
require('../game/canopy-stream.js');

const renderer = { capabilities: { isWebGL2: false, getMaxAnisotropy: () => 1 } };
async function checkRegion(region) {
  const scene = new THREE.Scene();
  const stream = window.makeCanopyStream(THREE, renderer, scene, { region, trees: [] });
  try {
    await stream.ready;
    const stats = stream.stats();
    assert.ok(stats.ready, region + ': ' + stats.error);
    const sheets = catalog.filter(sheet => sheet.region === region);
    if (region === 'moosehead') sheets.push(window.mooseheadMatureCanopy);
    const byId = new Map(sheets.map(sheet => [sheet.id, sheet]));
    const pending = new Set(sheets.flatMap(s => s.cells.map((_, i) => s.id + '/' + i)));
    const count = pending.size;
    scene.traverse(mesh => {
      const source = mesh.userData.aerieRegional;
      if (!source) return;
      const geometry = mesh.geometry;
      const detail = geometry.userData.closeTreeDetail;
      if (source.lod !== 'near') {
        assert.equal(detail, undefined, 'Approach geometry changed on a more distant tree');
        assert.equal(mesh.material.defines.CLOSE_SCANNED_BARK, undefined);
        return;
      }
      const label = source.sheet + '/' + source.cell;
      assert.ok(pending.delete(label), 'Unexpected or duplicate near mesh ' + label);
      assert.ok(detail?.addedTriangles > 0, 'Missing close foliage on ' + label);
      const sheet = byId.get(source.sheet);
      const family = sheet.families?.[source.cell] || sheet.family;
      const bark = mesh.material.uniforms.closeBark?.value;
      if (family === 'brush') assert.equal(bark, undefined, label);
      else {
        const expected = family === 'broad' ? 'hardwood' : 'pine';
        assert.equal(bark?.name, 'canopy-data/close-bark-' + expected + '.webp', label);
        assert.equal(bark.wrapT, THREE.RepeatWrapping, label);
      }
      const vertices = geometry.getAttribute('position').count;
      assert.equal(geometry.getAttribute('normal').count, vertices, label);
      assert.equal(geometry.getAttribute('uv').count, vertices, label);
      assert.equal(geometry.getAttribute('surface').count, vertices, label);
      for (const index of geometry.index.array) assert.ok(index < vertices, label);
    });
    assert.deepEqual([...pending], [], 'Missing near meshes in ' + region);
    return count;
  } finally {
    stream.dispose();
  }
}

(async () => {
  const fallback = await window.aerieCloseBark.load(async name => {
    if (name.includes('pine')) throw new Error('Optional texture unavailable');
    return new THREE.Texture();
  }, THREE);
  assert.equal(fallback.pine, null);
  assert.equal(fallback.hardwood.wrapS, THREE.RepeatWrapping);
  fallback.hardwood.dispose();
  const regions = new Set(catalog.map(s => s.region));
  let count = 0;
  for (const region of regions) count += await checkRegion(region);
  console.log('Verified ' + count + ' close tree and shrub meshes across ' + regions.size + ' worlds.');
})().catch(error => { console.error(error); process.exitCode = 1; });
