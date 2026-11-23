// Smaller color textures on touch-first devices; survey grids retain their native precision.
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
    'winnipesaukee-weirs-ortho.webp'
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
