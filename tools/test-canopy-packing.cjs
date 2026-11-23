const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');
const {publicModels,regionalMesh,restoreMesh,marker}=require('../game/canopy-stream.js');
const {packMesh}=require('./pack-canopy-meshes.cjs');

const id='winnipesaukee-tree';
const oldPath='canopy-data/regional/'+id+'.bin';
const newPath='canopy-data/regional-packed-v1/'+id+'.bin';
const read=relative=>fs.readFileSync(path.join(__dirname,'../game',relative));
const original=read(oldPath);
const packed=read(newPath);
const raw=zlib.gunzipSync(original);
const rawRoot='https://raw.githubusercontent.com/TheComplianceAide/aerie-eagle-flight/'+'a'.repeat(40)+'/game/';
const arrayBuffer=bytes=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
const signal=new AbortController().signal;

test('mesh layouts round-trip including inter-record padding, partial blocks and 32-bit indices',async()=>{
  const small={p:0,v:5,i:6};
  const large={p:128,v:65536,i:23};
  const header=Buffer.from(JSON.stringify([small,large]));
  const fixture=Buffer.alloc(4+header.length+large.p+16*large.v+4*large.i+10);
  for(let i=0;i<fixture.length;i++)fixture[i]=(13*i+17)&255;
  fixture.writeUInt32LE(header.length);
  header.copy(fixture,4);
  const encoded=packMesh(fixture);
  const restored=await restoreMesh(arrayBuffer(zlib.gunzipSync(encoded)));
  assert(Buffer.from(restored).equals(fixture));
  const broken=Buffer.from(fixture);
  broken[3]=marker;
  await assert.rejects(restoreMesh(arrayBuffer(broken.subarray(0,-150))),/Incomplete canopy model/);
  await assert.rejects(restoreMesh(arrayBuffer(fixture)),/Unrecognized canopy mesh format/);
});
test('regional mesh requests use the selected flight model and preserve the old loading paths',async t=>{
  const originalFetch=global.fetch;
  const originalDS=global.DecompressionStream;
  const oldWindow=global.window;
  t.after(()=>{global.fetch=originalFetch;global.DecompressionStream=originalDS;if(oldWindow)global.window=oldWindow;else delete global.window;});
  async function scenario(options={}){
    const requests=[];
    global.window={aerieAssetURL:options.resolve||((p)=>p),location:{protocol:options.protocol||'https:'},pako:options.pako};
    global.DecompressionStream=options.pako?undefined:originalDS;
    global.fetch=async(url,{signal})=>{
      requests.push(url);
      if(options.fetch)return options.fetch(url,signal);
      return new Response(url.endsWith(newPath)?packed:original);
    };
    const bytes=await regionalMesh(options.id||id,signal);
    assert(Buffer.from(bytes).equals(raw));
    return requests;
  }
  await t.test('local server and pinned production aliases use only the packed transfer',async()=>{
    assert.deepEqual(await scenario(),[newPath]);
    assert.deepEqual(await scenario({resolve:p=>rawRoot+p}),[rawRoot+newPath]);
  });
  await t.test('404, stale valid gzip, malformed gzip and offline variant fall back independently',async()=>{
    for(const bad of [()=>new Response(null,{status:404}),()=>new Response(original),()=>new Response('bad gzip'),
        ()=>{throw new TypeError('Offline');}]){
      assert.deepEqual(await scenario({fetch:u=>u===newPath?bad():new Response(original)}),[newPath,oldPath]);
    }
  });
  await t.test('file-mode standalone loads its original embedded asset without requesting a variant',async()=>{
    assert.deepEqual(await scenario({protocol:'file:',resolve:p=>'blob:'+p}),['blob:'+oldPath]);
  });
  await t.test('unpublished overlay, changed pass routes and unknown specimens never try a public variant',async()=>{
    assert.deepEqual(await scenario({resolve:p=>p===oldPath?rawRoot+p:p}),[rawRoot+oldPath]);
    assert.deepEqual(await scenario({resolve:p=>p===oldPath?'/api/flight-assets/token':rawRoot+p}),['/api/flight-assets/token']);
    assert.deepEqual(await scenario({id:'future-private-model'}),['canopy-data/regional/future-private-model.bin']);
  });
  await t.test('older browsers can inflate the packed geometry with the shipped pako',async()=>{
    const pako=require('./pako/pako_inflate.min.js');
    assert.deepEqual(await scenario({pako}),[newPath]);
  });
  await t.test('aborted variant requests never start the legacy download',async()=>{
    const controller=new AbortController();
    const requests=[];
    global.window={location:{protocol:'https:'}};
    global.fetch=async u=>{requests.push(u);controller.abort();throw controller.signal.reason;};
    await assert.rejects(regionalMesh(id,controller.signal),{name:'AbortError'});
    assert.deepEqual(requests,[newPath]);
  });
  assert.equal(publicModels.size,44);
});
