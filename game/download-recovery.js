// A download can be cut short: the tab closes while a range is loading, or the signal
// drops. The browser keeps the part it received and on the next visit asks the host
// whether that part is still current. After a new release the production host answers
// that question wrongly: it replies "200, here is the file" and sends one byte. The
// browser stores the byte as the whole file, and the same picture or survey then fails
// on every launch until the release after that. (Measured against the host and
// reproduced in Chrome on 2026-11-24; tools/check_download_recovery.mjs replays it.)
// A phone on a weak signal can also simply drop one of the ~100 range downloads. Either
// way one bad download used to abort the launch with "Unable to start flight".
//
// Same-site downloads now recover by themselves. A request that fails, or that is
// answered with the one-byte file, is made again past the browser's stored copy, which
// also replaces the bad copy for later visits. A picture or script element that fails
// is fetched afresh in the same way and then given one more try before anyone hears of it.
(() => {
  // The offline page carries its files inside itself.
  if (location.protocol === 'file:') return;
  const fetch0 = window.fetch.bind(window);
  const sameSite = address => {
    try { return new URL(address, location.href).origin === location.origin; } catch { return false; }
  };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  // The host's wrong answer to a resumed download. No file of the game is one byte long.
  const stub = response => response.status === 200 && response.headers.get('content-length') === '1';
  window.fetch = async (input, init) => {
    const address = typeof input === 'string' ? input : input?.url || String(input);
    const method = (init?.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase();
    const ours = method === 'GET' && sameSite(address);
    for (let attempt = 0; ; attempt++) {
      try {
        // A second and third request skip the stored copy and overwrite it.
        const response = await fetch0(input, attempt ? {...init, cache: 'reload'} : init);
        if (!ours || attempt >= 2 || !stub(response)) return response;
      } catch (error) {
        const aborted = error?.name === 'AbortError' || init?.signal?.aborted;
        if (!ours || aborted || attempt >= 2 || !(error instanceof TypeError)) throw error;
        await wait(attempt ? 1800 : 600);
      }
    }
  };

  // Pictures and scripts are requested by their elements, not by fetch. Each element made
  // by script gets this listener before the code that made it can add its own, so a first
  // failure can be put right without that code noticing.
  const tried = new WeakSet();
  const refresh = address => fetch0(address, {cache: 'reload', signal: AbortSignal.timeout?.(60000)})
    .then(response => response.blob()).catch(() => {});
  function recover(event) {
    const node = event.currentTarget, address = node.currentSrc || node.src;
    if (tried.has(node) || !address || !sameSite(address)) return;
    if (event.type === 'load') {
      // A script that arrived as the one-byte file "loads" without running.
      const record = performance.getEntriesByName(address).pop();
      if (!record || record.decodedBodySize !== 1) return;
    }
    tried.add(node);
    event.stopImmediatePropagation();
    refresh(address).then(() => {
      if (node instanceof HTMLImageElement) { node.src = address; return; }
      // A script element loads once, so a twin stands in and reports back to the original.
      const twin = document.createElement('script');
      tried.add(twin);
      for (const {name, value} of node.attributes) twin.setAttribute(name, value);
      twin.addEventListener('load', () => node.dispatchEvent(new Event('load')));
      twin.addEventListener('error', () => node.dispatchEvent(new Event('error')));
      (node.parentNode || document.head).appendChild(twin);
    });
  }
  const watch = node => {
    if (node instanceof HTMLImageElement || node instanceof HTMLScriptElement) node.addEventListener('error', recover);
    if (node instanceof HTMLScriptElement) node.addEventListener('load', recover);
    return node;
  };
  for (const name of ['createElement', 'createElementNS']) {
    const make = document[name].bind(document);
    document[name] = (...description) => watch(make(...description));
  }
  const Picture = window.Image;
  window.Image = function Image(...size) { return watch(new Picture(...size)); };
  window.Image.prototype = Picture.prototype;
})();
