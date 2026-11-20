// Secondary motion and physiology for the eagle rig, layered on the pose that
// eagle.js computes each frame.
//
//  - Feathers as spring bones: each of the 12 rectrices and the 12 primaries
//    is a Verlet spring bone (algorithm adapted from @pixiv/three-vrm's
//    VRMSpringBoneJoint, MIT) with its own inertia, stiffness and drag, pushed
//    by aerodynamic load (G), sideslip, gravity and turbulence. They lag,
//    overshoot and flutter instead of following the skeleton rigidly.
//  - Wing structure: a damped second-order flex per wing (about 2 Hz) driven
//    by load factor and gust pressure, so rough air makes the wings "breathe".
//  - Body: heave, pitch and roll respond to vertical gust acceleration while
//    the head is held still in space (avian gaze stabilisation).
//  - G posture: positive load sweeps the hand and spreads the tail; negative
//    load droops the wings and lets the body plumage float.
//  - Eyes: nictitating-membrane blinks (front-to-back sweep, ~0.2 s), often
//    triggered by head saccades; a half-drawn membrane in fast dives; slow
//    eyelid blinks when perched.
//  - Perched: breathing at about 20 breaths/min and an occasional rouse
//    (whole-body feather shake).
window.makeEagleMotion = function makeEagleMotion(THREE, parts) {
  const {object, chest, neckBase, neck, rudder, tailRays, wings, uniforms} = parts;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const rand = (a, b) => a + (b - a) * Math.random();
  // Deterministic per-feather variation.
  const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

  // ---- spring bones -----------------------------------------------------------
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
  class SpringBone {
    constructor(bone, tail, opt) {
      this.bone = bone; this.axis = tail.clone().normalize(); this.length = tail.length();
      this.stiffness = opt.stiffness; this.drag = opt.drag; this.maxAngle = opt.maxAngle ?? .55;
      this.head = new THREE.Vector3(); this.current = new THREE.Vector3(); this.prev = new THREE.Vector3();
      this.rest = new THREE.Quaternion(); this.ready = false; this.offset = 0;
    }
    // force: world-space acceleration (m/s^2) acting on the feather tip.
    update(dt, force) {
      const b = this.bone;
      this.rest.copy(b.quaternion);                      // animated pose this frame
      b.parent.getWorldQuaternion(q1).multiply(this.rest); // world rotation of the rest pose
      b.getWorldPosition(this.head);
      const restDir = v1.copy(this.axis).applyQuaternion(q1);
      if (!this.ready) {
        this.current.copy(this.head).addScaledVector(restDir, this.length); this.prev.copy(this.current); this.ready = true;
      }
      // Verlet: inertia with drag, a stiffness pull toward the rest direction,
      // and the external acceleration; then hold the feather's length.
      const inertia = v2.subVectors(this.current, this.prev).multiplyScalar(1 - this.drag);
      const next = v3.copy(this.current).add(inertia)
        .addScaledVector(restDir, this.stiffness * dt).addScaledVector(force, dt * dt);
      next.sub(this.head).normalize().multiplyScalar(this.length).add(this.head);
      this.prev.copy(this.current); this.current.copy(next);
      // Rotate the bone from its rest direction toward the simulated tip.
      const to = v2.subVectors(this.current, this.head).applyQuaternion(q2.copy(q1).invert()).normalize();
      q2.setFromUnitVectors(this.axis, to);
      const angle = 2 * Math.acos(clamp(q2.w, -1, 1));
      if (angle > this.maxAngle) q2.slerp(new THREE.Quaternion(), 1 - this.maxAngle / angle);
      b.quaternion.copy(this.rest).multiply(q2);
      this.offset = Math.min(angle, this.maxAngle);
    }
    reset() { this.ready = false; }
  }
  // Rectrices extend ~0.30 m aft; primaries ~0.34 m outboard and slightly aft.
  const tailSprings = tailRays.map(({ray, side}, i) => new SpringBone(ray, new THREE.Vector3(side * .03, 0, .30),
    {stiffness: 2.2 + .7 * hash(i), drag: .14 + .04 * hash(i + 7), maxAngle: .40}));
  const primarySprings = wings.flatMap(w => w.fan.map((bone, i) => new SpringBone(bone, new THREE.Vector3(w.sign * .34, 0, .04 + .025 * i),
    {stiffness: 2.3 + .22 * i + .5 * hash(i + w.sign * 13), drag: .10 + .03 * hash(i + 3), maxAngle: .50})));
  const alulaSprings = wings.map(w => new SpringBone(w.alula, new THREE.Vector3(w.sign * .08, 0, -.02), {stiffness: 5, drag: .2, maxAngle: .4}));

  // ---- damped oscillators ---------------------------------------------------------
  function oscillator(freq, zeta) { return {x: 0, v: 0, w: 2 * Math.PI * freq, z: zeta}; }
  function drive(o, target, dt, kick = 0) {
    const n = Math.max(1, Math.ceil(dt / .008)), h = dt / n;
    for (let i = 0; i < n; i++) { o.v += (o.w * o.w * (target - o.x) - 2 * o.z * o.w * o.v + kick) * h; o.x += o.v * h; }
    return o.x;
  }
  const flex = wings.map(() => ({arm: oscillator(2.1, .28), hand: oscillator(3.2, .22)}));
  const heave = oscillator(1.6, .38), pitchOsc = oscillator(1.9, .42), rollOsc = oscillator(1.7, .4);
  const neckSink = oscillator(2.8, .45);                            // head settles into the shoulders under G

  // ---- eyes ------------------------------------------------------------------------
  const eyes = [{t: -1, dur: .2, lid: 0, next: rand(1.5, 4)}, {t: -1, dur: .2, lid: 0, next: 0}];
  eyes[1].next = eyes[0].next + rand(0, .03);
  let lidBlinkAt = rand(20, 50), lidT = -1, saccadeCooldown = 0;
  const membraneCurve = u => u < .45 ? smooth(0, .45, u) : 1 - smooth(.45, 1, u); // close fast, open a little slower

  // ---- state ------------------------------------------------------------------------
  let lastLoad = 1, lastLoadL = 0, lastLoadR = 0, turbulence = 0, lastVS = null, rouseT = -1, rouseAt = rand(30, 70);
  let lastNeckQ = new THREE.Quaternion(), prevHeadQ = new THREE.Quaternion(), haveHead = false;
  const up = new THREE.Vector3(), right = new THREE.Vector3(), back = new THREE.Vector3(), force = new THREE.Vector3();
  const headWorld = new THREE.Quaternion(), tmpQ = new THREE.Quaternion(), noise = new THREE.Vector3();
  const stats = {springs: tailSprings.length + primarySprings.length + alulaSprings.length, oscillators: 8, blinks: 0};

  function update(dt, time, air, pose) {
    const step = clamp(dt, 0, .05);
    if (step <= 0) return;
    const folded = pose.folded, perched = folded > .9;
    if (pose.reset) { [...tailSprings, ...primarySprings, ...alulaSprings].forEach(s => s.reset()); haveHead = false; }
    const V = air.indicatedAirspeed ?? air.airspeed ?? 17;
    const q = clamp((V / 17.5) ** 2, 0, 5);                         // dynamic pressure vs cruise
    const n = air.loadFactor ?? 1;
    const loadL = air.wingLoadLeft ?? 0, loadR = air.wingLoadRight ?? 0;
    // Turbulence: how fast gust pressure and load are changing (smoothed).
    const rough = (Math.abs(loadL - lastLoadL) + Math.abs(loadR - lastLoadR)) / step * .08 + Math.abs(n - lastLoad) / step * .05;
    lastLoadL = loadL; lastLoadR = loadR; lastLoad = n;
    turbulence += (clamp(rough + .25 * Math.abs(air.gust ?? 0), 0, 1.5) - turbulence) * (1 - Math.exp(-3 * step));
    const slip = clamp(air.yawSlip ?? 0, -.5, .5);
    const vs = air.verticalSpeed ?? 0, accelZ = lastVS === null ? 0 : clamp((vs - lastVS) / step, -30, 30);
    lastVS = vs;
    // Stall buffet: separated flow shakes wings and tail irregularly.
    const buffet = clamp(pose.stall ?? 0, 0, 1) * (1 - pose.folded);

    // ---- body response to vertical gusts, head held in space ----------------------
    object.updateMatrixWorld(true);
    neck.getWorldQuaternion(headWorld);
    const freeFlight = 1 - folded;
    const jolt = (Math.random() - .5) * turbulence * 9;
    const h = drive(heave, -.0011 * accelZ * freeFlight, step, jolt * .4 * freeFlight);
    const pitchJ = drive(pitchOsc, .003 * accelZ * freeFlight, step, (Math.random() - .5) * turbulence * 6 * freeFlight);
    const rollJ = drive(rollOsc, .55 * (loadL - loadR) * .08 * freeFlight, step, (Math.random() - .5) * turbulence * 7 * freeFlight);
    chest.position.y += clamp(h, -.03, .03);
    chest.rotation.x += clamp(pitchJ, -.08, .08);
    chest.rotation.z += clamp(rollJ, -.09, .09);
    // Breathing when perched (about 20 per minute) and an occasional rouse.
    if (perched) {
      chest.position.y += .0016 * Math.sin(time * 2 * Math.PI * .33);
      if (time > rouseAt && rouseT < 0) { rouseT = 0; rouseAt = time + rand(35, 80); }
    }
    let fluff = clamp((1 - n) * .8, 0, 1) * freeFlight;              // negative G floats the plumage
    if (rouseT >= 0) {
      rouseT += step;
      const k = clamp(rouseT / .9, 0, 1), env = Math.sin(Math.PI * k);
      chest.rotation.z += .09 * env * Math.sin(rouseT * 2 * Math.PI * 9);
      chest.rotation.y += .05 * env * Math.sin(rouseT * 2 * Math.PI * 9 + 1.2);
      fluff = Math.max(fluff, env);
      if (k >= 1) rouseT = -1;
    }
    // Re-seat the head: the body moved under it; the neck absorbs the motion.
    object.updateMatrixWorld(true);
    neck.parent.getWorldQuaternion(tmpQ);
    const stabilised = tmpQ.invert().multiply(headWorld);
    neck.quaternion.slerp(stabilised, .9 * freeFlight + .5 * folded);
    neckBase.position.y -= clamp(h, -.03, .03) * .6 * freeFlight;
    // Under G the neck shortens and the head sinks; at negative G it stretches.
    const gLoad = clamp(n - 1, -1.2, 2.5);
    neckBase.position.y += clamp(drive(neckSink, (-.0045 * Math.max(0, gLoad) + .003 * Math.max(0, -gLoad)) * freeFlight, step), -.014, .006);

    // ---- G posture and structural flex ------------------------------------------
    const g = clamp(n - 1, -1.2, 2.5);
    wings.forEach((w, i) => {
      const side = w.sign < 0 ? loadL : loadR;
      const target = (.045 * g + .07 * side) * freeFlight;
      const kick = (Math.random() - .5) * (turbulence * 25 + buffet * 45) * freeFlight;
      const arm = drive(flex[i].arm, target, step, kick);
      const hand = drive(flex[i].hand, target * 1.4 + arm * .5, step, kick * 1.3);
      w.elbow.rotation.z += w.sign * clamp(arm, -.12, .16);
      w.wrist.rotation.z += w.sign * clamp(hand, -.15, .2);
      // High G sweeps the hand back a little; negative G lets the wing droop.
      w.wrist.rotation.y += -w.sign * .05 * clamp(g - .6, 0, 2) * freeFlight;
      w.shoulder.rotation.z += w.sign * -.06 * clamp(-g, 0, 1) * freeFlight;
    });
    // Tail spreads under load for extra lift, and cants against sideslip.
    for (const {side, ray} of tailRays) ray.rotation.y += side * .06 * clamp(g, 0, 2) * freeFlight;
    rudder.rotation.y += -.25 * slip * freeFlight;

    // ---- feather spring bones -----------------------------------------------------
    object.updateMatrixWorld(true);
    up.set(0, 1, 0).applyQuaternion(chest.getWorldQuaternion(tmpQ));
    right.set(1, 0, 0).applyQuaternion(tmpQ); back.set(0, 0, 1).applyQuaternion(tmpQ);
    const lift = 3.5 * g * q * freeFlight;                         // aero bending up under load
    const gravity = -9.81 * (perched ? 1 : .25);
    for (const [k, s] of tailSprings.entries()) {
      noise.set(Math.random() - .5, Math.random() - .5, Math.random() - .5).multiplyScalar((turbulence * 140 + buffet * 160) * (.6 + .8 * hash(k + 40)) * freeFlight);
      force.copy(up).multiplyScalar(lift * .6 + gravity * .3).addScaledVector(right, -slip * 40 * q * freeFlight)
        .addScaledVector(back, 6 * q * freeFlight).add(noise);
      s.update(step, force);
    }
    for (const [k, s] of primarySprings.entries()) {
      noise.set(Math.random() - .5, Math.random() - .5, Math.random() - .5).multiplyScalar((turbulence * 180 + buffet * 240) * (.5 + hash(k + 90)) * freeFlight);
      // High-speed flutter: a small periodic forcing whose amplitude grows with q.
      const flutter = Math.sin(time * (38 + 6 * hash(k)) + k) * 22 * clamp(q - 1.2, 0, 3) * freeFlight;
      // Wingbeat: air loads bend the primaries up through the downstroke and
      // let them trail and separate on the upstroke (slow-motion eagle footage).
      const beat = (pose.effort ?? 0) * Math.sin((air.phase ?? 0) - .35 - .08 * (k % 6)) * 260 * freeFlight;
      force.copy(up).multiplyScalar(lift + flutter + beat + gravity * .2).addScaledVector(back, (5 * q + 40 * (pose.effort ?? 0)) * freeFlight).add(noise);
      s.update(step, force);
    }
    for (const s of alulaSprings) {
      force.copy(up).multiplyScalar((pose.separation * 30 + turbulence * 20 * Math.random()) * freeFlight);
      s.update(step, force);
    }

    // ---- eyes -----------------------------------------------------------------------
    // Head saccades: angular speed of the head in space.
    neck.getWorldQuaternion(tmpQ);
    const headTurn = haveHead ? 2 * Math.acos(clamp(Math.abs(prevHeadQ.dot(tmpQ)), 0, 1)) / step : 0;
    prevHeadQ.copy(tmpQ); haveHead = true;
    saccadeCooldown -= step;
    const saccade = headTurn > 2.6 && saccadeCooldown <= 0 && Math.random() < .4;
    if (saccade) saccadeCooldown = 1.2;
    const dive = smooth(26, 40, V) * freeFlight + .4 * (pose.tuck ?? 0) * freeFlight;
    eyes.forEach((e, i) => {
      if (e.t < 0 && (time >= e.next || saccade)) {
        e.t = 0; e.dur = rand(.16, .24); e.next = time + rand(perched ? 2.5 : 3.5, perched ? 6 : 9);
        if (i === 0) stats.blinks++;
        if (Math.random() < .12) e.next = time + .35;                 // occasional double blink
      }
      let m = 0;
      if (e.t >= 0) { e.t += step; m = membraneCurve(clamp(e.t / e.dur, 0, 1)); if (e.t >= e.dur) e.t = -1; }
      e.membrane = Math.max(m, .55 * dive);                            // half-drawn in a fast dive
    });
    // Slow eyelid blink when perched, rarely.
    if (perched && time > lidBlinkAt && lidT < 0) { lidT = 0; lidBlinkAt = time + rand(25, 60); }
    let lid = .12 * dive;
    if (lidT >= 0) { lidT += step; lid = Math.max(lid, Math.sin(Math.PI * clamp(lidT / .45, 0, 1))); if (lidT > .45) lidT = -1; }
    uniforms.eyeLids.value.set(eyes[0].membrane, eyes[1].membrane, lid, lid);

    // ---- plumage uniforms -------------------------------------------------------------
    uniforms.featherTurb.value += (clamp(turbulence, 0, 1.2) * freeFlight - uniforms.featherTurb.value) * (1 - Math.exp(-6 * step));
    uniforms.featherSlip.value += (slip * clamp(q, 0, 2) * freeFlight - uniforms.featherSlip.value) * (1 - Math.exp(-8 * step));
    uniforms.featherFluff.value += (fluff - uniforms.featherFluff.value) * (1 - Math.exp(-10 * step));
    stats.turbulence = turbulence;
  }
  const api = {update, stats};
  window.aerieEagleMotionDebug = api;
  return api;
};
