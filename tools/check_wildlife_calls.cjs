// Exercise the live audio scheduler while controlling time, sight lines and mute.
// Browser-level release checks separately decode and measure the actual audio.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const dir = path.join(__dirname, '../game');
const clips = [];
const disk = new Map();
const browser = {
  window: {aerieEchoSurfaces:()=>[], aerieCascadeSource:()=>null, aerieSoundPath:()=>0, aerieWind:()=>0},
  THREE: {Vector3:class {}},
  fetch: async name=>{
    if (!disk.has(name)) disk.set(name, fs.readFileSync(path.join(dir,name)));
    return {ok:true, arrayBuffer:async()=>({name,data:disk.get(name)})};
  }
};
vm.runInNewContext(fs.readFileSync(path.join(dir,'field-audio.js'),'utf8'),browser);
function param() {return {value:0,cancelScheduledValues(){},setTargetAtTime(v){this.value=v;}};}
function node() {
  return {gain:param(),pan:param(),frequency:param(),playbackRate:param(),
    connect(next){this.out=next;return next;},disconnect(){},setPosition(){},stop(){},
    start(){if(this.buffer?.name) clips.push({name:this.buffer.name,at:ctx.currentTime,level:this.out?.out?.out?.gain.value});}};
}
const ctx = {
  sampleRate:8000,currentTime:0,destination:node(),createGain:node,createPanner:node,
  createStereoPanner:node,createBiquadFilter:node,createBufferSource:node,
  createBuffer:(channels,length)=>({getChannelData:()=>new Float32Array(length)}),
  decodeAudioData:async f=>{assert.ok(f.data.length>1000);return {name:f.name,duration:1.2};}
};
const bird = {x:0,y:22,z:0,yaw:0,airspeed:18};
const actor = {height:1.8};
let z=20,blocked=false;
const world={
  height:(x,z)=>blocked&&z<-6&&z>-15?35:0,
  habitat:{surface:()=>null,nearestTree:()=>null,wet:()=>false},windField:{sample:()=>({gust:0})},
  wildlife:{waterAt:()=>NaN,nearest:()=>null,nearby:()=>[{actor,name:'Moose',kind:'Mammal',x:0,y:2,z,distance:Math.hypot(20,z)}]}
};
(async()=>{
  const field=browser.window.makeFieldAudio(ctx,'moosehead');
  field.setEnabled(true);
  await new Promise(setImmediate);
  const tick=t=>{ctx.currentTime=t;field.update(bird,world,.25,null,'free');};
  const encounters=()=>clips.filter(c=>c.level===.95&&c.name.startsWith('field-eagle-'));
  tick(.2);assert.equal(encounters().length,0,'animal behind the eagle');
  z=-28;blocked=true;tick(.8);assert.equal(encounters().length,0,'terrain between eagle and animal');
  blocked=false;tick(1.4);assert.equal(encounters().length,1,'clear sight must trigger an actual eagle recording');
  tick(17.7);assert.equal(encounters().length,1,'the same animal should not repeatedly call the eagle');
  field.setEnabled(false);tick(62);assert.equal(encounters().length,1,'muting stops audio');
  field.setEnabled(true);tick(63);assert.equal(encounters().length,2,'sound resumes on a later eligible encounter');
  field.setEnabled(false);

  // A reusable regional recording is allowed to follow a new encounter,
  // but the ordinary ambient-source fallback must not invent an osprey.
  ctx.currentTime=100;
  const patch=browser.window.makeFieldAudio(ctx,'moosehead');
  world.wildlife.nearby=()=>[];
  let ospreyVisible=false;
  world.wildlife.nearest=id=>ospreyVisible&&id==='patch-osprey'?{x:22,y:6,z:-45}:null;
  patch.setEnabled(true);
  await new Promise(setImmediate);
  const ospreyCalls=()=>clips.filter(c=>c.name==='voice-labrador-1147350.m4a');
  for(let t=101;t<=250;t++){ctx.currentTime=t;patch.update(bird,world,.25,null,'free');}
  assert.equal(ospreyCalls().length,0,'the patch must never call an absent osprey');
  ospreyVisible=true;
  for(let t=251;t<=450;t++){ctx.currentTime=t;patch.update(bird,world,.25,null,'free');}
  assert.ok(ospreyCalls().length>0,'the nearby osprey uses the existing credited recording');
  patch.setEnabled(false);
  console.log('Passed wildlife-triggered eagle voice, terrain, cooldown, mute and resume.');
})().catch(e=>{console.error(e);process.exitCode=1;});
