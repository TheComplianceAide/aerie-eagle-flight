// Exercise the same coastal survey, structure and lens geometry used by Explore.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname,'../game');
const T = require(path.join(root,'three.min.js'));
const window = {};
async function fetchAsset(name) {
  const bytes = await fs.readFile(path.join(root,name));
  return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
}
async function check() {
  const context = vm.createContext({window,fetch:fetchAsset,console});
  for(const file of ['regional-landforms.js','acadia-station-optics.js','acadia-light-stations.js'])
    vm.runInContext(await fs.readFile(path.join(root,file),'utf8'),context);
  await Promise.all(['eggrock','bakerisland'].map(k=>window.aerieRegionalLandforms.prepare(k)));
  await window.prepareAcadiaStationCrowns();
  const sites=['eggrock','bakerisland'].map(k=>window.aerieRegionalLandforms.get(k));
  assert.ok(sites.every(Boolean));
  const ground=(x,z)=>{const s=sites.find(({rect:[l,t,r,b]})=>x>l&&x<r&&z>t&&z<b);return s?s.sample(x,z):0;};
  const scene=new T.Scene(), texture=()=>new T.Texture();
  const water={material:new T.ShaderMaterial()};
  const stations=window.makeAcadiaLightStations(T,scene,ground,texture,water);
  const terrainMaterial=new T.ShaderMaterial({uniforms:{aerial:{value:null}},vertexShader:'void main(){wp=position;}',fragmentShader:'void main(){}'});
  for(const site of sites){
    const group=site.add(T,scene,terrainMaterial,()=>-.8,texture);
    const near=group.children.filter(o=>!o.userData.distantIsland),far=group.children.find(o=>o.userData.distantIsland);
    assert.ok(near.length&&far.visible&&!near.some(o=>o.visible));
    const s=site.rect;group.userData.updateDetail({x:(s[0]+s[2])/2,z:(s[1]+s[3])/2});
    assert.ok(!far.visible&&near.every(o=>o.visible));
    assert.ok(group.userData.aerieLandform.horizonFaces<group.userData.aerieLandform.faces*.2);
  }
  stations.lightWater();
  const geometryRay=new T.Raycaster(),dir=new T.Vector3(0,-1,0);
  scene.updateMatrixWorld(true);
  for(const [key,s] of Object.entries(stations.sites)){
    const [x,focus,z]=s.lamp;
    const top=stations.roof(x,z);
    assert.ok(top>focus+1.2 && top<focus+2.1,key+' top '+top);
    const group=scene.children.find(o=>o.name.startsWith(key==='egg'?'Egg Rock · 1875':'Baker Island · 1855'));
    geometryRay.set(new T.Vector3(x,90,z),dir);
    assert.ok(Math.abs(geometryRay.intersectObject(group,true)[0].point.y-top)<.002);
    const on=s.period-s.phase+.22,off=on+1.65;
    assert.ok(stations.signal(on,s)>.99 && stations.signal(off,s)===0);
    assert.ok(Math.abs(stations.signal(on,s)-stations.signal(on+s.period,s))<.00001);
    stations.update(on,{x,z});assert.equal(water.material.uniforms[key+'Pulse'].value,1);
    stations.update(off,{x,z});assert.equal(water.material.uniforms[key+'Pulse'].value,0);
  }
  for(const [x,z,expected] of [[-720.80,8774.66,29.17],[-725.70,8810.40,27.61]]){
    assert.ok(Math.abs(stations.roof(x,z)-expected)<.02,'Baker Island service building '+x);
  }
  const atlas=await fs.readFile(path.join(root,'atlas-worlds.js'),'utf8');
  assert.ok(atlas.includes('float dep=1.-exp('));
  assert.ok(window.acadiaIslandSurface('float dep=1.-exp(', 'localUV', 'aerial').includes('vec3 localGround='));
  let total=0;stations.plant((tree,fir)=>{
    assert.ok(fir&&tree.height>=3.7&&tree.height<40&&tree.width>.7&&tree.y>.7);
    assert.ok(!Number.isFinite(stations.roof(tree.x,tree.z)));total++;
  });
  assert.ok(total>=4000&&total<9000);assert.equal(stations.roof(0,0),-Infinity);
  console.log('Both surveyed islands, coastal detail transitions, 5/10 s signals, gallery/ray heights and '+total+' measured crown positions checked.');
}
check().catch(e=>{console.error(e);process.exitCode=1;});
