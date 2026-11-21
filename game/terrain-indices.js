// Alternate triangulations of the same surveyed grid. Each square keeps all of
// its edge samples. Adjacent tiles therefore meet the native terrain exactly.
window.aerieTerrainIndices=(()=>{
  const maps=new Map();
  const id=(x,z,nx,nz)=>[Math.round(x*16),Math.round(z*16),nx,nz].join('/');
  function fingerprint(position,normal){
    let hash=2166136261;
    for(let i=0;i<position.length;i+=3){
      hash=Math.imul(hash^Math.round(position[i+1]*100),16777619);
      const direction=(Math.round((normal[i]+1)*100)<<16)|
        (Math.round((normal[i+1]+1)*100)<<8)|Math.round((normal[i+2]+1)*100);
      hash=Math.imul(hash^direction,16777619);
    }
    return hash>>>0;
  }
  // Rectangular and odd-sized source tiles are covered without resampling.
  function squares(x,z,w,h,visit,strip){
    if(!w||!h)return;
    let size=64;
    while(size>w||size>h)size>>=1;
    if(size<=2){strip(x,z,w,h);return;}
    const across=w-w%size,down=h-h%size;
    for(let dz=0;dz<down;dz+=size)for(let dx=0;dx<across;dx+=size)
      visit(x+dx,z+dz,size);
    squares(x+across,z,w-across,h,visit,strip);
    squares(x,z+down,across,h-down,visit,strip);
  }
  function decode(split,nx,nz,length){
    const stride=nx+1;
    const index=(x,z)=>x+z*stride;
    const Index=(nx+1)*(nz+1)>65535?Uint32Array:Uint16Array;
    const result=new Index(length);let cursor=0;
    function emit(ax,az,bx,bz,cx,cz){
      const mx=(ax+bx)>>1,mz=(az+bz)>>1,mid=index(mx,mz);
      if(Math.abs(ax-cx)+Math.abs(az-cz)>1&&(split[mid>>3]&(1<<(mid&7)))){
        emit(cx,cz,ax,az,mx,mz);emit(bx,bz,cx,cz,mx,mz);
      }else{
        result[cursor++]=index(ax,az);result[cursor++]=index(bx,bz);result[cursor++]=index(cx,cz);
      }
    }
    squares(0,0,nx,nz,(x,z,size)=>{
      emit(x,z,x+size,z+size,x+size,z);
      emit(x+size,z+size,x,z,x,z+size);
    },(x,z,w,h)=>{
      for(let row=z;row<z+h;row++)for(let col=x;col<x+w;col++){
        const a=index(col,row),b=a+1,c=a+stride,d=c+1;
        result[cursor++]=a;result[cursor++]=c;result[cursor++]=b;
        result[cursor++]=c;result[cursor++]=d;result[cursor++]=b;
      }
    });
    if(cursor!==length)throw Error('Invalid triangulated terrain span');
    return result;
  }
  function read(buffer){
    const bytes=new Uint8Array(buffer),view=new DataView(buffer);
    if(view.getUint32(0)!==0x52544e31)throw Error('Invalid terrain index signature');
    const headerSize=view.getUint32(4,true);
    const tiles=JSON.parse(new TextDecoder().decode(bytes.subarray(8,8+headerSize)));
    const entries=new Map();let at=8+headerSize;
    for(const [x,z,nx,nz,stamp,distance,count] of tiles){
      const length=Math.ceil((nx+1)*(nz+1)/8);
      if(at+length>bytes.length||count>6*nx*nz||count%3)throw Error('Invalid terrain index length');
      entries.set(id(x,z,nx,nz),{stamp,distance,count,split:bytes.subarray(at,at+length)});at+=length;
    }
    if(at!==bytes.length)throw Error('Incomplete terrain indices');
    return entries;
  }
  async function prepare(region){
    if(maps.has(region))return;
    const file='terrain-indices-'+region+'.bin';
    try{
      const url=window.aerieAssetURL?.(file)||file;
      const response=await fetch(url);
      if(!response.ok)throw Error(response.status+' '+file);
      maps.set(region,read(await response.arrayBuffer()));
    }catch(error){
      // The original survey grid supports offline copies and interrupted downloads.
      console.warn('Using full terrain detail:',error.message);
    }
  }
  function forGrid(region,x,z,nx,nz,geometry){
    const tiles=maps.get(region),key=id(x,z,nx,nz),entry=tiles?.get(key);
    if(!entry||entry.stamp!==fingerprint(geometry.attributes.position.array,geometry.attributes.normal.array))return null;
    try{
      return {index:new THREE.BufferAttribute(decode(entry.split,nx,nz,entry.count),1),distance:entry.distance};
    }catch(error){
      tiles.delete(key);
      console.warn('Using full detail for a terrain tile:',error.message);
      return null;
    }
  }
  function select(grid,native,reduced,range){
    if(!reduced||reduced.index.count>=native.count)return native;
    // Hysteresis prevents a circling eagle from toggling the same ridge.
    const threshold=reduced.distance+(grid.index===reduced.index?-80:80);
    return range>threshold?reduced.index:native;
  }
  return {prepare,forGrid,select,fingerprint,squares};
})();
