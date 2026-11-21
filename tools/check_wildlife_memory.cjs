const assert = require('node:assert/strict');
const path = require('node:path');
const game = process.env.AERIE_TEST_GAME || path.resolve(__dirname, '../game');
const staged = process.env.AERIE_WILDLIFE_CODE || game;
global.window = globalThis;
const T = require(path.join(game,'three.min.js'));
require(path.join(game,'game-ranges.js'));
require(path.join(staged,'wildlife-tracks.js'));
require(path.join(staged,'land-wildlife.js'));
window.makeLandModels = () => ({begin(){}, end(){}, draw(){return true;}, haulout(){return ()=>0;}});
const ground = ()=>0;
for (const [region, profile] of Object.entries(window.aerieLandWildlife.regions)) {
  const [x,z] = profile.anchor;
  const world = {region, spawn:{x,y:4,z}, launches:{}, landmarks:[], height:ground, clearance:ground,
    waterLevel:region==='lofoten' ? 0 : -1, bounds:{minX:-30000,minZ:-30000,maxX:30000,maxZ:30000},
    sunDirection:{x:.69,y:.3,z:.53}, habitat:{wet:()=>false,surface:ground,clearance:ground,nearestTree:()=>null}};
  const scene=new T.Scene(), land=window.makeLandWildlife(T,scene,world);
  land.prepare();
  let t=0, tracked=null, key;
  // Find an ordinary streamed resident, rather than the always-resident curated herd.
  for(let i=1;i<=20&&!tracked;i++){
    const p={x:x+i*225,y:7,z:z+400};
    land.update(p,t+=2);
    for(const [candidate,g] of land.herds){
      if(!g.curated&&g.animals.length){key=candidate;tracked=g.animals[0];break;}
    }
  }
  assert.ok(tracked,region);
  const approach=()=>({x:tracked.x+3,y:tracked.feetY+5,z:tracked.z+1});
  land.update(approach(),t+=2);
  for(let n=0;n<130;n++)land.update(approach(),t+=.1);
  const owner=tracked.residentId;
  const born=[...land.tracks.tiles.values()].flat().find(row=>row.author===owner);
  assert.ok(born,region+' has no steps from '+owner);
  const gear=scene.getObjectByName('Resident wildlife tracks');
  assert.ok(gear.visible&&gear.count>0,region+' trace render');
  const position={x:tracked.x,z:tracked.z},phase=tracked.phase,wary=tracked.waryUntil;
  land.update({x:tracked.x+1300,y:7,z:tracked.z},t+=2);
  assert.equal(land.herds.has(key),false,region+' stream did not evict');
  assert.equal(gear.visible,false);
  land.update({...position,y:7},t+=14);
  const restored=land.herds.get(key)?.animals.find(a=>a.residentId===owner);
  assert.equal(restored,tracked,region+' changed the resident');
  assert.notEqual(restored.phase,phase,region+' resumed at the old animation frame');
  assert.equal(restored.waryUntil,wary);
  assert.ok([...land.tracks.tiles.values()].some(tile=>tile.includes(born)));
  assert.ok(gear.visible&&gear.count>0,region+' missing returning trace');
  land.update({x:x+3000,y:9,z:z+3000},t+1800);
  assert.ok(![...land.tracks.tiles.values()].some(tile=>tile.includes(born)),region+' expired trace survives');
  land.update(world.spawn,0);
  assert.equal(land.tracks.tiles.size,0,region+' flight reset');
}
console.log('Resident identity, behaviour clock and visible, expiring footfalls survive a streaming round trip in all 12 region profiles.');
