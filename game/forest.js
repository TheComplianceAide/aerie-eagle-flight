// Near trees use volume-fitted boughs and trunks. Distant crowns select an
// azimuth and elevation capture of the same tree as the eagle circles it.
window.addForest = function addForest(THREE, scene, world) {
  const forest = world.firTrees || world.trees;
  if (!forest || !forest.length || !window.firAsset) return;
  const asset = window.firAsset;
  const mobile=matchMedia("(pointer: coarse)").matches;
  const sunlightSpan=(world.forestLightSpan || 8000).toFixed(1);
  const loader = new THREE.TextureLoader();
  function colorMap(path) {
    const map = loader.load(path);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    return map;
  }
  const crown = colorMap(asset.nearTexture);
  const distant = colorMap(asset.farTexture);
  const nearMaterial = new THREE.MeshStandardMaterial({
    map: crown, alphaTest: .22, alphaToCoverage: true, roughness: 1,
    side: THREE.DoubleSide, metalness: 0
  });
  // A small movement at the ends of the boughs; the trunk remains anchored.
  const time = {value: 0};
  const observer = {value:new THREE.Vector3()};
  nearMaterial.onBeforeCompile = shader => {
    shader.uniforms.firTime = time;
    shader.uniforms.surveyLight = {value:world.sunMask};
    shader.vertexShader = 'uniform float firTime;uniform sampler2D surveyLight;varying float inSun;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       inSun = texture2D(surveyLight,vec2(.5+instanceMatrix[3].x/${sunlightSpan},.5-instanceMatrix[3].z/${sunlightSpan})).r;
       float offset = dot(instanceMatrix[3].xz, vec2(.014, .027));
       float breeze=sin(firTime*.69+dot(instanceMatrix[3].xz,vec2(.033,.018)));
       float flutter=sin(firTime*2.8-offset+dot(position.xz,vec2(2.1,1.3)));
       float bend=.0026*max(0.,position.y)*length(position.xz)*(breeze+.32*flutter);
       transformed.xz+=vec2(bend,bend*.47);
       transformed.y+=.007*length(position.xz)*flutter;`);
    shader.fragmentShader='varying float inSun;\n'+shader.fragmentShader.replace(
      '#include <color_fragment>',
      '#include <color_fragment>\n diffuseColor.rgb *= mix(vec3(.47,.55,.65),vec3(.94,.98,.88),inSun);');
  };
  const cellSize = 80;
  const cells = new Map();
  const key = (i,j) => (i+2000)*4096 + j+2000;
  const pseudo = n => (Math.sin(n*127.1+29.4)*43758.5453)%1 + 1;
  function random(n) {return pseudo(n)%1;}
  forest.forEach((tree,index) => {
    const h = tree.height;
    if (!(h > 3 && Number.isFinite(tree.y))) return;
    const i = Math.floor(tree.x/cellSize), j = Math.floor(tree.z/cellSize);
    const k = key(i,j);
    if (!cells.has(k)) cells.set(k,[]);
    const variantIndex = Math.min(asset.variants.length-1,Math.floor(random(index+3)*asset.variants.length));
    const variant = asset.variants[variantIndex];
    const sy = h / variant.height;
    const sx = tree.width ? tree.width/variant.width : sy*(.91+random(index+19)*.21);
    const root = {x:tree.x,y:tree.y,z:tree.z,h,sx,sy,variantIndex,
      radius:variant.width*sx*.5,rotation:random(index+51)*Math.PI*2,
      color:.83+.25*random(index+97)};
    cells.get(k).push(root);
  });
  const farVertex = `
    attribute vec3 rootPosition;
    attribute vec4 dimensions;
    uniform vec4 uvCrops[8];
    uniform vec3 observer,sunDirection;
    uniform sampler2D surveyLight;
    uniform vec2 captureSizes[8];
    uniform vec3 captureCenters[8];
    varying vec2 uvFirst,uvMiddle,uvLast;
    varying vec3 blend;
    varying vec3 tint;
    #include <fog_pars_vertex>
    void main(){
      float spin = dimensions.z;
      vec3 viewDir = normalize(cameraPosition-rootPosition-vec3(0.,dimensions.y*7.,0.));
      float yaw = (atan(viewDir.x,viewDir.z)-spin)*.63661977;
      int first=int(mod(floor(yaw),4.)),next=int(mod(floor(yaw)+1.,4.));
      float az=smoothstep(.20,.80,fract(yaw));
      float elevation=smoothstep(.28,.71,max(viewDir.y,0.));
      // Barycentric interpolation between three surrounding captures preserves
      // the silhouette as the eagle flies over, banks, or sees a lake reflection.
      int middle=az>elevation?next:first+4,last=next+4;
      blend=vec3(1.-max(az,elevation),abs(az-elevation),min(az,elevation));
      vec3 c=(blend.x*captureCenters[first]+blend.y*captureCenters[middle]+blend.z*captureCenters[last])*vec3(dimensions.x,dimensions.y,dimensions.x);
      c.xz = mat2(cos(spin),-sin(spin),sin(spin),cos(spin))*c.xz;
      vec3 right = normalize(vec3(viewDir.z,0.,-viewDir.x)+vec3(.00001,0.,0.));
      vec3 up = normalize(cross(viewDir,right));
      vec2 size = (blend.x*captureSizes[first]+blend.y*captureSizes[middle]+blend.z*captureSizes[last])*dimensions.xy;
      vec3 wp = rootPosition+c+right*(position.x*size.x)+up*(position.y*size.y);
      uvFirst=mix(uvCrops[first].xy,uvCrops[first].zw,uv);
      uvMiddle=mix(uvCrops[middle].xy,uvCrops[middle].zw,uv);
      uvLast=mix(uvCrops[last].xy,uvCrops[last].zw,uv);
      float localSun=texture2D(surveyLight,vec2(.5+rootPosition.x/${sunlightSpan},.5-rootPosition.z/${sunlightSpan})).r;
      float facing=dot(normalize(vec3(viewDir.x,max(.2,viewDir.y),viewDir.z)),sunDirection);
      tint=dimensions.w*mix(vec3(.47,.58,.67),vec3(.89,.98,.90)*(.92+.14*facing),localSun);
      vec4 mvPosition=viewMatrix*vec4(wp,1.);
      gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
    }`;
  const farFragment = `
    uniform sampler2D captures;
    varying vec2 uvFirst,uvMiddle,uvLast;
    varying vec3 blend;
    varying vec3 tint;
    #include <common>
    #include <fog_pars_fragment>
    void main(){
      vec4 sampleA=texture2D(captures,uvFirst);
      vec4 sampleB=texture2D(captures,uvMiddle);
      vec4 sampleC=texture2D(captures,uvLast);
      vec3 weights=pow(blend,vec3(1.75));weights/=max(dot(weights,vec3(1.)),.0001);
      vec3 opacity=weights*vec3(sampleA.a,sampleB.a,sampleC.a);
      float coverage=opacity.x+opacity.y+opacity.z;
      if (coverage < .16) discard;
      vec3 color=(sampleA.rgb*opacity.x+sampleB.rgb*opacity.y+sampleC.rgb*opacity.z)/coverage;
      gl_FragColor=vec4(color*tint,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`;
  const records = asset.variants.map(v => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position',new THREE.Float32BufferAttribute(v.positions,3));
    geom.setAttribute('normal',new THREE.Float32BufferAttribute(v.normals,3));
    geom.setAttribute('uv',new THREE.Float32BufferAttribute(v.uv,2));
    geom.setIndex(v.indices);
    const near = new THREE.InstancedMesh(geom,nearMaterial,mobile?400:780);
    near.frustumCulled=false;
    near.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    near.count=0;
    scene.add(near);
    const rectangle = new THREE.PlaneGeometry(1,1);
    const views=v.farViews;
    const uniforms=THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
    Object.assign(uniforms,{
      observer,sunDirection:{value:world.sunDirection||new THREE.Vector3(-.5,.65,-.55)},surveyLight:{value:world.sunMask},captures:{value:distant},uvCrops:{value:views.map(f=>new THREE.Vector4(...f.uv))},
      captureSizes:{value:views.map(f=>new THREE.Vector2(f.width,f.height))},
      captureCenters:{value:views.map(f=>new THREE.Vector3(...f.center))}
    });
    const standMaterial=new THREE.ShaderMaterial({uniforms,fragmentShader:farFragment,fog:true,
      vertexShader:"attribute float promoted,reachSquared;\n"+farVertex.replace("float spin = dimensions.z;", `
        vec3 delta=observer-rootPosition;
        if(promoted>.5||dot(delta,delta)>reachSquared){gl_Position=vec4(2.,2.,2.,1.);return;}
        float spin = dimensions.z;`)
    });
    return {near,rectangle,standMaterial};
  });
  // Keep ridgeline crowns resident in spatial batches. As the viewer approaches
  // the same tree, its surveyed root and silhouette are retained through the
  // switch to fully modelled branches. Only nearby promotions change on the CPU.
  let promoted=[];
  {
    const groups=new Map();
    for(const bucket of cells.values())for(const t of bucket){
      const key=t.variantIndex+":"+Math.floor(t.x/1600)+":"+Math.floor(t.z/1600);
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(t);
    }
    for(const stand of groups.values()){
      const record=records[stand[0].variantIndex];
      const g=new THREE.InstancedBufferGeometry();
      g.setIndex(record.rectangle.index);
      g.setAttribute("position",record.rectangle.attributes.position);
      g.setAttribute("uv",record.rectangle.attributes.uv);
      const roots=new Float32Array(3*stand.length),sizes=new Float32Array(4*stand.length);
      const limits=new Float32Array(stand.length),hidden=new THREE.InstancedBufferAttribute(new Float32Array(stand.length),1);
      const bounds=new THREE.Box3();
      const point=new THREE.Vector3();
      stand.forEach((t,k)=>{
        roots.set([t.x,t.y-.2,t.z],3*k);sizes.set([t.sx,t.sy,t.rotation,t.color],4*k);
        const maxDistance=Math.min(11200,Math.max(2900,t.h*(mobile?240:360)))*(.83+.34*random(t.x*.73+t.z*.21));
        limits[k]=maxDistance*maxDistance;
        t.hidden=hidden;t.slot=k;
        bounds.expandByPoint(point.set(t.x,t.y,t.z));
      });
      bounds.expandByScalar(45);
      g.boundingSphere=bounds.getBoundingSphere(new THREE.Sphere());
      g.instanceCount=stand.length;
      g.setAttribute("rootPosition",new THREE.InstancedBufferAttribute(roots,3));
      g.setAttribute("dimensions",new THREE.InstancedBufferAttribute(sizes,4));
      g.setAttribute("reachSquared",new THREE.InstancedBufferAttribute(limits,1));
      g.setAttribute("promoted",hidden.setUsage(THREE.DynamicDrawUsage));
      const canopy=new THREE.Mesh(g,record.standMaterial);
      canopy.name="Surveyed spruce stand";scene.add(canopy);
    }
  }
  const transform=new THREE.Object3D(), color=new THREE.Color();
  const previous=new THREE.Vector3(Infinity,Infinity,Infinity);
  function update(player,elapsed) {
    time.value=elapsed;observer.value.copy(player);
    if(player.distanceToSquared(previous)<100)return;
    previous.copy(player);
    for(const b of records)b.near.count=0;
    const i0=Math.floor(player.x/cellSize),j0=Math.floor(player.z/cellSize);
    const maxCells=Math.ceil((mobile?400:690)/cellSize);
    const previousPromoted=promoted;
    promoted=[];
    // Visit closer cells first to keep the nearest canopy at full density.
    for(let ring=0;ring<=maxCells;ring++) {
      for(let i=-ring;i<=ring;i++) {
        for(let j=-ring;j<=ring;j++) {
          if(Math.max(Math.abs(i),Math.abs(j))!==ring)continue;
          const trees=cells.get(key(i+i0,j+j0));
          if(!trees)continue;
          for(const t of trees){
            const dx=player.x-t.x,dz=player.z-t.z,dy=player.y-t.y-t.h*.55;
            const d2=dx*dx+dz*dz+dy*dy;
            const b=records[t.variantIndex];
            const nearRange=Math.min(mobile?360:620,Math.max(145,t.h*(mobile?17:26)));
            if(d2<nearRange*nearRange && b.near.count<b.near.instanceMatrix.count){
              promoted.push(t);t.nextNear=true;
              if(!t.hidden.getX(t.slot)){t.hidden.setX(t.slot,1);t.hidden.needsUpdate=true;}
              const n=b.near.count++;
              transform.position.set(t.x,t.y-.20,t.z);
              transform.rotation.y=t.rotation;
              transform.scale.set(t.sx,t.sy,t.sx);
              transform.updateMatrix();b.near.setMatrixAt(n,transform.matrix);
              color.setRGB(t.color,t.color,t.color);b.near.setColorAt(n,color);

            }
          }
        }
      }
    }
    for(const t of previousPromoted)if(!t.nextNear){t.hidden.setX(t.slot,0);t.hidden.needsUpdate=true;}
    for(const t of promoted)t.nextNear=false;
    for(const b of records){
      b.near.instanceMatrix.needsUpdate=true;
      if(b.near.instanceColor)b.near.instanceColor.needsUpdate=true;
    }
  }
  update(new THREE.Vector3(world.spawn.x,world.spawn.y,world.spawn.z),0);
  return update;
};
