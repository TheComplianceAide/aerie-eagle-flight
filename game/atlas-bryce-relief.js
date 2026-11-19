// Surface of the Bryce Amphitheater from USGS Southern Utah QL1 lidar.
// The blue plane stores midpoint refinement decisions for the binary triangle mesh.
window.prepareBryceTerrain=async function prepareBryceTerrain(){
  if(window.bryceHighlands)return;
  const image=new Image();
  image.src=window.aerieAssetURL?.('atlas-bryce-lidar.png')||'atlas-bryce-lidar.png';
  await image.decode();
  const n=image.width,canvas=document.createElement('canvas');canvas.width=canvas.height=n;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
  const pixels=ctx.getImageData(0,0,n,n).data,heights=new Int16Array(n*n),splits=new Uint8Array(n*n);
  for(let i=0;i<heights.length;i++){
    heights[i]=(pixels[i*4]<<8)|pixels[i*4+1];splits[i]=pixels[i*4+2];
  }
  window.bryceHighlands={heights,splits,n};
};

window.addBryceEscarpment=function addBryceEscarpment(T,scene,material,height){
  const {splits,n}=window.bryceHighlands,span=2900,step=span/(n-1),size=128;
  for(let z0=0;z0<n-1;z0+=size)for(let x0=0;x0<n-1;x0+=size){
    const points=[],normals=[],indices=[],slots=new Int32Array((size+1)**2);
    slots.fill(-1);
    function vertex(ix,iz){
      const key=ix+iz*(size+1);if(slots[key]>=0)return slots[key];
      const id=points.length/3,x=(x0+ix)*step-span*.5,z=(z0+iz)*step-span*.5;
      const dx=height(x-step,z)-height(x+step,z),dz=height(x,z-step)-height(x,z+step);
      const inv=1/Math.hypot(dx,2*step,dz);
      points.push(x,height(x,z),z);normals.push(dx*inv,2*step*inv,dz*inv);
      return slots[key]=id;
    }
    function triangle(ax,az,bx,bz,cx,cz){
      const mx=(ax+bx)/2,mz=(az+bz)/2;
      if(Number.isInteger(mx)&&Number.isInteger(mz)&&splits[x0+mx+(z0+mz)*n]){
        triangle(cx,cz,ax,az,mx,mz);triangle(bx,bz,cx,cz,mx,mz);
      }else indices.push(vertex(ax,az),vertex(bx,bz),vertex(cx,cz));
    }
    triangle(0,0,size,size,size,0);triangle(size,size,0,0,0,size);
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points,3));
    g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));g.setIndex(indices);
    g.computeBoundingSphere();const rock=new T.Mesh(g,material);
    rock.name='Bryce Amphitheater · surveyed fins';scene.add(rock);
  }
};
