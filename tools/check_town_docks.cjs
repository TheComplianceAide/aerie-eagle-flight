const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const game = path.join(__dirname, '..', 'game');
const T = require(path.join(game, 'three.min.js'));
const window = {};
const context = vm.createContext({window, atob});
for (const file of ['winnipesaukee-town-docks-data.js', 'survey-parked-cars.js', 'winnipesaukee-town-docks.js']) {
  vm.runInContext(fs.readFileSync(path.join(game, file), 'utf8'), context);
}
T.TextureLoader.prototype.load = () => new T.Texture();
const level = 153.11;
const scene = new T.Scene();
const landing = window.makeWinniTownDocks(T, scene, () => level + .9, level);
landing.finish();
let piers = 0, boats = 0, parked = 0;
for (const [place, site] of Object.entries(window.winniTownDocks)) {
  assert.ok(site.approach.every(Number.isFinite));
  for (const [x1,z1,x2,z2] of site.docks) {
    const deck = landing.supportHeight((x1+x2)/2,(z1+z2)/2);
    assert.ok(deck >= level+.695, place+' has an unreachable dock');
    piers++;
  }
  for (const [x,z] of site.cars) {
    assert.ok(landing.supportHeight(x,z)>level+2.2, place+' has no vehicle contact');
    parked++;
  }
  for (const [x,z] of site.boats) {
    assert.ok(landing.supportHeight(x,z)>level+.85, place+' has no mooring contact');
    boats++;
  }
  const navy = scene.children.filter(o => o.name.startsWith('Town landing · '+place+'-mooring-'));
  assert.equal(navy.length,site.boats.length);
  const b = navy[0], initial = b.position.y;
  landing.updateBoats(1,{x:b.position.x,z:b.position.z},{sample(x,y,z,t,a){a.windX=3.4;a.windZ=-1.9;}});
  assert.ok(b.position.y!==initial && b.rotation.x!==0 && b.rotation.z!==0);
  const [x,z] = site.cars[0];
  assert.ok(landing.managedGround(x,z,3.5));
}
for (const o of scene.children) {
  assert.ok(o.geometry.boundingSphere.radius>0 && Number.isFinite(o.geometry.boundingSphere.radius));
}
const f = window.winniTownDocks.wolfeboro;
assert.equal(Object.keys(f.roofScans).length,8);
const r={base:level+1.1,center:f.fronts.avery};
landing.registerRoof(r);
assert.ok(r.measuredHeight(...r.center)-r.base>10.8 && r.measuredHeight(...r.center)-r.base<12.7);
assert.equal(landing.supportHeight(0,0),-Infinity);
assert.equal(landing.managedGround(0,0,12),false);
assert.equal(boats,8);
assert.equal(piers,28);
assert.equal(parked,47);
console.log('Verified',piers,'piers,',boats,'independently moving boats,',parked,'registered cars, eight surveyed roofs and both park clearance fields.');
