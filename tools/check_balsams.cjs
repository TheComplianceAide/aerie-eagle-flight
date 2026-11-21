// Checks real mesh and collision agreement at the measured roofs and both
// openings of the historical gate. No WebGL context or image download is needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const game = path.join(__dirname, '..', 'game');
const THREE = require(path.join(game, 'three.min.js'));
const page = {window: {}};
vm.createContext(page);
for (const file of ['dixville-resort.js', 'dixville-hale.js', 'dixville-resort-park.js']) {
  vm.runInContext(fs.readFileSync(path.join(game, file), 'utf8'), page);
}

const groups = new Map();
function material() {
  const m = new THREE.MeshBasicMaterial({side: THREE.DoubleSide});
  m.normalScale = new THREE.Vector2();
  m.map = {};
  groups.set(m, []);
  return m;
}
function tri(mat, a, b, c) {
  groups.get(mat).push(...a, ...b, ...c);
}
function face(mat, a, b, c, d) {
  tri(mat, a, b, c);
  tri(mat, a, c, d);
}
function frame(x, y, z, angle=0) {
  const co = Math.cos(angle), si = Math.sin(angle);
  return (u, v, w) => [x + u*co - w*si, y + v, z + u*si + w*co];
}
function block(f, l, d, base, top, wall, cap=wall) {
  const ring = [[-l/2,-d/2],[l/2,-d/2],[l/2,d/2],[-l/2,d/2]];
  const floor=ring.map(([u,v])=>f(u,base,v)), lid=ring.map(([u,v])=>f(u,top,v));
  for(let i=0;i<4;i++){
    const j=(i+1)%4;
    face(wall,floor[i],floor[j],lid[j],lid[i]);
  }
  face(cap,...lid);
}
const geometry = {material, tri, face, block, frame, image:()=>({}), detail:()=>{}, elevation:()=>571.9, scene:{userData:{buildingLight:{glaze:()=>{}}}}};
const hotel = page.window.makeDixvilleHampshireHouse(THREE, geometry);
const hale = page.window.makeDixvilleHale(THREE, geometry);
const meshes=[];
for(const [mat,positions] of groups) {
  if(!positions.length)continue;
  const buffer=new THREE.BufferGeometry();
  buffer.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  meshes.push(new THREE.Mesh(buffer,mat));
}
function highest(x,z) {
  const ray=new THREE.Raycaster(new THREE.Vector3(x,640,z),new THREE.Vector3(0,-1,0));
  return ray.intersectObjects(meshes)[0]?.point.y ?? -Infinity;
}
const near=(a,b,tolerance,message)=>assert.ok(Math.abs(a-b)<=tolerance,message+' '+a+' / '+b);
const hotelFrame=frame(-178,0,-336,55*Math.PI/180);
for(const [u,v,y] of [[-13.444,-3.148,596.645],[-18.676,6.495,594.279],[-9.799,11.407,594.276],[1.436,-9.029,594.109],[1.435,3.172,594.085],[22.590,-7.328,593.988],[22.552,1.388,594.077],[32.598,-3.891,601.06]]) {
  const [x,,z]=hotelFrame(u,0,v);
  near(hotel(x,z),y,.002,'surveyed roof or mast');
  near(highest(x,z),y,.13,'drawn roof or mast');
}
const arch = frame(-24.87,0,-266.93,-.605);
const center = arch(0,0,0);
assert.equal(hale(center[0],center[2],573.10),-Infinity,'main opening passes below the vault');
near(hale(center[0],center[2],578),highest(center[0],center[2]),.002,'arch support and mesh');
const cross = new THREE.Vector3(Math.sin(-.605),0,-Math.cos(-.605));
function passage(u,h) {
  const p=arch(u,h,1.4);
  return new THREE.Raycaster(new THREE.Vector3(...p),cross,0,3).intersectObjects(meshes).filter(hit=>hit.object.material.name.includes('Hale House ·')&&!hit.object.material.name.includes('wood')).length;
}
assert.equal(passage(0,573.40),0,'main opening is modeled through both faces');
assert.ok(passage(0,576.4)>0,'vault has solid stone above the opening');
assert.equal(passage(2.10,576.98),0,'upper slot is cut through stone');
near(hale(44.35,-194.45),575.38,.001,'garage ridge');
near(highest(44.35,-194.45),575.38,.001,'drawn garage ridge');
near(hale(5.333,-223),578.76,.004,'Hale House ridge');
assert.equal(hale(106,106),-Infinity,'the old NH 26 turnout has no gate');
assert.equal(page.window.dixvilleResortPark.crowns.length,92);
assert.equal(page.window.dixvilleHalePark.crowns.length,29);
console.log('Dixville hotel, cottage, portal, garage and measured crown checks passed.');
