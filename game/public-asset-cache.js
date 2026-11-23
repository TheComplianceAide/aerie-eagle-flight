(() => {
  'use strict';

  const assets = /* immutable public files */ {};
  if (!Object.keys(assets).length || location.protocol === 'file:') return;

  const resolve = window.aerieAssetURL;
  window.aerieAssetURL = name => {
    const path = resolve?.(name) || name;
    return Object.hasOwn(assets, path) ? assets[path] : path;
  };
  THREE.DefaultLoadingManager.setURLModifier(window.aerieAssetURL);
})();
