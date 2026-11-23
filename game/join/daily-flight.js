(() => {
  // Same immutable public asset origin as the game's hosted departure previews.
  const captures = 'https://raw.githubusercontent.com/TheComplianceAide/aerie-eagle-flight/928f1c057ed999d189c995b592e358b6aeb3f0a0/game/';
  const freeWorld = 'winnipesaukee';

  // IDs and titles are the game's launch menu choices. Most captures follow
  // <world>-<launch>-view.jpg. Explicit paths select the original menu image.
  const flights = {
    winnipesaukee: {
      region: 'Lake Winnipesaukee, New Hampshire',
      routes: [
        ['mount-major', 'Mount Major', '../join/media/mount-major.webp'],
        ['weirs', 'Weirs Beach'],
        ['game', 'White-tailed deer above the Broads', 'winnipesaukee-game-view.webp'],
        ['lake', 'Rattlesnake Island'],
        ['lookout', 'Alton Bay bandstand pass', 'perch-winnipesaukee-view.jpg'],
        ['grand', 'Grand View', 'grand-views/winnipesaukee.webp'],
        ['ridge', 'Island channel'],
        ['alton', 'Alton Bay']
      ]
    },
    alaska: {
      region: 'Mendenhall Glacier, Alaska',
      routes: [['shore', 'Nugget Falls beach'], ['ridge', 'West Glacier Ridge'], ['alpine', 'West alpine crest']]
    },
    canyon: {
      region: 'Horseshoe Bend, Arizona',
      routes: [['lake', 'Horseshoe overlook'], ['shore', 'Colorado sandbar'], ['ridge', 'River corridor']]
    },
    swiss: {
      region: 'Oeschinen Lake, Switzerland',
      routes: [['shore', 'Western gravel beach'], ['falls', 'Waterfall approach', 'falls-view.jpg'], ['lake', 'Lake overlook', 'valley.jpg']]
    },
    surry: {
      region: 'Surry Dam & Keene, New Hampshire',
      routes: [['lake', 'Surry Mountain Dam'], ['ridge', 'Keene Main Street'], ['valley', 'Ashuelot Valley overlook']]
    },
    dixville: {
      region: 'Dixville Notch, New Hampshire',
      routes: [['dawn', 'First light on Table Rock'], ['lake', 'Dawn over Lake Gloriette'], ['hotel', 'The Balsams flyby']]
    },
    labrador: {
      region: 'Lac Berté, Québec',
      routes: [['rainbow', 'Rainbow over the narrows'], ['cabin', 'Cabin flyby'], ['ridge', 'Spruce narrows', 'labrador-ridge-view.webp']]
    },
    moosehead: {
      region: 'Moosehead Lake, Maine',
      routes: [['kineo', 'Across the lake to Mount Kineo'], ['ridge', 'Rockwood crossing'], ['reeds', 'Wind across the reeds', 'moosehead-reeds-view.webp']]
    },
    yosemite: {
      region: 'Yosemite Valley, California',
      routes: [['lake', 'El Capitan overlook'], ['ridge', 'Valley floor'], ['grand', 'Grand View', 'grand-views/yosemite.webp']]
    },
    crater: {
      region: 'Crater Lake, Oregon',
      routes: [['ridge', 'Wizard Island', 'crater-storm-ridge.webp'], ['lake', 'Caldera overlook', 'crater-storm-lake.webp'], ['grand', 'Grand View', 'grand-views/crater.webp']]
    },
    lofoten: {
      region: 'Lofoten Islands, Norway',
      routes: [['lake', 'Fjord overlook', '../departure-light/lofoten-lake.webp'], ['ridge', 'Reinefjorden channel', '../departure-light/lofoten-ridge.webp'], ['grand', 'Grand View', 'grand-views/lofoten.webp']]
    },
    acadia: {
      region: 'Acadia National Park, Maine',
      routes: [['lake', 'Otter Cliff under the Milky Way', '../departure-light/acadia-lake.webp'], ['beach', 'Sand Beach and Great Head', '../departure-light/acadia-beach.webp'], ['ridge', 'Thunder Hole surf run', '../departure-light/acadia-ridge.webp']]
    },
    yellowstone: {
      region: 'Yellowstone Firehole River, Wyoming',
      routes: [['midway', 'Grand Prismatic Spring', '../yellowstone-launch/midway.webp'], ['biscuit', 'Biscuit Basin and Sapphire Pool', '../yellowstone-launch/biscuit.webp'], ['fairy', 'Fairy Falls', '../yellowstone-launch/fairy.webp']]
    }
  };

  const paidWorlds = Object.keys(flights).filter(world => world !== freeWorld);
  const wrap = (index, length) => ((index % length) + length) % length;

  window.aerieDailyFlight = function dailyFlight(access, date = new Date()) {
    // Use the player's calendar date, including on the two daylight-saving transitions.
    const day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
    let owned = access?.fullAccess === true ? paidWorlds : [];
    if (Array.isArray(access?.worlds)) owned = paidWorlds.filter(world => access.worlds.includes(world));
    const worlds = owned.length ? owned : [freeWorld];
    const world = worlds[wrap(day, worlds.length)];
    const { region, routes } = flights[world];
    const [launch, title, preview] = routes[wrap(Math.floor(day / worlds.length), routes.length)];
    const path = preview || world + '-' + launch + '-view.jpg';
    const image = path.startsWith('../') ? path : captures + path;
    return { world, launch, title, region, image, href: '../?play=1&fly=1#world=' + world + '&launch=' + launch };
  };
})();
