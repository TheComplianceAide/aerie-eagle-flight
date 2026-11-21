// Fründenhütte SAC and the two photographed proglacial ponds. Coordinates use the Swiss world datum.
(() => {
  window.makeFrundenHut = function(T,scene,texture,sky,sun,clock,ground) {
    const data=window.aerieFrundenSurvey;
    if(!data)return null;
    const group=new T.Group();group.name='Fründenhütte SAC · hut, shed and glacier tarns';scene.add(group);
    const batches=new Map(),roofTriangles=[],pondTriangles=[];
    function append(material,points,uvs){
      let batch=batches.get(material);
      if(!batch){batch={xyz:[],uv:[]};batches.set(material,batch);}
      points.forEach((p,i)=>{batch.xyz.push(...p);batch.uv.push(...uvs[i]);});
    }
    const roof=new T.MeshLambertMaterial({map:texture('frunden-roofs.webp'),color:0xe8e6de,side:T.DoubleSide});
    roof.onBeforeCompile=shader=>{
      shader.vertexShader='varying vec2 hutRoofXZ;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n hutRoofXZ=position.xz;');
      shader.fragmentShader='varying vec2 hutRoofXZ;\n'+shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
        float span=dot(hutRoofXZ,vec2(.872,-.490));
        float px=fwidth(span);
        float ridge=sin(span*73.);float seams=1.-smoothstep(.012,.056,abs(fract(span/1.08)-.5));
        diffuseColor.rgb*=1.+ridge*.074*(1.-smoothstep(.023,.078,px))-.13*seams*(1.-smoothstep(.19,.62,px));`);
    };
    const masonry=new T.MeshLambertMaterial({map:texture('building-fieldstone.webp',true),color:0xd6cec2,side:T.DoubleSide});
    const shutter=new T.MeshLambertMaterial({map:texture('frunden-facade.webp'),color:0xf4ebdf,side:T.DoubleSide});
    const timber=new T.MeshLambertMaterial({color:0x82694b,side:T.DoubleSide});
    const sheet=new T.MeshLambertMaterial({color:0x555957,side:T.DoubleSide});
    for(const [i,building] of data.hut.entries()){
      for(const tri of building.roof){
        append(roof,tri,tri.map(([x,,z])=>[(x-1262)/34.5,1-(z-1910)/21.5]));
        roofTriangles.push(tri);
      }
      for(const tri of building.wall){
        const [a,b,c]=tri;
        const nx=(b[1]-a[1])*(c[2]-a[2])-(c[1]-a[1])*(b[2]-a[2]);
        const nz=(b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]);
        const length=Math.hypot(nx,nz)||1;
        append(i?timber:masonry,tri,tri.map(([x,y,z])=>[(x*nz-z*nx)/length*.41,y*.48]));
      }
    }
    function panel(origin,along,normal,u,bottom,w,h,col,outset=.037){
      const point=(x,y)=>[origin[0]+along[0]*(u+x)+normal[0]*outset,bottom+y,origin[1]+along[1]*(u+x)+normal[1]*outset];
      const a=point(-w/2,0),b=point(w/2,0),c=point(w/2,h),d=point(-w/2,h);
      const lo=(col+.045)/4,hi=(col+.955)/4;
      append(shutter,[a,b,c,a,c,d],[[lo,.025],[hi,.025],[hi,.975],[lo,.025],[hi,.975],[lo,.975]]);
    }
    function windows(origin,along,normal,positions,bottom){
      for(const u of positions){
        panel(origin,along,normal,u,bottom,.70,.99,1);
        panel(origin,along,normal,u-.555,bottom,.38,1.04,0,.055);
        panel(origin,along,normal,u+.555,bottom,.38,1.04,0,.055);
      }
    }
    // Field photograph of the northeast stone gable shows the arched doorway, attic light and chevron shutters.
    const gable=[1288.02,1911.42],ga=[.491,.871],gn=[.871,-.491];
    windows(gable,ga,gn,[2.1,8.65],986.10);
    windows(gable,ga,gn,[5.39],988.35);
    panel(gable,ga,gn,5.38,985.50,1.45,2.09,2);
    const terrace=[1286.19,1925.11],sa=[.872,-.490],sn=[.490,.872];
    windows(terrace,sa,sn,[1.3,3.95,6.6],986.01);
    const annex=[1278.91,1924.42];
    windows(annex,sa,sn,[1.35,3.92],985.72);
    // Small stove flue above the principal ridge, visible on the SAC photographs.
    const metalUv=[[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]];
    function box(x,y,z,width,height,depth,mat){
      const p=[];
      for(const yy of [0,height])for(const [dx,dz] of [[-1,-1],[1,-1],[1,1],[-1,1]])p.push([x+dx*width/2,y+yy,z+dz*depth/2]);
      const sides=[[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7],[4,5,6,7]];
      for(const [a,b,c,d] of sides)append(mat,[p[a],p[b],p[c],p[a],p[c],p[d]],metalUv);
    }
    box(1284.80,990.72,1918.70,.32,1.68,.37,sheet);box(1284.80,992.37,1918.70,.47,.12,.48,sheet);
    // The 10 cm SWISSIMAGE photograph resolves the apron and line of terrace picnic benches.
    for(const [x,z] of [[1288.12,1925.52],[1291.19,1924.22],[1293.52,1927.12],[1290.69,1929.07]]){
      const y=ground(x,z);
      for(const offset of [-.49,.49]){
        box(x,y+.32,z+offset,1.62,.09,.24,timber);
        for(const dx of [-.54,.54])box(x+dx,y,z+offset,.115,.34,.13,timber);
      }
      box(x,y+.67,z,1.62,.11,.53,timber);
      for(const dx of [-.54,.54])box(x+dx,y+.08,z,.12,.61,.42,timber);
    }
    for(const [material,batch] of batches){
      const g=new T.BufferGeometry();
      g.setAttribute('position',new T.Float32BufferAttribute(batch.xyz,3));
      g.setAttribute('uv',new T.Float32BufferAttribute(batch.uv,2));
      g.computeVertexNormals();g.computeBoundingSphere();
      const mesh=new T.Mesh(g,material);mesh.name='Fründenhütte · surveyed architecture';
      mesh.userData.terrainCaster=true;group.add(mesh);
    }
    const waterPositions=[];
    for(const pond of data.ponds){
      const contour=pond.outline.map(([x,z])=>new T.Vector2(x,z));
      for(const indices of T.ShapeUtils.triangulateShape(contour,[])){
        const tri=indices.map(i=>[contour[i].x,pond.level+.045,contour[i].y]);pondTriangles.push(tri);
        for(const p of tri)waterPositions.push(...p);
      }
    }
    if(waterPositions.length){
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(waterPositions,3));g.computeBoundingSphere();
      const material=new T.ShaderMaterial({side:T.DoubleSide,uniforms:{skyMap:{value:sky},sun:{value:sun},clock},vertexShader:
        'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader:`uniform sampler2D skyMap;uniform vec3 sun;uniform float clock;varying vec3 p;
        void main(){
          vec2 uv=p.xz;float footprint=max(length(dFdx(uv)),length(dFdy(uv)));
          float wave=sin(dot(uv,vec2(.82,1.94))-clock*2.2)*.017*(1.-smoothstep(.4,2.7,footprint));
          float ripple=sin(dot(uv,vec2(2.43,-.71))+clock*1.87)*.012*(1.-smoothstep(.16,1.8,footprint));
          vec3 normal=normalize(vec3(wave+ripple,1.,.43*wave-ripple));
          vec3 V=normalize(cameraPosition-p),ray=reflect(-V,normal);
          vec2 dir=vec2((atan(ray.z,ray.x)-atan(sun.z,sun.x))*.159154943+.65,asin(clamp(ray.y,-1.,1.))*.318309886+.457);
          vec3 sky=texture2D(skyMap,dir).rgb;
          // Rock walls surround each meltpool. Below their local skyline they reflect muted moraine.
          float rim=.25+.16*sin(atan(ray.z,ray.x)+1.0);
          vec3 reflection=mix(vec3(.22,.232,.241),sky,smoothstep(rim-.07,rim+.07,ray.y));
          float fresnel=.037+.78*pow(1.-max(0.,dot(V,normal)),4.);
          vec3 silty=vec3(.274,.319,.251)*(.87+.13*max(sun.y,0.));
          gl_FragColor=vec4(mix(silty,reflection,fresnel),1.);
        }`});
      const mesh=new T.Mesh(g,material);mesh.name='Fründengletscher · two mapped moraine ponds';group.add(mesh);
    }
    function topAt(triangles,x,z,base){
      for(const [a,b,c] of triangles){
        const dx=x-a[0],dz=z-a[2];
        const bx=b[0]-a[0],bz=b[2]-a[2],cx=c[0]-a[0],cz=c[2]-a[2],det=bx*cz-bz*cx;
        if(Math.abs(det)<.0001)continue;
        const u=(dx*cz-dz*cx)/det,v=(bx*dz-bz*dx)/det;
        if(u>=0&&v>=0&&u+v<=1)base=Math.max(base,a[1]+u*(b[1]-a[1])+v*(c[1]-a[1]));
      }
      return base;
    }
    group.userData.frunden={roofFaces:roofTriangles.length,ponds:data.ponds.length};
    return {group,clearance(x,z,base){
      if(x>1265&&x<1294&&z>1911&&z<1926)return topAt(roofTriangles,x,z,base);
      if(x>1270&&x<1455&&z>1987&&z<2040)return topAt(pondTriangles,x,z,base);
      return base;
    }};
  };
})();
