// The bare-earth lip, basin and three reaches come from 2019 USGS 3DEP and
// the National Hydrography Dataset. NPS photographs guide breakup and mist.
// This covers just the two matching federal flowline segments that formerly
// rendered a second valley-floor sheet across the airborne water. The local
// stream rejoins the regional Yosemite Creek at its mapped station below.
window.yosemiteFallsWater=(x,z)=>z>=-2612&&z<=-1889&&x>2484&&x<2588;
window.addYosemiteFalls=function addYosemiteFalls(chute,views){
  const upper={
    lipZ:-2595,toeZ:-2509,lipWidth:11,footWidth:19,cloudWidth:44,
    make:makePlunge
  };
  const lower={
    lipZ:-1967,toeZ:-1933,lipWidth:6.4,footWidth:10,cloudWidth:21,
    make:makePlunge
  };
  chute('Yosemite Falls',[[2563,-2612],[2567,-2595],[2566,-2571],[2557,-2541],
    [2552,-2524],[2541,-2509],[2520,-2488]],11,{freeDrop:upper,pool:false});
  chute('Middle Cascades',[[2520,-2488],[2510,-2474],[2505,-2447],[2503,-2410],
    [2510,-2370],[2511,-2331],[2508,-2300],[2505,-2262],[2508,-2240],
    [2513,-2220],[2523,-2193],[2530,-2169],[2534,-2152],[2536,-2139],
    [2537,-2129],[2539,-2100],[2526,-2070],[2519,-2035],[2525,-2023],
    [2526,-2003],[2534,-1981],[2535,-1967]],7.6);
  chute('Lower Yosemite Fall',[[2535,-1967],[2535,-1954],[2532,-1948],[2531,-1933],
    [2537,-1924],[2546,-1914],[2540,-1902],[2532,-1889]],7.5,{freeDrop:lower,pool:false});
  views.get('Yosemite Falls').approach=[2270,-2115,2563,-2577,82,-4,-2];

  function makePlunge({T,scene,name,common,geometry,lip,foot,profile}){
    const drop=lip.y-foot.floor;
    if(drop<12)return;
    const initialFall=1.6;
    const duration=(Math.sqrt(initialFall*initialFall+19.62*drop)-initialFall)/9.81;
    const tangent=new T.Vector2(foot.x-lip.x,foot.z-lip.z).normalize();
    const uniforms={...common,releasePoint:{value:new T.Vector3(lip.x,lip.y+.14,lip.z)},
      poolPoint:{value:new T.Vector3(foot.x,foot.floor+.15,foot.z)},runDirection:{value:tangent},
      fallSeconds:{value:duration},section:{value:new T.Vector3(profile.lipWidth,profile.footWidth,profile.cloudWidth)}};
    const motion=`
      uniform vec3 releasePoint,poolPoint,section,fallSun;
      uniform vec2 runDirection,fallWind;
      uniform float fallClock,fallGust,fallSeconds;
      float discharge(float t){
        return .52+.23*sin(.91*t+releasePoint.x*.0101)+.16*sin(2.27*t-.0035*releasePoint.z)
          +.09*sin(4.11*t+.87);
      }
      vec3 parcel(float u,float turbulence){
        float sec=u*fallSeconds;
        float advect=u+.055*u*(1.-u);
        vec3 p=mix(releasePoint,poolPoint,advect);
        p.y=releasePoint.y-1.6*sec-4.905*sec*sec;
        vec2 across=vec2(-runDirection.y,runDirection.x);
        float windResponse=u*u*(2.-u);
        float wind=.5+.26*sin(.76*(fallClock-sec)+.09*sec)+.24*sin(.39*fallClock+.58*sec);
        p.xz+=fallWind*windResponse*section.z*(.026+.075*fallGust)*wind*turbulence;
        p.xz+=across*windResponse*section.z*.025*sin(1.05*(fallClock-sec)+u*2.4)*turbulence;
        return p;
      }`;
    const verts=[],uv=[],indices=[],cols=22,rows=drop>200?86:46;
    for(let row=0;row<=rows;row++)for(let col=0;col<=cols;col++){
      verts.push(lip.x,lip.y,lip.z);uv.push(col/cols,row/rows);
      if(col&&row){const k=row*(cols+1)+col;
        indices.push(k-cols-2,k-1,k,k-cols-2,k,k-cols-1);}
    }
    // A changing elliptical section presents real depth when the eagle
    // rounds the waterfall, even with its camera nearly parallel to the wall.
    const coreGeometry=geometry(verts,uv,indices,{});
    const midpoint=new T.Vector3((lip.x+foot.x)*.5,(lip.y+foot.floor)*.5,(lip.z+foot.z)*.5);
    const radius=midpoint.distanceTo(uniforms.releasePoint.value)+profile.cloudWidth*1.8;
    coreGeometry.boundingSphere=new T.Sphere(midpoint,radius);
    const core=new T.ShaderMaterial({uniforms,transparent:true,depthWrite:false,side:T.FrontSide,
      vertexShader:motion+`
        varying vec2 at,ellipse;
        varying vec3 flowPosition;
        varying vec2 radii;
        void main(){
          float u=uv.y,t=fallClock-u*fallSeconds,angle=6.2831853*uv.x;
          float breakup=smoothstep(.07,.83,u);
          float radius=.52*mix(section.x,section.y+.75*section.z,breakup);
          radii=vec2(radius,radius*mix(.115,.71,breakup));
          ellipse=vec2(cos(angle),sin(angle));
          vec2 crossFlow=vec2(-runDirection.y,runDirection.x);
          vec3 p=parcel(u,1.);
          p.xz+=crossFlow*ellipse.x*radii.x+runDirection*ellipse.y*radii.y;
          at=uv;flowPosition=p;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`,
      fragmentShader:motion+`
        uniform sampler2D fallCloud;
        varying vec2 at,ellipse,radii;varying vec3 flowPosition;
        void main(){
          float u=at.y,t=fallClock-u*fallSeconds;
          vec2 crossFlow=vec2(-runDirection.y,runDirection.x);
          vec3 viewDir=normalize(cameraPosition-flowPosition);
          vec2 viewRay=normalize(vec2(dot(viewDir.xz,crossFlow),dot(viewDir.xz,runDirection))/radii);
          vec2 nearest=ellipse-viewRay*dot(ellipse,viewRay);
          float halfChord=sqrt(max(0.,1.-dot(nearest,nearest)));
          float breakup=smoothstep(.09,.85,u);
          float lay=.35+.65*discharge(t);
          float density=0.,brightness=0.;
          // Integrate across the actual three-dimensional section. Water is
          // coherent at the lip; wind and turbulent entrainment shed separate
          // opaque streamers and a wider, optically thinner cloud beneath it.
          for(int k=0;k<8;k++){
            float along=(float(k)+.5)*.25-1.;
            vec2 pt=nearest+viewRay*halfChord*along;
            vec2 flutter=vec2(.44*sin(1.29*t+.38*sin(.41*t))+.26*sin(2.44*t+.41),
                              .41*cos(.91*t+.62)+.20*cos(1.91*t));
            vec2 centre=breakup*(flutter*.38+vec2(.16*sin(.63*t),0.));
            vec2 q=pt-centre;
            vec3 cloud=texture2D(fallCloud,vec2(q.x*.37+.14*q.y+.065*sin(.70*t),t*.117+q.y*.32)).rgb;
            vec3 curls=texture2D(fallCloud,vec2(q.x*.75-q.y*.27+cloud.r*.16,
                                                  t*.246+q.y*.59+cloud.b*.20)).rgb;
            float noise=.55*cloud.r+.26*curls.g+.19*curls.b;
            float guard=1.-smoothstep(.74,1.,length(pt));
            float x=q.x+breakup*(.14*(curls.r-.5)+.11*sin(.86*t+q.y*2.4));
            float packed=exp(-pow(abs(x)/mix(.69,.19,breakup),2.4)-q.y*q.y*1.9);
            float second=exp(-pow(abs(x-.25-.11*sin(1.05*t))/.122,2.)-pow(abs(q.y+.16)/.51,2.));
            float thin=exp(-pow(abs(x+.32+.095*cos(1.49*t))/.105,2.)-pow(abs(q.y-.21)/.45,2.));
            float coreFlow=packed*mix(1.50,.75+.54*noise,breakup)
                   +breakup*(.59*second+.40*thin);
            float aerosol=breakup*exp(-1.75*dot(q,q))
              *smoothstep(.28,.71,noise+.13*lay-.22*length(q));
            float optical=guard*(coreFlow*(.36+1.18*noise)+aerosol*(.22+.64*lay));
            density+=optical;
            brightness+=optical*clamp(.12+.54*noise+.20*lay+.08*coreFlow,0.,1.);
          }
          float thickness=2.7*halfChord*density/8.;
          float scatter=1.-exp(-thickness);
          float backlight=.5+.5*dot(viewDir,-fallSun);
          float sunward=clamp(brightness/max(density,.005)+.12*backlight,0.,1.);
          vec3 water=mix(vec3(.40,.50,.53),vec3(.96,.959,.912),.14+.83*sunward);
          gl_FragColor=vec4(water,scatter);
        }`});
    const jet=new T.Mesh(coreGeometry,core);
    jet.name=name+' · aerated freefall';jet.userData.prepareFlightMaterial=true;
    scene.add(jet);

    // Parcels shed from both margins share their release time with the jet.
    // Fine droplets lose forward momentum, drift, and widen in the open air.
    const fallingCount=drop>200?440:196,impactCount=drop>200?176:84,count=fallingCount+impactCount;
    const sprayGeometry=new T.InstancedBufferGeometry();
    const quad=new T.PlaneGeometry(1,1);
    sprayGeometry.index=quad.index;for(const [key,value] of Object.entries(quad.attributes))sprayGeometry.setAttribute(key,value);
    const seeds=new Float32Array(count*4);
    let state=607103;
    const random=()=>((state=(Math.imul(1664525,state)+1013904223)>>>0)/4294967296);
    for(let i=0;i<count;i++){
      seeds[4*i]=i<fallingCount?(i+random())/fallingCount:-(i-fallingCount+random())/impactCount;seeds[4*i+1]=2*random()-1;
      seeds[4*i+2]=2*random()-1;seeds[4*i+3]=random();
    }
    sprayGeometry.setAttribute('parcelSeed',new T.InstancedBufferAttribute(seeds,4));
    sprayGeometry.instanceCount=count;sprayGeometry.boundingSphere=new T.Sphere(midpoint.clone(),radius);
    const vapour=new T.ShaderMaterial({uniforms,transparent:true,depthWrite:false,side:T.DoubleSide,
      vertexShader:motion+`
        attribute vec4 parcelSeed;varying vec2 st;varying vec4 life;varying float light,impactFraction,aboveImpact;
        void main(){float cycle=fallClock/fallSeconds+abs(parcelSeed.x);
          float u=fract(cycle),sec=u*fallSeconds,t=fallClock-sec;
          float seq=fract(parcelSeed.w+floor(cycle)*.6180339);
          vec3 p=parcel(u,1.7+.65*seq);vec2 side=vec2(-runDirection.y,runDirection.x);
          float spread=section.x*.32+section.z*(.15*sqrt(u)+.51*u*u);
          float lateral=parcelSeed.y*(.67+.33*abs(parcelSeed.y));
          p.xz+=side*lateral*spread+runDirection*(parcelSeed.z*.54-.30)*spread;
          p.xz+=fallWind*section.z*u*u*(.02+.10*fallGust)*(.35+seq);
          float size=(.7+section.x*.035+section.z*(.093*u+.183*u*u))*(.77+.61*seq);
          impactFraction=parcelSeed.x<0.?1.:0.;
          if(impactFraction>.5){
            // The falling column rebounds at the measured basin. Clouds start
            // narrow, rise above the rock, then fan out downwind and downstream.
            float span=3.35+4.05*parcelSeed.w;
            cycle=fallClock/span+abs(parcelSeed.x);u=fract(cycle);sec=u*span;t=fallClock-sec;
            seq=fract(parcelSeed.w+floor(cycle)*.6180339);
            float pulse=.68+.39*discharge(t-fallSeconds);
            float scale=sqrt(max(1.,releasePoint.y-poolPoint.y))*.049;
            float spreadTime=1.-exp(-sec*.84);
            p=poolPoint;
            p.xz+=side*parcelSeed.y*section.y*(.26+.36*spreadTime);
            vec2 shot=runDirection*(.54+.47*seq)+side*parcelSeed.z*.95;
            p.xz+=shot*scale*(4.5+5.*pulse)*spreadTime;
            p.xz+=runDirection*sec*(.63+1.6*seq)+fallWind*(1.75+4.9*fallGust)*scale*(sec-1.2*spreadTime);
            p.y+=scale*(2.+8.5*seq+2.1*pulse)*spreadTime+sec*scale*(.41+.48*seq);
            size=(1.15+scale*(2.3+6.0*u)*(.72+.81*seq))*(.93+.22*pulse);
          }
          aboveImpact=p.y-poolPoint.y;
          float direction=parcelSeed.z*.34+.18*sin(2.05*seq+.45*t);
          vec2 c=position.xy; c=mat2(cos(direction),sin(direction),-sin(direction),cos(direction))*c;
          c*=mix(vec2(size*(1.55+.55*abs(lateral)),size*(1.50+1.90*(1.-u))),vec2(size*(1.82+.24*seq),size*(1.02+.36*seq)),impactFraction);
          gl_Position=projectionMatrix*(viewMatrix*vec4(p,1.)+vec4(c,0.,0.));
          st=uv;life=vec4(u,seq,parcelSeed.w,discharge(t));light=.5+.5*dot(normalize(cameraPosition-p),-fallSun);}`,
      fragmentShader:`uniform sampler2D fallCloud;varying vec2 st;varying vec4 life;varying float light,impactFraction,aboveImpact;
        void main(){vec2 p=st*2.-1.;float radial=dot(p,p);if(radial>1.)discard;
          vec3 eddy=texture2D(fallCloud,st*(.47+.27*life.y)+vec2(life.y,life.z)+vec2(.13,-.19)*life.x).rgb;
          float inside=1.-smoothstep(.08,1.,radial);
          float optical=smoothstep(.15,.76,.54*eddy.r+.30*eddy.b+.16*eddy.g+.23*inside);
          float envelope=smoothstep(.035,.32,life.x)*(1.-smoothstep(.979,1.,life.x));
          float opacity=inside*optical*envelope*(.19+.25*life.x)*(.62+.43*life.w);
          if(impactFraction>.5)opacity=inside*optical*smoothstep(.03,.16,life.x)
            *(1.-smoothstep(.45,1.,life.x))*(.20+.15*life.w)*smoothstep(-.4,1.3,aboveImpact);
          vec3 spray=mix(vec3(.56,.64,.66),vec3(.95,.965,.947),.33+.32*eddy.r+.20*light);
          gl_FragColor=vec4(spray,opacity);}`});
    const cloud=new T.Mesh(sprayGeometry,vapour);
    cloud.name=name+' · entrained moving droplets';cloud.userData.prepareFlightMaterial=true;
    cloud.renderOrder=1;scene.add(cloud);
  }
};

// Bind the outer edge of the detailed wall to the triangles drawn by the
// adjoining regional tiles. A mathematical sample of their DEM can lie metres
// above or below a long straight rendered edge on nearly vertical granite.
window.makeYosemiteFallsBoundary=function makeYosemiteFallsBoundary(T,rect){
  const [left,top,right,bottom]=rect;
  const records=Array.from({length:4},()=>new Map());
  let edges;
  function observe(x,z,width,depth,nx,nz,grid){
    const eps=.003,pos=grid.attributes.position;
    if(x+width<left-eps||x>right+eps||z+depth<top-eps||z>bottom+eps)return;
    function note(i,side){
      const coordinate=side<2?pos.getZ(i):pos.getX(i);
      records[side].set(coordinate,pos.getY(i));
    }
    for(const [side,axis,edge,col] of [[0,x+width,left,nx],[1,x,right,0]]){
      if(Math.abs(axis-edge)<eps)for(let row=0;row<=nz;row++)note(row*(nx+1)+col,side);
    }
    for(const [side,axis,edge,row] of [[2,z+depth,top,nz],[3,z,bottom,0]]){
      if(Math.abs(axis-edge)<eps)for(let col=0;col<=nx;col++)note(row*(nx+1)+col,side);
    }
  }
  function seal(){edges=records.map(row=>Array.from(row).sort((a,b)=>a[0]-b[0]));}
  function lowerBound(rail,coordinate){
    let a=0,b=rail.length;
    while(a<b){const half=(a+b)>>1;if(rail[half][0]<coordinate)a=half+1;else b=half;}
    return a;
  }
  function corrected(x,z,base,ground){
    if(!edges)return base;
    const d=Math.min(x-left,right-x,z-top,bottom-z);
    if(d<-.001||d>=20)return base;
    const side=d===x-left?0:d===right-x?1:d===z-top?2:3;
    const rail=edges[side],coord=side<2?z:x;
    if(rail.length<2||coord<rail[0][0]||coord>rail.at(-1)[0])return base;
    const next=Math.max(1,Math.min(rail.length-1,lowerBound(rail,coord)));
    const [u,y]=rail[next-1],[v,h]=rail[next];
    const ledge=y+(h-y)*(coord-u)/Math.max(.00001,v-u);
    const old=ground(side===0?left:side===1?right:x,side===2?top:side===3?bottom:z);
    const t=Math.min(1,Math.max(0,d/20));
    return base+(ledge-old)*(1-t*t*(3-2*t));
  }
  function fit(group){
    if(!edges)return;
    group.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const g=mesh.geometry,p=g.attributes.position,n=g.attributes.normal,m=g.attributes.landformExposure;
      const positions=Array.from(p.array),normals=Array.from(n.array),light=Array.from(m.array),indices=[];
      function interpolate(a,b,k,y){
        const out=positions.length/3;
        for(let j=0;j<3;j++){
          let v=positions[3*a+j]*(1-k)+positions[3*b+j]*k;
          positions.push(j===1&&y!==null?y:v);
          normals.push(normals[3*a+j]*(1-k)+normals[3*b+j]*k);
        }
        for(let j=0;j<4;j++)light.push(Math.round(light[4*a+j]*(1-k)+light[4*b+j]*k));
        return out;
      }
      function split(a,b,polygon){
        const ax=p.getX(a),bx=p.getX(b),az=p.getZ(a),bz=p.getZ(b);
        const side=ax===bx&&ax===left?0:ax===bx&&ax===right?1:az===bz&&az===top?2:az===bz&&az===bottom?3:-1;
        if(side<0)return;
        const rail=edges[side],start=side<2?az:ax,end=side<2?bz:bx;
        const lo=Math.min(start,end)+.0001,hi=Math.max(start,end)-.0001;
        const knots=[];
        for(let i=lowerBound(rail,lo);i<rail.length&&rail[i][0]<hi;i++)knots.push(rail[i]);
        if(end<start)knots.reverse();
        for(const [s,y] of knots)polygon.push(interpolate(a,b,(s-start)/(end-start),y));
      }
      const border=new Uint8Array(p.count);
      for(let i=0;i<p.count;i++){
        const x=p.getX(i),z=p.getZ(i);
        border[i]=(x===left?1:0)|(x===right?2:0)|(z===top?4:0)|(z===bottom?8:0);
      }
      const src=g.index.array;
      for(let i=0;i<src.length;i+=3){
        const a=src[i],b=src[i+1],c=src[i+2];
        if(!(border[a]&border[b]||border[b]&border[c]||border[c]&border[a])){indices.push(a,b,c);continue;}
        const poly=[a];
        split(a,b,poly);poly.push(b);split(b,c,poly);poly.push(c);split(c,a,poly);
        if(poly.length===3){indices.push(a,b,c);continue;}
        const between=interpolate(a,b,.5,null),center=interpolate(between,c,1/3,null);
        for(let j=0;j<poly.length;j++)indices.push(center,poly[j],poly[(j+1)%poly.length]);
      }
      if(positions.length===p.array.length)return;
      g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
      g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
      g.setAttribute('landformExposure',new T.Uint8BufferAttribute(light,4,true));
      g.setIndex(indices);g.computeBoundingSphere();
    });
  }
  return {observe,seal,corrected,fit};
};
