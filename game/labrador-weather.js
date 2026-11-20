// A passing sunshower over Lac Berté. The bow is computed from the view ray,
// including the water reflection camera, and lit rain lies in front of far hills.
window.addBerteWeather=function addBerteWeather(T,scene,{sun,clock,sky,terrain,settings,survey}) {
  const mask=new T.TextureLoader().load('labrador-cloud-cover.webp');
  mask.wrapS=mask.wrapT=T.MirroredRepeatWrapping;
  const mark=survey.landmarks.find(p=>/rainbow|shower|arc-en-ciel/i.test(p.name));
  const center=new T.Vector2(mark?.x??40,mark?.z??-570);
  const lake=settings.water;
  const showerCenter={value:center.clone()};
  const uniforms={
    berteCloud:{value:mask},berteTime:clock,berteSun:{value:sun},
    berteRainCenter:showerCenter,berteLake:{value:lake},
  };
  const fields=`
    uniform sampler2D berteCloud;uniform float berteTime,berteLake;
    uniform vec3 berteSun;uniform vec2 berteRainCenter;
  `;
  const scattering=`
    vec3 berteScatter(vec3 base,vec3 ray,float visibleMetres){
      vec2 axis=normalize(-berteSun.xz);
      vec2 side=vec2(-axis.y,axis.x);
      // Intersect the view ray with a wide, wind-driven rain curtain.
      // Cloud cover behind the eagle provides an open path for direct sunlight.
      float heading=dot(ray.xz,axis);
      if(heading<.06) return base;
      vec2 shower=berteRainCenter;
      float hit=dot(shower-cameraPosition.xz,axis)/heading;
      if(hit<0.||hit>visibleMetres+480.) return base;
      vec3 p=cameraPosition+ray*hit;
      float lateral=dot(p.xz-shower,side);
      float z=(p.y-berteLake)/1100.;
      float strip=texture2D(berteCloud,vec2(lateral*.00046+z*.16+berteTime*.00035,.27+z*.041)).r;
      float fibers=texture2D(berteCloud,vec2(lateral*.0026+z*.63,.32+z*.057-berteTime*.00014)).r;
      float depth=smoothstep(0.,510.,hit)*(1.-smoothstep(visibleMetres-180.,visibleMetres+480.,hit));
      float spread=(1.-smoothstep(1720.,3900.,abs(lateral)))*(1.-smoothstep(.8,2.05,z));
      float moisture=spread*depth*(.65+.35*strip);
      vec3 veil=vec3(.30,.366,.425);
      float ragged=clamp((.52+.36*strip+.24*fibers)*(1.-smoothstep(.40,1.35,z)),0.,1.);
      base=mix(base,veil,moisture*ragged*.29);
      // The primary ranges from violet near 40° to red at 42°. A soft dark
      // band separates it from the faint, reversed double-reflection arc.
      float radius=degrees(acos(clamp(dot(ray,-berteSun),-1.,1.)));
      float inner=1.-smoothstep(39.0,42.2,radius);
      float dark=smoothstep(41.8,43.3,radius)*(1.-smoothstep(49.3,51.4,radius));
      base*=1.-dark*moisture*.14;
      base+=vec3(.028,.031,.032)*inner*moisture;
      if(radius<37.5||radius>55.) return base;
      vec3 delta=(vec3(radius)-vec3(42.02,41.20,40.43))/vec3(.44,.53,.52);
      vec3 spectrum=exp(-delta*delta)*vec3(.30,.168,.173);
      float yellow=(radius-41.65)/.41;
      spectrum+=vec3(.143,.111,.009)*exp(-yellow*yellow);
      vec3 other=(vec3(radius)-vec3(50.65,51.76,52.74))/vec3(.72,.83,.84);
      spectrum+=exp(-other*other)*vec3(.035,.024,.033);
      // The high crown crosses thinner rain than the two feet. Unequal
      // droplet columns reveal the texture of the cloud behind each hue.
      float showerDensity=mix(.52,1.08,smoothstep(.10,.82,.78*strip+.22*fibers));
      float crown=smoothstep(.10,.46,ray.y);
      float southLight=.82+.18*smoothstep(-1700.,1700.,lateral);
      return base+spectrum*moisture*showerDensity*(1.-.22*crown)*southLight;
    }
  `;
  function extend(material,source,anchor,replacement) {
    if(!material.fragmentShader.includes(anchor)) throw new Error('Lac Berté weather shader anchor missing');
    Object.assign(material.uniforms,uniforms);
    material.fragmentShader=source+material.fragmentShader.replace(anchor,replacement);
    material.needsUpdate=true;
  }
  extend(sky.material,fields+scattering,'gl_FragColor=vec4(texture2D(map,uv).rgb,1.);',`
    gl_FragColor=vec4(texture2D(map,uv).rgb,1.);
    /* before local precipitation */
    gl_FragColor.rgb=berteScatter(gl_FragColor.rgb,d,95000.);`);
  extend(terrain,fields+scattering,'gl_FragColor=vec4(mix(c,aerialHaze,dep*(.72+.28*skyView)),1.);',`
    gl_FragColor=vec4(mix(c,aerialHaze,dep*(.72+.28*skyView)),1.);
    /* before local precipitation */
    gl_FragColor.rgb=berteScatter(gl_FragColor.rgb,normalize(wp-cameraPosition),d);`);

  // Sparse wind-slanted drops only appear inside the actual shower. Vertex
  // positions wrap in world coordinates, so a racing eagle overtakes them.
  const count=420,coords=[],ends=[];
  let seed=318503;
  function rand(){seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;}
  for(let i=0;i<count;i++){
    const x=rand()*32,y=rand()*16,z=rand()*32;
    coords.push(x,y,z,x,y,z);ends.push(0,1);
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(coords,3));
  geometry.setAttribute('tip',new T.Float32BufferAttribute(ends,1));
  const rainMaterial=new T.ShaderMaterial({uniforms:{berteTime:clock,dropTravel:{value:new T.Vector2()},dropWind:{value:new T.Vector2()},amount:{value:0},origin:{value:new T.Vector3()}},
    transparent:true,depthWrite:false,
    vertexShader:`attribute float tip;uniform float berteTime;uniform vec3 origin;uniform vec2 dropTravel,dropWind;varying float fade;
      void main(){vec3 span=vec3(32.,16.,32.);vec3 speed=vec3(dropWind.x,-7.4,dropWind.y);
        vec3 rel=mod(position+vec3(dropTravel.x,-7.4*berteTime,dropTravel.y)-origin+span*.5,span)-span*.5;
        fade=(1.-smoothstep(8.,15.4,length(rel.xz)))*(1.-smoothstep(5.5,8.,abs(rel.y)))*(.34+.66*tip);
        gl_Position=projectionMatrix*viewMatrix*vec4(origin+rel+tip*speed*.021,1.);}`,
    fragmentShader:`uniform float amount;varying float fade;void main(){gl_FragColor=vec4(.58,.68,.72,amount*fade*.26);
      #include <colorspace_fragment>
    }`});
  const drops=new T.LineSegments(geometry,rainMaterial);
  drops.name='Fine rain over the narrows';drops.frustumCulled=false;drops.visible=false;scene.add(drops);
  const light=scene.children.find(o=>o.isDirectionalLight),strength=light?.intensity;
  const axis=new T.Vector2(-sun.x,-sun.z).normalize(),sideX=-axis.y,sideZ=axis.x;
  function smooth(a,b,x){const v=Math.max(0,Math.min(1,(x-a)/(b-a)));return v*v*(3-2*v);}
  const air={},travel=rainMaterial.uniforms.dropTravel.value,wind=rainMaterial.uniforms.dropWind.value;
  let lastTime=-1;
  return (t,player,field)=>{
    // The curtain passes over the narrows. Inside it, drops respond to the
    // same local gust as the eagle, integrating distance so they never jump.
    const shift=240*Math.sin(t*field.advection/240);
    showerCenter.value.set(center.x+field.direction.x*shift,center.y+field.direction.z*shift);
    const dx=player.x-showerCenter.value.x,dz=player.z-showerCenter.value.y;
    const across=dx*sideX+dz*sideZ,along=dx*axis.x+dz*axis.y;
    const wet=(1-smooth(140,470,Math.abs(along)))*(1-smooth(650,1600,Math.abs(across)));
    if(lastTime<0 || t<lastTime)travel.set(0,0);
    const dt=lastTime<0?0:Math.max(0,t-lastTime);
    lastTime=t;
    if(wet>.017){
      field.sample(player.x,player.y,player.z,t,air);
      wind.set(air.windX,air.windZ);
      travel.addScaledVector(wind,dt);
    }
    rainMaterial.uniforms.amount.value=wet;
    rainMaterial.uniforms.origin.value.set(player.x,player.y,player.z);
    drops.visible=wet>.017;
    if(light) light.intensity=strength*(1.04-.22*wet);
  };
};
