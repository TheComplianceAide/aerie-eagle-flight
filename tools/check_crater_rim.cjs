const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const root = path.join(__dirname, '..', 'game');
const T = require(path.join(root, 'three.min.js'));
const window = {};
const context = vm.createContext({window});
for (const f of ['crater-rim-data.js','crater-rim.js']) vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),context);
const survey=window.craterRimSurvey;
function grid(name) {
  const bytes=fs.readFileSync(path.join(root,'landform-'+name+'.bin'));
  assert.equal(bytes.toString('ascii',0,4),'ARF1');
  const version=bytes.readUInt16LE(4), spacing=bytes.readUInt16LE(6)*(version===2?.25:1);
  const bounds=Array.from({length:4},(_,i)=>bytes.readInt32LE(8+4*i));
  const nx=bytes.readUInt16LE(24),nz=bytes.readUInt16LE(26),datum=bytes.readFloatLE(28),scale=bytes.readFloatLE(32);
  const read=(x,z)=>datum+scale*bytes.readInt16LE(40+2*(Math.round((x-bounds[0])/spacing)+nx*Math.round((z-bounds[1])/spacing)));
  return {read,bounds,bytes,nx,nz,version};
}
const top=grid('watchman'),cove=grid('cleetwood');
assert.deepEqual([...survey.watchman.rect],top.bounds);
assert.deepEqual([...survey.cleetwood.rect],cove.bounds);
assert.ok(top.read(-3943,379)>2435 && top.read(-3943,379)<2451);
assert.ok(cove.read(2903,-3428)<1880.78);
const scene=new T.Scene(),sky=new T.Texture();
const site=window.makeCraterRimSites(T,scene,()=>new T.Texture(),sky,(x,z)=>(x<0?top:cove).read(x,z));
assert.ok(scene.children.length<15 && scene.children.every(o=>o.geometry.boundingSphere.radius>0));
assert.ok(Math.abs(site.roof(-3942.83,379.27)-2450.57)<.005);
assert.ok(site.roof(2889,-3434)>1881 && site.roof(2889,-3434)<1882);
assert.ok(site.roof(2931,-3420)===-Infinity);
assert.ok(site.blocksLooseClutter(-3948,380) && !site.blocksLooseClutter(-3650,380));
assert.ok(survey.watchman.trees.length>200 && survey.cleetwood.trees.length>890);
assert.ok(survey.cleetwood.crib.length>80);
assert.ok(survey.cleetwood.shore.length>130);
for (const [x0,z0,y0,x1,z1,y1,h] of survey.cleetwood.crib) {
  assert.ok(Math.hypot(x1-x0,z1-z0)<4.2 && Math.abs(y1-y0)<3 && h>=.85 && h<=1.5);
}
const parent=grid('crater'), b=parent.bytes;
let offset=40+2*parent.nx*parent.nz, faces=0;
for(let i=0;i<b.readUInt32LE(36);i++){
  const nv=b.readUInt32LE(offset),nt=b.readUInt32LE(offset+4),start=offset+8,indices=start+10*nv;
  for(let j=0;j<nt;j++) {
    let cx=0,cz=0;
    for(let k=0;k<3;k++) {
      const vertex=start+6*b.readUInt16LE(indices+6*j+2*k);
      cx+=b.readUInt16LE(vertex)/3;cz+=b.readUInt16LE(vertex+2)/3;
    }
    cx+=parent.bounds[0];cz+=parent.bounds[1];
    assert.ok(!(cx>top.bounds[0]+.5 && cx<top.bounds[2]-.5 && cz>top.bounds[1]+.5 && cz<top.bounds[3]-.5),'Older triangle inside new summit');
    faces++;
  }
  offset=indices+nt*6;
}
assert.ok(faces>10000);
console.log('Surveyed summit, lake bed, parent cut, vegetation, trail cribbing, historic roof and floating dock passed');
