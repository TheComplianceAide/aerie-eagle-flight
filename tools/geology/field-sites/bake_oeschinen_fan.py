"""Bake the east alluvial fan at Oeschinensee against the game's low lake stage.

The swissTLM3D cascade and two low-stage photographic braids are recorded in
world.js. This producer reconstructs the compatible mesh, signed littoral map
and regional material. The original binary's unrelated sectors are copied.
"""

import argparse
import hashlib
import io
import struct
import subprocess
from pathlib import Path
from urllib.parse import urlencode

import numpy as np
import rasterio
import triangle as triangular
from PIL import Image
from scipy.interpolate import LinearNDInterpolator
from scipy.ndimage import (
    binary_propagation,
    distance_transform_edt,
    gaussian_filter,
    map_coordinates,
)
from shapely import polygons, union_all, contains_xy

from bake import fetch

ROOT = Path(__file__).resolve().parents[3]
BASE = "bdd22af7e97b0415383aa41d6138f3051ed2021f"
INPUT_HASHES = {
    "landform-swiss.bin": "33db7cbd67ac295c6222052e8e71b96b698701eedb661b5f8cb9dc295874772c",
    "swiss-littoral.png": "4ce540a5c5caec09750e489cd1de263308b36ff051e5e67e420fb1f31aeb8c2a",
}
DEM = "https://data.geo.admin.ch/ch.swisstopo.swissalti3d/swissalti3d_2025_2622-1149/swissalti3d_2025_2622-1149_2_2056_5728.tif"
PHOTO = "https://wms.geo.admin.ch/?" + urlencode(
    dict(
        SERVICE="WMS",
        REQUEST="GetMap",
        VERSION="1.1.1",
        LAYERS="ch.swisstopo.swissimage-product",
        STYLES="",
        SRS="EPSG:2056",
        BBOX="2622532,1149194,2622982,1149686",
        WIDTH="1350",
        HEIGHT="1476",
        FORMAT="image/jpeg",
        TIME="2004",
    )
)


def bake_fan(input_game, cache, game):
    game.mkdir(parents=True, exist_ok=True)
    cache.mkdir(parents=True, exist_ok=True)

    def baseline(name):
        data = (input_game / name).read_bytes()
        if hashlib.sha256(data).hexdigest() != INPUT_HASHES[name]:
            # Subsequent releases already include the modified field. The public
            # parent revision still supplies the exact immutable pre-bake bytes.
            data = subprocess.check_output(
                ["git", "show", BASE + ":game/" + name], cwd=ROOT
            )
        if hashlib.sha256(data).hexdigest() != INPUT_HASHES[name]:
            raise ValueError("Unexpected original survey: " + name)
        return data

    image = fetch(cache, "oeschinen-east-alluvium-2004.jpg", PHOTO)
    dem = fetch(cache, "oeschinen-east-dtm.tif", DEM)
    for path, expected in [
        (image, "e98ded8ed9f6c5035b5443b069df32b8eaae763d1d424c3361fba7fc9bf15412"),
        (dem, "e6908d6a1161868d27a02f63f383f68f500bd48b2291baa8cb6c4fbadf578470"),
    ]:
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError("Source revision changed: " + str(path))
    f = baseline("landform-swiss.bin")
    magic, ver, step, l, t, right, b, nx, nz, datum, scale, count = struct.unpack_from(
        "<4sHH4iHHffI", f
    )
    assert (magic, ver, step) == (b"ARF1", 1, 4)
    glen = 2 * nx * nz
    off = 40 + glen
    with rasterio.open(dem) as ds:
        elevation_tile = ds.read(1)
        transform = ds.transform

    def elev(xx, zz):
        row = (transform.f - (1150000 - zz)) / 2 - 0.5
        col = ((2622000 + xx) - transform.c) / 2 - 0.5
        return (
            map_coordinates(elevation_tile, [row, col], order=1, mode="nearest")
            - 1574.9
        )

    fields = []
    for _ in range(count):
        vertex_count, face_count = struct.unpack_from("<II", f, off)
        xyz = np.frombuffer(
            f, dtype="<u2", count=3 * vertex_count, offset=off + 8
        ).reshape(vertex_count, 3)
        light = np.frombuffer(
            f, dtype="u1", count=vertex_count * 4, offset=off + 8 + vertex_count * 6
        ).reshape(vertex_count, 4)
        indices = np.frombuffer(
            f, dtype="<u2", count=3 * face_count, offset=off + 8 + vertex_count * 10
        ).reshape(face_count, 3)
        end = off + 8 + vertex_count * 10 + face_count * 6
        fields.append((xyz, light, indices, f[off:end]))
        off = end
    written = []
    sumOld = sumNew = 0
    for i, (xyz, illum, idx, part) in enumerate(fields):
        if i not in (1, 2, 5, 6):
            written.append(part)
            continue
        X = xyz[:, 0].astype(float) + l
        Z = xyz[:, 1].astype(float) + t
        Y = xyz[:, 2] * scale + datum
        P = np.stack([X, Z], axis=-1)
        touched = (
            (X[idx].max(1) > 532)
            & (X[idx].min(1) < 988)
            & (Z[idx].max(1) > 312)
            & (Z[idx].min(1) < 811)
            & (Y[idx].min(1) < 9.0)
            & (Y[idx].max(1) > -0.70)
        )
        if not touched.any():
            written.append(part)
            continue
        outline = union_all(polygons(P[idx[touched]]))
        unchanged = idx[~touched]

        def edges(arr):
            return np.sort(
                np.concatenate((arr[:, [0, 1]], arr[:, [1, 2]], arr[:, [2, 0]])), axis=1
            )

        unique, counts = np.unique(edges(idx), axis=0, return_counts=True)
        border = unique[counts == 1]
        protected = np.vstack((edges(unchanged), border))
        protected = np.unique(protected, axis=0)
        borderSet = {tuple(pair) for pair in border}
        vertices = xyz.tolist()
        lights = illum.tolist()
        lookup = {tuple(pt): k for k, pt in enumerate(P)}
        segments = []

        def point(x, z, y, color):
            k = (x, z)
            if k not in lookup:
                lookup[k] = len(vertices)
                vertices.append(
                    [
                        int(x - l),
                        int(z - t),
                        int(np.clip(np.rint((y - datum) / scale), 0, 65535)),
                    ]
                )
                lights.append(np.asarray(color).astype("u1").tolist())
            return lookup[k]

        for a, b0 in protected:
            a, b0 = int(a), int(b0)
            pa, pb = P[a], P[b0]
            delta = pb - pa
            # Border samples are determined in global survey coordinates. Adjoining
            # native sections insert identical points where the emergent fan crosses.
            if (a, b0) not in borderSet or np.linalg.norm(delta) < 8:
                segments.append([a, b0])
                continue
            axis = int(np.argmax(abs(delta)))
            oo = np.arange(
                np.ceil(min(pa[axis], pb[axis]) / 4) * 4, max(pa[axis], pb[axis]), 4
            )
            u = np.sort((oo - pa[axis]) / delta[axis])
            u = u[(u > 1e-6) & (u < 1.0 - 1e-6)]
            pp = pa + u[:, None] * delta
            ys = elev(pp[:, 0], pp[:, 1])
            ok = (
                (pp[:, 0] >= 532)
                & (pp[:, 0] <= 988)
                & (pp[:, 1] >= 312)
                & (pp[:, 1] <= 811)
                & (ys >= -0.08)
                & (ys < 9)
            )
            old = a
            for coord, yy, v in zip(pp[ok], ys[ok], u[ok]):
                nx_, nz_ = np.rint(coord)
                cur = point(nx_, nz_, yy, illum[a] * (1 - v) + illum[b0] * v)
                if old != cur:
                    segments.append([old, cur])
                old = cur
            if old != b0:
                segments.append([old, b0])
        xx0 = max(532, int(np.ceil(X.min() / 4) * 4))
        xx1 = min(989, X.max() + 1)
        zz0 = max(312, int(np.ceil(Z.min() / 4) * 4))
        zz1 = min(812, Z.max() + 1)
        gz, gx = np.mgrid[zz0:zz1:4, xx0:xx1:4]
        xx, zz = gx.ravel(), gz.ravel()
        inside = contains_xy(outline, xx, zz)
        xx, zz = xx[inside], zz[inside]
        ey = elev(xx, zz)
        # A four-metre lattice follows the immediate shore and low channels.
        # Above the active bars an eight-metre lattice is adequate. The elevation
        # survey returns a flat interior lake; it needs no further submerged faces.
        rz, rx = np.mgrid[300:825:4, 520:1009:4]
        rr = elev(rx, rz)
        toDry = distance_transform_edt(rr < 0.20) * 4
        shore = toDry[((zz - 300) / 4).astype(int), ((xx - 520) / 4).astype(int)] < 15
        coarse = ((xx % 8) == 0) & ((zz % 8) == 0)
        keep = (
            (ey >= -0.09) & (ey < 9) & ((shore & (ey < 1.7)) | ((ey > 0.14) & coarse))
        )
        xx, zz, ey = xx[keep], zz[keep], ey[keep]
        lit = LinearNDInterpolator(P, illum.astype(float))(xx, zz)
        lit = np.nan_to_num(lit, nan=140.0)
        for x, z, y, col in zip(xx, zz, ey, lit):
            point(x, z, y, col)
        coords = np.asarray(vertices, dtype="<u2")
        raw = triangular.triangulate(
            {
                "vertices": coords[:, :2].astype(float),
                "segments": np.asarray(segments, dtype="i4"),
            },
            "pQY",
        )
        assert len(raw["vertices"]) == len(vertices), (
            i,
            len(raw["vertices"]),
            len(vertices),
        )
        tris = raw["triangles"][:, ::-1].astype("<u2")
        assert len(vertices) < 65536
        written.append(
            struct.pack("<II", len(vertices), len(tris))
            + coords.tobytes()
            + np.array(lights, "u1").tobytes()
            + tris.tobytes()
        )
        sumOld += len(idx)
        sumNew += len(tris)

    (game / "landform-swiss.bin").write_bytes(f[: 40 + glen] + b"".join(written))
    print(
        f"Added {sumNew - sumOld} near-shore triangles across the four east-fan sections"
    )
    # Replace the east fan optical field against the same low-stage shoreline as the mesh.
    left, top, right, bottom = 536, 320, 960, 804
    gz, gx = np.mgrid[top:bottom, left:right]
    gx, gz = gx + 0.5, gz + 0.5
    raw = elev(gx, gz)
    wet = raw < 0.19
    distance = distance_transform_edt(wet) - distance_transform_edt(~wet)
    distance -= np.sign(distance) * 0.5
    sub = np.where(
        wet,
        np.minimum(raw, -0.09 - np.minimum(distance_transform_edt(wet) * 0.092, 4.0)),
        raw,
    )
    grade = np.clip(np.hypot(*np.gradient(gaussian_filter(sub, 3))), 0, 1)
    opt = np.array(
        Image.open(io.BytesIO(baseline("swiss-littoral.png"))).convert("RGB")
    )
    old = opt[top + 288 : bottom + 288, left + 960 : right + 960].astype("f4") / 255
    val = old[:, :, 0] * 2.0 - 1
    oldD = np.sign(val) * val**2 * 56
    margin = np.minimum.reduce([gx - left, right - gx, gz - top, bottom - gz])
    w = np.clip((margin - 2) / 20, 0, 1)
    w = w * w * (3 - 2 * w)
    D = oldD + (distance - oldD) * w
    oldH = 16 * old[:, :, 1] ** 2
    oldH += (np.maximum(0, 0.18 - sub) - oldH) * w
    grade = old[:, :, 2] + (grade - old[:, :, 2]) * w
    new = np.stack(
        [
            0.5 + 0.5 * np.sign(D) * np.sqrt(np.clip(abs(D) / 56, 0, 1)),
            np.sqrt(np.clip(oldH / 16, 0, 1)),
            grade,
        ],
        axis=2,
    )
    opt[top + 288 : bottom + 288, left + 960 : right + 960] = np.rint(new * 255).astype(
        "u1"
    )
    Image.fromarray(opt).save(game / "swiss-littoral.png", optimize=True)

    bake_material(image, game)


def bake_material(photo, game):
    a = (
        np.asarray(
            Image.open(photo)
            .convert("RGB")
            .resize((900, 984), Image.Resampling.LANCZOS)
        ).astype(float)
        / 255.0
    )
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    # Color-film haze in the historical flight is approximately neutral over bare
    # limestone. Preserve the material color and measured lateral braids.
    gray = np.average(a, axis=2, weights=[0.28, 0.57, 0.15])
    zz, xx = np.mgrid[0 : a.shape[0], 0 : a.shape[1]]
    ref = (
        (xx > 340)
        & (xx < 420)
        & (zz > 510)
        & (zz < 590)
        & (gray > 0.40)
        & (gray < 0.81)
    )
    levels = np.median(a[ref], axis=0)
    a *= np.clip(np.mean(levels) / levels, 0.86, 1.14)[None, None, :]
    # The historic lower-stage photo covers most of the modern emerged shelf.
    # Extend exposed gravel only across connected open water in the unmatched
    # fringe. Dark, narrow fluvial deposits on the actual fan remain untouched.
    swatch = (g - r > 0.037) & (b - r > 0.017) & (g >= b - 0.04) & (gray < 0.52)
    seeds = np.zeros_like(swatch)
    seeds[:4, :450] = swatch[:4, :450]
    seeds[:600, :4] = swatch[:600, :4]
    openwater = binary_propagation(seeds, mask=swatch)
    bad = gaussian_filter(openwater.astype(float), 2) > 0.18
    ground = (~bad) & (gray > 0.31) & (gray < 0.85) & ((g - 0.5 * (r + b)) < 0.052)
    dist, nearest = distance_transform_edt(~ground, return_indices=True)
    if np.any(bad):
        below = a[nearest[0], nearest[1]]
        mix = np.clip(dist / 4, 0, 1) * bad
        a = a * (1 - mix[:, :, None]) + below * mix[:, :, None]
    smooth = gaussian_filter(a, [2.6, 2.6, 0])
    a = np.clip((a + 0.36 * (a - smooth) - 0.13) * 1.10 + 0.105, 0, 1)
    im = Image.fromarray(np.rint(a * 255).astype("u1"))
    im.save(game / "oeschinen-east-fan.webp", quality=91, method=6)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--game", type=Path, default=ROOT / "game")
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    bake_fan(args.game, args.cache, args.output)
