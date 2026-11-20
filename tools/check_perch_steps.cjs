// Run with node tools/check_perch_steps.cjs. The two feet must never advance
// together, even when the player requests a launch during the first step.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const THREE = require('../game/three.min.js');
const browser = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game/perch-flight.js'), 'utf8'), browser);
const { makePerchFlight } = browser.window;

function approach(kind, exitAngle) {
  const ground = { height: () => 0, clearance: () => 0 };
  const perch = {
    type: kind, x: 0, y: 5, z: 0, yaw: 0, direction: { x: 0, z: 1 },
    approach: { x: 0, y: 6, z: 9 },
    exit: { x: -18 * Math.sin(exitAngle), y: 10.3, z: -18 * Math.cos(exitAngle) }
  };
  const habitat = { select() {}, clearance: () => 0, surface: () => 0, resolveRoute: () => perch };
  const flight = makePerchFlight(THREE, ground, habitat, { perch, approach: perch.approach });
  const state = {
    x: 0, y: 7, z: 20, yaw: 0, pitch: 0, bank: 0, airspeed: 15, path: -.12,
    wingExtension: 1, effort: 0, brakeSpread: 0, elapsed: 0, verticalSpeed: 0,
    distance: 0, phase: 0, turnTrim: 0
  };
  flight.reset(state, true);
  flight.land(state);
  return {flight,state,perch};
}

function checkDeparture(kind, exitAngle, tickRate, pushAfter) {
  const {flight,state,perch} = approach(kind, exitAngle);
  let landedAt, requested = false, released = false;
  let previousFeet, steps = 0, lastMoving = 0;
  const dt = 1 / tickRate;
  for (let i = 0; i < 25 * tickRate; i++) {
    flight.advance(state, dt, { climb: 0, turn: 0, look: 0 });
    if (flight.stage === 'free') break;
    if (flight.stage === 'perched') {
      landedAt ??= state.elapsed;
      assert.ok(Math.hypot(state.x - perch.x, state.z - perch.z) < 1e-6);
      const feet = state.perchStep;
      if (previousFeet) {
        const left = Math.abs(feet.leftYaw - previousFeet.leftYaw);
        const right = Math.abs(feet.rightYaw - previousFeet.rightYaw);
        assert.ok(Math.min(left, right) < 1e-8, 'Both feet slid in the same step');
      }
      if (feet.moving && feet.moving !== lastMoving) steps++;
      lastMoving = feet.moving;
      previousFeet = { ...feet };
      if (!requested && state.elapsed - landedAt > pushAfter) {
        flight.push(state);
        requested = true;
      }
    } else if (flight.stage === 'push' && !released && state.airspeed > 0) {
      const error = Math.atan2(Math.sin(state.yaw - exitAngle), Math.cos(state.yaw - exitAngle));
      assert.ok(Math.abs(error) < .006, 'The eagle took off facing away from the safe exit');
      released = true;
    }
  }
  assert.ok(requested && released && flight.stage === 'free');
  if (Math.abs(exitAngle) > Math.PI / 2) assert.ok(steps >= 3);
}

for (const kind of ['branch', 'rock']) {
  for (const rate of [30, 60, 120]) {
    for (const angle of [-179, -91, 0, 30, 121, 179]) {
      for (const delay of [.035, 2, 6]) {
        checkDeparture(kind, angle * Math.PI / 180, rate, delay);
      }
    }
  }
}
console.log('Passed 108 perch turns and departures.');

function checkBreakOff(kind, speed, clear) {
  const {flight,state} = approach(kind, Math.PI);
  const dt = 1/120, controls = {climb:0,turn:0,look:0};
  let oldPosition;
  while (state.airspeed > speed && flight.stage !== 'perched') {
    oldPosition = new THREE.Vector3(state.x,state.y,state.z);
    flight.advance(state,dt,controls);
  }
  const atBreak = [state.x,state.y,state.z,state.yaw,state.path,state.airspeed,state.wingExtension];
  const plan = {turn:0};
  const preview = (s,velocity) => {
    const measured = new THREE.Vector3(s.x,s.y,s.z).sub(oldPosition).multiplyScalar(1/dt);
    assert.ok(velocity.distanceTo(measured) < 1e-8, 'Go-around lost the incoming ground velocity');
    return clear ? plan : null;
  };
  flight.cancel(state,preview);
  assert.deepEqual([state.x,state.y,state.z,state.yaw,state.path,state.airspeed,state.wingExtension],atBreak);
  if (clear && speed > 5.5) {
    assert.equal(flight.stage,'free');
    assert.equal(state.goAround,plan);
    return;
  }
  assert.equal(state.perchLaunchPending,true);
  flight.cancel(state,preview);
  assert.equal(state.perchLaunchPending,false,'Player could not cancel automatic takeoff');
  flight.cancel(state,preview);
  let onSupport=false, launched=false;
  for (let tick=0;tick<20/dt&&flight.stage!=='free';tick++) {
    flight.advance(state,dt,controls);
    if (flight.stage==='perched' && state.perchGrip>.99 && !state.airspeed) onSupport=true;
    if (flight.stage==='push') {
      assert.ok(onSupport,'Applied leg impulse before taking weight on the perch');
      launched=true;
    }
  }
  assert.ok(onSupport && launched && flight.stage==='free');
}
for (const kind of ['branch','rock']) {
  for (const speed of [12,9.1,8.9,4]) {
    for (const clear of [false,true]) checkBreakOff(kind,speed,clear);
  }
}
console.log('Passed 16 airborne break-offs and touch-and-go departures.');
