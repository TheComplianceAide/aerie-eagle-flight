// Anatomical shell and feather rig for a 2.2 m bald eagle, facing -Z.
// Each shell vertex retains its photographic coordinates as the skeleton moves it.
window.makeEagle = function makeEagle(THREE) {
  const object = new THREE.Group();
  object.name = 'Bald eagle';
  const rig = new THREE.Group();
  object.add(rig);
  const bones = [];
  const reference = new Map();
  const span = 2.2;
  const length = span * 763 / 2003;
  const center = .44;
  const zAt = v => (v - center) * length;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function smooth(a, b, v) {
    const t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }
  function sample(points, v) {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      if (v <= b[0]) return a[1] + (b[1] - a[1]) * smooth(a[0], b[0], v);
    }
    return points[points.length - 1][1];
  }
  function bone(name, parent, x, y, z) {
    const b = new THREE.Bone();
    b.name = name;
    const at = new THREE.Vector3(x, y, z);
    b.position.copy(at);
    if (parent) b.position.sub(reference.get(parent));
    reference.set(b, at);
    b.userData.index = bones.length;
    bones.push(b);
    (parent || rig).add(b);
    return b;
  }
  const chest = bone('Thorax', null, 0, 0, 0);
  const neckBase=bone('Cervical base',chest,0,.012,zAt(.325));
  const neck=bone('Neck',neckBase,0,.019,zAt(.226));
  const rudder = bone('Tail base', chest, 0, -.004, zAt(.66));
  const tailRays=Array.from({length:12},(_,i)=>{
    const side=(2*i-11)/11;
    return {side,ray:bone('Rectrix '+(i+1),rudder,side*.018,-.003,zAt(.69))};
  });
  const wings = [-1, 1].map(sign => {
    const shoulder = bone('Shoulder ' + sign, chest, sign * .093, .015, zAt(.33));
    const elbow = bone('Elbow ' + sign, shoulder, sign * .316, .031, zAt(.403));
    const wrist = bone('Carpus ' + sign, elbow, sign * .625, .022, zAt(.278));
    const fan = Array.from({length: 6}, (_, i) =>
      bone('Primary fan ' + sign + '/' + i, wrist, sign * .714, .014, zAt(.29 + i * .033)));
    const alula=bone('Alula '+sign,wrist,sign*.634,.032,zAt(.214));
    return {sign, shoulder, elbow, wrist, fan, alula, wristLoad:0, tipLoad:0};
  });
  // Body radii and wing sections are expressed in physical metres. The head,
  // breast, mantle and tail overlap in plan but have different volumes.
  const radiusProfile = [[0,.003],[.034,.016],[.07,.034],[.13,.058],[.20,.077],
    [.265,.088],[.33,.123],[.44,.151],[.57,.145],[.66,.117],[.73,.064],[.775,0],[1,0]];
  const depthProfile = [[0,.001],[.045,.020],[.10,.044],[.155,.059],[.205,.064],[.26,.061],
    [.35,.087],[.47,.105],[.57,.097],[.67,.065],[.75,.018],[.79,0],[1,0]];
  const frontProfile = [[0,.25],[.15,.265],[.26,.25],[.42,.219],[.59,.208],[.78,.19],[.95,.13],[1.12,.19]];
  const rearProfile = [[0,.67],[.16,.693],[.33,.696],[.52,.674],[.74,.609],[.89,.563],[1.1,.405]];
  const skullProfile=[
    [.049,.014,.029,.014,.014],[.073,.025,.028,.024,.023],[.097,.039,.028,.044,.037],
    [.130,.056,.028,.057,.050],[.174,.067,.028,.060,.055],[.209,.074,.023,.060,.057],
    [.244,.079,.017,.058,.056],[.273,.088,.012,.059,.055],[.304,.089,.008,.055,.051]
  ];
  const skullProfiles=[1,2,3,4].map(k=>skullProfile.map(p=>[p[0],p[k]]));
  function anatomy(u, v, edgeFade) {
    const x = (u - .5) * span, ax = Math.abs(x);
    const radius = sample(radiusProfile, v);
    const round = radius > 0 ? Math.pow(Math.max(0, 1 - (ax / radius) ** 2), .65) : 0;
    const trunk = round * sample(depthProfile, v);
    const front = sample(frontProfile, ax), rear = sample(rearProfile, ax);
    const chord = clamp((v - front) / (rear - front), 0, 1);
    const arm = 1 - smooth(.49, 1.06, ax);
    const airfoil = Math.pow(Math.sin(Math.PI * Math.pow(chord, .72)), .70);
    const wing = smooth(.03, .15, ax) * (1 - smooth(.69, .755, v));
    const rootRise = .019 * Math.sin(clamp(ax / 1.1, 0, 1) * Math.PI);
    const tipFlex = .015 * smooth(.74, 1.08, ax);
    const tailCamber = -.021 * smooth(.61, .99, v) + .022 * Math.abs(x) * smooth(.67, .83, v);
    const sweep = wing * (rootRise + tipFlex - .017 * chord * chord) + tailCamber;
    const cranialRise = .026 * (1 - smooth(.20, .34, v)) * (.38 + .62 * round) * (1 - smooth(.080,.103,ax));
    const hook = -.019 * (1 - smooth(.0, .037, v));
    const seamInset=.017*(1-smooth(.25,.32,v))*(1-smooth(.070,.106,ax));
    const top = sweep - seamInset + cranialRise + hook + trunk + wing * airfoil * (.012 + arm * .032) * edgeFade;
    const bottom = sweep + cranialRise + hook - trunk * 1.15 - wing * airfoil * (.003 + arm * .021) * edgeFade;
    return {x, z:zAt(v), top, bottom};
  }
  function influences(x, v) {
    const ax = Math.abs(x), wing = wings[x < 0 ? 0 : 1];
    const result = new Map();
    function add(bone, amount) {
      if (amount > 0) result.set(bone.userData.index, (result.get(bone.userData.index) || 0) + amount);
    }
    const tailWidth=.17+.14*smooth(.66,.785,v);
    const tail=smooth(.62,.76,v)*(1-smooth(tailWidth,tailWidth+.068,ax));
    const head=(1-smooth(.192,.272,v))*(1-smooth(.085,.116,ax));
    const collar=(1-head)*(1-smooth(.262,.369,v))*(1-smooth(.077,.121,ax));
    const wingPortion = smooth(.060, .196, ax) * (1 - smooth(.681, .733, v)) * (1-head-collar) * (1 - tail);
    const intoElbow = smooth(.222, .418, ax);
    const intoWrist = smooth(.494, .723, ax);
    const primary = smooth(.710, .94, ax);
    add(chest, Math.max(0,1-tail-head-collar-wingPortion));
    add(neck, head);
    add(neckBase,collar);
    if(tail>0){
      const bearing=Math.atan2(x,Math.max(.025,zAt(v)-zAt(.625)));
      const ray=(clamp(bearing/.96,-1,1)+1)*5.5;
      const i=Math.min(10,Math.floor(ray)),part=ray-i;
      add(tailRays[i].ray,tail*(1-part));add(tailRays[i+1].ray,tail*part);
    }
    add(wing.shoulder, wingPortion * (1 - intoElbow));
    add(wing.elbow, wingPortion * intoElbow * (1 - intoWrist));
    add(wing.wrist, wingPortion * intoWrist * (1 - primary));
    // From the carpus, each slotted primary points in a slightly different
    // direction. The remiges can flex and separate during the recovery stroke.
    const primaryAngle = Math.atan2((v - .315) * length, Math.max(.035, ax - .632));
    const ray = clamp((primaryAngle + .46) / 1.22, 0, 1) * (wing.fan.length - 1);
    const lower = Math.floor(ray), upper = Math.min(lower + 1, wing.fan.length - 1);
    add(wing.fan[lower], wingPortion * primary * (upper === lower ? 1 : upper - ray));
    if (upper !== lower) add(wing.fan[upper], wingPortion * primary * (ray - lower));
    const strongest = [...result.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const total = strongest.reduce((sum, entry) => sum + entry[1], 0);
    while (strongest.length < 4) strongest.push([0, 0]);
    return {index:strongest.map(entry => entry[0]), weight:strongest.map(entry => entry[1] / total)};
  }
  // Wing bones fold the elbow against the flank and return the carpus toward
  // the shoulder. A corrective shape keys the vanes into overlapping tracts
  // once those joints approach one another, as on a closed avian wing.
  const closedRotation=new Map();
  for(const {sign,shoulder,elbow,wrist,fan} of wings){
    closedRotation.set(shoulder,new THREE.Euler(.14,-sign*1.15,sign*.15,'YZX'));
    closedRotation.set(elbow,new THREE.Euler(0,sign*2.20,-sign*.11,'YZX'));
    closedRotation.set(wrist,new THREE.Euler(-.12,-sign*2.54,-sign*.19,'YZX'));
    fan.forEach((b,i)=>{
      const line=i/(fan.length-1);
      closedRotation.set(b,new THREE.Euler(.025-.045*line,-sign*(.55-line)*.34,sign*(line-.45)*.13,b.rotation.order));
    });
  }
  const closedPose=new Map();
  const bindInFold=bones.map(b=>{
    const r=closedRotation.get(b),m=r?new THREE.Matrix4().makeRotationFromEuler(r):new THREE.Matrix4();
    m.setPosition(b.position);
    if(closedPose.has(b.parent))m.premultiply(closedPose.get(b.parent));
    closedPose.set(b,m);
    const p=reference.get(b);
    return m.clone().multiply(new THREE.Matrix4().makeTranslation(-p.x,-p.y,-p.z));
  });
  const featherMeshes=[];
  const foldedLeading=[[.08,-.139],[.22,-.139],[.39,-.115],[.58,-.067],[.76,.021],[.90,.129],[1.10,.305]];
  const foldedTrailing=[[.08,.170],[.22,.187],[.39,.211],[.58,.246],[.76,.296],[.90,.343],[1.10,.383]];
  const mantleWidth=[[-.14,.122],[-.080,.153],[.0,.170],[.09,.158],[.17,.135],[.25,.113],[.337,.078],[.39,.045]];
  const mantleDepth=[[-.14,.090],[-.075,.115],[.0,.123],[.09,.112],[.17,.082],[.25,.048],[.33,.028],[.39,.015]];
  function addFoldShape(g){
    const {position,skinIndex,skinWeight,normal}=g.attributes;
    const foldedPosition=new Float32Array(position.array.length);
    const point=new THREE.Vector3(),target=new THREE.Vector3(),mat=new THREE.Matrix4();
    for(let i=0;i<position.count;i++){
      point.fromBufferAttribute(position,i);
      const ax=Math.abs(point.x),v=point.z/length+center;
      const w=smooth(.083,.185,ax)*(1-smooth(.69,.75,v));
      if(w>.00001){
        const chord=clamp((v-sample(frontProfile,ax))/(sample(rearProfile,ax)-sample(frontProfile,ax)),0,1);
        const z=sample(foldedLeading,ax)+(sample(foldedTrailing,ax)-sample(foldedLeading,ax))*chord;
        const arch=.47+.99*(1-chord)+.19*smooth(.31,.92,ax);
        const h=point.y-anatomy(.5+point.x/span,v,1).top;
        // Offset each covert row from the underlying primary and secondary vanes.
        const overlay=.009*(1-smooth(.28,.87,ax)),coat=h+overlay;
        const a=Math.sin(arch),b=Math.cos(arch);
        target.set(Math.sign(point.x)*(sample(mantleWidth,z)+coat)*a,
          (sample(mantleDepth,z)+coat)*b+.008-.031*smooth(.15,.37,z),z);
        mat.elements.fill(0);
        for(let j=0;j<4;j++){
          const m=bindInFold[skinIndex.array[i*4+j]],weight=skinWeight.array[i*4+j];
          if(!weight)continue;
          for(let k=0;k<16;k++)mat.elements[k]+=m.elements[k]*weight;
        }
        target.applyMatrix4(mat.invert());point.lerp(target,w);
      }
      const rectrix=smooth(.655,.810,v)*(1-smooth(.27,.34,ax));
      point.x*=1-.61*rectrix;
      point.z+=.012*rectrix;
      point.toArray(foldedPosition,i*3);
    }
    const closedGeometry=new THREE.BufferGeometry();
    closedGeometry.setAttribute('position',new THREE.BufferAttribute(foldedPosition,3));
    closedGeometry.setIndex(g.index);closedGeometry.computeVertexNormals();
    g.morphAttributes.position=[closedGeometry.attributes.position];
    // Keep the contour vanes' authored normal at their unmoved head and neck.
    for(let i=0;i<position.count;i++){
      const ax=Math.abs(position.getX(i)),v=position.getZ(i)/length+center;
      if(ax<.084||v>.75)closedGeometry.attributes.normal.setXYZ(i,normal.getX(i),normal.getY(i),normal.getZ(i));
    }
    g.morphAttributes.normal=[closedGeometry.attributes.normal];
  }
  // The coverts and hackles have their own shafts and vanes. They share the
  // shell's skeleton, so their roots stay planted throughout a turn or stroke.
  const featherTime={value:0}, featherWind={value:1}, separatedFlow={value:0};
  const featherLoads={value:new THREE.Vector2()}, napeTwist={value:new THREE.Vector2()};
  // Driven by eagle-motion.js: turbulence, sideslip airflow, plumage fluff, and
  // per-eye nictitating membrane (x,y) and eyelid (z,w) closure.
  const featherTurb={value:0}, featherSlip={value:0}, featherFluff={value:0}, eyeLids={value:new THREE.Vector4()};
  function addContourFeathers(skeleton) {
    const positions=[], normals=[], uv=[], indices=[], skinIndices=[], skinWeights=[], aero=[], colors=[];
    let seed=682197;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    function surface(x,v,white){
      function height(x,v){
        if(!white)return anatomy(.5+x/span,v,1).top;
        const radius=sample(skullProfiles[0],v), height=sample(skullProfiles[2],v);
        const crown=sample(skullProfiles[1],v)+height*Math.sqrt(Math.max(.002,1-(x/radius)**2));
        const shoulder=anatomy(.5+x/span,v,1).top;
        return crown+(Math.max(crown,shoulder+.0005)-crown)*smooth(.222,.29,v);
      }
      const dx=.00035,dv=dx/length;
      const sx=(height(x+dx,v)-height(x-dx,v))/(2*dx);
      const sz=(height(x,v+dv)-height(x,v-dv))/(2*dx);
      return {point:new THREE.Vector3(x,height(x,v),zAt(v)),normal:new THREE.Vector3(-sx,1,-sz).normalize()};
    }
    function feather(path, white, wing=false, anchor=null){
      const atlasCell=(white?4:0)+Math.floor(random()*4);
      const phase=random()*6.283, variation=white?.96+.06*random():.89+.18*random();
      const amplitude=(white?.0020:wing?.0027:.0023)*(.65+.65*random());
      const start=positions.length/3;
      const rows=8, cols=5;
      for(let i=0;i<=rows;i++){
        const t=i/rows;
        for(let j=0;j<=cols;j++){
          const a=j/cols*2-1, {x,v}=path(t,a);
          const {point,normal}=surface(x,v,white);
          const arch=(1-a*a)*(.0006+.0011*t);
          const liftAtTip = amplitude*(white?1.4:1.65);
          let lift=white?-.0039+.0041*t+t*t*liftAtTip+arch*.25:-.0024+.0027*t+t*t*liftAtTip+arch*.60;
          if(white){
            const orbit=Math.hypot((point.z-zAt(.140))/.026,(point.y-.047)/.020);
            lift-=.008*(1-smooth(.70,1.18,orbit))*smooth(.48,.75,Math.abs(x)/sample(radiusProfile,v));
          }
          point.addScaledVector(normal,lift);
          if(!white){
            const collar=(1-smooth(.32,.38,v))*(1-smooth(.06,.14,Math.abs(x)));
            point.y-=.007*collar;
          }
          positions.push(...point.toArray());normals.push(...normal.toArray());
          const weights=anchor?{index:[anchor.userData.index,0,0,0],weight:[1,0,0,0]}:influences(x,v);
          skinIndices.push(...weights.index);skinWeights.push(...weights.weight);
          uv.push((atlasCell+.008+.984*j/cols)/8,.004+.992*(1-t));
          // The exposed tips flex. The covered proximal vane stays against the skin.
          aero.push(t*t,phase,amplitude,white?smooth(.13,.25,v):0);
          const shade=variation*(white?.96+.04*t:.87+.13*t);
          colors.push(shade,shade,shade);
          if(i<rows&&j<cols){
            const k=start+i*(cols+1)+j;
            indices.push(k,k+cols+1,k+1,k+1,k+cols+1,k+cols+2);
          }
        }
      }
    }
    // Crown and nape feather tracts follow the curvature of the skull and
    // spread over the shoulder seam as the neck widens.
    function bodyRow(v0, count, white, halfWidth, featherLength, offset){
      for(let i=0;i<count;i++){
        const a0=-1.28+(i+.5+offset+(random()-.5)*(white?.76:.26))/count*2.56;
        const vRoot=v0+(random()-.5)*(white?.025:.009);
        const size=featherLength*(.72+.52*random()), w=halfWidth*(.80+.36*random());
        const splay=white? .24*Math.sin(a0*1.8)+.075*Math.sin(vRoot*42)+(random()-.5)*.10 :
          .04*Math.sin(a0*2)+(random()-.5)*.035;
        feather((t,side)=>{
          const v=vRoot+t*size;
          const radius=sample(white?skullProfiles[0]:radiusProfile,v);
          const angle=a0+t*splay+side*w/Math.max(.04,radius);
          return {x:radius*Math.sin(clamp(angle,-1.52,1.52)),v};
        },white);
      }
    }
    // Fine skull feathers lie flat. The nape carries loosely overlapping hackles
    // whose long tips part over the scapulars when the head swivels.
    for(let r=0;r<6;r++){
      const f=r/5;
      bodyRow(.146+r*.0167,Math.round(10+f*8),true,.0020+f*.0022,.039+.038*f,(random()-.5)*.95);
    }
    for(let r=0;r<9;r++){
      const f=r/8;
      bodyRow(.31+r*.036,Math.round(13+Math.sin(f*Math.PI)*6),false,.0085+.003*Math.sin(f*Math.PI),.050+.032*f,(random()-.5)*.65);
    }
    for(const side of [-1,1]){
      for(let row=0;row<4;row++){
        for(let i=0;i<27;i++){
          const root=.105+(i+.5+(row%2)*.32)*.024;
          const start=sample(frontProfile,root)+.03+row*.055+(random()-.5)*.012;
          const width=.014*(.81+.39*random()), extent=(.069+row*.013)*(.87+.26*random());
          const sweep=.014+root*.073;
          feather((t,a)=>({x:side*(root+sweep*t)+a*width,
            v:start+t*extent-a*side*width*.40/length}),false,true);
        }
      }
    }
    // Three overlapping thumb feathers pivot from the leading edge of each hand.
    for(const {sign,alula} of wings){
      for(let i=0;i<3;i++){
        const reach=.098-i*.014;
        feather((t,a)=>({x:sign*(.634+t*reach),
          v:.216+i*.012+t*(.013+i*.007)+a*.009/length}),false,true,alula);
      }
    }
    const geo=new THREE.BufferGeometry();
    for(const [name,values,size] of [['position',positions,3],['normal',normals,3],['uv',uv,2],
      ['color',colors,3],['aero',aero,4],['skinWeight',skinWeights,4]]){
      geo.setAttribute(name,new THREE.Float32BufferAttribute(values,size));
    }
    geo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(skinIndices,4));geo.setIndex(indices);
    const atlas=new THREE.TextureLoader().load('eagle-contours.webp');
    atlas.colorSpace=THREE.SRGBColorSpace;atlas.anisotropy=8;
    const material=new THREE.MeshStandardMaterial({map:atlas,alphaTest:.36,alphaToCoverage:true,
      vertexColors:true,side:THREE.DoubleSide,roughness:.69,bumpMap:atlas,bumpScale:.00021});
    material.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,{featherTime,featherWind,separatedFlow,featherLoads,napeTwist,featherTurb,featherSlip,featherFluff});
      shader.vertexShader=shader.vertexShader.replace('#include <common>',
        '#include <common>\nattribute vec4 aero; uniform float featherTime,featherWind,separatedFlow,featherTurb,featherSlip,featherFluff; uniform vec2 featherLoads,napeTwist;')
        .replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
        // Bend the normal as well as the vane: its reflection changes as the tip peels.
        float sideLoad=mix(featherLoads.x,featherLoads.y,step(0.,position.x));
        float outerCovert=smoothstep(.12,.28,abs(position.x))*smoothstep(-.15,.07,position.z);
        float reverseFlow=clamp(separatedFlow+.53*max(0.,sideLoad),0.,1.);
        float scapular=smoothstep(.066,.10,abs(position.x))*(1.-smoothstep(.20,.33,abs(position.x)))
          *smoothstep(-.14,-.074,position.z)*(1.-smoothstep(.12,.20,position.z));
        float eddy=sin(featherTime*2.1+position.z*36.+aero.y*.58)
          +.51*sin(featherTime*3.7+position.x*17.-position.z*12.)+.24*sin(featherTime*8.3+aero.y);
        float caught=scapular*smoothstep(.94,1.54,eddy+.34*abs(sideLoad))*clamp(featherWind-.31,0.,1.2);
        objectNormal.z-=aero.x*(outerCovert*reverseFlow*.19+caught*.15);`)
        .replace('#include <begin_vertex>',`#include <begin_vertex>
        float wave=sin(featherTime*6.8-position.z*30.+position.x*15.+aero.y*.43);
        float flutter=sin(featherTime*12.3+aero.y+position.x*28.);
        float gust=sin(featherTime*2.85-position.z*61.+position.x*17.);
        float agitation=featherWind*(.25+.60*abs(sideLoad)*outerCovert)*(1.+.4*featherTurb);
        float bend=aero.x*aero.z*(.45+.33*wave+.18*flutter+.21*gust)*agitation;
        float lifting=aero.x*(outerCovert*reverseFlow*(.008+.004*sin(featherTime*18.+aero.y))
          +caught*(.004+.005*aero.z/.003));
        float neckSide=clamp(position.x/.045,-1.,1.);
        float outside=max(0.,neckSide*napeTwist.x);
        float hackle=aero.x*aero.w;
        // Crossflow lifts the windward feather edges; turbulence adds a fast,
        // uncorrelated ruffle; negative G and rousing float the whole plumage.
        float windward=max(0.,featherSlip*sign(position.x));
        float ruffle=featherTurb*sin(featherTime*23.+aero.y*3.1+position.x*41.)*sin(featherTime*7.3+position.z*53.);
        lifting+=aero.x*(windward*(.0025+.0015*sin(featherTime*15.+aero.y))+abs(ruffle)*.0016+featherFluff*(.0050+.0020*aero.z/.003));
        // Nape hackles: gusts riffle them, crossflow raises the windward side.
        float hackleWind=featherTurb*(.0005+.0004*sin(featherTime*31.+aero.y*2.3+position.x*60.))+windward*.0008+featherFluff*.0010;
        transformed+=normal*(bend+lifting+hackle*(outside*.0016+abs(napeTwist.y)*.0012+hackleWind));
        transformed.z-=lifting*.31;
        transformed.x+=aero.x*aero.z*wave*.32*agitation+hackle*napeTwist.y*.0053;
        transformed.z+=hackle*(abs(napeTwist.y)*.0026-outside*.0020);
`);
      // Thin vanes transmit some skylight when viewed along their lower face.
      // This keeps the ivory fringe legible in grazing-angle shoulder views.
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        if(!gl_FrontFacing) reflectedLight.indirectDiffuse+=diffuseColor.rgb*mix(.12,.54,step(.50,vMapUv.x));`);
    };
    addFoldShape(geo);
    const mesh=new THREE.SkinnedMesh(geo,material);featherMeshes.push(mesh);
    mesh.name='Individual crown, neck, mantle and wing feathers';
    mesh.frustumCulled=false;rig.add(mesh);mesh.bind(skeleton,new THREE.Matrix4());
  }
  const legSkin=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.76});
  legSkin.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      #ifdef USE_MAP
      if(vMapUv.y>=0.)diffuseColor.rgb*=texture2D(map,vMapUv).rgb;
      #endif`);
  };
  const sidePortrait=new THREE.TextureLoader().load('eagle-profile.webp');
  sidePortrait.colorSpace=THREE.SRGBColorSpace;sidePortrait.anisotropy=10;
  function buildShell(photo) {
    // Triangulate the photograph's alpha contour, including the gaps between
    // primary feathers. The ventral and dorsal skins meet along that contour.
    const columns = 195, rows = 75, stride = columns + 1;
    const canvas = document.createElement('canvas');
    canvas.width = stride; canvas.height = rows + 1;
    const context = canvas.getContext('2d', {willReadFrequently:true});
    context.drawImage(photo.image, 1, 1, columns - 1, rows - 1);
    const rgba = context.getImageData(0, 0, stride, rows + 1).data;
    const mask = new Float32Array(stride * (rows + 1));
    for (let i = 0; i < mask.length; i++) {
      // The rigid keratin bill has a separate upper hook and lower mandible.
      const v = Math.floor(i / stride)/rows, ax=Math.abs((i%stride/columns-.5)*span);
      mask[i] = v < .252 && ax < sample(radiusProfile,v)+.017 ? 0 : rgba[i * 4 + 3] / 255;
    }
    const pos = [], uv = [], skinIndex = [], skinWeight = [];
    const upper = [], lower = [], seam = [];
    const threshold = .32;
    const cache = new Map();
    function vertex(a, b) {
      const key = a < b ? a * mask.length + b : b * mask.length + a;
      if (cache.has(key)) return cache.get(key);
      const fraction = a === b ? 0 : (threshold - mask[a]) / (mask[b] - mask[a]);
      const col = a % stride + (b % stride - a % stride) * fraction;
      const row = Math.floor(a / stride) + (Math.floor(b / stride) - Math.floor(a / stride)) * fraction;
      const u = clamp((col - .5) / (columns - 1), 0, 1);
      const v = clamp((row - .5) / (rows - 1), 0, 1);
      const form = anatomy(u, v, a === b ? 1 : .15);
      const bind = influences(form.x, v);
      const index = pos.length / 3;
      for (const y of [form.top, form.bottom - .0007]) {
        pos.push(form.x, y, form.z);
        uv.push(u, 1 - v);
        skinIndex.push(...bind.index);
        skinWeight.push(...bind.weight);
      }
      cache.set(key, index);
      return index;
    }
    function triangle(a, b, c) {
      const corners = [a, b, c], clipped = [], intersections = [];
      for (let i = 0; i < 3; i++) {
        const first = corners[i], next = corners[(i + 1) % 3];
        const inside = mask[first] >= threshold;
        if (inside) clipped.push(vertex(first, first));
        if (inside !== (mask[next] >= threshold)) {
          const edge = vertex(first, next);
          clipped.push(edge);
          intersections.push(edge);
        }
      }
      for (let i = 1; i + 1 < clipped.length; i++) {
        upper.push(clipped[0], clipped[i], clipped[i + 1]);
        lower.push(clipped[i + 1] + 1, clipped[i] + 1, clipped[0] + 1);
      }
      if (intersections.length === 2) {
        const [p, q] = intersections;
        seam.push(p, q, p + 1, q, q + 1, p + 1);
      }
    }
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < columns; j++) {
        const n = i * stride + j;
        triangle(n, n + stride, n + 1);
        triangle(n + 1, n + stride, n + stride + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
    geometry.setIndex([...upper, ...lower, ...seam]);
    geometry.addGroup(0, upper.length, 0);
    geometry.addGroup(upper.length, lower.length, 1);
    geometry.addGroup(upper.length + lower.length, seam.length, 1);
    geometry.computeVertexNormals();
    photo.colorSpace = THREE.SRGBColorSpace;
    photo.anisotropy = 8;
    const plumage = new THREE.MeshStandardMaterial({
      map:photo, bumpMap:photo, bumpScale:.0007, roughness:.81, metalness:0,
      alphaTest:.16, side:THREE.DoubleSide
    });
    const textureLoader = new THREE.TextureLoader();
    function tractTexture(file){
      const texture=textureLoader.load(file);
      texture.colorSpace=THREE.SRGBColorSpace;
      texture.wrapS=THREE.MirroredRepeatWrapping;
      texture.wrapT=THREE.RepeatWrapping;
      texture.anisotropy=12;
      return texture;
    }
    const mantle=tractTexture('eagle-mantle.webp'), nape=tractTexture('eagle-nape.webp');
    legSkin.map=mantle;legSkin.needsUpdate=true;
    function dorsalShading(shader){
      Object.assign(shader.uniforms,{mantleMap:{value:mantle},napeMap:{value:nape}});
      shader.vertexShader=shader.vertexShader.replace('#include <common>',
        '#include <common>\nvarying vec3 restPlumage; varying vec3 restNormal;')
        .replace('#include <begin_vertex>','#include <begin_vertex>\nrestPlumage=position;restNormal=normal;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
        varying vec3 restPlumage,restNormal;
        uniform sampler2D mantleMap,napeMap;`)
        .replace('#include <map_fragment>',`#include <map_fragment>
          float v=restPlumage.z/${length.toFixed(6)}+.44;
          float ax=abs(restPlumage.x);
          float circumference=restPlumage.x*(1.+.85*(1.-max(restNormal.y,0.)));
          float ratio=max(dot(diffuseColor.rgb,vec3(.2126,.7152,.0722)),.0001);
          float white=smoothstep(.23,.45,ratio)*(1.-smoothstep(.31,.375,v));
          // Stagger the tips over the curved boundary where the mantle lifts
          // in front of the nape in the close shoulder projection.
          float tuft=abs(fract(restPlumage.x*96.+.16*sin(restPlumage.x*201.))-.5)*2.;
          float edge=.332-.055*smoothstep(.014,.135,ax)+.013*(1.-tuft)+.005*sin(restPlumage.x*155.);
          float neckTract=(1.-smoothstep(edge-.009,edge+.003,v))*(1.-smoothstep(.07,.14,ax));
          white=max(white,neckTract);
          vec2 mantleUv=vec2(circumference*10.2+.45,1.-v*8.8+ax*2.1);
          vec3 mantleBase=texture2D(mantleMap,mantleUv).rgb;
          vec2 collarUv=vec2(circumference*15.+.61,1.-v*12.+.07);
          vec3 napeBase=texture2D(napeMap,collarUv).rgb;
          vec3 layers=mix(mantleBase,napeBase,white*.89);
          float coverage=(1.-smoothstep(.17,.54,ax))*smoothstep(.055,.084,v)*(1.-smoothstep(.52,.70,v));
          // Retain broad variations in the original dorsal photograph.
          diffuseColor.rgb=mix(diffuseColor.rgb,napeBase,white*.72);
          vec3 mapped=layers*mix(.86,1.12,smoothstep(.045,.52,ratio));
          diffuseColor.rgb=mix(diffuseColor.rgb,mapped,coverage*.76);
        `);
    }
    // An elliptical throat and a vaulted cranium provide a continuous profile as
    // the bird looks sideways. The dorsal shell meets this volume at the nape.
    function sculptHead(skeleton) {
      const positions=[],uv=[],colors=[],indices=[],skinIndex=[],skinWeight=[];
      const rings=55, facets=80;
      for(let j=0;j<=rings;j++){
        const t=j/rings;
        for(let k=0;k<=facets;k++){
          const a=k/facets*2*Math.PI, top=Math.cos(a), side=Math.sin(a);
          const fringe=.004*Math.sin(a*17.)+.004*Math.sin(a*31.+1.);
          const v=.049+t*(.255+fringe*t*t);
          const [rx,cy,ry,depth]=skullProfiles.map(p=>sample(p,v));
          const x=rx*side, y=cy+top*(top>0?ry:depth);
          const bind=influences(x,v);
          positions.push(x,y,zAt(v));skinIndex.push(...bind.index);skinWeight.push(...bind.weight);
          // Dorsal feathers point down the neck and turn around both cheeks.
          const periodicAngle=k===facets?0:a;
          const arch=periodicAngle<=Math.PI?periodicAngle:periodicAngle-2*Math.PI;
          uv.push(.61+arch*rx*15.,1.-v*12.+.07*top+.14*side*side);
          const collar=1-.38*smooth(.256,.305,v);
          colors.push(collar,collar*.98,collar*.955);
          if(j<rings&&k<facets){const b=j*(facets+1)+k;indices.push(b,b+facets+1,b+1,b+1,b+facets+1,b+facets+2);}
        }
      }
      const g=new THREE.BufferGeometry();
      for (const [key,data,size] of [['position',positions,3],['color',colors,3],['uv',uv,2],['skinWeight',skinWeight,4]])g.setAttribute(key,new THREE.Float32BufferAttribute(data,size));
      g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(skinIndex,4));g.setIndex(indices);g.computeVertexNormals();
      const mat=new THREE.MeshStandardMaterial({map:nape,vertexColors:true,bumpMap:nape,bumpScale:.00030,roughness:.75});
      mat.onBeforeCompile=shader=>{
        shader.uniforms.sidePortrait={value:sidePortrait};shader.uniforms.eyeLids=eyeLids;
        shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 skull;')
          .replace('#include <begin_vertex>','#include <begin_vertex>\nskull=position;');
        shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 skull; uniform sampler2D sidePortrait; uniform vec4 eyeLids;')
          .replace('#include <map_fragment>',`#include <map_fragment>
            vec2 px=vec2(499.+(skull.z-(${zAt(.136).toFixed(6)}))*3980.,257.-(skull.y-.040)*3550.);
            vec3 eye=texture2D(sidePortrait,vec2(px.x/960.,1.-px.y/640.)).rgb;
            float eyeRegion=length((px-vec2(498.,253.))/vec2(98.,76.));
            float orbit=1.-smoothstep(.57,1.,eyeRegion);
            // The portrait includes the nostril, the gape below the eye,
            // and the short cheek feathers. Keep them in one rigid skull frame.
            float cheek=(1.-smoothstep(690.,790.,px.x))
                       *smoothstep(134.,182.,px.y)*(1.-smoothstep(421.,487.,px.y));
            float tissue=smoothstep(.012,.07,max(eye.r,max(eye.g,eye.b)));
            float billBase=1.-smoothstep(322.,416.,px.x);
            float sideWeight=mix(smoothstep(.012,.033,abs(skull.x)),1.,billBase);
            float mask=max(orbit,cheek*tissue*mix(.94,1.,billBase))*sideWeight;
            float lum=dot(eye,vec3(.2126,.7152,.0722));
            eye=mix(vec3(lum),eye,.78);
            eye=mix(eye,mix(vec3(lum*.99,lum*.92,lum*.65),eye,.64),billBase);
            // Third eyelid: a translucent, bluish-white membrane sweeping from
            // the front (rostral, toward the bill) corner back across the cornea.
            // The lower lid rises for slow blinks and a squint in steep dives.
            vec2 e=(px-vec2(496.,261.))/vec2(25.,22.);
            float inEye=1.-smoothstep(.86,1.02,length(e));
            float side=step(0.,skull.x);
            float nict=mix(eyeLids.x,eyeLids.y,side),lid=mix(eyeLids.z,eyeLids.w,side);
            float sweep=-1.15+2.35*nict-.22*e.y-.18*e.y*e.y;
            float membrane=inEye*(1.-smoothstep(sweep-.16,sweep,e.x))*step(.002,nict);
            float rim=inEye*smoothstep(sweep-.16,sweep-.05,e.x)*(1.-smoothstep(sweep-.05,sweep,e.x))*step(.002,nict);
            vec3 film=mix(eye,vec3(.70,.76,.82)*(.78+.40*lum),.52)+vec3(.04,.05,.06)*(1.-length(e));
            eye=mix(eye,film,membrane)*(1.-.18*rim);
            float lidLine=1.-2.*lid*1.08;
            float lidCover=(1.-smoothstep(1.,1.25,length(e)))*smoothstep(lidLine-.06,lidLine+.06,e.y)*step(.002,lid);
            vec3 base=diffuseColor.rgb;
            diffuseColor.rgb=mix(diffuseColor.rgb,eye,mask);
            diffuseColor.rgb=mix(diffuseColor.rgb,base*.92,lidCover*mask);
          `);
      };
      const mesh=new THREE.SkinnedMesh(g,mat);mesh.name='Crown, cheeks and throat';mesh.frustumCulled=false;
      mesh.castShadow=true;rig.add(mesh);mesh.bind(skeleton,new THREE.Matrix4());
    }
    plumage.onBeforeCompile=dorsalShading;
    const ventral = plumage.clone();
    ventral.color.setHex(0xd6c9b4);
    ventral.roughness = .88;
    addFoldShape(geometry);
    const skin = new THREE.SkinnedMesh(geometry, [plumage, ventral]);featherMeshes.push(skin);
    skin.name = 'Dorsal and ventral plumage';
    skin.castShadow = true;
    skin.frustumCulled = false;
    rig.add(skin);
    // The photograph can arrive after the bird has launched. Bind using
    // the neutral LOCAL transforms, independent of the current flight pose.
    const inverse = bones.map(b => new THREE.Matrix4().makeTranslation(
      -reference.get(b).x, -reference.get(b).y, -reference.get(b).z));
    skin.bind(new THREE.Skeleton(bones, inverse), new THREE.Matrix4());
    skin.bindMode = 'attached';
    sculptHead(skin.skeleton);
    addContourFeathers(skin.skeleton);
    object.userData.plumageReady = true;
  }
  new THREE.TextureLoader().load('eagle-plumage.png', buildShell);

  // Separate keratin shells follow measured sections of the CC0 reference portrait;
  // the lower bill ends behind the downward hook of the upper mandible.
  function bill(upper) {
    const profile = upper ? [
      [-.010,-.004,-.011,.0018],[-.006,.009,-.016,.0036],[.001,.019,-.015,.0066],
      [.012,.029,-.001,.012],[.032,.043,.007,.0175],[.061,.054,.010,.0245],
      [.082,.055,.009,.0315],[.101,.051,.008,.0385],[.114,.043,.010,.029]
    ] : [
      [.010,.001,-.004,.002],[.020,.006,-.002,.008],[.042,.010,-.003,.013],
      [.070,.009,-.006,.020],[.097,.008,-.009,.025],[.115,.012,-.005,.027]
    ];
    // Each station also has an upper and lower pixel on the lateral photograph.
    const swatches=upper?[[169,336,345],[174,307,380],[183,285,383],[206,256,334],[243,229,323],[280,216,316],[315,208,313],[345,206,314],[367,210,318]]
      :[[196,340,344],[209,336,345],[246,325,348],[292,317,347],[347,317,347],[379,318,346]];
    const points=[],uv=[],cereUV=[],indices=[],sides=32,steps=(profile.length-1)*6;
    for(let j=0;j<=steps;j++){
      const f=j/6, i=Math.min(profile.length-2,Math.floor(f)), t=f-i;
      const section=profile[i].map((mid,k)=>{
        const prev=profile[Math.max(0,i-1)][k], next=profile[i+1][k], after=profile[Math.min(profile.length-1,i+2)][k];
        const tangentA=(next-prev)*.5, tangentB=(after-mid)*.5;
        return mid*(2*t-3)*t*t+mid+next*(3-2*t)*t*t+t*(1-t)*((1-t)*tangentA-t*tangentB);
      });
      const [v,top,bottom,width]=section;
      for(let k=0;k<=sides;k++){
        const angle=2*Math.PI*k/sides, vertical=(1+Math.cos(angle))*.5;
        const y=.018+(bottom+(top-bottom)*vertical-.018)*.79;
        const x=Math.sin(angle)*width*(1.17-.40*vertical);
        points.push(x,y-reference.get(neck).y,zAt(v)-reference.get(neck).z);
        const swatch=swatches[i], next=swatches[i+1];
        const peak=THREE.MathUtils.lerp(swatch[1],next[1],t);
        const lip=THREE.MathUtils.lerp(swatch[2],next[2],t);
        uv.push(THREE.MathUtils.lerp(swatch[0],next[0],t)/960,1-THREE.MathUtils.lerp(lip,peak,vertical)/640);
        cereUV.push(upper?(499+(zAt(v)-zAt(.136))*3980)/960:0,1-(257-(y-.040)*3550)/640);
        if(j<steps&&k<sides){const a=j*(sides+1)+k;indices.push(a,a+sides+1,a+1,a+1,a+sides+1,a+sides+2);}
      }
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    g.setAttribute('cereUV',new THREE.Float32BufferAttribute(cereUV,2));g.setIndex(indices);g.computeVertexNormals();
    const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({map:sidePortrait,bumpMap:sidePortrait,bumpScale:.00019,roughness:upper?.48:.58,side:THREE.DoubleSide}));
    m.material.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec2 cereUV; varying vec2 joinedCere;')
        .replace('#include <begin_vertex>','#include <begin_vertex>\njoinedCere=cereUV;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 joinedCere;')
        .replace('#include <map_fragment>',`#include <map_fragment>
        vec3 root=texture2D(map,joinedCere).rgb;
        float overlap=smoothstep(.246,.338,joinedCere.x)*smoothstep(.016,.082,max(root.r,max(root.g,root.b)));
        diffuseColor.rgb=mix(diffuseColor.rgb,root,overlap);
        float pigment=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
        diffuseColor.rgb=mix(vec3(pigment*.99,pigment*.92,pigment*.65),diffuseColor.rgb,.64);
        diffuseColor.rgb=max(diffuseColor.rgb,vec3(.125,.053,.014));
      `);
    };
    m.name=upper?'Hooked upper bill':'Lower mandible';neck.add(m);
  }
  bill(true);bill(false);

  const gold = new THREE.MeshStandardMaterial({color:0xc6a74f, roughness:.62});
  const claw = new THREE.MeshStandardMaterial({color:0x332d22, roughness:.49});
  function oval(parent, name, mat, x, y, z, sx, sy, sz) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), mat);
    m.name = name;
    m.position.set(x, y, z).sub(reference.get(parent));
    m.scale.set(sx, sy, sz); parent.add(m);
    return m;
  }
  const tuckedFeet=[];
  for (const side of [-1, 1]) {
    const foot = oval(chest, 'Tucked tarsus', gold, side * .052, -.046, zAt(.672), .015, .015, .050);
    foot.rotation.y = side * .11;
    tuckedFeet.push(foot);
    for (let n = -1; n <= 1; n++) {
      const toe = oval(chest, 'Curled toe', claw, side * .052 + n * .008, -.046, zAt(.712), .0035, .0055, .011);
      toe.rotation.x = -.54;
      tuckedFeet.push(toe);
    }
  }
  // Hind talon opposes the three forward toes. Rings follow each toe's curve
  // to carry the gold scales into a pointed, recurved horn tip.
  const scute=new THREE.MeshStandardMaterial({color:0xb89343,roughness:.69});
  const scuteShape=new THREE.SphereGeometry(1,8,5).scale(.0072,.0046,.0034);
  function taperedCurve(parent,name,sections,material){
    const points=sections.map(p=>new THREE.Vector3(...p.slice(0,3)));
    const vertices=[],indices=[],sides=9;
    const up=new THREE.Vector3(1,0,0);
    for(let i=0;i<points.length;i++){
      const tangent=points[Math.min(i+1,points.length-1)].clone().sub(points[Math.max(i-1,0)]).normalize();
      const u=new THREE.Vector3().crossVectors(tangent,up).normalize(),v=new THREE.Vector3().crossVectors(tangent,u);
      for(let j=0;j<sides;j++){
        const angle=j*Math.PI*2/sides;
        const pt=points[i].clone().addScaledVector(u,Math.cos(angle)*sections[i][3]).addScaledVector(v,Math.sin(angle)*sections[i][3]);
        vertices.push(pt.x,pt.y,pt.z);
        if(i){
          const a=(i-1)*sides+j,b=(i-1)*sides+(j+1)%sides;
          indices.push(a,b,a+sides,b,b+sides,a+sides);
        }
      }
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();
    const mesh=new THREE.Mesh(geo,material);mesh.name=name;mesh.castShadow=true;parent.add(mesh);
    return mesh;
  }
  function scaledLeg(ankle,sign){
    const positions=[],uv=[],colors=[],index=[],sides=28;
    const ochre=new THREE.Color(0xdfab4f);
    // The tibiotarsal plumage narrows into the bare, straight tarsometatarsus.
    // The irregular last feather row shares its seam with the yellow skin.
    const cuff=[[.067,-.012,.013,.016],[.041,-.004,.035,.037],[.012,.004,.040,.041],
      [-.016,.010,.036,.037],[-.038,.011,.030,.033],[-.054,.007,.023,.026],[-.060,.006,.0132,.0142]];
    function ring(y,z,rx,rz,fringe,v,shade){
      const base=positions.length/3;
      for(let j=0;j<=sides;j++){
        const u=j/sides,a=u*2*Math.PI,side=Math.cos(a),rear=Math.sin(a);
        const tip=.0037*Math.cos(a*7+sign*.7+.4*Math.sin(a*3))+.0024*Math.sin(a*4+sign*.6)-.0055*rear;
        const front=smooth(-.3,.95,-rear),plate=v<0?front:0;
        const width=1+fringe*.07*Math.cos(a*7+sign*.7);
        const relief=v<0?(shade-.89)*.0035*plate:0;
        positions.push(sign*.005+(rx+relief)*side*width,y+tip*fringe+.0015*plate*Math.cos(2*a+y*60),z+(rz+relief)*rear*width);
        uv.push(u*2.7+sign*.19,v);
        if(v>=0)colors.push(.67,.62,.59);
        else{
          const tone=.96+(shade-.89)*front,distal=smooth(.059,.129,-y);
          colors.push(THREE.MathUtils.lerp(ochre.r,gold.color.r,distal)*tone,THREE.MathUtils.lerp(ochre.g,gold.color.g,distal)*tone,THREE.MathUtils.lerp(ochre.b,gold.color.b,distal)*tone);
        }
        if(base&&j){const k=base+j,q=k-sides-1;index.push(q-1,q,k-1,k-1,q,k);}
      }
    }
    for(let i=0;i<cuff.length;i++)ring(...cuff[i],smooth(2,5,i),1.46-i*.224,1);
    const hem=cuff.at(-1);
    ring(...hem,1,-1,1);
    // Shallow transverse scutes break up the front of the taper without a second draw.
    for(let i=0;i<=11;i++){
      const t=i/11,y=-.070-.059*t,z=.003-.040*t;
      const r=.0118+.0013*t;
      ring(y+.0013,z,r+.0006,r,0,-1,.99);
      ring(y,z,r,r-.0004,0,-1,.79);
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(index);g.computeVertexNormals();
    const mesh=new THREE.Mesh(g,legSkin);mesh.name='Scaled tarsus';mesh.castShadow=true;ankle.add(mesh);
    mesh.position.sub(ankle.position);
    const rest=positions.slice(0,cuff.length*(sides+1)*3),root=new THREE.Vector3(sign*.005,cuff[0][0],cuff[0][1]);
    const along=new THREE.Vector3(),around=new THREE.Vector3(),point=new THREE.Vector3();
    const hip=new THREE.Vector3(sign*.039,.020,-.012),delta=new THREE.Vector3(),last=new THREE.Vector3(Infinity,0,0),inverse=new THREE.Quaternion();
    return function attachThigh(chest,leg){
      // The hip follows the thorax. The lower joint and all toes stay with their planted foot.
      delta.copy(hip).applyQuaternion(chest.quaternion).add(chest.position)
        .sub(leg.position).applyQuaternion(inverse.copy(leg.quaternion).invert())
        .sub(ankle.position).applyQuaternion(inverse.copy(ankle.quaternion).invert()).add(ankle.position).sub(root);
      if(delta.distanceToSquared(last)<.00015**2)return;
      last.copy(delta);
      const p=g.attributes.position;
      for(let i=0;i<cuff.length;i++){
        const influence=1-smooth(0,cuff.length-1,i);
        for(let j=0;j<=sides;j++){
          const k=i*(sides+1)+j;p.setXYZ(k,rest[k*3]+influence*delta.x,rest[k*3+1]+influence*delta.y,rest[k*3+2]+influence*delta.z);
        }
      }
      // Only the cuff deforms. The scutes and toe end retain their original normals.
      const normal=g.attributes.normal;
      for(let i=0;i<cuff.length;i++)for(let j=0;j<=sides;j++){
        const row=i*(sides+1),a=Math.max(0,i-1)*(sides+1)+j,b=Math.min(cuff.length,i+1)*(sides+1)+j;
        around.fromBufferAttribute(p,row+(j+1)%sides).sub(point.fromBufferAttribute(p,row+(j+sides-1)%sides));
        along.fromBufferAttribute(p,b).sub(point.fromBufferAttribute(p,a));
        around.cross(along).normalize();normal.setXYZ(row+j,around.x,around.y,around.z);
      }
      p.needsUpdate=normal.needsUpdate=true;g.computeBoundingSphere();
    };
  }
  const perchFeet=[-1,1].map(sign=>{
    const leg=new THREE.Group();rig.add(leg);leg.name='Reaching leg '+sign;
    leg.position.set(sign*.065,-.038,.09);leg.visible=false;
    // Let the hock tip backward about a planted foot as the legs take weight.
    // The tarsus stays rigid and the opposing toes keep their grip.
    const ankle=new THREE.Group();leg.add(ankle);ankle.name='Planted ankle '+sign;
    ankle.position.set(sign*.007,-.129,-.037);
    const attachThigh=scaledLeg(ankle,sign);
    const toes=[],sole=[];
    for(let j=0;j<4;j++){
      const rear=j===3,heading=rear?Math.PI+sign*.12:(j-1)*.48+sign*.04;
      const toe=new THREE.Group();leg.add(toe);
      toe.position.set(sign*.007+(rear?0:(j-1)*.007),-.129,-.037+(rear?.009:0));
      toe.rotation.order='YXZ';toe.rotation.y=heading;toes.push(toe);
      const len=rear?.045:j===1?.058:.046;
      // Sample the bearing surfaces of the pads and the hook around the branch.
      for(const [height,reach] of [[-.033,.94],[-.027,1.06],[-.020,1.13],[-.011,.78],[-.010,.30],[-.007,0]]){
        sole.push(new THREE.Vector3(0,height,-reach*len).applyQuaternion(toe.quaternion).add(toe.position).add(leg.position));
      }
      taperedCurve(toe,'Toe pad',[[0,.002,0,.009],[0,-.003,-len*.30,.008],[0,-.001,-len*.55,.0072],[0,-.004,-len*.78,.0068],[0,-.004,-len*.86,.0058]],gold);
      const scales=new THREE.InstancedMesh(scuteShape,scute,3);
      for(let k=0;k<3;k++)scales.setMatrixAt(k,new THREE.Matrix4().makeTranslation(0,.002,-len*(.32+k*.21)));
      scales.computeBoundingSphere();toe.add(scales);
      taperedCurve(toe,'Hooked claw',[[0,-.004,-len*.80,.0055],[0,-.005,-len*.97,.0053],[0,-.011,-len*1.09,.0044],[0,-.020,-len*1.13,.0031],[0,-.027,-len*1.06,.0016],[0,-.033,-len*.94,.00035]],claw);
    }
    return {leg,ankle,toes,sign,attachThigh,hip:leg.position.clone(),sole,stance:null,bearing:0,oldHeight:0,height:0};
  });
  function seatOnBranch(foot,stance,bearing,s){
    if(!stance?.supportAt)return 0;
    const moving=stance.moving===foot.sign;
    const target=moving?(stance.landingYaw??bearing):bearing;
    if(foot.stance!==stance||Math.abs(foot.bearing-target)>.00001){
      const cos=Math.cos(target),sin=Math.sin(target);
      let highest=-Infinity;
      for(const p of foot.sole){
        const surface=stance.supportAt(s.x+p.x*cos+p.z*sin,s.z-p.x*sin+p.z*cos);
        highest=Math.max(highest,surface-(s.y+p.y));
      }
      const height=Number.isFinite(highest)?clamp(highest,-.034,.015):0;
      // Sample the actual branch triangles only when a foot chooses new footing.
      foot.oldHeight=foot.stance===stance?foot.height:height;
      foot.height=height;foot.bearing=target;foot.stance=stance;
    }
    return moving?blend(foot.oldHeight,foot.height,smooth(.12,.88,stance.progress)):foot.height;
  }
  const tiltAngles=new THREE.Euler(),bodyTilt=new THREE.Quaternion(),levelFeet=new THREE.Quaternion(),bodyUp=new THREE.Vector3();
  const stepRotation=new THREE.Quaternion(),standingAxis=new THREE.Vector3(0,1,0),weightShift=new THREE.Vector3();
  const blend=(flight,landing,amount)=>flight+(landing-flight)*amount;
  let phase = 0, effort = 0, tuck = 0, lastBank = 0, turnDemand = 0;
  let armSweep=0,handSweep=0,tailBrake=0,wingBrake=0,handBrake=0;
  let previousHeading,previousFlight,perchPivot=0;
  const wrap = angle => Math.atan2(Math.sin(angle),Math.cos(angle));
  const lastPosition=new THREE.Vector3(),gazeOrigin=new THREE.Vector3();
  const localHead=new THREE.Quaternion(),worldHead=new THREE.Quaternion(),headAngles=new THREE.Euler(0,0,0,'YXZ');
  const neckPose=new THREE.Euler(0,0,0,'YXZ'),neckOrientation=new THREE.Quaternion();
  let gazeTime=-1,trackYaw=0,lockedYaw=0,lockedPitch=0,allowedShift=0,scanAt=3,scanEnds=0,scanNumber=0,lastAim=null;
  // Median normalized yaw excursion from 31 measured head turns in eight
  // Harris's hawk flights. CC0 head orientations: doi:10.17617/3.LVTWX0.
  // Retarget the timing to the eagle's actual bearing and neck limits.
  const headTurnCurve=[0,.0413,.0902,.1624,.2703,.4076,.5354,.6606,.7755,.8650,.9284,.9662,1];
  let shiftStart=-1,shiftTime=.082,fromYaw=0,fromPitch=0,shiftYaw=0,shiftPitch=0,wasWatchingSubject=false;

  function updateGaze(time,step,pitch,bank,focus,fold,s,reset){
    const course=s.yaw??0,heading=course+(s.yawSlip??0), x=s.x??0, y=s.y??0, z=s.z??0;
    const dx=x-lastPosition.x,dz=z-lastPosition.z,planar=Math.hypot(dx,dz);
    const path=s.path??pitch;
    if(reset){
      trackYaw=course;lockedYaw=heading;lockedPitch=.66*path;
      shiftStart=-1;allowedShift=time;scanAt=time+3.6;scanEnds=0;scanNumber=0;lastAim=null;wasWatchingSubject=false;
    }else if(planar>.002){
      // Flight direction includes crosswind drift. Filter frame-to-frame motion
      // so head and body can briefly disagree without a twitch at yaw wraparound.
      trackYaw+=wrap(Math.atan2(-dx,-dz)-trackYaw)*(1-Math.exp(-7*step));
    }
    lastPosition.set(x,y,z);gazeTime=time;
    localHead.setFromEuler(headAngles.set(pitch,heading,bank,'YXZ'));
    gazeOrigin.copy(neck.position).applyQuaternion(neckBase.quaternion).add(neckBase.position)
      .applyQuaternion(chest.quaternion).add(chest.position).applyQuaternion(localHead).add(lastPosition);
    const turn=clamp(s.gazeTurn??0,-1,1);
    const looking=clamp(s.gazeLook??0,-1,1);
    let tracking=false,watchingSubject=false,desiredYaw=trackYaw,desiredPitch=.74*path;
    if(shiftStart>=0){
      const at=clamp((time-shiftStart)/shiftTime,0,1)*(headTurnCurve.length-1);
      const i=Math.min(headTurnCurve.length-2,Math.floor(at));
      const fraction=blend(headTurnCurve[i],headTurnCurve[i+1],at-i);
      lockedYaw=fromYaw+shiftYaw*fraction;lockedPitch=fromPitch+shiftPitch*fraction;
      if(time>=shiftStart+shiftTime)shiftStart=-1;
    }
    for(let i=0;i<3&&!looking&&!tracking&&fold<.98;i++){
      const subject=i===2;
      if(subject&&(Math.abs(turn)>.06||focus>.28||fold>.05||Math.abs(s.climb??0)>.13))continue;
      const aim=i===0?s.gazeTarget:i===1?s.gazeLandmark:s.gazeSubject;
      if(!aim||!Number.isFinite(aim.x)||!Number.isFinite(aim.y)||!Number.isFinite(aim.z))continue;
      const offsetX=aim.x-gazeOrigin.x,offsetZ=aim.z-gazeOrigin.z,distance=Math.hypot(offsetX,offsetZ);
      const bearing=Math.atan2(-offsetX,-offsetZ);
      const offset=wrap(bearing-heading),elevation=Math.atan2(aim.y-gazeOrigin.y,distance);
      const landing=i===0&&s.gazeLanding,hold=lastAim===aim;
      const range=landing?Infinity:i===1?1800:130,arc=landing?1.38:i===1?1.12:.84;
      tracking=distance>.24&&distance<range*(hold?1.14:1)&&Math.abs(offset)<arc+(hold?.075:0)
        &&(landing||(Math.abs(elevation-path)<.68&&turn*offset<.28));
      if(tracking){
        desiredYaw=bearing;desiredPitch=elevation;lastAim=aim;watchingSubject=subject;
        scanEnds=0;scanAt=time+2.4;
      }
    }
    if(wasWatchingSubject&&!watchingSubject){shiftStart=-1;allowedShift=time;}
    wasWatchingSubject=watchingSubject;
    if(!tracking){
      const turnAngle=clamp(.63*bank-.30*turn,-.89,.89);
      lastAim=null;
      const commuting=Math.abs(turnAngle)<.15&&focus<.25&&fold<.2&&Math.abs(path)<.25&&!looking;
      if(commuting&&time>=scanAt){
        ++scanNumber;scanEnds=time+.53+.09*Math.sin(scanNumber*1.9);
        scanAt=time+4.8+1.37*Math.sin(scanNumber*2.4);
      }
      if(!commuting){scanEnds=0;scanAt=time+2.3;}
      const inspecting=time<scanEnds;
      const scan=inspecting?(scanNumber%2?1:-1)*(.39+.10*Math.sin(scanNumber*1.73)):0;
      desiredYaw=trackYaw+turnAngle+scan+looking*.98;
      desiredPitch=clamp(.74*path-.022-.12*Number(inspecting),-.88,.52);
    }
    const yawError=wrap(desiredYaw-lockedYaw),pitchError=desiredPitch-lockedPitch;
    if(shiftStart<0){
      if(time>=allowedShift&&(Math.abs(yawError)>.195||Math.abs(pitchError)>.103)){
        fromYaw=lockedYaw;fromPitch=lockedPitch;
        shiftYaw=clamp(yawError,-.44,.44);shiftPitch=clamp(pitchError,-.29,.29);
        shiftTime=.073+.026*smooth(.12,.46,Math.hypot(shiftYaw,shiftPitch));
        shiftStart=time;allowedShift=time+shiftTime+.12;
      }else if(tracking&&Math.abs(yawError)<.195&&Math.abs(pitchError)<.103){
        // Keep the perch in view as its bearing drifts, between reacquisitions.
        const follow=1-Math.exp(-21*step);
        lockedYaw+=yawError*follow;lockedPitch+=pitchError*follow;
      }
    }
    // Convert the desired nearly level world head into the moving thorax's
    // frame. This stabilizes a fixation even while bank and pitch change together.
    localHead.multiply(chest.quaternion).invert();
    worldHead.setFromEuler(headAngles.set(lockedPitch,lockedYaw,bank*.17,'YXZ'));
    headAngles.setFromQuaternion(localHead.multiply(worldHead),'YXZ');
    const yaw=blend(clamp(headAngles.y,-1.33,1.33),clamp(s.perchLook??0,-1.42,1.42),fold);
    const nod=blend(clamp(headAngles.x,s.gazeLanding?-1.19:-.72,.62),clamp((s.perchLookPitch??0)-chest.rotation.x,-.93,.52),fold);
    const roll=blend(clamp(headAngles.z,-.98,.98),0,fold);
    const settle=reset?1:1-Math.exp(-65*step),maxMotion=reset?Math.PI:8.6*step;
    neckPose.y+=clamp((yaw-neckPose.y)*settle,-maxMotion,maxMotion);
    neckPose.x+=clamp((nod-neckPose.x)*settle,-maxMotion,maxMotion);
    neckPose.z+=clamp((roll-neckPose.z)*settle,-maxMotion,maxMotion);
    // Share flexion along the cervical column. The upper nape turns with
    // the rigid cranium; the lower hackles stay in contact with the mantle.
    neckBase.rotation.set(neckPose.x*.37,neckPose.y*.36,neckPose.z*.29,'YXZ');
    neck.quaternion.copy(neckBase.quaternion).invert().multiply(neckOrientation.setFromEuler(neckPose));
  }
  const motion=window.makeEagleMotion?.(THREE,{object,chest,neckBase,neck,rudder,tailRays,wings,
    uniforms:{eyeLids,featherTurb,featherSlip,featherFluff}});
  function update(dt, time, flapping, pitch = 0, bank = 0, air = {}) {
    const step = clamp(dt, 0, .1);
    const approach = rate => 1 - Math.exp(-rate * step);
    const reset=gazeTime<0||time<gazeTime||(step===0&&air!==previousFlight)||lastPosition.distanceToSquared(gazeOrigin.set(air.x??0,air.y??0,air.z??0))>
      Math.max(9,(air.airspeed??18)*step*3+4)**2;
    previousFlight=air;
    if(reset){
      lastBank=bank;previousHeading=air.yaw??0;turnDemand=perchPivot=0;napeTwist.value.set(0,0);
      for(const wing of wings)wing.wristLoad=wing.tipLoad=0;
    }
    phase = Number.isFinite(air.phase) ? air.phase : (phase + step * 11.4) % (2 * Math.PI);
    const requestedEffort = Number.isFinite(air.effort) ? air.effort : (flapping ? 1 : 0);
    effort = reset?requestedEffort:effort+(requestedEffort-effort)*approach(9);
    const dive = Number.isFinite(air.tuck) ? air.tuck : smooth(.20, .68, -pitch);
    const desiredTuck=dive*(1-effort);
    tuck=reset?desiredTuck:tuck+(desiredTuck-tuck)*approach(3.6);
    const stall = clamp(air.stall || 0, 0, 1);
    const load = clamp((air.loadFactor ?? 1) - 1, -.6, 1.7);
    const rollRate = step > .0001 ? clamp((bank - lastBank) / step, -2.3, 2.3) : 0;
    lastBank = bank;
    turnDemand += (rollRate - turnDemand) * approach(5);
    const fold=clamp(air.perchFold||0,0,1),grip=clamp(air.perchGrip||0,0,1),flare=clamp(air.perchFlare||0,0,1);
    const folded=smooth(0,1,fold);
    for(const mesh of featherMeshes)mesh.morphTargetInfluences[0]=smooth(.40,.97,fold);
    // Projected span governs an opposing elbow/carpus linkage. The primaries
    // follow the upper arm through reversal as the wing unloads and opens.
    const extension=clamp(air.wingExtension??(1-.53*tuck),.38,1);
    const desiredSweep=Math.acos(extension);
    const brake=Math.max(clamp(air.brakeSpread||0,0,1),flare);
    if(reset){
      // A restart or landmark arrival starts a new flight in this same rig.
      armSweep=handSweep=desiredSweep;tailBrake=wingBrake=handBrake=brake;
    }else{
      armSweep+=(desiredSweep-armSweep)*approach(12);
      handSweep+=(armSweep-handSweep)*approach(9);
      tailBrake+=(brake-tailBrake)*approach(17);
      wingBrake+=(brake-wingBrake)*approach(11);
      handBrake+=(wingBrake-handBrake)*approach(8);
    }
    // The wrist comes forward before the hand opens during the pitch-up.
    // This briefly gives the planform an M between approach and full flare.
    const flareFlex=clamp((tailBrake-handBrake)*2.4,0,1);
    const rollTrim=clamp(air.turnTrim??(-turnDemand*.45),-1,1);
    const arrest=smooth(.15,.92,wingBrake);
    const speed=air.airspeed??17.5;
    const fixation=Math.max(tuck,arrest*.86,smooth(21,36,speed)*.75,stall*.5);
    const liftStroke=Math.cos(phase),drive=Math.sin(phase);
    const recovery=smooth(-.14,.95,-drive);
    const separation=Math.max(stall,arrest);
    separatedFlow.value=separation*(1-folded);
    const footPlant=smooth(.37,.95,grip);
    // Stand taller and carry the tail while shuffling around a cross-branch.
    const heading=air.yaw??0,yawChange=heading-(previousHeading??heading);
    previousHeading=heading;
    const yawSpeed=Math.abs(Math.atan2(Math.sin(yawChange),Math.cos(yawChange)))/Math.max(.001,step);
    const branchTurn=air.perchOnRock ? 0 : folded*footPlant*smooth(.3,1.9,yawSpeed);
    perchPivot+=(branchTurn-perchPivot)*approach(branchTurn>perchPivot?14:7);
    // The bird stands into the grip while the outer primaries pass its flanks.
    const gatheringWings=smooth(.34,.66,fold)*(1-smooth(.87,1,fold));
    const legSupport=footPlant*(.061*(1-folded)+.032*gatheringWings+.026*perchPivot);
    chest.position.y = -.008 * effort * liftStroke;
    chest.rotation.x = -.022 * effort * Math.cos(phase - .45);
    chest.position.y=blend(chest.position.y,.053+.002*Math.sin(time*2.2),folded)+legSupport*Math.cos(pitch);
    chest.position.z=-legSupport*Math.sin(pitch);
    chest.rotation.x=blend(chest.rotation.x+.11*flare,.64+.006*Math.sin(time*2.2),folded);
    for (const part of tuckedFeet)part.visible=grip<.18;
    // As the breast pitches up the feet keep reaching toward the perch. The
    // yaw belongs to the bird; the ankles counter the body's pitch and bank.
    if(footPlant>0){
      bodyTilt.setFromEuler(tiltAngles.set(pitch,0,bank,'YXZ')).invert();
      levelFeet.identity().slerp(bodyTilt,footPlant);
    }else levelFeet.identity();
    const compression=clamp(air.perchCompression??0,0,1)*footPlant;
    const stance=air.perchStep;
    const swing=stance?.moving ? Math.sin(Math.PI*clamp(stance.progress,0,1))**2 : 0;
    chest.position.x=0;
    chest.position.addScaledVector(bodyUp.set(0,1,0).applyQuaternion(levelFeet),-.038*compression);
    chest.rotation.x-=.15*compression;
    if(swing>0){
      // Unweight the moving foot. The breast stays over the one clasping the limb.
      weightShift.set(-stance.moving*.020,.007,0).applyQuaternion(levelFeet);
      chest.position.addScaledVector(weightShift,swing);
    }
    const closing=Math.max(smooth(.48,.96,fold),smooth(.90,1,grip));
    for(const foot of perchFeet){
      const {leg,ankle,toes,sign,hip}=foot;
      leg.visible=grip>.012;
      // Each planted claw holds its own compass bearing around the common
      // perch point, even as the breast yaws and the near wing folds.
      const footYaw=sign<0?stance?.leftYaw:stance?.rightYaw;
      const localYaw=Number.isFinite(footYaw)?wrap(footYaw-heading-(air.yawSlip??0)):0;
      stepRotation.setFromAxisAngle(standingAxis,localYaw).premultiply(levelFeet);
      const inSwing=stance?.moving===sign?swing:0;
      const seat=seatOnBranch(foot,stance,footYaw,air);
      leg.position.copy(hip).applyQuaternion(stepRotation).addScaledVector(bodyUp,seat+.050*inSwing);
      leg.rotation.set(blend(-1.78,0,smooth(.025,.96,grip)),0,sign*.10*Math.sin(grip*Math.PI));
      leg.quaternion.premultiply(stepRotation);
      ankle.rotation.x=.48*compression+.31*inSwing;
      if(leg.visible)foot.attachThigh(chest,leg);
      for(const toe of toes)toe.rotation.x=blend(-.33,0,closing)+.19*(1-grip)-.27*inSwing;
    }
    for(const wing of wings){
      const {sign,shoulder,elbow,wrist,fan,alula}=wing;
      // Pressure raises the arm first. The outer hand and primary shafts
      // follow it with successively longer time constants and twist to unload.
      const sideLoad=clamp((sign<0?air.wingLoadLeft:air.wingLoadRight)??0,-1,1)*(1-folded);
      wing.wristLoad+=(sideLoad-wing.wristLoad)*approach(19);
      wing.tipLoad+=(wing.wristLoad-wing.tipLoad)*approach(12);
      const wristLoad=wing.wristLoad,tipLoad=wing.tipLoad;
      featherLoads.value.setComponent(sign<0?0:1,tipLoad);
      const gustTuck=clamp(air.wingGustTuck??0,0,1)*(1-folded);
      const innerBank=clamp(-sign*bank,0,1);
      const roll=sign*rollTrim; // positive on the wing whose lift must fall
      const trim=.0014*Math.sin(time*1.73+sign*.82);
      const unloaded=Math.max(0,roll);
      const armLift=.047+trim+.053*load-.095*roll+.28*wingBrake+.245*sideLoad-.30*gustTuck;
      const humerusSweep=(.70+.18*tuck)*armSweep+.135*roll+.035*innerBank-.14*wingBrake-.19*flareFlex;
      shoulder.rotation.order=elbow.rotation.order=wrist.rotation.order='YZX';
      shoulder.rotation.z=sign*(armLift+effort*(.66*liftStroke-.067));
      shoulder.rotation.y=-sign*(humerusSweep+effort*(.12*recovery-.085*drive));
      shoulder.rotation.x=.23*wingBrake-.071*roll+effort*.10*drive-.19*gustTuck;
      elbow.rotation.z=sign*(-.055+.14*tuck+.12*load+.17*wingBrake+.105*wristLoad-.10*gustTuck+effort*.16*Math.cos(phase-.51));
      elbow.rotation.y=sign*((.22+.20*tuck)*armSweep-.16*innerBank-.13*unloaded+
        effort*(.23*recovery-.075*Math.max(0,drive)));
      // The outer hand feathers twist and lag. On recovery the wrist turns
      // back toward the tail, reducing area exposed during the upstroke.
      wrist.rotation.z=sign*(.025-.26*tuck+.105*load-.22*wingBrake+.155*tipLoad+
        effort*(.23*Math.cos(phase-.97)-.22*recovery));
      wrist.rotation.y=-sign*((1.02+.15*tuck)*handSweep+.18*unloaded+.04*innerBank+.52*flareFlex+
        effort*(.74*recovery-.045*Math.max(0,drive)));
      wrist.rotation.x=.10*wingBrake-.05*load-.064*roll-.145*tipLoad-.08*gustTuck-effort*(.27*recovery-.035*drive);
      alula.rotation.z=sign*(.48*separation)*(1-folded);
      alula.rotation.y=sign*(.43*separation)*(1-folded);
      const f=smooth(sign>0?.065:0,sign>0?.97:.91,fold);
      const armPose=closedRotation.get(shoulder),forearmPose=closedRotation.get(elbow),wristPose=closedRotation.get(wrist);
      shoulder.rotation.z=blend(shoulder.rotation.z,armPose.z,f);
      shoulder.rotation.y=blend(shoulder.rotation.y,armPose.y,f);
      shoulder.rotation.x=blend(shoulder.rotation.x,armPose.x,f);
      // A low ledge leaves no room to drop the primaries during the fold.
      // Carry them above the surface until they lie along the flanks.
      if(air.perchOnRock)shoulder.rotation.z+=sign*.22*footPlant*Math.sin(f*Math.PI);
      elbow.rotation.y=blend(elbow.rotation.y,forearmPose.y,f);
      elbow.rotation.z=blend(elbow.rotation.z,forearmPose.z,f);
      wrist.rotation.y=blend(wrist.rotation.y,wristPose.y,f);
      wrist.rotation.z=blend(wrist.rotation.z,wristPose.z,f);
      wrist.rotation.x=blend(wrist.rotation.x,wristPose.x,f);
      for (let i = 0; i < fan.length; i++) {
        const s = i / (fan.length - 1),fanPose=closedRotation.get(fan[i]);
        const fingerDelay=1.14+.35*s;
        const sweptLoad=Math.max(0.,tipLoad);
        const spread=.53*wingBrake+.16*stall+.19*effort*recovery-.29*tuck+.14*sweptLoad;
        const fingerTwist=(.16+.09*(1-s))*wingBrake-.19*effort*recovery-.10*tipLoad;
        fan[i].rotation.z=blend(sign*((.039-.077*s)*(1+.72*load)+
          (.5-s)*.24*wingBrake+(.05+.06*s)*tipLoad+.081*effort*Math.cos(phase-fingerDelay)),fanPose.z,f);
        fan[i].rotation.y=blend(sign*(.5-s)*spread,fanPose.y,f);
        fan[i].rotation.x=blend(fingerTwist*(1-.58*s),fanPose.x,f);
      }
    }
    // The tail photograph is already a partial fan. Overlap its vanes in
    // ordinary transit, then open the outer rectrices under yaw and braking.
    const slowStroke=effort*(1-.82*smooth(10,24,speed))*(1-.9*footPlant);
    // Wing-induced downwash arrives at the tail after the power stroke.
    // The outer rectrices spread and cup through that load, then overlap
    // again on recovery. At cruising speed far less area is needed.
    const wakePhase=phase-clamp(5.8/Math.max(5,speed),.16,.78);
    const wake=Math.sin(wakePhase);
    const spread=-.44+.32*smooth(.14,1.08,Math.abs(bank))+.21*Math.abs(rollTrim)+.27*stall+
      .095*effort+slowStroke*(.18+.23*wake)-.24*tuck;
    const tailFan=blend(clamp(spread+1.01*tailBrake,-.68,.65),-.04,folded)+(air.perchBalance||0)*.34;
    const cup=(.072*tailBrake+slowStroke*(.055+.072*wake))*(1-folded);
    for(const {side,ray} of tailRays){
      const outer=Math.abs(side);
      ray.rotation.y=side*tailFan;
      ray.rotation.z=side*cup;
      ray.rotation.x=outer*slowStroke*.065*Math.sin(wakePhase-outer*.36)*(1-folded);
    }
    rudder.rotation.y=blend(-.085*bank+.088*rollTrim,0,folded);
    rudder.rotation.x=.085*pitch+.045*(air.climb||0)+.08*stall+.08*Math.abs(rollTrim)-.18*slowStroke*wake;
    rudder.rotation.x=blend(rudder.rotation.x-.30*tailBrake,-.19,folded)-(air.perchBalance||0)*.12;
    // Long rectrices clear a ledge as the eagle loads its legs. From a tree
    // limb they can hang further below its feet as the breast rises.
    const tailDownLimit=air.perchOnRock ? .14+.14*folded-.11*compression : .56+.10*folded-.42*perchPivot;
    const tailDown=pitch+chest.rotation.x+rudder.rotation.x;
    rudder.rotation.x-=footPlant*Math.max(0,tailDown-tailDownLimit);
    rudder.rotation.z=blend(.22*bank+(air.tailTwist??-.12*rollTrim),0,folded);
    const priorYaw=neckPose.y;
    updateGaze(time,step,pitch,bank,fixation,folded,air,reset);
    featherTime.value=time;
    const airflow=clamp((air.airspeed || 17.5)/17.5,.4,2.3);
    featherWind.value+=(blend(airflow+.65*effort,.185,folded)*(.87+.13*Math.sin(time*1.37))-featherWind.value)*approach(5);
    const neckVelocity=step>.0001&&!reset?(neckPose.y-priorYaw)/step:0;
    napeTwist.value.x=neckPose.y;
    napeTwist.value.y+=(clamp(neckVelocity*.60,-1,1)-napeTwist.value.y)*approach(12);
    motion?.update(step,time,air,{folded,effort,tuck,stall,separation,reset});
  }
  return {object, update, motion};
};
