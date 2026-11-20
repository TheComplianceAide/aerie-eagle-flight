// Stream stable, metre-scale patches. Photographed meshes turn into captures of
// those same plants at distance. The near layer preserves parallax between leaves.
(() => {
  const profiles = {
    // Relative abundance of meadow grass, sedge, low grass, fern, herbaceous shrub,
    // tall herb and woody scrub, followed by stature, density and dry-leaf fraction.
    alaska:          [[23,23,6,19,13,10,6], .87, .81, .09],
    swiss:           [[40,18,15,8,6,12,1], .87, .92, .17],
    canyon:          [[8,0,57,0,4,0,31], .57, .42, .80],
    yosemite:        [[28,22,10,15,13,7,5], 1.04, .83, .23],
    crater:          [[25,19,15,8,10,7,16], .72, .69, .23],
    lofoten:         [[13,47,16,2,7,5,10], .65, .83, .25],
    milford:         [[6,19,4,42,16,12,1], 1.30, 1.0, .05],
    dixville:        [[13,19,11,29,16,8,4], .87, .85, .16],
    labrador:        [[9,23,13,10,20,4,21], .68, .71, .08],
    winnipesaukee:   [[27,17,12,18,12,11,3], .91, .91, .14],
    surry:           [[25,19,14,15,11,14,2], .94, .91, .09],
    moosehead:       [[16,23,8,24,15,10,4], .95, .93, .19]
  };
  window.aerieSoil=region=>region==='canyon'?'dry':
    ['dixville','surry','moosehead','winnipesaukee'].includes(region)?'temperate':
    region==='milford'?'rainforest':'boreal';
  // Continuous mirrored UVs preserve derivatives at tile boundaries on WebGL 1 and 2.
  window.aerieFloorShader=`
    vec4 soilSample(sampler2D field,vec2 p,float woodland){
      vec2 phase=abs(mod(p,2.)-1.);
      return texture2D(field,vec2(.004+.992*phase.x,(1.-woodland+.004+.992*phase.y)*.5));
    }
    vec3 floorColor(sampler2D field,vec2 xz,float woodland){
      vec2 p=xz*.34;
      float soilBlend=smoothstep(-.57,.57,sin(p.x*.27+.4*sin(p.y*.43))+cos(p.y*.33));
      vec2 spun=mat2(.84,-.54,.54,.84)*p+vec2(.37,.68);
      vec4 openFloor=soilSample(field,p,0.);
      vec4 forestFloor=soilSample(field,spun,1.);
      vec4 f=mix(openFloor,forestFloor,smoothstep(.14,.89,woodland+.25*(soilBlend-.5)));
      return f.rgb*(.83+.35*f.a);
    }`;
  const baseHeights=[.40,.64,.18,.78,.96,.74,1.06];
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  window.aerieWind=(x,z,t)=>.5+.5*Math.sin(.69*t+.033*x+.018*z);
  function readMap(loader,file){
    let pixels,w,h;
    const map=loader.load(file,tex=>{
      w=tex.image.width;h=tex.image.height;
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
      const context=canvas.getContext('2d',{willReadFrequently:true});
      context.drawImage(tex.image,0,0);pixels=context.getImageData(0,0,w,h).data;
      map.dispose();
    });
    return (u,v)=>pixels&&u>=0&&v>=0&&u<1&&v<1?pixels[(Math.floor(u*w)+Math.floor(v*h)*w)*4]/255:0;
  }
  window.addUnderstory=function addUnderstory(T,scene,world){
    const wind=window.getCanopyWind(T,scene);
    const wildlife=window.addRegionalWildlife(T,scene,world);
    const {region,habitat}=world,[weights,scale,density,dry]=profiles[region];
    const loader=new T.TextureLoader(),half=world.coverHalf;
    const photo=half?readMap(loader,'cover-'+region+'.png'):null;
    const downtown=region==='surry'?readMap(loader,'cover-keene-streets.png'):null;
    const survey=world.elevation||world.height;
    function suitability(x,z){
      let cover=world.groundCover(x,z);
      if(cover<0)return 0;
      if(photo){
        const local=downtown&&x>1640&&x<2280&&z>4210&&z<4930;
        const green=local?downtown((x-1640)/640,(z-4210)/720):photo(.5+x/(2*half),.5+z/(2*half));
        if(local)return clamp((green-.43)*2,0,1);
        cover=Math.max(cover*.73,green*.86);
      }
      return cover;
    }
    world.vegetationAt=suitability;
    const group=new T.Group();group.name='Scanned ground vegetation';scene.add(group);
    const records=window.aeriePlants,clock={value:0};
    const nearMap=loader.load('understory-leaves.webp'),standMap=loader.load('understory-stands.webp');
    for(const map of [nearMap,standMap]){map.anisotropy=4;map.colorSpace=T.SRGBColorSpace;}
    const sun=world.sunDirection||new T.Vector3(-.5,.62,-.6).normalize();
    const lightMap=world.sunMask,lightSpan=world.forestLightSpan||(region==='alaska'?9600:8000);
    const uniforms={...wind.uniforms,clock,sun:{value:sun},leaves:{value:nearMap},stands:{value:standMap},dryness:{value:dry},
      terrainLight:{value:lightMap||null},lightSpan:{value:lightSpan}};
    const coarse=matchMedia('(pointer: coarse)').matches,reach=coarse?80:106,near=coarse?13:20;
    const vertex=(far)=>`
      ${wind.glsl}
      attribute vec4 planting;attribute vec4 trait;
      uniform float clock,lightSpan;uniform vec3 sun;uniform sampler2D terrainLight;
      varying vec2 coord;varying float illum,variation,edge,viewIndex,kind;
      void main(){
        vec3 root=planting.xyz;float h=planting.w;kind=trait.z;
        float a=trait.x,ca=cos(a),sa=sin(a);
        vec3 look=normalize(cameraPosition-root-vec3(0.,h*.5,0.));
        float d=distance(cameraPosition,root);
        vec2 front=plantFront(root.xz);
        float ripple=sin(clock*2.8+root.z*.27+a);
        vec3 p;
        ${far?`
          float bearing=atan(look.x,look.z)-a;
          viewIndex=look.y>.84?3.:look.y>.45?2.:cos(bearing)>.0?0.:1.;
          vec3 right=normalize(vec3(look.z+.00001,0.,-look.x)),up=cross(look,right);
          p=root+vec3(0.,.50*h,0.)+abs(trait.w)*h*(right*position.x+up*position.y);
          coord=vec2((viewIndex+.005+.99*uv.x)*.25,(7.-kind+.005+.99*uv.y)*.125);
          illum=.94;
          edge=(kind>5.5||trait.w<0.?1.:smoothstep(${near-3}.,${near+3}.,d))*(1.-smoothstep(${reach-18}.,${reach}.,d));
        `:`
          p=root+h*vec3(ca*position.x+sa*position.z,position.y,-sa*position.x+ca*position.z);
          vec3 n=normalize(vec3(ca*normal.x+sa*normal.z,normal.y,-sa*normal.x+ca*normal.z));
          coord=vec2((mod(kind,4.)+.003+.994*uv.x)*.25,(1.-floor(kind/4.)+.003+.994*(1.-uv.y))*.5);
          float scatter=pow(max(dot(-look,sun),0.),2.)*(1.-abs(dot(n,look))*.55);
          illum=.70+.22*abs(dot(n,sun))+.14*max(0.,n.y)+.29*scatter;
          viewIndex=0.;edge=1.-smoothstep(${near-3}.,${near+3}.,d);
        `}
        float tip=clamp((p.y-root.y)/h,0.,1.);
        vec2 motion=plantMotion(root.xz,front,clock,.92);
        float flex=kind<2.5?1.55:kind<5.5?.89:.55;
        p.xz+=h*tip*tip*flex*(motion+canopyDownwind*(.018+.035*front.x)*ripple);
        p.y-=h*tip*tip*dot(motion,motion)*flex*.62;
        illum*=1.+tip*front.x*(.15+.09*ripple);
        float shadow=${lightMap?'texture2D(terrainLight,vec2(root.x,-root.z)/lightSpan+.5).r':'1.'};
        illum*=mix(.67,1.09,shadow)*(.71+.29*tip);
        variation=trait.y;
        gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
      }`;
    function material(far){
      return new T.ShaderMaterial({uniforms,side:T.DoubleSide,vertexShader:vertex(far),fragmentShader:`
        uniform sampler2D leaves,stands;uniform float dryness;
        varying vec2 coord;varying float illum,variation,edge,viewIndex,kind;
        void main(){
          vec4 tex=texture2D(${far?'stands':'leaves'},coord);
          float noise=fract(dot(gl_FragCoord.xy,vec2(.754877666,.569840296)));
          if(tex.a<.32||${far?'noise':'1.-noise'}>edge)discard;
          vec3 c=tex.rgb*(.87+.24*variation);
          float lum=dot(c,vec3(.27,.62,.11));c=mix(c,lum*vec3(1.30,1.04,.67),dryness*(.6+.38*variation));
          gl_FragColor=vec4(c*illum,1.);
          #include <colorspace_fragment>
        }`});
    }
    function typed(data,Type){
      const raw=atob(data),bytes=new Uint8Array(raw.length);
      for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
      return new Type(bytes.buffer);
    }
    const nearMat=material(false),farMat=material(true);
    function batch(geom,mat,capacity){
      const geometry=new T.InstancedBufferGeometry();geometry.setIndex(geom.index);
      for(const [name,attribute] of Object.entries(geom.attributes))geometry.setAttribute(name,attribute);
      for(const name of ['planting','trait'])geometry.setAttribute(name,new T.InstancedBufferAttribute(new Float32Array(4*capacity),4).setUsage(T.DynamicDrawUsage));
      geometry.instanceCount=0;const mesh=new T.Mesh(geometry,mat);mesh.frustumCulled=false;group.add(mesh);return geometry;
    }
    const fine=records.map(r=>{
      if(!r.p)return null;
      const g=new T.BufferGeometry();
      g.setAttribute('position',new T.Float32BufferAttribute(Float32Array.from(typed(r.p,Int16Array),v=>v/8192),3));
      g.setAttribute('normal',new T.Int8BufferAttribute(typed(r.n,Int8Array),3,true));
      g.setAttribute('uv',new T.Uint16BufferAttribute(typed(r.u,Uint16Array),2,true));
      g.setIndex(new T.BufferAttribute(typed(r.i,Uint16Array),1));return batch(g,nearMat,coarse?100:220);
    });
    const far=batch(new T.PlaneGeometry(1,1),farMat,coarse?3800:7200);
    // A close softstem bulrush clump has cylindrical stems, small terminal
    // seed clusters and keeled blades. The base stays buried while a gust
    // bends the culm and twists the lighter blades further downwind.
    function rushGeometry(){
      const pos=[],colors=[],idx=[];
      const v=(x,y,z,c)=>{colors.push(...c);pos.push(x,y,z);return pos.length/3-1;};
      const green=[.095,.165,.043],light=[.219,.281,.063],edge=[.205,.218,.066];
      for(let n=0;n<10;n++){
        const a=n*2.39996,r=.23*Math.sqrt(n/10),dx=Math.cos(a),dz=Math.sin(a);
        const h=.58+.38*(.5+.5*Math.cos(n*3.15+.42*n*n)),slant=.045+.09*(n%4)/3;
        let prev;
        for(let j=0;j<5;j++){
          const f=j/4,rad=(.003+.0037*(1-f)),ring=[];
          for(let k=0;k<4;k++){
            const theta=k*1.5708;ring.push(v(dx*(r+slant*f*f)+rad*Math.cos(theta),h*f,dz*(r+slant*f*f)+rad*Math.sin(theta),k===1?light:green));
          }
          if(prev)for(let k=0;k<4;k++){const next=(k+1)%4;idx.push(prev[k],ring[k],prev[next],prev[next],ring[k],ring[next]);}
          prev=ring;
        }
        if(n%3!==1){
          const x=dx*(r+slant),z=dz*(r+slant),seed=[.145,.081,.026];
          const tip=v(x,h+.016,z,seed),low=v(x-.010,h-.057,z-.009,seed);
          for(let k=0;k<5;k++){
            const a=k*1.25664,b=(k+1)*1.25664;
            const u=v(x+.016*Math.cos(a),h-.014,z+.016*Math.sin(a),seed);
            const t=v(x+.016*Math.cos(b),h-.014,z+.016*Math.sin(b),[.205,.124,.035]);idx.push(low,u,t,tip,t,u);
          }
        }
        for(let b=0;b<3;b++){
          const a2=a+b*2.10+.53,ex=Math.cos(a2),ez=Math.sin(a2);
          let back;
          for(let j=0;j<6;j++){
            const u=j/5,head=u*u,reach=.08*u+.30*head;
            const x=dx*r+ex*reach,z=dz*r+ez*reach,y=h*(.84*u-.18*head);
            const wide=.013*(1-.91*u)+.004*Math.sin(u*Math.PI);
            const row=[v(x-ez*wide,y,z+ex*wide,edge),v(x+ex*wide*.45,y+.005,z+ez*wide*.45,light),v(x+ez*wide,y,z-ex*wide,green)];
            if(back)idx.push(back[0],row[0],row[1],back[0],row[1],back[1],back[1],row[1],row[2],back[1],row[2],back[2]);
            back=row;
          }
        }
      }
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
      g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setIndex(idx);return g;
    }
    const rushMat=new T.ShaderMaterial({uniforms,side:T.DoubleSide,vertexShader:`
      ${wind.glsl}
      attribute vec3 color;attribute vec4 planting,trait;uniform float clock;
      varying vec3 hue;
      void main(){
        vec2 root=planting.xz,front=plantFront(root),motion=plantMotion(root,front,clock,.91);
        float a=trait.x,h=planting.w,height=position.y;
        vec3 p=vec3(cos(a)*position.x+sin(a)*position.z,height,-sin(a)*position.x+cos(a)*position.z);
        float flick=sin(4.2*clock+dot(p.xz,vec2(8.,9.))+.079*root.y+a);
        p.xz+=height*height*(1.52*motion+.022*front.x*flick*vec2(-canopyDownwind.y,canopyDownwind.x));
        p.y-=.94*height*height*dot(motion,motion);
        hue=color*(.58+.50*height)*(.77+.35*trait.y)*(1.+front.x*(.18+.12*flick));
        gl_Position=projectionMatrix*viewMatrix*vec4(planting.xyz+h*p,1.);
      }`,fragmentShader:`varying vec3 hue;void main(){gl_FragColor=vec4(hue,1.);
        #include <colorspace_fragment>
      }`});
    const lakesideRushes=['moosehead','winnipesaukee','surry','dixville','labrador'].includes(region);
    const rush=lakesideRushes?batch(rushGeometry(),rushMat,coarse?180:330):null;
    const size=12,tiles=new Map(),bounds=world.bounds;
    // Flat freshwater margins support discontinuous sedge beds. Keep their
    // roots tied to the mapped shore and the displayed gravel shelf. Settlement
    // pavement, steep rock and deep water remain clear.
    const bankPatches=new Map(),lake=window.ATLAS_SURVEYS?.[region];
    if(lake?.shore&&lakesideRushes){
      for(const ring of [lake.shore,...(lake.shoreHoles||[])]){
        for(let i=0,j=ring.length-1;i<ring.length;j=i++){
          const [ax,az]=ring[j],[bx,bz]=ring[i],dx=bx-ax,dz=bz-az;
          const count=Math.max(1,Math.ceil(Math.hypot(dx,dz)/4.5));
          for(let k=0;k<count;k++){
            const u=(k+.5)/count,x=ax+dx*u,z=az+dz*u;
            if(Math.sin(.021*x+.011*z)+.73*Math.sin(.043*z-.036*x)<-.13)continue;
            const key=Math.floor(x/size)+'|'+Math.floor(z/size);
            let arr=bankPatches.get(key);if(!arr)bankPatches.set(key,arr=[]);arr.push(x,z);
          }
        }
      }
    }

    function patch(ix,iz){
      const key=ix+'|'+iz;
      if(tiles.has(key))return tiles.get(key);
      let seed=(Math.imul(ix,374761393)^Math.imul(iz,668265263))>>>0;
      const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
      const result=[];tiles.set(key,result);
      const bank=bankPatches.get(key),water=world.waterLevel;
      if(bank&&Number.isFinite(water)){
        // Use a separate sequence so reeds do not rearrange established plants.
        let growSeed=seed;const grow=()=>((growSeed=(Math.imul(growSeed,1664525)+1013904223)>>>0)/4294967296);
        for(let n=0;n<bank.length;n+=2)for(let j=0;j<5;j++){
          const x=bank[n]+(grow()-.5)*4.8,z=bank[n+1]+(grow()-.5)*4.8;
          const surveyed=survey(x,z),bed=world.height(x,z);
          if(bed>water+1.25||surveyed<water-1.0||surveyed>water+1.35)continue;
          if(Math.hypot(world.height(x+1,z)-bed,world.height(x,z+1)-bed)>.47)continue;
          if((world.clearance?.(x,z)??bed)>bed+.5)continue;
          const root=bed>water+.18?bed:Math.max(water-.22,surveyed);
          const h=.84+.64*grow();
          result.push([x,Math.max(root,habitat.surface(x,z))-.04,z,h,grow()*6.283,grow(),7,1.1]);
        }
      }
      for(let i=0;i<10;i++){
        const cx=(ix+rand())*size,cz=(iz+rand())*size,c=suitability(cx,cz);
        if(c<.07||rand()>c*density)continue;
        let kind=0,draw=rand()*100;while(kind<6&&draw>=weights[kind])draw-=weights[kind++];
        const count=kind<3?4+Math.floor(rand()*6):1+Math.floor(rand()*3);
        for(let j=0;j<count;j++){
          const x=cx+(rand()-.5)*4.8,z=cz+(rand()-.5)*4.8;
          if(bounds&&(x<bounds.minX||x>bounds.maxX||z<bounds.minZ||z>bounds.maxZ))continue;
          const suitable=suitability(x,z);
          if(suitable<.055||habitat.wet(x,z,survey(x,z)))continue;
          const y=habitat.surface(x,z),slope=Math.hypot(habitat.surface(x+1,z)-y,habitat.surface(x,z+1)-y);
          if(slope>(kind===3?1.27:1.05)||!Number.isFinite(y))continue;
          result.push([x,y-.025,z,baseHeights[kind]*scale*(.57+rand()*.93),rand()*6.283,rand(),kind,records[kind].span]);
        }
      }
      return result;
    }
    function put(g,p,full=false){
      const i=g.instanceCount;if(i>=g.attributes.trait.count)return false;
      g.attributes.planting.setXYZW(i,p[0],p[1],p[2],p[3]);
      g.attributes.trait.setXYZW(i,p[4],p[5],p[6],full?-p[7]:p[7]);g.instanceCount++;return true;
    }
    const last=new T.Vector3(Infinity,Infinity,Infinity);
    const batches=[rush,far,...fine].filter(Boolean);
    return (eye,t)=>{
      wind.update(world.windField,eye,t);
      wildlife(eye,t);
      clock.value=t;
      if(last.distanceToSquared(eye)<16)return;
      last.copy(eye);const gap=eye.y-habitat.surface(eye.x,eye.z);
      group.visible=gap<reach+48;if(!group.visible)return;
      for(const g of batches)g.instanceCount=0;
      if(tiles.size>1800)tiles.clear();
      // Fill nearest cells first so the budget at high density never hollows out the foreground.
      const mx=Math.floor(eye.x/size),mz=Math.floor(eye.z/size),limit=Math.ceil(reach/size);
      for(let ring=0;ring<=limit;ring++)for(let v=-ring;v<=ring;v++)for(let u=-ring;u<=ring;u++){
        if(Math.max(Math.abs(u),Math.abs(v))!==ring)continue;
        for(const p of patch(mx+u,mz+v)){
          const d=(eye.x-p[0])**2+(eye.y-p[1])**2+(eye.z-p[2])**2;
          if(d>reach*reach)continue;
          if(p[6]===7){if(d<(coarse?47:67)**2)put(rush,p);continue;}
          const close=d<(near+9)**2&&fine[p[6]];
          const overflow=close&&!put(fine[p[6]],p);
          if(overflow||d>(near-9)**2||!fine[p[6]])put(far,p,overflow);
        }
      }
      for(const g of batches){g.attributes.planting.needsUpdate=true;g.attributes.trait.needsUpdate=true;}
    };
  };
})();
