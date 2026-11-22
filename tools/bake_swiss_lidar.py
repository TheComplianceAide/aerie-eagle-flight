"""Pack the qualified dry Oeschinen inset from the 2025 swissALTI3D 0.5 m tile.

Run with the stock flight probe's sampled local coordinates, elevation and
clearance (points property). Requires numpy and rasterio. This does not fit a
vertical shift. The stock simulation uses 1,574.9 m LN02 for lake level.
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import from_origin
from rasterio.warp import reproject, Resampling

ORIGIN = (2622000, 1150000)
BOUNDS = (-1760, -560, -1440, -240)
SOURCE = "https://data.geo.admin.ch/ch.swisstopo.swissalti3d/swissalti3d_2025_2620-1150/swissalti3d_2025_2620-1150_0.5_2056_5728.tif"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("stock_samples", type=Path)
    args = parser.parse_args()
    left, top, right, bottom = BOUNDS
    width, height = right - left, bottom - top
    ground = np.full((height, width), -9999, dtype=np.float32)
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_TIMEOUT=25), rasterio.open(SOURCE) as ras:
        if ras.res != (.5, .5) or ras.crs.to_epsg() != 2056:
            raise ValueError("Wrong native Swiss terrain source")
        reproject(
            rasterio.band(ras, 1), ground, dst_crs=ras.crs, dst_nodata=-9999,
            dst_transform=from_origin(ORIGIN[0] + left, ORIGIN[1] - top, 1, 1),
            resampling=Resampling.average,
        )
    if not np.all(np.isfinite(ground) & (ground > 1590)):
        raise ValueError("Unexpected missing, wet or invalid source cells")
    local = ground - 1574.9
    raw_points = json.loads(args.stock_samples.read_text())["points"]
    sample = [point[:3] for point in raw_points
              if left <= point[0] < right and top <= point[1] < bottom and point[2] > 15]
    train, hold = [], []
    for x, z, y in sample:
        i, j = int(x - left), int(z - top)
        if not 4 <= i < width - 4 or not 4 <= j < height - 4:
            continue
        grade = np.hypot(local[j, i+4] - local[j, i-4], local[j+4, i] - local[j-4, i]) / 8
        if grade > .74:
            continue
        group = train if (round((x + 1780)/22.5) + round((z + 580)/21.25)) % 2 == 0 else hold
        group.append(float(local[j, i]) - y)
    def summary(data):
        return {"count": len(data), "p05P25P50P75P95M": np.percentile(data, [5, 25, 50, 75, 95]).round(3).tolist()}
    if min(len(train), len(hold)) < 70 or abs(np.median(hold)) > .7 or np.quantile(np.abs(hold), .95) > 1.75:
        raise ValueError("Dry stock holdouts did not qualify")
    scale, offset = .01, 100
    heights = np.rint((local - offset) / scale)
    if np.any((heights < -32767) | (heights > 32767)):
        raise ValueError("Terrain does not fit the signed centimetre pack")
    pack = gzip.compress(heights.astype("<i2").tobytes(), compresslevel=9, mtime=0)
    meta = {
        "schema": 1, "world": "swiss", "epsg": 2056, "origin": ORIGIN, "bounds": BOUNDS,
        "width": width, "height": height, "step": 1, "scaleM": scale, "offsetM": offset,
        "vertical": "LN02 minus 1574.9 m. No fitted vertical shift.",
        "source": SOURCE, "nativeMeters": .5, "assetTileVintage": 2025,
        "attribution": "© Federal Office of Topography swisstopo",
        "license": "https://www.swisstopo.admin.ch/en/terms-of-use-free-geodata-and-geoservices",
        "processing": "Range-read the official 0.5 m DTM, average to 1 m and quantize to centimetres.",
        "training": summary(train), "holdout": summary(hold),
        "compressedSha256": hashlib.sha256(pack).hexdigest(),
    }
    output = Path(__file__).resolve().parents[1] / "game" / "geodata"
    (output / "swiss-lidar.bin").write_bytes(pack)
    (output / "swiss-lidar.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(meta["training"], meta["holdout"], len(pack))


if __name__ == "__main__":
    main()
