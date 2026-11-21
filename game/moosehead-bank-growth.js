// Lake-edge thickets. Every spray grows from a woody branch in world space,
// so viewing the bank from above, alongside or in reflection gives parallax.
window.makeMooseheadBankGrowth=function(T,scene,{survey,ground,waterLevel,growth,roof,nearTrees,sun,sunMask,span,texture,clock}){
  const bins=new Map(),patches=[],cover=new Map();
  let seed=310809;
  const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
  const id=(x,z,w)=>Math.floor(x/w)+8192*Math.floor(z/w);
  const material=new T.ShaderMaterial({
    side:T.DoubleSide,alphaToCoverage:true,
    uniforms:{atlas:{value:texture('moosehead-bank-sprays.webp')},foliage:{value:texture('moosehead-understory.webp')},groundLight:{value:sunMask},span:{value:span},clock,sun:{value:sun}},
    vertexShader:`attribute vec3 branch;attribute vec2 stem;uniform float clock,span;uniform sampler2D groundLight;
      varying vec2 st;varying float light,wood,dist;varying vec3 wn;
      void main(){vec3 wp=position;
        float gust=sin(dot(wp.xz,vec2(.041,.067))+.9*clock)+.45*sin(wp.x*.023-wp.z*.061+1.8*clock+branch.y);
        wp.xz+=branch.x*gust*vec2(.031,.018);
        wn=normal;st=uv;wood=stem.x;light=texture2D(groundLight,.5+vec2(wp.x,-wp.z)/span).r*branch.z;
        dist=distance(wp,cameraPosition);gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);}`,
    fragmentShader:`uniform sampler2D atlas,foliage;uniform vec3 sun;varying vec2 st;varying float light,wood,dist;varying vec3 wn;
      void main(){
        vec4 leaf=wood>1.5?texture2D(foliage,st):texture2D(atlas,st);
        bool isWood=wood>.5&&wood<1.5;
        float coverage=isWood?1.:leaf.a;
        coverage*=1.-smoothstep(370.,590.,dist);
        if(coverage<.24)discard;
        vec3 n=normalize(wn);float diffuse=.45+.45*abs(dot(n,sun));
        vec3 color=isWood?vec3(.26,.23,.18):leaf.rgb;
        vec3 pigment=mix(color,vec3(dot(color,vec3(.24,.64,.12))),.20)*vec3(.89,.85,.90);
        vec3 linear=pow(pigment,vec3(2.2))*(vec3(.18,.24,.30)+light*vec3(1.03,.91,.72)*diffuse);
        gl_FragColor=vec4(linear,smoothstep(.24,.62,coverage));
        #include <colorspace_fragment>
      }`
  });
  const solarHorizontal=sun.x*sun.x+sun.z*sun.z;
  let placementSeed;
  const prototypes=Array.from({length:32},(_,form)=>{
    const cell=form%16;
    if(form===16)placementSeed=seed;
    const positions=[],normals=[],uv=[],branch=[],stem=[],index=[];
    function vertex(p,n,u,v,b,w){
      positions.push(...p);normals.push(...n);uv.push(u,v);branch.push(b);stem.push(w);
      return positions.length/3-1;
    }
    function stick(a,b,thick){
      const first=positions.length/3;
      for(const [point,r] of [[a,thick],[b,thick*.4]])for(let k=0;k<4;k++){
        const angle=k*Math.PI/2,n=[Math.cos(angle),0,Math.sin(angle)];
        vertex([point[0]+r*n[0],point[1],point[2]+r*n[2]],n,.5,.5,point[1],1);
      }
      for(let k=0;k<4;k++){const j=(k+1)%4;index.push(first+k,first+4+k,first+j,first+j,first+4+k,first+4+j);}
    }
    function spray(base,angle,reach,rise,width,spec){
      const dx=Math.cos(angle),dz=Math.sin(angle),h=Math.hypot(rise,reach);
      const n=[-dx*rise/h,reach/h,-dz*rise/h],first=positions.length/3;
      for(const [t,bend] of [[0,0],[.51,.11],[1,0]])for(const side of [-1,1]){
        const w=width*side;
        const p=[base[0]+reach*t*dx-w*dz,base[1]+rise*t+bend*reach,base[2]+reach*t*dz+w*dx];
        vertex(p,n,((spec%4)+.5+.48*side)/4,(3-Math.floor(spec/4)+.027+.946*t)/4,p[1],0);
      }
      index.push(first,first+1,first+2,first+1,first+3,first+2,first+2,first+3,first+4,first+3,first+5,first+4);
    }
    const evergreen=cell<4||(cell>=8&&cell<12);
    const stems=evergreen?2+Math.floor(random()*2):3+Math.floor(random()*3);
    for(let s=0;s<stems;s++){
      const az=2*Math.PI*(s/stems+random()*.12),lean=.18+random()*.57;
      const h=s===0?1:.54+.43*random();
      const dx=Math.cos(az),dz=Math.sin(az);
      const heel=[dx*.028,0,dz*.028],knot=[dx*lean*.4,h*.48,dz*lean*.4],tip=[dx*lean,h,dz*lean];
      stick(heel,knot,.017+random()*.007);stick(knot,tip,.011);
      for(let j=0;j<5;j++){
        const t=.34+j*.133,angle=az+j*2.32+random()*.52,r=(evergreen?.37:.29)*(.60+.75*random())*(1-.36*t);
        const base=[dx*lean*t,h*t,dz*lean*t],lift=r*(evergreen?.12+.58*random():.45+.85*random());
        const spec=cell<12?Math.floor(cell/4)*4+(cell+j)%4:cell;
        spray(base,angle,r,lift,r*(evergreen?.68:.8),spec);
      }
    }
    // Bow the photographed leaf mass into three stationary, intersecting
    // surfaces around its true root. Actual branched sprays project through
    // them. This keeps volume from above, below, and in lake reflections.
    const companions=form<16?[4,7,6,5,0,3,1,2,5,6,7,4,8,9,11,15]:[4,5,6,7,10,2,1,3,5,6,7,4,12,13,14,15];
    const shrub=companions[cell],low=shrub===1||shrub===2||shrub===11||shrub>=12;
    const tall=low?.62:shrub>=4&&shrub<8?1.11:.91,wide=low?.68:shrub>=4&&shrub<8?.48:.67;
    const rows=4,cols=4,twist=(cell*.399+form*.166)%6.28;
    for(let sheet=0;sheet<3;sheet++){
      const angle=twist+sheet*Math.PI*2/3,nx=Math.sin(angle),nz=Math.cos(angle),first=positions.length/3;
      for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){
        const u=i/cols,v=j/rows,k=2*u-1;
        const depth=.35*wide*(1.-k*k)*Math.sin(Math.PI*v);
        const side=wide*k;
        const x=nz*side+nx*depth+(v*v)*.065*Math.sin(twist);
        const z=-nx*side+nz*depth+(v*v)*.065*Math.cos(twist);
        const normal=[nx*.77+nz*k*.29,.46+v*.32,nz*.77-nx*k*.29];
        vertex([x,-.04+v*tall,z],normal,((shrub%4)+.032+.936*u)/4,(3-Math.floor(shrub/4)+.032+.936*v)/4,v*tall,2);
      }
      for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
        const a=first+j*(cols+1)+i;
        index.push(a,a+1,a+cols+1,a+1,a+cols+2,a+cols+1);
      }
    }
    return {positions,normals,uv,branch,stem,index};
  });
  seed=placementSeed;
  const rings=[survey.shore,...(survey.shoreHoles||[])];
  for(const easternBay of [false,true])for(const [ringIndex,ring] of rings.entries()){
    if(!ring?.length)continue;
    let area=0,distance=0,next=3.7;
    for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];area+=a[0]*b[1]-b[0]*a[1];}
    const direction=(area>0?1:-1)*(ringIndex===0?1:-1);
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
      if(!len)continue;
      while(next<distance+len){
        const f=(next-distance)/len,bx=a[0]+dx*f,bz=a[1]+dz*f;
        next+=3.2+6.6*random();
        if(easternBay){
          if(Math.min(Math.hypot(bx-11425,bz-199),Math.hypot(bx-15205,bz-9651))>1450)continue;
        }else if(Math.max(Math.abs(bx),Math.abs(bz))>5300)continue;
        const nx=direction*dz/len,nz=-direction*dx/len;
        // Clumps alternate with exposed gravel and bedrock. The first and second
        // rows are staggered along the surveyed bank, with openings between stands.
        const stand=.49+.27*Math.sin(bx*.029+bz*.014)+.24*Math.sin(bz*.058-bx*.037);
        if(random()>stand*.91)continue;
        const inlandCover=Math.max(growth(bx+nx*14,bz+nz*14),growth(bx+nx*36,bz+nz*36));
        const density=2+Math.floor(random()*(inlandCover>.38?6:3));
        for(let k=0;k<density;k++){
          const along=(random()-.5)*7.6,inland=.7+Math.pow(random(),1.30)*17.4;
          const x=bx+nx*inland+dx/len*along,z=bz+nz*inland+dz/len*along,y=ground(x,z);
          if(y<waterLevel+.08||y>waterLevel+16||Number.isFinite(roof?.(x,z)))continue;
          if(Math.abs(ground(x+nx*2,z+nz*2)-y)>2.45)continue;
          const woods=growth(x,z);
          if(inland>6&&Math.max(woods,inlandCover)<.11&&random()>.22)continue;
          const u=random(),cell=inland<4.8?(u<.48?4+Math.floor(random()*4):u<.77?14:u<.92?15:Math.floor(random()*4)):
            (u<.38?Math.floor(random()*4):u<.65?8+Math.floor(random()*4):u<.82?12:13);
          const h=(cell===14?.47:cell===15?1.08:cell<4?1.8:cell<8?1.25:1.85)*(.70+1.5*random());
          const key=id(x,z,250);if(!bins.has(key))bins.set(key,[]);
          bins.get(key).push({x,y:y-.035,z,h,cell,a:random()*Math.PI*2,shade:.76+.28*random()});
          if(h>1.4){
            const k=id(x,z,12);if(!cover.has(k))cover.set(k,[]);
            cover.get(k).push({x,y,z,h});
          }
        }
      }
      distance+=len;
    }
  }
  // Build resident near-bank tiles on approach; allocate at most one tile per
  // update after the first frame. No rebuilding when circling a completed tile.
  for(const [key,roots] of bins){
    let x=0,z=0;for(const r of roots){x+=r.x;z+=r.z;}
    patches.push({x:x/roots.length,z:z/roots.length,roots,mesh:null});
  }
  function build(p){
    const vertices=p.roots.reduce((total,r)=>total+prototypes[r.cell+(r.a>Math.PI?16:0)].branch.length,0);
    const faceIndices=p.roots.reduce((total,r)=>total+prototypes[r.cell+(r.a>Math.PI?16:0)].index.length,0);
    const pos=new Float32Array(vertices*3),norm=new Float32Array(vertices*3),uv=new Float32Array(vertices*2);
    const branch=new Float32Array(vertices*3),stem=new Float32Array(vertices*2);
    const indices=vertices>65535?new Uint32Array(faceIndices):new Uint16Array(faceIndices);
    let first=0,offset=0;
    for(const r of p.roots){
      const slopeX=Math.max(-1.5,Math.min(1.5,(ground(r.x+1,r.z)-ground(r.x-1,r.z))*.5));
      const slopeZ=Math.max(-1.5,Math.min(1.5,(ground(r.x,r.z+1)-ground(r.x,r.z-1))*.5));
      const horizon=Math.max(0,ground(r.x+sun.x*12,r.z+sun.z*12)-r.y-12*sun.y);
      let sunlight=Math.max(.13,Math.min(1,1-horizon*.29));
      // Cast a short solar ray through the adjacent real tree crowns. Leaf
      // color is baked in diffuse light, so the shaded bank needs this canopy fill.
      if(nearTrees){
        for(let k=0;k<=3&&sunlight>.16;k++){
          const along=k*11;
          for(const t of nearTrees(r.x+along*sun.x,r.z+along*sun.z)){
            const dx=t.x-r.x,dz=t.z-r.z,parallel=(dx*sun.x+dz*sun.z)/solarHorizontal;
            if(parallel<-.3||parallel>48)continue;
            const side=Math.hypot(dx-parallel*sun.x,dz-parallel*sun.z)/(Math.max(1,t.width)*.55);
            const vertical=(r.y+r.h*.68+parallel*sun.y-(t.y+t.height*.66))/Math.max(1,t.height*.44);
            const radius=side*side+vertical*vertical;
            if(radius<1)sunlight=Math.min(sunlight,.14+.86*radius*radius);
          }
        }
      }
      const a=Math.cos(r.a),b=Math.sin(r.a),model=prototypes[r.cell+(r.a>Math.PI?16:0)];
      for(let k=0;k<model.positions.length;k+=3){
        const x=model.positions[k],y=model.positions[k+1],z=model.positions[k+2],v=first*3+k;
        const dx=r.h*(a*x-b*z),dz=r.h*(b*x+a*z);
        pos[v]=r.x+dx;pos[v+2]=r.z+dz;
        const foot=Math.max(0,1-y/.55);
        pos[v+1]=r.y+r.h*(y-.065)+foot*foot*(dx*slopeX+dz*slopeZ);
        const nx=model.normals[k],nz=model.normals[k+2];norm[v]=a*nx-b*nz;norm[v+1]=model.normals[k+1];norm[v+2]=b*nx+a*nz;
        branch[v]=model.branch[k/3]*r.h;branch[v+1]=r.a;branch[v+2]=r.shade*sunlight;stem[2*(first+k/3)]=model.stem[k/3];
      }
      uv.set(model.uv,2*first);for(const i of model.index)indices[offset++]=i+first;
      first+=model.branch.length;
    }
    const g=new T.BufferGeometry();
    for(const [n,v,len] of [['position',pos,3],['normal',norm,3],['uv',uv,2],['branch',branch,3],['stem',stem,2]])g.setAttribute(n,new T.BufferAttribute(v,len));
    g.setIndex(new T.BufferAttribute(indices,1));g.computeBoundingSphere();p.mesh=new T.Mesh(g,material);p.mesh.name='Moosehead lake-edge thicket';scene.add(p.mesh);
  }
  const last=new T.Vector3(Infinity,Infinity,Infinity);
  let queue=[];
  return {shootAtlas:material.uniforms.atlas.value,update(eye){
    if(eye.distanceToSquared(last)>36){
      last.copy(eye);queue=[];
      for(const p of patches){
        const d=Math.hypot(p.x-eye.x,p.z-eye.z);
        if(p.mesh)p.mesh.visible=d<810;else if(d<810)queue.push([d,p]);
      }
      queue.sort((a,b)=>b[0]-a[0]);
    }
    if(queue.length)build(queue.pop()[1]);
  },clearance(x,z){
    let top=-Infinity;const i=Math.floor(x/12),j=Math.floor(z/12);
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)for(const r of cover.get(i+dx+8192*(j+dz))||[]){
      const ratio=Math.hypot(x-r.x,z-r.z)/(.53*r.h);if(ratio<1)top=Math.max(top,r.y+r.h*(1-ratio*.62));
    }return top;
  },count:patches.reduce((n,p)=>n+p.roots.length,0)};
};
