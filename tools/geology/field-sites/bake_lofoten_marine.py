"""Build conservative open-sea coverage in the Lofoten survey frame from Kartverket DTM."""
import argparse,base64,hashlib,json,subprocess,struct
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlencode
from urllib.request import urlopen
import numpy as np,rasterio
from scipy.ndimage import distance_transform_edt
from pyproj import Transformer
# The chart only classifies survey-confirmed open water. It does not supply soundings.
HALF=18000
X0,Y0=Transformer.from_crs(4326,25833,always_xy=True).transform(13.038,67.972)

def generate(cache,out):
    def tile(i):
        j,k=divmod(i,4);l,t=-HALF+k*9000,-HALF+j*9000
        bbox=','.join(f'{v:.3f}'for v in (X0+l,Y0-(t+9000),X0+l+9000,Y0-t))
        params=urlencode(dict(bbox=bbox,bboxSR=25833,imageSR=25833,size='900,900',format='tiff',pixelType='F32',interpolation='RSP_BilinearInterpolation',f='image',adjustAspectRatio='false'))
        url='https://hoydedata.no/arcgis/rest/services/DTM/ImageServer/exportImage?'+params
        name=f'lofoten-sea-{j}-{k}.tif';f=cache/name
        if not f.exists():subprocess.run(['curl','-fsSL','--retry','2','--max-time','80',url,'-o',str(f)],check=True)
        with rasterio.open(f)as src:
            a=src.read(1);valid=(a>-.012)&(a<.012)
            if src.nodata==0:raise ValueError('No data and zero sea are indistinguishable')
        return (j,k,valid,{'file':name,'source':url,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
    grid=np.zeros((3600,3600),dtype=bool);refs=[]
    with ThreadPoolExecutor(4)as executor:
        for j,k,sea,ref in executor.map(tile,range(16)):
            grid[j*900:(j+1)*900,k*900:(k+1)*900]=sea;refs.append(ref)
    dist=distance_transform_edt(grid)*10
    # Erode the marine mask before downsampling, retaining small real islands and emergent reefs.
    conservative=np.min(dist.reshape(1800,2,1800,2),axis=(1,3))
    grade=np.digitize(conservative,[21,45,88]).astype('u1').ravel()
    cut=np.flatnonzero(np.r_[True,grade[1:]!=grade[:-1],True]);data=bytearray()
    for start,end in zip(cut[:-1],cut[1:]):
        remaining=end-start
        while remaining:
            n=min(remaining,16383);data.extend(struct.pack('<H',int(grade[start])<<14|n));remaining-=n
    txt=base64.b64encode(data).decode()
    out.write_text('// Kartverket elevation survey: confirmed open water at 20 m, EPSG:25833. Rebuild information in field site credits.\nwindow.aerieLofotenMarineMask="'+txt+'";\n')
    (cache/'sources.json').write_text(json.dumps(refs,indent=2))
    print('masks',np.bincount(grade),'encoded bytes',len(data))
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--cache',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();a.cache.mkdir(exist_ok=True,parents=True);generate(a.cache,a.output)
