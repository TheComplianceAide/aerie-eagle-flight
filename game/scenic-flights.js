// Bearings are travel directions (north = 0°). A second landmark gives broad
// water and summit locations something recognizable on their far horizon.
(() => {
  const views={
    yellowstone:{
      'Old Faithful':['bank',323,'Geyser Hill'],'Geyser Hill':['bank',319,'Castle Geyser'],
      'Castle Geyser':['bank',344,'Grand Geyser'],'Grand Geyser':['bank',328,'Giant Geyser'],
      'Giant Geyser':['bank',335,'Morning Glory Pool'],'Morning Glory Pool':['bank',314,'Biscuit Basin'],
      'Black Sand Basin':['bank',344],'Biscuit Basin':['bank',25],
      'Grand Prismatic Spring':['vista',340,'Excelsior Geyser Crater'],
      'Excelsior Geyser Crater':['vista',321,'Grand Prismatic Spring'],
      'Fairy Falls':['falls',251],'Fountain Paint Pot':['bank',340],'Lone Star Geyser':['bank',333]
    },
    alaska:{
      'West alpine crest':['ridge',140,'Mendenhall Glacier'],'Upper crevasse field':['ice',198],
      'Blue Ice Passage':['ice',8],'Nugget Falls beach':['bank',7,'Nugget Falls'],
      'Medial moraine':['ice',184],'Mendenhall Glacier':['ice',13],'Nugget Falls':['falls',80],
      'Mendenhall Lake':['vista',32,'Mendenhall Glacier'],'West Glacier Ridge':['ridge',120,'Mendenhall Lake']
    },
    canyon:{
      'Horseshoe Bend':['vista',240],'Horseshoe Bend Overlook':['ridge',275,'Horseshoe Bend'],
      'Colorado River':['bank',160],'Glen Canyon Rim':['ridge',44,'Horseshoe Bend'],
      'Sandstone shelves':['bank',350],'Riverbank alcove':['face',115]
    },
    swiss:{
      'Western gravel beach':['bank',75,'Fründen Falls'],'Lakeshore meadow':['bank',74,'Oeschinensee'],
      'Oeschinensee':['vista',124,'Fründen Falls'],'Fründen Falls':['falls',130],
      'Eastwall Cascade':['falls',88],'Fründenschnuer':['ridge',270,'Oeschinensee'],'Blüemlisalp Ridge':['ridge',260,'Oeschinensee']
    },
    yosemite:{
      'El Capitan':['ridge',165,'El Capitan Meadow'],'Bridalveil Fall':['falls',185],'Yosemite Falls':['falls',25],
      'Cathedral Rocks':['ridge',5,'El Capitan'],'El Capitan Meadow':['bank',342,'El Capitan']
    },
    crater:{
      'Wizard Island':['ridge',150,'Phantom Ship'],'Watchman Peak':['ridge',95,'Wizard Island'],
      'Phantom Ship':['face',112],'Cleetwood Cove':['vista',190,'Wizard Island']
    },
    moosehead:{
      'Rockwood':['bank',15,'Mount Kineo'],'Lily Bay':['bank',295],'Mount Kineo':['ridge',193,'Kineo Cove'],
      'Little Kineo Mountain':['ridge',212,'Mount Kineo'],
      'Spencer Bay':['vista',257,'Mount Kineo'],'Kineo Cove':['vista',2,'Mount Kineo']
    },
    winnipesaukee:{
      'Mount Major':['ridge',3,'Rattlesnake Island'],
      'Sleepers Island':['bank',12,'Rattlesnake Island'],'Rattlesnake Island':['ridge',217,'Mount Major'],
      'Diamond Island':['bank',242,'Mount Major'],'Wolfeboro Bay':['vista',245,'The Broads'],
      'Meredith Bay':['bank',145,'The Broads'],'The Broads':['vista',130,'Rattlesnake Island']
    },
    surry:{'Ashuelot River':['bank',170],'Ashuelot River Park':['bank',121]},
    lofoten:{
      'Reinefjorden':['vista',303,'Helfjorden'],'Hamnøy':['bank',320,'Reinefjorden'],
      'Helfjorden':['vista',144,'Reinefjorden'],'Kjerkfjorden':['face',314],'Reine':['bank',327,'Reinefjorden']
    },
    acadia:{'Otter Cliff':['face',172,'Otter Point'],'Thunder Hole':['bank',220],'Sand Beach':['bank',140,'Great Head'],'Great Head':['ridge',189,'Otter Cliff'],'The Beehive':['ridge',126,'Sand Beach'],'Gorham Mountain':['ridge',166,'Otter Cliff'],'Cadillac Mountain':['ridge',127,'Great Head']},
    milford:{
      'Mitre Peak':['ridge',46,'Stirling Falls'],'Bowen Falls':['falls',90],'Stirling Falls':['falls',282],
      'Sinbad Gully':['ridge',7,'Mitre Peak'],'Harrison Cove':['vista',261,'Mitre Peak']
    },
    labrador:{
      'South narrows':['bank',146,'South Camp cabin'],'Island channel':['bank',190,'South narrows'],
      'Spruce lookout':['ridge',314,'Rain shower over the lake'],'Rain shower over the lake':['vista',181,'South narrows']
    }
  };
  const styles={
    // Standoff, height over terrain, clearance on first glide, approach label.
    ridge:[100,28,12,'Ridge drop'],vista:[118,52,14,'Overlook'],ice:[112,19,8,'Icefield traverse'],
    face:[110,22,10,'Cliff approach'],falls:[104,19,9,'Waterfall approach'],bank:[95,13,6,'Shoreline pass']
  };
  const rad=Math.PI/180,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  // Spawn coordinates, local clearance, feature along the flight line, and optional camera tilt limit.
  const grandViews={
    yellowstone:[-2250,-6200,680,-1148,-7222,30],
    alaska:[400,-3450,900,-400,600],               // Mendenhall Glacier to the lake
    canyon:[660,-360,750,-650,-80,18],            // Horseshoe Bend toward the sunset
    swiss:[-1780,-850,800,30,260],                // Oeschinensee and Blüemlisalp
    winnipesaukee:[-3280,-2550,1000,1196,1598],   // The Broads toward Rattlesnake Island
    surry:[-2150,-5120,900,-505,-113],            // Reservoir and Ashuelot River valley
    dixville:[-800,-1400,680,26,338],             // Lake Gloriette and Table Rock
    labrador:[520,-3500,850,-15,1785],            // Lac Berté north to South Camp
    moosehead:[-1400,2300,900,105,-861],          // Rockwood toward Mount Kineo
    yosemite:[-3800,1320,1050,-400,580],          // El Capitan Meadow and the valley floor
    crater:[-3000,2510,950,-950,-500],            // Across Wizard Island and the caldera
    lofoten:[3050,4140,1050,780,1709],            // Reinefjorden from seaward
    acadia:[420,-730,700,110,1510]                // Ocean Path to Otter Point
  };
  function grandView(w){
    const [x,z,above,targetX,targetZ,maxLookDown=31]=grandViews[w.region];
    const floor=w.flightClearance||w.clearance||w.height;
    const y=floor(x,z)+above;
    const sightHeight=Math.max(w.waterLevel??-Infinity,(w.elevation||w.height)(targetX,targetZ));
    const range=Math.hypot(targetX-x,targetZ-z);
    return {x,y,z,yaw:Math.atan2(x-targetX,z-targetZ),
      lookDown:clamp(Math.atan2(y-sightHeight,range)/rad,10,maxLookDown)};
  }
  function viewFor(w,p){return views[w.region]?.[p.name]||['bank',0];}
  function subject(w,p,spec){
    return spec[2]&&w.landmarks.find(mark=>mark.name===spec[2])||p;
  }
  function targetHeight(w,p){
    const y=(w.elevation||w.height)(p.x,p.z);
    return Math.max(w.height(p.x,p.z),y);
  }
  function brookPass(w,p){
    const f=p.falls,terrain=w.elevation||w.height,floor=w.flightClearance||w.clearance||w.height;
    const inside=(x,z)=>x>w.bounds.minX+2&&x<w.bounds.maxX-2&&z>w.bounds.minZ+2&&z<w.bounds.maxZ-2;
    let best,score=Infinity;
    // Look into the narrow brook at a passing angle. The large-cascade route
    // sits too far out to see a two-metre stream underneath the tree canopy.
    for(const radius of [20,31,44])for(let bearing=0;bearing<360;bearing+=20){
      const a=bearing*rad,x=f.x+Math.sin(a)*radius,z=f.z-Math.cos(a)*radius;
      if(!inside(x,z))continue;
      const look=Math.atan2(f.x-x,z-f.z);
      for(const turn of [25,-25,52,-52,70,-70]){
        const course=look+turn*rad,fx=Math.sin(course),fz=-Math.cos(course);
        if(!inside(x+fx*143,z+fz*143))continue;
        let y=Math.max(floor(x,z)+9,f.y+radius*.41);
        for(let dist=0;dist<=146;dist+=4){
          const drift=1.5+.096*dist;
          for(const across of [-drift,0,drift]){
            const px=x+fx*dist-fz*across,pz=z+fz*dist+fx*across;
            y=Math.max(y,floor(px,pz)+14+dist*.09);
          }
        }
        let blocked=0;
        for(let j=1;j<13;j++){
          const t=j/13,xx=x+t*(f.x-x),zz=z+t*(f.z-z);
          const top=Math.max(terrain(xx,zz),w.clearance(xx,zz)-2);
          blocked=Math.max(blocked,top-(y+(f.y-y)*t));
        }
        const down=Math.atan2(y-f.y,radius)/rad;
        const cost=3.5*blocked+Math.abs(down-30)*.66+Math.hypot(radius,y-f.y)*.19+Math.abs(turn)*.035;
        if(cost>=score)continue;
        score=cost;best={x,z,y,yaw:-course,glance:turn,lookDown:clamp(down-3,4,50)};
      }
    }
    return best;
  }
  function waterfallPass(w,p){
    const f=p.falls,floor=w.flightClearance||w.clearance||w.height;
    let best,bestScore=Infinity;
    // Start out in the valley and cross the falling stream obliquely. Looking
    // straight uphill from a crest hides the water behind the lip of the fall.
    for(const side of [-1,1])for(const spread of [80,115,155]){
      const away=Math.min(190,98+f.reach*.18),x=f.x+f.dx*away-f.dz*side*spread,z=f.z+f.dz*away+f.dx*side*spread;
      if(x<w.bounds.minX+2||x>w.bounds.maxX-2||z<w.bounds.minZ+2||z>w.bounds.maxZ-2)continue;
      const vx=-f.dx*.30+f.dz*side*.95,vz=-f.dz*.30-f.dx*side*.95;
      let y=Math.max(floor(x,z)+17,f.y+5);
      for(let d=0;d<=128;d+=4)y=Math.max(y,floor(x+vx*d,z+vz*d)+8);
      let occlusion=0;
      for(let j=1;j<24;j++){const a=j/24;occlusion=Math.max(occlusion,w.height(x+(f.x-x)*a,z+(f.z-z)*a)-(y+(f.y-y)*a));}
      const score=(y-f.y)+3*occlusion+spread*.07;
      if(score>=bestScore)continue;
      bestScore=score;
      const yaw=Math.atan2(-vx,-vz),look=Math.atan2(x-f.x,z-f.z);
      best={x,z,y,yaw,glance:clamp(Math.atan2(Math.sin(look-yaw),Math.cos(look-yaw))/rad,-65,65),
        lookDown:clamp(Math.atan2(y-f.y,Math.hypot(x-f.x,z-f.z))/rad,0,30)};
    }
    return best;
  }
  const lakeMargins={
    winnipesaukee:['Sleepers Island','Diamond Island','Wolfeboro Bay','Meredith Bay'],
    moosehead:['Lily Bay','Spencer Bay']
  };
  function islandPass(w,p){
    if(!lakeMargins[w.region]?.includes(p.name)||!w.shorelines?.length)return;
    let edge,nearest=Infinity;
    // Launch at the wooded mainland of these named bays. The point labels
    // sit in open water and their closest tiny shoal has no useful flight line.
    const margins=w.region==='moosehead'?w.shorelines.slice(0,1):w.shorelines;
    for(const ring of margins)for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length],dx=b.x-a.x,dz=b.z-a.z;
      const t=clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);
      const x=a.x+dx*t,z=a.z+dz*t,d=Math.hypot(p.x-x,p.z-z);
      if(d<nearest){nearest=d;edge={x,z};}
    }
    if(!edge)return;
    const floor=w.flightClearance||w.clearance||w.height;
    let best,score=-Infinity;
    for(let i=0;i<24;i++){
      const angle=i*Math.PI/12,fx=Math.sin(angle),fz=-Math.cos(angle);
      const x=edge.x-fx*200,z=edge.z-fz*200;
      if(x<w.bounds.minX||x>w.bounds.maxX||z<w.bounds.minZ||z>w.bounds.maxZ)continue;
      const overWater=w.habitat?.wet?.(x,z,w.elevation(x,z))??(w.elevation(x,z)<=w.waterLevel+.1);
      const facing=w.elevation(edge.x+fx*85,edge.z+fz*85)-w.waterLevel;
      const rank=(overWater?160:0)+clamp(facing,-55,65);
      if(rank<=score)continue;
      let y=Math.max(w.waterLevel+49,floor(x,z)+35);
      for(let d=0;d<=175;d+=8)y=Math.max(y,floor(x+fx*d,z+fz*d)+17);
      best={x,z,y,yaw:-angle,glance:0,lookDown:clamp(Math.atan2(y-w.waterLevel,235)/rad,6,24)};
      score=rank;
    }
    return best;
  }
  function approach(w,p){
    const floor=w.flightClearance||w.clearance||w.height,bounds=w.bounds;
    const inside=(x,z)=>x>=bounds.minX+2&&x<=bounds.maxX-2&&z>=bounds.minZ+2&&z<=bounds.maxZ-2;
    if(p.falls?.approach){
      const [x,z,tx,tz,above,glance,lookDown]=p.falls.approach;
      if(inside(x,z))return {x,z,y:floor(x,z)+above,yaw:Math.atan2(x-tx,z-tz),glance,lookDown};
    }
    if(p.falls){
      const pass=w.region==='dixville'||p.falls.brook?brookPass(w,p):waterfallPass(w,p);
      if(pass)return pass;
    }
    if(p.approach){
      const [x,z,tx,tz,above,glance=0,lookDown=0]=p.approach;
      if(inside(x,z))return {x,z,y:(w.clearance||w.height)(x,z)+above,yaw:Math.atan2(x-tx,z-tz),glance,lookDown};
    }
    const shoreView=islandPass(w,p);
    if(shoreView)return shoreView;
    const spec=viewFor(w,p),[stand,agl,gap]=styles[spec[0]],target=subject(w,p,spec);
    const range=Math.min(stand,(p.discoveryRadius??210)*.78);
    const height=targetHeight(w,target),centerY=targetHeight(w,p);
    const bearing=target===p?spec[1]*rad:Math.atan2(target.x-p.x,p.z-target.z);
    let best,bestScore=-Infinity;
    for(const delta of [0,25,-25,50,-50,80,-80,120,-120,158,-158,180]){
      const angle=bearing+delta*rad,dx=Math.sin(angle),dz=-Math.cos(angle);
      const x=p.x-dx*range,z=p.z-dz*range;
      if(!inside(x,z))continue;
      const ground=floor(x,z),targetRange=Math.hypot(target.x-x,target.z-z);
      // For a large open-water mark the camera follows the far mountain. For
      // compact scenery pass to one side so a cliff or cascade remains in view.
      const toward=Math.atan2(target.x-x,z-target.z);
      const course=target===p?angle+(spec[0]==='face'||spec[0]==='falls'?16*rad:0):toward;
      const fx=Math.sin(course),fz=-Math.cos(course);
      const corridor=Math.max(105,Math.min(range+18,150));
      let y=ground+agl,nearMax=ground;
      for(let d=0;d<=corridor;d+=5){
        for(const side of [-1.2,1.2]){
          const sx=x+fx*d-fz*side,sz=z+fz*d+fx*side;
          const top=floor(sx,sz);
          y=Math.max(y,top+gap+.015*d);nearMax=Math.max(nearMax,top);
        }
      }
      // The open line of sight matters more than matching a preferred compass
      // bearing. Sample separate from the flight path, including off-axis falls.
      let blocked=0;
      for(let i=1;i<25;i++){
        const u=i/25,sx=x+u*(target.x-x),sz=z+u*(target.z-z);
        blocked=Math.max(blocked,(w.elevation||w.height)(sx,sz)-(y+(height+4-y)*u));
      }
      const frame=Math.atan2(y-height,Math.max(1,targetRange))/rad;
      let relief=0;
      if(spec[0]==='ridge'||spec[0]==='vista'){
        const beyond=floor(x+fx*245,z+fz*245);
        relief=clamp((y-beyond)*.16,-22,55);
      }
      const score=relief-Math.abs(delta)*.14-(y-ground-agl)*1.1-blocked*3.5-Math.max(0,frame-34)*2
        -Math.max(0,nearMax-centerY-100)*.02;
      if(score<=bestScore)continue;
      bestScore=score;
      const yaw=-course;
      const glance=clamp(Math.atan2(Math.sin(course-toward),Math.cos(course-toward))/rad,-55,55);
      best={x,z,y,yaw,glance,lookDown:clamp(frame-5+(spec[0]==='ridge'?8:0),2,31)};
    }
    return best;
  }
  window.aerieScenicFlight={
    approach,grandView,
    description(w,p){
      if(p.approach)return '';
      const spec=viewFor(w,p);
      return styles[spec[0]][3]+(spec[2]?' toward '+spec[2]:'');
    }
  };
})();
