// The Dance Floor's shelves are mapped from the NOAA coastal point cloud.
// Local photographed granite distinguishes the lying slab tops and broken faces.
window.bakerDanceFloorSurface=function(T,material,texture){
  material.uniforms.danceStone={value:texture('acadia-baker-dance-granite.webp')};
  material.fragmentShader='uniform sampler2D danceStone;\n'+material.fragmentShader.replace('float dep=1.-exp(',`
    vec2 danceEdge=min(wp.xz-vec2(-563.,9166.),vec2(-382.,9254.)-wp.xz);
    float dance=smoothstep(1.,7.,min(danceEdge.x,danceEdge.y))*landformHorizon.w*(1.-landformHorizon.z);
    if(dance>.001&&d<750.){
      vec2 axis=vec2(.885,-.466);
      vec2 grainUV=vec2(dot(wp.xz,axis),dot(wp.xz,vec2(-axis.y,axis.x)));
      vec2 tp=fract(grainUV*vec2(.113,.149)+vec2(.26,.68));
      vec3 topSkin=texture2D(danceStone,vec2(.004+.492*tp.x,tp.y*.986+.007)).rgb;
      vec2 vp=fract(vec2(dot(wp.xz,vec2(.67,.74))*.20,wp.y*.48));
      vec3 sideSkin=texture2D(danceStone,vec2(.503+vp.x*.244,.006+vp.y*.988)).rgb;
      vec3 stone=mix(sideSkin,topSkin,smoothstep(.53,.91,normal.y));
      float salt=.75+.31*landformHorizon.x;
      float damp=1.-smoothstep(.65,3.00,wp.y+.25*normal.z);
      vec2 wetUV=fract(grainUV*vec2(.161,.196)+vec2(.19,.42));
      vec3 wetSkin=texture2D(danceStone,vec2(.752+.245*wetUV.x,.008+.984*wetUV.y)).rgb;
      stone=mix(stone,wetSkin,damp*smoothstep(.52,.85,normal.y)*.73);
      float localLuma=clamp(lum(photo),.13,.75);
      vec3 granite=clamp(stone*vec3(1.01,1.03,1.07),vec3(.06),vec3(.67))*
                    mix(.77,1.10,smoothstep(.15,.75,localLuma));
      granite*=mix(1.,.76,damp);
      vec3 starlight=vec3(.23,.275,.35)*(.55+.45*max(0.,normal.y))*salt;
      vec3 westGlow=vec3(.141,.161,.202)*max(0.,dot(normal,sun));
      float facing=1.-max(.0,dot(normal,normalize(cameraPosition-wp)));
      vec3 sheen=damp*pow(facing,5.)*vec3(.0028,.0053,.0081);
      vec3 surface=pow(max(granite,vec3(.016)),vec3(2.2))*(starlight+westGlow)+sheen;
      c=mix(c,surface,dance*(1.-smoothstep(280.,750.,d)));
    }
    float dep=1.-exp(`);
};

// The lidar records the upper surface and the position of each exposed riser.
// Its hidden undercut is inferred from the NPS photograph of the Dance Floor.
(() => {
  let edges;
  window.prepareBakerSlabs=async function(){
    const name='acadia-baker-slab-edges.bin';
    const response=await fetch(window.aerieAssetURL?.(name)||name);
    if(!response.ok)throw Error('Cannot open Baker Island granite survey');
    const buffer=await response.arrayBuffer(),d=new DataView(buffer);
    if(d.getUint32(0)!==0x42534c31)throw Error('Invalid Baker Island granite survey');
    const count=d.getUint32(4,true);let offset=8;edges=[];
    for(let i=0;i<count;i++){
      const n=d.getUint16(offset,true);offset+=2;
      if(n<2||offset+14*n>buffer.byteLength)throw Error('Incomplete granite slab edge');
      edges.push(new Int16Array(buffer,offset,n*7));offset+=n*14;
    }
    if(offset!==buffer.byteLength)throw Error('Invalid granite slab record length');
  };
  window.makeBakerSlabs=function(T,scene,material,sample){
    if(!edges)return null;
    const pos=[],norm=[],occlusion=[],idx=[];
    for(const line of edges){
      const base=pos.length/3;
      for(let j=0;j<line.length;j+=7){
        const cx=-474+line[j]/64,cz=9213+line[j+1]/64,h=line[j+2]/128;
        const ux=line[j+3]/4096,uz=line[j+4]/4096,drop=line[j+5]/1024,w=line[j+6]/1024;
        const length=w*Math.min(.61,.19+.23*drop),depth=w*Math.min(.46,.10+.20*drop);
        const v=(back,y,normalY,side,ambient)=>{
          pos.push(cx+ux*back,y,cz+uz*back);
          const mag=Math.hypot(normalY,side);norm.push(-ux*side/mag,normalY/mag,-uz*side/mag);
          occlusion.push(ambient,0,0,255);
        };
        const back=.35+.37*w;
        v(back,sample(cx+back*ux,cz+back*uz)-.035,1,.16,251);
        v(-length*.85,h+.025*w,1,.14,248);
        v(-length,h-.14*depth,.19,1,221);
        v(-length+.067*w,h-.91*depth,.08,1,160);
        v(-length+.17*w,h-depth,-.83,.62,113);
        v(.32*w,h-.89*depth,-1,.10,79);
        if(j){
          const k=base+j/7*6;
          for(let a=0;a<5;a++){
            const ab=k-6+a,cd=k+a;
            // The contour ordering can run either way on separate coast faces.
            const ax=pos[3*cd]-pos[3*ab],az=pos[3*cd+2]-pos[3*ab+2];
            const bx=pos[3*(ab+1)]-pos[3*ab],bz=pos[3*(ab+1)+2]-pos[3*ab+2];
            const ay=pos[3*cd+1]-pos[3*ab+1],by=pos[3*(ab+1)+1]-pos[3*ab+1];
            const n=(ay*bz-az*by)*norm[3*ab]+(az*bx-ax*bz)*norm[3*ab+1]+(ax*by-ay*bx)*norm[3*ab+2];
            if(n>=0)idx.push(ab,cd,ab+1,ab+1,cd,cd+1);
            else idx.push(ab,ab+1,cd,ab+1,cd+1,cd);
          }
        }
      }
    }
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('normal',new T.Float32BufferAttribute(norm,3));
    g.setAttribute('landformExposure',new T.Uint8BufferAttribute(occlusion,4,true));
    g.setIndex(idx);g.computeBoundingSphere();
    const mesh=new T.Mesh(g,material);mesh.name='Baker Island · fractured granite plate edges';mesh.visible=false;
    if(material.uniforms.linearOutput)mesh.onBeforeRender=(renderer,scene,camera)=>{
      material.uniforms.linearOutput.value=!!camera.userData.lakeReflection;material.uniformsNeedUpdate=true;
    };
    scene.add(mesh);return mesh;
  };
})();
