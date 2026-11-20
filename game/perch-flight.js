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
  let strokeForce=0;
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
    s.perchOnRock=false;s.perchCompression=0;
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
    next(entry);
    // Swoop just below an exposed perch, then trade speed for height. Keep the
    // higher approach for a rock face or a crown that closes off that corridor.
    const lead=entry.clone().lerp(end,.67);
    let allowed=target.type!=='rock';
    const wish=end.y-1.15;
    const dir=selected.direction;
    const clearance=world.clearance||world.height;
    for(let i=0;i<=10&&allowed;i++){
      const t=i/10,p=entry.clone().lerp(end,t);
      const y=t<.67?lerp(entry.y,wish,t/.67):lerp(wish,end.y,(t-.67)/.33);
      for(const side of [-1.0,0,1.0]){
        const x=p.x+side*dir.z,z=p.z-side*dir.x;
        const surface=Math.max(clearance(x,z),habitat.surface?.(x,z)??-Infinity,habitat.clearance(x,z));
        if(t<.98 && surface+.28>y){allowed=false;break;}
      }
    }
    lead.y=allowed?wish:Math.max(lead.y,end.y+.51);
    const descendingBranch=target.type==='branch'&&!allowed;
    next(lead);next(end);
    const curve=new T.CatmullRomCurve3(controls,false,'centripetal');
    curve.arcLengthDivisions=400;
    const coarseCount=clamp(Math.ceil(curve.getLength()/1.45),4,3000);
    const points=curve.getSpacedPoints(coarseCount);
    // Sample the shape under the feet at decimeter spacing near touchdown.
    // The ordinary flight path only needs one station per wingspan.
    const fineStart=Math.max(0,coarseCount-4);
    points.length=fineStart+1;
    for(let i=fineStart*12+1;i<=coarseCount*12;i++)points.push(curve.getPointAt(i/(coarseCount*12)));
    const n=points.length-1;
    const endZone=Math.max(3.4,entry.distanceTo(end)*.57);
    const floor=world.clearance||world.height;
    for(let i=1;i<n;i++){
      const p=points[i],toEnd=Math.hypot(p.x-end.x,p.z-end.z);
      const toStart=Math.hypot(p.x-s.x,p.z-s.z);
      if(descendingBranch&&toEnd<5&&p.y>end.y){
        p.y=lerp(end.y,p.y,.20+.80*smooth(toEnd,0,5));
      }
      // The final clear branch corridor deliberately passes inside the coarse
      // tree crown used for ordinary flight collisions.
      const envelope=smooth(toEnd,endZone,endZone+5)*smooth(toStart,0,7);
      const safe=floor(p.x,p.z)+2.65;
      p.y=Math.max(p.y,lerp(p.y,safe,envelope),Math.min(end.y,world.height(p.x,p.z)+.55));
      // The target mesh has a different outline from the survey underneath it.
      // Leave space for the body across the final turn and for feet at contact.
      if(toEnd<28){
        const margin=contactHeight+.12*smooth(toEnd,0,2);
        if(target.type==='rock')p.y=Math.max(p.y,end.y+.20*smooth(toEnd,0,.7)*(1-smooth(toEnd,2,5)));
        for(const side of [-1,0,1]){
          const reach=side*smooth(toEnd,.2,2.2);
          const x=p.x+reach*dir.z,z=p.z-reach*dir.x;
          p.y=Math.max(p.y,habitat.clearance(x,z)+margin,(habitat.surface?.(x,z)??-Infinity)+margin);
        }
      }
    }
    // Anticipate ridges and treetops with a flight-sized climb and descent.
    for(let i=n-1;i>0;i--){
      const p=points[i],q=points[i+1];p.y=Math.max(p.y,q.y-.51*Math.hypot(p.x-q.x,p.z-q.z));
    }
    for(let i=1;i<n;i++){
      const p=points[i],q=points[i-1];
      // Descend early enough to round out above an enclosed limb, while the
      // terrain and branch samples still enforce the necessary clearance.
      const slope=descendingBranch ? .77+.63*(1-smooth(Math.hypot(p.x-end.x,p.z-end.z),4,25)) : .77;
      p.y=Math.max(p.y,q.y-slope*Math.hypot(p.x-q.x,p.z-q.z));
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
    s.perchOnRock=selected.type==='rock';strokeForce=0;
  }
  function cancel(s){
    if(stage==='approach'||stage==='flare'){
      if(s.airspeed<9){push(s);return;}
      stage='free';track=null;s.perchGrip=s.perchFlare=s.perchFold=0;s.perchOnRock=false;s.path=clamp(s.path,-.35,.25);
    }
    if(stage==='free'){select(null);selection=[];}
  }
  function pan(dx,dy){if(stage==='perched'){lookYaw=angle(lookYaw+dx);lookPitch=clamp(lookPitch+dy,-.97,1.04);}}
  function push(s){
    if(!selected||!['perched','flare','approach'].includes(stage))return;
    const fromRest=stage==='perched';
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
    track.pushYaw=Math.atan2(-dir.x,-dir.z);
    track.fromRest=fromRest;
    track.entrySpeed=fromRest?3.4:Math.max(3.4,s.airspeed);
    track.releaseSpeed=15.3;
    track.pushDuration=2*track.getLength()/(track.entrySpeed+track.releaseSpeed);
    track.startFold=s.perchFold||0;
    track.startGrip=s.perchGrip||0;
    if(fromRest)s.phase=0;
  }
  function advance(s,dt,input){
    if(stage==='free')return false;
    const update=(p)=>{
      s.distance+=Math.hypot(p.x-s.x,p.y-s.y,p.z-s.z);
      s.verticalSpeed+=(clamp((p.y-s.y)/dt,-25,25)-s.verticalSpeed)*ease(8,dt);
      s.x=p.x;s.y=p.y;s.z=p.z;
    };
    s.elapsed+=dt;s.stall=s.tuck=s.rollRate=0;s.contact=false;
    if(s.effort>.035)s.phase=(s.phase+dt*Math.PI*2*2.5)%(Math.PI*2);
    s.strokeBeat=s.effort*Math.sin(s.phase);
    if(stage==='perched'){
      settleTime+=dt;
      if(settleTime>.3){
        // Turn on the feet after touchdown to survey the open slope or street.
        const turn=angle(openYaw-s.yaw);
        s.yaw+=clamp(turn,-2.65*dt,2.65*dt);
      }
      baseYaw=s.yaw;
      pan((input.look-input.turn)*dt*1.52,input.climb*dt);
      s.mode='Perched';s.airspeed=s.verticalSpeed=s.effort=s.turnTrim=s.brakeSpread=0;
      s.perchLook=clamp(lookYaw,-1.15,1.15);s.perchLookPitch=lookPitch;
      // Absorb contact on the legs, briefly keep the wings deployed for
      // balance, then gather them while the body settles over the feet.
      const absorb=smooth(settleTime,0,.10)*(1-smooth(settleTime,.10,.36));
      s.perchCompression=absorb;
      s.perchFlare=1-smooth(settleTime,0,.32);
      s.wingExtension+=(1-s.wingExtension)*ease(5,dt);
      s.perchFold+=(1-s.perchFold)*ease(3.8,dt)*smooth(settleTime,.07,.24);
      s.pitch+=(0-s.pitch)*ease(3.5,dt);
    } else if(stage==='push'){
      pushTime+=dt;
      // The leg impulse begins on the support. Keep the toes anchored while
      // the body crouches and extends; bring the hands up for the first stroke.
      const preload=track.fromRest?.24:0;
      if(pushTime<=preload){
        s.mode='Pushing off';s.perchGrip=1;s.perchFlare=0;
        s.perchCompression=smooth(pushTime,0,.13)*(1-smooth(pushTime,.13,preload));
        s.perchFold=track.startFold*(1-.72*smooth(pushTime,.055,preload));
        s.airspeed=s.verticalSpeed=s.effort=s.strokeBeat=0;
        s.pitch+=(.23-s.pitch)*ease(8,dt);
        return true;
      }
      const flightTime=pushTime-preload;
      const u=Math.min(1,flightTime/track.pushDuration);
      // Integrate the exit speed in arc length so the rendered distance and
      // displayed speed agree from toe-off to the handover to free flight.
      const t=(2*track.entrySpeed*u+(track.releaseSpeed-track.entrySpeed)*u*u)/
        (track.entrySpeed+track.releaseSpeed);
      const old=station.set(s.x,s.y,s.z);track.getPointAt(t,ahead);
      s.airspeed=lerp(track.entrySpeed,track.releaseSpeed,u);
      s.effort+=(.98-s.effort)*ease(18,dt);
      s.wingExtension=lerp(.62,.97,smooth(flightTime,0,.28));
      s.brakeSpread=s.turnTrim=0;s.mode='Pushing off';
      s.perchGrip=track.startGrip*(1-smooth(flightTime,0,.16));
      s.perchFold=(track.fromRest?.28:1)*track.startFold*(1-smooth(flightTime,0,.18));
      s.perchCompression=s.perchFlare=s.perchLook=s.perchLookPitch=0;
      s.yaw+=angle(track.pushYaw-s.yaw)*ease(6.6,dt);
      s.path=Math.atan2(ahead.y-old.y,Math.hypot(ahead.x-old.x,ahead.z-old.z)+.00001);
      s.pitch+=(clamp(s.path+.08,.02,.65)-s.pitch)*ease(6,dt);update(ahead);
      if(u===1){stage='free';s.mode='Powered flight';s.path=clamp(s.path,.06,.25);s.pitch=s.path+.06;s.perchOnRock=false;select(null);selection=[];}
    } else {
      const remaining=track.length-along;
      // The path supplies the perch aim point. Along-track momentum determines
      // when we actually get there. Spreading the wings dissipates kinetic energy.
      const v=Math.max(.2,s.airspeed);
      track.sample(along,station);track.sample(along+Math.min(Math.max(.16,v*.075),remaining),ahead);
      const grade=Math.atan2(ahead.y-station.y,Math.hypot(ahead.x-station.x,ahead.z-station.z)+.0001);
      // Spend kinetic energy in proportion to the remaining braking distance.
      // The resulting approach has a finite arrival time, even on an uphill limb.
      const gripSpeed=1.65,deceleration=3.8;
      const envelopeSpeed=Math.sqrt(gripSpeed*gripSpeed+2*deceleration*remaining);
      const approachSpeed=Math.min(18.5,envelopeSpeed);
      const timeToGo=2*remaining/(envelopeSpeed+gripSpeed);
      const spreadCue=1-smooth(timeToGo,.26,1.30);
      const pitchUp=1-smooth(timeToGo,.13,1.02);
      const q=.075*v*v;
      const gravity=-9.81*Math.sin(grade);
      const trimDrag=q*.048;
      const requested=clamp((approachSpeed-v)*3.6-(envelopeSpeed<18.5?deceleration:0),-12,4.9);
      const dragDemand=clamp((gravity-trimDrag-requested)/(q*1.34),0,1);
      const commandedSpread=Math.max(dragDemand,pitchUp);
      s.brakeSpread+=(commandedSpread-(s.brakeSpread||0))*ease(7,dt);
      // The handwing briefly sweeps back during pitch-up then spreads into the
      // broad final flare. The feet come out before the remaining airspeed is lost.
      const wristSweep=Math.sin(pitchUp*Math.PI)*.14;
      s.wingExtension=(.93+.07*spreadCue)-wristSweep;
      const drag=trimDrag+q*1.34*s.brakeSpread;
      // Tilt the stroke backward to check a descent, forward to clear a rise.
      // Preserve its sign as the force builds and reverses between strokes.
      const demand=clamp(requested-gravity+drag,-14,10);
      strokeForce+=(demand-strokeForce)*ease(9,dt);
      s.effort+=(clamp(Math.abs(strokeForce)/10,0,1)-s.effort)*ease(7,dt);
      const down=Math.max(0,Math.sin(s.phase));
      const thrust=strokeForce*(.92+.32*down*down);
      s.airspeed=Math.max(.2,v+(gravity-drag+thrust)*dt);
      along=Math.min(track.length,along+(v+s.airspeed)*.5*dt);
      track.sample(along,station);track.sample(along+Math.max(.16,s.airspeed*.24),ahead);
      const dx=ahead.x-station.x,dz=ahead.z-station.z;
      const yaw=dx*dx+dz*dz>.000001?Math.atan2(-dx,-dz):selected.yaw;
      const turn=angle(yaw-s.yaw);
      s.turnTrim=clamp(-turn*1.4,-1,1)*(1-pitchUp);
      s.yaw+=turn*ease(4.6,dt);s.bank+=(clamp(turn*.9,-.57,.57)*(1-pitchUp)-s.bank)*ease(4.1,dt);
      s.path=Math.atan2(ahead.y-station.y,Math.hypot(dx,dz)+.0001);
      const bodyPitch=lerp(clamp(s.path+.04,-.62,.56),1.06,pitchUp);
      s.pitch+=(bodyPitch-s.pitch)*ease(8,dt);
      s.perchGrip=1-smooth(timeToGo,.06,.86);s.perchFlare=pitchUp;
      if(timeToGo<1.30)stage='flare';
      s.mode=stage==='flare'?'Landing flare':'Approaching perch';
      update(station);
      if(along===track.length){
        s.touchdownSpeed=s.airspeed;
        stage='perched';baseYaw=s.yaw;lookYaw=lookPitch=settleTime=0;track=null;
        openYaw=Math.atan2(selected.x-selected.exit.x,selected.z-selected.exit.z);
        s.y=selected.y+contactHeight;s.bank=s.path=s.verticalSpeed=s.airspeed=s.effort=0;
        s.perchGrip=1;s.perchFlare=1;s.perchCompression=0;s.mode='Perched';
      }
    }
    return true;
  }
  return {reset,choose,pick,land,cancel,pan,push,advance,tickHabitat,
    get stage(){return stage;},get selected(){return selected;},get routeTarget(){return routeTarget;},
    get view(){return {yaw:baseYaw+lookYaw,pitch:lookPitch};}};
};
