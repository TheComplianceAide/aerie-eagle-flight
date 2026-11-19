// Instanced photographic rock scans. Near the eagle, angular size rather than
// a fixed ring decides where a high-detail scan is worth drawing.
window.addTalus = function addTalus(THREE, scene, world) {
  if (!window.talusScans?.length) return;
  const loader = new THREE.TextureLoader();
  function map(path, color = false) {
    const texture = loader.load(path);
    texture.flipY = false;
    texture.anisotropy = 4;
    if (color) texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  const material = new THREE.MeshStandardMaterial({
    map: map("talus-colour.webp", true), normalMap: map("talus-normal.webp"),
    normalScale:new THREE.Vector2(.8,.8), roughnessMap:map("talus-roughness.webp"),
    roughness:1,metalness:0
  });
  function unpack(encoded, Type) {
    const str = atob(encoded), bytes = new Uint8Array(str.length);
    for(let i=0;i<str.length;i++)bytes[i]=str.charCodeAt(i);
    return new Type(bytes.buffer);
  }
  const meshes = window.talusScans.map((scan,variant)=>scan.map((lod,level)=>{
    const geometry=new THREE.BufferGeometry();
    const positions=Float32Array.from(unpack(lod[0],Int16Array),v=>v/27000);
    geometry.setAttribute("position",new THREE.BufferAttribute(positions,3));
    geometry.setAttribute("normal",new THREE.BufferAttribute(unpack(lod[1],Int8Array),3,true));
    geometry.setAttribute("uv",new THREE.BufferAttribute(unpack(lod[2],Uint16Array),2,true));
    geometry.setIndex(new THREE.BufferAttribute(unpack(lod[3],Uint16Array),1));
    geometry.computeBoundingBox();
    const mesh=new THREE.InstancedMesh(geometry,material,level ? 220 : 68);
    mesh.name="Talus "+(variant+1)+(level ? " · distant" : " · near");
    mesh.frustumCulled=false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count=0;
    mesh.receiveShadow=true;scene.add(mesh);return mesh;
  }));

  const gridSize=92, cells=new Map(), up=new THREE.Vector3(0,1,0);
  const dummy=new THREE.Object3D(), orientation=new THREE.Quaternion(), normal=new THREE.Vector3();
  const shore=world.lakePolygon || [], water=world.waterLevel ?? 0;
  const maxHeight=Math.max(300,...(world.landmarks || []).map(p=>world.height(p.x,p.z)));
  const bounds=world.bounds || {minX:-3500,maxX:3500,minZ:-3500,maxZ:3500};
  let seed=926531;
  const random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
  const gridKey=(x,z)=>((x+32768)*65536+z+32768);
  const distanceAlong=[0];
  for(let i=0;i<shore.length;i++){
    const a=shore[i],b=shore[(i+1)%shore.length];
    distanceAlong.push(distanceAlong[i]+Math.hypot(b.x-a.x,b.z-a.z));
  }
  function inLake(x,z){
    let inside=false;
    for(let i=0,j=shore.length-1;i<shore.length;j=i++){
      const a=shore[i],b=shore[j];
      if((a.z>z)!==(b.z>z) && x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside;
    }
    return inside;
  }
  function shorelinePoint(){
    const d=random()*distanceAlong.at(-1);
    let i=0;while(i+1<shore.length && distanceAlong[i+1]<d)i++;
    const a=shore[i],b=shore[(i+1)%shore.length];
    const f=(d-distanceAlong[i])/Math.max(.01,distanceAlong[i+1]-distanceAlong[i]);
    return {x:a.x+(b.x-a.x)*f,z:a.z+(b.z-a.z)*f};
  }
  function spawnRock(x,z,size,onShore){
    const h=world.height(x,z);
    if(!Number.isFinite(h) || (h<water+.5 && inLake(x,z)))return;
    const r=Math.max(.7,size*.32);
    const dx=(world.height(x+r,z)-world.height(x-r,z))/(2*r);
    const dz=(world.height(x,z+r)-world.height(x,z-r))/(2*r);
    const slope=Math.hypot(dx,dz);
    if(slope>2.4)return;
    const variant=Math.floor(random()*meshes.length);
    const geom=meshes[variant][0].geometry;
    const height=geom.boundingBox.max.y*size;
    const stretch=.88+.26*random(), pitch=.1*(random()-.5), turn=random()*Math.PI*2;
    // A half-buried base follows the local scree slope without letting the
    // taller end of the boulder float when the terrain changes abruptly.
    normal.set(-dx,1,-dz).normalize();
    orientation.setFromUnitVectors(up,normal);
    dummy.position.set(x,h-height*(.08+.12*random()),z);
    dummy.quaternion.identity().slerp(orientation,.84);
    dummy.rotateY(turn);dummy.rotateX(pitch);
    dummy.scale.set(size,stretch*size,size*(.88+random()*.22));
    dummy.updateMatrix();
    const matrix=dummy.matrix.clone();
    const wet=onShore && h<water+1.8;
    const color=new THREE.Color().setRGB(1,.96+.04*random(),.87+.11*random()).multiplyScalar(wet?.68:.81+.24*random());
    // Shadow geometry is oriented directly on the sampled substrate.
    dummy.position.set(x,h+.06,z);
    dummy.quaternion.copy(orientation);dummy.rotateY(turn);
    dummy.scale.set(size*.58,size*.58,size*.51);dummy.updateMatrix();
    const rock={x,z,y:h,height:height*stretch,size,variant,matrix,color,shadow:dummy.matrix.clone()};
    const key=gridKey(Math.floor(x/gridSize),Math.floor(z/gridSize));
    let cell=cells.get(key);if(!cell){cell=[];cells.set(key,cell);}cell.push(rock);
  }
  for(let i=0;i<2150;i++){
    const onShore=i<470 && shore.length>2;
    let x,z;
    if(onShore){
      const p=shorelinePoint();x=p.x+(random()-.5)*48;z=p.z+(random()-.5)*48;
    }else{
      x=bounds.minX+random()*(bounds.maxX-bounds.minX);
      z=bounds.minZ+random()*(bounds.maxZ-bounds.minZ);
    }
    const h=world.height(x,z);
    const dx=(world.height(x+13,z)-world.height(x-13,z))/26;
    const dz=(world.height(x,z+13)-world.height(x,z-13))/26;
    const grade=Math.hypot(dx,dz);
    if(!onShore && (grade<.18 || grade>1.95 || (h<maxHeight*.27 && random()<.63)))continue;
    const diameter=onShore?1.55+random()**2*5.5:2.5+random()**2*7.5;
    const radius=onShore?8+random()*15:15+random()*40;
    const pieces=onShore?8+Math.floor(random()*15):10+Math.floor(random()*25);
    for(let n=0;n<pieces;n++){
      const angle=random()*2*Math.PI, reach=Math.sqrt(random())*radius;
      const spread=n===0?0:reach;
      const size=n===0?diameter:diameter*(.09+.64*random()**2);
      spawnRock(x+Math.cos(angle)*spread,z+Math.sin(angle)*spread,size,onShore);
    }
  }

  const disk=new THREE.PlaneGeometry(2,2);disk.rotateX(-Math.PI/2);
  const shadowMaterial=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,
    uniforms:{shade:{value:new THREE.Color(0x272721)}},
    vertexShader:`varying vec2 p;void main(){p=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform vec3 shade;varying vec2 p;void main(){float a=.22*(1.-smoothstep(.20,1.,dot(p,p)));if(a<.008)discard;gl_FragColor=vec4(shade,a);}`
  });
  const shadows=new THREE.InstancedMesh(disk,shadowMaterial,700);
  shadows.count=0;shadows.name="Boulder contact shadows";shadows.frustumCulled=false;shadows.renderOrder=1;
  shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(shadows);
  const floorBeforeRocks=world.clearance || world.height;
  world.clearance=(x,z)=>{
    let top=floorBeforeRocks(x,z);
    const cx=Math.floor(x/gridSize),cz=Math.floor(z/gridSize);
    // Query the containing cell and neighbours when within boulder radius of an edge.
    const fx=x/gridSize-cx, fz=z/gridSize-cz;
    const x0=fx<.075?cx-1:cx,x1=fx>.925?cx+1:cx;
    const z0=fz<.075?cz-1:cz,z1=fz>.925?cz+1:cz;
    for(let a=x0;a<=x1;a++)for(let b=z0;b<=z1;b++){
      for(const r of cells.get(gridKey(a,b)) || []){
        const shape=1-((r.x-x)**2+(r.z-z)**2)/((r.size*.44)**2);
        if(shape>0)top=Math.max(top,r.y+r.height*.82*Math.sqrt(shape));
      }
    }
    return top;
  };
  const groups=meshes.map(()=>[[],[]]);
  let lastX=Infinity,lastY=Infinity,lastZ=Infinity,lastTime=-Infinity;
  return function updateTalus(player,time) {
    if(time>=lastTime && Math.hypot(player.x-lastX,player.y-lastY,player.z-lastZ)<9)return;
    lastX=player.x;lastY=player.y;lastZ=player.z;lastTime=time;
    const cx=Math.floor(player.x/gridSize),cz=Math.floor(player.z/gridSize);
    for(const pair of groups)for(const list of pair)list.length=0;
    for(let a=cx-7;a<=cx+7;a++)for(let b=cz-7;b<=cz+7;b++){
      for(const rock of cells.get(gridKey(a,b)) || []){
        const d2=(rock.x-player.x)**2+(rock.y-player.y)**2+(rock.z-player.z)**2;
        if(d2>Math.min(600,48+rock.size*145)**2)continue;
        const level=d2<(18+20*rock.size)**2?0:1;
        groups[rock.variant][level].push({rock,d2});
      }
    }
    let shadowCount=0;
    for(let v=0;v<meshes.length;v++)for(let level=0;level<2;level++){
      const mesh=meshes[v][level], sorted=groups[v][level].sort((a,b)=>a.d2-b.d2);
      mesh.count=Math.min(sorted.length,mesh.instanceMatrix.count);
      for(let i=0;i<mesh.count;i++){
        const {rock,d2}=sorted[i];
        mesh.setMatrixAt(i,rock.matrix);mesh.setColorAt(i,rock.color);
        if(d2<180**2 && shadowCount<shadows.instanceMatrix.count)shadows.setMatrixAt(shadowCount++,rock.shadow);
      }
      mesh.instanceMatrix.needsUpdate=true;
      if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    }
    shadows.count=shadowCount;shadows.instanceMatrix.needsUpdate=true;
  };
};
