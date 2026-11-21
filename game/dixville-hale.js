// Beaver Lodge, now Hale House, and the stone entrance on its west drive.
// The local u axis follows the cottage's long southeast-facing roof ridge.
window.makeDixvilleHale=function(T,{material,image,face,tri,block,frame,detail,elevation}){
  const shakes=material(0xffffff,image('hale-shakes.webp'));
  shakes.name='Hale House · weathered wood shingles';
  const roof=material(0xc1bbb5,image('building-shingles.webp'));
  roof.name='Hale House · gray asphalt shingles';
  const trim=material(0xe9e6d9),brick=material(0x885c4b),flashing=material(0x8a9193),foundation=material(0xb4afa0,image('keene-concrete.webp')), joinery=material(0x756050);
  roof.emissive= new T.Color(0x23241f);roof.emissiveMap=roof.map;
  shakes.emissive=new T.Color(0x231d16);shakes.emissiveMap=shakes.map;
  const stone=material(0xffffff,image('hale-portal.webp')),rubble=material(0xe1ded4,image('hale-rubble.webp'));
  stone.emissive=new T.Color(0x6e706e);stone.emissiveMap=stone.map;
  rubble.emissive=new T.Color(0x595b58);rubble.emissiveMap=rubble.map;
  stone.name='Hale House · Highsmith stone portal';rubble.name='Hale House · stone vault and returns';
  stone.map.wrapS=stone.map.wrapT=T.ClampToEdgeWrapping;
  const reach=[],co=Math.cos(.445),si=Math.sin(.445),house=(u,y,v)=>[6+co*u-si*v,y,-224.4+si*u+co*v];
  const box=(f,u,d,w,l,b,t,m)=>block((x,y,z)=>f(x+u,y+b,z+d),w,l,0,t-b,m,m);
  // Contact samples the same planar facets used for drawing. The wings, porch
  // and smaller garage do not inherit the main ridge's height.
  function addRoof(points,scale=1.6,draw=true){
    const [a,b,c,d]=points;
    const l=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]),w=Math.hypot(d[0]-a[0],d[1]-a[1],d[2]-a[2]);
    if(draw)face(roof,a,b,c,d,l/scale,w/scale);
    for(const [p,q,r] of [[a,b,c],[a,c,d]]){
      const det=(q[2]-r[2])*(p[0]-r[0])+(r[0]-q[0])*(p[2]-r[2]);
      if(Math.abs(det)>.0001)reach.push({p,q,r,det,minX:Math.min(p[0],q[0],r[0]),maxX:Math.max(p[0],q[0],r[0]),minZ:Math.min(p[2],q[2],r[2]),maxZ:Math.max(p[2],q[2],r[2])});
    }
  }
  function wall(f,u0,u1,v0,v1,low,high,m){
    const r=[[u0,v0],[u1,v0],[u1,v1],[u0,v1]];
    for(let i=0;i<4;i++){
      const p=r[i],q=r[(i+1)%4];
      face(m,f(p[0],low,p[1]),f(q[0],low,q[1]),f(q[0],high,q[1]),f(p[0],high,p[1]),Math.hypot(p[0]-q[0],p[1]-q[1])/2.64,(high-low)/2.64);
    }
  }
  function gabled(f,u0,u1,v0,mid,v1,northY,peak,southY){
    const r=[f(u0,northY,v0),f(u1,northY,v0),f(u1,southY,v1),f(u0,southY,v1)],a=f(u0,peak,mid),b=f(u1,peak,mid);
    addRoof([r[0],r[1],b,a]);addRoof([b,r[2],r[3],a]);
    for(const u of [u0+.35,u1-.35]){
      const y=Math.min(northY,southY)-.18;
      const left=f(u,y,v0+.29),right=f(u,y,v1-.29),top=f(u,peak-.08,mid);
      tri(shakes,left,right,top,[0,0,(v1-v0)/2.64,0,(mid-v0)/2.64,(peak-y)/2.64]);
    }
    for(const u of [u0,u1]){
      for(const [s,e,h,j] of [[v0,mid,northY,peak],[mid,v1,peak,southY]]){
        face(trim,f(u,h-.16,s),f(u,j-.16,e),f(u,j,e),f(u,h,s));
      }
    }
  }
  // The two main planes meet at 578.76 m. The 2015 lidar and the state
  // orthophoto also resolve the lower east wing and the porch's hipped roof.
  wall(house,-10.25,7.72,-5.40,7.73,565,570.02,foundation);
  wall(house,-10.25,7.72,-5.40,7.73,570.02,574.87,shakes);
  gabled(house,-10.62,8.04,-5.91,1.55,8.18,574.48,578.76,575.10);
  wall(house,7.05,13.68,-5.52,4.13,567,573.06,shakes);
  gabled(house,7.04,14.03,-5.91,-.48,4.48,572.92,576.03,572.94);
  const porchCorners=[house(-12.46,572.68,-7.84),house(.8,572.68,-7.84),house(.8,573.41,-5.02),house(-12.46,573.41,-5.02)];
  addRoof([porchCorners[0],porchCorners[1],house(-.35,573.52,-5.34),house(-11.2,573.52,-5.34)]);
  addRoof([porchCorners[0],house(-11.2,573.52,-5.34),house(-11.2,573.52,-4.81),house(-12.46,572.69,-4.81)]);
  addRoof([porchCorners[1],house(.8,572.69,-4.81),house(-.35,573.52,-4.81),house(-.35,573.52,-5.34)]);
  box(house,-5.74,-6.59,13.25,2.63,569.23,569.60,trim);
  for(const u of [-12.05,-8.95,-5.8,-2.65,.45])box(house,u,-7.54,.18,.22,569.60,572.69,trim);
  // The exposed tail and the band of windows on the inset lakeside porch
  // continue around the west gable. Window sash and glazing use actual dawn light.
  for(let u=-9.85;u<7.85;u+=.65)box(house,u,7.93,.10,.58,574.87,575.08,joinery);
  for(const sign of [-1,1]){
    const v=sign<0?-5.78:8.04;
    face(trim,house(-10.62,sign<0?574.36:574.98,v),house(8.04,sign<0?574.36:574.98,v),house(8.04,sign<0?574.51:575.13,v),house(-10.62,sign<0?574.51:575.13,v));
  }
  detail(6,-224.4,(timber,sash)=>{
    const place=(u,y,v,w,h,north=false)=>{
      const p=house(u,y,v),s=north?-1:1;
      sash(...p,s*co,s*si,w,h,0xe9e5d7,0x414e50);
    };
    for(let u=-9.32;u<7.5;u+=1.04){
      if(Math.abs(u+1.18)<1.02)continue;
      place(u,572.12,7.79,.95,1.97);
    }
    place(-1.18,571.38,7.80,1.50,2.47);
    // Recessed divided lights along the downslope foundation face.
    for(const u of [-8.7,-5.4,2.65,6.1])place(u,569.38,7.78,.84,.48);
    for(const u of [-8.91,-5.65,-2.52,1.08,4.17,6.4])place(u,571.3,-5.47,1.09,1.62,true);
    for(const [v,y,w,h] of [[-2.95,571.5,1.39,1.58],[.02,571.5,1.34,1.61],[2.25,571.5,1.34,1.61],[5.08,571.5,1.34,1.61],[-2.68,575.10,1.01,1.44],[-.87,575.1,1.01,1.44],[2.22,575.1,1.01,1.44],[3.76,575.1,.96,1.44],[.57,577.40,1.25,.52]]){
      const p=house(-10.32,y,v);sash(...p,-si,co,w,h,0xe7e5da,0x445153);
    }
    for(const [u,v] of [[9.08,-5.6],[12.03,-5.6],[9.25,4.2],[12.2,4.2]])place(u,571.37,v,1.08,1.52,v<0);
  });
  // The six-inch orthophoto resolves the projecting white landing, splayed
  // end rails and stair to the lake lawn. The lowest tread follows the grade.
  const porchU=-1.18,landing=570.05,tread=.253;
  box(house,porchU,8.42,3.53,1.37,landing-.22,landing,trim);
  const toe=house(porchU,0,11.4),bottom=elevation(toe[0],toe[2])+.04;
  const steps=Math.max(2,Math.min(12,Math.round((landing-bottom)/.17)));
  for(let i=0;i<steps;i++){
    const top=landing-(i+1)*(landing-bottom)/steps;
    box(house,porchU,9.11+(i+.5)*tread,1.59,tread+.014,top-.17,top,trim);
  }
  for(const side of [-1,1]){
    const end=porchU+side*1.68,inside=porchU+side*.87;
    for(const u of [end,inside])box(house,u,8.99,.095,.10,landing,landing+.89,trim);
    for(const y of [landing+.14,landing+.85])box(house,(end+inside)*.5,8.99,.87,.10,y,y+.068,trim);
    for(let j=1;j<5;j++)box(house,end+(inside-end)*j/5,8.99,.043,.052,landing+.20,landing+.85,trim);
    const bottomRail=house(inside,bottom+.86,9.08+steps*tread),topRail=house(inside,landing+.89,9.08);
    const a=topRail,b=bottomRail,shift=.047;
    face(trim,[a[0]+co*shift,a[1],a[2]+si*shift],[b[0]+co*shift,b[1],b[2]+si*shift],[b[0]-co*shift,b[1],b[2]-si*shift],[a[0]-co*shift,a[1],a[2]-si*shift]);
    box(house,inside,9.06+steps*tread,.095,.10,bottom-.1,bottom+.89,trim);
    box(house,end,8.34,.09,1.37,landing+.84,landing+.908,trim);
  }
  function dormer(f,u,faceV,backV,half,low,top){
    const center=faceV,dy=.87,turn=(x,y,z)=>f(u+z,y,x);
    wall(f,u-half+.14,u+half-.14,Math.min(faceV,backV)+.04,Math.max(faceV,backV)-.04,low-1.34,low,shakes);
    gabled(turn,Math.min(faceV,backV),Math.max(faceV,backV),-half,0,half,low,top,low);
    const outer=center+(faceV<backV?-.02:.02),p=f(u,low-.32,outer);
    detail(p[0],p[2],(boxes,sash)=>sash(...p,(faceV<backV?-1:1)*co,(faceV<backV?-1:1)*si,Math.min(1.44,half*1.24),dy,0xe9e6db,0x495455));
  }
  dormer(house,-5.05,-5.7,-1.36,1.80,575.58,577.02);
  dormer(house,-5.04,7.89,3.45,1.74,575.77,577.26);
  dormer(house,4.25,7.93,3.61,1.76,575.73,577.24);
  dormer(house,10.94,-5.69,-1.36,1.56,574.07,575.56);
  // A continuous shallow shed joins the dormers along the north slope.
  addRoof([house(-3.5,575.61,-5.69),house(3.26,575.61,-5.69),house(3.26,577.09,-1.83),house(-3.5,577.09,-1.83)]);
  const fittings=[[-5.06,-.92,.66,.98,579.24],[8.73,1.73,.65,.84,577.28],[4.67,-3.68,.96,1.05,577.88]];
  for(const [u,v,w,l,y] of fittings){
    const m=u===4.67?flashing:brick;
    box(house,u,v,w,l,y-4,y-.12,m);box(house,u,v,w+.14,l+.14,y-.13,y,m);
    addRoof([house(u-w/2,y,v-l/2),house(u+w/2,y,v-l/2),house(u+w/2,y,v+l/2),house(u-w/2,y,v+l/2)],1.6,false);
  }
  const garage=frame(44.35,0,-194.45,.767);
  wall(garage,-3.35,3.35,-3.5,3.5,565,573.23,shakes);gabled(garage,-3.68,3.68,-3.82,0,3.82,573.27,575.38,573.27);
  for(const d of [-1.55,1.55]){
    const g=(u,h,v)=>garage(u,h,d+v);
    block((u,h,v)=>g(-3.39+u,h,v),.09,2.67,570.17,572.67,trim,trim);
    for(const h of [570.7,571.2,571.7,572.2])block((u,y,v)=>g(-3.45+u,y,v),.032,2.54,h,h+.037,foundation,foundation);
  }

  // Highsmith's E-SE view places the tall slotted pier at the northeast jamb.
  // Control points on the two feet and two crests register the transparency
  // to the independent state ortho and the 2015 laser surface.
  const gateX=-24.87,gateZ=-266.93,heading=-.605,gate=frame(gateX,0,gateZ,heading);
  const top=[[40,572],[49,511],[59,439],[68,383],[72,333],[81,292],[88,286],[89,273],[96,270],[96,257],[101,255],[105,246],[119,244],[120,235],[132,233],[135,224],[141,225],[144,216],[151,214],[158,223],[162,235],[170,238],[176,252],[183,251],[191,262],[191,313],[202,308],[207,307],[212,297],[217,297],[222,287],[229,289],[234,304],[240,296],[246,298],[249,283],[255,279],[260,281],[268,296],[274,290],[280,295],[286,287],[295,302],[302,301],[309,312],[314,310],[320,305],[327,316],[337,322],[343,317],[349,316],[355,330],[362,328],[368,342],[377,342],[382,350],[390,341],[396,334],[400,338],[403,351],[410,346],[414,351],[418,367],[424,372],[430,412],[438,479],[449,616],[336,608],[336,552],[337,493],[337,466],[333,442],[328,424],[320,410],[312,400],[300,391],[287,384],[274,381],[260,379],[247,380],[237,384],[225,390],[215,397],[207,408],[201,421],[195,438],[192,461],[191,497],[191,600]];
  const slit=[[137,336],[137,315],[135,293],[137,282],[141,278],[145,277],[150,283],[153,298],[154,318],[153,338]];
  const transform=([x,y])=>{
    const div=1-.00052650316236*x+.00007280158680*y;
    return new T.Vector2((4.2395199765-.01460735806*x-.00040882401*y)/div,572+(9.089598474-.00073964298*x-.01467636080*y)/div);
  };
  const rings=[top,slit],projected=rings.map(r=>r.map(transform)),points=projected.flat(),pixels=rings.flat();
  const uv=([x,y])=>[(x-32)/425,1-(y-207)/413];
  const front=-.55,back=.51;
  const outline=projected[0],open=projected[1],indices=T.ShapeUtils.triangulateShape(outline,[open]);
  for(const d of [front,back])for(const indices3 of indices){
    const ids=d===front?indices3:[indices3[2],indices3[1],indices3[0]];
    const vert=ids.map(i=>gate(points[i].x,points[i].y,d));
    tri(stone,...vert,ids.flatMap(i=>uv(pixels[i])));
  }
  for(const ring of projected)for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length],span=Math.hypot(b.x-a.x,b.y-a.y);
    face(rubble,gate(a.x,a.y,front),gate(b.x,b.y,front),gate(b.x,b.y,back),gate(a.x,a.y,back),Math.max(.03,span)/1.65,.92);
  }
  // The laser contains a narrow, continuous top return along Cold Spring
  // Road. It rises nearly four metres from the arch to the eastern drive.
  const wallCourse=[
    [-22.20,-268.49,574.01],[-18.5,-266.17,574.04],[-14,-263.80,574.31],[-9.5,-261.42,574.47],[-5,-258.78,574.66],
    [-.5,-255.69,574.66],[4,-253.00,574.71],[8.5,-250.77,575.03],[13,-248.52,574.83],[17.5,-245.96,574.93],
    [22,-243.05,575.35],[26.5,-240.23,575.91],[31,-237.27,575.95],[35.5,-234.72,576.16],[40,-231.91,576.35],
    [44.5,-229.42,576.72],[49,-226.93,576.94],[53.5,-224.43,577.20],[58,-221.59,577.57],[62.5,-219.02,577.78]
  ];
  let lastWall=null,distance=0;
  const coping=[];
  for(let i=1;i<wallCourse.length;i++){
    const a=wallCourse[i-1],b=wallCourse[i],dx=b[0]-a[0],dz=b[1]-a[1],span=Math.hypot(dx,dz),steps=Math.ceil(span/.44);
    for(let k=i===1?0:1;k<=steps;k++){
      const t=k/steps,x=a[0]+t*dx,z=a[1]+t*dz,top=a[2]+(b[2]-a[2])*t;
      const grain=.5+.5*Math.sin(x*5.81+z*3.71),half=.35+.048*grain,peak=top+.055+.16*grain;
      const nx=-dz/span,nz=dx/span,position=(w,h)=>[x+w*nx,h,z+w*nz];
      const foot=Math.min(elevation(x-.52*nx,z-.52*nz),elevation(x+.52*nx,z+.52*nz))-.36;
      const edge=[position(-half-.085,foot),position(-half,top-.07),position(-half*.49,peak),position(half*.58,peak-.035),position(half,top-.13),position(half+.10,foot)];
      if(lastWall){
        for(let j=0;j<edge.length-1;j++){
          const vA=j===0?0:j===5?0:1,vB=j===0?1:j===4?0:1.18;
          tri(rubble,lastWall.edge[j],edge[j],edge[j+1],[distance/1.44,vA,(distance+span/steps)/1.44,vA,(distance+span/steps)/1.44,vB]);
          tri(rubble,lastWall.edge[j],edge[j+1],lastWall.edge[j+1],[distance/1.44,vA,(distance+span/steps)/1.44,vB,distance/1.44,vB]);
        }
        distance+=span/steps;
      }
      lastWall={edge};coping.push([x,z,peak]);
    }
  }
  function structureHeight(x,z,altitude){
    if(x< -31||x>64||z< -273||z> -185)return -Infinity;
    let result=-Infinity;
    for(const r of reach){
      if(x<r.minX||x>r.maxX||z<r.minZ||z>r.maxZ)continue;
      const {p,q,r:c,det}=r, a=((q[2]-c[2])*(x-c[0])+(c[0]-q[0])*(z-c[2]))/det, b=((c[2]-p[2])*(x-c[0])+(p[0]-c[0])*(z-c[2]))/det;
      if(a>=-.0001&&b>=-.0001&&a+b<=1.0001)result=Math.max(result,a*p[1]+b*q[1]+(1-a-b)*c[1]);
    }
    if(x> -23&&x<63&&z<-218&&Math.abs(z+268.5-.58*(x+22))<2.7){
      for(let i=1;i<coping.length;i++){
        const a=coping[i-1],b=coping[i];if(x<a[0]-.48||x>b[0]+.48)continue;
        const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
        if(Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz)<.45)result=Math.max(result,a[2]+t*(b[2]-a[2]));
      }
    }
    const dx=x-gateX,dz=z-gateZ,c=Math.cos(heading),s=Math.sin(heading),w=-dx*s+dz*c;
    if(w<front||w>back)return result;
    const u=dx*c+dz*s,edges=[];
    for(const ring of projected)for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length];
      if((a.x>u)!==(b.x>u))edges.push(a.y+(b.y-a.y)*(u-a.x)/(b.x-a.x));
    }
    edges.sort((a,b)=>a-b);
    for(let i=0;i+1<edges.length;i+=2){
      if(!Number.isFinite(altitude)||altitude+.18>=edges[i])result=Math.max(result,edges[i+1]);
    }
    return result;
  }
  return structureHeight;
};
