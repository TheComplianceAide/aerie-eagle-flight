// Distances are survey metres. Each cloud that crosses the sun has a matching
// footprint on the landscape, water and eagle, including in the lake mirror.
window.makeMovingWeather = async function makeMovingWeather(THREE, scene, world) {
  // Layer height in survey coordinates, pattern span, cloud threshold, shadow
  // strength, upper-wind multiplier, and elongation across the prevailing wind.
  const profiles = {
    dixville:      [1710, 4070, .63, .36, 2.1, .86],
    labrador:      [1390, 4350, .49, .44, 2.45, .78],
    alaska:        [2300, 4700, .47, .50, 3.3, .87],
    swiss:         [3400, 4800, .50, .44, 2.7, .93],
    canyon:        [2650, 5700, .62, .46, 2.9, .78],
    yosemite:      [4050, 5100, .54, .44, 2.6, .96],
    crater:        [3670, 5400, .50, .48, 2.6, .86],
    lofoten:       [1390, 4000, .46, .51, 3.4, .61],
    milford:       [2670, 11800, .51, .37, 2.9, .86],
    winnipesaukee: [1670, 4250, .49, .40, 2.1, .91],
    moosehead:     [1640, 3850, .45, .43, 2.0, .86],
    surry:         [1540, 3950, .51, .39, 2.2, .89]
  };
  const [height, span, threshold, strength, upperWind, width] = profiles[world.region] ||
    [(world.waterLevel ?? world.spawn.y) + 1600, 4400, .49, .43, 2.5, .85];
  const field = world.windField;
  const texture = await new THREE.TextureLoader().loadAsync('cloud-field.png');
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  const uniforms = {
    cloudField: {value:texture}, cloudHeight: {value:height}, cloudSpan: {value:span},
    cloudThreshold: {value:threshold}, cloudStrength: {value:strength}, cloudWidth: {value:width},
    cloudSun: {value:world.sunDirection}, cloudDirection: {value:new THREE.Vector2(field.direction.x,field.direction.z)},
    cloudTravel: {value:0}, cloudSeed: {value:new THREE.Vector2(.19*field.phase,.37*field.phase)}
  };
  const cloudSampling = `
    uniform sampler2D cloudField;
    uniform vec3 cloudSun;
    uniform vec2 cloudDirection, cloudSeed;
    uniform float cloudHeight, cloudWidth, cloudSpan, cloudThreshold, cloudStrength, cloudTravel;
    float cloudDensity(vec2 p){
      vec2 crosswind=vec2(-cloudDirection.y,cloudDirection.x);
      vec2 coord=vec2(dot(p,cloudDirection)-cloudTravel,dot(p,crosswind)*cloudWidth)/cloudSpan;
      return texture2D(cloudField,coord+cloudSeed).r;
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
        // First light colours the thin cloud deck; the river-valley inversion
        // is applied in front of it by the regional weather material.
        underside=vec3(.43,.40,.56);lit=mix(vec3(.70,.55,.69),vec3(1.,.72,.56),silver);
        opacity*=.22;
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
        if(sky){
          shader.fragmentShader=cloudSampling+lightSurface(shader.fragmentShader,coverSky(shader.fragmentShader.includes(precipitation)));
        }else{
          // Survey grids and skinned/instanced meshes already have densely
          // spaced vertices. Sampling there preserves scarce fragment samplers
          // for the photographic terrain and multilayer feather materials.
          const surveyedCliff=world.region==='milford'&&material.uniforms?.halfMap&&material.uniforms.terrainLight;
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
