#!/usr/bin/env node
// Offline, raster-verifying transfer from source mosaics to bounded candidate packs.
// Usage: node tools/bake-regional-canopy.cjs moosehead|alaska INPUT.json
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {inflateSync,gzipSync}=require('node:zlib'), {createHash}=require('node:crypto');
const [key,input]=process.argv.slice(2), root=path.join(__dirname,'..');
const cfg={moosehead:{origin:[442772,5060090],crs:32619,water:312.23,ceil:810,step:9,cap:8500,tile:70,ndvi:.44},
  alaska:{origin:[526511,6477009],crs:6337,water:0,ceil:610,step:9,cap:8500,tile:70,ndvi:.45}}[key];
if(!cfg)throw Error('Unsupported range');
const source=JSON.parse(fs.readFileSync(input,'utf8'));
const bounds=source.utmBounds??source.bounds,origin=source.utmOrigin??source.origin,originJSON=JSON.stringify(origin);
if(!bounds||originJSON!==JSON.stringify(cfg.origin)||Number(source.epsg??cfg.crs)!==cfg.crs)throw Error('Wrong regional grid registration');
const [w,s,e,n]=bounds,[oe,on]=origin,rect=[w-oe,on-n,e-oe,on-s],[left,top,right,bottom]=rect,span=128;
if(rect.some(v=>!Number.isInteger(v)||Math.abs(v)>31000)||right-left>32600||bottom-top>32600)throw Error('Bad candidate extent');
const sha=buf=>createHash('sha256').update(buf).digest('hex');
const layer=name=>{
 const v=source.layers[name], b=inflateSync(Buffer.from(v.dataBase64Zlib,'base64'));
 if(sha(b)!==v.rawSha256||b.length!==v.width*v.height*(v.dtype==='<u2'?2:1)||v.width*v.step!==e-w||v.height*v.step!==n-s||!['u1','<u2'].includes(v.dtype))throw Error('Bad source layer '+name);
 return {...v,read(x,z){const ix=Math.floor((x-left)/v.step),iz=Math.floor((z-top)/v.step);
 if(ix<0||iz<0||ix>=v.width||iz>=v.height)return v.nodata;
 const i=iz*v.width+ix;return v.dtype==='<u2'?b.readUInt16LE(i*2):b[i];}};
};
const [ch,red,nir,scl]=['canopy','red','nir','scl'].map(layer);
const positive=v=>v>0&&v!==ch.nodata&&v<255;
const surveyPath=key==='moosehead'?'atlas-moosehead-survey.js':'alaska-survey.js', box={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'game',surveyPath),'utf8'),box);
const survey=key==='moosehead'?box.window.ATLAS_SURVEYS.moosehead:box.window.ALASKA_SURVEY;
const broad=Buffer.from(key==='moosehead'?survey.terrain:survey.inner,'base64'),far=Buffer.from(key==='moosehead'?survey.outer:survey.outer,'base64');
function sample(grid,half,x,z,scale){
 const N=Math.round(Math.sqrt(grid.length/2)),u=Math.max(0,Math.min(N-1,(x+half)*(N-1)/(2*half))),v=Math.max(0,Math.min(N-1,(z+half)*(N-1)/(2*half)));
 const i=Math.min(N-2,Math.floor(u)),j=Math.min(N-2,Math.floor(v)),a=u-i,b=v-j,k=j*N+i;
 const H=i=>grid.readInt16LE(i*2);
 return scale*(a+b<=1?H(k)+a*(H(k+1)-H(k))+b*(H(k+N)-H(k)):H(k+N+1)+(1-a)*(H(k+N)-H(k+N+1))+(1-b)*(H(k+1)-H(k+N+1)));
}
const gh=key==='moosehead'?survey.half:7200,fh=key==='moosehead'?survey.farHalf:18000,hs=key==='moosehead'?.25:.125;
const yAt=(x,z)=>Math.max(Math.abs(x),Math.abs(z))<gh?sample(broad,gh,x,z,hs):sample(far,fh,x,z,hs);
const hsh=(x,z,k)=>{let n=Math.imul(x+6151,73856093)^Math.imul(z+41193,19349663)^Math.imul(k+29003,83492791);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
const bins=new Map(),nn=(x,z)=>(((x+4096)*8192)+z+4096);
const posTo=(x,z)=>nn(Math.floor(x/16),Math.floor(z/16));
function put(x,z,r){const k=posTo(x,z),a=bins.get(k)??[];a.push([x,z,r]);bins.set(k,a);}
function near(x,z){const a=Math.floor(x/16),b=Math.floor(z/16);
 for(let i=a-1;i<=a+1;i++)for(let j=b-1;j<=b+1;j++)for(const [tx,tz,r] of bins.get(nn(i,j))??[])
 if((x-tx)**2+(z-tz)**2<r*r)return true;
 return false;
}
if(key==='alaska'){
 const raw=Buffer.from(survey.trees,'base64');
 for(let i=0;i+5<raw.length;i+=6){
  const x=raw.readInt16LE(i),z=raw.readInt16LE(i+2),h=raw.readInt16LE(i+4);
  if(h>4&&x>left-20&&x<right+20&&z>top-20&&z<bottom+20)put(x,z,Math.max(5.2,h*.245));
 }
}
const tiles=new Map(),stats={totalOpticalCells:scl.width*scl.height,eligibleOnGrid:0,nativeSpacingRejected:0,terrainRejected:0,kept:0};
for(let iz=0;iz<Math.ceil((bottom-top)/cfg.step);iz++)for(let ix=0;ix<Math.ceil((right-left)/cfg.step);ix++){
 const x=left+(ix+.23+.55*hsh(ix,iz,3))*cfg.step,z=top+(iz+.23+.55*hsh(ix,iz,4))*cfg.step;
 if(Math.min(x-left,right-x,z-top,bottom-z)<20||scl.read(x,z)!==4||!positive(ch.read(x,z)))continue;
 const r=red.read(x,z),n=nir.read(x,z),v=(n-r)/(n+r);
 if(r===red.nodata||n===nir.nodata||!Number.isFinite(v)||v<cfg.ndvi)continue;
 const vals=[],d=ch.step;
 for(const [i,j] of [[0,0],[d,0],[-d,0],[0,d],[0,-d],[d,d],[-d,-d]]){
  const p=ch.read(x+i,z+j);if(positive(p))vals.push(p);
 }
 if(vals.length<4)continue;vals.sort((a,b)=>a-b);
 const height=vals[Math.floor(vals.length*.64)];
 if(height<5.4||hsh(ix,iz,7)<.25)continue;stats.eligibleOnGrid++;
 const y=yAt(x,z),grade=Math.hypot(yAt(x+4,z)-yAt(x-4,z),yAt(x,z+4)-yAt(x,z-4))/8;
 if(y<cfg.water+1.7||y>cfg.ceil||grade>1.15){stats.terrainRejected++;continue;}
 if(near(x,z)){stats.nativeSpacingRejected++;continue;}
 const a=Math.floor((x-left)/span),b=Math.floor((z-top)/span),k=a+256*b;
 const t=tiles.get(k)??{a,b,candidates:[],chosen:[]};tiles.set(k,t);
 const h=Math.min(25,height*(.83+.28*hsh(ix,iz,19))),ww=h*(.30+.16*hsh(ix,iz,11));
 t.candidates.push({x,z,h,w:ww,score:hsh(ix,iz,45)+.12*(v-cfg.ndvi),seed:hsh(ix,iz,29)});
}
const list=[...tiles.values()].sort((a,b)=>a.b-b.b||a.a-b.a);for(const t of list)t.candidates.sort((a,b)=>b.score-a.score);
for(let rank=0;rank<cfg.tile&&stats.kept<cfg.cap;rank++){
 const order=list.slice().sort((a,b)=>hsh(a.a,a.b,rank+80)-hsh(b.a,b.b,rank+80));
 for(const t of order){const rec=t.candidates[rank];if(!rec||near(rec.x,rec.z))continue;
 put(rec.x,rec.z,5.8);t.chosen.push(rec);if(++stats.kept===cfg.cap)break;}
}
const ok=list.filter(t=>t.chosen.length);
const file=Buffer.alloc(20+ok.length*4+stats.kept*7);
file.write('NCP1');file.writeUInt32LE(stats.kept,4);file.writeUInt16LE(ok.length,8);file.writeUInt16LE(span,10);
for(let i=0;i<4;i++) file.writeInt16LE(rect[i],12+2*i);
let p=20;for(const t of ok){file[p]=t.a;file[p+1]=t.b;file.writeUInt16LE(t.chosen.length,p+2);p+=4;
 for(const q of t.chosen){
  file.writeUInt16LE(Math.round((q.x-left-t.a*span)*16),p);file.writeUInt16LE(Math.round((q.z-top-t.b*span)*16),p+2);
  file[p+4]=Math.round(q.h*8);file[p+5]=Math.round(q.w*16);file[p+6]=Math.floor(q.seed*255);p+=7;
 }
}
if(p!==file.length)throw Error('Pack mismatch');
const pack=gzipSync(file,{level:9});const metaLayer=v=>Object.fromEntries(Object.entries(v).filter(([k])=>!k.includes('dataBase64')&&k!=='read'));
const stats2={...stats,tiles:ok.length,gzipBytes:pack.length,packSha256:sha(pack)};
const meta={scheme:'NCP1',world:key,crs:'EPSG:'+cfg.crs,origin,bounds,localRect:rect,rule:cfg,sentinel:source.sentinel,
 layers:{canopy:metaLayer(ch),red:metaLayer(red),nir:metaLayer(nir),scl:metaLayer(scl)},stats:stats2};
fs.writeFileSync(path.join(root,'game',key+'-canopy-preview.bin'),pack);
fs.writeFileSync(path.join(root,'game',key+'-canopy-preview.json'),JSON.stringify(meta,null,2)+'\n');
console.log(stats2,rect);
