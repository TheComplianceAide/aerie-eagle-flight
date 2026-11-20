// Finite wind waves in metres. Each component loses contrast when its wavelength
// drops below the pixel footprint. Keep low-angle reflections stable during flight.
(() => {
  const waves=`
    vec3 gravityWave(vec2 p,vec2 dir,float len,float amp,float t,float px,float phase){
      float k=6.2831853/len;
      float a=amp*(1.-smoothstep(.18,.52,px/len));
      float u=k*dot(p,dir)-sqrt(9.81*k)*t+phase;
      return vec3(a*sin(u),dir*a*k*cos(u));
    }
    vec3 waterWaves(vec2 p,float t,float px,float energy){
      float bend=.48*sin(dot(p,vec2(.009,.015))-.07*t);
      return energy*(gravityWave(p,vec2(.88,.475),14.1,.15,t,px,bend)
        +gravityWave(p,vec2(.635,.773),6.7,.079,t,px,-.82+bend)
        +gravityWave(p,vec2(-.14,.990),2.35,.035,t,px,1.8)
        +gravityWave(p,vec2(.97,-.243),.77,.012,t,px,-.9-bend));
    }`;

  function lakes(scene,region){
    scene.traverse(mesh=>{
      if(!mesh.isWater)return;
      const mat=mesh.material,atlas=!!mat.uniforms.shoreField;
      const energy=({napali:2.9,lofoten:1.65,milford:1.25,labrador:1.10,moosehead:1.05,alaska:.88,swiss:.58,crater:.85,surry:.58})[region]||.92;
      let shader=waves+'\n'+mat.fragmentShader;
      if(atlas){
        shader=shader.replace('vec2 slope=slopes(p,time,footprint,fetch,wind);',`
          float energy=${energy.toFixed(2)}*(.32+.68*fetch)*(.62+.38*smoothstep(0.,14.,bank));
          vec3 wave=waterWaves(p,time,footprint,energy);
          vec2 ripplePoint=p+v.xz*wave.x/max(.24,v.y);
          wave=waterWaves(ripplePoint,time,footprint,energy);
          vec2 slope=slopes(ripplePoint,time,footprint,fetch,wind)-wave.yz;
        `).replace('vec2 bedUV=p*.44+slope*.35;',`
          float depth=clamp(.12+.13*bank,.12,4.);
          vec3 transmitted=refract(-v,n,1./1.333);
          vec2 bedUV=(p+transmitted.xz*depth/max(.29,-transmitted.y))*.44;
        `).replace('float bottom=exp',`
          float focus=exp(-8.*abs(sin(dot(p+slope,vec2(1.7,.85))+time*1.33)+.69*sin(dot(p,vec2(-.63,2.3))-time*1.12)));
          gravel*=1.+.71*focus*(1.-smoothstep(.18,.85,footprint))*daylight;
          float bottom=exp`).replace('radiance=mix(radiance,vec3(.69,.75,.70),foam);',`
          float streak=texture2D(normalSampler,p*vec2(.08,.16)+vec2(-time*.017,time*.035)).g;
          float crest=smoothstep(.08,.30,wave.x)*smoothstep(.015,.13,length(wave.yz));
          foam*=smoothstep(.22,.61,streak+.14*line);
          foam+=oceanSurf*crest*(1.-smoothstep(5.,27.,bank))*(.23+.45*streak);
          radiance=mix(radiance,vec3(.69,.75,.70),clamp(foam,0.,.83));`);
      }else{
        shader=shader.replace('vec4 noise=getNoise(surface*size);',`
          vec3 viewRay=normalize(eye-worldPosition.xyz);
          vec3 wave=waterWaves(surface,time,pixel,${energy.toFixed(2)});
          surface+=viewRay.xz*wave.x/max(.24,viewRay.y);
          wave=waterWaves(surface,time,pixel,${energy.toFixed(2)});
          vec4 noise=getNoise(surface*size);`).replace('vec3 surfaceNormal=normalize','slope-=wave.yz;\n          vec3 surfaceNormal=normalize')
          .replace('vec2 st=loc*.43+(fold*.09+surfaceNormal.xz*.13)*min(waterDepth,2.);',`
            vec3 transmitted=refract(-viewRay,surfaceNormal,1./1.333);
            vec2 st=(loc+transmitted.xz*waterDepth/max(.29,-transmitted.y))*.43;`)
          .replace('1.05+.9*caustic','1.05+.9*caustic*(1.-smoothstep(.2,.9,pixel))');
      }
      mat.fragmentShader=shader;mat.needsUpdate=true;
    });
  }

  function streams(T,scene,w){
    const lines=window.aerieChannels;
    if(!lines?.length)return;
    const floor=w.habitat.surface,positions=[],uv=[],grade=[],indices=[],cells=new Map();
    const cell=(x,z)=>Math.floor(x/64)+','+Math.floor(z/64);
    for(const [width,path] of lines){
      const samples=[];
      for(let i=1;i<path.length;i++){
        const a=path[i-1],b=path[i],dx=b[0]-a[0],dz=b[1]-a[1];
        const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/Math.min(5,width*.95)));
        for(let j=0;j<steps;j++)samples.push([a[0]+dx*j/steps,a[1]+dz*j/steps]);
      }
      samples.push(path[path.length-1]);
      let run=0;
      for(let i=0;i<samples.length;i++){
        const [x,z]=samples[i],a=samples[Math.max(0,i-1)],b=samples[Math.min(i+1,samples.length-1)];
        const dx=b[0]-a[0],dz=b[1]-a[1],dist=Math.max(.01,Math.hypot(dx,dz));
        const nx=-dz/dist,nz=dx/dist,half=width*.5;
        const slope=Math.abs(floor(...b)-floor(...a))/dist,base=positions.length/3;
        const level=Math.min(floor(x,z),floor(x+nx*half*.55,z+nz*half*.55),floor(x-nx*half*.55,z-nz*half*.55))+.14;
        if(i)run+=Math.hypot(x-samples[i-1][0],z-samples[i-1][1]);
        for(let j=0;j<7;j++){
          const f=j/3-1,px=x+nx*half*f,pz=z+nz*half*f;
          positions.push(px,Math.max(level,floor(px,pz)+.075),pz);
          uv.push(f,run);grade.push(slope);
          if(i&&j){const k=base+j;indices.push(k-8,k-7,k,k-8,k,k-1);}
        }
        if(i){
          const prev=samples[i-1],segment=[prev[0],prev[1],x,z,half,level];
          for(let cx=Math.floor((Math.min(x,prev[0])-half)/64);cx<=Math.floor((Math.max(x,prev[0])+half)/64);cx++)
            for(let cz=Math.floor((Math.min(z,prev[1])-half)/64);cz<=Math.floor((Math.max(z,prev[1])+half)/64);cz++){
              const k=cx+','+cz;if(!cells.has(k))cells.set(k,[]);cells.get(k).push(segment);
            }
        }
      }
    }
    w.channelWater=(x,z)=>{
      for(const [ax,az,bx,bz,r,y] of cells.get(cell(x,z))||[]){
        const dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1)));
        if((x-ax-t*dx)**2+(z-az-t*dz)**2<r*r*.95)return Math.max(y,floor(x,z)+.075);
      }
      return -Infinity;
    };
    const oldClear=w.clearance||w.height;w.clearance=(x,z)=>Math.max(oldClear(x,z),w.channelWater(x,z));
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    g.setAttribute('grade',new T.Float32BufferAttribute(grade,1));g.setIndex(indices);
    const loader=new T.TextureLoader(),pebbles=loader.load('shore-pebbles.webp');pebbles.wrapS=pebbles.wrapT=T.RepeatWrapping;pebbles.anisotropy=8;
    const clock={value:0};
    const m=new T.ShaderMaterial({side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2,
      uniforms:{t:clock,bed:{value:pebbles},sky:{value:w.skyTexture},sun:{value:w.sunDirection},desert:{value:w.region==='bryce'?1:0}},
      vertexShader:`attribute float grade;varying float fall;varying vec3 wp;varying vec2 flow;
        void main(){fall=grade;wp=position;flow=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(wp,1.);}`,
      fragmentShader:`varying float fall;varying vec3 wp;varying vec2 flow;uniform float t,desert;uniform vec3 sun;uniform sampler2D sky,bed;
        void main(){
          float edge=abs(flow.x);float rippleEdge=.963+.027*sin(flow.y*.87+wp.x*.6)+.011*sin(flow.y*2.8);
          if(edge>rippleEdge)discard;
          float dx=dFdx(flow.y),dy=dFdy(flow.y);vec2 a=dFdx(wp.xz),b=dFdy(wp.xz);
          float det=a.x*b.y-a.y*b.x;
          vec2 dir=abs(det)>.00001?normalize(vec2(b.y*dx-a.y*dy,a.x*dy-b.x*dx)/det):vec2(1.,0.);
          vec2 lateral=vec2(-dir.y,dir.x);float px=max(length(a),length(b));
          float speed=.8+1.7*min(.65,fall);
          float u=flow.y*1.27-t*speed*1.87+1.2*sin(dot(wp.xz,lateral)*.85);
          float crossWave=sin(dot(wp.xz,lateral)*3.+flow.y*.57-t*1.32);
          vec2 slope=(dir*.09*cos(u)+lateral*.052*crossWave)*(1.-smoothstep(.4,2.9,px));
          vec3 n=normalize(vec3(-slope.x,1.,-slope.y)),v=normalize(cameraPosition-wp),ref=reflect(-v,n);
          vec3 skyLight=texture2D(sky,vec2(.5+atan(ref.z,ref.x)*.159155,.5+asin(clamp(ref.y,-1.,1.))*.31831)).rgb;
          float depth=mix(.93,.22,desert)*(1.-edge*edge)+.035;
          vec3 ray=refract(-v,n,.7502);
          vec3 stones=pow(texture2D(bed,(wp.xz+depth*ray.xz/max(.24,-ray.y))*.54).rgb,vec3(2.2));
          float caustic=exp(-7.*abs(sin(u)+.7*crossWave))*(1.-smoothstep(.12,.9,px));
          vec3 body=mix(stones*vec3(.72,.80,.62)*(1.+caustic*.63),vec3(.024,.092,.072),1.-exp(-1.7*depth));
          float fr=.0204+.9796*pow(1.-max(0.,dot(v,n)),5.);
          float foam=smoothstep(.055,.23,fall)*smoothstep(.48,.95,sin(u)*crossWave)*(1.-edge);
          vec3 c=mix(body,skyLight,fr)+vec3(.83,.61,.33)*pow(max(0.,dot(n,normalize(v+sun))),140.);
          gl_FragColor=vec4(mix(c,vec3(.65,.70,.65),foam*.75),1.);
          #include <colorspace_fragment>
        }`});
    const mesh=new T.Mesh(g,m);mesh.name='Mapped stream channels';scene.add(mesh);
    const update=w.update.bind(w);w.update=(dt,t,p)=>{clock.value=t;update(dt,t,p);};
  }
  window.addFlightWater=(T,scene,w)=>{
    lakes(scene,w.region);
    if(w.region==='yosemite'||w.region==='bryce')streams(T,scene,w);
  };
})();
