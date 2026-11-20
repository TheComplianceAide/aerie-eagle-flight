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
    varying vec2 st;varying float shade,submerged,incidence,scaleFlash;
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
      incidence=clamp(ray.y,0.,1.);submerged=0.;scaleFlash=0.;
      if(isFish>.5){
        submerged=max(.01,pose.w-wp.y);
        vec3 bodyNormal=normalize(mat3(modelMatrix*instanceMatrix)*normal);
        vec3 halfLight=normalize(ray+normalize(vec3(-.4,.83,.34)));
        scaleFlash=pow(max(dot(bodyNormal,halfLight),0.),7.);

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
    uniform sampler2D atlas;uniform float isFish;varying vec2 st;varying float shade,submerged,incidence,scaleFlash;
    void main(){vec4 skin=texture2D(atlas,st);if(skin.a<.36)discard;
      vec3 color=skin.rgb*shade;float alpha=1.;
      if(isFish>.5){float path=submerged/max(.22,incidence);
        float transmission=exp(-.35*path);
        color=mix(vec3(.13,.30,.29),color+vec3(.29,.32,.33)*scaleFlash,transmission);
        float fresnel=.025+.975*pow(1.-incidence,5.);
        alpha=(1.-fresnel)*(.76+.22*transmission)*smoothstep(.018,.16,incidence);}
      gl_FragColor=vec4(color,alpha);}`;
  function batchFor(key){
    if(batches.has(key))return batches.get(key);
    const [kind,aspect,rect,encoded,skinFile]=window.faunaShapes[key],fish=kind==='fish';
    const skin=skinFile?new T.TextureLoader().load(skinFile):textures[kind];
    if(skinFile)skin.anisotropy=8;
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
    const material=new T.ShaderMaterial({uniforms:{atlas:{value:skin},isFish:{value:fish?1:0}},
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
    if(i>=pose.count)return false;
    transform.position.set(a.x,a.y,a.z);transform.rotation.set(a.bank||0,-a.heading,a.pitch||0,'YXZ');
    transform.scale.setScalar(a.length);transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);
    pose.setXYZW(i,a.phase,a.effort,a.mode,a.level||0);mesh.count++;return true;
  }
  return {begin(t){wakes.count=0;wakes.material.uniforms.clock.value=t;for(const {mesh} of batches.values())mesh.count=0;},draw,
    end(){wakes.instanceMatrix.needsUpdate=true;for(const {mesh,pose} of batches.values()){mesh.visible=mesh.count>0;mesh.instanceMatrix.needsUpdate=true;pose.needsUpdate=true;}}};
};

// A shallow tail stroke releases a wave packet at a fixed point on the water.
// The steep face reflects sky while the trough shows the darker water beneath.
window.makeFishRipples=function(T,scene,world,waterAt){
  const capacity=96,packets=new Array(capacity);
  let next=0,previousTime=-1;
  const geometry=new T.PlaneGeometry(2,2);
  geometry.rotateX(-Math.PI/2);
  const flow=new T.InstancedBufferAttribute(new Float32Array(capacity*4),4).setUsage(T.DynamicDrawUsage);
  geometry.setAttribute('flow',flow);
  const material=new T.ShaderMaterial({
    transparent:true,depthWrite:false,side:T.FrontSide,
    uniforms:{sky:{value:world.skyTexture},sun:{value:world.sunDirection||new T.Vector3(-.4,.6,.5)}},
    vertexShader:`attribute vec4 flow;varying vec4 pulse;varying vec2 point;varying vec3 positionW;
      void main(){pulse=flow;point=uv*2.-1.;vec4 wp=modelMatrix*instanceMatrix*vec4(position,1.);
        positionW=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}`,
    fragmentShader:`uniform sampler2D sky;uniform vec3 sun;varying vec4 pulse;varying vec2 point;varying vec3 positionW;
      void main(){
        float age=pulse.x,seed=pulse.y,amplitude=pulse.z,angle=pulse.w;
        float radius=length(point);if(radius>=1.)discard;
        float theta=atan(point.y,point.x);
        // Two asymmetric lobes curl away from the tail and flatten into rings.
        float phase=theta+seed+2.3*radius-2.5*age;
        float r=radius*(1.+.10*sin(phase*2.)+.048*sin(3.*phase));
        float front=.095+.81*age;
        float spread=.15+.12*age;
        float delta=r-front;
        float packet=exp(-delta*delta/(spread*spread));
        float k=53.-7.*age;
        float band=k*delta+1.35*sin(phase)*exp(-3.*age)+.36*sin(5.*phase+7.*radius);
        float tilt=sin(band)*packet;
        float fade=smoothstep(0.,.065,age)*(1.-smoothstep(.47,1.,age))*(1.-smoothstep(.86,1.,radius));
        vec2 outward=normalize(point+vec2(.0001));
        outward+=vec2(-outward.y,outward.x)*.23*cos(phase);
        vec2 slope=vec2(cos(angle)*outward.x+sin(angle)*outward.y,sin(angle)*outward.x-cos(angle)*outward.y);
        vec3 v=normalize(cameraPosition-positionW),n=normalize(vec3(-slope.x*tilt*.33,1.,-slope.y*tilt*.33));
        vec3 reflected=reflect(-v,n);
        vec3 skyColor=texture2D(sky,vec2(.5+atan(reflected.z,reflected.x)/6.283185,
          .5+asin(clamp(reflected.y,-1.,1.))/3.141593)).rgb;
        float facing=dot(slope,normalize(v.xz+vec2(.0001)));
        float crest=clamp(.5+.5*tilt*facing,0.,1.);
        float arc=.40+.60*smoothstep(-.58,.72,cos(phase)+.31*sin(3.*theta+seed));
        vec3 water=mix(vec3(.055,.15,.155),skyColor*.8+vec3(.15,.17,.17),crest);
        water+=vec3(1.,.84,.59)*.48*pow(max(dot(n,normalize(v+sun)),0.),32.);
        float aa=1.-smoothstep(.06,.23,fwidth(radius));
        float alpha=amplitude*fade*packet*abs(tilt)*aa*arc*(.40+.22*crest);
        if(alpha<.009)discard;
        gl_FragColor=vec4(water,alpha);
      }`
  });
  const mesh=new T.InstancedMesh(geometry,material,capacity);
  mesh.name='Fish surface swirls';mesh.frustumCulled=false;mesh.count=0;mesh.renderOrder=6;
  mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(mesh);
  const tangent=new T.Vector3(),normal=new T.Vector3(),across=new T.Vector3();
  function emit(fish,t,strength){
    const c=Math.cos(fish.heading),s=Math.sin(fish.heading);
    const x=fish.x-c*fish.length*.34,z=fish.z-s*fish.length*.34,level=waterAt(x,z);
    if(!Number.isFinite(level))return;
    let radius=Math.min(1.8,fish.length*(2+strength*.76));
    // Fit the entire footprint to wet terrain, including narrow streams.
    for(let pass=0;pass<3;pass++){
      let fits=true;
      for(let i=0;i<8;i++){
        const a=i*Math.PI/4;
        if(!Number.isFinite(waterAt(x+radius*Math.cos(a),z+radius*Math.sin(a)))){fits=false;break;}
      }
      if(fits)break;
      radius*=.53;
      if(pass===2)return;
    }
    const forward=waterAt(x+radius*c,z+radius*s),side=waterAt(x-radius*s,z+radius*c);
    if(!Number.isFinite(forward)||!Number.isFinite(side))return;
    const fx=(forward-level)/radius,fz=(side-level)/radius;
    if(Math.abs(fx)+Math.abs(fz)>.65)return;
    tangent.set(c,fx,s).normalize();across.set(-s,fz,c).normalize();
    normal.crossVectors(across,tangent).normalize();across.crossVectors(tangent,normal).normalize();
    const basis=new T.Matrix4().makeBasis(tangent,normal,across);
    basis.scale(new T.Vector3(radius,1,radius*.85)).setPosition(x,level+.025,z);
    packets[next]={basis,t,life:1.55+radius*.72,seed:fish.seed,strength,heading:fish.heading};
    next=(next+1)%capacity;
  }
  function update(player,t){
    if(t<previousTime)packets.fill(null);
    previousTime=t;mesh.count=0;
    for(let i=0;i<capacity;i++){
      const p=packets[i];if(!p)continue;
      const age=(t-p.t)/p.life;
      if(age>=1||age<0){packets[i]=null;continue;}
      const pos=p.basis.elements;
      if(Math.hypot(pos[12]-player.x,pos[13]-player.y,pos[14]-player.z)>115)continue;
      const j=mesh.count++;mesh.setMatrixAt(j,p.basis);
      flow.setXYZW(j,age,p.seed,p.strength,p.heading);
    }
    mesh.visible=mesh.count>0;mesh.instanceMatrix.needsUpdate=true;flow.needsUpdate=true;
  }
  return {emit,update};
};
