// Colony's Block, 4–7 Central Square, Keene. The National Register records
// a 63.7 foot frontage and three distinct Second Empire mansards. The dated
// photographic surface adaptations and the UNH 2 m roof survey have separate
// source notices in keene-colony-credits.txt.
window.addKeeneColonyBlock=function(T,{layout,face,height}){
  const survey=window.keeneColonySurvey,W=survey.width,[ox,oz]=survey.origin,[dx,dz]=survey.tangent;
  const base=height(ox+dx*W/2-dz*.55,oz+dz*W/2+dx*.55);
  const color=n=>new T.Color(n),white=color(0xffffff),trim=color(0xcac9bc),stone=color(0xb3a998);
  const brick=color(0x829da3),lead=color(0x686961),dark=color(0x3e4541);
  const wallFoot=3.91,eave=15.81,relief=.245;
  Object.assign(layout,{
    colonyWall:{file:'keene-colony-wall.webp',normal:'keene-colony-relief.webp',roughness:.86},
    colonyWindow:{file:'keene-colony-wall.webp',roughness:.26,glazing:true},
    colonyRoofMembrane:{file:'keene-asphalt.webp',roughness:.96},
    colonyFlank:{file:'keene-colony-neighbors.webp',roughness:.86},
    colonySlate:{file:'keene-colony-slate.webp',roughness:.79},
    colonyDormer:{file:'keene-colony-mansards.webp',roughness:.72}
  });
  // u runs south along the façade. d extends west over the sidewalk. All
  // upper levels share the same base and street registration as the front.
  const point=(u,y,d)=>[ox+dx*u-dz*d,base+y,oz+dz*u+dx*d];
  const surface=(kind,tint,poly,uv)=>face(kind,tint,poly.map(p=>point(...p)),uv);
  function box(kind,tint,l,r,lo,hi,back,front){
    const a=[l,lo,front],b=[r,lo,front],c=[r,hi,front],d=[l,hi,front];
    const e=[l,lo,back],f=[r,lo,back],g=[r,hi,back],h=[l,hi,back];
    surface(kind,tint,[a,b,c,d]);surface(kind,tint,[b,f,g,c]);surface(kind,tint,[e,a,d,h]);
    surface(kind,tint,[d,c,g,h]);surface(kind,tint,[a,e,f,b]);
  }
  const fullUV=(u,y)=>[u/W,(y-wallFoot)/(eave-wallFoot)];
  function photo(kind,poly){surface(kind,white,poly,poly.map(([u,y])=>fullUV(u,y)));}
  function wall(l,r,lo,hi,d){
    if(hi>lo&&r>l)photo('colonyWall',[[l,lo,d],[r,lo,d],[r,hi,d],[l,hi,d]]);
  }
  const profiles=[
    {l:0,r:W*.321,front:relief+.275,top:21.27,capInset:1.68},
    {l:W*.321,r:W*.715,front:relief,top:18.97,capInset:1.08},
    {l:W*.715,r:W,front:relief+.255,top:20.87,capInset:1.54}
  ];
  // Positions and sash widths measured in the rectified March 2012 photo.
  // The western fronts have different glazing on all three upper storeys.
  const openings=[
    [[.067,.047],[.177,.048],[.283,.047],[.401,.046],[.487,.045],[.573,.045],[.657,.044],[.779,.031],[.843,.034],[.878,.030],[.949,.032]],
    [[.063,.050],[.176,.051],[.278,.050],[.399,.049],[.485,.048],[.572,.047],[.657,.047],[.777,.030],[.845,.034],[.880,.029],[.949,.031]],
    [[.058,.029],[.144,.030],[.194,.030],[.274,.028],[.386,.028],[.435,.028],[.489,.027],[.560,.028],[.612,.026],[.663,.027],[.777,.022],[.816,.020],[.861,.021],[.903,.020],[.946,.021]]
  ];
  const courses=[[.047,.222,.249],[.405,.564,.595],[.720,.854,.886]];
  function glazing(u,r,lo,shoulder,apex,d,pointed){
    const back=d-.14;
    let prev=null;
    for(let i=0;i<=8;i++){
      const x=-1+2*i/8;
      const y=shoulder+(apex-shoulder)*(pointed?1-Math.abs(x):Math.sqrt(Math.max(0,1-x*x)));
      const curr=[u+x*r,y];
      if(prev){
        const [l,a]=prev,[h,b]=curr;
        photo('colonyWall',[[l,a,d],[h,b,d],[h,apex+.005,d],[l,apex+.005,d]]);
        surface('smooth',stone,[[l,a,d],[h,b,d],[h,b,back],[l,a,back]]);
        photo('colonyWindow',[[l,lo,back],[h,lo,back],[h,b,back],[l,a,back]]);
      }
      prev=curr;
    }
    for(const side of [-1,1]){
      const s=u+side*r;surface('smooth',stone,[[s,lo,d],[s,shoulder,d],[s,shoulder,back],[s,lo,back]]);
    }
    box('smooth',trim,u-r-.034,u+r+.034,lo-.037,lo-.005,d-.035,d+.068);
    surface('smooth',dark,[[u-r,lo,d],[u+r,lo,d],[u+r,lo,back],[u-r,lo,back]]);
  }
  const ys=t=>wallFoot+t*(eave-wallFoot);
  for(const bay of profiles){
    let bottom=wallFoot;
    for(let row=0;row<3;row++){
      const [low,spring,tip]=courses[row].map(ys);wall(bay.l,bay.r,bottom,low,bay.front);
      let left=bay.l;
      for(const [fraction,span] of openings[row]){
        const u=fraction*W,r=span*W*.5;if(u<bay.l||u>bay.r)continue;
        wall(left,u-r,low,tip+.005,bay.front);
        glazing(u,r,low,spring,tip,bay.front,row===2&&u>bay.l+1.79&&bay===profiles[1]);
        left=u+r;
      }
      wall(left,bay.r,low,tip+.005,bay.front);bottom=tip+.005;
    }
    wall(bay.l,bay.r,bottom,eave,bay.front);
    const {l,r,front:d}=bay;
    for(const y of [ys(.352),ys(.69)]){
      // The sandstone course stays visible in grazing light from along Main.
      photo('colonyWall',[[l,y-.043,d+.063],[r,y-.043,d+.063],[r,y+.019,d+.063],[l,y+.019,d+.063]]);
      surface('smooth',stone,[[l,y+.019,d],[r,y+.019,d],[r,y+.019,d+.063],[l,y+.019,d+.063]]);
    }
    box('smooth',stone,l-.035,r+.035,eave-.075,eave+.038,d-.055,d+.26);
    box('smooth',trim,l-.070,r+.070,eave+.048,eave+.169,d-.12,d+.39);
    for(const a of [l,r]){
      surface('brick',brick,[[a,wallFoot,d-.31],[a,wallFoot,d],[a,eave,d],[a,eave,d-.31]],[[0,0],[.2,0],[.2,8],[0,8]]);
    }
  }
  // Shop level uses the photographed openings. The current tenants' lettering
  // is omitted. Plate glass has deep transoms, recessed entries and splayed
  // returns, independent of the upper sash photograph.
  const piers=[0,.337,.707,1].map(f=>f*W);
  for(let i=0;i<3;i++){
    const l=piers[i],r=piers[i+1],d=profiles[i].front;
    box('smooth',trim,l,r,3.10,wallFoot+.05,d-.1,d+.115);
    box('smooth',stone,l,r,3.08,3.145,d-.035,d+.18);
    box('smooth',color(0x9c8f82),l+.034,l+.25,-.18,3.10,d-.09,d+.096);
    box('smooth',color(0xb7a99b),r-.22,r-.024,-.18,3.10,d-.09,d+.096);
    const door=i===0?l+(r-l)*.47:i===1?l+(r-l)*.18:l+(r-l)*.52;
    const tint=color(0x78817c),black=color(0x444d47);
    for(const [a,b] of [[l+.25,door-.61],[door+.61,r-.22]]){
      box('smooth',stone,a,b,-.12,.38,d-.08,d+.085);
      box('smooth',black,a,b,.38,3.10,d-.16,d-.06);
      surface('glass',tint,[[a+.052,.44,d-.04],[b-.052,.44,d-.04],[b-.052,3.02,d-.04],[a+.052,3.02,d-.04]]);
      box('smooth',trim,a,b,2.36,2.395,d-.045,d+.015);
      if(b-a>2.)box('smooth',trim,(a+b)*.5-.018,(a+b)*.5+.018,.39,3.05,d-.045,d+.019);
    }
    const back=d-.49;
    box('smooth',dark,door-.57,door+.57,-.16,3.10,back-.12,back);
    surface('glass',tint,[[door-.46,.25,back+.012],[door+.46,.25,back+.012],[door+.46,2.49,back+.012],[door-.46,2.49,back+.012]]);
    for(const sign of [-1,1]){
      const a=door+.61*sign,b=door+.53*sign;
      surface('smooth',trim,[[a,-.08,d],[b,-.08,back],[b,3.08,back],[a,3.08,d]]);
    }
    box('smooth',trim,door-.55,door+.55,2.51,2.60,back-.01,back+.095);
    box('smooth',color(0x939288),door+.33,door+.37,.94,1.34,back+.02,back+.10);
  }
  // Roof collision uses the actual rendered slopes, including the narrow
  // transition from the cornice to the high fronts and the lower rear sheds.
  const roofTriangles=[];
  function roofSurface(kind,tint,poly,uv){
    surface(kind,tint,poly,uv);
    const tris=poly.length===4?[[0,1,2],[0,2,3]]:[[0,1,2]];
    for(const [a,b,c] of tris){
      const [u,y,d]=poly[a],u1=poly[b][0]-u,d1=poly[b][2]-d,u2=poly[c][0]-u,d2=poly[c][2]-d;
      const det=u1*d2-u2*d1;if(Math.abs(det)<.0001)continue;
      roofTriangles.push([u,d,y,d2/det,-u2/det,-d1/det,u1/det,poly[b][1]-y,poly[c][1]-y]);
    }
  }
  const colorStone=color(0x696a64),flash=color(0xb6b4a9);
  const fieldUV=(tile,x,y)=>[(tile+.001+.998*x)/3,.001+.998*y];
  const roofUV=(tile,x,y)=>[(tile+.001+.998*x)/3,(36.5+298.5*y)/336];
  const fronts=[
    [[.034,0,.319,.277,.12],[.34,0,.702,.418,.25],[.752,0,.996,.289,.105]],
    [[.110,0,.423,.656,.035],[.393,0,.612,.839,.153],[.606,0,.891,.643,.027]],
    [[.019,0,.310,.275,.135],[.304,0,.737,.453,.255],[.753,0,.988,.295,.110]]
  ];
  profiles.forEach((bay,index)=>{
    const {l,r,top,front,capInset}=bay,span=r-l,e=eave+.15;
    const nose=front+.18,crest=-capInset;
    const rows=[{y:e,d:nose,t:0,inset:0},{y:e+(top-e)*.54,d:nose+(crest-nose)*.48,t:.54,inset:index===1?0:.13},
      {y:top,d:crest,t:1,inset:index===1?0:.35}];
    for(let j=1;j<rows.length;j++){
      const a=rows[j-1],b=rows[j];
      roofSurface('colonySlate',white,[[l+a.inset,a.y,a.d],[r-a.inset,a.y,a.d],[r-b.inset,b.y,b.d],[l+b.inset,b.y,b.d]],
        [fieldUV(index,0,a.t),fieldUV(index,1,a.t),fieldUV(index,1,b.t),fieldUV(index,0,b.t)]);
    }
    box('smooth',flash,l+.32,r-.32,top-.064,top+.087,crest-.29,crest+.035);
    roofSurface('roofing',colorStone,[[l+.33,top,crest],[r-.33,top,crest],[r,top-.37,-3.4],[l,top-.37,-3.4]],[[0,0],[span*.6,0],[span*.6,1],[0,1]]);
    for(const [edge,cap]of [[l,l+.33],[r,r-.33]]){
      surface('brick',brick,[[edge,e,front-.17],[cap,top,crest],[edge,top-.37,-3.4],[edge,e,-3.4]],[[0,e/1.6],[1,top/1.6],[2.1,top/1.6],[2.1,e/1.6]]);
    }
    for(const [x0,bottom,x1,emergence,rise] of fronts[index]){
      const shape=[];
      if(index===1&&rise<.10){
        shape.push([x0,bottom],[x1,bottom],[x1,emergence],[x1-.055,emergence+.035],[x0+.035,emergence+.055],[x0,emergence+.02]);
      }else{
        const center=(x0+x1)*.5,rad=(x1-x0)*.5;
        shape.push([x0,bottom],[x1,bottom],[x1,emergence]);
        for(let k=1;k<=10;k++){
          const a=k*Math.PI/10;
          const y=(index===1&&rise>.10||index===2&&rise>.20)?emergence+rise*(1-Math.abs(Math.cos(a))):emergence+rise*Math.sin(a);
          shape.push([center+rad*Math.cos(a),y]);
        }
      }
      const depth=front+.25-.09*(x0+x1),uv=shape.map(([x,y])=>roofUV(index,x,y));
      const uvs=shape.map(([x,y])=>new T.Vector2(x,y));
      const boundary=shape.map(([x,y])=>[l+x*span,e+y*(top-e),depth]);
      for(const tri of T.ShapeUtils.triangulateShape(uvs,[]))surface('colonyDormer',white,tri.map(i=>boundary[i]),tri.map(i=>uv[i]));
      for(let i=0;i<shape.length;i++){
        const j=(i+1)%shape.length,a=boundary[i],b=boundary[j];
        const backA=nose+(crest-nose)*shape[i][1]-.045,backB=nose+(crest-nose)*shape[j][1]-.045;
        roofSurface('smooth',shape[i][1]+shape[j][1]>.66?lead:trim,[a,b,[b[0],b[1],backB],[a[0],a[1],backA]]);
      }
    }
  });
  // The west and rear lidar returns drop quickly at shared party walls and
  // lower rear additions. Keep only the original block's upper roof envelope.
  const {u,depth,rows}=survey;
  const maxDepth=18.3;
  function aftY(row,col){
    // A 2 m lidar cell at a party wall straddles two buildings. The inner
    // return resolves the main roof. A masonry party wall makes the drop to
    // the neighboring wing vertical instead of smearing the ortho down it.
    const inner=row<4?Math.max(1,Math.min(u.length-2,col)):col;
    const raw=rows[row][inner];
    return Math.max(9.1,Math.min(21.4,raw));
  }
  for(let r=1;r<depth.length&&depth[r]<=maxDepth;r++)for(let c=1;c<u.length;c++){
    const a=[u[c-1],aftY(r-1,c-1),-depth[r-1]],b=[u[c],aftY(r-1,c),-depth[r-1]];
    const g=[u[c],aftY(r,c),-depth[r]],d=[u[c-1],aftY(r,c-1),-depth[r]];
    const poly=[a,b,g,d];
    // Upper surfaces retain their plan-position registration to the existing NH ortho.
    const imageUV=poly.map(p=>{const [x,,z]=point(...p);return [(x-1640)/640,1-(z-4210)/720];});
    const incline=Math.max(Math.abs(b[1]-a[1])/(b[0]-a[0]),Math.abs(d[1]-a[1])/(a[2]-d[2]));
    if(incline<.32)roofSurface('streetPhoto',white,poly,imageUV);
    else {
      const uv=poly.map(([x,y,z])=>[x*.49,(z-a[2])*Math.hypot(z-a[2],y-a[1])/(Math.abs(z-a[2])||1)*.49]);
      roofSurface('colonyRoofMembrane',color(0x979b96),poly,uv);
    }
  }
  // The 2021–22 six-inch ortho resolves a compact, light-colored mechanical
  // bank on the rear roof: three transverse ducts and the adjoining plant.
  // Their positions are measured from that same image, in the roof's u/d axes.
  const pipe=color(0xafb5ad),casing=color(0x879397),plant=[];
  function equipment(tint,l,r,lo,hi,back,front){
    box('smooth',tint,l,r,lo,hi,back,front);plant.push([l,r,back,front,hi]);
  }
  for(const d of [9.98,11.16,12.37]){
    equipment(pipe,6.78,12.15,18.23,18.51,-d-.16,-d+.16);
  }
  for(const u of [6.72,12.14])equipment(trim,u-.11,u+.11,18.2,18.56,-14.17,-9.7);
  equipment(dark,7.14,11.97,17.20,18.10,-17.77,-14.35);
  equipment(casing,7.81,10.31,18.10,18.55,-17.13,-14.94);
  equipment(pipe,10.30,11.87,18.10,18.49,-17.17,-14.73);
  // This city footprint combines the Block with its lower neighbors. Their
  // measured 14 m and 13 m roofs abut the two party walls. Clip the south
  // wing to the chamfer and the actual diagonal edge toward the courtyard.
  const flanks=[
    {l:-22.58,r:0,ring:[[-22.58,0],[0,0],[0,15.45],[-22.58,15.45]],tiles:3,v:[.001,511.5/896]},
    {l:W,r:34.27,ring:[[W,0],[34.27,0],[35.89,2.68],[30.03,15.45],[W,15.45]],tiles:3,v:[512.5/896,.999]}
  ];
  flanks.forEach((f,k)=>{
    f.y=survey.flankHeights[k];const top=f.y,ring=f.ring;
    for(let i=0;i<ring.length;i++){
      const [u,d]=ring[i],[v,e]=ring[(i+1)%ring.length];
      const len=Math.hypot(v-u,e-d);
      surface('brick',brick,[[u,8.20,-d],[v,8.20,-e],[v,top,-e],[u,top,-d]],[[0,0],[len/1.55,0],[len/1.55,(top-8.20)/1.55],[0,(top-8.20)/1.55]]);
    }
    for(const tri of T.ShapeUtils.triangulateShape(ring.map(([u,d])=>new T.Vector2(u,d)),[])){
      const poly=tri.map(i=>[ring[i][0],top,-ring[i][1]]);
      const uv=poly.map(p=>{const [x,,z]=point(...p);return [(x-1640)/640,1-(z-4210)/720];});
      surface('streetPhoto',white,poly,uv);
    }
    // The archive photograph shows upper brick sash on both wings. Repeat
    // the visible bays from each neighbor on its own upper frontage only.
    for(let i=0;i<f.tiles;i++){
      const l=f.l+(f.r-f.l)*i/f.tiles,r=f.l+(f.r-f.l)*(i+1)/f.tiles;
      surface('colonyFlank',white,[[l,3.31,.21],[r,3.31,.21],[r,top,.21],[l,top,.21]],[[f.v[0],.001],[f.v[1],.001],[f.v[1],.999],[f.v[0],.999]]);
    }
    box('smooth',stone,f.l,f.r,top-.06,top+.035,-.02,.32);
  });
  // Bridge the measured field to the hand-pitched coping without a light leak.
  const interpolate=(arr,value)=>{
    if(value<=u[0])return arr[0];
    if(value>=u[u.length-1])return arr[arr.length-1];
    const i=u.findIndex(x=>x>=value)-1;
    return arr[i]+(arr[i+1]-arr[i])*(value-u[i])/(u[i+1]-u[i]);
  };
  const firstRow=u.map((_,j)=>aftY(0,j));
  for(const p of profiles){
    const cuts=[p.l,...u.filter(x=>x>p.l&&x<p.r),p.r];
    for(let i=1;i<cuts.length;i++){
      const l=cuts[i-1],r=cuts[i],y=p.top-.37;
      surface('smooth',lead,[[l,y,-3.4],[r,y,-3.4],[r,interpolate(firstRow,r),-3.4],[l,interpolate(firstRow,l),-3.4]]);
    }
  }
  function brickWall(poly){
    const along=Math.max(...poly.map(v=>v[0]))-Math.min(...poly.map(v=>v[0]));
    const depth=Math.max(...poly.map(v=>v[2]))-Math.min(...poly.map(v=>v[2]));
    surface('brick',brick,poly,poly.map(([x,y,z])=>[(depth>along?-z:x)/1.7,y/1.6]));
  }
  for(const edge of [profiles[0],profiles[2]]){
    const x=edge===profiles[0]?edge.l:edge.r;
    brickWall([[x,8.20,edge.front],[x,8.20,-3.4],[x,eave+.16,-3.4],[x,eave+.16,edge.front]]);
  }
  for(let r=1;r<depth.length&&depth[r]<=maxDepth;r++)for(const c of [0,u.length-1]){
    brickWall([[u[c],8.25,-depth[r-1]],[u[c],aftY(r-1,c),-depth[r-1]],[u[c],aftY(r,c),-depth[r]],[u[c],8.25,-depth[r]]]);
  }
  const backRow=depth.indexOf(maxDepth);
  for(let c=1;c<u.length;c++)brickWall([[u[c-1],8.25,-maxDepth],[u[c],8.25,-maxDepth],
    [u[c],aftY(backRow,c),-maxDepth],[u[c-1],aftY(backRow,c-1),-maxDepth]]);
  function collision(x,z){
    const vx=x-ox,vz=z-oz,u=dx*vx+dz*vz,d=-dz*vx+dx*vz;
    if(u< -22.7||u>36||d>1.02||d< -maxDepth)return -Infinity;
    if(u<0||u>W){
      const f=flanks[u<0?0:1],ring=f.ring;
      if(-d<0||-d>15.45)return -Infinity;
      let inside=false;
      for(let i=0,j=ring.length-1;i<ring.length;j=i++){
        const [a,b]=ring[i],[c,e]=ring[j];
        if((b> -d)!==(e> -d)&&u<(c-a)*(-d-b)/(e-b)+a)inside=!inside;
      }
      return inside?base+f.y:-Infinity;
    }
    let level=d>.84?-Infinity:eave;
    for(const [a,b,y,p,q,r,s,dy,dz]of roofTriangles){
      const du=u-a,dd=d-b,beta=p*du+q*dd,gamma=r*du+s*dd;
      if(beta>=0&&gamma>=0&&beta+gamma<=1.00001)level=Math.max(level,y+beta*dy+gamma*dz);
    }
    for(const [l,r,back,front,hi]of plant)if(u>=l&&u<=r&&d>=back&&d<=front)level=Math.max(level,hi);
    return base+level;
  }
  const [southX,,southZ]=point(W,0,0);
  return {collision,base,profile:survey,partyTint:brick,north:[ox,oz],south:[southX,southZ],landmark:{name:"Colony's Block",x:1942.7,z:4380.5,discoveryRadius:49,
    approach:[1917,4463,1935,4323,18,-43,3]}};
};
