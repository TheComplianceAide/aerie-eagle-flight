// Six views baked from each of 112 branching regional tree models.
// Columns carry distinct mature, asymmetric, open-grown and suppressed crowns.
(() => {
  const species=['Balsam fir','Red spruce','Northern white cedar','Paper birch','American beech',
    'Sugar maple','Yellow birch','Red maple','Eastern hemlock','Eastern white pine'];
  const localShapes=[[13,5,2,3,7,11,0,15],[6,7,14,0,11,9,13,12],[5,6,14,0,4,15,12,10],[7,14,5,3,13,11,8,12]];
  const localSheets=['moosehead-tree','moosehead-red-spruce','moosehead-cedar','moosehead-birch'];
  // A second, source-authored mature forest class. Juveniles and large gaps remain in the original cohorts.
  const matureCells=[[4,5,6,7],[0,1,2,3],[],[13],[],[15],[12],[14],[8,9],[10,11]];
  const matureFamilies=['spruce','spruce','spruce','spruce','fir','fir','fir','fir','hemlock','hemlock','pine','pine','broad','broad','broad','broad'];
  const matureNames=['single-leader red spruce','split-spire red spruce','slim canopy spruce','leaning spruce',
    'dense spire fir','lower-branch fir','multi-tier fir','bank fir','shaded hemlock','gap hemlock',
    'emergent white pine','lakeshore white pine','yellow birch','paper birch','red maple','sugar maple'];
  const fallbackForms=[22,23,19,16,13,5,2,7,97,98,104,105,80,55,88,72];
  function matureCell(name,variation,height){
    const family=species.indexOf(name),choices=matureCells[family];
    if(!choices?.length||height<9.8)return -1;
    const limit=height<14?153:201;
    return (variation&255)<limit?choices[(variation>>>16)%choices.length]:-1;
  }
  window.mooseheadMatureCanopy={id:'moosehead-mature',region:'moosehead',species:'Mature Maine forest',
    cells:matureNames,families:matureFamilies,cellFor:matureCell};
  const scenes=new WeakMap();
  function localCell(name,variation,height){
    const family=species.indexOf(name);
    if(family<0||family>3)return variation>>>28;
    // Edge and juvenile forms remain represented. Most canopy-height stems
    // belong to the mature size class, including in the near 3D model.
    if(height<13||(variation&255)<116)return variation>>>28;
    return localShapes[family][(variation>>>20)%6];
  }
  window.mooseheadSourceCell=localCell;
  window.mooseheadCrowns=(T,scene,time)=>{
    if(scenes.has(scene))return scenes.get(scene);
    let terrain;
    scene.traverse(o=>{const u=o.material?.uniforms;if(!terrain&&u?.aerial&&u?.ranges&&u?.terrainLight)terrain=u;});
    if(!terrain)return null;
    const profile=window.aerieCanopyProfile({region:'moosehead',waterLevel:window.ATLAS_PROFILES.moosehead.water+.16});
    const maps=new T.TextureLoader(),name=matchMedia('(pointer: coarse)').matches?'moosehead-survey-crowns-mobile.webp':'moosehead-survey-crowns.webp';
    const file=window.aerieAssetURL?.(name)||name;
    const plate=maps.load(file);plate.anisotropy=4;
    const matureFile=matchMedia('(pointer: coarse)').matches?'moosehead-mature-crowns-mobile.webp':'moosehead-mature-crowns.webp';
    const maturePlate=maps.load(window.aerieAssetURL?.(matureFile)||matureFile,()=>{uniforms.matureReady.value=1;});
    maturePlate.anisotropy=4;
    const wind=window.getCanopyWind(T,scene);
    const uniforms={...wind.uniforms,plate:{value:plate},maturePlate:{value:maturePlate},matureReady:{value:0},clock:time,photo:terrain.aerial,ranges:terrain.ranges,
      light:terrain.terrainLight,nearHalf:terrain.halfMap,farSpan:terrain.farSpan,haze:terrain.haze,sun:terrain.sun};
    function traits(tree,isFir){
      const raw=(Math.imul(Math.round(tree.x*4),73856093)^Math.imul(Math.round(tree.z*4),19349663))>>>0;
      const mix=Math.imul(raw^(raw>>>16),0x45d9f3b)>>>0;
      const plant=profile.species(tree,raw/4294967296,isFir);
      let family=species.indexOf(plant?.name);if(family<0)family=isFir?0:6;
      const q=(mix&0xffff)/65536;
      // The mature trees have deeper, fuller crowns. Young and exposed stems
      // retain a larger chance of a narrow or interrupted silhouette.
      const slot=q<.78?Math.floor(5*q/.78):5+Math.min(2,Math.floor((q-.78)*3/.22));
      const h=tree.height*(plant?.stature||1);
      const width=(tree.width||tree.height*.65)*(plant?.aspect||1);
      const model=family<4?family*16+localCell(species[family],mix,tree.height):64+(family-4)*8+slot;

      // Encode an additional mature form without losing the original index. If the
      // optional atlas is unavailable the same stem keeps its original rendering.
      const mature=matureCell(species[family],mix,tree.height);
      return [model+128*(mature+1),h,width,raw%104729/104729*6.2831853];
    }
    function material(fir,regional=false,hardwood=false){
      const mat=new T.ShaderMaterial({side:T.DoubleSide,uniforms,vertexShader:`
        ${wind.glsl}
        ${window.aerieCrownTransition}
        attribute vec4 crownForm;attribute vec3 rootPosition;
        ${regional?'attribute vec2 lodFade;varying vec2 coverBounds;':''}
        ${fir?'attribute vec2 promoted;attribute float reachSquared;':''}
        ${hardwood?'attribute float nearResident;attribute vec4 form;':''}
        uniform float clock,nearHalf,farSpan,matureReady;uniform vec3 sun;
        uniform sampler2D photo,ranges,light;
        varying vec2 tileUV;varying vec4 viewIds,lightTint;varying vec3 weights,land;
        varying vec3 canopyLocal;varying float distanceToTree,cover,skyGlow,matureId,sunSide,standVariation;varying vec4 matureViews;varying vec2 matureMix;
        void main(){
          ${regional?'coverBounds=lodFade;':''}
          vec3 root=rootPosition,center=root+vec3(0.,crownForm.y*.5,0.);
          vec3 delta=cameraPosition-center;distanceToTree=length(delta);
          cover=0.;
          ${fir?`if(promoted.x>0.)cover=crownDetail(distance(cameraPosition,root+vec3(0.,promoted.y*.5,0.)),promoted.x*.78,promoted.x);
            if(dot(delta,delta)>reachSquared*1.06){gl_Position=vec4(2.,2.,2.,1.);return;}`:''}
          ${hardwood?'cover=nearResident*crownDetail(distance(cameraPosition,root+vec3(0.,form.y*.5-.12,0.)),80.,110.);':''}
          if(cover>=1.){gl_Position=vec4(2.,2.,2.,1.);return;}
          vec3 direction=delta/max(.1,distanceToTree);
          vec3 right=normalize(vec3(direction.z+.00001,0.,-direction.x)),up=cross(direction,right);
          sunSide=dot(right.xz,normalize(sun.xz));standVariation=.92+.17*fract(crownForm.w*3.724);
          float yaw=fract((atan(direction.x,direction.z)-crownForm.w)*.15915494)*4.;
          float elev=asin(clamp(direction.y,0.,1.)),az=smoothstep(.21,.79,fract(yaw));
          float lifted=smoothstep(.35,1.06,elev),top=smoothstep(.95,1.44,elev);
          float baseForm=mod(crownForm.x,128.);
          matureId=matureReady>.5?floor(crownForm.x/128.)-1.:-1.;
          if(matureId>=0.){
            float yaw8=yaw*2.,angleA=floor(yaw8),angleB=mod(angleA+1.,8.);
            float band=elev<.49?elev/.49:elev<1.?1.+(elev-.49)/.51:2.+(elev-1.)/.570796;
            float bottom=min(2.,floor(band)),upper=bottom+1.;
            matureViews=vec4(8.*bottom+angleA,8.*bottom+angleB,min(24.,8.*upper+angleA),min(24.,8.*upper+angleB))+25.*matureId;
            matureMix=smoothstep(vec2(.04),vec2(.96),vec2(fract(yaw8),clamp(band-bottom,0.,1.)));
          }
          viewIds=vec4(floor(yaw),mod(floor(yaw)+1.,4.),4.+step(.50,top),baseForm*6.);
          weights=vec3((1.-lifted)*(1.-az),(1.-lifted)*az,lifted);
          float w=1.8*crownForm.z/.60;
          float h=1.8*sqrt(mix(crownForm.y*crownForm.y,pow(crownForm.z/(matureId>=0.?1.:.60),2.),direction.y*direction.y));
          vec3 wp=center+right*(position.x*w)+up*(position.y*h);
          if(distanceToTree<385.){
            vec2 front=plantFront(root.xz);
            wp.xz+=plantMotion(root.xz,front,clock,.17)*crownForm.y*.12*uv.y*uv.y;
          }
          canopyLocal=(wp-root)/crownForm.y;
          vec2 geo=vec2(root.x,-root.z);
          vec2 uvMap=.5+geo/(2.*nearHalf);
          float extent=max(abs(geo.x),abs(geo.y));
          if(extent<nearHalf-160.)land=texture2D(photo,uvMap).rgb;
          else if(extent>=nearHalf)land=texture2D(ranges,.5+geo/farSpan).rgb;
          else land=mix(texture2D(photo,uvMap).rgb,texture2D(ranges,.5+geo/farSpan).rgb,smoothstep(nearHalf-160.,nearHalf,extent));
          float direct=texture2D(light,uvMap).r,phase=dot(direction.xz,sun.xz);
          skyGlow=pow(max(0.,dot(-direction,normalize(sun))),2.5);
          lightTint=vec4(mix(vec3(.56,.64,.68),vec3(.91,.95,.87),direct),.95+.07*phase);
          tileUV=uv;gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);
        }`,fragmentShader:`
          uniform sampler2D plate,maturePlate;uniform vec3 haze,sun;
          ${regional?'varying vec2 coverBounds;':''}
          varying vec2 tileUV;varying vec4 viewIds,lightTint;varying vec3 weights,land;
          varying vec3 canopyLocal;varying float distanceToTree,cover,skyGlow,matureId,sunSide,standVariation;varying vec4 matureViews;varying vec2 matureMix;
          ${window.aerieCanopyBranchCoverage}
          ${window.aerieCrownTransition}
          vec4 tap(float view){
            float cell=viewIds.w+view;
            vec2 origin=vec2(mod(cell,26.),25.-floor(cell/26.));
            return texture2D(plate,(origin+clamp(tileUV,vec2(.025),vec2(.975)))/26.);
          }
          vec4 matureSample(float index){
            vec2 cell=vec2(mod(index,20.),19.-floor(index/20.));
            vec4 value=texture2D(maturePlate,(cell+clamp(tileUV,vec2(.025),vec2(.975)))/20.);
            return vec4(value.rgb*value.a,value.a);
          }
          void main(){
            ${regional?'if(coverBounds.x>.001||coverBounds.y<.999){float cut=branchCoverage(canopyLocal);if(cut>=coverBounds.y||cut<coverBounds.x)discard;}':''}
            if(cover>crownPixel(gl_FragCoord.xy))discard;
            float density;
            vec3 foliage;
            if(distanceToTree>330.&&matureId>=0.){
              // Once individual sprays fall below a few display pixels a single
              // authored direction suffices. Keep full interpolation around the bird.
              float angle=matureMix.y<.5?(matureMix.x<.5?matureViews.x:matureViews.y):(matureMix.x<.5?matureViews.z:matureViews.w);
              vec4 rgba=matureSample(angle);density=rgba.a;foliage=rgba.rgb/max(.001,density);
            }else if(distanceToTree>330.){
              float angle=weights.z>max(weights.x,weights.y)?viewIds.z:weights.y>weights.x?viewIds.y:viewIds.x;
              vec4 rgba=tap(angle);density=rgba.a;foliage=rgba.rgb;
            }else if(matureId>=0.){
              vec4 lower=mix(matureSample(matureViews.x),matureSample(matureViews.y),matureMix.x);
              vec4 upper=mix(matureSample(matureViews.z),matureSample(matureViews.w),matureMix.x);
              vec4 rgba=mix(lower,upper,matureMix.y);
              density=rgba.a;foliage=rgba.rgb/max(.001,density);
            }else{
              vec4 a=tap(viewIds.x),b=tap(viewIds.y),c=tap(viewIds.z);
              vec3 mass=vec3(a.a,b.a,c.a)*weights;
              density=dot(mass,vec3(1.));foliage=(a.rgb*mass.x+b.rgb*mass.y+c.rgb*mass.z)/max(.001,density);
            }
            if(density<mix(.24,.125,smoothstep(250.,1900.,distanceToTree)))discard;
            vec3 tone=foliage*lightTint.rgb*lightTint.a;
            float luminance=dot(foliage,vec3(.25,.62,.13));
            vec3 geographic=land*(.79+.38*clamp(luminance/.28,.22,1.65))*lightTint.rgb;
            float daylight=dot(land,vec3(.25,.62,.13));
            float registration=matureId>=0.?mix(.10,.50,smoothstep(155.,2400.,distanceToTree)):mix(.24,.67,smoothstep(135.,1900.,distanceToTree));
            tone*=mix(vec3(.66,.73,.80),vec3(1.),smoothstep(.105,.50,daylight));
            tone/=1.+.40*smoothstep(.40,.86,luminance);
            vec3 color=mix(tone,geographic,registration)+vec3(.047,.040,.029)*skyGlow;
            // Backlit fir tips transmit green light, while the inside of each
            // needle whorl and the bark on the shaded slope remain dark.
            // Birch bark keeps the reflectance of its photograph.
            float specimen=floor(viewIds.w/6.+.1);
            bool evergreen=matureId>=0.?matureId<12.:(specimen<48.||specimen>=96.);
            float leaf=smoothstep(.012,.115,foliage.g-foliage.b)*smoothstep(-.014,.055,foliage.g-foliage.r*.91);
            float shelter=1.-smoothstep(.28,.58,daylight);
            if(matureId<0.&&evergreen){
              vec3 absorption=mix(vec3(.63,.64,.61),vec3(.47,.70,.54),leaf);
              color*=mix(vec3(1.),absorption,.65+.34*shelter);
            }else if(matureId<0.){
              color*=mix(vec3(1.),vec3(.66,.83,.67),leaf*(.38+.54*shelter));
            }
            if(matureId>=0.){
              float flank=clamp((tileUV.x-.50)*5.,-1.,1.);
              float upper=clamp((tileUV.y-.23)*1.85,0.,1.);
              float relief=.71+.22*upper+.20*sunSide*flank+.095*abs(flank);
              // Diffuse source lighting is already encoded in these leaf and
              // needle samples. Preserve the fresh outer highlights against
              // shadowed interior branch pockets in the shaded lakeside stand.
              color=color*relief*standVariation*vec3(1.14,1.06,1.12)+vec3(.008,.012,.011);

            }
            // At the lip of the bluff, light passes between thin shoots on
            // the upper limbs. The dense crown retains its interior shading.
            float margin=(1.-smoothstep(.25,.84,density))*smoothstep(.37,.77,tileUV.y);
            float skyScatter=margin*smoothstep(190.,760.,distanceToTree)*(.40+.60*skyGlow);
            color+=vec3(.080,.074,.053)*skyScatter;
            vec3 linear=pow(max(color,vec3(0.)),vec3(2.2));
            float aerial=1.-exp(-distanceToTree*.000031);
            gl_FragColor=vec4(mix(linear,haze*.92,aerial),1.);
            #include <colorspace_fragment>
          }`});
      if(!regional)mat.userData.canopyRoot='rootPosition';
      return mat;
    }
    function farBatch(parent,sheet,capacity){
      const family=localSheets.indexOf(sheet),mature=sheet==='moosehead-mature',queue=[];
      const mat=material(false,true),shadowMat=mat.clone();shadowMat.uniforms=mat.uniforms;
      shadowMat.colorWrite=false;
      const quad=new T.PlaneGeometry(1,1),g=new T.InstancedBufferGeometry();
      g.setIndex(quad.index);g.setAttribute('position',quad.attributes.position);g.setAttribute('uv',quad.attributes.uv);
      const roots=new T.InstancedBufferAttribute(new Float32Array(capacity*3),3);
      const forms=new T.InstancedBufferAttribute(new Float32Array(capacity*4),4);
      const fade=new T.InstancedBufferAttribute(new Float32Array(capacity*2),2);
      const cells=new T.InstancedBufferAttribute(new Uint8Array(capacity),1);
      for(const [name,attr] of Object.entries({rootPosition:roots,crownForm:forms,lodFade:fade,aerieCell:cells})){
        g.setAttribute(name,attr.setUsage(T.DynamicDrawUsage));
      }
      const mesh=new T.Mesh(g,mat);mesh.name=sheet+' far crowns';mesh.visible=mesh.frustumCulled=false;
      mesh.userData.aerieRegional={sheet,lod:'far',cellAttribute:'aerieCell',cellComponent:0};parent.add(mesh);
      function finish(){
        const count=Math.min(capacity,queue.length);
        for(let i=0;i<count;i++){
          const {tree:t,form,low,high}=queue[i];roots.setXYZ(i,t.x,t.y,t.z);
          const id=mature?fallbackForms[form.cell]+128*(form.cell+1):family*16+form.cell;
          forms.setXYZW(i,id,t.h,t.radius*2,t.seed%104729/104729*6.2831853);
          fade.setXY(i,low,high);cells.setX(i,form.cell);
        }
        mesh.visible=count>0;g.instanceCount=count;
        if(count)for(const attr of [roots,forms,fade,cells]){
          attr.clearUpdateRanges();attr.addUpdateRange(0,count*attr.itemSize);attr.needsUpdate=true;
        }
        queue.length=0;
      }
      function shadow(scene,on){if(mesh.visible){mesh.material=on?shadowMat:mat;(on?scene:parent).add(mesh);}}
      function dispose(){mesh.removeFromParent();g.dispose();mat.dispose();shadowMat.dispose();}
      return {queue,finish,shadow,dispose};
    }
    const api={traits,material,farBatch,localSheets:[...localSheets,'moosehead-mature']};scenes.set(scene,api);return api;
  };
})();
