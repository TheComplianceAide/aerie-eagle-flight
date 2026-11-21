"""Build the two gravel spits, optical shoals and LiDAR spruce stands at Lac Berté.

Québec source layers and geographic bounds are listed here and in the field
site notices. The estimated shallow-water relief is optical, not a sounding.
Large LiDAR sheets are windowed through GDAL HTTP range requests.
"""

import argparse
import base64
import hashlib
import itertools
import json
import math
import struct
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import rasterio
import triangle
from PIL import Image
from pydelatin import Delatin
from rasterio.features import rasterize
from rasterio.transform import from_bounds, from_origin
from rasterio.warp import Resampling, reproject, transform_bounds
from rasterio.windows import from_bounds as window_bounds
from scipy.interpolate import LinearNDInterpolator
from scipy.ndimage import (
    binary_dilation,
    center_of_mass,
    distance_transform_edt,
    gaussian_filter,
    label,
    map_coordinates,
    maximum_filter,
    median_filter,
)
from shapely import contains_xy
from shapely.geometry import Polygon, mapping

ROOT = Path(__file__).resolve().parents[3]
WMT = "https://servicesmatriciels.mern.gouv.qc.ca/erdas-iws/ogc/wmts/Imagerie_Aeroportee_Forestiere_Historique/"
LAYERS = {
    2015: "Inventaire_Ecoforestier_2015_2015_Inv_Ecofor_30cm_RVB",
    2022: "Inventaire_Ecoforestier_2022_2022_Inv_Ecofor_Cote-Nord_15cm_RVB",
}
LIDAR = "https://diffusion.mffp.gouv.qc.ca/Diffusion/DonneeGratuite/Foret/IMAGERIE/Produits_derives_LiDAR/22K"
BASE = "da35cedcc0a44da4a91abb93dc67b253da1fc557"
BASE_DIGEST = "a415e874f1693abcbecfcaab3c90aabd385e19fd189ff9860902ca68d1e67ae8"


def ortho(p, year, z, level, name):
    out_path = p / name
    if out_path.exists():
        return out_path
    left, top, right, bottom = -435, 1502, 165, 1934
    frame = (535259 + left, 5621856 - bottom, 535259 + right, 5621856 - top)
    w = round((right - left) / level)
    h = round((bottom - top) / level)
    extent = 20037508.342789244
    span = 2 * extent / 2**z
    a, b, c, d = transform_bounds(32619, 3857, *frame)
    x0 = math.floor((a + extent) / span)
    x1 = math.floor((c + extent) / span)
    y0 = math.floor((extent - d) / span)
    y1 = math.floor((extent - b) / span)
    mosaic = np.zeros(((y1 - y0 + 1) * 256, (x1 - x0 + 1) * 256, 3), np.uint8)

    def get(coord):
        x, y = coord
        tile = p / f"{year}-z{z}-{x}-{y}.png"
        url = f"{WMT}{LAYERS[year]}/default/GoogleMapsCompatibleExt2:epsg:3857/{z}/{y}/{x}.png"
        if not tile.exists():
            part = tile.with_suffix(".part")
            subprocess.run(
                [
                    "curl",
                    "--fail",
                    "-sSL",
                    "--retry",
                    "3",
                    "--max-time",
                    "50",
                    url,
                    "-o",
                    str(part),
                ],
                check=True,
            )
            part.replace(tile)
        with Image.open(tile) as im:
            return x, y, np.array(im.convert("RGB"))

    with ThreadPoolExecutor(4) as pool:
        for x, y, value in pool.map(
            get, [(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)]
        ):
            i = (y - y0) * 256
            j = (x - x0) * 256
            mosaic[i : i + 256, j : j + 256] = value
    orig = from_bounds(
        -extent + x0 * span,
        extent - (y1 + 1) * span,
        -extent + (x1 + 1) * span,
        extent - y0 * span,
        mosaic.shape[1],
        mosaic.shape[0],
    )
    out = np.zeros((3, h, w), np.uint8)
    tr = from_bounds(*frame, w, h)
    for i in range(3):
        reproject(
            mosaic[:, :, i],
            out[i],
            src_transform=orig,
            src_crs=3857,
            dst_transform=tr,
            dst_crs=32619,
            resampling=Resampling.bilinear,
        )
    with rasterio.open(
        out_path,
        "w",
        driver="GTiff",
        width=w,
        height=h,
        count=3,
        dtype="uint8",
        compress="deflate",
        transform=tr,
        crs=32619,
    ) as dst:
        dst.write(out)
    return out_path


def lidar(root, kind):
    path = root / f"berte-{kind}.tif"
    if path.exists():
        return
    l, t, r, b = -435, 1502, 165, 1934
    bounds = (535259 + l, 5621856 - b, 535259 + r, 5621856 - t)
    w = round(r - l)
    h = round(b - t)
    tr = from_bounds(*bounds, w, h)
    result = np.full((h, w), -9999, dtype=np.float32)
    for sheet in ["22K10NE", "22K09NO"]:
        url = f"{LIDAR}/{sheet}/{kind}_{sheet}.tif"
        with (
            rasterio.Env(
                GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
                GDAL_HTTP_MULTIRANGE="SERIAL",
                GDAL_HTTP_TIMEOUT="35",
            ),
            rasterio.open("/vsicurl/" + url) as src,
        ):
            crs = src.crs or "EPSG:2948"
            q = transform_bounds("EPSG:32619", crs, *bounds)
            win = window_bounds(*q, src.transform).round_offsets().round_lengths()
            a = src.read(
                1, window=win, boundless=True, fill_value=-9999, out_dtype="float32"
            )
            out = np.full((h, w), -9999, dtype=np.float32)
            reproject(
                a,
                out,
                src_transform=src.window_transform(win),
                src_crs=crs,
                src_nodata=src.nodata or -9999,
                dst_transform=tr,
                dst_crs=32619,
                dst_nodata=-9999,
                resampling=Resampling.bilinear,
            )
            ok = (out > -9900) & (out < 700)
            result[ok] = out[ok]
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        width=w,
        height=h,
        count=1,
        dtype="float32",
        compress="deflate",
        nodata=-9999,
        crs=32619,
        transform=tr,
    ) as ds:
        ds.write(result, 1)


def local_coast(game, control):
    survey = (
        (game / "atlas-labrador-survey.js")
        .read_text()
        .split('window.ATLAS_SURVEYS["labrador"]=')[1]
    )
    survey = json.loads(survey.strip().rstrip(";"))
    water = survey["shore"]
    # Splice from the end to leave the original chart indices intact.
    water[1398:1419] = control["east"]
    water[621:635] = control["west"]
    return [water, *survey["shoreHoles"]]


def bake_optical(p, game, rings, ortho2022, ortho2015):
    left, top, right, bottom = -435, 1502, 165, 1934
    spacing = 0.6
    rows, cols = np.mgrid[
        : round((bottom - top) / spacing), : round((right - left) / spacing)
    ]
    x = left + (cols + 0.5) * spacing
    z = top + (rows + 0.5) * spacing

    def sample(src, X, Z, band=None):
        with rasterio.open(src) as ds:
            tr = ds.transform
            buf = ds.read()
            axes = [(5621856 - Z - tr.f) / tr.e - 0.5, (535259 + X - tr.c) / tr.a - 0.5]
            if band is not None:
                return map_coordinates(
                    buf[band - 1].astype(float), axes, order=1, mode="nearest"
                )
            return np.stack(
                [
                    map_coordinates(ch.astype(float), axes, order=1, mode="nearest")
                    for ch in buf
                ],
                axis=-1,
            )

    def water(X, Z, l, t, spacing):
        # rasterio row increases southward, convert local south to positive north.
        def axis(r):
            return [(x, -z) for x, z in r]

        geom = Polygon(axis(rings[0]), holes=[axis(r) for r in rings[1:]])
        return rasterize(
            [(mapping(geom), 1)],
            out_shape=X.shape,
            transform=from_origin(l, -t, spacing, spacing),
            dtype="u1",
        ).astype(bool)

    wet = water(x, z, left, top, spacing)
    distance = (distance_transform_edt(wet) - distance_transform_edt(~wet)) * spacing
    rgb = sample(ortho2022, x, z) / 255.0
    old = sample(ortho2015, x, z) / 255.0
    # The 2015 image penetrates the shallows better than the later summer flight.
    # The small object in the 2022 channel does not persist in 2015; leave open water.
    R = old[:, :, 0] * 0.75 + old[:, :, 1] * 0.25
    calibration = (x > -245) & (x < 70) & (z > 1596) & (z < 1820)
    dark = np.percentile(R[calibration & wet & (distance > 53)], 24)
    near = np.percentile(R[calibration & wet & (distance < 2.4)], 83)
    T = np.clip((R - dark) / (near - dark), 0.004, 0.995)
    # A smooth lower envelope suppresses glint and small surface ripples. Rooted
    # copper-coloured sand and gravel persist in the photographs of both years.
    T = gaussian_filter(T, 1.3)
    # Optical depth proxy in the game's shallow-water layer, not a sonar sounding.
    modelDepth = np.clip(-np.log(T) / 0.84, 0.08, 7.2)
    modelDepth = np.minimum(modelDepth, np.maximum(0.07, distance * 0.52 + 0.08))
    # Avoid uncertain water pixels on the land side of the pair's waterline.
    # Sand tone within 2 m of the aerial shoreline is sampled from the actual
    # neighboring upper margin and then relit by the recorded local sun direction.
    # Replace the modern roof and watercraft before restoring the family-era scene.
    # Use the microscopic aleatoric grass variation from the adjacent actual site.
    zones = [
        (-28, 1752.2, 7, 5.2),
        (-33.9, 1763.4, 2.3, 2.8),
        (-42.0, 1764, 2.7, 2.9),
        (-52.8, 1748.2, 3.6, 4),
        (-45.4, 1756.8, 3.7, 2.7),
    ]
    for cx, cz, rx, rz in zones:
        nearBox = (np.abs(x - cx) < rx) & (np.abs(z - cz) < rz) & ~wet
        isVehicle = nearBox & (
            (rgb[:, :, 2] > 0.27) & (rgb[:, :, 1] > rgb[:, :, 0] + 0.032)
            | (rgb.min(2) > 0.52)
        )
        erase = binary_dilation(isVehicle, iterations=3)
        good = (~erase) & ~wet
        iy, ix = distance_transform_edt(
            ~good, return_distances=False, return_indices=True
        )
        rgb[erase] = rgb[iy[erase], ix[erase]]
    # Color and signed distance share a single sampler in the terrain and water
    # programs. Under water the red value stores photographed transmissivity. The
    # remaining channels retain sediment tone variations attributable to that bed.
    stored = rgb.copy()
    sand = np.clip((old[:, :, 0] - old[:, :, 2] - 0.015) * 2.4 + 0.22, 0, 1)
    relative = old[:, :, 1] - gaussian_filter(old[:, :, 1], 8.0)
    substrate = np.clip(0.50 + relative * 4.0, 0.13, 0.9)
    stored[wet] = np.stack([T, sand, substrate], axis=-1)[wet]
    alpha = 0.5 - 0.43 * np.sign(distance) * np.sqrt(
        np.clip(abs(distance) / 66.0, 0, 1)
    )
    vals = np.uint8(np.rint(255 * np.clip(np.dstack((stored, alpha)), 0, 1)))
    Image.fromarray(vals).save(
        game / "labrador-narrows-field.webp", lossless=True, method=6, exact=True
    )
    np.savez_compressed(
        p / "berte-optical-depth.npz",
        depth=modelDepth.astype("f4"),
        distance=distance.astype("f4"),
    )


def bake_crowns(p, game, control):
    with rasterio.open(p / "berte-MHC.tif") as src:
        a = src.read(1)
        tr = src.transform
        a[a < 0] = 0
    H, W = a.shape
    z, x = np.mgrid[0:H, 0:W]
    x = tr.c + tr.a * (x + 0.5) - 535259
    z = 5621856 - tr.f - tr.e * (z + 0.5)
    # Store only the actual two spits and the stand immediately behind Camp Sud.
    box = control["crown_envelope"]
    region = Polygon(box)
    within = contains_xy(region, x, z)
    soft = gaussian_filter(a, 0.50)
    peaks = (soft == maximum_filter(soft, 3)) & (soft > 2.15) & within
    labs, n = label(peaks)
    centres = np.array(center_of_mass(soft, labs, index=np.arange(1, n + 1)))
    rows, cols = np.rint(centres).astype(int).T
    xs, zs = x[rows, cols], z[rows, cols]
    hs = a[rows, cols]
    radii = np.linspace(0.65, 5.9, 15)
    angles = np.arange(12) * np.pi / 6
    dirs = np.stack([np.cos(angles), np.sin(angles)], axis=1)
    # Width is a local canopy estimate: integrate the radius of the half-crown
    # profile in twelve bearings. Narrow trajectories split adjoining conifers.
    lengths = []
    for yy, xx, hh in zip(rows, cols, hs):
        rr = yy + dirs[:, 0, None] * radii[None]
        cc = xx + dirs[:, 1, None] * radii[None]
        vals = map_coordinates(a, [rr, cc], order=1, mode="nearest")
        edge = vals < max(1.1, hh * 0.69)
        stop = np.where(edge.any(axis=1), radii[edge.argmax(axis=1)], radii[-1])
        lengths.append(
            np.clip(np.percentile(stop, 36) * 1.63, 1.0, min(6.6, hh * 0.56))
        )
    s = np.asarray(lengths)
    sortedids = np.argsort(-hs)
    accepted = []
    buckets = {}
    for i in sortedids:
        px, pz = xs[i], zs[i]
        bw = s[i]
        key = (int(np.floor(px / 6)), int(np.floor(pz / 6)))
        if any(
            (px - xs[j]) ** 2 + (pz - zs[j]) ** 2 < max(1.4, min(bw, s[j]) * 0.48) ** 2
            for dx in [-1, 0, 1]
            for dz in [-1, 0, 1]
            for j in buckets.get((key[0] + dx, key[1] + dz), [])
        ):
            continue
        if (
            abs(px + 28) < 8
            and abs(pz - 1752) < 7
            or abs(px + 34) < 2.5
            and abs(pz - 1763) < 3
        ):
            continue
        accepted.append(i)
        buckets.setdefault(key, []).append(i)
    I = np.array(accepted)
    near = np.c_[xs[I], zs[I], hs[I], s[I]]
    data = np.rint(
        np.c_[2 * near[:, 0], 2 * near[:, 1], 8 * near[:, 2], 8 * near[:, 3]]
    ).astype("<i2")
    encoded = base64.b64encode(data).decode("ascii")

    def encode(points):
        return [round(v * 10) for pt in points for v in pt]

    payload = {
        "east": encode(control["east"]),
        "west": encode(control["west"]),
        "envelope": box,
        "crowns": encoded,
    }
    (game / "labrador-narrows-survey.js").write_text(
        "// Gouvernement du Québec, CC BY 4.0. See labrador-credits.txt.\nwindow.berteSouthSurvey="
        + json.dumps(payload, separators=(",", ":"))
        + ";\n"
    )


def bake_mesh(p, game, rings, src):
    magic, ver, step, left, top, right, bottom, nx, nz, datum, scale, num = (
        struct.unpack_from("<4sHH4iHHffI", src)
    )
    baseDatum = datum - 8
    level = 359.16
    bounds = (-435, 1502, 165, 1934)
    l, t, r, b = bounds
    with rasterio.open(p / "berte-MNT.tif") as ds:
        dtm = ds.read(1)

    def axis(a):
        return [(x, -z) for x, z in a]

    body = Polygon(axis(rings[0]), holes=[axis(a) for a in rings[1:]])
    wet = rasterize(
        [(mapping(body), 1)],
        out_shape=dtm.shape,
        transform=from_origin(l, -t, 1, 1),
        dtype="u1",
    ).astype(bool)
    signed = distance_transform_edt(wet) - distance_transform_edt(~wet)
    Z, X = np.mgrid[t:b, l:r]
    X = X + 0.5
    Z = Z + 0.5
    # The 1 m MNT contains returns from the peaked building photographed at
    # this location. Outside the roof the same shoreline rises gently. Fill
    # its covered patch harmonically from the ring of observed ground. The
    # historical structure and its porch can then sit on this reconstructed
    # ground instead of resting on another building's roof.
    footprint = Polygon(
        [(-21.99, 1751.11), (-31.64, 1747.32), (-33.97, 1753.24), (-24.32, 1757.03)]
    )
    inside = contains_xy(footprint.buffer(2.25), X, Z)
    rr, cc = np.where(inside)
    for _ in range(300):
        dtm[rr, cc] = 0.25 * (
            dtm[rr - 1, cc] + dtm[rr + 1, cc] + dtm[rr, cc - 1] + dtm[rr, cc + 1]
        )
    coverage = np.minimum.reduce([X - l, r - X, Z - t, b - Z])
    weight = np.clip(coverage / 18.0, 0, 1)
    weight = weight**2 * (3 - 2 * weight)
    with np.load(p / "berte-optical-depth.npz") as data:
        # Fade the optical bed along a broad oval around the two points.
        # Its outer edge lies inside the source and does not project the old
        # rectangular raster footprint across the lake.
        radial = np.hypot((X + 123.0) / 307.0, (Z - 1718.0) / 223.0)
        falloff = np.clip((radial - 0.48) / 0.48, 0, 1)
        within = 1.0 - falloff * falloff * (3.0 - 2.0 * falloff)
        proxy = map_coordinates(
            data["depth"],
            [(Z - 1502.0) / 0.6 - 0.5, (X + 435.0) / 0.6 - 0.5],
            order=1,
            mode="nearest",
        )
        # Optical depth is an estimate on sand; fine ripples and isolated sky glints
        # in the ortho do not become permanent spikes in the bottom.
        proxy = gaussian_filter(median_filter(proxy, 3), 1.1)
    generic = np.clip(signed * 0.21, 0.04, 6)
    depth = generic * (1.0 - within) + proxy * within
    height = np.where(
        wet,
        level - np.maximum(0.045, depth),
        np.maximum(dtm, level + np.minimum(0.45, -signed * 0.085)),
    )

    def sample(a, x, z):
        return map_coordinates(
            a, np.broadcast_arrays(z - t - 0.5, x - l - 0.5), order=1, mode="nearest"
        )

    # The original inset stores small variations in the provincial water
    # returns at the lake datum. Some were centimetres above the game surface
    # even 63 m within the mapped lake. Only in its confirmed open-water
    # interior, lower those low samples enough for a water surface to cover
    # the old triangulated facets. Preserve rocks and verified exposed banks.
    lake_mask = rasterize(
        [(mapping(body), 1)],
        out_shape=((bottom - top) // 2 + 1, (right - left) // 2 + 1),
        transform=from_origin(left, -top, 2, 2),
        dtype="u1",
    ).astype(bool)
    lake_distance = distance_transform_edt(lake_mask) * 2

    def blend(x, z, original):
        active = sample(weight, x, z) * ((x > l) & (x < r) & (z > t) & (z < b))
        inland = map_coordinates(
            lake_distance,
            np.broadcast_arrays((z - top) / 2 - 0.5, (x - left) / 2 - 0.5),
            order=1,
            mode="nearest",
        )
        interior = np.clip((inland - 6.0) / 14.0, 0, 1)
        low = np.clip((level + 0.48 - original) / 0.16, 0, 1)
        corrected = original + interior * low * np.minimum(0.0, level - 0.46 - original)
        return corrected + (sample(height, x, z) - corrected) * active

    oldGrid = np.frombuffer(src, dtype="<i2", count=nx * nz, offset=40).reshape(nz, nx)
    zz, xx = np.mgrid[:nz, :nx]
    G = blend(left + xx * step, top + zz * step, datum + oldGrid * scale)
    newGrid = np.rint((G - baseDatum) / scale).astype("<i2")

    def unique_edges(faces):
        return np.unique(
            np.sort(
                np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]]),
                axis=1,
            ),
            axis=0,
        )

    offset = 40 + 2 * nx * nz
    wrote = []
    growth = 0
    for sector in range(num):
        n, fc = struct.unpack_from("<II", src, offset)
        xyz = np.frombuffer(src, "<u2", n * 3, offset + 8).reshape(n, 3).copy()
        flux = np.frombuffer(src, "u1", n * 4, offset + 8 + 6 * n).reshape(n, 4).copy()
        ids = (
            np.frombuffer(src, "<u2", fc * 3, offset + 8 + n * 10).reshape(fc, 3).copy()
        )
        offset += 8 + n * 10 + 6 * fc
        xx = xyz[:, 0].astype(float) + left
        zz = xyz[:, 1].astype(float) + top
        oldY = datum + xyz[:, 2] * scale
        x0, x1, z0, z1 = map(int, [min(xx), max(xx), min(zz), max(zz)])
        xyz[:, 2] = np.rint((blend(xx, zz, oldY) - baseDatum) / scale).astype("<u2")
        if x1 <= l or x0 >= r or z1 <= t or z0 >= b:
            wrote.append(
                struct.pack("<II", n, fc)
                + xyz.tobytes()
                + flux.tobytes()
                + ids.tobytes()
            )
            continue
        points = np.stack([xx, zz], axis=1).astype("i4")
        rect = (
            (xx[ids].max(1) > l)
            & (xx[ids].min(1) < r)
            & (zz[ids].max(1) > t)
            & (zz[ids].min(1) < b)
        )
        retained = ids[~rect]
        segments = (
            [tuple(pair) for pair in unique_edges(retained)] if len(retained) else []
        )
        interpol = LinearNDInterpolator(points, np.c_[oldY, flux])
        # Keep existing sector corners/vertices and their neighbouring unchanged
        # triangles. Area inside the optical/terrain envelope uses a denser irregular
        # triangulation, with one-metre vertices approaching the measured waterline.
        order = {tuple(k): i for i, k in enumerate(points)}
        verts = list(xyz)
        illum = list(flux)
        zg, xg = np.mgrid[z0 : z1 + 1, x0 : x1 + 1]
        act = (xg > l) & (xg < r) & (zg > t) & (zg < b)
        dist = np.abs(sample(signed, xg, zg))
        sea = sample(height, xg, zg) < level + 0.8
        coastal = sea | (dist < 23)
        fine = sample(height, xg, zg)
        model = Delatin(fine, max_error=0.13)
        vv = model.vertices.astype(int)
        chosen = np.zeros(xg.shape, dtype=bool)
        chosen[chosen.shape[0] - 1 - vv[:, 1], vv[:, 0]] = True
        add = act & (
            (chosen & (coastal | (dist < 15)))
            | ((dist < 2.4) & (xg % 3 == 0) & (zg % 3 == 0))
        )
        # Sector boundaries receive the same coordinates on both sides.
        border = (xg == x0) | (xg == x1) | (zg == z0) | (zg == z1)
        add |= (
            act & border & ((((xg + zg) % 2 == 0) & (dist < 8)) | ((xg + zg) % 12 == 0))
        )
        zq, xq = zg[add], xg[add]
        samples = interpol(xq, zq)
        ok = np.all(np.isfinite(samples), axis=1)
        zq, xq, samples = zq[ok], xq[ok], samples[ok]
        yy = blend(xq, zq, samples[:, 0])
        for x, z, y, field in zip(xq, zq, yy, samples[:, 1:]):
            key = (x, z)
            if key in order:
                continue
            order[key] = len(verts)
            verts.append([x - left, z - top, round((y - baseDatum) / scale)])
            illum.append(field)
        for axisIndex, val in [(0, x0), (0, x1), (1, z0), (1, z1)]:
            line = sorted(
                [(xy, i) for xy, i in order.items() if xy[axisIndex] == val],
                key=lambda item: item[0][1 - axisIndex],
            )
            segments.extend([(a[1], bb[1]) for a, bb in itertools.pairwise(line)])
        verts = np.array(verts, dtype="<u2")
        illum = np.rint(illum).astype("u1")
        segs = np.unique(np.sort(np.asarray(segments), axis=1), axis=0)
        # Remove constraints spanning a new intermediate vertex on the outer boundary.
        keep = np.ones(len(segs), bool)
        for axisIndex, val in [
            (0, x0 - left),
            (0, x1 - left),
            (1, z0 - top),
            (1, z1 - top),
        ]:
            same = (verts[segs[:, 0], axisIndex] == val) & (
                verts[segs[:, 1], axisIndex] == val
            )
            loc = sorted(
                np.where(verts[:, axisIndex] == val)[0],
                key=lambda i: int(verts[i, 1 - axisIndex]),
            )
            ranks = {i: j for j, i in enumerate(loc)}
            for i in np.where(same)[0]:
                if abs(ranks[segs[i, 0]] - ranks[segs[i, 1]]) > 1:
                    keep[i] = False
        result = triangle.triangulate(
            {"vertices": verts[:, :2].astype(float), "segments": segs[keep]}, "pQY"
        )
        if len(result["vertices"]) != len(verts):
            raise RuntimeError(("Unexpected Steiner vertex", sector))
        faces = result["triangles"][:, ::-1].astype("<u2")
        assert len(verts) < 65536
        wrote.append(
            struct.pack("<II", len(verts), len(faces))
            + verts.tobytes()
            + illum.tobytes()
            + faces.tobytes()
        )
        growth += len(faces) - fc
        print(sector, n, fc, "=>", len(verts), len(faces))
    assert offset == len(src)
    out = (
        struct.pack(
            "<4sHH4iHHffI",
            magic,
            ver,
            step,
            left,
            top,
            right,
            bottom,
            nx,
            nz,
            baseDatum,
            scale,
            num,
        )
        + newGrid.tobytes()
        + b"".join(wrote)
    )
    (game / "landform-labrador.bin").write_bytes(out)
    print("new triangles", growth, "bytes", len(out))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--game", type=Path, default=ROOT / "game")
    parser.add_argument("--source-game", type=Path, default=ROOT / "game")
    args = parser.parse_args()
    args.cache.mkdir(exist_ok=True, parents=True)
    args.game.mkdir(exist_ok=True, parents=True)
    control = json.loads(
        (Path(__file__).parent / "source/berte-narrows-shore.json").read_text()
    )
    rings = local_coast(args.source_game, control)
    rot = ortho(args.cache, 2022, 19, 0.30, "berte-channel-2022.tif")
    old = ortho(args.cache, 2015, 18, 0.40, "berte-channel-2015.tif")
    for kind in ["MNT", "MHC"]:
        lidar(args.cache, kind)
    src = (args.source_game / "landform-labrador.bin").read_bytes()
    if hashlib.sha256(src).hexdigest() != BASE_DIGEST:
        src = subprocess.check_output(
            ["git", "show", BASE + ":game/landform-labrador.bin"], cwd=ROOT
        )
    if hashlib.sha256(src).hexdigest() != BASE_DIGEST:
        raise ValueError("Wrong baseline terrain")
    bake_optical(args.cache, args.game, rings, rot, old)
    bake_mesh(args.cache, args.game, rings, src)
    bake_crowns(args.cache, args.game, control)
