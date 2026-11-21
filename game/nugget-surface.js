// Nugget Falls has its own colorized point returns, measured canopy and relief.
// No glacier, calving, tundra or visitor-center bank lies inside this survey.
window.nuggetSurfaceShader=function nuggetSurfaceShader(localUV){
  return `
    uniform sampler2D localPhoto,outerPhoto,ridgeRock,ridgeNormal,groundScan;
    uniform vec3 sun;
    uniform bool linearOutput;
    varying vec4 landformHorizon;
    varying vec3 p,n;
    float brightness(vec3 color){return dot(color,vec3(.25,.59,.16));}
    vec3 grains(vec2 uv,float tile){
      vec2 cell=vec2(mod(tile,4.),floor(tile*.25));
      return texture2D(groundScan,(cell+.015625+.96875*abs(mod(uv,2.)-1.))*.25).rgb;
    }
    void main(){
      vec4 observed=texture2D(localPhoto,${localUV});
      vec3 normal=normalize(n);
      float steep=smoothstep(.15,.68,1.-normal.y);
      float cover=clamp((observed.a-.25)/.75,0.,1.);
      float visibleCover=cover*(1.-.94*smoothstep(.31,.75,1.-normal.y));
      float fan=(1.-smoothstep(3.8,8.,p.y))*(1.-steep);
      float range=distance(p,cameraPosition);
      vec3 surface=observed.rgb;
      vec3 faceNormal=normal;
      if(visibleCover<.92&&range<2600.){
        // Glacial abrasion exposes the marble, orthogneiss and quartz-bearing
        // shear zone obliquely. Fine joints project across that face; overhead
        // color retains the true shelves, sandbar and deciduous/conifer margin.
        vec2 strike=mat2(.80,.60,-.60,.80)*vec2(.39*p.x+.92*p.z,p.y-.16*p.x+.11*p.z);
        vec2 floorXY=mat2(.88,-.475,.475,.88)*p.xz;
        vec2 fineUV=strike/vec2(21.,13.)+vec2(.13,.58);
        vec3 broad=texture2D(ridgeRock,strike/vec2(58.,36.)+vec2(.16,.41)).rgb;
        vec3 fine=texture2D(ridgeRock,fineUV).rgb;
        vec3 shelf=texture2D(ridgeRock,floorXY/vec2(29.,20.)+vec2(.31,.18)).rgb;
        vec3 split=mix(shelf,mix(broad,fine,.38),steep);
        vec3 textureNormal=texture2D(ridgeNormal,fineUV).rgb*2.-1.;
        vec3 along=normalize(vec3(normal.z+.00001,0.,-normal.x));
        vec3 up=cross(normal,along);
        float mineral=brightness(split);
        float fracture=clamp(.34+1.39*mineral+.18*textureNormal.y,.44,1.52);
        float dry=1.-smoothstep(.27,.88,visibleCover);
        vec3 bedrock=surface*pow(fracture,1.26);
        bedrock*=mix(vec3(1.),split/max(.09,mineral),.085);
        if(fan>.015&&range<650.){
          float pebble=brightness(grains(floorXY*.29,13.));
          bedrock=mix(bedrock,surface*(.60+.79*pebble),fan);
        }
        surface=mix(surface,bedrock,dry*(1.-smoothstep(1500.,2600.,range)));
        float relief=.36*steep*dry*(1.-smoothstep(120.,560.,range));
        faceNormal=normalize(normal+relief*(along*textureNormal.x+up*textureNormal.y));
      }
      if(visibleCover>.12&&range<140.){
        vec3 floorSample=grains(p.xz*.19,2.);
        float leaf=brightness(floorSample);
        surface*=1.+visibleCover*(leaf-.43)*.35*(1.-smoothstep(42.,140.,range));
      }
      float visibility=smoothstep(-.042,.055,asin(clamp(sun.y,0.,1.))-landformHorizon.y*1.539);
      visibility*=1. /* direct terrain visibility */;
      float sky=landformHorizon.x,incidence=max(0.,dot(faceNormal,sun));
      vec3 light=vec3(.59,.69,.83)*(.77+.25*sky)+vec3(.085,.058,.040)*(1.-sky);
      light+=vec3(.75,.52,.30)*visibility*(.19+.81*sqrt(incidence));
      vec3 shade=surface*light;
      if(landformHorizon.w<.999){
        vec3 regional=texture2D(outerPhoto,vec2(p.x,-p.z)/36000.+.5).rgb;
        shade=mix(regional*light,shade,landformHorizon.w);
      }
      vec3 viewer=normalize(cameraPosition-p);
      float sunward=pow(max(0.,dot(-viewer,sun)),3.);
      float nearAir=exp(-max(0.,cameraPosition.y+p.y)/1250.);
      float haze=1.-exp(-range*(.000025+.000054*nearAir)*(1.+.45*sunward));
      vec3 color=mix(shade,mix(vec3(.57,.67,.79),vec3(.90,.77,.68),sunward),haze);
      if(linearOutput){
        color=max(color,vec3(0.));
        color=mix(color/12.92,pow((color+.055)/1.055,vec3(2.4)),step(vec3(.04045),color));
      }
      gl_FragColor=vec4(color,1.);
    }`;
};

// The main lake keeps its glacial reflection. In the surveyed delta, filter
// that reflection through the shallow aerated water and its fine sediment.
window.nuggetShallows=function nuggetShallows(material,texture){
  material.uniforms.deltaShoal={value:texture};
  // Register with the habitat shoreline pass, which runs after reflection
  // and refraction and decides whether each fragment contains water or land.
  material.userData.nuggetLakeMargin=`
    vec3 marginAt(vec2 p){
      vec3 basin=nuggetRegionalMargin(p);
      vec2 uv=(p-vec2(348.,532.))/vec2(288.,480.);
      float edge=min(min(uv.x,1.-uv.x)*288.,min(uv.y,1.-uv.y)*480.);
      if(edge<=0.)return basin;
      vec3 survey=texture2D(deltaShoal,vec2(uv.x,1.-uv.y)).rgb;
      float sd=2.*survey.b-1.;
      float distanceM=56.*sd*abs(sd),depth=4.*survey.g;
      // An optical slope estimate for the unsounded, glacially turbid shelf.
      float grade=clamp(depth/max(1.,distanceM),.04,.50);
      return mix(basin,vec3(distanceM,depth,grade),smoothstep(0.,13.,edge));
    }`;
  const wetOptics=`
    if(surface.x>348.&&surface.x<636.&&surface.y>532.&&surface.y<1012.){
      vec2 delta=(surface-vec2(348.,532.))/vec2(288.,480.);
      vec3 shoal=texture2D(deltaShoal,vec2(delta.x,1.-delta.y)).rgb;
      float seam=min(min(delta.x,1.-delta.x),min(delta.y,1.-delta.y));
      float sd=2.*shoal.b-1.;
      float reach=smoothstep(0.,.085,seam)*(1.-smoothstep(7.,30.,56.*sd*abs(sd)));
      float opticalDepth=shoal.g*4.;
      float travel=opticalDepth/max(.39,theta);
      // At the lip, fine sand is visible through the water. Longer optical
      // paths become dominated by suspended glacial flour and sky reflection.
      vec3 wetSand=vec3(1.05,1.01,.91)*pow(.84*shoal.r+.07,2.2);
      vec3 transfer=exp(-vec3(1.36,1.02,.91)*travel);
      vec3 bottomLight=mix(vec3(.065,.111,.112),wetSand,transfer);
      scattered=mix(scattered,bottomLight,reach);
    }
  `;
  material.fragmentShader='uniform sampler2D deltaShoal;\n'+material.fragmentShader.replace('vec3 outgoingLight=mix(scattered,reflectionSample,reflectance)',wetOptics+'vec3 outgoingLight=mix(scattered,reflectionSample,reflectance)');
};
