// Refine the existing reflective sea in two survey cells so crests can cross
// the measured ledge. Each fan ends on the four unchanged offshore grid edges.
(() => {
  const patches=[];
  const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
  const smooth=(a,b,n)=>{const u=clamp((n-a)/(b-a),0,1);return u*u*(3-2*u);};
  window.prepareAcadiaLedgeField=async function(){
    if(patches.length)return;
    const name='acadia-surf-field.bin',response=await fetch(window.aerieAssetURL?.(name)||name);
    if(!response.ok)throw Error('Cannot open Acadia coastal wave survey');
    const data=await response.arrayBuffer(),d=new DataView(data),loaded=[];
    if(d.getUint32(0)!==0x41534631||d.getUint32(4,true)!==2)throw Error('Invalid coastal wave survey');
    let at=8;
    for(let tile=0;tile<2;tile++){
      const [x,z,width,depth]=[0,4,8,12].map(i=>d.getInt32(at+i,true));
      const nx=d.getUint16(at+16,true)-1,nz=d.getUint16(at+18,true)-1;at+=20;
      if(nx!==Math.ceil(width/1.5)||nz!==Math.ceil(depth/1.5))throw Error('Invalid wave sampling grid');
      const n=(nx+1)*(nz+1),samples=new Uint8Array(data,at,n*4),field=new Float32Array(n*4);
      const exposure=tile?1:.64;
      for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
        const k=(j*(nx+1)+i)*4,edge=Math.min(i*width/nx,(nx-i)*width/nx,j*depth/nz,(nz-j)*depth/nz);
        const facing=clamp((samples[k+1]/127.5-1)*.64+(samples[k+2]/127.5-1)*.77,-1,1);
        field[k]=smooth(0,19,edge)*exposure*(.72+.28*facing);
        field[k+1]=samples[k]/255*116-12;field[k+2]=22*clamp((samples[k+3]/255-.50)/.495,0,1)**2;
      }
      loaded.push({x,z,width,depth,exposure,nx,nz,field});at+=samples.byteLength;
    }
    if(at!==data.byteLength)throw Error('Incomplete wave sampling grid');
    patches.splice(0,patches.length,...loaded);
  };
  function makeGrid(T,base,p){
    const {width,widthSegments:n}=base.parameters,step=width/n;
    const col=Math.floor((p.x+width/2)/step),row=Math.floor((p.z+width/2)/step);
    const cell=(col+row*n)*6,source=base.index.array;
    const idx=Array.from(source.subarray(0,cell)).concat(Array.from(source.subarray(cell+6)));
    const pos=Array.from(base.attributes.position.array),norm=Array.from(base.attributes.normal.array);
    const uv=Array.from(base.attributes.uv.array),field=Array(base.attributes.position.count*4).fill(0);
    const anchor=pos.length/3,nx=p.nx,nz=p.nz;
    const west=p.x-p.width/2,north=p.z-p.depth/2;
    const coord=(x,z)=>anchor+x+(nx+1)*z;
    for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
      const x=west+p.width*i/nx,z=north+p.depth*j/nz;
      const at=(j*(nx+1)+i)*4;
      pos.push(x,-z,0);norm.push(0,0,1);uv.push(.5+x/width,.5-z/width);
      field.push(p.field[at],p.field[at+1],p.field[at+2],0);
      if(i<nx&&j<nz){const a=coord(i,j),b=a+nx+1;idx.push(a,b,a+1,b,b+1,a+1);}
    }
    const a=col+row*(n+1),b=a+n+1,c=b+1,d=a+1;
    // Clockwise perimeter in map coordinates. Winding viewed from the air is opposite.
    const edges=[
      [a,d,Array.from({length:nx+1},(_,i)=>coord(i,0))],
      [d,c,Array.from({length:nz+1},(_,j)=>coord(nx,j))],
      [c,b,Array.from({length:nx+1},(_,i)=>coord(nx-i,nz))],
      [b,a,Array.from({length:nz+1},(_,j)=>coord(0,nz-j))]
    ];
    for(const [left,right,border] of edges){
      idx.push(left,border[border.length-1],right);
      for(let i=0;i+1<border.length;i++)idx.push(left,border[i],border[i+1]);
    }
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('normal',new T.Float32BufferAttribute(norm,3));
    g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setAttribute('surfGrid',new T.Float32BufferAttribute(field,4));
    g.setIndex(idx);g.computeBoundingSphere();return g;
  }
  // The phase turns toward the local bathymetric contour near the beach. Two
  // slightly different periods make individual sets build and pass in groups.
  const waves=`
    float ledgePhase(vec2 p,float bank,float t){
      return .036*dot(p,vec2(.69,.72))+.22*clamp(bank,-5.,80.)+.47*sin(dot(p,vec2(.066,-.052)))+.91*t;
    }
    float ledgeSet(vec2 p,float t){return .71+.18*sin(.178*t+dot(p,vec2(.011,-.016)))+.10*cos(.296*t+dot(p,vec2(.024,.008)));}
  `;
  function modifyWater(water){
    const m=water.material;
    m.defaultAttributeValues.surfGrid=[0,0,0,0];
    m.uniforms.ledgeActive={value:0};
    m.vertexShader='attribute vec4 surfGrid; varying vec3 ledgeSea;\n'+waves+m.vertexShader
      .replace('mirrorCoord = modelMatrix * vec4( position, 1.0 );',`
        vec3 wavePoint=position;
        ledgeSea=vec3(0.);
        if(surfGrid.x>.0001){
          vec2 p=vec2(position.x,-position.y);
          float bank=surfGrid.y,depth=surfGrid.z,t=time/.65;
          float phase=ledgePhase(p,bank,t),setSize=ledgeSet(p,t);
          float crest=sin(phase),shore=1.-smoothstep(4.,30.,bank);
          float strength=surfGrid.x;
          float height=(.34+.27*shore)*setSize*(crest+.26*(crest*crest-.5))+
                       .094*sin(dot(p,vec2(.080,.145))+1.31*t);
          wavePoint.z+=height*strength*smoothstep(-6.,-.7,bank);
          ledgeSea=vec3(strength,crest,setSize*(.72+.28*(1.-smoothstep(.3,4.,depth))));
        }
        mirrorCoord = modelMatrix * vec4( wavePoint, 1.0 );`)
      .replace('modelViewMatrix * vec4( position, 1.0 )','modelViewMatrix * vec4( wavePoint, 1.0 )');
    m.fragmentShader='uniform float ledgeActive; varying vec3 ledgeSea;\n'+m.fragmentShader
      .replace('vec3 n=normalize(vec3(slope.x,1.,slope.y));',`
        if(ledgeActive>.5){
          vec3 geometric=cross(dFdx(worldPosition.xyz),dFdy(worldPosition.xyz));
          if(abs(geometric.y)>.000001)slope+=clamp(geometric.xz/geometric.y,vec2(-.34),vec2(.34))*smoothstep(0.,.15,ledgeSea.x);
        }
        vec3 n=normalize(vec3(slope.x,1.,slope.y));`)
      .replace(/float white=oceanSurf[^;]+;/,`$&
        if(ledgeSea.x>.001){
          float distanceToRock=island.r*116.-12.;
          float breakerLip=smoothstep(.46,.93,ledgeSea.y)*ledgeSea.z*(1.-smoothstep(1.,14.,distanceToRock));
          float draining=(1.-smoothstep(.1,5.,abs(distanceToRock+.65)))*(.26+.16*max(0.,-ledgeSea.y));
          float localFoam=(breakerLip+draining)*(.14+.62*lace+.22*bubbles)*(.61+.39*foamPatch);
          white=mix(white,localFoam,smoothstep(0.,.40,ledgeSea.x));
        }`);
    m.needsUpdate=true;
  }
  // Use the same diagonal as the rendered triangles. Interpolating four water
  // samples bilinearly would leave flying wingtips on a different surface.
  function seaSurface(p,x,z,t){
    const west=p.x-p.width/2,north=p.z-p.depth/2;
    const u=clamp((x-west)*p.nx/p.width,0,p.nx),v=clamp((z-north)*p.nz/p.depth,0,p.nz);
    const i=Math.min(p.nx-1,Math.floor(u)),j=Math.min(p.nz-1,Math.floor(v)),a=u-i,b=v-j;
    function h(ii,jj){
      const k=4*(jj*(p.nx+1)+ii),strength=p.field[k];if(strength<.0001)return 0;
      const px=west+ii*p.width/p.nx,pz=north+jj*p.depth/p.nz,bank=p.field[k+1];
      const phase=.036*(.69*px+.72*pz)+.22*clamp(bank,-5,80)+.47*Math.sin(.066*px-.052*pz)+.91*t;
      const set=.71+.18*Math.sin(.178*t+.011*px-.016*pz)+.10*Math.cos(.296*t+.024*px+.008*pz);
      const c=Math.sin(phase),crest=(.34+.27*(1-smooth(4,30,bank)))*set*(c+.26*(c*c-.5));
      return (crest+.094*Math.sin(.08*px+.145*pz+1.31*t))*strength*smooth(-6,-.7,bank);
    }
    if(a+b<=1)return (1-a-b)*h(i,j)+a*h(i+1,j)+b*h(i,j+1);
    return (a+b-1)*h(i+1,j+1)+(1-b)*h(i+1,j)+(1-a)*h(i,j+1);
  }
  function throwSpray(T,scene,p,ground){
    const origins=[],directions=[],seeds=[];
    const anchors=[],rise=.16;
    const height=(x,z)=>ground(x,z)-rise;
    for(let z=p.z-p.depth/2+15;z<p.z+p.depth/2-15;z+=3.2)for(let x=p.x-p.width/2+15;x<p.x+p.width/2-15;x+=3.2){
      const h=height(x,z);if(h<-.45||h>1.05)continue;
      const dx=(height(x+1.3,z)-height(x-1.3,z))/2.6,dz=(height(x,z+1.3)-height(x,z-1.3))/2.6;
      const s=Math.hypot(dx,dz);if(s<.21||s>4.3||anchors.some(a=>Math.hypot(a[0]-x,a[1]-z)<6.2))continue;
      const nx=dx/s,nz=dz/s;
      const contact=[x-clamp(h/s,-1.6,1.6)*nx,z-clamp(h/s,-1.6,1.6)*nz];
      if(ground(contact[0]-3*nx,contact[1]-3*nz)>.1)continue;
      anchors.push(contact);
      for(let j=0;j<14;j++){
        const r=(j*.61803+anchors.length*.381966)%1;
        origins.push(contact[0],rise,contact[1]);directions.push(nx,nz);
        seeds.push(r,((j+3)*.754877+anchors.length*.193)%1,((j+7)*.56984+anchors.length*.287)%1);
      }
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(origins,3));
    g.setAttribute('landward',new T.Float32BufferAttribute(directions,2));g.setAttribute('grain',new T.Float32BufferAttribute(seeds,3));
    const uniforms={seconds:{value:0},pixelHeight:{value:1080},exposure:{value:p.exposure}};
    const m=new T.ShaderMaterial({uniforms,transparent:true,depthWrite:false,
      vertexShader:'attribute vec2 landward;attribute vec3 grain;uniform float seconds,pixelHeight,exposure;varying float opacity;'+waves+`
        void main(){
          float phase=ledgePhase(position.xz,0.,seconds),strength=ledgeSet(position.xz,seconds);
          float age=mod(phase-1.28-1.15*grain.x,6.2831853)/.91;
          float alive=1.-smoothstep(.22,.83,age);
          vec2 tangent=vec2(-landward.y,landward.x);
          vec3 q=position;
          q.xz+=tangent*((grain.x-.5)*2.6+age*(grain.z-.5)*1.6)+landward*(.27+age*(.67+grain.y));
          q.y+=.23+age*(2.9+2.7*grain.y)*strength-4.905*age*age;
          vec4 view=modelViewMatrix*vec4(q,1.);
          float diameter=(.045+.16*grain.z)*pixelHeight*projectionMatrix[1][1]/(2.*max(1.,-view.z));
          gl_Position=projectionMatrix*view;gl_PointSize=clamp(diameter,1.,24.);
          opacity=alive*strength*exposure*clamp(diameter,.03,1.)*smoothstep(.01,.22,q.y)*
                  (1.-smoothstep(100.,230.,length(view.xyz)));
        }`,
      fragmentShader:`varying float opacity;void main(){
        float r=length(gl_PointCoord-.5)*2.;float alpha=(1.-smoothstep(.18,1.,r))*opacity*.49;
        if(alpha<.006)discard;gl_FragColor=vec4(.18,.225,.275,alpha);
        #include <colorspace_fragment>
      }`});
    m.userData.acadiaNight=true;
    const spray=new T.Points(g,m);spray.name='Surveyed ledge · breaking spray';spray.visible=false;
    spray.renderOrder=7;scene.add(spray);const size=new T.Vector2();
    spray.onBeforeRender=renderer=>{renderer.getDrawingBufferSize(size);uniforms.pixelHeight.value=size.y;};
    return spray;
  }
  window.makeAcadiaLedgeSurf=function(T,scene,water,ground){
    const base=water.geometry,grids=[],spray=[];
    let active=-1;
    return {
      lightWater(){modifyWater(water);water.material.uniforms.ledgeActive.value=active<0?0:1;},
      seaSurface(x,z,t){
        const p=patches[active];
        if(!p||Math.abs(x-p.x)>p.width/2||Math.abs(z-p.z)>p.depth/2)return water.position.y;
        return water.position.y+seaSurface(p,x,z,t);
      },
      update(t,player){
        const distances=patches.map(p=>Math.hypot(player.x-p.x,player.z-p.z,player.y||0));
        const next=distances.findIndex((d,i)=>d<(i===active?850:740));
        if(next!==active){
          if(active>=0&&spray[active])spray[active].visible=false;
          if(next>=0&&!grids[next])grids[next]=makeGrid(T,base,patches[next]);
          water.geometry=next<0?base:grids[next];active=next;
          if(water.material.uniforms.ledgeActive)water.material.uniforms.ledgeActive.value=active<0?0:1;
        }
        if(active>=0&&distances[active]<245&&!spray[active])spray[active]=throwSpray(T,scene,patches[active],ground);
        if(active>=0&&spray[active]){
          spray[active].visible=distances[active]<245;
          spray[active].material.uniforms.seconds.value=t;
        }
      }
    };
  };
  window.makeAcadiaLedgeSurf.bedWeight=function(x,z){
    for(const p of patches){
      const margin=Math.min(p.width/2-Math.abs(x-p.x),p.depth/2-Math.abs(z-p.z));
      if(margin>0){const u=clamp(margin/14,0,1);return u*u*(3-2*u);}
    }
    return 0;
  };
})();
