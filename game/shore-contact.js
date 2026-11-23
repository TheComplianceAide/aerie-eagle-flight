// Where a lake meets its bank the water is a film a few centimetres thick, and
// the flat lake mesh used to stop there in a hard polygon. This measures the
// real depth of water over the ground and draws the margin from it:
//
//   - A camera looking straight down records the height of the terrain around
//     the eagle, relative to the lake level, into a small half-float target.
//     It is redrawn only when the eagle has moved on, never per frame. (The
//     same idea as a sea-floor depth cache: depth is known per pixel without a
//     second full-screen pass, and it does not swim as the view turns.)
//   - The lake shader reads that depth. Thin water lets the actual ground show
//     through (Beer-Lambert over the refracted path) while keeping its Fresnel
//     reflection, so the bed under the margin is the same ground as the bank.
//   - The waterline itself rises and falls with the wave packets that already
//     wet the bank, wanders around stones, carries a bright meniscus and a
//     broken line of bubbles on the uprush, and leaves a glossy film behind.
//
// Deeper than about a metre, or beyond the recorded area, the lake is drawn
// exactly as before.
window.addShoreContact=function addShoreContact(T,renderer,scene,world,camera){
  if(window.aerieShoreContact===false||!renderer.capabilities.isWebGL2)return null;
  if(!renderer.extensions.has('EXT_color_buffer_half_float')&&!renderer.extensions.has('EXT_color_buffer_float'))return null;
  let lake=null;
  scene.traverse(o=>{if(!lake&&o.isWater&&o.material?.uniforms?.shoreField&&o.material.uniforms.foamCells)lake=o;});
  if(!lake)return null;
  const material=lake.material,uniforms=material.uniforms;
  const anchor='gl_FragColor=vec4(radiance,alpha);';
  if(!material.fragmentShader.includes(anchor)||uniforms.shoreHeight)return null;
  const isGround=o=>o.isMesh&&!o.isInstancedMesh&&!!o.material?.uniforms?.shoreLevel;
  const ground=scene.children.find(isGround);
  // Sea worlds clip their land below the tide, so there is no bed to show through.
  if(!ground||ground.material.fragmentShader.includes('if(wp.y<shoreLevel+.001)discard;'))return null;
  // The lake program is already at the sixteen-sampler floor of a phone on the
  // big lakes, so this adds no sampler there: a lake never draws the sea's surf
  // cells, and its idle sampler carries the height record instead.
  const borrowed=!uniforms.foamCells.value;
  if(!borrowed){
    const source=material.fragmentShader;
    const declared=[...source.matchAll(/uniform\s+(?:(?:highp|mediump|lowp)\s+)?sampler\w+\s+([^;]+);/g)].flatMap(m=>m[1].split(',').map(name=>name.trim().replace(/\[.*$/,'')));
    const active=new Set(declared.filter(name=>source.split(new RegExp('\\b'+name+'\\b')).length>2));
    // One more for the sun's shadow map, which the lights chunk declares.
    if(active.size+2>renderer.capabilities.maxTextures)return null;
  }

  const coarse=matchMedia('(pointer: coarse)').matches;
  const size=coarse?512:1024,span=coarse?192:256,texel=span/size,layer=12;
  const level=lake.position.y;
  const record=new T.WebGLRenderTarget(size,size,{type:T.HalfFloatType,format:T.RGBAFormat,
    minFilter:T.LinearMipmapLinearFilter,magFilter:T.LinearFilter,depthBuffer:true,stencilBuffer:false});
  record.texture.generateMipmaps=true;record.texture.anisotropy=4;
  record.texture.wrapS=record.texture.wrapT=T.ClampToEdgeWrapping;
  // Heights from three metres under the lake to one metre over it, at about
  // two millimetres a step around the waterline in half floats.
  const heightMaterial=new T.ShaderMaterial({side:T.DoubleSide,uniforms:{lakeLevel:{value:level}},
    vertexShader:'varying float high;void main(){vec4 w=modelMatrix*vec4(position,1.);high=w.y;gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader:'uniform float lakeLevel;varying float high;void main(){gl_FragColor=vec4(clamp((high-lakeLevel+3.)*.25,0.,1.),0.,0.,1.);}'});
  const above=new T.OrthographicCamera(-span/2,span/2,span/2,-span/2,10,8000);
  above.up.set(0,0,-1);above.layers.set(layer);above.userData.lakeReflection=true;
  const capture=new T.Vector4(0,0,1/span,0),centre=new T.Vector2(Infinity,Infinity),ahead=new T.Vector3(),clear=new T.Color();
  if(borrowed)uniforms.foamCells.value=record.texture;else uniforms.shoreHeight={value:record.texture};
  uniforms.shoreCapture={value:capture};

  function draw(x,z){
    for(const o of scene.children)if(isGround(o))o.layers.enable(layer);
    above.position.set(x,level+4000,z);above.lookAt(x,level,z);above.updateMatrixWorld();
    const target=renderer.getRenderTarget(),xr=renderer.xr.enabled,shadows=renderer.shadowMap.autoUpdate;
    const override=scene.overrideMaterial,background=scene.background,alpha=renderer.getClearAlpha();
    renderer.getClearColor(clear);
    renderer.xr.enabled=false;renderer.shadowMap.autoUpdate=false;scene.overrideMaterial=heightMaterial;scene.background=null;
    try{
      renderer.setRenderTarget(record);renderer.setClearColor(0x000000,1);renderer.clear();
      renderer.render(scene,above);
    }finally{
      scene.overrideMaterial=override;scene.background=background;renderer.setClearColor(clear,alpha);
      renderer.setRenderTarget(target);renderer.xr.enabled=xr;renderer.shadowMap.autoUpdate=shadows;
    }
    centre.set(x,z);capture.set(x,z,1/span,1);
  }
  const step=texel*Math.round(span/8/texel);
  function update(){
    camera.getWorldDirection(ahead);
    const reach=span*.30/Math.max(.2,Math.hypot(ahead.x,ahead.z));
    const x=Math.round((camera.position.x+ahead.x*reach)/step)*step,z=Math.round((camera.position.z+ahead.z*reach)/step)*step;
    // Nothing of the margin resolves from high above the lake.
    if(camera.position.y-level>420){capture.w=0;centre.set(Infinity,Infinity);return;}
    if(Math.abs(x-centre.x)>step*.75||Math.abs(z-centre.y)>step*.75)draw(x,z);
  }
  const previous=world.update.bind(world);
  world.update=(dt,t,player)=>{previous(dt,t,player);update();};
  // A restored graphics context comes back with an empty record, and a perched
  // eagle would never cross a step to redraw it.
  const invalidate=()=>{centre.set(Infinity,Infinity);capture.w=0;};
  renderer.domElement.addEventListener('webglcontextrestored',invalidate);
  material.addEventListener('dispose',()=>{
    renderer.domElement.removeEventListener('webglcontextrestored',invalidate);record.dispose();heightMaterial.dispose();
  });

  material.fragmentShader=`${borrowed?'#define shoreHeight foamCells':'uniform sampler2D shoreHeight;'}
    uniform vec4 shoreCapture;
    `+material.fragmentShader.replace(anchor,`
        float shoreCover=1.;
        {
          // Metres of water over the recorded ground at this point of the lake.
          vec2 recorded=vec2(p.x-shoreCapture.x,shoreCapture.y-p.y)*shoreCapture.z+.5;
          float inside=shoreCapture.w*smoothstep(0.,.07,min(min(recorded.x,1.-recorded.x),min(recorded.y,1.-recorded.y)));
          float depth=3.-4.*texture2D(shoreHeight,recorded).r;
          if(inside>.002&&depth<1.5){
            float resolved=1.-smoothstep(.35,2.6,footprint);
            // The edge wanders around bars a few metres long and around the
            // same stones that lie on the bed just under the film.
            vec2 bars=texture2D(normalSampler,p*.0127+vec2(.31,.17)).rg-.5;
            vec2 grain=texture2D(normalSampler,p*.57+vec2(.21,.57)).rg-.5;
            vec3 bedStones=texture2D(pebbles,p*.48).rgb;
            float cobble=smoothstep(.20,.62,dot(bedStones,vec3(.30,.59,.11)));
            float relief=.16*(bars.x+bars.y)+(.040*cobble-.016)*rockyBed*resolved;
            // The same packets that wet the bank lift and drop the film.
            float arrival=shoreClock(p,time,coast),packet=shoreGroup(p,time);
            float surge=(.5+.5*sin(arrival))*(.30+.70*packet);
            float swing=mix(.055,.19,coast)*(.55+.45*fetch);
            float film=depth-.028-swing*(1.-surge)-relief;
            float soft=max(fwidth(film),.0012);
            float wetted=smoothstep(-soft,soft,film);
            vec3 inward=refract(-v,n,.75019);
            float path=max(film,0.)/max(.3,-inward.y);
            float column=1.-exp(-6.5*path);
            float cover=wetted*(1.-(1.-column)*(1.-waterSky));
            vec3 skyward=max(reflectLight,skyVeil*.55);
            // A meniscus climbs each stone; it catches the sky in short broken arcs.
            float lip=wetted*(1.-smoothstep(0.,.006+soft,film))*resolved*(.30+.70*smoothstep(-.10,.14,grain.x));
            radiance=mix(radiance,skyward*(.74+.26*daylight),lip*.50);
            cover=max(cover,lip*.58);
            // Bubbles gather between the stones on the advancing front and
            // thin out on the backwash.
            float rising=smoothstep(-.35,.75,cos(arrival));
            vec2 drift=p*.83+away*(.09*sin(arrival)-.03*time);
            vec2 fizz=texture2D(normalSampler,drift).rg-.5;
            float lace=1.-smoothstep(.02,.11,abs(fizz.x-fizz.y));
            float band=wetted*(1.-smoothstep(.004,.020+.055*surge,film));
            float froth=band*smoothstep(.34,.80,.52*lace+.48*(1.-cobble)+.24*(packet-.5))*(.30+.70*rising)*mix(.62,.95,coast)*resolved;
            radiance=mix(radiance,vec3(.80,.86,.86)*(.42+.58*daylight)*(.80+.20*visibleSun),froth);
            cover=max(cover,froth);
            // Ground the last wave left wet returns the sky at a low angle.
            float glance=clamp(v.y,0.,1.),sheen=.02+.98*pow(1.-glance,5.);
            float damp=(1.-wetted)*smoothstep(.018,.050,depth)*(.50+.50*smoothstep(-.09,-.004,film));
            float gloss=.70*damp*sheen*(.30+.70*cobble)*resolved;
            radiance=(radiance*cover+skyward*gloss)/max(.0001,cover+gloss);
            cover+=gloss;
            shoreCover=mix(1.,cover,inside);
          }
        }
        ${anchor}
        gl_FragColor.a*=shoreCover;`);
  material.transparent=true;material.depthWrite=true;material.needsUpdate=true;
  // Opaque until now, so the lake was drawn before every spray and foam sheet.
  if(lake.renderOrder>-900)lake.renderOrder=-1000;
  // Metres of water over the recorded ground, for checks and tools.
  const probe=new Uint16Array(4);
  function depthAt(x,z){
    const u=Math.floor(((x-centre.x)/span+.5)*size),w=Math.floor(((centre.y-z)/span+.5)*size);
    if(!(u>=0&&w>=0&&u<size&&w<size)||!capture.w)return NaN;
    probe[0]=0;renderer.readRenderTargetPixels(record,u,w,1,1,probe);return 3-4*T.DataUtils.fromHalfFloat(probe[0]);
  }
  return world.shoreContact={update,depthAt,span,size};
};
