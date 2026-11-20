// Continuous sheets of spray detach at the ledges of Nugget Falls. Mist takes
// time to acquire the air velocity. The heavier drops fall back into the chute.
window.makeNuggetSpray=function makeNuggetSpray(THREE,scene,world,texture){
  const field=world.windField, clock={value:0};
  const wind=new THREE.Vector2(field.direction.x,field.direction.z);
  const positions=[],seeds=[],slopes=[];
  let state=27347;
  function random(){state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;}
  for(const impact of world.spraySources){
    const count=Math.round(18+1.5*Math.min(35,impact.drop));
    for(let i=0;i<count;i++){
      const x=impact.x+(random()-.5)*9, z=impact.z+(random()-.5)*8;
      const y=world.height(x,z)+1.1;
      positions.push(x,y,z);
      seeds.push(random(),random(),random(),i%3===0?1:0);
      // Wind curling up a rising bank entrains spray above its surface.
      slopes.push(Math.min(1.25,Math.max(0,(world.height(x+wind.x*16,z+wind.y*16)-y)/16)));
    }
  }
  const quad=new THREE.PlaneGeometry(1,1),geo=new THREE.InstancedBufferGeometry();
  geo.index=quad.index;geo.attributes.position=quad.attributes.position;geo.attributes.uv=quad.attributes.uv;
  geo.setAttribute('spraySource',new THREE.InstancedBufferAttribute(new Float32Array(positions),3));
  geo.setAttribute('spraySeed',new THREE.InstancedBufferAttribute(new Float32Array(seeds),4));
  geo.setAttribute('bankSlope',new THREE.InstancedBufferAttribute(new Float32Array(slopes),1));
  geo.instanceCount=slopes.length;
  geo.boundingSphere=new THREE.Sphere().setFromPoints(world.spraySources.map(p=>new THREE.Vector3(p.x,world.height(p.x,p.z),p.z)));
  geo.boundingSphere.radius+=100;
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,
    uniforms:{sprayClock:clock,sprayNoise:{value:texture},sprayWind:{value:wind},
      sprayOrigin:{value:new THREE.Vector2(field.origin.x,field.origin.z)},sprayPhase:{value:field.phase},sprayAdvection:{value:field.advection}},
    vertexShader:`
      attribute vec3 spraySource;attribute vec4 spraySeed;attribute float bankSlope;
      uniform vec2 sprayWind,sprayOrigin;uniform float sprayPhase,sprayAdvection,sprayClock;
      varying vec2 puffUv;varying vec4 particle;
      ${window.aerieGustGLSL}
      void main(){
        bool drop=spraySeed.w>.5;
        float duration=drop?1.35+1.1*spraySeed.y:4.0+4.8*spraySeed.y;
        float cycle=sprayClock/duration+spraySeed.x;
        float life=fract(cycle),age=life*duration;
        float seed=fract(spraySeed.z+floor(cycle)*.61803);
        // Sample along the trajectory at emission and at mid-flight. A new gust
        // reaches successive puffs in sequence without moving their source.
        float birth=sprayClock-age;
        vec2 source=spraySource.xz-sprayOrigin;
        float gust=.5*(aerieGust(source,birth,sprayWind,sprayPhase,sprayAdvection)+
          aerieGust(source+sprayWind*age*1.7,birth+.5*age,sprayWind,sprayPhase,sprayAdvection));
        float speed=2.65+3.45*gust;
        float travel=speed*(age-1.2*(1.-exp(-age/1.2)))*(drop?.48:1.);
        vec2 crosswind=vec2(-sprayWind.y,sprayWind.x);
        vec3 center=spraySource;
        center.xz+=sprayWind*travel+crosswind*(seed-.5)*(drop?2.:1.35)*age;
        center.xz+=vec2(-1.7,.65)*(1.-exp(-age))*2.;
        center.y+=drop?(4.+3.*seed)*age-3.8*age*age:
          (4.5+5.*seed)*(1.-exp(-age*.77))+bankSlope*travel+age*(.25+.57*gust);
        vec4 v=viewMatrix*vec4(center,1.);
        float diameter=drop?.13+.17*seed:2.1+life*(8.+13.*seed);
        vec2 corner=position.xy;
        if(drop)corner.y*=2.8;
        else{float a=seed*6.283+.26*age;corner=mat2(cos(a),sin(a),-sin(a),cos(a))*corner;}
        v.xy+=corner*diameter;gl_Position=projectionMatrix*v;
        puffUv=uv;particle=vec4(life,seed,drop?1.:0.,gust);
      }`,
    fragmentShader:`
      uniform sampler2D sprayNoise;varying vec2 puffUv;varying vec4 particle;
      void main(){
        vec2 q=puffUv*2.-1.;float radius=dot(q,q);if(radius>=1.)discard;
        float life=particle.x,seed=particle.y;
        float grain=texture2D(sprayNoise,puffUv*.22+vec2(seed,seed*.73)-vec2(.006,.019)*life).r;
        float body=smoothstep(.03,.70,(1.-radius)*(.35+1.15*grain));
        float fade=smoothstep(0.,.12,life)*(1.-smoothstep(.53,1.,life));
        vec3 light=mix(vec3(.61,.72,.77),vec3(.95,.95,.89),.27+.62*grain);
        float alpha=body*fade*mix(.15+.055*particle.w,.68,particle.z);
        gl_FragColor=vec4(mix(light,vec3(.94,.98,1.),particle.z*.62),alpha);
      }`});
  const mesh=new THREE.Mesh(geo,material);mesh.name='Nugget Falls wind-blown spray';scene.add(mesh);
  return clock;
};
