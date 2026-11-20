// Observer-relative angular optics belong to the sun. Shafts and the shower
// that makes Lac Berté's bow occupy fixed places in the mapped landscape.
window.addAtmosphericOptics=function addAtmosphericOptics(T,scene,w){
  const event={
    alaska:'Parhelion over the Juneau Icefield',swiss:'Broken solar halo above Oeschinensee',
    lofoten:'Parhelia over Reinefjorden',winnipesaukee:'Sun pillar over the Broads',
    dixville:'Crepuscular fan over Table Rock',moosehead:'Lake shafts off Mount Kineo',
    canyon:'Sunlit dust above the Colorado',surry:'Slant light in the valley inversion',
    yosemite:'Anticrepuscular rays over the valley',milford:'Sun shafts in fjord mist',
    labrador:'Supernumerary fringes in the sun shower',crater:'Sheet lightning within the front'
  }[w.region];
  if(!event)return ()=>{};
  const active={value:1},time={value:0},sun=w.sunDirection;
  const uniforms={opticActive:active,opticTime:time,opticSun:{value:sun}};
  w.atmosphericOptics={phenomenon:event,setEnabled(enabled){active.value=enabled?1:0;}};

  // Distance down the valley, bank height, and horizontal/vertical dispersion
  // of the air lit by each opening. The banks are fixed when the world loads.
  const settings={
    // range, range between gaps, major axis, across-sun width, vertical half
    // thickness, optical depth per metre, height above surface, RGB airlight
    canyon:[660,220,1250,133,71,.00135,83,[.91,.654,.443]],
    moosehead:[1050,380,2050,164,96,.00152,98,[1.,.844,.638]],
    dixville:[1420,400,1620,142,88,.00061,86,[1.,.749,.492]],
    surry:[1740,510,2180,220,52,.00155,39,[.972,.732,.774]],
    milford:[1780,490,1680,212,116,.00148,112,[.95,.862,.718]],
    yosemite:[2200,660,2470,254,143,.00118,167,[.958,.822,.707]]
  }[w.region];
  let shaftCode='';
  if(settings){
    const [range,step,length,width,thickness,extinction,rise,color]=settings;
    const launch=w.region==='dixville'?w.launches.dawn:w.spawn,dx=-Math.sin(launch.yaw),dz=-Math.cos(launch.yaw);
    const across=new T.Vector3(-sun.z,0,sun.x).normalize(),up=new T.Vector3().crossVectors(across,sun);
    if(up.y<0)up.negate();
    const centers=[],dimensions=[];
    const shifts=[[-.48,.81,1.00],[-.04,1.08,.47],[.82,1.52,.78],[1.75,2.13,.53]];
    for(let i=0;i<shifts.length;i++){
      const [off,far,gap]=shifts[i];
      const sideways=step*off+(w.region==='moosehead'?range*.57:0);
      const x=launch.x+dx*range*far-dz*sideways,z=launch.z+dz*range*far+dx*sideways;
      const floor=w.height(x,z);
      let y=floor+rise*(1+.2*i);
      // A shaft stops below a crest that cuts off its light. Resolve the
      // solar horizon here, retaining dim skylight in the mountain shadow.
      let shadow=0;
      for(const d of [180,430,830,1630,3180])shadow=Math.max(shadow,(w.elevation||w.height)(x+sun.x*d,z+sun.z*d)-y-sun.y*d);
      y+=Math.min(rise*1.2,shadow*.46);
      centers.push(new T.Vector3(x,y,z));
      dimensions.push(new T.Vector4(1/(length*(1+.13*i)),1/(width*gap),1/(thickness*gap),extinction/(1+Math.max(0,shadow)*.0017)));
    }
    Object.assign(uniforms,{opticCenters:{value:centers},opticShape:{value:dimensions},opticAcross:{value:across},opticUp:{value:up},
      opticLight:{value:new T.Vector3(...color)}});
    shaftCode=`
      uniform vec3 opticCenters[4],opticAcross,opticUp,opticLight;uniform vec4 opticShape[4];
      vec3 opticalAxes(vec3 p){return vec3(dot(p,opticSun),dot(p,opticAcross),dot(p,opticUp));}
      float opticalPath(vec3 ray,float distance){
        if(distance<30.)return 0.;
        float optical=0.;vec3 direction=opticalAxes(ray);
        for(int i=0;i<4;i++){
          vec4 field=opticShape[i];
          // Refraction halos have effectively infinite range. These small
          // shafts, in contrast, are clipped analytically at the first surface.
          vec3 q=opticalAxes(cameraPosition-opticCenters[i]);
          q.y+=18.*sin(opticTime*.013+float(i)*1.7);q*=field.xyz;
          vec3 v=direction*field.xyz;float speed=max(1e-12,dot(v,v));
          float mid=-dot(q,v)/speed;vec3 offset=q+mid*v;
          float edge=1.-dot(offset,offset);if(edge<=0.)continue;
          float halfPath=sqrt(edge/speed),a=max(0.,mid-halfPath)-mid,b=min(distance,mid+halfPath)-mid;
          if(b<=a)continue;
          // Integral of a parabolic density profile across the visible chord.
          float column=(b-a)*(edge-speed*(a*a+a*b+b*b)/3.);
          vec3 p=cameraPosition+ray*(mid+.5*(a+b))-opticCenters[i];
          float cells=.83+.17*sin(dot(p,opticAcross)*.009+dot(p,opticUp)*.016+float(i)*2.+opticTime*.017);
          optical+=field.w*max(0.,column)*cells;
        }
        float forward=max(0.,dot(ray,opticSun));
        return opticActive*(1.-exp(-optical*(.73+.55*forward*forward)));
      }`;
  }
  const names='uniform float opticActive,opticTime;uniform vec3 opticSun;\n';
  const ice=['alaska','swiss','lofoten','winnipesaukee'].includes(w.region);
  const angular=ice||w.region==='dixville'||w.region==='yosemite';
  const angularCode=angular?`
    float opticBell(float x,float w){float d=x/w;return exp(-d*d);}
    vec3 angularOptics(vec3 base,vec3 d){
      float y=asin(clamp(d.y,-1.,1.)),sy=asin(clamp(opticSun.y,-1.,1.));
      float angle=acos(clamp(dot(d,opticSun),-1.,1.));
      vec3 right=normalize(vec3(-opticSun.z,0.,opticSun.x)),up=normalize(cross(right,opticSun));
      float az=atan(dot(d,right),dot(d,normalize(vec3(opticSun.x,0.,opticSun.z))));
      float h=dot(d,up),side=dot(d,right);
      float fade=smoothstep(-.01,.035,d.y);
      float cirrus=.72+.19*sin(az*12.+d.y*9.+.58*sin(d.y*15.)+opticTime*.0018)+.09*sin(az*29.-d.y*25.+.8);
      vec3 scatter=vec3(0.);
      ${w.region==='swiss'?`
        // Randomly oriented hexagonal prisms give a sharp red inner fringe,
        // a wider white shoulder outside it, and incomplete arcs in thin ice.
        float a=degrees(angle);
        float rim=smoothstep(20.9,22.5,a)*exp(-max(0.,a-22.5)*.36);
        float iceBand=smoothstep(.53,.91,cirrus);
        scatter+=(vec3(.26,.235,.198)*rim+vec3(.146,.040,.012)*opticBell(a-21.85,.56)
                 +vec3(.036,.060,.103)*opticBell(a-23.7,1.75))*(.29+.9*iceBand);
        base*=1.-.052*(1.-smoothstep(18.5,22.,a))*iceBand*opticActive;
      `:''}
      ${w.region==='alaska'||w.region==='lofoten'?`
        // Horizontally oriented plates put two parhelia at the sun's height.
        // The minimum horizontal deviation increases with solar elevation.
        float spread=acos(clamp((cos(radians(22.))-sin(sy)*sin(sy))/(cos(sy)*cos(sy)),-1.,1.));
        float offset=degrees(abs(az)-spread),rise=degrees(y-sy);
        float level=opticBell(rise,${w.region==='alaska'?'2.25':'1.7'});
        float apricot=opticBell(offset+.55,1.28),ivory=opticBell(offset-1.40,2.12),blue=opticBell(offset-3.48,2.85);
        float tail=exp(-max(0.,offset)*.112)*smoothstep(-.4,3.,offset);
        scatter+=(vec3(.54,.129,.025)*apricot+vec3(.47,.435,.235)*ivory+vec3(.06,.16,.295)*blue)*level*cirrus;
        scatter+=vec3(.25,.238,.206)*tail*opticBell(rise,.74)*cirrus;
        ${w.region==='lofoten'?`scatter+=vec3(.122,.118,.113)*opticBell(rise,.43)*smoothstep(.12,.38,abs(az))*exp(-abs(az)*.9)*cirrus;`:''}
      `:''}
      ${w.region==='winnipesaukee'?`
        // Specular reflections off slightly tilted horizontal crystal plates
        // make a tapering vertical shaft above a low sun, not a second sun.
        float rise=degrees(y-sy),width=mix(.96,.46,smoothstep(0.,10.,rise));
        float core=opticBell(degrees(az),width)*exp(-max(.0,rise)*.164);
        float outer=opticBell(degrees(az),width*2.9)*exp(-max(0.,rise)*.23);
        float pillar=(.58*core+.21*outer)*smoothstep(-2.9,.20,rise)*(1.-smoothstep(7.,14.,rise));
        scatter+=vec3(.97,.695,.375)*pillar*(.80+.2*cos(rise*1.2+az*7.));
      `:''}
      ${w.region==='dixville'||w.region==='yosemite'?`
        float anti=${w.region==='yosemite'?'1.':'0.'};
        // Perspective projects parallel columns into a fan converging either
        // on the sun or the antisolar point, just below the eastern horizon.
        float along=mix(dot(d,opticSun),dot(d,-opticSun),anti);
        float phi=atan(mix(side,-side,anti),h);
        float plume=.21*sin(17.*h-8.1*side+opticTime*.0035)+.11*cos(27.*side+14.*h)+.68;
        float fan=.76*opticBell(phi+.80,.255)+.54*opticBell(phi-.14,.165)+.61*opticBell(phi-.72,.28)+.20*opticBell(phi+1.24,.13);
        float separation=acos(clamp(along,-1.,1.));
        float extent=smoothstep(.026,.17,separation)*(1.-smoothstep(.24,1.06,separation));
        float cloudBreaks=mix(.70,1.,plume)*mix(.66,1.,smoothstep(.30,.78,dot(base,vec3(.24,.57,.19))));
        vec3 rayLight=mix(vec3(.34,.216,.132),vec3(.198,.164,.150),anti);
        scatter+=rayLight*fan*extent*cloudBreaks*(.70+.30*cirrus)*smoothstep(.4,.86,along);
      `:''}
      // All angles were evaluated on the celestial sphere, so the effect
      // follows a head turn and also falls at the correct place in the mirror.
      return base+scatter*min(vec3(1.),max(vec3(.31),1.-.66*base))*fade*opticActive;
    }`:'';
  function appendMain(source,addition){
    const start=source.search(/void\s+main\s*\(/),open=source.indexOf('{',start);
    let end=open+1,level=1;
    for(;level&&end<source.length;end++){if(source[end]==='{')level++;else if(source[end]==='}')level--;}
    return source.slice(0,end-1)+'\n'+addition+'\n'+source.slice(end-1);
  }
  // Use the existing cloud-to-ground geometry at Berté and the surveyed storm
  // deck at Crater; effects outside the actual droplet/cloud field vanish.
  function precipitation(s){
    if(w.region==='labrador')return s.replace('base+=vec3(.028,.031,.032)*inner*moisture;',`
      base+=vec3(.028,.031,.032)*inner*moisture;
      float fineDrops=smoothstep(.15,.61,ray.y)*(.47+.53*strip)*moisture*opticActive;
      vec3 fringe=(vec3(radius)-vec3(39.58,39.14,38.95))/vec3(.24,.23,.28);
      vec3 fringe2=(vec3(radius)-vec3(38.51,38.13,37.96))/vec3(.25,.25,.28);
      base+=(vec3(.162,.184,.207)*exp(-fringe*fringe)+vec3(.082,.103,.112)*exp(-fringe2*fringe2))*fineDrops;`);
    if(w.region==='crater')return s.replace('base=mix(base,shelf,coverage*(.95+.035*cloudDepth));',`
      base=mix(base,shelf,coverage*(.95+.035*cloudDepth));
      // A single diffused discharge in the distant shelf. Select a different
      // pocket on each passage; thicker cloud hides its hottest interior.
      float cycle=floor((opticTime+51.3)/64.);
      float age=mod(opticTime+51.3,64.)-57.0;
      float field=smoothstep(-.32,-.08,age)*(1.-smoothstep(-.08,.58,age));
      vec2 electric=vec2(.49+.14*sin(2.04*cycle+.32),.36+.07*cos(cycle*4.31));
      vec2 q=(plate-electric)/vec2(.155,.196);
      float pocket=exp(-dot(q,q)*1.75);
      base+=opticActive*field*pocket*coverage*(.19+.74*clamp(shelf.r+shelf.b,0.,1.))*vec3(.65,.62,.84);`);
    return s;
  }
  const seen=new Set();
  scene.traverse(object=>{
    if(!object.isMesh)return;
    const sky=object.renderOrder===-1000;
    for(const m of Array.isArray(object.material)?object.material:[object.material]){
      if(!m||seen.has(m)||m.isShadowMaterial)continue;
      if(!sky&&!settings&&!(w.region==='labrador'&&m.fragmentShader?.includes('berteScatter(')))continue;
      if(!sky&&(m.transparent&&!m.depthWrite&&!object.isWater))continue;
      seen.add(m);
      const prior=m.onBeforeCompile,key=m.customProgramCacheKey();
      m.onBeforeCompile=function(shader,renderer){
        prior.call(this,shader,renderer);
        Object.assign(shader.uniforms,uniforms);
        if(sky||w.region==='labrador')shader.fragmentShader=names+precipitation(shader.fragmentShader);
        if(sky){
          let result='';
          if(angular)result+='gl_FragColor.rgb=angularOptics(gl_FragColor.rgb,normalize(ray));';
          if(settings)result+='gl_FragColor.rgb=mix(gl_FragColor.rgb,opticLight,opticalPath(normalize(ray),65000.));';
          shader.fragmentShader=shader.fragmentShader.replace(names,names+angularCode+shaftCode+'\n');
          if(result)shader.fragmentShader=appendMain(shader.fragmentShader,result);
        }else if(settings){
          // The moving-cloud shader has reconstructed world coordinates after
          // skinning/instancing. Reuse them so foliage, rock and water agree.
          const perWater=object.isWater,point='cloudWorld',v='varying float opticVeil;\n';
          if(perWater){
            if(!shader.fragmentShader.includes('varying vec3 cloudWorld;'))return;
            shader.fragmentShader=names+shaftCode+'\n'+appendMain(shader.fragmentShader,`
              vec3 airDelta=${point}-cameraPosition;
              gl_FragColor.rgb=mix(gl_FragColor.rgb,opticLight,opticalPath(normalize(airDelta),length(airDelta)));`);
          }else{
            if(!shader.vertexShader.includes('vec3 cloudWorld=cameraPosition'))return;
            shader.vertexShader=names+shaftCode+'\n'+v+appendMain(shader.vertexShader,`
              vec3 airDelta=${point}-cameraPosition;
              opticVeil=opticalPath(normalize(airDelta),length(airDelta));`);
            shader.fragmentShader='uniform vec3 opticLight;\n'+v+appendMain(shader.fragmentShader,'gl_FragColor.rgb=mix(gl_FragColor.rgb,opticLight,opticVeil);');
          }
        }
      };
      m.customProgramCacheKey=()=>key+':optics-'+w.region;
      m.needsUpdate=true;
    }
  });
  return (player,elapsed)=>{time.value=elapsed;};
};
