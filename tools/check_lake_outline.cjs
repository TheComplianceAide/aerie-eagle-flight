const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const game=path.join(__dirname,'../game'),context=vm.createContext({window:{}});
const read=file=>vm.runInContext(fs.readFileSync(path.join(game,file),'utf8'),context);
read('atlas-worlds.js');
const index=context.window.makeAtlasWorld.indexLakeOutline;
function previousRing(x,z,pts){
  if(!pts?.length)return true;
  let inside=false;
  for(let i=0,j=pts.length-1;i<pts.length;j=i++){
    const a=pts[i],b=pts[j];
    if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
let total=0;
function exercise(name,outer,holes=[]){
  const hit=index(outer,holes);
  let seed=0xb173d847;
  const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  function check(x,z){
    const previous=previousRing(x,z,outer)&&!holes.some(loop=>previousRing(x,z,loop));
    assert.equal(hit(x,z),previous,name+' at '+x+', '+z);total++;
  }
  let x0=0,x1=0,z0=0,z1=0;
  for(const loop of [outer||[],...holes])for(let i=0;i<loop.length;i++){
    const [x,z]=loop[i],[nx,nz]=loop[(i+1)%loop.length];
    x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z);
    check(x,z);check((x+nx)/2,(z+nz)/2);
    if(i%13===0){check(x+1e-7,z);check(x-1e-7,z);check(x,z+1e-7);check(x,z-1e-7);}
  }
  for(let i=0;i<600;i++)check(x0-10+rand()*(x1-x0+20),z0-10+rand()*(z1-z0+20));
  for(let k=Math.floor(z0/96)-1;k<=Math.floor(z1/96)+1;k++){
    const x=x0+rand()*(x1-x0);check(x,96*k);check(x,96*k+1e-8);check(x,96*k-1e-8);
  }
}
for(const file of fs.readdirSync(game).filter(n=>/^atlas-.+-survey\.js$/.test(n)))read(file);
for(const [name,survey] of Object.entries(context.window.ATLAS_SURVEYS))exercise(name,survey.shore,survey.shoreHoles);
exercise('empty',null);exercise('empty hole',[],[[]]);
const square=(x,z,size)=>[[x,z],[x+size,z],[x+size,z+size],[x,z+size],[x,z]];
exercise('overlapping islands',square(-192,-192,384),[square(0,-96,92),square(45,-55,100)]);
console.log(total+' old/new shoreline classifications agree, including every native shore and island vertex.');
