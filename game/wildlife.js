// Encounters live at stable sites. A cell is generated from its coordinates,
// so returning to a cove restores the same flock composition and identities.
window.addRegionalWildlife=function(T,scene,w){
  const region=w.region,{birds,sizes,species,scenes}=window.aerieFauna,profile=scenes[region];
  const ground=w.elevation||w.height,h=w.habitat,models=window.makeWildlifeModels(T,scene);
  const reservoir=region==='bryce'?window.tropicReservoir.build(T,scene,w):null;
  const stations={alaska:[-424,-476],swiss:[-613,437],canyon:[-322,-32],yosemite:[-728,1256],
    bryce:[-8990,1898],crater:[-3209,1679],lofoten:[923,2104],milford:[2371,3244],
    napali:[-2535,272],winnipesaukee:[1210,1854],moosehead:[648,-662],surry:[-1142,-3101]};
  const tau=2*Math.PI,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const sCurve=f=>{f=clamp(f,0,1);return f*f*(3-2*f);};
  function randomAt(x,z){
    let seed=(Math.imul(x|0,196613)^Math.imul(z|0,393241)^Math.imul(region.charCodeAt(0),2654435761))>>>0;
    return ()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
  }
  let lakeOffset=0;
  scene.traverse(o=>{if(o.isWater&&Number.isFinite(w.waterLevel))lakeOffset=o.position.y-w.waterLevel;});
  function waterAt(x,z){
    if(reservoir)return window.tropicReservoir.distance(x,z)>0?window.tropicReservoir.level:-Infinity;
    const channel=w.channelWater?.(x,z);
    if(Number.isFinite(channel))return channel;
    const y=ground(x,z);
    if(!h.wet(x,z,y))return -Infinity;
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
  function findDry(x,z,radius,gentle=false){
    for(let i=0;i<96;i++){
      const r=radius*Math.sqrt(i/95),a=i*2.39996;
      const px=x+r*Math.cos(a),pz=z+r*Math.sin(a);
      if(Number.isFinite(waterAt(px,pz)))continue;
      const y=h.surface(px,pz);
      if(gentle&&Math.hypot(h.surface(px+2,pz)-y,h.surface(px,pz+2)-y)>1.45)continue;
      if((w.clearance||w.height)(px,pz)>y+2)continue;
      return {x:px,y,z:pz};
    }
    return null;
  }
  const fish=window.makeFishSchools(region,waterAt),sites=new Map();
  const social={
    loon:[1,2],goose:[5,15],nene:[2,5],mallard:[3,12],'black-duck':[2,8],'wood-duck':[2,6],
    merganser:[2,7],eider:[5,22],shelduck:[2,4],heron:[1,1],kingfisher:[1,1],dipper:[1,2],
    kittiwake:[4,18],'common-gull':[2,9],tern:[2,8],oystercatcher:[2,5],shearwater:[2,9],
    raven:[1,3],peregrine:[1,1],kea:[2,6],chough:[4,16],chickadee:[3,8],'mountain-chickadee':[3,8],
    kinglet:[2,6],nuthatch:[2,7],junco:[3,10],nutcracker:[2,6],'acorn-woodpecker':[3,8],
    'norwegian-sheep':[4,10],'nz-fur-seal':[2,7],'hawaiian-monk-seal':[1,2],'alpine-marmot':[2,5]
  };
  const bodySizes={'juneau-red-squirrel':.32,'douglas-squirrel':.31,'golden-mantled-squirrel':.27,'american-pika':.18,
    'alpine-marmot':.57,'norwegian-sheep':1.25,'nz-fur-seal':1.57,'hawaiian-monk-seal':2.1,
    'maine-green-frog':.084,'nh-bullfrog':.15,'nh-spring-peeper':.032,'canyon-treefrog':.049};
  function placeGroup(site,id,random,groundGeese=false){
    const isBird=!!birds[id],skin=isBird?birds[id][0]:id,hab=species[id][0];
    const aquatic=hab==='water',onTree=/tree/i.test(hab),coast=['coast','beach','bank'].includes(hab);
    const goose=skin==='goose'||skin==='nene',seabird=['shearwater','kittiwake','tern','common-gull'].includes(skin);
    const origin=site.water||site,angle=random()*tau;
    const distance=aquatic?(skin==='loon'?27:2.5+random()*3):20+random()*36;
    const x=origin.x+Math.cos(angle)*distance,z=origin.z+Math.sin(angle)*distance;
    let base,tree;
    if(aquatic){if(!site.water)return;base=findWater(x,z,12)||site.water;}
    else if(onTree){
      tree=h.nearestTree(x,z,site.curated?230:86);
      if(!tree||hab==='highTree'&&tree.y<800)return;
      base={x:tree.x+tree.width*.30,y:tree.y+tree.height*(hab==='lowTree'?.29:.63),z:tree.z};
    }else if(coast){
      if(!site.water)return;
      base=findDry(x,z,105)||((seabird||skin==='heron')?site.water:null);
    }else base=findDry(x,z,site.curated?150:65,goose||hab==='meadow');
    if(!base)return;
    if(skin==='norwegian-sheep'&&(base.y<.4||base.y>330))return;
    if(skin==='alpine-marmot'&&base.y+(w.altitudeOffset||0)<1550)return;
    if(skin==='hawaiian-monk-seal'&&!w.landmarks.some(p=>/beach/i.test(p.name)&&Math.hypot(p.x-base.x,p.z-base.z)<700))return;
    const [lo,hi]=groundGeese?[3,8]:(social[skin]||[1,2]),count=lo+Math.floor(random()**1.35*(hi-lo+1));
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
      if(!aquatic&&!onTree&&!seabird&&Number.isFinite(level))continue;
      const variant=k%2===1&&['mallard','shelduck','eider'].includes(skin)?skin+'-hen':skin;
      const a={id,skin:variant,length,homeX:px,homeZ:pz,homeY:onTree?base.y:
        aquatic?level:h.surface(px,pz),x:px,y:base.y,z:pz,heading:bearing,phase:random()*tau,seed:random()*tau,
        effort:0,mode:0,level:0,rank:k,pitch:0,bank:0};
      flock.group.push(a);
    }
    if(flock.group.length)site.flocks.push(flock);
  }
  function makeSite(key,x,z,curated){
    const random=randomAt(x,z),water=findWater(x,z,curated?140:86);
    const site={key,x,z,water,curated,flocks:[],schools:[]};
    for(const id of [...profile.birds,...profile.animals]){
      if(!curated&&random()<.52)continue;
      placeGroup(site,id,random);
      if(birds[id]?.[0]==='goose'&&(curated||random()<.37))placeGroup(site,id,random,true);
    }
    if(water)site.schools=fish.populate({...water,findWater},random,curated);
    sites.set(key,site);return site;
  }
  let resident,launch,lastTime=-1,nextCheck=0;
  function prepare(){
    if(resident)return;
    const [sx,sz]=stations[region],near=findWater(sx,sz,150);
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
    if(region==='napali'){
      const beach=w.landmarks.find(p=>/kalalau beach/i.test(p.name));
      if(beach){const water=findWater(beach.x,beach.z,250);
        if(water){const site={key:'seal-beach',curated:true,x:beach.x,z:beach.z,water,flocks:[],schools:[]};
          placeGroup(site,'hawaiian-monk-seal',randomAt(site.x,site.z));sites.set(site.key,site);}
      }
    }
    launch={x:pick.bx,y:Math.max(pick.y,(w.clearance||w.height)(pick.bx,pick.bz))+4.8,z:pick.bz,
      yaw:Math.atan2(pick.bx-pick.x,pick.bz-pick.z),glance:0};
    w.landmarks.push({name:region==='bryce'?'Tropic Reservoir shallows':'Wildlife shallows',x:pick.x,z:pick.z,
      discoveryRadius:72,approach:[launch.x,launch.z,pick.x,pick.z,4.8]});
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
      const xx=x+radius*(Math.sin(ph)-Math.sin(seed)),zz=z+radius*.65*(Math.sin(ph*.67+seed)-Math.sin(seed*1.67));
      if(Number.isFinite(waterAt(xx,zz))){x=xx;z=zz;}
      a.level=waterAt(x,z);y=a.level+L*.15+.014*Math.sin(t*2.5+seed);
      if(loon){const dive=Math.max(0,Math.sin(t*.14+seed)-.77)/.23;y-=dive*2.7;behavior=dive>.2?'diving':'paddling';}
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
    return out?{x:out.x,y:out.y,z:out.z,actor:out}:null;
  }
  function update(player,t){
    prepare();if(reservoir)reservoir.value=t;
    const dt=lastTime<0?0:clamp(t-lastTime,0,.15);lastTime=t;
    if(t>=nextCheck||t===0){
      nextCheck=t+.8;
      for(const [key,s] of sites)if(!s.curated&&Math.hypot(player.x-s.x,player.z-s.z)>530)sites.delete(key);
      const ix=Math.round(player.x/310),iz=Math.round(player.z/310),key=ix+','+iz;
      if(!sites.has(key)&&Math.hypot(player.x-resident.x,player.z-resident.z)>195&&player.y-h.surface(player.x,player.z)<230)
        makeSite(key,ix*310,iz*310,false);
    }
    models.begin(t);
    for(const site of sites.values()){
      if(Math.hypot(player.x-site.x,player.z-site.z)>570)continue;
      const swimmers=[];
      for(const f of site.flocks)for(const a of f.group){
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
      for(const f of site.flocks)for(const a of f.group)
        if(Math.hypot(player.x-a.x,player.y-a.y,player.z-a.z)<Math.max(85,360*a.length)&&a.behavior!=='diving')models.draw(a);
      for(const school of site.schools){
        if(Math.hypot(player.x-school.home.x,player.y-school.home.y,player.z-school.home.z)>90)continue;
        fish.update(school,player,t,dt);for(const a of school.members)models.draw(a);
      }
    }
    models.end();
  }
  w.wildlife={nearest,waterAt,sites,prepare,fish:fish.roster};return update;
};
