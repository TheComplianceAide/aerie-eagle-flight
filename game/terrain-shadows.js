// Surveyed terrain casts into two adjacent tiles of the same sunlight atlas.
// Receivers sample it in their normal draw, including reflected views of the land.
window.makeTerrainShadows=function makeTerrainShadows(T,renderer,scene,world){
  if(new URLSearchParams(location.search).get('terrainShadows')==='off')return null;
  const hardware=renderer.capabilities.isWebGL2;
  const tile=Math.min(2048,Math.floor(renderer.capabilities.maxTextureSize/2));
  const atlas=new T.WebGLRenderTarget(2*tile,tile,{
    minFilter:T.NearestFilter,magFilter:T.NearestFilter,generateMipmaps:false,stencilBuffer:false
  });
  if(hardware){
    atlas.depthTexture=new T.DepthTexture(2*tile,tile,T.UnsignedIntType);
    atlas.depthTexture.compareFunction=T.LessEqualCompare;
    atlas.depthTexture.minFilter=atlas.depthTexture.magFilter=T.LinearFilter;
  }
  atlas.scissorTest=true;
  const casters=new T.Scene(),sources=[],cuts=new Map(),receivers=new Map();
  const bounds=world.bounds;
  const center=new T.Vector3((bounds.minX+bounds.maxX)/2,0,(bounds.minZ+bounds.maxZ)/2);
  const height=world.elevation||world.height;
  let bottom=Infinity,top=-Infinity;
  for(let i=0;i<=8;i++)for(let j=0;j<=8;j++){
    const h=height(T.MathUtils.lerp(bounds.minX,bounds.maxX,i/8),T.MathUtils.lerp(bounds.minZ,bounds.maxZ,j/8));
    if(Number.isFinite(h)){bottom=Math.min(bottom,h);top=Math.max(top,h);}
  }
  center.y=Number.isFinite(top)?(top+bottom)/2:0;
  const relief=Number.isFinite(top-bottom)?top-bottom:0;
  const regionalRadius=.52*Math.hypot(bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ,relief)+1200;
  const depthRange=Math.max(18000,regionalRadius*2.8);
  const regional=new T.OrthographicCamera(-regionalRadius,regionalRadius,regionalRadius,-regionalRadius,1,depthRange);
  const local=new T.OrthographicCamera(-1900,1900,1500,-1500,1,depthRange);
  const focus=new T.Vector3(Infinity,Infinity,Infinity),direction=new T.Vector3();
  const uniforms={
    terrainDepth:{value:hardware?atlas.depthTexture:atlas.texture},
    terrainLocalPV:{value:new T.Matrix4()},terrainToRegion:{value:new T.Vector4()},terrainRegionZ:{value:0},
    terrainBias:{value:new T.Vector2()},terrainShadeStrength:{value:1}
  };
  const regionalPV=new T.Matrix4(),previousColor=new T.Color(),nextSun=new T.Vector3();
  let drawings=0;
  function depthMaterial(material){
    const cut=material.userData.terrainShadowCut||'';
    if(cuts.has(cut))return cuts.get(cut);
    const depth=new T.MeshDepthMaterial({side:T.DoubleSide,depthPacking:T.RGBADepthPacking,
      colorWrite:!hardware,blending:T.NoBlending,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
    if(cut){
      depth.customProgramCacheKey=()=>cut;
      depth.onBeforeCompile=s=>{
        s.vertexShader='varying vec3 shadowGround;\n'+s.vertexShader.replace('#include <project_vertex>',
          '#include <project_vertex>\nshadowGround=(modelMatrix*vec4(position,1.)).xyz;');
        s.fragmentShader='varying vec3 shadowGround;\n'+s.fragmentShader.replace('#include <clipping_planes_fragment>',
          '#include <clipping_planes_fragment>\nif('+cut+')discard;');
      };
    }
    cuts.set(cut,depth);return depth;
  }
  // Append to main itself. Some regional materials declare helpers after main.
  function finishMain(source,statement){
    const match=/void\s+main\s*\(\s*(?:void\s*)?\)\s*\{/.exec(source);
    if(!match)throw Error('Terrain shadow receiver has no shader entry point');
    let i=match.index+match[0].length,nesting=1;
    while(i<source.length&&nesting){if(source[i]==='{')nesting++;if(source[i]==='}')nesting--;i++;}
    return source.slice(0,i-1)+'\n'+statement+'\n'+source.slice(i-1);
  }
  const vary='varying highp vec3 localSunCoord;\n';
  const lighting='uniform vec2 terrainBias; uniform float terrainShadeStrength,terrainRegionZ; uniform vec4 terrainToRegion;\n'+
    (hardware?'uniform highp sampler2DShadow terrainDepth;':'uniform highp sampler2D terrainDepth;')+`
    float terrainBlocked(vec3 p,float column,float bias){
      if(p.z<=0.||p.z>=1.)return 0.;
      vec2 uv=vec2(p.x*.5+column,p.y);
      float ref=p.z-bias;
      ${hardware?'return 1.-texture(terrainDepth,vec3(uv,ref));':`
        vec4 rgba=texture2D(terrainDepth,uv);
        float depth=dot(rgba,(255./256.)*vec4(1./16777216.,1./65536.,1./256.,1.));
        return smoothstep(depth,depth+bias*.55,ref);`}
    }
    float terrainEdge(vec3 p){
      return min(min(p.x,1.-p.x),min(p.y,1.-p.y));
    }
    float terrainOcclusion(vec3 localSunCoord){
      float e=terrainEdge(localSunCoord);
      if(e>=.085)return terrainBlocked(localSunCoord,0.,terrainBias.x);
      vec3 regional=vec3(localSunCoord.xy*terrainToRegion.xy+terrainToRegion.zw,localSunCoord.z+terrainRegionZ);
      float wide=terrainBlocked(regional,.5,terrainBias.y)*smoothstep(.002,.045,terrainEdge(regional));
      if(e<=.01)return wide;
      return mix(wide,terrainBlocked(localSunCoord,0.,terrainBias.x),smoothstep(.01,.085,e));
    }\n`;
  function receive(mat,staticGround){
    if(receivers.has(mat))return;
    const previous=mat.onBeforeCompile,cacheKey=mat.customProgramCacheKey,baseKey=cacheKey.call(mat);
    receivers.set(mat,{previous,cacheKey});
    const directWater=mat.userData.shadowDirectWater===true;
    mat.customProgramCacheKey=()=>baseKey+'|survey-sun-'+Number(staticGround)+'-'+(hardware?'pcf':'packed')+(directWater?'-water-light':'');
    mat.onBeforeCompile=function(shader,...args){
      previous.call(this,shader,...args);
      Object.assign(shader.uniforms,uniforms);
      // Recover the final, animated vertex from its projected XY and eye depth.
      // This also follows instance transforms and the water's reflected camera.
      const worldPosition=staticGround?'vec3 surveyPosition=(modelMatrix*vec4(position,1.)).xyz;':`
        vec3 surveyEye=vec3((gl_Position.xy+projectionMatrix[2].xy*gl_Position.w)/
            vec2(projectionMatrix[0][0],projectionMatrix[1][1]),-gl_Position.w);
        vec3 surveyPosition=cameraPosition+surveyEye*mat3(viewMatrix);`;
      // Some geological materials already fill every fragment texture unit.
      // Their dense survey vertices can sample the very same atlas in the vertex stage.
      const declarations=shader.fragmentShader.matchAll(/uniform\s+(?:(?:lowp|mediump|highp)\s+)?[iu]?sampler\w*\s+([^;]+);/g);
      let slots=0;
      for(const declaration of declarations)slots+=declaration[1].split(',').length;
      const atVertex=slots>=renderer.capabilities.maxTextures-1;
      const interpolator=atVertex?'varying highp float vertexRidgeShade;\n':vary;
      shader.vertexShader=interpolator+'uniform mat4 terrainLocalPV;\n'+(atVertex?lighting:'')+
        finishMain(shader.vertexShader,worldPosition+
          'vec3 ridgePoint=(terrainLocalPV*vec4(surveyPosition,1.)).xyz*.5+.5;'+
          (atVertex?'vertexRidgeShade=terrainOcclusion(ridgePoint);':'localSunCoord=ridgePoint;'));
      const shade='terrainShadeStrength*'+(atVertex?'vertexRidgeShade':'terrainOcclusion(localSunCoord)');
      // The ridge blocks the sun on the wave and lake bed. The same wave
      // still sees the open sky, as well as shore already shaded in the mirror.
      const visibility='1. /* direct terrain visibility */';
      const receiveSun=shader.fragmentShader.includes(visibility)?
        shader.fragmentShader.replaceAll(visibility,'(1.-'+shade+')'):
        directWater?shader.fragmentShader.replace('float visibleSun=getShadowMask();',
        'float visibleSun=getShadowMask()*(1.-'+shade+');'):
        finishMain(shader.fragmentShader,'float ridgeShade='+shade+';gl_FragColor.rgb*=mix(vec3(1.),vec3(.63,.66,.70),ridgeShade);');
      shader.fragmentShader=interpolator+(atVertex?'uniform float terrainShadeStrength;\n':lighting)+receiveSun;
    };
    mat.needsUpdate=true;
  }
  scene.updateMatrixWorld(true);
  scene.traverse(mesh=>{
    if(!mesh.isMesh)return;
    if(mesh.userData.terrainCaster){
      const proxy=new T.Mesh(mesh.geometry,depthMaterial(mesh.material));
      proxy.matrixAutoUpdate=false;proxy.matrix.copy(mesh.matrixWorld);casters.add(proxy);sources.push(mesh);
    }
    for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
      if(mesh.userData.terrainCaster||mesh.userData.terrainReceiver||mat.uniforms?.mirrorSampler||
         mat.uniforms?.surveyLight||mat.uniforms?.terrainLight&&mat.uniforms?.lightSpan)receive(mat,!!(mesh.userData.terrainCaster||mesh.userData.terrainReceiver));
    }
  });
  function draw(cam,anchor,column,matrix){
    cam.position.copy(anchor).addScaledVector(direction,depthRange*.5);
    cam.lookAt(anchor);cam.updateMatrixWorld(true);
    // Snap the projection in light space. Overlapping texels retain the same
    // world positions when the near tile follows a bird or a landmark jump.
    const e=cam.matrixWorldInverse.elements;
    const dx=(cam.right-cam.left)/tile,dy=(cam.top-cam.bottom)/tile;
    cam.projectionMatrix.elements[12]=(Math.round(e[12]/dx)*dx-e[12])*2/(cam.right-cam.left);
    cam.projectionMatrix.elements[13]=(Math.round(e[13]/dy)*dy-e[13])*2/(cam.top-cam.bottom);
    matrix.multiplyMatrices(cam.projectionMatrix,cam.matrixWorldInverse);
    atlas.viewport.set(column*tile,0,tile,tile);atlas.scissor.copy(atlas.viewport);
    renderer.setRenderTarget(atlas);renderer.clear();renderer.render(casters,cam);drawings++;
  }
  function update(position){
    nextSun.copy(world.sunDirection).normalize();
    const turned=direction.dot(nextSun)<.999999;
    if(!turned&&position.distanceToSquared(focus)<650*650)return;
    const target=renderer.getRenderTarget(),alpha=renderer.getClearAlpha();
    renderer.getClearColor(previousColor);renderer.setClearColor(0xffffff,1);
    try{
      for(let i=0;i<sources.length;i++){
        const proxy=casters.children[i],source=sources[i];
        proxy.geometry=source.geometry;
        proxy.matrix.copy(source.matrixWorld);proxy.matrixWorldNeedsUpdate=true;
      }
      if(turned){
        direction.copy(nextSun);
        uniforms.terrainShadeStrength.value=T.MathUtils.smoothstep(direction.y,0,.08);
        draw(regional,center,1,regionalPV);
      }
      focus.copy(position);
      draw(local,focus,0,uniforms.terrainLocalPV.value);
      const l=uniforms.terrainLocalPV.value.elements,r=regionalPV.elements;
      const sx=local.right/regional.right,sy=local.top/regional.top;
      uniforms.terrainToRegion.value.set(sx,sy,(1+r[12]-(1+l[12])*sx)*.5,(1+r[13]-(1+l[13])*sy)*.5);
      uniforms.terrainRegionZ.value=(r[14]-l[14])*.5;
      uniforms.terrainBias.value.set(1.6/depthRange,Math.max(1.6,regionalRadius/tile*1.1)/depthRange);
    }finally{
      renderer.setRenderTarget(target);renderer.setClearColor(previousColor,alpha);
    }
  }
  const invalidate=()=>direction.set(0,0,0);
  renderer.domElement.addEventListener('webglcontextrestored',invalidate);
  function dispose(){
    renderer.domElement.removeEventListener('webglcontextrestored',invalidate);
    for(const [mat,{previous,cacheKey}] of receivers){
      mat.onBeforeCompile=previous;mat.customProgramCacheKey=cacheKey;mat.needsUpdate=true;
    }
    for(const material of cuts.values())material.dispose();
    atlas.dispose();casters.clear();cuts.clear();receivers.clear();sources.length=0;
  }
  return {update,dispose,get stats(){return {drawings,casters:casters.children.length,receivers:receivers.size,
    sun:direction.toArray(),nativeCompare:hardware,tile};}};
};

// Prepare first-use range materials with the assembled flight lights. Waterfalls
// draw into the mirror and the display. Lake-wash detail draws only on the display.
window.prepareFlightMaterials=async function prepareFlightMaterials(T,renderer,scene,camera){
  const materials=new Set(),meshes=[],textures=new Set();
  scene.traverse(object=>{
    const material=object.material;
    if(material?.userData?.prepareRangeMap)collect(material.map);
    if((object.userData.prepareFlightMaterial||object.userData.prepareDirectMaterial)&&!materials.has(material)){
      materials.add(material);meshes.push(object);
    }
  });
  // The linked program still has to upload its images on first draw. The
  // surveyed bed, stream and bank stones can enter view on consecutive frames.
  function collect(texture){
    if(texture?.isTexture&&texture.image&&!texture.isRenderTargetTexture&&!texture.isDepthTexture&&!texture.isVideoTexture)
      textures.add(texture);
  }
  for(const material of materials){
    for(const value of Object.values(material))collect(value);
    for(const uniform of Object.values(material.uniforms||{})){
      if(Array.isArray(uniform.value))uniform.value.forEach(collect);else collect(uniform.value);
    }
  }
  for(const texture of textures)renderer.initTexture(texture);
  if(!meshes.length)return;
  const original=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel();
  const reflection=meshes.some(mesh=>mesh.userData.prepareFlightMaterial)?new T.WebGLRenderTarget(1,1):null;
  const programs=new Set();
  try{
    for(const target of reflection?[null,reflection]:[null]){
      renderer.setRenderTarget(target);
      for(const mesh of meshes){
        if(target&&mesh.userData.prepareDirectMaterial)continue;
        for(const material of renderer.compile(mesh,camera,scene)){
          const properties=renderer.properties.get(material);
          if(mesh.userData.prepareDirectMaterial){
            // Three compiles BackSide and FrontSide for transparent double-sided detail.
            // currentProgram refers only to the second one.
            for(const program of properties.programs.values())programs.add(program);
          }else programs.add(properties.currentProgram);
        }
      }
    }
  }finally{
    renderer.setRenderTarget(original,face,mip);reflection?.dispose();
  }
  while(programs.size){
    if(renderer.getContext().isContextLost())return;
    for(const program of programs){
      if(!program.isReady())continue;
      program.getUniforms();program.getAttributes();programs.delete(program);
    }
    if(programs.size)await new Promise(resolve=>setTimeout(resolve,12));
  }
};
