// Physical terminal branches for the closest regional trees. All coordinates are
// in the source mesh's packed frame (22,000 units per tree height).
(() => {
  const tileSize = 1024, tileInset = 68, usableTile = 888;
  const bareBrush = new Set(['Mormon tea', 'Blackbrush', 'Sand sagebrush', 'Coastal dwarf heath']);
  const up = [0, 1, 0];
  const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const add = (a, b, k = 1) => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]];
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const unit = a => scale(a, 1/Math.max(.0001, Math.hypot(...a)));

  // The source compiler stores three points across each spray at each bend.
  // Preserve its measured attachment, orientation, length and specimen-specific UVs.
  function findShoots(geom) {
    const pos = geom.attributes.position.array, uv = geom.attributes.uv.array, slot = geom.attributes.surface.array;
    const shoots = [];
    for (let a = 0; a + 5 < slot.length; a++) {
      if (slot[a] !== 2 || uv[a*2] % tileSize !== tileInset ||
          uv[a*2] !== uv[(a+2)*2] || uv[a*2+1] <= uv[(a+2)*2+1]) continue;
      let tip = a+3;
      while (tip+5 < slot.length && slot[tip+3] === 2 && uv[(tip+3)*2] > uv[tip*2] &&
             (uv[tip*2] >> 10) === (uv[(tip+3)*2] >> 10)) tip += 3;
      if (uv[tip*2] % tileSize !== tileInset + usableTile) continue;
      const rootIndex = a+1, tipIndex = tip+1;
      const length = Math.hypot(pos[tipIndex*3]-pos[rootIndex*3], pos[tipIndex*3+1]-pos[rootIndex*3+1], pos[tipIndex*3+2]-pos[rootIndex*3+2]);
      if (length >= 250 && pos[rootIndex*3+1] > 1100) shoots.push({rootIndex, tipIndex, length, first:a, last:tip+2});
      a = tip+2;
    }
    return shoots;
  }

  // These specimens have a higher-resolution photograph of the matching
  // species already resident for the Maine shore. Other species retain their
  // own authored regional bough and terminal atlas.
  function maineShootTiles(meta, cell, family) {
    if(meta.region !== 'moosehead') return null;
    if(family === 'fir') return [8,10];
    if(family === 'spruce') return [9,11];
    if(family === 'cedar') return [0,1,2,3];
    if(meta.species === 'Paper birch' || meta.id === 'moosehead-mature' && cell === 13) return [12];
    return null;
  }

  function enrich(record, meta, cell) {
    const geom = record.geometry, src = geom.attributes;
    const candidates = findShoots(geom);
    if (!candidates.length) return;
    const family = meta.families?.[cell] || meta.family;
    const broad = family === 'broad' || family === 'brush' && !bareBrush.has(meta.species);
    const cedar = family === 'cedar', pine = family === 'pine', droop = family === 'hemlock' || family === 'podocarp';
    const count = Math.min(candidates.length, family === 'brush' ? 54 : 88);
    const formName=meta.cells?.[cell]||'';
    const damaged=/dead|snag|fallen|downed|bare top|broken|shattered|skeleton|sparse|suppressed|stripped|windthrow|stump/i.test(formName);
    const scaffold=family!=='brush' && !damaged;
    const liveBalsam=scaffold && family==='fir' && meta.region==='moosehead';
    const oldCount = src.position.count, idxCount = geom.index.count;
    const attributes = {}, maxPerShoot = broad ? 51 : 61;
    for (const key of ['position','normal','uv','surface']) {
      const attr = src[key], data = new attr.array.constructor((oldCount+maxPerShoot*count+(scaffold?(broad?8500:15500):0))*attr.itemSize);
      data.set(attr.array);
      attributes[key] = data;
    }
    const indexType = oldCount + maxPerShoot*count + (scaffold?(broad?8500:15500):0) > 65535 ? Uint32Array : Uint16Array;
    let indices = new indexType(idxCount + (broad ? 126 : 150)*count+(scaffold?(broad?25000:44500):0));
    indices.set(geom.index.array);
    const col = cell % 4 * 2, row = Math.floor(cell/4)*2;
    let v = oldCount, ix = idxCount, blades = 0, limbs = 0, photoBoughs = 0, scaffoldBranches=0, scaffoldSprays=0;
    const shootTiles=maineShootTiles(meta,cell,family);
    if(shootTiles){
      for(let i=0;i<candidates.length;i++){
        const bough=candidates[i], hash=Math.imul(i+1,2654435761)>>>0;
        // Keep part of the fuller interior sprays. Open, terminated boughs in
        // the outer tiers visibly separate overlapping radial branches.
        const highBalsam=liveBalsam && attributes.position[bough.rootIndex*3+1]>14700;
        if(hash%11 >= (highBalsam?10:6) || bough.length<440 || (src.uv.array[bough.rootIndex*2+1]>>10)%2===1) continue;
        const tile=shootTiles[(hash>>>11)%shootTiles.length];
        attributes.surface.fill(4+2*tile,bough.first,bough.last+1);
        photoBoughs++;
      }
    }
    let pos = attributes.position;
    // Thin over-wide old sheets around their centerline, especially at the
    // tip. The new branch hierarchy supplies coverage in different planes.
    if(scaffold){
      for(const bough of candidates){
        if(bough.length<810)continue;
        for(let a=bough.first;a<=bough.last;a+=3){
          const t=(a-bough.first)/Math.max(3,bough.last-bough.first-2);
          const largeMaple=broad && bough.length>1650 && pos[(a+1)*3+1]>12500;
          const retain=(largeMaple?.70:broad?.79:.91)-t*(broad?.24:.15);
          for(const edge of [a,a+2])for(let j=0;j<3;j++){
            const center=pos[(a+1)*3+j];
            pos[edge*3+j]=Math.round(center+(pos[edge*3+j]-center)*retain);
          }
        }
      }
    }
    const point = i => [pos[i*3],pos[i*3+1],pos[i*3+2]];
    function vertex(p,n,u,w,wood) {
      if(v*3>=pos.length){
        const capacity=Math.max(v+16,Math.ceil(v*1.35));
        for(const key of Object.keys(attributes)){
          const buffer=attributes[key],grown=new buffer.constructor(capacity*src[key].itemSize);
          grown.set(buffer);attributes[key]=grown;
        }
        pos=attributes.position;
      }
      const i = v++;
      for(let k=0;k<3;k++) {
        pos[3*i+k] = Math.max(-32767, Math.min(32767, Math.round(p[k])));
        attributes.normal[3*i+k] = Math.round(n[k]*127);
      }
      // The lower left tile contains this tree's bark, lower right an isolated
      // leaf or terminal needle shoot. Both come from its original source atlas.
      attributes.uv[2*i] = (col+(wood?0:1))*tileSize + tileInset + Math.round(u*usableTile);
      attributes.uv[2*i+1] = (row+1)*tileSize + tileInset + Math.round(w*usableTile);
      attributes.surface[i] = wood ? 3 : 2;
      return i;
    }
    function triangle(a,b,c) {
      // Short twig tips can collapse to one point when quantized. Check the
      // packed result so a grazing flyby cannot light a zero-area sliver.
      const ax=pos[b*3]-pos[a*3], ay=pos[b*3+1]-pos[a*3+1], az=pos[b*3+2]-pos[a*3+2];
      const bx=pos[c*3]-pos[a*3], by=pos[c*3+1]-pos[a*3+1], bz=pos[c*3+2]-pos[a*3+2];
      const x=ay*bz-az*by,y=az*bx-ax*bz,z=ax*by-ay*bx;
      if(x===0&&y===0&&z===0)return;
      const n=attributes.normal;
      if(x*n[3*a]+y*n[3*a+1]+z*n[3*a+2]<0){const swap=b;b=c;c=swap;}
      if(ix+3>indices.length || (v>65535 && indices.BYTES_PER_ELEMENT===2)){
        const Index=v>65535?Uint32Array:indices.constructor;
        const size=ix+3>indices.length?Math.ceil((ix+3)*1.35):indices.length;
        const grown=new Index(size);grown.set(indices);indices=grown;
      }
      indices[ix++]=a; indices[ix++]=b; indices[ix++]=c;
    }
    function twig(start, end, radius, endRadius=radius*.28, sides=3) {
      const dir = unit(add(end,start,-1)), side = unit(cross(dir,Math.abs(dir[1])>.92?[1,0,0]:up)), face = cross(side,dir);
      const base = v;
      for (let j=0;j<sides;j++) {
        const t=j*2*Math.PI/sides, normal=add(scale(side,Math.cos(t)),face,Math.sin(t));
        vertex(add(start,normal,radius),normal,j/sides,.15,true);
        vertex(add(end,normal,endRadius),normal,j/sides,.72,true);
      }
      for(let j=0;j<sides;j++) {
        const a=base+j*2,b=base+(j+1)%sides*2;
        triangle(a,a+1,b); triangle(a+1,b+1,b);
      }
      limbs++;
    }
    function blade(start, direction, normal, length, width, curl) {
      // A raised midrib, a twisted shoulder and a recurved tip produce real
      // silhouette and parallax along and beneath a branch. Folded normals
      // follow the two sides; the photo defines the species-specific fringe.
      const d=unit(direction), span=unit(cross(d,normal)), n=unit(cross(span,d));
      const root=vertex(start,n,0,.5,false);
      const center=add(add(start,d,length*.47),n,length*curl);
      const left=vertex(add(add(center,span,-width),n,-width*.25),unit(add(n,span,-.38)),.47,0,false);
      const ridge=vertex(center,n,.47,.5,false);
      const right=vertex(add(add(center,span,width),n,-width*.48),unit(add(n,span,.55)),.47,1,false);
      const tip=vertex(add(add(start,d,length),n,-length*curl*.45),n,1,.5,false);
      triangle(root,ridge,left); triangle(root,right,ridge);
      triangle(left,ridge,tip); triangle(ridge,right,tip);
      blades++;
    }
    // Each curved spray has its own exposed base, lifted center rib, sloped
    // sides, and twisted free end. Adjacent laterals never share a plane.
    function spray(start, direction, sky, length, breadth, sourceTile, roll) {
      const d=unit(direction), lateral=unit(cross(d,sky)), n=unit(cross(lateral,d));
      const first=v;
      for(let rowIndex=0;rowIndex<3;rowIndex++){
        const t=rowIndex*.5, arch=Math.sin(t*Math.PI);
        const center=add(add(start,d,t*length),n,length*.065*arch);
        const twist=roll*(.25+t), w=breadth*(.78+.22*arch);
        for(let j=-1;j<=1;j++){
          const p=add(add(center,lateral,w*j),n,w*(twist*j-.32*Math.abs(j)));
          const normal=unit(add(n,lateral,.40*j-twist));
          const i=vertex(p,normal,t,(j+1)*.5,false);
          // Use each regional form's own branch crop, or a matched Maine photo.
          attributes.uv[i*2]=((col+(sourceTile<0?(first%2):0))*tileSize)+tileInset+Math.round(usableTile*t);
          attributes.uv[i*2+1]=row*tileSize+tileInset+Math.round(usableTile*(j+1)*.5);
          attributes.surface[i]=sourceTile<0?2:4+2*sourceTile;
        }
      }
      for(let a=0;a<2;a++)for(let j=0;j<2;j++){
        const i=first+a*3+j;
        triangle(i,i+3,i+1);triangle(i+1,i+3,i+4);
      }
      scaffoldSprays++;
    }
    // Follow the actual woody bole from the decoded mesh, including its lean;
    // its duplicated UV seam identifies the end of each eight-sided ring.
    function trunkPath(){
      const rings=[];
      const uv=src.uv.array;
      for(let i=0;i+8<src.surface.count;i+=9){
        if(src.surface.array[i]!==3 || uv[2*i]%tileSize!==tileInset ||
           uv[2*(i+8)]%tileSize!==tileInset+usableTile)break;
        const center=[0,0,0];
        for(let k=0;k<8;k++)for(let j=0;j<3;j++)center[j]+=pos[(i+k)*3+j]/8;
        rings.push(center);
        if(uv[2*i+1]%tileSize===tileInset+usableTile)break;
      }
      return rings.sort((a,b)=>a[1]-b[1]);
    }
    function stemAt(rings,y){
      let high=1;
      while(high<rings.length-1 && rings[high][1]<y)high++;
      const a=rings[high-1],b=rings[high];
      return add(a,add(b,a,-1),Math.max(0,Math.min(1,(y-a[1])/Math.max(1,b[1]-a[1]))));
    }

    let seed = (Math.imul(cell+1,0x9e3779b1) ^ candidates.length)>>>0;
    const random = () => ((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
    for(let k=0;k<count;k++) {
      // Stratified sampling keeps the detail on separate tiers of the crown.
      const shoot=candidates[Math.floor((k+.18+.64*random())*candidates.length/count)];
      const root=point(shoot.rootIndex),tip=point(shoot.tipIndex);
      const axis=unit(add(tip,root,-1)), span=unit(add(point(shoot.rootIndex+1),point(shoot.rootIndex-1),-1));
      let normal=unit(cross(span,axis)); if(normal[1]<0) normal=scale(normal,-1);
      const len=shoot.length;
      const attach=add(add(root,axis,len*(.43+.13*random())),normal,len*.014);
      // Lift terminal forks clear of the parent spray. Their shadows and side
      // profiles remain visible when the parent surface is seen edge-on.
      const hand=random()<.5?-1:1;
      const outgoing=unit(add(add(axis,span,hand*(.38+random()*.35)),normal,(droop?-.28:.22)+random()*.28));
      const stemLen = Math.min(len*(broad?.48:.53), broad?880:1250);
      const stemEnd=add(attach,outgoing,stemLen);
      twig(attach,stemEnd,Math.min(17,Math.max(2.2,stemLen*.016)));
      const bladeLen=Math.min(stemLen*(broad?.48:.62),broad?235:pine?480:350);
      const countBlades=broad?8:10;
      for(let j=0;j<countBlades;j++){
        const t=(j+random()*.37)/countBlades, sign=(j%2?1:-1)*hand;
        const length=bladeLen*(1.13-.48*t)*(.82+.32*random());
        const p=add(attach,outgoing,stemLen*(.08+.88*t));
        const lift=cedar?.10:pine?.56:family==='spruce'?.49:droop?-.29:.22;
        const sideDir=unit(add(add(outgoing,span,sign*(broad?1.49:1.08)),normal,lift+random()*(cedar?.30:1.01)-.37));
        const leafNormal=unit(add(normal,span,sign*(.16+random()*(cedar?.42:1.22))));
        blade(p,sideDir,leafNormal,length,length*(broad?.40:cedar?.34:.24),broad?.095:cedar?.075:.14);
      }
      const tipLength=bladeLen*.63;
      blade(stemEnd,outgoing,normal,tipLength,tipLength*(broad?.34:.24),.1);
    }
    if(scaffold){
      const rings=trunkPath();
      if(rings.length>1){
        const top=rings[rings.length-1][1], foot=Math.min(.56,Math.max(.19,record.r[0]))*22000;
        const chooseTile=()=>shootTiles?shootTiles[Math.floor(random()*shootTiles.length)]:-1;
        const phase=random()*Math.PI*2;
        if(!broad){
          // Firs and spruces carry annual whorls, from long shaded horizontal
          // limbs through shorter ascending shoots immediately below the leader.
          // Avoid the empty top metre seen when source tracing skips a tier.
          const tiers=pine?12:cedar?14:17, crownBase=pine?.39:droop?.24:.27;
          for(let q=0;q<tiers;q++){
            const h=crownBase+(.991-crownBase)*(q+.22*random())/tiers;
            const members=(pine?3:4)+(q+cell)%2;
            const ringAngle=phase+q*2.39996+.42*(random()-.5);
            for(let j=0;j<members;j++){
              const angle=ringAngle+2*Math.PI*(j+.20*(random()-.5))/members;
              const forward=[Math.cos(angle),0,Math.sin(angle)], side=[-forward[2],0,forward[0]];
              const origin=stemAt(rings,Math.min(top,top*(h+.012*(random()-.5))));
              const extent=foot*(.90+.26*random())*Math.pow(Math.max(.025,(1-h)/(1-crownBase)),.67);
              const swing=(random()-.5)*.29, tipRise=(h>.81?.23:.058)+(random()-.5)*.22;
              const low=droop?.17:(liveBalsam&&h>.60?.09:.06);
              const at=t=>add(add(add(origin,forward,extent*t),side,extent*swing*t*t),up,extent*(tipRise*t-low*Math.sin(t*Math.PI)));
              const elbow=at(.49),end=at(.97);
              const collar=Math.max(4.5,extent*(pine?.026:.022)),joint=Math.max(2.2,extent*.012);
              twig(origin,elbow,collar,joint,5);twig(elbow,end,joint,Math.max(1.,extent*.002),4);scaffoldBranches++;
              const pairs=h>.93?3:5;
              for(let k=0;k<pairs;k++){
                const t=.21+.72*(k+.16*random())/pairs;
                for(const hand of [-1,1]){
                  const base=at(t), fork=unit(add(add(forward,side,hand*(1.0+.32*random())),up,tipRise+(droop?-.24:.04)+.23*(random()-.5)));
                  const length=extent*(.43+.10*random())*(1-.58*t);
                  const leaf=add(base,fork,length*.42);
                  twig(base,leaf,Math.max(1.7,extent*.006*(1-.5*t)));
                  spray(add(base,fork,length*.14),fork,up,length*.95,length*(cedar?.31:.27),chooseTile(),hand*(.12+.58*random()));
                  if(liveBalsam && h>.54 && h<.99){
                    // Short, overlapping last years' growth turns a bare ray
                    // into a feathered balsam lateral. Sun shoots rise near
                    // the leader; shaded lower shoots spread to intercept sky.
                    const shotCount=h>.73?4:3;
                    let edge=hand;
                    for(let n=0;n<shotCount;n++){
                      edge=-edge;
                      const f=(n+.55+.30*random())/shotCount;
                      const joint=add(base,fork,length*(.15+.72*f));
                      const newDir=unit(add(add(fork,side,edge*(.65+.41*random())),up,
                                      (h-.65)*1.42 + (random()-.35)*.78));
                      const shootLength=Math.min(630,length*(.65-.20*f))*(.86+.27*random());
                      spray(joint,newDir,unit(add(up,side,edge*(.10+.83*random()))),
                            shootLength,shootLength*(.16+.035*random()),16+(n%2),edge*.26);
                    }
                    // Carry terminal needles along the end of the parent
                    // twig as well, so patches remain connected side-on.
                    const leaf=add(base,fork,length*.62);
                    spray(leaf,fork,up,Math.min(660,length*.60),Math.min(110,length*.10),16+(k%2),hand*.27);
                  }
                }
              }
              spray(at(.78),unit(add(forward,up,tipRise+.23)),up,extent*.29,extent*.084,chooseTile(),swing);
            }
          }
        }else{
          // A mature hardwood crown forks repeatedly: load-bearing scaffolds
          // sweep upward before dividing into opposite/alternating finer twigs.
          // Widely spaced wood remains visible between individual leaf shoots.
          const maple=/maple/i.test(meta.species+' '+formName), mainCount=11;
          for(let k=0;k<mainCount;k++){
            const h=.36+.55*(k+.28*random())/mainCount, angle=phase+2.39996*k+.21*(random()-.5);
            const f=[Math.cos(angle),0,Math.sin(angle)],side=[-f[2],0,f[0]],root=stemAt(rings,h*top);
            const extent=foot*(.56+.26*random())*Math.pow((1.12-h)/.73,.44);
            const rise=Math.min((1.015-h)*top,extent*(.48+.40*random()));
            const elbow=add(add(root,f,extent*.40),up,rise*.23);
            const knuckle=add(add(add(root,f,extent*.71),up,rise*.60),side,extent*(random()-.5)*.37);
            const tip=add(add(knuckle,f,extent*.16),up,rise*.41);
            twig(root,elbow,Math.max(14,extent*.045),extent*.029,7);
            twig(elbow,knuckle,extent*.029,extent*.014,6);twig(knuckle,tip,extent*.014,extent*.0034,5);
            scaffoldBranches++;
            for(let j=0;j<4;j++){
              const t=.18+.75*(j+random()*.27)/4,hand=(j%2?1:-1),seg=t<.5?elbow:knuckle;
              const base=add(seg,add(t<.5?knuckle:tip,seg,-1),(t*2)%1);
              const fork=unit(add(add(f,side,hand*(.81+.74*random())),up,.51+random()*.77));
              const length=extent*(.46-.23*t)*(.84+.33*random()),end=add(base,fork,length);
              twig(base,end,Math.max(3.2,length*.028));
              for(let n=0;n<3;n++){
                const at=add(base,fork,length*(.32+.60*n/3));
                for(const hand of [-1,1]){
                  const sub=unit(add(add(fork,side,hand*(.83+.29*random())),up,.18+random()*.34));
                  const leafLen=length*(.42-.045*n);
                  const tip=add(at,sub,leafLen);
                  twig(at,tip,Math.max(2,leafLen*.025));
                  for(let q=0;q<4;q++){
                    const sign=q%2?1:-1,offset=maple?.18+.34*Math.floor(q/2):.12+.17*q;
                    const stem=add(at,sub,leafLen*offset);
                    const d=unit(add(add(sub,side,sign*.83),up,.13+(random()-.5)*.62));
                    const normal=unit(add(up,side,(random()-.5)*1.42));
                    const leafSize=Math.min(159+92*random(),leafLen*(.46+.12*random()));
                    blade(stem,d,normal,leafSize,leafSize*(maple?.44:.31),.095);
                  }
                }
              }
            }
          }
        }
      }
    }
    for(const [key,data] of Object.entries(attributes)){
      const old=src[key];
      geom.setAttribute(key,new old.constructor(data.subarray(0,v*old.itemSize),old.itemSize,old.normalized));
    }
    geom.setIndex(new geom.index.constructor(indices.subarray(0,ix),1));
    record.v=v;record.i=ix;
    geom.userData.closeTreeDetail={forks:limbs,foliageTips:blades,photoBoughs,scaffoldBranches,scaffoldSprays,addedTriangles:(ix-idxCount)/3};
  }

  const normalShader = `
    #ifdef CLOSE_TREE_DETAIL
    // Luminance gradients follow the very same regional bark tile as its
    // color. Reconstruct surface slope in world space using its screen-space
    // tangent frame. Disable the relief progressively as a texel falls subpixel.
    if(barkUV.w<.5){
      vec2 uvBark=atlas(.005859375);
      vec2 ux=dFdx(uvBark),uy=dFdy(uvBark);
      vec3 px=dFdx(wp),py=dFdy(wp);
      vec3 across=cross(py,n),along=cross(n,px);
      float gram=dot(px,across);
      const vec3 luma=vec3(.24,.60,.16);
      const float stepUV=1./1024.;
      vec2 heightGradient=vec2(dot(texture2D(photo,uvBark+vec2(stepUV,0.)).rgb-texture2D(photo,uvBark-vec2(stepUV,0.)).rgb,luma),
                               dot(texture2D(photo,uvBark+vec2(0.,stepUV)).rgb-texture2D(photo,uvBark-vec2(0.,stepUV)).rgb,luma))*(.5/stepUV);
      float r=1.-smoothstep(1.0,5.0,1024.*max(length(ux),length(uy)));
      vec3 slope=(across*dot(heightGradient,ux)+along*dot(heightGradient,uy))*sign(gram)/max(abs(gram),1.e-8);
      n=normalize(n-.018*r*slope/max(1.,.05*length(slope)));
    }
    #endif
  `;
  function useShootPhoto(world, defines, uniforms) {
    const texture=world.shoreThickets?.shootAtlas;
    if(!texture) return;
    defines.MAINE_SHOOT_DETAIL=1;
    uniforms.closeMaineShoots={value:texture};
    uniforms.closeMaineReady={get value(){return texture.image?.width>1?1:0;}};
  }
  const colorShader=`
    #ifdef MAINE_SHOOT_DETAIL
    uniform sampler2D closeMaineShoots;
    uniform float closeMaineReady;
    #endif
    vec4 sampleCanopyColor(){
      #ifdef MAINE_SHOOT_DETAIL
      if(barkUV.z>3.5&&closeMaineReady>.5){
        float cell=floor((barkUV.z-4.)*.5+.5);
        vec2 st=clamp((fract(barkUV.xy*8.)-.06640625)/.8671875,0.,1.);
        // Texture was loaded by the original thicket renderer (vertical image
        // flip on upload). Its shoots stand upright; our longitudinal UV is X.
        vec2 shootUV=vec2(mod(cell,4.)+.032+.936*st.y,3.-floor(cell*.25)+.065+.91*st.x)*.25;
        // Isolate a true single terminal from each photographed balsam bough.
        // No opaque backing remains between the needle tips.
        if(cell>15.5){
          bool upright=cell>16.5;
          vec2 from=upright?vec2(242.,100.):vec2(182.,92.);
          vec2 to=upright?vec2(239.,10.):vec2(149.,10.);
          vec2 across=upright?vec2(21.,-1.):vec2(21.,-8.);
          vec2 source=(mix(from,to,st.x)+across*(2.*st.y-1.))/352.;
          shootUV=(vec2(upright?2.:0.,1.)+vec2(source.x,1.-source.y))*.25;
        }
        return texture2D(closeMaineShoots,shootUV);
      }
      #endif
      return texture2D(photo,atlas(.005859375));
    }
  `;
  window.aerieCloseTreeDetail={enrich,normalShader,colorShader,useShootPhoto};
})();
