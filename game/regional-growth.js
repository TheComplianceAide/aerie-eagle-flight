// Regional ground growth uses isolated photographic fronds, a leaf, blade and
// bark. A fern or tussock is assembled from independently curved leaf surfaces.
(() => {
  'use strict';
  const tau=Math.PI*2, golden=2.39996323;
  const styles={
    'tree-fern':{gain:[.84,.98,.82]},fern:{gain:[.91,1.04,.78]}, heath:{gain:[.94,.90,.74]},
    tea:{gain:[.96,1.02,.81]}, tussock:{gain:[1.12,1.03,.77]},
    ephedra:{gain:[1.02,.94,.74]}, alder:{gain:[.95,1.06,.82]},
    bilberry:{gain:[.96,1.04,.80]}
  };
  const palettes={
    yellowstone:['tussock','bilberry','alder'],
    milford:['tree-fern','tussock','bilberry'],canyon:['ephedra','tussock'],lofoten:['heath','tussock','alder'],
    swiss:['tussock','bilberry'],crater:['bilberry','tussock'],alaska:['alder','fern','tussock'],
    labrador:['tea','heath','tussock'],yosemite:['bilberry','fern','tussock'],
    acadia:['heath','fern','alder'],moosehead:['tea','fern','alder'],surry:['fern','alder','bilberry'],
    winnipesaukee:['fern','bilberry','alder'],dixville:['fern','bilberry','tussock']
  };
  function specimen(T,kind){
    const p=[],c=[],uv=[],ix=[];
    function vertex(x,y,z,u,v,gain){
      p.push(x,y,z);uv.push(u,v);c.push(...gain);return p.length/3-1;
    }
    function ribbon(tile,heading,n,center,halfWidth,tone,twist=0){
      const right=[Math.sin(heading),-Math.cos(heading)];
      let prev;
      for(let j=0;j<=n;j++){
        const t=j/n,[x,y,z]=center(t),w=halfWidth(t);
        const cols=[],fold=(1-Math.abs(t-.43)*.68)*w*.15;
        for(let k=0;k<3;k++){
          const side=k-1;
          cols.push(vertex(x+right[0]*w*side,y+(k===1?fold:0)+twist*w*side*(.32+.68*t),z+right[1]*w*side,(tile+.013+.974*k/2)/4,.007+.986*t,tone));
        }
        if(prev)for(let k=0;k<2;k++)ix.push(prev[k],cols[k],prev[k+1],prev[k+1],cols[k],cols[k+1]);
        prev=cols;
      }
    }
    function stem(a,b,r0,r1,tone,sides=4){
      const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],len=Math.hypot(dx,dy,dz)||1;
      const k=Math.hypot(dx,dz),u=k>.0001?[dz/k,0,-dx/k]:[1,0,0];
      const v=[(-dy*u[2]+dz*u[1])/len,(-dz*u[0]+dx*u[2])/len,(-dx*u[1]+dy*u[0])/len];
      let old;
      for(let s=0;s<=sides;s++){
        const t=s/sides,co=Math.cos(tau*t),si=Math.sin(tau*t),edge=u.map((n,i)=>co*n+si*v[i]);
        const make=(point,r,y)=>vertex(point[0]+edge[0]*r,point[1]+edge[1]*r,point[2]+edge[2]*r,(3.017+.966*t)/4,y,tone);
        const pair=[make(a,r0,.02),make(b,r1,.94)];
        if(old)ix.push(old[0],old[1],pair[0],pair[0],old[1],pair[1]);old=pair;
      }
    }
    const green=[.76,1.21,.76],dry=[1.13,.96,.70],leaf=[.88,1.00,.81],bark=[.82,.76,.62];
    if(kind==='fern'||kind==='tree-fern'){
      // Tree fern fronds emerge from the crown of a caudex. Ground ferns
      // open at soil level, with arched fronds left standing from earlier flushes.
      const tall=kind==='tree-fern',crown=tall?.64:.04;
      if(tall){
        stem([-.036,0,.010],[.006,.36,-.009],.056,.043,bark,8);
        stem([.006,.36,-.009],[.019,crown,0],.043,.050,bark,8);
        for(let j=0;j<18;j++){
          const a=j*golden,h=.22+.022*j;
          stem([.009,h,0],[.081*Math.cos(a),h-.061,.081*Math.sin(a)],.014,.004,bark,3);
        }
      }
      for(let j=0;j<16;j++){
        const a=j*golden,r=.43+.36*((j*7%15)/15),top=tall?.19+.12*(1-r):.39+.32*(1-r);
        const falling=tall&&j%5===0?.44:tall?.19:-.05;
        const curve=t=>[.017+r*t*Math.cos(a+.09*t),crown+Math.sin(Math.PI*t*.86)*top-falling*t*t,r*t*Math.sin(a+.09*t)];
        ribbon(0,a,8,curve,t=>r*(.143-.024*t),j%5===0?[.89,.86,.64]:[.96,1.10,.82],.26*Math.sin(j*2.3));
      }
    }else if(kind==='tussock'){
      // Curved, keeled blades from a tight tussock root, with persistent straw.
      for(let j=0;j<28;j++){
        const a=j*golden,h=.58+.40*((j*13%29)/29),out=.10+.58*((j*7%27)/27);
        ribbon(2,a,4,t=>[(.045+out*t*t)*Math.cos(a),h*(t-.35*out*t*t),(.045+out*t*t)*Math.sin(a)],t=>.032*(1-.59*t),j%4===0?dry:green);
      }
    }else if(kind==='ephedra'){
      // Green photosynthetic jointed shoots, with a papery scale at each joint.
      for(let j=0;j<17;j++){
        const a=j*golden,r=.48*((j*7%17)/17),h=.40+.58*((j*11%17)/17);
        let last=[.085*Math.cos(a),.013,.085*Math.sin(a)];
        for(let i=1;i<4;i++){
          const f=i/3,next=[(.085+r*f)*Math.cos(a+.14*f),h*f,(.085+r*f)*Math.sin(a+.14*f)];
          stem(last,next,.010*(1-.12*i),.008*(1-.12*i),i===1?dry:green,3);
          stem(next,[next[0],next[1]+.018,next[2]],.012,.007,dry,3);
          if(i===2)stem(next,[next[0]+.13*Math.cos(a+.6),next[1]+h*.28,next[2]+.13*Math.sin(a+.6)],.008,.003,green,3);last=next;
        }
      }
    }else{
      // Differences in leaf angle, shoot spacing and branching keep an alder
      // thicket, bog Labrador tea and a heather cushion distinct in silhouette.
      const heath=kind==='heath',tea=kind==='tea',alder=kind==='alder';
      let seed=heath?2482:tea?921:alder?614:415;
      const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
      const stems=heath?13:tea?9:alder?5:8;
      for(let j=0;j<stems;j++){
        const a=j*golden+rand()*.31,h=.50+rand()*.46,r=(heath?.85:tea?.37:alder?.62:.48)*(.29+rand()*.77);
        const rise=a+.22*(rand()-.45),foot=.05+.10*rand();
        const path=t=>[(foot+r*t*(1.22-.22*t))*Math.cos(a+.13*t),h*t*(.87+.13*t),(foot+r*t*(1.22-.22*t))*Math.sin(a+.13*t)];
        const forks=heath?6:tea?5:7;
        for(let k=0;k<forks;k++){
          const f=(k+1)/forks,root=path(f-.75/forks),tip=path(f);
          stem(path(k/forks),tip,(alder?.015:.009)*(1-.64*k/forks),.004,bark,3);
          const b=rise+(k%2?1:-1)*(.50+rand()*.91);
          const extent=(heath?.18:tea?.18:alder?.37:.23)*(.67+.65*rand())*(.95-.39*f);
          const lift=(heath?.16:tea?.19:.21)*(.53+.89*rand());
          const twig=t=>[root[0]+t*extent*Math.cos(b+.1*t),root[1]+lift*t-.04*t*t,root[2]+t*extent*Math.sin(b+.1*t)];
          stem(root,twig(1),heath?.007:.005,.002,bark,3);
          const leaves=heath?6:tea?5:4;
          for(let m=0;m<leaves;m++){
            const start=twig(.12+.85*(m+.25*rand())/leaves),heading=b+(m%2?-1:1)*(.52+rand()*1.20);
            const length=(heath?.069:tea?.125:alder?.13:.10)*(.71+.56*rand());
            const angle=heath?.41+rand()*.76:.79*(rand()-.28);
            const tone=rand()>.16?leaf:[1.04,1.01,.68];
            ribbon(1,heading,2,t=>[start[0]+length*Math.cos(heading)*t,start[1]+length*(angle*t-.28*t*t),start[2]+length*Math.sin(heading)*t],
              ()=>length*(heath?.14:tea?.16:alder?.33:.25),tone,(rand()-.5)*1.48);
          }
        }
      }
    }
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    g.setAttribute('color',new T.Float32BufferAttribute(c,3));g.setIndex(ix);g.computeVertexNormals();return g;
  }
  function select(region,zone,draw){
    const {alpine,wet,open,shelter,land}=zone;
    if(region==='acadia')return wet>.48?'alder':open>.53?'heath':'fern';
    if(region==='canyon')return draw<.66?'ephedra':'tussock';
    if(region==='lofoten')return wet>.55||land===3&&draw>.53?'tussock':land===1&&draw<.3?'alder':'heath';
    if(region==='labrador')return wet>.31||shelter<.44?'tea':open>.7&&draw>.60?'tussock':'heath';
    if(region==='milford')return alpine>.47?'tussock':draw<.83?'tree-fern':'bilberry';
    if(region==='alaska')return alpine>.46?'tussock':wet>.35||land===2||shelter<.44?'alder':'fern';
    if(region==='swiss'||region==='crater')return alpine>.40||open>.65?'tussock':'bilberry';
    if(region==='yosemite')return wet>.42?'fern':open>.68?'tussock':'bilberry';
    if(region==='dixville')return open>.72?'tussock':shelter>.46?'fern':'bilberry';
    if(region==='moosehead')return wet>.45?(draw>.44?'alder':'tea'):draw>.36?'fern':'tea';
    return wet>.46?'alder':shelter>.42?'fern':'bilberry';
  }
  window.makeRegionalGrowth=function makeRegionalGrowth(T,world,wind,clock,loader,batch,coarse){
    const names=palettes[world.region],photo=loader.load('regional-growth.webp');photo.colorSpace=T.SRGBColorSpace;photo.anisotropy=4;
    const sun=world.sunDirection||new T.Vector3(-.5,.6,-.5).normalize();
    const near=coarse?14:22,far=coarse?66:95;
    const geometries=names.map(kind=>{
      const localGain=styles[kind].gain;
      const mat=new T.ShaderMaterial({side:T.DoubleSide,uniforms:{...wind.uniforms,clock,photo:{value:photo},gain:{value:new T.Vector3(...localGain)},sun:{value:sun}},
        vertexShader:wind.glsl+`
          attribute vec4 planting,trait;attribute vec3 color; uniform float clock;uniform vec3 sun;
          varying vec2 tex;varying vec3 tint;varying float edge;
          void main(){
            float sa=sin(trait.x),ca=cos(trait.x);
            vec3 p=vec3(position.x*ca+position.z*sa,position.y,-position.x*sa+position.z*ca)*planting.w;
            vec3 n=normalize(vec3(normal.x*ca+normal.z*sa,normal.y,-normal.x*sa+normal.z*ca));
            vec2 front=plantFront(planting.xz);
            vec2 windBend=plantMotion(planting.xz,front,clock,.87);
            p.xz+=planting.w*position.y*position.y*windBend*(.60+.47*position.y);
            p.y-=planting.w*position.y*dot(windBend,windBend)*.30;
            vec3 wp=planting.xyz+p,eye=normalize(cameraPosition-wp);
            float l=.64+.19*abs(dot(n,sun))+.12*max(n.y,0.)+.10*max(dot(-eye,sun),0.);
            tint=color*l*(.78+.27*position.y)*(.91+.18*trait.y);tex=uv;
            edge=1.-smoothstep(${near-3}.,${near+3}.,distance(cameraPosition,planting.xyz));
            gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);
          }`,
        fragmentShader:`uniform sampler2D photo;uniform vec3 gain;varying vec2 tex;varying vec3 tint;varying float edge;
          void main(){vec4 seen=texture2D(photo,tex);float d=fract(dot(gl_FragCoord.xy,vec2(.75487767,.5698403)));
            if(seen.a<.36||d>edge)discard;gl_FragColor=vec4(seen.rgb*gain*tint,1.);
            #include <colorspace_fragment>
          }`});
      return batch(specimen(T,kind),mat,coarse?20:52);
    });
    const standPhoto=loader.load('regional-growth-stands.webp');standPhoto.colorSpace=T.SRGBColorSpace;standPhoto.anisotropy=4;
    const standOrder=['tree-fern','fern','tussock','ephedra','heath','tea','alder','bilberry'];
    const tileRows=names.map(name=>standOrder.indexOf(name));
    while(tileRows.length<3)tileRows.push(0);
    const standMat=new T.ShaderMaterial({side:T.DoubleSide,uniforms:{...wind.uniforms,clock,photo:{value:standPhoto},rows:{value:new T.Vector3(...tileRows)}},
      vertexShader:wind.glsl+`
        attribute vec4 planting,trait;uniform float clock;uniform vec3 rows;
        varying vec2 tex;varying float edge,gain;
        void main(){
          vec3 center=planting.xyz+vec3(0.,.46*planting.w,0.),toEye=normalize(cameraPosition-center);
          vec3 right=normalize(vec3(toEye.z+.000001,0.,-toEye.x)),up=cross(toEye,right);
          float bearing=atan(toEye.x,toEye.z)-trait.x;
          float view=toEye.y>.85?3.:toEye.y>.44?2.:cos(bearing)>0.?0.:1.;
          float row=trait.z<8.5?rows.x:trait.z<9.5?rows.y:rows.z;
          tex=vec2((view+.004+.992*uv.x)*.25,(7.-row+.004+.992*uv.y)*.125);
          vec3 p=center+(position.x*right+position.y*up)*planting.w*1.96;
          float tip=clamp((p.y-planting.y)/planting.w,0.,1.);
          p.xz+=planting.w*tip*tip*plantMotion(planting.xz,plantFront(planting.xz),clock,.87);
          float range=distance(cameraPosition,planting.xyz);
          edge=(trait.w<0.?1.:smoothstep(${near-3}.,${near+3}.,range))*(1.-smoothstep(${far-15}.,${far}.,range));
          gain=.94+.12*trait.y;
          gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
        }`,
      fragmentShader:`uniform sampler2D photo;varying vec2 tex;varying float edge,gain;
        void main(){vec4 c=texture2D(photo,tex);float d=fract(dot(gl_FragCoord.xy,vec2(.75487767,.5698403)));
          if(c.a<.28||1.-d>edge)discard;gl_FragColor=vec4(c.rgb*gain,1.);
          #include <colorspace_fragment>
        }`});
    const distant=batch(new T.PlaneGeometry(1,1),standMat,coarse?280:780);
    return {geometries,names,distant,near,far,choose(zone,draw){
      const kind=select(world.region,zone,draw),index=names.indexOf(kind);
      const h=kind==='tree-fern'?2.85:kind==='fern'?.89:kind==='ephedra'?.87:kind==='alder'?1.68:kind==='tea'?.68:kind==='heath'?.37:.63;
      return {index,height:h};
    }};
  };
})();
