// Lower Yosemite Fall Trail footbridge and the granite reach of Yosemite Creek.
// The NPS CAD trace fixes the crossing. Two independent laser surveys measure
// its flat deck above the bed. NPS's 2005 photograph documents its timber rails,
// splayed braces, steel girders and masonry pier.
window.makeYosemiteCreek=function makeYosemiteCreek(T,scene,options){
  const {elevation,texture,sky,clock,sun}=options, survey=window.yosemiteCreekSurvey;
  const stations=survey.stations;
  const data=survey.stones,coords=new Int16Array(decode(data.xyz)),tones=new Uint8Array(decode(data.tone));
  const faces=data.wide?new Uint32Array(decode(data.faces)):new Uint16Array(decode(data.faces));
  const group=new T.Group();group.name='Lower Yosemite Fall viewing bridge and boulder reach';scene.add(group);
  const stonePositions=new Float32Array(coords.length),stoneColor=new Float32Array(coords.length);
  const floorBins=new Map(),flowBins=new Map(),bin=(a,b)=>Math.floor(a/8)*65536+Math.floor(b/8);
  function decode(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0)).buffer;}
  function contains(x,z){return x>2483&&x<2741&&z>-1957&&z< -1683;}
  function ownsFlow(x,z){return x>2510&&x<2718&&z>-1892&&z<=-1728;}
  function put(map,x,z,value){const k=bin(x,z);let items=map.get(k);if(!items){items=[];map.set(k,items);}items.push(value);}
  function indexBox(map,x0,z0,x1,z1,item){
    for(let ax=Math.floor(x0/8);ax<=Math.floor(x1/8);ax++)
      for(let az=Math.floor(z0/8);az<=Math.floor(z1/8);az++)put(map,8*ax,8*az,item);
  }
  for(let i=0;i<coords.length;i+=3){
    stonePositions[i]=2480+coords[i]*.01;stonePositions[i+1]=1180+coords[i+1]*.01;stonePositions[i+2]=-1960+coords[i+2]*.01;
    const tone=tones[i/3]/255;
    stoneColor.set([tone*1.02,tone,tone*.955],i);
  }
  function attributes(positions,indices){
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    g.setIndex(new T.BufferAttribute(indices,1));g.computeVertexNormals();g.computeBoundingSphere();return g;
  }
  const stone=attributes(stonePositions,faces);
  stone.setAttribute('color',new T.BufferAttribute(stoneColor,3));
  stone.setAttribute('stoneSurface',new T.Uint8BufferAttribute(new Uint8Array(decode(data.surface)),2,true));
  const scan=texture('yosemite-creek-granite.webp',true);scan.wrapS=scan.wrapT=T.MirroredRepeatWrapping;
  const granite=new T.ShaderMaterial({vertexColors:true,uniforms:{mineral:{value:scan},sun:{value:sun}},
    vertexShader:'attribute vec2 stoneSurface;varying vec2 faceWater;varying vec3 point,nrm,base;void main(){point=position;nrm=normal;base=color;faceWater=stoneSurface;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform sampler2D mineral;uniform vec3 sun;varying vec2 faceWater;varying vec3 point,nrm,base;
      vec3 mineralAt(vec3 p,vec3 n,float freq){
        vec3 weights=pow(abs(n),vec3(3.));weights/=max(.001,weights.x+weights.y+weights.z);
        return weights.x*texture2D(mineral,p.zy*freq+vec2(.11,.42)).rgb+weights.y*texture2D(mineral,p.xz*freq+vec2(.45,.13)).rgb+weights.z*texture2D(mineral,p.xy*freq).rgb;
      }
      void main(){vec3 facet=normalize(cross(dFdx(point),dFdy(point))),n=normalize(mix(normalize(nrm),facet,.33));
        vec3 coarse=mineralAt(point,n,.34),grain=mineralAt(point,n,1.09);
        float seams=smoothstep(.56,.80,1.-coarse.g)*(.24+.22*grain.g);
        float surface=clamp(.67+.88*(coarse.r-.48)+.48*(grain.r-.48)+.19*(grain.b-.5)-seams,.28,1.21);
        float darken=mix(1.,.56,faceWater.x)*mix(1.,.69,smoothstep(.49,1.,faceWater.y));
        vec3 alb=base*surface*darken;
        float slope=max(0.,dot(n,normalize(vec3(-.58,.73,.36))));
        vec3 light=vec3(.48,.55,.67)*(.42+.72*slope)+vec3(.89,.74,.56)*max(0.,dot(n,sun))*(1. /* direct terrain visibility */);
        vec3 view=normalize(cameraPosition-point);
        vec3 c=pow(max(alb,vec3(.008)),vec3(2.2))*light;
        c+=vec3(.14,.16,.19)*faceWater.x*pow(1.-max(0.,dot(n,view)),4.)*.29;
        gl_FragColor=vec4(c,1.);
        #include <colorspace_fragment>
      }`});
  const blocks=new T.Mesh(stone,granite);blocks.name='Yosemite Creek · registered granite blocks';
  blocks.userData.terrainReceiver=true;blocks.userData.prepareFlightMaterial=true;group.add(blocks);
  // The rendered crown of a block is also the collision and waterline surface.
  for(let i=0;i<faces.length;i+=3){
    const a=faces[i]*3,b=faces[i+1]*3,c=faces[i+2]*3;
    const ax=stonePositions[a],az=stonePositions[a+2],ay=stonePositions[a+1];
    const bx=stonePositions[b]-ax,bz=stonePositions[b+2]-az,cx=stonePositions[c]-ax,cz=stonePositions[c+2]-az;
    const det=bx*cz-bz*cx;if(det>=-.0001)continue;
    const tri=[ax,az,ay,cz/det,-cx/det,-bz/det,bx/det,stonePositions[b+1]-ay,stonePositions[c+1]-ay];
    indexBox(floorBins,ax+Math.min(0,bx,cx),az+Math.min(0,bz,cz),ax+Math.max(0,bx,cx),az+Math.max(0,bz,cz),tri);
  }
  function rockTop(x,z){
    let y=-Infinity;
    for(const [ax,az,ay,ux,uz,vx,vz,by,cy] of floorBins.get(bin(x,z))||[]){
      const xx=x-ax,zz=z-az,u=ux*xx+uz*zz,v=vx*xx+vz*zz;
      if(u>=0&&v>=0&&u+v<=1)y=Math.max(y,ay+u*by+v*cy);
    }
    return y;
  }

  // Form a stage surface across each lidar cross-section. Intersect its wet
  // polygons with actual bare earth and granite instead of lifting blue ribbons
  // over obstructions. Gaps and wake lines persist when the camera banks.
  const pos=[],flow=[],breaking=[],wetIndices=[],columns=33,width=16;let previous=null,stationLength=0;
  function vertex(v){const index=pos.length/3;pos.push(v[0],v[1],v[2]);flow.push(v[3],v[4],v[5],v[6]);breaking.push(v[7]);return index;}
  function shore(a,b){
    const fraction=a[5]/(a[5]-b[5]);
    return a.map((n,i)=>n+(b[i]-n)*fraction);
  }
  function triangle(a,b,c){
    const src=[a,b,c],poly=[];
    for(let i=0;i<3;i++){
      const a=src[i],b=src[(i+1)%3];if(a[5]>0)poly.push(a);
      if((a[5]>0)!==(b[5]>0))poly.push(shore(a,b));
    }
    if(poly.length<3)return;
    const first=vertex(poly[0]);for(let i=1;i<poly.length-1;i++){wetIndices.push(first,vertex(poly[i]),vertex(poly[i+1]));}
  }
  for(let i=0;i<stations.length;i++){
    const [x,z,nx,nz,observed]=stations[i],prevStation=stations[Math.max(0,i-1)],next=stations[Math.min(i+1,stations.length-1)];
    const ground=elevation(x,z);
    const fade=Math.min(1,Math.min(i,stations.length-1-i)/6);
    const stage=ground+.13+(observed-ground-.13)*fade;
    if(i)stationLength+=Math.hypot(x-prevStation[0],z-prevStation[1]);
    const fall=Math.max(0,(prevStation[4]-next[4])/Math.max(1,Math.hypot(next[0]-prevStation[0],next[1]-prevStation[1])));
    const row=[];
    // Taper the two interfaces into their existing upstream/downstream channels.
    const span=3.4+(width-3.4)*fade;
    for(let j=0;j<columns;j++){
      const d=span*(j/(columns-1)*2-1),xx=x+d*nx,zz=z+d*nz;
      const base=Math.max(elevation(xx,zz),rockTop(xx,zz));
      const y=stage+.017*Math.sin(stationLength*.53+d*.31)*Math.min(1,fall*9);
      const depth=Math.min(y-base-.018,(span-Math.abs(d))*.65);
      let white=0;
      for(const [a,b,minor,major,tx,tz] of survey.wakes){
        const rx=xx-a,rz=zz-b,along=rx*tx+rz*tz;
        if(along< -1.65*major||along>6.0*major+.6)continue;
        const side=Math.abs(rx*tz-rz*tx),spread=.35+.34*minor+.13*Math.max(0,along);
        const flank=(side-.73*minor)/spread;
        const tongue=Math.exp(-.94*flank*flank-Math.max(0,along)/(2.9*major+.45));
        white=Math.max(white,tongue*Math.min(1,(along+1.65*major)/(minor+.19)));
      }
      row.push([xx,y,zz,stationLength,d,depth,fall,white]);
    }
    if(previous){
      for(let j=1;j<columns;j++){
        triangle(previous[j-1],row[j-1],row[j]);triangle(previous[j-1],row[j],previous[j]);
      }
      const segment=[prevStation[0],prevStation[1],x,z,previous.stage,stage,span];
      indexBox(flowBins,Math.min(x,prevStation[0])-span,Math.min(z,prevStation[1])-span,Math.max(x,prevStation[0])+span,Math.max(z,prevStation[1])+span,segment);
    }
    row.stage=stage;previous=row;
  }
  function waterAt(x,z){
    if(!ownsFlow(x,z))return -Infinity;
    let best=Infinity,stage=-Infinity;
    for(const [ax,az,bx,bz,ay,by,r] of flowBins.get(bin(x,z))||[]){
      const dx=bx-ax,dz=bz-az,k=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1)));
      const dist=(x-ax-k*dx)**2+(z-az-k*dz)**2;
      if(dist<best&&dist<r*r){stage=ay+k*(by-ay);best=dist;}
    }
    return stage>Math.max(rockTop(x,z),elevation(x,z))+.018?stage:-Infinity;
  }
  const waterGeo=attributes(pos,new Uint16Array(wetIndices));waterGeo.setAttribute('creek',new T.Float32BufferAttribute(flow,4));waterGeo.setAttribute('wavePressure',new T.Float32BufferAttribute(breaking,1));
  const stream=new T.ShaderMaterial({side:T.DoubleSide,transparent:true,depthWrite:false,uniforms:{time:clock,sky:{value:sky},sun:{value:sun},stone:{value:scan},bed:{value:texture('yosemite-creek-bank.webp')},foamFilaments:{value:texture('falls-entrainment.webp',true)}},
    vertexShader:'attribute vec4 creek;attribute float wavePressure;varying vec3 p;varying vec4 flow;varying float pressure;void main(){p=position;flow=creek;pressure=wavePressure;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}',
    fragmentShader:`uniform float time;uniform vec3 sun;uniform sampler2D sky,stone,bed,foamFilaments;varying float pressure;varying vec3 p;varying vec4 flow;
      float hash(vec2 i){return fract(sin(dot(i,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 s){vec2 i=floor(s),f=fract(s);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
      void main(){
        float slope=flow.w,depth=max(0.,flow.z),shallow=1.-smoothstep(.08,1.02,depth);
        vec2 q=flow.xy;float dx=max(length(dFdx(q)),length(dFdy(q)));
        float phase=fract(time*.194),phase2=fract(phase+.5),blend=abs(phase*2.-1.);
        vec2 speed=vec2(.70+2.7*min(.55,slope),.09*sin(q.x*.27));
        vec2 a=q-speed*(phase-.5)*5.15,b=q-speed*(phase2-.5)*5.15;
        float w=mix(noise(a*vec2(.55,2.42)),noise(b*vec2(.55,2.42)),blend);
        float w2=mix(noise(a*vec2(1.28,5.4)+8.),noise(b*vec2(1.28,5.4)+8.),blend);
        float band=1.-smoothstep(.09,.30,abs(sin(q.x*1.25+3.*w+1.3*noise(q*.32)-time*1.75)));
        float rough=smoothstep(.025,.175,slope);
        float wetGradient=length(vec2(dFdx(depth),dFdy(depth)))/max(.08,length(vec2(length(dFdx(p.xz)),length(dFdy(p.xz)))));
        vec2 warp=vec2(w-.5,w2-.5);
        float broken=texture2D(stone,p.xz*.63+warp*.14).b;
        vec3 n=normalize(vec3(warp.x*(.15+.35*rough),1.,warp.y*(.16+.32*rough)));
        vec3 v=normalize(cameraPosition-p),r=reflect(-v,n);
        vec3 skyColor=texture2D(sky,vec2(.5+atan(r.z,r.x)*.159155,.5+asin(clamp(r.y,-1.,1.))*.31831)).rgb;
        vec3 source=texture2D(bed,vec2(.5*(p.x-2480.)/264.,1.-(p.z+1960.)/280.)+.00026*warp).rgb;
        vec2 worn=fract(p.xz*.29+warp*.055);
        vec3 cobble=texture2D(bed,vec2(.50+.50*worn.x,worn.y)).rgb;
        vec3 bottom=mix(cobble,source,.16)*vec3(.39,.48,.47);
        float transmission=exp(-depth*(.71+.44*(1.-max(v.y,0.))));
        vec3 c=mix(vec3(.024,.057,.064),pow(max(bottom,vec3(.04)),vec3(1.53)),transmission);
        float fresnel=.045+.42*pow(1.-clamp(dot(v,n),0.,1.),3.5);
        c=mix(c,pow(skyColor,vec3(2.2))*.45,fresnel);
        float fine=mix(noise(a*vec2(3.1,8.4)+1.7),noise(b*vec2(3.1,8.4)+1.7),blend);
        vec3 frothA=texture2D(foamFilaments,a*vec2(.15,.39)+warp*.17).rgb;
        vec3 frothB=texture2D(foamFilaments,b*vec2(.15,.39)+warp*.17).rgb;
        vec3 network=mix(frothA,frothB,blend);
        float textureMask=.33*w+.18*w2+.09*fine+.40*network.r;
        float crest=smoothstep(.43,.68,textureMask);
        float wake=(1.-smoothstep(.12,.77,depth))*smoothstep(.0,.13,depth);
        float rapid=rough*(.24+.29*smoothstep(.25,1.4,wetGradient))+.80*pressure+.21*wake;
        float lace=1.-smoothstep(.028,.12,abs(network.g+.26*w2-.63));
        float bubbles=smoothstep(.12,.86,crest*rapid + band*rapid*.23 + lace*.32*pressure);
        bubbles=clamp(bubbles*(.66+.27*network.b+.13*broken),0.,.86);
        c=mix(c,vec3(.61,.67,.72),bubbles*(1.-.61*smoothstep(.29,2.6,dx)));
        c+=vec3(1.,.81,.59)*pow(max(0.,dot(reflect(-sun,n),v)),63.)*.23*(1. /* direct terrain visibility */);
        float opacity=clamp(.29+.53*(1.-transmission)+.28*fresnel+.62*bubbles,.31,.92);
        gl_FragColor=vec4(c,opacity);
        #include <colorspace_fragment>
      }`});
  const water=new T.Mesh(waterGeo,stream);water.name='Yosemite Creek · rock-divided spring current';water.userData.terrainReceiver=true;water.userData.prepareFlightMaterial=true;group.add(water);
  // Short-lived droplets rise only where fast water meets a detected
  // obstruction. All particles use scene time and the local current bearing.
  const drops=[],motion=[];
  for(let n=0;n<survey.wakes.length;n++){
    const [x,z,minor,major,dx,dz]=survey.wakes[n];let k=0;
    for(const side of [-1,1]){
      const xx=x-dx*major*.71+dz*minor*.81*side,zz=z-dz*major*.71-dx*minor*.81*side,level=waterAt(xx,zz);
      if(!Number.isFinite(level))continue;
      for(let j=0;j<5;j++,k++){
        drops.push(xx+dz*(j-2)*.10,level+.016,zz-dx*(j-2)*.10);
        motion.push(dx,dz,((n*.618+j*.382+k*.23)%1+1)%1,.13+.24*((j*11+n*7)%17)/16);
      }
    }
  }
  if(drops.length){
    const mist=new T.BufferGeometry();mist.setAttribute('position',new T.Float32BufferAttribute(drops,3));mist.setAttribute('spray',new T.Float32BufferAttribute(motion,4));
    const paint=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{t:clock},
      vertexShader:`attribute vec4 spray;uniform float t;varying float opacity;
      void main(){float age=fract(t*(1.7+.35*spray.z)+spray.z),pulse=smoothstep(0.,.13,age)*(1.-smoothstep(.64,1.,age));
        vec3 p=position;p.xz+=spray.xy*(.20+.67*spray.z)*age;p.y+=4.*spray.w*age*(1.-age);
        vec4 eye=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*eye;
        gl_PointSize=clamp(60.*(.42+.41*spray.z)/max(.5,-eye.z),.5,4.);
        opacity=.51*pulse*(1.-smoothstep(58.,124.,-eye.z));}`,
      fragmentShader:`varying float opacity;void main(){float r=length(gl_PointCoord-.5);if(r>.5)discard;
        gl_FragColor=vec4(.77,.83,.86,opacity*(1.-smoothstep(.17,.5,r)));}`});
    const flecks=new T.Points(mist,paint);flecks.name='Yosemite Creek · spray at boulder shoulders';flecks.renderOrder=3;group.add(flecks);
  }
  const bridge=makeBridge();
  function makeBridge(){
    const x0=2637.21,z0=-1808.90,ux=.7492,uz=-.6624,nx=.6624,nz=.7492;
    const deck=1225.30,left=-16.3,right=21.2,half=1.78;
    function frame(a,v,y){v-=1.60;return new T.Vector3(x0+ux*a+nx*v,y,z0+uz*a+nz*v);}
    const parts=new Map();
    function beam(kind,a,b,width,height,tint){
      let bank=parts.get(kind);if(!bank){bank={position:[],color:[],uv:[]};parts.set(kind,bank);}
      const forward=b.clone().sub(a),length=forward.length();if(length<.01)return;forward.divideScalar(length);
      const reference=Math.abs(forward.y)>.90?new T.Vector3(ux,0,uz):new T.Vector3(0,1,0);
      const side=new T.Vector3().crossVectors(forward,reference).normalize().multiplyScalar(width/2);
      const rise=new T.Vector3().crossVectors(side,forward).normalize().multiplyScalar(height/2);
      const knots=[];
      for(const end of [a,b])for(const j of [-1,1])for(const k of [-1,1])knots.push(end.clone().addScaledVector(side,j).addScaledVector(rise,k));
      const faces=[[0,1,3,2],[6,7,5,4],[0,4,5,1],[2,3,7,6],[1,5,7,3],[0,2,6,4]];
      for(let i=0;i<faces.length;i++){
        const f=faces[i],long=i<2?width:length,deep=i<2?height:i<4?height:width;
        const uv=[[0,0],[long,0],[long,deep],[0,deep]],tone=new T.Color(tint);
        for(const j of [0,1,2,0,2,3]){bank.position.push(...knots[f[j]].toArray());bank.color.push(tone.r,tone.g,tone.b);bank.uv.push(uv[j][0]*.57,uv[j][1]*.57);}
      }
    }
    function rail(kind,a,b,v,y,width,height,color){beam(kind,frame(a,v,y),frame(b,v,y),width,height,color);}
    const span=right-left,planks=Math.round(span/.22);
    for(let i=0;i<planks;i++){
      const at=left+(i+.5)*span/planks,light=(i*41%17)/190;
      beam('timber',frame(at,-half,deck-.08),frame(at,half,deck-.08),span/planks-.012,.16,new T.Color(.57+light,.53+light,.46+light));
    }
    for(const v of [-half+.20,half-.20]){
      rail('girder',left,right,v,deck-.42,.115,.48,0x41443e);
      for(const y of [deck-.66,deck-.19])rail('girder',left,right,v,y,.25,.057,0x555449);
      for(const h of [.27,.62,1.05])rail('timber',left,right,Math.sign(v)*(half-.04),deck+h,.117,h>1?.124:.100,0xc1b7a2);
      for(let i=0;i<9;i++){
        const a=left+i*span/8,vv=Math.sign(v)*(half-.025);
        beam('timber',frame(a,vv,deck-.10),frame(a,vv,deck+1.16),.158,.173,0xb5a98f);
        beam('timber',frame(a,Math.sign(v)*(half+.48),deck-.48),frame(a,vv,deck+.73),.14,.13,0xac9f88);
      }
    }
    for(let i=0;i<=8;i++){
      const a=left+i*span/8;
      beam('girder',frame(a,-half-.33,deck-.45),frame(a,half+.33,deck-.45),.15,.18,0x55584e);
    }
    for(const [a,along,across] of [[left,2.36,4.6],[3.9,2.13,3.9],[right,2.56,4.9]]){
      const center=frame(a,0,deck),y0=Math.min(elevation(center.x,center.z)-.85,deck-1.),y1=deck-.60;
      // Tapered masonry follows a concrete core, ensuring there is substance
      // behind the joints rather than daylight between the individual stones.
      beam('masonry',frame(a-along*.44,0,(y0+y1)/2),frame(a+along*.44,0,(y0+y1)/2),across-.22,y1-y0,0x928e82);
      const courses=Math.ceil((y1-y0)/.56),dy=(y1-y0)/courses;
      for(let j=0;j<courses;j++){
        const y=y0+(j+.5)*dy,flare=.34*(1-j/courses),vmax=across*.5+flare;
        for(const side of [-1,1]){
          const count=3+(j%2),step=(along+flare*2)/count;
          for(let k=0;k<count;k++){
            const aa=a-along/2-flare+k*step,tint=new T.Color().setHSL(.10,.054,.46+((k*3+j*7)%9)*.023);
            rail('masonry',aa+.012,aa+step-.012,side*(vmax-.11),y,.29,dy-.025,tint);
          }
          const count2=4+(j%2),dv=2*vmax/count2;
          for(let k=0;k<count2;k++)beam('masonry',frame(a+side*(along/2+flare-.12),-vmax+k*dv+.015,y),frame(a+side*(along/2+flare-.12),-vmax+(k+1)*dv-.015,y),.29,dy-.025,0xaaa69a);
        }
      }
    }
    // The historical inventory records surfaced stone ramps at both sides.
    // Ground-only DEMs interpolate beneath the raised east approach; measure
    // its crest from the deck, then descend into the published trail surface.
    const ramps=[];
    function landing(nodes){
      for(let i=1;i<nodes.length;i++){
        const a=nodes[i-1],b=nodes[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
        const fan=Math.ceil(length/.7);
        for(let k=0;k<fan;k++){
          const u=k/fan,v=(k+1)/fan,mid=(u+v)*.5;
          const groundAt=elevation(a[0]+dx*mid,a[1]+dz*mid);
          const y=a[2]+(b[2]-a[2])*mid,halfWidth=a[3]+(b[3]-a[3])*mid;
          const bottom=Math.min(y-.09,groundAt-.16);
          const centre=(y+bottom)*.5;
          beam('masonry',new T.Vector3(a[0]+dx*u,centre,a[1]+dz*u),new T.Vector3(a[0]+dx*v,centre,a[1]+dz*v),halfWidth*2,y-bottom,0xaca799);
          beam('paving',new T.Vector3(a[0]+dx*u,y+.027,a[1]+dz*u),new T.Vector3(a[0]+dx*v,y+.027,a[1]+dz*v),halfWidth*2,.07,0xb8b1a3);
        }
        ramps.push([a,b,dx,dz,length*length]);
      }
    }
    for(const [a,route] of [[left,[[2619.1,-1798.2,1225.19,2.0],[2615.8,-1797.0,1225.14,3.25],[2610.3,-1798.3,1225.02,3.55],[2606.6,-1801.4,null,2.7]]],[right,[[2655.7,-1826.0,1225.16,1.67],[2658.45,-1829.1,1225.02,1.62],[2660.1,-1833.3,null,1.55],[2661.2,-1836.8,null,1.43]]]]){
      const end=frame(a,0,deck);landing([[end.x,end.z,deck,half],...route.map(([x,z,y,w])=>[x,z,y??elevation(x,z)+.08,w])]);
    }
    for(const [kind,p] of parts){
      const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(p.position,3));
      geometry.setAttribute('color',new T.Float32BufferAttribute(p.color,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(p.uv,2));geometry.computeVertexNormals();
      const material=new T.MeshStandardMaterial({vertexColors:true,side:T.DoubleSide,roughness:kind==='girder'?.69:.88,metalness:kind==='girder'?.19:0});
      if(kind!=='girder'){
        const map=texture(kind==='timber'?'rockwood-dock-timber.webp':kind==='paving'?'shore-stone.webp':'building-fieldstone.webp',true);map.colorSpace=T.SRGBColorSpace;
        material.map=map;material.bumpMap=map;material.bumpScale=kind==='timber'?.012:.032;
      }
      const mesh=new T.Mesh(geometry,material);mesh.name='Lower Yosemite Fall footbridge · '+kind;
      mesh.userData.terrainReceiver=true;mesh.userData.prepareFlightMaterial=true;group.add(mesh);
    }
    function at(x,z,altitude){
      for(const [a,b,dx,dz,length] of ramps){
        const t=((x-a[0])*dx+(z-a[1])*dz)/length;
        if(t>=0&&t<=1&&Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)<=a[3]+t*(b[3]-a[3]))return a[2]+t*(b[2]-a[2])+.055;
      }
      const a=(x-x0)*ux+(z-z0)*uz,v=(x-x0)*nx+(z-z0)*nz+1.60;
      if(a<left-.7||a>right+.7||Math.abs(v)>half+.22)return -Infinity;
      // A bird below the two beams can pass through the open span.
      const support=Math.abs(a-left)<1.45||Math.abs(a-right)<1.45||Math.abs(a-3.9)<1.33;
      if(!support&&altitude!==undefined&&altitude<deck-.82)return -Infinity;
      return Math.abs(v)>half-.15?deck+1.15:deck;
    }
    return {at};
  }
  function plant(accept){
    for(const [x,z,height,width] of survey.crowns){
      if(Number.isFinite(waterAt(x,z)))continue;
      accept({x,z,y:elevation(x,z),height,width,seed:((x*.618034+z*.381966)%1+1)%1,observedCreek:true},true);
    }
  }
  return {ownsFlow,contains,waterAt,rockTop,plant,bridgeAt:bridge.at,
    landmark:{name:'Lower Yosemite Fall Footbridge',x:2636.15,z:-1810.10,approach:[2661,-1780,2570,-1890,12,0,-7]}};
};

window.shadeYosemiteCreekBed=function shadeYosemiteCreekBed(material,texture){
  material.uniforms.creekBed={value:texture('yosemite-creek-bank.webp')};
  material.fragmentShader='uniform sampler2D creekBed;\n'+material.fragmentShader.replace('float dep=1.-exp(-d',`
    if(wp.x>2480.&&wp.x<2744.&&wp.z>-1960.&&wp.z< -1680.){
      vec2 creekUV=vec2((wp.x-2480.)/264.,1.-(wp.z+1960.)/280.);
      vec4 bedSurvey=texture2D(creekBed,vec2(.5*creekUV.x,creekUV.y));
      float exposedBed=max(0.,(bedSurvey.a-.00392157)*1.00394);
      if(exposedBed>.003){
        float fineSediment=lum(texture2D(rockScan,wp.xz*.62).rgb);
        float gravel=lum(texture2D(fracture,wp.xz*.35+vec2(.27,.61)).rgb);
        float recorded=lum(bedSurvey.rgb);
        vec2 nearBed=fract(wp.xz*.27+.021*vec2(sin(wp.z*.21),cos(wp.x*.17)));
        vec3 gravelScan=texture2D(creekBed,vec2(.50+.50*nearBed.x,nearBed.y)).rgb;
        float spread=clamp(.45+.67*(recorded-.31)+.31*(fineSediment-.48)+.16*(gravel-.48),.19,.74);
        vec3 mineral=vec3(1.,.984,.961)*spread*(.39+1.42*gravelScan);
        c=mix(c,pow(mineral,vec3(2.12))*(ambient+direct),exposedBed*.985);
      }
    }
    float dep=1.-exp(-d`);
};
