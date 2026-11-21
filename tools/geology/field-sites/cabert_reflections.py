"""Render a small set of reflected shoreline panoramas from the registered bare earth and crowns."""

import base64
import json

import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates


def bake_reflections(game, center, water, terrain, crowns, source_rgb):
    from bake_cabert_outlet import B, L, R, T

    path = game / "atlas-labrador-survey.js"
    surveyed = json.loads(
        path.read_text().split('window.ATLAS_SURVEYS["labrador"]=')[1].split(";", 1)[0]
    )

    def square(name, dtype, scale):
        arr = np.frombuffer(base64.b64decode(surveyed[name]), dtype=dtype)
        side = round(np.sqrt(arr.size))
        return arr.reshape(side, side).astype("f4") * scale

    local = square("terrain", "<i2", 0.25)
    outer = square("outer", "<i2", 0.25)
    regionalCanopy = square("canopy", "u1", 1 / 255.0)
    span = surveyed["half"]
    far = surveyed["farHalf"]
    n = 256
    h = 46
    # Two endcaps plus 24 creek panels. The last row captures the longer view
    # down the axis of Lac Cabert from its outflow.
    anchors = [
        (*center[i], water[i] + 0.44)
        for i in np.linspace(0, len(center) - 1, 24).round().astype(int)
    ]
    anchors.extend(
        [
            (-4002, 1153, 384.37),
            (-4470, 770, 384.37),
            (-4840, 515, 384.37),
            (-5150, 350, 384.37),
        ]
    )
    dst = np.zeros((h * 7, n * 4, 4), np.uint8)
    bearings = np.linspace(-np.pi, np.pi, n, dtype="f4")
    dist = np.r_[
        np.arange(0.9, 16, 0.65),
        np.arange(16, 80, 1.25),
        np.arange(80, 420, 5.8),
        np.arange(420, 3600, 29.0),
    ].astype("f4")
    elevations = np.linspace(1.566, -0.035, h)

    def read(a, u, v):
        return map_coordinates(a, [v, u], order=1, mode="nearest")

    for tile, (cx, cz, level) in enumerate(anchors):
        x = cx + np.cos(bearings)[:, None] * dist
        z = cz + np.sin(bearings)[:, None] * dist

        def mapped(a, half, x=x, z=z):
            return read(
                a,
                (x / half + 0.999999) * 0.5 * (a.shape[1] - 1),
                (z / half + 0.999999) * 0.5 * (a.shape[0] - 1),
            )

        grid = np.where(
            (np.abs(x) < span) & (np.abs(z) < span),
            mapped(local, span),
            mapped(outer, far),
        )
        cover = mapped(regionalCanopy, span)
        lid = (x > L + 2) & (x < R - 2) & (z > T + 2) & (z < B - 2)
        u = (x - L) / (R - L) * terrain.shape[1] - 0.5
        v = (z - T) / (B - T) * terrain.shape[0] - 0.5
        g = np.where(lid, read(terrain, u, v), grid)
        tree = np.where(
            lid, read(crowns, u, v), np.clip((cover - 0.2) * 1.8, 0, 1) * 12
        )
        top = np.arctan((g + tree - level) / dist)
        # A directional treetop colour, graded by the angle of the view
        # across the crown and the direct light reaching the visible bank.
        rgb = []
        for k in range(3):
            value = read(
                source_rgb[:, :, k].astype("f4") / 255,
                (x - L) / (R - L) * source_rgb.shape[1] - 0.5,
                (z - T) / (B - T) * source_rgb.shape[0] - 0.5,
            )
            rgb.append(np.where(lid, value, [0.19, 0.24, 0.20][k]))
        rgb = np.stack(rgb, -1)
        for j, el in enumerate(elevations):
            hits = top > el
            ix = hits.argmax(axis=1)
            az = np.arange(n)
            frac = np.clip((top[az, ix] - el) * 2.6, 0, 1)
            col = rgb[az, ix] * (0.78 + 0.23 * frac[:, None])
            col *= 1 - 0.22 * np.clip((tree[az, ix] - 1) / 6, 0, 1)[:, None]
            row = j + (tile // 4) * h
            sl = slice((tile % 4) * n, (tile % 4 + 1) * n)
            dst[row, sl, :3] = np.uint8(np.clip(col, 0.028, 0.72) * 255)
            dst[row, sl, 3] = np.any(hits, axis=1) * 255
    Image.fromarray(dst, "RGBA").save(
        game / "cabert-reflected-banks.webp", quality=86, method=6
    )
