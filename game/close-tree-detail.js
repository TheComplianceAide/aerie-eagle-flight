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
    const needleFamily = !damaged && ['fir','hemlock','spruce','pine','larch'].includes(family) ? family : null;
    const species=meta.id==='moosehead-mature'?formName:meta.species;
    const leafFamily=!damaged&&family==='broad' ? (/sugar maple/i.test(species)?'sugar-maple':/maple/i.test(species)?'maple':/birch/i.test(species)?'birch':null) : null;
    const fineSites=[];
    function terminalSite(origin,axis){
      fineSites.push(...origin.map(Math.round),...axis.map(x=>Math.round(x*8192)));
    }
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
      if(needleFamily && length>125 && (liveBalsam ? sourceTile>=16 : scaffoldSprays%2===0)){
        // Attach a young terminal slightly before the end of the same parent
        // shoot. Store only six signed shorts per site, shared by every tree
        // using this specimen. Geometry for the fine needles is instanced.
        const tip=add(start,d,length*(.71+.08*Math.sin(scaffoldSprays*.73)));
        terminalSite(tip,d);
      }
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
                  if(leafFamily)terminalSite(add(at,sub,leafLen*.78),sub);
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
    if(fineSites.length){
      const variant=needleFamily==='pine' && /white|stone/i.test(species) ? 'pine5' : (needleFamily||leafFamily);
      geom.userData.fineShootSites={family:variant,sites:Int16Array.from(fineSites)};
    }
    geom.userData.closeTreeDetail={forks:limbs,foliageTips:blades,photoBoughs,scaffoldBranches,scaffoldSprays,addedTriangles:(ix-idxCount)/3};
  }

  const normalShader = `
    #ifdef CLOSE_TREE_DETAIL
    // Luminance gradients follow the very same regional bark tile as its
    // color. Reconstruct surface slope in world space using its screen-space
    // tangent frame. Disable the relief progressively as a texel falls subpixel.
    if(barkUV.w<.5 && barkUV.z<40.){
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
    #ifdef CLOSE_NEEDLE_SHOOT
    uniform vec2 fineLeafTile;
    #endif
    #ifdef MAINE_SHOOT_DETAIL
    uniform sampler2D closeMaineShoots;
    uniform float closeMaineReady;
    #endif
    vec4 sampleCanopyColor(){
      #ifdef CLOSE_NEEDLE_SHOOT
      // Opaque tissue: the needle silhouette is defined entirely by its mesh.
      if(barkUV.z>47.5){
        vec2 leafUV=(fineLeafTile+.06640625+.8671875*clamp(barkUV.xy,0.,1.))*.125;
        vec3 pigment=texture2D(photo,leafUV).rgb;
        if(!gl_FrontFacing)pigment=mix(pigment,vec3(dot(pigment,vec3(.25,.57,.18))),.21)*vec3(1.05,1.13,1.09);
        return vec4(pigment,1.);
      }
      if(barkUV.z>46.5)return vec4(mix(vec3(.274,.143,.091),vec3(.42,.32,.151),barkUV.y),1.);
      if(barkUV.z<42.5){
        vec3 oldNeedle=vec3(.16,.247,.109), newNeedle=vec3(.398,.470,.188);
        vec3 upper=mix(oldNeedle,newNeedle,barkUV.y);
        vec3 lower=mix(vec3(.249,.336,.204),vec3(.443,.504,.299),barkUV.y);
        return vec4(mix(upper,lower,barkUV.x),1.);
      }
      if(barkUV.z>44.)return vec4(mix(vec3(.288,.161,.084),vec3(.47,.31,.144),barkUV.y),1.);
      return vec4(mix(vec3(.168,.129,.081),vec3(.332,.269,.135),barkUV.y),1.);
      #endif
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
  // The prototype is in metres. The photographed crown absorbs the young
  // shoots beyond the inspection radius, where a real needle is subpixel.
  function needlePrototype(T,family,variation){
    const xyz=[],normals=[],uv=[],surfaces=[],indices=[];
    let seed=(0x821d59a3+variation*1037+family.charCodeAt(0)*31)>>>0;
    const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
    const pine=family.startsWith('pine'), spruce=family==='spruce', larch=family==='larch', hemlock=family==='hemlock';
    let needles=0,leaves=0;
    function v(p,n,surface,underside,light){
      const i=xyz.length/3;xyz.push(...p);normals.push(...n);surfaces.push(surface);
      uv.push(8192*underside,8192*light);return i;
    }
    function face(a,b,c){
      const x=xyz[3*b]-xyz[3*a],y=xyz[3*b+1]-xyz[3*a+1],z=xyz[3*b+2]-xyz[3*a+2];
      const xx=xyz[3*c]-xyz[3*a],yy=xyz[3*c+1]-xyz[3*a+1],zz=xyz[3*c+2]-xyz[3*a+2];
      const flip=(y*zz-z*yy)*normals[3*a]+(z*xx-x*zz)*normals[3*a+1]+(x*yy-y*xx)*normals[3*a+2]<0;
      indices.push(a,flip?c:b,flip?b:c);
    }
    function stick(start,end,rootRadius,tipRadius,surface=43){
      const dir=unit(add(end,start,-1)),side=unit(cross(dir,Math.abs(dir[1])>.92?[1,0,0]:up)),n=cross(dir,side);
      const first=xyz.length/3;
      for(let j=0;j<5;j++){
        const angle=j*Math.PI*.4,norm=add(scale(side,Math.cos(angle)),n,Math.sin(angle));
        v(add(start,norm,rootRadius),norm,surface,0,.22+.17*random());
        v(add(end,norm,tipRadius),norm,surface,0,.63+.26*random());
      }
      for(let j=0;j<5;j++){
        const a=first+j*2,b=first+(j+1)%5*2;
        face(a,a+1,b);face(a+1,b+1,b);
      }
    }
    function needle(base,axis,sky,length,width,tint){
      const tipAxis=unit(axis),wide=unit(cross(tipAxis,sky)),normal=unit(cross(wide,tipAxis));
      const p=add(base,tipAxis,length*.44);
      const bow=hemlock?-.055:.035+random()*.078;
      const middle=add(p,normal,length*bow),tip=add(add(base,tipAxis,length),normal,length*bow*.5);
      const root=v(base,normal,42,.16,tint*.64);
      const end=v(tip,normal,42,.07,Math.min(1,tint+.18));
      // A spruce needle has a roughly quadrangular section. A fir or hemlock
      // blade has a dorsiventral section with lighter stomatal undersides.
      const thick=(spruce?.74:pine?.63:.28)*width;
      const ring=[
        v(add(middle,wide,-width),unit(add(normal,wide,-1.1)),42,.21,tint),
        v(add(middle,normal,thick),normal,42,.05,tint*.94),
        v(add(middle,wide,width),unit(add(normal,wide,1.1)),42,.21,tint),
        v(add(middle,normal,-thick),scale(normal,-1),42,hemlock||family==='fir'?.94:.38,tint)
      ];
      for(let j=0;j<4;j++){const a=ring[j],b=ring[(j+1)%4];face(root,a,b);face(b,a,end);}
      needles++;
    }
    function growth(start,dir,length,radius,vigor){
      const z=unit(dir),side=unit(cross(z,Math.abs(z[1])>.92?[1,0,0]:up)),sky=unit(cross(side,z));
      const curve=(random()-.30)*.11,lengthScale=pine?1.08:hemlock?.74:1;
      const at=t=>add(add(start,z,length*t),sky,curve*length*t*t);
      stick(start,at(.49),radius,radius*.57);stick(at(.49),at(1),radius*.57,radius*.18);
      // Leave short bare internodes. Neighbors share age and angle locally,
      // but the pitch and insertion sequence vary down each shoot.
      const nodes=Math.max(8,Math.round(length*(pine?63:larch?71:spruce?159:202)));
      const phase=random()*2*Math.PI, lean=(random()-.5)*.33;
      for(let j=0;j<nodes;j++){
        if(j>2 && j<nodes-2 && random()<.07)continue;
        const t=.07+.86*(j+.45*random())/nodes;
        const axisPoint=at(t),age=vigor*.44+t*.39+.07*random();
        const tier=pine?(family==='pine5'?5:3):larch?8:1;
        const turn=phase+j*(spruce||pine||larch?2.399963:Math.PI);
        const branchSide=scale(side,j%2?1:-1);
        const meridian=spruce||pine||larch ? add(scale(side,Math.cos(turn)),sky,Math.sin(turn)) : branchSide;
        const base=add(axisPoint,meridian,radius*(1-t*.74));
        for(let k=0;k<tier;k++){
          let radial;
          if(larch){const a=turn+k*2*Math.PI/tier;radial=add(scale(side,Math.cos(a)),sky,Math.sin(a));}
          else if(pine){const a=(k/tier-.5)*1.35+turn;radial=add(scale(side,Math.cos(a)),sky,Math.sin(a));}
          else if(spruce){radial=meridian;}
          else {radial=add(branchSide,sky,lean+.48*Math.sin(j*.61+phase)+.52*vigor);}
          const d=unit(add(radial,z,(pine?.70:larch?.39:.17)+random()*.36+t*.18));
          const mm=pine?(family==='pine5'?59:66):spruce?12:hemlock?10:larch?18:17;
          const len=.001*mm*lengthScale*(.79+random()*.47)*(1-.25*t+.22*vigor);
          const w=(pine?.00058:larch?.00058:spruce?.00080:hemlock?.00086:.00105)*(.86+.26*random());
          needle(base,d,sky,len,w,age);
        }
      }
      const bud=at(1),cap=add(bud,z,(pine?.010:.006)*(.84+.23*random()));
      stick(add(bud,z,-.003),cap,pine?.0031:.0024,.00025,45);
      return at;
    }
    function leafShoot(){
      const maple=family!=='birch',sugar=family==='sugar-maple';
      const reach=maple?.31:.235;
      const leader=unit([.11,maple?.25:.04,1]);
      const at=t=>add(scale(leader,t*reach),up,.10*reach*t*t);
      stick(at(0),at(.48),.0032,.0021);stick(at(.48),at(1),.0021,.0008);
      const tip=at(1);
      stick(tip,add(tip,leader,.007),.003,.0003,45);
      // Angles are measured away from the central lobe. Maple sinuses and
      // multiple veins radiate from one blade, rather than from a twig.
      const contour=maple ? (sugar?[[0,1],[10,.63],[18,.64],[22,.43],[36,.80],[43,.75],[52,.53],[58,.36],[76,.63],[88,.53],[98,.32],[116,.37],[133,.22],[154,.17],[180,.24]]
                                    :[[0,1],[10,.72],[18,.74],[25,.49],[35,.87],[42,.78],[50,.69],[57,.48],[65,.59],[76,.40],[92,.36],[108,.37],[134,.25],[158,.18],[180,.22]])
                          :[[0,1],[13,.72],[24,.66],[37,.63],[53,.57],[72,.48],[88,.40],[106,.33],[128,.26],[151,.20],[180,.24]];
      function leafBlade(origin,direction,sky,size,tint){
        const z=unit(direction),x=unit(cross(z,sky)),y=cross(x,z);
        const hub=add(origin,z,size*.23),center=v(add(hub,y,size*.018),y,48,.23,.5);
        const edge=[];
        const angles=[...contour.slice(0,-1),...contour.slice(1).reverse().map(([a,r])=>[360-a,r])];
        // Mid-vein and side veins lift the inner section. The outer third
        // drapes independently and curls slightly along the free margin.
        for(let j=0;j<angles.length;j++){
          const [degrees,r]=angles[j],angle=degrees*Math.PI/180;
          const radius=r*size*.77, vx=Math.sin(angle)*radius*(maple?.92:.59);
          const vz=Math.cos(angle)*radius;
          const sx=vx/size,sz=vz/size;
          const rim=add(add(hub,x,vx),z,vz);
          const curl=size*(.035*sz-.14*Math.abs(sx)-.065*sz*sz+.029*Math.sin(3*angle+tint));
          const far=add(rim,y,curl), inside=add(add(hub,add(rim,hub,-1),.47),y,.035*size-.16*size*Math.abs(sx)*.11);
          const n=unit(add(add(y,x,.18*Math.sin(angle)),z,.05*sz));
          const tex=(p,q)=>[Math.max(0,Math.min(1,.23+p)),Math.max(0,Math.min(1,.5+q/(maple?1.03:.72)))];
          const [u,w]=tex(sz,sx),[iu,iw]=tex(.47*sz,.47*sx);
          const inner=v(inside,n,48,iu,iw), outer=v(far,n,48,u,w);
          edge.push([inner,outer]);
          if(!maple){
            // Double serrations belong on a birch margin. Each tooth has
            // its own projected edge when sunlight shows through the blade.
            const [nextA,nextR]=angles[(j+1)%angles.length];
            const a2=nextA*Math.PI/180,nx=Math.sin(a2)*nextR*.77*.59,nz=Math.cos(a2)*nextR*.77;
            const bx=.45*sx+.55*nx,bz=.45*sz+.55*nz;
            const tooth=add(add(add(hub,x,bx*size*1.07),z,(bz+.015)*size),y,curl);
            const [tu,tw]=tex(bz,bx);
            edge.push([inner,v(tooth,n,48,tu,tw)]);
          }
        }
        for(let j=0;j<edge.length;j++){
          const [inner,a]=edge[j],[nextInner,b]=edge[(j+1)%edge.length];
          if(inner!==nextInner){face(center,inner,nextInner);face(a,nextInner,inner);}
          face(a,b,nextInner);
        }
        leaves++;
      }
      const sets=maple?4:8,phase=(variation?.55:-.27)+.20*random();
      for(let j=0;j<sets;j++){
        const along=.08+.80*(j+.23*random())/sets;
        const height=at(along);
        for(let k=0;k<(maple?2:1);k++){
          const angle=phase+(maple?j*Math.PI*.5+k*Math.PI:j*2.4)+.20*(random()-.5);
          const radial=[Math.cos(angle),.37*Math.sin(angle),Math.sin(angle)];
          const bladeDir=unit(add(radial,leader,(maple?.41:.68)+random()*.37));
          const normal=unit(add(up,radial,(random()-.5)*1.35));
          const petiole=(maple?.045:.018)*(.73+.54*random());
          const end=add(height,unit(add(bladeDir,up,.40)),petiole);
          stick(height,end,maple?.00112:.00077,maple?.00089:.00052,47);
          leafBlade(end,bladeDir,normal,(maple?.096:.065)*(.77+.39*random())*(1-.30*along),along);
        }
      }
    }

    if(family==='maple'||family==='sugar-maple'||family==='birch'){
      leafShoot();
    }else{
    const length=(hemlock?.125:pine?.175:.155)*(.97+.09*random());
    const leader=growth([0,0,0],[.08,.16,1],length,.0027,.32);
    for(let j=0;j<3;j++){
      const hand=j%2?1:-1,along=.33+.20*j;
      const dir=unit([hand*(.62+.32*random()),(hemlock?-.34:.18)+.27*random(),.69]);
      growth(leader(along),dir,length*(.76-.095*j)*(.89+.20*random()),.0019,.55+.12*j);
    }
    growth(leader(1),unit([.11,.29,1]),length*.63,.0018,.88);
    }
    const geo=new T.BufferGeometry();
    geo.setAttribute('position',new T.Float32BufferAttribute(xyz,3));
    geo.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
    geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    geo.setAttribute('surface',new T.Uint8BufferAttribute(surfaces,1));
    geo.setIndex(indices);
    return {geo,needles,leaves,triangles:indices.length/3};
  }

  function makeShootPass(T,parent,mobile){
    const limit=mobile?64:144, radius=mobile?5.5:7.8;
    const templates=new Map(),groups=new Map(),candidates=[];
    const eye={x:0,y:0,z:0};
    let epoch=0;
    function begin(position){
      epoch++;candidates.length=0;
      eye.x=position.x;eye.y=position.y;eye.z=position.z;
      for(const g of groups.values())g.used=0;
    }
    function collect(group,tree,record,opacity){
      const data=group.g?.userData.fineShootSites;
      if(!data||opacity<.12)return;
      const native=group.mesh.material.uniforms.nativeRadius.value[0];
      const width=tree.h*Math.min(1.65,Math.max(.24,tree.env[13]/255*1.7/Math.max(.1,native)));
      const yaw=tree.seed%104729/104729*Math.PI*2,c=Math.cos(yaw),s=Math.sin(yaw);
      const dx=eye.x-tree.x,dz=eye.z-tree.z,lx=dx*c+dz*s,lz=-dx*s+dz*c,ly=eye.y-tree.y;
      if(Math.hypot(lx,lz)>width*1.05+radius || ly < -radius || ly>tree.h+radius)return;
      const site=data.sites,unit=1/22000,xx=width*unit,yy=tree.h*unit,r2=radius*radius;
      for(let i=0;i<site.length;i+=6){
        const x=site[i]*xx-lx,y=site[i+1]*yy-ly,z=site[i+2]*xx-lz;
        const d=x*x+y*y+z*z;
        if(d>=r2)continue;
        // Stable per-shoot priority avoids shuffling an entire branch of detail
        // during a bank or turn. Only the closest smooth transition zone competes.
        const salt=Math.imul((i+11)^tree.seed,0x9e3779b1)>>>0;
        const score=d*(.90+.10*(salt>>>24)/255);
        candidates.push({group,tree,record,opacity,width,yaw,site,i,family:data.family,score,salt});
      }
    }
    function templateFor(site){
      const variation=site.salt>>>31, id=site.family+'/'+variation;
      let proto=templates.get(id);
      if(!proto){proto=needlePrototype(T,site.family,variation);templates.set(id,proto);}
      return proto;
    }
    function groupFor(site){
      const variation=site.salt>>>31,key=site.group.g.uuid+'/'+variation;
      let g=groups.get(key);
      if(g)return g;
      const proto=templateFor(site);
      const geo=new T.InstancedBufferGeometry();
      for(const [name,attr] of Object.entries(proto.geo.attributes))geo.setAttribute(name,attr);
      geo.setIndex(proto.geo.index);
      for(const [name,components] of Object.entries({anchor:3,traits:4,tone:4,coverageLow:1,shootOrigin:3,shootForward:4,shootSide:3})){
        geo.setAttribute(name,new T.InstancedBufferAttribute(new Float32Array(limit*components),components).setUsage(T.DynamicDrawUsage));
      }
      const original=site.group.mesh.material;
      const material=new T.ShaderMaterial({side:T.DoubleSide,defines:{...original.defines,CLOSE_NEEDLE_SHOOT:1},
        vertexShader:original.vertexShader,fragmentShader:original.fragmentShader,uniforms:{...original.uniforms,
        fineLeafTile:{value:new T.Vector2((site.group.mesh.userData.aerieRegional.cell%4)*2+1,Math.floor(site.group.mesh.userData.aerieRegional.cell/4)*2+1)}}});
      const mesh=new T.Mesh(geo,material);
      mesh.name=(proto.leaves?'Individual leaves · ':'Individual needles · ')+site.family;mesh.frustumCulled=false;mesh.visible=false;
      const tag={family:site.family,variation};
      mesh.userData.aerieFineShoot=tag;
      if(proto.leaves)mesh.userData.aerieFineLeaves=tag;else mesh.userData.aerieFineNeedles=tag;
      parent.add(mesh);
      g={mesh,geo,material,proto,used:0,epoch};groups.set(key,g);return g;
    }
    function release(g){g.mesh.removeFromParent();g.geo.dispose();g.material.dispose();}
    function finish(){
      candidates.sort((a,b)=>a.score-b.score||a.salt-b.salt);
      let count=0,cost=0;
      const triangleBudget=mobile?46000:108000;
      for(const site of candidates){
        const triangles=templateFor(site).triangles;
        if(count===limit||cost+triangles>triangleBudget)break;
        count++;cost+=triangles;
      }
      const clip=count<candidates.length?candidates[count].score:radius*radius;
      let needles=0,leaves=0,triangles=0,draws=0,shoots=0;
      for(let i=0;i<count;i++){
        const v=candidates[i],fade=Math.min(1,(clip-v.score)/Math.max(.18,.34*clip));
        if(fade<.025)continue;
        const g=groupFor(v),a=g.geo.attributes,n=g.used++,data=v.site,k=v.i,t=v.tree;
        const dir=unit([data[k+3]*v.width,data[k+4]*t.h,data[k+5]*v.width]);
        const side=unit(cross(dir,Math.abs(dir[1])>.90?[1,0,0]:up)),normal=cross(dir,side);
        const roll=((v.salt>>>8)%1741/1741-.50)*(v.family==='spruce'?2.4:1.22);
        const rolled=add(scale(side,Math.cos(roll)),normal,Math.sin(roll));
        const age=.76+.47*((v.salt&255)/255);
        const size=age*fade;
        a.anchor.setXYZ(n,t.x,t.y,t.z);a.traits.setXYZW(n,t.h,v.yaw,v.record,v.opacity);
        a.tone.setXYZW(n,t.color[0],t.color[1],t.color[2],t.leafTone);
        a.shootOrigin.setXYZ(n,data[k]/22000,data[k+1]/22000,data[k+2]/22000);
        a.shootForward.setXYZW(n,dir[0],dir[1],dir[2],size);a.shootSide.setXYZ(n,...rolled);
        g.epoch=epoch;needles+=g.proto.needles;leaves+=g.proto.leaves;triangles+=g.proto.triangles;shoots++;
      }
      for(const [key,g] of groups){
        if(epoch-g.epoch>28){release(g);groups.delete(key);continue;}
        g.geo.instanceCount=g.used;g.mesh.visible=g.used>0;
        if(!g.used)continue;
        draws++;
        for(const name of ['anchor','traits','tone','shootOrigin','shootForward','shootSide']){
          const attr=g.geo.attributes[name];attr.clearUpdateRanges?.();attr.addUpdateRange?.(0,g.used*attr.itemSize);attr.needsUpdate=true;
        }
      }
      return {fineShootClusters:shoots,fineNeedles:needles,fineLeaves:leaves,fineShootTriangles:triangles,fineShootDraws:draws};
    }
    function dispose(){
      for(const g of groups.values())release(g);
      for(const p of templates.values())p.geo.dispose();
      groups.clear();templates.clear();candidates.length=0;
    }
    return {begin,collect,finish,dispose};
  }

  const shootAttributes=`
    #ifdef CLOSE_NEEDLE_SHOOT
    attribute vec3 shootOrigin;
    attribute vec4 shootForward;
    attribute vec3 shootSide;
    #endif
  `;
  const shootTransform=`
    #ifdef CLOSE_NEEDLE_SHOOT
    mat3 shootFrame=mat3(shootSide,normalize(cross(shootForward.xyz,shootSide)),shootForward.xyz);
    vec3 treeScale=vec3(width,traits.x,width);
    localMetres=shootOrigin*treeScale+shootFrame*position*shootForward.w;
    localPosition=localMetres/treeScale;
    h=clamp(localPosition.y,0.,1.);
    vec3 metricNormal=shootFrame*normal;
    sourceNormal=normalize(metricNormal*vec3(1.,traits.x/max(.001,width),1.));
    #endif
  `;
  window.aerieCloseTreeDetail={enrich,normalShader,colorShader,useShootPhoto,shootAttributes,shootTransform,makeShootPass};
})();
