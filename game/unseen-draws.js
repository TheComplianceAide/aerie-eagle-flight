// A draw that cannot put a pixel on its target still costs the phone: Three
// sorts it, binds its program, textures and buffers, and the GPU transforms
// every triangle before throwing them away. Measured with occlusion queries,
// about half the draws of the direct view and up to three quarters of the
// draws of a lake mirror produced no pixel at all, in every world.
//
// Each rule below leaves out draws that are provably empty, so the picture is
// the same to the last bit. Nothing here changes when or where scenery appears.
//
//   - Far conifer stands. Their own vertex shader moves every tree outside
//     clip space once the eagle is beyond that tree's reach. When the eagle is
//     beyond the reach of every tree in a stand, the stand is not submitted.
//   - Instanced models that opted out of Three's culling because their
//     instances move (nearby trees, animals). A box is measured around the
//     instances themselves and tested against each camera, so a set that lies
//     wholly outside a view, most often the lake mirror's, is left out of it.
//   - Ground tiles. Three culls each by its bounding sphere, which a wide flat
//     tile barely fills. The tile's own box is tested as well, for every camera.
//   - The lake mirror clips everything under the water plane. Ground that lies
//     wholly under it (the lake bed) is left out of that mirror pass, and so is
//     the eagle when its reflection falls outside the mirror.
//   - The mirror itself is not redrawn while no part of its lake is in view.
window.skipUnseenDraws=function skipUnseenDraws(T,renderer,scene,world,eagle){
  if(window.aerieUnseenDraws===false)return null;
  const counts={stands:0,standsHidden:0,loose:0,looseHidden:0,looseHiddenInMirror:0,ground:0,groundHidden:0,groundHiddenInMirror:0,bed:0,bedHidden:0,mirrorsSkipped:0};
  // Everything this module is hiding at the moment, for checks and tools.
  const hidden=new Map();
  const identity=new T.Matrix4(),projection=new T.Matrix4(),frustum=new T.Frustum(),sphere=new T.Sphere();
  // The rule that hid each one is kept beside it, for the check in tools/check_unseen_draws.mjs.
  const hide=(mesh,rule)=>{mesh.visible=false;hidden.set(mesh,rule);},show=mesh=>{mesh.visible=true;hidden.delete(mesh);};
  const flat=source=>source.replace(/\s+/g,'');

  // Far conifer stands.
  const collapse='dot(delta,delta)>reachSquared){gl_Position=vec4(2.,2.,2.,1.);return;}';
  const stands=[];
  scene.traverse(o=>{
    const g=o.geometry,m=o.material;
    if(!o.isMesh||!g?.isInstancedBufferGeometry||Array.isArray(m)||!m?.isShaderMaterial)return;
    const reach=g.attributes.reachSquared,roots=g.attributes.rootPosition,observer=m.uniforms?.observer?.value;
    if(!reach||!roots||!observer?.isVector3||roots.count!==reach.count||!roots.count)return;
    // Only where the shader really does erase a tree past its reach, measured from this same point.
    const source=flat(m.vertexShader);
    if(!source.includes(collapse)||!source.includes('vec3delta=observer-rootPosition;'))return;
    // The stand is drawn in world space: its roots are compared with the observer as they are stored.
    o.updateWorldMatrix(true,false);
    if(!o.matrixWorld.equals(identity))return;
    const centre=new T.Vector3();
    for(let i=0;i<roots.count;i++){centre.x+=roots.getX(i);centre.y+=roots.getY(i);centre.z+=roots.getZ(i);}
    centre.multiplyScalar(1/roots.count);
    let radius=0,far=0;
    for(let i=0;i<roots.count;i++){
      radius=Math.max(radius,Math.hypot(roots.getX(i)-centre.x,roots.getY(i)-centre.y,roots.getZ(i)-centre.z));
      far=Math.max(far,reach.getX(i));
    }
    // A metre of slack covers single-precision arithmetic in the shader.
    stands.push({mesh:o,centre,limit:(radius+Math.sqrt(far)+1)**2,observer,hidden:false});
  });
  counts.stands=stands.length;
  function updateStands(){
    let n=0;
    for(const s of stands){
      const beyond=s.centre.distanceToSquared(s.observer)>s.limit;
      // Never show something another part of the game has hidden.
      if(beyond){if(s.mesh.visible){hide(s.mesh,'stand beyond its reach');s.hidden=true;}}
      else if(s.hidden){show(s.mesh);s.hidden=false;}
      if(s.hidden)n++;
    }
    counts.standsHidden=n;
  }

  // Instanced models whose instances move. Shadow casters stay in every pass.
  const loose=[],listed=new WeakSet();
  function findLoose(){
    scene.traverse(o=>{
      if(!o.isInstancedMesh||listed.has(o))return;
      listed.add(o);
      if(o.frustumCulled||o.castShadow||!o.instanceMatrix||Array.isArray(o.material)||!o.geometry?.attributes.position)return;
      if(o.material.isShaderMaterial&&!o.material.vertexShader.includes('instanceMatrix'))return;
      loose.push({mesh:o,box:new T.Box3(),radii:new Float32Array(0),known:false,version:-1,count:-1,array:null});
    });
    counts.loose=loose.length;
  }
  findLoose();
  function measure(item){
    const mesh=item.mesh,matrix=mesh.instanceMatrix,e=matrix.array,n=mesh.count,box=item.box;
    item.version=matrix.version;item.count=n;item.array=e;item.known=false;
    if(!n)return;
    const g=mesh.geometry;if(!g.boundingSphere)g.computeBoundingSphere();
    const own=g.boundingSphere,reach=own.center.length()+own.radius;
    if(item.radii.length<n)item.radii=new Float32Array(matrix.count);
    const radii=item.radii;
    let x0=Infinity,y0=Infinity,z0=Infinity,x1=-Infinity,y1=-Infinity,z1=-Infinity;
    for(let i=0;i<n;i++){
      const k=i*16,x=e[k+12],y=e[k+13],z=e[k+14];
      const scale=Math.sqrt(Math.max(e[k]*e[k]+e[k+1]*e[k+1]+e[k+2]*e[k+2],e[k+4]*e[k+4]+e[k+5]*e[k+5]+e[k+6]*e[k+6],e[k+8]*e[k+8]+e[k+9]*e[k+9]+e[k+10]*e[k+10]));
      // Branches sway and animals pose in the vertex shader: half a model more and six metres over.
      const r=radii[i]=reach*scale*1.5+6;
      if(x-r<x0)x0=x-r;if(x+r>x1)x1=x+r;if(y-r<y0)y0=y-r;if(y+r>y1)y1=y+r;if(z-r<z0)z0=z-r;if(z+r>z1)z1=z+r;
    }
    if(!isFinite(x0+y0+z0+x1+y1+z1))return;
    box.min.set(x0,y0,z0);box.max.set(x1,y1,z1);item.known=true;
  }
  // Does any instance reach into the current view? The box settles most cases; a ring of trees
  // around the eagle fills little of its box, so each tree is then asked in turn.
  function reaches(item){
    if(!frustum.intersectsBox(item.box))return false;
    const e=item.array,radii=item.radii,planes=frustum.planes;
    for(let i=0;i<item.count;i++){
      const k=i*16,x=e[k+12],y=e[k+13],z=e[k+14],r=-radii[i];
      let inside=true;
      for(let p=0;p<6;p++){const plane=planes[p],n=plane.normal;if(n.x*x+n.y*y+n.z*z+plane.constant<r){inside=false;break;}}
      if(inside)return true;
    }
    return false;
  }

  // Lakes with a planar mirror.
  const lakes=[];
  scene.traverse(o=>{
    const mirror=o.material?.uniforms?.mirrorSampler?.value;
    if(!o.isWater||!mirror?.isTexture||!o.geometry?.attributes.position)return;
    o.updateWorldMatrix(true,false);
    // A level surface only.
    const up=new T.Vector3(0,0,1).transformDirection(o.matrixWorld);
    if(up.y<.99999)return;
    lakes.push({mesh:o,mirror,level:new T.Vector3().setFromMatrixPosition(o.matrixWorld).y,bed:new Set(),cover:null,seen:true});
  });
  // Where each lake's surface lies, as a coarse grid of boxes, to ask whether any of it is in view.
  function coverage(lake){
    const g=lake.mesh.geometry,position=g.attributes.position,index=g.index,world=lake.mesh.matrixWorld;
    const count=index?index.count:position.count,p=new T.Vector3(),xs=new Float64Array(position.count),zs=new Float64Array(position.count);
    let x0=Infinity,z0=Infinity,x1=-Infinity,z1=-Infinity;
    for(let i=0;i<position.count;i++){
      p.fromBufferAttribute(position,i).applyMatrix4(world);xs[i]=p.x;zs[i]=p.z;
      x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);z0=Math.min(z0,p.z);z1=Math.max(z1,p.z);
    }
    if(!(x1>x0)||!(z1>z0)||count<3)return null;
    const n=64,block=8,w=(x1-x0)/n,h=(z1-z0)/n,cells=new Uint8Array(n*n);
    let budget=6e6;
    for(let t=0;t<count;t+=3){
      const a=index?index.getX(t):t,b=index?index.getX(t+1):t+1,c=index?index.getX(t+2):t+2;
      const ax=xs[a],az=zs[a],bx=xs[b],bz=zs[b],cx=xs[c],cz=zs[c];
      const i0=Math.max(0,Math.floor((Math.min(ax,bx,cx)-x0)/w)),i1=Math.min(n-1,Math.floor((Math.max(ax,bx,cx)-x0)/w));
      const j0=Math.max(0,Math.floor((Math.min(az,bz,cz)-z0)/h)),j1=Math.min(n-1,Math.floor((Math.max(az,bz,cz)-z0)/h));
      const turn=Math.sign((bx-ax)*(cz-az)-(bz-az)*(cx-ax))||1;
      for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
        if(cells[j*n+i])continue;
        // A cell wholly on the outer side of one edge of the triangle holds none of it. Past the
        // budget every cell under the triangle's bounds counts, which only errs toward redrawing.
        let outside=false;
        if(budget-->0){
          const u0=x0+i*w,v0=z0+j*h,u1=u0+w,v1=v0+h;
          for(const [px,pz,qx,qz] of [[ax,az,bx,bz],[bx,bz,cx,cz],[cx,cz,ax,az]]){
            const ex=qx-px,ez=qz-pz;
            if(Math.max(turn*(ex*(v0-pz)-ez*(u0-px)),turn*(ex*(v0-pz)-ez*(u1-px)),turn*(ex*(v1-pz)-ez*(u0-px)),turn*(ex*(v1-pz)-ez*(u1-px)))<0){outside=true;break;}
          }
        }
        if(!outside)cells[j*n+i]=1;
      }
    }
    const blocks=[];
    for(let bj=0;bj<n;bj+=block)for(let bi=0;bi<n;bi+=block){
      const boxes=[],all=new T.Box3();
      for(let j=bj;j<bj+block;j++)for(let i=bi;i<bi+block;i++)if(cells[j*n+i]){
        // Half a metre above and below the level, and a metre around.
        const box=new T.Box3(new T.Vector3(x0+i*w-1,lake.level-.5,z0+j*h-1),new T.Vector3(x0+(i+1)*w+1,lake.level+.5,z0+(j+1)*h+1));
        boxes.push(box);all.union(box);
      }
      if(boxes.length)blocks.push({all,boxes});
    }
    return blocks.length?{blocks,last:null}:null;
  }
  function inView(lake){
    const cover=lake.cover;
    if(cover.last&&frustum.intersectsBox(cover.last))return true;
    for(const b of cover.blocks){
      if(!frustum.intersectsBox(b.all))continue;
      for(const box of b.boxes)if(frustum.intersectsBox(box)){cover.last=box;return true;}
    }
    cover.last=null;return false;
  }
  for(const lake of lakes){
    try{lake.cover=coverage(lake);}catch(error){lake.cover=null;}
    // Three decides whether the surface is drawn from its own bounds; follow only surfaces it culls.
    if(!lake.mesh.frustumCulled)lake.cover=null;
  }
  if(lakes.some(lake=>lake.cover)){
    const prior=window.aerieSkipReflection;
    window.aerieSkipReflection=surface=>{
      const lake=lakes.find(candidate=>candidate.mesh===surface);
      if(lake?.cover&&!lake.seen){
        // The first frame that shows the lake again redraws its mirror at once.
        surface.userData.reflectedFrame=undefined;counts.mirrorsSkipped++;return true;
      }
      return prior?prior(surface):false;
    };
  }

  // Ground: terrain tiles, shore shelves and surveyed sections drawn by the plain ground shader,
  // which puts every vertex exactly where the geometry stores it. Three culls each by a sphere,
  // and a kilometre-wide tile a few metres thick fills almost none of its sphere, so each piece
  // is also tested by its box.
  const ground=[];
  {
    const box=new T.Box3();
    scene.traverse(o=>{
      const g=o.geometry,m=o.material;
      if(!o.isMesh||o.isInstancedMesh||o.isSkinnedMesh||!o.frustumCulled||o.castShadow||!g||g.isInstancedBufferGeometry||Array.isArray(m)||!m?.uniforms?.shoreLevel)return;
      if(g.morphAttributes&&Object.keys(g.morphAttributes).length)return;
      const position=g.attributes.position;
      if(!position||position.usage!==T.StaticDrawUsage||!flat(m.vertexShader).includes('gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);'))return;
      o.updateWorldMatrix(true,false);
      box.setFromBufferAttribute(position).applyMatrix4(o.matrixWorld);
      // A centimetre of slack for the single-precision arithmetic of the GPU.
      ground.push({mesh:o,box:box.clone().expandByScalar(.01),top:box.max.y,position,version:position.version,world:o.matrixWorld.clone()});
    });
    counts.ground=ground.length;
    // Five centimetres under: well clear of the mirror's clip plane on the surface.
    for(const lake of lakes)lake.bed=new Set(ground.filter(piece=>piece.top<lake.level-.05));
    counts.bed=lakes.reduce((sum,lake)=>sum+lake.bed.size,0);
  }

  // Each render of the scene: what this camera cannot see is hidden for that render alone.
  const passes=[];let renders=0;
  const before=scene.onBeforeRender,after=scene.onAfterRender;
  scene.onBeforeRender=function(r,s,camera,target){
    before.apply(this,arguments);
    // A render started inside another (the mirror, from within the direct view) judges for itself:
    // what the outer camera could not see comes back for the duration.
    for(const outer of passes)for(const [mesh] of outer)show(mesh);
    const pass=[];passes.push(pass);
    if(!camera.isPerspectiveCamera)return;
    frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    const mirrored=!!camera.userData.lakeReflection;
    if(!mirrored){
      for(const lake of lakes)if(lake.cover)lake.seen=inView(lake);
      // Animals and other models arrive after the flight has begun.
      if(++renders%240===0)findLoose();
    }
    let n=0;
    for(const item of loose){
      const mesh=item.mesh;
      if(!mesh.visible||mesh.frustumCulled||mesh.castShadow)continue;
      if(item.version!==mesh.instanceMatrix.version||item.count!==mesh.count||item.array!==mesh.instanceMatrix.array)measure(item);
      if(!item.known)continue;
      if(!reaches(item)){hide(mesh,'instances outside the view');pass.push([mesh,'instances outside the view']);n++;}
    }
    if(mirrored)counts.looseHiddenInMirror=n;else counts.looseHidden=n;
    // The lake whose mirror this is, if any: its camera looks up from under the surface.
    const lake=mirrored&&target?lakes.find(candidate=>candidate.mirror===target.texture&&camera.position.y<candidate.level):null;
    n=0;let bed=0;
    for(const piece of ground){
      const mesh=piece.mesh;
      // A piece that has been rebuilt or moved since it was measured is drawn as before.
      if(!mesh.visible||!mesh.frustumCulled||piece.position!==mesh.geometry.attributes.position||piece.position.version!==piece.version||!mesh.matrixWorld.equals(piece.world))continue;
      if(lake?.bed.has(piece)){hide(mesh,'lake bed under the mirror plane');pass.push([mesh,'lake bed under the mirror plane']);bed++;}
      else if(!frustum.intersectsBox(piece.box)){hide(mesh,'ground box outside the view');pass.push([mesh,'ground box outside the view']);n++;}
    }
    if(mirrored){counts.groundHiddenInMirror=n;if(lake)counts.bedHidden=bed;}else counts.groundHidden=n;
    if(!lake)return;
    // Wings, tail and talons reach under three metres from the body. Shadows are not redrawn in a mirror.
    if(eagle?.visible&&!frustum.intersectsSphere(sphere.set(eagle.position,6))){hide(eagle,'eagle outside the mirror');pass.push([eagle,'eagle outside the mirror']);}
  };
  scene.onAfterRender=function(){
    const pass=passes.pop();
    if(pass)for(const [mesh] of pass)show(mesh);
    for(const outer of passes)for(const [mesh,rule] of outer)hide(mesh,rule);
    after.apply(this,arguments);
  };

  const previous=world.update.bind(world);
  world.update=(dt,t,player)=>{
    previous(dt,t,player);
    // No render is in progress between frames. If one was cut short by an error, give back
    // whatever it had hidden for itself.
    while(passes.length)for(const [mesh] of passes.pop())show(mesh);
    updateStands();
  };
  return world.unseenDraws={counts,hidden,lakesOutOfView:()=>lakes.filter(lake=>lake.cover&&!lake.seen).map(lake=>lake.mesh)};
};
