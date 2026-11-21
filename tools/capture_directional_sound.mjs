// Fly a pass in the real game and record what the eagle hears, in silence.
//
// A private headless Chrome is started with --mute-audio, so nothing reaches
// the speakers; the recording is taken from the game's own audio graph. An
// autopilot holds the flight keys to follow a route: by default the Mount
// Kineo pass at Moosehead Lake (exposed approach over the water, low along the
// lee of the cliffs, and back out to where it began).
//
// Writes into --output:
//   directional-sound.wav    stereo, what the game sent to the output
//   directional-sound.json   ten rows a second: eagle position and airspeed,
//                            wind shelter, wind masker and every positioned
//                            source (label, place, distance, terrain screening,
//                            arriving level, level left after wind masking)
// and prints which sources kept their place, how screening and masking changed
// between the open water and the lee, and the cost of the audio update.
//
// usage: node tools/capture_directional_sound.mjs --output <dir> [--seconds 100]
//          [--world moosehead] [--launch lake] [--route '[[x,z,altitude],...]']
//          [--perch] [--keys '[[from,to,"Space"],...]'] [--game <game dir>] [--chrome <path>] [--no-wav]
// With --keys the autopilot is off and the listed keys are held between the
// given seconds of the recording (a take-off and climb, for instance).
// With --perch the eagle lands on the launch's perch first and the recording
// is made from there, with no flight wind in it: what a microphone left at
// that spot would hear. Use it with a launch that has a perch, such as lookout.
// Requires Node 22 or later and a local Chrome or Chromium.
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
  output: {type: 'string'}, seconds: {type: 'string', default: '100'}, world: {type: 'string', default: 'moosehead'},
  launch: {type: 'string', default: 'lake'}, route: {type: 'string'}, game: {type: 'string'}, chrome: {type: 'string'}, 'no-wav': {type: 'boolean'},
  perch: {type: 'boolean'}, keys: {type: 'string'}
}});
if (!options.output) throw Error('Required argument: --output <directory>');
const tools = path.dirname(fileURLToPath(import.meta.url));
const game = path.resolve(options.game || path.join(tools, '../game'));
// The Kineo pass: x, z and altitude in metres. The lake is at 312 m, the
// summit near 540 m, and the wind blows toward the north-east, so the water
// under the east-facing cliffs is in their lee.
const keys = options.keys ? JSON.parse(options.keys) : [];
const route = options.perch || keys.length ? [] : options.route ? JSON.parse(options.route) : [[420, -880, 372], [392, -1010, 362], [395, -1160, 362], [640, -1210, 385], [860, -800, 415], [836, -455, 432]];
const seconds = +options.seconds;

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
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'aerie-sound-capture-'));
// --mute-audio keeps the speakers silent. The graph still renders in real time.
const child = spawn(chrome, ['--headless=new', '--mute-audio', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
  '--user-data-dir=' + profile, '--autoplay-policy=no-user-gesture-required', '--window-size=1280,720', '--force-device-scale-factor=1',
  '--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : []),
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank'], {stdio: 'ignore'});
let socket;
async function until(test, description, limit = 180000) {
  const start = Date.now();
  while (Date.now() - start < limit) {
    if (child.exitCode !== null) throw Error('Chrome exited while ' + description);
    const value = await test();
    if (value) return value;
    await delay(150);
  }
  throw Error('Timed out while ' + description);
}

// Runs in the page before the game: taps whatever reaches the audio output.
const tap = `(() => {
  const connect = AudioNode.prototype.connect;
  const capture = window.__capture = {left: [], right: [], rate: 0, on: false};
  AudioNode.prototype.connect = function (destination, ...rest) {
    const result = connect.call(this, destination, ...rest);
    try {
      if (destination instanceof AudioDestinationNode) {
        const context = destination.context;
        if (!context.__tap) {
          const node = context.__tap = context.createScriptProcessor(4096, 2, 2), sink = context.createGain();
          sink.gain.value = 0; capture.rate = context.sampleRate; capture.context = context;
          node.onaudioprocess = event => {
            if (!capture.on) return;
            capture.left.push(new Float32Array(event.inputBuffer.getChannelData(0)));
            capture.right.push(new Float32Array(event.inputBuffer.getChannelData(1)));
          };
          connect.call(node, sink); connect.call(sink, destination);
        }
        connect.call(this, context.__tap);
      }
    } catch (error) {}
    return result;
  };
})();`;

// Runs in the page once flight has begun: the autopilot, the trace and the cost.
const pilot = `((route, keys) => {
  const scape = window.aerieSoundscapeDebug, ear = scape.engine.ear, capture = window.__capture;
  const held = new Set(), rows = [], frames = [];
  const press = (code, on) => {
    if (on === held.has(code)) return;
    if (on) held.add(code); else held.delete(code);
    window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', {code, key: code}));
  };
  const update = scape.update; let spent = 0, updates = 0;
  scape.update = function (...args) { const t = performance.now(); const r = update.apply(this, args); spent += performance.now() - t; updates++; return r; };
  let last = performance.now();
  const frame = now => { frames.push(now - last); last = now; if (run.on) requestAnimationFrame(frame); };
  let leg = 0; const began = capture.context.currentTime;
  const run = window.__run = {on: true, rows, frames, get spent() { return spent; }, get updates() { return updates; }};
  requestAnimationFrame(frame);
  capture.on = true;
  run.timer = setInterval(() => {
    if (route.length) {
      const [tx, tz, ty] = route[leg], dx = tx - ear.x, dz = tz - ear.z, distance = Math.hypot(dx, dz) || 1;
      if (distance < 80 && leg < route.length - 1) leg++;
      const speed = Math.hypot(ear.vx, ear.vz) || 1;
      // Angle from the line of flight to the next point: positive is to the right.
      const off = Math.atan2((ear.vx * dz - ear.vz * dx) / (speed * distance), (ear.vx * dx + ear.vz * dz) / (speed * distance));
      press('KeyD', off > .10); press('KeyA', off < -.10);
      press('KeyW', ear.y < ty - 5); press('KeyS', ear.y > ty + 8);
      press('Space', ear.y < ty - 22 || speed < 12);
    }
    const elapsed = capture.context.currentTime - began;
    for (const [from, to, code] of keys) press(code, elapsed >= from && elapsed < to);
    rows.push({t: +(capture.context.currentTime - began).toFixed(2), x: +ear.x.toFixed(1), y: +ear.y.toFixed(1), z: +ear.z.toFixed(1),
      speed: +Math.hypot(ear.vx, ear.vy, ear.vz).toFixed(1), leg, shelter: scape.shelter === undefined ? null : +scape.shelter.toFixed(3),
      masker: scape.engine.masker === undefined ? null : +scape.engine.masker.toFixed(5), sources: scape.trace ? scape.trace() : []});
  }, 100);
  run.stop = () => { run.on = false; capture.on = false; clearInterval(run.timer); for (const code of [...held]) press(code, false); scape.update = update; };
})`;

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
  await call('Page.addScriptToEvaluateOnNewDocument', {source: tap});
  await call('Page.navigate', {url: 'http://127.0.0.1:' + server.address().port + '/#world=' + options.world + '&launch=' + options.launch});
  await until(() => evaluate("document.readyState==='complete'&&typeof window.loadFlightRange==='function'"), 'loading the game');
  await evaluate("(()=>{document.body.classList.add('clearView');if(sound.title!=='Mute sound')sound.click();fly.click();})()");
  await until(() => evaluate("app.dataset.mode==='flight'&&!!window.aerieSoundscapeDebug&&!!window.__capture.context"), 'starting the flight with sound');
  if (options.perch) {
    await evaluate("document.getElementById('perchAction')?.click()");
    await until(() => evaluate("app.dataset.perch==='perched'"), 'landing on the perch', 150000);
    await delay(4000);                      // let the landing and its sounds finish
  }
  await evaluate(pilot + '(' + JSON.stringify(route) + ',' + JSON.stringify(keys) + ')');
  await delay(seconds * 1000);
  const run = await evaluate(`(() => { const r = window.__run; r.stop();
    return {rows: r.rows, frames: r.frames.slice(5), spent: r.spent, updates: r.updates, rate: __capture.rate, blocks: __capture.left.length}; })()`);
  await fs.mkdir(options.output, {recursive: true});

  // ---- the recording ------------------------------------------------------------
  let wav = null;
  if (!options['no-wav'] && run.blocks) {
    await evaluate(`(() => { const c = window.__capture, n = c.left.length * 4096, pcm = new Int16Array(n * 2);
      for (let b = 0; b < c.left.length; b++) for (let i = 0; i < 4096; i++) {
        pcm[(b * 4096 + i) * 2] = Math.max(-1, Math.min(1, c.left[b][i])) * 32767; pcm[(b * 4096 + i) * 2 + 1] = Math.max(-1, Math.min(1, c.right[b][i])) * 32767; }
      c.bytes = new Uint8Array(pcm.buffer); return c.bytes.length; })()`);
    const parts = [], slice = 3 << 20, total = run.blocks * 4096 * 4;
    for (let at = 0; at < total; at += slice)
      parts.push(Buffer.from(await evaluate(`(() => { const b = window.__capture.bytes.subarray(${at}, ${Math.min(total, at + slice)}); let s = '';
        for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768)); return btoa(s); })()`), 'base64'));
    const data = Buffer.concat(parts), header = Buffer.alloc(44);
    header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22); header.writeUInt32LE(run.rate, 24); header.writeUInt32LE(run.rate * 4, 28);
    header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(data.length, 40);
    wav = path.join(options.output, 'directional-sound.wav');
    await fs.writeFile(wav, Buffer.concat([header, data]));
  }

  // ---- what the trace shows -----------------------------------------------------
  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const sorted = run.frames.slice().sort((a, b) => a - b), frameMean = mean(run.frames), frame95 = sorted[Math.floor(sorted.length * .95)] || 0;
  const cost = run.updates ? run.spent / run.updates : 0;
  const sources = new Map();
  for (const row of run.rows) for (const s of row.sources) {
    const key = s.id || s.label + ' at ' + Math.round(s.x) + ',' + Math.round(s.z);
    const entry = sources.get(key) || sources.set(key, {label: s.label, follows: !!s.follows, x: s.x, y: s.y, z: s.z, first: row.t, last: row.t, open: [], lee: [], keptOpen: [], keptLee: [], near: Infinity, far: 0, moved: 0}).get(key);
    if (!s.follows) entry.moved = Math.max(entry.moved, Math.hypot(s.x - entry.x, s.y - entry.y, s.z - entry.z));
    if (!(s.arrived > 0)) continue;      // sounding, but too far to reach the eagle
    if (entry.near === Infinity) entry.first = row.t;
    entry.last = row.t; entry.near = Math.min(entry.near, s.distance); entry.far = Math.max(entry.far, s.distance);
    const sheltered = row.shelter > .6, exposed = row.shelter < .15;
    if (sheltered) { entry.lee.push(s.shield); if (s.arrived > 0) entry.keptLee.push(s.heard / s.arrived); }
    if (exposed) { entry.open.push(s.shield); if (s.arrived > 0) entry.keptOpen.push(s.heard / s.arrived); }
  }
  const open = run.rows.filter(r => r.shelter !== null && r.shelter < .15), lee = run.rows.filter(r => r.shelter > .6);
  const summary = {world: options.world, launch: options.launch, route, seconds, sampleRate: run.rate,
    frame: {meanMs: +frameMean.toFixed(2), p95Ms: +frame95.toFixed(2), count: run.frames.length},
    audioUpdate: {meanMs: +cost.toFixed(3), shareOfFrame: +(cost / (frameMean || 1)).toFixed(4), updates: run.updates},
    wind: {openSeconds: open.length / 10, leeSeconds: lee.length / 10, maskerOpen: +mean(open.map(r => r.masker)).toFixed(5), maskerLee: +mean(lee.map(r => r.masker)).toFixed(5),
      airspeedOpen: +mean(open.map(r => r.speed)).toFixed(1), airspeedLee: +mean(lee.map(r => r.speed)).toFixed(1)},
    sources: [...sources.entries()].filter(([, e]) => e.near < Infinity).map(([key, e]) => ({source: key, follows: e.follows, x: e.x, y: e.y, z: e.z, heardFrom: e.first, heardTo: e.last, nearest: e.near, farthest: e.far, moved: +e.moved.toFixed(2),
      screeningOpen: e.open.length ? +mean(e.open).toFixed(2) : null, screeningLee: e.lee.length ? +mean(e.lee).toFixed(2) : null,
      keptOpen: e.keptOpen.length ? +mean(e.keptOpen).toFixed(2) : null, keptLee: e.keptLee.length ? +mean(e.keptLee).toFixed(2) : null})),
    errors};
  await fs.writeFile(path.join(options.output, 'directional-sound.json'), JSON.stringify({summary, rows: run.rows}));
  console.log(`${options.world} ${options.launch}: ${seconds} s flown, ${open.length / 10} s in the open, ${lee.length / 10} s in the lee` + (wav ? `; recording ${wav}` : ''));
  console.log(`frame ${summary.frame.meanMs} ms mean, ${summary.frame.p95Ms} ms 95th percentile; audio update ${summary.audioUpdate.meanMs} ms a frame (${(100 * summary.audioUpdate.shareOfFrame).toFixed(1)}% of the frame)`);
  if (open.length && lee.length) console.log(`wind masker ${summary.wind.maskerOpen} in the open at ${summary.wind.airspeedOpen} m/s, ${summary.wind.maskerLee} in the lee at ${summary.wind.airspeedLee} m/s`);
  const through = summary.sources.filter(s => s.screeningOpen !== null && s.screeningLee !== null);
  const animals = summary.sources.filter(s => s.follows), fixed = summary.sources.filter(s => !s.follows && !/^move-/.test(s.source));
  console.log(`${summary.sources.length} sources traced: ${animals.length} visible animals followed as they moved, ${fixed.length} at fixed posts and sites, ` +
    `of which ${fixed.filter(s => s.moved > .5).length} changed place. ${through.length} were heard both in the open and in the lee:`);
  for (const s of through.sort((a, b) => (b.heardTo - b.heardFrom) - (a.heardTo - a.heardFrom)).slice(0, 14))
    console.log(`  ${s.source.padEnd(46)} ${String(s.heardFrom).padStart(5)}-${String(s.heardTo).padEnd(5)} s  ${String(s.nearest).padStart(4)}-${String(s.farthest).padEnd(4)} m  screening ${s.screeningOpen} open, ${s.screeningLee} lee  kept ${s.keptOpen ?? '-'} open, ${s.keptLee ?? '-'} lee`);
  if (errors.length) console.log('page errors:', errors.slice(0, 3));
} finally {
  socket?.close(); child.kill(); server.closeAllConnections(); server.close();
  for (let i = 0; i < 60 && child.exitCode === null && child.signalCode === null; i++) await delay(50);
  await fs.rm(profile, {recursive: true, force: true, maxRetries: 3, retryDelay: 250});
}
