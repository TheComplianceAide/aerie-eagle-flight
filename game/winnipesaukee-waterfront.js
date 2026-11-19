/* Registered terrain, aerial imagery and original 3D waterfront structures. */
window.makeWinnipesaukeeWaterfront=function(T,scene,texture){
  const {tiles,settlement,features,launches,landmarks}=window.WINNIPESAUKEE_WATERFRONT;
  const {smoothstep,lerp}=T.MathUtils;
  const decode=string=>Uint8Array.from(atob(string),c=>c.charCodeAt(0));
  const surveys=tiles.map(tile=>({...tile,grid:new Int16Array(decode(tile.heights).buffer)}));
  const rects=tiles.map(({x,z,half})=>[x-half,z-half,x+half,z+half]);

  function elevation(sample,far,farHalf,x,z){
    const fallback=sample(far,farHalf,x,z);
    const tile=surveys.find(tile=>Math.max(Math.abs(x-tile.x),Math.abs(z-tile.z))<tile.half);
    if(!tile)return fallback;
    const dx=x-tile.x,dz=z-tile.z;
    const blend=smoothstep(Math.max(Math.abs(dx),Math.abs(dz)),tile.half-150,tile.half);
    return lerp(sample(tile.grid,tile.half,dx,dz),fallback,blend);
  }

  function createTrees(plant,elevation,waterLevel){
    for(const tile of tiles){
      const raw=decode(tile.crowns),view=new DataView(raw.buffer);
      for(let i=0;i<raw.length;i+=8){
        const x=tile.x+view.getInt16(i,true),z=tile.z+view.getInt16(i+2,true);
        const y=elevation(x,z),species=raw[i+6];
        if(y>waterLevel+.85)plant({x,z,y,width:raw[i+4]/8,height:raw[i+5]/4,species,seed:raw[i+7]/255},species===4);
      }
    }
  }

  function injectMaps(material,field,baseCode,stage){
    const declarations=[],blocks=[];
    tiles.forEach(({name,x,z,half},i)=>{
      const sampler='waterfront'+i,local='waterfrontUv'+i,weight='waterfrontWeight'+i;
      material.uniforms[sampler]={value:texture('winnipesaukee-'+name+'-'+field+'.webp')};
      declarations.push('uniform sampler2D '+sampler+';');
      blocks.push(`
        vec2 ${local}=(${stage==='terrain'?'xz':'p'}-vec2(${x}.,${z}.))/${2*half}.;
        float ${weight}=1.-smoothstep(.433,.496,max(abs(${local}.x),abs(${local}.y)));
        if(${weight}>0.) {
          vec3 measured=texture2D(${sampler},vec2(${local}.x,-${local}.y)+.5).rgb;
          ${stage==='terrain'?`vec3 balanced=measured*vec3(.86,.91,.89)*(1.-.105*smoothstep(.46,.86,lum(measured)));
          photo=mix(photo,balanced,${weight});`:`bank=mix(bank,450.*measured.r*measured.r,${weight});
          fetch=mix(fetch,measured.g,${weight});`}
        }`);
    });
    material.fragmentShader=declarations.join('\n')+'\n'+material.fragmentShader.replace(baseCode,blocks.join('\n')+'\n'+baseCode);
  }

  function applyTerrain(material){
    injectMaps(material,'ortho','photo=mix(photo,vec3(lum(photo))','terrain');
    material.fragmentShader=material.fragmentShader.replace(
      'float materialWeight=max(',
      'float shorelineView=max(waterfrontWeight0,waterfrontWeight1)*smoothstep(.76,.97,normal.y);\n        float materialWeight=max('
    ).replace('vec3 c=mix(photo,stoneColor,materialWeight);','vec3 c=mix(photo,stoneColor,materialWeight*(1.-shorelineView*.82));');
  }

  function applyWater(material){
    injectMaps(material,'shore','vec3 v=normalize(eye-worldPosition.xyz);','water');
    material.fragmentShader=material.fragmentShader.replace(
      'vec3 body=mix(deep,shoal,shallow);',
      `float sandy=max(1.-smoothstep(48.,113.,length(p-vec2(-12267.,-3164.))),
                       1.-smoothstep(25.,65.,length(p-vec2(5288.,12210.))));
       vec3 sand=vec3(.162,.171,.103)*(.63+.37*daylight)*(.73+.45*gravel.r);
       shoal=mix(shoal,sand,sandy*.86);
       vec3 body=mix(deep,shoal,shallow);`);
  }

  function build(elevation,waterLevel){
    const deck=texture('lakeside-dock.webp',true),shingles=texture('lakeside-roof.webp',true);
    deck.colorSpace=shingles.colorSpace=T.SRGBColorSpace;
    const materials={
      timber:new T.MeshStandardMaterial({map:deck,color:0xbdb19c,roughness:.96}),
      rail:new T.MeshStandardMaterial({color:0xe1dcd0,roughness:.78}),
      post:new T.MeshStandardMaterial({color:0x514d41,roughness:.96}),
      roof:new T.MeshStandardMaterial({map:shingles,color:0x8f908b,roughness:.86,side:T.DoubleSide}),
      trim:new T.MeshStandardMaterial({color:0xefede2,roughness:.76}),
      cream:new T.MeshStandardMaterial({color:0xd6c6a5,roughness:.92}),
      window:new T.MeshStandardMaterial({color:0x394747,roughness:.27,metalness:.32}),
      stone:new T.MeshStandardMaterial({color:0xbab9af,roughness:.97}),
      bronze:new T.MeshStandardMaterial({color:0x423e31,roughness:.76,metalness:.35}),
      asphalt:new T.MeshStandardMaterial({color:0x444443,roughness:.98}),
      iron:new T.MeshStandardMaterial({color:0x5f5445,roughness:.49,metalness:.38}),
      orange:new T.MeshStandardMaterial({color:0xdd6338,roughness:.84}),
      hull:new T.MeshStandardMaterial({color:0xf4f3e7,roughness:.46,side:T.DoubleSide}),
      navy:new T.MeshStandardMaterial({color:0x26384b,roughness:.81}),
      blue:new T.MeshStandardMaterial({color:0x4d78a9,roughness:.83}),
    };
    const root=new T.Group();root.name='Weirs Beach and Alton Bay waterfronts';scene.add(root);
    const unit=new T.BoxGeometry(1,1,1),column=new T.CylinderGeometry(.5,.5,1,9);
    const shapes=new Map(),sections=new Map(),obstacles=[];
    function batch(mat,geometry,matrix){
      const key=mat+geometry.id;
      if(!shapes.has(key))shapes.set(key,{mat,geometry,instances:[]});
      shapes.get(key).instances.push(matrix);
    }
    function box(mat,x,y,z,w,h,d,angle=0){
      const matrix=new T.Matrix4().makeRotationY(angle).scale(new T.Vector3(w,h,d));
      matrix.setPosition(x,y,z);batch(mat,unit,matrix);
    }
    function beam(mat,a,b,width,round=false){
      const p=new T.Vector3(...a),q=new T.Vector3(...b),v=q.clone().sub(p),length=v.length();
      if(length<.02)return;
      const align=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),v.divideScalar(length));
      const m=new T.Matrix4().compose(p.lerp(q,.5),align,new T.Vector3(width,length,width));
      batch(mat,round?column:unit,m);
    }
    function section(mat,center,faces){
      if(!sections.has(mat))sections.set(mat,{p:[],uv:[]});
      const {p,uv}=sections.get(mat);
      for(const face of faces)for(const i of (face.length===4?[0,1,2,0,2,3]:[0,1,2])){
        const [x,y,z]=face[i];p.push(...center(x,y,z));uv.push((x+z*.65)/3,(y*.8+z)/3);
      }
    }
    function hip(center,w,d,y,rise){
      const corners=[[-w/2,y,-d/2],[w/2,y,-d/2],[w/2,y,d/2],[-w/2,y,d/2]];
      section('roof',center,corners.map((p,i)=>[p,corners[(i+1)%4],[0,y+rise,0]]));
      for(let i=0;i<4;i++)beam('trim',center(...corners[i]),center(...corners[(i+1)%4]),.17);
    }
    function footprint(points){
      const x=points.reduce((s,p)=>s+p[0],0)/points.length,z=points.reduce((s,p)=>s+p[1],0)/points.length;
      const d=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
      const idx=d(points[0],points[1])>d(points[0],points[3])?1:3;
      const length=d(points[0],points[idx]),width=d(points[0],points[4-idx]);
      const [dx,dz]=[(points[idx][0]-points[0][0])/length,(points[idx][1]-points[0][1])/length];
      const at=(u,y,v)=>[x+u*dx-v*dz,y,z+u*dz+v*dx];
      const angle=Math.atan2(-dz,dx);
      return {x,z,length,width,at,angle,box:(m,u,y,v,l,h,w)=>box(m,...at(u,y,v),l,h,w,angle)};
    }
    function addObstacle(x,z,r,y){obstacles.push({x,z,r,y});}

    const alton=features.alton;
    if(alton.bandstand){
      const f=footprint(alton.bandstand),y=waterLevel+.91;
      const platform=footprint(alton.bandstandPlatform||alton.bandstand);
      platform.box('timber',0,y-.03,0,platform.length,.21,platform.width);
      platform.box('stone',0,y-.55,0,platform.length-1.2,1.05,platform.width-1.2);
      const a=f.length*.43,b=f.width*.43,rise=1.45;
      for(const u of [-a,a])for(const v of [-b,b]){
        beam('trim',f.at(u,y+.04,v),f.at(u,y+2.42,v),.185);
        for(const [du,dv] of [[-Math.sign(u)*.60,0],[0,-Math.sign(v)*.60]]){
          beam('trim',f.at(u,y+1.76,v),f.at(u+du,y+2.38,v+dv),.105);
        }
      }
      for(const v of [-b,b]){
        beam('rail',f.at(-a,y+.89,v),f.at(a,y+.89,v),.11);
        for(let u=-a+.28;u<a;u+=.33)beam('rail',f.at(u,y+.12,v),f.at(u,y+.89,v),.055);
      }
      for(const u of [-a,a]){
        beam('rail',f.at(u,y+.89,-b),f.at(u,y+.89,b),.11);
        for(let v=-b+.28;v<b;v+=.33)beam('rail',f.at(u,y+.12,v),f.at(u,y+.89,v),.055);
      }
      hip(f.at,f.length+.6,f.width+.6,y+2.50,rise);
      beam('iron',f.at(0,y+3.93,0),f.at(0,y+5.05,0),.048,true);
      beam('orange',f.at(0,y+5.00,0),f.at(.74,y+4.84,.13),.20,true);
      addObstacle(f.x,f.z,4.5,y+4.15);
    }

    const weirs=features.weirs;
    if(weirs.station){
      const f=footprint(weirs.station),y=Math.max(...weirs.station.map(q=>elevation(...q)))+.45;
      f.box('stone',0,y-.48,0,f.length,1.14,f.width);
      f.box('cream',0,y+1.58,0,f.length,3.22,f.width);
      for(const v of [-f.width/2,f.width/2]){
        f.box('trim',0,y+3.19,v,f.length+.65,.19,.15);
        for(let u=-f.length*.42;u<f.length*.46;u+=3.36){
          f.box('trim',u,y+1.79,v+Math.sign(v)*.025,1.28,1.53,.08);
          f.box('window',u,y+1.82,v+Math.sign(v)*.078,1.05,1.27,.06);
          f.box('trim',u,y+1.84,v+Math.sign(v)*.121,.095,1.31,.06);
          f.box('trim',u,y+1.80,v+Math.sign(v)*.121,1.08,.075,.06);
        }
      }
      const l=f.length/2+.5,w=f.width/2+.45,top=y+3.29,ridge=top+1.65;
      section('roof',f.at,[[[-l,top,-w],[l,top,-w],[l,ridge,0],[-l,ridge,0]],[[l,top,w],[-l,top,w],[-l,ridge,0],[l,ridge,0]]]);
      for(const k of [-1,1])section('roof',f.at,[[[k*l,top,-w],[k*l,top,w],[k*l,ridge,0]]]);
      f.box('trim',-2,ridge+.51,0,2.8,1.20,2.65);
      for(const v of [-1.36,1.36])f.box('window',-2,ridge+.62,v,1.75,.84,.10);
      hip((a,b,c)=>f.at(a-2,b,c),3.15,3.15,ridge+1.16,.84);
      addObstacle(f.x,f.z,f.width*.9,ridge+2.0);
    }
    if(weirs.monument){
      const [x,z]=weirs.monument,y=Math.max(waterLevel+.15,elevation(x,z));
      box('stone',x,y+.25,z,3.12,.55,2.9,.14);
      box('stone',x,y+.68,z,2.54,.44,2.35,.14);
      box('stone',x,y+1.53,z,1.7,1.32,1.55,.14);
      box('stone',x,y+2.26,z,2.05,.19,1.93,.14);
      beam('bronze',[x,y+2.30,z],[x+.04,y+3.33,z],.38,true);
      beam('bronze',[x+.04,y+3.28,z],[x+.04,y+3.57,z],.23,true);
      beam('bronze',[x-.15,y+3.16,z],[x-.30,y+2.85,z+.11],.124,true);
    }
    for(const coords of weirs.terminal||[]){
      const f=footprint(coords),base=waterLevel+.76,top=base+4.1;
      f.box('timber',0,base,0,f.length+.3,.17,f.width+.3);
      f.box('cream',0,base+2.0,0,f.length,4.12,f.width);
      f.box('stone',0,top+.05,0,f.length+.63,.25,f.width+.63);
      for(const k of [-1,1])for(let u=-f.length*.39;u<f.length*.44;u+=3.65){
        f.box('window',u,top-1.37,k*(f.width/2+.03),1.31,1.17,.11);
      }
    }
    for(const set of [weirs.boats,alton.boats])for(const [x,z,l,w,angle] of set||[]){
      const cs=Math.cos(angle),sn=-Math.sin(angle),y=waterLevel+.49;
      const at=(u,h,v)=>[x+u*cs-v*sn,h,z+u*sn+v*cs];
      const edge=[[-l*.49,y,-w*.42],[l*.14,y,-w*.50],[l*.49,y,0],[l*.14,y,w*.50],[-l*.49,y,w*.42]];
      const keel=edge.map(([x,y,z])=>[x*.93,y-.49,z*.70]);
      const side=edge.map((pt,i)=>[pt,edge[(i+1)%5],keel[(i+1)%5],keel[i]]);
      section('hull',at,[...side,[edge[0],edge[1],edge[3],edge[4]],[edge[1],edge[2],edge[3]]]);
      box('navy',...at(-l*.11,y+.102,0),l*.36,.20,w*.56,angle);
      box('window',...at(l*.11,y+.33,0),l*.093,.44,w*.66,angle);
      if(Math.sin(x*12.7+z*32.1)>.05){
        box('blue',...at(-l*.14,y+.94,0),l*.35,.09,w*.86,angle);
        for(const end of [-.29,.005])for(const k of [-1,1]){
          beam('iron',at(l*end,y,w*k*.38),at(l*end,y+.94,w*k*.38),.04);
        }
      }
    }

    if(weirs.boardwalk){
      const pairs=weirs.boardwalk.slice(1).map((p,i)=>[weirs.boardwalk[i],p]);
      for(const [a,b] of pairs){
        const dx=b[0]-a[0],dz=b[1]-a[1],d=Math.hypot(dx,dz),ux=dx/d,uz=dz/d;
        const count=Math.ceil(d/5);
        for(let i=0;i<count;i++){
          const px=a[0]+dx*(i+.5)/count,pz=a[1]+dz*(i+.5)/count;
          const at=(u,v,h)=>{
            const x=px+u*ux-v*uz,z=pz+u*uz+v*ux,y=Math.max(elevation(x,z)+.16,waterLevel+1.05);
            return [x,y+h,z];
          };
          const u=d/(2*count),a0=at(-u,-1.45,0),a1=at(u,-1.45,0),a2=at(u,1.45,0),a3=at(-u,1.45,0);
          section('timber',(x,y,z)=>[x,y,z],[[a0,a3,a2,a1]]);
          beam('timber',at(-u,-1.40,.91),at(u,-1.40,.91),.14);
          beam('timber',at(-u,-1.40,.43),at(u,-1.40,.43),.092);
          beam('post',at(-u,-1.42,-.36),at(-u,-1.42,.97),.16);
          beam('post',at(u*.65,-1.42,-.12),at(u*.65,-1.42,.92),.095);
        }
      }
    }
    for(const [a,b] of weirs.rail||[]){
      const dx=b[0]-a[0],dz=b[1]-a[1],d=Math.hypot(dx,dz);
      if(d<.2)continue;
      const at=(u,v,h)=>{
        const x=a[0]+dx*u-dz*v/d,z=a[1]+dz*u+dx*v/d;
        return [x,Math.max(elevation(x,z)+.16,waterLevel+.29)+h,z];
      };
      for(const v of [-.72,.72])beam('iron',at(0,v,.13),at(1,v,.13),.098);
      for(let i=.43;i<d;i+=.78)beam('post',at(i/d,-1.26,.062),at(i/d,1.26,.062),.215);
    }
    for(const set of [weirs.bridges,alton.bridges])for(const [a,b] of set||[]){
      const dx=b[0]-a[0],dz=b[1]-a[1],d=Math.hypot(dx,dz),x=(a[0]+b[0])*.5,z=(a[1]+b[1])*.5;
      const level=Math.max(elevation(...a),elevation(...b),waterLevel+2.35)+.28;
      const angle=Math.atan2(-dz,dx);
      box('stone',x,level-.25,z,d+.18,.62,8.8,angle);
      box('asphalt',x,level+.06,z,d+.20,.09,7.42,angle);
      for(const k of [-1,1]){
        const ox=dz/d*4.15*k,oz=-dx/d*4.15*k;
        beam('stone',[a[0]+ox,level+.78,a[1]+oz],[b[0]+ox,level+.78,b[1]+oz],.24);
        for(let u=0;u<1;u+=.097)beam('stone',
          [a[0]+ox+dx*u,level,a[1]+oz+dz*u],
          [a[0]+ox+dx*u,level+.82,a[1]+oz+dz*u],.22);
      }
    }
    for(const [mat,{p,uv}] of sections){
      const g=new T.BufferGeometry();
      g.setAttribute('position',new T.Float32BufferAttribute(p,3));
      g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
      g.computeVertexNormals();root.add(new T.Mesh(g,materials[mat]));
    }
    for(const {mat,geometry,instances} of shapes.values()){
      const mesh=new T.InstancedMesh(geometry,materials[mat],instances.length);
      instances.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.computeBoundingSphere();root.add(mesh);
    }
    return (x,z)=>{
      let y=-Infinity;
      for(const o of obstacles)if(Math.hypot(x-o.x,z-o.z)<o.r)y=Math.max(y,o.y);
      return y;
    };
  }
  return {rects,elevation,applyTerrain,applyWater,createTrees,build,settlement,launches,landmarks};
};
