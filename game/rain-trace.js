// A finite moving rain cell leaves a drying swath. Analytic arrival times let
// a player revisit an inlet and see its real weather history after a long flight.
window.makeRainTrace=function makeRainTrace(T,scene,{world,terrain,water,cabin,survey,ground,inLake}){
  const climates={
    labrador:['South Camp cabin',7.6,390,1.0],
    milford:['Harrison Cove',8.4,560,1.12],
    lofoten:['Hamnøy',9.3,390,.78]
  };
  const profile=climates[world.region];if(!profile||!water)return null;
  const mark=survey.landmarks.find(p=>p.name===profile[0]);if(!mark)return null;
  const anchor=new T.Vector2(mark.x,mark.z),dir=new T.Vector2(1,0);
  const wind=window.getCanopyWind(T,scene);
  const time={value:0},speed=profile[1],breadth=profile[2],strength=profile[3];
  const uniforms={stormAnchor:{value:anchor},stormDir:{value:dir},stormTime:time,
    stormSpeed:{value:speed},stormWidth:{value:breadth},stormIntensity:{value:strength}};
  const narrows=world.region==='labrador'&&survey.landmarks.find(p=>/rainbow|shower|arc-en-ciel/i.test(p.name));
  let narrowsGLSL='';
  if(narrows){
    const axis=new T.Vector2(-world.sunDirection.x,-world.sunDirection.z).normalize();
    uniforms.weatherNarrows={value:new T.Vector4(narrows.x,narrows.z,narrows.x,narrows.z)};
    narrowsGLSL=`uniform vec4 weatherNarrows;
      float narrowsDrops(vec2 p,vec2 center){
        const vec2 axis=vec2(${axis.x.toFixed(7)},${axis.y.toFixed(7)});
        vec2 dst=p-center;
        return (1.-smoothstep(140.,470.,abs(dot(dst,axis))))*
               (1.-smoothstep(650.,1600.,abs(dot(dst,vec2(-axis.y,axis.x)))));
      }`;
  }
  // The normal cabin flight starts under the retreating edge of the cell and
  // crosses into sunlight over the building. Other regions keep their own timing.
  const phase=cabin?16:0;
  const fields=`${narrowsGLSL}
    uniform vec2 stormAnchor,stormDir;uniform float stormTime,stormSpeed,stormWidth,stormIntensity;
    vec2 rainPass(vec2 p){
      vec2 q=p-stormAnchor;
      float side=dot(q,vec2(-stormDir.y,stormDir.x));
      float along=dot(q,stormDir);
      float age=stormTime+${phase.toFixed(1)}-along/stormSpeed-3.*sin(side*.012);
      float cover=(1.-smoothstep(stormWidth*.37,stormWidth,abs(side)))*(1.-smoothstep(1500.,2300.,abs(along)));
      return vec2(age,cover*stormIntensity);
    }
    float dropsNow(vec2 pass){
      return pass.y*smoothstep(-19.,-7.,pass.x)*(1.-smoothstep(6.,17.,pass.x));
    }
    float waterHeld(vec2 pass,float seconds){
      return pass.y*smoothstep(-19.,-5.,pass.x)*exp(-max(0.,pass.x-6.)/seconds);
    }`;
  function extend(mat,anchorText,code){
    if(!mat.fragmentShader.includes(anchorText))throw Error('Rain trace cannot locate '+anchorText);
    Object.assign(mat.uniforms,uniforms);mat.fragmentShader=fields+'\n'+mat.fragmentShader.replace(anchorText,code+'\n'+anchorText);
    mat.needsUpdate=true;
  }
  Object.assign(terrain.uniforms,wind.uniforms);
  terrain.fragmentShader=wind.flowGLSL+'\n'+terrain.fragmentShader;
  extend(terrain,'float dep=1.-exp(-d*',`
    vec2 storm=rainPass(wp.xz);
    ${narrows?`float rainNow=narrowsDrops(wp.xz,weatherNarrows.xy),rainTail=narrowsDrops(wp.xz,weatherNarrows.zw);`:''}
    if((storm.y>.005 && storm.x>-19. && storm.x<680.)${narrows?'||max(rainNow,rainTail)>.005':''}){
      float exposure=clamp(dot(normal,sun)*1.9+.1,.04,1.);
      float ventilation=.34+.66*localExposure(wp.xz);
      float damp=waterHeld(storm,mix(127.,48.,exposure)/ventilation);
      ${narrows?'damp=max(damp,max(rainNow,.66*rainTail*exp(-36.*ventilation/95.)));':''}
      float mottled=.5+.21*sin(wp.x*.73+sin(wp.z*.91))+.19*sin(wp.z*.41-wp.x*.68);
      float wetArea=smoothstep(mottled*.43,mottled*.43+.46,damp);
      vec3 v=normalize(cameraPosition-wp);
      float sheen=pow(1.-max(dot(normal,v),0.),4.)*smoothstep(.21,.96,normal.y);
      c=c*(1.-wetArea*.29)+wetArea*sheen*vec3(.073,.092,.11);
    }`);
  let clearingLight=null;
  if(cabin){
    const sky=scene.children.find(o=>o.material?.uniforms?.berteCloud && o.material!==terrain);
    // The weather used for the distant rainbow already has the local satellite
    // cloud texture. Project a nearer broken cloud base into the same sky and
    // integrate a finite volume of backlit rain over the approach to the camp.
    const campAir=`
      uniform vec2 stormAnchor,stormDir;uniform float stormTime,stormSpeed;
      ${window.berteRainColumn}
      vec3 campAirlight(vec3 base,vec3 ray,float depth){
        float local=campDistance(cameraPosition.xz);
        if(local<.001)return base;
        // A low cloud deck, approximately 120 metres over the lake. Its warm
        // rim and shaded underside use different octaves of the regional cloud.
        float rise=max(.075,ray.y+.085);
        vec2 cp=cameraPosition.xz-stormAnchor+ray.xz*(124./rise);
        vec2 flow=stormDir*stormTime*stormSpeed;
        float tex=texture2D(berteCloud,(cp-flow)*.0024+vec2(.24,.29)).r;
        float detail=texture2D(berteCloud,(cp-flow)*.0092+vec2(.56,.67)).r;
        float shadow=campShadow(cameraPosition.xz);
        float overhead=smoothstep(-.075,.16,ray.y);
        float ceiling=smoothstep(.08,.91,.48*tex+.28*detail+.64*shadow+
          .19*dot(ray.xz,stormDir));
        float height=124./max(.001,ray.y);
        float inFront=smoothstep(height-18.,height+18.,depth);
        vec3 underside=mix(vec3(.072,.100,.143),vec3(.29,.328,.345),.55*tex+.45*detail);
        float facing=pow(max(0.,dot(ray,berteSun)),3.);
        underside+=vec3(.235,.128,.052)*facing*(.45+.55*tex);
        float aftermath=1.-smoothstep(55.,180.,stormTime);
        base=mix(base,underside,local*ceiling*overhead*inFront*(.18*aftermath+.67*shadow));
        // Low sun illuminates the undersides of the breaking deck while the
        // high blue sky stays open between them. The same field renders in the
        // lake's mirrored camera and below the geometry of the regional bow.
        float brightCloud=smoothstep(.13,.65,dot(base,vec3(.22,.61,.17)));
        float angleBand=smoothstep(-.045,.10,ray.y)*(1.-smoothstep(.53,.94,ray.y));
        float breakthrough=local*aftermath*(1.-shadow)*inFront*angleBand*brightCloud;
        vec3 gold=base*vec3(1.25,1.015,.76)+vec3(.072,.025,.010);
        base=mix(base,gold,breakthrough*(.44+.55*tex));
        // Sampling in world metres makes the rain front sit between the bird
        // and the far bank. Near forest and cabin silhouettes stay in front.
        vec4 medium=campRainMedium(ray,depth,local);
        return mix(base,medium.rgb,medium.a);
      }`;
    if(sky){
      const mark='/* before local precipitation */';
      const sceneFields=campAir.replace('uniform vec2 stormAnchor,stormDir;uniform float stormTime,stormSpeed;','');
      // berteCloud, berteLake and berteSun are supplied by the rainbow. Insert
      // after their declarations to preserve the single shared texture binding.
      for(const [mat,ray,depth] of [[sky.material,'d','95000.'],[terrain,'normalize(wp-cameraPosition)','d']]){
        Object.assign(mat.uniforms,uniforms);
        const decl=mat===terrain?'':'uniform vec2 stormAnchor,stormDir;uniform float stormTime,stormSpeed;\n';
        mat.fragmentShader=mat.fragmentShader.replace('vec3 berteScatter(',decl+sceneFields+'\nvec3 berteScatter(').replace(mark,
          mark+'\ngl_FragColor.rgb=campAirlight(gl_FragColor.rgb,'+ray+','+depth+');');
        mat.needsUpdate=true;
      }
      terrain.fragmentShader=terrain.fragmentShader.replace('float dep=1.-exp(-d*',`
        float localCamp=campDistance(wp.xz);
        float shadeCamp=campShadow(wp.xz);
        float sunPatch=smoothstep(.02,.43,dot(normal,sun));
        vec3 litCamp=mix(vec3(1.04,1.01,.97),vec3(1.65,1.29,.89),sunPatch);
        float currentFront=1.-smoothstep(85.,210.,stormTime);
        c*=mix(vec3(1.),mix(litCamp,vec3(.44,.55,.70),shadeCamp),localCamp*currentFront);
        float dep=1.-exp(-d*`);
    }
    const key=scene.children.find(o=>o.isDirectionalLight),hemi=scene.children.find(o=>o.isHemisphereLight);
    let baseKey,baseHemi,baseSunColor;
    const clearingTint=new T.Color(0xffc98c);
    clearingLight=(p,eye)=>{
      if(!key||!hemi)return;
      if(baseKey===undefined){baseKey=key.intensity;baseHemi=hemi.intensity;baseSunColor=key.color.clone();}
      const near=(1-T.MathUtils.smoothstep(Math.hypot(eye.x-anchor.x,eye.z-anchor.y),300,720))*(1-T.MathUtils.smoothstep(time.value,85,210));
      const cloud=(1-T.MathUtils.smoothstep(p.age,4,18))*p.area;
      key.intensity=baseKey*(1+near*(.48-1.29*cloud));
      key.color.copy(baseSunColor).lerp(clearingTint,near*(1-cloud)*.85);
      hemi.intensity=baseHemi*(1-near*.22*cloud);
    };
  }
  const plume={value:new T.Vector4(0,0,0,0)}, plumeLoad={value:0},plumeTime={value:0};
  const wm=water.material;
  Object.assign(wm.uniforms,{runoffMouth:plume,runoffLoad:plumeLoad,runoffTime:plumeTime});
  // Impacts perturb the water normal before it samples its real reflection.
  // Expanding fronts are antialiased and fade naturally at altitude.
  extend(wm,'vec3 n=normalize(vec3(slope.x,1.,slope.y));',`
    float showers=dropsNow(rainPass(p));
    ${narrows?'showers=max(showers,narrowsDrops(p,weatherNarrows.xy));':''}
    if(showers>.012 && footprint<.24){
      vec2 cell=p*3.25,ix=floor(cell);
      vec2 ringSlope=vec2(0.);
      for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
        vec2 k=ix+vec2(float(i),float(j));
        float h=fract(sin(dot(k,vec2(18.46,83.59)))*18347.19);
        vec2 d=cell-(k+vec2(h,fract(h*37.851)));
        float r=length(d),age=fract(stormTime*(1.34+.63*h)+fract(h*14.71));
        float delta=r-1.13*age;
        ringSlope+=d/max(.04,r)*sin(delta*26.)*exp(-delta*delta*110.)*(1.-age)*(1.-age);
      }
      slope+=ringSlope*.12*min(showers,1.)*(1.-smoothstep(.028,.23,footprint));
    }`);
  if(cabin){
    const anchor='vec3 h=normalize(v+sunDirection);';
    const fragment=`
      uniform vec4 runoffMouth;uniform float runoffLoad,runoffTime;
      float plumeNoise(vec2 p){
        float a=sin(1.33*p.y+.65*sin(p.x*.87));
        float b=sin(1.64*p.x-.86*p.y+1.13*a);
        float c=sin(2.79*p.y+1.53*p.x+1.87*b);
        return .5+.25*a+.17*b+.08*c;
      }`;
    wm.fragmentShader=fragment+'\n'+wm.fragmentShader.replace(anchor,`
      if(runoffLoad>.008 && distance(p,runoffMouth.xy)<28.){
        vec2 q=p-runoffMouth.xy,axis=runoffMouth.zw;
        float u=dot(q,axis),z=dot(q,vec2(-axis.y,axis.x));
        float eddy=plumeNoise(vec2(u*.41-runoffTime*.19,z*.34));
        float curl=sin(u*.47-runoffTime*.63+eddy*2.)*(.11+.09*max(u,0.));
        float width=.31+.22*max(0.,u), end=2.8+12.*runoffLoad;
        float lateral=(z-curl)/width;
        float lobe=exp(-lateral*lateral)*(1.-smoothstep(.48*end,end,u))*smoothstep(-.8,.25,u);
        float folded=plumeNoise(vec2(u*.58-runoffTime*.27,(z-curl)*1.14+1.6*eddy));
        float particles=runoffLoad*lobe*(.36+.31*eddy+.39*folded)/(1.+.076*max(0.,u));
        // Suspended fines scatter below the surface, leaving trees and sky
        // intact in the Fresnel reflection above the mixing water.
        body=mix(body,vec3(.34,.219,.122),clamp(particles*1.37,0.,.82));
      }`+anchor);
  }

  const smooth=(a,b,v)=>T.MathUtils.smoothstep(v,a,b);
  function pass(x,z,t,out={}){
    // Visuals, audio and feather wetting may sample before the next render.
    const current=world.windField?.direction,sign=cabin?-1:1;
    const fx=current?sign*current.x:dir.x,fz=current?sign*current.z:dir.y;
    const dx=x-anchor.x,dz=z-anchor.y,side=-dx*fz+dz*fx,along=dx*fx+dz*fz;
    const age=t+phase-along/speed-3*Math.sin(side*.012);
    const area=(1-smooth(breadth*.37,breadth,Math.abs(side)))*(1-smooth(1500,2300,Math.abs(along)))*strength;
    out.age=age;out.area=area;out.rain=area*smooth(-19,-7,age)*(1-smooth(6,17,age));return out;
  }
  const wet=(p,seconds)=>p.area*smooth(-19,-5,p.age)*Math.exp(-Math.max(0,p.age-6)/seconds);
  const sourcePass={};
  world.rainCellAt=(x,y,z,t,out)=>{
    const p=pass(x,z,t,sourcePass);
    out.rain=p.rain;out.wetness=wet(p,82/out.drying);
  };
  let randomState=930187;
  const random=()=>((randomState=(Math.imul(randomState,1664525)+1013904223)>>>0)/4294967296);
  const seed=[],tip=[];
  for(let i=0;i<(cabin?3200:560);i++){const p=[random()*30,random()*16,random()*30];seed.push(...p,...p);tip.push(0,1);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(seed,3));g.setAttribute('tip',new T.Float32BufferAttribute(tip,1));
  const drops=new T.LineSegments(g,new T.ShaderMaterial({uniforms:{clock:time,origin:{value:new T.Vector3()},travel:{value:new T.Vector2()},wind:{value:new T.Vector2()},amount:{value:0}},depthWrite:false,transparent:true,
    vertexShader:`attribute float tip;uniform float clock;uniform vec3 origin;uniform vec2 wind,travel;varying float alpha;
      void main(){vec3 box=vec3(30.,16.,30.);
        vec3 d=mod(position+vec3(travel.x,-8.1*clock,travel.y)-origin+box*.5,box)-box*.5;
        alpha=(1.-smoothstep(8.,15.,length(d.xz)))*(1.-smoothstep(5.5,8.,abs(d.y)))*(.35+.65*tip);
        gl_Position=projectionMatrix*viewMatrix*vec4(origin+d+tip*vec3(wind.x,-8.1,wind.y)*${cabin?'.032':'.024'},1.);}`,
    fragmentShader:`uniform float amount;varying float alpha;void main(){gl_FragColor=vec4(${cabin?'.74,.82,.86':'.63,.72,.75'},amount*alpha*${cabin?'.67':'.29'});
      #include <colorspace_fragment>
    }`}));
  drops.frustumCulled=false;drops.name='Passing local shower';scene.add(drops);
  const vapor=cabin?wetForestAir(T,scene,cabin,ground,uniforms,random):null;
  const camp=cabin?makeCampDrainage(T,scene,cabin,ground,inLake,world.waterLevel+.16,uniforms,plume,random):null;
  let last=-1,air={};
  return function update(t,eye,field){
    time.value=t;dir.set(field.direction.x,field.direction.z);
    if(narrows){
      const now=240*Math.sin(t*field.advection/240),past=240*Math.sin((t-36)*field.advection/240);
      uniforms.weatherNarrows.value.set(narrows.x+dir.x*now,narrows.z+dir.y*now,narrows.x+dir.x*past,narrows.z+dir.y*past);
    }
    // The trailing edge evaporates back toward the lake. Rain itself continues
    // to fall downwind with the measured surface air over the clearing.
    if(cabin)dir.multiplyScalar(-1);
    const rain=pass(eye.x,eye.z,t);clearingLight?.(rain,eye);const u=drops.material.uniforms;
    u.origin.value.copy(eye);u.amount.value=rain.rain;drops.visible=rain.rain>.014;
    const dt=last<0?0:Math.max(0,Math.min(.18,t-last));last=t;
    if(drops.visible){field.sample(eye.x,eye.y,eye.z,t,air);u.wind.value.set(air.windX,air.windZ);u.travel.value.addScaledVector(u.wind.value,dt);}
    if(camp){
      const p=pass(anchor.x,anchor.y,t),ventilation=.34+.66*field.canopyExposure(anchor.x,anchor.y);
      const retained=wet(p,68/ventilation);
      // The hydrograph peaks later than the rain at the roof and recedes
      // slowly as the clearing drains. A cold jump to a landmark is continuous.
      const delayed={...p,age:p.age-10};
      const runoff=wet(delayed,63/ventilation)*smooth(-10,10,p.age);
      plumeLoad.value=runoff;plumeTime.value=t;
      camp(t,p.rain,retained,wet(p,34/ventilation),wet(p,142/ventilation),runoff);
      vapor?.(eye,retained,1-T.MathUtils.smoothstep(p.rain,.04,.7));
    }
  };
};

// Wet spruce clearcuts hold shallow pockets of humid air after a shower. Their
// cloud pattern advects through the basin and the shafts clear as the land dries.
function wetForestAir(T,scene,cabin,ground,uniforms,random){
  const {root}=cabin,photo=scene.children.find(o=>o.material?.uniforms?.berteCloud&&o.material.uniforms.map);
  if(!photo)return null;
  const pos=[],size=[],seed=[];
  const cos=Math.cos(root.rotation.y),sin=Math.sin(root.rotation.y);
  function patch(x,z,width,height){
    const wx=root.position.x+cos*x+sin*z,wz=root.position.z-sin*x+cos*z;
    pos.push(wx,ground(wx,wz)-.28,wz);size.push(width,height);seed.push(random()*84);
  }
  // Keep the elevated landing and the cabin approach open. The damp air sits
  // in hollows among the trees and along the two flanks of the headland.
  for(const side of [-1,1]){
    for(let i=0;i<10;i++){
      const inland=-63+82*random();
      patch(side*(10+58*random()),inland,16+22*random(),2.2+4.2*random());
    }
    for(let i=0;i<4;i++)patch(side*(49+40*random()),23+12*random(),21+30*random(),1.4+2.2*random());
  }
  const quad=new T.PlaneGeometry(1,1),g=new T.InstancedBufferGeometry();
  g.index=quad.index;g.setAttribute('position',quad.attributes.position);g.setAttribute('uv',quad.attributes.uv);
  g.setAttribute('origin',new T.InstancedBufferAttribute(new Float32Array(pos),3));
  g.setAttribute('span',new T.InstancedBufferAttribute(new Float32Array(size),2));
  g.setAttribute('seed',new T.InstancedBufferAttribute(new Float32Array(seed),1));g.instanceCount=seed.length;
  const mat=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,
    uniforms:{layer:photo.material.uniforms.berteCloud,t:uniforms.stormTime,air:{value:0},sunOpening:{value:0}},
    vertexShader:`attribute vec3 origin;attribute vec2 span;attribute float seed;uniform float t;varying vec2 st;varying float phase,dist;
      void main(){vec2 axis=normalize(cameraPosition.xz-origin.xz);vec2 side=vec2(axis.y,-axis.x);
        vec2 drift=.62*vec2(sin(seed+t*.12),cos(.7*seed+t*.095));
        vec3 wp=vec3(origin.x+side.x*position.x*span.x+drift.x,origin.y+uv.y*span.y,origin.z+side.y*position.x*span.x+drift.y);
        phase=seed;st=uv;dist=distance(cameraPosition,wp);gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);}`,
    fragmentShader:`uniform sampler2D layer;uniform float air,sunOpening,t;varying vec2 st;varying float phase,dist;
      void main(){vec2 p=vec2(st.x+.10*st.y-phase*.023-t*.018,st.y*.37+phase*.016);
        float billow=texture2D(layer,p).r,fine=texture2D(layer,p*2.69+vec2(t*.024,.34)).r;
        float top=.19+.45*billow+.18*fine+.06*sin(st.x*12.+phase+t*.47);
        float profile=(1.-smoothstep(top*.24,top,st.y))*smoothstep(0.,.13,st.y);
        float ends=1.-smoothstep(.13,.5,abs(st.x-.5));
        float contrast=smoothstep(.09,.87,billow*.65+fine*.35);
        float alpha=profile*ends*contrast*air*(.17+.18*sunOpening)*smoothstep(4.,18.,dist);
        if(alpha<.006)discard;
        vec3 vapor=mix(vec3(.225,.272,.28),vec3(.67,.555,.379),sunOpening*(.55+.45*fine));
        gl_FragColor=vec4(vapor,alpha);
        #include <colorspace_fragment>
      }`});
  const wisps=new T.Mesh(g,mat);wisps.name='Sunlit rain vapor in the camp hollows';wisps.frustumCulled=false;wisps.renderOrder=2;scene.add(wisps);
  return (eye,moisture,light)=>{
    const weight=(1-T.MathUtils.smoothstep(eye.distanceTo(root.position),220,480))*moisture;
    wisps.visible=weight>.025;mat.uniforms.air.value=weight;mat.uniforms.sunOpening.value=light;
  };
}

// The narrow trail drains from the eave, around the building and into the
// lake. Route on the *drawn* ground triangles (including the gravel shelf).
function makeCampDrainage(T,scene,cabin,ground,inLake,level,uniforms,mouth,random){
  const {root,roofs}=cabin,site=root.position,cos=Math.cos(root.rotation.y),sin=Math.sin(root.rotation.y);
  function point(x,z){return new T.Vector3(site.x+cos*x+sin*z,0,site.z-sin*x+cos*z);}
  function bed(x,z){const v=point(x,z);return ground(v.x,v.z);}
  const U={rainRoof:{value:0},rainShade:{value:0},rainFlow:{value:0}};
  // Light reaches exposed deck edges sooner than deep porch boards. Tiny
  // interruptions in the film follow the boards and the photographed grain.
  for(const mesh of root.children){
    const code=mesh.name,stone=code==='Glacial cobbles on the landing',soil=/Sandy cabin clearing|Moss and needle litter/.test(code);
    const roof=code==='Cabin roof',boards=code==='Cabin wood'||code==='Cabin log',wall=code==='Cabin siding';
    if(!(stone||soil||roof||boards||wall))continue;
    const mat=mesh.material,prior=mat.onBeforeCompile,key=mat.customProgramCacheKey();
    mat.onBeforeCompile=function(shader,renderer){
      prior.call(this,shader,renderer);Object.assign(shader.uniforms,U);
      shader.vertexShader='varying vec3 dropLocal;\n'+shader.vertexShader.replace('#include <begin_vertex>',`
        #include <begin_vertex>
        #ifdef USE_INSTANCING
          dropLocal=(instanceMatrix*vec4(position,1.)).xyz;
        #else
          dropLocal=position;
        #endif`);
      shader.fragmentShader='varying vec3 dropLocal;uniform float rainRoof,rainShade;\n'+shader.fragmentShader.replace('#include <roughnessmap_fragment>',`
        #include <roughnessmap_fragment>
        vec3 rp=dropLocal;
        float fibers=.5+.5*sin(rp.x*29.+rp.z*5.8+.85*sin(rp.z*14.));
        float edge=clamp((rp.z-1.7)*.85+max(0.,abs(rp.x)-1.5)*.54,0.,1.);
        float tail=.5+.5*sin(rp.x*17.6+.8*sin(rp.x*6.8)+rp.y*.51);
        float dampFoot=1.-smoothstep(.08,.95,rp.y+.18*tail);
        float held=${roof?'rainRoof*(.80+.20*fibers)':wall?'rainShade*(.19+.57*dampFoot+.18*tail)':boards?'mix(rainShade*.54,rainRoof,edge)*(.78+.22*fibers)':stone?'rainShade*(.66+.32*fibers)':'rainShade*(.67+.23*sin(rp.x*1.07+rp.z*.84)*sin(rp.x*.64-rp.z*.62))'};
        held=clamp(held,0.,1.);
        diffuseColor.rgb*=1.-held*${stone?'.50':soil?'.55':boards?'.65':roof?'.42':'.33'};
        roughnessFactor=mix(roughnessFactor,${roof?'.115':soil?'.32':'.18'},held);
      `.replace('smoothstep(.32,-.64,rp.y)','(1.-smoothstep(-.64,.32,rp.y))'));
    };
    mat.customProgramCacheKey=()=>key+':after-rain:'+code;mat.needsUpdate=true;
  }
  // A least-cost outlet follows low ground; a strong positive-grade penalty
  // lets a tiny rut pass a DEM saddle without marching uphill to the shore.
  const stride=.72,cols=57,rows=Math.ceil((Math.min(68,cabin.waterDistance+16)+10)/stride),originX=-20,originZ=-8;
  const nodes=cols*rows,y=new Float32Array(nodes),dist=new Float64Array(nodes),parent=new Int32Array(nodes);
  dist.fill(Infinity);parent.fill(-1);
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++)y[i+j*cols]=bed(originX+i*stride,originZ+j*stride);
  const startX=roofs[0].half+.1,startZ=roofs[0].front-.3;
  const origin=Math.round((startX-originX)/stride)+cols*Math.round((startZ-originZ)/stride);
  const visited=new Uint8Array(nodes);dist[origin]=0;
  let end=-1;
  for(let step=0;step<nodes;step++){
    let best=-1,cost=Infinity;
    for(let k=0;k<nodes;k++)if(!visited[k]&&dist[k]<cost){cost=dist[k];best=k;}
    if(best===-1)break;
    visited[best]=1;const i=best%cols,j=Math.floor(best/cols),lx=originX+i*stride,lz=originZ+j*stride;
    if(y[best]<level-.012){const v=point(lx,lz);if(inLake(v.x,v.z)){end=best;break;}}
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
      if(!(dx||dz)||i+dx<0||i+dx>=cols||j+dz<0||j+dz>=rows)continue;
      const k=best+dx+cols*dz;if(visited[k])continue;
      const x=lx+dx*stride,z=lz+dz*stride;if(Math.abs(x)<2.3&&z>-3.7&&z<2.86)continue;
      const delta=y[k]-y[best],length=Math.hypot(dx,dz)*stride;
      const effort=length*(1+.12*Math.sin(z*.38+x*.31))+Math.max(0,delta)*86+Math.max(0,delta+.03)*4.8;
      if(cost+effort<dist[k]){dist[k]=cost+effort;parent[k]=best;}
    }
  }
  const path=[];
  for(let k=end;k>=0;k=parent[k])path.push([originX+(k%cols)*stride,originZ+Math.floor(k/cols)*stride]);
  path.reverse();
  if(path.length>2){
    const last=path.at(-1),near=path[Math.max(0,path.length-6)],v=point(...last),u=point(...near),length=v.distanceTo(u)||1;
    mouth.value.set(v.x,v.z,(v.x-u.x)/length,(v.z-u.z)/length);
  }

  // Build surface films and puddles in one draw. Their perimeter contracts
  // as the supply falls; the reflected cabin and spruce move with the camera.
  const pos=[],uv=[],kind=[],tri=[],impactOrigins=[];
  const position=(x,z,off=.065)=>{const v=point(x,z);pos.push(v.x,Math.max(level+.012,ground(v.x,v.z))+off,v.z);};
  const channel=path.length>2?new T.CatmullRomCurve3(path.map(([x,z])=>new T.Vector3(x,0,z))).getSpacedPoints(path.length*3):[];
  let station=0;
  for(let j=0;j<channel.length;j++){
    const c=channel[j],prev=channel[Math.max(0,j-1)],next=channel[Math.min(channel.length-1,j+1)];
    station+=c.distanceTo(prev);
    const [x,z]=[c.x,c.z],a=[prev.x,prev.z],b=[next.x,next.z];
    const nx=b[1]-a[1],nz=a[0]-b[0],len=Math.hypot(nx,nz)||1;
    const along=j/(channel.length-1),width=.137+.054*Math.sin(station*1.61)+.043*Math.sin(station*3.47)+.061*along;
    // On this sandy shelf a small rill snakes round grass tussocks within its
    // drainage corridor. Pin both ends to the eave and the surveyed outlet.
    const bend=Math.min(1,j/8,(channel.length-1-j)/8)*(.23*Math.sin(station*1.04+.71*Math.sin(station*.44))+.071*Math.cos(station*2.53));
    for(const side of [-1,1]){
      const offset=bend+side*width;position(x+nx/len*offset,z+nz/len*offset,.04);
      uv.push(side,station);kind.push(0);
    }
    if(j){const k=2*j;tri.push(k-2,k-1,k,k-1,k+1,k);}
  }
  let poolID=0;
  function puddle(x,z,rx,rz){
    poolID++;
    const sides=36,rings=5,start=pos.length/3;
    for(let j=0;j<=rings;j++)for(let i=0;i<=sides;i++){
      const angle=i/sides*Math.PI*2,v=j/rings;
      const wave=1+.12*Math.sin(3*angle+x)+.08*Math.sin(5*angle-z)+.047*Math.sin(9*angle);
      const dx=Math.cos(angle)*v,dz=Math.sin(angle)*v;
      position(x+dx*wave*rx,z+dz*wave*rz,.079);uv.push(dx,dz);kind.push(poolID);
      if(i&&j){const k=start+j*(sides+1)+i;tri.push(k-sides-2,k-sides-1,k,k-sides-2,k,k-1);}
    }
  }
  const roof=roofs[0];
  for(const side of [-1,1]){
    puddle(side*(roof.half+.06),1.74,.59,1.58);
    puddle(side*(roof.half+.07),-.90,.37,.98);
  }
  puddle(3.35,3.36,1.0,.48);puddle(1.71,4.17,.78,.38);
  // The low hollows beside the log steps feed shallow wheel-rut pools down
  // the sandy landing. A narrow margin of wet sediment shows through each one.
  puddle(-2.76,3.64,1.32,.64);puddle(-1.96,5.54,.94,.60);
  puddle(.46,7.40,.69,1.33);puddle(-.53,10.30,.62,1.07);
  puddle(.92,15.37,.72,1.05);puddle(-.21,17.29,.59,.91);
  puddle(.43,22.22,.51,.66);
  const G=new T.BufferGeometry();G.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  G.setAttribute('uv',new T.Float32BufferAttribute(uv,2));G.setAttribute('pool',new T.Float32BufferAttribute(kind,1));G.setIndex(tri);G.computeBoundingSphere();
  const mat=new T.ShaderMaterial({side:T.DoubleSide,depthWrite:false,transparent:true,polygonOffset:true,polygonOffsetFactor:-2,
    uniforms:{...U,campFrame:{value:new T.Vector4(site.x,site.z,cos,sin)},campSand:{value:root.getObjectByName('Sandy cabin clearing').material.map},campSky:{value:scene.children.find(o=>o.material?.uniforms?.berteCloud && o.material.uniforms.map)?.material.uniforms.map.value},t:uniforms.stormTime,...uniforms,impact:{value:[]}},
    vertexShader:`attribute float pool;varying float wetArea;varying vec2 st;varying vec3 wp;varying vec4 pMirror;uniform mat4 reflectProjection;
      void main(){wetArea=pool;st=uv;wp=position;pMirror=reflectProjection*vec4(wp,1.);gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);}`,
    fragmentShader:`uniform float rainFlow,t,reflectionWeight;uniform sampler2D sceneReflection;uniform vec3 reflectCentre;uniform vec4 impact[16];uniform sampler2D campSky,campSand;uniform vec4 campFrame;
      varying float wetArea;varying vec2 st;varying vec3 wp;varying vec4 pMirror;
      void main(){
        float water=clamp(rainFlow,0.,1.),edge=wetArea>.5?length(st):abs(st.x),radius=sqrt(water)*.91;
        float grit=.5+.5*sin(wp.x*18.2+2.*sin(wp.z*16.1))*cos(wp.z*19.4-wp.x*2.1);
        float fringe=.06*grit+.04*sin(wp.x*7.47+wp.z*4.6);
        vec2 off=wp.xz-campFrame.xy;
        vec2 local=vec2(dot(off,vec2(campFrame.z,-campFrame.w)),dot(off,campFrame.wz));
        vec3 gravel=texture2D(campSand,local/4.6).rgb;
        float granule=dot(gravel,vec3(.24,.58,.18));
        float breakup=clamp((granule-.17)*1.35,-.18,.35);
        float bank=1.-smoothstep(max(0.,radius-.22),radius+.045,edge+fringe+breakup*.25);
        float mask=bank*smoothstep(.008,.11,water);
        if(mask<.012)discard;
        vec2 slopes=vec2(.0012*sin(wp.x*3.1+t*1.1+wp.z*.92),.0017*cos(wp.z*2.3-t*1.37));
        if(wetArea<.5)slopes+=vec2(.014,.007)*sin(st.y*7.-t*3.6+sin(wp.x*4.7));
        else for(int i=0;i<16;i++){
          vec2 q=wp.xz-impact[i].xy;float d=length(q),life=impact[i].z;
          float delta=d-life*.59;float wave=exp(-delta*delta*1450.)*sin(delta*96.);
          slopes+=q/max(.018,d)*wave*max(0.,1.-life/.82)*impact[i].w*.027;
        }
        if(wetArea>.5){
          // Runoff enters at the upstream lip. Each shallow pool sends a
          // separate train of small capillary rings across the reflected sky.
          vec2 d=st-vec2(.15*sin(wetArea*3.1),.52);
          float r=length(d),phase=fract(t*(.87+.04*wetArea)+wetArea*.618);
          float wave=r-phase*.97,radial=sin(72.*wave)*exp(-wave*wave*240.)*(1.-phase);
          slopes+=d/max(.04,r)*radial*.041*water;
        }
        vec2 coord=pMirror.xy/max(.001,pMirror.w);
        vec3 reflectColor=texture2D(sceneReflection,clamp(coord+slopes,.002,.998)).rgb;
        float grazing=1.-clamp(normalize(cameraPosition-wp).y,.01,1.);
        float fres=.038+.962*pow(grazing,3.5);
        vec3 sight=normalize(wp-cameraPosition),skyRay=reflect(sight,normalize(vec3(slopes.x,1.,slopes.y)));
        vec2 skyUv=vec2(.5+atan(skyRay.z,skyRay.x)/6.283185,.5+asin(clamp(skyRay.y,-1.,1.))/3.141592);
        // Both near and distant pools reflect the photographed sky. When the
        // planar pass is active it replaces the lookup with local spruce/eaves.
        vec3 photo=texture2D(campSky,skyUv).rgb;
        vec3 wetReflection=mix(photo,reflectColor,reflectionWeight*.94);
        vec3 floorTint=gravel*vec3(.30,.265,.237);
        float gritBreak=smoothstep(.27,.57,granule)*(1.-bank*.77);
        vec3 film=mix(floorTint,wetReflection,clamp(.048+.94*fres,0.,1.)*(1.-gritBreak));
        float opacity=(.62+.35*fres)*(.68+.32*bank)*(1.-gritBreak*.70);
        if(wetArea<.5){
          // Shallow moving threads follow the slope away from the standing
          // puddles. Through the broken film the actual forest floor shows.
          float froth=.5+.5*sin(st.y*7.4-t*4.8+1.8*sin(st.y*2.5)+st.x*2.8);
          float broken=smoothstep(.12,.89,.5+.35*sin(st.y*2.59+sin(st.y*1.4))+.15*sin(st.y*5.17));
          float shine=smoothstep(.86,.99,froth)*(.15+.85*grit)*broken;
          film=mix(vec3(.045,.037,.024),vec3(.38,.43,.39),shine*.55+.18*fres);
          opacity=(.34+.26*fres+.19*shine)*(.31+.69*broken);
        }
        gl_FragColor=vec4(film,mask*opacity);
        #include <colorspace_fragment>
      }`});
  const ribbon=new T.Mesh(G,mat);ribbon.name='Eave puddles and runoff rivulet';ribbon.userData.outlet=mouth.value.toArray();ribbon.renderOrder=4;scene.add(ribbon);
  const reflectionPoint=point(roof.half+.1,1.48);reflectionPoint.y=ground(reflectionPoint.x,reflectionPoint.z)+.07;
  window.attachLocalWaterReflection(T,ribbon,(eye,centre,normal)=>{centre.copy(reflectionPoint);normal.set(0,1,0);return Math.max(0,Math.min(1,(76-eye.distanceTo(centre))/28));});

  // Fixed roof pitches collect water along their actual low edges. Each bead
  // grows at a corrugation, drops under gravity and then launches a fading ring.
  const positions=new Float32Array(16*6),g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage));
  const drops=new T.LineSegments(g,new T.LineBasicMaterial({color:0xd2e3de,transparent:true,opacity:.8,depthWrite:false}));
  drops.name='Runoff dripping from the cabin eaves';drops.renderOrder=5;drops.frustumCulled=false;scene.add(drops);
  for(let i=0;i<16;i++){
    const sign=i<8?1:-1,f=(i%8+.22+.50*random())/8;
    const x=sign*(roof.half+.023),z=T.MathUtils.lerp(roof.back+.14,roof.front-.07,f),v=point(x,z);
    const bottom=ground(v.x,v.z)+.079,top=site.y+roof.eave;
    impactOrigins.push({x:v.x,z:v.z,top,bottom,fall:Math.sqrt(Math.max(.1,top-bottom)*2/9.81),seed:random()*.9,rate:.63+.55*random()});
    mat.uniforms.impact.value.push(new T.Vector4(v.x,v.z,2,0));
  }
  // Continuous threads at four low corrugations break up into beads under
  // gravity. A thin screen-space footprint preserves their integrated opacity
  // through the subpixel transition as the player approaches the roof.
  const strandPos=[],strandUV=[],strandSeed=[],strandIndex=[];
  for(let i=0;i<4;i++){
    const x=(i%2?1:-1)*(roof.half+.018),z=i<2?roof.front-.18:roof.back+.36;
    const v=point(x,z),top=site.y+roof.eave,bottom=ground(v.x,v.z)+.077;
    for(let j=0;j<=16;j++)for(const side of [-1,1]){
      const fall=j/16,idx=strandPos.length/3;
      strandPos.push(v.x,top+(bottom-top)*fall,v.z);strandUV.push(side,fall);strandSeed.push(i*1.77);
      if(j&&side===1)strandIndex.push(idx-3,idx-2,idx-1,idx-2,idx,idx-1);
    }
  }
  const tg=new T.BufferGeometry();
  tg.setAttribute('position',new T.Float32BufferAttribute(strandPos,3));
  tg.setAttribute('uv',new T.Float32BufferAttribute(strandUV,2));
  tg.setAttribute('dripSeed',new T.Float32BufferAttribute(strandSeed,1));tg.setIndex(strandIndex);
  const strands=new T.Mesh(tg,new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,
    uniforms:{roofWet:U.rainRoof,t:uniforms.stormTime},
    vertexShader:`attribute float dripSeed;uniform float t,roofWet;varying vec2 st;varying float seed,coverage;
      void main(){seed=dripSeed;st=uv;vec3 pos=position;
        pos.x+=uv.y*uv.y*.043+uv.y*.007*sin(seed+uv.y*19.-t*9.);
        pos.z+=uv.y*uv.y*.027;vec4 v=viewMatrix*vec4(pos,1.);
        float radius=mix(.006,.014,roofWet)*(1.-uv.y*.24);
        float width=max(radius,-v.z*.00064);coverage=radius/width;
        v.x+=uv.x*width;gl_Position=projectionMatrix*v;}`,
    fragmentShader:`uniform float t,roofWet;varying vec2 st;varying float seed,coverage;
      void main(){float fall=sqrt(max(st.y,.0001));
        float supply=smoothstep(.16,.7,roofWet);
        float packet=.5+.5*sin(fall*22.-t*11.+seed+.56*sin(t*3.2+seed));
        float flow=smoothstep(st.y*.73+(1.-supply)*.54,st.y*.73+(1.-supply)*.54+.21,packet);
        float edge=1.-smoothstep(.32,1.,abs(st.x));
        gl_FragColor=vec4(mix(vec3(.36,.48,.53),vec3(.92,.87,.74),edge),coverage*edge*flow*.74*supply);
        #include <colorspace_fragment>
      }`}));
  strands.name='Beads separating from flooded roof corrugations';strands.renderOrder=5;scene.add(strands);
  return (t,rain,drainage,roofWet,shadeWet,load)=>{
    U.rainRoof.value=roofWet;U.rainShade.value=shadeWet;U.rainFlow.value=load;
    drops.visible=drainage>.045;ribbon.visible=load>.007;strands.visible=roofWet>.16;
    for(let i=0;i<16;i++){
      const p=impactOrigins[i];
      // Integrate the decaying discharge analytically. Falling droplets keep
      // their actual acceleration after release, even as new ones grow slower.
      const phase=(t<=7?t:7+68*(1-Math.exp(-(t-7)/68)))*p.rate+p.seed;
      const elapsed=(phase-Math.floor(phase))/(p.rate*Math.max(.042,Math.exp(-Math.max(0,t-7)/68)));
      const k=i*6,airborne=elapsed<p.fall&&drainage>.045;
      const y=airborne?p.top-4.905*elapsed*elapsed:p.top;
      const streak=airborne?Math.min(.105,.008+.13*elapsed):.006*Math.min(1,drainage);
      positions.set([p.x,y,p.z,p.x,y-streak,p.z],k);
      const impact=mat.uniforms.impact.value[i];impact.z=Math.max(0,elapsed-p.fall);impact.w=!airborne&&drainage>.045?1:0;
    }
    g.attributes.position.needsUpdate=true;
  };
}
