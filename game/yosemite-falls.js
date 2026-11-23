// The bare-earth lip, basin and three reaches come from 2019 USGS 3DEP and
// the National Hydrography Dataset. NPS photographs guide breakup and mist.
// This covers just the two matching federal flowline segments that formerly
// rendered a second valley-floor sheet across the airborne water. The local
// stream rejoins the regional Yosemite Creek at its mapped station below.
window.yosemiteFallsWater=(x,z)=>z>=-2612&&z<=-1889&&x>2484&&x<2588;
window.addYosemiteFalls=function addYosemiteFalls(chute,views){
  const upper={
    lipZ:-2595,toeZ:-2509,lipWidth:11,footWidth:19,cloudWidth:44,
    make:window.makeWaterfallPlunge
  };
  const lower={
    lipZ:-1967,toeZ:-1933,lipWidth:6.4,footWidth:10,cloudWidth:21,
    make:window.makeWaterfallPlunge
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
