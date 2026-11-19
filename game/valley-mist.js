// Shallow, geographically anchored volumes are integrated in view-aligned slabs.
// Opaque terrain, trees and the eagle test each slab against the scene depth.
window.addValleyMist = function addValleyMist(THREE, scene, world) {
  const banks = {
    alaska: [
      [-220,-910,13, 265,22,150,-.35,.0026,'water'],
      [650,-2850,57, 290,62,780,.19,.0018,'ground'],
      [-2460,-3750,102, 440,81,230,-.60,.0016,'ground'],
      [515,655,11, 66,17,42,-.45,.0070,'foot']
    ],
    milford: [
      [1210,1920,34, 790,42,270,-.66,.00175,'water'],
      [1750,170,81, 480,104,220,.21,.0019,'water'],
      [-2046,-1907,22, 130,53,92,-.18,.0044,'foot'],
      [3259,5032,27, 145,52,90,-.58,.0042,'foot'],
      [-1090,4070,205, 385,108,285,.22,.0017,'ground']
    ],
    lofoten: [
      [560,1190,22, 490,31,180,-.58,.0021,'water'],
      [-1270,-455,65, 600,65,240,.58,.0018,'water'],
      [-1280,-1780,108, 400,95,240,-.63,.0016,'water']
    ],
    yosemite: [
      [-1060,1090,27, 610,39,210,-.26,.00155,'ground'],
      [-1910,1757,26, 117,58,86,-.24,.0041,'foot'],
      [2584,-2515,42, 182,85,110,-.40,.0030,'foot']
    ],
    napali: [
      [-1930,155,19, 420,34,125,-.56,.0016,'water'],
      [185,1580,140, 255,82,500,-.41,.0018,'ground'],
      [-1120,1500,195, 245,94,227,.41,.0016,'ground']
    ]
  }[world.region];
  if (!banks) return () => {};

  // Two channels hold neighboring Z slices of a periodic 3-D noise lattice.
  // Hardware interpolates X and Y, leaving one read per octave in the shader.
  const size=128, randomBytes=new Uint8Array(size*size);
  const rgba=new Uint8Array(size*size*4);
  let seed=40733;
  for(let i=0;i<randomBytes.length;i++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    randomBytes[i]=seed>>>24;
  }
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=y*size+x;
    rgba[4*i]=randomBytes[i];
    rgba[4*i+1]=randomBytes[((y+17)%size)*size+(x+37)%size];
    rgba[4*i+3]=255;
  }
  const noise=new THREE.DataTexture(rgba,size,size);
  noise.wrapS=noise.wrapT=THREE.RepeatWrapping;
  noise.magFilter=noise.minFilter=THREE.LinearFilter;
  noise.generateMipmaps=false;
  noise.needsUpdate=true;

  const slices=20, vertices=[];
  for(let i=0;i<slices;i++){
    // Submit the far slab first for physically ordered source-over blending.
    const z=1-2*(i+.5)/slices;
    vertices.push(-1,-1,z,1,-1,z,-1,1,z,-1,1,z,1,-1,z,1,1,z);
  }
  const position=new THREE.Float32BufferAttribute(vertices,3);
  const clock={value:0}, sun=world.sunDirection;
  const vertexShader=`
    uniform vec3 radii;
    uniform vec2 orientation;
    varying vec3 fieldPosition;
    varying vec3 worldPoint;
    varying float interval;
    vec3 toField(vec3 v){
      return vec3(v.x*orientation.x+v.z*orientation.y,v.y,-v.x*orientation.y+v.z*orientation.x);
    }
    void main(){
      vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]);
      vec3 up=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
      vec3 ahead=-vec3(viewMatrix[0][2],viewMatrix[1][2],viewMatrix[2][2]);
      float depth=length(toField(ahead)*radii);
      vec3 offset=position.x*right*length(toField(right)*radii)
                 +position.y*up*length(toField(up)*radii)+position.z*ahead*depth;
      worldPoint=modelMatrix[3].xyz+offset;
      fieldPosition=toField(offset)/radii;
      interval=depth*${(2/slices).toFixed(4)};
      gl_Position=projectionMatrix*viewMatrix*vec4(worldPoint,1.);
    }`;
  const fragmentShader=`
    uniform sampler2D lattice;
    uniform vec3 sun;
    uniform float clock,section,frequency,extinction,direct;
    varying vec3 fieldPosition;
    varying vec3 worldPoint;
    varying float interval;
    float densityNoise(vec3 p){
      vec3 cell=floor(p),f=fract(p);
      f=f*f*(3.-2.*f);
      vec2 uv=(cell.xy+cell.z*vec2(37.,17.)+f.xy+.5)/128.;
      vec2 pair=texture2D(lattice,uv).rg;
      return mix(pair.x,pair.y,f.z);
    }
    void main(){
      vec3 q=fieldPosition;
      q.y+=.19*sin(q.x*3.3+q.z*2.7+section)+.10*sin(q.x*4.9-q.z*5.7);
      float edge=1.-dot(q,q);
      if(edge<=0.)discard;
      vec3 eyeRay=worldPoint-cameraPosition;
      float range=length(eyeRay);
      vec3 ray=eyeRay/max(range,.01);
      vec3 p=(worldPoint-vec3(clock*1.52,clock*.11,-clock*.66))*frequency+section;
      p.y*=1.7;
      float billow=densityNoise(p);
      float curl=densityNoise(p*2.37+vec3(.6,3.8,5.4)+billow*.7);
      float wisp=densityNoise(p*5.8+vec3(4.9,1.7,0.)+curl*.45);
      float folds=smoothstep(.27,.75,.57*billow+.30*curl+.13*wisp);
      float volume=smoothstep(0.,.67,edge)*folds;
      vec3 ahead=-vec3(viewMatrix[0][2],viewMatrix[1][2],viewMatrix[2][2]);
      float pathLength=interval/max(.48,dot(ray,ahead));
      float opacity=1.-exp(-extinction*pathLength*volume*smoothstep(3.,35.,range));
      if(opacity<.0005)discard;
      float forward=pow(max(0.,dot(ray,sun)),4.);
      float rim=clamp(.48+.28*q.y+.28*(1.-folds),0.,1.);
      vec3 cool=vec3(.415,.51,.58);
      vec3 warm=vec3(.90,.77,.64);
      vec3 light=mix(cool,warm,direct*(.23+.57*forward+.17*rim));
      gl_FragColor=vec4(light*(.76+.27*rim),opacity);
      #include <colorspace_fragment>
    }`;

  const volumes=[];
  banks.forEach(([cx,cz,rise,rx,ry,rz,yaw,extinction,base],index)=>{
    let x=cx,z=cz;
    if(base==='foot'){
      // Locate the receiving pool below the mapped lip within the survey.
      let lowest=Infinity;
      const radius=world.region==='alaska'?32:175;
      for(let j=-2;j<=2;j++)for(let i=-2;i<=2;i++){
        const dx=i*radius*.49,dz=j*radius*.49;
        const score=world.height(cx+dx,cz+dz)+.045*Math.hypot(dx,dz);
        if(score<lowest){x=cx+dx;z=cz+dz;lowest=score;}
      }
    }
    const y=(base==='water'?(world.waterLevel??0):world.height(x,z))+rise;
    let direct=1;
    for(const distance of [70,160,330,650,1200,2200,4200,7600]){
      const clearance=y+sun.y*distance-world.elevation(x+sun.x*distance,z+sun.z*distance);
      direct=Math.min(direct,THREE.MathUtils.smoothstep(clearance,-15,38));
    }
    const radius=Math.max(rx,ry,rz);
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',position);
    geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(),radius*1.18);
    const mat=new THREE.ShaderMaterial({
      uniforms:{radii:{value:new THREE.Vector3(rx,ry,rz)},
        orientation:{value:new THREE.Vector2(Math.cos(yaw),Math.sin(yaw))},
        section:{value:2.7+5.31*index}, frequency:{value:2.6/radius},
        direct:{value:direct}, extinction:{value:extinction}, clock, lattice:{value:noise},sun:{value:sun}},
      vertexShader,fragmentShader,depthTest:true,depthWrite:false,transparent:true,side:THREE.FrontSide
    });
    const mesh=new THREE.Mesh(geometry,mat);
    mesh.position.set(x,y,z);
    mesh.name='Valley mist '+(index+1);
    scene.add(mesh);volumes.push(mesh);
  });
  return (player,elapsed)=>{
    clock.value=elapsed;
    for(const mesh of volumes)mesh.visible=mesh.position.distanceToSquared(player)<9500*9500;
  };
};
