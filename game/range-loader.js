// A destination's elevation surveys and textures are opened when the player takes flight.
(() => {
  const base = ['eagle.js','flight-light.js','field-audio.js','perch-flight.js','perch-habitat.js','plant-models.js','understory.js','wildlife-models.js','fauna-shapes.js','fish-schools.js','wildlife.js','range-relief.js','water-surface.js','wind-field.js','wind-water.js','wind-soarer.js','moving-weather.js','valley-mist.js'];
  const trees = ['fir-data.js','forest.js'];
  const scripts = {
    alaska: ['nugget-spray.js','alaska-survey.js','alaska-world.js','talus-data.js','habitat.js',...trees],
    canyon: ['canyon-survey.js','canyon.js','habitat.js'],
    swiss: ['alpine-survey.js','alpine-headwall.js','world.js','talus-data.js','rocks.js','habitat.js',...trees]
  };
  const loaded=new Map();
  function open(name){
    if(!loaded.has(name)){
      const request=new Promise((resolve,reject)=>{
        const tag=document.createElement('script');
        tag.onload=resolve;
        tag.onerror=()=>reject(new Error('Unable to open '+name));
        const url=window.aerieAssetURL?.(name)||name;
        tag.src=url===name&&location.protocol!=='file:'?url+'?v=0.9.0':url;
        document.head.appendChild(tag);
      });
      loaded.set(name,request.catch(error=>{loaded.delete(name);throw error;}));
    }
    return loaded.get(name);
  }
  window.loadFlightRange=async region=>{
    const lakes=region==='winnipesaukee'||region==='moosehead';
    const files=scripts[region]||['atlas-'+region+'-survey.js','atlas-worlds.js','hardwood.js','scanned-hardwood.js',...(lakes?['lakeside.js']:[]),...trees];
    const surveyDetail={
      dixville:['dixville-landmarks.js'],
      labrador:['labrador-camp-ground.js','labrador-cabin.js','labrador-weather.js'],
      yosemite:['atlas-yosemite-crowns.js'],bryce:['atlas-bryce-relief.js','tropic-reservoir.js'],
      winnipesaukee:['winnipesaukee-waterfront-data.js','winnipesaukee-waterfront.js'],
      surry:['surry-dam.js','keene-city-data.js','keene-frontages.js','keene-streetscape.js','keene-city.js','keene-light.js']
    }[region]||[];
    const streams=['yosemite','bryce'].includes(region)?['river-'+region+'.js']:[];
    await Promise.all([...streams,...base,...files,...surveyDetail].map(open));
    await window.prepareRangeRelief(region);
    if(region==='bryce')await window.prepareBryceTerrain();
  };
})();
