// Lake-facing approaches to the two municipal landings. Distances are metres.
window.makeWinniTownDocks=function(T,scene,elevation,level){
  const sites=window.winniTownDocks,siteList=Object.values(sites),batches=new Map(),decks=[],caps=[];
  const loader=new T.TextureLoader();
  const vehicles=[];
  const brickTint=0xb0a599,plankTint=0xc8b698,pileTint=0x847457;
  function texture(name,repeat=false){
    const t=loader.load(name);t.colorSpace=T.SRGBColorSpace;t.anisotropy=8;
    if(repeat)t.wrapS=t.wrapT=T.RepeatWrapping;
    return t;
  }
  const materials={
    wood:new T.MeshStandardMaterial({map:texture('alton-bandstand-deck.webp',true),roughness:.83,vertexColors:true,side:T.DoubleSide}),
    enamel:new T.MeshStandardMaterial({roughness:.40,metalness:.14,vertexColors:true,side:T.DoubleSide}),
    trim:new T.MeshStandardMaterial({roughness:.76,vertexColors:true,side:T.DoubleSide}),
    metal:new T.MeshStandardMaterial({roughness:.55,metalness:.34,vertexColors:true,side:T.DoubleSide}),
    path:new T.MeshStandardMaterial({map:texture('keene-asphalt.webp',true),roughness:.96,vertexColors:true,side:T.DoubleSide}),
    stone:new T.MeshStandardMaterial({map:texture('building-fieldstone.webp',true),roughness:.95,vertexColors:true,side:T.DoubleSide}),
    painted:new T.MeshStandardMaterial({map:texture('wolfeboro-waterfront-fronts.webp'),roughness:.84,vertexColors:true,side:T.DoubleSide}),
    roofPhoto:new T.MeshStandardMaterial({map:texture('wolfeboro-town-roofs.webp'),roughness:.88,vertexColors:true,side:T.DoubleSide}),
    roofing:new T.MeshStandardMaterial({map:texture('lakeside-roof.webp',true),roughness:.9,vertexColors:true,side:T.DoubleSide})
  };
  const square=[[0,0],[1,0],[1,1],[0,1]],color=new T.Color();
  let village='wolfeboro';
  function face(kind,points,uv,tint){
    const key=village+'/'+kind;
    let stream=batches.get(key);
    if(!stream){stream={kind,p:[],uv:[],c:[]};batches.set(key,stream);}
    if(!Array.isArray(tint))color.set(tint);
    for(const i of points.length===3?[0,1,2]:[0,1,2,0,2,3]){
      if(Array.isArray(tint))color.copy(tint[i]);
      stream.p.push(...points[i]);stream.uv.push(...uv[i]);stream.c.push(color.r,color.g,color.b);
    }
  }
  function frame(a,b){
    const x=b[0]-a[0],z=b[1]-a[1],length=Math.hypot(x,z),dx=x/length,dz=z/length;
    return {dx,dz,length,at:(u,y,v)=>[a[0]+dx*u-dz*v,y,a[1]+dz*u+dx*v]};
  }
  function prism(kind,f,u0,u1,lo,hi,v0,v1,tint,repeat=2){
    const q=[[u0,v0],[u1,v0],[u1,v1],[u0,v1]],top=q.map(([u,v])=>f.at(u,hi,v)),bot=q.map(([u,v])=>f.at(u,lo,v));
    face(kind,top,q.map(([u,v])=>[u/repeat,v/repeat]),tint);
    for(let i=0;i<4;i++){const j=(i+1)%4,span=Math.hypot(q[j][0]-q[i][0],q[j][1]-q[i][1]);
      face(kind,[bot[i],bot[j],top[j],top[i]],[[0,0],[span/repeat,0],[span/repeat,(hi-lo)/repeat],[0,(hi-lo)/repeat]],tint);
    }
  }
  function round(kind,x,lo,z,hi,r1,r2,tint,sides=8){
    const rim=[];for(let i=0;i<sides;i++){
      const a=i*2*Math.PI/sides,b=(i+1)*2*Math.PI/sides;
      const p=[x+r2*Math.cos(a),hi,z+r2*Math.sin(a)],q=[x+r2*Math.cos(b),hi,z+r2*Math.sin(b)];rim.push(p);
      face(kind,[[x+r1*Math.cos(a),lo,z+r1*Math.sin(a)],[x+r1*Math.cos(b),lo,z+r1*Math.sin(b)],q,p],[[i/sides,0],[(i+1)/sides,0],[(i+1)/sides,2],[i/sides,2]],tint);
    }
    for(let i=1;i<sides-1;i++)face(kind,[rim[0],rim[i],rim[i+1]],square,tint);
  }
  function finger(row){
    const [ax,az,bx,bz,width,pileSpacing]=row,f=frame([ax,az],[bx,bz]),w=width/2,top=level+.70;
    prism('wood',f,0,f.length,top-.24,top,-w,w,plankTint,1.65);
    decks.push({ax,az,...f,half:w+.04,top});
    const n=Math.max(1,Math.round((f.length-1.5)/pileSpacing));
    for(let k=0;k<=n;k++)for(const side of [-1,1]){
      const u=.65+(f.length-1.3)*k/n,[x,,z]=f.at(u,top,side*(w+.02));
      const high=top+.68+.16*Math.sin(3.2*x+z*.62);
      round('trim',x,level-.43,z,high,.113,.097,pileTint);
      if(k%3===1){const off=side*(w+.10);prism('metal',f,u-.13,u+.13,top+.035,top+.081,off-.04,off+.04,0x999b94);}
    }
    // Dark stringers and a wet rubbing strake read underneath the dry decking.
    for(const s of [-1,1])prism('trim',f,0,f.length,top-.27,top-.18,s*w-.06,s*w+.06,0x705942);
  }
  function quay(points){
    for(let i=1;i<points.length;i++){
      const f=frame(points[i-1],points[i]),n=Math.ceil(f.length/1.38);
      for(let j=0;j<n;j++){
        const a=f.length*j/n,b=f.length*(j+1)/n,k=.04*Math.sin(j*.93+i*2.4);
        prism('stone',f,a+.009,b-.009,level-.27,level+.51+k,-.26,.26,brickTint,1.15);
        prism('stone',f,a,b,level+.49+k,level+.64+k,-.31,.31,0xc3bfb4,1.15);
      }
    }
  }
  function lamp(x,z){
    const y=level+.71;
    round('metal',x,y,z,y+.23,.21,.16,0x354047);
    round('metal',x,y+.2,z,y+2.15,.09,.056,0x303b40);
    round('metal',x,y+2.15,z,y+2.32,.065,.23,0x42494a,6);
    round('trim',x,y+2.32,z,y+2.64,.17,.21,0xd7d1b7,6);
    round('metal',x,y+2.64,z,y+2.79,.26,.07,0x3a4546,6);
  }
  function pavilion(x,z,r){
    const floor=elevation(x,z)+.32,eave=floor+2.80,peak=eave+2.75,n=8,ring=[];
    for(let i=0;i<n;i++){const a=(i+.5)*2*Math.PI/n;ring.push([x+r*Math.sin(a),z+r*Math.cos(a)]);}
    round('stone',x,floor-.52,z,floor,r*.97,r,0xbcbaac,8);
    for(let i=0;i<n;i++){
      const a=ring[i],b=ring[(i+1)%n],f=frame(a,b);
      const roofPoint=q=>[x+(q[0]-x)*1.13,eave+.13,z+(q[1]-z)*1.13];
      const aRoof=roofPoint(a),bRoof=roofPoint(b);
      face('roofing',[aRoof,bRoof,[x,peak,z]],[[0,0],[f.length/2,0],[f.length/4,1.9]],0xc5c8c0);
      prism('trim',f,0,f.length,eave-.14,eave+.08,-.16,.16,0xe4e1d3);
      const [px,pz]=a;round('trim',px,floor,pz,eave,.105,.105,0xe8e5d7,4);
      if(i===4||i===5)continue;
      prism('trim',f,.10,f.length-.10,floor+.66,floor+.74,-.06,.06,0xe2e0d4);
      for(let u=.32;u<f.length-.12;u+=.23)prism('trim',f,u-.025,u+.025,floor+.09,floor+.68,-.024,.024,0xd7d8d1);
    }
    round('metal',x,peak,z,peak+.31,.048,.014,0x8b8876);
    caps.push({x,z,r:r*1.13,floor,peak,eave});
  }
  function pathStrip(points,width){
    const curve=new T.CatmullRomCurve3(points.map(([x,z])=>new T.Vector3(x,0,z)),false,'centripetal');
    const length=curve.getLength(),steps=Math.max(1,Math.ceil(length/1.8));let prior;
    for(let i=0;i<=steps;i++){
      const c=curve.getPointAt(i/steps),t=curve.getTangentAt(i/steps),edges=[];
      for(const side of [-1,1]){
        const x=c.x-side*width*t.z/2,z=c.z+side*width*t.x/2;
        edges.push([x,elevation(x,z)+.075,z]);
      }
      if(prior)face('path',[prior[0],edges[0],edges[1],prior[1]],[[0,(i-1)/2],[0,i/2],[1,i/2],[1,(i-1)/2]],0xaaa295);
      prior=edges;
    }
  }
  function bench([x,z,angle]){
    const f=frame([x,z],[x+Math.cos(angle),z+Math.sin(angle)]),y=elevation(x,z);
    for(const u of [-.65,.65])for(const v of [-.19,.19])prism('metal',f,u-.04,u+.04,y-.08,y+.48,v-.05,v+.05,0x525957);
    for(let i=0;i<4;i++)prism('wood',f,-.94,.94,y+.41,y+.47,-.24+.125*i,-.13+.125*i,0x977b5a);
    for(const height of [.68,.84])prism('wood',f,-.94,.94,y+height,y+height+.11,.18,.24,0x947658);
  }
  // Each pinned hull follows wind chop about its own mooring. Hull frames are
  // local to the boat so bob, pitch and roll never shift a quay or a piling.
  const floating=new Map(),air={};
  function boat(row,index,portName){
    const [x,z,dx,dz,length,beam,paint,side]=row,half=length*.5,w=beam*.5;
    const id=portName+'-mooring-'+index,base=facing(dx,dz,side,index),slate=0x4e6269;
    const coats={cream:0xd4c2a1,red:0x973a3f,slate:0x415963,blue:0x2f567a};
    const coat=coats[paint],fiberglass=0xdddacc,upholstery=0xc4bdab,rubber=0x394042;
    const straight=frame([0,0],[1,0]);
    village=id;
    // Chine, waterline and sheer use different half-breadths. The hull
    // narrows at the bow and turns under the chine toward a shallow keel.
    const stations=[[-.99,.80,.02],[-.85,.94,.0],[-.48,1,0],[.05,.99,.03],[.47,.85,.09],[.76,.53,.17],[.95,.16,.26],[1,.014,.29]];
    function rib([u,wide,rise],s){
      const bx=half*u,bw=s*wide*w;
      return [[bx,-.36+.24*Math.max(0,u),bw*.045],[bx,-.08+.12*Math.max(0,u),bw*.69],
        [bx,.085+rise,bw*.92],[bx,.35+rise,bw],[bx,.41+rise,bw*.996],[bx,.46+rise,bw*.965]];
    }
    for(const sign of [-1,1]){
      const slices=stations.map(q=>rib(q,sign));
      for(let j=1;j<slices.length;j++){
        const a=slices[j-1],b=slices[j];
        for(let k=0;k<5;k++)face('enamel',[a[k],b[k],b[k+1],a[k+1]],square,[0xa6a99f,fiberglass,coat,rubber,fiberglass][k]);
        const u=stations[j][0],v=stations[j-1][0];
        const inside=(outer,f)=>[outer[0],outer[1]-.02,outer[2]*(f>.45?.16:.82)];
        face('enamel',[a[5],b[5],inside(b[5],u),inside(a[5],v)],square,fiberglass);
      }
    }
    const transom=[...rib(stations[0],1).slice(1,5),...rib(stations[0],-1).slice(1,5).reverse()];
    for(let j=1;j<transom.length-1;j++)face('enamel',[transom[0],transom[j],transom[j+1]],square,coat);
    for(const [a,b,bw] of [[-.96,-.78,.76],[-.79,.45,.80],[.45,.73,.55],[.73,.94,.15]]){
      prism('enamel',straight,a*half,b*half,.18,.235,-bw*w,bw*w,0xbbb4a5);
    }
    // Aft bench, twin bolstered helm seats and the sloped wraparound windshield.
    prism('enamel',straight,-.82*half,-.67*half,.23,.50,-.67*w,.67*w,upholstery);
    prism('enamel',straight,-.84*half,-.78*half,.49,.72,-.68*w,.68*w,0xb3af9f);
    for(const s of [-1,1]){
      const center=s*.43*w;
      prism('enamel',straight,-.1*half,.12*half,.27,.51,center-.24,center+.24,upholstery);
      prism('enamel',straight,-.14*half,-.08*half,.47,.79,center-.23,center+.23,0xd1cec0);
      face('enamel',[[.38*half,.48,s*w*.82],[.26*half,.89,s*w*.58],[.08*half,.77,s*w*.88],[-.10*half,.46,s*w*.92]],square,slate);
    }
    face('enamel',[[.38*half,.48,-w*.82],[.38*half,.48,w*.82],[.26*half,.89,w*.58],[.26*half,.89,-w*.58]],square,0x657c83);
    prism('enamel',straight,.247*half,.273*half,.885,.913,-w*.59,w*.59,0xc6c9c2);
    prism('enamel',straight,-1.065*half,-.94*half,-.19,.48,-.247,.247,0x383d3e);
    prism('enamel',straight,-1.06*half,-.95*half,.48,.57,-.20,.20,rubber);
    if(length>6.65 || (index===2&&portName==='wolfeboro')){
      for(const s of [-1,1])for(const u of [-.55,.08])prism('enamel',straight,u*half-.021,u*half+.021,.43,1.41,s*w*.78-.024,s*w*.78+.024,0xbec4c2);
      const roof=[[-.71*half,1.40,-w*.80],[.20*half,1.40,-w*.80],[.20*half,1.40,w*.80],[-.71*half,1.40,w*.80]];
      face('enamel',roof,square,paint==='cream'?0x7d6654:0x2b444e);
    }
    floating.set(id,{x,z,dx:base[0],dz:base[1],length,beam,phase:(x*.32+z*.47)%6.28,nodes:[],high:length>6.65?1.41:.91});
    village=portName;
  }
  function facing(dx,dz,side,index){const flip=(side<0)!==(index%3===1)?-1:1;return [flip*dx,flip*dz];}
  function updateBoats(t,eye,field){
    if(!eye)return;
    for(const b of floating.values()){
      if(Math.abs(eye.x-b.x)>620||Math.abs(eye.z-b.z)>620)continue;
      field?.sample(b.x,level+2,b.z,t,air);
      const wx=air.windX||0,wz=air.windZ||0;
      const amplitude=.026+Math.min(.054,Math.hypot(wx,wz)*.006),p=b.phase;
      const wave=Math.sin(t*1.48+p)+.37*Math.sin(t*2.24+p*.8);
      for(const mesh of b.nodes){
        mesh.position.y=level+amplitude*wave;
        mesh.rotation.y=-Math.atan2(b.dz,b.dx)+.007*Math.sin(.47*t+p);
        mesh.rotation.z=amplitude*.26*Math.cos(t*1.48+p);
        mesh.rotation.x=amplitude*(.41+.10*(wx*b.dz-wz*b.dx))*Math.sin(t*1.8+p);
      }
    }
  }
  const emitCar=window.makeSurveyCarEmitter(T,(_kind,tint,points)=>face('enamel',points,square,tint));
  function parked([x,z,bearing,style,paint]){
    const a=bearing*Math.PI/180,dx=Math.cos(a),dz=Math.sin(a);
    const base=elevation(x,z)+.045,gx=(elevation(x+1,z)-elevation(x-1,z))*.5,gz=(elevation(x,z+1)-elevation(x,z-1))*.5;
    const vertex=(along,across,up)=>{
      const u=along*dx-across*dz,v=along*dz+across*dx;
      return [x+u,base+gx*u+gz*v+up,z+v];
    };
    const {roofH}=emitCar(vertex,style,paint,.99);
    vehicles.push({x,z,dx,dz,w:.96,l:style==='pickup'||style==='van'?2.5:2.21,top:base+roofH});
  }
  for(const [name,site] of Object.entries(sites)){
    village=name;site.docks.forEach(finger);site.quays.forEach(quay);
    site.cars.forEach(parked);
    site.boats.forEach((row,i)=>boat(row,i,name));
    if(site.gazebo)pavilion(...site.gazebo,site.gazeboRadius);
    for(const path of site.paths)pathStrip(path,1.7);
    for(const seat of site.benches)bench(seat);
    if(site.walkbridge){
      const [x,z,bx,bz,width]=site.walkbridge,f=frame([x,z],[bx,bz]);
      const deck=Math.max(elevation(x,z),elevation(bx,bz),level+.96);
      prism('wood',f,0,f.length,deck-.19,deck,-width/2,width/2,plankTint);
      decks.push({ax:x,az:z,...f,half:width/2,top:deck});
      for(const side of [-1,1]){
        const v=side*width/2;
        prism('trim',f,0,f.length,deck+.83,deck+.92,v-.04,v+.04,0x727971);
        for(let u=.15;u<f.length;u+=2.2)prism('trim',f,u-.045,u+.045,deck,deck+.91,v-.045,v+.045,0x7e8278);
      }
    }
    const row=site.docks[0],f=frame(row.slice(0,2),row.slice(2,4));
    for(let u=6;u<f.length;u+=17){
      const p=f.at(u,0,-row[4]/2-.3);lamp(p[0],p[2]);
    }
  }
  const municipal=siteList.map(s=>{
    const cover=s.publicGround;
    return {...cover,field:Uint8Array.from(atob(cover.clearance),v=>v.charCodeAt(0))};
  });
  function managedGround(x,z,radius=0){
    for(const p of municipal){
      const [left,top,right,bottom]=p.bounds;
      if(x<left||z<top||x>=right||z>=bottom)continue;
      const i=Math.floor((x-left)/p.step),j=Math.floor((z-top)/p.step);
      if((p.field[j*p.cols+i]-128)*.5<=radius)return true;
    }
    return false;
  }
  const contactBounds=siteList.map(site=>{
    const points=[site.gazebo,...site.cars,...site.boats];
    for(const row of [...site.docks,...(site.walkbridge?[site.walkbridge]:[])])points.push(row.slice(0,2),row.slice(2,4));
    const xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);
    return [Math.min(...xs)-8,Math.min(...zs)-8,Math.max(...xs)+8,Math.max(...zs)+8];
  });
  function supportHeight(x,z){
    if(!contactBounds.some(([l,t,r,b])=>x>=l&&x<=r&&z>=t&&z<=b))return -Infinity;
    let y=-Infinity;
    for(const d of decks){
      const a=x-d.ax,b=z-d.az,u=a*d.dx+b*d.dz,v=b*d.dx-a*d.dz;
      if(u>=0&&u<=d.length&&Math.abs(v)<=d.half)y=Math.max(y,d.top);
    }
    for(const c of vehicles){
      const a=x-c.x,b=z-c.z;
      if(Math.abs(a*c.dx+b*c.dz)<c.l&&Math.abs(b*c.dx-a*c.dz)<c.w)y=Math.max(y,c.top);
    }
    for(const b of floating.values()){
      const dx=x-b.x,dz=z-b.z,u=(dx*b.dx+dz*b.dz)/b.length,v=(dz*b.dx-dx*b.dz)/b.beam;
      if(Math.abs(u)<.5&&Math.abs(v)<.45-.36*Math.max(0,2*u))y=Math.max(y,(b.nodes[0]?.position.y??level)+(Math.abs(u)<.3?b.high:.48));
    }
    for(const c of caps){const dist=Math.hypot(x-c.x,z-c.z);if(dist<c.r)y=Math.max(y,c.eave+(c.peak-c.eave)*(1-dist/c.r));}
    return y;
  }
  const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0)).buffer;
  function registerRoof(roof){
    const key=roof.center.map(v=>Math.round(v*10)).join(',');
    const data=sites.wolfeboro.roofScans[key];if(!data)return;
    const grid=new Int16Array(bytes(data.grid)),[nx,nz]=data.size,[x0,z0]=data.origin;
    roof.measuredHeight=(x,z)=>{
      const gx=Math.max(0,Math.min(nx-1.001,x-x0)),gz=Math.max(0,Math.min(nz-1.001,z-z0));
      const i=Math.floor(gx),j=Math.floor(gz),k=j*nx+i,u=gx-i,v=gz-j;
      return roof.base+.01*((grid[k]*(1-u)+grid[k+1]*u)*(1-v)+(grid[k+nx]*(1-u)+grid[k+nx+1]*u)*v);
    };
    const vertices=new Int16Array(bytes(data.vertices)),indices=new Uint16Array(bytes(data.triangles));
    const [left,top,right,bottom]=sites.wolfeboro.roofBounds,pts=[],uv=[];
    for(let i=0;i<vertices.length;i+=3){
      const x=x0-.5+vertices[i]/50,z=z0-.5+vertices[i+2]/50;
      pts.push([x,roof.base+vertices[i+1]*.01,z]);uv.push([(x-left)/(right-left),1-(z-top)/(bottom-top)]);
    }
    village='wolfeboro';
    for(let i=0;i<indices.length;i+=3){
      const tri=[indices[i],indices[i+2],indices[i+1]];
      face('roofPhoto',tri.map(k=>pts[k]),tri.map(k=>uv[k]),0xffffff);
    }
  }
  function roofPlate(roof,pts,rim){
    if(roof.measuredHeight)return true;
    if(!roof.projectedPlate)return false;
    village='wolfeboro';
    const [l,t,r,b]=sites.wolfeboro.roofBounds;
    face('roofPhoto',rim,pts.map(([x,z])=>[(x-l)/(r-l),1-(z-t)/(b-t)]),0xffffff);
    return true;
  }
  function decorateRoof(roof){
    const [x,z]=roof.center,[l,t,r,b]=sites.wolfeboro.roofBounds;
    roof.projectedPlate=roof.p.every(([px,pz])=>px>=l&&px<=r&&pz>=t&&pz<=b);
    let id;for(const [key,pos] of Object.entries(sites.wolfeboro.fronts))if(Math.hypot(x-pos[0],z-pos[1])<1){id=key;break;}
    if(!id)return -1;
    village='wolfeboro';
    const p=roof.p,i=id==='diner'?0:1,f=frame(p[i],p[(i+1)%p.length]),hi=roof.base+roof.eave;
    const quad=(kind,u0,u1,y0,y1,depth,uv,tint)=>face(kind,[f.at(u0,y0,depth),f.at(u1,y0,depth),f.at(u1,y1,depth),f.at(u0,y1,depth)],uv,tint);
    const strip=(lo,hi)=>[[0,1-hi/1024],[1,1-hi/1024],[1,1-lo/1024],[0,1-lo/1024]];
    if(id==='avery'){
      // The pale parapet stands above a nearly flat black membrane roof.
      for(let j=0;j<p.length;j++){
        const a=p[j],b=p[(j+1)%p.length],wall=frame(a,b);
        const top=(roof.measuredHeight(a[0],a[1])+roof.measuredHeight(b[0],b[1]))*.5;
        prism('trim',wall,-.065,wall.length+.065,top-.15,top+.36,-.19,.19,0xdfdccb);
        prism('trim',wall,-.10,wall.length+.10,top+.32,top+.43,-.235,.235,0xece7d6);
      }
      const ac=frame([7321.1,-276.7],[7323.8,-276.9]),at=roof.measuredHeight(7322,-277);
      prism('metal',ac,0,ac.length,at,at+.67,-.61,.61,0xa5a59a);
      for(let fan=.39;fan<ac.length-.14;fan+=.86){const [fx,,fz]=ac.at(fan,at,0);round('trim',fx,at+.66,fz,at+.73,.28,.28,0x515658);}
      quad('painted',0,f.length,roof.base+.13,hi-.38,.035,strip(0,527),0xf4f4ee);
      for(const [off,height,depth] of [[.16,.23,.24],[.45,.13,.17],[roof.eave*.66,.15,.15]]){
        prism('trim',f,-.13,f.length+.13,hi-off-height,hi-off,-.10,depth,0xe5dfcf);
      }
      for(const u of [.05,f.length*.23,f.length*.47,f.length*.735,f.length-.06]){
        prism('trim',f,u-.13,u+.13,roof.base+.20,hi-.4,-.06,.13,0xe6e0d2);
      }
    }else if(id==='diner'){
      quad('painted',.02,f.length-.02,roof.base+.17,hi-.06,.04,strip(562,786),0xfcf9ef);
      const awn=hi-.18;
      face('trim',[f.at(.15,awn,.02),f.at(f.length-.15,awn,.02),f.at(f.length-.15,awn-.36,1.04),f.at(.15,awn-.36,1.04)],square,0x356d9b);
      prism('trim',f,.15,f.length-.15,awn-.48,awn-.34,.97,1.05,0x23577e);
      const signY=hi+.71,h=1.0,center=f.length*.50;
      quad('painted',center-1.88,center+1.88,signY,signY+h,-.70,[[0,1-900/1024],[.25,1-900/1024],[.25,1-818/1024],[0,1-818/1024]],0xfaf9ec);
    }else{
      // The town documents two rebuilt lake-view decks. Their open floors,
      // cable rails and shadowed glazing are separate from the rear wall.
      for(const height of [0,3]){
        const lo=roof.base+height+.23,high=lo+2.31;
        for(let u=.30;u<f.length-.8;u+=2.0){
          const width=Math.min(1.63,f.length-u-.27);
          quad('enamel',u,u+width,lo,high,.08,square,0x304748);
          prism('trim',f,u-.045,u+.06,lo,high,-.03,.13,0xdce0d3);
          prism('trim',f,u,u+width,lo+.80,lo+.85,.08,.145,0xbfc9ba);
        }
      }
      // Daylight through the upper gable is visible over the open decks.
      quad('enamel',f.length*.23,f.length*.45,roof.base+6.23,roof.base+7.57,.07,square,0x4d6466);
      for(const [height,width,out] of [[3.00,1,2.85],[5.85,.74,2.25]]){
        const left=f.length*(1-width)*.5,right=f.length-left,deck=roof.base+height;
        prism('wood',f,left,right,deck-.24,deck,0,out,0xb8a58e);
        for(let u=left+.12;u<right;u+=2.3)prism('metal',f,u-.042,u+.042,deck,deck+.96,out-.06,out+.06,0x435050);
        for(const y of [.28,.56,.91])prism('metal',f,left,right,deck+y,deck+y+(y>.8?.066:.024),out-.035,out+.035,0x697674);
        for(const u of [left+.14,right-.14])prism('trim',f,u-.10,u+.10,roof.base,deck-.19,out-.16,out+.05,0xc0c9be);
      }
    }
    return i;
  }
  function finish(){
    for(const [key,data] of batches){
      const geometry=new T.BufferGeometry();
      for(const [name,size,array] of [['position',3,data.p],['uv',2,data.uv],['color',3,data.c]])geometry.setAttribute(name,new T.Float32BufferAttribute(array,size));
      geometry.computeVertexNormals();geometry.computeBoundingSphere();
      const mesh=new T.Mesh(geometry,materials[data.kind]);mesh.name='Town landing · '+key;
      const b=floating.get(key.split('/')[0]);
      if(b){mesh.position.set(b.x,level,b.z);mesh.rotation.order='YXZ';mesh.rotation.y=-Math.atan2(b.dz,b.dx);b.nodes.push(mesh);}
      scene.add(mesh);
    }
    batches.clear();
  }
  return {supportHeight,updateBoats,managedGround,registerRoof,roofPlate,decorateRoof,finish};
};
