"""Get the game's August 8, 2024 southeast Alaska Sentinel-2 L2A footprint."""

from argparse import ArgumentParser
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
import json
from pathlib import Path
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.windows import from_bounds

BASE = (
    "https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/"
    "8/V/NK/2024/8/S2A_8VNK_20240808_0_L2A/"
)


def retrieve(cache, band):
    url = f"{BASE}B{band:02d}.tif"
    path = cache / f"b{band}.npy"
    if not path.exists():
        cx, cy = 526511, 6477009
        with rasterio.Env(
            GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MAX_RETRY="3"
        ):
            with rasterio.open("/vsicurl/" + url) as survey:
                window = from_bounds(
                    cx - 18000,
                    cy - 18000,
                    cx + 18000,
                    cy + 18000,
                    transform=survey.transform,
                )
                data = survey.read(
                    1,
                    window=window,
                    out_shape=(3600, 3600),
                    resampling=Resampling.bilinear,
                    boundless=True,
                )
                np.save(path, data)
    return dict(band=band, source=url, sha256=sha256(path.read_bytes()).hexdigest())


if __name__ == "__main__":
    p = ArgumentParser()
    p.add_argument("cache", type=Path)
    cache = p.parse_args().cache
    cache.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(3) as pool:
        records = list(pool.map(lambda band: retrieve(cache, band), [2, 3, 4, 8]))
    (cache / "nugget-sentinel-sources.json").write_text(
        json.dumps(records, indent=2) + "\n"
    )
