// Submerged cobbles, gravel banks, and wind-bent grass at metre and centimetre scales.
window.addHabitat = function addHabitat(THREE,scene,world,region) {
  const extent={alaska:4800,swiss:2000,canyon:3200}[region];
  const arid=region==='canyon', clock={value:0};
  const loader=new THREE.TextureLoader();
  function repeat(file,color=false) {
    const texture=loader.load(file);
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.anisotropy=4;
    if(color)texture.colorSpace=THREE.SRGBColorSpace;
    return texture;
  }
  let habitatPixels, resolution;
  const field=loader.load('habitat-'+region+'.png',texture=>{
    const canvas=document.createElement('canvas');
    resolution=canvas.width=canvas.height=texture.image.width;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(texture.image,0,0);
    habitatPixels=ctx.getImageData(0,0,resolution,resolution).data;
  });
  const pebble=repeat('shore-pebbles.webp');
  const meadow=arid?null:repeat('shore-meadow.webp');
  for(const mesh of scene.children){
    if(!mesh.isWater)continue;
    const mat=mesh.material;
    Object.assign(mat.uniforms,{habitat:{value:field},pebbleBed:{value:pebble},bankWidth:{value:extent*2}});
    const optics=`
      vec2 loc=worldPosition.xz;
      vec2 bankUv=vec2(loc.x,-loc.y)/bankWidth+.5;
      float bank=(texture2D(habitat,bankUv).r-.5)*96.;
      float waterDepth=clamp(-bank*${region==="alaska"?".23":".15"},.035,6.);
      float nearBank=1.-smoothstep(12.,38.,-bank);
      float eyeRange=length(worldPosition.xyz-eye);
      if(nearBank>.001 && eyeRange<250.){
        // Shallow waves refract the stones and focus moving streaks of light on the bed.
        vec2 drift=loc*.18+vec2(time*.27,-time*.13);
        vec2 fold=texture2D(normalSampler,drift*.24).rg-.5;
        vec2 st=loc*.43+(fold*.09+surfaceNormal.xz*.13)*min(waterDepth,2.);
        vec3 bed=pow(texture2D(pebbleBed,st).rgb,vec3(2.12));
        float caustic=pow(max(0.,1.-abs(sin(dot(loc,vec2(2.4,1.3))+time*1.8+fold.x*3.7))),5.);
        bed*=vec3(.73,1.02,1.02)*(1.05+.9*caustic);
        vec3 transmission=exp(-vec3(.82,.32,.23)*waterDepth);
        float clear=nearBank*(1.-smoothstep(100.,250.,eyeRange))*(1.-reflectance);
        outgoingLight=mix(outgoingLight,bed*transmission+outgoingLight*(1.-transmission),clear);
        float wave=sin(bank*3.3+time*2.3+3.*fold.x);
        outgoingLight+=vec3(.13,.16,.15)*pow(max(0.,wave),12.)*(1.-smoothstep(.25,2.4,abs(bank)))*clear;
      }`;
    mat.fragmentShader='uniform sampler2D habitat,pebbleBed;uniform float bankWidth;\n'+
      mat.fragmentShader.replace('gl_FragColor = vec4( outgoingLight, alpha );',optics+'\n gl_FragColor = vec4( outgoingLight, alpha );');
  }

  // The square survey tiles have a known regular grid. Place blades and cobbles on
  // the triangles actually displayed, including coarse sections of the survey.
  const gridTiles=[];
  const terrainMaterials=new Set();
  for(const m of scene.children){
    const mat=m.material;
    if(!mat?.isShaderMaterial || !(mat.uniforms.surveyNormals||mat.uniforms.localPhoto||mat.uniforms.flow&&mat.uniforms.strata))continue;
    terrainMaterials.add(mat);
    const g=m.geometry, pos=g.getAttribute('position');
    g.computeBoundingBox();
    const box=g.boundingBox, side=box.max.x-box.min.x, depth=box.max.z-box.min.z;
    let row=1;
    while(row<pos.count && pos.getZ(row)===pos.getZ(0))row++;
    if(row<2||pos.count%row!==0)continue;
    gridTiles.push({pos,row,cols:pos.count/row,left:box.min.x,top:box.min.z,side,depth});
  }
  // Swiss and Alaskan low terrain transition from map photography to metre-scale scanned ground.
  if(!arid){
    const loose=repeat('shore-cobble.webp');
    for(const mat of terrainMaterials){
      const sw=region==='swiss', name=sw?'wp':'p', col=sw?'rgb':'base', norm=sw?'n':'nn';
      const anchor=sw?'vec2 vd=(wp.xz+4000.)/8000.;':'float haze=';
      if(!mat.fragmentShader.includes(anchor))continue;
      Object.assign(mat.uniforms,{habitatGround:{value:field},habitatClock:clock,beachScan:{value:loose},sodScan:{value:meadow}});
      const layers=`
        if(d<250.){
          vec2 pos=${name}.xz, uvbank=vec2(pos.x,-pos.y)/${(2*extent).toFixed(1)}+.5;
          vec3 bi=texture2D(habitatGround,uvbank).rgb;
          float bank=(bi.r-.5)*96., gentle=smoothstep(.63,.94,${norm}.y);
          float beach=(1.-smoothstep(7.,37.,abs(bank)))*gentle;
          float herb=smoothstep(.13,.72,bi.g)*gentle*(1.-beach);
          vec3 gravel=texture2D(beachScan,pos*.40).rgb;
          vec3 sward=texture2D(sodScan,pos*.37).rgb;
          vec3 groundColor=mix(gravel,sward,herb/(herb+beach+.001));
          float lightValue=clamp(dot(${col},vec3(.29,.58,.13))/.40,.51,1.42);
          float lapping=.60*sin(habitatClock*1.59+pos.x*.34+pos.y*.085)+.39*sin(habitatClock*2.21-pos.y*.72);
          float damp=1.-smoothstep(-.70,3.3,bank-.62*lapping);
          groundColor*=lightValue*mix(1.08,.66,damp);
          groundColor+=vec3(.045,.061,.067)*damp*pow(max(0.,dot(normalize(cameraPosition-${name}),reflect(-sun,${norm}))),18.);
          ${col}=mix(${col},groundColor,(1.-smoothstep(42.,240.,d))*max(herb,beach)*(1.-bi.b)*.94);
        }
      `;
      mat.fragmentShader='uniform float habitatClock;uniform sampler2D habitatGround,beachScan,sodScan;\n'+mat.fragmentShader.replace(anchor,layers+anchor);
    }
  }
  const tileMap=new Map();
  function surface(x,z){
    const key=Math.floor(x/8)+','+Math.floor(z/8);
    let t=tileMap.get(key);
    if(!t || x<t.left||z<t.top||x>=t.left+t.side||z>=t.top+t.depth){
      t=gridTiles.find(v=>x>=v.left&&z>=v.top&&x<v.left+v.side&&z<v.top+v.depth);
      if(!t)return world.elevation(x,z);
      tileMap.set(key,t);
    }
    const u=(x-t.left)/t.side*(t.row-1),v=(z-t.top)/t.depth*(t.cols-1);
    const i=Math.min(t.row-2,Math.floor(u)),j=Math.min(t.cols-2,Math.floor(v)),a=u-i,b=v-j,k=j*t.row+i;
    const h=t.pos;
    if(a+b<=1)return h.getY(k)*(1-a-b)+h.getY(k+1)*a+h.getY(k+t.row)*b;
    return h.getY(k+t.row+1)*(a+b-1)+h.getY(k+t.row)*(1-a)+h.getY(k+1)*(1-b);
  }
  const geo=new THREE.IcosahedronGeometry(1,1);
  const pos=geo.getAttribute('position');
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    const rough=1+.14*Math.sin(4*x+3*y)*Math.cos(5*z+2*y);
    pos.setXYZ(i,x*rough+.12*y,y*rough,z*rough);
  }
  geo.computeVertexNormals();
  const rockMat=new THREE.MeshStandardMaterial({map:repeat(arid?'rock.jpg':'shore-stone.webp',true),roughness:.78});
  const rock=new THREE.InstancedMesh(geo,rockMat,5000);
  // One tussock contains tapered, curved blades with differently lit faces and rooted shading.
  const blades=[],tints=[],indices=[];
  for(let i=0;i<24;i++){
    const a=i*2.39996,rad=.10*Math.sqrt(i/24),dx=Math.cos(a),dz=Math.sin(a);
    const h=.23+.23*(.5+.5*Math.sin(i*6.23+.7*i*i)),lean=.10+.17*(.5+.5*Math.sin(i*7.73));
    const start=blades.length/3;
    for(let step=0;step<4;step++){
      const f=step/3,w=(1-f*.97)*(.010+.006*(i%3)),r=rad+lean*f*f;
      for(const side of [-1,1]){
        blades.push(dx*r+dz*w*side,h*f*(1-.15*f),dz*r-dx*w*side);
        const lit=.38+.62*f, hue=.55+.45*Math.cos(i*3.);
        tints.push(lit*(arid?.68:.15+.11*hue),lit*(arid?.54:.27+.1*hue),lit*(arid?.27:.062));
      }
    }
    for(let s=0;s<3;s++){const j=start+s*2;indices.push(j,j+1,j+2,j+1,j+3,j+2);}
  }
  const grassGeo=new THREE.BufferGeometry();
  grassGeo.setAttribute('position',new THREE.Float32BufferAttribute(blades,3));grassGeo.setAttribute('color',new THREE.Float32BufferAttribute(tints,3));grassGeo.setIndex(indices);grassGeo.computeVertexNormals();
  const grassMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide});
  grassMat.onBeforeCompile=s=>{
    s.uniforms.habitatTime=clock;s.vertexShader='uniform float habitatTime;\n'+s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vec2 root=instanceMatrix[3].xz;
      float gust=sin(dot(root,vec2(.24,.11))+habitatTime*2.)+.4*sin(dot(root,vec2(.51,.36))-habitatTime*3.1);
      transformed.xz+=vec2(.27,.13)*gust*position.y*position.y;`);
  };
  const grass=new THREE.InstancedMesh(grassGeo,grassMat,3400);
  const wood=new THREE.InstancedMesh(new THREE.CylinderGeometry(.65,1,1,9,2),new THREE.MeshStandardMaterial({map:repeat('shore-bark.webp',true),color:0xc8bb99,roughness:.97}),480);
  const objects=[rock,grass,wood],tmp=new THREE.Object3D(),col=new THREE.Color(),up=new THREE.Vector3(0,1,0);
  for(const o of objects){o.count=0;o.frustumCulled=false;o.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(o);}
  function put(mesh,x,y,z,sx,sy,sz,ax,az,angle){
    if(mesh.count>=mesh.instanceMatrix.count)return;
    tmp.position.set(x,y,z);tmp.scale.set(sx,sy,sz);tmp.rotation.set(ax,angle,az);tmp.updateMatrix();mesh.setMatrixAt(mesh.count++,tmp.matrix);
  }
  function branch(x,z,angle,length,radius){
    if(wood.count>=wood.instanceMatrix.count)return;
    const dx=Math.cos(angle)*length,dz=Math.sin(angle)*length;
    const y1=surface(x,z)+radius*.55,y2=surface(x+dx,z+dz)+radius*.75;
    const dir=new THREE.Vector3(dx,y2-y1,dz);
    tmp.position.set(x+dx*.5,(y1+y2)*.5,z+dz*.5);tmp.scale.set(radius,dir.length(),radius*.84);
    tmp.quaternion.setFromUnitVectors(up,dir.normalize());tmp.updateMatrix();wood.setMatrixAt(wood.count++,tmp.matrix);
  }
  const cache=new Map();
  function populate(cx,cz){
    const entries=[];let seed=(Math.imul(cx,1376312589)^Math.imul(cz,668265263)^717)>>>0;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<126;i++){
      const x=(cx+random())*16,z=(cz+random())*16;
      const u=Math.floor((.5+x/(2*extent))*resolution),v=Math.floor((.5+z/(2*extent))*resolution);
      if(u<0||u>=resolution||v<0||v>=resolution)continue;
      const k=(v*resolution+u)*4, bank=(habitatPixels[k]/255-.5)*96,veg=habitatPixels[k+1]/255;
      if(bank < -2.5||habitatPixels[k+2]>134)continue;
      const h=surface(x,z), slope=Math.hypot(surface(x+1,z)-h,surface(x,z+1)-h);
      if(slope>1.15)continue;
      const chance=random(),angle=random()*Math.PI*2;
      if(i<64&&chance < (bank<25?.66:.07)*(1-.64*veg)){
        const b=random(),s=.052+.38*b**3+(i<2?.37*b:0);
        entries.push([0,x,h+s*.12,z,s*(1+random()*.6),s*(.39+random()*.46),s*(.66+random()*.43),random()*.34,random()*.3,angle,random()]);
      }else if(bank>1.8&&slope<.9&&chance<.025+veg*(arid?.65:1.65)){
        const s=.6+random()*1.08;
        entries.push([1,x,h-.065,z,s,s*(.62+.58*random()),s,0,0,angle,0]);
      }else if(i===1&&bank>0&&bank<7&&slope<.45){
        entries.push([2,x,h,z,1.8+4*random(),.08+.21*random(),0,0,0,angle,0]);
      }
    }
    return entries;
  }
  let prevX,prevZ,low=false;
  return function update(player,time){
    clock.value=time;
    const cx=Math.floor(player.x/16),cz=Math.floor(player.z/16),ground=world.height(player.x,player.z);
    // Leave the scene populated during short climbs near a hillside.
    const active=player.y-ground<(low?145:125);
    if(!habitatPixels||(active===low&&cx===prevX&&cz===prevZ))return;
    low=active;prevX=cx;prevZ=cz;
    for(const o of objects)o.count=0;
    if(!active)return;
    tileMap.clear();
    for(const key of cache.keys()){const [x,z]=key.split(',').map(Number);if(Math.abs(x-cx)>4||Math.abs(z-cz)>4)cache.delete(key);}
    for(let iz=-4;iz<=4;iz++)for(let ix=-4;ix<=4;ix++){
      if(ix*ix+iz*iz>21)continue;
      const x=cx+ix,z=cz+iz,key=x+','+z;
      let e=cache.get(key);
      if(!e){e=populate(x,z);cache.set(key,e);}
      for(const [type,x,y,z,sx,sy,sz,ax,az,angle,r] of e){
        if(type===2){branch(x,z,angle,sx,sy);branch(x+.35*sx*Math.cos(angle),z+.35*sx*Math.sin(angle),angle+1.05,sx*.30,sy*.35);continue;}
        const mesh=objects[type];if(mesh.count>=mesh.instanceMatrix.count)continue;
        if(type===0)mesh.setColorAt(mesh.count,col.setHSL((arid?.057:.075)+r*.037,.045+r*(arid?.34:.16),.38+.49*r));
        put(mesh,x,y,z,sx,sy,sz,ax,az,angle);
      }
    }
    for(const o of objects){o.instanceMatrix.needsUpdate=true;if(o.instanceColor)o.instanceColor.needsUpdate=true;}
  };
};
