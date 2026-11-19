// Simplified buildings follow footprint centers, bearings, and dimensions.
// Local aerial color is retained on pitched roofs. Piers follow mapped paths.
window.addLakesideBuildings=function addLakesideBuildings(T,scene,data,elevation,waterLevel){
  const groups=new Map(),blocks=new Map(),loader=new T.TextureLoader(),step=48;
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
    const roof=new T.Color().setRGB(...rgb.map(v=>Math.min(.98,.42+v/255*(profile ? .79 : .63))),T.SRGBColorSpace);
    const metal=flat||rand>.81,cover=metal?'metal':'roof';
    for(const k of [-1,1]){
      const a=at(-l/2,k*w/2,bottom),b=at(l/2,k*w/2,bottom),c=at(l/2,k*w/2,top),d=at(-l/2,k*w/2,top);
      const repeats=Math.max(1,Math.round(l/(profile?4.3+rand*2.2:5)));
      face('siding',siding,[a,b,c,d],[[0,-.08],[repeats,-.08],[repeats,1],[0,1]]);
      const baseA=at(k*l/2,-w/2,bottom),baseB=at(k*l/2,w/2,bottom),e=at(k*l/2,w/2,top),f=at(k*l/2,-w/2,top),g=at(k*l/2,0,top+rise);
      const end=Math.max(1,Math.round(w/5));
      face('siding',siding,[baseA,baseB,e,f],[[0,0],[end,0],[end,1],[0,1]]);
      if(!flat)face('siding',siding,[f,e,g],[[0,.81],[end,.81],[end/2,.98]]);
      const roofL=l/2+.38,roofW=w/2+.33;
      face(cover,roof,[at(-roofL,k*roofW,top-.1),at(roofL,k*roofW,top-.1),at(roofL,0,top+rise+.06),at(-roofL,0,top+rise+.06)],
        [[0,0],[l/3.2,0],[l/3.2,roofW/2.4],[0,roofW/2.4]]);
    }
    const block={x,z,dx,dz,l:l/2,w:w/2,height:top+rise};
    const rad=Math.hypot(l,w)/2+1;
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
    const tex=loader.load('lakeside-'+name+'.webp');tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=8;
    tex.wrapS=tex.wrapT=T.RepeatWrapping;
    const mat=new T.MeshStandardMaterial({map:tex,vertexColors:true,side:T.DoubleSide,roughness:name==='metal'?.58:.91});
    const geo=new T.BufferGeometry();
    for(const [k,attr,n] of [['position',b.pos,3],['uv',b.uv,2],['color',b.rgb,3]])geo.setAttribute(k,new T.Float32BufferAttribute(attr,n));
    geo.computeVertexNormals();geo.computeBoundingSphere();const mesh=new T.Mesh(geo,mat);mesh.name='Lakeside '+name;scene.add(mesh);
  }
  return (x,z)=>{
    let y=-Infinity;
    for(const b of blocks.get(key(Math.floor(x/step),Math.floor(z/step)))||[]){
      const dx=x-b.x,dz=z-b.z;
      if(Math.abs(dx*b.dx+dz*b.dz)<=b.l+.5&&Math.abs(dz*b.dx-dx*b.dz)<=b.w+.5)y=Math.max(y,b.height);
    }
    return y;
  };
};
