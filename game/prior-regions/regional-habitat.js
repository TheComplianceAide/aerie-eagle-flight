// Georeferenced plant communities. Crown locations already in a world retain
// their surveyed dimensions. Additional positions are seeded, repeatable habitat estimates.
(() => {
  'use strict';
  const profiles=new WeakMap();
  const clamp=x=>Math.max(0,Math.min(1,x));
  function ramp(lo,hi,x){const v=clamp((x-lo)/(hi-lo));return v*v*(3-2*v);}
  function hash(x,z,salt){
    let v=Math.imul(x^salt,0x45d9f3b)^Math.imul(z+salt,0x27d4eb2d);
    v=Math.imul(v^(v>>>16),0x21f0aaad);v=Math.imul(v^(v>>>15),0x735a2d97);
    return ((v^(v>>>15))>>>0)/4294967296;
  }
  function patchField(x,z,span,salt){
    const sx=x/span,sz=z/span,i=Math.floor(sx),j=Math.floor(sz),u=ramp(0,1,sx-i),v=ramp(0,1,sz-j);
    return (1-u)*((1-v)*hash(i,j,salt)+v*hash(i,j+1,salt))+u*((1-v)*hash(i+1,j,salt)+v*hash(i+1,j+1,salt));
  }
  // Full crown radius at 22, 42.5, 63, 83.5 and 100 percent of plant height.
  // Bark, independent boughs, foliage clumps and leaf scan use the renderer for the family.
  const forms={
    spire:['needle',[1,.94,.71,.38,.035]], hemlock:['needle',[.81,1,.82,.46,.07]],
    larch:['needle',[.67,.98,.81,.43,.055]], fir:['needle',[1.08,.90,.65,.35,.038]],
    pine:['needle',[.39,.76,1,.78,.17]], cedar:['needle',[.67,1,.85,.55,.09]],
    layered:['broad',[.38,.83,1,.82,.23]], vase:['broad',[.30,.64,.98,.88,.34]],
    oak:['broad',[.67,1.02,1,.84,.29]], birch:['broad',[.44,.87,1,.68,.21]],
    podocarp:['broad',[.31,.64,.93,1,.43]], brush:['shrub',[.91,1,.95,.65,.16]],
    heath:['shrub',[1,.98,.81,.49,.10]]
  };
  function plant(name,form,aspect,tint,stature=1){
    const [family,shape]=forms[form];return {name,family,shape,aspect,tint,stature};
  }
  const sitka=plant('Sitka spruce','spire',1.09,[.78,.99,.91]);
  const westernHemlock=plant('Western hemlock','hemlock',1.08,[.87,1.01,.77]);
  const cottonwood=plant('Black cottonwood','vase',1.04,[1.05,1.09,.74]);
  const alder=plant('Sitka alder','brush',1.15,[.88,1.02,.72],.64);
  const spruce=plant('Norway spruce','spire',.98,[.78,.94,.77]);
  const larch=plant('European larch','larch',1.09,[1.12,1.13,.72]);
  const stonePine=plant('Swiss stone pine','pine',1.05,[.87,.99,.85]);
  const blackbrush=plant('Blackbrush','brush',1.15,[1.21,1.00,.72]);
  const sage=plant('Sand sagebrush','heath',1.06,[1.02,1.13,.99]);
  const redSpruce=plant('Red spruce','spire',.87,[.91,1.00,.77]);
  const balsam=plant('Balsam fir','fir',.84,[.82,.96,.86]);
  const blackSpruce=plant('Black spruce','spire',.73,[.73,.93,.83]);
  const whitePine=plant('Eastern white pine','pine',1.12,[.89,1.01,.87]);
  const eHemlock=plant('Eastern hemlock','hemlock',1.06,[.84,.95,.70]);
  const eCedar=plant('Northern white cedar','cedar',.90,[.89,1.03,.68]);
  const maple=plant('Sugar maple','oak',1.03,[1.13,1.01,.72]);
  const redMaple=plant('Red maple','vase',.99,[1.10,1.02,.76]);
  const yellowBirch=plant('Yellow birch','birch',.94,[1.05,1.10,.73]);
  const paperBirch=plant('Paper birch','birch',.89,[.97,1.11,.77]);
  const beech=plant('American beech','layered',1.03,[1.03,1.05,.78]);
  const redOak=plant('Northern red oak','oak',1.08,[1.08,1.02,.70]);
  const pondo=plant('Ponderosa pine','pine',.99,[1.01,1.05,.77]);
  const incense=plant('Incense cedar','cedar',.85,[.87,1.00,.73]);
  const whiteFir=plant('White fir','fir',.93,[.88,1.04,.88]);
  const blackOak=plant('California black oak','oak',1.15,[1.08,1.03,.71]);
  const redFir=plant('Shasta red fir','fir',.93,[.81,.98,.84]);
  const mountainHemlock=plant('Mountain hemlock','hemlock',.89,[.85,.99,.83]);
  const whitebark=plant('Whitebark pine','pine',1.13,[.97,1.02,.83],.77);
  const mountainBirch=plant('Downy birch','birch',1.09,[1.02,1.08,.73],.86);
  const willow=plant('Low willow','brush',1.03,[.93,1.07,.79],.48);
  const heather=plant('Coastal heath','heath',.66,[1.11,.97,.75],.24);
  const silverBeech=plant('Silver beech','layered',1.06,[.86,.98,.72]);
  const kamahi=plant('Kāmahi','oak',.98,[.94,1.04,.71]);
  const rimu=plant('Rimu','podocarp',.97,[.92,1.01,.83],1.09);
  // Range-wide height in m ASL around which forest grades into open alpine
  // growth; its local expression also depends on the mapped cover and relief.
  const climates={
    alaska:[760,25,.71],swiss:[2160,18,.62],canyon:[4000,1,.14],
    moosehead:[1160,22,.84],winnipesaukee:[1270,23,.86],surry:[1270,23,.79],
    dixville:[1210,19,.82],labrador:[1020,15,.75],yosemite:[3100,28,.73],
    crater:[2410,19,.65],lofoten:[299,5,.31],milford:[990,22,.89]
  };
  // WorldCover's 11 published classes, plus zero for off-grid/no data.
  const LAND={tree:1,shrub:2,grass:3,crop:4,built:5,bare:6,ice:7,water:8,marsh:9,mangrove:10,moss:11};
  function openLand(region){
    const source=window.aerieLandClasses?.[region];
    if(!source)return ()=>0;
    const [half,n,encoded]=source,raw=atob(encoded),cells=new Uint8Array(n*n);
    let offset=0;
    for(let i=0;i<raw.length;){
      const tag=raw.charCodeAt(i++),kind=tag&15;let count=1+(tag>>4);
      if(count===16){let shift=0,more;do{more=raw.charCodeAt(i++);count+=(more&127)*(2**shift);shift+=7;}while(more&128);}
      cells.fill(kind,offset,offset+count);offset+=count;
    }
    const factor=n/(2*half);
    return (x,z)=>{
      const ix=Math.floor((x+half)*factor),iz=Math.floor((z+half)*factor);
      return ix>=0&&iz>=0&&ix<n&&iz<n?cells[ix+n*iz]:0;
    };
  }
  function newEngland(region,y,wet,needle,s){
    if(needle){
      if(region==='labrador')return wet||s<.65?blackSpruce:balsam;
      if(region==='dixville'||region==='moosehead'){
        if(wet&&s<.44)return eCedar;
        if(y>590||region==='dixville')return s<.61?redSpruce:balsam;
        return s<.42?redSpruce:s<.68?balsam:s<.85?eHemlock:whitePine;
      }
      return wet&&s<.23?eCedar:s<.50?whitePine:s<.91?eHemlock:redSpruce;
    }
    if(region==='labrador')return paperBirch;
    if(wet)return s<.61?redMaple:yellowBirch;
    if(region==='winnipesaukee'||region==='surry')return s<.30?redOak:s<.62?maple:s<.81?beech:yellowBirch;
    return s<.35?yellowBirch:s<.63?maple:s<.83?beech:paperBirch;
  }
  function localPlant(region,y,wet,needle,s,land){
    switch(region){
      case 'alaska':return needle?(s<.62?sitka:westernHemlock):s<.48?cottonwood:alder;
      case 'swiss':return (y>1880&&s>.62)?stonePine:s<.52?spruce:larch;
      case 'canyon':return s<.65?blackbrush:sage;
      case 'lofoten':return land===LAND.tree&&y<310?mountainBirch:s<.34?willow:heather;
      case 'milford':return y<430&&s<.19?rimu:s>.73&&y<590?kamahi:silverBeech;
      case 'yosemite':return needle?(y>2180||s>.84?whiteFir:s<.55?pondo:incense):wet&&s<.57?cottonwood:blackOak;
      case 'crater':return y>2200&&s<.72?whitebark:y>1910||s<.58?mountainHemlock:redFir;
      default:return newEngland(region,y,wet,needle,s);
    }
  }
  function needleFraction(region,y,w){
    switch(region){
      case 'lofoten':case 'milford':case 'canyon':return 0;
      case 'crater':case 'swiss':return 1;
      case 'alaska':return .50+.43*w;
      case 'labrador':return .77+.18*w;
      case 'yosemite':return .58+.32*ramp(1240,1820,y)+.1*w;
      case 'moosehead':case 'dixville':return .28+.36*w+.40*ramp(550,860,y);
      default:return .18+.41*w;
    }
  }
  window.aerieCanopyProfile=function aerieCanopyProfile(world){
    if(profiles.has(world))return profiles.get(world);
    const region=world.region,[limit,usualHeight,stock]=climates[region]||climates.moosehead;
    const classify=openLand(region),elevation=world.elevation||world.height,offset=world.altitudeOffset||0;
    const bounds=world.bounds,level=world.waterLevel;
    const water=(x,z,y)=>world.habitat?.wet?world.habitat.wet(x,z,y):Number.isFinite(level)&&y<level;
    function zone(x,z,knownCover){
      const land=classify(x,z),y=elevation(x,z),asl=y+offset;
      const slope=Math.hypot(elevation(x+7,z)-y,elevation(x,z+7)-y)/7;
      const shelter=patchField(x,z,270,73);
      const treeLimit=limit+(shelter-.5)*(region==='lofoten'?65:115)-Math.max(0,slope-.54)*65;
      const alpine=ramp(treeLimit-110,treeLimit+68,asl);
      const shore=Number.isFinite(level)?y-level:Infinity;
      const wet=land===LAND.marsh?1:shore>.05&&shore<8?(1-ramp(.6,8,shore))*(1-ramp(.05,.36,slope)):0;
      const policy=knownCover??world.groundCover?.(x,z)??0;
      const ice=land===LAND.ice?1:0;
      const developed=land===LAND.built||land===LAND.crop?1:0;
      const rock=Math.max(land===LAND.bare?1:0,ramp(.72,1.45,slope));
      const submerged=land===LAND.water||water(x,z,y);
      let cover=0;
      if(!submerged&&!ice&&!developed&&Number.isFinite(y)){
        const alpineMeadow=alpine>.42&&(land===LAND.grass||land===LAND.moss||land===LAND.shrub);
        if(policy>=0||(alpineMeadow&&!world.blockVegetationAt?.(x,z,y))){
          const grass=land===LAND.grass?.73:land===LAND.marsh?.82:land===LAND.moss?.53:land===LAND.shrub?.64:land===LAND.tree?.45:0;
          cover=clamp(Math.max(policy,grass)*((land===LAND.bare)?(region==='canyon'?.26:.12):1)*(1-.84*ramp(.74,1.50,slope)));
        }
      }
      const open=land===LAND.tree?clamp(.13+.48*alpine+.25*rock):1;
      return {land,cover,slope,shore,elevation:asl,treeLimit,alpine,wet,developed,ice,rock,open,submerged,shelter};
    }
    function species(tree,seed,isFir){
      if(tree.aerieSpecies)return tree.aerieSpecies;
      const x=tree.x,z=tree.z,y=tree.y+offset,land=classify(x,z);
      if(land===LAND.ice)return null;
      // An actual recorded shoreline tree or street crown may project into a
      // 10–38 m water/built pixel. The recorded position wins unless submerged.
      if(land===LAND.water&&water(x,z,tree.y))return null;
      if(y>limit+160&&land!==LAND.tree)return null;
      const source=tree.seed??seed??0;
      const s=source>=0&&source<=1?source:hash(Math.floor(x*4),Math.floor(z*4),source|0);
      const wet=land===LAND.marsh||Number.isFinite(level)&&tree.y>level&&tree.y<level+7;
      const needle=region==='alaska'&&land===LAND.shrub?false:
        typeof isFir==='boolean'?isFir:s<needleFraction(region,y,.54);
      return localPlant(region,y,wet,needle,s,land);
    }
    function fillCell(ix,iz,size,neighbors=[]){
      const patches=[],locations=new Map();
      const key=(i,j)=>i+','+j,bin=14;
      function insert(tree){
        const id=key(Math.floor(tree.x/bin),Math.floor(tree.z/bin));
        let group=locations.get(id);if(!group)locations.set(id,group=[]);
        group.push(tree);
      }
      for(const tree of neighbors)insert(tree);
      const step=region==='canyon'?10:region==='lofoten'?17:region==='swiss'||region==='crater'?12:10;
      // Sample a world-anchored grid so changing a tile size, view direction or
      // device quality never rearranges crowns on the hillside.
      const outX=(ix+1)*size,outZ=(iz+1)*size;
      const x0=Math.floor(ix*size/step),z0=Math.floor(iz*size/step);
      for(let j=z0;j*step<outZ;j++)for(let i=x0;i*step<outX;i++){
        const x=(i+.06+.88*hash(i,j,11))*step,z=(j+.06+.88*hash(i,j,19))*step;
        if(x<ix*size||x>=outX||z<iz*size||z>=outZ||
          bounds&&(x<bounds.minX||x>bounds.maxX||z<bounds.minZ||z>bounds.maxZ))continue;
        const land=classify(x,z);
        if(land!==LAND.tree&&land!==LAND.shrub&&!(region==='canyon'&&(land===LAND.grass||land===LAND.bare)))continue;
        const s=hash(i,j,23),stand=patchField(x,z,163,97);
        if(s>stock*(.36+.90*stand))continue;
        // Only generate shrubs within shrub/grass classifications. A tiny
        // residual presence on canyon bare land also needs positive photo evidence.
        const q=zone(x,z);
        if(q.cover<=.035||q.submerged||q.developed||q.ice||q.slope>(region==='milford'?1.68:1.18))continue;
        const scrub=region==='canyon'||land===LAND.shrub;
        if(!scrub&&q.alpine>.84||land===LAND.bare&&(q.cover<.09||s>.045))continue;
        if(world.waterfalls?.inChute?.(x,z,2.3))continue;
        const fit=hash(i,j,43),stature=hash(i,j,47);
        let type=localPlant(region,q.elevation,q.wet>.38,fit<needleFraction(region,q.elevation,stand),hash(i,j,31),land);
        if(scrub&&type.family!=='shrub'){
          // Recorded alpine/successional shrub cover supports brush rather than
          // a shortened full-size forest. Tree fern understory is modeled separately.
          type=region==='alaska'?alder:willow;
        }
        const shrub=type.family==='shrub';
        const dominant=stature>.31;
        const h=shrub?(.50+1.8*stature):usualHeight*(dominant?.72+.33*stature+.19*stand:.31+.92*stature)*(1-.63*q.alpine);
        const width=h*(shrub?1.15+.51*fit:type.family==='needle'?.34+.19*fit:.65+.24*fit);
        const radius=shrub?2.8:Math.max(3.1,width*.33),bi=Math.floor(x/bin),bj=Math.floor(z/bin);
        let near=false;
        for(let dz=-1;dz<=1&&!near;dz++)for(let dx=-1;dx<=1&&!near;dx++){
          for(const other of locations.get(key(bi+dx,bj+dz))||[]){
            const gap=radius+Math.min(9,(other.width||6)*(other.aerieSpecies?.family ? .24 : .36));
            if((x-other.x)**2+(z-other.z)**2<gap*gap){near=true;break;}
          }
        }
        if(near)continue;
        const tree={x,z,y:q.elevation-offset,height:h,width,seed:fit,conifer:type.family==='needle',aerieSpecies:type};
        patches.push(tree);insert(tree);
      }
      return patches;
    }
    const api={zone,species,fillCell,landAt:classify};profiles.set(world,api);return api;
  };
})();
