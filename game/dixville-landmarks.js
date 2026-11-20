// Lake Gloriette resort and the two-lane highway. Local survey coordinates are metres east/south.
window.addDixvilleLandmarks = function(T, scene, sites, elevation) {
  const batches = new Map(), roofs = [], occupied = new Map();
  function material(color, map) {
    const m = new T.MeshLambertMaterial({color, map:map||null, side:T.DoubleSide});
    batches.set(m, {p:[], uv:[]});
    return m;
  }
  // Each facade tile represents one double-hung window bay and one storey.
  function tile(kind) {
    const c=document.createElement('canvas'); c.width=128; c.height=128;
    const g=c.getContext('2d'); let seed=183;
    function noise(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
    const stone=kind==='stone',paved=kind==='pavement';
    g.fillStyle=paved?'#535251':stone?'#c6c6c4':'#e1ddd1';g.fillRect(0,0,128,128);
    if(paved){
      for(let i=0;i<9200;i++){const v=Math.floor(47+noise()*109);g.fillStyle='rgba('+[v,v,v,.37].join(',')+')';g.fillRect(noise()*128,noise()*128,1.4,1.2);}
    } else {
      for(let row=0;row<16;row++){
        g.fillStyle=stone?'#a9a6a2':'#a39e92';g.fillRect(0,row*8,128,1.6);
        if(stone)for(let col=-1;col<5;col++){let x=col*33+row%2*16;g.fillStyle='rgba(61,51,43,.46)';g.fillRect(x,row*8,1,8);g.fillStyle='rgba(239,222,190,'+noise()*.23+')';g.fillRect(x+1,row*8+2,31,5);}
      }
      g.fillStyle=stone?'#dad9cf':'#f0ece0';g.fillRect(25,13,78,94);
      g.fillStyle='#332f2a';g.fillRect(30,18,68,83);
      const sky=g.createLinearGradient(0,19,0,100);sky.addColorStop(0,'#73828b');sky.addColorStop(.42,'#485860');sky.addColorStop(.75,'#384044');sky.addColorStop(1,'#4e4841');g.fillStyle=sky;
      g.fillRect(34,23,60,74);g.fillStyle=stone?'#9e9e95':'#cfcbbd';g.fillRect(63,20,3,79);g.fillRect(31,58,65,4);
      g.fillStyle='#e4dfce';g.fillRect(23,103,82,4);g.fillStyle='#686358';g.fillRect(24,107,81,3);
    }
    const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=8;return t;
  }
  const siding=material(0xeae4d7,tile('siding')), masonry=material(0xfffdf9,tile('stone'));
  const roof=material(0x884533),slate=material(0x574f49),trim=material(0xe7dfcc),granite=material(0x7d7770),shadow=material(0x534e45);
  const pavement=material(0xd1c9bd,tile('pavement')), gravel=material(0x958a76),yellow=material(0xe1b653),edge=material(0xe0dace),steel=material(0xa3a5a0),wood=material(0x73685a);
  const stoneMap=new T.TextureLoader().load('dixville-schist.webp');stoneMap.colorSpace=T.SRGBColorSpace;stoneMap.wrapS=stoneMap.wrapT=T.RepeatWrapping;
  // Keep the exposed fracture faces readable in the notch's deep dawn shadow.
  const rock=new T.MeshBasicMaterial({map:stoneMap,color:0xe4e1df,side:T.DoubleSide,vertexColors:true});
  batches.set(rock,{p:[],uv:[]});
  function tri(m,a,b,c,uv=[0,0,1,0,1,1]){const o=batches.get(m);o.p.push(...a,...b,...c);o.uv.push(...uv);}
  function face(m,a,b,c,d,u=1,v=1){tri(m,a,b,c,[0,0,u,0,u,v]);tri(m,a,c,d,[0,0,u,v,0,v]);}
  function block(frame,L,D,base,top,wall,cap=trim,bays=3.1,storey=3.25){
    const ring=[[-L/2,-D/2],[L/2,-D/2],[L/2,D/2],[-L/2,D/2]];
    const a=ring.map(([u,v])=>frame(u,base,v)),b=ring.map(([u,v])=>frame(u,top,v));
    for(let i=0;i<4;i++){const j=(i+1)%4;face(wall,a[i],a[j],b[j],b[i],Math.max(1,Math.round((i%2?D:L)/bays)),Math.max(1,Math.round((top-base)/storey)));}
    face(cap,...b);
  }
  function hip(f,l,d,y,rise,m,hipped=true){
    const a=l/2+.45,b=d/2+.45,k=hipped?Math.max(.05,a-b*.85):a;
    const p=[f(-a,y,-b),f(a,y,-b),f(a,y,b),f(-a,y,b)],r=f(-k,y+rise,0),s=f(k,y+rise,0);
    face(m,p[0],p[1],s,r);face(m,p[2],p[3],r,s);tri(hipped?m:trim,p[1],p[2],s);tri(hipped?m:trim,p[3],p[0],r);
  }
  function frame(x,y,z,angle=0){
    const co=Math.cos(angle),si=Math.sin(angle);return(u,v,w)=>[x+co*u-si*w,y+v,z+si*u+co*w];
  }
  function bounds(x,z,L,D,a,y){roofs.push({x,z,a,L:L/2,D:D/2,y});}
  function wing(x,z,L,D,a,h,rise,stone=false,frontPorch=false){
    const y=elevation(x,z)-.4,f=frame(x,y,z,a),eave=h+.26;
    block(f,L,D,-2.7,.8,granite);block(f,L,D,.8,h,stone?masonry:siding);
    block(f,L+1,D+1,h-.3,eave,stone?slate:trim);hip(f,L+.8,D+.8,eave,rise,stone?slate:roof);
    bounds(x,z,L+.8,D+.8,a,y+eave+rise);
    if(stone){for(const hh of [4.5,14.5,19.1])if(hh<h)block(f,L+.45,D+.45,hh,hh+.28,granite);}
    else {
      for(let u=-L/2+5;u<L/2-3;u+=7){
        const d=(x1,y1,z1)=>f(u+x1,eave+1.0+y1,D*.28+z1);
        block(d,2.25,2.65,-.55,1.53,siding);hip(d,2.5,2.8,1.53,.97,roof,false);
      }
    }
    if(frontPorch){
      const pf=(u,v,w)=>f(u,v,D/2+1.75+w);block(pf,L+.5,3.6,.1,.6,granite);block(pf,L+1,4,3.3,3.62,trim);hip(pf,L,4,3.62,.75,roof);
      for(let u=-L/2;u<=L/2;u+=3.8){const post=(i,j,k)=>pf(u+i,j,1.62+k);block(post,.23,.23,.6,3.3,trim);}
    }
    return {f,y};
  }
  function turret(x,z,r,y,h,wall,lid){
    const p=[],q=[],s=[];
    for(let i=0;i<10;i++){const a=Math.PI*2*i/10;p.push([x+r*Math.cos(a),y,z+r*Math.sin(a)]);q.push([p[i][0],y+h,p[i][2]]);s.push([x+(r+.4)*Math.cos(a),y+h+.2,z+(r+.4)*Math.sin(a)]);}
    for(let i=0;i<10;i++){const j=(i+1)%10;face(wall,p[i],p[j],q[j],q[i],1,Math.round(h/3.2));face(trim,q[i],q[j],s[j],s[i]);tri(lid,s[i],s[j],[x,y+h+r*.88,z]);}
    bounds(x,z,2*r,2*r,0,y+h+r*.88);
  }
  // Dix House has a long white lake-facing verandah. Hampshire House turns southeast at the eastern end.
  wing(-245,-340,113,16,-.099,13.1,4.5,false,true);
  wing(-236,-353,42,11,1.455,12.3,4.2);wing(-255,-330,32,15,1.47,12.5,4);
  wing(-167,-327,60,15,.932,22.8,3.7,true);
  const ey=elevation(-149,-301)-.4;turret(-149,-301,7.3,ey,22.7,masonry,slate);
  // Octagonal corner pavilions and the upper gallery break up the lake elevation.
  const end=frame(-149,ey,-301,.932);
  for(const side of [-1,1]){
    const [x,,z]=end(.3,0,side*6.8);
    turret(x,z,2.85,ey,23.9,masonry,slate);
    const pavilion=frame(x,ey,z,.932);block(pavilion,4.3,4.3,23.7,25.3,siding);hip(pavilion,5.3,5.3,25.3,1.75,slate);
    for(const along of [-17,0,17]){
      const [u,,v]=frame(-167,ey,-327,.932)(along,0,side*7.45);
      const bay=frame(u,ey,v,.932);
      block(bay,4.6,2.3,.5,18.9,masonry);hip(bay,4.8,2.5,18.9,.73,slate);
    }
  }
  const bel=frame(-149,ey,-301,.932);block(bel,6.8,6.1,25,28.4,masonry);hip(bel,7.5,6.5,28.4,2.6,slate);bounds(-149,-301,8,8,0,ey+31);
  const pole=frame(-149,ey,-301);block(pole,.12,.12,29.3,37,trim);
  const entry=frame(-243,elevation(-243,-333),-333,-.10);
  block(entry,12.1,5.8,.3,8.7,siding);hip(entry,12.7,6.1,8.7,3.8,roof,false);
  turret(-301,-340,8.2,elevation(-301,-340)-.6,13.5,siding,roof);
  turret(-229,-322,6.4,elevation(-229,-322)-.4,12.8,siding,roof);
  sites.houses.forEach((ring,i)=>{
    if(!ring.length||i===0)return;
    let longest=0,angle=0;
    for(let j=0;j<ring.length;j++){const [x,z]=ring[j],[u,v]=ring[(j+1)%ring.length];const d=Math.hypot(u-x,v-z);if(d>longest){longest=d;angle=Math.atan2(v-z,u-x);}}
    const co=Math.cos(angle),si=Math.sin(angle),us=ring.map(([x,z])=>x*co+z*si),vs=ring.map(([x,z])=>-x*si+z*co);
    const lo=Math.min(...us),hi=Math.max(...us),left=Math.min(...vs),right=Math.max(...vs),u=(hi+lo)/2,v=(right+left)/2;
    const x=co*u-si*v,z=si*u+co*v,L=hi-lo,D=right-left,y=elevation(x,z),h=i===3?7.7:Math.min(6.4,Math.max(3.2,D*.39)),f=frame(x,y,z,angle);
    if(i===15){
      // The low boathouse reads as a white band with an open viewing pavilion.
      block(f,L,D,-1.5,3.1,trim);block(f,L+.6,D+.7,3.1,3.45,granite);
      const pavilion=(u,v,w)=>f(L*.18+u,v,w);
      for(const side of [-1,1])for(const u of [-4,-2,0,2,4])block((a,b,c)=>pavilion(u+a,b,side*2.9+c),.18,.18,3.4,5.6,trim);
      hip(pavilion,9.1,6.4,5.6,1.75,slate);
    }else{block(f,L,D,-1.5,h,siding);hip(f,L,D,h,Math.min(3.6,D*.31),i===3?roof:slate);}bounds(x,z,L,D,angle,y+h+Math.min(3.6,D*.31));
  });
  // Bucket short road segments for vegetation exclusion, including their verges.
  function occupy(x,z,r){const k=Math.floor(x/12)+','+Math.floor(z/12);let list=occupied.get(k);if(!list)occupied.set(k,list=[]);list.push([x,z,r*r]);}
  function road(path,main){
    const width=main?3.75:2.05, pts=[];
    for(let i=1;i<path.length;i++){
      const [x,z]=path[i-1],[u,v]=path[i],d=Math.hypot(u-x,v-z),n=Math.ceil(d/4);
      for(let j=0;j<n;j++)pts.push([x+(u-x)*j/n,z+(v-z)*j/n]);
    }
    pts.push(path.at(-1));if(pts.length<2)return;
    let prior,phase=0;
    for(let i=0;i<pts.length;i++){
      const [x,z]=pts[i],[x0,z0]=pts[Math.max(0,i-1)],[x1,z1]=pts[Math.min(pts.length-1,i+1)],l=Math.hypot(x1-x0,z1-z0)||1,nx=-(z1-z0)/l,nz=(x1-x0)/l;
      const layers=main?[[-width-.83,width+.83,gravel],[-width,width,pavement],[-.16,-.056,yellow],[.056,.16,yellow],[-3.37,-3.23,edge],[3.23,3.37,edge]]:[[-width,width,gravel]];
      // Put stripes and asphalt on precisely the same cross slope to avoid disappearing paint.
      const yL=elevation(x-nx*(width+1),z-nz*(width+1)),yR=elevation(x+nx*(width+1),z+nz*(width+1));
      const centre=Math.max(elevation(x,z),(yL+yR)/2);
      const pt=(a,dy)=>[x+nx*a,centre+(yR-yL)*a/(2*(width+1))+.38+dy,z+nz*a];
      const row=layers.map(([a,b],j)=>[pt(a,.025*Math.min(j,2)),pt(b,.025*Math.min(j,2))]);
      if(prior)layers.forEach(([a,b,m],j)=>face(m,prior[j][0],prior[j][1],row[j][1],row[j][0],(b-a)/4,1));
      if(main && x>=-300&&x<=135&&z<165 && prior){
        // North side faces the water regardless of polyline direction.
        const rail=nz>0?-width-.52:width+.52,side=layers.length;
        const bottom=pt(rail,.70),top=pt(rail,.93);row[side]=[bottom,top];
        if(prior[side])face(steel,prior[side][0],bottom,top,prior[side][1]);
        if(phase++%2===0){const f=frame(bottom[0],bottom[1],bottom[2]);block(f,.19,.22,-.83,.18,wood);}
      }
      occupy(x,z,width+2.3);prior=row;
    }
  }
  sites.drives.forEach(p=>road(p,false));sites.highway.forEach(p=>road(p,true));
  // The resort's photographed rough-stone portal stands beside the lake approach.
  const portal=frame(106,elevation(106,106),106,-.65);
  function archPoint(r,a,depth){return portal(r*Math.cos(a),1.68+r*Math.sin(a),depth);}
  for(const side of [-1,1]){
    const pier=(u,v,w)=>portal(side*1.83+u,v,w);
    block(pier,1.22,1.05,-.43,1.82,rock);
    if(side<0)block(pier,.93,1.02,1.82,4.65,rock);
  }
  for(let i=0;i<16;i++){
    const a=i*Math.PI/16,b=(i+1)*Math.PI/16,r=2.36+.12*Math.sin(i*2.8);
    for(const d of [-.53,.53])face(rock,archPoint(1.23,a,d),archPoint(1.23,b,d),archPoint(r,b,d),archPoint(r,a,d));
    face(rock,archPoint(1.23,a,-.53),archPoint(1.23,b,-.53),archPoint(1.23,b,.53),archPoint(1.23,a,.53));
    face(rock,archPoint(r,a,-.53),archPoint(r,b,-.53),archPoint(r,b,.53),archPoint(r,a,.53));
  }
  bounds(106,106,5.1,1.24,-.65,elevation(106,106)+4.65);
  function roadsideSign(x,z,angle){
    const f=frame(x,elevation(x,z),z,angle),c=document.createElement('canvas');
    c.width=128;c.height=160;const g=c.getContext('2d');
    g.fillStyle='#28312e';g.fillRect(0,0,128,160);
    g.fillStyle='#eeeada';g.beginPath();
    for(const [i,j] of [[9,11],[116,11],[117,91],[107,108],[99,107],[89,127],[72,127],[60,149],[41,139],[27,138],[19,120],[9,119]])g.lineTo(i,j);
    g.closePath();g.fill();g.textAlign='center';g.fillStyle='#212520';g.font='bold 48px sans-serif';g.fillText('26',64,82);g.font='bold 19px sans-serif';g.fillText('N H',65,38);
    const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;
    const enamel=material(0xffffff,tex);block(f,.10,.09,-.3,2.72,steel);
    face(enamel,f(-.36,1.89,0),f(.36,1.89,0),f(.36,2.79,0),f(-.36,2.79,0));
  }
  roadsideSign(-173,39,-1.39);
  // Loose blocks sit at the bases of the measured slopes, uphill of the travel lanes.
  let seed=592;function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
  sites.highway.forEach(path=>{
    for(let i=1;i<path.length;i++){
      const [u,v]=path[i-1],[w,t]=path[i],length=Math.hypot(w-u,t-v);if(length<.1)continue;
      const nx=-(t-v)/length,nz=(w-u)/length;
      for(let d=rand()*6;d<length;d+=4+rand()*8){
        const x=u+(w-u)*d/length,z=v+(t-v)*d/length;if(x< -350||x>1200||z>800)continue;
        const side=elevation(x+12*nx,z+12*nz)>elevation(x-12*nx,z-12*nz)?1:-1;
        const dist=7+17*rand(),px=x+side*nx*dist,pz=z+side*nz*dist,y=elevation(px,pz);
        if(y<elevation(x,z)+.9)continue;
        const radius=.35+rand()**2*1.6,base=frame(px,y,pz,rand()*6.28);
        const rim=[],cap=[];
        for(let j=0;j<6;j++){
          const a=j*Math.PI/3,scale=radius*(.79+.40*rand());
          rim.push(base(Math.cos(a)*scale,-.63*radius,Math.sin(a)*scale*.81));
          cap.push(base(Math.cos(a)*scale*.77+.12*radius,(.32+.40*rand())*radius,Math.sin(a)*scale*.60));
        }
        for(let j=0;j<6;j++){const k=(j+1)%6;face(rock,rim[j],rim[k],cap[k],cap[j]);tri(rock,cap[j],cap[k],base(-.13*radius,.75*radius,.15*radius));}
      }
    }
  });
  // Split crest of Table Rock. Keep the fissure open and carry each face down
  // into the measured slope, so the silhouette also works on a pass beneath it.
  const peakY=elevation(25.7,338.3),ledge=frame(25.7,peakY,338.3,-.42);
  function tooth(outline,offset=0){
    const rim=outline.map(([u,v,h])=>ledge(u,h+offset,v));
    const bottom=rim.map(([x,y,z])=>{
      const bx=25.7+(x-25.7)*1.19,bz=338.3+(z-338.3)*1.10;
      return [bx,elevation(bx,bz)-2.4,bz];
    });
    const center=rim.reduce((sum,p)=>sum.map((v,i)=>v+p[i]/rim.length),[0,0,0]);center[1]+=.28;
    for(let i=0;i<rim.length;i++){
      const j=(i+1)%rim.length,a=rim[i],b=rim[j];
      tri(rock,a,b,center,[a[0]/4,a[2]/4,b[0]/4,b[2]/4,center[0]/4,center[2]/4]);
      const width=Math.hypot(a[0]-b[0],a[2]-b[2])/4;
      face(rock,bottom[i],bottom[j],b,a,width,Math.max(1,(a[1]-bottom[i][1])/4));
    }
  }
  tooth([[-3,5,.0],[-3.4,-3,1.05],[-2,-10,1.4],[-1.35,-13.6,1.17],[-.40,-9.9,.6],[-.38,-1,.82],[.10,5,.1]]);
  tooth([[.52,4,.15],[.13,-2,.53],[.22,-6.8,1.15],[1.05,-10,1.44],[1.95,-7,.92],[2.9,2,.54]]);
  tooth([[-4.9,5,-.08],[-5.2,-.5,.30],[-4.4,-5.1,.88],[-3.62,-3,.70],[-3.5,4,.0]],-1.05);
  bounds(24,335,8,18,-.42,peakY+1.65);
  // Surveyed spines flanking the ledge. Taper their columns into the original cliff face.
  for(let i=0;i<64;i++){
    const x=-72+rand()*290,z=231+rand()*225,y=elevation(x,z);
    const east=(elevation(x+4,z)-elevation(x-4,z))/8,south=(elevation(x,z+4)-elevation(x,z-4))/8,grade=Math.hypot(east,south);
    if(grade<.96||y<680||Math.hypot(x-26,z-338)<17)continue;
    const dx=-east/grade,dz=-south/grade,width=2.0+rand()*3.6,reach=1.1+rand()*1.8;
    const corners=[[-width,-1.3],[-width*.84,reach*.71],[-width*.43,reach],[width*.73,reach*.87],[width,1.4],[width*.77,-1.3]];
    const rim=corners.map(([side,d])=>[x+dx*d-dz*side,y+.4-.10*d,z+dz*d+dx*side]);
    for(let j=0;j<rim.length;j++){const k=(j+1)%rim.length,a=rim[j],b=rim[k],floorA=[a[0],elevation(a[0],a[2])-1,a[2]],floorB=[b[0],elevation(b[0],b[2])-1,b[2]];
      face(rock,floorA,floorB,b,a,1.2,Math.max(.6,(a[1]-floorA[1])/3));
      tri(rock,a,b,[x,y+.62,z],[a[0]/5,a[2]/5,b[0]/5,b[2]/5,x/5,z/5]);
    }
  }
  const group=new T.Group();group.name='Dixville Notch landmarks';
  for(const [m,{p,uv}] of batches)if(p.length){
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.computeVertexNormals();
    if(m===rock){
      const normal=g.attributes.normal,c=new Float32Array(normal.count*3);
      for(let i=0;i<normal.count;i++){
        const up=Math.abs(normal.getY(i)),sideLight=Math.abs(normal.getX(i)*.72+normal.getZ(i)*.39);
        const light=.48+.27*up+.21*sideLight;
        c.set([light*.98,light,light*1.05],3*i);
      }
      g.setAttribute('color',new T.BufferAttribute(c,3));
    }
    const mesh=new T.Mesh(g,m);mesh.name='Dixville '+(m===pavement?'Route 26 asphalt':m===masonry?'Hampshire House masonry':m===siding?'clapboard buildings':'landmark detail');group.add(mesh);
  }
  scene.add(group);
  function clearance(x,z){
    if(x<-650||x>1460||z<-700||z>1350)return -Infinity;
    let h=-Infinity;for(const r of roofs){const dx=x-r.x,dz=z-r.z;if(Math.abs(dx)>r.L+r.D||Math.abs(dz)>r.L+r.D)continue;
      const co=Math.cos(r.a),si=Math.sin(r.a);if(Math.abs(dx*co+dz*si)<=r.L&&Math.abs(dz*co-dx*si)<=r.D)h=Math.max(h,r.y);}
    return h;
  }
  function inClearing(x,z){
    if(x>-327&&x< -130&&z>-365&&z<-285||Number.isFinite(clearance(x,z)))return true;
    const i=Math.floor(x/12),j=Math.floor(z/12);
    for(let ix=i-1;ix<=i+1;ix++)for(let iz=j-1;iz<=j+1;iz++){const list=occupied.get(ix+','+iz);if(list?.some(([u,v,rr])=>(x-u)**2+(z-v)**2<rr))return true;}
    return false;
  }
  const lawnTrees=[[-297,-266,16],[-276,-249,15],[-255,-291,18],[-239,-273,16],[-200,-250,15],[-195,-264,19],[-129,-275,16]].map(([x,z,height],i)=>({x,z,y:elevation(x,z),height,width:height*.40,seed:.23+i*.09}));
  return {clearance,inClearing,lawnTrees};
};

