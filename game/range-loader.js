// A destination's elevation surveys and textures are opened when the player takes flight.
(() => {
  const base = ['eagle-motion.js','eagle.js','terrain-bounce.js','terrain-shadows.js','flight-light.js','terrain-acoustics.js','field-audio.js','perch-flight.js','perch-habitat.js','plant-models.js','regional-habitat.js','regional-growth.js','regional-geology.js','regional-field-scenery.js','regional-forest.js','canopy-stream.js','understory.js','wildlife-models.js','fauna-shapes.js','land-models.js','land-wildlife.js','fish-schools.js','wildlife.js','game-vision.js','scenic-flights.js','range-relief.js','water-surface.js','wind-field.js','wind-water.js','wind-soarer.js','moving-weather.js','sky-optics.js','valley-mist.js','omnitone.min.js','spatial-audio.js','soundscapes.js'];
  const trees = ['fir-data.js','forest.js'];
  const scripts = {
    alaska: ['lake-reflection-domain.js','terrain-indices.js','alaska-cove.js','alaska-steep-survey.js','alaska-steep-creek.js','survey-parked-cars.js','alaska-sediment.js','nugget-surface.js','waterfall-system.js','alaska-survey.js','alaska-ice-survey.js','alaska-world.js','talus-data.js','habitat.js',...trees],
    canyon: ['canyon-survey.js','canyon.js','habitat.js','talus-data.js','rocks.js'],
    swiss: ['swiss-landing-data.js','swiss-lake-landing.js','swiss-frunden-data.js','swiss-frunden.js','waterfall-system.js','alpine-survey.js','alpine-headwall.js','world.js','talus-data.js','rocks.js','habitat.js',...trees]
  };
  const loaded=new Map();
  function open(name){
    if(!loaded.has(name)){
      const request=new Promise((resolve,reject)=>{
        const tag=document.createElement('script');
        tag.onload=resolve;
        tag.onerror=()=>reject(new Error('Unable to open '+name));
        const url=window.aerieAssetURL?.(name)||name;
        tag.src=url===name&&location.protocol!=='file:'?url+'?v=0.26.5':url;
        document.head.appendChild(tag);
      });
      loaded.set(name,request.catch(error=>{loaded.delete(name);throw error;}));
    }
    return loaded.get(name);
  }
  window.loadFlightRange=async region=>{
    const lakes=region==='winnipesaukee'||region==='moosehead';
    const files=scripts[region]||['atlas-'+region+'-survey.js','atlas-worlds.js','rain-trace.js','shore-bank.js','hardwood.js','scanned-hardwood.js',...(lakes?['lakeside.js','lake-bay-data.js','lake-bay-contours.js','lake-habitat.js','lake-habitat-'+region+'.js']:[]),...trees];
    const surveyDetail={
      crater:['crater-rim-data.js','crater-rim.js','crater-plaikni.js','crater-plaikni-meadow.js','regional-waterfalls.js','falls-terrain-crater.js','waterfall-system.js','crater-bathymetry.js','crater-weather.js','crater-phantom-ship.js'],
      dixville:['waterfall-system.js','dixville-brooks.js','dixville-lidar.js','talus-data.js','rocks.js','architecture.js','dixville-resort-park.js','dixville-resort.js','dixville-hale.js','dixville-landmarks.js'],
      labrador:['architecture.js','labrador-narrows-survey.js','labrador-narrows.js','labrador-camp-ground.js','labrador-cabin.js','labrador-floatplane.js','labrador-cabert-data.js','labrador-cabert.js','labrador-weather.js'],
      acadia:['acadia-harbor-seals.js','acadia-light-stations.js','acadia-station-optics.js','acadia-baker-dance.js','acadia-ledge-surf.js','acadia-night.js','acadia-coast.js','acadia-ocean-path.js','acadia-sand-beach.js'],
      lofoten:['lofoten-sea-mask.js','lofoten-reine-data.js','lofoten-reine.js','lofoten-reinewest-data.js','lofoten-marken.js','lofoten-reinevatnet-data.js','lofoten-reinevatnet.js','lofoten-reinebringen-surface.js','regional-waterfalls.js','falls-terrain-lofoten.js','waterfall-system.js','lofoten-hamnoy.js'],
      yosemite:['yosemite-creek-survey.js','yosemite-creek.js','yosemite-falls.js','yosemite-meadow-field.js','yosemite-meadow.js','terrain-indices.js','waterfall-system.js','atlas-yosemite-crowns.js','talus-data.js','rocks.js'],
      moosehead:['moosehead-rockwood-data.js','survey-parked-cars.js','moosehead-rockwood.js','moosehead-crowns.js','moosehead-shore-survey.js','moosehead-bank-growth.js','moosehead-uplands.js','kineo-terrain.js','regional-waterfalls.js','falls-terrain-moosehead.js','waterfall-system.js','architecture.js'],
      winnipesaukee:['regional-waterfalls.js','falls-terrain-winnipesaukee.js','waterfall-system.js','architecture.js','winnipesaukee-waterfront-data.js','winnipesaukee-waterfront.js','winnipesaukee-town-docks-data.js','survey-parked-cars.js','winnipesaukee-town-docks.js'],
      surry:['regional-waterfalls.js','falls-terrain-surry.js','waterfall-system.js','architecture.js','keene-weather.js','keene-river-park.js','surry-dam.js','keene-city-data.js','keene-colony-survey.js','keene-colony-block.js','keene-frontages.js','survey-parked-cars.js','keene-streetscape.js','keene-city.js','keene-light.js']
    }[region]||[];
    if(lakes||region==='crater')surveyDetail.push('terrain-indices.js');
    if(['surry','dixville','yosemite','lofoten'].includes(region))surveyDetail.push('regional-field-fixtures.js');
    const streams=region==='yosemite'?['river-'+region+'.js']:[];
    const assets=[...streams,...base,'wildlife-tracks.js','regional-landforms.js','habitat-data/'+region+'.js',...files,...surveyDetail];
    await Promise.all(assets.map(name=>name==='canopy-stream.js'
      ? Promise.all([open('close-tree-detail.js'),open('close-bark-material.js').catch(()=>{})]).then(()=>open(name)) : open(name)));
    const lakeBays=window.aerieLakeBankSites?.[region]||[];
    const extraSurveys=region==='acadia'?['eggrock','bakerisland']:region==='yosemite'?['yosemitefalls']:region==='crater'?['watchman','cleetwood']:region==='swiss'?[...lakeBays,'frunden']:region==='lofoten'?[...lakeBays,'korten','reine','reinebringen']:lakeBays;
    const secondarySurvey={canyon:'canyonshelves',lofoten:'hamnoy',swiss:'swisswest',labrador:'cabert',yosemite:'yosemitesummits'}[region];
    await Promise.all([...extraSurveys.map(name=>window.aerieRegionalLandforms.prepare(name)),region==='acadia'?Promise.all([window.prepareAcadiaStationCrowns(),window.prepareBakerSlabs(),window.prepareAcadiaLedgeField()]):window.prepareRangeRelief(region),window.aerieRegionalLandforms.prepare(region),(lakes||['alaska','yosemite','crater'].includes(region))?window.aerieTerrainIndices.prepare(region):null,secondarySurvey?window.aerieRegionalLandforms.prepare(secondarySurvey):null,region==='moosehead'?window.prepareMooseheadUplands():null]);
  };
})();
