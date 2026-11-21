"""Restore the El Capitan Meadow portion of the existing valley cover texture."""

from pathlib import Path
from argparse import ArgumentParser
import json, base64
import numpy as np
from rasterio.features import rasterize
from rasterio.transform import from_origin
from shapely.geometry import Polygon, mapping
from shapely.ops import unary_union
from scipy.ndimage import gaussian_filter, distance_transform_edt

MEADOW_IDS = {79058, 79118, 79057, 79117}


def ramp(a, b, v):
    x = np.clip((v - a) / (b - a), 0, 1)
    return x * x * (3 - 2 * x)


if __name__ == "__main__":
    p = ArgumentParser()
    p.add_argument("cache", type=Path)
    p.add_argument("game", type=Path)
    args = p.parse_args()
    c, g = args.cache, args.game
    a = np.load(c / "meadow-spectra.npz")
    r, gg, b, nir = a["image"].astype("f")
    left, top, right, bottom = a["bounds"]
    step = float(a["nativeSamples"])
    vegetation = json.loads((c / "meadow-vegetation.json").read_text())
    polys = []
    for f in vegetation["features"]:
        if f["attributes"]["OBJECTID"] not in MEADOW_IDS:
            continue
        cells = [Polygon(v).buffer(0) for v in f["geometry"]["rings"]]
        site = max(cells, key=lambda p: p.area)
        for hole in cells:
            if hole is not site:
                site = site.difference(hole)
        polys.append(site)
    cx, cy = 268678, 4179436
    shape = r.shape
    tr = from_origin(cx + left, cy - top, step, step)
    region = rasterize(
        [(mapping(unary_union(polys)), 1)], out_shape=shape, transform=tr
    ).astype(bool)
    edge = (distance_transform_edt(region) - distance_transform_edt(~region)) * step
    zone = ramp(-3, 8, edge)
    ndvi = (nir - r) / np.maximum(1, nir + r)
    br = 0.24 * r + 0.56 * gg + 0.20 * b
    # August imagery contains separate shadowed oak crowns. Strongly green,
    # dark foliage belongs to the mapped tree system rather than grass.
    overhead = ramp(0.22, 0.54, ndvi) * (1 - ramp(52, 103, br))
    # Preserve young trees, pale exposed stone and paths visible in the
    # same registered photograph, rather than planting grass across them.
    pale = (1 - ramp(0.015, 0.14, ndvi)) * ramp(146, 190, br)
    openMeadow = (
        zone * (1 - gaussian_filter(overhead, 2.8)) * (1 - gaussian_filter(pale, 1.6))
    )
    moisture = ramp(0.035, 0.35, gaussian_filter(ndvi, 5.2))
    dryground = ramp(78, 119, br)
    cover = openMeadow * (0.73 + 0.23 * dryground)
    green = moisture * openMeadow
    # A compact locally indexed field also controls actual 3D plant clusters.
    field = np.dstack([np.uint8(cover * 255 + 0.5), np.uint8(moisture * 255 + 0.5)])
    # Average 4 m blocks. Unlike per-flower coordinates these are ecological
    # strata, to be sampled in world space beneath the eagle.
    factor = 8
    density = (
        field.reshape(shape[0] // factor, factor, shape[1] // factor, factor, 2)
        .mean(axis=(1, 3))
        .round()
        .astype("u1")
    )
    quant = np.rint(density / 17).astype("u1")
    packed = (quant[:, :, 0] << 4) | quant[:, :, 1]
    runs = bytearray()
    vals = packed.ravel()
    i = 0
    while i < len(vals):
        end = i + 1
        while end < len(vals) and end - i < 255 and vals[end] == vals[i]:
            end += 1
        runs.extend((end - i, int(vals[i])))
        i = end
    encoded = base64.b64encode(runs).decode("ascii")
    (g / "yosemite-meadow-field.js").write_text(
        "// 4 m sampled meadow cover and August foliage response, nibble-packed RLE.\nwindow.elCapMeadowRuns="
        + json.dumps(encoded)
        + ";\n"
    )

    out = dict(
        polygons=sorted(MEADOW_IDS),
        hectares=round(sum(g.area for g in polys) / 10000, 3),
        fieldShape=list(density.shape[:2]),
        vegetationTexelM=4,
        coverPixels=int(np.sum(zone > 0.01)),
        range="August orthophotography resolves vegetation patches; individual stems are modeled",
    )
    (c / "meadow-bake.json").write_text(json.dumps(out, indent=2) + "\n")
    print(out)
