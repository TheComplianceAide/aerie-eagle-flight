(() => {
  'use strict';

  window.addSurryDam = function (THREE, scene, {survey, elevation, ground=elevation, terrain, texture, sun, sky, clock, aerial, half}) {
    // Crest coordinates trace the USGS terrain and USDA orthophoto.
    const west = [-1070, -2635], east = [-525, -2592];
    const length = Math.hypot(east[0]-west[0], east[1]-west[1]);
    const dx = (east[0]-west[0])/length, dz = (east[1]-west[1])/length;
    const at = (along, across) => [west[0]+along*dx-across*dz, west[1]+along*dz+across*dx];
    const station = (x,z) => {
      const px=x-west[0], pz=z-west[1];
      return [px*dx+pz*dz, pz*dx-px*dz];
    };
    const earlyRoad = (x,z) => elevation(x,z)+.33;
    const crestDeck = (x,z) => Math.max(172.83,earlyRoad(x,z));
    const colorMap = (file, repeat=true) => {
      const map = texture(file, repeat);
      map.colorSpace = THREE.SRGBColorSpace;
      return map;
    };
    const riprap = texture('surry-armor-bed.webp',true);
    terrain.uniforms.damRiprap = {value:riprap};
    terrain.uniforms.damOrigin = {value:new THREE.Vector2(...west)};
    terrain.uniforms.damAxis = {value:new THREE.Vector2(dx,dz)};
    terrain.fragmentShader = 'uniform sampler2D damRiprap;uniform vec2 damOrigin,damAxis;\n'+terrain.fragmentShader.replace(
      'float bedding=desert*(1.-veg);',
      `vec2 da=xz-damOrigin;
        float along=dot(da,damAxis),across=dot(da,vec2(-damAxis.y,damAxis.x));
        float taper=mix(31.,66.,smoothstep(8.,118.,min(along,545.-along)));
        float armorUp=1.-smoothstep(taper-4.,taper+6.,-across);
        float armorDown=1.-smoothstep(taper+18.,taper+26.,across);
        float rocks=smoothstep(-8.,36.,along)*(1.-smoothstep(479.,546.,along))*armorUp*armorDown*smoothstep(2.,6.,abs(across));
        veg*=1.-rocks*.99;
        dense*=1.-rocks;
        float bedding=desert*(1.-veg);`);

    terrain.fragmentShader=terrain.fragmentShader.replace('/* canopy transmission */',`
      // Quarry blocks at the crest grade down into smaller angular spalls along
      // the pool. Both scales come from a measured 1.8 m aggregate scan.
      float armor=rocks*(1.-smoothstep(320.,1100.,d));
      if(armor>.002){
        vec2 slopeMeters=vec2(along,across*1.07);
        float closeToCrest=1.-smoothstep(10.,42.,abs(across));
        vec2 coarse=slopeMeters*.22;
        vec2 fine=mat2(.80,-.60,.60,.80)*slopeMeters*.48+vec2(.27,.42);
        float seam=.5+.24*sin(along*.19+across*.35)+.15*cos(across*.41-along*.10);
        float coarseWeight=smoothstep(.19,.86,closeToCrest*.71+seam*.50);
        vec3 aggregate=mix(texture2D(damRiprap,fine).rgb,texture2D(damRiprap,coarse).rgb,coarseWeight);
        float damp=(1.-smoothstep(.06,1.6,wp.y-shoreLevel))*step(across,0.);
        vec3 field=pow(aggregate*(1.-.21*damp),vec3(2.2))*(ambient+direct)*(1.+.22*relief);
        c=mix(c,field,armor*.98);
      }
      /* canopy transmission */`);
    const material = (opts) => new THREE.MeshStandardMaterial({roughness:.88,...opts});
    const roadTex = colorMap('lakeside-roof.webp');
    const pavement=colorMap('keene-asphalt.webp');
    const roadMat = material({color:0xb4afa6,map:pavement,bumpMap:pavement,bumpScale:.012,roughness:.94});
    const shoulder = material({color:0xa7a6a0,map:colorMap('surry-riprap.webp')});
    const concrete = material({color:0xb4b4ac,map:colorMap('shore-stone.webp'),roughness:.94});
    const granite = material({color:0xb6afa1,map:colorMap('shore-stone.webp'),roughness:.94});
    const roofMat = material({color:0x67675f,map:roadTex,roughness:.89});
    const rails = material({color:0x9b9f9f,metalness:.47,roughness:.39});
    const weathered = material({color:0x53534c,metalness:.28,roughness:.68});
    const glass = material({color:0x384449,roughness:.28,metalness:.18});
    const white = material({color:0xc8c3b2,roughness:.71});
    roofMat.bumpMap=roadTex;roofMat.bumpScale=.050;
    granite.bumpMap=granite.map;granite.bumpScale=.055;
    scene.userData.buildingLight.finish(roofMat,'slate',2.65);roofMat.color.setHex(0xa09f9b);
    scene.userData.buildingLight.glaze(glass,1,'gatehouse');

    function strip(a0,a1,b0,b1,mat,heightAt,repeat) {
      const steps = Math.ceil((a1-a0)/3);
      const positions=[],uv=[],indices=[];
      for(let i=0;i<=steps;i++){
        const t=i/steps,s=a0+(a1-a0)*t;
        for(const a of [b0,b1]){
          const [x,z]=at(s,a);
          positions.push(x,heightAt(x,z),z);uv.push(s/repeat,a/repeat);
        }
        if(i<steps){const k=2*i;indices.push(k,k+1,k+2,k+1,k+3,k+2);}
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
      geometry.setIndex(indices);geometry.computeVertexNormals();
      scene.add(new THREE.Mesh(geometry,mat));
    }
    strip(0,length,-5.4,5.4,shoulder,crestDeck,3.8);
    strip(0,length,-2.45,2.45,roadMat,(x,z)=>crestDeck(x,z)+.015,4.4);

    const dummy=new THREE.Object3D();
    const gap=3.9,total=Math.ceil(length/gap);
    const railPosts=new THREE.InstancedMesh(new THREE.BoxGeometry(.11,1.03,.18),weathered,2*total);
    // Folded W-beam galvanised rails show a bright upper lip and a
    // darker middle web, especially in the long view along the crest.
    const railShape=[[-.157,0],[-.12,.042],[-.078,.065],[-.018,.012],[.018,.012],[.078,.065],[.12,.042],[.157,0]];
    const railPositions=[],railIndices=[];
    for(let i=0;i<railShape.length;i++){
      const [y,z]=railShape[i];
      railPositions.push(-gap*.505,y,z,gap*.505,y,z);
      if(i){const k=2*i;railIndices.push(k-2,k-1,k,k,k-1,k+1);}
    }
    const beamGeometry=new THREE.BufferGeometry();
    beamGeometry.setAttribute('position',new THREE.Float32BufferAttribute(railPositions,3));
    beamGeometry.setIndex(railIndices);beamGeometry.computeVertexNormals();
    const sheet=rails.clone();sheet.side=THREE.DoubleSide;sheet.color.setHex(0xc0c7c6);sheet.metalness=.28;sheet.roughness=.52;
    const beams=new THREE.InstancedMesh(beamGeometry,sheet,2*total);
    for(let side=0;side<2;side++)for(let i=0;i<total;i++){
      const off=side===0?-3.55:3.55, along=Math.min(length-.2,i*gap+.15);
      const [x,z]=at(along,off), [bx,bz]=at(Math.min(length-.7,along+gap*.5),off);
      dummy.rotation.set(0,-Math.atan2(dz,dx),0);
      dummy.position.set(x,crestDeck(x,z)+.45,z);dummy.updateMatrix();
      railPosts.setMatrixAt(side*total+i,dummy.matrix);
      dummy.rotation.y+=side===0?0:Math.PI;
      dummy.position.set(bx,crestDeck(bx,bz)+.66,bz);dummy.updateMatrix();
      beams.setMatrixAt(side*total+i,dummy.matrix);
    }
    scene.add(railPosts,beams);

    function box(parent,mat,sx,sy,sz,x,y,z) {
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),mat);
      mesh.position.set(x,y,z);parent.add(mesh);
      return mesh;
    }
    function gable(parent,w,d,eave,ridge){
      const outline=new THREE.Shape();
      outline.moveTo(-w/2,0);outline.lineTo(w/2,0);outline.lineTo(0,ridge-eave);outline.closePath();
      const geometry=new THREE.ExtrudeGeometry(outline,{depth:d,bevelEnabled:false});
      geometry.translate(0,eave,-d/2);
      const infill=new THREE.Mesh(geometry,granite);parent.add(infill);
      const slope=Math.atan2(ridge-eave,w/2);
      const sheet=Math.hypot(w/2,ridge-eave)+.47;
      for(const direction of [-1,1]){
        const roof=box(parent,roofMat,sheet,.16,d+.64,w*.25*direction,(ridge+eave)/2,0);
        roof.rotation.z=-slope*direction;
      }
    }
    const gateX=-1059,gateZ=-2645,gateBase=172.65;
    const gate=new THREE.Group();
    gate.position.set(gateX,gateBase,gateZ);
    gate.rotation.y=-Math.atan2(dz,dx);
    scene.add(gate);
    box(gate,concrete,9.1,6.3,7.2,0,-3.02,0);
    box(gate,granite,7.65,3.9,6.12,0,1.95,0);
    gable(gate,7.65,6.12,3.9,5.72);
    box(gate,white,1.17,2.30,.10,.25,1.26,3.09);
    box(gate,weathered,.94,2.10,.12,.25,1.16,3.16);
    box(gate,concrete,1.7,.32,.88,.25,.09,3.45);
    for(const side of [-1,1])for(const wx of [-2.53,2.52]){
      box(gate,white,.93,1.13,.10,wx,2.41,3.09*side);
      box(gate,glass,.70,.89,.11,wx,2.41,3.15*side);
      box(gate,white,.05,.91,.12,wx,2.41,3.22*side);
    }
    box(gate,granite,.66,1.78,.78,2.40,4.68,-1.15);
    box(gate,weathered,.73,.08,.87,2.40,5.57,-1.15);
    for(const side of [-1,1]){
      box(gate,weathered,.13,.20,6.8,side*4.05,3.85,0);
      box(gate,weathered,.12,3.60,.12,side*3.89,1.83,-2.65);
      for(const wx of [-2.53,2.52]){
        box(gate,white,1.12,.13,.32,wx,1.81,3.12*side);
        box(gate,granite,1.12,.21,.22,wx,3.05,3.13*side);
        box(gate,white,.77,.046,.075,wx,2.44,3.24*side);
      }
      for(const q of [-1,1]){
        const length=Math.hypot(4.05,1.82),trim=box(gate,white,length,.125,.13,side*2.02,4.79,q*3.42);
        trim.rotation.z=-Math.atan2(1.82,4.05)*side;
      }
    }
    box(gate,weathered,.24,.115,6.81,0,5.79,0);
    const spillway = survey.spillway||[[-1077,-2659],[-1083,-2741],[-1097,-2742]];
    const weirTop=167.7;
    for(let i=1;i<spillway.length;i++){
      const [ax,az]=spillway[i-1], [bx,bz]=spillway[i];
      const span=Math.hypot(bx-ax,bz-az), x=(ax+bx)*.5, z=(az+bz)*.5;
      const floor=Math.min(weirTop-1.3,elevation(x,z)-.23),top=weirTop-floor;
      const wall=box(scene,concrete,span+.4,top,1.13,x,floor+top/2,z);
      wall.rotation.y=-Math.atan2(bz-az,bx-ax);
      const coping=box(scene,white,span+.2,.19,1.26,x,weirTop,z);coping.rotation.copy(wall.rotation);
    }
    const westBridge=[[-1118,-2573],[-1069,-2626]], bridgeSpan=Math.hypot(49,53);
    const bridge=new THREE.Group();
    bridge.position.set(-1093.5,172.34,-2599.5);
    bridge.rotation.y=Math.atan2(53,49);
    scene.add(bridge);
    box(bridge,concrete,bridgeSpan,.66,5.05,0,-.22,0);
    box(bridge,roadMat,bridgeSpan,.095,4.69,0,.16,0);
    for(const offset of [-2.34,2.34]){
      box(bridge,rails,bridgeSpan,.22,.12,0,.80,offset);
      for(let p=-34;p<=35;p+=3.7)box(bridge,weathered,.095,.67,.14,p,.43,offset);
    }
    for(const t of [.21,.45,.68,.88]){
      const x=westBridge[0][0]+49*t,z=westBridge[0][1]-53*t;
      const y=elevation(x,z), rise=171.9-y;
      if(rise>.3)box(bridge,concrete,1.48,rise,3.4,(t-.5)*bridgeSpan,-.42-rise/2,0);
    }

    let seed=664177;
    const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
    // The upper edge is packed with large split slabs. Across the rest of the
    // dam the survey photographs show a finer, flatter grade of stone.
    const blockMap=colorMap('surry-block-surface.webp');
    const blockMaterial=material({map:blockMap,bumpMap:blockMap,bumpScale:.034,vertexColors:true});
    const profiles=[
      [[-1,-.52],[-.58,-.90],[.65,-.83],[1,-.16],[.66,.64],[-.79,.72]],
      [[-.91,-.77],[.59,-.80],[1,-.23],[.85,.55],[-.54,.79],[-.98,.31]],
      [[-.97,-.34],[-.47,-.79],[.41,-.61],[.99,.10],[.52,.69],[-.77,.53]],
      [[-.80,-.83],[.74,-.66],[.96,.34],[.43,.66],[-.94,.50]],
      [[-.96,-.62],[.37,-.83],[.99,-.31],[.61,.74],[-.47,.86],[-.90,.24]],
      [[-.99,-.18],[-.65,-.58],[.69,-.63],[.96,-.05],[.53,.52],[-.72,.56]]
    ];
    function splitBlock(outline,variant){
      const points=[],uv=[],normals=[],colors=[];
      const heel=new THREE.Vector3(0,-.86,0),lip=[],cap=[];
      const normal=new THREE.Vector3(),edge=new THREE.Vector3();
      const topSlope=.13*Math.sin(variant*1.7+1.);
      for(let i=0;i<outline.length;i++){
        const [x,z]=outline[i],corner=.70+.24*random();
        lip.push(new THREE.Vector3(x,.08+.30*random(),z));
        const crownX=x*corner+.06,crownZ=z*corner-.055;
        cap.push(new THREE.Vector3(crownX,.49+topSlope*crownX+.085*crownZ,crownZ));
      }
      function face(a,b,c,light){
        normal.copy(b).sub(a).cross(edge.copy(c).sub(a)).normalize();
        const vertical=Math.abs(normal.y)>.73,alongX=Math.abs(normal.z)>Math.abs(normal.x);
        for(const p of [a,b,c]){
          points.push(p.x,p.y,p.z);normals.push(normal.x,normal.y,normal.z);
          const u=vertical||alongX?p.x:p.z,v=vertical?p.z:p.y;
          uv.push(variant*.27+u*.54,variant*.41+v*.54);
          const exposure=light*(.76+.24*THREE.MathUtils.smoothstep(p.y,-.48,.32));
          colors.push(exposure,exposure,exposure);
        }
      }
      for(let i=0;i<outline.length;i++){
        const j=(i+1)%outline.length,side=.88+.12*random();
        face(heel,lip[i],lip[j],side);
        face(lip[i],cap[i],lip[j],side);face(lip[j],cap[i],cap[j],side);
        if(i>0&&j>0)face(cap[0],cap[j],cap[i],1);
      }
      const geometry=new THREE.BufferGeometry();
      for(const [field,values,n] of [['position',points,3],['normal',normals,3],['uv',uv,2],['color',colors,3]])
        geometry.setAttribute(field,new THREE.Float32BufferAttribute(values,n));
      geometry.userData.cap=cap;
      return geometry;
    }
    const matrices=profiles.map(()=>[]),tones=profiles.map(()=>[]);
    const up=new THREE.Vector3(0,1,0),localUp=new THREE.Vector3(),twist=new THREE.Quaternion();
    const tint=new THREE.Color(),tau=2*Math.PI;
    for(const side of [-1,1]){
      // A reservoir-side line of armor follows the rail shoulder. Fill around
      // it with progressively wider, jittered cells to avoid parallel rows.
      let band=0;
      for(let off=6.1;off<(side<0?58:70);){
        const upper=side<0?Math.exp(-((off-9)**2)/131):.38*Math.exp(-((off-10)**2)/140);
        const spacing=1.09+(1-upper)*1.03;
        for(let along=10+random()*spacing;along<length-10;along+=spacing){
          const s=along+(random()-.5)*spacing*.89;
          const endFade=Math.min(1,s/93,(length-s)/94);
          const width=(side<0?58:70)*endFade;
          const across=side*(off+(random()-.5)*spacing*.88+.55*Math.sin(s*.083+band*.56));
          if(Math.abs(across)>width||random()<(side<0?.10:.32))continue;
          const [x,z]=at(s,across),y=ground(x,z);
          const variation=Math.sin(s*.15+off*.19)*Math.cos(off*.31-s*.052)*.5+.5;
          const grade=1-THREE.MathUtils.smoothstep(off,17,57);
          const radius=(.23+grade*.14+upper*.28+.19*variation)*(.69+random()*.78);
          const shape=Math.floor(random()*profiles.length);
          dummy.position.set(x,y+.045*radius,z);
          const slope=side<0?.36:-.37;
          localUp.set(dz*slope+(random()-.5)*.34,1,-dx*slope+(random()-.5)*.30).normalize();
          dummy.quaternion.setFromUnitVectors(up,localUp).multiply(twist.setFromAxisAngle(up,random()*tau));
          dummy.scale.set(radius*(1.+random()*.49),radius*(.64+.42*random()),radius*(.68+random()*.43));
          dummy.updateMatrix();matrices[shape].push(dummy.matrix.clone());
          const tone=.61+random()*.39,warm=(random()-.5)*.10;
          tint.setRGB(tone*(1+warm),tone*(1+warm*.17),tone*(1-warm));tones[shape].push(tint.clone());
        }
        off+=spacing*.76;band++;
      }
    }
    const capCells=new Map(),capCell=(x,z)=>Math.floor(x/8)*4096+Math.floor(z/8);
    const blockCells=new Map(),landings=[];
    profiles.forEach((outline,i)=>{
      const blocks=new THREE.InstancedMesh(splitBlock(outline,i),blockMaterial,matrices[i].length);
      blocks.name='Surry graded quarry armor '+(i+1);
      const crown=blocks.geometry.userData.cap,center=new THREE.Vector3(),n=new THREE.Vector3();
      const points=crown.map(()=>new THREE.Vector3()),edge=new THREE.Vector3();
      blocks.geometry.computeBoundingBox();
      const probe=new THREE.Mesh(blocks.geometry,blockMaterial);
      matrices[i].forEach((matrix,j)=>{
        blocks.setMatrixAt(j,matrix);blocks.setColorAt(j,tones[i][j]);
        const box=blocks.geometry.boundingBox.clone().applyMatrix4(matrix);
        const rock={matrix,box,probe};
        for(let u=Math.floor(box.min.x/8);u<=Math.floor(box.max.x/8);u++)for(let v=Math.floor(box.min.z/8);v<=Math.floor(box.max.z/8);v++){
          const key=u*4096+v;
          if(!blockCells.has(key))blockCells.set(key,[]);
          blockCells.get(key).push(rock);
        }
        center.set(0,0,0);
        points.forEach((p,k)=>{p.copy(crown[k]).applyMatrix4(matrix);center.add(p);});center.divideScalar(points.length);
        n.copy(points[2]).sub(points[0]).cross(edge.copy(points[1]).sub(points[0])).normalize();
        if(n.y<.95)return;
        let radius=Infinity;
        for(let k=0;k<points.length;k++){
          const a=points[k],b=points[(k+1)%points.length],ex=b.x-a.x,ez=b.z-a.z;
          radius=Math.min(radius,Math.abs(ex*(center.z-a.z)-ez*(center.x-a.x))/Math.hypot(ex,ez));
        }
        if(radius<.30)return;
        landings.push({rock,cap:{x:center.x,y:center.y,z:center.z,radius,gx:-n.x/n.y,gz:-n.z/n.y}});
      });
      blocks.computeBoundingSphere();scene.add(blocks);
    });

    // Neighboring pieces of riprap interlock. A candidate cap sometimes lies
    // below an adjacent block: test the talon footprint on the final rendered
    // geometry now, once, before exposing a site to steering or picking.
    const down=new THREE.Raycaster();down.ray.direction.set(0,-1,0);
    const hits=[];
    function covered(rock,x,y,z){
      for(const other of blockCells.get(capCell(x,z))||[]){
        const b=other.box;
        if(other===rock||y+.025>=b.max.y||x<b.min.x||x>b.max.x||z<b.min.z||z>b.max.z)continue;
        down.ray.origin.set(x,b.max.y+.10,z);down.far=down.ray.origin.y-y-.025;hits.length=0;
        other.probe.matrixWorld.copy(other.matrix);other.probe.raycast(down,hits);
        if(hits.length)return true;
      }
      return false;
    }
    for(const {rock,cap} of landings){
      const footprint=Math.min(.325,cap.radius*.93);
      const obstructed=[[0,0],[1,0],[-1,0],[0,1],[0,-1],[.68,.68],[-.68,-.68]].some(([u,v])=>{
        const dx=u*footprint,dz=v*footprint;
        return covered(rock,cap.x+dx,cap.y+cap.gx*dx+cap.gz*dz,cap.z+dz);
      });
      if(obstructed)continue;
      const key=capCell(cap.x,cap.z);
      if(!capCells.has(key))capCells.set(key,[]);
      capCells.get(key).push(cap);
    }
    blockCells.clear();landings.length=0;

    function armoredStation(s,t){
      const width=Math.min(1,s/93,(length-s)/94)*(t<0?62:74);
      return s>0&&s<length&&Math.abs(t)<Math.max(6,width);
    }
    function onArmor(x,z){
      return x>west[0]-8&&x<east[0]+8&&z>west[1]-63&&z<east[1]+75&&armoredStation(...station(x,z));
    }
    function capNear(x,z,reach){
      let nearest=null,distance=reach*reach;
      for(let u=Math.floor((x-reach)/8);u<=Math.floor((x+reach)/8);u++)
        for(let v=Math.floor((z-reach)/8);v<=Math.floor((z+reach)/8);v++)
          for(const cap of capCells.get(u*4096+v)||[]){
            const d=(x-cap.x)**2+(z-cap.z)**2;
            if(d<distance){nearest=cap;distance=d;}
          }
      return nearest;
    }
    const riverHeight=addRiver(THREE,scene,survey.river||[],ground,texture,sun,sky,clock,aerial,half);
    return {
      riverHeight,
      armorPerch(x,z){return onArmor(x,z)?capNear(x,z,8):undefined;},
      onDam(x,z){
        const [s,t]=station(x,z);
        const width=Math.max(12,Math.min((s+15)*.7,(length-s+10)*.62,84));
        return s>-17&&s<length+21&&t>-width*.83&&t<width ||
          (Math.abs(x-gateX)<12&&z>-2782&&z<-2630);
      },
      structureHeight(x,z){
        const [s,t]=station(x,z);
        const bx=x-westBridge[0][0],bz=z-westBridge[0][1];
        if(bx*49-bz*53>=0&&bx*49-bz*53<=bridgeSpan**2&&Math.abs(bx*53+bz*49)<2.53*bridgeSpan)return 173.21;
        if(Math.abs(x-gateX)<4.5&&Math.abs(z-gateZ)<3.6)return gateBase+5.86;
        if(s>=0&&s<=length&&Math.abs(t)<4.6)return crestDeck(x,z)+(Math.abs(t)>3.3?.77:0);
        if(armoredStation(s,t)){
          const cap=capNear(x,z,1.3);
          if(cap&&Math.hypot(x-cap.x,z-cap.z)<=cap.radius)return cap.y+cap.gx*(x-cap.x)+cap.gz*(z-cap.z);
        }
        return -Infinity;
      }
    };
  };

  function addRiver(THREE,scene,line,ground,texture,sun,sky,clock,aerial,half){
    if(line.length<2)return ()=>-Infinity;
    const rows=[],vertices=[],uv=[],section=[],horizon=[],index=[];
    const shelfPoints=[],shelfUv=[],shelfIndices=[],shelfWidth=6;
    const {lerp,clamp,smoothstep}=THREE.MathUtils;
    const bedMap=texture('shore-pebbles.webp',true),cobbleMap=texture('shore-cobble.webp',true);
    let distance=0;
    function row(a,b,t){
      const x=lerp(a[0],b[0],t),z=lerp(a[1],b[1],t),width=lerp(a[2],b[2],t)*.5;
      const level=lerp(a[3]??ground(a[0],a[1]),b[3]??ground(b[0],b[1]),t)+.23;
      const last=rows[rows.length-1];
      if(last)distance+=Math.hypot(x-last.x,z-last.z);
      rows.push({x,z,width,level,distance});
    }
    for(let i=1;i<line.length;i++){
      const a=line[i-1],b=line[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
      const count=Math.max(1,Math.ceil(length/(distance<380?1.18:3.7)));
      for(let j=0;j<count;j++)row(a,b,j/count);
    }
    row(line[line.length-2],line[line.length-1],1);
    for(let i=0;i<rows.length;i++){
      const r=rows[i],a=rows[Math.max(0,i-2)],b=rows[Math.min(rows.length-1,i+2)];
      const dx=b.x-a.x,dz=b.z-a.z,len=Math.max(.001,Math.hypot(dx,dz));
      r.nx=-dz/len;r.nz=dx/len;
      // The mapped outline and the actual rendered lidar triangles can differ
      // by several metres. Find each bank independently in the displayed DEM.
      r.banks=[1,-1].map(side=>{
        const at=d=>ground(r.x+side*d*r.nx,r.z+side*d*r.nz);
        let lo=r.width*.19,hi=r.width+Math.min(3,r.width*.30);
        const stop=hi,step=Math.max(.85,(hi-lo)/7);
        for(let off=lo;off<=stop;off+=step){
          if(at(off)>r.level+.015){hi=off;break;}
          lo=off;
        }
        for(let k=0;k<4;k++){
          const mid=(lo+hi)*.5;
          if(at(mid)>r.level+.015)hi=mid;else lo=mid;
        }
        return clamp((lo+hi)*.5-.38,r.width*.23,stop);
      });
    }
    // Smooth the banks over a few metres along the river, independent of
    // station spacing. A single lidar cell should not form a triangular spit.
    for(let i=0;i<rows.length;i++){
      const r=rows[i];let sum=0,left=0,right=0;
      for(let j=Math.max(0,i-6);j<=Math.min(rows.length-1,i+6);j++){
        const q=rows[j],delta=(r.distance-q.distance)/3.0,weight=Math.exp(-delta*delta);
        sum+=weight;left+=q.banks[0]*weight;right+=q.banks[1]*weight;
      }
      left/=sum;right/=sum;
      r.left=left;r.right=right;
      const heights=[];
      for(const [j,side] of [1,-1].entries()){
        const edge=j===0?left:right;
        // The water continues underneath the gravel. The gravel starts below
        // water, crests gently on the dry side, then blends into real land.
        const w=edge+.61;
        vertices.push(r.x+side*w*r.nx,r.level,r.z+side*w*r.nz);
        section.push(r.nz,-r.nx,(left+right+1.22)*.5);uv.push(j,r.distance);
        const clay=(1.+Math.sin(r.distance*.112+side*.91)*.19);
        const outer=clamp(r.width*.48,2.7,5.2)*clay;
        const beachGrade=.12+.041*Math.sin(r.distance*.18+side);
        for(const off of [-.65,0,.58,outer*.40,outer*.70,outer]){
          const d=edge+off,x=r.x+side*d*r.nx,z=r.z+side*d*r.nz;
          const fade=smoothstep(off,outer*.32,outer);
          const y=Math.max(ground(x,z)+.04,r.level+off*beachGrade+.012-.38*fade);
          shelfPoints.push(x,y,z);
          shelfUv.push(off,off/outer);
        }
        heights.push(Math.max(r.level,ground(r.x+side*(edge+13)*r.nx,r.z+side*(edge+13)*r.nz))-r.level);
      }
      horizon.push(...heights,...heights);
      if(i===0)continue;
      const j=i*2;
      index.push(j-2,j-1,j,j-1,j+1,j);
      for(let side=0;side<2;side++)for(let k=0;k<shelfWidth-1;k++){
        const b=(i*2+side)*shelfWidth+k,a=b-2*shelfWidth;
        if(side===0)shelfIndices.push(a,b,a+1,a+1,b,b+1);
        else shelfIndices.push(a,a+1,b,a+1,b+1,b);
      }
    }
    const geom=new THREE.BufferGeometry();
    geom.setAttribute('position',new THREE.Float32BufferAttribute(shelfPoints,3));
    geom.setAttribute('uv',new THREE.Float32BufferAttribute(shelfUv,2));geom.setIndex(shelfIndices);
    geom.computeVertexNormals();geom.computeBoundingSphere();
    const gravelColor=`
      vec3 gravelColorAt(vec2 p){
        vec2 u=p*.39;
        float shoal=.52+.25*sin(p.x*.49+p.y*.31)+.16*cos(p.y*.81-p.x*.25);
        vec3 pebbles=texture2D(bed,u).rgb,stones=texture2D(cobble,mat2(.8,-.6,.6,.8)*u*.69).rgb;
        return pow(mix(pebbles,stones,shoal*.75),vec3(2.2))*vec3(1.01,.94,.82);
      }`;
    const gravel=new THREE.ShaderMaterial({
      side:THREE.DoubleSide,forceSinglePass:true,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,
      uniforms:{bed:{value:bedMap},cobble:{value:cobbleMap},sun:{value:sun},clock},
      vertexShader:`varying vec3 wp,norm;varying vec2 bank;
        void main(){wp=position;norm=normal;bank=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`uniform sampler2D bed,cobble;uniform vec3 sun;uniform float clock;varying vec3 wp,norm;varying vec2 bank;
        ${gravelColor}
        void main(){
          vec2 p=wp.xz;vec3 N=normalize(norm);if(N.y<0.)N=-N;
          float granule=texture2D(cobble,p*.079).g;
          vec3 substrate=gravelColorAt(p);
          float splash=.085*sin(clock*2.34+dot(p,vec2(.31,.93)))+.036*sin(clock*3.25-p.x*1.68);
          float wet=1.-smoothstep(.20,1.22,bank.x-splash+granule*.23);
          float lut=.58+.49*max(0.,dot(N,sun));vec3 c=substrate*lut*(1.-.36*wet);
          vec3 V=normalize(cameraPosition-wp);
          c+=vec3(.12,.16,.19)*wet*.23*pow(1.-max(.0,dot(V,N)),3.);
          float feather=(1.-smoothstep(.22,.95,bank.y+(granule-.45)*.31));
          float dist=length(cameraPosition-wp);
          gl_FragColor=vec4(mix(c,vec3(.39,.45,.50),1.-exp(-dist*.000032)),feather*(1.-smoothstep(400.,650.,dist)));
          #include <colorspace_fragment>
        }`
    });
    const bankMesh=new THREE.Mesh(geom,gravel);bankMesh.name='Ashuelot gravel banks';bankMesh.renderOrder=1;scene.add(bankMesh);
    // Only submit the visible reach of the twelve-kilometre river. Keep one
    // gravel draw and preserve bends that bring multiple sections into view.
    const reaches=[];
    for(let start=0;start<rows.length-1;start+=96){
      const end=Math.min(rows.length-1,start+96);let x0=Infinity,z0=Infinity,x1=-Infinity,z1=-Infinity;
      for(let i=start;i<=end;i++){const q=rows[i],w=q.width+11;
        x0=Math.min(x0,q.x-w);x1=Math.max(x1,q.x+w);z0=Math.min(z0,q.z-w);z1=Math.max(z1,q.z+w);}
      reaches.push({x0,x1,z0,z1,start,end});
    }
    let lastX=Infinity,lastZ=Infinity;
    bankMesh.onBeforeRender=(_,__,camera)=>{
      const {x,z}=camera.position;
      if(Math.abs(lastX-x)<48&&Math.abs(lastZ-z)<48)return;
      lastX=x;lastZ=z;let low=Infinity,high=0;
      for(const q of reaches){
        if(x<q.x0-720||x>q.x1+720||z<q.z0-720||z>q.z1+720)continue;
        low=Math.min(low,q.start);high=Math.max(high,q.end);
      }
      const indicesPerRow=12*(shelfWidth-1);
      geom.setDrawRange(high?low*indicesPerRow:0,high?(high-low)*indicesPerRow:0);
    };
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    geometry.setAttribute('channel',new THREE.Float32BufferAttribute(section,3));
    geometry.setAttribute('banks',new THREE.Float32BufferAttribute(horizon,2));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(index);
    geometry.computeBoundingSphere();
    const material=new THREE.ShaderMaterial({
      side:THREE.DoubleSide,
      uniforms:{clock,normalMap:{value:texture('waternormals.jpg',true)},bed:{value:bedMap},
        landPhoto:{value:aerial},atlasHalf:{value:half},cobble:{value:cobbleMap},sky:{value:sky},sun:{value:sun}},
      vertexShader:`attribute vec3 channel;attribute vec2 banks;varying vec3 wp,section;varying vec2 flow,bankH;
        void main(){wp=position;flow=uv;section=channel;bankH=banks;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec3 wp,section;varying vec2 flow,bankH;uniform float clock,atlasHalf;uniform sampler2D normalMap,bed,cobble,sky,landPhoto;uniform vec3 sun;
        ${gravelColor}
        void main(){
          vec3 V=normalize(cameraPosition-wp);
          vec2 downstream=normalize(section.xy),across=vec2(-downstream.y,downstream.x);
          float bank=max(0.,2.*section.z*min(flow.x,1.-flow.x)-.61);
          float crossChannel=(flow.x-.5)*2.*section.z;
          float channelSpeed=smoothstep(.1,4.,bank);
          float outlet=1.-smoothstep(26.,115.,flow.y);
          float detail=1.-smoothstep(.09,1.65,max(length(dFdx(wp.xz)),length(dFdy(wp.xz))));
          // Each current patch has its own oblique crest, speed and width.
          // Long smooth margins shelter below the broken, faster center thread.
          vec2 st=vec2(flow.y,crossChannel);
          vec2 eddy=texture2D(normalMap,wp.xz*.041+vec2(-clock*.007,.013*clock)).rg-.5;
          float swirl=sin(flow.y*.31-crossChannel*.43+eddy.x*3.6);
          vec2 drift=st*vec2(.135,.25)+eddy*.48;
          vec2 fast=texture2D(normalMap,drift-vec2(clock*.115,0.)).rg-.5;
          vec2 slow=texture2D(normalMap,wp.xz*.079-downstream*(.027*clock)+.41).rg-.5;
          float packet=.5+.5*sin(flow.y*.78+crossChannel*1.03+swirl*1.64)*sin(crossChannel*.83-flow.y*.24-eddy.y*3.);
          float riffle=sin(flow.y*2.06+crossChannel*.85-clock*2.65+swirl*2.8+eddy.y*3.7);
          float angled=sin(flow.y*1.55-crossChannel*1.39-clock*1.92+eddy.x*3.3);
          float riffleStrength=(.012+.035*outlet)*channelSpeed*detail*packet;
          vec2 r=mix(slow*.44,fast,channelSpeed);
          vec2 slope=(downstream*r.x+across*r.y)*(.21+.22*outlet)*detail+
                     ((downstream+across*.36)*riffle+(downstream-across*.49)*angled*.54)*riffleStrength;
          vec3 N=normalize(vec3(slope.x,1.,slope.y));
          float fres=.0204+.9796*pow(1.-max(0.,dot(V,N)),5.);
          float bar=texture2D(normalMap,wp.xz*.03).r;
          float depth=.015+min(bank*(.26+.21*bar),2.5);
          vec3 ray=refract(-V,N,1./1.333);
          vec2 bottom=wp.xz+ray.xz*depth/max(.32,-ray.y);
          vec2 bend=texture2D(normalMap,bottom*.028).rg-.5;
          vec3 grit=pow(texture2D(bed,bottom*.49+bend*.17).rgb,vec3(2.2));
          vec3 stones=pow(texture2D(cobble,mat2(.6,-.8,.8,.6)*bottom*.31+bend*.12).rgb,vec3(2.2));
          vec3 substrate=mix(grit,stones,smoothstep(.29,.79,bar)*.71);
          float caustic=exp(-9.*abs(sin(dot(bottom,vec2(1.73,.93))-.94*clock+bend.x)+.69*sin(dot(bottom,vec2(-.56,2.2))+.87*clock)));
          substrate*=.84+caustic*.43*detail*exp(-depth);
          // The first thin layer of water refracts the very same wet gravel
          // visible above it. This preserves continuity across the moving film.
          float margin=1.-smoothstep(.08,1.64,bank);
          if(margin>.0){
            vec3 wetBed=gravelColorAt(bottom)*(.58+.49*max(0.,sun.y))*.64;
            substrate=mix(substrate,wetBed,margin);
          }
          vec3 trans=exp(-depth*vec3(.87,.54,.71)/max(.32,-ray.y));
          vec3 through=mix(vec3(.038,.082,.054),substrate,trans);
          vec3 R=reflect(-V,N);
          vec2 skyUV=vec2(.5+atan(R.z,R.x)*.15915494,.5+asin(clamp(R.y,-1.,1.))*.31830989);
          vec3 reflected=texture2D(sky,skyUV).rgb;
          // The low-angle ray meets the nearer wooded, surveyed bank. Use its
          // photographed hue below the skyline and the region sky beyond it.
          float crossRay=dot(normalize(R.xz+vec2(.00001)),across);
          float side=step(0.,crossRay),toBank=2.*section.z*mix(1.-flow.x,flow.x,side);
          float rayTravel=(toBank+13.)/max(.07,abs(crossRay));
          float bankRise=mix(bankH.y,bankH.x,side);
          float skyline=bankRise/max(1.,rayTravel);
          vec2 landPoint=wp.xz+normalize(R.xz+vec2(.00001))*rayTravel;
          vec3 pigment=pow(texture2D(landPhoto,vec2(landPoint.x,-landPoint.y)/(2.*atlasHalf)+.5).rgb,vec3(2.2));
          float shoreReturn=1.-smoothstep(skyline-.045,skyline+.055,R.y);
          reflected=mix(reflected,pigment*vec3(.73,.80,.85),shoreReturn*.90);
          float glint=pow(max(0.,dot(N,normalize(V+sun))),118.);
          vec3 c=mix(through,reflected,fres*(1.-.29*margin))+glint*vec3(.64,.48,.29)*(.32+.68*detail);
          float foam=smoothstep(.14,.36,fast.x+.51*fast.y)*smoothstep(.64,.95,riffle)*outlet*channelSpeed*detail;
          c=mix(c,vec3(.46,.52,.47),foam*.53);
          float haze=1.-exp(-distance(wp,cameraPosition)*.000032);
          gl_FragColor=vec4(mix(c,vec3(.39,.45,.50),haze),1.);
          #include <colorspace_fragment>
        }`
    });
    const river=new THREE.Mesh(geometry,material);
    river.name='Ashuelot River below Surry Dam';
    scene.add(river);
    const cells=new Map(),key=(x,z)=>x*8192+z;
    const surface=geometry.attributes.position.array,shingle=geom.attributes.position.array;
    const bankFaces=geom.index.array,waterFaces=geometry.index.array,facesPerRow=12*(shelfWidth-1);
    function bounds(data,first,last,stride){
      let x0=Infinity,z0=Infinity,x1=-Infinity,z1=-Infinity;
      for(let j=0;j<2;j++)for(let k=first+j*stride;k<last+j*stride;k++){
        x0=Math.min(x0,data[k*3]);x1=Math.max(x1,data[k*3]);
        z0=Math.min(z0,data[k*3+2]);z1=Math.max(z1,data[k*3+2]);
      }
      return [x0,z0,x1,z1];
    }
    for(let i=0;i<rows.length-1;i++){
      const j=i*2*shelfWidth,m=bounds(surface,i*2,i*2+2,2);
      const l=bounds(shingle,j,j+shelfWidth,2*shelfWidth),r=bounds(shingle,j+shelfWidth,j+2*shelfWidth,2*shelfWidth);
      const q={i,m,l,r},x0=Math.min(m[0],l[0],r[0]),z0=Math.min(m[1],l[1],r[1]);
      const x1=Math.max(m[2],l[2],r[2]),z1=Math.max(m[3],l[3],r[3]);
      for(let x=Math.floor(x0/32);x<=Math.floor(x1/32);x++)for(let z=Math.floor(z0/32);z<=Math.floor(z1/32);z++){
        const id=key(x,z);if(!cells.has(id))cells.set(id,[]);cells.get(id).push(q);
      }
    }
    function top(x,z,data,indices,first,count){
      let h=-Infinity;
      for(let o=first;o<first+count;o+=3){
        const a=indices[o]*3,b=indices[o+1]*3,c=indices[o+2]*3;
        const ax=data[a],az=data[a+2],bx=data[b]-ax,bz=data[b+2]-az,cx=data[c]-ax,cz=data[c+2]-az;
        const det=bx*cz-bz*cx;if(Math.abs(det)<.00001)continue;
        const u=((x-ax)*cz-(z-az)*cx)/det,v=(bx*(z-az)-bz*(x-ax))/det;
        if(u>=0&&v>=0&&u+v<=1)h=Math.max(h,data[a+1]*(1-u-v)+data[b+1]*u+data[c+1]*v);
      }
      return h;
    }
    return (x,z,includeBank=false)=>{
      const bin=cells.get(key(Math.floor(x/32),Math.floor(z/32)));
      if(!bin)return -Infinity;
      let water=-Infinity,bank=-Infinity;
      for(const {i,m,l,r} of bin){
        if(x>=m[0]&&x<=m[2]&&z>=m[1]&&z<=m[3])water=Math.max(water,top(x,z,surface,waterFaces,i*6,6));
        if(x>=l[0]&&x<=l[2]&&z>=l[1]&&z<=l[3])
          bank=Math.max(bank,top(x,z,shingle,bankFaces,i*facesPerRow,facesPerRow/2));
        if(x>=r[0]&&x<=r[2]&&z>=r[1]&&z<=r[3])
          bank=Math.max(bank,top(x,z,shingle,bankFaces,(i+.5)*facesPerRow,facesPerRow/2));
      }
      return includeBank?Math.max(water,bank):water>=bank?water:-Infinity;
    };
  }
})();
