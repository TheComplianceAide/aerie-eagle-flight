/* Registered terrain, aerial imagery and original 3D waterfront structures. */
window.makeWinnipesaukeeWaterfront=function(T,scene,texture){
  const {tiles,settlement,features,launches,landmarks}=window.WINNIPESAUKEE_WATERFRONT;
  const {smoothstep,lerp}=T.MathUtils;
  const decode=string=>Uint8Array.from(atob(string),c=>c.charCodeAt(0));
  const surveys=tiles.map(tile=>({...tile,grid:new Int16Array(decode(tile.heights).buffer)}));
  const rects=tiles.map(({x,z,half})=>[x-half,z-half,x+half,z+half]);

  // A level railroad platform above the descending shoreline sits on a
  // battered stone-and-gravel fill. Keep its shoulder tied to surveyed land.
  const station=features.weirs.station,stationSite=station&&new T.Vector2(
    station.reduce((v,p)=>v+p[0],0)/4,station.reduce((v,p)=>v+p[1],0)/4);
  const stationAxis=station&&new T.Vector2(station[1][0]-station[0][0],station[1][1]-station[0][1]);
  const stationHalf=station&&new T.Vector2(stationAxis.length()*.5,Math.hypot(station[3][0]-station[0][0],station[3][1]-station[0][1])*.5);
  stationAxis?.normalize();let stationGrade;
  function elevation(sample,far,farHalf,x,z){
    const fallback=sample(far,farHalf,x,z);
    const tile=surveys.find(tile=>Math.max(Math.abs(x-tile.x),Math.abs(z-tile.z))<tile.half);
    if(!tile)return fallback;
    const dx=x-tile.x,dz=z-tile.z;
    const blend=smoothstep(Math.max(Math.abs(dx),Math.abs(dz)),tile.half-150,tile.half);
    const ground=lerp(sample(tile.grid,tile.half,dx,dz),fallback,blend);
    if(!stationSite||Math.abs(x-stationSite.x)>35||Math.abs(z-stationSite.y)>35)return ground;
    if(stationGrade===undefined)stationGrade=Math.max(...station.map(([u,v])=>sample(tile.grid,tile.half,u-tile.x,v-tile.z)))-.12;
    const u=x-stationSite.x,v=z-stationSite.y;
    const along=Math.abs(u*stationAxis.x+v*stationAxis.y)-stationHalf.x-1.4;
    const across=Math.abs(v*stationAxis.x-u*stationAxis.y)-stationHalf.y-1.4;
    const outside=Math.hypot(Math.max(0,along),Math.max(0,across));
    return Math.max(ground,stationGrade-.55*outside);
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
    if(stationSite){
      material.uniforms.trackSite={value:stationSite};material.uniforms.trackAxis={value:stationAxis};material.uniforms.trackHalf={value:stationHalf};
      material.uniforms.trackBallast={value:texture('surry-riprap.webp',true)};
      material.fragmentShader='uniform vec2 trackSite,trackAxis,trackHalf;uniform sampler2D trackBallast;\n'+material.fragmentShader.replace('float radial=',`
        vec2 fromTrack=xz-trackSite;
        vec2 trackFrame=abs(vec2(dot(fromTrack,trackAxis),dot(fromTrack,vec2(-trackAxis.y,trackAxis.x))))-trackHalf;
        float edgeDist=length(max(trackFrame,vec2(0.)));
        float shoulder=(1.-smoothstep(3.0,11.,edgeDist))*(1.-smoothstep(110.,380.,d));
        vec3 ballast=texture2D(trackBallast,vec2(wp.x*.53+wp.z*.31,wp.y*.67+wp.z*.47)).rgb;
        c=mix(c,ballast*vec3(.80,.79,.755),shoulder*.85);
        float radial=`);
    }
    material.fragmentShader=material.fragmentShader.replace(
      'float materialWeight=max(',
      'float shorelineView=max(waterfrontWeight0,waterfrontWeight1)*smoothstep(.76,.97,normal.y);\n        float materialWeight=max('
    ).replace('vec3 c=mix(photo,stoneColor,materialWeight);','vec3 c=mix(photo,stoneColor,materialWeight*(1.-shorelineView*.82));');
  }

  function finishIslandTerrain(group){
    const material=group?.children.find(mesh=>mesh.isMesh)?.material;
    if(!material)return;
    // This material is private to the Rattlesnake inset. Its Weirs sampler
    // has zero influence 14 km from the wharf, so reuse the existing unit.
    material.uniforms.waterfront0={value:texture('winnipesaukee-rattlesnake-bank.webp')};
    material.fragmentShader=material.fragmentShader.replace('float skyView=occ.g,',`
      float islandCoverage=0.;
      vec2 islandUv=(xz-vec2(740.,1760.))/vec2(610.,400.);
      if(all(greaterThan(islandUv,vec2(0.)))&&all(lessThan(islandUv,vec2(1.)))){
        vec4 bankPhoto=texture2D(waterfront0,vec2(islandUv.x,1.-islandUv.y));
        islandCoverage=bankPhoto.a;
        if(bankPhoto.a>.002){
          vec3 stoneGrain=texture2D(trackBallast,mat2(.67,.31,-.31,.67)*xz+wp.y*vec2(.21,.37)).rgb;
          vec3 localStone=bankPhoto.rgb*clamp(.69+1.1*stoneGrain,vec3(.7),vec3(1.4));
          c=mix(c,localStone,bankPhoto.a*(1.-smoothstep(550.,2300.,d)));
        }
      }
      float skyView=occ.g,`).replace('beachColor*shade,strip*local.y','beachColor*shade,strip*(1.-islandCoverage)*local.y');
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

  // Summer berth outside the Weirs excursion wharf. The public orthophoto
  // registers the wharf face. The operator gives the vessel's 230 ft length.
  function buildMountWashington(parent,level){
    const cx=-12436.3,cz=-3456.1,hx=-.728,hz=-.6856,heading=Math.atan2(-hz,hx);
    const station=[[-35.05,.85],[-34.50,2.94],[-32.8,4.33],[-28.6,4.94],[-22,5.24],[-14,5.33],
      [0,5.33],[11,5.29],[18,5.02],[24,4.39],[28,3.52],[31,2.39],[33.6,.96],[35.05,.055]];
    const white=0xe5e7db,edge=0xf4f3e5,shade=0xb9c2bf,pale=0xd7d4c4,navy=0x26333d,blue=0x4b7b9a;
    const rust=0x794f47,metal=0x7c8787,wood=0x968878,red=0x9b4844;
    const solids={position:[],color:[]},glass={position:[],color:[]};
    const tint=new T.Color(),shape=new T.BoxGeometry(),p=shape.attributes.position,indices=shape.index;
    const transform=new T.Matrix4(),a=new T.Vector3(),b=new T.Vector3(),v=new T.Vector3(),pt=new T.Vector3();
    const unitUp=new T.Vector3(0,1,0),rotation=new T.Quaternion(),scale=new T.Vector3();
    function width(u){
      const j=station.findIndex(s=>s[0]>=u);
      if(j<1)return station[j<0?station.length-1:0][1];
      const lo=station[j-1],hi=station[j];
      return lo[1]+(hi[1]-lo[1])*(u-lo[0])/(hi[0]-lo[0]);
    }
    function face(points,hue,batch=solids){
      tint.setHex(hue);
      for(let i=1;i<points.length-1;i++)for(const k of [0,i,i+1]){
        batch.position.push(...points[k]);batch.color.push(tint.r,tint.g,tint.b);
      }
    }
    function girder(from,to,w,d,hue){
      a.fromArray(from);b.fromArray(to);v.subVectors(b,a);
      const length=v.length();if(length<.001)return;
      rotation.setFromUnitVectors(unitUp,v.multiplyScalar(1/length));
      transform.compose(a.lerp(b,.5),rotation,scale.set(w,length,d));tint.setHex(hue);
      for(let i=0;i<indices.count;i++){
        pt.fromBufferAttribute(p,indices.getX(i)).applyMatrix4(transform);
        solids.position.push(pt.x,pt.y,pt.z);solids.color.push(tint.r,tint.g,tint.b);
      }
    }
    function box(u,h,v,l,r,w,c){girder([u,h-r/2,v],[u,h+r/2,v],l,w,c);}
    // The hull flares from the fine bow through the full passenger beam to
    // the curved transom. A narrow red boot and rubbing strake follow its sheer.
    const sheer=u=>.27*((Math.max(0,u-12)/23)**1.5)+.095*(Math.max(0,-u-20)/15);
    const rings=[[-.61,.84,rust],[.12,.93,rust],[.23,.96,shade],[1.38,.995,shade],
      [1.44,1.002,navy],[1.61,1.006,navy],[1.69,1.001,white],[2.28,1,white]];
    for(let i=1;i<station.length;i++){
      const [u,wu]=station[i-1],[n,wn]=station[i];
      for(const side of [-1,1]){
        for(let k=1;k<rings.length;k++){
          const [lo,lf]=rings[k-1],[hi,hf,hue]=rings[k];
          face([[u,lo+sheer(u),side*wu*lf],[n,lo+sheer(n),side*wn*lf],
            [n,hi+sheer(n),side*wn*hf],[u,hi+sheer(u),side*wu*hf]],hue);
        }
      }
      face([[u,2.28+sheer(u),-wu],[n,2.28+sheer(n),-wn],[n,2.28+sheer(n),wn],[u,2.28+sheer(u),wu]],pale);
    }
    for(const [u,w] of [station[0],station[station.length-1]])
      face([[u,-.32,-w*.90],[u,-.32,w*.90],[u,2.28+sheer(u),w],[u,2.28+sheer(u),-w]],shade);
    const line=(lo,hi,step)=>Array.from(new Set([lo,...station.map(s=>s[0]).filter(u=>u>lo&&u<hi),
      ...Array.from({length:Math.floor((hi-lo)/step)},(_,i)=>lo+step*(i+1)).filter(u=>u<hi),hi])).sort((a,b)=>a-b);
    function deck(lo,hi,y,factor,cap,tone){
      const steps=line(lo,hi,5.4);
      for(let j=1;j<steps.length;j++){
        const u=steps[j-1],n=steps[j],a=width(u)*factor,b=width(n)*factor;
        face([[u,y,-a],[n,y,-b],[n,y,b],[u,y,a]],tone);
        for(const k of [-1,1])face([[u,y-cap,k*a],[n,y-cap,k*b],[n,y,k*b],[u,y,k*a]],edge);
      }
    }
    function rails(lo,hi,y,factor){
      const stations=line(lo,hi,1.62);
      for(const side of [-1,1]){
        for(let i=0;i<stations.length;i++){
          const u=stations[i],z=side*width(u)*factor;
          girder([u,y,z],[u,y+1.02,z],.052,.052,white);
          if(i){const t=stations[i-1],s=side*width(t)*factor;
            for(const h of [.38,.70,1.02])girder([t,y+h,s],[u,y+h,z],h===1.02?.057:.032,.042,edge);}
        }
      }
    }
    function gallery(lo,hi,floor,top,factor,step,aperture,body=white){
      const spans=Math.ceil((hi-lo)/step);
      for(const side of [-1,1]){
        for(let i=0;i<spans;i++){
          const u=lo+(hi-lo)*i/spans,n=lo+(hi-lo)*(i+1)/spans;
          const w0=width(u)*factor,w1=width(n)*factor;
          const w=(t,y,offset=0)=>[u+(n-u)*t,y,side*(w0+(w1-w0)*t+offset)];
          const lower=floor<3,upper=floor>7;
          const sill=floor+(aperture?.31:upper?.87:lower?.69:.62),lintel=top-(upper?.19:lower?.47:.39);
          const jamb=aperture?.11:upper?.105:i%4===0?.31:.18;
          face([w(0,floor),w(1,floor),w(1,sill),w(0,sill)],body);
          face([w(0,lintel),w(1,lintel),w(1,top),w(0,top)],edge);
          face([w(0,sill),w(jamb,sill),w(jamb,lintel),w(0,lintel)],body);
          if(aperture){
            // Open galleries have a clear line of sight through the ship.
            girder(w(.09,sill+.44,-.05),w(1,sill+.44,-.05),.042,.042,metal);
          }else{
            const c=i%6===0?0x657370:i%3===1?0x344850:0x495c5f;
            const z=(u,y)=>w(u,y,-.035);
            face([z(jamb,sill),z(1,sill),z(1,lintel),z(jamb,lintel)],c,glass);
            if(upper||i%3!==0)girder(w(.58,sill),w(.58,lintel),.047,.047,shade);
            if(!upper&&i%7===4)face([w(jamb,lintel-.19),w(1,lintel-.19),w(1,lintel),w(jamb,lintel)],0x9eaa9f);
          }
        }
      }
    }
    // The lowest gallery extends almost to the stem. Let the foredeck
    // handrails and roof cast their own silhouette across its open sides.
    deck(-34.48,34.1,4.93,1.01,.22,0xd9d8cc);
    gallery(-32.85,14.9,2.28,4.79,.97,1.55,false);
    gallery(14.9,32.2,2.34,4.79,.98,3.12,true);
    box(14.9,3.50,0,.12,2.39,width(14.9)*1.85,shade);
    box(2.4,3.42,0,42.5,2.23,6.8,0x748282);
    rails(14.8,34.2,4.93,.975);rails(-34.22,-25.8,4.93,.97);
    deck(-31.3,24.1,7.39,.95,.22,0xdad9cd);
    gallery(-30.73,13.6,4.94,7.20,.87,1.34,false);
    gallery(13.6,21.65,4.94,7.20,.87,2.4,true);
    box(13.6,5.99,0,.15,2.15,width(13.6)*1.70,shade);
    // Segment the rounded stern into individual glazed bays. There is an
    // open stern gallery above it, with the roof supported on slim uprights.
    function sternWindows(mid,bow,half,floor,roof){
      const sill=floor+.67,lintel=roof-.39;
      const corner=a=>[bow-(bow-mid)*Math.sin(a),half*Math.cos(a)];
      for(let i=0;i<9;i++){
        const [ax,az]=corner(Math.PI*i/9),[bx,bz]=corner(Math.PI*(i+1)/9);
        const at=(t,y)=>[ax+(bx-ax)*t,y,az+(bz-az)*t];
        face([at(0,floor),at(1,floor),at(1,sill),at(0,sill)],white);
        face([at(0,lintel),at(1,lintel),at(1,roof),at(0,roof)],edge);
        face([at(0,sill),at(.18,sill),at(.18,lintel),at(0,lintel)],white);
        face([at(.18,sill),at(1,sill),at(1,lintel),at(.18,lintel)],i%3?0x465960:0x647473,glass);
      }
    }
    sternWindows(-34.40,-32.85,width(-32.85)*.97,2.28,4.80);
    sternWindows(-31.95,-30.73,width(-30.73)*.87,4.94,7.19);
    // Glazed blue-sided upper saloon and the narrower white bridge, open
    // promenades fore and aft, and the single broad cream funnel with a black cap.
    deck(-20.0,18.55,9.78,.86,.19,edge);
    gallery(-19.17,9.55,7.40,9.60,.78,1.46,false,blue);
    for(const k of [-1,1])box(-4.82,7.77,k*4.13,28.5,.69,.12,blue);
    gallery(9.55,17.95,7.40,9.61,.73,1.11,false,edge);
    for(const u of [-19.17,17.95]){
      const w=width(u)*(u<0?.78:.73);box(u,7.75,0,.12,.68,2*w,white);
      face([[u,8.09,-w],[u,8.09,w],[u,9.44,w],[u,9.44,-w]],0x52636a,glass);
      for(let z=-w;z<w+.02;z+=.98)box(u,8.77,z,.15,1.36,.094,edge);
    }
    rails(-31.0,-20.0,7.39,.91);rails(18.44,23.47,7.39,.92);
    for(const side of [-1,1]){
      const v=side*4.63;
      for(let j=0;j<12;j++)box(12.15+j*.232,5.08+j*.197,v,.27,.10,.73,shade);
      for(const k of [-1,1])girder([12.1,5.91,v+k*.36],[14.81,8.22,v+k*.36],.051,.051,white);
    }
    deck(-26.3,-19.64,9.58,.77,.105,0xe8e5d5);
    for(const u of [-25.95,-23.05,-20.15])for(const k of [-1,1])
      girder([u,7.40,k*width(u)*.73],[u,9.51,k*width(u)*.73],.068,.068,edge);
    // Weather deck furniture, mushroom vents and paired horns resolve as the
    // bird comes alongside. They use the same static hull draw.
    function seat(u,h,z,faceBow){
      box(u,h+.43,z,.53,.06,.87,wood);
      box(u-faceBow*.23,h+.65,z,.062,.42,.87,edge);
      for(const du of [-.18,.18])for(const dz of [-.31,.31])
        girder([u+du,h,z+dz],[u+du,h+.42,z+dz],.036,.036,metal);
    }
    for(const u of [-28.3,-25.85,-23.4,21.35])for(const k of [-1,1])seat(u,7.39,k*2.27,u>0?1:-1);
    for(const u of [23.5,25.7,28.0])seat(u,4.94,0,1);
    for(const [u,z] of [[8.65,.77],[6.74,-.88],[-8.7,1.28],[-12.1,-.74]]){
      girder([u,9.77,z],[u,10.05,z],.22,.22,metal);
      box(u,10.1,z,.47,.11,.46,shade);
    }
    for(const z of [-.62,.62])girder([14.36,10.19,z],[15.32,10.27,z],.17,.16,navy);
    function lifeRing(u,y,v){
      const radius=.32;
      for(let i=0;i<16;i++){
        const a=i*Math.PI/8,b=(i+1)*Math.PI/8;
        girder([u+radius*Math.cos(a),y+radius*Math.sin(a),v],[u+radius*Math.cos(b),y+radius*Math.sin(b),v],
          .086,.093,i%4===0?edge:0xcc7245);
      }
    }
    for(const side of [-1,1])for(const u of [-23.8,16.1,22.8])
      lifeRing(u,u>20?5.62:8.05,side*width(u)*(u<0?.92:.94));
    function funnel(y0,y1,rx0,rz0,rx1,rz1,color){
      for(let i=0;i<20;i++){
        const a=i*Math.PI/10,b=(i+1)*Math.PI/10;
        face([[-4.1+rx0*Math.cos(a),y0,rz0*Math.sin(a)],[-4.1+rx0*Math.cos(b),y0,rz0*Math.sin(b)],
          [-4.1+rx1*Math.cos(b),y1,rz1*Math.sin(b)],[-4.1+rx1*Math.cos(a),y1,rz1*Math.sin(a)]],color);
      }
    }
    funnel(9.78,11.54,1.42,.98,1.37,.93,white);funnel(11.54,11.93,1.37,.93,1.43,.99,navy);
    const rim=[];for(let i=0;i<20;i++)rim.push([-4.1+1.43*Math.cos(i*Math.PI/10),11.93,.99*Math.sin(i*Math.PI/10)]);
    face(rim,0x374143);
    for(const k of [-1,1]){box(-4.1,10.74,k*.969,.44,.82,.065,red);box(-4.1,10.74,k*.970,1.18,.24,.071,red);}
    for(const [u,base,h] of [[15.1,9.79,16.55],[32.85,4.95,9.03],[-31.13,7.42,10.02]]){
      girder([u,base,0],[u-.19,h,0],.12,.12,metal);
    }
    girder([12.9,14.8,0],[17.1,14.8,0],.095,.095,metal);
    for(const side of [-1,1])girder([14.93,16.36,0],[19.4,7.51,side*3.88],.030,.030,navy);
    girder([14.93,16.53,0],[-4.1,11.92,0],.033,.033,navy);
    girder([14.93,16.53,0],[32.65,8.95,0],.033,.033,navy);
    // The mooring lines lead toward the Wharves, and there is no wake at rest.
    for(const [u,landU] of [[25,17],[-23,-16]]){
      const z=-width(u);girder([u,2.37,z],[landU,1.01,-7.1],.062,.062,wood);
    }
    for(const u of [-23,-8,7,20]){
      const z=-width(u);box(u,1.24,z-.06,.34,.8,.22,navy);
    }
    const bridgeA=[-1.6,2.31,-5.19];
    const gangway=(t,side,high)=>[bridgeA[0]+6*t+.27*side,bridgeA[1]-1.52*t+high,bridgeA[2]-3.04*t+.53*side];
    face([gangway(0,-1,0),gangway(1,-1,0),gangway(1,1,0),gangway(0,1,0)],wood);
    for(const side of [-1,1]){
      for(const h of [.48,.92])girder(gangway(0,side,h),gangway(1,side,h),.052,.052,edge);
      for(let j=0;j<=4;j++)girder(gangway(j/4,side,0),gangway(j/4,side,.93),.05,.05,metal);
    }
    const group=new T.Group();group.name='M/S Mount Washington at Weirs Wharf';group.position.set(cx,level,cz);group.rotation.y=heading;
    for(const [batch,sheen] of [[solids,false],[glass,true]]){
      const geo=new T.BufferGeometry();
      geo.setAttribute('position',new T.Float32BufferAttribute(batch.position,3));geo.setAttribute('color',new T.Float32BufferAttribute(batch.color,3));geo.computeVertexNormals();geo.computeBoundingSphere();
      const material=new T.MeshStandardMaterial({vertexColors:true,side:T.DoubleSide,roughness:sheen?.30:.73,metalness:sheen?.30:.10});
      const mesh=new T.Mesh(geo,material);mesh.name=sheen?'Mount Washington saloon glass':'Mount Washington hull and decks';group.add(mesh);
    }
    shape.dispose();parent.add(group);
    const paint=document.createElement('canvas');paint.width=768;paint.height=80;
    const ctx=paint.getContext('2d');ctx.font='bold 50px Georgia,serif';ctx.fillStyle='#874039';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('MOUNT WASHINGTON',384,42);
    const letters=new T.CanvasTexture(paint);letters.colorSpace=T.SRGBColorSpace;
    const ink=new T.MeshStandardMaterial({map:letters,alphaTest:.24,roughness:.78,polygonOffset:true,polygonOffsetFactor:-1});
    const panel=new T.PlaneGeometry(10.60,.88);
    for(const side of [-1,1]){
      const name=new T.Mesh(panel,ink);name.name='Mount Washington painted name';
      name.position.set(-4.4,1.99,5.345*side);name.rotation.y=side<0?Math.PI:0;group.add(name);
    }
    return (x,z)=>{
      const dx=x-cx,dz=z-cz;
      if(Math.abs(dx)>32||Math.abs(dz)>31)return -Infinity;
      const along=dx*hx+dz*hz,across=-dx*hz+dz*hx;
      if(Math.abs(along)>35.05||Math.abs(across)>width(along))return -Infinity;
      let high=4.96+sheer(along);
      if(along>-31.3&&along<24.1&&Math.abs(across)<width(along)*.95)high=7.41;
      if(along>-20&&along<18.55&&Math.abs(across)<width(along)*.86)high=9.80;
      if(((along+4.1)/1.43)**2+(across/.99)**2<1)high=11.94;
      if(Math.abs(along-15)<.17&&Math.abs(across)<.16)high=16.56;
      return level+high;
    };
  }

  // Cloth and lettering for the restored Alton Bay signal mast. The three
  // hoists share one draw; pinned edges also stay pinned in the water mirror.
  function addAltonRig(root,f,clock,deckY,mastU,mastV,mastHeight){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
    const g=canvas.getContext('2d');
    g.fillStyle='#e9e8df';g.fillRect(0,0,512,256);
    for(let i=0;i<13;i+=2){g.fillStyle='#9e3642';g.fillRect(0,i*128/13,254,128/13);}
    g.fillStyle='#334665';g.fillRect(0,0,102,7*128/13);
    g.fillStyle='#f8f6ed';
    for(let row=0;row<9;row++)for(let j=0;j<(row%2?5:6);j++){
      const x=8.5+17*j+(row%2)*8.5,y=4+row*7.55;g.beginPath();
      for(let k=0;k<10;k++){const a=-Math.PI*.5+k*Math.PI/5,r=k%2?1.15:2.9;
        const xx=x+Math.cos(a)*r,yy=y+Math.sin(a)*r;k?g.lineTo(xx,yy):g.moveTo(xx,yy);}
      g.closePath();g.fill();
    }
    g.fillStyle='#27385e';g.fillRect(256,0,256,128);
    // An impression of the wreath and ship on the hanging state flag.
    g.fillStyle='#b8a269';g.beginPath();g.ellipse(384,62,25,34,0,0,Math.PI*2);g.fill();
    g.fillStyle='#7a9ba5';g.beginPath();g.ellipse(384,62,19,27,0,0,Math.PI*2);g.fill();
    g.fillStyle='#c1a074';g.fillRect(373,69,24,3);g.fillRect(384,45,1.6,25);
    g.fillStyle='#d5cbb0';g.beginPath();g.moveTo(382,45);g.lineTo(372,65);g.lineTo(382,65);g.fill();
    g.fillStyle='#252626';g.fillRect(0,130,254,58);
    g.strokeStyle='#d4d4c9';g.lineWidth=1.3;g.beginPath();g.ellipse(125,160,17,13,0,0,Math.PI*2);g.stroke();
    g.fillStyle='#d3d2c4';g.beginPath();g.moveTo(124,151);g.bezierCurveTo(113,150,115,161,122,162);
    g.lineTo(122,166);g.lineTo(130,166);g.lineTo(128,160);g.lineTo(131,158);g.lineTo(127,155);g.fill();
    g.font='bold 8px sans-serif';g.textAlign='center';g.fillText('POW  MIA',125,146);
    g.font='bold 4px sans-serif';g.fillText('YOU ARE NOT FORGOTTEN',125,178);
    g.fillStyle='#25364a';g.fillRect(256,132,256,56);
    g.font='bold 37px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillStyle='#f1f0e9';g.fillText('ALTON BAY',384,161);
    const fabric=new T.CanvasTexture(canvas);fabric.colorSpace=T.SRGBColorSpace;fabric.anisotropy=4;
    const mat=new T.MeshStandardMaterial({map:fabric,side:T.DoubleSide,roughness:.92});
    mat.onBeforeCompile=shader=>{
      shader.uniforms.altonClock=clock;
      shader.vertexShader='uniform float altonClock;attribute vec3 clothMotion;\n'+shader.vertexShader.replace('#include <begin_vertex>',`
        #include <begin_vertex>
        float travel=clothMotion.x;
        float flutter=sin(altonClock*2.7-travel*8.+clothMotion.z)
          +.33*sin(altonClock*5.3-travel*15.+clothMotion.z*.8);
        transformed.x+=travel*travel*flutter*.21;
        transformed.y+=travel*travel*flutter*.074;
        transformed.z+=travel*.15*sin(altonClock*2.2-travel*9.+clothMotion.y*3.8+clothMotion.z);
      `);
      shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',`
        #include <normal_fragment_begin>
        vec3 rippleNormal=normalize(cross(dFdx(vViewPosition),dFdy(vViewPosition)));
        normal=faceforward(rippleNormal,-normal,rippleNormal);
      `);
    };
    mat.customProgramCacheKey=()=>'alton-cloth-1';
    const pos=[],uv=[],motion=[];
    function vertex(local,tex,flex){
      const p=f.at(...local);pos.push(p[0]-f.x,p[1]-deckY,p[2]-f.z);uv.push(tex[0]/512,1-tex[1]/256);motion.push(...flex);
    }
    function flag(u,v,y,w,h,rect,angle,phase){
      const at=(s,t)=>[u-w*s*.91*Math.cos(angle),y-h*t-.49*h*s*s+.091*Math.sin(s*7+phase)*s,
                       v+w*s*Math.sin(angle)+.21*s*Math.sin(s*9+phase)];
      const cols=8,rows=3;
      for(let i=0;i<cols;i++)for(let j=0;j<rows;j++)
        for(const [di,dj] of [[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]]){
          const a=(i+di)/cols,b=(j+dj)/rows;
          vertex(at(a,b),[rect[0]+a*(rect[2]-rect[0]),rect[1]+b*(rect[3]-rect[1])],[a,b,phase]);
        }
    }
    flag(mastU,mastV,mastHeight-.08,1.59,.84,[1,1,253,127],.23,.0);
    for(const [offset,rect,phase] of [[-.83,[1,132,253,187],1.4],[.83,[258,1,510,127],2.7]]){
      flag(mastU+offset,mastV,mastHeight-1.81,1.01,.6,rect,.26,phase);
    }
    // The lake-facing name board sits under the eaves.
    const b=f.width*.447,center=0;const sign=[[center-.64,deckY+2.32,b+.11],[center+.64,deckY+2.32,b+.11],
      [center+.64,deckY+2.04,b+.11],[center-.64,deckY+2.04,b+.11]];
    for(const i of [0,1,2,0,2,3]){
      vertex(sign[i],[[258,133],[510,133],[510,187],[258,187]][i],[0,0,0]);
    }
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));
    geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setAttribute('clothMotion',new T.Float32BufferAttribute(motion,3));geo.computeVertexNormals();
    const mesh=new T.Mesh(geo,mat);mesh.position.set(f.x,deckY,f.z);mesh.name='Alton Bay signal flags and name board';root.add(mesh);
  }

  function campDocks(parent,waterLevel,deck,elevation){
    // Landside and lakeside endpoints measured on the NH GRANIT 2021–22 ortho.
    // Several adjacent camps have separate fingers pointing in different directions.
    const lines=[
      [1265.3,1803.2,1263.1,1815.8,1.6],[1258.8,1803.7,1257.6,1812.1,0.8],[1242.6,1804.8,1242.9,1815.5,1.5],
      [1221.4,1812,1226.5,1821.1,1.5],[1135.5,1835.3,1140.5,1842.5,1.5],[1059.3,1911.6,1066.3,1918.6,1.8],
      [1000.8,1968.6,1006.9,1979.6,1.6],[982.7,1984.6,991.8,1993.1,1.6],[965.2,2006.8,974.3,2015.2,1.5],
      [948,2022.7,955.7,2030.1,1.3],[922.7,2048.2,929.4,2054.2,2.2],[879.6,2073.8,884,2080.2,1.6],
      [829.1,2127.8,829.7,2137,1],[1284.2,1803.1,1282.6,1813.6,1.15],[1138.7,1829.3,1142.9,1836.1,1.05],
      [1104.1,1849.2,1113.5,1858.6,1.65],[1086.7,1880.7,1099.4,1883.8,1.55],[1071.6,1899.3,1078,1908.4,1.15],
      [1054.5,1916.1,1060.7,1923,1.15],[1023.8,1946.7,1033.5,1954,1.3],[858.8,2087.7,864.4,2094.3,1.2],
      [834.9,2115,841.9,2116.9,1.3],[833.8,2117.8,841.9,2120,1.15]
    ];
    const boards=[],supports=[],tones=[],bounds=[];
    const transform=new T.Matrix4(),translation=new T.Vector3(),rotation=new T.Quaternion(),scale=new T.Vector3();
    const vertical=new T.Vector3(0,1,0);
    for(const [x,z,tipX,tipZ,width] of lines){
      const dx=tipX-x,dz=tipZ-z,length=Math.hypot(dx,dz),ux=dx/length,uz=dz/length;
      const direction=-Math.atan2(uz,ux),level=waterLevel+.59;
      const count=Math.ceil(length/.27),pitch=length/count;
      rotation.setFromAxisAngle(vertical,direction);
      function piece(collection,u,y,v,l,h,w){
        translation.set(x+ux*u-uz*v,y,z+uz*u+ux*v);scale.set(l,h,w);
        collection.push(transform.compose(translation,rotation,scale).clone());
      }
      for(let j=0;j<count;j++){
        piece(boards,pitch*(j+.5),level,0,pitch-.009,.074,width);
        const shade=.91+.11*(.5+.5*Math.sin(38.1*j+z));
        tones.push(new T.Color(shade,shade*.982,shade*.933));
      }
      // A short gangway meets the measured ground behind the deck. Its
      // shore end follows the grade where the main finger clears the water.
      let back=1.0;
      while(back<4.0&&elevation(x-ux*back,z-uz*back)<waterLevel+.44)back+=.5;
      const landing=Math.max(waterLevel+.37,elevation(x-ux*back,z-uz*back)+.055);
      const gangwayWidth=Math.min(width,.98),pieces=Math.ceil(back/.25);
      for(let j=0;j<pieces;j++){
        const t=(j+.5)/pieces;
        piece(boards,-t*back,level+(landing-level)*t,0,back/pieces-.01,.069,gangwayWidth);
        tones.push(new T.Color(.94,.925,.875));
      }
      for(const side of [-1,1]){
        piece(supports,length*.5,level-.15,width*.39*side,length,.23,.12);
        const spans=Math.ceil(length/3.2);
        for(let j=0;j<=spans;j++)
          piece(supports,.27+(length-.55)*j/spans,level-.79,width*.38*side,.13,1.60,.14);
      }
      bounds.push({x,z,ux,uz,length,half:width*.5,top:level+.037,back,landing,gangwayWidth});
    }
    const unit=new T.BoxGeometry(),timber=new T.MeshStandardMaterial({map:deck,color:0xf5f0e4,roughness:.95});
    const stringers=new T.MeshStandardMaterial({color:0x71695a,roughness:.97});
    for(const [name,poses,mat] of [['deck boards',boards,timber],['pilings and stringers',supports,stringers]]){
      const mesh=new T.InstancedMesh(unit,mat,poses.length);
      for(let i=0;i<poses.length;i++){mesh.setMatrixAt(i,poses[i]);if(mat===timber)mesh.setColorAt(i,tones[i]);}
      mesh.computeBoundingSphere();mesh.name='Rattlesnake Island camp '+name;parent.add(mesh);
    }
    return (x,z)=>{
      if(x<745||x>1340||z<1780||z>2150)return -Infinity;
      for(const b of bounds){
        const dx=x-b.x,dz=z-b.z,along=dx*b.ux+dz*b.uz;
        const across=Math.abs(dz*b.ux-dx*b.uz);
        if(along>=0&&along<=b.length&&across<=b.half)return b.top;
        if(along<0&&along>=-b.back&&across<=b.gangwayWidth*.5)
          return b.top-(b.landing+.0345-b.top)*along/b.back;
      }
      return -Infinity;
    };
  }

  function build(elevation,waterLevel,clock){
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
    materials.cream.map=texture('building-clapboard.webp',true);materials.cream.map.colorSpace=T.SRGBColorSpace;
    materials.cream.bumpMap=materials.cream.map;materials.cream.bumpScale=.035;
    const finish=scene.userData.buildingLight.finish;
    finish(materials.cream,'boards',2.27);
    // Granite rubble supports the boardwalk and dock house; bridges and the
    // cut-stone memorial use their separate concrete / dressed materials.
    materials.foundation=finish(new T.MeshStandardMaterial({color:0xddd7c8,roughness:.95}),'fieldstone',2.08);
    materials.roof.bumpMap=shingles;materials.roof.bumpScale=.043;
    scene.userData.buildingLight.glaze(materials.window,1);
    const ballastMap=texture('surry-riprap.webp',true);ballastMap.colorSpace=T.SRGBColorSpace;
    materials.ballast=new T.MeshStandardMaterial({map:ballastMap,color:0xa8a69d,roughness:.97,side:T.DoubleSide});
    const root=new T.Group();root.name='Weirs Beach and Alton Bay waterfronts';scene.add(root);
    const vesselHeight=buildMountWashington(root,waterLevel);
    const dockHeight=campDocks(root,waterLevel,deck,elevation);
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
      const f=footprint(alton.bandstand),platform=footprint(alton.bandstandPlatform||alton.bandstand);
      const y=waterLevel+.40,a=f.length*.451,b=f.width*.447,eaves=y+2.48,rise=1.36;
      // Low painted crib skirt under the broad white deck. The crib itself
      // stays below the lake surface in this summer scene.
      platform.box('rail',0,y-.21,0,platform.length-.24,.32,platform.width-.24);
      platform.box('trim',0,y-.025,0,platform.length,.13,platform.width);
      platform.box('navy',0,y-.40,0,platform.length-.33,.12,platform.width-.33);
      const trimWidth=.15,frameHeight=.64;
      // Hipped gray roof, including the visible courses on the restored cover.
      // Triangle rings have the same plane as each hip and stop at its mitres.
      const roofW=f.length+.32,roofD=f.width+.32;
      materials.bandCover=finish(new T.MeshStandardMaterial({color:0xd4d5d4,roughness:.88,side:T.DoubleSide}),'redslate',4.4);
      const deckMap=texture('alton-bandstand-deck.webp');deckMap.colorSpace=T.SRGBColorSpace;
      const paintedDeck=new T.MeshStandardMaterial({map:deckMap,roughness:.79});
      const floorGeo=new T.BufferGeometry(),floorPoints=[];
      for(const [u,v] of [[-.5,-.5],[-.5,.5],[.5,.5],[.5,-.5]])floorPoints.push(...platform.at(u*platform.length,y+.046,v*platform.width));
      floorGeo.setAttribute('position',new T.Float32BufferAttribute(floorPoints,3));floorGeo.setAttribute('uv',new T.Float32BufferAttribute([0,1,0,0,1,0,1,1],2));
      floorGeo.setIndex([0,1,2,0,2,3]);floorGeo.computeVertexNormals();
      const galleryDeck=new T.Mesh(floorGeo,paintedDeck);galleryDeck.name='Alton Bay painted landing';root.add(galleryDeck);
      materials.bandSeams=new T.MeshStandardMaterial({color:0x7b7e7b,roughness:.88});
      materials.sage=finish(new T.MeshStandardMaterial({color:0xd1d2b8,roughness:.85}),'boards',2.12);
      materials.sage.normalScale.multiplyScalar(.32);
      const sageMetric=materials.sage.onBeforeCompile;
      materials.sage.onBeforeCompile=function(shader,renderer){
        sageMetric.call(this,shader,renderer);
        shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',
          'diffuseColor.rgb *= mix(vec3(.975),texture2D(map,vMapUv).rgb,.30);');
      };
      materials.sage.customProgramCacheKey=()=>'alton-painted-clapboard-1';
      const rim=[[-roofW/2,-roofD/2],[roofW/2,-roofD/2],[roofW/2,roofD/2],[-roofW/2,roofD/2]];
      for(let i=0;i<4;i++){
        const l=rim[i],r=rim[(i+1)%4],at=(s,h)=>[(l[0]+(r[0]-l[0])*s)*(1-h),eaves+rise*h,(l[1]+(r[1]-l[1])*s)*(1-h)];
        section('bandCover',f.at,[[at(0,0),at(1,0),at(0,1)]]);
        beam('trim',f.at(...at(0,0)),f.at(...at(1,0)),.14);
        beam('bandSeams',f.at(...at(0,0)),f.at(...at(0,1)),.045);

      }
      function frameSide(along,side,open){
        const span=along?a:b,cross=along?b:a,place=(u,h)=>f.at(along?u:side*cross,h,along?side*cross:u);
        const member=(u1,h1,u2,h2,width,paint='trim')=>beam(paint,place(u1,h1),place(u2,h2),width);
        for(const [left,right] of open?[[-span,-.74],[.74,span]]:[[-span,span]]){
          const length=right-left,center=(right+left)*.5;
          for(let band=0;band<4;band++){
            const hh=y+.12+band*.129;
            f.box('sage',along?center:side*cross,hh,along?side*cross:center,along?length:.095,.123,along?.095:length);
          }
          member(left,y+frameHeight,right,y+frameHeight,.105);
          member(left,y+.045,right,y+.045,.12);
        }
        member(-span,eaves-.13,span,eaves-.13,.18);
        for(const foot of [-span,-span/3,span/3,span]){
          if(along||Math.abs(foot)<span)member(foot,y+.04,foot,eaves-.10,trimWidth);
          for(const sign of [-1,1])if(Math.abs(foot+sign*.4)<span){
            member(foot,eaves-.61,foot+sign*.40,eaves-.14,.105);
          }
        }
      }
      for(const side of [-1,1]){frameSide(true,side,side<0);frameSide(false,side,false);}
      for(const [u,v] of rim)beam('rail',f.at(u*.91,eaves-.15,v*.91),f.at(0,eaves+rise-.10,0),.086);
      const mastU=-.85,mastV=platform.width*.423,mastTop=y+6.98;
      beam('trim',f.at(mastU,y,mastV),f.at(mastU,mastTop,mastV),.067,true);
      beam('rail',f.at(mastU-.91,mastTop-1.73,mastV),f.at(mastU+.91,mastTop-1.73,mastV),.052,true);
      for(const side of [-1,1]){
        beam('rail',f.at(mastU+.84*side,mastTop-1.76,mastV),f.at(mastU+.40*side,y+.68,mastV),.012,true);
      }
      addAltonRig(root,f,clock,y,mastU,mastV,mastTop);
      const mast=f.at(mastU,y,mastV);addObstacle(mast[0],mast[2],.15,mastTop);
      addObstacle(f.x,f.z,Math.min(a,b),eaves+rise);

    }

    const weirs=features.weirs;
    if(weirs.station){
      const f=footprint(weirs.station),y=Math.max(...weirs.station.map(q=>elevation(...q)))+.45;
      // The rail bed sits on a cross slope above the bay. Extend the masonry
      // through the surveyed grade along both long sides and the gable ends.
      let footing=y-1.1;
      for(let i=0;i<=18;i++)for(const side of [-1,1]){
        const along=f.at(f.length*(i/18-.5),0,side*f.width/2);
        const end=f.at(side*f.length/2,0,f.width*(i/18-.5));
        footing=Math.min(footing,elevation(along[0],along[2])-.85,elevation(end[0],end[2])-.85);
      }
      f.box('foundation',0,(y+.1+footing)*.5,0,f.length,y+.1-footing,f.width);
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
      // Corner boards, bay sills and brackets break the long roof fascia.
      for(const k of [-1,1]){
        const edge=k*f.width*.5,sign=k;
        for(const end of [-1,1])f.box('trim',end*(f.length*.5-.06),y+1.62,edge,f.length*.007,3.19,.156);
        f.box('trim',0,y+.27,edge,f.length,.18,.18);
        for(let u=-f.length*.42;u<f.length*.46;u+=3.36){
          f.box('trim',u,y+1.04,edge+sign*.12,1.43,.10,.27);
          beam('trim',f.at(u+.65,y+2.71,edge+sign*.04),f.at(u+.65,y+3.20,edge+sign*.41),.093);
        }
      }
      const l=f.length/2+.5,w=f.width/2+.45,top=y+3.29,ridge=top+1.65;
      section('roof',f.at,[[[-l,top,-w],[l,top,-w],[l,ridge,0],[-l,ridge,0]],[[l,top,w],[-l,top,w],[-l,ridge,0],[l,ridge,0]]]);
      for(const k of [-1,1])section('roof',f.at,[[[k*l,top,-w],[k*l,top,w],[k*l,ridge,0]]]);
      for(const k of [-1,1]){
        beam('trim',f.at(-l,top-.09,k*w),f.at(l,top-.09,k*w),.19);
        beam('trim',f.at(k*l,top,-w),f.at(k*l,ridge,0),.16);
        beam('trim',f.at(k*l,top,w),f.at(k*l,ridge,0),.16);
      }
      beam('iron',f.at(-l,ridge+.03,0),f.at(l,ridge+.03,0),.105);
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
        f.box('trim',u,top-1.37,k*(f.width/2+.047),1.59,1.45,.18);
        f.box('window',u,top-1.37,k*(f.width/2+.139),1.35,1.22,.065);
        f.box('trim',u,top-1.38,k*(f.width/2+.190),.073,1.22,.055);
        f.box('trim',u,top-2.05,k*(f.width/2+.13),1.66,.11,.25);
      }
    }
    // White runabout alongside the rocky camp landing on the six-inch ortho.
    const islandBoat=[[1076.8,1906.25,5.2,2.02,2.284]];
    for(const set of [weirs.boats,alton.boats,islandBoat])for(const [x,z,l,w,angle] of set||[]){
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
      const xy=(u,v)=>[a[0]+dx*u-dz*v/d,a[1]+dz*u+dx*v/d];
      function cross(u){
        const l=xy(u,-.8),r=xy(u,.8),m=xy(u,0);
        const level=Math.max(waterLevel+.20,elevation(...m)+.20,(elevation(...l)+elevation(...r))*.5+.20);
        return v=>{const [x,z]=xy(u,v);return [x,level,z]};
      }
      const pieces=Math.ceil(d/2.8),identity=(x,y,z)=>[x,y,z];let prev=cross(0);
      for(let j=1;j<=pieces;j++){
        const next=cross(j/pieces);
        section('ballast',identity,[[prev(-1.38),next(-1.38),next(1.38),prev(1.38)]]);
        for(const sign of [-1,1]){
          const head=prev(sign*.72),end=next(sign*.72);head[1]+=.14;end[1]+=.14;beam('iron',head,end,.098);
          const lowA=prev(sign*2.05),lowB=next(sign*2.05);
          lowA[1]=Math.min(lowA[1]-.18,elevation(lowA[0],lowA[2]))-.15;
          lowB[1]=Math.min(lowB[1]-.18,elevation(lowB[0],lowB[2]))-.15;
          section('ballast',identity,[[prev(sign*1.38),next(sign*1.38),lowB,lowA]]);
        }
        prev=next;
      }
      for(let i=.43;i<d;i+=.78){
        const bed=cross(i/d),a=bed(-1.26),b=bed(1.26);a[1]+=.027;b[1]+=.027;
        beam('post',a,b,.19);
      }
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
      let y=Math.max(vesselHeight(x,z),dockHeight(x,z));
      for(const o of obstacles)if(Math.hypot(x-o.x,z-o.z)<o.r)y=Math.max(y,o.y);
      return y;
    };
  }
  return {rects,elevation,applyTerrain,applyWater,finishIslandTerrain,createTrees,build,settlement,launches,landmarks};
};

// The hydrographic polygon crossed several headlands with straight chords.
// The 2021–22 NH GRANIT six-inch ortho resolves the coves, stone frontage
// and water between the private docks on Rattlesnake's southeast side.
(()=>{
  const coast=[
    [1329,1796],[1324.2,1797.8],[1319.6,1800.9],[1314.9,1803.8],[1307.4,1805.2],
    [1302,1806.2],[1298.4,1806.2],[1294.5,1806.2],[1291.2,1805.6],[1287.9,1805.9],
    [1285.5,1806.5],[1283.4,1805.6],[1281.3,1805],[1279.2,1805],[1276.8,1804.7],
    [1273.5,1805.3],[1270.8,1804.7],[1267.8,1803.8],[1265.4,1804.1],[1263,1804.1],
    [1260.3,1804.4],[1256.8,1804.7],[1253.2,1804.7],[1250.2,1805],[1247.2,1806.8],
    [1244.5,1807.1],[1242.1,1805.6],[1240.6,1805],[1239.1,1805.6],[1231.5,1809.7],
    [1223.4,1812.2],[1214.8,1816],[1211.5,1819.2],[1205,1822],[1200.5,1826.4],
    [1194,1824.9],[1188.8,1823.8],[1183.6,1823.7],[1178.4,1823.7],[1172.2,1822.5],
    [1170.7,1823.7],[1164.3,1823.4],[1158.3,1822.9],[1153.7,1825.3],[1149.3,1827.7],
    [1144.5,1833.2],[1140.8,1835.1],[1138,1835.3],[1134.2,1836.8],[1124.5,1837.1],
    [1120,1839.2],[1115.5,1840.1],[1112.5,1841.6],[1110.7,1844.3],[1108.6,1846.7],
    [1105.9,1849.4],[1102.3,1851.8],[1099.3,1853.3],[1098.7,1855.1],[1096.9,1857.2],
    [1095.7,1861.4],[1094.8,1865.3],[1094.5,1867.1],[1092.7,1869.8],[1090.3,1871.6],
    [1088.2,1871.9],[1084.6,1870.7],[1082.8,1869.2],[1080.7,1869.2],[1080.7,1870.4],
    [1082.8,1872.5],[1085.2,1873.4],[1087.6,1874.3],[1088.5,1875.5],[1088.2,1877.6],
    [1087.6,1880.3],[1087.3,1882.4],[1087.3,1884.8],[1087.6,1887.5],[1086.7,1889.6],
    [1085.8,1892.3],[1084,1894.1],[1081.9,1895.9],[1079.2,1897.1],[1077.1,1897.7],
    [1074.7,1898.3],[1072.9,1899.5],[1071.1,1900.7],[1068.4,1901.9],[1066.3,1903.7],
    [1064.8,1905.8],[1063.9,1907.6],[1061.5,1909.7],[1060,1912.4],[1058.5,1913.3],
    [1057.3,1912.4],[1055.8,1913.6],[1055.2,1916.9],[1054,1918.4],[1051.6,1919.3],
    [1050.1,1919.9],[1048,1921.4],[1046.5,1924.1],[1043.5,1925.3],[1042,1928],
    [1039.3,1930.5],[1038.1,1934.4],[1036,1936.5],[1034.8,1939.5],[1032.7,1941.9],
    [1030.3,1943.4],[1027.6,1946.1],[1024.9,1947],[1022.5,1949.4],[1019.8,1951.5],
    [1017.4,1954.5],[1015.9,1956.6],[1012.9,1958.4],[1009.3,1959.9],[1006.6,1959.6],
    [1004.8,1957.8],[1002.4,1956.9],[999.4,1958.4],[997.9,1960.5],[997.3,1962.9],
    [998.5,1964.1],[1002.1,1964.4],[1004.2,1967.1],[1002.1,1969.2],[999.4,1970.1],
    [997,1970.1],[995.5,1971.9],[993.4,1972.8],[991.3,1972.5],[989.8,1974.6],
    [990.4,1976.4],[988.3,1978.2],[987.4,1981.5],[984.7,1983.6],[982.6,1986],
    [980.8,1986.6],[979,1988.7],[976.9,1989],[976,1987.5],[974.5,1986.3],
    [971.8,1985.7],[969.4,1986.6],[968.5,1988.7],[968.5,1992],[970.3,1994.1],
    [970.9,1997.1],[970,1999.5],[968.5,2001.3],[967.6,2004.3],[967.3,2006.4],
    [965.8,2007.6],[964,2009.7],[961.6,2011.2],[958.3,2011.8],[956.5,2013.3],
    [953.2,2015.7],[951.4,2018.7],[949.9,2020.8],[948.4,2023.8],[946,2025.9],
    [943.6,2027.7],[939.9,2033.1],[937.3,2036.9],[929.6,2042.2],[925.9,2047.4],
    [920.1,2051],[913.8,2050.6],[911.3,2051.5],[907.8,2053.8],[903.4,2058],
    [900.2,2064.1],[896.6,2066.3],[893.8,2066.6],[889.9,2068.4],[884.2,2072.1],
    [878.4,2075.9],[873.8,2080.9],[869.2,2085.2],[863.8,2086.9],[859.4,2088.3],
    [855.5,2091.7],[852.5,2098.5],[848.4,2106.4],[845.7,2108.5],[844.5,2110.3],
    [842.4,2112.1],[839.7,2113.6],[836.7,2114.5],[834.9,2116.3],[834.6,2118.7],
    [834.9,2119.6],[833.7,2121.7],[831.9,2124.1],[830.7,2127.1],[829.2,2129.2],
    [827.4,2131],[825.3,2131.3],[822.2,2134],[815.4,2136.6],[809.5,2136.1],
    [804.4,2135.5],[797.7,2133.8],[792,2131.5],[787.3,2127.6],[784.9,2126.4],
    [779.8,2125.7],[775.5,2126.2],[769.7,2124.8],[764.8,2122.2],[759.4,2117.4],
    [756,2116]
  ];
  // A metre-scale shore surface replaces the old hydroflat/deep-bottom
  // transition only along this surveyed arc. Keep height queries local.
  const bins=new Map(),near=23,cell=32,key=(x,z)=>x+z*128;
  for(let i=1;i<coast.length;i++){
    const a=coast[i-1],b=coast[i],dx=b[0]-a[0],dz=b[1]-a[1];
    const edge=[a[0],a[1],dx,dz,1/(dx*dx+dz*dz)];
    for(let x=Math.floor((Math.min(a[0],b[0])-near)/cell);x<=Math.floor((Math.max(a[0],b[0])+near)/cell);x++)
      for(let z=Math.floor((Math.min(a[1],b[1])-near)/cell);z<=Math.floor((Math.max(a[1],b[1])+near)/cell);z++){
        const id=key(x,z);
        if(!bins.has(id))bins.set(id,[]);
        bins.get(id).push(edge);
      }
  }
  window.makeWinnipesaukeeWaterfront.islandBed=(x,z)=>{
    if(x<725||x>1355||z<1770||z>2165)return false;
    for(const [a,b,dx,dz,inv] of bins.get(key(Math.floor(x/cell),Math.floor(z/cell)))||[]){
      const u=Math.max(0,Math.min(1,((x-a)*dx+(z-b)*dz)*inv));
      const h=x-a-u*dx,v=z-b-u*dz;
      if(h*h+v*v<near*near)return true;
    }
    return false;
  };
  // Light open ground extends from this camp to its stone landing in the
  // six-inch ortho. Regional 10 m land cover classifies it as woodland.
  const landing=[[1059.8,1892.6], [1064.4,1892.2], [1069.0,1889.9], [1072.8,1887.9], [1076.0,1886.2], [1079.6,1883.8], [1082.6,1883.0], [1085.1,1885.1], [1082.9,1888.8], [1081.5,1893.6], [1077.9,1897.2], [1073.6,1898.5], [1070.4,1901.0], [1066.9,1904.3], [1063.0,1904.6], [1060.0,1901.5], [1060.3,1898.9], [1059.0,1895.8]];
  window.makeWinnipesaukeeWaterfront.openCampLanding=(x,z)=>{
    if(x<1057||x>1086||z<1880||z>1907)return false;
    let inside=false;
    for(let i=0,j=landing.length-1;i<landing.length;j=i++){
      const a=landing[i],b=landing[j];
      if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    }
    return inside;
  };
  // Leave a narrow underwater overlap behind the registered wet edge. The
  // measured bank, including its stones, now meets a continuous water plane.
  // Wildlife and shallow-water optics continue to use the actual shore ring.
  window.makeWinnipesaukeeWaterfront.wetMargin=function(ring){
    const start=ring.findIndex(p=>p[0]===coast[0][0]&&p[1]===coast[0][1]);
    if(start<0||ring.length<coast.length)return ring;
    const result=ring.slice();
    for(let j=1;j<coast.length-1;j++){
      const a=coast[j-1],p=coast[j],b=coast[j+1],dx=b[0]-a[0],dz=b[1]-a[1],m=Math.hypot(dx,dz);
      if(m<.01)continue;
      const inset=Math.min(2.6,j*.65,(coast.length-1-j)*.65);
      result[start+j]=[p[0]-dz*inset/m,p[1]+dx*inset/m];
    }
    return result;
  };
  window.makeWinnipesaukeeWaterfront.refineShoreline=function(holes){
  const same=(p,q)=>Math.abs(p[0]-q[0])<.25&&Math.abs(p[1]-q[1])<.25;
  for(const ring of holes||[]){
    const start=ring.findIndex(p=>same(p,coast[0]));
    if(start<0)continue;
    const finish=ring.findIndex((p,i)=>i>start&&same(p,coast[coast.length-1]));
    if(finish<0||same(ring[start+1],coast[1]))continue;
    ring.splice(start+1,finish-start-1,...coast.slice(1,-1));
    return;
  }
  };
})();

// Actual low surface peaks from classified FEMA/USGS ground returns. The
// adjoining ortho distinguishes the mineral bank from docks and vegetation.
window.makeWinnipesaukeeWaterfront.shoreStones=function(T,world,sheet,entries){
  const ledges=[
    [1254,1800,155.42,1.25,1.54,0.23],[1256,1800.5,155.14,1.25,1.46,0.17],[1275,1800.5,154.84,1.35,1.35,0.1],[1248,1801,154.82,1.39,1.39,0.12],
    [1277,1801,154.77,1.39,1.39,0.12],[1281,1801.5,154.65,1,1.37,0.11],[1262.5,1802,154.52,1.37,1.37,0.12],[1236,1803,154.21,1.52,1.52,0.22],
    [1291.5,1803,154.61,1.37,1.37,0.11],[1254,1803.5,154.31,1.25,1.65,0.3],[1250,1803.5,154.17,1.47,1.47,0.18],[1257,1803.5,154.26,1,1.45,0.17],
    [1295.5,1804,154.29,0.75,1.71,0.34],[1244.5,1804,154.18,1.56,1.56,0.24],[1273,1804,154.38,1.5,1.55,0.23],[1247.5,1804,154.22,1.51,1.51,0.21],
    [1275,1804.5,154.01,1.45,1.45,0.17],[1262.5,1804.5,154.07,0.75,1.36,0.11],[1289,1805,154.36,1.51,1.51,0.21],[1269.5,1805,154.07,1.32,1.32,0.08],
    [1230,1806,153.65,1.33,1.33,0.09],[1226,1806.5,153.82,1.43,1.43,0.15],[1222.5,1808,153.91,1.5,1.5,0.2],[1234,1808,153.55,1.25,1,0.09],
    [1217.5,1810,154.32,1.65,1.5,0.3],[1211,1814,154.04,1.42,1.42,0.15],[1156,1819.5,154,1.51,1,0.21],[1131.5,1833.5,154.04,1.46,1.46,0.17],
    [1129.5,1836,154.05,1.45,1.45,0.17],[1112,1836.5,154.2,1.41,1.25,0.14],[1126.5,1837,154.01,1,1.59,0.26],[1122,1837.5,154.16,1.64,1.5,0.3],
    [1114.5,1841.5,154.08,1.25,1.38,0.12],[1111.5,1845.5,153.89,1.37,1.25,0.12],[1110,1846.5,153.88,0.75,1.39,0.13],[1101,1852,153.82,1.33,1.33,0.08],
    [1097.5,1853,153.85,1.32,1.32,0.08],[1093,1855.5,154.08,1.48,1.25,0.19],[1098,1858,154.03,1.41,1.41,0.14],[1093,1858,154.03,1.36,1.36,0.1],
    [1095.5,1861,154.14,1.48,1.48,0.19],[1092,1864,154.5,1.58,1.25,0.25],[1090,1865.5,154.53,1.54,1.5,0.23],[1083.5,1867,154.01,1.46,1.46,0.17],
    [1085,1868.5,153.81,1.37,1.37,0.11],[1081,1869.5,154.06,1.66,1.25,0.3],[1088.5,1870,153.86,1.25,1.48,0.18],[1088.5,1871.5,153.73,1.25,1.44,0.16],
    [1091.5,1872,153.6,1.34,1,0.09],[1081.5,1872.5,154.11,1.47,1.47,0.18],[1085.5,1874,153.93,1.57,1.57,0.25],[1083,1875,154.44,1.54,1.54,0.23],
    [1080.5,1875.5,154.62,1.39,1.25,0.12],[1088,1876.5,153.85,1.43,1.43,0.15],[1088,1878.5,154.08,1.4,1.4,0.13],[1084,1883.5,154.48,1.4,1,0.13],
    [1087.5,1883.5,154.08,1.38,1.38,0.12],[1087,1886.5,154.24,1.51,1.51,0.2],[1083,1888,154.56,1.36,1.25,0.11],[1087.5,1890,154.36,1.43,1.43,0.15],
    [1082,1891,154.85,1.46,1.25,0.17],[1079.5,1893,154.71,1.39,1.39,0.12],[1086.5,1893.5,154.48,1.57,1.57,0.25],[1081,1893.5,154.58,1.37,1.37,0.11],
    [1075.5,1893.5,154.75,1.35,1.35,0.1],[1072.5,1895,154.65,1.41,1.41,0.14],[1083.5,1895.5,154.31,1,1.46,0.17],[1069.5,1897,154.75,1.49,1.49,0.2],
    [1069,1902.5,154.16,1.49,1.49,0.19],[1065,1906,154.14,1.48,1.48,0.18],[1059.5,1906,155.08,1.41,1.41,0.14],[1063,1908.5,154.25,1.45,1.45,0.17],
    [1050.5,1916,154.36,1.48,1.25,0.19],[1049,1918.5,153.97,1,1.42,0.15],[1044,1922.5,154.5,1.25,1.5,0.26],[1041.5,1924.5,154.09,1.47,1.47,0.18],
    [1037.5,1926.5,153.95,1.43,1.43,0.15],[1037,1928,153.92,1.42,1.42,0.14],[1035,1931,154.32,1.42,1.42,0.15],[1033.5,1933.5,154.63,1.55,1.25,0.23],
    [1036,1933.5,154.28,1.48,1,0.19],[1026.5,1941.5,154.25,1.5,1.5,0.25],[1021.5,1947.5,154.29,1.48,1.48,0.19],[1019,1949.5,154.27,1.54,1.54,0.23],
    [1017,1952.5,154.22,1.5,1.54,0.22],[1007.5,1954,153.96,1.4,1,0.13],[1015.5,1955,154.15,1.46,1.46,0.18],[1011.5,1957,154.18,1.38,1.38,0.12],
    [1008,1959,153.96,1.44,1.44,0.16],[999.5,1965,154.09,1.25,1.56,0.24],[993.5,1967,154.04,1.25,1.25,0.14],[996.5,1969,154.19,1.46,1,0.17],
    [993.5,1970,154.34,1.53,1.5,0.22],[993.5,1972,154.29,1.49,1.49,0.19],[992,1974,154.34,1.5,1.6,0.27],[989,1978,154.28,1.25,1.68,0.32],
    [984,1981.5,153.87,1.34,1.34,0.09],[985,1983.5,153.97,1.45,1.45,0.17],[968,1984.5,154.13,1.32,1.32,0.08],[981.5,1988,154.09,1.5,1.5,0.2],
    [966,1991.5,154.24,1.33,1.33,0.09],[971.5,1994.5,154.07,1,1.34,0.09],[968.5,1996,154.61,1.5,1.5,0.2],[971,1996,154.37,1.42,1.42,0.15],
    [968.5,1998,154.63,1.32,1.32,0.08],[969,2004,155,1.75,1.78,0.39],[964,2004,155.41,1.5,1.25,0.21],[963.5,2008.5,155.01,1.39,1.39,0.13],
    [962,2009,155.15,1.4,1.4,0.13],[952.5,2013.5,155.74,1.47,1.47,0.18],[956,2015,155.12,1.38,1.38,0.12],[949,2019,155.79,1.75,1.75,0.58],
    [879.5,2070,154.16,1.45,1.45,0.17],[861.5,2083,154.3,1.25,1.52,0.21],[855,2086.5,154.36,1.49,1.49,0.19],[852,2089.5,154.36,1.52,1.52,0.21],
    [851.5,2091.5,154.26,1.4,1.4,0.14],[836.5,2110,154.25,1.42,1,0.15],[835,2111.5,154.36,1.47,1.47,0.18],[773.5,2121.5,154.1,1.37,1.37,0.11],
    [764,2122.5,154.32,1.25,1.5,0.25]
  ];
  const up=new T.Vector3(0,1,0),pose=new T.Quaternion();
  for(const [x,z,top,rx,rz,relief] of ledges){
    const stamp=Math.imul(Math.round(x*2),73856093)^Math.imul(Math.round(z*2),19349663),cell=(stamp>>>0)%16;
    const specimen=sheet.specimens[cell],yaw=((stamp>>>4)%1021)*Math.PI*2/1021;
    const length=Math.min(2*rx,.38+3.8*relief),depth=Math.min(2*rz,.43+3.4*relief);
    const height=Math.max(.22,Math.min(.87,.12+1.42*relief));
    // The middle-detail mesh keeps one continuous silhouette from open lake
    // to the bank. Its base is embedded below the registered dry surface.
    const y=Math.max(world.elevation(x,z)-height*.55,top-height*.74);
    const [sx,sy,sz]=specimen.extent;
    const matrix=new T.Matrix4().compose(new T.Vector3(x,y,z),pose.setFromAxisAngle(up,yaw),
      new T.Vector3(length/sx,height/sy,depth/sz));
    entries.push({sheet:sheet.id,cell,x,y,z,width:length,height,depth,yaw,matrix,length:Math.max(length,depth),
      wetStage:world.waterLevel+.16,anchor:'Rattlesnake Island surveyed shore',fixedShore:true});
  }
};
