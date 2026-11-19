// The approach follows a continuous, clearance-sampled track. Distances, speeds,
// talon position and the departure return to the same live flight state.
window.makePerchFlight=function(T,world,habitat,route){
  const clamp=T.MathUtils.clamp;
  const lerp=T.MathUtils.lerp;
  const smooth=(v,a,b)=>T.MathUtils.smoothstep(v,a,b);
  const angle=(x)=>Math.atan2(Math.sin(x),Math.cos(x));
  const ease=(rate,dt)=>1-Math.exp(-rate*dt);
  const xyz=p=>new T.Vector3(p.x,p.y,p.z);
  const contactHeight=.20;
  let routeTarget=null,selected=null,usingRoute=false,stage='free',track,along=0;
  let settleTime=0,openYaw=0,selectionRange=750,lookYaw=0,lookPitch=0,baseYaw=0,pushTime=0,refresh=0,selection=[],selectionTime=-99;
  const station=new T.Vector3(),ahead=new T.Vector3();
  function select(target){
    selected=target||null;habitat.select(selected);selectionTime=-99;
    if(!target)usingRoute=false;
  }
  function reset(s,onRoute){
    stage='free';refresh=0;selection=[];track=null;usingRoute=onRoute;
    if(onRoute&&!routeTarget)routeTarget=habitat.resolveRoute(route.perch);
    select(onRoute?routeTarget:null);
    s.perchGrip=s.perchFold=s.perchFlare=s.perchLook=s.perchLookPitch=0;
  }
  function choose(s){
    if(stage!=='free')return;
    // Retain the current cycle while selecting so repeated presses visit each item.
    if(!selection.length||Math.abs(s.elapsed-selectionTime)>3.5){
      selection=habitat.choices(s).slice();
      if(usingRoute&&routeTarget&&!selection.some(c=>c.id===routeTarget.id))selection.unshift(routeTarget);
    }
    if(!selection.length){select(null);return;}
    const index=selection.findIndex(c=>c.id===selected?.id);
    const chosen=selection[(index+1)%selection.length];
    select(chosen);selectionRange=Math.max(750,Math.hypot(s.x-chosen.x,s.z-chosen.z)+500);selectionTime=s.elapsed;usingRoute=chosen.id===routeTarget?.id;
  }
  function pick(s,camera,ndc,size){
    if(stage!=='free')return;
    const t=habitat.pick(camera,ndc,size);
    if(!t)return;
    select(t);selection=[];selectionTime=s.elapsed;
    selectionRange=Math.max(750,Math.hypot(s.x-t.x,s.z-t.z)+500);
    usingRoute=t.id===routeTarget?.id;
  }
  function tickHabitat(s){
    if(s.elapsed<refresh-.6||s.elapsed>=refresh){
      habitat.update(s);refresh=s.elapsed+.28;
      if(stage==='free'&&selected&&!usingRoute&&Math.hypot(s.x-selected.x,s.z-selected.z)>selectionRange)select(null);
    }
  }
  function makeTrack(s,target){
    const begin=xyz(s),end=xyz(target);end.y+=contactHeight;
    const entry=xyz(target.approach);entry.y=Math.max(entry.y,world.height(entry.x,entry.z)+1.5);
    const controls=[begin],fwd=new T.Vector3(-Math.sin(s.yaw),0,-Math.cos(s.yaw));
    const next=p=>{if(controls.at(-1).distanceToSquared(p)>1)controls.push(p);};
    const range=Math.hypot(s.x-end.x,s.z-end.z);
    if(range>22)next(begin.clone().addScaledVector(fwd,Math.min(13,range*.17)));
    if(usingRoute&&route.via?.length){
      // Skip sightseeing waypoints the player has already flown past.
      const departure=route.approach;
      const progress=Math.hypot(s.x-departure.x,s.z-departure.z);
      for(const via of route.via){
        if(Math.hypot(via.x-departure.x,via.z-departure.z)+8<progress)continue;
        next(new T.Vector3(via.x,via.y??(world.clearance(via.x,via.z)+9),via.z));
      }
    }
    if(range<Math.max(32,(begin.y-end.y)*1.22)&&begin.y>end.y+25){
      const outward=new T.Vector3(target.exit.x-end.x,0,target.exit.z-end.z).normalize();
      const side=new T.Vector3(-outward.z,0,outward.x);
      const radius=clamp((begin.y-end.y)*.49,23,100);
      next(entry.clone().addScaledVector(side,radius).addScaledVector(outward,radius*.65).setY(lerp(begin.y,entry.y,.4)));
      next(entry.clone().addScaledVector(outward,radius*1.5).setY(lerp(begin.y,entry.y,.7)));
    }
    next(entry);const lead=entry.clone().lerp(end,.65);
    lead.y=Math.max(lead.y,end.y+.51);next(lead);next(end);
    const curve=new T.CatmullRomCurve3(controls,false,'centripetal');
    curve.arcLengthDivisions=400;
    const n=clamp(Math.ceil(curve.getLength()/1.45),4,3000);
    const points=curve.getSpacedPoints(n);
    const endZone=Math.max(3.4,entry.distanceTo(end)*.57);
    const floor=world.clearance||world.height;
    for(let i=1;i<n;i++){
      const p=points[i],toEnd=Math.hypot(p.x-end.x,p.z-end.z);
      const toStart=Math.hypot(p.x-s.x,p.z-s.z);
      // The final clear branch corridor deliberately passes inside the coarse
      // tree crown used for ordinary flight collisions.
      const envelope=smooth(toEnd,endZone,endZone+5)*smooth(toStart,0,7);
      const safe=floor(p.x,p.z)+2.65;
      p.y=Math.max(p.y,lerp(p.y,safe,envelope),Math.min(end.y,world.height(p.x,p.z)+.55));
    }
    // Anticipate ridges and treetops with a flight-sized climb and descent.
    for(let i=n-1;i>0;i--){
      const p=points[i],q=points[i+1];p.y=Math.max(p.y,q.y-.51*Math.hypot(p.x-q.x,p.z-q.z));
    }
    for(let i=1;i<n;i++){
      const p=points[i],q=points[i-1];p.y=Math.max(p.y,q.y-.77*Math.hypot(p.x-q.x,p.z-q.z));
    }
    const lengths=[0];
    for(let i=1;i<=n;i++)lengths.push(lengths[i-1]+points[i].distanceTo(points[i-1]));
    let index=1;
    return {length:lengths.at(-1),sample(d,out){
      d=clamp(d,0,lengths[n]);
      while(index<n&&lengths[index]<d)index++;
      while(index>1&&lengths[index-1]>d)index--;
      const span=lengths[index]-lengths[index-1];
      return out.copy(points[index-1]).lerp(points[index],span?(d-lengths[index-1])/span:0);
    }};
  }
  function land(s){
    if(!selected||stage!=='free')return;
    track=makeTrack(s,selected);along=0;stage='approach';s.contact=false;
    s.perchFold=s.perchGrip=s.perchFlare=0;
  }
  function cancel(s){
    if(stage==='approach'||stage==='flare'){
      if(s.airspeed<9){push(s);return;}
      stage='free';track=null;s.perchGrip=s.perchFlare=s.perchFold=0;s.path=clamp(s.path,-.35,.25);
    }
    if(stage==='free'){select(null);selection=[];}
  }
  function pan(dx,dy){if(stage==='perched'){lookYaw=angle(lookYaw+dx);lookPitch=clamp(lookPitch+dy,-.97,1.04);}}
  function push(s){
    if(!selected||!['perched','flare','approach'].includes(stage))return;
    stage='push';pushTime=0;lookYaw=lookPitch=0;
    const end=xyz(selected.exit),begin=xyz(s);
    const dir=new T.Vector3(end.x-selected.x,0,end.z-selected.z);
    if(dir.lengthSq()<1)dir.set(Math.sin(s.yaw),0,Math.cos(s.yaw));
    dir.normalize();
    const away=begin.clone().addScaledVector(dir,Math.max(14,begin.distanceTo(end)));
    away.y=Math.max(end.y,begin.y+5.3,world.clearance(away.x,away.z)+2.9);
    // Follow the inspected open side of the branch. Rise first so a push
    // from a low lateral limb can't clip the crown when the wings reopen.
    const lift=begin.clone().addScaledVector(dir,2.5);lift.y+=1.8;
    track=new T.CatmullRomCurve3([begin,lift,away],false,'centripetal');
    track.pushYaw=Math.atan2(-dir.x,-dir.z);track.pushDuration=clamp(begin.distanceTo(away)/9,1.2,3.7);
  }
  function advance(s,dt,input){
    if(stage==='free')return false;
    const update=(p)=>{
      s.distance+=Math.hypot(p.x-s.x,p.y-s.y,p.z-s.z);
      s.verticalSpeed+=(clamp((p.y-s.y)/dt,-25,25)-s.verticalSpeed)*ease(8,dt);
      s.x=p.x;s.y=p.y;s.z=p.z;
    };
    s.elapsed+=dt;s.phase=(s.phase+dt*13.5)%(Math.PI*2);s.stall=s.tuck=s.rollRate=0;s.contact=false;
    if(stage==='perched'){
      settleTime+=dt;
      if(settleTime>.3){
        // Turn on the feet after touchdown to survey the open slope or street.
        const turn=angle(openYaw-s.yaw);
        s.yaw+=clamp(turn,-2.65*dt,2.65*dt);
      }
      baseYaw=s.yaw;
      pan((input.look-input.turn)*dt*1.52,input.climb*dt);
      s.mode='Perched';s.airspeed=s.verticalSpeed=s.effort=0;
      s.perchLook=clamp(lookYaw,-1.15,1.15);s.perchLookPitch=lookPitch;
      s.perchFold+=(1-s.perchFold)*ease(3.8,dt);s.pitch+=(0-s.pitch)*ease(3.5,dt);
    } else if(stage==='push'){
      pushTime+=dt;
      const u=Math.min(1,pushTime/track.pushDuration),t=.15*u+.85*u*u;
      const old=station.set(s.x,s.y,s.z);track.getPointAt(t,ahead);
      s.airspeed=lerp(4,15.3,u);s.effort=.98;s.mode='Pushing off';s.perchGrip=1-smooth(u,0,.4);
      s.perchFold=Math.max(0,s.perchFold-dt*4.8);s.perchFlare=s.perchLook=s.perchLookPitch=0;
      s.yaw+=angle(track.pushYaw-s.yaw)*ease(6.6,dt);
      s.path=Math.atan2(ahead.y-old.y,Math.hypot(ahead.x-old.x,ahead.z-old.z)+.00001);
      s.pitch+=(clamp(s.path+.08,.02,.65)-s.pitch)*ease(6,dt);update(ahead);
      if(u===1){stage='free';s.mode='Powered flight';s.path=clamp(s.path,.06,.25);s.pitch=s.path+.06;select(null);selection=[];}
    } else {
      const remaining=track.length-along;
      const flare=1-smooth(remaining,1.2,10);
      const targetSpeed=clamp(Math.sqrt(4.9*remaining),.48,19);
      s.airspeed+=(targetSpeed-s.airspeed)*ease(remaining<9?3.8:1.2,dt);
      along=Math.min(track.length,along+Math.max(.48,s.airspeed)*dt);
      track.sample(along,station);track.sample(along+Math.max(.16,s.airspeed*.24),ahead);
      const dx=ahead.x-station.x,dz=ahead.z-station.z;
      const yaw=dx*dx+dz*dz>.000001?Math.atan2(-dx,-dz):selected.yaw;
      const turn=angle(yaw-s.yaw);
      s.yaw+=turn*ease(4.6,dt);s.bank+=(clamp(turn*.9,-.57,.57)*(1-flare)-s.bank)*ease(4.1,dt);
      s.path=Math.atan2(ahead.y-station.y,Math.hypot(dx,dz)+.0001);
      s.pitch+=(clamp(s.path,-.6,.5)*(1-flare)+.48*flare-s.pitch)*ease(5,dt);
      s.effort=clamp((s.path+.03)*1.5,0,.86)*(1-flare);s.perchGrip=flare;s.perchFlare=flare;
      stage=remaining<10?'flare':'approach';s.mode=stage==='flare'?'Landing flare':'Approaching perch';
      update(station);
      if(along===track.length){
        stage='perched';baseYaw=s.yaw;lookYaw=lookPitch=settleTime=0;track=null;
        openYaw=Math.atan2(selected.x-selected.exit.x,selected.z-selected.exit.z);
        s.y=selected.y+contactHeight;s.bank=s.path=s.verticalSpeed=s.airspeed=s.effort=0;
        s.perchGrip=1;s.perchFlare=0;s.mode='Perched';
      }
    }
    return true;
  }
  return {reset,choose,pick,land,cancel,pan,push,advance,tickHabitat,
    get stage(){return stage;},get selected(){return selected;},get routeTarget(){return routeTarget;},
    get view(){return {yaw:baseYaw+lookYaw,pitch:lookPitch};}};
};
