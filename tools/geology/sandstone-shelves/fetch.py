"""Fetch only the necessary windows of USDA NAIP and USGS 3DEP cloud geotiffs."""
import argparse
from pathlib import Path

import numpy as np
import rasterio
import requests
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject

ORIGIN = (454517, 4081578)
BOUNDS = (-710, -400, -330, 35)
DEM = ('https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1m/Projects/'
       'AZ_NorthEast_D23/TIFF/USGS_1M_12_x45y409_AZ_NorthEast_D23.tif')
AERIAL = ('https://naipeuwest.blob.core.windows.net/naip/v002/az/2023/'
          'az_030cm_2023/36111/m_3611104_se_12_030_20230714_20240104.tif')


def read_window(url, band_count, metre_step, dtype, nodata):
    left, top, right, bottom = BOUNDS
    cols = round((right-left)/metre_step)
    rows = round((bottom-top)/metre_step)
    projected = np.full((band_count, rows, cols), nodata, dtype)
    transform = from_origin(ORIGIN[0]+left, ORIGIN[1]-top, metre_step, metre_step)
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',GDAL_HTTP_MAX_RETRY='3'):
        with rasterio.open('/vsicurl/'+url) as source:
            for index, output in enumerate(projected, start=1):
                reproject(rasterio.band(source,index), output,
                          src_transform=source.transform, src_crs=source.crs,
                          dst_transform=transform, dst_crs='EPSG:32612',
                          src_nodata=source.nodata, dst_nodata=nodata,
                          resampling=Resampling.bilinear)
    return projected


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('cache', type=Path)
    cache = parser.parse_args().cache
    cache.mkdir(parents=True,exist_ok=True)
    height = read_window(DEM,1,1.0,'float32',np.nan)[0]
    if not np.isfinite(height).all():
        raise RuntimeError('The source does not cover the selected sandstone shelf')
    response = requests.get('https://planetarycomputer.microsoft.com/api/sas/v1/sign',
                            params={'href': AERIAL}, timeout=60)
    response.raise_for_status()
    photo = read_window(response.json()['href'],4,.30,'uint8',0)
    if np.any(np.all(photo==0,axis=0)):
        raise RuntimeError('The NAIP tile has missing pixels in the registered crop')
    np.save(cache/'bank-survey.npy',height)
    np.savez_compressed(cache/'bank-photo.npz',photo=photo,bounds=BOUNDS,step=.30,origin=ORIGIN)


if __name__ == '__main__':
    main()
