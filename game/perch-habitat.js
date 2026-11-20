// Landable rock shelves and exposed limbs share their geometry with flight contact.
window.makePerchHabitat=function makePerchHabitat(T,scene,world,region){
  'use strict';
  const tile=68, range=225, capacity=14, tau=Math.PI*2;
  const floor=world.clearance||world.height, ground=world.elevation||world.height;
  const bounds=world.bounds||{minX:-3900,maxX:3900,minZ:-3900,maxZ:3900};
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  function noise(x,z,n=0){
    let h=Math.imul(x^0x27d4eb2d,0x85ebca6b)^Math.imul(z^n,0xc2b2ae35);
    h=Math.imul(h^h>>>16,0x7feb352d);
    return ((h^h>>>15)>>>0)/4294967296;
  }
  const key=(i,j)=>i+'|'+j;
  const boundsOK=(x,z,pad=0)=>x>bounds.minX+pad&&x<bounds.maxX-pad&&z>bounds.minZ+pad&&z<bounds.maxZ-pad;
  const loader=new T.TextureLoader();
  function texture(name,linear=false){
    const image=loader.load(name);image.wrapS=image.wrapT=T.RepeatWrapping;
    image.colorSpace=linear?T.NoColorSpace:T.SRGBColorSpace;image.anisotropy=8;return image;
  }
  const dryRock=region==='bryce'||region==='canyon';
  const bark=new T.MeshStandardMaterial({map:texture('shore-bark.webp'),roughness:.92,vertexColors:true});
  const rock=new T.MeshStandardMaterial({map:texture(dryRock?'atlas-bedded-rock.webp':'atlas-jointed-rock.webp'),
    normalMap:texture(dryRock?'cliff-strata-normal.jpg':'granite-normal.jpg',true),normalScale:new T.Vector2(.30,.30),roughness:.92,vertexColors:true});
  const local=new T.Group();local.name='Perch habitat';scene.add(local);
  const slots=Array.from({length:capacity},()=>{
    const mesh=new T.Mesh(new T.BufferGeometry(),rock);mesh.visible=false;local.add(mesh);return mesh;
  });
  const ring=new T.BufferGeometry().setFromPoints(Array.from({length:48},(_,i)=>{
    const angle=tau*i/48;return new T.Vector3(Math.cos(angle),0,Math.sin(angle));
  }));
  const halo=new T.LineLoop(ring,new T.LineBasicMaterial({color:0xffdc89,transparent:true,opacity:.82,depthWrite:false}));
  halo.name='Selected perch';halo.visible=false;local.add(halo);

  const treeTiles=new Map(),cached=new Map(),routeSites=new Map();
  for(const tree of world.trees||[]){
    if(!(tree.height>=4.8&&tree.width>1&&Number.isFinite(tree.y)))continue;
    const id=key(Math.floor(tree.x/tile),Math.floor(tree.z/tile));
    let group=treeTiles.get(id);if(!group)treeTiles.set(id,group=[]);
    group.push(tree);
  }
  const loops=world.shorelines||(world.lakePolygon?[world.lakePolygon]:[]);
  const shores=loops.filter(loop=>loop.length>2).map(loop=>{
    const polygon=loop.map(p=>[p.x??p[0],p.z??p[1]]);
    const box=[Infinity,Infinity,-Infinity,-Infinity];
    for(const [x,z] of polygon){box[0]=Math.min(box[0],x);box[1]=Math.min(box[1],z);box[2]=Math.max(box[2],x);box[3]=Math.max(box[3],z);}
    return {polygon,box};
  });
  function inside(x,z,{polygon,box}){
    if(x<box[0]||x>box[2]||z<box[1]||z>box[3])return false;
    let hit=false;
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
      const [ax,az]=polygon[j],[bx,bz]=polygon[i];
      if((az>z)!==(bz>z)&&x<(bx-ax)*(z-az)/(bz-az)+ax)hit=!hit;
    }
    return hit;
  }
  // The survey may resolve a finer coastal shelf than its rendered mesh. Seat
  // dressed rocks on the same grid triangles the player sees in the foreground.
  const grids=[];
  scene.traverse(obj=>{
    const u=obj.material?.uniforms,p=obj.geometry?.attributes?.position;
    if(!p||!(u?.surveyNormals||u?.localPhoto||u?.wetMask&&u?.rockScan||u?.flow&&u?.photo))return;
    let row=1;while(row<p.count&&p.getZ(row)===p.getZ(0))row++;
    if(row<2||row>=p.count||p.count%row)return;
    const left=p.getX(0),top=p.getZ(0),right=p.getX(row-1),bottom=p.getZ(p.count-1);
    if(right<=left||bottom<=top||Math.abs(p.getX(row)-left)>.01)return;
    grids.push({p,row,rows:p.count/row,left,right,top,bottom});
  });
  let previousGrid;
  const covers=(g,x,z)=>g&&x>=g.left&&x<g.right&&z>=g.top&&z<g.bottom;
  function surface(x,z){
    const g=covers(previousGrid,x,z)?previousGrid:grids.find(grid=>covers(grid,x,z));
    if(!g)return ground(x,z);
    previousGrid=g;
    const u=(x-g.left)/(g.right-g.left)*(g.row-1),v=(z-g.top)/(g.bottom-g.top)*(g.rows-1);
    const i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j,k=i+j*g.row,p=g.p;
    if(a+b<1)return p.getY(k)*(1-a-b)+p.getY(k+1)*a+p.getY(k+g.row)*b;
    return p.getY(k+g.row+1)*(a+b-1)+p.getY(k+g.row)*(1-a)+p.getY(k+1)*(1-b);
  }
  let flowPixels,flowTexture,flowWidth=768,flowHeight=768;
  if(region==='canyon')scene.traverse(obj=>{flowTexture=flowTexture||obj.material?.uniforms?.flow?.value;});
  function wet(x,z,y){
    if(world.channelWater&&Number.isFinite(world.channelWater(x,z)))return true;
    if(flowTexture){
      if(!flowPixels&&flowTexture.image?.width){
        if(flowTexture.image.data){
          flowWidth=flowTexture.image.width;flowHeight=flowTexture.image.height;
          flowPixels=flowTexture.image.data;
        }else{
          const canvas=document.createElement('canvas');canvas.width=flowWidth;canvas.height=flowHeight;
          const context=canvas.getContext('2d',{willReadFrequently:true});
          context.drawImage(flowTexture.image,0,0,flowWidth,flowHeight);
          flowPixels=context.getImageData(0,0,flowWidth,flowHeight).data;
        }
      }
      if(!flowPixels)return true;
      const ix=clamp(Math.floor(flowWidth*(.5+x/6400)),0,flowWidth-1),iz=clamp(Math.floor(flowHeight*(.5+z/6400)),0,flowHeight-1);
      if(flowPixels[4*(iz*flowWidth+ix)]>18)return true;
    }
    if(world.height(x,z)>y+.04)return true;
    if(!Number.isFinite(world.waterLevel)||y>world.waterLevel+.38)return false;
    if(!shores.length)return y<world.waterLevel+.18;
    return inside(x,z,shores[0])&&!shores.slice(1).some(island=>inside(x,z,island));
  }

  // Evaluate both wingtips along the final approach. Its reciprocal is the
  // unobstructed takeoff corridor and stays on the outside of a tree's crown.
  function corridor(x,y,z,dx,dz){
    if(!boundsOK(x+dx*24,z+dz*24,2))return null;
    let slope=.23;
    for(const d of [.35,1.6,3.4,6.5,10,15,21,25]){
      const wing=d<1?.30:d<3?.72:1.25;
      for(const w of [-wing,0,wing]){
        const px=x+dx*d-dz*w,pz=z+dz*d+dx*w;
        const h=Math.max(floor(px,pz),surface(px,pz));
        if(!Number.isFinite(h))return null;
        slope=Math.max(slope,(h+.25-y)/d);
      }
      if(slope>.78)return null;
    }
    return slope;
  }
  const atDir=(p,d,up)=>({x:p.x+p.direction.x*d,y:p.y+up,z:p.z+p.direction.z*d});
  function finish(p,dx,dz,slope){
    p.direction={x:dx,z:dz};p.yaw=Math.atan2(dx,dz);
    p.approach=atDir(p,21,21*slope+1.55);p.exit=atDir(p,25,25*slope+2.8);
    return p;
  }
  function orient(seed,hint,attempt){
    const base=hint?Math.atan2(hint.z,hint.x):tau*seed;
    const order=[0,1,-1,2,-2,3,-3,4];
    for(const k of order){
      const a=base+k*Math.PI/4;
      const result=attempt(Math.cos(a),Math.sin(a));if(result)return result;
    }
    return null;
  }
  function branchSite(tree,hint){
    const {x,y,z,width,height}=tree;
    const seed=noise(Math.round(x*4),Math.round(z*4),17);
    const length=Math.max(2.15,width*.5+1.30),level=height*(.64+.13*seed);
    const id='branch:'+x.toFixed(3)+','+z.toFixed(3);
    return orient(seed,hint,(dx,dz)=>{
      const px=x+dx*length,pz=z+dz*length,top=y+level;
      if(!boundsOK(px,pz,3)||floor(px,pz)>top-.32)return null;
      const slope=corridor(px,top,pz,dx,dz);if(slope===null)return null;
      return finish({id,type:'branch',label:'Exposed tree limb',x:px,y:top,z:pz,seed,length,tree,root:{x,y,z}},dx,dz,slope);
    });
  }
  function rockSite(x,z,hint,route=false){
    if(!boundsOK(x,z,5))return null;
    // Roof heights are in clearance. Exclude the paved downtown core as well.
    if(region==='surry'&&x>1785&&x<2200&&z>4240&&z<4860)return null;
    const surveyed=ground(x,z),y=surface(x,z);
    if(!Number.isFinite(y)||wet(x,z,surveyed)||floor(x,z)>surveyed+.38||Math.abs(y-surveyed)>1.6)return null;
    const seed=noise(Math.round(x*5),Math.round(z*5),59);
    const radial=2.15+seed*1.12;
    let highest=y,lowest=y;
    for(let i=0;i<10;i++){
      const a=tau*i/10+seed,px=x+Math.cos(a)*radial,pz=z+Math.sin(a)*radial;
      const scan=ground(px,pz),h=surface(px,pz);
      if(!Number.isFinite(h)||wet(px,pz,scan)||floor(px,pz)>scan+.52)return null;
      highest=Math.max(highest,h);lowest=Math.min(lowest,h);
    }
    if(highest-lowest>(route?6.2:4.1))return null;
    const height=Math.max(y+.9+seed*.62,highest+.22,surveyed+.30),id='ledge:'+x.toFixed(2)+','+z.toFixed(2);
    const fallX=ground(x-2,z)-ground(x+2,z),fallZ=ground(x,z-2)-ground(x,z+2);
    if(!hint&&Math.hypot(fallX,fallZ)>.36)hint={x:fallX,z:fallZ};
    return orient(seed,hint,(dx,dz)=>{
      const slope=corridor(x,height,z,dx,dz);if(slope===null)return null;
      return finish({id,type:'rock',label:dryRock?'Sandstone ledge':'Rock ledge',x,y:height,z,seed,radius:radial,root:{x,y,z}},dx,dz,slope);
    });
  }
  function tileSites(i,j){
    const id=key(i,j);
    if(cached.has(id))return cached.get(id);
    const result=[],trees=treeTiles.get(id);
    if(trees){
      const first=Math.floor(noise(i,j,296)*trees.length);
      for(let k=0;k<Math.min(4,trees.length);k++){
        const t=trees[(first+Math.floor(k*trees.length/Math.min(4,trees.length)))%trees.length];
        const p=branchSite(t);if(p){result.push(p);break;}
      }
    }
    for(let k=0;k<2;k++){
      const x=(i+.12+.76*noise(i,j,127+k))*tile,z=(j+.12+.76*noise(i,j,315+k))*tile;
      const p=rockSite(x,z);if(p){result.push(p);break;}
    }
    if(cached.size>=260)cached.delete(cached.keys().next().value);
    cached.set(id,result);return result;
  }
  let selected=null,lastState,lastX=Infinity,lastZ=Infinity,near=[];
  function gather(s){
    const i=Math.floor(s.x/tile),j=Math.floor(s.z/tile),list=[];
    for(let v=-3;v<=3;v++)for(let u=-3;u<=3;u++){
      for(const p of tileSites(i+u,j+v))if(Math.hypot(p.x-s.x,p.z-s.z)<range)list.push(p);
    }
    for(const q of routeSites.values())if(Math.hypot(q.x-s.x,q.z-s.z)<range){
      const i=list.findIndex(p=>p.id===q.id);
      if(i<0)list.push(q);else list[i]=q;
    }
    list.sort((a,b)=>Math.hypot(a.x-s.x,a.z-s.z)-Math.hypot(b.x-s.x,b.z-s.z));
    return list;
  }
  function choices(s){
    update(s);
    const fx=-Math.sin(s.yaw||0),fz=-Math.cos(s.yaw||0);
    const score=p=>{
      const dx=p.x-s.x,dz=p.z-s.z,d=Math.max(1,Math.hypot(dx,dz));
      const abeam=(fx*dx+fz*dz)/d;
      const facing=-(p.direction.x*dx+p.direction.z*dz)/d;
      return d+Math.abs(s.y-p.y)*.28+(1-abeam)*46+(1-facing)*19;
    };
    let candidates=near;
    if(!candidates.length){
      // Open-water launches can be well offshore. Only do the wider shoreline
      // search when the player asks, and promote the chosen site on selection.
      const found=new Map(),visited=new Set();
      for(const radius of [265,380,540,760,1050,1450,2020,2900]){
        for(let k=0;k<20;k++){
          const a=tau*(k/20+.013),i=Math.floor((s.x+Math.cos(a)*radius)/tile),j=Math.floor((s.z+Math.sin(a)*radius)/tile);
          const id=key(i,j);if(visited.has(id))continue;visited.add(id);
          const x=(i+.5)*tile,z=(j+.5)*tile;
          if(!boundsOK(x,z,4)||(!treeTiles.has(id)&&wet(x,z,ground(x,z))))continue;
          for(const p of tileSites(i,j))found.set(p.id,p);
        }
        if(found.size)break;
      }
      candidates=[...found.values()];
    }
    const ranked=[...candidates].sort((a,b)=>score(a)-score(b));
    const seen=ranked.filter(p=>{
      for(const t of [.18,.35,.52,.68,.82,.92]){
        const x=s.x+(p.x-s.x)*t,z=s.z+(p.z-s.z)*t;
        if(floor(x,z)>s.y+(p.y+.55-s.y)*t)return false;
      }
      return true;
    });
    const list=seen.length?seen:ranked;
    if(list.length<2)return list;
    const other=list.find(p=>p.type!==list[0].type);
    return [list[0],...(other?[other]:[]),...list.filter(p=>p!==list[0]&&p!==other)].slice(0,8);
  }

  function resolveRoute(input){
    const spec=input?.perch||input;if(!spec||!Number.isFinite(spec.x)||!Number.isFinite(spec.z))return null;
    const id=spec.kind+':'+spec.x.toFixed(2)+','+spec.z.toFixed(2);
    if(routeSites.has(id))return routeSites.get(id);
    let p;
    if(spec.kind==='branch'||spec.type==='branch'){
      const trees=[],i=Math.floor(spec.x/tile),j=Math.floor(spec.z/tile);
      if(spec.tree)trees.push(spec.tree);
      for(let v=-1;v<=1;v++)for(let u=-1;u<=1;u++)trees.push(...(treeTiles.get(key(i+u,j+v))||[]));
      trees.sort((a,b)=>Math.hypot(a.x-spec.x,a.z-spec.z)-Math.hypot(b.x-spec.x,b.z-spec.z));
      for(const tree of trees){
        if(Math.hypot(tree.x-spec.x,tree.z-spec.z)>65)break;
        if((p=branchSite(tree,spec.direction)))break;
      }
    }else{
      p=rockSite(spec.x,spec.z,spec.direction,true);
      for(const r of [4,10,22,40,70,105]){
        if(p)break;
        for(let k=0;k<12;k++){
          const a=tau*k/12;
          if((p=rockSite(spec.x+r*Math.cos(a),spec.z+r*Math.sin(a),spec.direction,true)))break;
        }
      }
    }
    if(!p)return null;
    p.label=spec.label||p.label;p.route=true;
    if(routeSites.size>=24)routeSites.delete(routeSites.keys().next().value);
    routeSites.set(id,p);return p;
  }

  // The bark follows the length of each tapered limb. The last, gently curved
  // crosspiece has enough horizontal bearing surface for both feet together.
  function build(p){
    const pos=[],uv=[],color=[],index=[];
    function vertex(x,y,z,u,v,tint){pos.push(x,y,z);uv.push(u,v);color.push(...tint);return pos.length/3-1;}
    function tube(points,radii,baseColor,sides=12){
      const path=points.map(q=>new T.Vector3(...q));let run=0;
      const frames=[];
      for(let k=0;k<path.length;k++){
        if(k)run+=path[k].distanceTo(path[k-1]);
        const axis=path[Math.min(k+1,path.length-1)].clone().sub(path[Math.max(0,k-1)]).normalize();
        const right=new T.Vector3(0,1,0).cross(axis);
        if(right.lengthSq()<.0001)right.set(1,0,0);else right.normalize();
        const up=axis.clone().cross(right).normalize(),ring=[];
        for(let i=0;i<=sides;i++){
          const a=tau*i/sides;
          const radius=radii[k]*(1+.036*Math.sin(3*a+p.seed*4)+.025*Math.cos(5*a-k*.56));
          const q=path[k].clone().addScaledVector(right,Math.cos(a)*radius).addScaledVector(up,Math.sin(a)*radius);
          const shade=.95+.05*Math.sin(a*3+k*.22);
          ring.push(vertex(q.x,q.y,q.z,(i/sides)*Math.max(.44,radii[0]*7),run*.78,baseColor.map(c=>c*shade)));
        }
        if(k){
          const prev=frames[k-1];for(let i=0;i<sides;i++)index.push(prev[i],prev[i+1],ring[i],ring[i],prev[i+1],ring[i+1]);
        }
        frames.push(ring);
      }
      for(let i=1;i<sides-1;i++)index.push(frames.at(-1)[0],frames.at(-1)[i],frames.at(-1)[i+1]);
    }
    if(p.type==='branch'){
      const len=p.length,h=p.tree.height,side=p.seed>.5?1:-1;
      const baseRadius=clamp(h*.017,.16,.46),r=.083;
      const c=[.82,.79,.72],weathered=[.94,.88,.77];
      tube([[0,-Math.min(h*.15,2.9),-len],[.05,-1.07,-len*.68],[-.12,-.39,-len*.27],[-.52,-.18,-.49],[-.66,-.12,-.13],[-.49,-r,-.025],[-.18,-r,0],[.19,-r,0],[.54,-r,.004],[.82,-.05,.04],[1.01,.10,.10]],
        [baseRadius,baseRadius*.80,baseRadius*.63,.144,.123,.103,.091,r,.078,.047,.011],c,16);
      tube([[-.18,-.45,-len*.28],[-.52*side,-.02,-len*.24],[-.91*side,.32,-len*.22],[-1.1*side,.50,-len*.21]],[.11,.078,.038,.01],weathered);
      tube([[-.91*side,.32,-len*.22],[-1.20*side,.36,-len*.26],[-1.38*side,.52,-len*.29]],[.034,.027,.007],c,8);
      tube([[.70,-.06,.03],[.91,-.18,.005],[1.25,-.14,-.04]],[.052,.031,.008],weathered,8);
    }else{
      // A level, irregular crest sits inside a stepped, jointed boulder. The
      // bottom of every individual face extends under its sampled ground point.
      const n=14,angle=p.seed*tau,levels=[1.1,1,.85,.51,.29],rings=[];
      const grey=dryRock?[.92,.78,.67]:[.83,.86,.83],bedding=.19+.25*p.seed;
      for(let j=0;j<levels.length;j++){
        const points=[];
        for(let i=0;i<n;i++){
          const a=tau*i/n,rad=p.radius*levels[j]*(.82+.23*noise(i,Math.round(p.seed*99),370));
          const x=Math.cos(a)*rad*1.30,z=Math.sin(a)*rad*.87;
          const wx=p.x+x*p.direction.z+z*p.direction.x,wz=p.z-x*p.direction.x+z*p.direction.z;
          const bed=surface(wx,wz)-p.y;
          const ny=j===0?Math.min(bed-.37,-.78):j===1?Math.min(-.49,bed*.29-.49):j===2?-.16-.33*noise(i,8,545):j===3?-.035-.095*noise(i,0,297):0;
          points.push([x,ny,z]);
        }
        rings.push(points);
      }
      function facet(a,b,c,top,shade){
        const off=pos.length/3;
        const tint=grey.map(v=>v*shade);
        for(const [x,y,z] of [a,b,c]){
          const u=top?(x*Math.cos(angle)-z*Math.sin(angle))*.7:(x*.81-z*.56)*.65;
          const v=top?(x*Math.sin(angle)+z*Math.cos(angle))*.7:y*.86+z*bedding*.20;
          vertex(x,y,z,u,v,tint);
        }
        index.push(off,off+1,off+2);
      }
      for(let j=0;j<rings.length-1;j++)for(let i=0;i<n;i++){
        const k=(i+1)%n,[a,b,c,d]=[rings[j][i],rings[j][k],rings[j+1][k],rings[j+1][i]];
        const shade=.75+.19*j/4+.10*noise(i,j,121);
        facet(a,d,b,j>=2,shade);facet(b,d,c,j>=2,shade+.011);
      }
      for(let i=0;i<n;i++)facet([0,0,0],rings.at(-1)[(i+1)%n],rings.at(-1)[i],true,.98);
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
    g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setAttribute('color',new T.Float32BufferAttribute(color,3));
    g.setIndex(index);g.computeVertexNormals();g.computeBoundingSphere();g.computeBoundingBox();
    // Cache each upward triangle's projected barycentric transform once. This
    // includes the sloping ledge edges and limb forks during ordinary flight.
    const surfaces=[];
    for(let i=0;i<index.length;i+=3){
      const a=3*index[i],b=3*index[i+1],c=3*index[i+2];
      const ax=pos[a]-pos[c],az=pos[a+2]-pos[c+2],bx=pos[b]-pos[c],bz=pos[b+2]-pos[c+2];
      const determinant=ax*bz-az*bx;
      if(determinant>=-.000001)continue;
      surfaces.push([pos[c],pos[c+2],bz/determinant,-bx/determinant,-az/determinant,ax/determinant,
        pos[c+1],pos[a+1]-pos[c+1],pos[b+1]-pos[c+1]]);
    }
    g.userData.topSurfaces=surfaces;return g;
  }

  function place(sites){
    const need=new Map(sites.map(p=>[p.id,p]));
    for(const mesh of slots){
      if(!need.has(mesh.userData.site?.id)){mesh.visible=false;mesh.userData.site=null;}
    }
    for(const p of need.values()){
      let mesh=slots.find(m=>m.userData.site?.id===p.id);
      if(mesh&&mesh.position.x===p.x&&mesh.position.z===p.z&&mesh.rotation.y===p.yaw)continue;
      mesh=mesh||slots.find(m=>!m.visible);if(!mesh)break;
      mesh.geometry.dispose();mesh.geometry=build(p);mesh.material=p.type==='branch'?bark:rock;
      mesh.position.set(p.x,p.y,p.z);mesh.rotation.y=p.yaw;mesh.name=p.label;
      mesh.userData.site=p;mesh.visible=true;mesh.castShadow=true;mesh.receiveShadow=true;
    }
  }
  function update(s){
    if(!s||!Number.isFinite(s.x)||!Number.isFinite(s.z))return;
    lastState=s;
    if(Math.hypot(s.x-lastX,s.z-lastZ)>15){
      lastX=s.x;lastZ=s.z;near=gather(s);
      const list=selected?[selected,...near.filter(p=>p.id!==selected.id)]:near;
      place(list.slice(0,capacity));
    }
    if(selected){
      const d=Math.hypot(selected.x-s.x,selected.y-s.y,selected.z-s.z);
      halo.position.set(selected.x,selected.y+.055,selected.z);
      halo.scale.setScalar(clamp(.36+d*.014,.38,3.2));halo.visible=d>1.5;
    }
  }
  function select(site){
    selected=site||null;halo.visible=!!site;lastX=Infinity;
    if(lastState)update(lastState);else if(site){place([site]);halo.position.set(site.x,site.y+.055,site.z);}
    return selected;
  }
  const raycaster=new T.Raycaster(),projected=new T.Vector3(),eye=new T.Vector3();
  function unobstructed(to){
    const dx=to.x-eye.x,dy=to.y-eye.y,dz=to.z-eye.z;
    const distance=Math.hypot(dx,dz),steps=clamp(Math.ceil(distance/4),2,125);
    for(let i=1;i<steps;i++){
      const t=i/steps,x=eye.x+dx*t,z=eye.z+dz*t;
      if(Math.max(floor(x,z),surface(x,z))>eye.y+dy*t+.15)return false;
    }
    return true;
  }
  function pick(camera,ndc,size){
    if(!camera||!ndc||!Number.isFinite(ndc.x)||!Number.isFinite(ndc.y))return null;
    camera.updateMatrixWorld();local.updateMatrixWorld(true);camera.getWorldPosition(eye);
    const visible=slots.filter(mesh=>mesh.visible);
    raycaster.setFromCamera(ndc,camera);
    for(const hit of raycaster.intersectObjects(visible,false)){
      if(unobstructed(hit.point))return hit.object.userData.site;
    }
    const w=size?.width||size?.x||window.innerWidth||1200,h=size?.height||size?.y||window.innerHeight||800;
    let closest=13,found=null;
    for(const mesh of visible){
      const p=mesh.userData.site;projected.set(p.x,p.y+.08,p.z).project(camera);
      if(projected.z< -1||projected.z>1)continue;
      const pixels=Math.hypot((projected.x-ndc.x)*w*.5,(projected.y-ndc.y)*h*.5);
      if(pixels<closest&&unobstructed(p)){closest=pixels;found=p;}
    }
    return found;
  }
  function clearance(x,z){
    let highest=-Infinity;
    for(const mesh of slots){
      const p=mesh.userData.site;if(!p)continue;
      const dx=x-p.x,dz=z-p.z,u=dx*p.direction.z-dz*p.direction.x,v=dx*p.direction.x+dz*p.direction.z;
      const box=mesh.geometry.boundingBox;
      if(u<box.min.x||u>box.max.x||v<box.min.z||v>box.max.z)continue;
      for(const t of mesh.geometry.userData.topSurfaces){
        const du=u-t[0],dv=v-t[1],a=du*t[2]+dv*t[3],b=du*t[4]+dv*t[5];
        if(a>=-.000001&&b>=-.000001&&a+b<=1.000001)highest=Math.max(highest,p.y+t[6]+a*t[7]+b*t[8]);
      }
    }
    return highest;
  }
  function dispose(){
    scene.remove(local);
    for(const m of slots)m.geometry.dispose();ring.dispose();halo.material.dispose();
    for(const m of [bark,rock]){m.map.dispose();m.normalMap?.dispose();m.dispose();}
    cached.clear();routeSites.clear();treeTiles.clear();near=[];
  }
  function nearestTree(x,z,reach){
    let best=null,limit=reach*reach;
    for(let j=Math.floor((z-reach)/tile);j<=Math.floor((z+reach)/tile);j++){
      for(let i=Math.floor((x-reach)/tile);i<=Math.floor((x+reach)/tile);i++){
        for(const tree of treeTiles.get(key(i,j))||[]){
          const d=(tree.x-x)**2+(tree.z-z)**2;
          if(d<limit){limit=d;best=tree;}
        }
      }
    }
    return best;
  }
  return {update,choices,pick,select,resolveRoute,clearance,dispose,surface,wet,nearestTree};
};
