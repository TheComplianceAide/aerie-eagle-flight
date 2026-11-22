// Close material detail. The measured terrain and scene lighting own the
// macro shape and color. The packs only describe the fine surface response.
(() => {
  const shader = `
    uniform sampler2D closeRock;
    struct RockDetail { vec3 slope; float pigment; float rough; float visibility; };
    vec2 rockTileHash(vec2 id){
      return fract(sin(vec2(dot(id,vec2(127.1,311.7)),dot(id,vec2(269.5,183.3))))*43758.5453);
    }
    vec4 rockGrainTile(vec2 id,vec2 p,vec2 dx,vec2 dy,float directional){
      vec2 phase=rockTileHash(id);
      // Preserve the bedding direction for sedimentary material. Isotropic
      // rock can additionally rotate by a quarter turn without mirroring.
      float turn=floor(phase.y*4.)*1.570796327*(1.-directional);
      vec2 cs=vec2(cos(turn),sin(turn));
      mat2 rotation=mat2(cs.x,cs.y,-cs.y,cs.x);
      vec4 grain=textureGrad(closeRock,rotation*p+phase,rotation*dx,rotation*dy);
      grain.gb=transpose(rotation)*(grain.gb*2.-1.);
      return grain;
    }
    vec4 rockGrain(vec2 p,vec2 dx,vec2 dy,float directional){
      // A triangular lattice blends independent offsets continuously at
      // cell edges. Filter the unwrapped coordinates, never the tile index.
      vec2 q=vec2(p.x+p.y*.577350269,p.y*1.154700538);
      vec2 id=floor(q),f=fract(q);
      vec3 weight=vec3(1.-f.x-f.y,f.x,f.y);
      if(weight.x<0.){id+=1.;weight=vec3(-weight.x,1.-f.x,1.-f.y);}
      vec2 signCell=f.x+f.y>1.?vec2(-1.):vec2(1.);
      weight*=weight;
      weight/=dot(weight,vec3(1.));
      return rockGrainTile(id,p,dx,dy,directional)*weight.x
        +rockGrainTile(id+vec2(signCell.x,0.),p,dx,dy,directional)*weight.y
        +rockGrainTile(id+vec2(0.,signCell.y),p,dx,dy,directional)*weight.z;
    }
    float closeRockVisibility(vec3 dx,vec3 dy,float distanceToEye){
      float footprint=max(length(dx),length(dy));
      return (1.-smoothstep(9.,24.,distanceToEye))*(1.-smoothstep(.10,.35,footprint));
    }
    RockDetail closeRockDetail(vec3 at,vec3 dx,vec3 dy,vec3 n,float distanceToEye,float directional){
      float visible=closeRockVisibility(dx,dy,distanceToEye);
      RockDetail result=RockDetail(vec3(0.),0.,.78,visible);
      if(visible<.001)return result;
      vec3 w=pow(abs(n),vec3(6.));w/=dot(w,vec3(1.));
      w=max(w-vec3(.035),0.);w/=dot(w,vec3(1.));
      float frequency=mix(.75,.63,directional);
      vec3 p=at*frequency;
      dx*=frequency;dy*=frequency;
      // A shallow sedimentary dip follows the established projected beds.
      vec3 dip=vec3(.064,1.,-.05);
      float bed=dot(p,dip),bedDx=dot(dx,dip),bedDy=dot(dy,dip);
      vec2 stretch=vec2(1.,mix(1.,2.15,directional));
      vec4 aggregate=vec4(0.);
      if(w.x>0.){
        vec4 a=rockGrain(vec2(p.z,bed)*stretch,vec2(dx.z,bedDx)*stretch,vec2(dy.z,bedDy)*stretch,directional);
        result.slope+=w.x*vec3(0.,a.b,a.g);aggregate+=w.x*a;
      }
      if(w.y>0.){
        vec4 a=rockGrain(p.xz,dx.xz,dy.xz,directional);
        result.slope+=w.y*vec3(a.g,0.,a.b);aggregate+=w.y*a;
      }
      if(w.z>0.){
        vec4 a=rockGrain(vec2(p.x,bed)*stretch,vec2(dx.x,bedDx)*stretch,vec2(dy.x,bedDy)*stretch,directional);
        result.slope+=w.z*vec3(a.g,a.b,0.);aggregate+=w.z*a;
      }
      result.slope-=n*dot(n,result.slope);
      result.pigment=(aggregate.r-.5)*2.;
      result.rough=clamp(aggregate.a,.57,.97);
      return result;
    }
    vec3 closeRockNormal(vec3 n,RockDetail detail,float weight){
      // Resist the temptation to turn the cavity photograph into geometry.
      return normalize(n+detail.slope*(weight*.64));
    }
    float closeRockSheen(vec3 n,vec3 sun,vec3 view,float rough){
      return pow(max(0.,dot(n,normalize(sun+view))),mix(18.,5.,rough))*.072*(1.-.55*rough);
    }
  `;
  // The existing field atlas already records geology and cover classes. This
  // projection only changes how the close specimen is reconstructed.
  const fieldShader=`
    float closeFieldWeight(vec3 dx,vec3 dy,float range){
      return (1.-smoothstep(9.,24.,range))*(1.-smoothstep(.08,.36,max(length(dx),length(dy))));
    }
    vec2 fieldTileHash(vec2 cell){
      return fract(sin(vec2(dot(cell,vec2(127.1,311.7)),dot(cell,vec2(269.5,183.3))))*43758.5453);
    }
    vec4 fieldCloseTap(sampler2D map,vec2 key,vec2 p,vec2 dx,vec2 dy,float tile){
      vec2 shift=fieldTileHash(key);
      vec2 uv=p+shift*2.;
      if(tile<0.)return textureGrad(map,uv,dx,dy);
      vec2 phase=abs(mod(uv,2.)-1.);
      vec2 flip=2.*step(1.,mod(uv,2.))-1.;
      vec2 slot=vec2(mod(tile,4.),floor(tile*.25));
      // Explicit gradients have the same magnitude on either side of a wrap.
      // Limit the source LOD near the packed gutters.
      vec2 gx=flip*dx*.2421875,gy=flip*dy*.2421875;
      float support=min(1.,.060/max(max(length(gx),length(gy)),.00001));
      return textureGrad(map,(slot+.015625+phase*.96875)*.25,gx*support,gy*support);
    }
    vec4 fieldCloseCapture(sampler2D map,vec2 p,vec2 dx,vec2 dy,float tile){
      vec2 grid=vec2(p.x+.5773503*p.y,1.154701*p.y);
      vec2 base=floor(grid),f=fract(grid);
      vec3 w=vec3(1.-f.x-f.y,f.x,f.y);
      float stepTo=1.;
      if(w.x<0.){base+=1.;w=vec3(-w.x,1.-w.y,1.-w.z);stepTo=-1.;}
      w*=w;w/=dot(w,vec3(1.));
      return w.x*fieldCloseTap(map,base,p,dx,dy,tile)
           +w.y*fieldCloseTap(map,base+vec2(stepTo,0.),p,dx,dy,tile)
           +w.z*fieldCloseTap(map,base+vec2(0.,stepTo),p,dx,dy,tile);
    }
    float fieldCloseRock(sampler2D map,vec3 p,vec3 dx,vec3 dy,vec3 n,float tile){
      // Retain the silhouette and broad surface color of the surveyed wall.
      // The geologic sample supplies only local grain in a stable tangent plane.
      vec3 weight=pow(abs(n),vec3(5.));weight/=dot(weight,vec3(1.));
      weight=max(vec3(0.),weight-.035);weight/=dot(weight,vec3(1.));
      p*=.58;dx*=.58;dy*=.58;
      vec4 rock=vec4(0.);
      if(weight.x>0.)rock+=weight.x*fieldCloseCapture(map,p.zy,dx.zy,dy.zy,tile);
      if(weight.y>0.)rock+=weight.y*fieldCloseCapture(map,p.xz,dx.xz,dy.xz,tile);
      if(weight.z>0.)rock+=weight.z*fieldCloseCapture(map,p.xy,dx.xy,dy.xy,tile);
      float heightDetail=tile>=0.?.76*(rock.a-.5):0.;
      return clamp(heightDetail+dot(rock.rgb,vec3(.24,.60,.16))-.37,-.44,.44);
    }
  `;
  let graniteBitmap, enabled=false;
  function graniteTexture(T){
    const map=new T.Texture(graniteBitmap);
    map.colorSpace=T.NoColorSpace;
    map.flipY=false;
    map.wrapS=map.wrapT=T.RepeatWrapping;
    map.anisotropy=12;
    map.needsUpdate=true;
    return map;
  }
  const arrayShader=shader.replace('sampler2D closeRock','highp sampler2DArray wallRelief')
    .replace('textureGrad(closeRock,rotation*p+phase,rotation*dx,rotation*dy)',
      'textureGrad(wallRelief,vec3(rotation*p+phase,1.),rotation*dx,rotation*dy)');
  const layerSize=1536;
  let canyonLayers;
  async function fetchMap(name, imageOrientation='from-image'){
    const result=await fetch(window.aerieAssetURL?.(name)||name);
    if(!result.ok)throw Error('Unable to load '+name);
    return createImageBitmap(await result.blob(),{colorSpaceConversion:'none',premultiplyAlpha:'none',imageOrientation});
  }
  async function prepare(region,supported){
    enabled=supported;
    if(!enabled)return;
    try {
      if(region==='yosemite'&&!graniteBitmap)graniteBitmap=await fetchMap('close-rock-granite-analog.png','flipY');
      if(region==='canyon'&&!canyonLayers)await prepareCanyon();
    } catch(error) { console.warn('Using native rock appearance.',error); }
  }
  async function prepareCanyon(){
    const canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(layerSize,layerSize):document.createElement('canvas');
    canvas.width=canvas.height=layerSize;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    const stride=layerSize*4;
    const bytes=new Uint8Array(stride*layerSize*2);
    const files=['canyon-scarp-relief.webp','close-rock-sandstone-analog.png'];
    const images=await Promise.all(files.map(name=>fetchMap(name)));
    for(const [layer,image] of images.entries()){
      ctx.clearRect(0,0,layerSize,layerSize);
      ctx.drawImage(image,0,0,layerSize,layerSize);image.close();
      const rgba=ctx.getImageData(0,0,layerSize,layerSize).data;
      // Three uploads a data array without the legacy image texture's flipY.
      for(let y=0;y<layerSize;y++){
        bytes.set(rgba.subarray(y*stride,(y+1)*stride),(layerSize*(layer+1)-y-1)*stride);
      }
    }
    canyonLayers=bytes;
  }
  function canyonTexture(T){
    const map=new T.DataArrayTexture(canyonLayers,layerSize,layerSize,2);
    map.wrapS=map.wrapT=T.RepeatWrapping;
    map.generateMipmaps=true;
    map.minFilter=T.LinearMipmapLinearFilter;
    map.magFilter=T.LinearFilter;
    map.anisotropy=4;
    map.needsUpdate=true;
    return map;
  }
  window.aerieCloseMaterial={shader,get fieldShader(){return enabled?fieldShader:null;},
    prepare,graniteTexture,graniteReady:()=>enabled&&!!graniteBitmap,
    arrayShader,canyonTexture,canyonReady:()=>enabled&&!!canyonLayers};
})();
