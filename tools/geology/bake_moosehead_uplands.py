"""Build adaptive Maine terrain from USGS 3DEP and USDA NAIP. Source coordinates
are UTM 19N, centred at (442772,5060090). Inputs follow fetch_uplands.py.
Use numpy, scipy, pydelatin, rasterio and Pillow. Outputs are in game/.
"""
import argparse
import struct
from pathlib import Path
import numpy as np
import rasterio
from PIL import Image
from pydelatin import Delatin
from scipy.ndimage import map_coordinates, gaussian_filter
from scipy.spatial import Delaunay

parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
parser.add_argument('kineo_lidar', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
out = args.output
def read(name):
    with rasterio.open(args.source/name) as src:
        return src.read(1)

core = np.empty((4097,4097), dtype='f')
panorama = Image.new('RGB',(4096,4096))
for i in range(2):
    for j in range(2):
        core[j*2048:j*2048+2049,i*2048:i*2048+2049] = read(f'core-{i}-{j}.tif')
        panorama.paste(Image.open(args.source/f'color-{i}-{j}.jpg'),(i*2048,j*2048))
panorama.save(out/'moosehead-horizon.webp',quality=86,method=5)
from moosehead_soundings import apply_soundings
apply_soundings(core,args.source,out)
outer = read('horizon.tif')
axes = [-82000,-56000,-42000,-32000,-23500,-16000,-10500,-6900,0,6900,10500,16000,23500,32000,42000,56000,82000]
def sample(x,z):
    x,z=np.broadcast_arrays(x,z)
    def get(field,half,xx,zz):
        s=(len(field)-1)/(2*half)
        return map_coordinates(field,[(zz+half)*s,(xx+half)*s],order=1,mode='nearest',prefilter=False)
    radius=np.maximum(abs(x),abs(z))
    if np.all(radius<=31200):
        return get(core,32000,x,z)
    y=get(outer,82000,x,z)
    inside=radius<32000
    if inside.any():
        mix=np.clip((32000-radius[inside])/800,0,1)
        y[inside]+=(get(core,32000,x[inside],z[inside])-y[inside])*mix*mix*(3-2*mix)
    return y

tiles=[]
with (out/'moosehead-uplands.bin').open('wb') as dest:
    dest.write(struct.pack('<4sHH',b'MUT1',len(axes)-1,(len(axes)-1)**2-4))
    dest.write(np.asarray(axes,'<i4').tobytes())
    for j,(top,bottom) in enumerate(zip(axes,axes[1:])):
        for i,(left,right) in enumerate(zip(axes,axes[1:])):
            radius=max(abs(left),abs(right),abs(top),abs(bottom))
            if radius<=6900:continue
            span=right-left; depth=bottom-top
            step=18 if radius<=32000 else 100
            x=np.linspace(left,right,int(np.ceil(span/step))+1)
            z=np.linspace(top,bottom,int(np.ceil(depth/step))+1)
            grid=sample(*np.meshgrid(x,z)).astype('f')
            err=2.0 if radius<=16000 else 3.5 if radius<=32000 else 6.0
            raw=Delatin(grid,max_error=err)
            uv=raw.vertices[:,:2].astype('f8')
            uv[:,0]/=len(x)-1
            uv[:,1]=1-uv[:,1]/(len(z)-1)
            # Adjacent patches share exactly the same boundary coordinates and heights.
            uv=uv[(uv>0).all(axis=1)&(uv<1).all(axis=1)]
            def edge(start,end,fixed):
                local=max(abs(start),abs(end),abs(fixed))
                spacing=52 if local<=32000 else 180
                return np.linspace(0,1,int(np.ceil((end-start)/spacing))+1)
            sides=[]
            for side in (0,1):
                a=edge(left,right,[top,bottom][side]);b=edge(top,bottom,[left,right][side])
                sides.append(np.c_[a,np.full_like(a,side)])
                sides.append(np.c_[np.full_like(b,side),b])
            uv=np.unique(np.round(np.vstack([uv,*sides])*65535).astype('<u2'),axis=0)
            xx=left+span*uv[:,0].astype('f8')/65535
            zz=top+depth*uv[:,1].astype('f8')/65535
            yy=sample(xx,zz)
            triangles=Delaunay(np.c_[xx,zz]).simplices[:,[0,2,1]].astype('<u2')
            assert len(uv)<65535
            # Independent source normals hold undulations that the adaptive faces simplify.
            d=24 if radius<=32000 else 105
            dx=sample(xx-d,zz)-sample(xx+d,zz);dz=sample(xx,zz-d)-sample(xx,zz+d)
            norm=np.sqrt(dx*dx+dz*dz+4*d*d)
            angle=np.zeros_like(yy)
            for dist in (60,130,280,600,1200,2500,5000):
                angle=np.maximum(angle,(sample(xx+.10453*dist,zz-.99452*dist)-yy)/dist)
            visibility=np.clip((.315-angle)/.072,0,1)
            vertices=np.zeros((len(uv),5),dtype='<u2')
            vertices[:,:2]=uv
            vertices[:,2]=np.rint(yy*10).astype('u2')
            vertices[:,3]=(np.rint(dx/norm*127+128).astype('u2') | (np.rint(dz/norm*127+128).astype('u2')<<8))
            vertices[:,4]=np.rint(visibility*255)
            dest.write(struct.pack('<BBHI',i,j,len(uv),len(triangles)))
            dest.write(vertices.tobytes());dest.write(triangles.tobytes())
            tiles.append((len(uv),len(triangles)))
print('Mesh tiles, vertices, triangles:',len(tiles),*np.sum(tiles,axis=0),flush=True)
with rasterio.open(args.kineo_lidar) as src:
    dem=src.read(1)
# Lidar bare earth resolves slope breaks and gullies at the true coordinates.
smooth=gaussian_filter(dem.astype('f'),2.5)
dz,dx=np.gradient(smooth)
length=np.sqrt(dx**2+dz**2+1)
crest=(smooth-gaussian_filter(smooth,13))/6
normal=np.stack([.5-.5*dx/length,.5-.5*dz/length,.5+.35*np.tanh(crest)],axis=-1)
Image.fromarray(np.uint8(np.clip(normal,0,1)*255)).save(out/'moosehead-kineo-slopes.webp',lossless=True,method=4)
