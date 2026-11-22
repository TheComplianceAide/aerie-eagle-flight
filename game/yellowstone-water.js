(() => {
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const smooth=(lo,hi,v)=>{const x=clamp((v-lo)/(hi-lo),0,1);return x*x*(3-2*x);};
  const poolDefinitions=[
    ['prismatic',56,39,1,.12], ['excelsior',40,23,2,-.42],
    ['morning',7.3,6.8,3,.2],['sapphire',13.5,7,4,-.16],
    ['black-sand',10,7,3,.12],['fountain',8,5,5,0]
  ];
  window.makeYellowstoneWater = function makeYellowstoneWater(T,scene,meta,ground,sun,fog,panorama) {
    const reach=[];
    const points=meta.river.filter(([x,z])=>x>=-5950&&x<=5950&&z>=-11990&&z<=5950);
    function median(samples) {
      const finite=samples.filter(Number.isFinite).sort((a,b)=>a-b);
      return finite[Math.floor(finite.length*.5)];
    }
    for(let i=0,distance=0;i<points.length;i++){
      const [x,z,measuredLeft,measuredRight,measuredY]=points[i];
      const a=points[Math.max(0,i-2)], b=points[Math.min(i+2,points.length-1)];
      const len=Math.hypot(b[0]-a[0],b[1]-a[1])||1;
      const dx=(b[0]-a[0])/len,dz=(b[1]-a[1])/len;
      const measured=ground(x,z);
      const bed=median([-3,0,3].map(d=>ground(x+d*dz,z-d*dx)));
      const y=measuredY ?? Math.min(measured+.22,bed+.40);
      const half=clamp(12.8-3.6*Math.sin(z*.00071)+2.45*Math.sin(z*.0047+x*.0061),7,20);
      function bank(sign){
        for (let d=4;d<=half+5;d+=1.6) {
          if(ground(x+sign*d*dz,z-sign*d*dx)>y+.41)return Math.max(4,d-.5);
        }
        return half;
      }
      if(i)distance+=Math.hypot(x-points[i-1][0],z-points[i-1][1]);
      reach.push({x,z,dx,dz,y,left:measuredLeft??bank(-1),right:measuredRight??bank(1),distance});
    }
    for(let i=0;i<reach.length;i++){
      const row=reach.slice(Math.max(0,i-1),i+2);
      reach[i].visualY=median(row.map(q=>q.y))+.115;
      reach[i].left=Math.max(4, median(row.map(q=>q.left)));
      reach[i].right=Math.max(4, median(row.map(q=>q.right)));
    }
    const bins=new Map(),GRID=64,key=(a,b)=>a+':'+b;
    for(let i=0;i<reach.length-1;i++){
      const a=reach[i],b=reach[i+1];
      if(Math.hypot(a.x-b.x,a.z-b.z)>55)continue;
      for(let gx=Math.floor((Math.min(a.x,b.x)-180)/GRID);gx<=Math.floor((Math.max(a.x,b.x)+180)/GRID);gx++){
        for(let gz=Math.floor((Math.min(a.z,b.z)-180)/GRID);gz<=Math.floor((Math.max(a.z,b.z)+180)/GRID);gz++){
          const k=key(gx,gz);if(!bins.has(k))bins.set(k,[]);bins.get(k).push(i);
        }
      }
    }
    function nearest(x,z) {
      let best,bestD=Infinity;
      for(const i of bins.get(key(Math.floor(x/GRID),Math.floor(z/GRID)))||[]){
        const a=reach[i],b=reach[i+1],dx=b.x-a.x,dz=b.z-a.z,len=dx*dx+dz*dz;
        if(len<.01)continue;
        const t=clamp(((x-a.x)*dx+(z-a.z)*dz)/len,0,1);
        const px=a.x+t*dx,pz=a.z+t*dz,offX=x-px,offZ=z-pz,q=offX*offX+offZ*offZ;
        if(q>=bestD)continue;
        const side=offX*a.dz-offZ*a.dx, width=side>0?lerp(a.right,b.right,t):lerp(a.left,b.left,t);
        bestD=q;best={x:px,z:pz,y:lerp(a.visualY,b.visualY,t),width,distance:Math.sqrt(q),along:lerp(a.distance,b.distance,t),index:i};
      }
      return best;
    }
    const bankMasks=window.aerieWaterOpacity?.bind(T,['river_bank']);
    const uniforms={time:{value:0},sun:{value:sun},haze:{value:fog},panorama:{value:panorama},...bankMasks?.uniforms};
    const material=new T.ShaderMaterial({
      uniforms,side:T.DoubleSide,transparent:true,depthWrite:false,
      vertexShader:`
        attribute vec4 hydraulic;varying vec4 vWater;
        varying vec3 wp;
        void main(){
          vWater=hydraulic;
          wp=(modelMatrix*vec4(position,1.)).xyz;
          gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);
        }`,
      fragmentShader:`
        ${bankMasks?.shader||''}
        uniform float time;uniform sampler2D panorama;uniform vec3 sun,haze;varying vec4 vWater;varying vec3 wp;
        float hash(vec2 x){return fract(sin(dot(x,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 x){
          vec2 i=floor(x), f=fract(x);f=f*f*(3.-2.*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
        }
        void main(){
          float kind=vWater.w;
          vec3 view=normalize(cameraPosition-wp);
          float d=distance(cameraPosition,wp);
          float edge=clamp(vWater.z,0.,1.);
          vec2 coord=vWater.xy,foot=abs(dFdx(coord))+abs(dFdy(coord));
          float peak=1.-smoothstep(.13,.67,max(foot.x,foot.y));
          float stream=1.-step(.5,kind);
          vec2 p=wp.xz, q=vec2(0.);
          float shallow=smoothstep(.45,.97,edge);
          if(stream>.5){
            vec2 turbulence=p*.037-vec2(.021,.065)*time;
            vec2 eddy=vec2(noise(turbulence),noise(turbulence+vec2(8.1,3.7)))-.5;
            q=vec2(coord.x-1.04*time,coord.y)+eddy*(1.8+2.5*shallow);
          }else q=p*.82-vec2(.09,.16)*time;
          float wave1=sin(dot(q,vec2(1.70,-2.61))+.43*time+.9*noise(q*.26));
          float wave2=sin(dot(q,vec2(5.85,4.73))+.67*time+1.4*noise(q*.16+vec2(5.1,6.4)));
          float wave3=sin(dot(q,vec2(15.21,-6.32))-.82*time+1.7*noise(p*.69));
          float bend=noise(q*.51);
          vec2 curl=vec2(wave1*.04+wave2*.026, wave1*.02-wave2*.034)
                   +peak*vec2(wave3*.029,-wave3*.024);
          if(stream>.5){
            vec2 fast=vec2(q.x*.64,q.y*1.95);
            vec2 crossFlow=vec2(q.x*1.72-.29*q.y, q.y*.86+.18*q.x);
            vec2 breaks=vec2(noise(fast),noise(crossFlow+vec2(15.7,3.8)))-.5;
            vec2 small=vec2(noise(fast*3.3+13.2),noise(crossFlow*3.8-8.71))-.5;
            curl=.071*breaks+.045*small*peak+.007*vec2(wave1,wave2);
          }
          ${bankMasks?`
          float bankFilm=0.;
          if(stream>.5&&edge>.66&&edge<.995&&peak>.03){
            // Hydraulic station is the actual Firehole polyline, not an XY
            // ocean wave. Pools have stream=0 and retain the original optics.
            float parcel=floor(coord.x/18.);
            float seed=waHash(vec2(parcel,sign(coord.y)));
            float age=fract(time/(4.8+1.7*seed)+seed);
            vec2 film=waCell(vec2(fract(coord.x/18.)-.24*age,(edge-.64)/.36),${bankMasks.choices.river_bank},seed);
            bankFilm=film.x*smoothstep(.05,.20,age)*(1.-smoothstep(.62,1.,age))*peak;
            curl+=vec2(.018,-.025)*bankFilm;
          }
          `:''}
          vec3 surface=normalize(vec3(curl.x*(.45+.55*stream),1.,curl.y*(.45+.55*stream)));
          vec3 bounce=reflect(-view,surface);
          float fresnel=.024+.976*pow(1.-max(0.,dot(view,surface)),5.);
          float blue=smoothstep(-.05,.82,bounce.y);
          vec2 skyUV=vec2(fract(.5+atan(bounce.z,bounce.x)*.15915494+.565),clamp(.474+asin(bounce.y)*.31830989,.012,.995));
          vec3 sky=mix(vec3(.34,.37,.31),texture2D(panorama,skyUV).rgb,.28+.72*blue);
          sky=mix(sky,vec3(.12,.19,.12),stream*.63*(1.-smoothstep(.035,.42,bounce.y)));
          float visibility=1. /* direct terrain visibility */;
          float optic=pow(max(0.,dot(bounce,sun)),92.);
          float broad=pow(max(0.,dot(bounce,sun)),13.);
          vec3 glare=visibility*vec3(1.,.79,.49)*(optic*.42+broad*.036)*(1.-stream*.31);
          vec3 base=mix(vec3(.021,.075,.078),vec3(.184,.164,.095),shallow);
          if(kind>.5&&kind<1.5){
            base=mix(vec3(.017,.245,.462),vec3(.052,.598,.530),smoothstep(.50,.93,edge));
            base=mix(base,vec3(.31,.622,.291),smoothstep(.87,1.,edge));
          }else if(kind>1.5&&kind<4.5){
            base=mix(vec3(.024,.33,.43),vec3(.095,.57,.42),smoothstep(.38,.98,edge));
            if(kind>3.5)base=mix(base,vec3(.031,.43,.70),.46*(1.-shallow));
          }else if(kind>4.5){
            base=mix(vec3(.240,.166,.111),vec3(.486,.390,.285),shallow);
          }
          // Refraction plus two sediment scales in the shallows. Specular
          // ripples fall away smoothly below a screen pixel.
          vec2 displaced=p+curl*.92;
          float gravel=noise(displaced*4.35)*.57+noise(displaced*1.22)*.43;
          float caustic=pow(1.-abs(sin((noise(displaced*2.1+vec2(time*.12,-time*.09))+.51*wave1)*7.)),6.);
          base=base*(.88+.27*bend)+shallow*peak*(.24*(gravel-.51)+caustic*.019)*vec3(.76,.62,.43);
          float lace=smoothstep(.63,.86,noise(vec2(q.x*1.6,q.y*2.9)))*smoothstep(.71,.96,edge)*(1.-smoothstep(.985,1.,edge));
          vec3 surfaceRGB=mix(base,sky,fresnel*(.83-.20*stream-.18*shallow))+glare;
          surfaceRGB+=vec3(.45,.48,.46)*lace*(.14+.36*peak)*stream;
          ${bankMasks?'surfaceRGB+=sky*.095*bankFilm;':''}
          float air=1.-exp(-d*.000069);
          float margin=mix(.931,.67,stream);
          float film=1.-smoothstep(margin,1.,edge);
          gl_FragColor=vec4(mix(surfaceRGB,haze,air),film);
          #include <colorspace_fragment>
        }`
    });
    function addMesh(label,vertices,attribute,indices) {
      const geom=new T.BufferGeometry();
      geom.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
      geom.setAttribute('hydraulic',new T.Float32BufferAttribute(attribute,4));
      geom.setIndex(indices);geom.computeBoundingSphere();
      const mesh=new T.Mesh(geom,material);mesh.name=label;
      mesh.userData.terrainReceiver=true;mesh.userData.prepareFlightMaterial=true;
      mesh.layers.set(1);
      mesh.renderOrder=2;
      scene.add(mesh);
    }
    for(let tile=0;tile<reach.length-1;tile+=30){
      const vertices=[],attrib=[],indices=[],ends=Math.min(tile+31,reach.length),sides=10;
      for(let i=tile;i<ends;i++){
        const p=reach[i],r=i-tile;
        for(let j=0;j<=sides;j++){
          const across=2*j/sides-1, distance=across*(across<0?p.left:p.right);
          const x=p.x+p.dz*distance,z=p.z-p.dx*distance;
          const y=p.visualY-.052*Math.pow(Math.abs(across),3);
          vertices.push(x,y,z);attrib.push(p.distance,distance,Math.abs(across),0);
          if(i+1<ends&&j<sides&&Math.hypot(p.x-reach[i+1].x,p.z-reach[i+1].z)<55){
            const a=r*(sides+1)+j,b=a+sides+1;
            indices.push(a,b,a+1,b,b+1,a+1);
          }
        }
      }
      if(indices.length)addMesh('Firehole River · surveyed channel',vertices,attrib,indices);
    }
    const pools=[];
    function ellipse(x,z,a,b,ang,collar,name){
      return Array.from({length:96},(_,i)=>{
        const t=i*Math.PI/48,r=1+(name==='prismatic'?.055:.093)*Math.sin(3*t+.35)+.045*Math.sin(7*t+collar);
        const u=r*a*Math.cos(t),v=r*b*Math.sin(t);
        return [x+u*Math.cos(ang)-v*Math.sin(ang),z+u*Math.sin(ang)+v*Math.cos(ang)];
      });
    }
    meta.poolOutlines??={};
    for(const [name,a,b,kind,ang] of poolDefinitions){
      const [x,z]=meta.landmarks[name];
      const ring=meta.poolOutlines[name]||ellipse(x,z,a,b,ang,kind,name);
      const levels=ring.map(([px,pz])=>ground(lerp(x,px,.4),lerp(z,pz,.4)));
      const level=median(levels)+.23;
      const vertices=[x,level,z], attrib=[x,z,0,kind],indices=[];
      for(let s=1;s<=8;s++){
        const f=s/8;
        for(let i=0;i<ring.length;i++){
          const corner=ring[i], px=lerp(x,corner[0],f),pz=lerp(z,corner[1],f);
          const py=level+smooth(.58,1,f)*clamp(ground(px,pz)-level,-.30,.32)*.65;
          vertices.push(px,py,pz);attrib.push(px,pz,f,kind);
          const a=1+(s-1)*ring.length+i, b=1+(s-1)*ring.length+(i+1)%ring.length;
          if(s===1)indices.push(0,b,a);else indices.push(a,b,a-ring.length,a-ring.length,b,b-ring.length);
        }
      }
      addMesh(name==='prismatic'?'Grand Prismatic · thermal optics':name+' · thermal water',vertices,attrib,indices);
      pools.push({name,x,z,a,b,level,ring});
    }
    function at(x,z) {
      const r=nearest(x,z);
      if(r&&r.distance<r.width&&ground(x,z)<r.y+.36)return r.y;
      return poolAt(x,z)?.level??null;
    }
    function poolAt(x,z){
      for(const p of pools){
        if(((x-p.x)/p.a)**2+((z-p.z)/p.b)**2<.86)return p;
      }
      return null;
    }
    return {at,poolAt,nearest,reach,pools,update(time){uniforms.time.value=time;}};
  };
})();
