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
  const arcus=new T.TextureLoader().load('crater-arcus-front.webp');
  arcus.colorSpace=T.SRGBColorSpace;
  const samples=matchMedia('(pointer: coarse)').matches?6:9;
  const uniforms={calderaTime:clock,calderaSun:{value:sun},calderaCloud:{value:cloud},calderaCells:{value:lobes},calderaPhoto:{value:photo},calderaArcus:{value:arcus}};
  const front=`
    uniform float calderaTime;
    uniform vec3 calderaSun;
    const vec2 frontAxis=vec2(.948683,.316228),frontSide=vec2(-.316228,.948683);
    float frontHead(){return -2590.-calderaTime*17.;}
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
    // Project each sample toward the sun onto the broken cloud base. A
    // tilted, ragged-edged opening throws the same shafts through the moist
    // air and across the relief, lake and suspended eagle.
    const vec2 gapAxis=vec2(.789352,.613941),gapSide=vec2(-.613941,.789352);
    vec2 clearSlot(vec3 p){
      vec2 projected=p.xz+calderaSun.xz*max(0.,2940.-p.y)/calderaSun.y;
      float side=dot(projected,gapSide);
      float center=-3330.-calderaTime*18.+192.*sin(side*.00063)+87.*sin(side*.00183+.71);
      float width=245.+75.*sin(side*.00077+.3)+33.*cos(side*.0029);
      return vec2(dot(projected,gapAxis)-center,width);
    }
    float apertures(vec2 gap){
      float main=1.-smoothstep(gap.y*.28,gap.y*1.14,abs(gap.x));
      float split=1.-smoothstep(26.,104.,abs(gap.x-680.));
      return clamp(main+split*.69,0.,1.);
    }
    float craterShade(vec3 ground){
      vec2 projected=ground.xz+calderaSun.xz*max(0.,2940.-ground.y)/calderaSun.y;
      float k=stormDepth(projected),wide=dot(projected,frontSide);
      return smoothstep(-310.,330.,k)*(1.-smoothstep(4700.,7400.,k))*(.92+.08*rainLoad(wide))*(1.-apertures(clearSlot(ground)));
    }
    float slitIntegral(float x,float width){
      float u=min(1.,abs(x)/width);
      return sign(x)*width*(u-.5*u*u);
    }
    float shaftSample(float a,float b,float width){
      if(abs(a-b)<.5)return max(0.,1.-abs(a)/width);
      return abs((slitIntegral(b,width)-slitIntegral(a,width))/(b-a));
    }
    vec3 craterRays(vec3 color,vec3 ray,float farMetres){
      // Integrating each cross-section of the shaft prevents depth slices
      // and keeps the golden haze in front of the correct ridges.
      float nearAir=0.,farAir=min(farMetres,12500.);
      if(ray.y>.002)farAir=min(farAir,(2920.-cameraPosition.y)/ray.y);
      if(cameraPosition.y>2920.){
        if(ray.y>=-.002)return color;
        nearAir=(2920.-cameraPosition.y)/ray.y;
      }
      if(farAir<=nearAir)return color;
      float lengthRay=farAir-nearAir,through=0.,last=nearAir;
      vec2 prev=clearSlot(cameraPosition+ray*nearAir);
      for(int n=1;n<=3;n++){
        float f=float(n)/3.,d=nearAir+lengthRay*f*f;
        vec2 g=clearSlot(cameraPosition+ray*d);
        float w=.5*(g.y+prev.y);
        float lit=shaftSample(prev.x,g.x,w)+.57*shaftSample(prev.x-680.,g.x-680.,98.);
        through+=lit*(d-last)*exp(-.000094*(last+d)*.5);
        prev=g;last=d;
      }
      float forward=.11+.89*pow(max(0.,dot(ray,calderaSun)),4.);
      float light=1.-exp(-through*.00034*forward);
      return mix(color,vec3(1.09,.670,.293),min(.49,light));
    }
    float dropCover(vec3 p){
      float d=stormDepth(p.xz),side=dot(p.xz,frontSide);
      float broken=.70+.22*cos(side*.0019+.4)+.08*sin(side*.0043);
      float ribbon=smoothstep(-94.,58.,d)*(1.-smoothstep(368.,690.,d));
      float main=smoothstep(930.,1430.,d)*(1.-smoothstep(4600.,5900.,d));
      return max(ribbon*broken,main*rainLoad(side))*(1.-smoothstep(2730.,3060.,p.y));
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
      return mix(color,air,1.-exp(-.458*amount));
    }`;
  function extend(material,fields,where,replacement){
    Object.assign(material.uniforms,uniforms);
    material.fragmentShader=fields+'\n'+material.fragmentShader.replace(where,replacement);
    material.needsUpdate=true;
  }
  scene.userData.calderaCanopy={glsl:front.slice(0,front.indexOf('float slitIntegral')),
    uniforms:{calderaTime:clock,calderaSun:{value:sun}}};
  const skyLight=`
    uniform sampler2D calderaCloud,calderaCells,calderaPhoto,calderaArcus;
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
      // The approaching arcus has a finite angular span. Project its
      // turbulent face relative to the same sun used for the open slot.
      // Away from this bank the rest of the photographic sky remains live.
      float az=atan(heading.z,heading.x)-atan(calderaSun.z,calderaSun.x);
      az=atan(sin(az),cos(az));
      vec2 plate=vec2(.065+az/1.94,.062+asin(clamp(heading.y,-1.,1.))/.81);
      float coverage=smoothstep(.0,.143,plate.x)*(1.-smoothstep(.88,1.,plate.x))*
        (1.-smoothstep(.88,1.08,plate.y))*smoothstep(-.075,.032,ray.y);
      vec3 shelf=texture2D(calderaArcus,clamp(plate,0.,1.)).rgb;
      float coal=smoothstep(2.25,4.3,shelf.r/max(.012,shelf.g))*(1.-smoothstep(.13,.37,plate.y));
      shelf=mix(shelf,vec3(.21,.142,.095)+.17*shelf,.91*coal);
      shelf*=mix(vec3(.96,1.01,1.06),vec3(1.09,.982,.89),glow);
      base=mix(base,shelf,coverage*(.95+.035*cloudDepth));


      return craterRays(craterCurtain(base,ray,95000.),ray,95000.);
    }`;
  const skyLine='gl_FragColor=vec4(texture2D(map,uv).rgb,1.);';
  extend(sky.material,front+skyLight,skyLine,skyLine+`
    /* before local precipitation */
    gl_FragColor.rgb=craterSky(gl_FragColor.rgb,d);`);
  const lightLine='/* canopy transmission */';
  extend(terrain,front,lightLine,`
    float squallShade=craterShade(wp);
    float ribbon=apertures(clearSlot(wp));
    c*=mix(vec3(1.34,1.05,.744),vec3(.292,.396,.565),squallShade);
    c+=c*vec3(.50,.285,.076)*ribbon*(.47+.53*incidence);

    `+lightLine);
  const terrainLine='gl_FragColor=vec4(mix(c,aerialHaze,dep*(.72+.28*skyView)),1.);';
  terrain.fragmentShader=terrain.fragmentShader.replace(terrainLine,terrainLine+`
    /* before local precipitation */
    vec3 craterView=normalize(wp-cameraPosition);
    gl_FragColor.rgb=craterRays(craterCurtain(gl_FragColor.rgb,craterView,d),craterView,d);`);
  if(water){
    const waterLine='gl_FragColor=vec4(radiance,alpha);';
    extend(water.material,front,waterLine,`
      float weatherCover=craterShade(worldPosition.xyz);
      float gap=apertures(clearSlot(worldPosition.xyz));
      float wet=dropCover(worldPosition.xyz);
      float grazing=pow(max(dot(reflect(-calderaSun,n),v),0.),19.);
      float facets=clamp(.57+.34*sin(710.*n.x+174.*n.z)+.22*sin(315.*n.z),.12,1.);
      // The moving footprint appears in reflected roof light and individual
      // rough facets facing the remaining low sun. Rain roughens its surface.
      radiance*=mix(vec3(1.055,1.007,.94),vec3(.430,.548,.736),weatherCover);
      radiance+=vec3(.89,.471,.113)*(gap*(.038+.76*grazing)*(.6+.9*facets));
      radiance=mix(radiance,vec3(.108,.149,.170)*(.65+.65*facets),wet*.20);
      radiance=craterRays(craterCurtain(radiance,-v,viewDistance),-v,viewDistance);
      `+waterLine);
  }
  // Raindrops occupy a moving volume in surveyed local air. Each droplet's
  // seed controls its fall speed and exposure length. Camera translation
  // merely selects the nearby population, preserving parallax at flight speed.
  const count=matchMedia('(pointer: coarse)').matches?650:1450;
  const pos=new Float32Array(count*6),tips=new Float32Array(count*2),sizes=new Float32Array(count*2);
  let seed=390512;
  const random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
  for(let i=0;i<count;i++){
    const x=random()*34,y=random()*21,z=random()*34,r=random();
    for(let end=0;end<2;end++){
      const j=2*i+end;pos[j*3]=x;pos[j*3+1]=y;pos[j*3+2]=z;tips[j]=end;sizes[j]=r;
    }
  }
  const geom=new T.BufferGeometry();
  geom.setAttribute('position',new T.BufferAttribute(pos,3));
  geom.setAttribute('end',new T.BufferAttribute(tips,1));geom.setAttribute('dropSize',new T.BufferAttribute(sizes,1));
  const origin={value:new T.Vector3()},drift={value:new T.Vector2()},wind={value:new T.Vector2()},wetAir={value:0};
  const rain=new T.ShaderMaterial({uniforms:{calderaTime:clock,calderaSun:{value:sun},origin,drift,wind,wetAir},
    transparent:true,depthWrite:false,vertexShader:`
      attribute float end,dropSize;uniform float calderaTime;uniform vec3 origin,calderaSun;
      uniform vec2 drift,wind;varying float visible,glint;
      void main(){
        vec3 span=vec3(34.,21.,34.);float fall=5.4+3.5*dropSize;
        vec3 rel=mod(position+vec3(drift.x,-fall*calderaTime,drift.y)-origin+span*.5,span)-span*.5;
        float d=length(rel);visible=(1.-smoothstep(11.,17.,d))*smoothstep(.62,2.9,d)*(.18+.82*end);
        glint=pow(max(dot(normalize(rel),calderaSun),0.),5.);
        vec3 velocity=vec3(wind.x,-fall,wind.y);
        gl_Position=projectionMatrix*viewMatrix*vec4(origin+rel+end*velocity*(.014+.014*dropSize),1.);
      }`,fragmentShader:`uniform float wetAir;varying float visible,glint;
      void main(){gl_FragColor=vec4(mix(vec3(.41,.53,.65),vec3(1.,.78,.48),glint),wetAir*visible*(.37+.39*glint));
      #include <colorspace_fragment>
      }`});
  const drops=new T.LineSegments(geom,rain);drops.frustumCulled=false;drops.visible=false;drops.name='Caldera squall rain';scene.add(drops);
  let previous=-1;const air={};
  const direct=scene.children.find(o=>o.isDirectionalLight);
  const lit=new T.Color(0xffc483),shadow=new T.Color(0xbec9df),sunPower=direct.intensity;
  const ease=T.MathUtils.smoothstep;
  return (t,player,field)=>{
    const path=Math.max(0,2940-player.y)/sun.y;
    const x=player.x+sun.x*path,z=player.z+sun.z*path,side=-.316228*x+.948683*z;
    const curve=175*Math.sin(side*.00073)+112*Math.sin(side*.00181+.7)+43*Math.sin(side*.0031);
    const depth=T.MathUtils.euclideanModulo(.948683*x+.316228*z-(-2590-t*17)-curve+7000,18000)-7000;
    const sw=-.613941*x+.789352*z;
    const mid=-3330-t*18+192*Math.sin(sw*.00063)+87*Math.sin(sw*.00183+.71);
    const width=245+75*Math.sin(sw*.00077+.3)+33*Math.cos(sw*.0029);
    const gap=.789352*x+.613941*z-mid;
    const slit=Math.min(1,1-ease(Math.abs(gap),width*.28,width*1.14)+.69*(1-ease(Math.abs(gap-680),26,104)));
    const shade=ease(depth,-310,330)*(1-ease(depth,4700,7400))*(1-slit);
    const nearSide=-.316228*player.x+.948683*player.z;
    const bend=175*Math.sin(nearSide*.00073)+112*Math.sin(nearSide*.00181+.7)+43*Math.sin(nearSide*.0031);
    const local=T.MathUtils.euclideanModulo(.948683*player.x+.316228*player.z+2590+t*17-bend+7000,18000)-7000;
    const broken=.70+.22*Math.cos(nearSide*.0019+.4)+.08*Math.sin(nearSide*.0043);
    const ribbon=ease(local,-94,58)*(1-ease(local,368,690));
    const core=ease(local,930,1430)*(1-ease(local,4600,5900));
    const cells=ease(.74*Math.sin(nearSide*.00117+.9)+.48*Math.sin(nearSide*.00273+.4)+.22*Math.sin(nearSide*.00645),-.46,.68);
    wetAir.value=Math.max(ribbon*broken,core*cells)*(1-ease(player.y,2730,3060));
    drops.visible=wetAir.value>.009;
    if(previous<0||t<previous)drift.value.set(0,0);
    if(drops.visible&&field){
      field.sample(player.x,player.y,player.z,t,air);
      wind.value.set(air.windX,air.windZ);drift.value.addScaledVector(wind.value,Math.max(0,t-previous));
      origin.value.set(player.x,player.y,player.z);
    }
    previous=t;
    direct.color.copy(lit).lerp(shadow,shade*.68);
    direct.intensity=sunPower*(1.11-.70*shade);
  };
};
