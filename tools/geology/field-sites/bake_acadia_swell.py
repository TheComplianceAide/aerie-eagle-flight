"""Bake Ocean Path's breaker mesh and water-depth atlas. Lengths are metres.

Pass the two NGS Coastal Maine 2022 GeoTIFFs (560000e_4910000n and
565000e_4910000n), the 1451-square 3DEP inner grid from bake_acadia_coast.py,
and the game directory. Requires NumPy, SciPy, rasterio, pyproj, scikit-fmm
and Pillow. Source georeferencing and licenses are in acadia-scenery-credits.txt.
"""
import argparse
import io
import struct
from pathlib import Path

import numpy as np
import rasterio
import skfmm
from PIL import Image
from pyproj import Transformer
from scipy.ndimage import distance_transform_edt, map_coordinates
from bake_hamnoy_shelter import chunks, pack

LEFT, TOP, RIGHT, BOTTOM = -570, -1550, 1600, 1650
SPACING, PERIOD, SEA = 2, 7.6, .16


def sample(array, x, z):
    return map_coordinates(array, [(z-TOP)/SPACING, (x-LEFT)/SPACING],
                           order=1, prefilter=False, mode='nearest')


def coast_elevation(tiles, terrestrial):
    xs = np.arange(LEFT, RIGHT+1, SPACING)
    zs = np.arange(TOP, BOTTOM+1, SPACING)
    x, z = np.meshgrid(xs, zs)
    transform = Transformer.from_crs(32619, 6348, always_xy=True)
    easting, northing = transform.transform(x+564651, 4907768-z)
    height = np.full(x.shape, np.nan, 'f4')
    for path in tiles:
        with rasterio.open(path) as raster:
            data = raster.read(1)
            data[data==raster.nodata] = np.nan
            col = (easting-raster.transform.c)/raster.transform.a-.5
            row = (northing-raster.transform.f)/raster.transform.e-.5
            inside = (col>=0)&(col<raster.width-1)&(row>=0)&(row<raster.height-1)
            height[inside] = map_coordinates(data,[row[inside],col[inside]],order=1,prefilter=False,mode='nearest')
    measured = np.isfinite(height)
    usgs = np.asarray(Image.open(terrestrial), dtype='f4')
    assert usgs.shape==(1451,1451)
    land = map_coordinates(usgs, [(z+1450)/2,(x+1450)/2], order=1,prefilter=False,mode='nearest')
    gap, near = distance_transform_edt(~measured,sampling=SPACING,return_indices=True)
    extended_bed = height[tuple(near)]-np.maximum(0,gap-3)*.11
    outside = np.where((land>SEA)&(gap>8)&(x<900),land,extended_bed)
    return np.where(measured,height,outside),measured


def arrival_time(height):
    wet = height<SEA
    distance = SPACING*(distance_transform_edt(wet)-distance_transform_edt(~wet))
    depth = np.maximum(.20,SEA-height)
    omega, gravity = 2*np.pi/PERIOD,9.81
    k = np.maximum(omega**2/gravity,omega/np.sqrt(gravity*depth))
    # Phase velocity of a gravity wave: omega squared = g k tanh(k h).
    for _ in range(8):
        th = np.tanh(k*depth)
        k = np.maximum(.001,k-(gravity*k*th-omega**2)/(gravity*(th+k*depth*(1-th*th))))
    rows,cols = wet.shape
    margin = 300
    inverse = np.pad(np.where(wet,k/omega,np.inf),((margin,margin),(0,margin)),mode='edge')
    deep = omega/gravity
    inverse[:margin] = deep
    inverse[-margin:] = deep
    inverse[:,cols:] = deep
    x = np.arange(cols+margin,dtype='f4')*SPACING+LEFT
    z = np.arange(-margin,rows+margin,dtype='f4')*SPACING+TOP
    plane = x[None,:]*.91+z[:,None]*.415-(.91*(RIGHT+375)+.415*(BOTTOM+85))
    blocked = ~np.isfinite(inverse)
    speed = np.where(blocked,0,1./np.where(blocked,1.,inverse))
    # A continuous offshore crest travels most slowly across shoals. Land
    # occludes it. Fast marching lets it bend into a cove from the open side.
    arrivals = skfmm.travel_time(np.ma.MaskedArray(plane,mask=blocked),speed,dx=float(SPACING),order=2)
    travel = np.ma.filled(arrivals,np.inf)[margin:margin+rows,:cols]
    connected = wet & np.isfinite(travel)
    nearest = distance_transform_edt(~connected,return_distances=False,return_indices=True)
    travel = np.where(connected,travel,travel[tuple(nearest)])+np.maximum(0,-distance)/3.2
    return distance.astype('f4'),travel.astype('f4')


def write_breakers(height, distance, time, target):
    z,x = np.mgrid[-1450:1451:4,-1450:1451:4]
    bed,shore = sample(height,x,z),sample(distance,x,z)
    active = (x>-300)&(shore>-18)&(shore<80)&(bed<12)
    cells = active[1:,1:]|active[1:,:-1]|active[:-1,1:]|active[:-1,:-1]
    corners = np.zeros_like(active)
    for j in (0,1):
        for i in (0,1):
            corners[j:j+cells.shape[0],i:i+cells.shape[1]] |= cells
    ids = np.full(active.shape,-1,np.int32)
    ids[corners] = np.arange(corners.sum())
    xv,zv = x[corners],z[corners]
    chamber = sample(time,np.array([54.3]),np.array([-33.8]))[0]
    phase = np.clip(sample(time,xv,zv)-chamber,-310,310)
    energy = np.zeros_like(xv,'f4')
    for angle in np.linspace(.10,.84,11):
        shadow = np.zeros_like(energy)
        for reach in [12,23,40,66,100,160,235,340]:
            h = sample(height,xv+np.cos(angle)*reach,zv+np.sin(angle)*reach)
            shadow = np.maximum(shadow,np.clip((h-.19)/1.4,0,1)/(1+.0015*reach))
        energy += 1-shadow
    energy /= 11
    vertices = np.column_stack((xv,zv,np.clip(bed[corners],-38,12)*100,shore[corners]*10,
                                phase*100,energy*1000)).round().astype('<i2')
    a,b,c,d = ids[:-1,:-1][cells],ids[:-1,1:][cells],ids[1:,:-1][cells],ids[1:,1:][cells]
    triangles = np.stack([a,c,b,b,c,d],axis=1).astype('<u2')
    assert len(vertices)<65536
    target.write_bytes(struct.pack('<4sII',b'ACS2',len(vertices),triangles.size)+vertices.tobytes()+triangles.tobytes())


def encode_depth(height, measured, target):
    source = target.read_bytes()
    w,h = Image.open(io.BytesIO(source)).size
    z,x = np.mgrid[0:h,0:w]
    x,z = ((x+.5)/w*2-1)*3328,((z+.5)/h*2-1)*3328
    has_depth = sample(measured.astype('f4'),x,z)>.7
    has_depth &= (x>LEFT+6)&(x<RIGHT-6)&(z>TOP+6)&(z<BOTTOM-6)
    floor = sample(height,x,z)
    alpha = np.where(has_depth,128+np.rint(126*np.sqrt(np.clip((SEA-floor)/24,0,1))),127).astype('u1')
    # Retain the exact existing compressed RGB. Alpha encodes shallow depths
    # more precisely; 127 signals that normal regional optics should be used.
    carrier = Image.new('RGBA',(w,h),(140,140,140,255))
    carrier.putalpha(Image.fromarray(alpha))
    tmp = io.BytesIO()
    carrier.save(tmp,format='WEBP',quality=82)
    plane = next(value for tag,value in chunks(tmp.getvalue()) if tag==b'ALPH')
    color = next(value for tag,value in chunks(source) if tag==b'VP8 ')
    header = b'\x10\0\0\0'+(w-1).to_bytes(3,'little')+(h-1).to_bytes(3,'little')
    records = b'WEBP'+pack(b'VP8X',header)+pack(b'ALPH',plane)+pack(b'VP8 ',color)
    target.write_bytes(b'RIFF'+struct.pack('<I',len(records))+records)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('west',type=Path)
    parser.add_argument('east',type=Path)
    parser.add_argument('terrestrial',type=Path)
    parser.add_argument('game',type=Path)
    args = parser.parse_args()
    height,reported = coast_elevation([args.west,args.east],args.terrestrial)
    shore,arrival = arrival_time(height)
    write_breakers(height,shore,arrival,args.game/'acadia-tidal-reaches.bin')
    encode_depth(height,reported,args.game/'atlas-acadia-shore.webp')


if __name__=='__main__':
    main()
