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

function checkDeparture(kind, exitAngle, tickRate, pushAfter) {
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
