/* Regional landmark terrain, in the same east/up/south metre coordinates as flight physics.
   A source survey is decoded before its world is constructed. */
(() => {
  'use strict';
  const catalog={
    rockwood:{name:'Rockwood public landing and Kineo pier',asset:'rockwood',lakeBank:true,source:'USGS 3DEP, USDA NAIP and Maine GeoLibrary 2022 waterfront survey'},
    lily:{name:'Lily Bay · measured bank',asset:'lily',lakeBank:true,source:'USGS 3DEP lidar and hydrography, USDA NAIP four-band bank survey'},
    spencer:{name:'Spencer Bay · measured bank',asset:'spencer',lakeBank:true,source:'USGS 3DEP lidar and hydrography, USDA NAIP four-band bank survey'},
    meredith:{name:'Meredith Bay · measured bank',asset:'meredith',lakeBank:true,source:'USGS 3DEP lidar and hydrography, USDA NAIP four-band bank survey'},
    hesky:{name:'Hesky Park and the town landing',asset:'hesky',lakeBank:true,source:'USGS 3DEP / USDA NAIP and NH GRANIT waterfront survey'},
    wolfeboro:{name:'Wolfeboro Bay · measured bank',asset:'wolfeboro',lakeBank:true,source:'USGS 3DEP lidar and hydrography, USDA NAIP four-band bank survey'},
    diamond:{name:'Diamond Island · measured bank',asset:'diamond',lakeBank:true,source:'USGS 3DEP lidar and hydrography, USDA NAIP four-band bank survey'},
    sleepers:{name:'Sleepers Island · measured bank',asset:'sleepers',lakeBank:true,source:'USGS 3DEP lidar and hydrography, USDA NAIP four-band bank survey'},
    eggrock:{name:'Egg Rock · Frenchman Bay ledges',asset:'eggrock',island:true,source:'NOAA NGS Maine Coastal topobathymetric lidar, USGS 3DEP and USDA NAIP'},
    bakerisland:{name:'Baker Island · Cranberry Isles',asset:'bakerisland',island:true,source:'NOAA NGS Maine Coastal topobathymetric lidar, USGS 3DEP and USDA NAIP'},
    acadia:{name:'Thunder Hole · tidal chasm and granite ledges',asset:'acadia',water:0,source:'NOAA NGS 2022 Coastal Maine topobathymetric lidar and USDA NAIP, Ocean Path, Mount Desert Island'},
    moosehead:{name:'Mount Kineo',asset:'kineo',rock:'rhyolite',water:312.23,holes:[[236,-1260,344,-1040],[360,-964,416,-880]],
      source:'USGS 3DEP Western Mountains B24 and USDA NAIP, eastern and southern Mount Kineo, Maine'},
    lofoten:{name:'Olstinden · fjord-facing wall',asset:'lofoten',water:0,source:'Kartverket national terrain model and Copernicus Sentinel-2, Lofoten, Norway'},
    reinebringen:{name:'Reinebringen, Reinevatnet and Hammarskaftet',asset:'reinebringen',water:0,holes:[[1432,3912,2600,4840]],source:'Kartverket 2 m DTM, Copernicus Sentinel-2 and Simo Räsänen’s Reinevågen rock photograph'},
    reine:{name:'Reine · stockfish harbour and church',asset:'reine',water:0,source:'Kartverket ground and surface models, OpenStreetMap contributors, Cappo80 (CC BY 4.0)'},
    korten:{name:'Korten · tidal skerries east of Hamnøy',asset:'korten',water:0,source:'Kartverket two-metre DTM and Copernicus Sentinel-2, 16 July 2025'},
    hamnoy:{name:'Hamnøy · fishing harbor and tidal ledges',asset:'hamnoy',water:0,source:'Kartverket national terrain model and Copernicus Sentinel-2 summer imagery, Moskenes, Norway'},
    milford:{name:'Rahotu Mitre Peak · crest and Sinbad wall',asset:'milford',water:0,source:'LINZ NZ 8m Digital Elevation Model (2012) and Southland 0.75m Rural Aerial Photos (2005–2011)'},
    labrador:{name:'Lac Berté · south narrows and camp headland',asset:'labrador',water:359,source:'Gouvernement du Québec MRNF 2022 lidar terrain and aerial imagery, Côte-Nord'},
    yosemitefalls:{name:'Yosemite Falls · creek, lip and basin',asset:'yosemite-falls',source:'USGS 2019 Yosemite 1 m 3DEP and USDA August 2022 NAIP'},
    yosemite:{name:'El Capitan · Nose and southeast face',asset:'yosemite',source:'USGS 3DEP and USDA NAIP, Yosemite Valley, California'},
    yosemitesummits:{name:'Half Dome and Clouds Rest · upper Yosemite Valley',asset:'yosemite-summits',
      source:'USGS 3DEP 1/3-arcsecond DEM and USDA California 2022 60 cm NAIP, Yosemite National Park'},
    watchman:{name:'The Watchman · observation station and andesite rim',asset:'watchman',source:'USGS 3DEP, Oregon DOGAMI 2010 lidar and USDA NAIP'},
    cleetwood:{name:'Cleetwood Cove · trail, boulder shore and submerged shelf',asset:'cleetwood',source:'USGS 3DEP, DOGAMI lidar, USDA NAIP and July 2000 USGS multibeam bathymetry'},
    crater:{name:'Wizard Island · crater rim and lava apron',asset:'crater',water:1880.62,source:'USGS 3DEP and USDA NAIP, Crater Lake, Oregon'},
    winnipesaukee:{name:'Rattlesnake Island · high spine and shore ledges',asset:'winnipesaukee',water:153.11,source:'USGS 3DEP and USDA NAIP, Lake Winnipesaukee, New Hampshire'},
    dixville:{name:'Mount Gloriette · western notch wall',asset:'dixville',source:'USGS 3DEP and USDA NAIP, Dixville Notch, New Hampshire'},
    surry:{name:'Surry Mountain Dam · crest and spillway approach',asset:'surry',water:152.33,source:'USGS 3DEP and USDA NAIP, Surry, New Hampshire'},
    canyonshelves:{name:'Sandstone Shelves · inner Colorado River slickrock',asset:'canyonshelves',style:'canyon',
      source:'USGS 3DEP Northeastern Arizona one-metre lidar and USDA 30 cm NAIP, July 14, 2023'},
    canyon:{name:'Horseshoe Bend · central promontory and inner wall',asset:'canyon',style:'canyon',holes:[[-592,-336,-456,-240]],source:'USGS 3DEP and USDA NAIP, Glen Canyon, Arizona'},
    alaska:{name:'Nugget Falls · wall and scoured bedrock',asset:'alaska',style:'alaska',water:0,source:'USGS Southeast Alaska Landslides D22 elevation, Juneau 2012 and 2013 canopy lidar and registered 2013 Juneau RGB at colorized returns'},
    swiss:{name:'Fründenschnuer · limestone shelf and east wall',asset:'swiss',style:'swiss',water:0,source:'swisstopo swissALTI3D and SWISSIMAGE, Oeschinensee, Switzerland'},
    frunden:{name:'Fründenhütte and the glacier terminus',asset:'frunden',style:'swiss',source:'Federal Office of Topography swisstopo, swissALTI3D, swissBUILDINGS3D and SWISSIMAGE'},
    swisswest:{name:'Oeschinensee · western strand and scree fan',asset:'swisswest',style:'swiss',water:0,source:'Federal Office of Topography swisstopo, swissALTI3D 2025 and SWISSIMAGE, Oeschinensee, Switzerland'}
  };
  const available=new Map(),pending=new Map();
  const ease=x=>{const f=Math.max(0,Math.min(1,x));return f*f*(3-2*f);};
  const url=file=>window.aerieAssetURL?.(file)||file;
  function decode(spec,buffer){
    const head=new DataView(buffer);
    const version=head.getUint16(4,true);
    if(head.getUint32(0)!==0x41524631||(version!==1&&version!==2))throw Error('Unreadable regional terrain survey');
    // Small coastal fissures use quarter-metre horizontal coordinates. The
    // original regional mountain tiles store whole metres in the same fields.
    const unit=version===2?.25:1;
    const step=head.getUint16(6,true)*unit,rect=[8,12,16,20].map(i=>head.getInt32(i,true));
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
      const key=Math.floor(3*x*unit/(n*(right-left)))+4*Math.floor(3*z*unit/(n*(bottom-top)));
      const sector=sectors.get(key)||{parts:[],vertices:0,indices:0};
      sector.parts.push({xyz,light,triangles});sector.vertices+=n;sector.indices+=triangles.length;
      sectors.set(key,sector);
    }
    let woodland=null;
    if(at+8<=buffer.byteLength&&head.getUint32(at,true)===0x31525446){
      const roots=head.getUint32(at+4,true);at+=8;
      woodland=new Int16Array(buffer,at,roots*3);at+=woodland.byteLength;
    }
    let canopyObserved=null,watercourse=null;
    if(spec.style==='alaska'&&at+10<=buffer.byteLength&&head.getUint32(at,true)===0x314a4243){
      const stride=head.getUint16(at+4,true),cols=head.getUint16(at+6,true),rows=head.getUint16(at+8,true);
      at+=10;
      const mask=new Uint8Array(buffer,at,Math.ceil(cols*rows/8));at+=mask.byteLength;
      canopyObserved=(x,z)=>{
        const i=Math.floor((x-left)/stride),j=Math.floor((z-top)/stride);
        if(i<0||i>=cols||j<0||j>=rows)return false;
        const k=j*cols+i;
        return !!(mask[k>>>3]&(1<<(k&7)));
      };
    }
    if(spec.style==='alaska'&&at+6<=buffer.byteLength&&head.getUint32(at,true)===0x31574c46){
      const stations=head.getUint16(at+4,true);at+=6;watercourse=[];
      for(let i=0;i<stations;i++,at+=6)watercourse.push([
        head.getInt16(at,true),head.getInt16(at+2,true)/10,head.getInt16(at+4,true)/10
      ]);
    }
    let horizon=null;
    if(spec.island&&at+12<=buffer.byteLength&&head.getUint32(at)===0x4c4f4431){
      const n=head.getUint32(at+4,true),f=head.getUint32(at+8,true);at+=12;
      const xyz=new Uint16Array(buffer,at,3*n);at+=xyz.byteLength;
      const light=new Uint8Array(buffer,at,4*n);at+=light.byteLength;
      const triangles=new Uint16Array(buffer,at,3*f);at+=triangles.byteLength;
      horizon={xyz,light,triangles};
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
    const surveyedBed=spec.asset==='winnipesaukee'?window.makeWinnipesaukeeWaterfront?.islandBed
      :spec.asset==='swisswest'?window.makeOeschinenLanding?.berthWeight:null;
    function fitElevation(x,z,h,base,w){
      const fitted=base+(h-base)*w;
      if(spec.water===undefined||h>spec.water+.12)return fitted;
      const deep=Math.min(base,h),weight=surveyedBed?.(x,z)||0;
      return deep+(fitted-deep)*weight;
    }
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
      return fitElevation(x,z,h,base,w);
    }
    // Low structures and patch overlays need the rendered triangles, whose
    // error-limited decimation may differ from the regularly sampled DEM.
    // Index only the small area occupied by the requested structure.
    function surfacePatch(cx,cz,radius,baseAt){
      const bins=new Map(),cell=8,key=(x,z)=>Math.floor(x/cell)*65536+Math.floor(z/cell);
      const x0=cx-radius,x1=cx+radius,z0=cz-radius,z1=cz+radius;
      function yAt(x,z,encoded){
        const y=datum+scale*encoded,base=baseAt(x,z);
        return fitElevation(x,z,y,base,edge(x,z));
      }
      for(const {xyz,triangles} of sections){
        for(let j=0;j<triangles.length;j+=3){
          const a=3*triangles[j],b=3*triangles[j+1],c=3*triangles[j+2];
          const ax=left+unit*xyz[a],az=top+unit*xyz[a+1],bx=left+unit*xyz[b],bz=top+unit*xyz[b+1],dx=left+unit*xyz[c],dz=top+unit*xyz[c+1];
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
          .replace('float forest=smoothstep(.004,.05,base.g-base.r)*smoothstep(.012,.085,base.g-base.b);',`$&
            // A shaded Sitka spruce stand can appear slate grey in RGB.
            // The registered red/NIR cover separates those crowns from the bare wall.
            float bankForest=landformHorizon.z*landformHorizon.w;
            forest=max(forest,bankForest*.97);
            `)
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
      if(spec.asset==='watchman'||spec.asset==='cleetwood'){
        // The broader caldera relief is several metres per texel. Retain its storm lighting
        // over the local lidar surface, restoring the mapped exposure before the cloud shadow.
        material.uniforms.calderaAlbedo={value:texture('crater-rim-andesite.webp',true)};
        material.fragmentShader=material.fragmentShader
          .replace('normal=normalize(mix(normal,measuredNormal,surveyed*.88));','normal=normalize(mix(normal,measuredNormal,surveyed*.88*(1.-landformHorizon.w)));')
          .replace('float squallShade=craterShade(wp);',`
            vec4 rimSample=texture2D(aerial,${localUV});vec3 rimPhoto=rimSample.rgb;
            float footpath=(1.-smoothstep(.54,.97,rimSample.a));
            vec3 detailPos=wp+vec3(1.43*sin(wp.z*.078)+.48*cos(wp.y*.109),.69*sin(wp.x*.081),1.36*sin(wp.x*.073));
            vec3 projection=pow(abs(normal),vec3(3.));projection/=max(.005,dot(projection,vec3(1.)));
            vec3 rockFabric=texture2D(calderaAlbedo,detailPos.zy*.47).rgb*projection.x+
                            texture2D(calderaAlbedo,detailPos.xz*.47).rgb*projection.y+
                            texture2D(calderaAlbedo,detailPos.xy*.47).rgb*projection.z;
            float weave=clamp(lum(rockFabric)/.46,.46,1.53);
            float stand=landformHorizon.z;
            float deepShadow=1.-smoothstep(.13,.41,lum(rimPhoto));
            vec3 localRock=mix(rimPhoto,vec3(.40,.38,.34)*(1.+.55*(weave-1.)),deepShadow*(1.-stand)*.61);
            localRock*=1.+mix(.18,.40,1.-abs(normal.y))*(weave-1.)*(1.-stand)*(1.-smoothstep(65.,310.,d));
            vec3 tread=mix(vec3(.43,.39,.335),vec3(.63,.585,.51),clamp(.50+(weave-1.)*.65,0.,1.));
            localRock=mix(localRock,tread,footpath*.83);
            vec3 clearSky=vec3(.49,.56,.69)*(.62+.38*landformHorizon.x);
            float facetLight=max(0.,dot(normal,sun));
            vec3 rimLight=clearSky+vec3(.86,.79,.65)*facetLight*sunlit;
            ${spec.asset==='watchman'?`// Project the lookout mass along this world's actual directional sun onto the summit.
            vec2 ds=wp.xz-vec2(-3942.83,379.27);
            if(dot(ds,ds)<4900. && wp.y<2449.38 && sun.y>.03){
              vec2 sunPlane=wp.xz+sun.xz*(2447.53-wp.y)/sun.y-vec2(-3942.83,379.27);
              vec2 stationUV=vec2(dot(sunPlane,vec2(.8311,-.5561)),dot(sunPlane,vec2(.5561,.8311)));
              float penumbra=.25+clamp((2447.53-wp.y)*.052,0.,1.1);
              float roofShadow=1.-smoothstep(3.05-penumbra,3.05+penumbra,max(abs(stationUV.x),abs(stationUV.y)));
              vec2 baseUV=vec2(dot(ds,vec2(.8311,-.5561)),dot(ds,vec2(.5561,.8311)));
              vec2 contactDist=max(abs(baseUV)-2.56,0.);float contact=exp(-dot(contactDist,contactDist)*1.4);
              rimLight=clearSky*(1.-.20*contact)+vec3(.86,.79,.65)*facetLight*sunlit*(1.-.86*roofShadow);
            }`:''}
            c=mix(c,pow(max(localRock,vec3(.014)),vec3(2.2))*rimLight,landformHorizon.w);
            float squallShade=craterShade(wp);`);
      }
      if(spec.asset==='canyonshelves'){
        const local=localUV.replace(/xz\./g,'wp.xz.');
        material.fragmentShader=material.fragmentShader
          .replace('vec3 aerial=texture2D(photo,'+local+').rgb;',`vec4 bankSurvey=texture2D(photo,${local});vec3 aerial=bankSurvey.rgb;`)
          .replace('dry*=indirect+sunward;',`
            // The 30 cm aerial separates pavement, oxidized joint seams and
            // sandy swales. Its low-frequency slope exposure was removed at bake.
            float stone=bankSurvey.a*(1.-wet);
            float closeStone=stone*(1.-smoothstep(24.,130.,dist));
            // The nearby overlook provides a photographed specimen of the same
            // formation: fine, fretted stone with local sand stuck in its grooves.
            // Work in metres, including the sloping surface seen obliquely.
            vec2 siteUV=mat2(.93,-.37,.37,.93)*wp.xz;
            float dish=.22*sin(.17*siteUV.y)+.11*sin(.31*siteUV.x+.46*siteUV.y);
            vec2 exposureUV=vec2(siteUV.x*.41,(siteUV.y+.38*wp.y+dish)*.478);
            vec2 slab=1.-abs(mod(exposureUV,2.)-1.);
            float grit=lum(texture2D(crossbeds,vec2(.504+.490*slab.x,.014+.297*slab.y)).rgb);
            vec2 bedding=vec2(siteUV.x*.135,siteUV.y*.19+wp.y*.24+dish);
            float pores=texture2D(strata,bedding).a;
            vec2 stepUV=1.-abs(mod(.309*exposureUV+vec2(.41,.72),2.)-1.);
            float coarse=lum(texture2D(crossbeds,vec2(.504+.490*stepUV.x,.014+.297*stepUV.y)).rgb);
            float grainRelief=clamp(1.92*(grit-.54)+1.15*(pores-.576)+.62*(coarse-.54),-.54,.61);
            vec3 fieldStone=bankSurvey.rgb*vec3(1.055,1.009,.975)*(1.+closeStone*grainRelief);
            dry=mix(dry,fieldStone,landformHorizon.w*(.38+.60*stone));
            dry*=indirect+sunward;`);
      }
      if(spec.asset==='frunden'){
        material.uniforms.hutApron={value:texture('frunden-apron.webp')};
        material.fragmentShader='uniform sampler2D hutApron;\n'+material.fragmentShader;
        const uv=localUV.replace(/xz\./g,'wp.xz.');
        // Federal aerial imagery resolves bare, polished moraine and old grey ice here.
        // Preserve the measured ice margin, medial debris and flow-following crevasses.
        material.fragmentShader=material.fragmentShader
          .replace('vec3 n=normalize(norm);',`vec4 moraineSource=texture2D(photo,${uv});
            vec2 apronUv=vec2((wp.x-1240.)/80.,1.-(wp.z-1880.)/80.);
            float apronEdge=min(min(apronUv.x,1.-apronUv.x),min(apronUv.y,1.-apronUv.y));
            moraineSource.rgb=mix(moraineSource.rgb,texture2D(hutApron,clamp(apronUv,0.,1.)).rgb,smoothstep(.0,.12,apronEdge));
            float glacialCover=smoothstep(.128,.984,moraineSource.a)*landformHorizon.w;
            vec3 n=normalize(norm);`)
          .replace('n=normalize(mix(n,geomNormal,surveyWeight*','n=normalize(mix(n,geomNormal,(1.-landformHorizon.w)*surveyWeight*')
          .replace('vec3 underfoot=',`rgb=mix(rgb,moraineSource.rgb,landformHorizon.w*(.71+.26*glacialCover));
            vec3 underfoot=`)
          .replace('if(alpineFloor>.001)','alpineFloor*=1.-landformHorizon.w;if(alpineFloor>.001)')
          .replace('rgb*=1.+(1.-rockMix)*closeup*.65*(soilTexture-.38);','rgb*=1.+(1.-landformHorizon.w)*(1.-rockMix)*closeup*.65*(soilTexture-.38);')
          .replace('rgb=regionalSoil(groundScan,wp,n,rgb,sun,d,woodland,1.-smoothstep(1.4,20.,abs(wp.y)),meadow);',
            'if(landformHorizon.w<.998)rgb=mix(regionalSoil(groundScan,wp,n,rgb,sun,d,woodland,1.-smoothstep(1.4,20.,abs(wp.y)),meadow),rgb,landformHorizon.w);')
          .replace('float irradiance=exposure*diffuse;',`float iceGlance=pow(1.-max(0.,dot(normalize(cameraPosition-wp),n)),3.);
            rgb=mix(rgb,rgb*vec3(.94,.992,1.055)+vec3(.012,.019,.026)*iceGlance,glacialCover*.73);
            float irradiance=exposure*diffuse;`);
      }
      if(spec.asset==='reinebringen')window.applyReinebringenSurface(material,localUV,texture);
      if(spec.asset==='reine'){
        const uv=localUV;
        material.fragmentShader=material.fragmentShader.replace('float skyView=occ.g,relief=',`
          vec4 villageSurface=texture2D(aerial,${uv});
          float surfaced=smoothstep(.13,.99,villageSurface.a);
          float roadGrain=soilCapture(sod,wp.xz*.31,3.).r;
          vec3 photographed=villageSurface.rgb*(1.+surfaced*.19*(roadGrain-.46)*(1.-smoothstep(50.,240.,d)));
          c=mix(c,photographed,landformHorizon.w*(.77+.21*surfaced)*smoothstep(.35,.85,normal.y));
          float skyView=occ.g,relief=`);
      }
      if(spec.asset==='reine'||spec.asset==='reinebringen'){
        material.uniforms.westQuaySurface={value:texture('reine-west-surface.webp')};
        material.fragmentShader='uniform sampler2D westQuaySurface;\n'+material.fragmentShader.replace('float skyView=occ.g,relief=',`
          // The harbor survey distinguishes quay aprons and roads from semi-natural heath.
          // The shady south shoulder carries willow and damp grass at the roots of the lidar crowns.
          vec2 quayUv=(wp.xz-vec2(1110.,3750.))/vec2(690.,1100.);
          vec4 quayAlbedo=texture2D(westQuaySurface,vec2(quayUv.x,1.-quayUv.y));
          float quayEdge=min(min(quayUv.x,quayUv.y),min(1.-quayUv.x,1.-quayUv.y));
          float dampRock=.15*soilCapture(sod,wp.xz*.22,3.).r;
          vec3 quayGround=quayAlbedo.rgb*(.955+dampRock*(1.-smoothstep(34.,198.,d)));
          c=mix(c,quayGround,quayAlbedo.a*smoothstep(.0,.012,quayEdge)*.98);
          float skyView=occ.g,relief=`);
      }
      if(spec.island)material.fragmentShader=window.acadiaIslandSurface(material.fragmentShader,localUV,hasDetail?'detailOrtho':'aerial');
      if(spec.asset==='acadia'){
        // At the inset the point cloud resolves the two sides of the chasm.
        // The broader cliff-normal map averages across this narrow opening.
        material.fragmentShader=material.fragmentShader.replace('normal=normalize(mix(normal,ledgeNormal,.94*graniteShore));',
          'ledgeNormal=normalize(mix(ledgeNormal,normal,landformHorizon.w));normal=normalize(mix(normal,ledgeNormal,.94*graniteShore));');
      }
      if(spec.asset==='rockwood'){
        // Federal summer RGB supplies the foliage and aggregate color. The alpha
        // encodes only the registered walking/parking surfaces. The same lighting
        // expression is used by the town docks without consuming another sampler.
        const sampler=hasDetail?'detailOrtho':'aerial';
        material.fragmentShader=material.fragmentShader.replace('/* lake bank surface */',`
          vec4 landingSample=texture2D(${sampler},${localUV});
          float landingCover=(1.-landingSample.a)*landformHorizon.w;
          vec3 landingLight=(ambient+direct)*(.95+.05*skyView);
          c=mix(c,pow(landingSample.rgb,vec3(2.2))*landingLight,landingCover);
          /* lake bank surface */`);
      }else if(spec.lakeBank){
        const sampler=hasDetail?'detailOrtho':'aerial';
        material.fragmentShader=material.fragmentShader.replace('/* lake bank surface */',`
          // The mapped crown-top horizon is sampled toward this lake's sun.
          // Open gravel, lawns and forest gaps retain their sky illumination.
          float bankLight=texture2D(${sampler},${localUV}).a;
          float shelter=mix(1.,.45+.55*bankLight,landformHorizon.w);
          c*=shelter;
          /* lake bank surface */`);
      }
      const municipal=spec.lakeBank&&window.winniTownDocks?.[spec.asset]?.publicGround;
      if(municipal){
        const [x0,z0,x1,z1]=municipal.bounds,number=x=>Number(x).toFixed(2);
        // The two town sites are outside the Weirs inset. Its sampler is
        // idle on these meshes, including in the reflected camera.
        material.uniforms.waterfront0={value:texture(spec.asset+'-town-ground.webp')};
        material.fragmentShader=material.fragmentShader.replace('/* lake bank surface */',`
          vec2 streetUV=(xz-vec2(${number(x0)},${number(z0)}))/vec2(${number(x1-x0)},${number(z1-z0)});
          vec2 streetEdge=min(streetUV,1.-streetUV)*vec2(${number(x1-x0)},${number(z1-z0)});
          float streetCover=smoothstep(0.,10.,min(streetEdge.x,streetEdge.y))*smoothstep(shoreLevel-.16,shoreLevel+.12,wp.y);
          if(streetCover>.001){
            vec3 streetColor=texture2D(waterfront0,vec2(streetUV.x,1.-streetUV.y)).rgb;
            vec3 streetLight=(ambient+direct)*(.95+.05*skyView);
            vec3 streetSurface=pow(max(streetColor,vec3(0.)),vec3(2.2))*streetLight*mix(1.,shelter,.46);
            c=mix(c,streetSurface,streetCover*.98);
          }
          /* lake bank surface */`);
      }
      if(spec.asset==='yosemite-summits'||spec.asset==='korten'||spec.asset==='reine'||spec.asset==='reinebringen'||(spec.lakeBank&&!hasDetail)){
        // The entire survey sits outside the valley's original aerial. Blend
        // the registered 2022 NAIP image at its edges with the true far region.
        material.fragmentShader=material.fragmentShader.replace(
          /vec3 photo=mix\(texture2D\(aerial,[^;]+;/,
          'vec3 photo=mix(texture2D(ranges,vec2(xz.x,-xz.y)/farSpan+.5).rgb,texture2D(aerial,'+localUV+').rgb,landformHorizon.w);');
      }
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
      if(spec.style==='alaska'&&canopyObserved){
        const locationUV=localUV.replace(/xz\./g,'p.xz.');
        material.fragmentShader=window.nuggetSurfaceShader(locationUV);
      }
      const group=new T.Group();group.name=spec.name+' · continuous terrain';
      group.userData.aerieLandform={name:spec.name,source:spec.source,rect};
      scene.add(group);
      let faces=0;
      for(const part of horizon?[...sections,horizon]:sections){
        const n=part.xyz.length/3,pos=new Float32Array(n*3),norm=new Float32Array(n*3),ex=new Uint8Array(part.light);
        for(let i=0;i<n;i++){
          const j=i*3,x=left+unit*part.xyz[j],z=top+unit*part.xyz[j+1],w=edge(x,z),base=baseAt(x,z);
          const y=datum+part.xyz[j+2]*scale;
          pos[j]=x;pos[j+1]=fitElevation(x,z,y,base,w);pos[j+2]=z;
          // Calculate boundary normals from the adjoining native terrain so both
          // shapes and lighting meet continuously at the exact old survey slot.
          const normalStep=Math.min(2,step),a=x-normalStep,b=x+normalStep,c=z-normalStep,d=z+normalStep;
          const sx=(w>.999?sample(a,z)-sample(b,z):height(a,z,baseAt(a,z))-height(b,z,baseAt(b,z)));
          const sz=(w>.999?sample(x,c)-sample(x,d):height(x,c,baseAt(x,c))-height(x,d,baseAt(x,d)));
          const diameter=2*normalStep,inv=1/Math.hypot(sx,diameter,sz);norm[j]=sx*inv;norm[j+1]=diameter*inv;norm[j+2]=sz*inv;
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
        group.add(mesh);mesh.userData.distantIsland=part===horizon;
        if(part!==horizon)faces+=part.triangles.length/3;
      }
      if(horizon){
        // At a kilometre and a half the distant survey's 0.84 m relief error
        // is sub-pixel. Hysteresis keeps banks and turns from switching back.
        let previous=null;
        group.userData.updateDetail=player=>{
          const d=Math.hypot(Math.max(left-player.x,0,player.x-right),Math.max(top-player.z,0,player.z-bottom));
          const distant=d>(previous?1380:1550);
          if(previous===distant)return;
          previous=distant;
          for(const mesh of group.children)mesh.visible=mesh.userData.distantIsland===distant;
        };
        group.userData.updateDetail({x:0,z:0});
        group.userData.aerieLandform.horizonFaces=horizon.triangles.length/3;
      }
      group.userData.aerieLandform.faces=faces;
      return group;
    }
    const masked=new WeakSet();
    function maskOriginal(material,holeOverlap=0){
      if(masked.has(material))return;
      masked.add(material);
      // These three legacy worlds share one material across several adjoining
      // native tiles. Reserve only this measured rectangle; specialized overhangs
      // inside a declared hole retain their original geometry and lighting.
      const point=(spec.style==='alaska'?'p':'wp')+'.xz';
      const bounds=(l,t,r,b)=>'all(greaterThanEqual('+point+',vec2('+l.toFixed(3)+','+t.toFixed(3)+')))&&all(lessThanEqual('+point+',vec2('+r.toFixed(3)+','+b.toFixed(3)+')))';
      const test=bounds(...rect)+holes.map(([l,t,r,b])=>'&&!('+bounds(l-holeOverlap,t-holeOverlap,r+holeOverlap,b+holeOverlap)+')').join('');
      const shadowCut=test.split(point).join('shadowGround.xz');
      material.userData.terrainShadowCut=material.userData.terrainShadowCut?'('+material.userData.terrainShadowCut+')||('+shadowCut+')':shadowCut;
      material.fragmentShader=material.fragmentShader.replace(/void main\(\)\s*\{/,m=>m+'if('+test+')discard;');
      material.needsUpdate=true;
    }
    return {rect,edge,sample,height,surfacePatch,add,maskOriginal,spec,woodland,canopyObserved,watercourse};
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
