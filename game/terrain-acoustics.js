// Direct-path screening and first rock-wall returns, in the survey's metre scale.
(() => {
  const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  window.aerieSoundPath=function(world,ear,source){
    const terrain=world.elevation||world.height;
    const dx=source.x-ear.x,dz=source.z-ear.z,len=Math.hypot(dx,dz);
    if(len<4)return 0;
    const steps=clamp(Math.ceil(len/7),6,52);
    let shield=0;
    for(let i=1;i<steps;i++){
      const t=i/steps,x=ear.x+t*dx,z=ear.z+t*dz;
      const excess=terrain(x,z)-(ear.y+(source.y-ear.y)*t);
      // Compare the intercept to the width of the first diffraction zone.
      // A wall well inside the path removes more short-wave hiss than bass.
      const width=.72+.54*Math.sqrt(.34*len*t*(1-t));
      shield=Math.max(shield,clamp((excess+.28*width)/(1.75*width),0,1));
    }
    return shield*shield*(3-2*shield);
  };
  window.aerieEchoSurfaces=function(world,ear,extended=false){
    const floor=world.elevation||world.height,hits=[];
    const ranges=extended?[10,20,34,53,79,115,165,232,315,430,580,770,1020,1350]:[10,20,34,53,79,115,165,232,315];
    const originY=floor(ear.x,ear.z),rise=Math.max(originY+3,ear.y-60);
    for(let i=0;i<24;i++){
      const a=2*Math.PI*i/24,dx=Math.cos(a),dz=Math.sin(a);
      let previous=0,previousY=originY;
      for(const r of ranges){
        const x=ear.x+r*dx,z=ear.z+r*dz,y=floor(x,z);
        const change=y-previousY;
        if(y<rise||change<Math.max(4,.20*(r-previous))){
          previous=r;previousY=y;continue;
        }
        let lo=previous,hi=r;
        const crossing=Math.max(rise,previousY+.40*change);
        for(let n=0;n<5;n++){
          const m=(hi+lo)*.5;
          if(floor(ear.x+m*dx,ear.z+m*dz)<crossing)lo=m;else hi=m;
        }
        const range=hi,px=ear.x+range*dx,pz=ear.z+range*dz;
        const gx=(floor(px+3,pz)-floor(px-3,pz))/6,gz=(floor(px,pz+3)-floor(px,pz-3))/6;
        const slope=Math.hypot(gx,gz);
        const face=(gx*dx+gz*dz)/Math.hypot(1,slope);
        if(range>9&&slope>.7&&face>.36){
          const rock=clamp((slope-.48)/1.35,.16,1);
          hits.push({x:px,z:pz,nx:-gx/slope,nz:-gz/slope,range,rock});
          break;
        }
        previous=r;previousY=y;
      }
    }
    hits.sort((a,b)=>b.rock/(1+b.range/120)-a.rock/(1+a.range/120));
    const best=hits[0],other=best&&hits.find(h=>h.nx*best.nx+h.nz*best.nz<.68);
    return best?(other?[best,other]:[best]):[];
  };
  // Intersect the image ray with the cliff, then test both real legs. The
  // height map can support a local face, with no orographic surface above its rim.
  window.aerieCliffReturn=function(world,source,ear,face,out={},path=window.aerieSoundPath){
    const {x,z,nx,nz,range,rock}=face;
    const a=(source.x-x)*nx+(source.z-z)*nz,b=(ear.x-x)*nx+(ear.z-z)*nz;
    if(a<=1||b<=1)return null;
    out.x=source.x-2*a*nx;out.y=source.y;out.z=source.z-2*a*nz;
    const f=b/(a+b);
    const hit=out.hit||(out.hit={});
    hit.x=ear.x+(out.x-ear.x)*f;hit.y=ear.y+(out.y-ear.y)*f;hit.z=ear.z+(out.z-ear.z)*f;
    const lateral=Math.hypot(hit.x-x,hit.z-z);
    if(lateral>clamp(.9*range,35,220))return null;
    const floor=world.elevation||world.height;
    let back=-Infinity;
    for(const depth of [4,8,14])back=Math.max(back,floor(hit.x-depth*nx,hit.z-depth*nz));
    const front=floor(hit.x+5*nx,hit.z+5*nz);
    if(back-front<10||hit.y>back+2||hit.y<front-2)return null;
    // Offset the endpoint toward air before screening to avoid self-shadowing.
    hit.x+=2.5*nx;hit.y+=.5;hit.z+=2.5*nz;
    const shadow=Math.max(path(world,ear,hit),path(world,source,hit));
    if(shadow>.9)return null;
    const cover=clamp(world.groundCover?.(hit.x,hit.z)||0,0,1);
    const incidence=(a+b)/Math.hypot(out.x-ear.x,out.y-ear.y,out.z-ear.z);
    out.strength=rock*(.50+.36*incidence)*(1-.55*cover)*(1-.78*shadow);
    out.cutoff=(5000+9000*rock)*(1-.53*cover)*(1-.7*shadow);
    return out;
  };
  window.aerieCascadeSource=function(world,ear){
    const land=world.elevation||world.height;
    let chosen,score=-1;
    const impacts=world.waterfalls?.impacts||world.spraySources;
    const sources=impacts?.length?impacts:(world.landmarks||[]).filter(s=>/fall|cascade/i.test(s.name)&&!/beach|pass|lookout/i.test(s.name));
    for(const p of sources){
      const y=(p.y??land(p.x,p.z))+Math.min(11,3+.18*(p.drop||12));
      const d=Math.hypot(ear.x-p.x,ear.y-y,ear.z-p.z);
      const weight=(.65+Math.min(45,p.drop||15)*.036)/(1+(d/120)**2);
      if(weight>score){
        const reach=Math.min(350,Math.max(60,31+14*(p.width??15)+1.15*(p.drop??50)));
        score=weight;chosen={x:p.x,y,z:p.z,distance:d,reach};
      }
    }
    return chosen;
  };
  // Parcels accelerate down ledges, then arrive at the pool as a broken pulse.
  window.aerieChutePulse=(x,z,t)=>.52+.30*Math.sin(1.23*t+.031*x-.017*z)+.18*Math.sin(2.21*t-.018*x+.043*z);
})();
