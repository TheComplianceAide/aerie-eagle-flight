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
    if(radius>=3200)return outer(x,z);
    let h=basin(x,z);
    if(radius>3060)return lerp(h,outer(x,z),smoothstep(radius,3060,3200));
    const inset=Math.min(x+1600,-x,800-Math.abs(z));
    return inset>0 ? lerp(h,fine(x,z),smoothstep(inset,0,32)) : h;
  }
  function elevation(x,z) {
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
    crossbeds:{value:texture('canyon-crossbeds.webp',true)},
    strata:{value:texture('cliff-strata.jpg',true)},grain:{value:texture('rock.jpg',true)},
    flow:{value:texture('canyon-flow.webp')},ripple:{value:texture('waternormals.jpg',true)},
    sand:{value:texture('shore-sand.webp',true)},pebbles:{value:texture('shore-pebbles.webp',true)},
    pebbleNormal:{value:texture('shore-pebbles-normal.webp',true)},bankMap:{value:texture('habitat-canyon.png')},
    panorama:{value:skyTexture},sun:{value:sun},clock:time
  };
  // A mip of the packed elevation can bridge a river bank. Keep each traced
  // sample on the native four-metre field, using interpolation within that cell.
  shared.terrainField.value.minFilter=THREE.LinearFilter;
  shared.terrainField.value.generateMipmaps=false;
  shared.crossbeds.value.wrapS=shared.crossbeds.value.wrapT=THREE.MirroredRepeatWrapping;
  const vertex=`varying vec3 wp,n;varying vec2 tc;
    void main(){wp=position;n=normal;tc=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
  const fragment=`
    uniform sampler2D terrainField,bankRadiance,crossbeds;
    uniform sampler2D photo,strata,grain,flow,ripple,panorama,sand,pebbles,pebbleNormal,bankMap;
    uniform vec3 sun;uniform float clock;varying vec2 tc;varying vec3 wp,n;
    `+skyColor+`
    float lum(vec3 c){return dot(c,vec3(.299,.587,.114));}
    // Local photographs are measured in metres. Rotate alternate samples to
    // break up the repetition across broad bars, retaining the pebble scale.
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
      vec3 aerial=texture2D(photo,tc).rgb;
      // Recover mineral albedo inside shadows in the midday source photograph.
      // Cast the current shadow from the sunset horizon map below.
      float oldShadow=(1.-smoothstep(.055,.21,lum(aerial)))*smoothstep(.12,.65,1.-normal.y);
      float neutral=smoothstep(-.025,.10,aerial.r-aerial.b);
      aerial=mix(aerial,mix(vec3(.28,.182,.133),vec3(.42,.28,.194),lum(aerial)*4.),oldShadow*(.51+.39*neutral));
      vec2 flowUv=vec2(.5+wp.x/6400.,.5-wp.z/6400.);
      vec3 hyd=texture2D(flow,clamp(flowUv,0.,1.)).rgb;
      float wet=hyd.r*(1.-smoothstep(3130.,3200.,max(abs(wp.x),abs(wp.z))));
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
      if(face>.05 && dist<1100.){
        vec3 macroRock=mix(texture2D(strata,xuv*.146+vec2(.3,.2)).rgb,texture2D(strata,zuv*.146).rgb,sideMix);
        vec3 fracture=mix(texture2D(grain,xuv*.62).rgb,texture2D(grain,zuv*.62).rgb,sideMix);
        float fissure=smoothstep(.15,.79,lum(macroRock))*.52+.29*lum(fracture)+.19*beds;
        vec3 wall=mix(vec3(.30,.17,.116),vec3(.78,.516,.347),fissure);
        wall*=.64+.35*smoothstep(.07,.5,lum(aerial))+.20*exposure;
        dry=mix(dry,wall,face*(1.-smoothstep(250.,1050.,dist))*.84);
      }
      float signedBank=(texture2D(bankMap,clamp(flowUv,0.,1.)).r-.5)*96.;
      float closeGround=1.-smoothstep(20.,180.,dist);
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
      float sunVisibility=mix(1.,valleyLight.b,region);
      float openSky=mix(1.,texture2D(bankRadiance,clamp(flowUv,0.,1.)).a,region);
      if(face>.025){
        // The sloping sets are sampled in the cliff plane, preserving the
        // distinction between individual fine laminae and larger dune beds.
        float dip=wp.y+.072*wp.x-.065*wp.z+shift*1.7+longWave*.75;
        vec2 a=vec2(wp.z,dip)*vec2(.030,.048),b=vec2(-wp.x,dip)*vec2(.030,.048);
        vec3 series=mix(texture2D(crossbeds,a).rgb,texture2D(crossbeds,b).rgb,sideMix);
        vec3 large=mix(texture2D(crossbeds,a*.238+.32).rgb,texture2D(crossbeds,b*.238+.32).rgb,sideMix);
        float ledge=clamp(.50+.91*(series.r-.50)+.66*(large.g-.5)+.55*(series.g-.5),.03,.95);
        float varnish=smoothstep(.22,.63,large.b)*smoothstep(.30,.63,series.b);
        vec3 pigment=mix(vec3(.49,.274,.178),vec3(.84,.59,.389),ledge);
        pigment=mix(pigment,pigment*vec3(.53,.60,.66),varnish*.75);
        pigment*=.86+.30*smoothstep(.05,.61,lum(aerial));
        dry=mix(dry,pigment,face*(.94-.46*smoothstep(1300.,6100.,dist)));
      }
      float incidence=max(0.,dot(normal,sun));
      // Sky scatter and light bouncing off the opposite warm wall both reach
      // the canyon floor during sunset, even when the rim blocks the sun.
      vec3 indirect=vec3(.61,.69,.82)*(.75+.25*openSky)+vec3(.14,.071,.032)*(1.-openSky);
      vec3 sunward=vec3(.57,.35,.17)*(.27+.73*sqrt(incidence))*sunVisibility;
      dry*=indirect+sunward;
      vec3 color=dry;
      if(wet>.002){
        vec2 dir=normalize((hyd.gb-.5)*2.+vec2(.0001));
        vec2 here=wp.xz;
        vec3 a=texture2D(ripple,(here-dir*clock*.95)*.030).rgb-.5;
        vec3 b=texture2D(ripple,(here-dir*clock*1.75+vec2(clock*.09,0.))*.075).rgb-.5;
        float smallWave=1.-smoothstep(.85,4.5,max(fwidth(here.x),fwidth(here.y)));
        vec3 wn=normalize(vec3((a.r+b.r*.36*smallWave)*.25,1.,(a.g+b.g*.36*smallWave)*.25));
        vec3 refl=reflect(-eye,wn);refl.y=max(.015,refl.y);
        float fres=.026+.974*pow(1.-max(0.,dot(wn,eye)),4.3);
        vec3 reflected=canyonReflection(wp+vec3(0.,1.85,0.),refl);
        vec3 riverBody=mix(vec3(.105,.213,.185),vec3(.21,.31,.232),sunVisibility);
        riverBody*=.7+.58*lum(aerial);
        vec3 river=mix(riverBody,reflected,fres);
        // A current refracts the stationary bed. The camera sees farther into
        // clear shallows looking down than it does across the grazing surface.
        float shallows=(1.-smoothstep(2.,24.,-signedBank))*closeGround;
        if(shallows>.001){
          vec2 surfaceSlope=wn.xz;
          float depth=clamp(.16-.093*signedBank,.12,2.1);
          vec2 bedUv=(here+surfaceSlope*depth*.95-eye.xz*depth*.47)*.70;
          vec3 bed=gravel(bedUv)*vec3(.86,.96,.84);
          vec3 bedTone=mix(vec3(.07,.105,.084),vec3(.50,.44,.31),smoothstep(.17,.74,lum(bed)));
          bed=mix(bed,bedTone,.45);
          vec3 micro=texture2D(pebbleNormal,bedUv).rgb*2.-1.;
          bed*=.72+.42*max(dot(normalize(vec3(micro.r,1.65,-micro.g)),sun),0.);
          float caustic=pow(clamp(1.-6.*abs(a.r-b.g),0.,1.),4.);
          bed+=vec3(.16,.16,.095)*caustic;
          float clearView=pow(clamp(dot(eye,wn),0.,1.),.63)*exp(-depth*.43);
          vec3 clarity=mix(river,river*vec3(.66,1.03,.93)+vec3(.001,.033,.021),.7);
          vec3 clear=mix(clarity,bed,clamp(.17+1.16*clearView,0.,.95));
          river=mix(river,clear,shallows);
          float fringe=exp(-abs(signedBank)*.65)*(.45+.55*sin(here.x*1.5+here.y*1.13+clock*2.5+4.*a.g));
          river+=fringe*vec3(.083,.076,.061);
        }
        float glint=pow(max(dot(wn,normalize(sun+eye)),0.),155.);
        river+=vec3(.67,.48,.25)*glint*sunVisibility;
        color=mix(color,river,wet);
      }
      vec3 haze=mix(vec3(.67,.625,.64),vec3(.85,.70,.60),pow(max(dot(-eye,sun),0.),3.));
      float dusty=.000045+.000070*exp(-max(0.,wp.y+cameraPosition.y-50.)/380.);
      color=mix(color,haze,1.-exp(-dist*dusty));gl_FragColor=vec4(color,1.);
    }`;
  function material(file){
    return new THREE.ShaderMaterial({extensions:{derivatives:true},uniforms:{...shared,photo:{value:texture(file)}},vertexShader:vertex,fragmentShader:fragment});
  }
  function patch(left,north,width,steps,mat,photoX,photoZ,photoSize){
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
    geo.computeBoundingSphere();scene.add(new THREE.Mesh(geo,mat));
  }
  const horizon=material('canyon-horizon.webp');
  for(let j=0;j<8;j++)for(let i=0;i<8;i++){
    if((i===3||i===4)&&(j===3||j===4))continue;
    patch(-12800+i*3200,-12800+j*3200,3200,48,horizon,-12800,-12800,25600);
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
  // Eroded beds emerge from the mapped sandstone footwall. The same triangles
  // paint a local height grid for clearance near the overhanging rims.
  const outcrops=[];
  const outcropMaterial=new THREE.ShaderMaterial({uniforms:shared,
    vertexShader:'varying vec3 p,n;varying float recess;attribute float cavity;void main(){p=position;n=normal;recess=cavity;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 p,n;varying float recess;uniform sampler2D crossbeds,terrainField,strata,grain;uniform vec3 sun;
      void main(){
        vec3 N=normalize(n);vec3 weights=pow(abs(N),vec3(4.));weights/=max(.001,weights.x+weights.y+weights.z);
        float bedding=p.y+.31*sin(p.z*.17)+.53*sin(p.z*.042+p.x*.12);
        vec3 sides=texture2D(strata,vec2(p.z*.105,bedding*.23)).rgb*weights.x+
                   texture2D(strata,vec2(p.x*.105,bedding*.23)).rgb*weights.z;
        vec3 cap=texture2D(grain,p.xz*.18).rgb;
        float luma=dot(sides+cap*weights.y,vec3(.299,.587,.114));
        float vein=.5+.5*sin(bedding*4.4+.7*sin(p.z*.36)+2.*luma);
        vec3 stone=mix(vec3(.41,.255,.160),vec3(.80,.539,.339),smoothstep(.17,.86,luma));
        vec3 lamina=texture2D(crossbeds,vec2((p.x*.76+p.z*.65)*.085,bedding*.12)).rgb;
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
    const mesh=new THREE.Mesh(geo,outcropMaterial);scene.add(mesh);
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
  outcrop(-478,-140,34,7.5,5,false,1.3);
  outcrop(-489,-188,25,9,5.7,false,2.1);
  outcrop(-527,-288,25,11,13,true,1.0);
  function clearance(x,z){
    let surface=elevation(x,z);
    for(const b of outcrops){
      if(x<b.minX||x>b.maxX||z<b.minZ||z>b.maxZ)continue;
      surface=Math.max(surface,b.grid[(Math.round(z)-b.minZ)*b.cols+Math.round(x)-b.minX]);
    }
    return surface;
  }
  const spawn={x:45,z:76,y:elevation(45,76)+72,yaw:1.38};
  const ridge={x:-425,z:-2450,y:elevation(-425,-2450)+90,yaw:1.54};
  const shore={x:-441,z:-76,y:elevation(-441,-76)+7.2,yaw:.24};
  return {height:elevation,elevation,clearance,spawn,launches:{lake:spawn,ridge,shore},trees:[],
    skyTexture,sunDirection:sun,altitudeOffset:950,bounds:{minX:-2950,maxX:2950,minZ:-2950,maxZ:2950},
    landmarks:[{name:'Horseshoe Bend',x:-925,z:-235},{name:'Horseshoe Bend Overlook',x:0,z:80},
      {name:'Colorado River',x:-950,z:-2450},{name:'Glen Canyon Rim',x:-1830,z:500},
      {name:'Sandstone shelves',x:-478,z:-140,discoveryRadius:40},{name:'Riverbank alcove',x:-527,z:-288,discoveryRadius:35}],
    update(dt,elapsed){time.value=elapsed;}
  };
};
