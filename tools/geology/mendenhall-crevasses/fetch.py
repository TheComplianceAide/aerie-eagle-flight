from pathlib import Path
from argparse import ArgumentParser
import json, requests
import numpy as np, rasterio
from rasterio.transform import from_origin
from rasterio.warp import reproject, Resampling
from pyproj import Transformer
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, distance_transform_edt

ORIGIN = (526511, 6477009)
base = "https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/OPR/Projects/AK_SouthEastLandslides_D22/AK_SELandslides_2_D22/TIFF/USGS_OPR_AK_SouthEastLandslides_D22_"
parser = ArgumentParser()
parser.add_argument("cache", type=Path)
q = parser.parse_args().cache
q.mkdir(parents=True, exist_ok=True)
sites = {"upper": (960, -4700, 2060, -3600), "moraine": (145, -3000, 1245, -1900)}
for name, (l, t, r, b) in sites.items():
    ox, oy = ORIGIN
    step = 1
    out = np.full((b - t, r - l), np.nan, "f")
    aff = from_origin(ox + l, oy - t, step, step)
    receipts = []
    with rasterio.Env(
        GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MAX_RETRY="2"
    ):
        with rasterio.open("/vsicurl/" + base + "768734.tif") as anchor:
            target = anchor.crs
        tr = Transformer.from_crs(32608, target, always_xy=True)
        a, c, d, e = tr.transform_bounds(ox + l, oy - b, ox + r, oy - t)
        for i in range(int(a // 1000), int(d // 1000) + 1):
            for j in range(int(c // 1000), int(e // 1000) + 1):
                url = base + str(i) + str(j) + ".tif"
                valid = requests.head(url, timeout=15)
                if valid.status_code == 404:
                    continue
                valid.raise_for_status()
                with rasterio.open("/vsicurl/" + url) as f:
                    reproject(
                        rasterio.band(f, 1),
                        out,
                        src_transform=f.transform,
                        src_crs=f.crs,
                        dst_crs="EPSG:32608",
                        dst_transform=aff,
                        src_nodata=f.nodata,
                        dst_nodata=np.nan,
                        init_dest_nodata=False,
                        resampling=Resampling.bilinear,
                    )
                receipts.append(url)
    unknown = ~np.isfinite(out)
    if unknown.all():
        continue
    h = out[
        tuple(
            distance_transform_edt(unknown, return_distances=False, return_indices=True)
        )
    ]
    filtered = gaussian_filter(h, 7.8)
    high = h - filtered
    dy, dx = np.gradient(h)
    normal = np.dstack((-dx, np.ones_like(dx), -dy))
    normal /= np.maximum(0.001, np.linalg.norm(normal, axis=2)[..., None])
    shade = np.clip(0.50 + 0.49 * (normal @ np.array([-0.58, 0.53, 0.62])), 0, 1)
    wall = np.clip(0.49 + high / 6, 0, 1) * 0.43 + 0.57 * shade
    rgb = np.uint8(
        np.clip(np.stack([shade, wall, 0.77 * shade + 0.23 * wall], axis=2), 0, 1) * 255
    )
    rgb[unknown] = 35
    im = Image.fromarray(rgb)
    im.thumbnail((650, 650))
    im.save(q / (name + "-relief.jpg"), quality=89)
    np.savez_compressed(
        q / (name + "-survey.npz"), elev=out, bounds=(l, t, r, b), step=step
    )
    report = dict(
        bounds=(l, t, r, b),
        sourceResolution=0.5,
        sampledM=step,
        finite=float(1 - unknown.mean()),
        elevationAtCenter=float(out[(b - t) // 2, (r - l) // 2]),
        residualPercentiles=np.percentile(high[~unknown], [1, 5, 50, 95, 99]).tolist(),
        maxCrossGrade=np.percentile(np.hypot(dx, dy)[~unknown], [50, 90, 99]).tolist(),
        tiles=receipts,
    )
    (q / (name + "-survey.json")).write_text(json.dumps(report, indent=2) + "\n")
    print(name, report, flush=True)
