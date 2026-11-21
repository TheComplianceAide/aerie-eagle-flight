// Fronts are keyed to a surveyed wall endpoint, so joined municipal roof polygons
// can represent a streetful of shops with different parapets and entrances.
window.makeKeeneFrontages=function(T,{layout,face,clearRoof}) {
  const photos={colonial:'colonial',exchange:'exchange',lane:'lane',kings:'kings',works:'works',marqueePhoto:'marquee',
    pour:'pour',chamber:'chamber',ashuelot:'ashuelot',chamberlain:'chamberlain',theatreSide:'colonial-side'};
  for(const [key,name] of Object.entries(photos))layout[key]={file:'keene-front-'+name+'.webp',roughness:.89,alphaTest:.34};
  for(const name of ['colonial','exchange','chamberlain','chamber','ashuelot','pour'])layout[name].normal='building-'+name+'-relief.webp';
  layout.marqueeLamp={roughness:.27,emissive:0xffbe6a};
  layout.shopLettering={file:'keene-front-lettering.webp',roughness:.67};
  layout.shopDisplay={file:'building-decor-shop.webp',roughness:.28};
  layout.cafeDisplay={file:'building-comfy-cafe.webp',roughness:.28};
  layout.upperSash={file:'keene-front-sash.webp',roughness:.44};
  layout.paintedSiding={file:'keene-front-clapboard.webp',roughness:.78};

  // Store order is left-to-right when looking from the street. Label numbers
  // address the two-column sign atlas, with the capitalization drawn into it.
  const walls={
    '1919.9,4652.6':[[1,0,'colonial']],
    '1868.2,4661.1':[[1,null,'southAlley']],
    '1916.5,4631.3':[[1,null,'northAlley']],
    '1902.2,4634.5':[[1,null,'stagehouse']],
    '1923.7,4675.2':[[1,31,'exchange']],
    '1912.5,4602.7':[[1,1,'gable']],
    '1907.1,4590.8':[[1,null,'yellow']],
    '1953.7,4584.4':[[1,2,'burger']],
    '1952.8,4593.6':[[1,3,'perch']],
    '1954.8,4602.3':[[1,4,'kings']],
    '1942.6,4505.6':[[.56,5,'market'],[1,6,'dark']],
    '1945.6,4534.1':[[.47,7,'stone'],[1,8,'red']],
    '1899.9,4543.5':[[.57,9,'copper'],[1,10,'red']],
    '1896.5,4519':[[.44,12,'dark'],[.72,11,'red'],[1,null,'red']],
    '1905.1,4571.7':[[1,13,'news']],
    '1934.6,4422.4':[[.18,null,'red'],[.36,14,'coffee'],[.52,null,'red'],[.65,null,'stone'],[1,16,'lane']],
    '1883.3,4446.1':[[1,17,'cream']],
    '1885.9,4460.3':[[.50,19,'red'],[1,18,'dark']],
    '1850.5,4344.1':[[.44,21,'sweet'],[1,20,'stage']],
    '1848.3,4403.1':[[.60,23,'pour'],[1,31,'chamberlain']],
    '1855.5,4421.7':[[.62,0,'ashuelot'],[1,null,'chamber']],
    '1957.6,4623.9':[[.32,24,'dark'],[.70,null,'stone'],[1,30,'red']],
    '1968.1,4695.2':[[1,25,'red']],
    '1968,4704.1':[[1,26,'works']],
    '1928.6,4703.4':[[1,27,'red']],
    '1925.3,4686.1':[[1,28,'dark']],
    '1957.6,4312.7':[[1,29,'cityhall']]
  };
  const rgb=c=>new T.Color(c);
  const cream=rgb(0xd8cfb9),bronze=rgb(0x443e34),glass=rgb(0xd9e5e3),white=rgb(0xf5f4ee),iron=rgb(0x343735);
  const palettes={
    red:[0xdeb19b,0x393b35],dark:[0xc99b88,0x353b38],stone:[0xc5b197,0x713e42],
    market:[0xd5aa99,0x34413c],copper:[0xd7a190,0x78654f],news:[0xceaa8c,0x39533f],
    coffee:[0xecbaa6,0x35463a],cream:[0xd5cab2,0x5e5949],sweet:[0xd6ad96,0xbb7882],
    stage:[0xcfb197,0x443c31],square:[0xdfb29c,0x633e35],colony:[0xe0b2a0,0x4c4943],
    bank:[0xc7b6a1,0x4d4940],redarch:[0xd49983,0x894338],burger:[0xc5a797,0x4a5142],
    perch:[0xd7c8ae,0x5d4a38],kings:[0xb49689,0x49433c],yellow:[0xdec05e,0x34486b],
    gable:[0xffd974,0x334b6b],cityhall:[0xe0b09c,0x585140],lane:[0xd5a68e,0x414037],
    pour:[0xdba998,0x563831],chamberlain:[0xe0b19a,0x4a4b43],ashuelot:[0xdab39a,0x564139],chamber:[0xd4c6b9,0x514d46]
  };
  // Recesses follow the openings in the rectified source photograph. Each
  // group stores the window centers, width and the lower and upper UV limits.
  const openings={
    colonial:[[[.092,.228,.430,.569,.767,.903],.073,.674,.799],[[.091,.229,.431,.567,.769,.903],.071,.440,.557]],
    exchange:[[[.131,.326,.505,.658,.856],.076,.613,.799],[[.131,.326,.505,.658,.856],.076,.365,.534]],
    chamberlain:[[[.10,.19,.455,.58,.765,.887],.069,.65,.747],[[.10,.194,.455,.58,.768,.883],.07,.324,.473],[[.10,.193,.453,.58,.77,.887],.067,.068,.163]],
    pour:[[[.15,.418,.671,.851],.091,.441,.61],[[.126,.414,.678,.85],.093,.028,.199]],
    ashuelot:[[[.147,.313,.47,.626,.782,.926],.058,.68,.82],[[.158,.263,.765,.87],.080,.381,.514],[[.163,.261,.765,.873],.073,.046,.177]],
    chamber:[[[.199,.477,.741],.13,.443,.595],[[.205,.482,.742],.12,.068,.195]],
    works:[[[.096,.734,.906],.13,.131,.396],[[.31,.381],.05,.112,.367]]
  };
  for(const name of Object.keys(openings))layout[name+'Pane']={...layout[name],normal:undefined,roughness:.20,glazing:true};
  const tileUV=(index,cols,rows)=>{
    const u0=(index%cols+.003)/cols,u1=(index%cols+.997)/cols;
    const v1=1-(Math.floor(index/cols)+.005)/rows,v0=1-(Math.floor(index/cols)+.995)/rows;
    return [[u0,v0],[u1,v0],[u1,v1],[u0,v1]];
  };
  const full=[[0,0],[1,0],[1,1],[0,1]];
  function render(a,b,base,top) {
    const profiles=walls[b.join(',')];
    if(!profiles)return false;
    // Exterior rings wind counterclockwise in map coordinates. Reverse the
    // bearing for a street-facing image with readable text.
    const width=Math.hypot(a[0]-b[0],a[1]-b[1]);
    const dx=(a[0]-b[0])/width,dz=(a[1]-b[1])/width,nx=-dz,nz=dx;
    const point=(u,y,d)=>[b[0]+dx*u+nx*d,base+y,b[1]+dz*u+nz*d];
    function rect(kind,tint,u0,u1,y0,y1,depth,uv){
      const bays=openings[kind];
      if(!bays){face(kind,tint,[point(u0,y0,depth),point(u1,y0,depth),point(u1,y1,depth),point(u0,y1,depth)],uv);return;}
      const overlay=depth+.27,xy=(x,y,d)=>point(u0+(u1-u0)*x,y0+(y1-y0)*y,d);
      function patch(mat,a,b,lo,hi,d){
        face(mat,tint,[xy(a,lo,d),xy(b,lo,d),xy(b,hi,d),xy(a,hi,d)],[[a,lo],[b,lo],[b,hi],[a,hi]]);
      }
      const bands=[...bays].sort((a,b)=>a[2]-b[2]);let floor=0;
      for(const [centers,w,lo,hi] of bands){
        patch(kind,0,1,floor,lo,overlay);let edge=0;
        for(const mid of centers){
          const a=mid-w/2,b=mid+w/2;
          patch(kind,edge,a,lo,hi,overlay);patch(kind+'Pane',a,b,lo,hi,depth+.024);
          for(const x of [a,b]){
            face('smooth',rgb(0x5a554d),[xy(x,lo,depth),xy(x,hi,depth),xy(x,hi,overlay),xy(x,lo,overlay)],
              [[x,lo],[x,hi],[x+.003,hi],[x+.003,lo]]);
          }
          for(const y of [lo,hi])face(kind,tint,[xy(a,y,depth),xy(b,y,depth),xy(b,y,overlay),xy(a,y,overlay)],
              [[a,y],[b,y],[b,y+.004],[a,y+.004]]);
          edge=b;
        }
        patch(kind,edge,1,lo,hi,overlay);floor=hi;
      }
      patch(kind,0,1,floor,1,overlay);
      // Carry the original photographic brick joints and carved faces across
      // the projections, including their newly visible sides and undersides.
      function course(a,b,lo,hi,projection){
        const back=overlay+.002,front=back+projection;
        patch(kind,a,b,lo,hi,front);
        for(const y of [lo,hi])face(kind,tint,[xy(a,y,back),xy(b,y,back),xy(b,y,front),xy(a,y,front)],
          [[a,y],[b,y],[b,y+.004],[a,y+.004]]);
        for(const x of [a,b])face(kind,tint,[xy(x,lo,back),xy(x,hi,back),xy(x,hi,front),xy(x,lo,front)],
          [[x,lo],[x,hi],[x+.003,hi],[x+.003,lo]]);
      }
      for(const [centers,w,lo] of bands)for(const mid of centers){
        course(mid-w*.57,mid+w*.57,lo-.014,lo+.001,.155);
      }
      if(kind==='colonial'){
        for(const [a,b] of [[.326,.347],[.647,.667]])course(a,b,.381,.878,.16);
        course(.003,.997,.875,.903,.30);course(.003,.997,.902,.912,.40);
        course(.335,.665,.934,.993,.13);
      }else if(kind==='exchange'){
        for(const [a,b] of [[.022,.043],[.223,.247],[.407,.427],[.566,.582],[.735,.750],[.964,.982]])course(a,b,.354,.853,.235);
        course(.012,.988,.331,.352,.34);
        // The two striped awnings have sloping fabric, closed returns and a
        // hanging hem. The original two photographed stripe patterns supply their UVs.
        for(const [a,b] of [[.005,.247],[.376,.626]]){
          const root=overlay+.035,lip=overlay+1.65;
          face(kind,white,[xy(a,.181,lip),xy(b,.181,lip),xy(b,.277,root),xy(a,.277,root)],[[a,.181],[b,.181],[b,.277],[a,.277]]);
          face(kind,white,[xy(a,.161,lip),xy(b,.161,lip),xy(b,.181,lip),xy(a,.181,lip)],[[a,.161],[b,.161],[b,.181],[a,.181]]);
          for(const x of [a,b])face(kind,white,[xy(x,.164,root),xy(x,.164,lip),xy(x,.277,root)],[[x,.19],[x+.012,.19],[x,.277]]);
          obstruction(u0+a*(u1-u0),u0+b*(u1-u0),root,lip,y0+.277*(y1-y0));
        }
      }
    }
    function box(kind,tint,l,r,lo,hi,back,front){
      const bl=point(l,lo,back),br=point(r,lo,back),tl=point(l,hi,back),tr=point(r,hi,back);
      const fl=point(l,lo,front),fr=point(r,lo,front),ft=point(l,hi,front),rt=point(r,hi,front);
      face(kind,tint,[fl,fr,rt,ft]);face(kind,tint,[ft,rt,tr,tl]);
      face(kind,tint,[bl,fl,ft,tl]);face(kind,tint,[fr,br,tr,rt]);face(kind,tint,[bl,br,fr,fl]);
    }
    function obstruction(l,r,back,front,z){
      const ring=[[l,back],[r,back],[r,front],[l,front]].map(([u,d])=>{const p=point(u,0,d);return [p[0],p[2]];});
      clearRoof(ring,base+z);
    }
    function label(index,l,r,low,high,d=.215){
      if(index!=null)rect('shopLettering',white,l,r,low,high,d,tileUV(index,2,16));
    }
    function awning(l,r,y,cloth,striped,depth=1.10){
      const bays=striped?Math.max(2,Math.round((r-l)/.36)):1;
      for(let i=0;i<bays;i++){
        const s=l+(r-l)*i/bays,e=l+(r-l)*(i+1)/bays,tint=striped&&i%2?cream:cloth;
        face('smooth',tint,[point(s,y,.12),point(e,y,.12),point(e,y-.43,depth),point(s,y-.43,depth)]);
        rect('smooth',tint,s,e,y-.60,y-.43,depth);
      }
      for(const u of [l,r])face('smooth',cloth,[point(u,y,.13),point(u,y-.44,depth),point(u,y-.43,.13)]);
      obstruction(l,r,0,depth,y);
    }
    function windowBay(mid,lo,hi,w,arched,seed){
      const l=mid-w/2,r=mid+w/2,pane=seed%16;
      const shoulder=hi-(arched?.48:0);
      rect('smooth',bronze,l-.10,r+.10,lo-.075,shoulder+.1,.078);
      rect('upperSash',rgb(0xe5ecec),l+.03,r-.03,lo+.10,shoulder,.104,tileUV(pane,4,4));
      if(arched){
        const archColor=rgb(0xbda58c),reflect=rgb(0x738182);
        for(let i=0;i<8;i++){
          const a=Math.PI*i/8,b=Math.PI*(i+1)/8;
          const arch=(angle,radius,depth)=>point(mid+Math.cos(angle)*radius,shoulder+Math.sin(angle)*.48*radius/(w*.5),depth);
          face('glass',reflect,[point(mid,shoulder,.101),arch(a,w*.5,.101),arch(b,w*.5,.101)]);
          face('smooth',archColor,[arch(a,w*.5,.15),arch(b,w*.5,.15),arch(b,w*.5+.12,.15),arch(a,w*.5+.12,.15)]);
        }
      }else box('smooth',cream,l-.15,r+.15,hi-.035,hi+.12,.075,.18);
      box('smooth',cream,l-.13,r+.13,lo-.16,lo,.065,.23);
      rect('smooth',cream,mid-.026,mid+.026,lo+.06,shoulder,.122);
      rect('smooth',cream,l+.02,r-.02,lo+(shoulder-lo)*.53,lo+(shoulder-lo)*.53+.048,.125);
    }
    function blade(labelId,mid,y,round){
      const end=1.45,start=.32,bottom=y-.86;
      box('smooth',iron,mid-.055,mid+.055,y+.08,y+.16,.11,end+.17);
      for(const d of [.48,end-.08]){
        face('smooth',iron,[point(mid-.025,y-.06,d),point(mid+.025,y-.06,d),point(mid+.025,y+.12,d),point(mid-.025,y+.12,d)]);
      }
      const dark=rgb(round?0x383e35:0x324039);
      const thickness=.065;
      if(round){
        const sides=24,c=(start+end)/2,r=.59;
        for(let i=0;i<sides;i++){
          const a=i*2*Math.PI/sides,b=(i+1)*2*Math.PI/sides;
          for(const t of [-thickness,thickness])face('smooth',dark,[point(mid+t,y-.4,c),point(mid+t,y-.4+r*Math.sin(a),c+r*Math.cos(a)),point(mid+t,y-.4+r*Math.sin(b),c+r*Math.cos(b))]);
        }
      }
      for(const dir of [-1,1]){
        const l=dir===1?start:end,r=dir===1?end:start,t=mid+dir*(thickness+.003);
        face('shopLettering',white,[point(t,bottom,l),point(t,bottom,r),point(t,y-.05,r),point(t,y-.05,l)],tileUV(labelId,2,16));
      }
      obstruction(mid-.11,mid+.11,0,end+.18,y+.17);
    }
    function flyRoof(l,r,height,wallTop,depth){
      if(height<=wallTop+.1)return;
      const tint=rgb(0xa3887a);
      for(const u of [l,r]){
        face('brick',tint,[point(u,wallTop-.06,-depth),point(u,wallTop-.06,.035),point(u,height,.035),point(u,height,-depth)],[[0,0],[depth/1.58,0],[depth/1.58,(height-wallTop)/1.58],[0,(height-wallTop)/1.58]]);
      }
      rect('brick',tint,l,r,wallTop-.05,height,-depth,[[0,0],[(r-l)/1.58,0],[(r-l)/1.58,(height-wallTop)/1.58],[0,(height-wallTop)/1.58]]);
      face('smooth',rgb(0x676864),[point(l,height,-depth),point(r,height,-depth),point(r,height,.02),point(l,height,.02)]);
      obstruction(l,r,-depth,.12,height);
    }
    function gabled(l,r,wallTop,sign){
      const blue=rgb(0x354d73),yellow=rgb(0xe0b54d),red=rgb(0x90362b),m=(l+r)/2;
      const eave=Math.max(6.35,wallTop),peak=eave+3.55;
      rect('paintedSiding',yellow,l,r,-.3,eave,.043,[[0,0],[(r-l)/1.8,0],[(r-l)/1.8,eave/1.8],[0,eave/1.8]]);
      for(const d of [.055,-12])face('paintedSiding',yellow,[point(l,eave,d),point(r,eave,d),point(m,peak,d)],[[0,0],[(r-l)/1.8,0],[(r-l)/3.6,(peak-eave)/1.8]]);
      for(const u of [l,r]){
        const side=u===l?u-.08:u+.08;
        face('paintedSiding',yellow,[point(side,-.17,.03),point(side,-.17,-12),point(side,eave,-12),point(side,eave,.03)],[[0,0],[12/1.8,0],[12/1.8,eave/1.8],[0,eave/1.8]]);
        box('smooth',blue,u-.11,u+.11,.10,eave-.1,.045,.12);
        const d=point(u,eave,-12),f=point(u,eave,.37),g=point(m,peak,.37),b=point(m,peak,-12);
        face('shingle',rgb(0x85847d),[d,f,g,b],[[0,0],[4,0],[4,2.5],[0,2.5]]);
        face('smooth',blue,[point(u,eave-.21,.38),point(m,peak-.21,.38),g,f]);
      }
      for(let k=0;k<3;k++)windowBay(l+(k+.5)*(r-l)/3,3.65,5.27,1.0,false,8+k);
      box('smooth',blue,l-.1,r+.1,.05,.65,.02,.23);
      box('smooth',cream,m-1.07,m+1.07,.28,2.91,.02,.32);
      rect('smooth',red,m-.82,m+.82,.35,2.62,.34);
      face('smooth',cream,[point(m-1.23,2.92,.38),point(m+1.23,2.92,.38),point(m,3.46,.38)]);
      label(sign,l+(r-l)*.10,r-(r-l)*.10,eave-.57,eave+1.01,.20);
      obstruction(l,r,-12,.2,peak);
    }
    let prev=0;
    for(const [end,sign,style] of profiles){
      const l=width*prev,r=width*end,span=r-l,m=(l+r)*.5,wallTop=top-base;
      prev=end;
      if(['northAlley','southAlley','stagehouse'].includes(style)){
        const nearLeft=style==='northAlley', wrap=Math.min(10.8,span);
        const left=nearLeft?l:r-wrap,right=nearLeft?l+wrap:r;
        const start=style==='stagehouse'?l:nearLeft?right:l,stop=style==='stagehouse'?r:nearLeft?r:left;
        if(stop>start){
          rect('brick',rgb(0xab9a8d),start,stop,-.18,wallTop,.07,[[0,0],[(stop-start)/1.92,0],[(stop-start)/1.92,wallTop/1.92],[0,wallTop/1.92]]);
          box('smooth',rgb(0x99968f),start,stop,-.15,.41,.075,.13);
          box('smooth',rgb(0x57544a),start,stop,wallTop-.25,wallTop-.10,.075,.18);
          box('smooth',rgb(0xb1a99b),start,stop,wallTop-.05,wallTop+.26,.075,.23);
          for(let u=start+3.8;u<stop-1.1;u+=12.7){
            box('smooth',rgb(0x685f54),u-.66,u+.66,.02,2.25,.085,.15);
            rect('smooth',rgb(0x797267),u-.56,u+.56,.11,2.14,.157);
            box('smooth',bronze,u-.43,u-.30,.94,.99,.16,.2);
            box('smooth',rgb(0x8b8a7a),u+.81,u+.91,.17,wallTop-.15,.085,.21);
            rect('smooth',rgb(0x514d43),u+.82,u+1.55,3.93,4.52,.17);
            for(let y=4.00;y<4.49;y+=.10)rect('smooth',rgb(0x898579),u+.85,u+1.52,y,y+.033,.19);
          }
        }
        if(style!=='stagehouse'){
          const uv=nearLeft?full:[[1,0],[0,0],[0,1],[1,1]];
          rect('theatreSide',white,left,right,-.11,wallTop+.26,.14,uv);
        }
        continue;
      }
      if(style==='works'){
        rect('works',white,l,r,-.06,wallTop+.32,.13,full);
        box('smooth',iron,l+.17,r-.17,2.95,3.09,.12,.78);
        obstruction(l+.17,r-.17,.12,.78,3.09);
        continue;
      }
      if(style==='colonial'||style==='exchange'){
        const facadeTop=style==='colonial'?wallTop+.25:wallTop+1.46;
        rect(style,rgb(0xe4e3db),l,r,-.12,facadeTop,.11,full);
        if(style==='colonial'){
          // Each real sign faces down one approach. They meet at the silver nose of the canopy.
          const half=span*.207,depth=3.0,y=3.18,crown=y+2.22, boardTop=y+1.42;
          const rim=[[m-half,.12],[m-.24,depth],[m+.24,depth],[m+half,.12]];
          const metal=rgb(0xbac1bf);
          for(const [start,end] of [[rim[0],rim[1]],[rim[2],rim[3]]]){
            const [u1,d1]=start,[u2,d2]=end;
            face('marqueePhoto',white,[point(u1,y,d1),point(u2,y,d2),point(u2,crown,d2),point(u1,crown,d1)],full);
            // Small incandescent lamps sit proud of the folded metal rim.
            const distance=Math.hypot(u2-u1,d2-d1),count=Math.floor(distance/.19);
            const outward=(u2-u1)/distance,side=-(d2-d1)/distance;
            for(let j=0;j<count;j++){
              const t=(j+.5)/count,cu=u1+(u2-u1)*t+side*.09,cd=d1+(d2-d1)*t+outward*.09;
              const center=point(cu,y+.008,cd);
              for(let k=0;k<6;k++){
                const a=k*Math.PI/3,b=a+Math.PI/3;
                face('marqueeLamp',white,[center,point(cu+Math.cos(a)*.039,y-.030,cd+Math.sin(a)*.039),point(cu+Math.cos(b)*.039,y-.030,cd+Math.sin(b)*.039)]);
              }
            }
            face('smooth',metal,[point(u1,y-.085,d1),point(u2,y-.085,d2),point(u2,y+.015,d2),point(u1,y+.015,d1)]);
          }
          rect('smooth',metal,m-.24,m+.24,y-.08,boardTop,depth);
          for(const h of [y-.075,boardTop-.07])face('smooth',metal,rim.map(([u,d])=>point(u,h,d)));
          const footprint=rim.map(([u,d])=>{const p=point(u,0,d); return [p[0],p[2]];});
          clearRoof(footprint,base+crown);
        }
        continue;
      }
      if(style==='gable'){gabled(l,r,wallTop,sign);continue;}
      const [wallColor,shopColor]=palettes[style]||palettes.red;
      const body=rgb(wallColor),trim=rgb(shopColor),shopTop=style==='kings'||style==='perch'?3.2:3.7;
      const tall={colony:15.7,cityhall:14.8,square:12.4,bank:11.7,stage:11.4,sweet:11.4,
        ashuelot:16.6,chamber:13.4,chamberlain:13.8};
      const height=Math.max(wallTop,tall[style]||0);
      flyRoof(l,r,height,wallTop,style==='colony'?16:11.7);
      const baseMat=style==='yellow'?'paintedSiding':style==='stone'?'masonry':'brick';
      rect(baseMat,body,l,r,-.25,height,.047,[[0,0],[span/1.58,0],[span/1.58,height/1.58],[0,height/1.58]]);
      const upper=height-shopTop-.65;
      const historicUpper=['pour','chamberlain','ashuelot','chamber'].includes(style);
      if(historicUpper){
        rect(style,white,l,r,shopTop-.06,height+.38,.105,full);
      }else if(style==='lane'){
        rect('lane',rgb(0xe9e6de),l,r,shopTop,height,.095,[[0,0],[Math.ceil(span/6.9),0],[Math.ceil(span/6.9),1],[0,1]]);
      }else if(upper>1.3){
        const floors=style==='redarch'?2:Math.max(1,Math.min(4,Math.round(upper/3.2)));
        const columns=Math.max(1,Math.round(span/(style==='redarch'?3.65:3.03)));
        for(let row=0;row<floors;row++)for(let c=0;c<columns;c++){
          const colW=span/columns,t=(c+.5)*colW;
          const lo=shopTop+.55+row*upper/floors;
          const hi=lo+Math.min(2.31,upper/floors*.77);
          windowBay(l+t,lo,hi,Math.min(1.65,colW*.53),row===floors-1&&['redarch','colony','cityhall','square'].includes(style),(row*3+c+(sign??3))%16);
        }
      }
      if(!historicUpper){
        box('smooth',bronze,l,r,height-.36,height-.18,.05,.24);
        box('smooth',cream,l-.035,r+.035,height-.15,height+.10,.06,.41);
      }
      if(['redarch','market','square','cityhall','colony','stage'].includes(style)){
        for(let u=l+.23;u<r-.15;u+=.58)box('smooth',cream,u-.072,u+.072,height-.39,height-.11,.05,.21);
      }
      if(style==='colony'){
        // A slate mansard, lead ridge and gabled dormers break the long shared roof polygon.
        const rise=3.25,depth=12;
        const near=.28,crest=-1.65;
        face('shingle',rgb(0x637070),[point(l,height,near),point(r,height,near),point(r,height+rise,crest),point(l,height+rise,crest)],[[0,0],[span/3,0],[span/3,1],[0,1]]);
        face('smooth',bronze,[point(l,height+rise,crest),point(r,height+rise,crest),point(r,height+rise,-depth),point(l,height+rise,-depth)]);
        for(const edge of [l,r])face('shingle',rgb(0x686c68),[point(edge,height,.21),point(edge,height,-depth),point(edge,height+rise,-depth),point(edge,height+rise,crest)],[[0,0],[4,0],[4,1],[0,1]]);
        for(let j=0;j<4;j++){
          const x=l+span*(j+.5)/4;
          box('smooth',cream,x-.72,x+.72,height+.18,height+1.72,-.93,.09);
          rect('glass',rgb(0x586c70),x-.49,x+.49,height+.34,height+1.54,.11);
          face('smooth',cream,[point(x-.90,height+1.69,.18),point(x+.90,height+1.69,.18),point(x,height+2.42,.18)]);
        }
        obstruction(l,r,-depth,near,height+rise);
      }
      const door=Math.min(1.32,span*.15),mark=m+span*.16;
      box('smooth',trim,l+.12,r-.12,.10,shopTop-.08,.05,.135);
      const display=['coffee','burger','perch','kings','sweet','pour'].includes(style)?'cafeDisplay':'shopDisplay';
      function windowUV(a,b,low,hi){
        const u0=(a-l)/span,u1=(b-l)/span,v0=(low-.56)/2.23,v1=(hi-.56)/2.23;
        return [[u0,v0],[u1,v0],[u1,v1],[u0,v1]];
      }
      const displays=[[l+.28,mark-door*.58],[mark+door*.58,r-.27]];
      for(let k=0;k<displays.length;k++){
        const [start,stop]=displays[k];
        if(stop-start<.35)continue;
        const panes=Math.max(1,Math.round((stop-start)/2.5));
        for(let j=0;j<panes;j++){
          const a=start+(stop-start)*j/panes+.035,b=start+(stop-start)*(j+1)/panes-.035;
          rect(display,glass,a,b,.56,2.79,.147,windowUV(a,b,.56,2.79));
          rect('smooth',cream,a,b,2.41,2.46,.171);
        }
        box('smooth',trim,start,stop,.32,.53,.10,.24);
      }
      box('smooth',bronze,mark-door*.5,mark+door*.5,.11,2.74,.06,.153);
      rect(display,glass,mark-door*.40,mark+door*.40,.48,2.55,.166,windowUV(mark-door*.40,mark+door*.40,.48,2.55));
      box('smooth',cream,mark+door*.28,mark+door*.32,.90,1.38,.16,.21);
      const band=Math.min(shopTop-.03,3.68);
      if(style==='pour'){
        const f=l+span*.47, red=rgb(0x8f4034);
        for(const stem of [l+.17,l+span*.20,f-.11])box('smooth',red,stem-.10,stem+.10,.18,3.38,.13,.22);
        box('smooth',red,l+.08,f,.06,.49,.13,.24);
        box('smooth',red,l+.08,f,2.82,3.62,.13,.24);
        const entrance=l+span*.20;
        box('smooth',red,entrance-.62,entrance+.62,.03,2.81,.14,.24);
        rect('shopDisplay',glass,entrance-.47,entrance+.47,.48,2.60,.26,tileUV(2,4,4));
        label(sign,f+.14,r-.18,band-.70,band,.217);
      }else if(sign!=null)label(sign,l+.20,r-.20,band-.70,band,.217);
      if(style==='coffee'){
        label(15,mark-door*.5,mark+door*.5,2.65,2.94,.244);
        blade(sign,l+span*.32,4.01,true);
      }
      if(style==='market')blade(sign,l+span*.38,4.39,false);
      if(style==='kings')rect('kings',rgb(0xeee6da),l+.2,l+span*.57,.21,3.41,.225,full);
      if(style==='perch'||style==='copper'||style==='stage'||style==='dark'||style==='stone'){
        awning(l+.18,r-.18,style==='perch'?2.98:3.00,style==='copper'?rgb(0x986b4f):trim,style==='perch',style==='perch'?1.55:1.02);
      }
      if(style==='lane'||style==='cream'||style==='market')awning(l+.45,l+span*.48,3.03,style==='lane'?rgb(0x794149):trim,false,.85);
    }
    return true;
  }
  return render;
};
