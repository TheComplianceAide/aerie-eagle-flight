// A squall crossing the caldera. A clear slot toward the low western sun
// remains visible below the bank. The pass, its shadow and the rain shafts
// occupy survey space and are seen from the same geometry in the lake mirror.
window.addCraterWeather=function addCraterWeather(T,scene,{sun,clock,sky,terrain,water}){
  const cloud=new T.TextureLoader().load('labrador-cloud-cover.webp');
  cloud.wrapS=cloud.wrapT=T.MirroredRepeatWrapping;
  const lobes=new T.TextureLoader().load('cloud-field.png');
  lobes.wrapS=lobes.wrapT=T.RepeatWrapping;
  const photo=new T.TextureLoader().load('crater-squall-clouds.webp');
  photo.colorSpace=T.SRGBColorSpace;photo.wrapS=T.RepeatWrapping;
  const samples=matchMedia('(pointer: coarse)').matches?6:9;
  const uniforms={calderaTime:clock,calderaSun:{value:sun},calderaCloud:{value:cloud},calderaCells:{value:lobes},calderaPhoto:{value:photo}};
  const front=`
    uniform float calderaTime;
    uniform vec3 calderaSun;
    const vec2 frontAxis=vec2(.948683,.316228),frontSide=vec2(-.316228,.948683);
    float frontHead(){return 1100.-calderaTime*17.;}
    float edgeCurve(float side){
      return 175.*sin(side*.00073)+112.*sin(side*.00181+.7)+43.*sin(side*.0031);
    }
    // Positive distance is inside the bank. Successive showers are
    // separated by 18 km, with several kilometres of clear air between.
    float stormDepth(vec2 pos){
      float raw=dot(pos,frontAxis)-frontHead()-edgeCurve(dot(pos,frontSide));
      return mod(raw+7000.,18000.)-7000.;
    }
    float rainLoad(float side){
      return smoothstep(-.46,.68,.74*sin(side*.00117+.9)+.48*sin(side*.00273+.4)+.22*sin(side*.00645));
    }
    float craterShade(vec3 ground){
      vec2 projected=ground.xz+calderaSun.xz*max(0.,2940.-ground.y)/calderaSun.y;
      float k=stormDepth(projected),wide=dot(projected,frontSide);
      return smoothstep(-460.,630.,k)*(1.-smoothstep(4700.,7400.,k))*(.77+.23*rainLoad(wide));
    }
    float curtainHit(vec3 ray){
      float axisRay=dot(ray.xz,frontAxis);
      // Each curtain falls just behind the leading cloud. Use a predictor
      // then sample the displaced edge at the intersected along-front point.
      if(abs(axisRay)<.024)return -1.;
      float d=(450.-stormDepth(cameraPosition.xz))/axisRay;
      if(d<0.)d+=18000./abs(axisRay);
      float side=dot(cameraPosition.xz,frontSide);
      return d+(edgeCurve(side+d*dot(ray.xz,frontSide))-edgeCurve(side))/axisRay;
    }
    vec3 craterCurtain(vec3 color,vec3 ray,float farMetres){
      float hit=curtainHit(ray);
      if(hit<0.||hit>min(28000.,farMetres+320.))return color;
      float axisRay=dot(ray.xz,frontAxis),amount=0.;
      // Rain leaves several separate parts of the cloud base. Accumulate
      // soft veils at different distances, with increasing downwind drift
      // and evaporation as the drops fall toward the warmer basin floor.
      for(int layer=0;layer<3;layer++){
        float k=float(layer),range=hit+(280.+310.*k)/axisRay;
        if(range<0.||range>farMetres+320.)continue;
        vec3 p=cameraPosition+ray*range;
        float h=clamp((p.y-1881.)/1180.,0.,1.45);
        float fall=1.-min(1.,h),side=dot(p.xz,frontSide)+fall*(263.+142.*k)+64.*sin(1.6*h+k);
        float cells=rainLoad(side+410.*k);
        float rag=.5+.5*sin(.0051*side+1.4*h+.9*sin(.0013*side-1.8*h+k));
        float throat=smoothstep(.23,.79,cells-.20*fall+.12*rag);
        float taper=(.55+.45*h)*(1.-smoothstep(.79,1.28,h));
        float farFade=1.-smoothstep(7200.,26700.,range);
        amount+=throat*taper*(.62+.38*rag)*farFade*(1.-smoothstep(farMetres-310.,farMetres+320.,range));
      }
      vec3 air=mix(vec3(.139,.155,.190),vec3(.330,.217,.183),pow(max(dot(ray,calderaSun),0.),4.));
      return mix(color,air,1.-exp(-.221*amount));
    }`;
  function extend(material,fields,where,replacement){
    Object.assign(material.uniforms,uniforms);
    material.fragmentShader=fields+'\n'+material.fragmentShader.replace(where,replacement);
    material.needsUpdate=true;
  }
  const skyLight=`
    uniform sampler2D calderaCloud,calderaCells,calderaPhoto;
    vec3 craterSky(vec3 base,vec3 ray){
      float cosSun=max(0.,dot(ray,calderaSun));
      float glow=pow(cosSun,8.)*exp(-3.4*abs(ray.y-.093));
      // Recover the amber direct light and red scattering along the
      // horizon without erasing the photographic blue between the clouds.
      float horizon=exp(-2.9*abs(ray.y-.085));
      vec3 warm=base*vec3(1.21,.817,.535)+vec3(.105,.027,.006);
      base=mix(base,warm,horizon*(.26+.68*pow(cosSun,3.)));
      base+=vec3(.22,.083,.009)*glow;
      // Integrate through the bank instead of painting a front-facing
      // sheet. Viewed across its leading edge, successive billows overlap.
      float dy=ray.y;
      if(abs(dy)<.003)dy=dy<0.?-.003:.003;
      float baseHit=(2620.-cameraPosition.y)/dy,topHit=(6320.-cameraPosition.y)/dy;
      float enter=max(0.,min(baseHit,topHit)),leave=min(23500.,max(baseHit,topHit));
      // Restrict sample spacing to the part of the layer the ray can reach.
      // This removes the parallel slices otherwise visible at grazing angles.
      float crossing=dot(ray.xz,frontAxis);
      if(abs(crossing)>.04){
        float relative=stormDepth(cameraPosition.xz);
        float lead=(-relative-1400.)/crossing,trail=(8000.-relative)/crossing;
        if(max(lead,trail)<enter){lead+=18000./abs(crossing);trail+=18000./abs(crossing);}
        enter=max(enter,min(lead,trail));leave=min(leave,max(lead,trail));
      }
      float clear=1.;vec3 light=vec3(0.);
      if(leave>enter){
        float lengthStep=(leave-enter)/${samples}.;
        for(int i=0;i<${samples};i++){
          float travel=enter+(float(i)+.44)*lengthStep;
          vec3 p=cameraPosition+ray*travel;
          float side=dot(p.xz,frontSide),depth=stormDepth(p.xz);
          if(depth<-850.||depth>7700.)continue;
          vec2 xy=vec2(side,depth),turb=vec2(.000118,-.000081)*(p.y-2850.);
          float cell=texture2D(calderaCells,xy*.000245+turb+vec2(.271,.733)).r;
          vec2 detailUv=mat2(.82,-.57,.57,.82)*xy*.00072+turb*2.21;
          float grain=texture2D(calderaCloud,detailUv+vec2(.09,.35)).r;
          float body=.72*cell+.28*grain;
          float floorY=2900.+168.*sin(side*.00087)+107.*sin(side*.00213+.5)-365.*(body-.48)+95.*sin(depth*.00171+.5);
          float crown=4350.+1190.*cell+430.*sin(side*.00056+.26)+255.*grain;
          float tongue=915.*(cell-.5)+390.*(grain-.52)+133.*sin(side*.00247);
          float rim=depth+tongue;
          float thick=smoothstep(-290.,620.,rim)*(1.-smoothstep(5250.,7450.,depth));
          float low=smoothstep(floorY-144.,floorY+225.,p.y);
          float high=1.-smoothstep(crown-315.,crown+98.,p.y);
          float farFade=1.-.84*smoothstep(6500.,22500.,travel);
          float fill=thick*low*high*mix(.34,1.22,smoothstep(.21,.80,body))*farFade;
          float amount=1.-exp(-lengthStep*.00093*fill);
          float edgeLight=1.-smoothstep(80.,1050.,rim);
          float topLight=smoothstep(crown-950.,crown,p.y);
          float lit=clamp(.19+.35*grain+.35*edgeLight+.32*topLight-.22*cell,0.,1.);
          vec3 shadow=vec3(.044,.052,.080);
          vec3 amber=mix(vec3(.294,.249,.259),vec3(.716,.360,.165),.17+.75*pow(cosSun,2.4));
          vec3 cloudLight=mix(shadow,amber,lit);
          cloudLight+=vec3(.110,.052,.026)*edgeLight*body;
          // Distant billows lose contrast in the same warm haze as the
          // rim, keeping the distant end of the front from cutting the sun.
          cloudLight=mix(cloudLight,base, .49*smoothstep(5100.,17200.,travel));
          light+=clear*amount*cloudLight;
          clear*=1.-amount;
          if(clear<.023)break;
        }
      }
      // Resolve the turbulent cloud faces with a photographed storm sky.
      // The depth integral both reveals and extinguishes the photographic
      // lobes. Finite distance makes their perspective drift past the rim.
      float sweep=sin(calderaTime*17./18000.*6.28318)*.21;
      vec2 shift=clamp((cameraPosition.xz-vec2(-3410.,1770.))/16500.,-.44,.44)+frontAxis*sweep;
      vec3 heading=normalize(vec3(ray.x+shift.x,ray.y,ray.z+shift.y));
      float u=.414-atan(heading.z,heading.x)*.15915494;
      float v=clamp((asin(clamp(heading.y,-1.,1.))+.095)/1.666,0.,1.);
      vec3 photographed=texture2D(calderaPhoto,vec2(u,v)).rgb;
      float lit=.17+.83*pow(cosSun,2.7);
      photographed*=mix(vec3(.69,.67,.79),vec3(1.29,.88,.60),lit);
      photographed+=vec3(.034,.014,.006)*lit;
      float cloudDepth=1.-clear;
      float sector=smoothstep(.08,.82,crossing+.24*clamp(stormDepth(cameraPosition.xz)/3500.,-.9,1.));
      float high=smoothstep(-.025,.160,ray.y);
      float reach=mix(.43,.96,high)*sector;
      float amount=max(cloudDepth*.88,reach);
      vec3 resolved=mix(photographed,light/max(.001,cloudDepth),cloudDepth*.11);
      base=mix(base,resolved,amount);

      return craterCurtain(base,ray,95000.);
    }`;
  const skyLine='gl_FragColor=vec4(texture2D(map,uv).rgb,1.);';
  extend(sky.material,front+skyLight,skyLine,skyLine+`
    /* before local precipitation */
    gl_FragColor.rgb=craterSky(gl_FragColor.rgb,d);`);
  const lightLine='/* canopy transmission */';
  extend(terrain,front,lightLine,`
    float squallShade=craterShade(wp);
    c*=mix(vec3(1.19,.971,.784),vec3(.657,.672,.752),squallShade);
    `+lightLine);
  const terrainLine='gl_FragColor=vec4(mix(c,aerialHaze,dep*(.72+.28*skyView)),1.);';
  terrain.fragmentShader=terrain.fragmentShader.replace(terrainLine,terrainLine+`
    /* before local precipitation */
    gl_FragColor.rgb=craterCurtain(gl_FragColor.rgb,normalize(wp-cameraPosition),d);`);
  if(water){
    const waterLine='gl_FragColor=vec4(radiance,alpha);';
    extend(water.material,front,waterLine,`
      float weatherCover=craterShade(worldPosition.xyz);
      radiance*=mix(vec3(1.025,.997,.965),vec3(.783,.814,.875),weatherCover);
      radiance=craterCurtain(radiance,-v,viewDistance);
      `+waterLine);
  }
  const direct=scene.children.find(o=>o.isDirectionalLight);
  const lit=new T.Color(0xffc483),shadow=new T.Color(0xbec9df),sunPower=direct.intensity;
  const ease=T.MathUtils.smoothstep;
  return (t,player)=>{
    const path=Math.max(0,2940-player.y)/sun.y;
    const x=player.x+sun.x*path,z=player.z+sun.z*path,side=-.316228*x+.948683*z;
    const curve=175*Math.sin(side*.00073)+112*Math.sin(side*.00181+.7)+43*Math.sin(side*.0031);
    const depth=T.MathUtils.euclideanModulo(.948683*x+.316228*z-(1100-t*17)-curve+7000,18000)-7000;
    const shade=ease(depth,-460,630)*(1-ease(depth,4700,7400));
    direct.color.copy(lit).lerp(shadow,shade*.68);
    direct.intensity=sunPower*(1.05-.48*shade);
  };
};
