"""Fit the water polygon, exposed shore and forest floor to the six actual lake sites."""

import argparse, json, math, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import numpy as np
import rasterio
from affine import Affine
from rasterio.features import rasterize
from scipy.ndimage import (
    gaussian_filter,
    map_coordinates,
    distance_transform_edt,
    median_filter,
)
from shapely.geometry import Polygon, LinearRing
from skimage.measure import approximate_polygon
from PIL import Image
from sources import sites, fetch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "field-sites"))
from bake import survey


def read_source(game, world):
    raw = (
        (game / ("atlas-" + world + "-survey.js"))
        .read_text()
        .split('window.ATLAS_SURVEYS["' + world + '"]=', 1)[1]
    )
    survey = json.JSONDecoder().raw_decode(raw)[0]
    return [np.array(v, dtype=float) for v in [survey["shore"], *survey["shoreHoles"]]]


def water_polygon(rings):
    return Polygon(rings[0], rings[1:])


def image_mask(rings, x, z, n, step):
    return (
        rasterize(
            [(water_polygon(rings), 1)],
            out_shape=(n, n),
            transform=Affine(step, 0, x, 0, step, z),
            dtype="uint8",
        )
        > 0
    )


def runs(indices, cyclic):
    if not len(indices):
        return []
    groups = np.split(indices, np.flatnonzero(np.diff(indices) > 1) + 1)
    if len(groups) > 1 and groups[0][0] == 0 and groups[-1][-1] == cyclic - 1:
        groups = [np.r_[groups[-1], groups[0]], *groups[1:-1]]
    return groups


def refine(rings, left, top, size, land):
    offsets = np.arange(-27, 27.01, 0.5)
    changes = []
    evidence = []
    for index, ring in enumerate(rings):
        n = len(ring)
        nextp = np.roll(ring, -1, axis=0)
        inside = np.all(
            (ring > [left + 40, top + 40])
            & (ring < [left + size - 40, top + size - 40]),
            axis=1,
        )
        delta = nextp - ring
        length = np.linalg.norm(delta, axis=1)
        area = np.sum(ring[:, 0] * nextp[:, 1] - ring[:, 1] * nextp[:, 0]) * 0.5
        normals = (
            np.c_[delta[:, 1], -delta[:, 0]]
            / np.maximum(length[:, None], 0.001)
            * np.sign(area)
            * (1 if index == 0 else -1)
        )
        for group in runs(
            np.where(inside & np.roll(inside, -1) & (length > 0.01))[0], n
        ):
            path = []
            directions = []
            for i in group:
                pieces = max(1, int(np.ceil(length[i] / 1.75)))
                for j in range(pieces):
                    f = j / pieces
                    path.append(ring[i] + f * delta[i])
                    if j == 0:
                        blend = normals[i] + normals[(i - 1) % n]
                        directions.append(blend / max(np.linalg.norm(blend), 0.001))
                    else:
                        directions.append(normals[i])
            end = (group[-1] + 1) % n
            path.append(ring[end])
            directions.append(normals[(end - 1) % n])
            path = np.array(path)
            directions = np.array(directions)
            s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))]
            if len(s) < 5:
                continue
            xx = path[:, 0, None] - left - 0.5 + directions[:, 0, None] * offsets
            zz = path[:, 1, None] - top - 0.5 + directions[:, 1, None] * offsets
            values = map_coordinates(
                land, [zz, xx], order=1, prefilter=False, mode="nearest"
            )
            sm = np.c_[np.zeros(len(values)), np.cumsum(values, axis=1)]
            cand = np.arange(9, len(offsets) - 9)
            water = (sm[:, cand - 1] - sm[:, cand - 8]) / 7
            dry = (sm[:, cand + 9] - sm[:, cand + 2]) / 7
            score = dry - water - 0.0065 * abs(offsets[cand])
            best = np.argmax(score, axis=1)
            row = np.arange(len(s))
            off = offsets[cand[best]]
            ok = (
                (dry[row, best] > 0.64)
                & (water[row, best] < 0.44)
                & ((dry - water)[row, best] > 0.41)
            )
            if ok.sum() < 4:
                continue
            conf = np.flatnonzero(ok)
            j = np.searchsorted(s[conf], s)
            gap = np.minimum(
                abs(s - s[conf[np.clip(j, 0, len(conf) - 1)]]),
                abs(s - s[conf[np.clip(j - 1, 0, len(conf) - 1)]]),
            )
            shift = gaussian_filter(
                median_filter(np.interp(s, s[ok], off[ok]), size=5), 1.1
            ) * np.clip(1 - gap / 21, 0, 1)
            # Every open run rejoins its original chart endpoints. Fully enclosed islands
            # also retain one fixed point so replaying a patch can always locate its start.
            shift *= np.minimum(1, np.minimum(s, s[-1] - s) / 14)
            for factor in (1.0, 0.72, 0.48, 0.26, 0):
                xy = approximate_polygon(
                    path + directions * shift[:, None] * factor, tolerance=0.6
                )
                xy = np.rint(xy * 5) / 5
                first = int(group[0])
                rolled = np.roll(ring, -first, axis=0)
                updated = (
                    xy[:-1]
                    if len(group) == n
                    else np.vstack((xy[:-1], rolled[len(group) :]))
                )
                if len(updated) < 3:
                    continue
                if LinearRing(updated).is_simple:
                    break
            else:
                continue
            if len(group) == n:
                updated = xy[:-1]
            changes.append(
                dict(
                    ring=index,
                    start=ring[first].tolist(),
                    end=ring[end].tolist(),
                    closed=len(group) == n,
                    points=(np.rint(xy[1:-1] * 5).astype(int).ravel().tolist()),
                )
            )
            if len(group) == n:
                rings[index] = updated
            else:
                # The active runs use original cyclic positions. Apply their point changes
                # by endpoint identity, so other runs can be processed using the original ring.
                rr = rings[index]
                ia = np.where(np.all(rr == ring[first], axis=1))[0][0]
                ib = np.where(np.all(rr == ring[end], axis=1))[0][0]
                if ia < ib:
                    rings[index] = np.vstack((rr[: ia + 1], xy[1:-1], rr[ib:]))
                else:
                    rings[index] = np.vstack((rr[ib : ia + 1], xy[1:-1]))
            evidence.append(
                [
                    index,
                    len(group),
                    len(xy),
                    round(float(s[-1]), 1),
                    round(float(np.percentile(abs(shift * factor), 95)), 1),
                    round(float(ok.mean()), 3),
                ]
            )
    return changes, evidence


def bake(game, out, destination, report):
    updated = {}
    patches = {}
    details = {}
    siteCoverage = {}
    level = {"moosehead": 312.23, "winnipesaukee": 153.11}
    for name, (w, cx, cz, h) in sites.items():
        y0 = level[w]
        L = 2 * h
        l = cx - h
        t = cz - h
        rings = updated.setdefault(w, read_source(game, w))
        with rasterio.open(out / (name + "-photo.tif")) as f:
            rgb = f.read()
        with rasterio.open(out / (name + "-height.tif")) as f:
            elev = f.read(1)
        sourceWet = image_mask(rings, l, t, L, 1)
        d = distance_transform_edt(sourceWet) - distance_transform_edt(~sourceWet)
        nir = rgb[3].astype("f4")
        blue = rgb[2].astype("f4")
        threshold = float(np.percentile(nir[d > 42], 90) + 7)
        # Sun glint raises all channels. Foliage remains bright specifically in NIR.
        wetness = np.clip((nir - threshold) / 24 + 0.017 * (nir - 0.67 * blue), 0, 1)
        land = gaussian_filter(wetness, 1.2)
        changes, evidence = refine(rings, l, t, L, land)
        patches.setdefault(w, []).extend(changes)
        details[name] = evidence
        # Use the corrected polygon both for the shoreline triangles and the water
        # surface. Half-texel offset here registers centre-sampled DEM coordinates.
        wet = image_mask(rings, l - 1, t - 1, L // 2 + 1, 2.0)
        signed = 2 * (distance_transform_edt(~wet) - distance_transform_edt(wet))
        # 3DEP records the still lake surface, without the submerged bed. Inside its
        # mapped boundary reconstruct an approach to deeper water over local shoals.
        # Outside it, use the laser DTM and a gentle bank only where foliage overhangs
        # the shoreline and the bare-earth survey still gives an open-water height.
        slope = np.clip(
            0.12 + 0.07 * gaussian_filter(np.maximum(elev - y0, 0), 4), 0.1, 0.41
        )
        stand = np.clip(nir / 160, 0, 1)
        edge = np.maximum(0.03, signed * 0.115)
        fill = np.minimum(1.0, edge) * np.exp(-np.maximum(0, signed - 12) / 13)
        dem = np.where(
            wet,
            y0 + 0.16 - np.minimum(15, np.maximum(0.16, -signed * slope)),
            np.maximum(elev, y0 + 0.16 + fill),
        )
        # Match a sub-metre crossing even when the nearest dry lidar vertex is a
        # granite boulder well above the water surface.
        veg = (
            np.asarray(
                Image.fromarray(np.uint8(255 * stand)).resize(
                    (h // 2 + 1, h // 2 + 1), Image.Resampling.BILINEAR
                ),
                dtype="f4",
            )
            / 255
        )
        # East/up/south convention matches atlas-worlds.js. The horizon looks
        # toward the light source. Its ground shadow extends in the other direction.
        azimuth = math.radians(-84 if w == "moosehead" else -112)
        solar = (math.cos(azimuth), math.sin(azimuth))
        f = destination / ("landform-" + name + ".bin")
        survey(
            dem.astype("f4"),
            veg,
            (l, t, cx + h, cz + h),
            200,
            0.22,
            y0 - 24,
            0.02,
            [4, 8, 16, 32, 64, 96, 180],
            solar,
            1.539,
            f,
        )
        # Bank photo is completely registered. Open water is invisible under local
        # water shading and has no baked wakes or boats in the game.
        photo = Image.fromarray(np.moveaxis(rgb[:3], 0, -1))
        photo.save(
            destination / ("landform-" + name + "-aerial.webp"), quality=88, method=5
        )
        siteCoverage[name] = dict(
            areaM2=L * L,
            trueWaterCells=int(wet.sum()),
            newRuns=len(changes),
            refinedMetres=sum(i[3] for i in evidence),
            triangleBytes=f.stat().st_size,
            sourceWest=l,
            sourceNorth=t,
        )
        print(name, siteCoverage[name], flush=True)
    data = json.dumps(patches, separators=(",", ":"))
    (destination / "lake-bay-data.js").write_text(
        "// Local east/south shoreline corrections from USDA NAIP, USGS hydrography and 3DEP.\nwindow.aerieLakeBankRuns="
        + data
        + ";\n"
    )
    if report:
        report.write_text(
            json.dumps(dict(sites=siteCoverage, sections=details), indent=2)
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", required=True, type=Path)
    parser.add_argument(
        "--game", type=Path, default=Path(__file__).resolve().parents[3] / "game"
    )
    parser.add_argument("--output", type=Path)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    destination = args.output or args.game
    destination.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(3) as pool:
        jobs = [
            pool.submit(fetch, args.cache, (name, kind))
            for name in sites
            for kind in ["photo", "height"]
        ]
        for job in jobs:
            job.result()
    bake(args.game, args.cache, destination, args.report)
