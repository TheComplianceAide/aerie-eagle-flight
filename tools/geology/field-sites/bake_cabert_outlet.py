"""Rebuild the Lac Cabert outlet, its creek corridor, and the shore of Lac Berté.

Source data are Gouvernement du Québec, MRNF and MELCCFP under CC BY 4.0.
The channel position follows the permanent GRHQ watercourse, fitted to 1 m
bare-earth and canopy heights. Submerged bed and rates of flow are estimated.
"""

import argparse
import base64
import json
from pathlib import Path

import numpy as np
import rasterio
import requests
from bake import survey
from bake_berte_narrows import lidar, ortho
from PIL import Image
from rasterio.features import rasterize
from rasterio.transform import from_origin
from scipy.ndimage import (
    distance_transform_edt,
    gaussian_filter,
    gaussian_filter1d,
    map_coordinates,
    median_filter,
)
from shapely.geometry import LineString, Polygon, mapping
from skimage.feature import peak_local_max

L, T, R, B = -4032, 1078, -3244, 1640
ORIGIN = np.array([535259, 5621856])
GRHQ = "https://servicescarto.mrnf.gouv.qc.ca/pes/rest/services/Territoire/GRHQ_WMS/MapServer"


def record(cache, layer, oid):
    f = cache / f"grhq-{oid}.json"
    if not f.exists():
        q = {
            "objectIds": oid,
            "outFields": "*",
            "outSR": 32619,
            "returnGeometry": "true",
            "f": "json",
        }
        r = requests.get(f"{GRHQ}/{layer}/query", params=q, timeout=55)
        r.raise_for_status()
        body = r.json()
        f.write_text(json.dumps(body["features"][0], ensure_ascii=False))
    return json.loads(f.read_text())


def local(points):
    return (np.array(points)[:, :2] - ORIGIN) * [1, -1]


def field(a, points):
    u = (points[..., 0] - L) / (R - L) * a.shape[1] - 0.5
    v = (points[..., 1] - T) / (B - T) * a.shape[0] - 0.5
    return map_coordinates(a, [v, u], order=1, mode="nearest")


def bytes16(values):
    return base64.b64encode(np.asarray(values, dtype="<i2").tobytes()).decode()


def bytes8(values):
    return base64.b64encode(np.asarray(values, dtype="i1").tobytes()).decode()


def dataset(cache, game):
    cache.mkdir(parents=True, exist_ok=True)
    game.mkdir(parents=True, exist_ok=True)
    rect = (L, T, R, B)
    ortho(cache, 2022, 18, 0.42, "cabert-2022.tif", rect)
    for layer in ("MNT", "MHC"):
        lidar(cache, layer, rect, ("22K10NE",), prefix="cabert")
    with rasterio.open(cache / "cabert-MNT.tif") as ds:
        ground = ds.read(1)
    with rasterio.open(cache / "cabert-MHC.tif") as ds:
        crown = ds.read(1)
    with rasterio.open(cache / "cabert-2022.tif") as ds:
        base = ds.read().transpose(1, 2, 0)
    photo = base.astype("f4") / 255
    marks = record(cache, 15, 17617331)["geometry"]["paths"][0]
    route = LineString(local(marks))
    s = np.arange(0, route.length, 2.0)
    cent = np.array([route.interpolate(v).coords[0] for v in s])

    def perpendicular(xy):
        mode = gaussian_filter1d(xy.astype("f4"), 1.5, axis=0, mode="nearest")
        d = np.gradient(mode, axis=0)
        d /= np.hypot(d[:, 0], d[:, 1])[:, None]
        return np.column_stack((-d[:, 1], d[:, 0]))

    normal = perpendicular(cent)
    lateral = np.arange(-16, 16.25, 0.5)
    cross = cent[:, None, :] + normal[:, None, :] * lateral[None, :, None]
    alt = field(ground, cross)
    can = field(crown, cross)
    lum = sum(
        field(photo[:, :, i], cross) * w for i, w in enumerate([0.25, 0.57, 0.18])
    )
    # Dynamic programming follows the valley bottom through low, shadowed gaps.
    # The 1:20k line is a prior, not a row of literal bends for the water mesh.
    cost = (
        np.clip(alt - np.percentile(alt, 12, axis=1)[:, None], -0.2, 6) * 1.50
        + np.clip(can, 0, 9) * 0.28
        + np.clip(lum - 0.07, 0, 0.65) * 2.7
        + 0.013 * np.abs(lateral)
    )
    transition = np.abs(lateral[:, None] - lateral[None, :])
    transition = 0.31 * transition + 0.22 * transition**2
    previous = cost[0]
    parents = np.zeros(cost.shape, dtype="i2")
    for i in range(1, len(s)):
        terms = previous[:, None] + transition
        parents[i] = np.argmin(terms, axis=0)
        previous = cost[i] + np.min(terms, axis=0)
        previous -= previous.min()
    idx = np.empty(len(s), int)
    idx[-1] = np.argmin(previous)
    for i in range(len(s) - 1, 0, -1):
        idx[i - 1] = parents[i, idx[i]]
    cent = cent + normal * gaussian_filter1d(lateral[idx], 1.25)[:, None]
    cent = gaussian_filter1d(cent, 0.85, axis=0)
    normal = perpendicular(cent)
    lateral = np.arange(-18, 18.25, 0.5)
    mid = len(lateral) // 2
    cross = cent[:, None, :] + normal[:, None, :] * lateral[None, :, None]
    alt = field(ground, cross)
    can = field(crown, cross)
    rgb = np.stack([field(photo[:, :, i], cross) for i in range(3)], axis=2)
    # Level the pools while retaining the successive short, steep sills of the
    # lidar profile. There are no meter-scale free-falling curtains in this reach.
    cutoff = np.abs(lateral) < 2.7
    thalweg = np.percentile(alt[:, cutoff], 25, axis=1)
    smoothed = gaussian_filter1d(median_filter(thalweg, 5), 1.45)
    water = np.minimum.accumulate(smoothed) + 0.14
    water[:14] = np.linspace(383.93, water[13], 14)
    water[-9:] = np.linspace(water[-9], 359.16, 9)
    grade = np.clip(-np.gradient(water, s), 0, 0.46)
    banks = []
    for i in range(len(s)):
        # A contiguous dark, low-canopy corridor distinguishes an open pool from
        # a shadowed opening in the high bank. The bank can differ on both sides.
        def width(sign, i=i):
            open_pixels = []
            for j in range(1, mid):
                k = mid + sign * j
                canopy = can[i, k]
                z = alt[i, k]
                r, g, _ = rgb[i, k]
                open_pixels.append(
                    float(
                        z < water[i] + 0.44
                        and (canopy < 1.9 or z < water[i] + 0.02 and canopy < 3.3)
                        and (g < 0.24 or g - r < 0.025)
                    )
                )
            window = gaussian_filter1d(np.array(open_pixels), 1.4)
            edge = np.flatnonzero(window < 0.43)
            optical = (edge[0] + 0.7) * 0.5 if len(edge) else 17.0
            # Where overhanging spruce obscure the summer waterline, fit the width
            # to the bank slope and valley asymmetry rather than a constant minimum.
            terrain_side = gaussian_filter1d(
                alt[i, mid + sign * np.arange(1, mid)] - water[i], 1.1
            )
            bank_edge = np.flatnonzero(terrain_side > 0.60)
            trough = (bank_edge[0] + 0.5) * 0.5 if len(bank_edge) else 14.0
            shaded = np.interp(can[i, mid + sign * 3], [0.5, 7.0], [0.0, 1.0])
            estimated = np.clip(0.78 + 0.48 * trough, 0.88, 4.2)
            return max(
                0.89, min(17.0, max(optical, estimated * (0.70 + 0.30 * shaded)))
            )

        banks.append([width(-1), width(1)])
    banks = np.clip(
        gaussian_filter1d(median_filter(np.array(banks), size=(3, 1)), 1.2, axis=0),
        0.88,
        17.0,
    )
    # A photographed bright patch only seeds white streaks if the reach is also
    # steep. Quiet passages keep the colour of the opaque boreal stream.
    wet = np.abs(lateral)[None, :] < np.minimum(3.0, banks.min(1) * 0.7)[:, None]
    energy = rgb.mean(2) - 0.72 * (rgb.max(2) - rgb.min(2))
    pale = np.array([np.percentile(energy[i, wet[i]], 75) for i in range(len(s))])
    activity = np.clip((gaussian_filter1d(grade, 1.1) - 0.032) / 0.13, 0, 1) * (
        0.54 + 0.46 * np.clip((pale - 0.07) / 0.22, 0, 1)
    )
    full = record(cache, 23, 4477454)["geometry"]["rings"]
    pond = (
        Polygon(local(full[0]), [local(r) for r in full[1:]]).buffer(0).simplify(1.55)
    )
    polys = [pond] if pond.geom_type == "Polygon" else list(pond.geoms)
    pondinfo = [
        [np.round(np.array(q.exterior.coords[:-1]), 1).tolist()]
        + [
            np.round(np.array(r.coords[:-1]), 1).tolist()
            for r in q.interiors
            if Polygon(r).area > 12
        ]
        for q in polys
    ]
    # Signed distance bounds subtraction to the 48.54 ha upper lake. The inlet
    # inside the source survey is recovered in higher detail from 1 m returns.
    west, north, east, south = -5960, -432, -3856, 1344
    step = 8

    def xzgeom(poly):
        return Polygon(
            [(x, -z) for x, z in poly.exterior.coords],
            [[(x, -z) for x, z in r.coords] for r in poly.interiors],
        )

    mask = rasterize(
        [(mapping(xzgeom(q)), 1) for q in polys],
        out_shape=((south - north) // step, (east - west) // step),
        transform=from_origin(west, -north, step, step),
    ).astype(bool)
    sign = distance_transform_edt(mask) - distance_transform_edt(~mask)
    coarse = np.clip(np.rint((sign - 0.5 * np.sign(sign)) * step), -127, 127)
    # Sample/mark the real banks and small bends at 1 m before reducing the
    # navigation surface to 4 m and the rendering vertices to an adaptive 2 m grid.
    rect = (-4016, 1096, -3264, 1624)
    l, t, r, b = rect
    z, x = np.mgrid[t : b + 1 : 1, l : r + 1 : 1]
    xy = np.stack((x, z), axis=-1)
    h = field(ground, xy)
    from scipy.spatial import cKDTree

    tree = cKDTree(cent)
    dist, index = tree.query(xy.reshape(-1, 2))
    dist = dist.reshape(h.shape)
    index = index.reshape(h.shape)
    across = np.sum((xy - cent[index]) * normal[index], axis=2)
    half = np.where(across < 0, banks[index, 0], banks[index, 1])
    fraction = np.abs(across) / half
    inside = np.clip(1 - fraction, 0, 1)
    wetbed = (
        (dist < half + 0.4)
        & (np.sum((xy - cent[0]) * np.array([0.65, 0.75]), axis=2) > -2)
        & (np.sum((xy - cent[-1]) * np.array([0.85, 0.2]), axis=2) < 3)
    )
    bed = water[index] - 0.09 - 0.44 * inside**0.64 * (1 - 0.50 * grade[index])
    h = np.where(wetbed, np.minimum(h, bed), h)
    localpond = rasterize(
        [(mapping(xzgeom(q)), 1) for q in polys],
        out_shape=h.shape,
        transform=from_origin(l - 0.5, -t + 0.5, 1.0, 1.0),
    ).astype(bool)
    h = np.where(
        localpond,
        np.minimum(
            h, 383.88 - 0.13 - np.minimum(distance_transform_edt(localpond) * 0.11, 2.0)
        ),
        h,
    )
    mouth = (h < 359.27) & (x > -3425) & (z > 1481)
    h = np.where(
        mouth,
        np.minimum(h, 359.12 - np.minimum(distance_transform_edt(mouth) * 0.12, 2.3)),
        h,
    )
    vegetation = np.clip(field(crown, xy[::4, ::4]) * 0.25, 0, 1)
    survey(
        h[::2, ::2],
        vegetation,
        rect,
        192,
        0.17,
        353.0,
        1 / 64,
        [4, 12, 24, 48, 72, 120, 180, 260, 300],
        (0.105, -0.994),
        1.539,
        game / "landform-cabert.bin",
    )
    # Dense original crowns are replaced by measured trees only in the flight corridor.
    zc, xc = np.indices(crown.shape)
    coords = np.stack((xc + L + 0.5, zc + T + 0.5), axis=-1)
    dc, idxc = tree.query(coords.reshape(-1, 2))
    dc = dc.reshape(crown.shape)
    clear = gaussian_filter(np.clip(crown, 0, 35), 0.67)
    strong = peak_local_max(clear, min_distance=2, threshold_abs=2.4)
    crowns = []
    for v, u in strong:
        X = L + u + 0.5
        Z = T + v + 0.5
        if dc[v, u] > 69 or X < l + 8 or X > r - 8 or Z < t + 8 or Z > b - 8:
            continue
        plane = idxc[v * crown.shape[1] + u]
        if dc[v, u] < min(banks[plane]) + 0.35:
            continue
        ey = float(crown[v, u])
        width = float(
            np.sqrt(
                np.sum(crown[max(0, v - 4) : v + 5, max(0, u - 4) : u + 5] > 0.76 * ey)
            )
            * 1.02
        )
        crowns.append(
            [
                round(2 * (X - l)),
                round(2 * (Z - t)),
                round(ey * 8),
                round(np.clip(width, 1.2, min(ey * 0.76, 8)) * 8),
            ]
        )
    # De-light the optical canopy enough to handle the live rain without baking a
    # second aerial treetop under each model. Narrow exposed banks retain their gravel.
    photo_crop = (
        Image.fromarray(base)
        .crop(
            (
                (l - L) / (R - L) * base.shape[1],
                (t - T) / (B - T) * base.shape[0],
                (r - L) / (R - L) * base.shape[1],
                (b - T) / (B - T) * base.shape[0],
            )
        )
        .resize((1344, 944), Image.Resampling.LANCZOS)
    )
    pic = np.array(photo_crop, dtype="f4") / 255
    sm = gaussian_filter(pic, (2.4, 2.4, 0))
    green = np.clip(
        (pic[:, :, 1] - 0.54 * pic[:, :, 0] - 0.46 * pic[:, :, 2]) / 0.14, 0, 1
    )[:, :, None]
    # Preserve narrow damp toes and the dry moss shoulder in the runtime terrain
    # albedo's alpha. The mask is a metric cross-bank distance, not an image brush.
    margin = np.clip(
        (half + 2.4 + np.minimum(grade[index] * 5.0, 1.0) - dist) / 2.9, 0.0, 1.0
    ) * (0.82 + 0.18 * np.clip(1 - field(crown, xy) / 5, 0, 1))
    bar = np.clip(
        0.65
        * np.clip(
            (field(base.astype("f4").mean(axis=2) / 255, xy) - 0.085) / 0.27, 0, 1
        )
        + activity[index] * 0.63,
        0,
        1,
    )
    margin *= 0.26 + 0.74 * bar
    margin = np.maximum(
        margin, np.clip(1 - distance_transform_edt(~localpond) / 2.8, 0, 1) * 0.65
    )
    maskimage = Image.fromarray(np.uint8(margin * 255)).resize(
        photo_crop.size, Image.Resampling.BILINEAR
    )
    pic = np.clip(
        (pic * 0.85 + 0.15 * sm) * (1 - 0.17 * green)
        + np.array([0.052, 0.070, 0.04]) * green,
        0,
        1,
    )
    albedo = Image.fromarray(np.uint8(pic * 255))
    albedo.putalpha(maskimage)
    albedo.save(game / "landform-cabert-aerial.webp", quality=87, method=6, exact=True)
    rows = np.column_stack(
        (cent[:, 0], cent[:, 1], water, banks[:, 0], banks[:, 1], activity)
    )
    sampled = np.rint(
        (rows - np.array([l, t, 350, 0, 0, 0])) * np.array([10, 10, 100, 20, 20, 250])
    )
    yref = 383.93
    # Render actual near-bank treetop directions for the upper lake and sampled
    # stream stations. Canopy returns furnish a silhouette at each real bearing.
    # Beyond the lidar window use the regional DEM and canopy cover.
    from cabert_reflections import bake_reflections

    bake_reflections(game, cent, water, ground, crown, base)
    # Coherent exposed mounds in the metre DEM are attached to their sites;
    # the smaller, unseen clasts are subsequently dressed only in these bars.
    native = field(ground, xy)
    under = gaussian_filter(native, 2.5)
    relief = native - under
    pale_ground = field(base.astype("f4").mean(axis=2) / 255, xy)
    stony = (
        (dist < half + 3.0)
        & (native > water[index] - 0.50)
        & (native < water[index] + 1.30)
        & (field(crown, xy) < 2.15)
    )
    rock_values = (
        0.07
        + 0.72 * np.clip(relief, 0, 0.95)
        + 0.40 * np.clip(pale_ground - 0.08, 0, 0.65)
        + 0.11 * activity[index]
    ) * stony
    localpeaks = peak_local_max(rock_values, min_distance=2, threshold_abs=0.158)
    rocks = []
    for v, u in localpeaks:
        relief0 = max(0.07, float(relief[v, u]))
        point = index[v, u]
        active = activity[point]
        # Low broad bars receive fine clasts; positive rough relief supports blocks.
        radius = np.clip(0.21 + relief0 * 1.12 + active * 0.17, 0.23, 1.42)
        rocks.append(
            [
                round(u * 2),
                round(v * 2),
                round(radius * 100),
                round(100 * (native[v, u] - 350)),
                round(active * 200),
            ]
        )
    info = {
        "origin": [l, t],
        "upperLevel": yref,
        "stations": bytes16(sampled),
        "rocks": bytes16(rocks),
        "crowns": bytes16(crowns),
        "pond": pondinfo,
        "pondMask": [
            west,
            north,
            step,
            coarse.shape[1],
            coarse.shape[0],
            bytes8(coarse),
        ],
    }
    (game / "labrador-cabert-data.js").write_text(
        "// © Gouvernement du Québec MRNF and MELCCFP; source geometry and licence in labrador-credits.txt.\nwindow.cabertFlowSurvey="
        + json.dumps(info, separators=(",", ":"))
        + ";\n"
    )
    print(
        "Stations",
        len(s),
        "crowns",
        len(crowns),
        "level",
        water[[0, -1]],
        "width quantiles",
        np.percentile(banks.sum(1), [0, 25, 50, 90, 100]),
        "maximum 2m grade",
        max(grade),
        "activity",
        np.percentile(activity, [0, 50, 90, 100]),
    )
    result = {
        "sourceCoordinates": [cent[0].tolist(), cent[-1].tolist()],
        "widthPercentiles": np.percentile(banks.sum(1), [0, 25, 50, 90, 100]).tolist(),
        "stationCount": len(s),
        "crowns": len(crowns),
        "rockFeatures": len(rocks),
        "active": [],
    }
    for low, high in [(100, 280), (280, 445), (460, 550), (555, 625)]:
        candidate = np.where((s >= low) & (s < high))[0]
        i = int(candidate[np.argmax(gaussian_filter1d(activity, 3)[candidate])])
        row = rows[i]
        print("voice", s[i], row.round(3))
        result["active"].append(
            {
                "distance": s[i],
                "position": row[:3].tolist(),
                "grade": float(grade[i]),
                "activity": float(activity[i]),
            }
        )
    (cache / "cabert-stats.json").write_text(json.dumps(result, indent=2))


if __name__ == "__main__":
    pa = argparse.ArgumentParser()
    pa.add_argument("--cache", type=Path, required=True)
    pa.add_argument("--game", type=Path, required=True)
    args = pa.parse_args()
    args.game.mkdir(parents=True, exist_ok=True)
    dataset(args.cache, args.game)
