from pathlib import Path
import concurrent.futures,time,requests,io
import numpy as np
from PIL import Image
from pyproj import Transformer
import rasterio
import argparse
parser=argparse.ArgumentParser(description='Download USGS 3DEP relief and USDA NAIP imagery in UTM 19N.')
parser.add_argument('source',type=Path)
d=parser.parse_args().source;d.mkdir(parents=True,exist_ok=True)
ox,oy=np.round(Transformer.from_crs(4326,32619,always_xy=True).transform(-69.735,45.692))
jobs=[]
for i in range(2):
 for j in range(2):jobs.append((f'core-{i}-{j}',-32000+i*32000,-32000+j*32000,32000,2049,True))
jobs += [('horizon',-82000,-82000,164000,1537,True)]
for i in range(2):
 for j in range(2):jobs.append((f'color-{i}-{j}',-82000+i*82000,-82000+j*82000,82000,2048,False))
def get(v):
 name,x,z,span,n,dem=v;p=d/(name+('.tif' if dem else '.jpg'))
 if p.is_file():return (name,p.stat().st_size)
 # DEM bounds refer to sample centers. Orthophoto bounds are pixel edges.
 delta=span/(n-1)/2 if dem else 0
 box=','.join(f'{a:.5f}' for a in [ox+x-delta,oy-z-span-delta,ox+x+span+delta,oy-z+delta])
 service=('https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage' if dem else 'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage')
 par=dict(bbox=box,bboxSR=32619,imageSR=32619,size=f'{n},{n}',f='image',format='tiff' if dem else 'jpg',interpolation='RSP_BilinearInterpolation')
 if dem:par.update(pixelType='F32',renderingRule='{"rasterFunction":"None"}')
 else:par.update(bandIds='0,1,2',compressionQuality=88)
 for attempt in range(3):
  try:
   r=requests.get(service,params=par,timeout=80);r.raise_for_status()
   if dem:
    with rasterio.MemoryFile(r.content) as f, f.open() as s:assert s.width==n and s.height==n and -50<float(np.median(s.read(1)))<1500
   else: assert Image.open(io.BytesIO(r.content)).size==(n,n)
   p.write_bytes(r.content);return (name,len(r.content))
  except Exception as e:
   if attempt==2:raise
   time.sleep(1+attempt)
with concurrent.futures.ThreadPoolExecutor(5) as pool:
 for f in concurrent.futures.as_completed([pool.submit(get,j) for j in jobs]):
  try:print(f.result(),flush=True)
  except Exception as e:print('ERROR',e,flush=True)

# Moosehead is MIDAS 390. Keep the actual point observations and their metres.
points=d/'depths-numeric.json'
if not points.exists():
 service='https://gis.maine.gov/mapservices/rest/services/dep/MaineDEP_Lakes_Data/MapServer/2/query'
 r=requests.get(service,params=dict(where='MIDAS=390',outFields='MIDAS,DEPTHM',outSR=32619,f='json'),timeout=60)
 r.raise_for_status()
 assert len(r.json()['features'])>1000 and not r.json().get('exceededTransferLimit')
 points.write_bytes(r.content)
