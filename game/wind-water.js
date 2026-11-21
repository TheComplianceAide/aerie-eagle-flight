// Gusts wrinkle short waves and break up the sky reflection as a front crosses the water.
window.addReadableWindWater=function(T,scene,world){
  const field=world.windField;
  if(!field)return;
  const flow=window.getCanopyWind(T,scene),clock={value:0};
  const uniforms={
    ...flow.uniforms, windFrontClock:clock, windFrontGain:{value:field.frontGain},
    windFrontOrigin:{value:new T.Vector2(field.origin.x,field.origin.z)},
    windFrontDirection:{value:new T.Vector2(field.direction.x,field.direction.z)},
    windFrontPhase:{value:field.phase},
    windFrontAdvection:{value:field.advection}
  };
  const optics=`
    uniform vec2 windFrontDirection,windFrontOrigin;
    uniform float windFrontClock,windFrontPhase,windFrontAdvection,windFrontGain;
    ${window.aerieGustGLSL}
    ${flow.flowGLSL}
    float windOnWater(vec2 p){
      float range=length(cameraPosition.xz-p),near=weatherWindow(p);
      vec2 pressure=localFront(p);
      float loading;
      if(near>.999)loading=pressure.x;
      else{
        float outer=windFrontGain*aerieGust(p-windFrontOrigin,windFrontClock,windFrontDirection,windFrontPhase,windFrontAdvection);
        loading=mix(min(1.,outer),pressure.x,near);
      }
      // Ripples steepen just behind the advancing air. The residual wake
      // persists after a gust releases the vegetation on the bank.
      float wake=mix(loading,pressure.y,near);
      return (1.-smoothstep(360.,1260.,range))*clamp(.80*loading+.20*wake+.42*(loading-wake),0.,1.);
    }
    vec2 catspawSlope(vec2 p,float px,float front){
      vec2 down=windFrontDirection,across=vec2(-down.y,down.x);
      float x=dot(p,down),z=dot(p,across),t=windFrontClock;
      // The short crests run across the breeze. They have a different phase
      // speed from the moving air that raises them, and fade below pixel size.
      float warp=1.3*sin(z*.19+windFrontPhase)+.6*sin(z*.57+x*.09);
      float longWave=cos(x*4.7+z*.32+warp-t*2.77)*(1.-smoothstep(.16,.68,px));
      float shortWave=cos(x*13.4-z*1.31-warp-t*5.61)*(1.-smoothstep(.055,.23,px));
      // Narrow cat's paws blossom in wavelets along the leading edge.
      // Vary the group envelope without moving the larger wave pattern.
      float groups=.52+.48*sin(x*.34+z*.59-t*1.03+warp)*sin(z*.17-x*.116+t*.51);
      return front*(.73+.64*groups)*(down*(.115*longWave+.056*shortWave)+across*.031*shortWave);
    }`;
  const seen=new Set();
  scene.traverse(mesh=>{
    const m=mesh.material;
    if(!m?.fragmentShader || seen.has(m))return;
    seen.add(m);
    let shader=m.fragmentShader;
    if(mesh.isWater && m.uniforms.shoreField){
      // Atlas lakes, fjords, and open coasts. Keep nearby submerged gravel visible.
      shader=shader.replace('vec3 n=normalize(vec3(slope.x,1.,slope.y));',`
        float front=windOnWater(p)*mix(.76,1.,fetch)*${world.region==='surry'?'.18':'1.'};
        slope=slope*(mix(.50,1.,localExposure(p))+.73*front)+catspawSlope(p,footprint,front);
        vec3 n=normalize(vec3(slope.x,1.,slope.y));`)
        .replace('float rough=.045+.045*fetch*seaState;', 'float rough=.045+.045*fetch*seaState+.033*front;')
        .replace('float line=sin(bank',`
          radiance*=1.-front*(.26+.23*smoothstep(1.,24.,bank));
          float line=sin(bank`);
    }else if(mesh.isWater){
      // The Swiss and Alaskan lakes have a separate refraction and reflection shader.
      shader=shader.replace('vec3 surfaceNormal=normalize',`
        float front=windOnWater(worldPosition.xz);
        slope=slope*(mix(.55,1.,localExposure(worldPosition.xz))+.70*front)+catspawSlope(worldPosition.xz,pixel,front);
        vec3 surfaceNormal=normalize`)
        .replace('float rough=.057+.023*wind;', 'float rough=.057+.023*wind+.033*front;')
        .replace('vec3 outgoingLight=mix(scattered,reflectionSample,reflectance)',
                 'vec3 outgoingLight=(1.-.43*front)*mix(scattered,reflectionSample,reflectance)');
    }else if(world.region==='canyon' && m.uniforms.bankRadiance && m.uniforms.photo){
      // Colorado River water shares survey tiles with the dry canyon walls.
      shader=shader.replace('vec3 refl=reflect(-eye,wn);',`
        float front=windOnWater(here);
        vec2 roughWater=catspawSlope(here,max(length(dFdx(here)),length(dFdy(here))),front);
        wn=normalize(vec3(wn.xz*(1.+.45*front)+roughWater,wn.y).xzy);
        vec3 refl=reflect(-eye,wn);`)
        .replace('color=mix(color,river,wet);','color=mix(color,river*(1.-.39*front),wet);');
    }else if(mesh.name==='Ashuelot River below Surry Dam'){
      shader=shader.replace('vec3 N=normalize(vec3(slope.x,1.,slope.y));',`
        float front=windOnWater(wp.xz);
        slope+=catspawSlope(wp.xz,max(length(dFdx(wp.xz)),length(dFdy(wp.xz))),front*channelSpeed*.61);
        vec3 N=normalize(vec3(slope.x,1.,slope.y));`);
    }else if(mesh.name==='Mapped stream channels'){
      shader=shader.replace('vec3 n=normalize(vec3(-slope.x',`
        float front=windOnWater(wp.xz);
        slope+=catspawSlope(wp.xz,px,.65*front);
        vec3 n=normalize(vec3(-slope.x`)
        .replace('vec4(mix(c,vec3(.65,.70,.65)', 'vec4(mix(c*(1.-.27*front),vec3(.65,.70,.65)');
    }else return;
    if(mesh.isWater){
      // Let trains pass through one another in finite groups. Long, evenly
      // spaced crests otherwise turn the lake into a ruled surface when banked.
      shader=shader.replace('float bend=.48*sin(dot(p,vec2(.009,.015))-.07*t);',`
        vec2 station=p;
        p+=vec2(2.4*sin(station.y*.044+station.x*.012-t*.11)+1.4*sin(station.x*.022-station.y*.071+t*.09),
                2.1*sin(station.x*.052-station.y*.016+t*.13));
        float group=.5+.5*sin(station.y*.059-station.x*.027+t*.12)*sin(dot(station,vec2(.018,.035))-.08*t);
        energy*=.39+.54*group;
        float bend=1.03*sin(dot(p,vec2(.009,.015))-.07*t);`);
    }
    m.fragmentShader=optics+'\n'+shader;
    Object.assign(m.uniforms,uniforms);
    m.needsUpdate=true;
  });
  // Each lake advances its wave clock at a regional rate. Air and its moving
  // surface footprint both use the absolute flight clock, including while perched.
  const update=world.update.bind(world);
  world.update=(dt,t,player)=>{clock.value=t;flow.update(field,player,t);world.waterfalls?.update(field,t,player);update(dt,t,player);};
};
