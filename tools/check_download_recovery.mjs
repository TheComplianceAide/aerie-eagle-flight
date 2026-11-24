// Replays, in a real Chrome with a real disk cache, the fault that made launches fail
// with "Unable to start flight" on 2026-11-24, and requires game/download-recovery.js
// to get a picture, a data file and a script through it.
//
// The local server here stands in for the production host and answers as that host was
// measured to answer (curl against the live site, same day):
//   - every file carries one validator, which changes with each release;
//   - "Range: bytes=N-N" with the current validator in If-Range gets a correct 206;
//   - the same request with an earlier release's validator gets status 200 and a body
//     of one byte, the first byte of the file.
// Chrome sends exactly that one-byte request to check a half-downloaded copy, then
// stores the one-byte answer as the whole file and reuses it on every later visit.
//
//   node tools/check_download_recovery.mjs [--chrome /path/to/chrome]
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const {values: options} = parseArgs({options: {
  chrome: {type: 'string', default: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}
}});
const game = new URL('../game/', import.meta.url);
const recovery = await fs.readFile(new URL('download-recovery.js', game), 'utf8');
const image = await fs.readFile(new URL('field-ground-scans.webp', game));
const files = {
  '/big.webp': ['image/webp', image],
  '/data.bin': ['application/octet-stream', image],
  '/code.js': ['text/javascript', Buffer.from('/* ' + 'x'.repeat(400000) + ' */\nwindow.codeRan = true;\n')]
};
// The page asks for its three files the way the game does: a detached picture element
// with listeners added before its address (three.js textures), fetch (surveys), and a
// script element with onload and onerror (the range loader).
const page = recovering => `<!doctype html><meta charset=utf-8><title>check</title><script>${recovering ? recovery : ''}</script><script>
window.result={picture:'pending',data:'pending',script:'pending'};
const i=document.createElementNS('http://www.w3.org/1999/xhtml','img');
i.addEventListener('load',()=>{result.picture='ok'},false);i.addEventListener('error',()=>{result.picture='failed'},false);
i.crossOrigin='anonymous';i.src='big.webp';
fetch('data.bin').then(async r=>{const b=await r.arrayBuffer();result.data=b.byteLength===${image.length}?'ok':'wrong size '+b.byteLength}).catch(()=>{result.data='failed'});
const t=document.createElement('script');t.onload=()=>{result.script=window.codeRan?'ok':'did not run'};t.onerror=()=>{result.script='failed'};
t.src='code.js';document.head.appendChild(t);
</script>`;

let release = 1000, oneByteAnswers = 0;
const cut = new Map();
const host = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://host');
  if (url.pathname === '/page.html') {
    response.writeHead(200, {'Content-Type': 'text/html', 'Cache-Control': 'no-store'});
    response.end(page(!url.searchParams.has('old'))); return;
  }
  if (!files[url.pathname]) { response.writeHead(404); response.end(); return; }
  const [type, bytes] = files[url.pathname], etag = `"${release}"`, asked = request.headers;
  const headers = {'Content-Type': type, 'ETag': etag, 'Last-Modified': new Date(1.7e12 + release * 1e6).toUTCString(),
    'Accept-Ranges': 'bytes', 'Cache-Control': 'public, must-revalidate, max-age=1'};
  if (asked['if-none-match'] === etag && !asked.range) { response.writeHead(304, headers); response.end(); return; }
  const range = /^bytes=(\d+)-(\d*)$/.exec(asked.range || '');
  if (range) {
    const start = +range[1], end = range[2] === '' ? bytes.length - 1 : Math.min(+range[2], bytes.length - 1), length = end - start + 1;
    if (!asked['if-range'] || asked['if-range'] === etag) {
      response.writeHead(206, {...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': length});
      response.end(bytes.subarray(start, end + 1)); return;
    }
    // The host's fault.
    if (length === 1) oneByteAnswers++;
    response.writeHead(200, {...headers, 'Content-Length': length}); response.end(bytes.subarray(0, length)); return;
  }
  response.writeHead(200, {...headers, 'Content-Length': bytes.length});
  if (!cut.has(url.pathname)) { response.end(bytes); return; }
  // A download cut short part-way, as when the tab closes.
  const sent = cut.get(url.pathname); cut.delete(url.pathname);
  response.write(bytes.subarray(0, sent), () => setTimeout(() => response.destroy(), 150));
});
await new Promise(resolve => host.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + host.address().port;

const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'aerie-download-recovery-'));
const chrome = spawn(options.chrome, ['--headless=new', '--mute-audio', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
  '--user-data-dir=' + profile, '--disable-component-update', '--disable-background-networking', '--disable-sync', '--no-pings',
  '--disk-cache-size=52428800', '--disable-features=OptimizationGuideModelDownloading,OptimizationHintsFetching,MediaRouter,Translate', 'about:blank'], {stdio: 'ignore'});
const until = async (test, what, limit = 60000) => {
  const start = Date.now();
  while (Date.now() - start < limit) { const value = await test(); if (value) return value; await delay(100); }
  throw Error('Timed out while ' + what);
};
let failure = null;
try {
  const port = await until(async () => { try { return (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; } catch { return false; } }, 'starting Chrome');
  const target = await (await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', {method: 'PUT'})).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let serial = 0; const pending = new Map();
  socket.onmessage = ({data}) => {
    const message = JSON.parse(data), waiting = pending.get(message.id);
    if (!waiting) return;
    pending.delete(message.id);
    message.error ? waiting.reject(Error(message.error.message)) : waiting.resolve(message.result);
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++serial; pending.set(id, {resolve, reject}); socket.send(JSON.stringify({id, method, params})); });
  const evaluate = async expression => (await call('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true})).result.value;
  await call('Runtime.enable'); await call('Page.enable');
  const visit = async old => {
    await call('Page.navigate', {url: origin + '/page.html' + (old ? '?old=1' : '')});
    const result = await until(async () => {
      const text = await evaluate('JSON.stringify(window.result||null)');
      return text && text !== 'null' && !text.includes('pending') ? JSON.parse(text) : false;
    }, 'loading the page');
    await call('Page.navigate', {url: 'about:blank'});
    await delay(1500); // past the stored copies' one second of freshness
    return result;
  };
  const interrupt = async () => {
    await call('Network.clearBrowserCache');
    for (const [name, [, bytes]] of Object.entries(files)) cut.set(name, Math.min(1000000, bytes.length >> 1));
    assert.deepEqual(await visit(true), {picture: 'failed', data: 'failed', script: 'failed'}, 'The interrupted downloads should fail once');
  };
  const good = {picture: 'ok', data: 'ok', script: 'ok'};
  await call('Network.enable');

  // The fault itself, without the recovery: broken until the release after next.
  await interrupt(); release++;
  const broken = {picture: 'failed', data: 'wrong size 1', script: 'did not run'};
  assert.deepEqual(await visit(true), broken, 'The stand-in host no longer reproduces the fault');
  assert.deepEqual(await visit(true), broken, 'The one-byte copies should be reused on the next visit');
  assert.equal(oneByteAnswers, 3, 'Chrome should have checked each half copy with a one-byte request');
  // A browser already holding those broken copies is repaired by the first visit with the recovery.
  assert.deepEqual(await visit(false), good, 'Stored one-byte copies were not repaired');
  assert.deepEqual(await visit(false), good, 'The repair did not last');

  // Half copies, a release, then the game with the recovery: nobody sees a failure.
  await interrupt(); release++; oneByteAnswers = 0;
  assert.deepEqual(await visit(false), good, 'Half copies checked after a release were not recovered');
  assert.equal(oneByteAnswers, 3, 'The second replay did not go through the fault');
  assert.deepEqual(await visit(false), good, 'The recovery did not last');

  // A plain dropped download of a picture or script is recovered on the spot.
  await call('Network.clearBrowserCache');
  cut.set('/big.webp', 1000000); cut.set('/code.js', 200000);
  assert.deepEqual(await visit(false), good, 'A dropped picture or script download was not retried');
  socket.close();
  console.log('Download recovery verified in Chrome: half-downloaded and one-byte copies of a picture, a data file and a script all recover.');
} catch (error) { failure = error; }
finally {
  chrome.kill(); host.close(); await delay(400);
  await fs.rm(profile, {recursive: true, force: true, maxRetries: 3, retryDelay: 250}).catch(() => {});
}
if (failure) { console.error(failure); process.exitCode = 1; }
