// Plaikni Falls below Anderson Spring. NAIP red/NIR distinguishes the herbaceous
// creek-bank opening from the adjacent andesite benches and fir–hemlock forest.
window.shadePlaikniBanks=function shadePlaikniBanks(material){
  const ortho='vec2 bankUV=clamp((vec2(xz.x,-xz.y)-vec2(6155.,-3998.))/292.+.5,.0007,.9993);'+
    'vec4 plaikniField=texture2D(aerial,vec2(.75*bankUV.x,bankUV.y));vec3 photo=plaikniField.rgb;';
  const reference=`
    vec3 plaikniSample(vec2 p,float band){
      vec2 t=.004+.992*(1.-abs(mod(p,2.)-1.));
      return texture2D(aerial,vec2(.75+.25*t.x,1.-(band+t.y)/3.)).rgb;
    }
  `;
  material.fragmentShader=material.fragmentShader
    .replace('void main(){\n        // Coastal DEMs',reference+'void main(){\n        // Coastal DEMs')
    .replace(/vec3 photo=texture2D\(aerial,[^;]+;/,ortho)
    .replace('float green=smoothstep',`
      // Keep the historical field exposures on the real bluff and creek
      // banks. Beyond the 2022 sampling footprint the normal basin continues.
      vec2 fromFalls=xz-vec2(6159.,4017.);
      float viewField=(1.-smoothstep(48.,106.,length(fromFalls*vec2(.92,1.))))*(1.-smoothstep(650.,1150.,d));
      if(viewField>.001){
        float foliage=clamp((plaikniField.a-.21)/.79,0.,1.);
        float bank=1.-smoothstep(6.,38.,brookDistance),tilt=1.-normal.y;
        float steep=smoothstep(.11,.54,tilt);
        vec2 strike=mat2(.78,.63,-.63,.78)*vec2(dot(wp.xz,vec2(.79,-.61)),wp.y+.095*wp.z);
        vec3 bluff=plaikniSample(strike/vec2(7.9,4.4)+.19,0.);
        vec3 debris=plaikniSample(xz/vec2(4.2,3.1)+.37,1.);
        vec3 bedSample=mix(debris,bluff,steep);
        float fractured=clamp(.29+1.65*lum(bedSample),.51,1.48);
        float dryTone=clamp(.18+.67*lum(photo),.22,.59);
        vec3 volcanic=mix(photo,vec3(dryTone*1.04,dryTone,dryTone*.986),.66)*fractured;
        float herbGrain=plaikniSample(xz/vec2(2.2,1.6)+.63,2.).g;
        vec3 meadow=mix(photo,vec3(.30,.398,.163),.33)*(.80+.43*herbGrain);
        float wet=1.-smoothstep(.45,2.5,brookDistance);
        vec3 exposed=mix(volcanic,meadow,foliage*(1.-.39*steep));
        exposed*=1.-.35*wet;
        // The preserved low growth catches sky fill; dark conifer crown
        // shadows outside the meadow retain the wider terrain response.
        float shadeCrown=foliage*(1.-smoothstep(.16,.48,lum(photo)));
        c=mix(c,exposed,viewField*(.49+.49*bank)*(1.-.40*shadeCrown));
      }
      float green=smoothstep`);
};

window.addPlaikniMeadow=function addPlaikniMeadow(T,scene,elevation){
  const points=window.plaikniMeadowStations;
  if(!points?.length)return;
  const geometry=new T.BufferGeometry(),position=[],colors=[];
  let seed=7333124;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  function tri(a,b,c,tone){position.push(...a,...b,...c);for(let j=0;j<3;j++)colors.push(...tone);}
  // Build one natural-size clump of sedges with several composite flower
  // heads. Forbs and graminoids grow together at the trail restoration plots.
  for(let k=0;k<40;k++){
    const a=6.283*random(),r=.65*Math.sqrt(random()),x=r*Math.cos(a),z=r*Math.sin(a);
    const h=.17+.44*random(),w=.014+.015*random(),lean=.12+.19*random(),t=.76+.39*random();
    const blade=[.114*t,.253*t,.073*t],l=[x-w*Math.sin(a),0,z+w*Math.cos(a)],rr=[x+w*Math.sin(a),0,z-w*Math.cos(a)];
    tri(l,rr,[x+Math.cos(a)*lean,h,z+Math.sin(a)*lean],blade);
    if(k%5)continue;
    const ht=h+.14;
    tri([x-.006,0,z],[x+.006,0,z],[x,ht,z],[.175,.285,.094]);
    const ivory=k%3===0,col=ivory?[.79,.765,.60]:[.92,.65,.102];
    for(let j=0;j<8;j++){
      const an=j*Math.PI/4,radius=.022+.010*random(),tx=x+Math.cos(an)*radius,tz=z+Math.sin(an)*radius;
      tri([x,ht+.004,z],[tx-.006*Math.sin(an),ht+.002,tz+.006*Math.cos(an)],[tx+.006*Math.sin(an),ht-.002,tz-.006*Math.cos(an)],col);
    }
  }
  geometry.setAttribute('position',new T.Float32BufferAttribute(position,3));
  geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
  const material=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});
  const mesh=new T.InstancedMesh(geometry,material,points.length),anchor=new T.Object3D();
  points.forEach(([xx,zz,v],i)=>{
    const x=6150+xx*.1,z=4000+zz*.1;
    anchor.position.set(x,elevation(x,z)-.045,z);anchor.rotation.y=6.283*random();
    const width=.62+random()*.73;anchor.scale.set(width,.77+v/350+random()*.24,width);anchor.updateMatrix();mesh.setMatrixAt(i,anchor.matrix);
  });
  mesh.name='Plaikni Falls · riparian sedges and forbs';mesh.userData.prepareFlightMaterial=true;
  mesh.computeBoundingSphere();scene.add(mesh);
  // The NPS trail ends on the southwest bank at this GPS station. The field
  // photograph documents irregular native-stone treads at the terminus.
  // Their exact positions are reconstructed along the last metres of trail.
  const trail=window.plaikniTrailEnd.map(([x,z])=>[x*.1,z*.1]);
  const tread=[],triColor=[];
  function stoneTriangle(a,b,c,v){tread.push(...a,...b,...c);for(let j=0;j<3;j++)triColor.push(v*1.025,v,v*.91);}
  for(let i=3;i<trail.length-3;i+=2){
    const [x,z]=trail[i],[nx,nz]=trail[i+1],[ax,az]=trail[i-1],len=Math.hypot(nx-ax,nz-az);
    if(len<.2)continue;
    const fx=(nx-ax)/len,fz=(nz-az)/len;
    if(elevation(nx,nz)-elevation(ax,az)<.12)continue;
    for(const side of [-.33,.34]){
      const sx=x-fz*side,sz=z+fx*side;
      const height=elevation(sx,sz)+.07,lt=.28+random()*.12,wd=.28+random()*.12;
      const outline=[[-.64,-1],[.60,-1],[1,-.4],[.89,.85],[-.46,1],[-1,.28]];
      const ring=outline.map(([u,v])=>[sx+fx*u*lt-fz*v*wd,height+.017*(random()-.5),sz+fz*u*lt+fx*v*wd]);
      const shade=.24+.13*random();
      for(let k=0;k<ring.length;k++){
        const a=ring[k],b=ring[(k+1)%ring.length],ad=[a[0],Math.min(a[1]-.055,elevation(a[0],a[2])-.055),a[2]],bd=[b[0],Math.min(b[1]-.055,elevation(b[0],b[2])-.055),b[2]];
        stoneTriangle([sx,height+.018,sz],b,a,shade);stoneTriangle(a,b,bd,shade*.73);stoneTriangle(a,bd,ad,shade*.76);
      }
    }
  }
  if(tread.length){
    const stones=new T.BufferGeometry();stones.setAttribute('position',new T.Float32BufferAttribute(tread,3));
    stones.setAttribute('color',new T.Float32BufferAttribute(triColor,3));stones.computeVertexNormals();
    const treadMesh=new T.Mesh(stones,material);treadMesh.name='Plaikni Falls · native stone trail steps';scene.add(treadMesh);
  }
};
