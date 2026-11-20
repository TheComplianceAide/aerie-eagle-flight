// A destination's elevation surveys and textures are opened when the player takes flight.
(() => {
  const base = ['eagle.js','terrain-bounce.js','flight-light.js','terrain-acoustics.js','field-audio.js','perch-flight.js','perch-habitat.js','plant-models.js','regional-habitat.js','regional-growth.js','regional-forest.js','canopy-stream.js','understory.js','wildlife-models.js','fauna-shapes.js','land-models.js','land-wildlife.js','fish-schools.js','wildlife.js','game-vision.js','scenic-flights.js','range-relief.js','water-surface.js','wind-field.js','wind-water.js','wind-soarer.js','moving-weather.js','sky-optics.js','valley-mist.js'];
  const trees = ['fir-data.js','forest.js'];
  const scripts = {
    alaska: ['waterfall-system.js','alaska-survey.js','alaska-world.js','talus-data.js','habitat.js',...trees],
    canyon: ['canyon-survey.js','canyon.js','habitat.js','talus-data.js','rocks.js'],
    swiss: ['waterfall-system.js','alpine-survey.js','alpine-headwall.js','world.js','talus-data.js','rocks.js','habitat.js',...trees]
  };
  const loaded=new Map();
  function open(name){
    if(!loaded.has(name)){
      const request=new Promise((resolve,reject)=>{
        const tag=document.createElement('script');
        tag.onload=resolve;
        tag.onerror=()=>reject(new Error('Unable to open '+name));
        const url=window.aerieAssetURL?.(name)||name;
        tag.src=url===name&&location.protocol!=='file:'?url+'?v=0.17.0-preview.1':url;
        document.head.appendChild(tag);
      });
      loaded.set(name,request.catch(error=>{loaded.delete(name);throw error;}));
    }
    return loaded.get(name);
  }
  window.loadFlightRange=async region=>{
    const lakes=region==='winnipesaukee'||region==='moosehead';
    const files=scripts[region]||['atlas-'+region+'-survey.js','atlas-worlds.js','rain-trace.js','shore-bank.js','hardwood.js','scanned-hardwood.js',...(lakes?['lakeside.js']:[]),...trees];
    const surveyDetail={
      crater:['regional-waterfalls.js','falls-terrain-crater.js','waterfall-system.js','crater-bathymetry.js','crater-weather.js','crater-phantom-ship.js'],
      dixville:['waterfall-system.js','dixville-brooks.js','dixville-lidar.js','talus-data.js','rocks.js','architecture.js','dixville-landmarks.js'],
      labrador:['architecture.js','labrador-camp-ground.js','labrador-cabin.js','labrador-weather.js'],
      milford:['waterfall-system.js'],
      lofoten:['regional-waterfalls.js','falls-terrain-lofoten.js','waterfall-system.js'],
      yosemite:['waterfall-system.js','atlas-yosemite-crowns.js','talus-data.js','rocks.js'],
      moosehead:['regional-waterfalls.js','falls-terrain-moosehead.js','waterfall-system.js','architecture.js'],
      winnipesaukee:['regional-waterfalls.js','falls-terrain-winnipesaukee.js','waterfall-system.js','architecture.js','winnipesaukee-waterfront-data.js','winnipesaukee-waterfront.js'],
      surry:['regional-waterfalls.js','falls-terrain-surry.js','waterfall-system.js','architecture.js','keene-weather.js','surry-dam.js','keene-city-data.js','keene-frontages.js','keene-streetscape.js','keene-city.js','keene-light.js']
    }[region]||[];
    const streams=region==='yosemite'?['river-'+region+'.js']:[];
    await Promise.all([...streams,...base,'habitat-data/'+region+'.js',...files,...surveyDetail].map(open));
    await window.prepareRangeRelief(region);
  };
})();
