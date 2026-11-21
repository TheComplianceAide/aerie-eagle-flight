// Run with node tools/check_stoop.cjs. A stoop held with the dive control
// folds the wings even though the ground ahead limits how steep it can be,
// the pullout opens them again, and the eagle clears the ground.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The flight model is a closure inside game.js; lift it out with the helpers it uses.
const source = fs.readFileSync(path.join(__dirname, '../game/game.js'), 'utf8');
const from = source.indexOf('  function makeFlight(spawn, terrain) {'), to = source.indexOf('  function planGoAround(');
assert.ok(from > 0 && to > from, 'makeFlight not found in game.js');
const helper = name => { const m = source.match(new RegExp('^\\s*const ' + name + '\\s*=.*$', 'm')); assert.ok(m, 'helper ' + name + ' not found'); return m[0]; };
const context = {window: {}, Math, Number, console};
vm.runInNewContext(['clamp', 'easing'].map(helper).join('\n') + '\n' + source.slice(from, to) + '\nthis.makeFlight = makeFlight;', context);

// The eagle follows a 30 degree slope down with the dive control held, 60 m
// above it: steeper than the ground allows, so the path is limited all the
// way. The slope runs out onto a flat after 600 m.
const slope = Math.tan(Math.PI / 6), ground = (x, z) => 1000 + slope * Math.max(z, -600);
const flight = context.makeFlight({x: 0, y: ground(0, 0) + 60, z: 0, yaw: 0}, {height: ground, bounds: {minX: -1e5, maxX: 1e5, minZ: -1e5, maxZ: 1e5}});
const s = flight.state;
let folded = 0, frames = 0, speed = 0, span = 1, clearance = Infinity, reopened = false, steepest = 0;
for (let i = 0; i < 60 * 40 && !s.contact; i++) {
  flight.step(1 / 60, {turn: 0, climb: i < 60 * 25 ? -1 : 0, look: 0, brake: false, flap: false});
  clearance = Math.min(clearance, s.y - ground(s.x, s.z)); steepest = Math.min(steepest, s.path); speed = Math.max(speed, s.airspeed);
  if (s.z > -520 && s.airspeed > 25 && s.path < -.3) { frames++; folded += s.tuck; span = Math.min(span, s.wingExtension); }   // on the slope, at speed
  if (s.z < -700 && s.wingExtension > .8) reopened = true;
}
assert.ok(steepest < -.4 && frames > 120, `no sustained dive down the slope (steepest ${steepest.toFixed(2)} rad, ${frames} frames at speed)`);
assert.ok(folded / frames > .6 && span < .6, `the wings stayed open down the slope at ${speed.toFixed(0)} m/s: mean tuck ${(folded / frames).toFixed(2)}, least span ${span.toFixed(2)}`);
assert.ok(!s.contact && clearance > 2, `the stoop met the ground (clearance ${clearance.toFixed(1)} m)`);
assert.ok(reopened, 'the wings never reopened on the flat');
console.log(`Passed stoop check: ${speed.toFixed(0)} m/s down a 30 degree slope with the wings folded to ${Math.round(span * 100)}% span, reopened on the flat, never closer than ${clearance.toFixed(0)} m to the ground.`);
