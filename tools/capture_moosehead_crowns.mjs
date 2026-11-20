// Capture six transparent orthographic views per native branch model using a private Chrome profile.
// Invoked by bake_moosehead_crowns.py. Requires Node 22 or later and a local Chrome/Chromium installation.
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const {values: options} = parseArgs({options:{
  sheet:{type:'string'}, species:{type:'string'}, output:{type:'string'}, chrome:{type:'string'},
}});
if (!options.sheet || !options.species || !options.output) {
  throw Error('Required arguments: --sheet <id> --species <name> --output <directory>');
}
const tools = path.dirname(fileURLToPath(import.meta.url));
const game = path.join(tools, '../game');
const candidates = [options.chrome, process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean);
let chrome;
for (const candidate of candidates) {
  try { await fs.access(candidate); chrome=candidate; break; } catch {}
}
if (!chrome) throw Error('Provide a local Chrome executable via --chrome or CHROME_PATH.');
const fixture = await fs.readFile(path.join(tools, 'moosehead_crown_capture.html'));
const server = http.createServer(async (request, response) => {
  const location = new URL(request.url, 'http://127.0.0.1').pathname;
  if (location==='/') {
    response.setHeader('Content-Type','text/html'); response.end(fixture); return;
  }
  const file = path.resolve(game, '.'+location.slice(5));
  if (!location.startsWith('/game/') || !file.startsWith(game+path.sep)) {
    response.writeHead(404); response.end(); return;
  }
  try {
    const info=await fs.stat(file);
    if (!info.isFile()) throw Error('No such file');
    response.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'application/octet-stream');
    createReadStream(file).on('error',()=>response.destroy()).pipe(response);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'aerie-crown-bake-'));
const child=spawn(chrome,['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',
  '--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
let socket;
async function until(test, description, limit=90000) {
  const start=Date.now();
  while (Date.now()-start<limit) {
    if (child.exitCode!==null) throw Error('Chrome exited while '+description);
    const value=await test();
    if (value) return value;
    await delay(120);
  }
  throw Error('Timed out while '+description);
}
try {
  const port=await until(async()=>{
    try{return (await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];}catch{return false;}
  },'starting Chrome');
  const remote='http://127.0.0.1:'+port;
  const target=await(await fetch(remote+'/json/new?about:blank',{method:'PUT'})).json();
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let serial=0;
  const pending=new Map();
  socket.onmessage=({data})=>{
    const {id,error,result}=JSON.parse(data);
    if(!pending.has(id))return;
    const {resolve,reject}=pending.get(id);pending.delete(id);
    if(error)reject(Error(error.message));else resolve(result);
  };
  const call=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++serial;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));
  });
  async function evaluate(expression) {
    const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
    return result.result.value;
  }
  const query=new URLSearchParams({region:options.sheet.split('-')[0],species:options.species,sheet:options.sheet});
  await call('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/?'+query});
  await until(()=>evaluate('window.stream?.stats().ready && stream.stats().regionalSheets.length>=4'),'loading native model data');
  await fs.mkdir(options.output,{recursive:true});
  for(let cell=0;cell<16;cell++)for(let view=0;view<6;view++) {
    const viewData=await evaluate('view('+cell+','+(Math.PI*(view%4)/2)+','+[0,0,0,0,.83,1.5707][view]+')');
    if(viewData.c!==cell)throw Error('Selected cell '+viewData.c+' instead of '+cell+' for '+options.sheet);
    await fs.writeFile(path.join(options.output,options.sheet+'-'+cell+'-'+view+'.png'),Buffer.from(viewData.bytes,'base64'));
  }
  console.log(options.sheet+' captured 16 native models from six views');
} finally {
  socket?.close();child.kill();server.closeAllConnections();server.close();
  for(let i=0;i<60 && child.exitCode===null && child.signalCode===null;i++) await delay(50);
  await fs.rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:250});
}
