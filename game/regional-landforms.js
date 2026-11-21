/* Regional landmark terrain, in the same east/up/south metre coordinates as flight physics.
   A source survey is decoded before its world is constructed. */
(() => {
  'use strict';
  const catalog={
    moosehead:{name:'Mount Kineo',asset:'kineo',rock:'rhyolite',water:312.23,holes:[[236,-1260,344,-1040],[360,-964,416,-880]],
      source:'USGS 3DEP Western Mountains B24 and USDA NAIP, eastern and southern Mount Kineo, Maine'},
    lofoten:{name:'Olstinden · fjord-facing wall',asset:'lofoten',water:0,source:'Kartverket national terrain model and Copernicus Sentinel-2, Lofoten, Norway'},
    hamnoy:{name:'Hamnøy · fishing harbor and tidal ledges',asset:'hamnoy',water:0,source:'Kartverket national terrain model and Copernicus Sentinel-2 summer imagery, Moskenes, Norway'},
    milford:{name:'Rahotu Mitre Peak · crest and Sinbad wall',asset:'milford',water:0,source:'LINZ NZ 8m Digital Elevation Model (2012) and Southland 0.75m Rural Aerial Photos (2005–2011)'},
    labrador:{name:'Lac Berté · south narrows and camp headland',asset:'labrador',water:359,source:'Gouvernement du Québec MRNF 2022 lidar terrain and aerial imagery, Côte-Nord'},
    yosemite:{name:'El Capitan · Nose and southeast face',asset:'yosemite',source:'USGS 3DEP and USDA NAIP, Yosemite Valley, California'},
    crater:{name:'Wizard Island · crater rim and lava apron',asset:'crater',water:1880.62,source:'USGS 3DEP and USDA NAIP, Crater Lake, Oregon'},
    winnipesaukee:{name:'Rattlesnake Island · high spine and shore ledges',asset:'winnipesaukee',water:153.11,source:'USGS 3DEP and USDA NAIP, Lake Winnipesaukee, New Hampshire'},
    dixville:{name:'Mount Gloriette · western notch wall',asset:'dixville',source:'USGS 3DEP and USDA NAIP, Dixville Notch, New Hampshire'},
    surry:{name:'Surry Mountain Dam · crest and spillway approach',asset:'surry',water:152.33,source:'USGS 3DEP and USDA NAIP, Surry, New Hampshire'},
    canyon:{name:'Horseshoe Bend · central promontory and inner wall',asset:'canyon',style:'canyon',holes:[[-592,-336,-456,-240]],source:'USGS 3DEP and USDA NAIP, Glen Canyon, Arizona'},
    alaska:{name:'Nugget Falls · wall and scoured bedrock',asset:'alaska',style:'alaska',water:0,source:'USGS 3DEP and the Aerie Mendenhall aerial mosaic, Juneau, Alaska'},
    swiss:{name:'Fründenschnuer · limestone shelf and east wall',asset:'swiss',style:'swiss',water:0,source:'swisstopo swissALTI3D and SWISSIMAGE, Oeschinensee, Switzerland'},
    swisswest:{name:'Oeschinensee · western strand and scree fan',asset:'swisswest',style:'swiss',water:0,source:'Federal Office of Topography swisstopo, swissALTI3D 2025 and SWISSIMAGE, Oeschinensee, Switzerland'}
  };
  const available=new Map(),pending=new Map();
  const ease=x=>{const f=Math.max(0,Math.min(1,x));return f*f*(3-2*f);};
  const url=file=>window.aerieAssetURL?.(file)||file;
  function decode(spec,buffer){
    const head=new DataView(buffer);
    if(head.getUint32(0)!==0x41524631||head.getUint16(4,true)!==1)throw Error('Unreadable regional terrain survey');
    const step=head.getUint16(6,true),rect=[8,12,16,20].map(i=>head.getInt32(i,true));
    const [left,top,right,bottom]=rect,nx=head.getUint16(24,true),nz=head.getUint16(26,true);
    const datum=head.getFloat32(28,true),scale=head.getFloat32(32,true),count=head.getUint32(36,true);
    let at=40;
    const grid=new Int16Array(buffer,at,nx*nz);at+=grid.byteLength;
    const sectors=new Map();
    for(let j=0;j<count;j++){
      const n=head.getUint32(at,true),f=head.getUint32(at+4,true);at+=8;
      const xyz=new Uint16Array(buffer,at,3*n);at+=xyz.byteLength;
      const light=new Uint8Array(buffer,at,4*n);at+=light.byteLength;
      const triangles=new Uint16Array(buffer,at,f*3);at+=triangles.byteLength;
      // The baking tiles enforce seams around the original survey. Combine
      // them in broader spatial sectors so distant land costs only a few draws.
      let x=0,z=0;for(let i=0;i<n;i++){x+=xyz[i*3];z+=xyz[i*3+1];}
      const key=Math.floor(3*x/(n*(right-left)))+4*Math.floor(3*z/(n*(bottom-top)));
      const sector=sectors.get(key)||{parts:[],vertices:0,indices:0};
      sector.parts.push({xyz,light,triangles});sector.vertices+=n;sector.indices+=triangles.length;
      sectors.set(key,sector);
    }
    let woodland=null;
    if(at+8<=buffer.byteLength&&head.getUint32(at,true)===0x31525446){
      const roots=head.getUint32(at+4,true);at+=8;
      woodland=new Int16Array(buffer,at,roots*3);at+=woodland.byteLength;
    }
    if(at!==buffer.byteLength)throw Error('Incomplete regional terrain survey');
    const sections=[];
    for(const sector of sectors.values()){
      const xyz=new Uint16Array(sector.vertices*3),light=new Uint8Array(sector.vertices*4);
      const triangles=sector.vertices<65536?new Uint16Array(sector.indices):new Uint32Array(sector.indices);
      let n=0,k=0;
      for(const p of sector.parts){
        xyz.set(p.xyz,n*3);light.set(p.light,n*4);
        for(const index of p.triangles)triangles[k++]=n+index;
        n+=p.xyz.length/3;
      }
      sections.push({xyz,light,triangles});
    }
    const holes=spec.holes||[];
    function edge(x,z){
      let d=Math.min(x-left,right-x,z-top,bottom-z);
      if(d<=0)return 0;
      for(const [l,t,r,b] of holes)d=Math.min(d,Math.max(l-x,x-r,t-z,z-b));
      return ease(d/20);
    }
    function sample(x,z){
      const xx=(x-left)/step,zz=(z-top)/step;
      const i=Math.min(nx-2,Math.max(0,Math.floor(xx))),j=Math.min(nz-2,Math.max(0,Math.floor(zz)));
      const u=Math.min(1,Math.max(0,xx-i)),v=Math.min(1,Math.max(0,zz-j)),k=i+j*nx;
      const a=grid[k]+u*(grid[k+1]-grid[k]),b=grid[k+nx]+u*(grid[k+nx+1]-grid[k+nx]);
      return datum+scale*(a+v*(b-a));
    }
    function height(x,z,base){
      const w=edge(x,z);
      if(w<=0)return base;
      const h=sample(x,z);
      // Keep charted open-water bottoms underneath the lake's native optical surface.
      if(spec.water!==undefined&&h<=spec.water+.12)return Math.min(base,h);
      return base+(h-base)*w;
    }
    // Low structures and patch overlays need the rendered triangles, whose
    // error-limited decimation may differ from the regularly sampled DEM.
    // Index only the small area occupied by the requested structure.
    function surfacePatch(cx,cz,radius,baseAt){
      const bins=new Map(),cell=8,key=(x,z)=>Math.floor(x/cell)*65536+Math.floor(z/cell);
      const x0=cx-radius,x1=cx+radius,z0=cz-radius,z1=cz+radius;
      function yAt(x,z,encoded){
        const y=datum+scale*encoded,base=baseAt(x,z);
        return spec.water!==undefined&&y<=spec.water+.12?Math.min(base,y):base+(y-base)*edge(x,z);
      }
      for(const {xyz,triangles} of sections){
        for(let j=0;j<triangles.length;j+=3){
          const a=3*triangles[j],b=3*triangles[j+1],c=3*triangles[j+2];
          const ax=left+xyz[a],az=top+xyz[a+1],bx=left+xyz[b],bz=top+xyz[b+1],dx=left+xyz[c],dz=top+xyz[c+1];
          const lx=Math.max(x0,Math.min(ax,bx,dx)),rx=Math.min(x1,Math.max(ax,bx,dx));
          const tz=Math.max(z0,Math.min(az,bz,dz)),bzLimit=Math.min(z1,Math.max(az,bz,dz));
          if(lx>rx||tz>bzLimit)continue;
          const Bx=bx-ax,Bz=bz-az,Cx=dx-ax,Cz=dz-az,det=Bx*Cz-Bz*Cx;
          if(!det)continue;
          const ay=yAt(ax,az,xyz[a+2]);
          const tri=[ax,az,ay,Cz/det,-Cx/det,-Bz/det,Bx/det,yAt(bx,bz,xyz[b+2])-ay,yAt(dx,dz,xyz[c+2])-ay];
          for(let ix=Math.floor(lx/cell);ix<=Math.floor(rx/cell);ix++)for(let iz=Math.floor(tz/cell);iz<=Math.floor(bzLimit/cell);iz++){
            const k=ix*65536+iz;if(!bins.has(k))bins.set(k,[]);bins.get(k).push(tri);
          }
        }
      }
      return (x,z)=>{
        if(x<x0||x>x1||z<z0||z>z1)return null;
        for(const [ax,az,y,ux,uz,vx,vz,by,cy] of bins.get(key(x,z))||[]){
          const dx=x-ax,dz=z-az,u=ux*dx+uz*dz,v=vx*dx+vz*dz;
          if(u>=-1e-7&&v>=-1e-7&&u+v<=1.0000001)return y+u*by+v*cy;
        }
        return null;
      };
    }
    function add(T,scene,initialMaterial,baseAt,texture){
      const material=initialMaterial.clone();
      material.uniforms={...initialMaterial.uniforms};
      if(material.uniforms.linearOutput)material.uniforms.linearOutput={value:false};
      const hasDetail=material.uniforms.detailOrtho!==undefined;
      const photo=texture('landform-'+spec.asset+'-aerial.webp');
      if(spec.style==='alaska')material.uniforms.localPhoto={value:photo};
      else if(spec.style)material.uniforms.photo={value:photo};
      else if(hasDetail)material.uniforms.detailOrtho={value:photo};
      else material.uniforms.aerial={value:photo};
      const localUV='vec2((xz.x-('+left+'.))/'+(right-left)+'. ,1.-(xz.y-('+top+'.))/'+(bottom-top)+'.)';
      const prefix='varying vec4 landformHorizon;\n';
      const point=spec.style==='alaska'?'p':'wp';
      material.vertexShader='attribute vec4 landformExposure;'+prefix+material.vertexShader.replace(point+'=position;',point+'=position;landformHorizon=landformExposure;');
      material.fragmentShader=prefix+material.fragmentShader;
      if(spec.style){
        // Preserve each destination's native cliff, ice or sandstone shader.
        // Only the orthophoto registration and source-horizon lighting change.
        const local=localUV.replace(/xz\./g,point+'.xz.');
        const uv=spec.style==='alaska'?'texture2D(localPhoto,uvLocal)':spec.style==='swiss'?'texture2D(photo,tileUv)':'texture2D(photo,tc)';
        material.fragmentShader=material.fragmentShader.replace(uv,uv.replace(uv.slice(uv.indexOf(',')+1,-1),local));
        if(spec.style==='alaska')material.fragmentShader=material.fragmentShader
          .replace('vec3 nn=normalize(n);','vec3 mappedForestPhoto=base;vec3 nn=normalize(n);')
          .replace('vec3 substrate=mix(stone,',`
            // A shaded Sitka spruce stand can appear slate grey in RGB.
            // The registered red/NIR cover separates those crowns from the bare wall.
            float bankForest=landformHorizon.z*landformHorizon.w;
            forest=max(forest,bankForest*.97);
            vec3 substrate=mix(stone,`)
          .replace('float viewSky=mix(',`
            vec3 photographedBank=mappedForestPhoto*(.89+.17*max(nn.y,0.));
            base=mix(base,photographedBank,bankForest*.86);
            float viewSky=mix(`);
        if(spec.style==='swiss')material.fragmentShader=material.fragmentShader.replace('texture2D(photo,tileUv,4.)','texture2D(photo,'+local+',4.)');
        const marker=spec.style==='alaska'?'gl_FragColor=vec4(base,1.);':spec.style==='canyon'?'color=mix(color,haze,':'gl_FragColor=vec4(aerial(rgb,d),1.);';
        const color=spec.style==='alaska'?'base':spec.style==='canyon'?'color':'rgb';
        material.fragmentShader=material.fragmentShader.replace(marker,`
          float landmarkAltitude=asin(clamp(sun.y,0.,1.));
          float landmarkSky=landformHorizon.x;
          float landmarkLit=smoothstep(-.045,.045,landmarkAltitude-landformHorizon.y*1.539);
          ${color}*=mix(1.,(.76+.24*landmarkSky)*(.72+.28*landmarkLit),landformHorizon.w);`+marker);
      }else if(hasDetail)material.fragmentShader=material.fragmentShader.replace('photo=mix(photo,texture2D(detailOrtho,vec2(focus.x,-focus.y)/2900.+.5).rgb,blend);',
        'photo=mix(photo,texture2D(detailOrtho,'+localUV+').rgb,landformHorizon.w);');
      else material.fragmentShader=material.fragmentShader.replace('texture2D(aerial,photoUv)','texture2D(aerial,'+localUV+')');
      if(!spec.style)material.fragmentShader=material.fragmentShader
        .replace('dense*=orthoCoverage;',`dense=mix(dense,landformHorizon.z*.96,landformHorizon.w);dense*=orthoCoverage;`)
        .replace('vec3 c=mix(photo,stoneColor,materialWeight);',`
          // Needle-bearing stands on the talus and near-horizontal shelves have
          // high infrared return. Exposed faces and rock channels have low return.
          float landmarkLedge=landformHorizon.w*(1.-landformHorizon.z)*smoothstep(.22,.70,1.-normal.y);
          vec3 landmarkMineral=stoneColor*vec3(1.07,1.012,.926);
          vec3 c=mix(photo,mix(stoneColor,landmarkMineral,landmarkLedge),max(materialWeight,landmarkLedge*.88));`)
        .replace('sunlit=occ.r;',`sunlit=occ.r;
          float localHorizon=landformHorizon.y*1.539;
          float altitude=asin(clamp(sun.y,0.,1.));
          float landformSunVisibility=smoothstep(localHorizon-.042,localHorizon+.054,altitude);
          sunlit=mix(sunlit,min(sunlit,.18+.82*landformSunVisibility),landformHorizon.w);
          c*=mix(1.,.63+.37*landformHorizon.x,landformHorizon.w);`);
      const group=new T.Group();group.name=spec.name+' · continuous terrain';
      group.userData.aerieLandform={name:spec.name,source:spec.source,rect};
      scene.add(group);
      let faces=0;
      const low=spec.water;
      for(const part of sections){
        const n=part.xyz.length/3,pos=new Float32Array(n*3),norm=new Float32Array(n*3),ex=new Uint8Array(part.light);
        for(let i=0;i<n;i++){
          const j=i*3,x=left+part.xyz[j],z=top+part.xyz[j+1],w=edge(x,z),base=baseAt(x,z);
          const y=datum+part.xyz[j+2]*scale;
          pos[j]=x;pos[j+1]=low!==undefined&&y<=low+.12?Math.min(base,y):base+(y-base)*w;pos[j+2]=z;
          // Calculate boundary normals from the adjoining native terrain so both
          // shapes and lighting meet continuously at the exact old survey slot.
          const a=x-2,b=x+2,c=z-2,d=z+2;
          const sx=(w>.999?sample(a,z)-sample(b,z):height(a,z,baseAt(a,z))-height(b,z,baseAt(b,z)));
          const sz=(w>.999?sample(x,c)-sample(x,d):height(x,c,baseAt(x,c))-height(x,d,baseAt(x,d)));
          const inv=1/Math.hypot(sx,4,sz);norm[j]=sx*inv;norm[j+1]=4*inv;norm[j+2]=sz*inv;
          ex[4*i+3]=Math.round(255*w);
        }
        const geometry=new T.BufferGeometry();
        geometry.setAttribute('position',new T.BufferAttribute(pos,3));
        geometry.setAttribute('normal',new T.BufferAttribute(norm,3));
        geometry.setAttribute('landformExposure',new T.BufferAttribute(ex,4,true));
        geometry.setIndex(new T.BufferAttribute(part.triangles,1));geometry.computeBoundingSphere();
        const mesh=new T.Mesh(geometry,material);
        mesh.userData.terrainCaster=true;
        mesh.name=spec.name+' · terrain section';
        if(material.uniforms.linearOutput){
          mesh.onBeforeRender=(renderer,scene,camera)=>{
            material.uniforms.linearOutput.value=!!camera.userData.lakeReflection;
            material.uniformsNeedUpdate=true;
          };
        }
        group.add(mesh);faces+=part.triangles.length/3;
      }
      group.userData.aerieLandform.faces=faces;
      return group;
    }
    const masked=new WeakSet();
    function maskOriginal(material){
      if(masked.has(material))return;
      masked.add(material);
      // These three legacy worlds share one material across several adjoining
      // native tiles. Reserve only this measured rectangle; specialized overhangs
      // inside a declared hole retain their original geometry and lighting.
      const point=(spec.style==='alaska'?'p':'wp')+'.xz';
      const bounds=(l,t,r,b)=>'all(greaterThanEqual('+point+',vec2('+l+'. ,'+t+'.)))&&all(lessThanEqual('+point+',vec2('+r+'. ,'+b+'.)))';
      const test=bounds(...rect)+holes.map(h=>'&&!('+bounds(...h)+')').join('');
      material.userData.terrainShadowCut=test.split(point).join('shadowGround.xz');
      material.fragmentShader=material.fragmentShader.replace(/void main\(\)\s*\{/,m=>m+'if('+test+')discard;');
      material.needsUpdate=true;
    }
    return {rect,edge,sample,height,surfacePatch,add,maskOriginal,spec,woodland};
  }
  async function prepare(region){
    if(!catalog[region])return;
    if(!pending.has(region)){
      const spec=catalog[region];
      const load=fetch(url('landform-'+spec.asset+'.bin')).then(r=>{
        if(!r.ok)throw Error('Terrain survey '+r.status);
        return r.arrayBuffer();
      }).then(bytes=>{available.set(region,decode(spec,bytes));}).catch(e=>{
        pending.delete(region);console.warn('Regional landmark terrain unavailable',region,e.message);
      });
      pending.set(region,load);
    }
    return pending.get(region);
  }
  window.aerieRegionalLandforms={prepare,get:region=>available.get(region),catalog};
})();
