const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const game = path.join(__dirname, '..', 'game');
const T = require(path.join(game, 'three.min.js'));
const window = {};
const context = vm.createContext({ window, atob });
T.TextureLoader.prototype.load = () => new T.Texture();
function read(name) {
  vm.runInContext(fs.readFileSync(path.join(game, name), 'utf8'), context);
}
read('lake-habitat.js');
let trees = 0, buildings = 0;
for (const region of ['moosehead', 'winnipesaukee']) {
  read('lake-habitat-' + region + '.js');
  window.makeBuildingFittings = () => () => {};
  const scene = new T.Scene();
  scene.userData.buildingLight = { finish() {} };
  const habitat = window.makeLakeHabitat(T, scene, region, () => 156, 153.11);
  let localTrees = 0;
  habitat.plantCrowns((tree, fir, measured) => {
    assert.equal(measured, true);
    assert.equal(typeof fir, 'boolean');
    assert.ok(habitat.ownsTree(tree.x, tree.z));
    assert.ok(tree.y === 156 && tree.height > 5 && tree.height < 51 && tree.width > 0);
    localTrees++;
  });
  for (const site of Object.values(window.aerieLakeHabitatData[region])) {
    assert.equal(atob(site.coverage).length, Math.ceil(site.cols ** 2 / 8));
    assert.equal(atob(site.trees).length % 10, 0);
    for (const roof of site.buildings) {
      assert.ok(['laser', 'plan-only'].includes(roof.fit));
      assert.ok(roof.eave > 0 && roof.rise >= 0 && roof.halfWidth > 0);
      // One line in a multi-wing footprint can cross an open courtyard.
      // Test points just inside its boundaries, including such concave plans.
      const hits = roof.p.map(([x,z]) => habitat.roofHeight(
        x*.99 + roof.center[0]*.01, z*.99 + roof.center[1]*.01
      )).filter(Number.isFinite);
      assert.ok(hits.length && hits.every(y=>y>156));
      buildings++;
    }
  }
  assert.equal(habitat.ownsTree(1e6,1e6),false);
  assert.equal(habitat.roofHeight(1e6,1e6),-Infinity);
  for (const obj of scene.children) {
    assert.ok(obj.geometry.boundingSphere.radius>0 && Number.isFinite(obj.geometry.boundingSphere.radius));
  }
  trees+=localTrees;
}
// The interlocked stems, triangle covers and cadastral data must all survive a rebuild.
assert.ok(trees>12000 && buildings>490);
console.log('Checked',trees,'measured crowns and',buildings,'shoreline buildings.');
