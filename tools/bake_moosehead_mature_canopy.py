"""Reconstruct 16 mature Maine trees from one transparent botanical sheet.

Each photographic half-crown supplies needles, twig color, and branch tiers in a
sector of the volume. The central trunk stays axial. Ten curved, separately
scaled radial bough sectors contribute to depth-sorted orthographic views.
Depth and the hidden backs of the trees are reconstructions from side-on artwork.
Requires numpy, scipy and Pillow. Example:
python tools/bake_moosehead_mature_canopy.py --output-dir game
"""

import gzip
import json
import struct
from argparse import ArgumentParser
from pathlib import Path
import numpy as np
from scipy.ndimage import (
    distance_transform_edt,
    gaussian_filter,
    gaussian_filter1d,
    maximum_filter1d,
    map_coordinates,
)
from PIL import Image


def branches(cell, form):
    rgba = np.array(cell)
    rows, cols = np.where(rgba[:, :, 3] > 50)
    base, tip = rows.max(), rows.min()
    last = rows > base - 0.025 * (base - tip)
    root = np.median(cols[last])
    raw = (cols - root) / (base - tip)
    up = (base - rows) / (base - tip)
    colors = rgba[rows, cols, :3].astype(float)
    alpha = rgba[rows, cols, 3].astype(float) / 255
    # Use the measured crown envelope. Fringe fragments have negligible influence on root or width.
    radius = np.quantile(abs(raw), 0.999)
    radius_by_row = np.zeros(rgba.shape[0])
    np.maximum.at(radius_by_row, rows, np.abs(raw))
    radius_by_row = gaussian_filter1d(maximum_filter1d(radius_by_row, 5), 1.6)
    rng = np.random.default_rng(1445 + form)
    parts = []
    for sector in range(10):
        side = -1 if sector % 2 else 1
        visible = raw * side >= 0
        r = np.abs(raw[visible]) * 0.306 / radius
        h = up[visible]
        local = np.clip(
            np.abs(raw[visible]) / np.maximum(0.015, radius_by_row[rows[visible]]), 0, 1
        )
        phase = (sector * 1.711 + form * 0.73) % (2 * np.pi)
        sector_scale = rng.uniform(0.82, 1.02)
        # A bough bends around its axis at its tip, and sweeps forward away from the trunk.
        # Change the branch-tier height per sector so the ten profiles cannot make horizontal rings.
        angle = (
            sector * 2 * np.pi / 10
            + 0.22 * np.sin(h * 18 + phase)
            + local * 0.23 * np.sin(h * 26 + phase)
        )
        thick = (
            0.060 * (1 - 0.66 * local) * np.sin((raw[visible] * 27 + h * 17) + phase)
        )
        r *= sector_scale
        x = np.cos(angle) * r + np.sin(angle) * thick * local
        z = np.sin(angle) * r - np.cos(angle) * thick * local
        y = h + local * (0.022 * np.sin(h * 22 + phase) + 0.015 * np.cos(phase))
        # Interior wood and the undersides of branch tiers receive less sky irradiance.
        # Preserve the original measured colors and the lighter new growth on outer needles.
        shade = 0.76 + 0.21 * np.sqrt(local) + 0.055 * np.cos(angle - 0.65)
        c = colors[visible] * shade[:, None]
        parts.append((x, y, z, c, alpha[visible]))
    return tuple(np.concatenate(v) for v in zip(*parts)), (
        rgba,
        root,
        base,
        base - tip,
        radius,
        form,
    )


def view(cloud, yaw, tilt, size):
    (x, y, z, colors, alpha), source = cloud
    right = x * np.cos(yaw) - z * np.sin(yaw)
    along = x * np.sin(yaw) + z * np.cos(yaw)
    vertical = (y - 0.5) * np.cos(tilt) - along * np.sin(tilt)
    depth = along * np.cos(tilt) + (y - 0.5) * np.sin(tilt)
    # The runtime keeps upper-canopy size independent of the direction of travel.
    extent = np.sqrt(np.cos(tilt) ** 2 + 0.60**2 * np.sin(tilt) ** 2)
    px = np.rint((0.5 + right / 1.8) * size).astype(int)
    py = np.rint((0.5 - vertical / (1.8 * extent)) * size).astype(int)
    row = py * size + px
    closest = np.full(size * size, -np.inf)
    np.maximum.at(closest, row, depth)
    opaque = np.where(depth >= closest[row] - 0.00001)[0]
    pixels = np.zeros((size * size, 4), dtype=np.uint8)
    pixels[row[opaque], :3] = np.clip(colors[opaque], 0, 255)
    pixels[row[opaque], 3] = np.rint(255 * alpha[opaque])
    pixels = pixels.reshape(size, size, 4)
    mask = pixels[:, :, 3] > 8
    yy, xx = distance_transform_edt(~mask, return_distances=False, return_indices=True)
    depth = closest.reshape(size, size)[yy, xx]
    raw, root, base, height, radius, form = source
    cy, cx = np.mgrid[:size, :size]
    screen_y = (0.5 - cy / size) * 1.8 * extent
    elevation = 0.5 + screen_y * np.cos(tilt) + depth * np.sin(tilt)
    right = (cx / size - 0.5) * 1.8
    # Register the original colors at the visible bough depth. This retains the
    # dark gaps beneath needle tiers and branch-specific highlights that a set
    # of uniformly shaded point projections would average away.
    sway = (
        np.sin(yaw)
        * (0.016 * np.sin(elevation * 11 + form) + 0.03 * np.sin(elevation * 5))
        * np.minimum(elevation * 3, 1)
    )
    polarity = 1 if np.cos(yaw + 0.23) > 0 else -1
    u = root + (right + sway) * polarity * height * radius / 0.306
    v = base - elevation * height
    sample = np.stack(
        [
            map_coordinates(
                raw[:, :, k].astype(float), [v, u], order=1, mode="constant", cval=0.0
            )
            for k in range(4)
        ],
        -1,
    )
    fidelity = (0.90 if form < 12 else 0.95) * np.cos(tilt) ** 0.85
    silhouette = sample[:, :, 3] / 255
    # The front shell controls the single-side source visibility. More of the
    # reconstructed rear crown comes into view as the camera passes overhead.
    original = pixels[:, :, :3].astype(float)
    albedo = sample[:, :, :3]
    luminance = np.sum(albedo * np.array([0.24, 0.63, 0.13]), -1)
    local = gaussian_filter(luminance * silhouette, 3.2) / np.maximum(
        0.04, gaussian_filter(silhouette, 3.2)
    )
    contrast = np.clip((luminance + 7) / (local + 7), 0.45, 1.38)
    albedo *= np.clip(contrast**0.58, 0.70, 1.17)[:, :, None]
    lit = np.clip(0.64 + 0.44 * depth / 0.27, 0.58, 1.07)
    sunlight = gaussian_filter(depth, 2.2) - depth
    pocket = np.clip(1.0 - 2.3 * np.maximum(0.0, sunlight), 0.63, 1.0)
    shade = lit * pocket
    opacity = fidelity * silhouette
    rgb = (albedo * opacity[:, :, None] + original * (1 - opacity)[:, :, None]) * shade[
        :, :, None
    ]
    pixels[:, :, :3] = np.clip(rgb, 0, 255).astype("uint8")
    pixels[:, :, 3] = np.uint8(
        np.clip(
            pixels[:, :, 3].astype(float) * ((1.0 - fidelity) + fidelity * silhouette),
            0,
            255,
        )
    )
    yy, xx = distance_transform_edt(
        pixels[:, :, 3] < 14, return_distances=False, return_indices=True
    )
    pixels[:, :, :3] = pixels[yy, xx, :3]
    return Image.fromarray(pixels)


SPECIES = (
    [("Red spruce", "spruce")] * 4
    + [("Balsam fir", "fir")] * 4
    + [("Eastern hemlock", "hemlock")] * 2
    + [("Eastern white pine", "pine")] * 2
    + [
        ("Yellow birch", "broad"),
        ("Paper birch", "broad"),
        ("Red maple", "broad"),
        ("Sugar maple", "broad"),
    ]
)


def build_meshes(cells, destination):
    # The same native mesh compiler supplies perching-compatible model units and
    # UV packing as the region's existing trees. Each form keeps its own branch,
    # foliage and bark material, including both birch species.
    from bake_regional_vegetation import (
        scan_form,
        pack_atlas,
        woody_mesh,
        record_mesh,
        GAME,
    )

    atlas = Image.new("RGBA", (1024, 1024))
    records = []
    binary = bytearray()
    for index, cell in enumerate(cells):
        species, family = SPECIES[index]
        form = scan_form(cell)
        mini, uv = pack_atlas([form], family, species, GAME / "canopy-data")
        x, y = index % 4 * 256, index // 4 * 256
        atlas.paste(mini.crop((0, 0, 256, 256)), (x, y))
        slots = [(u + x, v + y, w, h) for u, v, w, h in uv[0]]
        foot = float(np.clip(form[0].width / form[0].height * 0.49, 0.12, 1.35))
        for lod in range(3):
            tree = woody_mesh(form, family, index, lod, slots)
            records.append(record_mesh(tree, index, lod, foot, binary))
    header = json.dumps(records, separators=(",", ":")).encode()
    header += b" " * (-(len(header) + 4) % 4)
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "moosehead-mature.bin").write_bytes(
        gzip.compress(
            struct.pack("<I", len(header)) + header + binary, compresslevel=6, mtime=0
        )
    )
    atlas.save(destination / "moosehead-mature.webp", quality=92, method=6, exact=True)


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        default=Path(__file__).resolve().parent
        / "source-art/moosehead/moosehead-mature-canopy.png",
    )
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument(
        "--only", choices=["models", "views"], help="Rebuild just one asset family"
    )
    args = parser.parse_args()
    sheet = Image.open(args.source).convert("RGBA")
    w, h = sheet.size
    size = 192
    atlas = Image.new("RGBA", (20 * size, 20 * size))
    cells = []
    for index in range(16):
        col, row = index % 4, index // 4
        cell = sheet.crop(
            (
                round(col * w / 4),
                round(row * h / 4),
                round((col + 1) * w / 4),
                round((row + 1) * h / 4),
            )
        )
        cells.append(cell)
        if args.only == "models":
            continue
        cloud = branches(cell, index)
        for angle in range(25):
            theta = (angle % 8) * np.pi / 4
            tilt = [0, 0.49, 1.00, np.pi / 2][angle // 8]
            im = view(cloud, theta, tilt, 302).resize(
                (size, size), Image.Resampling.LANCZOS
            )
            slot = index * 25 + angle
            atlas.paste(im, (slot % 20 * size, slot // 20 * size))
        print(f"Captured tree {index + 1}/16", flush=True)
    if args.only != "views":
        build_meshes(cells, args.output_dir / "canopy-data" / "regional")
    if args.only == "models":
        return
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for name, dim, quality in [
        ("moosehead-mature-crowns.webp", 3840, 93),
        ("moosehead-mature-crowns-mobile.webp", 1920, 84),
    ]:
        out = (
            atlas
            if dim == atlas.width
            else atlas.resize((dim, dim), Image.Resampling.LANCZOS)
        )
        out.save(
            args.output_dir / name,
            quality=quality,
            method=4,
            alpha_quality=98,
            exact=True,
        )


if __name__ == "__main__":
    main()
