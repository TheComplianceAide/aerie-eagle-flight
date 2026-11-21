// Reinevågen's near-vertical faces are recorded from the opposite quay.
// Visibility encodes the first measured ground surface seen by each field photograph.
(() => {
  const records=[
    {eye:[1840.83263,.5,4199.23631],az:-110.92891,pitch:7.76639,roll:.29039,focal:1931.80954,size:[1150,767]},
    {eye:[1842.89273,2.9,4186.10249],az:-65.91144,pitch:10.88115,roll:-.039326,focal:688.025787,size:[900,391]}
  ];
  window.applyReinebringenSurface=function(material,localUV,texture){
    material.uniforms.fracture={value:texture('reinebringen-jointed-rock.webp',true)};
    material.uniforms.reineWallField={value:texture('reinebringen-obliques.webp')};
    const num=v=>v.toFixed(7),vec=v=>'vec'+v.length+'('+v.map(num).join(',')+')';
    const fields=records.map((p,i)=>{
      const rad=v=>v*Math.PI/180,c=Math.cos(rad(p.az)),s=Math.sin(rad(p.az)),u=Math.sin(rad(p.pitch)),v=Math.cos(rad(p.pitch));
      const along=[s*v,u,-c*v],side=[c,0,s],down=[s*u,-v,-c*u],cr=Math.cos(rad(p.roll)),sr=Math.sin(rad(p.roll));
      const right=side.map((n,j)=>(n*cr+down[j]*sr)*p.focal/p.size[0]);
      const below=down.map((n,j)=>(n*cr-side[j]*sr)*p.focal/p.size[1]);
      return `{
        vec3 ray=wp-${vec(p.eye)};
        float depth=dot(ray,${vec(along)});
        vec2 film=.5+vec2(dot(ray,${vec(right)}),dot(ray,${vec(below)}))/max(.01,depth);
        float boundary=min(min(film.x,film.y),min(1.-film.x,1.-film.y));
        if(depth>250.&&boundary>0.){
          vec4 wall=texture2D(reineWallField,vec2(${num(i*.5)}+.5*clamp(film.x,.0005,.9995),1.-clamp(film.y,.0007,.9993)));
          float mappedDepth=250.*exp(2.341806*(wall.a-.10)/.86);
          float relief=abs(mappedDepth-depth)/max(12.,.029*depth);
          float share=smoothstep(.097,.12,wall.a)*(1.-smoothstep(.32,1.8,relief))*smoothstep(.045,.24,dot(normal,normalize(-ray)));
          share*=smoothstep(.0,.075,boundary)*wall.b*smoothstep(15.,35.,wp.y);
          float jointContrast=clamp(exp2((wall.r-.5)*1.86),.63,1.42);
          vec3 observed=fjordSource.rgb*jointContrast;
          observed*=mix(vec3(1.),vec3(.95,1.02,.94),wall.g*.52);
          fieldRock=mix(fieldRock,observed,share*.92);
        }
      }`;
    }).join('\n');
    material.fragmentShader='uniform sampler2D reineWallField;\n'+material.fragmentShader.replace('float skyView=occ.g,relief=',`
      vec4 fjordSource=texture2D(aerial,${localUV});
      vec3 weights=pow(abs(normal),vec3(3.));weights/=max(.001,weights.x+weights.y+weights.z);
      // Slabs sample the observed local granite along their actual surface normal.
      vec3 u=(wp+vec3(67.,24.,-97.))*.0073;
      float mineralA=texture2D(fracture,u.zy*vec2(1.,1.58)).r*weights.x+
        texture2D(fracture,u.xz).r*weights.y+texture2D(fracture,u.xy*vec2(1.,1.58)).r*weights.z;
      float mineralB=texture2D(fracture,vec2(u.x*.58+u.z*.81,u.y*1.32-u.x*.14)*1.77).r;
      float exposure=clamp(.66*clamp((fjordSource.a-.094)/.902,0.,1.)+
        .34*(1.-landformHorizon.z)*smoothstep(.20,.94,1.-normal.y),0.,1.);
      float grain=.74*mineralA+.26*mineralB;
      vec3 fieldRock=fjordSource.rgb*(.98+exposure*(grain-.53)*1.89);
      ${fields}
      c=mix(c,fieldRock,landformHorizon.w*(.84+.13*exposure));
      float skyView=occ.g,relief=`);
  };
})();
