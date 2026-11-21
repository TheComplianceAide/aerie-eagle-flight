// A finite lake can sample only a portion of the full-size reflection.
// The hull encloses every surveyed shoreline vertex. Clip it before the
// perspective divide so a shore behind the eagle cannot invert the bounds.
window.makeLakeReflectionDomain=function(T,geometry,width,height){
  const pos=geometry.getAttribute('position'),points=[];
  for(let i=0;i<pos.count;i++)points.push([pos.getX(i),pos.getY(i)]);
  points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  function half(start,end,step){
    const out=[];
    for(let i=start;i!==end;i+=step){
      const p=points[i];while(out.length>1&&cross(out[out.length-2],out[out.length-1],p)<=0)out.pop();
      out.push(p);
    }
    out.pop();return out;
  }
  const hull=half(0,points.length,1).concat(half(points.length-1,-1,-1));
  const a=new Float64Array((hull.length+10)*3),b=new Float64Array(a.length);
  const lakeProjection=new T.Matrix4(),clipProjection=new T.Matrix4(),frustum=new T.Frustum();
  const tiles=[],hidden=[];
  function planeDistance(k,x,y,w,near){
    switch(k){case 0:return w-near;case 1:return x+w;case 2:return w-x;case 3:return y+w;default:return w-y;}
  }
  function bounds(matrix,near,pad){
    const m=matrix.elements;
    let n=hull.length,src=a,dst=b;
    for(let i=0;i<n;i++){
      const [x,y]=hull[i];src[i*3]=m[0]*x+m[4]*y+m[12];
      src[i*3+1]=m[1]*x+m[5]*y+m[13];src[i*3+2]=m[3]*x+m[7]*y+m[15];
    }
    for(let k=0;k<5;k++){
      if(n<3)return null;
      let write=0,prev=3*(n-1),d0=planeDistance(k,src[prev],src[prev+1],src[prev+2],near);
      for(let i=0;i<n;i++){
        const p=i*3,d1=planeDistance(k,src[p],src[p+1],src[p+2],near);
        if((d0<0)!==(d1<0)){
          const t=d0/(d0-d1);
          for(let j=0;j<3;j++)dst[write++]=src[prev+j]+t*(src[p+j]-src[prev+j]);
        }
        if(d1>=0){dst[write++]=src[p];dst[write++]=src[p+1];dst[write++]=src[p+2];}
        prev=p;d0=d1;
      }
      n=write/3;const old=src;src=dst;dst=old;
    }
    if(n<3)return null;
    let left=1,right=-1,bottom=1,top=-1;
    for(let i=0;i<3*n;i+=3){
      const x=src[i]/src[i+2],y=src[i+1]/src[i+2];
      left=Math.min(left,x);right=Math.max(right,x);bottom=Math.min(bottom,y);top=Math.max(top,y);
    }
    // Padding is in texture coordinates. Allow another two texels for the
    // final filtered taps near the edges of the reflection texture.
    return [Math.max(-1,left-2*pad-4/width),Math.min(1,right+2*pad+4/width),
            Math.max(-1,bottom-2*pad-4/height),Math.min(1,top+2*pad+4/height)];
  }
  return {
    fit(scene,water,camera,heightAbove,distortion){
      lakeProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(water.matrixWorld);
      // The oblique lake clip changes only the projected Z row and leaves X,
      // Y and W intact. Use a near plane safely inside the main view.
      const pad=.004+Math.abs(distortion)*(.064+.50/Math.max(5,heightAbove));
      const r=bounds(lakeProjection,.001,pad);
      if(!tiles.length)scene.traverse(o=>{
        if(!o.isMesh||!o.frustumCulled||!o.userData.terrainCaster||o.isInstancedMesh||o.isSkinnedMesh)return;
        const g=o.geometry;if(!g.boundingBox)g.computeBoundingBox();
        if(g.boundingBox&&!g.boundingBox.isEmpty())tiles.push({mesh:o,box:g.boundingBox.clone().applyMatrix4(o.matrixWorld)});
      });
      if(r){
        const [l,h,d,u]=r;
        if(h-l>=1.99999&&u-d>=1.99999)return;
        clipProjection.set(2/(h-l),0,0,-(l+h)/(h-l),0,2/(u-d),0,-(d+u)/(u-d),0,0,1,0,0,0,0,1);
        clipProjection.multiply(camera.projectionMatrix).multiply(camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(clipProjection);
      }
      for(const item of tiles){
        if(item.mesh.visible&&(!r||!frustum.intersectsBox(item.box))){item.mesh.visible=false;hidden.push(item.mesh);}
      }
    },
    restore(){for(const mesh of hidden)mesh.visible=true;hidden.length=0;}
  };
};
