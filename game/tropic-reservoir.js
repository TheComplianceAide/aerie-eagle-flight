// USGS National Hydrography Dataset shoreline, local metres.
(()=>{
  const ring=[[-8818,922],[-8757,946],[-8712,974],[-8748,1050],[-8739,1098],[-8686,1150],[-8669,1206],[-8747,1195],[-8778,1200],[-8809,1275],[-8818,1367],[-8889,1606],[-8911,1715],[-8962,1910],[-8964,1999],[-8902,2292],[-8917,2439],[-8962,2563],[-8953,2642],[-8962,2725],[-8999,2819],[-9004,2872],[-9028,2940],[-9116,3036],[-9129,3063],[-9122,3102],[-9125,3152],[-9228,3214],[-9247,3275],[-9257,3277],[-9264,3272],[-9277,3247],[-9274,3219],[-9276,3183],[-9316,3165],[-9341,3144],[-9402,3110],[-9345,3073],[-9330,3043],[-9324,2982],[-9294,2903],[-9266,2703],[-9242,2444],[-9271,2347],[-9273,2302],[-9282,2251],[-9288,1974],[-9280,1888],[-9262,1867],[-9259,1835],[-9272,1735],[-9247,1591],[-9208,1535],[-9198,1495],[-9114,1351],[-9101,1334],[-9049,1220],[-9048,1182],[-9162,1130],[-9159,1125],[-9065,1116],[-8988,1087],[-8955,1059],[-8938,930],[-8897,900],[-8859,908]];
  const level=2387.7;
  function distance(x,z){
    if(x<-9510||x>-8550||z<780||z>3390)return -Infinity;
    let inside=false,squared=Infinity;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const [ax,az]=ring[j],[bx,bz]=ring[i],dx=bx-ax,dz=bz-az;
      const f=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));
      squared=Math.min(squared,(x-ax-f*dx)**2+(z-az-f*dz)**2);
      if((az>z)!==(bz>z)&&x<ax+(z-az)*dx/dz)inside=!inside;
    }
    return (inside?1:-1)*Math.sqrt(squared);
  }
  function ground(x,z,original){
    const d=distance(x,z);
    if(d< -100)return original;
    const f=Math.max(0,Math.min(1,(d+100)/95));
    return original+(level-Math.min(9,Math.max(-5,d*.18))-.28-original)*f*f*(3-2*f);
  }
  function build(T,scene,w){
    // Keep the mapped USGS bank continuous across the water mesh. One field
    // records signed metres and the shore normal, including the narrow inlet.
    const cell=3,range=48,minX=-9411,minZ=891;
    const width=Math.ceil((-8658-minX)/cell),height=Math.ceil((3288-minZ)/cell);
    const pixels=new Uint8Array(width*height*4),nearest=new Float32Array(width*height).fill(range*range);
    for(let row=0;row<height;row++){
      const z=minZ+(row+.5)*cell,crossings=[];
      for(let i=0,j=ring.length-1;i<ring.length;j=i++){
        const [ax,az]=ring[j],[bx,bz]=ring[i];
        if((az>z)!==(bz>z))crossings.push(ax+(z-az)*(bx-ax)/(bz-az));
      }
      crossings.sort((a,b)=>a-b);
      for(let col=0,k=0;col<width;col++){
        const x=minX+(col+.5)*cell;while(k<crossings.length&&x>crossings[k])k++;
        const o=(row*width+col)*4;pixels[o]=k%2?255:0;pixels[o+1]=pixels[o+2]=128;pixels[o+3]=255;
      }
    }
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const [ax,az]=ring[j],[bx,bz]=ring[i],dx=bx-ax,dz=bz-az,ds=dx*dx+dz*dz;
      const firstX=Math.max(0,Math.floor((Math.min(ax,bx)-range-minX)/cell)),lastX=Math.min(width-1,Math.ceil((Math.max(ax,bx)+range-minX)/cell));
      const firstZ=Math.max(0,Math.floor((Math.min(az,bz)-range-minZ)/cell)),lastZ=Math.min(height-1,Math.ceil((Math.max(az,bz)+range-minZ)/cell));
      for(let row=firstZ;row<=lastZ;row++)for(let col=firstX;col<=lastX;col++){
        const x=minX+(col+.5)*cell-ax,z=minZ+(row+.5)*cell-az;
        const along=Math.max(0,Math.min(1,(x*dx+z*dz)/ds)),rx=x-dx*along,rz=z-dz*along;
        const slot=row*width+col,squared=rx*rx+rz*rz;if(squared>=nearest[slot])continue;
        nearest[slot]=squared;
        const o=slot*4,sign=pixels[o]>=128?1:-1,d=Math.sqrt(squared);
        pixels[o]=Math.round(127.5+127.5*sign*d/range);
        pixels[o+1]=Math.round(127.5+127.5*sign*rx/Math.max(.0001,d));
        pixels[o+2]=Math.round(127.5+127.5*sign*rz/Math.max(.0001,d));
      }
    }
    const shore=new T.DataTexture(pixels,width,height);shore.minFilter=shore.magFilter=T.LinearFilter;shore.needsUpdate=true;
    const geom=new T.PlaneGeometry(width*cell,height*cell);
    geom.rotateX(-Math.PI/2);geom.translate(minX+width*cell/2,level,minZ+height*cell/2);
    const loader=new T.TextureLoader(),stones=loader.load('shore-pebbles.webp'),sand=loader.load('shore-sand.webp'),ripples=loader.load('waternormals.jpg');
    for(const tex of [stones,sand,ripples]){tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.anisotropy=8;}
    const t={value:0};
    const material=new T.ShaderMaterial({side:T.FrontSide,transparent:true,uniforms:{t,sky:{value:w.skyTexture},shore:{value:shore},stones:{value:stones},sand:{value:sand},ripples:{value:ripples},sun:{value:w.sunDirection},
      sceneReflection:{value:null},reflectProjection:{value:new T.Matrix4()},reflectionWeight:{value:0},
      mapExtent:{value:new T.Vector4(minX,minZ,width*cell,height*cell)}},vertexShader:
      'uniform mat4 reflectProjection;varying vec3 wp;varying vec4 mirrorUv;void main(){wp=position;mirrorUv=reflectProjection*vec4(position,1.);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`varying vec3 wp;varying vec4 mirrorUv;uniform float t,reflectionWeight;uniform vec4 mapExtent;uniform vec3 sun;uniform sampler2D sky,shore,stones,sand,ripples,sceneReflection;
      float shelfNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        vec4 h=fract(sin(dot(i,vec2(61.7,37.3))+vec4(0.,61.7,37.3,99.))*6293.77);
        return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);}
      void main(){vec2 p=wp.xz;vec3 v=normalize(cameraPosition-wp);
      vec3 local=texture2D(shore,(p-mapExtent.xy)/mapExtent.zw).rgb;float bank=(local.r-.5)*96.;
      if(bank< -2.1)discard;
      vec2 inward=local.gb*2.-1.;inward/=max(.12,length(inward));
      vec2 tangent=vec2(-inward.y,inward.x);
      float px=max(length(dFdx(p)),length(dFdy(p))),nearWave=1.-smoothstep(.23,1.1,px);
      float shelf=shelfNoise(p*.078),grain=shelfNoise(p*.32+13.);
      bank+=(shelfNoise(p*.127)-.5)*.80+(grain-.5)*.31;
      float phase=bank*1.41+t*2.12+4.3*shelf+.43*sin(dot(p,vec2(.29,-.16))-t*.43);
      float packets=.36+.64*shelfNoise(p*.035+vec2(t*.039,-t*.021));
      float crest=sin(phase),runup=(.44*sin(t*1.62+shelf*5.)+.18*sin(t*2.43+grain*3.))*packets;
      float lakeside=1.-smoothstep(1.,13.,bank),depth=clamp(.28+bank*.18,.025,9.);
      vec2 wind=vec2(.75,-.66),cross=vec2(-wind.y,wind.x);
      vec2 perturb=vec2(shelf,grain)*.34;
      vec2 facets=texture2D(ripples,p*.069-wind*t*.047+perturb).rg*2.-1.;
      facets+=.52*(texture2D(ripples,p*.197+cross*t*.041-perturb*.47).rg*2.-1.);
      float chop=sin(dot(p,wind)*.84+t*1.25+shelf*4.31+grain*1.42);
      vec2 slope=(wind*chop*.016+.10*facets)*(.48+.52*packets)*(1.-smoothstep(.72,3.,px));
      slope+=(inward*crest*.067+tangent*.014*sin(phase*1.6+grain))*lakeside*packets*nearWave;
      slope+=cross*.022*sin(dot(p,wind)*5.12+dot(p,cross)*.7-t*3.5)*nearWave;
      vec3 n=normalize(vec3(-slope.x,1.,-slope.y));
      vec3 r=reflect(-v,n);vec3 reflection=texture2D(sky,vec2(.5+atan(r.z,r.x)/6.2832,.5+asin(clamp(r.y,-1.,1.))/3.1416)).rgb;
      vec2 reflectedUv=mirrorUv.xy/max(.01,mirrorUv.w)+n.xz*(.013+.012*(1.-v.y));
      float border=min(min(reflectedUv.x,1.-reflectedUv.x),min(reflectedUv.y,1.-reflectedUv.y));
      reflection=mix(reflection,texture2D(sceneReflection,clamp(reflectedUv,.002,.998)).rgb,
        reflectionWeight*smoothstep(0.,.035,border)*step(.01,mirrorUv.w));
      vec3 ray=refract(-v,n,.7502);vec2 bottom=p+ray.xz*depth/max(.24,-ray.y);
      float alluvium=smoothstep(.23,.77,shelfNoise(bottom*.10)+.16*grain);
      vec3 bed=mix(pow(texture2D(stones,bottom*.61).rgb,vec3(2.2))*vec3(.97,.93,.79),
                   pow(texture2D(sand,mat2(.8,-.6,.6,.8)*bottom*.43).rgb,vec3(2.2))*vec3(1.23,.90,.65),alluvium);
      float focusing=exp(-7.*abs(sin(phase*.71)+.67*sin(dot(bottom,vec2(1.3,.91))-t*1.24)))*nearWave;
      bed*=.82+.45*focusing*exp(-depth*.74);
      vec3 body=mix(vec3(.035,.116,.091),bed,exp(-depth*1.08/max(.48,-ray.y)));
      float fres=.022+.978*pow(1.-max(dot(v,n),0.),5.);
      vec3 radiance=mix(body,reflection,fres)+vec3(.71,.52,.31)*pow(max(0.,dot(n,normalize(v+sun))),125.);
      float lace=(1.-smoothstep(.025,.15,abs(grain-.54)))*smoothstep(.31,.73,shelf);
      float fizz=exp(-abs(bank-runup-.19)*2.8)*lace*packets*nearWave;
      radiance=mix(radiance,vec3(.66,.68,.59),fizz*.61);
      float liquid=smoothstep(runup-.09,runup+.11,bank);
      if(bank<runup+.11){vec3 damp=mix(pow(texture2D(stones,p*.61).rgb,vec3(2.2)),pow(texture2D(sand,p*.43).rgb,vec3(2.2)),alluvium);
        radiance=mix(damp*vec3(.57,.58,.51)+reflection*.027,radiance,liquid);}
      float clarity=.986-.045*(1.-exp(-depth*.27));
      float cover=smoothstep(runup-.92-.54*shelf,runup-.14,bank);
      if(cover<.004)discard;
      gl_FragColor=vec4(mix(vec3(.14,.29,.26),radiance,clarity),cover);
      #include <colorspace_fragment>
      }`});
    const lake=new T.Mesh(geom,material);lake.name='Tropic Reservoir';lake.renderOrder=-1;scene.add(lake);
    w.reflectLocalWater?.(lake,(eye,centre,normal)=>{
      const x=Math.max(minX-eye.x,0,eye.x-minX-width*cell),z=Math.max(minZ-eye.z,0,eye.z-minZ-height*cell);
      centre.set(eye.x,level,eye.z);normal.set(0,1,0);
      return Math.max(0,Math.min(1,(1550-Math.hypot(x,z,eye.y-level))/320));
    });
    const channel=w.channelWater,clear=w.clearance;
    w.channelWater=(x,z)=>distance(x,z)>0?level:(channel?.(x,z)??-Infinity);
    w.clearance=(x,z)=>Math.max(clear(x,z),w.channelWater(x,z));
    return t;
  }
  window.tropicReservoir={ground,build,level,distance};
})();
