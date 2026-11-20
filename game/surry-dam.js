(() => {
  'use strict';

  window.addSurryDam = function (THREE, scene, {survey, elevation, terrain, texture, sun, clock}) {
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
    const riprap = texture('surry-riprap.webp',true);
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
        vec3 stones=texture2D(damRiprap,vec2(along,across)*.246).rgb;
        vec3 mottled=texture2D(damRiprap,vec2(-across,along)*.079+.37).rgb;
        c=mix(c,stones*(.74+.39*lum(mottled))*vec3(.97,1.,1.025),rocks*(1.-smoothstep(260.,1150.,d))*.86);
        veg*=1.-rocks*.99;
        dense*=1.-rocks;
        float bedding=desert*(1.-veg);`);

    const material = (opts) => new THREE.MeshStandardMaterial({roughness:.88,...opts});
    const roadTex = colorMap('lakeside-roof.webp');
    const roadMat = material({color:0x777577,map:roadTex,roughness:.93});
    const shoulder = material({color:0xa7a6a0,map:colorMap('surry-riprap.webp')});
    const concrete = material({color:0xb4b4ac,map:colorMap('shore-stone.webp'),roughness:.94});
    const granite = material({color:0xb6afa1,map:colorMap('shore-stone.webp'),roughness:.94});
    const roofMat = material({color:0x67675f,map:roadTex,roughness:.89});
    const rails = material({color:0x9b9f9f,metalness:.47,roughness:.39});
    const weathered = material({color:0x53534c,metalness:.28,roughness:.68});
    const glass = material({color:0x384449,roughness:.28,metalness:.18});
    const white = material({color:0xc8c3b2,roughness:.71});

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
    const beams=new THREE.InstancedMesh(new THREE.BoxGeometry(gap+.05,.28,.092),rails,2*total);
    for(let side=0;side<2;side++)for(let i=0;i<total;i++){
      const off=side===0?-3.55:3.55, along=Math.min(length-.2,i*gap+.15);
      const [x,z]=at(along,off), [bx,bz]=at(Math.min(length-.7,along+gap*.5),off);
      dummy.rotation.set(0,-Math.atan2(dz,dx),0);
      dummy.position.set(x,crestDeck(x,z)+.45,z);dummy.updateMatrix();
      railPosts.setMatrixAt(side*total+i,dummy.matrix);
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
    const rockGeometry=new THREE.IcosahedronGeometry(1,0);
    const rockMat=material({color:0xffffff});
    const rocks=new THREE.InstancedMesh(rockGeometry,rockMat,5800);
    const color=new THREE.Color();
    for(let i=0;i<rocks.count;i++){
      const along=31+random()*479, side=random()>.48?1:-1;
      const endFade=Math.min(1,along/104,(length-along)/102);
      const across=side*(6.5+random()*endFade*(side===1?69:54));
      const [x,z]=at(along,across);
      const radius=.14+Math.pow(random(),2)*.51;
      const y=elevation(x,z)-.06;
      dummy.position.set(x,y,z);
      dummy.rotation.set(random()*2.3,random()*6.28,random()*3.4);
      dummy.scale.set(radius*(1+random()*.5),radius*.63,radius*(.85+random()*.64));
      dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);
      const gray=.225+random()*.22;
      color.setRGB(gray*1.028,gray*1.008,gray*.96);rocks.setColorAt(i,color);
    }
    rocks.computeBoundingSphere();scene.add(rocks);

    const riverHeight=addRiver(THREE,scene,survey.river||[],elevation,texture,sun,clock);
    return {
      riverHeight,
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
        if(Math.abs(x-gateX)<4.5&&Math.abs(z-gateZ)<3.6)return gateBase+5.72;
        if(s>=0&&s<=length&&Math.abs(t)<4.6)return crestDeck(x,z)+(Math.abs(t)>3.3?.77:0);
        return -Infinity;
      }
    };
  };

  function addRiver(THREE,scene,line,elevation,texture,sun,clock){
    if(line.length<2)return ()=>-Infinity;
    const centers=[],vertices=[],uv=[],index=[];
    let distance=0;
    for(let i=0;i<line.length;i++){
      const [x,z,width,waterY]=line[i];
      const prev=line[Math.max(0,i-1)],next=line[Math.min(line.length-1,i+1)];
      if(i)distance+=Math.hypot(x-prev[0],z-prev[1]);
      const dx=next[0]-prev[0],dz=next[1]-prev[1];
      const inv=width*.5/Math.max(.01,Math.hypot(dx,dz));
      const y=(waterY??elevation(x,z))+.23;
      const left=[x-dz*inv,y,z+dx*inv],right=[x+dz*inv,y,z-dx*inv];
      centers.push([x,y,z,width*.5]);
      vertices.push(...left,...right);uv.push(0,distance,1,distance);
      if(i){const j=i*2;index.push(j-2,j-1,j,j-1,j+1,j);}
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(index);
    geometry.computeVertexNormals();
    const material=new THREE.ShaderMaterial({
      side:THREE.DoubleSide,
      uniforms:{clock,normalMap:{value:texture('waternormals.jpg',true)},bed:{value:texture('shore-pebbles.webp',true)},sun:{value:sun}},
      vertexShader:`varying vec3 wp;varying vec2 flow;void main(){
        wp=position;flow=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec3 wp;varying vec2 flow;uniform float clock;uniform sampler2D normalMap,bed;uniform vec3 sun;
        void main(){
          vec3 V=normalize(cameraPosition-wp);
          vec3 n1=texture2D(normalMap,vec2(wp.x,wp.z)*.12+vec2(.014,-.009)*clock).xyz-.5;
          vec3 n2=texture2D(normalMap,vec2(flow.x*.64,flow.y*.065-clock*.18)).xyz-.5;
          vec3 N=normalize(vec3(n1.x*.24+n2.x*.12,1.,n1.y*.27+n2.y*.12));
          float f=.024+.976*pow(1.-max(0.,dot(V,N)),5.);
          float edge=1.-smoothstep(.025,.27,min(flow.x,1.-flow.x));
          float glint=pow(max(0.,dot(N,normalize(V+sun))),110.)*.40;
          float rings=.5+.5*sin(flow.y*.73-clock*1.7+n1.x*8.);
          vec3 c=mix(vec3(.065,.117,.083),vec3(.109,.157,.102),edge*(.38+.25*rings));
          vec3 ray=refract(-V,N,.7502);
          vec3 gravel=pow(texture2D(bed,(wp.xz+ray.xz*(.3+.65*(1.-edge)))*.57).rgb,vec3(2.2));
          c=mix(c,gravel*vec3(.57,.72,.59),edge*(1.-f)*.83);
          float froth=smoothstep(.65,.94,sin(flow.y*1.41-clock*2.19+n2.x*4.)*sin(flow.x*42.+n1.x*5.));
          c+=vec3(.11,.12,.095)*froth*edge;
          c=mix(c,vec3(.30,.42,.50),f*.77)+glint*vec3(1.,.82,.54);
          float haze=1.-exp(-distance(wp,cameraPosition)*.000032);
          gl_FragColor=vec4(mix(c,vec3(.39,.45,.50),haze),1.);
          #include <colorspace_fragment>
        }`
    });
    scene.add(new THREE.Mesh(geometry,material));
    const cells=new Map(),key=(x,z)=>x*8192+z;
    for(let i=1;i<centers.length;i++){
      const A=centers[i-1],B=centers[i],pad=Math.max(A[3],B[3]);
      for(let x=Math.floor((Math.min(A[0],B[0])-pad)/64);x<=Math.floor((Math.max(A[0],B[0])+pad)/64);x++){
        for(let z=Math.floor((Math.min(A[2],B[2])-pad)/64);z<=Math.floor((Math.max(A[2],B[2])+pad)/64);z++){
          const id=key(x,z);if(!cells.has(id))cells.set(id,[]);cells.get(id).push(i);
        }
      }
    }
    return (x,z)=>{
      for(const i of cells.get(key(Math.floor(x/64),Math.floor(z/64)))||[]){
        const A=centers[i-1],B=centers[i],dx=B[0]-A[0],dz=B[2]-A[2];
        const t=((x-A[0])*dx+(z-A[2])*dz)/Math.max(.001,dx*dx+dz*dz);
        if(t<0||t>1)continue;
        if(Math.hypot(x-A[0]-t*dx,z-A[2]-t*dz)<A[3]+(B[3]-A[3])*t)return A[1]+(B[1]-A[1])*t;
      }
      return -Infinity;
    };
  }
})();
