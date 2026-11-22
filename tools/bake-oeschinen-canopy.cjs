#!/usr/bin/env node
// Usage: node tools/bake-oeschinen-canopy.cjs INPUT.json
// INPUT is the authorized, LV95-registered source package. Raw rasters stay offline.
const fs=require('node:fs'), path=require('node:path'),vm=require('node:vm');
const {inflateSync,gzipSync}=require('node:zlib'), {createHash}=require('node:crypto');
const root=path.join(__dirname,'..'),source=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const bounds=source.lv95Bounds??source.utmBounds??source.bounds, origin=source.lv95Origin??source.utmOrigin??source.origin;
const west=2618300,south=1146300,east=2625700,north=1153700,half=3700;
if(JSON.stringify(bounds)!==JSON.stringify([west,south,east,north])||JSON.stringify(origin)!==JSON.stringify([2622000,1150000]))throw Error('Wrong LV95 window');
const sha=buf=>createHash('sha256').update(buf).digest('hex');
const layer=name=>{
  const v=source.layers[name],bytes=inflateSync(Buffer.from(v.dataBase64Zlib,'base64'));
  if(sha(bytes)!==v.rawSha256||v.step*v.width!==2*half||v.step*v.height!==2*half)throw Error('Wrong byte hash/extent: '+name);
  if(bytes.length!==v.width*v.height*(v.dtype==='<u2'?2:1)||!['u1','<u2'].includes(v.dtype))throw Error('Wrong byte count/type: '+name);
  return {...v,read(x,z){const i=Math.floor((x+half)/v.step),j=Math.floor((z+half)/v.step);
    if(i<0||j<0||i>=v.width||j>=v.height)return v.nodata;
    const at=j*v.width+i;
    return v.dtype==='<u2'?bytes.readUInt16LE(2*at):bytes[at];
  }};
};
const [ch,red,nir,scl]=['canopy','red','nir','scl'].map(layer);
const positive=v=>v>0&&v!==ch.nodata&&v<255;
const survey=vm.runInNewContext(fs.readFileSync(path.join(root,'game/alpine-survey.js'),'utf8')+';window.ALPINE_SURVEY',{window:{}});
const ground=Buffer.from(survey.elevation,'base64'),native=Buffer.from(survey.canopy,'base64');
const G=i=>ground.readInt16LE(i*2);
function height(x,z){
  const n=1001,u=(x+4000)/8,v=(z+4000)/8,i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j,t=j*n+i;
  return (a+b<=1?G(t)+a*(G(t+1)-G(t))+b*(G(t+n)-G(t)):G(t+n+1)+(1-a)*(G(t+n)-G(t+n+1))+(1-b)*(G(t+1)-G(t+n+1)))/8;
}
const rings=survey.shore;
function inWater(x,z){
  if(x< -890||x>925||z< -220||z>775)return false;
  let inside=false;
  for(let i=0,j=rings.length-1;i<rings.length;j=i++){const [ax,az]=rings[i],[bx,bz]=rings[j];
    if((az>z)!==(bz>z)&&x<ax+(bx-ax)*(z-az)/(bz-az))inside=!inside;}
  return inside;
}
const hash=(x,z,k)=>{let n=Math.imul(x+6151,73856093)^Math.imul(z+41193,19349663)^Math.imul(k+29003,83492791);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
const cellKey=(a,b)=>(a+1024)*4096+b+1024,nativeBins=new Map();
const put=(bins,x,z,w)=>{const key=cellKey(Math.floor(x/16),Math.floor(z/16)),a=bins.get(key)??[];a.push({x,z,w});bins.set(key,a);};
const near=(bins,x,z,f=1)=>{const a=Math.floor(x/16),b=Math.floor(z/16);
  for(let i=a-1;i<=a+1;i++)for(let j=b-1;j<=b+1;j++)for(const rec of bins.get(cellKey(i,j))??[]){
    if((x-rec.x)**2+(z-rec.z)**2<Math.max(6.1,rec.w*.71*f)**2)return true;
  }return false;
};
for(let p=0;p+5<native.length;p+=6){
  const x=native.readInt16LE(p),z=native.readInt16LE(p+2),h=native.readInt16LE(p+4)*.1;
  if(h<5.8||Math.abs(x)>half+16||Math.abs(z)>half+16)continue;
  put(nativeBins,x,z,h*.39);
}
const stats={cells:0,mask4:0,positiveCanopyPixels:0,coarseEligible:0,densityRejected:0,nativeSpacingRejected:0,belowLakeOrAboveTreeline:0,slopeRejected:0,candidatesBeforeCaps:0};
for(let z=-half+5;z<half;z+=10)for(let x=-half+5;x<half;x+=10){stats.cells++;if(scl.read(x,z)===4)stats.mask4++;}
for(let z=-half+ch.step/2;z<half;z+=ch.step)for(let x=-half+ch.step/2;x<half;x+=ch.step)if(positive(ch.read(x,z)))stats.positiveCanopyPixels++;
const tiles=new Map();const step=9;
for(let iz=0;iz<Math.ceil(2*half/step);iz++)for(let ix=0;ix<Math.ceil(2*half/step);ix++){
  const x=-half+(ix+.23+.55*hash(ix,iz,3))*step,z=-half+(iz+.23+.55*hash(ix,iz,4))*step;
  if(Math.max(Math.abs(x),Math.abs(z))>half-20||scl.read(x,z)!==4)continue;
  const r=red.read(x,z),n=nir.read(x,z),v=(n-r)/(n+r);
  if(r===red.nodata||n===nir.nodata||!Number.isFinite(v)||v<.44||!positive(ch.read(x,z)))continue;
  const vals=[],ds=ch.step;
  for(const [a,b] of [[0,0],[ds,0],[-ds,0],[0,ds],[0,-ds],[ds,ds],[-ds,-ds]]){
    const d=ch.read(x+a,z+b);if(positive(d))vals.push(d);
  }
  if(vals.length<4)continue;
  vals.sort((a,b)=>a-b);const h=vals[Math.floor(vals.length*.64)];
  if(h<5.4)continue;stats.coarseEligible++;
  const y=height(x,z);
  if(y<1.7||y>770||inWater(x,z)){stats.belowLakeOrAboveTreeline++;continue;}
  if(Math.hypot(height(x+4,z)-height(x-4,z),height(x,z+4)-height(x,z-4))/8>1.08){stats.slopeRejected++;continue;}
  if(near(nativeBins,x,z)){stats.nativeSpacingRejected++;continue;}
  const sparseChance=y>515?.48:.24;
  if(hash(ix,iz,7)<sparseChance){stats.densityRejected++;continue;}
  const ht=Math.max(4.2,Math.min(24,h*(.83+.28*hash(ix,iz,19)))),wd=ht*(.30+.16*hash(ix,iz,11));
  const a=Math.floor((x+half)/128),b=Math.floor((z+half)/128),k=a+64*b;
  const tile=tiles.get(k)??{a,b,values:[]};tiles.set(k,tile);
  tile.values.push({x,z,ht,wd,score:hash(ix,iz,49)+.12*(v-.44)/.56,seed:hash(ix,iz,29)});
  stats.candidatesBeforeCaps++;
}
// Stable cap that keeps spatial distribution. Native clearance/safe shore is checked again in-engine.
const cap=10000,perTile=70;
const collection=[...tiles.values()].sort((s,t)=>s.b-t.b||s.a-t.a),finalBins=new Map();
let kept=0;
for(const tile of collection){tile.values.sort((a,b)=>b.score-a.score);tile.final=[];}
for(let rank=0;rank<perTile&&kept<cap;rank++){
  const ordered=collection.slice().sort((a,b)=>hash(a.a,a.b,rank+80)-hash(b.a,b.b,rank+80));
  for(const tile of ordered){
    const rec=tile.values[rank];if(!rec||near(finalBins,rec.x,rec.z,.65))continue;
    put(finalBins,rec.x,rec.z,rec.wd);tile.final.push(rec);if(++kept===cap)break;
  }
}
const selected=collection.filter(q=>q.final.length);
const file=Buffer.alloc(12+selected.length*4+kept*7);
file.write('OEC1');file.writeUInt32LE(kept,4);file.writeUInt16LE(selected.length,8);file.writeUInt16LE(128,10);
let pos=12;
for(const tile of selected){
  file.writeUInt8(tile.a,pos);file.writeUInt8(tile.b,pos+1);file.writeUInt16LE(tile.final.length,pos+2);pos+=4;
  for(const q of tile.final){
    file.writeUInt16LE(Math.round((q.x+half-tile.a*128)*16),pos);file.writeUInt16LE(Math.round((q.z+half-tile.b*128)*16),pos+2);
    file.writeUInt8(Math.round(q.ht*8),pos+4);file.writeUInt8(Math.round(q.wd*16),pos+5);file.writeUInt8(Math.floor(q.seed*255),pos+6);pos+=7;
  }
}
if(pos!==file.length)throw Error('Bad pack size');
const packed=gzipSync(file,{level:9});
const sanitizedLayer=layer=>Object.fromEntries(Object.entries(layer).filter(([k])=>!k.includes('dataBase64')&&k!=='read'));
const meta={scheme:'OEC1',crs:'EPSG:2056',lv95Bounds:bounds,localBounds:[-half,-half,half,half],origin,
  optical:source.sentinel,canopy:sanitizedLayer(ch),inputs:Object.fromEntries([['red',red],['nir',nir],['scl',scl]].map(([k,v])=>[k,sanitizedLayer(v)])),
  rules:{sampleSpacingM:step,minNDVI:.44,minModeledHeightM:5.4,maxTreeHeightM:24,stockProtected:true,cap,perTile,waterAndSlopeRecheckedAtRuntime:true},stats:{...stats,kept,tiles:selected.length,inflatedBytes:file.length,gzipBytes:packed.length,packSha256:sha(packed)}};
fs.writeFileSync(path.join(root,'game/oeschinen-canopy.bin'),packed);
fs.writeFileSync(path.join(root,'game/oeschinen-canopy-meta.json'),JSON.stringify(meta,null,2)+'\n');
console.log(meta.stats);
