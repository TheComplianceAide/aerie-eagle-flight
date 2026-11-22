// Stamp each crown's ground shadow once. Terrain samples this field as the
// eagle flies. The elongation follows the direction and elevation of the sun.
window.shadeAtlasForest=function shadeAtlasForest(T,material,trees,sun,half){
  const n=2048,scale=n/(2*half),data=new Uint8Array(n*n);
  const horizontal=Math.hypot(sun.x,sun.z);
  const dx=horizontal>0?-sun.x/horizontal:1,dz=horizontal>0?-sun.z/horizontal:0;
  for(const tree of trees){
    const length=Math.min(3,horizontal/Math.max(.1,sun.y))*tree.height;
    const offset=length*.48;
    const cx=n*.5+(tree.x+offset*dx)*scale,cy=n*.5+(tree.z+offset*dz)*scale;
    const a=Math.max(1.3,(length*.46+tree.width*.25)*scale),b=Math.max(.85,tree.width*.48*scale);
    const ex=Math.ceil(Math.hypot(a*dx,b*dz)),ey=Math.ceil(Math.hypot(a*dz,b*dx));
    for(let y=Math.max(0,Math.floor(cy-ey));y<=Math.min(n-1,cy+ey);y++){
      const v=y+.5-cy;
      for(let x=Math.max(0,Math.floor(cx-ex));x<=Math.min(n-1,cx+ex);x++){
        const u=x+.5-cx,along=(u*dx+v*dz)/a,across=(u*dz-v*dx)/b;
        const falloff=1-along*along-across*across;
        if(falloff<=0)continue;
        const i=y*n+x;
        data[i]+=(255-data[i])*.73*falloff;
      }
    }
  }
  const map=new T.DataTexture(data,n,n,T.RedFormat);
  map.minFilter=T.LinearMipmapLinearFilter;map.magFilter=T.LinearFilter;map.generateMipmaps=true;map.needsUpdate=true;
  material.uniforms.crownShadowField={value:map};
  const transmission=`float crown=texture2D(crownShadowField,clamp(xz/(halfMap*2.)+.5,0.,1.)).r*(1.-smoothstep(halfMap-80.,halfMap,extent));
    float leaves=sin(xz.x*2.62+.7*sin(xz.y*4.13))+sin(xz.y*3.1+xz.x*.91)+.56*sin(xz.x*5.2-xz.y*4.11);
    float dapple=mix(1.,.68+.42*smoothstep(-.9,.75,leaves),1.-smoothstep(12.,83.,d));
    c*=mix(vec3(1.),vec3(.51,.61,.76)*dapple,crown);`;
  material.fragmentShader='uniform sampler2D crownShadowField;\n'
    +material.fragmentShader.replace('/* canopy transmission */',transmission);
};

window.addHardwoods=function addHardwoods(T,scene,trees,options){
  const {region,sun,sunMask,half,clock,fogColor}=options,loader=new T.TextureLoader();
  function texture(file){
    const tex=loader.load(file);tex.anisotropy=8;return tex;
  }
  const wind=window.getCanopyWind(T,scene);
  const maritime=region==='milford';
  const lakeCrowns=region==='moosehead'?window.mooseheadCrowns(T,scene,clock):null;
  const lakeFar=lakeCrowns?.material(false,false,true);
  const transitionBand=lakeCrowns?'80.,110.':'85.,175.';
  const crownTransition=window.aerieCrownTransition;
  const leaf=texture(maritime?'island-branches.webp':'hardwood-branches.webp');
  const uniforms={...wind.uniforms,
    profile:{value:texture(maritime?'island-profile.webp':'hardwood-profiles.webp')},canopy:{value:texture(maritime?'island-crown.webp':'hardwood-crowns.webp')},
    leaves:{value:leaf},forestLight:{value:sunMask},sun:{value:sun},clock,
    haze:{value:fogColor},span:{value:half*2}
  };
  const tileUV=`vec2 tileUV(vec2 p,float id){
    vec2 origin=vec2(mod(id,2.),1.-floor(id*.5))*.5;
    return origin+.005+.49*clamp(p,0.,1.);
  }`;
  const autumn=region==='dixville';
  const leafColor=autumn?`
    float leafMask=smoothstep(.005,.072,color.g-min(color.r,color.b));
    float leafValue=dot(color,vec3(.24,.61,.15));
    vec3 pigment=species<.5?vec3(1.98,.92,.33):species<1.5?vec3(1.83,1.31,.48):species<2.5?vec3(1.64,.71,.29):vec3(1.28,1.13,.63);
    color=mix(color,leafValue*pigment,leafMask*.97);
  `:region==='lofoten'?`
    // Sheltered mountain birch is leaf-on in the summer survey. Preserve shade
    // within the crown while removing the yellow temperate source foliage.
    float foliage=smoothstep(.01,.068,max(color.r,color.g)-color.b);
    float value=dot(color,vec3(.25,.59,.16));
    color=mix(color,value*vec3(.52,.68,.54),foliage*.90);
  `:region==='surry'?`
    // The reservoir references show summer hardwoods. Keep the photographed
    // crown shading but replace yellow and red atlas foliage with leaf-on green.
    float foliage=smoothstep(.012,.074,max(color.r,color.g)-color.b);
    float value=dot(color,vec3(.24,.61,.15));
    vec3 summerTone=mix(vec3(.57,.81,.61),vec3(.70,.90,.62),fract(species*.39));
    color=mix(color,summerTone*value,foliage*.96);
  `:'';
  const finish=`
    vec3 linearColor=mix(pow((color+.055)/1.055,vec3(2.4)),color/12.92,lessThanEqual(color,vec3(.04045)));
    gl_FragColor=vec4(mix(linearColor,haze,atmosphere),1.);
    #include <colorspace_fragment>
  }`;
  const mat=new T.ShaderMaterial({side:T.DoubleSide,uniforms,vertexShader:`
    ${wind.glsl}
    ${crownTransition}
    attribute vec3 root;attribute vec4 form;attribute float nearResident;
    uniform float clock,span;uniform vec3 sun;uniform sampler2D forestLight;
    varying vec2 coord;varying float species,tilt,keyLight,fade,orientation,atmosphere,phase;
    void main(){
      vec3 center=root+vec3(0.,form.y*.50,0.);
      vec3 look=normalize(cameraPosition-center);
      vec3 right=normalize(vec3(look.z,0.,-look.x)+vec3(1e-6,0.,0.));
      vec3 up=cross(look,right);float high=max(0.,look.y);
      float height=mix(form.y,form.x,high*high);
      // The center rises toward the upper crown as its underside disappears.
      center.y+=form.y*.19*high*high;
      vec3 p=center+right*position.x*form.x+up*position.y*height;
      vec2 front=plantFront(root.xz),motion=plantMotion(root.xz,front,clock,.24);
      p.xz+=form.y*.29*motion*uv.y*uv.y;
      p.y-=form.y*.08*dot(motion,motion)*uv.y;
      coord=uv;species=form.w;tilt=smoothstep(.39,.91,high);phase=form.z+front.x*.68;
      keyLight=texture2D(forestLight,vec2(root.x,-root.z)/span+.5).r;
      orientation=dot(right,sun);
      float dist=distance(center,cameraPosition);
      fade=nearResident*crownDetail(distance(cameraPosition,root+vec3(0.,form.y*.5-.12,0.)),${transitionBand});
      atmosphere=1.-exp(-dist*.000045);
      gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
    }`,fragmentShader:`
    uniform sampler2D profile,canopy;uniform vec3 haze;
    varying vec2 coord;varying float species,tilt,keyLight,fade,orientation,atmosphere,phase;
    ${tileUV}
    ${crownTransition}
    void main(){
      vec2 p=coord;if(orientation>.0)p.x=1.-p.x;
      vec4 side=texture2D(profile,tileUV(p,species));
      vec4 top=texture2D(canopy,tileUV(p,species));
      float alpha=mix(side.a,top.a,tilt);
      if(alpha<.24||crownPixel(gl_FragCoord.xy)<fade)discard;
      vec3 color=mix(side.rgb*side.a,top.rgb*top.a,tilt)/max(alpha,.04);
      ${leafColor}
      color*=mix(vec3(.56,.64,.72),vec3(.93,.96,.92),keyLight)*(.90+.15*phase);
      ${finish}`});
  mat.userData.canopyRoot="root";
  const quad=new T.PlaneGeometry(1,1),cells=new Map(),stands=new Map(),point=new T.Vector3();
  function insert(map,size,t){
    const key=Math.floor(t.x/size)+':'+Math.floor(t.z/size);let batch=map.get(key);
    if(!batch)map.set(key,batch=[]);batch.push(t);
  }
  for(const t of trees){
    const patch=Math.sin(t.x*.0019+t.z*.0007)*.6+Math.cos(t.z*.0023)*.4;
    t.species=maritime?Math.min(3,Math.floor(t.seed*4)):t.species??(region==='lofoten'?3:region==='moosehead'&&patch+t.seed*.85>1?2:t.seed>.84?3:t.seed>.47?1:0);
    if(autumn){
      const local=.5+.26*Math.sin(t.x*.0072+t.z*.0033)+.18*Math.cos(t.z*.011-t.x*.003);
      const mix=local+(t.seed-.5)*.74;
      t.species=mix<.24?3:mix<.48?1:mix<.80?0:2;
    }
    insert(stands,lakeCrowns?1400:850,t);insert(cells,72,t);
  }
  for(const batch of stands.values()){
    const g=new T.InstancedBufferGeometry();g.setIndex(quad.index);
    g.setAttribute('position',quad.attributes.position);g.setAttribute('uv',quad.attributes.uv);
    const roots=new Float32Array(batch.length*3),form=new Float32Array(batch.length*4),bounds=new T.Box3();
    const surveyForms=lakeCrowns?new Float32Array(4*batch.length):null;
    const nearResident=new T.InstancedBufferAttribute(new Uint8Array(batch.length),1).setUsage(T.DynamicDrawUsage);
    batch.forEach((t,i)=>{
      roots.set([t.x,t.y,t.z],3*i);form.set([t.width,t.height,t.seed,t.species],4*i);
      t.nearAttribute=nearResident;t.nearSlot=i;
      if(surveyForms)surveyForms.set(lakeCrowns.traits(t,false),4*i);
      bounds.expandByPoint(point.set(t.x,t.y,t.z));
    });
    g.setAttribute('root',new T.InstancedBufferAttribute(roots,3));
    g.setAttribute('form',new T.InstancedBufferAttribute(form,4));g.instanceCount=batch.length;
    g.setAttribute('nearResident',nearResident);
    if(surveyForms){
      g.setAttribute('rootPosition',g.getAttribute('root'));
      g.setAttribute('crownForm',new T.InstancedBufferAttribute(surveyForms,4));
    }
    g.boundingSphere=bounds.expandByScalar(32).getBoundingSphere(new T.Sphere());
    const mesh=new T.Mesh(g,lakeFar||mat);mesh.name='Hardwood canopy';scene.add(mesh);
  }
  // Each close tree has actual forked wood and inclined, overlapping sprays
  // carried on distinct limbs. Branches hold their bearings when circled.
  const scan=window.aerieHardwood;
  const bytes=data=>Uint8Array.from(atob(data),c=>c.charCodeAt(0)).buffer;
  const positions=Float32Array.from(new Int16Array(bytes(scan.p)),v=>v/16000);
  const coords=[];
  for(let i=0;i<positions.length;i+=3){
    const x=positions[i],y=positions[i+1],z=positions[i+2];
    coords.push(Math.atan2(z,x)/6.283+.5,y*2.7);
  }
  const trunk=new T.BufferGeometry();
  trunk.setAttribute('position',new T.BufferAttribute(positions,3));
  trunk.setAttribute('uv',new T.Float32BufferAttribute(coords,2));
  trunk.setIndex(new T.BufferAttribute(new Uint16Array(bytes(scan.i)),1));trunk.computeVertexNormals();
  const bark=texture('shore-bark.webp');bark.colorSpace=T.SRGBColorSpace;bark.wrapS=bark.wrapT=T.RepeatWrapping;
  const stems=new T.InstancedMesh(trunk,new T.MeshStandardMaterial({map:bark,roughness:.96,color:0xaaa495}),1800);
  stems.material.userData.canopyRoot="instanceMatrix[3].xyz";
  stems.material.onBeforeCompile=shader=>{
    shader.vertexShader=crownTransition+'varying float modelWeight;\n'+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vec3 crownCenter=instanceMatrix[3].xyz+vec3(0.,length(instanceMatrix[1].xyz)*.5,0.);
      modelWeight=crownDetail(distance(cameraPosition,crownCenter),${transitionBand});
      if(modelWeight<=0.){gl_Position=vec4(2.,2.,2.,1.);return;}`);
    shader.fragmentShader=crownTransition+'varying float modelWeight;\n'+shader.fragmentShader.replace('#include <alphatest_fragment>','#include <alphatest_fragment>\n if(modelWeight<=crownPixel(gl_FragCoord.xy)) discard;');
  };
  stems.count=0;stems.frustumCulled=false;stems.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(stems);
  const twigGeometry=new T.BufferGeometry(),p=[],n=[],u=[],idx=[];
  for(let k=0;k<scan.sprays.length;k++){
    const [x,y,z]=scan.sprays[k],a=Math.atan2(x,z)+.74*Math.sin(k*2.4);
    for(let sheet=0;sheet<(k%3===0?2:1);sheet++){
      const angle=a+sheet*1.91,ca=Math.cos(angle),sa=Math.sin(angle);
      const spread=.121+.049*Math.sin(k*4.13),base=p.length/3;
      // Curving a leaf spray across three strips gives its edges a different
      // angle to the sun and prevents flat, straight card intersections.
      for(let j=0;j<=2;j++)for(let i=0;i<=2;i++){
        const h=j/2,w=i-1,depth=h*.13+.035*(1-w*w);
        p.push(x+w*spread*ca+depth*sa,y+(h-.5)*.18-.031*w*w,z-w*spread*sa+depth*ca);
        n.push(sa*.58+w*ca*.22,.67,ca*.58-w*sa*.22);u.push(i/2,h);
        if(j<2&&i<2){const t=base+3*j+i;idx.push(t,t+1,t+3,t+1,t+4,t+3);}
      }
    }
  }
  twigGeometry.setAttribute('position',new T.Float32BufferAttribute(p,3));twigGeometry.setAttribute('normal',new T.Float32BufferAttribute(n,3));
  twigGeometry.setAttribute('uv',new T.Float32BufferAttribute(u,2));twigGeometry.setIndex(idx);
  const speciesAttr=new T.InstancedBufferAttribute(new Float32Array(stems.instanceMatrix.count),1);
  twigGeometry.setAttribute('kind',speciesAttr);
  const closeMat=new T.ShaderMaterial({side:T.DoubleSide,uniforms,vertexShader:`
    ${wind.glsl}
    ${crownTransition}
    attribute float kind;uniform float clock,span;uniform vec3 sun;uniform sampler2D forestLight;
    varying vec2 coord;varying float species,illum,fade,atmosphere;
    void main(){
      vec3 root=instanceMatrix[3].xyz;vec3 p=position;
      float height=length(instanceMatrix[1].xyz),tip=clamp(p.y,0.,1.);
      float dist=length(cameraPosition-root-vec3(0.,.5*height,0.));
      fade=crownDetail(dist,${transitionBand});
      if(fade<=0.){gl_Position=vec4(2.,2.,2.,1.);return;}
      vec2 front=plantFront(root.xz),motion=plantMotion(root.xz,front,clock,.24);
      float flick=sin(clock*4.2+root.z*.091+p.z*17.+p.x*12.);
      vec3 world=(instanceMatrix*vec4(p,1.)).xyz;
      world.xz+=height*tip*tip*(motion*.29+canopyDownwind*front.x*.018*flick*uv.y);
      world.y+=height*tip*uv.y*front.x*.009*flick;
      vec3 normalWorld=normalize(mat3(instanceMatrix)*normal+
                        vec3(canopyDownwind.x,.2,canopyDownwind.y)*flick*front.x*.66);
      float light=texture2D(forestLight,vec2(root.x,-root.z)/span+.5).r;
      float transmission=pow(max(0.,dot(normalize(world-cameraPosition),sun)),3.);
      illum=(.55+.28*max(dot(normalWorld,sun),0.)+.21*max(0.,p.y)+.23*transmission)*mix(.64,1.,light);
      illum*=1.+front.x*tip*(.16+.13*flick);
      coord=uv;species=kind;
      atmosphere=0.;
      gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);
    }`,fragmentShader:`uniform sampler2D leaves;uniform vec3 haze;
      varying vec2 coord;varying float species,illum,fade,atmosphere;
      ${tileUV}
      ${crownTransition}
      void main(){
        vec4 leaf=texture2D(leaves,tileUV(coord,species));
        if(leaf.a<.36||crownPixel(gl_FragCoord.xy)>=fade)discard;
        vec3 color=leaf.rgb;
        ${leafColor}
        color*=illum;
        ${finish}`});
  closeMat.userData.canopyRoot="instanceMatrix[3].xyz";
  const boughs=new T.InstancedMesh(twigGeometry,closeMat,stems.instanceMatrix.count);
  boughs.instanceMatrix=stems.instanceMatrix;boughs.count=0;boughs.frustumCulled=false;scene.add(boughs);
  const pages=region==='moosehead'?[stems,boughs].map(mesh=>window.partitionSurveyCrowns(T,scene,mesh,'Nearby surveyed hardwood')):[];
  const last=new T.Vector3(Infinity,Infinity,Infinity),frame=new T.Object3D();
  let resident=[];
  return player=>{
    if(!player||last.distanceToSquared(player)<36)return;
    last.copy(player);let count=0;const i=Math.floor(player.x/72),j=Math.floor(player.z/72);
    const next=[];
    for(let x=i-3;x<=i+3;x++)for(let z=j-3;z<=j+3;z++){
      const batch=cells.get(x+':'+z);if(!batch)continue;
      for(const t of batch){
        if(Math.hypot(player.x-t.x,player.y-t.y-t.height*.5,player.z-t.z)>(lakeCrowns?130:195)||count>=stems.instanceMatrix.count)continue;
        next.push(t);t.selectedNear=true;
        if(!t.nearAttribute.getX(t.nearSlot)){
          t.nearAttribute.setX(t.nearSlot,1);t.nearAttribute.addUpdateRange(t.nearSlot,1);t.nearAttribute.needsUpdate=true;
        }
        frame.position.set(t.x,t.y-.12,t.z);frame.rotation.y=t.seed*6.283;
        frame.scale.set(t.width,t.height,t.width);frame.updateMatrix();stems.setMatrixAt(count,frame.matrix);
        speciesAttr.setX(count++,t.species);
      }
    }
    for(const t of resident)if(!t.selectedNear){
      t.nearAttribute.setX(t.nearSlot,0);t.nearAttribute.addUpdateRange(t.nearSlot,1);t.nearAttribute.needsUpdate=true;
    }
    for(const t of next)t.selectedNear=false;
    resident=next;
    stems.count=boughs.count=count;speciesAttr.needsUpdate=true;stems.instanceMatrix.needsUpdate=true;
    for(const update of pages)update();
  };
};
