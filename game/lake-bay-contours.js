// Each survey replaces only the portions of the chart for which imagery
// provides a measured wet/dry boundary. Both aircraft contact and lake
// triangulation consume the same corrected chart.
window.aerieLakeBankSites={
  moosehead:['spencer','lily'],
  winnipesaukee:['meredith','wolfeboro','diamond','sleepers']
};
window.refineLakeBays=function(region,survey){
  if(survey.baysMapped)return;
  const same=(a,b)=>a[0]===b[0]&&a[1]===b[1];
  for(const run of window.aerieLakeBankRuns[region]||[]){
    const ring=run.ring?survey.shoreHoles[run.ring-1]:survey.shore;
    const first=ring.findIndex(p=>same(p,run.start)),end=ring.findIndex(p=>same(p,run.end));
    if(first<0||end<0)continue;
    const points=[];
    for(let i=0;i<run.points.length;i+=2)points.push([run.points[i]/5,run.points[i+1]/5]);
    if(run.closed)ring.splice(0,ring.length,run.start,...points);
    else if(first<end)ring.splice(first+1,end-first-1,...points);
    else{
      ring.splice(first+1,ring.length-first-1,...points);
      ring.splice(0,end);
    }
  }
  survey.baysMapped=true;
};
