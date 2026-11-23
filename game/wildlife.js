// Encounters live at stable sites. A cell is generated from its coordinates,
// so returning to a cove restores the same flock composition and identities.
window.addRegionalWildlife=function(T,scene,w){
  const region=w.region,{birds,sizes,species,scenes}=window.aerieFauna,profile=scenes[region];
  const ground=w.elevation||w.height,h=w.habitat,models=window.makeWildlifeModels(T,scene,region);
  const land=window.makeLandWildlife(T,scene,w);
  const patchWildlife=profile.patchWildlife||[];
  const feedingFish={dixville:'brook-trout',moosehead:'atlantic-salmon',labrador:'brook-trout'}[region];
  const stations={yellowstone:[-748,-443],alaska:[-424,-476],swiss:[-613,437],canyon:[-322,-32],yosemite:[-728,1256],
    crater:[-3209,1679],lofoten:[923,2104],acadia:[636,-789],
    winnipesaukee:[1210,1854],moosehead:[648,-662],surry:[-1142,-3101]};
  const tau=2*Math.PI,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const sCurve=f=>{f=clamp(f,0,1);return f*f*(3-2*f);};
  function randomAt(x,z){
    let seed=(Math.imul(x|0,196613)^Math.imul(z|0,393241)^Math.imul(region.charCodeAt(0),2654435761))>>>0;
    return ()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
  }
  let lakeOffset=0;
  scene.traverse(o=>{if(o.isWater&&Number.isFinite(w.waterLevel))lakeOffset=o.position.y-w.waterLevel;});
  function waterAt(x,z,t){
    if(w.yellowstone?.river.poolAt(x,z))return -Infinity;
    const channel=w.channelWater?.(x,z);
    if(Number.isFinite(channel))return channel;
    const y=ground(x,z);
    if(!h.wet(x,z,y))return -Infinity;
    if(w.acadiaLights?.seaSurface&&Number.isFinite(t))return w.acadiaLights.seaSurface(x,z,t);
    return Number.isFinite(w.waterLevel)?w.waterLevel+lakeOffset:h.surface(x,z);
  }
  function findWater(x,z,radius){
    for(let i=0;i<=80;i++){
      const r=radius*Math.sqrt(i/80),a=2.39996*i;
      const px=x+r*Math.cos(a),pz=z+r*Math.sin(a),y=waterAt(px,pz);
      if(Number.isFinite(y))return {x:px,y,z:pz};
    }
    return null;
  }
  function findDry(x,z,radius,gentle=false,patch=false){
    for(let i=0;i<96;i++){
      const r=radius*Math.sqrt(i/95),a=i*2.39996;
      const px=x+r*Math.cos(a),pz=z+r*Math.sin(a);
      if(Number.isFinite(waterAt(px,pz))||patch&&w.yellowstone?.river?.poolAt(px,pz))continue;
      const y=h.surface(px,pz);
      if(gentle&&Math.hypot(h.surface(px+2,pz)-y,h.surface(px,pz+2)-y)>1.45)continue;
      if((w.clearance||w.height)(px,pz)>y+2)continue;
      return {x:px,y,z:pz};
    }
    return null;
  }
  const ripples=window.makeFishRipples(T,scene,w,waterAt);
  const floatingDucks=window.aerieWaterContacts?.floatingDuckContact(region);
  // Resolve floating contact and velocity after flock spacing.
  const isDuck=skin=>/^(mallard|black-duck|wood-duck|merganser|eider|shelduck)(-hen)?$/.test(skin);
  function duckContact(a,t){
    if(!floatingDucks||!isDuck(a.skin))return;
    const prev=a.floatContact;
    if(a.mode!==-1||a.behavior!=='paddling'){a.floatContact=null;return;}
    const level=waterAt(a.x,a.z,t);
    if(!Number.isFinite(level)){a.floatContact=null;return;}
    const valid=prev&&t-prev.t>0&&t-prev.t<.25;
    const step=valid?t-prev.t:0;
    let heading=valid?prev.heading:a.heading,speed=0;
    if(valid){
      const dx=a.x-prev.x,dz=a.z-prev.z,v=Math.hypot(dx,dz)/step;
      speed=prev.speed+(Math.min(v,1.5)-prev.speed)*(1-Math.exp(-step*4));
      if(v>.035&&v<2.2){const wanted=Math.atan2(dz,dx),d=wanted-heading;
        heading+=Math.atan2(Math.sin(d),Math.cos(d))*(1-Math.exp(-step*3.6));}
    }
    const c=Math.cos(heading),q=Math.sin(heading),L=a.length,r=.30*L;
    const fore=waterAt(a.x+r*c,a.z+r*q,t),aft=waterAt(a.x-r*c,a.z-r*q,t);
    const across=.18*L;
    const sideA=waterAt(a.x-across*q,a.z+across*c,t),sideB=waterAt(a.x+across*q,a.z-across*c,t);
    const pitch=Number.isFinite(fore)&&Number.isFinite(aft)?clamp(Math.atan2(fore-aft,2*r),-.14,.14):0;
    const bank=Number.isFinite(sideA)&&Number.isFinite(sideB)?clamp(Math.atan2(sideB-sideA,2*across),-.12,.12):0;
    const smooth=valid?1-Math.exp(-8*step):1;
    // Correct the pivot of the duck model at the water surface.
    const trim=L*.102 + L*.025*(1-sCurve((t-(valid?prev.since:t))/.65));
    a.y=level+trim; a.level=level; a.heading=heading;
    a.pitch=valid?prev.pitch+(pitch-prev.pitch)*smooth:pitch;
    a.bank=valid?prev.bank+(bank-prev.bank)*smooth:bank;
    a.floatContact={x:a.x,z:a.z,t,heading,speed,pitch:a.pitch,bank:a.bank,since:valid?prev.since:t};
    a.emitDuckWake=!!valid&&speed>.095&&t-(a.lastDuckWake??-10)>.19;
    if(a.emitDuckWake){
      a.lastDuckWake=t;
      if(w.waterContacts){
        w.waterContacts.emit(a.x+c*L*.18,a.z+q*L*.18,heading,speed,L,t);
        a.emitDuckWake=false;
      }
    }
    a.duckWakeWet=waterAt;
  }
  const eggRock=region==='acadia'?window.makeAcadiaHarborSeals?.(T,scene,w,waterAt,ripples.emit):null;
  const fish=window.makeFishSchools(region,waterAt,ripples.emit),sites=new Map(),dormantSites=new Map();
  const social={
    'barred-owl':[1,1],'harbor-seal':[1,2],loon:[1,2],goose:[5,15],nene:[2,5],mallard:[3,12],'black-duck':[2,8],'wood-duck':[2,6],
    merganser:[2,7],eider:[5,22],shelduck:[2,4],heron:[1,1],kingfisher:[1,1],dipper:[1,2],
    kittiwake:[4,18],'common-gull':[2,9],tern:[2,8],oystercatcher:[2,5],shearwater:[2,9],
    raven:[1,3],peregrine:[1,1],kea:[2,6],chough:[4,16],chickadee:[3,8],'mountain-chickadee':[3,8],
    osprey:[1,1],'double-crested-cormorant':[2,3],killdeer:[1,2],'golden-mantled-squirrel':[1,2],
    kinglet:[2,6],nuthatch:[2,7],junco:[3,10],nutcracker:[2,6],'acorn-woodpecker':[3,8],
    'norwegian-sheep':[4,10],'nz-fur-seal':[2,7],'hawaiian-monk-seal':[1,2],'alpine-marmot':[2,5]
  };
  const bodySizes={'harbor-seal':1.51,'juneau-red-squirrel':.32,'douglas-squirrel':.31,'golden-mantled-squirrel':.27,'american-pika':.18,
    'alpine-marmot':.57,'norwegian-sheep':1.25,'nz-fur-seal':1.57,'hawaiian-monk-seal':2.1,
    'maine-green-frog':.084,'nh-bullfrog':.15,'nh-spring-peeper':.032,'canyon-treefrog':.049};
  function placeGroup(site,id,random,groundGeese=false,patch=false){
    const isBird=!!birds[id],skin=isBird?birds[id][0]:id,hab=species[id][0];
    const aquatic=hab==='water',coast=['coast','beach','bank'].includes(hab);
    let onTree=/tree/i.test(hab);
    const goose=skin==='goose'||skin==='nene',seabird=['shearwater','kittiwake','tern','common-gull','osprey','double-crested-cormorant'].includes(skin);
    const origin=site.water||site,angle=random()*tau;
    const distance=aquatic?(skin==='loon'?27:2.5+random()*3):20+random()*36;
    const x=site.anchor?.x??origin.x+Math.cos(angle)*distance,z=site.anchor?.z??origin.z+Math.sin(angle)*distance;
    let base,tree;
    if(aquatic){if(!site.water)return;base=findWater(x,z,12)||site.water;}
    else if(onTree){
      tree=h.nearestTree(x,z,site.curated?230:86);
      if(!tree||hab==='highTree'&&tree.y<800)return;
      base={x:tree.x+tree.width*.30,y:tree.y+tree.height*(hab==='lowTree'?.29:.63),z:tree.z};
    }else if(coast){
      if(!site.water)return;
      base=findDry(x,z,105,skin==='killdeer'||skin==='double-crested-cormorant',patch);
      if(!base&&!patch&&(seabird||skin==='heron'))base=site.water;
      if(skin==='osprey'&&base){
        const perch=h.nearestTree(base.x,base.z,38);
        if(perch&&perch.height>5){
          base={x:perch.x,y:perch.y+perch.height*.86,z:perch.z};onTree=true;
        }
      }
    }else base=findDry(x,z,site.curated?150:65,goose||hab==='meadow',patch);
    if(!base)return;
    if(skin==='harbor-seal'&&eggRock?.contains(base.x,base.z))return;
    if(skin==='harbor-seal'&&(base.y>w.waterLevel+3.5||Math.hypot(base.x-site.water.x,base.z-site.water.z)>40))return;
    if(skin==='norwegian-sheep'&&(base.y<.4||base.y>330))return;
    if(skin==='alpine-marmot'&&base.y+(w.altitudeOffset||0)<1550)return;
    if(skin==='hawaiian-monk-seal'&&!w.landmarks.some(p=>/beach/i.test(p.name)&&Math.hypot(p.x-base.x,p.z-base.z)<700))return;
    const [lo,hi]=groundGeese?[3,8]:(social[skin]||[1,2]);
    const count=Math.min(patch?4:Infinity,lo+Math.floor(random()**1.35*(hi-lo+1)));
    const bearing=random()*tau,flock={id,skin,base,group:[],aquatic,onTree,goose:goose&&!groundGeese,seabird,isBird,
      groundGeese,angle:bearing,clock:random()*20,period:goose?67:seabird?48:24+random()*17,
      radius:goose?73:seabird?62:skin==='peregrine'?65:Math.max(5,(sizes[skin]?.[1]||.5)*25),salt:random()*tau};
    if(flock.goose||seabird)flock.clock=flock.period*.52;
    if(groundGeese)flock.clock=0;
    for(let k=0;k<count;k++){
      const length=(sizes[skin]?.[0]||bodySizes[skin])*(.9+.2*random()),spread=goose?2.4:aquatic?1.25:onTree?.57:length*1.9;
      const r=spread*Math.sqrt(k+.25),dir=k*2.4+flock.salt;
      let px=base.x+Math.cos(dir)*r,pz=base.z+Math.sin(dir)*r,level=waterAt(px,pz);
      if(aquatic&&!Number.isFinite(level)){const near=findWater(px,pz,4);if(!near)continue;px=near.x;pz=near.z;level=near.y;}
      if(!aquatic&&!onTree&&(!seabird||patch)&&Number.isFinite(level))continue;
      if(patch&&w.yellowstone?.river?.poolAt(px,pz))continue;
      const variant=k%2===1&&['mallard','shelduck','eider'].includes(skin)?skin+'-hen':skin;
      const a={id,residentId:region+'/'+site.key+'/'+site.flocks.length+'/'+id+'/'+k,skin:variant,length,homeX:px,homeZ:pz,homeY:onTree?base.y:
        aquatic?level:h.surface(px,pz),x:px,y:base.y,z:pz,heading:bearing,phase:random()*tau,seed:random()*tau,
        effort:0,mode:0,level:0,rank:k,pitch:0,bank:0};
      flock.group.push(a);
    }
    if(flock.group.length)site.flocks.push(flock);
  }
  function makeSite(key,x,z,curated){
    if(resumeSite(key))return sites.get(key);
    const random=randomAt(x,z),water=findWater(x,z,curated?140:86);
    const site={key,x,z,water,curated,flocks:[],schools:[]};
    for(const id of [...(profile.wildlifeBirds||profile.birds),...profile.animals]){
      if(!curated&&random()<.52)continue;
      placeGroup(site,id,random);
      if(birds[id]?.[0]==='goose'&&(curated||random()<.37))placeGroup(site,id,random,true);
    }
    // One extra species per streamed site keeps the local instancing and
    // swimming-separation work bounded. The habitat departure can show more.
    if(patchWildlife.length){
      const patchRandom=randomAt(x+379,z-571);
      if(curated){
        for(const id of patchWildlife)placeGroup(site,id,patchRandom,false,true);
      }else if(patchRandom()<.64){
        const id=patchWildlife[Math.floor(patchRandom()*patchWildlife.length)];
        placeGroup(site,id,patchRandom,false,true);
      }
    }
    if(water)site.schools=fish.populate({...water,findWater},random,curated);
    sites.set(key,site);return site;
  }
  function resumeSite(key){
    const saved=dormantSites.get(key);if(!saved)return false;
    dormantSites.delete(key);sites.set(key,saved);return true;
  }
  function stockNearbyShore(player){
    // Open-water flights cross the large bird habitat cells between their
    // centres. Stock persistent feeding pockets on the actual nearshore shelf.
    const spacing=94,cx=Math.round(player.x/spacing),cz=Math.round(player.z/spacing);
    for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){
      const col=cx+i,row=cz+j,key='shore:'+col+','+row;
      if(sites.has(key)||resumeSite(key))continue;
      const random=randomAt(col+137,row-251);
      const x=(col+(random()-.5)*.46)*spacing,z=(row+(random()-.5)*.46)*spacing;
      if(Math.hypot(x-player.x,z-player.z)>145)continue;
      const site={key,x,z,curated:false,flocks:[],schools:[]};sites.set(key,site);
      if(Math.hypot(x-resident.x,z-resident.z)<165||!Number.isFinite(waterAt(x,z)))continue;
      let bank=false;
      for(let k=0;k<8;k++){
        const a=k*tau/8;
        if(!Number.isFinite(waterAt(x+Math.cos(a)*94,z+Math.sin(a)*94))){bank=true;break;}
      }
      if(bank&&random()<.80)site.schools=fish.populate({x,z,findWater},random,false);
    }
  }
  let resident,launch,lastTime=-1,nextCheck=0;
  function prepare(){
    if(resident)return;
    const fishing=window.ATLAS_SURVEYS?.[region]?.fishing;
    const [sx,sz]=fishing?[fishing.x,fishing.z]:stations[region];
    const near=findWater(sx,sz,150);
    if(!near)throw Error('Missing surveyed wildlife water at '+region);
    // Favour a short run of navigable water so the departure sees animals
    // before shore. Steep banks and trees are included in the approach clearance.
    let best=-Infinity,pick;
    for(let j=0;j<16;j++){
      const a=j*tau/16,dx=Math.cos(a),dz=Math.sin(a);
      for(const shift of [0,5,12,22]){
        const x=near.x+dx*shift,z=near.z+dz*shift,y=waterAt(x,z);
        if(!Number.isFinite(y))continue;
        const bx=x-dx*16,bz=z-dz*16;
        const score=[-16,-8,3,7,15,25].filter(d=>Number.isFinite(waterAt(x+dx*d,z+dz*d))).length-
          Math.max(0,(w.clearance||w.height)(bx,bz)-y)*.8-shift*.009;
        if(score>best){best=score;pick={x,z,y,bx,bz};}
      }
    }
    resident=makeSite('shallows',pick.x,pick.z,true);
    if(region==='winnipesaukee'){
      const weirs=w.landmarks.find(p=>p.name==='Weirs Beach');
      const water=weirs&&findWater(weirs.x,weirs.z,235);
      if(water){
        const site={key:'weirs-cormorant',x:water.x,z:water.z,water,curated:true,flocks:[],schools:[]};
        placeGroup(site,'patch-cormorant',randomAt(site.x,site.z),false,true);
        if(site.flocks.length)sites.set(site.key,site);
      }
    }
    // Adult sockeye hold in Steep Creek's tributary current and can be seen
    // from the elevated salmon platforms. The lake's resident site remains alive.
    if(w.steepCreek)for(const [x,z] of w.steepCreek.fish){
      const key='steep-creek:'+x+','+z,schoolSite={key,x,z,curated:true,flocks:[],schools:[]};
      const station={x,z,findWater,stream:w.steepCreek.holding};
      schoolSite.schools=fish.populate(station,randomAt(x,z),true,['sockeye']);
      if(schoolSite.schools.length)sites.set(key,schoolSite);
    }
    if(region==='acadia'){
      // A low intertidal haul-out on Boulder Beach and a hunting perch at the
      // wooded rim of Newport Cove both sit outside the open-water eider raft.
      for(const [key,id,x,z] of [['boulder-ledge','harbor-seal',-84,490],['newport-spruce','acadia-barred-owl',151,-1034]]){
        const site={key,x,z,anchor:{x,z},water:id==='harbor-seal'?findWater(x,z,36):null,curated:true,flocks:[],schools:[]};
        placeGroup(site,id,randomAt(x,z));
        if(site.flocks.length)sites.set(key,site);
      }
    }
    // The beach, high native forest and reservoir are different habitats.
    // Give absent forest birds an actual crown in their elevation band.
    const absent=profile.birds.filter(id=>!resident.flocks.some(f=>f.id===id)&&/tree/i.test(birds[id][1]));
    if(absent.length){
      const high=absent.some(id=>birds[id][1]==='highTree');let bestTree,cost=Infinity;
      for(let i=0;i<(w.trees?.length||0);i+=7){
        const tr=w.trees[i];if(tr.height<6||high&&tr.y<805)continue;
        const d=Math.hypot(tr.x-w.spawn.x,tr.z-w.spawn.z);if(d<cost){cost=d;bestTree=tr;}
      }
      if(bestTree){
        const site={key:'woodland',curated:true,x:bestTree.x,z:bestTree.z,flocks:[],schools:[]};
        const rng=randomAt(site.x,site.z);
        for(const id of absent)placeGroup(site,id,rng);
        sites.set(site.key,site);w.landmarks.push({name:'Forest bird lookout',x:site.x,z:site.z,discoveryRadius:110});
      }
    }
    let launchHeight=4.8;
    const clearance=w.flightClearance||w.clearance||w.height;
    const wind=w.windField.sample(pick.x,pick.y+5,pick.z,0);
    launch={x:pick.bx,y:Math.max(pick.y,clearance(pick.bx,pick.bz))+launchHeight,z:pick.bz,
      yaw:Math.atan2(pick.bx-pick.x,pick.bz-pick.z),glance:0};
    const crossesBank=[35,60,85,110,135,160,185,210,235,260,285].some(d=>{
      const x=launch.x-Math.sin(launch.yaw)*d+wind.windX*d/15;
      const z=launch.z-Math.cos(launch.yaw)*d+wind.windZ*d/15;
      return !Number.isFinite(waterAt(x,z))||clearance(x,z)>launch.y-1.5;
    });
    // Start over the surveyed Merced bend and cross the resident shallows on their open side.
    const shoreStart={yosemite:[-704.04,1237.95,12]}[region];
    if(shoreStart&&Number.isFinite(waterAt(shoreStart[0],shoreStart[1]))){
      const [x,z,height]=shoreStart,dx=pick.x-x,dz=pick.z-z,length=Math.hypot(dx,dz);
      const alongX=dx/length,alongZ=dz/length,sideX=-alongZ,sideZ=alongX;
      // Aim into the crosswind so the initial ground track follows the shore.
      const cross=clamp((wind.windX*sideX+wind.windZ*sideZ)/15,-.8,.8);
      const forward=Math.sqrt(1-cross*cross);
      launchHeight=height;
      launch={x,y:Math.max(waterAt(x,z),clearance(x,z))+launchHeight,z,
        yaw:Math.atan2(-forward*alongX+cross*sideX,-forward*alongZ+cross*sideZ),glance:0};
    }else if(feedingFish||crossesBank){
      // Survey the whole low pass. A short patch of open water can aim the
      // eagle straight into the opposite canyon wall.
      let bestRun=-Infinity,course;
      const passEnd=feedingFish?158:300,fullPass=Math.floor((passEnd+29)/7)+1;
      // Inspect headings away from sun glitter first. A clear full-length
      // pass on the least reflective remaining bearing is already optimal.
      const bearings=Array.from({length:32},(_,i)=>{
        const dx=Math.cos(i*tau/32),dz=Math.sin(i*tau/32);
        return {dx,dz,glare:Math.max(0,dx*w.sunDirection.x+dz*w.sunDirection.z)};
      }).sort((a,b)=>a.glare-b.glare);
      for(const {dx,dz,glare} of bearings){
        const rightX=-dz,rightZ=dx;
        const bx=pick.x-dx*29,bz=pick.z-dz*29;
        if(!Number.isFinite(waterAt(bx,bz)))continue;
        let clearSamples=0;
        for(let d=-29;d<=passEnd;d+=7){
          const seconds=(d+29)/17.5;
          const x=pick.x+dx*d+wind.windX*seconds,z=pick.z+dz*d+wind.windZ*seconds;
          if([0,5,-3].every(off=>{
            const px=x+rightX*off,pz=z+rightZ*off,water=waterAt(px,pz);
            return Number.isFinite(water)&&(feedingFish||clearance(px,pz)<water+5);
          }))clearSamples++;
          else break;
        }
        const score=clearSamples-.45*glare;
        if(score>bestRun){bestRun=score;course={dx,dz,rightX,rightZ,bx,bz};}
        if(clearSamples===fullPass)break;
      }
      if(course){
        const {dx,dz,rightX,rightZ,bx,bz}=course;
        launchHeight=feedingFish?2.65:9;
        launch={x:bx,y:Math.max(pick.y,clearance(bx,bz))+launchHeight,z:bz,yaw:Math.atan2(-dx,-dz),glance:feedingFish?-19:0};
        // Keep feeding fish on the visible side of the right-shoulder camera.
        if(feedingFish)for(const d of [15,43,76,112,148]){
          const drift=(d+29)/17.5;
          const x=pick.x+dx*d+rightX*3.1+wind.windX*drift,z=pick.z+dz*d+rightZ*3.1+wind.windZ*drift;
          if(!Number.isFinite(waterAt(x,z)))continue;
          const feeding=fish.populate({x,z,findWater},randomAt(Math.round(x),Math.round(z)),true,[feedingFish]);
          for(const school of feeding){
            // These are feeding lies. Stagger independent surface visits
            // across the corridor, even when the first school contains one fish.
            school.members.forEach((a,i)=>{a.risePhase=(.48-drift/(7.4+a.seed*.65)+i*.31+1)%1;});
          }
          resident.schools.push(...feeding);
        }
      }
    }
    const shallows={acadia:'Common eiders in Newport Cove',moosehead:'Wildlife shallows · Salmon rise',labrador:'Wildlife shallows · Brook trout'}[region]||'Wildlife shallows';
    w.landmarks.push({name:shallows,x:pick.x,z:pick.z,discoveryRadius:72,
      approach:[launch.x,launch.z,launch.x-30*Math.sin(launch.yaw),launch.z-30*Math.cos(launch.yaw),launchHeight,launch.glance]});
  }
  Object.defineProperty(w.launches,'wildlife',{enumerable:true,get(){prepare();return launch;}});
  function birdPose(a,f,t,dt,player){
    const k=a.rank,L=a.length,seed=a.seed,sky=f.isBird;
    const approach=Math.hypot(player.x-a.x,player.z-a.z)<(f.groundGeese?8:4)&&player.y-a.y<7;
    const c=(f.clock+t+(f.goose?0:k*.13))%f.period/f.period;
    const swim=f.aquatic,loon=f.skin==='loon',grassGoose=f.groundGeese;
    let mix=0,theta=0,behavior='rest';
    if(sky){
      const start=grassGoose?.67:swim?.80:f.goose?.08:f.seabird?.02:.46,end=.985;
      const p=clamp((c-start)/(end-start),0,1);
      if(p>0&&p<1&&(!swim||!loon)){
        mix=sCurve(p/.12)*sCurve((1-p)/.13);theta=p*tau;
        behavior=p<.12?'takeoff':p>.87?'landing':'flight';
      }
    }
    const pace=sky?(swim?.26:.43):/seal/.test(a.skin)?.16:a.skin.includes('sheep')?.29:.62;
    const ph=t*pace+seed;
    let x=a.homeX,z=a.homeZ,y=a.homeY;
    if(swim){
      const radius=loon?2.8:.72;
      if(!mix&&approach&&dt>0&&t>=(a.quietAfter||0)){
        a.disturbedAt=t;a.quietAfter=t+24+seed;
        a.awayAngle=Math.atan2(a.z-player.z,a.x-player.x);
        if(!floatingDucks||loon||!isDuck(a.skin))ripples.emit(a,t,loon?.68:.38);
      }
      const since=t-(a.disturbedAt??-1000);
      const escape=since>=0?sCurve(since/2.4)*(1-sCurve((since-7)/11)):0;
      const paddle=(loon?3.2:1.8)*escape;
      const xx=x+radius*(Math.sin(ph)-Math.sin(seed))+paddle*Math.cos(a.awayAngle||0);
      const zz=z+radius*.65*(Math.sin(ph*.67+seed)-Math.sin(seed*1.67))+paddle*Math.sin(a.awayAngle||0);
      if(Number.isFinite(waterAt(xx,zz))){x=xx;z=zz;}
      a.level=waterAt(x,z);y=a.level+L*.15+.014*Math.sin(t*2.5+seed);
      if(loon){const dive=Math.max(escape,Math.max(0,Math.sin(t*.14+seed)-.77)/.23);y-=dive*2.7;behavior=dive>.2?'diving':'paddling';}
      else if(!mix)behavior='paddling';
    }else if(!sky||grassGoose){
      const walking=Math.sin(t*.23+seed)>.15||approach;
      if(walking){
        const stride=grassGoose?.46:a.skin.includes('sheep')?1.25:Math.max(.12,L*.86);
        const xx=x+Math.sin(ph)*stride,zz=z+Math.cos(ph*.61)*stride*.68;
        if(!Number.isFinite(waterAt(xx,zz))){x=xx;z=zz;}
        behavior='walking';
      }
      y=f.onTree?a.homeY:h.surface(x,z);
      const hop=/(squirrel|pika|frog|peeper)/.test(a.skin)?Math.pow(Math.max(0,Math.sin(t*(approach?12:6)+seed)),1.8):0;
      y+=walking?L*.22*hop:0;
    }
    const asp=window.faunaShapes[a.skin][1];
    if(!swim)y+=L*(asp*.48);
    if(!swim&&!sky)behavior=behavior==='walking'?'moving':'rest';
    let heading=Math.atan2(.47*Math.cos(ph*.67+seed),Math.cos(ph));
    let bank=0,pitch=0;
    if(mix>0){
      const R=f.radius,lat=(1-Math.cos(theta))*R*.58,forward=Math.sin(theta)*R;
      const ca=Math.cos(f.angle),sa=Math.sin(f.angle),vx=Math.cos(theta),vz=.58*Math.sin(theta);
      const hx=ca*vx-sa*vz,hz=sa*vx+ca*vz;heading=Math.atan2(hz,hx);
      const rank=Math.ceil(k/2),span=sizes[f.skin][1],trail=f.goose?-rank*span*1.1:0,side=f.goose?(k%2?1:-1)*rank*span*.94:0;
      x+=ca*forward-sa*lat+mix*(trail*hx-side*hz);z+=sa*forward+ca*lat+mix*(trail*hz+side*hx);
      const peak=f.goose?20:f.seabird?12:swim?7:5+L*8;
      const floor=(w.clearance||w.height)(x,z);
      y+=peak*mix*(.65+.35*Math.sin(theta*.5));
      y=Math.max(y,floor+mix*(.7+L));bank=-mix*Math.atan2(.58*R*(tau/f.period)**2,9.81);
      pitch=behavior==='takeoff'?.18:behavior==='landing'?.14:.03*Math.cos(theta);
      if(f.skin==='barred-owl')pitch-=1.04*mix;
    }
    a.x=x;a.y=y;a.z=z;a.heading=heading;a.bank=bank;a.pitch=pitch;
    a.mode=mix>.025?1:swim?-1:0;a.behavior=behavior;
    const soaring=f.seabird||['raven','chough','peregrine'].includes(f.skin);
    const glide=mix>.6&&(soaring?Math.sin(t*.74+seed*.19)>-.46:Math.sin(t*1.4+seed)>.76);
    a.effort=mix>.025?(glide?.045:1):0;
    const hz=sky?clamp(2.4/Math.sqrt(L),2.1,8.2):2;
    a.phase+=dt*(a.mode===1?(glide?.70:hz*tau):2.3);
  }
  function nearest(id,p,reach){
    let best=reach*reach,out=null;
    for(const site of sites.values())for(const f of site.flocks){
      if(f.id!==id)continue;
      for(const a of f.group){
        if(a.behavior==='diving')continue;
        const d=(p.x-a.x)**2+(p.y-a.y)**2+(p.z-a.z)**2;
        if(d<best){best=d;out=a;}
      }
    }
    if(id==='harbor-seal'&&eggRock)for(const a of visibleSubjects){
      if(a.id!==id||!eggRock.contains(a.x,a.z))continue;
      const d=(p.x-a.x)**2+(p.y-a.y)**2+(p.z-a.z)**2;
      if(d<best){best=d;out=a;}
    }
    return out?{x:out.x,y:out.y,z:out.z,actor:out}:null;
  }
  // Only animals drawn in the preceding frame can attract a passing eagle.
  // A rising fish is visible at the disturbance; the deeper school is concealed.
  const visibleSubjects=[],rendered=[];
  const names={
    'barred-owl':'Barred owl','harbor-seal':'Harbor seal',goose:'Canada goose',mallard:'Mallard',raven:'Common raven',dipper:'American dipper',accentor:'Alpine accentor',
    wagtail:'White wagtail',peregrine:'Peregrine falcon','rock-wren':'Rock wren',merganser:'Common merganser',
    osprey:'Osprey','double-crested-cormorant':'Double-crested cormorant',killdeer:'Killdeer',
    'mountain-chickadee':'Mountain chickadee','acorn-woodpecker':'Acorn woodpecker',bluebird:'Mountain bluebird',junco:'Dark-eyed junco',
    robin:'American robin',eider:'Common eider','common-gull':'Common gull',tern:'Arctic tern',tui:'Tūī',tomtit:'Tomtit',
    fantail:'New Zealand fantail',shelduck:'Paradise shelduck','black-duck':'American black duck',chickadee:'Black-capped chickadee',
    heron:'Great blue heron','wood-duck':'Wood duck',jay:'Steller’s jay',thrush:'Hermit thrush',nutcracker:'Clark’s nutcracker',
    chough:'Alpine chough',dunnock:'Dunnock','canyon-wren':'Canyon wren',poorwill:'Common poorwill',kittiwake:'Black-legged kittiwake',
    oystercatcher:'Eurasian oystercatcher',pipit:'Meadow pipit',bellbird:'New Zealand bellbird',kea:'Kea',loon:'Common loon',
    vireo:'Red-eyed vireo',kingfisher:'Belted kingfisher',kinglet:'Golden-crowned kinglet','juneau-red-squirrel':'American red squirrel',
    'douglas-squirrel':'Douglas squirrel','golden-mantled-squirrel':'Golden-mantled ground squirrel','alpine-marmot':'Alpine marmot','american-pika':'American pika','norwegian-sheep':'Domestic sheep',
    'nz-fur-seal':'New Zealand fur seal','nh-bullfrog':'American bullfrog','maine-green-frog':'Green frog','nh-spring-peeper':'Spring peeper',
    'canyon-treefrog':'Canyon treefrog',sockeye:'Sockeye salmon','dolly-varden':'Dolly Varden','lake-trout':'Lake trout',
    rainbow:'Rainbow trout','brown-trout':'Brown trout',carp:'Common carp',kokanee:'Kokanee salmon',spotty:'Spotty wrasse',
    'blue-cod':'New Zealand blue cod',saithe:region==='acadia'?'Atlantic pollock':'Saithe','atlantic-cod':'Atlantic cod',smallmouth:'Smallmouth bass',
    'atlantic-salmon':'Landlocked Atlantic salmon','yellow-perch':'Yellow perch','brook-trout':'Brook trout'
  };
  function nearby(p,maxDistance=400){
    const candidates=[];
    for(const a of rendered){
      const distance=Math.hypot(a.x-p.x,a.y-p.y,a.z-p.z);
      if(distance>maxDistance)continue;
      const skin=a.skin?.replace(/-hen$/,''),name=a.name||names[skin];
      if(!name)continue;
      const kind=a.kind||(birds[a.id]?'Bird':a.id?(/frog|peeper/.test(skin)?'Amphibian':'Mammal'):'Fish');
      candidates.push({id:a.id||skin,name,kind,x:a.x,y:a.y,z:a.z,distance,behavior:a.behavior||'swimming',actor:a});
    }
    return candidates.sort((a,b)=>a.distance-b.distance);
  }
  function sighting(s,last){
    const heading=s.yaw+(s.yawSlip||0),forwardX=-Math.sin(heading),forwardZ=-Math.cos(heading);
    let best=null,bestScore=0;
    for(const a of visibleSubjects){
      if(a===last)continue;
      const dx=a.x-s.x,dy=a.y-s.y,dz=a.z-s.z,along=dx*forwardX+dz*forwardZ;
      const r2=dx*dx+dz*dz+dy*dy;
      if(along<4||along*along<.43*r2||r2>Math.min(115,95*a.length)**2)continue;
      const score=a.length*(.7+.3*along/Math.sqrt(r2))/Math.sqrt(r2);
      if(score>bestScore){best=a;bestScore=score;}
    }
    if(best){
      // Screen a short sightline above the actual shore/canopy. An actor on a
      // ledge behind the crest should never pull the head through the mountain.
      const floor=w.clearance||w.height;
      for(let i=1;i<=8;i++){
        const t=i/9,x=s.x+(best.x-s.x)*t,z=s.z+(best.z-s.z)*t;
        if(floor(x,z)>s.y+(best.y-s.y)*t+.04)return null;
      }
    }
    return best;
  }
  function update(player,t){
    prepare();
    if(t<lastTime){
      dormantSites.clear();
      for(const [key,site] of sites){
        if(!site.curated){sites.delete(key);continue;}
        for(const f of site.flocks)for(const a of f.group){
          a.disturbedAt=a.seenAt=undefined;a.quietAfter=0;
        }
        for(const school of site.schools){
          school.seenAt=undefined;for(const fish of school.members){fish.scare=0;fish.lastSwirl=-Infinity;}
        }
      }
      nextCheck=0;
    }
    const dt=lastTime<0?0:clamp(t-lastTime,0,.15);lastTime=t;
    if(t>=nextCheck||t===0){
      nextCheck=t+.8;
      if(feedingFish&&player.y-w.waterLevel<42)stockNearbyShore(player);
      for(const [key,s] of sites)if(!s.curated&&Math.hypot(player.x-s.x,player.z-s.z)>530){
        if(s.flocks.length||s.schools.length)dormantSites.set(key,s);
        sites.delete(key);
      }
      const ix=Math.round(player.x/310),iz=Math.round(player.z/310),key=ix+','+iz;
      if(!sites.has(key)&&Math.hypot(player.x-resident.x,player.z-resident.z)>195&&player.y-h.surface(player.x,player.z)<230)
        makeSite(key,ix*310,iz*310,false);
    }
    visibleSubjects.length=0;rendered.length=0;
    if(eggRock)for(const a of eggRock.update(player,t)){rendered.push(a);visibleSubjects.push(a);}
    if(land)for(const a of land.update(player,t)){rendered.push(a);visibleSubjects.push(a);}
    models.begin(t);
    for(const site of sites.values()){
      if(Math.hypot(player.x-site.x,player.z-site.z)>570)continue;
      const swimmers=[];
      for(const f of site.flocks)for(const a of f.group){
        if(a.seenAt!==undefined&&t-a.seenAt>.6)a.phase+=(t-a.seenAt)*2.3;
        a.seenAt=t;
        birdPose(a,f,t,dt,player);
        if(a.behavior==='paddling')swimmers.push(a);
      }
      // Ducks of different species share the same surface. Resolve spacing
      // across the entire raft, including while two feeding tracks cross.
      for(let pass=0;pass<3;pass++)for(let i=1;i<swimmers.length;i++){
        const a=swimmers[i];
        for(let j=0;j<i;j++){
          const b=swimmers[j],dx=a.x-b.x,dz=a.z-b.z,d=Math.hypot(dx,dz);
          const gap=.69*(a.length+b.length);
          if(d>=gap)continue;
          const nx=d>.0001?dx/d:Math.cos(a.seed),nz=d>.0001?dz/d:Math.sin(a.seed);
          for(const [bird,sign] of [[a,1],[b,-1]]){
            const x=bird.x+sign*nx*(gap-d)*.53,z=bird.z+sign*nz*(gap-d)*.53;
            if(Number.isFinite(waterAt(x,z))){bird.x=x;bird.z=z;}
          }
        }
      }
      for(const a of swimmers)duckContact(a,t);
      for(const f of site.flocks)for(const a of f.group){
        if(a.behavior!=='paddling'&&a.floatContact)duckContact(a,t);
        if(Math.hypot(player.x-a.x,player.y-a.y,player.z-a.z)<Math.max(85,360*a.length)&&a.behavior!=='diving'){
          if(models.draw(a)){rendered.push(a);visibleSubjects.push(a);}
        }
      }
      for(const school of site.schools){
        if(Math.hypot(player.x-school.home.x,player.y-school.home.y,player.z-school.home.z)>90)continue;
        if(school.seenAt!==undefined&&t-school.seenAt>.6){
          const absence=t-school.seenAt;
          for(const a of school.members){
            a.scare*=Math.exp(-absence*.68);
            const theta=.18*t+a.seed;
            const x=school.home.x+a.offsetX+Math.cos(theta)*school.spacing*.6;
            const z=school.home.z+a.offsetZ+Math.sin(theta)*school.spacing*.6;
            const level=waterAt(x,z);
            if(Number.isFinite(level)){
              const gain=1-Math.exp(-absence*.1);
              const px=a.x+(x-a.x)*gain,pz=a.z+(z-a.z)*gain,py=waterAt(px,pz);
              if(Number.isFinite(py)&&(!school.stream||school.stream.depth(px,pz)>=a.length*.36)){
                a.x=px;a.z=pz;a.level=py;
              }
            }
          }
        }
        school.seenAt=t;
        fish.update(school,player,t,dt);
        for(const a of school.members){
          if(!models.draw(a))continue;
          rendered.push(a);
          if(t-a.lastSwirl<.75&&a.level-a.y<.42*a.length)visibleSubjects.push(a);
        }
      }
    }
    ripples.update(player,t);
    models.end();
    w.waterContacts?.update(t,player);
  }
  w.wildlife={nearest,nearby,land,sighting,inSight:a=>visibleSubjects.includes(a),waterAt,sites,prepare,fish:fish.roster};return update;
};
