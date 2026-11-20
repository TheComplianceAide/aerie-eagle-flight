/* Water surface derived from three.js Water, MIT licensed. */
window.makeWorld = function makeWorld(THREE, scene) {
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


  const survey = window.ALPINE_SURVEY;
  const decode = data => new Int16Array(Uint8Array.from(atob(data), c => c.charCodeAt(0)).buffer);
  const heights = decode(survey.elevation);
  const region = decode(survey.region);
  const eastWall = window.eastHeadwall ? decode(window.eastHeadwall) : null;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const smooth = (a,b,x) => { const f=clamp((x-a)/(b-a),0,1); return f*f*(3-2*f); };
  const loader = new THREE.TextureLoader();
  function texture(file, repeat = false) {
    const t = loader.load(file);
    t.anisotropy = 8;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  // Each mesh cell is split along its NE/SW diagonal. Collision samples the identical surface.
  function sample(buffer, count, half, x, z) {
    const scale = (count-1)/(2*half);
    const u = clamp((x+half)*scale,0,count-1), v = clamp((z+half)*scale,0,count-1);
    const i = Math.min(count-2, Math.floor(u)), j = Math.min(count-2, Math.floor(v));
    const a = u-i, b = v-j, n = j*count+i;
    if (a+b<=1) return (buffer[n] + a*(buffer[n+1]-buffer[n]) + b*(buffer[n+count]-buffer[n]))/8;
    const opposite = buffer[n+count+1];
    return (opposite+(1-a)*(buffer[n+count]-opposite)+(1-b)*(buffer[n+1]-opposite))/8;
  }
  function elevation(x,z) {
    const border = Math.max(Math.abs(x),Math.abs(z));
    const regional=()=>sample(region,513,16000,x,z)+window.rangeRelief("swiss",x,z);
    if (border>=4000) return regional();
    const local = sample(heights,1001,4000,x,z);
    if (eastWall && x>500 && x<1500 && z>0 && z<1000) {
      const y=sample(eastWall,501,500,x-1000,z-500);
      const edge=Math.min(x-500,1500-x,z,1000-z);
      const mix=smooth(0,32,edge);
      return local*(1-mix)+(local<0 && y<1.25 ? Math.min(local,y) : y)*mix;
    }
    if (border<3900) return local;
    const blend = smooth(3900,4000,border);
    return local*(1-blend)+regional()*blend;
  }
  const shore = survey.shore.map(([x,z]) => ({x,z}));
  function insideLake(x,z) {
    if (x < -890 || x > 925 || z < -220 || z > 775) return false;
    let inside=false;
    for(let i=0,j=shore.length-1;i<shore.length;j=i++) {
      const a=shore[i], b=shore[j];
      if ((a.z>z)!==(b.z>z) && x < a.x+(b.x-a.x)*(z-a.z)/(b.z-a.z)) inside=!inside;
    }
    return inside;
  }
  const height = (x,z) => insideLake(x,z) ? Math.max(0,elevation(x,z)) : elevation(x,z);
  const sun = new THREE.Vector3(-.79,.245,.36).normalize();
  scene.fog = new THREE.FogExp2(0x9395a6,.000077);
  const hemisphere = new THREE.HemisphereLight(0xffe8db,0x737e72,1.72);
  const directional = new THREE.DirectionalLight(0xffc489,2.35);
  directional.position.copy(sun).multiplyScalar(3000);
  scene.add(hemisphere,directional);
  const skyMap = texture('sky.jpg');
  skyMap.wrapS = THREE.RepeatWrapping;
  // Panorama longitude wraps at the antimeridian. Regular bilinear sampling
  // avoids choosing a coarse mip on the single derivative-discontinuous column.
  skyMap.generateMipmaps = false;
  skyMap.minFilter = THREE.LinearFilter;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1,48,24),new THREE.ShaderMaterial({
    side:THREE.BackSide, depthWrite:false,
    uniforms:{panorama:{value:skyMap}, sun:{value:sun}},
    vertexShader:`varying vec3 ray;void main(){ray=position;vec4 p=projectionMatrix*vec4(mat3(viewMatrix)*position,1.);gl_Position=p.xyww;}`,
    fragmentShader:`uniform sampler2D panorama;uniform vec3 sun;varying vec3 ray;
      void main(){vec3 d=normalize(ray);float u=(atan(d.z,d.x)-atan(sun.z,sun.x))*.159154943+.650;
        float v=asin(clamp(d.y,-1.,1.))*.318309886+.5-.043;
        vec3 c=texture2D(panorama,vec2(u,clamp(v,.015,.998))).rgb;
        float angle=distance(d,sun);
        c*=vec3(1.04,.953,.952);c+=vec3(.20,.082,.024)*exp(-6.0*angle);
        c+=vec3(.46,.37,.24)*(1.-smoothstep(.004,.009,angle));
        gl_FragColor=vec4(c,1.);
      }`
  }));
  sky.frustumCulled=false;sky.renderOrder=-1000;scene.add(sky);
  const stone=texture('rock.jpg',true), stoneNormal=texture('granite-normal.jpg',true), earth=texture('alpine-tundra.webp',true);
  const visibility=texture('terrain-light.jpg');
  const karstLight=texture('swiss-karst-light.webp');
  const strata=texture('cliff-strata.jpg',true), strataNormal=texture('cliff-strata-normal.jpg',true), surveyNormals=texture('survey-normals.jpg');
  const alpineVertex = `varying vec3 wp,norm;varying vec2 tileUv;
    void main(){wp=position;norm=normal;tileUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
  const alpineFragment = `uniform sampler2D karstLight;uniform sampler2D photo,stone,normalMap,earth,sunMask,strata,strataNormal,surveyNormals;uniform vec3 sun;
    varying vec3 wp,norm;varying vec2 tileUv;

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
    vec3 aerial(vec3 color,float cameraDist) {
      vec3 view=normalize(wp-cameraPosition);
      float warmth=pow(max(dot(view,sun),0.),3.5);
      vec3 haze=mix(vec3(.43,.51,.62),vec3(.94,.73,.58),warmth);
      // Integrate an exponential aerosol layer along the view ray. The valley
      // floor holds more evening haze than the clear air above the cirques.
      float fromY=max(cameraPosition.y,0.)/470.;
      float toY=max(wp.y,0.)/470.;
      float delta=toY-fromY;
      float aerosol=abs(delta)<.01 ? exp(-.5*(fromY+toY)) :
        (exp(-fromY)-exp(-toY))/delta;
      float extinction=cameraDist*(.000034+.00016*aerosol)*(1.+.47*warmth);
      return mix(color,haze,1.-exp(-extinction*.71));
    }
    void main(){
      vec3 rgb=texture2D(photo,tileUv).rgb;
      vec3 n=normalize(norm); float d=distance(wp,cameraPosition);
      float lum=dot(rgb,vec3(.27,.60,.13));
      float closeup=1.-smoothstep(180.,2450.,d);
      vec2 surveyUv=vec2(wp.x+2000.,2000.-wp.z)/4000.;
      float surveyWeight=1.-smoothstep(.475,.50,max(abs(surveyUv.x-.5),abs(surveyUv.y-.5)));
      vec3 geomNormal=normalize(texture2D(surveyNormals,clamp(surveyUv,0.,1.)).rgb*2.-1.);
      n=normalize(mix(n,geomNormal,surveyWeight*(.94-.2*smoothstep(600.,2600.,d))));
      float steep=1.-smoothstep(.36,.87,n.y);
      float vegetation=smoothstep(.008,.12,rgb.g-rgb.r*.99);
      float snow=smoothstep(.62,.94,lum)*smoothstep(-.05,.015,min(rgb.b-rgb.r,rgb.g-rgb.r));
      float sheer=1.-smoothstep(.18,.54,min(n.y,normalize(norm).y));
      float rockMix=max(sheer,steep*(1.-.75*vegetation)*(1.-snow));
      // Survey photos have a vertical line of sight. Replace the directional stretch on near-vertical
      // faces using two photographic rock scans projected along the two side axes, in metres.
      float axis=abs(n.x)/(abs(n.x)+abs(n.z)+.0001);
      float bedding=wp.y+.21*wp.x+.11*wp.z+7.*sin(wp.x*.008+wp.z*.004)+2.*sin(wp.z*.024);
      vec2 uvX=vec2(wp.z,bedding), uvZ=vec2(-wp.x,bedding);
      vec3 jointA=mix(texture2D(strata,uvZ*vec2(.020,.028)).rgb,
                      texture2D(strata,uvX*vec2(.020,.028)).rgb,axis);
      vec3 jointB=mix(texture2D(strata,uvZ*vec2(.0064,.009)+vec2(.29,.78)).rgb,
                      texture2D(strata,uvX*vec2(.0064,.009)+vec2(.29,.78)).rgb,axis);
      vec3 grain=mix(texture2D(stone,uvZ*.079).rgb,texture2D(stone,uvX*.079).rgb,axis);
      vec3 normalFine=mix(texture2D(normalMap,uvZ*.079).rgb,texture2D(normalMap,uvX*.079).rgb,axis)*2.-1.;
      vec3 normalJoint=mix(texture2D(strataNormal,uvZ*vec2(.020,.028)).rgb,
                           texture2D(strataNormal,uvX*vec2(.020,.028)).rgb,axis)*2.-1.;
      vec3 mineralNormal=normalFine*.50+normalJoint*1.2;
      vec3 broad=texture2D(photo,tileUv,4.).rgb;
      float macroLum=dot(broad,vec3(.28,.55,.17));
      vec3 joint=jointA*.73+jointB*.27;
      float fault=dot(joint,vec3(.28,.55,.17));
      float detail=dot(grain,vec3(.28,.55,.17));
      vec3 localStone=mix(vec3(fault),joint,.26)*mix(.47+1.09*macroLum,.69+.32*macroLum,sheer);
      localStone*=mix(.76+.57*detail,1.,smoothstep(600.,2500.,d));
      localStone*=clamp(vec3(.88)+.32*broad/(macroLum+.10),.78,1.22);
      float sharpFace=clamp(rockMix*1.13,0.,.94);
      vec3 foldedRock=localStone*clamp(.69+.74*fault,.63,1.24);
      rgb=mix(rgb,foldedRock,sharpFace*(1.-.37*smoothstep(520.,3600.,d)));
      vec3 underfoot=texture2D(earth,wp.xz*.13).rgb;
      float alpineFloor=(1.-rockMix)*(1.-snow)*smoothstep(.47,.89,n.y)
                        *(1.-smoothstep(430.,1350.,d))*smoothstep(170.,470.,wp.y);
      if(alpineFloor>.001)rgb=mix(rgb,tundraColour(earth,wp,n,rgb,d),.72*alpineFloor);
      float soilTexture=dot(underfoot,vec3(.30,.55,.15));
      rgb*=1.+(1.-rockMix)*closeup*.65*(soilTexture-.38);
      lum=dot(rgb,vec3(.27,.60,.13));
      vec2 vd=(wp.xz+4000.)/8000.;
      float area=1.-smoothstep(.482,.500,max(abs(vd.x-.5),abs(vd.y-.5)));
      vec2 visibility=texture2D(sunMask,vec2(vd.x,1.-vd.y)).rg;
      float exposure=mix(.86,visibility.x,area);
      vec3 karst=texture2D(karstLight,clamp(surveyUv,0.,1.)).rgb;
      exposure=mix(exposure,karst.r,surveyWeight*.82);
      float skyView=mix(mix(.97,visibility.y,area),karst.g, surveyWeight*.92);
      // Hollow limestone gullies admit less blue sky than sun-facing noses.
      float jointShadow=1.-karst.b*surveyWeight*(.17+.20*rockMix);
      rgb*=jointShadow;
      vec3 tangent=normalize(vec3(n.z+.0001,0.,-n.x));
      vec3 detailN=normalize(n+rockMix*.77*(tangent*mineralNormal.x+cross(n,tangent)*mineralNormal.y));
      float diffuse=clamp(.23+.83*dot(detailN,sun),0.,1.);
      float irradiance=exposure*diffuse;
      // The aerial source already contains terrain light and contact shadows. Preserve them and grade the evening light.
      rgb=mix(rgb,vec3(lum),.055);
      rgb=pow(max(rgb,vec3(0.)),vec3(.89));
      vec3 skyFill=vec3(.59,.69,.82)*(.65+.35*skyView);
      vec3 wallBounce=vec3(.062,.035,.019)*(1.-skyView);
      rgb*=skyFill+wallBounce+irradiance*vec3(.96,.61,.29);
      if(rockMix>.20){
        float mica=max(dot(detailN,normalize(sun+normalize(cameraPosition-wp))),0.);
        rgb+=vec3(.09,.079,.066)*rockMix*exposure*pow(mica,23.)*smoothstep(.25,.71,detail);
      }
      rgb+=vec3(.012,.019,.029)*(1.-exposure);
      float peak=max(rgb.r,max(rgb.g,rgb.b));
      if(peak>.74)rgb*= (.74+(peak-.74)/(1.+2.4*(peak-.74)))/peak;
      gl_FragColor=vec4(aerial(rgb,d),1.);
    }`;
  function terrainMaterial(photo) {
    return new THREE.ShaderMaterial({
      uniforms:{karstLight:{value:karstLight},photo:{value:photo},stone:{value:stone},normalMap:{value:stoneNormal},earth:{value:earth},
        sunMask:{value:visibility},strata:{value:strata},strataNormal:{value:strataNormal},surveyNormals:{value:surveyNormals},sun:{value:sun}},
      vertexShader:alpineVertex,fragmentShader:alpineFragment
    });
  }
  function patch(minX,minZ,side,steps,material,isRegional) {
    const n=steps+1,count=n*n;
    const positions=new Float32Array(count*3), normals=new Float32Array(count*3), uvs=new Float32Array(count*2);
    const indices=count<65536?new Uint16Array(steps*steps*6):new Uint32Array(steps*steps*6);
    for(let j=0;j<n;j++)for(let i=0;i<n;i++){
      const k=j*n+i,x=minX+side*i/steps,z=minZ+side*j/steps;
      const y=elevation(x,z), delta=isRegional?31.25:Math.min(8,side/steps);
      positions[3*k]=x;positions[3*k+1]=y;positions[3*k+2]=z;
      const gx=elevation(x-delta,z)-elevation(x+delta,z),gz=elevation(x,z-delta)-elevation(x,z+delta);
      const inv=1/Math.hypot(gx,2*delta,gz);
      normals[3*k]=gx*inv;normals[3*k+1]=2*delta*inv;normals[3*k+2]=gz*inv;
      uvs[2*k]=isRegional?(x+16000)/32000:i/steps;
      uvs[2*k+1]=isRegional?(16000-z)/32000:1-j/steps;
      if(side===500){uvs[2*k]=x/2000;uvs[2*k+1]=1-z/2000;}
      if(i<steps&&j<steps){
        const q=(j*steps+i)*6;
        indices[q]=k;indices[q+1]=k+n;indices[q+2]=k+1;
        indices[q+3]=k+n;indices[q+4]=k+n+1;indices[q+5]=k+1;
      }
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(positions,3));
    g.setAttribute('normal',new THREE.BufferAttribute(normals,3));
    g.setAttribute('uv',new THREE.BufferAttribute(uvs,2));
    g.setIndex(new THREE.BufferAttribute(indices,1));g.computeBoundingSphere();
    scene.add(new THREE.Mesh(g,material));
  }
  const farMaterial=terrainMaterial(texture('high-alps.jpg'));
  for(let j=0;j<8;j++)for(let i=0;i<8;i++){
    if(i>=3&&i<=4&&j>=3&&j<=4)continue;
    patch(-16000+i*4000,-16000+j*4000,4000,140,farMaterial,true);
  }
  for(let j=0;j<4;j++)for(let i=0;i<4;i++){
    // 8 metre flight-basin vertices; distant survey panels retain coarser relief for stable frame times.
    const inner=i>0&&i<3&&j>0&&j<3;
    const x=-4000+i*2000,z=-4000+j*2000;
    const mat=terrainMaterial(texture('alpine-'+j+'-'+i+'.jpg'));
    if(eastWall && x===0 && z===0){
      for(let v=0;v<4;v++)for(let u=0;u<4;u++) {
        const detailed=(u===1||u===2)&&v<2;
        patch(u*500,v*500,500,detailed?250:64,mat,false);
      }
    }else patch(x,z,2000,inner?250:125,mat,false);
  }
  const outline = new THREE.Shape(shore.slice(0,-1).map(p=>new THREE.Vector2(p.x,-p.z)));
  const lake = new Water(new THREE.ShapeGeometry(outline),{
    textureWidth:1024,textureHeight:704,waterNormals:texture('waternormals.jpg',true),
    sunDirection:sun,sunColor:0xffdfac,waterColor:0x1d6372,distortionScale:1.13,fog:true
  });
  lake.position.y=.18;lake.rotation.x=-Math.PI/2;lake.material.uniforms.size.value=2.65;
  scene.add(lake);

  const clock={value:0};
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms:{t:{value:0},map:{value:texture('waternormals.jpg',true)}},side:THREE.DoubleSide,transparent:true,depthWrite:false,
    vertexShader:`varying vec2 tex;varying vec3 wp;void main(){tex=uv;wp=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform float t;uniform sampler2D map;varying vec2 tex;varying vec3 wp;
      void main(){float along=tex.y;float flow=along-t*12.;
        float x=tex.x+.054*sin(along*.16)+.054*sin(along*.047);
        float edge=smoothstep(.00,.22,min(x,1.-x));
        float a=texture2D(map,vec2(x*1.2,flow*.004)).r;
        float b=texture2D(map,vec2(x*2.1+.42,flow*.017+.66)).g;
        float streaks=texture2D(map,vec2(x*.51,flow*.008)).r;
        float air=smoothstep(.16,.85,a*.52+b*.31+streaks*.38);
        float eddy=texture2D(map,vec2(along*.0015,x*.10+.24)).r;
        float pocket=smoothstep(.22,.80,eddy*.63+a*.37);
        float br=(.18+.63*pocket)*(.50+.50*smoothstep(.25,.8,streaks));
        float dist=distance(wp,cameraPosition);
        float fade=exp(-dist*.00013);
        vec3 color=mix(vec3(.29,.47,.54),vec3(.93,.94,.88),.12+.85*air*pocket);
        gl_FragColor=vec4(color,edge*br*(.22+.73*air)*fade);
      }`
  });
  // Source paths follow the photographed Fründen meltwater channels on the south and eastern walls.
  const rivers=[
    [[369,1730],[379,1560],[399,1395],[425,1220],[435,1115],[458,1008],[466,953],[478,883],[479,834],[492,776],[498,739]],
    [[720,1680],[720,1540],[690,1430],[662,1320],[613,1210],[568,1128],[531,1044],[504,1020],[480,1009],[458,1008]],
    [[1890,824],[1780,786],[1670,772],[1560,786],[1440,746],[1320,680],[1230,630],[1150,600],[1090,580],[1040,570],[1010,560],[988,550],[975,550],[964,550]]
  ];
  const plumes=[];
  function cascade(path,width){
    const spline=new THREE.SplineCurve(path.map(([x,z])=>new THREE.Vector2(x,z)));
    const segments=Math.ceil(spline.getLength()/2.7),cols=8;
    const v=[],tex=[],ids=[];
    for(let j=0;j<=segments;j++) {
      const d=j/segments,p=spline.getPointAt(d),direction=spline.getTangentAt(d);
      const w=width*(.75+.33*Math.sin(d*13.6)+.27*Math.sin(d*22.5+.5)+.13*Math.cos(d*49.2));
      for(let i=0;i<=cols;i++) {
        const side=(i/cols-.5)*w;
        const x=p.x+direction.y*side,z=p.y-direction.x*side;
        v.push(x,Math.max(.35,elevation(x,z)+1.25),z);tex.push(i/cols,d*segments*2.7);
        if(i<cols&&j<segments){const a=j*(cols+1)+i,b=a+cols+1;ids.push(a,b,a+1,a+1,b,b+1);}
      }
      if(j%12===0 && d>.3) {
        const other=spline.getPointAt(Math.max(0,d-12/segments));
        if(elevation(other.x,other.y)-elevation(p.x,p.y)>25)plumes.push([p.x,p.y,Math.max(.5,elevation(p.x,p.y))]);
      }
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(tex,2));g.setIndex(ids);
    scene.add(new THREE.Mesh(g,waterMaterial));
  }
  rivers.forEach((r,i)=>cascade(r,[14,8,15][i]));
  // The east headwall drops almost 200 m in 30 horizontal metres. Water leaves
  // the lip with stream velocity, accelerates under gravity, and breaks into spray.
  function eastwallPlunge() {
    const sheetMaterial=new THREE.ShaderMaterial({
      uniforms:{t:clock,sunDir:{value:sun}},side:THREE.DoubleSide,transparent:true,depthWrite:false,
      vertexShader:`uniform float t;varying vec2 stream;varying vec3 where;
        void main(){stream=uv;vec3 p=position;
          float turbulence=smoothstep(.12,.89,uv.y);
          p.z+=turbulence*(1.3*sin(uv.y*18.-t*1.6+uv.x*4.)+.59*sin(uv.y*39.-t*3.1+uv.x*9.));
          p.x+=turbulence*.61*cos(uv.y*24.-t*2.1+uv.x*5.);
          where=p;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
      fragmentShader:`uniform float t;varying vec2 stream;varying vec3 where;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
        void main(){
          float u=stream.x,v=stream.y;
          float clock=v*6.2-t;
          float wandering=.016*sin(v*11.-t*.8)+.028*sin(v*21.+u*4.-t*1.6);
          float x=u+wandering*v;
          float density=noise(vec2(x*15.+.4*noise(vec2(x*3.,clock)),clock*1.9));
          float ropes=noise(vec2(x*73.+2.*density,clock*3.4));
          float fine=noise(vec2(x*177.,clock*8.));
          float edge=smoothstep(-.04,.14,min(x,1.-x)-.09*(density-.5));
          float broken=smoothstep(.08+.15*v,.72,density*.68+ropes*.32);
          float water=edge*(.22+.71*broken)*mix(.95,.76,v);
          float white=clamp(.12+.62*broken+.23*ropes+.16*fine,0.,1.);
          vec3 rgb=mix(vec3(.39,.55,.62),vec3(.91,.91,.85),white);
          gl_FragColor=vec4(rgb,water);}`
    });
    const pos=[],uv=[],idx=[];
    const bands=[{center:0,width:18,velocity:7.55},{center:-6.8,width:5.7,velocity:8.3},{center:6.9,width:4.2,velocity:6.8}];
    for(const band of bands){
      const start=pos.length/3,rows=74,cols=12;
      for(let j=0;j<=rows;j++){
        const f=j/rows;
        for(let i=0;i<=cols;i++){
          const u=i/cols,across=band.center+(u-.5)*band.width;
          const z0=550+across,x0=964+.4*Math.sin(across*.37);
          const top=elevation(x0,z0)+1.65;
          const tEnd=Math.sqrt(2*(top-9)/9.81), seconds=f*tEnd;
          const x=x0-seconds*band.velocity-.10*seconds*seconds;
          const z=z0+f*f*across*.35+2.7*f*f;
          pos.push(x,Math.max(elevation(x,z)+.55,top-4.905*seconds*seconds),z);
          uv.push(u,f);
          if(i<cols&&j<rows){const a=start+j*(cols+1)+i,b=a+cols+1;idx.push(a,b,a+1,a+1,b,b+1);}
        }
      }
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);
    scene.add(new THREE.Mesh(g,sheetMaterial));
    // An angular fan of foamy water disperses into the receiving pool.
    cascade([[915,553],[908,554],[903,553],[895,551],[884,554],[873,556]],14);
    for(let i=0;i<25;i++){
      const x=913+Math.sin(i*2.399)*7,z=552+Math.cos(i*2.399)*10;
      plumes.push([x,z,Math.max(.5,elevation(x,z))]);
    }
  }
  eastwallPlunge();

  const spray=[],drifts=[];
  let rng=41731;const rand=()=>((rng=(Math.imul(rng,1664525)+1013904223)>>>0)/4294967296);
  for(const [x,z,y] of plumes)for(let j=0;j<8;j++){
    spray.push(x+(rand()-.5)*7,y+1.5,z+(rand()-.5)*7);drifts.push(rand(),rand(),rand());
  }
  const mistGeometry=new THREE.BufferGeometry();
  mistGeometry.setAttribute('position',new THREE.Float32BufferAttribute(spray,3));
  mistGeometry.setAttribute('drift',new THREE.Float32BufferAttribute(drifts,3));
  const mist=new THREE.Points(mistGeometry,new THREE.ShaderMaterial({uniforms:{clock},transparent:true,depthWrite:false,
    vertexShader:`attribute vec3 drift;uniform float clock;varying float life,phase;
      void main(){phase=drift.z;life=fract(clock*(.10+.07*drift.x)+drift.y);vec3 p=position;
        p+=vec3(2.+drift.x*9.,4.+drift.y*12.,4.+drift.z*6.)*life;
        vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp((3700.+life*5400.)/max(1.,-mv.z),1.,84.);}`,
    fragmentShader:`varying float life,phase;void main(){
      vec2 q=gl_PointCoord-.5;float r=length(q)*2.;
      float swirl=sin(q.x*16.+4.*sin(q.y*10.+phase*15.))+cos(phase*20.+q.y*13.);
      float density=1.-smoothstep(.0,1.,r+.075*swirl);
      gl_FragColor=vec4(mix(vec3(.63,.76,.82),vec3(.91,.90,.85),density),
                        .145*density*sin(life*3.14159));}`
  }));
  scene.add(mist);
  // Orthophotos and sky plates are authored in display colour. The mirror
  // buffer stores linear radiance, matching the physically lit rocks and trees.
  scene.traverse(mesh=>{
    const material=mesh.material;
    if(!material?.isShaderMaterial || mesh===lake)return;
    if(!material.uniforms.linearOutput){
      material.uniforms.linearOutput={value:false};
      const code=material.fragmentShader;
      const close=code.lastIndexOf('}');
      material.fragmentShader='uniform bool linearOutput;\n'+code.slice(0,close)+`
        if(linearOutput){
          vec3 c=max(gl_FragColor.rgb,vec3(0.));
          gl_FragColor.rgb=mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));
        }
      }`;
    }
    mesh.onBeforeRender=(renderer,scene,camera)=>{material.uniforms.linearOutput.value=!!camera.userData.lakeReflection;};
  });
  const treeData=decode(survey.canopy),trees=[],treeCells=new Map();
  for(let i=0;i<treeData.length;i+=3){
    const x=treeData[i],z=treeData[i+1],h=treeData[i+2]*.1;
    const y=elevation(x,z),seed=rand(),width=h*(.29+.19*seed);
    const slope=Math.hypot(elevation(x+4,z)-elevation(x-4,z),elevation(x,z+4)-elevation(x,z-4))/8;
    // LiDAR returns on cliff edges and glacial water can be mistaken for crowns.
    if(insideLake(x,z) || slope>1.43 || h<5.8)continue;
    const tree={x,y,z,height:h,width,seed};
    trees.push(tree);
    const key=Math.floor(x/32)*1024+Math.floor(z/32);
    if(!treeCells.has(key))treeCells.set(key,[]);
    treeCells.get(key).push(tree);
  }
  function clearance(x,z) {
    let surface=height(x,z);
    const col=Math.floor(x/32),row=Math.floor(z/32);
    for(let i=col-1;i<=col+1;i++)for(let j=row-1;j<=row+1;j++){
      const batch=treeCells.get(i*1024+j);
      if(!batch)continue;
      for(const t of batch){
        const r=Math.hypot(x-t.x,z-t.z)/(t.width*.50);
        if(r<1)surface=Math.max(surface,t.y+t.height*(1-.73*r*r));
      }
    }
    return surface;
  }
  const spawn={x:927,z:240,y:elevation(927,240)+96,yaw:1.80};
  const launches={
    lake:spawn,
    shore:{x:-647,y:8.5,z:465,yaw:-1.78},
    falls:{x:790,y:elevation(790,900)+54,z:900,yaw:-.10},
    forest:{x:-1280,y:clearance(-1280,420)+43,z:420,yaw:-1.61}
  };
  return {
    height,elevation,clearance,spawn,launches,trees,skyTexture:skyMap,sunMask:visibility,sunDirection:sun,waterLevel:0,lakeLevel:0,lakePolygon:shore,altitudeOffset:survey.heightOffset,
    bounds:{minX:-3700,maxX:3700,minZ:-3700,maxZ:3700},
    landmarks:[{name:'Western gravel beach',x:-647,z:466},{name:'Lakeshore meadow',x:-688,z:497,discoveryRadius:42},{name:'Oeschinensee',x:30,z:260},{name:'Fründen Falls',x:472,z:922},
      {name:'Eastwall Cascade',x:936,z:550},{name:'Fründenschnuer',x:978,z:264},{name:'Blüemlisalp Ridge',x:3135,z:-380}],
    update(dt,time){clock.value=time;waterMaterial.uniforms.t.value=time;lake.material.uniforms.time.value=time*.52;}
  };
};
