// Checks that every draw game/unseen-draws.js leaves out really is empty, in the
// real game. That module skips draws it can prove put no pixel on their target:
// conifer stands beyond their own reach, instanced models and ground tiles
// outside a camera's view, the lake bed in the lake mirror, the mirror itself
// while its lake is out of view. A wrong skip would be a hole in the picture,
// so this asks the GPU.
//
// It flies the game in a private headless Chrome (muted, sound off), and for
// every frame draws each skipped mesh after all inside an occlusion query. The
// query counts samples that pass the depth test, which is stricter than what
// reaches the finished picture. It asserts:
//   - no skipped draw would have put a single sample on its target, in the
//     direct view or in the lake mirror (drawn every frame here);
//   - a lake judged out of view puts no sample on the screen;
//   - the rules are in fact skipping something.
//
// The flights: a glide from the launch, a full turn on the spot above it and,
// where the world has a level lake, a low run along the nearest shore, a full
// turn just over the water and a descent to it.
//
// The served copy of game.js gets three hooks (hold the eagle, hold the clock,
// step frames by hand). Nothing in the game directory is changed. If game.js
// has moved on and a hook no longer fits, the check says which.
//
// usage: node tools/check_unseen_draws.mjs [--world winnipesaukee] [--launch lake]
//          [--game <game dir>] [--chrome <path>]
// Takes one to two minutes. Requires Node 22 or later and a local Chrome or Chromium.
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
  world: {type: 'string', default: 'winnipesaukee'}, launch: {type: 'string', default: 'lake'}, game: {type: 'string'}, chrome: {type: 'string'}
}});
const tools = path.dirname(fileURLToPath(import.meta.url));
const game = path.resolve(options.game || path.join(tools, '../game'));
const candidates = [options.chrome, process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
let chrome;
for (const candidate of candidates) { try { await fs.access(candidate); chrome = candidate; break; } catch {} }
if (!chrome) throw Error('Provide a local Chrome executable via --chrome or CHROME_PATH.');

function hook(source) {
  const swap = (from, to) => {
    if (!source.includes(from)) throw Error('game.js has changed and a hook of tools/check_unseen_draws.mjs no longer fits: ' + from.slice(0, 60));
    source = source.replace(from, to);
  };
  swap('dynamics=makeFlight(launch,world);', 'dynamics=makeFlight(launch,world);window.__aerie={dynamics,world,scene,camera,renderer,advance,get eagle(){return eagle;}};');
  swap('const s=dynamics.state;\n    elapsed=s.elapsed;distance=s.distance;',
    'const s=dynamics.state;if(window.__pin)Object.assign(s,window.__pin);if(window.__clock!=null)s.elapsed=window.__clock;\n    elapsed=s.elapsed;distance=s.distance;');
  swap('if(!started || paused || graphicsLost)return;', 'if(!started || paused || graphicsLost || window.__manual)return;');
  return source;
}
const types = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.wasm': 'application/wasm', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.txt': 'text/plain', '.bin': 'application/octet-stream'};
const server = http.createServer(async (request, response) => {
  const location = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  const file = path.resolve(game, '.' + (location === '/' ? '/index.html' : location));
  if (file !== game && !file.startsWith(game + path.sep)) { response.writeHead(404); response.end(); return; }
  try {
    const info = await fs.stat(file);
    if (!info.isFile()) throw Error('No such file');
    response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    if (location === '/game.js') { response.end(hook(await fs.readFile(file, 'utf8'))); return; }
    response.setHeader('Content-Length', info.size);
    createReadStream(file).on('error', () => response.destroy()).pipe(response);
  } catch (error) { response.writeHead(error.message.includes('hook') ? 500 : 404); response.end(String(error.message || '')); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'aerie-unseen-check-'));
// --mute-audio keeps the speakers silent, and the game's own sound is switched off below.
const child = spawn(chrome, ['--headless=new', '--mute-audio', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
  '--user-data-dir=' + profile, '--window-size=960,540', '--force-device-scale-factor=1',
  '--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : []),
  '--disable-component-update', '--disable-background-networking', '--disk-cache-size=1',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank'], {stdio: 'ignore'});
let socket;
async function until(test, description, limit = 300000) {
  const start = Date.now();
  while (Date.now() - start < limit) {
    if (child.exitCode !== null) throw Error('Chrome exited while ' + description);
    const value = await test();
    if (value) return value;
    await delay(150);
  }
  throw Error('Timed out while ' + description);
}

// Runs in the page once the flight has started.
const audit = `(async () => {
  const a = __aerie, r = a.renderer, gl = r.getContext(), module = a.world.unseenDraws;
  if (!module) return {error: 'this world has no unseenDraws: the module did not start'};
  const still = {airspeed: 17.5, indicatedAirspeed: 17.5, path: 0, bank: 0, pitch: 0, verticalSpeed: 0, rollRate: 0, contact: false, stall: 0, tuck: 0, effort: 0};
  const s = a.dynamics.state, start = {x: s.x, z: s.z, yaw: s.yaw};
  let water = null; a.scene.traverse(o => { if (o.isWater && !water) water = o; });
  const level = water ? water.position.y : -Infinity, ground = (x, z) => a.world.height(x, z);
  // Thirty metres over the highest ground of the glide.
  let top = -Infinity;
  for (let t = 0; t <= 12; t += .25) top = Math.max(top, ground(start.x - Math.sin(start.yaw) * 17.5 * t, start.z - Math.cos(start.yaw) * 17.5 * t), level);
  const high = top + 30;
  const flights = [
    ['glide', 12, 2, t => ({x: start.x - Math.sin(start.yaw) * 17.5 * t, y: high, z: start.z - Math.cos(start.yaw) * 17.5 * t, yaw: start.yaw, ...still})],
    ['turn', 6, 1, t => ({x: start.x, y: high, z: start.z, yaw: start.yaw + t / 6 * 2 * Math.PI, ...still})]];
  if (water) {
    // The nearest point where the ground crosses the lake level, and the way inland from it.
    let shore = null;
    const wet = ground(start.x, start.z) < level;
    for (let radius = 4; radius <= 1500 && !shore; radius += 4) {
      const n = Math.max(8, Math.round(6.283 * radius / 4));
      for (let i = 0; i < n; i++) {
        const angle = i / n * 6.283, x = start.x + Math.cos(angle) * radius, z = start.z + Math.sin(angle) * radius;
        if ((ground(x, z) < level) !== wet) { shore = {x, z}; break; }
      }
    }
    if (shore) {
      const gx = ground(shore.x + 1.5, shore.z) - ground(shore.x - 1.5, shore.z), gz = ground(shore.x, shore.z + 1.5) - ground(shore.x, shore.z - 1.5), g = Math.hypot(gx, gz) || 1;
      const nx = gx / g, nz = gz / g, along = Math.atan2(nz, -nx), out = Math.atan2(nx, nz);
      flights.push(['low run', 10, 2, t => ({x: shore.x - nx * 12 - Math.sin(along) * 17.5 * t, y: level + 4, z: shore.z - nz * 12 - Math.cos(along) * 17.5 * t, yaw: along, ...still})]);
      flights.push(['low turn', 6, 1, t => ({x: shore.x - nx * 8, y: level + 6, z: shore.z - nz * 8, yaw: t / 6 * 2 * Math.PI, ...still})]);
      flights.push(['descent', 12, 2, t => ({x: shore.x + nx * 150 - Math.sin(out) * 17.5 * t, y: level + 120 - 117 * Math.min(1, t / 10), z: shore.z + nz * 150 - Math.cos(out) * 17.5 * t, yaw: out, ...still, pitch: Math.atan2(-11.7, 17.5)})]);
    }
  }
  const original = r.renderBufferDirect.bind(r), before = a.scene.onBeforeRender, after = a.scene.onAfterRender, mirrorPace = window.aerieSkipReflection;
  const records = [], stack = [], wrong = new Map(), rules = new Map();
  let checked = 0, lakeChecks = 0;
  a.scene.onBeforeRender = function (renderer, scene, camera, target) {
    before.apply(this, arguments);                               // the module hides here
    const why = new Map(module.hidden);
    stack.push({why, lakes: !target && !camera.userData.lakeReflection ? module.lakesOutOfView() : []});
    for (const mesh of why.keys()) mesh.visible = true;          // draw them after all, each inside a query
  };
  a.scene.onAfterRender = function () {
    const {why} = stack.pop();
    after.apply(this, arguments);                                // the module gives back what it hid for this render
    for (const mesh of why.keys()) if (module.hidden.has(mesh)) mesh.visible = false;
  };
  const rule = object => {
    const top = stack[stack.length - 1];
    if (!top) return null;
    if (top.lakes.includes(object)) return 'lake out of view';
    for (let o = object; o; o = o.parent) if (top.why.has(o)) return top.why.get(o);
    return null;
  };
  r.renderBufferDirect = (camera, scene, geometry, material, object, group) => {
    const why = scene === a.scene ? rule(object) : null;
    if (!why) { original(camera, scene, geometry, material, object, group); return; }
    const query = gl.createQuery();
    gl.beginQuery(gl.ANY_SAMPLES_PASSED, query); original(camera, scene, geometry, material, object, group); gl.endQuery(gl.ANY_SAMPLES_PASSED);
    records.push({query, object, why, where: r.getRenderTarget() ? (camera.userData.lakeReflection ? 'the lake mirror' : 'a render target') : 'the direct view'});
  };
  const settle = async flight => {
    gl.flush();
    for (let i = 0; i < 500; i++) { await new Promise(done => setTimeout(done, 8)); if (records.every(x => gl.getQueryParameter(x.query, gl.QUERY_RESULT_AVAILABLE))) break; }
    for (const x of records.splice(0)) {
      const shown = gl.getQueryParameter(x.query, gl.QUERY_RESULT); gl.deleteQuery(x.query);
      checked++; if (x.why === 'lake out of view') lakeChecks++;
      rules.set(x.why, (rules.get(x.why) || 0) + 1);
      if (!shown) continue;
      let o = x.object, name = o.name; while (!name && o.parent && o.parent !== a.scene) { o = o.parent; name = o.name; }
      const key = x.why + ', but it shows in ' + x.where + ' during the ' + flight + ': ' + (name || x.object.type);
      wrong.set(key, (wrong.get(key) || 0) + 1);
    }
  };
  const flown = [];
  try {
    window.__manual = true; window.aerieSkipReflection = () => false;   // a mirror every frame, lake in view or not
    for (const [name, seconds, stride, state] of flights) {
      const frames = Math.round(seconds * 60 / stride);
      for (let i = 0; i < frames; i++) {
        const t = i * stride / 60; window.__clock = 100 + t; window.__pin = state(t); a.advance(stride / 60);
        if (records.length > 2500) await settle(name);
      }
      await settle(name); flown.push(name + ' (' + frames + ' frames)');
    }
  } finally { r.renderBufferDirect = original; a.scene.onBeforeRender = before; a.scene.onAfterRender = after; window.aerieSkipReflection = mirrorPace; }
  return {flown, checked, lakeChecks, rules: [...rules], wrong: [...wrong], counts: module.counts};
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
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true, userGesture: true});
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  await call('Runtime.enable'); await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', {width: 960, height: 540, deviceScaleFactor: 1, mobile: false});
  const origin = 'http://127.0.0.1:' + server.address().port;
  await call('Page.navigate', {url: `${origin}/?play=1#world=${options.world}&launch=${options.launch}`});
  await until(() => evaluate("document.readyState==='complete'&&typeof window.loadFlightRange==='function'"), 'loading the game');
  // A saved flight would come up paused; the sound stays off.
  await evaluate("(()=>{try{localStorage.removeItem('aerie:resume')}catch(e){}document.body.classList.add('clearView');if(sound.title==='Mute sound')sound.click();fly.click();})()");
  await until(() => evaluate("app.dataset.mode==='flight'&&!!window.__aerie"), 'starting the flight', 400000);
  await evaluate("(()=>{const s=__aerie.dynamics.state;window.__manual=true;window.__pin={x:s.x,y:s.y+40,z:s.z,yaw:s.yaw,airspeed:17.5,indicatedAirspeed:17.5,path:0,bank:0,pitch:0,verticalSpeed:0,rollRate:0,contact:false};})()");
  await delay(1500);
  const report = await evaluate(audit);
  try {
    assert.ok(!report.error, report.error);
    assert.equal(report.wrong.length, 0, 'skipped draws that would have shown:\n  ' + report.wrong.map(([what, frames]) => `${frames}× ${what}`).join('\n  '));
    assert.ok(report.checked > 0, 'nothing was skipped at all in ' + options.world + ': the rules have stopped matching the scenery');
    assert.equal(errors.filter(Boolean).length, 0, 'the page threw: ' + errors.filter(Boolean).join(' | '));
    console.log(`Passed unseen draws check in ${options.world}: ${report.checked} skipped draws were drawn after all and none put a sample on its target ` +
      `(${report.rules.map(([rule, n]) => `${rule}: ${n}`).join('; ')}), over ${report.flown.join(', ')}.`);
  } catch (error) { failure = error; console.log(JSON.stringify({...report, wrong: report.wrong?.length}));  }
} finally {
  socket?.close(); child.kill(); server.closeAllConnections(); server.close();
  for (let i = 0; i < 60 && child.exitCode === null && child.signalCode === null; i++) await delay(50);
  await fs.rm(profile, {recursive: true, force: true, maxRetries: 3, retryDelay: 250});
}
if (failure) { console.error(failure.message); process.exit(1); }
