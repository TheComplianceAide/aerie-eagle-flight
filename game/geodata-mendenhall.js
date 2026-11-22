/* Optical color and material observations complement the stock survey. */
window.prepareMendenhallGeodata=async function(T,read,maxTexture){
  const meta=await read.json('mendenhall-scene-preview.json');
  if(meta.epsg!==6337||meta.bounds.length!==4||meta.bounds[0]!==-4201||meta.bounds[1]!==-4001||
     meta.bounds[2]!==4799||meta.bounds[3]!==4499||meta.origin[0]!==526511||meta.origin[1]!==6477009||
     meta.width!==900||meta.height!==850||meta.step!==10)throw Error('Wrong Mendenhall scene registration');
  // Repack the original tundra texture without changing its texel resolution.
  // Reuse its sampler slot: native terrain already uses the WebGL2 minimum of 16.
  const terrainSize=2048, atlasWidth=terrainSize+2, atlasHeight=2*meta.height+terrainSize+2;
  if(atlasWidth>maxTexture||atlasHeight>maxTexture)throw Error('Mendenhall atlas exceeds the device texture size');
  const [optical,classes,earth]=await Promise.all([
    read.pixels('mendenhall-scene-rgb.jpg',meta.width,meta.height),
    read.gzip('mendenhall-scene-material.bin',4*meta.width*meta.height),
    read.pixels('alpine-tundra.webp',terrainSize,terrainSize)
  ]);
  if(classes.byteLength!==4*meta.width*meta.height)throw Error('Invalid Mendenhall class grid');
  const packed=new Uint8Array(4*atlasWidth*atlasHeight);
  for(let y=0;y<meta.height;y++){
    packed.set(optical.subarray(4*y*meta.width,4*(y+1)*meta.width),4*y*atlasWidth);
    packed.set(classes.subarray(4*y*meta.width,4*(y+1)*meta.width),4*(y+meta.height)*atlasWidth);
  }
  for(let y=0;y<terrainSize+2;y++){
    const row=(y+terrainSize-1)%terrainSize;
    const src=earth.subarray(row*terrainSize*4,(row+1)*terrainSize*4),out=(2*meta.height+y)*atlasWidth*4;
    packed.set(src.subarray(src.length-4),out);packed.set(src,out+4);packed.set(src.subarray(0,4),out+4*(terrainSize+1));
  }
  const atlas=new T.DataTexture(packed,atlasWidth,atlasHeight,T.RGBAFormat);
  atlas.minFilter=atlas.magFilter=T.LinearFilter;atlas.generateMipmaps=false;atlas.flipY=false;atlas.needsUpdate=true;
  const uniforms={mendAtlas:{value:atlas},mendExtent:{value:new T.Vector4(...meta.bounds)},
    mendGrid:{value:new T.Vector4(meta.width,meta.height,atlasWidth,atlasHeight)}};
  const glsl=`
    uniform sampler2D mendAtlas;
    uniform vec4 mendGrid;
    uniform vec4 mendExtent;

    vec4 mendField(vec2 uv,float layer){
      vec2 src=vec2(.5)+clamp(uv,0.,1.)*(mendGrid.xy-1.);
      src.y+=layer*mendGrid.y;
      return texture2D(mendAtlas,src/mendGrid.zw);
    }
    vec4 mendEarth(vec2 uv){
      vec2 src=fract(uv*vec2(1.,-1.))*2048.+vec2(1.,2.*mendGrid.y+1.);
      return texture2D(mendAtlas,src/mendGrid.zw);
    }
    vec2 mendUV(vec2 xz){return (xz-mendExtent.xy)/(mendExtent.zw-mendExtent.xy);}
    float mendBoundary(vec2 xz){
      vec2 edge=min(xz-mendExtent.xy,mendExtent.zw-xz);
      return smoothstep(5.,165.,min(edge.x,edge.y));
    }
    float mendY(vec3 c){return dot(c,vec3(.24,.62,.14));}
    vec3 mendPigment(vec3 stock,vec3 observed,float amount,float brightness){
      float sy=max(.07,mendY(stock)),oy=max(.07,mendY(observed));
      vec3 mixChroma=clamp(observed/oy,vec3(.65),vec3(1.48));
      float tonal=mix(1.,clamp(oy/(sy+.045),.77,1.22),brightness);
      return mix(stock,sy*mixChroma*tonal,clamp(amount,0.,.73));
    }`;
  function replace(code,needle,value){
    if(!code.includes(needle))throw Error('Mendenhall stock shader hook missing: '+needle);
    return code.replace(needle,value);
  }
  function ground(shader){
    shader=replace(glsl+shader,'texture2D(earth,p.xz*.14).rgb','mendEarth(p.xz*.14).rgb');
    shader=replace(shader,'outerPhoto,snow,earth;','outerPhoto,snow;');
    shader=replace(shader,'tundraColour(earth,p,nn,base,d)','tundraColour(p,nn,base,d)');
    shader=replace(shader,'tundraColour(sampler2D scan,','tundraColour(');
    const i=shader.indexOf('vec3 tundraColour('),j=shader.indexOf('void main()',i);
    if(i<0||j<=i)throw Error('Mendenhall tundra tile helper missing');
    shader=shader.slice(0,i)+shader.slice(i,j).replaceAll('texture2D(scan,','mendEarth(')+shader.slice(j);
    shader=replace(shader,'float ice=sheet;float snowfield=',`
      vec2 obsUV=mendUV(p.xz);
      vec4 mendObsClass=mendField(obsUV,1.);
      vec3 observation=mendField(obsUV,0.).rgb;
      float bound=mendBoundary(p.xz);
      float observedDry=bound*max(mendObsClass.r,mendObsClass.b)*(1.-mendObsClass.a);
      float protectedShore=1.;
#ifdef MENDENHALL_BANK
      protectedShore=mix(.14,.62,smoothstep(90.,520.,distance(cameraPosition,p)));
#endif
      // Orthophoto still supplies all fine texture. A broader contemporary
      // observation can guide the chroma of bare rock and stands.
      base=mendPigment(base,observation,observedDry*protectedShore*(.59-.45*sheet),.25);
      float ice=sheet;float snowfield=`);
    shader=replace(shader,'float forest=smoothstep(.004,.05,base.g-base.r)*smoothstep(.012,.085,base.g-base.b);',`
      float forest=smoothstep(.004,.05,base.g-base.r)*smoothstep(.012,.085,base.g-base.b);
      forest=mix(forest,clamp(.82*mendObsClass.r+.18*forest,0.,1.),bound*max(mendObsClass.r,mendObsClass.b)*.39*protectedShore*(1.-sheet));
      // Observed snow below alpine elevation is accepted only on the registered
      // glacier, not indiscriminately on bright gravel or known forest.
      float modernSnow=mendObsClass.g*bound*max(sheet,smoothstep(620.,1000.,p.y));
      snowfield=max(snowfield,modernSnow*.69*(1.-mendObsClass.r));
    `);
    shader=replace(shader,'float nearAir=exp(-max(0.,cameraPosition.y+p.y)/1250.);',`
      // Keep the surveyed ice face, cracks and light. Observations do not
      // set ice boundaries; seasonal surface balance works inside stock ice.
      float iceObs=sheet*bound*max(mendObsClass.g,mendObsClass.b)*(1.-mendObsClass.a);
      base=mendPigment(base,observation,iceObs*.44,.12);
      base=mix(base,base*vec3(1.06,1.045,1.034),modernSnow*.42);
      float nearAir=exp(-max(0.,cameraPosition.y+p.y)/1250.);`);
    return shader;
  }
  function water(material){
    Object.assign(material.uniforms,uniforms);
    material.fragmentShader=replace(glsl+material.fragmentShader,'vec3 outgoingLight=mix(scattered,reflectionSample,reflectance)',`
      vec2 observedUV=mendUV(surface);
      vec4 observedField=mendField(observedUV,1.);
      vec3 observedBase=mendField(observedUV,0.).rgb;
      // Visible-water chroma is an empirical appearance cue, not depth or
      // turbidity. Preserve sky reflection, waterline, waves and sun glints.
      scattered=mendPigment(scattered,observedBase,.56*mendBoundary(surface)*observedField.a,.22);
      vec3 outgoingLight=mix(scattered,reflectionSample,reflectance)`);
    material.needsUpdate=true;
  }
  let terrain=null;
  if(meta.terrain){
    const t=meta.terrain,[left,top,right,bottom]=t.bounds;
    if(left!==420||top!==1635||right!==550||bottom!==1750||t.step!==1||t.calibration?.holdout?.n<51||!Number.isFinite(t.calibration?.holdout?.residualP05P25P50P75P95M?.[2])||
       Math.abs(t.calibration.holdout.residualP05P25P50P75P95M[2])>=2)throw Error('Invalid inland LiDAR extent');
    const w=right-left,h=bottom-top;
    const grid=new DataView((await read.gzip('mendenhall-inland-dtm.bin',w*h*2)).buffer);
    if(grid.byteLength!==w*h*2)throw Error('Invalid inland LiDAR length');
    const E=(x,z)=>.01*grid.getInt16(2*(x+w*z),true)-18;
    const smooth=(x)=>{x=Math.max(0,Math.min(1,x));return x*x*(3.-2.*x);};
    terrain=(x,z,stock)=>{
      const edge=Math.min(x-left,right-x,z-top,bottom-z);
      if(edge<=1.||stock<4)return stock;
      const u=x-left-.5,v=z-top-.5,ix=Math.floor(u),iz=Math.floor(v),a=u-ix,b=v-iz;
      const obs=(E(ix,iz)*(1-a)+E(ix+1,iz)*a)*(1-b)+(E(ix,iz+1)*(1-a)+E(ix+1,iz+1)*a)*b;
      const delta=obs-stock;
      return stock+delta*smooth((edge-1)/18)*smooth((3.2-Math.abs(delta))/1.5);
    };
  }
  function tint(x,z){
    const col=Math.floor((x-meta.bounds[0])/meta.step),row=Math.floor((z-meta.bounds[1])/meta.step);
    if(col<0||col>=meta.width||row<0||row>=meta.height)return null;
    const index=4*(row*meta.width+col);
    if(classes[index]<128)return null;
    return window.aerieCanopyPigment(optical[index],optical[index+1],optical[index+2]);
  }
  return {meta,uniforms,ground,water,terrain,tint};
};
