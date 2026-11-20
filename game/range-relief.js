// Signed, measured elevation residuals from the outer elevation survey. The
// playable shoreline and its vertical datum still come from each local survey.
(() => {
  const spans={dixville:16000,alaska:18000,swiss:16000,canyon:12800,moosehead:31000,winnipesaukee:24500,surry:17000};
  let active,field,size,half;
  window.prepareRangeRelief=async region=>{
    if(active===region)return;
    const filename='range-'+region+'-relief.png',img=new Image();
    img.src=window.aerieAssetURL?.(filename)||filename;await img.decode();
    const canvas=document.createElement('canvas');canvas.width=canvas.height=img.width;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
    const bytes=ctx.getImageData(0,0,img.width,img.height).data;
    field=new Uint8Array(img.width*img.height);
    for(let i=0;i<field.length;i++)field[i]=bytes[i*4];
    size=img.width;half=spans[region]||18000;active=region;
  };
  window.rangeRelief=(region,x,z)=>{
    if(region!==active)return 0;
    const u=Math.max(0,Math.min(size-1.00001,(.5+.5*x/half)*(size-1)));
    const v=Math.max(0,Math.min(size-1.00001,(.5+.5*z/half)*(size-1)));
    const i=Math.floor(u),j=Math.floor(v),k=i+j*size,a=u-i,b=v-j;
    return (((1-b)*(field[k]*(1-a)+field[k+1]*a)+b*(field[k+size]*(1-a)+field[k+size+1]*a))-128)/1.5;
  };
})();
