// Submerged cobbles, gravel banks, and wind-bent grass at metre and centimetre scales.
window.addHabitat = function addHabitat(THREE,scene,world,region) {
  const extent={alaska:4800,swiss:2000,canyon:3200}[region];
  const arid=region==='canyon', clock={value:0};
  const loader=new THREE.TextureLoader();
  function repeat(file,color=false) {
    const texture=loader.load(file);
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.anisotropy=4;
    if(color)texture.colorSpace=THREE.SRGBColorSpace;
    return texture;
  }
  let habitatPixels, resolution;
  const field=loader.load('habitat-'+region+'.png',texture=>{
    const canvas=document.createElement('canvas');
    resolution=canvas.width=canvas.height=texture.image.width;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(texture.image,0,0);
    habitatPixels=ctx.getImageData(0,0,resolution,resolution).data;
  });
  if(arid)world.fieldBankAt=(x,z)=>{
    // The river is shaded directly on the surveyed ground triangles. Sample
    // the very same signed bank field that controls gravel versus moving water.
    if(!habitatPixels||Math.abs(x)>=extent||Math.abs(z)>=extent)return null;
    const u=(.5+x/(2*extent))*resolution-.5,v=(.5+z/(2*extent))*resolution-.5;
    const i=Math.max(0,Math.min(resolution-2,Math.floor(u))),j=Math.max(0,Math.min(resolution-2,Math.floor(v)));
    const a=habitatPixels[4*(j*resolution+i)],b=habitatPixels[4*(j*resolution+i+1)];
    const c=habitatPixels[4*((j+1)*resolution+i)],d=habitatPixels[4*((j+1)*resolution+i+1)];
    const f=Math.max(0,Math.min(1,u-i)),g=Math.max(0,Math.min(1,v-j));
    const signed=((a*(1-f)*(1-g)+b*f*(1-g)+c*(1-f)*g+d*f*g)/255-.5)*96;
    return {distance:Math.abs(signed),signed,yaw:Math.atan2((b-a)*(1-g)+(d-c)*g,(c-a)*(1-f)+(d-b)*f),stream:true};
  };
  world.groundCover=(x,z)=>{
    if(world.lakeLanding?.managed(x,z))return -1;
    if(!habitatPixels)return 0;
    const u=Math.floor((.5+x/(2*extent))*resolution),v=Math.floor((.5+z/(2*extent))*resolution);
    if(u<0||v<0||u>=resolution||v>=resolution)return 0;
    const k=4*(u+v*resolution);
    return habitatPixels[k+2]>128||habitatPixels[k]<119?0:habitatPixels[k+1]/255;
  };
  const pebble=repeat('shore-pebbles.webp');
  const glacial=region==='alaska';
  // This field intersects each rendered lake polygon with the terrain triangles
  // at water level. Red is signed distance, green is bed depth, blue is grade.
  let marginImage;
  const survey=!arid?loader.load(region+'-littoral.png',map=>{
    const canvas=document.createElement('canvas'),img=map.image;
    canvas.width=img.width;canvas.height=img.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(img,0,0);marginImage=ctx.getImageData(0,0,img.width,img.height);
    buildBeach();
  }):null;
  if(survey){survey.generateMipmaps=false;survey.minFilter=THREE.LinearFilter;}
  const bounds=glacial?new THREE.Vector4(-2832,-1504,1/3680,1/6400):new THREE.Vector4(-960,-288,1/1952,1/1136);
  const marginUniforms={lakeMargin:{value:survey},marginBounds:{value:bounds},habitatClock:clock};
  const beach=glacial?[470,921]:[-647,466];
  const beachRadius=135,level=.18;
  // A low gravel berm below the measured bank rounds the exposed terrace at
  // Nugget Falls beach and the western Oeschinen inlet. The same profile
  // determines the mesh, collision surface, wet stones and underwater optics.
  const shoreX=beach[0].toFixed(1),shoreZ=beach[1].toFixed(1);
  const shoreMotion=`
    uniform sampler2D lakeMargin;
    uniform vec4 marginBounds;
    uniform float habitatClock;
    vec3 marginAt(vec2 p){
      vec2 uv=(p-marginBounds.xy)*marginBounds.zw;
      vec3 m=texture2D(lakeMargin,vec2(uv.x,1.-uv.y)).rgb;
      float r=2.*m.r-1.;
      float influence=1.-smoothstep(75.,135.,length(p-vec2(${shoreX},${shoreZ})));
      ${world.strandSurvey?'float surveyedEdge=min(min(p.x+820.,-348.-p.x),min(p.y-304.,648.-p.y));influence*=1.-smoothstep(0.,20.,surveyedEdge);':''}
      float bar=2.7+.65*sin(p.x*.13+p.y*.062)+.36*sin(p.x*.29-p.y*.117);
      return vec3(56.*r*abs(r)-influence*bar,16.*m.g*m.g,m.b);
    }
    float shoreBeat(vec2 p,float shore,float t){
      // Refracted crests run parallel to the beach. Separate wave groups
      // arrive out of phase along a headland and dissipate in the swash zone.
      float drift=.76*sin(dot(p,vec2(.027,-.044)))+.39*sin(dot(p,vec2(-.094,.051)));
      return .66*sin(shore*1.38+t*2.06+drift)+.34*sin(shore*2.15+t*2.83-drift*.71);
    }
    float washReach(vec2 p,float grade,float t){
      float group=.63+.31*sin(t*.37+dot(p,vec2(.016,.024)));
      return (.18+.82*group)*shoreBeat(p,0.,t)/(.87+2.8*grade);
    }
  `;
  const grains=arid?null:repeat('shore-pebbles-normal.webp');
  const loose=arid?null:repeat('shore-cobble.webp');
  const westernStrand=region==='swiss'?loader.load('landform-swisswest-aerial.webp'):null;
  if(westernStrand)westernStrand.anisotropy=8;
  for(const mesh of scene.children){
    if(!mesh.isWater||arid)continue;
    const mat=mesh.material;
    Object.assign(mat.uniforms,marginUniforms,{pebbleBed:{value:glacial?world.bankDepositMap:pebble},bedGrain:{value:grains},stoneShelf:{value:loose}});
    // The final two stations of Nugget Creek enter Mendenhall Lake here.
    // A spreading outflow distorts the glacial reflection and carries small
    // patches of entrained air away from the foot of the chute.
    const outletRoute=mat.userData.nuggetLakeMargin?world.waterfalls?.routes.find(route=>route.name==='Nugget Falls'):null;
    const mouth=outletRoute?.nodes.at(-1);
    const upstream=mouth&&outletRoute.nodes.findLast(node=>mouth.travel-node.travel>22);
    const jet=upstream?new THREE.Vector2(mouth.x-upstream.x,mouth.z-upstream.z).normalize():null;
    const mouthXZ=jet?mouth.x.toFixed(2)+','+mouth.z.toFixed(2):'474.,680.';
    const jetXZ=jet?jet.x.toFixed(4)+','+jet.y.toFixed(4):'-.866,.500';
    const jetHalf=jet?(.39*mouth.width).toFixed(2):'8.';
    const riverMouth=glacial?`
      vec2 delta=worldPosition.xz-vec2(${mouthXZ});
      vec2 outflow=vec2(${jetXZ});
      float runout=dot(delta,outflow),crossflow=dot(delta,vec2(-outflow.y,outflow.x));
      float plume=smoothstep(-18.,-3.,runout)*(1.-smoothstep(5.,59.,runout))
                *(1.-smoothstep(.36,1.,abs(crossflow)/(${jetHalf}+.26*max(0.,runout))));
      float entrained=0.;
      if(plume>.002){
        vec2 local=vec2(runout,crossflow);
        vec2 parcel=texture2D(normalSampler,local*vec2(.055,.083)-vec2(.065*habitatClock,0.)).rg-.5;
        float crest=sin(runout*1.61-habitatClock*2.54+.65*sin(crossflow*.62)+3.2*parcel.y);
        slope+=plume*outflow*(parcel.x*.29+crest*.064)*(1.-smoothstep(.25,1.8,pixel));
        entrained=plume*smoothstep(.06,.32,parcel.x+.34*parcel.y)*smoothstep(.14,.89,crest);
      }
    `:'';
    const optics=`
      vec2 bankPosition=worldPosition.xz;
      vec3 littoral=marginAt(bankPosition);
      float edgeDistance=littoral.x;
      float nearShore=1.-smoothstep(16.,49.,edgeDistance);
      vec2 edgeNormal=vec2(0.);
      float wash=0.;
      if(nearShore>.001){
        float e=${glacial?'2.4':'1.2'};
        vec2 grad=vec2(marginAt(bankPosition+vec2(e,0.)).x-marginAt(bankPosition-vec2(e,0.)).x,
                       marginAt(bankPosition+vec2(0.,e)).x-marginAt(bankPosition-vec2(0.,e)).x);
        edgeNormal=grad/max(.001,length(grad));
        wash=washReach(bankPosition,littoral.z,habitatClock);
        float beat=shoreBeat(bankPosition,max(0.,edgeDistance),habitatClock);
        float run=.53+.47*sin(dot(bankPosition,vec2(.031,.043))+habitatClock*.43);
        float resolved=1.-smoothstep(.22,1.8,pixel);
        slope=mix(slope,slope*.57-edgeNormal*beat*(.073+.085*run)*resolved,nearShore);
      }
      ${riverMouth}
    `;
    const shallows=`
      if(nearShore>.001){
        vec2 loc=worldPosition.xz;
        float fringe=max(.075,min(.52,pixel*.55));
        float flooded=smoothstep(-fringe,fringe,edgeDistance+wash);
        // The general survey contains a simplified, steep cut under the lake.
        // Use a nearshore sediment shelf and blend into the mapped bed offshore.
        float slopeGrade=clamp(.095+.43*littoral.z,.11,.46);
        float d=max(0.,edgeDistance+wash);
        float depth=max(.022,min(littoral.y+.035,d*slopeGrade+.028));
        depth=mix(depth,max(depth,littoral.y),smoothstep(11.,35.,d));
        vec3 ray=refract(-eyeDirection,surfaceNormal,1./1.333);
        vec2 bedP=loc+ray.xz*depth/max(.32,-ray.y);
        vec2 warp=texture2D(normalSampler,bedP*.016).rg-.5;
        vec2 gravelUV=bedP*.46+warp*.19;
        vec3 gravel=pow(texture2D(pebbleBed,gravelUV).rgb,vec3(2.2));
        vec3 relief=texture2D(bedGrain,gravelUV).rgb*2.-1.;
        float resolved=1.-smoothstep(.06,.58,pixel);
        float bars=smoothstep(.30,.70,texture2D(normalSampler,bedP*.033+warp*.14).g);
        vec3 stones=pow(texture2D(stoneShelf,mat2(.31,-.95,.95,.31)*bedP*.27+warp*.23).rgb,vec3(2.2));
        vec3 substrate=${glacial?'mix(pow(mendenhallDeposit(pebbleBed,bedP,-depth,sunDirection),vec3(2.2)),stones,.04+.08*bars)':'mix(gravel,stones,.20+.45*bars)'};
        substrate*=.83+resolved*.30*dot(normalize(vec3(relief.x,.92,relief.y)),sunDirection);
        float rays=abs(sin(dot(bedP,vec2(1.7,.75))+1.7*warp.x+.93*habitatClock)+.76*sin(dot(bedP,vec2(-.58,2.2))+warp.y-habitatClock*1.16));
        float focus=exp(-9.*rays)*resolved*exp(-depth*.70)*min(1.,depth*3.);
        vec3 trans=exp(-depth*vec3(${glacial?'1.46,.84,.71':'.70,.31,.23'})/max(.32,-ray.y));
        vec3 bentLight=substrate*vec3(.77,.86,.83)*(.77+.52*getShadowMask())*(1.+focus*.68);
        vec3 bedLight=bentLight*trans+scattered*(1.-trans);
        vec3 through=mix(bedLight,reflectionSample,reflectance)+sunColor*min(.94,sunSpecular)*getShadowMask();
        vec3 damp=substrate*(.62+.28*getShadowMask());
        float arc=shoreBeat(loc,max(0.,edgeDistance),habitatClock);
        float flecks=texture2D(normalSampler,loc*.31+edgeNormal*habitatClock*.047).g;
        float lip=exp(-4.*abs(edgeDistance+wash))*(.26+.74*max(0.,arc))*smoothstep(.43,.7,flecks);
        through=mix(through,vec3(.49,.54,.50),${glacial?'.30':'.19'}*lip*(1.-smoothstep(.25,1.25,pixel)));
        outgoingLight=mix(outgoingLight,mix(damp,through,flooded),nearShore);
      }
      ${glacial?'outgoingLight=mix(outgoingLight,vec3(.53,.63,.62),entrained*.45);':''}`;
    let lakeShore=shoreMotion;
    if(mat.userData.nuggetLakeMargin){
      lakeShore='uniform sampler2D deltaShoal;\n'+shoreMotion.replace('vec3 marginAt(', 'vec3 nuggetRegionalMargin(')+mat.userData.nuggetLakeMargin;
      mat.fragmentShader=mat.fragmentShader.replace('uniform sampler2D deltaShoal;', '');
    }
    mat.fragmentShader=lakeShore+(glacial?window.mendenhallSedimentGLSL:'')+'\nuniform sampler2D pebbleBed,bedGrain,stoneShelf;\n'+mat.fragmentShader
      .replace('vec3 surfaceNormal=normalize',optics+'\n          vec3 surfaceNormal=normalize')
      .replace('gl_FragColor = vec4( outgoingLight, alpha );',shallows+'\n          gl_FragColor = vec4( outgoingLight, alpha );');
  }

  // The square survey tiles have a known regular grid. Place blades and cobbles on
  // the triangles actually displayed, including coarse sections of the survey.
  const gridTiles=[];
  const terrainMaterials=new Set();
  const eastFanMaterials=new Set();
  if(region==='swiss')world.landformMesh?.traverse(mesh=>{
    if(mesh.isMesh){terrainMaterials.add(mesh.material);eastFanMaterials.add(mesh.material);}
  });
  const eastFanPhoto=eastFanMaterials.size?loader.load('oeschinen-east-fan.webp'):null;
  if(eastFanPhoto)eastFanPhoto.anisotropy=8;
  world.strandMesh?.traverse(mesh=>{if(mesh.isMesh)terrainMaterials.add(mesh.material);});
  for(const m of scene.children){
    const mat=m.material;
    if(!mat?.isShaderMaterial || !(mat.uniforms.surveyNormals||mat.uniforms.localPhoto||mat.uniforms.flow&&mat.uniforms.strata))continue;
    terrainMaterials.add(mat);
    const g=m.geometry, pos=g.getAttribute('position');
    g.computeBoundingBox();
    const box=g.boundingBox, side=box.max.x-box.min.x, depth=box.max.z-box.min.z;
    let row=1;
    while(row<pos.count && pos.getZ(row)===pos.getZ(0))row++;
    if(row<2||pos.count%row!==0)continue;
    gridTiles.push({mat,uv:g.attributes.uv,pos,row,cols:pos.count/row,left:box.min.x,top:box.min.z,side,depth});
  }
  // Swiss and Alaskan low terrain transition from map photography to metre-scale scanned ground.
  if(!arid){
    for(const mat of terrainMaterials){
      const sw=region==='swiss', name=sw?'wp':'p', col=sw?'rgb':'base', norm=sw?'n':'nn';
      const anchor=sw?'vec2 vd=(wp.xz+4000.)/8000.;':'float haze=';
      if(!mat.fragmentShader.includes(anchor))continue;
      Object.assign(mat.uniforms,marginUniforms,{beachScan:{value:glacial?world.bankDepositMap:loose}});
      const eastern=eastFanMaterials.has(mat);
      if(sw)mat.uniforms.strandPhoto={value:eastern?eastFanPhoto:westernStrand};
      const layers=`
        ${eastern?`
        // The overhead image was taken at a higher lake stage. Where the
        // surveyed lower-stage shore is exposed, grade the local limestone
        // gravel from darker wet clasts to a pale, dry fan.
        vec2 fanUv=(wp.xz-vec2(532.,314.))/vec2(450.,492.);
        float fanEdge=min(min(fanUv.x,fanUv.y),min(1.-fanUv.x,1.-fanUv.y));
        float eastFan=smoothstep(0.,.055,fanEdge)*smoothstep(.48,.88,n.y)*
          smoothstep(-.03,.24,wp.y)*(1.-smoothstep(5.,9.,wp.y));
        if(eastFan>.01){
          vec3 floodGravel=texture2D(strandPhoto,vec2(fanUv.x,1.-fanUv.y)).rgb;
          vec2 bedUv=(mat2(.88,-.48,.48,.88)*wp.xz)*.31;
          vec3 wetClasts=texture2D(beachScan,bedUv).rgb;
          float grain=dot(wetClasts,vec3(.27,.59,.14));
          float close=1.-smoothstep(54.,275.,d);
          rgb=mix(rgb,floodGravel*(1.+(grain-.35)*.59*close),eastFan*.99);
        }`:''}
        if(d<250.){
          vec2 pos=${name}.xz;
          vec3 margin=marginAt(pos);float bank=-margin.x, gentle=smoothstep(.63,.94,${norm}.y);
          float beach=(1.-smoothstep(7.,37.,abs(bank)))*gentle;
          beach*=smoothstep(-1.2,.1,${name}.y)*(1.-smoothstep(2.8,11.,${name}.y));
          vec3 gravel=${glacial?'mendenhallDeposit(beachScan,pos,p.y,sun)':'texture2D(beachScan,pos*.40).rgb'};
          vec3 groundColor=gravel;
          float lightValue=clamp(dot(${col},vec3(.29,.58,.13))/.40,.51,1.42);
          float reach=washReach(pos,margin.z,habitatClock);
          float low=1.-smoothstep(.28,1.0,${name}.y-.18);
          float thin=(1.-smoothstep(-.06,.10,bank-reach))*low;
          float damp=(1.-smoothstep(.72,3.1,bank-reach*.19))*low;
          groundColor*=lightValue*mix(1.08,.66,damp);
          groundColor=mix(groundColor,groundColor*vec3(.65,.81,.83)+vec3(.017,.028,.035),thin*.81);
          groundColor+=vec3(.045,.061,.067)*(damp+.7*thin)*pow(max(0.,dot(normalize(cameraPosition-${name}),reflect(-sun,${norm}))),18.);
          ${col}=mix(${col},groundColor,(1.-smoothstep(42.,240.,d))*beach*.94);
          ${sw&&!eastern?`
            // SWISSIMAGE positions pale scree and darker gravel pockets on the
            // west fan. Keep individual tree crowns and open water out of the
            // ground material as the camera descends to the gravel berm.
            vec2 uvWest=(pos-vec2(-820.,304.))/vec2(472.,344.);
            float tileEdge=min(min(uvWest.x,uvWest.y),min(1.-uvWest.x,1.-uvWest.y));
            if(tileEdge>0.&&bank>-.3){
              vec3 mapped=texture2D(strandPhoto,vec2(uvWest.x,1.-uvWest.y)).rgb;
              float wetPhoto=smoothstep(.015,.09,mapped.b-mapped.r)*smoothstep(.015,.075,mapped.g-mapped.r);
              float leaves=smoothstep(.018,.07,mapped.g-.5*(mapped.r+mapped.b));
              float mineral=(1.-max(wetPhoto,leaves))*smoothstep(.11,.30,dot(mapped,vec3(.26,.58,.16)));
              float reach=smoothstep(0.,.055,tileEdge)*mineral*(1.-smoothstep(12.,24.,wp.y));
              vec3 limestone=mapped*(.76+.51*dot(gravel,vec3(.27,.58,.15)))*mix(1.,.65,damp);
              rgb=mix(rgb,limestone,reach*.84);
              // The summer photo was taken at a higher water stage than
              // swissALTI3D. The exposed low-stage fan is wet limestone
              // detritus; blue water pixels would turn the dry land green.
              float exposed=wetPhoto*(1.-smoothstep(6.,11.,wp.y))*smoothstep(0.,.055,tileEdge);
              vec2 bar=fract(mat2(.86,-.51,.51,.86)*pos*.039);
              vec3 dryFan=texture2D(strandPhoto,vec2(.421,.184)+(bar-.5)*vec2(.019,.076)).rgb;
              float grain=dot(gravel,vec3(.27,.58,.15));
              float dust=clamp(dot(dryFan,vec3(.29,.57,.14)),.32,.68);
              vec3 shingle=vec3(.98,.985,1.)*dust*(.65+.69*grain)*mix(1.,.65,damp);
              rgb=mix(rgb,shingle,exposed*.98);
            }`:''}
        }
      `;
      let lakeShore=shoreMotion;
    if(mat.userData.nuggetLakeMargin){
      lakeShore='uniform sampler2D deltaShoal;\n'+shoreMotion.replace('vec3 marginAt(', 'vec3 nuggetRegionalMargin(')+mat.userData.nuggetLakeMargin;
      mat.fragmentShader=mat.fragmentShader.replace('uniform sampler2D deltaShoal;', '');
    }
    mat.fragmentShader=lakeShore+(glacial?window.mendenhallSedimentGLSL:'')+(sw?'\nuniform sampler2D strandPhoto;':'')+'\nuniform sampler2D beachScan;\n'+mat.fragmentShader.replace(anchor,layers+anchor);
    }
  }
  const tileMap=new Map();
  function surface(x,z){
    if(world.strandSurvey?.edge(x,z)>.01)return world.elevation(x,z);
    const key=Math.floor(x/8)+','+Math.floor(z/8);
    let t=tileMap.get(key);
    if(!t || x<t.left||z<t.top||x>=t.left+t.side||z>=t.top+t.depth){
      t=gridTiles.find(v=>x>=v.left&&z>=v.top&&x<v.left+v.side&&z<v.top+v.depth);
      if(!t)return world.elevation(x,z);
      tileMap.set(key,t);
    }
    const u=(x-t.left)/t.side*(t.row-1),v=(z-t.top)/t.depth*(t.cols-1);
    const i=Math.min(t.row-2,Math.floor(u)),j=Math.min(t.cols-2,Math.floor(v)),a=u-i,b=v-j,k=j*t.row+i;
    const h=t.pos;
    if(a+b<=1)return h.getY(k)*(1-a-b)+h.getY(k+1)*a+h.getY(k+t.row)*b;
    return h.getY(k+t.row+1)*(a+b-1)+h.getY(k+t.row)*(1-a)+h.getY(k+1)*(1-b);
  }
  const smooth=(a,b,x)=>{const u=Math.max(0,Math.min(1,(x-a)/(b-a)));return u*u*(3-2*u);};
  function bankDistance(x,z){
    if(!marginImage)return Infinity;
    const {width,height,data}=marginImage;
    const px=(x-bounds.x)*bounds.z*width-.5,pz=(z-bounds.y)*bounds.w*height-.5;
    const ix=Math.floor(px),iz=Math.floor(pz),a=px-ix,b=pz-iz;
    if(ix<0||iz<0||ix>=width-1||iz>=height-1)return Infinity;
    const k=4*(iz*width+ix),row=4*width;
    const red=((1-b)*((1-a)*data[k]+a*data[k+4])+b*((1-a)*data[k+row]+a*data[k+row+4]))/127.5-1;
    return 56*red*Math.abs(red);
  }
  function beachHeight(x,z,ground){
    const dx=x-beach[0],dz=z-beach[1];
    if(!marginImage||Math.abs(dx)>beachRadius||Math.abs(dz)>beachRadius)return -Infinity;
    const influence=(1-smooth(75,beachRadius,Math.hypot(dx,dz)))*(1-(world.strandSurvey?.edge(x,z)||0));
    if(influence<=0)return -Infinity;
    const distance=bankDistance(x,z);
    if(distance< -9||distance>13)return -Infinity;
    const bar=2.7+.65*Math.sin(x*.13+z*.062)+.36*Math.sin(x*.29-z*.117);
    const shelf=level+.145*(influence*bar-distance);
    const join=smooth(-8,-1.4,distance)*(1-smooth(6,13,distance))*influence;
    const base=ground-.055;
    // Round the break in slope where loose shingle laps onto the older bank.
    // Both sides meet with a continuous first derivative across the shoulder.
    const blendWidth=.95;
    const weight=Math.max(0,Math.min(1,.5+.5*(shelf-base)/blendWidth));
    const rounded=base+(shelf-base)*weight+blendWidth*weight*(1-weight);
    return base+join*(rounded-base);
  }
  function buildBeach(){
    if(!marginImage)return;
    cache.clear();prevX=undefined;
    const grid=1.25,chunks=new Map();
    const at=(x,z)=>{
      const t=gridTiles.find(v=>x>=v.left&&z>=v.top&&x<v.left+v.side&&z<v.top+v.depth);
      if(!t)return null;
      const ground=surface(x,z),h=beachHeight(x,z,ground);
      return {x,z,y:Number.isFinite(h)?h:ground-.055,raised:h>ground-.01,tile:t};
    };
    const n=Math.ceil(2*beachRadius/grid),left=beach[0]-beachRadius,top=beach[1]-beachRadius;
    let prev=[];
    for(let j=0;j<=n;j++){
      const z=top+j*grid,now=[];
      for(let i=0;i<=n;i++){
        const corner=at(left+i*grid,z);now.push(corner);
        if(!j||!i)continue;
        const a=prev[i-1],b=prev[i],c=now[i-1],d=corner;
        if(!a||!b||!c||!d||!(a.raised||b.raised||c.raised||d.raised))continue;
        let chunk=chunks.get(a.tile);
        if(!chunk)chunks.set(a.tile,chunk={positions:[],uv:[],ids:[],keys:new Map()});
        const vertex=(v,key)=>{
          let idx=chunk.keys.get(key);
          if(idx===undefined){
            idx=chunk.positions.length/3;chunk.keys.set(key,idx);chunk.positions.push(v.x,v.y,v.z);
            const t=a.tile,uv=t.uv;
            if(uv){
              const u=(v.x-t.left)/t.side,w=(v.z-t.top)/t.depth;
              chunk.uv.push(uv.getX(0)+u*(uv.getX(t.row-1)-uv.getX(0)),
                            uv.getY(0)+w*(uv.getY(uv.count-t.row)-uv.getY(0)));
            }
          }
          return idx;
        };
        const k=j*(n+1)+i;
        const A=vertex(a,k-n-2),B=vertex(b,k-n-1),C=vertex(c,k-1),D=vertex(d,k);
        chunk.ids.push(A,C,B,B,C,D);
      }
      prev=now;
    }
    for(const [tile,chunk] of chunks){
      const mat=tile.mat;
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(chunk.positions,3));
      if(chunk.uv.length)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(chunk.uv,2));
      geometry.setIndex(chunk.ids);geometry.computeVertexNormals();geometry.computeBoundingSphere();
      const mesh=new THREE.Mesh(geometry,mat);mesh.name='Beach gravel berm';
      // Share the terrain's reflection/colour callback and cloud lighting.
      const original=scene.children.find(m=>m.material===mat);
      if(original)mesh.onBeforeRender=original.onBeforeRender;
      scene.add(mesh);
    }
    const height=world.height,clearance=world.clearance;
    world.height=(x,z)=>{const h=height(x,z);return Math.max(h,beachHeight(x,z,h));};
    if(clearance)world.clearance=(x,z)=>{const h=clearance(x,z);return Math.max(h,beachHeight(x,z,h));};
  }
  const geo=new THREE.IcosahedronGeometry(1,1);
  const pos=geo.getAttribute('position');
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    const rough=1+.14*Math.sin(4*x+3*y)*Math.cos(5*z+2*y);
    pos.setXYZ(i,x*rough+.12*y,y*rough,z*rough);
  }
  geo.computeVertexNormals();
  const rockMat=new THREE.MeshStandardMaterial({map:repeat(arid?'rock.jpg':'shore-stone.webp',true),roughness:.78});
  const rock=new THREE.InstancedMesh(geo,rockMat,5000);
  // One tussock contains tapered, curved blades with differently lit faces and rooted shading.
  const blades=[],tints=[],indices=[];
  for(let i=0;i<24;i++){
    const a=i*2.39996,rad=.10*Math.sqrt(i/24),dx=Math.cos(a),dz=Math.sin(a);
    const h=.23+.23*(.5+.5*Math.sin(i*6.23+.7*i*i)),lean=.10+.17*(.5+.5*Math.sin(i*7.73));
    const start=blades.length/3;
    for(let step=0;step<4;step++){
      const f=step/3,w=(1-f*.97)*(.010+.006*(i%3)),r=rad+lean*f*f;
      for(const side of [-1,1]){
        blades.push(dx*r+dz*w*side,h*f*(1-.15*f),dz*r-dx*w*side);
        const lit=.38+.62*f, hue=.55+.45*Math.cos(i*3.);
        tints.push(lit*(arid?.68:.15+.11*hue),lit*(arid?.54:.27+.1*hue),lit*(arid?.27:.062));
      }
    }
    for(let s=0;s<3;s++){const j=start+s*2;indices.push(j,j+1,j+2,j+1,j+3,j+2);}
  }
  const grassGeo=new THREE.BufferGeometry();
  grassGeo.setAttribute('position',new THREE.Float32BufferAttribute(blades,3));grassGeo.setAttribute('color',new THREE.Float32BufferAttribute(tints,3));grassGeo.setIndex(indices);grassGeo.computeVertexNormals();
  const grassMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide});
  const plantWind=window.getCanopyWind(THREE,scene);
  grassMat.onBeforeCompile=s=>{
    Object.assign(s.uniforms,plantWind.uniforms);
    s.uniforms.habitatTime=clock;s.vertexShader=plantWind.glsl+'\nuniform float habitatTime;\n'+s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vec2 root=instanceMatrix[3].xz;
      vec2 field=plantFront(root),motion=plantMotion(root,field,habitatTime,.94);
      vec3 bx=instanceMatrix[0].xyz,bz=instanceMatrix[2].xyz;
      vec2 offset=motion*position.y*position.y*3.2*length(instanceMatrix[1].xyz);
      transformed.x+=dot(offset,bx.xz)/max(.001,dot(bx,bx));
      transformed.z+=dot(offset,bz.xz)/max(.001,dot(bz,bz));`);
  };
  const grass=new THREE.InstancedMesh(grassGeo,grassMat,3400);
  const wood=new THREE.InstancedMesh(new THREE.CylinderGeometry(.65,1,1,9,2),new THREE.MeshStandardMaterial({map:repeat('shore-bark.webp',true),color:0xc8bb99,roughness:.97}),480);
  const objects=[rock,grass,wood],tmp=new THREE.Object3D(),col=new THREE.Color(),up=new THREE.Vector3(0,1,0);
  for(const o of objects){o.count=0;o.frustumCulled=false;o.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(o);}
  function put(mesh,x,y,z,sx,sy,sz,ax,az,angle){
    if(mesh.count>=mesh.instanceMatrix.count)return;
    tmp.position.set(x,y,z);tmp.scale.set(sx,sy,sz);tmp.rotation.set(ax,angle,az);tmp.updateMatrix();mesh.setMatrixAt(mesh.count++,tmp.matrix);
  }
  function branch(x,z,angle,length,radius){
    if(wood.count>=wood.instanceMatrix.count)return;
    const dx=Math.cos(angle)*length,dz=Math.sin(angle)*length;
    const y1=surface(x,z)+radius*.55,y2=surface(x+dx,z+dz)+radius*.75;
    const dir=new THREE.Vector3(dx,y2-y1,dz);
    tmp.position.set(x+dx*.5,(y1+y2)*.5,z+dz*.5);tmp.scale.set(radius,dir.length(),radius*.84);
    tmp.quaternion.setFromUnitVectors(up,dir.normalize());tmp.updateMatrix();wood.setMatrixAt(wood.count++,tmp.matrix);
  }
  const cache=new Map();
  function populate(cx,cz){
    const entries=[];let seed=(Math.imul(cx,1376312589)^Math.imul(cz,668265263)^717)>>>0;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<126;i++){
      const x=(cx+random())*16,z=(cz+random())*16;
      const u=Math.floor((.5+x/(2*extent))*resolution),v=Math.floor((.5+z/(2*extent))*resolution);
      if(u<0||u>=resolution||v<0||v>=resolution)continue;
      const k=(v*resolution+u)*4, measured=marginImage?bankDistance(x,z):Infinity;
      const bank=Number.isFinite(measured)?-measured:(habitatPixels[k]/255-.5)*96,veg=habitatPixels[k+1]/255;
      if(bank< -4.5||(habitatPixels[k+2]>134&&Math.abs(bank)>4.5))continue;
      const underlying=surface(x,z), h=arid?underlying:Math.max(underlying,beachHeight(x,z,underlying));
      const slope=Math.hypot(surface(x+1,z)-underlying,surface(x,z+1)-underlying);
      if(slope>1.15)continue;
      const chance=random(),angle=random()*Math.PI*2;
      if(i<64&&chance < (bank<25?.66:.07)*(1-.64*veg)){
        const b=random(),s=.052+.38*b**3+(i<2?.37*b:0);
        entries.push([0,x,h+s*.12,z,s*(1+random()*.6),s*(.39+random()*.46),s*(.66+random()*.43),random()*.34,random()*.3,angle,random()]);
      }else if(bank>1.8&&slope<.9&&chance<.025+veg*(arid?.65:1.65)){
        const s=.6+random()*1.08;
        entries.push([1,x,h-.065,z,s,s*(.62+.58*random()),s,0,0,angle,0]);
      }else if(i===1&&bank>0&&bank<7&&slope<.45){
        entries.push([2,x,h,z,1.8+4*random(),.08+.21*random(),0,0,0,angle,0]);
      }
    }
    return entries;
  }
  let prevX,prevZ,low=false;
  return function update(player,time){
    clock.value=time;
    const cx=Math.floor(player.x/16),cz=Math.floor(player.z/16),ground=world.height(player.x,player.z);
    // Leave the scene populated during short climbs near a hillside.
    const active=player.y-ground<(low?145:125);
    if(!habitatPixels||(active===low&&cx===prevX&&cz===prevZ))return;
    low=active;prevX=cx;prevZ=cz;
    for(const o of objects)o.count=0;
    if(!active)return;
    tileMap.clear();
    for(const key of cache.keys()){const [x,z]=key.split(',').map(Number);if(Math.abs(x-cx)>4||Math.abs(z-cz)>4)cache.delete(key);}
    for(let iz=-4;iz<=4;iz++)for(let ix=-4;ix<=4;ix++){
      if(ix*ix+iz*iz>21)continue;
      const x=cx+ix,z=cz+iz,key=x+','+z;
      let e=cache.get(key);
      if(!e){e=populate(x,z);cache.set(key,e);}
      for(const [type,x,y,z,sx,sy,sz,ax,az,angle,r] of e){
        if(type===2){branch(x,z,angle,sx,sy);branch(x+.35*sx*Math.cos(angle),z+.35*sx*Math.sin(angle),angle+1.05,sx*.30,sy*.35);continue;}
        const mesh=objects[type];if(mesh.count>=mesh.instanceMatrix.count)continue;
        if(type===0)mesh.setColorAt(mesh.count,col.setHSL((arid?.057:.075)+r*.037,.045+r*(arid?.34:.16),.38+.49*r));
        put(mesh,x,y,z,sx,sy,sz,ax,az,angle);
      }
    }
    for(const o of objects){o.instanceMatrix.needsUpdate=true;if(o.instanceColor)o.instanceColor.needsUpdate=true;}
  };
};
