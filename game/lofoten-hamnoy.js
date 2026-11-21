// Hamnøy, Moskenes. OSM building axes and bridge centerline; attribution in regional-field-fixtures-credits.txt.
(()=>{
  const buildings=[
    [4027.7,3022.6,16.6,11.5,-3.0913,"h"],
    [3968.4,3036.3,15.8,9.0,-0.6689,"h"],
    [3847.0,2945.2,14.7,10.2,-0.547,"u"],
    [3879.5,2787.8,25.1,20.5,2.0238,"c"],
    [3830.0,2850.5,16.5,10.2,-1.1644,"h"],
    [3830.7,2917.5,19.7,11.1,-1.0602,"h"],
    [3883.8,2917.9,51.6,15.2,-2.2545,"u"],
    [4007.3,2639.2,14.5,9.2,0.8891,"h"],
    [3863.0,3034.1,10.3,7.2,-2.127,"c"],
    [3944.4,2972.1,10.6,5.8,-0.909,"u"],
    [3855.1,2875.2,25.5,6.2,-2.808,"c"],
    [3892.5,2951.8,14.8,6.0,-1.0458,"c"],
    [3834.2,2889.3,12.7,9.6,2.2875,"h"],
    [3854.2,2884.9,14.8,5.6,-2.7312,"c"],
    [3838.3,3002.1,9.8,7.1,2.5773,"c"],
    [3869.8,2957.8,14.9,10.9,0.6283,"h"],
    [3904.0,2939.1,14.8,11.9,-0.6367,"u"],
    [3863.6,2991.1,10.5,8.3,-0.8673,"g"],
    [3942.5,3047.8,14.1,9.8,-0.5389,"h"],
    [3977.7,3008.5,8.6,7.5,0.9874,"h"],
    [3951.8,3072.2,8.6,6.7,-0.592,"g"],
    [3927.0,3067.1,12.3,9.0,2.6088,"h"],
    [3940.6,2992.4,11.3,9.5,-0.8017,"h"],
    [3854.9,2866.4,19.5,5.5,-3.0197,"c"],
    [3874.4,2867.4,29.4,27.6,1.725,"w"],
    [3930.2,3083.7,6.0,4.6,-0.4946,"u"],
    [3907.5,3052.3,8.3,8.0,-0.4016,"h"],
    [3848.5,3027.6,10.2,7.1,2.5869,"c"],
    [3818.0,2875.4,15.0,10.6,-2.8367,"u"],
    [3802.8,2872.6,13.2,7.2,0.3423,"u"],
    [3841.8,3014.9,8.5,7.2,2.6212,"c"],
    [3955.4,2975.6,10.0,5.9,-0.8141,"u"],
    [3918.8,3038.8,9.7,7.2,0.9851,"u"],
    [3832.3,2949.5,16.4,12.4,0.9065,"c"],
    [3913.4,2951.3,20.2,14.0,-2.2001,"u"],
    [3883.8,2938.7,14.7,11.3,-2.5157,"h"],
    [3858.3,2771.1,10.5,5.9,2.0709,"c"],
    [3859.4,2788.6,19.9,6.5,-1.1766,"c"],
    [3853.4,2843.1,21.4,5.8,-2.9826,"c"],
    [3867.1,2752.7,9.3,6.3,-1.4146,"c"],
    [3892.5,2765.1,21.6,8.0,-1.1195,"c"],
    [3852.0,2807.5,8.8,5.7,-2.749,"c"],
    [3851.0,2800.6,10.2,5.9,0.3422,"c"],
    [3885.4,2755.7,9.2,6.2,-1.0828,"c"],
    [3867.3,2776.7,10.4,6.0,0.4946,"c"],
    [3876.8,2753.8,9.3,6.1,-1.0588,"c"],
    [3856.0,2909.0,9.6,5.5,-0.7043,"c"],
    [3853.0,2828.3,21.2,5.7,-1.1498,"c"],
    [4054.8,2841.9,13.6,7.9,1.3423,"h"],
    [4065.6,2933.2,10.5,6.1,-1.8777,"c"],
    [4059.7,2906.4,9.1,6.2,-0.4298,"c"],
    [4058.3,2918.2,11.5,4.9,1.1527,"w"],
    [3859.7,2897.3,10.1,5.8,0.9532,"c"],
    [3807.8,2849.0,6.0,4.9,0.4924,"g"],
    [3857.5,2921.7,14.3,5.9,0.8837,"c"],
    [4059.8,2860.4,24.0,14.8,-0.2115,"w"],
    [3975.1,2540.1,13.5,9.4,0.7496,"h"],
    [4027.2,2530.3,9.1,8.8,0.7717,"h"],
    [4033.1,2557.3,14.3,13.1,0.7671,"h"],
    [3995.2,2699.6,13.9,12.2,-0.5835,"u"],
    [4054.9,2539.3,12.6,9.2,1.0159,"h"],
    [3977.4,2695.2,14.7,11.1,-0.6175,"u"],
    [3987.6,2686.2,11.1,9.2,0.9312,"u"],
    [3980.4,2676.8,11.0,9.3,1.4685,"u"],
    [3968.1,2521.7,9.7,7.3,3.1145,"h"],
    [4021.7,2500.9,13.3,11.0,-0.5418,"h"],
    [3985.6,2526.1,10.3,8.0,-0.4118,"h"],
    [3996.8,2513.5,13.0,5.3,2.5693,"h"],
    [3881.5,2967.4,11.7,8.7,2.0862,"g"],
    [3988.5,2722.2,9.9,6.3,2.7781,"u"],
    [3993.1,2728.1,10.8,6.3,2.7857,"u"],
    [4003.7,2755.6,14.0,8.3,2.7431,"c"],
    [4000.9,2745.1,13.7,8.3,2.9652,"c"],
    [3998.0,2736.5,11.8,8.1,-0.1752,"u"],
    [3983.3,2579.3,12.3,6.7,-0.5663,"c"],
    [4062.8,2839.9,13.6,7.4,1.3541,"u"],
    [4058.7,2869.5,14.7,10.8,-0.2091,"u"],
    [3814.1,2917.2,8.4,6.6,-1.0019,"g"],
    [4048.0,2843.5,13.6,6.1,1.3425,"u"],
    [3990.6,3005.9,6.8,4.4,-0.584,"g"],
    [3981.4,3037.6,7.9,4.6,-0.6214,"g"],
    [3831.5,2835.8,9.3,7.1,0.3018,"c"],
    [3821.4,2891.1,10.4,6.1,-1.3055,"c"],
    [3874.9,2808.2,17.3,13.0,1.9037,"c"],
    [3843.8,2818.9,9.4,6.3,-1.1794,"c"],
    [3846.7,2811.8,8.0,5.2,-2.7288,"c"],
    [4016.4,2582.1,3.7,3.4,-0.791,"u"],
    [3844.0,2766.9,11.9,8.4,1.9896,"c"],
    [3838.5,2737.1,11.9,8.4,-0.3494,"c"],
    [3842.9,2749.8,11.9,8.4,1.2587,"c"],
    [3825.8,2744.9,11.9,8.4,1.4177,"c"],
    [3831.6,2759.6,11.9,8.4,1.2587,"c"],
    [3815.7,2754.4,11.9,8.4,1.4177,"c"],
    [3821.1,2768.3,11.9,8.4,1.266,"c"],
    [3811.5,2776.7,11.9,8.4,-1.8848,"c"],
    [3803.3,2764.0,11.9,8.4,-0.7792,"c"],
    [3801.1,2791.5,11.9,8.4,2.0607,"c"],
    [3807.7,2821.4,11.9,8.4,-2.1188,"c"],
    [3813.7,2808.8,11.9,8.4,-2.1191,"c"],
    [3823.9,2969.3,8.2,5.2,-0.518,"u"],
    [3829.5,2979.3,8.2,5.2,-0.5178,"u"],
    [3834.4,2990.6,8.2,5.2,2.6236,"u"],
    [3990.9,2988.5,12.1,5.7,2.4548,"u"]
  ];
  const crossing=[[3626.5,3092.2],[3646.8,3090.3],[3688.1,3087.8],[3716.4,3086.8],[3733.1,3086.3],[3749.0,3086.7],[3767.8,3087.8],[3780.9,3089.1],[3829.7,3094.4],[3854.5,3097.6],[3868.3,3099.6]];
  const approaches=[[[3893.8,3101.7],[3905.2,3101.8],[3913.8,3101.4],[3924.9,3100.2],[3928.1,3099.9],[3933.9,3098.8],[3940.2,3097.6],[3954.1,3094.4],[3968.4,3090.0],[3986.5,3083.2],[3989.9,3081.5]],[[3989.9,3081.5],[3996.8,3078.1],[4002.4,3074.7],[4012.9,3067.3],[4025.8,3056.8],[4032.1,3050.9],[4038.7,3043.6],[4051.8,3025.3],[4059.3,3012.8],[4064.5,3003.0],[4066.8,2998.8],[4070.7,2989.7],[4073.5,2983.3],[4076.9,2974.2],[4081.2,2954.8],[4083.5,2927.4],[4083.7,2920.9],[4083.3,2911.9],[4082.2,2900.4],[4079.3,2880.2],[4074.8,2856.2],[4067.8,2814.0],[4064.2,2782.8],[4063.8,2777.3],[4063.6,2765.7],[4063.7,2741.1],[4065.3,2726.3],[4067.7,2713.3],[4071.5,2695.5],[4076.4,2674.7],[4080.8,2656.4],[4083.8,2641.6],[4086.4,2628.0]],[[3868.3,3099.6],[3878.7,3100.7],[3886.3,3101.4],[3893.8,3101.7]],[[4086.4,2628.0],[4088.5,2614.3],[4090.0,2602.1],[4090.6,2592.0],[4090.8,2582.7],[4090.3,2570.6],[4089.1,2556.3]]];

  window.addHamnoyHarbor=(T,scene,ground,water)=>{
    const group=new T.Group();group.name='Hamnøy fishing village and Breisundet bridge';scene.add(group);
    const layers=[{name:'timber siding',map:'building-clapboard.webp'},{name:'ribbed metal roofs',map:'lakeside-metal.webp'},{name:'trim, decks and concrete'}];
    for(const layer of layers)Object.assign(layer,{points:[],uv:[],colors:[]});
    const pigment=new T.Color();
    function face(layer,vertices,color,scaleU=1,scaleV=1){
      const {points,uv,colors}=layers[layer],width=Math.hypot(...vertices[1].map((n,i)=>n-vertices[0][i]))*scaleU;
      const height=Math.hypot(...vertices.at(-1).map((n,i)=>n-vertices[0][i]))*scaleV;
      const coords=[[0,0],[width,0],[width,height],[0,height]];
      pigment.setHex(color);
      for(const n of (vertices.length===4?[0,1,2,0,2,3]:[0,1,2])){
        points.push(...vertices[n]);uv.push(...(layer===0?[coords[n][1],coords[n][0]]:coords[n]));colors.push(pigment.r,pigment.g,pigment.b);
      }
    }
    function box(P,x0,y0,z0,x1,y1,z1,color){
      const a=P(x0,y0,z0),b=P(x1,y0,z0),c=P(x1,y0,z1),d=P(x0,y0,z1);
      const A=P(x0,y1,z0),B=P(x1,y1,z0),C=P(x1,y1,z1),D=P(x0,y1,z1);
      for(const v of [[b,a,A,B],[a,d,D,A],[d,c,C,D],[c,b,B,C],[B,A,D,C]])face(2,v,color);
    }
    const bins=new Map(),key=(x,z)=>Math.floor(x/36)*2048+Math.floor(z/36);
    function index(body,reach){
      for(let x=Math.floor((body.x-reach)/36);x<=Math.floor((body.x+reach)/36);x++)
        for(let z=Math.floor((body.z-reach)/36);z<=Math.floor((body.z+reach)/36);z++){
          const k=x*2048+z;if(!bins.has(k))bins.set(k,[]);bins.get(k).push(body);
        }
    }
    const reds=[0xa64536,0x9f3b2d,0xb04d3b,0x973e31,0xad4436],roofs=[0xa9adb0,0x858789,0xb3b7b6,0x969c9e],whites=[0xdfd8ca,0xd6cfc1,0xe0dbcf];
    for(const [i,record] of buildings.entries()){
      const [x,z,length,width,yaw,kind]=record,c=Math.cos(yaw),s=Math.sin(yaw),l=length/2,w=width/2;
      const xy=(u,v)=>[x+c*u-s*v,z+s*u+c*v];
      const corners=[[-l,-w],[l,-w],[-l,w],[l,w],[0,0]].map(pair=>ground(...xy(...pair))).sort((a,b)=>a-b);
      const floor=Math.max(water+1.9,corners[3]+.21), tall=kind==='w'||kind==='u'&&width>11;
      const h=kind==='g'?2.35:tall?4.85:kind==='h'&&width>8?4.45:3.0+(i%4)*.1;
      const rise=width*(tall?.22:.32),red=kind==='c'||kind==='u'&&i%4!==0||kind==='w'&&i%3===0;
      const paint=red?reds[i%reds.length]:kind==='g'?0x98634a:whites[i%whites.length],trim=0xdfd9c8,roof=roofs[i%roofs.length];
      const P=(u,y,v)=>[x+c*u-s*v,floor+y,z+s*u+c*v];
      const foundation=kind==='c'&&corners[0]<water+2.5;
      for(const v of [-w,w]){
        face(0,[P(-l,0,v),P(l,0,v),P(l,h,v),P(-l,h,v)],paint,.46,.42);
        // Flood tides pass underneath the waterfront cabins; sheltered inland structures have a continuous sill.
        if(!foundation)face(2,[P(-l,corners[0]-floor-.24,v),P(l,corners[0]-floor-.24,v),P(l,.03,v),P(-l,.03,v)],0x67645f);
        const side=Math.sign(v),out=v+side*.035,n=Math.max(1,Math.round(length/(kind==='w'?4.6:3.9)));
        for(let k=0;k<n;k++){
          const u=-l+(k+.5)*length/n,ww=Math.min(kind==='w'?.85:.66,length/n*.27);
          if(kind==='g'&&k!==0)continue;
          const panel=(u0,y0,u1,y1,d,color)=>face(2,[P(u0,y0,out+side*d),P(u1,y0,out+side*d),P(u1,y1,out+side*d),P(u0,y1,out+side*d)],color);
          const door=kind!=='w'&&side===1&&k===0&&n>1;
          if(door){panel(u-.52,0,u+.52,2.12,0,trim);panel(u-.44,.04,u+.44,2.05,.012,0x705345);panel(u-.30,1.15,u+.30,1.95,.024,0x54626a);continue;}
          panel(u-ww,1.0,u+ww,2.22,0,trim);
          panel(u-ww+.085,1.09,u-.035,2.13,.012,i%4===2&&k%3===0?0xffb778:0x7e9398);
          panel(u+.035,1.09,u+ww-.085,2.13,.012,i%4===2&&k%3===0?0xf6bb8e:0x697f85);
          panel(u-ww,1.76,u+ww,1.80,.024,trim);
        }
        for(const u of [-l+.08,l-.08]){
          face(2,[P(u-.085,0,out),P(u+.085,0,out),P(u+.085,h,out),P(u-.085,h,out)],trim);
        }
        if(foundation){
          const n=Math.max(2,Math.ceil(length/3.1));
          for(let k=0;k<=n;k++){
            const u=-l+.27+(length-.54)*k/n,bottom=Math.max(-4,Math.min(-.05,ground(...xy(u,v))-.35-floor));
            box(P,u-.1,bottom,v-.1,u+.1,0,v+.1,0x50493c);
          }
        }
        const over=.2,ridge=rise+h,eave=h-rise*.20/w;
        face(1,[P(-l-over,eave,v+side*over),P(l+over,eave,v+side*over),P(l+over,ridge,0),P(-l-over,ridge,0)],roof,.23,.21);
        face(2,[P(-l-over,eave-.13,v+side*over),P(l+over,eave-.13,v+side*over),P(l+over,eave,v+side*over),P(-l-over,eave,v+side*over)],0x9b9b90);
      }
      for(const u of [-l,l]){
        face(0,[P(u,0,-w),P(u,0,w),P(u,h,w),P(u,h,-w)],paint,.46,.42);
        face(0,[P(u,h,-w),P(u,h,w),P(u,h+rise,0)],paint,.46,.42);
        const outside=u+Math.sign(u)*.035,frame=(a,b,y1,y2,d,color)=>face(2,[P(outside+Math.sign(u)*d,y1,a),P(outside+Math.sign(u)*d,y1,b),P(outside+Math.sign(u)*d,y2,b),P(outside+Math.sign(u)*d,y2,a)],color);
        if(kind!=='g')for(const v of [-w*.46,w*.46]){frame(v-.49,v+.49,1.04,2.2,0,trim);frame(v-.40,v+.40,1.13,2.11,.015,0x62727a);}
      }
      if(kind==='c'||kind==='h'){
        const u=l*.46,v=w*.27,base=h+rise*(1-Math.abs(v)/w)-.15;
        box(P,u-.22,base,v-.24,u+.22,base+.92,v+.24,0x5e5a56);
      }
      index({x,z,c,s,l:l+.2,w:w+.2,top:floor+h+rise,rise,wRoof:w+.2},Math.hypot(l+.2,w+.2));
    }

    const widths={deck:3.26,sidewalk:1.25},stations=[0];
    for(let i=1;i<crossing.length;i++)stations.push(stations.at(-1)+Math.hypot(crossing[i][0]-crossing[i-1][0],crossing[i][1]-crossing[i-1][1]));
    const total=stations.at(-1),endA=ground(...crossing[0])+.19,endB=ground(...crossing.at(-1))+.19;
    function bridgeTop(t){
      // A gentle road crest joins the inspected ground at the abutments; the shipping channel has 18 m of headroom at its centre.
      const u=t/total,mid=water+18+1.78;
      return endA*(1-u)+endB*u+(mid-(endA+endB)/2)*4*u*(1-u);
    }
    const thickness=t=>1.78+2.25*Math.pow(Math.max(0,1-Math.min(Math.abs(t-total*.25),Math.abs(t-total*.75))/(total*.24)),2);
    function section(t){
      let i=0;while(i+1<stations.length-1&&stations[i+1]<t)i++;
      const [x,z]=crossing[i],dx=crossing[i+1][0]-x,dz=crossing[i+1][1]-z,length=stations[i+1]-stations[i],u=(t-stations[i])/length;
      return (v,y=0)=>[x+dx*u-dz/length*v,bridgeTop(t)+y,z+dz*u+dx/length*v];
    }
    const parts=84,edge=widths.deck,lip=-edge+widths.sidewalk,concrete=0x93958d;
    for(let i=0;i<parts;i++){
      const a=i*total/parts,b=(i+1)*total/parts,P=section(a),Q=section(b),at=thickness(a),bt=thickness(b);
      face(2,[P(lip),Q(lip),Q(edge),P(edge)],0x5a5e5e);
      face(2,[P(-edge,.14),Q(-edge,.14),Q(lip,.14),P(lip,.14)],0xa09f93);
      face(2,[P(lip),Q(lip),Q(lip,.14),P(lip,.14)],concrete);
      for(const side of [-1,1]){
        const v=edge*side;
        face(2,[P(v),Q(v),Q(v,-.52),P(v,-.52)],concrete);
        face(2,[P(v,-.52),Q(v,-.52),Q(side*1.8,-.58),P(side*1.8,-.58)],0x7c807b);
        face(2,[P(side*1.8,-.58),Q(side*1.8,-.58),Q(side*1.35,-bt),P(side*1.35,-at)],0x81867e);
        for(const y of [.51,1.05])face(2,[P(v,y),Q(v,y),Q(v,y+.08),P(v,y+.08)],0xa8afa8);
        if(i%2===0){const post=section(a+.09);face(2,[P(v),post(v),post(v,1.12),P(v,1.12)],0xb2b4aa);}
      }
      face(2,[P(-1.35,-at),Q(-1.35,-bt),Q(1.35,-bt),P(1.35,-at)],0x777c76);
      // The single reversible lane has no centre stripe. White edge bands sit at both road margins.
      for(const v of [lip+.10,edge-.19])face(2,[P(v,.025),Q(v,.025),Q(v+.10,.025),P(v+.10,.025)],0xbfbdb1);
    }
    for(const t of [total*.25,total*.75]){
      const A=section(t-.85),B=section(t+.85),bottom=water-2-bridgeTop(t),top=-thickness(t)+.06;
      for(const side of [-1,1])face(2,[A(side*1.65,bottom),B(side*1.65,bottom),B(side*1.65,top),A(side*1.65,top)],concrete);
      for(const P of [A,B])face(2,[P(-1.65,bottom),P(1.65,bottom),P(1.65,top),P(-1.65,top)],concrete);
    }
    for(const path of approaches){
      for(let i=1;i<path.length;i++){
        const [x,z]=path[i-1],[u,v]=path[i],L=Math.hypot(u-x,v-z),nx=-(v-z)/L,nz=(u-x)/L,n=Math.ceil(L/3);
        const vertex=(t,offset)=>{const px=x+(u-x)*t+offset*nx,pz=z+(v-z)*t+offset*nz;return [px,ground(px,pz)+.105,pz];};
        for(let j=0;j<n;j++)face(2,[vertex(j/n,-edge),vertex((j+1)/n,-edge),vertex((j+1)/n,edge),vertex(j/n,edge)],0x555956);
      }
    }
    for(const layer of layers){
      const geometry=new T.BufferGeometry();
      for(const [key,arr,size] of [['position',layer.points,3],['color',layer.colors,3],['uv',layer.uv,2]])geometry.setAttribute(key,new T.Float32BufferAttribute(arr,size));
      geometry.computeVertexNormals();geometry.computeBoundingSphere();
      const mat=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});
      if(layer.map){mat.map=new T.TextureLoader().load(window.aerieAssetURL?.(layer.map)||layer.map);mat.map.colorSpace=T.SRGBColorSpace;mat.map.wrapS=mat.map.wrapT=T.RepeatWrapping;mat.map.anisotropy=4;}
      const mesh=new T.Mesh(geometry,mat);mesh.name='Hamnøy '+layer.name;mesh.receiveShadow=true;group.add(mesh);
    }
    group.userData.buildings=buildings.length;group.userData.mainSpan=120;group.userData.channelHeadroom=18;
    return (x,z,altitude)=>{
      if(x<3619||x>4380||z<2440||z>3280)return -Infinity;
      let top=-Infinity;
      for(const p of bins.get(key(x,z))||[]){
        const dx=x-p.x,dz=z-p.z,along=dx*p.c+dz*p.s,across=dz*p.c-dx*p.s;
        if(Math.abs(along)<=p.l&&Math.abs(across)<=p.w)top=Math.max(top,p.top-p.rise*Math.abs(across)/p.wRoof);
      }
      if(x<3622||x>3874||z<3081||z>3106)return top;
      for(let i=1;i<crossing.length;i++){
        const [a,b]=crossing[i-1],dx=crossing[i][0]-a,dz=crossing[i][1]-b,L=stations[i]-stations[i-1];
        const along=((x-a)*dx+(z-b)*dz)/L,across=((z-b)*dx-(x-a)*dz)/L;
        if(along<0||along>L||Math.abs(across)>edge)continue;
        const t=stations[i-1]+along,deck=bridgeTop(t);
        const pier=Math.abs(across)<1.65&&Math.min(Math.abs(t-total*.25),Math.abs(t-total*.75))<.86;
        if(pier||altitude===undefined||altitude>deck-thickness(t)-.28)top=Math.max(top,deck+(Math.abs(across)>edge-.12?1.12:across<lip?.14:0));
      }
      return top;
    };
  };
})();
