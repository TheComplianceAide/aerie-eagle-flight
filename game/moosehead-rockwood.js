// The public ramp, old railroad pier and seasonal Kineo shuttle at Rockwood.
// Bearings, widths and exposed ground are registered to the Maine ortho and 3DEP survey.
window.fitRockwoodLanding=function(survey){
  const data=window.rockwoodLandingData,ring=survey.shore;
  const same=(a,b)=>a[0]===b[0]&&a[1]===b[1];
  const begin=ring.findIndex(p=>same(p,data.start)),end=ring.findIndex(p=>same(p,data.end));
  if(begin<0||end<=begin)return;
  // The coastal thicket is generated from one continuous, seeded walk. The old
  // coarse Rockwood shelf admitted these nine candidate roots before the road
  // and pier were surveyed. Traverse those same slots before suppressing the
  // guesswork locally so a change in Rockwood never moves shrubs in Lily Bay.
  const legacyRoots=[[2093,5],[2085,233],[2039,264],[2048,1676],[2338,2747],
    [2232,2843],[2334,2844],[2934,3367],[2877,3325]];
  const rootSlots=new Set(legacyRoots.map(([i,j])=>i*8192+j));
  survey.rockwoodGrowthSlot=(x,z)=>x>=-425&&x< -94&&z>=1500&&z<1840
    ?rootSlots.has(Math.round((x+425)*16)*8192+Math.round((z-1500)*16)):null;
  survey.rockwoodGrowthGuide=ring.slice();
  ring.splice(begin+1,end-begin-1,...data.shore);
  survey.landmarks=[...survey.landmarks,{name:'Rockwood public landing',x:-252.3,z:1664.0,discoveryRadius:115,
    approach:[-274.6,1699.6,-252.8,1650.0,19.3,8,13]}];
  // The small OSM polygon is precisely the seasonal boarding float now rebuilt in 3D.
  // Other camps' piers and both existing public buildings use their original survey.
  if(survey.settlement)survey.settlement.piers=survey.settlement.piers.filter(
    ([closed,points])=>!(closed&&points.some(p=>same(p,[-250.2,1655.7]))));
};

window.makeRockwoodLanding=function(T,scene,elevation,datum){
  const data=window.rockwoodLandingData,level=datum+.16;
  const measured=window.aerieRegionalLandforms.get('rockwood');
  const ground=measured.surfacePatch(-263,1673,144,elevation);
  const groundAt=(x,z)=>ground(x,z)??elevation(x,z);
  const tints=new Map(),orders=new Map(),supports=[];
  const boat=new T.Group();boat.name='Moored Mount Kineo passenger shuttle';scene.add(boat);
  function color(value){
    if(value?.isColor)return value;
    if(!tints.has(value))tints.set(value,new T.Color(value));return tints.get(value);
  }
  function face(material,tint,points,uv=null,target=scene){
    const key=(target===boat?'boat/':'landing/')+material;
    let bin=orders.get(key);
    if(!bin){bin={target,material,positions:[],colors:[],uvs:[]};orders.set(key,bin);}
    const colors=Array.isArray(tint)?tint.map(color):points.map(()=>color(tint));
    const coords=uv||points.map(([x,y,z])=>[x*.48,z*.48+y*.48]);
    for(const i of points.length===3?[0,1,2]:[0,1,2,0,2,3]){
      bin.positions.push(...points[i]);bin.uvs.push(...coords[i]);bin.colors.push(colors[i].r,colors[i].g,colors[i].b);
    }
  }
  function frame(a,b){
    const len=Math.hypot(b[0]-a[0],b[1]-a[1]),dx=(b[0]-a[0])/len,dz=(b[1]-a[1])/len;
    return {a,len,dx,dz,at:(u,v,y)=>[a[0]+dx*u-dz*v,y,a[1]+dz*u+dx*v]};
  }
  const hullFrame=frame([0,0],[1,0]);
  function box(f,a,b,lo,hi,v0,v1,tint,mat,owner=scene){
    const p=[f.at(a,v0,lo),f.at(b,v0,lo),f.at(b,v1,lo),f.at(a,v1,lo)];
    const q=[f.at(a,v0,hi),f.at(b,v0,hi),f.at(b,v1,hi),f.at(a,v1,hi)];
    for(let i=0;i<4;i++){
      const j=(i+1)%4,span=i%2?v1-v0:b-a;
      face(mat,tint,[p[i],p[j],q[j],q[i]],[[0,0],[span/2.2,0],[span/2.2,(hi-lo)*1.5],[0,(hi-lo)*1.5]],owner);
    }
    face(mat,tint,q,[[a/2.5,v0/2.5],[b/2.5,v0/2.5],[b/2.5,v1/2.5],[a/2.5,v1/2.5]],owner);
  }
  function beam(p,q,r,tint,mat,owner=scene){
    const axis=new T.Vector3(q[0]-p[0],q[1]-p[1],q[2]-p[2]).normalize();
    const a=new T.Vector3().crossVectors(axis,Math.abs(axis.y)>.94?new T.Vector3(1,0,0):new T.Vector3(0,1,0)).normalize();
    const b=new T.Vector3().crossVectors(axis,a),point=(o,i)=>{const c=2*Math.PI*i/6;
      return [o[0]+r*(a.x*Math.cos(c)+b.x*Math.sin(c)),o[1]+r*(a.y*Math.cos(c)+b.y*Math.sin(c)),o[2]+r*(a.z*Math.cos(c)+b.z*Math.sin(c))];};
    for(let i=0;i<6;i++)face(mat,tint,[point(p,i),point(p,i+1),point(q,i+1),point(q,i)],null,owner);
  }
  function register(f,half,height){
    supports.push({f,half,height});
  }
  function inside(poly,x,z){
    let on=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const a=poly[i],b=poly[j];
      if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])on=!on;
    }
    return on;
  }
  // A measured top 1.45 m above the game's lake. Crib courses overlap the terrain
  // edge at the shoreline rather than generating a second sloping gravel shelf.
  const courseTints=[0xc9c5af,0xbbb9a8,0xc9c6b6,0xd4cfb9,0xb9baa9,0xcfccbb];
  const [westFoot,westEnd,eastEnd,eastFoot]=data.pier;
  function crib(a,b,side){
    const f=frame(a,b),floor=level-.48,top=313.86;
    for(let course=0;course<8;course++){
      const y=floor+(top-floor)/8*course,h=(top-floor)/8-.012;
      for(let begin=-((course%2)*2.15);begin<f.len;begin+=4.35){
        const i=Math.max(0,begin),j=Math.min(f.len,begin+4.32);if(j<=i)continue;
        const v=side*.23;
        box(f,i,j,y,y+h,Math.min(-v,v),Math.max(-v,v),courseTints[(course+Math.floor(i/4.35))%courseTints.length],'timber');
      }
    }
    for(let u=.6;u<f.len;u+=3.14){
      const h=top-.06;
      box(f,u-.125,u+.125,level-.15,h,side*.31-.09,side*.31+.09,0x989483,'timber');
      for(const y of [h-.25,h-.85])box(f,u-.032,u+.032,y-.032,y+.032,side*.41-.016,side*.41+.016,0x72716b,'metal');
    }
    box(f,0,f.len,top-.05,top+.105,-.29,.29,0xb2ac96,'timber');register(f,.29,()=>top+.105);
  }
  crib(westFoot,westEnd,-1);crib(westEnd,eastEnd,-1);crib(eastEnd,eastFoot,-1);
  // The filled north end has a flat gravel turnout contained by vertical cribs.
  // Render the last metre across the bare-earth grid's softened artificial edge.
  const cap=frame(westEnd,eastEnd),capLen=cap.len;
  const capWidthAt=u=>10.7+2.2*u/capLen;
  const capAt=(x,z)=>Math.max(313.835,groundAt(x,z)+.029);
  function capPoint(u,fraction){
    const p=cap.at(u,capWidthAt(u)*fraction,0);p[1]=capAt(p[0],p[2]);return p;
  }
  const capColumns=Math.ceil(capLen/1.35),capRows=9;
  for(let j=0;j<capRows;j++)for(let i=0;i<capColumns;i++){
    const a=i*capLen/capColumns,b=(i+1)*capLen/capColumns,v=j/capRows,w=(j+1)/capRows;
    const points=[capPoint(a,v),capPoint(b,v),capPoint(b,w),capPoint(a,w)];
    face('aggregate',0xe5e3d8,points,points.map(([x,_,z])=>[x/2.3,z/2.3]));
  }
  // Public-access directory: 30 ft width, 57 ft length, grade 14 percent.
  // Cedar side floats begin alongside the sloping concrete, not across either lane.
  const info=data.ramp,tail=[info.top[0]+info.axis[0]*info.length,info.top[1]+info.axis[1]*info.length];
  const slip=frame(info.top,tail),half=info.width/2,slipY=u=>info.y-info.grade*u;
  face('concrete',0xc2c0a9,[slip.at(0,-half,slipY(0)),slip.at(slip.len,-half,slipY(slip.len)),
    slip.at(slip.len,half,slipY(slip.len)),slip.at(0,half,slipY(0))],[[0,0],[slip.len/3,0],[slip.len/3,info.width/3],[0,info.width/3]]);
  for(let u=.76;u<slip.len;u+=.74){
    face('trim',u%2<1?0x858477:0x888779,[slip.at(u,-half+.09,slipY(u)+.009),slip.at(u+.026,-half+.09,slipY(u+.026)+.009),
      slip.at(u+.026,half-.09,slipY(u+.026)+.009),slip.at(u,half-.09,slipY(u)+.009)]);
  }
  register(slip,half,slipY);
  const floating=frame([-256.65,1674.8],[-248.55,1655.55]),deck=level+.42,w=1.04;
  box(floating,0,floating.len,deck-.40,deck-.09,-w,w,0x615d51,'timber');
  const planks=Math.ceil(floating.len/.19);
  for(let i=0;i<planks;i++){
    const u=floating.len*i/planks,v=floating.len*(i+1)/planks-.011,shade=[0xdbd8c5,0xe3dfce,0xd3d1c4,0xeae7d6][i%4];
    face('timber',shade,[floating.at(u,-w,deck),floating.at(v,-w,deck),floating.at(v,w,deck),floating.at(u,w,deck)],
      [[0,u/1.70],[0,v/1.70],[1.38,v/1.70],[1.38,u/1.70]]);
  }
  for(const off of [-1,1])box(floating,0,floating.len,deck-.22,deck-.01,off*w-.05,off*w+.05,0x8f8877,'timber');
  for(const [u,side] of [[2.2,1],[10.5,-1],[14.8,1],[18.4,1]]){
    const v=side*(w-.13),point=(x,y)=>floating.at(x,v,y);
    box(floating,u-.16,u+.16,deck+.01,deck+.045,v-.055,v+.055,0x868d86,'metal');
    for(const sign of [-1,1])beam(point(u,deck+.05),point(u+.178*sign,deck+.138),.028,0xc0c4b3,'metal');
  }
  register(floating,w,()=>deck);
  const gang=frame([-258.65,1679.60],floating.a),gy=groundAt(...gang.a)+.095;
  face('timber',0xbfb59c,[gang.at(0,-w,gy),gang.at(gang.len,-w,deck+.02),gang.at(gang.len,w,deck+.02),gang.at(0,w,gy)]);
  register(gang,w,u=>gy+(deck+.02-gy)*u/gang.len);

  // The local operator's open-sided, twin-aluminum-pontoon shuttle has a long
  // green canopy, an amidships boarding gate and one outboard motor.
  const boatCenter=floating.at(floating.len*.67,2.49,level),direction=floating;
  boat.position.set(...boatCenter);boat.rotation.y=-Math.atan2(direction.dz,direction.dx);
  for(const side of [-.88,.88]){
    const sections=[[-4.60,.05,.17],[-4.43,.29,.08],[-4.10,.37,.03],[3.48,.38,.03],[3.93,.32,.10],[4.48,.07,.24]];
    const vertex=([u,r,h],i)=>{const a=i*Math.PI/5;return [u,h+r*Math.sin(a),side+r*Math.cos(a)];};
    for(let j=1;j<sections.length;j++)for(let i=0;i<10;i++){
      face('metal',i<5?0xbcc1ba:0x89948f,[vertex(sections[j-1],i),vertex(sections[j-1],i+1),vertex(sections[j],i+1),vertex(sections[j],i)],null,boat);
    }
  }
  box(hullFrame,-4.20,4.29,.31,.47,-1.20,1.20,0xaca897,'metal',boat);
  for(const v of [-1.14,1.14]){
    const boarding=v<0;
    for(const [a,b] of boarding?[[-3.94,-1.77],[-.72,3.88]]:[[-3.94,3.88]]){
      box(hullFrame,a,b,.47,1.31,v-.034,v+.034,0xcac9ba,'trim',boat);
      const outward=v+Math.sign(v)*.039;
      if(b-a>3.8){
        const left=v<0?b:a,right=v<0?a:b;
        face('hullPanel',0xf6f5e9,[[left,.51,outward],[right,.51,outward],[right,1.28,outward],[left,1.28,outward]],[[0,0],[1,0],[1,1],[0,1]],boat);
      }
      for(const h of [.49,.79,1.31])beam([a,h,outward],[b,h,outward],.036,0xa0aca6,'metal',boat);
      for(let u=a;u<=b+.001;u+=1.26)beam([u,.49,outward],[u,1.32,outward],.029,0x9aa6a0,'metal',boat);
    }
    for(const u of [-3.73,-1.51,.76,3.63])beam([u,1.30,v],[u-.22,2.48,v],.028,0xaeb6b1,'metal',boat);
  }
  for(const u of [-3.93,3.88])box(hullFrame,u-.03,u+.03,.49,1.25,-1.13,1.13,0xc8c9bd,'trim',boat);
  for(const u of [-3.28,-1.83,-.02,1.64,3.17]){
    box(hullFrame,u-.23,u+.23,.53,.82,-.81,.85,0x717971,'trim',boat);
    box(hullFrame,u-.24,u+.24,.81,.89,-.85,.87,0xb1b09f,'trim',boat);
  }
  // Helm face, spokes and pedestal. The open gangway remains between its guard panels.
  box(hullFrame,-2.79,-2.16,.47,1.12,.14,.84,0xa9b1a7,'trim',boat);
  const wheel=(i)=>[-2.16+.035*Math.sin(i*Math.PI/8),1.085+.138*Math.sin(i*Math.PI/8),.47+.138*Math.cos(i*Math.PI/8)];
  for(let i=0;i<16;i++)beam(wheel(i),wheel(i+1),.017,0x303b35,'trim',boat);
  for(const i of [0,5,10])beam([-2.18,1.085,.47],wheel(i),.009,0xb2b5a6,'metal',boat);
  for(const u of [-2.56,.33,2.59])for(const v of [-.83,.84])box(hullFrame,u-.23,u+.23,.70,1.04,v-.06,v+.06,0xb8b7a7,'trim',boat);
  const panel=(u,v)=>[u,2.52+.11*(1-Math.pow(Math.abs(v)/1.27,2))-.038*Math.cos(u*2.2),v];
  for(let i=0;i<10;i++){
    const a=-4.06+i*.81,b=a+.81;
    for(let j=0;j<6;j++){const v=-1.27+j*2.54/6,w=v+2.54/6;
      face('canvas',0xe4eada,[panel(a,v),panel(b,v),panel(b,w),panel(a,w)],[[i/10,j/6],[(i+1)/10,j/6],[(i+1)/10,(j+1)/6],[i/10,(j+1)/6]],boat);}
    for(const v of [-1.27,1.27]){const p=panel(a,v),q=panel(b,v);face('canvas',0xc1cfba,[p,q,[q[0],q[1]-.13,v],[p[0],p[1]-.13,v]],[[i/10,.04],[(i+1)/10,.04],[(i+1)/10,.17],[i/10,.17]],boat);}
  }
  for(const u of [-3.75,-1.56,.73,3.63])beam([u,2.46,-1.17],[u,2.46,1.17],.031,0xadb3a9,'metal',boat);
  box(hullFrame,-4.86,-4.23,.26,.73,-.23,.23,0x3d4341,'metal',boat);
  beam([-4.57,.34,0],[-4.50,-.36,0],.11,0x414842,'metal',boat);
  const boatPoint=(u,v,h)=>[boatCenter[0]+direction.dx*u-direction.dz*v,level+h,boatCenter[2]+direction.dz*u+direction.dx*v];
  for(const [u,m,n] of [[-3.52,3.6,1],[3.59,18.4,1]]){
    const a=boatPoint(u,-1.15,.64),b=floating.at(m,n*(w-.13),deck+.13);
    const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2-.15,(a[2]+b[2])/2];
    beam(a,mid,.014,0xa9a193,'trim');beam(mid,b,.014,0xa9a193,'trim');
  }
  const transit=frame([boatCenter[0]-direction.dx*4.70,boatCenter[2]-direction.dz*4.70],
    [boatCenter[0]+direction.dx*4.70,boatCenter[2]+direction.dz*4.70]);
  register(transit,1.28,()=>boat.position.y+2.65);

  const emit=window.makeSurveyCarEmitter(T,(kind,tint,points)=>face(kind,tint,points));
  // The spring 2022 public-lot rows show a mixture of trucks, vans and cars.
  // A sparse set leaves the pull-through spaces clear for trailer maneuvers.
  const cars=[[-309,1632,54,'suv',2],[-309,1637.1,54,'pickup',6],[-308.8,1656.2,55,'suv',1],[-309.1,1663.5,53,'pickup',5],
    [-308.9,1671.3,55,'suv',3],[-310.1,1689.2,52,'pickup',1],[-310.4,1698.8,53,'suv',5],[-311.3,1713.4,54,'pickup',0],
    [-287.8,1632.8,2,'van',3],[-287.1,1654.0,1,'suv',7],[-288.6,1677.6,6,'suv',8]];
  for(const [x,z,heading,model,coat] of cars){
    const a=heading*Math.PI/180,f=frame([x,z],[x+Math.cos(a),z+Math.sin(a)]),base=groundAt(x,z)+.062;
    const {len,w,roofH}=emit((u,v,h)=>f.at(u,v,base+h),model,coat,1);
    const r=frame([x-f.dx*len/2,z-f.dz*len/2],[x+f.dx*len/2,z+f.dz*len/2]);register(r,w,()=>base+roofH);
    if(model==='pickup'){
      const trailerTint=0x969c94;
      for(const sign of [-1,1]){
        beam(f.at(-2.7,0,base+.43),f.at(-4.4,sign*.73,base+.50),.055,trailerTint,'metal');
        beam(f.at(-4.4,sign*.73,base+.50),f.at(-8.1,sign*.73,base+.53),.061,trailerTint,'metal');
        box(f,-7.35,-5.7,base+.55,base+.69,sign*.49-.06,sign*.49+.06,0x59594b,'trim');
        const hub=f.at(-6.17,sign*.91,base+.29),rim=f.at(-6.17,sign*1.13,base+.29);
        beam(hub,rim,.30,0x393c39,'trim');beam(f.at(-6.17,sign*1.125,base+.29),f.at(-6.17,sign*1.15,base+.29),.14,0x858c88,'metal');
      }
      for(const u of [-5.0,-6.17,-7.71])beam(f.at(u,-.73,base+.48),f.at(u,.73,base+.48),.053,trailerTint,'metal');
    }
  }
  const materials={};
  function material(kind){
    if(materials[kind])return materials[kind];
    const file={aggregate:'rockwood-wharf-aggregate.webp',timber:'rockwood-dock-timber.webp',concrete:'keene-concrete.webp',hullPanel:'rockwood-shuttle-panel.webp',canvas:'rockwood-shuttle-canopy.webp'}[kind];
    const m=new T.MeshStandardMaterial({vertexColors:true,side:T.DoubleSide,
      roughness:({metal:.46,carPaint:.38,autoGlass:.31,canvas:.95})[kind]??.85,metalness:kind==='metal'?.30:0});
    if(file){
      const tex=new T.TextureLoader().load(file);tex.colorSpace=T.SRGBColorSpace;if(kind==='timber'||kind==='concrete'||kind==='aggregate')tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.anisotropy=8;m.map=tex;
      if(kind==='timber')Object.assign(m,{bumpMap:tex,bumpScale:.016});
    }
    materials[kind]=m;return m;
  }
  for(const bin of orders.values()){
    const g=new T.BufferGeometry();
    for(const [key,arr,dim] of [['position',bin.positions,3],['color',bin.colors,3],['uv',bin.uvs,2]])
      g.setAttribute(key,new T.Float32BufferAttribute(arr,dim));
    g.computeVertexNormals();g.computeBoundingSphere();
    const mesh=new T.Mesh(g,material(bin.material));mesh.name=(bin.target===boat?'Mount Kineo pontoon shuttle':'Rockwood public landing')+' · '+bin.material;
    bin.target.add(mesh);
  }
  function supportHeight(x,z){
    if(x< -330||x> -173||z<1576||z>1747)return -Infinity;
    let y=-Infinity;
    const along=(x-cap.a[0])*cap.dx+(z-cap.a[1])*cap.dz,across=-(x-cap.a[0])*cap.dz+(z-cap.a[1])*cap.dx;
    if(along>=0&&along<=capLen&&across>=0&&across<=capWidthAt(along))y=capAt(x,z);
    for(const s of supports){const {f}=s,dx=x-f.a[0],dz=z-f.a[1],u=dx*f.dx+dz*f.dz,v=-dx*f.dz+dz*f.dx;
      if(u>=0&&u<=f.len&&Math.abs(v)<s.half)y=Math.max(y,s.height(u));}
    return y;
  }
  function ownsTree(x,z){return x> -342&&x< -165&&z>1567&&z<1761&&inside(data.public,x,z);}
  const basin=[[-277,1600],[-207.5,1577.5],[-174,1591],[-200,1652],[-226,1705],
    [-236,1700],[-248,1693],[-264,1693],[-276,1684]];
  function managedBasin(x,z){return x> -279&&x< -173&&z>1576&&z<1706&&inside(basin,x,z);}
  function managedGround(x,z,r=0){
    if(x< -355-r||x> -175+r||z<1576-r||z>1754+r)return false;
    for(const p of data.pavement)if(inside(p,x,z)||r>0&&[[r,0],[-r,0],[0,r],[0,-r]].some(([dx,dz])=>inside(p,x+dx,z+dz)))return true;
    // In the ortho, the harbor side of the pier and the ramp's approach are
    // navigable water. Keep rooted rushes and guessed shore rocks off the berth.
    if(managedBasin(x,z))return true;
    return Number.isFinite(supportHeight(x,z));
  }
  function plantCrowns(plant){
    for(const [x,z,height,width,conifer] of data.trees){
      const seed=((Math.imul(x,73856093)^Math.imul(z,19349663))>>>0)/4294967296;
      plant({x,z,y:elevation(x,z),height,width,seed},Boolean(conifer),true);
    }
  }
  const air={};
  function updateBoats(t,eye,wind){
    if(!eye||Math.abs(eye.x-boatCenter[0])>650||Math.abs(eye.z-boatCenter[2])>650)return;
    wind?.sample(boatCenter[0],level+2,boatCenter[2],t,air);
    const wave=.012+Math.min(.022,.0024*Math.hypot(air.windX||0,air.windZ||0));
    boat.position.y=level+wave*(Math.sin(t*.99)+.31*Math.sin(t*1.72+.3));
    boat.rotation.x=wave*.24*Math.sin(t*1.18);boat.rotation.z=wave*.14*Math.cos(t*.97);
  }
  // The same geometric boundary is available to the lake's existing near-bank
  // brush generator, whose independent stream runs before the first flight.
  window.ATLAS_SURVEYS.moosehead.rockwoodHarborAt=(x,z)=>managedBasin(x,z)||managedGround(x,z);
  return {ownsTree,managedGround,plantCrowns,supportHeight,updateBoats};
};
// The hard ramp continues below the water at its surveyed grade. Refract the
// actual grooves there. The basin outside the slab retains the region's lake model.
window.applyRockwoodRampWater=function(material){
  const ramp=window.rockwoodLandingData.ramp,point=ramp.top.map(v=>v.toFixed(3)).join(',');
  const axis=ramp.axis.map(v=>v.toFixed(6)).join(','),width=(ramp.width/2).toFixed(3),length=ramp.length.toFixed(3);
  const top=ramp.y.toFixed(3),grade=ramp.grade.toFixed(4);
  const helpers=`
    vec2 slipLocal(vec2 p){
      vec2 dir=vec2(${axis}),relative=p-vec2(${point});
      return vec2(dot(relative,dir),dot(relative,vec2(-dir.y,dir.x)));
    }
    float slipCover(vec2 q,float blur){
      float edge=min(min(q.x,${length}-q.x),${width}-abs(q.y));
      return smoothstep(-blur,blur,edge);
    }
  `;
  material.fragmentShader=helpers+material.fragmentShader
    .replace('float shallow=exp(-.47*waterDepth);',`vec2 slipPoint=slipLocal(p);
      float slabAtSurface=slipCover(slipPoint,.22);
      float actualSlabDepth=max(.01,worldPosition.y-(${top}-${grade}*slipPoint.x));
      waterDepth=mix(waterDepth,actualSlabDepth,slabAtSurface);
      float shallow=exp(-.47*waterDepth);`)
    .replace('// Refracted light concentrates into short moving streaks',`
      if(abs(slipPoint.y)<7. && slipPoint.x>-.8 && slipPoint.x<${length}+2.){
        vec2 onSlab=slipLocal(bedPoint);
        float cover=slipCover(onSlab,max(.065,footprint*.8));
        float phase=abs(fract((onSlab.x-.76)/.74+.5)-.5);
        float groove=(1.-smoothstep(.008,.018+footprint*.52,phase*.74))*(1.-smoothstep(.10,.42,footprint));
        vec3 concrete=vec3(.255,.245,.202)*(.90+.10*smallStones.r)*(1.-.30*groove);
        floorColor=mix(floorColor,concrete,cover);
      }
      // Refracted light concentrates into short moving streaks`);
};
