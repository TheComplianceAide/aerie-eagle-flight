// Presentation only: flight, audio, scenery and targeting continue to use SI.
(() => {
  const feetPerMeter=1/.3048, metersPerMile=1609.344;
  const feet=meters=>Math.round(meters*feetPerMeter).toLocaleString('en-US')+' ft';
  const miles=meters=>(meters/metersPerMile).toFixed(1)+' mi';
  window.aerieUnits={
    feet,miles,
    distance:meters=>meters<metersPerMile/4?feet(meters):miles(meters),
    altitude:meters=>Math.round(meters*feetPerMeter).toLocaleString('en-US'),
    speed:metersPerSecond=>Math.round(metersPerSecond*3600/metersPerMile),
    vertical:metersPerSecond=>(metersPerSecond>=0?'+':'')+(metersPerSecond*feetPerMeter).toFixed(1)
  };
})();
