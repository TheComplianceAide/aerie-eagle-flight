(() => {
  // Horizontal coordinates are metres in each world's survey. The third flight-path
  // coordinate is the desired height above terrain, water, foliage or a structure.
  const routes = {
    swiss: {
      name: 'Oeschinen beach and meadow', sight: 'Western gravel beach',
      label: 'Cross the gravel strand to a spruce at the edge of the meadow.',
      path: [[-478,404,13],[-599,451,11],[-663,474,10]],
      perch: ['branch',-721,501,'Lakeshore spruce'],
    },
    alaska: {
      name: 'Nugget Falls shoreline', sight: 'Nugget Falls',
      label: 'Follow the lake past Nugget Falls to the trees behind its gravel beach.',
      path: [[364,531,21],[431,641,17],[455,766,14],[473,876,17]],
      perch: ['branch',482,932,'Nugget Beach spruce'],
    },
    canyon: {
      name: 'Colorado River sandstone shelves', sight: 'Sandstone shelves',
      label: 'Skim the riverbank shelves and settle beside the sandstone alcove.',
      path: [[-444,-65,11],[-454,-137,10],[-464,-195,9],[-490,-243,9]],
      perch: ['ledge',-521,-268,'Riverbank sandstone shelf'],
    },
    yosemite: {
      name: 'El Capitan Meadow crossing', sight: 'El Capitan Meadow',
      label: 'Cross the open meadow under El Capitan to its line of tall conifers.',
      path: [[-656,951,16],[-777,1013,13],[-879,1073,20]],
      perch: ['branch',-920,1132,'Meadow-edge conifer'],
    },
    napali: {
      name: 'Kalalau surf and sea cliffs', sight: 'Kalalau Beach',
      // The survey landmark is offshore. Use the visible strand for the fly-by.
      sightPoint: [-1540,89,'Kalalau strand'],
      label: 'Trace the surf below Kalalau, then bank toward the exposed basalt point.',
      path: [[-1330,-61,18],[-1530,44,14],[-1740,142,14],[-1907,145,17]],
      perch: ['ledge',-1955,186,'Kalalau basalt point'],
    },
    bryce: {
      name: 'Thor’s Hammer amphitheater', sight: 'Thor’s Hammer',
      label: 'Thread the amphitheater past Thor’s Hammer to a sandstone bench.',
      path: [[-950,-168,19],[-1007,-192,16],[-1055,-240,16],[-1081,-279,14]],
      perch: ['ledge',-1100,-298,'Amphitheater sandstone bench'],
    },
    crater: {
      name: 'Wizard Island cinder shore', sight: 'Wizard Island',
      sightPoint: [-1602,357,'Wizard Island cinder shore'],
      label: 'Glide across the caldera lake and meet the forest on Wizard Island’s shore.',
      path: [[-1272,94,18],[-1447,216,14],[-1568,290,12]],
      perch: ['branch',-1628,352,'Wizard Island shoreline conifer'],
    },
    lofoten: {
      name: 'Hamnøy skerry passage', sight: 'Hamnøy',
      sightPoint: [4022,3050,'Hamnøy’s eastern shore'],
      label: 'Round Hamnøy beside the open fjord and land on its rocky headland.',
      path: [[4207,3180,15],[4062,3051,12],[4060,2987,13],[4117,2912,12],[4104,2803,11]],
      perch: ['ledge',4070,2740,'Hamnøy fjord ledge'],
    },
    milford: {
      name: 'Stirling Falls face traverse', sight: 'Stirling Falls',
      // The procedural cascade follows the measured slope below the landmark.
      sightPoint: [-2020,-1714,'Stirling Falls curtain'],
      label: 'Traverse the waterfall face, then flare into the forest on its western flank.',
      path: [[-1805,-1575,29],[-1905,-1617,26],[-1993,-1649,24],[-2069,-1661,24],[-2162,-1680,30]],
      perch: ['branch',-2223,-1716,'Stirling Falls forest limb'],
    },
    moosehead: {
      name: 'Kineo Cove shoreward glide', sight: 'Kineo Cove',
      label: 'Enter the cove beside Mount Kineo and settle on the wooded shoreline.',
      path: [[667,194,14],[511,133,12],[396,84,10],[334,66,15]],
      perch: ['branch',279,52,'Kineo Cove shoreline limb'],
    },
    dixville: {
      name: 'Table Rock ledge approach', sight: 'Table Rock',
      label: 'Trace the ridge to the narrow ledge, with Route 26 and Lake Gloriette below.',
      path: [[242,468,27],[155,421,22],[99,393,18],[60,366,14]],
      perch: ['ledge',26,338,'Table Rock overlook'],
    },
    labrador: {
      name: 'Lac Berté cabin shore glide',
      label: 'Pass the cabin over the water and land on a rock overlooking the shore.',
      fromSurvey({cabin,lookout,landmarks}) {
        const frontX=Math.sin(cabin.yaw),frontZ=Math.cos(cabin.yaw);
        // Follow the bank toward the lookout, with the cabin in sight on the way past.
        const side=Math.sign((lookout.x-cabin.x)*frontZ-(lookout.z-cabin.z)*frontX)||1;
        const alongX=frontZ*side,alongZ=-frontX*side;
        const offshore=cabin.waterDistance+16;
        const pass=(along,out,above)=>[cabin.x+alongX*along+frontX*out,cabin.z+alongZ*along+frontZ*out,above];
        return {sight:landmarks[0].name,
          path:[pass(-130,offshore+44,17),pass(-52,offshore+11,13),pass(0,offshore,11),
            [lookout.x+frontX*27,lookout.z+frontZ*27,10.5]],
          perch:['ledge',lookout.x,lookout.z,'Lac Berté shoreline ledge']};
      },
    },
    winnipesaukee: {
      name: 'Alton Bay bandstand pass', sight: 'Alton Bay Water Bandstand',
      label: 'Pass the water bandstand and cross the bay to the wooded eastern bank.',
      path: [[4994,11780,13],[5061,11891,11],[5118,11968,10],[5193,11978,11]],
      perch: ['branch',5238,12012,'Alton Bay shore tree'],
    },
    surry: {
      name: 'Colonial marquee to Central Square', sight: 'Colonial Theatre',
      label: 'Pass the Colonial on your left and follow Main Street to a tree over Central Square.',
      path: [[1942,4667,8.8],[1932.3,4607,8.8],[1921,4518,10.2],[1912,4448,18]],
      perch: ['branch',1898.8,4390.7,'Central Square park tree'],
    },
  };

  window.PERCH_ROUTE_NAMES = Object.fromEntries(Object.entries(routes).map(([region, route]) => [region, route.name]));

  window.PERCH_ROUTE_DESCRIPTIONS = Object.fromEntries(Object.entries(routes).map(([region, route]) => [region, route.label]));

  window.makePerchRoute = function makePerchRoute(THREE, world, region) {
    const route = routes[region];
    if (!route) return null;
    const entry = route.fromSurvey ? {...route,...route.fromSurvey(window.ATLAS_SURVEYS[region])} : route;
    const landmark = world.landmarks.find(mark => mark.name === entry.sight);
    if (!landmark) return null;
    const [sx, sz, sightLabel] = entry.sightPoint || [landmark.x, landmark.z, landmark.name];
    const sight = {x: sx, z: sz, label: sightLabel};
    const [kind, targetX, targetZ, label] = entry.perch;
    const perch = {x: targetX, z: targetZ, kind, label};
    if (kind === 'branch') {
      let nearest = 65 * 65;
      for (const tree of world.trees || []) {
        const distance = (tree.x - targetX)**2 + (tree.z - targetZ)**2;
        if (distance < nearest && tree.height >= 5 && tree.width > 1) {
          nearest = distance;
          perch.tree = tree;
        }
      }
      if (perch.tree) { perch.x = perch.tree.x; perch.z = perch.tree.z; }
    }

    const floor = world.clearance || world.height;
    const points = entry.path.map(([x,z,above]) => ({x, z, y: floor(x,z) + above}));
    // Sweep the wing span through each segment. Raising both endpoints by the
    // largest deficit preserves the designed grade and clears any intervening crowns.
    for (let i = 1; i < points.length; i++) {
      const a = points[i-1], b = points[i];
      const dx = b.x-a.x, dz = b.z-a.z, length = Math.hypot(dx,dz);
      const steps = Math.ceil(length/3);
      let raise = 0;
      for (let j = 0; j <= steps; j++) {
        const t = j/steps, x = a.x+dx*t, z = a.z+dz*t;
        const y = a.y+(b.y-a.y)*t;
        for (const side of [-1.2,0,1.2]) {
          raise = Math.max(raise, floor(x-side*dz/length,z+side*dx/length)+5-y);
        }
      }
      a.y += raise;
      b.y += raise;
    }
    const first = points[0], next = points[1], last = points[points.length-1];
    const yaw = Math.atan2(first.x-next.x,first.z-next.z);
    const sightYaw = Math.atan2(first.x-sight.x,first.z-sight.z);
    const offset = Math.atan2(Math.sin(sightYaw-yaw),Math.cos(sightYaw-yaw));
    const glance = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(offset),-52,52);
    const dx = last.x-perch.x, dz = last.z-perch.z, length = Math.hypot(dx,dz);
    perch.direction = {x:dx/length,z:dz/length};
    return {name:entry.name, sight, perch, approach:{...first,yaw,glance},
      via:points.slice(1), lookSide:offset >= 0 ? 'left' : 'right', routeLabel:entry.label};
  };
})();
