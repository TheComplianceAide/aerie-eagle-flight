// Bake the downtown geometry from the sun once. Building faces and pavement
// share the same depth test as the bird moves between adjoining storefronts.
window.lightKeeneStreet = function (T, renderer, scene, world, eagle) {
  const size = 2048;
  const target = new T.WebGLRenderTarget(size, size, {minFilter:T.NearestFilter, magFilter:T.NearestFilter});
  target.depthTexture = new T.DepthTexture(size, size, T.UnsignedIntType);
  const center = new T.Vector3(1916, 155, 4550);
  const camera = new T.OrthographicCamera(-365, 365, 188, -188, 20, 1450);
  camera.position.copy(center).addScaledVector(world.sunDirection, 750);
  camera.lookAt(center);
  camera.updateMatrixWorld();

  const block = new T.Scene();
  const depth = new T.MeshDepthMaterial({colorWrite:false, side:T.DoubleSide});
  const receivers = new Set();
  const cutouts = new Map();
  scene.updateMatrixWorld(true);
  scene.traverse(obj => {
    if(!obj.isMesh || !obj.name.startsWith('Keene '))return;
    const material=obj.material;
    if(material.alphaTest && material.map && !cutouts.has(material)){
      cutouts.set(material,new T.MeshDepthMaterial({map:material.map,alphaTest:material.alphaTest,
        colorWrite:false,side:T.DoubleSide}));
    }
    const proxy = new T.Mesh(obj.geometry, cutouts.get(material)||depth);
    proxy.matrixAutoUpdate = false;
    proxy.matrix.copy(obj.matrixWorld);
    block.add(proxy);
    for(const m of Array.isArray(obj.material)?obj.material:[obj.material])receivers.add(m);
  });

  const trees = world.trees.filter(t=>Math.abs(t.x-center.x)<395 && Math.abs(t.z-center.z)<430);
  const leafGeometry = new T.IcosahedronGeometry(1,1);
  const leafDepth = depth.clone();
  // A porous crown casts broken patches of light on glazing and masonry.
  leafDepth.onBeforeCompile = s => {
    s.vertexShader='varying vec3 canopyPoint;\n'+s.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n canopyPoint=(instanceMatrix*vec4(transformed,1.)).xyz;');
    s.fragmentShader='varying vec3 canopyPoint;\n'+s.fragmentShader.replace('#include <alphatest_fragment>',
      '#include <alphatest_fragment>\n vec3 cell=floor(canopyPoint*1.6);if(fract(sin(dot(cell,vec3(13.29,21.79,35.53)))*4375.24)<.21)discard;');
  };
  const crowns = new T.InstancedMesh(leafGeometry,leafDepth,trees.length);
  const dummy = new T.Object3D();
  trees.forEach((tree,i)=>{
    dummy.position.set(tree.x,tree.y+tree.height*.68,tree.z);
    dummy.rotation.set(.12,tree.seed*6.28,-.07);
    dummy.scale.set(tree.width*.42,tree.height*.28,tree.width*.44);
    dummy.updateMatrix();crowns.setMatrixAt(i,dummy.matrix);
  });
  crowns.computeBoundingSphere();block.add(crowns);
  const previousTarget=renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(target);renderer.clear();renderer.render(block,camera);
  } finally {
    renderer.setRenderTarget(previousTarget);
    leafGeometry.dispose();leafDepth.dispose();depth.dispose();crowns.dispose();
    for(const material of cutouts.values())material.dispose();
  }
  const projection = new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  const uniforms = {keeneDepth:{value:target.depthTexture},keeneSunMatrix:{value:projection}};
  const sampling = `uniform sampler2D keeneDepth; uniform mat4 keeneSunMatrix;
    float keeneVisibility(vec3 p){
      if(abs(p.x-1916.)>347. || abs(p.z-4550.)>360.)return 1.;
      vec3 sc=(keeneSunMatrix*vec4(p,1.)).xyz*.5+.5;
      float border=min(min(sc.x,1.-sc.x),min(sc.y,1.-sc.y));
      if(border<=0. || sc.z<=0. || sc.z>=1.)return 1.;
      float visible=0.;
      for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
        float hit=texture2D(keeneDepth,sc.xy+vec2(float(i),float(j))*.00052).x;
        visible+=step(sc.z-.00028,hit);
      }
      float edge=min(347.-abs(p.x-1916.),360.-abs(p.z-4550.));
      return mix(1.,visible/9.,smoothstep(0.,18.,edge)*smoothstep(0.,.01,border));
    }`;
  eagle.traverse(obj=>{
    if(obj.isMesh)for(const material of Array.isArray(obj.material)?obj.material:[obj.material])receivers.add(material);
  });
  for(const m of receivers){
    if(!m.isMeshStandardMaterial)continue;
    const previous=m.onBeforeCompile,cache=m.customProgramCacheKey();
    m.onBeforeCompile=function(s,r){
      previous.call(this,s,r);
      Object.assign(s.uniforms,uniforms);
      s.vertexShader='varying vec3 keenePosition;\n'+s.vertexShader.replace('#include <project_vertex>',
        '#include <project_vertex>\n keenePosition=(modelMatrix*vec4(transformed,1.)).xyz;');
      const lighting=T.ShaderChunk.lights_fragment_begin.replace('getDirectionalLightInfo( directionalLight, directLight );',
        'getDirectionalLightInfo( directionalLight, directLight ); directLight.color*=mix(.17,1.,streetSun);');
      if(s.fragmentShader.includes('directLight.color*=birdSunVisibility;')){
        s.fragmentShader=s.fragmentShader.replace('directLight.color*=birdSunVisibility;',
          'directLight.color*=birdSunVisibility*mix(.17,1.,keeneVisibility(keenePosition));');
      } else {
        s.fragmentShader=s.fragmentShader.replace('#include <lights_fragment_begin>',
          'float streetSun=keeneVisibility(keenePosition);\n'+lighting);
      }
      s.fragmentShader='varying vec3 keenePosition;\n'+sampling+'\n'+s.fragmentShader;
    };
    m.customProgramCacheKey=()=>cache+'-keene-block-light';
    m.needsUpdate=true;
  }
  const ground=world.cityTerrainMaterial;
  Object.assign(ground.uniforms,uniforms);
  ground.fragmentShader=sampling+'\n'+ground.fragmentShader.replace('float dep=1.-exp(-d*',
    'c*=mix(vec3(.55,.64,.78),vec3(1.),keeneVisibility(wp));\n float dep=1.-exp(-d*');
  ground.needsUpdate=true;
};
