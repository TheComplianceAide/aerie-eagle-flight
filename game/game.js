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
  window.addEventListener("worldchange",()=>{if(renderer||launchPending)location.reload();});
  const keys = new Set(), found = new Set();
  let renderer, scene, camera, world, eagle, player, gaze, cameraTarget;
  let updateLight, updateWeather,perching,perchRoute,perchMarker,windSoarer;
  let perchNotice="",perchNoticeUntil=0,nextPerchHUD=0;
  let dynamics, elapsed, distance, nextReadout, noticeUntil, accumulator;
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
      airspeed: 17.5, path: -.062, alpha: .047, pitch: 0, phase: 0, effort: 0,
      loadFactor: 1, stall: 0, tuck: 0, climb: 0, verticalSpeed: -1,
      wingExtension: .94, brakeSpread: 0, turnTrim: 0, strokeBeat: 0,
      ridge: 0, thermal: 0, gust: 0, lift: 0, distance: 0, elapsed: 0, mode: "Gliding", contact: false
    };
    const floor = terrain.flightClearance || terrain.clearance || terrain.height;
    const bounds = terrain.bounds || {minX:-3900,maxX:3900,minZ:-3900,maxZ:3900};
    const centers = (terrain.windField ? [] : terrain.landmarks || []).map((p,i) => ({
      x:p.x + Math.cos(i*1.93)*90, z:p.z + Math.sin(i*1.93)*90
    }));
    let nextAirSample=0, hazard=-1, recovery=false, wingCycle=false, returnBank=null;
    let poweredClimb=false, strokeLift=0;
    const smooth = (a,b,x) => {const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
    const air={windX:2.4,windZ:-1.25,gust:0,gustLift:0};
    function sampleAirAndTerrain() {
      if(terrain.windField){
        terrain.windField.sample(s.x,s.y,s.z,s.elapsed,air);
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
        const angle=Math.atan2(floor(px,pz)+2.2-s.y,Math.max(1,ahead));
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
      s.climb=input.climb;
      const brake=clamp(Number(input.brake)||0,0,1);
      const braking=brake>.5;
      s.lift+=(s.ridge+s.thermal+air.gustLift-s.lift)*easing(1.8,dt);
      const commandedBank=returnBank===null ? -input.turn*.94 : returnBank;
      // Differential wing loading rolls the body first. As the commanded
      // bank is reached the opposite wing catches the roll; lift turns the track.
      const rollError=commandedBank-s.bank;
      const trimCommand=clamp(-1.8*rollError+.29*s.rollRate,-1,1);
      s.turnTrim+=(trimCommand-s.turnTrim)*easing(10,dt);
      const rollAuthority=clamp((s.airspeed/16)**1.5,.34,1.7)*s.wingExtension;
      s.rollRate+=(-8.1*s.turnTrim*rollAuthority-(2.8+rollAuthority)*s.rollRate)*dt;
      s.bank=clamp(s.bank+s.rollRate*dt,-1.21,1.21);

      const trimPath = -.074 + clamp((s.airspeed-16.4)*.02,-.19,.20);
      // Start beating before pull-up speed reaches the stall. Leave a band
      // between entry and exit so a single downstroke cannot toggle the assist.
      if(s.climb<=.06 || s.airspeed>(braking?12.0:16.2))poweredClimb=false;
      else if(s.climb>.12 && s.airspeed<(braking?10.7:14.3))poweredClimb=true;
      // As speed falls, ease the nose over to spend the next stroke on both
      // forward speed and height. The stroke supplies the actual lift below.
      const climbAngle=poweredClimb ? clamp(.09+(s.airspeed-13.5)*.065,-.18,.40) : .40;
      // A commanded flare takes precedence over the stick's automatic flapping.
      // If the bird is genuinely short of airspeed, strokes can recover the glide.
      const beatRequest=input.flap&&(!braking||s.airspeed<10.7);
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
      const brakeCommand=Math.max(fanDemand,fastPullup,groundFlare);
      // The fan and the swept arm open over finite travel. At higher dynamic
      // pressure the pullout progressively reloads the extended wing.
      const fanTravel=brakeCommand>s.brakeSpread?lerpRate(2.9,1.45):3.8;
      s.brakeSpread+=clamp(brakeCommand-s.brakeSpread,-fanTravel*dt,fanTravel*dt);
      const wantsStroke=beatRequest || poweredClimb || (flaring && s.airspeed<12);
      if(wantsStroke)wingCycle=true;
      if(wingCycle) {
        const hz=2.17+.43*(1-smooth(10,23,s.airspeed));
        s.phase+=Math.PI*2*hz*dt;
        if(s.phase>=Math.PI*2){s.phase%=Math.PI*2;if(!wantsStroke)wingCycle=false;}
      }
      s.effort+=(Number(wingCycle)-s.effort)*easing(wingCycle?7:4.8,dt);
      s.strokeBeat=s.effort*Math.sin(s.phase);
      const downstroke=Math.max(0,Math.sin(s.phase));
      const stroke=s.effort*downstroke*downstroke;
      strokeLift+=(stroke-strokeLift)*easing(23,dt);
      const diveDemand=clamp(-s.climb,0,1)*(1-s.effort)*(flaring?0:1)*(1-brake);
      s.tuck+=(diveDemand-s.tuck)*easing(diveDemand>s.tuck?2.0:4.8,dt);
      const efficientSpan=.96-.065*smooth(15,27,s.airspeed);
      const recoveryFlex=.085*s.effort*Math.max(0,-Math.sin(s.phase));
      const targetSpan=efficientSpan*(1-s.brakeSpread)+s.brakeSpread-.47*s.tuck-recoveryFlex;
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
      const lift=q*liftCoefficient+strokeLift*6.7;
      const thrust=strokeLift*9.3;
      // Tangential gravity exchanges kinetic and potential energy. Aerodynamic
      // lift turns the velocity vector; only thrust and moving air add energy.
      const speed=Math.max(3,s.airspeed);
      s.airspeed=Math.max(3,s.airspeed+(thrust-drag-gravity*Math.sin(s.path))*dt);
      s.path=clamp(s.path+(lift*cosBank-gravity*Math.cos(s.path))/speed*dt,-1.34,1.13);
      s.yaw+=lift*Math.sin(s.bank)/(speed*Math.max(.28,Math.cos(s.path)))*dt;
      s.loadFactor=lift/gravity;
      const bodyAngle=s.path+s.alpha*.68+.018+.225*s.brakeSpread;
      s.pitch+=(bodyAngle-s.pitch)*easing(7,dt);
      const planar=s.airspeed*Math.cos(s.path);
      const vx=-Math.sin(s.yaw)*planar+air.windX, vz=-Math.cos(s.yaw)*planar+air.windZ;
      s.verticalSpeed=Math.sin(s.path)*s.airspeed+s.lift;
      const x=s.x+vx*dt,z=s.z+vz*dt,y=s.y+s.verticalSpeed*dt;
      if(y<=floor(x,z)+.25){s.contact=true;s.mode="Touchdown";return;}
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
    return {state:s,step};
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
  function syncAudio(){
    if(!audio)return;
    const audible=soundOn&&started&&!paused;
    if(audible && !fieldAudio)fieldAudio=window.makeFieldAudio?.(audio,world.region);
    fieldAudio?.setEnabled(audible);
    volume.gain.setTargetAtTime(audible?.12:0,audio.currentTime,.14);
  }
  function toggleSound(){
    soundOn=!soundOn;
    try { localStorage.setItem("aerie:sound",soundOn?"on":"off"); } catch {}
    if(soundOn)prepareAudio();
    syncAudio();audioIcon();
  }
  el("sound").onclick=toggleSound;audioIcon();
  if (!document.fullscreenEnabled) el("expand").hidden=true;
  el("expand").onclick=async()=>{if(document.fullscreenElement)await document.exitFullscreen();else await app.requestFullscreen();};
  function resetInput(){keys.clear();pointer.clear();touchFlap=false;pointerBrake=false;}
  function showDialog(type) {
    if(type==="places"&&!started)return;
    previousFocus=document.activeElement;
    paused=true;resetInput();modal.hidden=false;syncAudio();
    if(audio){wingRush.gain.setTargetAtTime(0,audio.currentTime,.08);windLevel.gain.setTargetAtTime(.25,audio.currentTime,.3);}
    const inFlight=started, controls=type==="controls";
    el("placeList").hidden=type!=="places";
    if(type==="places")fillPlaces();
    el("dialogTitle").textContent=type==="places"?"Explore landmarks":type==="contact"?"Terrain contact":controls?"Flight controls":"Flight paused";
    el("instructions").hidden=!controls;
    const progress=inFlight ? (distance/1000).toFixed(1)+" km flown · "+found.size+" / "+world.landmarks.length+" landmarks discovered" : "";
    el("summary").textContent=type==="places"?"Choose a landmark to fly nearby. "+progress:progress;
    el("back").textContent=inFlight?(dynamics?.state.contact?"Fly again":"Resume flight"):"Back";
    el("end").hidden=!inFlight;el("back").focus();
  }
  function closeDialog(){
    modal.hidden=true;paused=false;syncAudio();last=performance.now();previousFocus?.focus();
    if(started && dynamics?.state.contact)startFlight();
  }
  el("places").onclick=()=>showDialog("places");
  el("help").onclick=()=>showDialog("controls");el("pause").onclick=()=>showDialog("pause");el("back").onclick=closeDialog;
  el("end").onclick=()=>{started=false;app.dataset.mode="title";closeDialog();el("fly").focus();};
  async function init() {
    if (world && eagle && loadPromise) return loadPromise;
    const region=el("worldPicker")?.value||"swiss";
    await loadFlightRange(region);
    renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});
    renderer.setPixelRatio(Math.min(devicePixelRatio,pixelRatioLimit));renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.03;
    scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(76,1,.035,["winnipesaukee","moosehead","surry"].includes(region)?83000:49000);
    player=new THREE.Vector3();gaze=new THREE.Vector3();cameraTarget=new THREE.Vector3();
    const manager=THREE.DefaultLoadingManager;
    const priorLoad=manager.onLoad,priorProgress=manager.onProgress,priorError=manager.onError;
    let done, fail, failedAsset=false;
    const assets=new Promise((resolve,reject)=>{done=resolve;fail=reject;});
    manager.onLoad=()=>{priorLoad?.();if(failedAsset)fail(new Error("A scenery image could not be loaded."));else done();};
    manager.onProgress=(url,complete,total)=>{
      priorProgress?.(url,complete,total);
      if(launchPending)el("fly").lastChild.textContent=" Opening range · "+Math.round(complete/total*100)+"%";
    };
    manager.onError=url=>{failedAsset=true;priorError?.(url);};
    try {
      const factory={swiss:window.makeWorld,alaska:window.makeAlaska,canyon:window.makeCanyon}[region];
      world=factory?await factory(THREE,scene):await window.makeAtlasWorld(THREE,scene,region);
      world.region=region;
      const hydrography=window.ATLAS_SURVEYS?.[region];
      if(hydrography?.shore){
        world.shorelines=[hydrography.shore,...(hydrography.shoreHoles||[])].map(ring=>ring.map(([x,z])=>({x,z})));
      }
      const perchHabitat=window.makePerchHabitat(THREE,scene,world,region);
      world.habitat=perchHabitat;
      perchRoute=window.makePerchRoute(THREE,world,region);
      world.launches.lookout=perchRoute.approach;
      world.flightClearance=(x,z)=>Math.max((world.clearance||world.height)(x,z),perchHabitat.clearance(x,z));
      world.windField=window.makeWindField(world,region);
      perching=window.makePerchFlight(THREE,world,perchHabitat,perchRoute);
      perchMarker=new THREE.Vector3();
      if(factory)updateHabitat=addHabitat(THREE,scene,world,region);
      window.addFlightWater(THREE,scene,world);
      updateUnderstory=window.addUnderstory(THREE,scene,world);
      if(region==="swiss") updateTalus=window.addTalus?.(THREE,scene,world);
      if(region==="swiss" || region==="alaska" || world.useFirForest) updateForest=window.addForest?.(THREE,scene,world);
      updateMist=window.addValleyMist?.(THREE,scene,world);
      eagle=makeEagle(THREE);scene.add(eagle.object);
      el("viewport").replaceChildren(renderer.domElement);resize();
      loadPromise=Promise.all([assets,world.ready,eagle.ready]);
      await loadPromise;
      window.addReadableWindWater(THREE,scene,world);
      windSoarer=window.makeWindSoarer(THREE,scene,world,world.windField);
      updateLight=window.makeFlightLight(THREE,renderer,scene,world,eagle);
      if(region==="surry")window.lightKeeneStreet(THREE,renderer,scene,world,eagle.object);
      updateWeather=await window.makeMovingWeather(THREE,scene,world);
    } catch(error) {
      loadPromise=null;world=null;eagle=null;renderer.dispose();renderer=null;
      throw error;
    } finally {
      manager.onLoad=priorLoad;manager.onProgress=priorProgress;manager.onError=priorError;
    }
  }
  const pixelRatioLimit=matchMedia("(pointer: coarse)").matches?1.35:2;
  function resize(){
    if(!renderer || !camera)return;
    const w=app.clientWidth,h=app.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
  }
  window.addEventListener("resize",resize);
  function startFlight(){
    const launch=world.launches?.[el("launchPoint")?.value] || world.spawn;
    dynamics=makeFlight(launch,world);
    const s=dynamics.state;
    windSoarer.reset(s,world.windField.ensureLaunchCore(launch),launch.glance);
    perching.reset(s,el("launchPoint").value==="lookout");
    nextPerchHUD=0;perchNotice="";perchNoticeUntil=0;
    resetCamera(s,launch.glance,launch.lookDown);
    elapsed=0;distance=0;accumulator=0;nextReadout=0;noticeUntil=0;
    frameSeconds=0;frameCount=0;fastWindows=0;
    found.clear();app.classList.remove("clearView");resetInput();started=true;paused=false;app.dataset.mode="flight";
    last=performance.now();syncAudio();advance(0);
  }
  el("fly").onclick=async()=>{
    if(launchPending)return;
    if(soundOn)prepareAudio();
    const button=el("fly");launchPending=true;button.disabled=true;button.lastChild.textContent=" Opening range…";
    try{
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      await init();startFlight();
    }catch(error){
      console.error(error);started=false;app.dataset.mode="title";showDialog("controls");el("dialogTitle").textContent="Unable to start flight";
      el("instructions").hidden=true;el("summary").textContent="The 3D range could not load. Open the offline game in Chrome with graphics acceleration enabled.";
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
    if(stage==="perched"){perching.push(s);resetInput();resetCamera(s);}
    else if(stage==="free"){if(!perching.selected)choosePerch();if(perching.selected)perching.land(s);pointer.clear();}
    else if(stage==="approach"||stage==="flare"){perching.cancel(s);resetCamera(s);}
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
    if(!action.hidden)action.textContent=stage==="perched"?"Push off":stage==="free"?"Land":"Break off";
    if(stage==="perched")status.textContent=t.label+" · Drag to look around";
    else if(stage==="push")status.textContent="Pushing off";
    else if(t){
      const text=stage==="flare"?"Landing flare":t.label+" · "+Math.round(rang)+" m";
      status.textContent=stage==="approach"?"Approaching "+text:text;
    }else status.textContent=elapsed<perchNoticeUntil?perchNotice:"";
  }
  const flightCodes=["KeyW","KeyA","KeyS","KeyD","KeyQ","KeyE","KeyB","ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Space"];
  window.addEventListener("keydown",event=>{
    if(started&&!paused&&!event.repeat){
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
      button.append(label,detail);button.onclick=()=>flyToLandmark(place);
      list.appendChild(button);
    }
  }
  function landmarkApproach(place) {
    const floor=world.clearance||world.height;
    const range=Math.min(120,(place.discoveryRadius??210)*.8);
    const margin=clamp(range*.24,12,30);
    const {minX,maxX,minZ,maxZ}=world.bounds;
    if(place.approach){
      const [x,z,tx,tz,agl,glance=0,lookDown=0]=place.approach;
      if(x>=minX&&x<=maxX&&z>=minZ&&z<=maxZ&&Math.hypot(x-place.x,z-place.z)<(place.discoveryRadius??210)){
        return {x,y:floor(x,z)+agl,z,yaw:Math.atan2(x-tx,z-tz),glance,lookDown};
      }
    }
    const targetHeight=floor(place.x,place.z);
    let best;
    // Find a clear approach aimed at the landmark, even on a cliff or in trees.
    for(let i=0;i<12;i++){
      const yaw=i*Math.PI/6, dx=Math.sin(yaw), dz=Math.cos(yaw);
      const x=place.x+dx*range, z=place.z+dz*range;
      if(x<minX||x>maxX||z<minZ||z>maxZ)continue;
      let y=targetHeight+margin*.45;
      for(let offset=0;offset<=range;offset+=6){
        y=Math.max(y,floor(x-dx*offset,z-dz*offset)+margin*(1-.55*offset/range));
      }
      if(!best||y<best.y)best={x,y,z,yaw};
    }
    return best;
  }
  function flyToLandmark(place) {
    const launch=landmarkApproach(place);
    if(!launch){
      el("summary").textContent="No clear approach to "+place.name+". Choose another landmark or resume flight.";
      return;
    }
    dynamics=makeFlight(launch,world);
    Object.assign(dynamics.state,{elapsed,distance});
    windSoarer.reset(dynamics.state,world.windField.ensureLaunchCore(launch),launch.glance);
    perching.reset(dynamics.state,false);nextPerchHUD=0;perchNotice="";
    resetCamera(dynamics.state,launch.glance,launch.lookDown);
    resetInput();
    accumulator=0;nextReadout=0;
    noticeUntil=elapsed+4;
    el("discovery").textContent="Near · "+place.name;
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
    arrivalLookDown=clamp(lookDown,0,32)*Math.PI/180;
    glance=arrivalGlance=arrivalDegrees*Math.PI/180;
    glanceTime=0;
    const mounted=cameraMode==="shoulder";
    cameraYaw=s.yaw;cameraPath=mounted?s.pitch:s.path*.54;
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
    cameraTarget.set((.137+.052*lean+.28*down)*aspectScale,.157+.100*lean+.16*down+.003*stroke,.058-.078*lean-.19*down);
    camera.position.copy(cameraTarget.applyQuaternion(eagle.object.quaternion)).add(player);
    const yawError=Math.atan2(Math.sin(s.yaw-cameraYaw),Math.cos(s.yaw-cameraYaw));
    cameraYaw+=yawError*easing(16,dt);
    // A mounted camera follows the body through a dive. Keep a portion of
    // the flight line visible as the body rotates upward in a landing flare.
    const flare=s.perchFlare||0;
    const sightPitch=s.pitch+(s.path-s.pitch)*(.08+.42*flare);
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
    cameraYaw+=yawError*easing(4.9,dt);
    cameraPath+=(s.path*.54-cameraPath)*easing(3.2,dt);
    cameraBank+=(s.bank*.13-cameraBank)*easing(3,dt);
    cameraFov+=(76+clamp((s.airspeed-15)*.12,0,5)-cameraFov)*easing(1.4,dt);
    camera.fov=cameraFov;camera.updateProjectionMatrix();
    const headingX=Math.sin(cameraYaw),headingZ=Math.cos(cameraYaw);
    // Match the bird's projected width across portrait and landscape views.
    // A high boom shows the mantle and wing coverts, while its independent
    // near-horizontal optical axis keeps the ridgelines and sky in frame.
    const framing=clamp(1.65/camera.aspect,.80,3.3);
    const wingRoom=Math.min(1,Math.abs(Math.sin(s.bank))+.35*s.effort);
    const range=2.42*framing*(1+.18*wingRoom),up=1.18*framing;
    const back=range*Math.cos(cameraPath)+up*Math.sin(cameraPath);
    cameraTarget.set(s.x+headingX*back,s.y+up*Math.cos(cameraPath)-range*Math.sin(cameraPath),s.z+headingZ*back);
    cameraTarget.y=Math.max(cameraTarget.y,world.height(cameraTarget.x,cameraTarget.z)+.72);
    camera.position.copy(cameraTarget);
    const look=30, lensPitch=cameraPath-.034-.105*wingRoom;
    gaze.set(camera.position.x-headingX*look,camera.position.y+Math.tan(lensPitch)*look,camera.position.z-headingZ*look);
    camera.up.set(-headingZ*Math.sin(cameraBank),Math.cos(cameraBank),headingX*Math.sin(cameraBank));
    camera.lookAt(gaze);
  }
  function positionPerched(s,dt){
    const view=perching.view,mounted=cameraMode==="shoulder";
    cameraYaw+=Math.atan2(Math.sin(view.yaw-cameraYaw),Math.cos(view.yaw-cameraYaw))*easing(14,dt);
    cameraPath+=(view.pitch-cameraPath)*easing(12,dt);
    if(mounted){
      cameraTarget.set(.17,.285,.125);
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
      if(!perching.advance(dynamics.state,tick,input))dynamics.step(tick,input);
      accumulator-=tick;
    }
    const s=dynamics.state;
    elapsed=s.elapsed;distance=s.distance;
    player.set(s.x,s.y,s.z);
    eagle.object.position.copy(player);eagle.object.rotation.set(s.pitch,s.yaw,s.bank,"YXZ");
    eagle.update(dt,elapsed,s.effort>.05,s.pitch,s.bank,s);
    if(audio&&soundOn){
      const stroke=Math.max(0,Math.sin(s.phase-.24));
      wingRush.gain.setTargetAtTime(s.effort*stroke**1.6*2.4,audio.currentTime,.035);
    }
    if(perching.stage==="perched")positionPerched(s,dt);
    else if(cameraMode==="shoulder")positionShoulder(s,dt);
    else positionChase(s,dt);
    updateTalus?.(player,elapsed);updateForest?.(player,elapsed);updateHabitat?.(player,elapsed);
    updateUnderstory(player,elapsed);
    windSoarer.update(dt,s);
    if(fieldAudio&&soundOn)fieldAudio.update(s,world,dt,camera,perching.stage);
    updateWeather(elapsed);
    world.update(dt,elapsed,player);updateLight?.(player,elapsed);updateMist?.(player,elapsed);renderer.render(scene,camera);updatePerchHUD(s);
    if(s.contact){showDialog("contact");return;}
    if(elapsed>=nextReadout){
      nextReadout=elapsed+.17;
      el("alt").textContent=Math.round(s.y+(world.altitudeOffset || 0)).toLocaleString();
      el("speed").textContent=Math.round(s.airspeed*3.6);
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
      if(fps<28)next=Math.max(Math.min(devicePixelRatio,pixelRatioLimit,1.5),current-.12);
      else if(fastWindows>=4){next=Math.min(devicePixelRatio,pixelRatioLimit,current+.12);fastWindows=0;}
      if(Math.abs(next-current)>.01)renderer.setPixelRatio(next);
      frameSeconds=0;frameCount=0;
    }
    advance(Math.min(realDt,.18));
  }
  requestAnimationFrame(frame);
})();
