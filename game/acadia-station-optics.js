// Light List 1865 flashes red every five seconds; 2045 flashes white every ten.
window.acadiaNavigationLamp=function acadiaNavigationLamp(T,scene,id,station){
  const power={value:0},viewport={value:new T.Vector2(1920,1080)},mirror={value:0};
  const material=new T.ShaderMaterial({
    uniforms:{power,viewport,mirror,hue:{value:new T.Vector3(...station.color)}},transparent:true,
    depthTest:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false,
    vertexShader:`uniform vec2 viewport;varying vec2 pixel;varying float diameter;varying float visibility;
      void main(){
        vec4 center=modelViewMatrix*vec4(0.,0.,0.,1.);float range=length(center.xyz);
        float pixPerMetre=viewport.y*projectionMatrix[1][1]/(2.*max(1.,-center.z));
        diameter=clamp(.19*pixPerMetre,1.55*viewport.y/1080.,38.);
        visibility=clamp(1.-range/28000.,.18,1.);
        float halo=diameter*1.45+3.25*viewport.y/1080.;
        pixel=position.xy*halo;
        gl_Position=projectionMatrix*center;gl_Position.xy+=pixel*2./viewport*gl_Position.w;
      }`,
    fragmentShader:`uniform float power,mirror;uniform vec3 hue;
      varying vec2 pixel;varying float diameter;varying float visibility;
      void main(){
        if(mirror>.5||power<.001)discard;
        float radius=length(pixel),core=exp(-2.8*dot(pixel,pixel)/max(.75,diameter*diameter));
        float air=.21*exp(-2.4*radius/(1.7+diameter*.49));
        float flux=(core+air)*power*visibility;
        if(flux<.0006)discard;
        gl_FragColor=vec4(hue*2.45,clamp(flux,0.,1.));
        #include <colorspace_fragment>
      }`
  });
  material.userData.acadiaNight=true;
  const lamp=new T.Mesh(new T.PlaneGeometry(2,2),material);lamp.name=id==='egg'?'Egg Rock · red optical signal':'Baker Island · white optical signal';
  lamp.position.set(...station.lamp);lamp.frustumCulled=false;lamp.renderOrder=34;
  lamp.onBeforeRender=(renderer,scene,camera)=>{
    renderer.getDrawingBufferSize(viewport.value);mirror.value=camera.userData.lakeReflection?1:0;
    material.uniformsNeedUpdate=true;
  };
  scene.add(lamp);return power;
};

window.acadiaIslandSurface=function acadiaIslandSurface(shader,localUV,sampler){
  return shader.replace('if(wp.y<shoreLevel+.001)discard;', `
      bool waveLedge=(wp.x>3938.&&wp.x<4087.&&wp.z>-3959.&&wp.z< -3740.)||
                     (wp.x> -604.&&wp.x< -344.&&wp.z>9128.&&wp.z<9298.);
      if(wp.y<shoreLevel+(waveLedge ? -.80 : .001))discard;`)
    .replace('photo=mix(photo,vec3(lum(photo)),arctic*.27);',`
      // Beyond the mainland atlas boundary the regional photograph blends to
      // the distant panorama. The island surveys have their own geographic UVs.
      photo=mix(photo,texture2D(${sampler},${localUV}).rgb,landformHorizon.w);
      vec3 coniferBed=vec3(.72,.89,.69)*dot(photo,vec3(.24,.56,.20));
      photo=mix(photo,coniferBed,.70*landformHorizon.z*landformHorizon.w);
      photo=mix(photo,vec3(lum(photo)),arctic*.27);`)
    .replace('normal=normalize(mix(normal,ledgeNormal,.94*graniteShore));',`
      graniteShore=landformHorizon.w*(1.-landformHorizon.z)*smoothstep(-1.1,.7,wp.y)*(1.-smoothstep(12.,23.,wp.y));
      ledgeNormal=normal;measured.b=clamp(.54+(normal.x*.20+normal.z*.12),.12,.89);
      normal=normalize(mix(normal,ledgeNormal,.94*graniteShore));`)
    .replace('float dep=1.-exp(',`
      // Separate stone and turf reflectance from the strong daylight shadows
      // in the aerial. Use the same local sky exposure for the tide line and lawn.
      if(landformHorizon.w>.001){
        float moss=smoothstep(-.013,.049,photo.g-.5*(photo.r+photo.b));
        float density=landformHorizon.z;
        float reflectance=clamp(lum(photo),.065,.77);
        float slab=smoothstep(.34,.73,reflectance)*(1.-.78*moss);
        vec3 localGrain=texture2D(coastalWall,wp.xz*vec2(.16,.13)+.29).rgb;
        float closeGrain=1.-smoothstep(80.,540.,d);
        float mineral=clamp(lum(localGrain)/.45,.35,1.59);
        float grass=soilCapture(sod,wp.xz*.43,4.).r;
        vec3 substrate=mix(vec3(.25,.26,.235),vec3(.35,.33,.319),slab);
        substrate*=mix(.72,1.23,smoothstep(.04,.76,reflectance));
        substrate*=1.+closeGrain*mix((grass-.45)*.69,(mineral-1.)*.49,slab);
        substrate*=mix(1.,.66+.08*mineral,density);
        vec3 nightSky=vec3(.111,.143,.182)*(.70+.30*max(0.,normal.y))*landformHorizon.x;
        vec3 moonLight=vec3(.10,.13,.18)*max(0.,dot(normal,sun))*(1. /* direct terrain visibility */);
        float wet=mix(.49,1.,smoothstep(.5,3.9,wp.y));
        vec3 localGround=pow(max(vec3(.014),substrate),vec3(2.2))*(nightSky+moonLight)*wet;
        c=mix(c,localGround,landformHorizon.w*(1.-.91*rockBlend));
      }
      float dep=1.-exp(`);
};

// Upper 1024 image rows are shore distance, seaward normal and surveyed depth.
// Lower 128 rows hold the height horizon from each lantern along 1,024 bearings.
window.acadiaOffshoreWater=function acadiaOffshoreWater(T,water,texture,sites,pulses){
  if(!water)return;
  const mat=water.material,field=texture('acadia-island-tides.png');
  field.minFilter=T.LinearFilter;field.magFilter=T.LinearFilter;field.generateMipmaps=false;
  Object.assign(mat.uniforms,{islandTides:{value:field},eggPulse:pulses[0],bakerPulse:pulses[1],
    eggLight:{value:new T.Vector3(...sites.egg.lamp)},bakerLight:{value:new T.Vector3(...sites.baker.lamp)}});
  const library=`
    uniform sampler2D islandTides;
    uniform float eggPulse,bakerPulse;uniform vec3 eggLight,bakerLight;
    vec4 islandShore(vec2 p,out float inField){
      vec2 uv=(p-vec2(3490.,-4320.))/1000.;float tile=0.;
      if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.)))){
        uv=(p-vec2(-1359.,8086.))/vec2(1316.,1326.);tile=1.;
      }
      inField=float(all(greaterThanEqual(uv,vec2(0.)))&&all(lessThanEqual(uv,vec2(1.))));
      if(inField<.5)return vec4(1.,.5,.5,.49);
      vec2 texel=(clamp(uv,vec2(.0005),vec2(.9995))*1023.+.5);
      return texture2D(islandTides,vec2((texel.x+tile*1024.)/2048.,1.-texel.y/1152.));
    }
    float stationGlints(vec3 point,vec3 n,vec3 v,float footprint,vec3 lamp,float split){
      vec3 toLamp=lamp-point;
      float range=length(toLamp.xz);if(range<.5||range>11000.)return 0.;
      vec3 incident=normalize(toLamp),h=normalize(incident+v);
      // Near-horizontal normals reflect a coastal light in a narrow, broken
      // track toward the viewer. A distant unfaced shore receives no stripe.
      float facing=dot(v.xz,-incident.xz);
      if(facing<.78||n.y<.35)return 0.;
      float az=atan(-toLamp.z,-toLamp.x)/6.28318531+.5;
      float row=clamp(log(max(4.,range)/4.)/log(4500.)*128.-.5,0.,127.);
      vec2 texel=vec2((.5+clamp(az*1024.,0.,1023.)+split*1024.)/2048.,(127.5-row)/1152.);
      vec2 horizonBytes=texture2D(islandTides,texel).rg;
      float skyline=((horizonBytes.r*65280.+horizonBytes.g*255.)/65535.)*2.-1.50;
      float visible=smoothstep(skyline-.004,skyline+.004,atan(-toLamp.y,range));
      vec2 slope=n.xz/max(.15,n.y),facet=h.xz/max(.012,h.y);
      float spread=.09+.076*smoothstep(.8,10.,footprint);
      float slopeFit=exp(-dot(slope-facet,slope-facet)/(2.*spread*spread));
      float distanceWeight=1./(1.+range*range/120000.);
      return visible*slopeFit*smoothstep(.78,.995,facing)*distanceWeight*(.24+.76*(1.-abs(v.y)));
    }
  `;
  mat.fragmentShader=library+mat.fragmentShader
    .replace('float fetch=mix(1.,shore.g,interior);',`
      float islandActive;vec4 island= islandShore(p,islandActive);
      float mappedDistance=island.r*116.-12.;
      bank=mix(bank,max(0.,mappedDistance),islandActive);
      float fetch=mix(1.,shore.g,interior);`)
    .replace('away=mix(away,local.zw,localWeight);',`away=mix(away,local.zw,localWeight);
      away=mix(away,island.gb*2.-1.,islandActive);`)
    .replace('float shallow=exp(-.47*waterDepth);',`float surveyedDepth=clamp((island.a-.50)/.495,0.,1.);
      waterDepth=mix(waterDepth,max(.08,22.*surveyedDepth*surveyedDepth),islandActive*step(.499,island.a));
      float shallow=exp(-.47*waterDepth);`)
    .replace('gl_FragColor=vec4(radiance,alpha);',`
      if(eggPulse>.002)radiance+=vec3(.52,.009,.003)*eggPulse*stationGlints(worldPosition.xyz,n,v,footprint,eggLight,0.);
      if(bakerPulse>.002)radiance+=vec3(.39,.36,.30)*bakerPulse*stationGlints(worldPosition.xyz,n,v,footprint,bakerLight,1.);
      gl_FragColor=vec4(radiance,alpha);`);
  mat.needsUpdate=true;
};
