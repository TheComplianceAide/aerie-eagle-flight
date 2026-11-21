// Summer 2022 Gouvernement du Québec MRNF aerophotography. Coordinates are
// local metres east/south in UTM 19N. The family cabin retains its historical
// envelope at the documented Camp Sud site. See game/labrador-credits.txt.
window.registerBerteNarrows=(survey,settings)=>{
  if(survey.measuredSouthCamp)return;
  survey.measuredSouthCamp=true;
  const bank=(first,last,measurements)=>{
    const points=[];
    for(let i=0;i<measurements.length;i+=2)points.push([measurements[i]/10,measurements[i+1]/10]);
    survey.shore.splice(first+1,last-first-1,...points);
  };
  bank(1397,1419,window.berteSouthSurvey.east);
  bank(620,635,window.berteSouthSurvey.west);

  const envelope=window.berteSouthSurvey.envelope;
  const encoded=atob(window.berteSouthSurvey.crowns),coordinates=new Int16Array(encoded.length/2);
  for(let i=0;i<coordinates.length;i++){
    const a=encoded.charCodeAt(2*i),b=encoded.charCodeAt(2*i+1);
    coordinates[i]=a+(b<<8);
  }
  survey.berteCrowns=[];
  for(let i=0;i<coordinates.length;i+=4){
    survey.berteCrowns.push({x:coordinates[i]*.5,z:coordinates[i+1]*.5,
      height:coordinates[i+2]/8,width:coordinates[i+3]/8,
      seed:((i*.61803398875)%1),species:4,measuredBerte:true});
  }
  survey.inBerteCanopy=(x,z)=>{
    if(x< -283||x>103||z<1610||z>1840)return false;
    let inside=false;
    for(let i=0,j=envelope.length-1;i<envelope.length;j=i++){
      const a=envelope[i],b=envelope[j];
      if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    }
    return inside;
  };
  const camp=survey.cabin;
  const site=survey.landmarks.find(mark=>mark.name==='South Camp cabin');
  camp.x=site.x=-27.98;camp.z=site.z=1752.18;
  camp.yaw=-1.946;camp.waterDistance=25.6;
  // Small craft occupy this gravel margin in the two summer orthophotos.
  // Moor the game’s skiff on the wet side of the southern point.
  camp.mooring={x:-44.5,z:1765.5,angle:-2.32,knotX:-40.7,knotZ:1763.8};
  // Fly past the beach-facing porch with room to clear the forest behind it.
  settings.extraLaunches.cabin=[-93,1722,-20,1755,11,0,8];
  const narrows=survey.landmarks.find(mark=>mark.name==='South narrows');
  narrows.x=-106;narrows.z=1733;
  narrows.approach=[-219,1684,-24,1758,27,-4,13];
};

window.lightBerteNarrows=(T,scene,crownAir)=>{
  const field=new T.TextureLoader().load('labrador-narrows-field.webp');
  field.anisotropy=6;
  const shared=`
    uniform sampler2D berteShore;
    vec2 berteUv(vec2 p){return vec2((p.x+435.)/600.,1.-(p.y-1502.)/432.);}
    float berteEdge(vec2 p){return 1.-smoothstep(.48,.96,length((p-vec2(-123.,1718.))/vec2(307.,223.)));}
    float berteMetres(float a){
      float q=(.5-a)/.43;return sign(q)*q*q*66.;
    }`;
  const skyUniforms=scene.children.find(o=>o.material?.uniforms?.berteSun)?.material.uniforms;
  const seen=new Set();
  scene.traverse(o=>{
    const mat=o.material;
    if(!mat||seen.has(mat))return;
    // The early atlas pass already built the sparse deciduous stands.
    if(crownAir&&mat.userData?.canopyRoot){
      const anchor=mat.vertexShader?.includes('vec4(p,1.)')?'p':'world';
      if(mat.isShaderMaterial)crownAir(mat,anchor);
      else if(mat.isMeshStandardMaterial){
        const prepare=mat.onBeforeCompile;
        mat.onBeforeCompile=(shader,renderer)=>{prepare.call(mat,shader,renderer);crownAir(shader,'standard');};
      }
      seen.add(mat);
      return;
    }
    if(!mat.isShaderMaterial)return;
    if(o.isWater){
      seen.add(mat);
      mat.uniforms.berteShore={value:field};
      mat.fragmentShader=shared+mat.fragmentShader
        .replace('float coast=shoreExposure,group=',`
          float reach=berteEdge(p);
          vec4 campWater=vec4(0.);
          if(reach>0.){
            vec2 uv=berteUv(p);
            campWater=texture2D(berteShore,uv);
            float corrected=max(0.,berteMetres(campWater.a));
            bank=mix(bank,corrected,reach);
            if(corrected<44.){
              vec2 da=vec2(texture2D(berteShore,uv+vec2(1./1000.,0.)).a-texture2D(berteShore,uv-vec2(1./1000.,0.)).a,
                  texture2D(berteShore,uv-vec2(0.,1./720.)).a-texture2D(berteShore,uv+vec2(0.,1./720.)).a);
              float normD=length(da);
              if(normD>.0001)away=mix(away,-da/normD,reach*smoothstep(.0001,.0016,normD));
            }
          }
          float coast=shoreExposure,group=`)
        .replace('vec3 n=normalize(vec3(slope.x,1.,slope.y));',`
          // The outfitter documents a current in front of South Camp. Both
          // mapped gravel spits shelter their lee margins. Oblique, advected
          // capillary ripples mark the narrowing flow and slip along each bank.
          float throat=exp(-pow((p.y-1733.)/73.,2.)-pow((p.x+109.)/67.,2.));
          float stream=throat*reach*smoothstep(2.,21.,bank);
          float speed=.52+.33*stream;
          float phaseA=dot(p,vec2(1.23,.67))-time*speed+1.3*sin(p.x*.073+p.y*.055-time*.17);
          float phaseB=dot(p,vec2(-.88,1.32))-time*speed*.80+sin(p.x*.065-time*.19);
          float facet=stream*(1.-smoothstep(.15,.64,footprint));
          slope+=facet*(vec2(.016,.011)*sin(phaseA)+vec2(-.010,.012)*cos(phaseB));
          vec3 n=normalize(vec3(slope.x,1.,slope.y));`)
        .replace('float shallow=exp(-.47*waterDepth);',`
          float opticalDepth=clamp(-log(max(.004,campWater.r))/.84,.08,7.2);
          waterDepth=mix(waterDepth,min(opticalDepth,max(.08,bank*.52+.08)),reach);
          float shallow=exp(-.47*waterDepth);`)
        .replace('vec3 gravel=shoal,resolvedBed=shoal;',`
          // Neutral mineral gravel reflects amber through the tannic shallows.
          // The 2015 RGB water column supplies a relative optical depth only.
          vec3 littoral=mix(vec3(.075,.075,.046),vec3(.38,.27,.12),campWater.g)*
            (.66+.66*campWater.b)*(.63+.37*daylight);
          shoal=mix(shoal,littoral,reach);
          vec3 gravel=shoal,resolvedBed=shoal;`)
        .replace('vec3 transmission=exp(-path*vec3(.62,.34,.26));',`
          floorColor=mix(floorColor,littoral*(.69+.85*dot(gravel,vec3(.24,.62,.14))),reach*.89);
          vec3 extinction=mix(vec3(.62,.34,.26),vec3(.33,.46,.75),reach);
          vec3 transmission=exp(-path*extinction);`);
      // A nearby rain sheet desaturates water, trees and rock together. The
      // mirror already shades the landscape on the far side; here integrate
      // only the air from the physical water surface to the observing eagle.
      if(skyUniforms){
        for(const key of ['berteSun','berteLake','berteCloud'])mat.uniforms[key]=skyUniforms[key];
        mat.fragmentShader=mat.fragmentShader.replace(/void main\s*\(\s*\)\s*\{/,entry=>
          'uniform vec3 berteSun;uniform float berteLake;uniform sampler2D berteCloud;\n'+window.berteRainColumn+'\n'+entry)
          .replace('gl_FragColor=vec4(radiance,alpha);',`
            float campLocal=campDistance(cameraPosition.xz);
            if(campLocal>.001&&viewDistance>12.&&stormTime<160.){
              vec4 medium=campRainMedium(-v,viewDistance,campLocal);
              radiance=mix(radiance,medium.rgb,medium.a);
            }
            gl_FragColor=vec4(radiance,alpha);`);
      }
      mat.needsUpdate=true;
    }else if(mat.uniforms?.ranges&&mat.uniforms?.stoneTint&&mat.uniforms?.sod){
      seen.add(mat);
      mat.uniforms.berteShore={value:field};
      mat.fragmentShader=shared+mat.fragmentShader.replace('photo=mix(photo,vec3(lum(photo)),arctic*.27);',`
        float southCampEdge=berteEdge(xz);
        vec4 campLand=vec4(0.);
        float recorded=0.,minerals=0.,meadow=0.;
        if(southCampEdge>0.){
          campLand=texture2D(berteShore,berteUv(xz));
          recorded=southCampEdge*smoothstep(.495,.54,campLand.a);
          float lightness=lum(campLand.rgb);
          float shoreHue=campLand.r-.76*campLand.g-.24*campLand.b;
          minerals=recorded*smoothstep(.13,.43,lightness)*smoothstep(-.002,.046,shoreHue);
          photo=mix(photo,campLand.rgb,recorded*.86);
          vec2 lawn=(xz-vec2(-36.,1754.))/vec2(23.,25.);
          float openGrass=1.-smoothstep(.79,1.15,length(lawn));
          meadow=recorded*openGrass*smoothstep(.006,.051,campLand.g-.83*campLand.r-.17*campLand.b);
        }
        photo=mix(photo,vec3(lum(photo)),arctic*.27);`)
      .replace('float green=smoothstep(.025,.15,c.g-(c.r+c.b)*.45);',`
        if(meadow>.01){
          float mossGrit=lum(texture2D(sod,xz*vec2(.51,.62)).rgb);
          vec3 turf=campLand.rgb*(.90+.25*mossGrit);
          c=mix(c,turf,.85*meadow);
        }
        if(minerals>.012){
          float small=lum(texture2D(rockScan,xz*vec2(.60,.66)).rgb);
          vec3 sandy=campLand.rgb*(.86+.30*small);
          c=mix(c,sandy,minerals*.95);
        }
        float green=smoothstep(.025,.15,c.g-(c.r+c.b)*.45);`);
      mat.needsUpdate=true;
    }
  });
};

// Use the same five path samples as the terrain’s southern rain cell. A single
// interpolated scattering value per crown vertex lets the intervening rain
// soften those silhouettes in the mainland, the local terrain and the mirror.
window.berteRainColumn=`
      float campDistance(vec2 xz){return 1.-smoothstep(300.,720.,length(xz-stormAnchor));}
      float campShadow(vec2 xz){
        vec2 q=xz-stormAnchor;
        float crosswise=dot(q,vec2(-stormDir.y,stormDir.x));
        float age=stormTime+16.-dot(q,stormDir)/stormSpeed-3.*sin(crosswise*.012);
        return (1.-smoothstep(4.,18.,age))*(1.-smoothstep(180.,430.,abs(crosswise)));
      }
      vec4 campRainMedium(vec3 ray,float depth,float local){
        if(stormTime>160.)return vec4(0.);
        float mass=0.;
        for(int i=0;i<5;i++){
          float d=12.+float(i)*42.;
          if(d>=depth)break;
          vec3 pos=cameraPosition+ray*d;
          vec2 q=pos.xz-stormAnchor;
          float across=dot(q,vec2(-stormDir.y,stormDir.x));
          float h=pos.y-berteLake;
          vec2 detailUv=vec2(across*.0067+h*.0013,stormTime*.004+h*.0009);
          float tail=texture2D(berteCloud,detailUv+vec2(.4,.23)).r;
          float sheet=campShadow(pos.xz)*campDistance(pos.xz);
          mass+=(.10+.36*tail)*sheet*(1.-smoothstep(35.,160.,h))*clamp((depth-d)/30.,0.,1.);
        }
        float scatter=(1.-exp(-mass*.49))*local;
        float sunward=max(0.,dot(ray,berteSun));
        vec3 curtain=mix(vec3(.166,.209,.248),vec3(.475,.378,.239),sunward*sunward);
        return vec4(curtain,scatter);
      }`;
window.berteCanopyAir=source=>{
  const uniforms={};
  for(const key of ['stormAnchor','stormDir','stormTime','stormSpeed','berteLake','berteCloud','berteSun'])uniforms[key]=source[key];
  const fields=`
    uniform vec2 stormAnchor,stormDir;
    uniform float stormTime,stormSpeed,berteLake;
    uniform vec3 berteSun;uniform sampler2D berteCloud;
    varying vec4 crownAir;
    ${window.berteRainColumn}
    vec4 rainBetweenSpruce(vec3 wp){
      float local=campDistance(cameraPosition.xz);
      vec3 delta=wp-cameraPosition;float depth=length(delta);
      if(local<.001||depth<12.)return vec4(0.);
      return campRainMedium(delta/depth,depth,local);
    }`;
  return (mat,kind)=>{
    Object.assign(mat.uniforms,uniforms);
    const standard=kind==='standard';
    const point=standard?'(modelMatrix*instanceMatrix*vec4(transformed,1.)).xyz':kind;
    const anchor=standard?'#include <project_vertex>':kind==='wp'?'vec4 mvPosition=viewMatrix*vec4(wp,1.);':'gl_Position=projectionMatrix*viewMatrix*vec4('+kind+',1.);';
    mat.vertexShader=fields+mat.vertexShader.replace(anchor,'crownAir=rainBetweenSpruce('+point+');\n'+anchor);
    const color=mat.fragmentShader.includes('#include <tonemapping_fragment>')?'#include <tonemapping_fragment>':'#include <colorspace_fragment>';
    mat.fragmentShader='varying vec4 crownAir;\n'+mat.fragmentShader.replace(color,
      'gl_FragColor.rgb=mix(gl_FragColor.rgb,crownAir.rgb,crownAir.a);\n'+color);
  };
};
