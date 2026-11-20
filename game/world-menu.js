(() => {
  const worlds = {
    alaska: { name: ['Mendenhall', 'Glacier'], region: 'Juneau, Alaska', description: 'Follow the western crest above the icefield, then descend over spruce forest to Mendenhall Lake.', launches: { lake: 'Glacier terminus', ridge: 'West Glacier Ridge', shore: 'Nugget Falls beach', alpine: 'West alpine crest' } },
    canyon: { name: ['Horseshoe', 'Bend'], region: 'Arizona, USA', description: 'Bank around the sandstone bend and follow the Colorado River below the rim.', launches: { lake: 'Horseshoe overlook', ridge: 'River corridor', shore: 'Colorado sandbar' } },
    swiss: { name: ['Oeschinen', 'Lake'], region: 'Bernese Alps, Switzerland', description: 'Follow the waterfalls from the high cliffs to the spruce-lined lakeshore.', launches: { lake: 'Lake overlook', falls: 'Waterfall approach', forest: 'Forest edge', shore: 'Western gravel beach' } }
  };
  Object.assign(worlds,{
    winnipesaukee: {name:['Lake','Winnipesaukee'],region:'New Hampshire, USA',description:'Follow the wooded islands across the Broads, skim the boardwalk at Weirs Beach, or turn over the bandstand at Alton Bay.',launches:{lake:'Rattlesnake Island',ridge:'Island channel',weirs:'Weirs Beach',alton:'Alton Bay'}},
    surry: {name:['Surry Dam','& Keene'],region:'New Hampshire, USA',description:'Skim the dam and its wooded reservoir, then follow the Ashuelot River valley to downtown Keene.',launches:{lake:'Surry Mountain Dam',ridge:'Keene Main Street',valley:'Ashuelot Valley overlook'}},
    moosehead: {name:['Moosehead','Lake'],region:'Maine, USA',description:'Bank past the cliffs of Mount Kineo, then follow the forested shoreline toward Rockwood.',launches:{lake:'Mount Kineo cliffs',ridge:'Rockwood crossing'}},
    napali: {name:['Nā Pali','Coast'],region:'Kauaʻi, Hawaiʻi',description:'Follow the folds of the volcanic cliffs from a hanging valley to the Pacific.',launches:{lake:'Kalalau sea cliffs',ridge:'Kalalau beach'}},
    yosemite: {name:['Yosemite','Valley'],region:'California, USA',description:'Bank between granite walls above the Merced River and its forested valley floor.',launches:{lake:'El Capitan overlook',ridge:'Valley floor'}},
    bryce: {name:['Bryce','Canyon'],region:'Utah, USA',description:'Drop from the rim and thread the orange limestone spires of the amphitheater.',launches:{lake:'Amphitheater rim',ridge:'Hoodoo corridor'}},
    crater: {name:['Crater','Lake'],region:'Oregon, USA',description:'Cross the caldera above deep blue water and circle the volcanic cone of Wizard Island.',launches:{lake:'Caldera overlook',ridge:'Wizard Island'}},
    lofoten: {name:['Lofoten','Islands'],region:'Reinefjorden, Norway',description:'Trace the saltwater fjord between sheer mountain faces and narrow islands.',launches:{lake:'Fjord overlook',ridge:'Reinefjorden channel'}},
    milford: {name:['Milford','Sound'],region:'Fiordland, New Zealand',description:'Follow the rainforest walls and waterfall channels along Piopiotahi.',launches:{lake:'Mitre Peak overlook',ridge:'Bowen Falls approach'}}
  });
  for(const [id,w] of Object.entries(worlds)){
    w.launches.lookout=window.PERCH_ROUTE_NAMES[id];
    w.launches.wildlife=id==='bryce'?'Tropic Reservoir shallows':'Wildlife shallows';
  }
  const app = document.getElementById('app');
  const picker = document.getElementById('worldPicker');
  const launch = document.getElementById('launchPoint');
  const list = document.getElementById('worldList');
  const initial = new URLSearchParams(location.hash.slice(1));
  const title=w=>w.name.join(' ');
  picker.replaceChildren(...Object.entries(worlds).map(([id,w])=>new Option(title(w),id)));
  const asset=name=>window.aerieAssetURL?.(name)||name;
  const mapSource=document.getElementById('mapSource');
  document.getElementById('creditsLink').href=asset('credits.txt');
  function previewName(id,start){
    if(start==='wildlife')start='lake';
    if(start==='lookout')return 'perch-'+id+'-view.jpg';
    if(id==='swiss')return {lake:'valley.jpg',falls:'falls-view.jpg',forest:'forest-view.jpg',shore:'swiss-shore-view.jpg'}[start];
    return id+'-'+start+'-view.jpg';
  }
  function preview(id,start){
    document.getElementById('landscape').style.backgroundImage='url("'+asset(previewName(id,start))+'")';
  }
  picker.value = Object.hasOwn(worlds, initial.get('world')) ? initial.get('world') : 'alaska';
  for (const [id, w] of Object.entries(worlds)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.choice = id;
    button.innerHTML = '<span class="thumb"></span><span><strong>'+title(w)+'</strong><small>'+w.region+'</small></span><span class="selectedMark" aria-hidden="true">✓</span>';
    button.querySelector('.thumb').style.backgroundImage='url("'+asset('menu-'+id+'.webp')+'")';
    button.addEventListener('click', () => {
      if (picker.value === id) return;
      picker.value = id;
      picker.dispatchEvent(new Event('change', { bubbles: true }));
    });
    list.append(button);
  }
  function remember() {
    const params = new URLSearchParams({world:picker.value, launch:launch.value});
    try { history.replaceState(null, '', '#'+params); } catch { location.hash = params.toString(); }
    app.dataset.departure = launch.value;
    document.querySelector('.intro p').textContent=launch.value==='lookout'?window.PERCH_ROUTE_DESCRIPTIONS[picker.value]:worlds[picker.value].description;
    preview(picker.value,launch.value);
  }
  function show(start) {
    const w = worlds[picker.value];
    app.dataset.world = picker.value;
    const mapCredits={moosehead:'Map © OpenStreetMap contributors',winnipesaukee:'USGS · USDA · OpenStreetMap · Microsoft',surry:'USGS · USDA · City of Keene · OpenStreetMap'};
    mapSource.hidden=!mapCredits[picker.value];
    mapSource.textContent=mapCredits[picker.value]||'';
    mapSource.href=asset(picker.value==='winnipesaukee'?'atlas-credits.txt':'credits.txt');
    document.querySelector('h1').innerHTML = w.name[0]+'<br><em>'+w.name[1]+'</em>';
    document.querySelector('.intro .eyebrow').innerHTML = '<i></i>'+w.region.toUpperCase();
    document.querySelector('.intro p').textContent = w.description;
    document.title = 'Aerie · '+title(w);
    const lowFlight=document.createElement('optgroup');lowFlight.label='Low flight to a perch';
    lowFlight.append(new Option(w.launches.lookout,'lookout'));
    const departures=Object.entries(w.launches).filter(([value])=>value!=='lookout');
    launch.replaceChildren(...departures.map(([value,label])=>new Option(label,value)),lowFlight);
    if (Object.hasOwn(w.launches,start)) launch.value = start;
    else if(picker.value==='alaska') launch.value='alpine';
    for (const button of list.children) button.setAttribute('aria-pressed', String(button.dataset.choice === picker.value));
    remember();
  }
  show(initial.get('launch'));
  picker.addEventListener('change', () => { show(); window.dispatchEvent(new CustomEvent('worldchange')); });
  launch.addEventListener('change',remember);
})();
