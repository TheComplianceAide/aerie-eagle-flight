const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const game=path.resolve(__dirname,'../game');
global.window=globalThis;
const T=require(path.join(game,'three.min.js'));
// Run the actual instance mesh builders without the browser image decoder.
T.TextureLoader.prototype.load=()=>new T.Texture();
for(const file of ['game-ranges','field-audio','fauna-shapes','land-models',
  'wildlife-tracks','land-wildlife','wildlife-models','wildlife'])
  require(path.join(game,file+'.js'));
window.makeFishSchools=()=>({populate:()=>[],roster:[]});

const expected={
  moosehead:[5,648,-662],winnipesaukee:[5,1210,1854],dixville:[5,-320,-243],
  surry:[6,-1142,-3101],acadia:[2,636,-789],alaska:[3,-424,-476],
  yellowstone:[6,-748,-443],canyon:[6,-322,-32],yosemite:[5,-728,1256],
  crater:[5,-3209,1679],swiss:[3,-613,437],labrador:[4,384,1849],lofoten:[6,923,2104]
};
assert.equal(Object.keys(expected).length,13);
for(const key of ['osprey','double-crested-cormorant','killdeer']){
  const [kind,aspect,rect,depth,file]=window.faunaShapes[key];
  assert.equal(kind,'birds');
  assert.ok(aspect>0 && rect.every(Number.isFinite));
  assert.equal(Buffer.from(depth,'base64').length,49*31);
  assert.ok(fs.statSync(path.join(game,file)).size<8192);
}

let additions=0;
for(const [region,[total,sx,sz]] of Object.entries(expected)){
  const land=window.aerieLandWildlife.regions[region],profile=window.aerieFauna.scenes[region];
  const names=[...land.additions,...(profile.patchWildlife||[]),...(region==='winnipesaukee'?['patch-cormorant']:[])];
  assert.equal(new Set(names).size,total,region);
  additions+=total;
  for(const id of profile.patchWildlife||[]){
    const skin=window.aerieFauna.birds[id]?.[0]||id;
    assert.ok(window.faunaShapes[skin],region+' missing skin '+skin);
  }
  // A repeatable transect through a cold bank, wooded dry ground, and
  // an uphill strip. The geothermal pond overlaps one shore of the river.
  const elevation=region==='alaska'||region==='swiss'?1840:region==='lofoten'?55:185;
  let exposedSea=region==='lofoten';
  const wet=(x,z)=>(exposedSea||z>=sz-28)&&z<=sz+7;
  const height=(x,z)=>wet(x,z)?elevation:elevation+.26*Math.min(170,Math.max(0,z-(sz+9)));
  const poolAt=(x,z)=>region==='yellowstone'&&x>sx+110&&x<sx+160&&z>sz-27&&z<sz+15;
  const tree=(x,z,range)=>!wet(x,z)&&range>=16?{x:x+8,z,y:height(x+8,z),width:6,height:13}:null;
  const world={region,elevation:height,height,clearance:height,waterLevel:elevation,
    spawn:{x:sx+220,z:sz+32,y:elevation+13},launches:{},landmarks:[],
    bounds:{minX:-30000,maxX:30000,minZ:-30000,maxZ:30000},
    sunDirection:{x:.45,y:.5,z:.72},windField:{sample:()=>({windX:0,windZ:0})},
    habitat:{surface:height,clearance:height,wet,nearestTree:tree}};
  if(region==='yellowstone')world.yellowstone={river:{poolAt}};
  if(region==='winnipesaukee')world.landmarks.push({name:'Weirs Beach',x:sx-1400,z:sz+13});
  window.ATLAS_SURVEYS={[region]:{fishing:{x:sx,z:sz}}};
  const scene=new T.Scene(),update=window.addRegionalWildlife(T,scene,world);
  assert.ok(world.launches.wildlife,region+' native departure');
  const seen=new Set();
  function inspect(x,z,t){
    const p={x,z,y:height(x,z)+14};
    update(p,t);
    for(const o of world.wildlife.nearby(p)){
      if(!names.includes(o.id))continue;
      assert.ok(Number.isFinite(o.x+o.y+o.z),region+' finite pose '+o.id);
      assert.ok(!poolAt(o.x,o.z),region+' animal in geothermal pool '+o.id);
      if(o.kind==='Mammal'&&o.actor.family)assert.ok(!wet(o.x,o.z),region+' grounded mammal in water '+o.id);
      if(o.id==='patch-cormorant')assert.ok(Math.abs(o.x-(sx-1400))<240,'cormorant escaped Weirs');
      if(o.id==='gray-seal')assert.ok(o.actor.homeY<=elevation+3.2,'seal above the haul-out zone');
      seen.add(o.id);
    }
  }
  for(let i=-64;i<=64;i++){
    const t=150+(i+64)*4;
    inspect(sx+i*211,sz+13,t);
    inspect(sx+i*211,sz+111,t+2);
  }
  const unresolved=names.filter(id=>!seen.has(id));
  assert.deepEqual(unresolved,[],region+' additions missing through the regular update and nearby entry points');
  if(region==='acadia')assert.ok(!profile.patchWildlife?.length,'default Acadia night contains daytime additions');
  if(region==='alaska')assert.ok(!land.additions.includes('brown-bear'),'a resident salmon school is not a run signal');
  if(region==='lofoten'){
    exposedSea=false;
    const inlet={...world,launches:{},landmarks:[]};
    const sheltered=window.addRegionalWildlife(T,new T.Scene(),inlet);
    const fixture={x:sx,z:sz+14,y:elevation+14};
    for(let i=0;i<20;i++)sheltered({...fixture,x:sx+i*311},i*2);
    for(const site of inlet.wildlife.sites.values())
      assert.ok(!site.flocks.some(f=>f.id==='gray-seal'),'gray seal found shelter instead of exposed sea');
  }
  console.log(region,[...seen].sort().join(', '));
}
assert.equal(additions,61);
console.log('Verified 61 patch placements across the 13 real region profiles on controlled habitat transects.');
