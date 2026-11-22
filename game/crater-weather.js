// Signed distance inside the moving squall, shared by rain and thunder.
function calderaStormDepth(x,z,t){
  const side=-.316228*x+.948683*z;
  const bend=175*Math.sin(side*.00073)+112*Math.sin(side*.00181+.7)+43*Math.sin(side*.0031);
  const raw=.948683*x+.316228*z+2590+t*17-bend+7000;
  return raw-18000*Math.floor(raw/18000)-7000;
}
window.aerieCalderaStormDepth=calderaStormDepth;
// Rain below the actual broken squall, including the gaps between its shafts.
window.aerieCalderaRain=function(x,y,z,t){
  const ease=(x,a,b)=>{const u=Math.max(0,Math.min(1,(x-a)/(b-a)));return u*u*(3-2*u);};
  const nearSide=-.316228*x+.948683*z;
  const local=calderaStormDepth(x,z,t);
  const broken=.70+.22*Math.cos(nearSide*.0019+.4)+.08*Math.sin(nearSide*.0043);
  const ribbon=ease(local,-94,58)*(1-ease(local,368,690));
  const core=ease(local,930,1430)*(1-ease(local,4600,5900));
  const cells=ease(.74*Math.sin(nearSide*.00117+.9)+.48*Math.sin(nearSide*.00273+.4)+.22*Math.sin(nearSide*.00645),-.46,.68);
  return Math.max(ribbon*broken,core*cells)*(1-ease(y,2730,3060));
};
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
  const uniforms={calderaTime:clock,calderaSun:{value:sun},calderaCloud:{value:cloud},calderaCells:{value:lobes},calderaPhoto:{value:photo},calderaArcus:{value:arcus}};
  const surfaceFlow=window.getCanopyWind(T,scene);
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
    float rainAtDepth(vec3 p,float d,float side){
      float broken=.70+.22*cos(side*.0019+.4)+.08*sin(side*.0043);
      float ribbon=smoothstep(-94.,58.,d)*(1.-smoothstep(368.,690.,d));
      float main=smoothstep(930.,1430.,d)*(1.-smoothstep(4600.,5900.,d));
      return max(ribbon*broken,main*rainLoad(side))*(1.-smoothstep(2730.,3060.,p.y));
    }
    float dropCover(vec3 p){return rainAtDepth(p,stormDepth(p.xz),dot(p.xz,frontSide));}
    vec3 craterCurtain(vec3 color,vec3 ray,float farMetres){
      // Integrate a finite, sheared precipitation volume. A ray which grazes
      // a shower now sees successively shorter wisps, rather than abruptly
      // entering an upright plane at the cloud edge.
      float nearAir=0.,farAir=min(farMetres,17600.);
      if(ray.y>.0001){
        nearAir=max(nearAir,(1770.-cameraPosition.y)/ray.y);
        farAir=min(farAir,(3460.-cameraPosition.y)/ray.y);
      }else if(ray.y<-.0001){
        nearAir=max(nearAir,(3460.-cameraPosition.y)/ray.y);
        farAir=min(farAir,(1770.-cameraPosition.y)/ray.y);
      }else if(cameraPosition.y<1770.||cameraPosition.y>3460.)return color;
      if(farAir<=nearAir)return color;
      float amount=0.,last=nearAir;
      for(int layer=1;layer<=10;layer++){
        float f=float(layer)*.1;
        float next=nearAir+(farAir-nearAir)*f*(.56+.44*f);
        vec3 p=cameraPosition+ray*(.5*(last+next));
        float above=clamp((p.y-1881.)/1320.,-.12,1.24);
        float fall=1.-above;
        vec2 rainOrigin=p.xz-frontAxis*(160.*fall+80.*fall*fall)-frontSide*225.*fall;
        float depth=stormDepth(rainOrigin);
        float side=dot(rainOrigin,frontSide);
        float broad=.54+.22*sin(side*.00110+1.25*fall)+.15*cos(side*.00192-.64*fall);
        float curls=.11*sin(.00337*side+.0011*depth+2.1*fall+.90*sin(side*.00153))+
                    .06*sin(side*.00655+3.0*fall);
        float load=smoothstep(.28,.78,broad+curls);
        float head=.05+.95*smoothstep(-700.,1090.,depth)*(1.-smoothstep(4100.,6960.,depth));
        float localBase=2875.+155.*sin(.00091*side)+72.*sin(.00223*side+.00033*depth);
        float evaporation=mix(1780.,2420.,1.-load)+126.*sin(.00171*side+.00045*depth);
        float column=smoothstep(evaporation-170.,evaporation+290.,p.y)*
                     (1.-smoothstep(localBase-275.,localBase+335.,p.y));
        amount+=head*load*column*(next-last)*exp(-.000084*(last+next)*.5);
        last=next;
      }
      float sunward=pow(max(dot(ray,calderaSun),0.),5.);
      vec3 air=mix(vec3(.150,.173,.200),vec3(.41,.281,.202),sunward);
      return mix(color,air,1.-exp(-.000175*amount));
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
      // A ray intersects the continuous, elongated section of each bank.
      // Its optical distance goes to zero at the silhouette. There are no
      // fixed raymarch layers to appear as vertical stripes near the sun.
      float crossing=dot(ray.xz,frontAxis);
      float depthAtEye=stormDepth(cameraPosition.xz);
      float clear=1.;vec3 light=vec3(0.);
      for(int i=-1;i<=1;i++){
        float start=depthAtEye+float(i)*18000.;
        vec2 scale=vec2(4530.,1190.);
        vec2 dir=vec2(crossing,ray.y)/scale;
        float speed=max(dot(dir,dir),1e-12);
        vec2 origin=vec2(start-3020.,cameraPosition.y-4030.)/scale;
        float closest=clamp(-dot(origin,dir)/speed,0.,26500.);
        vec3 probe=cameraPosition+closest*ray;
        float side=dot(probe.xz,frontSide);
        float centreHeight=4030.+210.*sin(side*.00068)+127.*sin(side*.00173+.3);
        float bend=edgeCurve(side)-edgeCurve(dot(cameraPosition.xz,frontSide));
        origin=vec2(start-3020.-bend,cameraPosition.y-centreHeight)/scale;
        float centre=-dot(origin,dir)/speed;
        vec2 offset=origin+centre*dir;
        float inside=1.-dot(offset,offset);
        float reach=sqrt(max(0.,inside)/speed);
        float enter=max(0.,centre-reach),leave=min(26500.,centre+reach);
        float distanceIn=max(0.,leave-enter);
        vec3 mid=cameraPosition+ray*.5*(enter+leave);
        vec2 field=vec2(dot(mid.xz,frontSide),dot(mid.xz,frontAxis))*.00031;
        float cumulus=texture2D(calderaCells,field).r;
        float wisps=texture2D(calderaCloud,field*2.36+vec2(.13,.21)).r;
        float load=(.42+.50*cumulus+.23*wisps)*(1.-smoothstep(14000.,26500.,max(0.,enter)));
        float amount=(1.-exp(-distanceIn*.00052*load))*smoothstep(0.,.48,inside);
        vec3 under=mix(vec3(.068,.074,.108),vec3(.31,.236,.210),.35*cumulus+.37*pow(cosSun,3.));
        light+=clear*amount*under;
        clear*=1.-amount;
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
      // The photographed front supplies the sky-visible boundary. Thin wisps
      // toward the sunny side must fade over angle as well as optical depth.
      float amount=max(cloudDepth*mix(.22,.84,sector),reach);
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
  Object.assign(terrain.uniforms,surfaceFlow.uniforms);
  terrain.uniforms.calderaRelief={value:new T.TextureLoader().load('crater-caldera-field.webp')};
  terrain.uniforms.calderaAlbedo={value:new T.TextureLoader().load('crater-caldera-stone.webp')};
  terrain.fragmentShader='uniform sampler2D calderaRelief,calderaAlbedo;\n'+terrain.fragmentShader.replace(
    'vec3 normal=normalize(norm);',`
      vec3 normal=normalize(norm);
      vec2 fieldUV=(wp.xz-vec2(-5850.,-3300.))/7200.;
      float fieldEdge=min(min(fieldUV.x,fieldUV.y),min(1.-fieldUV.x,1.-fieldUV.y));
      float surveyed=smoothstep(.001,.025,fieldEdge)*smoothstep(1880.8,1883.3,wp.y);
      vec4 field=texture2D(calderaRelief,vec2(fieldUV.x,1.-fieldUV.y));
      vec2 tilt=field.rg*2.-1.;
      vec3 measuredNormal=normalize(vec3(tilt.x,sqrt(max(.002,1.-dot(tilt,tilt))),tilt.y));
      normal=normalize(mix(normal,measuredNormal,surveyed*.88));`);
  extend(terrain,surfaceFlow.flowGLSL+'\n'+front,lightLine,`
    // Separately light the NIR-detected needle-bearing slopes, the cinder
    // cone and the broken andesite of the lava apron. Three-dimensional
    // crowns meet the canopy field at their actual photographed positions.
    if(surveyed>.002){
      float crowns=clamp((field.a-.35)/.65,0.,1.);
      float bare=1.-smoothstep(.10,.52,crowns);
      float cut=clamp(2.*field.b-1.,-.83,.88);
      float cone=1.-smoothstep(470.,800.,length(wp.xz-vec2(-1959.,764.)));
      float grain=smoothstep(.15,.78,grit);
      float pores=clamp(.72+.36*field.b+.29*(cliff-.45)+.19*(grain-.45),.41,1.43);
      float ash=cone*smoothstep(1939.,2015.,wp.y);
      vec3 cinder=vec3(.379,.345,.319)*(pores+.20*cut);
      vec3 flowRock=vec3(.336,.342,.333)*(.69+.53*field.b+.27*grain+.25*cut);
      vec3 slopePhoto=texture2D(calderaAlbedo,vec2(fieldUV.x,1.-fieldUV.y)).rgb;
      float stoneValue=lum(slopePhoto);
      vec3 wallTalus=mix(slopePhoto,vec3(1.05,.998,.954)*stoneValue,.30);
      wallTalus*=clamp(.93+.19*field.b+.44*cut+.18*(fissure-.5),.47,1.38);
      vec3 bedrock=mix(wallTalus,mix(flowRock,cinder,ash),cone);
      // Light from the sky keeps the broken rim readable as a shower passes.
      // Shade and rock structure come from the real slope, rather than
      // shrinking tall tree models into a regular pattern of dark dots.
      vec3 light=ambient+direct;
      c=mix(c,pow(max(vec3(.012),bedrock),vec3(2.15))*light,bare*surveyed*.85);
      vec3 needles=mix(vec3(.105,.150,.119),slopePhoto*.85,.54+.28*smoothstep(.17,.65,lum(slopePhoto)));
      needles*=.88+.34*field.b+.12*max(0.,dot(normal,sun));
      c=mix(c,pow(max(vec3(.009),needles),vec3(2.2))*light,surveyed*smoothstep(.09,.60,crowns)*.69);
    }
    float squallShade=craterShade(wp);
    float ribbon=apertures(clearSlot(wp));
    c*=mix(vec3(1.34,1.05,.744),vec3(.292,.396,.565),squallShade);
    c+=c*vec3(.50,.285,.076)*ribbon*(.47+.53*incidence);
    if(d<380.){
      float depth=stormDepth(wp.xz),side=dot(wp.xz,frontSide);
      float dry=.34+.66*localExposure(wp.xz);
      float wet=max(rainAtDepth(wp,depth,side),max(
          .76*rainAtDepth(wp,mod(depth-30.*17.+7000.,18000.)-7000.,side)*exp(-30.*dry/105.),
          .56*rainAtDepth(wp,mod(depth-90.*17.+7000.,18000.)-7000.,side)*exp(-90.*dry/105.)));
      wet*=(1.-smoothstep(210.,380.,d))*(1.-.48*veg);
      float grazing=1.-clamp(dot(normalize(cameraPosition-wp),normal),0.,1.);
      c=c*(1.-.20*wet)+wet*pow(grazing,4.)*vec3(.059,.062,.069);
    }

    `+lightLine);
  const terrainLine='gl_FragColor=vec4(mix(c,aerialHaze,dep*(.72+.28*skyView)),1.);';
  terrain.fragmentShader=terrain.fragmentShader.replace(terrainLine,terrainLine+`
    /* before local precipitation */
    vec3 craterView=normalize(wp-cameraPosition);
    gl_FragColor.rgb=craterRays(craterCurtain(gl_FragColor.rgb,craterView,d),craterView,d);`);
  if(water){
    // A nearby rim can shade the direct glint and the sunlit lake bed. The
    // reflected squall ceiling remains visible on both sides of that shadow.
    water.material.userData.shadowDirectWater=true;
    const waterLine='gl_FragColor=vec4(radiance,alpha);';
    extend(water.material,front,waterLine,`
      float weatherCover=craterShade(worldPosition.xyz);
      float gap=apertures(clearSlot(worldPosition.xyz));
      float wet=dropCover(worldPosition.xyz);
      float grazing=pow(max(dot(reflect(-calderaSun,n),v),0.),19.);
      // Average glints when several capillary facets share a screen pixel.
      float a=710.*n.x+174.*n.z,b=315.*n.z;
      float facets=clamp(.57+.34*sin(a)*(1.-smoothstep(.65,3.,fwidth(a)))+
                             .22*sin(b)*(1.-smoothstep(.65,3.,fwidth(b))),.12,1.);
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
    wetAir.value=window.aerieCalderaRain(player.x,player.y,player.z,t);
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
