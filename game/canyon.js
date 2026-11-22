window.makeCanyon = function makeCanyon(THREE, scene) {
  const {clamp, smoothstep, lerp} = THREE.MathUtils;
  function survey(key, size, left, north, step) {
    const bytes = Uint8Array.from(atob(window.CANYON_SURVEY[key]), ch=>ch.charCodeAt(0));
    const heights = new Int16Array(bytes.buffer);
    return function sample(x,z) {
      const a=clamp((x-left)/step,0,size-1), b=clamp((z-north)/step,0,size-1);
      const i=Math.min(size-2,Math.floor(a)), j=Math.min(size-2,Math.floor(b));
      const f=a-i,g=b-j,k=j*size+i;
      return lerp(lerp(heights[k],heights[k+1],f),lerp(heights[k+size],heights[k+size+1],f),g)/8;
    };
  }
  const outer=survey('outer',513,-12800,-12800,50), basin=survey('basin',801,-3200,-3200,8);
  const fine=survey('fine',513,-1600,-800,3.125);
  function surveyedElevation(x,z) {
    const radius=Math.max(Math.abs(x),Math.abs(z));
    const horizon=()=>outer(x,z)+window.rangeRelief("canyon",x,z);
    if(radius>=3200)return horizon();
    let h=basin(x,z);
    if(radius>3060)return lerp(h,horizon(),smoothstep(radius,3060,3200));
    const inset=Math.min(x+1600,-x,800-Math.abs(z));
    return inset>0 ? lerp(h,fine(x,z),smoothstep(inset,0,32)) : h;
  }
  const landmarkTerrain=window.aerieRegionalLandforms?.get('canyon');
  const landmarkGroundMaterials=new Set();
  const shelfSurvey=window.aerieRegionalLandforms?.get('canyonshelves');
  function surroundingGround(x,z){
    const base=nativeElevation(x,z);
    return landmarkTerrain?landmarkTerrain.height(x,z,base):base;
  }
  function elevation(x,z){
    const base=surroundingGround(x,z);
    return shelfSurvey?shelfSurvey.height(x,z,base):base;
  }
  function surveyedShelf(x,z){
    if(!shelfSurvey)return false;
    const amount=shelfSurvey.edge(x,z);
    if(amount<=0)return false;
    // Transverse joints and detached-looking projections are already present
    // in the local 1 m surface. Fade loose specimen scatter at its perimeter.
    const cell=Math.imul(Math.floor(x*8),73856093)^Math.imul(Math.floor(z*8),19349663);
    return amount>(cell>>>0)/4294967296;
  }
  function nativeElevation(x,z){
    const ground=surveyedElevation(x,z);
    const along=z+288;
    if(Math.abs(along)>34 || x< -585 || x> -476)return ground;
    // Erosion recesses the original terrain below the resistant sandstone cap.
    const u=along/25;
    const edge=-527+along*.82+2.2*Math.sin(u*4.5+1.)+.73*Math.sin(u*13.7);
    const across=x-edge;
    const opening=(1-smoothstep(Math.abs(along),19,34))*smoothstep(across,-21,-7)*(1-smoothstep(across,9,18));
    const floor=surveyedElevation(edge+8,z)-1.;
    return lerp(ground,Math.min(ground,floor),opening);
  }
  const loader=new THREE.TextureLoader();
  const texture=(name,repeat=false)=>{
    const t=loader.load(name);
    t.anisotropy=4;
    if(repeat)t.wrapS=t.wrapT=THREE.RepeatWrapping;
    return t;
  };
  const sun=new THREE.Vector3(-.735,.225,.63).normalize();
  const skyTexture=texture('sky.jpg');skyTexture.generateMipmaps=false;
  skyTexture.minFilter=THREE.LinearFilter;skyTexture.wrapS=THREE.RepeatWrapping;
  const light=new THREE.DirectionalLight(0xffc390,2.1);
  light.position.copy(sun).multiplyScalar(3000);
  scene.add(light,new THREE.HemisphereLight(0xffe6d4,0xd18561,1.53));
  scene.fog=new THREE.FogExp2(0xc2a6a2,.000074);
  const skyColor=`
    vec3 skyColor(vec3 d) {
      float u=(atan(d.z,d.x)-atan(sun.z,sun.x))*.159154943+.650;
      float v=asin(clamp(d.y,-1.,1.))*.318309886+.457;
      vec3 c=texture2D(panorama,vec2(u,clamp(v,.015,.998))).rgb;
      float a=distance(d,sun);
      return c*vec3(1.06,.97,.94)+vec3(.20,.083,.029)*exp(-5.6*a)+vec3(.65,.5,.26)*(1.-smoothstep(.004,.009,a));
    }`;
  const sky=new THREE.Mesh(new THREE.SphereGeometry(1,48,24),new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,uniforms:{panorama:{value:skyTexture},sun:{value:sun}},
    vertexShader:'varying vec3 ray;void main(){ray=position;vec4 p=projectionMatrix*vec4(mat3(viewMatrix)*position,1.);gl_Position=p.xyww;}',
    fragmentShader:'varying vec3 ray;uniform sampler2D panorama;uniform vec3 sun;'+skyColor+'void main(){gl_FragColor=vec4(skyColor(normalize(ray)),1.);}'
  }));
  sky.frustumCulled=false;sky.renderOrder=-1000;scene.add(sky);
  const time={value:0}, shared={
    terrainField:{value:texture('canyon-terrain-field.png')},bankRadiance:{value:texture('canyon-river-banks.webp')},
    crossbeds:{value:texture('canyon-overlook-strata.webp')},
    strata:{value:texture('cliff-strata.jpg',true)},grain:{value:texture('rock.jpg',true)},
    flow:{value:texture('canyon-flow.webp')},ripple:{value:texture('waternormals.jpg',true)},
    sand:{value:texture('shore-sand.webp',true)},pebbles:{value:texture('shore-pebbles.webp',true)},
    pebbleNormal:{value:texture('shore-pebbles-normal.webp',true)},bankMap:{value:texture('canyon-surveyed-banks.png')},
    panorama:{value:skyTexture},sun:{value:sun},clock:time
  };
  // A mip of the packed elevation can bridge a river bank. Keep each traced
  // sample on the native four-metre field, using interpolation within that cell.
  shared.terrainField.value.minFilter=THREE.LinearFilter;
  shared.terrainField.value.generateMipmaps=false;
  // The bottom rectangle retains the scanned, metre-scale cross beds. The
  // upper rectangle holds only visible rock from the NPS overlook photograph.
  const localBeds=`
    vec3 bandScan(vec2 p){
      vec2 edge=1.-abs(mod(p,2.)-1.);
      return texture2D(crossbeds,vec2(.0015+.496*edge.x,.012+.303*edge.y)).rgb;
    }`;
  const vertex=`varying vec3 wp,n;varying vec2 tc;
    void main(){wp=position;n=normal;tc=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
  shared.scrubFloor={value:texture('field-ground-scans.webp')};
  const atlas=window.aerieWaterOpacity?.bind(THREE,['river_bank'],true);
  if(atlas){atlas.bankTexture.anisotropy=shared.bankMap.value.anisotropy;shared.bankMap.value=atlas.bankTexture;}
  const waterContact=window.aerieWaterContacts?.enabled;
  const closeRock=window.aerieCloseMaterial;
  const scannedRock=closeRock?.canyonReady();
  const fragment=`
    ${atlas?.shader||''}
    ${waterContact?window.aerieWaterContacts.profile:''}
    ${scannedRock?closeRock.arrayShader:'uniform sampler2D wallRelief;'}
    uniform sampler2D scrubFloor;
    ${window.aerieFieldShader('canyon')}
    vec3 sandstoneMidGround(sampler2D gallery,vec3 at,vec3 normal,vec3 color,vec3 sun,
                        float range,float substrate){
      // Mix broad material faces from the existing regional atlas, while
      // retaining the registered color and extent of each actual landform.
      float band=smoothstep(115.,285.,range)*(1.-smoothstep(1850.,3800.,range));
      float amount=band*clamp(substrate,0.,1.);
      if(amount<.004)return color;
      vec2 xz=at.xz;
      float steep=smoothstep(.10,.73,1.-normal.y);
      float stand=fieldGrain(xz*.018+vec2(3.1,-8.2));
      mat2 orient=mat2(.788,.616,-.616,.788);
      float bend=fieldGrain(xz*.008-vec2(9.7,2.1))-.5;
      vec2 slopeUv=vec2(dot(xz,vec2(.77,.63)),at.y*.84+dot(xz,vec2(-.26,.32)))*.026;
      slopeUv+=vec2(.23*(stand-.5),bend*.48);
      vec2 apronUv=orient*xz*.021+vec2(.38+.33*bend,.19+.22*(stand-.5));
      vec4 apron=soilCapture(gallery,apronUv,9.);
      vec4 outcrop=soilCapture(gallery,slopeUv+vec2(.11,.43),13.);
      float plane=mix(apron.a,outcrop.a,steep);
      float veins=mix(dot(apron.rgb,vec3(.27,.57,.16)),dot(outcrop.rgb,vec3(.27,.57,.16)),steep);
      float mineralVariation=clamp((plane-.50)*1.10+(veins-.34)*.87,-.68,.68);
      // Sun direction supplies the material's slope response, without
      // altering cast shadows, the scene light, or atmospheric terms.
      float facing=dot(normal,sun);
      float exposed=mix(.69,1.24,steep);
      vec3 dx=dFdx(at),dy=dFdy(at);
      vec3 u=cross(dy,normal),v=cross(normal,dx);
      float area=dot(dx,u);
      vec3 gradient=(dFdx(plane)*u+dFdy(plane)*v)*sign(area)/max(abs(area),.00001);
      vec3 faceNormal=normalize(normal-gradient*mix(.75,2.4,steep));
      float margin=clamp(dot(faceNormal,sun)-facing,-.35,.35);
      float structure=mineralVariation*(.61+.26*facing)+.34*margin+.16*(stand-.48)*(1.-steep);
      float substrateGain=clamp(1.+structure*exposed*1.18,.59,1.45);
      return color*mix(1.,substrateGain,amount);
    }
    uniform sampler2D terrainField,bankRadiance,crossbeds;
    uniform sampler2D photo,strata,grain,flow,ripple,panorama,sand,pebbles,pebbleNormal${atlas?'':',bankMap'};
    uniform vec3 sun;uniform float clock;varying vec2 tc;varying vec3 wp,n;
    `+skyColor+localBeds+`
    float lum(vec3 c){return dot(c,vec3(.299,.587,.114));}
    vec4 overlookStone(vec3 p,vec3 N){
      vec3 ray=p-vec3(-71.077,349.703,96.735);
      float depth=dot(ray,vec3(-.851342,-.343441,-.396567));
      if(depth<360.||depth>3400.)return vec4(0.);
      vec2 sensor=vec2(dot(ray,vec3(.432410,-.031360,-.901132)),
                       dot(ray,vec3(-.297049,.938651,-.175205)))/depth;
      // Invert the photo's fitted first-order radial lens distortion.
      float rs=dot(sensor,sensor);
      float scale=1./(1.+.072476*rs);
      scale=1./(1.+.072476*rs*scale*scale);
      vec2 uv=.5+sensor*scale*vec2(.505310,.759229);
      if(min(uv.x,uv.y)<0.||max(uv.x,uv.y)>1.)return vec4(0.);
      vec4 stone=texture2D(crossbeds,vec2(uv.x,.333984+.666016*uv.y));
      // Reject back faces and any surface lying behind or in front of the
      // surveyed first intersection. Original sky, trees, water and nearby
      // foreground were masked while orthorectifying the field photograph.
      float visibleDepth=80.*exp(3.80666*(255.*stone.a-1.)/254.);
      float visible=1.-smoothstep(.018,.061,abs(visibleDepth-depth)/depth);
      visible*=smoothstep(.024,.23,dot(N,-normalize(ray)));
      float oxide=(stone.g-.5)/1.25;
      vec3 color=stone.r+oxide*vec3(.49,-.104,-.51);
      return vec4(color,visible*stone.b*step(.006,stone.a));
    }
    float riverGrain(vec2 p){
      vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
      vec4 h=fract(sin(dot(i,vec2(61.7,37.3))+vec4(0.,61.7,37.3,99.))*4375.19);
      return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);
    }
    // Local photographs are measured in metres. Rotate alternate samples to
    // break up the repetition across broad bars, retaining the pebble scale.
    // Integer cell keys agree on both sides of a tile seam, even kilometres
    // from the world origin. Interpolating hashes of independently rounded
    // dot-products produced visible rectangles in transmitted river light.
    float channelNoise(vec2 p){
      vec2 i=floor(p),f=fract(p);
      f=f*f*(3.-2.*f);
      vec4 ix=vec4(i.x,i.x+1.,i.x,i.x+1.);
      vec4 iz=vec4(i.y,i.y,i.y+1.,i.y+1.);
      vec4 key=mod(ix*17.+iz*157.,4093.);
      vec4 h=fract(sin(key)*4375.19);
      return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);
    }
    vec3 gravel(vec2 p){
      return mix(texture2D(pebbles,p).rgb,texture2D(pebbles,mat2(.8,-.6,.6,.8)*p+vec2(.37,.63)).rgb,
                 smoothstep(-.30,.30,sin(p.x*.17)+.6*cos(p.y*.23)));
    }
    float groundHeight(vec2 p){
      vec2 heightCode=texture2D(terrainField,vec2(p.x,-p.y)/6400.+.5).rg;
      return dot(heightCode,vec2(1020.,3.984375))-250.;
    }
    // The walls can fill almost the entire reflection at river level. Trace a
    // reflected ray through the registered survey, then refine the first crossing.
    vec3 canyonReflection(vec3 origin,vec3 ray){
      vec3 sky=skyColor(ray);
      float walk=3.5, previous=0.;
      for(int i=0;i<24;i++){
        vec3 q=origin+ray*walk;
        if(max(abs(q.x),abs(q.z))>3195. || q.y>610.)break;
        if(groundHeight(q.xz)>q.y){
          float lo=previous,hi=walk;
          for(int j=0;j<5;j++){
            float mid=(lo+hi)*.5;
            vec3 v=origin+ray*mid;
            if(groundHeight(v.xz)>v.y)hi=mid;else lo=mid;
          }
          vec2 hit=origin.xz+ray.xz*hi;
          vec3 wall=texture2D(bankRadiance,vec2(hit.x,-hit.y)/6400.+.5).rgb;
          return mix(wall,sky,1.-exp(-hi*.00012));
        }
        previous=walk;walk=walk*1.29+3.5;
      }
      return sky;
    }
    void main(){
      vec3 normal=normalize(n),eye=normalize(cameraPosition-wp);
      ${scannedRock?'vec3 rockDx=dFdx(wp),rockDy=dFdy(wp);':''}
      vec3 aerial=texture2D(photo,tc).rgb;
      // Recover mineral albedo inside shadows in the midday source photograph.
      // Cast the current shadow from the sunset horizon map below.
      float oldShadow=(1.-smoothstep(.055,.21,lum(aerial)))*smoothstep(.12,.65,1.-normal.y);
      float neutral=smoothstep(-.025,.10,aerial.r-aerial.b);
      aerial=mix(aerial,mix(vec3(.28,.182,.133),vec3(.42,.28,.194),lum(aerial)*4.),oldShadow*(.51+.39*neutral));
      vec2 flowUv=vec2(.5+wp.x/6400.,.5-wp.z/6400.);
      vec3 hyd=texture2D(flow,clamp(flowUv,0.,1.)).rgb;
      float wet=hyd.r*(1.-smoothstep(3130.,3200.,max(abs(wp.x),abs(wp.z))));
      // Some orthophoto seams carry a cyan cast even on the dry plateau. The
      // surveyed channel determines where water coloration belongs.
      float cyan=smoothstep(.055,.19,aerial.g-aerial.r)*smoothstep(.013,.095,aerial.b-aerial.r)*(1.-wet);
      vec3 plateau=texture2D(bankRadiance,clamp(flowUv,0.,1.)).rgb;
      float mineral=.43+.50*lum(aerial)+.17*lum(plateau);
      aerial=mix(aerial,vec3(.78,.59,.43)*mineral,cyan);
      float face=1.-smoothstep(.26,.80,normal.y);
      float shift=.92*sin(wp.z*.008+wp.x*.006)+.47*sin(wp.x*.017);
      vec2 xuv=vec2(wp.z*.058,(wp.y+shift)*.13);
      vec2 zuv=vec2(wp.x*.058,(wp.y+shift)*.13);
      float sideMix=abs(normal.z)/(abs(normal.x)+abs(normal.z)+.001);
      float beds=mix(lum(texture2D(strata,xuv).rgb),lum(texture2D(strata,zuv).rgb),sideMix);
      float grains=lum(texture2D(grain,wp.xz*.116).rgb);
      float exposure=max(dot(normal,sun),0.);
      float longWave=3.6*sin(wp.z*.022+wp.x*.008)+2.1*cos(wp.x*.041);
      float layer=.43*sin((wp.y+shift+longWave)*.27)+.27*sin((wp.y+shift)*1.7);
      vec3 cliffColor=vec3(.56,.34,.235)*(.73+.52*beds+.055*layer);
      cliffColor*=.82+.35*smoothstep(.05,.55,lum(aerial));
      vec3 dry=mix(aerial,cliffColor,face*.80);
      float dist=distance(cameraPosition,wp);
      dry*=1.+(.23*(grains-.43)*(1.-face)+.36*(beds-.46)*face)*exp(-dist*.0014);
      dry*=vec3(.94,.94,.98)+vec3(.33,.205,.095)*exposure;
      dry+=vec3(.014,.012,.016);
      float signedBank=(texture2D(bankMap,clamp(flowUv,0.,1.)).r-.5)*96.;
      float closeGround=1.-smoothstep(20.,180.,dist);
      // Keep wash on the measured shoreline, including the small shelf that
      // emerges between surges. The ortho mask remains authoritative at range.
      float shorePhase=dot(wp.xz,vec2(.15,-.083))+riverGrain(wp.xz*.13)*2.8;
      float wash=.28*sin(shorePhase-clock*1.32)+.13*sin(shorePhase*1.93-clock*.87);
      float waterline=1.-smoothstep(wash-.29,wash+.31,signedBank);
      wet=mix(wet,waterline,closeGround*(1.-smoothstep(1.,3.,abs(signedBank))));
      if(closeGround>.001){
        vec2 p=wp.xz;float sandy=smoothstep(.58,.88,normal.y);
        float gravelBar=(1.-smoothstep(4.,43.,signedBank))*sandy;
        float granular=lum(texture2D(sand,p*.37).rgb);
        vec3 sandstone=mix(vec3(.34,.225,.155),vec3(.87,.645,.415),smoothstep(.16,.85,granular));
        float grainScale=.94+.10*lum(texture2D(grain,p*.94).rgb);
        vec3 stones=gravel(p*.70);
        vec3 bump=texture2D(pebbleNormal,p*.70).rgb*2.-1.;
        vec3 stoneNormal=normalize(vec3(bump.r*.52,1.,-bump.g*.52));
        stones=mix(stones,vec3(lum(stones)),.25)*vec3(1.16,1.02,.84)*(.86+.25*max(dot(stoneNormal,sun),0.));
        vec3 substrate=mix(sandstone*grainScale,stones,gravelBar*.86);
        float green=smoothstep(.00,.07,aerial.g-aerial.r);
        dry=mix(dry,substrate*(.55+.65*smoothstep(.04,.58,lum(aerial))),closeGround*sandy*(1.-green*.83)*.86);
      }
      float region=1.-smoothstep(2960.,3195.,max(abs(wp.x),abs(wp.z)));
      vec4 valleyLight=texture2D(terrainField,clamp(flowUv,0.,1.));
      float sunVisibility=mix(1.,valleyLight.b,region)*(1. /* direct terrain visibility */);
      float openSky=mix(1.,texture2D(bankRadiance,clamp(flowUv,0.,1.)).a,region);
      if(face>.025){
        // Curved sets of dune beds run through the scan. Project along each
        // exposed face so steep and vertical surfaces retain their metre scale.
        float dip=wp.y+.072*wp.x-.065*wp.z+shift*1.7+longWave*.75;
        vec2 a=vec2(wp.z,dip)*vec2(.030,.048),b=vec2(-wp.x,dip)*vec2(.030,.048);
        vec3 series=mix(bandScan(a),bandScan(b),sideMix);
        vec3 large=mix(bandScan(a*.238+.32),bandScan(b*.238+.32),sideMix);
        float band=clamp(.5+1.15*(series.r-.5)+.61*(large.g-.5)+.48*(series.g-.5),0.,1.);
        float varnish=smoothstep(.23,.66,large.b)*smoothstep(.34,.67,series.b);
        vec3 pigment=mix(vec3(.47,.257,.163),vec3(.88,.61,.393),band);
        pigment*=mix(vec3(1.),vec3(.54,.62,.70),varnish*.83);
        if(dist<850.){
          vec2 lateral=vec2(-wp.x*sign(normal.z),wp.z*sign(normal.x));
          float warp=1.1*sin(wp.x*.031+wp.z*.025)+.27*sin(wp.x*.137-wp.z*.14);
          float bench=wp.y+warp+.064*wp.x-.05*wp.z;
          vec2 uvX=vec2(lateral.y*.125+sin(bench*.24)*.031,bench*.20);
          vec2 uvZ=vec2(lateral.x*.125+sin(bench*.24)*.031,bench*.20);
          // The photographed displacement, normal and occlusion come from
          // the same surface. At grazing angles ledge lips hide the layer behind.
          vec3 tx=vec3(0.,0.,sign(normal.x)),tz=vec3(-sign(normal.z),0.,0.);
          float travel=.033*(1.-smoothstep(28.,125.,dist))/max(.30,abs(dot(normal,eye)));
          vec2 incX=vec2(dot(tx,eye),eye.y)*travel,incZ=vec2(dot(tz,eye),eye.y)*travel;
          uvX+=(texture2D(strata,uvX).a-.60)*incX;
          uvZ+=(texture2D(strata,uvZ).a-.60)*incZ;
          // Sharpen the choice of wall plane to preserve laminae on diagonal faces.
          float axis=smoothstep(.24,.76,sideMix);
          vec4 rock=mix(texture2D(strata,uvX),texture2D(strata,uvZ),axis);
          ${scannedRock?`
          vec3 nx=texture(wallRelief,vec3(uvX,0.)).rgb,nz=texture(wallRelief,vec3(uvZ,0.)).rgb;
          `:`
          vec3 nx=texture2D(wallRelief,uvX).rgb,nz=texture2D(wallRelief,uvZ).rgb;
          `}
          vec2 increment=mix(nx.rg,nz.rg,axis)*2.-1.;
          vec3 tangent=normalize(mix(tx,tz,axis)+vec3(.00001));
          vec3 tangentUp=normalize(vec3(0.,1.,0.)-normal*normal.y);
          vec3 local=normalize(normal+1.16*(tangent*increment.x+tangentUp*increment.y));
          float cavity=mix(nx.b,nz.b,axis);
          float light=.65+.38*max(0.,local.y)+.30*max(0.,dot(local,normalize(vec3(-.48,.68,.57))));
          light+=.41*sunVisibility*max(0.,dot(local,sun));
          float crevice=mix(.48,1.03,cavity)*mix(.78,1.07,smoothstep(.34,.86,rock.a));
          float foot=1.-smoothstep(100.,850.,dist);
          vec3 slab=rock.rgb*vec3(1.14,1.055,1.)*mix(.74,1.30,band);
          slab*=mix(vec3(1.),vec3(.59,.64,.72),varnish*.69);
          pigment=mix(pigment,slab*light*crevice,foot*.94);
        }
        dry=mix(dry,pigment,face*(.98-.46*smoothstep(1300.,6100.,dist)));
      }
      vec4 overlook=overlookStone(wp,normal);
      // The field mask includes flat benches of bare Navajo Sandstone.
      // Steep faces receive the greatest photographic contribution.
      float bedrock=(.46+.54*smoothstep(.045,.43,1.-normal.y))*(1.-wet);
      float mappedBed=overlook.a*bedrock;
      vec3 sandstone=overlook.rgb*(.90+.20*beds);
      float incidence=max(0.,dot(normal,sun));
      // Sky scatter and light bouncing off the opposite warm wall both reach
      // the canyon floor during sunset, even when the rim blocks the sun.
      vec3 indirect=vec3(.61,.69,.82)*(.75+.25*openSky)+vec3(.14,.071,.032)*(1.-openSky);
      vec3 sunward=vec3(.57,.35,.17)*(.27+.73*sqrt(incidence))*sunVisibility;
      float terrace=(1.-face)*(1.-wet)*smoothstep(2.,25.,signedBank);
      float bankMoisture=1.-smoothstep(4.,36.,signedBank);
      dry=regionalSoil(scrubFloor,wp,normal,dry,sun,dist,smoothstep(.00,.07,aerial.g-aerial.r)*.30,bankMoisture,terrace);
      dry=mix(dry,sandstone,mappedBed*(.94-.32*(1.-smoothstep(35.,190.,dist))));
      float rimRock=(1.-smoothstep(155.,690.,length(wp.xz-vec2(0.,80.))))*
                    smoothstep(270.,330.,wp.y)*smoothstep(.47,.86,normal.y);
      if(rimRock>.004){
        vec2 plate=wp.xz*.105+vec2(.14*sin(wp.z*.032),.085*cos(wp.x*.028));
        vec2 gritUv=1.-abs(mod(plate,2.)-1.);
        vec2 large=1.-abs(mod(mat2(.80,-.60,.60,.80)*plate*.29+.54,2.)-1.);
        vec3 chips=texture2D(crossbeds,vec2(.5025+.496*gritUv.x,.012+.303*gritUv.y)).rgb;
        ${scannedRock?`
        if(dist<24.&&wet<.01){
          // Keep the red and grey photographed plates, but let the new scan
          // supply the fine structure in place of the original repeated crop.
          vec2 chipUV=vec2(.5025,.012)+vec2(.496,.303)*clamp(gritUv,.035,.965);
          float closeWeight=closeRockVisibility(rockDx,rockDy,dist);
          vec3 plateColor=textureGrad(crossbeds,chipUV,vec2(.023,0.),vec2(0.,.018)).rgb;
          chips=mix(chips,plateColor,.83*closeWeight);
        }
        `:''}
        vec3 broad=texture2D(crossbeds,vec2(.5025+.496*large.x,.012+.303*large.y)).rgb;
        vec3 lip=chips*vec3(1.13,.977,.878)*(.81+.39*lum(broad));
        float scrub=smoothstep(.006,.075,aerial.g-aerial.r);
        dry=mix(dry,lip,rimRock*(1.-scrub)*(.73-.36*smoothstep(240.,620.,dist)));
      }
      dry=sandstoneMidGround(scrubFloor,wp,normal,dry,sun,dist,
        (1.-wet)*smoothstep(2.,24.,signedBank));
      ${scannedRock?`
      if(dist<24.&&wet<.01){
        float surfaceWeight=max(face,.81*max(rimRock,mappedBed));
        surfaceWeight=max(surfaceWeight,.64*smoothstep(3.5,28.,signedBank));
        surfaceWeight*=(1.-smoothstep(.015,.09,aerial.g-aerial.r))*smoothstep(1.5,5.,signedBank);
        if(surfaceWeight>.006){
          RockDetail detail=closeRockDetail(wp,rockDx,rockDy,normal,dist,1.);
          float weight=surfaceWeight*detail.visibility;
          dry*=1.+.92*detail.pigment*weight;
          vec3 finalNormal=closeRockNormal(normal,detail,weight);
          float response=sqrt(max(0.,dot(finalNormal,sun)))-sqrt(incidence);
          float sheen=closeRockSheen(finalNormal,sun,eye,detail.rough)*weight;
          sunward+=vec3(.57,.35,.17)*sunVisibility*(.73*response+sheen);
        }
      }
      `:''}
      dry*=indirect+sunward;
      float groundPass=closeGround*(1.-face)*(1.-wet)*smoothstep(3.,26.,signedBank);
      vec3 pebbly=soilCapture(scrubFloor,wp.xz*.32,10.).rgb;
      // Grit and fallen fragments collect where the survey rises sharply
      // within a few metres. Leave the smooth river bars free of scree.
      if(groundPass>.005){
        float rim=max(max(groundHeight(wp.xz+vec2(20.,0.)),groundHeight(wp.xz-vec2(20.,0.))),
                      max(groundHeight(wp.xz+vec2(0.,20.)),groundHeight(wp.xz-vec2(0.,20.))));
        float fan=smoothstep(4.,27.,rim-wp.y+6.*riverGrain(wp.xz*.08));
        vec3 chips=gravel(wp.xz*.42);
        float sunFacing=texture2D(pebbleNormal,wp.xz*.42).g;
        vec3 chipsColor=mix(pebbly*vec3(1.12,.91,.76),lum(chips)*vec3(1.52,1.13,.85),.59);
        dry=mix(dry,chipsColor*(.80+.23*sunFacing)*(indirect+sunward),fan*groundPass*.79);
      }
      float damp=closeGround*(1.-smoothstep(.25,1.95,signedBank))*(1.-wet);
      dry*=mix(vec3(1.),vec3(.61,.65,.67),damp);
      vec3 color=dry;
      if(wet>.002){
        vec2 dir=normalize((hyd.gb-.5)*2.+vec2(.0001));
        vec2 here=wp.xz,across=vec2(-dir.y,dir.x);
        float bankMeters=max(0.,-signedBank),channel=smoothstep(.45,9.,bankMeters);
        float sheltered=(1.-smoothstep(.8,9.,bankMeters))*smoothstep(.33,.73,channelNoise(here*.071));
        vec2 riverUv=(here-vec2(-2300.,-2900.))/vec2(2550.,3850.);
        float measuredDepth=0.,surveyWeight=0.;
        if(all(greaterThan(riverUv,vec2(0.))) && all(lessThan(riverUv,vec2(1.)))){
          measuredDepth=texture2D(bankMap,vec2(riverUv.x,1.-riverUv.y)).g;
          surveyWeight=texture2D(bankMap,vec2(riverUv.x*.5,1.-riverUv.y*.5)).b;
        }
        float surveyDepth=24.*measuredDepth*measuredDepth;
        float reach=channelNoise(here*.021+vec2(7.,-2.));
        vec2 velocity=dir*(.14+channel*(.86+.62*reach)-.48*sheltered);
        // Reach-wide median depth-averaged speeds from the USGS 10,000 cfs
        // scenario. Shallow runs flow faster than deep pools. Current direction
        // follows the game's registered channel; individual wavelets are visual.
        float rated=.114+.150*smoothstep(.177,.522,surveyDepth)
          +.200*smoothstep(.522,1.10,surveyDepth)+.295*smoothstep(1.10,2.263,surveyDepth)
          -.078*smoothstep(2.263,3.837,surveyDepth)-.175*smoothstep(3.837,6.169,surveyDepth)
          -.057*smoothstep(6.169,9.448,surveyDepth)-.030*smoothstep(9.448,13.845,surveyDepth);
        velocity=mix(velocity,dir*rated,surveyWeight);
        velocity+=across*sheltered*.22*sin(dot(here,vec2(.13,.087))-.53*clock);
        // Blend backtraced parcels while either phase rewinds. This follows
        // the surveyed bend without stretching the normal map over time.
        float phase=fract(clock*.15+channelNoise(here*.058)*.21),other=fract(phase+.5);
        float weight=abs(2.*phase-1.);
        vec2 p0=here-velocity*(phase-.5)*6.67,p1=here-velocity*(other-.5)*6.67;
        vec3 a=mix(texture2D(ripple,p0*.065).rgb,texture2D(ripple,p1*.065).rgb,weight)-.5;
        vec3 b=mix(texture2D(ripple,p0*.171+vec2(.32,.18)).rgb,texture2D(ripple,p1*.171+vec2(.32,.18)).rgb,weight)-.5;
        float smallWave=1.-smoothstep(.85,4.5,max(fwidth(here.x),fwidth(here.y)));
        float calmBench=mix(1.,.70+.34*smoothstep(1.,6.,surveyDepth),surveyWeight);
        float activity=(.38+.62*channel)*calmBench;
        vec3 wn=normalize(vec3((a.r+b.r*.52*smallWave)*.38*activity,1.,(a.g+b.g*.52*smallWave)*.38*activity));
        float riffles=smoothstep(.40,.79,reach)*channel;
        // Deep pools and protected shelves have fewer intersecting surface trains.
        riffles*=mix(1.,.12+.68*smoothstep(.35,.79,rated),surveyWeight);
        float seam=sin(dot(here,dir)*.79-clock*1.62+2.7*channelNoise(here*.20));
        float eddy=sin(dot(here,across)*1.24+dot(here,dir)*.25-clock*1.2);
        vec2 riffle=(dir*seam*(.019+.068*riffles)+across*eddy*(.019+.058*sheltered))*smallWave;
        wn=normalize(wn+vec3(riffle.x,0.,riffle.y));
        ${waterContact?`
        // The surveyed sandstone reach is sheltered. Small wakes peel off
        // the bank along the mapped local current and die out in the pool.
        float shelfContact=1.-smoothstep(120.,238.,length(here-vec2(-493.,-173.)));
        float workingBank=(1.-smoothstep(7.,21.,bankMeters))*shelfContact;
        float along=dot(here,dir);
        float source=channelNoise((here-velocity*1.4)*.048);
        float releaseAge=mod(clock+along*.15+1.3*source,
          ${atlas?'3.85+1.27*source+.35*smoothstep(2.,14.,bankMeters)':'4.15'});
        vec2 peel=waterContactBand(bankMeters-.35-releaseAge*1.19,.38,releaseAge,3.9,
          max(length(dFdx(here)),length(dFdy(here))));
        float seamGate=smoothstep(.18,.61,source);
        float av=dot(here,across);
        float seamDist=(bankMeters-4.2-.9*sin(along*.06-clock*.47))*.37;
        float slip=exp(-seamDist*seamDist);
        float shear=slip*smoothstep(.14,.81,.5+.5*sin(along*.55-clock*1.27+4.*source));
        vec2 bankSlope=across*(sin(av*.48+along*.34-clock*.88)*(.035+.065*shear)+peel.x*.29)
          +dir*peel.x*.096;
        wn=normalize(wn+vec3(bankSlope.x,0.,bankSlope.y)*workingBank*seamGate);
        `:''}
        ${atlas?`
        float watDistance=length(here-vec2(-493.,-173.));
        float waReach=(1.-smoothstep(115.,230.,watDistance))*(1.-smoothstep(5.,18.,bankMeters));
        float alongLane=dot(here,dir),lane=floor((alongLane+2.1*sin(alongLane*.072))/17.);
        float waSeed=waHash(vec2(lane,floor(here.x/22.)));
        float tracking=fract((clock+waSeed*5.)/(5.2+waSeed*3.8));
        float parcelAlong=alongLane/17.-lane;
        vec2 moving=waCell(vec2(parcelAlong-.27*tracking,
          .20+.046*bankMeters),${atlas.siteChoices.river_bank||atlas.choices.river_bank},waSeed);
        float softWater=1.-smoothstep(.38,1.55,max(length(dFdx(here)),length(dFdy(here))));
        float separated=moving.x*waReach*softWater*
          smoothstep(.03,.20,tracking)*(1.-smoothstep(.63,.99,tracking));
        wn=normalize(wn+vec3(across.x,0.,across.y)*separated*.29);
        `:''}
        vec3 refl=reflect(-eye,wn);refl.y=max(.015,refl.y);
        float fres=.026+.974*pow(1.-max(0.,dot(wn,eye)),4.3);
        vec3 reflected=canyonReflection(wp+vec3(0.,1.85,0.),refl);
        vec3 riverBody=mix(vec3(.105,.213,.185),vec3(.21,.31,.232),sunVisibility);
        riverBody*=.7+.58*lum(aerial);
        vec3 river=mix(riverBody,reflected,fres);
        ${waterContact?`
        vec3 shearGlint=max(reflected,riverBody*.99);
        river=mix(river,river*.71+.63*shearGlint,workingBank*seamGate*(peel.y*.73+shear*.23));
        `:''}
        // A current refracts the stationary bed. The camera sees farther into
        // clear shallows looking down than it does across the grazing surface.
        float shallows=(1.-smoothstep(2.,24.,-signedBank))*closeGround*(1.-surveyWeight);
        if(shallows>.001){
          float depth=clamp(.16-.093*signedBank,.12,2.1);
          vec3 transmitted=refract(-eye,wn,.7502);
          vec2 bottom=here+transmitted.xz*depth/max(.23,-transmitted.y),bedUv=bottom*.70;
          float bar=smoothstep(.28,.72,channelNoise(bottom*.105)+.12*(1.-channel));
          vec3 sandBed=texture2D(sand,bottom*.45).rgb*vec3(.90,.85,.70);
          vec3 bed=mix(gravel(bedUv)*vec3(.89,.94,.81),sandBed,.69*bar);
          vec3 bedTone=mix(vec3(.07,.105,.084),vec3(.50,.44,.31),smoothstep(.17,.74,lum(bed)));
          bed=mix(bed,bedTone,.45);
          vec3 micro=texture2D(pebbleNormal,bedUv).rgb*2.-1.;
          bed*=.72+.42*max(dot(normalize(vec3(micro.r,1.65,-micro.g)),sun),0.);
          float caustic=pow(clamp(1.-6.*abs(a.r-b.g),0.,1.),4.)*smallWave*sunVisibility;
          bed+=vec3(.18,.15,.081)*caustic*exp(-depth*.65);
          float clearView=pow(clamp(dot(eye,wn),0.,1.),.63)*exp(-depth*.43);
          vec3 clarity=mix(river,river*vec3(.66,1.03,.93)+vec3(.001,.033,.021),.7);
          vec3 clear=mix(clarity,bed,clamp(.17+1.16*clearView,0.,.95));
          river=mix(river,clear,shallows);
          float fringe=exp(-abs(signedBank-wash)*2.8)*smoothstep(.3,.75,channelNoise(here*.98)+.13*sin(shorePhase-clock));
          river+=fringe*vec3(.083,.076,.061);
        }
        if(surveyWeight>.002){
          // The 2014–16 USGS survey resolves asymmetric inner bars, scour pools
          // and patches of submerged vegetation below the regulated river.
          float waterDepth=surveyDepth;
          vec3 downRay=refract(-eye,wn,.7502);
          float inWater=waterDepth/max(.66,-downRay.y);
          vec2 refractedBed=here+downRay.xz*inWater;
          vec2 bedUv=(refractedBed-vec2(-2300.,-2900.))/vec2(2550.,3850.);
          vec2 quadrant=vec2(.5*bedUv.x,-.5*bedUv.y);
          float plant=texture2D(bankMap,quadrant+vec2(.5,1.)).b;
          float sandBank=texture2D(bankMap,quadrant+vec2(0.,.5)).b;
          float cobble=texture2D(bankMap,quadrant+vec2(.5,.5)).b;
          // Classes describe a bed patch, not the identity of each clast.
          // A sparse sand/gravel return retains some gravel and submerged growth.
          vec3 bedColor=mix(vec3(.48,.467,.377),vec3(.72,.654,.459),sandBank*.91);
          bedColor=mix(bedColor,vec3(.39,.391,.315),cobble*.88);
          float fineBed=1.-smoothstep(90.,225.,dist);
          // World-fixed coordinates keep adjacent flow cells on the same
          // sediment bed. Rotate ripple advection, never the absolute UV.
          vec2 bedAxes=refractedBed-vec2(-1000.,-1200.);
          float sway=.13*sin(bedAxes.x*1.7+clock*1.6+bedAxes.y*.4);
          float alongX=smoothstep(.15,.85,abs(dir.x));
          float carpet=mix(channelNoise(bedAxes.yx*vec2(.255,.78)),
                           channelNoise(bedAxes*vec2(.255,.78)),alongX);
          float patches=smoothstep(.23,.68,carpet);
          float cover=clamp(plant*(.39+.56*patches)+sandBank*.12*patches,0.,1.);
          bedColor=mix(bedColor,vec3(.219,.306,.135),cover);
          if(fineBed>.001 && inWater<7.5){
            vec2 grains=bedAxes*vec2(.27,.43);
            float sandTexture=lum(texture2D(sand,grains).rgb);
            vec2 gravelUv=refractedBed*(.43+.23*sandBank);
            vec3 clastPhoto=gravel(gravelUv);
            float stones=lum(clastPhoto);
            float fronds=mix(channelNoise(vec2(bedAxes.y*.98,(bedAxes.x+sway)*5.8)),
                             channelNoise(vec2(bedAxes.x*.98,(bedAxes.y+sway)*5.8)),alongX);
            float detail=mix(stones,sandTexture,.14+.68*sandBank);
            vec3 facet=texture2D(pebbleNormal,gravelUv).rgb*2.-1.;
            float pebbleRelief=.87+.29*max(dot(normalize(vec3(facet.r,.98,-facet.g)),sun),0.);
            float clasts=(1.-.72*sandBank)*(1.-.81*cover);
            float grainTone=clamp(.65+.80*detail+.64*cover*(fronds-.50),.50,1.38);
            // Preserve the photographed clast-to-clast color and size variation
            // in gravel shoals. Scale with refracted distance and mapped cover.
            vec3 stoneVariation=clamp(clastPhoto/max(stones,.1),vec3(.74),vec3(1.32));
            vec3 grainsColor=stoneVariation*mix(1.,clamp(stones*2.25,.38,1.65),.64*clasts);
            bedColor*=mix(vec3(1.),grainTone*mix(vec3(1.),grainsColor*pebbleRelief,clasts),fineBed);
          }
          float openSun=clamp(sunVisibility,0.,1.);
          vec3 skyFill=vec3(.45,.53,.56)*(.92+.42*openSky);
          vec3 wallBounce=plateau*vec3(.15,.105,.065)*(1.-openSky);
          vec3 bedLight=skyFill+wallBounce+openSun*vec3(.55,.466,.32);
          float lens=pow(clamp(1.-6.*abs(a.r-b.g),0.,1.),4.)*smallWave;
          bedColor=bedColor*bedLight*(1.+openSun*.18*lens*exp(-inWater*.62));
          // Beer-Lambert attenuation in wavelength bands. Red fades before
          // green on the sloping bench. At grazing angles the directionally
          // reflected real canyon remains dominant.
          vec3 transmission=exp(-inWater*vec3(.43,.203,.292));
          vec3 deepWater=mix(vec3(.058,.171,.165),vec3(.106,.271,.204),openSun);
          vec3 submerged=mix(deepWater,bedColor,transmission);
          vec3 surveyedRiver=mix(submerged,reflected,fres);
          ${waterContact?`surveyedRiver=mix(surveyedRiver,
            surveyedRiver*.72+.62*shearGlint,workingBank*seamGate*(peel.y*.66+shear*.22));`:''}
          river=mix(river,surveyedRiver,surveyWeight);
        }
        float glint=pow(max(dot(wn,normalize(sun+eye)),0.),155.);
        river+=vec3(.67,.48,.25)*glint*sunVisibility;
        ${waterContact?`
        float splitFilm=workingBank*seamGate*(shear*.64+peel.y*.49);
        vec3 skyEdge=max(reflected,vec3(.12,.24,.26));
        river+=skyEdge*splitFilm*.16;
        `:''}
        float lace=mix(channelNoise(p0*.90),channelNoise(p1*.90),weight);
        float broken=1.-smoothstep(.022,.123,abs(lace-.54));
        float foam=broken*(sheltered*.63+riffles*.11)*smoothstep(.44,.69,channelNoise(here*.23))*smallWave;
        // The flat regulated reach rarely carries persistent white foam.
        // Retain sparse surface streaks against rough, shallow banks.
        float marginBreak=(1.-smoothstep(.5,4.2,bankMeters))*(1.-smoothstep(.45,1.8,surveyDepth));
        foam*=mix(1.,.038+.70*marginBreak,surveyWeight);
        river=mix(river,vec3(.73,.74,.65),foam);
        ${atlas?`
        river+=max(reflected,vec3(.12,.25,.24))*separated*.26;
        `:''}
        color=mix(color,river,wet);
      }
      vec3 haze=mix(vec3(.67,.625,.64),vec3(.85,.70,.60),pow(max(dot(-eye,sun),0.),3.));
      float dusty=.000030+.000041*exp(-max(0.,wp.y+cameraPosition.y-50.)/380.);
      color=mix(color,haze,1.-exp(-dist*dusty));gl_FragColor=vec4(color,1.);
    }`;
  const scarp=texture('canyon-scarp.webp',true);
  const wallRelief=scannedRock?closeRock.canyonTexture(THREE):texture('canyon-scarp-relief.webp',true);
  function material(file){
    return new THREE.ShaderMaterial({extensions:{derivatives:true},uniforms:{...shared,strata:{value:scarp},wallRelief:{value:wallRelief},photo:{value:texture(file)}},vertexShader:vertex,fragmentShader:fragment});
  }
  const seams=new Map();
  function joinEdge(mat,pos,norm,uv,first,stride,steps,depth){
    let data=seams.get(mat);
    if(!data){data={p:[],n:[],uv:[],ix:[]};seams.set(mat,data);}
    const firstVertex=data.p.length/3;
    for(let j=0;j<=steps;j++){
      const i=first+j*stride,x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
      data.p.push(x,y,z,x,y-depth,z);
      for(let k=0;k<2;k++){data.n.push(norm.getX(i),norm.getY(i),norm.getZ(i));data.uv.push(uv.getX(i),uv.getY(i));}
      if(j>0){
        const b=firstVertex+j*2;
        data.ix.push(b-2,b-1,b,b,b-1,b+1,b,b-1,b-2,b+1,b-1,b);
      }
    }
  }
  function patch(left,north,width,steps,mat,photoX,photoZ,photoSize){
    const nearbySurvey=landmarkTerrain||shelfSurvey;
    if(nearbySurvey){
      const [l,t,r,b]=nearbySurvey.rect;
      if(left<r&&left+width>l&&north<b&&north+width>t)landmarkGroundMaterials.add(mat);
    }

    const geo=new THREE.PlaneGeometry(width,width,steps,steps);
    geo.rotateX(-Math.PI/2);const pos=geo.attributes.position,uv=geo.attributes.uv,normal=geo.attributes.normal;
    const d=width/steps*.5;
    for(let i=0;i<pos.count;i++){
      const x=pos.getX(i)+left+width/2,z=pos.getZ(i)+north+width/2;
      pos.setXYZ(i,x,elevation(x,z),z);
      uv.setXY(i,(x-photoX)/photoSize,1-(z-photoZ)/photoSize);
      const nx=elevation(x-d,z)-elevation(x+d,z),nz=elevation(x,z-d)-elevation(x,z+d);
      const len=Math.hypot(nx,2*d,nz);normal.setXYZ(i,nx/len,2*d/len,nz/len);
    }
    // At a change of mesh spacing the two edge polylines can differ on a
    // steep cliff. Carry the exposed edge down behind its neighbour so the
    // sky never leaks through a survey tile.
    function depthAt(coordinate,begin,end,axis){
      if(Math.abs(coordinate)===3200&&begin>=-3200&&end<=3200)return 160;
      if(axis==='x'&&(coordinate===-1600||coordinate===0)&&begin>=-800&&end<=800)return 90;
      if(axis==='z'&&Math.abs(coordinate)===800&&begin>=-1600&&end<=0)return 90;
      return 0;
    }
    const edges=[
      [depthAt(left,north,north+width,'x'),0,steps+1],
      [depthAt(left+width,north,north+width,'x'),steps,steps+1],
      [depthAt(north,left,left+width,'z'),0,1],
      [depthAt(north+width,left,left+width,'z'),steps*(steps+1),1]
    ];
    for(const [depth,first,stride] of edges)if(depth)joinEdge(mat,pos,normal,uv,first,stride,steps,depth);
    geo.computeBoundingSphere();const tile=new THREE.Mesh(geo,mat);
    tile.userData.terrainCaster=true;
    scene.add(tile);
  }
  const horizon=material('canyon-horizon.webp');
  for(let j=0;j<8;j++)for(let i=0;i<8;i++){
    if((i===3||i===4)&&(j===3||j===4))continue;
    patch(-12800+i*3200,-12800+j*3200,3200,136,horizon,-12800,-12800,25600);
  }
  for(let j=0;j<4;j++)for(let i=0;i<4;i++){
    const mat=material('canyon-a'+(j*4+i)+'.webp');
    const px=-3200+i*1600,pz=-3200+j*1600;
    for(let b=0;b<2;b++)for(let a=0;a<2;a++){
      const x=px+a*800,z=pz+b*800;
      const finePatch=x>=-1600&&x<0&&z>=-800&&z<800;
      patch(x,z,800,finePatch?160:64,mat,px,pz,1600);
    }
  }
  const joins=new THREE.Group();joins.name='Survey tile joins';
  for(const [mat,data] of seams){
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(data.p,3));
    geo.setAttribute('normal',new THREE.Float32BufferAttribute(data.n,3));
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(data.uv,2));geo.setIndex(data.ix);
    const seam=new THREE.Mesh(geo,mat);
    seam.userData.terrainCaster=true;
    joins.add(seam);
  }
  scene.add(joins);
  // The immediate basin is drawn as two triangles per height-field cell.
  // Place loose rocks on the visible triangles even where the cliff toe
  // falls between DEM samples.
  function rockSurface(x,z){
    const step=x>=-1600&&x<0&&z>=-800&&z<800?5:12.5;
    const x0=Math.floor(x/step)*step,z0=Math.floor(z/step)*step;
    const u=(x-x0)/step,v=(z-z0)/step;
    const b=elevation(x0+step,z0),c=elevation(x0,z0+step);
    if(u+v<=1)return (1-u-v)*elevation(x0,z0)+u*b+v*c;
    return (u+v-1)*elevation(x0+step,z0+step)+(1-v)*b+(1-u)*c;
  }
  // Eroded beds emerge from the mapped sandstone footwall. The same triangles
  // paint a local height grid for clearance near the overhanging rims.
  const outcrops=[];
  const outcropMaterial=new THREE.ShaderMaterial({uniforms:shared,
    vertexShader:'varying vec3 p,n;varying float recess;attribute float cavity;void main(){p=position;n=normal;recess=cavity;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 p,n;varying float recess;uniform sampler2D crossbeds,terrainField,strata,grain;uniform vec3 sun;`+localBeds+`
      void main(){
        vec3 N=normalize(n);vec3 weights=pow(abs(N),vec3(4.));weights/=max(.001,weights.x+weights.y+weights.z);
        float bedding=p.y+.31*sin(p.z*.17)+.53*sin(p.z*.042+p.x*.12);
        vec3 sides=texture2D(strata,vec2(p.z*.105,bedding*.23)).rgb*weights.x+
                   texture2D(strata,vec2(p.x*.105,bedding*.23)).rgb*weights.z;
        vec3 cap=texture2D(grain,p.xz*.18).rgb;
        float luma=dot(sides+cap*weights.y,vec3(.299,.587,.114));
        float vein=.5+.5*sin(bedding*4.4+.7*sin(p.z*.36)+2.*luma);
        vec3 stone=mix(vec3(.41,.255,.160),vec3(.80,.539,.339),smoothstep(.17,.86,luma));
        vec3 lamina=bandScan(vec2((p.x*.76+p.z*.65)*.085,bedding*.12));
        stone*=clamp(.65+.55*lamina.r+.26*lamina.g,.61,1.24);
        vec4 illum=texture2D(terrainField,vec2(p.x,-p.z)/6400.+.5);
        stone*=mix(vec3(.63,.70,.83),vec3(1.15,1.02,.91),illum.b);
        float direct=max(dot(sun,N),0.);stone*=.89+.28*direct+.08*N.y-.55*recess;
        stone+=vec3(.050,.033,.02)*pow(vein,7.)*max(0.,1.-N.y);
        float haze=1.-exp(-distance(p,cameraPosition)*.000055);gl_FragColor=vec4(mix(stone,vec3(.69,.60,.58),haze),1.);
      }`});
  function outcrop(x,z,halfLength,width,height,alcove,seed){
    const sections=48,spans=64,row=spans+1,vertices=[],cavities=[],indices=[];
    const reach=width*2+4+(alcove?halfLength*.82:0);
    const minX=Math.floor(x-reach),maxX=Math.ceil(x+reach);
    const minZ=Math.floor(z-halfLength-1),maxZ=Math.ceil(z+halfLength+1);
    const cols=maxX-minX+1,grid=new Float32Array(cols*(maxZ-minZ+1));grid.fill(-Infinity);
    for(let j=0;j<=sections;j++)for(let i=0;i<=spans;i++){
      const u=i/spans*2-1,v=j/sections;
      const along=z+halfLength*u;
      const envelope=Math.pow(Math.max(0,1-u*u),.61);
      const edge=x+2.2*Math.sin(u*4.5+seed)+.73*Math.sin(u*13.7)+u*(alcove?halfLength*.82:1.8);
      const base=surveyedElevation(edge+width*.37,along)-1.7;
      const arch=Math.exp(-Math.pow((u-.08)/.43,4));
      const joint=Math.pow(.5+.5*Math.sin(u*38.+seed+.6*Math.cos(u*20.)),11.);
      let across,above,recess;
      if(v<.78){
        const f=v/.78;
        const pocket=alcove?arch*Math.sin(Math.PI*Math.pow(f,.91))**.49:0;
        const bed=.5+.5*Math.tanh(3.2*Math.sin(f*3.6*Math.PI+u*.77+.18*Math.sin(u*7.8))-.55);
        across=width*(.56+.13*bed+(.16+.025*Math.sin(f*22.+seed))*Math.sin(u*5.+seed)-.65*pocket-.12*joint-.018*Math.cos(u*73.+f));
        above=f;recess=clamp(pocket+.27*(1-bed),0,1);
      }else{
        const t=(v-.78)/.22;
        across=width*(.62-1.98*t+.13*Math.sin(u*5.+seed)-.08*joint);
        above=1.+t*.13+.13*Math.sin(t*Math.PI);recess=0;
      }
      const px=edge+across*envelope;
      const anchor=Math.min(0,elevation(px,along)-1.4-base);
      vertices.push(px,base+anchor*(1-smoothstep(v,0,.32))+envelope*height*above,along);
      cavities.push(recess);
      if(i<spans&&j<sections){const k=j*row+i;indices.push(k,k+row,k+1,k+row,k+row+1,k+1);}
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    geo.setAttribute('cavity',new THREE.Float32BufferAttribute(cavities,1));geo.setIndex(indices);geo.computeVertexNormals();
    const mesh=new THREE.Mesh(geo,outcropMaterial);
    mesh.userData.terrainCaster=true;
    scene.add(mesh);
    for(let t=0;t<indices.length;t+=3){
      const a=indices[t]*3,b=indices[t+1]*3,c=indices[t+2]*3;
      const ax=vertices[a],az=vertices[a+2],bx=vertices[b],bz=vertices[b+2],cx=vertices[c],cz=vertices[c+2];
      const determinant=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);
      if(Math.abs(determinant)<1e-6)continue;
      for(let iz=Math.ceil(Math.min(az,bz,cz));iz<=Math.floor(Math.max(az,bz,cz));iz++){
        for(let ix=Math.ceil(Math.min(ax,bx,cx));ix<=Math.floor(Math.max(ax,bx,cx));ix++){
          const first=((bz-cz)*(ix-cx)+(cx-bx)*(iz-cz))/determinant;
          const second=((cz-az)*(ix-cx)+(ax-cx)*(iz-cz))/determinant;
          if(first<0||second<0||first+second>1)continue;
          const index=(iz-minZ)*cols+ix-minX;
          grid[index]=Math.max(grid[index],first*vertices[a+1]+second*vertices[b+1]+(1-first-second)*vertices[c+1]);
        }
      }
    }
    outcrops.push({minX,maxX,minZ,maxZ,cols,grid});
  }
  if(!shelfSurvey){
    outcrop(-478,-140,34,7.5,5,false,1.3);
    outcrop(-489,-188,25,9,5.7,false,2.1);
  }
  outcrop(-527,-288,25,11,13,true,1.0);
  function clearance(x,z){
    let surface=elevation(x,z);
    for(const b of outcrops){
      if(x<b.minX||x>b.maxX||z<b.minZ||z>b.maxZ)continue;
      surface=Math.max(surface,b.grid[(Math.round(z)-b.minZ)*b.cols+Math.round(x)-b.minX]);
    }
    return surface;
  }
  // The overlook stands on the eastern rim. Fly just above its rock lip,
  // looking down into both arms of the Colorado as they wrap the promontory.
  const spawn={x:45,z:76,y:elevation(45,76)+72,yaw:1.38};
  const ridge={x:-425,z:-2450,y:elevation(-425,-2450)+90,yaw:1.54};
  const shore={x:-441,z:-76,y:elevation(-441,-76)+7.2,yaw:.24};
  let landformMesh=null;
  if(landmarkTerrain&&landmarkGroundMaterials.size){
    const reference=landmarkGroundMaterials.values().next().value;
    const [left,top,right,bottom]=landmarkTerrain.spec.holes[0];
    // The alcove stays under its native five-metre triangles. At the open
    // edge, match those exact triangles at every surveyed perimeter station.
    function adjacentGround(x,z){
      const vertical=(x===left||x===right)&&z>=top&&z<=bottom;
      const horizontal=(z===top||z===bottom)&&x>=left&&x<=right;
      return vertical||horizontal?rockSurface(x,z):nativeElevation(x,z);
    }
    landformMesh=landmarkTerrain.add(THREE,scene,reference,adjacentGround,texture);
    // A ten-centimetre underlap covers multisampled edge fragments.
    for(const source of landmarkGroundMaterials)landmarkTerrain.maskOriginal(source,.10);
  }
  if(shelfSurvey){
    const surface=landmarkTerrain?.surfacePatch(-506,-112,131,nativeElevation);
    const oldSkin=(x,z)=>surface?.(x,z)??surroundingGround(x,z);
    shelfSurvey.add(THREE,scene,horizon,oldSkin,texture);
    landformMesh?.traverse(o=>{if(o.isMesh)shelfSurvey.maskOriginal(o.material);});
    if(!landmarkTerrain)for(const source of landmarkGroundMaterials)shelfSurvey.maskOriginal(source);
  }
  // Merged regional specimens use absolute local positions. Sample the same
  // four-metre surveyed horizon and reflected bank light as their intact bed.
  function lightLooseSandstone(shader){
    shader.uniforms.rockHorizon=shared.terrainField;
    shader.uniforms.rockBank=shared.bankRadiance;
    shader.vertexShader='uniform sampler2D rockHorizon,rockBank; varying vec4 rockSite; varying float rockSun;\n'+
      shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        vec2 stoneSite=vec2(position.x,-position.z)/6400.+.5;
        float insideSite=1.-smoothstep(2960.,3195.,max(abs(position.x),abs(position.z)));
        rockSun=mix(1.,texture2D(rockHorizon,stoneSite).b,insideSite);
        rockSite=texture2D(rockBank,stoneSite);`);
    shader.fragmentShader='varying vec4 rockSite; varying float rockSun;\n'+
      shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
        reflectedLight.directDiffuse*=rockSun;
        reflectedLight.directSpecular*=rockSun;
        vec3 openSky=vec3(.48,.57,.70)*(.71+.29*rockSite.a);
        vec3 bankBounce=vec3(.13,.053,.024)*(1.-rockSite.a);
        vec3 indirect=mix(openSky+bankBounce,vec3(1.),rockSun);
        reflectedLight.indirectDiffuse*=indirect;
        reflectedLight.indirectSpecular*=indirect;`);
  }
  return {landformMesh,height:elevation,elevation,rockSurface,surveyedShelf,lightLooseSandstone,rockLight:shared.terrainField,clearance,spawn,launches:{lake:spawn,ridge,shore,wall:{x:-920,y:67.814,z:-72,yaw:1.7984}},trees:[],
    skyTexture,sunDirection:sun,altitudeOffset:950,bounds:{minX:-2950,maxX:2950,minZ:-2950,maxZ:2950},
    landmarks:[{name:'Horseshoe Bend',x:-925,z:-235},{name:'Horseshoe Bend Overlook',x:0,z:80},
      {name:'Colorado River',x:-950,z:-2450},
      {name:'Horseshoe Bend sandbar',x:-920,z:218,discoveryRadius:82,
        approach:[-825,218,-1001,175,16,0,29]},
      {name:'Glen Canyon Rim',x:-1830,z:500},
      {name:'Sandstone shelves',x:-478,z:-140,discoveryRadius:40},{name:'Riverbank alcove',x:-527,z:-288,discoveryRadius:35}],
    update(dt,elapsed){time.value=elapsed;}
  };
};
