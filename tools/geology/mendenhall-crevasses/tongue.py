"""Fetch the full contiguous central-ice 5 m macro grid across the two survey windows."""

from argparse import ArgumentParser
from pathlib import Path
import json
import requests
import numpy as np
import rasterio
from rasterio.transform import from_origin
from rasterio.warp import reproject, Resampling
from pyproj import Transformer

parser = ArgumentParser()
parser.add_argument("cache", type=Path)
q = parser.parse_args().cache
q.mkdir(exist_ok=True, parents=True)
origin = (526511.0, 6477009.0)
base = "https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/OPR/Projects/AK_SouthEastLandslides_D22/AK_SELandslides_2_D22/TIFF/USGS_OPR_AK_SouthEastLandslides_D22_"
# Centre the raster cells on the exact 5 m vertices used by the game.
left, top, right, bottom = -1200, -5000, 2800, -500
step = 5
out = np.full(
    (1 + (bottom - top) // step, 1 + (right - left) // step), np.nan, np.float32
)
ox, oy = origin
aff = from_origin(ox + left - step * 0.5, oy - top + step * 0.5, step, step)
tiles = []
with rasterio.Env(
    GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
    GDAL_HTTP_MAX_RETRY="3",
    CPL_VSIL_CURL_CACHE_SIZE=33554432,
):
    with rasterio.open("/vsicurl/" + base + "768734.tif") as fid:
        source_crs = fid.crs
    tr = Transformer.from_crs(32608, source_crs, always_xy=True)
    a, b, c, d = tr.transform_bounds(
        ox + left - 5, oy - bottom - 5, ox + right + 5, oy - top + 5
    )
    for i in range(int(a // 1000), int(c // 1000) + 1):
        for j in range(int(b // 1000), int(d // 1000) + 1):
            url = base + str(i) + str(j) + ".tif"
            head = requests.head(url, timeout=25)
            if head.status_code == 404:
                continue
            head.raise_for_status()
            with rasterio.open("/vsicurl/" + url) as ds:
                reproject(
                    rasterio.band(ds, 1),
                    out,
                    src_crs=ds.crs,
                    src_transform=ds.transform,
                    dst_crs="EPSG:32608",
                    dst_transform=aff,
                    src_nodata=ds.nodata,
                    dst_nodata=np.nan,
                    init_dest_nodata=False,
                    resampling=Resampling.average,
                )
            tiles.append(url)
            print(i, j, flush=True)
np.savez_compressed(
    q / "tongue-survey.npz", elev=out, bounds=(left, top, right, bottom), step=step
)
(q / "tongue-survey.json").write_text(
    json.dumps(
        {
            "bounds": [left, top, right, bottom],
            "sampleM": step,
            "finite": float(np.isfinite(out).mean()),
            "tiles": tiles,
        },
        indent=2,
    )
    + "\n"
)
