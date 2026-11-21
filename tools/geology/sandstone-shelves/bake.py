"""Build Horseshoe Bend's 1 m slickrock relief and registered 30 cm optical map."""
import argparse
from io import BytesIO
import json
from pathlib import Path
import struct

import numpy as np
from PIL import Image
from pydelatin import Delatin
from scipy.ndimage import gaussian_filter, map_coordinates

RECT = (-624, -232, -388, 8)
HEIGHT_BASE = -4.
HEIGHT_STEP = 1/80.


def sample(array, x, y):
    return map_coordinates(array,[y,x],order=1,mode='nearest')


def photograph(survey, height):
    step = float(survey['step'])
    photo = survey['photo'].astype('float32')/255
    row,column = np.indices(height.shape)
    uv_x,uv_y = (column+.5)/step-.5,(row+.5)/step-.5
    red,green,blue,infrared = [sample(gaussian_filter(band,1),uv_x,uv_y) for band in photo]
    gy,gx = np.gradient(gaussian_filter(height,1))
    slope = np.hypot(gx,gy)
    ndvi = (infrared-red)/np.maximum(.001,infrared+red)
    mineral = (ndvi<.065)&(height>959)&(red>.32)&(slope<1.7)
    unit = np.sqrt(1+gx*gx+gy*gy)
    normals = np.stack((np.ones_like(gx),-gx/unit,-gy/unit,1/unit),axis=-1)[mineral]
    intensity = gaussian_filter(.27*red+.58*green+.15*blue,3.)[mineral]
    weight = np.ones(len(intensity))
    for _ in range(5):
        fit = np.linalg.lstsq(normals*weight[:,None],intensity*weight,rcond=None)[0]
        weight = 1/np.maximum(1,np.abs((intensity-normals@fit))/.060)
    py,px = np.indices(photo.shape[1:],dtype='float32')
    px,py = (px+.5)*step-.5,(py+.5)*step-.5
    dx,dy = sample(gx,px,py),sample(gy,px,py)
    flat = fit[0]+(fit[3]-fit[1]*dx-fit[2]*dy)/np.sqrt(1+dx*dx+dy*dy)
    ratio = np.clip((fit[0]+fit[3])/np.maximum(.23,flat),.79,1.23)
    rgb = photo[:3].transpose(1,2,0)*(.28+.72*ratio[:,:,None])
    vegetation = (photo[3]-photo[0])/(photo[3]+photo[0]+.01)
    bare = np.clip((.165-vegetation)/.085,0,1)*np.clip((photo[0]-.16)/.14,0,1)
    bare *= np.clip((photo[0]-photo[2]+.012)/.08,0,1)
    bare = gaussian_filter(bare,.75)
    rgba = Image.fromarray(np.uint8(np.clip(np.dstack((rgb,bare)),0,1)*255))
    # Filter and encode the full source neighbourhood before clipping the
    # production parcel, keeping boundary pixels consistent with the crop.
    buf = BytesIO()
    rgba.save(buf,format='WEBP',quality=92,alpha_quality=98,method=6)
    buf.seek(0)
    l,t,_,_ = survey['bounds']
    x0,z0,x1,z1 = RECT
    return Image.open(buf).crop(tuple(round(d/step) for d in (x0-l,z0-t,x1-l,z1-t)))


def baked_horizon(height, dx, dz):
    v,u = np.indices(height.shape)
    rows,cols = height.shape
    slope = np.zeros_like(height)
    for distance in (1,2,4,7,11,17,25,40,60,90,140,200):
        j = np.clip(np.rint(v+dz*distance).astype(int),0,rows-1)
        i = np.clip(np.rint(u+dx*distance).astype(int),0,cols-1)
        slope = np.maximum(slope,(height[j,i]-height)/distance)
    return np.arctan(slope)


def bake(cache, out):
    out.mkdir(parents=True,exist_ok=True)
    survey = np.load(cache/'bank-photo.npz')
    dem = np.load(cache/'bank-survey.npy')
    view = photograph(survey,dem)
    view.save(out/'landform-canyonshelves-aerial.webp',quality=94,alpha_quality=99,method=6)
    l,t,_,_ = survey['bounds']
    x0,z0,x1,z1 = RECT
    z,x = np.mgrid[z0:z1+1,x0:x1+1]
    height = sample(dem,x-l-.5,z-t-.5)-950.
    rows,cols = height.shape
    grid = np.rint((height-HEIGHT_BASE)/HEIGHT_STEP).astype('<i2')
    sky = 1-np.mean([np.sin(baked_horizon(height,np.cos(a),np.sin(a)))**2
                     for a in np.linspace(0,2*np.pi,12,endpoint=False)],axis=0)
    sun_azimuth = np.deg2rad(139.4)
    horizon = np.clip(baked_horizon(height,np.cos(sun_azimuth),np.sin(sun_azimuth))/1.539,0,1)
    step = float(survey['step'])
    mineral = sample(np.asarray(view)[:,:,3].astype('float32')/255,(x-x0)/step,(z-z0)/step)
    fields = np.uint8(np.clip(np.stack((sky,horizon,1-mineral,np.ones_like(height)),axis=-1),0,1)*255)
    # Constrain every perimeter metre. Keep the actual survey height at each
    # vertex after simplification, including the border.
    v,u = np.indices(height.shape)
    border = (u==0)|(u==cols-1)|(v==0)|(v==rows-1)
    constrained = height.copy()
    constrained[border] += np.where((u[border]+v[border])%2,.8,-.8)
    mesh = Delatin(constrained,max_error=.095)
    ix = mesh.vertices[:,0].astype(int)
    iz = rows-1-mesh.vertices[:,1].astype(int)
    vertices = np.column_stack((ix,iz,grid[iz,ix])).astype('<u2')
    triangles = np.asarray(mesh.triangles,dtype='<u2')
    a,b,c = vertices[triangles[0],:2].astype(int)
    ab,ac = b-a,c-a
    if ab[0]*ac[1]-ab[1]*ac[0]>0:
        triangles = triangles[:,::-1].copy()
    output = out/'landform-canyonshelves.bin'
    with output.open('wb') as stream:
        stream.write(struct.pack('<4sHH4iHHffI',b'ARF1',1,1,*RECT,cols,rows,HEIGHT_BASE,HEIGHT_STEP,1))
        stream.write(grid.tobytes())
        stream.write(struct.pack('<II',len(vertices),len(triangles)))
        stream.write(vertices.tobytes())
        stream.write(fields[iz,ix].tobytes())
        stream.write(triangles.tobytes())
    print(json.dumps(dict(bounds=RECT,vertices=len(vertices),triangles=len(triangles),
                          retainedBorder=int(border[iz,ix].sum()),photograph=view.size)))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('cache',type=Path)
    parser.add_argument('game',type=Path)
    arguments = parser.parse_args()
    bake(arguments.cache,arguments.game)
