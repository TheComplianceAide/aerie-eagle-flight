// Real 3DEP ridge geometry outside the detailed Moosehead Lake survey.
// Surface queries and both game cameras use the same irregular triangles.
(() => {
  let loading;
  window.prepareMooseheadUplands=()=>{
    if(!loading)loading=load().catch(error=>{loading=null;throw error;});
    return loading;
  };

  async function load(){
    async function asset(name){
      const response=await fetch(window.aerieAssetURL?.(name)||name);
      if(!response.ok)throw new Error('Cannot open the Moosehead survey '+name);
      return response.arrayBuffer();
    }
    const [buffer,forest]=await Promise.all([asset('moosehead-uplands.bin'),asset('moosehead-woodland.bin')]);
    const reader=new DataView(buffer),forestView=new DataView(forest);
    if(forestView.getUint32(0,false)!==0x4d574331)throw new Error('Unrecognized Moosehead woodland map');
    const forestSize=forestView.getUint32(4,true),rootCount=forestView.getUint32(8,true);
    const percent=new Uint8Array(forest,12,forestSize*forestSize);
    const rootStart=12+percent.length;
    if(rootStart+8*rootCount!==forest.byteLength)throw new Error('Incomplete woodland map');
    if(reader.getUint32(0,false)!==0x4d555431)throw new Error('Unrecognized Moosehead terrain');
    const count=reader.getUint16(4,true),tileCount=reader.getUint16(6,true);
    const axes=new Int32Array(buffer,8,count+1),tiles=new Map();
    let offset=8+4*(count+1);
    for(let t=0;t<tileCount;t++){
      const i=reader.getUint8(offset),j=reader.getUint8(offset+1);
      const n=reader.getUint16(offset+2,true),faces=reader.getUint32(offset+4,true);
      offset+=8;
      const points=new Uint16Array(buffer,offset,n*5);
      offset+=n*10;
      const indices=new Uint16Array(buffer,offset,3*faces);
      offset+=faces*6;
      tiles.set(j*count+i,{i,j,n,points,indices});
    }
    if(offset!==buffer.byteLength)throw new Error('Incomplete Moosehead terrain');
    function axis(v){
      let i=0;
      while(i<count-1&&v>=axes[i+1])i++;
      return i;
    }
    function sample(x,z){
      let i=axis(x),j=axis(z);
      // On the negative edge axis() ordinarily selects the empty central
      // patch. Query the adjoining real boundary vertices from either side.
      if(Math.abs(x)<=6900&&Math.abs(z)<=6900){
        if(Math.max(Math.abs(x),Math.abs(z))<6899.99)return null;
        if(Math.abs(x)>=Math.abs(z))i=axis(x<0?-6900.01:6900.01);
        else j=axis(z<0?-6900.01:6900.01);
      }
      const tile=tiles.get(j*count+i);
      if(!tile)return null;
      const {indices,points}=tile;
      const u=Math.max(0,Math.min(65535,65535*(x-axes[i])/(axes[i+1]-axes[i])));
      const v=Math.max(0,Math.min(65535,65535*(z-axes[j])/(axes[j+1]-axes[j])));
      const bin=value=>Math.min(15,Math.floor(value/4096));
      if(!tile.bins){
        tile.bins=Array.from({length:256},()=>[]);
        for(let f=0;f<indices.length;f+=3){
          const a=5*indices[f],b=5*indices[f+1],c=5*indices[f+2];
          const left=bin(Math.min(points[a],points[b],points[c])),right=bin(Math.max(points[a],points[b],points[c]));
          const top=bin(Math.min(points[a+1],points[b+1],points[c+1])),bottom=bin(Math.max(points[a+1],points[b+1],points[c+1]));
          for(let row=top;row<=bottom;row++)for(let col=left;col<=right;col++)tile.bins[row*16+col].push(f);
        }
      }
      for(const f of tile.bins[bin(v)*16+bin(u)]){
        const a=5*indices[f],b=5*indices[f+1],c=5*indices[f+2];
        const x1=points[b]-points[a],x2=points[c]-points[a],z1=points[b+1]-points[a+1],z2=points[c+1]-points[a+1];
        const dx=u-points[a],dz=v-points[a+1],area=x1*z2-x2*z1;
        const w1=(dx*z2-dz*x2)/area,w2=(x1*dz-z1*dx)/area,w0=1-w1-w2;
        if(Math.min(w0,w1,w2)>=-1e-6)return .1*(w0*points[a+2]+w1*points[b+2]+w2*points[c+2]);
      }
      return null;
    }
    // Carve the fine waterfall survey out of the drawn uplands. Source
    // triangles stay available to sample() so the fine grid can meet the
    // coarse surface along its outer contour.
    function reserveGround(T,geometry,[left,top,right,bottom]){
      const position=Array.from(geometry.attributes.position.array);
      const normal=Array.from(geometry.attributes.normal.array);
      const exposure=Array.from(geometry.attributes.skyVisibility.array);
      const old=geometry.index.array,next=[],crossings=new Map();
      const planes=[[0,left,1],[0,right,-1],[2,top,1],[2,bottom,-1]];
      function cross(a,b,axis,edge){
        const av=position[3*a+axis],bv=position[3*b+axis];
        if(av===edge)return a;
        if(bv===edge)return b;
        const key=Math.min(a,b)+','+Math.max(a,b)+','+axis+','+edge;
        const known=crossings.get(key);
        if(known!==undefined)return known;
        const t=(edge-av)/(bv-av),id=position.length/3;
        for(let i=0;i<3;i++){
          position.push(i===axis?edge:position[3*a+i]*(1-t)+position[3*b+i]*t);
          normal.push(normal[3*a+i]*(1-t)+normal[3*b+i]*t);
        }
        exposure.push(Math.round(exposure[a]*(1-t)+exposure[b]*t));
        crossings.set(key,id);
        return id;
      }
      function triangulate(poly){
        for(let j=1;j+1<poly.length;j++){
          if(poly[0]!==poly[j]&&poly[0]!==poly[j+1]&&poly[j]!==poly[j+1])
            next.push(poly[0],poly[j],poly[j+1]);
        }
      }
      for(let k=0;k<old.length;k+=3){
        const a=old[k],b=old[k+1],c=old[k+2],ax=3*a,bx=3*b,cx=3*c;
        if(Math.max(position[ax],position[bx],position[cx])<=left||
           Math.min(position[ax],position[bx],position[cx])>=right||
           Math.max(position[ax+2],position[bx+2],position[cx+2])<=top||
           Math.min(position[ax+2],position[bx+2],position[cx+2])>=bottom){
          next.push(a,b,c);continue;
        }
        let inside=[a,b,c];
        for(const [axis,edge,sign] of planes){
          if(inside.length<3)break;
          const remaining=[],outside=[];
          for(let j=0;j<inside.length;j++){
            const v=inside[j],w=inside[(j+1)%inside.length];
            const va=(position[3*v+axis]-edge)*sign,wa=(position[3*w+axis]-edge)*sign;
            if(va>=0)remaining.push(v);
            if(va<=0)outside.push(v);
            if(va*wa<0){
              const split=cross(v,w,axis,edge);
              remaining.push(split);outside.push(split);
            }
          }
          triangulate(outside);
          inside=remaining;
        }
      }
      geometry.setIndex(next);
      geometry.setAttribute('position',new T.Float32BufferAttribute(position,3));
      geometry.setAttribute('normal',new T.Float32BufferAttribute(normal,3));
      geometry.setAttribute('skyVisibility',new T.Uint8BufferAttribute(exposure,1,true));
    }
    function shadeColdStream(material,survey,bank){
      const photo=bank?'detailOrtho':'woodland',soil=bank?'bankMaterial':'ground';
      const half=survey.woodlandHalf.toFixed(1),span=(2*survey.woodlandHalf).toFixed(1);
      // Use the same irradiance and forest-floor projection on both the
      // one-metre brook and its adjoining uplands. The July aerial takes
      // over at distance; underneath, shade follows the measured tree crowns.
      const source=`
        vec2 coldUv(vec2 q,vec2 cell){
          return .5*(cell+.014+.972*(1.-abs(2.*fract(.5*q)-1.)));
        }
        vec3 coldWood(vec3 base,vec3 position,vec3 normal,float distanceToEye,float bankWeight){
          vec2 delta=position.xz-vec2(${survey.x.toFixed(1)},${survey.z.toFixed(1)});
          float extent=max(abs(delta.x),abs(delta.y));
          if(extent>=${half}||bankWeight<.0001)return base;
          vec4 stand=texture2D(${photo},vec2(delta.x,-delta.y)/${span}+.5);
          float edge=1.-smoothstep(${half}-57.,${half},extent);
          vec2 q=delta;
          float standMix=.5+.24*sin(q.x*.071+q.y*.047)+.17*cos(q.y*.088-q.x*.039);
          // Two rotated photo footprints break up mirror bands on sloping
          // ground. Their grain stays fixed in metres as the eagle banks.
          vec2 qa=mat2(.86,.510,-.510,.86)*q*.213;
          vec2 qb=mat2(.277,-.961,.961,.277)*q*.167+vec2(.97,.43);
          vec3 duff=mix(texture2D(${soil},coldUv(qa,vec2(1.,1.))).rgb,
                        texture2D(${soil},coldUv(qb,vec2(1.,1.))).rgb,standMix);
          vec3 mineral=texture2D(${soil},coldUv(qb*.83+.18,vec2(0.,1.))).rgb;
          float moss=.5+.24*sin(q.x*.045+q.y*.031)+.18*sin(q.x*.039-q.y*.081);
          float rocky=(1.-smoothstep(.48,.91,normal.y))*.75+.12*moss;
          vec3 floorPhoto=mix(duff*vec3(.83,.94,.85),mineral,rocky);
          float canopyLuma=dot(stand.rgb,vec3(.23,.60,.17));
          // Leaf-off first returns describe potential direct gaps. Retain
          // ambient skylight under the canopy and reflected green light.
          vec3 ambient=vec3(.54,.64,.70)*(.73+.24*normal.y);
          vec3 direct=vec3(1.10,.99,.79)*(.11+max(dot(normal,sun),0.))*(.22+.78*stand.a);
          float closure=.68+.28*stand.a+.12*clamp(canopyLuma,0.,.75);
          vec3 floorLit=pow(max(floorPhoto,vec3(.022)),vec3(2.2))*closure*(ambient+direct);
          vec3 aerialLit=pow(stand.rgb,vec3(2.18))*(ambient+direct*.90);
          vec3 wooded=mix(floorLit,aerialLit,smoothstep(75.,430.,distanceToEye));
          return mix(base,wooded,edge*bankWeight);
        }
      `;
      material.fragmentShader=(bank?'':'uniform sampler2D woodland;\n')+material.fragmentShader
        .replace(/void main\(\)\s*\{/,source+'\nvoid main(){')
        .replace(bank?'float dep=1.-exp':'float air=1.-exp',
          (bank?'c=coldWood(c,wp,normal,d,smoothstep(4.,14.,brookDistance));\nfloat dep=1.-exp':
          'earth=coldWood(earth,wp,n,d,1.);\nfloat air=1.-exp'));
    }
    function add(T,scene,ranges,horizon,sun,haze,bays,ground,survey,woodland,bankSurveys=[]){
      const material=new T.ShaderMaterial({
        uniforms:{ranges:{value:ranges},horizon:{value:horizon},bays:{value:bays},ground:{value:ground},sun:{value:sun},haze:{value:haze}},
        vertexShader:`attribute float skyVisibility;
          varying vec3 wp,surfaceNormal;varying float sunlit;
          void main(){wp=position;surfaceNormal=normal;sunlit=skyVisibility;
            gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader:`uniform sampler2D ranges,horizon,bays,ground;uniform vec3 sun,haze;
          varying vec3 wp,surfaceNormal;varying float sunlit;
          void main(){
            vec2 p=vec2(wp.x,-wp.z);
            float r=max(abs(p.x),abs(p.y)),d=distance(wp,cameraPosition);
            vec3 ortho=mix(texture2D(ranges,p/62000.+.5).rgb,texture2D(horizon,p/164000.+.5).rgb,smoothstep(28000.,30950.,r));
            // These two eastern bay approaches have their own georeferenced
            // NAIP flight strips. Keep the lower resolution survey at their edges.
            vec2 spencer=wp.xz-vec2(11425.,199.),lily=wp.xz-vec2(15205.,9651.);
            bool inSpencer=dot(spencer,spencer)<dot(lily,lily);
            vec2 bay=inSpencer?spencer:lily;
            float edge=max(abs(bay.x),abs(bay.y));
            float shade=1.;
            if(edge<1900.){
              vec2 uv=clamp(vec2(bay.x,-bay.y)/3800.+.5,0.002,.998);
              uv.x=(uv.x+(inSpencer?0.:1.))*.5;
              vec4 survey=texture2D(bays,uv);
              float blend=1.-smoothstep(1500.,1900.,edge);
              ortho=mix(ortho,survey.rgb,blend);
              shade=mix(1.,survey.a,blend);
            }
            vec3 n=normalize(surfaceNormal);
            if(d<800.&&wp.y>311.8){
              // Wooded banks transition into real duff and washed gravel at
              // eagle height. A photograph of treetops is useful further away.
              vec2 coord=wp.xz*.225;
              vec2 mossUV=.5*(vec2(1.,1.)+.014+.972*(1.-abs(2.*fract(coord*.5)-1.)));
              vec2 gravelUV=.5*(vec2(0.,1.)+.014+.972*(1.-abs(2.*fract(mat2(.84,.54,-.54,.84)*coord*.83)-1.)));
              float wet=1.-smoothstep(312.5,316.8,wp.y);
              vec3 scan=mix(texture2D(ground,mossUV).rgb,texture2D(ground,gravelUV).rgb,wet);
              float blend=(1.-smoothstep(210.,800.,d))*smoothstep(.44,.84,n.y);
              ortho=mix(ortho,scan*(.73+.58*clamp(dot(ortho,vec3(.21,.64,.15)),.05,.75)),blend*.85);
            }
            float incidence=max(0.,dot(n,sun)),side=dot(n.xz,normalize(sun.xz));
            vec3 light=vec3(.47,.57,.70)*(.81+.19*n.y)+vec3(1.23,.99,.71)*(.12+1.20*incidence)*sunlit;
            vec3 earth=pow(ortho,vec3(2.2))*light*(.97+.18*side)*mix(vec3(.83,.91,1.),vec3(1.),shade)*(.49+.51*shade);
            float air=1.-exp(-d*.000016);
            vec3 scatter=haze*mix(vec3(.67,.78,.96),vec3(1.08,.98,.87),.5+.5*dot(normalize(wp-cameraPosition),sun));
            gl_FragColor=vec4(mix(earth,scatter,air),1.);
            #include <colorspace_fragment>
          }`
      });
      const forestMaterial=woodland?material.clone():null;
      if(forestMaterial){
        forestMaterial.uniforms={...material.uniforms,woodland:{value:woodland}};
        shadeColdStream(forestMaterial,survey,false);
      }
      const groups=new Map();
      for(const t of tiles.values()){
        const key=Math.floor(t.i/2)+','+Math.floor(t.j/2);
        if(!groups.has(key))groups.set(key,[]);
        groups.get(key).push(t);
      }
      for(const group of groups.values()){
        const n=group.reduce((s,t)=>s+t.n,0),indices=group.reduce((s,t)=>s+t.indices.length,0);
        const pos=new Float32Array(n*3),norm=new Float32Array(n*3),light=new Uint8Array(n);
        const index=n>65535?new Uint32Array(indices):new Uint16Array(indices);
        let k=0,start=0;
        for(const {i,j,n,points,indices} of group){
          for(let v=0;v<n;v++){
            const f=v*5,w=(k+v)*3,packed=points[f+3];
            pos[w]=axes[i]+(axes[i+1]-axes[i])*points[f]/65535;
            pos[w+1]=points[f+2]*.1;
            pos[w+2]=axes[j]+(axes[j+1]-axes[j])*points[f+1]/65535;
            norm[w]=((packed&255)-128)/127;norm[w+2]=((packed>>8)-128)/127;
            norm[w+1]=Math.sqrt(Math.max(0,1-norm[w]*norm[w]-norm[w+2]*norm[w+2]));
            light[k+v]=points[f+4];
          }
          for(let f=0;f<indices.length;f++)index[start+f]=k+indices[f];
          k+=n;start+=indices.length;
        }
        const g=new T.BufferGeometry();
        g.setIndex(new T.BufferAttribute(index,1));
        g.setAttribute('position',new T.BufferAttribute(pos,3));g.setAttribute('normal',new T.BufferAttribute(norm,3));
        g.setAttribute('skyVisibility',new T.BufferAttribute(light,1,true));
        if(survey&&group.some(({i,j})=>axes[i]<survey.x+survey.half&&axes[i+1]>survey.x-survey.half&&
           axes[j]<survey.z+survey.half&&axes[j+1]>survey.z-survey.half))
          reserveGround(T,g,[survey.x-survey.half,survey.z-survey.half,survey.x+survey.half,survey.z+survey.half]);
        for(const bank of bankSurveys){
          const [left,top,right,bottom]=bank.rect;
          if(group.some(({i,j})=>axes[i]<right&&axes[i+1]>left&&axes[j]<bottom&&axes[j+1]>top))
            reserveGround(T,g,bank.rect);
        }
        g.computeBoundingSphere();
        const nearStream=forestMaterial&&group.some(({i,j})=>
          axes[i]<survey.x+survey.woodlandHalf&&axes[i+1]>survey.x-survey.woodlandHalf&&
          axes[j]<survey.z+survey.woodlandHalf&&axes[j+1]>survey.z-survey.woodlandHalf);
        const mesh=new T.Mesh(g,nearStream?forestMaterial:material);
        mesh.userData.terrainCaster=true;
        mesh.name='Maine uplands · USGS terrain';scene.add(mesh);
      }
    }
    function cover(x,z){
      const u=Math.floor((x/64000+.5)*forestSize),v=Math.floor((z/64000+.5)*forestSize);
      return u>=0&&v>=0&&u<forestSize&&v<forestSize?percent[v*forestSize+u]*.01:0;
    }
    function woods(T,scene,world,clock,survey,bankSurveys=[]){
      const canopy=window.mooseheadCrowns(T,scene,clock),tiles=new Map();
      const {treeGrid}=world;
      if(!canopy)return ()=>{};
      function register(tree){
        const {x,z}=tree,cell=treeGrid.cell(x,z);
        if(!treeGrid.cells.has(cell))treeGrid.cells.set(cell,[]);
        treeGrid.cells.get(cell).push(tree);
        const area=Math.floor(x/3600)+64*Math.floor(z/3600);
        if(!tiles.has(area))tiles.set(area,[]);
        tiles.get(area).push(tree);
      }
      if(survey?.woodland){
        const data=new Int16Array(Uint8Array.from(atob(survey.woodland),c=>c.charCodeAt(0)).buffer);
        for(let i=0;i<data.length;i+=5){
          const x=survey.x+data[i]*.5,z=survey.z+data[i+1]*.5;
          register({x,z,y:world.elevation(x,z),height:data[i+2]/8,width:data[i+3]/8,
            conifer:data[i+4]===1,seed:((Math.imul(i,2654435761)>>>0)%65521)/65521});
        }
      }
      for(let k=0;k<rootCount;k++){
        const at=rootStart+k*8,x=forestView.getInt16(at,true),z=forestView.getInt16(at+2,true),insideBank=bankSurveys.some(b=>b.edge(x,z)>0);
        const y=insideBank?world.elevation(x,z):sample(x,z);
        if(y===null||y<world.waterLevel+.5)continue;
        const tree={x,y,z,height:forestView.getUint8(at+4)/8,width:forestView.getUint8(at+5)/8,conifer:!!forestView.getUint8(at+6),seed:forestView.getUint8(at+7)/255};
        if(survey?.woodland&&Math.max(Math.abs(x-survey.x),Math.abs(z-survey.z))<survey.woodlandHalf-20)continue;
        register(tree);
      }
      const quad=new T.PlaneGeometry(1,1),material=canopy.material(false),bounds=new T.Box3(),point=new T.Vector3(),stands=[];
      // Maintain each root through the crossover to fully branched regional 3D.
      for(const rows of tiles.values()){
        const g=new T.InstancedBufferGeometry();
        g.setIndex(quad.index);g.setAttribute('position',quad.attributes.position);g.setAttribute('uv',quad.attributes.uv);
        const roots=new Float32Array(rows.length*3),forms=new Float32Array(rows.length*4);
        bounds.makeEmpty();
        for(const [i,t] of rows.entries()){
          roots.set([t.x,t.y-.06,t.z],i*3);forms.set(canopy.traits(t,t.conifer),i*4);
          bounds.expandByPoint(point.set(t.x,t.y,t.z));
        }
        g.setAttribute('rootPosition',new T.InstancedBufferAttribute(roots,3));
        g.setAttribute('crownForm',new T.InstancedBufferAttribute(forms,4));
        g.boundingSphere=bounds.expandByScalar(30).getBoundingSphere(new T.Sphere());g.instanceCount=rows.length;
        const mesh=new T.Mesh(g,material);mesh.name='Mapped Maine ridge and shoreline woodland';scene.add(mesh);stands.push(mesh);
      }
      const last=new T.Vector3(Infinity,Infinity,Infinity);
      return eye=>{
        if(eye.distanceToSquared(last)<1600)return;
        last.copy(eye);
        for(const m of stands){const b=m.geometry.boundingSphere;m.visible=b.center.distanceToSquared(eye)<(b.radius+18000)**2;}
      };
    }
    window.mooseheadUplands={sample,add,cover,woods,shadeColdStream};
  }
})();
