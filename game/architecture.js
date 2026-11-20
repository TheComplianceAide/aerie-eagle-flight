// Glazing samples the photographed sky and a local 360-degree horizon captured
// at street level. The reflection travels across each pane as the eagle banks.
window.makeBuildingLight=function(T,scene,region,sky){
  const horizon=new T.TextureLoader().load('building-horizon-'+region+'.webp');
  horizon.colorSpace=T.SRGBColorSpace;horizon.wrapS=T.RepeatWrapping;
  function glaze(material,strength=.78,place='street'){
    let reflectionImage=horizon;
    if(place==='gatehouse'){
      reflectionImage=new T.TextureLoader().load('building-horizon-surry-gatehouse.webp');
      reflectionImage.colorSpace=T.SRGBColorSpace;reflectionImage.wrapS=T.RepeatWrapping;
    }
    const previous=material.onBeforeCompile,cache=material.customProgramCacheKey();
    material.onBeforeCompile=function(shader,renderer){
      previous.call(this,shader,renderer);
      shader.uniforms.facadeHorizon={value:reflectionImage};shader.uniforms.facadeSky={value:sky};
      shader.vertexShader='varying vec3 facadePoint;\n'+shader.vertexShader.replace('#include <project_vertex>',`
        #include <project_vertex>
        vec4 facadeObj=vec4(transformed,1.);
        #ifdef USE_INSTANCING
          facadeObj=instanceMatrix*facadeObj;
        #endif
        facadePoint=(modelMatrix*facadeObj).xyz;`);
      shader.fragmentShader='varying vec3 facadePoint;uniform sampler2D facadeHorizon,facadeSky;\n'+shader.fragmentShader.replace('#include <opaque_fragment>',`
        vec3 viewGlass=normalize(cameraPosition-facadePoint);
        vec3 glassNormal=inverseTransformDirection(normal,viewMatrix);
        vec3 rayGlass=reflect(-viewGlass,glassNormal);
        float longitude=.5+atan(rayGlass.z,rayGlass.x)*.15915494;
        float latitude=asin(clamp(rayGlass.y,-1.,1.))/3.14159;
        vec3 horizonGlass=texture2D(facadeHorizon,vec2(longitude,clamp(.5+latitude/.47,.003,.997))).rgb;
        vec3 skyGlass=texture2D(facadeSky,vec2(longitude,.5+latitude)).rgb;
        vec3 reflection=mix(horizonGlass,skyGlass,smoothstep(.07,.23,latitude));
        float grazingGlass=pow(1.-clamp(abs(dot(viewGlass,glassNormal)),0.,1.),4.);
        float fresnel=.13+.76*grazingGlass;
        ${place==='shop'||place==='cafe'?`
          // Project each street-facing ray onto the interior walls, floor and
          // ceiling. Consecutive shop panes share a single room and keep their
          // measured frontage as the eagle crosses the plate-glass windows.
          vec3 across=normalize(cross(vec3(0.,1.,0.),glassNormal));
          float metres=length(vec2(dot(dFdx(facadePoint),across),dot(dFdy(facadePoint),across)));
          float roomWidth=clamp(metres/max(length(vec2(dFdx(vMapUv.x),dFdy(vMapUv.x))),.00001),2.,24.);
          vec3 bounds=vec3(roomWidth*.53,1.63,min(5.4,roomWidth*.47));
          vec3 entrance=vec3((vMapUv.x-.5)*roomWidth,(vMapUv.y-.5)*2.23-.12,-bounds.z+.007);
          vec3 inward=vec3(-dot(viewGlass,across),-viewGlass.y,max(.035,dot(viewGlass,glassNormal)));
          vec3 reach=(mix(-bounds,bounds,step(vec3(0.),inward))-entrance)/(inward+vec3(.00002));
          vec3 hit=normalize(entrance+inward*min(reach.x,min(reach.y,reach.z))-vec3(0.,0.,-bounds.z*.42));
          vec2 roomUV=vec2(fract(${place==='cafe'?'.31':'.69'}+atan(hit.x,hit.z)*.15915494),.5+asin(clamp(hit.y,-1.,1.))*.3183099);
          outgoingLight=texture2D(map,roomUV).rgb*vec3(.61,.57,.51);
        `:''}
        outgoingLight=mix(outgoingLight*.72,reflection*vec3(.89,1.,.96),${strength.toFixed(3)}*fresnel);
        #include <opaque_fragment>`);
    };
    material.customProgramCacheKey=()=>cache+'-buildingGlass-'+strength+'-'+place;
    return material;
  }
  const scans=new Map(),loader=new T.TextureLoader();
  function finish(material,name,scale,vertical=false){
    if(!scans.has(name)){
      const maps=['','-normal'].map(suffix=>{
        const tex=loader.load('building-'+name+suffix+'.webp');
        if(!suffix)tex.colorSpace=T.SRGBColorSpace;
        tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.anisotropy=8;return tex;
      });
      scans.set(name,maps);
    }
    [material.map,material.normalMap]=scans.get(name);
    material.normalScale=new T.Vector2(name==='boards'?.60:.78,name==='boards'?.60:.78);
    material.bumpMap=null;
    // Facade coordinate systems follow each real wall and roof pitch. A long
    // instanced railway shed uses the same plank width as a short boathouse.
    const previous=material.onBeforeCompile,cache=material.customProgramCacheKey();
    material.onBeforeCompile=function(shader,renderer){
      previous.call(this,shader,renderer);
      shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`
        #include <uv_vertex>
        vec3 skinPosition=position,skinNormal=normal;
        #ifdef USE_INSTANCING
          mat3 skinBasis=mat3(instanceMatrix);
          skinNormal=skinBasis*(normal/vec3(dot(skinBasis[0],skinBasis[0]),dot(skinBasis[1],skinBasis[1]),dot(skinBasis[2],skinBasis[2])));
          skinPosition=(instanceMatrix*vec4(position,1.)).xyz;
        #endif
        skinPosition=(modelMatrix*vec4(skinPosition,1.)).xyz;
        vec3 n=normalize(mat3(modelMatrix)*skinNormal);
        vec3 along=length(n.xz)>.015?normalize(vec3(n.z,0.,-n.x)):vec3(1.,0.,0.);
        vec3 upSkin=normalize(cross(n,along));
        vec2 measured=vec2(dot(skinPosition,along),dot(skinPosition,upSkin))/${scale.toFixed(3)};
        vMapUv=${vertical?'vec2(measured.y,-measured.x)':'measured'};
        vNormalMapUv=vMapUv;`);
    };
    material.customProgramCacheKey=()=>cache+'-metric-'+name+'-'+scale+'-'+vertical;
    return material;
  }
  return {glaze,finish};
};

// Stream the joinery and roof fittings near the player. Whole windows share a
// single framed mesh; a lakeshore village submits a handful of instanced draws.
window.makeBuildingFittings=function(T,scene){
  const cells=new Map(),size=200,reach=350,unit=new T.BoxGeometry(1,1,1);
  const panel=new T.PlaneGeometry(1,1);
  const outline={p:[],n:[]};
  function profile(x,y,z,w,h,d){
    const a=unit.attributes.position,n=unit.attributes.normal;
    for(const i of unit.index.array){outline.p.push(x+w*a.getX(i),y+h*a.getY(i),z+d*a.getZ(i));outline.n.push(n.getX(i),n.getY(i),n.getZ(i));}
  }
  // Z faces out of the building, Y rises from sill to head.
  profile(-.475,0,.055,.05,1,.11);profile(.475,0,.055,.05,1,.11);
  profile(0,.47,.065,1.06,.06,.13);profile(0,-.476,.08,1.1,.054,.18);
  profile(0,.025,.033,.90,.035,.060);profile(0,0,.03,.026,.89,.054);
  const frame=new T.BufferGeometry();
  frame.setAttribute('position',new T.Float32BufferAttribute(outline.p,3));frame.setAttribute('normal',new T.Float32BufferAttribute(outline.n,3));
  const opaque=new T.MeshStandardMaterial({roughness:.78}),glass=scene.userData.buildingLight.glaze(new T.MeshStandardMaterial({roughness:.21,side:T.DoubleSide}),1);
  const pieces={timber:[unit,opaque],frame:[frame,opaque],pane:[panel,glass]};
  const transform=new T.Matrix4(),tint=new T.Color();
  function register(x,z,draw){
    const a=Math.floor(x/size),b=Math.floor(z/size),key=a+'|'+b;
    let cell=cells.get(key);if(!cell){cell={x:(a+.5)*size,z:(b+.5)*size,draw:[]};cells.set(key,cell);}
    cell.draw.push(draw);
  }
  function build(cell){
    const parts={timber:[],frame:[],pane:[]};
    function piece(type,x,y,z,dx,dz,w,h,d,color){
      transform.set(dx*w,0,-dz*d,x, 0,h,0,y, dz*w,0,dx*d,z, 0,0,0,1);
      const items=parts[type];items.push(...transform.elements,color);
    }
    const box=(x,y,z,dx,dz,w,h,d,c)=>piece('timber',x,y,z,dx,dz,w,h,d,c);
    function sash(x,y,z,dx,dz,w,h,trim,lit){
      piece('frame',x,y,z,dx,dz,w,h,1,trim);
      piece('pane',x-.012*dz,y,z+.012*dx,dx,dz,w*.95,h*.95,1,lit);
    }
    for(const f of cell.draw)f(box,sash);
    const group=new T.Group();group.name='Exterior architectural fittings';scene.add(group);
    for(const [type,values] of Object.entries(parts)){
      if(!values.length)continue;
      const [geom,mat]=pieces[type],m=new T.InstancedMesh(geom,mat,values.length/17);
      for(let i=0;i<m.count;i++){
        transform.fromArray(values,i*17);m.setMatrixAt(i,transform);m.setColorAt(i,tint.setHex(values[i*17+16]));
      }
      m.computeBoundingSphere();group.add(m);
    }
    return group;
  }
  let lastX=Infinity,lastZ=Infinity;
  const render=scene.onBeforeRender;
  scene.onBeforeRender=function(r,s,c,...rest){
    render.call(this,r,s,c,...rest);
    if(!c.isPerspectiveCamera||c.userData.lakeReflection||Math.hypot(lastX-c.position.x,lastZ-c.position.z)<45)return;
    lastX=c.position.x;lastZ=c.position.z;
    for(const cell of cells.values()){
      const distance=Math.max(Math.abs(lastX-cell.x)-size*.5,Math.abs(lastZ-cell.z)-size*.5,0);
      if(distance<reach){
        if(!cell.group)cell.group=build(cell);
        cell.group.visible=true;
      }else if(cell.group){
        cell.group.visible=false;
        if(distance>960){
          cell.group.traverse(o=>{if(o.isInstancedMesh)o.dispose()});scene.remove(cell.group);cell.group=null;
        }
      }
    }
  };
  return register;
};
