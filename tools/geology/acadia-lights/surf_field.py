"""Sample the same island tide atlas for the ocean mesh and its flight-contact surface."""
from pathlib import Path
import struct
import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates
# Centre, horizontal extent, atlas rectangle and atlas tile in east/south metres.
PATCHES=[(4012,-3850,148,218,(3490,-4320,1000,1000),0),(-474,9213,244,168,(-1359,8086,1316,1326),1)]
def bake(source,destination):
    atlas=np.asarray(Image.open(source).convert('RGBA'))
    with destination.open('wb') as f:
        f.write(struct.pack('<4sI',b'ASF1',len(PATCHES)))
        for x,z,width,depth,(west,north,spanx,spanz),tile in PATCHES:
            nx=int(np.ceil(width/1.5));nz=int(np.ceil(depth/1.5))
            X,Z=np.meshgrid(np.linspace(x-width/2,x+width/2,nx+1),np.linspace(z-depth/2,z+depth/2,nz+1))
            u=(X-west)/spanx*1023+tile*1024;v=(Z-north)/spanz*1023
            samples=np.stack([map_coordinates(atlas[:,:,c],[v,u],order=1,mode='nearest') for c in range(4)],axis=-1)
            f.write(struct.pack('<4i2H',x,z,width,depth,nx+1,nz+1));f.write(samples.astype('u1').tobytes())
if __name__=='__main__':
    import sys
    bake(Path(sys.argv[1]),Path(sys.argv[2]))
