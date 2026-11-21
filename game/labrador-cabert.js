// A permanent, unnamed watercourse draining Lac Cabert into Lac Berté. The
// registered flowline, lake polygon, lidar and summer imagery are credited in
// labrador-credits.txt. The under-canopy bed and flow rate are reconstructions.
(() => {
  const unpack=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  const lerp=(a,b,t)=>a+(b-a)*t;
  window.makeCabertProfile=function(){
    const src=window.cabertFlowSurvey,[left,top]=src.origin;
    const raw=new Int16Array(unpack(src.stations).buffer);
    const stations=[];
    for(let i=0;i<raw.length;i+=6)stations.push({x:left+raw[i]/10,z:top+raw[i+1]/10,y:350+raw[i+2]/100,
      left:raw[i+3]/20,right:raw[i+4]/20,strength:raw[i+5]/250});
    const blocks=new Int16Array(unpack(src.rocks).buffer),bars=[];
    for(let i=0;i<blocks.length;i+=5)bars.push({x:left+blocks[i]/2,z:top+blocks[i+1]/2,r:blocks[i+2]/100,
      ground:350+blocks[i+3]/100,sill:blocks[i+4]/200});
    const trees=new Int16Array(unpack(src.crowns).buffer),crowns=[];
    for(let i=0;i<trees.length;i+=4)crowns.push({x:left+trees[i]/2,z:top+trees[i+1]/2,height:trees[i+2]/8,
      width:trees[i+3]/8,seed:(i*.61803399)%1,measuredCabert:true});
    // Only local flight/canopy queries enter the corridor. An indexed list of
    // short cross sections keeps vegetation and per-frame clearance affordable.
    const grid=new Map(),stride=64;
    const key=(ix,iz)=>ix*10000+iz;
    for(let i=0;i<stations.length-1;i++){
      const a=stations[i],b=stations[i+1];
      for(let iz=Math.floor((Math.min(a.z,b.z)-72)/stride);iz<=Math.floor((Math.max(a.z,b.z)+72)/stride);iz++)
        for(let ix=Math.floor((Math.min(a.x,b.x)-72)/stride);ix<=Math.floor((Math.max(a.x,b.x)+72)/stride);ix++){
          const k=key(ix,iz);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(i);
        }
    }
    const [west,north,step,cols,rows,bytes]=src.pondMask;
    const mask=new Int8Array(unpack(bytes).buffer);
    function lakeDistance(x,z){
      const u=(x-west)/step-.5,v=(z-north)/step-.5;
      if(u<0||v<0||u>=cols-1||v>=rows-1)return -128;
      const ix=Math.floor(u),iz=Math.floor(v),n=iz*cols+ix;
      return lerp(lerp(mask[n],mask[n+1],u-ix),lerp(mask[n+cols],mask[n+cols+1],u-ix),v-iz);
    }
    function reach(x,z,canopy){
      const cells=grid.get(key(Math.floor(x/stride),Math.floor(z/stride)));
      if(!cells)return canopy?false:-Infinity;
      let best=Infinity,level=-Infinity;
      for(const i of cells){
        const a=stations[i],b=stations[i+1],dx=b.x-a.x,dz=b.z-a.z,ax=x-a.x,az=z-a.z;
        const len=dx*dx+dz*dz;
        const along=Math.min(1,Math.max(0,(ax*dx+az*dz)/Math.max(.001,len)));
        const qx=ax-along*dx,qz=az-along*dz,d2=qx*qx+qz*qz;
        if(canopy&&d2<69*69)return true;
        if(d2>=best)continue;
        const sign=az*dx-ax*dz;
        const radius=sign<0?lerp(a.left,b.left,along):lerp(a.right,b.right,along);
        if(d2<radius*radius){best=d2;level=lerp(a.y,b.y,along);}
      }
      return canopy?false:level;
    }
    return {stations,crowns,bars,pond:src.pond,level:src.upperLevel,lakeDistance,
      at:(x,z)=>lakeDistance(x,z)>=0?src.upperLevel:reach(x,z,false),
      ownsCrowns:(x,z)=>x>=left+8&&x<=-3272&&z>=top+8&&z<=1616&&reach(x,z,true),
      pondBed(x,z,base){const d=lakeDistance(x,z);return d<=0?base:Math.min(base,src.upperLevel-.13-Math.min(d*.11,2.7));}};
  };

  function buildBars(T,scene,profile,texture,elevation){
    let state=17617331;
    const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
    // The 1 m returns resolve larger exposed mounds. Pack finer clasts into the
    // same mapped bars, with each stone embedded in its local bed.
    const groups=Array.from({length:3},()=>[]);
    for(const bar of profile.bars){
      const stones=1+Math.floor(3+bar.sill*6);
      for(let j=0;j<stones;j++){
        const r=j?bar.r*(.18+.43*random()):bar.r;
        const a=random()*Math.PI*2,d=j?bar.r*(.76+2.4*random()):0;
        const x=bar.x+Math.cos(a)*d,z=bar.z+Math.sin(a)*d;
        const y=elevation(x,z),water=profile.at(x,z);
        if(Number.isFinite(water)&&water-y>1.2*r+.20)continue;
        const wet=Number.isFinite(water)||y<bar.ground+.14;
        groups[Math.floor(random()*3)].push({x,z,y,r,wet,angle:random()*6.28});
      }
    }
    const material=new T.MeshStandardMaterial({map:texture('shore-stone.webp',true),roughness:.83});
    const transform=new T.Object3D(),tone=new T.Color(),rocks=[];
    for(let j=0;j<groups.length;j++){
      const core=new T.IcosahedronGeometry(1,1),pos=core.attributes.position;
      for(let i=0;i<pos.count;i++){
        const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
        const f=1+.11*Math.sin(6.1*x+4.2*z+j)+.08*Math.cos(7.8*y-2.5*x+j*1.27);
        pos.setXYZ(i,x*f,Math.max(-.72,y*f),z*f);
      }
      core.computeVertexNormals();
      const layer=new T.InstancedMesh(core,material,groups[j].length);
      groups[j].forEach((stone,i)=>{
        const {r,x,z,y,wet,angle}=stone;
        transform.position.set(x,y+.025+.095*r,z);
        transform.scale.set(r*(.92+.33*random()),r*(.38+.37*random()),r*(.66+.38*random()));
        transform.rotation.set((random()-.5)*.39,angle,(random()-.5)*.26);transform.updateMatrix();
        layer.setMatrixAt(i,transform.matrix);
        const k=(wet?.60:.84)+.27*random();tone.setRGB(k*1.08,k*1.03,k*.96);layer.setColorAt(i,tone);
      });
      layer.name='Cabert mineral bars · exposed clasts '+(j+1);layer.computeBoundingSphere();scene.add(layer);rocks.push(layer);
    }
    return rocks;
  }
  window.shadeCabertBanks=function(material,localUV,texture){
    material.uniforms.cabertGravel={value:texture('shore-pebbles.webp',true)};
    material.fragmentShader='uniform sampler2D cabertGravel;\n'+material.fragmentShader.replace('float green=smoothstep(',`
      vec4 cabertLocal=texture2D(aerial,${localUV});
      float wetBank=cabertLocal.a*landformHorizon.w;
      // Shade the moss bed beneath the measured spruce cover, keeping the
      // lighter exposed lichen openings visible on both shoulders of the cut.
      float closure=landformHorizon.z*landformHorizon.w;
      vec3 moss=mix(vec3(.17,.202,.135),cabertLocal.rgb*vec3(.80,.86,.71)+vec3(.035),.61);
      c=mix(c,moss,.51*closure*(1.-wetBank));
      if(wetBank>.001){
        vec2 tideUV=xz*.44+vec2(.17*sin(xz.y*.73),.12*cos(xz.x*.91));
        vec3 grains=texture2D(cabertGravel,tideUV).rgb;
        float roughness=clamp(dot(grains,vec3(.25,.58,.17))/.43,.31,2.);
        float tone=clamp(dot(cabertLocal.rgb,vec3(.25,.58,.17))*1.75,.14,.67);
        vec3 mineral=mix(vec3(.34,.29,.205),vec3(.48,.465,.41),tone)*(.43+.67*roughness);
        vec3 edge=mix(mineral*.87,mineral*.56+.12*cabertLocal.rgb,wetBank);
        c=mix(c,edge,wetBank*.90);
      }
      float green=smoothstep(`);
  };
  window.addCabertOutlet=function(T,scene,profile,texture,sky,sun,clock,elevation){
    // Bends, pools and sills share one draw. Varying stream coordinates keep
    // the bubbles traveling down a bend rather than sideways across the bank.
    const p=[],flow=[],indices=[],tiles=[];
    let travel=0,meters=0;
    const rows=profile.stations;
    for(let i=0;i<rows.length;i++){
      const a=rows[i],prev=rows[Math.max(0,i-1)],next=rows[Math.min(rows.length-1,i+1)];
      const dx=next.x-prev.x,dz=next.z-prev.z,len=Math.max(.01,Math.hypot(dx,dz));
      const distance=Math.hypot(a.x-prev.x,a.z-prev.z);
      travel+=distance/(.30+1.45*(a.strength+prev.strength)*.5);meters+=distance;
      const across=[-a.left,-a.left*.5,0,a.right*.5,a.right];
      for(let j=0;j<across.length;j++){
        const v=across[j],u=j*.5-1;
        p.push(a.x-dz/len*v,a.y+.012,a.z+dx/len*v);
        flow.push(u,travel,a.strength,v);tiles.push(i/(rows.length-1)*23);
        if(i&&j){const k=i*5+j;indices.push(k-6,k-1,k,k-6,k,k-5);}
      }
    }
    const channel=new T.BufferGeometry();
    channel.setAttribute('position',new T.Float32BufferAttribute(p,3));
    channel.setAttribute('cabertFlow',new T.Float32BufferAttribute(flow,4));
    channel.setAttribute('cabertReflection',new T.Float32BufferAttribute(tiles,1));channel.setIndex(indices);channel.computeBoundingSphere();
    const pondPos=[],pondFlow=[];
    for(const rings of profile.pond){
      const vertices=rings.map(r=>r.map(([x,z])=>new T.Vector2(x,z)));
      const all=vertices.flat();
      for(const face of T.ShapeUtils.triangulateShape(vertices[0],vertices.slice(1)))for(const n of face){
        pondPos.push(all[n].x,profile.level,all[n].y);pondFlow.push(0,0,-1,0);
      }
    }
    const pond=new T.BufferGeometry();pond.setAttribute('position',new T.Float32BufferAttribute(pondPos,3));
    pond.setAttribute('cabertFlow',new T.Float32BufferAttribute(pondFlow,4));pond.setAttribute('cabertReflection',new T.Float32BufferAttribute(new Float32Array(pondFlow.length/4),1));pond.computeBoundingSphere();
    const vertexShader='attribute float cabertReflection;varying float tile;attribute vec4 cabertFlow;varying vec4 reach;varying vec3 place;void main(){place=position;reach=cabertFlow;tile=cabertReflection;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
    const material=new T.ShaderMaterial({side:T.DoubleSide,uniforms:{t:clock,sky:{value:sky},sun:{value:sun},
      bankMirror:{value:texture('cabert-reflected-banks.webp')},gravel:{value:texture('shore-pebbles.webp',true)},froth:{value:texture('falls-entrainment.webp',true)},bedPhoto:{value:texture('landform-cabert-aerial.webp')}},
      vertexShader,fragmentShader:`
      varying float tile;varying vec4 reach;varying vec3 place;uniform float t;uniform vec3 sun;uniform sampler2D sky,froth,bedPhoto,bankMirror,gravel;
      vec4 bankPhoto(float i,vec2 local){
        vec2 cell=vec2(mod(i,4.),6.-floor(i/4.));
        return texture2D(bankMirror,(cell+local)/vec2(4.,7.));
      }
      void main(){
        vec2 xz=place.xz;float px=max(length(dFdx(xz)),length(dFdy(xz)));
        float pond=1.-step(-.5,reach.z),sill=max(0.,reach.z);
        float path=reach.y-t;float shore=abs(reach.x);
        float squall=.70+.21*sin(dot(xz,vec2(.021,.034))-.13*t)+.09*cos(xz.y*.061);
        vec2 wind=xz+vec2(.94*cos(xz.y*.13+t*.14),.78*sin(xz.x*.091-.13*t));
        float ripple=sin(.78*wind.x+.31*wind.y-1.21*t)*(1.-smoothstep(.43,2.2,px));
        float longWave=cos(dot(wind,vec2(.14,.19))-.70*t+sin(xz.y*.029))*(1.-smoothstep(1.1,7.2,px));
        float shortWave=sin(2.19*xz.x-.71*xz.y-2.72*t)*(1.-smoothstep(.31,1.55,px));
        float cap=sin(3.90*path+.77*reach.w+1.16*sin(.81*reach.w+.29*xz.x))*(1.-smoothstep(.12,.85,px));
        float braids=.45*sin(path*.56+sin(reach.w*1.71))+.55*cos(path*1.14+.77*sin(reach.w*.91));
        vec2 slopes=squall*vec2(.012*ripple+.010*shortWave+.0038*longWave,.008*ripple-.009*shortWave+.003*longWave);
        slopes+=vec2(.041,-.032)*braids*(.29+.78*sill)*(1.-smoothstep(.21,2.5,px))*(1.-pond);
        slopes+=vec2(.040,.027)*cap*(.20+.8*sill)*(1.-pond);
        vec3 n=normalize(vec3(slopes.x,1.,slopes.y));vec3 v=normalize(cameraPosition-place),r=reflect(-v,n);
        float altitude=asin(clamp(r.y,-1.,1.));float az=atan(r.z,r.x),sunAz=atan(sun.z,sun.x);
        vec3 clouds=texture2D(sky,vec2((az-sunAz)/6.2831853+.65,altitude/3.141593+.457)).rgb;
        vec2 panel=vec2(mix(.002,.998,fract(.5+az/6.2831853)),mix(.012,.988,clamp((altitude+.035)/1.601,0.,1.)));
        float anchor=pond>.5?clamp(24.+(-4002.-place.x)/400.,24.,27.):tile;
        vec4 lo=bankPhoto(floor(anchor),panel),hi=bankPhoto(min(27.,floor(anchor)+1.),panel);
        vec3 reflected=mix(mix(clouds,lo.rgb,lo.a),mix(clouds,hi.rgb,hi.a),fract(anchor));
        vec4 registered=texture2D(bedPhoto,clamp(vec2((xz.x+4016.)/752.,1.-(xz.y-1096.)/528.),0.,1.));
        vec2 uv=xz*.45+slopes*(.40+.85*(1.-shore))+.11*vec2(sin(xz.y*.7),cos(xz.x*.8));
        vec3 grains=texture2D(gravel,uv).rgb;
        float grain=clamp(dot(grains,vec3(.23,.6,.17))/.39,.30,1.9);
        float pool=mix(.72,.38,sill)*(1.-shore*shore);
        vec3 riverbed=mix(vec3(.32,.256,.161),vec3(.43,.392,.311),clamp(dot(registered.rgb,vec3(.43,1.1,.29)),0.,1.));
        vec3 clarity=exp(-pool*vec3(1.36,1.63,2.17));
        vec3 tannin=mix(vec3(.111,.155,.143),riverbed*(.49+.51*grain),clarity*mix(.49,.82,shore));
        tannin=mix(tannin,vec3(.151,.181,.165),pond);
        float f=.024+.976*pow(1.-clamp(dot(n,v),0.,1.),5.);
        vec3 c=mix(tannin,reflected,clamp(.26+.69*sqrt(f)-.22*shore*shore*(1.-pond),.085,.95));
        c+=vec3(.018,.027,.031)*(.5+.5*braids)*(.18+.82*sill)*(1.-pond);
        float highlight=pow(max(0.,dot(normalize(v+sun),n)),185.)*.22;
        c+=vec3(.88,.86,.72)*highlight;
        if(sill>.10){
          vec2 uv=vec2(reach.w*.30+.063*sin(path*.42),path*.24+.03*sin(reach.w*3.));
          float bubble=texture2D(froth,uv).r;
          float tongues=.5+.5*sin(2.1*reach.w+1.5*sin(.5*path)+.10*reach.y);
          float crest=smoothstep(.42,.78,bubble+.19*tongues+.08*cap);
          float white=crest*smoothstep(.10,.84,sill)*(.34+.66*tongues)*(1.-smoothstep(.82,1.,shore));
          c=mix(c,vec3(.65,.70,.67),white*.57);
        }
        gl_FragColor=vec4(c,pond>.5?1.:1.-smoothstep(.81,1.,shore)*.78);
      }`});
    const lake=new T.Mesh(pond,material);const riverMaterial=material.clone();riverMaterial.uniforms=material.uniforms;riverMaterial.transparent=true;riverMaterial.depthWrite=false;const stream=new T.Mesh(channel,riverMaterial);
    stream.name='Lac Cabert outlet · pools and gradient-driven riffles';lake.name='Lac Cabert · mapped upper lake';
    scene.add(stream,lake);const bars=buildBars(T,scene,profile,texture,elevation);return {stream,lake,bars,length:meters};
  };
})();
