"""Grid the May 22, 2013 NOAA/Juneau lidar tiles around both sides of Nugget Falls.

Run `python fetch_canopy.py DATA_DIRECTORY`. Downloads are temporary. World axes are
metres east and south from EPSG:6337 (526511, 6477009). All ground/canopy heights
here use the same local survey datum, so vertical differences remain meaningful.
"""

import argparse, json, tempfile, hashlib
from pathlib import Path
from urllib.parse import urljoin
import requests, laspy, numpy as np
from scipy.ndimage import distance_transform_edt

BASE = "https://noaa-nos-coastal-lidar-pds.s3.amazonaws.com/laz/mllw/4813/"
TILES = [f"20130522_AK_Juneau_2013-2014_{i:06d}.copc.laz" for i in range(911, 918)]
BOUNDS = (-120, -320, 1740, 1690)
ORIGIN = (526511.0, 6477009.0)


def main():
    args = argparse.ArgumentParser()
    args.add_argument("cache", type=Path)
    d = args.parse_args().cache
    d.mkdir(parents=True, exist_ok=True)
    l, t, r, b = BOUNDS
    h, w = b - t, r - l
    size = h * w
    surface = np.full(size, -np.inf, "f")
    gsum = np.zeros(size, dtype="f8")
    gcount = np.zeros(size, "u4")
    power = np.zeros(size, "f8")
    pc = np.zeros(size, "u4")
    meta = []
    for fn in TILES:
        url = urljoin(BASE, fn)
        digest = hashlib.sha256()
        total = 0
        rec = {}
        with tempfile.NamedTemporaryFile(suffix=".laz") as tmp:
            with requests.get(url, timeout=(12, 60), stream=True) as reply:
                reply.raise_for_status()
                for block in reply.iter_content(1024 * 1024):
                    tmp.write(block)
                    digest.update(block)
            tmp.flush()
            with laspy.open(tmp.name) as f:
                head = f.header
                rec = {
                    "points": head.point_count,
                    "min": head.mins.tolist(),
                    "max": head.maxs.tolist(),
                }
                for data in f.chunk_iterator(500000):
                    X = np.floor(np.asarray(data.x) - ORIGIN[0] - l).astype("i4")
                    Z = np.floor(ORIGIN[1] - np.asarray(data.y) - t).astype("i4")
                    valid = (
                        (X >= 0)
                        & (X < w)
                        & (Z >= 0)
                        & (Z < h)
                        & ~np.asarray(data.withheld, dtype=bool)
                    )
                    idx = X[valid] + Z[valid] * w
                    y = np.asarray(data.z, dtype="f")[valid]
                    cl = np.asarray(data.classification)[valid]
                    first = np.asarray(data.return_number)[valid] == 1
                    high = first & np.isin(cl, [1, 2, 3, 4, 5])
                    ground = cl == 2
                    sam = idx[ground]
                    hg = y[ground]
                    np.add.at(gsum, sam, hg)
                    np.add.at(gcount, sam, 1)
                    np.maximum.at(surface, idx[high], y[high])
                    np.add.at(
                        power,
                        idx[high],
                        np.asarray(data.intensity, dtype="f")[valid][high],
                    )
                    np.add.at(pc, idx[high], 1)
                    total += np.count_nonzero(valid)
        meta.append(
            dict(
                name=fn,
                url=url,
                sha256=digest.hexdigest(),
                pointsInBounds=int(total),
                **rec,
            )
        )
        print(fn, total, flush=True)
    ground = np.divide(gsum, np.maximum(1, gcount), dtype="f").reshape(h, w)
    first = surface.reshape(h, w)
    valid = gcount.reshape(h, w) > 0
    cover = pc.reshape(h, w) > 0
    _, nn = distance_transform_edt(~valid, return_indices=True)
    ground[~valid] = ground[tuple(nn)][~valid]
    ground[~cover] = np.nan
    first[~cover] = np.nan
    height = np.clip(first - ground, 0, 62)
    intensity = np.divide(power, np.maximum(1, pc), dtype="f").reshape(h, w)
    height[np.isfinite(height) & (height < 0.5)] = 0
    # Sparse rock shadows can have no ground return. Write proximity and support
    # so downstream rendering can reject a height created by extrapolation.
    dist = distance_transform_edt(~valid)
    out = d / "nugget-2013-return-grids.npz"
    np.savez_compressed(
        out,
        ground=ground.astype("f4"),
        height=np.float16(height),
        intensity=np.uint16(np.clip(intensity, 0, 65535)),
        groundDistance=np.uint8(np.minimum(255, dist)),
        bounds=BOUNDS,
    )
    (d / "nugget-2013-sources.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(
        "water/ground footprint",
        np.count_nonzero(cover),
        "possible 3m foliage cells",
        np.count_nonzero(height > 3),
        "MB",
        out.stat().st_size / 1e6,
    )


if __name__ == "__main__":
    main()
