// Keep the original terrain samples addressable on 16-unit WebGL2 renderers.
// Repeat maps share a hardware array; each layer gets its own mip chain.
(() => {
  const atlasRock = [['rockScan', 'fracture']];
  const layersByWorld = {
    alaska: [['ridgeRock', 'ridgeNormal', 'snow']],
    swiss: [['stone', 'normalMap'], ['strata', 'strataNormal']],
    canyon: [['sand', 'pebbles', 'pebbleNormal']],
    moosehead: atlasRock, yosemite: atlasRock, dixville: atlasRock, surry: atlasRock,
    acadia: [], winnipesaukee: [], labrador: []
  };

  // Three reads image.data when uploading, including after a context restore.
  // Retain the decoded originals and release the extra packed CPU copy after each upload.
  function uploadPixels(texture, makePixels) {
    let pending;
    Object.defineProperty(texture.image, 'data', {
      enumerable: true,
      get() { return pending ??= makePixels(); }
    });
    texture.onUpdate = () => { pending = null; };
    texture.needsUpdate = true;
    return texture;
  }

  function repeatPixels(textures, width, height) {
    const bytes = new Uint8Array(width * height * 4 * textures.length);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    for (const [layer, texture] of textures.entries()) {
      const image = texture.image;
      if (width % image.width || height % image.height) throw new Error('Incompatible terrain repeat periods');
      canvas.width = image.width;
      canvas.height = image.height;
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
      const length = image.width * 4;
      for (let y = 0; y < height; y++) {
        const row = y % image.height;
        const start = (texture.flipY ? image.height - row - 1 : row) * length;
        const scanline = pixels.subarray(start, start + length);
        for (let x = 0; x < width; x += image.width) {
          bytes.set(scanline, ((layer * height + y) * width + x) * 4);
        }
      }
    }
    return bytes;
  }

  function repeatLayers(T, textures) {
    const width = Math.max(...textures.map(t => t.image.width));
    const height = Math.max(...textures.map(t => t.image.height));
    const result = new T.DataArrayTexture(null, width, height, textures.length);
    const first = textures[0];
    result.wrapS = first.wrapS;
    result.wrapT = first.wrapT;
    result.magFilter = first.magFilter;
    result.minFilter = first.minFilter;
    result.anisotropy = first.anisotropy;
    result.colorSpace = first.colorSpace;
    result.generateMipmaps = first.generateMipmaps;
    return uploadPixels(result, () => repeatPixels(textures, width, height));
  }

  // The red crown field is mipmapped. The independent green cover survey
  // occupies its native lower-left rectangle and always uses level zero.
  function forestPixels({data, width, height}, field) {
    const bytes = new Uint8Array(width * height * 2);
    for (let i = 0; i < data.length; i++) bytes[i * 2] = data[i];
    for (let y = 0; y < field.height; y++) {
      for (let x = 0; x < field.width; x++) bytes[(y * width + x) * 2 + 1] = field.data[y * field.width + x];
    }
    return bytes;
  }

  function forestFields(T, [shadow, cover]) {
    const {width, height} = shadow.image;
    const result = new T.DataTexture(null, width, height, T.RGFormat);
    result.minFilter = shadow.minFilter;
    result.magFilter = shadow.magFilter;
    result.generateMipmaps = shadow.generateMipmaps;
    return uploadPixels(result, () => forestPixels(shadow.image, cover.image));
  }

  function prepare(T, renderer, scene, region) {
    const groups = layersByWorld[region];
    if (!groups || !renderer.capabilities.isWebGL2 || renderer.capabilities.maxTextures > 16) return;
    const packed = [];
    function shared(textures, build) {
      // Cloned terrain materials share decoded image sources and sampler settings.
      const sources = textures.map(t => t.source);
      const prior = packed.find(p => p.build === build && p.sources.length === sources.length &&
        sources.every((source, i) => p.sources[i] === source));
      if (prior) return prior.texture;
      const texture = build(T, textures);
      packed.push({sources, build, texture});
      return texture;
    }
    const materials = new Set();
    scene.traverse(object => {
      if (Array.isArray(object.material)) object.material.forEach(m => materials.add(m));
      else if (object.material) materials.add(object.material);
    });
    for (const material of materials) {
      const uniforms = material.uniforms;
      if (!uniforms || !material.fragmentShader) continue;
      let shader = material.fragmentShader;
      let helpers = '';
      for (const names of groups) {
        if (!names.every(name => uniforms[name]?.value?.image && shader.includes('texture2D(' + name + ','))) continue;
        const textures = names.map(name => uniforms[name].value);
        const array = shared(textures, repeatLayers);
        const uniform = 'terrainLayers_' + names[0];
        uniforms[uniform] = {value: array};
        helpers += 'uniform highp sampler2DArray ' + uniform + ';\n';
        names.forEach((name, layer) => {
          const sample = 'sampleTerrain_' + name;
          const {width, height} = textures[layer].image;
          // A smaller repeating source tiles across its layer without resizing.
          const scale = 'vec2(' + (width / array.image.width).toFixed(8) + ',' + (height / array.image.height).toFixed(8) + ')';
          helpers += 'vec4 ' + sample + '(vec2 uv){return texture(' + uniform + ',vec3(uv*' + scale + ',' + layer + '.));}\n';
          shader = shader.replaceAll('texture2D(' + name + ',', sample + '(');
        });
      }
      const shadow = uniforms.crownShadowField?.value, cover = uniforms.canopyMap?.value;
      if (shadow && cover && shader.includes('texture2D(canopyMap,')) {
        uniforms.terrainForestFields = {value: shared([shadow, cover], forestFields)};
        const size = 'vec2(' + cover.image.width + '.,' + cover.image.height + '.)';
        const full = 'vec2(' + shadow.image.width + '.,' + shadow.image.height + '.)';
        helpers += 'uniform sampler2D terrainForestFields;\nvec4 sampleTerrainCover(vec2 uv){' +
          'vec2 pixel=clamp(uv*' + size + ',vec2(.5),' + size + '-.5);' +
          'return vec4(textureLod(terrainForestFields,pixel/' + full + ',0.).g);}\n';
        shader = shader.replaceAll('texture2D(crownShadowField,', 'texture2D(terrainForestFields,')
                       .replaceAll('texture2D(canopyMap,', 'sampleTerrainCover(');
      }
      if (helpers) {
        material.fragmentShader = helpers + shader;
        material.needsUpdate = true;
      }
    }
  }

  window.prepareTerrainTextures = prepare;
})();
