"""Bake a 1 m working surface from USGS original-resolution 0.5 m lidar.

Input is USGS_OPR_AK_SouthEastLandslides_D22_767733.tif, NAVD88 metres.
The modeled 0.18 m water plane registers to the sampled local shoreline stage
of 18.73 m NAVD88. Elevations above the
low shore are clipped and handed back to the original surveyed terrain.
"""
import argparse,base64,json
from pathlib import Path
from pyproj import Transformer
import numpy as np,rasterio
from rasterio.transform import from_origin
from rasterio.warp import reproject
from rasterio.enums import Resampling
from rasterio.features import rasterize,shapes
from affine import Affine
from shapely.geometry import Polygon,shape
from shapely.ops import unary_union
from scipy import ndimage
root=Path(__file__).resolve().parents[2]
cmd=argparse.ArgumentParser(description=__doc__);cmd.add_argument('tif',type=Path);args=cmd.parse_args()
x0,z0,x1,z1=-170,1426,332,1733
w,h=x1-x0+1,z1-z0+1
origin=np.round(Transformer.from_crs(4326,32608,always_xy=True).transform(-134.546,58.433))
t=from_origin(origin[0]+x0-.5,origin[1]-z0+.5,1,1)
out=np.full((h,w),np.nan,dtype='f')
with rasterio.open(args.tif) as ds:
 reproject(rasterio.band(ds,1),out,src_transform=ds.transform,src_crs=ds.crs,src_nodata=ds.nodata,dst_transform=t,dst_crs='EPSG:32608',dst_nodata=np.nan,resampling=Resampling.bilinear)
assert np.isfinite(out).all()
surface=18.73
# The 10 m image-derived flight shoreline represents a different water stage
# than the lidar's hydroflattened water. Across the angular shoreline sample
# x=140..255, z=1520..1570, its median lidar height is 18.732 m NAVD88.
# Preserve measured terrain gradients; align that observed edge to +0.18 m.
survey=json.loads((root/'game/alaska-survey.js').read_text().split('=',1)[1].strip().rstrip(';'))
edge=Polygon(survey['waterEdge']).buffer(0);mapped=Polygon(survey['shore']).buffer(0)
transform=Affine.translation(x0-.5,z0-.5)
# A land lidar raster can return a textured water surface. Across this cove
# those offshore fluctuations run within centimetres of the local lake stage.
# Retain terrain connected to the mapped bank and substantial isolated relief.
# In mapped open water, construct a submerged bed only away from that terrain.
water=rasterize([(mapped,1)],out_shape=out.shape,transform=transform,dtype='uint8').astype(bool)
labels,count=ndimage.label(out>surface+.12)
size=np.bincount(labels.ravel())
dry=np.bincount(labels.ravel(),weights=(~water).ravel(),minlength=count+1)
high=ndimage.maximum(out,labels=labels,index=np.arange(count+1))
solid=(size>=12)&((dry>=6)|(high>surface+1.6))
solid[0]=False
offshore=ndimage.distance_transform_edt(water&~solid[labels])
blend=np.clip((offshore-2.)/8.,0.,1.)
blend*=blend*(3.-2.*blend)
bed=surface-np.minimum(2.3,offshore*.095)
out=out+(np.minimum(out,bed)-out)*blend
quant=np.rint((out-(surface-.18)+2.5)*16).clip(0,255).astype('u1')
mask=np.uint8(out<surface+.08)
local=[]
for geom,value in shapes(mask,mask=mask.astype(bool),transform=transform):
    area=shape(geom)
    if area.area>12 and area.intersection(mapped).area>8:
        local.append(area.buffer(3).simplify(.6))
outline=edge.union(unary_union(local))
if outline.geom_type=='MultiPolygon':outline=max(outline.geoms,key=lambda g:g.area)
ring=json.dumps([[round(x,1),round(z,1)] for x,z in outline.exterior.coords],separators=(',',':'))
encoded=base64.b64encode(quant.tobytes()).decode()
code="""// USGS OPR AK Southeast Landslides D22, tile 767733. Source pixels 0.5 m,
// resampled to 1 m in the game's UTM 8N axes; local shoreline stage 18.73 m.
(()=>{
  window.mendenhallCoveWaterOutline=RING;
  const data=Uint8Array.from(atob('DATA'),c=>c.charCodeAt(0));
  const ramp=(a,b,t)=>{t=Math.max(0,Math.min(1,(t-a)/(b-a)));return t*t*(3-2*t);};
  window.mendenhallCoveGround=(x,z,base)=>{
    const u=x-(X0),v=z-(Z0),edge=Math.min(u,v,W-1-u,H-1-v);
    if(edge<=0)return base;
    const i=Math.floor(u),j=Math.floor(v),s=u-i,t=v-j,k=j*W+i;
    const y=((1-t)*((1-s)*data[k]+s*data[k+1])+t*((1-s)*data[k+W]+s*data[k+W+1]))/16-2.5;
    const w=ramp(0,25,edge)*(1-ramp(3.0,7.6,base));
    return base+(y-base)*w;
  };
})();
"""
for a,v in [('X0',str(x0)),('Z0',str(z0)),('W',str(w)),('H',str(h)),('RING',ring),('DATA',encoded)]:
 import re
 code=re.sub(r'\b'+a+r'\b',v,code)
import subprocess
p=root/'game/alaska-cove.js';temp=p.with_name('alaska-cove.check.js');temp.write_text(code)
subprocess.run(['node','--check',str(temp)],check=True)
subprocess.run(['node','-e',"global.window=global;require(process.argv[1]);if(!Number.isFinite(mendenhallCoveGround(201,1548,0)))process.exit(1)",str(temp)],check=True)
temp.replace(p)
print(out.shape,out.min(),out.max())
