// Lake-edge thickets. Every spray grows from a woody branch in world space,
// so viewing the bank from above, alongside or in reflection gives parallax.
window.makeMooseheadBankGrowth=function(T,scene,{survey,ground,waterLevel,growth,roof,sun,sunMask,span,texture,clock}){
  const bins=new Map(),patches=[],cover=new Map();
  let seed=310809;
  const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
  const id=(x,z,w)=>Math.floor(x/w)+8192*Math.floor(z/w);
  const material=new T.ShaderMaterial({
    side:T.DoubleSide,alphaToCoverage:true,
    uniforms:{atlas:{value:texture('moosehead-bank-sprays.webp')},groundLight:{value:sunMask},span:{value:span},clock,sun:{value:sun}},
    vertexShader:`attribute vec3 branch;attribute vec2 stem;uniform float clock,span;uniform sampler2D groundLight;
      varying vec2 st;varying float light,wood,dist;varying vec3 wn;
      void main(){vec3 wp=position;
        float gust=sin(dot(wp.xz,vec2(.041,.067))+.9*clock)+.45*sin(wp.x*.023-wp.z*.061+1.8*clock+branch.y);
        wp.xz+=branch.x*gust*vec2(.031,.018);
        wn=normal;st=uv;wood=stem.x;light=texture2D(groundLight,.5+vec2(wp.x,-wp.z)/span).r*branch.z;
        dist=distance(wp,cameraPosition);gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);}`,
    fragmentShader:`uniform sampler2D atlas;uniform vec3 sun;varying vec2 st;varying float light,wood,dist;varying vec3 wn;
      void main(){
        vec4 leaf=texture2D(atlas,st);
        float coverage=wood>.5?1.:leaf.a;
        coverage*=1.-smoothstep(370.,590.,dist);
        if(coverage<.24)discard;
        vec3 n=normalize(wn);float diffuse=.45+.45*abs(dot(n,sun));
        vec3 color=wood>.5?vec3(.26,.23,.18):leaf.rgb;
        vec3 linear=pow(color,vec3(2.2))*(vec3(.38,.47,.55)+light*vec3(1.20,1.02,.81)*diffuse);
        gl_FragColor=vec4(linear,smoothstep(.24,.62,coverage));
        #include <colorspace_fragment>
      }`
  });
  const prototypes=Array.from({length:16},(_,cell)=>{
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
    return {positions,normals,uv,branch,stem,index};
  });
  const rings=[survey.shore,...(survey.shoreHoles||[])];
  for(const [ringIndex,ring] of rings.entries()){
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
        if(Math.max(Math.abs(bx),Math.abs(bz))>5300)continue;
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
    const vertices=p.roots.reduce((total,r)=>total+prototypes[r.cell].branch.length,0);
    const faceIndices=p.roots.reduce((total,r)=>total+prototypes[r.cell].index.length,0);
    const pos=new Float32Array(vertices*3),norm=new Float32Array(vertices*3),uv=new Float32Array(vertices*2);
    const branch=new Float32Array(vertices*3),stem=new Float32Array(vertices*2);
    const indices=vertices>65535?new Uint32Array(faceIndices):new Uint16Array(faceIndices);
    let first=0,offset=0;
    for(const r of p.roots){
      const a=Math.cos(r.a),b=Math.sin(r.a),model=prototypes[r.cell];
      for(let k=0;k<model.positions.length;k+=3){
        const x=model.positions[k],y=model.positions[k+1],z=model.positions[k+2],v=first*3+k;
        pos[v]=r.x+r.h*(a*x-b*z);pos[v+1]=r.y+r.h*y;pos[v+2]=r.z+r.h*(b*x+a*z);
        const nx=model.normals[k],nz=model.normals[k+2];norm[v]=a*nx-b*nz;norm[v+1]=model.normals[k+1];norm[v+2]=b*nx+a*nz;
        branch[v]=model.branch[k/3]*r.h;branch[v+1]=r.a;branch[v+2]=r.shade;stem[2*(first+k/3)]=model.stem[k/3];
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
  return {update(eye){
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
