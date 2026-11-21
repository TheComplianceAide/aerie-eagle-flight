// The 1918 Hampshire House faces Lake Gloriette. Coordinates along the long wing
// increase southeast; surveyed heights below are absolute metres in the 3DEP datum.
window.makeDixvilleHampshireHouse=function(T,{material,image,tri,face,block,scene}){
  const heading=55*Math.PI/180,co=Math.cos(heading),si=Math.sin(heading);
  function point(u,y,v){return [-178+co*u-si*v,y,-336+si*u+co*v];}
  const frontage=material(0xf8f5ed,image('hampshire-frontage.webp'));
  frontage.name='Hampshire House · lake-facing plaster and windows';
  frontage.map.wrapS=frontage.map.wrapT=T.ClampToEdgeWrapping;
  const tile=material(0xffffff,image('hampshire-tile.webp'));
  tile.name='Hampshire House · copper-red clay roofs';
  tile.normalMap=image('hampshire-tile-normal.webp');tile.normalMap.colorSpace=T.NoColorSpace;
  tile.normalScale.set(.52,.52);tile.roughness=.82;
  const stucco=material(0xbdb7aa),ledge=material(0xa49c90),copper=material(0x505551);
  const iron=material(0x383f3c),membrane=material(0x525455),wallShadow=material(0x5a544c);
  const glass=material(0xb7b4a7);
  glass.transparent=true;glass.opacity=.17;glass.depthWrite=false;glass.roughness=.25;
  scene.userData.buildingLight.glaze(glass,.73);
  glass.name='Hampshire House · reflected sky in lake-end sash';
  const roofing=new Map(),roofCell=6;
  const uv=(x,y)=>[(x-315)/670,1-(y-180)/713];
  function mapped(m,a,b,c,d,st){
    tri(m,a,b,c,[...st[0],...st[1],...st[2]]);tri(m,a,c,d,[...st[0],...st[2],...st[3]]);
  }
  function roofTriangle(m,a,b,c,st){
    tri(m,a,b,c,st);
    const minX=Math.floor(Math.min(a[0],b[0],c[0])/roofCell),maxX=Math.floor(Math.max(a[0],b[0],c[0])/roofCell);
    const minZ=Math.floor(Math.min(a[2],b[2],c[2])/roofCell),maxZ=Math.floor(Math.max(a[2],b[2],c[2])/roofCell);
    const det=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(det)<.0001)return;
    const t={a,b,c,det};
    for(let j=minZ;j<=maxZ;j++)for(let i=minX;i<=maxX;i++){
      const key=i+j*65536;if(!roofing.has(key))roofing.set(key,[]);roofing.get(key).push(t);
    }
  }
  function roofQuad(m,a,b,c,d){
    const length=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]);if(length<.002)return;
    const along=b.map((n,i)=>(n-a[i])/length),offset=d.map((n,i)=>n-a[i]);
    const dot=(x,y)=>x[0]*y[0]+x[1]*y[1]+x[2]*y[2];
    const skew=dot(along,offset),rise=offset.map((n,i)=>n-skew*along[i]);
    const width=Math.hypot(...rise);if(width<.001)return;
    const up=rise.map(n=>n/width),st=p=>{const v=p.map((n,i)=>n-a[i]);return [dot(v,along)/2,dot(v,up)/2];};
    roofTriangle(m,a,b,c,[...st(a),...st(b),...st(c)]);roofTriangle(m,a,c,d,[...st(a),...st(c),...st(d)]);
  }
  function ridge(a,b){
    const dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz);if(length<.06)return;
    const nx=-dz*.075/length,nz=dx*.075/length;
    const edge=(p,s)=>[p[0]+s*nx,p[1]+.027+(.072*(1-Math.abs(s))),p[2]+s*nz];
    face(tile,edge(a,-1),edge(b,-1),edge(b,0),edge(a,0),length/2,.12);
    face(tile,edge(a,0),edge(b,0),edge(b,1),edge(a,1),length/2,.12);
  }
  function box(f,u,v,w,length,depth,height,m){
    const g=(i,y,j)=>f(u+i,y,w+j);block(g,length,depth,v,v+height,m,m);
  }
  function localFrame(u,v,angle=0){
    const ax=Math.cos(angle),az=Math.sin(angle);
    return (i,y,j)=>point(u+ax*i-az*j,y,v+az*i+ax*j);
  }
  function ring(f,length,width,y){
    return [[-length/2,-width/2],[length/2,-width/2],[length/2,width/2],[-length/2,width/2]].map(([u,v])=>f(u,y,v));
  }
  function eaves(f,l,d,y,offset=.23){
    const a=ring(f,l-.24,d-.24,y-.23),b=ring(f,l,d,y-.03),c=ring(f,l,d,y+offset);
    for(let i=0;i<4;i++){const j=(i+1)%4;face(wallShadow,a[i],a[j],b[j],b[i]);face(copper,b[i],b[j],c[j],c[i]);}
  }
  function hip(f,l,d,y,rise,plateau=.05){
    const a=ring(f,l,d,y),small=ring(f,Math.max(.03,l*plateau),Math.max(.03,d*plateau),y+rise);
    for(let i=0;i<4;i++){const j=(i+1)%4;roofQuad(tile,a[i],a[j],small[j],small[i]);ridge(a[i],small[i]);}
    roofQuad(plateau>.25?membrane:tile,...small);
    eaves(f,l,d,y-.04,.06);
  }
  const floors=[562,564.72,568.07,571.45,574.85,578.23,581.64,585.02,588.35,591.64,594.13];
  function wallSide(a,b,bottom,top,bayWidth,seed=0){
    const dx=b[0]-a[0],dz=b[2]-a[2],count=Math.max(1,Math.round(Math.hypot(dx,dz)/bayWidth));
    for(let k=0;k<floors.length-1;k++){
      const low=Math.max(floors[k],bottom),high=Math.min(floors[k+1],top);if(high<=low)continue;
      for(let i=0;i<count;i++){
        const start=i/count,end=(i+1)/count,span=floors[k+1]-floors[k];
        const here=(f,y)=>[a[0]+f*dx,y,a[2]+f*dz];
        const cell=(seed+i+k*3)%8,st=(u,y)=>[.5+.25*((cell%2)+.006+.988*u),1-.25*(Math.floor(cell/2)+.995-.99*(y-floors[k])/span)];
        mapped(frontage,here(start,low),here(end,low),here(end,high),here(start,high),[st(0,low),st(1,low),st(1,high),st(0,high)]);
      }
    }
  }
  function chamber(f,l,d,top,skip=-1,bottom=562,bays=3.8){
    const r=ring(f,l,d,top);
    for(let i=0;i<4;i++)if(i!==skip)wallSide(r[i],r[(i+1)%4],bottom,top,bays,i);
  }
  const body=localFrame(17.55,-3.12);
  chamber(body,59.9,13.12,585.14,1);
  // The roof between the court towers has two terracotta slopes and a narrow
  // flat membrane running the length of the building. Lower gabled dormers
  // spring directly out of the slopes on the park and carriage sides.
  const main=localFrame(11.1,-3);
  const low=ring(main,49.5,15.35,585.22),cap=ring(main,49.5,4.2,589.15);
  roofQuad(tile,low[0],low[1],cap[1],cap[0]);roofQuad(tile,low[2],low[3],cap[3],cap[2]);roofQuad(membrane,...cap);
  for(const sign of [-1,1])for(const u of [-7.7,7.8,14.4,28.9]){
    const f=localFrame(u,-3+sign*5.77);chamber(f,3.45,3.2,588.18,-1,585.1,4.6);
    hip(f,3.87,3.7,588.2,1.15,.075);
  }
  const rear=localFrame(-12.7,3.9,.508);
  chamber(rear,18.3,17.1,585.78);hip(rear,18.95,17.7,585.84,3.15,.22);
  const end=localFrame(40.98,-3.02);
  chamber(end,13.25,14.28,585.26,1);hip(end,14.2,15.0,585.28,6.64,.43);
  for(const side of [-1,1])for(const along of [-4.5,.08,4.65]){
    const f=localFrame(41+along,-3.0+side*5.65);chamber(f,3.35,3.0,588.86,-1,584.9,4.6);
    hip(f,3.77,3.55,588.93,1.85,.06);
  }
  // Centers, bearings and hip slopes of all eight towers were independently
  // fitted to first returns from the 2015 laser survey. Sizes include the
  // lowest part of the eave just below the fitted top-plane samples.
  const towers=[
    [-13.444,-3.148,.495,8.88,8.34,593.47,596.645],[-18.676,6.495,.516,8.26,7.83,591.26,594.279],
    [-9.799,11.407,.506,8.23,7.75,591.26,594.276],[1.436,-9.029,.004,7.87,7.81,591.29,594.109],
    [1.435,3.172,-.001,7.90,7.96,591.27,594.085],[22.590,-7.328,.005,8.23,8.17,591.29,593.988],
    [22.552,1.388,.008,7.92,7.94,591.28,594.077],[32.598,-3.891,-.018,6.94,5.43,594.06,595.881]
  ];
  for(const [u,v,angle,l,d,y,peak] of towers){
    const f=localFrame(u,v,angle),high=y-.2;
    chamber(f,l-1.2,d-1.2,high,-1,562,4.6);
    hip(f,l,d,y,peak-y,.015);
    // Paired brackets under the broad hipped eave are legible against stucco.
    for(const side of [-1,1])for(const k of [-.31,-.22,.22,.31]){
      box(f,l*k,high-.62,side*(d-.96)/2,.14,.34,.64,copper);
      box(f,side*(l-.96)/2,high-.62,d*k,.34,.14,.64,copper);
    }
    box(f,0,high-1.97,0,l-1.04,d-1.06,.115,copper);
  }

  // The photographer stood across Gloriette looking almost directly at the
  // front. Its surveyed balconies and paired projecting three-window bays
  // receive the rectified frontage rather than a camera-facing photograph.
  const frontY=pixel=>564.78+(888-pixel)*.03855;
  const frontV=pixel=>4.12-(pixel-315)*14.93/335;
  function facade(xPixel,yPixel,depth){return point(depth,frontY(yPixel),frontV(xPixel));}
  function facePanel(x0,x1,y0,y1,d0,d1){
    mapped(frontage,facade(x0,y1,d0),facade(x1,y1,d1),facade(x1,y0,d1),facade(x0,y0,d0),
      [uv(x0,y1),uv(x1,y1),uv(x1,y0),uv(x0,y0)]);
  }
  // On the long flanks the wall is set behind the eaves. Full-height angled
  // window bays project toward the lawn and brook beneath the roof dormers.
  for(const side of [-1,1])for(const centerU of [8.4,15.3,29.0,38.7,44.0]){
    const baseV=-3.12+side*6.56,outer=baseV+side*.59;
    const verts=[[centerU-2.07,baseV],[centerU-1.43,outer],[centerU+1.43,outer],[centerU+2.07,baseV]];
    for(let i=0;i<3;i++){
      const a=point(verts[i][0],562,verts[i][1]),b=point(verts[i+1][0],562,verts[i+1][1]);
      if(i===1)wallSide(a,b,562,584.86,3.0,6);
      else face(stucco,a,b,[b[0],584.86,b[2]],[a[0],584.86,a[2]]);
    }
    for(const y of [568.02,571.41,574.8,578.18,581.59,584.81]){
      const f=localFrame(centerU,outer);
      box(f,0,y,side*.027,3.03,.16,.075,ledge);
    }
    const left=point(centerU-2.05,585.03,baseV),right=point(centerU+2.05,585.03,baseV);
    roofQuad(tile,left,right,point(centerU+1.49,584.91,outer+side*.065),point(centerU-1.49,584.91,outer+side*.065));
  }
  const frontProfile=[[315,47.08],[333,47.23],[348,47.79],[422,47.79],[439,47.21],[447,47.03],[515,47.03],[526,47.22],[539,47.79],[610,47.79],[627,47.21],[650,47.08]];
  for(let i=1;i<frontProfile.length;i++){
    const [x0,d0]=frontProfile[i-1],[x1,d1]=frontProfile[i];
    facePanel(x0,x1,280,892,d0,d1);
  }
  const facadeDepth=x=>{
    const i=frontProfile.findIndex(p=>p[0]>=x),a=frontProfile[Math.max(0,i-1)],b=frontProfile[i];
    return a[1]+(b[1]-a[1])*(x-a[0])/Math.max(.01,b[0]-a[0]);
  };
  // The historical color transparency supplies the sash. A separate thin
  // glazing face catches the actual moving Dixville sky as the eagle banks.
  for(const [y0,y1] of [[384,423],[466,501],[542,580],[626,666],[711,752],[801,855]]){
    for(const [xc,width] of [[360,11.2],[391,21.2],[425,10.6],[537,10.8],[569,21.6],[606,11.1]]){
      const l=xc-width/2,r=xc+width/2,dl=facadeDepth(l)+.016,dr=facadeDepth(r)+.016;
      face(glass,facade(l,y1,dl),facade(r,y1,dr),facade(r,y0,dr),facade(l,y0,dl));
      const sill=localFrame(facadeDepth(xc)+.04,frontV(xc));
      box(sill,.02,frontY(y1)-.044,0,.14,(width+4)*14.93/335,.064,ledge);
    }
  }
  function gable(center){
    const offset=center-382;
    const outline=[[337,345],[337,286],[342,282],[342,254],[350,244],[353,240],[353,231],[361,229],[362,224],[367,221],[369,214],[375,209],[378,196],[383,193],[391,197],[395,211],[402,217],[402,223],[408,229],[412,230],[412,236],[420,242],[426,247],[430,253],[430,282],[437,284],[437,345]];
    for(let i=1;i<outline.length;i++){
      const [ax,ay]=outline[i-1],[bx,by]=outline[i],x=ax+offset,x2=bx+offset;if(x===x2)continue;
      const heel=345,front=47.82,back=47.50;
      mapped(frontage,facade(x,heel,front),facade(x2,heel,front),facade(x2,by,front),facade(x,ay,front),[uv(x,heel),uv(x2,heel),uv(x2,by),uv(x,ay)]);
      face(copper,facade(x,ay,front),facade(x2,by,front),facade(x2,by,back),facade(x,ay,back));
    }
  }
  gable(382);gable(565);
  const centralDormer=localFrame(46.53,frontV(477));
  box(centralDormer,0,frontY(252),0,1.55,3.14,frontY(216)-frontY(252),stucco);
  hip(centralDormer,2.24,3.70,frontY(216),frontY(194)-frontY(216),.025);
  // The dormer's horizontal louver and vertical reveal come directly from
  // the same archival view as the paired gables. The roof is fully modeled.
  facePanel(442,512,216,252,47.317,47.317);
  const center=localFrame(47.05,frontV(482));
  for(const py of [445,523,603,691,770]){
    const y=frontY(py),length=3.05;
    box(center,.36,y-.13,0,.81,length,.13,ledge);
    box(center,.73,y+.78,0,.048,length,.047,iron);
    box(center,.73,y+.35,0,.034,length,.032,iron);
    for(let r=-1.46;r<=1.47;r+=.21)box(center,.73,y,r,.031,.029,.80,iron);
    for(const s of [-1,1])box(center,.38,y+.78,s*1.5,.76,.044,.047,iron);
  }
  const portico=localFrame(47.54,frontV(483));hip(portico,1.7,2.8,frontY(811),.64,.03);
  for(const side of [-1,1])box(portico,.55,564.7,side*1.08,.10,.13,frontY(811)-564.7,copper);
  const mast=point(32.598,601.06,-3.891);
  box(localFrame(32.598,-3.891),0,595.81,0,.082,.082,5.25,stucco);
  return function roofAt(x,z){
    if(x< -217||x> -122||z< -369||z> -275)return -Infinity;
    if(Math.hypot(x-mast[0],z-mast[2])<.13)return mast[1];
    const bin=roofing.get(Math.floor(x/roofCell)+65536*Math.floor(z/roofCell));let y=-Infinity;
    for(const {a,b,c,det} of bin||[]){
      const i=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/det;
      const j=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/det;
      if(i>=-.001&&j>=-.001&&i+j<=1.001)y=Math.max(y,i*a[1]+j*b[1]+(1-i-j)*c[1]);
    }
    return y;
  };
};

// The general Dixville atlas includes the shadows of buildings and trees where
// the ground should show gravel or turf. Replace only the georeferenced park
// colors. The existing regional light, sun and live canopy shadow still apply.
window.finishBalsamsGround=function(material,texture){
  material.uniforms.balsamsParkland={value:texture('hampshire-parkland.webp')};
  const before='float skyView=occ.g,relief=';
  material.fragmentShader='uniform sampler2D balsamsParkland;\n'+material.fragmentShader.replace(before,`
    bool atHotel=xz.x> -380.&&xz.x< -68.&&xz.y> -432.&&xz.y< -172.;
    bool atHale=xz.x>=-68.&&xz.x<112.&&xz.y> -304.&&xz.y< -179.;
    if(atHotel||atHale){
      vec2 pixel=atHotel?(xz-vec2(-380.,-432.))*3.:(xz-vec2(-68.,-304.))*3.+vec2(0.,784.);
      vec4 park=texture2D(balsamsParkland,vec2(pixel.x/936.,1.-pixel.y/1160.));
      if(park.a>0.){
        float gravel=1.-smoothstep(.046,.105,park.g-park.b);
        vec2 yardUV=mat2(.91,.416,-.416,.91)*xz*.39;
        vec4 sward=soilCapture(sod,yardUV,6.);
        vec4 grit=soilCapture(sod,yardUV*1.53+vec2(.37,.16),10.);
        vec4 surface=mix(sward,grit,gravel);
        float fine=.78+.72*lum(surface.rgb)+.24*(surface.a-.50);
        float local=1.-smoothstep(65.,210.,d);
        vec3 pigment=park.rgb*(1.+local*(fine-1.))+local*.11*(surface.rgb-vec3(lum(surface.rgb)));
        c=mix(c,pigment,park.a);
      }
    }
    float skyView=occ.g,relief=`);
};
