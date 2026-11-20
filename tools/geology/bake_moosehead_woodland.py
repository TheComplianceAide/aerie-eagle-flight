"""Bake mapped woodland cover and representative distant ridge/shore tree clumps.
Uses USDA Forest Service NLCD 2021 percent canopy and USGS 2021 land cover.
Run after fetch_moosehead_uplands.py. A root is modeled, not a lidar tree return.
"""
import argparse,json,struct
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import numpy as np, requests, rasterio
from scipy.ndimage import gaussian_filter, maximum_filter, distance_transform_edt
from PIL import Image
parser=argparse.ArgumentParser()
parser.add_argument('source',type=Path);parser.add_argument('output',type=Path);args=parser.parse_args()
def layer(item):
    service,raster_id,name=item
    p=args.source/('woodland-'+name+'.tif')
    if not p.exists():
        url='https://imagery.geoplatform.gov/iipp/rest/services/Vegetation/USFS_EDW_NLCD_'+service+'_CONUS/ImageServer/exportImage'
        par=dict(bbox='410772,5028090,474772,5092090',bboxSR=32619,imageSR=32619,size='2048,2048',format='tiff',pixelType='U8',f='image',interpolation='RSP_NearestNeighbor',mosaicRule=json.dumps({'mosaicMethod':'esriMosaicLockRaster','lockRasterIds':[raster_id]}),renderingRule='{"rasterFunction":"None"}')
        reply=requests.get(url,params=par,timeout=80);reply.raise_for_status()
        with rasterio.MemoryFile(reply.content) as f,f.open() as d:assert d.count==1 and d.width==2048
        p.write_bytes(reply.content)
    with rasterio.open(p) as src:return src.read(1)
with ThreadPoolExecutor(2) as pool:
    cover,land=pool.map(layer,[('TCC',76,'canopy'),('Landcover',37,'landcover')])
print('land classes',np.unique(land),'canopy percentiles',np.quantile(cover,[0,.25,.5,.75,1]),flush=True)
forest=np.isin(land,[41,42,43,90])
cover=np.where(forest & (cover<=100),cover,0).astype('u1')
# Percent cover across the full 64 km square enables detailed nearby woodland as the eagle travels.
im=Image.fromarray(cover);im=im.resize((1024,1024),Image.Resampling.BOX)
field=np.asarray(im,dtype='u1')
h=np.zeros((2048,2048),dtype='f')
for i in range(2):
    for j in range(2):
        with rasterio.open(args.source/f'core-{i}-{j}.tif') as src:a=src.read(1)
        h[j*1024:(j+1)*1024,i*1024:(i+1)*1024]=.25*(a[:-1:2,:-1:2]+a[1::2,:-1:2]+a[:-1:2,1::2]+a[1::2,1::2])
crest=h-gaussian_filter(h,6)
waterDistance=distance_transform_edt(land!=11)*31.25
rng=np.random.default_rng(5060090)
# Concentrate overview trees where they form a visible skyline or mapped shore.
# These apart-standing groups continue into the existing nearby detailed forest pass.
z,x=np.mgrid[0:2048:6,0:2048:6]
z=np.clip(z+rng.integers(0,6,z.shape),0,2047);x=np.clip(x+rng.integers(0,6,x.shape),0,2047)
xx=(x+.5)*31.25-32000;zz=(z+.5)*31.25-32000;rad=np.maximum(abs(xx),abs(zz))
select=(rad>=6900)&(rad<30500)&(cover[z,x]>=35)&(h[z,x]>312.9)&((crest[z,x]>9)|(waterDistance[z,x]<160))
record=[]
for cx,cz in zip(xx[select],zz[select]):
    n=int(rng.integers(4,9));rx=cx+rng.normal(0,17,n);rz=cz+rng.normal(0,18,n)
    iu=((rx+32000)/31.25).astype(int);iv=((rz+32000)/31.25).astype(int)
    for x0,z0,row,col in zip(rx,rz,iv,iu):
        c=cover[row,col]
        if max(abs(x0),abs(z0))<6900 or c<29 or h[row,col]<312.7:continue
        evergreen=rng.random()<({42:.9,41:.12,90:.64}.get(int(land[row,col]),.50))
        stature=np.clip((13+c*.066+rng.normal(0,3.3))*.95,4,27)
        width=stature*(rng.uniform(.31,.49) if evergreen else rng.uniform(.54,.82))
        record.append((round(x0),round(z0),round(stature*8),round(width*8),int(evergreen),int(rng.integers(0,256))))
# The two eastern bays are outside the dense central forest. A single
# distant representative clump every few hundred metres leaves the main
# shoreline bare when approached. Give these two 1.9 km NAIP footprints
# a real stand structure. Roots remain stable across all distances.
for cx,cz in [(11425,199),(15205,9651)]:
    center_x,center_z=(cx+32000)/31.25,(cz+32000)/31.25
    for row in range(int(center_z)-65,int(center_z)+66):
        for col in range(int(center_x)-65,int(center_x)+66):
            canopy=cover[row,col]/100
            if canopy<.19 or h[row,col]<312.8:continue
            taper=np.clip((1950-max(abs(col-center_x),abs(row-center_z))*31.25)/350,0,1)
            cluster=.75+.25*np.cos(row*.36+np.sin(col*.57))+.15*np.sin(row*.88-col*.41)
            stems=rng.poisson(4.6*canopy**1.25*cluster*taper)
            for _ in range(stems):
                x0=(col+rng.random())*31.25-32000;z0=(row+rng.random())*31.25-32000
                evergreen=rng.random()<({42:.88,41:.10,90:.56}.get(int(land[row,col]),.46))
                stature=np.clip(9+canopy*9+rng.normal(0,3.8),4,26)
                width=stature*(rng.uniform(.33,.54) if evergreen else rng.uniform(.51,.84))
                record.append((round(x0),round(z0),round(stature*8),round(width*8),int(evergreen),int(rng.integers(0,256))))
with (args.output/'moosehead-woodland.bin').open('wb') as out:
    out.write(struct.pack('<4sII',b'MWC1',len(field),len(record)));out.write(field.tobytes())
    for r in record:out.write(struct.pack('<hhBBBB',*r))
print(len(record),'representative ridge and shoreline roots',flush=True)
