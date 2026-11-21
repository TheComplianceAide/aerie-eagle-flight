"""Model Korten's exposed granite on the two-metre Kartverket surface, including the channel dividing its two rocks."""
from pathlib import Path
from urllib.parse import urlencode
import argparse
import numpy as np,rasterio
from rasterio.windows import Window
from scipy.ndimage import distance_transform_edt,gaussian_filter
from pyproj import Transformer
from PIL import Image
from bake import fetch,survey,sample

SOURCE='https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/32/W/PA/2025/7/S2C_32WPA_20250716_1_L2A/'
bounds=(4532,2616,4880,3016)
origin=Transformer.from_crs(4326,25833,always_xy=True).transform(13.038,67.972)

def generate(cache,game):
 l,t,r,b=bounds;z,x=np.mgrid[t:b+2:2,l:r+2:2]
 source_box=(origin[0]+4140,origin[1]-3550,origin[0]+5800,origin[1]-2000)
 query=urlencode(dict(bbox=','.join('%.3f'%a for a in source_box),bboxSR=25833,imageSR=25833,size='830,775',format='tiff',pixelType='F32',interpolation='RSP_BilinearInterpolation',f='image',adjustAspectRatio='false'))
 field=fetch(cache,'hamnoy-east-2m.tif','https://hoydedata.no/arcgis/rest/services/DTM/ImageServer/exportImage?'+query)
 with rasterio.open(field)as src:
  raw=sample(src.read(1),(src.transform.f-(origin[1]-z))/2-.5,((origin[0]+x)-src.transform.c)/2-.5)
 wet=raw<.075;h=np.where(wet,-.27-np.minimum(distance_transform_edt(wet)*.42,5.5),raw)
 def band(name):
  local=cache/('korten-'+name+'.tif')
  if not local.exists():
   with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',GDAL_HTTP_TIMEOUT='28',GDAL_HTTP_MAX_RETRY='1'):
    with rasterio.open(SOURCE+name+'.tif')as src:
     to=Transformer.from_crs(25833,src.crs,always_xy=True);e,n=to.transform(origin[0]+x,origin[1]-z)
     col=(e-src.transform.c)/src.transform.a;row=(n-src.transform.f)/src.transform.e
     xx,yy=int(col.min())-3,int(row.min())-3;window=Window(xx,yy,int(col.max())-xx+4,int(row.max())-yy+4)
     a=src.read(window=window);trans=src.window_transform(window)
     with rasterio.open(local,'w',driver='GTiff',width=a.shape[2],height=a.shape[1],count=a.shape[0],dtype=a.dtype,crs=src.crs,transform=trans) as dest:dest.write(a)
  with rasterio.open(local)as src:
   to=Transformer.from_crs(25833,src.crs,always_xy=True);e,n=to.transform(origin[0]+x,origin[1]-z)
   return np.stack([sample(s.astype('f4'),(n-src.transform.f)/src.transform.e-.5,(e-src.transform.c)/src.transform.a-.5)for s in src.read()],axis=2)
 rgb=band('TCI');nir=band('B08')[:,:,0];red=band('B04')[:,:,0]
 # This Earth Search asset sets earthsearch:boa_offset_applied=true.
 ndvi=(nir-red)/np.maximum(1,nir+red)
 vegetation=np.clip((ndvi-.09)/.47,0,1)*np.clip((h-.85)/1.55,0,1)
 dz,dx=np.gradient(h,2);slope=np.hypot(dx,dz)
 vegetation*=np.clip((1.25-slope)/.58,0,1)
 # Retain the measured bare-rock outline even where a 10 m colour pixel straddles the sea.
 mineral=(1-vegetation)*np.clip((h-.05)/.55,0,1)
 light=np.clip(.84+.28*(h-gaussian_filter(h,2.1))+.09*dx,.65,1.15)
 local=rgb*(1-mineral[:,:,None]*.73)+np.array([110,105,99])*(mineral*light)[:,:,None]*.73
 local*=1-.26*np.clip((1.1-h)/1.1,0,1)[:,:,None]
 Image.fromarray(np.uint8(np.clip(local,0,255))).save(game/'landform-korten-aerial.webp',quality=93,method=6)
 survey(h,vegetation[::2,::2],bounds,116,.105,-6,1/84,[4,8,14,24,38,65,96,156],(-.423,-.906),1.539,game/'landform-korten.bin')
 print('peak',np.max(h),'land area',np.sum(h>.16)*4,'NDVI coastal land',np.percentile(ndvi[h>1.3],[2,50,95]),'RGB',np.median(rgb[h>1.3],axis=0))
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--cache',type=Path,required=True);p.add_argument('--game',type=Path,required=True);a=p.parse_args();generate(a.cache,a.game)
