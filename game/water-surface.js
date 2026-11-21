// Finite wind waves in metres. Each component loses contrast when its wavelength
// drops below the pixel footprint. Keep low-angle reflections stable during flight.
(() => {
  const waves=`
    vec3 gravityWave(vec2 p,vec2 dir,float len,float amp,float t,float px,float phase){
      float k=6.2831853/len;
      float a=amp*(1.-smoothstep(.18,.52,px/len));
      float u=k*dot(p,dir)-sqrt(9.81*k)*t+phase;
      return vec3(a*sin(u),dir*a*k*cos(u));
    }
    vec3 waterWaves(vec2 p,float t,float px,float energy){
      float bend=.48*sin(dot(p,vec2(.009,.015))-.07*t);
      return energy*(gravityWave(p,vec2(.88,.475),14.1,.15,t,px,bend)
        +gravityWave(p,vec2(.635,.773),6.7,.079,t,px,-.82+bend)
        +gravityWave(p,vec2(-.14,.990),2.35,.035,t,px,1.8)
        +gravityWave(p,vec2(.97,-.243),.77,.012,t,px,-.9-bend));
    }`;

  // The low sun has different cloud cover and the water has a different
  // wind fetch at each shore. Colors describe scattered light in deep water
  // and the solar disc; the mirror pass supplies the clouds, trees and cliffs.
  const lowSunWater={
    lofoten:{body:0x393844,sun:0xf7b983,state:1.06,wave:1.19,skyExposure:1.14,glint:.67}
  };

  function lowSunReflection(mat,shader,light){
    mat.uniforms.waterColor.value.setHex(light.body);
    mat.uniforms.sunColor.value.setHex(light.sun);
    mat.uniforms.seaState.value=light.state;
    return shader
      .replace('float fresnel=.0204+.9796*pow(1.-cosV,5.);',`
        // Unpolarized Fresnel reflectance for air over fresh or salt water.
        float cosT=sqrt(1.-.5625*(1.-cosV*cosV));
        float rs=(cosV-1.333*cosT)/(cosV+1.333*cosT);
        float rp=(1.333*cosV-cosT)/(1.333*cosV+cosT);
        float fresnel=.5*(rs*rs+rp*rp);
      `)
      .replace('vec3 sunlight=vec3(1.,.77,.47)*spec', 'vec3 sunlight=sunColor*'+light.glint.toFixed(2)+'*spec')
      .replace('vec3 skyVeil=vec3(.41,.53,.64);',`
        // Restore the brighter incident sky compressed into the photographic
        // panorama. Keep the weaker return from wooded points and cliff faces.
        float brightness=dot(reflectLight,vec3(.2126,.7152,.0722));
        reflectLight*=1.+${light.skyExposure.toFixed(2)}*smoothstep(.035,.66,brightness);
        vec3 skyVeil=texture2D(mirrorSampler,clamp(mirrorUV,.002,.998),roughLod+2.4).rgb;
      `);
  }

  function lakes(scene,region){
    scene.traverse(mesh=>{
      if(!mesh.isWater)return;
      const mat=mesh.material,atlas=!!mat.uniforms.shoreField;
      const light=lowSunWater[region];
      // Terrain blocks direct light on the water and bed while the sky remains visible in the reflection.
      if(atlas&&(light||region==='moosehead'||region==='winnipesaukee'))mat.userData.shadowDirectWater=true;
      const energy=light?.wave??({dixville:.52,milford:1.25,labrador:1.10,moosehead:1.05,alaska:.88,swiss:.58,crater:.85})[region]??.92;
      let shader=waves+'\n'+mat.fragmentShader;
      if(atlas&&region==='surry'){
        // The sheltered dam pool is glassy between small moving cat's paws.
        // Long gravity waves rolling across the entire basin would stripe its
        // reflected hills. Short capillary waves remain in patchy light wind.
        shader=shader.replace('vec2 slope=slopes(p,time,footprint,fetch,wind);',`
          vec2 drift=vec2(.030,-.018)*time;
          float capillaryPatch=texture2D(normalSampler,p*.00091+drift*.012).r;
          capillaryPatch+=.42*(texture2D(normalSampler,vec2(p.y*.0017,-p.x*.0012)-drift*.008).g-.5);
          float rippled=smoothstep(.48,.72,capillaryPatch);
          vec2 slope=slopes(p,time,footprint,fetch,wind)*(.09+.61*rippled);
        `).replace('incident*shoaling','incident*.22*shoaling');
      }else if(atlas){
        shader=shader.replace('vec2 slope=slopes(p,time,footprint,fetch,wind);',`
          float energy=${energy.toFixed(2)}*(.32+.68*fetch)*(.62+.38*smoothstep(0.,14.,bank));
          vec3 wave=waterWaves(p,time,footprint,energy);
          vec2 ripplePoint=p+v.xz*wave.x/max(.24,v.y);
          wave=waterWaves(ripplePoint,time,footprint,energy);
          vec2 slope=slopes(ripplePoint,time,footprint,fetch,wind)-wave.yz;
        `);
      }else{
        shader=shader.replace('vec4 noise=getNoise(surface*size);',`
          vec3 viewRay=normalize(eye-worldPosition.xyz);
          vec3 wave=waterWaves(surface,time,pixel,${energy.toFixed(2)});
          surface+=viewRay.xz*wave.x/max(.24,viewRay.y);
          wave=waterWaves(surface,time,pixel,${energy.toFixed(2)});
          vec4 noise=getNoise(surface*size);`).replace('vec3 surfaceNormal=normalize','slope-=wave.yz*(1.-.68*nearShore);\n          vec3 surfaceNormal=normalize')
          .replace('vec2 warp=surfaceNormal.xz*distortionScale*(.11+.64/max(5.,distance));', `
            vec2 screenSlope=(viewMatrix*vec4(surfaceNormal.x,0.,surfaceNormal.z,0.)).xy;
            vec2 warp=screenSlope*distortionScale*(.063+.49/max(5.,distance));`);
      }
      if(atlas&&region==='acadia'){
        // Ocean Path's survey alpha supplies the measured tide depth. The 3D
        // breaker skin handles whitewater where the NOAA soundings cover it.
        shader=window.addAcadiaCoast.inletField+'\n'+shader;
        shader=shader.replace('vec3 shore=texture2D(shoreField,basin).rgb;', `
          vec4 shore=texture2D(shoreField,basin);
          float gorge=inletShelter(p);
          float soundings=step(127.75,shore.a*255.)*interior;
          float tidalDepth=clamp((shore.a*255.-128.)/126.,0.,1.);`)
          .replace('float shallow=exp(-.47*waterDepth);', `
            waterDepth=mix(waterDepth,max(.065,24.*tidalDepth*tidalDepth),soundings);
            // The NOAA offshore cell is wider than the fissure. Use a bounded
            // low-tide channel depth where both walls enclose the water.
            waterDepth=mix(waterDepth,max(waterDepth,1.15),gorge);
            float shallow=exp(-.47*waterDepth);`)
          .replace('vec3 h=normalize(v+sunDirection);',`
            // Skylight reaches the rock floor over a narrow opening. Preserve
            // wave reflection while attenuating the transmitted sand lighting.
            vec3 wetGranite=dot(body,vec3(.21,.72,.07))*vec3(.19,.31,.39)+vec3(.002,.006,.009);
            body=mix(body,wetGranite,gorge);
            vec3 h=normalize(v+sunDirection);`)
          .replace('float white=oceanSurf*','float white=oceanSurf*(1.-gorge)*(1.-.92*soundings)*')
          .replace('incident*shoaling','incident*mix(1.,.16,soundings)*shoaling');
      }
      if(atlas&&region==='lofoten'){
        // The register comes from the 2 m Hamnøy survey and the wider fjord.
        // Its alpha is 255 outside the harbor. Retain wind ripples in the lee.
        shader=shader.replace('vec3 shore=texture2D(shoreField,basin).rgb;', `
          vec4 shore=texture2D(shoreField,basin);
          float harborSwell=clamp((shore.a*255.-128.)/127.,0.,1.);`)
          // The copper skylight still illuminates the deep fjord behind a ridge.
          // Apply the sun mask fully to glints and the lit fraction of the shallow bed.
          .replace('body*mix(.70,1.,visibleSun)', 'body*(1.-(1.-visibleSun)*daylight*(.016+.284*shallow))')
          .replace('float coast=shoreExposure,', 'float coast=shoreExposure*mix(.11,1.,harborSwell),')
          .replace('float incident=mix(', 'float incident=mix(.035,1.,harborSwell*harborSwell)*mix(')
          .replace('float white=oceanSurf*', 'float white=oceanSurf*harborSwell*harborSwell*')
          .replace('vec3 wave=waterWaves(p,time,footprint,energy);', `
            energy*=mix(.065,1.,harborSwell);
            vec3 wave=waterWaves(p,time,footprint,energy);`);
      }
      mat.fragmentShader=atlas&&light?lowSunReflection(mat,shader,light):shader;mat.needsUpdate=true;
    });
  }

  // Share a nearby planar reflection between streams, reservoirs and rain pools.
  window.attachLocalWaterReflection=(T,surface,surfacePlane)=>{
    const u=surface.material.uniforms;
    const image=new T.WebGLRenderTarget(512,256,{stencilBuffer:false});
    const mirror=new T.PerspectiveCamera(),projection=new T.Matrix4(),direction=new T.Vector3(),target=new T.Vector3();
    const lastEye=new T.Vector3(Infinity,0,0),lastDirection=new T.Vector3(),normal=new T.Vector3(),centre=new T.Vector3();
    const plane=new T.Plane(),clip=new T.Vector4(),corner=new T.Vector4();
    mirror.userData.lakeReflection=true;
    Object.assign(u,{sceneReflection:{value:image.texture},reflectProjection:{value:projection},reflectionWeight:{value:0},reflectCentre:{value:centre}});
    let lastUpdate=-Infinity;
    surface.onBeforeRender=(renderer,viewScene,camera)=>{
      if(!camera.isPerspectiveCamera||camera.userData.lakeReflection)return;
      const eye=camera.position,time=u.t.value;camera.getWorldDirection(direction);
      if(time>=lastUpdate&&time-lastUpdate<.16&&lastEye.distanceToSquared(eye)<25&&lastDirection.dot(direction)>.997)return;
      lastUpdate=time;lastEye.copy(eye);lastDirection.copy(direction);
      const weight=surfacePlane(eye,centre,normal);u.reflectionWeight.value=weight;
      if(!weight)return;
      plane.setFromNormalAndCoplanarPoint(normal,centre);
      const height=plane.distanceToPoint(eye);if(height<.01){u.reflectionWeight.value=0;return;}
      mirror.position.copy(eye).addScaledVector(normal,-2*height);target.copy(direction).reflect(normal).add(mirror.position);
      mirror.up.set(0,1,0).applyQuaternion(camera.quaternion).reflect(normal);mirror.lookAt(target);
      mirror.far=camera.far;mirror.updateMatrixWorld();mirror.projectionMatrix.copy(camera.projectionMatrix);
      projection.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1).multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);
      // Clip below the water on the reflected pass, including sloping riffles.
      plane.applyMatrix4(mirror.matrixWorldInverse);clip.set(plane.normal.x,plane.normal.y,plane.normal.z,plane.constant);
      const e=mirror.projectionMatrix.elements;
      corner.set((Math.sign(clip.x)+e[8])/e[0],(Math.sign(clip.y)+e[9])/e[5],-1,(1+e[10])/e[14]);
      clip.multiplyScalar(2/clip.dot(corner));e[2]=clip.x;e[6]=clip.y;e[10]=clip.z+.997;e[14]=clip.w;
      const saved=renderer.getRenderTarget(),xr=renderer.xr.enabled,shadows=renderer.shadowMap.autoUpdate;
      surface.visible=false;renderer.xr.enabled=false;renderer.shadowMap.autoUpdate=false;
      try{
        renderer.setRenderTarget(image);renderer.state.buffers.depth.setMask(true);if(!renderer.autoClear)renderer.clear();
        renderer.render(viewScene,mirror);
      }finally{
        renderer.setRenderTarget(saved);renderer.xr.enabled=xr;renderer.shadowMap.autoUpdate=shadows;surface.visible=true;
        if(camera.viewport)renderer.state.viewport(camera.viewport);
      }
    };
  };

  function streams(T,scene,w){
    const lines=window.aerieChannels;
    if(!lines?.length)return;
    const positions=[],uv=[],grade=[],sections=[],viewStations=[],indices=[],cells=new Map();
    const valley=window.yosemiteRiverViews;
    const bankData=valley?.banks;
    const offsets=bankData?new Int8Array(Uint8Array.from(atob(bankData.offsets),c=>c.charCodeAt(0)).buffer):null;
    const cell=(x,z)=>Math.floor(x/64)+','+Math.floor(z/64);
    const floor=(x,z)=>w.habitat.surface(x,z);
    for(const [number,[width,source]] of lines.entries()){
      // Hydrography polylines may be stored in either order. Compare the
      // elevations at their ends before assigning the downstream coordinate.
      const ordered=floor(...source[0])<floor(...source[source.length-1])?[...source].reverse():source;
      // Round the surveyed vertices only within a few channel widths; the
      // centre of each reach stays tied to its mapped course.
      const path=[ordered[0]];
      for(let i=1;i<ordered.length-1;i++){
        const p=ordered[i],a=ordered[i-1],b=ordered[i+1];
        const da=Math.hypot(a[0]-p[0],a[1]-p[1]),db=Math.hypot(b[0]-p[0],b[1]-p[1]);
        if(da<.01||db<.01)continue;
        const trim=Math.min(width*2.4,da*.19,db*.19);
        const ax=p[0]+(a[0]-p[0])*trim/da,az=p[1]+(a[1]-p[1])*trim/da;
        const bx=p[0]+(b[0]-p[0])*trim/db,bz=p[1]+(b[1]-p[1])*trim/db;
        for(let j=0;j<=4;j++){
          const u=j*.25,v=1-u;path.push([v*v*ax+2*v*u*p[0]+u*u*bx,v*v*az+2*v*u*p[1]+u*u*bz]);
        }
      }
      path.push(ordered[ordered.length-1]);
      const samples=[];
      for(let i=1;i<path.length;i++){
        const a=path[i-1],b=path[i],dx=b[0]-a[0],dz=b[1]-a[1];
        const spacing=Math.min(3.8,width*.78);
        const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/spacing));
        for(let j=0;j<steps;j++)samples.push([a[0]+dx*j/steps,a[1]+dz*j/steps]);
      }
      samples.push(path[path.length-1]);
      const survey=valley?.reaches[number];
      let reachLength=0;
      if(survey)for(let j=1;j<samples.length;j++)
        reachLength+=Math.hypot(samples[j][0]-samples[j-1][0],samples[j][1]-samples[j-1][1]);
      const bankRange=bankData?.reaches[number];
      let run=0,previousLevel,previousCenter;
      for(let i=0;i<samples.length;i++){
        const [x,z]=samples[i],a=samples[Math.max(0,i-1)],b=samples[Math.min(i+1,samples.length-1)];
        const dx=b[0]-a[0],dz=b[1]-a[1],dist=Math.max(.01,Math.hypot(dx,dz));
        if(i)run+=Math.hypot(x-samples[i-1][0],z-samples[i-1][1]);
        const nx=-dz/dist,nz=dx/dist;
        const widthVariation=1+.074*Math.sin(run*.19+Math.sin(x*.043))+.041*Math.cos(run*.39+z*.061);
        let half=width*.5*widthVariation,centerX=x,centerZ=z;
        const slope=Math.abs(floor(...b)-floor(...a))/dist,base=positions.length/3;
        const before=samples[Math.max(0,i-3)],after=samples[Math.min(samples.length-1,i+3)];
        const ax=x-before[0],az=z-before[1],bx=after[0]-x,bz=after[1]-z;
        const bend=(ax*bz-az*bx)/Math.max(.01,Math.hypot(ax,az)*Math.hypot(bx,bz));
        const along=run/Math.max(1,reachLength);
        const mappedAlong=ordered===source?along:1-along;
        const station=survey?survey[0]+mappedAlong*(survey[1]-1): -1;
        if(bankRange){
          // The main stem widens into pools and moves to the outside of
          // exposed gravel bars. The two NIR-traced shorelines are independent
          // of the generalized centreline supplied by hydrography.
          const at=bankRange[0]+mappedAlong*(bankRange[1]-1);
          const j=Math.floor(at),k=Math.min(j+1,bankRange[0]+bankRange[1]-1);
          const f=at-j;
          const left=.5*((1-f)*offsets[j*4]+f*offsets[k*4]);
          const right=.5*((1-f)*offsets[j*4+1]+f*offsets[k*4+1]);
          const middle=(left+right)*(ordered===source ? .5 : -.5);
          centerX+=nx*middle;centerZ+=nz*middle;half=.5*(right-left);
        }
        const level=floor(centerX,centerZ)+.13;
        for(let j=0;j<7;j++){
          const f=j/3-1,px=centerX+nx*half*f,pz=centerZ+nz*half*f;
          const interior=1-Math.min(1,Math.max(0,(Math.abs(f)-.58)/.40));
          const shoreClearance=bankRange ? .075+.06*interior : -.035+.15*interior;
          positions.push(px,Math.max(level,floor(px,pz)+shoreClearance),pz);
          uv.push(f,run);grade.push(slope);sections.push(dx/dist,dz/dist,half,bend);
          viewStations.push(station);
          if(i&&j){const k=base+j;indices.push(k-8,k-7,k,k-8,k,k-1);}
        }
        if(i){
          const prev=previousCenter,segment=[prev[0],prev[1],centerX,centerZ,half,previousLevel,level];
          for(let cx=Math.floor((Math.min(centerX,prev[0])-half)/64);cx<=Math.floor((Math.max(centerX,prev[0])+half)/64);cx++)
            for(let cz=Math.floor((Math.min(centerZ,prev[1])-half)/64);cz<=Math.floor((Math.max(centerZ,prev[1])+half)/64);cz++){
              const k=cx+','+cz;if(!cells.has(k))cells.set(k,[]);cells.get(k).push(segment);
            }
        }
        previousLevel=level;previousCenter=[centerX,centerZ];
      }
    }
    w.channelWater=(x,z)=>{
      for(const [ax,az,bx,bz,r,ay,by] of cells.get(cell(x,z))||[]){
        const dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1)));
        if((x-ax-t*dx)**2+(z-az-t*dz)**2<r*r*.95)return Math.max(ay+(by-ay)*t,floor(x,z)+.075);
      }
      return -Infinity;
    };
    const oldClear=w.clearance||w.height;w.clearance=(x,z)=>Math.max(oldClear(x,z),w.channelWater(x,z));
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    g.setAttribute('grade',new T.Float32BufferAttribute(grade,1));g.setAttribute('section',new T.Float32BufferAttribute(sections,4));g.setIndex(indices);
    g.setAttribute('bankStation',new T.Float32BufferAttribute(viewStations,1));
    const loader=new T.TextureLoader(),pebbles=loader.load('shore-pebbles.webp');
    const deposit=loader.load('shore-cobble.webp');
    for(const tex of [pebbles,deposit]){tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.anisotropy=8;}
    const clock={value:0};
    const viewMap=valley?loader.load('yosemite-merced-banks.webp'):null;
    if(viewMap){viewMap.minFilter=T.LinearFilter;viewMap.generateMipmaps=false;}
    const m=new T.ShaderMaterial({side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2,
      uniforms:{t:clock,bed:{value:pebbles},deposit:{value:deposit},bankViews:{value:viewMap},sky:{value:w.skyTexture},sun:{value:w.sunDirection},desert:{value:0}},
      vertexShader:`attribute float grade,bankStation;attribute vec4 section;varying float fall,station;varying vec3 wp;varying vec2 flow;varying vec4 channel,mirrorUv;uniform mat4 reflectProjection;
        void main(){fall=grade;station=bankStation;wp=position;flow=uv;channel=section;mirrorUv=reflectProjection*vec4(wp,1.);gl_Position=projectionMatrix*modelViewMatrix*vec4(wp,1.);}`,
      fragmentShader:`varying float fall,station;varying vec3 wp;varying vec2 flow;varying vec4 channel,mirrorUv;uniform float t,desert,reflectionWeight;uniform vec3 sun,reflectCentre;uniform sampler2D sky,bed,deposit,sceneReflection,bankViews;
        ${valley?`
        vec4 surveyedBank(float index,vec3 direction){
          vec2 base=vec2(mod(index,${valley.columns}.),floor(index/${valley.columns}.))*vec2(${valley.tile[0]}.,${valley.tile[1]}.);
          float bearing=fract(atan(direction.z,direction.x)*.15915494+1.);
          float elevation=clamp(asin(clamp(direction.y,0.,1.))/1.55509,0.,1.);
          vec2 texel=base+vec2(1.5+bearing*${valley.angles[0]}.,1.5+(1.-elevation)*${valley.angles[1]-1}.);
          vec2 uv=texel/vec2(${valley.size[0]}.,${valley.size[1]}.);
          vec4 s=texture2D(bankViews,vec2(uv.x,1.-uv.y));
          return vec4(pow(s.rgb,vec3(2.2)),s.a);
        }` : ''}
        float streamNoise(vec2 p){
          vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
          vec4 h=fract(sin(dot(i,vec2(37.7,61.3))+vec4(0.,37.7,61.3,99.))*5939.43);
          return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);
        }
        void main(){
          vec2 dir=normalize(channel.xy),lateral=vec2(-dir.y,dir.x);
          float halfWidth=channel.z,edge=abs(flow.x),fromBank=(1.-edge)*halfWidth;
          float px=max(length(dFdx(wp.xz)),length(dFdy(wp.xz)));
          float coarse=streamNoise(wp.xz*.11),bar=streamNoise(wp.xz*.39+vec2(4.,12.));
          float wetLine=(.026+.17*bar+.054*sin(flow.y*.83-t*1.57+3.1*coarse))*min(1.,halfWidth*.66);
          if(fromBank<wetLine)discard;
          float mainFlow=smoothstep(.12,min(4.3,halfWidth*.83),fromBank);
          float pool=.37+.63*streamNoise(vec2(flow.y*.058,flow.x*.68));
          // Backwaters sit in the lee of bank projections; only small pockets
          // reverse while the body of the river continues downstream.
          float lee=(1.-mainFlow)*smoothstep(.42,.77,coarse)*smoothstep(.14,.48,fromBank);
          float speed=(.14+mainFlow*(.68+2.1*min(.55,fall)))*(1.-.22*pool)-.47*lee;
          vec2 reach=vec2(flow.y,flow.x*halfWidth);
          float eddy=sin(flow.y*1.14+t*.87+bar*3.)*lee;
          vec2 velocity=vec2(speed,eddy*.23);
          float phase=fract(t*.185+coarse*.24),other=fract(phase+.5),blend=abs(2.*phase-1.);
          vec2 parcel=reach-velocity*(phase-.5)*5.4,parcel2=reach-velocity*(other-.5)*5.4;
          float streak=mix(streamNoise(parcel*vec2(.42,2.7)),streamNoise(parcel2*vec2(.42,2.7)),blend);
          float wrinkle=mix(streamNoise(parcel*vec2(1.18,5.2)+9.),streamNoise(parcel2*vec2(1.18,5.2)+9.),blend);
          float riffle=smoothstep(.03,.19,fall)+.46*smoothstep(.58,.85,bar)*mainFlow;
          float quiet=.23+.77*mainFlow;
          float wave=sin(flow.y*1.38-t*1.74+2.7*bar+1.2*flow.x);
          vec2 slope=dir*((streak-.5)*.21+wave*(.022+.064*riffle))*quiet*(1.-smoothstep(.48,2.2,px));
          slope+=lateral*((wrinkle-.5)*.15*quiet+.041*eddy)*(1.-smoothstep(.12,.79,px));
          vec3 n=normalize(vec3(-slope.x,1.,-slope.y)),v=normalize(cameraPosition-wp),ref=reflect(-v,n);
          vec3 skyLight=texture2D(sky,vec2(.5+atan(ref.z,ref.x)*.159155,.5+asin(clamp(ref.y,-1.,1.))*.31831)).rgb;
          ${valley?`if(station>=0.){
            // The actual granite and crown silhouettes vary on every bend.
            // Sample the incoming ray on either side of this stretch before
            // the live near-bank reflection resolves individual moving trees.
            float first=floor(station);
            vec4 a=surveyedBank(first,ref),b=surveyedBank(min(first+1.,${Object.values(valley.reaches).reduce((end,[start,count])=>Math.max(end,start+count-1),0)}.),ref);
            skyLight=mix(mix(skyLight,a.rgb,a.a),mix(skyLight,b.rgb,b.a),fract(station));
          }` : ''}
          vec2 reflectedUv=mirrorUv.xy/max(.01,mirrorUv.w)+n.xz*.017;
          float border=min(min(reflectedUv.x,1.-reflectedUv.x),min(reflectedUv.y,1.-reflectedUv.y));
          float nearby=1.-smoothstep(35.,95.,distance(wp.xz,reflectCentre.xz));
          skyLight=mix(skyLight,texture2D(sceneReflection,clamp(reflectedUv,.002,.998)).rgb,
            nearby*reflectionWeight*smoothstep(0.,.04,border)*step(.01,mirrorUv.w));
          float thalweg=clamp(flow.x+channel.w*.32,-1.,1.);
          float depth=.045+mix(min(1.65,halfWidth*.16),min(.56,halfWidth*.19),desert)*(1.-thalweg*thalweg)*(.61+.75*pool);
          vec3 ray=refract(-v,n,.7502);
          vec2 bottom=wp.xz+depth*ray.xz/max(.24,-ray.y);
          vec3 stones=pow(texture2D(bed,bottom*.62).rgb,vec3(2.2));
          vec3 deposits=pow(texture2D(deposit,mat2(.8,-.6,.6,.8)*bottom*.43).rgb,vec3(2.2));
          vec3 substrate=mix(stones,deposits,smoothstep(.2,.81,bar+.19*edge+.13*channel.w*flow.x));
          substrate*=mix(vec3(.83,.95,.91),vec3(1.29,.87,.63),desert);
          float caustic=exp(-18.*abs(streak+.53*wrinkle-.765))*(1.-smoothstep(.1,.7,px))*exp(-depth*.7);
          vec3 waterTone=mix(vec3(.027,.105,.080),vec3(.14,.114,.061),desert);
          if(station>=0.)waterTone=mix(vec3(.012,.039,.032),vec3(.032,.075,.053),pool*.65+.25*bar);
          vec3 body=mix(waterTone,substrate*(.81+.47*caustic),exp(-depth*mix(1.25,2.25,desert)/max(.51,-ray.y)));
          float cosine=max(0.,dot(v,n));
          float transmittedAngle=sqrt(.4366+.5634*cosine*cosine);
          float rs=(cosine-1.333*transmittedAngle)/(cosine+1.333*transmittedAngle);
          float rp=(1.333*cosine-transmittedAngle)/(1.333*cosine+transmittedAngle);
          float fr=.5*(rs*rs+rp*rp);
          float filaments=(1.-smoothstep(.025,.101,abs(wrinkle-.56)))*smoothstep(.32,.70,streak);
          float aeration=smoothstep(.43,.76,coarse)*(.28*riffle+.39*lee);
          float foam=filaments*aeration*(1.-smoothstep(.22,1.1,px));
          vec3 c=mix(body,skyLight,fr)+vec3(.83,.61,.33)*pow(max(0.,dot(n,normalize(v+sun))),140.);
          c*=1.-.16*(1.-smoothstep(.0,.38,fromBank-wetLine));
          gl_FragColor=vec4(mix(c,vec3(.65,.70,.65),foam*.75),1.);
          #include <colorspace_fragment>
        }`});
    const mesh=new T.Mesh(g,m);mesh.name='Mapped stream channels';scene.add(mesh);
    w.reflectLocalWater=(surface,plane)=>window.attachLocalWaterReflection(T,surface,plane);
    w.reflectLocalWater(mesh,(eye,centre,normal)=>{
      let best=105*105;
      for(let col=Math.floor((eye.x-95)/64);col<=Math.floor((eye.x+95)/64);col++)for(let row=Math.floor((eye.z-95)/64);row<=Math.floor((eye.z+95)/64);row++){
        for(const [ax,az,bx,bz,r,ay,by] of cells.get(col+','+row)||[]){
          const dx=bx-ax,dz=bz-az,ds=dx*dx+dz*dz||1;
          const along=Math.max(0,Math.min(1,((eye.x-ax)*dx+(eye.z-az)*dz)/ds));
          const x=ax+dx*along,z=az+dz*along,y=ay+(by-ay)*along;
          const distance=(x-eye.x)**2+(z-eye.z)**2+(y-eye.y)**2;if(distance>=best)continue;
          best=distance;centre.set(x,y,z);normal.set(-dx*(by-ay)/ds,1,-dz*(by-ay)/ds).normalize();
        }
      }
      return Math.max(0,Math.min(1,(105-Math.sqrt(best))/32));
    });
    const update=w.update.bind(w);w.update=(dt,t,p)=>{clock.value=t;update(dt,t,p);};
  }
  window.addFlightWater=(T,scene,w)=>{
    lakes(scene,w.region);
    if(w.region==='yosemite')streams(T,scene,w);
  };
})();
