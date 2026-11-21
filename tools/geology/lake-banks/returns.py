"""Rasterize crown and roof returns from just the public USGS octree nodes covering each lake shore."""

from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
import json, hashlib, threading, time
import requests, laspy, numpy as np
from pyproj import Transformer
from sources import sites, origins
import argparse

BASE = "https://s3-us-west-2.amazonaws.com/usgs-lidar-public/"
SETS = {
    "winnipesaukee": "USGS_LPC_CT_River_Lot6_Winnipesaulee_2015_LAS_2017",
    "moosehead": "USGS_LPC_ME_Western_2016_LAS_2017",
}
local = threading.local()


def read(url):
    if not hasattr(local, "s"):
        local.s = requests.Session()
    for attempt in range(3):
        try:
            r = local.s.get(url, timeout=(10, 35))
            r.raise_for_status()
            return r.content
        except requests.RequestException:
            if attempt == 2:
                raise
            time.sleep(1 + attempt)


def run(name, out):
    world, cx, cz, half = sites[name]
    e = origins[world][0] + cx
    n = origins[world][1] - cz
    size = half * 2
    destination = out / (name + "-ept.npz")
    base = (
        BASE + SETS[world] + "/"
        if world == "winnipesaukee"
        else "https://noaa-nos-coastal-lidar-pds.s3.amazonaws.com/entwine/geoid18/6264/"
    )
    last_destination = out / (name + "-last-ept.npz")
    if destination.is_file() and last_destination.is_file():
        return
    meta = json.loads(read(base + "ept.json"))
    epsg = int(meta["srs"]["horizontal"])
    inv = Transformer.from_crs(epsg, 32619, always_xy=True)
    box = Transformer.from_crs(32619, epsg, always_xy=True).transform_bounds(
        e - half, n - half, e + half, n + half
    )
    xmin, ymin, _, xmax, ymax, _ = meta["bounds"]
    keys = {}
    done = set()
    pending = ["0-0-0-0"]

    def touches(key):
        level, i, j, _ = map(int, key.split("-"))
        dx = (xmax - xmin) / 2**level
        dy = (ymax - ymin) / 2**level
        x = xmin + i * dx
        y = ymin + j * dy
        return x < box[2] and x + dx > box[0] and y < box[3] and y + dy > box[1]

    while pending:
        key = pending.pop()
        if key in done:
            continue
        done.add(key)
        hier = json.loads(read(base + "ept-hierarchy/" + key + ".json"))
        for k, num in hier.items():
            if not touches(k):
                continue
            if num < 0:
                if k not in done:
                    pending.append(k)
            elif num:
                keys[k] = num
    assert keys and meta["dataType"] == "laszip"
    print(
        name,
        len(keys),
        "selected octree nodes",
        sum(keys.values()),
        "returns before clipping",
        flush=True,
    )
    floor = np.full(size * size, np.inf, "f4")
    tree = np.full_like(floor, -np.inf)
    roof = np.full_like(floor, -np.inf)
    late = np.full_like(floor, np.inf)
    lock = threading.Lock()

    def extract(k):
        raw = read(base + "ept-data/" + k + ".laz")
        points = laspy.read(BytesIO(raw))
        east, north = inv.transform(points.x, points.y)
        x = np.floor(east - e + half).astype("i4")
        j = np.floor(n + half - north).astype("i4")
        valid = (
            (x >= 0)
            & (j >= 0)
            & (x < size)
            & (j < size)
            & ~np.asarray(points.withheld, dtype=bool)
        )
        ix = j[valid] * size + x[valid]
        c = np.asarray(points.classification)[valid]
        first = np.asarray(points.return_number)[valid] == 1
        y = np.asarray(points.z)[valid]
        gd = c == 2
        vt = first & np.isin(c, [0, 1, 3, 4, 5])
        bl = first & np.isin(c, [0, 1, 6])
        final = (
            np.asarray(points.return_number)[valid]
            == np.asarray(points.number_of_returns)[valid]
        ) & np.isin(c, [0, 1, 6])
        with lock:
            np.minimum.at(late, ix[final], y[final])
            np.minimum.at(floor, ix[gd], y[gd])
            np.maximum.at(tree, ix[vt], y[vt])
            np.maximum.at(roof, ix[bl], y[bl])
        return dict(
            key=k,
            sha256=hashlib.sha256(raw).hexdigest(),
            selected=[int(gd.sum()), int(vt.sum()), int(bl.sum())],
        )

    with ThreadPoolExecutor(4) as pool:
        rows = list(pool.map(extract, sorted(keys)))
    pack = lambda a: (
        np.where(np.isfinite(a), np.rint(a * 20), -32768)
        .astype("i2")
        .reshape(size, size)
    )
    np.savez_compressed(destination, top=pack(tree), floor=pack(floor), roof=pack(roof))
    np.savez_compressed(last_destination, roof=pack(late))
    totals = np.sum([r["selected"] for r in rows], axis=0).tolist()
    (out / (name + "-ept-receipt.json")).write_text(
        json.dumps(
            dict(
                source=base + "ept.json",
                sourceCrs=epsg,
                units="5 cm",
                counts=totals,
                nodes=rows,
            ),
            indent=2,
        )
    )
    print(name, totals, destination.stat().st_size, flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", required=True, type=Path)
    parser.add_argument("sites", nargs="*")
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    for name in args.sites or sites:
        run(name, args.cache)
