// Each impression belongs to a real step from one of this world's residents.
// Only nearby ground patches enter the draw. Flight time also ages the trail
// while its tile is outside the visible region.
window.makeWildlifeTracks = function makeWildlifeTracks(T, scene, world) {
  const tileWidth = 36, maxDraw = 256, tiles = new Map();
  const geometry = new T.PlaneGeometry(1, 1);
  const mark = new T.InstancedBufferAttribute(new Float32Array(maxDraw * 4), 4);
  mark.setUsage(T.DynamicDrawUsage);
  geometry.setAttribute('trace', mark);
  const material = new T.ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true,
    polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: `
      attribute vec4 trace;
      varying vec4 detail;
      varying vec2 st;
      void main() {
        st = uv * 2. - 1.;
        detail = trace;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.);
      }`,
    fragmentShader: `
      varying vec4 detail;
      varying vec2 st;
      float oval(vec2 p, vec2 axes) { return length(p / axes) - 1.; }
      void main(){
        vec2 p=st;
        float kind=detail.x, substrate=detail.y;
        float d;
        if(kind<.5){
          // Paired toes, narrowing toward the direction of travel.
          p.x=abs(p.x);
          d=oval(vec2(p.x-.27+.09*p.y,p.y),vec2(.225-.045*p.y,.78));
        } else if(kind<1.5){
          // Small forefeet fall behind the longer hind prints in a hare bound.
          d=min(oval(vec2(abs(p.x)-.47,p.y-.18),vec2(.21,.58)),
                oval(vec2(abs(p.x+.10)-.15,p.y+.60),vec2(.12,.26)));
        } else {
          d=oval(p-vec2(0.,-.21),vec2(.52,.43));
          for(int i=0;i<5;i++){
            float a=(float(i)-2.)*.45;
            d=min(d,oval(p-vec2(sin(a)*.74,cos(a)*.55+.08),vec2(.15,.22)));
          }
        }
        float footprint=1.-smoothstep(-.06,.12,d);
        float grit=fract(sin(dot(floor((st+1.)*24.),vec2(12.9898,45.23))+detail.w)*43758.54);
        float rim=(1.-smoothstep(.04,.29,abs(d-.11)))*.25*(1.-footprint);
        vec3 soil=mix(vec3(.135,.091,.057),vec3(.36,.23,.135),step(.5,substrate));
        if(substrate>1.5) soil=substrate<2.5?vec3(.31,.37,.40):vec3(.093,.115,.103);
        vec3 color=mix(soil,substrate>2.5?vec3(.31,.32,.28):soil*1.65,rim*2.);
        float opacity=detail.z*(footprint*(.72+.16*grit)+rim*grit);
        if(opacity<.013)discard;
        gl_FragColor=vec4(color,opacity);
      }`
  });
  const mesh = new T.InstancedMesh(geometry, material, maxDraw);
  mesh.name = 'Resident wildlife tracks'; mesh.count=0; mesh.visible=false;
  mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); mesh.frustumCulled=false;
  scene.add(mesh);
  const surface=world.habitat.surface, matrix=new T.Matrix4(), right=new T.Vector3(),
    forward=new T.Vector3(), normal=new T.Vector3(), scratchWeather={};
  let nextRefresh=-1, nextPrune=-1, lastX=Infinity, lastZ=Infinity, serial=0;
  function key(x,z){return Math.floor(x/tileWidth)+','+Math.floor(z/tileWidth);}
  function step(a,t) {
    if(['beaver','muskrat','raccoon'].includes(a.family))return;
    if(a.trackX===undefined) {a.trackX=a.x;a.trackZ=a.z;return;}
    const hare=a.family==='hare', paw=['bear','otter','canid'].includes(a.family);
    const stride=Math.max(.24,a.height*(hare?1.65:.65));
    if(Math.hypot(a.x-a.trackX,a.z-a.trackZ)<stride)return;
    a.trackX=a.x;a.trackZ=a.z;a.trackSide=-(a.trackSide||1);
    const fx=Math.cos(a.heading),fz=Math.sin(a.heading),lateral=a.trackSide*a.height*.12;
    const x=a.x-fz*lateral,z=a.z+fx*lateral;
    const wetBank=Number.isFinite(world.waterLevel)&&Math.abs(a.feetY-world.waterLevel)<2.2;
    const snow=world.region==='swiss'&&a.feetY+(world.altitudeOffset||0)>2350;
    const desert=world.region==='canyon'||world.region==='crater';
    const type=snow?2:a.family==='otter'?3:desert&&!wetBank?1:0;
    const weather=world.windField?.weatherAt?.(x,a.feetY,z,t,scratchWeather);
    const lifetime=(type===3?100:snow?1400:desert?700:520)/(1+2*(weather?.rain||0));
    const length=hare?a.height*1.12:paw?a.height*.32:a.height*.17;
    const id=key(x,z); let tile=tiles.get(id);
    if(!tile){tile=[];tiles.set(id,tile);}
    if(tile.length>=96)tile.shift();
    const dx=(surface(x+.22,z)-surface(x-.22,z))/.44;
    const dz=(surface(x,z+.22)-surface(x,z-.22))/.44;
    // A wet paw can print on its actual haul-out above the shoreline mesh.
    const y=Math.max(surface(x,z),a.feetY-Math.hypot(dx,dz)*Math.abs(lateral))+.018;
    const print={author:a.residentId,x,y,z,fx,fz,dx,dz,length,width:length*(hare?.88:paw?.93:.71),
      kind:hare?1:paw?2:0,type,born:t,until:t+lifetime,serial:++serial};
    tile.push(print);
    nextRefresh=-1;
  }
  function update(eye,t) {
    if(t>=nextPrune){
      for(const [k,rows] of tiles){
        // A wet overprint may expire earlier than an older dry print.
        let i=0;for(const m of rows)if(m.until>t)rows[i++]=m;
        rows.length=i;if(!i)tiles.delete(k);
      }
      nextPrune=t+16;
    }
    if(t<nextRefresh&&Math.hypot(eye.x-lastX,eye.z-lastZ)<3)return;
    lastX=eye.x;lastZ=eye.z;nextRefresh=t+.20;
    const cx=Math.floor(eye.x/tileWidth),cz=Math.floor(eye.z/tileWidth);
    let n=0;
    for(let ring=0;ring<=2;ring++)for(let j=-ring;j<=ring;j++)for(let k=-ring;k<=ring;k++){
      if(Math.max(Math.abs(j),Math.abs(k))!==ring)continue;
      const tile=tiles.get((cx+j)+','+(cz+k));if(!tile)continue;
      for(let i=tile.length-1;i>=0&&n<maxDraw;i--){
        const m=tile[i],d=Math.hypot(eye.x-m.x,eye.y-m.y,eye.z-m.z);
        if(d>68||t>=m.until)continue;
        normal.set(-m.dx,1,-m.dz).normalize();
        forward.set(m.fx,m.fx*m.dx+m.fz*m.dz,m.fz).normalize();
        right.crossVectors(forward,normal).normalize();
        matrix.makeBasis(right.multiplyScalar(m.width),forward.multiplyScalar(m.length),normal);
        matrix.setPosition(m.x,m.y,m.z);mesh.setMatrixAt(n,matrix);
        const age=Math.min(1,(m.until-t)/((m.until-m.born)*.6));
        const distanceFade=Math.min(1,(68-d)/14);
        mark.setXYZW(n++,m.kind,m.type,age*distanceFade,m.serial%997);
      }
    }
    mesh.count=n;mesh.visible=n>0;
    if(n){mesh.instanceMatrix.needsUpdate=true;mark.needsUpdate=true;}
  }
  function reset(){tiles.clear();serial=0;nextRefresh=nextPrune=-1;mesh.count=0;mesh.visible=false;}
  return {step,update,reset,tiles};
};
