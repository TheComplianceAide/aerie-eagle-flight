"""Rebuild the upper and lower Yosemite Falls headwall from 1 m USGS lidar and summer 2022 NAIP."""
import argparse
import json
from pathlib import Path
import struct

import numpy as np
from PIL import Image
from pydelatin import Delatin
import rasterio
from rasterio.transform import from_origin
from rasterio.warp import reproject, Resampling
import requests
from scipy.ndimage import gaussian_filter, map_coordinates

BOUNDS = (2260,-2712,2772,-1768)
ORIGIN = (268678,4179436)
DTM = 'https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1m/Projects/CA_YosemiteNP_2019_D19/TIFF/USGS_1M_11_x27y419_CA_YosemiteNP_2019_D19.tif'
NAIP = ('https://naipeuwest.blob.core.windows.net/naip/v002/ca/2022/ca_060cm_2022/37119/'
        + 'm_37119{}_11_060_202208{}.tif')
PIXEL = .60


def acquire(cache):
    l,t,r,b=BOUNDS
    elevation=np.zeros((b-t+1,r-l+1),dtype='float32')
    aerial=np.zeros((4,round((b-t)/PIXEL),round((r-l)/PIXEL)),dtype='uint8')
    def transform(step,edge):
        return from_origin(ORIGIN[0]+l-edge,ORIGIN[1]-t+edge,step,step)
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',GDAL_HTTP_MAX_RETRY='3'):
        with rasterio.open('/vsicurl/'+DTM) as ds:
            reproject(rasterio.band(ds,1),elevation,src_transform=ds.transform,
                      src_crs=ds.crs,dst_crs='EPSG:32611',dst_transform=transform(1,.5),
                      src_nodata=ds.nodata,dst_nodata=np.nan,resampling=Resampling.bilinear)
        for tile,date in (('12_sw','12'),('20_nw','06')):
            response=requests.get('https://planetarycomputer.microsoft.com/api/sas/v1/sign',
                                  params={'href':NAIP.format(tile,date)},timeout=60)
            response.raise_for_status()
            with rasterio.open('/vsicurl/'+response.json()['href']) as ds:
                for i,band in enumerate(aerial):
                    reproject(rasterio.band(ds,i+1),band,src_transform=ds.transform,src_crs=ds.crs,
                              dst_crs='EPSG:32611',dst_transform=transform(PIXEL,0),
                              src_nodata=0,dst_nodata=0,init_dest_nodata=False,resampling=Resampling.bilinear)
    if not np.isfinite(elevation).all() or np.all(aerial==0,axis=0).any():
        raise ValueError('Incomplete registered USGS/NAIP grid')
    np.savez_compressed(cache/'yosemite-falls-sources.npz',elevation=elevation,aerial=aerial)


def horizon(grid, dx, dz):
    rows,columns=np.indices(grid.shape)
    slope=np.zeros_like(grid)
    for distance in (2,4,8,14,24,38,58,82,116,164,226,320,448):
        z=np.clip(rows+round(dz*distance/2),0,grid.shape[0]-1)
        x=np.clip(columns+round(dx*distance/2),0,grid.shape[1]-1)
        slope=np.maximum(slope,(grid[z,x]-grid)/distance)
    return np.arctan(slope)


def bake(cache,out):
    out.mkdir(parents=True,exist_ok=True)
    src=np.load(cache/'yosemite-falls-sources.npz')
    height=src['elevation']
    l,t,r,b=BOUNDS
    grid=height[::2,::2]
    photo=src['aerial'].astype('float32')/255
    red,green,blue,nir=photo
    ndvi=(nir-red)/np.maximum(.002,nir+red)
    canopy=np.clip((ndvi-.14)/.25,0,1)*np.clip((nir+.025)/.19,0,1)
    canopy=gaussian_filter(canopy,.9)
    exposed=1-canopy
    # Preserve the jointed granite and worn areas in the overhead image. Do
    # not turn the image's deep terrain occlusion into another nighttime shadow.
    luma=.27*red+.58*green+.15*blue
    broad=gaussian_filter(luma,15)
    neutral=np.clip(.48+.48*(broad-.42),.27,.69)
    normalization=np.clip(neutral/np.maximum(.085,broad),.87,1.65)
    rgb=photo[:3].transpose(1,2,0)*(1+.58*exposed*(normalization-1))[...,None]
    Image.fromarray(np.uint8(np.clip(rgb,0,1)*255)).save(out/'landform-yosemite-falls-aerial.webp',quality=92,method=6)
    z,x=np.indices(grid.shape)
    vegetation=map_coordinates(canopy,[(z*2)/PIXEL-.5,(x*2)/PIXEL-.5],order=1,mode='nearest')
    sky=1-np.mean([np.sin(horizon(grid,np.cos(a),np.sin(a)))**2
                   for a in np.linspace(0,2*np.pi,12,endpoint=False)],axis=0)
    dx,dz=-.62,.53
    sun=horizon(grid,dx/np.hypot(dx,dz),dz/np.hypot(dx,dz))/1.539
    exposure=np.rint(np.clip(np.dstack((sky,sun,vegetation,np.ones_like(grid))),0,1)*255).astype('uint8')
    low=np.floor(height.min())-2
    unit=(np.ceil(height.max())-low+2)/32000
    physics=np.rint((grid-low)/unit).astype('<i2')
    chunks=[]
    # Independently constrained 256 m sections stay within the 16-bit ARF
    # vertex format. Lidar heights at shared tile edges are bit-identical.
    for iz in range(0,b-t,256):
        for ix in range(0,r-l,256):
            crop=height[iz:iz+257,ix:ix+257]
            ny,nx=crop.shape
            j,i=np.indices(crop.shape)
            border=(i==0)|(j==0)|(i==nx-1)|(j==ny-1)
            required=border&((i+j)%2==0)
            data=crop.copy()
            data[required]+=np.where(((i[required]+j[required])//2)%2,5.,-5.)
            mesh=Delatin(data,max_error=.55)
            mx=mesh.vertices[:,0].astype(int)
            mz=ny-1-mesh.vertices[:,1].astype(int)
            u,v=ix+mx,iz+mz
            points=np.stack((u,v,np.rint((crop[mz,mx]-low)/unit)),axis=1).astype('<u2')
            light=np.stack([map_coordinates(c,[v*.5,u*.5],order=1,mode='nearest')
                            for c in exposure.transpose(2,0,1)],axis=1).astype('uint8')
            triangles=np.asarray(mesh.triangles,dtype='<u2')
            a1,b1,c1=points[triangles[0],:2].astype(int)
            ab,ac=b1-a1,c1-a1
            if ab[0]*ac[1]-ab[1]*ac[0]>0:
                triangles=triangles[:,::-1].copy()
            chunks.append((points,light,triangles))
    with (out/'landform-yosemite-falls.bin').open('wb') as f:
        f.write(struct.pack('<4sHH4iHHffI',b'ARF1',1,2,*BOUNDS,grid.shape[1],grid.shape[0],low,unit,len(chunks)))
        f.write(physics.tobytes())
        for points,light,tri in chunks:
            f.write(struct.pack('<II',len(points),len(tri)))
            f.write(points.tobytes());f.write(light.tobytes());f.write(tri.tobytes())
    print(json.dumps(dict(bounds=BOUNDS,vertices=sum(len(v) for v,_,_ in chunks),
                          triangles=sum(len(f) for _,_,f in chunks),photoPixels=[rgb.shape[1],rgb.shape[0]],
                          fieldCells=grid.shape,sourceDates=['2019-10','2022-08-06','2022-08-12'])))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('cache',type=Path)
    parser.add_argument('game',type=Path)
    args=parser.parse_args();args.cache.mkdir(parents=True,exist_ok=True)
    if not (args.cache/'yosemite-falls-sources.npz').exists():
        acquire(args.cache)
    bake(args.cache,args.game)
