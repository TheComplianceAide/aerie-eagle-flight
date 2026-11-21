"""Reconstruct the distant Half Dome–Clouds Rest skyline from 3DEP and USDA NAIP."""

from pathlib import Path
import argparse, json, struct
import requests, numpy as np, rasterio
from rasterio.transform import from_origin
from rasterio.warp import reproject, Resampling
from pyproj import Transformer
from pydelatin import Delatin
from PIL import Image
from scipy.ndimage import map_coordinates
from register import read_grid

BOUNDS = (6544, -4496, 12816, -176)


def imagery(cache):
    # Summer NAIP north of the Valley, 60 cm RGB/NIR. Eight-metre colors
    # footprint the true dome and far ridge, safely below a display pixel in
    # the intended 5–15 km views. Keep each acquisition date in the receipt.
    l, t, r, b = BOUNDS
    cx, cy = 268678, 4179436
    proj = Transformer.from_crs(32611, 4326, always_xy=True)
    corners = [proj.transform(cx + x, cy - z) for x in (l, r) for z in (t, b)]
    xx, yy = zip(*corners)
    q = dict(
        collections="naip",
        bbox=",".join(map(str, (min(xx), min(yy), max(xx), max(yy)))),
        datetime="2022-01-01T00:00:00Z/2022-12-31T23:59:59Z",
        limit=30,
    )
    search = requests.get(
        "https://planetarycomputer.microsoft.com/api/stac/v1/search",
        params=q,
        timeout=25,
    )
    search.raise_for_status()
    items = search.json()["features"]
    assert items
    shape = ((b - t) // 8 + 1, (r - l) // 8 + 1)
    grid = np.zeros((4, *shape), "u1")
    xform = from_origin(cx + l - 4, cy - t + 4, 8, 8)
    sources = []
    with rasterio.Env(
        GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MULTIRANGE="YES"
    ):
        for item in sorted(items, key=lambda i: i["id"]):
            src = item["assets"]["image"]["href"]
            response = requests.get(
                "https://planetarycomputer.microsoft.com/api/sas/v1/sign",
                params={"href": src},
                timeout=22,
            )
            response.raise_for_status()
            signed = response.json()["href"]
            with rasterio.open("/vsicurl/" + signed) as ds:
                for band in range(min(ds.count, 4)):
                    # The precomputed internal reduced-resolution overviews
                    # keep retrieval bounded to the small output footprint.
                    reproject(
                        rasterio.band(ds, band + 1),
                        grid[band],
                        src_transform=ds.transform,
                        src_crs=ds.crs,
                        src_nodata=0,
                        dst_transform=xform,
                        dst_crs="EPSG:32611",
                        dst_nodata=0,
                        init_dest_nodata=False,
                        resampling=Resampling.bilinear,
                    )
            sources.append(
                {
                    "item": item["id"],
                    "date": item["properties"]["datetime"],
                    "source": src,
                }
            )
            print("NAIP", item["id"], flush=True)
    assert np.mean(grid[0] > 0) > 0.985
    np.savez_compressed(cache / "tunnel-summits-ortho.npz", bands=grid)
    (cache / "tunnel-summits-images.json").write_text(
        json.dumps(sources, indent=2) + "\n"
    )
    return grid


def main():
    a = argparse.ArgumentParser()
    a.add_argument("cache", type=Path)
    a.add_argument("game", type=Path)
    arg = a.parse_args()
    cache = arg.cache
    game = arg.game
    l, t, r, b = BOUNDS
    grid = read_grid(cache)
    dem = np.ascontiguousarray(
        grid[
            (t + 6400) // 8 : (b + 6400) // 8 + 1, (l + 5000) // 8 : (r + 5000) // 8 + 1
        ],
        "f",
    )
    bands = (
        np.load(cache / "tunnel-summits-ortho.npz")["bands"]
        if (cache / "tunnel-summits-ortho.npz").exists()
        else imagery(cache)
    )
    assert dem.shape == bands.shape[1:]
    rgb = bands[:3].transpose(1, 2, 0).astype("f") / 255
    n = bands[3].astype("f")
    red = bands[0].astype("f")
    plant = np.clip(((n - red) / np.maximum(1, n + red) - 0.13) / 0.40, 0, 1)
    # The live sun lights the survey. Gently recover details in the
    # orthophotograph's shadowed rock away from the field-projected wall.
    lum = rgb @ np.array([0.24, 0.62, 0.14])
    photo = np.clip(rgb + (1 - np.clip(lum / 0.36, 0, 1))[..., None] * 0.049, 0, 1)
    Image.fromarray(np.uint8(photo * 255 + 0.5)).save(
        game / "landform-yosemite-summits-aerial.webp", quality=91, method=6
    )
    step = 16
    collision = dem[::2, ::2]
    nz, nx = collision.shape
    datum = float(np.floor(dem.min()))
    scale = float((dem.max() - datum + 2) / 30900)
    cases = []
    edge = 72
    # Adjacent chunks guarantee shared edge vertices. The distant mapped
    # relief has a 2.6 metre maximum geometric approximation error.
    for j in range(0, dem.shape[0] - 1, edge):
        for i in range(0, dem.shape[1] - 1, edge):
            sec = dem[j : j + edge + 1, i : i + edge + 1]
            tin = Delatin(sec, max_error=2.6)
            vi = tin.vertices.astype("i")
            u = vi[:, 0]
            v = sec.shape[0] - 1 - vi[:, 1]
            xi = i + u
            zj = j + v
            xyz = np.stack(
                [xi * 8, zj * 8, np.rint((sec[v, u] - datum) / scale)], axis=1
            ).astype("<u2")
            # Sky exposure and sun-facing horizon sampled in the same DTM.
            skyAz = np.arange(0, np.pi * 2, np.pi / 4)
            reliefs = []
            for angle in [*skyAz, np.radians(157)]:
                hi = np.zeros(len(xi), "f")
                for d in (16, 48, 96, 192, 384, 768, 1500, 2650, 4000):
                    sx = (l + xi * 8 + 5000 + np.cos(angle) * d) / 8
                    sz = (t + zj * 8 + 6400 + np.sin(angle) * d) / 8
                    y = map_coordinates(grid, [sz, sx], order=1, mode="nearest")
                    hi = np.maximum(hi, (y - sec[v, u]) / d)
                reliefs.append(np.arctan(hi))
            sky = 1 - np.mean(np.sin(reliefs[:8]), axis=0)
            horiz = reliefs[-1] / 1.539
            light = np.uint8(
                np.clip(
                    np.stack([sky, horiz, plant[zj, xi], np.ones_like(sky)], 1), 0, 1
                )
                * 255
                + 0.5
            )
            faces = tin.triangles.astype("<u2")
            a, b1, c = xyz[faces[0], :2].astype("f")
            if np.linalg.det(np.array([b1 - a, c - a])) > 0:
                faces = faces[:, ::-1].copy()
            cases.append((xyz, light, faces))
    out = bytearray(
        struct.pack(
            "<4sHH4iHHffI", b"ARF1", 1, step, *BOUNDS, nx, nz, datum, scale, len(cases)
        )
    )
    out += np.rint((collision - datum) / scale).astype("<i2").tobytes()
    for xyz, light, indices in cases:
        out += (
            struct.pack("<II", len(xyz), len(indices))
            + xyz.tobytes()
            + light.tobytes()
            + indices.tobytes()
        )
    (game / "landform-yosemite-summits.bin").write_bytes(out)
    stats = {
        "rect": list(BOUNDS),
        "sourceDemStep": 8,
        "deltaBound": 2.6,
        "triangles": sum(len(c) for a, b, c in cases),
        "bytes": len(out),
        "peakNAVD88m": float(dem.max()),
    }
    (cache / "tunnel-summits-receipt.json").write_text(
        json.dumps(stats, indent=2) + "\n"
    )
    print(stats, flush=True)


if __name__ == "__main__":
    main()
