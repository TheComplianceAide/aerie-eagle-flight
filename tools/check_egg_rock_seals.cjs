// Check the actual Egg Rock surface, instance transforms and visible wildlife
// identities through a full breathing cycle, a streaming round trip and reset.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const game = process.env.AERIE_SEAL_GAME || path.resolve(__dirname, '../game');
const shared = process.env.AERIE_SEAL_SURVEY || game;
const T = require(path.join(shared, 'three.min.js'));
const window = {};
async function fetchAsset(file) {
  const data=await fs.readFile(path.join(shared, file));
  return {ok:true,arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)};
}
(async()=>{
  const context={window,fetch:fetchAsset,console,Math,DataView,Uint16Array,Uint8Array,Int16Array,Uint32Array};
  const terrain=await fs.readFile(path.join(shared, 'regional-landforms.js'),'utf8');
  vm.runInNewContext(terrain,context);
  vm.runInNewContext(await fs.readFile(path.join(game,'acadia-ledge-surf.js'),'utf8'),context);
  vm.runInNewContext(await fs.readFile(path.join(game,'acadia-harbor-seals.js'),'utf8'),context);
  await Promise.all([window.aerieRegionalLandforms.prepare('eggrock'),window.prepareAcadiaLedgeField()]);
  const island=window.aerieRegionalLandforms.get('eggrock');
  T.TextureLoader.prototype.load=()=>new T.Texture();
  const world={landmarks:[],elevation:island.sample,waterLevel:0};
  const scene=new T.Scene(),pulses=[];
  const ocean=new T.Mesh(new T.PlaneGeometry(38400,38400,64,64),new T.ShaderMaterial());
  ocean.position.y=.16;
  const surf=window.makeAcadiaLedgeSurf(T,scene,ocean,island.sample);
  const player={x:3986,y:6,z:-3868};
  surf.update(0,player);
  const water=(x,z,t)=>island.sample(x,z)<.08?surf.seaSurface(x,z,t):-Infinity;
  const seals=window.makeAcadiaHarborSeals(T,scene,world,water,(actor,t)=>pulses.push([actor.residentId,t]));
  assert.equal(world.landmarks.length,1);
  const distant=scene.getObjectByName('Egg Rock · distant harbor seals');
  const mesh=scene.getObjectByName('Egg Rock · harbor seals');
  const wake=scene.getObjectByName('Egg Rock · swimming seal bow wake');
  assert.ok(mesh.isInstancedMesh&&mesh.geometry.index.count>6000);
  assert.ok(mesh.userData.prepareFlightMaterial);
  const matrices=new T.Matrix4();
  const first=seals.update(player,0).slice();
  assert.equal(first.length,5);
  const resident=first.filter(a=>a.behavior==='hauled out');
  assert.equal(resident.length,4);
  const surface=island.surfacePatch(3996,-3868.5,32,island.sample);
  const unique=new Set(resident.map(a=>a.residentId));
  assert.equal(unique.size,4);
  resident.forEach((a,i)=>{
    mesh.getMatrixAt(i,matrices);
    const [x,y,z]=new T.Vector3().setFromMatrixPosition(matrices).toArray();
    assert.ok(Math.abs(surface(x,z)+.004-y)<.001,'actual triangle support for '+a.residentId);
    assert.ok(y>.4&&y<2.6);
    assert.ok(a.length>=1.4&&a.length<=1.8);
    assert.ok(seals.contains(x,z));
  });
  assert.equal(seals.contains(-84,490),false);
  const swimmer=first.find(a=>a.behavior==='surfacing'),history=new Set();
  assert.ok(swimmer);
  let lowWake=Infinity,highWake=-Infinity;
  for(let i=0;i<=56*30;i++){
    const t=i/30;
    const sighted=seals.update(player,t),visible=sighted.includes(swimmer);
    assert.equal(visible,wake.visible);
    assert.equal(visible,swimmer.behavior==='surfacing');
    if(visible){
      assert.ok(swimmer.y>water(swimmer.x,swimmer.z,t)+.043);
      const {x,y,z}=wake.position;
      assert.ok(Math.abs(y-water(x,z,t)-.033)<.00001,'wake stays on the passing wave');
      lowWake=Math.min(lowWake,y);highWake=Math.max(highWake,y);
    }
    history.add(visible);
    assert.ok(mesh.count===4||mesh.count===5);
    assert.ok(mesh.instanceMatrix.array.every(Number.isFinite));
  }
  assert.equal(history.size,2);
  assert.ok(highWake-lowWake>.10,'wave crest and trough both reached the swimming seal');
  assert.equal(pulses.length,2);
  const transit=seals.update({x:3905,y:15,z:-3868},58);
  assert.equal(distant.visible,true);assert.equal(mesh.visible,false);
  assert.ok(distant.geometry.index.count/mesh.geometry.index.count<.14);
  assert.ok(transit.includes(resident[0]));assert.equal(distant.count,mesh.count);
  assert.equal(seals.update({x:0,y:80,z:0},60).length,0);
  assert.equal(mesh.parent.visible,false);
  assert.equal(seals.update(player,0)[0],resident[0]);
  assert.ok(mesh.parent.visible);
  console.log('Egg Rock: four model poses on surveyed triangles, one diving and resurfacing animal, stable IDs, wet-only bow wake and two breath rings.');
})().catch(e=>{console.error(e);process.exitCode=1;});
