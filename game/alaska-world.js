/* Three.js Water, MIT License, copyright three.js authors. */
window.makeAlaska=function makeAlaska(THREE,scene){
const {
	Color,
	FrontSide,
	Matrix4,
	Mesh,
	PerspectiveCamera,
	Plane,
	ShaderMaterial,
	UniformsLib,
	UniformsUtils,
	Vector3,
	Vector4,
	WebGLRenderTarget
} = THREE;

/**
 * Work based on :
 * https://github.com/Slayvin: Flat mirror for three.js
 * https://home.adelphi.edu/~stemkoski/ : An implementation of water shader based on the flat mirror
 * http://29a.ch/ && http://29a.ch/slides/2012/webglwater/ : Water shader explanations in WebGL
 */

class Water extends Mesh {

	constructor( geometry, options = {} ) {

		super( geometry );

		this.isWater = true;

		const scope = this;

		const textureWidth = options.textureWidth !== undefined ? options.textureWidth : 512;
		const textureHeight = options.textureHeight !== undefined ? options.textureHeight : 512;

		const clipBias = options.clipBias !== undefined ? options.clipBias : 0.0;
		const alpha = options.alpha !== undefined ? options.alpha : 1.0;
		const time = options.time !== undefined ? options.time : 0.0;
		const normalSampler = options.waterNormals !== undefined ? options.waterNormals : null;
		const sunDirection = options.sunDirection !== undefined ? options.sunDirection : new Vector3( 0.70707, 0.70707, 0.0 );
		const sunColor = new Color( options.sunColor !== undefined ? options.sunColor : 0xffffff );
		const waterColor = new Color( options.waterColor !== undefined ? options.waterColor : 0x7F7F7F );
		const eye = options.eye !== undefined ? options.eye : new Vector3( 0, 0, 0 );
		const distortionScale = options.distortionScale !== undefined ? options.distortionScale : 20.0;
		const side = options.side !== undefined ? options.side : FrontSide;
		const fog = options.fog !== undefined ? options.fog : false;

		//

		const mirrorPlane = new Plane();
		const normal = new Vector3();
		const mirrorWorldPosition = new Vector3();
		const cameraWorldPosition = new Vector3();
		const rotationMatrix = new Matrix4();
		const lookAtPosition = new Vector3( 0, 0, - 1 );
		const clipPlane = new Vector4();

		const view = new Vector3();
		const target = new Vector3();
		const q = new Vector4();

		const textureMatrix = new Matrix4();

		const mirrorCamera = new PerspectiveCamera();
		mirrorCamera.userData.lakeReflection = true;

		const renderTarget = new WebGLRenderTarget( textureWidth, textureHeight );

		const mirrorShader = {

			name: 'MirrorShader',

			uniforms: UniformsUtils.merge( [
				UniformsLib[ 'fog' ],
				UniformsLib[ 'lights' ],
				{
					'normalSampler': { value: null },
					'mirrorSampler': { value: null },
					'alpha': { value: 1.0 },
					'time': { value: 0.0 },
					'size': { value: 1.0 },
					'distortionScale': { value: 20.0 },
					'textureMatrix': { value: new Matrix4() },
					'sunColor': { value: new Color( 0x7F7F7F ) },
					'sunDirection': { value: new Vector3( 0.70707, 0.70707, 0 ) },
					'eye': { value: new Vector3() },
					'waterColor': { value: new Color( 0x555555 ) }
				}
			] ),

			vertexShader: /* glsl */`
				uniform mat4 textureMatrix;
				uniform float time;

				varying vec4 mirrorCoord;
				varying vec4 worldPosition;

				#include <common>
				#include <fog_pars_vertex>
				#include <shadowmap_pars_vertex>
				#include <logdepthbuf_pars_vertex>

				void main() {
					mirrorCoord = modelMatrix * vec4( position, 1.0 );
					worldPosition = mirrorCoord.xyzw;
					mirrorCoord = textureMatrix * mirrorCoord;
					vec4 mvPosition =  modelViewMatrix * vec4( position, 1.0 );
					gl_Position = projectionMatrix * mvPosition;

				#include <beginnormal_vertex>
				#include <defaultnormal_vertex>
				#include <logdepthbuf_vertex>
				#include <fog_vertex>
				#include <shadowmap_vertex>
			}`,

			fragmentShader: /* glsl */`
				uniform sampler2D mirrorSampler;
				uniform float alpha;
				uniform float time;
				uniform float size;
				uniform float distortionScale;
				uniform sampler2D normalSampler;
				uniform vec3 sunColor;
				uniform vec3 sunDirection;
				uniform vec3 eye;
				uniform vec3 waterColor;

				varying vec4 mirrorCoord;
				varying vec4 worldPosition;

				vec4 getNoise( vec2 uv ) {
					vec2 uv0 = ( uv / 103.0 ) + vec2(time / 17.0, time / 29.0);
					vec2 uv1 = uv / 107.0-vec2( time / -19.0, time / 31.0 );
					vec2 uv2 = uv / vec2( 8907.0, 9803.0 ) + vec2( time / 101.0, time / 97.0 );
					vec2 uv3 = uv / vec2( 1091.0, 1027.0 ) - vec2( time / 109.0, time / -113.0 );
					vec4 noise = texture2D( normalSampler, uv0 ) +
						texture2D( normalSampler, uv1 ) +
						texture2D( normalSampler, uv2 ) +
						texture2D( normalSampler, uv3 );
					return noise * 0.5 - 1.0;
				}

				void sunLight( const vec3 surfaceNormal, const vec3 eyeDirection, float shiny, float spec, float diffuse, inout vec3 diffuseColor, inout vec3 specularColor ) {
					vec3 reflection = normalize( reflect( -sunDirection, surfaceNormal ) );
					float direction = max( 0.0, dot( eyeDirection, reflection ) );
					specularColor += pow( direction, shiny ) * sunColor * spec;
					diffuseColor += max( dot( sunDirection, surfaceNormal ), 0.0 ) * sunColor * diffuse;
				}

				#include <common>
				#include <packing>
				#include <bsdfs>
				#include <fog_pars_fragment>
				#include <logdepthbuf_pars_fragment>
				#include <lights_pars_begin>
				#include <shadowmap_pars_fragment>
				#include <shadowmask_pars_fragment>

				void main() {

					#include <logdepthbuf_fragment>
					// Directional wind waves carry the large reflected shapes. Capillary
          // waves resolve only while their wavelength spans a screen pixel.
          vec2 surface=worldPosition.xz;
          vec2 footprint=fwidth(surface);
          float pixel=max(footprint.x,footprint.y);
          vec4 noise=getNoise(surface*size);
          vec2 swell=texture2D(normalSampler,surface*.0051+vec2(.002,-.004)*time).rg-.5;
          vec2 chop=texture2D(normalSampler,surface*vec2(.046,.070)-vec2(.018,.009)*time).rg-.5;
          vec2 capillary=texture2D(normalSampler,surface*.245+vec2(.041,-.031)*time).rg-.5;
          float wind=.72+.37*noise.r+.26*sin(surface.y*.0027+surface.x*.006);
          vec2 train=vec2(.55,-.835);
          float broad=dot(surface,train);
          swell+=train*(.23*sin(broad*.076-time*1.07+13.*swell.x)+.12*sin(broad*.144-time*1.36));
          vec2 slope=(swell*.24+chop*.44*(1.-smoothstep(.55,7.,pixel))
                       +capillary*.20*(1.-smoothstep(.12,1.2,pixel)))*wind;
          vec3 surfaceNormal=normalize(vec3(slope.x,1.,slope.y));
          vec3 worldToEye=eye-worldPosition.xyz;
          vec3 eyeDirection=normalize(worldToEye);
          float distance=length(worldToEye);
          vec2 projection=mirrorCoord.xy/mirrorCoord.w;
          vec2 warp=surfaceNormal.xz*distortionScale*(.11+.64/max(5.,distance));
          vec2 uvReflection=clamp(projection+warp,vec2(.002),vec2(.998));
          vec2 blur=vec2(.0009,.0017)*(1.+.45*wind);
          vec3 reflectionSample=.5*texture2D(mirrorSampler,uvReflection).rgb
            +.25*texture2D(mirrorSampler,clamp(uvReflection+blur,0.,1.)).rgb
            +.25*texture2D(mirrorSampler,clamp(uvReflection-blur,0.,1.)).rgb;
          float theta=clamp(dot(eyeDirection,surfaceNormal),0.,1.);
          float reflectance=.033+.967*pow(1.-theta,3.65);
          vec3 halfVector=normalize(eyeDirection+sunDirection);
          float cosHalf=max(dot(halfVector,surfaceNormal),.001);
          float rough=.057+.023*wind;
          float variance=rough*rough;
          float microfacets=variance/(3.14159*pow(max(.0001,1.+(variance-1.)*cosHalf*cosHalf),2.));
          float sunSpecular=.00095*microfacets/(.16+theta);
          float windPatch=smoothstep(.38,.96,wind);
          vec3 scattered=waterColor*(.64+.26*theta+.13*wind+.43*dot(slope,normalize(sunDirection.xz)));
          scattered+=vec3(.010,.018,.023)*windPatch;
          vec3 outgoingLight=mix(scattered,reflectionSample,reflectance)
            +sunColor*min(.94,sunSpecular)*getShadowMask();
          gl_FragColor = vec4( outgoingLight, alpha );

					#include <tonemapping_fragment>
					#include <colorspace_fragment>
					#include <fog_fragment>	
				}`

		};

		const material = new ShaderMaterial( {
			name: mirrorShader.name,
			extensions: { derivatives: true },
			uniforms: UniformsUtils.clone( mirrorShader.uniforms ),
			vertexShader: mirrorShader.vertexShader,
			fragmentShader: mirrorShader.fragmentShader,
			lights: true,
			side: side,
			fog: fog
		} );

		material.uniforms[ 'mirrorSampler' ].value = renderTarget.texture;
		material.uniforms[ 'textureMatrix' ].value = textureMatrix;
		material.uniforms[ 'alpha' ].value = alpha;
		material.uniforms[ 'time' ].value = time;
		material.uniforms[ 'normalSampler' ].value = normalSampler;
		material.uniforms[ 'sunColor' ].value = sunColor;
		material.uniforms[ 'waterColor' ].value = waterColor;
		material.uniforms[ 'sunDirection' ].value = sunDirection;
		material.uniforms[ 'distortionScale' ].value = distortionScale;

		material.uniforms[ 'eye' ].value = eye;

		scope.material = material;

		scope.onBeforeRender = function ( renderer, scene, camera ) {

			mirrorWorldPosition.setFromMatrixPosition( scope.matrixWorld );
			cameraWorldPosition.setFromMatrixPosition( camera.matrixWorld );

			rotationMatrix.extractRotation( scope.matrixWorld );

			normal.set( 0, 0, 1 );
			normal.applyMatrix4( rotationMatrix );

			view.subVectors( mirrorWorldPosition, cameraWorldPosition );

			// Avoid rendering when mirror is facing away

			if ( view.dot( normal ) > 0 ) return;

			view.reflect( normal ).negate();
			view.add( mirrorWorldPosition );

			rotationMatrix.extractRotation( camera.matrixWorld );

			lookAtPosition.set( 0, 0, - 1 );
			lookAtPosition.applyMatrix4( rotationMatrix );
			lookAtPosition.add( cameraWorldPosition );

			target.subVectors( mirrorWorldPosition, lookAtPosition );
			target.reflect( normal ).negate();
			target.add( mirrorWorldPosition );

			mirrorCamera.position.copy( view );
			mirrorCamera.up.set( 0, 1, 0 );
			mirrorCamera.up.applyMatrix4( rotationMatrix );
			mirrorCamera.up.reflect( normal );
			mirrorCamera.lookAt( target );

			mirrorCamera.far = camera.far; // Used in WebGLBackground

			mirrorCamera.updateMatrixWorld();
			mirrorCamera.projectionMatrix.copy( camera.projectionMatrix );

			// Update the texture matrix
			textureMatrix.set(
				0.5, 0.0, 0.0, 0.5,
				0.0, 0.5, 0.0, 0.5,
				0.0, 0.0, 0.5, 0.5,
				0.0, 0.0, 0.0, 1.0
			);
			textureMatrix.multiply( mirrorCamera.projectionMatrix );
			textureMatrix.multiply( mirrorCamera.matrixWorldInverse );

			// Now update projection matrix with new clip plane, implementing code from: http://www.terathon.com/code/oblique.html
			// Paper explaining this technique: http://www.terathon.com/lengyel/Lengyel-Oblique.pdf
			mirrorPlane.setFromNormalAndCoplanarPoint( normal, mirrorWorldPosition );
			mirrorPlane.applyMatrix4( mirrorCamera.matrixWorldInverse );

			clipPlane.set( mirrorPlane.normal.x, mirrorPlane.normal.y, mirrorPlane.normal.z, mirrorPlane.constant );

			const projectionMatrix = mirrorCamera.projectionMatrix;

			q.x = ( Math.sign( clipPlane.x ) + projectionMatrix.elements[ 8 ] ) / projectionMatrix.elements[ 0 ];
			q.y = ( Math.sign( clipPlane.y ) + projectionMatrix.elements[ 9 ] ) / projectionMatrix.elements[ 5 ];
			q.z = - 1.0;
			q.w = ( 1.0 + projectionMatrix.elements[ 10 ] ) / projectionMatrix.elements[ 14 ];

			// Calculate the scaled plane vector
			clipPlane.multiplyScalar( 2.0 / clipPlane.dot( q ) );

			// Replacing the third row of the projection matrix
			projectionMatrix.elements[ 2 ] = clipPlane.x;
			projectionMatrix.elements[ 6 ] = clipPlane.y;
			projectionMatrix.elements[ 10 ] = clipPlane.z + 1.0 - clipBias;
			projectionMatrix.elements[ 14 ] = clipPlane.w;

			eye.setFromMatrixPosition( camera.matrixWorld );

			// Render

			const currentRenderTarget = renderer.getRenderTarget();

			const currentXrEnabled = renderer.xr.enabled;
			const currentShadowAutoUpdate = renderer.shadowMap.autoUpdate;

			scope.visible = false;

			renderer.xr.enabled = false; // Avoid camera modification and recursion
			renderer.shadowMap.autoUpdate = false; // Avoid re-computing shadows

			renderer.setRenderTarget( renderTarget );

			renderer.state.buffers.depth.setMask( true ); // make sure the depth buffer is writable so it can be properly cleared, see #18897

			if ( renderer.autoClear === false ) renderer.clear();
			renderer.render( scene, mirrorCamera );

			scope.visible = true;

			renderer.xr.enabled = currentXrEnabled;
			renderer.shadowMap.autoUpdate = currentShadowAutoUpdate;

			renderer.setRenderTarget( currentRenderTarget );

			// Restore viewport

			const viewport = camera.viewport;

			if ( viewport !== undefined ) {

				renderer.state.viewport( viewport );

			}

		};

	}

}


  const survey=window.ALASKA_SURVEY;
  const unpack=s=>new Int16Array(Uint8Array.from(atob(s),c=>c.charCodeAt(0)).buffer);
  const near=unpack(survey.inner), far=unpack(survey.outer);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function sample(grid,n,half,x,z){
    const u=clamp((x+half)*(n-1)/(2*half),0,n-1),v=clamp((z+half)*(n-1)/(2*half),0,n-1);
    const i=Math.min(n-2,Math.floor(u)),j=Math.min(n-2,Math.floor(v)),k=j*n+i;
    const a=u-i,b=v-j;
    if(a+b<1)return (grid[k]*(1-a-b)+grid[k+1]*a+grid[k+n]*b)/8;
    return (grid[k+n+1]*(a+b-1)+grid[k+n]*(1-a)+grid[k+1]*(1-b))/8;
  }
  const undulations=Uint8Array.from(atob(survey.iceRelief),c=>c.charCodeAt(0));
  function iceRelief(x,z){
    if(x<=-1200||x>=2800||z<=-4800||z>=-400)return 0;
    const u=(x+1200)/5,v=(z+4800)/5,i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j,k=j*801+i;
    return ((1-b)*(undulations[k]*(1-a)+undulations[k+1]*a)+b*(undulations[k+801]*(1-a)+undulations[k+802]*a)-128)/7;
  }
  // Stereo-derived ArcticDEM surface residuals preserve measured fins, drainage cuts and ice furrows
  // while the contemporary shoreline and tree-free ground elevations continue to govern the valley floor.
  const relief=new Int8Array(Uint8Array.from(atob(survey.relief8),c=>c.charCodeAt(0)).buffer);
  function reliefHeight(x,z){
    if(Math.abs(x)>=7200||Math.abs(z)>=7200)return 0;
    const u=(x+7200)/8,v=(z+7200)/8,i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j,k=j*1801+i;
    if(a+b<1)return .5*(relief[k]*(1-a-b)+relief[k+1]*a+relief[k+1801]*b);
    return .5*(relief[k+1802]*(a+b-1)+relief[k+1801]*(1-a)+relief[k+1]*(1-b));
  }
  const crest=new Int8Array(Uint8Array.from(atob(survey.crest3),c=>c.charCodeAt(0)).buffer);
  function crestHeight(x,z){
    if(x<=-3600||x>=-1200||z<=-4200||z>=-1200)return 0;
    const u=(x+3600)/3,v=(z+4200)/3,i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j,k=j*801+i;
    return .125*((1-b)*((1-a)*crest[k]+a*crest[k+1])+b*((1-a)*crest[k+801]+a*crest[k+802]));
  }
  function surveyElevation(x,z){
    const d=Math.max(Math.abs(x),Math.abs(z));
    const outer=()=>sample(far,601,18000,x,z)+window.rangeRelief('alaska',x,z)*THREE.MathUtils.smoothstep(d,6900,7700);
    if(d>=4800)return outer()+reliefHeight(x,z);
    const local=sample(near,961,4800,x,z)+iceRelief(x,z)+crestHeight(x,z);
    return reliefHeight(x,z)+(d>4650?THREE.MathUtils.lerp(local,sample(far,601,18000,x,z),(d-4650)/150):local);
  }
  const flow=[[1080,895],[1000,870],[946,821],[890,765],[819,711],[754,732],[696,743],[660,734],[636,696],[602,670],[567,653],[539,643],[522,644],[507,656],[493,669],[474,680]];
  // A treetop or protruding DEM triangle in a narrow chute can put a dry
  // triangular wall through the water. Constrain only the incised channel to
  // a downhill bed; the surrounding ridge retains its original elevation.
  const channel=[];
  let downstream=surveyElevation(...flow[0]);
  for(let i=1;i<flow.length;i++){
    const [ax,az]=flow[i-1],[bx,bz]=flow[i],dx=bx-ax,dz=bz-az;
    const bottom=Math.max(-.35,Math.min(downstream,surveyElevation(bx,bz)));
    channel.push({ax,az,dx,dz,inv:1/(dx*dx+dz*dz),top:downstream,bottom});
    downstream=bottom;
  }
  function channelAt(x,z){
    if(x<435||x>1120||z<605||z>933)return null;
    let nearest=34*34,hit=null;
    for(const reach of channel){
      const u=clamp(((x-reach.ax)*reach.dx+(z-reach.az)*reach.dz)*reach.inv,0,1);
      const distance2=(x-reach.ax-u*reach.dx)**2+(z-reach.az-u*reach.dz)**2;
      if(distance2<nearest){nearest=distance2;hit={distance:Math.sqrt(distance2),bed:reach.top+(reach.bottom-reach.top)*u};}
    }
    return hit;
  }
  function elevation(x,z){
    const y=surveyElevation(x,z),p=channelAt(x,z);
    if(!p)return y;
    const blend=THREE.MathUtils.smoothstep(p.distance,8,34);
    return THREE.MathUtils.lerp(p.bed+Math.max(0,p.distance-5)*.24,y,blend);
  }
  const height=(x,z)=>Math.max(0,elevation(x,z));
  const loader=new THREE.TextureLoader();
  function map(file,wrap=false){const t=loader.load(file);t.anisotropy=12;if(wrap)t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;}
  const sun=new THREE.Vector3(-.67,.32,-.74).normalize();
  scene.fog=new THREE.FogExp2(0xc8c3c0,.000037);
  const key=new THREE.DirectionalLight(0xffd6a1,2.64);key.position.copy(sun).multiplyScalar(2000);
  scene.add(new THREE.HemisphereLight(0xceebff,0x636b72,1.34),key);
  const skyMap=map('alaska-evening.jpg');skyMap.wrapS=THREE.RepeatWrapping;
  const sky=new THREE.Mesh(new THREE.SphereGeometry(1,32,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,
    uniforms:{sky:{value:skyMap}},vertexShader:`varying vec3 ray;void main(){ray=position;vec4 p=projectionMatrix*vec4(mat3(viewMatrix)*position,1.);gl_Position=p.xyww;}`,
    fragmentShader:`varying vec3 ray;uniform sampler2D sky;void main(){vec3 d=normalize(ray);vec2 uv=vec2(.968+atan(d.z,d.x)*.15915494,.5+asin(d.y)*.31830989);vec3 c=texture2D(sky,uv).rgb; gl_FragColor=vec4(mix(c,vec3(.98,.79,.64),.09*exp(-abs(d.y)*6.)),1.);}`}));
  sky.frustumCulled=false;sky.renderOrder=-1000;scene.add(sky);
  const outerPhoto=map('alaska-horizon.jpg');
  const snow=map('alaska-snow.jpg',true),cliff=map('rock.jpg',true),earth=map('alpine-tundra.webp',true);
  const glacierFace=map('alaska-ice-face.jpg',true), mountain=map('alaska-mountain.jpg',true);
  glacierFace.wrapS=glacierFace.wrapT=mountain.wrapS=mountain.wrapT=THREE.MirroredRepeatWrapping;
  const terrainLight=map('alaska-sun.webp'),iceDetail=map('alaska-ice-relief.webp'),blueIce=map('alaska-blue-ice.webp',true);
  blueIce.wrapS=blueIce.wrapT=THREE.MirroredRepeatWrapping;
  const ridgeRock=map('cliff-strata.jpg',true), ridgeNormal=map('cliff-strata-normal.jpg',true);
  const alpineRelief=map('alaska-alpine-relief.webp');
  const ground=new THREE.ShaderMaterial({uniforms:{alpineRelief:{value:alpineRelief},ridgeRock:{value:ridgeRock},ridgeNormal:{value:ridgeNormal},lightMap:{value:terrainLight},iceDetail:{value:iceDetail},blueIce:{value:blueIce},face:{value:glacierFace},mountain:{value:mountain},localPhoto:{value:outerPhoto},photoRect:{value:new THREE.Vector4(-18000,-18000,36000,0)},outerPhoto:{value:outerPhoto},snow:{value:snow},cliff:{value:cliff},earth:{value:earth},sun:{value:sun}},
    vertexShader:`varying vec3 p,n;void main(){p=position;n=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform sampler2D alpineRelief,ridgeRock,ridgeNormal;uniform vec4 photoRect;varying vec3 p,n;uniform sampler2D lightMap,iceDetail,blueIce,face,mountain,localPhoto,outerPhoto,snow,cliff,earth;uniform vec3 sun;

    // Sample a ninety-metre photographed turf and scree outcrop. The measured
    // displacement shifts protruding stones across the line of sight during a
    // low pass. Offset orientations suppress a visible square repeat.
    vec3 tundraColour(sampler2D scan,vec3 pos,vec3 geom,vec3 aerialColour,float range){
      vec3 view=normalize(cameraPosition-pos);
      vec2 parallax=view.xz/max(.23,abs(dot(view,geom)))*(.017*(1.-smoothstep(65.,360.,range)));
      vec2 u=vec2(pos.x,-pos.z)/87.;
      mat2 turn=mat2(.927,.375,-.375,.927);
      vec2 v=turn*u*.879+vec2(.371,.682);
      float blend=smoothstep(-.65,.66,sin(pos.x*.0107+pos.z*.0063)+.62*cos(pos.z*.0142));
      float first=texture2D(scan,u).a-.48;
      float second=texture2D(scan,v).a-.48;
      vec3 capture=mix(texture2D(scan,u+parallax*vec2(1.,-1.)*first).rgb,
                       texture2D(scan,v+turn*(parallax*vec2(1.,-1.))*second).rgb,blend);
      float Y=dot(capture,vec3(.26,.57,.17));
      float parent=dot(aerialColour,vec3(.26,.57,.17));
      vec3 tin=mix(aerialColour/(parent+.035),capture/(Y+.03),.28);
      return tin*clamp(.34+.58*parent,.34,.78)*clamp((Y+.03)/.295,.38,1.64);
    }
    void main(){vec2 uv=vec2(p.x,-p.z)/9600.+.5;float q=max(abs(p.x),abs(p.z));
      vec2 uvLocal=(p.xz-photoRect.xy)/photoRect.z;
      uvLocal=(uvLocal+photoRect.w)/(1.+2.*photoRect.w);uvLocal.y=1.-uvLocal.y;
      vec3 base=mix(texture2D(localPhoto,uvLocal).rgb,texture2D(outerPhoto,vec2(p.x,-p.z)/36000.+.5).rgb,smoothstep(6900.,7180.,q));
      vec3 nn=normalize(n);float d=distance(cameraPosition,p);
      vec2 iuv=vec2((p.x+1200.)/4000.,(-400.-p.z)/4400.);
      vec3 irr=texture2D(iceDetail,iuv).rgb;
      float sheet=irr.b*float(p.x>-1200.&&p.x<2800.&&p.z<-400.&&p.z>-4800.);
      float ice=sheet;float snowfield=smoothstep(.56,.8,max(base.b,base.r))*smoothstep(.39,.63,base.g);
      vec3 weights=pow(abs(nn),vec3(4.));weights/=max(.001,weights.x+weights.y+weights.z);
      vec3 stone=texture2D(cliff,p.zy*.088).rgb*weights.x+texture2D(cliff,p.xz*.088).rgb*weights.y+texture2D(cliff,p.xy*.088).rgb*weights.z;
      float forest=smoothstep(.004,.05,base.g-base.r)*smoothstep(.012,.085,base.g-base.b);
      vec3 substrate=mix(stone,texture2D(earth,p.xz*.14).rgb,forest);
      float fleck=dot(substrate,vec3(.30,.54,.16));base*=mix(.73+fleck*.68,1.,smoothstep(120.,1900.,d));
      vec3 ridgeTex=texture2D(mountain,p.zy/94.).rgb*weights.x+texture2D(mountain,p.xz/94.).rgb*weights.y+texture2D(mountain,p.xy/94.).rgb*weights.z;
      float rockiness=(1.-snowfield)*(1.-ice)*smoothstep(.23,.87,1.-nn.y+.36*(1.-forest));
      float slabs=smoothstep(.095,.45,1.-nn.y)*(1.-ice)*(1.-forest*.72)*(1.-snowfield)*(1.-smoothstep(180.,1150.,d));
      vec3 stratum=texture2D(mountain,vec2((p.x+.4*p.z)/186.,(p.y+.23*p.x)/91.)).rgb;
      float chips=dot(ridgeTex,vec3(.23,.64,.13)),stripes=dot(stratum,vec3(.23,.64,.13));
      vec3 outcrop=mix(vec3(.14,.16,.18),vec3(.69,.67,.62),smoothstep(.19,.66,.57*chips+.43*stripes));
      base=mix(base,outcrop*clamp(.6+.9*dot(base,vec3(.24,.60,.16)),.7,1.35),slabs*.75);
      base=mix(base,mix(base,vec3(dot(base,vec3(.3,.59,.11))),.28)*(.53+ridgeTex*1.67),rockiness*.64*(1.-smoothstep(260.,1400.,d)));
      // In shade, a sky-facing granite surface retains its cool diffuse albedo.
      // Project two scales of photographic rock and its measured normal onto the cut face.
      float rocky=max(smoothstep(.16,.55,1.-nn.y)*(1.-forest*.73),smoothstep(490.,870.,p.y)*.68);
      rocky*=1.-max(snowfield,sheet);
      float axis=abs(nn.x)/(abs(nn.x)+abs(nn.z)+.0001);
      float horizon=p.y+.19*p.x-.11*p.z+7.*sin(p.z*.006)+3.4*sin(p.x*.011);
      vec2 slopeA=vec2(p.z,horizon)*vec2(.026,.040),slopeB=vec2(-p.x,horizon)*vec2(.026,.040);
      vec3 seams=mix(texture2D(ridgeRock,slopeB*.40).rgb,texture2D(ridgeRock,slopeA*.40).rgb,axis);
      vec3 skin=mix(texture2D(ridgeRock,slopeB).rgb,texture2D(ridgeRock,slopeA).rgb,axis);
      vec3 fracture=mix(texture2D(ridgeNormal,slopeB).rgb,texture2D(ridgeNormal,slopeA).rgb,axis)*2.-1.;
      vec3 tn=normalize(vec3(nn.z+.0001,0.,-nn.x)),bn=cross(nn,tn);
      vec3 faceN=normalize(nn+rocky*(tn*fracture.x+bn*fracture.y)*.94);
      float vein=dot(seams*.61+skin*.39,vec3(.26,.56,.18));
      float sunDot=dot(faceN,sun), reflectance=dot(base,vec3(.26,.55,.19));
      vec3 gray=mix(vec3(.23,.26,.28),vec3(.74,.72,.67),smoothstep(.19,.77,vein));
      gray*=.80+.27*clamp(reflectance*2.9,0.,1.)+.17*max(0.,sunDot);
      float nearFace=.88-.36*smoothstep(650.,3200.,d);
      // Stable aerial colour anchors the broad formations. Fine side-projected
      // fractures remain visible on a rock wall during the last part of an approach.
      base=mix(base,gray,rocky*nearFace*(.78-.30*smoothstep(240.,1600.,d)));
      float crag=texture2D(cliff,p.xz/43.+p.y*.003).r;
      base*=1.+(crag-.47)*.40*(1.-snowfield)*(1.-ice)*(1.-smoothstep(1700.,5000.,d));
      vec2 snowUV=p.xz*.12;float grain=texture2D(snow,snowUV).r;
      base*=1.+(.25*(grain-.65))*max(ice,snowfield)*(1.-smoothstep(70.,1200.,d));
      float front=texture2D(lightMap,uv).b*(1.-smoothstep(4500.,4800.,q));
      float vert=smoothstep(.05,.86,1.-nn.y);
      vec3 wall=texture2D(face,vec2((p.x+.68*p.z)/208.,p.y/53.)).rgb;
      vec3 serration=texture2D(face,vec2((p.x+.34*p.z)/124.,p.z/110.+p.y/80.)).rgb;
      base=mix(base,mix(serration,wall,vert)*vec3(.92,1.,1.02),smoothstep(.03,.34,front)*(.72+.28*vert));
      vec2 coords=p.xz/132.+vec2(.18*sin(p.z/124.),.19*cos(p.x/170.));
      vec3 icephoto=texture2D(blueIce,coords).rgb;
      float braid=dot(icephoto,vec3(.23,.63,.14));float light=dot(nn,sun);
      vec3 oldIce=base;
      vec3 clearIce=mix(vec3(.16,.47,.59),vec3(.88,.94,.94),smoothstep(.31,.91,braid));
      vec3 milk=mix(clearIce,oldIce,.32);
      milk=mix(milk,vec3(.09,.30,.39)*(.8+.24*braid),irr.r*(.48+.2*(1.-irr.g)));
      milk*=mix(vec3(.72,.85,.94),vec3(1.14,1.045,.935),smoothstep(-.48,.74,light));
      float cutBand=texture2D(iceDetail,iuv).r*sheet;
      float inBasin=smoothstep(450.,1600.,-p.z);
      milk=mix(milk,base*vec3(.76,.98,1.05),inBasin*.79);
      milk*=1.-.24*cutBand;
      base=mix(base,milk,sheet*(.46+.38*(1.-smoothstep(420.,2400.,d))));
      vec2 lightmap=texture2D(lightMap,uv).rg;
      float sunlit=mix(1.,lightmap.r,1.-smoothstep(4400.,4800.,q));
      vec3 diffuse=mix(vec3(.82,.88,.95),vec3(1.12,1.04,.94),clamp(.34+.66*light,0.,1.)*sunlit);
      base*=mix(diffuse,vec3(1.),sheet*.51)*(.90+.10*lightmap.g);
      base+=vec3(.017,.025,.035)*(1.-sunlit)*rocky;
      base=clamp((base-.37)*1.035+.373,0.,1.);
      // Talus and mineral grains break into smaller scales at low altitude, with a
      // blue-grey ambient contribution on ridges away from the setting sun.
      vec3 micro=mix(texture2D(cliff,p.zy*.29).rgb,texture2D(cliff,p.xy*.29).rgb,axis);
      float granule=dot(micro,vec3(.26,.58,.16));
      float scree=clamp((granule-.38)*.91+(vein-.45)*.54,-.33,.37);
      base*=1.+rocky*scree*(1.-smoothstep(65.,520.,d));
      base*=1.+snowfield*.28*(grain-.47)*(1.-smoothstep(120.,1050.,d));
      float alpineFloor=(1.-forest)*(1.-max(sheet,snowfield))*smoothstep(220.,710.,p.y)
                        *smoothstep(.45,.88,nn.y)*(1.-smoothstep(450.,1380.,d));
      if(alpineFloor>.001){
        vec3 capture=tundraColour(earth,p,nn,base,d);
        base=mix(base,capture,.86*alpineFloor);
      }
      vec2 ridgeUV=vec2(p.x,-p.z)/14400.+.5;
      float surveyed=1.-smoothstep(6960.,7200.,q);
      vec4 measured=texture2D(alpineRelief,clamp(ridgeUV,0.,1.));
      vec3 relief=measured.rgb;
      float exposed=clamp((measured.a-.24)/.76,0.,1.)*(1.-max(snowfield,sheet))*surveyed;
      if(exposed>.02 && d<9500.){
        // A nadir image contains almost no samples on a vertical surface. Map
        // the photographed glacially polished walls along the valley side and
        // follow the local strata dip; the survey determines exposure to view.
        float cliffWeight=smoothstep(.035,.62,1.-nn.y);
        vec2 wallUv=vec2((p.x*.79-p.z*.61)/145.,(p.y-.18*p.z+.09*p.x)/88.);
        vec2 floorUv=vec2(p.x*.69+p.z*.71,-p.z*.69+p.x*.71)/107.;
        float side=.18+.80*cliffWeight;
        vec2 drift=vec2(.052*sin(p.z*.013),.064*sin(p.x*.018));
        // Blend the samples, not their coordinates: mixing metre-based
        // coordinates by a varying normal would stretch the river banks.
        vec3 cliffPhoto=mix(texture2D(mountain,floorUv+drift).rgb,
                           texture2D(mountain,wallUv+drift).rgb,side);
        vec3 wide=mix(texture2D(mountain,floorUv*.46+.23).rgb,
                      texture2D(mountain,wallUv*.46+.41).rgb,side);
        float rockLuma=dot(.69*cliffPhoto+.31*wide,vec3(.24,.59,.17));
        float mineral=clamp((rockLuma-.075)*3.9,0.,1.);
        vec3 schist=mix(vec3(.147,.158,.168),vec3(.69,.684,.642),mineral);
        float grains=dot(mix(texture2D(cliff,floorUv*17.).rgb,
                             texture2D(cliff,wallUv*17.).rgb,side),vec3(.25,.56,.19));
        schist*=.86+.28*grains;
        float parent=dot(base,vec3(.25,.57,.18));
        schist*=clamp(.82+.45*parent,.80,1.13);
        float rockFace=exposed*(.74+.23*cliffWeight)*(1.-.72*alpineFloor)
                      *(1.-.32*smoothstep(2300.,9500.,d));
        base=mix(base,schist,rockFace);
      }
      // Signed local slope and curvature from the 3 m ArcticDEM. Lighting
      // follows the measured rock fins and ice cuts across the entire approach.
      vec2 stride=vec2(.0014,0.);
      float surround=.25*(texture2D(alpineRelief,ridgeUV+stride).g+texture2D(alpineRelief,ridgeUV-stride).g
        +texture2D(alpineRelief,ridgeUV+stride.yx).g+texture2D(alpineRelief,ridgeUV-stride.yx).g);
      float facetDetail=(measured.g-surround)*2.;
      float rockExposure=max(exposed,.52*(1.-forest)*smoothstep(.14,.42,1.-nn.y));
      base*=exp2(facetDetail*surveyed*(.21+1.25*rockExposure+.70*sheet));
      float viewSky=mix(1.,relief.b,surveyed);
      float beam=mix(clamp(.45+1.6*light,0.,1.),relief.r,surveyed);
      float facet=mix(light,relief.g*2.-1.,surveyed*(1.-.83*forest));
      float incident=max(0.,facet);
      float shadow=beam*(.22+.78*sqrt(incident));
      vec3 diffuseSky=vec3(.59,.69,.83)*(.78+.24*viewSky);
      vec3 warmDirect=vec3(.74,.50,.27)*shadow;
      vec3 bounced=vec3(.085,.058,.040)*(1.-viewSky);
      base*=diffuseSky+bounced+warmDirect;
      // Shallow cuts reflect blue skylight. Direct sunlight scatters from the
      // snow lip while the deeper crevasse keeps its saturated blue-green ice.
      float fissure=sheet*irr.r*(1.-irr.g);
      base*=mix(vec3(1.),vec3(.43,.71,.84),fissure);
      base+=vec3(.038,.057,.067)*(1.-beam)*sheet;
      // An oblique photograph retains the vertical seams and dirty mineral
      // bands which cannot be resolved in the overhead glacier survey.
      float terminus=smoothstep(.21,.65,front)*smoothstep(.20,.74,1.-nn.y);
      vec2 frontUV=vec2((p.x+.51*p.z)/179.,(p.y+3.5*sin(p.x*.016))/33.);
      float slab=texture2D(face,frontUV).g;
      frontUV.x+=(slab-.59)*.014*normalize(cameraPosition-p).x;
      vec3 fractured=texture2D(face,frontUV).rgb;
      fractured*=diffuseSky+warmDirect+vec3(.055,.082,.093);
      base=mix(base,fractured,terminus*.71);
      vec3 V=normalize(cameraPosition-p),H=normalize(sun+V);
      float sheen=pow(max(0.,dot(H,faceN)),30.)*(1.-.85*forest);
      base+=vec3(.125,.124,.108)*beam*sheen*(.38*rocky+sheet);
      float nearAir=exp(-max(0.,cameraPosition.y+p.y)/1250.);
      float againstSun=pow(max(0.,dot(-V,sun)),3.);
      float haze=1.-exp(-d*(.000025+.000054*nearAir)*(1.+.45*againstSun));
      base=mix(base,mix(vec3(.57,.67,.79),vec3(.90,.77,.68),againstSun),haze);
      gl_FragColor=vec4(base,1.);}`});
  const terrainLods=[],indexLods=new Map();
  function gridIndex(nx,nz,pitch){
    const key=nx+'/'+nz+'/'+pitch;
    if(indexLods.has(key))return indexLods.get(key);
    const w=nx+1,ix=[],index=(x,z)=>z*w+x;
    for(let j=0;j<nz;j+=pitch)for(let i=0;i<nx;i+=pitch){
      const r=Math.min(nx,i+pitch),b=Math.min(nz,j+pitch),a=index(i,j),c=index(r,j),d=index(i,b),e=index(r,b);
      if(pitch===1||i>0&&j>0&&r<nx&&b<nz||r-i<2||b-j<2){ix.push(a,d,c,d,e,c);continue;}
      // Preserve every external edge vertex while decimating the interior; adjacent levels share their boundary.
      const edge=[a];
      for(let z=j+(i===0?1:b-j);z<=b;z+=(i===0?1:b-j))edge.push(index(i,z));
      for(let x=i+(b===nz?1:r-i);x<=r;x+=(b===nz?1:r-i))edge.push(index(x,b));
      for(let z=b-(r===nx?1:b-j);z>=j;z-=(r===nx?1:b-j))edge.push(index(r,z));
      for(let x=r-(j===0?1:r-i);x>i;x-=(j===0?1:r-i))edge.push(index(x,j));
      const center=index((i+r)>>1,(j+b)>>1);
      for(let t=0;t<edge.length;t++)ix.push(center,edge[t],edge[(t+1)%edge.length]);
    }
    const Type=w*(nz+1)>65535?Uint32Array:Uint16Array;
    const out=new THREE.BufferAttribute(new Type(ix),1);indexLods.set(key,out);return out;
  }
  let prevLodX=Infinity,prevLodY=Infinity,prevLodZ=Infinity;
  function updateTerrainLOD(player){
    if(!player||Math.abs(player.x-prevLodX)+Math.abs(player.y-prevLodY)+Math.abs(player.z-prevLodZ)<45)return;
    prevLodX=player.x;prevLodY=player.y;prevLodZ=player.z;
    for(const t of terrainLods){
      const dx=Math.max(t.x0-player.x,0,player.x-t.x1),dz=Math.max(t.z0-player.z,0,player.z-t.z1);
      const range=Math.hypot(dx,dz);
      // Keep cliff and ice silhouettes resolved across the valley. Flat terraces
      // can spend the same pixel error budget on fewer vertices.
      const sharp=t.relief>240;
      const pitch=(t.x1-t.x0>4000||range<(sharp?2650:1450))?1:range<(sharp?6400:3300)?2:t.nx>=120?4:2;
      if(t.pitch!==pitch){t.mesh.geometry.setIndex(gridIndex(t.nx,t.nz,pitch));t.pitch=pitch;}
    }
  }
  function patch(x0,z0,x1,z1,nx,nz,material=ground){
    const w=nx+1,h=nz+1,vertices=new Float32Array(w*h*3),normal=new Float32Array(w*h*3);
    for(let j=0;j<h;j++)for(let i=0;i<w;i++){
      const k=j*w+i,x=x0+(x1-x0)*i/nx,z=z0+(z1-z0)*j/nz;
      vertices.set([x,elevation(x,z),z],k*3);
      const dx=elevation(x-3,z)-elevation(x+3,z),dz=elevation(x,z-3)-elevation(x,z+3);
      const inv=1/Math.hypot(dx,6,dz);normal.set([dx*inv,6*inv,dz*inv],k*3);

    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(vertices,3));g.setAttribute('normal',new THREE.BufferAttribute(normal,3));g.setIndex(gridIndex(nx,nz,1));g.computeBoundingSphere();const mesh=new THREE.Mesh(g,material);scene.add(mesh);
    g.computeBoundingBox();
    terrainLods.push({mesh,nx,nz,x0,z0,x1,z1,pitch:1,relief:g.boundingBox.max.y-g.boundingBox.min.y});
  }
  // A one-texel apron on each 3.6 km photographic tile preserves filtered continuity between survey panels.
  // Smaller mesh patches allow the renderer to cull unseen ridges. Five metre cells resolve the upper ice.
  for(let j=0;j<4;j++)for(let i=0;i<4;i++){
    const left=-7200+i*3600,top=-7200+j*3600;
    const material=new THREE.ShaderMaterial({uniforms:{...ground.uniforms,
      localPhoto:{value:map('alaska-ridge-'+j+'-'+i+'.webp')},photoRect:{value:new THREE.Vector4(left,top,3600,1/1200)}},
      vertexShader:ground.vertexShader,fragmentShader:ground.fragmentShader});
    for(let b=0;b<3;b++)for(let a=0;a<3;a++){
      const x=left+a*1200,z=top+b*1200;
      const icePatch=x>=-1200&&x<=1200&&z<=-400&&z>=-4800;
      const westCrest=x>=-3600&&x<-1200&&z>=-4800&&z<-1200;
      const fallsPatch=x===0&&z===0;
      const steps=fallsPatch?300:westCrest?300:icePatch?240:Math.max(Math.abs(x+600),Math.abs(z+600))<6250?120:75;
      patch(x,z,x+1200,z+1200,steps,steps,material);
    }
  }
  const edges=[-18000,-7200,7200,18000];
  for(let j=0;j<3;j++)for(let i=0;i<3;i++)if(i!==1||j!==1)
    patch(edges[i],edges[j],edges[i+1],edges[j+1],Math.ceil((edges[i+1]-edges[i])/30),Math.ceil((edges[j+1]-edges[j])/30));
  const shore=survey.shore.map(([x,z])=>({x,z}));const outline=new THREE.Shape(survey.waterEdge.map(([x,z])=>new THREE.Vector2(x,-z)));
  const waters=map('waternormals.jpg',true);
  const lake=new Water(new THREE.ShapeGeometry(outline),{textureWidth:960,textureHeight:640,waterNormals:waters,sunDirection:sun,sunColor:0xffe9cd, waterColor:0x396c70,distortionScale:1.82,fog:true});
  lake.name="Lake surface";lake.rotation.x=-Math.PI/2;lake.position.y=.18;lake.material.uniforms.size.value=3.1;scene.add(lake);
  const treeData=unpack(survey.trees),trees=[],cells=new Map(),cell=(x,z)=>Math.floor(x/48)*1024+Math.floor(z/48);
  for(let i=0;i<treeData.length;i+=3){
    const x=treeData[i],z=treeData[i+1],h=treeData[i+2],y=elevation(x,z),seed=((i*1583)%65521)/65521;
    const stream=channelAt(x,z);
    if(stream && stream.distance<10+h*.20)continue;
    const t={x,y,z,height:h,width:h*(.30+.13*seed),seed};trees.push(t);const id=cell(x,z);if(!cells.has(id))cells.set(id,[]);cells.get(id).push(t);
  }
  // Calved blocks have a fractured crown, a sloping leeward shoulder, and a
  // wave-cut waterline. Collision queries use their actual upper triangles.
  const bergs=[],iceCaps=[];
  let randSeed=45078;const random=()=>((randSeed=(Math.imul(randSeed,1664525)+1013904223)>>>0)/4294967296);
  const driftMaterial=new THREE.ShaderMaterial({
    uniforms:{iceWall:{value:glacierFace},snowGrain:{value:snow},sun:{value:sun}},
    vertexShader:`varying vec3 local,wp,normalW;
      void main(){
        local=position;wp=(modelMatrix*instanceMatrix*vec4(position,1.)).xyz;
        mat3 m=mat3(instanceMatrix);
        normalW=normalize(m*(normal/vec3(dot(m[0],m[0]),dot(m[1],m[1]),dot(m[2],m[2]))));
        gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);
      }`,
    fragmentShader:`uniform sampler2D iceWall,snowGrain;uniform vec3 sun;varying vec3 local,wp,normalW;
      void main(){
        vec3 n=normalize(normalW),v=normalize(cameraPosition-wp);
        vec2 uv=vec2((wp.x+.37*wp.z)*.053,(wp.y+.065*wp.x)*.132);
        vec3 seam=texture2D(iceWall,uv).rgb;float relief=dot(seam,vec3(.22,.64,.14));
        float snowTop=smoothstep(.52,.89,n.y)*(.61+.37*texture2D(snowGrain,wp.xz*.18).r);
        float wet=1.-smoothstep(.1,1.25,wp.y);
        vec3 glaze=mix(vec3(.12,.41,.47),vec3(.77,.89,.92),smoothstep(.30,.84,relief));
        vec3 ice=mix(glaze,mix(vec3(.64,.77,.81),vec3(.95,.97,.95),relief),snowTop);
        float light=max(0.,dot(n,sun));
        ice*=mix(vec3(.63,.76,.88),vec3(1.12,1.07,.98),.20+.80*light);
        ice*=mix(vec3(1.),vec3(.54,.78,.84),wet);
        ice+=vec3(.075,.14,.14)*pow(max(0.,dot(v,-sun)),2.)*(1.-snowTop)
            +vec3(.18,.16,.13)*pow(max(0.,dot(n,normalize(v+sun))),39.);
        gl_FragColor=vec4(ice,1.);
      }`
  });
  for(let type=0;type<4;type++){
    const xyz=[],caps=[],edges=12+type*2;
    const ring=[],cap=[],shoulder=[],under=[];
    const crackAngle=type*1.4+.53;
    for(let j=0;j<edges;j++){
      const t=2*Math.PI*j/edges,edge=.81+.12*Math.sin(3*t+type)+.10*Math.cos(5*t+.72*type);
      const x=Math.cos(t)*edge,z=Math.sin(t)*edge;
      const rake=.32*x-.15*z,chip=j%5===type%4?.16:0;
      ring.push([x*.92,-.1+chip*.3,z*.92]);
      shoulder.push([x*(.85+chip),.29+rake+.17*Math.cos(4*t+type)-chip,z*(.88+chip)]);
      cap.push([x*.54-.13,.63+.25*Math.cos(t-crackAngle)+.13*Math.sin(3*t+type),z*.51+.08]);
      under.push([x*.73,-.55,z*.76]);
    }
    function face(v0,v1,v2,upper=false){
      xyz.push(...v0,...v1,...v2);
      if(upper)caps.push([v0,v1,v2]);
    }
    const peak=[-.14,.99-.055*type,.10];
    for(let j=0;j<edges;j++){
      const k=(j+1)%edges;
      for(const [low,high] of [[under,ring],[ring,shoulder],[shoulder,cap]]){
        face(low[j],high[j],low[k],true);face(low[k],high[j],high[k],true);
      }
      face(cap[j],peak,cap[k],true);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));
    g.computeVertexNormals();g.computeBoundingSphere();iceCaps[type]=caps;
    const m=driftMaterial;
    const transforms=[];
    for(let k=0;k<85;k++){
      const x=-540+random()*870,z=-1270+random()*1380;
      if(elevation(x,z)>-1.6)continue;
      const s=1+Math.pow(random(),3)*10,rx=s*(.76+.4*random()),rz=s*(.66+random()),ry=s*(.24+.28*random()),yaw=random()*Math.PI;
      const obj=new THREE.Object3D();obj.position.set(x,-ry*.26,z);obj.rotation.y=yaw;obj.scale.set(rx,ry,rz);obj.updateMatrix();transforms.push(obj.matrix);
      bergs.push({x,z,rx,rz,ry,yaw,type});
    }
    const mesh=new THREE.InstancedMesh(g,m,transforms.length);transforms.forEach((m,k)=>mesh.setMatrixAt(k,m));mesh.computeBoundingSphere();scene.add(mesh);
  }
  // Split seracs share a photographed calving-face material. Each profile has
  // its own tilted cap, vertical fracture planes and wet blue waterline.
  const towerPositions=[],towerNormals=[],towerUvs=[],towerTint=[],towerIndex=[],pillars=[];
  let crystalSeed=728741;
  const uniform=()=>((crystalSeed=(Math.imul(crystalSeed,1664525)+1013904223)>>>0)/4294967296);
  function serac(x,z,rx,rz,rise,yaw,floating=false){
    const floor=floating?-.7:elevation(x,z)-4.2, sides=7+Math.floor(uniform()*3);
    const ring=[], top=[], samples=[];
    for(let j=0;j<sides;j++){
      const angle=(j+uniform()*.38)*Math.PI*2/sides;
      ring.push([Math.cos(angle)*(.85+uniform()*.24),Math.sin(angle)*(.86+uniform()*.27)]);
      top.push(.73+uniform()*.42);
    }
    const tiltX=(uniform()-.5)*.8,tiltZ=(uniform()-.5)*.6;
    const layer=[[-.15,.95],[.23,1.04],[.68,.91],[1,.62]];
    function face(vertices,tex){
      const o=towerPositions.length/3,a=new THREE.Vector3(...vertices[0]),b=new THREE.Vector3(...vertices[1]),c=new THREE.Vector3(...vertices[2]);
      const n=b.sub(a).cross(c.sub(a)).normalize();
      for(let k=0;k<vertices.length;k++){
        const v=vertices[k];towerPositions.push(...v);towerNormals.push(n.x,n.y,n.z);towerUvs.push(...tex[k]);
        const t=clamp((v[1]-floor)/rise,0,1);
        towerTint.push(t);
      }
      towerIndex.push(o,o+1,o+2);if(vertices.length===4)towerIndex.push(o,o+2,o+3);
    }
    const co=Math.cos(yaw),si=Math.sin(yaw);
    for(let k=0;k<layer.length;k++){
      const [level,scale]=layer[k], f=Math.max(0,level);
      samples.push(ring.map(([px,pz],j)=>{
        const w=scale*(.99+.045*Math.sin(j*4+k));
        const dx=(px*w+tiltX*f)*rx,dz=(pz*w+tiltZ*f)*rz;
        return [x+co*dx-si*dz,floor+rise*level*top[j],z+si*dx+co*dz];
      }));
    }
    let u0=uniform()*4;
    for(let j=0;j<sides;j++){
      const j1=(j+1)%sides;
      const u1=u0+Math.hypot(samples[0][j][0]-samples[0][j1][0],samples[0][j][2]-samples[0][j1][2])/45;
      for(let k=0;k<3;k++)face([samples[k][j],samples[k+1][j],samples[k+1][j1],samples[k][j1]],[[u0,layer[k][0]*rise/44],[u0,layer[k+1][0]*rise/44],[u1,layer[k+1][0]*rise/44],[u1,layer[k][0]*rise/44]]);
      const center=[x+(co*tiltX*rx-si*tiltZ*rz)*.8,floor+rise*1.01,z+(si*tiltX*rx+co*tiltZ*rz)*.8];
      face([samples[3][j],center,samples[3][j1]],[[u0,.62],[(u1+u0)*.5,.85],[u1,.64]]);u0=u1;
    }
    const extent=Math.max(rx,rz)*1.5;
    const id=cell(x,z);if(!pillarCells.has(id))pillarCells.set(id,[]);
    const block={x,z,rx,rz,co,si,y:floor,h:rise,extent};
    pillarCells.get(id).push(block);pillars.push(block);
  }
  const pillarCells=new Map();
  for(let i=0;i<1300;i++){
    const x=-500+uniform()*1700,z=-2450+uniform()*1770;
    if(iceRelief(x,z)<3.7||elevation(x,z)<12)continue;
    const s=4.3+Math.pow(uniform(),2)*11.8;
    serac(x,z,s*(.7+uniform()*.6),s*(.64+uniform()*.45),s*(.53+uniform()*1.22),uniform()*.85-.42);
  }
  // These separated calved blocks form a navigable passage on open water.
  serac(-151,-1004,27,15,28,.16,true);serac(-79,-1025,15,22,22,-.27,true);
  serac(-174,-987,10,8,8,.38,true);serac(-57,-1006,7,11,9,.24,true);
  const cg=new THREE.BufferGeometry();cg.setAttribute('position',new THREE.Float32BufferAttribute(towerPositions,3));
  cg.setAttribute('normal',new THREE.Float32BufferAttribute(towerNormals,3));cg.setAttribute('uv',new THREE.Float32BufferAttribute(towerUvs,2));cg.setAttribute('layerT',new THREE.Float32BufferAttribute(towerTint,1));cg.setIndex(towerIndex);
  const crystalMaterial=new THREE.ShaderMaterial({side:THREE.DoubleSide,uniforms:{face:{value:glacierFace},grain:{value:snow},sun:{value:sun}},
    vertexShader:`attribute float layerT;varying vec2 st;varying vec3 n,p;varying float ht;void main(){st=uv;n=normal;p=position;ht=layerT;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform sampler2D face,grain;uniform vec3 sun;varying vec2 st;varying vec3 n,p;varying float ht;
      void main(){vec3 norm=normalize(n);vec3 foto=texture2D(face,st).rgb;float l=dot(foto,vec3(.22,.64,.14));
      float light=dot(norm,sun);float edges=smoothstep(.39,.83,l);vec3 deep=vec3(.095,.39,.51),frost=vec3(.82,.92,.93);
      vec3 ice=mix(deep,frost,clamp(.28+edges*.59+ht*.14+norm.y*.1,0.,1.))*(.65+.52*l);
      ice*=mix(vec3(.68,.81,.91),vec3(1.12,1.04,.95),smoothstep(-.4,.7,light));ice+=.115*pow(max(0.,dot(reflect(-sun,norm),normalize(cameraPosition-p))),19.);
      float detail=texture2D(grain,st*9.).r;ice*=.96+.07*detail;
      gl_FragColor=vec4(mix(ice,vec3(.61,.68,.73),1.-exp(-distance(cameraPosition,p)*.000043)),1.);}`});
  cg.computeBoundingSphere();const seracs=new THREE.Mesh(cg,crystalMaterial);seracs.name='Blue ice seracs and passage';scene.add(seracs);

  // Use photogrammetric rock scans along positive-relief bedrock features extracted from the stereo survey.
  // The near and distant forms of each stone share the same root, silhouette axis, and collision surface.
  const ledges=new Map();
  let updateLedges=()=>{};
  if(window.talusScans?.length&&survey.outcrops){
    const source=unpack(survey.outcrops);
    const locKey=(x,z)=>Math.floor(x/96)*8192+Math.floor(z/96);
    const scanTexture=(url,asColor=false)=>{
      const t=map(url);
      t.flipY=false;if(asColor)t.colorSpace=THREE.SRGBColorSpace;return t;
    };
    const stoneMat=new THREE.MeshStandardMaterial({map:scanTexture('talus-colour.webp',true),normalMap:scanTexture('talus-normal.webp'),normalScale:new THREE.Vector2(.83,.83),roughness:.87});
    const bytes=(s,Type)=>new Type(Uint8Array.from(atob(s),c=>c.charCodeAt(0)).buffer);
    const batches=window.talusScans.map((scan,v)=>scan.map((level,k)=>{
      const g=new THREE.BufferGeometry();
      const p=Float32Array.from(bytes(level[0],Int16Array),s=>s/27000);
      g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setAttribute('normal',new THREE.BufferAttribute(bytes(level[1],Int8Array),3,true));
      g.setAttribute('uv',new THREE.BufferAttribute(bytes(level[2],Uint16Array),2,true));g.setIndex(new THREE.BufferAttribute(bytes(level[3],Uint16Array),1));
      g.computeBoundingBox();
      const m=new THREE.InstancedMesh(g,stoneMat,k?285:64);
      m.name='West ridge bedrock '+v+'/'+k;m.count=0;m.frustumCulled=false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(m);return m;
    }));
    const transform=new THREE.Object3D(),up=new THREE.Vector3(0,1,0),normal=new THREE.Vector3(),tint=new THREE.Color();
    for(let k=0;k<source.length;k+=5){
      const x=source[k],z=source[k+1],s=source[k+2]*.1,turn=source[k+3]/600,flatten=source[k+4]*.01;
      const y=elevation(x,z),v=(k*17)%batches.length;
      normal.set(elevation(x-3,z)-elevation(x+3,z),6,elevation(x,z-3)-elevation(x,z+3)).normalize();
      const rise=s*flatten*batches[v][0].geometry.boundingBox.max.y;
      transform.position.set(x,y-.24*rise,z);transform.quaternion.setFromUnitVectors(up,normal);transform.rotateY(-turn);
      transform.scale.set(s*(.94+((k*7)%17)*.022),s*flatten,s*.61);transform.updateMatrix();
      const r={x,y,z,s,rise,v,matrix:transform.matrix.clone()};
      const key=locKey(x,z);if(!ledges.has(key))ledges.set(key,[]);ledges.get(key).push(r);
    }
    const last=new THREE.Vector3(Infinity,Infinity,Infinity);
    updateLedges=player=>{
      if(!player||last.distanceToSquared(player)<121)return;last.copy(player);
      for(const pair of batches)for(const m of pair)m.count=0;
      const gx=Math.floor(player.x/96),gz=Math.floor(player.z/96);
      for(let ring=0;ring<9;ring++)for(let j=-ring;j<=ring;j++)for(let i=-ring;i<=ring;i++){
        if(Math.max(Math.abs(i),Math.abs(j))!==ring)continue;
        for(const r of ledges.get((gx+i)*8192+gz+j)||[]){
          const d2=(r.x-player.x)**2+(r.y-player.y)**2+(r.z-player.z)**2;
          if(d2>(100+Math.min(r.s*72,610))**2)continue;
          const m=batches[r.v][d2<(20+r.s*16)**2?0:1];if(m.count>=m.instanceMatrix.count)continue;
          const mottle=.85+.009*((Math.abs(r.x+r.z))%22);
          tint.setRGB(.93*mottle,.98*mottle,1.03*mottle);m.setColorAt(m.count,tint);m.setMatrixAt(m.count++,r.matrix);
        }
      }
      for(const pair of batches)for(const m of pair){m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;}
    };
  }

  function clearance(x,z){
    let y=height(x,z);
    const gridX=Math.floor(x/96),gridZ=Math.floor(z/96);
    for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++)for(const stone of ledges.get((gridX+i)*8192+gridZ+j)||[]){
      const r=((x-stone.x)**2+(z-stone.z)**2)/((stone.s*.55)**2);
      if(r<1)y=Math.max(y,stone.y+stone.rise*.72*Math.sqrt(1-r));
    }
    for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++)for(const t of (cells.get(cell(x+i*48,z+j*48))||[])){
      const f=Math.hypot(x-t.x,z-t.z)/(t.width*.5);if(f<1)y=Math.max(y,t.y+t.height*(1-.73*f*f));
    }
    if(y<10&&z<140&&z>-1300&&x>-560&&x<350)for(const b of bergs){
      const dx=x-b.x,dz=z-b.z;if(Math.max(Math.abs(dx),Math.abs(dz))>20)continue;
      const c=Math.cos(b.yaw),s=Math.sin(b.yaw),u=(c*dx-s*dz)/b.rx,v=(s*dx+c*dz)/b.rz;
      if(Math.abs(u)>1.1||Math.abs(v)>1.1)continue;
      for(const [a,h,k] of iceCaps[b.type]){
        const denominator=(h[2]-k[2])*(a[0]-k[0])+(k[0]-h[0])*(a[2]-k[2]);
        if(Math.abs(denominator)<.0001)continue;
        const w=((h[2]-k[2])*(u-k[0])+(k[0]-h[0])*(v-k[2]))/denominator;
        const q=((k[2]-a[2])*(u-k[0])+(a[0]-k[0])*(v-k[2]))/denominator;
        if(w>=0&&q>=0&&w+q<=1)y=Math.max(y,b.ry*(w*a[1]+q*h[1]+(1-w-q)*k[1]-.26));
      }
    }
    if(x>-800&&x<1400&&z<-450&&z>-2600)for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++)for(const b of (pillarCells.get(cell(x+i*48,z+j*48))||[])){
      const dx=x-b.x,dz=z-b.z,f=Math.hypot((dx*b.co+dz*b.si)/b.rx,(-dx*b.si+dz*b.co)/b.rz);
      if(f<1.12)y=Math.max(y,b.y+b.h*clamp((1.12-f)*2.8,0,1.07));
    }
    return y;
  }
  const clock={value:0};
  // Surveyed valley bed and the visible whitewater in the satellite image locate Nugget Falls.
  const points=[],flowUv=[],whitewater=[],idx=[];let meters=0,previous=null;
  for(let seg=0;seg<flow.length-1;seg++){
    const a=flow[seg],b=flow[seg+1],length=Math.hypot(b[0]-a[0],b[1]-a[1]),steps=Math.ceil(length/3.5);
    const vx=(b[1]-a[1])/length,vz=(a[0]-b[0])/length;
    for(let step=0;step<steps;step++){
      const f=step/steps,x=a[0]+(b[0]-a[0])*f,z=a[1]+(b[1]-a[1])*f;
      const steepness=clamp((elevation(a[0],a[1])-elevation(b[0],b[1]))/length,0,1);
      const spread=(seg<6?5.4+steepness*9.:Math.max(2.2,6.5-.35*(seg-6)))*(1+.17*Math.sin(meters*.086)+.12*Math.sin(meters*.147));
      if(previous)meters+=Math.hypot(x-previous.x,z-previous.z,elevation(x,z)-previous.y);previous={x,z,y:elevation(x,z)};
      for(let side=0;side<5;side++){
        const dx=x+(side-2)*spread*.5*vx,dz=z+(side-2)*spread*.5*vz;
        const k=points.length/3;points.push(dx,height(dx,dz)+.85,dz);flowUv.push(side/4,meters);whitewater.push(steepness);
        if(k>=5&&side>0)idx.push(k-6,k-5,k-1,k-5,k,k-1);
      }
    }
  }
  const fg=new THREE.BufferGeometry();fg.setAttribute('position',new THREE.Float32BufferAttribute(points,3));fg.setAttribute('uv',new THREE.Float32BufferAttribute(flowUv,2));fg.setIndex(idx);fg.setAttribute('aeration',new THREE.Float32BufferAttribute(whitewater,1));
  const foam=new THREE.ShaderMaterial({uniforms:{clock,noise:{value:waters}},side:THREE.DoubleSide,transparent:true,depthWrite:false,
    vertexShader:`attribute float aeration;varying vec2 f;varying float grade;
      void main(){f=uv;grade=aeration;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform float clock;uniform sampler2D noise;varying vec2 f;varying float grade;
      void main(){
        float v=f.y-clock*(3.8+7.*grade);
        float n=.6*texture2D(noise,vec2(f.x*1.45,v*.026)).r+.4*texture2D(noise,vec2(f.x*.67,v*.057)).g;
        float side=f.x+.06*sin(f.y*.065)+.04*sin(f.y*.137+clock*.43);
        float edge=smoothstep(.005,.22,min(side,1.-side)+.14*(n-.5));
        float churn=smoothstep(.04,.38,grade);
        float strands=texture2D(noise,vec2(f.x*3.4,v*.010)).g;
        float thread=.5+.5*sin(27.*f.x+3.6*strands+1.5*sin(.039*v));
        float foam=smoothstep(.25,.82,.43*n+.27*strands+.30*thread+.09*churn);
        vec3 color=mix(vec3(.34,.54,.56),vec3(.94,.96,.97),foam*(.57+.43*churn));
        gl_FragColor=vec4(color,edge*(.17+.71*churn)*(.38+.62*foam));
      }`});
  scene.add(new THREE.Mesh(fg,foam));
  const spraySources=[];
  for(let i=1;i<flow.length;i++){
    const [x,z]=flow[i],[px,pz]=flow[i-1];
    const drop=elevation(px,pz)-elevation(x,z);
    if(drop>3.5 || i===flow.length-2 || i===flow.length-1)spraySources.push({x,z,drop:Math.max(0,drop)});
    if(drop>15){
      const t=.58;
      spraySources.push({x:px+(x-px)*t,z:pz+(z-pz)*t,drop:drop*.45});
    }
  }
  const sprayPass={x:690,z:602,y:Math.max(96,clearance(690,602)+32),yaw:-2.14,glance:-8};
  const lakeLaunch={x:-269,z:-568,y:71,yaw:-.32},shoreLaunch={x:473,z:927,y:height(473,927)+8,yaw:.27},ridge={x:-860,z:-1890,y:elevation(-860,-1890)+100,yaw:-2.73};
  scene.traverse(mesh=>{
    const material=mesh.material;
    if(!material?.isShaderMaterial || mesh===lake)return;
    if(!material.uniforms.linearOutput){
      material.uniforms.linearOutput={value:false};
      const code=material.fragmentShader, end=code.lastIndexOf('}');
      material.fragmentShader='uniform bool linearOutput;\n'+code.slice(0,end)+`
        if(linearOutput){
          vec3 c=max(gl_FragColor.rgb,vec3(0.));
          gl_FragColor.rgb=mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));
        }
      }`;
    }
    mesh.onBeforeRender=(renderer,scene,camera)=>{material.uniforms.linearOutput.value=!!camera.userData.lakeReflection;};
  });
  const sunMask=map('alaska-tree-light.webp');
  return {region:"alaska",spraySources,forestLightSpan:14400,elevation,clearance,height,trees,sunMask,sunDirection:sun,skyTexture:skyMap,waterLevel:0,lakeLevel:0,lakePolygon:shore,altitudeOffset:18,spawn:lakeLaunch,
    launches:{lake:lakeLaunch,ridge,shore:shoreLaunch,spray:sprayPass,alpine:{x:-2900,z:-2010,y:elevation(-2900,-2010)+58,yaw:-.28}},bounds:{minX:-6890,maxX:6890,minZ:-6890,maxZ:6890},
    landmarks:[{name:'West alpine crest',x:-2900,z:-2010},{name:'Upper crevasse field',x:1500,z:-4130},{name:'Blue Ice Passage',x:-116,z:-1010},{name:'Nugget Falls beach',x:473,z:927},{name:'Medial moraine',x:632,z:-2450},{name:'Mendenhall Glacier',x:40,z:-1400},{name:'Nugget Falls',x:518,z:658},{name:'Mendenhall Lake',x:-700,z:680},{name:'West Glacier Ridge',x:-860,z:-1890}],
    update(dt,time,player){updateTerrainLOD(player);updateLedges(player);clock.value=time;lake.material.uniforms.time.value=time*.72;}
  };
};
