(() => {
  "use strict";
  const el = id => document.getElementById(id);
  const app = el("app"), modal = document.querySelector(".modal");
  const launchPicker=el("launchPoint");
  launchPicker.addEventListener("change",()=>{app.dataset.departure=launchPicker.value;});
  app.dataset.departure=launchPicker.value;
  let cameraMode="shoulder";
  const cameraButton=el("cameraView");
  function updateCameraButton(){
    app.dataset.camera=cameraMode;
    const action=cameraMode==="shoulder"?"Switch to chase camera (C)":"Switch to right shoulder camera (C)";
    if(cameraButton){cameraButton.title=action;cameraButton.setAttribute("aria-label",action);}
  }
  function switchCamera(){
    if(!started||paused)return;
    cameraMode=cameraMode==="shoulder"?"chase":"shoulder";
    resetCamera(dynamics.state);updateCameraButton();
  }
  cameraButton?.addEventListener("click",switchCamera);
  updateCameraButton();
  window.addEventListener("worldchange",()=>{if(renderer||launchPending){disposeCanopy();location.reload();}});
  const keys = new Set(), found = new Set();
  let renderer, scene, camera, world, eagle, player, gaze, cameraTarget;
  let gameVision,canopy,geology,fieldScenery,terrainShadows;
  function disposeCanopy(){
    terrainShadows?.dispose();terrainShadows=null;
    canopy?.dispose();
    geology?.dispose();
    fieldScenery?.dispose();
    canopy=null;geology=null;fieldScenery=null;
  }
  window.addEventListener("pagehide",event=>{if(!event.persisted)disposeCanopy();});
  let updateLight,updateOptics, updateWeather,perching,perchRoute,perchMarker,windSoarer;
  let perchNotice="",perchNoticeUntil=0,nextPerchHUD=0;
  let dynamics, elapsed, distance, nextReadout, noticeUntil, accumulator;
  let landmarkLook=null,landmarkLookUntil=0;
  let subject=null,previousSubject=null,subjectUntil=0,nextSighting=0;
  let cameraPerched=null,cameraBlend=1,previousOffset,previousRotation,transitionOffset,transitionRotation;
  let updateTalus, updateForest, updateHabitat, updateUnderstory, updateMist;
  let frameSeconds=0, frameCount=0, fastWindows=0;
  let glance=0, arrivalGlance=0, arrivalLookDown=0, glanceTime=0;
  let cameraYaw, cameraPath, cameraBank, cameraFov, loadPromise, launchPending=false;
  let last = performance.now(), started = false, paused = false, touchFlap = false, pointerBrake = false;
  let audio, wind, wingRush, windLevel, volume, fieldAudio, previousFocus;
  let soundOn=true;
  try { soundOn=localStorage.getItem("aerie:sound")!=="off"; } catch {}
  const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
  const easing = (rate,dt) => 1 - Math.exp(-rate*dt);
  // Point-mass flight in the moving air mass. Speed is m/s, lengths are meters,
  // and flight path, body attitude, angle of attack and bank are independent.
  function makeFlight(spawn, terrain) {
    const gravity = 9.81;
    const halfDensityAreaOverMass = .075;
    const s = {
      x: spawn.x, y: spawn.y, z: spawn.z, yaw: spawn.yaw || 0, bank: 0, rollRate: 0,
      airspeed: 17.5, indicatedAirspeed: 17.5, path: -.062, alpha: .047, pitch: 0, phase: 0, effort: 0,
      loadFactor: 1, stall: 0, tuck: 0, climb: 0, verticalSpeed: -1,
      wingExtension: .94, brakeSpread: 0, turnTrim: 0, strokeBeat: 0,
      wingLoadLeft: 0, wingLoadRight: 0, wingGustTuck: 0, yawSlip: 0, tailTwist: 0,
      ridge: 0, thermal: 0, gust: 0, lift: 0, distance: 0, elapsed: 0, mode: "Gliding", contact: false
    };
    const floor = terrain.flightClearance || terrain.clearance || terrain.height;
    const bounds = terrain.bounds || {minX:-3900,maxX:3900,minZ:-3900,maxZ:3900};
    const centers = (terrain.windField ? [] : terrain.landmarks || []).map((p,i) => ({
      x:p.x + Math.cos(i*1.93)*90, z:p.z + Math.sin(i*1.93)*90
    }));
    let nextAirSample=0, hazard=-1, recovery=false, wingCycle=false, returnBank=null;
    let poweredClimb=false, strokeLift=0, cruiseHeadwind=0;
    const smooth = (a,b,x) => {const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
    const air={windX:2.4,windZ:-1.25,gust:0,gustLift:0};
    const leftAir={}, rightAir={};
    let lastWingSample=-Infinity, lastCenterSample=-Infinity, trimWindX=0, trimWindY=0, trimWindZ=0;
    let leftPressure=0, rightPressure=0, peakLoad=0, tuckDepth=0, tuckStarted=-Infinity;
    let crossFlowAngle=0, slipRate=0, relativeSpeedChange=0;

    function senseWings(dt) {
      const field=terrain.windField;
      const spread=1-(s.perchFold||0);
      if(field && spread>.04 && s.elapsed-lastWingSample>=1/40-1e-7){
        const sampleDt=s.elapsed-lastWingSample;
        lastWingSample=s.elapsed;
        const heading=s.yaw+s.yawSlip, sinYaw=Math.sin(heading),cosYaw=Math.cos(heading);
        const sinBank=Math.sin(s.bank),cosBank=Math.cos(s.bank);
        const sinPitch=Math.sin(s.pitch),cosPitch=Math.cos(s.pitch);
        // Sample each lifting hand in world coordinates. The model is 2.2 m
        // across; a bank changes both the separation on the ground and height.
        const radius=.84*s.wingExtension*spread;
        const dx=radius*(cosYaw*cosBank+sinYaw*sinPitch*sinBank);
        const dy=radius*cosPitch*sinBank;
        const dz=radius*(-sinYaw*cosBank+cosYaw*sinPitch*sinBank);
        // The scripted approach updates the wings without running the flight
        // controller. Keep the local ground plane current on that path too.
        if(s.elapsed-lastCenterSample>.16){
          field.sample(s.x,s.y,s.z,s.elapsed,air);
          lastCenterSample=s.elapsed;
        }
        field.sample(s.x-dx,s.y-dy,s.z-dz,s.elapsed,leftAir,air);
        field.sample(s.x+dx,s.y+dy,s.z+dz,s.elapsed,rightAir,air);
        const leftUp=leftAir.ridge+leftAir.thermal+leftAir.gustLift+(leftAir.eddyLift||0);
        const rightUp=rightAir.ridge+rightAir.thermal+rightAir.gustLift+(rightAir.eddyLift||0);
        const leftX=leftAir.windX+(leftAir.eddyX||0),leftZ=leftAir.windZ+(leftAir.eddyZ||0);
        const rightX=rightAir.windX+(rightAir.eddyX||0),rightZ=rightAir.windZ+(rightAir.eddyZ||0);
        const meanX=.5*(leftX+rightX),meanZ=.5*(leftZ+rightZ);
        // The wings trim to a sustained moving air mass. Rapid changes and
        // spanwise shear produce a local lift increment (in units of weight).
        const acclimate=sampleDt>.25?1:easing(1.7,sampleDt);
        trimWindX+=(meanX-trimWindX)*acclimate;
        trimWindY+=((leftUp+rightUp)*.5-trimWindY)*acclimate;
        trimWindZ+=(meanZ-trimWindZ)*acclimate;
        const crossFlow=(meanX-trimWindX)*Math.cos(s.yaw)-(meanZ-trimWindZ)*Math.sin(s.yaw);
        crossFlowAngle=Math.atan2(crossFlow,Math.max(4,s.airspeed));
        // Velocity relative to the local gust differs from velocity through
        // the slowly entrained air parcel that carries the bird's momentum.
        const horizontal=s.airspeed*Math.cos(s.path);
        relativeSpeedChange=Math.hypot(-Math.sin(s.yaw)*horizontal+trimWindX-meanX,
          s.airspeed*Math.sin(s.path)+trimWindY-.5*(leftUp+rightUp),
          -Math.cos(s.yaw)*horizontal+trimWindZ-meanZ)-s.airspeed;
        const nx=-cosYaw*sinBank+sinYaw*sinPitch*cosBank;
        const ny=cosPitch*cosBank,nz=sinYaw*sinBank+cosYaw*sinPitch*cosBank;
        const area=.28+.72*s.wingExtension;
        const liftSlope=4.75*halfDensityAreaOverMass*area*Math.max(3,s.airspeed)/gravity;
        const pressure=(flowX,up,flowZ)=>{
          const wx=flowX-trimWindX, wy=up-trimWindY, wz=flowZ-trimWindZ;
          const normalFlow=wx*nx+wy*ny+wz*nz;
          const headwind=(wx*sinYaw+wz*cosYaw)*cosPitch-wy*sinPitch;
          return spread*clamp(liftSlope*normalFlow+2*headwind/Math.max(3,s.airspeed),-1,1);
        };
        leftPressure=pressure(leftX,leftUp,leftZ);
        rightPressure=pressure(rightX,rightUp,rightZ);
      }else if(!field || spread<=.04){
        lastWingSample=-Infinity;
        leftPressure=rightPressure=0;
        crossFlowAngle=peakLoad=relativeSpeedChange=0;
      }
      // Compliance responds before corrective trim. Sustained, uniform wind
      // produces no oscillation; each side has to encounter a change in flow.
      const compliance=easing(25,dt);
      s.wingLoadLeft+=(leftPressure-s.wingLoadLeft)*compliance;
      s.wingLoadRight+=(rightPressure-s.wingLoadRight)*compliance;
      s.indicatedAirspeed=Math.max(0,s.airspeed+relativeSpeedChange*spread);
      const common=.5*(s.wingLoadLeft+s.wingLoadRight);
      peakLoad=Math.max(common,peakLoad*Math.exp(-1.8*dt));
      // In steppe eagle footage a rapid unloading after a positive gust can
      // briefly drop both wings below horizontal, without an upward beat.
      const unloaded=peakLoad-common;
      if(s.elapsed-tuckStarted>1.5 && peakLoad>.16 && common<-.13 && unloaded>.44 &&
         s.effort<.18 && s.tuck<.25 && s.brakeSpread<.24 && spread>.9 && (s.perchFlare||0)<.1){
        tuckStarted=s.elapsed;
        tuckDepth=clamp(.20+.65*(unloaded-.44),.20,.78);
        peakLoad=0;
      }
      const age=s.elapsed-tuckStarted;
      s.wingGustTuck=age<.375?tuckDepth*smooth(0,.17,age)*(1-smooth(.19,.375,age))*spread:0;
      // The torso weathercocks into a new lateral gust. Differential drag
      // initially yaws the beak against a roll; tail cant damps that skid.
      // In a steady turn the track and body realign. Positive yaw is left,
      // positive tail cant is the right side of the fan raised.
      const freedom=spread*(1-(s.perchGrip||0));
      const slipError=.82*clamp(crossFlowAngle,-.36,.36)*freedom-s.yawSlip;
      const tailTarget=clamp(-1.15*slipError-.16*s.rollRate+.075*slipRate,-.32,.32)*freedom;
      s.tailTwist+=(tailTarget-s.tailTwist)*easing(8,dt);
      slipRate+=(22*slipError-6.7*slipRate-1.15*s.rollRate*freedom-3.4*s.tailTwist)*dt;
      s.yawSlip=clamp(s.yawSlip+slipRate*dt,-.25,.25);
    }
    function sampleAirAndTerrain() {
      if(terrain.windField){
        terrain.windField.sample(s.x,s.y,s.z,s.elapsed,air);
        lastCenterSample=s.elapsed;
        s.ridge=air.ridge;s.thermal=air.thermal;s.gust=air.gust;
      }else{
        const ground = terrain.height(s.x,s.z), clearance = Math.max(0,s.y-ground);
        const slopeX = (terrain.height(s.x+24,s.z)-terrain.height(s.x-24,s.z))/48;
        const slopeZ = (terrain.height(s.x,s.z+24)-terrain.height(s.x,s.z-24))/48;
        s.ridge = clamp((slopeX*air.windX+slopeZ*air.windZ)*1.45,-1.1,3.5)*Math.exp(-clearance/175);
        s.thermal = 0;
        for(const column of centers) {
          const radius = 76+clamp(clearance*.11,0,95);
          const dx=s.x-column.x-air.windX*clearance*.07, dz=s.z-column.z-air.windZ*clearance*.07;
          const core=Math.exp(-(dx*dx+dz*dz)/(radius*radius));
          s.thermal=Math.max(s.thermal,3.3*core*smooth(5,70,clearance)*(1-smooth(700,1550,clearance)));
        }
      }
      // Sample along the anticipated turning arc. The flare can bleed speed and
      // fail if the player dives into a wall too late; it never moves the bird up a slope.
      hazard = -1.5;
      const turnRate = gravity*Math.tan(s.bank)/Math.max(8,s.airspeed);
      for(const seconds of [.45,1.35,2.8,4.2]) {
        const heading=s.yaw+turnRate*seconds*.5;
        const ahead=s.airspeed*Math.cos(s.path)*seconds;
        const px=s.x-Math.sin(heading)*ahead+air.windX*seconds;
        const pz=s.z-Math.cos(heading)*ahead+air.windZ*seconds;
        const angle=Math.atan2(floor(px,pz,s.y)+2.2-s.y,Math.max(1,ahead));
        hazard=Math.max(hazard,angle);
      }
      const edge=Math.min(s.x-bounds.minX,bounds.maxX-s.x,s.z-bounds.minZ,bounds.maxZ-s.z);
      returnBank=null;
      if(edge < 180) {
        const centerYaw=Math.atan2(s.x-(bounds.minX+bounds.maxX)*.5,s.z-(bounds.minZ+bounds.maxZ)*.5);
        const error=Math.atan2(Math.sin(centerYaw-s.yaw),Math.cos(centerYaw-s.yaw));
        returnBank=clamp(error*1.15,-.92,.92)*(1-smooth(20,180,edge));
      }
    }
    function lerpRate(low,high){
      return low+(high-low)*smooth(18,40,s.airspeed);
    }
    function step(dt,input) {
      if(s.contact)return;
      s.elapsed += dt;
      if(s.elapsed>=nextAirSample){sampleAirAndTerrain();nextAirSample=s.elapsed+.14;}
      senseWings(dt);
      const escape=s.goAround;
      const escapeAge=escape?s.elapsed-escape.began:0;
      const assisting=escape?1-smooth(1.5,2.6,escapeAge):0;
      const power=escape?.powered&&!input.brake?assisting*(1+Math.min(input.climb,0)):0;
      if(escape){
        const reaching=1-smooth(0,.38,escapeAge);
        s.perchGrip=escape.grip*reaching;s.perchFlare=escape.flare*reaching;
        if(escapeAge>=2.6)s.goAround=null;
      }
      s.climb=input.climb||power*.68;
      const brake=clamp(Number(input.brake)||0,0,1);
      const braking=brake>.5;
      s.lift+=(s.ridge+s.thermal+air.gustLift-s.lift)*easing(1.8,dt);
      const turn=input.turn||(escape?escape.turn*assisting:0);
      const commandedBank=returnBank===null ? -turn*.94 : returnBank;
      // Differential wing loading rolls the body first. As the commanded
      // bank is reached the opposite wing catches the roll; lift turns the track.
      const rollError=commandedBank-s.bank;
      const trimCommand=clamp(-1.8*rollError+.29*s.rollRate,-1,1);
      s.turnTrim+=(trimCommand-s.turnTrim)*easing(10,dt);
      const rollAuthority=clamp((s.airspeed/16)**1.5,.34,1.7)*s.wingExtension;
      const gustRoll=4.5*(s.wingLoadRight-s.wingLoadLeft)*s.wingExtension;
      s.rollRate+=(gustRoll-8.1*s.turnTrim*rollAuthority-(2.8+rollAuthority)*s.rollRate)*dt;
      s.bank=clamp(s.bank+s.rollRate*dt,-1.21,1.21);

      // In a sustained headwind a gliding eagle trims faster to cover ground.
      // Pitch trades height for speed; there is no thrust on this path. The
      // normal stick, brake and stroke commands retain priority.
      const headwind=trimWindX*Math.sin(s.yaw)+trimWindZ*Math.cos(s.yaw);
      cruiseHeadwind+=(headwind-cruiseHeadwind)*easing(.36,dt);
      const windBias=.33*clamp(cruiseHeadwind,-7,13)*(1-brake)*(input.flap?0:1-s.effort);
      const trimPath = -.074 + clamp((s.airspeed-16.4-windBias)*.02,-.19,.20);
      // Start beating before pull-up speed reaches the stall. Leave a band
      // between entry and exit so a single downstroke cannot toggle the assist.
      if(s.climb<=.06 || s.airspeed>(braking?12.0:16.2))poweredClimb=false;
      else if(s.climb>.12 && s.airspeed<(braking?10.7:14.3))poweredClimb=true;
      // As speed falls, ease the nose over to spend the next stroke on both
      // forward speed and height. The stroke supplies the actual lift below.
      const climbAngle=poweredClimb ? clamp(.09+(s.airspeed-13.5)*.065,-.18,.40) : .40;
      // A commanded flare takes precedence over the stick's automatic flapping.
      // If the bird is genuinely short of airspeed, strokes can recover the glide.
      const beatRequest=(input.flap||power>.15)&&(!braking||s.airspeed<10.7);
      // A braking bird can round out while it has kinetic energy to trade.
      // Below that speed its open wings still produce drag and it settles.
      const brakingPath=brake*(.12*smooth(13,25,s.airspeed)-.18*(1-smooth(9,14,s.airspeed)));
      const requestedPath = trimPath*(1-Math.abs(s.climb)) + brakingPath +
        (s.climb<0 ? s.climb*1.04 : s.climb*climbAngle) + (beatRequest && !poweredClimb ? .17 : 0);
      const flaring=hazard>requestedPath+.025;
      const desiredPath=clamp(Math.max(requestedPath,hazard+.018),-1.1,.64);
      const fastPullup=Math.max(0,s.climb)*smooth(16.5,30,s.airspeed)*
        (.2+.8*smooth(.04,.70,desiredPath-s.path));
      const groundFlare=flaring?smooth(.06,.47,hazard-s.path)*smooth(12,25,s.airspeed):0;
      const fanDemand=poweredClimb?brake*(1-.45*s.effort):brake;
      // Check a long stoop by easing the fan and outer hand open as pressure
      // builds. The extra area raises drag until it balances gravity along
      // the dive, while a short pitch-over keeps the narrow silhouette.
      const speedCheck=s.tuck*smooth(34,47,s.airspeed);
      const brakeCommand=Math.max(fanDemand,fastPullup,groundFlare,.41*speedCheck);
      // The fan and the swept arm open over finite travel. At higher dynamic
      // pressure the pullout progressively reloads the extended wing.
      const fanTravel=brakeCommand>s.brakeSpread?lerpRate(2.9,1.45):3.8;
      s.brakeSpread+=clamp(brakeCommand-s.brakeSpread,-fanTravel*dt,fanTravel*dt);
      const wantsStroke=beatRequest || poweredClimb || (flaring && s.airspeed<12);
      // The bird leaves a level-wing glide by raising its hands before the
      // first power stroke. Even a tap completes the stroke and returns the
      // arms to level. A running takeoff can hand its current phase through.
      const levelOnRecovery=Math.PI*1.5;
      if(wantsStroke && !wingCycle){
        if(s.effort<.12)s.phase=levelOnRecovery;
        wingCycle=true;
      }
      if(wingCycle) {
        const hz=2.17+.43*(1-smooth(10,23,s.airspeed));
        const nextPhase=s.phase+Math.PI*2*hz*dt;
        if(!wantsStroke && s.phase<levelOnRecovery && nextPhase>=levelOnRecovery){
          s.phase=levelOnRecovery;
          wingCycle=false;
        }else s.phase=nextPhase%(Math.PI*2);
      }
      // Shallow propulsive beats suffice at speed. Use deeper strokes when
      // forward speed is scarce, when climbing, and when supporting a bank.
      const amplitude=clamp(.68+.32*(1-smooth(12,23,s.airspeed))+
        .09*Math.max(0,s.climb)+.07*Math.abs(s.bank),.68,1);
      s.effort+=((wingCycle?amplitude:0)-s.effort)*easing(wingCycle?8.3:5.9,dt);
      s.strokeBeat=s.effort*Math.sin(s.phase);
      const downstroke=Math.max(0,Math.sin(s.phase));
      const stroke=s.effort*downstroke*downstroke;
      strokeLift+=(stroke-strokeLift)*easing(23,dt);
      // Keep lifting area while pitching over from a slow glide. Sweep the
      // hand progressively as gravity builds airspeed and dynamic pressure.
      const diveSweep=.16+.84*smooth(10.5,22,s.airspeed);
      const diveDemand=clamp(-s.climb,0,1)*diveSweep*(1-s.effort)*(flaring?0:1)*(1-brake);
      s.tuck+=(diveDemand-s.tuck)*easing(diveDemand>s.tuck?2.0:4.8,dt);
      const efficientSpan=.96-.065*smooth(15,27,s.airspeed);
      const recoveryFlex=.085*s.effort*Math.max(0,-Math.sin(s.phase));
      const targetSpan=efficientSpan*(1-s.brakeSpread)+s.brakeSpread-.47*s.tuck-recoveryFlex-
        .12*s.wingGustTuck+.07*speedCheck;
      const spanRate=targetSpan>s.wingExtension?lerpRate(1.6,.58):1.65;
      s.wingExtension+=clamp(targetSpan-s.wingExtension,-spanRate*dt,spanRate*dt);
      const velocityPressure=halfDensityAreaOverMass*s.airspeed*s.airspeed;
      // The wing's arm stays above the body while the hand sweeps. The lifting
      // area shrinks more slowly than the full wingspan squared.
      const area=.28+.72*s.wingExtension;
      const q=velocityPressure*area;
      const cosBank=Math.max(.4,Math.cos(s.bank));
      const normalTarget=gravity*Math.cos(s.path)/cosBank+
        clamp((desiredPath-s.path)*s.airspeed*1.45,-10,14.6);
      let alphaCommand=clamp((normalTarget/Math.max(1,q)-.22)/4.75,-.12,.34);
      if(!recovery && s.airspeed<10 && s.alpha>.199)recovery=true;
      if(recovery && s.airspeed>13.1)recovery=false;
      if(recovery)alphaCommand=Math.min(alphaCommand,.055);
      s.alpha+=(alphaCommand-s.alpha)*easing(4.2,dt);
      s.stall+=(Number(recovery)-s.stall)*easing(recovery?3.3:2,dt);
      const separation=smooth(.20,.34,s.alpha);
      const liftCoefficient=.22+4.75*s.alpha-.70*separation;
      const induced=.054*area/(s.wingExtension*s.wingExtension)*liftCoefficient*liftCoefficient;
      const profile=.018+.32*separation+.021*s.effort+.165*s.brakeSpread;
      const drag=q*(profile+induced)+velocityPressure*.007+.045;
      const gustLift=gravity*.18*(s.wingLoadLeft+s.wingLoadRight);
      // The leading edge rotates down as a gust reflex drops the hand.
      // Its briefly lost incidence unloads the wing beyond the reduction
      // in projected span, then recovers as the hand levels.
      const incidenceRetention=1-.86*s.wingGustTuck;
      const lift=q*liftCoefficient*incidenceRetention+strokeLift*6.7+gustLift;
      const thrust=strokeLift*9.3;
      // Tangential gravity exchanges kinetic and potential energy. Aerodynamic
      // lift turns the velocity vector; only thrust and moving air add energy.
      const speed=Math.max(3,s.airspeed);
      s.airspeed=Math.max(3,s.airspeed+(thrust-drag-gravity*Math.sin(s.path))*dt);
      s.path=clamp(s.path+(lift*cosBank-gravity*Math.cos(s.path))/speed*dt,-1.34,1.13);
      s.yaw+=lift*Math.sin(s.bank)/(speed*Math.max(.28,Math.cos(s.path)))*dt;
      s.loadFactor=lift/gravity;
      const bodyAngle=s.path+s.alpha*.68+.018+.225*s.brakeSpread+
        .021*(s.wingLoadLeft+s.wingLoadRight);
      s.pitch+=(bodyAngle-s.pitch)*easing(7,dt);
      const planar=s.airspeed*Math.cos(s.path);
      // A new parcel accelerates the bird over time; a sampled wind step
      // cannot instantaneously displace its mass sideways.
      const driftX=terrain.windField?trimWindX:air.windX,driftZ=terrain.windField?trimWindZ:air.windZ;
      let vx=-Math.sin(s.yaw)*planar+driftX, vz=-Math.cos(s.yaw)*planar+driftZ;
      s.verticalSpeed=Math.sin(s.path)*s.airspeed+s.lift;
      if(escape&&escapeAge<.55){
        // The guided approach carries ground velocity. Let the wings take
        // up the local air mass without an instantaneous change of course.
        if(!escape.drift)escape.drift={x:escape.vx-vx,y:escape.vy-s.verticalSpeed,z:escape.vz-vz};
        const carry=1-smooth(0,.55,escapeAge);
        vx+=escape.drift.x*carry;vz+=escape.drift.z*carry;s.verticalSpeed+=escape.drift.y*carry;
      }
      const x=s.x+vx*dt,z=s.z+vz*dt,y=s.y+s.verticalSpeed*dt;
      if(y<=floor(x,z,y)+.25){s.contact=true;s.mode="Touchdown";return;}
      s.x=x;s.y=y;s.z=z;s.distance+=Math.hypot(vx,s.verticalSpeed,vz)*dt;
      if(recovery)s.mode="Stall recovery";
      else if(brake>.12&&s.brakeSpread>.14)s.mode="Air braking";
      else if(flaring && hazard>-.06)s.mode="Flaring";
      else if(poweredClimb && s.effort>.5)s.mode="Powered climb";
      else if(s.effort>.5)s.mode="Powered flight";
      else if(s.tuck>.45 && s.path<-.16)s.mode="Diving";
      else if(s.verticalSpeed>.3 && s.thermal>1 && s.thermal>s.ridge)s.mode="Thermal soaring";
      else if(s.verticalSpeed>.3 && s.ridge>.8)s.mode="Ridge soaring";
      else if(s.path>.1)s.mode="Pull-up";
      else s.mode="Gliding";
    }
    return {state:s,step,senseWings};
  }
  function planGoAround(s,velocity){
    const powered=s.airspeed<15||s.path<-.34;
    const departure={began:s.elapsed,powered,turn:0,grip:s.perchGrip||0,flare:s.perchFlare||0,
      vx:velocity.x,vy:velocity.y,vz:velocity.z};
    const neutral={turn:0,climb:0,look:0,brake:0,flap:false};
    // Check forward escapes using the same controls, lift, wind and collision
    // surface as the player. Prefer straight flight when there is room.
    for(const turn of [0,-.55,.55,-.92,.92]){
      const trial=makeFlight(s,world);
      Object.assign(trial.state,s,{goAround:{...departure,turn}});
      for(let tick=0;tick<540&&!trial.state.contact;tick++)trial.step(1/60,neutral);
      if(!trial.state.contact&&trial.state.airspeed>10.5&&trial.state.stall<.3)return {...departure,turn};
    }
    return null;
  }
  function audioIcon() {
    const label = soundOn ? "Mute sound" : "Turn sound on";
    el("sound").title = label;
    el("sound").setAttribute("aria-label",label);
    const marks = soundOn ? '<path d="M16 8q4 4 0 8m3-11q7 7 0 14"/>' : '<path d="m16 9 6 6m0-6-6 6"/>';
    el("sound").innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 9h4l5-4v14l-5-4H3z"/>'+marks+'</svg>';
  }
  function prepareAudio() {
    if (!audio) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      audio = new Context();
      const buffer = audio.createBuffer(1,audio.sampleRate*4,audio.sampleRate);
      const samples = buffer.getChannelData(0);
      let s = 0;
      for (let i=0;i<samples.length;i++) { s=(s+(Math.random()*2-1)*.12)/1.04; samples[i]=s; }
      const source = audio.createBufferSource();
      wind = audio.createBiquadFilter(); wind.type="lowpass"; wind.frequency.value=700;
      volume=audio.createGain();volume.gain.value=0;
      windLevel=audio.createGain();windLevel.gain.value=.67;
      wingRush=audio.createGain();wingRush.gain.value=0;
      const featherBand=audio.createBiquadFilter();featherBand.type="bandpass";
      featherBand.frequency.value=650;featherBand.Q.value=.62;
      source.buffer=buffer;source.loop=true;
      source.connect(wind).connect(windLevel).connect(volume);
      source.connect(featherBand).connect(wingRush).connect(volume);
      volume.connect(audio.destination);source.start();
    }
    audio.resume().catch(()=>{});
  }
  function startAudio(){
    try{
      prepareAudio();
    }catch(error){
      // A denied audio device can still leave a playable 3D flight.
      audio?.close?.().catch(()=>{});
      audio=null;fieldAudio=null;
      console.warn("Flight audio could not start",error);
    }
    if(!audio){soundOn=false;audioIcon();}
  }
  function syncAudio(){
    if(!audio)return;
    const audible=soundOn&&started&&!paused;
    if(audible && !fieldAudio)fieldAudio=window.makeFieldAudio?.(audio,world.region);
    fieldAudio?.setEnabled(audible);
    volume.gain.setTargetAtTime(audible?.12*(window.aerieWindTrim??1):0,audio.currentTime,.14);
  }
  function toggleSound(){
    soundOn=!soundOn;
    try { localStorage.setItem("aerie:sound",soundOn?"on":"off"); } catch {}
    if(soundOn)startAudio();
    syncAudio();audioIcon();
  }
  el("sound").onclick=toggleSound;audioIcon();
  if (!document.fullscreenEnabled) el("expand").hidden=true;
  el("expand").onclick=async()=>{if(document.fullscreenElement)await document.exitFullscreen();else await app.requestFullscreen();};
  function resetInput(){keys.clear();pointer.clear();touchFlap=false;pointerBrake=false;}
  function showDialog(type) {
    if(type==="places"&&!started)return;
    previousFocus=document.activeElement;
    modal.dataset.dialog=type;
    paused=true;resetInput();modal.hidden=false;syncAudio();
    if(audio){wingRush.gain.setTargetAtTime(0,audio.currentTime,.08);windLevel.gain.setTargetAtTime(.25,audio.currentTime,.3);}
    const inFlight=started, controls=type==="controls";
    el("placeList").hidden=type!=="places";
    if(type==="places")fillPlaces();
    el("dialogTitle").textContent=type==="places"?"Explore landmarks":type==="contact"?"Terrain contact":controls?"Flight controls":"Flight paused";
    el("instructions").hidden=!controls;
    const progress=inFlight ? (distance/1000).toFixed(1)+" km flown · "+found.size+" / "+world.landmarks.length+" landmarks discovered" : "";
    el("summary").textContent=type==="places"?"Choose a landmark to fly nearby. "+progress:progress;
    el("back").textContent=type==="launchError"?"Try again":inFlight?(dynamics?.state.contact?"Fly again":"Resume flight"):"Back";
    el("end").hidden=!inFlight;el("back").focus();
  }
  function closeDialog(){
    modal.hidden=true;paused=false;syncAudio();last=performance.now();previousFocus?.focus();
    if(started && dynamics?.state.contact)startFlight();
  }
  el("visionToggle").onclick=()=>{if(started&&!paused)gameVision.toggle();};
  el("places").onclick=()=>showDialog("places");
  el("help").onclick=()=>showDialog("controls");el("pause").onclick=()=>showDialog("pause");
  el("back").onclick=()=>{
    const retry=modal.dataset.dialog==="launchError";
    closeDialog();
    if(retry)el("fly").click();
  };
  el("end").onclick=()=>{started=false;app.dataset.mode="title";closeDialog();el("fly").focus();};
  async function init() {
    if (world && eagle && loadPromise) return loadPromise;
    const region=el("worldPicker")?.value||"swiss";
    await loadFlightRange(region);
    renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});
    renderer.setPixelRatio(Math.min(devicePixelRatio,pixelRatioLimit));renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.03;
    scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(76,1,.035,["winnipesaukee","moosehead","surry"].includes(region)?83000:49000);
    camera.layers.enable(1); // Sediment, prints and the water surface itself belong in the direct view.
    player=new THREE.Vector3();gaze=new THREE.Vector3();cameraTarget=new THREE.Vector3();
    previousOffset=new THREE.Vector3();transitionOffset=new THREE.Vector3();
    previousRotation=new THREE.Quaternion();transitionRotation=new THREE.Quaternion();
    const manager=THREE.DefaultLoadingManager;
    const priorLoad=manager.onLoad,priorProgress=manager.onProgress,priorError=manager.onError;
    let done, fail, failedAsset="";
    const assets=new Promise((resolve,reject)=>{done=resolve;fail=reject;});
    manager.onLoad=()=>{priorLoad?.();if(failedAsset)fail(new Error("Unable to open scenery asset "+failedAsset));else done();};
    manager.onProgress=(url,complete,total)=>{
      priorProgress?.(url,complete,total);
      if(launchPending)el("fly").lastChild.textContent=complete===total?" Preparing flight scenery…":" Opening range · "+Math.round(complete/total*100)+"%";
    };
    manager.onError=url=>{failedAsset||=String(url).split("?")[0].split("/").pop()||"image";priorError?.(url);};
    try {
      const factory={swiss:window.makeWorld,alaska:window.makeAlaska,canyon:window.makeCanyon}[region];
      world=factory?await factory(THREE,scene):await window.makeAtlasWorld(THREE,scene,region);
      world.region=region;
      const hydrography=window.ATLAS_SURVEYS?.[region];
      if(hydrography?.shore){
        world.shorelines=[hydrography.shore,...(hydrography.shoreHoles||[])].map(ring=>ring.map(([x,z])=>({x,z})));
      }
      geology=window.makeRegionalGeology(THREE,scene,world);
      const perchHabitat=window.makePerchHabitat(THREE,scene,world,region);
      world.habitat=perchHabitat;
      perchRoute=window.makePerchRoute(THREE,world,region);
      world.launches.lookout=perchRoute.approach;
      world.flightClearance=(x,z,altitude)=>Math.max((world.clearance||world.height)(x,z,altitude),perchHabitat.clearance(x,z),canopy?.clearance?.(x,z,altitude)??-Infinity,geology?.clearance?.(x,z)??-Infinity);
      world.windField=window.makeWindField(world,region);
      perching=window.makePerchFlight(THREE,world,perchHabitat,perchRoute);
      perchMarker=new THREE.Vector3();
      if(factory)updateHabitat=addHabitat(THREE,scene,world,region);
      window.addFlightWater(THREE,scene,world);
      if(region==='acadia')window.addAcadiaCoast(THREE,scene,world);
      updateUnderstory=window.addUnderstory(THREE,scene,world);
      gameVision=window.makeGameVision(THREE,world,el("visionToggle"),el("gameVision"));
      if(region==="swiss"||region==="canyon"||region==="yosemite"||region==="dixville") updateTalus=window.addTalus?.(THREE,scene,world);
      if(region==="swiss" || region==="alaska" || world.useFirForest) updateForest=window.addForest?.(THREE,scene,world);
      updateMist=window.addValleyMist?.(THREE,scene,world);
      eagle=makeEagle(THREE);
      scene.add(eagle.object);
      eagle.motion?.setWorld?.(world);
      const plumageWeather={};
      eagle.motion?.setRainSource?.((x,z,t)=>world.windField.weatherAt?.(x,eagle.object.position.y,z,t,plumageWeather)?.rain??window.aerieRainAt?.(world,region,x,z,t)??0);
      el("viewport").replaceChildren(renderer.domElement);resize();
      world.regionalFieldScenery=fieldScenery=window.makeRegionalFieldScenery(THREE,scene,world);
      world.canopyStream=canopy=window.makeCanopyStream(THREE,renderer,scene,world);
      loadPromise=Promise.all([assets,world.ready,eagle.ready,geology.ready,fieldScenery.ready]);
      await loadPromise;
      window.addReadableWindWater(THREE,scene,world);
      windSoarer=window.makeWindSoarer(THREE,scene,world,world.windField);
      updateLight=window.makeFlightLight(THREE,renderer,scene,world,eagle);
      if(region==="surry")window.lightKeeneStreet(THREE,renderer,scene,world,eagle.object);
      updateWeather=await window.makeMovingWeather(THREE,scene,world);
      updateOptics=window.addAtmosphericOptics(THREE,scene,world);
      if(region==='acadia')window.lightAcadiaNight(THREE,scene,world);
      terrainShadows=window.makeTerrainShadows(THREE,renderer,scene,world);
      await window.prepareFlightMaterials(THREE,renderer,scene,camera);
      const departingCanopy=canopy;
      departingCanopy.ready?.then(()=>departingCanopy.warmApproachPrograms?.(camera));
      if(launchPicker.value==='canopy'&&canopy.ready){
        // Start this departure beside its authored branches when bandwidth allows.
        // A slow optional pack can still hand over naturally in flight.
        let timer;
        try{await Promise.race([canopy.ready,new Promise(resolve=>{timer=setTimeout(resolve,1500);})]);}
        finally{clearTimeout(timer);}
      }
    } catch(error) {
      disposeCanopy();
      loadPromise=null;world=null;eagle=null;renderer.dispose();renderer=null;
      throw error;
    } finally {
      manager.onLoad=priorLoad;manager.onProgress=priorProgress;manager.onError=priorError;
    }
  }
  const touchFirst=matchMedia("(pointer: coarse)").matches;
  const pixelRatioLimit=touchFirst?1.35:2;
  function resize(){
    if(!renderer || !camera)return;
    const w=app.clientWidth,h=app.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
  }
  window.addEventListener("resize",resize);
  function startFlight(){
    const launch=world.launches?.[el("launchPoint")?.value] || world.spawn;
    landmarkLook=subject=previousSubject=null;nextSighting=1.4;
    dynamics=makeFlight(launch,world);
    const s=dynamics.state;
    windSoarer.reset(s,world.windField.ensureLaunchCore(launch),launch.glance);
    perching.reset(s,el("launchPoint").value==="lookout");
    nextPerchHUD=0;perchNotice="";perchNoticeUntil=0;
    resetCamera(s,launch.glance,launch.lookDown);
    gameVision.startFlight(["game","wildlife"].includes(launchPicker.value));
    fieldAudio?.resetEncounters();
    elapsed=0;distance=0;accumulator=0;nextReadout=0;noticeUntil=0;
    frameSeconds=0;frameCount=0;fastWindows=0;
    found.clear();app.classList.remove("clearView");resetInput();started=true;paused=false;app.dataset.mode="flight";
    last=performance.now();syncAudio();advance(0);
  }
  el("fly").onclick=async()=>{
    if(launchPending)return;
    if(soundOn)startAudio();
    const button=el("fly");launchPending=true;button.disabled=true;button.lastChild.textContent=" Opening range…";
    try{
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      await init();startFlight();
    }catch(error){
      console.error(error);started=false;app.dataset.mode="title";showDialog("launchError");el("dialogTitle").textContent="Unable to start flight";
      el("summary").textContent=/webgl|graphics context/i.test(String(error))
        ?"Chrome could not start 3D graphics. Enable graphics acceleration in Chrome settings, then reopen the game."
        :"The range could not finish loading. Try again to reopen this flight.";
    }finally{launchPending=false;button.disabled=false;button.lastChild.textContent="Take flight";}
  };
  function choosePerch(){
    if(!started||paused||!perching)return;
    perching.choose(dynamics.state);
    if(!perching.selected){perchNotice="No perch in reach. Fly lower over land or closer to trees.";perchNoticeUntil=elapsed+4;}
    nextPerchHUD=0;
  }
  function perchAction(){
    if(!started||paused||!perching)return;
    const s=dynamics.state,stage=perching.stage;
    if(stage==="perched"){
      if(s.perchLaunchPending)s.perchLaunchPending=false;
      else{perching.push(s);resetInput();glance=arrivalGlance=0;}
    }
    else if(stage==="free"){if(!perching.selected)choosePerch();if(perching.selected)perching.land(s);pointer.clear();}
    else if(stage==="approach"||stage==="flare")perching.cancel(s,planGoAround);
    nextPerchHUD=0;
  }
  el("choosePerch").onclick=choosePerch;
  el("perchAction").onclick=perchAction;
  function updatePerchHUD(s){
    const stage=perching.stage,t=perching.selected;
    const pin=el("perchPin");
    app.dataset.perch=stage;
    const rang=t?Math.hypot(s.x-t.x,s.y-t.y,s.z-t.z):0;
    if(t && (stage==="free"||stage==="approach")&&rang>8){
      perchMarker.set(t.x,t.y+.4,t.z).project(camera);
      pin.hidden=perchMarker.z<=-1||perchMarker.z>=1||Math.abs(perchMarker.x)>.94||Math.abs(perchMarker.y)>.86;
      if(!pin.hidden){
        pin.style.left=((perchMarker.x+1)*50)+"%";pin.style.top=((1-perchMarker.y)*50)+"%";
        pin.lastElementChild.textContent=(t.type==="branch"?"Branch":"Ledge")+" · "+Math.round(rang)+" m";
      }
    }else pin.hidden=true;
    if(elapsed<nextPerchHUD&&app.dataset.perchStatus===stage)return;
    nextPerchHUD=elapsed+.14;app.dataset.perchStatus=stage;
    const choose=el("choosePerch"),action=el("perchAction"),status=el("perchStatus");
    choose.hidden=stage!=="free";el("airBrake").hidden=stage!=="free";
    choose.firstChild.textContent=t?"Next perch ":"Choose perch ";
    action.hidden=!t||stage==="push";
    if(!action.hidden)action.textContent=s.perchLaunchPending?"Stay on perch":stage==="perched"?"Push off":stage==="free"?"Land":"Break off";
    if(stage==="perched")status.textContent=t.label+(s.perchLaunchPending?" · Turning to launch":" · Drag to look around");
    else if(stage==="push")status.textContent="Pushing off";
    else if(t){
      const text=stage==="flare"?"Landing flare":t.label+" · "+Math.round(rang)+" m";
      status.textContent=s.perchLaunchPending?"Landing, then taking off":stage==="approach"?"Approaching "+text:text;
    }else status.textContent=elapsed<perchNoticeUntil?perchNotice:"";
  }
  const flightCodes=["KeyW","KeyA","KeyS","KeyD","KeyQ","KeyE","KeyB","ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Space"];
  window.addEventListener("keydown",event=>{
    if(started&&!paused&&!event.repeat){
      if(event.code==="KeyV"){event.preventDefault();gameVision.toggle();return;}
      if(event.code==="KeyP"){event.preventDefault();choosePerch();return;}
      if(event.code==="KeyF"||(event.code==="Space"&&perching.stage==="perched")){event.preventDefault();perchAction();return;}
      if(event.code==="Escape"&&["approach","flare"].includes(perching.stage)){event.preventDefault();perchAction();return;}
    }
    if(started&&!paused&&event.code==="KeyG"&&!event.repeat){event.preventDefault();showDialog("places");return;}
    if(started&&!paused&&event.code==="KeyC"&&!event.repeat){event.preventDefault();switchCamera();return;}
    if(started && !paused && event.code==="KeyH" && !event.repeat){app.classList.toggle("clearView");return;}
    if(event.code==="Escape"){if(!modal.hidden)closeDialog();else if(started)showDialog("pause");return;}
    if(!modal.hidden && event.code==="Tab"){
      const list=[...modal.querySelectorAll("button:not([hidden]), a[href]")].filter(element=>element.getClientRects().length);
      if(event.shiftKey && document.activeElement===list[0]){event.preventDefault();list.at(-1).focus();}
      if(!event.shiftKey && document.activeElement===list.at(-1)){event.preventDefault();list[0].focus();}
    }
    if(started&&!paused&&flightCodes.includes(event.code)){event.preventDefault();keys.add(event.code);}
  });
  window.addEventListener("keyup",event=>keys.delete(event.code));
  document.addEventListener("visibilitychange",()=>{if(document.hidden&&started&&!paused)showDialog("pause");});
  window.addEventListener("blur",resetInput);
  const viewport=el("viewport");
  const pointer=window.makeFlightPointer({
    surface:viewport, cue:el("steerCue"),
    currentStage:()=>started&&!paused ? perching?.stage : null,
    pan:(dx,dy)=>perching.pan(dx,dy),
    pick:(x,y)=>{
      const rect=viewport.getBoundingClientRect();
      const ndc=new THREE.Vector2((x-rect.left)/rect.width*2-1,1-(y-rect.top)/rect.height*2);
      perching.pick(dynamics.state,camera,ndc,{width:rect.width,height:rect.height});
      nextPerchHUD=0;
    }
  });
  el("flap").onpointerdown=e=>{el("flap").setPointerCapture(e.pointerId);
    if(perching?.stage==="perched"){perchAction();return;}touchFlap=true;};
  el("flap").onlostpointercapture=()=>{touchFlap=false;};
  const brakeButton=el("airBrake");
  brakeButton.addEventListener("pointerdown",event=>{
    if(!started||paused||perching.stage!=="free")return;
    event.preventDefault();
    brakeButton.setPointerCapture(event.pointerId);pointerBrake=true;
  });
  const releaseBrake=()=>{pointerBrake=false;};
  brakeButton.addEventListener("pointerup",releaseBrake);
  brakeButton.addEventListener("pointercancel",releaseBrake);
  brakeButton.addEventListener("lostpointercapture",releaseBrake);
  // Native keyboard activation also works when the control has focus.
  brakeButton.addEventListener("keydown",event=>{
    if(!["Enter","Space"].includes(event.code))return;
    event.preventDefault();event.stopPropagation();pointerBrake=true;
  });
  brakeButton.addEventListener("keyup",event=>{
    if(["Enter","Space"].includes(event.code)){event.stopPropagation();releaseBrake();}
  });
  brakeButton.addEventListener("blur",releaseBrake);
  function fillPlaces(){
    const list=el("placeList");
    list.replaceChildren();
    const ordered=world.landmarks.map(place=>({place,range:Math.hypot(place.x-player.x,place.z-player.z)})).sort((a,b)=>a.range-b.range);
    for(const {place,range} of ordered){
      const button=document.createElement("button"), label=document.createElement("span");
      label.textContent=place.name;
      const detail=document.createElement("small");
      detail.textContent=(found.has(place.name)?"Seen · ":"")+(range<1000?Math.round(range)+" m":(range/1000).toFixed(1)+" km");
      const view=window.aerieScenicFlight.description(world,place);
      if(view)button.title=view;
      button.append(label,detail);button.onclick=()=>flyToLandmark(place);
      list.appendChild(button);
    }
  }
  function clearStreetArrival(launch) {
    // A crosswind can carry a low street approach into a tree or an awning.
    // Fly the existing physics ahead in the current wind before placing the eagle.
    const neutral={turn:0,climb:0,brake:0,flap:false};
    const initialY=launch.y;
    for(const rise of [0,3,6,9,13,18,24,32,42]){
      launch.y=initialY+rise;
      const preview=makeFlight(launch,world);
      preview.state.elapsed=elapsed;
      let clear=true;
      for(let i=0;i<1440;i++){
        preview.step(1/120,neutral);
        const s=preview.state;
        if(s.contact||s.y-world.flightClearance(s.x,s.z)<2){
          clear=false;
          break;
        }
      }
      if(clear)return;
    }
  }
  function flyToLandmark(place) {
    const launch=window.aerieScenicFlight.approach(world,place);
    if(!launch){
      el("summary").textContent="No clear approach to "+place.name+". Choose another landmark or resume flight.";
      return;
    }
    const arrivalCore=world.windField.ensureLaunchCore(launch);
    if(world.region==='surry'&&place.approach&&place.approach[4]<=20)clearStreetArrival(launch);
    dynamics=makeFlight(launch,world);
    Object.assign(dynamics.state,{elapsed,distance});
    landmarkLook={x:place.x,y:(world.clearance||world.height)(place.x,place.z),z:place.z};
    landmarkLookUntil=elapsed+3.5;
    subject=previousSubject=null;nextSighting=landmarkLookUntil+1;
    windSoarer.reset(dynamics.state,arrivalCore,launch.glance);
    fieldAudio?.resetEncounters();
    perching.reset(dynamics.state,false);nextPerchHUD=0;perchNotice="";
    resetCamera(dynamics.state,launch.glance,launch.lookDown);
    resetInput();
    accumulator=0;nextReadout=0;
    noticeUntil=elapsed+4;
    found.add(place.name);
    el("discovery").textContent="Exploring · "+place.name;
    closeDialog();
    advance(0);
  }
  function nearestLandmark(){
    let closest,range=Infinity;
    for(const landmark of world.landmarks){
      const d=Math.hypot(landmark.x-player.x,landmark.z-player.z);
      if(d<(landmark.discoveryRadius??210)&&!found.has(landmark.name)){
        found.add(landmark.name);
        if(elapsed>=noticeUntil){noticeUntil=elapsed+5;el("discovery").textContent="Discovered · "+landmark.name;}
      }
      if(!found.has(landmark.name) && d<range){closest=landmark;range=d;}
    }
    if(elapsed<=noticeUntil)return;
    if(!closest){el("discovery").textContent="All landmarks discovered";return;}
    const heading=Math.atan2(closest.x-player.x,player.z-closest.z);
    const direction=["N","NE","E","SE","S","SW","W","NW"][(Math.round(heading/(Math.PI/4))+8)%8];
    el("discovery").textContent=closest.name+" · "+direction+" · "+(range<1000?Math.round(range)+" m":(range/1000).toFixed(1)+" km");
  }
  function resetCamera(s,arrivalDegrees=0,lookDown=0){
    arrivalLookDown=clamp(lookDown,0,50)*Math.PI/180;
    cameraPerched=null;cameraBlend=1;
    glance=arrivalGlance=arrivalDegrees*Math.PI/180;
    glanceTime=0;
    const mounted=cameraMode==="shoulder";
    cameraYaw=s.yaw+(mounted?(s.yawSlip||0):0);cameraPath=mounted?s.pitch:s.path*.54;
    cameraBank=mounted?s.bank*.72:0;cameraFov=mounted?72:76;
    camera.fov=cameraFov;camera.updateProjectionMatrix();
  }
  function positionShoulder(s,dt){
    // The mount translates with the right scapula. A partly stabilized lens
    // keeps the terrain readable while leaving bank and wingbeats visible.
    const aspectScale=clamp(camera.aspect/.95,.55,1);
    const stroke=s.effort*Math.sin(s.phase-.45);
    // Lean over the mount when looking sideways so the near wing stays below the shopfronts.
    const lean=Math.min(1,Math.abs(glance));
    const down=arrivalLookDown*clamp((6-glanceTime)/3,0,1);
    // During the final high-angle flare the scapula rises between the lens
    // and the neck. Let the mount sit higher and forward over that shoulder.
    const flare=s.perchFlare||0;
    cameraTarget.set((.137+.052*lean+.28*down)*aspectScale,
      .157+.100*lean+.16*down+.003*stroke+.115*flare,
      .058-.078*lean-.19*down-.083*flare);
    camera.position.copy(cameraTarget.applyQuaternion(eagle.object.quaternion)).add(player);
    const heading=s.yaw+(s.yawSlip||0);
    const yawError=Math.atan2(Math.sin(heading-cameraYaw),Math.cos(heading-cameraYaw));
    cameraYaw+=yawError*easing(16,dt);
    // A mounted camera follows the body through a dive. Keep a portion of
    // the flight line visible as the body rotates upward in a landing flare.
    const sightPitch=s.pitch+(s.path-s.pitch)*(.08+.62*flare);
    cameraPath+=(sightPitch-cameraPath)*easing(10,dt);
    cameraBank+=(s.bank*.72-cameraBank)*easing(10,dt);
    glanceTime+=dt;
    const manual=Number(keys.has("KeyQ"))-Number(keys.has("KeyE"));
    if(manual)arrivalGlance=0;
    const heldAngle=manual*1.13+arrivalGlance*clamp((2.65-glanceTime)/1.15,0,1);
    glance+=(heldAngle-glance)*easing(5.5,dt);
    camera.rotation.set(cameraPath-down-.033+.004*stroke-.075*Math.abs(glance),cameraYaw+glance,cameraBank,"YXZ");
  }
  function positionChase(s,dt){
    // Damp the attitude of the boom, never the world-space translation of its
    // anchor. This keeps the same framing at 15 and 45 m/s.
    const yawError=Math.atan2(Math.sin(s.yaw-cameraYaw),Math.cos(s.yaw-cameraYaw));
    cameraYaw+=clamp(yawError*easing(4.9,dt),-1.9*dt,1.9*dt);
    cameraPath+=(s.path*.54-cameraPath)*easing(3.2,dt);
    cameraBank+=(s.bank*.13-cameraBank)*easing(3,dt);
    cameraFov+=(76+clamp((s.airspeed-15)*.12,0,5)-cameraFov)*easing(1.4,dt);
    camera.fov=cameraFov;camera.updateProjectionMatrix();
    // Orbit the boom around the bird for a landmark reveal. Keeping boom and
    // lens on the same bearing leaves the bird in frame during the glance.
    glanceTime+=dt;
    const reveal=clamp((3.6-glanceTime)/1.8,0,1);
    const headingX=Math.sin(cameraYaw+arrivalGlance*reveal),headingZ=Math.cos(cameraYaw+arrivalGlance*reveal);
    // Match the bird's projected width across portrait and landscape views.
    // A high boom shows the mantle and wing coverts, while its independent
    // near-horizontal optical axis keeps the ridgelines and sky in frame.
    const framing=clamp(1.65/camera.aspect,.80,3.3);
    const wingRoom=Math.min(1,Math.abs(Math.sin(s.bank))+.35*s.effort);
    const range=2.42*framing*(1+.18*wingRoom),up=1.18*framing+range*Math.tan(arrivalLookDown*reveal*.76);
    const back=range*Math.cos(cameraPath)+up*Math.sin(cameraPath);
    cameraTarget.set(s.x+headingX*back,s.y+up*Math.cos(cameraPath)-range*Math.sin(cameraPath),s.z+headingZ*back);
    cameraTarget.y=Math.max(cameraTarget.y,world.height(cameraTarget.x,cameraTarget.z)+.72);
    camera.position.copy(cameraTarget);
    const look=30, lensPitch=cameraPath-.034-.105*wingRoom-arrivalLookDown*reveal*.76;
    gaze.set(camera.position.x-headingX*look,camera.position.y+Math.tan(lensPitch)*look,camera.position.z-headingZ*look);
    camera.up.set(-headingZ*Math.sin(cameraBank),Math.cos(cameraBank),headingX*Math.sin(cameraBank));
    camera.lookAt(gaze);
  }
  function positionPerched(s,dt){
    const view=perching.view,mounted=cameraMode==="shoulder";
    // A perched chase camera observes the steps from the approach side. The
    // mounted view rotates with the shoulders and both views still pan by hand.
    const sightYaw=mounted?view.yaw:view.orbitYaw;
    cameraYaw+=Math.atan2(Math.sin(sightYaw-cameraYaw),Math.cos(sightYaw-cameraYaw))*easing(14,dt);
    cameraPath+=(view.pitch-cameraPath)*easing(12,dt);
    if(mounted){
      // A standing eagle carries its head higher and further back than a
      // flying one, more so upright on a limb than on a ledge. The mount goes with it.
      if(s.perchOnRock)cameraTarget.set(.17,.312,.152);else cameraTarget.set(.17,.332,.183);
      camera.position.copy(cameraTarget.applyQuaternion(eagle.object.quaternion)).add(player);
      camera.rotation.set(cameraPath-.045,cameraYaw,0,"YXZ");
    }else{
      camera.position.set(s.x+Math.sin(cameraYaw)*2.45,s.y+.80,s.z+Math.cos(cameraYaw)*2.45);
      camera.position.y=Math.max(world.height(camera.position.x,camera.position.z)+.55,camera.position.y);
      gaze.set(s.x,s.y+.28+Math.tan(cameraPath)*2.3,s.z);
      camera.up.set(0,1,0);camera.lookAt(gaze);
    }
  }
  function advance(dt) {
    const held=(a,b)=>Number(keys.has(a)||keys.has(b));
    const stick=pointer.input;
    const input={
      turn:clamp(held("KeyD","ArrowRight")-held("KeyA","ArrowLeft")+stick.x,-1,1),
      climb:clamp(held("KeyW","ArrowUp")-held("KeyS","ArrowDown")+stick.y,-1,1),
      look:Number(keys.has("KeyQ"))-Number(keys.has("KeyE")),
      brake:keys.has("KeyB")||pointerBrake,
      flap:keys.has("Space")||touchFlap||stick.y>.75
    };
    // Fixed physics ticks make the same wing stroke produce the same energy
    // on a 30 Hz laptop screen and a 120 Hz display.
    accumulator+=dt;
    const tick=1/120;
    perching.tickHabitat(dynamics.state);
    while(accumulator>=tick){
      if(perching.advance(dynamics.state,tick,input))dynamics.senseWings(tick);
      else dynamics.step(tick,input);
      accumulator-=tick;
    }
    const s=dynamics.state;
    elapsed=s.elapsed;distance=s.distance;
    player.set(s.x,s.y,s.z);
    eagle.object.position.copy(player);eagle.object.rotation.set(s.pitch,s.yaw+(s.yawSlip||0),s.bank,"YXZ");
    s.gazeLanding=perching.stage==="approach"||perching.stage==="flare";
    s.gazeTurn=input.turn;
    s.gazeLook=input.look;
    s.gazeTarget=perching.stage==="push"||perching.stage==="perched"?null:perching.selected;
    s.gazeLandmark=elapsed<landmarkLookUntil?landmarkLook:null;
    const cruising=perching.stage==="free"&&!s.gazeLandmark&&!s.gazeTarget&&
      !input.turn&&!input.look&&!input.climb&&!input.brake&&!input.flap&&s.effort<.23&&
      s.tuck<.2&&s.stall<.15&&Math.abs(s.bank)<.32&&s.airspeed<30;
    if(subject&&(!cruising||elapsed>=subjectUntil||!world.wildlife?.inSight(subject)))subject=null;
    if(cruising&&elapsed>=nextSighting){
      subject=world.wildlife?.sighting(s,previousSubject)||null;
      if(subject){
        previousSubject=subject;
        subjectUntil=elapsed+.60;
        nextSighting=elapsed+5.4+1.2*Math.sin(elapsed*1.31);
      }else nextSighting=elapsed+.72;
    }
    s.gazeSubject=subject;
    eagle.update(dt,elapsed,s.effort>.05,s.pitch,s.bank,s);
    if(audio&&soundOn){
      const stroke=Math.max(0,Math.sin(s.phase-.24));
      wingRush.gain.setTargetAtTime(s.effort*stroke**1.6*2.4,audio.currentTime,.035);
    }
    const resting=perching.stage==="perched";
    if(cameraPerched!==null&&cameraPerched!==resting){
      transitionOffset.copy(previousOffset);transitionRotation.copy(previousRotation);
      cameraBlend=0;
    }
    cameraPerched=resting;
    if(resting)positionPerched(s,dt);
    else if(cameraMode==="shoulder")positionShoulder(s,dt);
    else positionChase(s,dt);
    // Keep the previous framing relative to the moving bird while the sightline
    // settles between flying and standing. Absolute interpolation drags behind a launch.
    if(cameraBlend<1){
      cameraBlend=Math.min(1,cameraBlend+dt/(resting?.38:.30));
      const blend=cameraBlend*cameraBlend*(3-2*cameraBlend);
      cameraTarget.copy(transitionOffset).add(player);
      camera.position.lerp(cameraTarget,1-blend);
      camera.quaternion.slerp(transitionRotation,1-blend);
    }
    previousOffset.copy(camera.position).sub(player);previousRotation.copy(camera.quaternion);
    updateTalus?.(player,elapsed);updateForest?.(player,elapsed);updateHabitat?.(player,elapsed);
    updateUnderstory(player,elapsed);
    windSoarer.update(dt,s);
    if(fieldAudio&&soundOn)fieldAudio.update(s,world,dt,camera,perching.stage);
    updateWeather(elapsed);
    world.update(dt,elapsed,player);updateLight?.(player,elapsed);updateMist?.(player,elapsed);updateOptics?.(player,elapsed);
    canopy?.update(player,elapsed,camera.position,camera);
    geology?.update(player,elapsed);
    fieldScenery?.update(player,elapsed);
    terrainShadows?.update(player);
    renderer.render(scene,camera);updatePerchHUD(s);gameVision.update(player,camera,elapsed);
    if(s.contact){showDialog("contact");return;}
    if(elapsed>=nextReadout){
      nextReadout=elapsed+.17;
      el("alt").textContent=Math.round(s.y+(world.altitudeOffset || 0)).toLocaleString();
      el("speed").textContent=Math.round((perching.stage==="free"?s.indicatedAirspeed:s.airspeed)*3.6);
      if(el("flightMode"))el("flightMode").textContent=s.mode;
      if(el("vario"))el("vario").textContent=(s.verticalSpeed>=0?"+":"")+s.verticalSpeed.toFixed(1);
      const deg=((Math.round(-s.yaw*180/Math.PI)%360)+360)%360;
      el("bearing").textContent=["N","NE","E","SE","S","SW","W","NW"][Math.round(deg/45)%8]+"  ·  "+String(deg).padStart(3,"0")+"°";
      nearestLandmark();
      if(audio&&soundOn){
        wind.frequency.setTargetAtTime(350+s.airspeed*33,audio.currentTime,.24);
        windLevel.gain.setTargetAtTime(.16+Math.min(1.4,s.airspeed**1.55/175),audio.currentTime,.24);
      }
    }
  }
  function frame(now){
    requestAnimationFrame(frame);
    const realDt=Math.max(0,(now-last)/1000);last=now;
    if(!started || paused)return;
    // Preserve input response on high-density displays. Wait for a sustained
    // sample before reducing the framebuffer, and recover resolution slowly.
    frameSeconds+=Math.min(realDt,.4);frameCount++;
    if(frameSeconds>=2.5){
      const fps=frameCount/frameSeconds, current=renderer.getPixelRatio();
      fastWindows=fps>54?fastWindows+1:0;
      let next=current;
      if(fps<(touchFirst?30:28))next=Math.max(Math.min(devicePixelRatio,pixelRatioLimit,touchFirst?1:1.5),current-.12);
      else if(fastWindows>=4){next=Math.min(devicePixelRatio,pixelRatioLimit,current+.12);fastWindows=0;}
      if(Math.abs(next-current)>.01)renderer.setPixelRatio(next);
      frameSeconds=0;frameCount=0;
    }
    advance(Math.min(realDt,.18));
  }
  requestAnimationFrame(frame);
})();
