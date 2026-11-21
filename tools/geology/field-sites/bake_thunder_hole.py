"""Bake Thunder Hole, Maine from NOAA's October 16, 2022 laser returns and USDA NAIP.

Pass the COPC tile 20221016_564500e_4908000n.copc.laz and USDA RGB input
exported over game coordinates (-65,-125)..(140,65). See the Acadia credits.
The binary uses quarter-metre mesh coordinates and a half-metre height grid.
"""
import argparse
import struct
from pathlib import Path

import laspy
import numpy as np
from PIL import Image
from pydelatin import Delatin
from pyproj import Transformer
from scipy.interpolate import LinearNDInterpolator
from scipy.ndimage import map_coordinates
from scipy.spatial import cKDTree

BOUNDS = (-4, -88, 112, 24)
ORIGIN = (564651, 4907768)
PHOTO_BOUNDS = (-65, -125, 140, 65)


def read_ground(path):
    transform = Transformer.from_crs(6348, 32619, always_xy=True)
    left, top, right, bottom = BOUNDS
    selected = []
    with laspy.open(path) as reader:
        for packet in reader.chunk_iterator(500000):
            x = np.asarray(packet.x) - ORIGIN[0]
            z = ORIGIN[1] - np.asarray(packet.y)
            ground = np.isin(np.asarray(packet.classification), [2, 40, 43]) & ~np.asarray(packet.withheld, dtype=bool)
            take = ground & (x > left-4) & (x < right+4) & (z > top-4) & (z < bottom+4)
            east, north = transform.transform(ORIGIN[0]+x[take], ORIGIN[1]-z[take])
            selected.append(np.column_stack((east-ORIGIN[0], ORIGIN[1]-north, np.asarray(packet.z)[take])))
    return np.concatenate(selected)


def terrain(points):
    left, top, right, bottom = BOUNDS
    x = np.arange(left, right+.125, .25)
    z = np.arange(top, bottom+.125, .25)
    east, south = np.meshgrid(x, z)
    query = np.column_stack((east.ravel(), south.ravel()))
    distances, indices = cKDTree(points[:, :2]).query(query, k=7)
    weights = np.exp(-((distances-distances[:, :1])/.37)**2)
    recovered = np.sum(points[indices, 2]*weights, axis=1) / weights.sum(axis=1)
    linear = LinearNDInterpolator(points[:, :2], points[:, 2])(query)
    grid = np.where(np.isfinite(linear) & (distances[:, 0] < 3), .65*linear+.35*recovered, recovered).reshape(east.shape)

    # The airborne beam misses the bottom beneath the shadowed lip. NPS's
    # channel photograph and the low-tide orthophoto constrain its opening.
    # Connect that opening to the measured wet channel along the same fissure.
    cross = np.array([[-50.5,49.9,.15],[-49.5,50.1,.56],[-47.5,50.2,.85],
                      [-45,50.5,1.12],[-42,51.2,1.24],[-39,52.1,1.40],
                      [-36,53.4,1.18],[-33,54.6,1.12],[-29,55.7,1.26]])
    center = np.interp(south, cross[:, 0], cross[:, 1])
    radius = np.interp(south, cross[:, 0], cross[:, 2])
    end = np.minimum(np.clip((south+50.5)/1.1,0,1), np.clip((-29-south)/4,0,1))
    wall = np.clip((radius-np.abs(east-center))/.38, 0, 1)*end
    wall *= wall*(3-2*wall)
    bed = -.92+.13*np.sin(south*.82)+.07*np.sin(east*1.35+south*.57)
    return grid - wall*np.maximum(0, grid-bed)


def pack(grid, image, target):
    left, top, right, bottom = BOUNDS
    coarse = grid[::2, ::2]
    zz, xx = np.indices(coarse.shape)
    z = top+zz*.5
    x = left+xx*.5
    lum = np.asarray(image, dtype='f4')
    px = (x-left)/(right-left)*(image.width-1)
    pz = (z-top)/(bottom-top)*(image.height-1)
    red, green, blue = [map_coordinates(lum[:,:,i], [pz,px], order=1) for i in range(3)]
    cover = np.clip((green-.68*red-.32*blue-4)/20, 0, 1)
    def horizon(a):
        grades = np.zeros_like(coarse)
        for distance in [1.5,3,6,12,22,42]:
            rx = np.clip(xx+round(np.cos(a)*distance*2), 0, coarse.shape[1]-1)
            rz = np.clip(zz+round(np.sin(a)*distance*2), 0, coarse.shape[0]-1)
            grades = np.maximum(grades, (coarse[rz,rx]-coarse)/distance)
        return np.arctan(grades)
    openness = 1 - np.mean([np.sin(horizon(a))**2 for a in np.arange(8)*np.pi/4], axis=0)
    fields = np.clip(255*np.stack([openness, horizon(3.037)/1.539,cover,np.ones_like(cover)],axis=2),0,255).astype('u1')
    # A single error-limited TIN avoids seams across the walls and the walkway.
    mesh = Delatin(grid, max_error=.11)
    col = mesh.vertices[:,0].astype(int)
    row = grid.shape[0]-1-mesh.vertices[:,1].astype(int)
    scale = .01
    datum = -20.
    vertices = np.column_stack((col,row,np.rint((grid[row,col]-datum)/scale))).astype('<u2')
    assert len(vertices) < 65536 and grid.min()>datum
    triangles = np.array(mesh.triangles,dtype='<u2')
    p,q,r = vertices[triangles[0],:2].astype(float)
    if (q[0]-p[0])*(r[1]-p[1])>(q[1]-p[1])*(r[0]-p[0]):
        triangles = triangles[:,[0,2,1]]
    lighting = np.column_stack([map_coordinates(fields[:,:,i], [row/2,col/2],order=1) for i in range(4)]).astype('u1')
    nz,nx = coarse.shape
    with target.open('wb') as f:
        f.write(struct.pack('<4sHH4iHHffI', b'ARF1',2,2,*BOUNDS,nx,nz,datum,scale,1))
        f.write(np.rint((coarse-datum)/scale).astype('<i2').tobytes())
        f.write(struct.pack('<II',len(vertices),len(triangles)))
        for a in (vertices,lighting,triangles):f.write(a.tobytes())
    print(len(vertices),'vertices',len(triangles),'triangles',target.stat().st_size,'bytes')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('laser',type=Path)
    parser.add_argument('ortho',type=Path)
    parser.add_argument('output',type=Path)
    args = parser.parse_args()
    full = Image.open(args.ortho).convert('RGB')
    l,t,r,b = PHOTO_BOUNDS
    x0,z0,x1,z1 = BOUNDS
    bounds = ((x0-l)/(r-l)*full.width,(z0-t)/(b-t)*full.height,(x1-l)/(r-l)*full.width,(z1-t)/(b-t)*full.height)
    photo = full.crop(tuple(round(v) for v in bounds))
    photo.save(args.output/'landform-acadia-aerial.webp',quality=94,method=6)
    pack(terrain(read_ground(args.laser)),photo,args.output/'landform-acadia.bin')


if __name__=='__main__':
    main()
