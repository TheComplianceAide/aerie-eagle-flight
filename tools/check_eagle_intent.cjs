// Run with node tools/check_eagle_intent.cjs. The eagle must pick a real
// landmark, animal or perch to attend to, keep that same target through a
// bank for as long as the neck can reach, give way to the player's own look,
// and let the tail, near hand and feet follow the head. Prints the measured
// cost of the attention and motion layers per frame.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const THREE = require('../game/three.min.js');

function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function makeRig() {
  const object = new THREE.Group(), rig = new THREE.Group(); object.add(rig);
  const length = 2.2 * 763 / 2003, zAt = v => (v - .44) * length;
  const bone = (parent, x, y, z) => { const b = new THREE.Bone(); b.position.set(x, y, z); parent.add(b); return b; };
  const chest = bone(rig, 0, 0, 0), neckBase = bone(chest, 0, .012, zAt(.325)), neck = bone(neckBase, 0, .007, zAt(.226) - zAt(.325));
  const rudder = bone(chest, 0, -.004, zAt(.66));
  const tailRays = Array.from({length: 12}, (_, i) => { const side = (2 * i - 11) / 11; return {side, ray: bone(rudder, side * .018, 0, zAt(.69) - zAt(.66))}; });
  const wings = [-1, 1].map(sign => {
    const shoulder = bone(chest, sign * .093, .015, zAt(.33)), elbow = bone(shoulder, sign * .223, .016, zAt(.403) - zAt(.33));
    const wrist = bone(elbow, sign * .309, -.009, zAt(.278) - zAt(.403));
    const fan = Array.from({length: 6}, (_, i) => bone(wrist, sign * .089, -.008, zAt(.29 + i * .033) - zAt(.278)));
    return {sign, shoulder, elbow, wrist, fan, alula: bone(wrist, sign * .009, .01, zAt(.214) - zAt(.278))};
  });
  // The tucked feet eagle.js builds: a tarsus and three curled toes per side.
  const feet = [];
  for (const side of [-1, 1]) {
    const tarsus = new THREE.Object3D(); tarsus.name = 'Tucked tarsus'; tarsus.position.set(side * .052, -.046, zAt(.672)); chest.add(tarsus); feet.push(tarsus);
    for (let n = -1; n <= 1; n++) { const toe = new THREE.Object3D(); toe.name = 'Curled toe'; toe.position.set(side * .052 + n * .008, -.046, zAt(.712)); toe.rotation.x = -.54; chest.add(toe); feet.push(toe); }
  }
  const uniforms = {eyeLids: {value: new THREE.Vector4()}, featherTurb: {value: 0}, featherSlip: {value: 0}, featherFluff: {value: 0}};
  return {object, chest, neckBase, neck, rudder, tailRays, wings, feet, uniforms};
}
function basePose(p) {
  p.chest.position.set(0, 0, 0); p.chest.rotation.x = 0; p.neckBase.rotation.set(0, 0, 0); p.neck.quaternion.identity(); p.rudder.rotation.set(0, 0, 0);
  for (const {ray} of p.tailRays) ray.rotation.set(0, 0, 0);
  for (const w of p.wings) { w.shoulder.rotation.set(0, 0, 0); w.elbow.rotation.set(0, 0, 0); w.wrist.rotation.set(0, 0, 0); for (const f of w.fan) f.rotation.set(0, 0, 0); w.alula.rotation.y = w.alula.rotation.z = 0; }
}
function load(seed, world) {
  const window = new EventTarget(), math = Object.create(Math); math.random = seeded(seed);
  const context = {window, CustomEvent, Math: math};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game/eagle-motion.js'), 'utf8'), context);
  const parts = makeRig(), motion = context.window.makeEagleMotion(THREE, parts);
  motion.setWorld(world);
  return {window, parts, motion};
}
// One game frame, in eagle.js's order: attention first, then the pose, then the motion layer.
function frame(motion, parts, air, dt, first = false) {
  motion.attend(dt, air.elapsed, air, air.bank);
  basePose(parts);
  parts.object.position.set(air.x, air.y, air.z); parts.object.rotation.set(air.pitch || 0, air.yaw, air.bank, 'YXZ');
  motion.update(dt, air.elapsed, air, {folded: 0, effort: 0, tuck: 0, stall: 0, separation: 0, reset: first});
}
const bearingOf = (air, p) => { const b = Math.atan2(-(p.x - air.x), -(p.z - air.z)) - air.yaw; return Math.atan2(Math.sin(b), Math.cos(b)); };
const flat = {height: () => 0, landmarks: [], wildlife: {nearby: () => []}};
const dt = 1 / 60;

// 1. A landmark ahead is attended to and held through a bank that turns toward it,
//    for as long as it is ahead or on the inside of the turn.
{
  const kineo = {name: 'Mount Kineo', x: -1400, z: -540};          // 1.2 rad to the left, 1.5 km off
  const {parts, motion} = load(3, {...flat, landmarks: [kineo]});
  const air = {x: 0, y: 120, z: 0, yaw: .15, bank: 0, loadFactor: 1, indicatedAirspeed: 17, elapsed: 0, gazeLook: 0, gazeTurn: 0};
  for (let i = 0; i < 60; i++, air.elapsed += dt) frame(motion, parts, air, dt, i === 0);
  assert.equal(motion.intent.kind, 'landmark'); assert.equal(motion.intent.name, 'Mount Kineo');
  const aim = air.gazeIntent;
  assert.ok(aim && Math.abs(aim.x - kineo.x) < 1e-9 && Math.abs(aim.z - kineo.z) < 1e-9, 'gazeIntent is not the landmark');
  // Bank left toward it at 0.12 rad/s for nine seconds: far longer than an ordinary look lasts.
  let held = 0, letGoAt = null;
  for (let i = 0; i < 540; i++, air.elapsed += dt) {
    air.bank = .5; air.gazeTurn = -.4; air.yaw += .12 * dt;
    frame(motion, parts, air, dt);
    if (air.gazeIntent === aim && letGoAt === null) held += dt; else letGoAt ??= bearingOf(air, kineo);
  }
  assert.ok(held > 8.9, `held the landmark only ${held.toFixed(2)} s while banking toward it`);
}

// 1b. A landmark the turn is leaving behind gets a last look; then the eagle
//     looks where it is going, and takes up nothing on the outside of the turn.
{
  const kineo = {name: 'Mount Kineo', x: -300, z: -900}, cove = {name: 'Kineo Cove', x: -700, z: -500};     // both to the left
  const {parts, motion} = load(3, {...flat, landmarks: [kineo, cove]});
  const air = {x: 0, y: 120, z: 0, yaw: 0, bank: 0, loadFactor: 1, indicatedAirspeed: 17, elapsed: 0, gazeLook: 0, gazeTurn: 0};
  for (let i = 0; i < 60; i++, air.elapsed += dt) frame(motion, parts, air, dt, i === 0);
  assert.ok(air.gazeIntent, 'nothing attended to before the turn');
  let lastLook = 0, released = false, retaken = 0;
  for (let i = 0; i < 240; i++, air.elapsed += dt) {          // bank right, away from both, for four seconds
    air.bank = -.9; air.gazeTurn = 1; air.yaw -= .3 * dt;
    frame(motion, parts, air, dt);
    if (!air.gazeIntent) released = true; else if (released) retaken++; else lastLook += dt;
  }
  assert.ok(released && lastLook > .3 && lastLook < .7, `the last look lasted ${lastLook.toFixed(2)} s`);
  assert.equal(retaken, 0, 'a landmark on the outside of the turn was taken up');
}

// 1c. On the inside of the turn it is held until the neck cannot reach it.
{
  const rock = {name: 'Table Rock', x: -260, z: -420};
  const {parts, motion} = load(3, {...flat, landmarks: [rock]});
  const air = {x: 0, y: 120, z: 0, yaw: 0, bank: 0, loadFactor: 1, indicatedAirspeed: 17, elapsed: 0, gazeLook: 0, gazeTurn: 0};
  for (let i = 0; i < 60; i++, air.elapsed += dt) { air.z -= 17 * dt; frame(motion, parts, air, dt, i === 0); }
  const aim = air.gazeIntent; assert.ok(aim, 'nothing attended to');
  let letGoAt = null, held = 0;
  for (let i = 0; i < 1200 && letGoAt === null; i++, air.elapsed += dt) {     // a gentle left bank while flying past it
    air.bank = .3; air.gazeTurn = -.2; air.z -= 17 * dt;
    frame(motion, parts, air, dt);
    if (air.gazeIntent === aim) held += dt; else letGoAt = bearingOf(air, rock);
  }
  assert.ok(letGoAt !== null && letGoAt > 1.25, `let go at ${letGoAt} rad, inside the neck's reach`);
  assert.ok(held > 6, `held only ${held.toFixed(1)} s on the inside of the turn`);
}

// 2. The player's own look always wins, at once and for a moment afterwards.
{
  const {parts, motion} = load(5, {...flat, landmarks: [{name: 'Rockwood', x: 200, z: -700}]});
  const air = {x: 0, y: 120, z: 0, yaw: 0, bank: 0, loadFactor: 1, indicatedAirspeed: 17, elapsed: 0, gazeLook: 0, gazeTurn: 0};
  for (let i = 0; i < 60; i++, air.elapsed += dt) frame(motion, parts, air, dt, i === 0);
  assert.ok(air.gazeIntent, 'nothing attended to');
  air.gazeLook = .6; frame(motion, parts, air, dt); air.elapsed += dt;
  assert.equal(air.gazeIntent, null, 'attention kept against the player\'s look');
  air.gazeLook = 0;
  for (let i = 0; i < 60; i++, air.elapsed += dt) { frame(motion, parts, air, dt); assert.equal(air.gazeIntent, null, 'attention returned within a second of the player\'s look'); }
}

// 3. The body follows the head: the tail rolls toward the target and the near hand trims, mirrored left and right.
for (const side of [1, -1]) {
  const place = {name: 'Kineo Cove', x: -side * 500, z: -700};          // side +1: to the left
  const {parts, motion} = load(7, {...flat, landmarks: [place]});
  const air = {x: 0, y: 120, z: 0, yaw: 0, bank: 0, loadFactor: 1, indicatedAirspeed: 17, elapsed: 0, gazeLook: 0, gazeTurn: 0};
  // Averages over two seconds, since the soaring trim adds its own small noise.
  let tail = 0, near = 0, far = 0, n = 0;
  for (let i = 0; i < 240; i++, air.elapsed += dt) {
    frame(motion, parts, air, dt, i === 0);
    if (i >= 120) { tail += parts.rudder.rotation.z; n++;
      near += -(-side) * parts.wings.find(w => w.sign === -side).wrist.rotation.y; far += -side * parts.wings.find(w => w.sign === side).wrist.rotation.y; }
  }
  assert.ok(side * tail / n > .02, `tail did not roll toward a target on the ${side > 0 ? 'left' : 'right'}: ${tail / n}`);
  assert.ok(near / n - far / n > .012, `near hand did not trim back: ${near / n} vs ${far / n}`);
}

// 4. Closing on an animal below, the tucked feet come ready; they return when it is passed.
{
  const duck = {x: 0, y: 40, z: -60, length: .6};
  const {parts, motion} = load(9, {...flat, wildlife: {nearby: () => [{name: 'Mallard', kind: 'Bird', x: duck.x, y: duck.y, z: duck.z, actor: duck}]}});
  const air = {x: 0, y: 58, z: 0, yaw: 0, bank: 0, loadFactor: 1, indicatedAirspeed: 15, verticalSpeed: -3, elapsed: 0, gazeLook: 0, gazeTurn: 0};
  const rest = parts.feet.map(f => f.position.y);
  let ready = 0, kind = '';
  for (let i = 0; i < 300; i++, air.elapsed += dt) {
    air.z -= 15 * dt; air.y = Math.max(44, air.y - 3 * dt);
    frame(motion, parts, air, dt, i === 0);
    if (motion.intent.kind) kind = motion.intent.kind;
    ready = Math.max(ready, motion.intent.feet);
  }
  assert.equal(kind, 'animal');
  assert.ok(ready > .6, `feet came only ${ready} ready`);
  motion.restoreUnanimated();
  parts.feet.forEach((f, i) => assert.equal(f.position.y, rest[i], 'tucked feet did not return to rest'));
  assert.ok(motion.intent.feet < .2, 'feet stayed lowered after passing the animal');
}

// 5. A perch the player has chosen is held as the same object, so the head never re-acquires it.
{
  const perch = {x: 80, y: 30, z: -200};
  const {parts, motion} = load(11, flat);
  const air = {x: 0, y: 60, z: 0, yaw: 0, bank: 0, loadFactor: 1, indicatedAirspeed: 16, elapsed: 0, gazeLook: 0, gazeTurn: 0, gazeTarget: perch};
  for (let i = 0; i < 90; i++, air.elapsed += dt) { air.bank = i > 30 ? -.8 : 0; frame(motion, parts, air, dt, i === 0); }
  assert.equal(air.gazeIntent, perch, 'the chosen perch was not held through the bank');
  air.gazeTarget = null; frame(motion, parts, air, dt);
  assert.notEqual(air.gazeIntent, perch, 'attention stayed on a perch the player dropped');
}

// A far peak on the skyline holds the eye; a far bay at lake level does not.
{
  const peak = {name: 'Mitre Peak', x: 300, z: -4800}, bay = {name: 'Harrison Cove', x: -300, z: -4800};
  const relief = {...flat, height: (x, z) => Math.hypot(x - peak.x, z - peak.z) < 900 ? 1200 * (1 - Math.hypot(x - peak.x, z - peak.z) / 900) : 0};
  for (const [places, expected] of [[[bay], ''], [[bay, peak], 'Mitre Peak']]) {
    const {parts, motion} = load(17, {...relief, landmarks: places});
    const air = {x: 0, y: 330, z: 0, yaw: 0, bank: 0, loadFactor: 1, indicatedAirspeed: 17, elapsed: 0, gazeLook: 0, gazeTurn: 0};
    const seen = new Set();
    for (let i = 0; i < 600; i++, air.elapsed += dt) { air.z -= 17 * dt; frame(motion, parts, air, dt, i === 0); if (motion.intent.name) seen.add(motion.intent.name); }
    assert.equal([...seen].join(), expected, 'far landmarks: expected ' + (expected || 'none') + ', attended ' + ([...seen].join() || 'none'));
  }
}

// Measured cost of attention plus the whole motion layer, per frame.
{
  const places = Array.from({length: 12}, (_, i) => ({name: 'Place ' + i, x: 900 * Math.cos(i), z: 900 * Math.sin(i)}));
  const animals = Array.from({length: 8}, (_, i) => ({name: 'Goose', x: 40 * Math.cos(i), y: 3, z: -30 - 9 * i, actor: {x: 40 * Math.cos(i), y: 3, z: -30 - 9 * i, length: .9}}));
  const {parts, motion} = load(13, {...flat, landmarks: places, wildlife: {nearby: () => animals}});
  const air = {x: 0, y: 60, z: 0, yaw: 0, bank: 0, loadFactor: 1, indicatedAirspeed: 17, elapsed: 0, gazeLook: 0, gazeTurn: 0};
  const frames = 20000, start = process.hrtime.bigint();
  for (let i = 0; i < frames; i++, air.elapsed += dt) { air.yaw += .2 * dt; air.bank = .5 * Math.sin(air.elapsed); frame(motion, parts, air, dt, i === 0); }
  const micros = Number(process.hrtime.bigint() - start) / 1000 / frames;
  console.log(`Passed eagle intent checks: landmark held through a bank toward it and released when turning away, player look wins, tail and hand follow, feet ready, perch held, far skyline peak attended and far bay ignored. Cost ${micros.toFixed(1)} microseconds per frame (attention and motion together, this machine).`);
}
