// Field recordings follow the bird, shore, ice front and waterfall spray. Gains refer
// to the processed recording levels; the existing wind/wingbeat bus remains independent.
(() => {
  const scenes = {
    alaska:  {beds:['lake','canopy','ice','cascade'], birds:['jay','thrush']},
    swiss:   {beds:['lake','canopy','cascade'], birds:['chough']},
    canyon:  {beds:['river','crickets'], birds:['poorwill']},
    napali:  {beds:['surf','cascade'], birds:['petrel']},
    yosemite:{beds:['canopy','river','cascade'], birds:['nutcracker','thrush']},
    bryce:   {beds:['canopy','crickets'], birds:['bryce','poorwill']},
    crater:  {beds:['lake','canopy'], birds:['jay','nutcracker']},
    lofoten: {beds:['inlet'], birds:['kittiwake']},
    milford: {beds:['lake','cascade'], birds:['bellbird']},
    winnipesaukee:{beds:['lake','canopy'], birds:['loon-winnipesaukee','nh-vireo']},
    surry:    {beds:['lake','canopy','river'], birds:['nh-vireo','thrush']},
    moosehead: {beds:['lake','canopy'], birds:['loon-moosehead','me-kinglet']}
  };
  const playerCalls=['eagle-yellowstone','eagle-chirp','eagle-alaska'];
  const random=(a,b)=>a+(b-a)*Math.random();
  const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
  const attenuation=(meters,reach)=>1/(1+(meters/reach)**2);

  function feature(points,pattern,x,z){
    let distance=Infinity,dx=0,dz=0;
    for(const point of points){
      if(!pattern.test(point.name))continue;
      const a=point.x-x,b=point.z-z,d=Math.hypot(a,b);
      if(d<distance){distance=d;dx=a;dz=b;}
    }
    return {distance,dx,dz};
  }
  function shoreDistance(polygon,x,z){
    if(!polygon?.length)return 0;
    let best=Infinity;
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
      const a=polygon[j],b=polygon[i],dx=b.x-a.x,dz=b.z-a.z;
      const t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);
      const sq=(x-a.x-t*dx)**2+(z-a.z-t*dz)**2;
      if(sq<best)best=sq;
    }
    return Math.sqrt(best);
  }
  window.makeFieldAudio=function makeFieldAudio(context,region){
    const profile=scenes[region]||scenes.alaska;
    const master=context.createGain();
    master.gain.value=0;
    master.connect(context.destination);
    const buffers=new Map(), loading=new Map(), loops=new Map(), shots=new Set();
    let enabled=false, generation=0, tick=0, started=false;
    let eagleDue=0, birdDue=0, eagleIndex=region==='alaska'?2:0, birdIndex=0;
    function load(id){
      if(buffers.has(id))return Promise.resolve(buffers.get(id));
      if(loading.has(id))return loading.get(id);
      const name='field-'+id+'.mp3';
      const task=fetch(window.aerieAssetURL?.(name)||name)
        .then(response=>{if(!response.ok)throw Error('Missing audio '+name);return response.arrayBuffer();})
        .then(data=>context.decodeAudioData(data))
        .then(buffer=>{buffers.set(id,buffer);return buffer;})
        .catch(error=>{console.warn('Aerie recording unavailable',name,error.message);return null;})
        .finally(()=>loading.delete(id));
      loading.set(id,task);
      return task;
    }
    function channel(buffer){
      const source=context.createBufferSource(),gain=context.createGain();
      const pan=context.createStereoPanner(),filter=context.createBiquadFilter();
      filter.type='lowpass';filter.frequency.value=16000;
      source.buffer=buffer;
      source.connect(filter).connect(pan).connect(gain).connect(master);
      return {source,gain,pan,filter};
    }
    function release(c){
      c.source.disconnect();c.filter.disconnect();c.pan.disconnect();c.gain.disconnect();
    }
    function startBed(id,buffer,token){
      if(!enabled||generation!==token||!buffer||loops.has(id))return;
      const bed=channel(buffer);
      bed.source.loop=true;
      bed.gain.gain.value=0;
      bed.source.start(0,Math.random()*buffer.duration);
      bed.source.onended=()=>release(bed);
      loops.set(id,bed);
    }
    function setEnabled(value){
      if(enabled===value)return;
      enabled=value;generation++;
      const now=context.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(enabled?.86:0,now,.055);
      if(!enabled){
        for(const bed of loops.values())bed.source.stop(now+.32);
        for(const shot of shots)shot.source.stop(now+.32);
        loops.clear();
        return;
      }
      const token=generation;
      for(const id of profile.beds)load(id).then(buffer=>startBed(id,buffer,token));
      for(const id of [...profile.birds,...playerCalls])load(id);
      eagleDue=now+(started?random(14,24):random(3.9,5.4));
      birdDue=now+random(1.6,3.1);
      started=true;tick=0;
    }
    function voice(id,gain,pan,cutoff){
      const buffer=buffers.get(id);
      if(!buffer)return false;
      const c=channel(buffer);
      c.gain.gain.value=gain;
      c.pan.pan.value=pan;
      c.filter.frequency.value=cutoff;
      c.source.playbackRate.value=random(.982,1.015);
      shots.add(c);
      c.source.onended=()=>{shots.delete(c);release(c);};
      c.source.start();return true;
    }
    function update(s,world,dt){
      if(!enabled||!s||!world)return;
      tick-=dt;
      if(tick>0)return;
      tick=.18;
      const now=context.currentTime,points=world.landmarks||[];
      const agl=Math.max(0,s.y-world.height(s.x,s.z));
      const waterY=world.waterLevel??world.lakeLevel??(region==='canyon'?8:0);
      const waterGap=Math.max(0,s.y-waterY);
      const ground=attenuation(agl,210);
      let shore=shoreDistance(world.lakePolygon,s.x,s.z);
      if(world.shorelines){
        shore=Infinity;
        for(const edge of world.shorelines)shore=Math.min(shore,shoreDistance(edge,s.x,s.z));
      }
      const shoreGain=attenuation(Math.hypot(waterGap,shore*.65),region==='napali'?460:210);
      const falls=feature(points,/falls|waterfall|cascade/i,s.x,s.z);
      const ice=feature(points,/ice passage|mendenhall glacier|crevass|terminus/i,s.x,s.z);
      const rivers=feature(points,/river|sandbar|meadow|riverbank/i,s.x,s.z);
      for(const [id,c] of loops){
        let g=0,pan=0;
        if(id==='canopy')g=.10+.28*ground*attenuation(Math.max(0,(s.y-(world.waterLevel||0))-850),480);
        if(id==='crickets')g=.10+.26*ground;
        if(id==='lake')g=.06+.55*shoreGain;
        if(id==='surf')g=.13+.61*shoreGain;
        if(id==='inlet')g=.11+.60*shoreGain;
        if(id==='river')g=.045+.52*ground*attenuation(rivers.distance,1200);
        if(id==='cascade'||id==='ice'){
          const at=id==='ice'?ice:falls,reach=id==='ice'?960:620;
          const dist=Math.hypot(at.distance,agl*.8);
          g=(id==='ice'?.80:.64)*attenuation(dist,reach);
          if(at.distance>1&&Number.isFinite(at.distance))
            pan=clamp((at.dx*Math.cos(s.yaw)-at.dz*Math.sin(s.yaw))/at.distance,-1,1)*.68;
        }
        c.pan.pan.setTargetAtTime(pan,now,.45);
        c.gain.gain.setTargetAtTime(g,now,.55);
        c.filter.frequency.setTargetAtTime(2200+12000*clamp(g*1.7,0,1),now,.65);
      }
      if(now>=eagleDue){
        if(voice(playerCalls[eagleIndex],.70,-.10,15500)){
          eagleIndex=(eagleIndex+1)%playerCalls.length;
          eagleDue=now+random(33,58);
        }else eagleDue=now+.6;
      }
      if(now>=birdDue){
        const id=profile.birds[birdIndex],highBird=['chough','kittiwake','petrel','nutcracker'].includes(id);
        const proximity=id.startsWith('loon-')?.16+.84*attenuation(waterGap,320):highBird?.48+.52*ground:.12+.88*ground;
        if(voice(id,.48*proximity,random(-.74,.74),2400+proximity*10300)){
          birdIndex=(birdIndex+1)%profile.birds.length;
          birdDue=now+random(13,29);
        }else birdDue=now+.6;
      }
    }
    return {setEnabled,update,output:master};
  };
})();
