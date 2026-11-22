// Each renderer supplies the actual water geometry and contact conditions.
(() => {
  let registry, current;
  const asset = name => window.aerieAssetURL?.(name) || name;

  async function fetchAsset(name) {
    const response = await fetch(asset(name));
    if (!response.ok) throw Error('Unable to load ' + name);
    return response;
  }

  async function readPixels(name) {
    const blob = await (await fetchAsset(name)).blob();
    const bitmap = await createImageBitmap(blob, {colorSpaceConversion:'none', premultiplyAlpha:'none'});
    const {width, height} = bitmap;
    const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(width,height) : document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', {willReadFrequently:true});
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return {width,height,rgba:ctx.getImageData(0,0,width,height).data};
  }

  async function prepare(region, supported) {
    if (!supported) {current=null;return;}
    if (current?.region === region) return;
    current = null;
    try {
      registry ??= await (await fetchAsset('water-opacity-registry.json')).json();
      const family = registry.pages[region] ? region : 'freshwater';
      const page = registry.pages[family];
      const packed = page.storage === 'bank-alpha';
      const [masks, native] = await Promise.all([
        readPixels(page.file), packed ? readPixels('canyon-surveyed-banks.png') : null
      ]);
      if (masks.width !== page.size[0] || masks.height !== page.size[1]) throw Error('Invalid opacity atlas dimensions');
      const {width, height} = native || masks;
      const bytes = new Uint8Array(width*height*(packed ? 4 : 1));
      if (packed) {
        // Preserve the measured RGB and its sampler. Only the unused bank
        // alpha gains contents. Row order matches the native image upload.
        if (width < masks.width || height < masks.height) throw Error('Water opacity atlas outgrew the bank field');
        for (let y=0;y<height;y++) {
          const row = y*width*4;
          const dest = (height-1-y)*width*4;
          bytes.set(native.rgba.subarray(row,row+width*4),dest);
          for (let x=0;x<width;x++) {
            bytes[dest+x*4+3] = x<masks.width&&y<masks.height ? masks.rgba[(y*masks.width+x)*4] : 0;
          }
        }
      } else {
        for (let i=0;i<bytes.length;i++) bytes[i] = masks.rgba[i*4];
      }
      current = {region,family,page,packed,width,height,bytes,texture:null};
    } catch (error) {
      // These are appearance assets. Keep the region playable if unavailable.
      console.warn('Using native water appearance.', error);
    }
  }

  function bind(T, uses, withSite=false) {
    if (!current) return null;
    const {page,packed,width,height,bytes,family,region} = current;
    const choices = {}, siteChoices = {};
    const allowed = registry.worlds[family];
    const tokens = ids => 'vec4('+ids.map(id=>page.slots[id]+'.').join(',')+')';
    for (const name of uses) {
      if (!allowed.includes(name)) continue;
      const ids = registry.selectors[name].variants.slice(0,4);
      const overrides = withSite ? registry.photoOverrides[region]?.[name] : null;
      choices[name] = tokens(ids);
      if (overrides?.length) siteChoices[name] = tokens([...overrides,...ids].slice(0,4));
    }
    if (!Object.keys(choices).length) return null;
    let {texture} = current;
    if (!texture) {
      texture = new T.DataTexture(bytes,width,height,packed?T.RGBAFormat:T.RedFormat,T.UnsignedByteType);
      texture.colorSpace=T.NoColorSpace;
      texture.generateMipmaps=packed;
      texture.minFilter=packed?T.LinearMipmapLinearFilter:T.LinearFilter;
      texture.magFilter=T.LinearFilter;
      texture.needsUpdate=true;
      current.texture=texture;
    }
    const shader=`
      #ifndef AERIE_WA_SHADER
      #define AERIE_WA_SHADER
      uniform sampler2D ${packed?'bankMap':'waOpacity'};
      float waHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float waSlot(vec4 set,float choice){
        if(choice<.25)return set.x;if(choice<.5)return set.y;
        return choice<.75?set.z:set.w;
      }
      vec2 waCell(vec2 uv,vec4 set,float eventSeed){
        float slot=waSlot(set,eventSeed);
        if(min(uv.x,uv.y)<0.||max(uv.x,uv.y)>1.)return vec2(0.,slot);
        vec2 cell=vec2(mod(slot,8.),floor(slot/8.))*128.;
        vec2 sampleAt=(cell+8.5+uv*111.)/vec2(${width}.,${height}.);
        vec2 border=min(uv,1.-uv);
        return vec2(${packed?'textureLod(bankMap,vec2(sampleAt.x,1.-sampleAt.y),0.).a':'texture2D(waOpacity,sampleAt).r'}*smoothstep(.007,.07,min(border.x,border.y)),slot);
      }
      #endif
    `;
    return {uniforms:packed?{}:{waOpacity:{value:texture}}, bankTexture:packed?texture:null, shader, choices, siteChoices};
  }
  window.aerieWaterOpacity = {prepare,bind};
})();
