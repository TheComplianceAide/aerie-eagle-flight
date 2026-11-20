// Lake Gloriette resort and the two-lane highway. Local survey coordinates are metres east/south.
window.addDixvilleLandmarks = function(T, scene, sites, elevation) {
  const batches = new Map(), roofs = [], occupied = new Map();
  function material(color, map) {
    const m = new T.MeshStandardMaterial({color, map:map||null, roughness:.89, side:T.DoubleSide});
    batches.set(m, {p:[], uv:[]});
    return m;
  }
  const loader=new T.TextureLoader(),detail=window.makeBuildingFittings(T,scene);
  function image(file){
    const map=loader.load(file);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.anisotropy=8;return map;
  }
  const siding=material(0xfffdf5,image('building-clapboard.webp')),masonry=material(0xdddad5,image('keene-concrete.webp'));
  const shingle=image('building-shingles.webp');
  const roof=material(0xb8553f,shingle),slate=material(0x717775,shingle),trim=material(0xe7dfcc),granite=material(0x948f86),shadow=material(0x534e45);
  const finish=scene.userData.buildingLight.finish;
  finish(siding,'boards',2.34);finish(granite,'fieldstone',2.04);
  finish(roof,'redslate',2.88);finish(slate,'slate',3.02);
  roof.color.setHex(0xbe6851);slate.color.setHex(0xbbbdbb);granite.color.setHex(0xd4d1ca);
  const pavement=material(0xd1c9bd,image('keene-asphalt.webp')), gravel=material(0x958a76),yellow=material(0xe1b653),edge=material(0xe0dace),steel=material(0xa3a5a0),wood=material(0x73685a);
  const stoneMap=new T.TextureLoader().load('dixville-schist.webp');stoneMap.colorSpace=T.SRGBColorSpace;stoneMap.wrapS=stoneMap.wrapT=T.RepeatWrapping;
  // Keep the exposed fracture faces readable in the notch's deep dawn shadow.
  const rock=new T.MeshBasicMaterial({map:stoneMap,color:0xe4e1df,side:T.DoubleSide,vertexColors:true});
  batches.set(rock,{p:[],uv:[]});
  function tri(m,a,b,c,uv=[0,0,1,0,1,1]){const o=batches.get(m);o.p.push(...a,...b,...c);o.uv.push(...uv);}
  function face(m,a,b,c,d,u=1,v=1){tri(m,a,b,c,[0,0,u,0,u,v]);tri(m,a,c,d,[0,0,u,v,0,v]);}
  function block(frame,L,D,base,top,wall,cap=trim,bays=3.1,storey=3.25){
    const ring=[[-L/2,-D/2],[L/2,-D/2],[L/2,D/2],[-L/2,D/2]];
    const a=ring.map(([u,v])=>frame(u,base,v)),b=ring.map(([u,v])=>frame(u,top,v));
    const room=wall===siding||wall===masonry;
    for(let i=0;i<4;i++){
      const j=(i+1)%4,length=i%2?D:L,levels=Math.max(1,Math.round((top-base)/storey));
      face(wall,a[i],a[j],b[j],b[i],room?length/2.8:1,room?(top-base)/2.6:1);
      if(!room||top-base<1.25||length<1.3)continue;
      const nx=(a[j][2]-a[i][2])/length,nz=-(a[j][0]-a[i][0])/length;
      const count=Math.max(1,Math.round(length/bays)),span=length/count;
      const cx=(a[i][0]+a[j][0])*.5,cz=(a[i][2]+a[j][2])*.5;
      detail(cx,cz,(box,sash)=>{
        for(let level=0;level<levels;level++)for(let col=0;col<count;col++){
          const frac=(col+.5)/count;
          const x=a[i][0]+(a[j][0]-a[i][0])*frac,z=a[i][2]+(a[j][2]-a[i][2])*frac;
          const h=b[i][1]-a[i][1],winH=Math.min((h/levels)*.63,2.05),y=a[i][1]+(level+.52)*h/levels;
          const tone=[0x454c48,0x515454,0x797267,0x444b4d,0x4c5757][(col*3+level*7+i)%5];
          sash(x+.083*nx,y,z+.083*nz,nz,-nx,Math.min(span*.59,1.68),winH,wall===masonry?0xbdb9ae:0xe8e4d9,tone);
          if(wall===masonry&&span>2.8){
            box(x+.12*nx,y-winH*.5-.08,z+.12*nz,nz,-nx,span*.65,.15,.30,0x9e9b91);
          }
        }
      });
    }
    face(cap,...b);
  }
  function hip(f,l,d,y,rise,m,hipped=true){
    const a=l/2+.45,b=d/2+.45,k=hipped?Math.max(.05,a-b*.85):a;
    const p=[f(-a,y,-b),f(a,y,-b),f(a,y,b),f(-a,y,b)],r=f(-k,y+rise,0),s=f(k,y+rise,0);
    for(const [i,j,peakA,peakB] of [[0,1,s,r],[2,3,r,s]]){
      const width=2*a/3,depth=Math.hypot(b,rise)/2.4;
      tri(m,p[i],p[j],peakA,[0,0,width,0,(a+k)/3,depth]);
      tri(m,p[i],peakA,peakB,[0,0,(a+k)/3,depth,(a-k)/3,depth]);
    }
    tri(hipped?m:trim,p[1],p[2],s,[0,0,2*b/3,0,b/3,rise/2]);
    tri(hipped?m:trim,p[3],p[0],r,[0,0,2*b/3,0,b/3,rise/2]);
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
      for(let u=-L/2;u<=L/2;u+=3.8){
        const post=(i,j,k)=>pf(u+i,j,1.62+k);
        block(post,.28,.29,.6,3.3,trim);block(post,.44,.42,.58,.78,granite);block(post,.49,.46,3.0,3.3,trim);
      }
      for(const sign of [-1,1]){
        const span=L*.44,rail=(u,y,w)=>pf(sign*L*.279+u,y,1.63+w);
        block(rail,span,.145,1.48,1.58,trim);block(rail,span,.13,.73,.81,trim);
        for(let u=-span/2;u<span/2;u+=.29)block((v,y,w)=>rail(v+u,y,w),.064,.071,.80,1.48,trim);
      }
    }
    return {f,y};
  }
  function turret(x,z,r,y,h,wall,lid){
    const p=[],q=[],s=[];
    for(let i=0;i<10;i++){const a=Math.PI*2*i/10;p.push([x+r*Math.cos(a),y,z+r*Math.sin(a)]);q.push([p[i][0],y+h,p[i][2]]);s.push([x+(r+.4)*Math.cos(a),y+h+.2,z+(r+.4)*Math.sin(a)]);}
    for(let i=0;i<10;i++){const j=(i+1)%10;face(wall,p[i],p[j],q[j],q[i],1,Math.round(h/3.2));face(trim,q[i],q[j],s[j],s[i]);tri(lid,s[i],s[j],[x,y+h+r*.88,z]);}
    if(h>5)detail(x,z,(box,sash)=>{
      const floors=Math.max(1,Math.round(h/3.3));
      for(let side=0;side<10;side++){
        const a=(side+.5)*Math.PI/5,nx=Math.cos(a),nz=Math.sin(a),midR=r*Math.cos(Math.PI/10)+.08;
        for(let level=0;level<floors;level++)sash(x+midR*nx,y+(level+.52)*h/floors,z+midR*nz,nz,-nx,Math.min(1.65,r*.36),Math.min(2,h/floors*.64),0xd7d3c8,(level+side)%3?0x434c4c:0x757067);
      }
    });
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
  // Stacked balconies distinguish the projecting east end of Hampshire
  // House. Dark infill and thin vertical rails separate the floors in flight.
  for(let level=1;level<=5;level++){
    const y=level*3.12,bal=(u,h,w)=>end(7.45+w,y+h,u);
    block(bal,3.05,1.49,-.19,0,granite);block(bal,3.13,1.51,-.32,-.18,shadow);
    const front=(u,h,w)=>bal(u,h,.7+w);
    block(front,3.09,.084,.94,1.01,shadow);
    for(let u=-1.48;u<1.51;u+=.23)block((i,h,w)=>front(i+u,h,w),.038,.049,.01,.97,shadow);
  }
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
      const lakeRail=x>=-300&&x<=135&&z<165;
      const gorgeRail=x>=530&&x<=677&&z>310;
      if(main && (lakeRail||gorgeRail) && prior){
        // The reservoir edge is north of the road. The gorge photograph looks
        // west with the guardrail on the downhill south shoulder.
        const rail=(nz>0?-1:1)*(gorgeRail?-1:1)*(width+.52),side=layers.length;
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
  // The black/yellow obstruction marker stands at the end of the eastern
  // guardrail. Project onto the actual road edge so its post meets the gravel.
  const stripeCanvas=document.createElement('canvas');stripeCanvas.width=64;stripeCanvas.height=160;
  const paint=stripeCanvas.getContext('2d');
  paint.fillStyle='#d49737';paint.fillRect(0,0,64,160);paint.fillStyle='#262823';
  for(let y=-100;y<220;y+=50){paint.beginPath();paint.moveTo(0,y);paint.lineTo(64,y+44);paint.lineTo(64,y+68);paint.lineTo(0,y+24);paint.fill();}
  const stripeMap=new T.CanvasTexture(stripeCanvas);stripeMap.colorSpace=T.SRGBColorSpace;
  const marker=material(0xffffff,stripeMap);
  for(const path of sites.highway)for(let j=1;j<path.length;j++){
    const [x1,z1]=path[j-1],[x2,z2]=path[j],x=676.5;
    if((x1-x)*(x2-x)>0||Math.abs(x2-x)<.01)continue;
    const f=(x-x1)/(x2-x1),z=z1+(z2-z1)*f;
    if(z<310||z>435)continue;
    const frameAtPost=frame(x,elevation(x,z+4.45),z+4.45,-Math.PI*.5);
    block(frameAtPost,.12,.11,-.35,2.33,steel);
    face(marker,frameAtPost(-.21,1.0,0),frameAtPost(.21,1.0,0),frameAtPost(.21,2.33,0),frameAtPost(-.21,2.33,0));
  }
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
  // The one-metre survey resolves the split crest of Table Rock directly.
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

