/* Register one source-bounded field with the stock material and canopy engines. */
(() => {
  const frames = {
    canyon:[32612,454517,4081578],
    crater:[32610,571464,4755190],
    dixville:[32619,318030,4970779],
    labrador:[32619,535259,5621856],
    moosehead:[32619,442772,5060090],
    surry:[32618,720171,4761465],
    swiss:[2056,2622000,1150000],
    winnipesaukee:[32619,314043,4827803],
    yosemite:[32611,268678,4179436]
  };
  const pigmentShader = `
    uniform sampler2D geodataRGB;
    uniform vec4 geodataRect;
    vec3 geodataPigment(vec3 original,vec2 point,float protection) {
      vec2 edge=min(point-geodataRect.xy,geodataRect.zw-point);
      float boundary=smoothstep(24.,160.,min(edge.x,edge.y));
      if(boundary<.001 || protection<.001)return original;
      vec2 uv=(point-geodataRect.xy)/(geodataRect.zw-geodataRect.xy);
      vec4 sampleRGB=texture2D(geodataRGB,uv);
      float weight=step(.19,sampleRGB.a)*(1.-step(.59,sampleRGB.a))*.25*boundary*protection;
      float source=max(.045,dot(sampleRGB.rgb,vec3(.24,.62,.14)));
      float level=max(.045,dot(original,vec3(.24,.62,.14)));
      vec3 chroma=clamp(sampleRGB.rgb/source,vec3(.75),vec3(1.26));
      return mix(original,level*chroma,weight);
    }
  `;

  function pigmentFromBytes(red, green, blue) {
    const light = .24 * red + .62 * green + .14 * blue;
    if (light < 12) return null;
    return [red, green, blue].map(value => Math.max(.9, Math.min(1.1, .64 + .36 * value / light)));
  }
  window.aerieCanopyPigment = pigmentFromBytes;

  window.prepareSpectralGeodata = async (T, region, read, maxTexture) => {
    const file = 'geodata/' + region + '-spectral';
    const meta = await read.json(file + '.json');
    const {width, height, step, epsg, origin, bounds} = meta;
    const [projection, east, north] = frames[region];
    if (meta.schema !== 1 || meta.world !== region || epsg !== projection ||
        origin[0] !== east || origin[1] !== north) throw new Error('Wrong spectral field registration');
    const [left, top, right, bottom] = bounds;
    if (step !== 20 || !bounds.every(Number.isFinite) ||
        !Number.isInteger(width) || !Number.isInteger(height) ||
        width < 1 || height < 1 || width * height > 1_500_000 ||
        width > maxTexture || height > maxTexture ||
        width * step !== right - left || height * step !== bottom - top) {
      throw new Error('Invalid spectral field dimensions');
    }
    const bytes = await read.gzip(file + '.bin', width * height * 4);
    if (bytes.byteLength !== width * height * 4) throw new Error('Invalid spectral field length');

    function index(x, z) {
      const col = Math.floor((x - left) / step);
      const row = Math.floor((z - top) / step);
      if (col < 0 || col >= width || row < 0 || row >= height) return -1;
      return (row * width + col) * 4;
    }
    const red = offset => bytes[offset] >>> 3;
    const green = offset => ((bytes[offset] & 7) << 2) | (bytes[offset + 1] >>> 6);
    const blue = offset => (bytes[offset + 1] >>> 1) & 31;
    let texture = null;
    return {
      meta,
      sample(x, z) {
        const offset = index(x, z);
        if (offset < 0 || bytes[offset + 2] !== 1) return null;
        const height = bytes[offset + 3];
        return {height:height >= 4 && height < 255 ? height : 0,
          tint:pigmentFromBytes(red(offset)*8,green(offset)*8,blue(offset)*8)};
      },
      ground(material, hook, variables) {
        if (!material.fragmentShader.includes(hook)) throw new Error('Stock spectral color hook is absent');
        if (!texture) {
          const rgba = new Uint8Array(bytes.length);
          for (let offset=0; offset<bytes.length; offset+=4) {
            rgba[offset] = Math.round(red(offset) * 255 / 31);
            rgba[offset+1] = Math.round(green(offset) * 255 / 31);
            rgba[offset+2] = Math.round(blue(offset) * 255 / 31);
            rgba[offset+3] = Math.min(255, bytes[offset+2] * 64);
          }
          texture = new T.DataTexture(rgba, width, height, T.RGBAFormat);
          texture.flipY = false;
          texture.needsUpdate = true;
        }
        material.uniforms.geodataRect = {value:new T.Vector4(...bounds)};
        material.uniforms.geodataRGB = {value:texture};
        const {color, point, protection} = variables;
        material.fragmentShader = pigmentShader + material.fragmentShader.replace(
          hook, color + '=geodataPigment(' + color + ',' + point + ',' + protection + ');\n' + hook);
      }
    };
  };
})();
