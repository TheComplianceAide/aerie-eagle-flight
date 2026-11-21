// The 2015 field photograph records a red working vessel alongside Reinevågen's western fish pier.
// Its approximate 25 m overall length is scaled from the camera fit and neighboring surveyed buildings.
window.addReineQuayVessel=function(T,scene,texture,clock){
  const group=new T.Group();
  group.name='Reinevågen · documented fishing vessel at the 2015 quay';
  const anchor=new T.Vector3(1503,.17,4427),head=new T.Vector3(-.305,0,.952),right=new T.Vector3(.952,0,.305);
  const hull=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});
  const markings=new T.MeshLambertMaterial({map:texture('reine-west-quay-material.webp'),vertexColors:true,side:T.DoubleSide});
  const batches=new Map(),red=[.54,.034,.025],oxide=[.23,.042,.031],ivory=[.90,.89,.79],cream=[.76,.77,.70],glass=[.11,.20,.23],steel=[.45,.48,.46];
  const white=[1,1,1],uvSquare=[[0,0],[1,0],[1,1],[0,1]];
  function tri(m,a,b,c,col,uv=uvSquare){
    let o=batches.get(m);if(!o){o={p:[],c:[],uv:[]};batches.set(m,o);}
    for(let i=0;i<3;i++){o.p.push(...[a,b,c][i]);o.c.push(...col);o.uv.push(...uv[i]);}
  }
  function quad(m,a,b,c,d,col,uv=uvSquare){
    tri(m,a,b,c,col,uv);tri(m,a,c,d,col,[uv[0],uv[2],uv[3]]);
  }
  function girder(a,b,r,col){
    const axis=new T.Vector3().subVectors(new T.Vector3(...b),new T.Vector3(...a)).normalize();
    const right=new T.Vector3().crossVectors(axis,Math.abs(axis.y)<.94?new T.Vector3(0,1,0):new T.Vector3(1,0,0)).normalize();
    const up=new T.Vector3().crossVectors(axis,right),ring=[];
    for(let k=0;k<5;k++){const q=k*Math.PI*2/5;ring.push(right.clone().multiplyScalar(r*Math.cos(q)).addScaledVector(up,r*Math.sin(q)));}
    const add=(p,v)=>[p[0]+v.x,p[1]+v.y,p[2]+v.z];
    for(let k=0;k<5;k++)quad(hull,add(a,ring[k]),add(b,ring[k]),add(b,ring[(k+1)%5]),add(a,ring[(k+1)%5]),col);
  }
  function box(z0,z1,w0,w1,y,h,col,front=col){
    const a=[-w0,y,z0],b=[w0,y,z0],c=[w1,y,z1],d=[-w1,y,z1],rise=p=>[p[0],p[1]+h,p[2]];
    quad(hull,a,b,rise(b),rise(a),col);quad(hull,b,c,rise(c),rise(b),col);quad(hull,c,d,rise(d),rise(c),front);
    quad(hull,d,a,rise(a),rise(d),col);quad(hull,rise(a),rise(b),rise(c),rise(d),col);
  }
  const plan=[[-11.5,2.64,3.22],[-10.3,3.05,3.24],[-7.5,3.37,3.13],[-3,3.49,2.95],[1.8,3.49,3.05],[5.5,3.13,3.29],[8.6,2.39,3.52],[11,1.12,3.78],[12.5,.08,3.96]];
  function shipUV(tile,along,frac){
    const u=(tile*256+5+246*Math.max(0,Math.min(1,along)))/1024,v=1-(256+12+(1-frac)*103)/512;
    return [u,v];
  }
  for(let i=0;i<plan.length-1;i++){
    const [z0,w0,h0]=plan[i],[z1,w1,h1]=plan[i+1];
    const deck=[.25,.30,.28];quad(hull,[-w0,h0,z0],[w0,h0,z0],[w1,h1,z1],[-w1,h1,z1],deck);
    for(const s of [-1,1]){
      // The bow flares forward above its submerged forefoot.
      const rake=(z,y,h)=>Math.max(0,(z-6.8)/5.7)*1.65*(1.-Math.max(0,Math.min(1,y/h)));
      const A=(f,y)=>[s*w0*f,y,z0-rake(z0,y,h0)],B=(f,y)=>[s*w1*f,y,z1-rake(z1,y,h1)];
      quad(hull,A(.75,-1.15),B(.75,-1.15),B(.96,.20),A(.96,.20),oxide);
      quad(hull,A(.96,.18),B(.96,.18),B(1,h1-.38),A(1,h0-.38),red);
      // The photographed red broadside retains its cream rub rail and uneven paint return.
      const u0=(12.5-z0)/24,u1=(12.5-z1)/24;
      quad(markings,A(1.003,.25),B(1.003,.25),B(1.001,h1-.08),A(1.001,h0-.08),white,
        [shipUV(0,u0,0),shipUV(0,u1,0),shipUV(0,u1,1),shipUV(0,u0,1)]);
      quad(hull,A(1,h0-.28),B(1,h1-.28),B(1,h1-.10),A(1,h0-.10),ivory);
      const railArea=z1>2||z0<-7;
      if(railArea){girder(A(.996,h0+.64),B(.996,h1+.64),.042,cream);girder(A(.996,h0+.32),B(.996,h1+.32),.026,steel);girder(A(.996,h0),A(.996,h0+.67),.047,cream);}
    }
  }
  quad(hull,[-2.64,-.4,-11.5],[2.64,-.4,-11.5],[2.64,3.22,-11.5],[-2.64,3.22,-11.5],red);
  // A raised working deck continues into the forecastle. The bridge faces the high bow.
  box(-8.7,2.7,2.62,2.62,3.01,1.58,ivory);
  box(-8.45,-6.15,2.58,2.31,4.55,.96,cream);
  box(-4.43,1.86,2.23,2.11,4.59,1.18,ivory);
  box(-4.31,1.73,2.14,1.95,5.77,1.20,ivory);
  box(-4.65,2.03,2.20,2.12,6.96,.22,ivory);
  // A tall sloping windscreen and its narrow mullions are visible against the forward wall.
  for(let j=0;j<5;j++){
    const a=-1.88+j*.76,b=a+.61;
    quad(hull,[a,5.91,1.754],[b,5.91,1.754],[b-.03,6.69,1.78],[a+.03,6.69,1.78],glass);
  }
  for(const s of [-1,1]){
    for(const z of [-7.4,-6.26,-2.7,-1.52,.96]){
      const x=s*2.64;quad(hull,[x,3.68,z],[x,3.68,z+.29],[x,4.25,z+.29],[x,4.25,z],glass);
    }
    if(s>0){
      quad(markings,[2.155,5.82,-4.26],[1.969,5.82,1.68],[1.969,6.93,1.68],[2.155,6.93,-4.26],white,
        [shipUV(2,1,0),shipUV(2,0,0),shipUV(2,0,1),shipUV(2,1,1)]);
    }else for(const z of [-3.54,-2.63,-1.72,-.81,.10,.96]){
      const x=s*(2.15-(z+4.31)*.031);
      quad(hull,[x,5.91,z],[x,5.91,z+.62],[x,6.66,z+.58],[x,6.66,z+.05],glass);
    }
    // Bridge-wing bulwarks and their photographed red-bottom rescue skiff.
    box(-2.30,.14,2.59,2.43,5.0,.18,cream);
    const y=5.09,x=s*2.52;
    const skiff=[[x,y,-2.16],[x+s*.32,y+.14,-1.92],[x+s*.34,y+.14,-.24],[x,y,.03]];
    quad(hull,...skiff,red);girder([x,y+.25,-1.94],[x,y+.25,-.23],.075,ivory);
    // Independent Aft net gantry and upright ladder on the working frame.
    girder([s*2.62,3.24,-9.1],[s*2.36,6.44,-8.35],.13,cream);
    girder([s*2.59,3.24,-10.8],[s*2.36,6.44,-8.35],.095,steel);
    girder([s*2.36,6.44,-8.35],[0,6.54,-8.35],.13,ivory);
    for(let r=0;r<7;r++)girder([s*2.49,3.50+.36*r,-9.18+.08*r],[s*2.49,3.50+.36*r,-9.82+.24*r],.024,cream);
  }
  function platform(y,z,width,depth){
    box(z-depth/2,z+depth/2,width,width,y,.13,cream);
    for(const s of [-1,1]){
      girder([s*width,y+.58,z-depth/2],[s*width,y+.58,z+depth/2],.038,ivory);
      girder([s*width,y+.59,z-depth/2],[-s*width,y+.59,z-depth/2],.035,ivory);
      girder([s*width,y,z-depth/2],[s*width,y+.61,z-depth/2],.032,steel);
      girder([s*width,y,z+depth/2],[s*width,y+.61,z+depth/2],.032,steel);
    }
  }
  // Foremast lookout, two slant derricks and taut standing rigging.
  girder([0,3.49,8.13],[0,12.61,7.96],.145,cream);
  platform(11.52,8.0,.53,.86);
  box(7.67,8.30,.36,.38,12.07,.76,ivory);
  box(7.56,8.40,.49,.49,12.83,.12,cream);
  girder([0,3.64,10.85],[0,11.26,8.01],.09,cream);
  girder([0,3.44,6.82],[0,10.56,4.84],.11,ivory);
  girder([0,10.56,4.84],[0,11.74,7.94],.021,steel);
  for(const s of [-1,1]){
    girder([0,12.42,7.98],[s*2.11,3.57,8.55],.023,cream);
    girder([0,10.59,4.84],[s*2.64,3.28,5.4],.018,steel);
    girder([s*1.46,7.22,1.45],[s*1.46,7.72,1.45],.031,ivory);
    girder([s*1.52,7.70,1.42],[s*1.52,7.70,-3.12],.032,cream);
  }
  // The main signal mast grows from the aft wheelhouse. Its lights, radar and antennas
  // are freestanding, so flying a different bearing exposes the actual open framework.
  girder([0,7.16,-2.9],[0,13.75,-3.72],.14,ivory);
  platform(8.29,-3.13,.86,.88);platform(9.93,-3.27,.65,.74);
  platform(11.34,-3.49,.47,.65);
  girder([-1.42,10.52,-3.34],[1.42,10.52,-3.34],.069,ivory);
  box(-3.73,-3.34,.26,.22,13.20,.65,ivory);
  girder([0,7.11,-4.03],[0,15.2,-5.16],.047,cream);
  girder([0,7.13,.80],[0,15.83,.66],.029,cream);
  girder([0,14.22,-5.10],[0,15.2,.70],.015,steel);
  // Deck reels, cable drum, fairleads and the protected open transom.
  for(const z0 of [-10.48,4.81]){
    const y=z0<0?3.52:3.60;
    girder([-.51,y,z0],[.51,y,z0],.29,steel);
    for(let k=0;k<7;k++)girder([-.43+k*.13,y,z0],[-.37+k*.13,y,z0],.34,[.29,.28,.25]);
    for(const s of [-1,1])girder([s*.52,y,z0],[s*.64,y,z0],.42,oxide);
  }
  for(const s of [-1,1])for(const z of [-9,6.56])girder([s*2.13,z>0?3.46:3.24,z],[s*2.13,z>0?3.88:3.68,z],.095,steel);
  // Lines reach from the near gunwale to the surveyed hard quay. A slack catenary sits above the waterline.
  function line(z,shoreX,shoreZ){
    const dx=shoreX-anchor.x,dz=shoreZ-anchor.z,target=[dx*right.x+dz*right.z,1.48,dx*head.x+dz*head.z],origin=[-2.45,3.17,z];let prev=origin;
    for(let i=1;i<=8;i++){
      const f=i/8,q=origin.map((v,k)=>v+(target[k]-v)*f);q[1]-=.36*Math.sin(Math.PI*f);girder(prev,q,.037,[.51,.43,.29]);prev=q;
    }
  }
  line(-8,1501.2,4411.4);line(5,1493.6,4429.2);
  for(const [material,d]of batches){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(d.p,3));g.setAttribute('color',new T.Float32BufferAttribute(d.c,3));g.setAttribute('uv',new T.Float32BufferAttribute(d.uv,2));g.computeVertexNormals();g.computeBoundingSphere();const o=new T.Mesh(g,material);o.name=material===hull?'Marken V · hull, wheelhouse and working rig':'Marken V · photographed hull and bridge';group.add(o);}
  for(const mesh of group.children)mesh.userData.terrainReceiver=true;
  const w=new T.Matrix4().makeBasis(right,new T.Vector3(0,1,0),head);group.quaternion.setFromRotationMatrix(w);group.position.copy(anchor);scene.add(group);
  // A slack-water mooring permits centimetres of heave. A yawing vessel would cut through its real quay.
  function update(){const t=clock.value;group.position.y=anchor.y+.063*Math.sin(.69*t+.2)+.025*Math.sin(1.18*t);}
  function ceiling(x,z){
    const dx=x-anchor.x,dz=z-anchor.z,side=dx*right.x+dz*right.z,z0=dx*head.x+dz*head.z;
    if(z0<plan[0][0]||z0>plan.at(-1)[0])return -Infinity;
    const i=plan.findIndex(s=>s[0]>=z0),a=plan[Math.max(0,i-1)],b=plan[Math.max(0,i)],mix=(z0-a[0])/Math.max(.01,b[0]-a[0]),width=a[1]+(b[1]-a[1])*mix;
    if(Math.abs(side)>width)return -Infinity;
    let top=a[2]+(b[2]-a[2])*mix;
    if(Math.abs(side)<2.63&&z0>-8.71&&z0<2.71)top=4.62;
    if(Math.abs(side)<2.62&&z0>-8.45&&z0<-6.15)top=5.52;
    if(Math.abs(side)<2.21&&z0>-4.66&&z0<2.04)top=7.19;
    if(Math.abs(side)<.58&&Math.abs(z0-8.00)<.49)top=12.95;
    if(Math.abs(side)<.30&&Math.abs(z0+3.50)<.49)top=13.89;
    if(Math.abs(side)<.15&&Math.abs(z0+5.0)<.32)top=15.2;
    if(Math.abs(side)<.13&&Math.abs(z0-.71)<.15)top=15.83;
    if(Math.abs(z0+8.35)<.23)top=6.54;
    return top+group.position.y;
  }
  return {group,ceiling,update};
};
