// Coordinates use each world's rounded UTM origin, metres east and south.
// See regional-field-fixtures-credits.txt for surveyed alignments and interpretation.
(() => {
  'use strict';
  const trails=[[1946.02,-1037.6,2.22264],[1946.63,-1052.75,1.56856],[1933.26,-1069.57,0.6355],[1956.64,-1075.89,0.4439],[1955.21,-1089.87,2.61978],[1929.79,-1093.2,3.05692],[1937.08,-1113.83,1.20793],[1912.98,-1116.55,1.2041],[1914.68,-1130.12,2.89072],[1916.91,-1152.08,2.93933],[1913.37,-1158.48,1.89394],[1891.38,-1173.78,-2.98694],[1884.85,-1183.41,0.67405],[1866.28,-1185.85,1.39168],[1859.7,-1204.35,0.6917],[1840.84,-1205.5,-2.13497],[2827.46,-1845.34,2.93747],[2810.63,-1848.34,3.00258],[2797.87,-1854.37,2.60175],[2785.38,-1869.41,2.72524],[2761.3,-1876.34,2.80573],[2741.7,-1865.92,-1.97533],[2732.47,-1842.44,-1.83561],[2727.01,-1821.98,-2.09727],[2608.58,-1794.01,-2.30503],[2600.55,-1778.36,-1.75415],[2610.29,-1753.78,-1.40124],[2606.42,-1727.65,-1.98657],[2594.54,-1703.32,-1.91832],[2583.74,-1676.59,-2.00806],[2574.42,-1656.66,-2.00806],[2566.24,-1635.03,-1.92479]];
  const piers={"171960198":[[3998.75,2923.22],[4026.79,2991.33]],"917939712":[[3940.46,2955.86],[3938.43,2950.24],[3936.57,2944.0],[3934.55,2935.75]],"918014847":[[3986.55,2712.16],[3971.69,2726.08],[3984.51,2745.5]]};
  const frontageKeys=['1919.9,4652.6','1923.7,4675.2','1912.5,4602.7','1907.1,4590.8',
    '1953.7,4584.4','1952.8,4593.6','1954.8,4602.3','1942.6,4505.6','1945.6,4534.1','1899.9,4543.5',
    '1896.5,4519','1905.1,4571.7','1934.6,4422.4','1883.3,4446.1','1885.9,4460.3','1850.5,4344.1',
    '1938,4404.6','1848.3,4403.1','1855.5,4421.7','1957.6,4623.9','1968.1,4695.2','1968,4704.1','1928.6,4703.4','1925.3,4686.1'];

  function keene(world){
    const endpoints=new Map();
    for(const [ring] of window.KEENE_CITY.buildings){
      for(let i=0;i<ring.length;i++){
        const b=ring[i],key=b.join(',');
        if(frontageKeys.includes(key))endpoints.set(key,[ring[(i+ring.length-1)%ring.length],b]);
      }
    }
    return frontageKeys.flatMap((key,i)=>{
      const line=endpoints.get(key);if(!line)return [];
      // The same b->a orientation and normal as the photographed storefront.
      const [a,b]=line,dx=a[0]-b[0],dz=a[1]-b[1],length=Math.hypot(dx,dz);
      const t=i%2?.81:.18,out=.27;
      const x=b[0]+dx*t-dz/length*out,z=b[1]+dz*t+dx/length*out;
      return [{x,z,y:world.elevation(x,z)+.43,yaw:Math.atan2(-dz,dx),site:'Main Street wall '+key,lake:false}];
    });
  }
  function dixville(world){
    const rings=window.ATLAS_SURVEYS.dixville.sites.houses,points=[];
    // Dix House's lakeward porch is 3.6 m deep. The native plinth sits
    // 0.60 m above its wing's foundation; the outer posts stand just inside.
    const a=-.099,c=Math.cos(a),s=Math.sin(a),y=world.elevation(-245,-340)+.20;
    for(const u of [-51,-43,-35,-27,-13,-5,8,17,30,39,47,53]){
      const v=11.37;
      points.push({x:-245+c*u-s*v,z:-340+s*u+c*v,y,yaw:-a,site:'Dix House verandah',lake:false});
    }
    // The boathouse's granite cap is the rendered support beneath its open pavilion.
    const ring=rings[15],house=rings[3];
    for(const [r,isBoathouse] of [[ring,true],[house,false]]){
      if(!r?.length)continue;
      let longest=0,angle=0;
      for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz);if(l>longest){longest=l;angle=Math.atan2(dz,dx);}}
      const c=Math.cos(angle),s=Math.sin(angle),us=r.map(([x,z])=>x*c+z*s),vs=r.map(([x,z])=>-x*s+z*c);
      const u=(Math.min(...us)+Math.max(...us))/2,v=(Math.min(...vs)+Math.max(...vs))/2;
      const cx=c*u-s*v,cz=s*u+c*v,L=Math.max(...us)-Math.min(...us),D=Math.max(...vs)-Math.min(...vs);
      for(const side of [-1,1])for(const f of [-.39,-.12,.22,.39]){
        const x=cx+c*L*f-s*side*(D/2+(isBoathouse?-.31:.31)),z=cz+s*L*f+c*side*(D/2+(isBoathouse?-.31:.31));
        points.push({x,z,y:isBoathouse?world.elevation(cx,cz)+3.45:world.elevation(x,z),yaw:-angle+(side<0?Math.PI:0),lake:false,site:isBoathouse?'Lake Gloriette boathouse cap':'Hale House foundation'});
      }
    }
    return points;
  }
  function snapToSurface(world,T,scene,points){
    if(!scene||!T)return points;
    const meshes=[];
    scene.updateMatrixWorld(true);
    scene.traverse(o=>{
      if(!o.isMesh||o.isInstancedMesh)return;
      const uniforms=o.material?.uniforms;
      if(uniforms?.aerial||o.name?.startsWith('Keene ')||o.name?.startsWith('Dixville '))meshes.push(o);
    });
    const ray=new T.Raycaster(),down=new T.Vector3(0,-1,0);
    for(const p of points){
      const tolerance=world.region==='yosemite'?6:.65;
      ray.set(new T.Vector3(p.x,p.y+tolerance,p.z),down);ray.far=2*tolerance;
      const hits=ray.intersectObjects(meshes,false).filter(h=>Math.abs(h.face.normal.y)>.40);
      if(hits.length){
        const best=hits.reduce((a,b)=>Math.abs(a.point.y-p.y)<Math.abs(b.point.y-p.y)?a:b);
        p.y=best.point.y;p.support=best.object.name||'surveyed terrain';
      }
      // A tiny base embed removes the bright line under the contact edge.
      p.y-=.018;
    }
    return points;
  }

  function harbor(world,T,group){
    const result=[],boards=[],posts=[],segments=[];
    // Cube transforms are combined in two instanced batches, shared by the
    // three physical decks. Only the real map axes determine their bearings.
    const water=world.waterLevel+.16,add=(array,x,y,z,w,h,d,yaw)=>array.push([x,y,z,w,h,d,yaw]);
    for(const [key,path] of Object.entries(piers)){
      const fixed=key==='171960198',width=fixed?3.10:1.95,thick=fixed?.28:.17;
      let highest=water;
      for(let i=1;i<path.length;i++){
        const [x,z]=path[i-1],[u,v]=path[i],n=Math.ceil(Math.hypot(u-x,v-z)/2);
        for(let k=0;k<=n;k++)highest=Math.max(highest,world.elevation(x+(u-x)*k/n,z+(v-z)*k/n));
      }
      const support=(x,z)=>fixed?highest+.22:Math.max(water+.57,world.elevation(x,z)+.19);
      let run=0,next=3.2;
      for(let i=1;i<path.length;i++){
        const [x,z]=path[i-1],[u,v]=path[i],l=Math.hypot(u-x,v-z),cx=(u-x)/l,cz=(v-z)/l,yaw=Math.atan2(-cz,cx);
        const n=Math.ceil(l/.30),spacing=l/n;
        segments.push({x,z,cx,cz,l,width,n,spacing,support});
        for(let k=0;k<n;k++){
          const d=(k+.5)*spacing,px=x+cx*d,pz=z+cz*d,top=support(px,pz);
          add(boards,px,top-thick/2,pz,spacing-.008,thick,width,yaw);
        }
        const count=Math.ceil(l/(fixed?4.3:3.5));
        for(let j=0;j<count;j++){
          const d=l*(j+.5)/count,px=x+cx*d,pz=z+cz*d,top=support(px,pz);
          for(const side of [-1,1]){
            const ox=px-cz*side*(width*.5-.21),oz=pz+cx*side*(width*.5-.21);let bottom;
            if(fixed)bottom=Math.min(world.elevation(ox,oz)-.32,water-.49);
            else bottom=Math.min(water-.15,top-.74);
            const h=top-thick-bottom;
            add(posts,ox,bottom+h/2,oz,fixed?.29:l/count-.13,h,fixed?.29:.36,yaw);
          }
        }
        while(next<run+l-.2){
          const d=next-run,side=result.length%2?1:-1,px=x+cx*d,pz=z+cz*d;
          // Lower face of the dressing touches the actual top of its supporting board.
          const board=Math.min(n-1,Math.floor(d/spacing)),mid=(board+.5)*spacing;
          result.push({x:x+cx*mid-cz*side*(width*.5-.37),z:z+cz*mid+cx*side*(width*.5-.37),y:support(x+cx*mid,z+cz*mid)-.018,
            yaw:yaw+(side<0?Math.PI:0),lake:true,site:'Hamnøy pier '+key});
          next+=fixed?6.6:5.2;
        }
        run+=l;
      }
    }
    if(T&&group&&!group.userData.disposeMappedFieldFixtures){
      const loader=new T.TextureLoader(),url='building-boards.webp',texture=loader.load(window.aerieAssetURL?.(url)||url);
      texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;texture.wrapS=texture.wrapT=T.RepeatWrapping;
      const deck=new T.MeshStandardMaterial({map:texture,color:0xb6a48c,roughness:.83});
      const piles=new T.MeshStandardMaterial({map:texture,color:0x5c5b51,roughness:.79});
      for(const material of [deck,piles])material.onBeforeCompile=shader=>{
        shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\n#ifdef USE_MAP\nvec2 plank=instanceMatrix[3].xz;vMapUv=vMapUv*vec2(.71,.89)+fract(sin(vec2(dot(plank,vec2(.153,.277)),dot(plank,vec2(.439,.347))))*473.891);\n#endif');
      };
      const geometry=new T.BoxGeometry(1,1,1),obj=new T.Object3D(),meshes=[];
      for(const [members,mat,label] of [[boards,deck,'deck planks'],[posts,piles,'foundations and floats']]){
        const mesh=new T.InstancedMesh(geometry,mat,members.length);mesh.name='Hamnøy mapped '+label;
        members.forEach(([x,y,z,w,h,d,yaw],i)=>{obj.position.set(x,y,z);obj.rotation.y=yaw;obj.scale.set(w,h,d);obj.updateMatrix();mesh.setMatrixAt(i,obj.matrix);});
        mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.receiveShadow=true;
        group.add(mesh);meshes.push(mesh);
      }
      const prior=world.clearance||world.height;
      const withDocks=(x,z)=>{
        let top=prior(x,z);
        if(x<3931||x>4030||z<2709||z>2995)return top;
        for(const s of segments){
          const dx=x-s.x,dz=z-s.z,along=dx*s.cx+dz*s.cz;
          if(along<0||along>s.l||Math.abs(dx*s.cz-dz*s.cx)>s.width/2)continue;
          const station=(Math.min(s.n-1,Math.floor(along/s.spacing))+.5)*s.spacing;
          top=Math.max(top,s.support(s.x+s.cx*station,s.z+s.cz*station));
        }
        return top;
      };
      world.clearance=withDocks;
      group.userData.disposeMappedFieldFixtures=()=>{if(world.clearance===withDocks)world.clearance=prior;for(const mesh of meshes){mesh.removeFromParent();mesh.dispose();}geometry.dispose();deck.dispose();piles.dispose();texture.dispose();};
    }
    return result;
  }
  window.aerieMappedFieldFixtures=(world,T,root)=>{
    switch(world.region){
      case 'surry':return snapToSurface(world,T,root?.parent,keene(world));
      case 'dixville':return snapToSurface(world,T,root?.parent,dixville(world));
      case 'yosemite':return snapToSurface(world,T,root?.parent,trails.map(([x,z,yaw],i)=>({x,z,yaw,y:world.elevation(x,z),lake:false,
        site:i<16?'Upper Yosemite Fall switchbacks':i<24?'Lower Yosemite Fall east approach':'Lower Yosemite Fall west approach'})));
      case 'lofoten':return harbor(world,T,root);
      default:return [];
    }
  };
})();
