// Oeschinensee's western hotels. Centimetre Swiss roof and wall triangles,
// surveyed terrace furniture, and the documented movable low-stage rowing shore.
window.makeOeschinenLanding=function makeOeschinenLanding(T,scene,texture,elevation,lake,clock){
  const data=window.oeschinenLandingSurvey;
  const root=new T.Group();root.name='Oeschinensee · Berghotel, Chalet Arva and rowing shore';scene.add(root);
  const surfaceMap=texture('oeschinen-landing-surfaces.webp'),roofsMap=texture('oeschinen-landing-roofs.webp');
  surfaceMap.colorSpace=roofsMap.colorSpace=T.SRGBColorSpace;
  const detail=new T.MeshLambertMaterial({map:surfaceMap,vertexColors:true,side:T.DoubleSide});
  detail.onBeforeCompile=shader=>{
    shader.vertexShader='attribute float hotelCell;varying float innCell;\n'+shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\n innCell=hotelCell;');
    shader.fragmentShader='varying float innCell;\n'+shader.fragmentShader.replace('#include <map_fragment>',`
      float c=floor(innCell+.05);
      vec2 q=vec2(mod(c,4.),3.-floor(c*.25));
      vec2 uv=(q+.009+.982*fract(vMapUv))*.25;
      vec4 fieldSurface=texture2D(map,uv);
      if(c==2.){
        float grain=dot(fieldSurface.rgb,vec3(.25,.60,.15));
        fieldSurface.rgb=mix(vec3(.099,.063,.040),vec3(.257,.166,.100),smoothstep(.007,.48,grain));
      }
      if(c==11.)fieldSurface.rgb=clamp(vec3(.49)+fieldSurface.rgb*1.18,vec3(.49),vec3(.96));
      diffuseColor*=fieldSurface;
    `);
  };
  const roof=new T.MeshLambertMaterial({map:roofsMap,color:0xe7e4d6,side:T.DoubleSide});
  const paint=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});
  const buffers=()=>new Map(),building=buffers(),moving=buffers(),white=0xffffff,iron=0x4e5958;
  let motion=null;
  const rectangle=[[0,0],[1,0],[1,1],[0,1]],col=new T.Color();
  function face(buf,mat,pts,tint=white,tile=0,uv=rectangle){
    let b=buf.get(mat);if(!b){b={p:[],c:[],tile:[],uv:[],moor:[]};buf.set(mat,b);}col.setHex(tint);
    for(const j of (pts.length===3?[0,1,2]:[0,1,2,0,2,3])){
      if(buf===moving)b.moor.push(...motion);
      b.p.push(...pts[j]);b.c.push(col.r,col.g,col.b);b.tile.push(tile);b.uv.push(...uv[j]);}
  }
  function pipe(buf,A,B,r,color,sides=6){
    const a=new T.Vector3(...A),b=new T.Vector3(...B),dir=b.clone().sub(a).normalize();
    const right=dir.clone().cross(Math.abs(dir.y)>.9?new T.Vector3(1,0,0):new T.Vector3(0,1,0)).normalize(),up=dir.clone().cross(right);
    const offsets=Array.from({length:sides},(_,i)=>right.clone().multiplyScalar(r*Math.cos(2*Math.PI*i/sides)).addScaledVector(up,r*Math.sin(2*Math.PI*i/sides)));
    for(let i=0;i<sides;i++){const j=(i+1)%sides;
      face(buf,paint,[a.clone().add(offsets[i]).toArray(),a.clone().add(offsets[j]).toArray(),b.clone().add(offsets[j]).toArray(),b.clone().add(offsets[i]).toArray()],color);}
  }
  function box(buf,origin,width,depth,low,high,tint,tile,angle=0){
    const cs=Math.cos(angle),sn=Math.sin(angle);
    function at(i,h){const [x,z]=[[-1,-1],[1,-1],[1,1],[-1,1]][i];return [origin[0]+cs*x*width/2+sn*z*depth/2,h,origin[1]-sn*x*width/2+cs*z*depth/2];}
    const colour=tile===undefined?paint:detail;
    for(let i=0;i<4;i++){const j=(i+1)%4;face(buf,colour,[at(i,low),at(j,low),at(j,high),at(i,high)],tint,tile||0);}
    face(buf,colour,[at(0,high),at(3,high),at(2,high),at(1,high)],tint,tile||0);
  }
  function mesh(buf,parent,name){
    for(const [material,b]of buf){
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(b.p,3));
      g.setAttribute('color',new T.Float32BufferAttribute(b.c,3));g.setAttribute('uv',new T.Float32BufferAttribute(b.uv,2));
      if(material===detail)g.setAttribute('hotelCell',new T.Float32BufferAttribute(b.tile,1));
      let finish=material;
      if(buf===moving){
        finish=new T.MeshPhongMaterial({color:0xffffff,map:material.map,vertexColors:true,side:T.DoubleSide,
          specular:material===detail?0x466473:0x243838,shininess:material===detail?41:23});
        const prepare=material.onBeforeCompile.bind(material);
        finish.onBeforeCompile=(s,renderer)=>{prepare(s,renderer);s.uniforms.hotelClock=clock;
          s.vertexShader='attribute vec3 hotelMoor;uniform float hotelClock;\n'+s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
            vec2 local=transformed.xz-hotelMoor.xy;float t=hotelClock,phase=hotelMoor.z;
            float yaw=.017*sin(.47*t+phase),roll=.012*cos(t*.92+phase*.83);
            transformed.y+=.030*sin(t*.89+phase)+.012*cos(t*1.35+phase*.52)+local.x*roll+local.y*.006*sin(t+phase);
            transformed.xz+=vec2(local.y,-local.x)*yaw;
          `);};
        finish.customProgramCacheKey=()=>material===detail?'swiss-rowing-skiff-surface':'swiss-rowing-skiff-paint';
        g.setAttribute('hotelMoor',new T.Float32BufferAttribute(b.moor,3));
      }
      g.computeVertexNormals();g.computeBoundingSphere();const o=new T.Mesh(g,finish);o.name=name;
      o.userData.prepareFlightMaterial=true;parent.add(o);
    }
  }
  const roofTriangles=[],blocks=[];
  function inside(x,z,loop){
    let v=false;for(let i=0,j=loop.length-1;i<loop.length;j=i++){
      const a=loop[i],b=loop[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])v=!v;
    }return v;
  }
  for(const b of data.buildings){
    const v=b.vertices.map(p=>p.map(q=>q*.01));blocks.push(...b.plan);
    const roofEdges=new Map();
    for(const ix of b.roof){
      const tri=ix.map(i=>v[i]);roofTriangles.push(tri);
      for(let i=0;i<3;i++){
        const a=ix[i],b=ix[(i+1)%3],edge=Math.min(a,b)*v.length+Math.max(a,b);
        if(roofEdges.has(edge))roofEdges.delete(edge);else roofEdges.set(edge,[v[a],v[b]]);
      }
      face(building,roof,tri,white,0,tri.map(([x,,z])=>[(x+915)/135,1-(z-329)/79]));
    }
    // The CityGML wall planes end at the eave line. Add the photographed
    // projecting roof edge on true outside boundaries, leaving interior ridges alone.
    for(const [a,c]of roofEdges.values()){
      const dx=c[0]-a[0],dz=c[2]-a[2],len=Math.hypot(dx,dz);if(len<.22)continue;
      let nx=-dz/len,nz=dx/len;const mx=(a[0]+c[0])/2,mz=(a[2]+c[2])/2;
      const left=b.plan.some(loop=>inside(mx+.4*nx,mz+.4*nz,loop));
      const right=b.plan.some(loop=>inside(mx-.4*nx,mz-.4*nz,loop));if(left===right)continue;
      if(left){nx=-nx;nz=-nz;}
      const eave=b.name==='hotel'?.47:.35,A=[a[0]+eave*nx,a[1]-.075,a[2]+eave*nz],B=[c[0]+eave*nx,c[1]-.075,c[2]+eave*nz];
      face(building,paint,[a,c,B,A],0x847766);
      face(building,paint,[A,B,[B[0],B[1]-.13,B[2]],[A[0],A[1]-.13,A[2]]],0x705540);
    }
    for(const ix of b.walls){
      const tri=ix.map(i=>v[i]),a=new T.Vector3(...tri[0]),b1=new T.Vector3(...tri[1]).sub(a),c=new T.Vector3(...tri[2]).sub(a),n=b1.cross(c).normalize();
      const tile=b.name==='westShed'||b.name==='arvaShed'?12:2;
      const tint=b.name==='arva'?0xcfba99:b.name==='orangeAnnex'?0xcb9e77:0xd9c9b0;
      face(building,detail,tri,tint,tile,tri.map(([x,y,z])=>[(x*n.z-z*n.x)*.51,y*1.31]));
    }
  }
  // Plane of a surveyed facade; sill, shutter and box stand out from it in metres.
  const facade=(a,b)=>{const leng=Math.hypot(b[0]-a[0],b[1]-a[1]),ux=(b[0]-a[0])/leng,uz=(b[1]-a[1])/leng;
    return {len:leng,p:(u,y,d)=>[a[0]+ux*u-uz*d,y,a[1]+uz*u+ux*d]};};
  function panel(f,u,y,w,h,tile,tint=white,out=.065){
    face(building,detail,[f.p(u-w/2,y,out),f.p(u+w/2,y,out),f.p(u+w/2,y+h,out),f.p(u-w/2,y+h,out)],
      tint,tile,[[.006,.006],[.994,.006],[.994,.994],[.006,.994]]);
  }
  function windowBay(f,u,y,w=1.34,h=1.28,chalet=false){
    panel(f,u,y-.065,w+.16,h+.15,12,0xb99164);
    panel(f,u,y,w,h,0,chalet?0xbfc8c0:white,.11);
    panel(f,u-w*.77,y-.015,w*.43,h+.042,chalet?4:1,white,.126);
    panel(f,u+w*.77,y-.015,w*.43,h+.042,chalet?4:1,white,.126);
    panel(f,u,y-.17,w+.26,.19,9,0xf5e7cc,.19);
  }
  const hotelEast=facade([-857.23,402.11],[-855.71,391.33]);
  // The photographed original gable has honey shutters, mullioned windows,
  // flower troughs and an awning over the plastered terrace floor.
  for(const u of [1.40,4.28,7.10,9.62])windowBay(hotelEast,u,22.25,1.28,1.45);
  for(const u of [3.72,6.87])windowBay(hotelEast,u,24.48,1.02,1.00);
  panel(hotelEast,5.15,19.01,10.78,3.06,7,0xe4dec5,.075);
  for(const u of [1.17,3.39,5.64,7.91,9.88])panel(hotelEast,u,19.0,1.39,2.29,8,0xe0d7bc,.115);
  const northWing=facade([-857.67,388.37],[-856.14,377.54]);
  for(const u of [1.55,4.18,6.80,9.40]){
    panel(northWing,u,21.62,1.05,1.22,0,0xd7ccba,.10);
    panel(northWing,u,18.85,1.16,1.55,8,0xe1d7cb,.10);
  }
  const hotelSouth=facade([-889.76,397.22],[-857.23,402.11]);
  for(const u of [2.05,5.39,8.61,11.91,15.22,18.48,21.83,25.04,28.29,31.03])windowBay(hotelSouth,u,22.13,1.25,1.28);
  const sunPorch=facade([-872.51,402.38],[-857.57,404.49]);
  panel(sunPorch,7.50,18.74,15.,2.67,7,0xddd8c1,.045);
  for(const u of [1.07,3.35,5.70,8.05,10.40,12.75,14.28])panel(sunPorch,u,18.86,1.38,2.17,8,white,.09);
  const arvaEast=facade([-809.78,368.26],[-803.65,355.79]);
  for(const u of [1.70,4.23,7.12,10.12,12.5]){windowBay(arvaEast,u,15.85,1.02,1.32,true);}
  panel(arvaEast,6.79,17.53,12.66,.42,5,0xd5bb95,.14);
  const arvaSouth=facade([-823.47,356.67],[-809.78,368.26]);
  for(const u of [1.49,4.62,7.83,10.97,14.19])windowBay(arvaSouth,u,15.73,.97,1.28,true);
  const gable=facade([-792.34,358.35],[-787.05,354.18]);
  for(const u of [1.34,4.71])windowBay(gable,u,15.72,1.04,1.18,true);
  windowBay(gable,3.13,17.65,.92,.98,true);
  function awning(f,u,w,y,reach,color,photo=false){
    const skinPts=[f.p(u-w/2,y,.1),f.p(u+w/2,y,.1),f.p(u+w/2,y-.54,reach),f.p(u-w/2,y-.54,reach)];
    face(building,photo?detail:paint,skinPts,color,3);
    for(const side of [-1,1]){
      pipe(building,f.p(u+side*(w/2-.1),y-.12,.12),f.p(u+side*(w/2-.1),y-.55,reach),.052,iron);
      pipe(building,f.p(u+side*(w/2-.1),y-.95,.12),f.p(u+side*(w/2-.1),y-.56,reach),.035,iron);
    }
  }
  awning(hotelEast,5.36,10.66,21.98,2.60,0xf1d882,true);awning(sunPorch,7.4,14.7,21.30,1.67,0xf1e8cf,true);
  awning(arvaEast,6.80,13.4,17.09,2.15,0xe1d1b2);
  for(const [x,z,r,kind] of data.umbrellas){
    const y=elevation(x,z),tone=kind==='yellow'?0xe1be4f:kind==='red'?0xbd5753:0x526c98;
    const angle=x*.351+z*.851;
    pipe(building,[x,y+.01,z],[x,y+2.60,z],.034,iron,6);
    const cv=(a,rr,h)=>[x+rr*Math.cos(a),y+h,z+rr*Math.sin(a)];
    for(let k=0;k<8;k++){
      const a=angle+k*Math.PI/4,b=a+Math.PI/4,m=(a+b)/2,bright=k%2?tone:new T.Color(tone).multiplyScalar(.90).getHex();
      const top=[x,y+2.64,z],A=cv(a,r,2.13),B=cv(b,r,2.13),mid=cv(m,.61*r,2.44);
      face(building,paint,[top,A,mid],bright);face(building,paint,[top,mid,B],tone);face(building,paint,[A,B,mid],tone);
      pipe(building,top,A,.016,0x9a8b65,4);
    }
    box(building,[x,z],1.04,.86,y+.72,y+.80,kind==='red'?0x855e42:0xa0947a,undefined,angle);
    for(const s of [-1,1]){
      const rightX=Math.cos(angle)*s*.76,rightZ=-Math.sin(angle)*s*.76;
      box(building,[x+rightX,z+rightZ],.47,.49,y+.42,y+.48,kind==='red'?0xa8483e:0x637a91,undefined,angle);
      for(const o of [-.17,.17])pipe(building,[x+rightX+o,y,z+rightZ],[x+rightX+o,y+.44,z+rightZ],.027,iron,5);
    }
  }
  // The July field photograph shows angular blue hulls, painted thwarts,
  // light gunwales and loose wooden oars lying at independent angles.
  const hulls=[];
  for(const [k,boat]of data.boats.entries()){
    const [cx,cz,yaw]=boat,cs=Math.cos(yaw),sn=Math.sin(yaw),phase=k*1.709;
    motion=[cx,cz,phase];
    const point=(x,h,z)=>[cx+x*cs+z*sn,.18+h,cz-x*sn+z*cs];
    const hull=[[ -2.04,.54,-.03,.54],[-1.62,.67,-.16,.55],[-.74,.76,-.24,.53],
      [.34,.75,-.24,.52],[1.08,.60,-.17,.54],[1.61,.37,-.08,.61],[2.02,.034,.05,.69]];
    const tint=new T.Color().setHSL(.555+.011*Math.sin(k),.25+.07*Math.cos(k*1.12),.32+.04*Math.sin(k*.86)).getHex();
    for(let i=0;i<hull.length-1;i++){
      const [z0,w0,h0,t0]=hull[i],[z1,w1,h1,t1]=hull[i+1];
      face(moving,paint,[point(-w0*.58,h0+.025,z0),point(w0*.58,h0+.025,z0),point(w1*.58,h1+.025,z1),point(-w1*.58,h1+.025,z1)],0x72939b);
      for(const side of [-1,1]){
        const a=point(side*w0,t0,z0),b=point(side*w1,t1,z1);
        face(moving,detail,[point(side*w0*.58,h0,z0),point(side*w1*.58,h1,z1),b,a],tint,11);
        face(moving,paint,[point(side*w0*.58,h0+.035,z0),point(side*w0*.965,t0-.025,z0),point(side*w1*.965,t1-.025,z1),point(side*w1*.58,h1+.035,z1)],0x6495a2);
        pipe(moving,a,b,.033,0xa5bcbd);
      }
    }
    const end=hull[0];face(moving,paint,[point(-end[1]*.58,end[2],end[0]),point(end[1]*.58,end[2],end[0]),point(end[1],end[3],end[0]),point(-end[1],end[3],end[0])],tint);
    for(const [z,w]of [[-1.41,.626],[-.28,.73],[.80,.62]]){
      face(moving,paint,[point(-w,.37,z-.112),point(w,.37,z-.112),point(w,.37,z+.112),point(-w,.37,z+.112)],k%3===0?0x7b9c9e:0xb99164);
      for(const s of [-1,1])pipe(moving,point(s*w*.78,-.02,z),point(s*w*.79,.37,z),.033,0x8b9391);
    }
    for(const side of [-1,1]){
      // The varnished oar rests in a small pivoting U on the gunwale.
      const x=side*.74;
      pipe(moving,point(x-.045,.51,.12),point(x-.045,.62,.12),.013,0x809192,5);
      pipe(moving,point(x+.045,.51,.12),point(x+.045,.62,.12),.013,0x809192,5);
      pipe(moving,point(x-.045,.52,.12),point(x+.045,.52,.12),.012,0x809192,5);
      const a=-1.56+(k%4)*.14+side*.13,b=a+2.70;
      const slide=.125*Math.sin(k+side),spot=(z,r,h)=>point(side*(.43+.145*(z-a))+r+slide,h,z);
      pipe(moving,spot(a,0,.50),spot(b,0,.58),.024,0x9c7144,6);
      face(moving,paint,[spot(b-.64,-.032,.575),spot(b-.50,-.065,.577),spot(b,-.093,.58),spot(b+.075,.005,.58)],0x90683e);
      face(moving,paint,[spot(b-.64,-.032,.575),spot(b+.075,.005,.58),spot(b,.091,.58),spot(b-.55,.054,.577)],0xb68c52);
    }
    // Narrow raised floorboards keep feet and oars out of the bilge. The
    // short bow/stern planks follow the measured tapered shape of the skiff.
    for(const [offset,len] of [[-.32,2.58],[-.16,2.88],[0,3.04],[.16,2.88],[.32,2.58]]){
      const aft=-.17-len/2,bow=-.17+len/2;
      face(moving,paint,[point(offset-.066,.055,aft),point(offset+.066,.055,aft),
        point(offset+.066,.055,bow),point(offset-.066,.055,bow)],k%3===0?0x718f92:0x997f60);
    }
    const pin=point((k%3-1)*.61,0,-5.56),stern=point(.29,.53,-1.99);
    pin[1]=Math.max(.23,elevation(pin[0],pin[2])+.11);
    const sag=[(pin[0]+stern[0])*.5,(pin[1]+stern[1])*.5-.11,(pin[2]+stern[2])*.5];
    pipe(building,stern,sag,.018,0xad9775,5);pipe(building,sag,pin,.018,0xad9775,5);
    pipe(building,pin,[pin[0]-.05,pin[1]-.29,pin[2]+.03],.033,0x6a6c64,5);
    hulls.push({x:cx,z:cz,cs,sn});
  }
  mesh(building,root,'Oeschinensee · measured hotel roofs, shutters and terrace furnishings');
  mesh(moving,root,'Oeschinensee · blue rowing boats, thwarts and oars');
  const count=data.boats.length;
  lake.material.uniforms.rowingTime=clock;
  lake.material.uniforms.rowingMoor={value:data.boats.map(([x,z,q])=>new T.Vector4(x,z,Math.cos(q),Math.sin(q)))};
  const lakeN='vec3 surfaceNormal=normalize(vec3(slope.x,1.,slope.y));';
  lake.material.fragmentShader='uniform float rowingTime;uniform vec4 rowingMoor['+count+'];\n'+lake.material.fragmentShader.replace(lakeN,`
    float skiffShadow=0.;
    if(surface.x> -705.&&surface.x< -664.&&surface.y>310.&&surface.y<337.){
      // Evaluate the nearest three moorings. Capillary loops follow each hull
      // rather than an offshore periodic wave that would cross the gravel bank.
      int nearBoat=int(floor(clamp((surface.x+697.)/2.35+.5,0.,${count-1}.)));
      for(int j=-1;j<=1;j++){
        int id=clamp(nearBoat+j,0,${count-1});vec4 ref=rowingMoor[id];vec2 offset=surface-ref.xy;
        vec2 q=vec2(dot(offset,vec2(ref.z,-ref.w)),dot(offset,ref.wz));
        float phase=float(id)*1.709,rot=.017*sin(.47*rowingTime+phase);
        q+=vec2(-q.y,q.x)*rot;
        // Keep the actual lake out of the open boat. These half-beams are the
        // intersection of its lofted hull with the fixed optical water plane.
        float beam=mix(.324,.445,clamp((q.y+2.04)/.42,0.,1.));
        beam=mix(beam,.535,clamp((q.y+1.62)/.88,0.,1.));
        beam=mix(beam,.529,clamp((q.y+.74)/1.08,0.,1.));
        beam=mix(beam,.400,clamp((q.y-.34)/.74,0.,1.));
        beam=mix(beam,.227,clamp((q.y-1.08)/.53,0.,1.));
        beam=mix(beam,.0,clamp((q.y-1.61)/.36,0.,1.));
        if(q.y> -2.04&&q.y<1.97&&abs(q.x)<beam)discard;
        vec2 d=vec2(q.x,q.y-clamp(q.y,-1.65,1.61));float hullWidth=.61*(1.-.63*smoothstep(.55,1.94,q.y));
        float shoreDist=max(0.,length(d)-hullWidth),reach=exp(-1.74*shoreDist);
        vec2 toward=normalize(d+vec2(.001));vec2 radial=toward.x*vec2(ref.z,-ref.w)+toward.y*ref.wz;
        slope+=radial*(.038*cos(13.1*shoreDist-time*2.39+float(id)*.31))*reach*(1.-smoothstep(.065,.31,pixel));
        skiffShadow=max(skiffShadow,.18*reach);
      }
    }
    ${lakeN}`).replace('vec3 scattered=waterColor*','vec3 scattered=(1.-skiffShadow)*waterColor*');
  // The new surface data are used only in the visible settlement and low-stage
  // gravel cove; distant walls and the long high ridge keep their own images.
  const shorePhoto=texture('oeschinen-rowing-shore.webp');
  function shadeGround(){
    const seen=new Set();
    root.parent.traverse(o=>{
      const m=o.material;if(!m?.isShaderMaterial||seen.has(m)||!m.fragmentShader.includes('vec2 vd=(wp.xz+4000.)/8000.;'))return;
      const bounds=o.geometry?.boundingBox;
      if(bounds&&(bounds.max.x< -924||bounds.min.x> -636||bounds.max.z<290||bounds.min.z>451))return;
      seen.add(m);m.uniforms.westernLanding={value:shorePhoto};
      m.fragmentShader='uniform sampler2D westernLanding;\n'+m.fragmentShader.replace('vec2 vd=(wp.xz+4000.)/8000.;',`
        vec2 siteUv=(wp.xz-vec2(-920.,320.4))/vec2(149.9,109.6);
        float siteEdge=min(min(siteUv.x,siteUv.y),min(1.-siteUv.x,1.-siteUv.y));
        if(siteEdge>0.){
          vec3 siteRgb=texture2D(westernLanding,vec2(siteUv.x,1.-siteUv.y*.555)).rgb;
          float openCourt=1.-smoothstep(.025,.101,siteRgb.g-.55*siteRgb.r-.45*siteRgb.b);
          float grassy=smoothstep(.005,.062,siteRgb.g-siteRgb.r);
          float siteWeight=smoothstep(0.,.055,siteEdge)*smoothstep(.53,.88,n.y);
          rgb=mix(rgb,siteRgb*(.81+.30*clamp(dot(rgb,vec3(.25,.59,.16))/.40,.30,1.17)),siteWeight*(.85*openCourt+.52*(1.-openCourt)*grassy));
        }
        vec2 hotelStageUV=(wp.xz-vec2(-920.,275.))/vec2(330.,195.);
        float hotelStageEdge=min(min(hotelStageUV.x,hotelStageUV.y),min(1.-hotelStageUV.x,1.-hotelStageUV.y));
        if(hotelStageEdge>0.&&wp.x> -835.&&wp.y>-.18&&wp.y<8.2){
          vec3 lakeBed=texture2D(westernLanding,vec2(hotelStageUV.x,.444*(1.-hotelStageUV.y))).rgb;
          float stone=smoothstep(.057,.18,lakeBed.r-.36*lakeBed.g-.34*lakeBed.b);
          float damp=.72+.28*smoothstep(.15,1.64,wp.y);
          float falloff=smoothstep(0.,.062,hotelStageEdge)*smoothstep(-835.,-799.,wp.x);
          rgb=mix(rgb,lakeBed*(.82+.24*clamp(dot(rgb,vec3(.25,.60,.15))/.35,.4,1.25))*damp,
            stone*falloff*smoothstep(.59,.89,n.y)*(1.-smoothstep(5.,8.2,wp.y))*.94);
        }
        vec2 vd=(wp.xz+4000.)/8000.;`);
      m.needsUpdate=true;
    });
  }
  function managed(x,z){
    // At low lake stage the recorded shoreline here is bare gravel. Keep the
    // forest above the exposed band and the movable berths free of vegetation.
    if(x> -739&&x< -640&&z>299&&z<357&&elevation(x,z)<3.0)return true;
    if(x< -917||x> -770||z<328||z>425)return false;
    return blocks.some(loop=>inside(x,z,loop))||data.footprints.some(loop=>inside(x,z,loop));
  }
  const cellSize=12,key=(x,z)=>Math.floor(x/cellSize)*1024+Math.floor(z/cellSize),roofGrid=new Map();
  for(const f of roofTriangles){
    const b=[Math.min(...f.map(p=>p[0])),Math.min(...f.map(p=>p[2])),Math.max(...f.map(p=>p[0])),Math.max(...f.map(p=>p[2]))];
    for(let i=Math.floor(b[0]/cellSize);i<=Math.floor(b[2]/cellSize);i++)for(let j=Math.floor(b[1]/cellSize);j<=Math.floor(b[3]/cellSize);j++){
      const k=i*1024+j,triangles=roofGrid.get(k)||[];triangles.push(f);roofGrid.set(k,triangles);
    }
  }
  function clearance(x,z,base){
    if(x< -920||x> -662||z<308||z>425)return base;
    for(const tri of roofGrid.get(key(x,z))||[]){
      const [a,b,c]=tri,bx=b[0]-a[0],bz=b[2]-a[2],cx=c[0]-a[0],cz=c[2]-a[2],det=bx*cz-bz*cx;
      if(Math.abs(det)<.00001)continue;
      const dx=x-a[0],dz=z-a[2],u=(dx*cz-dz*cx)/det,v=(bx*dz-bz*dx)/det;
      if(u>=0&&v>=0&&u+v<=1)base=Math.max(base,a[1]+u*(b[1]-a[1])+v*(c[1]-a[1]));
    }
    for(const [cx,cz,r]of data.umbrellas)if(Math.abs(x-cx)<r&&Math.abs(z-cz)<r){
      const d=Math.hypot(x-cx,z-cz);if(d<r)base=Math.max(base,elevation(cx,cz)+2.64-.51*d/r);}
    for(const h of hulls){const dx=x-h.x,dz=z-h.z;if(Math.abs(dx*h.cs-dz*h.sn)<.73&&Math.abs(dx*h.sn+dz*h.cs)<2.)base=Math.max(base,.80);}
    return base;
  }
  return {landmarks:[{name:'Berghotel Oeschinensee',x:-856,z:395,approach:[-718,418,-868,389,24,-1,8]},
    {name:'Oeschinen rowing shore',x:-684,z:324,approach:[-615,351,-703,321,12,1,9]}],root,hulls,managed,clearance,shadeGround,
    update(t,player){root.visible=!player||Math.abs(player.x+784)<2800&&Math.abs(player.z-373)<2800;}};
};

// swissALTI3D records the waterline, then a flat water return. The survey's
// nearshore bed estimates continue the exposed fan slope underneath the row.
// Retain the coarser deep basin outside this small registered gravel recess.
window.makeOeschinenLanding.berthWeight=function(x,z){
  if(x< -758||x> -616||z<300||z>365)return 0;
  const side=Math.max(-727-x,x+646,0)/30;
  const offshore=Math.max(z-337,0)/28;
  const t=Math.min(1,Math.max(side,offshore));
  return 1-t*t*(3-2*t);
};

// Continue the 2025 exposed bank north of the edge of the existing surveyed
// fan. Evaluate the identical field for native terrain, collision, and every
// inset edge so that it cannot uncover an older high-stage water surface.
window.makeOeschinenLanding.fitBank=function(){
  const s=window.oeschinenLandingSurvey.shore,cm=new Int16Array(Uint8Array.from(atob(s.cm),ch=>ch.charCodeAt(0)).buffer);
  const x1=s.x+(s.cols-1)*s.step,z1=s.z+(s.rows-1)*s.step;
  return function(x,z,base){
    const border=Math.min(x-s.x,z-s.z,x1-x,z1-z);
    if(border<=0)return base;
    const u=(x-s.x)/s.step,v=(z-s.z)/s.step,i=Math.min(s.cols-2,Math.floor(u)),j=Math.min(s.rows-2,Math.floor(v)),k=j*s.cols+i;
    const fx=u-i,fz=v-j,top=cm[k]+fx*(cm[k+1]-cm[k]),bottom=cm[k+s.cols]+fx*(cm[k+s.cols+1]-cm[k+s.cols]);
    const local=(top+(bottom-top)*fz)*.01;
    const t=Math.min(1,border/16);
    return base+(local-base)*t*t*(3-2*t);
  };
};
