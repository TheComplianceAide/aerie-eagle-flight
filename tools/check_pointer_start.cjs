// WebKit may dispatch a stationary pointermove when the launch menu vanishes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const browser = { window: new EventTarget() };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game/flight-pointer.js'), 'utf8'), browser);
const surface = new EventTarget();
surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 700 });
const cue = { style: {}, dataset: {} };
const pointer = browser.window.makeFlightPointer({ surface, cue, currentStage: () => 'free' });
function move(x, y, dx, dy) {
  const e = Object.assign(new Event('pointermove'), {
    clientX: x, clientY: y, movementX: dx, movementY: dy, isPrimary: true, pointerType: 'mouse'
  });
  surface.dispatchEvent(e);
}
pointer.clear();
move(150, 520, 0, 0);
move(150, 520, 0, 0);
assert.equal(pointer.input.x, 0);
assert.equal(pointer.input.y, 0);
move(175, 510, 0, 0);
assert.ok(pointer.input.x < -.4 && pointer.input.y < -.2);
pointer.clear();
move(780, 160, 10, -5);
assert.ok(pointer.input.x > .4 && pointer.input.y > .3);
console.log('Stationary launch and intentional mouse steering passed.');
