// Metres, body lengths per second and local encounter sizes. Schools vary
// together in age and size, while mature stream predators hold individual lies.
window.makeFishSchools=function(region,waterAt,disturb){
  const roster={
    alaska:['sockeye','dolly-varden'],swiss:['lake-trout','rainbow'],canyon:['rainbow','brown-trout','carp'],
    yosemite:['rainbow','brown-trout'],crater:['kokanee','rainbow'],
    yellowstone:['brown-trout','rainbow'],acadia:['saithe'],lofoten:['saithe','atlantic-cod'],
    winnipesaukee:['smallmouth','atlantic-salmon','lake-trout'],surry:['yellow-perch','smallmouth'],
    dixville:['brook-trout'],
    labrador:['brook-trout'],
    moosehead:['yellow-perch','atlantic-salmon','lake-trout']
  }[region];
  // Minimum/maximum group, length range, spacing in body lengths, cruise effort.
  const traits={
    'yellow-perch':[18,84,.14,.32,1.6,.86],'convict-tang':[9,38,.13,.24,1.85,.81],
    'yellow-tang':[1,6,.16,.22,3,.58],kokanee:[7,27,.28,.42,2,.82],saithe:[9,35,.30,.61,2,.93],
    sockeye:[3,13,.55,.77,2.5,.82],'dolly-varden':[1,5,.35,.62,3,.58],rainbow:[1,3,.28,.54,4,.74],
    'brown-trout':[1,2,.38,.62,5,.6],'lake-trout':[1,3,.48,.83,5,.65],'brook-trout':[1,3,.24,.47,4.6,.65],
    'atlantic-salmon':[1,4,.38,.62,4,.79],smallmouth:[1,5,.25,.46,3,.63],
    carp:[2,8,.39,.70,2,.4],'atlantic-cod':[2,8,.43,.79,2.8,.66],'blue-cod':[1,3,.28,.47,3,.56],spotty:[3,11,.16,.26,2.4,.72]
  };
  const tau=2*Math.PI,clamp=(v,a,b)=>Math.min(b,Math.max(a,v)),angle=d=>Math.atan2(Math.sin(d),Math.cos(d));
  function populate(site,random,curated,selection=roster){
    const schools=[];
    for(let j=0;j<selection.length;j++){
      if(!curated&&random()<.36)continue;
      const skin=selection[j],[lo,hi,short,long,gap,cruise]=traits[skin];
      const size=short+(long-short)*random(),count=lo+Math.floor((hi-lo+1)*random()**1.45);
      const offset=j*(curated?5.2:8),home=site.findWater(site.x+Math.sin(j*2.4)*offset,site.z+Math.cos(j*2.4)*offset,9);
      if(!home)continue;
      const members=[],direction=site.stream?site.stream.upstream(home.x,home.z):random()*tau,spacing=gap*size;
      const school={skin,home,members,spacing,cruise,phase:random()*tau,direction,stream:site.stream};
      for(let k=0;k<count;k++){
        const r=spacing*Math.sqrt(k)*.91,a=k*2.4+random()*.3;
        const x=home.x+r*Math.cos(a),z=home.z+r*Math.sin(a),level=waterAt(x,z);
        if(!Number.isFinite(level))continue;
        const length=size*(.88+random()*.24),preferred=length*(.62+random()*.9),phase=random()*tau;
        const space=site.stream?.depth(x,z);
        if(site.stream&&space<length*.36)continue;
        const depth=site.stream?Math.min(preferred,space-length*.16):preferred;
        const residentId=region+'/school/'+home.x.toFixed(2)+','+home.z.toFixed(2)+'/'+skin+'/'+k;
        members.push({skin,residentId,x,z,y:level-depth,depth,level,length,heading:direction+random()*.25,pitch:0,bank:0,
          speed:cruise*length,phase,mode:0,effort:.3,seed:random()*tau,scare:0,lastSwirl:-Infinity,offsetX:x-home.x,offsetZ:z-home.z});
      }
      if(members.length)schools.push(school);
    }
    return schools;
  }
  function update(school,player,t,dt){
    const {members,home,spacing,cruise}=school,d=school.direction;
    // A holding trout faces a small current. Shoaling fish follow a meandering
    // feeding front. Neighbours transmit a turn with a slight individual delay.
    const travel=school.stream?.38:members.length>4?3.2:1.6;
    const cx=home.x+travel*Math.sin(t*.086+school.phase),cz=home.z+travel*.72*Math.sin(t*.113+school.phase*.7);
    const leader=members[0],heading=leader.heading;
    for(let i=0;i<members.length;i++){
      const a=members[i],dx=a.x-player.x,dz=a.z-player.z;
      const threat=Math.hypot(dx,dz)<4&&player.y-a.level<7&&player.y>=a.level;
      a.scare=Math.max(threat?1:0,a.scare-dt*.65);
      const tx=cx+a.offsetX+.6*Math.sin(t*.27+a.seed),tz=cz+a.offsetZ+.55*Math.cos(t*.19+a.seed);
      let vx=tx-a.x,vz=tz-a.z;
      // A spawning adult generally faces into the current at its holding lie.
      // Displacement from the gravel pocket steers it back to the same reach.
      if(school.stream){vx+=1.55*Math.cos(d);vz+=1.55*Math.sin(d);}
      if(i&&members.length>4){vx+=.85*Math.cos(heading);vz+=.85*Math.sin(heading);}
      if(Math.hypot(vx,vz)<.38){vx+=Math.cos(d);vz+=Math.sin(d);}
      for(let n=0;n<members.length;n++){
        if(n===i)continue;
        const b=members[n],rx=a.x-b.x,rz=a.z-b.z,r2=rx*rx+rz*rz;
        if(r2<spacing*spacing&&r2>.0001){const repulse=.5*(spacing/Math.sqrt(r2)-1);vx+=rx*repulse;vz+=rz*repulse;}
      }
      if(a.scare){const norm=Math.hypot(dx,dz)||1;vx+=6*a.scare*dx/norm;vz+=6*a.scare*dz/norm;}
      const look=a.length*2+a.speed*.55;
      if(!Number.isFinite(waterAt(a.x+Math.cos(a.heading)*look,a.z+Math.sin(a.heading)*look))){
        vx=home.x-a.x;vz=home.z-a.z;
      }
      const delta=angle(Math.atan2(vz,vx)-a.heading);
      a.heading+=clamp(delta,-dt*(1.15+3*a.scare),dt*(1.15+3*a.scare));
      const pulse=.5+.5*Math.sin(t*1.37+a.seed);
      const effort=cruise*(.27+.80*pulse)+2.8*a.scare;
      a.speed+=(a.length*effort-a.speed)*(1-Math.exp(-dt*2.7));
      const x=a.x+Math.cos(a.heading)*a.speed*dt,z=a.z+Math.sin(a.heading)*a.speed*dt,level=waterAt(x,z);
      if(Number.isFinite(level)&&(!school.stream||school.stream.depth(x,z)>=a.length*.36)){
        if(school.stream){
          const flow=school.stream.current(a.x,a.z),ax=x-flow*Math.cos(d)*dt,az=z-flow*Math.sin(d)*dt;
          if(school.stream.depth(ax,az)>=a.length*.36){a.x=ax;a.z=az;a.level=waterAt(ax,az);}
        }else{a.x=x;a.z=z;a.level=level;}
      }
      // A feeding rise approaches the film, rolls through the turn, then
      // sounds again. Individuals in a school reach the surface at different times.
      const surfaceFeeder=a.skin==='atlantic-salmon'||a.skin==='sockeye'||a.skin==='brook-trout';
      const period=(surfaceFeeder?7.4:13)+a.seed*(surfaceFeeder?.65:1.4);
      const cycle=(t/period+(a.risePhase??a.seed/tau))%1;
      // Adult Pacific salmon on their return to spawn no longer make feeding rises.
      const rise=(school.stream||(!surfaceFeeder&&members.length>8&&i%5!==0))?0:Math.max(0,1-Math.abs(cycle-.45)*4.5);
      const lift=rise*rise*(3-2*rise)*(1-a.scare);
      const normalDepth=Math.max(a.length*.13,a.depth-.048*Math.sin(t*.83+a.seed));
      const y=a.level-(normalDepth*(1-lift)+a.length*.09*lift)-.36*a.scare;
      const bed=school.stream?a.level-school.stream.depth(a.x,a.z)+a.length*.15:-Infinity;
      const swim=Math.max(bed,y);
      const ceiling=school.stream?a.level-a.length*.12:Infinity;
      a.pitch=clamp((swim-a.y)*1.3,-.22,.22);
      a.y=clamp(a.y+(swim-a.y)*(1-Math.exp(-3*dt)),bed,ceiling);
      a.bank=clamp(-delta*.16,-.38,.38)+.38*lift*Math.sin(a.seed+cycle*tau);a.phase+=dt*tau*(.76+effort*1.35);
      a.effort=clamp(pulse*.56+a.scare,.1,1);
      const depth=a.level-a.y;
      const rising=depth<a.length*.37&&lift>.52;
      const fleeing=a.scare>.75&&depth<a.length*.86;
      if(dt>0&&(rising||fleeing)&&t-a.lastSwirl>(fleeing?1.8:2.4)){
        const strength=fleeing?.86:.55+.45*lift;
        disturb(a,t,strength);
        a.lastSwirl=t;
      }
    }
  }
  return {populate,update,roster};
};
