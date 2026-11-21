/* Regional near-flight vegetation. Distances and signed cell coordinates are local metres.
   The far forest stays with each world's original renderer. A coverage texture identifies
   individual original roots replaced by finished, visible specimen geometry. */
(() => {
  const CELL = 128, TAU = Math.PI * 2, maskSide = 256;
  const key = (x,z) => x + ',' + z;
  const clamp = (n,lo,hi) => Math.min(hi,Math.max(lo,n));
  const rangeFade = (a,b,n) => {
    const t=clamp((n-a)/(b-a),0,1);
    return t*t*(3-2*t);
  };
  const urlFor = name => {
    const path='canopy-data/'+name;
    return window.aerieAssetURL?.(path)||path;
  };
  async function unpack(name,signal) {
    const response=await fetch(urlFor(name),{signal});
    if(!response.ok)throw Error('Canopy asset '+name+' returned '+response.status);
    if(typeof DecompressionStream==='function' && response.body){
      return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    }
    if(window.pako)return window.pako.inflate(new Uint8Array(await response.arrayBuffer())).buffer;
    throw Error('Gzip decoding is unavailable for canopy assets');
  }
  const shadowGLSL=`
    uniform sampler2D regionalCanopyDepth;
    uniform mat4 regionalCanopyTransform;
    uniform float regionalCanopyShadowOn;
    uniform vec2 regionalCanopyTexel;
    float regionalCanopySun(vec3 point,float bias){
      if(regionalCanopyShadowOn<.5)return 1.;
      vec3 uv=(regionalCanopyTransform*vec4(point,1.)).xyz*.5+.5;
      float margin=min(min(uv.x,1.-uv.x),min(uv.y,1.-uv.y));
      if(margin<=.002||uv.z<=0.||uv.z>=1.)return 1.;
      vec2 d=regionalCanopyTexel*.85;
      float receiver=uv.z-bias;
      float lit=step(receiver,texture2D(regionalCanopyDepth,uv.xy+vec2(-d.x,-d.y)).r)
               +step(receiver,texture2D(regionalCanopyDepth,uv.xy+vec2(d.x,-d.y)).r)
               +step(receiver,texture2D(regionalCanopyDepth,uv.xy+vec2(-d.x,d.y)).r)
               +step(receiver,texture2D(regionalCanopyDepth,uv.xy+d).r);
      return mix(1.,lit*.25,smoothstep(.015,.1,margin));
    }`;
  const screenHash='fract(52.9829189*fract(dot(floor(gl_FragCoord.xy),vec2(.06711056,.00583715))))';
  const branchCoverage=window.aerieCanopyBranchCoverage=`
    float branchHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float branchCoverage(vec3 local){
      vec2 p=local.xz*8.+local.y*vec2(13.,-17.);
      vec2 base=floor(p),f=fract(p);f=f*f*(3.-2.*f);
      float noise=mix(mix(branchHash(base),branchHash(base+vec2(1.,0.)),f.x),
                      mix(branchHash(base+vec2(0.,1.)),branchHash(base+vec2(1.)),f.x),f.y);
      return clamp((noise-.20)*1.34+.11*local.y,.001,.999);
    }`;
  const closeBoughWind=`
    #ifdef CLOSE_BOUGH_WIND
    void bendCloseBough(inout vec3 p,inout vec3 n,vec2 offset,float h,float height,float phase,vec2 front){
      float arm=length(offset);
      float flex=smoothstep(.06,.84,arm/max(.32,.24*height))*smoothstep(.015,.24,h);
      vec2 across=vec2(-canopyDownwind.y,canopyDownwind.x);
      float along=dot(offset,canopyDownwind),side=dot(offset,across);
      // The field supplies both current wind pressure and its recent history.
      // Outer limbs take the leading gust first and spring back in its wake.
      float load=clamp(.65*front.x+.35*front.y,0.,1.);
      float impulse=clamp(front.x-front.y,-.5,.5);
      float spring=sin(2.07*clock+phase+4.1*h-.48*along+.29*side);
      float turn=flex*side/max(.15,arm)*(.007+.103*load+.048*impulse+(.005+.038*load)*spring);
      vec2 rot=vec2(1.,turn)*inversesqrt(1.+turn*turn);
      p.xz+=offset*(rot.x-1.)+vec2(offset.y,-offset.x)*rot.y;
      n.xz=n.xz*rot.x+vec2(n.z,-n.x)*rot.y;
      float pitch=flex*(.004+.044*load+.031*impulse+(.003+.024*load)*spring);
      // A short wave travels through the connected shoot. Sampling position
      // continuously keeps coincident leaf bases and fine woody forks welded.
      #ifdef REGIONAL_BROADLEAF
      const float flutterHz=7.4,flutterSize=.014;
      #else
      const float flutterHz=5.3,flutterSize=.006;
      #endif
      vec2 wave=canopyDownwind*6.2+across*3.7;
      float ripple=clock*flutterHz+phase*2.7-dot(offset,wave)+h*height*3.1;
      float amplitude=flex*min(1.,height*.6)*(.001+flutterSize*load);
      p.y+=-along*pitch+amplitude*sin(ripple);
      // Tilt the surface with the animated shoot. Its sunward and shaded
      // faces now exchange light without a change to the world exposure.
      float gradient=amplitude*cos(ripple);
      n.xz+=n.y*(canopyDownwind*pitch+wave*gradient);
      n.y*=1.-3.1*gradient;
      n=normalize(n);
    }
    #endif`;
  const vertex=`
    #ifdef MAINE_CROWN
    varying vec3 canopyLocal;
    #endif
    uniform sampler2D envelope;
    uniform float envRows, clock, nativeRadius[9], lightSpan, useSurveyLight;
    uniform sampler2D terrainIllumination;
    attribute float surface;
    ${window.aerieCloseTreeDetail.shootAttributes||''}
    varying float fadeLow;
    #ifdef REGIONAL_BATCH
    #include <batching_pars_vertex>
    uniform sampler2D rootParameters;
    #else
    attribute float coverageLow;
    attribute vec3 anchor;
    attribute vec4 traits,tone;
    #endif
    varying vec3 wp, wn;
    #if defined(MENDENHALL_SITKA) || defined(REGIONAL_SPECIMEN)
    varying vec3 localMetres;
    #endif
    varying vec4 barkUV, foliage, lighting;
    ${closeBoughWind}
    void main(){
      #ifdef REGIONAL_BATCH
      mat4 rootTransform=getBatchingMatrix(batchId);
      vec4 rootProps=texelFetch(rootParameters,ivec2(0,int(batchId)),0);
      vec4 tone=texelFetch(rootParameters,ivec2(1,int(batchId)),0);
      vec3 anchor=rootTransform[3].xyz;
      vec4 traits=vec4(rootTransform[1].y,rootProps.x,rootProps.y,rootProps.z);
      float coverageLow=rootProps.w;
      #endif
      #ifdef REGIONAL_SPECIMEN
      vec3 localPosition=position*(1./22000.);
      vec2 materialUV=uv*(1./8192.);
      #else
      vec3 localPosition=position;
      vec2 materialUV=uv;
      #endif
      vec3 sourceNormal=normal;
      #ifdef CLOSE_NEEDLE_SHOOT
      localPosition=shootOrigin.xyz;
      #endif
      float h=clamp(localPosition.y,0.,1.);
      float azimuth=atan(localPosition.z,localPosition.x)+traits.y;
      float sector=fract(azimuth*.1591549431+1.)*8.;
      float level=clamp((h-.22)/.205,0.,4.);
      float radius=texture2D(envelope,vec2((sector+.5)/9.,(traits.z*5.+level+.5)/envRows)).r*1.7*traits.x;
      #ifdef REGIONAL_BATCH
      float width=length(rootTransform[0].xz);
      localMetres=localPosition*vec3(width,traits.x,width);
      #else
      float slice=h*7.9999;
      float native=mix(nativeRadius[int(floor(slice))],nativeRadius[int(ceil(slice))],fract(slice));
      float width=mix(traits.x,clamp(radius/max(.055,native),traits.x*.26,traits.x*4.8),smoothstep(.04,.36,h)*.92);
      #if defined(MENDENHALL_SITKA) || defined(REGIONAL_SPECIMEN)
      // Keep the photographed lean and damaged tops in all three levels. Scale
      // the entire crown to the original habitat footprint about its fixed root.
      float radiusRatio=texture2D(envelope,vec2(4.5/9.,(traits.z*5.+1.5)/envRows)).r*1.7;
      width=traits.x*clamp(radiusRatio/max(.10,nativeRadius[0]),.24,1.65);
      localMetres=localPosition*vec3(width,traits.x,width);
      #endif
      #endif
      ${window.aerieCloseTreeDetail.shootTransform||''}
      mat2 yaw=mat2(cos(traits.y),sin(traits.y),-sin(traits.y),cos(traits.y));
      vec2 offset=yaw*localPosition.xz*width;
      wp=anchor+vec3(offset.x,h*traits.x,offset.y);
      #ifdef MAINE_CROWN
      canopyLocal=(wp-anchor)/traits.x;
      #endif
      vec2 front=plantFront(anchor.xz);
      vec2 movement=plantMotion(anchor.xz,front,clock,.16);
      wp.xz+=movement*.23*traits.x*h*h;
      float leaf=1.-mod(surface,2.);
      vec2 nxz=yaw*sourceNormal.xz;
      wn=normalize(vec3(nxz.x,sourceNormal.y*width/traits.x,nxz.y));
      #ifdef CLOSE_BOUGH_WIND
      bendCloseBough(wp,wn,offset,h,traits.x,traits.y,front);
      #else
      float flutter=sin(clock*2.9+traits.y+dot(offset,vec2(1.6,1.05)));
      wp.y+=length(offset)*leaf*(.004+.023*front.x)*flutter;
      #endif
      barkUV=vec4(materialUV,surface,leaf);
      foliage=vec4(tone.rgb,traits.w);fadeLow=coverageLow;
      float illumination=1.;
      vec2 sunUV=vec2(.5+anchor.x/lightSpan,.5-anchor.z/lightSpan);
      if(useSurveyLight>.5&&all(greaterThanEqual(sunUV,vec2(0.)))&&all(lessThanEqual(sunUV,vec2(1.))))
        illumination=texture2D(terrainIllumination,sunUV).r;
      #ifdef CANOPY_CALDERA
      illumination*=1.-.82*craterShade(anchor);
      #endif
      lighting=vec4(h,clamp(length(offset)/max(radius,.15),0.,1.),tone.a,illumination);
      gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);
    }`;
  const sampleSurface=`
    #ifdef MAINE_CROWN
    varying vec3 canopyLocal;
    ${branchCoverage}
    #define COVERAGE_VALUE branchCoverage(canopyLocal)
    #else
    #define COVERAGE_VALUE ${screenHash}
    #endif
    uniform sampler2D photo;
    uniform float canopyAlphaCut;
    varying float fadeLow;
    varying vec4 barkUV,foliage;
    #if defined(MENDENHALL_SITKA) || defined(REGIONAL_SPECIMEN)
    varying vec3 localMetres;
    #endif
    vec2 atlas(float inset){
      #if defined(REGIONAL_SPECIMEN)
      if(abs(barkUV.z-3.)<.1){
        // Each cell has its own bark crop. Sample in metres along trunk and
        // limbs; a tall tree does not stretch a single scan from root to tip.
        vec2 tile=floor(barkUV.xy*8.);
        vec2 grain=vec2(2.*barkUV.x*8.,localMetres.y*.92+length(localMetres.xz)*.78);
        return (tile+.5+(fract(grain)-.5)*.84)/8.;
      }
      return barkUV.xy;
      #elif defined(MENDENHALL_SITKA)
      if(abs(barkUV.z-3.)<.1){
        // Meter-scale bark detail continues along both trunk and lateral limbs.
        vec2 tile=floor(barkUV.xy*4.);
        vec2 grain=vec2(barkUV.x*6.3,localMetres.y*.86+length(localMetres.xz)*.77);
        return (tile+.5+(fract(grain)-.5)*vec2(.72,.63))*.25;
      }
      return barkUV.xy;
      #else
      float slot=floor(barkUV.z+.5);
      vec2 st=clamp(barkUV.xy,0.,1.);
      if(slot>2.5)st=fract(barkUV.xy);
      return (mix(vec2(inset),vec2(1.-inset),st)+vec2(mod(slot,2.),floor(slot*.5)))*.5;
      #endif
    }
    ${window.aerieCloseTreeDetail.colorShader}`;
  const fragment=`
    ${sampleSurface}
    ${window.aerieCloseBark?.pars||''}
    uniform sampler2D relief;
    uniform vec3 sunlight, sunVector, aerialTint;
    uniform float fogStrength,leafSeason;
    varying vec3 wp,wn;
    varying vec4 lighting;
    ${shadowGLSL}
    void main(){
      if((foliage.a<.998||fadeLow>.0)&&(COVERAGE_VALUE>=foliage.a||COVERAGE_VALUE<fadeLow))discard;
      vec4 albedo=sampleCanopyColor();
      if(barkUV.w>.5&&albedo.a<canopyAlphaCut)discard;
      vec3 n=normalize(wn)*(gl_FrontFacing?1.:-1.);
      #ifndef CLOSE_SCANNED_BARK
      ${window.aerieCloseTreeDetail.normalShader}
      #endif
      #if !defined(MENDENHALL_SITKA) && !defined(REGIONAL_SPECIMEN)
      vec3 dx=dFdx(wp),dy=dFdy(wp);
      vec2 du=dFdx(barkUV.xy),dv=dFdy(barkUV.xy);
      vec3 t=dx*dv.y-dy*du.y,b=dy*du.x-dx*dv.x;
      float inv=inversesqrt(max(max(dot(t,t),dot(b,b)),1.e-8));
      vec3 bump=texture2D(relief,atlas(.01171875)).xyz*2.-1.;
      n=normalize(n*max(.5,bump.z)+.36*inv*(t*bump.x+b*bump.y)*sign(du.x*dv.y-du.y*dv.x));
      #endif
      vec3 c=albedo.rgb;
      ${window.aerieCloseBark?.apply||''}
      #ifdef MENDENHALL_SITKA
      c*=mix(vec3(1.02),vec3(1.17,1.06,.99),barkUV.w);
      #endif
      #ifdef REGIONAL_BROADLEAF
      float broad=barkUV.w;
      #else
      float broad=1.-smoothstep(.1,1.1,barkUV.z);
      #endif
      if(broad>.5&&leafSeason>.5){
        float leafValue=dot(c,vec3(.24,.61,.15));
        float leafMask=smoothstep(.005,.072,c.g-min(c.r,c.b));
        float species=floor(lighting.z*4.);
        vec3 pigment=species<.5?vec3(1.98,.92,.33):species<1.5?vec3(1.83,1.31,.48):species<2.5?vec3(1.64,.71,.29):vec3(1.28,1.13,.63);
        if(leafSeason>1.5)pigment=mix(vec3(.67,.89,.64),vec3(.86,1.02,.71),lighting.z);
        c=mix(c,leafValue*pigment,leafMask*.96);
        c*=mix(vec3(1.),foliage.rgb,.31);
      }else{
        c*=mix(vec3(.94,.94,.95),foliage.rgb,barkUV.w);
      }
      #ifdef MENDENHALL_SITKA
      if(abs(barkUV.z-4.)<.1)c=albedo.rgb*vec3(1.50,1.08,.70);
      #endif
      float lit=regionalCanopySun(wp+n*.05,.00034)*mix(.12,1.,lighting.w);
      #ifdef OESCHINEN_SUMMER_NEEDLES
      // Under the high valley wall the summer canopy reflects mainly cool sky.
      // Keep the lighter new growth on the outer sprays in direct sunlight.
      float needleBrightness=dot(c,vec3(.24,.61,.15));
      vec3 summerNeedle=mix(vec3(needleBrightness),c,.43)*mix(vec3(.52,.72,.67),vec3(.72,.85,.68),lit*lighting.y);
      c=mix(c,summerNeedle,barkUV.w);
      #endif
      #ifdef MAINE_NEEDLES
      c*=mix(vec3(.73,.72,.68),mix(vec3(.49,.72,.55),vec3(.75,.89,.76),lit),barkUV.w);
      #endif
      #ifdef MAINE_PAPER_BIRCH
      // Thin branch tips retain darker young bark. Papery white bark belongs
      // to older boles and the thick inner branches.
      float outer=smoothstep(.16,.69,lighting.y)*smoothstep(.26,.73,lighting.x);
      float leader=smoothstep(.52,.94,lighting.x)*.77;
      float twig=max(outer,leader);
      c*=mix(vec3(1.),vec3(.36,.31,.27),twig*(1.-barkUV.w));
      #endif
      #ifdef MAINE_CROWN
      // The outer leaf sprays see much more sky than the underside of a
      // dense lakeshore crown, even where the terrain receives diffuse light.
      float openSky=clamp(.13+.47*lighting.y+.41*lighting.x+.22*lit,0.,1.);
      float branchShade=mix(.47,.97,openSky);
      c*=mix(vec3(.83+.15*lit),vec3(.93,1.,.94)*branchShade,barkUV.w);
      #endif
      float cosine=dot(n,sunVector),sky=.5+.5*n.y;
      float ao=mix(.62,1.,clamp(.51*lighting.x+.58*lighting.y,0.,1.));
      float transmission=barkUV.w*.18*max(0.,-cosine);
      vec3 toEye=normalize(cameraPosition-wp);
      float rim=pow(1.-abs(dot(n,toEye)),2.)*barkUV.w;
      #ifdef CLOSE_BOUGH_WIND
      // Thin sun-facing margins transmit warm light through an exposed leaf;
      // dense interior leaves and bark retain their normal canopy shade.
      float through=max(0.,-dot(toEye,sunVector));
      float exposed=smoothstep(.22,1.,.53*lighting.x+.64*lighting.y);
      transmission+=.24*barkUV.w*exposed*through*through*(.22+.78*max(0.,-cosine));
      #endif
      vec3 light=vec3(.65,.72,.80)+sky*.09+lit*sunlight*(.54*max(0.,cosine)+.43*(.52+.48*cosine)+transmission+rim*.10);
      float dist=distance(wp,cameraPosition);
      vec3 crown=c*light*ao;
      #ifdef STARLIT_CANOPY
      crown=mix(crown,vec3(dot(crown,vec3(.22,.67,.11))),.48)*vec3(.36,.44,.55);
      #endif
      gl_FragColor=vec4(mix(crown,aerialTint,clamp(dist*fogStrength,0.,.25)),1.);
    }`;
  const depthFragment=`
    ${sampleSurface}
    void main(){
      if((foliage.a<.998||fadeLow>.0)&&(COVERAGE_VALUE>=foliage.a||COVERAGE_VALUE<fadeLow))discard;
      if(barkUV.w>.5&&sampleCanopyColor().a<canopyAlphaCut+.06)discard;
      gl_FragColor=vec4(1.);
    }`;
  // UVs, normal, vertex positions and material selector are packed together on disk.
  // Decode once per flight. Each level shares one indexed draw call per specimen.
  function readGeometries(T,buffer,packed=false){
    const length=new DataView(buffer).getUint32(0,true),header=new TextDecoder().decode(new Uint8Array(buffer,4,length));
    return JSON.parse(header).map(record=>{
      const {v,i,p}=record,offset=4+length+p,src=new DataView(buffer,offset,v*16);
      const positions=packed?new Int16Array(v*3):new Float32Array(v*3);
      const uv=packed?new Uint16Array(v*2):new Float32Array(v*2);
      const normals=new Int8Array(v*3),slot=new Uint8Array(v);
      const positionUnit=packed?1:1/22000,uvUnit=packed?1:1/8192;
      for(let j=0;j<v;j++){
        const start=j*16;
        for(let a=0;a<3;a++){
          positions[j*3+a]=src.getInt16(start+a*2,true)*positionUnit;
          normals[j*3+a]=src.getInt8(start+6+a);
        }
        slot[j]=src.getUint8(start+9);
        uv[j*2]=src.getUint16(start+10,true)*uvUnit;
        uv[j*2+1]=src.getUint16(start+12,true)*uvUnit;
      }
      const indexType=v>65535?Uint32Array:Uint16Array;
      // Detach the final indices so they do not retain the entire inflated pack.
      const idx=new indexType(new indexType(buffer,offset+v*16,i));
      const geometry=new T.InstancedBufferGeometry();
      geometry.setIndex(new T.BufferAttribute(idx,1));
      geometry.setAttribute('position',new T.BufferAttribute(positions,3));
      geometry.setAttribute('normal',new T.BufferAttribute(normals,3,true));
      geometry.setAttribute('surface',new T.BufferAttribute(slot,1));
      geometry.setAttribute('uv',new T.BufferAttribute(uv,2));
      return {...record,geometry};
    });
  }
  function measuredRows(ix,iz,buffer){
    const src=new DataView(buffer),rows=[];
    if(src.byteLength%56)throw Error('Truncated crown survey');
    for(let p=0;p<src.byteLength;p+=56){
      const radii=Uint8Array.from(new Uint8Array(buffer,p+16,40));
      let radius=0;
      for(let i=0;i<40;i++)radius=Math.max(radius,radii[i]/24);
      rows.push({x:ix*CELL+src.getUint16(p,true)*.01,z:iz*CELL+src.getUint16(p+2,true)*.01,
        y:src.getUint16(p+4,true)*.02,height:src.getUint16(p+6,true)*.01,width:radius*2,
        seed:src.getUint32(p+8,true),conifer:src.getUint8(p+12)===0,radii,
        photoGain:.89+.43*(src.getUint8(p+13)+src.getUint8(p+14)+src.getUint8(p+15))/765});
    }
    return rows;
  }
  const inSurvey=(region,x,z)=>region==='dixville'&&x>=-2&&x<=1&&z>=1&&z<=3;
  const rootSeed=t=>(Math.imul(Math.round(t.x*4),73856093)^Math.imul(Math.round(t.z*4),19349663))>>>0;
  const sitkaLabels=['cone-bearing adult','open juvenile','broom-bearing spruce','broken-top survivor'];
  function sitkaModel(seed,height){
    const variation=(Math.imul(seed^(seed>>>16),0x45d9f3b)>>>0)/4294967296;
    const juvenile=height<13?.61:height<22?.26:.08;
    if(variation<juvenile)return 6;
    if(variation<.66)return 5;
    return variation<.84?7:8;
  }
  // One multi-draw per species and LOD chunk. Stable root slots retain their
  // real indexed branch meshes as the forest streams past. Three frustum-culls
  // each tree separately for the eagle, the reflected camera and the sun.
  function createCrownBatch(T,parent,lod,sheet,forms,beauty,depth){
    const chunkSize=lod===1?14:52;
    const maxV=Math.max(...forms.map(f=>f.geometry.attributes.position.count));
    const maxI=Math.max(...forms.map(f=>f.geometry.index.count));
    const chunks=[],live=new Map(),queue=[],spares=[];
    const matrix=new T.Matrix4(),sizes=new T.Vector3();
    let epoch=0;
    for(const form of forms){
      const g=form.geometry,positions=g.attributes.position;
      const attr=new Uint8Array(positions.count);attr.fill(form.cell);
      g.setAttribute('aerieCell',new T.BufferAttribute(attr,1));
      g.computeBoundingBox();g.boundingBox.min.multiplyScalar(1/22000);g.boundingBox.max.multiplyScalar(1/22000);
      // Real wind can move a terminal bough just beyond the still source extent.
      g.boundingBox.expandByScalar(.10);g.boundingSphere=g.boundingBox.getBoundingSphere(new T.Sphere());
    }
    function makeChunk(){
      const props=new Float32Array(8*chunkSize);
      const texture=new T.DataTexture(props,2,chunkSize,T.RGBAFormat,T.FloatType);
      texture.minFilter=texture.magFilter=T.NearestFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
      const mat=beauty.clone(),caster=depth.clone();
      // Global wind, shadows, envelope rows and palette are shared by reference.
      mat.uniforms={...beauty.uniforms,rootParameters:{value:texture}};
      caster.uniforms={...depth.uniforms,rootParameters:{value:texture}};
      const mesh=new T.BatchedMesh(chunkSize,chunkSize*maxV,chunkSize*maxI,mat);
      mesh.frustumCulled=false;mesh.sortObjects=false;mesh.perObjectFrustumCulled=true;
      mesh.boundingSphere=new T.Sphere();mesh.name=sheet+' '+(lod===1?'middle':'far')+' crowns';
      mesh.userData.aerieRegional={sheet,lod:lod===1?'mid':'far',cellAttribute:'aerieCell',cellComponent:0};
      mesh.visible=false;parent.add(mesh);
      const c={mesh,mat,caster,texture,props,slots:0,used:0};chunks.push(c);return c;
    }
    function finish(){
      epoch++;
      for(const q of queue){const slot=live.get(q.tree.id);if(slot)slot.epoch=epoch;}
      for(const [id,slot] of live){
        if(slot.epoch===epoch)continue;
        slot.chunk.mesh.setVisibleAt(slot.id,false);spares.push(slot);live.delete(id);
      }
      for(const c of chunks)c.used=0;
      for(const q of queue){
        const {tree:t,form,record,low,high}=q;
        let slot=live.get(t.id);
        if(!slot){
          const same=spares.findIndex(s=>s.cell===form.cell);
          slot=same>=0?spares.splice(same,1)[0]:spares.pop();
          if(!slot){
            let c=chunks.at(-1);
            if(!c||c.slots===chunkSize)c=makeChunk();
            const id=c.mesh.addGeometry(form.geometry,maxV,maxI);c.slots++;
            slot={id,chunk:c,cell:form.cell,epoch};
          }else if(slot.cell!==form.cell){
            slot.chunk.mesh.setGeometryAt(slot.id,form.geometry);slot.cell=form.cell;
          }
          slot.chunk.mesh.setVisibleAt(slot.id,true);live.set(t.id,slot);
        }
        const c=slot.chunk,id=slot.id,base=id*8;
        const yaw=(t.seed%104729)/104729*TAU;
        const width=t.h*clamp((t.env[13]/255*1.7)/Math.max(.10,form.r[0]),.24,1.65);
        matrix.makeRotationY(-yaw).scale(sizes.set(width,t.h,width)).setPosition(t.x,t.y,t.z);
        c.mesh.setMatrixAt(id,matrix);
        c.props[base]=yaw;c.props[base+1]=record;c.props[base+2]=high;c.props[base+3]=low;
        c.props[base+4]=t.color[0];c.props[base+5]=t.color[1];c.props[base+6]=t.color[2];c.props[base+7]=t.leafTone;
        c.used++;
      }
      for(const c of chunks){c.mesh.visible=c.used>0;if(c.used)c.texture.needsUpdate=true;}
      queue.length=0;
    }
    function shadow(scene,on){
      for(const c of chunks)if(c.mesh.visible){
        c.mesh.material=on?c.caster:c.mat;(on?scene:parent).add(c.mesh);
      }
    }
    function dispose(){
      for(const c of chunks){c.mesh.removeFromParent();c.mesh.dispose();c.texture.dispose();c.mat.dispose();c.caster.dispose();}
      beauty.dispose();depth.dispose();live.clear();spares.length=0;queue.length=0;
    }
    return {queue,finish,shadow,dispose};
  }
  window.makeCanopyStream=function(T,renderer,scene,world){
    const mobile=window.matchMedia('(pointer: coarse)').matches;
    const maine=world.region==='moosehead';
    const limit=mobile?150:350,far=mobile?99:146;
    const capacity=maine?[mobile?4:10,mobile?20:64,limit]:[mobile?4:8,mobile?12:26,limit];
    const spill=mobile?32:72,envCapacity=limit+spill;
    const surveyRegion=world.region;
    const profile=window.aerieCanopyProfile(world);
    const grid=world.treeGrid;
    const trees=world.trees||[],firs=!grid&&world.firTrees?new Set(world.firTrees):null;
    const index=new Map(),cells=new Map(),obstacles=new Map(),measurements=new Map(),requests=new Set(),patched=new Map();
    const regionalSpecies=new Map(),modelSources=new Map(),regionalBatches=[];
    const canBatch=!!(T.BatchedMesh&&renderer.capabilities.isWebGL2&&renderer.extensions.has('WEBGL_multi_draw'));
    const ab=new AbortController(),owned=[],groups=[],photos=new Map();
    // A streamed optional canopy image must not reject the main world loader.
    const loader=new T.TextureLoader(new T.LoadingManager());
    const foliageGroup=new T.Group(),shadowScene=new T.Scene(),camera=new T.OrthographicCamera(-53,53,53,-53,.1,280);
    foliageGroup.name='Regional close canopy';scene.add(foliageGroup);
    const fineShoots=window.aerieCloseTreeDetail.makeShootPass?.(T,foliageGroup,mobile);
    const wind=window.getCanopyWind(T,scene),sun=(world.sunDirection||new T.Vector3(.4,.62,-.45)).clone().normalize();
    const squall=scene.userData.calderaCanopy;
    const size=mobile?512:1024;
    const target=new T.WebGLRenderTarget(size,size,{minFilter:T.NearestFilter,magFilter:T.NearestFilter});
    target.depthTexture=new T.DepthTexture(size,size,T.UnsignedIntType);
    target.depthTexture.format=T.DepthFormat;
    const shadows={regionalCanopyDepth:{value:target.depthTexture},regionalCanopyTransform:{value:new T.Matrix4()},
      regionalCanopyShadowOn:{value:0},regionalCanopyTexel:{value:new T.Vector2(1/size,1/size)}};
    const shadowAPI={uniforms:shadows,glsl:shadowGLSL};
    scene.userData.regionalCanopyShadow=shadowAPI;
    const envelopeBytes=new Uint8Array(9*5*envCapacity),envelope=new T.DataTexture(envelopeBytes,9,5*envCapacity,T.RedFormat);
    const maskBytes=new Uint8Array(4*maskSide*maskSide),mask=new T.DataTexture(maskBytes,maskSide,maskSide,T.RGBAFormat);
    envelope.minFilter=envelope.magFilter=T.LinearFilter;mask.minFilter=mask.magFilter=T.NearestFilter;
    for(const map of [envelope,mask]){map.unpackAlignment=1;map.needsUpdate=true;}
    const maskStep=mobile?1:2,maskWorld=maskSide*maskStep,maskStart={value:new T.Vector2()},maskEnabled={value:0};
    const sunlight=new T.Color(.69,.57,.38).lerp(new T.Color(.58,.64,.67),rangeFade(.15,.60,sun.y));
    const common={...wind.uniforms,...squall?.uniforms,...shadows,envelope:{value:envelope},envRows:{value:5*envCapacity},
      leafSeason:{value:surveyRegion==='dixville'?1:surveyRegion==='surry'?2:0},clock:{value:0},photo:{value:null},relief:{value:null},sunVector:{value:sun},sunlight:{value:sunlight},
      terrainIllumination:{value:world.sunMask||null},lightSpan:{value:world.forestLightSpan||8000},useSurveyLight:{value:world.sunMask?1:0},
      aerialTint:{value:scene.fog?.color.clone()||new T.Color(.6,.64,.68)},fogStrength:{value:scene.fog?.density?Math.min(.001,scene.fog.density*.65):.00029}};
    const counters={region:surveyRegion,ready:false,error:null,activeTiles:0,surveyTiles:0,overviewCells:grid?.cells.size||0,indexCellSize:grid?.size||CELL,drawnCrowns:0,
      measuredCrowns:0,ordinaryCrowns:0,addedCrowns:0,species:{},sitkaReady:false,sitkaForms:{},regionalSheets:[],regionalForms:{},lod:[0,0,0],shadowDraws:0,lastBuildMs:0,cacheCells:0,indexedTrees:grid?trees.length:0,maskedMaterials:0};
    let stopped=false,offset=grid?trees.length:0,lastCheck=-Infinity,lastBuild=-Infinity,lastShadow=-Infinity,dirty=true,pendingAssets=false,assetRetry=0;
    const previous=new T.Vector3(Infinity,Infinity,Infinity),eye=new T.Vector3(),shadowEye=new T.Vector3(Infinity,Infinity,Infinity);
    let detailCamera=null;
    let warmIdle=null,warmTimer=null;
    const detailEye=new T.Vector3(),lastDetailEye=new T.Vector3(Infinity,Infinity,Infinity);
    const lead=new T.Vector2();
    let lodState=new Map(),idleIndex=null;
    function maskMaterial(material,rootExpression){
      if(!material||!rootExpression||patched.has(material))return;
      const old=material.onBeforeCompile,oldKey=material.customProgramCacheKey,oldId=oldKey.call(material);
      material.onBeforeCompile=function(shader,engine){
        old.call(this,shader,engine);
        Object.assign(shader.uniforms,{regionalMask:{value:mask},regionalMaskStart:maskStart,regionalMaskOn:maskEnabled});
        const main=/void\s+main\s*\(\s*(?:void)?\s*\)\s*\{/;
        const maskLookup=`
          uniform sampler2D regionalMask;uniform vec2 regionalMaskStart;uniform float regionalMaskOn;
          float regionalRootCover(vec2 root){
            if(regionalMaskOn<.5)return 0.;
            vec2 grid=(root-regionalMaskStart)/${maskStep.toFixed(1)};
            if(all(greaterThanEqual(grid,vec2(0.)))&&all(lessThan(grid,vec2(${maskSide}.)))){
              vec4 stem=texture2D(regionalMask,(floor(grid)+.5)/${maskSide}.);
              vec2 error=abs(fract(grid)-stem.gb);
              float exact=max(error.x,error.y)<.024?stem.r:0.;
              return max(exact,stem.a);
            }
            return 0.;
          }`;
        const cut=maine&&shader.fragmentShader.includes('float branchCoverage(')?'branchCoverage(canopyLocal)':screenHash;
        if(rootExpression==='root'||rootExpression==='rootPosition'){
          // Card corners all belong to one stem. Test its coverage four times,
          // before sampling its atlas, and clip a completely replaced card.
          const varying='varying float regionalCardCover;\n';
          shader.vertexShader=maskLookup+varying+shader.vertexShader.replace(main,match=>match+`
            regionalCardCover=regionalRootCover((${rootExpression}).xz);
            if(regionalCardCover>=1.){gl_Position=vec4(2.,2.,2.,1.);return;}`);
          shader.fragmentShader=varying+shader.fragmentShader.replace(main,match=>match+`
            if(regionalCardCover>0.&&regionalCardCover>${cut})discard;`);
        }else{
          shader.vertexShader='varying vec2 regionalRootXZ;\n'+shader.vertexShader.replace(main,match=>match+' regionalRootXZ=('+rootExpression+').xz;');
          shader.fragmentShader=maskLookup+'varying vec2 regionalRootXZ;\n'+shader.fragmentShader.replace(main,match=>match+`
            float regionalCover=regionalRootCover(regionalRootXZ);
            if(regionalCover>0.&&regionalCover>${cut})discard;`);
        }
      };
      material.customProgramCacheKey=()=>oldId+'-regional-canopy-'+rootExpression;
      patched.set(material,{old,oldKey});material.needsUpdate=true;counters.maskedMaterials=patched.size;
    }
    function installTags(){
      scene.traverse(object=>{
        if(!object.isMesh)return;
        const list=Array.isArray(object.material)?object.material:[object.material];
        for(const mat of list)if(mat?.userData.canopyRoot)maskMaterial(mat,mat.userData.canopyRoot);
      });
    }
    function buildIndex(){
      const start=performance.now();
      while(offset<trees.length){
        const end=Math.min(offset+512,trees.length);
        for(;offset<end;offset++){
          const t=trees[offset];if(!Number.isFinite(t.y)||!(t.height>.6))continue;
          const id=key(Math.floor(t.x/CELL),Math.floor(t.z/CELL));
          if(!index.has(id))index.set(id,[]);
          index.get(id).push(t);
        }
        if(performance.now()-start>2.4)break;
      }
      counters.indexedTrees=offset;counters.overviewCells=index.size;
      if(offset===trees.length)dirty=true;
    }
    function indexDuringLoad(){
      if(!window.requestIdleCallback||offset>=trees.length||stopped)return;
      idleIndex=window.requestIdleCallback(deadline=>{
        idleIndex=null;
        if(stopped)return;
        if(deadline.timeRemaining()>2||deadline.didTimeout)buildIndex();
        indexDuringLoad();
      },{timeout:220});
    }
    function photo(name){
      if(!photos.has(name)){
        const lookup=loader.loadAsync(urlFor(name)).then(texture=>{
          if(stopped){texture.dispose();throw Error('Canopy disposed');}
          texture.flipY=false;texture.anisotropy=Math.min(mobile?4:8,renderer.capabilities.getMaxAnisotropy());
          owned.push(texture);return texture;
        }).catch(error=>{photos.delete(name);throw error;});
        photos.set(name,lookup);
      }
      return photos.get(name);
    }
    // Regional artwork is requested only for the world being entered. A
    // missing optional family cannot suppress either the legacy canopy or its neighbors.
    async function regionalAssets(){
      try{
        const response=await fetch(urlFor('regional-vegetation.json'),{signal:ab.signal});
        if(!response.ok)throw Error('Regional vegetation index returned '+response.status);
        // The same red spruce, balsam fir and paper birch occur on both Maine coasts and inland.
        const catalog=(await response.json()).filter(row=>row.region===(surveyRegion==='acadia'?'moosehead':surveyRegion));
        if(maine&&window.mooseheadMatureCanopy)catalog.push(window.mooseheadMatureCanopy);
        const packs=await Promise.all(catalog.map(async meta=>{
          try{
            const stem='regional/'+meta.id;
            const [data,map]=await Promise.all([unpack(stem+'.bin',ab.signal),photo(stem+'.webp')]);
            return {meta,data,map};
          }catch(error){
            if(!stopped)console.warn('Regional specimen '+meta.id+':',error.message||error);
            return null;
          }
        }));
        return packs.filter(Boolean);
      }catch(error){
        if(!stopped)console.warn('Regional vegetation:',error.message||error);
        return [];
      }
    }
    async function assets(){
      pendingAssets=true;
      const allocated=[];
      try{
        const localForms=surveyRegion==='alaska'
          ? Promise.all([unpack('sitka-forms.bin',ab.signal),photo('sitka-branches.webp')]).catch(error=>{
              if(!stopped)console.warn('Mendenhall Sitka assets:',error.message||error);
              return null;
            })
          : null;
        const closeBark=Promise.resolve().then(()=>window.aerieCloseBark?.load(photo,T)).catch(error=>{
          if(!stopped)console.warn('Close tree bark:',error.message||error);
          return null;
        });
        const [bytes,color,normal,sitka,packs,bark]=await Promise.all([
          unpack('specimens.bin',ab.signal),photo('surfaces.webp'),photo('relief.webp'),localForms,regionalAssets(),closeBark
        ]);
        if(stopped)return;
        common.photo.value=color;common.relief.value=normal;
        const specimens=readGeometries(T,bytes);
        if(sitka)specimens.push(...readGeometries(T,sitka[0]));
        let nextModel=9;
        const loadedRegional=[];
        for(const {meta,data,map} of packs){
          let models;
          try{
            models=readGeometries(T,data,true);
            const records=new Set(models.map(record=>record.m*3+record.l));
            if(!Array.isArray(meta.cells)||meta.cells.length!==16||models.length!==48||
                records.size!==48||models.some(r=>!Number.isInteger(r.m)||r.m<0||r.m>15||
                  !Number.isInteger(r.l)||r.l<0||r.l>2||r.v<3||r.i<3)){
              throw Error('Incomplete specimen/LOD data');
            }
          }catch(error){
            for(const rec of models||[])rec.geometry.dispose();
            if(!stopped)console.warn('Regional specimen '+meta.id+':',error.message||error);
            continue;
          }
          const entry={...meta,base:nextModel};
          regionalSpecies.set(meta.species,entry);
          for(const rec of models){
            const cell=rec.m;
            if(rec.l===0){
              // Close shoots are optional. Their builder validates its private
              // arrays before attaching them; retain the source form on error.
              const source={...rec.geometry.attributes},index=rec.geometry.index,v=rec.v,i=rec.i;
              try{window.aerieCloseTreeDetail.enrich(rec,meta,cell);}
              catch(error){
                rec.geometry.attributes=source;rec.geometry.setIndex(index);rec.v=v;rec.i=i;
                delete rec.geometry.userData.closeTreeDetail;
                console.warn('Close tree '+meta.id+'/'+cell+':',error.message||error);
              }
            }
            rec.m=nextModel+cell;rec.map=map;
            modelSources.set(rec.m,{sheet:meta.id,cell,label:meta.cells[cell],family:meta.families?.[cell]||meta.family});
          }
          specimens.push(...models);nextModel+=meta.cells.length;loadedRegional.push(meta.id);
        }
        const batchInputs=new Map(),lakeBatches=new Map();
        const lakeCrowns=surveyRegion==='moosehead'?window.mooseheadCrowns(T,scene,common.clock):null;
        for(const record of specimens){
          const regional=modelSources.get(record.m),pilot=!regional&&record.m>=5;
          const g=record.geometry,uniforms={...common,photo:regional?{value:record.map}:pilot?{value:sitka[1]}:common.photo,nativeRadius:{value:record.r}};
          // A sparse model's thinner photographed shoots lose coverage to mip
          // filtering. Preserve crown mass as the player crosses each LOD.
          uniforms.canopyAlphaCut={value:regional?[.34,.27,.17][record.l]:.34};
          const defines=regional?{REGIONAL_SPECIMEN:1}:pilot?{MENDENHALL_SITKA:1}:{};
          if(surveyRegion==='acadia')defines.STARLIT_CANOPY=1;
          if(surveyRegion==='swiss'&&regional&&['swiss-tree','swiss-spruce','swiss-stone-pine'].includes(regional.sheet))defines.OESCHINEN_SUMMER_NEEDLES=1;
          if(record.l===0){
            defines.CLOSE_BOUGH_WIND=1;
            const scan=regional&&regional.family!=='brush'&&(regional.family==='broad'?bark?.hardwood:bark?.pine);
            if(scan){
              defines.CLOSE_SCANNED_BARK=1;uniforms.closeBark={value:scan};
              if(/birch/i.test(regional.sheet)||regional.sheet==='lofoten-tree'||
                 regional.sheet==='moosehead-mature'&&regional.cell===13)defines.CLOSE_BIRCH_BARK=1;
            }
          }
          if(regional&&record.l===0&&g.userData.closeTreeDetail){
            defines.CLOSE_TREE_DETAIL=1;
            window.aerieCloseTreeDetail.useShootPhoto(world,defines,uniforms);
          }
          if(maine)defines.MAINE_CROWN=1;
          if(maine&&(regional?.sheet==='moosehead-birch'||(regional?.sheet==='moosehead-mature'&&regional.cell===13)))defines.MAINE_PAPER_BIRCH=1;
          if(regional?.family==='broad')defines.REGIONAL_BROADLEAF=1;
          if(maine&&['fir','spruce','cedar','pine','hemlock'].includes(regional?.family))defines.MAINE_NEEDLES=1;
          if(lakeCrowns&&record.l===2&&lakeCrowns.localSheets.includes(regional?.sheet)){
            let batch=lakeBatches.get(regional.sheet);
            if(!batch){
              batch=lakeCrowns.farBatch(foliageGroup,regional.sheet,envCapacity*2);
              lakeBatches.set(regional.sheet,batch);regionalBatches.push(batch);
            }
            groups[record.m*3+record.l]={batch,form:{cell:regional.cell},used:0};
            allocated.push(g);continue;
          }
          if(canBatch&&regional&&record.l>0){
            const id=regional.sheet+'/'+record.l+(regional.sheet==='moosehead-mature'?(regional.cell===13?'/birch':regional.family==='broad'?'/leaf':'/needle'):'');
            let b=batchInputs.get(id);
            if(!b){
              const vs=(squall?'#define CANOPY_CALDERA\n'+squall.glsl:'')+wind.glsl+vertex;
              const config={side:T.DoubleSide,defines:{...defines,REGIONAL_BATCH:1},uniforms,vertexShader:vs};
              b={sheet:regional.sheet,lod:record.l,forms:[],mat:new T.ShaderMaterial({...config,fragmentShader:fragment}),
                depth:new T.ShaderMaterial({...config,fragmentShader:depthFragment})};batchInputs.set(id,b);
            }
            const form={...record,cell:regional.cell};
            b.forms.push(form);allocated.push(g);continue;
          }
          for(const [attr,n] of [['anchor',3],['traits',4],['tone',4],['coverageLow',1]]){
            g.setAttribute(attr,new T.InstancedBufferAttribute(new Float32Array(envCapacity*n),n).setUsage(T.DynamicDrawUsage));
          }
          const vs=(squall?'#define CANOPY_CALDERA\n'+squall.glsl:'')+wind.glsl+vertex;
          const material=new T.ShaderMaterial({side:T.DoubleSide,defines,vertexShader:vs,fragmentShader:fragment,uniforms});
          const depth=new T.ShaderMaterial({side:T.DoubleSide,defines,vertexShader:vs,fragmentShader:depthFragment,uniforms});
          const mesh=new T.Mesh(g,material),caster=new T.Mesh(g,depth);
          if(regional)mesh.userData.aerieRegional={sheet:regional.sheet,cell:regional.cell,lod:['near','mid','far'][record.l]};
          g.instanceCount=0;mesh.frustumCulled=caster.frustumCulled=!!(regional||pilot);
          let radial=0;
          if(mesh.frustumCulled){
            // These vertices are positioned in world space by the shader.
            // Include the actual enriched tip extents, not the unbranched LOD.
            const p=g.attributes.position.array,unit=regional?1/22000:1;
            for(let i=0;i<p.length;i+=3)radial=Math.max(radial,p[i]*p[i]+p[i+2]*p[i+2]);
            radial=Math.sqrt(radial)*unit;g.boundingSphere=new T.Sphere();
          }
          mesh.visible=caster.visible=false;foliageGroup.add(mesh);shadowScene.add(caster);
          groups[record.m*3+record.l]={g,mesh,caster,used:0,radial,nativeWidth:Math.max(.10,record.r[0])};
          allocated.push(g,material,depth);
        }
        for(const b of batchInputs.values()){
          const batch=createCrownBatch(T,foliageGroup,b.lod,b.sheet,b.forms,b.mat,b.depth);
          regionalBatches.push(batch);
          for(const f of b.forms)groups[f.m*3+f.l]={batch,form:f,used:0};
        }
        counters.regionalSheets=loadedRegional;
        counters.sitkaReady=!!sitka;installTags();owned.push(...allocated);dirty=true;counters.ready=true;counters.error=null;
      }catch(error){
        foliageGroup.clear();shadowScene.clear();groups.length=0;regionalSpecies.clear();modelSources.clear();
        for(const item of allocated)item.dispose();
        if(!stopped){counters.error=String(error.message||error);assetRetry=performance.now()+10000;console.warn('Regional canopy:',counters.error);}
      }finally{pendingAssets=false;}
    }
    // The flight collision grid already owns every original tree. Query its bins
    // at the requested radius, without indexing an entire lake again on a phone.
    function originalTrees(ix,iz,pad=0,any=false){
      const x0=ix*CELL-pad,z0=iz*CELL-pad,x1=(ix+1)*CELL+pad,z1=(iz+1)*CELL+pad;
      const size=grid?.size||CELL,out=[];
      for(let j=Math.floor(z0/size);j<Math.ceil(z1/size);j++){
        for(let i=Math.floor(x0/size);i<Math.ceil(x1/size);i++){
          const bucket=grid?grid.cells.get(grid.cell((i+.5)*size,(j+.5)*size)):index.get(key(i,j));
          if(!bucket)continue;
          for(const t of bucket){
            if(t.height<=.6||!Number.isFinite(t.y)||t.x<x0||t.x>=x1||t.z<z0||t.z>=z1)continue;
            if(any)return true;
            out.push(t);
          }
        }
      }
      return any?false:out;
    }
    function getNearby(ix,iz){return originalTrees(ix,iz,10);}
    function style(t,kind){
      const seed=kind==='survey'?t.seed:rootSeed(t),isFir=t.conifer??(firs?firs.has(t):true);
      const s=profile.species(t,seed/4294967296,isFir);
      if(!s||!Array.isArray(s.tint)||!Array.isArray(s.shape))return null;
      const h=t.height*(kind==='survey'?1:(s.stature||1));
      let y=t.y;
      if(kind==='survey'){
        const land=world.elevation(t.x,t.z);
        if(!Number.isFinite(land)||!Number.isFinite(y)||Math.abs(land-y)>14)return null;
        // The survey also contains cliff returns. Reject sheer unvegetated faces using
        // ground slope in metres per metre, leaving isolated shelves and ridges available.
        const gx=world.elevation(t.x+2,t.z)-world.elevation(t.x-2,t.z),gz=world.elevation(t.x,t.z+2)-world.elevation(t.x,t.z-2);
        if(Math.hypot(gx,gz)>10.5)return null;
        y=Math.max(land-.12,Math.min(land+1.25,y));
      }
      if(!(h>.38)||!Number.isFinite(y))return null;
      const shrub=s.family==='shrub',radius=Math.max(.18,(t.width||h*.53)*.5*(s.aspect||1));
      const authored=regionalSpecies.get(s.name);
      const pilot=counters.sitkaReady&&s.name==='Sitka spruce';
      const variation=Math.imul(seed^(seed>>>16),0x45d9f3b)>>>0;
      // Preserve a portion of the four original high-detail Mendenhall trees.
      // Species and dimensions come from the existing habitat or lidar record.
      const cell=maine&&window.mooseheadSourceCell?window.mooseheadSourceCell(s.name,variation,t.height):variation>>>28;
      const mature=maine&&regionalSpecies.get('Mature Maine forest');
      const matureCell=mature?window.mooseheadMatureCanopy.cellFor(s.name,variation,t.height):-1;
      const model=matureCell>=0?mature.base+matureCell:authored&&(!pilot||variation%13!==0)?authored.base+cell
        :pilot?sitkaModel(seed,h):shrub?4:s.family==='needle'?1+((seed>>>8)%3):0;
      const env=new Uint8Array(45),phase=(seed%1039)*.0178;
      for(let ring=0;ring<5;ring++){
        for(let az=0;az<8;az++){
          const variation=1+.12*Math.sin(az*.84+phase+ring*.87)+.10*Math.cos(az*2.26+phase*1.7);
          const r=t.radii?t.radii[ring*8+az]/24:radius*s.shape[ring]*variation;
          env[ring*9+az]=clamp(Math.round(255*r/(1.7*h)),1,255);
        }
        env[ring*9+8]=env[ring*9];
      }
      let leafTone=(seed%997)/997;
      if(surveyRegion==='dixville'){
        // Continue the original range's autumn pigment patches across the LOD boundary.
        const patch=.5+.26*Math.sin(t.x*.0072+t.z*.0033)+.18*Math.cos(t.z*.011-t.x*.003)+(seed/4294967296-.5)*.74;
        const variant=kind==='original'&&Number.isFinite(t.species)?t.species:patch<.24?3:patch<.48?1:patch<.80?0:2;
        leafTone=(variant+.12+.73*leafTone)/4;
      }
      const gain=t.photoGain||(.90+(seed%997)/997*.19);
      return {id:(kind==='survey'?'s':'')+key(t.x,t.z),leafTone,x:t.x,y:y-Math.min(.16,h*.025),z:t.z,h,seed,model,env,kind,species:s.name||s.family,broad:s.family==='broad',
        color:s.tint.map(v=>clamp(v*gain,.25,2.4)),radius,shrub};
    }
    const obstacleSize=16;
    const obstacleKey=(i,j)=>(i+4096)*8192+j+4096;
    function indexObstacles(rows){
      const links=[];
      for(const t of rows){
        if(t.kind==='original'||t.shrub||t.h<2.8)continue;
        let maxCode=0;
        for(const code of t.env)maxCode=Math.max(maxCode,code);
        t.innerScale=t.h*1.7/255*(t.broad?.58:.55);
        t.innerRadius=Math.max(.22,maxCode*t.innerScale);
        t.trunk=clamp(t.h*.012,.07,.36);
        // Conservative solid geometry becomes active after the initial appearance.
        // A late tile may load right beneath or around the bird's starting position.
        t.solidAfter=common.clock.value+.48;t.armed=false;
        const radius=t.innerRadius;
        for(let j=Math.floor((t.z-radius)/obstacleSize);j<=Math.floor((t.z+radius)/obstacleSize);j++){
          for(let i=Math.floor((t.x-radius)/obstacleSize);i<=Math.floor((t.x+radius)/obstacleSize);i++){
            const bin=obstacleKey(i,j);
            if(!obstacles.has(bin))obstacles.set(bin,new Set());
            obstacles.get(bin).add(t);links.push([bin,t]);
          }
        }
      }
      return links;
    }
    function evict(id){
      const cell=cells.get(id);
      if(!cell)return;
      for(const [bin,t] of cell.links){
        const set=obstacles.get(bin);
        set.delete(t);if(!set.size)obstacles.delete(bin);
      }
      cells.delete(id);
    }
    function clearance(x,z,altitude){
      const rows=obstacles.get(obstacleKey(Math.floor(x/obstacleSize),Math.floor(z/obstacleSize)));
      if(!rows)return -Infinity;
      let top=-Infinity;
      const sampleHeight=Number.isFinite(altitude)?altitude:Math.abs(x-eye.x)+Math.abs(z-eye.z)<38?eye.y:Infinity;
      for(const t of rows){
        if(!t.armed||t.solidAfter>common.clock.value)continue;
        const dx=x-t.x,dz=z-t.z,d=Math.hypot(dx,dz);
        if(d>t.innerRadius)continue;
        if(d<t.trunk){top=Math.max(top,t.y+t.h*.965);continue;}
        if(sampleHeight<t.y+t.h*(t.broad?.35:.15))continue;
        // The highest intersection of the query ray with the five inner crown
        // rings. The tapered top is separate from the measured last ring.
        const sector=((Math.atan2(dz,dx)/TAU+1)%1)*8;
        const i=Math.floor(sector),fraction=sector-i;
        let above=0,upper=1;
        for(let k=4;k>=0;k--){
          const level=k===4?.935:.22+k*.205,base=9*k+i;
          const radius=(t.env[base]*(1-fraction)+t.env[base+1]*fraction)*t.innerScale;
          if(d<=radius){
            const f=clamp((radius-d)/Math.max(.001,radius-above),0,1);
            top=Math.max(top,t.y+t.h*(level+(upper-level)*f));break;
          }
          upper=level;above=radius;
        }
      }
      return top;
    }
    function makeCell(ix,iz){
      const id=key(ix,iz),original=originalTrees(ix,iz),survey=measurements.get(id)?.rows;
      const supplemental=survey?[]:profile.fillCell(ix,iz,CELL,getNearby(ix,iz))||[];
      const rows=[],seen=new Set();
      function add(t,kind){
        const id=key(t.x,t.z);
        if(seen.has(id))return;
        const tree=style(t,kind);
        if(tree){seen.add(id);rows.push(tree);}
      }
      for(const t of survey||original)add(t,survey?'survey':'original');
      for(const t of supplemental)add(t,'fill');
      return {ix,iz,id,rows,links:indexObstacles(rows),survey:!!survey};
    }
    function fetchSurvey(ix,iz,now){
      const id=key(ix,iz),record=measurements.get(id);
      if(requests.size>=2||requests.has(id)||record?.rows||record?.retry>now)return;
      requests.add(id);
      unpack(ix+'_'+iz+'.bin',ab.signal).then(bytes=>{
        if(stopped)return;
        measurements.set(id,{rows:measuredRows(ix,iz,bytes)});evict(id);dirty=true;
      }).catch(()=>{if(!stopped)measurements.set(id,{retry:performance.now()+15000});}).finally(()=>requests.delete(id));
    }
    function stampRoot(t,value,spread){
      const u=(Math.fround(t.x)-maskStart.value.x)/maskStep,v=(Math.fround(t.z)-maskStart.value.y)/maskStep;
      const x=Math.floor(u),z=Math.floor(v),q=Math.round(255*value);
      if(x<0||z<0||x>=maskSide||z>=maskSide)return;
      const at=4*(z*maskSide+x);
      // A neighbor in the same map texel keeps its own crown. The green and
      // blue channels identify the actual stem down to a fraction of a metre.
      if(q>=maskBytes[at]){
        maskBytes[at]=q;maskBytes[at+1]=Math.round(255*(u-x));maskBytes[at+2]=Math.round(255*(v-z));
      }
      if(!spread)return;
      // Only the independent lidar survey can replace a different inferred
      // stem. Keep its approximate match separate from exact-root coverage.
      const r=Math.ceil(4/maskStep);
      for(let j=Math.max(0,z-r);j<=Math.min(maskSide-1,z+r);j++)for(let i=Math.max(0,x-r);i<=Math.min(maskSide-1,x+r);i++){
        const d=maskStep*Math.hypot(i+.5-u,j+.5-v),a=4*(j*maskSide+i)+3;
        maskBytes[a]=Math.max(maskBytes[a],Math.round(q*(1-rangeFade(2,4,d))));
      }
    }
    const treeSphere=new T.Sphere();
    function draw(t,lod,record,lo,hi){
      const group=groups[t.model*3+lod];
      if(lod===0&&!group.batch)fineShoots?.collect(group,t,record,hi);
      if(group.batch){group.batch.queue.push({tree:t,form:group.form,record,low:lo,high:hi});return;}
      const j=group.used++,attrs=group.g.attributes;
      attrs.anchor.setXYZ(j,t.x,t.y,t.z);
      attrs.traits.setXYZW(j,t.h,(t.seed%104729)/104729*TAU,record,hi);
      attrs.tone.setXYZW(j,t.color[0],t.color[1],t.color[2],t.leafTone);
      attrs.coverageLow.setX(j,lo);
      if(group.radial){
        const width=t.h*clamp((t.env[13]/255*1.7)/group.nativeWidth,.24,1.65);
        const r=group.radial*width;
        // The close bough rotation preserves horizontal radius. Vertical
        // flex is bounded by .091r plus 1.5 cm, and coarser flutter by .027r.
        // The same conservative sphere serves eye, reflection and sun.
        treeSphere.center.set(t.x,t.y+.5*t.h,t.z);
        treeSphere.radius=Math.hypot(r+.17*t.h,.5*t.h+(lod===0?.10:.03)*r)+.14;
        if(j===0)group.g.boundingSphere.copy(treeSphere);else group.g.boundingSphere.union(treeSphere);
      }
    }
    function drawLevels(t,record,opacity,near,solid){
      // These cumulative weights survive a reversal mid-transition. Each
      // representation gets a disjoint coverage interval at the same root.
      const a=opacity*near,b=opacity*solid;
      if(a>.001)draw(t,0,record,0,a);
      if(b-a>.001)draw(t,1,record,a,b);
      if(opacity-b>.001)draw(t,2,record,b,opacity);
    }
    function refresh(now,seconds){
      const started=performance.now(),cx=Math.floor(eye.x/CELL),cz=Math.floor(eye.z/CELL),active=[],rows=[];
      const elapsed=seconds-lastBuild,dx=eye.x-previous.x,dz=eye.z-previous.z;
      if(elapsed>0&&elapsed<=.65&&Math.hypot(dx,dz)<=90){
        // Prepare roots about 1.5 flight seconds ahead, but build current
        // cells first after launch, a fast turn, or a landmark teleport.
        const scale=Math.min(1.5/elapsed,(mobile?62:96)/Math.max(.001,Math.hypot(dx,dz)));
        const mix=1-Math.exp(-elapsed*5);
        lead.x+=(dx*scale-lead.x)*mix;lead.y+=(dz*scale-lead.y)*mix;
      }else lead.set(0,0);
      const bounds=world.bounds,lookX=eye.x+lead.x,lookZ=eye.z+lead.y;
      const distanceToCell=(px,pz,x,z)=>Math.hypot(Math.max(x-px,px-x-CELL,0),Math.max(z-pz,pz-z-CELL,0));
      for(let iz=cz-3;iz<=cz+3;iz++)for(let ix=cx-3;ix<=cx+3;ix++){
        const x=ix*CELL,z=iz*CELL;
        if(bounds&&(x>bounds.maxX||x+CELL<bounds.minX||z>bounds.maxZ||z+CELL<bounds.minZ))continue;
        const d=distanceToCell(eye.x,eye.z,x,z),ahead=distanceToCell(lookX,lookZ,x,z);
        if(d<far+32||ahead<far+20)active.push({ix,iz,id:key(ix,iz),d,priority:Math.min(d,ahead+34)});
      }
      active.sort((a,b)=>a.priority-b.priority||a.d-b.d);
      for(const a of active)if(inSurvey(surveyRegion,a.ix,a.iz))fetchSurvey(a.ix,a.iz,now);
      let made=0,remaining=false;
      for(const a of active){
        if(!cells.has(a.id)){
          if(made>=2||(made&&performance.now()-started>2.5)){remaining=true;continue;}
          cells.set(a.id,makeCell(a.ix,a.iz));made++;
        }
        const cell=cells.get(a.id);cell.lastUse=now;
        if(a.d>=far+32)continue;
        for(const t of cell.rows){
          const dx=t.x-eye.x,dz=t.z-eye.z;
          if(t.armed===false&&seconds>=t.solidAfter&&(dx*dx+dz*dz>(t.innerRadius+2)**2||eye.y>t.y+t.h+2))t.armed=true;
          const dy=Math.max(t.y-eye.y,eye.y-(t.y+t.h),0);
          const d=Math.hypot(Math.max(0,Math.hypot(dx,dz)-t.radius*.6),dy*.90);
          if(d<far)rows.push({t,d,old:lodState.get(t.id)});
        }
      }
      for(const [id,cell] of cells)if(Math.abs(cx-cell.ix)>3||Math.abs(cz-cell.iz)>3||now-cell.lastUse>35000)evict(id);
      // A small incumbent advantage prevents adjoining crowns from swapping
      // the last resident slot as the eagle circles or shifts by centimetres.
      rows.sort((a,b)=>(a.d-(a.old?2.5:0))-(b.d-(b.old?2.5:0))||a.t.seed-b.t.seed);
      const selected=rows.slice(0,limit),highLimit=maine?(mobile?22:36):(mobile?20:32);
      const midLimit=maine?(mobile?43:76):(mobile?32:48);
      const capEdge=rows.length>limit?clamp(selected[limit-1].d,14,far):far;
      for(const row of selected){
        const size=clamp(Math.sqrt(row.t.h/15),.68,1.25);
        row.detailDistance=row.d/size-(row.old?.lod===0?4:0);
      }
      const high=selected.filter(r=>r.detailDistance<highLimit).sort((a,b)=>a.detailDistance-b.detailDistance);
      const nearRoots=new Set(high.slice(0,capacity[0]).map(r=>r.t));
      const middle=selected.filter(r=>!nearRoots.has(r.t)&&r.d<(midLimit+(r.old?.lod===1?6:0)));
      middle.sort((a,b)=>(a.d-(a.old?.lod===1?5:0))-(b.d-(b.old?.lod===1?5:0)));
      const middleRoots=new Set(middle.slice(0,capacity[1]).map(r=>r.t));
      // After holding still the previous rebuild can be over a second old.
      // Spend at most one visible blend increment on the first moving frame.
      const nextState=new Map(),counts=[0,0,0],species={},sitkaForms={},regionalForms={},timeStep=Number.isFinite(lastBuild)?clamp(elapsed,0,.08):.05;
      const move=(value,target,step)=>value+clamp(target-value,-step,step);
      let measured=0,ordinary=0,added=0,drawn=0,animating=false;
      for(const g of groups)if(g)g.used=0;
      fineShoots?.begin(detailEye,detailCamera);
      maskBytes.fill(0);maskStart.value.set(Math.floor(eye.x/maskStep)*maskStep-maskWorld*.5,Math.floor(eye.z/maskStep)*maskStep-maskWorld*.5);
      for(const {t,d,old} of selected){
        const lod=nearRoots.has(t)?0:middleRoots.has(t)?1:2;
        const outer=Math.min(far,capEdge),fadeDist=Math.max(9,outer*.18);
        const reach=outer-fadeDist*((t.seed%997)/997);
        const wanted=maine?1-rangeFade(reach-4,reach+4,d):1-rangeFade(outer-fadeDist,outer,d);
        const opacity=move(old?.opacity||0,wanted,timeStep*2.5);
        if(opacity<.004)continue;
        const near=move(old?.near??(lod===0?1:0),lod===0?1:0,timeStep*2.4);
        const solid=move(old?.solid??(lod<2?1:0),lod<2?1:0,timeStep*2.4);
        if(Math.abs(opacity-wanted)>.003||near!==(lod===0?1:0)||solid!==(lod<2?1:0))animating=true;
        drawLevels(t,drawn,opacity,near,solid);
        envelopeBytes.set(t.env,drawn*45);drawn++;counts[lod]++;
        species[t.species]=(species[t.species]||0)+1;
        const source=modelSources.get(t.model);
        if(source){
          const cells=regionalForms[source.sheet]||(regionalForms[source.sheet]=new Array(16).fill(0));
          cells[source.cell]++;
        }else if(t.model>=5){
          const label=sitkaLabels[t.model-5];
          sitkaForms[label]=(sitkaForms[label]||0)+1;
        }
        if(t.kind==='survey')measured++;else if(t.kind==='fill')added++;else ordinary++;
        // The measured inventory needs a wider root match; infill uses its exact
        // seeded root so distant regional stand cards also give way to the live specimen.
        stampRoot(t,opacity,t.kind==='survey');
        nextState.set(t.id,{t,lod,opacity,near,solid});
      }
      // A measured tile can finish while its inferred stand is on screen. Let the old
      // silhouettes recede over several frames while the surveyed crowns appear.
      let outgoing=0;
      for(const [id,entry] of lodState){
        if(nextState.has(id)||outgoing>=spill)continue;
        const {t,lod}=entry;
        const opacity=entry.opacity-timeStep*2.5;
        if(opacity<=.004||Math.abs(t.x-eye.x)>far+20||Math.abs(t.z-eye.z)>far+20||eye.y-t.y-t.h>far+20)continue;
        const slot=drawn+outgoing++;
        envelopeBytes.set(t.env,slot*45);drawLevels(t,slot,opacity,entry.near,entry.solid);
        stampRoot(t,opacity,t.kind==='survey');
        nextState.set(id,{...entry,opacity});animating=true;
      }
      for(const batch of regionalBatches)batch.finish();
      if(fineShoots)Object.assign(counters,fineShoots.finish());
      for(const g of groups){
        if(!g||g.batch)continue;
        g.g.instanceCount=g.used;g.mesh.visible=g.used>0;g.caster.visible=g.used>0;
        if(!g.used)continue;
        for(const name of ['anchor','traits','tone','coverageLow']){
          const attribute=g.g.attributes[name];
          attribute.clearUpdateRanges?.();
          attribute.addUpdateRange?.(0,g.used*attribute.itemSize);
          attribute.needsUpdate=true;
        }
      }
      envelope.needsUpdate=drawn+outgoing>0;mask.needsUpdate=true;maskEnabled.value=drawn+outgoing>0?1:0;
      lodState=nextState;lastBuild=seconds;previous.copy(eye);lastDetailEye.copy(detailEye);dirty=remaining||animating;
      Object.assign(counters,{activeTiles:active.filter(a=>cells.has(a.id)).length,surveyTiles:active.filter(a=>cells.get(a.id)?.survey).length,
        drawnCrowns:drawn,measuredCrowns:measured,ordinaryCrowns:ordinary,addedCrowns:added,species,sitkaForms,regionalForms,lod:counts,cacheCells:cells.size,lastBuildMs:Math.round((performance.now()-started)*10)/10});
    }
    function shadowPass(seconds){
      if(!counters.drawnCrowns){shadows.regionalCanopyShadowOn.value=0;return;}
      const moved=shadowEye.distanceToSquared(eye)>4;
      if(seconds-lastShadow<(mobile ? .65 : .37)||(!moved&&seconds-lastShadow<1.0))return;
      const focus=eye.clone();focus.y-=7;
      camera.position.copy(focus).addScaledVector(sun,130);camera.lookAt(focus);camera.updateMatrixWorld();
      shadows.regionalCanopyTransform.value.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
      const previousTarget=renderer.getRenderTarget(),clear=renderer.autoClear;
      try{
        for(const batch of regionalBatches)batch.shadow(shadowScene,true);
        renderer.setRenderTarget(target);renderer.autoClear=true;renderer.render(shadowScene,camera);
      }finally{
        for(const batch of regionalBatches)batch.shadow(shadowScene,false);
        renderer.setRenderTarget(previousTarget);renderer.autoClear=clear;
      }
      shadowEye.copy(eye);lastShadow=seconds;shadows.regionalCanopyShadowOn.value=1;counters.shadowDraws++;
    }
    function update(position,seconds,view=position,camera=null){
      detailCamera=camera;
      if(stopped||!Number.isFinite(position?.y))return;
      eye.copy(position);detailEye.copy(view||position);common.clock.value=seconds;
      if(offset<trees.length)buildIndex();
      const now=performance.now();
      if(!counters.ready){if(!pendingAssets&&now>=assetRetry)assets();return;}
      if(offset<trees.length)return;
      if(seconds<lastCheck){
        lastCheck=lastBuild=lastShadow=-Infinity;dirty=true;
        for(const cell of cells.values())for(const t of cell.rows)if(t.solidAfter!=null){t.solidAfter=seconds+.48;t.armed=false;}
      }
      if(seconds-lastCheck>=(mobile?.07:.055)&&(dirty||previous.distanceToSquared(eye)>3||
          lastDetailEye.distanceToSquared(detailEye)>.36||seconds-lastBuild>1.25)){
        refresh(now,seconds);lastCheck=seconds;
      }
      shadowPass(seconds);
    }
    // The crossing from open water at Kineo first encounters these programs
    // in quick succession. Compile one real material/pass per idle opportunity
    // and let KHR_parallel_shader_compile report when the driver has finished.
    function warmApproachPrograms(viewCamera){
      if(!maine||mobile||stopped||!counters.ready||counters.nearWarmup||
         !window.requestIdleCallback||!renderer.extensions?.has('KHR_parallel_shader_compile'))return;
      const fallback=groups.find(g=>g?.mesh?.material.defines.MAINE_CROWN&&Object.keys(g.mesh.material.defines).length===1);
      if(!fallback)return;
      const passes=[[fallback.mesh,scene,viewCamera,null],[fallback.mesh,scene,viewCamera,target],[fallback.caster,shadowScene,camera,target]];
      const limb=world.habitat?.branchShaderMesh?.();
      if(limb)passes.push([limb,scene,viewCamera,null]);
      const done=new Set();
      scene.traverse(o=>{
        const mat=o.material;
        if(!o.isInstancedMesh||mat?.userData.canopyRoot!=='instanceMatrix[3].xyz'||done.has(mat))return;
        // Surveyed spruce receives an instance color when its first tree is promoted.
        if(o.geometry.hasAttribute('nearBand')&&!o.instanceColor)o.setColorAt(0,new T.Color());
        done.add(mat);passes.push([o,scene,viewCamera,null]);
      });
      const progress=counters.nearWarmup={submitted:0,ready:0,total:passes.length};
      let pending=null;
      const schedule=()=>{if(!stopped)warmIdle=window.requestIdleCallback(next);};
      function next(deadline){
        warmIdle=null;
        if(stopped||renderer.getContext().isContextLost())return;
        if(deadline.timeRemaining()<4){schedule();return;}
        try{
          if(pending){
            if(pending.isReady()){
              pending.getUniforms();progress.ready++;pending=null;
            }
          }else{
            const [object,lighting,view,output]=passes[progress.submitted];
            const prior=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel();
            try{
              if(prior!==output)renderer.setRenderTarget(output);
              renderer.compile(object,view,lighting);
              pending=renderer.properties.get(object.material).currentProgram;
              progress.submitted++;
            }finally{if(prior!==output)renderer.setRenderTarget(prior,face,mip);}
          }
        }catch(error){progress.error=String(error?.message||error);return;}
        if(pending||progress.submitted<passes.length)schedule();
      }
      warmTimer=setTimeout(()=>{warmTimer=null;schedule();},1800);
    }
    function dispose(){
      if(warmTimer!==null)clearTimeout(warmTimer);
      if(warmIdle!==null)window.cancelIdleCallback?.(warmIdle);
      stopped=true;if(idleIndex!=null)window.cancelIdleCallback?.(idleIndex);ab.abort();maskEnabled.value=shadows.regionalCanopyShadowOn.value=0;
      for(const [mat,hooks] of patched){mat.onBeforeCompile=hooks.old;mat.customProgramCacheKey=hooks.oldKey;mat.needsUpdate=true;}
      for(const batch of regionalBatches)batch.dispose();
      fineShoots?.dispose();
      for(const resource of owned)resource.dispose();
      patched.clear();photos.clear();index.clear();cells.clear();obstacles.clear();measurements.clear();lodState.clear();scene.remove(foliageGroup);
      foliageGroup.clear();shadowScene.clear();
      mask.dispose();envelope.dispose();target.depthTexture.dispose();target.dispose();
      if(scene.userData.regionalCanopyShadow===shadowAPI)delete scene.userData.regionalCanopyShadow;
    }
    installTags();indexDuringLoad();
    const ready=assets();
    function hasOriginalCell(ix,iz){
      // Outer silhouettes wait until coverage is known, including independent lidar cells.
      return offset<trees.length||inSurvey(surveyRegion,ix,iz)||originalTrees(ix,iz,0,true);
    }
    return {ready,warmApproachPrograms,getCanopyNeighbors:getNearby,hasOriginalCell,isSurveyCell:(ix,iz)=>inSurvey(surveyRegion,ix,iz),clearance,update,dispose,maskMaterial,stats:()=>({...counters,lod:[...counters.lod],species:{...counters.species},sitkaForms:{...counters.sitkaForms},regionalSheets:[...counters.regionalSheets],regionalForms:Object.fromEntries(Object.entries(counters.regionalForms).map(([k,v])=>[k,[...v]]))})};
  };
})();
