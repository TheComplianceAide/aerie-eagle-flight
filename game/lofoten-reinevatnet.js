// Reinevatnet hangs about 66 m above the Atlantic behind the Reinebringen ridge.
// The reflected wall atlas is calculated from four local water-level sightlines.
(() => {
  window.makeReinevatnet=function(T,scene,texture,sky,sun,clock){
    const {level,outline,area}=window.aerieReinevatnet;
    const points=outline.map(([x,z])=>new T.Vector2(x,z));
    const positions=[];
    for(const tri of T.ShapeUtils.triangulateShape(points,[])){
      for(const i of tri)positions.push(points[i].x,level,points[i].y);
    }
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    geometry.computeBoundingSphere();
    const material=new T.ShaderMaterial({
      side:T.DoubleSide,uniforms:{phase:clock,panorama:{value:sky},sun:{value:sun},walls:{value:texture('reinevatnet-reflected-walls.webp')}},
      vertexShader:'varying vec3 place;void main(){place=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`
        uniform float phase;uniform vec3 sun;uniform sampler2D panorama,walls;varying vec3 place;
        vec3 waterReturn(vec3 ray){
          float az=atan(ray.z,ray.x);
          float altitude=asin(clamp(ray.y,-1.,1.));
          vec2 sk=vec2((az-atan(sun.z,sun.x))/6.2831853+.65,altitude/3.14159265+.457);
          vec3 sky=texture2D(panorama,sk).rgb;
          float U=fract(.5+az/6.2831853),V=clamp((altitude+.043)/1.62636,0.,1.);
          vec2 uv=.5*vec2(mix(.00072,.99928,U),mix(.0029,.9971,V));
          vec2 b=clamp((place.xz-vec2(800.,4250.))/vec2(260.,190.),0.,1.);
          vec4 southwest=texture2D(walls,uv);
          vec4 southeast=texture2D(walls,uv+vec2(.5,0.));
          vec4 northwest=texture2D(walls,uv+vec2(0.,.5));
          vec4 northeast=texture2D(walls,uv+vec2(.5));
          vec3 sw=mix(sky,southwest.rgb,southwest.a),se=mix(sky,southeast.rgb,southeast.a);
          vec3 nw=mix(sky,northwest.rgb,northwest.a),ne=mix(sky,northeast.rgb,northeast.a);
          return mix(mix(nw,ne,b.x),mix(sw,se,b.x),b.y);
        }
        void main(){
          vec2 p=place.xz;float px=max(length(dFdx(p)),length(dFdy(p)));
          float gust=.58+.28*sin(dot(p,vec2(.009,.014))-.14*phase)+.14*sin(p.y*.034+phase*.22);
          float a=cos(dot(p,vec2(.78,.39))-phase*2.20)*.020*(1.-smoothstep(.75,3.9,px));
          float b=cos(dot(p,vec2(1.77,-.69))-phase*3.75)*.018*(1.-smoothstep(.32,1.64,px));
          float cap=sin(dot(p,vec2(5.90,1.81))+phase*5.45)*.009*(1.-smoothstep(.08,.51,px));
          vec3 n=normalize(vec3(gust*(a+1.2*b+cap),1.,gust*(.52*a-.40*b+.74*cap)));
          vec3 v=normalize(cameraPosition-place),r=reflect(-v,n);
          float cosine=clamp(dot(n,v),0.,1.);
          float transmission=sqrt(max(.0,1.-.5625*(1.-cosine*cosine)));
          float rs=(cosine-1.333*transmission)/(cosine+1.333*transmission);
          float rp=(1.333*cosine-transmission)/(1.333*cosine+transmission);
          float fresnel=.5*(rs*rs+rp*rp);
          vec3 reflected=waterReturn(r),lake=vec3(.115,.159,.155)*(1.+.043*gust);
          gl_FragColor=vec4(mix(lake,reflected,.12+.84*sqrt(fresnel)),1.);
        }`
    });
    const mesh=new T.Mesh(geometry,material);mesh.name='Reinevatnet · sheltered alpine lake';
    mesh.userData.lakeArea=area;scene.add(mesh);
    function at(x,z){
      if(x<642||x>1210||z<4164||z>4592)return -Infinity;
      let inside=false;
      for(let i=0,j=outline.length-1;i<outline.length;j=i++){
        const a=outline[i],b=outline[j];
        if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
      }
      return inside?level:-Infinity;
    }
    return {mesh,at,level};
  };
})();
