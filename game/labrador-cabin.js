// Local coordinates are metres. The front of the cabin faces local +Z.
window.addLabradorCabin = function addLabradorCabin(T, scene, world, site) {
  const root = new T.Group();
  root.name = 'Lakeside camp cabin';
  const sin = Math.sin(site.yaw), cos = Math.cos(site.yaw);
  const elevation = world.elevation || world.height;
  function originalGround(x,z) {
    return elevation(site.x + cos*x + sin*z, site.z - sin*x + cos*z);
  }

  // Set the floor off the uphill sill. The downward-running bank needs a
  // compact gravel landing to meet all three log treads from the album.
  const floor = Math.max(...[-2,2].flatMap(x => [-2.8,2.8].map(z => originalGround(x,z)))) + .19;
  const ease=(a,b,x)=>{const f=Math.max(0,Math.min(1,(x-a)/(b-a)));return f*f*(3-2*f);};
  function ground(x,z){
    const base=originalGround(x,z);
    if(Math.abs(x)>8||z< -8||z>15)return base;
    const spread=1-ease(2.2,7.6,Math.abs(x+.16*Math.sin(z*.58)));
    const weight=spread*ease(-8,-3.2,z)*(1-ease(4.05,14.6,z));
    const landing=floor-.54-.023*Math.max(0,z-3.6)-.009*x;
    return base+weight*Math.max(0,landing-base);
  }
  root.position.set(site.x,floor,site.z);
  root.rotation.y = site.yaw;
  const groups = new Map();
  const color = new T.Color();
  function face(kind,tint,points,uv) {
    if (!groups.has(kind)) groups.set(kind,{positions:[],colors:[],uvs:[]});
    const buf=groups.get(kind);
    color.setHex(tint);
    for (const i of (points.length===3 ? [0,1,2] : [0,1,2,0,2,3])) {
      buf.positions.push(...points[i]);
      buf.colors.push(color.r,color.g,color.b);
      buf.uvs.push(...uv[i]);
    }
  }
  // Each quad gets metre-based texture coordinates. Plank end faces and boards
  // running at right angles can share an atlas without changing its repeat scale.
  function panel(kind,tint,a,b,c,d,tile=2) {
    const width=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2])/tile;
    const height=Math.hypot(d[0]-a[0],d[1]-a[1],d[2]-a[2])/tile;
    const u=(a[0]*.73+a[2]*.23)%1, v=(a[1]*.37+a[2]*.43)%1;
    face(kind,tint,[a,b,c,d],[[u,v],[u+width,v],[u+width,v+height],[u,v+height]]);
  }
  function box(kind,tint,x,y,z,w,h,d,tile) {
    const a=x-w/2,b=x+w/2,c=y-h/2,e=y+h/2,f=z-d/2,g=z+d/2;
    panel(kind,tint,[a,c,g],[b,c,g],[b,e,g],[a,e,g],tile);
    panel(kind,tint,[b,c,f],[a,c,f],[a,e,f],[b,e,f],tile);
    panel(kind,tint,[a,c,f],[a,c,g],[a,e,g],[a,e,f],tile);
    panel(kind,tint,[b,c,g],[b,c,f],[b,e,f],[b,e,g],tile);
    panel(kind,tint,[a,e,g],[b,e,g],[b,e,f],[a,e,f],tile);
    panel(kind,tint,[a,c,f],[b,c,f],[b,c,g],[a,c,g],tile);
  }
  function pipe(kind,tint,a,b,radius,segments=12) {
    const start=new T.Vector3(...a),end=new T.Vector3(...b);
    const axis=end.clone().sub(start).normalize();
    const ref=Math.abs(axis.y)>.9?new T.Vector3(1,0,0):new T.Vector3(0,1,0);
    const side=new T.Vector3().crossVectors(axis,ref).normalize().multiplyScalar(radius);
    const up=new T.Vector3().crossVectors(axis,side).normalize().multiplyScalar(radius);
    function point(base,i){const t=i*Math.PI*2/segments;return base.clone().addScaledVector(side,Math.cos(t)).addScaledVector(up,Math.sin(t)).toArray();}
    for(let i=0;i<segments;i++){
      const a0=point(start,i),a1=point(start,i+1),b0=point(end,i),b1=point(end,i+1);
      face(kind,tint,[a0,a1,b1,b0],[[i/segments,0],[(i+1)/segments,0],[(i+1)/segments,1],[i/segments,1]]);
      face(kind,tint,[b,b0,b1],[[.5,.5],[0,0],[1,0]]);
      face(kind,tint,[a,a1,a0],[[.5,.5],[0,0],[1,0]]);
    }
  }
  // A façade is parameterized in metres along its outside edge. It can be
  // shortened, turned or mirrored without changing its openings.
  function facade(x,z,angle) {
    const dx=Math.cos(angle), dz=Math.sin(angle);
    const n=[-dz,dx];
    const at=(u,y,out=0)=>[x+dx*u+n[0]*out,y,z+dz*u+n[1]*out];
    function rect(kind,tint,left,bottom,right,top,out,tile=1.8) {
      panel(kind,tint,at(left,bottom,out),at(right,bottom,out),at(right,top,out),at(left,top,out),tile);
    }
    function block(kind,tint,u,y,out,w,h,d,tile) {
      const p=at(u,y,out);
      box(kind,tint,...p,Math.abs(dx)*w+Math.abs(dz)*d,h,Math.abs(dz)*w+Math.abs(dx)*d,tile);
    }
    // Painted vertical sheet siding with narrow seams. Openings are cut through
    // the sheets themselves so the window casings can have a true recess.
    function siding(width,height,holes=[]) {
      const count=Math.ceil(width/.62),span=width/count;
      for(let i=0;i<count;i++) {
        const left=-width/2+i*span, right=left+span;
        const splits=[left,...holes.flatMap(h=>[h.u-h.w/2,h.u+h.w/2]).filter(u=>left<u && u<right),right].sort((a,b)=>a-b);
        const tint=[0xe9e4d7,0xeeeae0,0xe6e2d5,0xe8e5da][i%4];
        for(let k=1;k<splits.length;k++) {
          const l=splits[k-1],r=splits[k],mid=(l+r)/2;
          const cuts=holes.filter(h=>Math.abs(h.u-mid)<h.w/2).sort((a,b)=>a.bottom-b.bottom);
          const edges=[0,...cuts.flatMap(h=>[h.bottom,h.top]),height];
          for(let j=0;j<edges.length;j+=2) {
            const low=edges[j],high=edges[j+1];
            if(high<=low) continue;
            rect('siding',tint,l,low,r,high,0,2.9);
            if(l===left && i>0) block('siding',0xe0dccf,l+.006,(low+high)/2,.009,.024,high-low,.018);
          }
        }
      }
    }
    function glazing(h,trim,sash) {
      const left=h.u-h.w/2,right=h.u+h.w/2,cy=(h.top+h.bottom)/2,ht=h.top-h.bottom;
      // Set the pane behind the jamb; small drips, sills and glazing bars cast
      // individual shadows when the eagle drops to roof level.
      block('siding',trim,left-.043,cy,.018,.087,ht+.12,.15);
      block('siding',trim,right+.043,cy,.018,.087,ht+.12,.15);
      block('siding',trim,h.u,h.top+.051,.033,h.w+.22,.104,.16);
      block('siding',trim,h.u,h.bottom-.043,.073,h.w+.26,.086,.24);
      for(const edge of [left+.022,right-.022]) block('paint',sash,edge,cy,-.005,.045,ht,.081);
      for(const edge of [h.top-.023,h.bottom+.023]) block('paint',sash,h.u,edge,-.005,h.w,.046,.081);
      const columns=h.cols||1,rows=h.rows||1;
      for(let i=1;i<columns;i++) block('paint',sash,left+h.w*i/columns,cy,.008,.035,ht,.046);
      for(let i=1;i<rows;i++) block('paint',sash,h.u,h.bottom+ht*i/rows,.01,h.w,.032,.047);
      face('glass',0xffffff,[at(left,h.bottom,-.032),at(right,h.bottom,-.032),at(right,h.top,-.032),at(left,h.top,-.032)],[[0,0],[1,0],[1,1],[0,1]]);
    }
    return {at,rect,block,siding,glazing};
  }
  const roofs=[], obstacles=[];
  function pitchedRoof(front,back,half,eave,rise) {
    roofs.push({front,back,half,eave,rise});
    const peak=eave+rise;
    for(const s of [-1,1]) {
      const a=[s*half,eave,back],b=[s*half,eave,front],c=[0,peak,front],d=[0,peak,back];
      const across=(front-back)/2.8,up=Math.hypot(half,rise)/2.8;
      const pts=s>0?[b,a,d,c]:[a,b,c,d];
      face('roof',0xe5e2d8,pts,[[0,0],[across,0],[across,up],[0,up]]);
      // Folded laps run from ridge to gutter. Both flanks catch grazing
      // light while their profile remains visible against the roof edge.
      for(let z=back+.22;z<front-.12;z+=.46){
        const x=s*(half-.015),x0=s*.082,top=peak-rise*.082/half;
        panel('seam',0xadaca0,[x0,top+.024,z-.030],[x,eave+.02,z-.030],[x,eave+.055,z-.004],[x0,top+.060,z-.004]);
        panel('seam',0x858b88,[x0,top+.060,z-.004],[x,eave+.055,z-.004],[x,eave+.018,z+.027],[x0,top+.024,z+.027]);
      }
      // A separate unpainted underside shades the open porch. Exposed
      // rafters follow its pitch from ridge to eave.
      panel('wood',0xb1a38d,[0,peak-.074,front-.05],[0,peak-.074,1.29],[s*(half-.09),eave-.072,1.29],[s*(half-.09),eave-.072,front-.05]);
      for(let z=1.39;z<front;z+=.48)for(const side of [-1,1]){
        const k=z+side*.037;
        panel('wood',0x938878,[0,peak-.069,k],[s*(half-.055),eave-.067,k],[s*(half-.055),eave-.16,k],[0,peak-.16,k]);
      }
      box('siding',0xd4d2c9,s*half,eave-.065,(front+back)/2,.063,.135,front-back);
      box('hardware',0x5d605e,s*(half+.012),eave+.008,(front+back)/2,.075,.033,front-back+.025);
      for(const z of [front,back]) {
        const corners=[[s*half,eave-.13,z],[0,peak-.13,z],[0,peak,z],[s*half,eave,z]];
        panel('siding',0xe5e1d6,...corners);
        panel('hardware',0x656863,[s*half,eave-.009,z+.002],[0,peak-.009,z+.002],[0,peak+.025,z+.002],[s*half,eave+.025,z+.002]);
      }
      const edge=.105,drop=rise*edge/half;
      panel('roof',0xf0efdf,[0,peak+.021,front],[0,peak+.021,back],[s*edge,peak-drop+.023,back],[s*edge,peak-drop+.023,front]);
    }
  }
  function footing(x,z,top,w=.47,d=.52) {
    const bottom=ground(x,z)-floor-.14;
    if(bottom<top) box('stone',0xb4ada2,x,(top+bottom)/2,z,w,top-bottom,d,1.1);
  }
  const halfWidth=2.04, back=-2.74, front=1.27, porchEnd=2.72;
  const wallHeight=2.28, roofHalf=2.33, eave=2.38, rise=.73;
  const offWhite=0xe6e3d7, deckColor=0xd2c2a4;
  const frontWall=facade(0,front,0);
  const doorHole={u:-.92,w:.92,bottom:0,top:2.06};
  const viewWindow={u:.65,w:1.18,bottom:.91,top:2.03};
  frontWall.siding(halfWidth*2,wallHeight,[doorHole,viewWindow]);
  for(const sign of [-1,1]) {
    const wall=facade(sign*halfWidth,(front+back)/2,-sign*Math.PI/2);
    wall.siding(front-back,wallHeight);
    for(const end of [front,back]) box('siding',offWhite,sign*halfWidth,wallHeight/2,end,.095,wallHeight,.1);
  }
  const rear=facade(0,back,Math.PI);
  rear.siding(halfWidth*2,wallHeight);
  function gable(z) {
    const tip=eave+rise-.09,edge=eave-.09+rise*(1-halfWidth/roofHalf);
    face('siding',offWhite,[[-halfWidth,wallHeight,z],[halfWidth,wallHeight,z],[halfWidth,edge,z],[-halfWidth,edge,z]],[[0,0],[1,0],[1,.1],[0,.1]]);
    face('siding',offWhite,[[-halfWidth,edge,z],[halfWidth,edge,z],[0,tip,z]],[[0,0],[1,0],[.5,.7]]);
  }
  gable(front); gable(back);
  // Inside the porch the screen door is nearly black. Weathered aluminum rail,
  // a separate sash and the pale bottom pane are visible in the album photograph.
  for(const u of [doorHole.u-doorHole.w/2,doorHole.u+doorHole.w/2])
    frontWall.block('siding',offWhite,u,1.04,.028,.080,2.12,.13);
  frontWall.block('siding',offWhite,doorHole.u,2.09,.028,1.05,.092,.13);
  frontWall.rect('screen',0x343630,doorHole.u-.415,.025,doorHole.u+.415,2.034,-.019);
  frontWall.block('hardware',0x746e60,doorHole.u,.032,.055,.94,.065,.155);
  frontWall.rect('paint',0x635f53,doorHole.u-.391,.10,doorHole.u+.391,.39,-.013);
  frontWall.block('hardware',0x88887d,doorHole.u,1.19,.002,.82,.045,.029);
  for(const y of [.38,1.79])frontWall.block('hardware',0x65665b,doorHole.u-.398,y,.004,.053,.116,.031);
  frontWall.block('hardware',0xaca493,doorHole.u+.34,.96,.032,.035,.16,.042);
  pipe('hardware',0xb7b5ab,frontWall.at(doorHole.u+.34,1.015,.051),frontWall.at(doorHole.u+.34,1.015,.109),.013);
  pipe('hardware',0xb7b5ab,frontWall.at(doorHole.u+.34,1.015,.109),frontWall.at(doorHole.u+.34,.931,.109),.014);
  frontWall.glazing(viewWindow,0xeae6d9,0xd8d7c9);
  frontWall.rect('glassLight',0xffffff,viewWindow.u-viewWindow.w/2+.025,viewWindow.bottom+.018,viewWindow.u+viewWindow.w/2-.025,1.27,-.025);
  frontWall.block('siding',0xe4e0d3,viewWindow.u,1.28,.014,viewWindow.w,.043,.063);

  const deckMid=(front+porchEnd)/2;
  box('wood',0x887765,0,-.103,deckMid,4.26,.19,porchEnd-front+.12);
  const deckBoards=28,deckSpan=4.27/deckBoards;
  for(let i=0;i<deckBoards;i++)
    box('wood',deckColor,-2.135+deckSpan*(i+.5),-.016,deckMid,deckSpan-.009,.058,porchEnd-front+.14,2.1);
  for(const x of [-1.87,0,1.87]) for(const z of [back+.16,front-.11,porchEnd-.11]) {
    footing(x,z,-.235,.39,.41);
    box('wood',0x94826d,x,-.178,z,.28,.14,.32);
  }
  const postZ=porchEnd-.075;
  for(const x of [-1.97,1.97]) {
    box('siding',x<0?0xe3ded0:0xb7c1b1,x,1.172,postZ,.105,2.32,.104);
    box('siding',offWhite,x,2.29,deckMid,.14,.14,porchEnd-front+.12);
    box('hardware',0x827e72,x,.055,postZ,.112,.065,.115);
  }
  box('siding',offWhite,0,2.30,postZ,4.16,.118,.095);
  // The front gable is open over the porch, with exposed web bracing.
  function brace(x0,y0,x1,y1,z,thick) {
    const dx=x1-x0,dy=y1-y0,len=Math.hypot(dx,dy),nx=-dy/len*thick*.5,ny=dx/len*thick*.5;
    const cross=[[x0+nx,y0+ny],[x1+nx,y1+ny],[x1-nx,y1-ny],[x0-nx,y0-ny]];
    for(let k=0;k<4;k++) {const a=cross[k],b=cross[(k+1)%4];panel('siding',offWhite,[...a,z-.042],[...b,z-.042],[...b,z+.042],[...a,z+.042]);}
    panel('siding',offWhite,...cross.map(p=>[...p,z+.042]));
  }
  const porchPeak=eave+rise-.105;
  for(const s of [-1,1]) {
    brace(0,porchPeak,s*2.06,2.35,postZ,.085);
    brace(s*.77,2.36,s*1.16,porchPeak-.39,postZ,.071);
  }
  brace(0,2.36,0,porchPeak,postZ,.064);
  pitchedRoof(porchEnd+.27,back-.24,roofHalf,eave,rise);
  // Three courses of peeled spruce form wide, irregular steps up to the deck.
  for(let i=0;i<3;i++) {
    const z=porchEnd+.22+i*.235,y=-.134-i*.165,end=1.99-i*.09;
    const offset=.66-i*.12,joint=-offset;
    pipe('log',0xd1b995,[-end,y-.006,z+.017],[joint-.012,y+.004,z],.119+i*.007,14);
    pipe('log',0xd6bf9c,[joint+.016,y+.002,z-.011],[end,y-.012,z+.012],.123+i*.006,14);
    box('log',0xd7cbb3,0,y+.060,z-.075,2*end-.08,.092,.2,1.7);
    obstacles.push({x:0,z,w:2*end,h:y+.135,d:.35});
  }
  obstacles.push({x:0,z:deckMid,w:4.27,h:.03,d:porchEnd-front+.15});
  // Red ice chest with a white lid on a wooden stand left of the screen door.
  const coolerX=-1.65,coolerZ=1.77;
  for(const x of [-.23,.23]) for(const z of [-.14,.14])
    box('wood',0x998b72,coolerX+x,.16,coolerZ+z,.065,.31,.063);
  box('wood',0xc4b496,coolerX,.323,coolerZ,.59,.077,.39);
  box('paint',0x9f3028,coolerX,.505,coolerZ,.51,.31,.34);
  box('paint',0xe8e2d2,coolerX,.679,coolerZ,.534,.064,.367);
  box('paint',0xccc9b6,coolerX,.617,coolerZ+.172,.189,.033,.024);
  // Three fishing rods with reels are stored alongside the cabin in the photo.
  for(const z of [-.94,.64]) box('wood',0xbca58c,-halfWidth-.026,1.14,z,.049,.69,.044);
  for(let i=0;i<3;i++) {
    const y=.92+i*.206,x=-halfWidth-.072;
    pipe('hardware',0x514c43,[x,y,.96],[x,y+.035,-1.53],.008,6);
    pipe('wood',0xbb9a71,[x,y,.97],[x,y,.71],.021,7);
    pipe('hardware',0x43433b,[x-.026,y-.048,.68],[x+.018,y-.048,.68],.046,10);
  }
  // Exposed roots and a broken stub at the right edge of the sandy yard
  // appear in the family print. Each root settles back into the actual bank.
  const rootX=2.95,rootZ=5.18,rootBed=ground(rootX,rootZ)-floor;
  function rootRing(x,z,r,h,phase,wobble){
    return Array.from({length:12},(_,i)=>{
      const angle=i*Math.PI/6,rad=r*(1+.12*Math.sin(3*angle+phase)+.09*Math.sin(5*angle));
      return [x+Math.cos(angle)*rad,h+wobble*(.45+.55*Math.sin(angle*4.1+phase)),z+Math.sin(angle)*rad];
    });
  }
  const rings=[rootRing(rootX,rootZ,.30,rootBed-.09,.012,0),rootRing(rootX-.03,rootZ+.02,.17,rootBed+.13,.73,.037),
    rootRing(rootX-.09,rootZ+.037,.115,rootBed+.30,1.1,.14)];
  for(let i=0;i<12;i++){
    const n=(i+1)%12;
    for(let j=1;j<rings.length;j++)panel('rootWood',0xb3a68b,rings[j-1][i],rings[j-1][n],rings[j][n],rings[j][i],.63);
    face('log',0xb1a792,[rings[2][n],rings[2][i],[rootX-.09,rootBed+.31,rootZ+.037]],[[0,0],[1,0],[.5,1]]);
  }
  for(const [angle,length,bend] of [[.23,.82,.16],[1.32,1.18,-.18],[2.67,1.29,.23],[-2.57,.85,-.20],[-.94,1.13,.16]]){
    const along=Math.cos(angle),across=Math.sin(angle);
    const curve=t=>{const curl=Math.sin(t*Math.PI)*bend,x=rootX+along*length*t-across*curl,z=rootZ+across*length*t+along*curl;
      return [x,ground(x,z)-floor+.005+.065*(1-t),z];};
    for(let i=0;i<4;i++)pipe('rootWood',0xb0a58d,curve(i/4),curve((i+1)/4),.095*(1-.21*i),8);
  }
  obstacles.push({x:rootX,z:rootZ,w:.44,d:.44,h:rootBed+.38});
  // The shallow roof at the far end steps down behind the main cabin.
  const leanBack=back-1.52, leanHalf=1.94,leanTop=2.10,leanLow=1.82;
  facade(0,leanBack,Math.PI).siding(leanHalf*2,leanLow);
  for(const s of [-1,1]) {
    facade(s*leanHalf,(back+leanBack)/2,-s*Math.PI/2).siding(back-leanBack,leanLow);
    face('siding',offWhite,[[s*leanHalf,leanLow,leanBack],[s*leanHalf,leanLow,back],[s*leanHalf,leanTop,back]],[[0,0],[1,0],[1,.2]]);
    panel('siding',offWhite,[s*(leanHalf+.11),leanLow-.08,leanBack-.17],[s*(leanHalf+.11),leanTop-.08,back+.03],[s*(leanHalf+.11),leanTop,back+.03],[s*(leanHalf+.11),leanLow,leanBack-.17]);
    footing(s*1.65,leanBack+.08,-.08);
  }
  panel('roof',0xd5d3cc,[-2.05,leanLow,leanBack-.17],[2.05,leanLow,leanBack-.17],[2.05,leanTop,back+.03],[-2.05,leanTop,back+.03],2.8);
  box('siding',0xcecfc2,0,leanLow-.046,leanBack-.17,4.13,.099,.081);

  const water=world.waterLevel??world.lakeLevel;
  let waterDistance=site.waterDistance;
  if(!Number.isFinite(waterDistance) && Number.isFinite(water)) {
    for(let z=6;z<75;z+=.25) if(ground(0,z)<=water+.05) {waterDistance=z;break;}
  }
  let boat;
  if(Number.isFinite(waterDistance) && Number.isFinite(water)) {
    // The bow faces the beach; the broad transom, bench seats and side strakes
    // stay visible from directly above. Put its stern in the surveyed water.
    const len=3.83,width=.67,mooring=site.mooring;
    const [boatX,boatZ]=mooring?local(mooring.x,mooring.z):[0,waterDistance+1.80];
    const heading=mooring?mooring.angle-site.yaw:-.14;
    const angleSin=Math.sin(heading),angleCos=Math.cos(heading),waterY=water-floor;
    const pt=(x,y,z)=>[boatX+angleCos*x+angleSin*z,waterY+y,boatZ-angleSin*x+angleCos*z];
    boat={x:boatX,z:boatZ,cos:angleCos,sin:angleSin,half:.74,len:len/2,height:waterY+.33};
    const sections=[[-len/2,.028,.32],[-1.49,.34,.27],[-.94,.54,.23],[-.28,width,.21],[.62,width,.2],[len/2,.55,.20]];
    const pts=sections.map(([z,w,y])=>[pt(-w,y,z),pt(-w*.72,-.062,z),pt(0,-.17,z),pt(w*.72,-.062,z),pt(w,y,z)]);
    const colors=[0xcac9bc,0xbab8ab,0xb0b4a8,0xc0c5b8];
    for(let i=0;i<pts.length-1;i++){
      const a=pts[i],b=pts[i+1];
      for(let k=0;k<4;k++) panel('alloy',colors[k],a[k],b[k],b[k+1],a[k+1],3);
      for(const k of [0,4]) pipe('alloy',0xe6e3d6,a[k],b[k],.021,8);
    }
    const last=pts[pts.length-1];
    panel('alloy',0xc2c5b7,last[0],last[1],last[3],last[4],2);
    face('alloy',0xbcc2b6,[last[1],last[2],last[3]],[[0,0],[.5,.5],[1,0]]);
    pipe('alloy',0xd9dccf,last[0],last[4],.022,8);
    for(const [z,span] of [[-.8,.53],[.14,.62],[1.10,.58]]) {
      panel('alloy',0xa8b0a3,pt(-span,.115,z-.104),pt(span,.115,z-.104),pt(span,.115,z+.104),pt(-span,.115,z+.104),2);
      panel('alloy',0x919e91,pt(-span,.04,z-.104),pt(span,.04,z-.104),pt(span,.115,z-.104),pt(-span,.115,z-.104));
    }
    const [kx,kz]=mooring?local(mooring.knotX,mooring.knotZ):[-.55,waterDistance-1.7];
    const bow=pt(0,.29,-len/2),knot=[kx,ground(kx,kz)-floor+.024,kz];
    pipe('wood',0xa18b66,bow,knot,.012,6);
  }

  const maps=new Map(),loader=new T.TextureLoader();
  function texture(path) {
    if(!maps.has(path)) {
      const map=loader.load(path);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.anisotropy=4;
      maps.set(path,map);
    }
    return maps.get(path);
  }
  const materials={
    wood:{map:'lakeside-dock.webp'},siding:{map:'labrador-painted-wood.webp'},
    log:{map:'lakeside-dock.webp'},rootWood:{map:'shore-bark.webp'},roof:{map:'lakeside-metal.webp',roughness:.73,metalness:.16},
    stone:{map:'shore-stone.webp'},hardware:{roughness:.57,metalness:.36},paint:{roughness:.74},
    glass:{color:0x34413e,roughness:.165,metalness:.38},glassLight:{color:0xa6afa5,roughness:.29,metalness:.40},
    seam:{roughness:.48,metalness:.32},screen:{roughness:.94},alloy:{roughness:.45,metalness:.48},
  };
  for(const [kind,b] of groups) {
    const opts={...materials[kind]};
    if(opts.map) opts.map=texture(opts.map);
    const mat=new T.MeshStandardMaterial({vertexColors:true,roughness:.88,side:T.DoubleSide,...opts});
    if(kind==='log')mat.onBeforeCompile=shader=>{
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
        // Peeled logs carry long silver grain without the board joints or nail
        // heads in a deck atlas. The cylinders supply their own curved relief.
        vec3 wood=texture2D(map,vec2(.115+.073*fract(vMapUv.x),vMapUv.y)).rgb;
        float value=.44+.64*sqrt(max(0.,dot(wood,vec3(.29,.58,.13))));
        diffuseColor.rgb*=vec3(1.03,1.01,.98)*value;
      `);
    };
    if(kind==='glass'||kind==='glassLight')scene.userData.buildingLight.glaze(mat,1.0);
    if(['wood','roof','siding'].includes(kind)){mat.bumpMap=mat.map;mat.bumpScale=kind==='roof'?.037:.014;}
    if(kind==='siding')scene.userData.buildingLight.finish(mat,'boards',1.49,true);
    if(kind==='stone')scene.userData.buildingLight.finish(mat,'fieldstone',1.76);
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(b.positions,3));
    geometry.setAttribute('uv',new T.Float32BufferAttribute(b.uvs,2));
    geometry.setAttribute('color',new T.Float32BufferAttribute(b.colors,3));
    geometry.computeVertexNormals();geometry.computeBoundingSphere();
    const mesh=new T.Mesh(geometry,mat);mesh.name='Cabin '+kind;mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
  }
  // The gravel apron is opaque wherever it actually raises the bank, and its
  // feathered boundary touches the registered headland. Tree roots, fly-over
  // clearance and individual stones use this same physical surface.
  const pad=new T.PlaneGeometry(16,23,40,58);pad.rotateX(-Math.PI/2);
  const pp=pad.attributes.position,pu=pad.attributes.uv,shade=[];
  for(let i=0;i<pp.count;i++){
    const x=pp.getX(i),z=pp.getZ(i)+3.5,original=originalGround(x,z),y=ground(x,z);
    pp.setXYZ(i,x,y-floor+.014,z);pu.setXY(i,x/2.8,z/2.8);
    const w=ease(.012,.10,y-original),d=.88+.075*Math.cos(x*2.03+.63*z)*Math.sin(.58*z-x*.4);
    shade.push(d*.98,d*.96,d*.89,w);
  }
  pad.setAttribute('color',new T.Float32BufferAttribute(shade,4));pad.computeVertexNormals();pad.computeBoundingSphere();
  const soil=new T.MeshStandardMaterial({map:texture('shore-sand.webp'),vertexColors:true,roughness:.95,transparent:true,alphaTest:.015,depthWrite:true});
  soil.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
    #include <map_fragment>
    float fines=dot(diffuseColor.rgb,vec3(.27,.58,.15));
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(fines)*vec3(1.10,1.03,.89),.80)*1.34;
  `);};
  const apron=new T.Mesh(pad,soil);apron.name='Compacted mineral landing under the porch steps';apron.receiveShadow=true;root.add(apron);
  // Irregular sandy yard and narrow landing path fade into the existing shore
  // grass. Sample the terrain for every vertex and keep the lake itself clear.
  const sand={position:[],uv:[],color:[],index:[]};
  function sandVertex(x,z,alpha) {
    const groundY=ground(x,z);
    if(Number.isFinite(water) && groundY<water+.07) alpha=0;
    sand.position.push(x,groundY-floor+.036,z);sand.uv.push(x/4.6,z/4.6);
    sand.color.push(1,.98,.95,alpha);
  }
  const sandEnd=Number.isFinite(waterDistance)?Math.min(waterDistance+1.2,90):9;
  const rows=Math.ceil((sandEnd+6)/.7),across=10;
  for(let i=0;i<=rows;i++) {
    const z=-6+i*(sandEnd+6)/rows,bell=Math.exp(-((z-1)**2)/26);
    const half=.94+4.87*bell+.16*Math.sin(z*1.3)+.12*Math.cos(z*2.2);
    const center=.39*Math.sin(z*.47)*(1-.7*bell);
    for(let j=0;j<=across;j++) {
      const s=2*j/across-1,fadeWidth=Math.min(1,(1-Math.abs(s))*3.2);
      const fadeLength=Math.min(1,i*.45,(rows-i)*.55);
      sandVertex(center+(half+.11*Math.sin(i*5+j))*s,z,Math.max(0,fadeWidth*fadeLength*.94));
      if(i && j) {
        const c=i*(across+1)+j,a=c-across-2,b=c-across-1;
        sand.index.push(a,c,b,a,c-1,c);
      }
    }
  }
  const surface=new T.BufferGeometry();
  for(const [key,size] of [['position',3],['uv',2],['color',4]]) surface.setAttribute(key,new T.Float32BufferAttribute(sand[key],size));
  surface.setIndex(sand.index);surface.computeVertexNormals();surface.computeBoundingSphere();
  const sandMat=new T.MeshStandardMaterial({map:texture('shore-sand.webp'),vertexColors:true,roughness:.98,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
  sandMat.onBeforeCompile=soil.onBeforeCompile;
  const yard=new T.Mesh(surface,sandMat);yard.name='Sandy cabin clearing';yard.receiveShadow=true;root.add(yard);
  function local(x,z) {const dx=x-site.x,dz=z-site.z;return [cos*dx-sin*dz,sin*dx+cos*dz];}
  function padHeight(x,z){
    if(Math.abs(x-site.x)>17||Math.abs(z-site.z)>17)return -Infinity;
    const [u,v]=local(x,z);
    return Math.abs(u)<=8&&v>=-8&&v<=15?ground(u,v):-Infinity;
  }
  function clearance(x,z) {
    const [u,v]=local(x,z);
    for(const r of roofs) if(v>=r.back && v<=r.front && Math.abs(u)<=r.half)
      return floor+r.eave+r.rise*(1-Math.abs(u)/r.half)+.065;
    if(Math.abs(u)<=2.05 && v>=leanBack-.17 && v<=back+.03)
      return floor+leanLow+(leanTop-leanLow)*(v-leanBack+.17)/(back-leanBack+.2);
    for(const b of obstacles) if(Math.abs(u-b.x)<=b.w/2 && Math.abs(v-b.z)<=b.d/2) return floor+b.h;
    if(boat){
      const du=u-boat.x,dv=v-boat.z;
      if(Math.abs(boat.cos*du-boat.sin*dv)<=boat.half+.27&&Math.abs(boat.sin*du+boat.cos*dv)<=boat.len)return floor+boat.height;
    }
    return -Infinity;
  }
  function inClearing(x,z) {
    const [u,v]=local(x,z);
    if(v>-5.0 && v<7.8 && Math.abs(u)<5.3) return true;
    return v>=5 && v<=sandEnd+.45 && Math.abs(u-.39*Math.sin(v*.47))<2.6;
  }
  scene.add(root);
  const campTrees=window.addBerteCampGround(T,scene,root,{site,floor,ground,water,waterDistance,texture,surveyGround:world.surveyGround,measuredTrees:world.measuredTrees});
  return {root,clearance,padHeight,inClearing,campTrees,roofs,waterDistance};
};
