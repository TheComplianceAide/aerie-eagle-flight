// Verify retained terrain detail and reupload behavior on a 16-sampler renderer.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const T = require('../game/three.min.js');

let readbacks = 0;
const window = {};
const document = {
  createElement(name) {
    assert.equal(name, 'canvas');
    let image;
    return {getContext: () => ({
      drawImage(input) { image = input; },
      getImageData() { readbacks++; return {data: image.rgba}; }
    })};
  }
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game/terrain-textures.js'), 'utf8'), {window, document});
const gpu = {capabilities: {isWebGL2: true, maxTextures: 16}};
function repeatImage(width, height, index) {
  const rgba = Uint8Array.from({length: width * height * 4}, (_, i) => index + Math.floor(i / 4));
  const t = new T.Texture({width, height, rgba});
  t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}
function sceneWith(textures) {
  const scene = new T.Scene();
  const uniforms = Object.fromEntries(Object.entries(textures).map(([key, value]) => [key, {value}]));
  const samples = Object.keys(textures).map(key => 'texture2D(' + key + ',uv)');
  const material = new T.ShaderMaterial({uniforms, fragmentShader: samples.join('+')});
  scene.add(new T.Mesh(undefined, material));
  return {scene, material};
}

const textures = {ridgeRock: repeatImage(2, 2, 10), ridgeNormal: repeatImage(2, 2, 20), snow: repeatImage(1, 1, 30)};
const alaska = sceneWith(textures);
window.prepareTerrainTextures(T, {capabilities: {isWebGL2: true, maxTextures: 32}}, alaska.scene, 'alaska');
assert.equal(alaska.material.uniforms.terrainLayers_ridgeRock, undefined);
window.prepareTerrainTextures(T, gpu, alaska.scene, 'alaska');
const array = alaska.material.uniforms.terrainLayers_ridgeRock.value;
assert.equal(array.image.depth, 3);
assert.match(alaska.material.fragmentShader, /vec2\(0\.50000000,0\.50000000\),2\./);
assert.equal(readbacks, 0);
const pixels = array.image.data;
assert.deepEqual([...pixels.filter((_, i) => i % 4 === 0)], [12, 13, 10, 11, 22, 23, 20, 21, 30, 30, 30, 30]);
assert.equal(array.image.data, pixels);
array.onUpdate();
const restored = array.image.data;
assert.notEqual(restored, pixels);
assert.deepEqual(restored, pixels);
assert.equal(readbacks, 6);

const crown = new T.DataTexture(Uint8Array.of(1, 2, 3, 4), 2, 2, T.RedFormat);
const cover = new T.DataTexture(Uint8Array.of(77), 1, 1, T.RedFormat);
const lake = sceneWith({crownShadowField: crown, canopyMap: cover});
window.prepareTerrainTextures(T, gpu, lake.scene, 'labrador');
assert.deepEqual([...lake.material.uniforms.terrainForestFields.value.image.data], [1, 77, 2, 0, 3, 0, 4, 0]);
assert.match(lake.material.fragmentShader, /textureLod\(terrainForestFields,pixel\/vec2\(2\.,2\.\),0\.\)\.g/);
console.log('Terrain texture packing preserves texels, image orientation, repeat scale and context reuploads.');
