// Articulated, metre-scaled mammals. Swept cross sections follow the spine,
// limb bones, ears and branching antlers. One instanced draw per body type.
window.makeLandModels=function makeLandModels(T,scene){
  const coatTexture=new T.TextureLoader().load('wild-mammal-coat.webp');
  coatTexture.wrapS=coatTexture.wrapT=T.MirroredRepeatWrapping;coatTexture.anisotropy=4;
  const meshes=new Map(),transform=new T.Object3D(),shadowTransform=new T.Object3D();
  const collection=new T.Group();collection.name='Resident land mammals';scene.add(collection);
  const shadow=new T.InstancedMesh(new T.PlaneGeometry(1,1),new T.ShaderMaterial({
    transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,
    vertexShader:'varying vec2 st;void main(){st=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec2 st;void main(){float a=1.-smoothstep(.07,.52,length(st-.5));gl_FragColor=vec4(.095,.078,.059,.34*a*a);}'
  }),96);
  shadow.name='Animal contact shadows';shadow.frustumCulled=false;shadow.count=0;collection.add(shadow);
  const v=new T.Vector3(),tangent=new T.Vector3(),side=new T.Vector3(),up=new T.Vector3();
  function build(id,horns){
    const spec=window.aerieLandWildlife.species[id],family=spec.family;
    const moose=family==='moose',sheep=family==='sheep',ibex=family==='ibex',hare=family==='hare',bear=family==='bear',otter=family==='otter';
    const goat=family==='goat',chamois=family==='chamois',beaver=family==='beaver',muskrat=family==='muskrat';
    const canid=family==='canid',fox=id==='red-fox',raccoon=family==='raccoon';
    const positions=[],colors=[],indices=[],joints=[],roots=[];
    const coat=new T.Color(spec.coat),belly=new T.Color(spec.belly),face=new T.Color(spec.face);
    const dark=new T.Color('#342d28'),nose=new T.Color('#25211e'),horn=new T.Color('#9d8b70'),light=new T.Color('#d6c9af');
    const earPink=new T.Color('#ae9283'),iris=new T.Color('#38291e'),gleam=new T.Color('#c7bda9');
    let bone=0,pivot=[0,0,0];
    const bind=(n,p)=>{bone=n;pivot=p;};
    // Cross sections are ellipses normal to the centreline. Interpolate ring
    // shape in both axes so a cheek can widen independently from its depth.
    function tube(path,col,under=col,N=12){
      const start=positions.length/3;let prevSide;
      for(let i=0;i<path.length;i++){
        const p=path[i],a=path[Math.max(0,i-1)],b=path[Math.min(path.length-1,i+1)];
        tangent.set(b[0]-a[0],b[1]-a[1],b[2]-a[2]).normalize();
        if(prevSide){side.copy(prevSide).addScaledVector(tangent,-prevSide.dot(tangent));}
        if(!prevSide||side.lengthSq()<.05){side.set(0,0,1).addScaledVector(tangent,-tangent.z);if(side.lengthSq()<.05)side.set(0,1,0).addScaledVector(tangent,-tangent.y);}
        side.normalize();prevSide=side.clone();up.crossVectors(side,tangent).normalize();
        for(let j=0;j<N;j++){
          const a=j*2*Math.PI/N,ca=Math.cos(a),sa=Math.sin(a);
          v.set(p[0],p[1],p[2]).addScaledVector(side,ca*p[3]).addScaledVector(up,sa*(p[4]??p[3]));
          positions.push(v.x,v.y,v.z);roots.push(...pivot);joints.push(bone);
          const mix=Math.max(0,(p[1]-v.y)/(p[4]||p[3]||1));
          const shade=1+.025*Math.sin(8.7*v.x+3.1*v.y+.6*Math.sin(19.4*v.z));
          colors.push((col.r+(under.r-col.r)*mix*mix)*shade,(col.g+(under.g-col.g)*mix*mix)*shade,(col.b+(under.b-col.b)*mix*mix)*shade);
          if(i){const n=start+i*N+j,m=start+i*N+(j+1)%N;indices.push(n-N,n,m-N,m-N,n,m);}
        }
      }
    }
    function oval(x,y,z,rx,ry,rz,c,bc=c){
      const rows=[];for(let i=0;i<=9;i++){const a=i*Math.PI/9;rows.push([x-rx*Math.cos(a),y,z,Math.max(.0002,rz*Math.sin(a)),Math.max(.0002,ry*Math.sin(a))]);}
      tube(rows,c,bc,12);
    }
    const bison=family==='bison',elk=id==='elk';
    const quad=!(hare||bear||otter||beaver||muskrat||canid||raccoon);
    let headX,headY,headSize,neckRoot,legX,legZ,legTop;
    if(bison){
      tube([[-.96,.61,0,.08,.13],[-.83,.63,0,.24,.29],[-.59,.65,0,.29,.33],
        [-.30,.69,0,.33,.35],[.02,.77,0,.39,.44],[.28,.81,0,.44,.47],
        [.47,.74,0,.40,.38],[.61,.63,0,.23,.31]],coat,belly,22);
      const shag=new T.Color('#453528');
      tube([[.07,.80,0,.25,.27],[.24,.87,0,.39,.43],[.43,.70,0,.37,.33],
        [.62,.62,0,.29,.30],[.73,.57,0,.21,.24]],shag,belly,23);
      bind(1,[.53,.67,0]);
      tube([[.50,.68,0,.22,.22],[.66,.69,0,.26,.25],[.80,.63,0,.24,.24],
        [.94,.53,0,.198,.18],[1.03,.465,0,.161,.11],[1.09,.46,0,.081,.073]],face,belly,19);
      oval(1.044,.459,0,.075,.078,.151,nose);
      tube([[.86,.46,0,.104,.117],[.87,.31,0,.092,.086],[.83,.23,0,.052,.089],[.81,.20,0,.007]],shag,face,11);
      for(const side of [-1,1]){
        const z=side;
        tube([[.68,.70,z*.19,.028,.033],[.65,.71,z*.29,.048,.064],[.61,.69,z*.36,.008]],face,earPink,10);
        oval(.872,.65,z*.212,.023,.025,.011,nose);
        oval(.88,.659,z*.223,.005,.005,.003,gleam);
        const hornScale=horns?1:.68;
        const hornP=(y,z,r)=>[.74-z*.10,.755+y*hornScale,side*(.196+z*hornScale),r*hornScale];
        tube([hornP(0,0,.068),hornP(.01,.14,.058),hornP(.10,.23,.041),
          hornP(.21,.26,.023),hornP(.26,.24,.004)],horn,dark,11);
      }
      bind(6,[-.87,.68,0]);
      tube([[-.87,.69,0,.025],[-.973,.48,0,.032],[-.98,.34,0,.023],
        [-.966,.25,0,.034],[-.953,.21,0,.005]],shag,belly,10);
      legX=[.44,-.66];legZ=.226;legTop=.52;
    }else if(quad){
      const b=moose?1.07:sheep||goat?1.02:ibex?.97:chamois?.9:1,a=moose?.98:.94;
      tube([[-.73*b,.72,0,.012,.04],[-.66*b,.76,0,.155,.21],[-.51*b,.76,0,.207,.24],
        [-.34*b,.75,0,.23,.24],[-.09*b,.72,0,.24,.245],[.15*b,.74,0,.236,.27],
        [.31*b,.78,0,.208,moose?.32:.242],[.43*b,.77,0,.152,.20],[.50*b,.79,0,.09,.13]],coat,belly,20);
      headX=moose?.88:sheep||goat?.77:ibex||chamois?.75:.84;headY=moose?1.075:sheep||goat?1.08:ibex||chamois?1.10:1.18;
      headSize=moose?1.2:sheep?1.04:ibex||goat?.93:chamois?.83:1;
      neckRoot=[.32*b,.79,0];bind(1,neckRoot);
      tube([[.24,.735,0,.144,.155],[.38,.814,0,.18,moose?.22:.202],[.50,.917,0,.158,.178],
        [headX-.18,headY-.015,0,.115,.14],[headX-.055,headY+.019,0,.096,.12]],moose||id==='red-deer'||elk?face:coat,belly,18);
      const x=headX,y=headY,k=headSize;
      tube([[x-.16*k,y+.08*k,0,.055*k,.079*k],[x-.095*k,y+.105*k,0,.115*k,.145*k],
        [x+.004*k,y+.083*k,0,.123*k,.153*k],[x+.120*k,y+.033*k,0,.109*k,.116*k],
        [x+.212*k,y-.010*k,0,.087*k,.08*k],[x+(moose?.306:.256)*k,y-.018*k,0,.071*k,.066*k],
        [x+(moose?.323:.269)*k,y-.027*k,0,.017*k,.025*k]],face,belly,18);
      oval(x+(moose?.288:.238)*k,y-.012*k,0,.045*k,.040*k,.073*k,nose);
      if(moose){
        // Broad upper lip and a blunt, pendulous rounded nose bridge.
        oval(x+.21*k,y+.016*k,0,.125*k,.083*k,.102*k,face);
        oval(x+.314*k,y-.029*k,0,.041*k,.036*k,.071*k,nose);
      }
      if(moose){tube([[x-.2,y-.02,0,.06,.085],[x-.23,y-.15,0,.059,.08],[x-.215,y-.25,0,.036,.05],[x-.22,y-.3,0,.005]],face);}
      const ears=moose?.255:id==='mule-deer'||id==='black-tailed-deer'?.279:sheep?.145:.21;
      for(const s of [-1,1]){
        tube([[x-.10,y+.17,s*.063,.043,.055],[x-.14,y+.19+ears*.24,s*.126,.052,.08],
          [x-.17,y+.19+ears*.68,s*(.115+ears*.41),.040,.055],[x-.176,y+.18+ears*.83,s*(.12+ears*.63),.002,.005]],coat,light);
        tube([[x-.103,y+.19,s*.079,.016],[x-.112,y+.2+ears*.27,s*.141,.029,.044],
          [x-.144,y+.19+ears*.62,s*(.118+ears*.42),.017,.030],[x-.163,y+.19+ears*.75,s*(.12+ears*.54),.001]],earPink,earPink,8);
        oval(x+.025*k,y+.128*k,s*.113*k,.033*k,.027*k,.009*k,dark);
        oval(x+.032*k,y+.129*k,s*.119*k,.020*k,.018*k,.007*k,iris);
        oval(x+.037*k,y+.137*k,s*.125*k,.006*k,.004*k,.003*k,gleam);
        oval(x+.266*k,y-.012*k,s*.061*k,.012*k,.008*k,.007*k,nose);
        if(chamois)tube([[x-.13,y+.13,s*.107,.025],[x+.025,y+.135,s*.129,.036],
          [x+.15,y+.049,s*.104,.026],[x+.22,y+.015,s*.065,.006]],dark,dark,8);
      }
      if(goat)tube([[x+.16,y-.044,0,.065,.058],[x+.105,y-.19,0,.057,.05],
        [x+.055,y-.28,0,.008,.012]],coat,belly,10);
      if(horns){
        for(const s of [-1,1]){
          const p=(xx,yy,zz,r,d=r)=>[x+xx,y+yy,s*zz,r,d];
          if(moose){
            tube([p(-.07,.21,.071,.039),p(-.10,.26,.14,.047),p(-.15,.29,.25,.045),p(-.19,.30,.34,.065)],horn);
            // A flattened palm carries the separate peripheral tines.
            tube([p(-.18,.307,.30,.035,.052),p(-.19,.354,.37,.115,.050),p(-.20,.40,.448,.18,.047),p(-.21,.46,.488,.165,.030),p(-.2,.483,.505,.025,.014)],horn,light);
            for(let i=0;i<6;i++){const bx=-.05-i*.056,bz=.445+.035*Math.sin(i*.6);
              tube([p(bx,.422,bz,.026),p(bx+.012,.512+.030*Math.sin(i*.8),bz+.034,.016),p(bx+.026,.554+.045*Math.sin(i*.75),bz+.04,.001)],horn,light,8);}
          }else if(goat||chamois){
            tube([p(-.06,.20,.080,.034),p(-.09,.30,.104,.029),p(-.13,.42,.123,.023),
              p(chamois?-.15:-.18,.51,.136,.016),p(chamois?-.224:-.245,chamois?.463:.56,.146,.003)],dark,dark,9);
          }else if(sheep||ibex){
            const path=[];const N=24;
            for(let i=0;i<=N;i++){const u=i/N;const a=u*(sheep?4.9:1.85);
              const xx=sheep?-.07-.21*(1-Math.cos(a))+.042*u:-.07-.50*u*u;
              const yy=sheep?.19+.16*Math.sin(a)-.072*u:.18+.51*Math.sin(a);
              path.push(p(xx,yy,.074+(sheep?.15:.088)*Math.sin(u*1.8)+u*.038,(.091*(1-u)**.72+.002)*(1+.08*Math.cos(i*2.1))));}
            tube(path,horn,dark,12);
          }else{
            const wide=elk?.38:id==='red-deer'?.31:.27;
            const beam=[p(-.064,.21,.076,.034),p(-.11,.31,.111,.034),p(-.18,.45,.16,.029),p(-.27,.57,wide*.86,.021),p(-.33,.66,wide,.014),p(-.35,.74,wide+.012,.001)];
            tube(beam,horn,light,10);
            for(let i=0;i<(elk?5:id==='red-deer'?4:3);i++){const b=beam[i+1];
              const dx=id==='white-tailed-deer'?.05:.105;
              tube([b,[b[0]+dx*.51,b[1]+.083,b[2]+s*.018,.015],[b[0]+dx,b[1]+.15-i*.011,b[2]+s*.025,.001]],horn,light,8);}
          }
        }
      }
      bind(0,[0,0,0]);
      const rump=id==='white-tailed-deer'||sheep||id==='red-deer'?light:coat;
      oval(-.639*b,.755,0,.082,.15,.153,rump);
      bind(6,[-.649*b,.84,0]);tube([[-.63*b,.85,0,.031,.035],[-.702*b,.76,0,.054,.076],[-.745*b,.632,0,.037,.054],[-.742*b,.602,0,.003]],
        id==='black-tailed-deer'||id==='mule-deer'?dark:coat,id==='white-tailed-deer'?light:belly);
      legX=[.295*b,-.484*b];legZ=.139;legTop=a*.80;
    }else{
      const long=otter?1.5:canid?1.24:bear?1.06:beaver?1.02:.91;
      const body=[[-.88*long,.54,0,.015,.045],[-.75*long,.59,0,.20,.25],[-.54*long,.61,0,.28,.35],
        [-.25*long,.59,0,.32,.40],[.06*long,.58,0,.3,.39],[.34*long,.61,0,.27,.32],[.53*long,.65,0,.18,.20]];
      if(canid)for(const ring of body){ring[1]+=.16;ring[3]*=.69;ring[4]*=.68;}
      tube(body,coat,belly,18);
      headX=long*(otter||canid?.80:bear?.76:.59);headY=canid?1.02:otter?.77:bear?.71:beaver||muskrat?.80:raccoon?.86:.94;headSize=1;
      neckRoot=[.39*long,.64,0];bind(1,neckRoot);
      tube([[.27*long,.62,0,.23,.24],[.50*long,.67,0,.19,.2],[headX-.09,headY,0,.174,.18]],coat,belly);
      const x=headX,y=headY,m=canid?(fox?.39:.36):otter?.25:bear?.36:beaver||muskrat?.18:.24;
      tube([[x-.18,y-.01,0,.10,.12],[x-.125,y+.035,0,.18,.205],[x+.02,y+.04,0,.19,.19],
        [x+.13,y-.008,0,.158,.13],[x+m*.87,y-.035,0,.105,.08],[x+m,y-.035,0,.055,.051]],coat,otter?light:belly,16);
      oval(x+m*.79,y-.04,0,m*.24,.075,.10,bear?face:belly);
      oval(x+m,y-.026,0,.037,.03,.069,nose);
      for(const s of [-1,1]){
        const top=hare?(id==='mountain-hare'?.37:id==='snowshoe-hare'?.45:.56):canid?(fox?.37:.29):bear?.20:raccoon?.17:.07;
        tube([[x-.10,y+.17,s*.108,.04],[x-.11,y+.18+top*.34,s*.148,.06,.068],
          [x-.12-top*.14,y+.18+top*.80,s*.168,canid?.021:.045,canid?.035:.060],[x-.13-top*.16,y+.18+top,s*.168,.004]],coat,face);
        if(hare)tube([[x-.079,y+.22,s*.12,.019],[x-.085,y+.23+top*.35,s*.15,.031,.036],[x-.10-top*.16,y+.18+top*.86,s*.16,.005]],earPink);
        if(raccoon)oval(x+.034,y+.076,s*.159,.108,.082,.026,dark);
        oval(x+.064,y+.089,s*.166,.035,.036,.017,nose);oval(x+.07,y+.101,s*.180,.008,.008,.004,gleam);
      }
      bind(6,[-.75*long,.56,0]);
      if(otter)tube([[-.68*long,.57,0,.185,.19],[-.88*long,.44,0,.17,.14],[-1.17*long,.25,0,.13,.10],[-1.54*long,.17,0,.078,.06],[-1.89*long,.13,0,.007]],coat,belly);
      else if(beaver)tube([[-.70,.46,0,.10,.08],[-.87,.23,0,.12,.057],[-1.18,.12,0,.235,.058],
        [-1.50,.10,0,.227,.052],[-1.69,.10,0,.12,.03],[-1.77,.096,0,.008,.009]],dark,belly,14);
      else if(muskrat)tube([[-.73,.45,0,.06,.083],[-1.01,.24,0,.048,.068],[-1.43,.12,0,.034,.051],
        [-1.96,.09,0,.014,.035],[-2.12,.12,0,.003,.006]],face,dark,10);
      else if(canid)tube([[-.9,.76,0,.085,.087],[-1.07,.63,0,.14,.16],[-1.34,.48,0,fox?.178:.122,.15],
        [-1.61,.35,0,.118,.106],[-1.83,.40,0,.06,.07],[-1.98,.42,0,.005]],coat,fox?light:dark,14);
      else if(raccoon){
        const tail=i=>[-.69-i*.113,.46-i*.033,0,.132*(1.-i*.105),.122*(1.-i*.105)];
        for(let j=0;j<8;j++)tube([tail(j),tail(j+1)],j%2?coat:dark,j%2?light:dark,12);
      }else oval(-.79*long,.63,0,hare?.12:.076,hare?.13:.08,.094,coat,hare?light:belly);
      legX=[.33*long,-.52*long];legZ=otter||canid?.173:.188;legTop=canid?.77:hare?.565:.60;
    }
    for(let end=0;end<2;end++)for(let sideIdx=0;sideIdx<2;sideIdx++){
      const s=sideIdx?1:-1,x=legX[end],z=s*legZ,top=legTop;
      bind(2+end*2+sideIdx,[x,top,z]);
      const bulk=quad?(bison?1.68:moose?1.05:1):bear?1.9:1.15;
      tube([[x,top,z,.091*bulk,.105*bulk],[x+(end?.075:-.015),top*.83,z,.095*bulk,.100*bulk],
        [x+(end?.105:-.018),top*.62,z,.068*bulk,.069*bulk],[x+(end?-.047:.018),top*.39,z,.051*bulk,.051*bulk],
        [x+(end?-.068:.012),top*.25,z,.033*bulk,.038*bulk],[x+(end?-.045:.025),.07,z,.028*bulk,.034*bulk]],
        coat,belly,10);
      const foot=x+(end?-.038:.023);
      oval(foot+(hare&&end?.095:.026),.047,z,hare&&end?.17:bear?.105:otter?.103:.067,.046,.042*bulk,quad?dark:face);
    }
    const geo=new T.BufferGeometry();
    geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    geo.setAttribute('boneKind',new T.Float32BufferAttribute(joints,1));geo.setAttribute('jointRoot',new T.Float32BufferAttribute(roots,3));
    geo.setIndex(indices);geo.computeVertexNormals();
    const exposure=new T.InstancedBufferAttribute(new Float32Array(40),1);geo.setAttribute('sunAccess',exposure);
    const count=40;const pose=new T.InstancedBufferAttribute(new Float32Array(count*4),4);pose.setUsage(T.DynamicDrawUsage);geo.setAttribute('motion',pose);
    const mat=new T.MeshStandardMaterial({roughness:otter?.43:.95,metalness:0,vertexColors:true,side:T.FrontSide});
    mat.onBeforeCompile=shader=>{
      shader.uniforms.wildCoat={value:coatTexture};
      const lib=`
        attribute float boneKind;attribute vec3 jointRoot;attribute vec4 motion;
        attribute float sunAccess;varying float wildSun;varying vec3 coatP;
        vec3 flex(vec3 q, float pitch, float yaw){
          vec3 p=vec3(cos(pitch)*q.x-sin(pitch)*q.y,sin(pitch)*q.x+cos(pitch)*q.y,q.z);
          return vec3(cos(yaw)*p.x-sin(yaw)*p.z,p.y,sin(yaw)*p.x+cos(yaw)*p.z);
        }
        vec2 angles(){float k=boneKind;
          if(k<.5)return vec2(0.);
          if(k<1.5)return motion.zw;
          if(k>5.5)return vec2(.075*sin(motion.x*.67),.105*sin(motion.x*.8));
          float shift=(k==2.?0.:k==3.?3.14159:k==4.?3.68:.58);
          return vec2(motion.y*sin(motion.x+shift),0.);
        }`;
      shader.vertexShader=lib+'\n'+shader.vertexShader.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n vec2 limb=angles();objectNormal=flex(objectNormal,limb.x,limb.y);')
        .replace('#include <begin_vertex>','#include <begin_vertex>\n wildSun=sunAccess;coatP=position;transformed=jointRoot+flex(position-jointRoot,limb.x,limb.y);');
      shader.fragmentShader='uniform sampler2D wildCoat;varying vec3 coatP;varying float wildSun;\n'+shader.fragmentShader.replace('#include <lights_fragment_end>','#include <lights_fragment_end>\n reflectedLight.directDiffuse*=mix(.12,.86,wildSun);reflectedLight.indirectDiffuse*=mix(.47,.83,wildSun);').replace('#include <color_fragment>',`
        #include <color_fragment>
        vec3 p=coatP*151.; float hair=sin(p.y*2.7+sin(p.x*.74+p.z)+sin(p.z*2.35+p.x*.19));
        float strands=(1.-smoothstep(.3,2.,length(fwidth(p))))*(.045*hair+.025*sin(p.y*5.1+p.z*1.5));
        vec2 furUV=vec2(coatP.x+.22*coatP.y,coatP.y+.78*coatP.z)*vec2(2.35,2.8);
        float guard=texture2D(wildCoat,furUV).r-.5;
        float tufts=texture2D(wildCoat,furUV*.31+vec2(.17,.44)).r-.5;
        diffuseColor.rgb*=.83*(1.+1.10*guard+.41*tufts+strands+.046*sin(coatP.x*13.+1.5*sin(coatP.y*17.+coatP.z*9.)));
      `);
    };
    const mesh=new T.InstancedMesh(geo,mat,count);mesh.name=spec.name+(horns?' · adult male':'');mesh.count=0;mesh.frustumCulled=false;
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);collection.add(mesh);return mesh;
  }
  function begin(){shadow.count=0;for(const m of meshes.values())m.count=0;}
  function draw(a){
    const key=a.id+(a.horns?'*':'');let m=meshes.get(key);if(!m){m=build(a.id,a.horns);meshes.set(key,m);}
    if(m.count>=m.instanceMatrix.count)return false;
    const i=m.count++,h=a.height;transform.rotation.order='YXZ';transform.rotation.set(-a.roll,-a.heading,a.grade);
    transform.position.set(a.x,a.feetY+a.bob,a.z);transform.scale.setScalar(h);transform.updateMatrix();
    m.geometry.attributes.sunAccess.setX(i,a.sunAccess??1);m.setMatrixAt(i,transform.matrix);m.geometry.attributes.motion.setXYZW(i,a.phase,a.stride,a.headPitch,a.headTurn);
    if(shadow.count<96){
      shadowTransform.rotation.copy(transform.rotation);shadowTransform.rotateX(-Math.PI/2);
      shadowTransform.position.set(a.x,a.feetY+.055,a.z);shadowTransform.scale.set(1.8*h,.75*h,1);
      shadowTransform.updateMatrix();shadow.setMatrixAt(shadow.count++,shadowTransform.matrix);
    }return true;
  }
  function end(){shadow.visible=shadow.count>0;shadow.instanceMatrix.needsUpdate=true;for(const m of meshes.values()){
    m.visible=m.count>0;if(!m.visible)continue;m.instanceMatrix.needsUpdate=true;m.geometry.attributes.motion.needsUpdate=true;m.geometry.attributes.sunAccess.needsUpdate=true;}}
  // A salt-washed ledge gives the small coastal otter somewhere to haul out.
  // Use the same analytic top for the mesh, its paws and aircraft clearance.
  function haulout(p,surface){
    const vertices=[],indices=[],uv=[],colors=[],rings=12,steps=40;
    const angle=.43,ca=Math.cos(angle),sa=Math.sin(angle),rx=2.15,rz=1.19;
    const warp=a=>1+.081*Math.sin(3*a+.6)+.046*Math.sin(5*a-.9)+.031*Math.sin(8*a);
    function dimensions(x,z){
      const dx=x-p.x,dz=z-p.z,u=(ca*dx+sa*dz)/rx,v=(-sa*dx+ca*dz)/rz;
      return Math.hypot(u,v)/warp(Math.atan2(v,u));
    }
    const relief=(q,u,v)=>Math.max(-.09,.43*(1-q**3)+.05*Math.cos(2.55*u-1.67*v)-.027*Math.sin(5.1*v+u));
    const top=(x,z)=>{if(Math.abs(x-p.x)>2.6||Math.abs(z-p.z)>2.3)return -Infinity;
      const r=dimensions(x,z);return r>1?-Infinity:surface(x,z)+relief(r,x-p.x,z-p.z);};
    const col=new T.Color();
    for(let j=0;j<=rings;j++)for(let i=0;i<steps;i++){
      const a=i*2*Math.PI/steps,q=j/rings,k=q*warp(a),u=rx*Math.cos(a)*k,v=rz*Math.sin(a)*k;
      const x=ca*u-sa*v,z=sa*u+ca*v,h=relief(q,x,z),px=p.x+x,pz=p.z+z;
      vertices.push(px,surface(px,pz)+h-(j===rings?.10:0),pz);uv.push(x*.65+.5,z*.65+.5);
      const seam=Math.sin(3.5*x+5.75*z+.66*Math.sin(2.9*x));
      const crystal=.09*Math.pow(Math.max(0.,seam),7)+.035*Math.cos(7.3*x-2.1*z);
      col.setRGB(.87+crystal,.91+crystal,.95+crystal).multiplyScalar(.63+.37*Math.max(0,1-q**5));
      colors.push(col.r,col.g,col.b);
      if(j){const b=j*steps+(i+1)%steps,c=j*steps+i;indices.push(c-steps,b-steps,c,b-steps,b,c);}
    }
    const geom=new T.BufferGeometry();geom.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
    geom.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geom.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    geom.setIndex(indices);geom.computeVertexNormals();
    const stone=new T.TextureLoader().load('shore-stone.webp');stone.wrapS=stone.wrapT=T.RepeatWrapping;
    stone.colorSpace=T.SRGBColorSpace;
    const mat=new T.MeshStandardMaterial({map:stone,vertexColors:true,roughness:.76,side:T.DoubleSide});
    const ledge=new T.Mesh(geom,mat);ledge.name='Wave-washed otter ledge';ledge.receiveShadow=true;scene.add(ledge);return top;
  }
  return {begin,draw,end,haulout};
};
