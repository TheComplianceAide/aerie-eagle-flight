// Labels follow the same animated animals the eagle sees in the world.
window.makeGameVision = function(T,world,button,layer) {
  const panel=layer.querySelector('.gameReadout'),summary=panel.querySelector('ul');
  const pins=[...layer.querySelectorAll('.gamePin')];
  const points=new T.Vector3();
  const compass=['N','NE','E','SE','S','SW','W','NW'];
  let active=false,nextScan=-Infinity,scan=[],nearest=[],lastRows='';
  function startFlight(wildlifeDeparture){
    let preference=null;
    try{preference=localStorage.getItem('aerie:gameVision');}catch{}
    const firstFlightDefault=wildlifeDeparture||matchMedia('(pointer: coarse)').matches;
    setActive(preference===null?firstFlightDefault:preference==='on');
  }
  function toggle(){
    setActive(!active);
    try{localStorage.setItem('aerie:gameVision',active?'on':'off');}catch{}
  }
  function setActive(value) {
    active=value;
    button.setAttribute('aria-pressed',String(active));layer.hidden=!active;
    nextScan=-Infinity;lastRows='';
    if(!active){scan=[];nearest=[];for(const pin of pins)pin.hidden=true;}
  }
  function clearSight(from,a) {
    const terrain=world.elevation||world.height;
    const steps=Math.min(32,Math.ceil(a.distance/7));
    for(let i=1;i<steps;i++){
      const u=i/steps;
      if(terrain(from.x+(a.x-from.x)*u,from.z+(a.z-from.z)*u)>from.y+(a.y-from.y)*u+.8)return false;
    }
    return true;
  }
  function update(player,camera,time) {
    if(!active||layer.closest('main').classList.contains('clearView'))return;
    if(time<nextScan-.23||time>=nextScan){
      const sightings=world.wildlife.nearby(player,400);
      const counts=new Map();nearest=[];scan=[];
      for(const a of sightings){
        if(!a.name||!Number.isFinite(a.distance))continue;
        const count=counts.get(a.name)||0;
        if(!count&&nearest.length<3)nearest.push(a);
        if(count>=4)continue;
        counts.set(a.name,count+1);
        if(clearSight(camera.position,a))scan.push({...a,bodyOffset:a.y-(a.actor?.y??a.y)});
      }
      nextScan=time+.22;
    }
    const rows=nearest.map(a=>{
      const angle=Math.atan2(a.x-player.x,player.z-a.z);
      const direction=compass[(Math.round(angle*4/Math.PI)+8)%8];
      const dist=Math.round(a.distance/(a.distance>45?5:1))*(a.distance>45?5:1);
      return [a.name,dist+' m · '+direction];
    });
    const key=JSON.stringify(rows);
    if(key!==lastRows){
      summary.replaceChildren();lastRows=key;
      for(const [name,detail] of rows){
        const row=document.createElement('li'),label=document.createElement('span'),metadata=document.createElement('small');
        label.textContent=name;metadata.textContent=detail;row.append(label,metadata);summary.append(row);
      }
      if(!rows.length){const row=document.createElement('li');row.textContent='No wildlife within 400 m';summary.append(row);}
    }
    const used=[],labeled=new Set();let count=0;
    for(const a of scan){
      if(labeled.has(a.name))continue;
      // Refresh the body position between scans so a crossing bird keeps its marker.
      const actor=a.actor;
      points.set(actor?.x??a.x,actor?.y!==undefined?actor.y+a.bodyOffset:a.y,actor?.z??a.z).project(camera);
      if(points.z<=-1||points.z>=1||Math.abs(points.x)>.84||points.y<-.69||points.y>.73)continue;
      const x=(points.x+1)*layer.clientWidth/2,y=(1-points.y)*layer.clientHeight/2;
      if(used.some(([ox,oy])=>Math.abs(ox-x)<130&&Math.abs(oy-y)<37))continue;
      const pin=pins[count++];pin.hidden=false;pin.style.transform='translate('+x.toFixed(1)+'px,'+y.toFixed(1)+'px)';
      pin.lastElementChild.textContent=a.name;used.push([x,y]);labeled.add(a.name);if(count===pins.length)break;
    }
    for(let i=count;i<pins.length;i++)pins[i].hidden=true;
  }
  return {toggle,startFlight,update};
};
