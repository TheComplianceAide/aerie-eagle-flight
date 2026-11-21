// Ocean Path at a fixed tide stage. Surveyed depths steer the offshore crests.
window.addAcadiaCoast=function addAcadiaCoast(T,scene,world){
  const water=scene.children.find(o=>o.isWater);
  if(!water)return;
  water.material.userData.shadowDirectWater=true;
  const level=water.position.y,clock={value:0};
  // Thunder Hole's NAIP-mapped cleft faces southeast. Wave groups share a
  // period with the local breaker line. The strongest few crests vent spray.
  const period=7.6;
  // The wider surf mesh uses the mouth as its time origin. A crest needs a
  // further five seconds to cross the last 16 m of metre-deep confined water.
  const chamberDelay=5.0;
  const chamber={x:50.2,y:level+1.0,z:-48.7};
  const groupStrength=cycle=>.74+.20*Math.sin(cycle*1.53+.2)+.13*Math.sin(cycle*.73+1.04);
  function surge(t){
    const turns=(t-chamberDelay)/period+.72,cycle=Math.floor(turns),age=(turns-cycle)*period;
    return Math.min(1,groupStrength(cycle)*Math.sin(Math.min(1,age/1.28)*Math.PI)**1.4);
  }
  const state={surge,vertices:0,rocks:0,thunder:chamber};
  world.acadiaCoast=state;
  state.walkway=window.addThunderHoleWalkway(T,scene,world);
  const foam=water.material.uniforms.foamCells?.value;
  const normalMap=water.material.uniforms.normalSampler.value;
  const nearUniforms={clock,level:{value:level},chamberDelay:{value:chamberDelay},
    outlet:{value:new T.Vector2(chamber.x,chamber.z)}};
  const surf=new T.ShaderMaterial({
    uniforms:{clock,sea:{value:level},ripples:{value:normalMap},film:{value:foam||normalMap}},
    transparent:true,depthWrite:false,side:T.FrontSide,
    vertexShader:`
      attribute float shoreDistance;
      attribute vec3 coastalSwell;
      uniform float clock,sea;
      varying vec3 point;
      varying float bank,bed;
      varying vec3 swell;
      void main(){
        point=position;
        bank=shoreDistance;bed=point.y-sea;swell=coastalSwell;
        float theta=6.2831853*((clock-swell.x)/7.6+.72);
        float shoal=1.-smoothstep(.62,3.8,swell.y);
        float crest=pow(max(0.,cos(theta)),3.);
        // The upper skin climbs real rock on land. Seaward its relief is
        // limited by the tide depth and the energy admitted by the headlands.
        float rise=(.08+.45*crest*shoal)*(.40+.60*swell.z);
        point.y=max(sea+.065+rise,point.y+.075);
        gl_Position=projectionMatrix*viewMatrix*vec4(point,1.);
      }`,
    fragmentShader:`
      varying vec3 point;
      varying float bank,bed;
      varying vec3 swell;
      uniform float clock,sea;
      uniform sampler2D ripples,film;
      ${addAcadiaCoast.inletField}
      void main(){
        float sand=smoothstep(270.,370.,point.x)*(1.-smoothstep(-950.,-815.,point.z));
        float cameraRange=distance(cameraPosition,point);
        vec2 p=point.xz;
        float turns=(clock-swell.x)/7.6+.72;
        vec2 drift=vec2(.18,-.10)*clock;
        vec2 chop=texture2D(ripples,p*.039+drift*.04).rg-.5;
        float tongues=texture2D(ripples,p*.084+chop*.31-drift*.034).r;
        float phase=6.2831853*turns+.24*chop.x;
        float sets=.76+.14*sin(turns*1.53+.2)+.10*sin(turns*.73+1.04);
        float incident=(.38+.62*swell.z)*sets;
        float waterDepth=max(0.,swell.y);
        float shoal=1.-smoothstep(.60*incident,2.9*incident+.24,waterDepth);
        float ledge=1.-smoothstep(3.8,14.,max(0.,bank));
        float crest=cos(phase);
        float lip=smoothstep(.69-.15*tongues,.98,crest);
        float runup=incident*(.42+1.00*pow(.5+.5*cos(phase-.43),1.85))*(.79+.34*tongues);
        float wet=1.-smoothstep(runup-.12,runup+.15,bed);
        float footprint=max(length(dFdx(p)),length(dFdy(p)));
        // Wide rippled patches connect along the changing crest. Finer
        // bubbles occupy only the aerated lip and trailing foam rafts.
        float islands=texture2D(ripples,p*.044+chop*.44+drift*.013).r;
        float raftCoverage=smoothstep(.30,.63,.57*islands+.43*tongues);
        vec2 foamUV=p*.16+chop*.37+vec2(.13,-.053)*sin(phase)+drift*.075;
        float membrane=texture2D(film,foamUV).r,bubbles=texture2D(film,foamUV*2.43+chop*.45).r;
        float filmValue=mix(.14+.64*membrane+.17*bubbles,.44,smoothstep(.42,2.4,footprint));
        float wake=smoothstep(-.18,.82,cos(phase-.92))*(1.-lip*.72)*raftCoverage;
        float reach=exp(-abs(bank)*.23);
        float retained=reach*(.08+.37*membrane)*smoothstep(.29,.67,islands);
        float collapse=lip*max(shoal*.91,ledge*.90)*(.48+.52*raftCoverage);
        float strength=incident*wet*(1.38*collapse*filmValue+
          .46*wake*filmValue*max(shoal,ledge*.66)+retained);
        strength*=mix(1.,.89,sand)*smoothstep(-16.,-8.,bank)*(1.-smoothstep(43.,70.,bank));
        float alpha=min(.84,strength)*(1.-inletShelter(p))*(1.-smoothstep(1250.,4500.,cameraRange));
        if(alpha<.006)discard;
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
  const inlet=makeInlet();
  const spray=makeSpray();
  const ready=new T.FileLoader().setResponseType('arraybuffer').loadAsync('acadia-tidal-reaches.bin').then(data=>{
    const view=new DataView(data);
    const version=view.getUint32(0),stride=version===0x41435332?6:4;
    if(version!==0x41435331&&version!==0x41435332)throw Error('Invalid Acadia tidal survey');
    const count=view.getUint32(4,true),triangles=view.getUint32(8,true);
    const survey=new Int16Array(data,12,count*stride),indices=new Uint16Array(data,12+count*stride*2,triangles);
    const positions=new Float32Array(count*3),distances=new Float32Array(count),swell=new Float32Array(count*3);
    const stones=Array.from({length:4},()=>[]);
    let seed=309919;
    const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
    for(let i=0;i<count;i++){
      const j=stride*i,x=survey[j],z=survey[j+1],bottom=survey[j+2]/100,d=survey[j+3]/10;
      const bed=world.elevation(x,z);
      swell[3*i]=stride===6?survey[j+4]/100:-d*period/45;
      swell[3*i+1]=Math.max(0,level-bottom);
      swell[3*i+2]=stride===6?survey[j+5]/1000:1;
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
    geo.setAttribute('coastalSwell',new T.BufferAttribute(swell,3));
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
  world.update=(dt,t,player)=>{
    clock.value=t;
    const range=Math.hypot(player.x-chamber.x,player.z-chamber.z);
    inlet.visible=range<700;spray.visible=range<1050;
    previous(dt,t,player);
  };

  function makeInlet(){
    // Local x and half-width at successive southings, traced in the low-water
    // photograph. Clip against the quarter-metre rock mesh along both walls.
    const sections=addAcadiaCoast.inletSections;
    const points=[],coords=[],indices=[];
    const across=12;
    let distance=0,rows=0;
    function row(z,x,radius,along){
      for(let col=0;col<=across;col++){
        const side=2*col/across-1;
        points.push(x+side*radius,level,z);coords.push(along,side);
        if(rows>0&&col>0){
          const d=rows*(across+1)+col,c=d-1,b=d-across-1,a=b-1;
          indices.push(a,c,b,b,c,d);
        }
      }
      rows++;
    }
    row(...sections[0],0);
    for(let i=1;i<sections.length;i++){
      const [z0,x0,w0]=sections[i-1],[z1,x1,w1]=sections[i];
      const step=Math.hypot(z1-z0,x1-x0),count=Math.ceil(step/.5);
      for(let j=1;j<=count;j++){
        const t=j/count;
        row(z0+(z1-z0)*t,x0+(x1-x0)*t,w0+(w1-w0)*t,distance+step*t);
      }
      distance+=step;
    }
    const geo=new T.BufferGeometry();
    geo.setAttribute('position',new T.Float32BufferAttribute(points,3));
    geo.setAttribute('uv',new T.Float32BufferAttribute(coords,2));
    geo.setIndex(indices);geo.computeBoundingSphere();geo.boundingSphere.radius+=2;
    const material=new T.ShaderMaterial({
      uniforms:{...nearUniforms,ripples:{value:normalMap},film:{value:foam||normalMap}},
      transparent:true,depthWrite:false,
      vertexShader:`
        uniform float clock,level,chamberDelay;
        varying vec2 lane;
        varying vec3 point;
        varying float breaker,eddy;
        void main(){
          lane=uv;point=position;
          float distanceToHead=max(0.,uv.x-1.8);
          float angle=6.2831853*((clock-chamberDelay+distanceToHead/3.23)/7.6+.72);
          float set=.74+.20*sin((clock-chamberDelay)/7.6*1.53+1.3)+.13*sin(clock/7.6*.73+1.04);
          float inward=pow(.5+.5*cos(angle-.40),3.5);
          float reflected=pow(.5+.5*cos(angle+.06-distanceToHead*.49),3.);
          float throat=1.-smoothstep(5.,32.,uv.x);
          breaker=set*inward;
          eddy=reflected*exp(-distanceToHead*.095)*set;
          point.y=level+.10+(.31+.70*throat)*breaker+.33*eddy
            +.036*sin(5.3*uv.y+.71*uv.x+clock*2.5);
          gl_Position=projectionMatrix*viewMatrix*vec4(point,1.);
        }`,
      fragmentShader:`
        uniform sampler2D ripples,film;
        uniform float clock;
        varying vec2 lane;
        varying vec3 point;
        varying float breaker,eddy;
        void main(){
          float distanceToHead=lane.x;
          float side=abs(lane.y);
          float blend=(1.-smoothstep(29.,47.,distanceToHead))*smoothstep(0.,1.,distanceToHead);
          vec2 xy=point.xz;
          vec2 shear=texture2D(ripples,xy*.12+vec2(clock*.026,-clock*.051)).rg-.5;
          float sweep=sin((clock+distanceToHead/3.23)*.827)*(.46+.22*side);
          vec2 filmUV=xy*.47+shear*.48+vec2(.11,-.46)*sweep;
          float bubbles=texture2D(film,filmUV).r;
          float froth=texture2D(film,filmUV*2.3+shear*.27).r;
          float raft=texture2D(ripples,xy*.21+shear*.57+vec2(sweep*.17,-clock*.023)).r;
          float wall=pow(side,2.4);
          float foamCover=clamp((.15+breaker*1.10+eddy*.72+wall*.43)
            *smoothstep(.22,.72,raft+.17*wall)*(.24+.68*bubbles+.23*froth),0.,1.);
          vec3 toEye=normalize(cameraPosition-point);
          float grazing=pow(1.-abs(toEye.y),3.);
          vec3 waterLight=mix(vec3(.012,.029,.041),vec3(.056,.095,.12),
            clamp(grazing+shear.y*.24,0.,1.));
          vec3 color=mix(waterLight,vec3(.34,.43,.51),foamCover);
          float edge=1.-smoothstep(.87,1.,side);
          gl_FragColor=vec4(color,blend*edge*(.42+.45*foamCover));
          #include <colorspace_fragment>
        }`
    });
    material.userData.acadiaNight=true;
    const mesh=new T.Mesh(geo,material);
    mesh.name='Thunder Hole · advancing and reflected chamber surge';mesh.renderOrder=3;
    scene.add(mesh);return mesh;
  }

  function makeSpray(){
    // A wave surges into the blind channel, compresses air, then breaks from
    // the back of the fissure. Gravity and prevailing wind shape the plume.
    const count=86,base=new T.PlaneGeometry(1,1),g=new T.InstancedBufferGeometry();
    g.setAttribute('position',base.getAttribute('position'));g.setAttribute('uv',base.getAttribute('uv'));g.setIndex(base.index);
    const seeds=new Float32Array(count*4);let s=183753;
    for(let i=0;i<seeds.length;i++){s=(Math.imul(s,1664525)+1013904223)>>>0;seeds[i]=s/4294967296;}
    g.setAttribute('seed',new T.InstancedBufferAttribute(seeds,4));g.instanceCount=count;
    const m=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:nearUniforms,
      vertexShader:`attribute vec4 seed;uniform float clock,level,chamberDelay;uniform vec2 outlet;varying vec2 st;varying float opacity,grain,isDrop;
      void main(){
        float turns=(clock-chamberDelay)/7.6+.72;
        float cycle=floor(turns),envelope=.74+.20*sin(cycle*1.53+.2)+.13*sin(cycle*.73+1.04);
        float t=fract(turns)*7.6-.04-.46*seed.w;float life=.79+.88*seed.y;
        float age=clamp(t/life,0.,1.);
        float speed=mix(5.1,13.6,seed.y)*envelope;
        float angle=6.283*(seed.x+fract(cycle*.618));
        vec2 dir=vec2(cos(angle),sin(angle));
        isDrop=step(.67,seed.z);
        vec2 xz=outlet+dir*(.08+seed.z*.52);
        xz+=dir*(.44+2.1*seed.z)*age+vec2(-1.8,.66)*age*age;
        float above=1.25+speed*t-4.905*t*t;
        float size=mix((.28+1.15*seed.z)*(.48+1.43*age),.048+.063*seed.y,isDrop);
        opacity=smoothstep(0.,.15,t)*(1.-smoothstep(.54,1.,age))*smoothstep(.1,1.,above)*(.36+.22*seed.y);
        st=uv;grain=seed.x+age*.37;
        vec4 v=viewMatrix*vec4(xz.x,level+max(0.,above),xz.y,1.);
        v.xy+=position.xy*vec2(.84,1.13+isDrop)*size;
        gl_Position=projectionMatrix*v;
      }`,
      fragmentShader:`varying vec2 st;varying float opacity,grain,isDrop;
      void main(){
        vec2 p=2.*st-1.;float d=dot(p,p);if(d>1.||opacity<.002)discard;
        float r=.65+.35*sin((p.x*5.2+p.y*7.1+grain*13.)+1.15*sin(p.x*8.9-p.y*4.6));
        gl_FragColor=vec4(.46,.58,.70,opacity*(1.-smoothstep(.05,1.,d))*mix(r,1.45,isDrop));
        #include <colorspace_fragment>
      }`});
    m.userData.acadiaNight=true;
    const mesh=new T.Mesh(g,m);mesh.name='Thunder Hole wave-driven spray';mesh.frustumCulled=false;mesh.renderOrder=4;scene.add(mesh);return mesh;
  }
};

// Local southing, easting and half-width of the mapped Thunder Hole cleft.
// One transverse profile drives the chamber skin, bed lighting and surf handover.
window.addAcadiaCoast.inletSections=[[-50.5,49.9,.17],[-49.5,50.1,.63],[-47.5,50.2,.92],
      [-45,50.5,1.20],[-42,51.2,1.31],[-39,52.1,1.48],[-36,53.4,1.30],
      [-33,54.6,1.34],[-29,55.7,1.49],[-22,58.8,2.2],[-15,62.0,3.25],[-5,67.0,4.8]];
window.addAcadiaCoast.inletField=(() => {
  const rows=window.addAcadiaCoast.inletSections;
  const increment=rows.slice(1).map(([z,x,width],i)=>{
    const [prevZ,prevX,prevWidth]=rows[i];
    return 'profile+=vec2('+(x-prevX).toFixed(3)+','+(width-prevWidth).toFixed(3)+')*clamp((p.y-('+prevZ.toFixed(2)+'))/'+(z-prevZ).toFixed(2)+',0.,1.);';
  }).join('\n');
  return `
    float inletShelter(vec2 p){
      if(p.x<44.||p.x>78.||p.y< -54.||p.y> -5.)return 0.;
      vec2 profile=vec2(49.9,.17);
      ${increment}
      float crossSlope=abs(p.x-profile.x);
      float banks=1.-smoothstep(profile.y+.42,profile.y+2.25,crossSlope);
      return banks*smoothstep(-54.,-50.5,p.y)*(1.-smoothstep(-24.,-5.,p.y));
    }`;
})();
