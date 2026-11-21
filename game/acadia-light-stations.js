// Offshore light stations in the NOAA coastal laser survey's east/up/south metres.
(() => {
  'use strict';
  const sites={
    egg:{lamp:[4038.74,22.10,-3787.06],period:5,on:.55,phase:.26,color:[1,.004,.001]},
    baker:{lamp:[-693.13,40.03,8792.34],period:10,on:.68,phase:3.16,color:[1,.945,.82]}
  };
  let crownRecords;
  window.prepareAcadiaStationCrowns=async function(){
    const response=await fetch(window.aerieAssetURL?.('acadia-baker-crowns.bin')||'acadia-baker-crowns.bin');
    if(!response.ok)throw Error('Unable to open Baker Island crown survey');
    crownRecords=new Int16Array(await response.arrayBuffer());
    if(crownRecords.length%4)throw Error('Incomplete Baker Island crown survey');
  };
  function signal(t,s){
    const phase=((t+s.phase)%s.period+s.period)%s.period;
    if(phase>=s.on)return 0;
    const rise=Math.min(1,phase/.067,(s.on-phase)/.087);
    return rise*rise*(3-2*rise);
  }
  window.makeAcadiaLightStations=function makeAcadiaLightStations(T,scene,ground,texture,water){
    const roots=[],solids=new Map(),batches=new Map(),lamps=[];
    const colors={siding:0xe4e3df,front:0xf3f1ed,dormer:0xe9e6e1,white:0xe2e0d8,black:0x363d40,
      iron:0x33393c,glass:0x4f666e,roof:0x8c3339,shingle:0x888983,slate:0x515456,foundation:0xa59489,
      brick:0xad7961,green:0x314843,board:0xbabdb3,stair:0x87867c,masonry:0xefeee7};
    const maps={brick:'building-fieldstone.webp',siding:'acadia-keeper-clapboards.webp',front:'acadia-egg-west-front.webp',
      dormer:'acadia-egg-dormer.webp',masonry:'acadia-baker-masonry.webp',foundation:'building-fieldstone.webp',
      roof:'building-redslate.webp',shingle:'building-shingles.webp',stair:'building-boards.webp'};
    const mats={};
    for(const [key,col] of Object.entries(colors)){
      let map=null;if(maps[key]){map=texture(maps[key],key!=='front'&&key!=='dormer');map.colorSpace=T.SRGBColorSpace;}
      mats[key]=new T.MeshStandardMaterial({map,color:col,roughness:key==='glass'?.20:key==='iron'?.48:.88,
        metalness:key==='iron'?.35:0,side:T.DoubleSide,transparent:key==='glass',opacity:key==='glass'?.25:1,depthWrite:key!=='glass'});
    }
    let station,parent,cx,cz,angle,detail=false;
    const start=(x,z,a=0)=>{cx=x;cz=z;angle=a;};
    const vert=(x,y,z)=>[cx+x*Math.cos(angle)-z*Math.sin(angle),y,cz+x*Math.sin(angle)+z*Math.cos(angle)];
    function tri(mat,a,b,c,uv,normal){
      const tag=station+':'+Number(detail)+':'+mat;
      let data=batches.get(tag);
      if(!data){data={pos:[],norm:[],uv:[],mat,group:parent,detail};batches.set(tag,data);}
      const ab=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],ac=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
      const n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]],s=Math.hypot(...n);
      if(s<1e-9)return;
      const face=n.map(v=>v/s);data.pos.push(...a,...b,...c);data.uv.push(...uv);
      if(normal)data.norm.push(...normal[0],...normal[1],...normal[2]);else data.norm.push(...face,...face,...face);
      if(Math.abs(face[1])<.07||mat==='glass')return;
      const x0=Math.floor(Math.min(a[0],b[0],c[0])/4),x1=Math.floor(Math.max(a[0],b[0],c[0])/4);
      const z0=Math.floor(Math.min(a[2],b[2],c[2])/4),z1=Math.floor(Math.max(a[2],b[2],c[2])/4);
      const den=ab[0]*ac[2]-ab[2]*ac[0];const plane=[...a,ac[2]/den,-ac[0]/den,-ab[2]/den,ab[0]/den,ab[1],ac[1]];
      for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){const id=x*65536+z;if(!solids.has(id))solids.set(id,[]);solids.get(id).push(plane);}
    }
    function quad(mat,a,b,c,d,u=1,v=1){
      tri(mat,a,b,d,[0,0,u,0,0,v]);tri(mat,b,c,d,[u,0,u,v,0,v]);
    }
    function box(mat,x,z,w,d,y0,y1,front){
      const x0=x-w/2,x1=x+w/2,z0=z-d/2,z1=z+d/2;
      const p=(X,Y,Z)=>vert(X,Y,Z),ww=mat==='siding'?w/4:1,dd=mat==='siding'?d/4:1,hh=mat==='siding'?(y1-y0)/2.9:1;
      quad(mat,p(x1,y0,z0),p(x0,y0,z0),p(x0,y1,z0),p(x1,y1,z0),ww,hh);
      quad(mat,p(x0,y0,z1),p(x1,y0,z1),p(x1,y1,z1),p(x0,y1,z1),ww,hh);
      quad(front||mat,p(x0,y0,z0),p(x0,y0,z1),p(x0,y1,z1),p(x0,y1,z0),front?1:dd,front?1:hh);
      quad(mat,p(x1,y0,z1),p(x1,y0,z0),p(x1,y1,z0),p(x1,y1,z1),dd,hh);
      quad(mat,p(x0,y1,z1),p(x1,y1,z1),p(x1,y1,z0),p(x0,y1,z0));
    }
    function roof(mat,x,z,w,d,eave,top,hip=0){
      // Ridge follows local Z. At full hip a square roof terminates in a point.
      const l=x-w/2,r=x+w/2,n=z-d/2,s=z+d/2,near=n+hip,far=s-hip;
      const a=vert(l,eave,n),b=vert(r,eave,n),c=vert(r,eave,s),v=vert(l,eave,s);
      const g=vert(x,top,near),h=vert(x,top,far);
      if(near<far-.01){quad(mat,v,a,g,h,d/3,w/5);quad(mat,b,c,h,g,d/3,w/5);}
      else {tri(mat,v,a,g,[0,0,2,0,1,1]);tri(mat,b,c,g,[0,0,2,0,1,1]);}
      const face=hip>.01?mat:'siding';
      tri(face,a,b,g,[0,0,1,0,.5,1]);tri(face,c,v,h,[0,0,1,0,.5,1]);
    }
    function ring(mat,x,z,y0,y1,r0,r1,segments,round=false){
      const p=(a,y,r)=>vert(x+r*Math.cos(a),y,z+r*Math.sin(a));
      for(let i=0;i<segments;i++){
        const a=2*Math.PI*i/segments,b=2*Math.PI*(i+1)/segments;
        const A=p(b,y0,r0),B=p(a,y0,r0),C=p(a,y1,r1),D=p(b,y1,r1);
        if(round){
          const slope=(r0-r1)/(y1-y0),inv=1/Math.hypot(1,slope);
          const norm=t=>[Math.cos(t+angle)*inv,slope*inv,Math.sin(t+angle)*inv];
          const u0=i/segments*3,u1=(i+1)/segments*3;
          tri(mat,A,B,D,[u1,0,u0,0,u1,1],[norm(b),norm(a),norm(b)]);
          tri(mat,B,C,D,[u0,0,u0,1,u1,1],[norm(a),norm(a),norm(b)]);
        }else quad(mat,A,B,C,D);
        tri(mat,p(b,y1,r1),p(a,y1,r1),vert(x,y1,z),[0,0,1,0,.5,1]);
      }
    }
    function bar(mat,a,b,width){
      const axis=new T.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]).normalize();
      const u=new T.Vector3().crossVectors(axis,Math.abs(axis.y)<.85?new T.Vector3(0,1,0):new T.Vector3(1,0,0)).normalize().multiplyScalar(width*.5);
      const v=new T.Vector3().crossVectors(axis,u);const points=p=>[[1,1],[-1,1],[-1,-1],[1,-1]].map(([i,j])=>[p[0]+i*u.x+j*v.x,p[1]+i*u.y+j*v.y,p[2]+i*u.z+j*v.z]);
      const lo=points(a),hi=points(b);for(let i=0;i<4;i++){const j=(i+1)%4;quad(mat,lo[i],lo[j],hi[j],hi[i]);}
    }
    function gallery(x,z,y,r,square){
      const n=square?4:16,at=(i,h)=>{const t=(i/n)*Math.PI*2+(square?Math.PI/4:0);return vert(x+r*Math.cos(t),h,z+r*Math.sin(t));};
      for(let i=0;i<n;i++){const j=(i+1)%n;bar('iron',at(i,y+.045),at(i,y+.9),.055);
        for(const h of [.43,.87])bar('iron',at(i,y+h),at(j,y+h),.05);}
    }
    function lantern(s,deck,r,square){
      const [X,,Z]=s.lamp;start(X,Z);detail=false;
      if(square)box('iron',0,0,4.25,4.25,deck-.14,deck);else ring('iron',0,0,deck-.21,deck,2.12,2.13,36);
      ring('iron',0,0,deck,deck+.67,r,r,8);
      for(let i=0;i<8;i++){
        const a=i*Math.PI/4,b=(i+1)*Math.PI/4;
        const p=(q,y)=>vert(r*Math.cos(q),y,r*Math.sin(q));
        quad('glass',p(b,deck+.67),p(a,deck+.67),p(a,deck+1.92),p(b,deck+1.92));
        bar('iron',p(a,deck+.62),p(a,deck+1.95),.069);
      }
      ring('iron',0,0,deck+1.91,deck+2.06,r*1.13,r*1.08,8);
      ring('iron',0,0,deck+2.06,deck+2.48,r*1.08,r*.72,8);
      ring('iron',0,0,deck+2.48,deck+2.70,r*.72,.13,8);
      ring('iron',0,0,deck+2.70,deck+2.94,.11,.18,8);
      ring('iron',0,0,deck+2.94,deck+3.10,.18,.035,8);
      detail=true;gallery(0,0,deck,square?2.83:2.05,square);detail=false;
    }
    function frame(x,z,sill,w,h,face,door=false,boarded=false){
      // Coordinates are relative to a wall facing local +Z or -Z.
      box(door?'green':'white',x,z,w+.12,.095,sill-.065,sill+h+.065);
      box('green',x,z+face*.064,w,.040,sill,sill+h);
      box(boarded?'white':door?'board':'slate',x,z+face*.092,w-.14,.034,sill+.09,sill+h-.09);
    }
    station='egg';parent=new T.Group();parent.name='Egg Rock · 1875 light station';roots.push(parent);scene.add(parent);
    start(4038.70,-3787.12,.025);
    box('foundation',0,0,12.88,13.00,8.75,11.45);
    box('siding',0,0,12.9,13.02,11.45,14.91,'front');
    box('white',0,0,13.23,13.34,14.82,15.05);
    roof('roof',0,0,13.60,13.72,15.01,18.95,6.8);
    box('white',0,0,3.98,3.90,17.55,20.67);
    detail=true;
    for(const side of [-1,1]){
      // Central broad dormers on the ocean and bay elevations and coupled
      // gables on the other two faces form the square house's actual outline.
      box('siding',side*4.0,0,2.05,7.06,15.63,17.27,side<0?'dormer':null);
      if(side>0)quad('dormer',vert(5.04,15.63,3.53),vert(5.04,15.63,-3.53),vert(5.04,17.27,-3.53),vert(5.04,17.27,3.53));
      const out=side*5.25,inner=side*2.24;
      quad('roof',vert(out,17.31,-3.67),vert(out,17.31,3.67),vert(inner,18.41,3.67),vert(inner,18.41,-3.67));
      for(const v of [-2.72,2.72]){
        const peak=vert(side*4.16,0,v);
        start(peak[0],peak[2],.025+Math.PI/2);
        roof('roof',0,0,1.91,2.24,17.33,18.11);
        start(4038.70,-3787.12,.025);
        const x=v,z=side*4.62;
        box('siding',x,z,1.95,1.42,15.59,17.13);roof('roof',x,z,2.19,1.80,17.13,17.87);
        frame(x,z+side*.74,15.76,.78,1.14,side);
      }
      for(const x of [-4.0,0,4.0])frame(x,side*6.59,12.15,1.1,1.68,side);
      box('brick',side*2.79,side*2.85,.64,.77,17.0,18.24);
    }
    for(let i=0;i<5;i++)box('stair',-6.72-i*.28,0,.33,1.97,9.65,11.40-i*.19);
    for(const z of [-1,1]){
      bar('white',vert(-6.7,12.32,z),vert(-8.1,11.40,z),.075);
      bar('white',vert(-6.7,11.35,z),vert(-6.7,12.37,z),.075);
    }
    box('slate',-2.018,0,.055,.78,18.81,19.78);
    for(const z of [-.23,0,.23])box('white',-2.052,z,.028,.028,18.81,19.78);
    for(const y of [19.0,19.23,19.46,19.69])box('white',-2.055,0,.027,.80,y,y+.023);
    lantern(sites.egg,20.70,1.21,true);
    start(4040.8,-3763.85,.025);box('foundation',0,0,6.05,8.33,8.36,10.05);
    box('brick',0,0,6.04,8.24,10.0,12.64);roof('shingle',0,0,6.50,8.74,12.62,15.20,1.4);
    detail=true;frame(0,-4.18,10.03,1.01,2.12,-1,true);start(4040.6,-3763.97,Math.PI/2+.025);
    for(const u of [-2.5,1.5])frame(u,3.13,10.81,.84,1.22,1);detail=false;

    station='baker';parent=new T.Group();parent.name='Baker Island · 1855 light station';roots.push(parent);scene.add(parent);
    start(-693.13,8792.34);ring('masonry',0,0,28.45,38.62,2.16,1.76,40,true);
    detail=true;
    for(const [y,a] of [[30.17,Math.PI],[33.41,-Math.PI/2],[36.71,Math.PI/2]]){
      start(-693.13,8792.34,a);
      box('white',0,1.90,.75,.14,y-.08,y+1.04);
      box('slate',0,1.99,.54,.08,y,y+.95);
      for(const x of [-.115,.115])box('white',x,2.045,.029,.024,y,y+.95);
      for(let i=1;i<5;i++)box('white',0,2.046,.55,.025,y+i*.19,y+i*.19+.029);
    }
    start(-693.13,8792.34,.55);box('foundation',0,-1.96,1.55,.42,28.77,31.1);
    box('green',0,-2.22,.91,.05,28.89,30.9);detail=false;
    lantern(sites.baker,38.67,1.23,false);
    start(-686.30,8786.30,.58);
    box('foundation',-2.54,.4,8.32,7.63,26.86,28.75);box('siding',-2.54,.4,8.32,7.63,28.75,31.91);
    roof('shingle',-2.54,.4,8.84,8.06,31.89,35.83);
    // Short perpendicular kitchen ell. Its ridge sits two metres below the main block.
    box('foundation',4.23,-1.39,6.18,4.16,26.45,27.96);box('siding',4.23,-1.39,6.18,4.16,27.96,31.5);
    const p=vert(4.23,0,-1.39);start(p[0],p[2],.58+Math.PI/2);roof('shingle',0,0,4.64,6.8,31.48,33.45);
    start(-686.30,8786.30,.58);detail=true;
    for(const face of [-1,1]){
      for(const x of [-4.65,-.43])frame(x,.4+face*3.85,29.19,.93,1.50,face,false,true);
      for(const x of [-4.45,-.63])frame(x,.4+face*3.85,32.10,.72,1.12,face,false,true);
    }
    const center=vert(-2.54,0,.4);
    start(center[0],center[2],.58+Math.PI/2);
    for(const along of [-2.22,0,2.22]){
      const door=along>2;
      frame(along,4.20,door?28.76:29.18,door?1.05:.97,door?2.21:1.56,1,door,true);
    }
    for(const along of [-2.22,2.22])frame(along,-4.20,29.18,.97,1.56,-1,false,true);
    for(const side of [-1,1]){
      box('siding',0,side*2.67,1.66,1.64,32.35,34.0);
      roof('shingle',0,side*2.67,1.94,1.95,33.98,34.82);
      frame(0,side*3.52,32.62,.83,1.13,side,false,true);
    }
    start(-686.30,8786.30,.58);
    for(const x of [3.16,5.35])frame(x,-3.51,28.82,.83,1.46,-1,false,true);
    box('brick',-2.6,-1.45,.70,.80,34.98,36.70);box('brick',3.22,-1.36,.40,.55,33.0,33.87);
    // The 1895 brick oil house stands north of the tower. Its two empty
    // tank cradles survive on the east side, as shown on the NPS site plan.
    start(-720.80,8774.66,.50);detail=false;
    box('foundation',0,0,3.30,3.31,24.86,25.78);box('brick',0,0,3.20,3.19,25.78,27.80);
    roof('shingle',0,0,3.79,3.78,27.79,29.17);
    detail=true;frame(0,1.64,25.79,.88,1.83,1,true,true);
    for(const z of [-.81,.81])box('foundation',2.70,z,1.22,.38,25.2,25.86);
    // 1905 shingled fuel house, downhill to the southwest. The entry opens
    // at the north end below the loft. The measured crest is 27.62 m.
    start(-725.70,8810.40,-.818);detail=false;
    box('foundation',0,0,4.0,6.08,20.85,22.06);box('shingle',0,0,4.04,6.10,22.06,25.48);
    roof('shingle',0,0,4.67,6.78,25.45,27.61);
    detail=true;box('white',0,-3.10,2.65,.09,22.09,24.54);
    box('board',0,-3.17,2.48,.08,22.14,24.46);
    bar('white',vert(0,22.14,-3.22),vert(0,24.48,-3.22),.076);
    frame(0,-3.11,25.3,.73,.94,-1,false,true);
    detail=false;
    const surf=water?.geometry ? window.makeAcadiaLedgeSurf(T,scene,water,ground) : null;
    const stationState={roots,sites,signal};
    for(const {pos,norm,uv,mat,group,detail:small} of batches.values()){
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));
      geo.setAttribute('normal',new T.Float32BufferAttribute(norm,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.computeBoundingSphere();
      const mesh=new T.Mesh(geo,mats[mat]);mesh.userData.stationFine=small;group.add(mesh);
    }
    for(const [id,s] of Object.entries(sites))lamps.push(window.acadiaNavigationLamp(T,scene,id,s));
    const optics=[{value:0},{value:0}];
    return {...stationState,
      seaSurface:surf?.seaSurface,
      lightWater(){window.acadiaOffshoreWater(T,water,texture,sites,optics);surf?.lightWater();},
      roof(x,z){
        const bucket=solids.get(Math.floor(x/4)*65536+Math.floor(z/4));
        if(!bucket)return -Infinity;let h=-Infinity;
        for(const [ax,ay,az,Ux,Uz,Vx,Vz,dy,dv] of bucket){
          const dx=x-ax,dz=z-az,u=Ux*dx+Uz*dz,v=Vx*dx+Vz*dz;
          if(u>=0&&v>=0&&u+v<=1)h=Math.max(h,ay+u*dy+v*dv);
        }
        return h;
      },
      plant(plantTree){
        if(!crownRecords)return;
        for(let i=0;i<crownRecords.length;i+=4){
          const x=crownRecords[i],z=crownRecords[i+1];
          plantTree({x,z,y:ground(x,z),height:crownRecords[i+2]/4,width:crownRecords[i+3]/8,seed:(i*.381966)%1},true);
        }
      },
      update(t,player){
        surf?.update(t,player);
        for(let i=0;i<lamps.length;i++){
          const s=i?sites.baker:sites.egg,value=signal(t,s);lamps[i].value=value;optics[i].value=value;
          const near=Math.hypot(player.x-s.lamp[0],player.z-s.lamp[2])<620;
          if(roots[i].userData.near===near)continue;roots[i].userData.near=near;
          for(const obj of roots[i].children)if(obj.userData.stationFine)obj.visible=near;
        }
      }
    };
  };
})();
