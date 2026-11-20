/* Water surface derived from three.js Water, MIT licensed. */
window.makeAtlasWorld = function makeAtlasWorld(THREE, scene, region) {
const shoreOptics=`
    uniform sampler2D localBank;
    uniform vec2 bankOrigin;
    uniform float bankSpan;
    vec4 coastDistance(vec2 p){
      vec2 uv=(p-bankOrigin)/bankSpan;
      float center=max(abs(uv.x-.5),abs(uv.y-.5));
      if(center>=.5)return vec4(32.,0.,0.,0.);
      vec3 field=texture2D(localBank,uv).rgb;
      // Interpolate offset vectors across the edge before taking the length.
      // Unsigned texels alone flatten the last metre on both sides of the shore.
      float d=32.*field.r;
      vec2 delta=(field.gb*255.-128.)*(32./127.);
      d=mix(max(length(delta),d-1.1),d,smoothstep(29.,31.9,d));
      return vec4(d,1.-smoothstep(.33,.49,center),delta*inversesqrt(max(.008,dot(delta,delta))));
    }
    // Crests advance toward decreasing bank distance. Their wavelength
    // contracts on the shoal. Multiple packets reach each stretch at different times.
    float shoreGroup(vec2 p,float t){
      return .5+.5*sin(dot(p,vec2(.035,.013))-t*.19)*sin(dot(p,vec2(-.019,.029))+t*.27);
    }
    float shoreClock(vec2 p,float t,float exposure){
      float rate=mix(3.45,1.70,exposure);
      return t*rate+1.15*sin(dot(p,vec2(.063,.018))+.12*t)+.74*sin(dot(p,vec2(-.026,.049)));
    }`;

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
    mirrorCamera.userData.lakeReflection=true;

		const renderTarget = new WebGLRenderTarget(textureWidth, textureHeight, {
      type: THREE.HalfFloatType, minFilter: THREE.LinearMipmapLinearFilter
    });
    renderTarget.texture.generateMipmaps = true;

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

				uniform sampler2D shoreField, pebbles, terrainLight;
        uniform float shoreTexel;
        uniform float basinSpan, oceanSurf, seaState, rockyBed, shoreExposure;
        uniform sampler2D bedRelief,bedSand,foamCells;
        ${shoreOptics}
        // Crossing wind swells and travelling capillary waves in metres. Dampen
        // wavelengths that are smaller than the current pixel footprint.
        vec2 slopes(vec2 p,float t,float footprint,float fetch,out float wind){
          vec2 windDir=vec2(.937,.35);
          vec2 q=vec2(dot(p,windDir),dot(p,vec2(-windDir.y,windDir.x)));
          wind=.53+.22*sin(q.x*.0037-q.y*.009+t*.035)+.15*sin(q.y*.030+q.x*.0013+t*.071);
          float energy=(.24+.76*fetch)*(.51+.73*wind)*seaState;
          // Break up long wave fronts into wind patches. On enclosed lakes an
          // infinite periodic swell reads as ruled stripes across the landscape.
          vec2 windPatch=texture2D(normalSampler,p*.0017+vec2(.006*t,-.002*t)).rg-.5;
          vec2 bend=q+windPatch*11.;
          vec2 run=texture2D(normalSampler,bend*vec2(.036,.072)+vec2(-t*.033,t*.009)).rg-.5;
          vec2 cap=texture2D(normalSampler,q.yx*vec2(.23,.14)+vec2(t*.025,-t*.094)).gr-.5;
          vec2 crosswind=vec2(.70*q.x+.72*q.y,-.72*q.x+.70*q.y);
          vec2 swell=texture2D(normalSampler,crosswind*.009+windPatch*.32+vec2(t*.008,-t*.002)).gr-.5;
          vec2 seaWave=vec2(sin(q.x*.21+8.*windPatch.x-t*.83),cos(crosswind.y*.37+9.*windPatch.y+t*.98));
          vec2 slope=.58*run+.24*swell+.34*cap/(1.+footprint*.90);
          slope+=smoothstep(1.,1.9,seaState)*seaWave*.012/(1.+footprint*.18);
          return energy*(windDir*slope.x+vec2(-windDir.y,windDir.x)*slope.y);
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
					vec2 p=worldPosition.xz;
        vec2 basin=vec2(p.x,-p.y)/basinSpan+.5;
        float interior=1.-smoothstep(.48,.5,max(abs(basin.x-.5),abs(basin.y-.5)));
        vec3 shore=texture2D(shoreField,basin).rgb;
        float bank=mix(450.,450.*shore.r*shore.r,interior);
        float fetch=mix(1.,shore.g,interior);
        float daylight=mix(1.,texture2D(terrainLight,basin).r,interior);
        vec3 v=normalize(eye-worldPosition.xyz);
        vec4 local=coastDistance(p);
        // Beyond the precision field, retain the windward fetch and distance
        // encoded in the regional survey, including the Weirs and Alton tiles.
        float localWeight=local.y*(1.-smoothstep(25.,32.,local.x));
        bank=mix(bank,local.x,localWeight);
        // Stored offsets give a stable shoreline normal even at a grazing camera
        // angle. Differentiating a quantized distance per pixel aliases its facets.
        vec2 away=vec2(0.);
        if(localWeight<.999 && bank<55.){
          vec2 stepUV=vec2(shoreTexel,0.);
          away=vec2(texture2D(shoreField,basin+stepUV).r-texture2D(shoreField,basin-stepUV).r,
                    texture2D(shoreField,basin-stepUV.yx).r-texture2D(shoreField,basin+stepUV.yx).r);
          away*=inversesqrt(max(.000001,dot(away,away)));
        }
        away=mix(away,local.zw,localWeight);
        float coast=shoreExposure,group=shoreGroup(p,time);
        float k=mix(2.38,.31,coast),zone=mix(4.5,21.,coast);
        float phase=shoreClock(p,time,coast)+mix(1.25,2.9,coast)*(1.-exp(-bank/zone));
        float angle=k*bank+phase;
        float footprint=max(length(dFdx(p)),length(dFdy(p))),wind;
        vec2 slope=slopes(p,time,footprint,fetch,wind);
        float shoaling=(1.-smoothstep(zone*.65,zone*2.,bank))*
                      (1.-smoothstep(.38/k,1.7/k,footprint));
        float incident=mix(.044,.155,coast)*(.49+.76*group)*(.68+.32*fetch);
        slope+=away*(cos(angle)+.46*cos(2.*angle-.78))*incident*shoaling;
        vec3 n=normalize(vec3(slope.x,1.,slope.y));
        float cosV=clamp(dot(v,n),0.,1.);
        float fresnel=.0204+.9796*pow(1.-cosV,5.);
        float viewDistance=length(eye-worldPosition.xyz);
        vec2 mirrorUV=mirrorCoord.xy/mirrorCoord.w;
        // Project the perturbed world normal into camera axes so reflected shorelines
        // break along the wind direction even as the eagle banks.
        vec2 screenSlope=(mat3(viewMatrix)*vec3(slope.x,0.,slope.y)).xy;
        screenSlope.y+=dot(slope,v.xz)*.62;
        vec2 jitter=screenSlope*(.19+.13*(1.-cosV));
        float roughLod=-.85+fetch*.44+clamp(footprint*.022,0.,.95);
        vec3 reflectLight=texture2D(mirrorSampler,clamp(mirrorUV+jitter,.002,.998),roughLod).rgb;
        float waterDepth=.06+bank*mix(.14,.27,shoreExposure);
        float shallow=exp(-.47*waterDepth);
        vec3 deep=waterColor*(.40+.30*daylight+.09*wind);
        vec3 shoal=vec3(.040,.115,.097)*(.62+.38*daylight);
        vec3 gravel=shoal,resolvedBed=shoal;
        float fine=0.;
        if(viewDistance<330. && bank<65.){
          vec3 transmitted=refract(-v,n,.75019);
          float path=waterDepth/max(.29,-transmitted.y);
          vec2 bedPoint=p+transmitted.xz*min(path,5.);
          vec2 uv=bedPoint*.48,rot=vec2(.8*uv.x+.6*uv.y,-.6*uv.x+.8*uv.y);
          float deposit=smoothstep(.20,.77,.53+.31*sin(p.x*.30+p.y*.17)+.23*sin(p.y*.53-p.x*.21));
          vec3 stones=texture2D(pebbles,uv).rgb,smallStones=texture2D(pebbles,rot*1.52).rgb;
          vec3 sediment=texture2D(bedSand,bedPoint*.35).rgb;
          gravel=pow(mix(stones,smallStones,.43*deposit),vec3(2.2));
          vec3 relief=texture2D(bedRelief,uv).rgb*2.-1.;
          float grazing=dot(relief.xy,sunDirection.xz);
          fine=(1.-smoothstep(.12,.83,footprint))*(1.-smoothstep(35.,120.,viewDistance));
          gravel*=1.+grazing*.38*fine;
          float sandCover=deposit*mix(.32,.72,shoreExposure);
          vec3 floorColor=mix(gravel,pow(sediment,vec3(2.2)),sandCover)*(.74+.26*rockyBed);
          // Refracted light concentrates into short moving streaks in shallow water.
          float rayA=sin(dot(bedPoint,vec2(1.83,.93))+time*.80+1.28*sin(p.y*.69+time*.37));
          float rayB=sin(dot(bedPoint,vec2(-1.16,1.63))-time*.91+.53*sin(p.x*.48-time*.27));
          float focus=exp(-10.*abs(rayA+.68*rayB));
          floorColor*=.95+.55*focus*fine*daylight*exp(-.43*waterDepth);
          vec3 transmission=exp(-path*vec3(.62,.34,.26));
          resolvedBed=floorColor*transmission+deep*(1.-transmission);
          shoal=mix(shoal,resolvedBed,
                    (1.-smoothstep(90.,330.,viewDistance))*(.65+.35*daylight));
        }
        vec3 body=mix(deep,shoal,shallow);
        body=mix(body,resolvedBed,
                 local.y*.64*exp(-waterDepth)*fine);
        vec3 h=normalize(v+sunDirection);
        float rough=.045+.045*fetch*seaState;
        float spec=exp(-dot(h.xz-n.xz,h.xz-n.xz)/(rough*rough));
        vec3 sunlight=vec3(1.,.77,.47)*spec*daylight*(.27+.71*fresnel);
        // Unresolved facets reflect a small angular cone of sky. Wind lanes
        // and the lee of an island have visibly different return even when
        // the camera is too high to resolve individual ripples.
        vec3 skyVeil=vec3(.41,.53,.64);
        float chop=(.10+.42*fetch)*(.53+.47*wind);
        reflectLight=mix(reflectLight,skyVeil,.10*chop);
        float waterSky=clamp(fresnel+.027*chop*(1.-cosV),0.,1.);
        float visibleSun=getShadowMask();
        vec3 radiance=mix(body*mix(.70,1.,visibleSun),reflectLight,waterSky)+sunlight*visibleSun;
        float line=sin(bank*k+phase);
        if(oceanSurf>.0 && bank<36. && footprint<4.){
          // The lip breaks in patches, then its broken whitewater drifts back
          // through the darker runnel. Quiet inland wavelets never whiten en masse.
          vec2 across=vec2(-away.y,away.x);
          vec2 wash=p+away*(.49*sin(angle)-time*.19);
          vec2 warp=texture2D(normalSampler,p*.061+across*.023*time).rg-.5;
          vec2 foamUV=wash*.21+warp*.19+across*.032*sin(angle);
          float lace=texture2D(foamCells,foamUV).r;
          float bubbles=texture2D(foamCells,foamUV*3.71+warp*.13).r;
          float rafts=.5+.5*sin(wash.x*1.01+wash.y*.22+2.9*warp.x)*
                              cos(wash.y*.75-wash.x*.37+3.8*warp.y);
          float foamPatch=texture2D(normalSampler,p*.034-away*time*.024).r;
          float setPulse=group+.27*(foamPatch-.5)+.12*sin(dot(p,vec2(.24,.17))-.23*time);
          float breaker=smoothstep(.64-.19*rafts,.99-.09*rafts,line)*smoothstep(.28,.72,setPulse);
          float trough=smoothstep(-.37,.43,-cos(angle))*(.16+.84*lace)*smoothstep(.28,.79,rafts);
          float backwash=exp(-.32*bank)*trough*(.21+.27*group);
          float aerated=.11+.46*smoothstep(.35,.77,rafts)+.36*lace+.18*bubbles;
          float white=oceanSurf*shoaling*(breaker*aerated+backwash);
          radiance=mix(radiance,vec3(.67,.77,.78)*(.53+.47*daylight),clamp(white,0.,.84));
        }
        gl_FragColor=vec4(radiance,alpha);
        #include <colorspace_fragment>
					#include <fog_fragment>	
				}`

		};

		const material = new ShaderMaterial( {
			name: mirrorShader.name,
      extensions: {derivatives: true},
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

		let checkedReflectionType=false;
    scope.onBeforeRender = function ( renderer, scene, camera ) {
      if(camera.userData.lakeReflection)return;
      if(!checkedReflectionType){
        if(!renderer.extensions.has('EXT_color_buffer_float')&&!renderer.extensions.has('EXT_color_buffer_half_float'))renderTarget.texture.type=THREE.UnsignedByteType;
        checkedReflectionType=true;
      }

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


  const survey=window.ATLAS_SURVEYS[region];
  const settings={
    yosemite:{sky:'alaska-evening.jpg',sun:[-.62,.46,.53],stone:[.64,.61,.57],treeH:30,top:2840,cover:.91,launch:[-4600,1780,2300,0,150],low:[-1700,1110,1560,-490,70]},
    crater:{sky:'alaska-evening.jpg',sun:[-.37,.53,-.71],water:1880.62,sea:0x123951,stone:[.43,.385,.337],treeH:21,top:2430,cover:.96,launch:[-3410,1770,-960,-230,315],low:[-2360,1720,600,1630,57]},
    lofoten:{sky:'atlas-qwantani_sunrise_puresky.webp',sun:[-.66,.35,.58],water:0,sea:0x225060,stone:[.37,.38,.37],treeH:6,top:330,cover:.6,launch:[600,2470,-450,-1890,320],low:[310,1680,-770,-1750,56]},
    milford:{sky:'atlas-wasteland_clouds_puresky.webp',sun:[-.4,.43,.71],water:0,sea:0x1c4548,stone:[.34,.37,.36],treeH:17,top:1060,cover:1.15,launch:[2370,3200,-2000,-700,330],low:[2630,4340,560,1900,105]}
  }[region]||window.ATLAS_PROFILES?.[region];
  const surry=region==='surry';
  const dixville=region==='dixville';
  const newEngland=dixville||region==='moosehead'||region==='winnipesaukee'||surry;
  const waterfront=region==='winnipesaukee'?window.makeWinnipesaukeeWaterfront?.(THREE,scene,texture):null;
  const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  const unpack=s=>new Int16Array(bytes(s).buffer), near=unpack(survey.terrain),far=unpack(survey.outer),tight=survey.inner?unpack(survey.inner):null,cover=bytes(survey.canopy);
  const h=survey.half,farH=survey.farHalf,{clamp,smoothstep,lerp}=THREE.MathUtils;
  function sample(grid,half,x,z){
    const n=Math.round(Math.sqrt(grid.length)),u=clamp((x+half)*(n-1)/(half*2),0,n-1),v=clamp((z+half)*(n-1)/(half*2),0,n-1),i=Math.min(n-2,Math.floor(u)),j=Math.min(n-2,Math.floor(v)),a=u-i,b=v-j,k=j*n+i;
    if(a+b<1)return (grid[k]*(1-a-b)+grid[k+1]*a+grid[k+n]*b)*.25;
    return (grid[k+n+1]*(a+b-1)+grid[k+n]*(1-a)+grid[k+1]*(1-b))*.25;
  }
  const [focusX,focusZ]=survey.innerCenter || [0,0];
  const cityGrid=survey.cityTerrain?unpack(survey.cityTerrain):null;
  const [cityX,cityZ]=survey.cityCenter||[0,0];
  function farHeight(x,z){
    const base=sample(far,farH,x,z);
    const shore=settings.water===undefined?1:smoothstep(base-settings.water,2,25);
    return base+shore*window.rangeRelief(region,x,z);
  }
  function elevation(x,z){
    const r=Math.max(Math.abs(x),Math.abs(z));
    if(r>=h)return waterfront?waterfront.elevation((g,span,xx,zz)=>g===far?farHeight(xx,zz):sample(g,span,xx,zz),far,farH,x,z):farHeight(x,z);
    let val=sample(near,h,x,z);
    const focusDistance=Math.max(Math.abs(x-focusX),Math.abs(z-focusZ));
    if(tight&&focusDistance<1450)val=lerp(sample(tight,1450,x-focusX,z-focusZ),val,smoothstep(focusDistance,1395,1450));
    const cityDistance=Math.max(Math.abs(x-cityX),Math.abs(z-cityZ));
    if(cityGrid&&cityDistance<1450)val=lerp(sample(cityGrid,1450,x-cityX,z-cityZ),val,smoothstep(cityDistance,1395,1450));
    if(r>h-200)val=lerp(val,farHeight(x,z),smoothstep(r,h-200,h));
    return region==='crater'?shoreDetail.calderaBed(x,z,val):val;
  }
  function growth(x,z){
    const i=Math.floor((x/h*.5+.5)*384),j=Math.floor((z/h*.5+.5)*384);
    return i>=0&&i<384&&j>=0&&j<384?cover[j*384+i]/255:0;
  }
  const loader=new THREE.TextureLoader();
  function texture(file,repeat=false){const tex=loader.load(file);tex.anisotropy=12;if(repeat)tex.wrapS=tex.wrapT=THREE.RepeatWrapping;return tex;}
  const lightAngles={moosehead:[-84,15.5],winnipesaukee:[-112,4.2],surry:[-52,19],yosemite:[-43,6.5],crater:[-70,8],lofoten:[-115,4.3],milford:[-71,8]};
  const [azimuth,altitude]=(settings.lightAngles||lightAngles[region]).map(THREE.MathUtils.degToRad);
  const sun=new THREE.Vector3(Math.cos(azimuth)*Math.cos(altitude),Math.sin(altitude),Math.sin(azimuth)*Math.cos(altitude));
  const skyMap=texture(settings.skyMap||'atlas-'+region+'-sky.webp');
  skyMap.colorSpace=THREE.SRGBColorSpace;skyMap.wrapS=THREE.RepeatWrapping;
  skyMap.minFilter=THREE.LinearFilter;skyMap.generateMipmaps=false;
  const fog=dixville?0xc5b7b6:region==='milford'?0xb2b9b9:0xb6bfc8;
  scene.fog=new THREE.FogExp2(fog,region==='milford'?.000064:.000042);
  const sunlight=new THREE.DirectionalLight(dixville?0xffc493:0xffdcad,2.1);
  sunlight.position.copy(sun).multiplyScalar(1000);scene.add(sunlight,new THREE.HemisphereLight(0xdde7fa,0x756757,1.39));
  const sky=new THREE.Mesh(new THREE.SphereGeometry(1,32,18),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{map:{value:skyMap}},
    vertexShader:'varying vec3 ray;void main(){ray=position;vec4 clip=projectionMatrix*vec4(mat3(viewMatrix)*position,1.);gl_Position=clip.xyww;}',
    fragmentShader:`varying vec3 ray;uniform sampler2D map;void main(){vec3 d=normalize(ray);
      vec2 uv=vec2(.5+atan(d.z,d.x)*.15915494,.5+asin(d.y)*.31830989);
      gl_FragColor=vec4(texture2D(map,uv).rgb,1.);
      #include <colorspace_fragment>
    }`}));
  sky.frustumCulled=false;sky.renderOrder=-1000;scene.add(sky);
  const geology='jointed';
  const aerial=texture('atlas-'+region+'-photo.webp'),ranges=texture('atlas-'+region+'-ranges.webp'),stone=texture('atlas-'+geology+'-rock.webp',true),grain=texture('rock.jpg',true),sod=texture('soil-'+window.aerieSoil(region)+'.webp',true);
  const color=new THREE.Color(fog);
  const terrainLight=texture('atlas-'+region+'-light.webp'),fracture=texture('atlas-'+geology+'-relief.webp',true);
  const canopyMap=new THREE.DataTexture(cover,384,384,THREE.RedFormat);
  canopyMap.minFilter=canopyMap.magFilter=THREE.LinearFilter;canopyMap.needsUpdate=true;
  const localShoreMask=surry||dixville;
  const terrain=new THREE.ShaderMaterial({uniforms:{terrainLight:{value:terrainLight},fracture:{value:fracture},canopyMap:{value:canopyMap},temperate:{value:newEngland?1:0},shoreLevel:{value:settings.water===undefined?-10000:settings.water+.16},arctic:{value:region==='lofoten'?1:0},aerial:{value:aerial},ranges:{value:ranges},rockScan:{value:stone},stoneGrain:{value:grain},sod:{value:sod},sun:{value:sun},halfMap:{value:h},farSpan:{value:2*farH},stoneTint:{value:new THREE.Vector3(...settings.stone)},haze:{value:color},desert:{value:0}},
    vertexShader:'varying vec3 wp,norm;void main(){wp=position;norm=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform sampler2D terrainLight,fracture,canopyMap,aerial,ranges,rockScan,stoneGrain,sod;uniform vec3 sun,stoneTint,haze;uniform float halfMap,farSpan,desert,shoreLevel,arctic,temperate;varying vec3 wp,norm;
      ${window.aerieFloorShader}
      float lum(vec3 c){return dot(c,vec3(.26,.58,.16));}
      void main(){
        // Coastal DEMs store open water as a flat zero-height plate. It must
        // stay out of the reflection camera as well as the main view.
        ${settings.water!==undefined&&!survey.shore?.length?'if(wp.y<shoreLevel+.001)discard;':''}
        vec2 xz=wp.xz,photoUv=vec2(xz.x,-xz.y)/(halfMap*2.)+.5;
        float extent=max(abs(xz.x),abs(xz.y)),d=distance(wp,cameraPosition);
        vec3 photo=mix(texture2D(aerial,photoUv).rgb,texture2D(ranges,vec2(xz.x,-xz.y)/farSpan+.5).rgb,smoothstep(halfMap-160.,halfMap,extent));
        photo=mix(photo,vec3(lum(photo)),arctic*.27);
        vec3 normal=normalize(norm);
        float veg=smoothstep(.0,.075,photo.g-.94*photo.r)*smoothstep(.0,.055,photo.g-photo.b);
        float dense=temperate*texture2D(canopyMap,xz/(2.*halfMap)+.5).r*(1.-smoothstep(halfMap-100.,halfMap,extent));
        // An orthophoto has almost no projected footprint on a vertical wall.
        // Dark crown shadows, sky and water pixels at the cliff lip otherwise
        // smear the entire height of a cliff face. Keep them on horizontal land.
        float orthoCoverage=smoothstep(.18,.70,normal.y);
        dense*=orthoCoverage;
        veg=max(veg*orthoCoverage,dense);
        float snow=smoothstep(.53,.82,min(min(photo.r,photo.b),photo.g));
        float face=1.-smoothstep(.45,.89,normal.y);
        float materialWeight=max(1.-orthoCoverage,(1.-veg*.97)*(1.-snow)*(.14+.80*face))*(1.-smoothstep(4800.,14500.,d));
        float axis=abs(normal.x)/(abs(normal.x)+abs(normal.z)+.001);
        float strataY=wp.y+wp.x*.068+wp.z*.11+3.*sin(wp.z*.019);
        vec2 a=vec2(wp.z,strataY),b=vec2(wp.x,strataY);
        // Interleaved fissures vary across the face, with a coarser joint set
        // across ridges. World coordinates keep detail stable during approach.
        vec2 warp=vec2(sin(wp.z*.013)+cos(wp.x*.008),sin(wp.x*.014)+cos(wp.z*.017));
        vec2 texScale=mix(vec2(.033,.035),vec2(.037,.064),desert);
        vec2 uva=a*texScale+warp*.085,uvb=b*texScale+warp*.085;
        vec3 viewDir=normalize(cameraPosition-wp);
        float closeRelief=(1.-smoothstep(26.,170.,d))*face;
        vec2 parA=(texture2D(fracture,uva).b-.5)*viewDir.zy*(.062*closeRelief);
        vec2 parB=(texture2D(fracture,uvb).b-.5)*viewDir.xy*(.062*closeRelief);
        uva+=parA;uvb+=parB;
        vec3 scan=mix(texture2D(rockScan,uvb).rgb,texture2D(rockScan,uva).rgb,axis);
        vec3 wide=mix(texture2D(rockScan,b*vec2(.0052,.0085)-warp*.018+.27).rgb,
                      texture2D(rockScan,a*vec2(.0052,.0085)-warp*.018+.27).rgb,axis);
        float grit=lum(texture2D(stoneGrain,(a*.75+b*.25)*.12).rgb);
        float cliff=lum(scan),fissure=lum(wide);
        float layers=desert*(.026*sin(strataY*.60)+.02*sin(strataY*1.6));
        vec3 lithology=stoneTint*(.32+cliff*.99+fissure*.72+layers+(.11*grit));
        lithology*=mix(vec3(1.),scan/max(.06,cliff),.21+.19*desert);
        lithology*=1.+.35*temperate*face;
        /* exposed field geology */
        float photoGain=.58+.69*clamp(lum(photo)*1.45,0.,1.);
        vec3 stoneColor=lithology*mix(.99,photoGain,orthoCoverage);
        vec3 c=mix(photo,stoneColor,materialWeight);
        // Pale caprock and rust-red silt alternate locally in the Claron beds;
        // retain the photographed variation instead of applying a single orange tint.
        float bedding=desert*(1.-veg);
        c=mix(c,vec3(lum(c)),.12*bedding);
        float sediment=(cliff-.31)*.85+(fissure-.32)*.43;
        c*=1.+bedding*sediment*(.32+.53*face)*(1.-smoothstep(750.,3400.,d));
        vec3 turf=soilSample(sod,xz*.34,0.).rgb;
        float near=1.-smoothstep(36.,460.,d);
        c*=1.+(lum(turf)-.35)*near*(.46+.42*veg)*(1.-face);
        c=mix(c,turf*(.45+1.25*lum(photo)),near*(1.-face)*veg*.51);
        float radial=max(abs(photoUv.x-.5),abs(photoUv.y-.5));
        float inside=1.-smoothstep(.475,.5,radial);
        vec3 occ=mix(vec3(1.,.94,.5),texture2D(terrainLight,photoUv).rgb,inside);
        vec3 microX=texture2D(fracture,uva).rgb*2.-1.;
        vec3 microZ=texture2D(fracture,uvb).rgb*2.-1.;
        vec3 micro=mix(vec3(microZ.x,microZ.y,0.),vec3(0.,microX.y,microX.x),axis);
        vec3 relieved=normalize(normal+micro*(.68*face*(1.-veg))*(1.-smoothstep(350.,2900.,d)));
        float incidence=max(0.,dot(relieved,sun)),sunlit=occ.r;
        // Microfacet response, measured sky exposure and cast terrain shadows
        // separate cliff faces while retaining detail in the surveyed aerial color.
        c=mix(c,photo*vec3(.72,.76,.73),dense*.80);
        if(d<230.){
          float cover=texture2D(canopyMap,xz/(2.*halfMap)+.5).r;
          float woody=smoothstep(.18,.78,cover);
          float natural=max(veg,cover*.75);
          ${region==='surry'?'natural*=mix(1.,smoothstep(.012,.08,photo.g-(photo.r*.82+photo.b*.18)),streetBlend);':''}
          float eligible=smoothstep(.49,.89,normal.y)*(1.-snow)*(1.-smoothstep(45.,228.,d));
          vec3 detail=floorColor(sod,xz,woody);
          float strength=mix(.09,.95,smoothstep(.025,.38,natural));
          float shade=clamp(.78+.42*lum(photo),.74,1.07);
          c=mix(c,detail*shade,eligible*strength);
        }
        float green=smoothstep(.025,.15,c.g-(c.r+c.b)*.45);
        c=mix(c,vec3(lum(c)),green*(.12+.22*arctic));
        c*=vec3(1.025,.999,.965);
        float skyView=occ.g,relief=(occ.b-.5)*(1.-.68*veg);
        vec3 ambient=vec3(.51,.61,.76)*(.66+.34*max(normal.y,0.))*(.69+.31*skyView);
        vec3 direct=vec3(1.25,.98,.69)*(.14+1.02*incidence)*sunlit;
        ambient*=mix(vec3(1.),vec3(.74,.87,1.02),desert*(1.-.63*skyView));
        c=pow(max(c,vec3(0.)),vec3(2.2))*(ambient+direct)*(1.+(.32+.42*desert)*relief);
        /* canopy transmission */
        float dep=1.-exp(-d*(.000032-.000007*temperate));
        vec3 aerialHaze=haze*mix(vec3(.79,.86,1.0),vec3(1.12,1.01,.88),.5+.5*dot(normalize(wp-cameraPosition),sun));
        gl_FragColor=vec4(mix(c,aerialHaze,dep*(.72+.28*skyView)),1.);
        #include <colorspace_fragment>
      }`});
  if(region==='yosemite'){
    const granite=texture('atlas-yosemite-cathedral.webp');
    granite.wrapS=granite.wrapT=THREE.MirroredRepeatWrapping;
    terrain.uniforms.cathedralGranite={value:granite};
    terrain.uniforms.westFace={value:texture('atlas-yosemite-west-face.webp')};
    terrain.fragmentShader='uniform sampler2D cathedralGranite,westFace;\n'+terrain.fragmentShader.replace(
      '/* exposed field geology */',`
        // Oblique field photographs restore the cliff-scale joints which a
        // downward-looking orthophoto cannot capture on a near-vertical wall.
        float fold=wp.y*.00138+.025*sin(wp.z*.004+wp.x*.0017);
        vec2 slabX=vec2(wp.z*.00157+.031*sin(wp.x*.003),fold);
        vec2 slabZ=vec2(wp.x*.00164+.036*sin(wp.z*.0023),fold+.32);
        float joints=mix(texture2D(cathedralGranite,slabZ).r,texture2D(cathedralGranite,slabX).r,axis);
        float cathedral=1.-smoothstep(800.,2150.,length(wp.xz-vec2(-875.,1953.)));
        vec3 graniteColor=vec3(.99,.987,.972)*(joints*.82+.095)*(.83+.55*cliff);
        float exposed=face*(1.-veg)*smoothstep(1310.,1500.,wp.y);
        lithology=mix(lithology,graniteColor,exposed*(.55+.37*cathedral));
        // Calibrated against the west-buttress skyline in the Tunnel View
        // photograph. The surface is sampled in world space as the eagle banks.
        vec3 ray=wp-vec3(-4650.,1345.66,1795.);
        vec2 forward=vec2(.94148,-.33710);
        float along=dot(ray.xz,forward),horizontal=length(ray.xz);
        float t=dot(ray.xz,vec2(-forward.y,forward.x))/max(along,1.);
        float tanAltitude=ray.y/max(horizontal,1.);
        vec2 projection=vec2(.5+3.0464*t,.5+4.0619*(tanAltitude*along/horizontal-.123576)/(1.+tanAltitude*.123576));
        vec4 cliffImage=texture2D(westFace,clamp(projection,0.,1.));
        float inner=step(0.,min(projection.x,projection.y))*step(max(projection.x,projection.y),1.);
        float local=1.-smoothstep(1250.,1820.,length(wp.xz-vec2(-1100.,-120.)));
        float visible=smoothstep(.01,.26,dot(normal,normalize(-ray)))*local*inner*exposed;
        lithology=mix(lithology,cliffImage.rgb*(.88+.42*cliff),cliffImage.a*visible);
      `);
  }
  if(dixville){
    terrain.uniforms.notchStone={value:texture('dixville-schist.webp',true)};
    terrain.fragmentShader='uniform sampler2D notchStone;\n'+terrain.fragmentShader.replace('float green=smoothstep', `
      float summit=1.-smoothstep(14.,66.,length(wp.xz-vec2(26.,338.)));
      vec2 edge=(wp.xz-vec2(85.,360.))/vec2(365.,162.);
      float flank=clamp(1.25-dot(edge,edge),0.,1.)*(1.-smoothstep(.62,.89,normal.y))*smoothstep(623.,718.,wp.y);
      float exposed=max(summit*smoothstep(692.,749.,wp.y),flank*.88);
      vec3 scarp=mix(texture2D(notchStone,wp.zy*.128).rgb,texture2D(notchStone,wp.xy*.128).rgb,axis);
      scarp=mix(scarp,texture2D(notchStone,wp.xz*.105).rgb,smoothstep(.50,.90,normal.y));
      float block=wp.x*.32+wp.z*.22+wp.y*.034+.39*sin(wp.y*.13)+.25*sin(wp.z*.31);
      float crack=1.-smoothstep(.016,.055,abs(fract(block)-.50));
      scarp*=1.-crack*(.18+.18*texture2D(notchStone,wp.xz*.09).r);
      c=mix(c,scarp*vec3(.96,1.01,1.09),exposed*.94);
      float green=smoothstep`);
    // Fresh joints and dark seams interrupt the thin forest soil on the steep notch walls.
    terrain.fragmentShader=terrain.fragmentShader.replace('/* exposed field geology */', `
      vec2 notch=(xz-vec2(165.,300.))/vec2(970.,420.);
      float rockFace=(1.-smoothstep(.70,1.17,normal.y+.15))*clamp(1.6-dot(notch,notch),0.,1.);
      float joint=texture2D(fracture,uva*2.9+warp*.13).g;
      lithology=mix(lithology,vec3(.44,.43,.40)*(.30+1.23*cliff+.52*fissure+.22*joint),rockFace);
      materialWeight=max(materialWeight,rockFace*.91*(1.-smoothstep(1400.,3600.,d)));
    `);
  }
  if(region==='moosehead'){
    // Rock-face field photograph, rectified and locally de-lit. Its remaining
    // joint pattern belongs on steep rhyolite walls within the Kineo headland.
    const localRock=texture('atlas-kineo-rhyolite.webp');
    localRock.wrapS=localRock.wrapT=THREE.MirroredRepeatWrapping;
    terrain.uniforms.localRhyolite={value:localRock};
    terrain.fragmentShader='uniform sampler2D localRhyolite;\n'+terrain.fragmentShader.replace('/* exposed field geology */', `
      vec2 relative=wp.xz-vec2(150.,-860.);
      float headland=(1.-smoothstep(550.,990.,length(relative)))*face*(1.-veg);
      vec2 ledgeUv=vec2((relative.x*.55-relative.y*.84)*.0017,
                        (wp.y-.092*relative.x+.11*relative.y)*.013);
      vec3 weathering=texture2D(localRhyolite,ledgeUv+.018*warp).rgb;
      vec3 strata=vec3(.49,.48,.465)*(.43+1.07*weathering)*(.76+.92*cliff);
      lithology=mix(lithology,strata,headland*.93);`);
  }
  if(survey.innerCenter && settings.detailOrtho!==false){
    terrain.uniforms.detailOrtho={value:texture('atlas-'+region+'-detail.webp')};
    terrain.uniforms.orthoOrigin={value:new THREE.Vector2(focusX,focusZ)};
    terrain.fragmentShader='uniform sampler2D detailOrtho;uniform vec2 orthoOrigin;\n'+terrain.fragmentShader.replace('photo=mix(photo,vec3(lum(photo))', `
        vec2 focus=xz-orthoOrigin;
        float blend=1.-smoothstep(1330.,1440.,max(abs(focus.x),abs(focus.y)));
        photo=mix(photo,texture2D(detailOrtho,vec2(focus.x,-focus.y)/2900.+.5).rgb,blend);
        photo=mix(photo,vec3(lum(photo))`);
  }
  if(survey.cityCenter){
    terrain.uniforms.cityOrtho={value:texture('atlas-surry-city-detail.webp')};
    terrain.uniforms.streetOrtho={value:texture('keene-downtown-ortho.webp')};
    terrain.uniforms.cityOrigin={value:new THREE.Vector2(cityX,cityZ)};
    terrain.fragmentShader='uniform sampler2D cityOrtho,streetOrtho;uniform vec2 cityOrigin;\n'+terrain.fragmentShader.replace('photo=mix(photo,vec3(lum(photo))', `
        vec2 downtown=xz-cityOrigin;
        float cityBlend=1.-smoothstep(1330.,1440.,max(abs(downtown.x),abs(downtown.y)));
        photo=mix(photo,texture2D(cityOrtho,vec2(downtown.x,-downtown.y)/2900.+.5).rgb,cityBlend);
        vec2 streetUv=vec2((xz.x-1640.)/640.,1.-(xz.y-4210.)/720.);
        vec2 edgeMeters=min(streetUv,1.-streetUv)*vec2(640.,720.);
        float streetBlend=smoothstep(0.,20.,min(edgeMeters.x,edgeMeters.y));
        photo=mix(photo,texture2D(streetOrtho,streetUv).rgb,streetBlend);
        photo=mix(photo,vec3(lum(photo))`).replace('/* canopy transmission */', `
        // Retain the photographed parking lanes, paving and building shadows.
        vec3 urbanSurface=pow(max(photo,vec3(0.)),vec3(2.2))*vec3(.95,.97,1.);
        c=mix(c,urbanSurface,cityBlend*mix(.59,.94,streetBlend)*(1.-.60*veg));
        /* canopy transmission */`);
  }
  waterfront?.applyTerrain(terrain);
  // The survey texture covers kilometres. Within gliding distance of the shore,
  // rasterize metres from the actual clipped lake polygon or sea/terrain cut.
  // The same small field follows the bird and serves the water and exposed bank.
  function localShoreField(){
    const count=144,spacing=1.5,reach=32,span=count*spacing,cell=192;
    const bins=new Map(),pixels=new Uint8Array(count*count*4),squared=new Float32Array(count*count);
    const nearestX=new Float32Array(squared.length),nearestZ=new Float32Array(squared.length);
    pixels.fill(255);
    const map=new THREE.DataTexture(pixels,count,count,THREE.RGBAFormat);
    map.minFilter=map.magFilter=THREE.LinearFilter;map.needsUpdate=true;
    const origin=new THREE.Vector2(1e7,1e7);
    const uniforms={localBank:{value:map},bankOrigin:{value:origin},bankSpan:{value:span}};
    const key=(x,z)=>x+z*8192,caldera=region==='crater'?new Map():null;
    function add(ax,az,bx,bz){
      const dx=bx-ax,dz=bz-az,den=dx*dx+dz*dz;
      if(den<.0001)return;
      const segment=[ax,az,bx,bz,dx,dz,1/den];
      if(caldera){
        for(let j=Math.floor((Math.min(az,bz)-48)/cell);j<=Math.floor((Math.max(az,bz)+48)/cell);j++)
          for(let i=Math.floor((Math.min(ax,bx)-48)/cell);i<=Math.floor((Math.max(ax,bx)+48)/cell);i++){
            const k=key(i,j);if(!caldera.has(k))caldera.set(k,[]);caldera.get(k).push(segment);
          }
      }
      for(let j=Math.floor(Math.min(az,bz)/cell);j<=Math.floor(Math.max(az,bz)/cell);j++)
        for(let i=Math.floor(Math.min(ax,bx)/cell);i<=Math.floor(Math.max(ax,bx)/cell);i++){
          const k=key(i,j);if(!bins.has(k))bins.set(k,[]);bins.get(k).push(segment);
        }
    }
    if(survey.shore?.length){
      for(const loop of [survey.shore,...(survey.shoreHoles||[])])
        for(let i=0,j=loop.length-1;i<loop.length;j=i++)add(...loop[j],...loop[i]);
    }
    function terrainEdges(grid){
      if(survey.shore?.length)return;
      const xyz=grid.attributes.position.array,tri=grid.index.array,level=settings.water+.16;
      for(let i=0;i<tri.length;i+=3){
        const a=tri[i]*3,b=tri[i+1]*3,c=tri[i+2]*3;
        const wetA=xyz[a+1]<level,wetB=xyz[b+1]<level,wetC=xyz[c+1]<level;
        if(wetA===wetB&&wetB===wetC)continue;
        // The lone vertex of its sign touches both intersected triangle edges.
        const lone=wetB===wetC?a:wetA===wetC?b:c,first=lone===a?b:a,last=lone===c?b:c;
        const t=(level-xyz[lone+1])/(xyz[first+1]-xyz[lone+1]);
        const u=(level-xyz[lone+1])/(xyz[last+1]-xyz[lone+1]);
        add(lerp(xyz[lone],xyz[first],t),lerp(xyz[lone+2],xyz[first+2],t),
            lerp(xyz[lone],xyz[last],u),lerp(xyz[lone+2],xyz[last+2],u));
      }
    }
    let cellX=Infinity,cellZ=Infinity;
    function update(player){
      if(player.y>settings.water+350){
        cellX=Infinity;cellZ=Infinity;origin.set(1e7,1e7);return;
      }
      const x=Math.round(player.x/32),z=Math.round(player.z/32);
      if(x===cellX&&z===cellZ)return;
      cellX=x;cellZ=z;
      const ox=x*32-span*.5,oz=z*32-span*.5,nearby=new Set();
      for(let j=Math.floor((oz-reach)/cell);j<=Math.floor((oz+span+reach)/cell);j++)
        for(let i=Math.floor((ox-reach)/cell);i<=Math.floor((ox+span+reach)/cell);i++)
          for(const line of bins.get(key(i,j))||[])nearby.add(line);
      if(!nearby.size){origin.set(1e7,1e7);return;}
      squared.fill(reach*reach);
      for(const [ax,az,bx,bz,dx,dz,inv] of nearby){
        const x0=Math.max(0,Math.floor((Math.min(ax,bx)-reach-ox)/spacing));
        const x1=Math.min(count-1,Math.ceil((Math.max(ax,bx)+reach-ox)/spacing));
        const z0=Math.max(0,Math.floor((Math.min(az,bz)-reach-oz)/spacing));
        const z1=Math.min(count-1,Math.ceil((Math.max(az,bz)+reach-oz)/spacing));
        if(x0>x1||z0>z1)continue;
        for(let j=z0;j<=z1;j++){
          const rz=oz+(j+.5)*spacing-az;
          for(let i=x0;i<=x1;i++){
            const rx=ox+(i+.5)*spacing-ax,t=clamp((rx*dx+rz*dz)*inv,0,1);
            const ex=rx-dx*t,ez=rz-dz*t,k=j*count+i;
            const dist=ex*ex+ez*ez;
            if(dist<squared[k]){squared[k]=dist;nearestX[k]=ex;nearestZ[k]=ez;}
          }
        }
      }
      for(let i=0;i<squared.length;i++){
        const k=i*4;pixels[k]=Math.round(255/reach*Math.sqrt(squared[i]));
        pixels[k+1]=Math.round(128+127/reach*nearestX[i]);pixels[k+2]=Math.round(128+127/reach*nearestZ[i]);
      }
      origin.set(ox,oz);map.needsUpdate=true;
    }
    function calderaBed(x,z,y){
      // The caldera survey measures the lake surface, with quarter-metre
      // quantization at the shoreline. Low triangular cells can emerge above
      // the actual lake inside its polygon. Grade only this narrow shallow belt.
      const level=settings.water+.16;
      if(y<level-.6||y>level+2.8)return y;
      const nearby=caldera.get(key(Math.floor(x/cell),Math.floor(z/cell)));
      if(!nearby)return y;
      let nearest=48*48;
      for(const [ax,az,,,dx,dz,inv] of nearby){
        const rx=x-ax,rz=z-az,t=clamp((rx*dx+rz*dz)*inv,0,1);
        nearest=Math.min(nearest,(rx-t*dx)**2+(rz-t*dz)**2);
      }
      if(nearest>=48*48||!inLoop(x,z,survey.shore))return y;
      const d=Math.sqrt(nearest),strength=(1.-smoothstep(d,33,48))*(1.-smoothstep(y-level,.80,2.8));
      const bed=level-.31-Math.min(1.3,d*.13);
      return lerp(y,Math.min(y,bed),strength);
    }
    return {uniforms,terrainEdges,update,calderaBed};
  }
  const shoreDetail=settings.water!==undefined?localShoreField():null;

  function patch(left,top,width,depth,nx,nz){
    const grid=new THREE.PlaneGeometry(width,depth,nx,nz);grid.rotateX(-Math.PI/2);
    const p=grid.attributes.position,n=grid.attributes.normal;
    const step=Math.max(4,Math.min(22,width/nx*.7));
    for(let i=0;i<p.count;i++){
      const x=p.getX(i)+left+width/2,z=p.getZ(i)+top+depth/2;
      p.setXYZ(i,x,elevation(x,z),z);
      const dx=elevation(x-step,z)-elevation(x+step,z),dz=elevation(x,z-step)-elevation(x,z+step),inv=1/Math.hypot(dx,2*step,dz);
      n.setXYZ(i,dx*inv,2*step*inv,dz*inv);
    }
    shoreDetail?.terrainEdges(grid);
    grid.computeBoundingSphere();scene.add(new THREE.Mesh(grid,terrain));
  }
  function subdivide(left,top,right,bottom,step){
    const w=right-left,d=bottom-top;
    const piecesX=Math.ceil(w/(step*145)),piecesZ=Math.ceil(d/(step*145));
    for(let y=0;y<piecesZ;y++)for(let x=0;x<piecesX;x++)patch(left+x*w/piecesX,top+y*d/piecesZ,w/piecesX,d/piecesZ,Math.ceil(w/piecesX/step),Math.ceil(d/piecesZ/step));
  }
  function ring(a,b,step,cx=0,cz=0,insets=[]){
    const edges=[-b,cx-a,cx+a,b],rows=[-b,cz-a,cz+a,b];
    for(let j=0;j<3;j++)for(let i=0;i<3;i++)if(i!==1||j!==1){
      let areas=[[edges[i],rows[j],edges[i+1],rows[j+1]]];
      for(const [x0,z0,x1,z1] of insets)areas=areas.flatMap(([l,t,r,b])=>{
        const u=Math.max(l,x0),v=Math.max(t,z0),w=Math.min(r,x1),q=Math.min(b,z1);
        if(w<=u||q<=v)return [[l,t,r,b]];
        return [[l,t,r,v],[l,q,r,b],[l,v,u,q],[w,v,r,q]].filter(([a,b,c,d])=>a<c&&b<d);
      });
      for(const area of areas)subdivide(...area,step);
    }
  }
  ring(h,farH,Math.max(32,farH/570),0,0,waterfront?.rects);
  if(waterfront)for(const area of waterfront.rects)subdivide(...area,4.5);
  const core=tight?1450:h;
  if(cityGrid){
    // Subdivide the two lidar areas independently within the continuous valley.
    const detailAreas=[[focusX,focusZ],[cityX,cityZ]];
    const cuts=axis=>[-h,...detailAreas.flatMap(center=>[center[axis]-core,center[axis]+core]),h].sort((a,b)=>a-b);
    const xs=cuts(0),zs=cuts(1);
    for(let j=1;j<zs.length;j++)for(let i=1;i<xs.length;i++){
      const left=xs[i-1],top=zs[j-1],width=xs[i]-left,depth=zs[j]-top;
      if(width<=0||depth<=0)continue;
      const detailed=detailAreas.some(([x,z])=>Math.abs(left+width/2-x)<core&&Math.abs(top+depth/2-z)<core);
      subdivide(left,top,xs[i],zs[j],detailed?5:19);
    }
  }else{
    if(tight)ring(core,h,h/320,focusX,focusZ);
    for(let j=0;j<8;j++)for(let i=0;i<8;i++)patch(focusX-core+i*core/4,focusZ-core+j*core/4,core/4,core/4,tight?91:80,tight?91:80);
  }
  // Periodic cellular foam film. The two closest irregular bubble centres define
  // each membrane; bake it once so a low shore pass needs only filtered samples.
  function foamTexture(){
    const cells=19,size=256,points=[],film=new Uint8Array(size*size);
    let seed=4213;
    function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
    for(let i=0;i<cells*cells;i++)points.push([.12+.76*random(),.12+.76*random()]);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const fx=(x+.5)*cells/size,fy=(y+.5)*cells/size,ix=Math.floor(fx),iy=Math.floor(fy);
      let a=4,b=4;
      for(let j=iy-1;j<=iy+1;j++)for(let i=ix-1;i<=ix+1;i++){
        const point=points[(j+cells)%cells*cells+(i+cells)%cells];
        const dx=i+point[0]-fx,dy=j+point[1]-fy,d=dx*dx+dy*dy;
        if(d<a){b=a;a=d;}else b=Math.min(b,d);
      }
      film[y*size+x]=Math.round(255*(1.-smoothstep(Math.sqrt(b)-Math.sqrt(a),.024,.19)));
    }
    const map=new THREE.DataTexture(film,size,size,THREE.RedFormat);
    map.wrapS=map.wrapT=THREE.RepeatWrapping;map.minFilter=THREE.LinearMipmapLinearFilter;
    map.magFilter=THREE.LinearFilter;map.generateMipmaps=true;map.needsUpdate=true;return map;
  }
  const clock={value:0};let water=null,shoreFloor=null;
  // A short advancing sheet and a longer damp interval share the same packet
  // phases as the waves just offshore. Keep the wetting below the swash limit.
  const exposure=region==='lofoten'?.55:region==='milford'?.37:.06;
  const saltFoam=exposure>.1?foamTexture():null;
  const shoreSand=shoreDetail?texture('shore-sand.webp',true):null;
  if(shoreDetail){
    Object.assign(terrain.uniforms,shoreDetail.uniforms,{shoreTime:clock,shoreExposure:{value:exposure},
      bankMaterial:{value:texture('shore-cobble.webp',true)}});
    terrain.fragmentShader=shoreOptics+'\nuniform float shoreTime,shoreExposure;uniform sampler2D bankMaterial;\n'+terrain.fragmentShader.replace('/* canopy transmission */', `
      if(wp.y<shoreLevel+3.5 && d<260.){
        vec2 local=coastDistance(xz).xy;
        float above=wp.y-shoreLevel;
        float strip=(1.-smoothstep(1.3,5.5,local.x))*(1.-smoothstep(.32,2.4,above));
        if(strip*local.y>.006){
          vec2 uv=xz*.47;
          vec3 scanA=texture2D(bankMaterial,uv).rgb;
          vec3 scanB=texture2D(bankMaterial,vec2(uv.x*.83+uv.y*.56,uv.y*.83-uv.x*.56)*.69+.31).rgb;
          float blend=.35+.21*sin(xz.x*.23+xz.y*.14);
          vec3 beachColor=pow(mix(scanA,scanB,blend),vec3(2.2));
          float shade=.52+.60*max(0.,dot(normal,sun))*sunlit+.21*skyView;
          c=mix(c,beachColor*shade,strip*local.y*(1.-smoothstep(100.,260.,d))*
                    .85);
        }
        float zone=mix(.86,4.2,shoreExposure);
        if(local.y>.0 && local.x<zone*1.25){
          float t=shoreTime*.65,wave=shoreClock(xz,t,shoreExposure),packet=shoreGroup(xz,t);
          float reach=zone*(.22+.78*packet)*(.57+.43*sin(wave));
          float front=1.-smoothstep(reach-.20,reach+.20,local.x);
          float heightLimit=mix(.13,.72,shoreExposure)*(.55+.45*packet);
          float wet=local.y*(1.-smoothstep(heightLimit*.45,heightLimit,above))*(1.-smoothstep(100.,160.,d));
          float damp=(1.-smoothstep(.25,zone*1.25,local.x))*(.66+.20*sin(wave-.85));
          c*=1.-wet*(.21*damp+.24*front);
          float glancing=pow(1.-clamp(dot(normal,viewDir),0.,1.),3.);
          c=mix(c,vec3(.17,.24,.28)*(.64+.36*skyView),wet*front*(.06+.28*glancing));
        }
      }
      /* canopy transmission */`);
  }
  if(settings.water!==undefined){
    // Crater Lake is a hanging caldera. Its mesh stops at the inside of the rim.
    let g;
    if(survey.shore?.length){
      const vec=([x,z])=>new THREE.Vector2(x,-z);
      const outline=new THREE.Shape(survey.shore.map(vec));
      for(const hole of survey.shoreHoles||[])outline.holes.push(new THREE.Path(hole.map(vec)));
      g=new THREE.ShapeGeometry(outline);
    }else g=new THREE.PlaneGeometry(farH*2.4,farH*2.4);
    const waterColors={moosehead:0x25505c,winnipesaukee:0x20505e,surry:0x254b58,crater:0x0a3977,milford:0x163d49,lofoten:0x215364};
    water=new Water(g,{textureWidth:1024,textureHeight:512,waterNormals:texture('waternormals.jpg',true),sunDirection:sun,waterColor:waterColors[region]??settings.sea,fog:true});
    Object.assign(water.material.uniforms,{
      shoreTexel:{value:1/(surry?2048:dixville?768:region==='labrador'?640:1024)},
      shoreField:{value:texture('atlas-'+region+'-shore.webp')},terrainLight:{value:terrainLight},
      pebbles:{value:texture('shore-pebbles.webp',true)},basinSpan:{value:h*2},
      oceanSurf:{value:region==='lofoten'?.24:region==='milford'?.09:0},seaState:{value:region==='lofoten'?1.28:newEngland?.87:.94},
      rockyBed:{value:newEngland?1:.75}
    });
    Object.assign(water.material.uniforms,shoreDetail.uniforms,{
      shoreExposure:{value:exposure},bedRelief:{value:texture('shore-pebbles-normal.webp',true)},
      bedSand:{value:shoreSand},foamCells:{value:saltFoam}
    });
    waterfront?.applyWater(water.material);
    water.rotation.x=-Math.PI/2;water.position.y=settings.water+.16;scene.add(water);
    if(survey.shore?.length)shoreFloor=window.joinAtlasShore?.(THREE,scene,{region,survey,elevation,level:water.position.y,terrain});
  }
  let seed=134513;
  const rand=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
  const trees=[],firTrees=[],broadTrees=[],cells=new Map(),cell=(x,z)=>(Math.floor(x/50)+500)*1024+Math.floor(z/50)+500;
  const dam=surry?window.addSurryDam(THREE,scene,{survey,elevation,ground:shoreFloor?.ground||elevation,terrain,texture,sun,sky:skyMap,clock,aerial,half:h}):null;
  const settlement=waterfront?{
    buildings:[...(survey.settlement?.buildings||[]),...waterfront.settlement.buildings],
    piers:[...(survey.settlement?.piers||[]),...waterfront.settlement.piers]
  }:survey.settlement;
  const roofHeight=surry?window.makeKeeneCity(THREE,scene,{survey,height:elevation,sunMask:terrainLight}):
    settlement?window.addLakesideBuildings(THREE,scene,settlement,elevation,settings.water):null;
  const waterfrontHeight=waterfront?.build(elevation,settings.water);
  const cabin=survey.cabin?window.addLabradorCabin(THREE,scene,{elevation,height:elevation,waterLevel:settings.water,lakeLevel:settings.water},survey.cabin):null;
  const resort=dixville?window.addDixvilleLandmarks(THREE,scene,survey.sites,elevation):null;
  const lakeBounds=localShoreMask?survey.shore.reduce(([x0,x1,z0,z1],[x,z])=>
    [Math.min(x,x0),Math.max(x,x1),Math.min(z,z0),Math.max(z,z1)],[Infinity,-Infinity,Infinity,-Infinity]):null;
  function inLake(x,z){
    return (!lakeBounds||x>=lakeBounds[0]&&x<=lakeBounds[1]&&z>=lakeBounds[2]&&z<=lakeBounds[3])&&
      inLoop(x,z,survey.shore)&&!(survey.shoreHoles||[]).some(r=>inLoop(x,z,r));
  }
  function wetGround(x,z,y,margin){
    if(dixville)return y<settings.water+margin&&inLake(x,z);
    if(!surry)return y<(settings.water??-1000)+margin;
    return (y<settings.water+margin&&inLake(x,z))||Number.isFinite(dam.riverHeight(x,z));
  }
  function plant(tree,isFir){
    if(resort?.inClearing(tree.x,tree.z)||dam?.onDam(tree.x,tree.z)||cabin?.inClearing(tree.x,tree.z))return;
    if(Number.isFinite(roofHeight?.(tree.x,tree.z))||Number.isFinite(waterfrontHeight?.(tree.x,tree.z)))return;
    trees.push(tree);(isFir?firTrees:broadTrees).push(tree);
    const id=cell(tree.x,tree.z);if(!cells.has(id))cells.set(id,[]);cells.get(id).push(tree);
  }
  for(const tree of cabin?.campTrees||[])plant(tree,true);
  for(const tree of resort?.lawnTrees||[])plant(tree,true);
  const crownPoints=region==='yosemite'?window.yosemiteCanopy:survey.crownPoints;
  if(crownPoints){
    const records=bytes(crownPoints),view=new DataView(records.buffer);
    for(let off=0;off<records.length;off+=8){
      const x=focusX+view.getInt16(off,true),z=focusZ+view.getInt16(off+2,true);
      const species=records[off+6];
      plant({x,z,y:elevation(x,z),width:records[off+4]/8,height:records[off+5]/4,species,seed:records[off+7]/255},species===4);
    }
  }
  const cityTrees=surry?[...window.KEENE_CITY.trees,...(window.keeneCurbTrees||[])]:null;
  for(const [x,z,height,width,seed] of cityTrees||[])plant({x,z,y:elevation(x,z),height,width,seed},false);
  waterfront?.createTrees(plant,elevation,settings.water);
  const conifer=settings.conifers??['yosemite','crater'].includes(region);
  const firFraction=newEngland?clamp(settings.mixedFirFraction??(region==='moosehead'?.56:.30),0,1):(conifer?1:0);
  const treeSpacing=newEngland?clamp((settings.treeSpacing??18)*.68,10,20):(settings.treeSpacing??(region==='milford'?16:region==='lofoten'?24:21));
  for(let z=-h;z<h && (region!=='yosemite'||!crownPoints);z+=treeSpacing)for(let x=-h;x<h;x+=treeSpacing){
    const px=x+rand()*treeSpacing,pz=z+rand()*treeSpacing,y=elevation(px,pz);
    if(survey.crownPoints&&Math.max(Math.abs(px-focusX),Math.abs(pz-focusZ))<1445)continue;
    if(cityTrees&&Math.max(Math.abs(px-cityX),Math.abs(pz-cityZ))<600)continue;
    if(y>settings.top||wetGround(px,pz,y,newEngland?.8:4))continue;
    const biomass=growth(px,pz)*settings.cover;
    if(rand()>biomass)continue;
    const slope=Math.hypot(elevation(px+8,pz)-y,elevation(px,pz+8)-y)/8;
    if(slope>(region==='milford'?1.9:1.3))continue;
    const count=1+Math.floor(biomass*2.7*rand());
    for(let k=0;k<count;k++){
      const tx=px+(k?(rand()-.5)*treeSpacing:0),tz=pz+(k?(rand()-.5)*treeSpacing:0),ty=k?elevation(tx,tz):y;
      if(wetGround(tx,tz,ty,.8))continue;
      const height=settings.treeH*(.48+.66*rand());
      // Species mix varies gently by stand. Fir crowns rise as narrow spires;
      // a hardwood of the same height carries a broader, rounder canopy.
      const isFir=newEngland?rand()<clamp(firFraction+.10*Math.sin(tx*.006+tz*.0017)*Math.cos(tz*.004),0,1):conifer;
      const width=height*(isFir?.30+.19*rand():newEngland?.77+.32*rand():.68+.44*rand());
      const tree={x:tx,y:ty,z:tz,height,width,seed:rand()};
      plant(tree,isFir);
    }
  }
  const sunMask=terrainLight;
  const updateWeather=region==='labrador'?window.addBerteWeather(THREE,scene,{sun,clock,sky,terrain,settings,survey}):
    region==='crater'?window.addCraterWeather(THREE,scene,{sun,clock,sky,terrain,water}):null;
  window.shadeAtlasForest(THREE,terrain,trees,sun,h);
  const updateHardwoods=broadTrees.length?window.addHardwoods(THREE,scene,broadTrees,{region,sun,sunMask,half:h,fogColor:color,clock}):null;
  const spray=texture('waternormals.jpg',true);
  function cascade(name,reach,width){
    const mark=survey.landmarks.find(l=>l.name===name);if(!mark)return;
    let choice,score=-Infinity;
    for(let j=0;j<250;j++){
      const angle=rand()*6.283,x=mark.x+rand()*200-100,z=mark.z+rand()*200-100;
      const dx=Math.cos(angle),dz=Math.sin(angle),topY=elevation(x,z),bottom=elevation(x+dx*reach,z+dz*reach);
      const s=topY-bottom;if(s>score){score=s;choice={x,z,dx,dz};}
    }
    if(score<24)return;
    const {x,z,dx,dz}=choice,p=[],uv=[],idx=[],steps=65;
    for(let j=0;j<=steps;j++){
      const t=j/steps,wiggle=Math.sin(t*7.4)*width*.3,px=x+dx*reach*t-dz*wiggle,pz=z+dz*reach*t+dx*wiggle;
      for(let i=0;i<2;i++){
        const w=(i-.5)*width*(.55+.52*t),sx=px-dz*w,sz=pz+dx*w;
        p.push(sx,elevation(sx,sz)+2.2,sz);uv.push(i,t);
      }
      if(j<steps){const k=j*2;idx.push(k,k+1,k+2,k+1,k+3,k+2);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);
    const mat=new THREE.ShaderMaterial({uniforms:{clock,noise:{value:spray}},transparent:true,side:THREE.DoubleSide,depthWrite:false,
      vertexShader:'varying vec2 f;void main(){f=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`uniform float clock;uniform sampler2D noise;varying vec2 f;void main(){vec2 flow=vec2(f.x*.72,f.y*4.8-clock*.40);float n=texture2D(noise,flow).r;float edge=smoothstep(0.,.2,min(f.x,1.-f.x));gl_FragColor=vec4(mix(vec3(.59,.69,.70),vec3(.96,.99,1.),n),(.38+.52*n)*edge);}`});
    scene.add(new THREE.Mesh(g,mat));
  }
  if(region==='yosemite'){cascade('Bridalveil Fall',265,12);cascade('Yosemite Falls',560,17);}
  if(region==='milford'){cascade('Stirling Falls',144,9);cascade('Bowen Falls',180,11);}
  function inLoop(x,z,pts){
    if(!pts?.length)return true;
    let inside=false;
    for(let i=0,j=pts.length-1;i<pts.length;j=i++){
      const a=pts[i],b=pts[j];
      if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    }
    return inside;
  }
  function height(x,z){
    if(settings.water===undefined)return elevation(x,z);
    const ground=Math.max(elevation(x,z),dam?.riverHeight(x,z,true)??-Infinity,shoreFloor?.(x,z)??-Infinity);
    return ground<settings.water+.16&&inLake(x,z)?settings.water+.16:ground;
  }
  function clearance(x,z){
    let y=Math.max(height(x,z),resort?.clearance(x,z)??-Infinity,cabin?.clearance(x,z)??-Infinity,roofHeight?.(x,z)??-Infinity,dam?.structureHeight(x,z)??-Infinity,waterfrontHeight?.(x,z)??-Infinity);const ix=Math.floor(x/50),iz=Math.floor(z/50);
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
      const id=(ix+dx+500)*1024+iz+dz+500,group=cells.get(id);
      if(group)for(const t of group){const d=Math.hypot(x-t.x,z-t.z)/(t.width*.5);if(d<1)y=Math.max(y,t.y+t.height*(1-d*d*.68));}
    }
    return y;
  }
  const start=([x,z,tx,tz,agl,glance=0,lookDown=0])=>({x,z,y:clearance(x,z)+agl,yaw:Math.atan2(x-tx,z-tz),glance,lookDown});
  const spawn=start(settings.launch),low=start(settings.low);
  const launches={lake:spawn,ridge:low};
  if(region==='moosehead')launches.reeds={x:-1108,y:316.1,z:-2298,yaw:-1.560,glance:-25,lookDown:9};
  for(const [key,tuple] of Object.entries(waterfront?.launches||settings.extraLaunches||{}))launches[key]=start(tuple);
  let landmarks=waterfront?[...survey.landmarks.filter(mark=>!waterfront.landmarks.some(local=>local.name===mark.name)),...waterfront.landmarks]:survey.landmarks;
  if(cabin){
    const {cabin:porch,rainbow}=settings.extraLaunches;
    landmarks=landmarks.map(mark=>mark.x===survey.cabin.x&&mark.z===survey.cabin.z?{...mark,approach:porch}:mark);
    landmarks.push({name:'Rainbow overlook',x:rainbow[0],z:rainbow[1],approach:rainbow});
  }
  function groundCover(x,z){
    const y=elevation(x,z);
    if(resort?.inClearing(x,z)||cabin?.inClearing(x,z)||y>settings.top+110||wetGround(x,z,y,.45)||dam?.onDam(x,z)||
      Number.isFinite(roofHeight?.(x,z))||Number.isFinite(waterfrontHeight?.(x,z)))return -1;
    return growth(x,z);
  }
  const world={region,height,elevation,clearance,spawn,launches,landmarks,groundCover,coverHalf:h,cityTerrainMaterial:surry?terrain:null,
    bounds:{minX:-(settings.flightHalf||h)+90,maxX:(settings.flightHalf||h)-90,minZ:-(settings.flightHalf||h)+90,maxZ:(settings.flightHalf||h)-90},waterLevel:settings.water,lakeLevel:settings.water,
    skyTexture:skyMap,sunDirection:sun,sunMask,trees,firTrees,forestLightSpan:2*h,longForest:newEngland||region==='yosemite'||region==='labrador',useFirForest:firTrees.length>0,altitudeOffset:0,
    update(dt,t,player){clock.value=t;shoreDetail?.update(player);updateWeather?.(t,player,world.windField);rainTrace?.(t,player,world.windField);updateHardwoods?.(player);if(water)water.material.uniforms.time.value=t*.65;}};
  const rainTrace=window.makeRainTrace(THREE,scene,{world,terrain,water,cabin,survey,inLake,ground:(x,z)=>Math.max(shoreFloor?.ground(x,z)??elevation(x,z),shoreFloor?.(x,z)??-Infinity)});
  return world;
};
