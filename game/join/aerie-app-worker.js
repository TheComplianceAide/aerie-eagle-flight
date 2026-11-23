// Only the return page gets an offline response. Payment, access checks and world
// downloads always go directly to their servers.
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.mode !== 'navigate' || request.method !== 'GET' ||
      url.origin !== self.location.origin || url.pathname !== '/join/') return;
  event.respondWith(fetch(request).catch(() => new Response(
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Aerie · Offline</title><body style="background:#142b25;color:#faf1da;font:18px system-ui;padding:12vh 8vw">' +
    '<h1>Aerie is offline</h1><p>Reconnect to open your ticket and fly.</p>' +
    '<button style="font:inherit;padding:.6em 1em" onclick="location.reload()">Try again</button></body></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  )));
});
