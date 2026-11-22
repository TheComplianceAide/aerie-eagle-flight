/* Co-registered coastal optical and canopy observations. */
window.prepareCoastalGeodata=async function(T,region,read,maxTexture){
 const stem=region+'-fused-preview';
 const inflate=(suffix,limit)=>read.gzip(stem+suffix+'.bin',limit);
 const meta=await read.json(stem+'.json');
 const expected=region==='acadia'?[32619,564651,4907768]:[25833,417891.40852244536,7541045.9268330615];
 if(meta.world!==region||meta.epsg!==expected[0]||Math.abs(meta.origin[0]-expected[1])>.1||Math.abs(meta.origin[1]-expected[2])>.1)throw Error('Wrong coastal preview frame');
 const [l,t,r,b]=meta.bounds,{width:w,height:h}=meta;
 if(!Number.isInteger(w)||!Number.isInteger(h)||!Number.isFinite(meta.step)||meta.step<=0||w<32||h<32||w>2048||h>2048||Math.abs((r-l)-w*meta.step)>.02||Math.abs((b-t)-h*meta.step)>.02)throw Error('Invalid coastal preview extent');
 const packed=await Promise.all([
  read.pixels(stem+'-color.jpg',w,h),
  inflate('-material',w*h*4)
 ]);
 if(packed[1].length!==w*h*4)throw Error('Wrong spectral material dimensions');
 let orthoPixels=null,ow=0,oh=0,orthoCode='',orthoBounds=null;
 if(meta.ortho){
   const o=meta.ortho,[x0,z0,x1,z1]=o.localRect;
   if(region!=='acadia'||o.epsg!==32619||x1-x0!==o.width||z1-z0!==o.height||
      !Number.isInteger(o.width)||!Number.isInteger(o.height)||o.width<1||o.height<1||
      (w+o.width)*Math.max(2*h,o.height)>8_000_000||w+o.width>maxTexture||o.height>maxTexture)throw Error('Invalid Acadia aerial image');
   ow=o.width;oh=o.height;
   orthoPixels=await read.pixels(stem+'-ortho.jpg',ow,oh);
   orthoBounds=new T.Vector4(x0,z0,x1,z1);
   orthoCode=`
     vec2 nearEdge=min(xz-coastAerialBounds.xy,coastAerialBounds.zw-xz);
     vec2 nearUV=(xz-coastAerialBounds.xy)/(coastAerialBounds.zw-coastAerialBounds.xy);
     // Optical mosaic is dry backing color only; keep measured water and surf.
     float nearOrtho=smoothstep(6.,60.,min(nearEdge.x,nearEdge.y))*smoothstep(3.,14.,wp.y-shoreLevel)
            *smoothstep(.38,.80,normal.y)*.78;
     vec2 orthoSrc=vec2(.5)+clamp(nearUV,0.,1.)*(coastFineSize-1.);
     photo=mix(photo,texture2D(coastObs,orthoSrc/coastTextureSize).rgb,nearOrtho);`;
 }
 const W=ow+w,H=Math.max(oh,2*h);
 if(W>maxTexture||H>maxTexture||W*H>8_000_000)throw Error("Coastal texture exceeds its size limit");
 const bytes=new Uint8Array(W*H*4);
 if(orthoPixels)for(let y=0;y<oh;y++)bytes.set(orthoPixels.subarray(4*y*ow,4*(y+1)*ow),4*y*W);
 for(let y=0;y<h;y++){
   bytes.set(packed[0].subarray(4*y*w,4*(y+1)*w),4*(y*W+ow));
   bytes.set(packed[1].subarray(4*y*w,4*(y+1)*w),4*((y+h)*W+ow));
 }
 const texture=new T.DataTexture(bytes,W,H,T.RGBAFormat);
 texture.minFilter=texture.magFilter=T.LinearFilter;texture.generateMipmaps=false;texture.flipY=false;texture.needsUpdate=true;
 const uniforms={coastObs:{value:texture},coastObsBounds:{value:new T.Vector4(l,t,r,b)},
   coastObsSize:{value:new T.Vector2(w,h)},coastTextureSize:{value:new T.Vector2(W,H)},coastFineSize:{value:new T.Vector2(ow,oh)},
   coastObsSnow:{value:region==='lofoten'?.64:.25}};
 if(orthoBounds)uniforms.coastAerialBounds={value:orthoBounds};
 const glsl=`
 uniform sampler2D coastObs;
 uniform vec4 coastObsBounds,coastAerialBounds;
 uniform vec2 coastObsSize,coastTextureSize,coastFineSize;
 uniform float coastObsSnow;
 vec2 coastObsUV(vec2 p){return (p-coastObsBounds.xy)/(coastObsBounds.zw-coastObsBounds.xy);}
 vec4 coastObsSample(vec2 uv,float layer){
  vec2 a=vec2(.5)+clamp(uv,0.,1.)*(coastObsSize-1.)+vec2(coastFineSize.x,layer*coastObsSize.y);
  return texture2D(coastObs,a/coastTextureSize);
 }
 float coastObsEdge(vec2 p){vec2 d=min(p-coastObsBounds.xy,coastObsBounds.zw-p);return smoothstep(8.,125.,min(d.x,d.y));}
 float coastObsY(vec3 c){return dot(c,vec3(.24,.62,.14));}
 vec3 coastObsPigment(vec3 stock,vec3 measured,float factor,float tone){
  float s=max(.025,coastObsY(stock)),m=max(.045,coastObsY(measured));
  vec3 chroma=clamp(measured/m,vec3(.61),vec3(1.55));
  return mix(stock,s*chroma*mix(1.,clamp(m/(s+.026),.72,1.26),tone),clamp(factor,0.,.74));
 }`;
 const inject=(s,at,replacement)=>{if(!s.includes(at))throw Error('Coast stock shader hook missing: '+at);return s.replace(at,replacement);};
 const ground=mat=>{
  mat.fragmentShader=inject(glsl+mat.fragmentShader,'float snow=smoothstep(.53,.82,min(min(photo.r,photo.b),photo.g));',`
    float snow=smoothstep(.53,.82,min(min(photo.r,photo.b),photo.g));
    vec2 coastUVNew=coastObsUV(xz);
    vec4 coastClasses=coastObsSample(coastUVNew,1.);
    vec3 coastRGB=coastObsSample(coastUVNew,0.).rgb;
    float coastData=coastObsEdge(xz)*orthoCoverage*smoothstep(.7,11.,wp.y-shoreLevel);
    float coastDry=coastData*max(coastClasses.r,coastClasses.b)*(1.-coastClasses.a);
    photo=coastObsPigment(photo,coastRGB,coastDry*.68,.32);
    veg=mix(veg,max(min(1.,coastClasses.r*.89+veg*.11),dense),coastClasses.r*coastDry*.56);
    snow=max(snow,coastClasses.g*coastData*smoothstep(350.,690.,wp.y)*coastObsSnow);

  `+orthoCode);
  Object.assign(mat.uniforms,uniforms);mat.needsUpdate=true;
 };
 const water=mat=>{
  mat.fragmentShader=inject(glsl+mat.fragmentShader,'vec3 body=mix(deep,shoal,shallow);',`
    // Same waterline, wind, geometry, reflection and foam.
    vec2 coastWaterUV=coastObsUV(p);
    vec4 coastWaterClass=coastObsSample(coastWaterUV,1.);
    vec3 coastWaterRGB=pow(max(coastObsSample(coastWaterUV,0.).rgb,vec3(.006)),vec3(2.2));
    float coastWaterWeight=.58*coastObsEdge(p)*coastWaterClass.a*smoothstep(22.,61.,bank);
    deep=coastObsPigment(deep,coastWaterRGB,coastWaterWeight,.26);
    vec3 body=mix(deep,shoal,shallow);`);
  Object.assign(mat.uniforms,uniforms);mat.needsUpdate=true;
 };
 const candidates=[];
 if(meta.canopy){
  const raw=new DataView((await inflate('-canopy',6200*7)).buffer);
  if(raw.byteLength%7!==0||raw.byteLength/7>6200)throw Error('Bad coastal canopy candidate pack');
  for(let k=0;k<raw.byteLength;k+=7)candidates.push([raw.getInt16(k,true)/2,raw.getInt16(k+2,true)/2,raw.getUint8(k+4)/8,raw.getUint8(k+5)/16,raw.getUint8(k+6)/255]);
 }
 let terrain=null;
 if(meta.terrain){
   const tt=meta.terrain,[ll,top,rr,bb]=tt.bounds;
   const n=tt.width,h=tt.height,step=tt.step;
   if(!Number.isInteger(n)||!Number.isInteger(h)||n<2||h<2||n*h>245000||step!==1||rr-ll!==n||bb-top!==h)throw Error('Invalid coastal terrain registration');
   const d=new DataView((await inflate('-terrain',n*h*2)).buffer);
   if(d.byteLength!==n*h*2||tt.verticalVerified!==true)throw Error('Unverified coastal height grid');
   const smooth=x=>(x=Math.max(0,Math.min(1,x)),x*x*(3-2*x));
   const E=(x,z)=>d.getInt16(2*(z*n+x),true);
   terrain=(x,z,stock)=>{
     const edge=Math.min(x-ll,rr-x,z-top,bb-z);
     if(edge<=step||stock<tt.minDryM)return stock;
     const xx=(x-ll)/step-.5,zz=(z-top)/step-.5,i=Math.floor(xx),j=Math.floor(zz),u=xx-i,v=zz-j;
     const a=E(i,j),b=E(i+1,j),c=E(i,j+1),d=E(i+1,j+1);
     if([a,b,c,d].some(x=>x===-32768))return stock;
     const observed=tt.scale*((a*(1-u)+b*u)*(1-v)+(c*(1-u)+d*u)*v)+tt.offset;
     if(observed<tt.minDryM)return stock;
     const delta=observed-stock;
     return stock+delta*smooth((edge-step)/22)*smooth((tt.maxResidualM-Math.abs(delta))/(tt.maxResidualM-tt.fullResidualM));
   };
 }
 function tint(x,z){
   const col=Math.floor((x-l)/meta.step),row=Math.floor((z-t)/meta.step);
   if(col<0||col>=w||row<0||row>=h)return null;
   const index=4*(row*w+col);
   if(packed[1][index]<128)return null;
   return window.aerieCanopyPigment(packed[0][index],packed[0][index+1],packed[0][index+2]);
 }
 return {meta,ground,water,terrain,tint,terrainBounds:meta.terrain?.bounds,candidates,stats:{candidateCount:candidates.length,accepted:0,stockTrees:0}};
};
