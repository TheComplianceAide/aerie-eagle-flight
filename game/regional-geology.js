// Ground-fixed regional rock specimens, shared PBR materials and physical shore surveys.
(() => {
  'use strict';
  const dir='geology-data/';
  const file=name=>window.aerieAssetURL?.(dir+name)||dir+name;
  async function response(name){
    const result=await fetch(file(name));
    if(!result.ok)throw new Error('Regional geology '+name+' returned '+result.status);
    return result;
  }
  function readModels(T,buffer) {
    const view=new DataView(buffer);
    if(view.getUint32(0)!==0x41524731)throw new Error('Unknown regional rock format');
    let cursor=4;
    return Array.from({length:16},()=>Array.from({length:2},()=>{
      const nv=view.getUint16(cursor,true),ni=view.getUint16(cursor+2,true);cursor+=4;
      const v=new Int16Array(buffer,cursor,nv*8);cursor+=nv*16;
      const index=new Uint16Array(buffer,cursor,ni);cursor+=ni*2;
      return {nv,v,index};
    }));
  }
  function randomFrom(text){
    let h=2166136261;
    for(let j=0;j<text.length;j++)h=Math.imul(h^text.charCodeAt(j),16777619);
    return ()=>{h+=0x6D2B79F5;let n=h;n=Math.imul(n^n>>>15,n|1);n^=n+Math.imul(n^n>>>7,n|61);return ((n^n>>>14)>>>0)/4294967296;};
  }
  function preferred(sheet,anchor){
    if(sheet.id==='surry-rock'||sheet.habitat==='dam')return anchor.habitat==='armor';
    if(sheet.habitat==='stream')return anchor.habitat==='stream';
    switch(sheet.kind){
      case 'pebbles':case 'beach':case 'gravel':case 'sediment':return anchor.habitat==='shore';
      case 'talus':return ['talus','outcrop','armor'].includes(anchor.habitat);
      case 'outcrop':return ['outcrop','talus','armor'].includes(anchor.habitat);
      default:return true;
    }
  }
  function localShores(world,anchor){
    const result=[];
    let paths=(world.shorelines||(world.lakePolygon?[world.lakePolygon]:[])).map(ring=>({ring,loop:true}));
    if(anchor.habitat==='stream'){
      if(world.region==='surry')paths=[{ring:window.ATLAS_SURVEYS.surry.river||[],width:8}];
      else if(world.region==='dixville')paths=window.dixvilleBrooks.map(b=>({ring:[...b.upstream,...b.rail,...b.downstream],width:2}));
      else if(world.region==='yosemite')paths=window.aerieChannels.map(([width,ring])=>({ring,width:width*.5}));
    }
    for(const {ring,loop,width=0} of paths){
      for(let i=0;i<ring.length-(loop?0:1);i++){
        const a=ring[i],b=ring[(i+1)%ring.length],ax=a.x??a[0],az=a.z??a[1],dx=(b.x??b[0])-ax,dz=(b.z??b[1])-az;
        const l=Math.hypot(dx,dz);
        if(l<.1)continue;
        const s=Math.max(0,Math.min(l,((anchor.x-ax)*dx+(anchor.z-az)*dz)/l));
        const distance=Math.hypot(ax+s*dx/l-anchor.x,az+s*dz/l-anchor.z);
        if(distance>anchor.radius)continue;
        const reach=Math.sqrt(Math.max(0,anchor.radius**2-distance**2));
        const lo=Math.max(0,s-reach),hi=Math.min(l,s+reach);
        if(hi-lo>1)result.push({x:ax+lo*dx/l,z:az+lo*dz/l,dx:dx/l,dz:dz/l,length:hi-lo,width:anchor.habitat==='stream'&&world.region==='surry'?(a[2]||16)*.5:width});
      }
    }
    return result;
  }
  function regionalFields(world,spec,anchors,profile){
    if(!spec?.patches)return [];
    const random=randomFrom(world.region+' regional loose rock fields'),fields=[];
    const [west,north,east,south]=spec.bounds,ground=world.geologyGround||world.habitat?.surface||world.elevation||world.height;
    const separated=(x,z)=>!anchors.some(a=>Math.hypot(a.x-x,a.z-z)<Math.min(a.radius*.66,125))&&
      !fields.some(a=>Math.hypot(a.x-x,a.z-z)<170);
    function add(x,z,habitat){
      fields.push({name:'Mapped '+habitat+' '+Math.round(x)+', '+Math.round(z),habitat,x,z,radius:habitat==='shore'?35+random()*32:39+random()*50,field:true});
    }
    // Distribute untitled shoreline patches along the lengths of the mapped
    // banks. Long inland reaches and unverified geological units stay outside
    // the named rock formation's regional bounds.
    const shores=[];
    for(const ring of world.shorelines||(world.lakePolygon?[world.lakePolygon]:[])){
      for(let j=0;j<ring.length;j++){
        const a=ring[j],b=ring[(j+1)%ring.length],x=(a.x??a[0])*.5+(b.x??b[0])*.5,z=(a.z??a[1])*.5+(b.z??b[1])*.5;
        if(x<west||x>east||z<north||z>south)continue;
        shores.push([x,z]);
      }
    }
    for(let i=0;i<Math.min(220,shores.length*2)&&fields.length<spec.patches*.42;i++){
      const [x,z]=shores[Math.floor(random()*shores.length)];if(separated(x,z))add(x,z,'shore');
    }
    for(let i=0;i<spec.patches*35&&fields.length<spec.patches;i++){
      const x=west+(east-west)*random(),z=north+(south-north)*random();
      if(!separated(x,z))continue;
      const land=profile?.landAt(x,z)||0;
      if(land===4||land===5||land===7||land===8||land===9)continue;
      const h=ground(x,z),slope=Math.hypot(ground(x+7,z)-ground(x-7,z),ground(x,z+7)-ground(x,z-7))/14;
      if(!Number.isFinite(h)||world.habitat?.wet(x,z,world.elevation(x,z))||slope<.13||slope>1.04)continue;
      if(land!==6&&slope<.38&&random()>.17)continue;
      if(land===1&&slope<.52&&random()>.16)continue;
      // Rockfall tends to settle at the foot of a slope. The discrete Laplacian
      // sign here measures concavity over a 25 m neighbourhood.
      const curvature=(ground(x-25,z)+ground(x+25,z)+ground(x,z-25)+ground(x,z+25))*.25-h;
      add(x,z,curvature>1.1?'talus':'outcrop');
    }
    return fields;
  }
  function seed(T,world,regions,sheet,profile){
    const entries=[],used=new Set(),floor=world.geologyGround||world.habitat?.surface||world.elevation||world.height;
    const surface=(x,z)=>world.kineoRockSurface?.(x,z)??floor(x,z);
    const elevation=world.elevation||world.height,level=world.waterLevel;
    const small=sheet.kind==='pebbles'||sheet.kind==='beach';
    let anchors=regions.filter(a=>preferred(sheet,a));
    if(!anchors.length)anchors=regions.filter(a=>a.habitat==='shore');
    for(const anchor of anchors){
      const rand=randomFrom(sheet.id+' '+anchor.name);
      const shore=anchor.habitat==='shore',stream=anchor.habitat==='stream',armor=anchor.habitat==='armor',edges=shore||stream?localShores(world,anchor):[];
      const total=edges.reduce((sum,line)=>sum+line.length,0);
      const count=anchor.field?(small?11:5+Math.floor(rand()*7)):small?144:anchor.habitat==='talus'?69:48;
      let accepted=0;
      for(let i=0;i<count*24&&accepted<count;i++){
        let x,z,bankDistance=Infinity;
        if(armor){
          const station=20+rand()*499,across=(8+rand()*42)*(anchor.name.includes('reservoir')?-1:1);
          x=-1070+.99690*station-.07865*across;z=-2635+.07865*station+.99690*across;
        }else if(total){
          let d=rand()*total,line=edges[0];
          for(const part of edges){line=part;if(d<=part.length)break;d-=part.length;}
          const cross=((line.width||0)+.6+rand()**2*(small?5.8:15))*(rand()<.5?-1:1);
          bankDistance=Math.abs(cross)-(line.width||0);
          x=line.x+d*line.dx-cross*line.dz;z=line.z+d*line.dz+cross*line.dx;
        }else{
          const angle=rand()*Math.PI*2,radius=anchor.radius*Math.sqrt(rand());
          x=anchor.x+Math.cos(angle)*radius;z=anchor.z+Math.sin(angle)*radius;
        }
        const surveyed=elevation(x,z),drawn=surface(x,z),visible=world.height(x,z);
        const land=profile?.landAt(x,z)||0;
        if(land===7||(!armor&&(land===4||land===5)))continue;
        if(world.waterfalls?.inChute?.(x,z,.7))continue;
        // Occupation of the water polygon matters more than a 10–38 m global
        // classification pixel on a narrow strand. Follow the actual drawn bank.
        if(world.habitat?.wet(x,z,surveyed)&&!(shore&&Number.isFinite(level)&&Math.abs(visible-level)<1&&drawn>level+.17))continue;
        let y=drawn;
        if(!Number.isFinite(y)||(!armor&&visible-surveyed>3.1))continue;
        const dx=(surface(x+.8,z)-surface(x-.8,z))/1.6,dz=(surface(x,z+.8)-surface(x,z-.8))/1.6,slope=Math.hypot(dx,dz);
        const span=4;
        const broad=Math.hypot(surface(x+span,z)-surface(x-span,z),surface(x,z+span)-surface(x,z-span))/(2*span);
        if(Math.max(slope,broad)>(anchor.habitat==='outcrop'?1.24:armor?1.03:shore?.67:.81))continue;
        if(shore&&Number.isFinite(level)&&(y-level>(total?18:32)||y<level-.13))continue;
        if(!shore&&!armor&&land===1&&slope<.17&&rand()<.88)continue;
        const cell=(accepted+Math.floor(count/3)*regions.indexOf(anchor))%16,specimen=sheet.specimens[cell];
        let length=specimen.length*(.69+.77*rand());
        if(armor)length=Math.min(1.34,length*.76);
        if(shore&&!small)length*=.83;
        const gap=small?.31:Math.max(.76,length*.68);
        const key=Math.round(x/gap)+':'+Math.round(z/gap)+':'+Math.round(gap*2);
        if(used.has(key))continue;
        used.add(key);
        const yaw=rand()*Math.PI*2,scaleY=.94+.12*rand();
        const up=new T.Vector3(-dx*(armor?.70:.52),1,-dz*(armor?.70:.52)).normalize();
        const rotation=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),up);
        rotation.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),yaw));
        const width=length*specimen.extent[0],height=length*scaleY*specimen.extent[1],depth=length*specimen.extent[2];
        const wetStage=shore&&Number.isFinite(level)?level+(world.region==='alaska'?.18:.16):
          stream&&bankDistance<2.4?drawn+.12*(1-bankDistance/2.4):-Infinity;
        // Bury the base into bedrock and talus. Cobbles rest above the mineral
        // surface with their lowest face embedded a few millimetres.
        y-=height*(small?.09:.18);
        const matrix=new T.Matrix4().compose(new T.Vector3(x,y,z),rotation,new T.Vector3(length,length*scaleY,length));
        entries.push({sheet:sheet.id,cell,x,y,z,width,height,depth,yaw,matrix,length,wetStage,anchor:anchor.name});
        accepted++;
      }
    }
    return entries;
  }
  function merge(T,members,models,lod){
    let vertices=0,count=0;
    for(const e of members){const m=models[e.cell][lod];vertices+=m.nv;count+=m.index.length;}
    const pos=new Float32Array(vertices*3),norm=new Float32Array(vertices*3),uv=new Float32Array(vertices*2),cell=new Uint8Array(vertices);
    const wetness=new Uint8Array(vertices),index=vertices<=65535?new Uint16Array(count):new Uint32Array(count);
    let base=0,offset=0;const p=new T.Vector3(),n=new T.Vector3(),nm=new T.Matrix3();
    for(const e of members){
      const m=models[e.cell][lod],v=m.v;nm.getNormalMatrix(e.matrix);
      for(let i=0;i<m.nv;i++){
        const k=i*8,d=(base+i)*3,t=(base+i)*2;
        p.set(v[k]/16000,v[k+1]/16000,v[k+2]/16000).applyMatrix4(e.matrix);p.toArray(pos,d);
        // A centimetric irregular tide line follows true vertex heights on the
        // rock. The top can already be dry while the toe is still damp.
        const waterline=e.wetStage+.04*Math.sin(p.x*2.6+p.z*3.8);
        wetness[base+i]=Math.round(255*(1-T.MathUtils.smoothstep(p.y-waterline,-.035,.21)));
        n.set(v[k+3]/32767,v[k+4]/32767,v[k+5]/32767).applyNormalMatrix(nm);n.toArray(norm,d);
        uv[t]=v[k+6]/32767;uv[t+1]=v[k+7]/32767;cell[base+i]=e.cell;
      }
      for(const j of m.index)index[offset++]=j+base;
      base+=m.nv;
    }
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.BufferAttribute(pos,3));g.setAttribute('normal',new T.BufferAttribute(norm,3));
    g.setAttribute('uv',new T.BufferAttribute(uv,2));g.setAttribute('aerieCell',new T.BufferAttribute(cell,1));g.setIndex(new T.BufferAttribute(index,1));
    g.setAttribute('stoneWetness',new T.BufferAttribute(wetness,1,true));
    g.computeBoundingSphere();return g;
  }
  window.makeRegionalGeology=(T,scene,world)=>{
    const layers=new T.Group();layers.name='Regional mineral exposures';scene.add(layers);
    const materials=[],maps=[],batches=[],entries=[],bin=new Map(),survey=[];
    const compact=matchMedia('(pointer: coarse)').matches;let disposed=false,lastT=-Infinity,lastX=Infinity,lastZ=Infinity;
    function dispose(){
      disposed=true;layers.removeFromParent();
      for(const item of batches)for(const mesh of item.meshes)mesh?.geometry.dispose();
      for(const material of materials)material.dispose();for(const tex of maps)tex.dispose();
      for(const model of survey)model.dispose?.();
    }
    function update(player,time=0){
      if(disposed||(!batches.length&&!survey.length))return;
      if(time-lastT>=0&&time-lastT<.16&&Math.hypot(player.x-lastX,player.z-lastZ)<6)return;
      lastT=time;lastX=player.x;lastZ=player.z;
      for(const b of batches){
        const dist=Math.hypot(player.x-b.center.x,player.y-b.center.y,player.z-b.center.z)-b.radius;
        const near=b.small?(compact?11:19):(compact?49:78),far=b.small?(compact?31:51):(compact?230:365);
        const next=dist<(b.lod===0?near*1.20:near)?0:dist<(b.lod===1?far*1.16:far)?1:-1;
        if(next<0&&dist>far*1.7&&time-b.lastVisible>24){
          for(let j=0;j<b.meshes.length;j++){
            const old=b.meshes[j];if(!old)continue;
            old.removeFromParent();old.geometry.dispose();b.meshes[j]=null;
          }
          b.lod=-1;
        }
        if(next>=0)b.lastVisible=time;
        if(b.lod===next)continue;
        if(b.lod>=0)b.meshes[b.lod].visible=false;
        if(next>=0){
          let mesh=b.meshes[next];
          if(!mesh){
            mesh=new T.Mesh(merge(T,b.entries,b.models,next),b.material);
            mesh.name=b.sheet+' '+(next?'middle':'near')+' relief';
            mesh.userData.aerieRegional={sheet:b.sheet,lod:next?'mid':'near',cellAttribute:'aerieCell',cellComponent:0};
            layers.add(mesh);b.meshes[next]=mesh;
          }
          mesh.visible=true;
        }
        b.lod=next;
      }
      for(const model of survey)model.update?.(player);
    }
    function clearance(x,z){
      let top=world.kineoRockSurface?.(x,z)??-Infinity;
      for(const e of bin.get(Math.floor(x/16)+':'+Math.floor(z/16))||[]){
        if(Math.abs(x-e.x)>e.radius||Math.abs(z-e.z)>e.radius)continue;
        // A narrow slot, cantilever or split pair has air below its envelope.
        // Use the actual nearest LOD triangles for contact with the eagle.
        // Transform vertices only if a flight first crosses this footprint.
        if(!e.surfaceVertices){
          const {v,nv}=e.contactModel,worldPoints=new Float32Array(nv*3),point=new T.Vector3();
          for(let i=0;i<nv;i++){
            const k=i*8;point.set(v[k]/16000,v[k+1]/16000,v[k+2]/16000).applyMatrix4(e.matrix).toArray(worldPoints,i*3);
          }
          e.surfaceVertices=worldPoints;
        }
        const positions=e.surfaceVertices,index=e.contactModel.index;
        for(let i=0;i<index.length;i+=3){
          const a=index[i]*3,b=index[i+1]*3,c=index[i+2]*3,ax=positions[a],az=positions[a+2];
          const bx=positions[b]-ax,bz=positions[b+2]-az,cx=positions[c]-ax,cz=positions[c+2]-az,det=bx*cz-bz*cx;
          if(det>=-.000001)continue;
          const u=((x-ax)*cz-(z-az)*cx)/det,v=(bx*(z-az)-bz*(x-ax))/det;
          if(u>=0&&v>=0&&u+v<=1)top=Math.max(top,positions[a+1]+u*(positions[b+1]-positions[a+1])+v*(positions[c+1]-positions[a+1]));
        }
      }
      return top;
    }
    async function start(){
      const manifest=await (await response(world.region+'.json')).json();
      if(disposed)return;
      api.regions=manifest.habitats||[];
      const profile=window.aerieCanopyProfile?.(world);
      api.regions=api.regions.concat(regionalFields(world,manifest.distribution,api.regions,profile));
      const loader=new T.TextureLoader();
      if(world.region==='moosehead'&&window.loadKineoModels){
        const model=await window.loadKineoModels(T,layers,world,file);
        if(disposed){model.dispose();return;}
        survey.push(model);
      }
      await Promise.all(manifest.sheets.map(async sheet=>{
        const [bytes,color,normal]=await Promise.all([(await response(sheet.id+'.bin')).arrayBuffer(),loader.loadAsync(file(sheet.id+'-color.webp')),loader.loadAsync(file(sheet.id+'-normal.webp'))]);
        if(disposed){color.dispose();normal.dispose();return;}
        color.colorSpace=T.SRGBColorSpace;color.anisotropy=normal.anisotropy=compact?2:4;maps.push(color,normal);
        const material=new T.MeshStandardMaterial({map:color,normalMap:normal,normalScale:new T.Vector2(.63,.63),roughness:.88,metalness:0});
        material.onBeforeCompile=shader=>{
          shader.vertexShader='attribute float stoneWetness; varying float mineralWetness;\n'+shader.vertexShader
            .replace('#include <begin_vertex>','#include <begin_vertex>\nmineralWetness = stoneWetness;');
          shader.fragmentShader='varying float mineralWetness;\n'+shader.fragmentShader
            .replace('#include <map_fragment>','#include <map_fragment>\ndiffuseColor.rgb *= mix(vec3(1.),vec3(.49,.55,.59),mineralWetness);')
            .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor,.36,mineralWetness);');
        };
        materials.push(material);
        const models=readModels(T,bytes),members=seed(T,world,api.regions,sheet,profile),groups=new Map();
        const small=sheet.kind==='pebbles'||sheet.kind==='beach';const span=small?16:60;
        for(const e of members){
          entries.push(e);
          const tile=Math.floor(e.x/span)+':'+Math.floor(e.z/span);
          if(!groups.has(tile))groups.set(tile,[]);groups.get(tile).push(e);
          if(e.height<.14)continue;
          const radius=e.radius=.59*Math.hypot(e.width,e.height,e.depth);e.contactModel=models[e.cell][0];
          for(let j=Math.floor((e.z-radius)/16);j<=Math.floor((e.z+radius)/16);j++)for(let i=Math.floor((e.x-radius)/16);i<=Math.floor((e.x+radius)/16);i++){
            const k=i+':'+j;if(!bin.has(k))bin.set(k,[]);bin.get(k).push(e);
          }
        }
        for(const group of groups.values()){
          const center=new T.Vector3();
          for(const e of group)center.add(new T.Vector3(e.x,e.y,e.z));
          center.multiplyScalar(1/group.length);
          let radius=1;for(const e of group)radius=Math.max(radius,Math.hypot(e.x-center.x,e.y-center.y,e.z-center.z)+e.length);
          batches.push({center,radius,small,sheet:sheet.id,entries:group,models,material,meshes:[],lod:-1,lastVisible:0});
        }
      }));
      if(!disposed)update(world.spawn,0);
    }
    const api={regions:[],update,dispose,clearance,placements:()=>entries.map(({sheet,cell,x,y,z,width,height,depth,yaw,length,anchor,matrix})=>({sheet,cell,x,y,z,width,height,depth,yaw,length,anchor,matrix})),models:()=>survey.flatMap(m=>m.names),
      get counts(){return {placements:entries.length,specimens:new Set(entries.map(e=>e.sheet+'/'+e.cell)).size,surveyModels:survey.reduce((s,m)=>s+m.names.length,0),visibleBatches:batches.filter(b=>b.lod>=0).length};}};
    world.regionalGeology=api;api.ready=start();return api;
  };
})();
