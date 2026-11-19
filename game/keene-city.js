// Keene's rooflines, downtown façades and street furniture are separate from the aerial ground texture.
window.makeKeeneCity = function makeKeeneCity(T, scene, {height}) {
  const data = window.KEENE_CITY;
  const groups = new Map(), roofs = new Map(), loader = new T.TextureLoader();
  const layout = {
    brick: {file:'keene-brick.webp', normal:'keene-brick-normal.webp', roughness:.9},
    siding: {file:'lakeside-siding.webp', roughness:.91},
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
    marquee: {roughness:.5}
  };
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
  function church(ring, x, z, base, peak) {
    // The temple front faces Central Square. The main spire is 152 feet high.
    const cx=1892.7, cz=4334.5, axis=.18;
    const nave=[[1877.2,4307.2],[1895.7,4303.5],[1902.4,4335.0],[1884.1,4338.7]];
    roofGable(nave,base+8.61,base+12.25,color(0x888888));
    clearRoof(nave,base+12.25);
    const sq=(r)=>rectangle(cx,cz,Math.cos(axis),-Math.sin(axis),r,r);
    const oct=r=>circle(cx,cz,r,8), surface=y=>base+y;
    for(const [lo,hi,a,b,cloud,n] of [[6.4,16.3,3.54,3.54,white,sq],[16.3,17.05,3.75,3.62,white,sq],
      [17.05,22.2,3.15,3.15,white,sq],[22.2,23.1,3.25,2.72,white,sq],
      [23.1,28.6,2.66,2.37,white,oct],[28.6,30.3,2.5,1.7,white,oct],
      [30.3,45.5,1.74,.15,color(0x8b9690),oct],[45.5,46.33,.15,.03,trim,oct]])
      frustum('smooth',cloud,n(a),n(b),surface(lo),surface(hi));
    const clockX=cx+.58, clockZ=cz+3.22;
    const disk=(r, h, out, tint)=> {
      const ring=Array.from({length:16},(_,i)=>[clockX+r*Math.sin(i*Math.PI/8),surface(h)+r*Math.cos(i*Math.PI/8),clockZ+out]);
      for(let i=0;i<ring.length;i++)face('smooth',tint,[ring[i],ring[(i+1)%ring.length],[clockX,surface(h),clockZ+out]]);
    };
    disk(1.1,19.45,.04,black); disk(.88,19.45,.06,white);
    face('smooth',black,[[clockX,surface(19.45),clockZ+.1],[clockX+.06,surface(19.45),clockZ+.1],[clockX+.36,surface(20.02),clockZ+.1]]);
    face('smooth',black,[[clockX,surface(19.45),clockZ+.1],[clockX,surface(19.52),clockZ+.1],[clockX-.58,surface(19.49),clockZ+.1]]);
    const porchZ=4338.5, porchX=1893.3;
    const pediment=rectangle(porchX,porchZ,1,0,5.9,2.4);
    horizontal('smooth',white,pediment,base+7.8);
    face('smooth',white,[[porchX-5.9,base+7.8,porchZ+2.4],[porchX+5.9,base+7.8,porchZ+2.4],[porchX,base+10.65,porchZ+2.4]]);
    for(const offset of [-4.9,-1.64,1.64,4.9]){
      const pillar=circle(porchX+offset,porchZ+1.85,.42,8);
      frustum('smooth',white,pillar,pillar,base+.4,base+7.8);
    }
    for(let i=0;i<3;i++){
      const stairs=rectangle(porchX,porchZ,1,0,6.1,2.76-i*.35);
      horizontal('masonry',white,stairs,base+.08+i*.14);
    }
    clearRoof(sq(3.7),surface(46.33));
    clearRoof(pediment,peak);
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
    const top=base+(kind==='church'?8.6:measured||(kind==='house'?3.7+feel*2.4:5.9+Math.min(4.8,Math.sqrt(Math.abs(lot))*.035)));
    const facade=kind==='brick'||kind==='theatre';
    const tint=kind==='church'?white:color((facade?brickColors:buildingColors)[Math.floor(feel*(facade?brickColors:buildingColors).length)]);
    const central=Math.hypot(x-1933,z-4530)<560;
    const wallKind=facade?'brick':kind==='house'?'siding':kind==='church'?'smooth':'masonry';
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length];
      wall(wallKind,tint,a,b,bottom,top,wallKind==='brick'?1.58:wallKind==='siding'?5.7:3.8);
      if(facade&&drawFrontage(a,b,base,top))continue;
      if(facade)storefront(a,b,x,z,base,top,feel,kind);
      if(central&&(kind==='hall'||kind==='house'))sideWindows(a,b,x,z,base,top,kind,feel);
    }
    const roofTint=color(roofColors[Math.floor(feel*roofColors.length)]);
    let peak=top;
    if(kind==='house'){
      peak=top+2.25+feel*1.24;
      roofGable(ring,top,peak,roofTint);
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
      }else if(kind==='church')church(ring,x,z,base,top+4.8);
      if(central&&kind!=='church'&&Math.abs(lot)>620){
        const count=feel<.5?2:3;
        for(let i=0;i<count;i++){
          const equipment=rectangle(x+(i-count/2)*4.7,z+(feel-.5)*4,1,0,1.36+feel,.83+feel*.4);
          if(equipment.every(([a,b])=>inside(ring,a,b))){
            const level=top+.63+feel*.51, tint=color(0x9a9a92);
            for(let j=0;j<4;j++)wall('masonry',tint,equipment[j],equipment[(j+1)%4],top,level,3);
            horizontal('roofing',tint,equipment,level,2);
            clearRoof(equipment,level);
          }
        }
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
    const x=1897.6,z=4399.5,base=height(x,z)+.689;
    const platform=(r)=>rectangle(x,z,1,0,r,r);
    for (const [lo,hi,a,b] of [[0,.25,2.43,2.32],[.25,.51,2.0,1.93],[.51,.82,1.54,1.43],[.82,3.36,1.04,.74],[3.36,3.64,.87,.84],[3.64,4.22,.57,.55]])
      frustum('masonry',white,platform(a),platform(b),base+lo,base+hi);
    const head=circle(x,z,.24,8), body=circle(x,z,.37,8);
    frustum('smooth',trim,body,body,base+4.17,base+5.48);
    frustum('smooth',trim,head,head,base+5.42,base+5.91);
    clearRoof(platform(2.5),base+5.91);
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
      normalMap:normal?tex(normal,true):null,normalScale:new T.Vector2(.42,.42),roughness,alphaTest,alphaToCoverage:alphaTest>0,metalness:layout[name].metalness||0,vertexColors:true,side:T.DoubleSide});
  }
  for(const {kind,pos,uv,rgb} of groups.values()){
    const geo=new T.BufferGeometry();
    geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));
    geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    geo.setAttribute('color',new T.Float32BufferAttribute(rgb,3));
    geo.computeVertexNormals();geo.computeBoundingSphere();
    const mesh=new T.Mesh(geo,materials[kind]);mesh.name='Keene '+kind;scene.add(mesh);
  }
  return (x,z) => {
    let floor=-Infinity;
    for(const {ring,top} of roofs.get(Math.floor(x/cellSize)*1024+Math.floor(z/cellSize))||[]){
      if(top<=floor)continue;
      if(inside(ring,x,z))floor=top;
    }
    return floor;
  };
};
