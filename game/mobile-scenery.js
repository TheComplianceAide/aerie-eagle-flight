// Smaller color textures on touch-first devices; survey grids retain their native precision.
// Phone copies of at most 1024 px cover surface detail, aerial tiles and foliage atlases
// (each mipmapped, linearly filtered and never read back on the CPU), so the page and
// GPU processes fit in a phone tab. The eagle and wildlife keep full resolution.
// A phone on a weak signal can drop one of the ~100 range downloads, and a single
// network error ("Load failed" / "Failed to fetch") used to abort the whole launch.
// Same-site GET requests retry twice, after 0.6 s and 1.8 s, unless they were aborted.
(() => {
  const fetch0 = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input?.url || String(input), location.href);
    const method = (init?.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase();
    const retry = method === 'GET' && url.origin === location.origin;
    for (let attempt = 0; ; attempt++) {
      try { return await fetch0(input, init); }
      catch (error) {
        const aborted = error?.name === 'AbortError' || init?.signal?.aborted;
        if (!retry || aborted || attempt >= 2 || !(error instanceof TypeError)) throw error;
        await new Promise(resolve => setTimeout(resolve, attempt ? 1800 : 600));
      }
    }
  };
})();
// Three warns on every draw of a shader that needs more texture units than the GPU
// has (terrain shaders in several worlds; tracked separately). Thousands of identical
// warnings a second cost phones real CPU, so each distinct message is logged once.
(() => {
  const warn = console.warn.bind(console), seen = new Set();
  console.warn = (...args) => {
    const text = typeof args[0] === 'string' ? args[0] : '';
    if (text.startsWith('THREE.WebGLTextures: Trying to use')) {
      if (seen.has(text)) return;
      seen.add(text);
    }
    warn(...args);
  };
})();
(() => {
  // A planar lake mirror redraws the whole scene. On a phone it updates on every
  // other display frame at half resolution; the rippled water hides both.
  const phone = matchMedia('(pointer: coarse)').matches;
  let displayFrame = 0;
  if (phone) { const count = () => { displayFrame++; requestAnimationFrame(count); }; requestAnimationFrame(count); }
  window.aerieReflectionScale = phone ? .5 : 1;
  window.aerieSkipReflection = mirror => {
    if (!phone) return false;
    const last = mirror.userData.reflectedFrame;
    if (last !== undefined && displayFrame - last < 2 && displayFrame >= last) return true;
    mirror.userData.reflectedFrame = displayFrame;
    return false;
  };
  if (!phone) return;
  const variants = new Set([
    'alaska-evening.jpg',
    'acadia-night-sky.webp',
    'lofoten-dusk-sky.webp',
    'atlas-dixville-ranges.webp',
    'atlas-dixville-photo.webp',
    'atlas-dixville-detail.webp',
    'atlas-crater-photo.webp',
    'atlas-crater-sky.webp',
    'atlas-lofoten-photo.webp',
    'atlas-lofoten-sky.webp',
    'atlas-acadia-photo.webp',
    'atlas-acadia-detail.webp',
    'atlas-acadia-ranges.webp',
    'atlas-moosehead-detail.webp',
    'atlas-moosehead-photo.webp',
    'atlas-moosehead-sky.webp',
    'atlas-qwantani_sunrise_puresky.webp',
    'atlas-surry-city-detail.webp',
    'atlas-surry-detail.webp',
    'atlas-surry-photo.webp',
    'atlas-surry-sky.webp',
    'atlas-wasteland_clouds_puresky.webp',
    'atlas-winnipesaukee-detail.webp',
    'atlas-winnipesaukee-photo.webp',
    'atlas-winnipesaukee-sky.webp',
    'atlas-yosemite-detail.webp',
    'atlas-yosemite-photo.webp',
    'atlas-yosemite-sky.webp',
    'atlas-yosemite-west-face.webp',
    'atlas-yosemite-tunnel-walls.webp',
    'fir-crown.webp',
    'keene-downtown-ortho.webp',
    'sky.jpg',
    'winnipesaukee-alton-ortho.webp',
    'winnipesaukee-weirs-ortho.webp',
    'acadia-egg-west-front.webp',
    'alpine-0-0.jpg',
    'alpine-0-1.jpg',
    'alpine-0-2.jpg',
    'alpine-0-3.jpg',
    'alpine-1-0.jpg',
    'alpine-1-1.jpg',
    'alpine-1-2.jpg',
    'alpine-1-3.jpg',
    'alpine-2-0.jpg',
    'alpine-2-1.jpg',
    'alpine-2-3.jpg',
    'alpine-3-0.jpg',
    'alpine-3-1.jpg',
    'alpine-3-2.jpg',
    'alpine-3-3.jpg',
    'alpine-tundra.webp',
    'atlas-bedded-rock.webp',
    'atlas-jointed-relief.webp',
    'atlas-jointed-rock.webp',
    'atlas-surry-shore.webp',
    'building-comfy-cafe.webp',
    'building-decor-shop.webp',
    'canyon-overlook-strata.webp',
    'canyon-river-banks.webp',
    'canyon-scarp.webp',
    'cliff-strata-normal.jpg',
    'cliff-strata.jpg',
    'crater-caldera-field.webp',
    'dixville-ledge-surface.webp',
    'field-ground-scans.webp',
    'fir-distant.webp',
    'keene-colony-mansards.webp',
    'keene-colony-slate.webp',
    'labrador-otter-skin.webp',
    'landform-alaska-aerial.webp',
    'landform-kineo-aerial.webp',
    'landform-lily-aerial.webp',
    'landform-meredith-aerial.webp',
    'landform-spencer-aerial.webp',
    'landform-yosemite-falls-aerial.webp',
    'oeschinen-rowing-shore.webp',
    'regional-crowns.webp',
    'regional-growth-stands.webp',
    'shore-bark.webp',
    'shore-cobble.webp',
    'shore-meadow.webp',
    'shore-pebbles-normal.webp',
    'shore-pebbles.webp',
    'shore-sand.webp',
    'survey-normals.jpg',
    'swiss-karst-light.webp',
    'understory-leaves.webp',
    'understory-stands.webp',
    'winnipesaukee-rattlesnake-bank.webp'
  ]);
  // A phone draws at most about 1500 device pixels across, so an image texture
  // larger than 2048 px is only ever sampled from its second mip level down.
  // Dropping that unseen top level on load cuts its GPU memory by three
  // quarters. Textures without mipmaps (survey grids, coded masks) keep every pixel.
  const limit = 2048;
  const mipmapped = t => t.generateMipmaps !== false &&
    [THREE.LinearMipmapLinearFilter, THREE.LinearMipmapNearestFilter,
     THREE.NearestMipmapLinearFilter, THREE.NearestMipmapNearestFilter].includes(t.minFilter);
  function shrink(texture) {
    const image = texture.image, w = image?.naturalWidth || image?.width, h = image?.naturalHeight || image?.height;
    if (!w || !h || Math.max(w, h) <= limit || !mipmapped(texture)) return;
    // A 2D canvas premultiplies alpha, which would erase the colour under any
    // transparent or masked pixel. Images that use alpha keep their full size.
    const probe = document.createElement('canvas'), side = 256;
    probe.width = probe.height = side;
    const look = probe.getContext('2d', {willReadFrequently: true});
    if (!look) return;
    look.drawImage(image, 0, 0, side, side);
    const alpha = look.getImageData(0, 0, side, side).data;
    for (let i = 3; i < alpha.length; i += 4) if (alpha[i] < 255) return;
    const scale = limit / Math.max(w, h);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale)); canvas.height = Math.max(1, Math.round(h * scale));
    const pen = canvas.getContext('2d');
    if (!pen) return;
    pen.imageSmoothingQuality = 'high';
    pen.drawImage(image, 0, 0, canvas.width, canvas.height);
    texture.image = canvas;
    texture.needsUpdate = true;
  }
  const load = THREE.TextureLoader.prototype.load;
  THREE.TextureLoader.prototype.load = function (url, onLoad, onProgress, onError) {
    return load.call(this, url, texture => {
      onLoad?.(texture);
      try { shrink(texture); } catch (error) { console.warn('Aerie kept a full-size texture', url, error); }
    }, onProgress, onError);
  };
  const offlineURL = window.aerieAssetURL;
  THREE.DefaultLoadingManager.setURLModifier(name => {
    const path = variants.has(name) ? 'mobile/' + name : name;
    return offlineURL ? offlineURL(path) : path;
  });
})();
