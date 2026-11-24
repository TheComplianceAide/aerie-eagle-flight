// Crown-top returns and roof polygons are local to each measured lake shore.
window.makeLakeHabitat=function(T,scene,region,elevation,waterLevel){
  const decode=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
  const sites=Object.values(window.aerieLakeHabitatData[region]).map(r=>({
    ...r,mask:decode(r.coverage),crowns:new Int16Array(decode(r.trees).buffer)
  }));
  const port=region==='winnipesaukee'?window.makeWinniTownDocks?.(T,scene,elevation,waterLevel):null;
  const landing=region==='moosehead'?window.makeRockwoodLanding(T,scene,elevation,waterLevel):null;
  const roofCells=new Map(),cellSize=40;
  const cell=(x,z)=>Math.floor(x/cellSize)*65536+Math.floor(z/cellSize);
  function contains(p,x,z){
    let inside=false;
    for(let i=0,j=p.length-1;i<p.length;j=i++){
      const a=p[i],b=p[j];
      if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    }
    return inside;
  }
  function roofHeight(x,z){
    let h=(port||landing)?.supportHeight(x,z)??-Infinity;
    for(const r of roofCells.get(cell(x,z))||[]){
      if(contains(r.p,x,z))h=Math.max(h,roofY(r,x,z));
    }
    return h;
  }
  function cross(r,x,z){return -(x-r.center[0])*r.axis[1]+(z-r.center[1])*r.axis[0];}
  function roofY(r,x,z){if(r.measuredHeight)return r.measuredHeight(x,z);return r.base+r.eave+r.rise*Math.max(0,1-Math.abs(cross(r,x,z))/r.halfWidth);}
  function ownsTree(x,z){
    if(landing?.ownsTree(x,z))return true;
    for(const site of sites){
      const i=Math.floor((x-site.center[0]+site.half)/16),j=Math.floor((z-site.center[1]+site.half)/16);
      if(i>=0&&j>=0&&i<site.cols&&j<site.cols){
        const k=j*site.cols+i;
        return !!(site.mask[k>>3]&(1<<(k%8)));
      }
    }
    return false;
  }
  function plantCrowns(plant){
    landing?.plantCrowns(plant);
    for(const site of sites){
      const a=site.crowns;
      for(let i=0;i<a.length;i+=5){
        const x=site.center[0]+a[i]/2,z=site.center[1]+a[i+1]/2;
        const seed=((Math.imul(a[i],73856093)^Math.imul(a[i+1],19349663))>>>0)/4294967296;
        plant({x,z,y:elevation(x,z),width:a[i+3]/8,height:a[i+2]/8,seed},a[i+4]===1,true);
      }
    }
  }
  const surfaces=new Map(),loader=new T.TextureLoader(),detail=window.makeBuildingFittings(T,scene);
  const finishes=['boards','shingles','metal','fieldstone'];
  const wallTints=[0xcac3aa,0xd9ddda,0xa7b7af,0xbcaa92,0xbaaba6,0xb3aaa0,0x9f5d50,0x67736c];
  function face(tile,material,color,points,uv){
    // One mesh for each finish. A whole lake's cottages are some seventy thousand
    // triangles, far cheaper to draw at once than as three hundred small meshes
    // that each cost the phone a draw in the view and another in the lake mirror.
    const key=material;let b=surfaces.get(key);
    if(!b){b={material,p:[],uv:[],c:[]};surfaces.set(key,b);}
    for(const k of points.length===3?[0,1,2]:[0,1,2,0,2,3]){
      b.p.push(...points[k]);b.uv.push(...uv[k]);b.c.push(color.r,color.g,color.b);
    }
  }
  // Split the footprint at the roof ridge. Each half uses one continuous
  // plane even when a lake cottage has a projecting wing or an L-shaped plan.
  function clip(r,sign){
    const poly=[];let a=r.p.at(-1),fa=sign*cross(r,...a);
    for(const b of r.p){
      const fb=sign*cross(r,...b);
      if((fa>0)!==(fb>0)){const t=fa/(fa-fb);poly.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}
      if(fb>0)poly.push(b);
      a=b;fa=fb;
    }
    return poly;
  }
  for(const site of sites)for(const roof of site.buildings){
    const [cx,cz]=roof.center,p=roof.p,tile=Math.floor(cx/350)+65536*Math.floor(cz/350);
    const altitude=p.map(([x,z])=>elevation(x,z));
    const ground=altitude.slice().sort((a,b)=>a-b);
    roof.base=Math.max(waterLevel+.17,ground[Math.round((ground.length-1)*.8)]);
    port?.registerRoof(roof);
    const sill=roof.base+.12,foot=Math.min(...altitude)-.42;
    const xs=p.map(q=>q[0]),zs=p.map(q=>q[1]);
    for(let i=Math.floor(Math.min(...xs)/cellSize);i<=Math.floor(Math.max(...xs)/cellSize);i++)
      for(let j=Math.floor(Math.min(...zs)/cellSize);j<=Math.floor(Math.max(...zs)/cellSize);j++){
        const k=i*65536+j;if(!roofCells.has(k))roofCells.set(k,[]);roofCells.get(k).push(roof);
      }
    const seed=((Math.imul(Math.round(cx*8),73856093)^Math.imul(Math.round(cz*8),19349663))>>>0)/4294967296;
    const siding=new T.Color(wallTints[Math.floor(seed*wallTints.length)]);
    // The base texture carries the shingle reflectance. Preserve the relative
    // hue of the measured roof and compensate for that texture's neutral gray.
    const tint=new T.Color().setRGB(...roof.rgb.map(v=>Math.min(.98,.20+1.16*v/255)),T.SRGBColorSpace);
    const mortar=new T.Color(0xc0beb3),metal=roof.rise<.55;
    let longest=0;const runs=p.map((a,i)=>Math.hypot(a[0]-p[(i+1)%p.length][0],a[1]-p[(i+1)%p.length][1]));
    for(let i=1;i<runs.length;i++)if(runs[i]>runs[longest])longest=i;
    function rim(q){return [q[0],roofY(roof,...q),q[1]];}
    const roofMaterial=metal?2:1;
    const roofUV=([x,z])=>[(x*roof.axis[0]+z*roof.axis[1])/3,cross(roof,x,z)/2.8];
    // The surveyed footprint is the wall line. Join both sides of each
    // outside corner so the drip edge stays continuous around projecting bays.
    const edgeNormals=p.map((a,i)=>{
      const b=p[(i+1)%p.length],length=Math.max(.001,runs[i]);
      return [-(b[1]-a[1])/length,(b[0]-a[0])/length];
    });
    const frontage=port?.decorateRoof(roof);
    const eaves=p.map(([x,z],i)=>{
      const a=edgeNormals[(i+p.length-1)%p.length],b=edgeNormals[i];
      const miter=(metal?.18:.31)/Math.max(.45,1+a[0]*b[0]+a[1]*b[1]);
      return [x+(a[0]+b[0])*miter,z+(a[1]+b[1])*miter];
    });
    for(let i=0;i<p.length;i++){
      const a=p[i],b=p[(i+1)%p.length],l=runs[i];if(l<.15)continue;
      const aa=[a[0],sill,a[1]],bb=[b[0],sill,b[1]];
      face(tile,3,mortar,[[a[0],foot,a[1]],[b[0],foot,b[1]],bb,aa],[[0,0],[l/2,0],[l/2,(sill-foot)/2],[0,(sill-foot)/2]]);
      const fa=cross(roof,...a),fb=cross(roof,...b),cuts=[0,1];
      if(roof.measuredHeight){
        const segments=Math.ceil(l/1.35);
        for(let j=1;j<segments;j++)cuts.push(j/segments);
      }else if(fa*fb<0)cuts.push(fa/(fa-fb));
      cuts.sort((u,v)=>u-v);
      const blend=(from,to,f)=>[from[0]+(to[0]-from[0])*f,from[1]+(to[1]-from[1])*f];
      for(let j=1;j<cuts.length;j++){
        const start=cuts[j-1],end=cuts[j],q=blend(a,b,start),r=blend(a,b,end),u0=l*start/4,u1=l*end/4;
        const v=blend(eaves[i],eaves[(i+1)%p.length],start),w=blend(eaves[i],eaves[(i+1)%p.length],end);
        const outside=[q,r,w,v],rv=rim(v),rw=rim(w);
        face(tile,roofMaterial,tint,outside.map(rim),outside.map(roofUV));
        face(tile,0,siding,[rv,rw,[rw[0],rw[1]-.145,rw[2]],[rv[0],rv[1]-.145,rv[2]]],
          [[u0,1],[u1,1],[u1,.95],[u0,.95]]);
        face(tile,0,siding,[[q[0],sill,q[1]],[r[0],sill,r[1]],rim(r),rim(q)],[[u0,0],[u1,0],[u1,(roofY(roof,...r)-sill)/3.2],[u0,(roofY(roof,...q)-sill)/3.2]]);
      }
    }
    for(const sign of [-1,1]){
      const poly=clip(roof,sign);if(poly.length<3)continue;
      for(const triangle of T.ShapeUtils.triangulateShape(poly.map(q=>new T.Vector2(...q)),[])){
        const pts=triangle.slice().reverse().map(k=>poly[k]);
        if(port?.roofPlate(roof,pts,pts.map(rim)))continue;
        face(tile,roofMaterial,tint,pts.map(rim),pts.map(roofUV));
      }
    }
    detail(cx,cz,(box,sash)=>{
      // Use each actual wall, including the short returns on attached wings.
      let area=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];area+=a[0]*b[1]-b[0]*a[1];}
      const side=area>0?1:-1,floors=Math.max(1,Math.min(3,Math.round(roof.eave/3.0)));
      for(let i=0;i<p.length;i++){
        const a=p[i],b=p[(i+1)%p.length],l=runs[i];
        if(l<2.5||frontage===i)continue;
        const ux=(b[0]-a[0])/l,uz=(b[1]-a[1])/l,nx=side*uz,nz=-side*ux,trim=0xd8d9cd;
        const dx=-side*ux,dz=-side*uz;
        const on=(t,off)=>[a[0]+t*(b[0]-a[0])+nx*off,a[1]+t*(b[1]-a[1])+nz*off];
        const cols=Math.max(1,Math.min(12,Math.floor(l/3.45)));
        for(let f=0;f<floors;f++)for(let col=0;col<cols;col++){
          const door=i===longest&&f===0&&col===Math.floor(cols*.55),[x,z]=on((col+.5)/cols,.065);
          if(door){box(x,roof.base+1.04,z,dx,dz,.99,2.08,.13,0x7d796b);continue;}
          sash(x,roof.base+(f+.52)*roof.eave/floors,z,dx,dz,Math.min(1.55,l/cols*.5),Math.min(1.57,roof.eave/floors*.50),trim,0x4b5758);
        }
        const [x,z]=on(.5,.04);box(x,roof.base+roof.eave-.10,z,dx,dz,l+.10,.15,.15,trim);
      }
    });
  }
  const textures=['building-clapboard.webp','lakeside-roof.webp','lakeside-metal.webp','building-fieldstone.webp'];
  const materials=finishes.map((name,i)=>{
    const tex=loader.load(textures[i]);tex.colorSpace=T.SRGBColorSpace;tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.anisotropy=8;
    const m=new T.MeshStandardMaterial({map:tex,bumpMap:tex,bumpScale:i===3?.035:.015,side:T.DoubleSide,vertexColors:true,roughness:i===2?.54:.88});
    if(i===0||i===3)scene.userData.buildingLight.finish(m,name,i===3?2.08:2.4);return m;
  });
  for(const b of surfaces.values()){
    const g=new T.BufferGeometry();
    for(const [k,n,a] of [['position',3,b.p],['uv',2,b.uv],['color',3,b.c]])g.setAttribute(k,new T.Float32BufferAttribute(a,n));
    g.computeVertexNormals();g.computeBoundingSphere();const mesh=new T.Mesh(g,materials[b.material]);mesh.name='Lake survey · '+finishes[b.material];scene.add(mesh);
  }
  function supersedes(box){
    const x=box.reduce((s,q)=>s+q[0],0)/4,z=box.reduce((s,q)=>s+q[1],0)/4;
    return Number.isFinite(roofHeight(x,z))||box.filter(([a,b])=>Number.isFinite(roofHeight(a,b))).length>1;
  }
  port?.finish();
  return {roofHeight,plantCrowns,ownsTree,supersedes,updateBoats:(port||landing)?.updateBoats,managedGround:(port||landing)?.managedGround};
};
