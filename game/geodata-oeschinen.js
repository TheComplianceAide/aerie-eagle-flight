/* Full-playable Oeschinen tree candidates used by the stock conifer renderer. */
window.prepareOeschinenGeodata=async function(read){
  const meta=await read.json('oeschinen-canopy-meta.json');
  if(meta.crs!=='EPSG:2056'||meta.origin.join(',')!=='2622000,1150000')throw Error('Wrong Oeschinen canopy frame');
  const bytes=await read.gzip('oeschinen-canopy.bin',100000);
  if(bytes.byteLength<12)throw Error('Truncated Oeschinen canopy header');
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const total=v.getUint32(4,true),tileCount=v.getUint16(8,true),span=v.getUint16(10,true);
  if(v.getUint32(0,false)!==0x4f454331||span!==128||total>10000||tileCount>3364||
     bytes.byteLength!==12+4*tileCount+7*total)throw Error('Invalid Oeschinen canopy pack');
  const candidates=[];
  let p=12;
  for(let t=0;t<tileCount;t++){
    const ix=v.getUint8(p),iz=v.getUint8(p+1),n=v.getUint16(p+2,true);p+=4;
    if(ix>57||iz>57||n>70||candidates.length+n>total||p+n*7>bytes.byteLength)throw Error('Invalid Oeschinen canopy tile');
    for(let i=0;i<n;i++,p+=7){
      const x=-3700+span*ix+v.getUint16(p,true)/16,z=-3700+span*iz+v.getUint16(p+2,true)/16;
      candidates.push([x,z,v.getUint8(p+4)/8,v.getUint8(p+5)/16,v.getUint8(p+6)/255]);
    }
  }
  if(candidates.length!==total||p!==bytes.byteLength)throw Error('Incomplete Oeschinen canopy pack');
  const info={candidates:total,tiles:tileCount,generated:0,measuredPreserved:0,minHeight:Infinity,maxHeight:0};
  return {info,meta,infill(allowed,plant,elevation){
    for(const [x,z,height,width,seed] of candidates){
      if(Math.max(Math.abs(x),Math.abs(z))>3681||height<4.1||height>24.01)continue;
      const y=elevation(x,z);
      if(allowed(x,z,y)&&plant({x,y,z,height,width,seed,geodataCanopy:true},true)){
        info.generated++;info.minHeight=Math.min(height,info.minHeight);info.maxHeight=Math.max(height,info.maxHeight);
      }
    }
  }};
};
