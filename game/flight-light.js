// A local sun shadow retains feather detail during wingbeats and lands on nearby
// surfaces during low passes. The terrain survey supplies long-range occlusion.
window.makeFlightLight = function makeFlightLight(THREE, renderer, scene, world, eagle) {
  const light=scene.children.find(node=>node.isDirectionalLight);
  if(!light)return ()=>{};
  const sun=world.sunDirection;
  const shadow=light.shadow;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  light.castShadow=true;
  Object.assign(shadow.camera,{left:-2,right:2,top:2,bottom:-2,near:.4,far:165});
  shadow.camera.updateProjectionMatrix();
  shadow.mapSize.set(1024,1024);
  shadow.normalBias=.0014;
  shadow.bias=-.00005;
  scene.add(light.target);
  const directVisibility={value:1};
  const probe=window.makeTerrainBounce(THREE,scene,world);
  const terrainLighting=`
    vec3 facing=inverseTransformDirection(geometryNormal,viewMatrix);
    vec3 weight=facing*facing;
    int ix=facing.x>=0.?0:1,iz=facing.z>=0.?2:3,iy=facing.y>=0.?4:5;
    vec3 diffuseTerrain=weight.x*terrainBounce[ix]+weight.y*terrainBounce[iy]+weight.z*terrainBounce[iz];
    float cover=weight.x*terrainCover[ix]+weight.y*terrainCover[iy]+weight.z*terrainCover[iz];
    reflectedLight.indirectDiffuse*=1.-.40*clamp(cover,0.,1.);
    // Thin overlapping vanes scatter a small fraction of incident side light
    // through their edges. The dominant lobe remains on the illuminated side.
    vec3 sideLight=.25*(terrainBounce[0]+terrainBounce[1]+terrainBounce[2]+terrainBounce[3]);
    reflectedLight.indirectDiffuse+=material.diffuseColor*(diffuseTerrain+.22*sideLight);`;
  const changed=new Set();
  const lightChunk=THREE.ShaderChunk.lights_fragment_begin.replace(
    'getDirectionalLightInfo( directionalLight, directLight );',
    'getDirectionalLightInfo( directionalLight, directLight ); directLight.color*=birdSunVisibility;');
  eagle.object.traverse(obj=>{
    if(!obj.isMesh)return;
    obj.receiveShadow=true;
    for(const m of Array.isArray(obj.material)?obj.material:[obj.material]){
      if(!m.isMeshStandardMaterial||changed.has(m))continue;
      changed.add(m);
      // Modify the sunlight term after the feather shader has installed its
      // own maps and animation. Diffuse sky light still reaches a shaded bird.
      const before=m.onBeforeCompile,cacheKey=m.customProgramCacheKey();
      m.onBeforeCompile=function(shader,renderer){
        before.call(this,shader,renderer);
        shader.uniforms.birdSunVisibility=directVisibility;
        shader.uniforms.terrainBounce={value:probe.value};shader.uniforms.terrainCover={value:probe.blocked};
        shader.fragmentShader='uniform float birdSunVisibility;uniform vec3 terrainBounce[6];uniform float terrainCover[6];\n'+shader.fragmentShader
          .replace('#include <lights_fragment_begin>',lightChunk)
          .replace('#include <lights_fragment_end>','#include <lights_fragment_end>\n'+terrainLighting);
      };
      m.customProgramCacheKey=()=>cacheKey+':sun-occlusion';
    }
  });
  for(const obj of scene.children){
    if(obj.material?.uniforms?.mirrorSampler)obj.receiveShadow=true;
    if(obj.isInstancedMesh)obj.receiveShadow=true;
  }
  // A filtered sky panorama gives glossy feather ridges and wet granite a
  // different response from rough bark even as the eagle turns away from the sun.
  if(world.skyTexture?.image){
    const small=document.createElement('canvas');
    small.width=512;small.height=256;
    small.getContext('2d').drawImage(world.skyTexture.image,0,0,512,256);
    // The eagle, branches and cabin walls share the actual panorama's diffuse
    // skylight. In sunset valleys the upper sky stays cooler than direct sun.
    const ctx=small.getContext('2d');
    const pixels=ctx.getImageData(0,0,512,110).data;
    const skylight=new THREE.Color(0,0,0),pixel=new THREE.Color();
    let weight=0;
    for(let y=10;y<110;y+=5)for(let x=0;x<512;x+=6){
      const i=(y*512+x)*4;
      pixel.setRGB(pixels[i]/255,pixels[i+1]/255,pixels[i+2]/255,THREE.SRGBColorSpace);
      const w=Math.sin((y+.5)*Math.PI/256)*Math.cos((y+.5)*Math.PI/256);
      skylight.r+=pixel.r*w;skylight.g+=pixel.g*w;skylight.b+=pixel.b*w;weight+=w;
    }
    skylight.multiplyScalar(1/weight);
    const hemi=scene.children.find(o=>o.isHemisphereLight);
    if(hemi){
      const luminance=skylight.getLuminance?skylight.getLuminance():.2126*skylight.r+.7152*skylight.g+.0722*skylight.b;
      hemi.color.copy(skylight).multiplyScalar(.83/Math.max(.18,luminance)).lerp(new THREE.Color(.89,.92,.96),.40);
      hemi.intensity*=.86;
    }
    let reflection;
    function prepareReflection(){
      const sky=new THREE.CanvasTexture(small);
      sky.colorSpace=THREE.SRGBColorSpace;
      sky.mapping=THREE.EquirectangularReflectionMapping;
      const generator=new THREE.PMREMGenerator(renderer);
      try {
        reflection=generator.fromEquirectangular(sky);
        scene.environment=reflection.texture;
      } finally {generator.dispose();sky.dispose();}
    }
    prepareReflection();
    // This target contains generated pixels and must be rendered again after GPU loss.
    update.releaseReflection=()=>{
      reflection?.dispose();reflection=null;scene.environment=null;
    };
    update.restoreReflection=prepareReflection;
    scene.traverse(obj=>{
      if(!obj.material)return;
      const materials=Array.isArray(obj.material)?obj.material:[obj.material];
      for(const m of materials)if(m.isMeshStandardMaterial)m.envMapIntensity=changed.has(m)?.44:.33;
    });
  }
  // Custom survey surfaces have their own terrain illumination. A local
  // receiver conforms to that same elevation mesh and uses the live skinned
  // shadow map, so the eagle's moving wing silhouette crosses the bank.
  const receiverMaterial=new THREE.ShadowMaterial({opacity:.28,transparent:true,depthWrite:false,
    polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2,side:THREE.DoubleSide});
  const receiverGeometry=new THREE.PlaneGeometry(1,1,5,5);
  receiverGeometry.rotateX(-Math.PI/2);
  const receiver=new THREE.Mesh(receiverGeometry,receiverMaterial);
  receiver.name='Flying eagle ground shadow';receiver.frustumCulled=false;receiver.receiveShadow=true;
  receiver.visible=false;scene.add(receiver);
  const receiverCoords=receiverGeometry.attributes.position.array.slice();
  let nextReceiver=0;
  function updateReceiver(player,elapsed){
    if(elapsed<nextReceiver&&elapsed>=previousTime)return;
    nextReceiver=elapsed+.035;
    const ground=world.elevation(player.x,player.z);
    receiver.visible=false;
    if(player.y-ground>105||sun.y<.09)return;
    let distance=0,margin=player.y-ground,low=0;
    // Find the first terrain intersection along the sun ray, including banks
    // rising beside the bird. Away from terrain the patch stays off the GPU.
    while(margin>0&&distance<154){
      low=distance;distance+=Math.min(11,Math.max(1.2,margin*.38));
      margin=player.y-sun.y*distance-world.elevation(player.x-sun.x*distance,player.z-sun.z*distance);
    }
    if(margin>0||distance>=154)return;
    for(let i=0;i<6;i++){
      const mid=(low+distance)*.5;
      if(player.y-sun.y*mid>world.elevation(player.x-sun.x*mid,player.z-sun.z*mid))low=mid;
      else distance=mid;
    }
    const x=player.x-sun.x*distance,z=player.z-sun.z*distance;
    const hit=world.elevation(x,z),water=world.waterLevel;
    if(Number.isFinite(water)&&hit<water-.4)return;
    const width=Math.min(26,7/Math.max(.15,sun.y));
    const pos=receiverGeometry.attributes.position;
    for(let i=0;i<pos.count;i++){
      const px=x+receiverCoords[i*3]*width,pz=z+receiverCoords[i*3+2]*width;
      pos.setXYZ(i,px,world.elevation(px,pz)+.045,pz);
    }
    pos.needsUpdate=true;receiverGeometry.computeVertexNormals();
    receiverMaterial.opacity=exposure*(.38-.23*THREE.MathUtils.smoothstep(distance,10,140));
    receiver.visible=true;
  }
  let nextSample=-1,previousTime=-1,exposure=1,target=1;
  const sampleLengths=[8,18,40,85,160,300,550,950,1600,2700,4500,7200,11000];
  function update(player,elapsed){
    probe.update(player,elapsed);
    light.position.copy(player).addScaledVector(sun,7);
    light.target.position.copy(player);
    if(elapsed<previousTime)nextSample=-1;
    if(elapsed>=nextSample){
      target=1;nextSample=elapsed+.22;
      for(const r of sampleLengths){
        const x=player.x+r*sun.x,z=player.z+r*sun.z;
        const margin=player.y+r*sun.y-world.elevation(x,z);
        target=Math.min(target,THREE.MathUtils.smoothstep(margin,-6,10));
      }
    }
    updateReceiver(player,elapsed);
    const dt=elapsed<previousTime?.2:Math.max(0,elapsed-previousTime);
    exposure+=(target-exposure)*(1-Math.exp(-3*dt));previousTime=elapsed;
    directVisibility.value=exposure;
  }
  return update;
};
