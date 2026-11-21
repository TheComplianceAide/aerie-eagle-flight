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
  if(region==='moosehead')window.refineMooseheadShore(survey);
  const settings={
    yosemite:{sky:'alaska-evening.jpg',sun:[-.62,.46,.53],stone:[.64,.61,.57],treeH:30,top:2840,cover:.91,launch:[-4600,1780,2300,0,150],low:[-1700,1110,1560,-490,70]},
    crater:{sky:'alaska-evening.jpg',sun:[-.37,.53,-.71],water:1880.62,sea:0x123951,stone:[.43,.385,.337],treeH:21,top:2430,cover:.96,launch:[-3410,1770,-960,-230,315],low:[-2360,1720,600,1630,57]},
    lofoten:{sky:'atlas-qwantani_sunrise_puresky.webp',sun:[-.66,.35,.58],water:0,sea:0x225060,stone:[.37,.38,.37],treeH:6,top:330,cover:.6,launch:[600,2470,-450,-1890,320],low:[310,1680,-770,-1750,56]},
    milford:{flightHalf:6370,sky:'atlas-wasteland_clouds_puresky.webp',sun:[-.4,.43,.71],water:0,sea:0x1c4548,stone:[.34,.37,.36],treeH:17,top:1060,cover:1.15,launch:[2370,3200,-2000,-700,330],low:[2630,4340,560,1900,105]}
  }[region]||window.ATLAS_PROFILES?.[region];
  const acadia=region==='acadia';
  const surry=region==='surry';
  const dixville=region==='dixville';
  const newEngland=acadia||dixville||region==='moosehead'||region==='winnipesaukee'||surry;
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
  const notchSurveys=dixville?[
    ...(window.dixvilleNotchRock?[{x:0,z:300,half:360,grid:unpack(window.dixvilleNotchRock),step:2}]:[]),
    // The two road-facing teeth resolve down to a metre inside the broader gorge survey.
    {x:98,z:370,half:160,grid:unpack(window.dixvilleCrags),step:1},
    ...window.dixvilleBrooks.map(b=>({x:b.x,z:b.z,half:b.half,grid:unpack(b.terrain),step:b.half/96}))
  ]:[];
  const brook=window.aerieRegionalFalls?.[region],localDEM=window.aerieFallsSurveys?.[region];
  const brookGrid=localDEM?unpack(localDEM.terrain):null;
  const insideBrook=(x,z)=>Math.max(Math.abs(x-localDEM.x),Math.abs(z-localDEM.z))<localDEM.half;
  const fjordSurveys=(survey.fallsTerrain||[]).map(area=>({...area,grid:unpack(area.terrain)}));
  const fjordRects=fjordSurveys.map(a=>[a.x-a.half,a.z-a.half,a.x+a.half,a.z+a.half]);
  const cityGrid=survey.cityTerrain?unpack(survey.cityTerrain):null;
  const [cityX,cityZ]=survey.cityCenter||[0,0];
  const uplands=region==='moosehead'?window.mooseheadUplands:null;
  function farHeight(x,z){
    if(uplands){const measured=uplands.sample(x,z);if(measured!==null)return measured;}
    const base=sample(far,farH,x,z);
    if(dixville)return base; // This outer survey already resolves the 3DEP ridges.
    const shore=settings.water===undefined?1:smoothstep(base-settings.water,2,25);
    return base+shore*window.rangeRelief(region,x,z);
  }
  const tableHeight=dixville?window.dixvilleTableHeight:null;
  let ship=null;
  const kineo=region==='moosehead'?window.kineoSurvey:null;
  const landmarkTerrain=window.aerieRegionalLandforms?.get(region);
  const harborTerrain=region==='lofoten'?window.aerieRegionalLandforms.get('hamnoy'):null;
  const measuredTerrain=[landmarkTerrain,harborTerrain].filter(Boolean);
  const campSurface=region==='labrador'&&survey.cabin?landmarkTerrain?.surfacePatch(survey.cabin.x,survey.cabin.z,72,(x,z)=>regionalElevation(x,z,false)):null;
  function elevation(x,z,includeIslet=true){
    if(campSurface){const y=campSurface(x,z);if(y!==null)return y;}
    if(tableHeight&&x>=-256&&x<=256&&z>=128&&z<=512){
      const edge=Math.min(x+256,256-x,z-128,512-z);
      const measured=tableHeight(x,z);
      if(edge>=8)return measured;
      return lerp(regionalElevation(x,z,includeIslet),measured,smoothstep(edge,0,8));
    }
    const native=regionalElevation(x,z,includeIslet);
    let base=landmarkTerrain?landmarkTerrain.height(x,z,native):native;
    if(harborTerrain)base=harborTerrain.height(x,z,base);
    if(!brookGrid||!insideBrook(x,z))return kineo?kineo.elevation(x,z,base):base;
    const dx=x-localDEM.x,dz=z-localDEM.z,h=localDEM.half;
    return lerp(sample(brookGrid,h,dx,dz),base,smoothstep(Math.max(Math.abs(dx),Math.abs(dz)),h-18,h));
  }
  function regionalElevation(x,z,includeIslet){
    const r=Math.max(Math.abs(x),Math.abs(z));
    if(r>=h&&!fjordSurveys.some(a=>Math.abs(x-a.x)<a.half&&Math.abs(z-a.z)<a.half))return waterfront?waterfront.elevation((g,span,xx,zz)=>g===far?farHeight(xx,zz):sample(g,span,xx,zz),far,farH,x,z):farHeight(x,z);
    let val=sample(near,h,x,z);
    const focusDistance=Math.max(Math.abs(x-focusX),Math.abs(z-focusZ));
    if(tight&&focusDistance<1450)val=lerp(sample(tight,1450,x-focusX,z-focusZ),val,smoothstep(focusDistance,1395,1450));
    const cityDistance=Math.max(Math.abs(x-cityX),Math.abs(z-cityZ));
    if(cityGrid&&cityDistance<1450)val=lerp(sample(cityGrid,1450,x-cityX,z-cityZ),val,smoothstep(cityDistance,1395,1450));
    if(r>h-200)val=lerp(val,farHeight(x,z),smoothstep(r,h-200,h));
    for(const area of notchSurveys){
      const dx=x-area.x,dz=z-area.z,r=Math.max(Math.abs(dx),Math.abs(dz));
      if(r<area.half)val=lerp(sample(area.grid,area.half,dx,dz),val,smoothstep(r,area.half-7,area.half));
    }
    for(const a of fjordSurveys){const dx=x-a.x,dz=z-a.z,r=Math.max(Math.abs(dx),Math.abs(dz));
      if(r<a.half)val=lerp(sample(a.grid,a.half,dx,dz),val,smoothstep(r,a.half-27,a.half));}
    if(region!=='crater')return val;
    const bed=shoreDetail.calderaBed(x,z,val);
    return includeIslet&&ship?Math.max(bed,ship.surface(x,z)):bed;
  }
  function growth(x,z){
    if(uplands&&Math.max(Math.abs(x),Math.abs(z))>=h)return uplands.cover(x,z);
    const i=Math.floor((x/h*.5+.5)*384),j=Math.floor((z/h*.5+.5)*384);
    return i>=0&&i<384&&j>=0&&j<384?cover[j*384+i]/255:0;
  }
  const loader=new THREE.TextureLoader();
  function texture(file,repeat=false){const tex=loader.load(file);tex.anisotropy=12;if(repeat)tex.wrapS=tex.wrapT=THREE.RepeatWrapping;return tex;}
  // The solar bearing also locates the illuminated gap in each panorama.
  // Scene-light colors are sRGB. The terrain irradiances below are linear RGB.
  const twilight={
    acadia:{sky:'acadia-night',fog:0x32454d,sun:0xabbcde,power:.18,skyFill:0x6e85ae,ground:0x273442,
      diffuse:[.10,.145,.22],beam:[.15,.19,.28]},
    lofoten:{sky:'lofoten-dusk',fog:0x99858d,sun:0xffb680,power:1.06,skyFill:0xbdafc9,ground:0x574d50,
      diffuse:[.34,.34,.46],beam:[1.08,.68,.49]}
  }[region];
  const lightAngles={acadia:[174,9],moosehead:[-84,15.5],winnipesaukee:[-112,4.2],surry:[167,19],yosemite:[157,12.4],crater:[-70,8],lofoten:[-115,4.3],milford:[-71,8]};
  const [azimuth,altitude]=(settings.lightAngles||lightAngles[region]).map(THREE.MathUtils.degToRad);
  const sun=new THREE.Vector3(Math.cos(azimuth)*Math.cos(altitude),Math.sin(altitude),Math.sin(azimuth)*Math.cos(altitude));
  const skyMap=texture(twilight?twilight.sky+'-sky.webp':settings.skyMap||'atlas-'+region+'-sky.webp');
  skyMap.colorSpace=THREE.SRGBColorSpace;skyMap.wrapS=THREE.RepeatWrapping;
  skyMap.minFilter=acadia?THREE.LinearMipmapLinearFilter:THREE.LinearFilter;skyMap.generateMipmaps=acadia;
  const fog=twilight?.fog??(dixville?0xc5b7b6:region==='milford'?0xb2b9b9:0xb6bfc8);
  scene.fog=new THREE.FogExp2(fog,region==='milford'?.000064:.000042);
  const sunlight=new THREE.DirectionalLight(twilight?.sun??(dixville?0xffc493:0xffdcad),twilight?.power??2.1);
  sunlight.position.copy(sun).multiplyScalar(1000);
  scene.add(sunlight,new THREE.HemisphereLight(twilight?.skyFill??0xdde7fa,twilight?.ground??0x756757,acadia?.38:1.39));
  const sky=new THREE.Mesh(new THREE.SphereGeometry(1,32,18),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{map:{value:skyMap}},
    vertexShader:'varying vec3 ray;void main(){ray=position;vec4 clip=projectionMatrix*vec4(mat3(viewMatrix)*position,1.);gl_Position=clip.xyww;}',
    fragmentShader:`varying vec3 ray;uniform sampler2D map;void main(){vec3 d=normalize(ray);
      vec2 uv=vec2(.5+atan(d.z,d.x)*.15915494,.5+asin(d.y)*.31830989);
      gl_FragColor=vec4(texture2D(map,uv).rgb,1.);
      #include <colorspace_fragment>
    }`}));
  sky.frustumCulled=false;sky.renderOrder=-1000;scene.add(sky);
  const geology='jointed';
  const aerial=texture('atlas-'+region+'-photo.webp'),ranges=texture('atlas-'+region+'-ranges.webp'),stone=texture('atlas-'+geology+'-rock.webp',true),sod=texture('field-ground-scans.webp');
  const color=new THREE.Color(fog);
  const terrainLight=texture('atlas-'+region+'-light.webp'),fracture=texture('atlas-'+geology+'-relief.webp',true);
  const canopyMap=new THREE.DataTexture(cover,384,384,THREE.RedFormat);
  canopyMap.minFilter=canopyMap.magFilter=THREE.LinearFilter;canopyMap.needsUpdate=true;
  const localShoreMask=surry||dixville;
  const terrain=new THREE.ShaderMaterial({uniforms:{terrainLight:{value:terrainLight},fracture:{value:fracture},canopyMap:{value:canopyMap},temperate:{value:newEngland?1:0},shoreLevel:{value:settings.water===undefined?-10000:settings.water+.16},arctic:{value:region==='lofoten'?1:0},aerial:{value:aerial},ranges:{value:ranges},rockScan:{value:stone},sod:{value:sod},sun:{value:sun},halfMap:{value:h},farSpan:{value:2*farH},stoneTint:{value:new THREE.Vector3(...settings.stone)},haze:{value:color},desert:{value:0}},
    vertexShader:'varying vec3 wp,norm;void main(){wp=position;norm=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform sampler2D terrainLight,fracture,canopyMap,aerial,ranges,rockScan,sod;uniform vec3 sun,stoneTint,haze;uniform float halfMap,farSpan,desert,shoreLevel,arctic,temperate;varying vec3 wp,norm;
      ${window.aerieFieldShader(region)}
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
        float grit=lum(soilCapture(sod,(a*.75+b*.25)*.12,4.).rgb);
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
        float surveyedCover=texture2D(canopyMap,clamp(xz/(2.*halfMap)+.5,0.,1.)).r*inside;
        float treeZone=1.-smoothstep(${(settings.top-120).toFixed(1)},${(settings.top+70).toFixed(1)},wp.y);
        float woody=treeZone*max(surveyedCover,veg*.83);
        float natural=smoothstep(.48,.88,normal.y)*(1.-snow);
        ${surry?'natural*=mix(1.,smoothstep(.017,.09,photo.g-(photo.r*.83+photo.b*.17)),cityBlend);':''}
        ${newEngland||region==='labrador'?'natural*=max(.10,smoothstep(.07,.42,max(veg,surveyedCover)));':''}
        float wetMargin=1.-smoothstep(1.5,20.,abs(wp.y-shoreLevel));
        c=regionalSoil(sod,wp,normal,c,sun,d,woody,wetMargin,natural);
        float green=smoothstep(.025,.15,c.g-(c.r+c.b)*.45);
        c=mix(c,vec3(lum(c)),green*(.12+.22*arctic));
        c*=vec3(1.025,.999,.965);
        float skyView=occ.g,relief=(occ.b-.5)*(1.-.68*veg);
        vec3 ambient=vec3(${twilight?twilight.diffuse.join(','):'.51,.61,.76'})*(.66+.34*max(normal.y,0.))*(.69+.31*skyView);
        vec3 direct=vec3(${twilight?twilight.beam.join(','):'1.25,.98,.69'})*(.14+1.02*incidence)*sunlit;
        ambient*=mix(vec3(1.),vec3(.74,.87,1.02),desert*(1.-.63*skyView));
        c=pow(max(c,vec3(0.)),vec3(2.2))*(ambient+direct)*(1.+(.32+.42*desert)*relief);
        /* canopy transmission */
        float dep=1.-exp(-d*(.000032-.000007*temperate));
        vec3 aerialHaze=haze*mix(vec3(.79,.86,1.0),vec3(1.12,1.01,.88),.5+.5*dot(normalize(wp-cameraPosition),sun));
        gl_FragColor=vec4(mix(c,aerialHaze,dep*(.72+.28*skyView)),1.);
        #include <colorspace_fragment>
      }`});
  if(acadia){
    // The Atlantic cuts nearly vertical faces into the granite. Read the one-
    // metre surveyed slopes in the fragment shader instead of interpolating
    // a coarse landward normal over the whole face as the eagle flies past.
    terrain.uniforms.coastalNormals={value:texture('acadia-coastal-normals.webp')};
    terrain.uniforms.coastalWall={value:texture('acadia-otter-granite.webp',true)};
    terrain.fragmentShader='uniform sampler2D coastalNormals,coastalWall;\n'+terrain.fragmentShader
      .replace('vec3 normal=normalize(norm);', `
        vec3 normal=normalize(norm);
        vec2 coastUv=(wp.xz-vec2(488.,94.))/vec2(1536.,2704.)+.5;
        vec3 measured=texture2D(coastalNormals,vec2(coastUv.x,1.-coastUv.y)).rgb;
        vec2 slope=measured.rg*2.-1.;
        vec3 ledgeNormal=normalize(vec3(slope.x,sqrt(max(.002,1.-dot(slope,slope))),slope.y));
        float coastEdge=min(min(coastUv.x,coastUv.y),min(1.-coastUv.x,1.-coastUv.y));
        float graniteShore=smoothstep(.001,.013,coastEdge)*(1.-smoothstep(40.,69.,wp.y));
        normal=normalize(mix(normal,ledgeNormal,.94*graniteShore));`)
      .replace('vec3 c=mix(photo,stoneColor,materialWeight);', `
        vec3 c=mix(photo,stoneColor,materialWeight);
        // Small mineral grains and fractured slabs project onto the exposed
        // rock in wall coordinates, including below the top-down photo lip.
        float exposed=graniteShore*(1.-smoothstep(.42,.89,normal.y))*(1.-smoothstep(350.,900.,d));
        float grain=lum(mix(texture2D(rockScan,b*.29).rgb,texture2D(rockScan,a*.29).rgb,axis));
        float ledges=clamp(.74+.27*(measured.b-.5)*2.+.34*(grain-.48)+.42*(cliff-.45),.33,1.35);
        vec3 granite=vec3(.44,.405,.385)*ledges;
        c=mix(c,granite,exposed*.90);`)
      .replace('/* canopy transmission */', `
        // Moonlit facets have weak ambient separation. Preserve joint shadows
        // in the cliff photograph without projecting treetop albedo down-wall.
        float bareRock=1.-smoothstep(.20,.71,max(veg,surveyedCover));
        float ledgeZone=exposed*(1.-smoothstep(.25,.85,surveyedCover));
        // Slab tops and walls need separate projections. A single horizontal
        // bearing drags one row of pixels down every shore face which turns away.
        float bench=graniteShore*bareRock*smoothstep(.21,.42,lum(photo))*
                    (1.-smoothstep(115.,400.,d))*(1.-smoothstep(32.,48.,wp.y));
        float rockBlend=max(ledgeZone,bench*.83);
        if(rockBlend>.002){
          vec3 w=pow(abs(ledgeNormal),vec3(5.));
          w/=max(.001,dot(w,vec3(1.)));
          vec3 p=wp+vec3(.44*sin(wp.z*.041),.36*sin(wp.x*.083+wp.z*.035),.27*sin(wp.x*.02));
          vec3 rock=texture2D(coastalWall,p.zy*vec2(.096,-.13)+vec2(.25,.14)).rgb*w.x+
                    texture2D(coastalWall,p.xz*vec2(.12,.10)+vec2(.62,.56)).rgb*w.y+
                    texture2D(coastalWall,p.xy*vec2(-.103,-.138)).rgb*w.z;
          float surfaceLight=.70+.26*measured.b+.18*max(0.,dot(ledgeNormal,sun));
          float wetRock=mix(.43,1.,smoothstep(.9,4.8,wp.y+1.25*(measured.b-.5)));
          float blocks=.26+1.62*lum(rock);
          vec3 lunarFace=vec3(.026,.029,.038)*surfaceLight*wetRock*blocks*blocks;
          lunarFace*=mix(vec3(1.),rock/max(.18,lum(rock)),.18);
          c=mix(c,lunarFace,rockBlend*.95);
        }
        /* canopy transmission */`);
  }
  if(region==='milford'){
    terrain.uniforms.fallsOrtho={value:texture('milford-falls-ortho.webp')};
    terrain.fragmentShader='uniform sampler2D fallsOrtho;\n'+terrain.fragmentShader.replace('photo=mix(photo,vec3(lum(photo))',`// The 0.75 m LINZ image continues past the edge of the main atlas
      // at Bowen. Remove the white moving water frozen in the source photo;
      // the channel, spray and broken foam are independently animated geometry.
      vec2 fjordCenter=xz.x>0.?vec2(3200.,5615.):vec2(-835.,-788.);
      float fjordHalf=xz.x>0.?300.:220.;vec2 fjordUV=(xz-fjordCenter)/fjordHalf;
      float localCoverage=1.-smoothstep(.87,1.,max(abs(fjordUV.x),abs(fjordUV.y)));
      vec2 fjordPatch=vec2((.5+.5*fjordUV.x)*.5+(xz.x>0.?0.:.5),.5-.5*fjordUV.y);
      vec3 surveyedRock=texture2D(fallsOrtho,fjordPatch).rgb;
      vec2 lip=xz.x>0.?vec2(3311.,5580.):vec2(-810.,-843.);
      vec2 mouth=xz.x>0.?vec2(3078.,5629.):vec2(-845.,-737.);
      vec2 course=mouth-lip;float down=clamp(dot(xz-lip,course)/dot(course,course),0.,1.);
      float toCourse=length(xz-lip-course*down);
      float wetted=1.-smoothstep(17.,56.,toCourse);
      float bright=smoothstep(.43,.78,min(min(surveyedRock.r,surveyedRock.g),surveyedRock.b));
      float coldWater=smoothstep(.0,.12,surveyedRock.b-surveyedRock.r);
      float photographedFoam=wetted*max(bright,.67*coldWater);
      photo=mix(photo,surveyedRock,localCoverage);
      photo=mix(photo,vec3(lum(photo))`).replace('float dep=1.-exp(-d',`if(localCoverage>.002){
        float faceWet=1.-smoothstep(.49,.88,normal.y);
        float pore=clamp((cliff-.17)*1.36+(fissure-.16)*.50,0.,1.);
        vec3 gneiss=mix(vec3(.14,.19,.20),vec3(.43,.46,.45),pore);
        float chlorophyll=smoothstep(.018,.107,surveyedRock.g-surveyedRock.r*.93)*
                          smoothstep(.012,.12,surveyedRock.g-surveyedRock.b);
        // Keep canopy structure on forested shoulders; reveal the scanned
        // wet rock on vertical faces and in the scoured bed below the cataract.
        float rockShare=max(photographedFoam,.95*faceWet*(1.-chlorophyll*.14));
        vec3 bankFace=mix(surveyedRock,gneiss,rockShare);
        float surfaceTexture=.89+.23*clamp(.44*grit+.64*cliff,0.,1.);
        bankFace*=surfaceTexture*(1.-.20*wetted*faceWet);
        vec3 ambient=vec3(.68,.79,.86)*(.79+.28*max(.0,dot(relieved,normalize(vec3(.3,.85,.18))))),daylight=vec3(.70,.58,.41)*(.25+.75*sunlit)*max(0.,dot(sun,normal));
        c=mix(c,pow(max(bankFace,vec3(.005)),vec3(2.2))*(ambient+daylight),localCoverage);
      }
      float dep=1.-exp(-d`);
  }
  if(region==='yosemite'){
    const granite=texture('atlas-yosemite-cathedral.webp');
    granite.wrapS=granite.wrapT=THREE.MirroredRepeatWrapping;
    terrain.uniforms.cathedralGranite={value:granite};
    terrain.uniforms.westFace={value:texture('atlas-yosemite-west-face.webp')};
    terrain.uniforms.valleyCover={value:texture('yosemite-valley-cover.webp')};
    terrain.fragmentShader='uniform sampler2D cathedralGranite,westFace,valleyCover;\n'+terrain.fragmentShader.replace(
      '/* exposed field geology */',`
        // Oblique field photographs restore the cliff-scale joints which a
        // downward-looking orthophoto cannot capture on a near-vertical wall.
        float fold=wp.y*.00138+.025*sin(wp.z*.004+wp.x*.0017);
        vec2 slabX=vec2(wp.z*.00157+.031*sin(wp.x*.003),fold);
        vec2 slabZ=vec2(wp.x*.00164+.036*sin(wp.z*.0023),fold+.32);
        float joints=mix(texture2D(cathedralGranite,slabZ).r,texture2D(cathedralGranite,slabX).r,axis);
        float cathedral=1.-smoothstep(800.,2150.,length(wp.xz-vec2(-875.,1953.)));
        vec3 graniteColor=vec3(.99,.987,.972)*(joints*.82+.095)*(.83+.55*cliff);
        vec4 riparianSurvey=texture2D(valleyCover,photoUv);
        vec3 unitCover=riparianSurvey.rgb;
        float bare=1.-smoothstep(.30,.70,veg);
        float exposed=face*bare*smoothstep(1193.,1315.,wp.y);
        // The dark mineral seams sit between broad slabs, with pale, fresh
        // broken edges resolving only as the bird approaches.
        vec2 split=mix(slabZ,slabX,axis);
        float flake=texture2D(cathedralGranite,split*3.51+vec2(.24,.17)).r;
        graniteColor=vec3(.99,.972,.949)*(.18+.84*joints)*(.69+.48*flake+.22*cliff);
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
        lithology=mix(lithology,cliffImage.rgb*(1.01+.20*(cliff-.45)),cliffImage.a*visible);
      `);
    terrain.fragmentShader=terrain.fragmentShader.replace('/* canopy transmission */',`
      // Re-light the surveyed oblique photographs with the same western sun
      // that casts the valley's shadows. Preserve crack contrast in shade.
      float wallMask=exposed*(1.-smoothstep(4800.,16000.,d));
      vec3 granite=graniteColor*(.86+.25*unitCover.b);
      granite=mix(granite,cliffImage.rgb*(.94+.17*cliff),visible*cliffImage.a);
      float convex=clamp(.86+.42*relief,.63,1.18);
      float fill=.43+.23*skyView+.10*max(relieved.y,0.);
      vec3 wallLight=vec3(.85,.98,1.17)*fill+vec3(1.73,1.11,.64)*sunlit*(.12+1.01*incidence);
      c=mix(c,pow(max(granite,vec3(.018)),vec3(2.03))*wallLight*convex,wallMask);
      // Sedges follow the floodplain, cottonwood/willow strips follow mapped
      // watercourses and dry summer meadow grasses pick up grazing sunlight.
      float floodplain=smoothstep(.89,.999,normal.y)*(1.-smoothstep(1260.,1325.,wp.y));
      float grass=unitCover.r*floodplain;
      vec3 dry=vec3(.57,.50,.29)*(.79+.40*lum(photo)+.19*(lum(soilCapture(sod,xz*.44,6.).rgb)-.37));
      dry=mix(dry,vec3(.29,.39,.22)*(.87+.30*lum(photo)),unitCover.g);
      c=mix(c,pow(dry,vec3(2.18))*(ambient+direct),grass*.78);
      // Relative to the measured wet line, newly exposed bars are coarser
      // and paler than the organic floor immediately under alder and willow.
      float nearBank=(1.-smoothstep(.71,.98,riparianSurvey.a))*floodplain;
      if(nearBank>.008){
        vec2 p=wp.xz;
        vec4 stones=soilCapture(sod,p*.49+.10*sin(p.yx*.022),3.);
        vec4 fines=soilCapture(sod,mat2(.90,.44,-.44,.90)*p*.21,7.);
        float bar=smoothstep(.29,.48,riparianSurvey.a)*(1.-smoothstep(.55,.78,riparianSurvey.a));
        float dryBack=smoothstep(.34,.64,riparianSurvey.a);
        vec3 mineral=mix(fines.rgb,stones.rgb,.42+.49*bar);
        float l=lum(mineral);
        mineral=mix(mineral,l*vec3(1.08,1.04,.938),.44);
        mineral*=mix(.63,1.10,dryBack)*(.94+.18*stones.a);
        float foliage=smoothstep(.026,.16,photo.g-(photo.r*.82+photo.b*.18));
        c=mix(c,pow(mineral,vec3(2.14))*(ambient+direct),nearBank*(1.-.64*foliage)*(.92-.24*smoothstep(310.,1900.,d)));
      }
      /* canopy transmission */`);
  }
  if(dixville){
    terrain.uniforms.notchStone={value:texture('dixville-schist.webp',true)};
    terrain.uniforms.brookKnots={value:window.dixvilleBrooks.flatMap(b=>[...b.upstream.slice(0,-1),...b.rail,...b.downstream.slice(1)].map(([x,z])=>new THREE.Vector2(x,z)))};
    terrain.fragmentShader='uniform vec2 brookKnots[46];\n'+terrain.fragmentShader;
    terrain.uniforms.autumnFloor={value:texture('dixville-autumn-floor.webp',true)};
    terrain.uniforms.floorRelief={value:texture('dixville-floor-relief.webp',true)};
    terrain.uniforms.ridgeLight={value:texture('dixville-ridge-light.webp')};
    terrain.fragmentShader='uniform sampler2D notchStone,autumnFloor,floorRelief,ridgeLight;\n'+terrain.fragmentShader.replace('float green=smoothstep', `
      // At walking height, light falls across the curled leaves and into the
      // gaps between them. Blend two scan orientations across irregular patches.
      float leafCover=smoothstep(.13,.63,dense)*smoothstep(.59,.86,normal.y);
      if(leafCover>.005 && d<175.){
        vec2 uv,uvB;float litterMix;fieldCoordinates(xz,uv,uvB,litterMix);
        uv=uv*.71+vec2(.21,.12);uvB=uvB*.71+vec2(.21,.12);
        vec4 litter=mix(texture2D(autumnFloor,uv),texture2D(autumnFloor,uvB),litterMix);
        // World-space height gradients light the curled leaves consistently
        // regardless of which scan orientation takes over at a patch edge.
        float measured=mix(texture2D(floorRelief,uv).b,texture2D(floorRelief,uvB).b,litterMix)*.35+.65*litter.a;
        vec3 dx=dFdx(wp),dy=dFdy(wp),u=cross(dy,normal),v=cross(normal,dx);
        float area=dot(dx,u);
        vec3 grad=(dFdx(measured)*u+dFdy(measured)*v)*sign(area)/max(.00001,abs(area));
        vec3 raised=normalize(normal-.037*grad);
        float highlights=clamp(1.+.83*(dot(raised,sun)-dot(normal,sun)),.68,1.34);
        float litterBed=.37+.45*fieldGrain(xz*.071+vec2(.29,.83));
        c=mix(c,litter.rgb*highlights*(.73+.43*litter.a),leafCover*(1.-smoothstep(45.,175.,d))*litterBed);
      }
      float mountainShade=texture2D(ridgeLight,vec2(xz.x,-xz.y)/farSpan+.5).r;
      float backRange=smoothstep(halfMap*.78,halfMap*1.13,extent);
      c*=mix(1.,clamp(.62+mountainShade*.83,.72,1.34),backRange*.94);
      // Registered slope, convexity and exposed stone mapped from 3DEP and NAIP.
      vec2 cragUV=vec2(xz.x-150.,350.-xz.y)/768.+.5;
      float inCrags=1.-smoothstep(.476,.5,max(abs(cragUV.x-.5),abs(cragUV.y-.5)));
      vec2 scarpData=texture2D(ridgeLight,clamp(cragUV,0.,1.)).gb;
      vec3 site=vec3(scarpData,clamp(.5+3.*(photo.r-photo.g),.1,.91));
      float exposed=site.r*inCrags;
      // Foliation descends diagonally through the flutes. Let the longer
      // upright ribs read as single faces across many metres of smaller joints.
      vec3 rockPosition=wp-vec3(98.,700.,370.);
      vec2 faceX=vec2(rockPosition.z,rockPosition.y+.26*rockPosition.z);
      vec2 faceZ=vec2(rockPosition.x,rockPosition.y-.22*rockPosition.x);
      float faceBlend=smoothstep(.12,.90,axis);
      vec2 top=mat2(.86,-.51,.51,.86)*rockPosition.xz;
      float cap=smoothstep(.65,.93,normal.y);
      vec4 fineX=texture2D(notchStone,faceX*vec2(.22,.18)+.027*warp);
      vec4 fineZ=texture2D(notchStone,faceZ*vec2(.22,.18)-.032*warp+.34);
      vec4 rockFine=mix(mix(fineZ,fineX,faceBlend),texture2D(notchStone,top*.23),cap);
      vec4 longX=texture2D(notchStone,faceX*vec2(.067,.039)+.07*warp);
      vec4 longZ=texture2D(notchStone,faceZ*vec2(.074,.043)-.06*warp+.35);
      vec4 rockLarge=mix(mix(longZ,longX,faceBlend),texture2D(notchStone,top*.081+.17),cap);
      vec3 scarp=mix(rockLarge.rgb,rockFine.rgb,.40)*(.66+.30*rockLarge.a+.11*rockFine.a);
      float ribLight=clamp(.62+.65*site.g+.25*(rockLarge.a-.55),.54,1.1);
      vec3 mineral=mix(vec3(.75,.83,.95),vec3(.98,.98,.92),site.b*.63);
      c=mix(c,scarp*mineral*ribLight,exposed*.99);
      // Relight the scanned fractures in world space. Derivatives keep their
      // tilt continuous on both sides of the texture projection seam.
      float depth=(rockLarge.a-.5)*1.36+(rockFine.a-.5)*.17;
      vec3 edgeU=dFdx(wp),edgeV=dFdy(wp);
      vec3 basisU=cross(edgeV,normal),basisV=cross(normal,edgeU);
      float signedArea=dot(edgeU,basisU);
      vec3 grad=(dFdx(depth)*basisU+dFdy(depth)*basisV)*sign(signedArea)/max(.0001,abs(signedArea));
      vec3 schistNormal=normalize(normal-grad/max(1.,length(grad)*.88));
      relieved=normalize(mix(relieved,schistNormal,exposed));
      incidence=max(0.,dot(relieved,sun));
      if(d<310.&&(length(xz-brookKnots[11])<105.||length(xz-brookKnots[34])<105.)){
        float brookD=100.,halfBed=1.4;
        for(int j=0;j<45;j++){
          if(j==22)continue;
          vec2 a=brookKnots[j],edge=brookKnots[j+1]-a;
          float distanceTo=length(xz-a-edge*clamp(dot(xz-a,edge)/max(.01,dot(edge,edge)),0.,1.));
          if(distanceTo<brookD){brookD=distanceTo;halfBed=j<22?1.4:2.05;}
        }
        float damp=1.-smoothstep(halfBed-.4,halfBed+3.2,brookD);
        vec3 gravel=texture2D(bankMaterial,mat2(.91,-.42,.42,.91)*xz*.68).rgb;
        gravel=mix(gravel,texture2D(bankMaterial,xz*.27+.35).rgb,.26);
        float ledge=1.-smoothstep(.55,.94,normal.y);
        vec3 bank=mix(gravel,scarp,ledge*.86);
        vec3 wetBank=bank*mix(vec3(.83,.83,.79),vec3(.43,.49,.51),damp);
        float soil=1.-smoothstep(halfBed+3.,halfBed+9.+rockLarge.a*4.,brookD);
        c=mix(c,wetBank,soil*(1.-smoothstep(215.,310.,d))*.96);
      }
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
    const localRock=texture('kineo-fracture-scan.webp');
    localRock.wrapS=localRock.wrapT=THREE.MirroredRepeatWrapping;
    terrain.uniforms.localRhyolite={value:localRock};
    terrain.uniforms.kineoSlopes={value:texture('moosehead-kineo-slopes.webp')};
    terrain.fragmentShader='uniform sampler2D localRhyolite,kineoSlopes;\n'+terrain.fragmentShader
      .replace('vec3 normal=normalize(norm);', `
        vec3 normal=normalize(norm);
        // USGS 1 m bare earth survey, east/up/south axes. Keep the shoreline apron independent.
        vec2 lidarUv=(wp.xz-vec2(-422.,-1750.))/vec2(1150.,1140.);
        float lidarEdge=min(min(lidarUv.x,lidarUv.y),min(1.-lidarUv.x,1.-lidarUv.y));
        vec3 lidar=texture2D(kineoSlopes,vec2(lidarUv.x,1.-lidarUv.y)).rgb;
        vec2 tilt=lidar.rg*2.-1.;
        vec3 measuredNormal=vec3(tilt.x,sqrt(max(.0001,1.-dot(tilt,tilt))),tilt.y);
        float localSurvey=smoothstep(.004,.034,lidarEdge)*smoothstep(315.,329.,wp.y);
        normal=normalize(mix(normal,measuredNormal,.85*localSurvey));`)
      .replace('/* exposed field geology */', `
        // A reconstructed south/east outcrop: orthophotos flatten a cliff, so
        // mineral reflectance and relief are sampled in metres along its face.
        vec2 toCliff=(wp.xz-vec2(108.,-970.))/vec2(840.,740.);
        float rockBounds=1.-smoothstep(.75,1.29,length(toCliff));
        vec3 rockGeom=normalize(norm);
        // A contour-registered mesh and its one-metre raster apron share this
        // weathered rim. Use the same low-frequency surface frame on both
        // sides before resolving close joint normals. The rim follows variable
        // bedding elevation and tapers above the lake into the wooded crown.
        float cliffStation=min(wp.z+1241.5,-1060.5-wp.z);
        float cliffVertical=min(wp.y-314.,502.-wp.y);
        float cliffBorder=min(cliffStation,cliffVertical);
        float cliffSide=1.-smoothstep(20.,69.,abs(wp.x-284.));
        float cliffRim=(1.-smoothstep(1.,34.,abs(cliffBorder)))*cliffSide;
        float brokenFace=cliffSide*smoothstep(-31.,23.,cliffBorder);
        vec3 weatheredNormal=normalize(vec3(1.,.18+.043*sin(wp.y*.052+wp.z*.016),
          -.34+.15*sin(wp.z*.037+wp.y*.014)+.11*sin(wp.y*.055)));
        rockGeom=normalize(mix(rockGeom,weatheredNormal,cliffRim*.89));
        float escarpment=rockBounds*smoothstep(.24,.68,1.-rockGeom.y)*smoothstep(312.49,318.,wp.y);
        float rockRun=dot(wp.xz,vec2(.27,-.963));
        float localDip=.085*rockRun+2.35*sin(rockRun*.032)+.93*sin(rockRun*.091+wp.y*.029);
        vec2 faceMetres=vec2(rockRun,wp.y+localDip);
        vec2 broadUv=faceMetres/vec2(74.,16.);
        broadUv+=vec2(.10*sin(wp.y*.047+rockRun*.031),.14*sin(rockRun*.057-wp.y*.011));
        vec2 rockUv=vec2(faceMetres.x+faceMetres.y*.17,faceMetres.y-.072*rockRun)/vec2(27.2,5.94);
        // Switch projection as the physical face turns. An underlip or an
        // upward rock shelf must reveal a surface across its depth too.
        vec3 facet=normalize(cross(dFdx(wp),dFdy(wp)));
        if(dot(facet,rockGeom)<0.)facet=-facet;
        facet=normalize(mix(facet,weatheredNormal,.89*cliffRim));
        vec3 projectionWeights=pow(abs(mix(rockGeom,facet,.7)),vec3(2.8));
        projectionWeights/=max(.001,dot(projectionWeights,vec3(1.)));
        vec2 sideMetres=vec2(wp.x-.19*wp.z,wp.y-.17*wp.x);
        vec2 topMetres=mat2(.91,.415,-.415,.91)*wp.xz;
        vec4 fractureSurvey=projectionWeights.x*texture2D(localRhyolite,broadUv)
          +projectionWeights.z*texture2D(localRhyolite,sideMetres/vec2(61.,15.)+.35)
          +projectionWeights.y*texture2D(localRhyolite,topMetres/vec2(40.,11.)-.52);
        vec4 smallRock=projectionWeights.x*texture2D(localRhyolite,rockUv+vec2(.32,-.17))
          +projectionWeights.z*texture2D(localRhyolite,sideMetres/vec2(22.,6.9)-.61)
          +projectionWeights.y*texture2D(localRhyolite,topMetres/vec2(18.,5.2)+.18);
        float angularPatch=.50+.17*sin(.052*rockRun-.034*wp.y+.9*sin(.023*wp.y));
        float pigment=mix(smallRock.r,fractureSurvey.r,angularPatch);
        float marked=clamp((pigment-.23)*1.40,0.,1.);
        vec3 baseRhyolite=mix(vec3(.245,.264,.265),vec3(.685,.643,.539),marked);
        float exposure=.63*fractureSurvey.a+.37*smallRock.a;
        baseRhyolite*=.64+.40*exposure;
        // Open mineral planes, dark fractures and wet lake-contact rock share
        // the same physical shader across the old GLB, its seam and the broad TIN.
        lithology=mix(lithology,baseRhyolite,escarpment);
        materialWeight=max(materialWeight,escarpment);
      `)
      .replace('vec3 c=mix(photo,stoneColor,materialWeight);',
        'vec3 c=mix(mix(photo,stoneColor,materialWeight),baseRhyolite,escarpment);')
      .replace('float incidence=max(0.,dot(relieved,sun))',`
        vec3 strike=normalize(vec3(rockGeom.z,0.,-rockGeom.x)+vec3(.00001,0.,.00001));
        vec3 rockUp=normalize(cross(rockGeom,strike));
        vec2 rockSlope=(mix(fractureSurvey.gb,smallRock.gb,.41)-.5)*2.;
        vec3 jointNormal=normalize(rockGeom+strike*rockSlope.x*1.18+rockUp*rockSlope.y*1.31);
        relieved=normalize(mix(relieved,jointNormal,escarpment));
        float incidence=max(0.,dot(relieved,sun))`)
      .replace('/* canopy transmission */',`
        // Sunlit edges retain warmth while overhanging facets receive blue sky
        // and lake fill. This follows the measured plus reconstructed 3D normal.
        vec3 rockAmbient=vec3(.50,.577,.665)*(.56+.32*exposure+.19*max(rockGeom.y,0.));
        // A horizontal map's shadow cannot represent different altitudes on
        // a nearly vertical wall. Reconstruct the slowly changing sky opening
        // across the two source meshes, retaining local occlusion in the joints.
        float rimSun=.67+.075*sin(wp.z*.02-wp.y*.011);
        float wallLight=mix(sunlit,rimSun,clamp(.91*cliffRim+.52*brokenFace,0.,.96));
        float wallIncidence=mix(incidence,max(0.,dot(weatheredNormal,sun)),.61*cliffRim);
        rockAmbient+=brokenFace*vec3(.065,.062,.055);
        vec3 rockDirect=vec3(1.22,.982,.70)*(.08+1.19*wallIncidence)*wallLight;
        vec3 rockLit=pow(baseRhyolite,vec3(2.2))*(rockAmbient+rockDirect);
        c=mix(c,rockLit,escarpment*.95);
        /* canopy transmission */`)
      .replace('float dep=1.-exp(-d*(.000032-.000007*temperate));','float dep=1.-exp(-d*mix(.000025,.000016,smoothstep(4200.,7000.,d)));');
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
    function terrainEdges(grid,keepBed){
      if(survey.shore?.length)return;
      const xyz=grid.attributes.position.array,tri=grid.index.array,level=settings.water+.16;
      let kept=0;
      for(let i=0;i<tri.length;i+=3){
        const a=tri[i]*3,b=tri[i+1]*3,c=tri[i+2]*3;
        const wetA=xyz[a+1]<level,wetB=xyz[b+1]<level,wetC=xyz[c+1]<level;
        // The ocean terrain shader discards everything below level + 1 mm.
        // Keep the complete shoreline triangles and the separately shaded brook beds.
        if(!keepBed&&wetA&&wetB&&wetC)continue;
        if(kept<i){tri[kept]=tri[i];tri[kept+1]=tri[i+1];tri[kept+2]=tri[i+2];}
        kept+=3;
        if(wetA===wetB&&wetB===wetC)continue;
        // The lone vertex of its sign touches both intersected triangle edges.
        const lone=wetB===wetC?a:wetA===wetC?b:c,first=lone===a?b:a,last=lone===c?b:c;
        const t=(level-xyz[lone+1])/(xyz[first+1]-xyz[lone+1]);
        const u=(level-xyz[lone+1])/(xyz[last+1]-xyz[lone+1]);
        add(lerp(xyz[lone],xyz[first],t),lerp(xyz[lone+2],xyz[first+2],t),
            lerp(xyz[lone],xyz[last],u),lerp(xyz[lone+2],xyz[last+2],u));
      }
      if(kept<tri.length)grid.setIndex(new THREE.BufferAttribute(tri.subarray(0,kept),1));
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
    // The land DEM reports the lake surface over most of the basin. At rim
    // distances that false surface and the water share a depth-buffer value.
    // Recover the submerged triangles from the georeferenced USGS sonar grid.
    const soundings=region==='crater'?window.calderaBathymetry:null;
    const depths=soundings?bytes(soundings.depth):null;
    function sounding(x,z){
      const {width,height,step}=soundings;
      const u=(x-soundings.x)/step,v=(z-soundings.z)/step,i=Math.floor(u),j=Math.floor(v);
      if(i<0||j<0||i>=width-1||j>=height-1)return 0;
      const k=i+j*width,s=u-i,t=v-j,unit=600/(255*255);
      return unit*lerp(lerp(depths[k]**2,depths[k+1]**2,s),
        lerp(depths[k+width]**2,depths[k+width+1]**2,s),t);
    }
    function calderaBed(x,z,y){
      // The caldera survey measures the lake surface, with quarter-metre
      // quantization at the shoreline. Low triangular cells can emerge above
      // the actual lake inside its polygon. Grade only this narrow shallow belt.
      const level=settings.water+.16;
      if(y>level+2.8)return y;
      const depth=sounding(x,z);
      if(depth>0){
        const shoreBlend=1.-smoothstep(y-level,.15,2.8);
        const bed=level-depth*shoreBlend;
        if(bed<y)return bed;
      }
      if(y<level-.6)return y;
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
    function closestBank(x,z){
      const ix=Math.floor(x/cell),iz=Math.floor(z/cell);
      let best=32*32,yaw=0;
      for(let j=iz-1;j<=iz+1;j++)for(let i=ix-1;i<=ix+1;i++){
        for(const [ax,az,,,dx,dz,inv] of bins.get(key(i,j))||[]){
          const rx=x-ax,rz=z-az,t=clamp((rx*dx+rz*dz)*inv,0,1);
          const d=(rx-dx*t)**2+(rz-dz*t)**2;
          if(d<best){best=d;yaw=Math.atan2(-dz,dx);}
        }
      }
      return {distance:best<1024?Math.sqrt(best):Infinity,yaw,stream:false};
    }
    return {uniforms,terrainEdges,update,calderaBed,closestBank};
  }
  const shoreDetail=settings.water!==undefined?localShoreField():null;
  if(region==='crater')ship=window.makePhantomShip(THREE,scene,texture,settings.water+.16);

  // Keep one ground mesh per 64 m square. Refine the survey near the eagle
  // without drawing the coarse grid underneath it or allocating the whole
  // 1.6-million-triangle ridge at startup.
  const tableMeshes=[];
  let tableMaterial=null;
  function tableGeometry(left,top,step){
    const segments=64/step;
    const g=new THREE.PlaneGeometry(64,64,segments,segments);g.rotateX(-Math.PI/2);
    const p=g.attributes.position,n=g.attributes.normal;
    for(let row=0;row<=segments;row++)for(let col=0;col<=segments;col++){
      const x=left+col*step,z=top+row*step,i=row*(segments+1)+col;
      let y=elevation(x,z);
      // Constrain border vertices to their common 4 m polyline, independently
      // of the currently selected resolution on the adjacent square.
      if((row===0||row===segments)&&x%4){
        const a=Math.floor(x/4)*4;y=lerp(elevation(a,z),elevation(a+4,z),(x-a)/4);
      }else if((col===0||col===segments)&&z%4){
        const a=Math.floor(z/4)*4;y=lerp(elevation(x,a),elevation(x,a+4),(z-a)/4);
      }
      p.setXYZ(i,x,y,z);
      const dx=elevation(x-.5,z)-elevation(x+.5,z),dz=elevation(x,z-.5)-elevation(x,z+.5);
      const len=Math.hypot(dx,1,dz);n.setXYZ(i,dx/len,1/len,dz/len);
    }
    g.computeBoundingSphere();
    return g;
  }
  function buildTable(){
    tableMaterial=terrain.clone();
    tableMaterial.uniforms={...terrain.uniforms,aerial:{value:texture('dixville-table-ortho.webp')}};
    tableMaterial.fragmentShader=terrain.fragmentShader.replace(/vec3 photo=mix\(texture2D\(aerial,photoUv\).*?;/,
      'vec3 photo=texture2D(aerial,vec2((xz.x+256.)/512.,(512.-xz.y)/384.)).rgb;')
      .replace('photo=mix(photo,texture2D(detailOrtho,vec2(focus.x,-focus.y)/2900.+.5).rgb,blend);','');
    window.finishDixvilleTableRock(tableMaterial,texture);
    for(let z=128;z<512;z+=64)for(let x=-256;x<256;x+=64){
      const mesh=new THREE.Mesh(tableGeometry(x,z,4),tableMaterial);
      mesh.userData.terrainCaster=true;
      mesh.name='Table Rock · lidar ground';scene.add(mesh);
      tableMeshes.push({mesh,x,z,y:elevation(x+32,z+32),step:4});
    }
  }
  const compactTable=window.matchMedia('(pointer: coarse)').matches;
  function updateTable(eye){
    if(!tableMeshes.length)return;
    let next=null,priority=Infinity,target=4;
    for(const tile of tableMeshes){
      const d=Math.hypot(eye.x-tile.x-32,eye.z-tile.z-32,eye.y-tile.y);
      const step=d<(tile.step<=1?125:100)?(compactTable?1:.5):d<(tile.step<=2?350:300)?2:4;
      if(step===tile.step)continue;
      const rank=step<tile.step?d:2500-d*.01;
      if(rank<priority){next=tile;priority=rank;target=step;}
    }
    if(!next)return;
    const old=next.mesh.geometry;
    next.mesh.geometry=tableGeometry(next.x,next.z,target);next.step=target;old.dispose();
  }
  const distantTiles=[];
  let detailX=Infinity,detailZ=Infinity;
  function updateDistantTerrain(player){
    if(!distantTiles.length||Math.abs(player.x-detailX)+Math.abs(player.z-detailZ)<45)return;
    detailX=player.x;detailZ=player.z;
    for(const t of distantTiles){
      const dx=Math.max(t.left-player.x,0,player.x-t.right),dz=Math.max(t.top-player.z,0,player.z-t.bottom);
      const next=window.aerieTerrainIndices.select(t.grid,t.native,t.reduced,Math.hypot(dx,dz));
      if(t.grid.index!==next)t.grid.setIndex(next);
    }
  }
  const brookMeshes=[];
  function patch(left,top,width,depth,nx,nz,localBed=false){
    // Cut the existing terrain around the high-resolution inset. The same
    // survey supplies the drawn rock, physical surface and waterfall rails.
    for(const survey of measuredTerrain){
      const [xl,zt,xr,zb]=survey.rect,right=left+width,bottom=top+depth;
      const l=Math.max(left,xl),t=Math.max(top,zt),r=Math.min(right,xr),b=Math.min(bottom,zb);
      if(l<r&&t<b){
        for(const [ax,az,bx,bz] of [[left,top,right,t],[left,b,right,bottom],[left,t,l,b],[r,t,right,b]]){
          if(ax<bx&&az<bz)patch(ax,az,bx-ax,bz-az,Math.max(1,Math.ceil(nx*(bx-ax)/width)),Math.max(1,Math.ceil(nz*(bz-az)/depth)),localBed);
        }
        return;
      }
    }
    if(kineo){
      // Reserve the measured wall and wave margin. Their adjoining survey
      // meets the local GLB at its exact contour vertices in native metres.
      const right=left+width,bottom=top+depth;
      for(const {rect:[xl,zt,xr,zb]} of kineo.areas){
        const l=Math.max(left,xl),t=Math.max(top,zt),r=Math.min(right,xr),b=Math.min(bottom,zb);
        if(l>=r||t>=b)continue;
        for(const [ax,az,bx,bz] of [[left,top,right,t],[left,b,right,bottom],[left,t,l,b],[r,t,right,b]]){
          if(ax<bx&&az<bz)patch(ax,az,bx-ax,bz-az,Math.max(1,Math.ceil(nx*(bx-ax)/width)),Math.max(1,Math.ceil(nz*(bz-az)/depth)),localBed);
        }
        return;
      }
    }
    if(localDEM&&!localBed){
      const {x,z,half}=localDEM,right=left+width,bottom=top+depth;
      const l=Math.max(left,x-half),t=Math.max(top,z-half),r=Math.min(right,x+half),b=Math.min(bottom,z+half);
      if(l<r&&t<b){
        for(const [ax,az,bx,bz] of [[left,top,right,t],[left,b,right,bottom],[left,t,l,b],[r,t,right,b]]){
          if(ax<bx&&az<bz)patch(ax,az,bx-ax,bz-az,Math.ceil(nx*(bx-ax)/width),Math.ceil(nz*(bz-az)/depth));
        }
        return;
      }
    }
    // The 2 m Ocean Path survey resolves joints that the standard 4 m
    // mesh bridges over. Refine only coastal inner tiles; doubled segments
    // retain every existing sample along adjoining tile borders.
    const acadiaLedge=acadia && width<=365 && depth<=365 &&
      left<1300 && left+width>-280 && top<1450 && top+depth>-1300 &&
      (left<210 && left+width>-180 || top< -520 && left+width>280);
    if(acadiaLedge){nx*=2;nz*=2;}
    const grid=new THREE.PlaneGeometry(width,depth,nx,nz);grid.rotateX(-Math.PI/2);
    const p=grid.attributes.position,n=grid.attributes.normal;
    const step=localBed?1:Math.max(acadiaLedge?1.4:dixville?1.1:4,Math.min(22,width/nx*.7));
    for(let i=0;i<p.count;i++){
      const x=p.getX(i)+left+width/2,z=p.getZ(i)+top+depth/2;
      let height=elevation(x,z,false);
      if(acadiaLedge){
        // Odd edge vertices lie halfway along a neighbour's original segment.
        // Snap those to that segment so the 2 m cliff never cracks at a 4 m tile.
        const col=i%(nx+1),row=Math.floor(i/(nx+1));
        if((col===0||col===nx) && row%2===1)
          height=(elevation(x,z-depth/nz,false)+elevation(x,z+depth/nz,false))*.5;
        else if((row===0||row===nz) && col%2===1)
          height=(elevation(x-width/nx,z,false)+elevation(x+width/nx,z,false))*.5;
      }
      p.setXYZ(i,x,height,z);
      const dx=elevation(x-step,z)-elevation(x+step,z),dz=elevation(x,z-step)-elevation(x,z+step),inv=1/Math.hypot(dx,2*step,dz);
      n.setXYZ(i,dx*inv,2*step*inv,dz*inv);
    }
    shoreDetail?.terrainEdges(grid,localBed);
    if(region==='yosemite'&&!localBed){
      const reduced=window.aerieTerrainIndices?.forGrid(region,left,top,nx,nz,grid);
      if(reduced)distantTiles.push({left,top,right:left+width,bottom:top+depth,grid,native:grid.index,reduced});
    }
    grid.computeBoundingSphere();
    const mesh=new THREE.Mesh(grid,terrain);
    mesh.userData.terrainCaster=true;
    scene.add(mesh);
    if(localBed)brookMeshes.push(mesh);
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
  const maineGround=uplands?texture('moosehead-bank-ground.webp'):null;
  const streamWoodland=uplands&&localDEM?.woodland?texture('cold-stream-woodland.webp'):null;
  if(uplands)uplands.add(THREE,scene,ranges,texture('moosehead-horizon.webp'),sun,color,texture('moosehead-bays.webp'),maineGround,localDEM,streamWoodland);
  else ring(h,farH,Math.max(32,farH/570),0,0,waterfront?.rects||fjordRects);
  if(waterfront)for(const area of waterfront.rects)subdivide(...area,4.5);
  const core=tight?1450:h;
  if(fjordRects.length){
    // The Bowen cataract crosses the edge of the main 11 km land survey.
    // Share one continuous mesh at the confluence of the radar and shoreline grids.
    const cuts=axis=>[...new Set([-h,h,...fjordRects.flatMap(a=>[clamp(a[axis],-h,h),clamp(a[axis+2],-h,h)])])].sort((a,b)=>a-b);
    const xs=cuts(0),zs=cuts(1);
    for(let j=1;j<zs.length;j++)for(let i=1;i<xs.length;i++){
      const x=(xs[i-1]+xs[i])*.5,z=(zs[j-1]+zs[j])*.5;
      if(!fjordRects.some(a=>x>a[0]&&z>a[1]&&x<a[2]&&z<a[3]))subdivide(xs[i-1],zs[j-1],xs[i],zs[j],17.2);
    }
    fjordRects.forEach((r,i)=>subdivide(...r,fjordSurveys[i].step));
  }else if(cityGrid){
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
  }else if(notchSurveys.length){
    // Share edges with the larger DEM. The gorge and the narrow waterfall beds
    // have enough survey points to hold their shape on the closest flybys.
    const cuts=a=>[...new Set([-h,-core,core,h,...(tableHeight?(a==='x'?[-256,256]:[128,512]):[]),...notchSurveys.flatMap(r=>[r[a]-r.half,r[a]+r.half])])].sort((a,b)=>a-b);
    const east=cuts('x'),south=cuts('z');
    for(let j=1;j<south.length;j++)for(let i=1;i<east.length;i++){
      const x=(east[i-1]+east[i])*.5,z=(south[j-1]+south[j])*.5;
      if(tableHeight&&x>-256&&x<256&&z>128&&z<512)continue;
      const steps=notchSurveys.filter(a=>Math.abs(x-a.x)<a.half&&Math.abs(z-a.z)<a.half).map(a=>a.step);
      const step=steps.length?Math.min(...steps):(Math.max(Math.abs(x),Math.abs(z))<core?4:12);
      subdivide(east[i-1],south[j-1],east[i],south[j],step);
    }
  }else{
    if(tight)ring(core,h,h/320,focusX,focusZ);
    for(let j=0;j<8;j++)for(let i=0;i<8;i++)patch(focusX-core+i*core/4,focusZ-core+j*core/4,core/4,core/4,tight?91:80,tight?91:80);
  }
  if(localDEM){
    const {x,z,half}=localDEM;
    for(let j=-1;j<1;j++)for(let i=-1;i<1;i++)patch(x+i*half,z+j*half,half,half,half,half,true);
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
  const exposure=acadia?.70:region==='lofoten'?.55:region==='milford'?.37:.06;
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
  if(region==='moosehead'&&shoreDetail){
    // Four ground photographs share the shelf's existing sampler, including
    // on the measured Kineo mesh where texture units are limited.
    terrain.uniforms.bankMaterial.value.dispose();
    terrain.uniforms.bankMaterial.value=maineGround;
    terrain.fragmentShader=terrain.fragmentShader.replace('uniform sampler2D bankMaterial;', `uniform sampler2D bankMaterial;
      vec3 maineGround(vec2 phase,vec2 tile){
        vec2 repeatUV=1.-abs(2.*fract(.5*phase)-1.);
        return texture2D(bankMaterial,.5*(tile+.011+.978*repeatUV)).rgb;
      }`)
      .replace('texture2D(bankMaterial,uv).rgb','maineGround(uv,vec2(0.,0.))')
      .replace('texture2D(bankMaterial,vec2(uv.x*.83+uv.y*.56,uv.y*.83-uv.x*.56)*.69+.31).rgb','maineGround(vec2(uv.x*.83+uv.y*.56,uv.y*.83-uv.x*.56)*.69+.31,vec2(1.,0.))')
      .replace('if(wp.y<shoreLevel+3.5 && d<260.){',`
        if(wp.y>shoreLevel-.55 && wp.y<shoreLevel+24. && d<430.){
          float above=wp.y-shoreLevel;
          vec2 bank=coastDistance(xz).xy;
          float shoreReach=(1.-smoothstep(6.,32.,bank.x))*bank.y;
          float soilWeight=(1.-smoothstep(16.,24.,above))*smoothstep(.36,.76,normal.y)
                           *(1.-smoothstep(245.,430.,d))*(.47+.53*shoreReach);
          if(soilWeight>.015){
            float standNoise=fieldGrain(xz*.054+vec2(18.6,-9.));
            vec2 phaseA,phaseB;float phase;fieldCoordinates(xz,phaseA,phaseB,phase);
            // Rotate two independent grain fields. Their continuous blend avoids
            // the square repeat that would otherwise track an eagle over the shore.
            vec3 duff=mix(maineGround(phaseA*.238,vec2(1.,1.)),maineGround(phaseB*.238,vec2(1.,1.)),phase);
            vec3 till=mix(maineGround(phaseA*.39+.42,vec2(0.,1.)),maineGround(phaseB*.39+.42,vec2(0.,1.)),phase);
            vec3 gravel=maineGround(mat2(.90,.436,-.436,.90)*xz*.43,vec2(1.,0.));
            float litter=smoothstep(1.1,7.8,above+standNoise*3.)*(.64+.36*woody);
            vec3 floorColor=mix(mix(gravel,till,smoothstep(.07,1.55,above+standNoise-.46)),duff,litter);
            vec3 light=(vec3(.52,.61,.70)*(.80+.20*skyView)+vec3(1.13,.99,.78)*(.12+.92*incidence)*sunlit);
            c=mix(c,pow(floorColor,vec3(2.2))*light,soilWeight*.95);
          }
        }
        if(wp.y<shoreLevel+3.5 && d<260.){`);
  }
  if(settings.water!==undefined){
    // Crater Lake is a hanging caldera. Its mesh stops at the inside of the rim.
    let g;
    if(survey.shore?.length){
      const vec=([x,z])=>new THREE.Vector2(x,-z);
      const outline=new THREE.Shape(survey.shore.map(vec));
      for(const hole of survey.shoreHoles||[])outline.holes.push(new THREE.Path(hole.map(vec)));
      g=new THREE.ShapeGeometry(outline);
    }else{
      // Two triangles spanning 43 km lose depth precision when clipped at
      // the eagle's near plane. Shorter coplanar spans keep the fjord's
      // waterline attached to the granite. At Thunder Hole they also keep
      // the lower surface from cutting diagonally through the 4 m surf grid.
      const divisions=region==='lofoten'||acadia?64:1;
      g=new THREE.PlaneGeometry(farH*2.4,farH*2.4,divisions,divisions);
    }
    const waterColors={acadia:0x101c29,moosehead:0x25505c,winnipesaukee:0x20505e,surry:0x454d49,crater:0x0a3977,milford:0x163d49,lofoten:0x215364};
    water=new Water(g,{textureWidth:1024,textureHeight:512,waterNormals:texture('waternormals.jpg',true),sunDirection:sun,waterColor:waterColors[region]??settings.sea,fog:true});
    Object.assign(water.material.uniforms,{
      shoreTexel:{value:1/(surry?2048:dixville?768:region==='labrador'?640:1024)},
      shoreField:{value:texture('atlas-'+region+'-shore.webp')},terrainLight:{value:terrainLight},
      pebbles:{value:texture('shore-pebbles.webp',true)},basinSpan:{value:h*2},
      oceanSurf:{value:acadia?.15:region==='lofoten'?.24:region==='milford'?.09:0},seaState:{value:acadia?1.38:region==='lofoten'?1.28:surry?.14:newEngland?.87:.94},
      rockyBed:{value:newEngland?1:.75}
    });
    Object.assign(water.material.uniforms,shoreDetail.uniforms,{
      shoreExposure:{value:exposure},bedRelief:{value:texture('shore-pebbles-normal.webp',true)},
      bedSand:{value:shoreSand},foamCells:{value:saltFoam}
    });
    waterfront?.applyWater(water.material);
    if(region==='lofoten'||acadia){
      // With a shoulder camera centimetres from the feathers, the sea and
      // low coastal rock can share a depth value several kilometres away.
      // The land shader clips below sea level. Resolve the remaining ties
      // in favor of exposed rock and the moving film of breaking surf.
      water.renderOrder=-500;
      water.material.polygonOffset=true;
      water.material.polygonOffsetUnits=2;
    }
    water.rotation.x=-Math.PI/2;water.position.y=settings.water+.16;scene.add(water);
    if(survey.shore?.length)shoreFloor=window.joinAtlasShore?.(THREE,scene,{region,survey,elevation,level:water.position.y,terrain});
  }
  const waterfallViews=new Map();
  const waterfalls=(brook||['milford','yosemite','dixville'].includes(region))?window.makeWaterfallSystem(THREE,scene,{clock,ground:elevation,level:dixville||brook?undefined:water?.position.y,sun,texture,sky:skyMap}):null;
  function chute(name,rail,width,options={}){
    const route=waterfalls.chute(name,rail,width,options),nodes=route.nodes;
    // Focus across the descending column and its splash basin. This anchor
    // is also used by Explore and the authored viewpoints.
    const top=nodes[0],foot=nodes.at(-1),height=(top.floor-foot.floor)*.29+foot.floor;
    let near=foot;for(const p of nodes)if(Math.abs(p.y-height)<Math.abs(near.y-height))near=p;
    const dx=foot.x-top.x,dz=foot.z-top.z,len=Math.hypot(dx,dz)||1;
    waterfallViews.set(name,{x:near.x,z:near.z,y:near.y,dx:dx/len,dz:dz/len,reach:len,brook:!!options.brook});
  }
  if(region==='milford'){
    chute('Stirling Falls',[[-810,-843],[-824,-816],[-831,-785],[-841,-755],[-844,-742],[-845,-737]],14);
    chute('Bowen Falls',[[3313,5578],[3311,5580],[3287,5584],[3264,5590],[3241,5595],[3217,5600],[3206,5602]],21);
    chute('Bowen River outfall',[[3206,5602],[3175,5608],[3137,5617],[3089,5627],[3082,5629]],11);
    waterfallViews.get('Bowen Falls').approach=[2975,5530,3150,5620,48,13,4];
  }
  if(region==='yosemite'){
    chute('Bridalveil Fall',[[-1903,1825],[-1917,1803],[-1969,1744],[-1981,1730]],14);
    chute('Yosemite Falls',[[2565,-2609],[2563,-2590],[2516,-2495],[2518,-2472]],21);
    chute('Middle Cascades',[[2518,-2472],[2509,-2454],[2506,-2398],[2511,-2359],[2515,-2330],[2510,-2294],[2509,-2269],[2513,-2236],[2517,-2211],[2527,-2188],[2530,-2173],[2535,-2157],[2536,-2118],[2529,-2097],[2516,-2059],[2516,-2035]],8);
    chute('Lower Yosemite Fall',[[2516,-2035],[2515,-2008],[2514,-1995],[2513,-1978],[2512,-1962],[2512,-1954],[2515,-1936]],13);
  }
  if(dixville)for(const b of window.dixvilleBrooks){
    const width=b.name==='Baby Flume'?2.8:4.1;
    waterfalls.chute('Brook above '+b.name,b.upstream,width*.73,{pool:false});
    chute(b.name,b.rail,width,{pool:true,poolLevel:b.height.at(-1)+.14});
    waterfalls.chute('Brook below '+b.name,b.downstream,width*.86,{pool:false});
  }
  if(brook){
    chute(brook.name,brook.rail,brook.width,{brook:true});
    window.makeRegionalBrook(THREE,scene,{brook,elevation,clock,texture,sky:skyMap,sun,region});
  }
  if(!dixville&&!brook)waterfalls?.couple(water);
  let seed=134513;
  const rand=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
  const trees=[],firTrees=[],broadTrees=[],cells=new Map(),cellStride=uplands?4096:1024,cell=(x,z)=>(Math.floor(x/50)+500)*cellStride+Math.floor(z/50)+500;
  if(['surry','moosehead','winnipesaukee','labrador','dixville'].includes(region))
    scene.userData.buildingLight=window.makeBuildingLight(THREE,scene,region,skyMap);
  const dam=surry?window.addSurryDam(THREE,scene,{survey,elevation,ground:shoreFloor?.ground||elevation,terrain,texture,sun,sky:skyMap,clock,aerial,half:h}):null;
  const settlement=waterfront?{
    buildings:[...(survey.settlement?.buildings||[]),...waterfront.settlement.buildings],
    piers:[...(survey.settlement?.piers||[]),...waterfront.settlement.piers]
  }:survey.settlement;
  const roofHeight=surry?window.makeKeeneCity(THREE,scene,{survey,height:elevation,sunMask:terrainLight}):
    region==='lofoten'?window.addHamnoyHarbor(THREE,scene,elevation,settings.water):
    settlement?window.addLakesideBuildings(THREE,scene,settlement,elevation,settings.water):null;
  const waterfrontHeight=waterfront?.build(elevation,settings.water,clock);
  const cabin=survey.cabin?window.addLabradorCabin(THREE,scene,{elevation,height:elevation,surveyGround:!!campSurface,waterLevel:settings.water,lakeLevel:settings.water},survey.cabin):null;
  const resort=dixville?window.addDixvilleLandmarks(THREE,scene,survey.sites,elevation):null;
  const inLake=makeAtlasWorld.indexLakeOutline(survey.shore,survey.shoreHoles);
  const birchCover=region==='lofoten'?window.aerieLandClassSampler(region):null;
  function wetGround(x,z,y,margin){
    if(dixville)return y<settings.water+margin&&inLake(x,z);
    if(!surry)return y<(settings.water??-1000)+margin;
    return (y<settings.water+margin&&inLake(x,z))||Number.isFinite(dam.riverHeight(x,z));
  }
  function plant(tree,isFir){
    if(acadia&&window.acadiaSandOpening(tree.x,tree.z))return;
    if(acadia&&window.thunderHoleBareLedge(tree.x,tree.z))return;
    // Heath and coastal grass are green in the imagery too. Only mapped tree
    // cover supports tall birch crowns; the habitat layer supplies low scrub.
    if(birchCover){
      if(birchCover(tree.x,tree.z)!==1)return;
      const grade=Math.hypot(elevation(tree.x+7,tree.z)-elevation(tree.x-7,tree.z),
        elevation(tree.x,tree.z+7)-elevation(tree.x,tree.z-7))/14;
      if(grade>1.13)return;
      const stature=1-.36*smoothstep(grade,.48,1.10)-.22*smoothstep(tree.y,185,325);
      tree.height*=stature;tree.width*=stature;
    }
    if(waterfalls?.inChute(tree.x,tree.z,tree.width))return;
    if(resort?.inClearing(tree.x,tree.z)||dam?.onDam(tree.x,tree.z)||cabin?.inClearing(tree.x,tree.z))return;
    if(Number.isFinite(roofHeight?.(tree.x,tree.z))||Number.isFinite(waterfrontHeight?.(tree.x,tree.z)))return;
    tree.conifer=isFir;
    trees.push(tree);(isFir?firTrees:broadTrees).push(tree);
    const id=cell(tree.x,tree.z);if(!cells.has(id))cells.set(id,[]);cells.get(id).push(tree);
  }
  if(localDEM){
    const crowns=unpack(localDEM.crowns);
    for(let i=0;i<crowns.length;i+=5){
      const x=localDEM.x+crowns[i]*.5,z=localDEM.z+crowns[i+1]*.5;
      plant({x,z,y:elevation(x,z),height:crowns[i+2]/8,width:crowns[i+3]/8,seed:(i*.618034)%1},!!crowns[i+4]);
    }
  }
  for(const a of fjordSurveys){
    const crowns=unpack(a.crowns);
    for(let i=0;i<crowns.length;i+=4){const x=a.x+crowns[i]*.5,z=a.z+crowns[i+1]*.5;
      plant({x,z,y:elevation(x,z),height:crowns[i+2]/8,width:crowns[i+3]/8,seed:(i*.618034)%1},false);}
  }
  for(const tree of ship?.trees||[])plant(tree,true);
  for(const tree of cabin?.campTrees||[])plant(tree,true);
  for(const tree of resort?.lawnTrees||[])plant(tree,true);
  const crownPoints=region==='yosemite'?window.yosemiteCanopy:dixville?window.dixvilleCanopy:survey.crownPoints;
  if(crownPoints){
    const records=bytes(crownPoints),view=new DataView(records.buffer);
    for(let off=0;off<records.length;off+=8){
      // Yosemite's crown survey covers the entire range, in the main grid coordinates.
      const x=(region==='yosemite'?0:focusX)+view.getInt16(off,true),z=(region==='yosemite'?0:focusZ)+view.getInt16(off+2,true);
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
  const crownBounds=survey.crownBounds??[focusX-1445,focusZ-1445,focusX+1445,focusZ+1445];
  for(let z=-h;z<h && (region!=='yosemite'||!crownPoints);z+=treeSpacing)for(let x=-h;x<h;x+=treeSpacing){
    const px=x+rand()*treeSpacing,pz=z+rand()*treeSpacing,y=elevation(px,pz);
    if(localDEM&&insideBrook(px,pz))continue;
    if(crownPoints&&px>crownBounds[0]&&pz>crownBounds[1]&&px<crownBounds[2]&&pz<crownBounds[3])continue;
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
    region==='crater'?window.addCraterWeather(THREE,scene,{sun,clock,sky,terrain,water}):
    surry?window.addKeeneWeather(THREE,scene,{sun,clock,sky,terrain}):null;
  window.shadeAtlasForest(THREE,terrain,trees,sun,h);
  const updateHardwoods=broadTrees.length?window.addHardwoods(THREE,scene,broadTrees,{region,sun,sunMask,half:h,fogColor:color,clock}):null;
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
    const ground=Math.max(elevation(x,z),dam?.riverHeight(x,z,true)??-Infinity,shoreFloor?.(x,z)??-Infinity,cabin?.padHeight(x,z)??-Infinity);
    return ground<settings.water+.16&&inLake(x,z)?settings.water+.16:ground;
  }
  const bankGrowth=region==='moosehead'?window.makeMooseheadBankGrowth(THREE,scene,{survey,
    ground:(x,z)=>Math.max(shoreFloor?.ground(x,z)??elevation(x,z),shoreFloor?.(x,z)??-Infinity),
    waterLevel:settings.water+.16,growth,roof:roofHeight,nearTrees:(x,z)=>cells.get(cell(x,z))||[],sun,sunMask,span:2*h,texture,clock}):null;
  function clearance(x,z,altitude){
    let y=Math.max(height(x,z),bankGrowth?.clearance(x,z)??-Infinity,resort?.clearance(x,z)??-Infinity,cabin?.clearance(x,z)??-Infinity,roofHeight?.(x,z,altitude)??-Infinity,dam?.structureHeight(x,z)??-Infinity,waterfrontHeight?.(x,z)??-Infinity);const ix=Math.floor(x/50),iz=Math.floor(z/50);
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
      const id=(ix+dx+500)*cellStride+iz+dz+500,group=cells.get(id);
      if(group)for(const t of group){const d=Math.hypot(x-t.x,z-t.z)/(t.width*.5);if(d<1)y=Math.max(y,t.y+t.height*(1-d*d*.68));}
    }
    return y;
  }
  const start=([x,z,tx,tz,agl,glance=0,lookDown=0])=>({x,z,y:clearance(x,z)+agl,yaw:Math.atan2(x-tx,z-tz),glance,lookDown});
  const spawn=start(settings.launch),low=start(settings.low);
  const launches={lake:spawn,ridge:low};
  if(region==='moosehead'){
    launches.reeds={x:-1108,y:316.1,z:-2298,yaw:-1.560,glance:-25,lookDown:9};
    // Fly west alongside a surveyed balsam fir with the shoulder camera clear of its trunk.
    launches.kineo={x:1115,y:397,z:-1045,yaw:1.57,glance:0,lookDown:0};
    launches.canopy={x:1855.753,y:334.262,z:4123.347,yaw:Math.PI/2,glance:0,lookDown:0};
  }
  for(const [key,tuple] of Object.entries(waterfront?.launches||settings.extraLaunches||{}))launches[key]=start(tuple);
  let landmarks=waterfront?[...survey.landmarks.filter(mark=>!waterfront.landmarks.some(local=>local.name===mark.name)),...waterfront.landmarks]:survey.landmarks;
  if(dixville)landmarks=[...landmarks,{name:'Mount Gloriette',x:-1150,z:1512,approach:[-540,930,-1150,1512,164,0,4]}];
  if(acadia){
    // Glide downhill beside the viewing steps. The chasm and its foam are
    // in front of the starboard shoulder, with clear Atlantic water beyond.
    landmarks=landmarks.map(p=>p.name==='Thunder Hole'?{...p,approach:[32,-57,71,-25,6,0,16]}:p);
  }
  if(region==='lofoten'){
    landmarks=landmarks.map(mark=>mark.name==='Hamnøy'?{...mark,approach:[3746,3196,3867,2894,32,0,7]}:mark);
    landmarks.push({name:'Olstinden',x:1570,z:1780,approach:[2570,2250,1570,1780,370,0,2]});
  }
  if(brook)landmarks=[...landmarks,{name:brook.name}];
  if(ship)landmarks=landmarks.map(mark=>mark.name===ship.mark.name?ship.mark:mark);
  if(waterfallViews.size)landmarks=landmarks.map(mark=>{
    const falls=waterfallViews.get(mark.name);return falls?{...mark,x:falls.x,z:falls.z,falls,discoveryRadius:285}:mark;
  });
  if(cabin){
    const {cabin:porch,rainbow}=settings.extraLaunches;
    landmarks=landmarks.map(mark=>mark.x===survey.cabin.x&&mark.z===survey.cabin.z?{...mark,approach:porch}:mark);
    landmarks.push({name:'Rainbow overlook',x:rainbow[0],z:rainbow[1],approach:rainbow});
  }
  function blockVegetationAt(x,z,y=elevation(x,z)){
    return !!((acadia&&window.thunderHoleBareLedge(x,z))||resort?.inClearing(x,z)||cabin?.inClearing(x,z)||wetGround(x,z,y,.45)||dam?.onDam(x,z)||
      Number.isFinite(roofHeight?.(x,z))||Number.isFinite(waterfrontHeight?.(x,z)));
  }
  function groundCover(x,z){
    const y=elevation(x,z);
    return y>settings.top+110||blockVegetationAt(x,z,y)?-1:growth(x,z);
  }
  const world={region,treeGrid:{cells,size:50,cell},waterfalls,height,elevation,clearance,spawn,launches,landmarks,groundCover,blockVegetationAt,coverHalf:h,cityTerrainMaterial:surry?terrain:null,
    bounds:{minX:-(settings.flightHalf||h)+90,maxX:(settings.flightHalf||h)-90+(region==='crater'?520:0),minZ:-(settings.flightHalf||h)+90,maxZ:(settings.flightHalf||h)-90},waterLevel:settings.water,lakeLevel:settings.water,
    skyTexture:skyMap,cloudDensityMap:!acadia&&twilight&&twilight.sky+'-cloud.webp',sunDirection:sun,sunMask,trees,firTrees,forestLightSpan:2*h,longForest:newEngland||region==='yosemite'||region==='labrador',useFirForest:firTrees.length>0,altitudeOffset:0,
    update(dt,t,player){clock.value=t;updateDistantTerrain(player);updateTable(player);shoreDetail?.update(player);bankGrowth?.update(player);updateUplandWoods?.(player);updateWeather?.(t,player,world.windField);rainTrace?.(t,player,world.windField);updateHardwoods?.(player);if(water)water.material.uniforms.time.value=t*.65;}};
  if(!survey.shore?.length&&shoreDetail)world.fieldBankAt=shoreDetail.closestBank;
  if(dam){world.riverSurfaceAt=dam.riverHeight;world.surryArmorPerch=dam.armorPerch;}
  world.geologyGround=shoreFloor?(x,z)=>Math.max(shoreFloor.ground(x,z),shoreFloor(x,z)):null;
  const updateUplandWoods=uplands?.woods(THREE,scene,world,clock,localDEM);
  if(bankGrowth)world.shoreThickets=bankGrowth;
  if(landmarkTerrain)world.landformMesh=landmarkTerrain.add(THREE,scene,terrain,(x,z)=>regionalElevation(x,z,false),texture);
  if(harborTerrain){
    const harbor=harborTerrain.add(THREE,scene,terrain,(x,z)=>regionalElevation(x,z,false),texture);
    harbor.traverse(mesh=>{if(mesh.isMesh)shoreDetail.terrainEdges(mesh.geometry,false);});
  }
  if(kineo){world.kineoTerrainMaterial=terrain;world.kineoBase=(x,z)=>regionalElevation(x,z,false);}
  if(region==='yosemite')world.talusFans=survey.talusFans;
  const rainTrace=window.makeRainTrace(THREE,scene,{world,terrain,water,cabin,survey,inLake,ground:(x,z)=>Math.max(shoreFloor?.ground(x,z)??elevation(x,z),shoreFloor?.(x,z)??-Infinity)});
  if(localDEM){
    // Reuse the lit regional rock and forest shader. Only the local photograph's
    // coordinates change, so even the busiest waterfront stays in its texture budget.
    const material=terrain.clone(),{x,z,half}=localDEM;
    material.uniforms={...terrain.uniforms,aerial:{value:texture('falls-'+region+'-ortho.webp')}};
    material.fragmentShader=terrain.fragmentShader.replace(/vec3 photo=mix\(texture2D\(aerial,photoUv\).*?;/,
      'vec3 photo=texture2D(aerial,(vec2(xz.x,-xz.y)-vec2('+x+'.0,'+(-z)+'.0))/'+(half*2)+'.0+.5).rgb;');
    window.shadeRegionalBrook(THREE,material,brookMeshes,brook);
    if(streamWoodland){
      // Kineo's core-only detail sampler has no coverage at Cold Stream.
      // Share its texture unit with the local stand image on these four tiles.
      material.uniforms.detailOrtho={value:streamWoodland};
      uplands.shadeColdStream(material,localDEM,true);
    }
    for(const mesh of brookMeshes){mesh.material=material;mesh.userData.prepareFlightMaterial=true;mesh.name=brook.name+' · surveyed stream bed';}
  }
  if(tableHeight)buildTable();
  return world;
};

// Keep the flight's original even–odd rule. Water birds, the eagle and the
// shoreline can ask about the same large lake hundreds of times per frame.
window.makeAtlasWorld.indexLakeOutline=function indexLakeOutline(shore,holes){
  const bandSize=96;
  function indexRing(points){
    if(!points?.length)return null;
    const bands=new Map();
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for(let i=0,j=points.length-1;i<points.length;j=i++){
      const a=points[i],b=points[j];
      minX=Math.min(minX,a[0]);maxX=Math.max(maxX,a[0]);
      minZ=Math.min(minZ,a[1]);maxZ=Math.max(maxZ,a[1]);
      if(a[1]===b[1])continue;
      const first=Math.floor(Math.min(a[1],b[1])/bandSize);
      const last=Math.floor(Math.max(a[1],b[1])/bandSize);
      const edge=[a[0],a[1],b[1],b[0]-a[0],b[1]-a[1]];
      for(let k=first;k<=last;k++){
        let row=bands.get(k);
        if(!row)bands.set(k,row=[]);
        row.push(edge);
      }
    }
    return {bands,minX,maxX,minZ,maxZ};
  }
  function contains(ring,x,z,key){
    if(!ring)return true;
    if(x<ring.minX||x>ring.maxX||z<ring.minZ||z>ring.maxZ)return false;
    const row=ring.bands.get(key);
    if(!row)return false;
    let odd=false;
    for(const edge of row){
      // Preserve the old comparison and division order, including vertices
      // shared by two segments, horizontal shores and island outline points.
      if((edge[1]>z)!==(edge[2]>z)&&x<edge[3]*(z-edge[1])/edge[4]+edge[0])odd=!odd;
    }
    return odd;
  }
  const outer=indexRing(shore),islands=new Map();
  for(const points of holes||[]){
    const island=indexRing(points);
    if(!island)return ()=>false;
    for(let k=Math.floor(island.minZ/bandSize);k<=Math.floor(island.maxZ/bandSize);k++){
      let row=islands.get(k);
      if(!row)islands.set(k,row=[]);
      row.push(island);
    }
  }
  return (x,z)=>{
    const key=Math.floor(z/bandSize);
    if(!contains(outer,x,z,key))return false;
    const row=islands.get(key);
    if(row)for(const island of row)if(contains(island,x,z,key))return false;
    return true;
  };
};
