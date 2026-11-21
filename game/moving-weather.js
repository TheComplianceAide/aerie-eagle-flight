// Distances are survey metres. Each cloud that crosses the sun has a matching
// footprint on the landscape, water and eagle, including in the lake mirror.
window.makeMovingWeather = async function makeMovingWeather(THREE, scene, world) {
  // Layer height in survey coordinates, pattern span, cloud threshold, shadow
  // strength, upper-wind multiplier, and elongation across the prevailing wind.
  if(world.region==='acadia')return ()=>{}; // A clear summer night with visible stars.
  const profiles = {
    dixville:      [1710, 4070, .63, .36, 2.1, .86],
    labrador:      [1390, 4350, .49, .44, 2.45, .78],
    alaska:        [4800, 4700, .43, .34, 2.6, .87],
    swiss:         [3400, 4800, .50, .44, 2.7, .93],
    canyon:        [2650, 5700, .62, .46, 2.9, .78],
    yosemite:      [4050, 5100, .54, .44, 2.6, .96],
    crater:        [3670, 5400, .50, .48, 2.6, .86],
    lofoten:       [1390, 4000, .46, .51, 3.4, .61],
    milford:       [2670, 11800, .51, .37, 2.9, .86],
    winnipesaukee: [1670, 4250, .49, .40, 2.1, .91],
    moosehead:     [1640, 3850, .45, .43, 2.0, .86],
    surry:         [1830, 6300, .58, .15, 1.8, .89]
  };
  const [height, span, threshold, strength, upperWind, width] = profiles[world.region] ||
    [(world.waterLevel ?? world.spawn.y) + 1600, 4400, .49, .43, 2.5, .85];
  const field = world.windField;
  const lakePanorama = world.region === 'moosehead';
  const photographedDeck = lakePanorama || !!world.cloudDensityMap;
  const texture = lakePanorama ? world.skyTexture : await new THREE.TextureLoader().loadAsync(world.cloudDensityMap || 'cloud-field.png');
  // The low Yosemite sun crosses a long column through the cloud deck.
  // Its surface shadow samples the integrated density from that same field.
  const penumbra=world.region==='yosemite'?{value:await new THREE.TextureLoader().loadAsync('yosemite-cloud-penumbra.webp')}:null;
  if(penumbra)penumbra.value.wrapS=penumbra.value.wrapT=THREE.RepeatWrapping;
  if (!lakePanorama) texture.wrapS = THREE.RepeatWrapping;
  if (!photographedDeck) texture.wrapT = THREE.RepeatWrapping;
  const uniforms = {
    cloudField: {value:texture}, cloudHeight: {value:height}, cloudSpan: {value:span},
    cloudThreshold: {value:threshold}, cloudStrength: {value:strength}, cloudWidth: {value:width},
    cloudSun: {value:world.sunDirection}, cloudDirection: {value:new THREE.Vector2(field.direction.x,field.direction.z)},
    cloudTravel: {value:0}, cloudSeed: {value:new THREE.Vector2(.19*field.phase,.37*field.phase)}
  };
  // Project the moving sky onto land and water. A separately graded sky can supply its own cloud-density map.
  const deckCoordinates = photographedDeck ? `
    uniform vec3 cloudAnchor;
    vec3 deckDirection(vec2 p) {
      // A finite panorama cannot cover tens of kilometres of flat sky. Keep
      // short-range parallax at launch and progressively follow the observer
      // across remote bays. Terrain, the water mirror and sky use one origin.
      vec2 travel=cameraPosition.xz-cloudAnchor.xz;
      float extent=length(travel);
      float offset=mix(min(extent,1800.),480.,smoothstep(1800.,7200.,extent));
      vec2 origin=cameraPosition.xz-travel*(offset/max(.001,extent));
      return normalize(vec3(p.x-origin.x,cloudHeight-cloudAnchor.y,p.y-origin.y));
    }
    vec2 deckUV(vec3 ray) {
      return vec2(.5+atan(ray.z,ray.x)*.15915494,.5+asin(clamp(ray.y,-1.,1.))*.31830989);
    }
    vec3 deckSample(sampler2D panorama,vec2 p) {
      // Exchange wind-advected cloud fields over many minutes. Both samples
      // coincide continuously at each wrap, including on hours-long flights.
      const float span=13800.;
      float phase=mod(cloudTravel/span,1.);
      vec2 a=p-cloudDirection*(phase*span);
      vec2 b=a+cloudDirection*span;
      return mix(texture2D(panorama,deckUV(deckDirection(a))).rgb,
                 texture2D(panorama,deckUV(deckDirection(b))).rgb,smoothstep(.20,.90,phase));
    }
  ` : '';
  if (photographedDeck) {
    uniforms.cloudAnchor = {value:new THREE.Vector3(world.spawn.x,world.spawn.y,world.spawn.z)};
  }
  const cloudSampling = `
    uniform sampler2D cloudField;
    uniform vec3 cloudSun;
    uniform vec2 cloudDirection, cloudSeed;
    uniform float cloudHeight, cloudWidth, cloudSpan, cloudThreshold, cloudStrength, cloudTravel;
    ${deckCoordinates}
    float cloudDensity(vec2 p){
      ${photographedDeck ? `
      ${lakePanorama?`vec3 sky=deckSample(cloudField,p);
      return smoothstep(.36,.91,(sky.r+.75*sky.g)/(1.75*max(.015,sky.b)));`:'return deckSample(cloudField,p).r;'}
      ` : `
      vec2 crosswind=vec2(-cloudDirection.y,cloudDirection.x);
      vec2 coord=vec2(dot(p,cloudDirection)-cloudTravel,dot(p,crosswind)*cloudWidth)/cloudSpan;
      return texture2D(cloudField,coord+cloudSeed).r;`}
    }
    float cloudCover(float density){return smoothstep(cloudThreshold-.115,cloudThreshold+.145,density);}
  `;
  // Deriving position from clip X/Y/W preserves skinned feathers, instanced
  // foliage, camera-facing cards and meshes animated in custom vertex shaders.
  const worldPosition = `
    vec2 viewXY=(gl_Position.xy+projectionMatrix[2].xy*gl_Position.w)/vec2(projectionMatrix[0].x,projectionMatrix[1].y);
    vec3 cloudWorld=cameraPosition+vec3(viewXY,-gl_Position.w)*mat3(viewMatrix);
  `;
  const projectedCover = `
    float belowCloud=cloudHeight-cloudWorld.y;
    vec2 onDeck=cloudWorld.xz+cloudSun.xz*(max(0.,belowCloud)/max(.15,cloudSun.y));
    float shade=cloudCover(cloudDensity(onDeck))*smoothstep(0.,140.,belowCloud);
    ${world.region==='milford'?`// A deep maritime cloud casts a broad penumbra at the low sun angle.
    // Integrate through its thickness instead of projecting its fine underside
    // onto kilometres of steep terrain as a repeating row of dark stripes.
    vec2 fjordCloudShear=cloudSun.xz*1110.,fjordCrossLight=vec2(-cloudSun.z,cloudSun.x)*340.;
    float broad=(2.*cloudDensity(onDeck)+cloudDensity(onDeck+fjordCloudShear)+cloudDensity(onDeck-fjordCloudShear)
                  +cloudDensity(onDeck+fjordCrossLight)+cloudDensity(onDeck-fjordCrossLight))/6.;
    shade=smoothstep(.25,.78,broad)*smoothstep(0.,240.,belowCloud);`:''}
    float distanceFade=1.-.72*smoothstep(4200.,21000.,length(cloudWorld-cameraPosition));
    cloudShade=shade*cloudStrength*distanceFade;
  `;
  const coverSky = (linearOutput) => `
    vec3 cloudRay=normalize(ray);
    float t=(cloudHeight-cameraPosition.y)/max(.012,cloudRay.y);
    if(t>0. && cloudRay.y>.012){
      vec2 q=cameraPosition.xz+t*cloudRay.xz;
      float body=cloudDensity(q);
      float opacity=cloudCover(body)*smoothstep(.012,.12,cloudRay.y);
      float sunward=cloudDensity(q+110.*cloudSun.xz);
      float rim=clamp(.40+2.3*(body-sunward),0.,1.);
      float silver=pow(max(0.,dot(cloudRay,cloudSun)),5.);
      vec3 underside=mix(vec3(.45,.51,.61),vec3(.64,.59,.58),silver);
      vec3 lit=mix(vec3(.84,.86,.88),vec3(1.,.86,.69),silver);
      ${world.region==='dixville'?`
        float lowBand=1.-smoothstep(.14,.45,cloudRay.y);
        underside=mix(vec3(.23,.34,.49),vec3(.51,.39,.48),lowBand);
        lit=mix(vec3(.46,.55,.65),vec3(.93,.56,.46),lowBand*(.59+.41*silver));
        opacity*=.44;
      `:''}
      ${world.region==='surry'?`
        // Thin midday cloud blends into the wider veil around the sun.
        underside=vec3(.59,.63,.65);lit=mix(vec3(.77,.79,.80),vec3(.88,.85,.76),silver);
        opacity*=.13;
      `:''}
      vec3 cloud=mix(underside,lit,clamp(rim+.26*(1.-opacity),0.,1.));
      gl_FragColor.rgb=mix(gl_FragColor.rgb,${linearOutput ? "pow(cloud,vec3(2.2))" : "cloud"},.73*opacity);
    }
  `;
  // Three's built-ins and the survey materials all finish with main(). Keep
  // earlier return/discard paths, material light hooks and their cache keys.
  function appendMain(source, addition) {
    const start=source.search(/void\s+main\s*\(/);
    const opening=source.indexOf('{',start);
    let depth=1, i=opening+1;
    for(;i<source.length && depth;i++){
      if(source[i]==='{')depth++;
      else if(source[i]==='}')depth--;
    }
    return source.slice(0,i-1)+'\n'+addition+'\n'+source.slice(i-1);
  }
  // Near-field rain and its rainbow scatter light in front of the cloud deck.
  const precipitation='/* before local precipitation */';
  function lightSurface(fragment, lighting){
    return fragment.includes(precipitation) ? fragment.replace(precipitation,lighting) : appendMain(fragment,lighting);
  }
  const seen = new Set();
  scene.traverse(object => {
    if(!object.isMesh)return;
    const sky=object.renderOrder===-1000;
    for(const material of Array.isArray(object.material)?object.material:[object.material]){
      if(!material || seen.has(material) || material.isShadowMaterial)continue;
      // Air volumes, decals and additive foam inherit the underlying surface.
      if(!sky && material.transparent && !material.depthWrite && !object.isWater)continue;
      if(sky && !/varying vec3 ray/.test(material.vertexShader))continue;
      seen.add(material);
      const prior=material.onBeforeCompile, key=material.customProgramCacheKey();
      const water=!!object.isWater;
      material.onBeforeCompile=function(shader,renderer){
        prior.call(this,shader,renderer);
        Object.assign(shader.uniforms,uniforms);
        if(penumbra&&!sky)shader.uniforms.cloudField=penumbra;
        if(sky){
          if (photographedDeck) {
            // Preserve the sun's bearing and the photographic horizon as the
            // eagle moves under the cloud base. The water mirror uses this ray too.
            shader.fragmentShader=cloudSampling+shader.fragmentShader.replace(
              'gl_FragColor=vec4(texture2D(map,uv).rgb,1.);', `
              vec3 upper=texture2D(map,uv).rgb;
              float below=cloudHeight-cameraPosition.y;
              if(d.y>.004 && below>0.){
                vec2 intersection=cameraPosition.xz+d.xz*below/max(.004,d.y);
                float horizon=smoothstep(.004,.056,d.y);
                float glare=1.-smoothstep(.984,.998,dot(d,cloudSun));
                upper=mix(upper,deckSample(map,intersection),horizon*glare);
              }
              gl_FragColor=vec4(upper,1.);`);
          } else {
            shader.fragmentShader=cloudSampling+lightSurface(shader.fragmentShader,coverSky(shader.fragmentShader.includes(precipitation)));
          }
        }else{
          // Survey grids and skinned/instanced meshes already have densely
          // spaced vertices. Sampling there preserves scarce fragment samplers
          // for the photographic terrain and multilayer feather materials.
          const surveyedCliff=(world.region==='milford'||penumbra)&&material.uniforms?.halfMap&&material.uniforms.terrainLight;
          const direct=surveyedCliff?'(.10+.90*sunlit*max(.0,dot(normal,sun)))':'1.';
          const shadeRGB='gl_FragColor.rgb*=vec3(1.)-vec3(1.,.85,.65)*cloudShade*'+direct+';';
          if(water){
            // Large lake quads need per-fragment projection across their span.
            const varying='varying vec3 cloudWorld;\n';
            shader.vertexShader=varying+appendMain(shader.vertexShader,worldPosition.replace('vec3 cloudWorld=','cloudWorld='));
            shader.fragmentShader=varying+cloudSampling+appendMain(shader.fragmentShader,
              'float cloudShade;'+projectedCover+'cloudShade*=.46;'+shadeRGB);
          }else{
            const varying='varying float cloudShade;\n';
            shader.vertexShader=varying+cloudSampling+appendMain(shader.vertexShader,worldPosition+projectedCover);
            shader.fragmentShader=varying+lightSurface(shader.fragmentShader,shadeRGB);
          }
        }
      };
      material.customProgramCacheKey=()=>key+(sky?':cloud-sky':water?':cloud-water':':cloud-ground');
      material.needsUpdate=true;
    }
  });
  const spray=world.spraySources && window.makeNuggetSpray?.(THREE,scene,world,texture);
  return function updateWeather(elapsed){
    uniforms.cloudTravel.value=elapsed*field.advection*upperWind;
    if(spray)spray.value=elapsed;
  };
};
