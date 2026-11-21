// Keene's rooflines, downtown façades and street furniture are separate from the aerial ground texture.
window.makeKeeneCity = function makeKeeneCity(T, scene, {height}) {
  const data = window.KEENE_CITY;
  const groups = new Map(), roofs = new Map(), loader = new T.TextureLoader();
  const layout = {
    brick: {file:'keene-brick.webp', normal:'keene-brick-normal.webp', roughness:.9},
    siding: {file:'building-clapboard.webp', roughness:.91},
    shingle: {file:'lakeside-roof.webp', roughness:.92},
    roofing: {file:'lakeside-metal.webp', roughness:.87},
    roofPhoto: {file:'atlas-surry-city-detail.webp', roughness:.91},
    streetPhoto: {file:'keene-downtown-ortho.webp', roughness:.91},
    carPaint: {roughness:.32,metalness:.16},
    grassMedian: {file:'shore-meadow.webp',roughness:.95},
    autoGlass: {roughness:.18,metalness:.22},
    masonry: {file:'keene-concrete.webp', roughness:.92},
    asphalt: {file:'keene-asphalt.webp', roughness:.98},
    smooth: {roughness:.76},
    glass: {roughness:.24},
    churchBoards: {roughness:.82},
    marquee: {roughness:.5}
  };
  const detail=window.makeBuildingFittings(T,scene);
  const cellSize = 54;
  const color = value => new T.Color(value);
  const clearRoof = (ring, top) => {
    const x = ring.map(p=>p[0]), z = ring.map(p=>p[1]);
    for(let j=Math.floor(Math.min(...z)/cellSize);j<=Math.floor(Math.max(...z)/cellSize);j++)
      for(let i=Math.floor(Math.min(...x)/cellSize);i<=Math.floor(Math.max(...x)/cellSize);i++){
        const key=i*1024+j;
        if(!roofs.has(key))roofs.set(key,[]);
        roofs.get(key).push({ring, top});
      }
  };
  function face(kind, tint, points, uv){
    const origin=points[0], bucket=Math.floor(origin[0]/850)*1024+Math.floor(origin[2]/850);
    const key=kind+bucket;
    if(!groups.has(key))groups.set(key,{kind,pos:[],uv:[],rgb:[]});
    const b=groups.get(key);
    for(const k of points.length===4?[0,1,2,0,2,3]:[0,1,2]){
      b.pos.push(...points[k]);
      b.uv.push(...(uv?.[k]||[0,0]));
      const rgb=Array.isArray(tint)?tint[k]:tint;
      b.rgb.push(rgb.r,rgb.g,rgb.b);
    }
  }
  function horizontal(kind,tint,ring,y,tile=2) {
    const points=ring.map(p=>new T.Vector2(...p));
    for(const triangle of T.ShapeUtils.triangulateShape(points,[])){
      const corners=triangle.map(i=>ring[i]);
      const uv=corners.map(([x,z])=>kind==='streetPhoto'?[(x-1640)/640,1-(z-4210)/720]:kind==='roofPhoto'?[.5+(x-1930)/2900,.5-(z-4400)/2900]:[x/tile,z/tile]);
      face(kind,tint,corners.map(([x,z])=>[x,y,z]),uv);
    }
  }
  function rectangle(x,z,dx,dz,l,w){
    return [[-l,-w],[l,-w],[l,w],[-l,w]].map(([a,b])=>[x+dx*a-dz*b,z+dz*a+dx*b]);
  }
  function wall(kind,tint,a,b,base,top,tile=1) {
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    face(kind,tint,[a,b,b,a].map(([x,z],i)=>[x,i<2?base:top,z]),[[0,0],[length/tile,0],[length/tile,(top-base)/tile],[0,(top-base)/tile]]);
  }
  const white=color(0xe5e1ce), trim=color(0xb4aa94), black=color(0x282c29);
  const buildingColors=[0xeadbc3,0xb9967c,0xbeb2a9,0xb4a69a,0xe1d4b1];
  const brickColors=[0xffffff,0xe3bfaa,0xe7bcad,0xddc6ab,0xf2eadb,0xd9b597];
  const shopColors=[0x262e29,0x45392d,0x594735,0x445556,0x713e36,0x424831];
  const roofColors=[0x776d63,0x8f7e72,0x93877d,0x7d8288,0x838683];
  const avenueX=z=>1889+.16*(z-4423);
  const drawFrontage=window.makeKeeneFrontages(T,{layout,face,clearRoof});
  const colony=window.addKeeneColonyBlock(T,{layout,face,height});
  function storefront(a,b,x,z,base,top,value,kind){
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(length<4)return;
    const dx=(b[0]-a[0])/length,dz=(b[1]-a[1])/length;
    const side=Math.sign((a[0]-x)*dz-(a[1]-z)*dx);
    const nx=side*dz,nz=-side*dx;
    const y=top-base;
    const point=(along,level,out)=>[a[0]+dx*along+nx*out,base+level,a[1]+dz*along+nz*out];
    const panel=(material,tint,l,r,h,k,o,uv)=>face(material,tint,[point(l,h,o),point(r,h,o),point(r,k,o),point(l,k,o)],uv);
    const moulding = color(0xb5aa92).lerp(white,value*.4);
    const shadow = color(0x37302b);
    const sash = color(shopColors[Math.floor(value*shopColors.length)]);
    panel('smooth',shadow,0,length,y-.45,y-.27,.052);
    panel('smooth',moulding,0,length,y-.22,y+.12,.105);
    if(kind==='theatre'&&Math.abs(dz)>.68&&nx>.1&&length>10){
      const half=Math.min(5.6,length*.33),m=length*.5,low=3.55,high=4.82,depth=1.48;
      panel('marquee',color(0xffffff),m-half,m+half,low,high,depth,[[0,0],[1,0],[1,1],[0,1]]);
      for(const s of [-1,1]){
        const edge=m+s*half;
        face('smooth',color(0x74462d),[point(edge,low,.04),point(edge,low,depth),point(edge,high,depth),point(edge,high,.04)]);
      }
      for(const level of [low,high])face('smooth',color(level===low?0xe5ac58:0x5d473e),[point(m-half,level,0),point(m+half,level,0),point(m+half,level,depth),point(m-half,level,depth)]);
    }
    if(y>5.4) {
      const levels=Math.max(1,Math.round((y-3.2)/3.05)), stride=(y-3.55)/levels;
      const count=Math.max(2,Math.round(length/3.24));
      for(let f=0;f<levels;f++){
        const h=3.75+f*stride,k=Math.min(y-.42,h+stride*.65);
        if(k-h<.66)continue;
        for(let i=0;i<count;i++){
          const midpoint=(i+.5)*length/count,w=Math.min(1.03,length/count*.53)*(.9+value*.18);
          const left=midpoint-w/2,right=midpoint+w/2;
          panel('smooth',moulding,left-.13,right+.13,h-.13,k+.1,.036);
          panel('glass',[black,black,color(0x647677),color(0x57636f)],left,right,h,k,.054);
          panel('smooth',sash,midpoint-.023,midpoint+.023,h,k,.067);
          panel('smooth',moulding,left-.2,right+.2,h-.18,h-.07,.095);
        }
      }
    }
    const frontsSquare=z<4425&&nx*(1899-x)+nz*(4386-z)>5;
    const frontsMain=z>=4425&&nx*(avenueX(z)-x)>8;
    if(length>5&&y>4.7&&(frontsSquare||frontsMain)){
      panel('smooth',sash,.2,length-.2,.18,2.9,.055);
      panel('smooth',moulding,.1,length-.1,2.91,3.16,.10);
      const count=Math.min(8,Math.ceil(length/2.8));
      for(let i=0;i<count;i++){
        const l=.2+(i+.14)*(length-.4)/count,r=.2+(i+.86)*(length-.4)/count;
        panel('glass',[color(0x292c27),color(0x292c27),color(0x7d8583),color(0x647575)],l,r,.48,2.61,.071);
        panel('smooth',sash,l,r,1.52,1.57,.083);
      }
      if(kind!=='theatre'&&value<.43){
        const l=.36,r=length-.36;
        face('smooth',sash,[point(l,3.06,.06),point(r,3.06,.06),point(r,2.75,.96),point(l,2.75,.96)]);
        panel('smooth',sash,l,r,2.59,2.75,.96);
      }
    }
  }
  function sideWindows(a,b,x,z,base,top,style,feel){
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(length<4.8)return;
    const dx=(b[0]-a[0])/length,dz=(b[1]-a[1])/length;
    const side=Math.sign((a[0]-x)*dz-(a[1]-z)*dx);
    const nx=side*dz,nz=-side*dx;
    const point=(along,level,out)=>[a[0]+dx*along+nx*out,base+level,a[1]+dz*along+nz*out];
    const panel=(tint,l,r,h,k,o,kind='smooth')=>face(kind,tint,[point(l,h,o),point(r,h,o),point(r,k,o),point(l,k,o)]);
    const count=Math.min(18,Math.max(1,Math.round(length/(style==='house'?4.25:4.96))));
    const border=color(0xb6afa0), lower=color(0x393e3f), upper=color(0x76817c);
    const units=top-base>6.5&&style!=='house'&&feel<.69?2:1;
    const step=style==='house'?1.49:2.13;
    for(let n=0;n<units;n++){
      const low=(style==='house'?1.26:1.43)+n*3.04,high=Math.min(top-base-.59,low+step);
      if(high-low<.66)continue;
      for(let j=0;j<count;j++){
        const center=(j+.5)*length/count,w=style==='house'?1.17:1.35+feel*1.52;
        if(style==='hall'&&(j+Math.round(feel*12))%9===0)continue;
        panel(border,center-w*.5-.11,center+w*.5+.11,low-.1,high+.097,.038);
        panel([lower,lower,upper,upper],center-w*.5,center+w*.5,low,high,.058,'glass');
        panel(border,center-.032,center+.032,low,high,.073);
      }
    }
    if(style==='hall'){
      panel(color(0x847f74),0,length,top-base-.29,top-base-.11,.055);
      panel(border,0,length,top-base-.17,top-base+.04,.074);
    }
  }
  function roofGable(ring, base, peak, tint) {
    // Build the ridge along the long side of the surveyed rectangle.
    const length=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
    const j=length(ring[0],ring[1])>=length(ring[0],ring[3])?1:3;
    const [a,b,c,d]=[ring[0],ring[j],ring[2],ring[4-j]];
    const e=[(a[0]+d[0])/2,peak,(a[1]+d[1])/2],f=[(b[0]+c[0])/2,peak,(b[1]+c[1])/2];
    const fp=p=>[p[0],base,p[1]], l=length(a,b), w=.5*length(a,d);
    for(const [u,v] of [[a,b],[d,c]])
      face('shingle',tint,[fp(u),fp(v),f,e],[[0,0],[l/3,0],[l/3,w/3],[0,w/3]]);
    for(const [u,v,r] of [[a,d,e],[b,c,f]])
      face('smooth',tint,[fp(u),fp(v),r]);
  }
  function circle(x,z,r,points) {
    return Array.from({length:points},(_,i)=>[x+r*Math.cos(i/points*Math.PI*2),z+r*Math.sin(i/points*Math.PI*2)]);
  }
  function frustum(kind,tint,a,b,y1,y2){
    for(let i=0;i<a.length;i++){
      const j=(i+1)%a.length;
      face(kind,tint,[[...a[i]],a[j],b[j],b[i]].map(([x,z],k)=>[x,k<2?y1:y2,z]));
    }
  }
  // Surveyed front axis and the south elevation of the United Church of Christ.
  // The 1859–1860 work created an attached Corinthian facade, paired columns,
  // the arched lights and the tower that closes the long view up Main Street.
  function church(base) {
    const cx=1892.7,cz=4334.5,axis=.193,co=Math.cos(axis),si=Math.sin(axis);
    const at=(u,h,d)=>[cx+u*co+d*si,base+h,cz-u*si+d*co];
    const point=(u,d)=>{const p=at(u,0,d);return [p[0],p[2]];};
    const facade=color(0xe9e9de),trim=color(0xf3f0e7),joint=color(0xb6b8b0),shadow=color(0x757c7a);
    const glass=color(0x34494c),sill=color(0xc9c9bc),onyx=color(0x272d2d);
    const nave=[[1877.2,4307.2],[1895.7,4303.5],[1902.4,4335.0],[1884.1,4338.7]];
    roofGable(nave,base+10.34,base+14.2,color(0x929496));clearRoof(nave,base+14.2);
    const sq=r=>rectangle(cx,cz,co,-si,r,r),oct=r=>circle(cx,cz,r,8);
    function box(u,d,l,w,lo,hi,tone){
      const [x,z]=point(u,d),corners=rectangle(x,z,co,-si,l*.5,w*.5);
      frustum('smooth',tone,corners,corners,base+lo,base+hi);horizontal('smooth',tone,corners,base+hi);
    }
    function panel(plane,left,right,lo,hi,dep,tone,mat='smooth'){
      face(mat,tone,[plane(left,lo,dep),plane(right,lo,dep),plane(right,hi,dep),plane(left,hi,dep)]);
    }
    function slat(plane,x1,y1,x2,y2,width,dep,tone){
      const l=Math.hypot(x2-x1,y2-y1),dx=(y2-y1)*width/(2*l),dy=(x1-x2)*width/(2*l);
      face('smooth',tone,[plane(x1-dx,y1-dy,dep),plane(x2-dx,y2-dy,dep),plane(x2+dx,y2+dy,dep),plane(x1+dx,y1+dy,dep)]);
    }
    function arch(plane,mid,lo,spring,r,dep,fill,frame,thick=.095){
      const fillKind=fill===glass?'glass':'smooth';
      panel(plane,mid-r,mid+r,lo,spring,dep,fill,fillKind);
      panel(plane,mid-r-thick,mid-r,lo,spring,dep+.018,frame);
      panel(plane,mid+r,mid+r+thick,lo,spring,dep+.018,frame);
      for(let i=0;i<16;i++){
        const a=Math.PI*i/16,b=Math.PI*(i+1)/16,P=(rad,angle,off)=>plane(mid+rad*Math.cos(angle),spring+rad*Math.sin(angle),dep+off);
        face(fillKind,fill,[plane(mid,spring,dep),P(r,a,0),P(r,b,0)]);
        face('smooth',frame,[P(r,a,.018),P(r+thick,a,.018),P(r+thick,b,.018),P(r,b,.018)]);
      }
    }
    // The tower's footprint reduces with each stage, also for flight clearance.
    const tower=[
      [9.8,16.35,3.55,3.55,facade,sq],[16.35,16.62,3.58,3.73,joint,sq],
      [16.62,16.98,3.75,3.82,trim,sq],[16.98,22.17,3.17,3.17,facade,sq],
      [22.17,22.48,3.24,3.36,sill,sq],[22.48,22.65,3.38,3.38,trim,sq],
      [22.65,27.91,2.62,2.58,facade,sq],[27.91,28.31,2.62,2.77,trim,sq],
      [28.31,30.39,2.40,1.75,facade,oct],[30.39,44.94,1.76,.147,color(0xa0a8a4),oct],
      [44.94,46.37,.18,.024,color(0xb0a98d),oct]];
    for(const [lo,hi,a,b,tone,shape] of tower){
      const first=shape(a),last=shape(b);frustum(tone===facade?'churchBoards':'smooth',tone,first,last,base+lo,base+hi);
      if(Math.abs(b-a)>.035)horizontal('smooth',tone,last,base+hi);
      clearRoof(first,base+hi);
    }
    for(let side=0;side<4;side++){
      const a=side*Math.PI*.5,ca=Math.cos(a),sa=Math.sin(a);
      const plane=(u,h,d)=>at(u*ca+d*sa,h,d*ca-u*sa);
      const disk=(r,mid,out,tone)=>{
        for(let k=0;k<32;k++){const a0=k*2*Math.PI/32,a1=(k+1)*2*Math.PI/32;
          face('smooth',tone,[plane(0,mid,out),plane(r*Math.cos(a0),mid+r*Math.sin(a0),out),plane(r*Math.cos(a1),mid+r*Math.sin(a1),out)]);}
      };
      disk(1.22,19.64,3.195,joint);disk(1.13,19.64,3.216,trim);disk(1.025,19.64,3.229,color(0xd9dbce));
      for(let i=0;i<60;i++){const theta=i*Math.PI/30,major=i%5===0,r=major?.79:.90;
        slat(plane,r*Math.sin(theta),19.64+r*Math.cos(theta),.965*Math.sin(theta),19.64+.965*Math.cos(theta),major?.062:.026,3.24,onyx);}
      slat(plane,0,19.64,-.52,19.95,.088,3.252,onyx);slat(plane,0,19.64,.05,20.43,.064,3.257,onyx);
      disk(.096,19.64,3.264,onyx);
      arch(plane,0,23.16,25.26,1.10,2.64,shadow,trim,.15);
      for(let k=0;k<10;k++){
        const lo=23.23+k*.28,high=lo+.102,rr=high<=25.26?1.06:Math.sqrt(Math.max(0,1.06**2-(high-25.26)**2));
        if(rr>.04)panel(plane,-rr,rr,lo,high,2.683,sill);
      }
      for(const u of [-2.30,2.30]){panel(plane,u-.11,u+.11,23.12,27.79,2.64,trim);panel(plane,u-.20,u+.20,27.58,27.76,2.67,sill);}
      panel(plane,-2.99,2.99,23.09,23.23,3.01,trim);
      for(let k=-8;k<=8;k++)panel(plane,k*.32-.033,k*.32+.033,22.65,23.14,3.01,trim);
      // Recessed joints and dentils on the clock stage.
      for(let j=0;j<4;j++)for(const u of [-2.78,2.78])panel(plane,u-.27,u+.27,17.46+j*.88,17.49+j*.88,3.189,joint);
    }
    const front=at;const middle=3.74,outer=2.40;
    // The front is painted horizontal weatherboard; the shallow attached
    // portico shades the backing around its column pairs and under the eaves.
    function cladding(left,right,lo,hi,dep){
      const ux=[left,left+.36,(left+right)*.5,right-.36,right],dy=[lo,lo+.33,hi-.74,hi-.19,hi];
      const shade=(u,h)=>{
        const post=Math.min(...[-8.93,-4.72,-3.45,3.45,4.72,8.93].map(p=>Math.abs(u-p)));
        return facade.clone().multiplyScalar(.965-.095*Math.exp(-post/.61)-.155*Math.exp(-(hi-h)/.35));
      };
      for(let i=1;i<ux.length;i++)for(let j=1;j<dy.length;j++){
        const corners=[[ux[i-1],dy[j-1]],[ux[i],dy[j-1]],[ux[i],dy[j]],[ux[i-1],dy[j]]];
        face('churchBoards',corners.map(p=>shade(...p)),corners.map(([u,h])=>front(u,h,dep)));
      }
    }
    cladding(-5.15,5.15,.18,10.95,middle);
    for(const side of [-1,1])cladding(side>0?5.16:-9.44,side>0?9.44:-5.16,.15,10.35,outer);
    // The central pediment has a deep horizontal return at each column pair.
    const pediment=(width,lo,hi,dep,tone)=>face(tone===facade?'churchBoards':'smooth',tone,[at(-width,lo,dep),at(width,lo,dep),at(0,hi,dep)]);
    pediment(9.66,10.04,14.08,outer+.09,facade);
    pediment(5.71,10.26,13.94,middle+.065,trim);pediment(5.27,10.35,13.62,middle+.085,facade);
    for(const side of [-1,1]){
      slat(front,0,13.96,side*5.74,10.26,.25,middle+.19,trim);
      slat(front,0,13.65,side*5.39,10.21,.066,middle+.191,sill);
      slat(front,0,14.13,side*9.78,10.10,.19,outer+.19,trim);
      for(let i=1;i<25;i++){const u=side*i*.215,h=13.62-Math.abs(u)*.646;panel(front,u-.042,u+.042,h-.107,h,middle+.134,joint);}
      for(const [u,l,dep] of [[side*4.35,2.35,middle+.18],[side*7.39,4.25,outer+.17]]){
        box(u,dep,l,.45,9.94,10.13,sill);box(u,dep,l+.15,.52,10.13,10.34,trim);
      }
    }
    // Paired fluted columns sit on substantial rusticated bases.
    function column(u,d,r){
      const [x,z]=point(u,d),local=(radius)=>Array.from({length:40},(_,i)=>{
        const a=i*Math.PI/20,r=radius*(i%2?.97:1.0);return [x+Math.cos(a)*r,z+Math.sin(a)*r];});
      for(const [lo,hi,bot,top,tone] of [[2.39,2.53,r*1.24,r*1.24,sill],[2.53,2.63,r*1.22,r,trim],
        [2.63,9.05,r,r*.85,facade],[9.05,9.18,r,r*1.16,joint],[9.18,9.57,r,r*1.31,trim]]){
        frustum('smooth',tone,local(bot),local(top),base+lo,base+hi);
      }
      for(let k=0;k<8;k++){
        const v=k*Math.PI/4,delta=.12;const xy=(r,h,theta)=>[x+Math.cos(theta)*r,base+h,z+Math.sin(theta)*r];
        face('smooth',sill,[xy(r*.98,9.14,v-delta),xy(r*1.28,9.53,v),xy(r*.98,9.14,v+delta)]);
      }
      box(u,d,r*2.82,r*2.82,9.53,9.77,trim);
    }
    for(const side of [-1,1])for(const [u,r,d] of [[3.45,.39,middle+.34],[4.72,.38,middle+.27],[8.93,.35,outer+.26]]){
      const pos=side*u;box(pos,d,1.28,.84,.15,2.40,facade);
      for(let h=.46;h<2.39;h+=.405){panel(front,pos-.61,pos+.61,h,h+.025,d+.427,joint);}
      box(pos,d,1.43,.94,2.30,2.46,trim);column(pos,d,r);
    }
    // Central paired lancets and oculus under the round hood, with two tall
    // aisle windows and the smaller paired openings on the lower vestibule.
    arch(front,0,5.11,8.04,1.09,middle+.08,joint,trim,.14);
    for(const u of [-.49,.49]){
      arch(front,u,5.16,8.00,.432,middle+.11,glass,trim,.043);
      for(let j=0;j<4;j++)panel(front,u-.423,u+.423,5.63+j*.61,5.66+j*.61,middle+.19,sill);
      panel(front,u-.019,u+.019,5.16,8.29,middle+.19,sill);
    }
    arch(front,0,8.59,8.66,.23,middle+.125,onyx,trim,.045);
    for(const side of [-1,1]){
      const mid=side*6.63;arch(front,mid,5.22,8.05,.73,outer+.064,glass,trim,.14);
      for(let h=5.62;h<8.45;h+=.61)panel(front,mid-.69,mid+.69,h,h+.045,outer+.17,trim);
      panel(front,mid-.022,mid+.022,5.23,8.66,outer+.17,trim);
      for(const u of [-.26,.26])arch(front,mid+u,3.35,4.04,.18,outer+.08,glass,trim,.063);
      arch(front,mid,.11,1.88,.61,outer+.06,facade,sill,.085);
      for(const u of [-.20,.20])arch(front,mid+u,.64,1.65,.115,outer+.11,glass,trim,.023);
    }
    arch(front,0,.15,2.02,1.34,middle+.14,glass,trim,.17);
    for(let j=0;j<9;j++){const a=(j+1)*Math.PI/10;slat(front,0,2.02,1.31*Math.cos(a),2.02+1.31*Math.sin(a),.043,middle+.217,trim);}
    panel(front,-1.33,1.33,1.96,2.07,middle+.21,trim);
    for(const u of [-.69,0,.69])panel(front,u-.035,u+.035,.15,2.02,middle+.213,trim);
    for(const side of [-1,1]){
      const u=side*3.99;
      panel(front,u-.43,u+.43,.79,1.80,middle+.79,sill);
      panel(front,u-.36,u+.36,.88,1.73,middle+.802,color(0x594d38));
      for(let j=0;j<4;j++){const r=.20-.050*(j%2);panel(front,u-r,u+r,1.03+j*.134,1.043+j*.134,middle+.81,color(0xc2b58e));}
    }
    for(let j=0;j<3;j++)box(0,4.07+j*.35,3.65,.53,0,.30-.09*j,sill);
  }
  function inside(ring,x,z){
    let hit=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const [xi,zi]=ring[i],[xj,zj]=ring[j];
      if((zi>z)!==(zj>z)&&x<(xj-xi)*(z-zi)/(zj-zi)+xi)hit=!hit;
    }
    return hit;
  }
  const centerOf = ring => ring.reduce(([x,z],p)=>[x+p[0]/ring.length,z+p[1]/ring.length],[0,0]);
  for(const [ring,measured,kind] of data.buildings){
    const [x,z]=centerOf(ring);
    const lot=ring.reduce((sum,p,i)=>sum+p[0]*ring[(i+1)%ring.length][1]-p[1]*ring[(i+1)%ring.length][0],0)*.5;
    const feel=Math.abs(Math.sin(x*19.3+z*53.1)*4798)%1;
    const base=height(x,z), bottom=Math.min(base,...ring.map(([a,b])=>height(a,b)))-.65;
    const top=base+(kind==='church'?(measured||10.34):measured||(kind==='house'?3.7+feel*2.4:5.9+Math.min(4.8,Math.sqrt(Math.abs(lot))*.035)));
    const facade=kind==='brick'||kind==='theatre';
    const tint=kind==='church'?white:color((facade?brickColors:buildingColors)[Math.floor(feel*(facade?brickColors:buildingColors).length)]);
    const central=Math.hypot(x-1933,z-4530)<560;
    const wallKind=facade?'brick':kind==='house'?'siding':kind==='church'?'smooth':'masonry';
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length];
      // The municipal parcel merges three shops on a 57 m wall. Leave the
      // actual Colony frontage open so its recessed entries meet the sidewalk.
      if(a[0]===1938&&a[1]===4404.6&&b[0]===1948.9&&b[1]===4348.8){
        for(const [p,q] of [[a,colony.south],[colony.north,b]]){
          wall(wallKind,tint,p,q,bottom,top,1.58);
          storefront(p,q,x,z,base,top,feel,kind);
        }
        continue;
      }
      const southernParty=(
        a[0]===1970&&a[1]===4399.5&&b[0]===1940.3&&b[1]===4406.7||
        a[0]===1940.3&&a[1]===4406.7&&b[0]===1938&&b[1]===4404.6
      );
      wall(wallKind,southernParty?colony.partyTint:tint,a,b,bottom,top,wallKind==='brick'?1.58:wallKind==='siding'?5.7:3.8);
      if(facade&&drawFrontage(a,b,base,top))continue;
      if(facade)storefront(a,b,x,z,base,top,feel,kind);
      if(central&&(kind==='hall'||kind==='house'))sideWindows(a,b,x,z,base,top,kind,feel);
    }
    const roofTint=color(roofColors[Math.floor(feel*roofColors.length)]);
    let peak=top;
    if(kind==='house'){
      peak=top+2.25+feel*1.24;
      roofGable(ring,top,peak,roofTint);
      if(ring.length===4){
        // Woodsheds and small garages usually do not have a brick flue.
        const footprint=Math.abs(lot),eave=top-base;
        const flue=footprint>72&&feel>.23,roofPeak=peak;
        if(flue&&inside(ring,x,z))clearRoof(rectangle(x,z,1,0,.53,.51),roofPeak+1.12);
        detail(x,z,(box,sash)=>{
          if(flue){
            box(x,roofPeak-.04,z,1,0,.84,1.98,.89,0x936751);
            box(x,roofPeak+.96,z,1,0,1.01,.16,1.01,0xb8afa1);
            box(x,roofPeak+1.08,z,1,0,.39,.15,.41,0x745d4d);
          }
          for(let i=0;i<ring.length;i++){
            const a=ring[i],b=ring[(i+1)%ring.length],w=Math.hypot(b[0]-a[0],b[1]-a[1]);if(w<2)continue;
            const dx=(b[0]-a[0])/w,dz=(b[1]-a[1])/w;
            const dir=(a[0]-x)*(-dz)+(a[1]-z)*dx>0?1:-1;
            box((a[0]+b[0])*.5,top-.08,(a[1]+b[1])*.5,dx,dz,w+.20,.20,.26,0xd6d2c2);
            if(central)continue;
            const count=Math.max(1,Math.floor(w/3.8));
            for(let j=0;j<count;j++){
              const t=(j+.5)/count;
              sash(a[0]+(b[0]-a[0])*t-dir*dz*.073,base+Math.min(eave*.52,2.25),a[1]+(b[1]-a[1])*t+dir*dx*.073,dir*dx,dir*dz,1.32,1.49,0xd6d1bd,0x4b5353);
            }
          }
        });
      }
    }else {
      if(Math.max(Math.abs(x-1930),Math.abs(z-4400))<1360){
        const closePhoto=ring.every(([x,z])=>x>1642&&x<2278&&z>4212&&z<4928);
        horizontal(closePhoto?'streetPhoto':'roofPhoto',color(0xdedbd6),ring,top);
      }else horizontal('roofing', roofTint, ring, top, 5);
      if(facade){
        // Low parapets and dark coping give the Main Street roofline its depth.
        for(let i=0;i<ring.length;i++){
          const a=ring[i],b=ring[(i+1)%ring.length],c=[a[0]+(x-a[0])*.008,a[1]+(z-a[1])*.008],
            d=[b[0]+(x-b[0])*.008,b[1]+(z-b[1])*.008];
          wall(kind==='theatre'?'masonry':'brick',kind==='theatre'?color(0xdbc9a8):tint,a,b,top-.02,top+.58,1.58);
          wall('masonry',trim,c,d,top-.012,top+.58,2.0);
          horizontal('masonry',trim,[a,b,d,c],top+.58,2);
        }
        peak=top+.58;
      }else if(kind==='church')church(base);
      if(central&&kind!=='church'&&Math.abs(lot)>620){
        const count=feel<.5?2:3;
        for(let i=0;i<count;i++){
          const equipment=rectangle(x+(i-count/2)*4.7,z+(feel-.5)*4,1,0,1.36+feel,.83+feel*.4);
          if(equipment.every(([a,b])=>inside(ring,a,b))){
            const level=top+.63+feel*.51, tint=color(0x9a9a92);
            for(let j=0;j<4;j++)wall('masonry',tint,equipment[j],equipment[(j+1)%4],top,level,3);
            horizontal('roofing',tint,equipment,level,2);
            const [cx,cz]=centerOf(equipment),radius=.45+feel*.13;
            const curb=circle(cx,cz,radius,16),throat=circle(cx,cz,radius*.85,16);
            frustum('smooth',color(0xb6b2a7),curb,curb,level+.018,level+.12);
            horizontal('smooth',color(0x343c3b),throat,level+.125);
            for(let blade=0;blade<5;blade++){
              const t=blade*Math.PI*2/5,bladePt=(r,a)=>[cx+r*Math.cos(a),level+.13,cz+r*Math.sin(a)];
              face('smooth',color(0x78817e),[bladePt(.08,t),bladePt(radius*.73,t+.33),bladePt(radius*.72,t+.76),bladePt(.08,t+.45)]);
            }
            const latch=rectangle(cx+(i%2?.9:-.9),cz,1,0,.23,.42);
            horizontal('smooth',color(0xb2aaa0),latch,level+.035);
            // Dark recessed louvers are visible in the vertical side of the unit.
            for(let side=0;side<2;side++){
              const a=equipment[side*2],b=equipment[(side*2+1)%4];
              const a1=[a[0]*.83+b[0]*.17,a[1]*.83+b[1]*.17+(side?-.015:.015)],b1=[b[0]*.84+a[0]*.16,b[1]*.84+a[1]*.16+(side?-.015:.015)];
              for(let row=0;row<4;row++)wall('smooth',black,a1,b1,top+.16+row*.115,top+.216+row*.115);
            }
            clearRoof(equipment,level);
          }
        }
      }
    }
    // Back-wall flues punctuate the older brick blocks above the shop cornices.
    if(central&&facade&&Math.abs(lot)>85&&feel>.19){
      const ordered=ring.slice().sort((a,b)=>Math.abs(b[0]-avenueX(b[1]))-Math.abs(a[0]-avenueX(a[1])));
      const p=ordered[0],cx=x*.30+p[0]*.70,cz=z*.30+p[1]*.70;
      const foot=rectangle(cx,cz,1,0,.71,.50);
      if(foot.every(([u,v])=>inside(ring,u,v))){
        const shoulder=top+1.55+feel*.52;
        const brick=color(0xe5c2ac),coping=color(0xb6ada0);
        for(let i=0;i<4;i++)wall('brick',brick,foot[i],foot[(i+1)%4],top,shoulder,1.48);
        const lip=rectangle(cx,cz,1,0,.83,.63);
        for(let i=0;i<4;i++)wall('masonry',coping,lip[i],lip[(i+1)%4],shoulder-.08,shoulder+.13,1);
        horizontal('smooth',coping,lip,shoulder+.13);
        for(const offset of [-.36,.36]){
          const pot=circle(cx+offset,cz,.22,8),bore=circle(cx+offset,cz,.16,8);
          frustum('smooth',color(0x955e48),pot,pot,shoulder+.13,shoulder+.48);
          horizontal('smooth',black,bore,shoulder+.481);
        }
        clearRoof(lip,shoulder+.49);
      }
    }
    clearRoof(ring,peak);
  }

  const brass=color(0x8e8a65);
  window.addKeeneStreetscape({T,data,height,face,clearRoof});

  // Central Square's gazebo, fountain and Soldiers' Monument are three-dimensional.
  {
    const x=1881.5,z=4371.5,base=height(x,z)+.68;
    const rim=circle(x,z,3.1,8),roof=circle(x,z,3.6,8);
    horizontal('masonry',white,rim,base+.48);
    frustum('masonry',trim,rim,rim,base,base+.48);
    frustum('shingle',color(0x8a5d48),roof,circle(x,z,.08,8),base+2.92,base+4.62);
    for(const [a,b] of rim){
      const pole=circle(a,b,.115,6);
      frustum('smooth',white,pole,pole,base+.43,base+3.01);
    }
    clearRoof(roof,base+4.62);
  }
  {
    const x=1894.1,z=4381.3,base=height(x,z)+.684;
    const rim=circle(x,z,2.25,16),inner=circle(x,z,1.95,16),center=circle(x,z,.45,9);
    frustum('masonry',white,rim,rim,base,base+.48);
    frustum('masonry',white,rim,inner,base+.48,base+.48);
    horizontal('glass',color(0x697d78),inner,base+.32);
    frustum('smooth',brass,center,center,base+.32,base+1.25);
    const bowl=circle(x,z,.94,12);
    frustum('smooth',brass,circle(x,z,.2,12),bowl,base+1.18,base+1.49);
    horizontal('glass',color(0x778780),bowl,base+1.47);
  }
  {
    // The city history gives a 13-foot Roxbury-granite pedestal and an
    // eight-foot bronze figure. Present the historical sculpture facing Main.
    const x=1897.6,z=4399.5,base=height(x,z)+.689;
    const granite=color(0xb8b5aa),edge=color(0xc5c1b4),bronze=color(0x505a4e),rubbed=color(0x737664),oxide=color(0x424c42);
    function pedestal(radius){return rectangle(x,z,1,0,radius,radius);}
    for(const [lo,hi,r1,r2,tone] of [[0,.20,1.53,1.53,granite],[.20,.31,1.53,1.37,edge],[.31,.64,1.27,1.27,granite],
      [.64,.80,1.27,1.11,edge],[.80,.94,1.11,1.07,granite],[.94,1.14,1.07,.91,edge],[1.14,3.40,.91,.89,granite],
      [3.40,3.53,.89,1.0,edge],[3.53,3.64,1.0,1.10,granite],[3.64,3.76,1.10,1.10,edge],[3.76,3.96,1.00,.80,granite]]){
      const a=pedestal(r1),b=pedestal(r2);
      for(let i=0;i<4;i++){
        const j=(i+1)%4,lower=k=>[a[k][0],base+lo,a[k][1]],upper=k=>[b[k][0],base+hi,b[k][1]];
        face('masonry',tone,[lower(i),lower(j),upper(j),upper(i)],[[0,lo],[2*r1,lo],[2*r2,hi],[0,hi]]);
      }
      if(r1!==r2||hi===3.96)horizontal('masonry',tone,b,base+hi,1.0);
    }
    // Recessed commemorative tablets on the faces of the granite die.
    for(let k=0;k<4;k++){
      const cs=Math.cos(k*Math.PI*.5),sn=Math.sin(k*Math.PI*.5);
      const p=(u,h,out)=>[x+u*cs+sn*out,base+h,z+out*cs-u*sn];
      const plaque=(w,lo,hi,out,tone)=>face('smooth',tone,[p(-w,lo,out),p(w,lo,out),p(w,hi,out),p(-w,hi,out)]);
      plaque(.661,1.31,3.24,.919,edge);plaque(.616,1.37,3.18,.926,oxide);
      for(let j=0;j<23;j++){const y=3.04-j*.061;for(const side of [-1,1]){
        const center=side*.277,w=.19-.07*(.5+.5*Math.sin(j*9+k+side));face('smooth',rubbed,
          [p(center-w,y,.931),p(center+w,y,.931),p(center+w,y+.009,.931),p(center-w,y+.009,.931)]);}}
    }
    const at=(u,h,d)=>[x+u,base+3.96+h,z+d];
    const ring=(u,h,d,rx,rz,n=14)=>Array.from({length:n},(_,i)=>{const a=2*Math.PI*i/n;return at(u+rx*Math.cos(a),h,d+rz*Math.sin(a));});
    function cast(rows,tone,n=14){
      const parts=rows.map(p=>ring(...p,n));
      for(let j=1;j<parts.length;j++){const a=parts[j-1],b=parts[j];for(let i=0;i<n;i++){const k=(i+1)%n;
        face('smooth',tone,[a[i],a[k],b[k],b[i]]);}}
      for(let i=1;i<n-1;i++)face('smooth',tone,[parts.at(-1)[0],parts.at(-1)[i],parts.at(-1)[i+1]]);
    }
    // Boots are separated by the relaxed stance. The greatcoat falls to the
    // knees and flares around the shallow folds seen in the library photograph.
    cast([[0,0,0,.70,.43],[0,.084,0,.67,.40]],oxide,8);
    for(const side of [-1,1]){const xx=side*.232,d=side<0?.09:-.045;
      cast([[xx,.084,d+.10,.13,.229],[xx,.17,d+.07,.14,.208],[xx,.235,d,.095,.102],
        [xx,.57,d-.05,.10,.106],[xx*.83,.88,d-.05,.145,.14],[xx*.65,1.04,0,.15,.15]],bronze);
    }
    cast([[0,.724,.005,.38,.225],[.005,.80,-.006,.36,.209],[.013,1.18,0,.29,.188],
      [0,1.39,-.018,.279,.205],[0,1.65,-.015,.36,.215],[0,1.85,0,.329,.174],
      [0,1.94,.021,.159,.123]],bronze,20);
    cast([[0,1.35,0,.285,.209],[0,1.399,0,.289,.210]],oxide,20);
    const dot=(u,h,d,rx,rz,ht,tone)=>cast([[u,h,d,rx*.6,rz*.65],[u,h+ht*.52,d,rx,rz],[u,h+ht,d,rx*.55,rz*.6]],tone,8);
    for(let i=0;i<6;i++)dot(.043,1.02+i*.147,.196,.023,.016,.030,rubbed);
    for(const sg of [-1,1]){
      const flaps=[at(sg*.12,1.3,.18),at(sg*.22,1.26,.16),at(sg*.28,1.31,.11),at(sg*.18,1.34,.16)];face('smooth',oxide,flaps);
      face('smooth',rubbed,[at(sg*.097,1.90,.113),at(sg*.28,1.8,.106),at(sg*.081,1.65,.194)]);
      face('smooth',oxide,[at(sg*.08,.739,.22),at(sg*.14,.75,.219),at(sg*.09,1.2,.187)]);
    }
    // Right arm bent to the chest; the left arm hangs beside the coat.
    cast([[-.297,1.43,.105,.091,.103],[-.391,1.53,.04,.118,.105],[-.383,1.70,-.018,.13,.133],[-.294,1.81,-.006,.143,.14]],bronze);
    cast([[-.332,1.43,.122,.10,.1],[-.229,1.57,.20,.10,.09],[-.153,1.68,.205,.084,.083]],bronze);
    cast([[.323,1.17,.13,.074,.079],[.342,1.28,.105,.088,.09],[.386,1.55,.025,.119,.130],[.319,1.78,-.006,.141,.14]],bronze);
    dot(-.12,1.63,.228,.101,.078,.121,rubbed);dot(.321,1.11,.142,.084,.078,.16,rubbed);
    cast([[.02,1.90,.038,.10,.10],[.021,2.028,.045,.112,.117],[.022,2.06,.052,.137,.143],
      [.015,2.19,.040,.154,.158],[.017,2.27,.034,.142,.138]],bronze);
    dot(.017,2.075,.180,.036,.045,.105,rubbed);
    for(const sg of [-1,1])dot(.018+sg*.144,2.105,.043,.03,.035,.089,bronze);
    cast([[.012,2.24,.056,.172,.166],[.012,2.273,.092,.181,.208],[.014,2.296,.033,.165,.153]],oxide);
    cast([[.014,2.280,.030,.16,.153],[-.005,2.373,.029,.163,.146],[-.032,2.437,-.004,.133,.109]],bronze);
    // The bronze service arm is part of the original stationary sculpture.
    cast([[.387,.09,.18,.049,.068],[.361,.34,.174,.048,.059],[.203,1.00,.192,.027,.036],
      [-.091,1.698,.223,.026,.027]],oxide,8);
    clearRoof(pedestal(1.54),base+3.76);clearRoof(pedestal(.7),base+6.397);

  }

  const materials={};
  const tex=(file,linear=false)=>{
    const map=loader.load(file);
    map.colorSpace=linear?T.NoColorSpace:T.SRGBColorSpace;map.anisotropy=8;
    map.wrapS=map.wrapT=T.RepeatWrapping;
    return map;
  };
  function signTexture(){
    const canvas=document.createElement('canvas');
    canvas.width=512;canvas.height=96;
    const context=canvas.getContext('2d');
    context.fillStyle='#392321';context.fillRect(0,0,512,96);
    context.fillStyle='#d6a76d';context.fillRect(0,4,512,5);context.fillRect(0,87,512,5);
    context.textAlign='center';context.textBaseline='middle';
    context.font='700 57px Georgia, serif';context.fillStyle='#f7d29c';context.fillText('COLONIAL',256,47);
    for(let x=9;x<508;x+=9){context.fillStyle='#efd591';context.fillRect(x,80,2,2);}
    const image=new T.CanvasTexture(canvas);image.colorSpace=T.SRGBColorSpace;return image;
  }
  for(const [name,{file,normal,roughness,alphaTest=0}] of Object.entries(layout)){
    materials[name]=new T.MeshStandardMaterial({map:file?tex(file):name==='marquee'?signTexture():null,
      normalMap:normal?tex(normal,true):null,normalScale:new T.Vector2(.42,.42),roughness,alphaTest,alphaToCoverage:alphaTest>0,metalness:layout[name].metalness||0,emissive:layout[name].emissive||0,vertexColors:true,side:T.DoubleSide});
  }
  for(const [name,mat] of Object.entries(materials)){
    if(name==='siding'||name==='paintedSiding')scene.userData.buildingLight.finish(mat,'boards',2.3);
    if(name==='churchBoards'){
      scene.userData.buildingLight.finish(mat,'boards',2.15);
      // White maintenance paint softens the high contrast of the raw boards.
      mat.normalScale.multiplyScalar(.31);
      const metric=mat.onBeforeCompile;
      mat.onBeforeCompile=function(shader,renderer){metric.call(this,shader,renderer);
        shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',
          'diffuseColor.rgb *= mix(vec3(.98),texture2D(map,vMapUv).rgb,.24);');
      };
      mat.customProgramCacheKey=()=>'keene-painted-clapboard-1';
    }
    if(name==='shingle')scene.userData.buildingLight.finish(mat,'slate',3);
    if(name==='autoGlass')scene.userData.buildingLight.glaze(mat,1.12);
    if(name==='carPaint')scene.userData.buildingLight.glaze(mat,.31);
    if(name==='shopDisplay'||name==='cafeDisplay')scene.userData.buildingLight.glaze(mat,1.05,name==='shopDisplay'?'shop':'cafe');
    else if(layout[name].glazing||['glass','upperSash'].includes(name))scene.userData.buildingLight.glaze(mat,.80);
    if(name==='roofing'){mat.bumpMap=mat.map;mat.bumpScale=name==='roofing'?.045:.026;}
  }
  for(const {kind,pos,uv,rgb} of groups.values()){
    const geo=new T.BufferGeometry();
    geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));
    geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    geo.setAttribute('color',new T.Float32BufferAttribute(rgb,3));
    geo.computeVertexNormals();geo.computeBoundingSphere();
    const mesh=new T.Mesh(geo,materials[kind]);mesh.name='Keene '+kind;scene.add(mesh);
  }
  const clearance=(x,z) => {
    let floor=colony.collision(x,z);
    for(const {ring,top} of roofs.get(Math.floor(x/cellSize)*1024+Math.floor(z/cellSize))||[]){
      if(top<=floor)continue;
      if(inside(ring,x,z))floor=top;
    }
    return floor;
  };
  clearance.colony=colony;
  return clearance;
};
