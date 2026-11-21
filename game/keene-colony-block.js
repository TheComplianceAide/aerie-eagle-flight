// Colony's Block, 4–7 Central Square, Keene. The National Register records
// a 63.7 foot frontage and three distinct Second Empire mansards. The dated
// photographic surface adaptations and the UNH 2 m roof survey have separate
// source notices in keene-colony-credits.txt.
window.addKeeneColonyBlock=function(T,{layout,face,height}){
  const survey=window.keeneColonySurvey,W=survey.width,[ox,oz]=survey.origin,[dx,dz]=survey.tangent;
  const base=height(ox+dx*W/2-dz*.55,oz+dz*W/2+dx*.55);
  addKeeneTerracePavement(T, face, height, survey, base);
  const color=n=>new T.Color(n),white=color(0xffffff),trim=color(0xcac9bc),stone=color(0xb3a998);
  const brick=color(0x829da3),lead=color(0x686961),dark=color(0x3e4541);
  const wallFoot=3.91,eave=15.81,relief=.245;
  Object.assign(layout,{
    colonyWall:{file:'keene-colony-wall.webp',normal:'keene-colony-relief.webp',roughness:.86},
    colonyWindow:{file:'keene-colony-wall.webp',roughness:.26,glazing:true},
    colonyRoofMembrane:{file:'keene-asphalt.webp',roughness:.96},
    colonyShop:{file:'keene-colony-shops.webp',roughness:.81},
    colonyShopGlass:{file:'keene-colony-shops.webp',roughness:.27,glazing:true},
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
  // The field photo is registered at x=234..842 on a 1000-wide print. The
  // material samples omit the parked cars and trees in front of the shops.
  const shopU=x=>(x-234)*W/608;
  const ivory=color(0xc1c0b6),sill=color(0x796f65),reveal=color(0x625950);
  function shopFace(kind,rect,l,r,lo,hi,dl,dr=dl){
    const [x,y,w,h]=rect;
    surface(kind,white,[[l,lo,dl],[r,lo,dr],[r,hi,dr],[l,hi,dl]],
      [[(x+5)/1024,1-(y+h-5)/1024],[(x+w-5)/1024,1-(y+h-5)/1024],
       [(x+w-5)/1024,1-(y+5)/1024],[(x+5)/1024,1-(y+5)/1024]]);
  }
  const fascia=[0,0,512,128],roseStone=[512,0,256,128],bronze=[768,0,256,128];
  const display=[[0,128,256,384],[256,128,256,384],[512,128,256,384],[768,128,256,384]];
  // Shallow front steps in the fascia follow the three historic building bays.
  for(const {l,r,front:d} of profiles){
    box('smooth',ivory,l,r,2.90,wallFoot+.01,d-.11,d+.077);
    shopFace('colonyShop',fascia,l,r,2.91,wallFoot+.012,d+.084);
    box('smooth',ivory,l,r,3.81,3.88,d+.071,d+.145);
    box('smooth',sill,l,r,2.865,2.91,d+.04,d+.12);
  }
  const east=profiles[2].front;
  box('smooth',color(0x4d4032),shopU(699),shopU(834),3.095,3.57,east+.080,east+.136);
  shopFace('colonyShop',bronze,shopU(699),shopU(834),3.095,3.57,east+.141);
  const frontAt=u=>profiles.find(p=>u>=p.l&&u<=p.r)?.front??relief;
  for(const [left,right] of [[234,257],[443,468],[501,530],[667,695],[827,842]]){
    const l=shopU(left),r=shopU(right),d=frontAt((l+r)/2);
    box('smooth',reveal,l,r,-.15,2.87,d-.11,d+.08);
    shopFace('colonyShop',roseStone,l,r,-.09,2.86,d+.085);
    for(const y of [.85,1.81]){
      box('smooth',sill,l,r,y,y+.012,d+.082,d+.088);
    }
  }
  // Each opening is independently recessed. Clear plates use the city's
  // direction-dependent reflections over the sampled interior or roller shade.
  for(const [left,right,material,recess] of [
    [257,310,0,.10],[310,356,3,.54],[356,398,1,.19],[398,443,1,.10],
    [468,501,2,.73],[530,573,2,.10],[573,624,2,.10],[624,667,3,.83],
    [695,744,3,.23],[744,784,3,.69],[784,827,2,.15]
  ]){
    const l=shopU(left),r=shopU(right),d=frontAt((l+r)/2),back=d-recess,isDoor=recess>.4;
    const edge=isDoor?.11:.065,lo=isDoor?.045:.39;
    box('smooth',reveal,l,r,-.15,2.87,back-.1,back);
    shopFace('colonyShopGlass',display[material],l+edge,r-edge,lo,2.82,back+.014);
    for(const [a,sign] of [[l,1],[r,-1]]){
      const inner=a+sign*edge;
      surface('smooth',ivory,[[a,0,d],[inner,0,back+.02],[inner,2.86,back+.02],[a,2.86,d]]);
      box('smooth',ivory,Math.min(a,inner),Math.max(a,inner),-.12,2.88,d-.035,d+.018);
    }
    surface('smooth',reveal,[[l,2.85,d],[r,2.85,d],[r-edge,2.85,back],[l+edge,2.85,back]]);
    if(isDoor){
      box('smooth',ivory,l+edge,r-edge,2.14,2.20,back+.018,back+.081);
      const handle=r-edge-.18;
      box('smooth',color(0xaf9c76),handle,handle+.028,.83,1.20,back+.025,back+.11);
      surface('smooth',sill,[[l,.005,d],[r,.005,d],[r-edge,.035,back],[l+edge,.035,back]]);
    }else{
      box('smooth',sill,l+edge,r-edge,-.14,lo,back-.07,d+.08);
    }
  }
  // At 10 Central Square the source shows a projecting red fabric awning,
  // a shallow valance and an oval cafe sign. The southern neighbor has a
  // buff stone surround and an entrance sunk into its northern end.
  const awningL=shopU(38),awningR=shopU(233)-.04;
  const awningUV=[[5/1024,1-701/1024],[763/1024,1-701/1024],
    [763/1024,1-517/1024],[5/1024,1-517/1024]];
  const canopyTint=color(0x73423c),canvasBack=color(0x51403b);
  const lower=2.67,upper=3.59,tip=1.27,bracket=.29;
  surface('colonyShop',white,[[awningL,lower,tip],[awningR,lower,tip],
    [awningR,upper,bracket],[awningL,upper,bracket]],awningUV);
  box('smooth',canopyTint,awningL,awningR,2.47,lower,.98,tip);
  for(const a of [awningL,awningR]){
    surface('smooth',canopyTint,[[a,lower,tip],[a,lower,bracket],[a,upper,bracket]]);
  }
  surface('smooth',canvasBack,[[awningL,lower,bracket],[awningR,lower,bracket],
    [awningR,lower,tip],[awningL,lower,tip]]);
  for(const [a,b,door] of [[38,89,false],[89,141,false],[141,181,true],[181,233,false]]){
    const l=shopU(a),r=shopU(b),d=door?.255:.33;
    shopFace('colonyShopGlass',display[door?3:2],l,r,.16,2.61,d);
    box('smooth',canvasBack,l,l+.075,-.08,2.63,d-.04,d+.09);
    box('smooth',sill,l,r,-.14,.16,d-.05,d+.08);
  }
  for(const [a,b] of [[843,856],[893,919],[962,999]]){
    const l=shopU(a),r=shopU(b);
    box('smooth',sill,l,r,-.11,3.41,.19,.41);
    shopFace('colonyShop',[768,512,256,192],l,r,-.10,3.41,.418);
  }
  for(const [a,b,door] of [[856,893,true],[919,962,false]]){
    const l=shopU(a),r=shopU(b),d=.29;
    shopFace('colonyShopGlass',display[door?2:3],l,r,door?.08:.49,2.70,d);
    box('smooth',stone,l,r,2.73,3.39,d-.015,d+.11);
    if(!door)box('smooth',stone,l,r,-.10,.48,d-.02,d+.10);
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
    if(u>=awningL&&u<=awningR&&d>=bracket&&d<=tip)
      return base+upper-(upper-lower)*(d-bracket)/(tip-bracket);
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
    approach:[1924,4384,1924,4484,7,83,3]}};
};

// The inner edge of the existing Central Square sidewalk stops short of the
// registered east storefronts. Join that edge to the terrace doors without
// changing the surveyed parking strip, its cars, road markings, or trees.
function addKeeneTerracePavement(T, face, height, survey, base) {
  const [ox, oz] = survey.origin, [tx, tz] = survey.tangent;
  const world = (u, d) => [ox + tx*u - tz*d, oz + tz*u + tx*d];
  const local = ([x, z]) => [tx*(x-ox) + tz*(z-oz), -tz*(x-ox) + tx*(z-oz)];
  // Same registered eastern footway vertices used by addKeeneStreetscape.
  const walkEdge = [[1953.4,4337.8],[1945,4349.6],[1940.8,4370.6],[1936,4395.4],[1935.6,4403.8],[1939.2,4405.4]].map(local);
  function depthAt(u) {
    const i = walkEdge.findIndex(([at]) => at >= u);
    const [a, ad] = walkEdge[i-1], [b, bd] = walkEdge[i];
    return ad + (bd-ad)*(u-a)/(b-a);
  }
  const tiles = [0xb8b5a7,0xbdb9ae,0xbab7ab,0xb5b3a8].map(t => new T.Color(t));
  const joints = new T.Color(0x939187), granite = new T.Color(0xb8b8ad);
  const back = -.12;
  function surface(u, f, drop) {
    const outer = depthAt(u) + .06, d = back + (outer-back)*f;
    const [x,z] = world(u,d), [fx,fz] = world(u,back), [ex,ez] = world(u,outer);
    const threshold = Math.max(base-.014,height(fx,fz)+.065);
    const edge = height(ex,ez)+.613;
    const y = Math.max(height(x,z)+.052, threshold*(1-f)+edge*f) - drop;
    return [x,y,z];
  }
  function flag(a,b,inside,outside,tint,drop=0) {
    const corners = [[a,inside],[a,outside],[b,outside],[b,inside]].map(([u,f])=>surface(u,f,drop));
    face('masonry',tint,corners,corners.map(([x,,z])=>[x/3.1,z/3.1]));
  }
  // This is the inferred finish of the continuous footway. No paving seams
  // are resolvable in the aerial image. Scored cuts are narrow and recessed.
  const end = 34.22, pitch = 2.15;
  for (let a=-22.50, index=0; a<end; a+=pitch,index++) {
    const b=Math.min(a+pitch,end), joint=Math.min(.018,b-a);
    flag(a,b-joint,0,.503,tiles[index%4]);
    flag(a,b-joint,.503,.507,joints,.003);
    flag(a,b-joint,.507,1,tiles[(index+1)%4]);
    flag(b-joint,b,0,1,joints,.003);
  }
  // The street mesh already owns the granite cap. Give its field-traced
  // outer edge a vertical riser, stopping at the existing asphalt elevation.
  const curb = [[1940.6,4353.4],[1938.4,4371.6],[1934.8,4387.8],[1928.4,4401.2]];
  const normals = curb.slice(1).map(([x,z],i)=>{
    const vx=x-curb[i][0], vz=z-curb[i][1], n=Math.hypot(vx,vz); return [-vz/n,vx/n];
  });
  const corners = curb.map(([x,z],i)=>{
    const a=normals[Math.max(0,i-1)], b=normals[Math.min(i,normals.length-1)];
    const width=.12/(1+a[0]*b[0]+a[1]*b[1]);
    return [x+(a[0]+b[0])*width,z+(a[1]+b[1])*width];
  });
  for(let i=1;i<corners.length;i++) {
    const [ax,az]=corners[i-1], [bx,bz]=corners[i], length=Math.hypot(bx-ax,bz-az), count=Math.ceil(length/1.8);
    for(let j=0;j<count;j++) {
      const pts = [j/count,(j+1)/count,(j+1)/count,j/count].map((s,k)=>{
        const x=ax+(bx-ax)*s,z=az+(bz-az)*s;
        return [x,height(x,z)+(k<2?.464:.625),z];
      });
      face('masonry',granite,pts,[[0,0],[length/count,0],[length/count,.16],[0,.16]]);
    }
  }
}
