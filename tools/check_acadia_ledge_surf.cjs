// Validate one continuous native ocean surface across the measured low-flying reaches.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'../game');
const T=require(path.join(root,'three.min.js')),window={};
const fetch=async name=>{
  const raw=fs.readFileSync(path.join(root,name));
  return {ok:true,arrayBuffer:async()=>raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength)};
};
async function check(){
  const context=vm.createContext({window,fetch,console});
  for(const file of ['acadia-baker-dance.js','acadia-ledge-surf.js','regional-landforms.js'])
    vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
  await Promise.all([window.prepareAcadiaLedgeField(),window.prepareBakerSlabs(),...['eggrock','bakerisland'].map(id=>window.aerieRegionalLandforms.prepare(id))]);
  const sites=['eggrock','bakerisland'].map(id=>window.aerieRegionalLandforms.get(id));
  const height=(x,z)=>{const tile=sites.find(({rect:[l,t,r,b]})=>x>=l&&x<=r&&z>=t&&z<=b);return tile?tile.sample(x,z):-11;};
  const scene=new T.Scene();
  const mat=new T.ShaderMaterial({vertexShader:'mirrorCoord = modelMatrix * vec4( position, 1.0 );\n modelViewMatrix * vec4( position, 1.0 )',
    fragmentShader:'vec3 n=normalize(vec3(slope.x,1.,slope.y));\nfloat white=oceanSurf*(1.-gorge)*(1.-.92*soundings)*shoaling*(breaker*aerated+backwash);'});
  const original=new T.PlaneGeometry(38400,38400,64,64),water=new T.Mesh(original,mat);
  const surf=window.makeAcadiaLedgeSurf(T,scene,water,height);
  surf.lightWater();
  assert.ok(mat.vertexShader.includes('wavePoint.z+=')&&!mat.vertexShader.includes('vec4( position, 1.0 )'));
  assert.ok(mat.fragmentShader.includes('float localFoam=')&&mat.fragmentShader.includes('geometric.xz/geometric.y'));
  const tris=[];
  for(const [x,z] of [[4012,-3850],[-474,9213]]){
    surf.update(1,{x,y:2,z});const current=water.geometry;assert.notEqual(current,original);
    const pos=current.attributes.position,ind=current.index.array,edges=new Map();let projectedArea=0;
    for(let i=0;i<ind.length;i+=3){
      const [a,b,c]=ind.subarray(i,i+3);
      const dx=pos.getX(b)-pos.getX(a),dy=pos.getY(b)-pos.getY(a),ex=pos.getX(c)-pos.getX(a),ey=pos.getY(c)-pos.getY(a);
      const area=(dx*ey-dy*ex)/2;assert.ok(area>0,'ocean triangle winding/area '+area);projectedArea+=area;
      for(const [u,v] of [[a,b],[b,c],[c,a]]){
        const key=Math.min(u,v)*65536+Math.max(u,v);edges.set(key,(edges.get(key)||0)+1);
      }
    }
    assert.ok(Math.abs(projectedArea-38400**2)<1.);
    assert.equal([...edges.values()].filter(n=>n===1).length,256);
    assert.ok([...edges.values()].every(n=>n===1||n===2));
    assert.equal(scene.children.filter(o=>o.isPoints&&o.visible).length,1);
    assert.ok(scene.children.find(o=>o.isPoints&&o.visible).geometry.attributes.position.count>80);
    assert.equal(window.makeAcadiaLedgeSurf.bedWeight(x,z),1);
    const ranges=[];
    for(let j=0;j<25;j++)for(const [dx,dz] of [[-15,3],[5,13],[-24,8],[2,21]]){
      const sea=surf.seaSurface(x+dx,z+dz,j/3);assert.ok(Number.isFinite(sea)&&Math.abs(sea)<1.3);ranges.push(sea);
    }
    assert.ok(Math.max(...ranges)-Math.min(...ranges)>.14);
    tris.push(ind.length/3);
    surf.update(7,{x,y:1200,z});assert.equal(water.geometry,original);
    assert.equal(scene.children.filter(o=>o.isPoints&&o.visible).length,0);
  }
  const slab=window.makeBakerSlabs(T,scene,new T.ShaderMaterial(),sites[1].sample);
  assert.ok(slab.geometry.index.count/3>4800);
  const b=slab.geometry.boundingSphere;assert.ok(b.radius<130&&Math.abs(b.center.z-9213)<45);
  console.log('Water grid areas, manifold boundaries, wet-bed transition, return to offshore geometry, both coastal spray sources, local foam and granite edge mesh passed.',tris);
}
check().catch(e=>{console.error(e);process.exitCode=1;});
