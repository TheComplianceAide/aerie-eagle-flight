// Instanced photographic rock scans. Near the eagle, angular size rather than
// a fixed ring decides where a high-detail scan is worth drawing.
window.addTalus = function addTalus(THREE, scene, world) {
  if (!window.talusScans?.length) return;
  const arid=world.region==='canyon',sierra=world.region==='yosemite',swiss=world.region==='swiss';
  const loader = new THREE.TextureLoader();
  function map(path, color = false) {
    const texture = loader.load(path);
    texture.flipY = false;
    texture.anisotropy = 4;
    if (color) texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  const material = new THREE.MeshStandardMaterial({
    map: map(arid?"canyon-talus.webp":"talus-colour.webp", true), normalMap: map("talus-normal.webp"),
    normalScale:new THREE.Vector2(.8,.8), roughnessMap:map("talus-roughness.webp"),
    roughness:1,metalness:0
  });
  if(arid){
    // The orthophoto was lit at midday. Light the loose debris from the
    // same sunset horizon field that shades the host cliff and its apron.
    material.onBeforeCompile=shader=>{
      shader.uniforms.rockHorizon=world.rockLight;
      shader.vertexShader='varying vec2 rockXZ;\n'+shader.vertexShader.replace('#include <project_vertex>',`
        #include <project_vertex>
        rockXZ=(instanceMatrix*vec4(transformed,1.)).xz;`);
      shader.fragmentShader='varying vec2 rockXZ;uniform sampler2D rockHorizon;\n'+shader.fragmentShader.replace('#include <lights_fragment_end>',`
        #include <lights_fragment_end>
        float openSun=texture2D(rockHorizon,vec2(rockXZ.x,-rockXZ.y)/6400.+.5).b;
        reflectedLight.directDiffuse*=mix(.15,1.,openSun);
        reflectedLight.indirectDiffuse*=mix(vec3(.70,.76,.82),vec3(1.),openSun);`);
    };
  }
  if(sierra){
    material.onBeforeCompile=shader=>{
      shader.uniforms.graniteHorizon={value:world.sunMask};
      shader.vertexShader='varying vec2 boulderUV;\n'+shader.vertexShader.replace('#include <project_vertex>',`
        #include <project_vertex>
        vec3 base=(instanceMatrix*vec4(transformed,1.)).xyz;
        boulderUV=vec2(base.x,-base.z)/11000.+.5;`);
      shader.fragmentShader='varying vec2 boulderUV;uniform sampler2D graniteHorizon;\n'+shader.fragmentShader.replace('#include <lights_fragment_end>',`
        #include <lights_fragment_end>
        float open=texture2D(graniteHorizon,boulderUV).r;
        reflectedLight.directDiffuse*=open;
        reflectedLight.indirectDiffuse*=mix(vec3(.64,.75,.88),vec3(1.),open);`);
    };
  }
  if(swiss){
    // Pale micritic limestone and darker weathered beds make up the Oeschinen
    // rockfall fans. Preserve the photographic fractured surface of the scan.
    material.onBeforeCompile=shader=>{
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
        #include <map_fragment>
        float bedding=dot(diffuseColor.rgb,vec3(.30,.57,.13));
        float carbonate=.025+.75*sqrt(max(0.,bedding));
        diffuseColor.rgb=vec3(.98,1.,1.024)*carbonate;
      `);
    };
  }
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
  const substrate=world.rockSurface||world.height;
  function spawnRock(x,z,size,onShore){
    const h=substrate(x,z);
    if(!Number.isFinite(h) || (h<water+.5 && inLake(x,z)) || (arid && world.habitat.wet(x,z,world.height(x,z))))return;
    if(swiss){
      // Fade from wave-sorted gravel at the western strand into the upslope
      // coarse debris. Large rockfall blocks still collect on the east wall.
      const radius=((x+642)/183)**2+((z-485)/121)**2;
      const strand=Math.max(0,Math.min(1,(1-radius)/.37))*Math.max(0,Math.min(1,(water+19-h)/12));
      size+=(.055+.15*Math.sqrt(size)+.052*size-size)*strand;
    }
    const r=Math.max(.7,size*.32);
    const dx=(substrate(x+r,z)-substrate(x-r,z))/(2*r);
    const dz=(substrate(x,z+r)-substrate(x,z-r))/(2*r);
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
  function seedCliffAprons(){
    // Fan out below the inner canyon walls. Rocks can stop on a shallow
    // apron, but cannot collect halfway up the cliff that released them.
    const ground=world.height;
    for(let x=-1640;x<40;x+=24)for(let z=-860;z<860;z+=24){
      const cx=x+24*random(),cz=z+24*random(),h=ground(cx,cz);
      const relief=Math.max(ground(cx-22,cz),ground(cx+22,cz),ground(cx,cz-22),ground(cx,cz+22))-h;
      const slope=Math.hypot(ground(cx+2,cz)-ground(cx-2,cz),ground(cx,cz+2)-ground(cx,cz-2))/4;
      if(relief<8||slope>1.22||world.habitat.wet(cx,cz,h))continue;
      const size=.77+3.55*random()**1.7, radius=4+6.1*size;
      spawnRock(cx,cz,size,false);
      const count=7+Math.floor(size*4);
      for(let i=0;i<count;i++){
        const a=random()*2*Math.PI,r=radius*Math.sqrt(random());
        const px=cx+r*Math.cos(a),pz=cz+r*Math.sin(a);
        if(ground(px,pz)<h+size*1.5)spawnRock(px,pz,size*(.085+.51*random()**1.45),false);
      }
    }
  }
  if(world.region==='dixville'){
    // Blocks weather off the gorge walls, while small rounded stones collect
    // along the wet bed. A few large boulders split the stream into threads.
    for(const b of window.dixvilleBrooks)for(const track of [b.upstream,b.rail,b.downstream])for(let j=1;j<track.length;j++){
      const a=track[j-1],end=track[j],dx=end[0]-a[0],dz=end[1]-a[1],span=Math.hypot(dx,dz);
      const half=b.name==='Baby Flume'?1.4:2.05;
      for(let i=0;i<Math.ceil(span*7);i++){
        const t=random(),bank=(random()<.5?-1:1)*(half*.56+random()**1.6*6.5);
        const size=.14+.84*random()**2+(random()<.075?1.05+1.8*random():0);
        spawnRock(a[0]+dx*t-dz*bank/span,a[1]+dz*t+dx*bank/span,size,Math.abs(bank)<half+1);
      }
    }
  }else if(sierra){
    // Slope, upslope relief, NAIP exposed stone and mapped streams delimit
    // rockfall fans. Place larger outlying blocks past the fine upper scree.
    for(const [cx,cz,bearing,rise] of world.talusFans||[]){
      const angle=bearing*Math.PI/180,dx=Math.cos(angle),dz=Math.sin(angle);
      const reach=14+rise*.15,span=6+reach*.49;
      for(let i=0;i<18;i++){
        const along=random(),side=(2*random()-1)*span*(.29+.71*along);
        const x=cx+dx*reach*along-dz*side,z=cz+dz*reach*along+dx*side;
        const size=.56+(.88+5.4*along+rise*.009)*random()**1.55;
        spawnRock(x,z,size,false);
      }
    }
  }else if(!arid){
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
  // The dry channel mask is an image. Seed after the initial scenery load so
  // both HTTP and offline launches use the same shoreline and rock positions.
  let needsAprons=arid;
  return function updateTalus(player,time) {
    if(needsAprons){seedCliffAprons();needsAprons=false;}
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
