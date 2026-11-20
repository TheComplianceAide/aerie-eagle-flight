// Diffuse light arriving at the bird from visible terrain. The six hemispherical
// basis directions remain in survey coordinates as the camera and bird turn.
window.makeTerrainBounce=function(T,scene,world){
  const axes=[[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0],[0,-1,0]];
  const value=axes.map(()=>new T.Vector3()),target=value.map(v=>v.clone());
  const blocked=axes.map(()=>0),targetBlocked=blocked.slice();
  const normals=new T.Vector3(),col=new T.Color(),tiles=[],images=new Map();
  const elev=world.elevation||world.height, sun=world.sunDirection;
  // Average source photos down once. A broad wall reflects the local material
  // colour without imprinting high-frequency texture or baked aerial shadows.
  function samplePhoto(tex,u,v){
    if(!tex?.image)return false;
    let pixels=images.get(tex);
    if(!pixels){
      const cv=document.createElement('canvas');cv.width=cv.height=64;
      const ctx=cv.getContext('2d',{willReadFrequently:true});ctx.drawImage(tex.image,0,0,64,64);
      pixels=ctx.getImageData(0,0,64,64).data;images.set(tex,pixels);
    }
    const x=Math.max(0,Math.min(63,Math.floor(u*64))),y=Math.max(0,Math.min(63,Math.floor(v*64)));
    const k=(y*64+x)*4;col.setRGB(pixels[k]/255,pixels[k+1]/255,pixels[k+2]/255,T.SRGBColorSpace);
    return true;
  }
  let atlas=null;
  for(const m of scene.children){
    const u=m.material?.uniforms;
    if(!u)continue;
    if(u.aerial&&u.halfMap&&u.ranges){atlas=u;continue;}
    const p=m.geometry?.attributes.position,uv=m.geometry?.attributes.uv;
    if(!p||!(u.photo&&uv||u.localPhoto&&u.photoRect))continue;
    const g=m.geometry;if(!g.boundingBox)g.computeBoundingBox();
    const {min,max}=g.boundingBox;
    if(!(max.x-min.x>20&&max.z-min.z>20))continue;
    if(u.localPhoto){const rect=u.photoRect.value;
      tiles.push({min,max,tex:u.localPhoto.value,x:rect.x,z:rect.y,ux:1/rect.z,vz:1/rect.z,u:0,v:0});
    }else{
      const n=p.count-1,sx=p.getX(n)-p.getX(0),sz=p.getZ(n)-p.getZ(0);
      if(Math.abs(sx)<1||Math.abs(sz)<1)continue;
      tiles.push({min,max,tex:u.photo.value,x:p.getX(0),z:p.getZ(0),ux:(uv.getX(n)-uv.getX(0))/sx,
        vz:(uv.getY(0)-uv.getY(n))/sz,u:uv.getX(0),v:1-uv.getY(0)});
    }
  }
  tiles.sort((a,b)=>(a.max.x-a.min.x)-(b.max.x-b.min.x));
  function reflectance(x,y,z){
    col.setRGB(.22,.20,.16);
    if(atlas){const near=Math.max(Math.abs(x),Math.abs(z))<atlas.halfMap.value-75;
      const span=near?atlas.halfMap.value*2:atlas.farSpan.value;
      samplePhoto((near?atlas.aerial:atlas.ranges).value,.5+x/span,.5+z/span);
    }else{
      const tile=tiles.find(a=>x>=a.min.x&&x<=a.max.x&&z>=a.min.z&&z<=a.max.z);
      if(tile)samplePhoto(tile.tex,tile.u+(x-tile.x)*tile.ux,tile.v+(z-tile.z)*tile.vz);
    }
    // The Colorado orthophotos contain deep baked shadows on the sandstone;
    // recover its warm mineral albedo like the visible terrain shader.
    if(world.region==='canyon'){
      const grain=Math.min(1,Math.sqrt(.23*col.r+.63*col.g+.14*col.b));
      col.r=col.r*.32+(.33+.32*grain)*.68;
      col.g=col.g*.32+(.104+.19*grain)*.68;
      col.b=col.b*.32+(.038+.096*grain)*.68;
    }
    const water=world.waterLevel;
    if(Number.isFinite(water)&&y<water+.19)col.setRGB(.038,.095,.105);
    else if(world.region==='canyon'&&world.habitat?.wet?.(x,z,y))col.setRGB(.053,.105,.087);
  }
  const arid=world.region==='canyon';
  const directions=[];
  for(const [j,vertical] of [-.90,-.42,.04,.55].entries())for(let i=0;i<8;i++){
    const angle=(i+(j%2)*.5)*Math.PI/4,r=Math.sqrt(1-vertical*vertical);
    directions.push(new T.Vector3(r*Math.cos(angle),vertical,r*Math.sin(angle)));
  }
  const ranges=[2,6,13,24,40,64,96,142,210];
  function gather(p){
    for(const t of target)t.set(0,0,0);targetBlocked.fill(0);
    for(const ray of directions){
      let lo=0,hi=0;
      for(const r of ranges){
        if(p.y+ray.y*r<=elev(p.x+ray.x*r,p.z+ray.z*r)){hi=r;break;}lo=r;
      }
      if(!hi)continue;
      for(let i=0;i<4;i++){const mid=(lo+hi)*.5;if(p.y+ray.y*mid>elev(p.x+ray.x*mid,p.z+ray.z*mid))lo=mid;else hi=mid;}
      const x=p.x+ray.x*hi,z=p.z+ray.z*hi,y=elev(x,z);
      normals.set(elev(x-2,z)-elev(x+2,z),4,elev(x,z-2)-elev(x,z+2)).normalize();
      let sunlight=Math.max(0,normals.dot(sun));
      for(const d of [12,38,100,260,680]){
        if(sunlight<=0)break;
        sunlight*=T.MathUtils.smoothstep(y+1+sun.y*d-elev(x+sun.x*d,z+sun.z*d),-.6,3);
      }
      reflectance(x,y,z);
      const reach=1/(1+(hi/76)**2);
      // A nearby wall occupies a broad solid angle. In a deeply cut sandstone
      // basin it also receives a second, diffuse return from the opposite wall.
      const close=1-T.MathUtils.smoothstep(hi,11,83);
      const secondary=arid?.75+.37*(1-normals.y):.40;
      const energy=(secondary+(arid?6.5:4.9)*sunlight)*reach*(1+(arid?1.85:.85)*close);
      for(let k=0;k<axes.length;k++){
        const a=axes[k],weight=Math.max(0,ray.x*a[0]+ray.y*a[1]+ray.z*a[2])*.126;
        target[k].addScaledVector({x:col.r,y:col.g,z:col.b},energy*weight);
        targetBlocked[k]+=reach*weight;
      }
    }
  }
  let next=-1,last=-1,previous=new T.Vector3(Infinity,Infinity,Infinity);
  function update(p,time){
    const jump=p.distanceToSquared(previous)>80*80||time<last||last<0;
    if(jump||time>=next){gather(p);next=time+.16;}
    const alpha=jump?1:1-Math.exp(-Math.max(0,time-last)*5);
    for(let i=0;i<axes.length;i++){value[i].lerp(target[i],alpha);blocked[i]+=(targetBlocked[i]-blocked[i])*alpha;}
    last=time;previous.copy(p);
  }
  return {value,blocked,update};
};
