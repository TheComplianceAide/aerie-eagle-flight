const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeFlight(touch) {
  const values = new Map();
  const localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
  const context = {window: {}, localStorage, matchMedia: () => ({matches: touch})};
  for (const file of ['game-units.js', 'game-vision.js'])
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game', file), 'utf8'), context);
  const button = {setAttribute(name, value) { this[name] = value; }};
  const layer = {querySelector: () => ({querySelector: () => ({})}), querySelectorAll: () => []};
  const vision = context.window.makeGameVision({Vector3: class {}}, {}, button, layer);
  const visible = expected => {
    assert.equal(layer.hidden, !expected);
    assert.equal(button['aria-pressed'], String(expected));
  };
  return {vision, visible};
}

for (const touch of [true, false]) {
  const {vision, visible} = makeFlight(touch);
  vision.startFlight(false);
  visible(touch);
  vision.startFlight(true);
  visible(true);
  vision.toggle();
  vision.startFlight(true);
  visible(false);
  vision.toggle();
  vision.startFlight(false);
  visible(true);
}
console.log('Game Vision first-flight defaults and saved on/off choices passed.');
