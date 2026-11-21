// Steep Creek's lake-relative heights are metres. The NOAA points distinguish
// the three raised viewing decks and the upstream crossing from the ground trail.
window.makeSteepCreekSurvey = function makeSteepCreekSurvey() {
  const survey = window.aerieSteepCreekSurvey;
  const [left, north, right, south] = survey.rect;
  const columns = right - left + 1;
  function bytes(text) {
    return Uint8Array.from(atob(text), ch => ch.charCodeAt(0));
  }
  const ground = new Int16Array(bytes(survey.dem).buffer);
  const stage = new Int16Array(bytes(survey.surface).buffer);
  const depth = new Int8Array(bytes(survey.depth).buffer);
  const openGround = bytes(survey.openGround), pavement = bytes(survey.paving);
  function fieldFlag(bits,x,z) {
    const i=Math.round(z-north)*columns+Math.round(x-left);
    return boundary(x,z)>2 && !!(bits[i>>3] & (1<<(i&7)));
  }
  function isPaved(x,z) { return fieldFlag(pavement,x,z); }
  function boundary(x, z) {
    return Math.min(x - left, right - x, z - north, south - z);
  }
  function sample(grid, x, z) {
    const u = Math.max(0, Math.min(right - left - .00001, x - left));
    const v = Math.max(0, Math.min(south - north - .00001, z - north));
    const i = Math.floor(u), j = Math.floor(v), a = j * columns + i;
    const s = u - i, t = v - j;
    return .01 * ((1 - t) * (grid[a] + s * (grid[a + 1] - grid[a])) +
      t * (grid[a + columns] + s * (grid[a + columns + 1] - grid[a + columns])));
  }
  const herbCover=bytes(survey.herbs);
  function addGroundPlants(plants,x0,z0,size,records) {
    if(x0+size<=left||z0+size<=north||x0>=right||z0>=south)return;
    let kept=0;
    for(const plant of plants)if(!contains(plant[0],plant[2]))plants[kept++]=plant;
    plants.length=kept;
    let seed=(Math.imul(x0,10007)^Math.imul(z0,84719))>>>0;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const standHeight=[.40,.56,.24,.54,.51,.66];
    for(let dz=0;dz<size;dz+=1.75)for(let dx=0;dx<size;dx+=1.75){
      const x=x0+dx+(.18+.62*random())*1.75,z=z0+dz+(.18+.62*random())*1.75;
      if(!contains(x,z))continue;
      const i=Math.round(z-north)*columns+Math.round(x-left);
      const cover=(herbCover[i>>2]>>(2*(i&3)))&3;
      if(!cover||random()>[0,.17,.53,.91][cover]||managed(x,z))continue;
      const v=random(),kind=v<.27?0:v<.54?1:v<.67?2:v<.84?3:v<.94?4:5;
      const height=standHeight[kind]*(.67+.62*random())*(.82+.08*cover);
      plants.push([x,sample(ground,x,z)-.018,z,height,6.283*random(),random(),kind,records[kind].span]);
    }
  }
  function contains(x, z) { return boundary(x, z) > 4; }
  function height(x, z, base) {
    const edge = boundary(x, z);
    if (edge <= 0) return base;
    const f = Math.min(1, edge / 12);
    return base + (sample(ground, x, z) - base) * f * f * (3 - 2 * f);
  }
  function waterAt(x, z) {
    if (boundary(x, z) < 2 || sample(depth, x, z) < .012) return -Infinity;
    return sample(stage, x, z);
  }
  function holdingDepth(x, z) {
    const y=waterAt(x,z);
    return Number.isFinite(y)?Math.max(0,y-sample(ground,x,z)):0;
  }
  // A modest estimated current is independent of the fish's own effort. Deep
  // holding pockets carry less current than the adjacent shallow riffles.
  function current(x,z) {
    const depth=holdingDepth(x,z);
    return .14+.19*Math.max(0,1-Math.min(1,depth/.85));
  }
  function upstream(x, z) {
    let closest=Infinity,heading=0;
    const stations=survey.stations;
    for(let i=0;i+1<stations.length;i++){
      const a=stations[i],b=stations[i+1],mx=(a[0]+b[0])*.5,mz=(a[1]+b[1])*.5;
      const d=(x-mx)**2+(z-mz)**2;
      if(d<closest){closest=d;heading=Math.atan2(b[1]-a[1],b[0]-a[0]);}
    }
    return heading;
  }
  const decks = survey.decks.map(d => ({...d,
    bounds:[Math.min(...d.outline.map(p => p[0])), Math.min(...d.outline.map(p => p[1])),
      Math.max(...d.outline.map(p => p[0])), Math.max(...d.outline.map(p => p[1]))]}));
  function isInside(x, z, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[j];
      if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
    }
    return inside;
  }
  const ramp = survey.ramp.map(([x,z,y],i) => {
    const a=survey.ramp[Math.max(0,i-1)],b=survey.ramp[Math.min(survey.ramp.length-1,i+1)];
    const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz)||1.;
    return [x,z,y,x+dz/len*2.32,z-dx/len*2.32];
  });
  function rampAt(x,z) {
    if(x< -97||x> -78||z<1913||z>1945)return -Infinity;
    for(let i=0;i+1<ramp.length;i++){
      const a=ramp[i],b=ramp[i+1],dz=b[1]-a[1],dx=b[0]-a[0];
      if(!isInside(x,z,[[a[0],a[1]],[b[0],b[1]],[b[3],b[4]],[a[3],a[4]]]))continue;
      const u=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
      return a[2]+(b[2]-a[2])*u;
    }
    return -Infinity;
  }
  // Reuse the emitted car faces so a landing matches the actual hood or roof.
  const parkedCars = [];
  function vehicleHeight(x,z) {
    if (x < -67 || x > -21 || z < 1874 || z > 1977) return -Infinity;
    let top=-Infinity;
    for (const body of parkedCars) {
      if(Math.abs(x-body.x)>3.4 || Math.abs(z-body.z)>3.4) continue;
      for (const [a,b,c,area] of body.faces) {
        const u=((x-a[0])*(c[2]-a[2])-(z-a[2])*(c[0]-a[0]))/area;
        const v=((b[0]-a[0])*(z-a[2])-(b[2]-a[2])*(x-a[0]))/area;
        if(u>=0&&v>=0&&u+v<=1)top=Math.max(top,a[1]+u*(b[1]-a[1])+v*(c[1]-a[1]));
      }
    }
    return top;
  }
  function structureHeight(x, z, altitude) {
    const roof=vehicleHeight(x,z);
    if(Number.isFinite(roof))return roof;
    if (x < -173 || x > -31 || z < 1872 || z > 2024) return -Infinity;
    const incline=rampAt(x,z);
    if(Number.isFinite(incline))return incline;
    for (const d of decks) {
      const [x0, z0, x1, z1] = d.bounds;
      if (x < x0 || x > x1 || z < z0 || z > z1 || !isInside(x, z, d.outline)) continue;
      if (Number.isFinite(altitude) && altitude < d.level - .49) return -Infinity;
      return d.level;
    }
    return -Infinity;
  }
  function managed(x, z) {
    if (!contains(x, z)) return false;
    return fieldFlag(openGround,x,z) || Number.isFinite(waterAt(x, z)) || Number.isFinite(structureHeight(x, z));
  }
  function shade(source) {
    const needle = 'float viewSky=mix(1.,relief.b,surveyed);';
    if (!source.includes(needle)) throw Error('Steep Creek terrain shader missing light stage');
    return source.replace(needle, `
      vec2 field=p.xz-vec2(-228.,1748.);
      float edge=min(min(field.x, 215.-field.x),min(field.y,292.-field.y));
      if(edge>0.){
        vec2 uv=clamp((field+vec2(.5))/vec2(216.,293.),.001,.999);
        vec4 site=texture2D(crevasseSurvey,vec2(uv.x,1.-uv.y));
        vec3 observed=site.rgb;
        if(d<245.){
          vec2 ua,ub;float iw;fieldCoordinates(p.xz,ua,ub,iw);
          float path=smoothstep(.61,.72,site.a),road=smoothstep(.85,.96,site.a);
          float bed=smoothstep(.27,.43,site.a)*(1.-smoothstep(.58,.70,site.a));
          float fern=smoothstep(.045,.17,site.a)*(1.-smoothstep(.31,.44,site.a));
          vec3 litter=fieldBlend(groundScan,ua*.40,ub*.40,iw,2.).rgb;
          float lush=smoothstep(.006,.085,observed.g-.61*observed.r-.39*observed.b);
          vec3 turf=fieldBlend(groundScan,ua*.46,ub*.46,iw,14.).rgb;
          turf=mix(turf*vec3(1.12,1.,1.17),turf*vec3(1.02,1.12,1.12),lush);
          vec3 gravel=fieldBlend(groundScan,ua*.79,ub*.79,iw,3.).rgb;
          vec3 chips=fieldBlend(groundScan,ua*1.29,ub*1.29,iw,5.).rgb;
          vec3 detail=mix(mix(litter,turf,clamp(fern*(.34+.64*lush)+.25*lush,0.,.94)),gravel,bed);
          detail=mix(detail,mix(gravel,chips,.42),path);
          float luminosity=dot(observed,vec3(.25,.58,.17));
          vec3 organic=mix(observed*.46,detail*.94,.73)*clamp(.72+luminosity, .69,1.21);
          vec3 stone=mix(observed*.61,detail*.95,.70)*clamp(.73+luminosity,.73,1.24);
          vec3 asphalt=observed*(.67+.60*dot(chips,vec3(.25,.59,.16)));
          vec3 closeColor=mix(mix(organic,stone,max(bed,path)),asphalt,road);
          observed=mix(observed,closeColor,1.-smoothstep(90.,245.,d));
        }
        base=mix(base,observed,smoothstep(0.,12.,edge)*.98);
      }
      ` + needle);
  }
  function add(T, scene, {texture, clock, sky, sun}) {
    const group = new T.Group();
    group.name = 'Steep Creek · surveyed salmon viewing trail';
    scene.add(group);
    // Pool margins intersect the measured floodplain. No general lake texture
    // extends across dry trails, viewing structures or the rocky side bars.
    const waterVertices = [], waterTraits = [], waterIndices = [];
    const wetVertices = new Map();
    function point(i, j) {
      const k = j * columns + i;
      return {x:left+i, z:north+j, h:stage[k]*.01, d:depth[k]*.01};
    }
    function clip(a, b) {
      const q = (.012-a.d)/(b.d-a.d);
      const dryStageMissing = a.h === 0 || b.h === 0;
      return {x:a.x+(b.x-a.x)*q, z:a.z+(b.z-a.z)*q,
        h:dryStageMissing ? Math.max(a.h,b.h) : a.h+(b.h-a.h)*q, d:.012};
    }
    function vertex(p) {
      const key = Math.round((p.x-left)*2048)*1048576 + Math.round((p.z-north)*2048);
      if (wetVertices.has(key)) return wetVertices.get(key);
      const i = waterVertices.length/3;
      wetVertices.set(key,i);
      waterVertices.push(p.x,p.h+.016,p.z);
      waterTraits.push(p.d);
      return i;
    }
    function triangle(a,b,c) {
      const polygon=[];
      for (const [p,q] of [[a,b],[b,c],[c,a]]) {
        if (p.d>=.012) polygon.push(p);
        if ((p.d>=.012)!==(q.d>=.012)) polygon.push(clip(p,q));
      }
      if (polygon.length<3) return;
      const ids=polygon.map(vertex);
      for(let i=1;i+1<ids.length;i++) waterIndices.push(ids[0],ids[i],ids[i+1]);
    }
    for(let j=1;j<south-north-1;j++) for(let i=1;i<right-left-1;i++) {
      const k=j*columns+i;
      if(Math.max(depth[k],depth[k+1],depth[k+columns],depth[k+columns+1])<2)continue;
      const a=point(i,j),b=point(i+1,j),c=point(i,j+1),d=point(i+1,j+1);
      triangle(a,c,b);triangle(c,d,b);
    }
    const waterGeometry=new T.BufferGeometry();
    waterGeometry.setAttribute('position',new T.Float32BufferAttribute(waterVertices,3));
    waterGeometry.setAttribute('waterDepth',new T.Float32BufferAttribute(waterTraits,1));
    waterGeometry.setIndex(waterIndices);
    const waterMaterial=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.FrontSide,
      uniforms:{clock,sky:{value:sky},sun:{value:sun},gravel:{value:texture('shore-cobble.webp',true)},
        field:{value:texture('alaska-steep-habitat.webp')},waves:{value:texture('waternormals.jpg',true)}},
      vertexShader:`attribute float waterDepth;varying vec3 wp;varying float wet;
        void main(){wp=position;wet=waterDepth;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`uniform sampler2D gravel,sky,field,waves;uniform vec3 sun;uniform float clock;varying vec3 wp;varying float wet;
        void main(){vec2 wind=vec2(.024,-.053)*clock;
          vec3 bump=texture2D(waves,wp.xz*.093+wind*.21).rgb+texture2D(waves,wp.xz*.22-wind*.31).rgb-1.;
          vec2 drift=vec2(sin(1.6*wp.z+.74*wp.x+clock*1.8),cos(wp.x*2.1-wp.z*.88+clock*2.4))*.011;
          vec3 n=normalize(vec3(bump.x*.081+drift.x,1.,bump.y*.075+drift.y));
          vec3 view=normalize(cameraPosition-wp),refl=reflect(-view,n);
          vec2 sk=vec2(.5+atan(refl.z,refl.x)/6.2831853,.5+asin(clamp(refl.y,-1.,1.))/3.14159);
          vec3 light=texture2D(sky,sk).rgb;vec2 landUV=(wp.xz+vec2(228.,-1748.)+refl.xz*(5.+8.*wet))/vec2(215.,292.);
          vec3 leaves=texture2D(field,vec2(landUV.x,1.-landUV.y)).rgb*vec3(.54,.70,.59);
          light=mix(leaves,light,.15+.85*smoothstep(-.05,.43,refl.y));
          float fres=.11+.83*pow(1.-max(0.,dot(view,n)),2.35);
          vec2 parallax=view.xz*min(wet,.9)/max(.27,view.y)*.29+bump.xy*.058;
          vec3 cob=texture2D(gravel,wp.xz*.43+parallax).rgb;
          float mineral=dot(cob,vec3(.27,.55,.18));
          vec3 bed=mix(vec3(.15,.16,.115),vec3(.55,.51,.38),mineral);
          vec3 transmission=exp(-vec3(1.9,.90,1.40)*wet);
          vec3 color=mix(vec3(.088,.184,.141),bed,transmission)*(.65+.27*mineral);
          float shoaling=(1.-smoothstep(.04,.56,wet))*smoothstep(.015,.12,wet);
          float ridges=.5+.5*cos(18.*wp.x+7.4*wp.z-4.9*clock+1.4*sin(3.3*wp.z+clock)+2.8*bump.x);
          color+=vec3(.125,.120,.083)*shoaling*pow(ridges,12.)*(.42+.58*mineral);
          color=mix(color,light,fres);
          color+=vec3(1.,.79,.49)*pow(max(0.,dot(refl,sun)),110.)*.53;
          gl_FragColor=vec4(color,clamp(.50+.31*fres+.19*smoothstep(.025,.44,wet),.38,.94));
        }`});
    const water=new T.Mesh(waterGeometry,waterMaterial);
    water.name='Steep Creek · spawning channel and impounded pools';water.renderOrder=5;group.add(water);

    // The actual decks use open-grid walking surfaces, timber edge beams,
    // round steel foundation piles, pale top rails, and galvanized wire infill.
    const positions=[],colors=[],uvs=[],types=[];
    const asColor=c=>c?.isColor?c:new T.Color(c);
    function tri(a,b,c,color,kind,uv) {
      const shades=Array.isArray(color)?color.map(asColor):[asColor(color),asColor(color),asColor(color)];
      [a,b,c].forEach((p,i)=>{positions.push(...p);colors.push(shades[i].r,shades[i].g,shades[i].b);uvs.push(...(uv?.[i]||[0,0]));types.push(kind);});
    }
    function face(p,q,r,s,color,kind=0,uv=[[0,0],[1,0],[1,1],[0,1]]){
      tri(p,q,r,color,kind,uv.slice(0,3));tri(p,r,s,color,kind,[uv[0],uv[2],uv[3]]);
    }
    function beam(ax,az,bx,bz,y0,y1,depth,width,tint) {
      const dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz)||1,nx=-dz/len*width*.5,nz=dx/len*width*.5;
      const a=[ax+nx,y0,az+nz],b=[bx+nx,y1,bz+nz],c=[bx-nx,y1,bz-nz],d=[ax-nx,y0,az-nz];
      const e=[a[0],y0-depth,a[2]],f=[b[0],y1-depth,b[2]],g=[c[0],y1-depth,c[2]],h=[d[0],y0-depth,d[2]];
      const uv=[[0,0],[len,0],[len,depth],[0,depth]];
      face(a,b,c,d,tint,1,[[0,0],[len,0],[len,width],[0,width]]);
      face(b,a,e,f,tint,1,uv);face(c,b,f,g,tint,1,uv);face(d,c,g,h,tint,1,uv);face(a,d,h,e,tint,1,uv);face(h,g,f,e,tint,1,uv);
    }
    const gates=[[-169,1890],[-81,1913],[-87,1947],[-86,1958],[-75.8,2020],[-90.4,2014],[-36.5,1995],[-35.7,2003]];
    for(const deck of decks) {
      const outline=deck.outline,y=deck.level,rail=deck.rail,outline2D=outline.map(([x,z])=>new T.Vector2(x,z));
      for(const idx of T.ShapeUtils.triangulateShape(outline2D,[])){
        const pts=idx.map(i=>outline[i]);tri(...pts.map(([x,z])=>[x,y,z]),0x93978f,2,pts);
      }
      // Rail studs and supports have real vertical dimensions independent of the canopy.
      let run=0;
      for(let i=0;i<outline.length;i++){
        const [ax,az]=outline[i],[bx,bz]=outline[(i+1)%outline.length];
        const dx=bx-ax,dz=bz-az,D=Math.hypot(dx,dz);if(D<.1)continue;
        beam(ax,az,bx,bz,y-.025,y-.025,.24,.135,0x784829);
        if(gates.some(([x,z])=>Math.hypot(.5*(ax+bx)-x,.5*(az+bz)-z)<1.7))continue;
        beam(ax,az,bx,bz,y+rail,y+rail,.078,.13,0xaa9b7c);
        beam(ax,az,bx,bz,y+.19,y+.19,.078,.066,0x8c795f);
        face([ax,y+.16,az],[bx,y+.16,bz],[bx,y+rail-.055,bz],[ax,y+rail-.055,az],0x8e9690,3,[[run,0],[run+D,0],[run+D,rail-.215],[run,rail-.215]]);
        const n=Math.max(1,Math.ceil(D/2.33));for(let j=0;j<n;j++){
          const x=ax+dx*j/n,z=az+dz*j/n,edge=.11;
          beam(x-edge*.5,z,x+edge*.5,z,y+rail-.04,y+rail-.04,rail+.14,edge,0x8d7960);
          if((i+j)%3===0){
            const foot=Math.min(y-.31,sample(ground,x,z)-.08);
            beam(x-.051,z,x+.051,z,y-.20,y-.20,y-.20-foot,.102,0x4a514d);
          }
        }
        run+=D;
      }
    }
    let handrailDistance=0;
    for(let i=0;i+1<ramp.length;i++){
      const a=ramp[i],b=ramp[i+1],ay=a[2]+.018,by=b[2]+.018;
      const left=[a[0],ay,a[1]],right=[a[3],ay-.025,a[4]],leftB=[b[0],by,b[1]],rightB=[b[3],by-.025,b[4]];
      face(left,right,rightB,leftB,0x625f54,4,[a.slice(0,2),a.slice(3),b.slice(3),b.slice(0,2)]);
      // Landward ties butt against the original grade. The lower creek side
      // retains the vertical timber fascia and visible foundation posts.
      beam(a[0],a[1],b[0],b[1],ay-.015,by-.015,.20,.14,0x6d4b34);
      beam(a[0],a[1],b[0],b[1],ay+1.08,by+1.08,.083,.14,0xb2a48a);
      beam(a[0],a[1],b[0],b[1],ay+.18,by+.18,.076,.075,0x927d64);
      const len=Math.hypot(b[0]-a[0],b[1]-a[1]);
      face([a[0],ay+.18,a[1]],[b[0],by+.18,b[1]],[b[0],by+1.02,b[1]],[a[0],ay+1.02,a[1]],
        0x89968d,3,[[handrailDistance,0],[handrailDistance+len,0],[handrailDistance+len,.84],[handrailDistance,.84]]);
      beam(a[0]-.056,a[1],a[0]+.056,a[1],ay+1.035,ay+1.035,1.18,.112,0x9c8c71);
      const g=sample(ground,a[0],a[1]);
      if(ay-g>.27)beam(a[0]-.048,a[1],a[0]+.048,a[1],ay-.11,ay-.11,ay-g+.1,.096,0x444c46);
      handrailDistance+=len;
    }
    if(window.makeSurveyCarEmitter){
      let body;
      const car=window.makeSurveyCarEmitter(T,(kind,color,points)=>{
        const c=Array.isArray(color)?color[0]:color;
        for(let i=1;i+1<points.length;i++) {
          const a=points[0],b=points[i],d=points[i+1];
          tri(a,b,d,c,0);
          const area=(b[0]-a[0])*(d[2]-a[2])-(b[2]-a[2])*(d[0]-a[0]);
          if(Math.abs(area)>.003)body.faces.push([a,b,d,area]);
        }
      });
      survey.cars.forEach(([x,z,yaw,len],i)=>{
        body={x,z,faces:[]};parkedCars.push(body);
        const cs=Math.cos(yaw),sn=Math.sin(yaw),y=sample(ground,x,z);
        car((u,v,h)=>[x+cs*u-sn*v,y+h,z+sn*u+cs*v],i%3===0?'suv':'sedan',i,Math.max(.82,Math.min(1.06,len/4.5)));
      });
    }
    const structures=new T.BufferGeometry();
    structures.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    structures.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    structures.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
    structures.setAttribute('surfaceKind',new T.Float32BufferAttribute(types,1));
    structures.computeVertexNormals();
    const boards=new T.ShaderMaterial({side:T.DoubleSide,vertexColors:true,uniforms:{sun:{value:sun},wood:{value:texture('rockwood-dock-timber.webp',true)}},
      vertexShader:`attribute float surfaceKind;varying float kind;varying vec3 tint,normalW,p;varying vec2 detail;
        void main(){kind=surfaceKind;tint=color;detail=uv;p=position;normalW=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`uniform vec3 sun;uniform sampler2D wood;varying float kind;varying vec3 tint,normalW,p;varying vec2 detail;
        void main(){vec3 c=tint;float dist=distance(cameraPosition,p);
          if(kind>3.5){float grit=texture2D(wood,detail*3.1).g;c*=.80+.49*grit;}else if(kind>2.5){vec2 wire=abs(fract(detail/.099+.50)-.5)*.099;vec2 aa=max(fwidth(detail),vec2(.0001));
            vec2 cover=1.-smoothstep(vec2(.002)-aa*.45,vec2(.002)+aa*.45,wire);float f=max(cover.x,cover.y);
            if(f<mix(.48,.93,smoothstep(15.,48.,dist)))discard;
          }else if(kind>1.5){vec2 pitch=vec2(.043,.11),phase=abs(fract(detail/pitch+.5)-.5)*pitch;
            vec2 footprint=max(fwidth(detail),vec2(.0001));
            vec2 bars=1.-smoothstep(vec2(.003)-footprint*.36,vec2(.003)+footprint*.36,phase);
            float metal=max(bars.x,bars.y);
            float resolved=1.-smoothstep(.006,.019,max(footprint.x,footprint.y));
            if(resolved>.69&&metal<.23)discard;
            c*=mix(.73,.30+.96*metal,resolved);
            c+=.031*max(0.,dot(normalize(cameraPosition-p+sun),vec3(0.,1.,0.)))*metal;
          }else if(kind>.5){vec3 grain=texture2D(wood,detail*vec2(.55,3.1)).rgb;c*=.69+.8*dot(grain,vec3(.26,.55,.19));}
          vec3 n=normalize(normalW);if(!gl_FrontFacing)n=-n;
          vec3 light=vec3(.63,.70,.77)*(.57+.36*max(0.,n.y))+vec3(.9,.72,.48)*max(0.,dot(n,sun))*(1. /* direct terrain visibility */);
          gl_FragColor=vec4(max(vec3(.006),c*light),1.);
          #include <colorspace_fragment>
        }`});
    const bridge=new T.Mesh(structures,boards);
    bridge.name='Steep Creek · measured timber and wire viewing decks';bridge.userData.terrainReceiver=true;bridge.userData.terrainCaster=true;group.add(bridge);
    const pebbles=[],pebbleColors=[],normals=[];
    const up=new T.Vector3(),va=new T.Vector3(),vb=new T.Vector3(),vc=new T.Vector3();
    function pebbleFace(a,b,c,tone){
      const n=up.crossVectors(vb.set(...b).sub(va.set(...a)),vc.set(...c).sub(va)).normalize();
      for(const v of [a,b,c]){pebbles.push(...v);normals.push(n.x,n.y,n.z);pebbleColors.push(tone*.99,tone*.95,tone*.85);}
    }
    for(const [x,z,rx,rz,rise,seed] of survey.gravel){
      const base=sample(ground,x,z),count=6+(seed%3),angle=seed*.23,points=[],cap=[];
      const crown=[x+.09*rx,base+rise,z-.12*rz],tone=.19+.29*((seed%61)/60);
      for(let k=0;k<count;k++){
        const ang=angle-k*2*Math.PI/count,r=1.+.13*Math.cos(ang*3.+seed);
        points.push([x+rx*r*Math.cos(ang),base-.032,z+rz*r*Math.sin(ang)]);
        cap.push([x+rx*r*.63*Math.cos(ang+.045),base+rise*(.48+.22*Math.sin(ang+seed)),z+rz*r*.65*Math.sin(ang+.045)]);
      }
      for(let k=0;k<count;k++){const i=(k+1)%count;pebbleFace(crown,cap[k],cap[i],tone);pebbleFace(cap[k],points[k],points[i],tone*.88);pebbleFace(cap[k],points[i],cap[i],tone*.88);}
    }
    const stones=new T.BufferGeometry();
    stones.setAttribute('position',new T.Float32BufferAttribute(pebbles,3));stones.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
    stones.setAttribute('color',new T.Float32BufferAttribute(pebbleColors,3));
    const pebbleMat=new T.ShaderMaterial({vertexColors:true,uniforms:{sun:{value:sun},grains:{value:texture('shore-cobble.webp',true)}},
      vertexShader:`varying vec3 p,n,c;void main(){p=position;n=normal;c=color;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
      fragmentShader:`uniform vec3 sun;uniform sampler2D grains;varying vec3 p,n,c;void main(){
        float coverage=1.-smoothstep(95.,152.,distance(cameraPosition,p));if(coverage<fract(dot(floor(p*9.),vec3(.23,.41,.59))))discard;
        float grain=dot(texture2D(grains,p.xz*.89+p.y*.097).rgb,vec3(.24,.54,.22));
        float light=.67+.51*max(0.,dot(normalize(n),sun))*(1. /* direct terrain visibility */);
        gl_FragColor=vec4(c*(.66+grain*.75)*light,1.);}`});
    const gravelMesh=new T.Mesh(stones,pebbleMat);gravelMesh.name='Steep Creek · wetted gravel bars';gravelMesh.userData.terrainReceiver=true;group.add(gravelMesh);

    // Low alder and willow sprigs occupy positions with measured returns 0.4–3.75 m
    // above the floodplain. Inclined, bent surfaces give each spray depth at eagle eye level.
    const thickets=new T.ShaderMaterial({side:T.DoubleSide,uniforms:{sprays:{value:texture('moosehead-bank-sprays.webp')},sun:{value:sun},clock},
      vertexShader:`attribute vec3 root;attribute vec2 foliage;varying vec2 leaf;varying float shade,coverageRange;varying vec3 stable;uniform float clock;uniform vec3 sun;
        void main(){vec3 p=position;vec3 n=normal;
          float flutter=sin(clock*1.57+.051*root.x+.092*root.z);
          p.xz+=vec2(.030,.018)*foliage.x*foliage.x*(flutter+.42*sin(clock*3.6+root.z*.37+foliage.y));
          stable=position;coverageRange=1.-smoothstep(255.,355.,distance(cameraPosition,p));leaf=uv;shade=(.61+.44*abs(dot(n,sun))+.105*max(0.,n.y))*(.86+.14*foliage.x);
          gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
      fragmentShader:`uniform sampler2D sprays;varying vec2 leaf;varying vec3 stable;varying float shade,coverageRange;
        void main(){vec4 tex=texture2D(sprays,leaf);if(tex.a<.35||coverageRange<fract(dot(floor(stable*7.),vec3(.31271,.13151,.53263))))discard;
          gl_FragColor=vec4(tex.rgb*shade*vec3(.84,.94,.80),1.);}`});
    const patches=new Map(),brushMeshes=[];
    for(const [x,z,h,w,seed] of survey.brush){
      if(managed(x,z))continue;
      const y=sample(ground,x,z),bucket=Math.floor(x/42)*128+Math.floor(z/42);
      if(!patches.has(bucket))patches.set(bucket,{p:[],roots:[],uv:[],traits:[],index:[]});
      const batch=patches.get(bucket),count=7+(seed%4);
      for(let shoot=0;shoot<count;shoot++){
        const theta=((seed*.419+shoot*2.39996)%(2*Math.PI)),cs=Math.cos(theta),sn=Math.sin(theta);
        const rise=shoot===0?.98:.52+.34*((shoot*17+seed)%13)/12;
        const reach=shoot===0?.13:.28+.20*((shoot*13+seed)%17)/16;
        const half=(.115+.058*((shoot+seed)%5)/4)*w,wing=.18*h;
        const column=(seed+shoot)%4,row=1,base=batch.p.length/3;
        for(const [f,span] of [[0,-.23],[0,.23],[.50,-1],[.50,1],[1,-.26],[1,.26]]){
          const cur=f**1.22*reach*w,side=span*half;
          const xx=x+cs*cur-sn*side,zz=z+sn*cur+cs*side;
          batch.p.push(xx,y+rise*h*(f-.12*f*f)+wing*(1-Math.abs(span))*.41,zz);
          batch.roots.push(x,y,z);batch.traits.push(f,theta);
          const u=span<0?.012:.988;
          batch.uv.push((column+u)*.25,(3-row+.014+.972*f)*.25);
        }
        for(const i of [0,1,2,1,3,2,2,3,4,3,5,4])batch.index.push(base+i);
      }
    }
    for(const [cell,batch] of patches){
      const geom=new T.BufferGeometry();
      geom.setAttribute('position',new T.Float32BufferAttribute(batch.p,3));
      geom.setAttribute('root',new T.Float32BufferAttribute(batch.roots,3));
      geom.setAttribute('foliage',new T.Float32BufferAttribute(batch.traits,2));
      geom.setAttribute('uv',new T.Float32BufferAttribute(batch.uv,2));geom.setIndex(batch.index);geom.computeVertexNormals();geom.computeBoundingSphere();
      const mesh=new T.Mesh(geom,thickets);mesh.name='Steep Creek · measured alder brakes '+cell;group.add(mesh);brushMeshes.push(mesh);
    }
    // Cull the decimetre gravel and individual sprigs at their own angular scales.
    // The root bound is checked first so distant glacier flights do no per-patch work.
    const near=new T.Vector3();
    return function updateDetails(player) {
      if(!player)return;
      const dx=Math.max(left-player.x,0,player.x-right),dz=Math.max(north-player.z,0,player.z-south);
      const distance2=dx*dx+dz*dz+Math.max(0,player.y-23)**2;
      group.visible=distance2<1400*1400;
      if(!group.visible)return;
      gravelMesh.visible=distance2<160*160;
      near.set(player.x,player.y,player.z);
      for(const bush of brushMeshes){
        const bounds=bush.geometry.boundingSphere;
        bush.visible=bounds.center.distanceToSquared(near)<(365+bounds.radius)**2;
      }
    };
  }
  return {height,waterAt,contains,managed,isPaved,structureHeight,addGroundPlants,holding:{depth:holdingDepth,upstream,current},trees:survey.trees.flat(),fish:survey.fish,shade,add,
    landmark:{name:'Steep Creek salmon boardwalk',x:-136.1,z:1877.7,approach:[-149,1868.7,-128,1884,6.1,0,12]}};
};
