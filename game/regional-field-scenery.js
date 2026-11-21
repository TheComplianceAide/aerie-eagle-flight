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
      return Number.isFinite(distance)?{distance,yaw,stream}:world.fieldBankAt?.(x,z)||{distance,yaw,stream};
    };
  }
  function habitat(sheet,q,water,shore,nearFall){
    const gentle=q.slope<.53,margin=shore.distance<17;
    if(sheet.kind==='ice')return q.ice&&q.slope<1.45&&!water;
    if(sheet.special==='lily')return water&&margin&&!nearFall&&q.slope<.29&&shore.distance>2;
    if(sheet.kind==='water'){
      if(q.ice||!water)return false;
      if(sheet.habitat==='stream'&&sheet.region!=='surry')return nearFall||shore.stream&&shore.distance<8;
      return margin||nearFall;
    }
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
  function fixtures(T,scene,world){
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
        const station=f.weirs?.station;
        if(station){
          const area=station.reduce((sum,a,i)=>{const b=station[(i+1)%station.length];return sum+a[0]*b[1]-b[0]*a[1];},0);
          const outside=area>0?-.52:.52;
          for(let i=0;i<station.length;i++)edge(station[i],station[(i+1)%station.length],2,outside);
        }
        const docks=f.weirs?.piers||f.alton?.piers||[];
        for(const p of docks)if(Array.isArray(p)&&Array.isArray(p[0])&&Array.isArray(p[1]))edge(p[0],p[1],2,.2,true);
      }
    }
    if(world.region==='labrador'){
      const cabin=scene.getObjectByName('Lakeside camp cabin');
      if(cabin){
        // Metres in the existing cabin's real porch frame. Timber packers sit
        // on native piers, and threshold/riser joints are tenoned into the
        // actual three spruce steps. No fixtures extend into the meadow or lake.
        const placements=[
          [-1.91,-.235,2.68,.34,0], [1.89,-.235,2.66,.31,0], [-.20,-.081,2.93,.42,0],
          [-.54,-.263,3.15,.32,0], [-1.86,-.235,1.25,.26,1.57], [1.88,-.235,1.23,.33,1.57],
          [-1.91,-.235,-2.50,.28,1.57], [1.88,-.235,-2.51,.31,1.57], [0,-.235,2.72,.30,0],
          [.64,-.105,2.98,.32,0], [-.02,-.235,1.21,.28,0], [0,-.235,-2.49,.26,0],
          [-.48,-.405,3.41,.35,0], [1.47,-.388,3.41,.28,0], [-1.98,.018,2.66,.25,1.57],
          [1.97,.014,2.68,.24,1.57]
        ];
        for(const [x,y,z,scale,angle] of placements){
          const point=cabin.localToWorld(new T.Vector3(x,y,z));
          points.push({x:point.x,y:point.y,z:point.z,yaw:cabin.rotation.y+angle,scale});
        }
      }
    }
    return points;
  }
  function hydrography(T,scene,world){
    let lake;
    const bins=new Map(),area=24,key=(x,z)=>x+z*32768,spots=new Map();
    const impacts=world.waterfalls?.impacts||[];
    scene.updateMatrixWorld(true);
    scene.traverse(o=>{
      if(!o.isMesh)return;
      if(o.isWater||o.material?.uniforms?.normalSampler&&o.material?.uniforms?.mirrorSampler){
        const p=new T.Vector3().setFromMatrixPosition(o.matrixWorld);lake=p.y;return;
      }
      // Native waterfalls and their adjoining streams have transparent, sloped
      // triangle strips. Use the real sheet; a river is seldom level with its lake.
      if(!o.name?.endsWith(' · falling water')&&!o.name?.endsWith(' · stream and plunge pool'))return;
      const pos=o.geometry.attributes.position,ix=o.geometry.index?.array;if(!ix)return;
      for(let k=0;k<ix.length;k+=3){
        const a=ix[k],b=ix[k+1],c=ix[k+2],x=pos.getX(a),y=pos.getY(a),z=pos.getZ(a);
        const bx=pos.getX(b)-x,bz=pos.getZ(b)-z,cx=pos.getX(c)-x,cz=pos.getZ(c)-z,det=bx*cz-bz*cx;
        if(Math.abs(det)<.00001)continue;
        const by=pos.getY(b)-y,cy=pos.getY(c)-y,dx=(by*cz-bz*cy)/det,dz=(bx*cy-by*cx)/det;
        if(Math.hypot(dx,dz)>.82)continue;
        const tri={x,y,z,bx,bz,cx,cz,inv:1/det,dx,dz};
        for(let j=Math.floor((z+Math.min(0,bz,cz))/area);j<=Math.floor((z+Math.max(0,bz,cz))/area);j++)
          for(let i=Math.floor((x+Math.min(0,bx,cx))/area);i<=Math.floor((x+Math.max(0,bx,cx))/area);i++){
            const t=key(i,j);if(!bins.has(t))bins.set(t,[]);bins.get(t).push(tri);
          }
      }
    });
    // Fixed probes follow the current at each actual impact. The broad, flat
    // fiord receives an expanding fan; small brook pools receive fewer marks.
    for(const [j,p] of impacts.entries()){
      const n=Math.max(3,Math.min(28,Math.round(p.width*1.45)));
      for(let i=0;i<n;i++){
        const along=p.width*(.24+2.75*(i+.5)/n),cross=(hash(i,j,83)-.5)*p.width*(.85+.42*i/n);
        const x=p.x+p.dx*along-p.dz*cross,z=p.z+p.dz*along+p.dx*cross;
        const k=key(Math.floor(x/step),Math.floor(z/step));if(!spots.has(k))spots.set(k,[]);
        spots.get(k).push({x,z,gx:i+j*89,gz:233+j,jet:true,width:p.width});
      }
    }
    // Sample gentle sections downstream of an actual chute. These runnels
    // remain narrow, follow each bend and never cross onto the adjacent bank.
    for(const [j,route] of (world.waterfalls?.routes||[]).entries()){
      let last=-Infinity,i=0;
      for(const p of route.nodes){
        if(p.travel-last<Math.max(4,route.width*.84)||p.grade>.38)continue;
        const cross=(hash(i,j,179)-.5)*route.width*.33;
        const x=p.x-p.dz*cross,z=p.z+p.dx*cross;
        const k=key(Math.floor(x/step),Math.floor(z/step));if(!spots.has(k))spots.set(k,[]);
        spots.get(k).push({x,z,gx:i++,gz:4001+j,jet:true,width:route.width});
        last=p.travel;
      }
    }
    function sample(x,z,h,wet,shore){
      let surface,dx=0,dz=0;
      const river=world.channelWater?.(x,z)??world.riverSurfaceAt?.(x,z);
      if(Number.isFinite(river))surface=river;
      if(shore.signed<-.28&&world.region==='canyon')surface=world.rockSurface(x,z);
      for(const t of bins.get(key(Math.floor(x/area),Math.floor(z/area)))||[]){
        const rx=x-t.x,rz=z-t.z,u=(rx*t.cz-rz*t.cx)*t.inv,v=(t.bx*rz-t.bz*rx)*t.inv;
        if(u<0||v<0||u+v>1)continue;
        const y=t.y+rx*t.dx+rz*t.dz;if(!Number.isFinite(surface)||y>surface){surface=y;dx=t.dx;dz=t.dz;}
      }
      if(wet&&Number.isFinite(lake)&&h<lake+.025&&(!Number.isFinite(surface)||lake>surface)){
        surface=lake;dx=dz=0;
      }
      let fall=false;
      for(const p of impacts){
        const xx=x-p.x,zz=z-p.z,along=xx*p.dx+zz*p.dz,cross=Math.abs(zz*p.dx-xx*p.dz);
        if(along>-.45*p.width&&along<3.5*p.width&&cross<p.width*(.72+.34*Math.max(0,along)/p.width)){
          fall=true;break;
        }
      }
      return {surface,dx,dz,fall};
    }
    function assignForms(at){
      // Assign distinct source forms among genuine, physically supported
      // waterfall marks; dry trial positions do not consume a form.
      const sorted=[...spots.values()].flat().sort((a,b)=>hash(a.gx,a.gz,77)-hash(b.gx,b.gz,77));
      let n=0;
      for(const p of sorted){
        const a=at(p.x,p.z);
        if(Number.isFinite(a.water.surface)&&!a.q.ice)p.cell=(n++*11+7)%16;
      }
    }
    return {sample,assignForms,spotsAt:(i,j)=>spots.get(key(i,j))||[]};
  }
  function material(T,sheet,texture,time){
    const water=sheet.kind==='water',soil=sheet.kind==='ground'||sheet.kind==='sign',foliage=sheet.kind==='herb'||sheet.kind==='grass';
    const mat=new T.MeshStandardMaterial({map:texture,roughness:water?.29:sheet.kind==='ice'?.43:.88,
      metalness:0,side:T.DoubleSide,alphaTest:water?.014:soil?.035:.31,transparent:water||soil,
      opacity:water?.41:soil?.77:1,depthWrite:!water&&!soil,polygonOffset:water||sheet.kind==='sign'||sheet.kind==='ground',
      polygonOffsetFactor:-1,polygonOffsetUnits:-1});
    if(water||foliage){
      mat.onBeforeCompile=shader=>{
        shader.uniforms.aerieFieldTime=time;
        shader.vertexShader='attribute float aerieBend; uniform float aerieFieldTime; varying vec2 vFieldWorld;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',
          'vec3 root = transformed; vFieldWorld=root.xz;\n'+
          (water?'transformed.y += 0.003*aerieBend*sin(dot(root.xz,vec2(.9,.48))-aerieFieldTime*2.2);\n':
           'transformed.x += aerieBend*(.013*sin(aerieFieldTime*1.5+dot(root.xz,vec2(.38,.61)))+.004*sin(aerieFieldTime*3.9+root.z));\n')+
          '#include <project_vertex>');
        if(water){
          shader.fragmentShader='uniform float aerieFieldTime; varying vec2 vFieldWorld;\n'+shader.fragmentShader;
          shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',
            '#include <map_fragment>\nfloat flow=sin(dot(vFieldWorld,vec2(1.8,.9))-aerieFieldTime*2.6+.7*sin(vFieldWorld.y*.83+aerieFieldTime*.37)); float crossflow=sin(dot(vFieldWorld,vec2(-.46,2.3))-aerieFieldTime*1.72); diffuseColor.a*=.74+.2*flow+.06*crossflow; diffuseColor.rgb*=.94+.075*flow;');
          shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',
            '#include <normal_fragment_maps>\nnormal=normalize(normal+vec3(flow*.068,crossflow*.037,0.));');
        }
      };
      mat.customProgramCacheKey=()=>water?'regional-moving-water-v2':'regional-bending-herbs-v2';
    }
    return mat;
  }
  window.makeRegionalFieldScenery=(T,scene,world)=>{
    const root=new T.Group();root.name='Regional understory and shoreline details';scene.add(root);
    const profile=window.aerieCanopyProfile(world),nearShore=shoreline(world),structures=[...fixtures(T,scene,world),...(window.aerieMappedFieldFixtures?.(world,T,root)||[])];
    const hydro=hydrography(T,scene,world);
    const coarse=matchMedia('(pointer: coarse)').matches,tiles=new Map(),sheets=[];
    const time={value:0},floor=world.geologyGround||world.habitat?.surface||world.elevation||world.height;
    const materials=[],geometries=[],textures=[];
    let gone=false,prevX=1e20,prevY=1e20,prevZ=1e20,last=-1,tick=0,pending=false;
    const release=()=>{root.removeFromParent();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();};
    function sample(x,z){
      const q=profile.zone(x,z),h=floor(x,z),wet=world.habitat?.wet(x,z,h)??q.submerged;
      const shore=nearShore(x,z),water=hydro.sample(x,z,h,wet,shore);
      return {q,h,wet:wet||Number.isFinite(water.surface),shore,water,fall:water.fall};
    }
    function seatBranch(sheet,cell,scale,x,y,z,dx,dz,yaw,support){
      const geometry=sheet.forms[cell][0],src=geometry.attributes.position;
      if(!geometry.userData.sole){
        const sole=new Map();
        for(let i=0;i<src.count;i++){
          const key=Math.floor(src.getX(i)*6)+64*Math.floor(src.getZ(i)*6),old=sole.get(key);
          if(old===undefined||src.getY(i)<src.getY(old))sole.set(key,i);
        }
        geometry.userData.sole=[...sole.values()];
      }
      q.setFromUnitVectors(up,v.set(-dx,1,-dz).normalize()).multiply(turn.setFromAxisAngle(up,yaw));
      let gap=Infinity;
      for(const i of geometry.userData.sole){
        v.fromBufferAttribute(src,i).multiplyScalar(scale).applyQuaternion(q);
        gap=Math.min(gap,y+v.y-support(x+v.x,z+v.z));
      }
      if(Math.abs(gap)>.14)return NaN;
      return y-gap-Math.min(.034,.018*scale);
    }
    function build(ix,iz){
      const list=[],x0=ix*step,z0=iz*step,spots=[];
      for(let z=0;z<7;z++)for(let x=0;x<7;x++){
        const gx=ix*7+x,gz=iz*7+z;
        const sx=x0+(x+.12+.76*hash(gx,gz,1))*step/7,sz=z0+(z+.12+.76*hash(gx,gz,2))*step/7;
        const b=world.bounds;if(b&&(sx<b.minX||sz<b.minZ||sx>b.maxX||sz>b.maxZ))continue;
        spots.push({x:sx,z:sz,gx,gz,...sample(sx,sz)});
      }
      const jets=hydro.spotsAt(ix,iz).map(p=>({...p,...sample(p.x,p.z)}));
      for(const sheet of sheets){
        const seed=sheet.id.split('').reduce((h,c)=>Math.imul(h,31)+c.charCodeAt(0)|0,17);
        if(sheet.kind==='structure'){
          structures.forEach((p,i)=>{
            if(Math.floor(p.x/step)!==ix||Math.floor(p.z/step)!==iz)return;
            const y=p.y??(p.lake?world.waterLevel+.52:floor(p.x,p.z));
            if(Number.isFinite(y))list.push({sheet,cell:i%16,x:p.x,y,z:p.z,yaw:p.yaw,scale:p.scale??sheet.span*.73,dx:0,dz:0});
          });
          continue;
        }
        const frequency={wood:.11,ice:.20,sign:.11,ground:.47,herb:.51,grass:.55,water:.7}[sheet.kind];
        const guided=sheet.kind==='water'&&sheet.habitat==='stream';
        const field=guided?[...spots.filter(a=>!a.fall),...jets]:spots;
        for(const a of field){
          if((!a.jet&&hash(a.gx,a.gz,seed)>frequency)||!Number.isFinite(a.h)||!habitat(sheet,a.q,a.wet,a.shore,a.fall||a.jet))continue;
          if(sheet.id==='canyon-dry-wood'){
            // Driftwood is concentrated on the dry flood strand; leave the
            // slickrock walls, bare overlooks and live channel open.
            if(!(a.shore.signed>.55&&a.shore.signed<32)||a.q.slope>.38)continue;
          }
          const water=sheet.kind==='water'||sheet.special==='lily';
          const support=sheet.id==='canyon-dry-wood'?world.rockSurface:floor;
          let y=support===floor?a.h:support(a.x,a.z);
          if(water){
            if(!Number.isFinite(a.water.surface))continue;
            y=a.water.surface+(sheet.special==='lily'?.025:.018);
          }
          const cell=a.cell??Math.floor(hash(a.gx,a.gz,seed+1)*16);
          let span=(sheet.specimenSpans?.[cell]??sheet.span)*(.68+.64*hash(a.gx,a.gz,seed+3));
          if(a.jet)span=Math.min(span,a.width*(.26+.16*hash(a.gx,a.gz,seed+6)));
          if(!water&&world.openRoadAt?.(a.x,a.z,span*.45))continue;
          const delta=Math.min(2,Math.max(.3,span*.25));
          const dx=water?a.water.dx:(support(a.x+delta,a.z)-support(a.x-delta,a.z))/(delta*2);
          const dz=water?a.water.dz:(support(a.x,a.z+delta)-support(a.x,a.z-delta))/(delta*2);
          if(!Number.isFinite(dx+dz)||Math.hypot(dx,dz)>(sheet.kind==='ice'?1.9:1.05))continue;
          const yaw=water?a.shore.yaw+.27*(hash(a.gx,a.gz,seed+2)-.5):hash(a.gx,a.gz,seed+2)*Math.PI*2;
          if(sheet.kind==='wood'){
            y=seatBranch(sheet,cell,span,a.x,y,a.z,dx,dz,yaw,support);if(!Number.isFinite(y))continue;
          }
          const seating=sheet.kind==='wood'||water?0:.012;
          list.push({sheet,cell,x:a.x,y:y+seating,z:a.z,yaw,scale:span,dx,dz});
        }
      }
      return list;
    }
    const up=new T.Vector3(0,1,0),v=new T.Vector3(),q=new T.Quaternion(),turn=new T.Quaternion();
    function transformed(e,lod){
      e.surfaces??=[];
      if(e.surfaces[lod])return e.surfaces[lod];
      const geo=e.sheet.forms[e.cell][lod],src=geo.attributes.position,srcN=geo.attributes.normal;
      const pos=new Float32Array(src.count*3),norm=new Float32Array(src.count*3),bend=new Float32Array(src.count);
      q.setFromUnitVectors(up,v.set(-e.dx,1,-e.dz).normalize()).multiply(turn.setFromAxisAngle(up,e.yaw));
      for(let i=0;i<src.count;i++){
        v.fromBufferAttribute(src,i).multiplyScalar(e.scale).applyQuaternion(q);
        const j=i*3;pos[j]=v.x+e.x;pos[j+1]=v.y+e.y;pos[j+2]=v.z+e.z;
        v.fromBufferAttribute(srcN,i).applyQuaternion(q).toArray(norm,j);
        bend[i]=e.sheet.kind==='water'?e.scale:Math.max(0,src.getY(i))**2*e.scale;
      }
      return e.surfaces[lod]={pos,norm,bend,uv:geo.attributes.uv.array,index:geo.index.array};
    }
    function batch(sheet,lod,members,mesh){
      // A single texture atlas drives all sixteen source cells in this draw.
      // Reuse fixed world geometry and skip GPU uploads when membership is stable.
      members.sort((a,b)=>a.x-b.x||a.z-b.z||a.cell-b.cell);
      if(mesh&&members.length===mesh.userData.members.length&&members.every((e,i)=>e===mesh.userData.members[i])){
        mesh.visible=true;return mesh;
      }
      const data=members.map(e=>transformed(e,lod));
      let nv=0,ni=0;
      for(const item of data){nv+=item.bend.length;ni+=item.index.length;}
      if(!mesh){
        mesh=new T.Mesh(undefined,sheet.material);
        mesh.name=sheet.id+' · '+(lod?'middle':'near');
        mesh.userData.aerieRegional={sheet:sheet.id,cellAttribute:'aerieCell',lod};
        mesh.receiveShadow=true;mesh.frustumCulled=true;
        if(['water','ground','sign'].includes(sheet.kind))mesh.layers.set(1);
        root.add(mesh);
      }
      if(!mesh.geometry.index||nv>mesh.geometry.attributes.position.count||ni>mesh.geometry.index.count){
        mesh.geometry.dispose();
        const geo=new T.BufferGeometry(),capacity=2**Math.ceil(Math.log2(Math.max(16,nv)));
        const indexCapacity=2**Math.ceil(Math.log2(Math.max(24,ni)));
        for(const [field,n,Type] of [['position',3,Float32Array],['normal',3,Float32Array],['uv',2,Float32Array],['aerieBend',1,Float32Array],['aerieCell',1,Uint8Array]]){
          geo.setAttribute(field,new T.BufferAttribute(new Type(capacity*n),n).setUsage(T.DynamicDrawUsage));
        }
        geo.setIndex(new T.BufferAttribute(capacity>65535?new Uint32Array(indexCapacity):new Uint16Array(indexCapacity),1).setUsage(T.DynamicDrawUsage));
        mesh.geometry=geo;
      }
      const geo=mesh.geometry,a=geo.attributes,index=geo.index.array;
      let base=0,off=0;
      const box=new T.Box3();
      data.forEach((d,i)=>{
        const e=members[i],n=d.bend.length;
        a.position.array.set(d.pos,base*3);a.normal.array.set(d.norm,base*3);a.uv.array.set(d.uv,base*2);
        a.aerieBend.array.set(d.bend,base);a.aerieCell.array.fill(e.cell,base,base+n);
        for(let k=0;k<d.index.length;k++)index[off+k]=base+d.index[k];
        box.expandByPoint(v.set(e.x-e.scale,e.y-e.scale,e.z-e.scale));box.expandByPoint(v.set(e.x+e.scale,e.y+e.scale,e.z+e.scale));
        base+=n;off+=d.index.length;
      });
      for(const attr of Object.values(a)){attr.clearUpdateRanges();attr.addUpdateRange(0,nv*attr.itemSize);attr.needsUpdate=true;}
      geo.index.clearUpdateRanges();geo.index.addUpdateRange(0,ni);geo.index.needsUpdate=true;geo.setDrawRange(0,ni);
      geo.boundingBox=box;geo.boundingSphere=box.getBoundingSphere(new T.Sphere());
      mesh.userData.members=members;mesh.visible=true;return mesh;
    }
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
          const id=e.sheet.id+'/'+lod;
          if(!visible.has(id))visible.set(id,{sheet:e.sheet,lod,members:[]});
          visible.get(id).members.push(e);
        }
      }
      for(const k of tiles.keys())if(!active.has(k))tiles.delete(k);
      for(const m of root.children)if(m.userData.aerieRegional)m.visible=false;
      for(const [id,b] of visible){
        b.sheet.batches.set(id,batch(b.sheet,b.lod,b.members,b.sheet.batches.get(id)));
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
        const entry={...sheet,forms,material:mat,batches:new Map()};
        if(sheet.id==='moosehead-lake-wash'){
          // The Kineo approach reaches this layer-1 shoreline batch after crossing open water.
          // Prepare the same material and geometry layout that gather() will populate.
          const mesh=batch(entry,1,[]);mesh.visible=false;
          mesh.userData.prepareDirectMaterial=true;
          entry.batches.set(sheet.id+'/1',mesh);
        }
        sheets.push(entry);
      }));
      hydro.assignForms(sample);
      return sheets.length;
    })();
    function dispose(){gone=true;for(const mesh of root.children)if(mesh.userData.aerieRegional)mesh.geometry.dispose();root.userData.disposeMappedFieldFixtures?.();tiles.clear();release();}
    return {ready,update,dispose,get sheets(){return sheets.map(s=>s.id);},get placements(){return [...tiles.values()].flat();}};
  };
})();
