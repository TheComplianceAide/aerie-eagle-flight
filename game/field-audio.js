// Regional recordings, world-space wildlife voices, and exposed-air wind.
(() => {
  const scenes = {
    alaska:  {beds:['lake','canopy','ice','cascade'], birds:['jay','thrush']},
    swiss:   {beds:['lake','canopy','cascade'], birds:['chough','dunnock']},
    canyon:  {beds:['river','crickets'], birds:['poorwill']},
    napali:  {beds:['surf','cascade'], birds:['petrel','apapane']},
    yosemite:{beds:['canopy','river','cascade'], birds:['nutcracker','thrush']},
    bryce:   {beds:['canopy','crickets'], birds:['bryce','poorwill']},
    crater:  {beds:['lake','canopy'], birds:['jay','nutcracker']},
    lofoten: {beds:['inlet'], birds:['kittiwake','meadow-pipit']},
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
  function nearestShore(edges,x,z){
    let best=Infinity,point=null;
    for(const ring of edges)for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const a=ring[j],b=ring[i],dx=b.x-a.x,dz=b.z-a.z;
      const t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);
      const px=a.x+t*dx,pz=a.z+t*dz,dist=(px-x)**2+(pz-z)**2;
      if(dist<best){best=dist;point={x:px,z:pz};}
    }
    return point;
  }
  function airStream(context){
    const rate=context.sampleRate,len=Math.floor(rate*5.3),buffer=context.createBuffer(2,len,rate);
    for(let ear=0;ear<2;ear++){
      const samples=buffer.getChannelData(ear);let low=0,mid=0;
      for(let i=0;i<len;i++){
        const white=Math.random()*2-1;
        low=.987*low+.13*white;mid=.84*mid+.16*white;
        samples[i]=.52*low+.38*mid+.06*white;
      }
      // Crossfade the seam of the noise loop.
      for(let i=0;i<512;i++)samples[len-512+i]+=(samples[i]-samples[len-512+i])*i/512;
    }
    return buffer;
  }
  function place(node,x,y,z){
    if(node.positionX){node.positionX.value=x;node.positionY.value=y;node.positionZ.value=z;}
    else node.setPosition(x,y,z);
  }
  window.makeFieldAudio=function makeFieldAudio(context,region){
    const profile=scenes[region]||scenes.alaska;
    const master=context.createGain();
    master.gain.value=0;
    master.connect(context.destination);
    const airBuffer=airStream(context),air=context.createGain(),shelf=context.createBiquadFilter();
    shelf.type='lowpass';shelf.frequency.value=600;air.gain.value=0;
    shelf.connect(air).connect(master);let windSource=null;
    const forward=new THREE.Vector3(),up=new THREE.Vector3();
    const buffers=new Map(), loading=new Map(), loops=new Map(), shots=new Set();
    let enabled=false, generation=0, tick=0, started=false;
    let eagleDue=0, birdDue=0, eagleIndex=region==='alaska'?2:0, birdIndex=0;
    function load(id){
      if(buffers.has(id))return Promise.resolve(buffers.get(id));
      if(loading.has(id))return loading.get(id);
      const format=['apapane','meadow-pipit','dunnock'].includes(id)?'.m4a':'.mp3';
      const name='field-'+id+format;
      const task=fetch(window.aerieAssetURL?.(name)||name)
        .then(response=>{if(!response.ok)throw Error('Missing audio '+name);return response.arrayBuffer();})
        .then(data=>context.decodeAudioData(data))
        .then(buffer=>{buffers.set(id,buffer);return buffer;})
        .catch(error=>{console.warn('Aerie recording unavailable',name,error.message);return null;})
        .finally(()=>loading.delete(id));
      loading.set(id,task);
      return task;
    }
    function channel(buffer,anchor){
      const source=context.createBufferSource(),gain=context.createGain();
      const pan=anchor?context.createPanner():context.createStereoPanner(),filter=context.createBiquadFilter();
      if(anchor){
        pan.panningModel='HRTF';pan.distanceModel='inverse';pan.refDistance=15;
        pan.maxDistance=150;pan.rolloffFactor=1.15;place(pan,anchor.x,anchor.y,anchor.z);
      }
      filter.type='lowpass';filter.frequency.value=16000;
      source.buffer=buffer;
      source.connect(filter).connect(pan).connect(gain).connect(master);
      return {source,gain,pan,filter,anchor};
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
        if(windSource){windSource.stop(now+.32);windSource=null;}
        for(const bed of loops.values())bed.source.stop(now+.32);
        for(const shot of shots)shot.source.stop(now+.32);
        loops.clear();
        return;
      }
      windSource=context.createBufferSource();windSource.buffer=airBuffer;windSource.loop=true;
      const breeze=windSource;breeze.connect(shelf);breeze.onended=()=>breeze.disconnect();breeze.start(0,Math.random()*airBuffer.duration);
      const token=generation;
      for(const id of profile.beds)load(id).then(buffer=>startBed(id,buffer,token));
      for(const id of [...profile.birds,...playerCalls])load(id);
      eagleDue=now+(started?random(14,24):random(3.9,5.4));
      birdDue=now+random(1.6,3.1);
      started=true;tick=0;
    }
    function voice(id,gain,pan,cutoff,anchor=null){
      const buffer=buffers.get(id);
      if(!buffer)return false;
      const c=channel(buffer,anchor);
      c.gain.gain.value=gain;
      if(!anchor)c.pan.pan.value=pan;
      c.filter.frequency.value=cutoff;
      c.source.playbackRate.value=random(.982,1.015);
      shots.add(c);
      c.source.onended=()=>{shots.delete(c);release(c);};
      c.source.start();return true;
    }
    function sourceSite(id,s,world,shore,waterY){
      const habitat=world.habitat,ground=world.elevation||world.height;
      if(id.startsWith('loon-')||id==='petrel'||id==='kittiwake'){
        if(!shore)return null;
        return {x:shore.x,y:Math.max(ground(shore.x,shore.z),waterY)+2.1,z:shore.z};
      }
      const az=random(0,Math.PI*2),r=random(13,32),x=s.x+r*Math.cos(az),z=s.z+r*Math.sin(az);
      if(id==='poorwill'||id==='chough'||id==='meadow-pipit'){
        if(habitat.wet(x,z,ground(x,z)))return null;
        return {x,y:habitat.surface(x,z)+1.4,z};
      }
      const tree=habitat.nearestTree(x,z,76);
      if(!tree)return null;
      return {x:tree.x,y:tree.y+tree.height*(id==='thrush'||id==='dunnock'?.14:.68),z:tree.z};
    }
    let lastShore=null,shoreX=Infinity,shoreZ=Infinity;
    function update(s,world,dt,camera){
      if(!enabled||!s||!world)return;
      if(camera){
        const listener=context.listener,eye=camera.position;
        place(listener,eye.x,eye.y,eye.z);
        forward.set(0,0,-1).applyQuaternion(camera.quaternion);up.set(0,1,0).applyQuaternion(camera.quaternion);
        if(listener.forwardX){
          listener.forwardX.value=forward.x;listener.forwardY.value=forward.y;listener.forwardZ.value=forward.z;
          listener.upX.value=up.x;listener.upY.value=up.y;listener.upZ.value=up.z;
        }else listener.setOrientation(forward.x,forward.y,forward.z,up.x,up.y,up.z);
      }
      tick-=dt;
      if(tick>0)return;
      tick=.18;
      const now=context.currentTime,points=world.landmarks||[];
      const agl=Math.max(0,s.y-world.height(s.x,s.z));
      const waterY=world.waterLevel??world.lakeLevel??(region==='canyon'?8:0);
      const waterGap=Math.max(0,s.y-waterY);
      const ground=attenuation(agl,64);
      if(Math.hypot(s.x-shoreX,s.z-shoreZ)>7){
        shoreX=s.x;shoreZ=s.z;
        lastShore=nearestShore(world.shorelines||(world.lakePolygon?[world.lakePolygon]:[]),s.x,s.z);
        // Some coastal surveys encode the waterline as an elevation contour.
        if(!lastShore&&Number.isFinite(world.waterLevel)){
          const floor=world.elevation||world.height,originWet=floor(s.x,s.z)<=waterY+.3;
          outer:for(const rad of [10,22,38,64,100,165,285])for(let i=0;i<12;i++){
            const dx=Math.cos(i*Math.PI/6),dz=Math.sin(i*Math.PI/6);
            if((floor(s.x+dx*rad,s.z+dz*rad)<=waterY+.3)===originWet)continue;
            let lo=0,hi=rad;
            for(let j=0;j<6;j++){const m=(lo+hi)/2;if((floor(s.x+dx*m,s.z+dz*m)<=waterY+.3)===originWet)lo=m;else hi=m;}
            lastShore={x:s.x+dx*hi,z:s.z+dz*hi};break outer;
          }
        }
      }
      const shore=lastShore?Math.hypot(lastShore.x-s.x,lastShore.z-s.z):Infinity;
      const shoreGain=attenuation(Math.hypot(waterGap,shore*.65),region==='napali'?245:120);
      const tree=agl<145?world.habitat.nearestTree(s.x,s.z,80):null;
      const canopy=tree?attenuation(Math.hypot(s.x-tree.x,s.y-tree.y-tree.height*.63,s.z-tree.z),30):0;
      const land=world.elevation||world.height,here=land(s.x,s.z);
      const ridge=clamp((here-(land(s.x-90,s.z-42)+land(s.x+74,s.z-53)+land(s.x+21,s.z+99))/3-3)/37,0,1);
      const exposure=clamp((agl-12)/190+.51*ridge*(1-.63*canopy),0,1);
      const gust=window.aerieWind(s.x,s.z,s.elapsed||0);
      const speed=clamp((s.airspeed||0)/32,0,1.3);
      air.gain.setTargetAtTime((.045+.12*speed+.63*exposure)*(.70+.37*gust)*(1-.46*canopy),now,.55);
      shelf.frequency.setTargetAtTime(550+1320*speed+2850*exposure+530*gust,now,.55);
      for(const shot of shots){
        if(!shot.anchor)continue;
        const a=shot.anchor,d=Math.hypot(s.x-a.x,s.y-a.y,s.z-a.z);
        shot.gain.gain.setTargetAtTime(.9*(1-clamp((d-76)/65,0,1)),now,.20);
        shot.filter.frequency.setTargetAtTime(2400+12400*attenuation(d,71),now,.28);
      }
      const falls=feature(points,/falls|waterfall|cascade/i,s.x,s.z);
      const ice=feature(points,/ice passage|mendenhall glacier|crevass|terminus/i,s.x,s.z);
      const rivers=feature(points,/river|sandbar|meadow|riverbank/i,s.x,s.z);
      for(const [id,c] of loops){
        let g=0,pan=0;
        if(id==='canopy')g=.42*canopy;
        if(id==='crickets')g=.31*ground;
        if(id==='lake')g=.59*shoreGain;
        if(id==='surf')g=.73*shoreGain;
        if(id==='inlet')g=.66*shoreGain;
        if(id==='river')g=.57*ground*attenuation(rivers.distance,1200);
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
        birdDue=now+1.25;
        for(let i=0;agl<125&&i<profile.birds.length;i++){
          const id=profile.birds[birdIndex];birdIndex=(birdIndex+1)%profile.birds.length;
          const site=sourceSite(id,s,world,lastShore,waterY);
          if(!site||Math.hypot(s.x-site.x,s.y-site.y,s.z-site.z)>103)continue;
          if(voice(id,.9,0,14000,site)){birdDue=now+random(6,15);break;}
        }
      }
    }
    return {setEnabled,update,output:master};
  };
})();
