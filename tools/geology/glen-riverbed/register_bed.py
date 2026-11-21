"""Reproject the original 1 m USGS Glen Canyon bathymetry and bed-material rasters.

Run from any directory. Requires numpy, scipy, Pillow and rasterio. The source
archive is read from a local cache, or fetched from the official USGS item after
requesting --download. A SHA-256 check protects both paths.
"""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import urlretrieve

import numpy as np
from PIL import Image
import rasterio
from rasterio.transform import from_origin
from rasterio.warp import reproject, Resampling
from scipy import ndimage as nd
from scipy.interpolate import RegularGridInterpolator
from scipy.spatial import cKDTree

HERE = Path(__file__).resolve().parent
SOURCE = 'https://www.sciencebase.gov/catalog/file/get/5f3aab9c82ce8df5b6c4074b?f=__disk__40%2F5d%2F36%2F405d3636addee8acb5222d51f7ce25f00d754666'
CHECKSUM = 'acb3215b5f448487d1843d77e671ea1691c69801928b9a9faf9cf445537ed9f1'
RECT = (-2300, -2900, 250, 950)
ORIGIN = (454517, 4081578)
SPACING = 2

def create(archive, game, output, download):
    if download and not archive.is_file():
        urlretrieve(SOURCE, archive)
    with archive.open('rb') as src:
        h = hashlib.sha256()
        for chunk in iter(lambda: src.read(1 << 20), b''):
            h.update(chunk)
        if h.hexdigest() != CHECKSUM:
            raise ValueError('USGS distribution SHA-256 differs from the cited release')
    left, top, right, bottom = RECT
    xx, zz = np.meshgrid(np.arange(left, right+1, SPACING), np.arange(top, bottom+1, SPACING))
    transform = from_origin(ORIGIN[0]+left-SPACING/2, ORIGIN[1]-top+SPACING/2, SPACING, SPACING)
    def warp(key, suffix='', numeric=True):
        folder = f'GlenCanyon_{key}_2014'
        entry = f'Glen_Canyon_2014/{folder}/{folder}{suffix}.tif'
        nodata = -9999 if numeric else 255
        out = np.full(xx.shape, nodata, dtype='f4' if numeric else 'u1')
        with rasterio.Env(GDAL_CACHEMAX=32), rasterio.open(f'zip://{archive.resolve()}!{entry}') as ds:
            reproject(rasterio.band(ds, 1),out,src_transform=ds.transform,src_crs=ds.crs,
                      src_nodata=ds.nodata,dst_crs='EPSG:32612',dst_transform=transform,
                      dst_nodata=nodata,resampling=Resampling.bilinear if numeric else Resampling.nearest,
                      warp_mem_limit=32)
        return out
    bed = warp('DEM')
    source = warp('Source', numeric=False)
    material = warp('BedClass', '_Int', numeric=False)
    uncertainty = warp('Uncertainty')
    wet = np.asarray(Image.open(game/'canyon-flow.webp'))[:,:,0].astype('f4')
    mask = nd.map_coordinates(wet, [(zz/6400+.5)*wet.shape[0]-.5,(xx/6400+.5)*wet.shape[1]-.5],order=1,mode='nearest') > 180
    j,i = np.where(mask & (source!=255) & (bed > -9998))
    geoid = json.loads((HERE/'geoid18.json').read_text())
    geoid_x = [-2300,-1025,250]
    geoid_z = [-2900,-975,950]
    field = [[next(s['response']['geoidHeight'] for s in geoid if s['x']==x and s['z']==z)
              for x in geoid_x] for z in geoid_z]
    separation = RegularGridInterpolator((geoid_z,geoid_x),field)(np.c_[zz[j,i],xx[j,i]]).astype('f4')
    line = np.array(json.loads((HERE/'regulated-stage.json').read_text())['points'])
    stations = cKDTree(line[:,:2]).query(np.c_[xx[j,i],zz[j,i]])[1]
    np.savez_compressed(output,rect=RECT,sample_spacing=SPACING,wet_j=j.astype('i2'),wet_i=i.astype('i2'),
                        bed_navd88=(bed[j,i]-separation).astype('f4'),stage=line[stations,2].astype('f4'),
                        source=source[j,i],material=material[j,i],uncertainty=uncertainty[j,i])

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive',type=Path)
    parser.add_argument('game',type=Path)
    parser.add_argument('crop',type=Path)
    parser.add_argument('--download',action='store_true')
    opts=parser.parse_args()
    create(opts.archive,opts.game,opts.crop,opts.download)
