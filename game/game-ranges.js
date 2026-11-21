// The first animal is the subject of the region's ground-wildlife departure.
// Survey anchors are in each world's metre coordinates. A terrain search seats
// the group on an open, dry patch and checks the actual flight corridor.
(() => {
  const regions = {
    alaska: {title:'Black bear on the lakeshore', anchor:[-484.9415,-438.0641], course:180, rise:0, animals:['black-bear']},
    canyon: {title:'Desert bighorns on the bench', anchor:[-651,-65], course:189, rise:0, animals:['desert-bighorn','desert-cottontail']},
    swiss: {title:'Alpine ibex on the slopes', anchor:[-936.3861,17.5827], course:207, rise:0, animals:['alpine-ibex']},
    crater: {title:'Black-tailed deer on the rim', anchor:[-4540,1245], course:198, rise:0, animals:['black-tailed-deer']},
    yosemite: {title:'Mule deer in El Capitan Meadow', anchor:[-823.4657,981.8304], course:180, rise:0, animals:['mule-deer']},
    lofoten: {title:'Otter on the tide line', anchor:[970.5377,2100.0616], course:216, rise:-2.25, animals:['eurasian-otter']},
    acadia: {title:'White-tailed deer above Newport Cove', anchor:[140,-1035], animals:['white-tailed-deer','snowshoe-hare']},
    moosehead: {title:'Moose at the lake edge', anchor:[-1082.9789,-2276.9122], course:207, rise:0, animals:['moose','snowshoe-hare','white-tailed-deer']},
    dixville: {title:'Moose in the notch', anchor:[-320.72905,-242.78546], course:207, rise:0, animals:['moose','snowshoe-hare','white-tailed-deer']},
    labrador: {title:'Moose in the spruce narrows', anchor:[384.798,1849.3513], course:234, rise:0, animals:['moose','snowshoe-hare']},
    surry: {title:'White-tailed deer by the reservoir', anchor:[-1519.3332,-3297.69], course:189, rise:0, animals:['white-tailed-deer','snowshoe-hare']},
    winnipesaukee: {title:'White-tailed deer above the Broads', anchor:[1057.6031,1909.6066], course:160, rise:0, animals:['white-tailed-deer','snowshoe-hare']}
  };
  // Model dimensions are metres at the shoulder (back for small mammals).
  const species = {
    'moose': {name:'Moose', family:'moose', height:1.91, coat:'#594436', belly:'#827463', face:'#55463a'},
    'white-tailed-deer': {name:'White-tailed deer', family:'deer', height:.95, coat:'#a27a53', belly:'#d1bda0', face:'#84705b'},
    'mule-deer': {name:'Mule deer', family:'deer', height:1.02, coat:'#a0947c', belly:'#d0c5ac', face:'#736c60'},
    'black-tailed-deer': {name:'Black-tailed deer', family:'deer', height:.94, coat:'#9c8568', belly:'#c9b899', face:'#756e62'},
    'red-deer': {name:'Red deer', family:'deer', height:1.28, coat:'#9c6242', belly:'#b8a082', face:'#5e493a'},
    'desert-bighorn': {name:'Desert bighorn sheep', family:'sheep', height:.97, coat:'#ac9475', belly:'#d6c7ae', face:'#907d64'},
    'alpine-ibex': {name:'Alpine ibex', family:'ibex', height:.91, coat:'#8a7865', belly:'#baac97', face:'#726556'},
    'black-bear': {name:'American black bear', family:'bear', height:.91, coat:'#3b342d', belly:'#464036', face:'#8c755c'},
    'eurasian-otter': {name:'Eurasian otter', family:'otter', height:.29, coat:'#655343', belly:'#a29780', face:'#736352'},
    'snowshoe-hare': {name:'Snowshoe hare', family:'hare', height:.275, coat:'#9f8b70', belly:'#d5c7ad', face:'#867967'},
    'desert-cottontail': {name:'Desert cottontail', family:'hare', height:.24, coat:'#bcab8d', belly:'#e4d6c0', face:'#a3947d'}
  };
  function register(id,profile){
    if(!profile?.title || profile.anchor?.length!==2 || !profile.anchor.every(Number.isFinite) || !profile.animals?.length ||
       !profile.animals.every(id=>species[id]))throw new Error('Invalid land wildlife profile: '+id);
    regions[id]=profile;
  }
  window.aerieLandWildlife={regions,species,register};
})();
