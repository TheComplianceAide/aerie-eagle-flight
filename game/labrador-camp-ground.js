// Immediate camp surroundings in cabin-local metres. The same trees render,
// receive forest lighting and participate in flight clearance via atlas plant().
window.addBerteCampGround=function addBerteCampGround(T,scene,root,{site,floor,ground,water,waterDistance,texture}) {
  let seed=75269;
  const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const sin=Math.sin(site.yaw),cos=Math.cos(site.yaw),world=(x,z)=>[site.x+cos*x+sin*z,site.z-sin*x+cos*z];
  const grids=[];
  scene.traverse(o=>{
    const g=o.geometry,p=g?.attributes?.position,cols=g?.parameters?.widthSegments+1;
    if(!p||!o.material?.uniforms?.shoreLevel||!Number.isFinite(cols))return;
    const rows=p.count/cols,left=p.getX(0),right=p.getX(cols-1),top=p.getZ(0),bottom=p.getZ(p.count-1);
    if(site.x+90>=left&&site.x-90<=right&&site.z+90>=top&&site.z-90<=bottom)grids.push({p,cols,rows,left,right,top,bottom});
  });
  // Seat trunks, lichen-covered rocks and moss on the triangles actually drawn.
  function surface(x,z){
    const [wx,wz]=world(x,z);
    for(const g of grids) if(wx>=g.left&&wx<g.right&&wz>=g.top&&wz<g.bottom){
      const u=(wx-g.left)/(g.right-g.left)*(g.cols-1),v=(wz-g.top)/(g.bottom-g.top)*(g.rows-1);
      const i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j,k=i+j*g.cols,p=g.p;
      return a+b<1?p.getY(k)*(1-a-b)+p.getY(k+1)*a+p.getY(k+g.cols)*b:
        p.getY(k+g.cols+1)*(a+b-1)+p.getY(k+g.cols)*(1-a)+p.getY(k+1)*(1-b);
    }
    return ground(x,z);
  }
  const campTrees=[],localTrees=[];
  function spruce(x,z,height,width) {
    const y=surface(x,z);if(y<water+.46)return;
    if(localTrees.some(t=>Math.hypot(t.x-x,t.z-z)<1.35))return;
    const [wx,wz]=world(x,z),tree={x:wx,z:wz,y,height,width,seed:rand(),species:4};
    campTrees.push(tree);localTrees.push({x,z,width,height});
  }
  // Preserve negative space from the album: no trunks across the porch or along
  // the boat approach. Two narrow spruce spires frame the rear left roofline.
  for(const [x,z,h,w] of [[-5.75,-3.0,6.2,1.38],[-6.8,-5.65,7.6,1.6],[-4.0,-7.15,4.9,1.28],[-1.2,-9.25,8.15,1.9],[2.1,-7.7,5.15,1.28],[4.5,-6.5,6.35,1.47],[6.4,-2.9,5.7,1.32],[7.1,.05,4.2,1.0],[9.1,4.0,3.1,.85],[-9.6,1.8,3.6,1.05],[-12.1,5.1,2.7,.9],[12.4,9,5.8,1.45],[-16.5,13,4.8,1.1]]) spruce(x,z,h,w);
  for(let i=0;i<187;i++) {
    const x=(rand()-.5)*83,z=rand()*67-45;
    if(z>-7 && Math.abs(x)<(z>5?.67*z+7:7))continue;
    const h=2.2+5.4*rand()+2.2*rand();
    spruce(x,z,h,h*(.19+.12*rand()));
  }
  const floorMesh=new T.PlaneGeometry(76,73,66,65);
  floorMesh.rotateX(-Math.PI/2);
  const positions=floorMesh.attributes.position,uv=floorMesh.attributes.uv,colors=[];
  const dry=(x,z)=>surface(x,z)>water+.22;
  const smooth=(lo,hi,x)=>{const t=Math.min(1,Math.max(0,(x-lo)/(hi-lo)));return t*t*(3-2*t);};
  for(let i=0;i<positions.count;i++){
    const x=positions.getX(i),z=positions.getZ(i)-5.5,y=surface(x,z);
    const distance=Math.sqrt((x/5.25)**2+(z/6.6)**2);
    const aisle=z>2?Math.abs(x-.42*Math.sin(z*.35)):9;
    const irregular=.19*Math.sin(z*1.2+x*.9)+.11*Math.sin(x*1.91-z*.63);
    const edge=Math.min(38-Math.abs(x),36.5-Math.abs(z+5.5));
    const cover=smooth(.74,1.32,distance+irregular)*smooth(.75,2.10,aisle+irregular)*smooth(.03,.48,y-water)*smooth(0,7,edge);
    let shadow=1;
    for(const tree of localTrees){
      const dx=x-tree.x,dz=z-tree.z,r=tree.width*.69+.45;
      if(Math.abs(dx)<r&&Math.abs(dz)<r)shadow=Math.min(shadow,.51+.49*smooth(0,r,Math.hypot(dx,dz)));
    }
    positions.setXYZ(i,x,y-floor+.033,z);uv.setXY(i,x*.29,z*.29);
    colors.push(shadow*.89,shadow*.98,shadow*.78,.91*cover);
  }
  floorMesh.setAttribute('color',new T.Float32BufferAttribute(colors,4));floorMesh.computeVertexNormals();floorMesh.computeBoundingSphere();
  function add(geometry,material,name){
    const mesh=new T.Mesh(geometry,material);mesh.name=name;mesh.receiveShadow=true;root.add(mesh);return mesh;
  }
  const litter=new T.MeshStandardMaterial({map:texture('berte-camp-floor.webp'),roughness:.98,vertexColors:true,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
  litter.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      // Interleave rotated photo patches with soft irregular boundaries to keep
      // the same fallen stick from marching across the slope in parallel rows.
      vec2 p=vMapUv;
      vec2 q=mat2(.72,-.694,.694,.72)*p*1.16+vec2(2.93,1.57);
      vec2 k=mat2(.32,.948,-.948,.32)*p*.81+vec2(.36,4.91);
      float zone=sin(p.x*.81+p.y*.31+.7*sin(p.y*.85))+sin(p.y*1.13-.36*p.x);
      float overlap=smoothstep(-.71,.63,zone);
      vec4 grain=mix(texture2D(map,p),texture2D(map,q),overlap);
      float third=smoothstep(.88,1.70,cos(p.x*.7-p.y*.91)+sin(p.x*1.04+.6*p.y));
      diffuseColor*=mix(grain,texture2D(map,k),third);
    `);
  };
  add(floorMesh,litter,'Moss and needle litter under the spruce');
  // Bank stones and pebble clusters share one instanced draw. Submerged stones
  // sit in the shallows while irregular heather and sedges stop at the waterline.
  const chunks=[],plants=[];
  function stone(x,z,size) {
    const y=surface(x,z);
    if(y<water-.55 || Math.hypot(x,z-1)<3.85) return;
    chunks.push([x,y-floor+.048*size,z,size]);
  }
  for(let i=0;i<190;i++){
    const z=-15+rand()*(waterDistance+20),side=rand()<.50?-1:1;
    const bank=z>waterDistance-4, x=bank?(rand()-.5)*18:side*(2.7+13*rand());
    stone(x,z,(.080+rand()**3*.68)*(bank?1:.83));
    if(i%3===0) for(let k=0;k<5;k++)stone(x+rand()*.8,z+rand()*.8,.055+.09*rand());
  }
  for(const [x,z] of [[-3.8,2.6],[4.3,3.65],[-5.5,-2.1],[4.85,5.1],[1.85,waterDistance-1.6]])stone(x,z,.62);
  const rock=new T.IcosahedronGeometry(1,1),rp=rock.attributes.position;
  // Deterministic deformation maintains shared edges between the triangle faces.
  for(let i=0;i<rp.count;i++) {
    const x=rp.getX(i),y=rp.getY(i),z=rp.getZ(i),f=1+.105*Math.sin(x*7.1+y*3.6-z*6.2);
    rp.setXYZ(i,x*f,y*f,z*f);
  }
  rock.computeVertexNormals();
  const pebble=new T.InstancedMesh(rock,new T.MeshStandardMaterial({map:texture('shore-stone.webp'),roughness:.93}),chunks.length);
  const o=new T.Object3D(),color=new T.Color();
  chunks.forEach(([x,y,z,r],i)=>{
    o.position.set(x,y,z);o.rotation.set(.3*rand(),6.28*rand(),.24*rand());o.scale.set(r*(.73+.48*rand()),r*(.30+.33*rand()),r*(.59+.35*rand()));o.updateMatrix();
    pebble.setMatrixAt(i,o.matrix);color.setHSL(.11+.085*rand(),.07+.15*rand(),.66+.22*rand());pebble.setColorAt(i,color);
  });
  pebble.castShadow=true;pebble.receiveShadow=true;pebble.name='Glacial cobbles on the landing';root.add(pebble);
  const contact=chunks.filter(p=>p[3]>.24);
  const shade=new T.MeshBasicMaterial({color:0x2b3023,transparent:true,opacity:.28,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
  shade.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec2 groundUV;\n'+shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\ngroundUV=uv;');
    shader.fragmentShader='varying vec2 groundUV;\n'+shader.fragmentShader.replace('#include <alphamap_fragment>',
      '#include <alphamap_fragment>\ndiffuseColor.a*=1.-smoothstep(.15,1.,length(groundUV*2.-1.));');
  };
  const stamp=new T.PlaneGeometry(2,2);stamp.rotateX(-Math.PI/2);
  const occlusion=new T.InstancedMesh(stamp,shade,contact.length);
  for(let i=0;i<contact.length;i++){
    const [x,y,z,r]=contact[i],sx=(surface(x+.2,z)-surface(x-.2,z))/.4,sz=(surface(x,z+.2)-surface(x,z-.2))/.4;
    o.position.set(x,surface(x,z)-floor+.052,z);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),new T.Vector3(-sx,1,-sz).normalize());
    o.scale.set(r*1.40,1,r*1.1);o.updateMatrix();occlusion.setMatrixAt(i,o.matrix);
  }
  occlusion.name='Contact shade at cobble edges';occlusion.renderOrder=1;root.add(occlusion);
  for(let i=0;i<680;i++) {
    const x=(rand()-.5)*39,z=-15+rand()*(waterDistance+18);
    if(!dry(x,z)||Math.hypot(x/5.0,z/6.4)<1.0||z>2&&Math.abs(x)<1.85)continue;
    if(z>waterDistance-2 && rand()<.4)continue;
    const species=z>waterDistance-5?1:rand()<.36?4:rand()<.45?1:0;
    const h=(species===4?.64:.37)*(.50+rand());
    plants.push([x,surface(x,z)-floor-.012,z,h,species,rand()*Math.PI]);
  }
  const pos=[],tex=[],idx=[];
  for(const [x,y,z,h,kind,turn] of plants){
    for(let k=0;k<2;k++){
      const a=turn+k*Math.PI/2,w=h*1.08,dx=Math.cos(a)*w,dz=Math.sin(a)*w,start=pos.length/3;
      pos.push(x-dx,y,z-dz,x+dx,y,z+dz,x+dx,y+2.05*h,z+dz,x-dx,y+2.05*h,z-dz);
      const v=(7-kind)/8,u=k*.25;
      tex.push(u+.001,v+.001,u+.249,v+.001,u+.249,v+.124,u+.001,v+.124);
      idx.push(start,start+1,start+2,start,start+2,start+3);
    }
  }
  const leaves=new T.BufferGeometry();leaves.setAttribute('position',new T.Float32BufferAttribute(pos,3));leaves.setAttribute('uv',new T.Float32BufferAttribute(tex,2));leaves.setIndex(idx);leaves.computeVertexNormals();
  add(leaves,new T.MeshStandardMaterial({map:texture('understory-stands.webp'),side:T.DoubleSide,roughness:.94,alphaTest:.27,color:0xd2cfb7}),'Sedge, grass and low shrubs at the clearing edge');
  return campTrees;
};
