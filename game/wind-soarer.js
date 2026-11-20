// A soaring bird marks one of the actual updrafts. The lightweight mesh reuses
// the player's plumage photograph; its orbit and altitude are in world metres.
window.makeWindSoarer = function makeWindSoarer(T, scene, world, field) {
  const region = world.region;
  const harrier = region === 'milford';
  const golden = region === 'swiss' || region === 'canyon';
  const seaEagle = region === 'lofoten';
  const name = harrier ? 'Swamp harrier' : golden ? 'Golden eagle' : seaEagle ? 'White-tailed eagle' : 'Bald eagle';
  const span = harrier ? 1.52 : seaEagle ? 2.35 : 2.16;
  const speed = harrier ? 10.8 : 12.6;
  const radius = harrier ? 23 : 29;
  const point = {}, core = {};
  const clearance = world.flightClearance || world.clearance || world.height;
  const clamp = T.MathUtils.clamp;
  const pos = [], uv = [], color = [], indices = [];
  const map = scene.getObjectByName('Dorsal and ventral plumage')?.material?.[0]?.map;

  function vertex(x, y, z, u, v, rgb) {
    const index = pos.length / 3;
    pos.push(x, y, z); uv.push(u, 1 - v); color.push(...rgb);
    return index;
  }

  // The photograph carries the slots between individual primaries. A low-
  // resolution set of cambered ribs supplies the wing thickness and torso.
  const columns = 38, rows = 18;
  const length = span*(harrier ? .445 : .381);
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (let j=0; j<=rows; j++) for (let i=0; i<=columns; i++) {
      const u=i/columns, v=j/rows, x=(u-.5)*span, ax=Math.abs(x)*2/span;
      const bodyWidth=(.053+.084*Math.sin(Math.PI*clamp(v/.78,0,1)))*span/2.16;
      const round=Math.max(0,1-(x/bodyWidth)**2);
      const breast=.085*Math.sin(Math.PI*clamp(v/.79,0,1))*Math.sqrt(round);
      const wing=ax*ax*(harrier ? .135 : .055)+.018*Math.sin(Math.PI*ax);
      const airfoil=.028*Math.sin(Math.PI*clamp((v-.14)/.55,0,1));
      const z=(v-.44)*length + (harrier ? .025*ax*ax : 0);
      const shade=side>0 ? 1 : .72;
      const paleHead=ax<.11 && v<.32, paleTail=ax<.29 && v>.64;
      const tint=(golden||harrier) && (paleHead||paleTail) ? [.18,.119,.074] :
        seaEagle && paleHead ? [.55,.45,.32] : [1,1,1];
      vertex(x,wing+side*(breast+airfoil),z,u,v,tint.map(c=>c*shade));
      if (!i || !j) continue;
      const a=base+j*(columns+1)+i, b=a-columns-1;
      if(side>0)indices.push(a,b,a-1,b,b-1,a-1);
      else indices.push(a,a-1,b,b,a-1,b-1);
    }
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  geometry.setAttribute('color',new T.Float32BufferAttribute(color,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
  const material=new T.MeshLambertMaterial({
    vertexColors:true,side:T.DoubleSide,map,
    alphaTest:.23,alphaToCoverage:true
  });
  const bird=new T.Mesh(geometry,material);
  bird.name='Thermal soarer · '+name; bird.visible=false; scene.add(bird);
  let source=null,theta=0,altitude=0,vertical=0,sampleAt=0,checkedAt=0;
  let orbitFloor=-Infinity;

  function locateCore(t) {
    field.core(source,altitude,t,core);
    if(world.bounds){
      const b=world.bounds, room=radius+span;
      core.x=clamp(core.x,b.minX+room,b.maxX-room);
      core.z=clamp(core.z,b.minZ+room,b.maxZ-room);
    }
  }
  function checkOrbit(t) {
    locateCore(t);
    orbitFloor=-Infinity;
    for(let i=0;i<24;i++){
      const a=i*Math.PI/12;
      const x=core.x+Math.cos(a)*radius,z=core.z+Math.sin(a)*radius;
      orbitFloor=Math.max(orbitFloor,clearance(x,z));
    }
  }
  function reset(s, launchCore, glanceDegrees=0) {
    source=launchCore || field.launchCenter;
    if(!source){
      let best=Infinity;
      for(const c of field.centers){
        const dx=c.x-s.x, dz=c.z-s.z;
        const behind=Math.max(0,dx*Math.sin(s.yaw)+dz*Math.cos(s.yaw));
        const score=Math.hypot(dx,dz)+2*behind;
        if(score<best){source=c;best=score;}
      }
    }
    if(!source){bird.visible=false;return;}
    altitude=Math.max(s.y+13,source.y+53);
    // The plume tilts with altitude. Recheck after raising the entire circuit
    // above a slope or trees so even the inside wing clears the terrain.
    for(let i=0;i<4;i++){
      checkOrbit(s.elapsed);
      if(altitude>=orbitFloor+24)break;
      altitude=orbitFloor+24;
    }
    // Pick the point on the same physical orbit with the clearest line of
    // sight from this departure. The eagle stays on that orbit after launch.
    const yaw=(s.yaw||0)+glanceDegrees*Math.PI/180;
    const fx=-Math.sin(yaw), fz=-Math.cos(yaw);
    let best=-Infinity;
    for(let i=0;i<20;i++){
      const a=i*Math.PI/10, cx=Math.cos(a), sz=Math.sin(a);
      const dx=core.x+cx*radius-s.x,dz=core.z+sz*radius-s.z;
      const depth=dx*fx+dz*fz;
      let score=depth>0 ? -Math.hypot((dx*-fz+dz*fx)/depth-.12,(altitude-s.y)/depth-.15) : -10+depth*.01;
      score+=.10*Math.abs(-sz*fx+cx*fz);
      for(let j=1;j<=7;j++){
        const u=j/8;
        if(clearance(s.x+dx*u,s.z+dz*u)>s.y+(altitude-s.y)*u-.75){score-=2;break;}
      }
      if(score>best){theta=a;best=score;}
    }
    vertical=0;sampleAt=checkedAt=-Infinity;
    bird.visible=true;
    update(0,s);
  }
  function update(dt,s) {
    if(!source)return;
    const t=s.elapsed;
    locateCore(t);
    const cx=Math.cos(theta),sz=Math.sin(theta);
    const x=core.x+radius*cx,z=core.z+radius*sz;
    if(t>=sampleAt){
      field.sample(x,altitude,z,t,point);sampleAt=t+.20;
    }
    if(t>=checkedAt){checkOrbit(t);checkedAt=t+1.15;}
    // Maintain airspeed while circling a ground-anchored plume. Ground speed
    // varies around the turn, and the beak points slightly into a crosswind.
    const along=-sz*point.windX+cx*point.windZ, across=cx*point.windX+sz*point.windZ;
    const groundSpeed=along+Math.sqrt(Math.max(1,speed*speed-across*across));
    const bank=Math.atan2(speed*groundSpeed,9.81*radius);
    const sink=(harrier ? .82 : .98)/Math.max(.65,Math.cos(bank));
    const climb=point.thermal+point.ridge+point.gustLift-sink;
    vertical+=(Math.max(climb,clamp((orbitFloor+8-altitude)*.55,-5,3))-vertical)*(1-Math.exp(-1.5*dt));
    altitude+=vertical*dt;
    theta=(theta+groundSpeed/radius*dt)%(Math.PI*2);
    const tx=-Math.sin(theta), tz=Math.cos(theta);
    locateCore(t);
    bird.position.set(core.x+radius*tz,altitude,core.z-radius*tx);
    const heading=Math.atan2(-(tx*groundSpeed-point.windX),-(tz*groundSpeed-point.windZ));
    bird.rotation.set(-.025+.014*Math.sin(t*.8),heading,-bank+.034*Math.sin(t*.67),'YXZ');
  }
  return {reset,update};
};
