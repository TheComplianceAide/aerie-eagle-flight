// Count source-level regional assignments. Run from anywhere with Node.js.
// A source specimen keeps one identity across tints, cell seeds and LODs.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const game = path.join(__dirname, '../game');
const read = file => fs.readFileSync(path.join(game, file), 'utf8');
const context = vm.createContext({window: {}, atob: v => Buffer.from(v, 'base64').toString('latin1')});
function inspect(file, before, exports) {
  const source = read(file);
  if (!source.includes(before)) throw Error('Update inventory hook for ' + file);
  vm.runInContext(source.replace(before, 'window.inventory = {' + exports + '};\n' + before), context);
  return context.window.inventory;
}
const plants = inspect('regional-habitat.js', '  function newEngland', 'localPlant, willow, alder, climates, openLand, LAND');
const {palettes} = inspect('regional-growth.js', '  function specimen', 'palettes');
const {profiles, soils} = inspect('understory.js', '  window.aerieFieldShader', 'profiles, soils');
for (const f of ['plant-models.js','talus-data.js']) vm.runInContext(read(f),context);
function modelIds(file) {
  const raw = zlib.gunzipSync(fs.readFileSync(path.join(game, 'canopy-data', file)));
  return [...new Set(JSON.parse(raw.subarray(4,4+raw.readUInt32LE()).toString()).map(r=>r.m))].sort();
}
const base = modelIds('specimens.bin'), pilot = modelIds('sitka-forms.bin');
const rays = context.window.aeriePlants;
if (base.join()!=='0,1,2,3,4' || rays.length!==7) throw Error('Update specimen selectors for the changed source library');
const water = new Set(['moosehead','winnipesaukee','surry','dixville','labrador']);
const talus = new Set(['alaska','swiss','canyon','dixville','yosemite']);
const source = [];
for (const region of Object.keys(profiles)) {
  vm.runInContext(read('habitat-data/'+region+'.js'),context);
  const classify=plants.openLand(region),[half,n]=context.window.aerieLandClasses[region],land=new Set();
  for(let i=0;i<n;i++)for(let j=0;j<n;j++)land.add(classify(((i+.5)*2/n-1)*half,((j+.5)*2/n-1)*half));
  const taxa=new Map();
  for(const kind of land)for(const height of [20,280,480,620,1200,1890,2000,2210,2400])
    for(const wet of [false,true])for(const conifer of [false,true])for(let sample=0;sample<100;sample++){
      const spec=plants.localPlant(region,height,wet,conifer,(sample+.5)/100,kind);taxa.set(spec.name,spec.family);
    }
  if(land.has(plants.LAND.shrub)){
    const s=region==='alaska'?plants.alder:plants.willow;
    // Generated scrub replaces only non-shrub assignments; every Canyon and
    // Lofoten shrub-class result already selects a regional shrub.
    const needsFallback=[0,.3,.7,.99].some(s=>[true,false].some(needles=>
      plants.localPlant(region,300,false,needles,s,plants.LAND.shrub).family!=='shrub'));
    if(needsFallback)taxa.set(s.name,s.family);
  }
  const families=new Set(taxa.values());
  const treeForms=Number(families.has('broad'))+3*Number(families.has('needle'));
  const shrubForms=Number(families.has('shrub'));
  const understory=profiles[region][0].flatMap((v,i)=>v>0?[i]:[]);
  const enabled=understory.filter(i=>rays[i].p).length;
  const rock=talus.has(region)?context.window.talusScans.length:0;
  const rush=Number(water.has(region));
  const partial=treeForms+shrubForms+palettes[region].length+rush+enabled+soils[region].length+rock+1;
  source.push({region,treeForms,shrubForms,pilotTreeForms:region==='alaska'?pilot.length:0,
    taxa:[...taxa.entries()].sort(([a],[b])=>a.localeCompare(b)),
    growth:[...palettes[region]],understory,enabled,rush,soils:[...soils[region]],talus:rock,perch:1,partial});
}
console.log(JSON.stringify(source,null,2));
