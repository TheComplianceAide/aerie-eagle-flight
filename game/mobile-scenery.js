// Smaller color textures on touch-first devices; survey grids retain their native precision.
(() => {
  if (!matchMedia('(pointer: coarse)').matches) return;
  const variants = new Set([
    'alaska-evening.jpg',
    'atlas-bryce-detail.webp',
    'atlas-bryce-photo.webp',
    'atlas-bryce-sky.webp',
    'atlas-crater-photo.webp',
    'atlas-crater-sky.webp',
    'atlas-lofoten-photo.webp',
    'atlas-lofoten-sky.webp',
    'atlas-milford-photo.webp',
    'atlas-milford-sky.webp',
    'atlas-moosehead-detail.webp',
    'atlas-moosehead-photo.webp',
    'atlas-moosehead-sky.webp',
    'atlas-napali-photo.webp',
    'atlas-napali-sky.webp',
    'atlas-qwantani_sunrise_puresky.webp',
    'atlas-surry-city-detail.webp',
    'atlas-surry-detail.webp',
    'atlas-surry-photo.webp',
    'atlas-surry-ranges.webp',
    'atlas-surry-sky.webp',
    'atlas-wasteland_clouds_puresky.webp',
    'atlas-winnipesaukee-detail.webp',
    'atlas-winnipesaukee-photo.webp',
    'atlas-winnipesaukee-sky.webp',
    'atlas-yosemite-photo.webp',
    'atlas-yosemite-sky.webp',
    'atlas-yosemite-west-face.webp',
    'canyon-horizon.webp',
    'fir-crown.webp',
    'keene-downtown-ortho.webp',
    'sky.jpg',
    'winnipesaukee-alton-ortho.webp',
    'winnipesaukee-weirs-ortho.webp'
  ]);
  const offlineURL = window.aerieAssetURL;
  THREE.DefaultLoadingManager.setURLModifier(name => {
    const path = variants.has(name) ? 'mobile/' + name : name;
    return offlineURL ? offlineURL(path) : path;
  });
})();
