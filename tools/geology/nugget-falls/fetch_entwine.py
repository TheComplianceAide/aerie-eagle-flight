"""Extract older 2012 USGS lidar immediately inland of the separate 2013 Juneau collection.

The public Entwine hierarchy is traversed spatially. Only nodes touching the
Nugget Falls site are requested. Each compressed node is discarded after gridding.
"""

from concurrent.futures import ThreadPoolExecutor
from argparse import ArgumentParser
from pathlib import Path
from io import BytesIO
import requests, numpy as np, json, laspy, threading
from pyproj import Transformer
from scipy.ndimage import distance_transform_edt
from fetch_canopy import BOUNDS, ORIGIN

BASE = "https://s3-us-west-2.amazonaws.com/usgs-lidar-public/AK_Juneau_2012/"


def main():
    parser = ArgumentParser()
    parser.add_argument("cache", type=Path)
    d = parser.parse_args().cache
    d.mkdir(parents=True, exist_ok=True)
    meta = requests.get(BASE + "ept.json", timeout=20).json()
    srs = meta["srs"].get("horizontal")
    forward = Transformer.from_crs(32608, int(srs), always_xy=True)
    native = Transformer.from_crs(int(srs), 32608, always_xy=True)
    l, t, r, b = BOUNDS
    w = r - l
    h = b - t
    cx, cy = ORIGIN
    box = forward.transform_bounds(cx + l, cy - b, cx + r, cy - t)
    minx, miny, minz, maxx, maxy, maxz = meta["bounds"]
    print(
        "source bounds",
        meta["bounds"],
        meta["dataType"],
        "selection box",
        box,
        flush=True,
    )

    def hits(k):
        depth, i, j, z = map(int, k.split("-"))
        unit = (maxx - minx) / 2**depth
        x = minx + i * unit
        y = miny + j * unit
        return x < box[2] and y < box[3] and x + unit > box[0] and y + unit > box[1]

    frontier = ["0-0-0-0"]
    nodes = {}
    seen = set()
    while frontier:
        k = frontier.pop()
        seen.add(k)
        doc = requests.get(BASE + "ept-hierarchy/" + k + ".json", timeout=20).json()
        for key, n in doc.items():
            if not hits(key):
                continue
            if n == -1:
                if key not in seen:
                    frontier.append(key)
            elif n > 0:
                nodes[key] = n
    print(len(nodes), "nodes", sum(nodes.values()), "possible returns", flush=True)
    size = w * h
    groundSum = np.zeros(size, "f8")
    groundN = np.zeros(size, "u4")
    first = np.full(size, -np.inf, "f")
    reflectance = np.zeros(size, "f8")
    count = np.zeros(size, "u4")
    lock = threading.Lock()

    def extract(k):
        uri = BASE + "ept-data/" + k + ".laz"
        resp = requests.get(uri, timeout=30)
        resp.raise_for_status()
        a = laspy.read(BytesIO(resp.content))
        x, y = native.transform(a.x, a.y)
        ix = np.floor(x - cx - l).astype("i4")
        iz = np.floor(cy - y - t).astype("i4")
        ok = (
            (ix >= 0)
            & (ix < w)
            & (iz >= 0)
            & (iz < h)
            & ~np.asarray(a.withheld, dtype=bool)
        )
        cl = np.asarray(a.classification)
        idx = ix + iz * w
        gd = ok & (cl == 2)
        can = ok & (np.asarray(a.return_number) == 1) & np.isin(cl, [1, 2, 3, 4, 5])
        alt = np.asarray(a.z, dtype="f")
        br = np.asarray(a.intensity, dtype="f")
        with lock:
            np.add.at(groundSum, idx[gd], alt[gd])
            np.add.at(groundN, idx[gd], 1)
            np.maximum.at(first, idx[can], alt[can])
            np.add.at(reflectance, idx[can], br[can])
            np.add.at(count, idx[can], 1)
        return int(np.count_nonzero(ok))

    with ThreadPoolExecutor(4) as pool:
        total = sum(pool.map(extract, nodes))
    valid = groundN.reshape(h, w) > 0
    cover = count.reshape(h, w) > 0
    ground = np.divide(groundSum, np.maximum(groundN, 1), dtype="f").reshape(h, w)
    dist, ii = distance_transform_edt(~valid, return_indices=True)
    ground[~valid] = ground[tuple(ii)][~valid]
    ground[~cover] = np.nan
    chm = np.clip(first.reshape(h, w) - ground, 0, 65)
    chm[~cover] = np.nan
    inte = np.divide(reflectance, np.maximum(count, 1), dtype="f").reshape(h, w)
    np.savez_compressed(
        d / "nugget-2012-return-grids.npz",
        ground=ground,
        height=np.float16(chm),
        intensity=np.uint16(np.clip(inte, 0, 65535)),
        groundDistance=np.uint8(np.minimum(255, dist)),
        bounds=BOUNDS,
    )
    (d / "nugget-2012-sources.json").write_text(
        json.dumps(dict(dataset=BASE, touchedNodes=nodes, inside=total), indent=2)
        + "\n"
    )
    print(
        "processed",
        total,
        "coverage cells",
        np.sum(cover),
        "heights >3m",
        np.sum(chm > 3),
        flush=True,
    )


if __name__ == "__main__":
    main()
