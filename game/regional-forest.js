// Sparse regions need visible crowns between the close model range and the
// photographed landscape. Every capture below uses the close model at its own
// actual fill root. Original forest cells keep their established distant layer.
(() => {
  'use strict';
  const CELL=128;
  function captureRow(tree){
    const species=tree.aerieSpecies;
    if(species.family==='shrub')return species.shape[0]>.96?7:6;
    if(species.family==='needle'){
      const seed=(Math.imul(Math.round(tree.x*4),73856093)^Math.imul(Math.round(tree.z*4),19349663))>>>0;
      return 3+((seed>>>8)%3);
    }
    return species.shape[0]>.55?1:species.shape[3]<.77?2:0;
  }
  window.makeRegionalForest=function makeRegionalForest(T,scene,world,loader){
    const mobile=matchMedia('(pointer: coarse)').matches;
    const reach=mobile?920:1740,cap=mobile?3600:13200;
    const cover=window.aerieCanopyProfile(world),image=loader.load('regional-crowns.webp');
    image.anisotropy=4;image.colorSpace=T.NoColorSpace;
    const root=new T.InstancedBufferAttribute(new Float32Array(3*cap),3).setUsage(T.DynamicDrawUsage);
    const traits=new T.InstancedBufferAttribute(new Float32Array(4*cap),4).setUsage(T.DynamicDrawUsage);
    const tint=new T.InstancedBufferAttribute(new Float32Array(3*cap),3).setUsage(T.DynamicDrawUsage);
    const plane=new T.PlaneGeometry(1,1),geo=new T.InstancedBufferGeometry();geo.setIndex(plane.index);
    geo.setAttribute('position',plane.attributes.position);geo.setAttribute('uv',plane.attributes.uv);
    geo.setAttribute('rootPosition',root);geo.setAttribute('dimensions',traits);geo.setAttribute('crownTone',tint);geo.instanceCount=0;
    let landscape=null;
    scene.traverse(node=>{
      if(landscape)return;
      const u=node.material?.uniforms;
      if(u?.aerial&&u.ranges&&u.halfMap&&u.farSpan){
        landscape={near:u.aerial,far:u.ranges,nearHalf:u.halfMap.value,farSize:u.farSpan.value};
      }else if(world.region==='alaska'&&u?.outerPhoto){
        landscape={near:u.outerPhoto,far:u.outerPhoto,nearHalf:18000,farSize:36000};
      }
    });
    const material=new T.ShaderMaterial({side:T.DoubleSide,uniforms:{captures:{value:image},
      nearLandscape:landscape?.near||{value:null},farLandscape:landscape?.far||{value:null},
      sunMap:{value:world.sunMask||null},span:{value:world.forestLightSpan||8000},
      haze:{value:scene.fog?.color.clone()||new T.Color(.64,.68,.69)},season:{value:world.region==='dixville'?1:world.region==='surry'?2:0}},
      vertexShader:`attribute vec3 rootPosition,crownTone;attribute vec4 dimensions;uniform float span,season;uniform sampler2D sunMap,nearLandscape,farLandscape;
        varying vec2 card;varying vec4 blend;varying vec3 tint,landTone;varying float range,kind;
        void main(){
          float h=dimensions.x,w=dimensions.y;kind=dimensions.w;
          vec3 center=rootPosition+vec3(0.,h*.49,0.);
          vec3 view=normalize(cameraPosition-center);
          vec3 right=normalize(vec3(view.z+.000001,0.,-view.x)),up=cross(view,right);
          float angle=atan(view.x,view.z)-dimensions.z,y=max(0.,view.y);
          float elevation=smoothstep(.15,.58,y),over=smoothstep(.64,.94,y),flank=.5-.5*cos(angle);
          blend=vec4((1.-elevation)*(1.-flank),(1.-elevation)*flank,elevation*(1.-over),over);
          float vertical=sqrt(max(.0001,h*h*(1.-y*y)+w*w*y*y));
          vec3 p=center+1.20*(right*position.x*w+up*position.y*vertical);
          card=uv;range=distance(cameraPosition,center);
          landTone=vec3(.0);
          ${landscape?`vec2 geo=vec2(rootPosition.x,-rootPosition.z);float maximum=max(abs(geo.x),abs(geo.y));
            vec3 local=texture2D(nearLandscape,.5+geo/${(2*landscape.nearHalf).toFixed(1)}).rgb;
            vec3 distant=texture2D(farLandscape,.5+geo/${landscape.farSize.toFixed(1)}).rgb;
            landTone=mix(local,distant,smoothstep(${(landscape.nearHalf-155).toFixed(1)},${landscape.nearHalf.toFixed(1)},maximum));`:''}
          float groundLight=1.;
          ${world.sunMask?`vec2 suv=.5+vec2(rootPosition.x,-rootPosition.z)/span;
            if(all(greaterThan(suv,vec2(0.)))&&all(lessThan(suv,vec2(1.))))groundLight=texture2D(sunMap,suv).r;`:''}
          tint=crownTone*mix(vec3(.68,.73,.78),vec3(1.),groundLight);
          gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
        }`,
      fragmentShader:`uniform sampler2D captures;uniform vec3 haze;uniform float season;
        varying vec2 card;varying vec4 blend;varying vec3 tint,landTone;varying float range,kind;
        vec4 capture(float side){return texture2D(captures,vec2((side+.006+.988*card.x)*.25,(7.-kind+.006+.988*card.y)*.125));}
        void main(){
          vec4 a=capture(0.),b=capture(1.),c=capture(2.),d=capture(3.);
          vec4 weight=blend*vec4(a.a,b.a,c.a,d.a);float cover=dot(weight,vec4(1.));
          float edge=1.-smoothstep(${Math.round(reach*.71)}.,${reach}.,range);
          float dither=fract(dot(floor(gl_FragCoord.xy),vec2(.75487767,.5698403)));
          if(cover<mix(.19,.085,smoothstep(320.,1000.,range))||dither>edge)discard;
          vec3 foliage=(a.rgb*weight.x+b.rgb*weight.y+c.rgb*weight.z+d.rgb*weight.w)/max(cover,.001);
          if(kind<2.5&&season>.5){
            float l=dot(foliage,vec3(.25,.61,.14));float green=smoothstep(.009,.065,foliage.g-min(foliage.r,foliage.b));
            foliage=mix(foliage,l*(season>1.5?vec3(.84,1.01,.71):vec3(1.55,1.11,.53)),.79*green);
          }
          vec3 color=foliage*tint;
          ${landscape?`float photoY=dot(landTone,vec3(.25,.61,.14)),leafY=dot(color,vec3(.25,.61,.14));
            float airborne=smoothstep(120.,950.,range);
            vec3 register=landTone*(.72+.40*clamp(leafY/.22,.4,1.6));
            color=mix(color,register,airborne*(.53+.30*smoothstep(650.,${reach}.,range))*smoothstep(.025,.13,photoY));`:''}
          float veil=min(.25,range*.000074);
          gl_FragColor=vec4(mix(color,haze,veil),1.);
        }`});
    material.userData.canopyRoot='rootPosition';
    const mesh=new T.Mesh(geo,material);mesh.name='Regional forest beyond original crowns';mesh.frustumCulled=false;mesh.visible=false;scene.add(mesh);
    const cells=new Map();let queue=[],visible=[],lastBuild=-Infinity,nextScan=-Infinity,installed=false,dirty=false;
    let lastX=Infinity,lastZ=Infinity,lastY=Infinity,instances=0,occupied=0,sampled=0;
    const stats=()=>({instances,cached:cells.size,pending:queue.length,sampled,occupied,reach,capacity:cap});
    world.regionalForestStats=stats;
    const inBounds=(x,z)=>{const b=world.bounds;return !b||x+CELL>b.minX&&z+CELL>b.minZ&&x<b.maxX&&z<b.maxZ;};
    function arrange(eye,now){
      const ci=Math.floor(eye.x/CELL),cj=Math.floor(eye.z/CELL),n=Math.ceil(reach/CELL);
      const locations=[];const within=new Set();
      for(let j=cj-n;j<=cj+n;j++)for(let i=ci-n;i<=ci+n;i++){
        const x=i*CELL,z=j*CELL;
        if(!inBounds(x,z))continue;
        const d=(x+CELL*.5-eye.x)**2+(z+CELL*.5-eye.z)**2;
        if(d>(reach+CELL*.45)**2)continue;
        const k=i+','+j;locations.push({i,j,k,d});within.add(k);
      }
      locations.sort((a,b)=>a.d-b.d);visible=locations;queue=locations.filter(it=>!cells.has(it.k));
      for(const k of cells.keys())if(!within.has(k))cells.delete(k);
      lastX=eye.x;lastZ=eye.z;lastY=eye.y;nextScan=now+150;dirty=true;
    }
    function derive(it,canopy){
      if(canopy.hasOriginalCell(it.i,it.j)){occupied++;return null;}
      const neighbors=canopy.getCanopyNeighbors(it.i,it.j);
      const trees=cover.fillCell(it.i,it.j,CELL,neighbors);if(!trees.length)return null;
      const a=new Float32Array(trees.length*10);let n=0;
      for(const t of trees){
        const s=t.aerieSpecies,h=t.height*s.stature;if(h<.38)continue;
        // Use the close engine's root height, horizontal footprint and yaw.
        const raw=(Math.imul(Math.round(t.x*4),73856093)^Math.imul(Math.round(t.z*4),19349663))>>>0;
        const width=Math.max(.36,t.width*s.aspect),gain=.90+(raw%997)/997*.19;
        a.set([t.x,t.y-Math.min(.16,h*.025),t.z,h,width/.68,(raw%104729)/104729*Math.PI*2,captureRow(t),s.tint[0]*gain,s.tint[1]*gain,s.tint[2]*gain],10*n++);
      }
      sampled++;return n?a.subarray(0,n*10):null;
    }
    function upload(eye){
      let written=0,available=0;
      for(const it of visible)available+=(cells.get(it.k)?.length||0)/10;
      const density=Math.min(1,cap/(available*.29||1));
      for(const it of visible){
        const rows=cells.get(it.k);if(!rows)continue;
        for(let i=0;i<rows.length;i+=10){
          // Small shrubs below the visual footprint of a display pixel yield their
          // budget to resolvable trees. The closest trees always remain present.
          const dy=rows[i+1]+rows[i+3]*.49-eye.y,dist=Math.sqrt(it.d+dy*dy),h=rows[i+3];
          if(dist>reach||dist>170&&h/(dist+1)<(mobile?.0048:.0034))continue;
          // A fixed per-tree key thins the distant levels over the entire visible
          // circle before applying the hard cap. It keeps a crowded hillside
          // from consuming every slot and revealing a circular forest edge.
          const fade=Math.max(0,(dist-165)/(reach-165));
          const keep=Math.exp(-3.45*fade**1.22)*(1-fade*(1-density));
          if(rows[i+5]/(Math.PI*2)>keep)continue;
          if(written>=cap)break;
          const v=written*3,t=written*4;
          root.array[v]=rows[i];root.array[v+1]=rows[i+1];root.array[v+2]=rows[i+2];
          traits.array[t]=h;traits.array[t+1]=rows[i+4];traits.array[t+2]=rows[i+5];traits.array[t+3]=rows[i+6];
          tint.array[v]=rows[i+7];tint.array[v+1]=rows[i+8];tint.array[v+2]=rows[i+9];written++;
        }
        if(written>=cap)break;
      }
      for(const attr of [root,traits,tint]){attr.clearUpdateRanges();attr.addUpdateRange(0,written*attr.itemSize);attr.needsUpdate=true;}
      geo.instanceCount=instances=written;mesh.visible=!!written;dirty=false;
    }
    return eye=>{
      const stream=world.canopyStream,now=performance.now();
      if(!stream?.hasOriginalCell||!stream.getCanopyNeighbors)return;
      if(!installed){
        if(stream.stats().indexedTrees!==(world.trees?.length||0))return;
        stream.maskMaterial(material,'rootPosition');installed=true;
      }
      if(now>=nextScan&&((eye.x-lastX)**2+(eye.z-lastZ)**2>42**2||Math.abs(eye.y-lastY)>38))arrange(eye,now);
      const start=performance.now(),limit=mobile?6:18;
      for(let i=0;i<limit&&queue.length;i++){
        const it=queue.shift();cells.set(it.k,derive(it,stream));dirty=true;
        if(performance.now()-start>(mobile?1.85:3.5))break;
      }
      if(dirty&&(now-lastBuild>(mobile?230:145)||!queue.length)){upload(eye);lastBuild=now;}
    };
  };
})();
