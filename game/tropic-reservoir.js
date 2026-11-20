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
    const pts=ring.map(([x,z])=>new T.Vector2(x,z)),geom=new T.BufferGeometry();
    geom.setAttribute('position',new T.Float32BufferAttribute(ring.flatMap(([x,z])=>[x,level,z]),3));
    geom.setIndex(T.ShapeUtils.triangulateShape(pts,[]).flat());
    const t={value:0};
    const material=new T.ShaderMaterial({side:T.DoubleSide,uniforms:{t,sky:{value:w.skyTexture}},vertexShader:
      'varying vec3 wp;void main(){wp=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`varying vec3 wp; uniform float t;uniform sampler2D sky;
      void main(){vec2 p=wp.xz;vec3 v=normalize(cameraPosition-wp);
      vec3 n=normalize(vec3(.043*cos(p.x*.65+p.y*.28+t*1.6)+.016*sin(p.y*2.2-t),1.,.054*sin(p.y*.57-p.x*.43-t)));
      vec3 r=reflect(-v,n);vec3 reflection=texture2D(sky,vec2(.5+atan(r.z,r.x)/6.2832,.5+asin(clamp(r.y,-1.,1.))/3.1416)).rgb;
      gl_FragColor=vec4(mix(vec3(.14,.29,.26),reflection,.23+.64*pow(1.-max(dot(v,n),0.),3.)),1.);}`});
    const lake=new T.Mesh(geom,material);lake.name='Tropic Reservoir';scene.add(lake);
    const channel=w.channelWater,clear=w.clearance;
    w.channelWater=(x,z)=>distance(x,z)>0?level:(channel?.(x,z)??-Infinity);
    w.clearance=(x,z)=>Math.max(clear(x,z),w.channelWater(x,z));
    return t;
  }
  window.tropicReservoir={ground,build,level,distance};
})();
