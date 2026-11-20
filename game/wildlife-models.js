// Two contoured skins enclose each body. Wings and tail deform in body space,
// before the instance's bank, pitch, heading and world translation are applied.
window.makeWildlifeModels=function(T,scene){
  const textures={};
  for(const kind of ['birds','fish']){
    const tex=new T.TextureLoader().load('fauna-'+kind+'.webp');
    tex.anisotropy=8;textures[kind]=tex;
  }
  const batches=new Map(),group=new T.Group(),transform=new T.Object3D();
  group.name='Regional wildlife';scene.add(group);
  // A pair of spreading capillary ridges follows each paddling bird.
  const wakeGeo=new T.PlaneGeometry(1,1);
  wakeGeo.rotateX(-Math.PI/2);
  const wakes=new T.InstancedMesh(wakeGeo,new T.ShaderMaterial({
    transparent:true,depthWrite:false,side:T.DoubleSide,uniforms:{clock:{value:0}},
    vertexShader:`varying vec2 local;void main(){local=uv;
      gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 local;uniform float clock;void main(){
      float d=1.-local.x,side=abs(local.y-.5);
      float ridge=side-.035-d*(.24+.016*sin(18.*d-clock*3.));
      float light=1.-smoothstep(.002,.026,abs(ridge));
      float shadow=1.-smoothstep(.002,.020,abs(ridge+.031));
      float a=(light*.25+shadow*.12)*smoothstep(.0,.17,d)*(1.-smoothstep(.5,1.,d));
      gl_FragColor=vec4(mix(vec3(.13,.24,.25),vec3(.78,.83,.79),light),a);}`
  }),180);
  wakes.name='Paddling wakes';wakes.count=0;wakes.renderOrder=6;wakes.frustumCulled=false;group.add(wakes);
  const vertex=`
    attribute vec3 anatomy;attribute vec4 pose;
    varying vec2 st;varying float shade,submerged,incidence;
    void main(){
      vec3 p=position;float phase=pose.x,effort=pose.y,mode=pose.z;
      float u=anatomy.x,v=anatomy.y,wing=anatomy.z;
      if(isFish>.5){
        float tail=smoothstep(.27,1.,u);
        p.z+=sin(phase-5.4*u)*(.034+.105*effort)*tail*tail;
        p.z+=.008*sin(phase-2.8*u)*tail;p.y+=.009*tail*cos(phase-5.4*u);
      }else if(abs(wing)>.001){
        float span=abs(wing),side=sign(wing);
        float beat=sin(phase-span*.78),fold=max(0.,cos(phase-span*.7));
        float flap=beat*(.26+.70*effort)-.09+span*.12;
        p.y+=abs(p.z)*sin(flap);p.z*=cos(flap)*(1.-.22*fold*effort*span);
        p.x-=.14*span*span*fold*effort;
        if(mode<.5)p=vec3(-.1,.07,side*.05);
      }else{
        float head=1.-smoothstep(.13,.43,u),feet=smoothstep(.68,.96,v);
        p.y+=head*(.011*sin(phase*.49)+.016*max(0.,-mode));
        p.z+=head*.023*sin(phase*.31);
        if(mode>.5){p.x+=head*.17;p.y-=head*.07;p.y+=feet*.23;p.x-=feet*.09;}
        if(mode<-.5){p.y+=feet*.13;p.x-=feet*.028;}
        if(mode>-.5&&mode<.5)p.x+=feet*.039*sin(phase+6.*u);
      }
      vec4 wp=modelMatrix*instanceMatrix*vec4(p,1.);
      vec4 clip=projectionMatrix*viewMatrix*wp;
      vec3 ray=normalize(cameraPosition-wp.xyz);
      incidence=clamp(ray.y,0.,1.);submerged=0.;
      if(isFish>.5){
        submerged=max(.01,pose.w-wp.y);
        // Project apparent depth through the interface. The ray preserves
        // shoreline and eagle occlusion even on lakes with opaque reflections.
        if(ray.y>.015&&cameraPosition.y>pose.w){
          vec3 hit=wp.xyz+ray*((submerged+.055)/ray.y);
          vec4 surfaceClip=projectionMatrix*viewMatrix*vec4(hit,1.);
          if(surfaceClip.w>.1)clip.z=surfaceClip.z/surfaceClip.w*clip.w;
        }
      }
      shade=.85+.15*max(0.,normal.y)+.055*normal.z;
      st=uv;gl_Position=clip;
    }`;
  const fragment=`
    uniform sampler2D atlas;uniform float isFish;varying vec2 st;varying float shade,submerged,incidence;
    void main(){vec4 skin=texture2D(atlas,st);if(skin.a<.36)discard;
      vec3 color=skin.rgb*shade;float alpha=1.;
      if(isFish>.5){float path=submerged/max(.22,incidence);
        color=mix(color,vec3(.14,.31,.30),.18+.55*(1.-exp(-path*.36)));
        alpha=(.44+.46*incidence)*smoothstep(.035,.30,incidence);}
      gl_FragColor=vec4(color,alpha);}`;
  function batchFor(key){
    if(batches.has(key))return batches.get(key);
    const [kind,aspect,rect,encoded]=window.faunaShapes[key],fish=kind==='fish';
    const depth=atob(encoded),pos=[],uv=[],anatomy=[],indices=[];
    const [left,top,width,height]=rect;
    function vertexAt(x,y,z,u,v,wing=0){
      pos.push(x,y,z);uv.push(left+u*width,1-top-v*height);anatomy.push(u,v,wing);return pos.length/3-1;
    }
    const nx=24,ny=15,thickness=fish?Math.min(.106,aspect*.32):Math.min(.17,aspect*.30);
    for(const side of [1,-1]){
      const base=pos.length/3;
      for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
        const u=i/nx,v=j/ny,d=depth.charCodeAt(j*2*49+i*2)/255;
        vertexAt(.5-u,(.5-v)*aspect,side*thickness*d,u,v);
        if(i&&j){const a=base+j*(nx+1)+i,b=a-nx-1;
          if(side>0)indices.push(a,a-1,b,b,a-1,b-1);else indices.push(b,a-1,a,b-1,a-1,b);}
      }
    }
    const size=window.aerieFauna.sizes[key.replace(/-hen$/,'')]||window.aerieFauna.sizes[key==='young-goose'?'goose':''];
    if(size){
      const span=size[1]/size[0]*.5;
      for(const side of [1,-1]){
        const base=pos.length/3;
        for(let i=0;i<=24;i++){
          const f=i/24,leading=.19-.32*f*f;
          const chord=(.285+.17*Math.sin(Math.PI*f))*(1-Math.pow(f,2.8))+.012;
          const notch=f>.64&&i%2===0?.058*f:0;
          vertexAt(leading,.068+.032*(1-f),side*(.044+span*f),.40+.27*f,.43,side*(.001+.999*f));
          vertexAt(leading-chord+notch,.047,side*(.044+span*f),.51+.26*f,.58,side*(.001+.999*f));
          if(i){const a=base+2*i;indices.push(a-2,a-1,a,a,a-1,a+1);}
        }
      }
    }
    const geometry=new T.BufferGeometry();
    for(const [name,values,n] of [['position',pos,3],['uv',uv,2],['anatomy',anatomy,3]])geometry.setAttribute(name,new T.Float32BufferAttribute(values,n));
    geometry.setIndex(indices);geometry.computeVertexNormals();
    const material=new T.ShaderMaterial({uniforms:{atlas:{value:textures[kind]},isFish:{value:fish?1:0}},
      vertexShader:'uniform float isFish;\n'+vertex,fragmentShader:fragment,side:T.DoubleSide,transparent:fish,depthWrite:!fish});
    const capacity=320,mesh=new T.InstancedMesh(geometry,material,capacity);
    mesh.name=key;mesh.frustumCulled=false;mesh.count=0;mesh.renderOrder=fish?5:0;
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    const pose=new T.InstancedBufferAttribute(new Float32Array(capacity*4),4).setUsage(T.DynamicDrawUsage);
    geometry.setAttribute('pose',pose);group.add(mesh);
    const batch={mesh,pose};batches.set(key,batch);return batch;
  }
  function draw(a){
    if(a.mode===-1&&a.behavior==='paddling'&&wakes.count<180){
      const length=2.9*a.length;
      transform.position.set(a.x-Math.cos(a.heading)*length*.55,a.level+.024,a.z-Math.sin(a.heading)*length*.55);
      transform.rotation.set(0,-a.heading,0);transform.scale.set(length,1,length*.70);transform.updateMatrix();
      wakes.setMatrixAt(wakes.count++,transform.matrix);
    }
    const {mesh,pose}=batchFor(a.skin),i=mesh.count;
    if(i>=pose.count)return;
    transform.position.set(a.x,a.y,a.z);transform.rotation.set(a.bank||0,-a.heading,a.pitch||0,'YXZ');
    transform.scale.setScalar(a.length);transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);
    pose.setXYZW(i,a.phase,a.effort,a.mode,a.level||0);mesh.count++;
  }
  return {begin(t){wakes.count=0;wakes.material.uniforms.clock.value=t;for(const {mesh} of batches.values())mesh.count=0;},draw,
    end(){wakes.instanceMatrix.needsUpdate=true;for(const {mesh,pose} of batches.values()){mesh.visible=mesh.count>0;mesh.instanceMatrix.needsUpdate=true;pose.needsUpdate=true;}}};
};
