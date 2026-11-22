(() => {
  'use strict';
  const asset = name => window.aerieAssetURL?.('yellowstone-data/' + name) || 'yellowstone-data/' + name;
  const TAU=2*Math.PI, clamp=(v,a,b)=>Math.max(a,Math.min(v,b));
  const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
  function randomAt(i) {
    let n = Math.imul(i ^ (i >>> 14), 0x45d9f3b);
    n = Math.imul(n ^ (n >>> 14), 0x45d9f3b);
    return ((n ^ n >>> 16) >>> 0) / 4294967296;
  }
  const ventOptions=[
    // Plume size, thermal buoyancy, cycle length, offset, water jet height.
    ['faithful','faithful',4.8,25,88*60,9,44],
    ['hill-runoff','Beehive Geyser',3.7,11,2200,360,28],
    ['anemone','Anemone Geyser',2,5,540,311,4],
    ['grand','Grand Geyser',4,11,7200,2700,51],
    ['castle','Castle Geyser',4,14,8400,5600,25],
    ['giant','Giant Geyser',2,9,0,0,0],
    ['sawmill','Sawmill Geyser',2.6,6,0,0,0],
    ['blacksand','black-sand',3.9,10,0,0,0],
    ['sapphire','sapphire',7.3,12,0,0,0],
    ['morning','morning',4.4,9,0,0,0],
    ['prismatic','prismatic',21,22,0,0,0],
    ['excelsior','excelsior',12,17,0,0,0],
    ['fountain','fountain',6,9,0,0,0],
    ['lone','Lone Star Geyser',3.9,12,3600,1400,12]
  ];
  const scans=[
    ['old-faithful','faithful'],['castle','Castle Geyser'],
    ['giant','Giant Geyser'],['lone-star','Lone Star Geyser']
  ];

  async function surveyedSurface(T,scene,loader,ground,points,stem,key) {
    const response=await fetch(asset(stem+'.mesh'));
    if(!response.ok)throw new Error('Yellowstone 3D scan '+stem+': HTTP '+response.status);
    const bytes=await response.arrayBuffer();
    const header=new Uint32Array(bytes,0,4), n=header[1], indexCount=header[2], geo=header[3]===1;
    if(header[0]!==0x50443359||bytes.byteLength!==16+n*20+indexCount*4)throw new Error('Invalid Yellowstone 3D scan '+stem);
    const input=new Float32Array(bytes,16,n*5);
    const pos=new Float32Array(n*3),uv=new Float32Array(n*2);
    const geometry=new T.BufferGeometry();
    const [ax,az]=points[key];
    let minY=Infinity, maxY=-Infinity;
    for(let i=0;i<n;i++){minY=Math.min(input[i*5+1],minY);maxY=Math.max(input[i*5+1],maxY);}
    const yShift=geo?.055:ground(ax,az)-minY-(maxY-minY)*.11;
    for(let i=0;i<n;i++){
      const a=i*5;
      pos[i*3]=input[a]+(geo?0:ax);
      pos[i*3+1]=input[a+1]+yShift;
      pos[i*3+2]=input[a+2]+(geo?0:az);
      uv[i*2]=input[a+3]+.0005;uv[i*2+1]=input[a+4];
    }
    geometry.setAttribute('position',new T.BufferAttribute(pos,3));
    geometry.setAttribute('uv',new T.BufferAttribute(uv,2));
    const indices=new Uint32Array(bytes,16+n*20,indexCount);
    geometry.setIndex(new T.BufferAttribute(n<65535?Uint16Array.from(indices):indices,1));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    const bare=stem==='lone-star';
    const map=loader.load(bare?'atlas-jointed-rock.webp':asset(stem+'-scan.webp'));
    map.colorSpace=T.SRGBColorSpace;map.anisotropy=8;
    if(bare)map.wrapS=map.wrapT=T.RepeatWrapping;
    const mat=new T.MeshStandardMaterial({map,roughness:.88,metalness:0,color:bare?0xd3bc95:0xf0eee3,side:T.DoubleSide});
    const mesh=new T.Mesh(geometry,mat);
    mesh.name='Yellowstone · NPS photogrammetry · '+stem;
    mesh.userData.terrainCaster=true;
    mesh.userData.prepareFlightMaterial=true;
    scene.add(mesh);
    return {key,geo,mesh,range:geometry.boundingBox};
  }

  function architecture(T,scene,meta,ground,loader) {
    const managedBins = new Map(), SIZE=40, index=(x,z)=> Math.floor(x/SIZE)+':'+Math.floor(z/SIZE);
    function managedAt(x,z,reach) {
      for (let i=Math.floor((x-reach)/SIZE);i<=Math.floor((x+reach)/SIZE);i++) {
        for (let j=Math.floor((z-reach)/SIZE);j<=Math.floor((z+reach)/SIZE);j++) {
          const k=i+':'+j;
          if(!managedBins.has(k)) managedBins.set(k,[]);
          managedBins.get(k).push([x,z,reach]);
        }
      }
    }
    const wood=loader.load('acadia-keeper-clapboards.webp');
    wood.colorSpace=T.SRGBColorSpace;wood.wrapS=wood.wrapT=T.RepeatWrapping;wood.anisotropy=8;
    const roof=loader.load('acadia-egg-dormer.webp');
    roof.colorSpace=T.SRGBColorSpace;roof.wrapS=roof.wrapT=T.RepeatWrapping;roof.anisotropy=4;
    const walls=new T.MeshStandardMaterial({map:wood,color:0x695147,roughness:.94,side:T.DoubleSide});
    const shingles=new T.MeshStandardMaterial({map:roof,color:0x74604c,roughness:.91,side:T.DoubleSide});
    const dark=new T.MeshStandardMaterial({color:0x313238,roughness:.73,metalness:.08,side:T.DoubleSide});
    let group=new T.Group();scene.add(group);
    group.name='Yellowstone · mapped timber buildings';
    function roofAndWalls(poly,y,h,rise,inn) {
      let vertices=[], tex=[], triangles=[];
      const push=(x,y,z,u,v)=>{vertices.push(x,y,z);tex.push(u,v);};
      const cx=poly.reduce((s,v)=>s+v[0],0)/poly.length,cz=poly.reduce((s,v)=>s+v[1],0)/poly.length;
      const {length:n}=poly;
      let axis=[1,0], longest=0;
      for(let i=0;i<n;i++){
        const [x,z]=poly[i],[u,w]=poly[(i+1)%n],a=u-x,b=w-z,d=Math.hypot(a,b);
        if(d>longest){longest=d;axis=[a/d,b/d];}
      }
      const axisN=[axis[1],-axis[0]];
      const offset=([x,z])=>(x-cx)*axisN[0]+(z-cz)*axisN[1];
      const width=Math.max(2,...poly.map(p=>Math.abs(offset(p))));
      const eave = y+h;
      for(let i=0;i<n;i++){
        const [a,b]=poly[i],[c,d]=poly[(i+1)%n], length=Math.hypot(a-c,b-d);
        const j=i*4;
        push(a,y,b,0,0);push(c,y,d,length*.32,0);push(c,eave,d,length*.32,h*.28);push(a,eave,b,0,h*.28);
        triangles.push(j,j+1,j+2,j,j+2,j+3);
        if(inn&&length>7){
          const frames=Math.floor(length/3.12);
          for(let j=0;j<frames;j++){
            const dx=(c-a)/length,dz=(d-b)/length;
            const start=(j+.32)*length/frames;
            const pane=new T.Mesh(new T.PlaneGeometry(1.37,1.22),dark);
            pane.position.set(a+dx*start+.022*dz,y+2.1,b+dz*start-.022*dx);
            pane.rotation.y=Math.atan2(-dz,dx);group.add(pane);
          }
        }
      }
      function mesh(material,name){
        const g=new T.BufferGeometry();
        g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
        g.setAttribute('uv',new T.Float32BufferAttribute(tex,2));g.setIndex(triangles);g.computeVertexNormals();
        const m=new T.Mesh(g, material);m.name=name;m.userData.terrainCaster=true;group.add(m);
        vertices=[];tex=[];triangles=[];
      }
      mesh(walls,'Yellowstone · timber façade');
      // Roof pitch follows the building's longest axis. A dense triangulation
      // along the actual ridge avoids filling concavities in the footprint.
      const outline=poly.map(([x,z])=>new T.Vector2(x,z));
      const faces=T.ShapeUtils.triangulateShape(outline,[]);
      function roofY(x,z){return eave+rise*(1-clamp(Math.abs(offset([x,z]))/width,0,1));}
      function roofTri(a,b,c,depth){
        if(depth){
          const mid=(u,v)=>[(u[0]+v[0])/2,(u[1]+v[1])/2];
          const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);
          roofTri(a,ab,ca,depth-1);roofTri(ab,b,bc,depth-1);
          roofTri(ca,bc,c,depth-1);roofTri(ab,bc,ca,depth-1);
          return;
        }
        for(const [x,z] of [a,b,c]){
          triangles.push(vertices.length/3);
          push(x,roofY(x,z),z,x*.21,z*.21);
        }
      }
      for(const [a,b,c] of faces)roofTri(poly[a],poly[b],poly[c],inn?4:2);
      mesh(shingles,inn?'Old Faithful Inn · steep timber roof':'Yellowstone · shingled roof');
      if(inn){
        const stack=new T.Mesh(new T.BoxGeometry(2.5,9.5,2.1),new T.MeshStandardMaterial({color:0x696054,map:roof,roughness:1}));
        stack.position.set(cx+axis[0]*7.1,eave+rise*.78,cz+axis[1]*7.1);
        stack.userData.terrainCaster=true;group.add(stack);
      }
      managedAt(cx,cz,Math.max(5,width+.32*longest));
    }
    for(const [name,poly] of meta.buildings){
      if(poly.length<3)continue;
      const [x,z]=poly[0];
      const span=Math.max(...poly.map(([a,b])=>Math.hypot(a-x,b-z)));
      if(span<2.4||span>900)continue;
      const inn=/Old Faithful Inn/i.test(name);
      const y = Math.min(...poly.map(([x,z])=>ground(x,z)))-.25;
      roofAndWalls(poly,y,inn?10:clamp(span*.14+1.8,2.7,11),inn?16:clamp(span*.07,1.15,4.5),inn);
    }
    const deckMat=new T.MeshStandardMaterial({map:wood,color:0xbfb29a,roughness:.99,side:T.DoubleSide});
    const walk=[], uv=[],tris=[];
    function vertex(x,z,d,along) {
      walk.push(x,ground(x,z)+d,z);uv.push(along*.55,z*.74);
    }
    for(const [kind,points] of meta.paths){
      if(kind!=='boardwalk')continue;
      let along=0;
      for(let i=0;i<points.length-1;i++){
        const [x,z]=points[i],[a,b]=points[i+1], length=Math.hypot(a-x,b-z);
        if(length<.1||length>150)continue;
        const dx=(a-x)/length,dz=(b-z)/length,n=Math.ceil(length/3);
        for(let j=0;j<n;j++){
          const f=j/n,g=(j+1)/n,X=x+(a-x)*f,Z=z+(b-z)*f,U=x+(a-x)*g,W=z+(b-z)*g;
          const index=walk.length/3,w=.75;
          vertex(X+dz*w,Z-dx*w,.29,along+f*length);vertex(X-dz*w,Z+dx*w,.29,along+f*length);
          vertex(U+dz*w,W-dx*w,.29,along+g*length);vertex(U-dz*w,W+dx*w,.29,along+g*length);
          tris.push(index,index+1,index+2,index+1,index+3,index+2);
          managedAt(X,Z,2.3);
        }
        along+=length;
      }
    }
    if(walk.length){
      const g=new T.BufferGeometry();
      g.setAttribute('position',new T.Float32BufferAttribute(walk,3));
      g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(tris);g.computeVertexNormals();
      const mesh=new T.Mesh(g,deckMat);mesh.name='Yellowstone · mapped boardwalk timber';
      mesh.userData.terrainCaster=true;scene.add(mesh);
    }
    return (x,z)=>{
      for(const [a,b,r] of managedBins.get(index(x,z))||[])if((x-a)**2+(z-b)**2<r*r)return true;
      return false;
    };
  }

  function condensate(T,scene,ground,info,sun,fog) {
    const mobile=window.matchMedia('(pointer: coarse)').matches;
    const clock={value:0};
    const noise=`
      float h(vec3 a){a=fract(a*.1031);a+=dot(a,a.zyx+31.32);return fract((a.x+a.y)*a.z);}
      float noise(vec3 x){
        vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
        return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);
      }`;
    const entries=[];
    function add(name,point,sourceRadius,buoyancy,period,offset,jet) {
      const [x,z]=point;
      const y=ground(x,z)+.32;
      const stamps=mobile?24:46;
      const geometry=new T.InstancedBufferGeometry();
      const plane=new T.PlaneGeometry(2,2);
      geometry.setIndex(plane.index);geometry.setAttribute('position',plane.attributes.position);geometry.setAttribute('uv',plane.attributes.uv);
      const r=new Float32Array(stamps*4);
      for(let i=0;i<stamps;i++)for(let j=0;j<4;j++)r[i*4+j]=randomAt(i+1049*j+Math.round(Math.abs(x*1.15)));
      geometry.setAttribute('particle',new T.InstancedBufferAttribute(r,4));
      geometry.instanceCount=stamps;
      geometry.boundingSphere=new T.Sphere(new T.Vector3(x,y+17,z),sourceRadius+buoyancy*2+jet+46);
      const uniforms={
        clock, sun:{value:sun}, fog:{value:fog}, wind:{value:new T.Vector2(1.6,.6)},
        vent:{value:new T.Vector3(x,y,z)}, form:{value:new T.Vector4(sourceRadius,buoyancy,0,jet)},
        density:{value:sourceRadius>=10?.34:.43}
      };
      const sm=new T.ShaderMaterial({uniforms,transparent:true,depthWrite:false,side:T.DoubleSide,
        vertexShader:`
          attribute vec4 particle;
          uniform float clock;uniform vec3 vent;uniform vec2 wind;uniform vec4 form;
          varying vec2 card;varying vec3 center;varying vec4 db;
          void main(){
            float water=step(.72,particle.w)*step(.16,form.z);
            float life=mix(10.,20.,particle.z);
            life=mix(life,3.1+particle.z*1.1,water);
            float age=fract(clock/life+particle.x);
            float a=particle.y*6.2831853;
            float r=sqrt(particle.z)*form.x;
            vec2 p=vec2(cos(a),sin(a))*r*(1.-water)*(.35+.65*step(9.,form.x));
            float jetPosition=form.w*sin(age*2.94)*(.64+.36*particle.y)*form.z;
            float mistRise=form.y*(.24+.76*particle.z)*pow(age,.87)*(1.+form.z*.63);
            float lift=mix(mistRise,jetPosition,water);
            vec2 drift=wind*age*mix(7.9,.85,water)+vec2(sin(a+age*4.),cos(a+age*4.))*age*(2.+form.x*.19);
            center=vent+vec3(p.x+drift.x,lift+.2,p.y+drift.y);
            vec3 v=normalize(cameraPosition-center);
            vec3 right=normalize(vec3(v.z+.00001,0.,-v.x)),up=cross(v,right);
            float size=mix(form.x*.14+2.06+(form.x*.40+5.3)*age,.48+3.9*age,water)*(.60+.85*particle.z);
            vec2 uvAngle=vec2(cos(a+age*.85),sin(a+age*.85));
            vec2 uvPos=vec2(dot(position.xy,uvAngle),dot(position.xy,vec2(-uvAngle.y,uvAngle.x)));
            card=uvPos;
            vec3 world=center+(right*position.x+up*position.y*mix(.90,1.66,water))*size;
            db=vec4(age,particle.y,water,length(cameraPosition-world));
            gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);
          }`,
        fragmentShader:`
          uniform float clock,density;uniform vec3 sun,fog;
          varying vec2 card;varying vec3 center;varying vec4 db;
          ${noise}
          void main(){
            float w=db.z,edge=dot(card,card);
            if(edge>1.)discard;
            vec3 p=vec3(card*3.4+db.y*4.+center.xz*.031,.13*clock-db.x*1.3);
            float turbulence=.61*noise(p)+.25*noise(p*2.3)+.14*noise(p*4.7);
            float outline=smoothstep(.104,.78,1.-edge-1.24*(.52-turbulence));
            float age=smoothstep(0.,.16,db.x)*(1.-smoothstep(.50,1.,db.x));
            float opacity=outline*age*density*(.22+.93*turbulence)*(1.-smoothstep(720.,1620.,db.w));
            opacity=mix(opacity,.75*outline*age,w);
            vec3 view=normalize(cameraPosition-center);
            float rim=pow(max(0.,dot(-view,sun)),3.);
            float core=smoothstep(.23,.78,turbulence);
            vec3 color=mix(vec3(.57,.64,.68),vec3(1.1,1.03,.90),.47+.26*rim+.13*core);
            color=mix(color,fog,1.-exp(-db.w*.000068));
            if(opacity<.014)discard;
            gl_FragColor=vec4(color,opacity);
            #include <colorspace_fragment>
          }`});
      const stampsMesh=new T.Mesh(geometry,sm);
      stampsMesh.name = 'Yellowstone · windborne steam · '+name;
      stampsMesh.renderOrder=7;
      scene.add(stampsMesh);
      entries.push({x,y,z,name,period,offset,jet,stampsMesh,uniforms, last:0});
    }
    for(const [id,key,radius,rise,period,offset,jet] of ventOptions){
      if(info[key])add(id,info[key],radius,rise,period,offset,jet);
    }
    // The source is traced across the warm outwash, with the denser plume to
    // the north of the spring and a clear view onto the colored southern mat.
    const mid=info.prismatic;
    add('prismatic north mat',[mid[0]+24,mid[1]-17],14,12,0,0,0);
    add('excelsior runoff',info.runoff,6,8,0,0,0);
    const sample={};
    return {
      cycle(name,t){
        const e=entries.find(v=>v.name===name);
        if(!e?.period)return {power:0,phase:0};
        const phase=((e.offset+t)%e.period+e.period)%e.period;
        return {phase,power:smooth(0,8,phase)*(1.-smooth(78,111,phase))};
      },
      update(t,player,field) {
        clock.value=t;
        for(const v of entries){
          v.stampsMesh.visible=Math.hypot(player.x-v.x,player.z-v.z)<1560;
          if(!v.stampsMesh.visible)continue;
          const f=field?.sample(v.x,v.y+3,v.z,t,sample);
          v.uniforms.wind.value.set(clamp((f?.windX??1.9)*.58,-5.0,5.0),clamp((f?.windZ??.8)*.58,-5.0,5.0));
          v.uniforms.form.value.z=this.cycle(v.name,t).power;
        }
      }
    };
  }

  window.makeYellowstoneFeatures = async function makeYellowstoneFeatures(T,scene,meta,elevation,river,sun,fog,loader){
    const pts=meta.landmarks;
    for(const [name,loc] of [
      ['Castle Geyser',[-1010,-382]],['Beehive Geyser',[-424,-307]],['Anemone Geyser',[-392,-319]],
      ['Grand Geyser',[-727,-573]],['Giant Geyser',[-970,-1097]],['Sawmill Geyser',[-752,-511]],
      ['Lone Star Geyser',[2467,3827]]
    ])pts[name]??=loc;
    const meshes=await Promise.all(scans.map(([stem,key])=>surveyedSurface(T,scene,loader,elevation,pts,stem,key)));
    const castle=meshes.find(q=>q.key==='Castle Geyser');
    if(castle.geo){
      const {min,max}=castle.range;
      pts['Castle Geyser']=[(min.x+max.x)*.5,(min.z+max.z)*.5];
    }
    const managed=architecture(T,scene,meta,elevation,loader);
    const steam=condensate(T,scene,elevation,pts,sun,fog);
    return {managed,cycle:steam.cycle,update(_dt,t,player,wind){steam.update(t,player,wind);}};
  };
})();
