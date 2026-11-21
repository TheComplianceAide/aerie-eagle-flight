// Connect the mapped lake outline to the land triangles. Narrow beaches and
// small islands frequently fall between vertices in a regional height survey.
window.joinAtlasShore=function(T,scene,{region,survey,elevation,level,terrain,bankSurveys=[]}){
  const tileBins=new Map(),chunks=new Map(),faces=new Map();
  const key=(x,z)=>x+z*16384;
  function indexBox(bins,size,x0,z0,x1,z1,item){
    for(let j=Math.floor(z0/size);j<=Math.floor(z1/size);j++)for(let i=Math.floor(x0/size);i<=Math.floor(x1/size);i++){
      const k=key(i,j);let bin=bins.get(k);if(!bin)bins.set(k,bin=[]);bin.push(item);
    }
  }
  for(const mesh of scene.children){
    if(mesh.material!==terrain)continue;
    const g=mesh.geometry,seg=g.parameters;if(!seg?.widthSegments||!seg.heightSegments)continue;
    const p=g.attributes.position,rows=seg.heightSegments,cols=seg.widthSegments;
    const x=p.getX(0),z=p.getZ(0),w=p.getX(cols)-x,h=p.getZ(rows*(cols+1))-z;
    if(w<=0||h<=0)continue;
    indexBox(tileBins,768,x,z,x+w,z+h,{x,z,w,h,rows,cols,p});
  }
  function ground(x,z){
    const tiles=tileBins.get(key(Math.floor(x/768),Math.floor(z/768)));
    if(tiles)for(const a of tiles){
      const u=(x-a.x)/a.w*a.cols,v=(z-a.z)/a.h*a.rows;
      if(u<0||v<0||u>a.cols||v>a.rows)continue;
      const i=Math.min(a.cols-1,Math.floor(u)),j=Math.min(a.rows-1,Math.floor(v)),sx=u-i,sz=v-j;
      const row=a.cols+1,k=j*row+i,p=a.p;
      if(sx+sz<=1)return p.getY(k)*(1-sx-sz)+p.getY(k+1)*sx+p.getY(k+row)*sz;
      return p.getY(k+row+1)*(sx+sz-1)+p.getY(k+row)*(1-sx)+p.getY(k+1)*(1-sz);
    }
    return elevation(x,z);
  }
  function section(x,z,nx,nz){
    const y=ground(x,z),near=ground(x+3*nx,z+3*nz),toLand=ground(x+12*nx,z+12*nz);
    // Intact high banks occlude the lake naturally. Only fill the missing shelf.
    const surveyed=bankSurveys.some(bank=>bank.edge(x,z)>.45)||
      (region==='winnipesaukee'&&window.makeWinnipesaukeeWaterfront?.islandBed(x,z));
    const needed=!surveyed&&y<level+.12&&near<level+.22;
    const width=Math.min(32,Math.max(7,9+(level-toLand)*1.6));
    const grade=Math.max(.042,Math.min(.23,(toLand-level)/12+.078));
    const xyz=[];
    for(const d of [-2.1,0,1.6,width*.45,width]){
      const px=x+d*nx,pz=z+d*nz,base=ground(px,pz);
      const shelf=level-.022+d*grade;
      const t=Math.max(0,Math.min(1,(d-1.6)/(width-1.6))),blend=t*t*(3-2*t);
      xyz.push(px,shelf+(base-.075-shelf)*blend,pz);
    }
    return {x,z,xyz,needed};
  }
  function span(a,b){
    if(!a.needed&&!b.needed)return;
    const k=key(Math.floor((a.x+b.x)/1024),Math.floor((a.z+b.z)/1024));
    let c=chunks.get(k);if(!c)chunks.set(k,c={p:[],idx:[]});
    function put(s){if(s.chunk===c)return s.index;const i=c.p.length/3;c.p.push(...s.xyz);s.chunk=c;s.index=i;return i;}
    const left=put(a),right=put(b),verts=c.p;
    let x0=Infinity,z0=Infinity,x1=-Infinity,z1=-Infinity;
    for(const v of [a.xyz,b.xyz])for(let i=0;i<v.length;i+=3){x0=Math.min(x0,v[i]);x1=Math.max(x1,v[i]);z0=Math.min(z0,v[i+2]);z1=Math.max(z1,v[i+2]);}
    const first=c.idx.length;
    const face=(i,j,k)=>{const u=i*3,v=j*3,w=k*3;
      const up=(verts[v+2]-verts[u+2])*(verts[w]-verts[u])-(verts[v]-verts[u])*(verts[w+2]-verts[u+2]);
      if(up>0)c.idx.push(i,j,k);else c.idx.push(i,k,j);};
    for(let i=0;i<4;i++){face(left+i,right+i,left+i+1);face(left+i+1,right+i,right+i+1);}
    indexBox(faces,48,x0,z0,x1,z1,{c,first,x0,z0,x1,z1});
  }
  for(const [n,ring] of [survey.shore,...(survey.shoreHoles||[])].entries()){
    const path=ring.filter((p,i)=>{const q=ring[(i+1)%ring.length];return Math.hypot(p[0]-q[0],p[1]-q[1])>.03});
    if(path.length<3)continue;
    let area=0;for(let i=0;i<path.length;i++){const a=path[i],b=path[(i+1)%path.length];area+=a[0]*b[1]-b[0]*a[1];}
    const side=(area>0?1:-1)*(n===0?1:-1);
    const normals=path.map((a,i)=>{const b=path[(i+1)%path.length],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);return [side*dz/len,-side*dx/len]});
    const corner=path.map((_,i)=>{const u=normals[i],v=normals[(i+path.length-1)%path.length],f=Math.max(.70,1+u[0]*v[0]+u[1]*v[1]);return [(u[0]+v[0])/f,(u[1]+v[1])/f]});
    let first,prev;
    for(let i=0;i<path.length;i++){
      const a=path[i],b=path[(i+1)%path.length],dx=b[0]-a[0],dz=b[1]-a[1],steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/14));
      for(let j=0;j<steps;j++){
        const normal=j===0?corner[i]:normals[i],s=section(a[0]+dx*j/steps,a[1]+dz*j/steps,...normal);
        if(prev)span(prev,s);else first=s;prev=s;
      }
    }
    span(prev,first);
  }
  const drawTiles=new Map();
  function addShelf(g){
    const mesh=new T.Mesh(g,terrain);mesh.name='Lakeshore gravel shelf';scene.add(mesh);
  }
  for(const c of chunks.values()){
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(c.p,3));g.setIndex(c.idx);g.computeVertexNormals();g.computeBoundingSphere();
    c.p=g.attributes.position.array;c.idx=g.index.array;
    if(region!=='moosehead'){addShelf(g);continue;}
    // Moosehead has hundreds of little survey strips. Bake normals before
    // combining them, preserving every original seam and collision triangle.
    const center=g.boundingSphere.center,id=key(Math.floor(center.x/2400),Math.floor(center.z/2400));
    if(!drawTiles.has(id))drawTiles.set(id,[]);
    drawTiles.get(id).push(g);
  }
  for(const pieces of drawTiles.values()){
    if(pieces.length===1){addShelf(pieces[0]);continue;}
    const vertices=pieces.reduce((n,g)=>n+g.attributes.position.count,0);
    const positions=new Float32Array(vertices*3),normals=new Float32Array(vertices*3);
    const indexCount=pieces.reduce((n,g)=>n+g.index.count,0);
    const indices=vertices>65535?new Uint32Array(indexCount):new Uint16Array(indexCount);
    let vertex=0,index=0;
    for(const g of pieces){
      positions.set(g.attributes.position.array,vertex*3);normals.set(g.attributes.normal.array,vertex*3);
      for(const value of g.index.array)indices[index++]=value+vertex;
      vertex+=g.attributes.position.count;
      g.dispose();
    }
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.BufferAttribute(positions,3));g.setAttribute('normal',new T.BufferAttribute(normals,3));
    g.setIndex(new T.BufferAttribute(indices,1));g.computeBoundingSphere();addShelf(g);
  }
  const floor=(x,z)=>{
    const near=faces.get(key(Math.floor(x/48),Math.floor(z/48)));let y=-Infinity;
    if(near)for(const f of near){
      if(x<f.x0||x>f.x1||z<f.z0||z>f.z1)continue;
      const p=f.c.p,idx=f.c.idx;
      for(let n=f.first;n<f.first+24;n+=3){
        const i=idx[n]*3,j=idx[n+1]*3,k=idx[n+2]*3,ax=p[i],az=p[i+2];
        const bx=p[j]-ax,bz=p[j+2]-az,cx=p[k]-ax,cz=p[k+2]-az,det=bx*cz-bz*cx;
        if(Math.abs(det)<.00001)continue;
        const u=((x-ax)*cz-(z-az)*cx)/det,v=(bx*(z-az)-bz*(x-ax))/det;
        if(u>=0&&v>=0&&u+v<=1)y=Math.max(y,p[i+1]*(1-u-v)+u*p[j+1]+v*p[k+1]);
      }
    }
    return y;
  };
  floor.ground=ground;
  return floor;
};
