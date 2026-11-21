// Run with node tools/check_eagle_motion.cjs. The eagle's secondary motion
// must behave the same at any frame rate, never accumulate offsets on bones
// that eagle.js does not reset, keep blinking at a natural rate, and open
// the bill about a fixed hinge.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const THREE = require('../game/three.min.js');

// Deterministic randomness for repeatable runs.
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// A skeleton with the parts eagle.js hands to makeEagleMotion, at the same
// positions, and a lower mandible mesh on the neck.
function makeRig() {
  const object = new THREE.Group();
  const rig = new THREE.Group(); object.add(rig);
  const length = 2.2 * 763 / 2003, zAt = v => (v - .44) * length;
  const bone = (parent, x, y, z) => { const b = new THREE.Bone(); b.position.set(x, y, z); parent.add(b); return b; };
  const chest = bone(rig, 0, 0, 0);
  const neckBase = bone(chest, 0, .012, zAt(.325));
  const neck = bone(neckBase, 0, .007, zAt(.226) - zAt(.325));
  const rudder = bone(chest, 0, -.004, zAt(.66));
  const tailRays = Array.from({length: 12}, (_, i) => { const side = (2 * i - 11) / 11; return {side, ray: bone(rudder, side * .018, 0, zAt(.69) - zAt(.66))}; });
  const wings = [-1, 1].map(sign => {
    const shoulder = bone(chest, sign * .093, .015, zAt(.33));
    const elbow = bone(shoulder, sign * .223, .016, zAt(.403) - zAt(.33));
    const wrist = bone(elbow, sign * .309, -.009, zAt(.278) - zAt(.403));
    const fan = Array.from({length: 6}, (_, i) => bone(wrist, sign * .089, -.008, zAt(.29 + i * .033) - zAt(.278)));
    const alula = bone(wrist, sign * .009, .01, zAt(.214) - zAt(.278));
    return {sign, shoulder, elbow, wrist, fan, alula};
  });
  const g = new THREE.BoxGeometry(.054, .016, .088); g.translate(0, -.014, -.137);
  const mandible = new THREE.Mesh(g); mandible.name = 'Lower mandible'; neck.add(mandible);
  const uniforms = {eyeLids: {value: new THREE.Vector4()}, featherTurb: {value: 0}, featherSlip: {value: 0}, featherFluff: {value: 0}};
  return {object, chest, neckBase, neck, rudder, tailRays, wings, uniforms, mandible};
}

// eagle.js sets these channels absolutely every frame; mimic it.
function basePose(parts) {
  const {chest, neckBase, neck, rudder, tailRays, wings} = parts;
  chest.position.set(0, 0, 0); chest.rotation.x = 0;
  neckBase.rotation.set(0, 0, 0); neck.quaternion.identity();
  rudder.rotation.set(0, 0, 0);
  for (const {ray} of tailRays) ray.rotation.set(0, 0, 0);
  for (const w of wings) {
    w.shoulder.rotation.set(0, 0, 0); w.elbow.rotation.set(0, 0, 0); w.wrist.rotation.set(0, 0, 0);
    for (const f of w.fan) f.rotation.set(0, 0, 0);
    w.alula.rotation.y = w.alula.rotation.z = 0;
  }
}

function load(seed) {
  const window = new EventTarget();
  const math = Object.create(Math); math.random = seeded(seed);
  const context = {window, CustomEvent, Math: math};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game/eagle-motion.js'), 'utf8'), context);
  const parts = makeRig();
  const motion = context.window.makeEagleMotion(THREE, parts);
  return {window, parts, motion};
}

function fly(motion, parts, fps, seconds, airAt, poseAt, onFrame) {
  const dt = 1 / fps;
  for (let i = 0, t = 0; t < seconds - 1e-9; i++, t = i * dt) {
    basePose(parts);
    motion.update(dt, t, airAt(t), {folded: 0, effort: 0, tuck: 0, stall: 0, separation: 0, reset: i === 0, ...poseAt?.(t)});
    onFrame?.(t);
  }
}

// 1. A pull-up from 1 to 2.5 G bends the primaries the same way at 30 and 120 fps.
{
  const air = t => ({loadFactor: t < 1 ? 1 : 2.5, indicatedAirspeed: 22, wingLoadLeft: 0, wingLoadRight: 0, gust: 0, phase: 0});
  const sample = fps => {
    const {parts, motion} = load(7);
    const out = [];
    fly(motion, parts, fps, 2, air, null, t => { if (Math.abs(t * 10 - Math.round(t * 10)) < 1e-6) out.push(motion.stats.primaryBend); });
    return out;
  };
  const a = sample(30), b = sample(120);
  assert.equal(a.length, b.length);
  if (process.env.VERBOSE) console.log(a.map(x => x.toFixed(3)).join(' '), '\n' + b.map(x => x.toFixed(3)).join(' '));
  // Skip the frame of the step itself, where 30 fps has integrated four times longer.
  for (let i = 12; i < a.length; i++) assert.ok(Math.abs(a[i] - b[i]) < .015 + .15 * a[i], `frame-rate dependent bend at ${i / 10}s: ${a[i]} vs ${b[i]}`);
  assert.ok(a[a.length - 1] > a[9] + .02, 'primaries did not bend under load');
}

// 2. Channels eagle.js leaves alone return exactly to rest after any motion.
{
  const {parts, motion} = load(11);
  const rest = parts.neckBase.position.clone();
  const air = t => ({loadFactor: 1 + .8 * Math.sin(t * 7), indicatedAirspeed: 30, wingLoadLeft: .4 * Math.sin(t * 5), wingLoadRight: -.3 * Math.sin(t * 6), gust: .5, phase: t * 15});
  fly(motion, parts, 60, 40, air, t => ({folded: t > 20 ? 1 : 0, effort: t < 10 ? .8 : 0}));
  motion.restoreUnanimated();
  assert.ok(parts.neckBase.position.distanceTo(rest) < 1e-12, 'neck base drifted');
  assert.equal(parts.chest.rotation.y, 0); assert.equal(parts.chest.rotation.z, 0);
  for (const w of parts.wings) assert.equal(w.alula.rotation.x, 0);
}

// 3. Perched blinks: 10 to 30 a minute, some of them with one eye only.
{
  const {parts, motion} = load(23);
  let one = 0, episode = null;
  const air = () => ({loadFactor: 1, indicatedAirspeed: 0, gust: 0, perchLook: 0, perchLookPitch: 0});
  fly(motion, parts, 60, 120, air, () => ({folded: 1}), () => {
    const v = parts.uniforms.eyeLids.value, closing = v.x > .05 || v.y > .05;
    if (closing) { episode ??= [false, false]; episode[0] ||= v.x > .5; episode[1] ||= v.y > .5; }
    else if (episode) { if (episode[0] !== episode[1]) one++; episode = null; }
  });
  const perMinute = motion.stats.blinks / 2;
  assert.ok(perMinute >= 10 && perMinute <= 30, `perched blink rate ${perMinute}/min`);
  assert.ok(one > 0, 'no one-eyed blinks');
}

// 4. A call opens the bill about a fixed hinge, then it closes again.
{
  const {window, parts, motion} = load(31);
  const {mandible} = parts;
  mandible.geometry.computeBoundingBox();
  const b = mandible.geometry.boundingBox, hinge = new THREE.Vector3(0, b.max.y - .002, b.max.z - .004);
  const envelope = new Float32Array(90).map((_, i) => i < 60 ? 1 : 0);
  let peak = 0, drift = 0;
  const air = () => ({loadFactor: 1, indicatedAirspeed: 0, gust: 0});
  fly(motion, parts, 60, .2, air, () => ({folded: 1}));
  window.dispatchEvent(new CustomEvent('aerie-eagle-call', {detail: {envelope, rate: 60}}));
  fly(motion, parts, 60, 3, air, () => ({folded: 1}), () => {
    const angle = 2 * Math.acos(Math.min(1, Math.abs(mandible.quaternion.w)));
    peak = Math.max(peak, angle);
    const moved = hinge.clone().applyQuaternion(mandible.quaternion).add(mandible.position);
    drift = Math.max(drift, moved.distanceTo(hinge));
  });
  assert.ok(peak > .3, `bill opened only ${peak} rad`);
  assert.ok(drift < 1e-9, 'gape hinge moved');
  assert.ok(2 * Math.acos(Math.min(1, Math.abs(mandible.quaternion.w))) < .01, 'bill stayed open');
}

// 5. A new flight that restarts the clock keeps the eyes blinking.
{
  const {parts, motion} = load(41);
  const air = () => ({loadFactor: 1, indicatedAirspeed: 17, gust: 0});
  fly(motion, parts, 60, 300, air);
  const before = motion.stats.blinks;
  fly(motion, parts, 60, 12, air, () => ({reset: false}));
  assert.ok(motion.stats.blinks - before >= 1, 'no blinks after the clock restarted');
}

// 6. Wingbeats swing the load factor, but that must not read as rough air.
{
  const air = t => ({loadFactor: 1 + .6 * Math.sin(t * 2 * Math.PI * 2.5), indicatedAirspeed: 14, wingLoadLeft: 0, wingLoadRight: 0, gust: 0, phase: t * 2 * Math.PI * 2.5});
  const settle = effort => {
    const {parts, motion} = load(53);
    fly(motion, parts, 60, 6, air, () => ({effort}));
    return motion.stats.turbulence;
  };
  const flapping = settle(.9), gliding = settle(0);
  assert.ok(flapping < .2, `flapping read as turbulence ${flapping}`);
  assert.ok(gliding > 2 * flapping, 'the same load swing in a glide should read as rougher air');
}

// 7. Folded on a calm perch, the tail and primaries stay closed.
{
  const {parts, motion} = load(61);
  const air = () => ({loadFactor: 1, indicatedAirspeed: 0, gust: 0});
  fly(motion, parts, 60, 8, air, () => ({folded: 1}));
  assert.ok(motion.stats.tailBend < .12 && motion.stats.primaryBend < .12, `perched feathers sag: ${motion.stats.tailBend}, ${motion.stats.primaryBend}`);
  for (const {ray} of parts.tailRays) {
    const shown = 2 * Math.acos(Math.min(1, Math.abs(ray.quaternion.w)));
    assert.ok(shown < .04, `perched rectrix displaced ${shown} rad`);
  }
}

console.log('Passed eagle motion checks: frame-rate independence, no drift, blink rate, bill hinge, clock restart, wingbeat load, perched feathers.');
