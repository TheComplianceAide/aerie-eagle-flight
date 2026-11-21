// El Capitan Meadow, the summer-drying opening on the north bank of the Merced.
// Each 4 m sample comes from the NPS vegetation polygons and registered USDA imagery.
window.readElCapitanField=function readElCapitanField(){
  const cols=260,rows=140,left=-1520,top=800,scale=4;
  const coded=atob(window.elCapMeadowRuns),field=new Uint8Array(cols*rows);
  let offset=0;
  for(let i=0;i<coded.length;i+=2){
    const count=coded.charCodeAt(i);
    field.fill(coded.charCodeAt(i+1),offset,offset+count);offset+=count;
  }
  function sampleField(x,z){
    const col=Math.floor((x-left)/scale),row=Math.floor((z-top)/scale);
    return col<0||col>=cols||row<0||row>=rows?0:field[col+cols*row];
  }
  function cover(x,z){return (sampleField(x,z)>>4)/15;}
  return {cover};
};
