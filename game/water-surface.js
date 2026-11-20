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
      const energy=({dixville:.52,napali:2.9,lofoten:1.65,milford:1.25,labrador:1.10,moosehead:1.05,alaska:.88,swiss:.58,crater:.85,surry:.58})[region]||.92;
      let shader=waves+'\n'+mat.fragmentShader;
      if(atlas){
        shader=shader.replace('vec2 slope=slopes(p,time,footprint,fetch,wind);',`
          float energy=${energy.toFixed(2)}*(.32+.68*fetch)*(.62+.38*smoothstep(0.,14.,bank));
          vec3 wave=waterWaves(p,time,footprint,energy);
          vec2 ripplePoint=p+v.xz*wave.x/max(.24,v.y);
          wave=waterWaves(ripplePoint,time,footprint,energy);
          vec2 slope=slopes(ripplePoint,time,footprint,fetch,wind)-wave.yz;
        `);
      }else{
        shader=shader.replace('vec4 noise=getNoise(surface*size);',`
          vec3 viewRay=normalize(eye-worldPosition.xyz);
          vec3 wave=waterWaves(surface,time,pixel,${energy.toFixed(2)});
          surface+=viewRay.xz*wave.x/max(.24,viewRay.y);
          wave=waterWaves(surface,time,pixel,${energy.toFixed(2)});
          vec4 noise=getNoise(surface*size);`).replace('vec3 surfaceNormal=normalize','slope-=wave.yz*(1.-.68*nearShore);\n          vec3 surfaceNormal=normalize')
          .replace('vec2 warp=surfaceNormal.xz*distortionScale*(.11+.64/max(5.,distance));', `
            vec2 screenSlope=(viewMatrix*vec4(surfaceNormal.x,0.,surfaceNormal.z,0.)).xy;
            vec2 warp=screenSlope*distortionScale*(.063+.49/max(5.,distance));`);
      }
      mat.fragmentShader=shader;mat.needsUpdate=true;
    });
  }

  function streams(T,scene,w){
    const lines=window.aerieChannels;
    if(!lines?.length)return;
    const positions=[],uv=[],grade=[],sections=[],indices=[],cells=new Map();
    const cell=(x,z)=>Math.floor(x/64)+','+Math.floor(z/64);
    // Bryce renders an adaptive lidar mesh. Between its retained vertices
    // the visible triangle can sit above or below the raw DEM sample. Index
    // only faces touching a mapped stream so its centreline stays connected.
    const banks=new Map(),bankCell=(x,z)=>Math.floor(x/16)+','+Math.floor(z/16);
    if(w.region==='bryce'){
      for(const [width,path] of lines)for(let i=1;i<path.length;i++){
        const [ax,az]=path[i-1],[bx,bz]=path[i],steps=Math.max(1,Math.ceil(Math.hypot(bx-ax,bz-az)/8));
        for(let j=0;j<=steps;j++){
          const x=ax+(bx-ax)*j/steps,z=az+(bz-az)*j/steps,pad=width*.5+4;
          for(let col=Math.floor((x-pad)/16);col<=Math.floor((x+pad)/16);col++)
            for(let row=Math.floor((z-pad)/16);row<=Math.floor((z+pad)/16);row++)banks.set(col+','+row,[]);
        }
      }
      scene.traverse(o=>{
        if(o.name!=='Bryce Amphitheater · surveyed fins')return;
        const g=o.geometry,p=g.attributes.position.array,index=g.index.array;
        const {center,radius}=g.boundingSphere;
        let nearby=false;
        for(let col=Math.floor((center.x-radius)/16);!nearby&&col<=Math.floor((center.x+radius)/16);col++)
          for(let row=Math.floor((center.z-radius)/16);row<=Math.floor((center.z+radius)/16);row++)
            if(banks.has(col+','+row)){nearby=true;break;}
        if(!nearby)return;
        for(let i=0;i<index.length;i+=3){
          const a=index[i]*3,b=index[i+1]*3,c=index[i+2]*3,x=p[a],z=p[a+2];
          const bx=p[b],bz=p[b+2],cx=p[c],cz=p[c+2];
          let face;
          for(let col=Math.floor(Math.min(x,bx,cx)/16);col<=Math.floor(Math.max(x,bx,cx)/16);col++)
            for(let row=Math.floor(Math.min(z,bz,cz)/16);row<=Math.floor(Math.max(z,bz,cz)/16);row++){
              const list=banks.get(col+','+row);
              if(!list)continue;
              if(!face){
                const ux=bx-x,uz=bz-z,vx=cx-x,vz=cz-z,d=ux*vz-uz*vx;
                if(Math.abs(d)<.0001)continue;
                face=[x,z,vz/d,-vx/d,-uz/d,ux/d,p[a+1],p[b+1]-p[a+1],p[c+1]-p[a+1]];
              }
              list.push(face);
            }
        }
      });
    }
    function floor(x,z){
      const list=banks.size&&banks.get(bankCell(x,z));
      if(list)for(const [ox,oz,ux,uz,vx,vz,y,by,cy] of list){
        const px=x-ox,pz=z-oz,u=px*ux+pz*uz,v=px*vx+pz*vz;
        if(u>=-.00001&&v>=-.00001&&u+v<=1.00001)return y+u*by+v*cy;
      }
      return w.habitat.surface(x,z);
    }
    for(const [width,source] of lines){
      // Hydrography polylines may be stored in either order. Compare the
      // elevations at their ends before assigning the downstream coordinate.
      const ordered=floor(...source[0])<floor(...source[source.length-1])?[...source].reverse():source;
      // Round the surveyed vertices only within a few channel widths; the
      // centre of each reach stays tied to its mapped course.
      const path=[ordered[0]];
      for(let i=1;i<ordered.length-1;i++){
        const p=ordered[i],a=ordered[i-1],b=ordered[i+1];
        const da=Math.hypot(a[0]-p[0],a[1]-p[1]),db=Math.hypot(b[0]-p[0],b[1]-p[1]);
        if(da<.01||db<.01)continue;
        const trim=Math.min(width*2.4,da*.19,db*.19);
        const ax=p[0]+(a[0]-p[0])*trim/da,az=p[1]+(a[1]-p[1])*trim/da;
        const bx=p[0]+(b[0]-p[0])*trim/db,bz=p[1]+(b[1]-p[1])*trim/db;
        for(let j=0;j<=4;j++){
          const u=j*.25,v=1-u;path.push([v*v*ax+2*v*u*p[0]+u*u*bx,v*v*az+2*v*u*p[1]+u*u*bz]);
        }
      }
      path.push(ordered[ordered.length-1]);
      const samples=[];
      for(let i=1;i<path.length;i++){
        const a=path[i-1],b=path[i],dx=b[0]-a[0],dz=b[1]-a[1];
        const spacing=w.region==='bryce'?Math.min(1.5,width*.48):Math.min(3.8,width*.78);
        const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/spacing));
        for(let j=0;j<steps;j++)samples.push([a[0]+dx*j/steps,a[1]+dz*j/steps]);
      }
      samples.push(path[path.length-1]);
      let run=0,previousLevel;
      for(let i=0;i<samples.length;i++){
        const [x,z]=samples[i],a=samples[Math.max(0,i-1)],b=samples[Math.min(i+1,samples.length-1)];
        const dx=b[0]-a[0],dz=b[1]-a[1],dist=Math.max(.01,Math.hypot(dx,dz));
        if(i)run+=Math.hypot(x-samples[i-1][0],z-samples[i-1][1]);
        const nx=-dz/dist,nz=dx/dist;
        const widthVariation=1+.074*Math.sin(run*.19+Math.sin(x*.043))+.041*Math.cos(run*.39+z*.061);
        const half=width*.5*widthVariation;
        const slope=Math.abs(floor(...b)-floor(...a))/dist,base=positions.length/3;
        const before=samples[Math.max(0,i-3)],after=samples[Math.min(samples.length-1,i+3)];
        const ax=x-before[0],az=z-before[1],bx=after[0]-x,bz=after[1]-z;
        const bend=(ax*bz-az*bx)/Math.max(.01,Math.hypot(ax,az)*Math.hypot(bx,bz));
        const level=floor(x,z)+.13;
        for(let j=0;j<7;j++){
          const f=j/3-1,px=x+nx*half*f,pz=z+nz*half*f;
          const interior=1-Math.min(1,Math.max(0,(Math.abs(f)-.58)/.40));
          positions.push(px,Math.max(level,floor(px,pz)-.035+.15*interior),pz);
          uv.push(f,run);grade.push(slope);sections.push(dx/dist,dz/dist,half,bend);
          if(i&&j){const k=base+j;indices.push(k-8,k-7,k,k-8,k,k-1);}
        }
        if(i){
          const prev=samples[i-1],segment=[prev[0],prev[1],x,z,half,previousLevel,level];
          for(let cx=Math.floor((Math.min(x,prev[0])-half)/64);cx<=Math.floor((Math.max(x,prev[0])+half)/64);cx++)
            for(let cz=Math.floor((Math.min(z,prev[1])-half)/64);cz<=Math.floor((Math.max(z,prev[1])+half)/64);cz++){
              const k=cx+','+cz;if(!cells.has(k))cells.set(k,[]);cells.get(k).push(segment);
            }
        }
        previousLevel=level;
      }
    }
    w.channelWater=(x,z)=>{
      for(const [ax,az,bx,bz,r,ay,by] of cells.get(cell(x,z))||[]){
        const dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1)));
        if((x-ax-t*dx)**2+(z-az-t*dz)**2<r*r*.95)return Math.max(ay+(by-ay)*t,floor(x,z)+.075);
      }
      return -Infinity;
    };
    const oldClear=w.clearance||w.height;w.clearance=(x,z)=>Math.max(oldClear(x,z),w.channelWater(x,z));
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    g.setAttribute('grade',new T.Float32BufferAttribute(grade,1));g.setAttribute('section',new T.Float32BufferAttribute(sections,4));g.setIndex(indices);
    const loader=new T.TextureLoader(),pebbles=loader.load('shore-pebbles.webp');
    const deposit=loader.load(w.region==='bryce'?'shore-sand.webp':'shore-cobble.webp');
    for(const tex of [pebbles,deposit]){tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.anisotropy=8;}
    const clock={value:0};
    const m=new T.ShaderMaterial({side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2,
      uniforms:{t:clock,bed:{value:pebbles},deposit:{value:deposit},sky:{value:w.skyTexture},sun:{value:w.sunDirection},desert:{value:w.region==='bryce'?1:0}},
      vertexShader:`attribute float grade;attribute vec4 section;varying float fall;varying vec3 wp;varying vec2 flow;varying vec4 channel,mirrorUv;uniform mat4 reflectProjection;
        void main(){fall=grade;wp=position;flow=uv;channel=section;mirrorUv=reflectProjection*vec4(wp,1.);gl_Position=projectionMatrix*modelViewMatrix*vec4(wp,1.);}`,
      fragmentShader:`varying float fall;varying vec3 wp;varying vec2 flow;varying vec4 channel,mirrorUv;uniform float t,desert,reflectionWeight;uniform vec3 sun,reflectCentre;uniform sampler2D sky,bed,deposit,sceneReflection;
        float streamNoise(vec2 p){
          vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
          vec4 h=fract(sin(dot(i,vec2(37.7,61.3))+vec4(0.,37.7,61.3,99.))*5939.43);
          return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);
        }
        void main(){
          vec2 dir=normalize(channel.xy),lateral=vec2(-dir.y,dir.x);
          float halfWidth=channel.z,edge=abs(flow.x),fromBank=(1.-edge)*halfWidth;
          float px=max(length(dFdx(wp.xz)),length(dFdy(wp.xz)));
          float coarse=streamNoise(wp.xz*.11),bar=streamNoise(wp.xz*.39+vec2(4.,12.));
          float wetLine=(.026+.17*bar+.054*sin(flow.y*.83-t*1.57+3.1*coarse))*min(1.,halfWidth*.66);
          if(fromBank<wetLine)discard;
          float mainFlow=smoothstep(.12,min(4.3,halfWidth*.83),fromBank);
          float pool=.37+.63*streamNoise(vec2(flow.y*.058,flow.x*.68));
          // Backwaters sit in the lee of bank projections; only small pockets
          // reverse while the body of the river continues downstream.
          float lee=(1.-mainFlow)*smoothstep(.42,.77,coarse)*smoothstep(.14,.48,fromBank);
          float speed=(.14+mainFlow*(.68+2.1*min(.55,fall)))*(1.-.22*pool)-.47*lee;
          vec2 reach=vec2(flow.y,flow.x*halfWidth);
          float eddy=sin(flow.y*1.14+t*.87+bar*3.)*lee;
          vec2 velocity=vec2(speed,eddy*.23);
          float phase=fract(t*.185+coarse*.24),other=fract(phase+.5),blend=abs(2.*phase-1.);
          vec2 parcel=reach-velocity*(phase-.5)*5.4,parcel2=reach-velocity*(other-.5)*5.4;
          float streak=mix(streamNoise(parcel*vec2(.42,2.7)),streamNoise(parcel2*vec2(.42,2.7)),blend);
          float wrinkle=mix(streamNoise(parcel*vec2(1.18,5.2)+9.),streamNoise(parcel2*vec2(1.18,5.2)+9.),blend);
          float riffle=smoothstep(.03,.19,fall)+.46*smoothstep(.58,.85,bar)*mainFlow;
          float quiet=.23+.77*mainFlow;
          float wave=sin(flow.y*1.38-t*1.74+2.7*bar+1.2*flow.x);
          vec2 slope=dir*((streak-.5)*.21+wave*(.022+.064*riffle))*quiet*(1.-smoothstep(.48,2.2,px));
          slope+=lateral*((wrinkle-.5)*.15*quiet+.041*eddy)*(1.-smoothstep(.12,.79,px));
          vec3 n=normalize(vec3(-slope.x,1.,-slope.y)),v=normalize(cameraPosition-wp),ref=reflect(-v,n);
          vec3 skyLight=texture2D(sky,vec2(.5+atan(ref.z,ref.x)*.159155,.5+asin(clamp(ref.y,-1.,1.))*.31831)).rgb;
          vec2 reflectedUv=mirrorUv.xy/max(.01,mirrorUv.w)+n.xz*.017;
          float border=min(min(reflectedUv.x,1.-reflectedUv.x),min(reflectedUv.y,1.-reflectedUv.y));
          float nearby=1.-smoothstep(35.,95.,distance(wp.xz,reflectCentre.xz));
          skyLight=mix(skyLight,texture2D(sceneReflection,clamp(reflectedUv,.002,.998)).rgb,
            nearby*reflectionWeight*smoothstep(0.,.04,border)*step(.01,mirrorUv.w));
          float thalweg=clamp(flow.x+channel.w*.32,-1.,1.);
          float depth=.045+mix(min(1.65,halfWidth*.16),min(.56,halfWidth*.19),desert)*(1.-thalweg*thalweg)*(.61+.75*pool);
          vec3 ray=refract(-v,n,.7502);
          vec2 bottom=wp.xz+depth*ray.xz/max(.24,-ray.y);
          vec3 stones=pow(texture2D(bed,bottom*.62).rgb,vec3(2.2));
          vec3 deposits=pow(texture2D(deposit,mat2(.8,-.6,.6,.8)*bottom*.43).rgb,vec3(2.2));
          vec3 substrate=mix(stones,deposits,smoothstep(.2,.81,bar+.19*edge+.13*channel.w*flow.x));
          substrate*=mix(vec3(.83,.95,.91),vec3(1.29,.87,.63),desert);
          float caustic=exp(-18.*abs(streak+.53*wrinkle-.765))*(1.-smoothstep(.1,.7,px))*exp(-depth*.7);
          vec3 waterTone=mix(vec3(.027,.105,.080),vec3(.14,.114,.061),desert);
          vec3 body=mix(waterTone,substrate*(.81+.47*caustic),exp(-depth*mix(1.25,2.25,desert)/max(.51,-ray.y)));
          float fr=.0204+.9796*pow(1.-max(0.,dot(v,n)),5.);
          float filaments=(1.-smoothstep(.025,.101,abs(wrinkle-.56)))*smoothstep(.32,.70,streak);
          float aeration=smoothstep(.43,.76,coarse)*(.28*riffle+.39*lee);
          float foam=filaments*aeration*(1.-smoothstep(.22,1.1,px));
          vec3 c=mix(body,skyLight,fr)+vec3(.83,.61,.33)*pow(max(0.,dot(n,normalize(v+sun))),140.);
          c*=1.-.16*(1.-smoothstep(.0,.38,fromBank-wetLine));
          gl_FragColor=vec4(mix(c,vec3(.65,.70,.65),foam*.75),1.);
          #include <colorspace_fragment>
        }`});
    const mesh=new T.Mesh(g,m);mesh.name='Mapped stream channels';scene.add(mesh);
    // Reflect the nearby bank and canopy in the local surface plane. Bryce's
    // reservoir uses this same renderer with its level shoreline plane.
    w.reflectLocalWater=(surface,surfacePlane)=>{
      const u=surface.material.uniforms;
      const image=new T.WebGLRenderTarget(512,256,{stencilBuffer:false});
      const mirror=new T.PerspectiveCamera(),projection=new T.Matrix4(),direction=new T.Vector3(),target=new T.Vector3();
      const lastEye=new T.Vector3(Infinity,0,0),lastDirection=new T.Vector3(),normal=new T.Vector3(),centre=new T.Vector3();
      const plane=new T.Plane(),clip=new T.Vector4(),corner=new T.Vector4();
      mirror.userData.lakeReflection=true;
      Object.assign(u,{sceneReflection:{value:image.texture},reflectProjection:{value:projection},reflectionWeight:{value:0},reflectCentre:{value:centre}});
      let lastUpdate=-Infinity;
      surface.onBeforeRender=(renderer,viewScene,camera)=>{
        if(!camera.isPerspectiveCamera||camera.userData.lakeReflection)return;
        const eye=camera.position,time=u.t.value;camera.getWorldDirection(direction);
        if(time>=lastUpdate&&time-lastUpdate<.16&&lastEye.distanceToSquared(eye)<25&&lastDirection.dot(direction)>.997)return;
        lastUpdate=time;lastEye.copy(eye);lastDirection.copy(direction);
        const weight=surfacePlane(eye,centre,normal);u.reflectionWeight.value=weight;
        if(!weight)return;
        plane.setFromNormalAndCoplanarPoint(normal,centre);
        const height=plane.distanceToPoint(eye);if(height<.01){u.reflectionWeight.value=0;return;}
        mirror.position.copy(eye).addScaledVector(normal,-2*height);target.copy(direction).reflect(normal).add(mirror.position);
        mirror.up.set(0,1,0).applyQuaternion(camera.quaternion).reflect(normal);mirror.lookAt(target);
        mirror.far=camera.far;mirror.updateMatrixWorld();mirror.projectionMatrix.copy(camera.projectionMatrix);
        projection.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1).multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);
        // Clip below the water on the reflected pass, including sloping riffles.
        plane.applyMatrix4(mirror.matrixWorldInverse);clip.set(plane.normal.x,plane.normal.y,plane.normal.z,plane.constant);
        const e=mirror.projectionMatrix.elements;
        corner.set((Math.sign(clip.x)+e[8])/e[0],(Math.sign(clip.y)+e[9])/e[5],-1,(1+e[10])/e[14]);
        clip.multiplyScalar(2/clip.dot(corner));e[2]=clip.x;e[6]=clip.y;e[10]=clip.z+.997;e[14]=clip.w;
        const saved=renderer.getRenderTarget(),xr=renderer.xr.enabled,shadows=renderer.shadowMap.autoUpdate;
        surface.visible=false;renderer.xr.enabled=false;renderer.shadowMap.autoUpdate=false;
        try{
          renderer.setRenderTarget(image);renderer.state.buffers.depth.setMask(true);if(!renderer.autoClear)renderer.clear();
          renderer.render(viewScene,mirror);
        }finally{
          renderer.setRenderTarget(saved);renderer.xr.enabled=xr;renderer.shadowMap.autoUpdate=shadows;surface.visible=true;
          if(camera.viewport)renderer.state.viewport(camera.viewport);
        }
      };
    };
    w.reflectLocalWater(mesh,(eye,centre,normal)=>{
      let best=105*105;
      for(let col=Math.floor((eye.x-95)/64);col<=Math.floor((eye.x+95)/64);col++)for(let row=Math.floor((eye.z-95)/64);row<=Math.floor((eye.z+95)/64);row++){
        for(const [ax,az,bx,bz,r,ay,by] of cells.get(col+','+row)||[]){
          const dx=bx-ax,dz=bz-az,ds=dx*dx+dz*dz||1;
          const along=Math.max(0,Math.min(1,((eye.x-ax)*dx+(eye.z-az)*dz)/ds));
          const x=ax+dx*along,z=az+dz*along,y=ay+(by-ay)*along;
          const distance=(x-eye.x)**2+(z-eye.z)**2+(y-eye.y)**2;if(distance>=best)continue;
          best=distance;centre.set(x,y,z);normal.set(-dx*(by-ay)/ds,1,-dz*(by-ay)/ds).normalize();
        }
      }
      return Math.max(0,Math.min(1,(105-Math.sqrt(best))/32));
    });
    const update=w.update.bind(w);w.update=(dt,t,p)=>{clock.value=t;update(dt,t,p);};
  }
  window.addFlightWater=(T,scene,w)=>{
    lakes(scene,w.region);
    if(w.region==='yosemite'||w.region==='bryce')streams(T,scene,w);
  };
})();
