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
//    Primaries wash out (leading edge down) as they bend up; soaring carries
//    slow steering corrections in the tail twist, tail spread and hand sweep.
//  - Body: heave, pitch and roll answer gust load spikes (not the player's
//    own pull-ups) while the head is held still in space; the head also rides
//    level through each wingbeat while the thorax pumps under it.
//  - G posture: positive load sweeps the hand, spreads the tail and settles
//    the head into the shoulders; negative load droops the wings and lets the
//    body plumage float.
//  - Head: looking down and to one side, it cocks to bring that eye to the
//    ground, as raptors inspect terrain with one fovea.
//  - Eyes: nictitating-membrane blinks (front-to-back sweep, ~0.2 s) of both
//    eyes or one, often triggered by head saccades; a half-drawn membrane in
//    fast dives; slow eyelid blinks and drowsy lower lids on a long perch.
//  - Voice: the lower mandible opens with the loudness of each of the eagle's
//    own calls (announced by field-audio.js), with a head-throw on a perch.
//  - Perched: breathing at about 20 breaths/min; head scans paced from field
//    studies of perched hawks; peering head bobs; preening; head shakes; an
//    occasional rouse with a tail wag; plumage, tail and balance that answer
//    the wind at the perch.
//
// eagle.js sets most bone channels afresh every frame. The few it leaves
// alone are restored to rest before this layer adds to them (see
// restoreUnanimated), so nothing accumulates. tools/check_eagle_motion.cjs
// checks frame-rate independence, drift, blink rate and the bill hinge.
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
      // Aeroelastic washout: as a vane bends up its leading edge twists down.
      this.washout = opt.washout ?? 0; this.sign = Math.sign(tail.x) || 1; this.twist = new THREE.Quaternion();
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
      if (this.washout) {
        const lift = Math.asin(clamp(to.y, -1, 1)) * (angle > 1e-6 ? shown / angle : 0);
        b.quaternion.multiply(this.twist.setFromAxisAngle(this.axis, -this.sign * this.washout * lift));
      }
      this.offset = angle;
    }
    reset() { this.ready = false; }
  }
  // Rectrices extend ~0.30 m aft; primaries ~0.34 m outboard and slightly aft.
  // Primaries are stiffer toward the leading edge (outer) feathers.
  const tailSprings = tailRays.map(({ray, side}, i) => new SpringBone(ray, new THREE.Vector3(side * .03, 0, .30),
    {freq: 7 + 1.4 * hash(i), zeta: .16 + .05 * hash(i + 7), maxAngle: .30, tau: .07}));
  const primarySprings = wings.flatMap(w => w.fan.map((bone, i) => new SpringBone(bone, new THREE.Vector3(w.sign * .34, 0, .04 + .025 * i),
    {freq: 12.5 - .5 * i + hash(i + w.sign * 13), zeta: .11 + .04 * hash(i + 3), maxAngle: .32, tau: .045, washout: .7 + .25 * (5 - i) / 5})));
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
  const tailPump = oscillator(1.4, .35), tailPumpNoise = noise1(.35);   // balance on a windy perch
  const bodyNoise = noise3(.22);
  const controlNoise = noise3(.7);                                  // slow steering corrections while soaring

  // ---- eyes -------------------------------------------------------------------------
  // t counts from the start of a blink; a negative t is the short lag of the
  // second eye in a bilateral blink.
  const eyes = [{active: false, t: 0, dur: .2, membrane: 0}, {active: false, t: 0, dur: .2, membrane: 0}];
  let blinkAt = rand(1.5, 4);
  let lidBlinkAt = rand(20, 50), lidT = -1, saccadeCooldown = 0, drowsy = 0;
  const membraneCurve = u => u < .45 ? smooth(0, .45, u) : 1 - smooth(.45, 1, u); // close fast, open a little slower

  // ---- voice: the bill follows the eagle's own calls ----------------------------------
  // field-audio.js announces each call with its loudness envelope. The lower
  // mandible swings about its gape hinge with the syllables; on a perch, a
  // loud call throws the head back (the bald eagle's head-throw display).
  const mandible = neck.children.find(c => c.name === 'Lower mandible');
  const jaw = {open: 0, loud: 0, env: null, rate: 60, start: 0, pending: null};
  let jawHinge = null, jawRestP = null, jawRestQ = null;
  if (mandible) {
    mandible.geometry.computeBoundingBox();
    const b = mandible.geometry.boundingBox;
    jawHinge = new THREE.Vector3(0, b.max.y - .002, b.max.z - .004);
    jawRestP = mandible.position.clone(); jawRestQ = mandible.quaternion.clone();
  }
  const onCall = e => { if (e.detail?.envelope?.length) jaw.pending = e.detail; };
  window.addEventListener('aerie-eagle-call', onCall);
  const jawQ = new THREE.Quaternion(), jawV = new THREE.Vector3();
  function updateVoice(time, step) {
    if (jaw.pending) { jaw.env = jaw.pending.envelope; jaw.rate = jaw.pending.rate || 60; jaw.start = time; jaw.pending = null; }
    let target = 0;
    if (jaw.env) {
      const x = (time - jaw.start) * jaw.rate, i = Math.floor(x);
      if (i >= jaw.env.length - 1) jaw.env = null;
      else if (i >= 0) target = jaw.env[i] + (jaw.env[i + 1] - jaw.env[i]) * (x - i);
    }
    // The bill snaps open on each syllable and closes a little more slowly.
    jaw.open += (target - jaw.open) * (1 - Math.exp(-step / (target > jaw.open ? .02 : .05)));
    jaw.loud += (target - jaw.loud) * (1 - Math.exp(-step / .35));
    if (!mandible) return;
    const angle = -.36 * clamp(jaw.open, 0, 1);
    jawQ.setFromAxisAngle(SIDE_X, angle);
    mandible.quaternion.copy(jawRestQ).multiply(jawQ);
    // Keep the hinge fixed: p = rest + R0 (hinge - R hinge).
    jawV.copy(jawHinge).applyQuaternion(jawQ).negate().add(jawHinge).applyQuaternion(jawRestQ);
    mandible.position.copy(jawRestP).add(jawV);
  }
  const SIDE_X = new THREE.Vector3(1, 0, 0);

  // ---- wind at the perch ------------------------------------------------------------
  let windSource = null, windAt = -1;
  const windSample = {}, wind = new THREE.Vector3(), windMean = new THREE.Vector3(), windLocal = new THREE.Vector3();
  let gustFront = 0;
  // ---- rain ---------------------------------------------------------------------------
  // In rain the eagle blinks more, shakes its head now and then and carries
  // its plumage sleeked; once clear it shakes the water off (a rouse on the
  // perch, a quick aerial shake in flight).
  let rainSource = null, rainAt = -1, rainTarget = 0, rain = 0, wet = 0, rainShakeAt = Infinity, dryShakeAt = Infinity, airShakeT = -1;

  // ---- state --------------------------------------------------------------------------
  let lowL = 0, lowR = 0, lowN = 1, fastL = 0, fastR = 0, fastN = 1, turbulence = 0, rouseT = -1, rouseAt = rand(60, 150);
  // Perched behaviour: peering (head bobs that give motion parallax) and a
  // tail wag after a rouse.
  let peerT = -1, peerAt = rand(8, 20), peerAxis = 0, wagT = -1, perchedFor = 0, settleWagAt = -1;
  // A quick head shake, and bouts of preening the breast feathers.
  let shakeT = -1, shakeAt = rand(20, 45), preenT = -1, preenAt = rand(40, 80), preenDur = 2.5, preenSide = 1;
  let prevHeadQ = new THREE.Quaternion(), haveHead = false;
  const up = new THREE.Vector3(), right = new THREE.Vector3(), back = new THREE.Vector3(), down = new THREE.Vector3(), force = new THREE.Vector3();
  const headWorld = new THREE.Quaternion(), tmpQ = new THREE.Quaternion();
  const ahead = new THREE.Vector3(), headRollQ = new THREE.Quaternion(), FORWARD = new THREE.Vector3(0, 0, -1);
  let headRoll = 0;
  // Idle scanning on the perch: quick head saccades (about 0.1 s) between
  // fixations, mostly over the ground and water, whenever the player is not
  // steering the gaze. Perched hawks change head position about 21 times a
  // minute (O'Rourke et al. 2010, PLoS ONE 5:e12169) and eagles pause longer;
  // the pauses follow a log-normal distribution (Ochs et al. 2017, Auk 134).
  // Here the median pause is 3 s, about 16 head movements a minute.
  const scan = {yaw: 0, pitch: 0, fromY: 0, fromP: 0, toY: 0, toP: 0, t: -1, dur: .12, next: rand(1, 3), gain: 0, quiet: 0, lastY: 0, lastP: 0};
  const UP = new THREE.Vector3(0, 1, 0), SIDE = new THREE.Vector3(1, 0, 0), scanQ = new THREE.Quaternion();
  function updateScan(time, step, perched, air, busy) {
    const lookY = air.perchLook ?? 0, lookP = air.perchLookPitch ?? 0;
    const steering = Math.abs(lookY - scan.lastY) + Math.abs(lookP - scan.lastP) > 1e-4;
    scan.lastY = lookY; scan.lastP = lookP;
    scan.quiet = steering ? 0 : scan.quiet + step;
    const want = perched && scan.quiet > 1.5 && !busy ? 1 : 0;
    scan.gain += (want - scan.gain) * (1 - Math.exp(-step / (want ? .5 : .15)));
    if (want && scan.t < 0 && time >= scan.next) {
      scan.fromY = scan.yaw; scan.fromP = scan.pitch;
      scan.toY = clamp(.55 * gauss() - .25 * scan.yaw, -1, 1);
      const r = Math.random();
      scan.toP = r < .7 ? rand(-.45, -.05) : r < .85 ? rand(-.05, .05) : rand(.1, .3);
      const span = Math.hypot(scan.toY - scan.fromY, scan.toP - scan.fromP);
      scan.dur = .08 + .07 * span; scan.t = 0;
      scan.next = time + scan.dur + clamp(3 * Math.exp(.6 * gauss()), .35, 12) * (1 + 2 * drowsy);
    }
    if (scan.t >= 0) {
      scan.t += step;
      const u = clamp(scan.t / scan.dur, 0, 1), m = u * u * u * (10 - 15 * u + 6 * u * u);   // minimum jerk
      scan.yaw = scan.fromY + (scan.toY - scan.fromY) * m; scan.pitch = scan.fromP + (scan.toP - scan.fromP) * m;
      if (u >= 1) scan.t = -1;
    }
    if (scan.gain < 1e-3) return;
    neck.quaternion.premultiply(scanQ.setFromAxisAngle(UP, scan.yaw * scan.gain));
    neck.quaternion.multiply(scanQ.setFromAxisAngle(SIDE, scan.pitch * scan.gain));
  }
  const stats = {springs: allSprings.length, oscillators: 8, blinks: 0, turbulence: 0, peakBend: 0, saturated: 0};
  let lastAir = null, lastTime = -Infinity;
  Object.defineProperty(stats, 'air', {get: () => lastAir, enumerable: false});
  Object.defineProperty(stats, 'windSample', {get: () => windSample, enumerable: false});
  // Timers are absolute; a new flight may restart the clock, so re-arm them.
  function rearm(time) {
    blinkAt = time + rand(1.5, 4); eyes.forEach(e => { e.active = false; e.membrane = 0; });
    lidBlinkAt = time + rand(20, 50); lidT = -1; saccadeCooldown = 0; drowsy = 0;
    rouseAt = time + rand(60, 150); peerAt = time + rand(8, 20); shakeAt = time + rand(20, 45); preenAt = time + rand(40, 80);
    rouseT = peerT = wagT = shakeT = preenT = airShakeT = -1; perchedFor = 0; settleWagAt = -1;
    rain = rainTarget = wet = 0; rainAt = -1; rainShakeAt = dryShakeAt = Infinity;
    scan.t = -1; scan.next = time + rand(1, 3); scan.gain = 0; scan.quiet = 0; scan.yaw = scan.pitch = 0;
  }

  // Channels eagle.js does not set every frame. They are restored to their
  // rest values before this layer adds to them, so offsets never accumulate.
  const neckRest = neckBase.position.clone(), chestRestY = chest.rotation.y, chestRestZ = chest.rotation.z;
  const alulaRestX = wings.map(w => w.alula.rotation.x);
  function restoreUnanimated() {
    neckBase.position.copy(neckRest);
    chest.rotation.y = chestRestY; chest.rotation.z = chestRestZ;
    wings.forEach((w, i) => { w.alula.rotation.x = alulaRestX[i]; });
  }
  // Debug multipliers for isolating each layer in tests.
  const tune = {tail: 1, primaries: 1, body: 1, posture: 1};
  function update(dt, time, air, pose) {
    restoreUnanimated();
    const step = clamp(dt, 0, .05);
    if (step <= 0) return;
    const folded = pose.folded, perched = folded > .9, freeFlight = 1 - folded;
    if (pose.reset || time < lastTime) {
      allSprings.forEach(s => s.reset()); haveHead = false; lowL = lowR = fastL = fastR = 0; lowN = fastN = 1; turbulence = 0; rearm(time);
    }
    lastTime = time; lastAir = air;
    const V = air.indicatedAirspeed ?? air.airspeed ?? 17;
    const q = clamp((V / 17.5) ** 2, 0, 5);                         // dynamic pressure vs cruise
    const n = air.loadFactor ?? 1;
    const loadL = air.wingLoadLeft ?? 0, loadR = air.wingLoadRight ?? 0;
    // Turbulence: the band of wing-pressure and load changes too quick to be
    // the player's own manoeuvre (roughly 0.4 to 2.5 Hz), plus gust strength.
    const fast = 1 - Math.exp(-step / .06), slow = 1 - Math.exp(-step / .4);
    fastL += (loadL - fastL) * fast; fastR += (loadR - fastR) * fast; fastN += (n - fastN) * fast;
    lowL += (fastL - lowL) * slow; lowR += (fastR - lowR) * slow; lowN += (fastN - lowN) * slow;
    // Each wingbeat swings the load factor too; that is not rough air.
    const gliding = 1 - .85 * clamp(pose.effort ?? 0, 0, 1);
    const rough = 1.2 * (Math.abs(fastL - lowL) + Math.abs(fastR - lowR)) + .8 * Math.abs(fastN - lowN) * gliding;
    turbulence += (clamp(rough + .3 * Math.abs(air.gust ?? 0), 0, 1.5) - turbulence) * (1 - Math.exp(-3 * step));
    const slip = clamp(air.yawSlip ?? 0, -.5, .5);
    // A gust's load spike, as opposed to the load of the player's own pull-up.
    const gustLoad = clamp(fastN - lowN, -1.5, 1.5) * gliding;
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
    if (folded <= .05) { wind.set(0, 0, 0); windSample.gust = 0; }
    if (rainSource && time - rainAt > .25) {
      rainAt = time;
      const p = object.getWorldPosition(v1);
      try { rainTarget = clamp(rainSource(p.x, p.z, time) || 0, 0, 1); } catch (e) { rainSource = null; rainTarget = 0; }
    }
    rain += (rainTarget - rain) * (1 - Math.exp(-step / .8));
    const raining = rain > .15;
    wet += ((raining ? 1 : 0) - wet) * (1 - Math.exp(-step / (raining ? 12 : 45)));
    if (raining && rainShakeAt === Infinity) rainShakeAt = time + rand(4, 9);
    if (!raining) rainShakeAt = Infinity;
    if (raining && time >= rainShakeAt && shakeT < 0) { shakeT = 0; rainShakeAt = time + rand(7, 16); }
    // Clear of the rain and still wet: shake it off shortly.
    if (!raining && wet > .45 && dryShakeAt === Infinity) dryShakeAt = time + rand(1.5, 4);
    if (raining) dryShakeAt = Infinity;
    if (time >= dryShakeAt) { dryShakeAt = Infinity; wet *= .35; if (perched) rouseT = Math.max(rouseT, 0); else airShakeT = 0; }
    windMean.lerp(wind, 1 - Math.exp(-step / .6));
    object.getWorldQuaternion(tmpQ);
    windLocal.copy(windMean).applyQuaternion(tmpQ.invert());         // +z = from ahead to behind (wind on the face)
    const windSpeed = windLocal.length() * folded;
    // The field's own gust strength marks each passing gust front (0 in
    // sheltered air, about 0.8 in a strong front).
    gustFront += (clamp(windSample.gust ?? 0, 0, 1) - gustFront) * (1 - Math.exp(-step / .25));
    const windGust = clamp(wind.distanceTo(windMean) / 4 + 1.1 * gustFront, 0, 1) * folded;

    // ---- body response to vertical gusts, head held in space ----------------------
    neck.getWorldQuaternion(headWorld);
    const jitter = stepNoise(bodyNoise, step);
    // An updraught lifts the body against the bird's own inertia, then it settles.
    const h = drive(heave, .009 * gustLoad * freeFlight, step, jitter.x * rough2 * 3.2 * freeFlight);
    const pitchJ = drive(pitchOsc, -.025 * gustLoad * freeFlight, step, jitter.y * rough2 * 2.4 * freeFlight);
    const rollJ = drive(rollOsc, .55 * (loadL - loadR) * .08 * freeFlight + .012 * windLocal.x * windGust, step,
      jitter.z * (rough2 * 2.8 * freeFlight + windGust * .9));
    // Kept small: the shoulder camera sits a hand's width from the mantle.
    chest.position.y += clamp(h, -.010, .010) * tune.body;
    chest.rotation.x += clamp(pitchJ, -.045, .045) * tune.body;
    chest.rotation.z += clamp(rollJ, -.07, .07) * tune.body;
    // Breathing when perched (about 20 per minute) and an occasional rouse.
    const justLanded = perched && perchedFor === 0 && !pose.reset;
    perchedFor = perched ? perchedFor + step : 0;
    // Settling in after a landing: a tail wag as the wings close, and often
    // a rouse a few seconds later.
    if (justLanded) { settleWagAt = time + rand(.9, 1.6); if (Math.random() < .55) rouseAt = Math.min(rouseAt, time + rand(3.5, 7)); }
    if (perched && settleWagAt > 0 && time >= settleWagAt) { wagT = 0; settleWagAt = -1; }
    if (perched) {
      chest.position.y += .0016 * Math.sin(time * 2 * Math.PI * .33);
      // One thing at a time, and nothing new while the eagle is calling.
      const calling = !!(jaw.env || jaw.pending), idle = rouseT < 0 && preenT < 0 && shakeT < 0 && !calling;
      if (time > rouseAt && idle) { rouseT = 0; rouseAt = time + rand(90, 240); }
      else if (time > preenAt && idle && perchedFor > 8) { preenT = 0; preenAt = time + rand(60, 120); preenDur = rand(2.2, 4); preenSide = Math.random() < .5 ? -1 : 1; }
      else if (time > shakeAt && idle && perchedFor > 3) { shakeT = 0; shakeAt = time + rand(40, 110); }
      if (time > peerAt && peerT < 0 && idle && perchedFor > 2) { peerT = 0; peerAt = time + rand(10, 28); peerAxis = Math.random() < .65 ? 0 : 1; }
      // A call cuts a preening bout short.
      if (calling && preenT >= 0) preenT = Math.max(preenT, .82 * preenDur);
    } else { peerT = preenT = -1; }
    let fluff = clamp((1 - n) * .3, 0, .3) * freeFlight;             // negative G floats the plumage
    // Aerial shake: a half-second shiver along the body that throws water off.
    if (airShakeT >= 0) {
      airShakeT += step;
      const k = clamp(airShakeT / .55, 0, 1), env = Math.sin(Math.PI * k);
      chest.rotation.z += .06 * env * Math.sin(airShakeT * 2 * Math.PI * 11);
      chest.rotation.y += .025 * env * Math.sin(airShakeT * 2 * Math.PI * 11 + 1.1);
      fluff = Math.max(fluff, .45 * env);
      if (k >= 1) { airShakeT = -1; wagT = 0; }
    }
    // A tailwind at the perch lifts the back and nape feathers.
    fluff = Math.max(fluff, clamp(-windLocal.z / 7, 0, 1) * folded * (.5 + .5 * windGust));
    // Each gust front lifts the plumage for a moment as it passes the perch.
    fluff = Math.max(fluff, .3 * windGust * (.75 + .25 * Math.sin(time * 6.1)));
    if (rouseT >= 0) {
      rouseT += step;
      const k = clamp(rouseT / .9, 0, 1), env = Math.sin(Math.PI * k);
      chest.rotation.z += .09 * env * Math.sin(rouseT * 2 * Math.PI * 9);
      chest.rotation.y += .05 * env * Math.sin(rouseT * 2 * Math.PI * 9 + 1.2);
      fluff = Math.max(fluff, env);
      if (k >= 1) { rouseT = -1; wagT = 0; }
    }
    // On a windy perch the tail pumps to hold balance: down as a gust
    // arrives, then small corrections while it blows.
    if (folded > .5) {
      const pump = drive(tailPump, .10 * gustFront * folded, step, stepNoise1(tailPumpNoise, step) * windGust * 3);
      rudder.rotation.x += clamp(pump, -.12, .16);
    }
    // Tail wag that settles the rectrices after the shake (about 7 Hz).
    if (wagT >= 0) {
      wagT += step;
      const k = clamp(wagT / .45, 0, 1);
      rudder.rotation.y += .16 * Math.sin(Math.PI * k) * Math.sin(wagT * 2 * Math.PI * 7);
      if (k >= 1) wagT = -1;
    }
    // Re-seat the head: the body moved under it; the neck absorbs the motion.
    object.updateMatrixWorld(true);
    neck.parent.getWorldQuaternion(tmpQ);
    const stabilised = tmpQ.invert().multiply(headWorld);
    neck.quaternion.slerp(stabilised, .9 * freeFlight + .5 * folded);
    updateVoice(time, step);
    updateScan(time, step, perched, air, peerT >= 0 || rouseT >= 0 || preenT >= 0 || shakeT >= 0 || jaw.loud > .15);
    // Head-throw while calling from a perch; a slight lift of the head in flight.
    if (jaw.loud > .01) {
      const throwBack = clamp(jaw.loud * 1.6, 0, 1) * (perched ? .5 : .12);
      neck.quaternion.multiply(scanQ.setFromAxisAngle(SIDE, throwBack));
      neckBase.quaternion.multiply(scanQ.setFromAxisAngle(SIDE, throwBack * .15));
    }
    // Preening: the bill drops into the breast plumage and works it in short
    // nibbles, the head turned a little to one side.
    if (preenT >= 0) {
      preenT += step;
      const k = clamp(preenT / preenDur, 0, 1), env = smooth(0, .18, k) * (1 - smooth(.82, 1, k));
      const nibble = Math.max(0, Math.sin(preenT * 2 * Math.PI * 4.5)) * (.6 + .4 * Math.sin(preenT * 1.7));
      neckBase.quaternion.multiply(scanQ.setFromAxisAngle(SIDE, -.55 * env));
      neck.quaternion.premultiply(scanQ.setFromAxisAngle(UP, preenSide * .35 * env));
      neck.quaternion.multiply(scanQ.setFromAxisAngle(SIDE, -(.75 + .08 * nibble) * env));
      neckBase.position.z += -.012 * env;
      fluff = Math.max(fluff, .25 * env);
      if (k >= 1) preenT = -1;
    }
    // Head shake: a few rapid turns about the bill axis, decaying (about 9 Hz).
    if (shakeT >= 0) {
      shakeT += step;
      const k = clamp(shakeT / .38, 0, 1);
      neck.quaternion.multiply(scanQ.setFromAxisAngle(FORWARD, .42 * Math.sin(Math.PI * k) * (1 - k) * 1.6 * Math.sin(shakeT * 2 * Math.PI * 9)));
      neck.quaternion.premultiply(scanQ.setFromAxisAngle(UP, .12 * Math.sin(Math.PI * k) * Math.sin(shakeT * 2 * Math.PI * 9 + 1)));
      fluff = Math.max(fluff, .3 * Math.sin(Math.PI * k));
      if (k >= 1) shakeT = -1;
    }
    // Raptors inspect the ground with one eye: looking down and to a side,
    // the head cocks so that eye faces the ground.
    neck.getWorldQuaternion(tmpQ);
    const lookDown = -Math.asin(clamp(ahead.copy(FORWARD).applyQuaternion(tmpQ).y, -1, 1));
    ahead.copy(FORWARD).applyQuaternion(tmpQ.copy(neckBase.quaternion).multiply(neck.quaternion));
    const turned = Math.atan2(ahead.x, -ahead.z);                    // + to the right of the breast
    const wantRoll = Math.sign(turned) * .38 * smooth(.12, .55, lookDown) * smooth(.08, .4, Math.abs(turned));
    headRoll += (wantRoll - headRoll) * (1 - Math.exp(-step / .12));
    neck.quaternion.multiply(headRollQ.setFromAxisAngle(FORWARD, headRoll));
    neckBase.position.y -= clamp(h, -.010, .010) * .6 * freeFlight;
    // Peering: two or three quick head translations, side to side or up and
    // down, while the gaze direction holds.
    if (peerT >= 0) {
      peerT += step;
      const dur = 1.2, k = clamp(peerT / dur, 0, 1), env = Math.sin(Math.PI * k) ** .6;
      const bob = .011 * env * Math.sin(peerT * 2 * Math.PI * 2.1);
      if (peerAxis === 0) neckBase.position.x += bob; else neckBase.position.y += bob * .8;
      if (k >= 1) peerT = -1;
    }
    // The thorax pumps about 8 mm with each wingbeat while the head rides
    // almost level, as in slow-motion footage of flapping eagles.
    neckBase.position.y += .0068 * (pose.effort ?? 0) * Math.cos(air.phase ?? 0) * freeFlight;
    // Under G the neck shortens and the head sinks; at negative G it stretches.
    const gLoad = clamp(n - 1, -1.2, 2.5);
    neckBase.position.y += clamp(drive(neckSink, (-.003 * Math.max(0, gLoad) + .003 * Math.max(0, -gLoad)) * freeFlight, step), -.008, .006);

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
    // Soaring is never still: the tail twists and opens and the hands trim
    // continuously against the air, more so in rough air and between beats.
    const ctl = stepNoise(controlNoise, step);
    const activity = (.25 + 1.2 * turbulence) * freeFlight * (1 - .7 * (pose.effort ?? 0));
    // Slow soaring spreads the tail and fingers the primaries apart for
    // lift; a fast glide narrows the tail and closes the slots.
    const slowFlight = 1 - smooth(9.5, 16.5, V), fastFlight = smooth(24, 38, V),   // neutral at the 17.5 m/s cruise
       open = (1 - (pose.tuck ?? 0)) * freeFlight;
    // Circling in a thermal, the eagle opens both a little more to turn slowly.
    const thermal = smooth(.6, 2.6, air.thermal ?? 0) * (1 - fastFlight);
    const tailSpeed = (.10 * slowFlight + .05 * thermal - .05 * fastFlight) * open;
    const fingerSpeed = (.13 * slowFlight + .07 * thermal - .05 * fastFlight) * open;
    for (const {side, ray} of tailRays) ray.rotation.y += side * (.06 * clamp(g, 0, 2) * freeFlight + .03 * ctl.y * activity + tailSpeed);
    for (const w of wings) w.fan.forEach((bone, i) => { bone.rotation.y += w.sign * (.5 - i / (w.fan.length - 1)) * fingerSpeed; });
    rudder.rotation.y += -.25 * slip * freeFlight;
    rudder.rotation.z += (.035 * ctl.x * activity - .6 * clamp(rollJ, -.07, .07) * freeFlight) * tune.posture;
    for (const w of wings) w.wrist.rotation.y += .025 * ctl.z * activity;

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
      // The tail carries little of the load; keep it from lifting off the
      // tucked feet in a hard pull-up.
      force.copy(up).multiplyScalar(lift * .12).addScaledVector(down, gravity)
        .addScaledVector(right, (-slip * 400 * q) * freeFlight + windLocal.x * windLocal.length() * 1.6 * folded)
        .addScaledVector(back, (6 * q) * freeFlight)
        .addScaledVector(nz, (rough2 * 54 + windGust * 30) * (.6 + .8 * hash(k + 40)));
      s.update(step, force, (1 - .7 * folded) * tune.tail);
      peak = Math.max(peak, s.offset); if (s.offset > s.maxAngle) saturated++;
    }
    for (const [k, s] of primarySprings.entries()) {
      const nz = stepNoise(s.noise, step);
      // High-speed flutter: a small periodic forcing whose amplitude grows with q.
      const flutter = Math.sin(time * (38 + 6 * hash(k)) + k) * 30 * clamp(q - 1.2, 0, 3) * freeFlight;
      // Wingbeat: air loads bend the primaries up through the downstroke and
      // let them trail and separate on the upstroke (slow-motion eagle footage).
      const beat = effort * Math.sin(phase - .35 - .08 * (k % 6)) * 230 * freeFlight;
      // Separated flow at high angle of attack curls the tips upward.
      const curl = (pose.separation ?? 0) * (60 + 40 * (k % 6) / 5) * freeFlight;
      // The leading (emarginated) primaries carry the most tip load and turn up most.
      const tipShare = 1.5 - .12 * (k % 6);
      force.copy(up).multiplyScalar(lift * tipShare + flutter + beat + curl).addScaledVector(down, gravity)
        .addScaledVector(back, (20 * q + 30 * effort) * freeFlight)
        .addScaledVector(nz, (rough2 * 116 + windGust * 25) * (.5 + hash(k + 90)));
      s.update(step, force, (1 - .85 * folded) * tune.primaries);
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
    // Most blinks close both membranes; about a third close only one eye
    // (birds blink unilaterally as well as bilaterally).
    if (!eyes[0].active && !eyes[1].active && (time >= blinkAt || saccade)) {
      const r = Math.random(), which = r < .66 ? [0, 1] : r < .83 ? [0] : [1];
      const dur = rand(.16, .24);
      for (const i of which) { const e = eyes[i]; e.active = true; e.t = which.length > 1 && i === 1 ? -rand(0, .03) : 0; e.dur = dur * rand(.92, 1.08); }
      // An occasional double blink; drops on the eye bring the next blink sooner.
      blinkAt = Math.random() < .12 ? time + .35 : time + rand(perched ? 2.5 : 3.5, perched ? 6 : 9) * (1 - .6 * rain);
      stats.blinks++;
    }
    eyes.forEach(e => {
      let m = 0;
      if (e.active) { e.t += step; if (e.t > 0) m = membraneCurve(clamp(e.t / e.dur, 0, 1)); if (e.t >= e.dur) e.active = false; }
      e.membrane = Math.max(m, .55 * dive);                            // half-drawn in a fast dive
    });
    // A long, quiet perch makes the eagle drowsy: the lower lids creep up and
    // the slow lid blinks come more often. Any player look wakes it.
    const restful = perched && scan.quiet > 45 && windGust < .3 ? 1 : 0;
    drowsy += (restful - drowsy) * (1 - Math.exp(-step / (restful ? 20 : .4)));
    // Slow eyelid blink when perched, rarely (more often when drowsy).
    if (perched && time > lidBlinkAt && lidT < 0) { lidT = 0; lidBlinkAt = time + rand(25, 60) * (1 - .7 * drowsy); }
    let lid = Math.max(.12 * dive, .42 * drowsy * (.9 + .1 * Math.sin(time * .7)));
    if (lidT >= 0) {
      const dur = .45 + .9 * drowsy;
      lidT += step; lid = Math.max(lid, Math.sin(Math.PI * clamp(lidT / dur, 0, 1))); if (lidT > dur) lidT = -1;
    }
    uniforms.eyeLids.value.set(eyes[0].membrane, eyes[1].membrane, lid, lid);

    // ---- plumage uniforms -------------------------------------------------------------
    const perchRuffle = clamp(windSpeed / 6, 0, 1) * (.25 + .75 * windGust);
    // Capped well below the measured turbulence: from the shoulder camera a few
    // millimetres of lift already reads as bristling.
    // Wet plumage lies sleek: it lifts and riffles less until it is shaken out.
    const sleek = 1 - .6 * wet * (rouseT >= 0 || airShakeT >= 0 ? 0 : 1);
    uniforms.featherTurb.value += ((clamp(turbulence + buffet, 0, .55) * freeFlight + .8 * perchRuffle) * sleek - uniforms.featherTurb.value) * (1 - Math.exp(-6 * step));
    const perchSlip = clamp(windLocal.x / 8, -1, 1) * folded;
    uniforms.featherSlip.value += (slip * clamp(q, 0, 2) * freeFlight + perchSlip - uniforms.featherSlip.value) * (1 - Math.exp(-8 * step));
    uniforms.featherFluff.value += (fluff * sleek - uniforms.featherFluff.value) * (1 - Math.exp(-10 * step));
    stats.turbulence = turbulence; stats.wind = +windSpeed.toFixed(2); stats.headRoll = +headRoll.toFixed(3); stats.drowsy = +drowsy.toFixed(2); stats.bill = +jaw.open.toFixed(3);
    const before = stats.acts | 0;
    stats.acts = (rouseT >= 0 ? 1 : 0) | (peerT >= 0 ? 2 : 0) | (shakeT >= 0 ? 4 : 0) | (preenT >= 0 ? 8 : 0) | (wagT >= 0 ? 16 : 0) | (airShakeT >= 0 ? 32 : 0) | (jaw.env ? 64 : 0) | (scan.t >= 0 ? 128 : 0);
    // Tell the audio when the body does something audible: feathers rattle in
    // a rouse or shake, and a landing has weight.
    const began = stats.acts & ~before;
    if (began & 1) announce('rouse', 1); if (began & 32) announce('airshake', 1); if (began & 4) announce('shake', 1);
    if (began & 16) announce('wag', 1); if (justLanded) announce('land', 1); stats.rain = +rain.toFixed(2); stats.wet = +wet.toFixed(2); stats.plumage = [+uniforms.featherTurb.value.toFixed(3), +uniforms.featherSlip.value.toFixed(3), +uniforms.featherFluff.value.toFixed(3)]; stats.membranes = [+eyes[0].membrane.toFixed(2), +eyes[1].membrane.toFixed(2)];
    stats.tailBend = tailSprings.reduce((a, s) => a + s.offset, 0) / tailSprings.length;
    stats.primaryBend = primarySprings.reduce((a, s) => a + s.offset, 0) / primarySprings.length;
  }
  function announce(kind, strength) {
    try { window.dispatchEvent(new CustomEvent('aerie-eagle-body', {detail: {kind, strength}})); } catch (e) {}
  }
  // The world's wind field, sampled at the perch: {sample(x, y, z, t, out)}.
  // Rain intensity (0 to 1) at a world position and time: (x, z, t) => number.
  function setRainSource(fn) { rainSource = typeof fn === 'function' ? fn : null; rainAt = -1; }
  function setWindSource(field) { windSource = field && typeof field.sample === 'function' ? field : null; windAt = -1; }
  // For tests: start a perched behaviour now ('rouse' or 'peer').
  function trigger(name) {
    if (name === 'call') { const n = 150, e = new Float32Array(n); for (let i = 0; i < n; i++) e[i] = Math.max(0, Math.sin(i / 60 * 2 * Math.PI * 4.2)) * (i < 120 ? 1 : 0); jaw.pending = {envelope: e, rate: 60}; }
    if (name === 'rouse') rouseT = 0; else if (name === 'peer') { peerT = 0; peerAxis = 0; }
    else if (name === 'shake') shakeT = 0; else if (name === 'preen') { preenT = 0; preenDur = 3; preenSide = 1; }
    else if (name === 'airshake') airShakeT = 0;
  }
  const api = {update, stats, setWindSource, setRainSource, trigger, tune, restoreUnanimated};
  window.aerieEagleMotionDebug = api;
  return api;
};
