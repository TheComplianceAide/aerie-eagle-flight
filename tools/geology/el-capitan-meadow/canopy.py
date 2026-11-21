"""Match NCALM crown heights with living crowns in the later 2022 NAIP image."""

from argparse import ArgumentParser
from hashlib import sha256
from pathlib import Path
import json, base64, re
import laspy
import numpy as np
import requests
from scipy.ndimage import (
    distance_transform_edt,
    gaussian_filter,
    maximum_filter,
    map_coordinates,
)
from scipy.spatial import cKDTree
from PIL import Image
from shapely.geometry import Polygon, Point
from shapely.ops import unary_union
from shapely.prepared import prep

LIDAR = "https://opentopography.s3.sdsc.edu/pc-bulk/CA06_Stock/ot_m266400_4176800.laz"
CITATION = "Stock, G. (2006), Yosemite, CA: El Portal, Mariposa Grove, Yosemite Canyon & Tuolumne Meadows. National Center for Airborne Laser Mapping; OpenTopography. https://doi.org/10.5069/G9GQ6VP3. CC BY 4.0."
if __name__ == "__main__":
    p = ArgumentParser()
    p.add_argument("cache", type=Path)
    p.add_argument("game", type=Path)
    a = p.parse_args()
    c, g = a.cache, a.game
    tile = c / "meadow-2006.laz"
    if not tile.exists():
        with requests.get(LIDAR, stream=True, timeout=90) as response:
            response.raise_for_status()
            with tile.open("wb") as geo:
                for block in response.iter_content(1024 * 1024):
                    geo.write(block)
    sp = np.load(c / "meadow-spectra.npz")
    l, t, r, b = sp["bounds"]
    x0, z0 = 268678, 4179436
    shape = (int(b - t), int(r - l))
    low = np.full(shape, np.inf, "f")
    high = np.full(shape, -np.inf, "f")
    count = np.zeros(shape, "u2")
    hist = {}
    points = 0
    with laspy.open(tile) as laz:
        for block in laz.chunk_iterator(600000):
            x = np.floor(np.asarray(block.x) - x0 - l).astype("i4")
            z = np.floor(z0 - np.asarray(block.y) - t).astype("i4")
            good = (x >= 0) & (x < shape[1]) & (z >= 0) & (z < shape[0])
            cl = np.asarray(block.classification)
            valid = good & ~np.isin(cl, [7, 18])
            xx = x[valid]
            zz = z[valid]
            h = np.asarray(block.z, dtype="f")[valid]
            cl = cl[valid]
            k, no = np.unique(cl, return_counts=True)
            for key, value in zip(k, no):
                hist[str(int(key))] = hist.get(str(int(key)), 0) + int(value)
            points += len(h)
            np.maximum.at(high, (zz, xx), h)
            np.add.at(count, (zz, xx), 1)
            ground = cl == 2
            np.minimum.at(low, (zz[ground], xx[ground]), h[ground])
    assert np.isfinite(low).any()
    ground = low[
        tuple(
            distance_transform_edt(
                ~np.isfinite(low), return_distances=False, return_indices=True
            )
        )
    ]
    top = high[
        tuple(
            distance_transform_edt(
                ~np.isfinite(high), return_distances=False, return_indices=True
            )
        )
    ]
    hgt = np.maximum(0, top - gaussian_filter(ground, 2))
    rgbn = (
        sp["image"].astype("f").reshape(4, shape[0], 2, shape[1], 2).mean(axis=(2, 4))
    )
    red, gc, bl, nir = rgbn
    ndvi = (nir - red) / np.maximum(1, nir + red)
    # Crown matches must have a 2022 photosynthetic response at their top or in
    # the immediately surrounding foliage. This rejects removed/failed trees.
    live = (ndvi > 0.20) & (nir > 52) & ((red * 0.24 + gc * 0.56 + bl * 0.20) < 116)
    fraction = gaussian_filter(live.astype("f"), 2)
    surface = gaussian_filter(hgt, 1.5)
    polys = []
    meadowPolys = []
    for f in json.loads((c / "meadow-vegetation.json").read_text())["features"]:
        info = f["attributes"]
        rings = [Polygon(ring).buffer(0) for ring in f["geometry"]["rings"]]
        poly = max(rings, key=lambda s: s.area)
        for hole in rings:
            if hole is not poly:
                poly = poly.difference(hole)
        polys.append((int(info["MapCode"]), poly))
        if info["OBJECTID"] in (79058, 79118, 79057, 79117):
            meadowPolys.append(poly)
    # Top-down crown mapping across a few plausible radii separates adjacent
    # mature oaks while discarding duplicate shoots from the same canopy.
    candidates = []
    for lo, hi, win in [(4, 10, 6), (10, 19, 8), (19, 35, 10), (35, 70, 14)]:
        valid = (
            (surface >= lo)
            & (surface < hi)
            & (surface == maximum_filter(surface, size=win))
            & (fraction > 0.46)
        )
        for j, i in zip(*np.where(valid)):
            if min(i, j, shape[1] - i, shape[0] - j) < 14:
                continue
            alt = float(surface[j, i])
            x = float(l + i + 0.5)
            z = float(t + j + 0.5)
            q = Point(x0 + x, z0 - z)
            code = next((k for k, poly in polys if poly.covers(q)), 0)
            if code not in (2025, 2050, 8000, 3050, 3060, 3066, 1024):
                continue
            # Width along eight ground-plane axes down to 43% of the lidar
            # crown's height (or an intervening gap). Continuous stands can
            # overlap. Reject ground and open gravel by their surface heights.
            radii = []
            for ang in np.arange(16) * np.pi / 8:
                d = np.arange(1, 16, 0.5)
                heights = map_coordinates(
                    surface, [j + d * np.sin(ang), i + d * np.cos(ang)], order=1
                )
                stop = np.flatnonzero(heights < 0.48 * alt)
                radii.append(d[stop[0]] if stop.size else 14.5)
            radius = np.percentile(radii, 36)
            width = float(np.clip(radius * 1.83, 2.1, 22.0))
            candidates.append((x, z, alt, width, code, float(ndvi[j, i])))
    selected = []
    buckets = {}
    for row in sorted(candidates, key=lambda h: -h[2]):
        x, z, h, w, code, nd = row
        key = (int(x // 18), int(z // 18))
        close = [
            other
            for a1 in (-1, 0, 1)
            for b1 in (-1, 0, 1)
            for other in buckets.get((key[0] + a1, key[1] + b1), [])
        ]
        if any(
            (x - ox) ** 2 + (z - oz) ** 2 < min(7.0, 0.39 * (w + ow)) ** 2
            for ox, oz, oh, ow, _, _ in close
        ):
            continue
        selected.append(row)
        buckets.setdefault(key, []).append(row)
    # Regional map/NAIP distinguish broadleaf stands from conifers. For an
    # isolated meadow tree, broad width relative to height is evidence only.
    records = []
    codehist = {}
    for x, z, h, w, code, nd in selected:
        broad = code in (2025, 2050, 1024) or code == 8000 and w / h > 0.40
        species = 2 if broad and code == 2050 else 1 if broad else 0
        records.append(
            [round(x * 2), round(z * 2), round(h * 4), round(w * 4), species]
        )
        codehist[code] = codehist.get(code, 0) + 1
    data = np.asarray(records, dtype="<i2")
    # Only replace the named meadow and its 60 m wooded margin. Survivors
    # in the 2022 image that postdate the lidar remain in the original field.
    domain = prep(unary_union(meadowPolys).buffer(60))
    local = lambda x, z: (
        min(x - l, r - x, z - t, b - z) > 15 and domain.covers(Point(x0 + x, z0 - z))
    )
    use = [row for row in records if local(row[0] / 2, row[1] / 2)]
    record = np.dtype(
        [
            ("x", "<i2"),
            ("z", "<i2"),
            ("w", "u1"),
            ("h", "u1"),
            ("s", "u1"),
            ("seed", "u1"),
        ]
    )
    bank = g / "atlas-yosemite-crowns.js"
    text = bank.read_text()
    old = np.frombuffer(
        base64.b64decode(re.search(r'window.yosemiteCanopy="([^"]+)"', text)[1]),
        dtype=record,
    )
    centers = np.array([[round(row[0] / 2), round(row[1] / 2)] for row in use])
    kd = cKDTree(centers)
    kept = np.ones(old.shape[0], bool)
    interior = matched = unsupported = 0
    for idx in np.flatnonzero(
        (old["x"] > l) & (old["x"] < r) & (old["z"] > t) & (old["z"] < b)
    ):
        tree = old[idx]
        x, z = int(tree["x"]), int(tree["z"])
        if not local(x, z):
            continue
        interior += 1
        j, i = round(z - t), round(x - l)
        gap, who = kd.query((x, z))
        radius = min(14, max(4, 0.51 * (use[who][3] / 4) + 0.16 * (tree["w"] / 8)))
        if gap < radius:
            kept[idx] = False
            matched += 1
        elif fraction[j, i] < 0.36:
            kept[idx] = False
            unsupported += 1
    inserted = np.zeros(len(use), record)
    for k, (ix, iz, ht, wd, group) in enumerate(use):
        x, z = map(int, centers[k])
        var = ((x * 1664525 + z * 1013904223) & 0xFFFFFFFF) % 251
        inserted[k] = (
            x,
            z,
            min(255, 2 * wd),
            min(255, ht),
            4 if group == 0 else 2 if group == 2 else 0,
            var,
        )
    new = np.concatenate([old[kept], inserted])
    encoded = base64.b64encode(new.tobytes()).decode("ascii")
    bank.write_text(
        re.sub(
            r'window.yosemiteCanopy="[^"]+"',
            'window.yosemiteCanopy="' + encoded + '"',
            text,
        )
    )
    change = dict(
        meadowAndBorderM=60,
        photoOnlyBefore=interior,
        matchedPriorTrees=matched,
        unsupportedPhotoBlobs=unsupported,
        retainedPhotoOnly=interior - matched - unsupported,
        insertedMeasured=len(use),
        rangeTotalBefore=len(old),
        rangeTotalAfter=len(new),
    )
    thumb = np.uint8(
        np.dstack(
            (
                np.clip(hgt / 40, 0, 1),
                np.clip(fraction, 0, 1),
                np.clip((red + gc + bl) / 380, 0, 1),
            )
        )
        * 255
    )
    Image.fromarray(thumb).save(c / "meadow-return-evidence.jpg")
    np.savez_compressed(
        c / "meadow-crown-field.npz",
        top=surface,
        ground=ground,
        records=data,
        live=fraction,
    )
    report = dict(
        source=LIDAR,
        sha256=sha256(tile.read_bytes()).hexdigest(),
        credit=CITATION,
        year=2006,
        classes=hist,
        points=points,
        accepted=len(records),
        shipped=change,
        mapCodes=codehist,
        heightPercentiles=np.percentile(data[:, 2] / 4, [5, 50, 95]).tolist(),
        widthPercentiles=np.percentile(data[:, 3] / 4, [5, 50, 95]).tolist(),
    )
    (c / "meadow-crowns.json").write_text(json.dumps(report, indent=2) + "\n")
    print(report, flush=True)
