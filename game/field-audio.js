// Regional recordings, world-space wildlife voices, and exposed-air wind.
(() => {
  // The player travels with the same voice. Wild callers belong to their
  // destination and are emitted from a suitable place in the terrain.
  const scenes = {
    alaska:{beds:{lake:'lapping-glacial',canopy:'leaves-boreal',ice:'ice',cascade:'falls-spray'},birds:['jay','thrush','ak-goose','ak-raven','ak-mallard','ak-dipper'],animals:['juneau-red-squirrel']},
    swiss:{beds:{lake:'lapping-glacial',canopy:'leaves-alpine',cascade:'falls-spray'},birds:['chough','dunnock','ch-accentor','ch-wagtail','ch-raven','ch-mallard'],animals:['alpine-marmot']},
    canyon:{beds:{river:'stream-rock'},birds:['canyon-wren','poorwill','az-raven','az-peregrine','az-rock-wren','az-merganser'],animals:['canyon-treefrog']},
    napali:{beds:{surf:'surf',cascade:'falls-spray'},birds:['kauai-shearwater','apapane','hi-nene','hi-plover','hi-shama','hi-cardinal'],animals:['hawaiian-monk-seal']},
    yosemite:{beds:{canopy:'leaves-montane',river:'stream-forest',cascade:'falls-spray'},birds:['nutcracker','thrush','jay','yo-chickadee','yo-dipper','yo-acorn'],animals:['douglas-squirrel']},
    bryce:{beds:{canopy:'leaves-montane'},birds:['bryce-raven','poorwill','bc-chickadee','bc-nuthatch','bc-woodpecker','bc-tanager'],animals:['golden-mantled-squirrel']},
    crater:{beds:{lake:'lapping-caldera',canopy:'leaves-montane'},birds:['nutcracker','jay','cl-bluebird','cl-junco','cl-robin','cl-raven'],animals:['american-pika']},
    lofoten:{beds:{inlet:'inlet'},birds:['kittiwake','oystercatcher','meadow-pipit','no-eider','no-gull','no-tern'],animals:['norwegian-sheep']},
    milford:{beds:{lake:'lapping-fjord',cascade:'falls-spray'},birds:['bellbird','kea','nz-shelduck','nz-fantail','nz-tomtit','nz-tui'],animals:['nz-fur-seal']},
    winnipesaukee:{beds:{lake:'lapping-islands',canopy:'leaves-hardwood'},birds:['loon-winnipesaukee','nh-vireo','ne-goose','nh-mallard','me-black-duck','nh-heron','nh-kingfisher'],animals:['nh-bullfrog']},
    surry:{beds:{lake:'lapping-reservoir',canopy:'leaves-hardwood',river:'stream-forest'},birds:['nh-kingfisher','nh-vireo','ne-goose','nh-mallard','nh-heron','nh-wood-duck'],animals:['nh-spring-peeper']},
    moosehead:{beds:{lake:'lapping-boreal',canopy:'leaves-boreal'},birds:['loon-moosehead','me-kinglet','ne-goose','me-black-duck','nh-mallard','nh-kingfisher','me-chickadee'],animals:['maine-green-frog']}
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
    "bryce-raven":["raven","rock",265],
    "cl-raven":["raven","rock",265],
    "ak-dipper":["dipper","bank",110],
    "yo-dipper":["dipper","bank",110],
    "ch-accentor":["accentor","rock",115],
    "ch-wagtail":["wagtail","bank",95],
    "az-peregrine":["peregrine","rock",230],
    "az-rock-wren":["rock-wren","rock",115],
    "az-merganser":["merganser","water",145],
    "hi-shama":["shama","lowTree",130],
    "hi-plover":["plover","coast",145],
    "hi-nene":["nene","grazing",220],
    "hi-cardinal":["cardinal","tree",110],
    "yo-chickadee":["mountain-chickadee","tree",90],
    "bc-chickadee":["mountain-chickadee","tree",90],
    "yo-acorn":["acorn-woodpecker","tree",115],
    "bc-nuthatch":["nuthatch","tree",90],
    "bc-woodpecker":["hairy-woodpecker","tree",100],
    "bc-tanager":["tanager","tree",105],
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
    "kauai-shearwater":["shearwater","coast",210],
    "apapane":["apapane","highTree",125],
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
    "apapane":[0.14,0.22],
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
    perched:['eagle-chirp','eagle-peale-short'],
    shoreline:['eagle-lake-double','eagle-lake-series'],
    climbing:['eagle-young-rise','eagle-young-contact'],
    soaring:['eagle-alaska','eagle-peale-answer']
  };
  const playerCalls=Object.values(phrases).flat();
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
        const beach=feature(world.landmarks||[],/Kalalau Beach|beach/i,shore.x,shore.z);
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
    let eagleDue=0, birdDue=0, animalDue=0, birdIndex=0, animalIndex=0, wildlifeUntil=0;
    const nextPhrase=new Map();
    let previousStage=null,pending=null,quietUntil=0,loonTake=0;
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
      for(const [role,id] of Object.entries(profile.beds))load(id).then(buffer=>startBed(role,buffer,token));
      if(region==='moosehead')load('maine-loon-reply');
      for(const id of [...profile.birds,...profile.animals,...playerCalls])load(id);
      previousStage=null;pending=null;quietUntil=now;
      eagleDue=now+(started?random(14,24):random(3.9,5.4));
      birdDue=now+random(1.0,2.5);animalDue=now+random(7.5,11);wildlifeUntil=now;
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
    let lastShore=null,shoreX=Infinity,shoreZ=Infinity,shoreSearchLow=false;
    function update(s,world,dt,camera,stage='free'){
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
        const a=shot.anchor;
        if(a.actor){a.x=a.actor.x;a.y=a.actor.y;a.z=a.actor.z;place(shot.pan,a.x,a.y,a.z);}
        const d=Math.hypot(s.x-a.x,s.y-a.y,s.z-a.z);
        shot.gain.gain.setTargetAtTime(a.gain*(1-clamp((d/a.reach-.54)/.46,0,1)),now,.20);
        shot.filter.frequency.setTargetAtTime(2400+12400*attenuation(d,a.reach*.57),now,.28);
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
      if(stage!==previousStage){
        if(stage==='push'||stage==='perched'){
          pending=stage==='push'?'departure':'perched';
          eagleDue=Math.max(quietUntil,now+(stage==='push'?.08:.8));
        }else if(previousStage===null&&stage==='free'&&!nextPhrase.size)pending='departure';
        else if(pending==='perched'&&stage!=='perched')pending=null;
        previousStage=stage;
      }
      if(now>=eagleDue&&now>=quietUntil&&now>=wildlifeUntil){
        const nearWater=waterGap<62&&(shore<115||Number.isFinite(world.waterLevel)&&here<waterY+.12);
        const occasion=pending||(stage==='perched'?'perched':nearWater?'shoreline':
          s.effort>.5||s.verticalSpeed>2.6?'climbing':'soaring');
        const choices=phrases[occasion];
        let index=nextPhrase.get(occasion)??Math.floor(Math.random()*choices.length);
        // A slow or missing download should never silence the other available phrase.
        if(!buffers.has(choices[index])&&buffers.has(choices[(index+1)%choices.length]))index=(index+1)%choices.length;
        const id=choices[index];
        if(voice(id,occasion==='perched'?.59:.70,-.10,15500)){
          nextPhrase.set(occasion,(index+1)%choices.length);pending=null;
          quietUntil=now+buffers.get(id).duration+2.8;
          eagleDue=now+random(stage==='perched'?19:27,stage==='perched'?36:48);
        }else eagleDue=now+.5;
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
    return {setEnabled,update,output:master};
  };
})();
