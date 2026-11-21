"""Recover the 2013 Juneau RGB orthophoto registered on the lidar point returns.

NOAA's COPC uses LAS point format 7. The color channels are calibrated
8-bit source mosaic values stored in the high byte. Grid first returns into
one-metre cells over the same footprint as the canopy. Off-ground water has
no returns; its color is not reconstructed by this stage.
"""

from argparse import ArgumentParser
from hashlib import sha256
from pathlib import Path
from tempfile import TemporaryFile
import json
import laspy
import numpy as np
import requests
from fetch_canopy import BASE, TILES, BOUNDS, ORIGIN


def main():
    parser = ArgumentParser()
    parser.add_argument("cache", type=Path)
    cache = parser.parse_args().cache
    l, t, r, b = BOUNDS
    w = r - l
    h = b - t
    rgbTotal = np.zeros((3, h * w), "f8")
    count = np.zeros(h * w, "u4")
    sources = []
    for key in TILES:
        url = BASE + key
        digest = sha256()
        inside = 0
        with TemporaryFile() as f:
            with requests.get(url, stream=True, timeout=(12, 75)) as response:
                response.raise_for_status()
                for part in response.iter_content(1024 * 1024):
                    f.write(part)
                    digest.update(part)
            f.seek(0)
            with laspy.open(f, closefd=False) as src:
                assert {"red", "green", "blue"} <= set(
                    src.header.point_format.dimension_names
                )
                for data in src.chunk_iterator(400000):
                    x = np.floor(np.asarray(data.x) - ORIGIN[0] - l).astype("i")
                    z = np.floor(ORIGIN[1] - np.asarray(data.y) - t).astype("i")
                    keep = (
                        (x >= 0)
                        & (x < w)
                        & (z >= 0)
                        & (z < h)
                        & (~np.asarray(data.withheld, dtype=bool))
                    )
                    keep &= np.asarray(data.return_number) == 1
                    rgb = np.stack([data.red, data.green, data.blue])
                    keep &= np.any(rgb > 0, axis=0)
                    idx = x[keep] + w * z[keep]
                    inside += len(idx)
                    np.add.at(count, idx, 1)
                    for ib, a in enumerate(rgb):
                        np.add.at(rgbTotal[ib], idx, a[keep].astype("f") / 256)
        sources.append(dict(url=url, sha256=digest.hexdigest(), colorReturns=inside))
        print(key, inside, flush=True)
    rgb = np.uint8(np.clip(np.rint(rgbTotal / np.maximum(count, 1)), 0, 255)).reshape(
        3, h, w
    )
    count = np.minimum(count.reshape(h, w), 255).astype("u1")
    np.savez_compressed(
        cache / "nugget-2013-color.npz", rgb=rgb, count=count, bounds=BOUNDS
    )
    (cache / "nugget-2013-color-sources.json").write_text(
        json.dumps(sources, indent=2) + "\n"
    )
    print(int((count > 0).sum()), "one-metre colored cells", flush=True)


if __name__ == "__main__":
    main()
