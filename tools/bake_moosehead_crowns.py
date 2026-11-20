"""Build Moosehead's distant crown atlas from 16-form transparent botanical art and native branch models.

Requires Pillow, numpy, scipy and scikit-image. Native orthographic snapshots use Node 22 and local Chromium.
Example: python tools/bake_moosehead_crowns.py --sources /path/to/regional-art-production --captures /tmp/aerie-crown-models
The four Maine sheets keep every cell. Six neighboring sheets contribute eight appropriate specimens apiece.
The resulting 112 forms include four lateral views, an elevated view and a top view. Single-view source art is
registered to 3D geometry for lateral views. The elevated and overhead views are photographed in the renderer.
"""

import argparse
import subprocess
from pathlib import Path
from PIL import Image
from scipy.ndimage import distance_transform_edt
import numpy as np, json

tools = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument(
    "--sources",
    type=Path,
    required=True,
    help="Regional production art directory containing generated/ and expansion/generated/",
)
parser.add_argument(
    "--captures",
    type=Path,
    required=True,
    help="Directory of orthographic native model views, populated on first run",
)
parser.add_argument("--output-dir", type=Path, default=tools.parent / "game")
parser.add_argument("--chrome", help="Path to a Chrome/Chromium executable")
parser.add_argument(
    "--metadata",
    type=Path,
    help="Optional JSON table mapping atlas slots to original source cells",
)
args = parser.parse_args()
dest = args.output_dir
dest.mkdir(parents=True, exist_ok=True)
args.captures.mkdir(parents=True, exist_ok=True)
species = [
    ("Balsam fir", "moosehead-tree"),
    ("Red spruce", "moosehead-red-spruce"),
    ("Northern white cedar", "moosehead-cedar"),
    ("Paper birch", "moosehead-birch"),
    ("American beech", "dixville-beech"),
    ("Sugar maple", "dixville-tree"),
    ("Yellow birch", "surry-birch"),
    ("Red maple", "surry-maple"),
    ("Eastern hemlock", "surry-tree"),
    ("Eastern white pine", "surry-white-pine"),
]
tile = 128
grid = 26
atlas = Image.new("RGBA", (tile * grid, tile * grid))
data = []
from scipy import ndimage
import importlib.util

bakePath = tools / "bake_regional_vegetation.py"
spec = importlib.util.spec_from_file_location("bake_vegetation", bakePath)
bake = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bake)


def source_cells(key):
    paths = [
        (args.sources / "generated") / (key + ".png"),
        (args.sources / "expansion/generated") / (key + ".png"),
    ]
    source = bake.sheet_alpha(
        Image.open(next(g for g in paths if g.exists())).convert("RGBA"), key
    )
    w, h = source.size
    out = []
    for cell in range(16):
        col = cell % 4
        row = cell // 4
        im = source.crop(
            (
                round(w * col / 4),
                round(h * row / 4),
                round(w * (col + 1) / 4),
                round(h * (row + 1) / 4),
            )
        )
        A = np.array(im)
        L, n = ndimage.label(A[:, :, 3] > 64)
        largest = 1 + np.argmax(np.bincount(L.ravel())[1:])
        valid = ndimage.binary_dilation(L == largest, iterations=3)
        A[:, :, 3] *= valid
        rows, cols = np.where(A[:, :, 3] > 75)
        lo, hi = rows.min(), rows.max()
        H = hi - lo + 1
        root = float(np.median(cols[rows > hi - H * 0.035]))
        out.append((A, root, hi, H))
    return out


def register_source_view(src, g, view, cell):
    # Warp the source branch texture with the observed centre/width of each
    # horizontal crown section from its true mesh at this azimuth. Mirror the
    # rear hemisphere. The orthographic mesh views supply angled/top projection.
    A, root, base, H = src
    if view >= 4:
        return g
    Y, X = np.mgrid[:192, :192]
    phase = np.array([0.0, 1.0, 0.0, -1.0])[view]
    mirrored = view in (2, 3)
    G = np.asarray(g)
    M = G[:, :, 3] / 255
    rows = np.arange(192)
    centers = (M * np.arange(192)[None, :]).sum(1) / np.maximum(0.1, M.sum(1))
    valid = M.sum(1) > 2
    centers = (
        np.interp(rows, rows[valid], centers[valid])
        if valid.any()
        else np.full(192, 96.0)
    )
    normalized = np.clip((149.4 - Y) / 107.0, 0, 1)
    slide = (
        phase * (centers[:, None] - 96) * 0.46
        + phase * np.sin(normalized * 8 + cell) * 3.2 * normalized
    )
    width = 1.0 + phase * 0.10 * np.sin(normalized * 13 + cell * 1.9)
    sx = root + (1 if not mirrored else -1) * (X - 96 - slide) * H / (107.0 * width)
    sy = base + (Y - 149.2) * H / 107.0
    out = np.stack(
        [
            ndimage.map_coordinates(
                A[:, :, i], [sy, sx], order=1, mode="constant", cval=0
            )
            for i in range(4)
        ],
        -1,
    )
    # On a lateral pass the smallest twigs retain their source detail. Real depth lobes
    # supply modest side-to-side occlusion at the quarter-turn presentations.
    if phase:
        shadow = np.clip(0.84 + 0.22 * (M - 0.30), 0.78, 1.03)
        out[:, :, :3] = (
            (out[:, :, :3] * shadow[:, :, None]).clip(0, 255).astype("uint8")
        )
    # Encode the source trunk as a small coverage footprint at distant mip levels.
    # This is centered on the actual stem in each row, from the root to the crown.
    for y in range(138, 151):
        col = np.where(out[y, :, 3] > 66)[0]
        if 0 < len(col) < 8:
            mid = int(np.median(col))
            cc = out[y, mid, :3].copy()
            if cc.max() > 0:
                for x in range(mid - 2, mid + 3):
                    if out[y, x, 3] < 175:
                        out[y, x, :3] = cc
                        out[y, x, 3] = max(out[y, x, 3], int(208 - 37 * abs(x - mid)))
    return Image.fromarray(out)


for name, key in species:
    if not all(
        (args.captures / f"{key}-{cell}-{view}.png").exists()
        for cell in range(16)
        for view in range(6)
    ):
        command = [
            "node",
            str(tools / "capture_moosehead_crowns.mjs"),
            "--sheet",
            key,
            "--species",
            name,
            "--output",
            str(args.captures.resolve()),
        ]
        if args.chrome:
            command.extend(["--chrome", args.chrome])
        subprocess.run(command, check=True)
for m, (name, s) in enumerate(species):
    sources = source_cells(s)
    ranks = []
    for f in range(16):
        alpha = np.mean(
            [
                np.asarray(Image.open(args.captures / f"{s}-{f}-{v}.png"))[:, :, 3]
                / 255
                for v in range(4)
            ],
            axis=0,
        )
        # Rank crown area and the presence of foliage below the upper third. Mature
        # shore stands are dominated by intact crowns, with some juveniles and gaps.
        weight = np.sum(alpha[62:120]) + np.sum(alpha[95:128]) * 0.45
        ranks.append((weight, f))
    ranks.sort(reverse=True)
    chosen = [ranks[i][1] for i in [0, 2, 3, 5, 7, 9, 11, 14]]
    print(s, chosen)
    data.append(
        {
            "species": name,
            "source": s,
            "cells": chosen,
            "mature": [r[1] for r in ranks[:8]],
        }
    )
    offset = m * 16 if m < 4 else 64 + (m - 4) * 8
    for k, f in enumerate(range(16) if m < 4 else chosen):
        for v in range(6):
            im = Image.open(args.captures / f"{s}-{f}-{v}.png").convert("RGBA")
            im = register_source_view(sources[f], im, v, f)
            A = np.asarray(im)
            mask = A[:, :, 3] > 20
            yy, xx = distance_transform_edt(
                ~mask, return_distances=False, return_indices=True
            )
            rgb = A[yy, xx, :3].copy()
            # The source Dixville summer relatives use the same bark and branch meshes.
            # Register autumn pigments to green Maine leaf-on hues before spatial lighting.
            if s.startswith("dixville-"):
                R, G, B = rgb.transpose(2, 0, 1).astype(float)
                leaf = (G > B * 1.07) & (R > B * 1.1)
                lum = 0.23 * R + 0.64 * G + 0.13 * B
                rgb[leaf] = np.stack([0.88 * lum, 1.04 * lum, 0.77 * lum], -1).clip(
                    0, 255
                )[leaf]
            im = Image.fromarray(np.dstack([rgb, A[:, :, 3]]))
            im = im.resize((tile, tile), Image.Resampling.LANCZOS)
            ind = (offset + k) * 6 + v
            atlas.paste(im, ((ind % grid) * tile, (ind // grid) * tile))
atlas.save(
    dest / "moosehead-survey-crowns.webp",
    quality=90,
    method=4,
    alpha_quality=99,
    exact=True,
)
mobile = atlas.resize((26 * 72, 26 * 72), Image.Resampling.LANCZOS)
mobile.save(
    dest / "moosehead-survey-crowns-mobile.webp",
    quality=85,
    method=4,
    alpha_quality=94,
    exact=True,
)
if args.metadata:
    args.metadata.write_text(json.dumps(data, indent=2))
print("bytes", (dest / "moosehead-survey-crowns.webp").stat().st_size)
