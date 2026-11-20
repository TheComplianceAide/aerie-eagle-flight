"""Reconstruct regional, wind-ready branch meshes from transparent 4x4 botanical sheets.

Run with --art <source directory>. The source directory contains generated/<sheet>.png,
written/<sheet>.json, and optionally expansion/{plans/sheets.json,generated/,written/}.
Requires numpy, scipy, scikit-image, Pillow. Source artworks determine the profile, branching
and material colors. Depth behind the single source view is a botanical reconstruction.
"""

import argparse
import gzip
import hashlib
import json
import os
import tempfile
import fcntl
import math
import struct
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from skimage.graph import MCP_Geometric
from skimage.morphology import skeletonize

TOOLS = Path(__file__).resolve().parent
GAME = TOOLS.parent / "game"
UV_SCALE = 8192
UP = np.array([0.0, 1.0, 0.0])


def mesh_revision(row):
    if row["family"] in ("brush", "podocarp") or "birch" in row["species"].lower():
        return 4
    return 3


def normalize(v):
    length = np.linalg.norm(v)
    return v / length if length > 1e-8 else UP


def scan_form(image):
    rgba = np.array(image)
    alpha = rgba[:, :, 3] > 58
    ys, xs = np.where(alpha)
    if not ys.size:
        raise ValueError("Empty specimen cell")
    image = image.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    im = image.copy()
    im.thumbnail((150, 150), Image.Resampling.LANCZOS)
    rgb = np.array(im) / 255.0
    a = rgb[:, :, 3] > 0.18
    red, green, blue = np.moveaxis(rgb[:, :, :3], -1, 0)
    # Brown wood, grey wood and shaded foliage must remain reachable in sparse specimens.
    mask = ndimage.binary_closing(np.pad(a, 2), iterations=1)[2:-2, 2:-2] | a
    labels, count = ndimage.label(mask, np.ones((3, 3)))
    main = 1 + np.argmax(np.bincount(labels.ravel())[1:])
    mask = labels == main
    ys, xs = np.where(mask)
    ybase = ys.max()
    top = ys.min()
    height = max(1, ybase - top)
    profile = ndimage.distance_transform_edt(mask)
    lower = np.where(mask[max(top, round(ybase - height * 0.025))])[0]
    cx = np.median(lower) if lower.size else np.median(xs[ys > ybase - height * 0.06])
    py, px = np.where(mask & (np.indices(mask.shape)[0] > ybase - height * 0.045))
    k = np.argmin(np.abs(px - cx) + 0.21 * np.abs(py - ybase) - 0.35 * profile[py, px])
    root = (py[k], px[k])
    canopy = (green > red * 1.005) & (green > blue * 1.04) | (
        (red > green * 1.12) & (red > blue * 1.65) & (red > 0.33)
    )
    foliage = mask & canopy
    if foliage.sum() < mask.sum() * 0.09:
        foliage = mask & (np.indices(mask.shape)[0] < ybase - height * 0.12)
    wood = mask & ~canopy
    cost = 0.22 + 1.7 * canopy + 2.4 / np.maximum(0.4, profile)
    paths = MCP_Geometric(np.where(mask, cost, np.inf))
    paths.find_costs([root])

    def trace(target):
        raw = np.asarray(paths.traceback(tuple(target)), dtype=float)
        return np.column_stack(
            ((raw[:, 1] - root[1]) / height, (ybase - raw[:, 0]) / height)
        )

    # End at the actual highest occupied row. A leaning leader can extend beyond the roots.
    gy, gx = np.where(mask & (np.indices(mask.shape)[0] <= top + 1))
    k = np.argmin(abs(gx - np.median(gx)) + 0.5 * (gy - top))
    spine = trace((gy[k], gx[k]))
    shape = [np.array([0.0, 0.0]), *spine]
    spine = thin(np.array(shape), 0.043)
    branches = []
    for lo in np.arange(0.10, 0.971, 0.082):
        binmask = (
            foliage
            & (np.indices(mask.shape)[0] <= ybase - lo * height)
            & (np.indices(mask.shape)[0] > ybase - (lo + 0.080) * height)
        )
        yy, xx = np.where(binmask)
        if len(xx) < 3:
            continue
        for side in [-1, 1]:
            extreme = np.quantile(xx, 0.10 if side < 0 else 0.90)
            k = np.argmin(np.abs(xx - extreme) + 0.40 * abs(yy - np.median(yy)))
            branch = separate(trace((yy[k], xx[k])), spine)
            if branch is not None:
                branches.append((branch, True))
    # Bare silhouette tips retain hooks and dead arms even if they carry no crown pixels.
    skeleton = skeletonize(wood)
    neighbors = ndimage.convolve(
        skeleton.astype("uint8"), np.ones((3, 3), dtype="uint8")
    )
    tips = np.argwhere(skeleton & (neighbors == 2))
    marks = []
    for y, x in sorted(tips, key=lambda p: -abs(p[1] - root[1])):
        p = np.array([(x - root[1]) / height, (ybase - y) / height])
        if p[1] < 0.12 or min(np.linalg.norm(spine - p, axis=1)) < 0.085:
            continue
        if any(np.linalg.norm(p - v) < 0.095 for v in marks):
            continue
        if np.mean(foliage[max(0, y - 3) : y + 4, max(0, x - 3) : x + 4]) > 0.29:
            continue
        branch = separate(trace((y, x)), spine)
        if branch is not None:
            branches.append((branch, False))
            marks.append(p)
        if len(marks) >= 5:
            break
    rootRow = mask[round(ybase - 0.016 * height)]
    boundaries = np.where(np.diff(np.r_[False, rootRow, False]))[0].reshape(-1, 2)
    feet = [
        ((left + right - 1) * 0.5 - root[1]) / height
        for left, right in boundaries
        if right - left >= max(1, height * 0.011)
    ]
    stemWidth = (
        np.quantile(
            profile[root[0] - min(5, root[0]) : root[0] + 1, :][
                mask[root[0] - min(5, root[0]) : root[0] + 1, :]
            ],
            0.70,
        )
        / height
    )
    return (
        image,
        spine,
        branches,
        feet,
        float(np.clip(stemWidth, 0.006, 0.07)),
        foliage,
        root,
        height,
    )


def thin(points, spacing):
    if len(points) < 2:
        return points
    dist = np.r_[0, np.cumsum(np.linalg.norm(np.diff(points, axis=0), axis=1))]
    if dist[-1] < 0.001:
        return points[[0, -1]]
    samples = np.linspace(0, dist[-1], max(2, int(dist[-1] / spacing) + 1))
    return np.stack(
        [np.interp(samples, dist, points[:, i]) for i in range(points.shape[1])], axis=1
    )


def separate(trace, spine):
    # Find where the projected limb first leaves the load-bearing leader.
    d = np.linalg.norm(trace[:, None, :] - spine[None, :, :], axis=2)
    distance = d.min(axis=1)
    if distance[-1] < 0.035:
        return None
    cross = np.where(distance < 0.035)[0]
    if not cross.size:
        return None
    start = int(cross[-1])
    branch = thin(np.vstack((spine[d[start].argmin()], trace[start:])), 0.048)
    return branch if np.linalg.norm(branch[-1] - branch[0]) > 0.045 else None


def branch_fan(source, tip, index, tint, broad):
    """Build a rightward spray with overlapping terminal shoots around the actual bough."""
    canvas = Image.new("RGBA", (236, 190))
    rng = np.random.default_rng(9561 + index)
    for j, t in enumerate(np.linspace(0.06, 0.88, 23)):
        side = 1 if j % 2 else -1
        span = (24 + 57 * (1 - t) ** 0.67) * rng.uniform(0.80, 1.16)
        angle = side * rng.uniform(0.45, 1.19)
        cut = tip.resize(
            (max(4, round(span * (0.83 if broad else 0.70))), max(4, round(span))),
            Image.Resampling.LANCZOS,
        )
        a = np.array(cut)
        rgb = a[:, :, :3].astype(float)
        mask = a[:, :, 3] > 100
        if mask.any():
            base = np.median(rgb[mask], axis=0)
            gain = np.clip((tint + 6) / (base + 6), 0.50, 1.75)
            a[:, :, :3] = np.clip(rgb * gain * rng.uniform(0.86, 1.13), 0, 255)
        cut = Image.fromarray(a)
        pad = Image.new("RGBA", (round(span * 2 + 6), round(span * 2 + 6)))
        c = pad.width // 2
        pad.paste(cut, (c - cut.width // 2, c - cut.height))
        rotated = pad.rotate(-90 - math.degrees(angle), Image.Resampling.BICUBIC)
        canvas.alpha_composite(
            rotated,
            (
                round(10 + t * 209 - c),
                round(94 + 7 * math.sin(t * 3 + index * 0.53) - c),
            ),
        )
    patch = source.resize((202, round(54 if broad else 45)), Image.Resampling.LANCZOS)
    c = np.array(patch)
    u = np.linspace(0, 1, patch.width)
    c[:, :, 3] = (
        c[:, :, 3] * np.minimum(1, u / 0.14) * np.minimum(1, (1 - u) / 0.12)
    ).astype("uint8")
    canvas.alpha_composite(Image.fromarray(c), (11, 94 - patch.height // 2))
    return canvas.crop(canvas.getbbox())


def specimen_leaf(sample, species, tint, seed):
    """Fit the photographed leaf surface to the outline of its regional species."""
    rng = np.random.default_rng(seed)
    n = sample.width // 2
    # The center-left oval in the CC0 broadleaf chart is a complete sunlit leaf.
    grain = sample.crop(
        (int(n * 0.041), int(n * 0.594), int(n * 0.185), int(n * 0.677))
    ).convert("RGB")
    grain = grain.resize((72, 96), Image.Resampling.LANCZOS)
    yy, xx = np.indices((96, 72), dtype=float)
    u = (xx - 35.5) / 35.5
    t = (94 - yy) / 92
    mid = np.clip(t, 0, 1)
    lobed = "oak" in species.lower()
    palm = "maple" in species.lower()
    if palm:
        # Palmate maples have one central tip, two high shoulders and lower lobes.
        contour = [
            (36, 94),
            (25, 78),
            (11, 78),
            (16, 65),
            (3, 59),
            (0, 44),
            (12, 47),
            (6, 30),
            (21, 40),
            (20, 13),
            (31, 25),
            (36, 0),
            (44, 26),
            (54, 13),
            (51, 40),
            (67, 29),
            (62, 45),
            (72, 43),
            (66, 59),
            (55, 66),
            (59, 77),
            (46, 77),
        ]
        mask = Image.new("L", (72, 96))
        ImageDraw.Draw(mask).polygon(contour, fill=255)
        alpha = np.asarray(mask)
    else:
        width = np.sin(np.pi * mid) ** (0.62 if "birch" in species.lower() else 0.72)
        if lobed:
            width *= 0.71 + 0.29 * np.cos(8.5 * np.pi * mid + 0.37)
        elif "cottonwood" in species.lower():
            width *= 0.64 + 0.80 * (1 - mid)
        elif "willow" in species.lower() or "tea" in species.lower():
            width *= 0.43
        else:
            width *= 0.82 + 0.14 * np.sin(2.4 * np.pi * mid)
        tooth = 0.042 * np.sin(mid * 77.0 + 0.2) * np.sin(np.pi * mid)
        alpha = np.uint8(
            ((np.abs(u) < (width + tooth) * 0.92) & (t > 0) & (t < 1)) * 255
        )
    src = np.asarray(grain).astype(float)
    value = src.mean(axis=2)
    inside = alpha > 0
    center = np.median(value[inside])
    chroma = np.clip(0.92 + (value - center) / 135, 0.65, 1.22) * (
        0.92 + 0.12 * (u + 1) / 2
    )
    # Veins run obliquely toward each lobe, visible only on close terminal leaflets.
    midrib = np.exp(-np.abs(u - 0.025 * np.sin(4 * mid)) * 44) * (1 - mid)
    laterals = np.exp(
        -np.abs(np.sin(np.pi * (mid * 7 - abs(u) * 1.22))) * 21
    ) * np.clip(1 - abs(u), 0, 1)
    rgba = np.zeros((96, 72, 4), dtype="uint8")
    rgba[:, :, :3] = np.clip(
        tint[None, None, :]
        * (chroma + midrib * 0.21 + laterals * 0.075)[:, :, None]
        * rng.uniform(0.91, 1.09),
        0,
        255,
    )
    rgba[:, :, 3] = alpha
    return Image.fromarray(rgba)


def leafy_shoot(tile, leaf, seed, tint):
    rng = np.random.default_rng(seed)
    canvas = Image.new("RGBA", (244, 164))
    draw = ImageDraw.Draw(canvas)
    draw.line(
        [(3, 83), (53, 79), (113, 84), (163, 75), (235, 79)],
        width=2,
        fill=(*np.uint8(tint * 0.67), 255),
    )
    for j, t in enumerate(np.linspace(0.035, 0.94, 21)):
        hand = 1 if j % 2 else -1
        x = 9 + 220 * t
        y = 81 + 3 * math.sin(3 * t)
        side = hand * rng.uniform(24, 49) * (1 - 0.56 * t)
        dx = rng.uniform(9, 23) * (1 - 0.4 * t)
        draw.line(
            [(x, y), (x + dx, y + side)], width=1, fill=(*np.uint8(tint * 0.82), 255)
        )
        l = round((26 + 15 * (1 - t)) * rng.uniform(0.84, 1.17))
        w = round(l * rng.uniform(0.57, 0.83))
        sprig = leaf.resize((w, l), Image.Resampling.LANCZOS).rotate(
            -hand * rng.uniform(38, 74), Image.Resampling.BICUBIC, expand=True
        )
        canvas.alpha_composite(
            sprig,
            (round(x + dx - sprig.width * 0.51), round(y + side - sprig.height * 0.5)),
        )
    patch = tile.resize((185, 44), Image.Resampling.LANCZOS)
    c = np.array(patch)
    u = np.linspace(0, 1, patch.width)
    c[:, :, 3] = (
        c[:, :, 3] * 0.76 * np.minimum(1, u / 0.17) * np.minimum(1, (1 - u) / 0.11)
    ).astype("uint8")
    canvas.alpha_composite(Image.fromarray(c), (18, 60))
    return canvas.crop(canvas.getbbox())


def paper_bark(im, spine, root, fol, height, caliper, base, species, index):
    # Unwrap a narrow strip inside the actual lower stem. Birch has horizontal
    # pores and peeling papery layers even in shade; preserve the photo's warm
    # yellow vs chalky white value instead of inheriting dark conifer grooves.
    pix = np.asarray(im)
    rows, cols = np.mgrid[0:112, 0:112]
    norm = 0.04 + 0.27 * (1 - rows / 111.0)
    axis = spine[np.argsort(spine[:, 1])]
    cx = np.interp(norm, axis[:, 1], axis[:, 0])
    x = (
        (root[1] + height * (cx + 0.58 * caliper * np.sin(cols * math.tau / 112)))
        * im.width
        / fol.shape[1]
    )
    y = (root[0] - height * norm) * im.height / fol.shape[0]
    strip = np.stack(
        [
            ndimage.map_coordinates(pix[:, :, j], [y, x], order=1, mode="nearest")
            for j in range(3)
        ],
        axis=2,
    ).astype(float)
    bright = np.quantile(strip.reshape(-1, 3), 0.71, axis=0)
    typical = (
        np.array([158, 133, 88])
        if species == "Yellow birch"
        else np.array([199, 197, 184])
    )
    tone = bright * 0.59 + typical * 0.41
    layer = ndimage.gaussian_filter(strip.mean(axis=2), (0.62, 3.2))
    layer = np.clip(layer - np.median(layer), -70, 47)
    grain = base[:, :, :3].astype(float).mean(axis=2).T
    grain = ndimage.gaussian_filter(grain, (0.38, 3.4))
    grain -= np.median(grain)
    surface = tone[None, None, :] + layer[:, :, None] * 0.58 + grain[:, :, None] * 0.29
    rng = np.random.default_rng(949 + index)
    for _ in range(64):
        cx = rng.uniform(0, 112)
        cy = rng.uniform(0, 112)
        width = rng.uniform(1.8, 8.7)
        thick = rng.uniform(0.34, 1.03)
        pore = np.exp(-(((cols - cx) / width) ** 4) - ((rows - cy) / thick) ** 2)
        surface -= pore[:, :, None] * rng.uniform(21, 77)
    out = base.copy()
    out[:, :, :3] = np.clip(surface, 0, 255)
    return out


def pack_atlas(forms, family, species, source):
    atlas = np.zeros((1024, 1024, 4), dtype="uint8")
    sample = Image.open(source / "surfaces.webp").convert("RGBA")
    n = sample.width // 2
    bark = sample.crop((n, 0, 2 * n, n)).resize((112, 112), Image.Resampling.LANCZOS)
    needleTip = sample.crop((int(n * 0.04), n + 3, int(n * 0.46), n + int(n * 0.48)))
    terminal = needleTip.transpose(Image.Transpose.ROTATE_270)
    uvs = []
    for v, (im, spine, branches, feet, caliper, fol, root, height) in enumerate(forms):
        pix = np.asarray(im)
        yy, xx = np.where(fol)
        green = pix[pix[:, :, 3] > 100, :3]
        tint = np.median(green, axis=0)
        xratio = im.width / fol.shape[1]
        yratio = im.height / fol.shape[0]
        slots = []
        broad_leaf = family in ("broad", "brush") and species not in (
            "Mormon tea",
            "Blackbrush",
            "Coastal dwarf heath",
            "Sand sagebrush",
        )
        leaf = specimen_leaf(sample, species, tint, v + 991) if broad_leaf else None
        for side in [-1, 1]:
            # Favor a real outer bough with fine transparent cutting around its free end.
            top, bottom = np.quantile(yy, [0.16, 0.83])
            near = (yy >= top) & (yy <= bottom)
            score = side * (xx - root[1]) + 0.14 * np.sin(yy * 0.25 + v) * height
            extreme = np.quantile(score[near], 0.88)
            sub = near & (score >= extreme)
            ix = np.where(sub)[0]
            i = ix[
                np.argmin(
                    abs(yy[ix] - np.median(yy[ix]))
                    + 0.3 * abs(xx[ix] - np.median(xx[ix]))
                )
            ]
            cx, cy = xx[i] * xratio, yy[i] * yratio
            # Adjacent twigs in the patch shade and disappear behind an irregular fringe.
            w = max(
                18, round(im.height * (0.32 if family in ("broad", "brush") else 0.36))
            )
            h = max(12, round(w * (0.81 if family in ("broad", "brush") else 0.54)))
            tile = im.crop(
                (
                    round(cx - w * 0.5),
                    round(cy - h * 0.5),
                    round(cx - w * 0.5) + w,
                    round(cy - h * 0.5) + h,
                )
            )
            c = np.array(tile)
            qy, qx = np.mgrid[-1 : 1 : complex(h), -1 : 1 : complex(w)]
            fringe = (
                1.09
                - (qx**2 + qy**2) ** 0.5
                + 0.096 * np.sin(11 * qx + 7 * qy + v)
                + 0.066 * np.cos(18 * qy - 5 * qx)
            )
            c[:, :, 3] = (
                c[:, :, 3].astype(float) * np.clip(fringe * 7.0, 0, 1)
            ).astype("uint8")
            tile = Image.fromarray(c)
            if side < 0:
                tile = tile.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            if family not in ("broad", "brush"):
                tile = branch_fan(tile, needleTip, v * 2 + int(side > 0), tint, False)
            elif broad_leaf:
                tile = leafy_shoot(tile, leaf, 971 + v * 2 + int(side > 0), tint)
            slots.append(tile)
        base = np.asarray(bark).copy()
        wood = green[
            (green[:, 1] < green[:, 0] * 1.035)
            & (abs(green[:, 1].astype(float) - green[:, 2]) < 60)
        ]
        barkTone = (
            np.quantile(wood, 0.54, axis=0)
            if len(wood) > 12
            else np.array([103, 91, 75])
        )
        colors = base[:, :, :3].astype(float)
        base[:, :, :3] = np.clip(
            (colors - colors.mean(axis=(0, 1))) * 0.80
            + barkTone * 0.47
            + colors.mean(axis=(0, 1)) * 0.53,
            0,
            255,
        )
        if "birch" in species.lower():
            base = paper_bark(im, spine, root, fol, height, caliper, base, species, v)
        slots.append(Image.fromarray(base))
        if family in ("broad", "brush"):
            # A shorter spray of this specimen's own leaves (including its regional pigment).
            slots.append(
                leaf.transpose(Image.Transpose.ROTATE_270)
                if broad_leaf
                else slots[0].transpose(Image.Transpose.FLIP_TOP_BOTTOM)
            )
        else:
            needles = np.asarray(terminal).copy()
            col = needles[:, :, :3].astype(float)
            needleColor = np.median(col[needles[:, :, 3] > 120], axis=0)
            needles[:, :, :3] = np.clip(
                col * (0.54 + 0.46 * np.clip(tint / (needleColor + 0.01), 0.54, 1.65)),
                0,
                255,
            )
            slots.append(Image.fromarray(needles))
        rect = []
        for j, slot in enumerate(slots):
            slot = slot.resize((112, 112), Image.Resampling.LANCZOS)
            t = np.zeros((128, 128, 4), dtype="uint8")
            t[8:120, 8:120] = np.asarray(slot)
            t[:, :, 3] = np.uint8(
                np.clip((t[:, :, 3].astype(float) - 9.0) * 255 / 235, 0, 255)
            )
            mask = t[:, :, 3] > 43
            if mask.any():
                iy, ix = ndimage.distance_transform_edt(
                    ~mask, return_distances=False, return_indices=True
                )
                t[:, :, :3] = np.where(
                    (t[:, :, 3] < 28)[:, :, None], t[iy, ix, :3], t[:, :, :3]
                )
            x = (v % 4) * 256 + (j % 2) * 128
            y = (v // 4) * 256 + (j // 2) * 128
            atlas[y : y + 128, x : x + 128] = t
            rect.append((x + 8.5, y + 8.5, 111, 111))
        uvs.append(rect)
    return Image.fromarray(atlas), uvs


class Mesh:
    def __init__(self, uv):
        self.uv = uv
        self.v = []
        self.idx = []

    def vert(self, p, n, mat, u, v):
        x, y, w, h = self.uv[mat]
        self.v.append(
            (*p, *n, 3 if mat == 2 else 2, (x + w * u) / 1024, (y + h * v) / 1024)
        )
        return len(self.v) - 1

    def quad(self, a, b, c, d):
        self.idx.extend((a, b, c, a, c, d))

    def tube(self, pts, widths, sides):
        prev = None
        for i, (p, r) in enumerate(zip(pts, widths)):
            tangent = normalize(pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)])
            axis = normalize(np.cross(tangent, [0.0, 0.0, 1.0]))
            orth = np.cross(tangent, axis)
            ring = []
            for j in range(sides + 1):
                t = j * math.tau / sides
                n = axis * math.cos(t) + orth * math.sin(t)
                ring.append(
                    self.vert(
                        p + n * r * (1 + 0.055 * math.sin(3 * t + 0.7)),
                        n,
                        2,
                        j / sides,
                        i / (len(pts) - 1),
                    )
                )
            if prev:
                for j in range(sides):
                    self.quad(prev[j], prev[j + 1], ring[j + 1], ring[j])
            prev = ring

    def spray(self, p, length, ang, dip, wide, roll, curve, mat, segments):
        # A folded three-row spray has a physical ridge and changing normals.
        d = np.array([math.cos(ang), 0.0, math.sin(ang)])
        s = np.array([-d[2], 0.0, d[0]])
        prev = None
        for j in range(segments + 1):
            t = j / segments
            center = p + length * (
                d * t + UP * (dip * t - curve * math.sin(t * math.pi))
            )
            row = []
            tilt = roll + 0.18 * t
            tangent = d + UP * (dip - curve * math.pi * math.cos(t * math.pi))
            for k in range(3):
                a = k - 1
                off = length * wide * a
                n = normalize(
                    np.cross(
                        s * math.cos(tilt) + UP * (math.sin(tilt) - 0.34 * a), tangent
                    )
                )
                row.append(
                    self.vert(
                        center
                        + off * (s * math.cos(tilt) + UP * math.sin(tilt))
                        - UP * abs(off) * 0.34,
                        n,
                        mat,
                        t,
                        1 - k * 0.5,
                    )
                )
            if prev:
                for k in range(2):
                    self.quad(prev[k], prev[k + 1], row[k + 1], row[k])
            prev = row


def profile_boughs(m, data, family, variant, lod, at):
    """Revolve visible bough envelopes about the traced stem, including open crown slots."""
    _, spine, _, _, _, fol, root, height = data
    yy, xx = np.where(fol)
    # The specimen's measured ground line is the bottom of the cropped island.
    base_y = fol.shape[0] - 1
    broad = family in ("broad", "brush")
    ys = np.linspace(0.09, 0.963, 12 if broad else 15)
    for tier, h in enumerate(ys):
        y = base_y - h * height
        center = at(h)
        stemX = root[1] + center[0] * height
        sample = np.abs(yy - y) <= max(1.6, height * (0.033 if broad else 0.026))
        if sum(sample) < max(3, 0.035 * height):
            continue
        xs = xx[sample]
        left, right = np.quantile(xs, [0.04, 0.96])
        extents = np.array([max(0, stemX - left), max(0, right - stemX)]) / height
        if extents.max() < 0.029:
            continue
        density = sum(sample) / max(
            1, (right - left + 1) * height * (0.066 if broad else 0.052)
        )
        count = max(2, min(7, round(2 + 4 * min(1, density))))
        phase = tier * 2.39996 + variant * 0.702
        for j in range(count):
            detail = np.random.default_rng(2071 + tier * 534 + j * 353 + variant * 1933)
            yaw = phase + j * math.tau / count + detail.uniform(-0.27, 0.27)
            # A tree sweeps more mass into its photographed heavy side. Preserve
            # depth on both sides of the stem when an eagle banks around it.
            direction = math.cos(yaw)
            extent = np.interp(
                direction,
                [-1, 0, 1],
                [extents[0], 0.60 * extents.max() + 0.4 * extents.mean(), extents[1]],
            )
            length = extent * detail.uniform(0.77, 1.06)
            if length < 0.031:
                continue
            start = at(np.clip(h + detail.uniform(-0.014, 0.014), 0.03, 0.98))
            forward = np.array([math.cos(yaw), 0.0, math.sin(yaw)])
            side = np.array([-forward[2], 0.0, forward[0]])
            dip = (
                detail.uniform(0.03, 0.32)
                if broad
                else detail.uniform(-0.20, 0.07) + (0.20 if h > 0.79 else 0)
            )
            sag = detail.uniform(0.045, 0.16) * (1.28 if family == "hemlock" else 1)
            bend = detail.uniform(-0.18, 0.18)

            def axis(t):
                return start + length * (
                    t * forward
                    + side * bend * t * t
                    + UP * (dip * t - sag * math.sin(t * math.pi))
                )

            if lod < 2:
                m.tube(
                    np.stack([axis(t) for t in [0, 0.42, 0.76, 1.0]]),
                    np.array([0.035, 0.021, 0.009, 0.0018]) * length,
                    4 if lod == 0 else 3,
                )
            if family == "podocarp":
                # Rimu branches carry hanging cords of awl foliage. Let the
                # secondary crown break into pendulous non-camera-facing sprays.
                for n, t in enumerate((0.36, 0.57, 0.78)):
                    turn = yaw + (0.52 if n % 2 else -0.45)
                    m.spray(
                        axis(t),
                        length * (0.52 - 0.16 * t),
                        turn,
                        -0.94,
                        0.13,
                        0.72,
                        0.13,
                        n % 2,
                        2 if lod < 2 else 1,
                    )
            roll = detail.uniform(-0.54, 0.54)
            slot = (j + tier) % 2
            m.spray(
                axis(0.10),
                length * 0.94,
                yaw + 0.52 * bend,
                dip + 0.05,
                0.40 if broad else 0.37,
                roll,
                0.10,
                slot,
                2 if lod < 2 else 1,
            )
            times = (
                [0.09, 0.19, 0.28, 0.38, 0.49, 0.60, 0.74, 0.84]
                if lod == 0
                else [0.13, 0.32, 0.52, 0.74]
                if lod == 1
                else [0.22, 0.40]
            )
            for n, t in enumerate(times):
                hand = 1 if n % 2 else -1
                turn = yaw + hand * detail.uniform(0.55, 1.02)
                span = length * (0.72 - 0.42 * t) * detail.uniform(0.91, 1.12)
                fall = dip - detail.uniform(0.12, 0.37)
                base = axis(t)
                m.spray(
                    base,
                    span,
                    turn,
                    fall,
                    0.37 if broad else 0.32,
                    roll * 0.65 + hand * 0.61,
                    0.14,
                    1 - slot,
                    2 if lod < 2 else 1,
                )
                if lod == 0 and n % 2:
                    end = (
                        base
                        + np.array([math.cos(turn), fall - 0.25, math.sin(turn)])
                        * span
                        * 0.52
                    )
                    m.spray(
                        end,
                        span * 0.44,
                        turn + hand * 0.66,
                        fall - 0.18,
                        0.34,
                        roll - hand * 0.48,
                        0.1,
                        3,
                        1,
                    )


def stool_stems(m, data, variant, lod):
    """Fork multiple woody stems from one shrub stool toward its measured crown."""
    _, _, _, _, caliper, fol, root, scale = data
    yy, xx = np.where(fol)
    height = (root[0] - yy) / scale
    candidates = (height > 0.36) & (height < 0.79)
    if candidates.sum() < 6:
        return
    lateral = (xx[candidates] - root[1]) / scale
    left, right = np.quantile(lateral, [0.06, 0.94])
    count = 4 + variant % 4
    for j in range(count):
        rng = np.random.default_rng(3411 + variant * 41 + j * 17)
        yaw = j * math.tau / count + variant * 0.91 + rng.uniform(-0.24, 0.24)
        d = np.array([math.cos(yaw), 0.0, math.sin(yaw)])
        side = np.array([-d[2], 0.0, d[0]])
        extent = np.interp(
            d[0],
            [-1, 0, 1],
            [max(0.055, -left), 0.43 * (right - left), max(0.055, right)],
        )
        target = extent * rng.uniform(0.47, 0.85)
        end = rng.uniform(0.43, 0.77)

        def point(t):
            return (
                d * (0.023 + target * t**1.25)
                + side * (0.05 * math.sin(t * math.pi + j) * t)
                + UP * (0.007 + end * t)
            )

        radius = max(0.0015, min(0.012, caliper * 0.48))
        m.tube(
            np.stack([point(t) for t in (0, 0.27, 0.57, 0.84, 1)]),
            radius * np.array([1.0, 0.85, 0.60, 0.28, 0.08]),
            4 if lod == 0 else 3,
        )
        if lod == 2:
            continue
        for n, t in enumerate([0.34, 0.60, 0.78]):
            hand = 1 if (n + j) % 2 else -1
            fork = yaw + hand * rng.uniform(0.52, 0.93)
            span = (0.09 + 0.27 * target) * (1 - 0.48 * t)
            aim = np.array([math.cos(fork), 0.39, math.sin(fork)])
            stem = point(t)
            m.tube(
                np.stack(
                    [stem, stem + aim * span * 0.46, stem + (aim + UP * 0.09) * span]
                ),
                radius * np.array([0.37, 0.22, 0.04]),
                3,
            )
            m.spray(
                stem + aim * span * 0.36,
                span * 0.72,
                fork,
                0.32,
                0.37,
                hand * 0.51,
                0.12,
                j % 2,
                2 if lod == 0 else 1,
            )


def woody_mesh(data, family, variant, lod, uv):
    image, spine, branches, feet, radius, _, _, _ = data
    radius = np.clip(radius * 0.72, 0.005, 0.029 if family != "brush" else 0.035)
    m = Mesh(uv)
    broad = family in ("broad", "brush")
    sag = {
        "hemlock": 0.59,
        "podocarp": 0.71,
        "larch": 0.39,
        "brush": 0.12,
        "broad": 0.13,
        "pine": 0.15,
        "fir": 0.15,
        "spruce": 0.23,
    }.get(family, 0.26)

    def trunkZ(h):
        return 0.025 * math.sin(3.4 * h + variant * 0.51) - 0.025 * math.sin(
            variant * 0.51
        )

    # Retain genuinely separated elevated roots, including nurse-log arches.
    arch = len(feet) > 1 and max(feet) - min(feet) > 0.15
    trunk = np.array([[x, h, trunkZ(h)] for x, h in spine if not arch or h > 0.13])
    if len(trunk) < 2:
        trunk = np.array([[0, 0, 0], [0, 1, 0.0]])
    if lod:
        trunk = thin(trunk, 0.073 if lod == 1 else 0.10)
    radii = np.array(
        [max(0.0008, radius * (1 - min(1, max(0, p[1]))) ** 1.08) for p in trunk]
    )
    m.tube(trunk, radii, 8 if lod == 0 else 6 if lod == 1 else 4)
    root = trunk[0] if arch else trunk[min(len(trunk) - 1, 2)]
    feet = feet if arch else [min(feet + [0]) - 0.021, max(feet + [0]) + 0.021]
    for j, x in enumerate(feet[:5]):
        dx = x if abs(x - root[0]) > 0.015 else x + (0.025 if j % 2 else -0.025)
        end = np.array([dx, 0.001, (j % 2 - 0.5) * radius])
        mid = 0.54 * root + 0.46 * end + UP * (0.032 if arch else -0.014)
        m.tube(
            np.stack((end, mid, root)),
            [radius * 0.49, radius * 0.60, radius * 0.52],
            5 if lod == 0 else 3,
        )
    ascending = trunk[np.argsort(trunk[:, 1])]

    def at_height(h):
        return np.array(
            [np.interp(h, ascending[:, 1], ascending[:, j]) for j in range(3)]
        )

    if family == "brush":
        stool_stems(m, data, variant, lod)
    profile_boughs(m, data, family, variant, lod, at_height)
    for k, (path, live) in enumerate(branches):
        # Retain pronounced original fork descents, bare arms and asymmetric
        # leader-side sprays in addition to the surrounding measured canopy.
        if live and k % 3:
            continue
        # Preserve source-side scaffolds and build oblique, fully attached
        # near/far boughs around the stem. These never turn toward the camera.
        h = float(path[0, 1])
        detail = np.random.default_rng(7530 + variant * 313 + k * 9)
        angle = 0 if path[-1, 0] >= path[0, 0] else math.pi
        angle += (1 if (k + variant) % 2 else -1) * detail.uniform(0.08, 0.42)
        side = 1 if path[-1, 0] >= path[0, 0] else -1
        route = np.array(
            [
                [
                    path[0, 0] + math.cos(angle) * (x - path[0, 0]) * side,
                    y,
                    trunkZ(h) + math.sin(angle) * (x - path[0, 0]) * side,
                ]
                for x, y in path
            ]
        )
        route = thin(route, 0.056 if lod == 0 else 0.10 if lod == 1 else 0.17)
        length = np.linalg.norm(np.diff(route, axis=0), axis=1).sum()
        if len(route) < 2 or length < 0.016:
            continue
        stemR = max(
            0.0010,
            min(
                radius * (0.56 if live else 0.33),
                length * (0.037 if broad else 0.025),
            ),
        )
        m.tube(route, np.linspace(stemR, 0.00045, len(route)), 4 if lod < 2 else 3)
        if not live:
            if lod == 0 and length > 0.067:
                # Growth shoots remain at old node scars, even when this
                # desiccated arm has shed its foliage. Preserve broken tips.
                for node in range(min(5, 2 + int(length / 0.10))):
                    n = max(
                        0,
                        min(
                            len(route) - 2,
                            round((0.21 + node * 0.14) * (len(route) - 1)),
                        ),
                    )
                    tangent = normalize(route[n + 1] - route[n])
                    hand = -1 if node % 2 else 1
                    cross = np.array([-tangent[2], 0.0, tangent[0]])
                    spur = normalize(
                        tangent * 0.37
                        + cross * hand * 0.71
                        + UP * (0.28 + 0.29 * math.sin(node + variant))
                    )
                    span = length * (0.12 + 0.054 * math.cos(node * 0.7 + k))
                    base = route[n]
                    mid = base + spur * span * 0.59
                    end = mid + (spur * 0.62 + UP * 0.22) * span * 0.56
                    m.tube(
                        np.stack([base, mid, end]),
                        [stemR * 0.37, stemR * 0.21, 0.00027],
                        3,
                    )
            continue
        dists = np.r_[0, np.cumsum(np.linalg.norm(np.diff(route, axis=0), axis=1))]

        def at(t):
            return np.array(
                [np.interp(t * length, dists, route[:, j]) for j in range(3)]
            )

        whorl = length * (0.71 if family in ("broad", "brush") else 0.68)
        # Keep genuine gaps around a bare trunk. Branch texture begins well
        # after its actual attachment and curls across the measured endpoint.
        mainDir = math.atan2(route[-1, 2] - route[0, 2], route[-1, 0] - route[0, 0])
        plane = (route[-1, 1] - route[0, 1]) / max(0.025, length)
        roll = detail.uniform(-0.55, 0.60)
        m.spray(
            at(0.27),
            whorl,
            mainDir,
            plane + 0.11,
            0.46 if broad else 0.35,
            roll,
            sag * 0.74,
            1 if k % 2 else 0,
            3 if lod == 0 else 2,
        )
        sample = (
            [0.18, 0.31, 0.43, 0.55, 0.69, 0.83]
            if lod == 0
            else [0.23, 0.47, 0.70]
            if lod == 1
            else [0.37, 0.58]
        )
        for j, t in enumerate(sample):
            hand = 1 if j % 2 else -1
            turn = mainDir + hand * detail.uniform(0.58, 1.12)
            span = length * (0.62 - 0.31 * t) * detail.uniform(0.84, 1.12)
            base = at(t)
            m.spray(
                base,
                span,
                turn,
                plane * 0.55 + 0.08,
                0.37 if broad else 0.32,
                roll + hand * 0.59,
                sag + 0.14 * hand,
                1 if j % 2 else 0,
                2 if lod < 2 else 1,
            )
            if lod == 0:
                end = base + span * 0.52 * np.array(
                    [math.cos(turn), plane * 0.4 + 0.04 - sag * 0.3, math.sin(turn)]
                )
                m.spray(
                    end,
                    span * 0.52,
                    turn + hand * 0.58,
                    plane * 0.32 - 0.10,
                    0.34,
                    roll - 0.38 * hand,
                    sag,
                    3,
                    2,
                )
    return m


def record_mesh(m, variant, lod, foot, body):
    values = np.array(m.v)
    out = np.zeros((len(values), 16), dtype="uint8")
    out[:, :6] = (
        np.rint(values[:, :3] * 22000).clip(-32768, 32767).astype("<i2").view("uint8")
    )
    out[:, 6:9] = (
        np.rint(values[:, 3:6] * 127).clip(-127, 127).astype("int8").view("uint8")
    )
    out[:, 9] = values[:, 6].astype("uint8")
    out[:, 10:14] = np.rint(values[:, 7:9] * UV_SCALE).astype("<u2").view("uint8")
    rec = dict(
        m=variant, l=lod, r=[round(foot, 4)] * 9, v=len(out), i=len(m.idx), p=len(body)
    )
    body.extend(out.tobytes())
    body.extend(np.array(m.idx, dtype="<u2").tobytes())
    body.extend(bytes(-len(body) % 4))
    return rec


def sheet_alpha(image, key):
    rgba = np.asarray(image)
    if np.mean(rgba[:, :, 3] < 30) >= 0.05:
        return image
    # A few delivered PNGs store an actually pale, almost opaque studio sweep
    # in their alpha. Recover only uniform light backgrounds with clean margins.
    border = np.concatenate(
        (
            rgba[:4].reshape(-1, 4),
            rgba[-4:].reshape(-1, 4),
            rgba[:, :4].reshape(-1, 4),
            rgba[:, -4:].reshape(-1, 4),
        )
    )
    white = np.median(border[:, :3], axis=0)
    if (
        min(white) < 225
        or np.quantile(np.max(abs(border[:, :3] - white), axis=1), 0.75) > 16
    ):
        raise ValueError("No usable alpha or uniform light backing: " + key)
    colors = rgba[:, :, :3].astype(float)
    contrast = np.maximum(0, white - colors).max(axis=2)
    cores = contrast > 73
    dist, index = ndimage.distance_transform_edt(~cores, return_indices=True)
    reference = colors[index[0], index[1]]
    separation = np.maximum(12, white - reference)
    weight = np.clip(
        (np.max(np.maximum(0, white - colors) / separation, axis=2) - 0.06) / 0.94, 0, 1
    )
    # Keep isolated thin twigs through their own contrast over shadow-free gaps.
    weight = np.maximum(weight, np.clip((contrast - 24) / 76, 0, 1))
    weight *= np.clip((contrast - 9) / 16, 0, 1) * np.where(
        dist > 5, np.clip((contrast - 21) / 21, 0, 1), 1
    )
    weight[cores] = 1
    a = np.clip(weight, 0, 1)
    restored = np.clip(
        (colors - white[None, None, :] * (1 - a[:, :, None]))
        / np.maximum(0.04, a[:, :, None]),
        0,
        255,
    )
    out = rgba.copy()
    out[:, :, :3] = np.uint8(restored)
    out[:, :, 3] = np.uint8(255 * a + 0.5)
    if np.mean(out[:, :, 3] < 30) < 0.16:
        raise ValueError("Could not recover clean gutters: " + key)
    return Image.fromarray(out)


def bake(job):
    row, path, names, dest, source = job
    key = row["id"]
    im = sheet_alpha(Image.open(path).convert("RGBA"), key)
    w, h = im.size
    forms = [
        scan_form(
            im.crop(
                (
                    round(i % 4 * w / 4),
                    round(i // 4 * h / 4),
                    round((i % 4 + 1) * w / 4),
                    round((i // 4 + 1) * h / 4),
                )
            )
        )
        for i in range(16)
    ]
    atlas, uv = pack_atlas(forms, row["family"], row["species"], source)
    records = []
    body = bytearray()
    for k, f in enumerate(forms):
        foot = float(np.clip(f[0].width / f[0].height * 0.49, 0.12, 1.35))
        for lod in range(3):
            mesh = woody_mesh(f, row["family"], k, lod, uv[k])
            records.append(record_mesh(mesh, k, lod, foot, body))
    hdr = json.dumps(records, separators=(",", ":")).encode()
    hdr += b" " * (-(len(hdr) + 4) % 4)
    payload = gzip.compress(
        struct.pack("<I", len(hdr)) + hdr + body, compresslevel=6, mtime=0
    )
    mesh_tmp = dest / (f"{key}.{os.getpid()}.bin.tmp")
    mesh_tmp.write_bytes(payload)
    os.replace(mesh_tmp, dest / (key + ".bin"))
    atlas_tmp = dest / (f"{key}.{os.getpid()}.webp.tmp")
    atlas.save(atlas_tmp, format="WEBP", method=6, quality=92, exact=True)
    os.replace(atlas_tmp, dest / (key + ".webp"))
    print(key, len(payload), [r["i"] // 3 for r in records[:3]], flush=True)
    return {
        **row,
        "cells": names,
        "source": hashlib.sha256(path.read_bytes()).hexdigest(),
        "revision": mesh_revision(row),
    }


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--art", type=Path, required=True)
    p.add_argument("--jobs", type=int, default=4)
    p.add_argument("--sheet", action="append")
    args = p.parse_args()
    cfg = json.loads((TOOLS / "regional_vegetation_species.json").read_text())
    dest = GAME / "canopy-data" / "regional"
    dest.mkdir(exist_ok=True)
    manifest = dest.parent / "regional-vegetation.json"
    previous = (
        {row["id"]: row for row in json.loads(manifest.read_text())}
        if manifest.exists()
        else {}
    )
    plan = args.art / "expansion" / "plans" / "sheets.json"
    canonical = json.loads(plan.read_text())
    jobs = []
    for sheet in canonical:
        if sheet["pipeline"] != "vegetation":
            continue
        key = sheet["id"]
        if args.sheet and key not in args.sheet:
            continue
        location = args.art if sheet.get("legacy") else args.art / "expansion"
        image = location / "generated" / (key + ".png")
        descriptions = location / "written" / (key + ".json")
        if not image.is_file() or not descriptions.is_file():
            continue
        cells = json.loads(descriptions.read_text())
        if len(cells) != 16:
            raise ValueError("Expected 16 named cells in " + key)
        cfgrow = {
            "id": key,
            "region": sheet["region"],
            "species": sheet["subject"],
            "family": cfg[sheet["subject"]],
            "habitat": sheet["habitat"],
        }
        prev = previous.get(key, {})
        names = [v["name"] for v in cells]
        if (
            prev.get("revision") == mesh_revision(cfgrow)
            and prev.get("cells") == names
            and prev.get("source") == hashlib.sha256(image.read_bytes()).hexdigest()
            and all(prev.get(k) == v for k, v in cfgrow.items())
            and all((dest / (key + suffix)).is_file() for suffix in [".bin", ".webp"])
        ):
            continue
        jobs.append((cfgrow, image, names, dest, GAME / "canopy-data"))
    changed = []
    failures = []
    with ProcessPoolExecutor(max_workers=args.jobs) as pool:
        pending = {pool.submit(bake, job): job[0]["id"] for job in jobs}
        for future in as_completed(pending):
            try:
                changed.append(future.result())
            except Exception as error:
                failures.append(f"{pending[future]}: {error}")
    if not changed:
        if failures:
            raise SystemExit("\n".join(failures))
        return
    # Independent regional baking processes may finish concurrently as new source
    # sheets arrive. Merge against the latest manifest under one writer lock.
    lockName = (
        "aerie-vegetation-"
        + hashlib.sha256(str(manifest.resolve()).encode()).hexdigest()[:18]
        + ".lock"
    )
    with (Path(tempfile.gettempdir()) / lockName).open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        previous = (
            {r["id"]: r for r in json.loads(manifest.read_text())}
            if manifest.exists()
            else {}
        )
        previous.update({r["id"]: r for r in changed})
        tmp = manifest.with_suffix(".tmp")
        tmp.write_text(
            json.dumps(
                sorted(previous.values(), key=lambda row: row["id"]),
                ensure_ascii=False,
                separators=(",", ":"),
            )
            + "\n"
        )
        os.replace(tmp, manifest)
    if failures:
        raise SystemExit("\n".join(failures))


if __name__ == "__main__":
    main()
