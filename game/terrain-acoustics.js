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
  window.aerieEchoSurfaces=function(world,ear){
    const floor=world.elevation||world.height,hits=[];
    for(let i=0;i<20;i++){
      const a=2*Math.PI*i/20,dx=Math.cos(a),dz=Math.sin(a);
      let lo=0;
      for(const r of [10,20,34,53,79,115,165,232,315]){
        const x=ear.x+r*dx,z=ear.z+r*dz;
        if(floor(x,z)<ear.y+.8){lo=r;continue;}
        let hi=r;
        for(let n=0;n<5;n++){
          const m=(hi+lo)*.5;
          if(floor(ear.x+m*dx,ear.z+m*dz)<ear.y+.8)lo=m;else hi=m;
        }
        const range=(hi+lo)*.5,px=ear.x+range*dx,pz=ear.z+range*dz;
        const gx=(floor(px+3,pz)-floor(px-3,pz))/6,gz=(floor(px,pz+3)-floor(px,pz-3))/6;
        const slope=Math.hypot(gx,gz),face=(gx*dx+gz*dz)/Math.hypot(1,slope);
        if(range>9&&slope>.49&&face>.39){
          const rock=clamp((slope-.37)/.82,0,1);
          const strength=rock*face*face/(1+range/90);
          const canopy=world.groundCover?.(px,pz)||0;
          hits.push({x:px,y:ear.y+.8,z:pz,dx,dz,range,strength:strength*(1-.46*clamp(canopy,0,1))});
        }
        break;
      }
    }
    hits.sort((a,b)=>b.strength-a.strength);
    const best=hits[0],other=best&&hits.find(h=>h.dx*best.dx+h.dz*best.dz<.48);
    return best?(other?[best,other]:[best]):[];
  };
  window.aerieCascadeSource=function(world,ear){
    const land=world.elevation||world.height;
    let chosen,score=-1;
    const impacts=world.spraySources;
    const sources=impacts?.length?impacts:(world.landmarks||[]).filter(s=>/fall|cascade/i.test(s.name)&&!/beach|pass|lookout/i.test(s.name));
    for(const p of sources){
      const y=land(p.x,p.z)+Math.min(11,3+.18*(p.drop||12));
      const d=Math.hypot(ear.x-p.x,ear.y-y,ear.z-p.z);
      const weight=(.65+Math.min(45,p.drop||15)*.036)/(1+(d/120)**2);
      if(weight>score){score=weight;chosen={x:p.x,y,z:p.z,distance:d};}
    }
    return chosen;
  };
  // Parcels accelerate down ledges, then arrive at the pool as a broken pulse.
  window.aerieChutePulse=(x,z,t)=>.52+.30*Math.sin(1.23*t+.031*x-.017*z)+.18*Math.sin(2.21*t-.018*x+.043*z);
})();
