// Measured along the axis of Main Street from Central Square toward the rail crossing.
// Coordinates in the vehicle rows and islands are positions on New Hampshire's six-inch orthophoto.
window.addKeeneStreetscape = function addKeeneStreetscape({T,data,height,face,clearRoof}) {
  const direction=new T.Vector2(.152,.98838).normalize();
  const {x:dx,y:dz}=direction;
  const streetside=(t,s)=>[1903.5+dz*t+dx*s,4421.5-dx*t+dz*s];
  const paint=value=>new T.Color(value);
  const pale=paint(0xd9d2c3), granite=paint(0x9d9b8f), iron=paint(0x2b302b);
  const rubber=paint(0x242526), alloy=paint(0x9b9e9c), lens=paint(0x9aa6a9);
  const glassTop=paint(0x8597a3),glassFoot=paint(0x34434a);
  const headlamp=paint(0xe7e3ce),taillamp=paint(0xa33835);
  const colorways=[0x365268,0xd6d6ce,0x373b3c,0x9a9da1,0xdee3de,0x8a3335,0x4a5b55,0x313944,0xb2aaa1,0x526c85,0x2a2928];
  const level=(t,s,h)=>{const [x,z]=streetside(t,s);return [x,height(x,z)+.30+h,z];};
  const pointsAt=(centerT,centerS,theta,base)=>{
    const [cx,cz]=streetside(centerT,centerS);
    const gx=(height(cx+1,cz)-height(cx-1,cz))*.5,gz=(height(cx,cz+1)-height(cx,cz-1))*.5;
    const cs=Math.cos(theta),sn=Math.sin(theta);
    return (along,side,up)=>{
      const [x,z]=streetside(centerT+cs*along-sn*side,centerS+sn*along+cs*side);
      return [x,base+gx*(x-cx)+gz*(z-cz)+up,z];
    };
  };
  const footprint=points=>points.map(([x,y,z])=>[x,z]);
  const hash=(n,k)=>{const f=Math.sin(n*37.17+k*91.43)*10789.32;return f-Math.floor(f);};

  const roadColor=paint(0xddd9d4),concreteTint=paint(0xb8b5a7);
  const laneWhite=paint(0xd9d7ca), curbstone=paint(0xc3bfb1);
  const asphaltUV=([x,y,z])=>[x/5.7,z/5.7];
  function surface(l,r,lo,hi,kind,tint,rise,tile=3.15){
    if(r<=l||hi<=lo)return;
    const m=Math.max(1,Math.ceil((r-l)/1.65)),n=Math.max(1,Math.ceil((hi-lo)/2.5));
    for(let i=0;i<n;i++)for(let j=0;j<m;j++){
      const a=l+(r-l)*j/m,b=l+(r-l)*(j+1)/m;
      const s=lo+(hi-lo)*i/n,e=lo+(hi-lo)*(i+1)/n;
      const corners=[level(a,s,rise),level(a,e,rise),level(b,e,rise),level(b,s,rise)];
      face(kind,tint,corners,corners.map(kind==='asphalt'?asphaltUV:([x,y,z])=>[x/tile,z/tile]));
    }
  }
  function marking(t0,s0,t1,s1,width,tint=laneWhite,rise=.205){
    const a=t1-t0,b=s1-s0,len=Math.hypot(a,b);
    const t=-b/len*width*.5,s=a/len*width*.5,parts=Math.max(1,Math.ceil(len/2));
    for(let i=0;i<parts;i++){
      const p=i/parts,q=(i+1)/parts;
      face('smooth',tint,[level(t0+p*a+t,s0+p*b+s,rise),level(t0+q*a+t,s0+q*b+s,rise),
        level(t0+q*a-t,s0+q*b-s,rise),level(t0+p*a-t,s0+p*b-s,rise)]);
    }
  }
  // Widths trace the granite curb lines. The terrace extends to storefront thresholds.
  const roadway=[[-5,128,-20.3,21.9],[128,157.2,-17.8,19.2],[157.2,199,-14.0,17.4],
    [199,210,-13.6,16.8],[210,286,-13.6,16.8],[286,302,-13.1,17.3],[302,369,-12.9,16.2],
    [369,445,-12.0,15.8],[445,501,-11.3,15.3]];
  const breaks=[[-10,7,'both',65],[126,134,'west',28],[133,142,'east',31],
    [198.2,207.2,'both',35],[246.6,252.7,'west',28],[286.8,303.2,'both',51],
    [358,367,'both',42],[391,401.3,'west',36],[430,438.4,'east',32],[483.0,492.3,'east',20]];
  function sidewalk(side,outer,s0,s1){
    const axis=side==='west'?-1:1;
    const sections=breaks.filter(([a,b,k])=>(k===side||k==='both')&&a<s1&&b>s0);
    const stops=[s0,s1,...sections.flatMap(([a,b])=>[Math.max(s0,a),Math.min(s1,b)])].sort((a,b)=>a-b);
    for(let i=1;i<stops.length;i++){
      const a=stops[i-1],b=stops[i];if(b-a<.01)continue;
      const crossing=sections.find(([l,h])=>(a+b)/2>=l&&(a+b)/2<=h);
      if(crossing){
        surface(Math.min(outer,outer+axis*crossing[3]),Math.max(outer,outer+axis*crossing[3]),a,b,'asphalt',roadColor,.163);
      }else{
        const end=outer+axis*(a<157?8.4:a<282?7.4:5.4);
        const lo=Math.min(outer,end),hi=Math.max(outer,end);
        surface(lo,hi,a,b,'masonry',concreteTint,.311,2.9);
        // Rectangular concrete flags have narrow, shallow scored joints.
        for(let za=Math.ceil((a+.23)/2.6)*2.6;za<b-.12;za+=2.6)marking(lo+.12,za,hi-.12,za,.023,paint(0x979488),.317);
        marking(outer,a,outer,b,.31,curbstone,.319);
        for(let z=a;z<b;z+=1.8){
          const zp=Math.min(z+1.8,b);
          const pts=[level(outer,z,.151),level(outer,zp,.151),level(outer,zp,.318),level(outer,z,.318)];
          face('smooth',granite,pts);
        }
      }
    }
  }
  for(const [s0,s1,left,right] of roadway){
    surface(left,right,s0,s1,'asphalt',roadColor,.168);
    sidewalk('west',left,s0,s1);sidewalk('east',right,s0,s1);
  }
  // Dashes and bay dividers follow the existing two lane carriageways and angle-parking pockets.
  const crossings=[157.2,209.4,251.6,285.9,366,447];
  for(const [a,b,l,r] of roadway){
    for(const t of [a<157?-9.0:-5.0,a<157?11.2:7.05])for(let z=Math.ceil((a+1)/10.8)*10.8;z<b-3;z+=10.8){
      if(crossings.some(c=>Math.abs(c-z)<8)||breaks.some(([p,q,k])=>k==='both'&&p<z+3&&q>z))continue;
      marking(t,z,t,z+2.65,.113);
    }
    for(const side of [-1,1]){
      const outer=side<0?l:r;
      const drawLongBay=a<370&&(a<157||side>0||a<286);
      if(!drawLongBay)continue;
      for(let z=Math.ceil((a+2)/3.47)*3.47;z<b-4;z+=3.47){
        if(crossings.some(c=>Math.abs(c-z)<7)||breaks.some(([p,q,k])=>(k==='both'||k===(side<0?'west':'east'))&&p<z+3&&q>z-3))continue;
        marking(outer-side*.31,z,outer-side*4.40,z+side*3.42,.104,paint(0xb4b4aa),.205);
      }
    }
  }
  for(const [a,b] of [[18,22],[35,43],[57,78],[98,103],[116,126]]){
    for(let z=a;z<=b;z+=3.53)marking(-3.4,z,3.46,z+3.03,.112,paint(0xc6c5b9),.205);
  }

  function curveIsland(t,s0,s1,width){
    const center=(s0+s1)/2,r=Math.min(width/2,(s1-s0)/2);
    const halfLength=(s1-s0)/2-r;
    const outline=[];
    for(const sign of [1,-1])for(let i=0;i<=8;i++){
      const angle=Math.PI*i/8+(sign<0?Math.PI:0);
      outline.push([t+r*Math.cos(angle),center+halfLength*sign+r*Math.sin(angle)]);
    }
    const upper=outline.map(([a,b])=>level(a,b,.34)),base=outline.map(([a,b])=>level(a,b,.14));
    const inset=outline.map(([a,b])=>level(t+(a-t)*Math.max(.65,1-.29/r),center+(b-center)*(1-.36/(s1-s0)),.35));
    for(let i=0;i<outline.length;i++){
      const j=(i+1)%outline.length;
      face('smooth',granite,[base[i],base[j],upper[j],upper[i]]);
      face('smooth',pale,[upper[i],upper[j],inset[j],inset[i]]);
      const cap=[level(t,center,.34),inset[i],inset[j]];
      face('grassMedian',paint(0x9aad8a),cap,cap.map(([x,y,z])=>[x/3.7,z/3.7]));
    }
  }
  // Rounded granite ends retain the parked-car pockets at the north end.
  for(const island of [
    [0,9,16,6.2],[.2,23,33.9,4.7],[-.1,44,55,4.7],[.4,86,96.5,4.3],
    [.45,105,114,4.3],[.8,127,143.5,4.4],[1.65,162,197.7,1.6],
    [1.8,212,247.4,1.75],[1.5,255,280.7,1.65],[1.48,306.5,353,1.8],
    [2.1,375,391,2.1],[1.9,400,443,1.7]
  ])curveIsland(...island);

  function car(t,s,bearing,variant,id){
    const pos=streetside(t,s),ground=height(...pos)+.47;
    const vertex=pointsAt(t,s,bearing*Math.PI/180,ground);
    const suv=variant==='suv'||variant==='van',van=variant==='van',pickup=variant==='pickup';
    const len=(van?4.9:pickup?5.0:suv?4.54:4.36)*(.968+hash(id,3)*.07);
    const w=(suv||pickup?.94:.885),belt=suv||pickup?1.05:.88;
    const roofH=van?1.88:suv||pickup?1.68:1.46;
    const coat=paint(colorways[id%colorways.length]);
    const contact=[];
    for(let i=0;i<20;i++){
      const angle=i*Math.PI/10;
      const a=Math.sign(Math.cos(angle))*Math.abs(Math.cos(angle))**.55;
      const b=Math.sign(Math.sin(angle))*Math.abs(Math.sin(angle))**.55;
      const lo=vertex(a*len*.46,b*w*.89,0),hi=vertex(a*len*.62+.24,b*w*1.43+.09,0);
      for(const v of [lo,hi])v[1]=height(v[0],v[2])+.507;
      contact.push([lo,hi]);
    }
    const shadow=paint(0x777876),inner=vertex(0,0,0);inner[1]=height(inner[0],inner[2])+.507;
    for(let j=0;j<contact.length;j++){
      const [a,b]=contact[j],[c,d]=contact[(j+1)%contact.length];
      const edge=[a,b,d,c],center=[a,c,inner];
      face('asphalt',[shadow,roadColor,roadColor,shadow],edge,edge.map(asphaltUV));
      face('asphalt',shadow,center,center.map(asphaltUV));
    }
    const shell=(y,side,over)=>{
      const l=len/2*over;
      return [[-l+.19,-side], [l-.33,-side], [l,-side*.67], [l,side*.67],
              [l-.33,side],[-l+.19,side],[-l,side*.73],[-l,-side*.73]].map(([u,v])=>vertex(u,v,y));
    };
    function join(a,b,kind,tint){
      for(let i=0;i<a.length;i++){const j=(i+1)%a.length;face(kind,tint,[a[i],a[j],b[j],b[i]]);}
    }
    const lower=shell(.27,w*.94,.948),sill=shell(.48,w,.989),shoulder=shell(belt-.07,w,.995),hem=shell(belt,w*.959,.972);
    join(lower,sill,'smooth',rubber);join(sill,shoulder,'carPaint',coat);join(shoulder,hem,'carPaint',coat);
    const middle=vertex(0,0,belt);
    for(let i=0;i<hem.length;i++)face('carPaint',coat,[middle,hem[i],hem[(i+1)%hem.length]]);
    const deckFront=.85,deckRear=pickup?-.51:-1.48;
    const roofFront=suv?.58:.28,roofRear=pickup?-.48:suv?-1.34:-1.00;
    const width=w*.941, rw=w*.79;
    const p=(u,v,h)=>vertex(u,v,h);
    face('autoGlass',[glassFoot,glassFoot,glassTop,glassTop],
      [p(deckFront,-width,belt+.015),p(deckFront,width,belt+.015),p(roofFront,rw,roofH-.03),p(roofFront,-rw,roofH-.03)]);
    face('autoGlass',[glassFoot,glassFoot,glassTop,glassTop],
      [p(deckRear,width,belt+.015),p(deckRear,-width,belt+.015),p(roofRear,-rw,roofH-.03),p(roofRear,rw,roofH-.03)]);
    for(const side of [-1,1]){
      const low=(u,h=belt+.015)=>p(u,width*side,h);
      const high=u=>p(u,rw*side,roofH-.03);
      face('autoGlass',[glassFoot,glassFoot,glassTop,glassTop],[low(deckRear),low(deckFront),high(roofFront),high(roofRear)]);
      face('carPaint',coat,[low(deckRear),low(deckRear+.12),high(roofRear+.09),high(roofRear)]);
      face('carPaint',coat,[low(deckFront-.10),low(deckFront),high(roofFront),high(roofFront-.08)]);
      if(!pickup){
        const mid=(roofFront+roofRear)*.5;
        face('smooth',rubber,[low(mid-.03),low(mid+.04),high(mid+.03),high(mid-.04)]);
      }
      for(const handle of pickup?[-.25]:[-.73,.32]){
        face('smooth',alloy,[p(handle-.07,w*side,belt-.09),p(handle+.08,w*side,belt-.09),p(handle+.08,w*side,belt-.054),p(handle-.07,w*side,belt-.054)]);
      }
      // Mirrors and lamps break up the dark belt line even when viewed obliquely.
      const mirror=[p(.66,width*side,belt+.09),p(.68,(w+.14)*side,belt+.11),p(.52,(w+.14)*side,belt+.15),p(.51,width*side,belt+.13)];
      face('carPaint',coat,mirror);
      for(const end of [-1,1]){
        const u=end*(len/2*.992-.065), hi=belt-.15,lo=hi-.15;
        face(end>0?'autoGlass':'smooth',end>0?headlamp:taillamp,
          [p(u,side*w*.42,lo),p(u-.1*end,side*w*.80,lo+.02),p(u-.12*end,side*w*.80,hi),p(u,side*w*.42,hi)]);
      }
      const radius=suv||pickup?.35:.303;
      for(const axle of [-len*.31,len*.306]){
        const discs=(wFactor,r)=>Array.from({length:12},(_,i)=>{
          const a=i*Math.PI/6;
          return p(axle+r*Math.cos(a),wFactor*side,radius+r*Math.sin(a));
        });
        const outer=discs(w+.017,radius),inner=discs(w*.90,radius),hub=discs(w+.024,radius*.54);
        join(outer,inner,'smooth',rubber);join(outer,hub,'smooth',rubber);
        for(let i=0;i<12;i++)face('smooth',i%2?alloy:lens,[p(axle,(w+.026)*side,radius),hub[i],hub[(i+1)%12]]);
      }
    }
    const top=[p(roofFront,-rw,roofH-.028),p(roofFront,rw,roofH-.028),p(roofRear,rw,roofH-.028),p(roofRear,-rw,roofH-.028)];
    face('carPaint',coat,top);
    if(pickup){
      const rear=-len*.46;
      face('smooth',rubber,[p(rear,-w*.75,belt+.009),p(-.65,-w*.75,belt+.009),p(-.65,w*.75,belt+.009),p(rear,w*.75,belt+.009)]);
    }
    clearRoof(footprint(shoulder),ground+roofH);
  }

  // Positions are the occupied angled bays visible in the spring survey.
  // Body styles and paint vary across the row; the traveled lanes stay open.
  const rows=[
    [-15,-31,[[20,1],[31,2],[47,5],[50.6,10],[54,4],[57,6],[60.9,5],[79.9,10],[83.4,4],[86.8,4],[102,5],[106,1],[109.5,0],[113,4],[116,2]]],
    [19.8,147,[[36.7,7],[43.9,2],[50,7],[65.9,9],[97,4],[105,2],[112,2],[118,7],[122,4],[126.4,0]]],
    [-1.3,28,[[40.6,7],[43.8,0],[46.8,2],[64.9,5],[72.4,0],[98.4,2],[104.2,7],[123.8,5],[127,2]]],
    [3.1,-152,[[35.1,2],[62.7,10],[80.5,4],[86.4,1]]],
    [14.3,137,[[164.2,1],[168.1,2],[172.6,4],[176.3,1],[217,2],[220.5,7],[224.2,2],[230.7,0],[233.9,5],[239.2,4],[253.9,0],[257.5,6],[261.4,2],[265.3,4],[270.3,7],[273.4,1],[321.3,2],[332.2,7],[344,0],[347.8,0],[351.4,2]]],
    [-11.6,-42,[[170.7,6],[179.7,10],[186.4,1],[228.4,1],[267,2],[274.2,4]]]
  ];
  let n=0;
  for(const [across,angle,vehicles] of rows)for(const [s,palette] of vehicles){
    const type=['sedan','suv','sedan','suv','van','sedan','pickup'][n++%7];
    const t=across+(s>90&&across>17?-2.4:0);
    car(t,s,angle+(hash(s,4)-.5)*5,type,palette);
  }

  // Street furniture uses the same collision table as the building façades.
  function lathe(t,s,profile,sides,tints){
    const [x,z]=streetside(t,s),y=height(x,z)+.6;
    const ring=(r,h)=>Array.from({length:sides},(_,i)=>[x+r*Math.cos(i*2*Math.PI/sides),y+h,z+r*Math.sin(i*2*Math.PI/sides)]);
    for(let i=1;i<profile.length;i++){
      const lo=ring(...profile[i-1]),hi=ring(...profile[i]);
      for(let j=0;j<sides;j++){
        const next=(j+1)%sides;
        face('smooth',tints[Math.min(i-1,tints.length-1)],[lo[j],lo[next],hi[next],hi[j]]);
      }
    }
    return {x,z,y};
  }
  const globe=paint(0xe1e1ce),brass=paint(0x696555);
  for(const [t,s] of [[-20,12],[21.8,20],[-20.1,68],[20,80],[-17.1,126],[18.5,134],
                        [1,28],[.7,95],[1,143],[-13.6,181],[18.1,186],[-13.6,238],[17.3,247],
                        [-13.7,281],[16.4,285],[2,329],[1.9,397],[-10,449],[15,450],
                        [-39,-36],[16,-40],[-47,-12]]){
    const {x,z,y}=lathe(t,s,[[.27,0],[.27,.14],[.19,.22],[.16,.5],[.11,.62],[.08,4.36],
      [.16,4.45],[.18,4.58],[.21,4.64],[.28,4.74],[.32,4.92],[.30,5.09],[.22,5.23],
      [.11,5.29],[.07,5.32],[.01,5.39]],10,
      [iron,iron,iron,iron,iron,iron,brass,iron,globe,globe,globe,globe,globe,iron,iron]);
    clearRoof([[x-.26,z-.26],[x+.26,z-.26],[x+.26,z+.26],[x-.26,z+.26]],y+5.39);
  }
  for(const [t,s] of [[-20.1,36],[-20,55],[-19.5,78],[-18.8,101],[-18.6,114],[21.6,42],[21.6,59],[21.6,86],
                       [19.6,109],[19.5,121],[-14.7,178],[18.1,177],[-14.6,227],[17.3,227],[17.2,238],[-14.6,266],[17.4,267]]){
    const head=paint(0x626965),{x,z,y}=lathe(t,s,[[.09,0],[.08,.05],[.052,.12],[.052,1.04],[.14,1.09],[.13,1.43],[.085,1.5]],8,[iron,iron,iron,head,head,head]);
    clearRoof([[x-.14,z-.14],[x+.14,z-.14],[x+.14,z+.14],[x-.14,z+.14]],y+1.5);
  }

  function crosswalk(s,t0,t1){
    // Slightly cambered, warm brick crossing band, bound by two white bars.
    const colors=[0x965e53,0x98665b,0x987068,0x9a6b5e,0x96675c,0xa26e62].map(paint);
    const strip=(lo,hi,fill)=>{
      for(let t=t0;t<t1;t+=1.5){
        const r=Math.min(t+1.5,t1);
        face('smooth',fill,[level(t,lo,.226),level(t,hi,.226),level(r,hi,.226),level(r,lo,.226)]);
      }
    };
    const white=paint(0xe0ded0);strip(s-1.47,s-1.28,white);strip(s+1.28,s+1.47,white);
    for(let row=0;row<8;row++){
      const start=s-1.275+row*.319;
      for(let t=t0-(row%2)*.31;t<t1;t+=.62){
        const l=Math.max(t,t0),r=Math.min(t+.614,t1);
        if(r<=l)continue;
        const ink=colors[Math.floor(hash(Math.floor((t+60)*40),row)*colors.length)];
        face('smooth',ink,[level(l,start,.212),level(l,start+.313,.212),level(r,start+.313,.212),level(r,start,.212)]);
      }
    }
    // White yield triangles precede pedestrian crossings on the right-hand approach.
    for(const side of [-1,1]){
      const ts=side===1?Math.max(3,t0):Math.min(-3,t1);
      const away=side*4.5;
      for(let j=0;j<4;j++){
        const t=ts+side*(.3+j*1.12);
        face('smooth',white,[level(t-.32,s+away,.21),level(t+.32,s+away,.21),level(t,s+away+side*.89,.21)]);
      }
    }
  }
  crosswalk(157.2,-11.7,14.7);crosswalk(209.4,-11.6,14);crosswalk(251.6,-12,13.8);crosswalk(285.9,-12.3,14.1);


  // Boundaries, parking rows and park paths were traced on the state's six-inch survey.
  // The square's irregular contours use the same asphalt scan and scale as the Main Street strip.
  const squarePoint=([x,z],rise)=>[x,height(x,z)+rise,z];
  function groundPolygon(ring,material,tint,rise,tile=3.1){
    const verts=ring.map(p=>new T.Vector2(...p));
    const pending=T.ShapeUtils.triangulateShape(verts,[]).map(indices=>indices.map(i=>ring[i]));
    const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
    while(pending.length){
      const tri=pending.pop();
      const lengths=tri.map((p,i)=>distance(p,tri[(i+1)%3]));
      const i=lengths.indexOf(Math.max(...lengths));
      if(lengths[i]>4.6){
        const a=tri[i],b=tri[(i+1)%3],c=tri[(i+2)%3],mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
        pending.push([a,mid,c],[mid,b,c]);
      }else{
        const corners=tri.map(p=>squarePoint(p,rise));
        face(material,tint,corners,corners.map(material==='asphalt'?asphaltUV:([x,y,z])=>[x/tile,z/tile]));
      }
    }
  }
  function ribbon(path,width,material,tint,rise,tile=2.9){
    const normals=path.slice(1).map(([x,z],i)=>{
      const a=x-path[i][0],b=z-path[i][1],d=Math.hypot(a,b);
      return [-b/d,a/d];
    });
    const edges=path.map(([x,z],i)=>{
      const a=normals[Math.max(0,i-1)],b=normals[Math.min(normals.length-1,i)];
      const size=width*.5/(1+a[0]*b[0]+a[1]*b[1]),vx=(a[0]+b[0])*size,vz=(a[1]+b[1])*size;
      return [[x-vx,z-vz],[x+vx,z+vz]];
    });
    for(let i=1;i<edges.length;i++)groundPolygon([...edges[i-1],edges[i][1],edges[i][0]],material,tint,rise,tile);
  }
  const squareRoad=[[1790,4270],[1801.4,4270],[1845,4343.2],[1848.6,4349],[1852.4,4349.6],[1882.6,4343.2],[1888.4,4341.8],[1891.4,4344.6],[1895.8,4343.8],[1899.4,4340.2],[1919.8,4336.4],[1924.4,4340.4],[1928.4,4339],[1931.8,4332.4],[1942.8,4270],[1961.2,4270],[1950.4,4337],[1940.6,4353.6],[1938.8,4371.8],[1934.4,4389],[1927.8,4401.6],[1928.8,4406.8],[1933.8,4409.6],[1989.8,4397.4],[1989.8,4405.6],[1934,4419.2],[1933.6,4423.4],[1889.6,4434],[1876.4,4427.4],[1780,4439.6],[1780,4433],[1857.8,4411.2],[1859.2,4406.8],[1852.4,4395],[1846.8,4381.8],[1841.2,4370.2],[1839.8,4365],[1838,4360.4],[1828.6,4350.4]];
  groundPolygon(squareRoad,'asphalt',roadColor,.467);
  const squareWalks=[
    [[1780,4433.2],[1858.2,4411.6],[1859.2,4407.2],[1853.2,4393],[1845,4375],[1840.8,4365.8],[1839.4,4361.2],[1837.2,4357.8],[1834.6,4361.6],[1837.2,4368.8],[1843.2,4387],[1848.2,4400.6],[1852,4412.6],[1780,4429.4]],
    [[1790.2,4270],[1828.8,4349],[1830.8,4352.8],[1836.2,4361],[1839.2,4364.4],[1835.4,4353],[1832.8,4347.4],[1795.4,4270]],
    [[1800.8,4270],[1844.8,4343.2],[1849,4349.2],[1851.8,4350],[1855.8,4349.8],[1882.8,4343.6],[1888,4342.6],[1891,4345],[1895.4,4344],[1899,4340.6],[1919.6,4336.8],[1924.2,4340.6],[1928,4339.2],[1931.4,4332.2],[1943.2,4270],[1939,4270],[1928.2,4330.4],[1924,4333.2],[1919.4,4334],[1899,4336.8],[1890.2,4338.8],[1882,4339.6],[1868.2,4342.6],[1850.4,4345.8],[1845.8,4338.4],[1805.2,4270]],
    [[1961,4270],[1950.8,4337.2],[1942.4,4348],[1939.8,4353.8],[1938.4,4372.4],[1934.6,4388.8],[1928,4401.6],[1929,4406.6],[1933.4,4410],[1989.8,4397.8],[1989.8,4393.8],[1939.2,4405.4],[1935.6,4403.8],[1936,4395.4],[1940.8,4370.6],[1945,4349.6],[1953.4,4337.8],[1964.6,4270]]
  ];
  for(const ring of squareWalks)groundPolygon(ring,'masonry',concreteTint,.619);
  const westCurb=[[1841.2,4369.6],[1845.4,4380],[1849,4388],[1852.8,4397.6],[1858,4408]];
  ribbon(westCurb,.23,'smooth',curbstone,.627);
  const northCurb=[[1850,4350.2],[1855.6,4350.8],[1882.6,4344.4],[1888,4343],[1891.4,4345.2],[1895,4345],[1899,4341.4],[1918.2,4337.4]];
  ribbon(northCurb,.22,'smooth',curbstone,.628);
  const eastCurb=[[1940.6,4353.4],[1938.4,4371.6],[1934.8,4387.8],[1928.4,4401.2],[1928.8,4406]];
  ribbon(eastCurb,.24,'smooth',curbstone,.626);

  const parkOutline=[[1864.4,4365.8],[1866.2,4361.6],[1869.4,4358.6],[1873.2,4356],[1878.4,4353.8],[1891,4351],[1900.4,4349.8],[1905,4351.2],[1909.2,4355.6],[1911,4360.6],[1913,4368],[1913.8,4374],[1914,4382.4],[1913.4,4389.6],[1911.4,4395],[1909.4,4399.8],[1908.2,4404.8],[1905.2,4408.4],[1901.8,4410.2],[1896.8,4411.2],[1891.8,4410.6],[1887,4408.4],[1883.2,4405.6],[1878,4400.4],[1874,4394.6],[1870.6,4386.6],[1867.8,4379.4],[1865.8,4373]];
  groundPolygon(parkOutline,'grassMedian',paint(0xf2efc6),.627,4.8);
  ribbon([...parkOutline,parkOutline[0]],.29,'smooth',curbstone,.642);
  const pathTint=paint(0xcfcbb9);
  const parkPath=(pts,width)=>ribbon(pts,width,'masonry',pathTint,.666,2.8);
  parkPath([[1894.4,4350.8],[1896,4359.6],[1896.2,4364.4],[1895.2,4370.8],[1893,4376.4],[1893.6,4380],[1894,4381]],2.5);
  parkPath([[1882.2,4371.8],[1886.2,4375.2],[1889.6,4377.2],[1893.2,4378.2],[1894.2,4381.4]],2.2);
  parkPath([[1894,4381.4],[1896.2,4386.8],[1898.4,4391],[1901.8,4393],[1910.6,4395.8]],2.55);
  parkPath([[1894.4,4383],[1892.6,4387.2],[1890.8,4391.6],[1888.2,4395.6],[1886.6,4400],[1884.6,4403.4]],2.1);
  const disc=(x,z,rx,rz)=>Array.from({length:28},(_,i)=>[x+rx*Math.cos(i*Math.PI/14),z+rz*Math.sin(i*Math.PI/14)]);
  groundPolygon(disc(1894.1,4381.3,4.65,4.55),'masonry',pathTint,.684);
  groundPolygon(disc(1881.5,4371.5,4.28,4.05),'masonry',pathTint,.68);
  groundPolygon(disc(1897.6,4399.5,6.8,6.45),'masonry',pathTint,.682);
  groundPolygon(disc(1897.6,4399.5,5.35,4.98),'grassMedian',paint(0xc5b78d),.689);
  for(const island of [
    [[1852.6,4360],[1855.8,4360.4],[1862.2,4360.2],[1860.6,4364],[1858.8,4368.2],[1857.8,4367.8]],
    [[1921.8,4348],[1926,4350],[1928.2,4349.6],[1927,4353.2],[1924.8,4357.2],[1923.6,4355.8]],
    [[1870,4407.4],[1871.6,4410.2],[1874,4414],[1877.4,4417.6],[1875.8,4418.2],[1870.4,4419.2],[1869.6,4416]],
    [[1894.6,4411.8],[1898.4,4412.6],[1902,4411.8],[1905.4,4410.6],[1904.2,4412],[1900.8,4413.4],[1896.6,4414],[1895.2,4413.6]]
  ]){
    groundPolygon(island,'grassMedian',paint(0xe3e0bb),.625);
    ribbon([...island,island[0]],.26,'smooth',curbstone,.632);
  }
  function squareStripe(a,b,w=.12){ribbon([a,b],w,'smooth',laneWhite,.505);}
  // Crossings at the park entrances bridge the two arcs of the rotary.
  for(const path of [
    [[1910.2,4395.6],[1927,4402.6]],[[1886.2,4403.2],[1876.2,4414.6]],[[1894.4,4350.6],[1892.8,4345]],[[1928.4,4339.2],[1937.6,4343.4]],[[1844,4357.8],[1849.8,4349.8]],
    [[1874.6,4420],[1880.2,4430.4]],[[1891.4,4431.6],[1923.6,4424.2]],[[1932.4,4410.2],[1932.2,4419.6]]
  ]){
    ribbon(path,2.55,'smooth',paint(0xd9d5c7),.509);
    ribbon(path,2.15,'masonry',paint(0xb27d68),.518,1.1);
  }
  const sideBays=[
    [[[1846,4370.6],[1857.8,4399.6]],12,-7.9,8.4],
    [[[1857.6,4349.8],[1882.2,4344]],8,7.4,6.5],
    [[[1901.6,4340.8],[1917.8,4337.4]],5,7.3,6.7],
    [[[1939,4361.2],[1931.8,4392.4]],10,-6.9,4.0]
  ];
  for(const [path,count,bt,bs] of sideBays){
    const [[ax,az],[bx,bz]]=path;
    for(let i=0;i<count;i++){
      const u=i/(count-1),x=ax+(bx-ax)*u,z=az+(bz-az)*u;
      squareStripe([x,z],[x+bt*.53,z+bs*.53],.095);
    }
  }
  function squareCar([x,z],angle,type,id){
    const a=x-1903.5,b=z-4421.5;
    car(a*dz-b*dx,a*dx+b*dz,angle+Math.atan2(dx,dz)*180/Math.PI,type,id);
  }
  const plazaCars=[
    [[[1846.2,4371.2],[1848.4,4377.6],[1850.8,4383],[1853,4387.8],[1855.2,4392.4],[1857.2,4397.2]],133],
    [[[1860,4350.4],[1863.2,4349.4],[1867.2,4348.4],[1870.2,4348],[1874.2,4346.6],[1878.8,4346]],-124],
    [[[1901,4342.8],[1904.4,4342.2],[1909.2,4341],[1914.2,4341]],-126],
    [[[1936.2,4365.8],[1935,4372.8],[1933.6,4379.2],[1932.6,4387.2],[1931.2,4392]],-11],
    [[[1826.4,4336],[1828.8,4341.2],[1842.2,4353.2]],-119]
  ];
  for(const [locations,angle] of plazaCars)for(const location of locations){
    const index=n++;
    squareCar(location,angle,['sedan','suv','sedan','van','suv'][index%5],[2,0,1,6,9,4,3,7,10,1][index%10]);
  }
  function bench(x,z,angle){
    const cs=Math.cos(angle),sn=Math.sin(angle),py=height(x,z)+.675;
    const point=(a,b,h)=>[x+cs*a-sn*b,py+h,z+sn*a+cs*b];
    function timber(l,r,f,b,lo,hi,tint){
      const bot=[[l,f],[r,f],[r,b],[l,b]].map(([i,j])=>point(i,j,lo));
      const top=[[l,f],[r,f],[r,b],[l,b]].map(([i,j])=>point(i,j,hi));
      face('smooth',tint,top);
      for(let i=0;i<4;i++){const j=(i+1)%4;face('smooth',tint,[bot[i],bot[j],top[j],top[i]]);}
    }
    for(let i=0;i<4;i++)timber(-.89,.89,-.23+i*.117,-.12+i*.117,.41,.46,paint(i%2?0x896c47:0x785b3e));
    for(let i=0;i<3;i++)timber(-.89,.89,.19,.236,.53+i*.134,.63+i*.134,paint(i%2?0x8d6b46:0x765a40));
    for(const pos of [-.64,.64]){
      timber(pos-.03,pos+.03,-.19,-.12,.01,.41,iron);
      timber(pos-.03,pos+.03,.16,.22,.01,.86,iron);
    }
    clearRoof(footprint([point(-.89,-.23,0),point(.89,-.23,0),point(.89,.23,0),point(-.89,.23,0)]),py+.9);
  }
  for(const [x,z,angle] of [[1893.0,4376.5,-.45],[1898.8,4382.1,1.3],[1895.4,4388.8,-.5],[1903,4402.1,-.64],[1894.6,4405.4,.4],[1885.6,4372.0,-.75]])bench(x,z,angle);

  // Crown centers with coarse aerial detections already present are skipped.
  const existing=data.trees;
  const rowsOfTrees=[
    [-20.5,[7,36,72,95,122,142]], [20.5,[13,49,78,107,132,152]],
    [-14.6,[166,193,216,240,263,281]], [15.7,[162,188,213,242,273,285]],
    [-12.5,[310,330,344,375,392,412,435]], [16.2,[309,336,351,376,393,417,436]]
  ];
  const additions=[];
  for(const [t,positions] of rowsOfTrees)for(const s of positions){
    const [x,z]=streetside(t,s);
    if(existing.some(([a,b,h,w])=>Math.hypot(a-x,b-z)<Math.max(4.1,w*.48)))continue;
    const seed=hash(s,Math.round(t)),width=4.2+2.9*seed;
    additions.push([x,z,7.0+seed*3.4,width,seed]);
  }
  window.keeneCurbTrees=additions;
};
