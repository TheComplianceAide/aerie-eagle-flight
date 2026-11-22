// One local veteran at an existing tree footprint. Preserve the world tree
// lists, original collision/perch dimensions and the original far stand.
(() => {
  const definitions={
    winnipesaukee:{species:'Eastern white pine',sheet:'winnipesaukee-tree',cell:10,preferred:22,min:14,points:[[795,2928]]},
    surry:{species:'Red maple',sheet:'surry-maple',cell:11,preferred:22,min:12,points:[[0,0]]},
    dixville:{species:'Yellow birch',sheet:'dixville-birch',cell:11,preferred:19,min:10,points:[[-125,585],[244,520]]},
    moosehead:{species:'Eastern hemlock',sheet:'moosehead-mature',cell:9,preferred:23,min:13,points:[[3919,-4963],[214,125],[920,-1010]]},
    alaska:{species:'Sitka spruce',sheet:'alaska-tree',cell:8,preferred:29,min:16,points:[[638,840],[530,805],[480,705]]},
    // Canyon has its own isolated surveyed bar specimen, not a stock tree.
    canyon:{species:'Riparian woody tree',reserve:'Has separate dry-bank implementation'},
    yosemite:{species:'Ponderosa pine',sheet:'yosemite-tree',cell:6,preferred:34,min:17,points:[[-1003,973],[-800,1140]]},
    crater:{species:'Mountain hemlock',sheet:'crater-tree',cell:7,preferred:25,min:21,points:[[-1673,403],[-1634,462]]},
    swiss:{species:'Norway spruce',sheet:'swiss-spruce',cell:11,preferred:24,min:12,points:[[-650,350],[-578,522]]},
    labrador:{species:'Black spruce',sheet:'labrador-tree',cell:15,preferred:16,min:8,points:[[-12,1750]]},
    lofoten:{species:'Downy birch',sheet:'lofoten-tree',cell:7,preferred:7,min:3,points:[[3975,3023],[931,4336],[1420,4830]]},
    acadia:{species:'Red spruce',sheet:'moosehead-red-spruce',cell:11,preferred:17,min:9,points:[[1,885],[-40,973]]}
  };
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
  const point=([x,z])=>({x,z});
  const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
  const fade=(n,a,b)=>{const t=clamp((n-a)/(b-a),0,1);return t*t*(3-2*t);};
  function choose(world,profile,isMeasured,T=window.THREE){
    const def=definitions[world.region],elevation=world.elevation||world.height;
    if(!def||def.reserve||!elevation||!world.trees?.length||!profile.zone)return null;
    const routes=window.makePerchRoute?window.makePerchRoute(T,world,world.region):null;
    const launch=Object.values(world.launches||{}).filter(p=>Number.isFinite(p?.x)&&Number.isFinite(p?.z));
    const sights=(world.landmarks||[]).filter(p=>Number.isFinite(p?.x)&&Number.isFinite(p?.z));
    const anchors=[...def.points.map(point),...sights,...launch];
    const fallback=world.spawn&&Number.isFinite(world.spawn.x)?world.spawn:{x:0,z:0};
    if(!anchors.length)anchors.push(fallback);
    const grid=world.treeGrid,pool=new Set();
    if(grid){
      // Inspect a bounded collection of tree bins near relevant scenery first.
      for(const anchor of anchors){
        const i=Math.floor(anchor.x/grid.size),j=Math.floor(anchor.z/grid.size),n=Math.ceil(245/grid.size);
        for(let z=j-n;z<=j+n;z++)for(let x=i-n;x<=i+n;x++){
          for(const t of grid.cells.get(grid.cell((x+.5)*grid.size,(z+.5)*grid.size))||[])pool.add(t);
        }
      }
    }else for(const t of world.trees)pool.add(t);
    const shore=world.waterLevel;
    // World grids already carry each record's conifer flag. Legacy worlds
    // without that flag need their existing fir membership, not a second index.
    const firs=grid?null:world.firTrees&&new Set(world.firTrees);
    const routePoints=routes?[routes.approach,...routes.via,routes.perch]:[];
    function routeDistance(t){
      let result=Infinity;
      for(let i=1;i<routePoints.length;i++){
        const a=routePoints[i-1],b=routePoints[i],dx=b.x-a.x,dz=b.z-a.z;
        if(!(dx||dz))continue;
        const d=clamp(((t.x-a.x)*dx+(t.z-a.z)*dz)/(dx*dx+dz*dz),0,1);
        result=Math.min(result,Math.hypot(t.x-a.x-d*dx,t.z-a.z-d*dz));
      }
      return result;
    }
    function find(from){
      let best=null,score=Infinity;
      for(const t of from){
        if(!Number.isFinite(t.y)||t.height<def.min||t.height>def.preferred*1.36||!(t.width>1.4)||
          t.steepCreekStem||t.aerieSpecies?.family==='shrub'||isMeasured(t.x,t.z))continue;
        const d=Math.min(...anchors.map((p,i)=>distance(p,t)+(i<def.points.length?0:215)));
        const hCost=Math.abs(def.preferred-t.height)*7;
        if(d+hCost>score||launch.some(p=>distance(p,t)<34)||routeDistance(t)<Math.max(21,t.width+10)||
           routes?.perch&&distance(routes.perch,t)<Math.max(36,t.width+12))continue;
        const y=elevation(t.x,t.z),q=profile.zone(t.x,t.z);
        if(!Number.isFinite(y)||Math.abs(t.y-y)>1.6||q.submerged||q.ice||q.developed||q.slope>.67||
          q.alpine>.78||q.cover<.04||Number.isFinite(shore)&&y<shore+1.6||
          world.blockVegetationAt?.(t.x,t.z,y)||world.blocksInfillTree?.(t.x,t.z)||
          world.waterfalls?.inChute?.(t.x,t.z,8))continue;
        const local=profile.species(t,t.seed,t.conifer??firs?.has(t));
        if(local?.name!==def.species)continue;
        const cost=d+hCost+q.slope*64;
        if(cost<score||(cost===score&&(t.x<best?.x||t.x===best?.x&&t.z<best?.z))){score=cost;best=t;}
      }
      return best;
    }
    return find(pool);
  }
  // An isolated texture is optional and loads only on approach. The actual
  // close/mid geometry remains in charge and the existing far form is fallback.
  function makeSprite(T,parent,shadowScene,world,load,common,screenHash,shadowGLSL='',options={}){
    const geometry=new T.PlaneGeometry(1,1),range=options.range||(world.region==='moosehead'?[79,104]:[55,80]);
    const controls={plate:{value:null},stem:{value:new T.Vector3()},extent:{value:new T.Vector2()},
      weight:{value:new T.Vector2()},...common};
    const vertexShader=`
      uniform vec3 stem;uniform vec2 extent;
      varying vec2 card;varying vec3 site,axis;
      void main(){
        vec2 view=cameraPosition.xz-stem.xz;
        view=normalize(view+vec2(.00001,0.));
        vec3 right=vec3(view.y,0.,-view.x);
        site=stem+right*position.x*extent.x+vec3(0.,uv.y*extent.y,0.);
        card=uv;axis=vec3(view.x,.18,view.y);
        gl_Position=projectionMatrix*viewMatrix*vec4(site,1.);
      }`;
    const baseFragment=`
      uniform sampler2D plate;uniform vec2 weight;
      varying vec2 card;varying vec3 site,axis;
      vec4 leaf(){
        float pixel=${screenHash};
        if(pixel<weight.x||pixel>=weight.y)discard;
        vec4 texel=texture2D(plate,vec2(card.x,1.-card.y));
        if(texel.a<.31)discard;
        return texel;
      }`;
    const fragmentShader=baseFragment+`
      uniform sampler2D terrainIllumination;
      uniform float lightSpan,useSurveyLight,fogStrength;
      uniform vec3 sunVector,sunlight,aerialTint,stem;
      ${shadowGLSL}
      void main(){
        vec3 color=leaf().rgb;
        vec2 st=.5+vec2(stem.x,-stem.z)/lightSpan;
        float lit=1.;
        if(useSurveyLight>.5&&all(greaterThanEqual(st,vec2(0.)))&&all(lessThanEqual(st,vec2(1.))))
          lit=mix(.12,1.,texture2D(terrainIllumination,st).r);
        lit*=${shadowGLSL?'mix(.44,1.,regionalCanopySun(site+vec3(0.,.04,0.),.00041))':'1.'};
        float cosine=dot(normalize(axis),sunVector);
        color*=vec3(.69,.74,.79)+lit*sunlight*(.45*max(0.,cosine)+.19);
        ${world.region==='acadia'?'color=mix(color,vec3(dot(color,vec3(.22,.67,.11))),.48)*vec3(.36,.44,.55);':''}
        gl_FragColor=vec4(mix(color,aerialTint,clamp(distance(site,cameraPosition)*fogStrength,0.,.25)),1.);
      }`;
    const material=new T.ShaderMaterial({uniforms:controls,side:T.DoubleSide,vertexShader,fragmentShader});
    const depth=new T.ShaderMaterial({uniforms:controls,side:T.DoubleSide,vertexShader,
      fragmentShader:baseFragment+'void main(){leaf();gl_FragColor=vec4(1.);}'});
    const mesh=new T.Mesh(geometry,material),caster=new T.Mesh(geometry,depth);
    mesh.name='Veteran tree distant silhouette';mesh.visible=caster.visible=false;parent.add(mesh);shadowScene.add(caster);
    let dead=false,requested=false;
    function prime(d){
      if(requested||d>230||dead)return;
      requested=true;
      load('veterans/'+world.region+'.webp').then(texture=>{
        if(!dead)controls.plate.value=texture;
      }).catch(()=>{}); // Fall back to the existing 3D far form indefinitely.
    }
    function draw(tree,view,low,high){
      if(!controls.plate.value)return low;
      const center=tree.y+tree.h*.5,dx=view.x-tree.x,dz=view.z-tree.z,planar=Math.hypot(dx,dz),rise=Math.abs(view.y-center);
      const q=fade(planar,...range)*(1-fade(rise/Math.max(1,planar),.27,.56));
      if(q<.005)return low;
      controls.stem.value.set(tree.x,tree.y,tree.z);
      const h=tree.h,w=options.width||Math.max(.25,h*(controls.plate.value.image?.width||128)/(controls.plate.value.image?.height||256));
      controls.extent.value.set(w,h);
      const bound=geometry.boundingSphere||(geometry.boundingSphere=new T.Sphere());
      bound.center.set(tree.x,center,tree.z);bound.radius=.5*Math.hypot(w,h);
      const stop=low+(high-low)*q;controls.weight.value.set(low,stop);mesh.visible=caster.visible=true;
      return stop;
    }
    return {prime,draw,reset(){mesh.visible=caster.visible=false;},dispose(){
      dead=true;mesh.removeFromParent();caster.removeFromParent();geometry.dispose();material.dispose();depth.dispose();
    }};
  }
  // An isolated 2021 USGS ortho crown and independent DSM/DEM evidence fix
  // this low feature to a dry western-bank root. The original generated appearance is illustrative.
  // USGS orthophoto: https://doi.org/10.3133/dr1202
  // USGS surface model: https://doi.org/10.5066/P93Y4FMJ
  const riparianSite={x:-1049.38,z:65.58,h:4.5,w:7.2,trunk:.40,trunkH:1.75};
  function rootRiparian(world){
    if(world.region!=='canyon'||!world.habitat?.wet)return null;
    const {x,z,h,w,trunk,trunkH}=riparianSite,elevation=world.elevation||world.height;
    const y=elevation?.(x,z);
    if(!Number.isFinite(y))return null;
    for(const [dx,dz] of [[0,0],[trunk,0],[-trunk,0],[0,trunk],[0,-trunk]]){
      const px=x+dx,pz=z+dz,ground=elevation(px,pz);
      if(!Number.isFinite(ground)||Math.abs(ground-y)>.55||world.habitat.wet(px,pz,ground+.12))return null;
    }
    if(world.habitat?.clearance?.(x,z)>y+.45||world.clearance?.(x,z)>y+.55)return null;
    return {x,y:y-.08,z,h,w,trunk,trunkH};
  }
  function riparianMeshes(T,root,mix,screenHash){
    let state=349721;
    const rand=()=>((state=Math.imul(state,1664525)+1013904223|0)>>>0)/4294967296;
    const point=(x,y,z)=>new T.Vector3(x,y,z);
    const bark={p:[],c:[]},sprays={p:[],c:[]};
    const brown=[.205,.105,.069],green=[.195,.226,.087],tau=Math.PI*2;
    function tri(out,a,b,c,rgb,shade){
      for(const v of [a,b,c]){out.p.push(v.x,v.y,v.z);out.c.push(...rgb.map(x=>x*shade));}
    }
    function limb(a,b,r0,r1){
      const axis=b.clone().sub(a).normalize(),u=point(0,0,1).cross(axis).normalize(),v=axis.clone().cross(u);
      for(let j=0;j<6;j++){
        const edge=(p,r,k)=>p.clone().addScaledVector(u,r*Math.cos(k*Math.PI/3)).addScaledVector(v,r*Math.sin(k*Math.PI/3));
        const a0=edge(a,r0,j),a1=edge(a,r0,j+1),b0=edge(b,r1,j),b1=edge(b,r1,j+1),tone=.69+.54*rand();
        tri(bark,a0,a1,b1,brown,tone);tri(bark,a0,b1,b0,brown,tone);
      }
    }
    function plume(base,tip){
      const delta=tip.clone().sub(base);
      for(let j=0;j<7;j++){
        const t=(j+rand())/7,site=base.clone().addScaledVector(delta,t);
        const angle=tau*rand(),u=point(Math.cos(angle),.06+.6*rand(),Math.sin(angle)).normalize(),
          v=point(-u.z,.29+.48*rand(),u.x).normalize(),spread=(.08+.21*rand())*(.65+.4*Math.sin(t*Math.PI));
        const length=.16+.35*rand(),a=site.clone().addScaledVector(delta,length),b=site.clone().addScaledVector(u,spread),
          c=a.clone().addScaledVector(v,.12+.20*rand()),d=site.clone().addScaledVector(u,-spread*.62),color=.47+.66*rand()+.12*site.y/4.5;
        tri(sprays,site,b,c,green,color);tri(sprays,site,c,d,green,color*.86);
        const t2=site.clone().addScaledVector(v,.13+.24*rand());
        tri(sprays,t2,b,a,green,color*.92);tri(sprays,t2,a,d,green,color);
      }
    }
    const foot=point(0,0,0),base=point(.035,1.10,-.018);
    limb(foot,base,.285,.16);
    for(let i=0;i<5;i++){
      const theta=tau*(i/5+.05*rand()),ca=Math.cos(theta),sa=Math.sin(theta);
      const fork=point(ca*(.64+.36*rand()),1.68+.52*rand(),sa*(.67+.22*rand()));
      limb(base,fork,.124+.017*rand(),.060);
      for(let j=0;j<4;j++){
        const branch=theta+(j-1.5)*(.34+.16*rand()),dx=Math.cos(branch),dz=Math.sin(branch),
          tipR=1.11+.80*rand()+j*.30;
        const tip=point(dx*tipR,2.56+.82*rand()+(j===0?.28:0),dz*tipR);
        limb(fork,tip,.045,.018);
        for(let k=0;k<5;k++){
          const twigA=branch+(k-2)*(.29+.12*rand()),dw=.56+.38*rand(),
            inner=tip.clone().lerp(fork,.18+.44*rand());
          const twig=tip.clone().add(point(Math.cos(twigA)*dw,.21+.68*rand(),Math.sin(twigA)*dw));
          limb(inner,twig,.012,.003);
          for(let m=0;m<3;m++){
            const a=twigA+(m-1)*(.39+.60*rand()),
              stem=twig.clone().lerp(inner,.25+.55*rand());
            plume(stem,twig.clone().add(point(Math.cos(a)*(.3+.46*rand()),-.23+.34*rand(),Math.sin(a)*(.3+.46*rand()))));
          }
        }
      }
    }
    function mesh(source){
      const geometry=new T.BufferGeometry();
      geometry.setAttribute('position',new T.Float32BufferAttribute(source.p,3));
      geometry.setAttribute('color',new T.Float32BufferAttribute(source.c,3));geometry.computeVertexNormals();
      const material=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});
      material.onBeforeCompile=shader=>{
        shader.uniforms.crownCardWeight=mix;
        shader.fragmentShader='uniform float crownCardWeight;\n'+shader.fragmentShader.replace('#include <alphatest_fragment>',
          '#include <alphatest_fragment>\nif('+screenHash+'<crownCardWeight)discard;');
      };
      material.customProgramCacheKey=()=> 'AerieCanyonVeteranLOD';
      return new T.Mesh(geometry,material);
    }
    const object=new T.Group();object.name='Western-bar riparian veteran';
    // Match the physically drawn form to the distant card at its transition.
    object.scale.set(.78,.916,.79);
    object.position.set(root.x,root.y,root.z);object.add(mesh(bark),mesh(sprays));
    const shadow=object.clone();
    return {object,shadow,free(){object.removeFromParent();shadow.removeFromParent();object.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});}};
  }
  function makeRiparian(T,parent,shadowScene,world,load,common,screenHash,shadowGLSL){
    if(world.region!=='canyon')return null;
    let root=null,form=null,sprite=null,nextCheck=0,clearance=null,prior=null;
    const mix={value:0};
    function update(view,flight,seconds){
      const planar=Math.hypot(view.x-riparianSite.x,view.z-riparianSite.z);
      if(!form&&planar<310&&seconds>=nextCheck){
        nextCheck=seconds+.8;
        root=rootRiparian(world);
        if(!root)return;
        form=riparianMeshes(T,root,mix,screenHash);parent.add(form.object);shadowScene.add(form.shadow);
        sprite=makeSprite(T,parent,shadowScene,world,load,common,screenHash,shadowGLSL,{range:[49,74],width:root.w});
        prior=world.clearance||world.height;
        clearance=(x,z,altitude)=>{
          const base=prior(x,z,altitude);
          return form?.object.visible&&Math.hypot(x-root.x,z-root.z)<root.trunk?Math.max(base,root.y+root.trunkH):base;
        };
        world.clearance=clearance;
      }
      if(!form)return;
      sprite.reset();
      const visible=planar<470&&Math.abs(view.y-root.y)<360,closeToBird=Math.hypot(flight.x-root.x,flight.z-root.z)<25;
      if(visible)sprite.prime(planar);
      mix.value=visible&&!closeToBird?sprite.draw(root,view,0,1):0;
      form.object.visible=form.shadow.visible=(visible||closeToBird)&&mix.value<.999;
    }
    return {update,stats:()=>root&&{species:'Riparian woody tree',x:root.x,y:root.y,z:root.z,height:root.h,source:'USGS registered crown'},
      dispose(){if(world.clearance===clearance)world.clearance=prior;form?.free();sprite?.dispose();form=null;}};
  }
  window.aerieVeteranTrees={definitions,choose,makeSprite,rootRiparian,makeRiparian};
})();
