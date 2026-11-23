// All horizontal distances are UTM Zone 12N metres, east and south from the
// survey origin. Heights are NAVD88 metres above 2100 m.
(() => {
  'use strict';
  const DIR = 'yellowstone-data/';
  const SPAN = 2000, DATUM = 2100;
  const fairyApproach=[-3558,-7350,-3718,-7298,48,34,4];
  const clamp = (v, a, b) => Math.max(a, Math.min(v, b));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const path = name => window.aerieAssetURL?.(DIR + name) || DIR + name;
  async function data(name, type) {
    const response = await fetch(path(name));
    if (!response.ok) throw new Error('Yellowstone survey ' + name + ': ' + response.status);
    return response[type]();
  }

  const names = [
    ['Old Faithful', 'faithful', 'A measured siliceous sinter mound and one of the most reliably recurring major eruptions in the Upper Basin.'],
    ['Geyser Hill', 'Beehive Geyser', 'Boardwalks thread the white sinter and shallow runoff beside the Firehole River.'],
    ['Castle Geyser', 'Castle Geyser', 'Fly beside the massive sinter cone. Its recorded steam phase carries farther than the splash.'],
    ['Grand Geyser', 'Grand Geyser', 'The geyser’s broad terrace and quieter pools sit directly above the Firehole.'],
    ['Giant Geyser', 'Giant Geyser', 'The irregular cone stands among the vents on the west side of the river.'],
    ['Morning Glory Pool', 'morning', 'A compact thermal pool sits in pale sinter at the north end of the Upper Geyser Basin.'],
    ['Black Sand Basin', 'black-sand', 'Iron Spring Creek cuts the orange and white thermal apron near Cliff Geyser.'],
    ['Biscuit Basin', 'sapphire', 'The historic 2022 survey shows blue Sapphire Pool and its pale terraces before the 2024 hydrothermal explosion.'],
    ['Grand Prismatic Spring', 'prismatic', 'Warm turquoise gives way to orange microbial mats and branching runoff on the way to the Firehole.'],
    ['Excelsior Geyser Crater', 'excelsior', 'Steam lifts from the turquoise basin while warm water crosses the mineral shelf into the river.'],
    ['Fairy Falls', 'fairy', 'A thin column of water falls from the volcanic plateau west of Midway Geyser Basin.'],
    ['Fountain Paint Pot', 'fountain', 'Fountain Paint Pot’s bubbling mud and the surrounding fumaroles change as the soil dries.'],
    ['Kepler Cascades', 'Kepler Cascades', 'Three short drops cut into rhyolite on the upper Firehole.'],
    ['Lone Star Geyser', 'Lone Star Geyser', 'A sinter cone stands on a log-bordered flat above the upper Firehole.']
  ];

  function elevationReader(meta, heights) {
    function sample(name, x, z, west, north, span, spacing) {
      const values = heights.get(name), end = Math.round(span / spacing), n = end + 1;
      const a = clamp((x - west) / spacing, 0, end), b = clamp((z - north) / spacing, 0, end);
      const i = Math.min(Math.floor(a), end - 1), j = Math.min(Math.floor(b), end - 1);
      const offset = j * n + i;
      return lerp(lerp(values[offset], values[offset + 1], a - i),
        lerp(values[offset + n], values[offset + n + 1], a - i), b - j) / 32;
    }
    const tiles = new Map(meta.tiles.map(([x, z, step]) => [x + '_' + z, step]));
    return (ex, ez, detail = true) => {
      const x = clamp(ex, -6000, 5999.995), z = clamp(ez, -12000, 5999.995);
      const a = Math.floor(x / SPAN) * SPAN, b = Math.floor(z / SPAN) * SPAN;
      const name = a + '_' + b, step = tiles.get(name);
      const height = sample(name, x, z, a, b, SPAN, step);
      if (!detail) return height;
      for (const [key, west, north] of meta.details) {
        const edge = Math.min(x - west, 1000 - x + west, z - north, 1000 - z + north);
        if (edge > 0) return lerp(height, sample(key, x, z, west, north, 1000, 2), smooth(0, 35, edge));
      }
      return height;
    };
  }

  async function loadElevations(meta){
    const keys=[...meta.tiles.map(([x,z,step])=>[x+'_'+z,(Math.round(SPAN/step)+1)**2]),
      ...meta.details.map(([name])=>[name,501**2])];
    if(typeof DecompressionStream==='function'){
      try{
        const packed=await data('heights-v1.bin','arrayBuffer');
        const stream=new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'));
        const bytes=await new Response(stream).arrayBuffer();
        const expected=keys.reduce((total,[,length])=>total+2*length,0);
        if(bytes.byteLength!==expected)throw Error('Incorrect Yellowstone height pack size');
        let cursor=0;
        return new Map(keys.map(([name,count])=>{
          const grid=new Uint16Array(bytes,cursor,count);
          cursor+=2*count;
          return [name,grid];
        }));
      }catch(error){console.warn('Loading Yellowstone heights tile by tile.',error);}
    }
    return new Map(await Promise.all(keys.map(async([name])=>[name,new Uint16Array(await data(name+'.bin','arrayBuffer'))])));
  }

  function configureSky(T, scene, loader, sun) {
    const skyMap = loader.load(path('evening-sky.webp'));
    skyMap.colorSpace = T.SRGBColorSpace;
    skyMap.wrapS = T.RepeatWrapping;
    skyMap.generateMipmaps = false;
    skyMap.minFilter = T.LinearFilter;
    const material = new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false,
      uniforms: {panorama: {value: skyMap}, sun: {value: sun}},
      vertexShader: 'varying vec3 ray;void main(){ray=position;vec4 p=projectionMatrix*vec4(mat3(viewMatrix)*position,1.);gl_Position=p.xyww;}',
      fragmentShader: `
        varying vec3 ray; uniform sampler2D panorama; uniform vec3 sun;
        void main(){
          vec3 v=normalize(ray);
          vec3 sky=texture2D(panorama,vec2(fract(.5+atan(v.z,v.x)*.15915494+.565),clamp(.474+asin(v.y)*.31830989,.012,.995))).rgb;
          float facing=max(0.,dot(sun,v));
          float veil=(1.-smoothstep(0.,.23,v.y));
          vec3 hue=mix(vec3(.58,.69,.77),vec3(.98,.70,.42),.49*pow(facing,4.));
          sky=mix(sky*.96,hue,.17*veil)+vec3(1.,.76,.45)*(.08*pow(facing,51.)+.56*pow(facing,4400.));
          gl_FragColor=vec4(sky,1.);
          #include <colorspace_fragment>
        }`
    });
    const sky = new T.Mesh(new T.SphereGeometry(1, 46, 24), material);
    sky.name = 'Yellowstone · sky and late-afternoon sun';
    sky.frustumCulled = false;
    sky.renderOrder = -1000;
    scene.add(sky);
    return skyMap;
  }

  function terrainMaterial(T, photo, details, rock, soil, sinter, rect, sun, fog, poolBounds, cliffPhoto) {
    const uniforms = {
      photo: {value: photo.image}, frame: {value: new T.Vector4(...rect)},
      stone: {value: rock}, soil: {value: soil}, deposit: {value: sinter},
      sun: {value: sun}, haze: {value: fog}
    };
    let declarations = '', sampler = '';
    if(cliffPhoto){
      uniforms.fairyStone={value:cliffPhoto};
      declarations+='uniform sampler2D fairyStone;\n';
    }
    if(photo.upgrade){
      uniforms.finePhoto=photo.upgrade.texture;
      uniforms.fineBlend=photo.upgrade.mix;
      declarations+='uniform sampler2D finePhoto;uniform float fineBlend;\n';
      sampler+='if(fineBlend>0.)rgb=mix(rgb,texture2D(finePhoto,vec2(uv.x,1.-uv.y)).rgb,fineBlend);\n';
    }
    for (const [i, detail] of details.entries()) {
      uniforms['localMap' + i] = {value: detail.photo.image};
      uniforms['localRect' + i] = {value: new T.Vector4(detail.x, detail.z, 1000, 0)};
      declarations += 'uniform sampler2D localMap' + i + ';uniform vec4 localRect' + i + ';';
      const upgrade=detail.photo.upgrade;
      if(upgrade){
        uniforms['localFine'+i]=upgrade.texture;
        uniforms['localFineBlend'+i]=upgrade.mix;
        declarations+=`uniform sampler2D localFine${i};uniform float localFineBlend${i};\n`;
      }
      sampler += `{
        vec2 sub=(xz-localRect${i}.xy)/1000.;
        vec2 edge=min(sub,1.-sub);
        float weight=smoothstep(.003,.028,min(edge.x,edge.y));
        if(weight>0.){
          vec2 localUV=vec2(sub.x,1.-sub.y);
          vec3 localColor=texture2D(localMap${i},localUV).rgb;
          ${upgrade?`if(localFineBlend${i}>0.)localColor=mix(localColor,texture2D(localFine${i},localUV).rgb,localFineBlend${i});`:''}
          rgb=mix(rgb,localColor,weight);
        }
      }`;
    }
    const poolGuard=poolBounds.filter(([x,z,radius])=>x>=rect[0]-radius&&z>=rect[1]-radius&&
      x<=rect[0]+rect[2]+radius&&z<=rect[1]+rect[2]+radius)
      .map(([x,z,radius])=>`close*=smoothstep(${radius-3}.,${radius}.,length(xz-vec2(${Number(x).toFixed(2)},${Number(z).toFixed(2)})));`).join('\n');
    return new T.ShaderMaterial({
      uniforms,
      vertexShader: `
        varying vec3 wp, n;void main(){wp=(modelMatrix*vec4(position,1.)).xyz;n=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
      `,
      fragmentShader: `
        uniform sampler2D photo, stone, soil, deposit;
        uniform vec4 frame;
        uniform vec3 sun,haze;
        varying vec3 wp,n;
        ${declarations}
        ${window.aerieCloseMaterial?.fieldShader||''}
        void main(){
          vec2 xz=wp.xz;
          vec2 uv=(xz-frame.xy)/frame.z;
          vec3 rgb=texture2D(photo,vec2(uv.x,1.-uv.y)).rgb;
          ${sampler}
          vec3 normal=normalize(n);
          float dist=length(cameraPosition-wp);
          vec3 rockDx=dFdx(wp),rockDy=dFdy(wp);
          float near=1.-smoothstep(25.,270.,dist);
          float mid=1.-smoothstep(80.,670.,dist);
          float grey=dot(rgb,vec3(.25,.6,.15));
          float plant=smoothstep(.001,.065,rgb.g-.92*rgb.r)*smoothstep(.009,.067,rgb.g-rgb.b);
          float chalk=smoothstep(.24,.55,grey)*(1.-plant)*smoothstep(-.01,.13,rgb.r-.83*rgb.b);
          float steep=1.-smoothstep(.37,.81,normal.y);
          vec2 diag=vec2(xz.x*.62+xz.y*.79,-xz.x*.79+xz.y*.62);
          vec3 mineral=texture2D(stone,xz*.40+wp.y*.11).rgb;
          float grain=dot(texture2D(soil,xz*.36+vec2(-.19,.2)).rgb,vec3(.299,.587,.114));
          float gravel=dot(texture2D(stone,diag*1.24+vec2(wp.y*.14)).rgb,vec3(.299,.587,.114));
          float terrace=texture2D(deposit,diag*.25).r;
          float sinter=texture2D(deposit,xz*.64).r;
          float ledges=texture2D(deposit,xz*.054+vec2(terrace*.11,0.)).r;
          float micro=chalk*(.63*terrace+.37*sinter)+(1.-chalk)*(.55*gravel+.45*grain);
          ${window.aerieCloseMaterial?.fieldShader?`
          // Continue the registered deposit and gravel at close range. Leave
          // the optically distinctive thermal water to its own native shader.
          float close=closeFieldWeight(rockDx,rockDy,dist)*(1.-.55*plant);
          ${poolGuard}
          if(close>.005){
            vec2 uv=xz*.64, dx=rockDx.xz*.64, dy=rockDy.xz*.64;
            vec4 soilDetail=fieldCloseCapture(stone,uv,dx,dy,-1.);
            float nativeRock=dot(soilDetail.rgb,vec3(.299,.587,.114));
            if(chalk>.018){
              float crust=fieldCloseCapture(deposit,uv+vec2(.41,1.8),dx,dy,-1.).r;
              nativeRock=mix(nativeRock,crust,chalk);
            }
            micro=mix(micro,nativeRock,.70*close);
          }`:''}
          vec3 rgbWarm=rgb*vec3(1.13,1.04,.87);
          rgb=mix(rgb,rgbWarm,.62*chalk+.27*plant);
          rgb*=1.+(micro-.37)*1.02*near+(ledges-.38)*.45*chalk*mid;
          if(steep>.06&&mid>0.){
            // Project mineral grain onto the wall along its actual slope.
            // An aerial projection stretches across nearly vertical faces.
            vec2 walls=abs(normal.xz);
            walls/=max(.01,walls.x+walls.y);
            vec3 rockFace=texture2D(stone,wp.zy*.53).rgb*walls.x
              +texture2D(stone,wp.xy*.53+vec2(.31,.57)).rgb*walls.y;
            mineral=mix(mineral,rockFace,steep*mid);
          }
          vec3 weathered=mix(vec3(.23,.20,.17),vec3(.49,.411,.318),chalk);
          rgb=mix(rgb,weathered*(.51+mineral*1.41),steep*(.41+.34*near));
          ${cliffPhoto?`
          float face=steep*(1.-smoothstep(82.,162.,length(xz-vec2(-3686.,-7178.))));
          if(face>.012){
            vec2 weights=abs(normal.xz);weights/=max(.001,weights.x+weights.y);
            vec2 vz=wp.zy*.116+vec2(.071*sin(wp.y*.47+wp.z*.056),.19*sin(wp.z*.105));
            vec2 vx=wp.xy*.117+vec2(.33+.14*sin(wp.y*.52+wp.x*.049),.51+.14*sin(wp.x*.082));
            vec3 rhyolite=texture2D(fairyStone,vz).rgb*weights.x+texture2D(fairyStone,vx).rgb*weights.y;
            vec3 coarse=texture2D(fairyStone,vz*.39+vec2(.47,.31)).rgb*weights.x
              +texture2D(fairyStone,vx*.41+vec2(.25,.41)).rgb*weights.y;
            vec3 weatheredRock=mix(rhyolite,coarse,.49);
            rgb=mix(rgb,vec3(.075,.052,.042)+weatheredRock*.71,face*.86);
          }`:''}
          float gradeLight=clamp(dot(normal,sun)/max(.25,sun.y),.0,1.);
          float visible=1. /* direct terrain visibility */;
          rgb*=vec3(.70,.74,.85)+vec3(.46,.34,.205)*gradeLight*visible;
          float hazeMix=1.-exp(-dist*.000069);
          rgb=mix(rgb,haze*(.84+.16*smoothstep(0.,300.,wp.y-110.)),hazeMix);
          gl_FragColor=vec4(rgb,1.);
          #include <colorspace_fragment>
        }
      `
    });
  }

  function terrainPatch(T, height, x, z, span, cells, material, summary, seams) {
    const v = (cells + 1) * (cells + 1);
    const points = new Float32Array(v * 3), normals = new Float32Array(v * 3);
    const indices = new (v > 65535 ? Uint32Array : Uint16Array)(cells * cells * 6);
    const step = span / cells;
    let p = 0, k = 0;
    for (let j = 0; j <= cells; j++) {
      for (let i = 0; i <= cells; i++) {
        const a = x + i * step, b = z + j * step;
        const e = height(a, b);
        let y = e;
        // Match the coarser neighbor so denser survey meshes do not crack
        // where two levels of detail meet.
        const vertical=(i===0||i===cells)&&j!==0&&j!==cells;
        const edge=vertical?seams[i===0?0:1]:j===0?seams[2]:j===cells?seams[3]:0;
        if(edge){
          const line = vertical ? b : a;
          const m=Math.floor(line/edge)*edge,f=(line-m)/edge;
          if(f)y=vertical?lerp(height(a,m),height(a,m+edge),f):lerp(height(m,b),height(m+edge,b),f);
        }
        const radius=Math.min(3,step*.68),rise=radius*2;
        const dx=height(a-radius,b)-height(a+radius,b);
        const dz=height(a,b-radius)-height(a,b+radius);
        const length=Math.hypot(dx,rise,dz);
        points[p] = a; normals[p++] = dx / length;
        points[p] = y; normals[p++] = rise / length;
        points[p] = b; normals[p++] = dz / length;
        if (i < cells && j < cells) {
          const at = j * (cells + 1) + i, row = at + cells + 1;
          indices[k++] = at; indices[k++] = row; indices[k++] = at + 1;
          indices[k++] = at + 1; indices[k++] = row; indices[k++] = row + 1;
        }
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(points, 3));
    geometry.setAttribute('normal', new T.BufferAttribute(normals, 3));
    geometry.setIndex(new T.BufferAttribute(indices, 1));
    geometry.computeBoundingSphere();
    const mesh = new T.Mesh(geometry, material);
    mesh.name = 'Yellowstone · 3DEP ' + summary;
    mesh.userData.terrainCaster = true;
    mesh.userData.prepareFlightMaterial = true;
    return mesh;
  }

  function positionSeed(x, z) {
    let seed = Math.imul(Math.round(x * 137), 73856093) ^ Math.imul(Math.round(z * 151), 19349663);
    seed = Math.imul(seed ^ (seed >>> 15), 0x45d9f3b);
    return ((seed ^ seed >>> 16) >>> 0) / 4294967296;
  }

  function mappedHabitat(buffer){
    const bytes=buffer?new Uint8Array(buffer):null;
    const valid=bytes?.length===400*600*3;
    const at=(x,z)=>{
      const i=Math.floor((x+6000)/30),j=Math.floor((z+12000)/30);
      return valid&&i>=0&&i<400&&j>=0&&j<600?3*(i+400*j):-1;
    };
    const read=(x,z,field)=>{const i=at(x,z);return i<0?0:bytes[i+field];};
    return {sample:(x,z)=>read(x,z,0),form:(x,z)=>read(x,z,1),
      cover:(x,z)=>read(x,z,2)/100,source:valid?'USGS LANDFIRE 2025 EVT and EVC':null};
  }

  function growForest(T, scene, packed, elevation, sun, river, thermal, habitat) {
    const trees = [];
    const types=[null,
      {name:'Lodgepole pine',family:'needle',shape:[.39,.76,1,.78,.17],aspect:.86,tint:[.88,1.04,.76],stature:1},
      {name:'Engelmann spruce',family:'needle',shape:[.96,1,.84,.55,.10],aspect:1,tint:[.76,.94,.83],stature:1},
      {name:'Quaking aspen',family:'broad',shape:[.46,.82,1,.79,.24],aspect:1.05,tint:[1.06,1.15,.71],stature:1},
      {name:'Rocky Mountain Douglas-fir',family:'needle',shape:[.85,1,.81,.53,.18],aspect:1.04,tint:[.81,.97,.72],stature:1},
      {name:'Riparian cottonwood',family:'broad',shape:[.36,.71,1,.86,.27],aspect:1.10,tint:[1.04,1.1,.77],stature:1},
      {name:'Limber pine',family:'needle',shape:[.57,.93,1,.72,.22],aspect:1.14,tint:[.83,.98,.76],stature:1}
    ];
    const data = packed ? new Int16Array(packed) : new Int16Array();
    for (let i = 0; i < data.length; i += 4) {
      const x = data[i] * .5, z = data[i + 1] * .5, height = data[i + 2] * .1;
      if (thermal(x, z) || Number.isFinite(river.at(x, z))) continue;
      const seed=positionSeed(x,z),type=habitat.form(x,z);
      const aerieSpecies=types[type]||types[seed>.87?2:1];
      trees.push({x,z,y:elevation(x,z),height,width:data[i+3]*.1,conifer:aerieSpecies.family==='needle',aerieSpecies});
    }
    const treeGrid = {cells:new Map(), size:50, cell:(x,z)=>Math.floor(x/50)+':'+Math.floor(z/50)};
    for (const tree of trees) {
      const key=treeGrid.cell(tree.x,tree.z);
      if (!treeGrid.cells.has(key)) treeGrid.cells.set(key,[]);
      treeGrid.cells.get(key).push(tree);
    }
    // Project the measured stands with multiple silhouttes and retain translucent
    // edges as they hand off to the shared close-up 3D tree renderer.
    const image = new T.TextureLoader().load('regional-crowns.webp');
    image.colorSpace = T.SRGBColorSpace;
    image.anisotropy = 6;
    const batches = new Map();
    for (const t of trees) {
      const key = Math.floor(t.x / 480) + ':' + Math.floor(t.z / 480);
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key).push(t);
    }
    const meshList = [];
    const groundHaze = scene.fog.color;
    const radius=window.matchMedia('(pointer: coarse)').matches ? 2850 : 4650;
    const wind={value:new T.Vector2()},clock={value:0};
    const material = new T.ShaderMaterial({
      uniforms:{photo:{value:image},haze:{value:groundHaze},sun:{value:sun},wind,clock},
      side:T.DoubleSide,
      vertexShader:`
        attribute vec4 root;
        attribute vec3 tree;
        uniform vec2 wind;uniform float clock;
        varying vec2 canopyUV;
        varying float angle,variant,distanceFromEye, projected;
        void main(){
          vec3 center=root.xyz+vec3(0.,root.w*.48,0.);
          vec3 view=normalize(cameraPosition-center);
          vec3 right=normalize(vec3(view.z+.00001,0.,-view.x));
          vec3 up=cross(view,right);
          float raised=max(view.y,0.);
          float silhouette=sqrt(max(.03,1.-raised*raised))+raised*tree.x/root.w;
          vec3 point=center+1.2*(right*position.x*tree.x+up*position.y*root.w*silhouette);
          float gust=sin(clock*1.24+dot(root.xz,vec2(.025,.032)));
          point.xz+=wind*root.w*.013*(.63+.37*gust)*pow(max(0.,position.y+.5),1.8);
          canopyUV=uv;angle=cos(atan(view.x,view.z)-tree.y);
          variant=tree.z; projected=raised;distanceFromEye=length(cameraPosition-center);
          gl_Position=projectionMatrix*viewMatrix*vec4(point,1.);
        }`,
      fragmentShader:`
        uniform sampler2D photo;
        uniform vec3 haze,sun;
        varying vec2 canopyUV; varying float angle,variant,distanceFromEye,projected;
        vec4 crown(float side){return texture2D(photo,vec2((side+.006+.988*canopyUV.x)*.25,(7.-variant+.006+.988*canopyUV.y)*.125));}
        void main(){
          float nearby=smoothstep(37.,74.,distanceFromEye);
          float distant=1.-smoothstep(2900.,4100.,distanceFromEye);
          vec4 a=mix(crown(0.),crown(1.),.5-.5*angle);
          vec4 b=crown(2.);
          vec4 crownColor=mix(a,b,smoothstep(.28,.81,projected));
          float stipple=fract(52.9829189*fract(dot(floor(gl_FragCoord.xy),vec2(.06711056,.00583715))));
          if(crownColor.a<(.34+.50*(1.-nearby*distant)*stipple)||stipple>nearby*distant)discard;
          vec3 palette=mix(vec3(.94,1.04,.71),vec3(.75,.88,.69),step(2.5,variant));
          vec3 treeColor=crownColor.rgb*palette*(1.02+.27*angle*sun.y);
          gl_FragColor=vec4(mix(treeColor,haze,1.-exp(-distanceFromEye*.000069)),1.);
          #include <colorspace_fragment>
        }`
    });
    for (const values of batches.values()) {
      const g = new T.InstancedBufferGeometry(), plane = new T.PlaneGeometry(1,1);
      g.setAttribute('position',plane.attributes.position);g.setAttribute('uv',plane.attributes.uv);g.setIndex(plane.index);
      const roots = new Float32Array(values.length * 4), form = new Float32Array(values.length * 3);
      for (const [i,t] of values.entries()) {
        roots.set([t.x,t.y,t.z,t.height],i*4);
        const seed=positionSeed(t.x,t.z);
        form.set([t.width,seed*6.283,(t.conifer?3:0)+Math.floor(seed*3)],i*3);
      }
      g.setAttribute('root',new T.InstancedBufferAttribute(roots,4));
      g.setAttribute('tree',new T.InstancedBufferAttribute(form,3));
      g.instanceCount=values.length;
      const first=values[0], cx=Math.floor(first.x/480)*480+240,cz=Math.floor(first.z/480)*480+240;
      const center=new T.Vector3(cx,elevation(cx,cz)+38,cz);
      g.boundingSphere=new T.Sphere(center,500);
      const mesh=new T.Mesh(g,material);
      mesh.name='Yellowstone · surveyed lodgepole and spruce stands';
      scene.add(mesh);meshList.push(mesh);
    }
    const air={};
    return {trees,treeGrid,update(player,field,t){
      clock.value=t;
      const breeze=field?.sample(player.x,player.y,player.z,t,air);
      if(breeze)wind.value.set(clamp(breeze.windX,-10,10),clamp(breeze.windZ,-10,10));
      for(const mesh of meshList)mesh.visible=mesh.geometry.boundingSphere.center.distanceToSquared(player)<radius*radius;
    }};
  }

  function launchAt(elevation, [x,z], [tx,tz], lift, down, glance = 0) {
    return {x,z,y:elevation(x,z)+lift,yaw:Math.atan2(x-tx,z-tz),lookDown:down,glance};
  }

  window.makeYellowstone = async function makeYellowstone(T, scene, departure='faithful') {
    const [meta,crowns,vegetation] = await Promise.all([
      data('terrain.json','json'),data('crowns.bin','arrayBuffer').catch(()=>null),data('landfire-cover.bin','arrayBuffer').catch(()=>null)
    ]);
    const habitat=mappedHabitat(vegetation);
    if(habitat.source){
      scene.userData.geodata??={};
      scene.userData.geodata.landCover=habitat;
    }
    const heights=await loadElevations(meta);
    const elevation=elevationReader(meta,heights);
    const fog=new T.Color(0xaab9c2);
    const sun=new T.Vector3(-.931,.183,-.315).normalize();
    const sunLight=new T.DirectionalLight(0xffd7a4,2.26);
    sunLight.position.copy(sun).multiplyScalar(1500);
    scene.add(sunLight,new T.HemisphereLight(0xe1edff,0x846f51,1.30));
    scene.fog=new T.FogExp2(fog,.000061);
    const loader=new T.TextureLoader();
    const isTouch=window.matchMedia('(pointer: coarse)').matches;
    function texture(name,local=true){
      const map=loader.load(local?path(name):name);
      map.colorSpace=T.SRGBColorSpace;map.anisotropy=8;
      return map;
    }
    const skyTexture=configureSky(T,scene,loader,sun);
    const river=window.makeYellowstoneWater(T,scene,meta,elevation,sun,fog,skyTexture);
    const rock=texture('atlas-jointed-rock.webp',false), soil=texture('field-ground-scans.webp',false);
    const sinter=texture('geyser-sinter.webp');
    const fairyStone=texture('fairy-rhyolite.webp');
    for(const t of [rock,soil,sinter,fairyStone])t.wrapS=t.wrapT=T.RepeatWrapping;
    // The compact registered imagery establishes the entire watershed. Start
    // with the departure's best photo and stream the rest along the flight.
    const launchAnchors={faithful:meta.landmarks.faithful,river:[-832,-471],biscuit:meta.landmarks.sapphire,
      midway:meta.landmarks.prismatic,steam:meta.landmarks.prismatic,lone:meta.landmarks['Lone Star Geyser'],
      fairy:fairyApproach,game:[-2390,-3240],grand:[-2250,-6200],lookout:[-1450,-6860],wildlife:[-748,-443]};
    const [anchorX,anchorZ]=launchAnchors[departure]||meta.landmarks.faithful;
    const contains=(x,z,size)=>anchorX>=x&&anchorX<x+size&&anchorZ>=z&&anchorZ<z+size;
    const streaming=new T.TextureLoader(new T.LoadingManager());
    const queue=[];
    let pendingPhotos=0,photoClock=0,nextPhoto=0;
    function surfacePhoto(name,x,z,size){
      const eager=!isTouch&&contains(x,z,size);
      const image=texture((eager?'':'touch/')+name+'.webp');
      if(isTouch||eager)return {image};
      const upgrade={name,x,z,size,image,mix:{value:0},texture:{value:image},status:'low',retry:0};
      queue.push(upgrade);
      return {image,upgrade};
    }
    function focusPhotos(dt,player){
      if(!queue.length)return;
      photoClock+=dt;
      function distance(p){
        return Math.hypot(Math.max(0,p.x-player.x,player.x-p.x-p.size),Math.max(0,p.z-player.z,player.z-p.z-p.size));
      }
      for(const p of queue){
        if(p.status!=='high')continue;
        const goal=1-smooth(p.size*.40,p.size*.69,distance(p));
        p.mix.value+=(goal-p.mix.value)*Math.min(1,Math.max(0,dt)*2.55);
        if(goal===0&&p.mix.value<.003){
          p.texture.value.dispose();p.texture.value=p.image;p.mix.value=0;p.status='low';
        }
      }
      if(photoClock<nextPhoto||pendingPhotos>=2)return;
      nextPhoto=photoClock+.38;
      const available=queue.filter(p=>p.status==='low'&&p.retry<=photoClock&&distance(p)<p.size*.36);
      available.sort((a,b)=>distance(a)-distance(b)||a.size-b.size);
      for(const p of available.slice(0,2-pendingPhotos)){
        pendingPhotos++;p.status='loading';
        streaming.load(path(p.name+'.webp'),fine=>{
          pendingPhotos--;p.status='high';fine.colorSpace=T.SRGBColorSpace;fine.anisotropy=8;p.texture.value=fine;
        },undefined,()=>{pendingPhotos--;p.status='low';p.retry=photoClock+28;});
      }
    }
    const details=meta.details.map(([key,x,z])=>({x,z,photo:surfacePhoto(key,x,z,1000)}));
    // Preserve the distinctive submerged colors and mineral bands around the pools.
    const poolBounds=Object.entries({prismatic:84,excelsior:66,morning:20,sapphire:27,'black-sand':23,fountain:19})
      .map(([name,radius])=>[...meta.landmarks[name],radius]);
    const focus=[...['faithful','prismatic','sapphire','morning','excelsior','Lone Star Geyser','Kepler Cascades']
      .map(name=>meta.landmarks[name]).filter(Boolean),[-3690,-7182],[-693,-441],[-1110,-1720],[-2415,-3020]];
    for(const [x,z,step] of meta.tiles){
      const targets=details.filter(d=>d.x<x+SPAN&&d.x+1000>x&&d.z<z+SPAN&&d.z+1000>z);
      const stone=x===-4000&&z===-8000?fairyStone:null;
      const mat=terrainMaterial(T,surfacePhoto(x+'_'+z,x,z,SPAN),targets,rock,soil,sinter,[x,z,SPAN,0],sun,fog,poolBounds,stone);
      // Split the route tiles for visibility while using the same ortho and sample grid.
      const chunks=step===8?4:2;
      const size=SPAN/chunks;
      const grid=Array.from({length:chunks*chunks},(_,i)=>{
        const west=x+(i%chunks)*size,north=z+Math.floor(i/chunks)*size;
        const close=targets.some(d=>d.x<west+size&&d.x+1000>west&&d.z<north+size&&d.z+1000>north);
        const fine=step===8&&close&&focus.some(([u,v])=>u>=west&&u<west+size&&v>=north&&v<north+size);
        const cells=fine?(isTouch?80:160):step===8&&!isTouch&&close?80:40;
        return {west,north,cells,close};
      });
      for(const [n,p] of grid.entries()){
        const {west,north,cells,close}=p;
        const seam=index=>size/Math.min(cells,grid[index].cells);
        const seams=[n%chunks===0?25:seam(n-1),n%chunks===chunks-1?25:seam(n+1),
          n<chunks?25:seam(n-chunks),n>=grid.length-chunks?25:seam(n+chunks)];
        const mesh=terrainPatch(T,river.terrainAt,west,north,size,cells,mat,close?'geyser terrace':'Firehole relief',seams);
        scene.add(mesh);
      }
    }
    const locate=(key,backup)=>meta.landmarks[key]||backup;
    const mid=locate('prismatic',[-1142,-7204]), faithful=locate('faithful',[-329,-31]);
    const castle=locate('Castle Geyser',[-1008,-421]), hill=locate('Beehive Geyser',[-374,-294]);
    const lone=locate('Lone Star Geyser',[2503,3750]);
    const poolKeys=['prismatic','excelsior','morning','sapphire','black-sand','fountain'];
    const poolMarks=poolKeys.map(key=>[key,...meta.landmarks[key]]);
    const dry=(x,z) => Math.hypot(x-faithful[0],z-faithful[1])<155 || Math.hypot(x-hill[0],z-hill[1])<97 || poolMarks.some(([key,a,b])=>Math.hypot(x-a,z-b)<(key==='prismatic'?125:key==='excelsior'?55:20));
    const forest=growForest(T,scene,crowns,elevation,sun,river,dry,habitat);
    const features=await window.makeYellowstoneFeatures(T,scene,meta,elevation,river,sun,fog,loader);
    const fallsClock={value:0};
    const waterfalls=window.makeWaterfallSystem(T,scene,{
      ground:elevation,clock:fallsClock,sun,sky:skyTexture,
      texture:(file,repeat)=>{const t=texture(file,false);if(repeat)t.wrapS=t.wrapT=T.RepeatWrapping;return t;}
    });
    waterfalls.chute('Fairy Falls',[
      [-3697,-7110],[-3693,-7138],[-3686,-7158],[-3685,-7166],
      [-3689,-7189],[-3692,-7204],[-3688,-7218],[-3673,-7240]
    ],2.7,{foamRunout:15,pool:false,freeDrop:{
      lipZ:-7164.6,toeZ:-7191.7,lipWidth:2.55,footWidth:3.6,cloudWidth:6,wallClearance:6.5,make:window.makeWaterfallPlunge
    }});
    waterfalls.chute('Kepler Cascades',[
      [1475,1676],[1462,1652],[1451,1617],[1435,1607],[1419,1597],
      [1408,1584],[1399,1574],[1392,1559],[1388,1530],[1385,1518]
    ],7.4,{foamRunout:28});
    const landmarks=names.flatMap(([name,key,description])=>{
      const point=meta.landmarks[key];
      if(!point)return [];
      const [x,z]=key==='fairy'?[-3689,-7189]:point;
      const place={name,x,z,y:elevation(x,z),description};
      if(key==='fairy')place.approach=fairyApproach;
      return [place];
    });
    const spawn=launchAt(elevation,[faithful[0]+74,faithful[1]+111],[faithful[0]-40,faithful[1]-73],29,10);
    const steamTarget=[mid[0]+24,mid[1]-17];
    const steamStart=[steamTarget[0]+sun.x*154,steamTarget[1]+sun.z*154];
    const steamSight=elevation(...steamTarget)+13;
    const steamY=Math.max(elevation(...steamStart)+22,steamSight+sun.y*154);
    const steam=launchAt(elevation,steamStart,steamTarget,steamY-elevation(...steamStart),
      Math.atan2(steamY-steamSight,154)*180/Math.PI);
    const launches={
      faithful:spawn,
      river:launchAt((x,z)=>river.at(x,z)??elevation(x,z),[-832,-471],[-952,-487],13,11),
      biscuit:launchAt(elevation,[meta.landmarks.sapphire[0]+84,meta.landmarks.sapphire[1]+137],meta.landmarks.sapphire,24,9),
      midway:launchAt(elevation,[mid[0]+124,mid[1]+205],mid,67,19),
      lone:launchAt(elevation,[lone[0]-93,lone[1]+75],lone,21,12),
      fairy: launchAt(elevation,fairyApproach.slice(0,2),fairyApproach.slice(2,4),fairyApproach[4],fairyApproach[6],fairyApproach[5]),
      steam,
      wildlife:launchAt(elevation,[hill[0]+187,hill[1]-178],castle,20,10)
    };
    const height=(x,z)=>Math.max(river.terrainAt(x,z),river.at(x,z)??-Infinity);
    const world={
      region:'yellowstone',altitudeOffset:DATUM,waterfalls,
      bounds:{minX:-5400,maxX:5450,minZ:-11350,maxZ:5730},
      spawn,launches,landmarks,height,elevation:river.terrainAt,
      clearance:(x,z)=>Math.max(height(x,z),features.clearance(x,z)),riverSurfaceAt:river.at,channelWater:river.at,
      trees:forest.trees,treeGrid:forest.treeGrid,skyTexture,sunDirection:sun,forestLightSpan:16000,
      atmosphericOptics:{phenomenon:'Steam glory at Grand Prismatic Spring',setEnabled:features.setGlory},
      groundCover(x,z){
        if(dry(x,z)||Number.isFinite(river.at(x,z))||features.managed(x,z))return -.8;
        const land=habitat.sample(x,z),cover=habitat.cover(x,z);
        return land===3||land===9?.53+.39*cover:land===6?.04:land===5||land===8?-.8:land===1?.59-.42*cover:.45;
      },
      blocksInfillTree(x,z){return dry(x,z)||Number.isFinite(river.at(x,z))||features.managed(x,z);},
      blocksWildlifeAt(x,z){return dry(x,z)||features.managed(x,z);},
      blockVegetationAt(x,z){return dry(x,z)||Number.isFinite(river.at(x,z))||features.managed(x,z);},
      openRoadAt:features.managed,blocksLooseStone:dry,visibleRelief:'USGS Yellowstone National Park 2020 lidar',
      yellowstone:{survey:meta,river,thermal:features},
      update(dt,t,player){
        fallsClock.value=t;waterfalls.update(world.windField,t,player);
        focusPhotos(dt,player);forest.update(player,world.windField,t);river.update(t,player);features.update(dt,t,player,world.windField);
      }
    };
    return world;
  };
})();
