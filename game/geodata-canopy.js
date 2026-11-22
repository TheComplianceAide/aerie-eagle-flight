/* Compact, geographically registered tree candidates. */
window.prepareRegionalCanopyGeodata=async (world,read)=>{
  const stem=world+'-canopy-preview';
  const meta=await read.json(stem+'.json');
  const frame=world==='alaska'?[526511,6477009]:[442772,5060090];
  if(meta.world!==world||meta.origin[0]!==frame[0]||meta.origin[1]!==frame[1])throw Error('Wrong canopy frame');
  const bytes=await read.gzip(stem+'.bin',160000);
  if(bytes.byteLength<20)throw Error('Truncated canopy header');
  const b=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const total=b.getUint32(4,true),tiles=b.getUint16(8,true),span=b.getUint16(10,true);
  const [left,top,right,bottom]=[12,14,16,18].map(i=>b.getInt16(i,true));
  if(b.getUint32(0)!==0x4e435031||total>8500||span!==128||bytes.byteLength!==20+4*tiles+7*total||
     [left,top,right,bottom].some((v,i)=>v!==meta.localRect[i]))throw Error('Invalid canopy pack');
  const candidates=[];
  let p=20;
  for(let i=0;i<tiles;i++){
    const ox=left+span*b.getUint8(p),oz=top+span*b.getUint8(p+1),num=b.getUint16(p+2,true);p+=4;
    if(num>70||num+candidates.length>total||p+num*7>bytes.byteLength||ox>=right||oz>=bottom)throw Error('Invalid canopy tile');
    for(let j=0;j<num;j++,p+=7){
      const x=ox+b.getUint16(p,true)/16,z=oz+b.getUint16(p+2,true)/16;
      candidates.push([x,z,b.getUint8(p+4)/8,b.getUint8(p+5)/16,b.getUint8(p+6)/255]);
    }
  }
  if(candidates.length!==total||p!==bytes.byteLength)throw Error('Truncated canopy pack');
  const stats={candidates:total,tiles,accepted:0,stockTrees:0};
  return {bounds:[left,top,right,bottom],meta,stats,apply(elevation,eligible,add){
    for(const [x,z,height,width,seed] of candidates){
      if(x<left||x>=right||z<top||z>=bottom||height<4||height>25||width<1||width>12)continue;
      const y=elevation(x,z);
      if(eligible(x,z,y)&&add({x,y,z,height,width,seed,geodataCanopy:true}))stats.accepted++;
    }
  }};
};
