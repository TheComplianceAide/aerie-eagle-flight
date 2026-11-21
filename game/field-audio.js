// Regional recordings, world-space wildlife voices, and exposed-air wind.
(() => {
  // The player travels with the same voice. Wild callers belong to their
  // destination and are emitted from a suitable place in the terrain.
  const scenes = {
    alaska:{beds:{lake:'lapping-glacial',canopy:'leaves-boreal',ice:'ice',cascade:'falls-spray'},birds:['jay','thrush','ak-goose','ak-raven','ak-mallard','ak-dipper'],animals:['juneau-red-squirrel']},
    swiss:{beds:{lake:'lapping-glacial',canopy:'leaves-alpine',cascade:'falls-spray'},birds:['chough','dunnock','ch-accentor','ch-wagtail','ch-raven','ch-mallard'],animals:['alpine-marmot']},
    canyon:{beds:{river:'stream-rock'},birds:['canyon-wren','poorwill','az-raven','az-peregrine','az-rock-wren','az-merganser'],animals:['canyon-treefrog']},
    yosemite:{beds:{canopy:'leaves-montane',river:'stream-forest',cascade:'falls-spray'},birds:['nutcracker','thrush','jay','yo-chickadee','yo-dipper','yo-acorn'],animals:['douglas-squirrel']},
    crater:{beds:{lake:'lapping-caldera',canopy:'leaves-montane',cascade:'stream-rock'},birds:['nutcracker','jay','cl-bluebird','cl-junco','cl-robin','cl-raven'],animals:['american-pika']},
    lofoten:{beds:{inlet:'inlet',cascade:'stream-rock'},birds:['kittiwake','oystercatcher','meadow-pipit','no-eider','no-gull','no-tern'],animals:['norwegian-sheep']},
    milford:{beds:{lake:'lapping-fjord',cascade:'falls-spray'},birds:['bellbird','kea','nz-shelduck','nz-fantail','nz-tomtit','nz-tui'],animals:['nz-fur-seal']},
    dixville:{beds:{lake:'lapping-boreal',canopy:'leaves-hardwood',cascade:'stream-rock'},birds:['me-chickadee','me-kinglet','thrush','nh-kingfisher','nh-mallard','nh-vireo','ak-raven'],animals:['juneau-red-squirrel']},
    labrador:{beds:{lake:'lapping-boreal',canopy:'leaves-boreal'},birds:['loon-moosehead','ne-goose','ak-raven','thrush','cl-junco'],animals:['juneau-red-squirrel']},
    winnipesaukee:{beds:{lake:'lapping-islands',canopy:'leaves-hardwood',cascade:'stream-rock'},birds:['loon-winnipesaukee','nh-vireo','ne-goose','nh-mallard','me-black-duck','nh-heron','nh-kingfisher'],animals:['nh-bullfrog']},
    surry:{beds:{lake:'lapping-reservoir',canopy:'leaves-hardwood',river:'stream-forest',cascade:'stream-rock'},birds:['nh-kingfisher','nh-vireo','ne-goose','nh-mallard','nh-heron','nh-wood-duck'],animals:['nh-spring-peeper']},
    moosehead:{beds:{lake:'lapping-boreal',canopy:'leaves-boreal',cascade:'stream-rock'},birds:['loon-moosehead','me-kinglet','ne-goose','me-black-duck','nh-mallard','nh-kingfisher','me-chickadee'],animals:['maine-green-frog']}
  };
  // Sound source, useful audible range in metres, and source gain.
  const birds={
    "ak-goose":["goose","grazing",370],
    "ne-goose":["goose","grazing",370],
    "ak-mallard":["mallard","water",170],
    "ch-mallard":["mallard","water",170],
    "nh-mallard":["mallard","water",170],
    "ak-raven":["raven","rock",265],
    "ch-raven":["raven","rock",265],
    "az-raven":["raven","rock",265],
    "cl-raven":["raven","rock",265],
    "ak-dipper":["dipper","bank",110],
    "yo-dipper":["dipper","bank",110],
    "ch-accentor":["accentor","rock",115],
    "ch-wagtail":["wagtail","bank",95],
    "az-peregrine":["peregrine","rock",230],
    "az-rock-wren":["rock-wren","rock",115],
    "az-merganser":["merganser","water",145],
    "yo-chickadee":["mountain-chickadee","tree",90],
    "yo-acorn":["acorn-woodpecker","tree",115],
    "cl-bluebird":["bluebird","ground",110],
    "cl-junco":["junco","ground",100],
    "cl-robin":["robin","tree",130],
    "no-eider":["eider","water",175],
    "no-gull":["common-gull","coast",250],
    "no-tern":["tern","coast",180],
    "nz-tui":["tui","tree",150],
    "nz-tomtit":["tomtit","lowTree",85],
    "nz-fantail":["fantail","lowTree",85],
    "nz-shelduck":["shelduck","water",165],
    "me-black-duck":["black-duck","water",150],
    "me-chickadee":["chickadee","tree",95],
    "nh-heron":["heron","bank",175],
    "nh-wood-duck":["wood-duck","water",135],
    "jay":["jay","tree",155],
    "thrush":["thrush","lowTree",120],
    "nutcracker":["nutcracker","tree",150],
    "chough":["chough","rock",220],
    "dunnock":["dunnock","lowTree",90],
    "canyon-wren":["canyon-wren","rock",135],
    "poorwill":["poorwill","ground",135],
    "kittiwake":["kittiwake","coast",275],
    "oystercatcher":["oystercatcher","coast",220],
    "meadow-pipit":["pipit","ground",100],
    "bellbird":["bellbird","tree",140],
    "kea":["kea","rock",225],
    "loon-moosehead":["loon","water",540],
    "loon-winnipesaukee":["loon","water",540],
    "nh-vireo":["vireo","tree",105],
    "nh-kingfisher":["kingfisher","bank",160],
    "me-kinglet":["kinglet","tree",85]
  };
  const sizes={
    "goose":[0.95,1.72],
    "mallard":[0.58,0.88],
    "raven":[0.65,1.31],
    "dipper":[0.18,0.28],
    "accentor":[0.18,0.32],
    "wagtail":[0.18,0.28],
    "peregrine":[0.46,1.03],
    "rock-wren":[0.15,0.23],
    "merganser":[0.63,0.88],
    "shama":[0.25,0.29],
    "plover":[0.26,0.66],
    "nene":[0.64,1.26],
    "cardinal":[0.19,0.3],
    "mountain-chickadee":[0.14,0.2],
    "acorn-woodpecker":[0.22,0.43],
    "nuthatch":[0.11,0.2],
    "hairy-woodpecker":[0.24,0.39],
    "tanager":[0.18,0.28],
    "bluebird":[0.18,0.35],
    "junco":[0.16,0.23],
    "robin":[0.25,0.37],
    "eider":[0.61,0.97],
    "common-gull":[0.42,1.13],
    "tern":[0.35,0.81],
    "tui":[0.3,0.43],
    "tomtit":[0.13,0.22],
    "fantail":[0.16,0.23],
    "shelduck":[0.64,1.1],
    "black-duck":[0.57,0.88],
    "chickadee":[0.14,0.2],
    "heron":[1.02,1.72],
    "wood-duck":[0.49,0.74],
    "jay":[0.32,0.47],
    "thrush":[0.18,0.3],
    "nutcracker":[0.3,0.59],
    "chough":[0.38,0.8],
    "dunnock":[0.14,0.21],
    "canyon-wren":[0.15,0.2],
    "poorwill":[0.2,0.41],
    "shearwater":[0.42,1.02],
    "kittiwake":[0.4,0.96],
    "oystercatcher":[0.42,0.83],
    "pipit":[0.15,0.24],
    "bellbird":[0.2,0.28],
    "kea":[0.47,0.91],
    "loon":[0.8,1.3],
    "vireo":[0.15,0.25],
    "kingfisher":[0.33,0.52],
    "kinglet":[0.1,0.17]
  };
  const species=Object.fromEntries(Object.entries(birds).map(([id,[,habitat,reach]])=>[id,[habitat,reach,habitat==='water'?.96:.82]]));
  Object.assign(species,{
    'nh-bullfrog':['bank',125,.64],'maine-green-frog':['bank',100,.63],'nh-spring-peeper':['bank',140,.63],
    'canyon-treefrog':['bank',95,.64],'hawaiian-monk-seal':['beach',135,.73],'nz-fur-seal':['coast',180,.78],
    'american-pika':['rock',115,.62],'alpine-marmot':['meadow',230,.77],'norwegian-sheep':['meadow',145,.66],
    'golden-mantled-squirrel':['meadow',90,.64],'juneau-red-squirrel':['tree',95,.68],'douglas-squirrel':['tree',110,.69]
  });
  const phrases={
    departure:['eagle-yellowstone','eagle-peale-long'],
    encounter:['eagle-peale-long','eagle-lake-series','eagle-yellowstone'],
    perched:['eagle-chirp','eagle-peale-short'],
    shoreline:['eagle-lake-double','eagle-lake-series'],
    climbing:['eagle-young-rise','eagle-young-contact'],
    soaring:['eagle-alaska','eagle-peale-answer']
  };
  const playerCalls=Object.values(phrases).flat();
  // The eagle's bill follows each of its own calls: the loudness envelope of
  // the recording (60 frames a second, peak 1, noise floor gated) goes out
  // with an 'aerie-eagle-call' event when the phrase starts.
  const callEnvelopes=new Map();
  function callEnvelope(id,b){
    if(callEnvelopes.has(id))return callEnvelopes.get(id);
    const d=b.getChannelData(0),hop=Math.max(1,Math.round(b.sampleRate/60)),n=Math.ceil(d.length/hop),e=new Float32Array(n);
    let peak=1e-6;
    for(let i=0;i<n;i++){let sum=0;const a=i*hop,z=Math.min(d.length,a+hop);for(let j=a;j<z;j++)sum+=d[j]*d[j];e[i]=Math.sqrt(sum/Math.max(1,z-a));peak=Math.max(peak,e[i]);}
    for(let i=0;i<n;i++)e[i]=Math.max(0,(e[i]/peak-.14)/.86);
    callEnvelopes.set(id,e);return e;
  }
  function announceCall(id,buffer){
    try{window.dispatchEvent(new CustomEvent('aerie-eagle-call',{detail:{id,envelope:callEnvelope(id,buffer),rate:60}}));}catch(e){}
  }
  const aacCalls=new Set(['apapane','meadow-pipit','dunnock',...playerCalls.filter(id=>!['eagle-yellowstone','eagle-chirp','eagle-alaska'].includes(id))]);
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
  function sourceSite(id,s,world,shore,waterY){
    const [kind,reach,gain]=species[id],habitat=world.habitat,ground=world.elevation||world.height;
    const anchor=(x,y,z)=>({x,y,z,reach,gain});
    const wet=(x,z)=>habitat.wet(x,z,ground(x,z));
    if(kind==='bank'||kind==='beach'||kind==='coast'){
      if(!shore)return null;
      if(kind==='beach'){
        const beach=feature(world.landmarks||[],/beach/i,shore.x,shore.z);
        if(beach.distance>600)return null;
      }
      const level=Math.max(ground(shore.x,shore.z),Number.isFinite(world.waterLevel)?waterY:world.height(shore.x,shore.z));
      return anchor(shore.x,level+(kind==='coast'?1.5:.3),shore.z);
    }
    // Fixed sites keep a voice on its lake or hillside as the eagle passes.
    const spacing=kind==='water'?200:35;
    const ix=Math.round(s.x/spacing),iz=Math.round(s.z/spacing);
    const phase=id.charCodeAt(0)+id.length*17;
    for(const [dx,dz] of [[0,0],[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,-1]]){
      const col=ix+dx,row=iz+dz;
      const x=spacing*(col+.27*Math.sin(col*37+row*19+phase));
      const z=spacing*(row+.30*Math.sin(row*31+col*23+phase));
      if(kind==='water'){
        const level=world.wildlife?.waterAt(x,z)??waterY;
        if(wet(x,z)&&Number.isFinite(level))return anchor(x,level+.4,z);
        continue;
      }
      if(wet(x,z))continue;
      const y=habitat.surface(x,z);
      if(kind==='tree'||kind==='lowTree'||kind==='highTree'){
        if(kind==='highTree'&&y<800)continue;
        const tree=habitat.nearestTree(x,z,52);
        if(tree)return anchor(tree.x,tree.y+tree.height*(kind==='lowTree'?.18:.64),tree.z);
        continue;
      }
      const slope=Math.hypot(habitat.surface(x+5,z)-y,habitat.surface(x,z+5)-y)/5;
      const cover=world.groundCover?.(x,z)||0;
      if(kind==='meadow'&&(slope>.75||cover>.88))continue;
      if(id==='norwegian-sheep'&&(y<1||y>330))continue;
      if(id==='alpine-marmot'&&y+(world.altitudeOffset||0)<1550)continue;
      if(kind==='rock'&&slope<.16&&cover>.22)continue;
      return anchor(x,y+(kind==='rock'?1.25:.42),z);
    }
    if(kind==='water'&&shore)return anchor(shore.x,waterY+.4,shore.z);
    return null;
  }
  window.aerieFauna={scenes,species,birds,sizes,sourceSite,nearestShore};
  window.makeFieldAudio=function makeFieldAudio(context,region){
    const profile=scenes[region];
    const calls={moose:[134,.81],'white-tailed-deer':[97,.75],'red-deer':[185,.84]};
    const localMammals=(window.aerieLandWildlife?.regions[region]?.animals||[]).filter(id=>calls[id]);
    let mammalDue=0;
    if(!profile)throw new Error('Missing wildlife profile for '+region);
    const master=context.createGain();
    master.gain.value=0;
    master.connect(context.destination);
    const airBuffer=airStream(context),air=context.createGain(),shelf=context.createBiquadFilter();
    shelf.type='lowpass';shelf.frequency.value=600;air.gain.value=0;
    shelf.connect(air).connect(master);let windSource=null;
    const forward=new THREE.Vector3(),up=new THREE.Vector3();
    const buffers=new Map(), loading=new Map(), loops=new Map(), shots=new Set();
    let enabled=false, generation=0, tick=0, started=false;
    // Regional 3D soundscape (soundscapes.js): created once the world exists.
    let scape=null,scapeExtras={},scapeBeds=new Set();
    let eagleDue=0, birdDue=0, animalDue=0, birdIndex=0, animalIndex=0, wildlifeUntil=0;
    const nextPhrase=new Map();
    let previousStage=null,pending=null,quietUntil=0,loonTake=0;
    let lastEncounter=-Infinity,nextWildlifeScan=0;
    let recognized=new WeakMap();
    function resetEncounters(){
      recognized=new WeakMap();lastEncounter=-Infinity;nextWildlifeScan=0;
      if(pending==='encounter')pending=null;
    }
    function load(id){
      if(buffers.has(id))return Promise.resolve(buffers.get(id));
      if(loading.has(id))return loading.get(id);
      const format=aacCalls.has(id)?'.m4a':'.mp3';
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
        pan.panningModel='HRTF';pan.distanceModel='inverse';
        pan.refDistance=clamp(anchor.reach*.18,12,95);pan.maxDistance=anchor.reach;pan.rolloffFactor=.90;place(pan,anchor.x,anchor.y,anchor.z);
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
      if(scape&&scape.adopt(id,buffer)){scapeBeds.add(id);return;}
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
      scape?.setEnabled(value);
      const now=context.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(enabled?.86:0,now,.055);
      if(!enabled){
        if(windSource){windSource.stop(now+.32);windSource=null;}
        for(const bed of loops.values())bed.source.stop(now+.32);
        for(const shot of shots)shot.source.stop(now+.32);
        loops.clear();retireEchoes(true);
        return;
      }
      windSource=context.createBufferSource();windSource.buffer=airBuffer;windSource.loop=true;
      const breeze=windSource;breeze.connect(shelf);breeze.onended=()=>breeze.disconnect();breeze.start(0,Math.random()*airBuffer.duration);
      const token=generation;
      for(const [role,id] of Object.entries(profile.beds))load(id).then(buffer=>startBed(role,buffer,token));
      if(profile.birds.includes('loon-moosehead'))load('maine-loon-reply');
      for(const id of [...profile.birds,...profile.animals,...playerCalls])load(id);
      for(const id of localMammals)load('land-'+id);
      mammalDue=now+(started?2.3:.63);
      previousStage=null;pending=null;quietUntil=now;
      eagleDue=now+(started?random(14,24):random(3.9,5.4));
      birdDue=now+random(1.0,2.5);animalDue=now+random(7.5,11);wildlifeUntil=now;
      started=true;tick=0;
    }
    function voice(id,gain,pan,cutoff,anchor=null){
      const buffer=buffers.get(id);
      if(!buffer)return false;
      if(anchor&&scape?.engine){
        // Delay, Doppler, ISO air absorption, terrain shading and the world's
        // simulated reverberation are applied by the spatial engine.
        const s=scape.engine.play(buffer,{x:anchor.x,y:anchor.y,z:anchor.z},{gain:gain*1.1,ref:clamp(anchor.reach*.18,12,95),
          reach:anchor.reach*1.3,wet:.42,echo:anchor.reach>=220,rate:random(.982,1.015)});
        if(s&&anchor.actor)s.onUpdate=()=>{s.x=anchor.actor.x;s.y=anchor.actor.y;s.z=anchor.actor.z;};
        return !!s;
      }
      const c=channel(buffer,anchor);
      c.gain.gain.value=gain;
      if(!anchor)c.pan.pan.value=pan;
      c.filter.frequency.value=cutoff;
      c.source.playbackRate.value=random(.982,1.015);
      shots.add(c);reflectCall(c,anchor);
      c.source.onended=()=>{shots.delete(c);release(c);};
      c.source.start();return true;
    }
    function callWildlife(list,index,s,world,shore,waterY,agl){
      for(let n=0;n<list.length;n++){
        const slot=(index+n)%list.length,id=list[slot],[,reach,gain]=species[id];
        const visible=world.wildlife?.nearest(id,s,reach);
        if(!visible&&agl>reach)continue;
        const a=visible?{...visible,reach,gain}:sourceSite(id,s,world,shore,waterY);
        if(!a)continue;
        const d=Math.hypot(s.x-a.x,s.y-a.y,s.z-a.z);
        if(d>reach*.94)continue;
        const signal=gain*(1-clamp((d/reach-.54)/.46,0,1));
        const clip=id==='loon-moosehead'&&loonTake%2&&buffers.has('maine-loon-reply')?'maine-loon-reply':id;
        if(voice(clip,signal,0,14000,a)){
          if(id==='loon-moosehead')loonTake++;
          return {index:(slot+1)%list.length,duration:buffers.get(clip).duration};
        }
      }
      return null;
    }
    const ears={x:0,y:0,z:0},gustSample={},returns=new Set();
    let walls=[],nextWalls=-1,wallX=Infinity,wallY=Infinity,wallZ=Infinity;
    function reflectCall(c,anchor){
      const now=context.currentTime;
      for(const wall of walls){
        const source=anchor||ears;
        const direct=Math.hypot(source.x-ears.x,source.y-ears.y,source.z-ears.z);
        const path=wall.range+Math.hypot(source.x-wall.x,source.y-wall.y,source.z-wall.z);
        const delay=(path-direct)/343;
        if(delay<.041||delay>1.9)continue;
        const level=wall.strength*.53*(anchor?.gain||.77)/(1+Math.max(0,path-2*wall.range)/210);
        if(level<.022)continue;
        const lag=context.createDelay(2),muffle=context.createBiquadFilter(),pan=context.createStereoPanner(),send=context.createGain();
        lag.delayTime.value=delay;muffle.type='lowpass';muffle.frequency.value=7000/(1+path/360);
        pan.pan.value=clamp(wall.dx*(-forward.z)+wall.dz*forward.x,-1,1)*.92;send.gain.value=level;
        c.source.connect(lag).connect(muffle).connect(pan).connect(send).connect(master);
        const endAt=now+c.source.buffer.duration/c.source.playbackRate.value+delay+.12;
        returns.add({lag,muffle,pan,send,endAt});
      }
    }
    function retireEchoes(all=false){
      for(const e of returns)if(all||context.currentTime>=e.endAt){
        e.lag.disconnect();e.muffle.disconnect();e.pan.disconnect();e.send.disconnect();returns.delete(e);
      }
    }
    let lastShore=null,shoreX=Infinity,shoreZ=Infinity,shoreSearchLow=false;
    function update(s,world,dt,camera,stage='free'){
      if(!enabled||!s||!world)return;
      if(scape===null&&window.makeSoundscape){
        try{
          scape=window.makeSoundscape(context,world,region,master);scape.setEnabled(true);window.aerieSoundscapeDebug=scape;
          // Beds that started before the soundscape existed move into 3D now.
          for(const [id,c] of [...loops])if(scape.adopt(id,c.source.buffer)){c.source.stop();loops.delete(id);scapeBeds.add(id);}
        }catch(error){console.warn('Aerie soundscape unavailable',error);scape=false;}
      }
      if(scape)scape.update(s,camera,dt,scapeExtras);
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
      const listener=camera?.position||s;
      ears.x=listener.x;ears.y=listener.y;ears.z=listener.z;
      if(now>=nextWalls||Math.hypot(ears.x-wallX,ears.y-wallY,ears.z-wallZ)>25){
        walls=window.aerieEchoSurfaces(world,ears);nextWalls=now+.54;wallX=ears.x;wallY=ears.y;wallZ=ears.z;
      }
      retireEchoes();
      const agl=Math.max(0,s.y-world.height(s.x,s.z));
      const waterY=world.waterLevel??world.lakeLevel??(region==='canyon'?8:0);
      const waterGap=Math.max(0,s.y-waterY);
      const ground=attenuation(agl,64);
      if(Math.hypot(s.x-shoreX,s.z-shoreZ)>7||(!shoreSearchLow&&agl<365)){
        shoreX=s.x;shoreZ=s.z;shoreSearchLow=agl<365;
        lastShore=nearestShore(world.shorelines||(world.lakePolygon?[world.lakePolygon]:[]),s.x,s.z);
        // Some coastal surveys encode the waterline as an elevation contour.
        if(!lastShore&&(Number.isFinite(world.waterLevel)||region==='canyon')&&agl<365){
          const floor=world.elevation||world.height;
          const wetAt=(x,z)=>region==='canyon'?world.habitat.wet(x,z,floor(x,z)):floor(x,z)<=waterY+.3;
          const originWet=wetAt(s.x,s.z);
          outer:for(const rad of [10,22,38,64,100,165,285])for(let i=0;i<12;i++){
            const dx=Math.cos(i*Math.PI/6),dz=Math.sin(i*Math.PI/6);
            if(wetAt(s.x+dx*rad,s.z+dz*rad)===originWet)continue;
            let lo=0,hi=rad;
            for(let j=0;j<6;j++){const m=(lo+hi)/2;if(wetAt(s.x+dx*m,s.z+dz*m)===originWet)lo=m;else hi=m;}
            lastShore={x:s.x+dx*hi,z:s.z+dz*hi};break outer;
          }
        }
      }
      const shore=lastShore?Math.hypot(lastShore.x-s.x,lastShore.z-s.z):Infinity;
      const shoreGain=attenuation(Math.hypot(waterGap,shore*.65),120);
      const tree=agl<145?world.habitat.nearestTree(s.x,s.z,80):null;
      const canopy=tree?attenuation(Math.hypot(s.x-tree.x,s.y-tree.y-tree.height*.63,s.z-tree.z),30):0;
      const land=world.elevation||world.height,here=land(s.x,s.z);
      const ridge=clamp((here-(land(s.x-90,s.z-42)+land(s.x+74,s.z-53)+land(s.x+21,s.z+99))/3-3)/37,0,1);
      const exposure=clamp((agl-12)/190+.51*ridge*(1-.63*canopy),0,1);
      const gust=world.windField?.sample(s.x,s.y,s.z,s.elapsed||0,gustSample)?.gust??window.aerieWind(s.x,s.z,s.elapsed||0);
      const speed=clamp((s.airspeed||0)/32,0,1.3);
      scapeExtras={exposure,gust,canopy,shore:lastShore};
      air.gain.setTargetAtTime((.045+.12*speed+.63*exposure)*(.70+.37*gust)*(1-.46*canopy)*(window.aerieWindTrim??1),now,.55);
      shelf.frequency.setTargetAtTime(550+1320*speed+2850*exposure+530*gust,now,.55);
      for(const shot of shots){
        if(!shot.anchor)continue;
        const a=shot.anchor;
        if(a.actor){a.x=a.actor.x;a.y=a.actor.y;a.z=a.actor.z;place(shot.pan,a.x,a.y,a.z);}
        const d=Math.hypot(s.x-a.x,s.y-a.y,s.z-a.z);
        const cover=window.aerieSoundPath(world,ears,a);
        shot.gain.gain.setTargetAtTime(a.gain*(1-.57*cover)*(1-clamp((d/a.reach-.54)/.46,0,1)),now,.20);
        shot.filter.frequency.setTargetAtTime((2400+12400*attenuation(d,a.reach*.57))*Math.exp(-2.45*cover),now,.18);
      }
      const falls=profile.beds.cascade?window.aerieCascadeSource(world,ears):null;
      const ice=feature(points,/ice passage|mendenhall glacier|crevass|terminus/i,s.x,s.z);
      const rivers=feature(points,/river|sandbar|meadow|riverbank/i,s.x,s.z);
      for(const [id,c] of loops){
        let g=0,pan=0,cover=0;
        if(id==='canopy')g=(.24+.47*gust)*canopy;
        if(id==='crickets')g=.31*ground;
        if(id==='lake')g=.59*shoreGain;
        if(id==='surf')g=.73*shoreGain;
        if(id==='inlet')g=.66*shoreGain;
        if(id==='river')g=.57*ground*attenuation(rivers.distance,1200);
        if(id==='ice'&&Number.isFinite(ice.distance)){
          g=.80*attenuation(Math.hypot(ice.distance,agl*.8),960);
          if(ice.distance>1)pan=clamp((ice.dx*Math.cos(s.yaw)-ice.dz*Math.sin(s.yaw))/ice.distance,-1,1)*.68;
        }
        if(id==='cascade'&&falls){
          const dx=falls.x-ears.x,dz=falls.z-ears.z;
          cover=window.aerieSoundPath(world,ears,falls);
          const pulse=window.aerieChutePulse(falls.x,falls.z,s.elapsed||0);
          g=(.59+.14*pulse)*attenuation(falls.distance,falls.reach)*(1-.40*cover);
          pan=clamp((dx*(-forward.z)+dz*forward.x)/Math.max(1,Math.hypot(dx,dz)),-1,1)*(.88-.26*cover);
        }
        c.pan.pan.setTargetAtTime(pan,now,.45);
        c.gain.gain.setTargetAtTime(g,now,.55);
        c.filter.frequency.setTargetAtTime((2200+12000*clamp(g*1.7,0,1))*Math.exp(-2.92*cover),now,.26);
      }
      if(stage!==previousStage){
        if(stage==='push'||stage==='perched'){
          pending=stage==='push'?'departure':'perched';
          eagleDue=Math.max(quietUntil,now+(stage==='push'?.08:.8));
        }else if(previousStage===null&&stage==='free'&&!nextPhrase.size)pending='departure';
        else if(pending==='perched'&&stage!=='perched')pending=null;
        previousStage=stage;
      }
      // An animal crossing the eagle's field of view is an event in its own
      // right. The periodic cruising voice can otherwise be silent for 48s.
      if(stage==='free'&&now>=nextWildlifeScan&&now>=lastEncounter+16&&now>=quietUntil){
        nextWildlifeScan=now+.4;
        const fx=-Math.sin(s.yaw),fz=-Math.cos(s.yaw);
        const wildlife=world.wildlife?.nearby(s,88)||[];
        const sighted=wildlife.find(a=>{
          if(!a.actor||now<(recognized.get(a.actor)??-Infinity)+60)return false;
          const dx=a.x-s.x,dz=a.z-s.z,along=dx*fx+dz*fz,flat=Math.hypot(dx,dz);
          const length=a.actor.length||a.actor.height||.35;
          if(a.distance>Math.min(88,20+length*58)||(flat>5&&along<flat*.10))return false;
          if(a.kind==='Fish'&&Number.isFinite(a.actor.level)&&a.actor.level-a.y>.45)return false;
          for(let j=1;j<8;j++){
            const u=j/8;
            if(world.height(s.x+dx*u,s.z+dz*u)>s.y+(a.y-s.y)*u+.6)return false;
          }
          return true;
        });
        if(sighted){recognized.set(sighted.actor,now);lastEncounter=now;pending='encounter';eagleDue=now;}
      }
      if(now>=eagleDue&&now>=quietUntil&&(now>=wildlifeUntil||pending==='encounter')){
        const nearWater=waterGap<62&&(shore<115||Number.isFinite(world.waterLevel)&&here<waterY+.12);
        const occasion=pending||(stage==='perched'?'perched':nearWater?'shoreline':
          s.effort>.5||s.verticalSpeed>2.6?'climbing':'soaring');
        const choices=phrases[occasion];
        let index=nextPhrase.get(occasion)??Math.floor(Math.random()*choices.length);
        // A slow or missing download should never silence the other available phrase.
        if(!buffers.has(choices[index])){const available=choices.findIndex(id=>buffers.has(id));if(available>=0)index=available;}
        const id=choices[index];
        if(voice(id,occasion==='encounter'?.95:occasion==='perched'?.59:.70,-.10,15500)){
          announceCall(id,buffers.get(id));
          wildlifeUntil=Math.max(wildlifeUntil,now+buffers.get(id).duration+.3);
          nextPhrase.set(occasion,(index+1)%choices.length);pending=null;
          quietUntil=now+buffers.get(id).duration+2.8;
          eagleDue=now+random(stage==='perched'?19:27,stage==='perched'?36:48);
        }else eagleDue=now+.5;
      }
      // wildlifeUntil already covers the complete eagle phrase. Give a nearby
      // mammal its turn before an ambient bird starts during the eagle's rest.
      if(localMammals.length&&now>=mammalDue&&now>=wildlifeUntil){
        mammalDue=now+1.3;
        for(const id of localMammals){
          const [reach,gain]=calls[id],actor=world.wildlife?.land?.caller(id,s,reach);
          if(!actor)continue;
          const anchor={x:actor.x,y:actor.y,z:actor.z,actor,reach,gain};
          if(voice('land-'+id,gain,0,11500,anchor)){
            wildlifeUntil=now+buffers.get('land-'+id).duration+.5;
            mammalDue=now+random(34,63);break;
          }
        }
      }
      if(now>=wildlifeUntil&&now>=animalDue){
        const call=callWildlife(profile.animals,animalIndex,s,world,lastShore,waterY,agl);
        animalDue=now+(call?random(24,43):2.3);
        if(call){animalIndex=call.index;wildlifeUntil=now+call.duration+.6;}
      }
      if(now>=wildlifeUntil&&now>=birdDue){
        const call=callWildlife(profile.birds,birdIndex,s,world,lastShore,waterY,agl);
        birdDue=now+(call?random(8,17):1.3);
        if(call){birdIndex=call.index;wildlifeUntil=now+call.duration+.6;}
      }
    }
    return {setEnabled,update,resetEncounters,output:master};
  };
})();
