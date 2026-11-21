// Ocean Path at mid-tide. The foam mesh follows the measured 3DEP waterline;
// the planar ocean remains visible through the gaps between crests.
window.addAcadiaCoast=function addAcadiaCoast(T,scene,world){
  const water=scene.children.find(o=>o.isWater);
  if(!water)return;
  water.material.userData.shadowDirectWater=true;
  const level=water.position.y,clock={value:0};
  // Thunder Hole's NAIP-mapped cleft faces southeast. Wave groups share a
  // period with the local breaker line. The strongest few crests vent spray.
  const period=7.6;
  const groupStrength=cycle=>.74+.20*Math.sin(cycle*1.53+.2)+.13*Math.sin(cycle*.73+1.04);
  function surge(t){
    const turns=t/period+.72,cycle=Math.floor(turns),age=(turns-cycle)*period;
    return Math.min(1,groupStrength(cycle)*Math.sin(Math.min(1,age/1.28)*Math.PI)**1.4);
  }
  const state={surge,vertices:0,rocks:0,thunder:{x:52,z:-45}};
  world.acadiaCoast=state;
  const foam=water.material.uniforms.foamCells?.value;
  const normalMap=water.material.uniforms.normalSampler.value;
  const surf=new T.ShaderMaterial({
    uniforms:{clock,sea:{value:level},ripples:{value:normalMap},film:{value:foam||normalMap}},
    transparent:true,depthWrite:false,side:T.FrontSide,
    vertexShader:`
      attribute float shoreDistance;
      uniform float clock,sea;
      varying vec3 point;
      varying float bank,bed;
      float crestPhase(vec2 p,float d){
        return 6.2831853*(clock/7.6+.72+d/45.+dot(p-vec2(52.,-45.),vec2(.0018,.0012))+
          .043*sin(p.y*.030+p.x*.012)+.033*sin(p.x*.044-p.y*.017));
      }
      void main(){
        point=position;
        bank=shoreDistance;bed=point.y-sea;
        float wave=cos(crestPhase(point.xz,bank));
        float sand=smoothstep(270.,370.,point.x)*(1.-smoothstep(-950.,-815.,point.z));
        float rise=(.12+.78*pow(max(0.,wave),3.))*(1.-smoothstep(34.,79.,bank));
        // Lift each crest and let the thin uprush conform to the surveyed ledge.
        point.y=max(sea+.05+rise*(.79+.28*sand),point.y+.075);
        gl_Position=projectionMatrix*viewMatrix*vec4(point,1.);
      }`,
    fragmentShader:`
      varying vec3 point;
      varying float bank,bed;
      uniform float clock,sea;
      uniform sampler2D ripples,film;
      void main(){
        float sand=smoothstep(270.,370.,point.x)*(1.-smoothstep(-950.,-815.,point.z));
        float cameraRange=distance(cameraPosition,point);
        vec2 p=point.xz;
        float turns=clock/7.6+.72+bank/45.+dot(p-vec2(52.,-45.),vec2(.0018,.0012))+
          .043*sin(p.y*.030+p.x*.012)+.033*sin(p.x*.044-p.y*.017);
        float cycle=floor(turns),phase=6.2831853*fract(turns);
        float sets=.74+.20*sin(cycle*1.53+.2)+.13*sin(cycle*.73+1.04);
        vec2 drift=vec2(.18,-.10)*clock;
        vec2 chop=texture2D(ripples,p*.039+drift*.04).rg-.5;
        float tongues=texture2D(ripples,p*.084+chop*.31-drift*.034).r;
        float patches=.48+.24*sin(p.y*.083+p.x*.027+3.9*chop.x)*
          cos(p.x*.063-p.y*.032+chop.y*4.)+.54*(tongues-.50);
        float runup=(.27+.73*pow(.5+.5*cos(phase-.38),1.8))*sets*(1.32+.73*tongues);
        float wet=1.-smoothstep(runup-.12,runup+.15,bed);
        float crest=cos(phase+chop.x*.69);
        // A curling lip, a wider aerated wake, then separate rafts of spent
        // foam. Smooth footprint attenuation keeps distant wave sets stable.
        float breaker=1.-smoothstep(30.,76.,bank);
        float collapse=smoothstep(.64-.23*tongues,.97,crest)*smoothstep(.19,.60,patches);
        float wake=smoothstep(.05,.90,cos(phase-.76))*(1.-smoothstep(.65,.99,crest));
        vec2 foamUV=p*.22+chop*.30+vec2(.19,-.035)*sin(phase)+drift*.13;
        float membrane=texture2D(film,foamUV).r,bubbles=texture2D(film,foamUV*3.1+chop*.40).r;
        float footprint=max(length(dFdx(p)),length(dFdy(p)));
        float veil=mix(.09+.75*membrane+.26*bubbles,.48,smoothstep(.45,2.5,footprint));
        float stranded=exp(-abs(bank)*.15)*(.23+.52*membrane)*smoothstep(.27,.67,tongues);
        float strength=breaker*wet*(collapse*sets*veil*1.74+(.50*wake*membrane+stranded)*veil);
        // Cobble ledges catch brighter, more broken wash than the level
        // pocket of shell sand. Neither bank receives a fixed white outline.
        strength*=mix(1.,.83,sand)*smoothstep(-16.,-8.,bank)*(1.-smoothstep(38.,66.,bank));
        float alpha=min(.92,strength)*(1.-smoothstep(1250.,4500.,cameraRange));
        if(alpha<.008)discard;
        vec3 nocturne=mix(vec3(.047,.084,.13),vec3(.31,.40,.50),clamp(collapse*.72+bubbles*.29,0.,1.));
        gl_FragColor=vec4(nocturne,alpha);
        #include <colorspace_fragment>
      }`
  });
  surf.userData.acadiaNight=true;
  const loader=new T.TextureLoader();
  const stone=loader.load('shore-stone.webp');
  stone.colorSpace=T.SRGBColorSpace;
  const rockMaterial=new T.MeshStandardMaterial({map:stone,roughness:.49,metalness:.035});
  const spray=makeSpray();
  const ready=new T.FileLoader().setResponseType('arraybuffer').loadAsync('acadia-tidal-reaches.bin').then(data=>{
    const view=new DataView(data);
    if(view.getUint32(0)!==0x41435331)throw Error('Invalid Acadia tidal survey');
    const count=view.getUint32(4,true),triangles=view.getUint32(8,true);
    const survey=new Int16Array(data,12,count*4),indices=new Uint16Array(data,12+count*8,triangles);
    const positions=new Float32Array(count*3),distances=new Float32Array(count);
    const stones=Array.from({length:4},()=>[]);
    let seed=309919;
    const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
    for(let i=0;i<count;i++){
      const x=survey[4*i],z=survey[4*i+1],bed=survey[4*i+2]/100,d=survey[4*i+3]/10;
      positions[3*i]=x;positions[3*i+1]=bed;positions[3*i+2]=z;distances[i]=d;
      // Monument Cove and Boulder Beach have wave-rounded blocks. Sand Beach
      // has a shell-sand pocket; the headlands retain their angular granite.
      const cove=x<20&&z>210&&z<788;
      if(!cove||bed>4.6||d< -16||d>5||random()>.61)continue;
      const cluster=1+Math.floor(random()*4);
      for(let j=0;j<cluster;j++){
        const rx=x+(random()-.5)*4,rz=z+(random()-.5)*4;
        const floor=world.elevation(rx,rz);
        if(floor>5.5||floor<level-1.3)continue;
        const radius=.12+Math.pow(random(),2)*(.30+1.12*random());
        stones[Math.floor(random()*4)].push([rx,floor,rz,radius,random(),random(),random()]);
      }
    }
    const geo=new T.BufferGeometry();
    geo.setAttribute('position',new T.BufferAttribute(positions,3));
    geo.setAttribute('shoreDistance',new T.BufferAttribute(distances,1));geo.setIndex(new T.BufferAttribute(indices,1));
    geo.computeBoundingSphere();
    const wave=new T.Mesh(geo,surf);wave.name='Atlantic breakers and ledge wash';wave.renderOrder=2;
    scene.add(wave);state.vertices=count;
    const transform=new T.Object3D(),tint=new T.Color();
    stones.forEach((rows,variant)=>{
      const shape=new T.IcosahedronGeometry(1,2),a=shape.attributes.position;
      for(let i=0;i<a.count;i++){
        const x=a.getX(i),y=a.getY(i),z=a.getZ(i);
        const r=1+.061*Math.sin(x*3.9+variant)*Math.cos(z*4.7+y*1.61)+.029*Math.sin(y*8.1+x*3.);
        a.setXYZ(i,x*r,y*r,z*r);
      }
      shape.computeVertexNormals();
      const mesh=new T.InstancedMesh(shape,rockMaterial,rows.length);
      rows.forEach(([x,y,z,r,turn,stretch,shade],i)=>{
        transform.position.set(x,y+r*.21,z);transform.rotation.set(turn*.25,stretch*6.28,shade*.22);
        transform.scale.set(r*(1.06+.46*stretch),r*(.56+.32*shade),r*(.77+.39*turn));transform.updateMatrix();
        mesh.setMatrixAt(i,transform.matrix);
        const wet=T.MathUtils.smoothstep(y,level-.15,level+2.1);
        tint.setRGB(.19+.42*wet+.11*shade,.19+.35*wet+.09*shade,.208+.34*wet+.09*shade);
        mesh.setColorAt(i,tint);
      });
      mesh.name='Monument Cove rounded granite';mesh.computeBoundingSphere();scene.add(mesh);state.rocks+=rows.length;
    });
  });
  state.ready=ready;
  const previous=world.update.bind(world);
  world.update=(dt,t,player)=>{clock.value=t;spray.visible=Math.hypot(player.x-52,player.z+45)<1600;previous(dt,t,player);};

  function makeSpray(){
    // A wave surges into the blind channel, compresses air, then breaks from
    // the back of the fissure. Gravity and prevailing wind shape the plume.
    const count=86,base=new T.PlaneGeometry(1,1),g=new T.InstancedBufferGeometry();
    g.setAttribute('position',base.getAttribute('position'));g.setAttribute('uv',base.getAttribute('uv'));g.setIndex(base.index);
    const seeds=new Float32Array(count*4);let s=183753;
    for(let i=0;i<seeds.length;i++){s=(Math.imul(s,1664525)+1013904223)>>>0;seeds[i]=s/4294967296;}
    g.setAttribute('seed',new T.InstancedBufferAttribute(seeds,4));g.instanceCount=count;
    const m=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{clock,level:{value:level}},
      vertexShader:`attribute vec4 seed;uniform float clock,level;varying vec2 st;varying float opacity,grain;
      void main(){
        float turns=clock/7.6+.72;
        float cycle=floor(turns),envelope=.74+.20*sin(cycle*1.53+.2)+.13*sin(cycle*.73+1.04);
        float t=fract(turns)*7.6-.04-.46*seed.w;float life=.79+.88*seed.y;
        float age=clamp(t/life,0.,1.);
        float speed=mix(5.1,13.6,seed.y)*envelope;
        float angle=6.283*(seed.x+fract(cycle*.618));
        vec2 dir=vec2(cos(angle),sin(angle));
        vec2 xz=vec2(52.,-45.)+dir*(.25+seed.z*.73);
        xz+=dir*(.44+2.1*seed.z)*age+vec2(-1.8,.66)*age*age;
        float above=1.25+speed*t-4.905*t*t;
        float size=(.28+1.15*seed.z)*(.48+1.43*age);
        opacity=smoothstep(0.,.15,t)*(1.-smoothstep(.54,1.,age))*smoothstep(.1,1.,above)*(.36+.22*seed.y);
        st=uv;grain=seed.x+age*.37;
        vec4 v=viewMatrix*vec4(xz.x,level+max(0.,above),xz.y,1.);
        v.xy+=position.xy*vec2(.84,1.13)*size;
        gl_Position=projectionMatrix*v;
      }`,
      fragmentShader:`varying vec2 st;varying float opacity,grain;
      void main(){
        vec2 p=2.*st-1.;float d=dot(p,p);if(d>1.||opacity<.002)discard;
        float r=.65+.35*sin((p.x*5.2+p.y*7.1+grain*13.)+1.15*sin(p.x*8.9-p.y*4.6));
        gl_FragColor=vec4(.46,.58,.70,opacity*(1.-smoothstep(.05,1.,d))*r);
        #include <colorspace_fragment>
      }`});
    m.userData.acadiaNight=true;
    const mesh=new T.Mesh(g,m);mesh.name='Thunder Hole wave-driven spray';mesh.frustumCulled=false;mesh.renderOrder=3;scene.add(mesh);return mesh;
  }
};
