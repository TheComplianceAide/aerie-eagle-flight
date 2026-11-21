// Stream stable, metre-scale patches. Photographed meshes turn into captures of
// those same plants at distance. The near layer preserves parallax between leaves.
(() => {
  const profiles = {
    // Relative abundance of meadow grass, sedge, low grass, fern, herbaceous shrub,
    // tall herb and woody scrub, followed by stature, density and dry-leaf fraction.
    acadia:          [[8,18,14,27,9,4,20], .74, .82, .12],
    alaska:          [[23,23,6,19,13,10,6], .87, .81, .09],
    swiss:           [[40,18,15,8,6,12,1], .87, .92, .17],
    canyon:          [[8,0,57,0,4,0,31], .57, .42, .80],
    yosemite:        [[28,22,10,15,13,7,5], 1.04, .83, .23],
    crater:          [[25,19,15,8,10,7,16], .72, .69, .23],
    lofoten:         [[13,47,16,2,7,5,10], .65, .83, .25],
    milford:         [[6,19,4,42,16,12,1], 1.30, 1.0, .05],
    dixville:        [[13,19,11,29,16,8,4], .87, .85, .16],
    labrador:        [[9,23,13,10,20,4,21], .68, .71, .08],
    winnipesaukee:   [[27,17,12,18,12,11,3], .91, .91, .14],
    surry:           [[25,19,14,15,11,14,2], .94, .91, .09],
    moosehead:       [[16,23,8,24,15,10,4], .95, .93, .19]
  };
  // Indices in field-ground-scans.webp. Each regional assemblage specifies an
  // opening, canopy litter, stream margin, exposed substrate and aerial outcrop.
  const soils={
    alaska:        [0,1,7,4,8],     swiss:       [6,1,7,5,8],
    canyon:        [10,11,3,13,9],  yosemite:    [6,1,3,5,9],
    crater:        [10,1,7,5,9],    lofoten:     [0,6,7,4,8],
    acadia:        [6,1,7,4,8],
    milford:       [0,14,7,12,8],   dixville:    [6,2,3,4,8],
    labrador:      [6,1,7,4,8],     winnipesaukee:[0,15,3,5,8],
    surry:         [0,2,3,5,8],     moosehead:   [0,1,7,4,8]
  };
  window.aerieFieldShader=function(region){
    const [opening,litter,bank,stone,aerial]=soils[region];
    const humidity={acadia:.83,alaska:.91,swiss:.74,canyon:.05,yosemite:.27,crater:.24,lofoten:.80,milford:.98,dixville:.49,labrador:.86,winnipesaukee:.49,surry:.53,moosehead:.87}[region];
    return `
    float fieldGrain(vec2 grid){
      vec2 cell=floor(grid),f=fract(grid);f=f*f*(3.-2.*f);
      vec4 s=vec4(dot(cell,vec2(.1031,.11369)))+vec4(0.,.1031,.11369,.21679);
      s=fract(s)*vec4(39.43,39.43,39.43,39.43);s=fract(s*(s+19.19));
      return mix(mix(s.x,s.y,f.x),mix(s.z,s.w,f.x),f.y);
    }
    vec4 soilCapture(sampler2D gallery,vec2 uv,float tile){
      // Fold continuous world coordinates into an inset tile. Mirrored gutters
      // preserve derivatives and keep neighbouring materials out of lower mips.
      vec2 phase=abs(mod(uv,2.)-1.);
      vec2 cell=vec2(mod(tile,4.),floor(tile*.25));
      return texture2D(gallery,(cell+.015625+phase*.96875)*.25);
    }
    void fieldCoordinates(vec2 xz,out vec2 a,out vec2 b,out float weight){
      float selector=4.*fieldGrain(xz*.13+vec2(.18,4.1))+1.6*fieldGrain(xz*.091);
      float sector=floor(selector);weight=smoothstep(.19,.81,fract(selector));
      float angle=2.39996*sector,nextAngle=angle+2.39996;
      vec2 r=vec2(cos(angle),sin(angle)),r1=vec2(cos(nextAngle),sin(nextAngle));
      a=mat2(r.x,r.y,-r.y,r.x)*xz+sector*vec2(3.11,-1.27);
      b=mat2(r1.x,r1.y,-r1.y,r1.x)*xz+(sector+1.)*vec2(3.11,-1.27);
    }
    vec4 fieldBlend(sampler2D gallery,vec2 a,vec2 b,float weight,float tile){
      if(weight<.001)return soilCapture(gallery,a,tile);
      if(weight>.999)return soilCapture(gallery,b,tile);
      vec4 first=soilCapture(gallery,a,tile);
      vec4 second=soilCapture(gallery,b,tile);
      return mix(first,second,smoothstep(.0001,.9999,weight+(second.a-first.a)*.26*sin(3.14159*weight)));
    }
    vec3 regionalSoil(sampler2D gallery,vec3 at,vec3 normal,vec3 ortho,vec3 sun,
                      float range,float canopy,float wet,float eligibility){
      float coverage=clamp(eligibility,0.,1.)*(1.-smoothstep(800.,2500.,range));
      if(coverage<.008)return ortho;
      vec2 xz=at.xz;
      float stand=fieldGrain(xz*.013+vec2(4.8,8.2));
      float patchiness=fieldGrain(xz*.091);
      float woody=clamp(canopy*1.16+.28*(stand-.5),0.,1.);
      float shade=1.-smoothstep(-.2,.6,dot(normal,sun));
      float runoff=clamp(wet*(.39+.60*stand)+${humidity.toFixed(2)}*(.12+.88*woody)*(.12+.7*stand+.26*shade),0.,1.);
      // The 15–20 m aerial scans resolve real patches of turf, bare rock and
      // till from flight height. Unrelated orientations keep outcrop patterns
      // from lining up in rows under a grazing view.
      mat2 turn=mat2(.857,.515,-.515,.857);
      float metres=${aerial===8?'15.':'20.'};
      vec2 surveyUV=turn*xz/metres;
      vec4 meso=mix(soilCapture(gallery,surveyUV+vec2(.12,.39),${aerial}.),
                    soilCapture(gallery,turn*turn*surveyUV*.81+vec2(.65,.13),${aerial}.),smoothstep(.17,.80,stand));
      float aerialY=dot(meso.rgb,vec3(.27,.57,.16));
      float reliefPatch=clamp((meso.a-.50)*1.4+(aerialY-.34)*.85,-.69,.69);
      float exposure=smoothstep(.11,.57,1.-normal.y+.40*(stand-.32)+.35*reliefPatch-.15*woody);
      vec3 slopeColor=ortho*(1.+reliefPatch*(.36+.36*exposure)+.25*(stand-.5));
      vec3 result=mix(ortho,slopeColor,coverage);
      float fine=coverage*(1.-smoothstep(32.,410.,range));
      if(fine<.006)return result;
      // Vary the origin *and* orientation across natural patches. Adjacent
      // orientation pairs share one sample, so crossing a patch is continuous.
      vec2 phaseA,phaseB;float phase;
      fieldCoordinates(xz,phaseA,phaseB,phase);
      vec4 exposed=fieldBlend(gallery,turn*phaseA*.46,turn*phaseB*.46,phase,${stone}.);
      vec4 sward=fieldBlend(gallery,phaseA*.44,phaseB*.44,phase,${opening}.);
      vec4 litter=fieldBlend(gallery,turn*phaseA*.54,turn*phaseB*.54,phase,${litter}.);
      vec4 bank=fieldBlend(gallery,phaseA*.78+.39,phaseB*.78+.39,phase,${bank}.);
      vec4 cover=mix(sward,litter,smoothstep(.24,.77,woody+.25*(patchiness-.5)+.27*(litter.a-sward.a)));
      cover=mix(cover,bank,smoothstep(.24,.73,runoff+.34*(patchiness-.5)+.34*(bank.a-cover.a)));
      cover=mix(cover,exposed,smoothstep(.18,.83,exposure+.37*(exposed.a-cover.a)+.18*(patchiness-.5)));
      float groundY=dot(ortho,vec3(.27,.57,.16));
      // A nadir photograph sees crown tops. Below the canopy, resolve the
      // actual litter color, while openings inherit some local seasonal hue.
      vec3 natural=mix(cover.rgb,(cover.rgb+.035)*(ortho+.08)/(groundY+.135),.26*(1.-woody));
      natural*=clamp(.71+.82*groundY,.70,1.26)*(.75+.47*cover.a);
      natural*=clamp(1.+reliefPatch*.51+.27*(patchiness-.5),.60,1.40);
      // Keep the longer, irregular shape of the local mapped glade or ledge
      // rather than losing that illumination entirely underneath close detail.
      natural=mix(natural,natural*clamp((result+.09)/(groundY+.09),vec3(.65),vec3(1.53)),.40);
      // Reconstruct surface slope from the scan's measured height. Derive in
      // world space to keep the light direction fixed while the camera banks.
      vec3 dx=dFdx(at),dy=dFdy(at);
      vec3 u=cross(dy,normal),v=cross(normal,dx);
      float area=dot(dx,u);
      vec3 gradient=(dFdx(cover.a)*u+dFdy(cover.a)*v)*sign(area)/max(abs(area),.00001);
      vec3 relieved=normalize(normal-gradient*(.039+.037*exposure));
      float relief=dot(relieved,sun)-dot(normal,sun);
      natural*=clamp(1.+relief*.84,.72,1.29);
      // Wet soil retains a little sky at grazing angles. Moving water and wave
      // wash have their own material, applied after this pass.
      natural*=mix(vec3(1.),vec3(.79,.85,.84),runoff);
      return mix(result,natural,fine*(.81+.14*woody));
    }`;
  };
  const baseHeights=[.40,.64,.18,.78,.96,.74,1.06];
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  window.aerieWind=(x,z,t)=>.5+.5*Math.sin(.69*t+.033*x+.018*z);
  function readMap(loader,file){
    let pixels,w,h;
    const map=loader.load(file,tex=>{
      w=tex.image.width;h=tex.image.height;
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
      const context=canvas.getContext('2d',{willReadFrequently:true});
      context.drawImage(tex.image,0,0);pixels=context.getImageData(0,0,w,h).data;
      map.dispose();
    });
    return (u,v)=>pixels&&u>=0&&v>=0&&u<1&&v<1?pixels[(Math.floor(u*w)+Math.floor(v*h)*w)*4]/255:0;
  }
  window.addUnderstory=function addUnderstory(T,scene,world){
    const wind=window.getCanopyWind(T,scene);
    wind.uniforms.canopyLakeshore.value=world.region==='moosehead'?1:0;
    const wildlife=window.addRegionalWildlife(T,scene,world);
    const {region,habitat}=world,[weights,scale,density,dry]=profiles[region];
    const loader=new T.TextureLoader(),half=world.coverHalf;
    const photo=half?readMap(loader,'cover-'+region+'.png'):null;
    const downtown=region==='surry'?readMap(loader,'cover-keene-streets.png'):null;
    const survey=world.elevation||world.height;
    const regional=window.aerieCanopyProfile(world);
    function observed(x,z){
      let cover=world.groundCover(x,z);
      if(cover<0)return -1;
      if(photo){
        const local=downtown&&x>1640&&x<2280&&z>4210&&z<4930;
        const green=local?downtown((x-1640)/640,(z-4210)/720):photo(.5+x/(2*half),.5+z/(2*half));
        if(local)return clamp((green-.43)*2,0,1);
        cover=Math.max(cover*.73,green*.86);
      }
      return cover;
    }
    function suitability(x,z){
      const cover=observed(x,z),land=regional.landAt(x,z);
      if(cover<0||land===4||land===5||land===7||land===8)return 0;
      if(land===6)return region==='canyon'?cover*.26:cover*.12;
      return Math.max(cover,land===1?.45:land===9?.82:land===2||land===3||land===11?.55:0);
    }
    world.vegetationAt=suitability;
    const group=new T.Group();group.name='Scanned ground vegetation';scene.add(group);
    const records=window.aeriePlants,clock={value:0};
    const nearMap=loader.load('understory-leaves.webp'),standMap=loader.load('understory-stands.webp');
    for(const map of [nearMap,standMap]){map.anisotropy=4;map.colorSpace=T.SRGBColorSpace;}
    const sun=world.sunDirection||new T.Vector3(-.5,.62,-.6).normalize();
    const lightMap=world.sunMask,lightSpan=world.forestLightSpan||(region==='alaska'?9600:8000);
    const uniforms={...wind.uniforms,clock,sun:{value:sun},leaves:{value:nearMap},stands:{value:standMap},dryness:{value:dry},
      terrainLight:{value:lightMap||null},lightSpan:{value:lightSpan}};
    const coarse=matchMedia('(pointer: coarse)').matches,reach=coarse?80:106,near=coarse?13:20;
    const vertex=(far)=>`
      ${wind.glsl}
      attribute vec4 planting;attribute vec4 trait;
      uniform float clock,lightSpan;uniform vec3 sun;uniform sampler2D terrainLight;
      varying vec2 coord;varying float illum,variation,edge,viewIndex,kind;
      void main(){
        vec3 root=planting.xyz;float h=planting.w;kind=trait.z;
        float a=trait.x,ca=cos(a),sa=sin(a);
        vec3 look=normalize(cameraPosition-root-vec3(0.,h*.5,0.));
        float d=distance(cameraPosition,root);
        vec2 front=plantFront(root.xz);
        float ripple=sin(clock*2.8+root.z*.27+a);
        vec3 p;
        ${far?`
          float bearing=atan(look.x,look.z)-a;
          viewIndex=look.y>.84?3.:look.y>.45?2.:cos(bearing)>.0?0.:1.;
          vec3 right=normalize(vec3(look.z+.00001,0.,-look.x)),up=cross(look,right);
          p=root+vec3(0.,.50*h,0.)+abs(trait.w)*h*(right*position.x+up*position.y);
          coord=vec2((viewIndex+.005+.99*uv.x)*.25,(7.-kind+.005+.99*uv.y)*.125);
          illum=.94;
          edge=(kind>5.5||trait.w<0.?1.:smoothstep(${near-3}.,${near+3}.,d))*(1.-smoothstep(${reach-18}.,${reach}.,d));
        `:`
          p=root+h*vec3(ca*position.x+sa*position.z,position.y,-sa*position.x+ca*position.z);
          vec3 n=normalize(vec3(ca*normal.x+sa*normal.z,normal.y,-sa*normal.x+ca*normal.z));
          coord=vec2((mod(kind,4.)+.003+.994*uv.x)*.25,(1.-floor(kind/4.)+.003+.994*(1.-uv.y))*.5);
          float scatter=pow(max(dot(-look,sun),0.),2.)*(1.-abs(dot(n,look))*.55);
          illum=.70+.22*abs(dot(n,sun))+.14*max(0.,n.y)+.29*scatter;
          viewIndex=0.;edge=1.-smoothstep(${near-3}.,${near+3}.,d);
        `}
        float tip=clamp((p.y-root.y)/h,0.,1.);
        vec2 motion=plantMotion(root.xz,front,clock,.92);
        float flex=kind<2.5?1.55:kind<5.5?.89:.55;
        p.xz+=h*tip*tip*flex*(motion+canopyDownwind*(.018+.035*front.x)*ripple);
        p.y-=h*tip*tip*dot(motion,motion)*flex*.62;
        illum*=1.+tip*front.x*(.15+.09*ripple);
        float shadow=${lightMap?'texture2D(terrainLight,vec2(root.x,-root.z)/lightSpan+.5).r':'1.'};
        illum*=mix(.67,1.09,shadow)*(.71+.29*tip);
        variation=trait.y;
        gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
      }`;
    function material(far){
      return new T.ShaderMaterial({uniforms,side:T.DoubleSide,vertexShader:vertex(far),fragmentShader:`
        uniform sampler2D leaves,stands;uniform float dryness;
        varying vec2 coord;varying float illum,variation,edge,viewIndex,kind;
        void main(){
          vec4 tex=texture2D(${far?'stands':'leaves'},coord);
          float noise=fract(dot(gl_FragCoord.xy,vec2(.754877666,.569840296)));
          if(tex.a<.32||${far?'noise':'1.-noise'}>edge)discard;
          vec3 c=tex.rgb*(.87+.24*variation);
          float lum=dot(c,vec3(.27,.62,.11));c=mix(c,lum*vec3(1.30,1.04,.67),dryness*(.6+.38*variation));
          gl_FragColor=vec4(c*illum,1.);
          #include <colorspace_fragment>
        }`});
    }
    function typed(data,Type){
      const raw=atob(data),bytes=new Uint8Array(raw.length);
      for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
      return new Type(bytes.buffer);
    }
    const nearMat=material(false),farMat=material(true);
    function batch(geom,mat,capacity){
      const geometry=new T.InstancedBufferGeometry();geometry.setIndex(geom.index);
      for(const [name,attribute] of Object.entries(geom.attributes))geometry.setAttribute(name,attribute);
      for(const name of ['planting','trait'])geometry.setAttribute(name,new T.InstancedBufferAttribute(new Float32Array(4*capacity),4).setUsage(T.DynamicDrawUsage));
      geometry.instanceCount=0;const mesh=new T.Mesh(geometry,mat);mesh.frustumCulled=false;group.add(mesh);return geometry;
    }
    const growth=window.makeRegionalGrowth(T,world,wind,clock,loader,batch,coarse);
    const updateSparseForest=window.makeRegionalForest(T,scene,world,loader);
    const fine=records.map(r=>{
      if(!r.p)return null;
      const g=new T.BufferGeometry();
      g.setAttribute('position',new T.Float32BufferAttribute(Float32Array.from(typed(r.p,Int16Array),v=>v/8192),3));
      g.setAttribute('normal',new T.Int8BufferAttribute(typed(r.n,Int8Array),3,true));
      g.setAttribute('uv',new T.Uint16BufferAttribute(typed(r.u,Uint16Array),2,true));
      g.setIndex(new T.BufferAttribute(typed(r.i,Uint16Array),1));return batch(g,nearMat,coarse?100:220);
    });
    const far=batch(new T.PlaneGeometry(1,1),farMat,coarse?3800:7200);
    // A close softstem bulrush clump has cylindrical stems, small terminal
    // seed clusters and keeled blades. The base stays buried while a gust
    // bends the culm and twists the lighter blades further downwind.
    function rushGeometry(distant=false){
      const pos=[],colors=[],idx=[];
      const v=(x,y,z,c)=>{colors.push(...c);pos.push(x,y,z);return pos.length/3-1;};
      const green=[.095,.165,.043],light=[.219,.281,.063],edge=[.205,.218,.066];
      const stems=distant?6:10,sections=distant?3:5,sides=distant?3:4,bladePoints=distant?4:6;
      for(let n=0;n<stems;n++){
        const a=n*2.39996,r=.23*Math.sqrt(n/10),dx=Math.cos(a),dz=Math.sin(a);
        const h=.58+.38*(.5+.5*Math.cos(n*3.15+.42*n*n)),slant=.045+.09*(n%4)/3;
        let prev;
        for(let j=0;j<sections;j++){
          const f=j/(sections-1),rad=(.003+.0037*(1-f))*(distant?1.47:1.),ring=[];
          for(let k=0;k<sides;k++){
            const theta=k*6.28318/sides;ring.push(v(dx*(r+slant*f*f)+rad*Math.cos(theta),h*f,dz*(r+slant*f*f)+rad*Math.sin(theta),k===1?light:green));
          }
          if(prev)for(let k=0;k<sides;k++){const next=(k+1)%sides;idx.push(prev[k],ring[k],prev[next],prev[next],ring[k],ring[next]);}
          prev=ring;
        }
        if(n%3!==1){
          const x=dx*(r+slant),z=dz*(r+slant),seed=[.145,.081,.026];
          const tip=v(x,h+.016,z,seed),low=v(x-.010,h-.057,z-.009,seed);
          for(let k=0;k<5;k++){
            const a=k*1.25664,b=(k+1)*1.25664;
            const u=v(x+.016*Math.cos(a),h-.014,z+.016*Math.sin(a),seed);
            const t=v(x+.016*Math.cos(b),h-.014,z+.016*Math.sin(b),[.205,.124,.035]);idx.push(low,u,t,tip,t,u);
          }
        }
        for(let b=0;b<(distant?1:3);b++){
          const a2=a+b*2.10+.53,ex=Math.cos(a2),ez=Math.sin(a2);
          let back;
          for(let j=0;j<bladePoints;j++){
            const u=j/(bladePoints-1),head=u*u,reach=.08*u+.30*head;
            const x=dx*r+ex*reach,z=dz*r+ez*reach,y=h*(.84*u-.18*head);
            const wide=.013*(1-.91*u)+.004*Math.sin(u*Math.PI);
            const row=[v(x-ez*wide,y,z+ex*wide,edge),v(x+ex*wide*.45,y+.005,z+ez*wide*.45,light),v(x+ez*wide,y,z-ex*wide,green)];
            if(back)idx.push(back[0],row[0],row[1],back[0],row[1],back[1],back[1],row[1],row[2],back[1],row[2],back[2]);
            back=row;
          }
        }
      }
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
      g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setIndex(idx);return g;
    }
    const reedMarsh=region==='moosehead';
    const rushMat=new T.ShaderMaterial({uniforms,side:T.DoubleSide,vertexShader:`
      ${wind.glsl}
      attribute vec3 color;attribute vec4 planting,trait;uniform float clock;
      varying vec3 hue;
      void main(){
        vec2 root=planting.xz,front=plantFront(root),motion=plantMotion(root,front,clock,.91);
        float a=trait.x,h=planting.w,height=position.y;
        vec3 p=vec3(cos(a)*position.x+sin(a)*position.z,height,-sin(a)*position.x+cos(a)*position.z);
        float flick=sin(4.2*clock+dot(p.xz,vec2(8.,9.))+.079*root.y+a);
        p.xz+=height*height*(1.52*motion+.022*front.x*flick*vec2(-canopyDownwind.y,canopyDownwind.x));
        p.y-=.94*height*height*dot(motion,motion);
        hue=color*(.58+.50*height)*(.77+.35*trait.y)*(1.+front.x*(.18+.12*flick));
        ${reedMarsh?`
          // Fresh blades and older straw culms expose different faces in a
          // gust. Bend them through a circular arc so the tall stems retain
          // their length as the coherent leading edge passes.
          vec2 down=normalize(motion+vec2(.00001,0.));
          float bend=.07+1.01*smoothstep(.10,.83,front.x)+.47*(front.x-front.y)+.075*flick*front.x;
          bend=max(.025,bend);
          p.xz-=height*height*1.52*motion;
          p.xz+=down*(1.-cos(height*bend))/bend;
          p.y=sin(height*bend)/bend-.018*flick*height*front.x;
          float stem=smoothstep(.016,.061,color.g-color.b)*smoothstep(.011,.034,color.g-color.r);
          float straw=smoothstep(.17,.90,trait.y+.095*flick);
          vec3 aged=mix(color*vec3(1.07,1.40,.92),vec3(.45,.305,.095)*(.54+1.05*color.r),straw);
          float flash=front.x*(.30+.45*max(0.,dot(normalize(cameraPosition.xz-root),down)));
          hue=mix(color*vec3(.91,.78,.63),aged,stem)*(.49+.72*height)*(1.+stem*flash);
        `:''}

        gl_Position=projectionMatrix*viewMatrix*vec4(planting.xyz+h*p,1.);
      }`,fragmentShader:`varying vec3 hue;void main(){gl_FragColor=vec4(hue,1.);
        #include <colorspace_fragment>
      }`});
    const lakesideRushes=['moosehead','winnipesaukee','surry','dixville','labrador'].includes(region);
    const rush=lakesideRushes?batch(rushGeometry(),rushMat,reedMarsh?(coarse?135:235):(coarse?180:330)):null;
    const distantRush=reedMarsh?batch(rushGeometry(true),rushMat,coarse?235:470):null;
    const size=12,tiles=new Map(),bounds=world.bounds;
    // Flat freshwater margins support discontinuous sedge beds. Keep their
    // roots tied to the mapped shore and the displayed gravel shelf. Settlement
    // pavement, steep rock and deep water remain clear.
    const bankPatches=new Map(),lake=window.ATLAS_SURVEYS?.[region];
    if(lake?.shore&&lakesideRushes){
      for(const ring of [lake.shore,...(lake.shoreHoles||[])]){
        let winding=0;
        if(reedMarsh)for(let i=0,j=ring.length-1;i<ring.length;j=i++)winding+=ring[j][0]*ring[i][1]-ring[i][0]*ring[j][1];
        const landSide=(winding>0?1:-1)*(ring===lake.shore?1:-1);
        for(let i=0,j=ring.length-1;i<ring.length;j=i++){
          const [ax,az]=ring[j],[bx,bz]=ring[i],dx=bx-ax,dz=bz-az;
          const length=Math.hypot(dx,dz);if(length<.01)continue;
          const count=Math.max(1,Math.ceil(length/(reedMarsh?3.2:4.5)));
          for(let k=0;k<count;k++){
            const u=(k+.5)/count,x=ax+dx*u,z=az+dz*u;
            const cover=Math.sin(.021*x+.011*z)+.73*Math.sin(.043*z-.036*x);
            // Broad shallow shelves carry a continuous emergent fringe;
            // rockier shores keep their gaps between small individual beds.
            if(cover<-.13&&(!reedMarsh||survey(x+landSide*dz/length*7,z-landSide*dx/length*7)>world.waterLevel+.92))continue;
            const key=Math.floor(x/size)+'|'+Math.floor(z/size);
            let arr=bankPatches.get(key);if(!arr)bankPatches.set(key,arr=[]);arr.push(x,z,landSide*dz/length,-landSide*dx/length);
          }
        }
      }
    }

    function patch(ix,iz){
      const key=ix+'|'+iz;
      if(tiles.has(key))return tiles.get(key);
      let seed=(Math.imul(ix,374761393)^Math.imul(iz,668265263))>>>0;
      const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
      const result=[];
      const bank=bankPatches.get(key),water=world.waterLevel;
      if(bank&&Number.isFinite(water)){
        // Use a separate sequence so reeds do not rearrange established plants.
        let growSeed=seed;const grow=()=>((growSeed=(Math.imul(growSeed,1664525)+1013904223)>>>0)/4294967296);
        for(let n=0;n<bank.length;n+=4)for(let j=0;j<(reedMarsh?17:5);j++){
          const cross=reedMarsh?2.0-12.5*grow():(grow()-.5)*4.8;
          const along=(grow()-.5)*(reedMarsh?4.3:4.8);
          const x=bank[n]+(reedMarsh?cross*bank[n+2]-along*bank[n+3]:cross);
          const z=bank[n+1]+(reedMarsh?cross*bank[n+3]+along*bank[n+2]:along);
          if(world.openRoadAt?.(x,z,.62))continue;
          const surveyed=survey(x,z),bed=world.height(x,z);
          if(bed>water+1.25||surveyed<water-1.0||surveyed>water+1.35)continue;
          if(Math.hypot(world.height(x+1,z)-bed,world.height(x,z+1)-bed)>.47)continue;
          if((world.clearance?.(x,z)??bed)>bed+.5)continue;
          const root=bed>water+.18?bed:Math.max(water-.22,surveyed);
          const h=reedMarsh?1.18+1.14*grow():.84+.64*grow();
          const sy=reedMarsh&&cross<0&&bed<water+.26?Math.max(water-.65,water+.11+.13*cross):Math.max(root,habitat.surface(x,z))-.04;
          result.push([x,sy,z,h,grow()*6.283,grow(),7,1.1]);
        }
      }
      for(let i=0;i<10;i++){
        const cx=(ix+rand())*size,cz=(iz+rand())*size;
        const community=regional.zone(cx,cz,observed(cx,cz));
        if(community.cover<.07||rand()>community.cover*density)continue;
        let kind=0,draw=rand()*100;while(kind<6&&draw>=weights[kind])draw-=weights[kind++];
        // Wind-clipped alpine openings carry blades and cushions. Shaded moist
        // stands carry ferns or low woody growth. Marsh ground favours sedges.
        if(community.alpine>.55)kind=rand()<.69?2:0;
        else if(community.wet>.55&&rand()<.67)kind=1;
        else if(community.land===1&&community.shelter>.50&&kind===0)kind=3;
        const special=rand()<(region==='milford'?.38:region==='canyon'?.46:.26)?growth.choose(community,rand()):null;
        const clustered=special?.index>=0;
        const count=clustered?(region==='milford'?1:1+Math.floor(rand()*2)):kind<3?4+Math.floor(rand()*6):1+Math.floor(rand()*3);
        for(let j=0;j<count;j++){
          const x=cx+(rand()-.5)*4.8,z=cz+(rand()-.5)*4.8;
          if(bounds&&(x<bounds.minX||x>bounds.maxX||z<bounds.minZ||z>bounds.maxZ))continue;
          const suitable=suitability(x,z);
          const land=regional.landAt(x,z);
          const alpineHerb=community.alpine>.55&&(land===2||land===3||land===11)&&!world.blockVegetationAt?.(x,z);
          if((suitable<.055&&!alpineHerb)||habitat.wet(x,z,survey(x,z)))continue;
          const y=habitat.surface(x,z),slope=Math.hypot(habitat.surface(x+1,z)-y,habitat.surface(x,z+1)-y);
          if(slope>(kind===3?1.27:1.05)||!Number.isFinite(y))continue;
          if(clustered){
            const h=special.height*(.62+.81*rand())*(1-.22*community.rock);
            result.push([x,y-.025,z,h,rand()*6.283,rand(),8+special.index,1]);
          }else result.push([x,y-.025,z,baseHeights[kind]*scale*(.57+rand()*.93),rand()*6.283,rand(),kind,records[kind].span]);
        }
      }
      // The summer-drying El Capitan opening carries actual sedges and grass
      // rather than the valley floor's fallback shade ferns. Filter after the
      // seeded sequence, preserving every neighboring woodland placement.
      const plants=world.elCapitanMeadowCover?result.filter(p=>world.elCapitanMeadowCover(p[0],p[2])<.65||p[6]===7):result;
      tiles.set(key,plants);
      return plants;
    }
    function put(g,p,full=false){
      const i=g.instanceCount;if(i>=g.attributes.trait.count)return false;
      g.attributes.planting.setXYZW(i,p[0],p[1],p[2],p[3]);
      g.attributes.trait.setXYZW(i,p[4],p[5],p[6],full?-p[7]:p[7]);g.instanceCount++;return true;
    }
    const last=new T.Vector3(Infinity,Infinity,Infinity);
    const batches=[rush,distantRush,far,...fine,...growth.geometries,growth.distant].filter(Boolean);
    return (eye,t)=>{
      wind.update(world.windField,eye,t);
      updateSparseForest(eye);
      wildlife(eye,t);
      clock.value=t;
      if(last.distanceToSquared(eye)<16)return;
      last.copy(eye);const gap=eye.y-habitat.surface(eye.x,eye.z);
      group.visible=gap<reach+48;if(!group.visible)return;
      for(const g of batches)g.instanceCount=0;
      if(tiles.size>1800)tiles.clear();
      // Fill nearest cells first so the budget at high density never hollows out the foreground.
      const mx=Math.floor(eye.x/size),mz=Math.floor(eye.z/size),limit=Math.ceil(reach/size);
      for(let ring=0;ring<=limit;ring++)for(let v=-ring;v<=ring;v++)for(let u=-ring;u<=ring;u++){
        if(Math.max(Math.abs(u),Math.abs(v))!==ring)continue;
        for(const p of patch(mx+u,mz+v)){
          const d=(eye.x-p[0])**2+(eye.y-p[1])**2+(eye.z-p[2])**2;
          if(d>reach*reach)continue;
          if(p[6]>=8){
            const canPlace=d<(growth.near+6)**2;
            const overflow=canPlace&&!put(growth.geometries[p[6]-8],p);
            if(d<growth.far**2&&(overflow||d>(growth.near-6)**2))put(growth.distant,p,overflow);
            continue;
          }
          if(p[6]===7){
            if(d<(coarse?47:67)**2)put(distantRush&&d>(coarse?15:23)**2?distantRush:rush,p);
            continue;
          }
          const close=d<(near+9)**2&&fine[p[6]];
          const overflow=close&&!put(fine[p[6]],p);
          if(overflow||d>(near-9)**2||!fine[p[6]])put(far,p,overflow);
        }
      }
      for(const g of batches){g.attributes.planting.needsUpdate=true;g.attributes.trait.needsUpdate=true;}
    };
  };
})();
