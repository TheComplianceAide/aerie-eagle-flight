// Original radial-engined DHC-3 model from the manufacturer's three-view and
// historic operator/family photo references. Aircraft station is metres aft
// from the propeller, lateral distance is positive to starboard.
window.addBerteFloatplane=function addBerteFloatplane(T,scene,{level,texture,sky,elevation}){
  const center={x:-61.6,z:1736.5},yaw=-1.80,cos=Math.cos(yaw),sin=Math.sin(yaw);
  const root=new T.Group();root.name='Camp Sud · radial Otter floatplane';
  const lengthScale=12.7508/12.93;root.scale.z=lengthScale;
  root.rotation.y=yaw;root.position.set(center.x,level+.16,center.z);scene.add(root);
  const layout=texture('labrador-otter-skin.webp');layout.colorSpace=T.SRGBColorSpace;layout.anisotropy=8;
  const skin=new T.MeshStandardMaterial({map:layout,vertexColors:true,metalness:.13,roughness:.49,side:T.DoubleSide});
  const hardware=new T.MeshStandardMaterial({vertexColors:true,metalness:.24,roughness:.43,side:T.DoubleSide});
  const glazing=new T.MeshStandardMaterial({vertexColors:true,metalness:.15,roughness:.19,side:T.DoubleSide});
  // The windows show the real lake sky at their reflected angle. The black
  // rubber gasket and narrow cockpit framing are separate opaque surfaces.
  for(const surface of [skin,hardware,glazing]){
    const windowGlass=surface===glazing;
    surface.onBeforeCompile=shader=>{
      shader.uniforms.otterSky={value:sky};
      shader.vertexShader='varying vec3 otterWorld;\n'+shader.vertexShader.replace('#include <project_vertex>',
        '#include <project_vertex>\n otterWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
      shader.fragmentShader='varying vec3 otterWorld;uniform sampler2D otterSky;\n'+shader.fragmentShader.replace('#include <opaque_fragment>',`
        vec3 wNormal=normalize(inverseTransformDirection(normal,viewMatrix));
        vec3 eye=normalize(cameraPosition-otterWorld),ray=reflect(-eye,wNormal);
        vec2 pos=vec2(.5+atan(ray.z,ray.x)*.15915494,.5+asin(clamp(ray.y,-1.,1.))*.31830989);
        vec3 field=texture2D(otterSky,pos).rgb;
        field=mix(vec3(.026,.039,.032),field,smoothstep(-.085,.12,ray.y));
        float edge=1.-abs(dot(eye,wNormal));
        ${windowGlass?'outgoingLight=mix(outgoingLight,field,.25+.61*pow(edge,2.8));':
          'vec3 sheen=mix(vec3(.13,.17,.18),field,.68);outgoingLight=mix(outgoingLight,sheen,.051+.23*pow(edge,3.1));'}
        #include <opaque_fragment>`);
    };
    surface.customProgramCacheKey=()=>windowGlass?'berte-glass':'berte-worn-metal';
  }
  const buff=new Map(),white=0xffffff,ivory=0xddd9c8,orange=0xb9541d,metal=0x989e9d,
    dull=0x727975,dark=0x353731,black=0x242825,gasket=0x3c413c,glass=0x293f43,wingEdge=0x755d46;
  const plane=(x,y,s)=>[x,y,5-s],vec=p=>new T.Vector3(...p);
  const angles=n=>Array.from({length:n},(_,i)=>i*2*Math.PI/n);
  const shade=new T.Color();
  function face(mat,points,color,uv,normal){
    let b=buff.get(mat);if(!b){b={p:[],uv:[],n:[],c:[]};buff.set(mat,b);}
    shade.setHex(color);
    const order=points.length===4?[0,1,2,0,2,3]:[0,1,2];
    const a=vec(points[0]),b1=vec(points[1]).sub(a),c=vec(points[2]).sub(a);
    const flat=b1.cross(c).normalize().toArray();
    for(const i of order){b.p.push(...points[i]);b.n.push(...(normal?.[i]||flat));b.c.push(shade.r,shade.g,shade.b);b.uv.push(...(uv?.[i]||[.2,.2]));}
  }
  function pipe(a,b,r,color,segments=7){
    const start=vec(a),end=vec(b),axis=end.clone().sub(start).normalize();
    const side=axis.clone().cross(Math.abs(axis.y)>.91?new T.Vector3(1,0,0):new T.Vector3(0,1,0)).normalize();
    const up=axis.clone().cross(side);
    const offsets=angles(segments).map(t=>side.clone().multiplyScalar(Math.cos(t)).addScaledVector(up,Math.sin(t)));
    for(let i=0;i<segments;i++){
      const j=(i+1)%segments,A=offsets[i],B=offsets[j];
      face(hardware,[start.clone().addScaledVector(A,r).toArray(),start.clone().addScaledVector(B,r).toArray(),
        end.clone().addScaledVector(B,r).toArray(),end.clone().addScaledVector(A,r).toArray()],color,null,[A.toArray(),B.toArray(),B.toArray(),A.toArray()]);
    }
  }
  const bodyUV=(s,y)=>[(4+s/12.8*2040)/2048,1-(4+(4.62-y)/3.9*496)/1024];
  const sheet=(u,v)=>[(8+2032*u)/2048,1-(528+474*v)/1024];
  const hull=[
    [.44,.625,1.80,3.14,2],[.51,.745,1.70,3.22,2],[.66,.795,1.66,3.24,2],
    [1.04,.807,1.65,3.28,2.12],[1.28,.786,1.65,3.28,2.50],[1.61,.805,1.59,3.30,2.76],
    [1.92,.833,1.56,3.34,2.85],[2.08,.851,1.54,3.38,2.88],[2.60,.892,1.52,3.84,3.18],
    [2.97,.905,1.51,3.91,3.38],[3.44,.918,1.49,3.94,3.42],[4.60,.921,1.48,3.92,3.55],
    [5.90,.898,1.48,3.85,3.58],[7.37,.840,1.54,3.69,3.00],[8.56,.684,1.64,3.54,2.58],
    [9.58,.488,1.78,3.39,2.30],[10.61,.302,1.96,3.22,2.21],[11.60,.187,2.13,3.04,2.09],
    [12.20,.115,2.25,2.90,2],[12.53,.047,2.40,2.74,2]];
  function profile(s){
    const i=hull.findIndex(a=>a[0]>=s);
    if(i<=0)return i===0?hull[0]:hull[hull.length-1];
    const a=hull[i-1],b=hull[i],f=(s-a[0])/(b[0]-a[0]);
    return a.map((v,j)=>v+(b[j]-v)*f);
  }
  function sideAt(sign,s,y,delta=0){
    const [,w,low,high,n]=profile(s),v=Math.max(-1,Math.min(1,(2*y-low-high)/(high-low)));
    return plane(sign*(w*Math.pow(Math.max(0,1-Math.pow(Math.abs(v),n)),1/n)+delta),y,s);
  }
  const power=(a,b)=>Math.sign(a)*Math.pow(Math.abs(a),b);
  function ring(p,t){
    const [s,w,low,high,n]=p,sy=power(Math.sin(t),2/n),sx=power(Math.cos(t),2/n);
    return plane(sx*w,(high+low)/2+sy*(high-low)/2,s);
  }
  const circ=36,step=2*Math.PI/circ;
  for(let k=0;k<hull.length-1;k++)for(let j=0;j<circ;j++){
    const pts=[[k,j],[k,j+1],[k+1,j+1],[k+1,j]];
    const xyz=pts.map(([i,q])=>ring(hull[i],q*step));
    const normals=pts.map(([i,q])=>{
      const t=q*step,across=vec(ring(hull[i],t+.006)).sub(vec(ring(hull[i],t-.006)));
      const along=vec(ring(hull[Math.min(hull.length-1,i+1)],t)).sub(vec(ring(hull[Math.max(0,i-1)],t)));
      return along.cross(across).normalize().toArray();
    });
    // Along × tangent points out on the starboard face.
    face(skin,[xyz[0],xyz[3],xyz[2],xyz[1]],white,
      [0,3,2,1].map(n=>bodyUV(hull[pts[n][0]][0],xyz[n][1])),[normals[0],normals[3],normals[2],normals[1]]);
  }
  // Glazed windows follow the pressure-shell curvature. The individual aft
  // windows stay rounded rectangles and separate from the glazed cockpit.
  function sidePane(sign,outline){
    const s0=outline.reduce((v,p)=>v+p[0],0)/outline.length,y0=outline.reduce((v,p)=>v+p[1],0)/outline.length;
    const at=(i,scale,h)=>{const [s,y]=outline[(i+outline.length)%outline.length];return sideAt(sign,s0+(s-s0)*scale,y0+(y-y0)*scale,h);};
    const pos=sideAt(sign,s0,y0,.033);
    for(let i=0;i<outline.length;i++){
      const v=[at(i,1.065,.015),at(i+1,1.065,.015),at(i+1,.985,.023),at(i,.985,.023)];
      face(hardware,sign<0?v.slice().reverse():v,gasket);
      let last=0;
      for(const radius of [.24,.49,.73,.985]){
        const u=at(i,radius,.032),w=at(i+1,radius,.032);
        const panel=last?[at(i,last,.032),u,w,at(i+1,last,.032)]:[pos,u,w];
        face(glazing,sign<0?panel.reverse():panel,glass);last=radius;
      }
    }
  }
  function rounded(s,y,w,h,r){
    const points=[];
    for(const [u,v,ang]of [[1,1,0],[-1,1,90],[-1,-1,180],[1,-1,270]])
      for(let k=0;k<=4;k++){const a=(ang+k*22.5)*Math.PI/180;points.push([s+u*(w/2-r)+r*Math.cos(a),y+v*(h/2-r)+r*Math.sin(a)]);}
    return points;
  }
  for(const side of [-1,1]){
    for(const [s,y,w,h] of [[3.41,3.11,.41,.39],[3.95,3.11,.37,.39],[4.50,3.10,.42,.39],
      [5.02,3.10,.42,.39],[6.03,3.07,.42,.41],[6.69,3.04,.42,.41]])
      sidePane(side,rounded(s,y,w,h,.112));
    sidePane(side,[[2.03,3.02],[2.06,3.19],[2.49,3.55],[2.74,3.56],[2.73,3.01]]);
    // The windscreen follows the sloped pressure-shell surface. Subdividing
    // the compound curve keeps the glare shield beneath the glass in flight.
    function front(u,v,offset=.033){
      const st=1.99+.59*v+.145*u*u,x=side*u*(.765+.027*v);
      const [,w,lo,hi,n]=profile(st),q=Math.abs(x)/w;
      const h=(hi+lo)/2+(hi-lo)/2*Math.pow(Math.max(0,1-Math.pow(q,n)),1/n);
      return plane(x,h+offset,st);
    }
    for(let m=0;m<7;m++)for(let n=0;n<6;n++){
      const u=.017+.97*m/7,v=.025+.94*n/6,du=.97/7,dv=.94/6;
      const f=[front(u,v),front(u+du,v),front(u+du,v+dv),front(u,v+dv)];
      face(glazing,side<0?f.reverse():f,0x28373a);
    }
    for(let j=0;j<12;j++){
      const f=j/12,g=(j+1)/12;
      for(const v of [.025,.965])pipe(front(.017+.97*f,v,.041),front(.017+.97*g,v,.041),.016,gasket);
      for(const u of [.017,.987])pipe(front(u,.025+.94*f,.043),front(u,.025+.94*g,.043),.018,ivory);
    }
    // Dark anti-glare crown directly behind the orange cowling.
    for(let k=0;k<8;k++)for(let n=0;n<8;n++){
      const u=k/8,v=n/8;const cover=(u,v)=>{
        const st=1.045+v*(.94+.08*u*u),angle=Math.PI/2-side*(.03+u*.86);
        const p=ring(profile(st),angle);p[1]+=.015;return p;
      };
      const q=[cover(u,v),cover(u+1/8,v),cover(u+1/8,v+1/8),cover(u,v+1/8)];
      face(hardware,side<0?q.reverse():q,0x41453e);
    }
    pipe(sideAt(side,6.72,2.37,.04),sideAt(side,6.88,2.37,.04),.021,metal);
  }
  // Low-drag foil sections retain leading-edge curvature, dihedral, a hinge
  // gap, separate flaps and ailerons, and a true rounded tip planform.
  const wingForm=[[0,2.83,5.16],[.90,2.78,5.12],[3.15,2.80,5.05],[5.68,2.83,5.03],[7.87,2.88,4.99],
    [8.40,2.92,4.94],[8.63,3.04,4.91],[8.78,3.33,4.82],[8.8392,3.74,4.58]];
  const tailForm=[[0,10.70,12.63],[.44,10.63,12.60],[1.88,10.66,12.36],[2.83,10.72,12.14],
    [3.12,10.84,12.01],[3.23,11.06,11.77]];
  const chord=[0,.025,.075,.17,.31,.50,.67,.716,.727,.81,.93,1];
  function foil(x,le,te,f,top,tail,side){
    const c=te-le;const thickness=(tail?.098:.135)*5*c*(.2969*Math.sqrt(f)-.126*f-.3516*f*f+.2843*f**3-.1036*f**4);
    const line=(tail?3.06:3.785)+x*(tail?.009:Math.tan(Math.PI/90))+.029*Math.sin(Math.PI*f)-.059*f;
    return plane(side*x,line+(top?1:-1)*thickness*(top?1.12:.71),le+c*f);
  }
  for(const s of [-1,1])for(const [shape,tail]of [[wingForm,false],[tailForm,true]]){
    for(let i=0;i<shape.length-1;i++)for(let j=0;j<chord.length-1;j++)for(const top of [false,true]){
      const args=[[i,j],[i+1,j],[i+1,j+1],[i,j+1]];
      const pts=args.map(([a,b])=>foil(...shape[a],chord[b],top,tail,s));
      const color=j===7?0x706c5a:!tail&&i>=5?orange:!tail&&i===4&&j===0?wingEdge:white;
      const uv=args.map(([a,b])=>sheet(shape[a][0]/shape.at(-1)[0],chord[b]));
      if((s>0)!==top){pts.reverse();uv.reverse();}
      face(skin,pts,color,uv);
    }
    for(const [x0,st] of (tail?[[2.45,11.79]]:[[3.84,4.57],[5.67,4.58],[7.44,4.59]])){
      const y=tail?3.01:3.73+x0*.035;
      pipe(plane(s*x0,y,st),plane(s*x0,y-.06,st+.31),.019,dull);
    }
  }
  // The dorsal fillet and rudder continue above the tailplane.
  const fin=[[8.45,3.49],[9.26,3.43],[9.78,3.54],[10.30,3.78],[10.83,4.12],[11.39,4.56],
    [11.86,5.02],[12.45,5.04],[12.65,4.98],[12.65,2.54],[12.47,2.31],[12.02,2.12],[11.53,2.11],[11.31,2.41],[11.19,3.17]];
  const indices=T.ShapeUtils.triangulateShape(fin.map(p=>new T.Vector2(...p)),[]);
  const finAt=(p,sg)=>plane(sg*Math.max(.028,.115-(p[1]-2.05)*.026),p[1],p[0]);
  for(const s of [-1,1]){
    for(const ix of indices){const pts=ix.map(i=>finAt(fin[i],s));face(skin,s<0?pts.reverse():pts,white,pts.map(p=>sheet((5-p[2]-8.3)/4.5,(5.1-p[1])/3.3)));}
    for(const [h,co,th] of [[4.18,orange,.19],[4.04,wingEdge,.025]]){
      const left=10.82+(h-4.12)*1.2;
      const pts=[[left,h],[12.65,h],[12.65,h+th],[left+th*1.16,h+th]].map(p=>finAt(p,s));
      pts.forEach(p=>p[0]+=s*.006);face(hardware,s<0?pts.reverse():pts,co);
    }
    pipe(finAt([12.07,3.17],s),finAt([12.07,4.97],s),.013,dull);
  }
  for(let i=0;i<fin.length;i++){const a=fin[i],b=fin[(i+1)%fin.length];face(hardware,[finAt(a,1),finAt(b,1),finAt(b,-1),finAt(a,-1)],ivory);}
  // Radial engine and its circular cowling lip are open between the three
  // stationary propeller blades. Nine individually cooled cylinder heads sit
  // behind the forward annulus, as in the original 600 hp Otter.
  const hubY=2.48,polar=(r,t,st)=>plane(r*Math.cos(t),hubY+r*Math.sin(t),st);
  const lip=[[.44,.625],[.392,.637],[.352,.61],[.350,.565],[.403,.529],[.546,.503]];
  for(let i=0;i<lip.length-1;i++)for(let j=0;j<48;j++){
    const a=j*Math.PI/24,b=(j+1)*Math.PI/24,[s0,r0]=lip[i],[s1,r1]=lip[i+1];
    face(hardware,[polar(r0,a,s0),polar(r0,b,s0),polar(r1,b,s1),polar(r1,a,s1)],i<3?orange:i===3?metal:dark);
  }
  // Open lower oil-cooler intake and short angled starboard exhaust stack,
  // both visible beneath the radial cowl on the documented piston Otter.
  const intake=(sx,sy,s)=>plane(sx,1.61+sy,s);
  face(hardware,[intake(-.26,-.02,.58),intake(.26,-.02,.58),intake(.23,.115,.54),intake(-.23,.115,.54)],black);
  for(const [a,b]of [[[-.26,-.02,.58],[.26,-.02,.58]],[[.26,-.02,.58],[.23,.115,.54]],
    [[.23,.115,.54],[-.23,.115,.54]],[[-.23,.115,.54],[-.26,-.02,.58]]])pipe(intake(...a),intake(...b),.027,metal,7);
  const exhaustMouth=plane(.90,1.65,1.86),exhaustBack=plane(.61,1.85,1.54);
  pipe(exhaustBack,exhaustMouth,.094,0x756953,14);
  for(let i=0;i<40;i++)face(hardware,[plane(0,hubY,.566),polar(.53,i*Math.PI/20,.566),polar(.53,(i+1)*Math.PI/20,.566)],0x282920);
  for(let j=0;j<9;j++){
    const a=j*2*Math.PI/9+.12;
    pipe(polar(.19,a,.459),polar(.512,a,.459),.080,0x69685a,9);
    for(let k=0;k<5;k++){const r=.31+k*.035;pipe(polar(r,a,.454),polar(r+.011,a,.454),.102,0x88897b,9);}
    for(const dt of [-.095,.095])pipe(polar(.17,a+dt,.383),polar(.43,a+dt,.382),.013,metal,5);
  }
  pipe(plane(0,hubY,-.035),plane(0,hubY,.555),.126,metal,18);
  const hub=[[.03,.07],[.064,.115],[.13,.158],[.24,.151]];
  for(let j=0;j<16;j++)for(let i=0;i<hub.length-1;i++){
    const a=j*Math.PI/8,b=(j+1)*Math.PI/8;
    face(hardware,[polar(hub[i][1],a,hub[i][0]),polar(hub[i][1],b,hub[i][0]),polar(hub[i+1][1],b,hub[i+1][0]),polar(hub[i+1][1],a,hub[i+1][0])],metal);
  }
  const propSurfaces=[];
  const blades=[[.10,.053,.00,.19],[.32,.091,.04,.17],[.66,.122,.064,.151],[1.01,.125,.081,.127],
    [1.34,.092,.087,.106],[1.54,.066,.083,.098],[1.655,.046,.071,.091],[1.676,.014,.058,.096]];
  for(let k=0;k<3;k++){
    const a=1.05+k*Math.PI*2/3;
    const point=([r,w,sweep,st],edge,back)=>plane(r*Math.cos(a)-(sweep+edge*w)*Math.sin(a),
      hubY+r*Math.sin(a)+(sweep+edge*w)*Math.cos(a),st+edge*(.055-.023*r)+(back?.022:0));
    for(let i=0;i<blades.length-1;i++){
      const a=blades[i],b=blades[i+1],col=i>=5?0xd3a33d:i===4?0x343b37:black;
      const front=[point(a,-1,0),point(a,1,0),point(b,1,0),point(b,-1,0)];
      face(hardware,front,col);propSurfaces.push(front.map(([x,y])=>[x,y]));
      face(hardware,[point(a,-1,1),point(b,-1,1),point(b,1,1),point(a,1,1)],col);
      face(hardware,[point(a,-1,0),point(b,-1,0),point(b,-1,1),point(a,-1,1)],metal);
      face(hardware,[point(a,1,0),point(a,1,1),point(b,1,1),point(b,1,0)],col);
    }
  }
  // Twin aluminium floats share 3.2004 m centres and a genuine stepped V
  // hull. The aft run rises so only the forward planing section draws fully.
  const floats=[[-.28,.032,.29,.23],[.00,.235,.46,.03],[.62,.40,.54,-.16],[1.37,.493,.59,-.28],
    [2.68,.535,.61,-.36],[4.25,.553,.63,-.38],[4.59,.550,.63,-.38],[4.61,.550,.63,-.115],
    [5.95,.501,.61,-.03],[7.28,.391,.55,.060],[8.25,.281,.53,.126],[8.48,.227,.52,.18]];
  function pontoon(section,lateral){const [s,w,deck,keel]=section,c=1.6002*lateral;
    return [[-.93,.00],[-1.,.75],[-.98,.86],[-.79,.98],[0,1.02],[.79,.98],[.98,.86],[1.,.75],[.93,.00],[0,-.43]].map(([x,f])=>
      plane(c+x*w,f<0?keel:keel+(deck-keel)*(.30+.70*f),s));}
  for(const s of [-1,1]){
    const f=1.6002*s;
    for(let i=0;i<floats.length-1;i++){
      const A=pontoon(floats[i],s),B=pontoon(floats[i+1],s);
      for(let j=0;j<A.length;j++){
        const n=(j+1)%A.length,ps=[A[j],B[j],B[n],A[n]];
        const uv=[[i,j],[i+1,j],[i+1,n],[i,n]].map(([q,k])=>sheet((floats[q][0]+.28)/8.76,.07+.82*k/9));
        face(skin,ps,j===8||j===9?0x4a4f4c:j===0||j===7?0xb0b6b1:j===3||j===4?0xb5bab5:0xc4c8c7,uv);
      }
    }
    for(const i of [0,floats.length-1]){
      const a=pontoon(floats[i],s);for(let j=1;j<a.length-1;j++)face(hardware,[a[0],a[j],a[j+1]],dull);
    }
    // Two rolled seams catch the skylight along each separate hull plate;
    // the rub rail and paired mooring fittings stand proud of the sheet skin.
    for(let i=0;i<floats.length-1;i++){
      if(i===6)continue;
      const A=pontoon(floats[i],s),B=pontoon(floats[i+1],s);
      for(const j of [1,7])pipe(A[j],B[j],.014,dull,5);
    }
    for(const st of [.67,7.70]){
      const y=st<1?.525:.57;
      pipe(plane(f,y,st),plane(f,y+.105,st),.029,dull);
      pipe(plane(f,y+.089,st-.155),plane(f,y+.089,st+.155),.029,metal);
    }
    for(const st of [1.16,2.50,5.45,6.80]){
      const y=st>6?.603:.635;
      const lid=[plane(f-.225,y,st-.25),plane(f+.225,y,st-.25),plane(f+.225,y,st+.25),plane(f-.225,y,st+.25)];
      face(hardware,lid,metal);for(let j=0;j<4;j++)pipe(lid[j],lid[(j+1)%4],.012,dull,5);
      pipe(plane(f-.06,y+.013,st-.16),plane(f+.06,y+.013,st-.16),.015,dark,5);
    }
    // Landing gear, cross bracing, wing lift strut, cockpit step and water rudder.
    for(const [c,y,st,fw,fst,r]of [[.70,1.67,2.37,f,1.84,.090],[.72,1.60,2.38,f,4.06,.056],
      [.77,1.61,4.55,f,4.55,.082],[.73,1.71,3.43,f,4.55,.043]]){
      const a=plane(s*c,y,st),b=plane(f,.64,fst);pipe(a,b,r,metal);pipe(a,vec(a).lerp(vec(b),.073).toArray(),r*1.19,dull);
    }
    for(const [q,st]of [[4.26,3.14],[4.18,3.66]])pipe(plane(s*.82,1.83,3.30),plane(s*q,3.91,st),.063,metal);
    pipe(plane(f,.66,2.23),plane(-f,.66,3.18),.017,dull,5);
    pipe(plane(f,.66,4.55),plane(-f,.66,3.62),.016,dull,5);
    for(const st of [5.72,6.45])pipe(plane(s*.77,1.70,st),plane(s*1.48,.69,st),.029,dull);
    for(const y of [.87,1.10,1.34,1.56]){
      const x=s*(1.48-(y-.69)*.70);pipe(plane(x,y,5.72),plane(x,y,6.45),.025,dull);
    }
    const rudder=[[8.38,.54],[8.62,.66],[8.87,.60],[9.00,.39],[8.82,.10],[8.54,-.04]];
    for(let i=1;i<rudder.length-1;i++)face(hardware,[rudder[0],rudder[i],rudder[i+1]].map(([a,b])=>plane(f,b,a)),metal);
    pipe(plane(f,.62,8.43),plane(f,.12,8.51),.029,dull);
    pipe(plane(s*.35,2.49,11.86),plane(f,.67,8.62),.009,black,5);
    pipe(plane(s*.58,3.49,2.20),plane(s*.67,3.33,2.06),.014,black,5);
  }
  // The tied bow is quiet at idle. A short hanging rope runs from its float
  // cleat to the rocky bank. Both ends meet the actual hull/ground elevations.
  for(const [material,b] of buff){
    const geometry=new T.BufferGeometry();
    for(const [name,array,n]of [['position',b.p,3],['normal',b.n,3],['color',b.c,3],['uv',b.uv,2]])
      geometry.setAttribute(name,new T.Float32BufferAttribute(array,n));
    geometry.computeBoundingSphere();const mesh=new T.Mesh(geometry,material);
    mesh.name=material===skin?'Otter · riveted skin and airfoils':material===glazing?'Otter · glazed cockpit and cabin':'Otter · radial, floats, bracing and propeller';
    mesh.userData.prepareFlightMaterial=true;root.add(mesh);
  }
  const lake=scene.children.find(o=>o.isWater)?.material;
  if(lake){
    lake.uniforms.otterMoor={value:new T.Vector4(center.x,center.z,cos,sin)};
    const toPlane=`
      uniform vec4 otterMoor;
      vec2 campStation(vec2 p){
        vec2 d=p-otterMoor.xy;
        return vec2(dot(d,vec2(otterMoor.z,-otterMoor.w)),5.-dot(d,otterMoor.wz)/.98614);
      }
      float otterPontoon(vec2 q){
        float end=max(max(-.13-q.y,q.y-8.45),0.);
        float beam=.51*smoothstep(-.32,.98,q.y)*(1.-.49*smoothstep(6.52,8.48,q.y));
        return length(vec2(max(abs(abs(q.x)-1.60)-beam,0.),end));
      }
    `;
    lake.fragmentShader=toPlane+lake.fragmentShader
      .replace('vec3 n=normalize(vec3(slope.x,1.,slope.y));',`
        float otterContact=0.,otterShade=0.;
        vec2 otterDelta=p-otterMoor.xy;
        if(max(abs(otterDelta.x),abs(otterDelta.y))<42.){
          vec2 q=campStation(p);
          // Reflected capillary fronts curve back around the tied floats.
          // Their stepped aft sections give each disturbed surface a finite end.
          if(max(abs(q.x),abs(q.y-4.))<11.){
            float fd=otterPontoon(q);float nearHull=exp(-fd*1.30);
            vec2 ends=vec2(abs(q.x)-1.60,q.y-clamp(q.y,.13,7.82));
            vec2 normalPlane=normalize(ends+vec2(.0002));
            vec2 worldRipple=normalPlane.x*sign(q.x)*vec2(otterMoor.z,-otterMoor.w)-normalPlane.y*otterMoor.wz;
            float response=nearHull*(1.-smoothstep(.05,.29,footprint));
            slope+=worldRipple*response*(.066*cos(13.1*fd-2.27*time+.61*sin(q.y*.93))+.027*cos(20.*fd-3.64*time));
            otterContact=nearHull*.23;
          }
          // Cast the high wing's shadow into the shallow water in the actual
          // sun direction. Broken cloud fill stays visible through its umbra.
          vec2 shadow=campStation(p+sunDirection.xz*3.82/max(.15,sunDirection.y));
          float span=abs(shadow.x);
          float wing=(1.-smoothstep(8.,9.15,span))*smoothstep(2.28,3.24,shadow.y)*(1.-smoothstep(4.72,5.72,shadow.y));
          vec2 shadeBody=campStation(p+sunDirection.xz*2.05/max(.15,sunDirection.y));
          float bodyShade=(1.-smoothstep(.41,1.31,abs(shadeBody.x)))*smoothstep(.2,1.02,shadeBody.y)*(1.-smoothstep(6.9,10.85,shadeBody.y));
          otterShade=max(wing,bodyShade)*.36*daylight;
        }
        vec3 n=normalize(vec3(slope.x,1.,slope.y));`)
      .replace('vec3 h=normalize(v+sunDirection);','body*=1.-max(otterContact,otterShade);vec3 h=normalize(v+sunDirection);')
      .replace('float spec=exp(', 'float spec=(1.-min(.93,otterShade*2.2))*exp(');
    lake.needsUpdate=true;
  }
  const anchor=new T.Vector3(-54.9,elevation(-54.9,1745.5)+.14,1745.5);
  const cleat=vec(plane(1.6002,.65,7.70)),tip=new T.Vector3();
  const ropePoints=new Float32Array(13*3),ropeGeom=new T.BufferGeometry();
  ropeGeom.setAttribute('position',new T.BufferAttribute(ropePoints,3));
  const mooring=new T.Line(ropeGeom,new T.LineBasicMaterial({color:0x776045}));mooring.frustumCulled=false;mooring.userData.prepareFlightMaterial=true;mooring.name='Camp Sud · float mooring line';scene.add(mooring);
  const knot=new T.Vector3();
  function animate(t){
    root.position.y=level+.16+.041*Math.sin(t*.73+.31)+.018*Math.sin(t*1.22);
    root.rotation.x=.0062*Math.sin(t*.77+.4);root.rotation.z=.010*Math.cos(t*.82-1.45);
    root.rotation.y=yaw+.0091*Math.sin(t*.23+.27);
    root.updateMatrixWorld(true);tip.copy(cleat).applyMatrix4(root.matrixWorld);
    for(let j=0;j<=12;j++){const f=j/12;knot.copy(tip).lerp(anchor,f);knot.y-=.26*4*f*(1-f);
      ropePoints.set([knot.x,knot.y,knot.z],3*j);}
    ropeGeom.attributes.position.needsUpdate=true;
  }
  animate(0);ropeGeom.computeBoundingSphere();ropeGeom.boundingSphere.radius+=.22;mooring.frustumCulled=true;
  // An eagle alongside the pontoons can pass beneath the outboard wing.
  // Missing altitude asks for the topmost surface, as for launch placement.
  function clearance(x,z,altitude){
    const dx=x-center.x,dz=z-center.z;
    if(Math.abs(dx)>13||Math.abs(dz)>13)return -Infinity;
    const p=cos*dx-sin*dz,st=5-(sin*dx+cos*dz)/lengthScale,w=Math.abs(p),base=root.position.y;
    let y=-Infinity;
    if(st>=-.27&&st<=8.50&&Math.abs(w-1.6002)<.51)y=base+.66;
    if(st>.42&&st<12.55){
      const [,width,low,high,n]=profile(st);
      if(w<width)y=Math.max(y,base+(high+low)/2+(high-low)*.5*Math.pow(Math.max(0,1-Math.pow(w/width,n)),1/n));
    }
    function airfoil(shape,top,bottom){
      if(w>shape.at(-1)[0]||altitude!==undefined&&altitude<base+bottom-.15)return;
      const ix=Math.max(1,shape.findIndex(row=>row[0]>=w)),a=shape[ix-1],b=shape[ix],f=(w-a[0])/(b[0]-a[0]);
      if(st>=a[1]+(b[1]-a[1])*f&&st<=a[2]+(b[2]-a[2])*f)y=Math.max(y,base+top);
    }
    airfoil(wingForm,3.99+.0349*w,3.68+.0349*w);airfoil(tailForm,3.13,2.97);
    if(w<.14&&st>8.45&&st<12.64){const cap=st<9.26?3.49:st<11.86?3.46+(st-9.26)*.603:5.05;y=Math.max(y,base+cap);}
    // The parked propeller leaves open air between its three blades.
    if(st<.38&&st>-.04&&w<1.676){
      for(const poly of propSurfaces){
        let lo=Infinity,hi=-Infinity;
        for(let i=0;i<poly.length;i++){
          const a=poly[i],b=poly[(i+1)%poly.length];
          if((a[0]>p)===(b[0]>p))continue;
          const h=a[1]+(b[1]-a[1])*(p-a[0])/(b[0]-a[0]);lo=Math.min(lo,h);hi=Math.max(hi,h);
        }
        if(Number.isFinite(hi)&&(altitude===undefined||altitude>base+lo-.09))y=Math.max(y,base+hi);
      }
    }
    return y;
  }
  return {landmark:{name:'Camp Sud floatplane',x:center.x,z:center.z,approach:[-147,1751,-49,1728,10,4,8]},clearance,
    update(t,player){if(Math.abs(player.x-center.x)<520&&Math.abs(player.z-center.z)<520)animate(t);}};
};
