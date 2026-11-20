// Secondary motion and physiology for the eagle rig, layered on the pose that
// eagle.js computes each frame.
//
//  - Feathers as spring bones: each of the 12 rectrices, the 12 primaries and
//    both alulae carries a damped tip that lags, overshoots and flutters
//    instead of following the skeleton rigidly. The Verlet update follows
//    @pixiv/three-vrm's VRMSpringBoneJoint (MIT), recast as a physical spring
//    (natural frequency and damping ratio) integrated in fixed sub-steps in
//    the bird's own frame, so it behaves the same at 30, 60 or 120 fps and
//    flight speed does not masquerade as drag.
//  - Loads on the feathers: lift that grows with G and dynamic pressure, the
//    wingbeat's aerodynamic load, sideslip, drag, turbulence (band-limited
//    noise) and stall buffet; gravity and the local wind when perched.
//  - Wing structure: a damped second-order flex per wing (about 2 Hz) driven
//    by load factor and gust pressure, so rough air makes the wings "breathe".
//  - Body: heave, pitch and roll respond to vertical gusts while the head is
//    held still in space (avian gaze stabilisation).
//  - G posture: positive load sweeps the hand, spreads the tail and settles
//    the head into the shoulders; negative load droops the wings and lets the
//    body plumage float.
//  - Eyes: nictitating-membrane blinks (front-to-back sweep, ~0.2 s), often
//    triggered by head saccades; a half-drawn membrane in fast dives; slow
//    eyelid blinks when perched.
//  - Perched: breathing at about 20 breaths/min, an occasional rouse
//    (whole-body feather shake), and plumage, tail and balance that answer
//    the wind at the perch.
window.makeEagleMotion = function makeEagleMotion(THREE, parts) {
  const {object, chest, neckBase, neck, rudder, tailRays, wings, uniforms} = parts;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const rand = (a, b) => a + (b - a) * Math.random();
  const gauss = () => { let u = 0; while (u === 0) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()); };
  // Deterministic per-feather variation.
  const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

  // Band-limited noise (Ornstein-Uhlenbeck): unit variance, correlation time
  // tau. Its statistics do not depend on the frame rate.
  function noise3(tau) { return {v: new THREE.Vector3(), tau}; }
  function stepNoise(n, dt) {
    const a = Math.exp(-dt / n.tau), b = Math.sqrt(1 - a * a);
    n.v.set(n.v.x * a + b * gauss(), n.v.y * a + b * gauss(), n.v.z * a + b * gauss());
    return n.v;
  }
  function noise1(tau) { return {x: 0, tau}; }
  function stepNoise1(n, dt) { const a = Math.exp(-dt / n.tau); n.x = n.x * a + Math.sqrt(1 - a * a) * gauss(); return n.x; }

  // ---- spring bones (root-local frame) ----------------------------------------------
  const SUB = 1 / 120;
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3();
  const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), qI = new THREE.Quaternion();
  const toRoot = new THREE.Matrix4(), rootQi = new THREE.Quaternion();
  class SpringBone {
    constructor(bone, tail, opt) {
      this.bone = bone; this.axis = tail.clone().normalize(); this.length = tail.length();
      const w = 2 * Math.PI * opt.freq;
      this.w2 = w * w; this.gamma = 2 * opt.zeta * w; this.maxAngle = opt.maxAngle;
      this.head = new THREE.Vector3(); this.current = new THREE.Vector3(); this.prev = new THREE.Vector3();
      this.rest = new THREE.Quaternion(); this.ready = false; this.h = SUB; this.offset = 0;
      this.noise = noise3(opt.tau ?? .06);
    }
    // force: acceleration on the tip in the bird's frame (m/s^2).
    // weight: 1 = fully simulated, 0 = animated pose only.
    update(dt, force, weight = 1) {
      const b = this.bone;
      this.rest.copy(b.quaternion);                                  // animated pose this frame
      b.parent.getWorldQuaternion(q1).multiply(this.rest).premultiply(rootQi);
      b.getWorldPosition(this.head).applyMatrix4(toRoot);
      const restTip = v1.copy(this.axis).applyQuaternion(q1).multiplyScalar(this.length).add(this.head);
      if (!this.ready) { this.current.copy(restTip); this.prev.copy(restTip); this.ready = true; this.h = SUB; }
      // Time-corrected Verlet in n equal sub-steps of at most 1/120 s.
      const n = Math.max(1, Math.ceil(dt / SUB - 1e-6)), h = dt / n;
      for (let i = 0; i < n; i++) {
        const carry = v2.subVectors(this.current, this.prev).multiplyScalar(h / this.h * Math.max(0, 1 - this.gamma * h));
        const next = v3.copy(this.current).add(carry)
          .addScaledVector(v4.subVectors(restTip, this.current), this.w2 * h * h)
          .addScaledVector(force, h * h);
        next.sub(this.head).normalize().multiplyScalar(this.length).add(this.head);
        this.prev.copy(this.current); this.current.copy(next); this.h = h;
      }
      // Rotate the bone from its rest direction toward the simulated tip, with
      // a soft limit so a hard load bends the feather without a visible stop.
      const to = v2.subVectors(this.current, this.head).applyQuaternion(q2.copy(q1).invert()).normalize();
      q2.setFromUnitVectors(this.axis, to);
      const angle = 2 * Math.acos(clamp(q2.w, -1, 1));
      const shown = this.maxAngle * Math.tanh(angle / this.maxAngle) * weight;
      if (angle > 1e-6) q2.slerp(qI, 1 - shown / angle);
      b.quaternion.copy(this.rest).multiply(q2);
      this.offset = angle;
    }
    reset() { this.ready = false; }
  }
  // Rectrices extend ~0.30 m aft; primaries ~0.34 m outboard and slightly aft.
  // Primaries are stiffer toward the leading edge (outer) feathers.
  const tailSprings = tailRays.map(({ray, side}, i) => new SpringBone(ray, new THREE.Vector3(side * .03, 0, .30),
    {freq: 7 + 1.4 * hash(i), zeta: .16 + .05 * hash(i + 7), maxAngle: .30, tau: .07}));
  const primarySprings = wings.flatMap(w => w.fan.map((bone, i) => new SpringBone(bone, new THREE.Vector3(w.sign * .34, 0, .04 + .025 * i),
    {freq: 12.5 - .5 * i + hash(i + w.sign * 13), zeta: .11 + .04 * hash(i + 3), maxAngle: .32, tau: .045})));
  const alulaSprings = wings.map(w => new SpringBone(w.alula, new THREE.Vector3(w.sign * .08, 0, -.02), {freq: 11, zeta: .3, maxAngle: .35, tau: .05}));
  const allSprings = [...tailSprings, ...primarySprings, ...alulaSprings];

  // ---- damped oscillators -----------------------------------------------------------
  function oscillator(freq, zeta) { return {x: 0, v: 0, w: 2 * Math.PI * freq, z: zeta}; }
  function drive(o, target, dt, kick = 0) {
    const n = Math.max(1, Math.ceil(dt / .008)), h = dt / n;
    for (let i = 0; i < n; i++) { o.v += (o.w * o.w * (target - o.x) - 2 * o.z * o.w * o.v + kick) * h; o.x += o.v * h; }
    return o.x;
  }
  const flex = wings.map(() => ({arm: oscillator(2.1, .28), hand: oscillator(3.2, .22), noise: noise1(.18)}));
  const heave = oscillator(1.6, .38), pitchOsc = oscillator(1.9, .42), rollOsc = oscillator(1.7, .4);
  const neckSink = oscillator(2.8, .45);                            // head settles into the shoulders under G
  const bodyNoise = noise3(.22);

  // ---- eyes -------------------------------------------------------------------------
  const eyes = [{t: -1, dur: .2, lid: 0, next: rand(1.5, 4)}, {t: -1, dur: .2, lid: 0, next: 0}];
  eyes[1].next = eyes[0].next + rand(0, .03);
  let lidBlinkAt = rand(20, 50), lidT = -1, saccadeCooldown = 0;
  const membraneCurve = u => u < .45 ? smooth(0, .45, u) : 1 - smooth(.45, 1, u); // close fast, open a little slower

  // ---- wind at the perch ------------------------------------------------------------
  let windSource = null, windAt = -1;
  const windSample = {}, wind = new THREE.Vector3(), windMean = new THREE.Vector3(), windLocal = new THREE.Vector3();

  // ---- state --------------------------------------------------------------------------
  let lowL = 0, lowR = 0, lowN = 1, fastL = 0, fastR = 0, fastN = 1, turbulence = 0, lastVS = null, rouseT = -1, rouseAt = rand(30, 70);
  let prevHeadQ = new THREE.Quaternion(), haveHead = false;
  const up = new THREE.Vector3(), right = new THREE.Vector3(), back = new THREE.Vector3(), down = new THREE.Vector3(), force = new THREE.Vector3();
  const headWorld = new THREE.Quaternion(), tmpQ = new THREE.Quaternion();
  const stats = {springs: allSprings.length, oscillators: 8, blinks: 0, turbulence: 0, peakBend: 0, saturated: 0};

  function update(dt, time, air, pose) {
    const step = clamp(dt, 0, .05);
    if (step <= 0) return;
    const folded = pose.folded, perched = folded > .9, freeFlight = 1 - folded;
    if (pose.reset) { allSprings.forEach(s => s.reset()); haveHead = false; lowL = lowR = fastL = fastR = 0; lowN = fastN = 1; turbulence = 0; lastVS = null; }
    const V = air.indicatedAirspeed ?? air.airspeed ?? 17;
    const q = clamp((V / 17.5) ** 2, 0, 5);                         // dynamic pressure vs cruise
    const n = air.loadFactor ?? 1;
    const loadL = air.wingLoadLeft ?? 0, loadR = air.wingLoadRight ?? 0;
    // Turbulence: the band of wing-pressure and load changes too quick to be
    // the player's own manoeuvre (roughly 0.4 to 2.5 Hz), plus gust strength.
    const fast = 1 - Math.exp(-step / .06), slow = 1 - Math.exp(-step / .4);
    fastL += (loadL - fastL) * fast; fastR += (loadR - fastR) * fast; fastN += (n - fastN) * fast;
    lowL += (fastL - lowL) * slow; lowR += (fastR - lowR) * slow; lowN += (fastN - lowN) * slow;
    const rough = 1.2 * (Math.abs(fastL - lowL) + Math.abs(fastR - lowR)) + .8 * Math.abs(fastN - lowN);
    turbulence += (clamp(rough + .3 * Math.abs(air.gust ?? 0), 0, 1.5) - turbulence) * (1 - Math.exp(-3 * step));
    const slip = clamp(air.yawSlip ?? 0, -.5, .5);
    const vs = air.verticalSpeed ?? 0, accelZ = lastVS === null ? 0 : clamp((vs - lastVS) / step, -30, 30);
    lastVS = vs;
    // Stall buffet: separated flow shakes wings and tail irregularly.
    const buffet = clamp(pose.stall ?? 0, 0, 1) * freeFlight;
    const rough2 = turbulence + 1.4 * buffet;

    object.updateMatrixWorld(true);
    // Wind at the perch, relative to the bird (sampled at 8 Hz, smoothed).
    if (windSource && folded > .05 && time - windAt > .125) {
      windAt = time;
      const p = object.getWorldPosition(v1);
      try { windSource.sample(p.x, p.y + .4, p.z, time, windSample); } catch (e) { windSource = null; }
      wind.set((windSample.windX ?? 0) + (windSample.eddyX ?? 0), 0, (windSample.windZ ?? 0) + (windSample.eddyZ ?? 0));
      if (!Number.isFinite(wind.x) || !Number.isFinite(wind.z)) wind.set(0, 0, 0);
    }
    if (folded <= .05) wind.set(0, 0, 0);
    windMean.lerp(wind, 1 - Math.exp(-step / .6));
    object.getWorldQuaternion(tmpQ);
    windLocal.copy(windMean).applyQuaternion(tmpQ.invert());         // +z = from ahead to behind (wind on the face)
    const windSpeed = windLocal.length() * folded;
    const windGust = clamp(wind.distanceTo(windMean) / 4, 0, 1) * folded;

    // ---- body response to vertical gusts, head held in space ----------------------
    neck.getWorldQuaternion(headWorld);
    const jitter = stepNoise(bodyNoise, step);
    const h = drive(heave, -.0011 * accelZ * freeFlight, step, jitter.x * rough2 * 3.2 * freeFlight);
    const pitchJ = drive(pitchOsc, .003 * accelZ * freeFlight, step, jitter.y * rough2 * 2.4 * freeFlight);
    const rollJ = drive(rollOsc, .55 * (loadL - loadR) * .08 * freeFlight + .012 * windLocal.x * windGust, step,
      jitter.z * (rough2 * 2.8 * freeFlight + windGust * .9));
    chest.position.y += clamp(h, -.03, .03);
    chest.rotation.x += clamp(pitchJ, -.08, .08);
    chest.rotation.z += clamp(rollJ, -.09, .09);
    // Breathing when perched (about 20 per minute) and an occasional rouse.
    if (perched) {
      chest.position.y += .0016 * Math.sin(time * 2 * Math.PI * .33);
      if (time > rouseAt && rouseT < 0) { rouseT = 0; rouseAt = time + rand(35, 80); }
    }
    let fluff = clamp((1 - n) * .8, 0, 1) * freeFlight;              // negative G floats the plumage
    // A tailwind at the perch lifts the back and nape feathers.
    fluff = Math.max(fluff, clamp(-windLocal.z / 7, 0, 1) * folded * (.5 + .5 * windGust));
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
    const g = gLoad;
    wings.forEach((w, i) => {
      const side = w.sign < 0 ? loadL : loadR;
      const target = (.045 * g + .07 * side) * freeFlight;
      const kick = stepNoise1(flex[i].noise, step) * (turbulence * 9 + buffet * 16) * freeFlight;
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
    toRoot.copy(object.matrixWorld).invert();
    object.getWorldQuaternion(rootQi).invert();
    // Body axes in the bird's own frame.
    up.set(0, 1, 0).applyQuaternion(chest.quaternion); right.set(1, 0, 0).applyQuaternion(chest.quaternion);
    back.set(0, 0, 1).applyQuaternion(chest.quaternion);
    down.set(0, -1, 0).applyQuaternion(rootQi);
    const effort = pose.effort ?? 0, phase = air.phase ?? 0;
    const lift = 60 * clamp(n, -1, 3.5) * clamp(q, .2, 3) * freeFlight;     // aero bending up under load
    const gravity = 9.81 * folded;                                            // in flight lift carries the weight
    let peak = 0, saturated = 0;
    for (const [k, s] of tailSprings.entries()) {
      const nz = stepNoise(s.noise, step);
      force.copy(up).multiplyScalar(lift * .35).addScaledVector(down, gravity)
        .addScaledVector(right, (-slip * 400 * q) * freeFlight + windLocal.x * windLocal.length() * 1.6 * folded)
        .addScaledVector(back, (6 * q) * freeFlight)
        .addScaledVector(nz, (rough2 * 54 + windGust * 30) * (.6 + .8 * hash(k + 40)));
      s.update(step, force, 1 - .7 * folded);
      peak = Math.max(peak, s.offset); if (s.offset > s.maxAngle) saturated++;
    }
    for (const [k, s] of primarySprings.entries()) {
      const nz = stepNoise(s.noise, step);
      // High-speed flutter: a small periodic forcing whose amplitude grows with q.
      const flutter = Math.sin(time * (38 + 6 * hash(k)) + k) * 30 * clamp(q - 1.2, 0, 3) * freeFlight;
      // Wingbeat: air loads bend the primaries up through the downstroke and
      // let them trail and separate on the upstroke (slow-motion eagle footage).
      const beat = effort * Math.sin(phase - .35 - .08 * (k % 6)) * 230 * freeFlight;
      force.copy(up).multiplyScalar(lift + flutter + beat).addScaledVector(down, gravity)
        .addScaledVector(back, (20 * q + 30 * effort) * freeFlight)
        .addScaledVector(nz, (rough2 * 116 + windGust * 25) * (.5 + hash(k + 90)));
      s.update(step, force, 1 - .85 * folded);
      peak = Math.max(peak, s.offset); if (s.offset > s.maxAngle) saturated++;
    }
    for (const s of alulaSprings) {
      const nz = stepNoise(s.noise, step);
      force.copy(up).multiplyScalar((pose.separation ?? 0) * 120 * freeFlight).addScaledVector(nz, rough2 * 90 * freeFlight);
      s.update(step, force, 1 - .9 * folded);
    }
    stats.peakBend = peak; stats.saturated = saturated;

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
    const perchRuffle = clamp(windSpeed / 9, 0, 1) * (.35 + .65 * windGust);
    uniforms.featherTurb.value += (clamp(turbulence + buffet, 0, 1.2) * freeFlight + perchRuffle - uniforms.featherTurb.value) * (1 - Math.exp(-6 * step));
    const perchSlip = clamp(windLocal.x / 8, -1, 1) * folded;
    uniforms.featherSlip.value += (slip * clamp(q, 0, 2) * freeFlight + perchSlip - uniforms.featherSlip.value) * (1 - Math.exp(-8 * step));
    uniforms.featherFluff.value += (fluff - uniforms.featherFluff.value) * (1 - Math.exp(-10 * step));
    stats.turbulence = turbulence; stats.wind = +windSpeed.toFixed(2);
    Object.defineProperty(stats, 'air', {value: air, writable: true, configurable: true, enumerable: false});
    stats.tailBend = tailSprings.reduce((a, s) => a + s.offset, 0) / tailSprings.length;
    stats.primaryBend = primarySprings.reduce((a, s) => a + s.offset, 0) / primarySprings.length;
  }
  // The world's wind field, sampled at the perch: {sample(x, y, z, t, out)}.
  function setWindSource(field) { windSource = field && typeof field.sample === 'function' ? field : null; windAt = -1; }
  const api = {update, stats, setWindSource};
  window.aerieEagleMotionDebug = api;
  return api;
};
