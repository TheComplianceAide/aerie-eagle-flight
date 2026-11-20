// Stream small, independently grounded regional specimens around the flight path.
(() => {
  'use strict';
  const folder='field-data/';
  const file=name=>window.aerieAssetURL?.(folder+name)||folder+name;
  const step=80;
  function hash(x,z,seed){
    let n=Math.imul(x|0,374761393)+Math.imul(z|0,668265263)+Math.imul(seed|0,1274126177);
    n=Math.imul(n^(n>>>13),1274126177);
    return ((n^(n>>>16))>>>0)/4294967296;
  }
  async function fetchAsset(name){
    const res=await fetch(file(name));
    if(!res.ok)throw new Error('Field scenery '+name+' returned '+res.status);
    return res;
  }
  function readMeshes(T,buffer){
    const dv=new DataView(buffer);
    if(dv.getUint32(0)!==0x41465331)throw new Error('Invalid regional field geometry');
    let offset=4;
    return Array.from({length:16},()=>Array.from({length:2},()=>{
      const count=dv.getUint32(offset,true),indexCount=dv.getUint32(offset+4,true);offset+=8;
      const src=new Int16Array(buffer,offset,count*8);offset+=count*16;
      const pos=new Float32Array(count*3),normal=new Float32Array(count*3),uv=new Float32Array(count*2);
      for(let i=0;i<count;i++){
        for(let j=0;j<3;j++){pos[i*3+j]=src[i*8+j]/16000;normal[i*3+j]=src[i*8+3+j]/32767;}
        uv[i*2]=src[i*8+6]/32767;uv[i*2+1]=src[i*8+7]/32767;
      }
      const g=new T.BufferGeometry();
      g.setAttribute('position',new T.BufferAttribute(pos,3));
      g.setAttribute('normal',new T.BufferAttribute(normal,3));
      g.setAttribute('uv',new T.BufferAttribute(uv,2));
      g.setIndex(new T.BufferAttribute(new Uint16Array(buffer,offset,indexCount),1));offset+=2*indexCount;
      g.computeBoundingSphere();return g;
    }));
  }
  function shoreline(world){
    const bins=new Map(),size=96;
    const xy=p=>({x:p.x??p[0],z:p.z??p[1]});
    function add(points,closed,stream=false){
      if(!points||points.length<2)return;
      for(let i=0;i<points.length-(closed?0:1);i++){
        const a=xy(points[i]),b=xy(points[(i+1)%points.length]),dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz;
        if(l2<.01)continue;
        const line={a,dx,dz,l2,stream};
        const x0=Math.floor((Math.min(a.x,b.x)-24)/size),x1=Math.floor((Math.max(a.x,b.x)+24)/size);
        const z0=Math.floor((Math.min(a.z,b.z)-24)/size),z1=Math.floor((Math.max(a.z,b.z)+24)/size);
        for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){
          const key=x+','+z;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(line);
        }
      }
    }
    for(const ring of world.shorelines||(world.lakePolygon?[world.lakePolygon]:[]))add(ring,true);
    if(world.region==='surry')add(window.ATLAS_SURVEYS?.surry?.river,false,true);
    if(world.region==='dixville')for(const b of window.dixvilleBrooks||[])add([...b.upstream,...b.rail,...b.downstream],false,true);
    if(world.region==='yosemite')for(const [,line] of window.aerieChannels||[])add(line,false,true);
    return (x,z)=>{
      let distance=Infinity,yaw=0,stream=false;
      for(const l of bins.get(Math.floor(x/size)+','+Math.floor(z/size))||[]){
        const t=Math.max(0,Math.min(1,((x-l.a.x)*l.dx+(z-l.a.z)*l.dz)/l.l2));
        const dist=Math.hypot(x-l.a.x-t*l.dx,z-l.a.z-t*l.dz);
        if(dist<distance){distance=dist;yaw=Math.atan2(-l.dz,l.dx);stream=l.stream;}
      }
      return {distance,yaw,stream};
    };
  }
  function habitat(sheet,q,water,shore,nearFall){
    const gentle=q.slope<.53,margin=shore.distance<17;
    if(sheet.kind==='ice')return q.ice&&q.slope<1.45&&!water;
    if(sheet.special==='lily')return water&&margin&&!nearFall&&q.slope<.29&&shore.distance>2;
    if(sheet.kind==='water')return (water&&margin||shore.stream&&shore.distance<3.8||water&&nearFall)&&!q.ice;
    if(water||q.ice||q.developed||q.slope>1.0)return false;
    switch(sheet.habitat){
      case 'forest':return q.land===1||q.cover>.23&&q.alpine<.5&&!q.rock;
      case 'bank':return margin&&gentle;
      case 'marsh':return gentle&&(q.land===9||margin&&shore.distance<12||q.wet>.38);
      case 'meadow':return gentle&&(q.land===3||q.land===11||q.cover>.2&&q.open>.38);
      case 'riparian':return gentle&&(margin||q.wet>.25);
      case 'scree':return q.land===6||q.rock>.24||q.slope>.34;
      case 'dry':return q.land!==9&&q.wet<.45;
      default:return gentle;
    }
  }
  function fixtures(world){
    const points=[];
    function edge(a,b,n,offset=0,lake=false){
      if(!a||!b)return;
      const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<2)return;
      for(let i=0;i<n;i++){
        const t=(i+.5)/n;
        points.push({x:a[0]+dx*t-dz/length*offset,z:a[1]+dz*t+dx/length*offset,yaw:Math.atan2(-dz,dx),lake});
      }
    }
    if(world.region==='winnipesaukee'){
      const f=window.WINNIPESAUKEE_WATERFRONT?.features;
      if(f){
        const rings=[f.weirs?.station,f.alton?.bandstandPlatform||f.alton?.bandstand];
        rings.forEach((p,index)=>{
          if(!p)return;
          const area=p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-b[0]*a[1];},0);
          const outside=area>0?-.52:.52;
          for(let i=0;i<4;i++)edge(p[i],p[(i+1)%4],2,outside,index===1);
        });
        const docks=f.weirs?.piers||f.alton?.piers||[];
        for(const p of docks)if(Array.isArray(p)&&Array.isArray(p[0])&&Array.isArray(p[1]))edge(p[0],p[1],2,.2,true);
      }
    }
    if(world.region==='labrador'){
      const camp=window.ATLAS_SURVEYS?.labrador?.cabin;
      if(camp){
        const a=camp.angle??camp.yaw??0,x=camp.x,z=camp.z;
        if(Number.isFinite(x)&&Number.isFinite(z)){
          const c=Math.cos(a),s=Math.sin(a),at=(u,v)=>[x+c*u+s*v,z-s*u+c*v];
          edge(at(-15,9),at(14,9),9,0);edge(at(15,10),at(15,31),7,0);
        }
      }
    }
    return points;
  }
  function material(T,sheet,texture,time){
    const water=sheet.kind==='water',foliage=sheet.kind==='herb'||sheet.kind==='grass';
    const mat=new T.MeshStandardMaterial({map:texture,roughness:water?.29:sheet.kind==='ice'?.43:.88,
      metalness:0,side:T.DoubleSide,alphaTest:water?.19:.31,transparent:water,
      opacity:water?.48:1,depthWrite:!water,polygonOffset:water||sheet.kind==='sign'||sheet.kind==='ground',
      polygonOffsetFactor:-1,polygonOffsetUnits:-1});
    if(water||foliage){
      mat.onBeforeCompile=shader=>{
        shader.uniforms.aerieFieldTime=time;
        shader.vertexShader='uniform float aerieFieldTime; varying vec2 vFieldWorld;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',
          'vec4 root = instanceMatrix * vec4(transformed,1.0); vFieldWorld=root.xz;\n'+
          (water?'transformed.y += 0.003*sin(dot(root.xz,vec2(.9,.48))-aerieFieldTime*2.2);\n':
           'float tip=clamp(position.y,0.0,1.0); transformed.x += tip*tip*(.013*sin(aerieFieldTime*1.5+dot(root.xz,vec2(.38,.61)))+.004*sin(aerieFieldTime*3.9+root.z));\n')+
          '#include <project_vertex>');
        if(water){
          shader.fragmentShader='uniform float aerieFieldTime; varying vec2 vFieldWorld;\n'+shader.fragmentShader;
          shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',
            '#include <map_fragment>\nfloat flow=sin(dot(vFieldWorld,vec2(1.8,.9))-aerieFieldTime*2.6+.7*sin(vFieldWorld.y*.83+aerieFieldTime*.37)); float crossflow=sin(dot(vFieldWorld,vec2(-.46,2.3))-aerieFieldTime*1.72); diffuseColor.a*=.74+.2*flow+.06*crossflow; diffuseColor.rgb*=.94+.075*flow;');
          shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',
            '#include <normal_fragment_maps>\nnormal=normalize(normal+vec3(flow*.068,crossflow*.037,0.));');
        }
      };
      mat.customProgramCacheKey=()=>water?'regional-moving-water-v1':'regional-bending-herbs-v1';
    }
    return mat;
  }
  window.makeRegionalFieldScenery=(T,scene,world)=>{
    const root=new T.Group();root.name='Regional understory and shoreline details';scene.add(root);
    const profile=window.aerieCanopyProfile(world),nearShore=shoreline(world),structures=fixtures(world);
    const falls=(world.landmarks||[]).filter(f=>f.falls||/falls|cascade|chute|flume/i.test(f.name));
    const coarse=matchMedia('(pointer: coarse)').matches,tiles=new Map(),sheets=[];
    const time={value:0},floor=world.geologyGround||world.habitat?.surface||world.elevation||world.height;
    const materials=[],geometries=[],textures=[];
    let gone=false,prevX=1e20,prevY=1e20,prevZ=1e20,last=-1,tick=0,pending=false;
    const release=()=>{root.removeFromParent();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();};
    function sample(x,z){
      const q=profile.zone(x,z),h=floor(x,z),wet=world.habitat?.wet(x,z,h)??q.submerged;
      return {q,h,wet,shore:nearShore(x,z),fall:falls.some(f=>(x-f.x)**2+(z-f.z)**2<28*28)};
    }
    function build(ix,iz){
      const list=[],x0=ix*step,z0=iz*step,spots=[];
      for(let z=0;z<7;z++)for(let x=0;x<7;x++){
        const gx=ix*7+x,gz=iz*7+z;
        const sx=x0+(x+.12+.76*hash(gx,gz,1))*step/7,sz=z0+(z+.12+.76*hash(gx,gz,2))*step/7;
        const b=world.bounds;if(b&&(sx<b.minX||sz<b.minZ||sx>b.maxX||sz>b.maxZ))continue;
        spots.push({x:sx,z:sz,gx,gz,...sample(sx,sz)});
      }
      for(const sheet of sheets){
        const seed=sheet.id.split('').reduce((h,c)=>Math.imul(h,31)+c.charCodeAt(0)|0,17);
        if(sheet.kind==='structure'){
          structures.forEach((p,i)=>{
            if(Math.floor(p.x/step)!==ix||Math.floor(p.z/step)!==iz)return;
            const y=p.lake?world.waterLevel+.52:floor(p.x,p.z);
            if(Number.isFinite(y))list.push({sheet,cell:i%16,x:p.x,y,z:p.z,yaw:p.yaw,scale:sheet.span*.73,dx:0,dz:0});
          });
          continue;
        }
        const frequency={wood:.11,ice:.20,sign:.11,ground:.47,herb:.51,grass:.55,water:.7}[sheet.kind];
        for(const a of spots){
          if(hash(a.gx,a.gz,seed)>frequency||!Number.isFinite(a.h)||!habitat(sheet,a.q,a.wet,a.shore,a.fall))continue;
          const water=sheet.kind==='water'||sheet.special==='lily';
          let y=a.h;
          if(water){
            const streamLevel=world.waterSurfaceAt?.(a.x,a.z);
            if(Number.isFinite(streamLevel))y=streamLevel;
            else if(a.wet&&Number.isFinite(world.waterLevel))y=world.waterLevel;
            else if(a.shore.stream)y=a.h+.10;
            else continue;
            y+=sheet.special==='lily'?.046:.033;
          }
          const span=sheet.span*(.68+.64*hash(a.gx,a.gz,seed+3));
          const delta=Math.min(2,Math.max(.3,span*.25));
          const dx=water?0:(floor(a.x+delta,a.z)-floor(a.x-delta,a.z))/(delta*2);
          const dz=water?0:(floor(a.x,a.z+delta)-floor(a.x,a.z-delta))/(delta*2);
          if(!Number.isFinite(dx+dz)||Math.hypot(dx,dz)>(sheet.kind==='ice'?1.9:1.05))continue;
          const yaw=water?a.shore.yaw+.27*(hash(a.gx,a.gz,seed+2)-.5):hash(a.gx,a.gz,seed+2)*Math.PI*2;
          list.push({sheet,cell:Math.floor(hash(a.gx,a.gz,seed+1)*16),x:a.x,y:y+(water?0:.012),z:a.z,yaw,scale:span,dx,dz});
        }
      }
      return list;
    }
    const up=new T.Vector3(0,1,0),v=new T.Vector3(),q=new T.Quaternion(),turn=new T.Quaternion(),scale=new T.Vector3(),matrix=new T.Matrix4();
    function gather(player){
      const active=new Set(),visible=new Map();
      const ix=Math.floor(player.x/step),iz=Math.floor(player.z/step),agl=player.y-floor(player.x,player.z);
      const windowTiles=[];
      if(agl<(coarse?120:180))for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++){
        const tx=ix+dx,tz=iz+dz;
        windowTiles.push([tx,tz,Math.hypot((tx+.5)*step-player.x,(tz+.5)*step-player.z)]);
      }
      windowTiles.sort((a,b)=>a[2]-b[2]);
      pending=false;
      const start=performance.now();
      let added=0;
      for(const [tx,tz] of windowTiles){
        const k=tx+','+tz;active.add(k);
        if(!tiles.has(k)){
          if(added&&(added>=3||performance.now()-start>2.2)){pending=true;continue;}
          tiles.set(k,build(tx,tz));added++;
        }
        for(const e of tiles.get(k)){
          const radius=Math.min(coarse?109:159,Math.max(36,e.scale*(coarse?15:21)+32));
          const d=Math.hypot(e.x-player.x,e.y-player.y,e.z-player.z);
          if(d>radius)continue;
          const lod=d<Math.min(coarse?30:56,7+e.scale*7.2)?0:1;
          const id=e.sheet.id+'/'+e.cell+'/'+lod;
          if(!visible.has(id))visible.set(id,{sheet:e.sheet,cell:e.cell,lod,members:[]});
          visible.get(id).members.push(e);
        }
      }
      for(const k of tiles.keys())if(!active.has(k))tiles.delete(k);
      for(const m of root.children)m.visible=false;
      for(const [id,b] of visible){
        let mesh=b.sheet.batches.get(id);
        if(!mesh||mesh.instanceMatrix.count<b.members.length){
          if(mesh){root.remove(mesh);mesh.dispose?.();}
          mesh=new T.InstancedMesh(b.sheet.forms[b.cell][b.lod],b.sheet.material,Math.max(4,2**Math.ceil(Math.log2(b.members.length))));
          mesh.name=b.sheet.id+' · '+b.sheet.specimens[b.cell].name;
          mesh.userData.aerieRegional={sheet:b.sheet.id,cell:b.cell,lod:b.lod};
          mesh.receiveShadow=true;mesh.frustumCulled=false;
          mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);b.sheet.batches.set(id,mesh);root.add(mesh);
        }
        mesh.visible=true;mesh.count=b.members.length;
        for(let i=0;i<b.members.length;i++){
          const e=b.members[i];q.setFromUnitVectors(up,v.set(-e.dx,1,-e.dz).normalize());
          q.multiply(turn.setFromAxisAngle(up,e.yaw));scale.setScalar(e.scale);
          matrix.compose(v.set(e.x,e.y,e.z),q,scale);mesh.setMatrixAt(i,matrix);
        }
        mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere?.();
      }
    }
    function update(p,t=0){
      if(gone||!sheets.length)return;
      time.value=t;
      if(!pending&&t>=last&&t-last<.16&&Math.hypot(p.x-prevX,p.z-prevZ,p.y-prevY)<7)return;
      if(!pending&&tick&&Math.hypot(p.x-prevX,p.z-prevZ,p.y-prevY)<2.4)return;
      last=t;prevX=p.x;prevZ=p.z;prevY=p.y;tick++;gather(p);
    }
    const ready=(async()=>{
      const config=await (await fetchAsset(world.region+'.json')).json();
      await Promise.all(config.sheets.map(async sheet=>{
        const [buffer,texture]=await Promise.all([(await fetchAsset(sheet.id+'.bin')).arrayBuffer(),new T.TextureLoader().loadAsync(file(sheet.id+'.webp'))]);
        if(gone){texture.dispose();return;}
        if(T.SRGBColorSpace)texture.colorSpace=T.SRGBColorSpace;else texture.encoding=T.sRGBEncoding;
        texture.anisotropy=coarse?2:4;textures.push(texture);
        const forms=readMeshes(T,buffer),mat=material(T,sheet,texture,time);
        geometries.push(...forms.flat());materials.push(mat);
        sheets.push({...sheet,forms,material:mat,batches:new Map()});
      }));
      return sheets.length;
    })();
    function dispose(){gone=true;for(const mesh of root.children)mesh.dispose?.();tiles.clear();release();}
    return {ready,update,dispose,get sheets(){return sheets.map(s=>s.id);},get placements(){return [...tiles.values()].flat();}};
  };
})();
