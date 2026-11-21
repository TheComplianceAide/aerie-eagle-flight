// Lake Gloriette resort and the two-lane highway. Local survey coordinates are metres east/south.
window.addDixvilleLandmarks = function(T, scene, sites, elevation, ground=elevation) {
  const batches = new Map(), roofs = [], occupied = new Map();
  function material(color, map) {
    const m = new T.MeshStandardMaterial({color, map:map||null, roughness:.89, side:T.DoubleSide});
    batches.set(m, {p:[], uv:[]});
    return m;
  }
  const loader=new T.TextureLoader(),detail=window.makeBuildingFittings(T,scene);
  function image(file){
    const map=loader.load(file);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.anisotropy=8;return map;
  }
  const siding=material(0xfffdf5,image('building-clapboard.webp')),masonry=material(0xdddad5,image('keene-concrete.webp'));
  const shingle=image('building-shingles.webp');
  const roof=material(0xb8553f,shingle),slate=material(0x717775,shingle),trim=material(0xe7dfcc),granite=material(0x948f86),shadow=material(0x534e45);
  const finish=scene.userData.buildingLight.finish;
  finish(siding,'boards',2.34);finish(granite,'fieldstone',2.04);
  finish(roof,'redslate',2.88);finish(slate,'slate',3.02);
  roof.color.setHex(0xbe6851);slate.color.setHex(0xbbbdbb);granite.color.setHex(0xd4d1ca);
  const pavement=material(0xd1c9bd,image('keene-asphalt.webp')), gravel=material(0x958a76),yellow=material(0xe1b653),edge=material(0xe0dace),steel=material(0xa3a5a0),wood=material(0x73685a);
  const stoneMap=new T.TextureLoader().load('dixville-schist.webp');stoneMap.colorSpace=T.SRGBColorSpace;stoneMap.wrapS=stoneMap.wrapT=T.RepeatWrapping;
  // Keep the exposed fracture faces readable in the notch's deep dawn shadow.
  const rock=new T.MeshBasicMaterial({map:stoneMap,color:0xe4e1df,side:T.DoubleSide,vertexColors:true});
  batches.set(rock,{p:[],uv:[]});
  function tri(m,a,b,c,uv=[0,0,1,0,1,1]){const o=batches.get(m);o.p.push(...a,...b,...c);o.uv.push(...uv);}
  function face(m,a,b,c,d,u=1,v=1){tri(m,a,b,c,[0,0,u,0,u,v]);tri(m,a,c,d,[0,0,u,v,0,v]);}
  function block(frame,L,D,base,top,wall,cap=trim,bays=3.1,storey=3.25){
    const ring=[[-L/2,-D/2],[L/2,-D/2],[L/2,D/2],[-L/2,D/2]];
    const a=ring.map(([u,v])=>frame(u,base,v)),b=ring.map(([u,v])=>frame(u,top,v));
    const room=wall===siding||wall===masonry;
    for(let i=0;i<4;i++){
      const j=(i+1)%4,length=i%2?D:L,levels=Math.max(1,Math.round((top-base)/storey));
      face(wall,a[i],a[j],b[j],b[i],room?length/2.8:1,room?(top-base)/2.6:1);
      if(!room||top-base<1.25||length<1.3)continue;
      const nx=(a[j][2]-a[i][2])/length,nz=-(a[j][0]-a[i][0])/length;
      const count=Math.max(1,Math.round(length/bays)),span=length/count;
      const cx=(a[i][0]+a[j][0])*.5,cz=(a[i][2]+a[j][2])*.5;
      detail(cx,cz,(box,sash)=>{
        for(let level=0;level<levels;level++)for(let col=0;col<count;col++){
          const frac=(col+.5)/count;
          const x=a[i][0]+(a[j][0]-a[i][0])*frac,z=a[i][2]+(a[j][2]-a[i][2])*frac;
          const h=b[i][1]-a[i][1],winH=Math.min((h/levels)*.63,2.05),y=a[i][1]+(level+.52)*h/levels;
          const tone=[0x454c48,0x515454,0x797267,0x444b4d,0x4c5757][(col*3+level*7+i)%5];
          sash(x+.083*nx,y,z+.083*nz,nz,-nx,Math.min(span*.59,1.68),winH,wall===masonry?0xbdb9ae:0xe8e4d9,tone);
          if(wall===masonry&&span>2.8){
            box(x+.12*nx,y-winH*.5-.08,z+.12*nz,nz,-nx,span*.65,.15,.30,0x9e9b91);
          }
        }
      });
    }
    face(cap,...b);
  }
  function hip(f,l,d,y,rise,m,hipped=true){
    const a=l/2+.45,b=d/2+.45,k=hipped?Math.max(.05,a-b*.85):a;
    const p=[f(-a,y,-b),f(a,y,-b),f(a,y,b),f(-a,y,b)],r=f(-k,y+rise,0),s=f(k,y+rise,0);
    for(const [i,j,peakA,peakB] of [[0,1,s,r],[2,3,r,s]]){
      const width=2*a/3,depth=Math.hypot(b,rise)/2.4;
      tri(m,p[i],p[j],peakA,[0,0,width,0,(a+k)/3,depth]);
      tri(m,p[i],peakA,peakB,[0,0,(a+k)/3,depth,(a-k)/3,depth]);
    }
    tri(hipped?m:trim,p[1],p[2],s,[0,0,2*b/3,0,b/3,rise/2]);
    tri(hipped?m:trim,p[3],p[0],r,[0,0,2*b/3,0,b/3,rise/2]);
  }
  function frame(x,y,z,angle=0){
    const co=Math.cos(angle),si=Math.sin(angle);return(u,v,w)=>[x+co*u-si*w,y+v,z+si*u+co*w];
  }
  function bounds(x,z,L,D,a,y){roofs.push({x,z,a,L:L/2,D:D/2,y});}
  function wing(x,z,L,D,a,h,rise,stone=false,frontPorch=false){
    const y=elevation(x,z)-.4,f=frame(x,y,z,a),eave=h+.26;
    block(f,L,D,-2.7,.8,granite);block(f,L,D,.8,h,stone?masonry:siding);
    block(f,L+1,D+1,h-.3,eave,stone?slate:trim);hip(f,L+.8,D+.8,eave,rise,stone?slate:roof);
    bounds(x,z,L+.8,D+.8,a,y+eave+rise);
    if(stone){for(const hh of [4.5,14.5,19.1])if(hh<h)block(f,L+.45,D+.45,hh,hh+.28,granite);}
    else {
      for(let u=-L/2+5;u<L/2-3;u+=7){
        const d=(x1,y1,z1)=>f(u+x1,eave+1.0+y1,D*.28+z1);
        block(d,2.25,2.65,-.55,1.53,siding);hip(d,2.5,2.8,1.53,.97,roof,false);
      }
    }
    if(frontPorch){
      const pf=(u,v,w)=>f(u,v,D/2+1.75+w);block(pf,L+.5,3.6,.1,.6,granite);block(pf,L+1,4,3.3,3.62,trim);hip(pf,L,4,3.62,.75,roof);
      for(let u=-L/2;u<=L/2;u+=3.8){
        const post=(i,j,k)=>pf(u+i,j,1.62+k);
        block(post,.28,.29,.6,3.3,trim);block(post,.44,.42,.58,.78,granite);block(post,.49,.46,3.0,3.3,trim);
      }
      for(const sign of [-1,1]){
        const span=L*.44,rail=(u,y,w)=>pf(sign*L*.279+u,y,1.63+w);
        block(rail,span,.145,1.48,1.58,trim);block(rail,span,.13,.73,.81,trim);
        for(let u=-span/2;u<span/2;u+=.29)block((v,y,w)=>rail(v+u,y,w),.064,.071,.80,1.48,trim);
      }
    }
    return {f,y};
  }
  function turret(x,z,r,y,h,wall,lid){
    const p=[],q=[],s=[];
    for(let i=0;i<10;i++){const a=Math.PI*2*i/10;p.push([x+r*Math.cos(a),y,z+r*Math.sin(a)]);q.push([p[i][0],y+h,p[i][2]]);s.push([x+(r+.4)*Math.cos(a),y+h+.2,z+(r+.4)*Math.sin(a)]);}
    for(let i=0;i<10;i++){const j=(i+1)%10;face(wall,p[i],p[j],q[j],q[i],1,Math.round(h/3.2));face(trim,q[i],q[j],s[j],s[i]);tri(lid,s[i],s[j],[x,y+h+r*.88,z]);}
    if(h>5)detail(x,z,(box,sash)=>{
      const floors=Math.max(1,Math.round(h/3.3));
      for(let side=0;side<10;side++){
        const a=(side+.5)*Math.PI/5,nx=Math.cos(a),nz=Math.sin(a),midR=r*Math.cos(Math.PI/10)+.08;
        for(let level=0;level<floors;level++)sash(x+midR*nx,y+(level+.52)*h/floors,z+midR*nz,nz,-nx,Math.min(1.65,r*.36),Math.min(2,h/floors*.64),0xd7d3c8,(level+side)%3?0x434c4c:0x757067);
      }
    });
    bounds(x,z,2*r,2*r,0,y+h+r*.88);
  }
  // Dix House has a long white lake-facing verandah. Hampshire House turns southeast at the eastern end.
  wing(-245,-340,113,16,-.099,13.1,4.5,false,true);
  wing(-236,-353,42,11,1.455,12.3,4.2);wing(-255,-330,32,15,1.47,12.5,4);
  const hampshireRoof=window.makeDixvilleHampshireHouse(T,{material,image,tri,face,block,scene});
  const haleRoof=window.makeDixvilleHale(T,{material,image,tri,face,block,frame,detail,elevation});
  const entry=frame(-243,elevation(-243,-333),-333,-.10);
  block(entry,12.1,5.8,.3,8.7,siding);hip(entry,12.7,6.1,8.7,3.8,roof,false);
  turret(-301,-340,8.2,elevation(-301,-340)-.6,13.5,siding,roof);
  turret(-229,-322,6.4,elevation(-229,-322)-.4,12.8,siding,roof);
  sites.houses.forEach((ring,i)=>{
    if(!ring.length||i===0||i===3||i===4)return;
    let longest=0,angle=0;
    for(let j=0;j<ring.length;j++){const [x,z]=ring[j],[u,v]=ring[(j+1)%ring.length];const d=Math.hypot(u-x,v-z);if(d>longest){longest=d;angle=Math.atan2(v-z,u-x);}}
    const co=Math.cos(angle),si=Math.sin(angle),us=ring.map(([x,z])=>x*co+z*si),vs=ring.map(([x,z])=>-x*si+z*co);
    const lo=Math.min(...us),hi=Math.max(...us),left=Math.min(...vs),right=Math.max(...vs),u=(hi+lo)/2,v=(right+left)/2;
    const x=co*u-si*v,z=si*u+co*v,L=hi-lo,D=right-left,y=elevation(x,z),h=Math.min(6.4,Math.max(3.2,D*.39)),f=frame(x,y,z,angle);
    if(i===15){
      // The low boathouse reads as a white band with an open viewing pavilion.
      block(f,L,D,-1.5,3.1,trim);block(f,L+.6,D+.7,3.1,3.45,granite);
      const pavilion=(u,v,w)=>f(L*.18+u,v,w);
      for(const side of [-1,1])for(const u of [-4,-2,0,2,4])block((a,b,c)=>pavilion(u+a,b,side*2.9+c),.18,.18,3.4,5.6,trim);
      hip(pavilion,9.1,6.4,5.6,1.75,slate);
    }else{block(f,L,D,-1.5,h,siding);hip(f,L,D,h,Math.min(3.6,D*.31),slate);}bounds(x,z,L,D,angle,y+h+Math.min(3.6,D*.31));
  });
  // Bucket short road segments for vegetation exclusion, including their verges.
  function occupy(x,z,r){const k=Math.floor(x/12)+','+Math.floor(z/12);let list=occupied.get(k);if(!list)occupied.set(k,list=[]);list.push([x,z,r*r]);}
  // The NH state's six-inch image resolves the lane stripe centers at the
  // notch, the flared rail, and the gravel track below the highway shoulder.
  const lanePairs=Uint8Array.from(atob('MncxdzV0OXQ7dDl0NnM2cTh0PHE8bT9uQ25Gb0hvSm1JbUhuR29Jc0l0RHE+bj1tPW09bT1tPW09bT1tPW09bT5tQW9DcUFxQnNDckJxP3E9cD1uPnA8cDpwOnE6cDpuPG0/bT9yP3dBek19VX1WeVFuUHBQblBtTW1Jbjp7OHw/fDZzPHQ7cjlxN3E2cTZxNnM3cjlxOXI1dDB8NHg5dDx1PXU9dz12'),c=>c.charCodeAt(0));
  const edgeBlend=(x,a,b)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
  function lanesAt(x,z){
    if(x<=292||x>=796||z<290||z>416)return null;
    const f=(x-292)/6,i=Math.min(lanePairs.length/2-2,Math.floor(f)),t=Math.min(1,f-i),k=i*2;
    const weight=edgeBlend(x,292,338)*(1-edgeBlend(x,772,796));
    return {shift:weight*(lanePairs[k]*(1-t)+lanePairs[k+2]*t)/32,
      edgeWidth:3.30+(weight*((lanePairs[k+1]*(1-t)+lanePairs[k+3]*t)/32-3.30))};
  }
  const roadHere=[];
  function realRoad(x){
    if(!roadHere.length||x<roadHere[0].x||x>roadHere[roadHere.length-1].x)return null;
    let a=0,b=roadHere.length-1;
    while(b-a>1){const m=(a+b)>>1;if(roadHere[m].x>x)b=m;else a=m;}
    const p=roadHere[a],q=roadHere[b],v=(x-p.x)/Math.max(.001,q.x-p.x);
    return {z:p.z+(q.z-p.z)*v,y:p.y+(q.y-p.y)*v,tilt:p.tilt+(q.tilt-p.tilt)*v,
      outer:p.outer+(q.outer-p.outer)*v};
  }
  const apron=[[635.0,387.1],[649.32,386.46],[663.65,385.33],[674.43,384.69],[688.92,383.08],[702.12,380.98],[714.35,379.05],[728.51,376.48],[742.68,374.06],[756.84,371.65],[771.65,368.27],[785.01,366.5],[804.16,363.6],[804.0,369.72],[791.61,371.97],[779.86,374.39],[772.61,377.12],[767.46,380.98],[763.44,382.59],[756.36,383.24],[750.56,383.08],[746.7,382.27],[741.87,381.47],[739.3,383.4],[733.82,386.78],[728.35,388.23],[722.08,390.16],[716.92,391.93],[709.04,393.22],[700.99,395.47],[695.84,397.4],[691.49,398.85],[688.92,398.05],[686.83,396.92],[684.9,395.15],[683.45,393.7],[682.0,393.54],[678.3,396.28],[674.11,399.66],[668.16,403.36],[663.81,404.97],[657.69,405.45],[658.34,402.07],[661.07,399.33],[665.1,397.24],[669.77,394.83],[673.95,391.29],[675.72,389.03],[673.63,387.91],[667.03,389.03],[659.14,389.68],[649.81,391.77],[640.63,392.73],[635.0,393.22]];
  const apronBounds=[635,343,804,428];
  function inApron(x,z){
    if(x<635||x>804||z<343||z>428)return false;
    let inside=false;
    for(let j=apron.length-1,i=0;i<apron.length;j=i++){
      const a=apron[i],b=apron[j];
      if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    }
    return inside;
  }
  function openRoadAt(x,z,radius=0){
    if(x<345-radius||x>808+radius||z<300-radius||z>433+radius)return false;
    const road=realRoad(x);
    if(road&&Math.abs(z-road.z)<road.outer+radius)return true;
    if(inApron(x,z))return true;
    if(radius<=0||x<635-radius||x>804+radius||z<343-radius||z>428+radius)return false;
    for(let i=0,j=apron.length-1;i<apron.length;j=i++){
      const [u,v]=apron[j],[a,b]=apron[i],dx=a-u,dz=b-v;
      const t=Math.max(0,Math.min(1,((x-u)*dx+(z-v)*dz)/(dx*dx+dz*dz||1)));
      if((x-u-t*dx)**2+(z-v-t*dz)**2<radius*radius)return true;
    }
    return false;
  }
  function shoulderHeight(x,z){
    const natural=ground(x,z)+.038,road=realRoad(x);
    if(!road)return natural;
    const across=z-road.z,taper=edgeBlend(across,road.outer-.25,road.outer+1.6);
    const shoulder=road.y+road.tilt*across+.038;
    return shoulder+(natural-shoulder)*taper;
  }
  function drawTurnout(){
    const tex=image('dixville-notch-turnout.webp');tex.wrapS=tex.wrapT=T.ClampToEdgeWrapping;
    const rough=image('shore-cobble.webp');rough.colorSpace=T.NoColorSpace;
    const m=new T.MeshStandardMaterial({map:tex,roughness:.94,alphaTest:.26,side:T.DoubleSide,
      polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2});
    m.onBeforeCompile=program=>{
      program.uniforms.turnoutGravel={value:rough};
      program.vertexShader='attribute float roadMargin;varying float shoulderMargin;varying vec2 turnoutMetres;\n'+program.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nturnoutMetres=position.xz;shoulderMargin=roadMargin;');
      program.fragmentShader='uniform sampler2D turnoutGravel;varying float shoulderMargin;varying vec2 turnoutMetres;\n'+program.fragmentShader.replace('#include <map_fragment>',
        '#include <map_fragment>\nif(shoulderMargin<0.)discard;vec2 st=mat2(.31,.19,-.19,.31)*turnoutMetres;float aggregate=dot(texture2D(turnoutGravel,st).rgb,vec3(.30,.52,.18));diffuseColor.rgb*=.77+.45*aggregate;');
    };
    const g=new T.BufferGeometry(),vertices=[],uv=[],margin=[],indices=[],shared=new Map();
    const [left,top,right,bottom]=apronBounds,step=1.25;
    function v(i,j){
      const k=j*170+i;if(shared.has(k))return shared.get(k);
      const id=vertices.length/3,x=left+i*step,z=top+j*step;
      const road=realRoad(x);margin.push(road?z-road.z-road.outer+.12:100);
      vertices.push(x,shoulderHeight(x,z),z);uv.push((x-left)/(right-left),1-(z-top)/(bottom-top));shared.set(k,id);return id;
    }
    for(let j=0;top+j*step<bottom;j++)for(let i=0;left+i*step<right;i++){
      const x=left+(i+.5)*step,z=top+(j+.5)*step;
      if(!inApron(x,z)&&!inApron(x-step,z)&&!inApron(x+step,z)&&!inApron(x,z-step)&&!inApron(x,z+step))continue;
      const a=v(i,j),b=v(i+1,j),c=v(i,j+1),d=v(i+1,j+1);indices.push(a,c,b,b,c,d);
    }
    g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
    g.setAttribute('roadMargin',new T.Float32BufferAttribute(margin,1));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingSphere();
    const surface=new T.Mesh(g,m);surface.name='Route 26 · lower gravel turnout';scene.add(surface);
  }
  const railSections=[];
  function drawGorgeRail(){
    const metal=material(0xc2c6c6),inside=material(0x8d9390),postWood=material(0x948b74);
    metal.roughness=.48;metal.metalness=.23;inside.roughness=.62;inside.metalness=.19;
    const west=[],east=[];
    for(let x=358;x<=668;x+=3.85){const r=realRoad(x);if(r)west.push([x,r.z+r.outer+.35]);}
    // The terminal curves away and falls toward the lower road. A second
    // terminal turns back toward Route 26 at the eastern end of the apron.
    const fromImage=(u,v)=>[635+u*169/1050,343+v*169/1050];
    for(const p of [[212,280],[239,278],[265,278],[289,281],[310,286],[326,292],[336,299]])west.push(fromImage(...p));
    for(const p of [[813,224],[829,208],[849,193],[868,183],[884,176],[899,172]])east.push(fromImage(...p));
    const eastEnd=[[953,173],[969,168],[989,164],[1012,160],[1048,156]].map(p=>fromImage(...p));
    const cross=[[-.060,.030],[-.032,.005],[-.095,-.039],[-.123,-.079],[-.056,-.130],
      [-.021,-.157],[-.060,-.193],[-.123,-.237],[-.087,-.269],[-.036,-.288],[-.063,-.309]];
    function rail(points,lowerA,lowerB){
      let distance=0,frames=[];
      for(let k=0;k<points.length;k++){
        const [x,z]=points[k],prev=points[Math.max(0,k-1)],next=points[Math.min(k+1,points.length-1)];
        if(k)distance+=Math.hypot(x-points[k-1][0],z-points[k-1][1]);
        const dx=next[0]-prev[0],dz=next[1]-prev[1],d=Math.hypot(dx,dz)||1,ux=dx/d,uz=dz/d;
        frames.push({x,z,distance,ux,uz});
      }
      const length=distance;
      for(let k=0;k<frames.length;k++){
        const q=frames[k],base=shoulderHeight(q.x,q.z),lower=(lowerA?.13*(1-edgeBlend(q.distance,0,6)):0)+(lowerB?.15*edgeBlend(q.distance,length-6,length):0);
        q.h=base+.82-lower;
        const point=(side,level)=>[q.x-q.uz*side,q.h+level,q.z+q.ux*side];
        q.profile=cross.map(p=>point(...p));
        if(k){const a=frames[k-1];for(let n=1;n<cross.length;n++)face(n===1||n===6?inside:metal,a.profile[n-1],q.profile[n-1],q.profile[n],a.profile[n]);
          railSections.push([a.x,a.z,q.x,q.z,a.h,q.h]);}
      }
      // The ortho resolves post centers every six feet, three inches. Keep
      // those posts vertical even where the galvanized face follows the grade.
      let k=0;
      for(let u=.45;u<length-.18;u+=1.905){
        while(k<frames.length-2&&frames[k+1].distance<u)k++;
        const a=frames[k],b=frames[k+1],t=(u-a.distance)/(b.distance-a.distance),x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,
          h=a.h+(b.h-a.h)*t,f=frame(x-a.uz*.14,h,z+a.ux*.14,Math.atan2(a.uz,a.ux));
        block(f,.16,.19,-1.24,-.065,postWood);
        block(f,.17,.13,-.34,-.12,inside);
      }
      for(const q of [frames[0],frames[frames.length-1]]){
        const cap=frame(q.x,q.h,q.z,Math.atan2(q.uz,q.ux));
        block(cap,.23,.25,-.35,.035,metal);
      }
    }
    for(const [pts,lo,hi] of [[west,true,true],[east,true,false],[eastEnd,false,false]])if(pts.length>1)rail(pts,lo,hi);
  }

  function road(path,main){
    const width=main?3.75:2.05, pts=[];
    for(let i=1;i<path.length;i++){
      const [x,z]=path[i-1],[u,v]=path[i],d=Math.hypot(u-x,v-z);
      const close=main&&Math.max(x,u)>345&&Math.min(x,u)<808&&Math.max(z,v)>290&&Math.min(z,v)<433;
      const n=Math.ceil(d/(close?1:4));
      for(let j=0;j<n;j++)pts.push([x+(u-x)*j/n,z+(v-z)*j/n]);
    }
    pts.push([...path.at(-1)]);if(pts.length<2)return;
    if(main)for(const p of pts){const measured=lanesAt(...p);if(measured)p[1]+=measured.shift;}
    let prior,phase=0;
    for(let i=0;i<pts.length;i++){
      const [x,z]=pts[i],[x0,z0]=pts[Math.max(0,i-1)],[x1,z1]=pts[Math.min(pts.length-1,i+1)],l=Math.hypot(x1-x0,z1-z0)||1,nx=-(z1-z0)/l,nz=(x1-x0)/l;
      const record=main&&lanesAt(x,z),edgeAt=record?.edgeWidth||3.30;
      const shoulder=record?Math.max(width,edgeAt+.27):width;
      const layers=main?[[-shoulder-.83,shoulder+.83,gravel],[-shoulder,shoulder,pavement],[-.16,-.056,yellow],[.056,.16,yellow],[-edgeAt-.07,-edgeAt+.07,edge],[edgeAt-.07,edgeAt+.07,edge]]:[[-width,width,gravel]];
      // Put stripes and asphalt on precisely the same cross slope to avoid disappearing paint.
      const yL=elevation(x-nx*(width+1),z-nz*(width+1)),yR=elevation(x+nx*(width+1),z+nz*(width+1));
      const centre=Math.max(elevation(x,z),(yL+yR)/2);
      const pt=(a,dy)=>[x+nx*a,centre+(yR-yL)*a/(2*(width+1))+.38+dy,z+nz*a];
      if(main&&x>=330&&x<=819&&z>290&&z<430){
        roadHere.push({x,z,y:centre+.38,tilt:(yR-yL)*nz/(2*(width+1)),outer:shoulder+.60});
      }
      const row=layers.map(([a,b],j)=>[pt(a,.025*Math.min(j,2)),pt(b,.025*Math.min(j,2))]);
      const photoDrive=!main&&x>-68&&x<112&&z>-304&&z<-179&&ownsParkland(x,z);
      if(prior&&!photoDrive)layers.forEach(([a,b,m],j)=>{
        if(record&&m===pavement){
          // Split the paved ribbon at its crown; on twisting cross slopes a
          // full-width diagonal can crest above its own double yellow paint.
          const split=pair=>pair[0].map((v,k)=>(v+pair[1][k])*.5),p=split(prior[j]),q=split(row[j]);
          face(m,prior[j][0],p,q,row[j][0],(b-a)/8,1);
          face(m,p,prior[j][1],row[j][1],q,(b-a)/8,1);
        }else face(m,prior[j][0],prior[j][1],row[j][1],row[j][0],(b-a)/4,1);
      });
      const lakeRail=x>=-300&&x<=135&&z<165;
      if(main && lakeRail && prior){
        // The reservoir edge is north of the road. The gorge photograph looks
        // west with the guardrail on the downhill south shoulder.
        const rail=(nz>0?-1:1)*(width+.52),side=layers.length;
        const bottom=pt(rail,.70),top=pt(rail,.93);row[side]=[bottom,top];
        if(prior[side])face(steel,prior[side][0],bottom,top,prior[side][1]);
        if(phase++%2===0){const f=frame(bottom[0],bottom[1],bottom[2]);block(f,.19,.22,-.83,.18,wood);}
      }
      occupy(x,z,width+2.3);prior=row;
    }
  }
  sites.drives.forEach(p=>road(p,false));sites.highway.forEach(p=>road(p,true));
  roadHere.sort((a,b)=>a.x-b.x);drawTurnout();drawGorgeRail();
  function roadsideSign(x,z,angle){
    const f=frame(x,elevation(x,z),z,angle),c=document.createElement('canvas');
    c.width=128;c.height=160;const g=c.getContext('2d');
    g.fillStyle='#28312e';g.fillRect(0,0,128,160);
    g.fillStyle='#eeeada';g.beginPath();
    for(const [i,j] of [[9,11],[116,11],[117,91],[107,108],[99,107],[89,127],[72,127],[60,149],[41,139],[27,138],[19,120],[9,119]])g.lineTo(i,j);
    g.closePath();g.fill();g.textAlign='center';g.fillStyle='#212520';g.font='bold 48px sans-serif';g.fillText('26',64,82);g.font='bold 19px sans-serif';g.fillText('N H',65,38);
    const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;
    const enamel=material(0xffffff,tex);block(f,.10,.09,-.3,2.72,steel);
    face(enamel,f(-.36,1.89,0),f(.36,1.89,0),f(.36,2.79,0),f(-.36,2.79,0));
  }
  roadsideSign(-173,39,-1.39);
  // The black/yellow obstruction marker stands at the end of the eastern
  // guardrail. Project onto the actual road edge so its post meets the gravel.
  const stripeCanvas=document.createElement('canvas');stripeCanvas.width=64;stripeCanvas.height=160;
  const paint=stripeCanvas.getContext('2d');
  paint.fillStyle='#d49737';paint.fillRect(0,0,64,160);paint.fillStyle='#262823';
  for(let y=-100;y<220;y+=50){paint.beginPath();paint.moveTo(0,y);paint.lineTo(64,y+44);paint.lineTo(64,y+68);paint.lineTo(0,y+24);paint.fill();}
  const stripeMap=new T.CanvasTexture(stripeCanvas);stripeMap.colorSpace=T.SRGBColorSpace;
  const marker=material(0xffffff,stripeMap);
  // The nearer end damper stands above the flared guardrail. The second
  // marker faces the same direction on the lower access track.
  for(const [x,z,rot,h,w] of [[689.0,391.25,-1.46,2.22,.31],[678.65,399.12,-1.41,1.82,.24]]){
    const grade=shoulderHeight(x,z),f=frame(x,grade,z,rot);
    block(f,.077,.047,-.13,h-.15,steel);
    face(marker,f(-w/2,h-.79,.045),f(w/2,h-.79,.045),f(w/2,h,.045),f(-w/2,h,.045));
    bounds(x,z,w,.09,rot,grade+h);
  }
  // Loose blocks sit at the bases of the measured slopes, uphill of the travel lanes.
  let seed=592;function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
  sites.highway.forEach(path=>{
    for(let i=1;i<path.length;i++){
      const [u,v]=path[i-1],[w,t]=path[i],length=Math.hypot(w-u,t-v);if(length<.1)continue;
      const nx=-(t-v)/length,nz=(w-u)/length;
      for(let d=rand()*6;d<length;d+=4+rand()*8){
        const x=u+(w-u)*d/length,z=v+(t-v)*d/length;if(x< -350||x>1200||z>800)continue;
        const side=elevation(x+12*nx,z+12*nz)>elevation(x-12*nx,z-12*nz)?1:-1;
        const dist=7+17*rand(),px=x+side*nx*dist,pz=z+side*nz*dist,y=elevation(px,pz);
        if(y<elevation(x,z)+.9||inApron(px,pz))continue;
        const radius=.35+rand()**2*1.6,base=frame(px,y,pz,rand()*6.28);
        const rim=[],cap=[];
        for(let j=0;j<6;j++){
          const a=j*Math.PI/3,scale=radius*(.79+.40*rand());
          rim.push(base(Math.cos(a)*scale,-.63*radius,Math.sin(a)*scale*.81));
          cap.push(base(Math.cos(a)*scale*.77+.12*radius,(.32+.40*rand())*radius,Math.sin(a)*scale*.60));
        }
        for(let j=0;j<6;j++){const k=(j+1)%6;face(rock,rim[j],rim[k],cap[k],cap[j]);tri(rock,cap[j],cap[k],base(-.13*radius,.75*radius,.15*radius));}
      }
    }
  });
  // The one-metre survey resolves the split crest of Table Rock directly.
  const group=new T.Group();group.name='Dixville Notch landmarks';
  for(const [m,{p,uv}] of batches)if(p.length){
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.computeVertexNormals();
    if(m===rock){
      const normal=g.attributes.normal,c=new Float32Array(normal.count*3);
      for(let i=0;i<normal.count;i++){
        const up=Math.abs(normal.getY(i)),sideLight=Math.abs(normal.getX(i)*.72+normal.getZ(i)*.39);
        const light=.48+.27*up+.21*sideLight;
        c.set([light*.98,light,light*1.05],3*i);
      }
      g.setAttribute('color',new T.BufferAttribute(c,3));
    }
    const mesh=new T.Mesh(g,m);mesh.name=m.name||'Dixville '+(m===pavement?'Route 26 asphalt':m===masonry?'Hampshire House masonry':m===siding?'clapboard buildings':'landmark detail');group.add(mesh);
  }
  scene.add(group);
  function clearance(x,z,altitude){
    if(x<-650||x>1460||z<-700||z>1350)return -Infinity;
    let h=Math.max(hampshireRoof(x,z),haleRoof(x,z,altitude));for(const r of roofs){const dx=x-r.x,dz=z-r.z;if(Math.abs(dx)>r.L+r.D||Math.abs(dz)>r.L+r.D)continue;
      const co=Math.cos(r.a),si=Math.sin(r.a);if(Math.abs(dx*co+dz*si)<=r.L&&Math.abs(dz*co-dx*si)<=r.D)h=Math.max(h,r.y);}
    if(x>=357&&x<=805&&z>=315&&z<=416)for(const [x0,z0,x1,z1,a,b] of railSections){
      if(x<Math.min(x0,x1)-.21||x>Math.max(x0,x1)+.21||z<Math.min(z0,z1)-.21||z>Math.max(z0,z1)+.21)continue;
      const dx=x1-x0,dz=z1-z0,t=Math.max(0,Math.min(1,((x-x0)*dx+(z-z0)*dz)/(dx*dx+dz*dz)));
      if(Math.hypot(x-x0-t*dx,z-z0-t*dz)<.19)h=Math.max(h,a+(b-a)*t);
    }
    return h;
  }
  function ownsParkland(x,z){
    const estate=x>=-380&&x<=-68&&z>=-432&&z<=-172?window.dixvilleResortPark:
      x>=-68&&x<=112&&z>=-304&&z<=-179?window.dixvilleHalePark:null;
    if(!estate)return false;
    let inside=false;
    for(let i=0,j=estate.boundary.length-1;i<estate.boundary.length;j=i++){
      const [a,b]=estate.boundary[i],[c,d]=estate.boundary[j];
      if((b>z)!==(d>z)&&x<(c-a)*(z-b)/(d-b)+a)inside=!inside;
    }
    return inside;
  }
  function inClearing(x,z,observed=false){
    if(!observed&&ownsParkland(x,z))return true;
    if(observed)return Number.isFinite(clearance(x,z));
    if(openRoadAt(x,z))return true;
    if(x>-327&&x< -130&&z>-365&&z<-285||Number.isFinite(clearance(x,z)))return true;
    const i=Math.floor(x/12),j=Math.floor(z/12);
    for(let ix=i-1;ix<=i+1;ix++)for(let iz=j-1;iz<=j+1;iz++){const list=occupied.get(ix+','+iz);if(list?.some(([u,v,rr])=>(x-u)**2+(z-v)**2<rr))return true;}
    return false;
  }
  const lawnTrees=[[-297,-266,16],[-276,-249,15],[-255,-291,18],[-239,-273,16],[-200,-250,15],[-195,-264,19],[-129,-275,16]].map(([x,z,height],i)=>({x,z,y:elevation(x,z),height,width:height*.40,seed:.23+i*.09}));
  const mappedTrees=window.dixvilleResortPark.crowns.concat(window.dixvilleHalePark.crowns).map(([x,z,height,width,fir],i)=>({
    x,z,y:elevation(x,z),height,width,seed:(.17+i*.619)%1,conifer:!!fir,observedBalsams:true
  }));
  return {clearance,inClearing,ownsParkland,lawnTrees:[...lawnTrees.filter(t=>!ownsParkland(t.x,t.z)),...mappedTrees],
    openRoadAt:(x,z,radius)=>openRoadAt(x,z,radius)||ownsParkland(x,z)};
};


// A georegistered weathering field is confined to the exposed Table Rock spur.
// These tiles already replace the regional detail orthophoto with a 6-inch
// local image. Its spare sampler can carry this bounded surface instead.
window.finishDixvilleTableRock=function(material,texture){
  material.uniforms.detailOrtho={value:texture('dixville-ledge-surface.webp')};
  const irradiance='c=pow(max(c,vec3(0.)),vec3(2.2))*(ambient+direct)*(1.+(.32+.42*desert)*relief);';
  material.fragmentShader=material.fragmentShader.replace(irradiance,irradiance+`
    if(xz.x>-24.&&xz.x<42.&&xz.y>311.&&xz.y<372.&&wp.y>728.){
      vec2 offset=xz-vec2(-5.,354.);
      float run=dot(offset,vec2(.8660254,-.5));
      float crossRidge=dot(offset,vec2(.5,.8660254));
      float longitudinal=smoothstep(-10.,-3.8,run)*(1.-smoothstep(33.,40.,run));
      float rightEdge=mix(5.7,3.2,smoothstep(13.,32.,run));
      float westWall=smoothstep(-9.,-5.6,crossRidge);
      float bare=longitudinal*westWall*(1.-smoothstep(rightEdge-.35,rightEdge+1.3,crossRidge));
      vec2 fieldUV=vec2((run+12.)/54.,1.-(crossRidge+9.)/21.);
      vec4 surface=texture2D(detailOrtho,clamp(fieldUV,0.,1.));
      vec2 faceUV=vec2(run*.204,(wp.y-.19*run)*.212);
      vec4 split=texture2D(notchStone,faceUV);
      float upward=smoothstep(.29,.78,normal.y);
      float photoLichen=smoothstep(.43,.68,lum(surface.rgb));
      vec3 side=split.rgb*vec3(1.08,1.057,1.065)*(.86+.28*split.a);
      side=mix(side,surface.rgb*vec3(.92,.94,.96),.23+photoLichen*.22);
      vec3 bed=mix(side,surface.rgb,upward);
      float grain=mix(split.a,surface.a,upward);
      vec3 gx=dFdx(wp),gy=dFdy(wp),rx=cross(gy,normal),ry=cross(normal,gx);
      float jacobian=dot(gx,rx);
      vec3 g=(rx*dFdx(grain)+ry*dFdy(grain))*sign(jacobian)/max(.0001,abs(jacobian));
      vec3 nd=normalize(normal-clamp(.052*(1.-smoothstep(38.,155.,d)),0.,.052)*g);
      float rockSun=max(0.,dot(nd,sun));
      vec3 localLight=ambient+direct*clamp((.21+rockSun)/(.21+incidence),.48,1.52);
      float recess=.78+.25*grain;
      vec3 dressed=pow(max(vec3(0.),bed),vec3(2.2))*localLight*recess;
      c=mix(c,dressed,bare*(1.-smoothstep(480.,1050.,d))*.985);
    }
    `);
};

// USGS 3DEP's one-metre survey resolves the cut shoulder and lower gravel
// track. Decode it into the native quarter-metre Dixville terrain grid.
window.dixvilleTurnoutHeights=function(){
  const bytes=Uint8Array.from(atob('hAsCAwD//fz/AQH+/gEA/vj7+vr8/Pv7/v7+/wIAAgT///8DAP8B/v3/AP/+/gAA/gD+/gD///7///79+vn6/////v8C//z9/f79/P7/AP/+/P7+//39/v3++/r7+/v8/Pz9/v7/AP0BAPz+AgH6/AL//f3+/v8BAQAEBAL+/gABAQD///9/CwECAP79/gAA//8AAQD9+fv6+vv7/Pz+AP8C/wABAf//Av8B/////wD///4BAP4AAP/+/f3//gD//f37/Pv+/v//Af77/f79/f39//8BAPv8/f/+/v7//v76+fr8/Pr7+/7+/v8B+/0AAf8C/vz9Af79/v7+AAEBAQMDA//+/gAB/wD//3kLAAH+AAD+/wAA/wD//v77/Pr5+vz8/f4BAQL+AAIA//8AAAD+/gAA/wD+AAMC/v///v78/f7+/wD+/Pz9/P3+AP38/f7+/v38/v3+/wEA/Pz+///9/v/+/vv6+/r8+fn8/f3/AAL8+v4CAQD//f0A//7+//0AAQECAwUE/vz8AP7/AQAAcwsAAP//AAAAAv39/v/+/v77+/v5/P/9/QEBAv4BAgD+/gAA/v7+/wAA//8BAQP//v4B//z9/v38///8+/7+/v/+/Pr+/v7+/vz+/f7+AP7//v/+///+AP79+/v7+vr6+fr8/QAA//78//8BAP/+/AAB//3+/wABAgIDBQL//Pv9/wD/AQBsC/8BAP7/AgL//Pz9AP7+/vz7+/z+/v3+AAEC/wICAP78/vwC//7/////Av0BAvz/AQAA/fv9+/4B/f39+///AP36/v3+//79/f79/v/+/gD+AP4AAAAA/vz6+vv6+/r6+vv+Af///fz+/wAA/v//AQT++/3+AAECAwIDAwD8+/wC//4AAGQLAQL/AAAB//z7/f7//v/9/P79/P/+/P8CAQEAAQIA/v39/v3//v7//wD9AAAA////AAD9+/37/v/9/v79/QD9/f3+/v3///7//f7+/wD//v0B/QIAAf79+/r8+/v7+/r6+gAB//79/P4A/v8A/wEBAv79/P7/AQICAgMBAPv9/gEB/wAAXQsCAgAAAQH9+vv8/v///v79/v/7//7+/wEDAgD/AQL+/f38/f3+//////4A/wD//////v38/fz+/fwA/f7+/v79/f/+/v/+AAD+///+//z9/gL/AAIB/Pz8+/z8+/z7+vr7/wD//f/+/v79Af//AQACAP/8/v8BAAIBAgD///4BAQD+AAFYCwEC/wEA//77+f7+/f/+/v/+/v7+//4AAgMCAP4BAP/9/P39/v3//f7/AP/+Af4A/v7+/f79/P3+/P39//79//3+/v4A//8BAQD9/f7/+/0AAgEB///7/fz8/fz7/Pz7+/v+AP/+/v7//f7//wABAAAAAQD9/wD/AgAAAgEC/gAB//3+AFAL/gICAfz+//z8/v79/v7//v8B//3+/wICAgH+/wD/AP/7/P3+/v3+//7///8B///+/f/9//39/P38/vv+//z+/f////8A/gEBAP39/wD9/gACAgD8/P79/P38/Pz8/Pz6/AAA///9/v7+/f4A/wAA/wED/wAA//8A//8EAv8AAv///v7/RQv/AwT9/f/9/v77/v/9//7+/gMB/v7/AgIBAP7/Af8A//v7/f/+/P4A/f8A//////7+//3//f39/f37+/3//f3//v///wAAAAD//f3//QEAAAH//v7+/v39/vv//Pv8/fv8AAD//v7+/f7+/f4AAQD/AQACAwL+/v7/AQIC/gEB/v/+/vw8CwEBAf///v/+/Pv9//7///7/AAMA//wFAgAA/gEA+AID/Pr9/v79/v7/AP/+//////7+/v38//79/vr7+/3//f4A//4B/gAAAP/9/f7+/wAC//7+//////39/AD9/Pz8/fz/AP/+/f38//7+//4BAAEBAgMDAP///AACA//9AAH///39/TML/wABAAH//wD79/7/////AP4AAv79/gMEAgEAAfn8AgP4/v/9//4A//7//v///v///v/9//3+/Pz9/Pr7/f79//8A////AP///vz+//7+AAAA/v8A/wAAAP39Avv7/Pz9/f4A/Pz9/v7////+/wABAQMDAwIAAf/6/wMB+gAAAP4B//8AJgsAAAQAAgH+/ff6/QD/AAEA/v4A//4BAgIBAAL8/P8B/v7//wD9/wH//v///f///v/+/wH//vr7+vr8/fz9/P7///8AAAD///7+/f7+//79Af/+//8AAQEB/v7//Pz9/P3+/v76+/7/AP7/////AAEDBAMDBAIB/Pn8/v35A/4AAf4BAgIbCwABAQUCAfz7+fn9AAH/AP///wH//gIBAP8CAvv+AQD+/v4A/wAAAv////7////9/gH////89/v7+/79+/z9/v3//gABAf///v39/f///P7///0AAAABAQH//v/7+/wBAP79/Pr6/gAA//////8BAgMGBQUF/vz8+/r8+fv/AAEC/P0BAxELAf8DBQL//vr7+P7/AP/9/wH//wABAgD+AQH+/wABAv3+/wD/AQEAAAH+/gAA/v3+/wD+//z5+fz7/f77/P38/f///wEBAf79/fz+AP36//3+/gEAAgEBAf78/v38+wID//z8+vv9/wAAAP/+AAEDBQUEAwH/+/38+fj6+/wBBAL9/QACBQsBAgMGAP/++vv5/v///v7//wAAAAIAAf8BAf8AAP8AAP/+/wEBAgIAAP7/AP/+/f79Av79+/r6/P3+/Pz8+/v9AP8AAAH//v3+/P7//vv8/f3+AAEDAQEB/fv9/v75BAQA/vz6+v4B/////v//AgYCAgMB/////fv5+Pv5/AEFAf7////7CgEBBAUA//75+vz//wD+/v3//wIBAQIA/wEBAAH//wD/AP3/AQEDAAIA/f//Af37/v8A//78+fj+/wD9/Pv6/Pz+/gH/Af/+/v38//79/Pr9/P0BAwMB//7/+/7+/P0FAf0E/fv7/wD9//7+/AEABgMCAgL+AgD5+/r5+vf9/gQB/P8CAPEKAgADBP////n7/f4BAP7//P//AgIDAP8BAQEBAAD/AAD9/wAAAAEBAP7///8C/Pz+/v8A//n4/P0BAf76+/v8/vz9AAAB///+/f39//z7+/v6/QEFAgL8/P38AAH8/gEAAQT//P0A/vz8/f79AAEFBAMDAf79/v78/Pr4+fj7AP8CAAAE5QoDAAIDAv/7+f3+AAEB/f/8//8CAgECAQECAAMB/v4AAP0BAP8A/wD+/////wD9/vz+/wAA+fj8/v8CAfr4/P79/v3//wAAAP79/f7//Pv5/Pj9AAYB/vz8//z/Afv9AQMEA/78AAH8+fz//P3/AgIGBQIC//r+/v7++/n3+Pn8/gIDAQTYCgAEAgYB/Pn8/f8BAwH9/v39AAMCAQECAgIBAAD/AP8A/wAAAP4A/v3+AQD//v39/P/+AP38+f39/wD/+/z8/v/+/v/+AP////4A/v78+Pn6+f3/BAH9/v39/P8A/f0BBAUC/vv/Af33/QD8/P4AAggHAgAA+/n/Af/++vf49/v8AwMBA80K/wICCwD6/Pr+AAIEAP39+/4BAwT/AgICAwEA/v8AAf8BAP////79/v8B/v7///v7AAH+/f35+/3+AP78/vz+AP////3//gAB/gAA/Pv5+Pj6/P7+AgH+/fz9/gD9/wACBQX++f///fv9/v39/P8FCAb//QD++/8BAPz9+vj3+vsCBP8DwQr9AQQGAf/++v0DAwL//vr7AAACBQICAQIDA/7+AAD/AQEB///8/v3+AP/9AAD+/Pn9AwD9/Pj9/f7//f/+//7////+/v//AAAAAP78/Pj5+vj6/f0D//7++/39/v/+AgECBf/8/v/5//37/f3+AQYFBAD+/v3//gEB/vz8+fj4+/4F/wKzCvsFBAQEAP76/QEGAP7++/v/AgIFAwIBBAIA//8A/wABAAP9/v39/f7/////Af33+gMA//39+f7+/v7+/QD+/wEB/f/+/v8AAAD//fz8+vv69vn8/P7///78//79//8BAQABAv/8+/7+/fz9/v4CBQIDAgD+//3/Af4A/fz6+vf6/QABBKEKAgcDBAMA/v36/wMF/fr+/v4CBAQEAwAFAv/9/wABAAAAAf7+/P79//8A/vv6+/4BA/v+/f7+///8//39//8AAf8A/v7+AAD/AP79/fz7+/r3+Pv7/P///f39AP4A/wAA/wED//z8/v38+////QACAgMCAwAA/P0B/wD9/fv5+fr9/gIDlAoHBQIEBP///Pz//gL9/gD9AAMEBAQBAgP+/gABAgD//wAD/vv9//7+AP76+P3//wAB/P/+/AAB/v3+/v7/AP4BAP///f4AAf///f3+/fz8+fj4+vr6/v78//0A//7/AQD/AQL//P7+/fr9/gD8AAAAAgMCAgL8/gH//v4A+/r5+vz+AASFCgkGAwIG/wH8/Pz+AP8AAf0AAwMCAQUAAv//AAIDAf7/AAID+fkB/v79//v5/v/+AP39//0AAQD//v/9/QAA/wD///7+////AQD9/P79/f35+fj59/v9/f7//f4C/f7///8CAQH9/f36/v7//vwAAgAAAAAHAvz//v8AAP/7/Pr5+/4AA3gKBgMEBgQBAPsA/vsDAAEA/P8DAwP+AQQCAAEAAwL/////Af39/f8A//3++/r+//8A/fz8AAEAAQD9//3+////AP8A/v7/AP//AP39/f79/fv5+fj4+P38/v7//////P4AAAACA/z8/fv9/v/9/gABAf//AAQC/v7/AgD//vr+/fj7/v//bAoGAwAEBAb+/wD8/wICAAD8/gADA/4DAwIBAQIDAQD8/gAB/vz7/wAA//v8/v/+AP/+/P3/AAAAAP/+/v7///7+AQD//v8AAP3+/f/9/f39+/j7+Pj5+/79//7///79/f//AgIC+v3+/P3+/v3/AAH///8AAgMA/gAC//79/f78+/v9/v5cCgcDAwQFBgAB//oAAgEB//r+AAEAAgQFAP8EAwMBAPz6AwD8+/39AAP/+/4A/v4B//78/f4AAAAAAP7+/v4A/v8A///+AQH//fz7/v7+/v37+fv5+Pn7+/0B/f4A/vz9/v8BBP79/vz+/P/+/P8BAQD+/gACAf//BAEA/vz9/f78+/z+/U8KBgcEBAQE/gAC+gMBAQH+/f3+/wIBAgUAAwMFAQP/+/n+/wH8/v0BA/3//v/+/wD//f79/v8AAAD/AP7+/v8AAP3///8AAQH8+/r+/v/9/vv6+/v5+Pn7/P7+/wD//fz+/gEB/v/++/7//v79/wEC//79AAAB/wIEAf39/v77//78/P3+SAoEBQIGBQEA/P8EAwAAAfz7/QH/AgEDBAEDBgQBBfr9+vgC/f4AAPz/AQH///8A//7+/v7+//8AAAD/AP3+/wAA/f4A/wH/AP/6+v3//fz+/fr9+vv4+fj8/f4AAP/9/f39//7///7///7//v3+AAP//f4AAAH/AwMB/fsA/PwA//z9/f49CgMFAwEEBf3+AwYDAP8B/fj+AAEBAgX+AQYGAwUC+vz4+v/6+QEBAgIBAQAAAAD+/f////7+AP//AAD//v3/AP7/AP////4A/vv+/Pz+/f79/Pv8/Pj3+fr9/gD///3//f39/f///gD+AP/+/f4B/v4A/wEAAAADAwD7+QH/+wAA/v38/TMKAwMAAQIBAAUHB/8BAf77+v//AQQBAP8DCAMFBv39+fj6APn9/wIDAgMAAP8AAP/9AP7///7///8A/v/+AP79AP//AP/+/////P38/Pz+/fv+/v38+Pj5+P3+///+/v/+/f3+/f3/Af4B//78/wD8/AECAAD/AAMD/vv7AP3+Af/+//v9KQoBAAP/AAMCCQgBAgIC/fr5Av0ABAL+AQcFAwcE/Pr3+Pv//v7/AQMCBP8B/wAAAP3//gD+////AP7+//7///7/AP/+//8A/v79/Pz8/P38/f7//v369/j4/P7//v/+//79/f39/QAA/gAA/vwA//39AQAA/gABAgH/+f3+/QD/Af/+/f4dCgMAA/4BAgUIBAQDAwT6+/r9/gAFAP8ECAQCBgD9+vf4/f4A//4CAgMF/gABAf///AD/AP/+AP///////f3+/v8A//4A///+/vz9/fr9/f39/QD//vv59vj7/f7+//8A/vz+/vz9/gD+AP4A/QAA/PwAAf/+AQACAP37/P3/AQEA/v/9/xEKAAQC/wMDBAQHBQMEBPz3+vsAAgMA/wEEBAUBAwL++PX8/f8C//8DBQACAQH//f7/AAEAAP8A/v8AAPz7/v7+AP4A///+/v39/P7//Pz9/vz+/wD//fn1+Pr8/v7//////f79//v9AP3/////Af/9/P8A//8B/wAA/Pv9/v//AQH///7/AgoCBAMDAwIDBAkBAgQC/Pr7/QACA/8AAgECBQYBAv/49fr9AAP//wIEAgIBAP/+/v//AQIAAQD9/v7//vz9/QD//v8A/v39/P79/v78/f/+/P/+AAH9+/X3+fz+/f/+AP/+/v39/f3//v7//wAB//z8/gD//wD//v7+/f3/////AgD9/wH5CQQDAwQC/wQJAwABAQIB+/79//4DAQEDAAICAwQE/Pr1+v4CAv//AgUCAf/+/gD/AQABAQEBAP79/v7+/f39AP7+/wD+/f39/fv9//7+//39/f8B//389/b6/P79/v////39/v3//P/+/v8A/wEA+/3//v/+AAD9+/7//v////8AAf4AAe8JBgEEBQL+BQcC/QIBBAD8Af37/QIDBAICAQECAwT/+Pj6/QABAAEDAwIB/v7/Af//AgIBAQAA//7+/f3+/P3+/////v39/vz8//z///7//vz9/f4AAf749Pr9/f3+/gD+//z+/v79///9//8AAP/8/f7///4AAP37+wD+AP//AAD+AAEA5wkCBAIDAQMCCAH+AAIE/wD//Pz/AQUCAwEBAgMFAf75+fn+/wAABAIDAwD+/v//AAABAQIAAf8A/v79/f/8/f7//QD8/f39/v3+/f////79/f3+/v8A/Pr5+Pz9/f7+///+/v3+/f/+///8AAD///z//wD9///+/fz7/gAB/v///wAAAQHeCQIDAv8DAQcHAf//BAL/AgH8+P8BAgMEAQMDBAIB+/v7+vz/AQIDAwMBAP79/wH/AAEBAgH/AAD+/f7+/v39//z9//3+/f3+/f3+/wD///z8/f79//78/vv2/P7+/f3+AP/9/f3+/v/+/v0CAP/+/f3//v8A//39/fz8AAL//v/+AAEBANIJAAQEAQEBBwUA/gQF//4FBvv3/QEBAwMDAQMEAgL9+vn8/f8AAwMDAgIA/f7+AQAAAAEBAQAA/v7+/wD9/P3+/f7+/f7+/vz+/f/+///9/v3+/f3++/78+PoA/v38/v4AAP39/P7+/v/+/QIB/v/+/f7+///+/v77/f4AAP/+//4AAQH/yAkBAwMBAgIGAgD/AwQBAAME/Pn/AQECAwIDBAIBBPz79/z/AAEBAwQCAf7+//4AAQAAAAIBAP7+//8A//79/Pz+/v79///8/f3//f4A/f0A/P7+/f77/Pn3/gIA/Pz+/gD//v37/v/9//7+AQD///79/v///v7//fv9/wD//v7/AAABAP/ACQACBAEBAwECAgABAwP/BwH8+wIBAAAEAwUDAf4BAPj7/f8AAQEDBAP//v7+AAAAAAEAAQAB//3//v8C/vz9/f3+/P/+/v78/AH7/v/+/v/+/v79/vn+9vkAA/79/v3+/gD9/fv//v/9/v8AAP8A/v39/v///v79+/4AAP7+/wAAAAD/AbcJAQMCAf8DAwACAQABAP8EAwT8AgEAAQMDBQIB/f77/f3+AQABAgIEAgD9/v//AAAAAQIAAAD+/f///wH/+/7+/f39//3//f38/vz/AP3//f7+/vz9+/33/P8CAf7+/P3+//79/Pz/AP7//v7/AAD8//39///+/v77/wAA/v4AAP/+AAEArwkBAgIB/wADAgIBAP0BAgEDAwEDAQABAwME/wD+//v7/wABAQEBBAMBAf3+/v8AAQACAQD///79///+APz8Av7//f79/v79/f38/v7+/gD+/f37/P39/vv7/gMC//37/P7///z9/P7///7//wD///z9/v///v7+/P///////wAA//0BAf+nCQABAwEA/wICAP8CAQEAAAMEBAIBAf8EA///AAH+/P3+AQEBAAADAgEC//7+/wEAAgEBAP39/AAA/v/8/f8AAf/+//z9/v79/vz++/7///z/+/38//76+/7/AgAA//z8/f7//fz8/v4A//////8A/P39/wH9/f/9/wD+/QD/Av///AAC/p8J/wABAgIAAAABAAEDAQAAAgYEAgH/AAIDAP8BAf/8/P4CAQAAAAEBAAABAf8BAQAA//7/AP7/AP/+//z8AAAB//7+/v78/v79/f39/P7+/f3+/v78/P38/QABAAL+/f38/f3++/7+/v8A//7+AP/9/f7///7//v4A//3+//8BAP78AAL/lgkB/wECAQH//wACAgIAAgEEBQMCAP8AAAAD/gICAPv8/wEC/wAAAv0B//4EAQEBAQH+/P0BAAH//////P3/AAD//v3//f3///v8/f79/v3+/v39/v38/fz9AgD/AQD//P39/fz8/f7+AP/+///9AP79/v///v7+AP///vz+AgAA/f3/AgGOCQH/AQMAAf8A/wICAQEDAQQEAwEB/wD//QIBAgP+/P4AAAL/AP79AQAD/wIBAQEBAf/8/AH/AAEA//79/f4AAAD9/v7+/gD9+/z9/f7+/f7+/f3+/fz++wABAP//Af///f78+/v8/v3/AP///vz//v////7+/v//AP/9/f8DAP7/+wABAYcJ/wABAwAA/wABAQIBAQEDBAQDAQEA//79/wICAQD8/gEBAgAA/v3/AP8DAwICAgAA//38/gAAAQH//v3+/QAB//39/gD//v38/P39/f38AP7//P39/f3+/wAAAP//AAD+/f37+/v9/f4B///+/f7+AP7+///+//7////+/gAC///7AAEBfwkA/wICAf4AAAIBAf8CAAQEAwQCAQD//f79Av8A/wABAQEC/wD//f//AQIEAwECAP///f39/wAAAf///f7/AP8A/f3//v///f36/v3++/7//v79/v3+/f3/AAAA/gAB//7+/fv7+vz//v////3//v7+AP7+//7///4A//7+AAL//f0AAAF4Cf8AAgEB/gABAQABAAEBBAQDAwICAP79//0A//0AAQMCAQL/AP/+/v8CAgQDAQP//v/9/f7+/wD//wD//f//AAD+/v///P/++/oA/v38/f7+/f3///79/f8AAQD+/gAA/v/9/fn8+//+/gD+/f7+/v///v////0A/v/+AP//Af/+/v8AAXAJ/wEBAQAAAAEBAAABAAMDAwMDAgEB/v79/v7/AAABAgIBAgD/AP3+AAEDAgMCAgD+/v3+//3+AAD+/wD//v4AAP//Af39/f37/P/+/f39/v38/gD//v78/gEBAf0A//3/AP77/Pz7/f7+AP79/v0A/v7////+AP3///4B//4A//7//wAAaAn+AgIAAAD/AgEAAAEBAwIDAwMBAwAB+v79/gD/AAIDAgACAAD//QAAAAICAgMCAf79/f7+/v7//wAA///+/gD///8B/v78/P38/v/++/7+/fz9AAD9/v3+AAAB/wD//v7//fz+/vv7/f///v/9/f/////+/v7///4A//4A/gD+AP4A/wBeCQABAgL//wEAAQABAQQBAgIDBAAD///+//z9AAAAAgMBAAEBAP///gABAgEDAgIA/v7+/f7+/v8A//7/AP7+Af///gAA/f3+/vv+/v77/f//+/3+Af3+/f4AAAEB/v///v79/P0A/fr8///9/v0A/v4A/v/+/v7+/gAA////AP7+AP//AFUJAQECAAH/AQEAAAIBBAEBAgMCAQIB/v/+/f7/Af8CAwEBAQAA///+AAEDAgIBAAAA///7/P///////f//AAH///8B/v7+///++/79/P39/v7++/7/AP3+/f//AQEAAP4A/vz7//7/+vv+AP39///9/wD//v3+/v///gAA/wD9//8A//4ATQkCAAIAAf8BAgEAAAMBAgICAgIBAgAA/v/+/v4AAAICAgEAAAD///8AAwECAgEA/wD+//38/v////7+////AgH9/wAA/v0A/v79/vz8/v79/v38/f////79/v8BAAABAP/9/f3+/v38+v4A//38/v//AP/9/f7/////AP////7+AP////9GCQECAP8BAQABAQEAAgICAgICAQECAv///v7+//8BAQMBAQEA//8A/gADAwEBAwD+//3//v7//f7+AP7//v8BAP7//////gAA/vz9/vwA/P79/f38/v///v4A/gAAAQH/AP/+/f39/f76/v7++/z//wAA/v3+/v/////+AP8A//0A///+AD4JAgMB/v8BAAABAAEEAgEDAwABAgEBAAD+//3+AAEBAgIC//8AAP//AAMDAgABAf7//v/+/f/+//7+/////wD///7////+/wH//f39/f/+/P/9/Pz9/wD9AAH+AP4AAgH//gD+/Pz+/P3+/v76+/4A///+/v/9/////v/+/wH//v///gD+NgkCAgH/AAEAAAAAAgMBAwQC/gICAAIBAAD//P7+AQICAgEAAP//AAAAAgEDAgD///7//v7+///+/v/+/wD//wH9/////v4C/v/+/v39/v7///38+v3//v8A//4C/gEBAQH+///8+v39/v///vn8/f7//v///v3+///+AP////7////+//8vCQT/AQAAAAAAA/4CAgICAwIAAQIBAQIAAf/8/P8BAgIBAQH///8AAAEBAgICAAD+/gD+/v3///7//////gL+//3+AAD+//////7+/v3//QAA/f35/P/+////AP8AAQEBAAD///36/P39AQD8/Pv7/f3+///9/v///gAA///+/v///f/+/ycJAQEDAAD/AAIAAgACAgICAwIAAQEAAgIA/f3+/wABAgIBAAD///8AAQIBAQECAfz+Af3+/gH+/v4A//3/A//8//4AAP7+AP7///4A/P/+AP/+/Pr8//4A/wD+/wAB/wT+/wD//P39/P3/AP39+/n+/v3+/vz//f8A/wD///7//f7//v//HgkBAgEBAf//AQUC/wICAgECA/8AAAICAQD+/v4AAAIBAQEBAP7//wEAAgEBAQAA/f8A//7/AP3+/wD+/v8A//7//wD9//8AAP3/AAD9/v7//v/++/v+/v//Af8BAP//AP8AAf/8/v7+/P3//f77+/79/f38/P/9//8A//7///////////8WCQECAQEAAAEBAgMBAgIAAgIB/gAAAQICAQH9/QEBAAIBAQH//wD/AAACAAEA//8AAP///v7/AP/+//7/Af79/wH+///+/gAA/v8A///+//7//v/6/P7//QAAAQD/AAAA///+/v/+/vz8/v3//f/8/P38/fz+/wD///8A/////////////xAJAAABAQABAQP+AgQAAgIBAv//AgEAAQICAP7/AAABAQIC//8AAf//AQL/AAD//wAA///+/wD//v///v4AAAH//v3+//4AAP/+/wD//AH/Af7//Pv9/f7/AAIAAP///wD+/v/9/v7+/fz+/v/9/vz9/f7+AP//////////AP//////////EAn/////AP8BAAIAAQEDAgEBAAICAwD/AAP//gIA/wEBAQEAAAEA/wAAAwH+/gAA/gD+AP8A/wD+/v/+AP8AAAD9/f7+AP/+Av3/AP/6AAEBAP39/f3//f4BAQD/AP/9/v7+/v3+/v79/v3+/v7+/wD///////////////////////////8PCQD/////////AP8AAQECAQIBAQIDAv4AAgEAAf8AAQABAQEAAAAB/wABAf///wD//v8A//8A/gD///7/AAD///79//7+/wH//QAA/fv/AQIA/v3//f///gAA/wD//f79/f3+/v7+//7/////AP////////////////7//////////v///w8J////AP////8A//////8AAgIBAQIAAQABAgMA/wABAQEBA/0AAQL//wEA////AP4A/gD+AP////4A/v8AAAAB/P0B/v7+AP/+/wH7/P8AAAAAAP78//4AAAH+/QD9/f3+////AP//////AP////////////7//////v////8A//38/v//DQkA/wD///8A////AP//////AAAAAQEAAAECAgEC/gIBAQL/Af8CA/7+Af8A/////wD///0A///////+AP8BAP/+/AL+/f///v0B/v77/gEA/wD//////////////////wD//wD///////8A/////v/////////+/////v//AP///vv+//8HCQEAAQAA//8A/wD///8A////AP////8A/wAAAQIBAgEBAf8DAgECAf////7+/wD/Af7/AP0A/v/+//4B/v8BAP/+Af/8//79AP79/f0AAAAA/wAAAP8A/wAA/wD/AP8A//8A///////////////////////+AP7///7///0AAP/9/QD//f4IAQECAQAB/wEAAAD/AP//AP///wD/////////AP8AAAECAAMCAAECAAAA//3/AP///wH//v/+/v7//gAAAP8A/wAA/vz//v//////AAAAAAD/AAAA/wAA/wAA/wD//wD///8A///////////+/////////wD//v////78+gL//v8A///89wgAAAECAQH/AgEBAAEBAP8A//8A////AP///wD///////8AAAAAAQIBAP////8AAP7/AP/////+/v/+AAAA//8A/wD/AAD/AAD/AAAA/wAAAAD/AAAA/wD/AP8A/wD//wD/////////////////AP8A/v8A///+//7//vv+/v7+/v/+/v7zCP8AAP8BAQACAAEBAgEBAQABAP8A/wD//wD/AP////8A//////8A////AP//AP//AP8A//8A/wD/AAD/AAAA/wAA/wAAAP8AAP8AAAD/AAAA/wAAAP8AAP8A//8A/wD///8A//////////8AAAABAP7+//8AAP3+/gD+/P79/v79/vz+/vMI/f7//gAAAAEAAQICAQEB/QMDAgD/AQAA/wD//wD/AP////8A//////8A////AP//AP8A/wD/AAD/AAD/AAD/AAD/AAD/AAD/AAD/AAD/AAAAAAD/AAD/AP8A//8A//8A/wD///////8BAQAAAwH+/f7+AAEA//7+AP78/fz8/v39/f3+9Qj8/P7+////AAAAAgEAAQH+AwQBAAEBAAEAAAEAAAD//wD///8A////AP///wD//wD//wD/AP8A/wAA/wAA/wAA/wAA/wAA/wD//wD/AQD/AAAAAAD/AAD/AAD///8A//8A/wD//wD/AAIFAgAA///9/v//AgEA//79/fz9/fz8/f39/P34CPv9/P79/v///wAAAQAAAP8DAgICAAEAAQAAAQEBAQAB/wAA/wD/////AP////8A//8A/wD/AP8AAP8A/wAA/wAA/wD//wD////9Af4BAAECAQD/AAAAAAAA////AP//AP8AAAIA/gAABAYCAAD//f/+//8DAf///f79/fz8+/z+/f37/PsI/P38/fz8//7/////AAAB/wADAQEBAAABAAABAQECAQABAQABAAD///8A////AP///wD/AP//AP8A//8A////AP////7//wD//v8AAAABBAQAAAAAAAAAAAAAAP8AAAAAAQABAv7/AAMEAgMB/wD//v7+AAIAAP/+/v37/fr8/f38/fz8/wj8/fz7/Pz9/gD+/f/+AAD/AAABAgEAAAEB/wABAQEBAgABAgECAP79/wH/AAD//wD//wD//////gD//////////////////wABAAICBAMDAAD/AAAAAgIBAQAAAP//AQAAAQEE/v4CBAT/AgEBAP///f3/AgEB/v79/v36+/39+/z9/v0ECfz8+/v8/P39/v3+/f7//v/+/QIBAQEAAgIAAgABAQEAAQICAAH//v0AAP8AAP//AAD/AP///v/+AP/////+//8A//7/AQABAgIEBAQEAv///wAAAAIEAQH+AAABAP8BAAICAgMCAAECBP8AAgEC//z+/f4BAv8A/f79+/z9/P36/f/9/AsJ+vr9/Pz8/Pz7/P7+/f7+//z+/v4AAQMAAgQDAgIBAAEAAv8A///+AAD//QD+//8A/wAA/wD9AP4B/v7///7/AAAAAQAAAwQFBAQEAwEB/f8AAAEDAgIBAQAABAL9/gACAgICAgQCAAIDAP8BAgIA/fz+/f8C/wD//fz9/fz8/Pv+//sCDgn7+/38/fv8+vv8/f7+/fz+/P79//7/AQACAwUDBAICAgACAAD///79//z6/v7//wH/AAEA//7+Af/+//4A/wAAAQECAQIGBgUFBAIB/gD+AAECBAMCAQECAQEFAfz+AQIBAgICAwUBAQIB/QACAgD+/P3//gH//gD9//37/f38/P/9/QgQCf/9+/z7/Pv6+/z8/Pz+/P39/v7+/f8AAAEBBQUCAwICAwIAAAH9/vv9/Pv+/f////8BAQD///8B//7//wABAAACAQICBAcIBgQB/wEAAP4BAgQGBAIBAAEBBAIC/v0BAQICAQMDBAICAQL+/QECAP79/f///wH+///9/Pz+/f0F9/wKBhcJ//37+/z7+vr6+/v7/v/9/P3+//7+/vv/Af8EBQMDAgICAAH/AAD+/fz9/P7+/v7//wAAAAD/AP//////AQIDAAECAQIFCAcIAv4BAv8AAAMEBAYEAgIBAAEEAgL//gEBAQEBAgQDBAICAv79AAAA//39/gL+Av/9/v78/P4EBPn8BAP/Hgn+/Pv7+/z7+fn6+/sA//z8/v/+//78+/3/AAIDAwIDAgIBAQIBAP7+/Pv8/v3+//4A/wAAAQD//v///wABAgMBAQIBAwMICAgA/wEBAAECBQQFBgMEAgECAAEDBAD+AAEBAQECAwQEAgUB/P7+Av7//f78AgEB//3+/P38/wUE+/8B//0lCfz8+vv8+/v6+fn7/gD9+/3+///+/fv8/P8BAQMCAwMCAwECAwL//f78/Pz9/P3+/wAAAAEBAf/+//0AAAABAgICAgMBAwYHBwIA/wEBBAQEBQUFBAQDAwABAAIEAf8AAQEBAQMEAwQCAQIA/v7//v/+/vwBAgH//vv9/vwAAwP///79/ysJ+/r7/Pz7+/r4+v3+//z7/f8A/vz7+/3+/wECAgMDAwQCAQIDAf4A/f37+/38+/7/AAECAgABAP/+/f4BAAAAAgMDAwIDBQQEAgABAgMFBQYDBQQFBgMDAQAAAQMDAP8AAQICAgQDAwMBAwH+/f7+/v/+/AECAP7+/f3+/f8DAwD+/f79Lwn7+v38/Pv6+fn9/f39/vr+/v/9+vv8/v4BAQIDAgQDAgMBAgMB///8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AP/9/QD//wD+/gD//wGOCvoB/v37+Pz7+Pbw9/r2/wcEAQEAAAEDBQD8/f77/vz79f0DAgECBgD8/wQB+//+/f3+/v/9/P39//38/fv9/QACAP8CAf//AgMHAwUDAQEAAQECBAQCAQAAAP8AAAD+AAABAgEA/v3+/v/9/v3+/v3+/P////4A//7+//8A//4AAP8AAJQK/AAC/fj1/v37+e74+vX6BAUBAAIABAT+AAD9/Pv8/Pr5/gECBQIE//3/AP/9/v38/f79/f38/f///fz9/f3/AQEAAQAAAP8DBAIEAwQCAgECAgEECAH+AP7//gH////+AAEAAQEA/P7///39/QD8/v38///+/gD//v7/AAD//gABAAAAlwr9AAH/+fX6/P378Pv88/gEAQMDBgUC//v+/vz8/fz7+/v/BQMABP///f79///9/fz8/fv8/v39///+/P7+AP8AAgABAAD/AQICAQMCBQMDAwIBAgsL/v4A+v79/f///f4A/wD/AQD//gD//P3///3+/P39/v/+///+//8A////AQAAAACZCv8AAP/69Pr9/Pr3+/z0+AP+BQYGAQH+//z8+/v9/fv8/QYD/wAA///+/fz+AP37/Pv8+/v//v7///7//v8B/gEBAQEA//8AAQEBAwMEBAQEAwIHDQAA/f39/v39/f3+/v8A//4A/wAB//3+/f8A/v78/vv9/f///v7/AAD+/wAAAQAAAJwKAP8A//v3/fr5+vr6+vn8/gYFAwAAAQD+/Pz7+vz9/P4DA/3//v////79/v/+/vr7+/v6/P3/AAD//wEBAf8FA/7+/f7//gAA/wIDAwMEBAUFBAoEAQH8/f39/v7+/P39/gD+/gAAAAAA//39/gAA/v79+vv8/v/+//8A//8AAAAAAf8Aogr//v/++vn9+/v5+vr6/P0FBv4BAwH9///7+/z6+/37AQEB//3+/v3+//4A//7/+/n6+v37/QD+/wEBAAIDAgMB/v8A/v3+/v//AQIDAwQEBAYGBQMCAP/+//z8/v79/Pz9/////wAAAAH//v39AP////379/39///+/wD/AAAAAAAAAACtCvn9/v36+f37/Pv6/Pr7/wcFAgD+/wD9/v37+vr7+/7+/wEAAP38/P3/AP/////8/vn3/f77/f8BAQIBBAcCAgD+/////v37/f8BAAIDBAMFBgUDAwEBAP8A/f39/P38/Pz+AP/+Af8CAQD9/f7+/gD+/f34+vz/////AP8AAAAAAAAAALUK9v3+/Pr5+/z9+/v8+/wABAcCAgAB/Pz8/Pv6+/36/v0C//v///37/P4AAAD///7+/Pn6/Pv+/wECAwUCAQECAv7//v8A/f39/v8AAQIEBAQFAwMCAgEB/wH+/f38+/z8/f7//gD/AAEBAP3+/f7+//79//n5/P7///8A/wH/AAAAAAABvgr2+/z7+vn8/P37/Pz9/gIHAwEBAf38/fv8+vv//Pn+AAD7+/78/f38/gAAAQEB+/37/f34/P//AQECAQEBAQAB/wD/AAD//v7+/gAAAgQDBAMCAgICAgEAAf///Pr6/fz+/P8B/v7/Af8A/wD8/f7+//7++/j8AP7+/wD/AQAC////AADECvb7/Pv5+vv+/Pv7/AECAgMB/gH//v/8/Pz7/wL3+f0A/Pv7/fv8/f7/AAEEBP/5+/z9/f77+wAB/wAAAAH/AAEA/wAAAAAA/v7/AP8CBAMDAQICAQMCAf8B/v/8+v39/fz9/wD+/f4A/wD/AP3+/v7+//77+P3+///+/wACAQH/AP/9AMYK+vz7+vv7+fz++/78/wEEBAH+/v///v39+wEB/vP5APz7/Pr5+/z//wAAAwQD/vv8+Pz//vz9//8AAAD+AAD///8A/wABAQD//gD/AAIFAgIAAQICAQMA//////z8/P7+/f7+/f79///+//7//wD+/v7+//75+v3/AP7+AgEA/wEA//3/zQr5/Pv7+/r6+/8GAfn4AAQDAPz/Av/8/P0CA/758vn//Pr8+fr5/wP9//8DAwH+/vv7/P7/Bf72/AAA/////////v4AAAACAf///wEBAgQCAQAAAgIBA/7+/v///f39/gD8/v76//7+/wD8/v3+AAD+/v7///z4/f4AAAD///8AAP///wA='),c=>c.charCodeAt(0)),data=new DataView(bytes.buffer),grid=new Int16Array(133*133);
  let offset=0,at=0;
  for(let j=0;j<133;j++){
    let height=data.getInt16(offset,true);offset+=2;grid[at++]=height;
    for(let i=1;i<133;i++){
      let rise=data.getInt8(offset++);if(rise===-128){rise=data.getInt16(offset,true);offset+=2;}
      height+=rise;grid[at++]=height;
    }
  }
  return {x:647,z:365,half:165,step:2.5,grid};
};
