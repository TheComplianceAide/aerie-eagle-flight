// Residents have stable home ranges. Routes, animation and the field guide all
// refer to the same animals and terrain. Time pauses with the flight clock.
window.makeLandWildlife=function makeLandWildlife(T,scene,w){
  const catalog=window.aerieLandWildlife,profile=catalog.regions[w.region];
  if(!profile)return null;
  const h=w.habitat,ground=w.elevation||w.height,clear=w.clearance||w.height;
  const render=window.makeLandModels(T,scene),herds=new Map(),dormant=new Map(),drawn=[];
  const tracks=window.makeWildlifeTracks(T,scene,w);
  const tau=2*Math.PI,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),bounds=w.bounds;
  const primary=profile.animals[0];
  let route=null,landmark=null,rockTop=null,previous=-1,nextCell=-1;
  function rng(x,z){
    let s=(Math.imul(x|0,2246822519)^Math.imul(z|0,3266489917)^Math.imul(w.region.charCodeAt(0),95131))>>>0;
    return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
  }
  function inside(x,z){return x>bounds.minX+10&&x<bounds.maxX-10&&z>bounds.minZ+10&&z<bounds.maxZ-10;}
  function dry(x,z){
    if(!inside(x,z)||w.blocksWildlifeAt?.(x,z)||h.wet(x,z,ground(x,z)))return null;
    const y=h.surface(x,z);
    if(!Number.isFinite(y)||clear(x,z)>Math.max(ground(x,z),y)+1.25)return null;
    const obstacle=h.clearance(x,z)-y;
    if(obstacle>.19&&obstacle<3.5)return null;
    return y;
  }
  function bed(x,z,strict=true){
    const y=dry(x,z);if(y===null)return null;
    const dx=(h.surface(x+1.5,z)-h.surface(x-1.5,z))/3,dz=(h.surface(x,z+1.5)-h.surface(x,z-1.5))/3;
    const steep=Math.hypot(dx,dz),rock=['alpine-ibex','desert-bighorn'].includes(primary);
    if(steep>(strict?(rock?.88:.57):1.12))return null;
    return {x,y,z,dx,dz,steep};
  }
  function siteNear(x,z,r,curated){
    let best=null,score=-Infinity;
    for(let i=0,n=curated?360:34;i<n;i++){
      const rad=r*Math.sqrt(i/(n-1)),angle=i*2.39996323;
      const p=bed(x+rad*Math.cos(angle),z+rad*Math.sin(angle));if(!p)continue;
      if(primary==='eurasian-otter'&&Number.isFinite(w.waterLevel)&&p.y>w.waterLevel+9)continue;
      // Large mammals naturally use open ground at a forest edge. Reject
      // narrow slivers on a cliff or between buildings and deep water.
      let clearCount=0;
      for(let j=0;j<6;j++){
        const a=j*tau/6,xx=p.x+8*Math.cos(a),zz=p.z+8*Math.sin(a),y=dry(xx,zz);
        if(y!==null&&Math.abs(p.y-y)<7)clearCount++;
      }
      if(clearCount<3)continue;
      let value=clearCount*.6-p.steep*1.9-rad/(r+1)*1.8;
      const tree=h.nearestTree(p.x,p.z,16);
      if(tree){const gap=Math.hypot(tree.x-p.x,tree.z-p.z)-tree.width*.47;value+=clamp(gap,-5,5)*.2;}
      if(primary==='eurasian-otter')value-=Math.abs(p.y-w.waterLevel)*.35;
      if(value>score){best=p;score=value;if(score>4.12&&i>10)break;}
    }return best;
  }
  function animal(id,p,random,index,horns,heading){
    const spec=catalog.species[id],scale=(horns?1.05:.90)*(.94+random()*.12),height=spec.height*scale;
    return {id,name:spec.name,kind:'Mammal',family:spec.family,height,horns,home:p,x:p.x,y:p.y+.75*height,z:p.z,feetY:p.y,
      heading,index,length:height*(spec.family==='otter'?4.4:1.7),phase:random()*tau,seed:random()*tau,behavior:'foraging',
      stride:0,headTurn:0,headPitch:0,bob:0,grade:0,roll:0,escape:0,cooldown:0,speed:0};
  }
  function addGroup(key,p,id,curated,random){
    const family=catalog.species[id].family;
    const count=family==='bear'||family==='otter'||id==='moose'?1:family==='hare'?2:family==='bison'?5+Math.floor(random()*3):2+Math.floor(random()*3);
    const heading=random()*tau,animals=[];
    for(let i=0;i<count;i++){
      const dir=heading+i*2.4,spread=family==='hare'?2.5:3.5;
      const base=i===0?p:bed(p.x+spread*Math.sqrt(i)*Math.cos(dir),p.z+spread*Math.sqrt(i)*Math.sin(dir));
      if(!base)continue;
      const a=animal(id,base,random,i,i===0&&!['hare','bear','otter'].includes(family),heading+(random()-.5)*.85);
      a.residentId=w.region+'/'+key+'/'+id+'/'+i;
      animals.push(a);
    }
    herds.set(key,{p,curated,animals});return animals;
  }
  function prepare(){
    if(route)return route;
    const [sx,sz]=profile.anchor;
    const mapped=Number.isFinite(profile.course)&&bed(sx,sz);
    const lead=mapped||siteNear(sx,sz,155,true)||siteNear(sx,sz,820,true)||siteNear(w.spawn.x,w.spawn.z,1100,true);
    if(!lead)return null;
    if(primary==='eurasian-otter'&&!rockTop){
      rockTop=render.haulout(lead,h.surface);
      w.clearance=(x,z,altitude)=>Math.max(clear(x,z,altitude),rockTop(x,z));
    }
    const random=rng(lead.x,lead.z);addGroup('home',lead,primary,true,random);
    // Keep a hare within the same habitat but outside the ungulate group.
    if(primary==='moose'){
      const cowSite=siteNear(lead.x+13,lead.z+10,26,false);
      if(cowSite){
        const cow=animal('moose',cowSite,random,1,false,random()*tau);
        cow.residentId=w.region+'/cow/moose/1';
        herds.set('cow',{p:cowSite,curated:true,animals:[cow]});
      }
    }
    if(profile.animals.length>1){
      const other=siteNear(lead.x+17,lead.z-18,32,false);
      if(other)addGroup('cover',other,profile.animals[1],true,random);
    }
    const flyingFloor=w.flightClearance||clear;
    let best,score=-Infinity;
    if(mapped){
      // Mapped approaches were flown in wind with the same neutral inputs as
      // the player. Transfer the calibrated clearance to the current surface.
      const angle=profile.course*Math.PI/180,dx=Math.cos(angle),dz=Math.sin(angle);
      const x=lead.x-33*dx+2.7*dz,z=lead.z-33*dz-2.7*dx;
      best={x,z,y:Math.max(lead.y+5.3,flyingFloor(x,z)+6.5)+(profile.rise||0),
        yaw:Math.atan2(-dx,-dz),lookDown:7,glance:0,dx,dz};
    }
    for(let i=0;!mapped&&i<32;i++){
      const a=i*tau/32,dx=Math.cos(a),dz=Math.sin(a),dist=30;
      // Pass the animal off the starboard wing. Check a short forward strip
      // beyond the encounter for a falling or level escape route.
      const rx=-dz,rz=dx,x=lead.x-dist*dx-2.7*rx,z=lead.z-dist*dz-2.7*rz;
      if(!inside(x,z))continue;
      let y=Math.max(flyingFloor(x,z)+4.8,lead.y+5.2),risk=0;
      for(let d=5;d<=165;d+=5){
        const xx=x+dx*d,zz=z+dz*d;
        let obstruction=0;
        for(const off of [-2,0,2]){
          const level=flyingFloor(xx+rx*off,zz+rz*off);
          obstruction=Math.max(obstruction,level-y);
          if(d<44)y=Math.max(y,level+3.6);
        }
        if(d>=44)risk+=Math.max(0,obstruction+2.9-(d-44)*.02)/(1+.013*d);
      }
      const worth=-1.7*(y-lead.y)-risk*.33-.14*Math.abs(y-flyingFloor(x,z)-5);
      if(worth>score){score=worth;best={x,y,z,yaw:Math.atan2(-dx,-dz),lookDown:7,glance:0,dx,dz};}
    }
    if(!best)return null;
    // A 27 cm otter passes beneath the starboard wing. Look down the bank
    // as it approaches so its long tail and pale throat stay in view.
    if(primary==='eurasian-otter')best.lookDown=28;
    // Present the broadside profile across the eagle's path.
    const a=herds.get('home').animals[0];a.heading=Math.atan2(best.dz,best.dx)+2.02;
    route=best;
    landmark={name:profile.title,x:lead.x,z:lead.z,discoveryRadius:98,
      approach:[best.x,best.z,best.x+best.dx*32,best.z+best.dz*32,best.y-clear(best.x,best.z),best.glance,best.lookDown]};
    w.landmarks.push(landmark);return route;
  }
  Object.defineProperty(w.launches,'game',{enumerable:true,get:()=>prepare()||w.spawn});
  function advanceAway(a,t){
    if(a.seenAt===undefined||t-a.seenAt<.6)return;
    const absence=t-a.seenAt;
    const retreat=Math.max(0,Math.min(t,a.retreatUntil||0)-a.seenAt);
    // No invisible animation loop. A returning resident completes its retreat
    // or a short foraging leg within its own home range, on walkable ground.
    const home=a.home,phase=a.seed+.061*t;
    const radius=a.family==='otter'?2.5:a.family==='hare'?3.5:7.5;
    const rangeX=home.x+radius*Math.cos(phase),rangeZ=home.z+radius*.66*Math.sin(phase*.79);
    const wander=Math.min(radius*.85,Math.max(0,absence-retreat)*.20);
    let travel=Math.min(6,retreat*a.height*1.5);
    function walk(angle,distance){
      if(distance<.10)return;
      const steps=Math.min(5,Math.ceil(distance/1.1)),part=distance/steps;
      for(let i=0;i<steps;i++){
        const x=a.x+Math.cos(angle)*part,z=a.z+Math.sin(angle)*part;
        const here=bed(x,z,false);
        if(!here||Math.abs(here.y-a.feetY)>1.3)break;
        a.x=x;a.z=z;a.feetY=here.y;a.heading=angle;
      }
    }
    walk(a.heading,travel);
    if(wander>.1)walk(Math.atan2(rangeZ-a.z,rangeX-a.x),Math.min(wander,Math.hypot(rangeX-a.x,rangeZ-a.z)));
    a.phase+=Math.min(absence,45)*.9;
    a.escape=clamp(((a.retreatUntil||0)-t)/3.5,0,1);
    // Do not stamp inferred off-camera travel as an observed footfall.
    a.trackX=a.x;a.trackZ=a.z;
  }
  function move(a,p,t,dt){
    advanceAway(a,t);a.seenAt=t;
    const A=a.home,dx=a.x-p.x,dz=a.z-p.z,dist=Math.hypot(dx,dz),gap=p.y-a.feetY,s=a.seed;
    const hare=a.family==='hare',otter=a.family==='otter',bear=a.family==='bear';
    const close=dist<(hare?15:19)&&gap<(hare?10:13)&&gap>-2;
    if(close&&t>=a.cooldown){
      const bolts=hare||a.family==='deer';
      a.waryUntil=t+(bolts?51:33)+s;
      a.retreatUntil=t+(bolts?3.5:0);
      a.cooldown=a.waryUntil+8;
      if(bolts){a.escape=1;a.heading=Math.atan2(dz,dx)+.22*Math.sin(s+.8*t);}
    }
    a.escape=Math.max(0,a.escape-dt*.28);
    const isAlert=dist<25&&gap<16&&gap>-3||t<(a.waryUntil||0),pace=.5+.5*Math.sin(t*.23+s)+.15*Math.sin(t*.51+s);
    const walking=hare?pace>.72:pace>.61;
    const wanted=a.escape>0?2.5:isAlert&&!hare?.37:walking?(hare?.47:otter?.5:bear?.49:.62):0;
    a.speed+=(wanted-a.speed)*(1-Math.exp(-dt*3.5));
    const away=Math.hypot(a.x-A.x,a.z-A.z)>10.5;
    const angle=away?Math.atan2(A.z-a.z,A.x-a.x):a.heading+.18*Math.sin(t*.39+s);
    a.heading+=Math.atan2(Math.sin(angle-a.heading),Math.cos(angle-a.heading))*Math.min(1,dt*(away?1.5:.8));
    const speed=a.speed*a.height*(hare?2.15:1),cx=Math.cos(a.heading),cz=Math.sin(a.heading);
    const step=dt*speed;
    if(step>.00001){
      const x=a.x+cx*step,z=a.z+cz*step,front=bed(x+cx*.45,z+cz*.45,false);
      if(front&&Math.abs(front.y-a.feetY)<1.15){a.x=x;a.z=z;}
      else a.heading+=dt*2.5;
    }
    a.feetY=Math.max(h.surface(a.x,a.z),rockTop?.(a.x,a.z)??-Infinity);a.y=a.feetY+a.height*.78;
    if(a.sunTime===undefined||t>=a.sunTime||a.sunTime-t>2){
      a.sunTime=t+.8;a.sunAccess=1;const sun=w.sunDirection;
      for(const d of [4,12,35,80,180,440,1050,2400,5000]){
        const xx=a.x+d*sun.x,zz=a.z+d*sun.z;
        const horizon=d<36?clear(xx,zz):ground(xx,zz);
        a.sunAccess=Math.min(a.sunAccess,clamp((a.y+d*sun.y-horizon+1.5)/3,0,1));
      }
    }
    a.grade=clamp(Math.atan((h.surface(a.x+cx*.8,a.z+cz*.8)-h.surface(a.x-cx*.8,a.z-cz*.8))/1.6),-.5,.5);
    a.roll=clamp(Math.atan((h.surface(a.x-cz*.8,a.z+cx*.8)-h.surface(a.x+cz*.8,a.z-cx*.8))/1.6),-.39,.39);
    a.phase+=dt*(hare?9.5:3.6)*Math.min(2.1,a.speed*1.1+.31);
    a.stride=Math.min(.58,a.speed*(hare?.72:.63));
    if(hare){a.bob=a.height*a.stride*.48*Math.pow(Math.max(0,Math.sin(a.phase)),1.6);a.grade+=.14*a.stride*Math.cos(a.phase);}
    else a.bob=a.height*(.007*Math.cos(t*1.8+s)+.019*a.stride*Math.cos(a.phase*2));
    const target=isAlert?(otter?.44:.10):walking?-.07:(otter||bear?-.12:-.47)-.13*Math.sin(t*1.03+s);
    a.headPitch+=(target-a.headPitch)*(1-Math.exp(-dt*2.8));
    a.headTurn=.17*Math.sin(t*.72+s)+(isAlert?.20*Math.sin(Math.atan2(-dz,-dx)-a.heading):0);
    a.behavior=a.escape>.1?'bounding':isAlert?'watching':walking?(hare?'hopping':otter?'patrolling':'walking'):bear?'foraging':otter?'resting':'browsing';
    tracks.step(a,t);
  }
  function update(player,t){
    if(!route)prepare();
    if(t<previous){nextCell=-1;tracks.reset();dormant.clear();
      for(const [key,g] of herds)if(!g.curated)herds.delete(key);
      for(const g of herds.values())for(const a of g.animals){
      a.x=a.home.x;a.z=a.home.z;a.feetY=a.home.y;a.y=a.feetY+a.height*.78;
      a.escape=a.speed=a.cooldown=a.waryUntil=a.retreatUntil=0;
      a.seenAt=a.trackX=a.sunTime=undefined;
    }}
    const dt=previous<0?0:clamp(t-previous,0,.12);previous=t;
    if(t>=nextCell||t===0){
      nextCell=t+1.35;
      for(const [key,g] of herds)if(!g.curated&&Math.hypot(g.p.x-player.x,g.p.z-player.z)>580){
        if(g.animals.length)dormant.set(key,g);
        herds.delete(key);
      }
      if(player.y-ground(player.x,player.z)<175){
        const size=205,cx=Math.round(player.x/size),cz=Math.round(player.z/size);
        for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){
          const ix=cx+i,iz=cz+j,key=ix+':'+iz;if(herds.has(key))continue;
          const known=dormant.get(key);
          if(known){herds.set(key,known);dormant.delete(key);continue;}
          const random=rng(ix,iz),x=size*(ix+(random()-.5)*.66),z=size*(iz+(random()-.5)*.66);
          const empty={p:{x,z},curated:false,animals:[]};herds.set(key,empty);
          if(random()>.68||landmark&&Math.hypot(landmark.x-x,landmark.z-z)<114)continue;
          if(primary==='black-bear'&&Number.isFinite(w.waterLevel)&&ground(x,z)>w.waterLevel+120)continue;
          const p=siteNear(x,z,45,false);if(p)addGroup(key,p,profile.animals[Math.floor(random()*profile.animals.length)],false,random);
        }
      }
    }
    render.begin();drawn.length=0;
    for(const {p,animals} of herds.values()){
      if(Math.hypot(p.x-player.x,p.z-player.z)>410)continue;
      for(const a of animals){
        if(Math.hypot(a.x-player.x,a.y-player.y,a.z-player.z)>Math.min(400,150+145*a.height))continue;
        move(a,player,t,dt);if(render.draw(a))drawn.push(a);
      }
    }
    render.end();tracks.update(player,t);return drawn;
  }
  function caller(id,p,reach){
    let nearest=null,best=reach*reach;
    for(const a of drawn){
      if(a.id!==id||id==='moose'&&a.horns||(id==='red-deer'||id==='elk')&&!a.horns||id==='white-tailed-deer'&&a.horns)continue;
      const d=(a.x-p.x)**2+(a.y-p.y)**2+(a.z-p.z)**2;
      if(d<best){nearest=a;best=d;}
    }
    return nearest;
  }
  return {update,prepare,drawn,herds,caller,tracks};
};
