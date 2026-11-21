// The NPS dune enclosure, lagoon and shell strand occupy separate habitats
// behind Newport Cove. Coordinates are metres east/south of the Acadia origin.
(()=>{
  const dune=[[427,-1025],[442,-1036],[460,-1049],[459,-1073],[469,-1110],[481,-1143],[498,-1145],[520,-1130],[547,-1113],[565,-1101],[572,-1070],[584,-1049],[606,-1043],[612,-1034],[596,-1025],[567,-1018],[536,-1019],[499,-1019],[471,-1018],[445,-1019]];
  const lagoon=[[391,-1257],[422,-1255],[469,-1240],[500,-1225],[523,-1203],[549,-1175],[569,-1151],[581,-1126],[589,-1090],[605,-1068],[623,-1054],[628,-1038],[644,-1024],[681,-1009],[698,-988],[690,-987],[661,-1013],[628,-1028],[613,-1040],[588,-1046],[570,-1063],[565,-1095],[551,-1110],[532,-1122],[508,-1133],[480,-1141],[456,-1146],[431,-1157],[415,-1170],[410,-1190],[397,-1207],[407,-1224],[391,-1231]];
  function inside(x,z,loop){
    let result=false;
    for(let i=0,j=loop.length-1;i<loop.length;j=i++){
      const a=loop[i],b=loop[j];
      if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])result=!result;
    }
    return result;
  }
  window.acadiaLagoonAt=(x,z)=>x>=384&&x<=708&&z>=-1266&&z<=-972&&inside(x,z,lagoon);
  const openStrand=[[388,-967],[410,-993],[445,-1015],[493,-1018],[569,-1017],[609,-1028],[631,-1035],[686,-1006],[708,-976],[710,-946],[692,-940],[594,-963],[512,-967],[419,-950]];
  const stairClearing=[[431,-1024],[438,-1024],[439,-1017],[455,-1015],[456,-1008],[449,-1007],[431,-1009]];
  window.acadiaSandOpening=(x,z)=>{
    if(x<378||x>716||z< -1266||z> -929)return false;
    return inside(x,z,dune)||inside(x,z,lagoon)||inside(x,z,openStrand)||inside(x,z,stairClearing);
  };
  function buildSteps(T,scene,world){
    // NPS 2011 as-built plan 123-60454. The park records five concrete
    // flights and four landings, dressed in timber and stainless steel.
    const boxes=[],wood=[],steel=[],blocks=[],treads=[],placements=[];
    const calc=(x,z)=>world.elevation(x,z);
    let x=434.3,z=-1020.3,y=calc(x,z)+.10;
    let dx=.155,dz=.988;
    const upper=[x,z];
    function item(list,x,y,z,w,h,depth,angle){list.push([x,y,z,w,h,depth,angle]);}
    const trace=(len,endY,width)=>{
      const ex=x+dx*len,ez=z+dz*len;
      placements.push({x,z,ex,ez,y,endY,width});
      x=ex;z=ez;y=endY;
    };
    function floor(depth,width,rise){
      const h=.42+rise;
      item(boxes,x+dx*depth*.5,y-h*.5,z+dz*depth*.5,width,h,depth+.023,Math.atan2(dx,dz));
      treads.push({x:x+dx*depth*.5,z:z+dz*depth*.5,y,dx,dz,width,depth});
      trace(depth,y-rise,width);
    }
    for(const [j,count] of [6,10,9,7,7].entries()){
      if(j===1){dx=.994;dz=.113;}
      const width=j===4?3.74:2.42;
      for(let i=0;i<count;i++)floor(.31,width,.1778);
      if(j<4)floor([5.12,1.67,1.54,1.62][j],2.44,0);
    }
    const end=[x,z];
    // The elevation survey resolves the bluff beneath the stairs, and averages
    // over the individual concrete treads. Fit the continuous, seven-inch
    // staircase just clear of its supporting bank. Long flights have piers.
    const lift=Math.max(0,...treads.map(t=>calc(t.x,t.z)+.11-t.y));
    for(let i=0;i<treads.length;i++){
      const t=treads[i],p=placements[i];
      t.y+=lift;p.y+=lift;p.endY+=lift;boxes[i][1]+=lift;
      const gap=t.y-calc(t.x,t.z);
      if(gap>.48){
        const pierCount=t.depth>2.8?2:1;
        if(i%3===0||t.depth>1.1)for(let n=0;n<pierCount;n++)for(const side of [-1,1]){
          const along=pierCount===1?0:(n-.5)*t.depth*.74,across=side*(t.width*.5-.30);
          const sx=t.x+t.dx*along+t.dz*across,sz=t.z+t.dz*along-t.dx*across;
          const h=Math.max(.18,t.y-calc(sx,sz)+.10);
          item(blocks,sx,t.y-h*.5,sz,.35,h,.36,Math.atan2(t.dx,t.dz));
        }
      }
    }
    // Rejoin the bluff path at the upper landing with a short graded approach.
    const startY=treads[0].y,groundY=calc(upper[0],upper[1]-3.5);
    for(let i=0;i<6;i++){
      const f=(i+.5)/6,pz=upper[1]-(1.-f)*3.5,px=upper[0]-.52*(1.-f);
      const top=groundY*(1.-f)+startY*f,bottom=Math.min(calc(px,pz)-.08,top-.12);
      item(boxes,px,(top+bottom)*.5,pz,2.39,top-bottom,.67,.155);
    }

    function beam(list,ax,az,ay,bx,bz,by,width,height){
      const from=new T.Vector3(ax,ay,az),to=new T.Vector3(bx,by,bz);
      const delta=to.clone().sub(from),centre=from.clone().lerp(to,.5);
      const rotation=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1),delta.clone().normalize());
      list.push(new T.Matrix4().compose(centre,rotation,new T.Vector3(width,height,delta.length())));
    }
    const wm=[],sm=[];
    for(const side of [-1,1]){
      let prev=null,run=0;
      for(let i=0;i<placements.length;i++){
        const p=placements[i],vx=p.ex-p.x,vz=p.ez-p.z,dist=Math.hypot(vx,vz);
        const sx=p.x+side*vz/dist*(p.width*.5-.075),sz=p.z-side*vx/dist*(p.width*.5-.075);
        const force=i===0||i===placements.length-1||dist>1||placements[i-1]&&Math.hypot(placements[i-1].ex-placements[i-1].x,placements[i-1].ez-placements[i-1].z)>1;
        if(run>1.53||force){
          item(wood,sx,p.y+.51,sz,.115,1.02,.115,Math.atan2(vx,vz));
          if(prev){
            beam(wm,...prev.slice(0,2),prev[2]+.38,sx,sz,p.y+.38,.085,.13);
            beam(wm,...prev.slice(0,2),prev[2]+.77,sx,sz,p.y+.77,.085,.13);
            beam(sm,...prev.slice(0,2),prev[2]+1.03,sx,sz,p.y+1.03,.044,.045);
          }
          prev=[sx,sz,p.y];run=0;
        }
        run+=dist;
      }
    }
    // Long salvaged granite blocks hold the bluff behind the upper landing.
    for(let i=0;i<8;i++){
      const px=upper[0]-3.8+(i%4)*2.1,pz=upper[1]-1.9-Math.floor(i/4)*1.14;
      item(blocks,px,calc(px,pz)+.26,pz,1.88,.52,.62,.12+(i%3)*.021);
    }
    const unit=new T.BoxGeometry(1,1,1);
    function draw(name,items,mat,extra=[]){
      if(!items.length&&!extra.length)return;
      // Sample the same weak cool sky that lights the game’s one-metre
      // cliff and open pale shell material. MeshStandard's global fill is
      // heavily occluded beneath the wooded bluff. Retain the wood/metal
      // specular and the darker vertical riser beneath each lit tread.
      mat.onBeforeCompile=shader=>{
        shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          float upward=max(0.,dot(geometryNormal,viewMatrix[1].xyz));
          reflectedLight.indirectDiffuse+=diffuseColor.rgb*vec3(.058,.071,.095)*(.35+.65*upward);`);
      };
      const inst=new T.InstancedMesh(unit,mat,items.length+extra.length);
      const d=new T.Object3D();let i=0;
      for(const [x,y,z,w,h,depth,angle] of items){
        d.position.set(x,y,z);d.scale.set(w,h,depth);d.rotation.y=angle;d.updateMatrix();inst.setMatrixAt(i++,d.matrix);
      }
      for(const matrix of extra)inst.setMatrixAt(i++,matrix);
      inst.computeBoundingSphere();inst.name=name;scene.add(inst);
    }
    draw('Sand Beach · 39 concrete treads and four landings',boxes,new T.MeshStandardMaterial({color:0xadab9f,roughness:.94}));
    draw('Sand Beach · weathered timber stair rails',wood,new T.MeshStandardMaterial({color:0x9f9987,roughness:.90}),wm);
    draw('Sand Beach · stainless handrails',steel,new T.MeshStandardMaterial({color:0xb9c8cc,metalness:.55,roughness:.36}),sm);
    draw('Sand Beach · granite overlook blocks',blocks,new T.MeshStandardMaterial({color:0x88837e,roughness:.92}));
    return (x,z)=>{
      if(x<upper[0]-4||x>end[0]+4||z<upper[1]-4||z>end[1]+4)return -Infinity;
      for(const t of treads){
        const vx=x-t.x,vz=z-t.z;
        if(Math.abs(vx*t.dx+vz*t.dz)<=t.depth*.5+.02&&Math.abs(vx*t.dz-vz*t.dx)<=t.width*.5)return t.y;
      }
      return -Infinity;
    };
  }

  function addDuneGrass(T,scene,world,field,clock){
    // The NPS cultural landscape inventory identifies a stand of American
    // beach grass on this ridge. Read its geographic footprint from NAIP.
    const image=field.image,canvas=document.createElement('canvas');
    canvas.width=image.width;canvas.height=image.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,canvas.width,980).data;
    const coverage=(x,z)=>{
      const i=Math.floor((x-320)*2),j=Math.floor((z+1340)*2);
      return i<0||i>=1050||j<0||j>=980?0:data[(j*1050+i)*4+1]/255;
    };
    let seed=1671;
    const random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
    const pos=[],attrs=[],tris=[];
    for(let blade=0;blade<7;blade++){
      const angle=2*Math.PI*(blade*.38196+random()*.10),dx=Math.cos(angle),dz=Math.sin(angle);
      const h=.46+random()*.56,lean=.12+random()*.40,ox=(random()-.5)*.21,oz=(random()-.5)*.21;
      const width=.022+random()*.033,phase=random(),first=pos.length/3;
      // Each curved ribbon needs two basal vertices, two at its bend,
      // and one at the tip. Vertex lighting resolves its folded sides.
      for(const a of [0,.55]){
        const spread=lean*a*a,w=width*(1.-a*.79);
        const x=ox+dx*spread,z=oz+dz*spread,y=h*(a-.12*a*a);
        pos.push(x-dz*w,y,z+dx*w,x+dz*w,y+w*.17,z-dx*w);
        attrs.push(a,.66,phase,a,1.,phase);
      }
      pos.push(ox+dx*lean,h*.88,oz+dz*lean);attrs.push(1.,.85,phase);
      tris.push(first,first+2,first+1,first+1,first+2,first+3,first+2,first+4,first+3);
    }
    const geo=new T.BufferGeometry();
    geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));
    geo.setAttribute('reed',new T.Float32BufferAttribute(attrs,3));geo.setIndex(tris);geo.computeBoundingSphere();
    const mat=new T.ShaderMaterial({side:T.DoubleSide,uniforms:{clock},
      vertexShader:`attribute vec3 reed;varying float tip,face,reedTone;
        uniform float clock;
        void main(){vec4 p=instanceMatrix*vec4(position,1.);tip=reed.x;face=reed.y;reedTone=reed.z;
          float wind=sin(p.x*.061+p.z*.037+clock*1.52)+.42*sin(p.z*.20-clock*2.);
          p.xz+=vec2(.056,-.028)*wind*tip*tip;
          gl_Position=projectionMatrix*modelViewMatrix*p;}`,
      fragmentShader:`varying float tip,face,reedTone;
        void main(){vec3 stem=mix(vec3(.014,.022,.012),vec3(.074,.076,.054),smoothstep(.28,1.,tip));
          gl_FragColor=vec4(stem*(.60+.48*face)*(.79+.28*reedTone),1.);
          #include <colorspace_fragment>
        }`});
    mat.userData.acadiaNight=true;
    const transforms=[],dummy=new T.Object3D();
    for(let z=-1143;z< -1011;z+=1.43)for(let x=427;x<616;x+=1.43){
      const px=x+random()*1.42,pz=z+random()*1.42,c=coverage(px,pz);
      const patch=.52+.30*Math.sin(px*.18+pz*.061)+.21*Math.sin(pz*.31-px*.09);
      if(c<.18||random()>c*(.17+.81*patch))continue;
      const h=.55+.48*random()+.24*c;
      dummy.position.set(px,world.elevation(px,pz)-.025,pz);
      dummy.rotation.y=random()*Math.PI*2;dummy.scale.set(.64+h*.39,h,.71+h*.38);dummy.updateMatrix();transforms.push(dummy.matrix.clone());
    }
    const mesh=new T.InstancedMesh(geo,mat,transforms.length);
    for(let i=0;i<transforms.length;i++)mesh.setMatrixAt(i,transforms[i]);
    mesh.name='Sand Beach · American beach grass';mesh.computeBoundingSphere();scene.add(mesh);
    world.acadiaBeachGrass=mesh;
  }

  function addWrack(T,scene,world,run){
    // Broken windrows collect at the high-water line below the dune. Figure
    // 46 of the NPS inventory shows scattered dark wrack and occasional wood.
    const positions=[],tones=[];
    let seed=38161;
    const random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
    function ribbon(x,z,length,width,azimuth,lift,material){
      const segments=4+Math.round(length*.7),phase=random()*6.283,curve=(random()-.5)*.42;
      let older=null;
      for(let j=0;j<=segments;j++){
        const f=j/segments,along=(f-.5)*length;
        const lateral=curve*length*Math.sin(Math.PI*f)+.035*Math.sin(f*8.+phase);
        const px=x+along*Math.cos(azimuth)-lateral*Math.sin(azimuth),pz=z+along*Math.sin(azimuth)+lateral*Math.cos(azimuth);
        const h=world.elevation(px,pz)+.025+lift*(.35+.65*Math.sin(f*Math.PI));
        const widthAtPoint=width*(.12+.88*Math.sin(Math.PI*f)**.48);
        const sideX=-Math.sin(azimuth)*widthAtPoint,sideZ=Math.cos(azimuth)*widthAtPoint;
        const next=[[px+sideX,h,pz+sideZ],[px,h+widthAtPoint*.38,pz],[px-sideX,h,pz-sideZ]];
        if(older){
          for(const [end,index] of [[older,0],[next,0],[older,1],[older,1],[next,0],[next,1],[older,1],[next,1],[older,2],[older,2],[next,1],[next,2]]){
            positions.push(...end[index]);const light=(index===1?1.16:.85);
            tones.push(material[0]*light,material[1]*light,material[2]*light);
          }
        }
        older=next;
      }
    }
    for(let i=1;i<run.length;i++){
      const [ax,az]=run[i-1],[bx,bz]=run[i],len=Math.hypot(bx-ax,bz-az);
      const groups=Math.round(len*.28);
      for(let n=0;n<groups;n++){
        const t=random(),x=ax+(bx-ax)*t,z=az+(bz-az)*t+1.6+random()*4.2;
        const angle=Math.atan2(bz-az,bx-ax);
        const fragments=3+Math.round(random()*11);
        for(let j=0;j<fragments;j++){
          const px=x+(random()-.5)*2.3,pz=z+(random()-.5)*.8;
          ribbon(px,pz,.18+random()*.73,.023+random()*.050,angle+(random()-.5)*1.65,random()*.08,[.036,.026,.015]);
        }
        if(n===0&&i%3===0){
          const drift=1.15+random()*1.62;
          ribbon(x,z,drift,.050+random()*.085,angle+(random()-.5)*.61,.08,[.19,.14,.09]);
        }
      }
    }
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    geometry.setAttribute('color',new T.Float32BufferAttribute(tones,3));
    geometry.computeVertexNormals();
    const material=new T.MeshStandardMaterial({color:0xffffff,vertexColors:true,side:T.DoubleSide,roughness:.95});
    const mesh=new T.Mesh(geometry,material);mesh.name='Sand Beach · broken high-water wrack line';scene.add(mesh);
  }

  function addDuneBoundary(T,scene,world){
    // NPS photograph, figure 46, shows widely separated narrow stakes and a
    // low rope in front of the eroded dune toe. The surveyed rim curves east.
    const run=[[447,-1015],[461,-1019],[478,-1020],[495,-1019],[516,-1019],[541,-1018],[563,-1018],[581,-1019],[598,-1023],[610,-1030]];
    addWrack(T,scene,world,run);
    const nodes=[];let traveled=0,target=0;
    for(let i=1;i<run.length;i++){
      const [ax,az]=run[i-1],[bx,bz]=run[i],dx=bx-ax,dz=bz-az,length=Math.hypot(dx,dz);
      for(;target<=traveled+length;target+=8.25){
        const t=(target-traveled)/length,x=ax+t*dx,z=az+t*dz;
        nodes.push(new T.Vector3(x,world.elevation(x,z),z));
      }
      traveled+=length;
    }
    const stakes=new T.InstancedMesh(new T.CylinderGeometry(.028,.034,.93,5),new T.MeshStandardMaterial({color:0x9a8d70,roughness:.96}),nodes.length);
    const d=new T.Object3D(),line=[];
    for(let i=0;i<nodes.length;i++){
      const p=nodes[i];d.position.set(p.x,p.y+.45,p.z);
      d.rotation.set(.07*Math.sin(i),i*.64,.084*Math.cos(i*2));d.scale.set(1,1,1);
      d.updateMatrix();stakes.setMatrixAt(i,d.matrix);
      if(!i)continue;
      const prev=nodes[i-1];
      for(let j=0;j<5;j++){
        for(const k of [j,j+1]){
          const t=k/5;
          const x=prev.x+t*(p.x-prev.x),z=prev.z+t*(p.z-prev.z);
          line.push(x,(1.-t)*prev.y+t*p.y+.69-.12*Math.sin(Math.PI*t),z);
        }
      }
    }
    stakes.name='Sand Beach · dune protection stakes';stakes.computeBoundingSphere();scene.add(stakes);
    const strand=new T.BufferGeometry();strand.setAttribute('position',new T.Float32BufferAttribute(line,3));
    const rope=new T.LineSegments(strand,new T.LineBasicMaterial({color:0x707065,transparent:true,opacity:.70}));
    rope.name='Sand Beach · dune protection rope';scene.add(rope);
  }

  window.addAcadiaSandBeach=(T,scene,world)=>{
    const habitat=world.blockVegetationAt,cover=world.groundCover;
    world.blockVegetationAt=(x,z,y)=>window.acadiaSandOpening(x,z)||habitat(x,z,y);
    world.groundCover=(x,z)=>window.acadiaSandOpening(x,z)?-1:cover(x,z);
    const beach=world.landmarks.find(place=>place.name==='Sand Beach');
    if(beach)beach.approach=[675,-981,435,-1011,13,-8,4];
    const deck=buildSteps(T,scene,world),baseClearance=world.clearance;
    world.clearance=(x,z,altitude)=>Math.max(baseClearance(x,z,altitude),deck(x,z));
    const seen=new Set(),clock={value:0};
    const field=new T.TextureLoader().load('acadia-sand-beach.webp',()=>addDuneGrass(T,scene,world,field,clock));
    field.anisotropy=6;
    addDuneBoundary(T,scene,world);
    const sampled=`
      uniform sampler2D sandBeachField;
      uniform float sandBeachTime;
      vec2 acadiaBeachUV(vec2 p){
        vec2 uv=(p-vec2(320.,-1340.))/vec2(525.,490.);
        return vec2(uv.x,1.-uv.y*980./1324.);
      }
      float acadiaShellSurface(vec2 metres){
        vec2 uv=fract(metres);
        return texture2D(sandBeachField,vec2((528.5+511.*uv.x)/1050.,1.-(1066.5+255.*uv.y)/1324.)).r;
      }`;
    scene.traverse(object=>{
      const mat=object.material;
      if(!mat?.uniforms?.coastalNormals||seen.has(mat))return;
      seen.add(mat);
      Object.assign(mat.uniforms,{sandBeachField:{value:field},sandBeachTime:clock});
      const anchor='float dep=1.-exp(-d*';
      mat.fragmentShader=sampled+mat.fragmentShader.replace(anchor,`
        if(xz.x>320.&&xz.x<845.&&xz.y> -1340.&&xz.y< -850.){
          vec4 field=texture2D(sandBeachField,acadiaBeachUV(xz));
          float light=.76+.24*skyView;
          if(field.r>.005){
            // Finely ground shell, a low wet berm and small runnels. The NPS
            // sample is photographed beside a 19 mm coin. Fine fragments
            // disappear naturally before they grow into glitter or gravel.
            float footprint=max(length(dFdx(xz)),length(dFdy(xz)));
            float shellGrain=.46;
            if(footprint<.018){
              vec2 uv=fract(xz/vec2(.022,.012));
              vec2 micro=vec2((.5+uv.x*207.)/1050.,1.-(980.5+uv.y*83.)/1324.);
              shellGrain=dot(texture2D(sandBeachField,micro).rgb,vec3(.31,.56,.13));
            }
            float wet=1.-smoothstep(.17,.91,field.a);
            float ridges=(.36+.18*sin(xz.x*.071+xz.y*.042))*
              sin(xz.y*3.3+xz.x*.46+2.1*sin(xz.x*.067)+.43*sin(xz.y*.39))*
              (1.-smoothstep(.20,.85,footprint));
            float surface=.50;
            if(footprint<.68){
              // OCLP 2024 shows low ripples, tracks and runnels at metre
              // scale. Break long repetitions and filter them by footprint.
              vec2 broad=mat2(.943,.332,-.332,.943)*xz;
              broad+=.30*vec2(sin(xz.x*.071+xz.y*.042),sin(xz.y*.085));
              float tex=acadiaShellSurface(broad/vec2(7.5,4.7));
              float second=acadiaShellSurface((mat2(.813,-.583,.583,.813)*xz)/vec2(16.3,8.1)+.371);
              surface=mix(.5,mix(tex,second,.29+.18*sin(xz.x*.17+xz.y*.063)),1.-smoothstep(.26,.68,footprint));
            }
            vec3 sand=mix(vec3(.108,.103,.104),vec3(.030,.033,.039),wet);
            sand*=.30+1.40*surface;
            sand*=light*(.61+.74*field.a)*(.91+.19*shellGrain+wet*.055*ridges);
            c=mix(c,sand,field.r);
          }
          if(field.g>.005){
            vec3 turf=vec3(.030,.035,.030)*light*(.53+.93*field.a);
            c=mix(c,turf,field.g*.88);
          }
          if(field.b>.005){
            // Beehive Lagoon stores tannin-rich water. The 3DEP surface is
            // 2.11 m; the measured outlet sill is about 0.25 m higher.
            float t=sandBeachTime;
            vec2 wave=vec2(sin(dot(xz,vec2(1.17,.48))-t*.72)+.39*sin(xz.y*1.97+t*.63),
                           cos(dot(xz,vec2(.68,-.89))+t*.59)+.36*cos(xz.x*1.21-t*.81))*.022;
            vec3 reflectDir=reflect(normalize(wp-cameraPosition),normalize(vec3(wave.x,1.,wave.y)));
            vec2 uv=vec2(.5+atan(reflectDir.z,reflectDir.x)*.159155,.5+asin(clamp(reflectDir.y,-1.,1.))*.31831);
            vec3 sky=pow(texture2D(sandBeachField,vec2((1.5+uv.x*511.)/1050.,1.-(1066.5+(1.-uv.y)*255.)/1324.)).rgb,vec3(2.2));
            float f=.030+.97*pow(1.-max(.01,reflectDir.y),5.);
            float treeLine=0.;
            vec2 horizontal=normalize(reflectDir.xz+vec2(.0001));
            for(int k=0;k<5;k++){
              float reach=10.*exp2(float(k));
              vec2 bank=xz+horizontal*reach;
              vec4 shoreClass=texture2D(sandBeachField,acadiaBeachUV(bank));
              float cover=texture2D(canopyMap,bank/(2.*halfMap)+.5).r;
              float limit=(1.3+8.*cover)/reach;
              treeLine=max(treeLine,(1.-smoothstep(limit*.72,limit*1.17,reflectDir.y))*(1.-shoreClass.b));
            }
            vec3 reflected=mix(sky,vec3(.004,.007,.009),treeLine*.89);
            vec3 pond=mix(vec3(.009,.007,.009)*(.66+.64*field.a),reflected,f);
            float standing=1.-smoothstep(2.16,2.33,wp.y);
            c=mix(c,pond,field.b*standing);
          }
        }
        `+anchor);
      mat.needsUpdate=true;
    });
    const update=world.update.bind(world);
    world.update=(dt,t,p)=>{clock.value=t;update(dt,t,p);};
  };
})();
