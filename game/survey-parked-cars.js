// Shared body geometry for the measured Main Street and lakefront parking rows.
window.makeSurveyCarEmitter=function(T,face){
  const paint=value=>new T.Color(value);
  const rubber=paint(0x242526), alloy=paint(0x9b9e9c), lens=paint(0x9aa6a9);
  const glassTop=paint(0x8597a3),glassFoot=paint(0x34434a);
  const headlamp=paint(0xe7e3ce),taillamp=paint(0xa33835);
  const colorways=[0x365268,0xd6d6ce,0x373b3c,0x9a9da1,0xdee3de,0x8a3335,0x4a5b55,0x313944,0xb2aaa1,0x526c85,0x2a2928];
  return function emit(vertex,variant,id,scale){
    const suv=variant==='suv'||variant==='van',van=variant==='van',pickup=variant==='pickup';
    const len=(van?4.9:pickup?5.0:suv?4.54:4.36)*scale;
    const w=(suv||pickup?.94:.885),belt=suv||pickup?1.05:.88;
    const roofH=van?1.88:suv||pickup?1.68:1.46;
    const coat=paint(colorways[id%colorways.length]);
    const shell=(y,side,over)=>{
      const l=len/2*over;
      return [[-l+.19,-side], [l-.33,-side], [l,-side*.67], [l,side*.67],
              [l-.33,side],[-l+.19,side],[-l,side*.73],[-l,-side*.73]].map(([u,v])=>vertex(u,v,y));
    };
    function join(a,b,kind,tint){
      for(let i=0;i<a.length;i++){const j=(i+1)%a.length;face(kind,tint,[a[i],a[j],b[j],b[i]]);}
    }
    const lower=shell(.27,w*.94,.948),sill=shell(.48,w,.989),shoulder=shell(belt-.07,w,.995),hem=shell(belt,w*.959,.972);
    join(lower,sill,'smooth',rubber);join(sill,shoulder,'carPaint',coat);join(shoulder,hem,'carPaint',coat);
    const middle=vertex(0,0,belt);
    for(let i=0;i<hem.length;i++)face('carPaint',coat,[middle,hem[i],hem[(i+1)%hem.length]]);
    const deckFront=.85,deckRear=pickup?-.51:-1.48;
    const roofFront=suv?.58:.28,roofRear=pickup?-.48:suv?-1.34:-1.00;
    const width=w*.941, rw=w*.79;
    const p=(u,v,h)=>vertex(u,v,h);
    face('autoGlass',[glassFoot,glassFoot,glassTop,glassTop],
      [p(deckFront,-width,belt+.015),p(deckFront,width,belt+.015),p(roofFront,rw,roofH-.03),p(roofFront,-rw,roofH-.03)]);
    face('autoGlass',[glassFoot,glassFoot,glassTop,glassTop],
      [p(deckRear,width,belt+.015),p(deckRear,-width,belt+.015),p(roofRear,-rw,roofH-.03),p(roofRear,rw,roofH-.03)]);
    for(const side of [-1,1]){
      const low=(u,h=belt+.015)=>p(u,width*side,h);
      const high=u=>p(u,rw*side,roofH-.03);
      face('autoGlass',[glassFoot,glassFoot,glassTop,glassTop],[low(deckRear),low(deckFront),high(roofFront),high(roofRear)]);
      face('carPaint',coat,[low(deckRear),low(deckRear+.12),high(roofRear+.09),high(roofRear)]);
      face('carPaint',coat,[low(deckFront-.10),low(deckFront),high(roofFront),high(roofFront-.08)]);
      if(!pickup){
        const mid=(roofFront+roofRear)*.5;
        face('smooth',rubber,[low(mid-.03),low(mid+.04),high(mid+.03),high(mid-.04)]);
      }
      for(const handle of pickup?[-.25]:[-.73,.32]){
        face('smooth',alloy,[p(handle-.07,w*side,belt-.09),p(handle+.08,w*side,belt-.09),p(handle+.08,w*side,belt-.054),p(handle-.07,w*side,belt-.054)]);
      }
      // Mirrors and lamps break up the dark belt line even when viewed obliquely.
      const mirror=[p(.66,width*side,belt+.09),p(.68,(w+.14)*side,belt+.11),p(.52,(w+.14)*side,belt+.15),p(.51,width*side,belt+.13)];
      face('carPaint',coat,mirror);
      for(const end of [-1,1]){
        const u=end*(len/2*.992-.065), hi=belt-.15,lo=hi-.15;
        face(end>0?'autoGlass':'smooth',end>0?headlamp:taillamp,
          [p(u,side*w*.42,lo),p(u-.1*end,side*w*.80,lo+.02),p(u-.12*end,side*w*.80,hi),p(u,side*w*.42,hi)]);
      }
      const radius=suv||pickup?.35:.303;
      for(const axle of [-len*.31,len*.306]){
        const discs=(wFactor,r)=>Array.from({length:12},(_,i)=>{
          const a=i*Math.PI/6;
          return p(axle+r*Math.cos(a),wFactor*side,radius+r*Math.sin(a));
        });
        const outer=discs(w+.017,radius),inner=discs(w*.90,radius),hub=discs(w+.024,radius*.54);
        join(outer,inner,'smooth',rubber);join(outer,hub,'smooth',rubber);
        for(let i=0;i<12;i++)face('smooth',i%2?alloy:lens,[p(axle,(w+.026)*side,radius),hub[i],hub[(i+1)%12]]);
      }
    }
    const top=[p(roofFront,-rw,roofH-.028),p(roofFront,rw,roofH-.028),p(roofRear,rw,roofH-.028),p(roofRear,-rw,roofH-.028)];
    face('carPaint',coat,top);
    if(pickup){
      const rear=-len*.46;
      face('smooth',rubber,[p(rear,-w*.75,belt+.009),p(-.65,-w*.75,belt+.009),p(-.65,w*.75,belt+.009),p(rear,w*.75,belt+.009)]);
    }
    return {shoulder,roofH};
  };
};
