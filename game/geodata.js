/* Optional observations are loaded only for the selected range. The stock
   range stays playable when an observation is unavailable or unsupported. */
(() => {
  const worldLayers = {
    acadia: ['coast'],
    alaska: ['mendenhall', 'canopy'],
    canyon: ['landCover', 'spectral'],
    crater: ['spectral'],
    dixville: ['spectral'],
    labrador: ['spectral'],
    lofoten: ['coast'],
    moosehead: ['canopy', 'spectral'],
    surry: ['spectral'],
    swiss: ['oeschinen', 'spectral', 'lidar'],
    winnipesaukee: ['spectral'],
    yosemite: ['spectral']
  };

  async function request(name, signal) {
    const url = window.aerieAssetURL?.(name) || name;
    const response = await fetch(url, {signal});
    if (!response.ok) throw new Error(name + ' returned HTTP ' + response.status);
    return response;
  }

  function assetReader(signal) {
    return {
      json: async name => (await request(name, signal)).json(),
      async gzip(name, limit) {
        const response = await request(name, signal);
        if (typeof DecompressionStream === 'function' && response.body) {
          const reader = response.body.pipeThrough(new DecompressionStream('gzip')).getReader();
          const chunks = [];
          let size = 0;
          try {
            for (;;) {
              const {done, value} = await reader.read();
              if (done) break;
              size += value.byteLength;
              if (size > limit) throw new Error(name + ' exceeds its decoded size limit');
              chunks.push(value);
            }
          } finally {
            await reader.cancel().catch(() => {});
            reader.releaseLock();
          }
          const bytes = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
          }
          return bytes;
        }
        if (!window.pako) throw new Error('Gzip decoding is unavailable');
        const bytes = window.pako.inflate(new Uint8Array(await response.arrayBuffer()));
        if (bytes.byteLength > limit) throw new Error(name + ' exceeds its decoded size limit');
        return bytes;
      },
      async pixels(name, width, height) {
        const blob = await (await request(name, signal)).blob();
        const bitmap = await createImageBitmap(blob, {colorSpaceConversion: 'none', premultiplyAlpha: 'none'});
        try {
          if (bitmap.width !== width || bitmap.height !== height) throw new Error('Wrong raster dimensions for ' + name);
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d', {willReadFrequently: true});
          context.drawImage(bitmap, 0, 0);
          return context.getImageData(0, 0, width, height).data;
        } finally {
          bitmap.close();
        }
      }
    };
  }

  async function loadLandCover(region, read) {
    const meta = await read.json('canyon-worldcover-2021.json');
    if (region !== 'canyon' || meta.crs !== 'EPSG:32612' || meta.originE !== 454517 ||
        meta.originN !== 4081578 || meta.width !== 140 || meta.height !== 140 ||
        meta.cellMeters !== 10 || meta.xMin !== -700 || meta.zMin !== -700) {
      throw new Error('Unexpected Horseshoe Bend land-cover registration');
    }
    const raw = atob(meta.classesBase64);
    if (raw.length !== meta.width * meta.height) throw new Error('Incomplete Horseshoe Bend land-cover grid');
    const classes = new Map([[10,1],[20,2],[30,3],[40,4],[50,5],[60,6],[70,7],[80,8],[90,9],[95,10],[100,11]]);
    const cells = Uint8Array.from(raw, char => classes.get(char.charCodeAt(0)) || 0);
    return {
      sample(x, z) {
        const col = Math.floor((x - meta.xMin) / meta.cellMeters);
        const row = Math.floor((z - meta.zMin) / meta.cellMeters);
        if (col < 0 || row < 0 || col >= meta.width || row >= meta.height) return 0;
        return cells[row * meta.width + col];
      }
    };
  }

  async function loadSwissLidar(region, read) {
    const stem = 'geodata/swiss-lidar';
    const meta = await read.json(stem + '.json');
    const {width, height, bounds} = meta;
    if (region !== 'swiss' || meta.schema !== 1 || meta.world !== region || meta.epsg !== 2056 ||
        meta.origin[0] !== 2622000 || meta.origin[1] !== 1150000 ||
        bounds.join(',') !== '-1760,-560,-1440,-240' || width !== 320 || height !== 320 ||
        meta.step !== 1 || meta.scaleM !== .01 || meta.offsetM !== 100 ||
        !(meta.holdout.count >= 70) || !(Math.abs(meta.holdout.p05P25P50P75P95M[2]) < .7)) {
      throw new Error('Unverified Swiss terrain registration');
    }
    const bytes = await read.gzip(stem + '.bin', width * height * 2);
    if (bytes.byteLength !== width * height * 2) throw new Error('Incomplete Swiss terrain grid');
    const grid = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const [left, top, right, bottom] = bounds;
    const elevation = (x, z) => meta.offsetM + meta.scaleM * grid.getInt16(2 * (z * width + x), true);
    const ramp = value => {
      const amount = Math.max(0, Math.min(1, value));
      return amount * amount * (3 - 2 * amount);
    };
    return {meta, bounds, replace(x, z, stock) {
      const edge = Math.min(x-left, right-x, z-top, bottom-z);
      if (edge <= 1 || stock < 15) return stock;
      const px = x-left-.5, pz = z-top-.5;
      const i = Math.floor(px), j = Math.floor(pz), u = px-i, v = pz-j;
      const north = elevation(i,j)*(1-u) + elevation(i+1,j)*u;
      const south = elevation(i,j+1)*(1-u) + elevation(i+1,j+1)*u;
      const delta = north*(1-v) + south*v - stock;
      return stock + delta * ramp((edge-1)/24) * ramp((1.85-Math.abs(delta))/.65);
    }};
  }

  const providers = {
    coast: (T, region, read, maxTexture) => window.prepareCoastalGeodata(T, region, read, maxTexture),
    mendenhall: (T, region, read, maxTexture) => window.prepareMendenhallGeodata(T, read, maxTexture),
    canopy: (T, region, read) => window.prepareRegionalCanopyGeodata(region, read),
    oeschinen: (T, region, read) => window.prepareOeschinenGeodata(read),
    landCover: (T, region, read) => loadLandCover(region, read),
    spectral: (T, region, read, maxTexture) => window.prepareSpectralGeodata(T, region, read, maxTexture),
    lidar: (T, region, read) => loadSwissLidar(region, read)
  };

  window.prepareAerieGeodata = async (T, region, maxTexture) => {
    const data = {};
    if (new URLSearchParams(location.search).get('geodata') === 'stock') return data;
    await Promise.all((worldLayers[region] || []).map(async role => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      try {
        data[role] = await providers[role](T, region, assetReader(controller.signal), maxTexture);
      } catch (error) {
        console.warn('Geodata unavailable for ' + region + ' (' + role + ')', error);
      } finally {
        clearTimeout(timeout);
      }
    }));
    return data;
  };
})();
