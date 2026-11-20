// Travel time is integrated once along the surveyed bed. The descending ropes,
// impact fan, airborne spray and the first wave leaving the pool share its phase.
window.makeWaterfallSystem=function makeWaterfallSystem(T,scene,{ground,level,clock,sun,texture,sky}){
  const noise=texture('falls-entrainment.webp',true),waterGrain=texture('waternormals.jpg',true);
  const wind={value:new T.Vector2(.8,.4)},strength={value:.25};
  const common={fallClock:clock,fallCloud:{value:noise},fallGrain:{value:waterGrain},fallSky:{value:sky},fallWind:wind,fallGust:strength,fallSun:{value:sun}};
  const lit=`uniform float fallClock,fallGust;uniform vec2 fallWind;uniform vec3 fallSun;
    uniform sampler2D fallCloud,fallGrain;
    float release(float t,vec2 source){return .52+.30*sin(1.23*t+.031*source.x-.017*source.y)+.18*sin(2.21*t-.018*source.x+.043*source.y);}`;
  const impacts=[],outlets=[],routes=[],channelCells=new Map();
  const cell=(x,z)=>Math.floor(x/48)+','+Math.floor(z/48);
  function inChute(x,z,crown){
    for(const p of channelCells.get(cell(x,z))||[])if((x-p.x)**2+(z-p.z)**2<(p.radius+crown*.36)**2)return true;
    return false;
  }
  const sheet=new T.ShaderMaterial({uniforms:common,side:T.DoubleSide,transparent:true,depthWrite:false,
    vertexShader:`${lit}
      attribute vec4 hydraulics;attribute vec2 impactAt;varying vec2 st,source;varying vec3 loc;varying vec4 water;
      void main(){st=uv;source=impactAt;water=hydraulics;vec3 p=position;
        float motion=fallClock-hydraulics.y;float travelling=release(motion,impactAt);
        float airborne=hydraulics.z;
        p.xz+=fallWind*airborne*(.23+.54*fallGust)*(.60+.33*sin(1.38*motion+hydraulics.w+uv.x*4.))*(.45+hydraulics.x*.13);
        p.y+=airborne*.09*sin(uv.x*7.2+motion*3.1)+.07*travelling;
        loc=p;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`,
    fragmentShader:`${lit} uniform sampler2D fallSky;varying vec2 st,source;varying vec3 loc;varying vec4 water;
      void main(){float t=fallClock-water.y,grade=water.z,phase=water.w;
        float u=st.x,w=water.x,d=st.y,small=1.-smoothstep(3.5,7.,w);
        float life=release(t,source);float flow=t*(.11+.08*small);
        // Coherent moving water and independently shed vortices use different
        // length scales. Exposed rubble and broad sheets break up differently.
        vec2 bed=vec2(u*.72+phase,d/max(4.,w)*.36);
        vec3 eddy=texture2D(fallCloud,bed+vec2(.022,-.018)*fallClock).rgb;
        vec2 curl=texture2D(fallCloud,vec2(u*.35+d*.004,flow*.43+phase)).rg-.5;
        vec2 chuteUV=vec2(u*.80+curl.x*.29+(eddy.r-.5)*mix(.19,.51,small),-flow*.59+phase);
        vec3 drawn=texture2D(fallCloud,chuteUV).rgb;
        float streak=texture2D(fallCloud,vec2(u*2.15+(drawn.r-.5)*.29,-flow*.90+.18*eddy.g)).g;
        vec2 groundUV=vec2(u*1.38+eddy.b*.46,d/max(1.,w)*.49-flow*.53+eddy.r*.48);
        vec3 broken=texture2D(fallCloud,groundUV).rgb;
        float aerated=smoothstep(.28,.77,.51*drawn.r+.28*streak+.21*drawn.b+.105*(life-.5));
        float rapid=smoothstep(.35,.81,.44*broken.g+.27*broken.b+.29*eddy.g+.05*(life-.5));
        float free=smoothstep(.40,.92,grade)*(1.-.69*small);
        float froth=mix(rapid,aerated,free);
        float wander=.22*(eddy.b-.5)+.085*(drawn.g-.5);
        float edge=smoothstep(-.025,.16,min(u+wander,1.-u-wander)+.15*(broken.r-.5));
        float mask=mix(smoothstep(.13,.58,broken.r*.50+eddy.b*.50),smoothstep(.12,.59,drawn.g*.74+streak*.26),free);
        float flaky=smoothstep(.24,.68,mix(broken.b,streak,free));
        float alpha=edge*(.07+mask*(.12+.70*froth)+.09*flaky);
        vec3 v=normalize(cameraPosition-loc);
        vec3 geometric=normalize(cross(dFdx(loc),dFdy(loc)));if(dot(v,geometric)<0.)geometric*=-1.;
        vec3 n=normalize(geometric+vec3((broken.r-.5)*.22,(drawn.g-.5)*.16,(broken.b-.5)*.24));
        vec3 rr=reflect(-v,n);vec2 plate=vec2(.5+atan(rr.z,rr.x)*.15915494,.5+asin(clamp(rr.y,-1.,1.))*.31831);
        vec3 reflected=pow(max(texture2D(fallSky,plate).rgb,vec3(.001)),vec3(.4545));
        vec3 clear=mix(vec3(.15,.25,.25),reflected,.27+.29*pow(1.-max(0.,dot(n,v)),4.));
        float sunward=.5+.5*dot(v,-fallSun);vec3 white=mix(vec3(.64,.75,.77),vec3(.96,.97,.93),.20+.39*sunward+.27*flaky);
        vec3 base=mix(clear,white,smoothstep(.04,.87,froth)*(.80+.14*flaky));
        gl_FragColor=vec4(base,alpha);}`});
  function geometry(position,uv,index,extra){
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(position,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    for(const [key,[array,dim]] of Object.entries(extra))g.setAttribute(key,new T.Float32BufferAttribute(array,dim));
    g.setIndex(index);g.computeBoundingSphere();return g;
  }
  function poolFan(source,poolLevel){
    const {x,z,y,dx,dz,width,drop}=source;
    const radius=width*(1.22+Math.min(1.5,drop/100)),up=radius*.65,down=radius*3.75;
    const pos=[],uv=[],index=[],cols=26,rows=37;
    for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){
      const across=(i/cols*2-1)*radius*1.7,along=-up+(up+down)*j/rows;
      const px=x+dx*along-dz*across,pz=z+dz*along+dx*across;
      const py=poolLevel===undefined?Math.max(ground(px,pz)+.29,level??-1e5):poolLevel+.057;
      pos.push(px,py,pz);uv.push(across/radius,along/radius);const k=j*(cols+1)+i;
      if(i<cols&&j<rows)index.push(k,k+cols+1,k+1,k+1,k+cols+1,k+cols+2);
    }
    const mat=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-3,
      uniforms:{...common,sourceXZ:{value:new T.Vector2(x,z)},fanRadius:{value:radius},poolY:{value:y},flowDir:{value:new T.Vector2(dx,dz)}},
      vertexShader:'varying vec2 fan;varying vec3 wp;void main(){fan=uv;wp=position;gl_Position=projectionMatrix*viewMatrix*vec4(position,1.);}',
      fragmentShader:`${lit} uniform vec2 sourceXZ,flowDir;uniform float fanRadius,poolY;varying vec2 fan;varying vec3 wp;
        void main(){vec2 q=fan*fanRadius;float r=length(q*vec2(1.,.85));float t=fallClock;
          float pulse=release(t-r/3.75,sourceXZ);vec2 current=flowDir*.75+fallWind*(.25+.19*fallGust);
          vec2 adv=wp.xz-current*t*.93;float broad=texture2D(fallCloud,adv*.036+vec2(.23,.84)).r;
          vec2 warp=texture2D(fallGrain,adv*.062).rg-.5;float fine=texture2D(fallGrain,adv*.185+warp*.24).g;
          float az=atan(q.x,q.y);float distort=.12*sin(az*3.+broad*2.)+.10*(broad-.4);
          float core=1.-smoothstep(.14,.71,length(fan*vec2(1.40,1.35))+distort);
          float width=.28+.25*sqrt(max(0.,fan.y));float channel=1.-smoothstep(width*.2,width+.10,abs(fan.x-.12*sin(fan.y*1.9+t*.16)));
          channel*=smoothstep(-.36,.40,fan.y)*(1.-smoothstep(.55,3.7,fan.y));
          float cell=texture2D(fallCloud,adv*.10+warp*.12).r;
          float streamers=smoothstep(.36,.75,cell*.57+fine*.43)*channel;
          float road=r*1.34-t*4.08+broad*.85+.14*sin(az*7.);
          float aa=1.-smoothstep(.7,3.1,fwidth(road));
          float crest=smoothstep(.75,.99,sin(road))*aa;
          float wave=crest*(1.-smoothstep(.72,2.25,length(fan)))*(.07+.18*pulse)*(.20+.8*smoothstep(.21,.65,broad));
          float alpha=clamp(core*(.48+.51*fine)+streamers*(.36+.39*broad)+wave,0.,.94);
          alpha*=1.-smoothstep(.5,2.1,wp.y-poolY);if(alpha<.012)discard;vec3 film=mix(vec3(.42,.60,.61),vec3(.94,.96,.92),.22+.47*fine+.31*core);
          gl_FragColor=vec4(film,alpha);}`});
    const mesh=new T.Mesh(geometry(pos,uv,index,{}),mat);mesh.name=source.name+' · aerated pool and drifting foam';mesh.renderOrder=1;scene.add(mesh);
  }
  function plume(source){
    const {x,y,z,width,drop,dx,dz}=source,quad=new T.PlaneGeometry(1,1),g=new T.InstancedBufferGeometry();
    const count=Math.min(122,Math.ceil(40+Math.sqrt(drop)*6)),seed=[];
    let n=(Math.floor(Math.abs(x*13+z*19))+631)>>>0;
    function rnd(){n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;}
    for(let i=0;i<count;i++)seed.push(rnd(),rnd(),rnd(),i%4===0?1:0);
    g.index=quad.index;g.setAttribute('position',quad.attributes.position);g.setAttribute('uv',quad.attributes.uv);g.setAttribute('splash',new T.InstancedBufferAttribute(new Float32Array(seed),4));g.instanceCount=count;
    g.boundingSphere=new T.Sphere(new T.Vector3(x,y,z),80+width*3.6);
    const mat=new T.ShaderMaterial({uniforms:{...common,impact:{value:new T.Vector3(x,y+.4,z)},bedDirection:{value:new T.Vector2(dx,dz)},chuteWidth:{value:width},head:{value:drop}},transparent:true,depthWrite:false,
      vertexShader:`${lit} attribute vec4 splash;uniform vec3 impact;uniform vec2 bedDirection;uniform float chuteWidth,head;
        varying vec2 st;varying vec4 puff;varying float light,abovePool;
        void main(){float droplet=splash.w,lifeSeconds=mix(3.1+3.1*splash.z,1.4+.8*splash.z,droplet);
          float cycle=fallClock/lifeSeconds+splash.x,life=fract(cycle),age=life*lifeSeconds;
          float seq=fract(splash.y+floor(cycle)*.618034),angle=6.283*(splash.z+seq*.33);
          vec2 radial=vec2(sin(angle),cos(angle));float pulse=release(fallClock-age,impact.xz);
          float impulse=clamp(sqrt(head)*.52,.72,6.8)*(.61+.54*pulse);vec3 pos=impact;
          vec2 side=vec2(-bedDirection.y,bedDirection.x);
          pos.xz+=side*(splash.y-.5)*chuteWidth*.83;
          // Impact rebounds into a low asymmetric fan. The larger drops take
          // ballistic arcs. Fine mist follows the current, then the local wind.
          vec2 jet=bedDirection*(1.25+2.0*seq)+side*(splash.y-.5)*3.6;
          pos.xz+=(radial*.49+jet)*impulse*(1.-exp(-age*.96));
          pos.xz+=(bedDirection*(.85+1.7*seq)+side*.39*sin(seq*24.))*age;
          pos.xz+=fallWind*(3.4+5.2*fallGust)*(age-.81*(1.-exp(-age/.81)))*mix(1.,.31,droplet);
          pos.y+=mix(impulse*(.40+.83*seq)*(1.-exp(-age*.94))+age*(.11+.15*fallGust),
               (2.2+impulse*(.83+.60*seq))*age-4.905*age*age,droplet);
          float size=mix(.51+chuteWidth*.087+(4.4+impulse*1.40)*life,.089+.20*seq,droplet);
          vec2 c=position.xy;float a=seq*6.283+age*.12;
          c=mat2(cos(a),sin(a),-sin(a),cos(a))*c;
          c*=mix(vec2(1.74,.57),vec2(.79,2.12),droplet);
          vec3 displaced=pos+vec3(c*size,0.)*mat3(viewMatrix);abovePool=displaced.y-impact.y;
          vec4 v=viewMatrix*vec4(displaced,1.);
          gl_Position=projectionMatrix*v;st=uv;puff=vec4(life,seq,droplet,pulse);light=.5+.5*dot(normalize(cameraPosition-pos),-fallSun);}`,
      fragmentShader:`${lit} varying vec2 st;varying vec4 puff;varying float light,abovePool;
        void main(){vec2 q=st*2.-1.;float radius=dot(q,q);if(radius>1.)discard;
          float cloud=texture2D(fallCloud,st*.71+vec2(.5,.93)*puff.y+vec2(.026,-.043)*puff.x).r;
          float filaments=texture2D(fallGrain,st*.21+vec2(puff.y,.63)).r;
          float body=smoothstep(.035,.69,(1.-radius)*(.37+1.13*cloud+.25*filaments));
          float envelope=smoothstep(.0,.13,puff.x)*(1.-smoothstep(.42,1.,puff.x));
          float ragged=smoothstep(.13,.66,cloud*.77+filaments*.23-.13*radius);
          float a=body*envelope*mix(.028+.034*puff.w,.61,puff.z)*ragged*smoothstep(-.27,.31,abovePool);
          vec3 c=mix(vec3(.48,.60,.62),vec3(.90,.95,.94),.14+.39*cloud+.33*light);
          gl_FragColor=vec4(c,a);}`});
    const m=new T.Mesh(g,mat);m.name=source.name+' · windborne spray';m.renderOrder=2;scene.add(m);
  }
  function chute(name,path,width,options={}){
    if(path.length<2)return;
    const nodes=[],spline=new T.CatmullRomCurve3(path.map(([x,z])=>new T.Vector3(x,0,z)),false,'centripetal');
    const spacing=Math.min(1.8,Math.max(.27,width*.104));
    const samples=spline.getSpacedPoints(Math.ceil(spline.getLength()/spacing)).map(p=>[p.x,p.z]);
    let fallTime=0,travel=0;
    const cols=10,positions=[],uv=[],index=[],hydro=[],impactAt=[],heights=new Float32Array(cols+1),speeds=new Float32Array(cols+1);
    const crosses=[],heightAt=(x,z)=>Math.max(ground(x,z),level??-Infinity);
    for(let i=0;i<samples.length;i++){
      const [x,z]=samples[i],a=samples[Math.max(0,i-1)],b=samples[Math.min(samples.length-1,i+1)];
      const len=Math.hypot(b[0]-a[0],b[1]-a[1])||1,dx=(b[0]-a[0])/len,dz=(b[1]-a[1])/len;
      const ds=i?Math.hypot(x-a[0],z-a[1]):0,y=heightAt(x,z);
      const grade=i?Math.max(0,(nodes[i-1].floor-y)/Math.max(.1,ds)):0;
      const speed=Math.min(14,1.35+Math.min(3.2,width*.26)+(2.1+Math.min(2.8,width*.22))*Math.sqrt(Math.min(5,grade)));const dt=ds/speed;
      fallTime+=dt;travel+=ds;const wid=width*(.72+.15*Math.sin(travel*.064)+.09*Math.sin(travel*.19+.6)+.08*Math.min(3,grade));
      const phase=.0043*path[0][0]+.0011*path[0][1];let air=0,collision=0,centerAir=0;
      for(let j=0;j<=cols;j++){
        const u=j/cols,cross=(u-.5)*wid,px=x-dz*cross,pz=z+dx*cross,floor=heightAt(px,pz)+Math.min(.66,Math.max(.053,width*.037));
        // A parcel leaves the ledge with its current velocity. The bed catches
        // it again when gravity has closed the gap below the free trajectory.
        const flight=i?heights[j]+speeds[j]*dt-4.905*dt*dt:floor;
        if(j===(cols>>1)){centerAir=Math.max(0,flight-floor);
          if(i&&nodes[i-1].centerAir>.2&&flight<=floor+.12)collision=(speeds[j]*speeds[j])/19.62;}
        speeds[j]=flight>floor?speeds[j]-9.81*dt:-Math.min(6,grade*speed*.35);
        heights[j]=Math.max(floor,flight);air=Math.max(air,flight-floor);
        positions.push(px,heights[j],pz);uv.push(u,travel);
        hydro.push(wid,fallTime,Math.min(1,.19+grade*.54+Math.max(0,flight-floor)*.21),phase);
        if(i&&j){const k=i*(cols+1)+j;index.push(k-cols-2,k-1,k,k-cols-2,k,k-cols-1);}
      }
      if(collision>1.5)crosses.push({i,energy:collision});
      if(i%3===0||i===samples.length-1){const station={x,z,radius:wid*.54+1};
        for(let a=Math.floor((x-wid-12)/48);a<=Math.floor((x+wid+12)/48);a++)for(let b=Math.floor((z-wid-12)/48);b<=Math.floor((z+wid+12)/48);b++){
          const key=a+','+b;if(!channelCells.has(key))channelCells.set(key,[]);channelCells.get(key).push(station);}}
      nodes.push({x,z,y:heights[cols>>1],dx,dz,floor:y,air,centerAir,time:fallTime,travel});
    }
    const end=nodes.at(-1);for(let i=0;i<hydro.length;i+=4){hydro[i+1]-=fallTime;impactAt.push(end.x,end.z);}
    const mesh=new T.Mesh(geometry(positions,uv,index,{hydraulics:[hydro,4],impactAt:[impactAt,2]}),sheet);mesh.name=name+' · falling water';scene.add(mesh);
    // Also locate the foot of an attached chute where its steep, aerated
    // descent becomes a low-gradient stream. A downstream mouth gets only
    // the energy that actually remains, even after a very high upstream fall.
    for(let i=5;i<nodes.length-4;i++){
      const p=nodes[i],a=nodes[i-5],b=nodes[i+4];
      const before=(a.y-p.y)/Math.max(1,p.travel-a.travel),after=(p.y-b.y)/Math.max(1,b.travel-p.travel);
      if(before>.47&&after<before*.38&&after<.53)crosses.push({i,energy:Math.min(48,(before-after)*15)});
    }
    const chosen=[];
    for(const hit of crosses.sort((a,b)=>b.energy-a.energy)){
      if(chosen.length>=3||chosen.some(c=>Math.abs(nodes[c.i].travel-nodes[hit.i].travel)<32)||end.travel-nodes[hit.i].travel<11)continue;
      chosen.push(hit);
    }
    function contact(n,w,head,pool,withFoam){const src={name,x:n.x,z:n.z,y:pool??n.floor,dx:n.dx,dz:n.dz,width:w,drop:head};impacts.push(src);plume(src);if(withFoam)poolFan(src,pool);return src;}
    for(const hit of chosen){const site=nodes[hit.i],hz=level!=null&&site.floor<level+.35?level:undefined;
      const src=contact(site,width*.77,hit.energy,hz,true);if(hz!==undefined)outlets.push(src);}
    if(options.pool!==false){
      const hz=options.poolLevel??((level!=null&&end.floor<level+.85)?level:undefined);
      const upstream=nodes.findLast(p=>end.travel-p.travel>width*1.70)||nodes[0];
      const head=Math.max(1.1,Math.min(110,(upstream.y-end.floor)*.94));
      const src=contact(end,width,head,hz,true);
      if(level!=null&&hz!==undefined&&Math.abs(level-hz)<.5)outlets.push(src);
    }
    const route={name,nodes,width};routes.push(route);return route;
  }
  function couple(lake){
    if(!lake||!outlets.length)return;
    const a=lake.material,atlas=!!a.uniforms.shoreField;
    const sites=outlets.slice(0,4).map(p=>new T.Vector4(p.x,p.z,p.width,.65+.035*Math.sqrt(p.drop)));
    Object.assign(a.uniforms,{fallsAt:{value:sites},fallsTime:clock});
    const fn=`uniform vec4 fallsAt[${sites.length}];uniform float fallsTime;
      vec2 plungeSlope(vec2 p,float px){vec2 sum=vec2(0.);for(int i=0;i<${sites.length};i++){
        vec4 s=fallsAt[i];vec2 d=p-s.xy;float r=length(d),w=s.z;
        float decay=exp(-r/max(4.,w*2.9))*(1.-smoothstep(w*5.,w*8.,r));
        float phase=1.13*r-fallsTime*3.43+.34*sin(dot(d,vec2(.26,-.18)));
        float packet=.58+.26*sin(1.23*(fallsTime-r/3.8)+.031*s.x-.017*s.y)+.16*sin(2.21*(fallsTime-r/3.8)-.018*s.x+.043*s.y);
        sum+=d/max(.3,r)*.20*s.w*packet*decay*cos(phase)*(1.-smoothstep(1.,3.1,px));}return sum;}`;
    const anchor=atlas?'vec3 n=normalize(vec3(slope.x,1.,slope.y));':'vec3 surfaceNormal=normalize';
    a.fragmentShader=fn+'\n'+a.fragmentShader.replace(anchor,(atlas?'slope+=plungeSlope(p,footprint);':'slope+=plungeSlope(worldPosition.xz,pixel);')+'\n'+anchor);a.needsUpdate=true;
  }
  function update(field,time,player){if(!field)return;wind.value.set(field.direction.x,field.direction.z);
    let near,range=Infinity;for(const p of impacts){const d=Math.hypot(player.x-p.x,player.z-p.z);if(d<range){range=d;near=p;}}
    if(near)strength.value=field.gust(near.x,near.z,time);}
  return {chute,couple,update,inChute,impacts,routes};
};
