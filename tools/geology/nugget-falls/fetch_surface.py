"""Download the half-metre USGS bare-earth survey around Nugget Falls."""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import argparse, hashlib, json
import numpy as np
import requests
import rasterio
from rasterio.io import MemoryFile
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_origin

ORIGIN = (526511, 6477009)
BOUNDS = (-120, -320, 1740, 1690)
TILES = [(i, j) for i in (767, 768, 769) for j in (733, 734, 735)]
USGS = (
    "https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/OPR/Projects/"
    "AK_SouthEastLandslides_D22/AK_SELandslides_2_D22/TIFF/"
)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("cache", type=Path)
    args = parser.parse_args()
    cache = args.cache
    l, t, r, b = BOUNDS
    cx, cy = ORIGIN
    # Pixel centres correspond to integer world coordinates.
    dst = from_origin(cx + l - 0.5, cy - t + 0.5, 1, 1)
    shape = (b - t + 1, r - l + 1)
    ground = np.full(shape, np.nan, dtype="f4")
    sources = []

    def tile(ij):
        i, j = ij
        name = f"USGS_OPR_AK_SouthEastLandslides_D22_{i}{j}.tif"
        reply = requests.get(USGS + name, timeout=(10, 60))
        if reply.status_code == 404:
            return None
        reply.raise_for_status()
        return (name, reply.content)

    with ThreadPoolExecutor(3) as pool:
        for item in pool.map(tile, TILES):
            if item is None:
                continue
            name, raw = item
            with MemoryFile(raw) as stream, stream.open() as src:
                reproject(
                    rasterio.band(src, 1),
                    ground,
                    src_transform=src.transform,
                    src_crs="EPSG:6394",
                    src_nodata=src.nodata,
                    dst_transform=dst,
                    dst_crs="EPSG:32608",
                    dst_nodata=np.nan,
                    init_dest_nodata=False,
                    resampling=Resampling.bilinear,
                )
            sources.append(
                dict(source=USGS + name, sha256=hashlib.sha256(raw).hexdigest())
            )
    np.savez_compressed(cache / "nugget-d22-ground.npz", ground=ground, bounds=BOUNDS)
    print("D22", np.isfinite(ground).sum(), ground.shape, flush=True)
    (cache / "nugget-surface-sources.json").write_text(
        json.dumps(sources, indent=2) + "\n"
    )


if __name__ == "__main__":
    main()
