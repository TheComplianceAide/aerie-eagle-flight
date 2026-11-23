/* Run with --write after changing a listed canopy model; --check verifies the shipped files. */
const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');
const assert=require('node:assert/strict');
const {publicModels,packedDir,marker,blocks,meshLayout,restoreMesh}=require('../game/canopy-stream.js');

function packMesh(raw){
  const buffer=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);
  const layout=meshLayout(buffer,false);
  const encoded=Buffer.from(buffer);
  for(const [start,count,stride] of blocks(layout)){
    for(let c=0;c<stride;c++){
      let prev=0;
      let dst=start+c*count;
      for(let i=0,src=start+c;i<count;i++,src+=stride){
        const value=raw[src];
        encoded[dst++]=value-prev;
        prev=value;
      }
    }
  }
  encoded[3]=marker;
  return zlib.gzipSync(encoded,{level:6});
}
async function main(){
  const args=process.argv.slice(2);
  assert(args.every(arg=>['--write','--check','--verify-public'].includes(arg)), 'Use --check, --write or --verify-public.');
  const write=args.includes('--write');
  const root=path.resolve(__dirname,'../game/canopy-data');
  const dir=path.join(root,packedDir);
  if(write)fs.mkdirSync(dir,{recursive:true});
  const worlds=new Map();
  for(const id of publicModels){
    const original=fs.readFileSync(path.join(root,'regional',id+'.bin'));
    if(args.includes('--verify-public')){
      // Production's scenery-formats.js resolves each original to this public revision.
      const published=await fetch('https://raw.githubusercontent.com/TheComplianceAide/aerie-eagle-flight/04240787054caa9e885e82ff7562b1b177666db7/game/canopy-data/regional/'+id+'.bin');
      assert(published.ok&&original.equals(Buffer.from(await published.arrayBuffer())),id+' differs from the verified public source');
    }
    const raw=zlib.gunzipSync(original);
    const packed=packMesh(raw);
    const target=path.join(dir,id+'.bin');
    if(write)fs.writeFileSync(target,packed);
    else assert(fs.readFileSync(target).equals(packed),id+' needs regenerating');
    const mesh=zlib.gunzipSync(packed);
    const restored=await restoreMesh(mesh.buffer.slice(mesh.byteOffset,mesh.byteOffset+mesh.length));
    assert(raw.equals(Buffer.from(restored)),id+' did not round-trip exactly');
    assert(packed.length<original.length,id+' packed version increased in size');
    const region=id.split('-')[0];
    const total=worlds.get(region)||{models:0,original:0,packed:0};
    total.models++;
    total.original+=original.length;
    total.packed+=packed.length;
    worlds.set(region,total);
  }
  assert.deepEqual(fs.readdirSync(dir).sort(),Array.from(publicModels,id=>id+'.bin').sort(),'Only allowlisted variants may ship in this directory');
  let before=0,after=0;
  for(const [region,r] of worlds){
    before+=r.original;after+=r.packed;
    console.log(region.padEnd(14),r.models,String(r.original).padStart(10),'->',String(r.packed).padStart(10));
  }
  console.log('Verified',publicModels.size,'lossless meshes.',before,'->',after,'bytes. Saved',before-after);
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={packMesh};
