// Exercise the offline builder and the actual browser decoder against the
// same non-square sample grid, including its odd last row and column.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const context={TextDecoder,TextEncoder,atob,btoa,console:{warn(){}},
  THREE:{BufferAttribute:class{constructor(array,itemSize){this.array=array;this.itemSize=itemSize;this.count=array.length/itemSize;}}}};
context.window=context;vm.createContext(context);
for(const file of ['game/terrain-indices.js','tools/geology/terrain-index/martini.js','tools/geology/terrain-index/bake.js'])
  vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
const nx=137,nz=99,n=(nx+1)*(nz+1),p=new Float32Array(3*n),norm=new Float32Array(3*n);
for(let z=0;z<=nz;z++)for(let x=0;x<=nx;x++){
  const i=3*(x+z*(nx+1));
  p.set([x*12,Math.sin(x*.12)*3+Math.cos(z*.08)*4,z*12],i);
  norm.set([0,1,0],i);
}
const geometry={attributes:{position:{array:p,count:n},normal:{array:norm}}};
const scene={traverse:visit=>visit({userData:{terrainCaster:true},material:{isShaderMaterial:true},name:'',geometry})};
const result=context.bakeTerrainIndexField(scene,'alaska');
assert.equal(result.tiles,1);assert(result.reduced<result.native/2);
const data=Uint8Array.from(Buffer.from(result.bytes,'base64')),fetchBytes=bytes=>async()=>({ok:true,arrayBuffer:async()=>bytes.buffer});
(async()=>{
  const api=context.aerieTerrainIndices;context.fetch=fetchBytes(data);await api.prepare('alaska');
  const alt=api.forGrid('alaska',0,0,nx,nz,geometry);assert(alt);const indices=alt.index.array;
  assert.equal(indices.length,result.reduced*3);
  const used=new Set(indices);
  for(let x=0;x<=nx;x++){assert(used.has(x));assert(used.has(x+nz*(nx+1)));}
  for(let z=0;z<=nz;z++){assert(used.has(z*(nx+1)));assert(used.has(nx+z*(nx+1)));}
  let area=0;
  for(let i=0;i<indices.length;i+=3){
    const [a,b,c]=indices.subarray(i,i+3);
    assert(Math.max(a,b,c)<n);
    const ax=a%(nx+1),az=Math.floor(a/(nx+1)),bx=b%(nx+1),bz=Math.floor(b/(nx+1)),cx=c%(nx+1),cz=Math.floor(c/(nx+1));
    const twiceArea=(bz-az)*(cx-ax)-(bx-ax)*(cz-az);
    assert(twiceArea>0,'Triangle winding');area+=twiceArea/2;
  }
  assert.equal(area,nx*nz,'No grid area lost');
  const native={count:6*nx*nz};
  assert.equal(api.select({index:native},native,alt,0),native);
  assert.equal(api.select({index:native},native,alt,alt.distance+90),alt.index);
  assert.equal(api.select({index:alt.index},native,alt,alt.distance-60),alt.index);
  assert.equal(api.select({index:alt.index},native,alt,alt.distance-90),native);
  p[1]+=.1;assert.equal(api.forGrid('alaska',0,0,nx,nz,geometry),null);p[1]-=.1;
  context.fetch=fetchBytes(data.slice(0,-1));await api.prepare('truncated');
  assert.equal(api.forGrid('truncated',0,0,nx,nz,geometry),null);
  console.log('Verified winding, area, every outer edge, detail transitions, content fingerprint and truncated-pack fallback');
})().catch(error=>{console.error(error);process.exitCode=1;});
