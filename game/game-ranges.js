// The first animal is the subject of the region's ground-wildlife departure.
// Survey anchors are in each world's metre coordinates. A terrain search seats
// the group on an open, dry patch and checks the actual flight corridor.
(() => {
  const regions = {
    yellowstone: {title:'Bison on the Firehole floodplain', anchor:[-2390,-3240], course:23, rise:0, animals:['american-bison','elk']},
    alaska: {title:'Black bear on the lakeshore', anchor:[-484.9415,-438.0641], course:180, rise:0, animals:['black-bear']},
    canyon: {title:'Desert bighorns on the bench', anchor:[-651,-65], course:189, rise:0, animals:['desert-bighorn','desert-cottontail']},
    swiss: {title:'Alpine ibex on the slopes', anchor:[-936.3861,17.5827], course:207, rise:0, animals:['alpine-ibex']},
    crater: {title:'Black-tailed deer on the rim', anchor:[-4540,1245], course:198, rise:0, animals:['black-tailed-deer']},
    // The grazing group stands inside the mapped open meadow, south of the 22.5 m tree crown.
    yosemite: {title:'Mule deer in El Capitan Meadow', anchor:[-833.4657,995.8304], course:156, rise:0, animals:['mule-deer']},
    lofoten: {title:'Otter on the tide line', anchor:[970.5377,2100.0616], course:216, rise:-2.25, animals:['eurasian-otter']},
    acadia: {title:'White-tailed deer above Newport Cove', anchor:[514,-1070], course:87, rise:0, animals:['white-tailed-deer','snowshoe-hare']},
    moosehead: {title:'Moose at the lake edge', anchor:[-1082.9789,-2276.9122], course:207, rise:0, animals:['moose','snowshoe-hare','white-tailed-deer']},
    dixville: {title:'Moose in the notch', anchor:[-320.72905,-242.78546], course:207, rise:0, animals:['moose','snowshoe-hare','white-tailed-deer']},
    labrador: {title:'Moose in the spruce narrows', anchor:[384.798,1849.3513], course:234, rise:0, animals:['moose','snowshoe-hare']},
    surry: {title:'White-tailed deer by the reservoir', anchor:[-1519.3332,-3297.69], course:189, rise:0, animals:['white-tailed-deer','snowshoe-hare']},
    winnipesaukee: {title:'White-tailed deer above the Broads', anchor:[1057.6031,1909.6066], course:108, rise:2.2, animals:['white-tailed-deer','snowshoe-hare']}
  };
  // Model dimensions are metres at the shoulder (back for small mammals).
  const species = {
    'american-bison':{name:'American bison',family:'bison',height:1.74,coat:'#6d5540',belly:'#49372c',face:'#392c25'},
    'elk':{name:'Rocky Mountain elk',family:'deer',height:1.43,coat:'#9a7453',belly:'#c7a77d',face:'#5a4331'},
    'moose': {name:'Moose', family:'moose', height:1.91, coat:'#594436', belly:'#827463', face:'#55463a'},
    'white-tailed-deer': {name:'White-tailed deer', family:'deer', height:.95, coat:'#a27a53', belly:'#d1bda0', face:'#84705b'},
    'mule-deer': {name:'Mule deer', family:'deer', height:1.02, coat:'#a0947c', belly:'#d0c5ac', face:'#736c60'},
    'black-tailed-deer': {name:'Black-tailed deer', family:'deer', height:.94, coat:'#9c8568', belly:'#c9b899', face:'#756e62'},
    'red-deer': {name:'Red deer', family:'deer', height:1.28, coat:'#9c6242', belly:'#b8a082', face:'#5e493a'},
    'desert-bighorn': {name:'Desert bighorn sheep', family:'sheep', height:.97, coat:'#ac9475', belly:'#d6c7ae', face:'#907d64'},
    'alpine-ibex': {name:'Alpine ibex', family:'ibex', height:.91, coat:'#8a7865', belly:'#baac97', face:'#726556'},
    'black-bear': {name:'American black bear', family:'bear', height:.91, coat:'#3b342d', belly:'#464036', face:'#8c755c'},
    'north-american-river-otter':{name:'North American river otter',family:'otter',height:.27,coat:'#594637',belly:'#887568',face:'#88715d',habitat:'fresh-bank'},
    'american-beaver':{name:'American beaver',family:'beaver',height:.38,coat:'#594035',belly:'#7f6554',face:'#6a4d3c',habitat:'fresh-bank'},
    'muskrat':{name:'Muskrat',family:'muskrat',height:.17,coat:'#795643',belly:'#ad8b72',face:'#6d5045',habitat:'fresh-bank'},
    'red-fox':{name:'Red fox',family:'canid',height:.38,coat:'#9d4825',belly:'#e6c9a7',face:'#bb6740',habitat:'edge'},
    'coyote':{name:'Coyote',family:'canid',height:.57,coat:'#8d7c63',belly:'#c6b595',face:'#a08c72',habitat:'edge'},
    'raccoon':{name:'Raccoon',family:'raccoon',height:.28,coat:'#7f796d',belly:'#aaa091',face:'#b5ae9e',habitat:'edge'},
    'mountain-goat':{name:'Mountain goat',family:'goat',height:.96,coat:'#dedbd3',belly:'#bdb5a5',face:'#dfd9c5',habitat:'alpine'},
    'chamois':{name:'Chamois',family:'chamois',height:.76,coat:'#9c683c',belly:'#aa8c65',face:'#e0d1b6',habitat:'alpine'},
    'mountain-hare':{name:'Mountain hare',family:'hare',height:.28,coat:'#8e8374',belly:'#ccc3ad',face:'#9b8d7f',habitat:'upland'},
    'woodland-caribou':{name:'Woodland caribou',family:'deer',height:1.15,coat:'#786657',belly:'#c8bba5',face:'#948878',habitat:'boreal',rarity:.17},
    'yellow-bellied-marmot':{name:'Yellow-bellied marmot',family:'rodent',height:.29,coat:'#7e654e',belly:'#b35027',face:'#8b7a6c',habitat:'rocky-meadow'},
    'rock-squirrel':{name:'Rock squirrel',family:'rodent',height:.16,coat:'#77756b',belly:'#baaa91',face:'#8c7e6a',habitat:'ledge'},
    'california-ground-squirrel':{name:'California ground squirrel',family:'rodent',height:.15,coat:'#827970',belly:'#b5aa95',face:'#9c9487',habitat:'meadow'},
    'eurasian-otter': {name:'Eurasian otter', family:'otter', height:.29, coat:'#655343', belly:'#a29780', face:'#736352'},
    'snowshoe-hare': {name:'Snowshoe hare', family:'hare', height:.275, coat:'#9f8b70', belly:'#d5c7ad', face:'#867967'},
    'desert-cottontail': {name:'Desert cottontail', family:'hare', height:.24, coat:'#bcab8d', belly:'#e4d6c0', face:'#a3947d'}
  };
  // Additional naturally streamed groups. Keep the first animal and the
  // established encounter launch in each world unchanged.
  const additions={
    yellowstone:['black-bear','coyote','yellow-bellied-marmot'],
    alaska:['mountain-goat','american-beaver'],
    canyon:['american-beaver','rock-squirrel'],
    swiss:['chamois'],
    crater:[],
    yosemite:['black-bear','coyote','california-ground-squirrel'],
    lofoten:['mountain-hare'],
    acadia:['red-fox','raccoon'],
    moosehead:['black-bear','american-beaver'],
    dixville:['black-bear'],
    labrador:['black-bear','american-beaver','woodland-caribou'],
    surry:['black-bear','american-beaver','north-american-river-otter'],
    winnipesaukee:['black-bear','american-beaver','north-american-river-otter','muskrat']
  };
  for(const [id,animals] of Object.entries(additions))regions[id].additions=animals;
  function register(id,profile){
    if(!profile?.title || profile.anchor?.length!==2 || !profile.anchor.every(Number.isFinite) || !profile.animals?.length ||
       !profile.animals.every(id=>species[id]))throw new Error('Invalid land wildlife profile: '+id);
    regions[id]=profile;
  }
  window.aerieLandWildlife={regions,species,register};
})();
