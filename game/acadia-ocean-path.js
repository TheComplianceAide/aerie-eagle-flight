// NPS lower walkway at Thunder Hole. X and Z follow the Maine low-tide
// orthophoto. Landing elevations follow the 2022 NOAA point cloud (NAVD88).
// The exposed granite shelf is mapped in the 2025 low-water orthophoto.
// Clumps behind the accessible ramp remain vegetated.
window.thunderHoleWalks=[{"points":[[18.9,-57.1,13.65],[25,-55.5,13.28],[27.6,-54.8,13.24]],"width":2.3,"rails":false},{"points":[[27.6,-54.8,13.24],[32.5,-53.7,11.87],[35.8,-52.8,11.74],[38.1,-51.6,11.03],[40,-51.5,10.29],[42,-52.6,9.61],[44.1,-54.0,8.1],[45.3,-54.2,7.69],[47.4,-53.2,7.6],[49,-52.6,7.35],[51,-52.25,6.67],[52.65,-51.0,5.99],[52.72,-49.4,5.6],[52.6,-47.6,4.64],[53.0,-46,4.48],[54.4,-43.2,3.93],[55.8,-40.2,3.34],[57.56,-37.0,3.28],[59.75,-33.67,3.06]],"width":1.95},{"points":[[26.7,-55.7,13.3],[28.7,-60.2,12.95],[30.9,-64.2,12.58],[33.7,-68.5,12.33],[35,-68.9,12.21],[35.6,-68.1,12.18],[35.7,-64.1,12.02],[35.35,-60.1,11.96],[35.25,-56.1,11.84],[34.7,-53.25,11.8]],"width":1.48,"steps":false}];
window.thunderHoleBareLedge=function(x,z){
  if(x<29||x>126||z<-81||z>24)return false;
  const westernEdge=z<-61?49+(-61-z)*.64:z<-53?30+(-53-z)*2.38:z<-35?30:29+Math.max(0,z+24)*.18;
  return x>westernEdge;
};
window.addThunderHoleWalkway=function(T,scene,world){
  const site=new T.Group();
  site.name='Ocean Path · Thunder Hole viewing walks';
  const texture=name=>{
    const map=new T.TextureLoader().load(name);
    map.colorSpace=T.SRGBColorSpace;
    map.wrapS=map.wrapT=T.RepeatWrapping;
    return map;
  };
  const aggregate=new T.MeshStandardMaterial({color:0xcfdcea,map:texture('keene-concrete.webp'),roughness:.94,toneMapped:false});
  const granite=new T.MeshStandardMaterial({color:0xcbd7e4,map:texture('building-fieldstone.webp'),roughness:.92,toneMapped:false});
  // Galvanized pipe and smaller cable pick up a narrow cold highlight above
  // the dark water. Neither the rail nor the path emits light at night.
  const pipe=new T.MeshStandardMaterial({color:0xbfc3c4,metalness:.39,roughness:.39,toneMapped:false});
  const path={p:[],uv:[],indices:[]},wall={p:[],uv:[],indices:[]},tubes=[],walks=[];
  const quarter=new T.Quaternion(),axis=new T.Vector3(0,1,0),unit=new T.Vector3(),transform=new T.Object3D();
  function quad(batch,a,b,c,d,u0,u1,v1){
    const i=batch.p.length/3;
    batch.p.push(...a,...b,...c,...d);
    batch.uv.push(u0,0,u1,0,u1,v1,u0,v1);
    batch.indices.push(i,i+1,i+2,i,i+2,i+3);
  }
  function rod(a,b,r){
    const direction=unit.set(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
    const length=direction.length();
    if(length<.015)return;
    transform.position.set((a[0]+b[0])*.5,(a[1]+b[1])*.5,(a[2]+b[2])*.5);
    quarter.setFromUnitVectors(axis,direction.divideScalar(length));
    transform.quaternion.copy(quarter);transform.scale.set(r,length,r);transform.updateMatrix();tubes.push(transform.matrix.clone());
  }
  function section(a,b,part,width){
    const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
    const x=a[0]+dx*part,z=a[1]+dz*part,y=a[2]+(b[2]-a[2])*part;
    return {x,z,y,nx:dz/length,nz:-dx/length,width};
  }
  const edge=(s,side,y)=>[s.x+s.nx*side*s.width*.5,y,s.z+s.nz*side*s.width*.5];
  function walk(points,width,{rails=true,steps=true,wallBase=.52}={}){
    let travel=0;
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),drop=Math.abs(b[2]-a[2]);
      const stepped=steps&&drop>.285&&drop/length>.165;
      const treads=stepped?Math.max(2,Math.round(drop/.165)):1;
      // Average the adjoining segment perpendiculars at bends. The deck, wall
      // and handrails consequently share the same edge along every landing.
      function at(t){
        const s=section(a,b,t,width);
        if(t===0&&i>1||t===1&&i+1<points.length){
          const other=t===0?section(points[i-2],a,1,width):section(b,points[i+1],0,width);
          const dot=1+other.nx*s.nx+other.nz*s.nz;
          if(dot>.28){s.nx=(s.nx+other.nx)/dot;s.nz=(s.nz+other.nz)/dot;}
        }
        return s;
      }
      const seats=[];
      for(let k=0;k<=treads;k++)seats.push(at(k/treads));
      for(let k=0;k<treads;k++){
        const s=seats[k],e=seats[k+1],y=s.y+.105,ey=(stepped?s.y:e.y)+.105;
        const l=edge(s,-1,y),r=edge(s,1,y),le=edge(e,-1,ey),re=edge(e,1,ey);
        quad(path,l,le,re,r,travel+k*length/treads,travel+(k+1)*length/treads,width);
        if(stepped)quad(path,le,edge(e,-1,e.y+.105),edge(e,1,e.y+.105),re,0,width,Math.abs(e.y-s.y));
        for(const side of [-1,1]){
          const start=edge(s,side,y),end=edge(e,side,ey);
          const low=p=>[p[0],Math.min(p[1]-.24,world.elevation(p[0],p[2])-wallBase),p[2]];
          const v0=travel+k*length/treads,v1=travel+(k+1)*length/treads;
          if(side===1)quad(wall,start,end,low(end),low(start),v0*.8,v1*.8,wallBase+.65);
          else quad(wall,end,start,low(start),low(end),v1*.8,v0*.8,wallBase+.65);
        }
      }
      walks.push({a,b,length,width:width*.5+(rails?.055:0),rails});
      if(rails){
        const spans=Math.max(1,Math.round(length/1.9));
        for(const side of [-1,1]){
          for(let k=0;k<spans;k++){
            const s=at(k/spans),e=at((k+1)/spans);
            const y=s.y+.13,ey=e.y+.13;
            rod(edge(s,side,y-.06),edge(s,side,y+1.00),.041);
            rod(edge(s,side,y+.96),edge(e,side,ey+.96),.034);
            for(const offset of [.36,.65]){
              const from=edge(s,side,y+offset),to=edge(e,side,ey+offset);
              const mid=[(from[0]+to[0])*.5,(from[1]+to[1])*.5-.025,(from[2]+to[2])*.5];
              rod(from,mid,.014);rod(mid,to,.014);
            }
            if(i===points.length-1&&k===spans-1)rod(edge(e,side,ey-.06),edge(e,side,ey+1.0),.041);
          }
        }
      }
      travel+=length;
    }
  }
  // The lower walk bends around the blind chamber on its northeastern lip.
  // These are landing heights, so stepped sections retain horizontal treads.
  for(const route of window.thunderHoleWalks)walk(route.points,route.width,route);
  const patio=[];
  for(let i=0;i<=12;i++){
    const t=-Math.PI*.5+i*Math.PI/12;
    patio.push([35.5+3.7*Math.cos(t),-60.3+3.72*Math.sin(t),11.96]);
  }
  // The accessible ramp opens sideways onto the semicircular stone lookout.
  const center=[35.38,12.10,-60.3];
  for(let i=1;i<patio.length;i++){
    const a=patio[i-1],b=patio[i],p0=[a[0],12.10,a[1]],p1=[b[0],12.10,b[1]];
    const k=path.p.length/3;
    path.p.push(...center,...p1,...p0);path.uv.push(0,0,b[0]-center[0],b[1]-center[2],a[0]-center[0],a[1]-center[2]);path.indices.push(k,k+1,k+2);
    const bottom=p=>[p[0],Math.min(11.52,world.elevation(p[0],p[2])-.25),p[2]];
    quad(wall,p1,p0,bottom(p0),bottom(p1),i*1.04,(i-1)*1.04,.85);
    const top=p=>[p[0],13.04,p[2]];
    rod(top(p0),top(p1),.034);
    if(i%2===1||i===12)rod(p0,top(p0),.041);
    rod([p0[0],12.69,p0[2]],[p1[0],12.69,p1[2]],.014);
  }
  function finish(batch,material,name){
    const geo=new T.BufferGeometry();
    geo.setAttribute('position',new T.Float32BufferAttribute(batch.p,3));
    geo.setAttribute('uv',new T.Float32BufferAttribute(batch.uv,2));geo.setIndex(batch.indices);
    geo.computeVertexNormals();geo.computeBoundingSphere();
    const mesh=new T.Mesh(geo,material);mesh.name=name;site.add(mesh);
  }
  finish(path,aggregate,'Ocean Path · aggregate landings and granite steps');
  finish(wall,granite,'Ocean Path · granite retaining walls');
  const rails=new T.InstancedMesh(new T.CylinderGeometry(1,1,1,7,1),pipe,tubes.length);
  for(let i=0;i<tubes.length;i++)rails.setMatrixAt(i,tubes[i]);
  rails.name='Thunder Hole · pipe and cable handrails';rails.computeBoundingSphere();site.add(rails);scene.add(site);
  const existing=world.clearance||world.height;
  world.clearance=(x,z,altitude)=>{
    let y=existing(x,z,altitude);
    if(x<15||x>63||z<-72||z>-30)return y;
    for(const {a,b,length,width,rails} of walks){
      const dx=b[0]-a[0],dz=b[1]-a[1];
      const u=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(length*length)));
      const across=Math.hypot(x-a[0]-u*dx,z-a[1]-u*dz);
      if(across<=width+.08){
        const h=a[2]+(b[2]-a[2])*u;
        y=Math.max(y,h+(rails&&across>width-.16?1.12:.18));
      }
    }
    if(x>=35.38&&Math.hypot(x-35.5,z+60.3)<3.73)y=Math.max(y,12.12);
    return y;
  };
  return site;
};
