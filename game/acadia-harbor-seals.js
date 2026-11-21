// Atlantic harbor seals on the seaward side of Egg Rock. Terrain is surveyed.
// The location of each individual and its pose are a late-summer interpretation.
(() => {
  const ledge = [3996,-3868.5];
  const beds = [
    // x, z, length in metres, bearing from east toward south, coat, head lift, hind lift.
    [3995.63,-3868.15,1.67,2.62,1,.23,.36],
    [3997.97,-3870.23,1.53,1.92,2,.06,.14],
    [3994.24,-3871.02,1.76,-2.67,0,.15,.26],
    [3994.50,-3866.44,1.45,2.92,3,.27,.10]
  ];
  const smooth=(a,b,x)=>{const u=Math.max(0,Math.min(1,(x-a)/(b-a)));return u*u*(3-2*u);};
  const tau=Math.PI*2;

  function bodyGeometry(T,distant=false) {
    const xyz=[],uv=[],color=[],anatomy=[],triangles=[];
    const tones={};for(const [name,hex] of Object.entries({fur:0xffffff,fore:0xd0c6b6,hind:0x716b62,
      iris:0x27241f,pupil:0x171918,lid:0x6f6358,nose:0x51483f,nostril:0x2e2925,lip:0x6c5b52,
      whisker:0xb4aaa0,claw:0x9f907d,ear:0x655d54}))tones[name]=new T.Color(hex);
    function vertex(p,u,v,kind='fur',gloss=0){
      const i=xyz.length/3,ink=tones[kind];
      const skull=smooth(.45,.62,p[0]);
      xyz.push(p[0]-.066*smooth(.50,.74,p[0]),p[1]+.010*skull,p[2]*(1+.10*skull));color.push(ink.r,ink.g,ink.b);
      const neutral=!['fur','fore','hind'].includes(kind);
      uv.push(neutral?.5:.014+.972*u,neutral?.996:.98-.956*v);
      const head=smooth(.25,.49,p[0]),hind=1-smooth(-.61,-.32,p[0]);
      const breath=(1-smooth(.16,.57,Math.abs(p[0])))*smooth(.025,.29,p[1]);
      anatomy.push(head,hind,breath,gloss);
      return i;
    }
    function strip(rings,reverse=false){
      for(let i=1;i<rings.length;i++)for(let j=1;j<rings[i].length;j++){
        const a=rings[i-1][j-1],b=rings[i][j-1],c=rings[i][j],d=rings[i-1][j];
        if(reverse)triangles.push(a,b,d,b,c,d);else triangles.push(a,d,b,b,d,c);
      }
    }
    // Each section defines its horizontal and vertical radii independently.
    // The short skull and muzzle are continuous with the thorax.
    const stations=[
      [-.64,.136,.018,.036],[-.61,.134,.055,.063],[-.55,.139,.093,.090],
      [-.46,.151,.135,.121],[-.34,.165,.188,.154],[-.21,.185,.219,.180],
      [-.06,.208,.236,.208],[.08,.216,.232,.217],[.19,.221,.218,.223],
      [.29,.242,.184,.195],[.36,.276,.158,.162],[.425,.303,.150,.151],
      [.49,.330,.156,.150],[.55,.344,.146,.140],[.595,.337,.131,.119],
      [.635,.325,.111,.085],[.673,.322,.096,.068],[.703,.324,.071,.055],
      [.725,.328,.040,.037],[.735,.331,.010,.012]
    ];
    const shape=[],sides=distant?14:36;
    for(let i=0;i<stations.length;i++){
      const [x,cy,w,h]=stations[i],ring=[];
      for(let j=0;j<=sides;j++){
        const f=j/sides,angle=(f-.5)*tau,c=Math.cos(angle),s=Math.sin(angle);
        const cheek=1+.13*Math.exp(-(((x-.571)/.079)**2))*Math.max(0,-c);
        const yy=Math.max(.002,cy+h*c),zz=s*w*cheek*(1+.07*Math.max(0,-c));
        ring.push(vertex([x,yy,zz],(x+.64)/1.375,f));
      }
      shape.push(ring);
    }
    strip(shape);
    for(const end of [0,shape.length-1]){
      const row=shape[end],station=stations[end],center=vertex([station[0],station[1],0],end===0?0:1,.5);
      for(let k=0;k<row.length-1;k++){
        if(end===0)triangles.push(center,row[k+1],row[k]);
        else triangles.push(center,row[k],row[k+1]);
      }
    }
    // Closed ellipsoids for the lids, eyes, paired muzzle pads and nostrils.
    function oval(cx,cy,cz,rx,ry,rz,kind,gloss=0,lean=0){
      const rings=[];
      for(let i=0;i<=10;i++){
        const theta=i*Math.PI/10,dx=-Math.cos(theta),r=Math.max(.001,Math.sin(theta)),ring=[];
        for(let j=0;j<=16;j++){
          const angle=(j/16-.5)*tau,c=Math.cos(angle)*r,s=Math.sin(angle)*r;
          const y=ry*c,z=rz*s;
          const p=[cx+rx*dx,cy+y*Math.cos(lean)-z*Math.sin(lean),cz+y*Math.sin(lean)+z*Math.cos(lean)];
          ring.push(vertex(p,.86+.095*(dx+1)*.5,.51-.21*c,kind,gloss));
        }
        rings.push(ring);
      }
      strip(rings);
    }
    // Tubes taper into the photographed coat. Eye highlights come from the
    // lighting and the clear surface; there is no painted white highlight.
    function filament(points,radii,kind,gloss=0){
      const rings=[];
      for(let i=0;i<points.length;i++){
        const a=new T.Vector3(...points[Math.max(0,i-1)]),b=new T.Vector3(...points[Math.min(points.length-1,i+1)]);
        const axis=b.sub(a).normalize(),hint=new T.Vector3(0,1,0);
        if(Math.abs(axis.y)>.9)hint.set(0,0,1);
        const u=new T.Vector3().crossVectors(axis,hint).normalize(),v=new T.Vector3().crossVectors(u,axis);
        const ring=[];
        for(let j=0;j<=5;j++){
          const angle=j/5*tau,c=Math.cos(angle)*radii[i],s=Math.sin(angle)*radii[i];
          ring.push(vertex(points[i].map((n,k)=>n+c*u.getComponent(k)+s*v.getComponent(k)),.87,.6,kind,gloss));
        }
        rings.push(ring);
      }
      strip(rings,true);
    }
    for(const side of [-1,1]){
      if(!distant){
        oval(.561,.369,side*.131,.028,.021,.011,'lid',.12);
        oval(.568,.369,side*.138,.024,.017,.010,'iris',.83);
        oval(.573,.369,side*.144,.014,.012,.006,'pupil',.91);
        oval(.403,.335,side*.149,.010,.013,.006,'ear',.12);
        oval(.652,.314,side*.054,.069,.043,.055,'fur',.07);
        oval(.710,.350,side*.020,.021,.015,.020,'nose',.61,-side*.32);
        oval(.722,.354,side*.019,.009,.010,.004,'nostril',.50,side*.57);
        filament([[.727,.333,side*.003],[.704,.308,side*.019],[.674,.295,side*.062],[.633,.304,side*.092]],
          [.0019,.0023,.0018,.0009],'lip',.24);
        // Tapering rows of mystacial vibrissae on the two projecting pads.
        for(let i=0;i<14;i++){
          const row=i%3,col=Math.floor(i/3),x=.635+col*.012+.004*row;
          const y=.302+row*.010+.002*Math.cos(i),z=.101-.003*col;
          const sweep=.054+.032*(1-col/5),tip=.065+.057*(1-row/4)+.012*Math.sin(2.4*i);
          filament([[x,y,side*z],[x+.006,y+.004,side*(z+.029)],[x-sweep*.29,y-.003-row*.002,side*(z+tip*.66)],
            [x-sweep,y-.023+.012*Math.sin(2*i),side*(z+tip)]],[.00090,.00081,.00058,.00016],'whisker',.08);
        }
      }
      // Phocid foreflippers are short and clawed. Hind flippers trail together
      // behind the pelvis and cannot rotate beneath the body.
      for(const hind of [false,true]){
        const rings=[],sections=distant?5:16,wrap=distant?8:24;
        for(let i=0;i<=sections;i++){
          const u=i/sections,ring=[];
          for(let j=0;j<=wrap;j++){
            const a=(j/wrap-.5)*tau,ac=Math.cos(a),as=Math.sin(a);
            const web=1-smooth(.68,1,u);
            const width=hind?.032+.046*Math.sin(u*1.94):.021+.042*Math.sin(u*2.48);
            // The two outer hind digits are longer than the central three.
            // A rounded fingertip closes each web, including its lower side.
            const lobe=.032*Math.pow(Math.abs(as),1.55)-.006*Math.cos(as*12.6);
            const pad=Math.sqrt(Math.max(0,1-as*as));
            let x,y,z;
            if(hind){
              x=-.550-(.267+lobe+.016*pad)*u;
              z=side*(.027+.086*u+as*width);
              y=.132+.025*u+.044*u*u+ac*(.040*web+.0012)+.007*as*as*u;
            }else{
              x=.214-.198*u+as*width;
              z=side*(.154+(.208+.012*pad-.008*as*as)*u);
              y=.154*(1-u)*(1-u)+.019+.007*u+ac*(.030*web+.0013);
            }
            ring.push(vertex([x,y,z],.18+.52*u,.55+as*.19,hind?'hind':'fore',hind?.12:.05));
          }
          rings.push(ring);
        }
        strip(rings,side===1);
        const tip=rings[rings.length-1];
        for(let j=1;j<wrap-1;j++)triangles.push(tip[0],tip[j],tip[j+1]);
        if(!distant&&!hind)for(let j=0;j<5;j++){
          const x=.008+(j-2)*.018,z=.359+.006*Math.sin(j);
          filament([[x,.032,side*z],[x-.004,.029,side*(z+.012)],[x-.007,.027,side*(z+.016)]],
            [.0017,.0014,.0004],'claw',.12);
        }
      }
    }
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(xyz,3));
    g.setAttribute('color',new T.Float32BufferAttribute(color,3));
    g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    g.setAttribute('sealAnatomy',new T.Float32BufferAttribute(anatomy,4));
    g.setIndex(triangles);g.computeVertexNormals();g.computeBoundingSphere();
    return g;
  }
  function sealMaterial(T) {
    const map=new T.TextureLoader().load(window.aerieAssetURL?.('acadia-seal-pelts.webp')||'acadia-seal-pelts.webp');
    map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;
    const mat=new T.MeshStandardMaterial({map,vertexColors:true,roughness:.77,metalness:0});
    mat.name='Egg Rock · New England harbor seal pelts';
    mat.onBeforeCompile=shader=>{
      const pose=`
        attribute vec4 sealAnatomy;
        attribute vec4 sealMotion;
        attribute vec4 sealCoat;
        varying float sealSheen,sealWaterline;
        vec3 rotateSeal(vec3 p, float lift, float yaw) {
          float c=cos(lift),s=sin(lift);
          p.xy=mat2(c,s,-s,c)*p.xy;
          c=cos(yaw);s=sin(yaw);
          p.xz=mat2(c,s,-s,c)*p.xz;
          return p;
        }
      `;
      shader.vertexShader=pose+shader.vertexShader
        .replace('#include <uv_vertex>',`#include <uv_vertex>
          vMapUv=(vMapUv+vec2(mod(sealCoat.x,2.),1.-floor(sealCoat.x*.5)))*.5;`)
        .replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
          objectNormal=rotateSeal(objectNormal,sealAnatomy.x*sealMotion.x-sealAnatomy.y*sealMotion.z,
            sealAnatomy.x*sealMotion.y+sealAnatomy.y*sealCoat.y);`)
        .replace('#include <begin_vertex>',`#include <begin_vertex>
          vec3 neckBase=vec3(.285,.238,0.),hindBase=vec3(-.38,.142,0.);
          vec3 p=rotateSeal(transformed-neckBase,sealAnatomy.x*sealMotion.x,sealAnatomy.x*sealMotion.y)+neckBase;
          transformed=rotateSeal(p-hindBase,-sealAnatomy.y*sealMotion.z,sealAnatomy.y*sealCoat.y)+hindBase;
          transformed.y+=sealAnatomy.z*sealMotion.w;
          sealSheen=max(sealAnatomy.w,sealCoat.z);
          sealWaterline=sealCoat.z>.7?(modelMatrix*instanceMatrix*vec4(transformed,1.)).y-sealCoat.w:90.;`);
      shader.fragmentShader='varying float sealSheen,sealWaterline;\n'+shader.fragmentShader
        .replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
          if(sealWaterline<-.012)discard;`)
        .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
          roughnessFactor=mix(roughnessFactor,.20,sealSheen);
          diffuseColor.rgb*=1.-.24*sealSheen;`)
        // The island terrain uses a local open-sky irradiance estimate above
        // the tidal bed. Give the fur the same cool sky and a darker underside.
        .replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
          vec3 coastNormal=inverseTransformDirection(normal,viewMatrix);
          float openSky=.38+.62*max(coastNormal.y,0.);
          reflectedLight.indirectDiffuse+=diffuseColor.rgb*vec3(.092,.119,.153)*openSky;
          float wetRim=pow(1.-max(0.,dot(normal,normalize(vViewPosition))),3.)*sealSheen;
          reflectedLight.indirectSpecular+=vec3(.012,.020,.028)*openSky*wetRim;`);
    };
    mat.customProgramCacheKey=()=> 'acadia-harbor-seal-v1';
    return mat;
  }

  window.makeAcadiaHarborSeals=function makeAcadiaHarborSeals(T,scene,world,waterAt,ripple){
    const island=window.aerieRegionalLandforms?.get('eggrock');
    if(!island)return null;
    const surface=island.surfacePatch(ledge[0],ledge[1],32,world.elevation);
    const count=beds.length+1,actors=beds.map(([x,z,length,heading,coat,head,hind],i)=>{
      const y=surface(x,z);
      if(!Number.isFinite(y)||y<.42||y>2.7)return null;
      const slopeX=(surface(x+.42,z)-surface(x-.42,z))/.84;
      const slopeZ=(surface(x,z+.42)-surface(x,z-.42))/.84;
      return {id:'harbor-seal',skin:'harbor-seal',name:'Harbor seal',kind:'Mammal',residentId:'acadia/egg-rock/ledge/'+i,
        x,y:y+.20*length/1.62,z,baseY:y+.004,length,heading,coat,head,hind,slopeX,slopeZ,waryUntil:-Infinity,
        seed:1.37+i*2.24,behavior:'hauled out'};
    }).filter(Boolean);
    if(!actors.length)return null;
    world.eggRockSealShelf=surface;
    const swimmer={id:'harbor-seal',skin:'harbor-seal',name:'Harbor seal',kind:'Mammal',residentId:'acadia/egg-rock/channel/0',
      x:3981,y:0,z:-3865,length:1.62,heading:0,seed:3.28,coat:3,behavior:'surfacing'};
    const group=new T.Group();group.name='Egg Rock · harbor seal haul-out';
    scene.add(group);group.visible=false;
    const g=bodyGeometry(T);
    const poses=new T.InstancedBufferAttribute(new Float32Array(count*4),4).setUsage(T.DynamicDrawUsage);
    const coats=new T.InstancedBufferAttribute(new Float32Array(count*4),4).setUsage(T.DynamicDrawUsage);
    g.setAttribute('sealMotion',poses);g.setAttribute('sealCoat',coats);
    const body=new T.InstancedMesh(g,sealMaterial(T),count);
    body.name='Egg Rock · harbor seals';body.userData.prepareFlightMaterial=true;body.frustumCulled=false;body.instanceMatrix.setUsage(T.DynamicDrawUsage);group.add(body);
    // The same silhouette and instance transforms serve both distances. At
    // 80 m individual vibrissae, eye rims and toes cover less than a pixel.
    const coarse=bodyGeometry(T,true);
    coarse.setAttribute('sealMotion',poses);coarse.setAttribute('sealCoat',coats);
    const distant=new T.InstancedMesh(coarse,body.material,count);
    distant.name='Egg Rock · distant harbor seals';distant.instanceMatrix=body.instanceMatrix;
    distant.frustumCulled=false;group.add(distant);
    const footprint=new T.PlaneGeometry(1,1);footprint.rotateX(-Math.PI/2);
    const occlusion=new T.ShaderMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,
      vertexShader:'varying vec2 st; void main(){st=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
      fragmentShader:`varying vec2 st;void main(){float r=length((st-.5)*2.);float shadow=(1.-smoothstep(.36,1.,r))*.30;
        gl_FragColor=vec4(.012,.019,.021,shadow);}`});
    const pads=new T.InstancedMesh(footprint,occlusion,actors.length);pads.frustumCulled=false;pads.renderOrder=2;
    pads.name='Egg Rock · contact under resting seals';group.add(pads);
    const along=new T.Vector3(),up=new T.Vector3(),across=new T.Vector3(),matrix=new T.Matrix4(),size=new T.Vector3();
    const resting=actors.map((a,i)=>{
      const dx=Math.cos(a.heading),dz=Math.sin(a.heading);
      up.set(-a.slopeX,1,-a.slopeZ).normalize();
      along.set(dx,dx*a.slopeX+dz*a.slopeZ,dz).normalize();
      across.crossVectors(along,up).normalize();
      const unit=a.length/1.62;
      matrix.makeBasis(along,up,across).scale(size.setScalar(unit)).setPosition(a.x,a.baseY,a.z);
      const pose=matrix.clone();
      matrix.makeBasis(along,up,across).scale(size.set(1.26*unit,1,.59*unit)).setPosition(a.x,a.baseY+.013,a.z);
      pads.setMatrixAt(i,matrix);return pose;
    });
    const wakeSurface=new T.PlaneGeometry(1.72,.91);wakeSurface.rotateX(-Math.PI/2);
    const wakeMaterial=new T.ShaderMaterial({
      transparent:true,depthWrite:false,uniforms:{sealTrail:{value:0},sealClock:{value:0}},
      vertexShader:'varying vec2 st;void main(){st=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`varying vec2 st;uniform float sealTrail,sealClock;
        void main(){float aft=1.-st.x,side=abs(st.y-.5);
          float bow=side-(.034+.235*aft+.020*sin(aft*10.-sealClock*1.6)*aft);
          float width=.012+.012*aft;
          float trough=1.-smoothstep(.0,.014+width,abs(bow-.018));
          float ridge=1.-smoothstep(.0,width,abs(bow));
          float envelope=smoothstep(.02,.16,aft)*(1.-smoothstep(.44,.99,aft));
          gl_FragColor=vec4(mix(vec3(.025,.044,.053),vec3(.26,.33,.35),ridge),
            (trough*.18+ridge*.35)*envelope*sealTrail);}`
    });
    const wake=new T.Mesh(wakeSurface,wakeMaterial);wake.name='Egg Rock · swimming seal bow wake';wake.renderOrder=6;group.add(wake);
    const present=[],swimTransform=new T.Object3D(),surfaceHead=new T.Vector3();
    const explore={name:'Egg Rock harbor seals',x:ledge[0],z:ledge[1],discoveryRadius:42,
      approach:[4040,-3941,3994,-3867,10,0,7]};
    world.landmarks.push(explore);
    let previous=-Infinity,previouslySurfaced=false;
    function update(player,t){
      present.length=0;
      const distance=Math.hypot(player.x-ledge[0],player.y-1,player.z-ledge[1]);
      if(distance>410){
        if(group.visible)for(const a of actors)a.waryUntil=-Infinity;
        group.visible=false;previous=-Infinity;previouslySurfaced=false;return present;
      }
      group.visible=true;body.visible=distance<(body.visible?84:68);distant.visible=!body.visible;
      const reset=t<previous,continuous=t>=previous&&t-previous<.35;
      let slot=0;
      for(const [i,a] of actors.entries()){
        if(reset)a.waryUntil=-Infinity;
        const dx=player.x-a.x,dz=player.z-a.z;
        if(Math.hypot(dx,dz)<7.8&&player.y-a.y<6.5)a.waryUntil=t+1.8;
        const wary=smooth(-.4,1.5,a.waryUntil-t);
        const angle=Math.atan2(dz,dx)-a.heading,look=Math.atan2(Math.sin(angle),Math.cos(angle));
        const glance=Math.sin(t*.30+a.seed)+Math.sin(t*.071+a.seed*.71);
        poses.setXYZW(slot,a.head+.024*Math.sin(t*.80+a.seed)+wary*.17,.07*glance+wary*Math.max(-.42,Math.min(.42,look)),
          a.hind+.042*Math.sin(t*.51+a.seed),.012*(.5+.5*Math.sin(t*.95+a.seed)));
        coats.setXYZW(slot,a.coat,.024*Math.sin(t*.63+a.seed),.04+(i%2)*.10,0);
        body.setMatrixAt(slot,resting[i]);a.behavior=wary>.55?'watching':'hauled out';
        present.push(a);slot++;
      }
      // A breath consists of the head alone surfacing, steady travel through
      // the channel, and a smooth dive. The hind flippers supply lateral thrust.
      const phase=(t+3.6)%28,immersion=1-smooth(0,2.3,phase)+smooth(10.7,13.1,phase);
      const path=t*.091+.35,x=3979.3+4.65*Math.cos(path),z=-3866.3+2.6*Math.sin(path);
      const heading=Math.atan2(2.6*Math.cos(path),-4.65*Math.sin(path));
      const level=waterAt(x,z,t);
      let surfaced=false;wake.visible=false;
      if(Number.isFinite(level)){
        const heave=.024*Math.sin(t*1.36+1.9)+.011*Math.sin(t*2.26);
        const c=Math.cos(heading),s=Math.sin(heading),ahead=waterAt(x+.5*c,z+.5*s,t),behind=waterAt(x-.5*c,z-.5*s,t);
        const swellPitch=Number.isFinite(ahead)&&Number.isFinite(behind)?Math.atan(ahead-behind):0;
        const pitch=.72-.65*immersion+swellPitch*(1.-immersion),rootY=level-.425-1.18*immersion+heave;
        swimTransform.rotation.order='YXZ';
        // Body +X follows the route. Local Z rotation raises its muzzle.
        swimTransform.rotation.set(0,-heading,pitch,'YXZ');swimTransform.position.set(x,rootY,z);
        swimTransform.updateMatrix();
        surfaceHead.set(.54,.38,0).applyMatrix4(swimTransform.matrix);
        swimmer.x=surfaceHead.x;swimmer.y=surfaceHead.y;swimmer.z=surfaceHead.z;swimmer.heading=heading;
        const muzzleWater=waterAt(surfaceHead.x,surfaceHead.z,t);
        const headLevel=Number.isFinite(muzzleWater)?muzzleWater:level;
        surfaced=surfaceHead.y>headLevel+.043;
        swimmer.behavior=surfaced?'surfacing':'diving';
        if(surfaceHead.y>headLevel-.22){
          poses.setXYZW(slot,.04,.08*Math.sin(t*.56),.025,.004*Math.sin(t*.78));
          coats.setXYZW(slot,swimmer.coat,.15*Math.sin(t*2.55),.88,level+heave*.20);
          body.setMatrixAt(slot,swimTransform.matrix);slot++;
        }
        if(surfaced){
          const wx=swimmer.x-.72*c,wz=swimmer.z-.72*s;
          const wakeLevel=waterAt(wx,wz,t),sideLevel=waterAt(wx-.44*s,wz+.44*c,t);
          wake.visible=Number.isFinite(wakeLevel);
          wake.position.set(wx,(wake.visible?wakeLevel:level)+.033,wz);
          const roll=wake.visible&&Number.isFinite(sideLevel)?-Math.atan((sideLevel-wakeLevel)/.44):0;
          wake.rotation.set(roll,-heading,swellPitch,'YXZ');wakeMaterial.uniforms.sealClock.value=t;
          wakeMaterial.uniforms.sealTrail.value=smooth(.04,.18,surfaceHead.y-headLevel);
          present.push(swimmer);
          if(!previouslySurfaced&&continuous)ripple(swimmer,t,.20);
        }
      }
      previouslySurfaced=surfaced;previous=t;body.count=distant.count=slot;
      poses.needsUpdate=true;coats.needsUpdate=true;body.instanceMatrix.needsUpdate=true;
      return present;
    }
    return {update,contains:(x,z)=>Math.hypot(x-ledge[0],z-ledge[1])<115};
  };
})();
