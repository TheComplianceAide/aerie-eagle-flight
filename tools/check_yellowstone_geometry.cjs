const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const T=require('../game/three.min.js');

const game=path.join(__dirname,'../game'),data=path.join(game,'yellowstone-data');
const surface=JSON.parse(fs.readFileSync(path.join(data,'terrain.json')));
const window={matchMedia:()=>({matches:true})};
const context=vm.createContext({window});
function load(name,expose=''){
  const source=fs.readFileSync(path.join(game,name),'utf8');
  vm.runInContext(source.replace(/}\)\(\);\s*$/,expose+'\n})();'),context,{filename:name});
}

load('yellowstone-world.js','window.qaElevation=elevationReader;window.qaHabitat=mappedHabitat;');
load('yellowstone-water.js');
load('yellowstone-features.js','window.qaArchitecture=architecture;');
const keys=[...surface.tiles.map(([x,z])=>`${x}_${z}`),...surface.details.map(([key])=>key)];
const heights=new Map(keys.map(key=>[key,new Uint16Array(Uint8Array.from(fs.readFileSync(path.join(data,key+'.bin'))).buffer)]));
const elevation=window.qaElevation(surface,heights);
const cover=window.qaHabitat(Uint8Array.from(fs.readFileSync(path.join(data,'landfire-cover.bin'))).buffer);
assert.ok(cover.source);
assert.equal(cover.form(-9000,0),0);
assert.equal(cover.cover(0,8500),0);

const scene=new T.Scene(),texture=new T.Texture();
const rocks=window.qaArchitecture(T,scene,surface,elevation,{load:()=>texture});
scene.updateMatrixWorld(true);
const roof=scene.getObjectByName('Yellowstone · mapped timber buildings');
const ray=new T.Raycaster(),down=new T.Vector3(0,-1,0);
let samples=0;
for(const [name,footprint] of surface.buildings){
  const x=footprint.reduce((n,q)=>n+q[0],0)/footprint.length,z=footprint.reduce((n,q)=>n+q[1],0)/footprint.length;
  ray.set(new T.Vector3(x,800,z),down);
  const hit=ray.intersectObject(roof,true).find(p=>/roof/i.test(p.object.name));
  if(!hit)continue;
  assert.ok(rocks.clearance(x,z)>=hit.point.y-.002,`Flight clearance at ${name||`${x},${z}`} reaches the visible roof`);
  samples++;
}
assert.ok(samples>=180);

const water=window.makeYellowstoneWater(T,new T.Scene(),surface,elevation,new T.Vector3(0,1,0),new T.Color(),texture);
for(const p of water.pools){
  for(const [x,z] of p.ring){
    const u=p.x+(x-p.x)*.86,v=p.z+(z-p.z)*.86;
    assert.equal(water.poolAt(u,v).name,p.name);
    assert.ok(water.terrainAt(u,v)<p.level-.1,`${p.name} keeps the bottom under the water`);
  }
}
for(const q of water.reach.filter((_,i)=>i%19===0)){
  const nearest=water.nearest(q.x,q.z);
  if(!nearest||nearest.distance>.5)continue;
  assert.ok(water.terrainAt(q.x,q.z)<nearest.y-.19,'The surveyed channel stays clear at its center');
}
console.log(`Verified ${samples} visible roof samples and ${water.pools.length} modeled pool beds against the shipped surveys`);
