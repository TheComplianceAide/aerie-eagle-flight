// Bake with the original Mapbox Martini implementation. Its ISC license is
// adjacent. The footprints and normals come directly from the live game survey.
window.bakeTerrainIndexField=(scene,region)=>{
  const layouts=window.aerieTerrainIndices,grids=new Map(),headers=[],fields=[];
  const stats={tiles:0,native:0,reduced:0};
  scene.traverse(mesh=>{
    if(!mesh.userData.terrainCaster||mesh.isInstancedMesh||mesh.name||!mesh.material?.isShaderMaterial)return;
    const g=mesh.geometry,n=g.attributes.normal?.array,p=g.attributes.position.array;if(!n)return;
    const count=g.attributes.position.count;
    let stride=1;
    while(stride<count&&p[stride*3+2]===p[2])stride++;
    if(stride<4||stride>=count||count%stride||p[(count-stride)*3]!==p[0])return;
    const nx=stride-1,nz=count/stride-1;
    if(nx*nz<7800||p[3]<=p[0]||p[(count-1)*3+2]<=p[2])return;
    const spacing=(p[nx*3]-p[0])/nx;
    const error=spacing>=24?3:spacing>=8?1.25:.60;
    const distance=Math.ceil(1600*error);
    const field=new Uint8Array(Math.ceil(count/8));let indices=0;
    layouts.squares(0,0,nx,nz,(ox,oz,size)=>{
      const w=size+1;
      let martini=grids.get(w);if(!martini){martini=new Martini(w);grids.set(w,martini);}
      const height=new Float32Array(w*w);
      for(let j=0;j<w;j++)for(let i=0;i<w;i++)height[i+j*w]=p[3*(ox+i+(oz+j)*stride)+1];
      const tile=martini.createTile(height),errors=tile.errors,coords=martini.coords;
      for(let i=0;i<w;i++)errors[i]=errors[size*w+i]=errors[i*w]=errors[i*w+size]=Infinity;
      for(let i=0;i<martini.numTriangles;i++){
        const k=4*i,ax=coords[k],az=coords[k+1],bx=coords[k+2],bz=coords[k+3],mx=(ax+bx)>>1,mz=(az+bz)>>1;
        const a=3*(ox+ax+(oz+az)*stride),b=3*(ox+bx+(oz+bz)*stride),m=3*(ox+mx+(oz+mz)*stride);
        const u=n[m]-.5*(n[a]+n[b]),v=n[m+1]-.5*(n[a+1]+n[b+1]),s=n[m+2]-.5*(n[a+2]+n[b+2]);
        const middle=mx+mz*w;
        errors[middle]=Math.max(errors[middle],12*Math.sqrt(u*u+v*v+s*s));
      }
      tile.update();
      for(let j=0;j<w;j++)for(let i=0;i<w;i++)if(errors[i+j*w]>error){
        const bit=ox+i+(oz+j)*stride;field[bit>>3]|=1<<(bit&7);
      }
      const mesh=tile.getMesh(error);indices+=mesh.triangles.length;
      let perimeter=0;
      for(let i=0;i<mesh.vertices.length;i+=2){
        const x=mesh.vertices[i],z=mesh.vertices[i+1];
        if(x===0||z===0||x===size||z===size)perimeter++;
      }
      if(perimeter!==4*size)throw Error('Survey border was simplified');
    },(_x,_z,w,h)=>{indices+=w*h*6;});
    if(indices>nx*nz*6*.85)return;
    headers.push([p[0],p[2],nx,nz,layouts.fingerprint(p,n),distance,indices]);
    fields.push(field);
    stats.tiles++;stats.native+=2*nx*nz;stats.reduced+=indices/3;
  });
  const header=new TextEncoder().encode(JSON.stringify(headers));
  const bytes=new Uint8Array(8+header.length+fields.reduce((sum,f)=>sum+f.length,0));
  const view=new DataView(bytes.buffer);view.setUint32(0,0x52544e31);view.setUint32(4,header.length,true);
  bytes.set(header,8);let at=8+header.length;
  for(const field of fields){bytes.set(field,at);at+=field.length;}
  const pieces=[];for(let i=0;i<bytes.length;i+=16384)pieces.push(String.fromCharCode(...bytes.subarray(i,i+16384)));
  return {region,...stats,bytes:btoa(pieces.join(''))};
};
