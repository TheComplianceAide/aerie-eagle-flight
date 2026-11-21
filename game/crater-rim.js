// Watchman Observation Station (1932) and the documented pre-rehabilitation Cleetwood shore.
// Coordinates and elevations use east/up/south metres in the Crater Lake survey.
window.makeCraterRimSites = function(T,scene,texture,sky,ground){
  const survey=window.craterRimSurvey,batches=new Map(),collision=new Map();
  const key=(x,z)=>Math.floor(x/8)*65536+Math.floor(z/8);
  const color=new T.Color();
  const material=(map,options={})=>new T.MeshStandardMaterial({vertexColors:true,side:T.DoubleSide,roughness:.87,...(map?{map:texture(map,true)}:{}),...options});
  const stone=material('crater-rim-masonry.webp'),rock=material('crater-rim-andesite.webp');
  const wood=material('alton-bandstand-deck.webp'),shake=material('building-shingles.webp');
  const trim=material(null),metal=material(null,{roughness:.57,metalness:.34});
  const glass=material(null,{roughness:.19,transparent:true,opacity:.59,depthWrite:false});
  const panel=material('crater-rim-interpretation.webp');
  const museum=material('crater-rim-museum.webp');
  // Low-angle reflections move across individual panes as the eagle changes bearing.
  glass.onBeforeCompile=s=>{
    s.uniforms.lookoutSky={value:sky};
    s.vertexShader='varying vec3 lookoutPosition;varying vec3 lookoutNormal;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nlookoutPosition=(modelMatrix*vec4(position,1.)).xyz;lookoutNormal=normalize(mat3(modelMatrix)*normal);');
    s.fragmentShader='uniform sampler2D lookoutSky;varying vec3 lookoutPosition,lookoutNormal;\n'+s.fragmentShader.replace('#include <opaque_fragment>',`vec3 observer=normalize(cameraPosition-lookoutPosition),nn=normalize(lookoutNormal);
      vec3 rr=reflect(-observer,nn);vec2 coord=vec2(atan(rr.z,rr.x)*.15915494+.5,asin(clamp(rr.y,-1.,1.))*.31830989+.5);
      float rim=pow(1.-abs(dot(observer,nn)),3.);outgoingLight=mix(outgoingLight,texture2D(lookoutSky,coord).rgb,.28+.53*rim);diffuseColor.a=.40+.46*rim;
      #include <opaque_fragment>`);
  };
  function tri(mat,p,uv,tint,physical=false){
    let batch=batches.get(mat);if(!batch){batch={pos:[],uv:[],col:[]};batches.set(mat,batch);}
    color.setHex(tint);
    for(let i=0;i<3;i++){batch.pos.push(...p[i]);batch.uv.push(...uv[i]);batch.col.push(color.r,color.g,color.b);}
    if(!physical)return;
    const [a,b,c]=p,ux=b[0]-a[0],uz=b[2]-a[2],vx=c[0]-a[0],vz=c[2]-a[2],det=ux*vz-uz*vx;
    if(Math.abs(det)<.001)return;
    const face=[a[0],a[2],a[1],vz/det,-vx/det,-uz/det,ux/det,b[1]-a[1],c[1]-a[1]];
    for(let i=Math.floor(Math.min(a[0],b[0],c[0])/8);i<=Math.floor(Math.max(a[0],b[0],c[0])/8);i++)
      for(let j=Math.floor(Math.min(a[2],b[2],c[2])/8);j<=Math.floor(Math.max(a[2],b[2],c[2])/8);j++){const k=i*65536+j;if(!collision.has(k))collision.set(k,[]);collision.get(k).push(face);}
  }
  function quad(mat,a,b,c,d,tint,scale=1,physical=false){
    const w=Math.hypot(...a.map((v,i)=>v-b[i]))/scale,h=Math.hypot(...a.map((v,i)=>v-d[i]))/scale*(mat===stone?2.75:1);
    tri(mat,[a,b,c],[[0,0],[w,0],[w,h]],tint,physical);tri(mat,[a,c,d],[[0,0],[w,h],[0,h]],tint,physical);
  }
  const station=(u,y,v)=>[-3942.83+.8311*u+.5561*v,y,379.27-.5561*u+.8311*v];

  function box(frame,mat,x0,z0,x1,z1,bottom,top,tint,scale=1,physical=false){
    const corners=[[x0,z0],[x1,z0],[x1,z1],[x0,z1]],lo=corners.map(([x,z])=>frame(x,bottom,z)),hi=corners.map(([x,z])=>frame(x,top,z));
    for(let i=0;i<4;i++){const j=(i+1)%4;quad(mat,lo[i],lo[j],hi[j],hi[i],tint,scale);}
    quad(mat,hi[0],hi[3],hi[2],hi[1],tint,scale,physical);
  }
  function pole(mat,a,b,r,tint,n=7,tip=r){
    const along=new T.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]).normalize(),u=new T.Vector3().crossVectors(along,Math.abs(along.y)>.88?new T.Vector3(0,0,1):new T.Vector3(0,1,0)).normalize(),v=new T.Vector3().crossVectors(along,u);
    function at(p,t,rad){return p.map((q,i)=>q+rad*(Math.cos(t)*u.getComponent(i)+Math.sin(t)*v.getComponent(i)));}
    for(let j=0;j<n;j++){const t=j*2*Math.PI/n,h=(j+1)*2*Math.PI/n;quad(mat,at(a,t,r),at(a,h,r),at(b,h,tip),at(b,t,tip),tint,.65);}
  }
  const timber=0xa49887,edge=0x756653,steel=0x504b40;
  // Angular volcanic blocks stand proud of the mortar with broken edges and uneven course joints.
  function dressedWall(side,length,base,top,seed){
    let state=seed;const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
    const tints=[0xb8af9a,0xb9aa98,0xb8afa6,0xa6a3a0,0xc4b8a2,0xb6a5a1,0xa5aa9c];
    let y=base;
    while(y<top-.045){
      const rowHeight=Math.min(top-y,.27+rand()*.25);let along=0;
      while(along<length-.035){
        const w=Math.min(length-along,.34+rand()*.73),end=along+w;
        const mid=side(along+w*.5,y,0);
        if(y+rowHeight>ground(mid[0],mid[2])-.22){
          const gap=.011,bevel=Math.min(w*.15,.045+rand()*.036),out=.035+rand()*.056;
          const shape=[[along+bevel,y+gap],[end-bevel*.8,y+gap*1.3],[end-gap,y+.08],
            [end-gap*.6,y+rowHeight-.075],[end-bevel,y+rowHeight-gap],[along+bevel*.75,y+rowHeight-gap*1.4],
            [along+gap,y+rowHeight-.08],[along+gap*.9,y+.063]];
          const back=shape.map(([u,h])=>side(u,h,0)),front=shape.map(([u,h])=>side(u+(along+w*.5-u)*.055,h+(y+rowHeight*.5-h)*.07,out+.014*rand()));
          const center=side(along+w*.5,y+rowHeight*.5,out+.025+rand()*.025);
          const tint=tints[Math.floor(rand()*tints.length)],u0=rand()*.71,v0=rand()*.62;
          const uv=shape.map(([u,h])=>[u0+(u-along)*.41,v0+(h-y)*.68]);
          for(let i=0;i<shape.length;i++){
            const k=(i+1)%shape.length;
            tri(rock,[front[i],front[k],center],[uv[i],uv[k],[u0+w*.20,v0+rowHeight*.34]],tint);
            quad(rock,back[i],back[k],front[k],front[i],tint,1.3);
          }
        }
        along=end;
      }
      y+=rowHeight;
    }
  }
  function lookout(){
    // Nomination dimensions: 16 ft 10 in observatory, 20 × 14 ft masonry museum wing.
    box(station,stone,-2.565,-2.565,2.565,2.565,2437.8,2446.78,0xc6bab0,3.2,true);
    box(station,stone,-.75,2.53,5.35,6.80,2438.1,2446.02,0xcfc0b3,3.15,true);
    box(station,stone,-.90,2.45,5.50,6.95,2445.93,2446.17,0xc3b7a7,2.7,true);
    box(station,wood,-2.57,-2.57,2.57,2.57,2446.72,2447.02,0x8e7052,.80,true);
    for(let k=0;k<4;k++){
      const blockSide=(d,y,n)=>{const u=d-2.565,q=2.575+n;const a=[[u,-q],[q,u],[-u,q],[-q,-u]][k];return station(a[0],y,a[1]);};
      dressedWall(blockSide,5.13,2439.9,2446.73,114+k*41);
    }
    // The inventory identifies steel multi-light casements on the east and west elevations.
    for(const k of [1,3]){
      const side=(u,y,q)=>{const a=k===1?[q,u]:[-q,-u];return station(a[0],y,a[1]);};
      const y0=2444.65,y1=2445.80,a=-.92,b=.64;
      const pane=[side(a,y0,2.69),side(b,y0,2.69),side(b,y1,2.69),side(a,y1,2.69)];
      quad(trim,...pane,0x273539,1);
      for(const y of [y0,y1])pole(metal,side(a-.07,y,2.73),side(b+.07,y,2.73),.046,0x514e43,4);
      for(let j=0;j<=3;j++)pole(metal,side(a+(b-a)*j/3,y0,2.74),side(a+(b-a)*j/3,y1,2.74),j%3?.018:.043,0x625e51,4);
      pole(metal,side(a,(y0+y1)/2,2.74),side(b,(y0+y1)/2,2.74),.018,0x5c594d,4);
      if(k===1){
        const lo=2442.86;quad(wood,side(.91,lo,2.69),side(1.84,lo,2.69),side(1.84,lo+1.96,2.69),side(.91,lo+1.96,2.69),0x746853,.83);
        pole(metal,side(1.70,lo+.93,2.72),side(1.70,lo+.93,2.82),.037,0x787668,7);
      }
    }
    const wingFace=(u,y)=>station(u,y,6.82);
    const fa=wingFace(-.75,2443.90),fb=wingFace(5.35,2443.90),fc=wingFace(5.35,2446.035),fd=wingFace(-.75,2446.035);
    tri(museum,[fa,fb,fc],[[0,0],[1,0],[1,1]],0xf1eade);tri(museum,[fa,fc,fd],[[0,0],[1,1],[0,1]],0xf1eade);
    // The unobscured front photo shows a recessed two-light window; give its lintel and reveal real depth.
    for(const u of [1.42,3.81])box(station,trim,u,6.821,u+.10,6.96,2444.84,2445.74,0x615a50);
    box(station,wood,1.34,6.82,3.98,7.015,2445.68,2445.80,0x796955,.67);
    box(station,wood,1.32,6.82,3.97,7.01,2444.81,2444.91,0x8a7a64,.67);
    const side=(k,s,y,q=2.57)=>{const coords=[[s,-q],[q,s],[-s,q],[-q,-s]][k];return station(coords[0],y,coords[1]);};
    for(let k=0;k<4;k++){
      quad(wood,side(k,-2.56,2448.53),side(k,2.56,2448.53),side(k,2.56,2449.18),side(k,-2.56,2449.18),0x665242,.84);
      for(let j=0;j<6;j++){
        const a=-2.56+j*.8535,b=a+.8535,y0=2447.02,y1=2448.55;
        quad(glass,side(k,a+.029,y0),side(k,b-.029,y0),side(k,b-.029,y1),side(k,a+.029,y1),0x74949a,1);
        pole(metal,side(k,a,y0-.04,2.583),side(k,a,y1+.07,2.583),.036,steel,4);
      }
      pole(wood,side(k,-2.55,2447.37,2.57),side(k,2.55,2447.37,2.57),.022,0x665d4b,4);
      for(const y of [2447,2448.55])pole(wood,side(k,-2.59,y,2.585),side(k,2.59,y,2.585),.068,0x6c5a4a,4);
      const start=station(0,2450.57,0);
      tri(shake,[side(k,-3.18,2449.36,3.18),side(k,3.18,2449.36,3.18),start],[[0,0],[4.4,0],[2.2,2.55]],0x6a705f,true);
      quad(wood,side(k,-3.18,2449.24,3.18),side(k,3.18,2449.24,3.18),side(k,3.18,2449.37,3.18),side(k,-3.18,2449.37,3.18),0x514c40,.70);
      // The open catwalk follows the hipped tower on all four sides.
      const outer=3.93;quad(wood,side(k,-outer,2446.51,outer),side(k,outer,2446.51,outer),side(k,2.54,2446.51,2.54),side(k,-2.54,2446.51,2.54),timber,1.30,true);
      quad(wood,side(k,-outer,2446.27,outer),side(k,outer,2446.27,outer),side(k,outer,2446.51,outer),side(k,-outer,2446.51,outer),edge,1.);
      for(const s of [-3.84,-1.94,0,1.94,3.84]){
        if(k===1&&s===0)continue;
        pole(wood,side(k,s,2446.30,3.83),side(k,s,2447.59,3.83),.13,timber,8,.116);
        if(Math.abs(s)>1&&Math.abs(s)<3)pole(wood,side(k,s,2444.73,2.55),side(k,s,2446.33,3.79),.126,edge);
      }
      for(const y of [2446.98,2447.50]){
        if(k===1){pole(wood,side(k,-3.84,y,3.83),side(k,-.83,y,3.83),.085,timber);pole(wood,side(k,.83,y,3.83),side(k,3.84,y,3.83),.085,timber);}
        else pole(wood,side(k,-3.84,y,3.83),side(k,3.84,y,3.83),.087,timber);
      }
    }
    pole(metal,station(-2.87,2449.35,-2.34),station(-2.87,2451.07,-2.34),.026,0x777a78,6,.016);
    pole(wood,station(0,2446.76,0),station(0,2447.72,0),.25,edge,10);
    pole(metal,station(0,2447.72,0),station(0,2447.78,0),.39,0x807b5e,16);
    // Firefinder, shelf, and corner desk are visible through the wraparound windows.
    box(station,wood,-2.40,-2.40,-.34,-1.92,2447.57,2447.66,0x907c61,.55);
    for(const u of [-2.28,-.47])for(const v of [-2.28,-2.02])pole(wood,station(u,2446.79,v),station(u,2447.57,v),.051,edge,5);
    pole(metal,station(-.25,2447.90,0),station(.25,2447.90,0),.025,0x606453,8);
    for(const u of [-.25,.25])pole(metal,station(u,2447.77,0),station(u,2447.97,0),.019,0x464b3c,5);
    // The east stair and timbers follow the landward edge of the catwalk.
    for(let i=0;i<11;i++){
      const high=2446.51-(i+1)*.174,u=3.9+i*.285;
      box(station,wood,u,-.68,u+.32,.68,high-.09,high,timber,.90,true);
    }
    for(const v of [-.71,.71]){
      pole(wood,station(3.79,2447.45,v),station(7.1,2445.56,v),.086,timber);
      pole(wood,station(6.98,2444.29,v),station(6.98,2445.60,v),.097,edge);
    }
    // Massive irregular cheek walls and low interpretation plinths follow the rocky platform.
    const path=[[9.0,8.2],[9.7,4.4],[9.0,-1.6],[7.4,-5.6],[3.6,-7.8],[.1,-7.6],[-3.5,-6.9]];
    let row=0;
    for(let i=1;i<path.length;i++){
      const [x0,z0]=path[i-1],[x1,z1]=path[i],dx=x1-x0,dz=z1-z0,len=Math.hypot(dx,dz),width=.53,nx=-dz*width/len,nz=dx*width/len,n=Math.ceil(len/.78);
      for(let j=0;j<n;j++,row++){
        const f=j/n,h=(j+1)/n;
        const a=x0+dx*f,c=z0+dz*f,b=x0+dx*h,d=z0+dz*h;
        const mid=station((a+b)/2,0,(c+d)/2),base=ground(mid[0],mid[2])-.15,top=base+.83+.12*Math.sin(3.3*row);
        const footprint=[[a+nx,c+nz],[b+nx,d+nz],[b-nx,d-nz],[a-nx,c-nz]],bottom=footprint.map(([u,v])=>station(u,base-.45,v)),hi=footprint.map(([u,v],m)=>station(u,top+.065*Math.sin(m*3.1+row),v));
        const tint=[0xc5b5a0,0xb4a89c,0xb9aca3,0xcab9a2][row%4];for(let m=0;m<4;m++){const next=(m+1)%4;quad(stone,bottom[m],bottom[next],hi[next],hi[m],tint,2.25);}
        quad(rock,hi[0],hi[1],hi[2],hi[3],tint,2.,true);
      }
    }
    for(const [u,v] of [[8.3,-3.8],[3.6,-7.35],[-2.6,-6.85]]){
      const center=station(u,0,v),y=ground(center[0],center[2])+.93;
      const a=station(u-.55,y,v-.26),b=station(u+.55,y,v-.26),c=station(u+.55,y+.22,v+.28),d=station(u-.55,y+.22,v+.28);
      tri(panel,[a,b,c],[[0,0],[1,0],[1,1]],0xe1dfcc);tri(panel,[a,c,d],[[0,0],[1,1],[0,1]],0xe1dfcc);
    }
  }
  function cove(){
    const fixedY=1881.20;
    for(const [x0,z0,y0,x1,z1,y1,height] of survey.cleetwood.crib||[]){
      const tiers=Math.min(5,Math.ceil(height/.22));
      for(let step=0;step<tiers;step++){
        const offset=.12+step*.205;
        pole(wood,[x0,y0-offset,z0],[x1,y1-offset,z1],.116,step%3===0?0x756853:0x827360,6,.107);
      }
      pole(wood,[x0,y0-height-.18,z0],[x0,y0+.025,z0],.133,0x736457,7);
    }
    function pier(a,b,width,y,mat,tint){
      const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),nx=-dz/len*width/2,nz=dx/len*width/2;
      const p=[[a[0]+nx,a[1]+nz],[b[0]+nx,b[1]+nz],[b[0]-nx,b[1]-nz],[a[0]-nx,a[1]-nz]],lower=p.map(([x,z])=>[x,y-.38,z]),top=p.map(([x,z])=>[x,y,z]);
      for(let j=0;j<4;j++)quad(mat,lower[j],lower[(j+1)%4],top[(j+1)%4],top[j],tint,1.25);
      quad(mat,top[0],top[1],top[2],top[3],tint,1.25,true);
    }
    // NOAA/NAIP temporary float at the northern margin of the old concrete-block wharf.
    pier([2877.1,-3433.3],[2886.9,-3434.2],1.07,fixedY+.18,metal,0xb0a99b);
    pier([2885.1,-3433.8],[2893.65,-3434.2],2.52,fixedY,wood,0xb7afa0);
    for(const x of [2885.4,2889.25,2893.1])for(const z of [-3435.56,-3433.04])pole(metal,[x,1878.8,z],[x,1882.21,z],.105,0x5f635c,8);
    for(let side of [-1,1])pole(metal,[2877.1,fixedY+1.09,-3433.3+side*.58],[2886.9,fixedY+1.04,-3434.2+side*.58],.035,0x818880);
    // Ecoblocks are registered to the photographed failed structure; gaps open toward the lake.
    const edges=[[[2865,-3412.3],[2878.1,-3409.2]],[[2878.1,-3409.2],[2874.4,-3399.3]],[[2874.4,-3399.3],[2864.2,-3402.6]]];
    let index=0;
    for(const [a,b] of edges){const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),n=Math.ceil(len/1.55);
      for(let i=0;i<n;i++,index++){
        if(index===10||index===12)continue;
        const j=i/n,k=(i+.95)/n,x=a[0]+dx*j,z=a[1]+dz*j,xx=a[0]+dx*k,zz=a[1]+dz*k;
        const top=LEVEL+.62+.45*Math.sin(index*.88);pier([x,z],[xx,zz],1.25,top,stone,0xb6b0a1);
      }
    }
    const hutX=2860.05,hutZ=-3419.9,base=ground(hutX,hutZ);
    const hut=(u,y,v)=>[hutX+u*.923-v*.385,y,hutZ+u*.385+v*.923];
    box(hut,wood,-1.55,-2.22,1.55,2.22,base-.86,base+1.92,0x807970,1.20,true);
    for(const s of [-1,1])quad(metal,hut(s*1.73,base+1.89,-2.42),hut(s*1.73,base+1.89,2.42),hut(0,base+2.54,2.42),hut(0,base+2.54,-2.42),0x737c70,1.,true);
    quad(trim,hut(-.5,base+.05,-2.243),hut(.5,base+.05,-2.243),hut(.5,base+1.68,-2.243),hut(-.5,base+1.68,-2.243),0x5b5448,1);
  }
  const LEVEL=1880.78;
  lookout();cove();
  for(const [mat,batch] of batches){
    const geom=new T.BufferGeometry();geom.setAttribute('position',new T.Float32BufferAttribute(batch.pos,3));geom.setAttribute('uv',new T.Float32BufferAttribute(batch.uv,2));geom.setAttribute('color',new T.Float32BufferAttribute(batch.col,3));geom.computeVertexNormals();geom.computeBoundingSphere();
    const mesh=new T.Mesh(geom,mat);mesh.name='Crater Lake · registered structures';scene.add(mesh);
  }
  function roof(x,z){
    let top=-Infinity;
    for(const [a,b,y,ia,ib,ic,id,dy,ey] of collision.get(key(x,z))||[]){const dx=x-a,dz=z-b,u=ia*dx+ib*dz,v=ic*dx+id*dz;if(u>=-1e-6&&v>=-1e-6&&u+v<=1.000001)top=Math.max(top,y+u*dy+v*ey);}
    return top;
  }
  function managed(x,z,r=0){
    const u=.8311*(x+3942.83)-.5561*(z-379.27),v=.5561*(x+3942.83)+.8311*(z-379.27);
    return (u> -5-r&&u<10+r&&v> -8.5-r&&v<9+r)||(x>2849-r&&x<2896+r&&z>-3441-r&&z<-3397+r);
  }
  function blocksLooseClutter(x,z,r=0){
    // The measured summit already contains the exposed andesite. Clear synthetic loose rocks and perch scenery there.
    return managed(x,z,r)||Math.hypot((x+3942.83)/52,(z-379.27)/36)<1+r/45;
  }
  return {roof,managed,blocksLooseClutter};
};

window.craterRimShore = function(loop){
  const measured=window.craterRimSurvey.cleetwood.shore;
  const west=measured[0][0],east=measured[measured.length-1][0];
  function crossing(x){
    for(let i=0;i<loop.length;i++){
      const a=loop[i],b=loop[(i+1)%loop.length];
      if(a[0]>=x&&b[0]<x&&Math.abs(a[1]+3430)<190)return {i,z:a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0])};
    }
  }
  const hi=crossing(east),lo=crossing(west);if(!hi||!lo||hi.i>=lo.i)return loop;
  const local=measured.map(([x,z])=>{
    const d=Math.min(east-x,x-west),edge=x-west<east-x?lo:hi;
    const f=Math.min(1,d/19);return [x,z+(edge.z-z)*(1-f)*(1-f)];
  }).reverse();
  return [...loop.slice(0,hi.i+1),...local,...loop.slice(lo.i+1)];
};

window.applyCleetwoodWater = function(T,water,texture){
  const surface=water.material,map=texture('crater-cleetwood-optics.webp');map.colorSpace=T.NoColorSpace;map.anisotropy=6;
  surface.uniforms.cleetwoodBed={value:map};
  surface.fragmentShader='uniform sampler2D cleetwoodBed;\n'+surface.fragmentShader
    .replace('float shallow=exp(-.47*waterDepth);',`
      vec2 coveUV=vec2((p.x-2460.)/620.,1.-(p.y+3736.)/512.);
      vec2 coveEdge=min(coveUV,1.-coveUV)*vec2(620.,512.);
      float surveyedWater=smoothstep(0.,21.,min(coveEdge.x,coveEdge.y));
      if(surveyedWater>.001){
        float encoded=texture2D(cleetwoodBed,coveUV).a;
        waterDepth=mix(waterDepth,28.*encoded*encoded,surveyedWater);
      }
      float shallow=exp(-mix(.47,.17,surveyedWater)*waterDepth);`)
    .replace('vec3 transmission=exp(-path*vec3(.62,.34,.26));',`
      if(surveyedWater>.001){
        vec2 rayUV=coveUV+(bedPoint-p)*vec2(1./620.,-1./512.);
        vec3 mineral=pow(texture2D(cleetwoodBed,rayUV).rgb,vec3(2.2));
        mineral*=mix(vec3(.69,.76,.82),vec3(1.10,1.01,.87),daylight)*(.92+.22*focus*fine*daylight);
        floorColor=mix(floorColor,mineral*clamp(.53+1.07*dot(gravel,vec3(.23,.63,.14)),.58,1.17),surveyedWater);
      }
      vec3 transmission=exp(-path*mix(vec3(.62,.34,.26),vec3(.34,.16,.091),surveyedWater));`);
};
