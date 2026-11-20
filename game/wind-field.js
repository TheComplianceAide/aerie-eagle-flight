// Metres in the world's XZ plane; all cues use the flight simulation clock.
(() => {
  const tau = 2 * Math.PI;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  function smooth(low, high, value) {
    const t = clamp((value-low)/(high-low), 0, 1);
    return t*t*(3-2*t);
  }

  // One local gust in a moving cell. Each patch tapers to zero before the
  // cell edge, allowing the next one to have a different size and position.
  // Small integer hashes behave identically in JavaScript and highp GLSL.
  const mod = (v,n) => v-n*Math.floor(v/n);
  function gustAt(along, across, phase) {
    const a = along+14*Math.sin(.013*across+phase)+.12*across;
    const b = across+22*Math.sin(.009*along+.7*phase);
    const i = Math.floor(a/238+.5), j = Math.floor(b/398+.5);
    const cell = mod(53*mod(i,251)+97*mod(j,251)+Math.floor(phase*32),251);
    const h1 = mod(cell*cell+37*cell+11,251);
    const h2 = mod(h1*h1+41*cell+7,251);
    const h3 = mod(h2*h2+31*h1+3,251);
    const middle = i===0 && j===0;
    const dx = a-238*i-(middle ? 0 : (h1/250-.5)*72);
    const dz = b-398*j-(middle ? 0 : (h2/250-.5)*90);
    const width = 45+26*h2/250, length = 94+55*h3/250;
    const nx = dx/width, nz = dz/length;
    const edge = 1-nx*nx-nz*nz;
    const texture = .93+.07*Math.sin(.053*dz+.019*dx+phase);
    return smooth(0,.84,edge)*texture*(middle ? 1 : .71+.29*h1/250);
  }
  window.aerieGustGLSL = `
    float aerieGust(vec2 worldXZ, float seconds, vec2 direction, float phase, float advection) {
      float along = dot(worldXZ,direction)-seconds*advection;
      float across = dot(worldXZ,vec2(-direction.y,direction.x));
      float a = along+14.0*sin(.013*across+phase)+.12*across;
      float b = across+22.0*sin(.009*along+.7*phase);
      float i = floor(a/238.0+.5), j = floor(b/398.0+.5);
      float cell = mod(53.0*mod(i,251.0)+97.0*mod(j,251.0)+floor(phase*32.0),251.0);
      float h1 = mod(cell*cell+37.0*cell+11.0,251.0);
      float h2 = mod(h1*h1+41.0*cell+7.0,251.0);
      float h3 = mod(h2*h2+31.0*h1+3.0,251.0);
      bool middle = i==0.0 && j==0.0;
      float dx = a-238.0*i-(middle ? 0.0 : (h1/250.0-.5)*72.0);
      float dz = b-398.0*j-(middle ? 0.0 : (h2/250.0-.5)*90.0);
      float width = 45.0+26.0*h2/250.0, len = 94.0+55.0*h3/250.0;
      float nx = dx/width, nz = dz/len;
      float edge = 1.0-nx*nx-nz*nz;
      float grain = .93+.07*sin(.053*dz+.019*dx+phase);
      return smoothstep(0.0,.84,edge)*grain*(middle ? 1.0 : .71+.29*h1/250.0);
    }`;

  // Sample the flight field on a moving 8 m grid. R/G interpolate the front
  // through a short time interval; B/A carry its recent history for heavy
  // limbs. Every mesh sharing this scene samples the same passing front.
  window.getCanopyWind=function(T,scene){
    if(scene.userData.canopyWind)return scene.userData.canopyWind;
    const side=65,step=8,period=.42,pixels=new Uint8Array(side*side*4);
    const texture=new T.DataTexture(pixels,side,side,T.RGBAFormat);
    texture.minFilter=texture.magFilter=T.LinearFilter;texture.needsUpdate=true;
    const uniforms={canopyFlow:{value:texture},canopyCenter:{value:new T.Vector2()},
      canopyDownwind:{value:new T.Vector2(1,0)},canopyLakeshore:{value:0},canopyFraction:{value:0}};
    const glsl=`
      uniform sampler2D canopyFlow;
      uniform vec2 canopyCenter,canopyDownwind;
      uniform float canopyFraction,canopyLakeshore;
      vec2 plantFront(vec2 root){
        vec2 uv=(root-canopyCenter)/520.+.5;
        vec4 front=texture2D(canopyFlow,uv);
        float boundary=1.-smoothstep(.42,.49,max(abs(uv.x-.5),abs(uv.y-.5)));
        return mix(vec2(.10),mix(front.rb,front.ga,canopyFraction),boundary);
      }
      vec2 plantMotion(vec2 root,vec2 front,float t,float softness){
        float along=dot(root,canopyDownwind),crosswind=dot(root,vec2(-canopyDownwind.y,canopyDownwind.x));
        float phase=.035*along+.021*crosswind;
        float sway=mix(front.y,front.x,softness);
        float pulse=.59*sin(t*(.77+.19*softness)-.14*along+.82*sin(.076*crosswind))+
                    .41*sin(t*1.83-.19*along+.15*cos(crosswind*.11));
        float fore=.026+.019*sin(t*.82-phase)+sway*(.18+.085*pulse)+.085*(front.x-front.y);
        float side=.012*sin(t*1.21+phase)+sway*.036*sin(t*(1.2+softness)+.19*crosswind);
        if(canopyLakeshore>.5){
          float leading=clamp(front.x-front.y,-.23,.23);
          fore+=.17*smoothstep(.16,.82,sway)+.24*leading;
          side+=leading*.14*sin(phase*9.+t*1.8);
        }
        return canopyDownwind*fore+vec2(-canopyDownwind.y,canopyDownwind.x)*side;
      }`;
    // Terrain exposure changes on a coarser scale than the front. Sample the
    // upwind skyline once per move, then interpolate at the gust texels.
    const exposureSize=17,exposures=new Float32Array(exposureSize**2);
    const localExposure=new Float32Array(side*side);
    function refreshShelter(field,x,z){
      for(let j=0;j<exposureSize;j++)for(let i=0;i<exposureSize;i++){
        exposures[j*exposureSize+i]=field.canopyExposure(x+(i-8)*32,z+(j-8)*32);
      }
      for(let j=0;j<side;j++)for(let i=0;i<side;i++){
        const a=Math.min(15,Math.floor(i/4)),b=Math.min(15,Math.floor(j/4));
        const dx=i/4-a,dz=j/4-b,k=b*exposureSize+a;
        const near=exposures[k]*(1-dx)+exposures[k+1]*dx;
        const far=exposures[k+exposureSize]*(1-dx)+exposures[k+exposureSize+1]*dx;
        localExposure[j*side+i]=near*(1-dz)+far*dz;
      }
    }
    let previous=NaN,centerX=NaN,centerZ=NaN;
    const update=(field,eye,t)=>{
      if(!field||!Number.isFinite(t))return;
      const x=Math.round(eye.x/32)*32,z=Math.round(eye.z/32)*32,tick=Math.floor(t/period),start=tick*period;
      uniforms.canopyFraction.value=clamp((t-start)/period,0,1);
      if(previous===tick&&x===centerX&&z===centerZ)return;
      if(x!==centerX||z!==centerZ)refreshShelter(field,x,z);
      previous=tick;centerX=x;centerZ=z;uniforms.canopyCenter.value.set(x,z);
      uniforms.canopyDownwind.value.set(field.direction.x,field.direction.z);
      for(let j=0,k=0;j<side;j++)for(let i=0;i<side;i++,k+=4){
        const wx=x+(i-32)*step,wz=z+(j-32)*step,gain=255*localExposure[j*side+i];
        pixels[k]=Math.round(gain*field.gust(wx,wz,start));
        pixels[k+1]=Math.round(gain*field.gust(wx,wz,start+period));
        pixels[k+2]=Math.round(gain*field.gust(wx,wz,start-.88));
        pixels[k+3]=Math.round(gain*field.gust(wx,wz,start+period-.88));
      }
      texture.needsUpdate=true;
    };
    return scene.userData.canopyWind={uniforms,glsl,update};
  };
  window.makeWindField = function(terrain, region) {
    let seed = 0;
    for (const c of (region || 'swiss')) seed = (Math.imul(seed,31)+c.charCodeAt(0))>>>0;
    const phase = (seed%997)/997*tau;
    const angle = -.48+.65*Math.sin(phase);
    const direction = {x:Math.cos(angle), z:Math.sin(angle)};
    const advection = 4.7 + 1.0*Math.cos(phase);
    const start = terrain.spawn;
    const origin = start ? {x:start.x-205*Math.sin(start.yaw||0),z:start.z-205*Math.cos(start.yaw||0)} : {x:0,z:0};
    const centers = [];
    const bounds = terrain.bounds;
    const sun = terrain.sunDirection;
    const ground = terrain.windTerrainHeight || terrain.height;
    const columnPoint = {};
    const landmarkCenters = new Set();
    let launchCenter = null, landmarksReady = false;

    // Start columns on dry ground and prefer illuminated slopes. Find a nearby
    // bank when a landmark or departure happens to sit over open water.
    function sourceNear(x,z,spawn) {
      let best = null;
      let bestScore = -Infinity;
      for (const radius of [0,48,115,220,420,730,1250]) {
        const count = radius===0 ? 1 : 12;
        for (let i=0;i<count;i++) {
          const a = phase + i*tau/count;
          const px = x+Math.cos(a)*radius, pz = z+Math.sin(a)*radius;
          if (bounds && (px<bounds.minX+55 || px>bounds.maxX-55 ||
                         pz<bounds.minZ+55 || pz>bounds.maxZ-55)) continue;
          const y = ground(px,pz);
          if (!Number.isFinite(y)) continue;
          const bed = terrain.elevation ? terrain.elevation(px,pz) : y;
          const underWater = terrain.wildlife?.waterAt
            ? Number.isFinite(terrain.wildlife.waterAt(px,pz))
            : terrain.habitat?.wet ? terrain.habitat.wet(px,pz,bed)
            : Number.isFinite(terrain.waterLevel) && y<=terrain.waterLevel+.38;
          if (underWater) continue;
          const slopeX = (ground(px+18,pz)-ground(px-18,pz))/36;
          const slopeZ = (ground(px,pz+18)-ground(px,pz-18))/36;
          const exposure = sun ? (sun.y-sun.x*slopeX-sun.z*slopeZ)/Math.hypot(1,slopeX,slopeZ) : .45;
          let score = 100*exposure-radius*.48;
          if (spawn) {
            // The column leans downwind at the eagle's height. Prefer a
            // core ahead of the bird even where the lake drops away below it.
            const yaw=spawn.yaw||0, lean=.16*Math.max(55,spawn.y+10-y);
            const dx=px+direction.x*lean-spawn.x, dz=pz+direction.z*lean-spawn.z;
            const forward=-dx*Math.sin(yaw)-dz*Math.cos(yaw);
            const side=dx*Math.cos(yaw)-dz*Math.sin(yaw);
            score-=Math.max(0,100-forward)*4+Math.abs(side)*.52+Math.max(0,y-spawn.y+15)*.9;
          }
          if (score>bestScore) {
            bestScore=score;
            best={x:px,y,z:pz};
          }
        }
        if (best && radius >= (spawn && bestScore < -95 ? 420 : 115)) break;
      }
      return best;
    }

    function append(center,minDistance) {
      if (!center) return null;
      const near=centers.find(p=>Math.hypot(p.x-center.x,p.z-center.z)<minDistance);
      if (near) return near;
      centers.push(center);
      return center;
    }

    function ensureLaunchCore(spawn) {
      // Water masks for canyon rivers and the mapped reservoir become
      // available with the rest of the selected world's scenery.
      if (!landmarksReady) {
        for (const place of terrain.landmarks || []) {
          const center = append(sourceNear(place.x,place.z,null),110);
          if (center) landmarkCenters.add(center);
        }
        landmarksReady = true;
      }
      if (launchCenter && !landmarkCenters.has(launchCenter)) {
        centers.splice(centers.indexOf(launchCenter),1);
      }
      // Use the middle of the departure view to make the first lift discoverable.
      const yaw = spawn.yaw || 0;
      const center = sourceNear(spawn.x-145*Math.sin(yaw),spawn.z-145*Math.cos(yaw),spawn);
      launchCenter = append(center,45);
      return launchCenter;
    }
    function core(center,y,t,out={}) {
      const height = Math.max(0,y-center.y);
      const lean = .16*height;
      // Displacement increases with height; the base stays fixed on the slope.
      const sway = Math.min(9,height*.035)*Math.sin(t*.045+center.x*.003+center.z*.007);
      out.x = center.x + direction.x*lean - direction.z*sway;
      out.y = y;
      out.z = center.z + direction.z*lean + direction.x*sway;
      out.radius = 75 + Math.min(80,height*.11);
      return out;
    }
    function gust(x,z,t) {
      x-=origin.x; z-=origin.z;
      const along=x*direction.x+z*direction.z-t*advection;
      const across=-x*direction.z+z*direction.x;
      return gustAt(along,across,phase);
    }
    function canopyExposure(x,z) {
      const y=ground(x,z),upwind=d=>ground(x-direction.x*d,z-direction.z*d);
      // Shelter starts at a 4-degree skyline and reaches its deepest lee
      // near 29 degrees. Open shore and level forest retain the full gust.
      const skyline=Math.max((upwind(32)-y)/32,(upwind(112)-y)/112);
      return 1-.64*smooth(.07,.55,skyline);
    }
    function sample(x,y,z,t,out={},groundPlane) {
      const localX=x-origin.x, localZ=z-origin.z;
      const along=localX*direction.x+localZ*direction.z-t*advection;
      const across=-localX*direction.z+localZ*direction.x;
      const strength = gustAt(along,across,phase);
      // A slope measured across 48 m is effectively common to an eagle's
      // 2 m span. Reuse this plane for the lifting hands; the air itself is
      // still evaluated independently at their exact positions and heights.
      const slopeX=groundPlane ? groundPlane.slopeX : (ground(x+24,z)-ground(x-24,z))/48;
      const slopeZ=groundPlane ? groundPlane.slopeZ : (ground(x,z+24)-ground(x,z-24))/48;
      const groundY=groundPlane ? groundPlane.groundY+(x-groundPlane.x)*slopeX+(z-groundPlane.z)*slopeZ : ground(x,z);
      out.x=x;out.z=z;out.groundY=groundY;out.slopeX=slopeX;out.slopeZ=slopeZ;
      const agl = Math.max(0,y-groundY);
      const boundaryLayer = .3+.7*Math.exp(-agl/280);
      const windSpeed = 2.65+3.45*strength*boundaryLayer;
      out.windX = direction.x*windSpeed;
      out.windZ = direction.z*windSpeed;
      out.gust = strength;
      // Brief upwash at the advancing front, followed by a settling wake.
      out.gustLift = .85*(gustAt(along-12,across,phase)-gustAt(along+12,across,phase))*boundaryLayer;
      out.ridge = clamp((slopeX*out.windX+slopeZ*out.windZ)*1.45,-1.1,3.5)*Math.exp(-agl/175);
      out.thermal = 0;
      const aboveSurface = smooth(4,48,agl);
      if (aboveSurface>0) for (const center of centers) {
        const height = y-center.y;
        if (height<=5 || height>=1550) continue;
        core(center,y,t,columnPoint);
        const dx=x-columnPoint.x, dz=z-columnPoint.z;
        const r2 = (dx*dx+dz*dz)/(columnPoint.radius*columnPoint.radius);
        if (r2>12) continue;
        const strength = 3.3*Math.exp(-r2)*smooth(5,65,height)*(1-smooth(700,1550,height))*aboveSurface;
        out.thermal = Math.max(out.thermal,strength);
      }
      // Outer-scale gusts carry smaller, oblique eddies. Each wing crosses
      // the same spatial air pattern at its own position. Sheltered, smooth
      // air has no source of mixing; there is no time-driven wing jitter.
      const mixing=clamp(1.25*strength*boundaryLayer+.32*Math.abs(out.ridge)+.16*out.thermal,0,1.4);
      const twist=1.6*Math.sin(.046*along+.027*across+.018*y+phase);
      const large=Math.sin(.113*along+.170*across+.064*y+twist);
      const medium=Math.sin(.289*along-.413*across-.131*y+.85*twist+phase);
      const fine=Math.sin(.561*along+.830*across+.213*y-.48*twist-phase);
      out.eddyLift=mixing*(1.05*large+.74*medium+.38*fine);
      // The same eddies carry lateral momentum across the mean wind.
      // The visible gust front still advects along the regional direction.
      const side=mixing*(-.53*large+.61*medium-.24*fine);
      out.eddyX=-direction.z*side;
      out.eddyZ=direction.x*side;
      return out;
    }
    return {centers, get launchCenter(){return launchCenter;}, ensureLaunchCore, core, gust,
            direction, origin, phase, advection, canopyExposure, sample};
  };
})();
