"""Bake bounded optical and modeled canopy fields from public cloud-optimized rasters.

Install numpy, requests, rasterio and pyproj. This script reads ranges from the
source COGs, writes no upstream archives and never edits the game height mesh.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import datetime
import gzip
import hashlib
import json
import math
from pathlib import Path

import numpy as np
import requests
import rasterio
from pyproj import Transformer
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject, transform_bounds

EARTH_SEARCH = "https://earth-search.aws.element84.com/v1"
CHM_ROOT = "https://dataforgood-fb-data.s3.amazonaws.com/forests/v2/global/dinov3_global_chm_v2_ml3"
ROOT = Path(__file__).resolve().parents[1] / "game" / "geodata"
# x = easting − originE, z = originN − northing. Origins match the stock
# survey producers. Rectangles cover a local range or named flight corridors.
FRAMES = {
    "canyon": (32612, (454517, 4081578), (-3200, -3200, 3200, 3200), 20),
    "crater": (32610, (571464, 4755190), (-7000, -7000, 7520, 7000), 20),
    "dixville": (32619, (318030, 4970779), (-3900, -3900, 3900, 3900), 20),
    "labrador": (32619, (535259, 5621856), (-4800, -4800, 4800, 4800), 20),
    "moosehead": (32619, (442772, 5060090), (-9200, -8700, 18200, 12200), 20),
    "surry": (32618, (720171, 4761465), (-9000, -6500, 6500, 9300), 20),
    "swiss": (2056, (2622000, 1150000), (-3700, -3700, 3700, 3700), 20),
    "winnipesaukee": (32619, (-71.3032, 43.58), (-17300, -10000, 11900, 7600), 20),
    "yosemite": (32611, (268678, 4179436), (-5500, -5500, 5500, 5500), 20),
}
KNOWN_SCENES = {
    "canyon": "S2C_12SVF_20260819_0_L2A",
    "crater": "S2A_10TEN_20250712_1_L2A",
    "dixville": "S2A_18TYQ_20250930_0_L2A",
    "labrador": "S2B_19UES_20240829_0_L2A",
    "moosehead": "S2C_19TDL_20250816_0_L2A",
    "surry": "S2C_18TYN_20250928_0_L2A",
    "swiss": "S2A_32TLS_20260724_1_L2A",
    "winnipesaukee": "S2A_18TYP_20250821_1_L2A",
    "yosemite": "S2A_11SKB_20250706_0_L2A"
}
BANDS = ("red", "green", "blue", "nir", "swir16", "scl")


def read_grid(url, crs, transform, shape, dtype, fill, method):
    result = np.full(shape, fill, dtype=dtype)
    with rasterio.open(url) as source:
        reproject(
            rasterio.band(source, 1), result, dst_transform=transform,
            dst_crs=crs, dst_nodata=fill, resampling=method,
        )
        scale = source.scales[0]
        offset = source.offsets[0]
    return result, scale, offset


def optical(world, crs, transform, shape):
    scene_id = KNOWN_SCENES[world]
    url = f"{EARTH_SEARCH}/collections/sentinel-2-l2a/items/{scene_id}"
    response = requests.get(url, timeout=20)
    response.raise_for_status()
    item = response.json()
    scl, _, _ = read_grid(item["assets"]["scl"]["href"], crs, transform, shape, np.uint8, 0, Resampling.nearest)
    valid = np.isin(scl, [4, 5, 6, 11])
    if np.count_nonzero(valid) < valid.size * .48:
        raise ValueError(f"{world}: inadequate locally clear pixels in {scene_id}")
    fields = {}
    sources = {}
    for band in BANDS:
        asset = item["assets"][band]
        url = asset["href"]
        sources[band] = url
        if band == "scl":
            continue
        raw, scale, offset = read_grid(url, crs, transform, shape, np.uint16, 0, Resampling.average)
        meta = asset.get("raster:bands", [{}])[0]
        r = raw.astype(np.float32) * meta.get("scale", scale) + meta.get("offset", offset)
        fields[band] = np.where(raw, np.clip(r, 0, 1), 0)
        valid &= raw > 0
    red, green, blue, nir, swir = (fields[key] for key in BANDS[:-1])
    ndvi = (nir-red) / np.maximum(nir+red, .00001)
    ndsi = (green-swir) / np.maximum(green+swir, .00001)
    ndwi = (green-nir) / np.maximum(green+nir, .00001)
    rgb = np.uint8(np.clip(np.stack([red, green, blue], -1) * 3.2, 0, 1) ** .53 * 255 + .5)
    # Preserve spectra and SCL disagreement as unknown. No class sets a
    # waterline or a glacier boundary. Only authored geometry governs collision.
    flags = np.select(
        [valid & (scl == 4) & (ndvi > .32), valid & (scl == 5),
         valid & (scl == 6) & (ndwi > -.04), valid & (scl == 11) & (ndsi > .4)],
        [1, 2, 3, 4],
    ).astype(np.uint8)
    meta = {
        "item": item["id"], "datetime": item["properties"]["datetime"],
        "catalog": f"{EARTH_SEARCH}/collections/sentinel-2-l2a/items/{item['id']}",
        "attribution": "Contains modified Copernicus Sentinel data",
        "license": "https://sentinels.copernicus.eu/web/sentinel/sentinel-data-access/sentinel-products",
        "nativeMeters": {"RGB": 10, "red": 10, "nir": 10, "swir16": 20, "scl": 20},
        "pixelCounts": {str(k): int(np.count_nonzero(flags == k)) for k in range(5)},
        "assets": sources,
    }
    return rgb, flags, meta


def quadkeys(bounds, zoom=10):
    def tile(lon, lat):
        n = 1 << zoom
        x = int(n * (lon + 180) / 360)
        y = int(n * (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2)
        return x, y
    w, s, e, n = bounds
    a, b = tile(w, n)
    c, d = tile(e, s)
    for y in range(b, d + 1):
        for x in range(a, c + 1):
            yield "".join(str(int(bool(x & (1 << i))) + 2 * int(bool(y & (1 << i))))
                          for i in reversed(range(zoom)))


def canopy(bounds, crs, transform, shape):
    output = np.full(shape, 255, dtype=np.uint8)
    sources, omissions = [], []
    for key in quadkeys(bounds):
        url = f"{CHM_ROOT}/chm/{key}.tif"
        if requests.head(url, timeout=15).status_code != 200:
            omissions.append(key)
            continue
        values, _, _ = read_grid(url, crs, transform, shape, np.uint8, 255, Resampling.nearest)
        take = values != 255
        output[take] = values[take]
        sources.append({"raster": url, "sceneMetadata": f"{CHM_ROOT}/metadata/{key}.geojson"})
    return output, {
        "attribution": "Meta and World Resources Institute (WRI), 2026, Version 2 High Resolution Canopy Height Maps (CHMv2). Source imagery for CHM © 2016 Vantor.",
        "license": "https://creativecommons.org/licenses/by/4.0/",
        "catalog": "https://registry.opendata.aws/dataforgood-fb-forestsv2/",
        "accessed": datetime.datetime.now(datetime.timezone.utc).date().isoformat(), "sources": sources, "unavailableTiles": omissions,
        "positivePixels": int(np.count_nonzero((output > 0) & (output < 255))),
        "nativeMeters": "approximately 1, modeled; imagery dates vary",
        "nodata": 255,
    }


def bake(world):
    epsg, origin, rect, step = FRAMES[world]
    crs = f"EPSG:{epsg}"
    if epsg == 32619 and origin[0] < 0:
        origin = tuple(round(p) for p in Transformer.from_crs(4326, epsg, always_xy=True).transform(*origin))
    ox, oy = origin
    l, t, r, b = rect
    shape = ((b - t) // step, (r - l) // step)
    extent = (ox + l, oy - b, ox + r, oy - t)
    bounds = transform_bounds(crs, 4326, *extent, densify_pts=21)
    transform = from_origin(ox + l, oy - t, step, step)
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_TIMEOUT=20,
                      GDAL_HTTP_MAX_RETRY=2, GDAL_HTTP_RETRY_DELAY=1):
        rgb, flags, optical_meta = optical(world, crs, transform, shape)
        crowns, canopy_meta = canopy(bounds, crs, transform, shape)
    # Confidence is stored separately so zeros never clear a tree. RGB is
    # quantized to five bits per channel to keep the load and decoding bounded.
    colors = rgb.astype(np.uint16) >> 3
    first = (colors[:, :, 0] << 3) | (colors[:, :, 1] >> 2)
    second = ((colors[:, :, 1] & 3) << 6) | (colors[:, :, 2] << 1)
    packed = np.stack([first, second, flags, crowns], -1).astype(np.uint8).tobytes()
    compressed = gzip.compress(packed, compresslevel=9, mtime=0)
    if len(compressed) > 2_000_000:
        raise ValueError(f"{world}: {len(compressed)} bytes exceeds the per-world budget")
    meta = {
        "schema": 1, "world": world, "epsg": epsg, "origin": origin,
        "bounds": rect, "width": shape[1], "height": shape[0], "step": step,
        "layers": {"optical": optical_meta, "canopy": canopy_meta},
        "format": "row-major southward RGB555, optical mask (0 unknown, 1 vegetation, 2 bare, 3 water, 4 snow), modeled height in metres",
        "rawSha256": hashlib.sha256(packed).hexdigest(),
        "compressedSha256": hashlib.sha256(compressed).hexdigest(),
    }
    (ROOT / f"{world}-spectral.bin").write_bytes(compressed)
    (ROOT / f"{world}-spectral.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(world, optical_meta["item"], optical_meta["pixelCounts"], canopy_meta["positivePixels"], len(compressed), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("world", nargs="*", choices=list(FRAMES))
    parser.add_argument("--jobs", type=int, default=2)
    args = parser.parse_args()
    ROOT.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        futures = {world: pool.submit(bake, world) for world in (args.world or FRAMES)}
        failures = []
        for world, run in futures.items():
            try:
                run.result()
            except Exception as error:
                failures.append(world)
                print(f"{world}: {error}", flush=True)
    if failures:
        raise SystemExit("Incomplete: " + ", ".join(failures))


if __name__ == "__main__":
    main()
