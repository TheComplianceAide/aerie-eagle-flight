"""Build a registered local photo, material observations and meadow stations."""

from argparse import ArgumentParser
from pathlib import Path
import json, re, base64
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
from scipy.spatial import cKDTree


def smooth(lo, hi, v):
    a = np.clip((v - lo) / (hi - lo), 0, 1)
    return a * a * (3 - 2 * a)


def patch(photo, polygon):
    im = photo.crop(polygon).resize((128, 128), Image.Resampling.LANCZOS)
    rgb = np.asarray(im, "f") / 255
    # Retain sampled facet, edge and lichen contrast with the original cast light removed.
    lum = rgb @ [0.25, 0.61, 0.14]
    base = gaussian_filter(lum, 15)
    contrast = np.clip((lum + 0.055) / (base + 0.055), 0.48, 1.65)
    color = np.clip(rgb / (lum[..., None] + 0.025), 0.72, 1.18) * np.clip(
        0.45 * contrast[..., None], 0.18, 0.78
    )
    tile = np.uint8(np.clip(color * 255 + 0.5, 0, 255))
    return Image.fromarray(
        np.vstack(
            (
                np.hstack((tile, tile[:, ::-1])),
                np.hstack((tile[::-1], tile[::-1, ::-1])),
            )
        )
    )


if __name__ == "__main__":
    parser = ArgumentParser()
    parser.add_argument("cache", type=Path)
    parser.add_argument("game", type=Path)
    args = parser.parse_args()
    c, g = args.cache, args.game
    a = np.load(c / "plaikni-naip.npz")
    rgb = a["color"][:3].transpose(1, 2, 0).astype("f") / 255
    nir = a["color"][3].astype("f") / 255
    ndvi = (nir - rgb[:, :, 0]) / np.maximum(nir + rgb[:, :, 0], 0.02)
    luma = rgb @ np.array([0.25, 0.61, 0.14])
    leaf = smooth(0.09, 0.46, ndvi) * smooth(0.075, 0.24, nir)
    # Recover the 2022 orthophoto's dark tree shadows without erasing the crown edges.
    shaded = (1 - smooth(0.16, 0.48, luma)) * (0.032 + 0.055 * leaf)
    base = np.clip((rgb + shaded[..., None]) * [1.016, 1.022, 1.006], 0, 1)
    trace = np.array(json.loads((c / "plaikni-trail.json").read_text())["pts"])
    zz, xx = np.indices(leaf.shape)
    coordinates = np.stack((6009 + (xx + 0.5) * 0.5, 3852 + (zz + 0.5) * 0.5), axis=2)
    trail_distance = (
        cKDTree(trace).query(coordinates.reshape(-1, 2))[0].reshape(leaf.shape)
    )
    trail_edge = 1 - smooth(0.58, 1.13, trail_distance)
    leaf *= 1 - trail_edge
    gravel = 0.34 + 0.23 * luma + 0.045 * (luma - gaussian_filter(luma, 2))
    native = np.stack([gravel * 1.09, gravel * 1.012, gravel * 0.86], axis=2)
    base = (
        base * (1 - 0.63 * trail_edge[..., None])
        + native * 0.63 * trail_edge[..., None]
    )
    geo = Image.fromarray(
        np.uint8(np.clip(np.dstack([base, 0.21 + 0.79 * leaf]), 0, 1) * 255 + 0.5)
    ).resize((768, 768), Image.Resampling.LANCZOS)
    photo = Image.open(c / "plaikni-field.png").convert("RGB")
    atlas = Image.new("RGBA", (1024, 768))
    atlas.paste(geo, (0, 0))
    samples = {
        "cliff": [272, 119, 365, 162],
        "talus": [443, 224, 520, 261],
        "meadow": [30, 202, 105, 244],
    }
    for j, box in enumerate(samples.values()):
        atlas.paste(patch(photo, box).convert("RGBA"), (768, j * 256))
    atlas.save(g / "crater-plaikni-banks.webp", quality=94, method=6, alpha_quality=96)
    js = (g / "falls-terrain-crater.js").read_text()
    survey = json.loads(re.search(r"\.crater=(\{.*\});", js).group(1))
    center = np.array([survey["x"], survey["z"]])
    h = survey["half"]
    dem = (
        np.frombuffer(base64.b64decode(survey["terrain"]), dtype="<i2").reshape(
            (293, 293)
        )
        * 0.25
    )
    dy, dx = np.gradient(dem)
    slope = np.hypot(dx, dy)
    crowns = np.frombuffer(base64.b64decode(survey["crowns"]), dtype="<i2").reshape(
        -1, 5
    )
    xy = center + crowns[:, :2] * 0.5
    canopy = np.clip(crowns[:, 3] * 0.0625, 0, 6)
    stream = json.loads(
        re.search(
            r"crater:\{channel:(\[\[.*?\]\]),foot:",
            (g / "regional-waterfalls.js").read_text(),
        ).group(1)
    )
    cells = []
    rng = np.random.default_rng(20220923)
    for i in range(4200):
        x, z = (6159, 4019) + rng.uniform([-42, -33], [50, 62])
        u = (x - 6009) * 2
        v = (z - 3852) * 2
        ix, iz = int(round(u)), int(round(v))
        nd = ndvi[iz, ix]
        bright = nir[iz, ix]
        sl = slope[round(z - 3852), round(x - 6009)]
        if (
            trail_distance[iz, ix] < 1.45
            or nd < 0.25
            or bright < 0.21
            or sl > 0.98
            or np.any(
                ((xy[:, 0] - x) ** 2 + (xy[:, 1] - z) ** 2) < (canopy + 0.55) ** 2
            )
        ):
            continue
        dist = min(np.hypot(x - px, z - pz) for px, pz in stream)
        if dist < 3.15 or dist > 20 or luma[iz, ix] < 0.155 or rng.random() > 0.55:
            continue
        if cells and any(np.hypot(x - xx, z - zz) < 1.4 for xx, zz, _ in cells):
            continue
        cells.append((x, z, float(nd)))
    records = [
        [
            round((x - 6150) * 10),
            round((z - 4000) * 10),
            int(np.clip((nd - 0.25) * 300, 0, 255)),
        ]
        for x, z, nd in cells
    ]
    # Small signed metre offsets keep the survey's browser transfer compact.
    (g / "crater-plaikni-meadow.js").write_text(
        "// 2022 NAIP meadow patches near Sand Creek. Decimetres from (6150, 4000).\nwindow.plaikniMeadowStations="
        + json.dumps(records, separators=(",", ":"))
        + ";\nwindow.plaikniTrailEnd="
        + json.dumps(
            np.round(trace[-30:] * 10).astype(int).tolist(), separators=(",", ":")
        )
        + ";\n"
    )
    (c / "plaikni-bake.json").write_text(
        json.dumps(
            dict(
                points=len(records), photoSamples=samples, extent=a["bounds"].tolist()
            ),
            indent=2,
        )
        + "\n"
    )
    print(len(records), "meadow patches")
