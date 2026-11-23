// Yellowstone recordings stay associated with the feature or habitat in the
// park where they were recorded. Sounds share the main flight binaural mix.
(() => {
  'use strict';
  const directory='yellowstone-data/';
  const distance=(ear,p)=>Math.hypot(ear.x-p.x,ear.y-p.y,ear.z-p.z);
  const alternatives={faithful:['faithful-close','faithful-distant']};
  const herds=[
    {id:'american-bison',takes:['bison','bison-grunt','bison-rut','bison-graze'],reach:104,gain:.8,gap:25},
    {id:'elk',takes:['elk','elk-bugle','elk-calf'],reach:175,gain:.78,gap:41}
  ];
  const habitat=[
    ['Mountain bluebird','meadow',['bluebird'],45,54],
    ['Savannah sparrow','meadow',['sparrow'],42,47],
    ['Western meadowlark','meadow',['meadowlark'],42,62],
    ['Uinta ground squirrel','meadow',['uinta-squirrel'],0,85],
    ['Red-winged blackbird','shore',['blackbird'],38,58],
    ['Wilson’s snipe','shore',['snipe'],44,77],
    ['Sandhill crane','shore',['crane'],0,124],
    ['Common yellowthroat','shore',['yellowthroat'],45,61],
    ['Yellowstone wetland chorus','shore',['wetland-birds'],45,103],
    ['Boreal chorus frogs','shore',['frog-chorus','frog-pair'],60,95],
    ['Canada goose','water',['goose'],0,83],
    ['Ruffed grouse','understory',['grouse'],36,105],
    ['American red squirrel','understory',['red-squirrel'],0,84],
    ['Warbling vireo','canopy',['vireo'],44,63],
    ['American robin','canopy',['robin'],44,61],
    ['Townsend’s solitaire','canopy',['solitaire'],44,92]
  ];
  window.aerieYellowstoneHabitatRecordings=habitat.map(([name,habitat,takes,hush,rest])=>({
    name,habitat,clips:takes.map(file=>directory+file),hush,rest,period:'day'
  }));
  const fixed=[
    ['faithful','faithful',290,49,.86,'Old Faithful eruption','faithful'],
    ['hill-runoff','Geyser Hill',145,20,.51,'Geyser Hill runoff'],
    ['hill-birds','Geyser Hill',278,22,.36,'Geyser Hill birds'],
    ['castle','Castle Geyser',225,35,.56,'Castle Geyser steam','castle'],
    ['grand','Grand Geyser',330,42,.77,'Grand Geyser eruption','grand'],
    ['beehive','Beehive Geyser',249,25,.64,'Beehive eruption','hill-runoff'],
    ['anemone','Anemone Geyser',121,13,.44,'Anemone Geyser draining'],
    ['anemone-birds','Anemone Geyser',182,18,.33,'Geyser Hill killdeer'],
    ['sawmill','Sawmill Geyser',122,13,.39,'Sawmill Geyser vent'],
    ['blacksand','black-sand',134,15,.49,'Black Sand Pool bubbles'],
    ['cliff','Cliff Geyser',136,11,.30,'Black Sand Basin steam'],
    ['cliff-eruption','Cliff Geyser',170,15,.29,'Cliff Geyser water'],
    ['cliff-small-vent','Cliff Geyser',91,9,.24,'Black Sand Basin small vent'],
    ['raven','black-sand',276,19,.43,'Black Sand Basin raven'],
    ['midway','prismatic',255,29,.49,'Midway Geyser Basin field audio'],
    ['midway','excelsior',162,14,.24,'Excelsior warm outwash'],
    ['pine-wind','fountain',492,51,.40,'Lower Geyser Basin forest wind'],
    ['fountain','fountain',155,20,.49,'Fountain Paint Pot bubbling mud']
  ];
  window.aerieYellowstoneRecordingIds=[...new Set([
    ...fixed.flatMap(([id])=>[id,...(alternatives[id]||[])]),...herds.flatMap(q=>q.takes),
    ...habitat.flatMap(([, , takes])=>takes),'river','dipper'
  ])];
  window.makeYellowstoneAudio=function makeYellowstoneAudio(engine,world,load,buffers){
    let next=-Infinity, stream=null, riverTrack=null, animals=[];
    const terrain=world.yellowstone.survey, route=world.yellowstone.river;
    const newScene=()=>fixed.flatMap(([id,key,reach,ref,gain,label,cycle])=>{
      const p=terrain.landmarks[key];
      if(!p)return [];
      const [x,z]=p,y=world.elevation(x,z)+1.2;
      const close=alternatives[id]?.[0],far=alternatives[id]?.[1];
      return [{file:directory+id,close,far,reach,ref,gain,label,cycle,pos:{x,y,z},source:null,seen:-1}];
    });
    const emitters=newScene();
    const birdPass={x:-1362,z:-1100,reach:240,label:'American dipper and Canada geese on the Firehole',file:directory+'dipper'};
    function reset(){
      next=-Infinity;
      for(const q of emitters){q.source?.stop(.32);q.source=null;q.seen=-1;}
      stream?.stop(.32);stream=null;riverTrack=null;
      for(const actor of animals)actor.source?.stop(.30);
      animals=[];birdPass.visited=false;
    }
    function update(s,ear,now){
      if(now<next)return;
      next=now+.19;
      const t=s.elapsed||0;
      for(const q of emitters){
        const d=distance(ear,q.pos);
        if(d>q.reach*1.15){
          q.source?.stop(.56);q.source=null;
          continue;
        }
        const b=buffers.get(q.file);
        const take=d<85?q.close:d>165?q.far:null;
        const extra=take&&directory+take;
        if(extra&&buffers.get(extra)===undefined)load(extra);
        if(b===undefined){load(q.file);continue;}
        if(!b)continue;
        const effect=q.cycle&&world.yellowstone.thermal.cycle(q.cycle,t);
        if(effect){
          const phase=effect.phase;
          if(q.seen>phase+1)q.seen=-1;
          if(q.source&&!q.source.alive)q.source=null;
          if(effect.power>.13&&q.seen<0&&!q.source){
            const clip=extra&&buffers.get(extra)||b;
            q.seen=phase;
            const offset=Math.min(Math.max(0,phase-4),Math.max(0,clip.duration-2.5));
            q.source=engine.play(clip,q.pos,{label:q.label,gain:q.gain,ref:q.ref,reach:q.reach,wet:.43,echo:true,offset});
          }
        }else if(!q.source){
          q.source=engine.loop(b,q.pos,{label:q.label,gain:q.gain,ref:q.ref,reach:q.reach,wet:.25});
        }
      }
      const segment=route.nearest(ear.x,ear.z);
      const file=directory+'river';
      if(segment&&segment.distance<142&&ear.y<segment.y+120){
        const b=buffers.get(file);
        if(b===undefined)load(file);
        else if(b){
          const pos={x:segment.x,y:segment.y+.2,z:segment.z};
          if(!stream){
            riverTrack=pos;
            stream=engine.loop(b,pos,{label:'Firehole River current',gain:.39,ref:11,reach:162,wet:.30});
          }else{
            for(const axis of ['x','y','z']){
              riverTrack[axis]+=(pos[axis]-riverTrack[axis])*.34;
              stream[axis]=riverTrack[axis];
            }
          }
        }
      }else if(stream){stream.stop(.56);stream=null;}
      if(!birdPass.visited&&Math.hypot(ear.x-birdPass.x,ear.z-birdPass.z)<birdPass.reach){
        const b=buffers.get(birdPass.file);
        if(b===undefined)load(birdPass.file);
        else if(b){
          const y=world.height(birdPass.x,birdPass.z)+.55;
          engine.play(b,{x:birdPass.x,y,z:birdPass.z},{label:birdPass.label,gain:.48,ref:24,reach:birdPass.reach,wet:.20});
          birdPass.visited=true;
        }
      }
      // The mammal sounds follow visible animals, rather than a fixed meadow.
      for(const {id,takes,reach,gain,gap} of herds){
        let actor=animals.find(q=>q.id===id);
        if(!actor){actor={id,due:0,take:0,source:null};animals.push(actor);}
        if(actor.source?.alive){
          const a=actor.animal;
          actor.source.x=a.x;actor.source.y=a.y+.7;actor.source.z=a.z;
          continue;
        }
        if(now<actor.due)continue;
        const a=world.wildlife?.land?.caller(id,ear,reach);
        if(!a)continue;
        let stem=takes[actor.take%takes.length];
        if(stem==='bison-graze'&&distance(ear,a)>38)stem=takes[0];
        const file=directory+stem,b=buffers.get(file);
        if(b===undefined){load(file);continue;}
        actor.due=now+gap;actor.take++;
        if(!b)continue;
        actor.animal=a;
        actor.source=engine.play(b,{x:a.x,y:a.y+.7,z:a.z},{label:'Yellowstone '+stem,gain,ref:9,reach,wet:.29,duration:Math.min(b.duration,9)});
      }
    }
    return {reset,update};
  };
})();
