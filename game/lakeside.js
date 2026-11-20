// Simplified buildings follow footprint centers, bearings, and dimensions.
// Local aerial color is retained on pitched roofs. Piers follow mapped paths.
window.addLakesideBuildings=function addLakesideBuildings(T,scene,data,elevation,waterLevel){
  const groups=new Map(),blocks=new Map(),loader=new T.TextureLoader(),step=48;
  const detail=window.makeBuildingFittings(T,scene);
  const key=(x,z)=>(x+3000)*8192+z+3000;
  const palettes=[0xc2b495,0xb5b7af,0xf4ecda,0x87958d,0xa59488,0xc8c4b5];
  const waterfrontPalettes=[0xe3d5bb,0xacb9b7,0xe5e1d5,0xa38e73,0xc3aba0,0xb9b9a4,0xb3c0be,0x8f5d4f];
  function buffer(name){
    if(!groups.has(name))groups.set(name,{pos:[],uv:[],rgb:[]});return groups.get(name);
  }
  function face(material,c,p,uv){
    const b=buffer(material);
    for(const i of (p.length===4?[0,1,2,0,2,3]:[0,1,2])){
      b.pos.push(...p[i]);b.uv.push(...uv[i]);b.rgb.push(c.r,c.g,c.b);
    }
  }
  for(const [box,rgb,profile] of data.buildings){
    const x=box.reduce((s,q)=>s+q[0],0)/4,z=box.reduce((s,q)=>s+q[1],0)/4;
    const length=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
    let j=length(box[0],box[1])>=length(box[0],box[3])?1:3;
    const l=length(box[0],box[j]),w=length(box[0],box[4-j]);
    if(w<1.4||l>130)continue;
    const dx=(box[j][0]-box[0][0])/l,dz=(box[j][1]-box[0][1])/l;
    const at=(a,b,y)=>[x+dx*a-dz*b,y,z+dz*a+dx*b];
    const rand=Math.abs(Math.sin(x*19.3+z*53.1)*4798)%1;
    const heights=box.map(([bx,bz])=>elevation(bx,bz));
    const base=Math.max(waterLevel+.18,...heights),bottom=Math.min(...heights,base)-.65;
    const wallH=profile?.[0]??(l*w>260?5.6:3.1+rand*1.5),top=base+wallH;
    const flat=Boolean(profile?.[1]),rise=flat?.14:Math.min(4.2,w*(.17+.12*rand));
    const colors=profile?waterfrontPalettes:palettes;
    const siding=new T.Color(colors[Math.floor(rand*colors.length)]);
    const roof=new T.Color().setRGB(...rgb.map(v=>Math.min(.98,.45+v/255*(profile ? .84 : .77))),T.SRGBColorSpace);
    const metal=flat||rand>.81,cover=metal?'metal':'roof';
    for(const k of [-1,1]){
      const a=at(-l/2,k*w/2,bottom),b=at(l/2,k*w/2,bottom),c=at(l/2,k*w/2,top),d=at(-l/2,k*w/2,top);
      const repeats=Math.max(1,Math.round(l/(profile?4.3+rand*2.2:5)));
      const sill=base+.24;
      const sa=at(-l/2,k*w/2,sill),sb=at(l/2,k*w/2,sill),foot=new T.Color(0xe1ddd0);
      face('foundation',foot,[a,b,sb,sa],[[0,0],[l/2,0],[l/2,(sill-bottom)/2],[0,(sill-bottom)/2]]);
      face('siding',siding,[sa,sb,c,d],[[0,-.08],[repeats,-.08],[repeats,1],[0,1]]);
      const baseA=at(k*l/2,-w/2,bottom),baseB=at(k*l/2,w/2,bottom),e=at(k*l/2,w/2,top),f=at(k*l/2,-w/2,top),g=at(k*l/2,0,top+rise);
      const end=Math.max(1,Math.round(w/5));
      const endA=at(k*l/2,-w/2,sill),endB=at(k*l/2,w/2,sill);
      face('foundation',foot,[baseA,baseB,endB,endA],[[0,0],[w/2,0],[w/2,(sill-bottom)/2],[0,(sill-bottom)/2]]);
      face('siding',siding,[endA,endB,e,f],[[0,0],[end,0],[end,1],[0,1]]);
      if(!flat)face('siding',siding,[f,e,g],[[0,.81],[end,.81],[end/2,.98]]);
      const roofL=l/2+.38,roofW=w/2+.33;
      face(cover,roof,[at(-roofL,k*roofW,top-.1),at(roofL,k*roofW,top-.1),at(roofL,0,top+rise+.06),at(-roofL,0,top+rise+.06)],
        [[0,0],[l/3.2,0],[l/3.2,roofW/2.4],[0,roofW/2.4]]);
    }
    const shed=w<4.5||l<6.5,trim=rand>.72?0xb8c2b5:0xe1dbcb;
    const frontage=rand>.5?1:-1;
    const porchDepth=!flat&&!shed&&w>6&&l>9&&rand>.32?1.62:0;
    const porchWidth=Math.min(l*.50,5.5),doorU=l*.18;
    const chimney=(!shed&&w>4.8)?{u:l*(rand*.39-.20),v:w*.15}:null;
    if(chimney)chimney.top=top+rise*(1-2*Math.abs(chimney.v)/w)+(flat?1.08:1.42);
    const block={x,z,dx,dz,l:l/2,w:w/2,height:top+rise+.065,chimney,frontage,porchDepth,porchWidth,doorU,porchTop:base+2.80};
    // Fixed world coordinates keep the windows, porches and flues attached
    // to their surveyed roof as higher detail enters the camera's range.
    detail(x,z,(box,sash)=>{
      function fitting(a,b,y,l,h,w,tint){box(...at(a,b,y),dx,dz,l,h,w,tint);}
      for(const side of [-1,1]){
        const floors=Math.max(1,Math.min(3,Math.round(wallH/3.1)));
        fitting(0,side*w/2,top-.13,l+.15,.22,.19,trim);
        for(const u of [-l/2+.04,l/2-.04])fitting(u,side*w/2,base+wallH/2,.14,wallH,.18,trim);
        // Vary window counts by measured frontage. Sheds retain a single light.
        const rows=Math.max(1,Math.min(14,Math.floor(l/(shed?6:3.85))));
        for(let f=0;f<floors;f++)for(let i=0;i<rows;i++){
          const u=l*((i+.5)/rows-.5);
          if(f===0&&side===frontage&&Math.abs(u-doorU)<1.44)continue;
          const lit=(i+f+Math.round(rand*15))%7===0?0x77705a:0x424946;
          sash(...at(u,side*(w/2+.098),base+.58+(f+.32)*wallH/floors),side*dx,side*dz,
            Math.min(1.85,l/rows*.50),Math.min(1.60,wallH/floors*.53),trim,lit);
        }
        const endRows=Math.max(1,Math.min(6,Math.floor(w/3.4)));
        for(let col=0;col<endRows;col++){
          const v=w*((col+.5)/endRows-.5);
          sash(...at(side*(l/2+.072),v,base+1.68),side*dz,-side*dx,Math.min(1.42,w/endRows*.46),1.37,trim,0x424946);
        }
      }
      fitting(doorU,frontage*(w/2+.085),base+1.03,1.08,2.08,.15,trim);
      fitting(doorU,frontage*(w/2+.175),base+1.0,.87,1.97,.055,rand>.5?0x444e42:0x805849);
      if(porchDepth){
        const outer=frontage*(w/2+porchDepth);
        fitting(doorU,frontage*(w/2+porchDepth*.52),base+.16,porchWidth,.24,porchDepth,0x918572);
        fitting(doorU,frontage*(w/2+porchDepth*.56),base+2.64,porchWidth+.48,.27,porchDepth+.30,0x746f65);
        fitting(doorU,outer,base+2.49,porchWidth+.28,.16,.21,trim);
        for(const pos of [-1,1])fitting(doorU+pos*(porchWidth/2-.14),outer,base+1.34,.15,2.26,.15,trim);
      }
      if(chimney){
        const {u,v,top:h}=chimney,hw=flat?1.65:.69,hd=flat?1.13:.83;
        fitting(u,v,h-.77,hw,1.55,hd,flat?0x858780:0x8a5946);
        fitting(u,v,h-.09,hw+.16,.18,hd+.16,flat?0xabb0a9:0xb2a48f);
        fitting(u,v,h+.009,hw*.66,.038,hd*.67,0x343938);
      }
    });
    const rad=Math.hypot(l,w)/2+3;
    for(let i=Math.floor((x-rad)/step);i<=Math.floor((x+rad)/step);i++)for(let k=Math.floor((z-rad)/step);k<=Math.floor((z+rad)/step);k++){
      const idx=key(i,k);if(!blocks.has(idx))blocks.set(idx,[]);blocks.get(idx).push(block);
    }
  }
  const deck=new T.Color(0xc3bdaf);
  for(const [closed,pts] of data.piers){
    const y=waterLevel+.70;
    if(closed&&pts.length>=3){
      const triangles=T.ShapeUtils.triangulateShape(pts.map(p=>new T.Vector2(...p)),[]);
      for(const tri of triangles){const corners=tri.map(i=>pts[i]);face('dock',deck,corners.map(([x,z])=>[x,y,z]),corners.map(([x,z])=>[x/3,z/3]));}
    }else for(let i=1;i<pts.length;i++){
      const [a,b]=[pts[i-1],pts[i]],dx=b[0]-a[0],dz=b[1]-a[1],d=Math.hypot(dx,dz);if(!d)continue;
      const right=.95/d,rx=dz*right,rz=-dx*right;
      const ends=[[a[0]-rx,y,a[1]-rz],[a[0]+rx,y,a[1]+rz],[b[0]+rx,y,b[1]+rz],[b[0]-rx,y,b[1]-rz]];
      face('dock',deck,ends,[[0,0],[0,1],[d/2,1],[d/2,0]]);
    }
  }
  for(const [name,b] of groups){
    const tex=loader.load(name==='foundation'?'building-fieldstone.webp':name==='siding'?'building-clapboard.webp':'lakeside-'+name+'.webp');tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=8;
    tex.wrapS=tex.wrapT=T.RepeatWrapping;
    const mat=new T.MeshStandardMaterial({map:tex,vertexColors:true,side:T.DoubleSide,roughness:name==='metal'?.58:.91,bumpMap:name==='siding'||name==='roof'?tex:null,bumpScale:name==='roof'?.027:.019});
    if(name==='foundation')scene.userData.buildingLight.finish(mat,'fieldstone',2.08);
    if(name==='siding')scene.userData.buildingLight.finish(mat,'boards',2.4);
    const geo=new T.BufferGeometry();
    for(const [k,attr,n] of [['position',b.pos,3],['uv',b.uv,2],['color',b.rgb,3]])geo.setAttribute(k,new T.Float32BufferAttribute(attr,n));
    geo.computeVertexNormals();geo.computeBoundingSphere();const mesh=new T.Mesh(geo,mat);mesh.name='Lakeside '+name;scene.add(mesh);
  }
  return (x,z)=>{
    let y=-Infinity;
    for(const b of blocks.get(key(Math.floor(x/step),Math.floor(z/step)))||[]){
      const dx=x-b.x,dz=z-b.z;
      const u=dx*b.dx+dz*b.dz,v=dz*b.dx-dx*b.dz;
      if(Math.abs(u)<=b.l+.5&&Math.abs(v)<=b.w+.5)y=Math.max(y,b.height);
      if(b.chimney&&Math.abs(u-b.chimney.u)<.93&&Math.abs(v-b.chimney.v)<.72)y=Math.max(y,b.chimney.top+.04);
      if(b.porchDepth&&Math.abs(u-b.doorU)<b.porchWidth*.5+.24&&v*b.frontage>b.w&&v*b.frontage<b.w+b.porchDepth+.28)y=Math.max(y,b.porchTop);
    }
    return y;
  };
};
