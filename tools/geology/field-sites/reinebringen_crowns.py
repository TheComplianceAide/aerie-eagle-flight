"""Extract the wind-sheltered tree crowns around Reinebringen from Norwegian surface returns."""
import hashlib,json
from urllib.parse import urlencode
import numpy as np,rasterio
from scipy.ndimage import gaussian_filter,maximum_filter,distance_transform_edt
from bake import fetch
from bake_reinebringen import WALL,origin,band

def crowns(cache,game):
    west,north,east,south=WALL
    bb=','.join(f'{v:.3f}' for v in [origin[0]-601,origin[1]-5661,origin[0]+1905,origin[1]-3271])
    query=urlencode(dict(bbox=bb,bboxSR=25833,imageSR=25833,size='1253,1195',format='tiff',pixelType='F32',interpolation='RSP_BilinearInterpolation',f='image',adjustAspectRatio='false'))
    dom=fetch(cache,'reine-west-canopy-2m.tif','https://hoydedata.no/arcgis/rest/services/DOM/ImageServer/exportImage?'+query)
    if hashlib.sha256(dom.read_bytes()).hexdigest()!='4b983e8f31b9bf821b28c82e8820c5bc262a30c0e3ee5f30558592b6bcc436d9':
        raise ValueError('The Norwegian surface model changed; repeat local crown controls.')
    def field(path):
        with rasterio.open(path) as ds:return ds.read(1)[(north-3272)//2:(south-3272)//2+1,(west+600)//2:(east+600)//2+1]
    bare=field(cache/'reine-west-face-2m.tif');surface=field(dom);z,x=np.mgrid[north:south+2:2,west:east+2:2]
    near=band(cache,'B08',x,z)[:,:,0];red=band(cache,'B04',x,z)[:,:,0];ndvi=(near-red)/np.maximum(1,near+red)
    dz,dx=np.gradient(bare,2);grade=np.hypot(dx,dz)
    canopy=gaussian_filter(np.clip(surface-bare,0,19),.65)
    valid=(bare>1)&(bare<270)&(canopy>1.95)&(canopy<13)&(ndvi>.41)&(grade<.88)
    # The eastern village owns its trees. Remove quays and domestic roof returns along the little western road.
    valid&=~((x>=1432)&(z>=3912)&(z<=4840))
    valid&=~((x>1280)&(x<1585)&(z>3970)&(z<4585)&(bare<21))
    # Retain a broad vegetated base around each local maximum; isolated returns on blocks and stairs are not crowns.
    breadth=distance_transform_edt(valid)*2
    peaks=(canopy==maximum_filter(np.where(valid,canopy,0),size=5))&valid&(breadth>=3.5)
    records=[]
    for j,i in zip(*np.nonzero(peaks)):
        ht=canopy[j,i]
        records.append([int(x[j,i]),int(z[j,i]),round(float(ht),1),round(float(np.clip(.77*ht+.65,1.85,min(6.2,1.23*breadth[j,i]))),1)])
    out=game/'lofoten-reinevatnet-data.js'
    with out.open('a')as f:f.write('window.aerieReinevatnet.crowns='+json.dumps(records,separators=(',',':'))+';\n')
    return len(records)
