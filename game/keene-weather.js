// Morning inversion in the Ashuelot valley. Integrate patchy, shallow fog
// up to the visible surface so nearby houses stay clear and successive tree
// lines, bridge piers and distant hills disappear into the same air.
window.addKeeneWeather=function addKeeneWeather(T,scene,{clock,sky,terrain,sun}){
  const light=scene.children.find(o=>o.isDirectionalLight);
  light.color.set(0xffb684);light.intensity=1.88;
  const hemisphere=scene.children.find(o=>o.isHemisphereLight);
  hemisphere.groundColor.set(0x6f6371);
  scene.fog.color.set(0xd0afc6);
  terrain.fragmentShader=terrain.fragmentShader.replace('/* canopy transmission */',`
    c*=mix(vec3(.67,.64,.89),vec3(1.07,.86,.77),sunlit*(.74+.26*incidence));
    /* canopy transmission */`);
  const uniforms={keeneDayTime:clock,keeneDaySun:{value:sun}};
  const fog=`
    uniform float keeneDayTime;
    uniform vec3 keeneDaySun;
    float keeneBank(vec3 eye,vec3 ray,float distance,vec3 centre,vec3 span,vec2 axis,float extinction){
      vec2 crossAxis=vec2(-axis.y,axis.x);
      vec3 origin=eye-centre;
      vec3 q=vec3(dot(origin.xz,axis),origin.y,dot(origin.xz,crossAxis))/span;
      vec3 v=vec3(dot(ray.xz,axis),ray.y,dot(ray.xz,crossAxis))/span;
      float speed=max(dot(v,v),1e-10),middle=-dot(q,v)/speed;
      vec3 closest=q+v*middle;
      float crossSection=1.-dot(closest,closest);
      if(crossSection<=0.)return 0.;
      float reach=sqrt(crossSection/speed);
      float start=max(0.,middle-reach),end=min(distance,middle+reach);
      if(end<=start)return 0.;
      // A parabolic density profile has an exact optical integral. Drifting
      // filaments separate the long bank into curls near the inversion top.
      float a=start-middle,b=end-middle;
      float optical=(end-start)*(crossSection-speed*(b*b+b*a+a*a)/3.);
      vec3 p=eye+ray*(.5*(start+end));
      vec2 drift=p.xz-vec2(1.15,.34)*keeneDayTime;
      float fold=.60+.24*sin(dot(drift,vec2(.017,-.012))+.91*sin(drift.y*.009))+ .16*cos(dot(drift,vec2(-.006,.021)));
      return optical*extinction*fold;
    }
    vec3 ashuelotAir(vec3 color,vec3 eye,vec3 ray,float dist){
      float density=keeneBank(eye,ray,dist,vec3(-1005.,169.,-3270.),vec3(1420.,27.,360.),vec2(.19,.982),.0027)
        +keeneBank(eye,ray,dist,vec3(-418.,162.,-1575.),vec3(1560.,40.,370.),vec2(.35,.937),.0034)
        +keeneBank(eye,ray,dist,vec3(206.,157.,386.),vec3(1770.,45.,425.),vec2(.30,.954),.0030)
        +keeneBank(eye,ray,dist,vec3(1230.,156.,2650.),vec3(1670.,32.,380.),vec2(.49,.872),.0025)
        +keeneBank(eye,ray,dist,vec3(1650.,148.,4580.),vec3(970.,17.,275.),vec2(.13,.992),.0018);
      float facing=pow(max(0.,dot(ray,keeneDaySun)),4.);
      vec3 air=mix(vec3(.425,.419,.565),vec3(.995,.660,.487),.13+.80*facing);
      return mix(color,air,1.-exp(-min(density,6.)));
    }`;
  function appendMain(shader,code){
    const main=shader.indexOf('void main'),body=shader.indexOf('{',main);
    let i=body+1,level=1;
    for(;level&&i<shader.length;i++){
      if(shader[i]==='{')level++;else if(shader[i]==='}')level--;
    }
    return shader.slice(0,i-1)+'\n'+code+'\n'+shader.slice(i-1);
  }
  const skyEnd='#include <colorspace_fragment>';
  Object.assign(sky.material.uniforms,uniforms);
  sky.material.fragmentShader=fog+'\n'+sky.material.fragmentShader.replace(skyEnd,`
    /* before local precipitation */
    gl_FragColor.rgb=ashuelotAir(gl_FragColor.rgb,cameraPosition,d,30000.);
    `+skyEnd);
  // Attach after buildings, wildlife, canopy and the eagle have been added.
  // Both the ordinary camera and the reflected camera see the same banks.
  let attached=false;
  return ()=>{
    if(attached)return;
    attached=true;
    const seen=new Set();
    scene.traverse(mesh=>{
      if(!mesh.isMesh||mesh===sky)return;
      for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
        if(!material||seen.has(material)||material.isShadowMaterial||(!material.depthWrite&&material.transparent))continue;
        seen.add(material);
        const previous=material.onBeforeCompile,cache=material.customProgramCacheKey();
        material.onBeforeCompile=function(shader,renderer){
          previous.call(this,shader,renderer);
          if(!shader.fragmentShader.includes(skyEnd))return;
          Object.assign(shader.uniforms,uniforms);
          const varying='varying vec3 keeneAirPoint;\n';
          shader.vertexShader=varying+appendMain(shader.vertexShader,`
            vec2 keeneXY=(gl_Position.xy+projectionMatrix[2].xy*gl_Position.w)/vec2(projectionMatrix[0].x,projectionMatrix[1].y);
            keeneAirPoint=cameraPosition+vec3(keeneXY,-gl_Position.w)*mat3(viewMatrix);`);
          shader.fragmentShader=varying+fog+'\n'+shader.fragmentShader.replace(skyEnd,`
            vec3 keeneRay=keeneAirPoint-cameraPosition;
            float keeneRange=max(.01,length(keeneRay));
            gl_FragColor.rgb=ashuelotAir(gl_FragColor.rgb,cameraPosition,keeneRay/keeneRange,keeneRange);
            `+skyEnd);
        };
        material.customProgramCacheKey=()=>cache+'-ashuelot-fog';
        material.needsUpdate=true;
      }
    });
  };
};
