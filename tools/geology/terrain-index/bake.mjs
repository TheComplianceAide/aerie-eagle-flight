// Serve game/ over HTTP, then run: node bake.mjs http://127.0.0.1:8000/ alaska.
// Set CHROME to a Chromium executable on platforms without Google Chrome at the Mac path.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';

const [origin,region,output]=process.argv.slice(2);
assert.ok(origin&&['alaska','yosemite','crater','moosehead','winnipesaukee'].includes(region),'Provide a game URL and supported terrain region');
const here=path.dirname(fileURLToPath(import.meta.url));
const profile=await mkdtemp(path.join(os.tmpdir(),'aerie-terrain-bake-'));
const chrome=spawn(process.env.CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
  '--headless=new','--no-first-run','--mute-audio','--disable-extensions','--disable-background-networking',
  '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'
],{stdio:'ignore'});
const closed=once(chrome,'exit');let ws;
try{
  let port;
  for(let i=0;i<150&&!port;i++){
    try{port=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];}
    catch{await wait(80);}
  }
  assert.ok(port,'Could not launch Chromium');
  const target=await (await fetch('http://127.0.0.1:'+port+'/json/new?about:blank',{method:'PUT'})).json();
  ws=new WebSocket(target.webSocketDebuggerUrl);await once(ws,'open');
  let seq=0;const calls=new Map();
  ws.addEventListener('message',({data})=>{
    const message=JSON.parse(data),pending=calls.get(message.id);if(!pending)return;
    calls.delete(message.id);if(message.error)pending.reject(Error(message.error.message));else pending.resolve(message.result);
  });
  const command=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++seq;calls.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));
  });
  const evaluate=async expression=>{
    const reply=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(reply.exceptionDetails)throw Error(reply.exceptionDetails.exception?.description||reply.exceptionDetails.text);
    return reply.result.value;
  };
  await command('Page.enable');await command('Page.navigate',{url:origin});
  let ready=false;
  for(let i=0;i<300&&!ready;i++){ready=await evaluate('document.readyState==="complete"&&typeof loadFlightRange==="function"');if(!ready)await wait(100);}
  assert.ok(ready,'Could not open the game');
  for(const name of ['../../../game/terrain-indices.js','martini.js','bake.js'])
    await evaluate(await readFile(path.join(here,name),'utf8'));
  const result=await evaluate(`(async()=>{
    const region=${JSON.stringify(region)};
    await loadFlightRange(region);
    const scene=new THREE.Scene();
    if(region==='alaska')await window.makeAlaska(THREE,scene);
    else await window.makeAtlasWorld(THREE,scene,region);
    return window.bakeTerrainIndexField(scene,region);
  })()`);
  assert(result.tiles>0,'No regular terrain found');
  const bytes=Buffer.from(result.bytes,'base64');
  const dest=output||path.resolve(here,'../../../game/terrain-indices-'+region+'.bin');
  await writeFile(dest,bytes);
  console.log(region,result.tiles+' tiles,',result.native+' original triangles,',result.reduced+' alternate triangles,',bytes.length+' bytes');
}finally{
  ws?.close();chrome.kill('SIGTERM');
  await Promise.race([closed,wait(2000)]);await rm(profile,{recursive:true,force:true,maxRetries:3}).catch(()=>{});
}
