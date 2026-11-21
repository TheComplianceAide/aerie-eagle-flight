// Reine harbour. Buildings, drying sites, piers and the sports field use actual OSM geometry.
// Kartverket surface and ground heights set each gable. Credits and rebuild inputs ship with the field sites.
(()=>{
  window.makeReineHarbor=function(T,scene,ground,texture){
    const data=window.aerieReineHarbor;if(!data)return null;
    const group=new T.Group();group.name='Reine · church, village and stockfish wharves';scene.add(group);
    const batches=new Map(),cells=new Map(),empty=[],room=30,key=(i,j)=>i*32768+j;
    function register(box,o){
      const [x,z,X,Z]=box;
      for(let i=Math.floor(x/room);i<=Math.floor(X/room);i++)for(let j=Math.floor(z/room);j<=Math.floor(Z/room);j++){
        const k=key(i,j);if(!cells.has(k))cells.set(k,[]);cells.get(k).push(o);
      }
    }
    const bounds=ring=>[Math.min(...ring.map(p=>p[0])),Math.min(...ring.map(p=>p[1])),Math.max(...ring.map(p=>p[0])),Math.max(...ring.map(p=>p[1]))];
    function includes(ring,x,z){
      let inside=false;
      for(let i=0,j=ring.length-1;i<ring.length;j=i++){
        const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
      }
      return inside;
    }
    function mat(name,file,light=0xffffff){
      const m=new T.MeshLambertMaterial({map:file?texture(file,true):null,vertexColors:true,side:T.DoubleSide,color:light});
      m.name='Reine · '+name;return m;
    }
    const board=mat('weatherboard siding','building-clapboard.webp'),slates=mat('slate and sheet roofs','building-slate.webp');
    const site=mat('photographed church timberwork','reine-church-siding.webp'),paint=mat('paint and glass'),pole=mat('wood','building-boards.webp');
    const foundation=mat('foundations','building-fieldstone.webp');
    const white=[.88,.85,.76],charcoal=[.20,.23,.22],gray=[.47,.47,.43],pine=[.49,.45,.35],black=[.055,.073,.078];
    function face(material,points,uv,color){
      let a=batches.get(material);if(!a){a={p:[],u:[],c:[]};batches.set(material,a);}
      for(let i=0;i<points.length;i++){a.p.push(...points[i]);a.u.push(...uv[i]);a.c.push(...color);}
    }
    const U=[[0,0],[1,0],[1,1],[0,1]];
    function quad(m,a,b,c,d,color,uv=U){face(m,[a,b,c,a,c,d],[uv[0],uv[1],uv[2],uv[0],uv[2],uv[3]],color);}
    function tri(m,a,b,c,col,uv=U){face(m,[a,b,c],uv.slice(0,3),col);}
    function roofHeight(building,x,z){
      const [u,v,nx,nz,half]=building.ridge;
      return building.base+building.eave+building.rise*Math.max(0,1-Math.abs((x-u)*nx+(z-v)*nz)/half);
    }
    function roofPart(poly,b,sign){
      const [px,pz,nx,nz]=b.ridge,out=[];const side=p=>sign*((p[0]-px)*nx+(p[1]-pz)*nz);
      for(let i=0;i<poly.length;i++){
        const a=poly[i],c=poly[(i+1)%poly.length],aa=side(a),bb=side(c);
        if(aa>=0)out.push(a);
        if((aa<0)!==(bb<0)){const r=aa/(aa-bb);out.push([a[0]+(c[0]-a[0])*r,a[1]+(c[1]-a[1])*r]);}
      }
      return out;
    }
    function polyTop(poly,m,height,color,scale=.18) {
      if(poly.length<3)return;
      const t=poly.map(([x,z])=>new T.Vector2(x,z));
      for(const idx of T.ShapeUtils.triangulateShape(t,[])){
        const p=idx.map(i=>[t[i].x,height(t[i].x,t[i].y),t[i].y]);
        face(m,p,p.map(([x,,z])=>[x*scale,z*scale]),color);
      }
    }
    function pointOn(a,b,t,h,n=.0){
      const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz)||1;
      return [a[0]+dx*t+dz*n/len,h,a[1]+dz*t-dx*n/len];
    }
    function panel(m,a,b,u,w,bot,h,col,zOffset=.05,uv=U){
      const len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<w)return;
      const pt=(s,y)=>pointOn(a,b,(u+s)/len,y,zOffset);
      quad(m,pt(-w/2,bot),pt(w/2,bot),pt(w/2,bot+h),pt(-w/2,bot+h),col,uv);
    }
    function beam(a,b,w,material,color) {
      const direction=new T.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]);const v=direction.length();
      if(v<.01)return;direction.normalize();const side=new T.Vector3().crossVectors(direction,Math.abs(direction.y)<.93?new T.Vector3(0,1,0):new T.Vector3(1,0,0)).normalize().multiplyScalar(w/2);
      const up=new T.Vector3().crossVectors(direction,side).normalize().multiplyScalar(w/2);
      const ring=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([s,t])=>new T.Vector3().addScaledVector(side,s).addScaledVector(up,t));
      const cell=(p,o)=>[p[0]+o.x,p[1]+o.y,p[2]+o.z];
      for(let i=0;i<4;i++){const b0=ring[i],b1=ring[(i+1)%4];quad(material,cell(a,b0),cell(a,b1),cell(b,b1),cell(b,b0),color,[[0,0],[w,0],[w,v],[0,v]]);}
    }
    let seed=260721;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
    function village(b){
      const ring=b.ring,wallBase=b.base+.48;
      let observed=null,measuredHeight=null,roofLevel=(x,z)=>roofHeight(b,x,z);
      if(b.mesh){
        const [[x0,z0],vertices,index,edges]=b.mesh;observed=[];measuredHeight=new Map();
        for(let k=0;k<vertices.length;k+=3){
          const point=[x0+vertices[k]/10,b.base+vertices[k+1]/10,z0+vertices[k+2]/10];
          observed.push(point);
          if(k/3<edges)measuredHeight.set(ring[k/3],point[1]);
        }
        roofLevel=(x,z)=>{
          for(let k=0;k<index.length;k+=3){
            const a=observed[index[k]],c=observed[index[k+1]],d=observed[index[k+2]];
            const ax=c[0]-a[0],az=c[2]-a[2],bx=d[0]-a[0],bz=d[2]-a[2],det=ax*bz-az*bx;
            if(Math.abs(det)<1e-6)continue;
            const xx=x-a[0],zz=z-a[2],u=(xx*bz-zz*bx)/det,v=(ax*zz-az*xx)/det;
            if(u>=-.007&&v>=-.007&&u+v<=1.007)return a[1]+u*(c[1]-a[1])+v*(d[1]-a[1]);
          }
          return roofHeight(b,x,z);
        };
      }
      register(bounds(ring),{ring,ceiling:roofLevel});
      const marine=['cabin','boathouse','warehouse','industrial','farm_auxiliary','shed'].includes(b.kind);
      const u=random();const red=[.58,.132,.087],chalk=[.84,.82,.74],ochre=[.74,.51,.23],slate=[.51,.54,.54];
      const siding=marine?(u<.72?red:u<.87?chalk:ochre):(u<.54?chalk:u<.67?red:u<.80?ochre:slate);
      const roof=b.roof.map(n=>Math.min(.83,.075+n/255*.86));
      let winding=0;for(let i=0;i<ring.length;i++){const a=ring[i],c=ring[(i+1)%ring.length];winding+=a[0]*c[1]-c[0]*a[1];}
      for(let i=0;i<ring.length;i++){
        const a=winding>0?ring[i]:ring[(i+1)%ring.length],c=winding>0?ring[(i+1)%ring.length]:ring[i];
        const len=Math.hypot(c[0]-a[0],c[1]-a[1]);if(len<.3)continue;
        const aH=measuredHeight?.get(a)??roofHeight(b,...a),cH=measuredHeight?.get(c)??roofHeight(b,...c);
        const x=(a[0]+c[0])/2,z=(a[1]+c[1])/2,low=Math.min(b.base-.25,ground(x,z)-.30);
        quad(foundation,[a[0],low,a[1]],[c[0],low,c[1]],[c[0],wallBase,c[1]],[a[0],wallBase,a[1]],gray,[[0,0],[len*.41,0],[len*.41,.65],[0,.65]]);
        quad(board,[a[0],wallBase,a[1]],[c[0],wallBase,c[1]],[c[0],cH,c[1]],[a[0],aH,a[1]] ,siding,[[0,0],[len*.5,0],[len*.5,(cH-wallBase)*.62],[0,(aH-wallBase)*.62]]);
        const count=Math.floor(len/(b.kind==='industrial'?5.7:3.1));
        const stories=Math.max(1,Math.floor((b.eave-.60)/2.65)),ordinary=!['garage','garages','shed','roof','container'].includes(b.kind);
        if(ordinary)for(let j=0;j<count;j++)for(let level=0;level<stories;level++){
          const u=(j+.5)*len/count,winY=wallBase+.77+2.65*level;
          if(winY+1.15>Math.min(aH,cH)-.11)continue;
          panel(paint,a,c,u,1.22,winY-.075,1.25,chalk,.043);
          panel(paint,a,c,u,1.02,winY,1.065,[.16,.20,.215],.055);
          if(len>7)panel(paint,a,c,u,.05,winY,1.065,chalk,.060);
        }
        if(!ordinary&&len>4&&i===0)panel(board,a,c,len/2,Math.min(3,len-1),wallBase,Math.min(2.3,b.eave-.35),gray,.06);
      }
      if(observed){
        const index=b.mesh[2];
        for(let k=0;k<index.length;k+=3){
          const tri=[observed[index[k]],observed[index[k+1]],observed[index[k+2]]];
          face(slates,tri,tri.map(([x,,z])=>[x*.24,z*.24]),roof);
        }
        return;
      }
      const hAt=(x,z)=>roofHeight(b,x,z);
      for(const seg of b.rise>.1?[roofPart(ring,b,1),roofPart(ring,b,-1)]:[ring])polyTop(seg,slates,hAt,roof);
    }
    const grainUV=(l,t,r,b)=>[[l/1024,1-b/1024],[r/1024,1-b/1024],[r/1024,1-t/1024],[l/1024,1-t/1024]];
    function church(b){
      const origin=[1968.43,4335.39],axis=[.482,.876],side=[.876,-.482];
      const P=(u,v,y)=>[origin[0]+axis[0]*u+side[0]*v,b.base+y,origin[1]+axis[1]*u+side[1]*v];
      const asRing=(u0,u1,w)=>[[u0,-w],[u1,-w],[u1,w],[u0,w]].map(([u,v])=>{const p=P(u,v,0);return[p[0],p[2]]});
      function tube(u0,u1,w,foot,eave,ridge,main){
        const slateColor=[.215,.233,.239],ring=asRing(u0,u1,w);
        const ceiling=(x,z)=>b.base+eave+(ridge-eave)*Math.max(0,1-Math.abs((x-origin[0])*side[0]+(z-origin[1])*side[1])/w);
        register(bounds(ring),{ring,ceiling});
        for(const sign of [-1,1]){
          quad(foundation,P(u0,sign*w,-1),P(u1,sign*w,-1),P(u1,sign*w,foot),P(u0,sign*w,foot),gray);
          quad(main?site:board,P(u1,sign*w,foot),P(u0,sign*w,foot),P(u0,sign*w,eave),P(u1,sign*w,eave),white,
               main?grainUV(3,3,1021,333):[[0,0],[u1-u0,0],[u1-u0,3],[0,3]]);
          quad(slates,P(u0,sign*(w+.16),eave),P(u1,sign*(w+.16),eave),P(u1,0,ridge),P(u0,0,ridge),slateColor,[[0,0],[(u1-u0)*.28,0],[(u1-u0)*.28,w*.29],[0,w*.29]]);
        }
        for(const u of [u0,u1]){
          quad(board,P(u,-w,foot),P(u,w,foot),P(u,w,eave),P(u,-w,eave),white);
          tri(board,P(u,-w,eave),P(u,w,eave),P(u,0,ridge),white);
        }
      }
      tube(2.65,18.25,5.51,.72,5.60,9.08,true);tube(18.19,23.35,3.94,.59,4.71,7.26,false);tube(23.20,26.25,2.87,.56,3.25,5.09,false);
      const width=2.51,low=.67,eave=10.62,peak=15.72;
      const tor=asRing(-2.48,2.54,width);register(bounds(tor),{ring:tor,ceiling:(x,z)=>{const dx=x-origin[0],dz=z-origin[1];return b.base+eave+(peak-eave)*Math.max(0,1-Math.max(Math.abs(dx*axis[0]+dz*axis[1]),Math.abs(dx*side[0]+dz*side[1]))/width);}});
      const corners=[[-2.48,-width],[2.54,-width],[2.54,width],[-2.48,width]];
      for(let i=0;i<4;i++){
        const [a,v]=corners[i],[c,w]=corners[(i+1)%4];
        quad(foundation,P(a,v,-.35),P(c,w,-.35),P(c,w,low),P(a,v,low),gray);
        const main=i===2;
        quad(site,P(a,v,low),P(c,w,low),P(c,w,eave),P(a,v,eave),white,main?grainUV(2,338,382,1013):grainUV(386,339,632,1013));
        tri(slates,P(a*1.045,v*1.045,eave),P(c*1.045,w*1.045,eave),P(0,0,peak),[.095,.143,.169],[[0,0],[2,0],[1,3]]);
      }
      beam(P(0,0,peak-.07),P(0,0,peak+.87),.08,paint,charcoal);
      beam(P(-.38,0,peak+.65),P(.41,0,peak+.65),.067,paint,charcoal);
      // The pediment and two freestanding white supports project from the side entrance.
      for(const s of [-1.14,1.14]){
        beam(P(s,width+1.53,.64),P(s,width+1.53,3.30),.13,paint,white);
        beam(P(s,width+1.53,3.30),P(0,width+1.53,4.18),.16,paint,white);
        quad(slates,P(s,width,3.3),P(s,width+1.67,3.3),P(0,width+1.67,4.25),P(0,width,4.25),[.32,.33,.30]);
      }
      beam(P(-1.15,width+1.53,3.28),P(1.15,width+1.53,3.28),.12,paint,white);
      // Ramp rail visible on the July field photograph; posts follow the actual approach direction.
      for(const offset of [width+.38,width+1.88]){
        for(let i=0;i<8;i++){const u=.2+i*.80;const y=.68-.074*i;beam(P(u,offset,y),P(u,offset,y+.88),.058,paint,white);}
        beam(P(.2,offset,1.57),P(5.8,offset,1.05),.07,paint,white);
      }
      const f0=P(10,8.3,0);beam([f0[0],ground(f0[0],f0[2]),f0[2]],[f0[0],b.base+11.2,f0[2]],.09,paint,white);
    }
    for(const b of data.buildings){if(b.kind==='church')church(b);else village(b);}
    // Empty summer hjell. Each OSM line is one surveyed row, not a pasture or a fenced rectangle.
    for(const line of data.racks)for(let j=0;j<line.length-1;j++){
      const a=line[j],b=line[j+1],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len<2)continue;
      const count=Math.ceil(len/4.15),vx=-dz/len, vz=dx/len;let prev=null,previousSide=null;
      for(let i=0;i<=count;i++){
        const t=i/count,x=a[0]+dx*t,z=a[1]+dz*t,h=ground(x,z),top=[x,h+2.68,z];
        const frame=[-1,1].map(s=>[x+s*vx*1.20,ground(x+s*vx*1.20,z+s*vz*1.20),z+s*vz*1.20]);
        beam(frame[0],top,.114,pole,pine);beam(frame[1],top,.114,pole,pine);
        if(prev){beam(prev,top,.15,pole,pine);if(i%4===0)beam(previousSide,top,.1,pole,pine);}
        prev=top;previousSide=frame[0];
      }
      register([Math.min(a[0],b[0])-1.3,Math.min(a[1],b[1])-1.3,Math.max(a[0],b[0])+1.3,Math.max(a[1],b[1])+1.3],{line:[a,b],width:1.40,rack:true});
    }
    for(const line of data.piers){
      const first=line[0],last=line[line.length-1];
      if(Math.hypot(first[0]-last[0],first[1]-last[1])<.5&&line.length>3){
        const ring=line.slice(0,-1);polyTop(ring,pole,()=>1.53,[.54,.52,.43],.31);
        register(bounds(ring),{ring,ceiling:()=>1.53});continue;
      }
      for(let i=1;i<line.length;i++){
        const a=line[i-1],b=line[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.6)continue;
        const nx=-dz/length*1.03,nz=dx/length*1.03,ring=[[a[0]+nx,a[1]+nz],[b[0]+nx,b[1]+nz],[b[0]-nx,b[1]-nz],[a[0]-nx,a[1]-nz]];
        polyTop(ring,pole,()=>1.38,[.58,.54,.45],.4);register(bounds(ring),{ring,ceiling:()=>1.38});
        for(let k=0;k<4;k++){const v=ring[k],w=ring[(k+1)%4];quad(pole,[v[0],.69,v[1]],[w[0],.69,w[1]],[w[0],1.38,w[1]],[v[0],1.38,v[1]],charcoal);}
        const n=Math.max(1,Math.ceil(length/9));
        for(let k=0;k<=n;k++){const t=k/n,x=a[0]+dx*t,z=a[1]+dz*t;for(const s of [-1,1])beam([x+s*nx,.15,z+s*nz],[x+s*nx,1.6,z+s*nz],.19,pole,charcoal);}
      }
    }
    for(const [width,line] of data.streets){
      for(let i=1;i<line.length;i++){
        const a=line[i-1],b=line[i],margin=width+4.0;
        register([Math.min(a[0],b[0])-margin,Math.min(a[1],b[1])-margin,Math.max(a[0],b[0])+margin,Math.max(a[1],b[1])+margin],{line:[a,b],width,road:true});
      }
    }
    for(const [type,ring] of data.zones){
      register(bounds(ring),{ring,open:true});
      if(type==='pitch'){
        const center=ring.reduce((a,v)=>[a[0]+v[0]/ring.length,a[1]+v[1]/ring.length],[0,0]);
        // The charted sports ground is 102 by 61 metres; stripe the turf inside its real outline.
        polyTop(ring,paint,(x,z)=>ground(x,z)+.085,[.145,.247,.142],.06);
        for(let j=0;j<ring.length;j++){
          const a=ring[j],b=ring[(j+1)%ring.length],lineP=(p)=>[p[0]+(center[0]-p[0])*.037,p[1]+(center[1]-p[1])*.037];
          const c=lineP(a),d=lineP(b);beam([c[0],ground(...c)+.125,c[1]],[d[0],ground(...d)+.125,d[1]],.12,paint,[.80,.79,.69]);
        }
      }
    }
    for(const [material,batch] of batches){
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(batch.p,3));g.setAttribute('uv',new T.Float32BufferAttribute(batch.u,2));g.setAttribute('color',new T.Float32BufferAttribute(batch.c,3));
      g.computeVertexNormals();g.computeBoundingSphere();const o=new T.Mesh(g,material);o.name=material.name;o.userData.terrainCaster=true;group.add(o);
    }
    function field(x,z,coverOnly,margin=0){
      let result=-Infinity;
      for(const block of cells.get(key(Math.floor(x/room),Math.floor(z/room)))||empty){
        if(block.ring){
          if(!includes(block.ring,x,z))continue;
          if(coverOnly)return true;if(block.ceiling)result=Math.max(result,block.ceiling(x,z));
        }else if(block.line){
          const [a,b]=block.line,dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
          if(Math.hypot(a[0]+t*dx-x,a[1]+t*dz-z)>block.width+margin)continue;
          if(coverOnly)return true;if(block.rack)result=Math.max(result,ground(x,z)+2.71);
        }
      }
      return coverOnly?false:result;
    }
    group.userData.reine={buildings:data.buildings.length,racks:data.racks.length,piers:data.piers.length};
    return {group,ceiling:(x,z)=>field(x,z,false),blocks:(x,z,margin)=>field(x,z,true,margin)};
  };
})();
