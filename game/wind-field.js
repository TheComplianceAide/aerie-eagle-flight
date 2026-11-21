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
    const side=65,rows=82,step=8,period=.42,pixels=new Uint8Array(side*rows*4);
    const texture=new T.DataTexture(pixels,side,rows,T.RGBAFormat);
    texture.minFilter=texture.magFilter=T.LinearFilter;texture.needsUpdate=true;
    const uniforms={canopyFlow:{value:texture},canopyCenter:{value:new T.Vector2()},
      canopyDownwind:{value:new T.Vector2(1,0)},canopyLakeshore:{value:0},canopyFraction:{value:0}};
    const flowGLSL=`
      uniform sampler2D canopyFlow;
      uniform vec2 canopyCenter,canopyDownwind;
      uniform float canopyFraction,canopyLakeshore;
      float weatherWindow(vec2 root){
        vec2 outer=floor(canopyCenter/64.+.5)*64.;
        vec2 d=abs(root-outer);
        return 1.-smoothstep(409.,498.,max(d.x,d.y));
      }
      float nearFrontWindow(vec2 root){
        vec2 d=abs(root-canopyCenter);
        return 1.-smoothstep(204.,251.,max(d.x,d.y));
      }
      vec4 widerFront(vec2 root){
        // Broad gusts cover a kilometre of shore. World-fixed sparse texels
        // extend across and down the wind, fading into the finer branch field.
        vec2 outer=floor(canopyCenter/64.+.5)*64.;
        vec2 q=clamp((root-outer)/vec2(32.,64.)+vec2(16.5,8.5),vec2(.5),vec2(32.5,16.5));
        return texture2D(canopyFlow,(q+vec2(18.,65.))/vec2(65.,82.));
      }
      vec2 localFront(vec2 root){
        float near=nearFrontWindow(root);
        vec2 result=vec2(0.);
        if(near>0.){
          vec2 texel=clamp((root-canopyCenter)/8.+32.5,vec2(.5),vec2(64.5));
          vec4 f=texture2D(canopyFlow,texel/vec2(65.,82.));
          result=mix(f.rb,f.ga,canopyFraction);
        }
        if(near<1.){
          vec4 o=widerFront(root);
          result=mix(vec2(mix(o.r,o.g,canopyFraction),o.b),result,near);
        }
        return result;
      }
      float localExposure(vec2 root){
        float near=nearFrontWindow(root),result=1.;
        if(near>0.){
          vec2 texel=clamp((root-canopyCenter)/32.+8.5,vec2(.5),vec2(16.5));
          result=texture2D(canopyFlow,(texel+vec2(0.,65.))/vec2(65.,82.)).r;
        }
        if(near<1.)result=mix(widerFront(root).a,result,near);
        return mix(1.,result,weatherWindow(root));
      }`;
    const glsl=`${flowGLSL}
      vec2 plantFront(vec2 root){
        return mix(vec2(.10),localFront(root),weatherWindow(root));
      }
      vec2 plantMotion(vec2 root,vec2 front,float t,float softness){
        float along=dot(root,canopyDownwind),crosswind=dot(root,vec2(-canopyDownwind.y,canopyDownwind.x));
        float phase=.035*along+.021*crosswind;
        float sway=mix(front.y,front.x,softness);
        float pulse=.59*sin(t*(.77+.19*softness)-.14*along+.82*sin(.076*crosswind))+
                    .41*sin(t*1.83-.19*along+.15*cos(crosswind*.11));
        float fore=.026+.019*sin(t*.82-phase)+sway*(.18+.085*pulse)+.085*(front.x-front.y);
        // The rising edge turns softer growth first; the leafy outer crown
        // follows the pressure stored in the wake channel.
        float rising=front.x-front.y;
        fore+=sway*(.034+.044*softness)+rising*(.11+.16*softness);
        float side=.012*sin(t*1.21+phase)+sway*.036*sin(t*(1.2+softness)+.19*crosswind);
        if(canopyLakeshore>.5){
          float leading=clamp(front.x-front.y,-.23,.23);
          fore+=.17*smoothstep(.16,.82,sway)+.24*leading;
          side+=leading*.14*sin(phase*9.+t*1.8);
        }
        // Woody carriers share the 0.16-height conservative visibility bound.
        // Grass and reed tips can bend farther under the same passing front.
        fore=min(fore,mix(.65,.86,smoothstep(.20,.80,softness)));
        return canopyDownwind*fore+vec2(-canopyDownwind.y,canopyDownwind.x)*side;
      }`;
    // Terrain exposure changes on a coarser scale than the front. Sample the
    // upwind skyline once per move, then interpolate at the gust texels.
    const exposureSize=17,exposures=new Float32Array(exposureSize**2);
    const localExposure=new Float32Array(side*side);
    function refreshShelter(field,x,z){
      for(let j=0;j<exposureSize;j++)for(let i=0;i<exposureSize;i++){
        const e=field.canopyExposure(x+(i-8)*32,z+(j-8)*32);
        exposures[j*exposureSize+i]=e;
        pixels[4*((side+j)*side+i)]=Math.round(e*255);
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
      // On the next interval the old end samples are the new start samples.
      // Reuse their exact quantized values while the terrain grid is stationary.
      const continuous=previous===tick-1&&x===centerX&&z===centerZ;
      if(x!==centerX||z!==centerZ)refreshShelter(field,x,z);
      previous=tick;centerX=x;centerZ=z;uniforms.canopyCenter.value.set(x,z);
      uniforms.canopyDownwind.value.set(field.direction.x,field.direction.z);
      for(let j=0,k=0;j<side;j++)for(let i=0;i<side;i++,k+=4){
        const wx=x+(i-32)*step,wz=z+(j-32)*step,gain=255*localExposure[j*side+i]*field.frontGain;
        pixels[k]=continuous?pixels[k+1]:Math.min(255,Math.round(gain*field.gust(wx,wz,start)));
        pixels[k+1]=Math.min(255,Math.round(gain*field.gust(wx,wz,start+period)));
        pixels[k+2]=continuous?pixels[k+3]:Math.min(255,Math.round(gain*field.gust(wx,wz,start-.88)));
        pixels[k+3]=Math.min(255,Math.round(gain*field.gust(wx,wz,start+period-.88)));
      }
      const outerX=Math.round(x/64)*64,outerZ=Math.round(z/64)*64;
      for(let j=0;j<17;j++)for(let i=0;i<33;i++){
        const wx=outerX+(i-16)*32,wz=outerZ+(j-8)*64;
        const e=field.canopyExposure(wx,wz),gain=e*field.frontGain*255,k=4*((65+j)*side+18+i);
        pixels[k]=continuous?pixels[k+1]:Math.min(255,Math.round(gain*field.gust(wx,wz,start)));
        pixels[k+1]=Math.min(255,Math.round(gain*field.gust(wx,wz,start+period)));
        pixels[k+2]=Math.min(255,Math.round(gain*field.gust(wx,wz,start-.67)));
        pixels[k+3]=Math.round(e*255);
      }
      texture.needsUpdate=true;
    };
    return scene.userData.canopyWind={uniforms,glsl,flowGLSL,update};
  };
  window.makeWindField = function(terrain, region) {
    let seed = 0;
    for (const c of (region || 'swiss')) seed = (Math.imul(seed,31)+c.charCodeAt(0))>>>0;
    const phase = (seed%997)/997*tau;
    const angle = -.48+.65*Math.sin(phase);
    const direction = {x:Math.cos(angle), z:Math.sin(angle)};
    // Relative loading of the authored weather. Saltwater fjords and the
    // approaching caldera squall carry more surface stress than Keene's fog.
    const frontGain=({alaska:1.10,swiss:.99,canyon:.88,dixville:.94,labrador:1.03,
      acadia:1.03,moosehead:1,winnipesaukee:.90,surry:.69,yosemite:.84,crater:1.16,milford:1.08,lofoten:1.20})[region]??1;
    const advection = (4.7 + 1.0*Math.cos(phase))*frontGain;
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
    const exposureNodes=new Map(),standShelter=new Map(),treeGrid=terrain.treeGrid;
    function coverNear(x,z) {
      if(!treeGrid?.cells||!treeGrid.cell)return 0;
      const key=treeGrid.cell(x,z),cached=standShelter.get(key);
      if(cached!==undefined)return cached;
      const trees=treeGrid.cells.get(key);
      if(!trees?.length)return 0;
      let area=0;
      const step=Math.max(1,Math.floor(trees.length/32));
      for(let i=0;i<trees.length;i+=step){
        const t=trees[i],span=Math.min(16,t.width||.27*(t.height||0));
        area+=span*span;
      }
      const cover=1-Math.exp(-2.6*step*area/(treeGrid.size*treeGrid.size));
      if(standShelter.size>4096)standShelter.clear();
      standShelter.set(key,cover);return cover;
    }
    function exposureNode(ix,iz){
      const key=ix*131071+iz,cached=exposureNodes.get(key);
      if(cached!==undefined)return cached;
      const x=ix*32,z=iz*32,y=ground(x,z),dx=direction.x,dz=direction.z;
      const skyline=Math.max((ground(x-dx*32,z-dz*32)-y)/32,(ground(x-dx*112,z-dz*112)-y)/112,
        .82*(ground(x-dx*244,z-dz*244)-y)/244);
      const woods=.64*coverNear(x-dx*24,z-dz*24)+.36*coverNear(x-dx*64,z-dz*64);
      const shelter=(1-.76*smooth(.05,.49,skyline))*(1-.32*woods);
      if(exposureNodes.size>4096)exposureNodes.clear();
      exposureNodes.set(key,shelter);return shelter;
    }
    function canopyExposure(x,z){
      const u=x/32,v=z/32,i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j,e=exposureNode(i,j);
      if(!a&&!b)return e;
      return (1-b)*(e+(exposureNode(i+1,j)-e)*a)+b*((1-a)*exposureNode(i,j+1)+a*exposureNode(i+1,j+1));
    }
    function localAir(strength,agl,surface,out){
      // Ground friction and the lee diminish with height. Mountain-scale
      // thermals and the smaller eddies on each wing keep their own geometry.
      out.surfaceExposure=surface;
      out.exposure=1-(1-surface)*Math.exp(-agl/78);
      const layer=.3+.7*Math.exp(-agl/280);
      out.gust=Math.min(1,strength*frontGain*out.exposure);
      const speed=2.65*(.49+.51*out.exposure)*(.82+.18*frontGain)+3.45*out.gust*layer;
      out.windX=direction.x*speed;out.windZ=direction.z*speed;
      return layer;
    }
    const showerMark=region==='labrador'&&terrain.landmarks?.find(p=>/rainbow|shower|arc-en-ciel/i.test(p.name));
    const sunLength=sun?Math.hypot(sun.x,sun.z)||1:1,axisX=sun?-sun.x/sunLength:0,axisZ=sun?-sun.z/sunLength:0;
    function narrowsRainAt(x,z,t){
      if(!showerMark)return 0;
      const shift=240*Math.sin(t*advection/240);
      const dx=x-showerMark.x-direction.x*shift,dz=z-showerMark.z-direction.z*shift;
      return (1-smooth(140,470,Math.abs(dx*axisX+dz*axisZ)))*(1-smooth(650,1600,Math.abs(-dx*axisZ+dz*axisX)));
    }
    function weatherAt(x,y,z,t,out={}){
      const agl=Math.max(0,y-ground(x,z));
      localAir(gust(x,z,t),agl,canopyExposure(x,z),out);
      out.rain=0;out.wetness=0;
      out.drying=.34+.66*out.exposure;
      terrain.rainCellAt?.(x,y,z,t,out);
      // Additional precipitation belongs to its actual regional weather.
      if(region==='crater'&&window.aerieCalderaRain){
        const rain=window.aerieCalderaRain(x,y,z,t);
        out.rain=rain;
        // Integrate the moving squall's history spatially, so revisiting a
        // location preserves moisture even when the storm has passed.
        const dry=out.drying,old=window.aerieCalderaRain(x,y,z,t-30),earlier=window.aerieCalderaRain(x,y,z,t-90);
        out.wetness=Math.max(rain,.76*old*Math.exp(-30*dry/105),.56*earlier*Math.exp(-90*dry/105));
      }else if(showerMark){
        const rain=narrowsRainAt(x,z,t);
        out.rain=Math.max(out.rain,rain);
        out.wetness=Math.max(out.wetness,rain,.66*narrowsRainAt(x,z,t-36)*Math.exp(-36*out.drying/95));
      }
      out.rain=clamp(out.rain,0,1);out.wetness=clamp(out.wetness,0,1);return out;
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
      const surface=(groundPlane&&Number.isFinite(groundPlane.surfaceExposure))?groundPlane.surfaceExposure:canopyExposure(x,z);
      const boundaryLayer=localAir(strength,agl,surface,out);
      // Brief upwash at the advancing front, followed by a settling wake.
      out.gustLift = .85*(gustAt(along-12,across,phase)-gustAt(along+12,across,phase))*boundaryLayer*out.exposure*frontGain;
      out.ridge = clamp((slopeX*out.windX+slopeZ*out.windZ)*1.45,-1.1,3.5)*Math.exp(-agl/175);
      out.thermal = 0;
      const aboveSurface = smooth(4,48,agl);
      if (region!=='acadia' && aboveSurface>0) for (const center of centers) {
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
      const mixing=clamp(1.25*out.gust*boundaryLayer+.32*Math.abs(out.ridge)+.16*out.thermal,0,1.4);
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
            direction, origin, phase, advection, frontGain, canopyExposure, weatherAt, narrowsRainAt, sample};
  };
})();
