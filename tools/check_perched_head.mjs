// Checks the eagle's head through a landing, a look down from the perch and a
// take-off, in the real game. None of the node checks loads the full rig in
// eagle.js, and two faults there went unseen: looking steeply down from an
// upright perch twisted the neck, and in the last moment of the flare the head
// jerked aside. This flies the game in a private headless Chrome (muted, sound
// off) and measures where the head actually points, in the world.
//
// It asserts:
//   - through the landing flare the head stays straight: no tilt, no turn;
//   - perched and asked to look 56 degrees down, the head looks 56 degrees
//     down, upright, and with a turn added it turns by that much;
//   - leaving the perch, the head does not swing up at the sky;
//   - no bone is ever invalid.
//
// usage: node tools/check_perched_head.mjs [--world moosehead] [--launch lookout]
//          [--game <game dir>] [--chrome <path>]
// Takes about a minute. Requires Node 22 or later and a local Chrome or Chromium.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const {values: options} = parseArgs({options: {
  world: {type: 'string', default: 'moosehead'}, launch: {type: 'string', default: 'lookout'}, game: {type: 'string'}, chrome: {type: 'string'}
}});
const tools = path.dirname(fileURLToPath(import.meta.url));
const game = path.resolve(options.game || path.join(tools, '../game'));
const candidates = [options.chrome, process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
let chrome;
for (const candidate of candidates) { try { await fs.access(candidate); chrome = candidate; break; } catch {} }
if (!chrome) throw Error('Provide a local Chrome executable via --chrome or CHROME_PATH.');

const types = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.wasm': 'application/wasm', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.txt': 'text/plain'};
const server = http.createServer(async (request, response) => {
  const location = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  const file = path.resolve(game, '.' + (location === '/' ? '/index.html' : location));
  if (file !== game && !file.startsWith(game + path.sep)) { response.writeHead(404); response.end(); return; }
  try {
    const info = await fs.stat(file);
    if (!info.isFile()) throw Error('No such file');
    response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    response.setHeader('Content-Length', info.size);
    createReadStream(file).on('error', () => response.destroy()).pipe(response);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'aerie-head-check-'));
// --mute-audio keeps the speakers silent, and the game's own sound is switched off below.
const child = spawn(chrome, ['--headless=new', '--mute-audio', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
  '--user-data-dir=' + profile, '--window-size=960,540', '--force-device-scale-factor=1',
  '--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : []),
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank'], {stdio: 'ignore'});
let socket;
async function until(test, description, limit = 180000) {
  const start = Date.now();
  while (Date.now() - start < limit) {
    if (child.exitCode !== null) throw Error('Chrome exited while ' + description);
    const value = await test();
    if (value) return value;
    await delay(120);
  }
  throw Error('Timed out while ' + description);
}

// Runs in the page before the flight starts: finds the eagle as it is drawn and
// samples its head once a frame. Angles are in degrees, in the world: pitch
// above the horizon, turn off the body's heading, and sideways tilt.
const probe = `(() => {
  const Renderer = THREE.WebGLRenderer;
  THREE.WebGLRenderer = class extends Renderer {
    constructor(...args) {
      super(...args);
      const render = this.render.bind(this);
      this.render = (scene, camera) => { if (scene.isScene && !window.__eagle) window.__eagle = scene.getObjectByName('Bald eagle') || null; render(scene, camera); };
    }
  };
  const rows = window.__head = [], q = new THREE.Quaternion(), ahead = new THREE.Vector3(), side = new THREE.Vector3(), deg = 180 / Math.PI;
  let neck = null, bones = null;
  const sample = () => {
    requestAnimationFrame(sample);
    const eagle = window.__eagle, air = window.aerieEagleMotionDebug?.stats?.air;
    if (!eagle || !air) return;
    if (!bones) { bones = []; eagle.traverse(o => { if (o.isBone) { bones.push(o); if (o.name === 'Neck') neck = o; } }); }
    if (!neck) return;
    neck.getWorldQuaternion(q); ahead.set(0, 0, -1).applyQuaternion(q); side.set(1, 0, 0).applyQuaternion(q);
    const turn = Math.atan2(-ahead.x, -ahead.z) - (air.yaw || 0);
    rows.push({t: performance.now() / 1000, stage: app.dataset.perch, pitch: Math.asin(Math.max(-1, Math.min(1, ahead.y))) * deg,
      turn: Math.atan2(Math.sin(turn), Math.cos(turn)) * deg, tilt: Math.asin(Math.max(-1, Math.min(1, side.y))) * deg,
      askedPitch: (air.perchLookPitch || 0) * deg, askedTurn: (air.perchLook || 0) * deg,
      bad: bones.reduce((n, b) => n + (Number.isFinite(b.quaternion.x + b.quaternion.y + b.quaternion.z + b.quaternion.w + b.position.x + b.position.y + b.position.z) ? 0 : 1), 0)});
  };
  requestAnimationFrame(sample);
  const view = document.getElementById('viewport');
  const point = (type, x, y) => view.dispatchEvent(new PointerEvent(type, {clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, bubbles: true, isPrimary: true}));
  // Drag the perched view by this many pixels, as a player would.
  window.__drag = (dx, dy) => { point('pointerdown', 480, 270); for (let i = 1; i <= 10; i++) point('pointermove', 480 + dx * i / 10, 270 + dy * i / 10); point('pointerup', 480 + dx, 270 + dy); };
  window.__key = code => { window.dispatchEvent(new KeyboardEvent('keydown', {code, key: code})); window.dispatchEvent(new KeyboardEvent('keyup', {code, key: code})); };
})()`;

let failure = null;
try {
  const port = await until(async () => {
    try { return (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; } catch { return false; }
  }, 'starting Chrome');
  const target = await (await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', {method: 'PUT'})).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let serial = 0;
  const pending = new Map(), errors = [];
  socket.onmessage = ({data}) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description?.slice(0, 200));
    if (!pending.has(message.id)) return;
    const {resolve, reject} = pending.get(message.id); pending.delete(message.id);
    if (message.error) reject(Error(message.error.message)); else resolve(message.result);
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial; pending.set(id, {resolve, reject}); socket.send(JSON.stringify({id, method, params}));
  });
  async function evaluate(expression) {
    const result = await call('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true, userGesture: true});
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  await call('Runtime.enable'); await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', {width: 960, height: 540, deviceScaleFactor: 1, mobile: false});
  await call('Page.navigate', {url: 'http://127.0.0.1:' + server.address().port + '/#world=' + options.world + '&launch=' + options.launch});
  await until(() => evaluate("document.readyState==='complete'&&typeof window.loadFlightRange==='function'"), 'loading the game');
  await evaluate(probe);
  await evaluate("(()=>{document.body.classList.add('clearView');if(sound.title==='Mute sound')sound.click();fly.click();})()");
  await until(() => evaluate("app.dataset.mode==='flight'&&window.__head.length>3"), 'starting the flight');

  // Land on the nearest perch.
  await evaluate("__key('KeyF')");
  await until(() => evaluate("app.dataset.perch==='perched'"), 'landing on the perch', 150000);
  await delay(3500);                                   // settled, and any turn toward the way out is done
  const mark = name => evaluate(`(window.__marks = window.__marks || {})[${JSON.stringify(name)}] = performance.now() / 1000`);
  // Look steeply down, then add a turn each way, then back to level.
  await evaluate('__drag(0, -480)'); await delay(1500); await mark('down');
  await delay(1200); await mark('downEnd');
  await evaluate('__drag(110, 0)'); await delay(1500); await mark('aside');
  await delay(1000); await mark('asideEnd');
  await evaluate('__drag(-110, 480)'); await delay(400); await evaluate('__drag(0, -170)'); await delay(1800);
  // Leave the perch.
  await evaluate("__key('KeyF')");
  await until(() => evaluate("app.dataset.perch==='push'||app.dataset.perch==='free'"), 'leaving the perch', 30000);
  await delay(1800);
  const {rows, marks} = await evaluate('({rows: window.__head, marks: window.__marks})');

  const most = (list, f) => list.reduce((m, r) => Math.max(m, f(r)), -Infinity), least = (list, f) => list.reduce((m, r) => Math.min(m, f(r)), Infinity);
  const between = (a, b) => rows.filter(r => r.t >= marks[a] && r.t <= marks[b]);
  const flare = rows.filter(r => r.stage === 'flare'), down = between('down', 'downEnd'), aside = between('aside', 'asideEnd');
  const left = rows.findIndex((r, i) => i > 0 && (r.stage === 'push' || r.stage === 'free') && rows[i - 1].stage === 'perched');
  const launch = left < 0 ? [] : rows.slice(left).filter(r => r.t <= rows[left].t + 1.2);
  const report = {
    frames: rows.length, invalidBones: most(rows, r => r.bad),
    flare: {frames: flare.length, tilt: most(flare, r => Math.abs(r.tilt)), turn: most(flare, r => Math.abs(r.turn))},
    lookDown: {asked: least(down, r => r.askedPitch), headFrom: least(down, r => r.pitch), headTo: most(down, r => r.pitch), tilt: most(down, r => Math.abs(r.tilt))},
    downAndAside: {askedTurn: most(aside, r => Math.abs(r.askedTurn)), turn: most(aside, r => Math.abs(r.turn)), headPitch: most(aside, r => r.pitch), tilt: most(aside, r => Math.abs(r.tilt))},
    takeOff: {frames: launch.length, highestPitch: most(launch, r => r.pitch)}
  };
  const f = v => Number.isFinite(v) ? v.toFixed(0) : String(v);
  try {
    assert.deepEqual(errors, [], 'the page threw');
    assert.equal(report.invalidBones, 0, 'a bone became invalid');
    assert.ok(flare.length >= 10, `only ${flare.length} frames of the landing flare were seen`);
    assert.ok(report.flare.tilt <= 6 && report.flare.turn <= 10, `in the landing flare the head tilted ${f(report.flare.tilt)} and turned ${f(report.flare.turn)} degrees`);
    assert.ok(down.length >= 10 && report.lookDown.asked < -50, `the look down was not held (asked ${f(report.lookDown.asked)} over ${down.length} frames)`);
    assert.ok(Math.abs(report.lookDown.headFrom - report.lookDown.asked) <= 8 && Math.abs(report.lookDown.headTo - report.lookDown.asked) <= 8,
      `asked to look ${f(report.lookDown.asked)} degrees down, the head pointed ${f(report.lookDown.headFrom)} to ${f(report.lookDown.headTo)}`);
    assert.ok(report.lookDown.tilt <= 8, `looking straight down the perch, the head tilted ${f(report.lookDown.tilt)} degrees`);
    assert.ok(aside.length >= 10 && report.downAndAside.askedTurn > 8, `the turn while looking down was not held (asked ${f(report.downAndAside.askedTurn)})`);
    assert.ok(Math.abs(report.downAndAside.turn - report.downAndAside.askedTurn) <= 8, `asked to turn ${f(report.downAndAside.askedTurn)} degrees while looking down, the head turned ${f(report.downAndAside.turn)}`);
    assert.ok(report.downAndAside.headPitch <= -45, `with the turn added the head came up to ${f(report.downAndAside.headPitch)} degrees`);
    assert.ok(report.downAndAside.tilt <= 26, `looking down and aside the head tilted ${f(report.downAndAside.tilt)} degrees`);   // the one-eyed cock is up to 22
    assert.ok(launch.length >= 10, `only ${launch.length} frames of the take-off were seen`);
    assert.ok(report.takeOff.highestPitch <= 45, `leaving the perch the head swung ${f(report.takeOff.highestPitch)} degrees up`);
    console.log(`Passed perched head check in ${options.world}: straight through the flare (tilt ${f(report.flare.tilt)}, turn ${f(report.flare.turn)}), ` +
      `looked ${f(-report.lookDown.asked)} degrees down when asked (tilt ${f(report.lookDown.tilt)}), turned ${f(report.downAndAside.turn)} of ${f(report.downAndAside.askedTurn)} while down, ` +
      `left the perch with the head no higher than ${f(report.takeOff.highestPitch)} degrees, over ${rows.length} frames.`);
  } catch (error) { failure = error; console.log(JSON.stringify(report)); }
} finally {
  socket?.close(); child.kill(); server.closeAllConnections(); server.close();
  for (let i = 0; i < 60 && child.exitCode === null && child.signalCode === null; i++) await delay(50);
  await fs.rm(profile, {recursive: true, force: true, maxRetries: 3, retryDelay: 250});
}
if (failure) { console.error(failure.message); process.exit(1); }
