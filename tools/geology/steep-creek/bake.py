"""Bake Steep Creek field products from the three registered public surveys.

USGS is topographic lidar, not sonar. Reconstruct a shallow gravel bed under
the inferred reach stage. Above-water banks and raised decks use actual elevations.
"""

from pathlib import Path
import argparse, base64, json
import numpy as np
from scipy import ndimage as nd
from scipy.spatial import Delaunay, cKDTree
from shapely import Polygon, union_all
from shapely.geometry import LineString
from shapely import contains_xy
from PIL import Image
from scipy.signal import savgol_filter


def encode(a):
    return base64.b64encode(a.tobytes()).decode("ascii")


def plain(rows, n=2):
    return np.round(np.asarray(rows, dtype="f8"), n).tolist()


def largest_component(polygon):
    """Retain the contiguous platform when individual returns create detached slivers."""
    if polygon.geom_type == "MultiPolygon":
        return max(polygon.geoms, key=lambda feature: feature.area)
    return polygon


def main(cache, site, out):
    out.mkdir(parents=True, exist_ok=True)
    ground = np.load(cache / "steep-d22-ground.npz")
    l, t, r, b = map(int, ground["bounds"])
    ground = ground["ground"] - 18
    points = np.load(cache / "steep-returns.npz")
    x, z, alt, cl, rank, rgb = (
        points[k] for k in ["x", "z", "alt", "cl", "rank", "rgb"]
    )
    at = lambda a, x, z, ord=1: nd.map_coordinates(
        a, [z - t, x - l], order=ord, mode="nearest"
    )
    shift = float(np.median(at(ground, x[cl == 2], z[cl == 2]) + 18 - alt[cl == 2]))
    alt = alt + shift - 18
    # Cover the separate lower reach between the lake mouth and the surveyed bridge below Glacier Spur Road.
    L, T, R, B = -228, 1748, -13, 2040
    Z, X = np.mgrid[T : B + 1, L : R + 1]
    dem = ground[T - t : B - t + 1, L - l : R - l + 1].copy()
    H, W = dem.shape
    awc = json.loads((site / "awc-10.json").read_text())["features"][0]
    npLine = np.array(awc["geometry"]["paths"][0]) * [1, -1] + [-526511, 6477009]
    line = LineString(npLine)
    sta = np.arange(0, 404, 2.0)
    guide = np.array([list(line.interpolate(float(s)).coords)[0] for s in sta])
    delta = np.gradient(guide, axis=0)
    delta /= np.linalg.norm(delta, axis=1)[:, None]
    normal = delta[:, ::-1] * [-1, 1]
    offs = np.arange(-13, 13.01, 0.5)
    tran = guide[:, None, :] + normal[:, None, :] * offs[None, :, None]
    bedT = at(ground, tran[:, :, 0], tran[:, :, 1])
    # Smooth the thalweg through measured lows along each mapped AWC station. The soft plan penalty prevents jumps to adjacent beaver ponds.
    score = bedT + (0.024 * offs**2 / 5.0)[None, :]
    n = len(offs)
    prev = score[0].copy()
    back = np.empty((len(sta), n), "i")
    back[0] = np.arange(n)
    jumps = (offs[:, None] - offs[None, :]) ** 2 * 0.12
    for k in range(1, len(sta)):
        pen = prev[:, None] + jumps
        back[k] = pen.argmin(0)
        prev = score[k] + pen[back[k], np.arange(n)]
    best = [int(prev.argmin())]
    for k in range(len(sta) - 1, 0, -1):
        best.append(back[k, best[-1]])
    offset = nd.gaussian_filter1d(offs[best[::-1]], 1.35)
    center = guide + normal * offset[:, None]
    valley = np.percentile(bedT, 12, axis=1)
    stage = nd.gaussian_filter1d(valley, 2.0) + 0.27
    wat = cl == 9
    near = cKDTree(np.stack([x[wat], z[wat]], 1))
    sample = []
    for px, pz in center:
        ids = near.query_ball_point([px, pz], 9)
        sample.append(float(np.median(alt[wat][ids])) if len(ids) > 5 else np.nan)
    sample = np.array(sample)
    f = np.isfinite(sample) & (sta < 176)
    stage[f] = np.maximum(0.18, sample[f])
    stage = np.maximum.accumulate(np.maximum(0.18, nd.gaussian_filter1d(stage, 2.0)))
    tr = cKDTree(center)
    dnear, ii = tr.query(np.c_[X.ravel(), Z.ravel()])
    dnear = dnear.reshape(H, W)
    ii = ii.reshape(H, W)
    # Smoothly interpolate the longitudinal waterline between stations instead of creating little steps.
    nearStage = nd.gaussian_filter(stage[ii], 1.1)
    env = np.minimum(8.0, 3.2 + 0.023 * sta)
    env[:84] = np.interp(sta[:84], [0, 58, 95, 126, 169], [11, 12.8, 11.4, 7.8, 4.8])
    limit = env[ii]
    inflow = dnear < limit
    # Post-bank water must be connected to the stream network. A controlled narrow trough spans local canopy interpolation losses.
    inner = np.maximum(0, 1 - (dnear / np.maximum(1.0, limit * 0.43)) ** 2) ** 1.65
    channelBed = np.minimum(
        dem, nearStage - 0.04 - inner * (0.17 + 0.16 * np.sin(ii * 0.12) ** 2)
    )
    dem = np.where(
        inflow,
        np.minimum(
            dem, dem + (channelBed - dem) * np.clip((limit - dnear) / 1.65, 0, 1)
        ),
        dem,
    )
    water = np.where(inflow, nearStage, np.nan)
    # NOAA returns and the official brochure identify the still, impounded water separate from the spawning channel.
    # A component of the hydroflattened floodplain must be supported by 2013 water returns near the true pond.
    wmask = (cl == 9) & (x >= L) & (x <= R) & (z >= T) & (z <= B)
    obs = np.zeros((H, W), "u1")
    obs[np.rint(z[wmask] - T).astype("i"), np.rint(x[wmask] - L).astype("i")] = 1
    waterHit = nd.distance_transform_edt(~obs.astype(bool))
    ponds = []
    for px, pz, rx, rz in [
        (-67, 1881, 32, 27),
        (-155, 1947, 20, 22),
        (-190, 1840, 31, 32),
        (-123, 1823, 17, 26),
    ]:
        loc = ((X - px) / rx) ** 2 + ((Z - pz) / rz) ** 2 < 1.24
        evidence = loc & (waterHit < 4.6)
        ids = np.flatnonzero(
            wmask & (((x - px) / rx) ** 2 + ((z - pz) / rz) ** 2 < 1.0)
        )
        if not len(ids):
            continue
        stageP = float(np.clip(np.percentile(alt[ids], 62), 0.18, 3.0))
        # The pond centres transmit no near-infrared laser returns. Bound that void with the
        # 2013 mapped shore pixels and the 2023 city orthophoto, not the interpolated bare-earth elevation.
        pondEdges = {
            -67: [
                (416, 45),
                (473, 55),
                (519, 74),
                (556, 99),
                (578, 124),
                (588, 155),
                (589, 181),
                (575, 203),
                (545, 219),
                (513, 220),
                (486, 207),
                (459, 201),
                (444, 182),
                (426, 166),
                (415, 150),
                (400, 127),
                (392, 95),
                (401, 62),
            ],
            -155: [
                (139, 376),
                (167, 352),
                (190, 349),
                (215, 359),
                (241, 367),
                (246, 386),
                (243, 409),
                (231, 439),
                (205, 460),
                (177, 463),
                (153, 447),
                (141, 423),
            ],
        }
        footprint = pondEdges.get(px)
        margin = np.zeros_like(loc)
        if footprint:
            outline = Polygon(np.asarray(footprint) / 3.6 + [-210, 1840])
            margin = contains_xy(outline, X, Z)
        # Local depression is required as well as water returns or smooth, hydroflattened mapped water.
        sflat = np.maximum(nd.maximum_filter(dem, 3) - nd.minimum_filter(dem, 3), 0)
        eligible = loc & (dem < stageP + 0.035) & (evidence | (sflat < 0.035))
        lab, count = nd.label(eligible)
        regions = np.unique(lab[evidence & (lab > 0)])
        chosen = np.isin(lab, regions) & eligible
        if footprint:
            chosen |= margin
        if chosen.sum() < 30:
            continue
        water[chosen] = np.fmax(water[chosen], stageP)
        depth = nd.distance_transform_edt(chosen)
        # Lidar supplies the shoreline and water surface. Depth into optically opaque pools is explicitly modeled.
        if footprint:
            estimate = stageP - np.minimum(0.96, 0.025 + 0.116 * depth)
            dem[chosen] = np.minimum(dem[chosen], estimate[chosen])
        else:
            dem[chosen] = np.maximum(
                dem[chosen], stageP - np.minimum(0.96, 0.06 + 0.123 * depth[chosen])
            )
        ponds.append(dict(x=px, z=pz, water=round(stageP, 2), area=int(chosen.sum())))
    depth = np.where(np.isfinite(water), water - dem, -1.0)
    wet = depth > 0.015
    # Draw small marching-squares contours into the wet margin via triangulating the topology directly at runtime.
    _, nearestWet = nd.distance_transform_edt(~np.isfinite(water), return_indices=True)
    grd = water[tuple(nearestWet)]
    maskQ = np.clip(
        np.rint(np.where(np.isfinite(water), depth, -1.0) * 100), -128, 127
    ).astype("i1")
    # Public color on May 2013 returns gives separate gravel, pavement, and park grass. Never duplicate photographed canopy onto the animal's flight floor.
    ok = (
        (rank == 1)
        & (x >= L - 0.1)
        & (x <= R + 0.1)
        & (z >= T - 0.1)
        & (z <= B + 0.1)
        & (rgb.max(1) > 0)
    )
    X1 = np.clip(np.rint(x[ok] - L).astype("i"), 0, W - 1)
    Z1 = np.clip(np.rint(z[ok] - T).astype("i"), 0, H - 1)
    idx = X1 + Z1 * W
    hh = alt[ok] - at(ground, x[ok], z[ok])
    clr = rgb[ok].astype("f")
    classes = cl[ok]

    def raster(use, values):
        den = np.bincount(idx[use], minlength=W * H)
        obs = den.reshape(H, W) > 0
        mean = np.stack(
            [
                np.bincount(idx[use], weights=v[use], minlength=W * H)
                / np.maximum(den, 1)
                for v in values.T
            ],
            axis=1,
        ).reshape(H, W, -1)
        if not obs.any():
            return mean, obs, np.full(obs.shape, 1e3)
        dist, ni = nd.distance_transform_edt(~obs, return_indices=True)
        return mean[tuple(ni)], obs, dist

    low, groundObs, distG = raster(
        (hh < 0.55) & (hh > -0.40) & ~np.isin(classes, [7, 9, 19]), clr
    )
    top, _, _ = raster(np.ones(len(clr), bool), clr)
    first = np.full(W * H, -1.0, "f")
    np.maximum.at(first, idx, np.where(np.isin(classes, [3, 4, 5]), hh, -1))
    first = first.reshape(H, W)
    dark = np.clip((first - 2) / 11, 0, 1)
    moss = np.array([83.0, 93.0, 55.0])
    luma = np.einsum("ijk,k->ij", low, [0.25, 0.56, 0.19])
    soil = (
        np.clip(0.86 + 0.22 * (luma - np.median(luma)) / 52, 0.62, 1.23)[..., None]
        * moss
    )
    forest = np.clip(
        (nd.gaussian_filter(dark, 1.7) + np.clip((distG - 1) / 5, 0, 1)) * 0.93, 0, 1
    )
    col = low * (1 - forest[..., None]) + soil * forest[..., None]
    wetFloor = np.clip((0.47 + depth) * 0.96, 0, 1) * np.isfinite(water)
    cob = (
        np.array([96.0, 92.0, 72.0])
        * (0.83 + 0.28 * np.clip(luma / 160, 0, 1.6))[..., None]
    )
    col = col * (1 - wetFloor[..., None]) + cob * wetFloor[..., None]
    col = np.clip(col, 12, 232).astype("u1")
    # Preserve the local NOAA colour while recovering true material scale below its one-metre pixels.
    # The hydrographic corridor, forest crowns, civic surfacing and footpath select separate photographic scans.
    trail = np.array(json.loads((site / "boardwalk.json").read_text()))
    trailLine = LineString(trail)
    trailLoc = np.array(
        [
            list(trailLine.interpolate(float(k)).coords)[0]
            for k in np.arange(0, trailLine.length, 0.75)
        ]
    )
    distTrail = cKDTree(trailLoc).query(np.c_[X.ravel(), Z.ravel()])[0].reshape(H, W)
    shade = np.mean(low, axis=-1)
    neutral = np.ptp(low, axis=-1) < 29
    canopyNear = nd.gaussian_filter(dark, 2.5)
    civic = (
        (X > -102)
        & (Z > 1751)
        & (Z < 1983)
        & neutral
        & (shade > 95)
        & (canopyNear < 0.31)
    )
    trailT = (
        (distTrail < 3.6)
        & (canopyNear < 0.54)
        & (shade > 77)
        & (np.ptp(low, axis=-1) < 52)
    )
    sed = np.maximum(0, 1 - nd.distance_transform_edt(~wet) / 5.4)
    substrate = np.full((H, W), 7, "u1")
    substrate[canopyNear < 0.28] = 58
    substrate[sed > 0.05] = 126
    substrate[trailT] = 190
    substrate[civic] = 251
    # Short grasses, sedges and broad-leaf forbs are visible at the real viewing
    # deck. Map where a summer understory is supported: green low returns,
    # classified low stems and damp, vegetated bank edges. Keep gravel and
    # managed openings. Species and individual plant locations are inferred.
    low_green = (low[:, :, 1] - 0.65 * low[:, :, 0] - 0.35 * low[:, :, 2]) / np.maximum(
        35, low.mean(2)
    )
    understory = np.clip((nd.gaussian_filter(low_green, 0.85) - 0.018) * 1.9, 0, 0.83)
    low_stems = nd.gaussian_filter(((first > 0.24) & (first < 2.7)).astype("f"), 1.55)
    edge_grass = np.exp(-nd.distance_transform_edt(~wet) / 9) * np.clip(
        (low_green - 0.04) * 2.6, 0, 0.67
    )
    understory = np.maximum.reduce([understory, low_stems * 0.97, edge_grass])
    understory *= 1.0 - 0.42 * np.clip(
        (nd.gaussian_filter(np.maximum(first, 0), 1.7) - 10) / 9, 0, 1
    )
    understory[wet | civic | trailT] = 0
    # Four habitat-density classes fit in two bits per square metre.
    herbs = np.digitize(understory, [0.095, 0.23, 0.43]).astype("u1")
    packed_herbs = herbs.reshape(-1, 4)
    packed_herbs = (
        packed_herbs[:, 0]
        | packed_herbs[:, 1] << 2
        | packed_herbs[:, 2] << 4
        | packed_herbs[:, 3] << 6
    )
    col = np.dstack([col, substrate])
    Image.fromarray(col).resize((W * 2, H * 2), Image.Resampling.BICUBIC).save(
        out / "alaska-steep-habitat.webp",
        quality=91,
        alpha_quality=100,
        exact=True,
        method=6,
    )
    # The grain-size distribution is inferred; put low, irregular cobbles along the mapped wet/dry interface.
    # Keep their upper facets above the bed, including the salmon holding areas where the creek is shallow.
    gravel = []
    rng = np.random.default_rng(2274)
    bins = np.column_stack(
        np.where(
            (sed > 0.29) & (depth < 0.61) & (substrate == 126) & (canopyNear < 0.52)
        )
    )
    for j, i in bins:
        if rng.random() > 0.22:
            continue
        rx = float(rng.lognormal(-2.24, 0.61))
        rx = min(0.35, max(0.035, rx))
        rz = rx * rng.uniform(0.55, 1.15)
        gravel.append(
            [
                round(float(X[j, i] + rng.uniform(-0.43, 0.43)), 2),
                round(float(Z[j, i] + rng.uniform(-0.43, 0.43)), 2),
                round(rx, 3),
                round(float(rz), 3),
                round(float(rx * rng.uniform(0.22, 0.58)), 3),
                int(rng.integers(255)),
            ]
        )
    # A one-metre first-return canopy supports low mounds as well as the tallest crown per stand.
    # Smooth over sampling voids inside each crown, never over the car park or a wet opening.
    # Locate crown peaks exclusively on vegetation-classed NOAA returns. Original classifications separate dry understory from decks.
    topH = nd.gaussian_filter(np.maximum(first, 0), 1.05)
    nearMax = nd.maximum_filter(topH, 5)
    pot = (topH >= nearMax - 0.00001) & (topH > 2.15) & (~wet)
    crowns = []
    for j, i in zip(*np.where(pot)):
        if min(j, i, H - 1 - j, W - 1 - i) < 5:
            continue
        ch = float(np.max(first[max(0, j - 2) : j + 3, max(0, i - 2) : i + 3]))
        rad = min(14, max(3, int(ch * 0.78)))
        sub = topH[max(0, j - rad) : j + rad + 1, max(0, i - rad) : i + rad + 1]
        sx = np.zeros(20)
        sx[:] = rad
        # Edge of the crown in radial transects, with a gap threshold to avoid bridging to neighbours.
        for v in range(20):
            ang = v * (2 * np.pi / 20)
            radial = np.arange(1, rad + 1)
            jy = np.clip(j + np.rint(np.sin(ang) * radial).astype("i"), 0, H - 1)
            ix = np.clip(i + np.rint(np.cos(ang) * radial).astype("i"), 0, W - 1)
            broken = topH[jy, ix] < max(1.32, 0.32 * ch)
            cut = np.flatnonzero(broken[:-1] & broken[1:])
            if len(cut):
                sx[v] = float(cut[0] + 1)
        width = np.clip(
            np.sqrt(np.mean(sx * sx)) * 1.80, max(2.0, ch * 0.21), min(17.0, ch * 1.33)
        )
        if ch < 2.4 or ch > 47:
            continue
        mult = top[j, i]
        shrub = (
            ch < 7.5
            or (ch < 15 and width / ch > 0.68)
            or (width / ch > 0.69 and mult[1] > 1.13 * mult[0])
        )
        crowns.append(
            [int(i + L), int(j + T), int(round(width * 2)) * 128 + int(round(ch * 2))]
        )
        crowns[-1][-1] *= -1 if shrub else 1
    # Positions and stature of shrubs are separately supported by low vegetation returns.
    # Aggregate three-metre cells in clearings with actual woody returns; peaks under tall foliage stay intact.
    brush = []
    for j in range(3, H - 3, 3):
        for i in range(3, W - 3, 3):
            if wet[j, i]:
                continue
            sub = first[j - 1 : j + 2, i - 1 : i + 2]
            obs = sub[(sub > 0.44) & (sub < 3.75)]
            if len(obs) < 3:
                continue
            hh = float(np.percentile(obs, 78))
            count = int(len(obs))
            span = np.clip(np.sqrt(count) * 1.25, 1.5, 4.6)
            if groundObs[j, i] and np.min(low[j, i]) > 113 and np.ptp(low[j, i]) < 21:
                continue
            brush.append(
                [
                    i + L,
                    j + T,
                    round(hh, 1),
                    round(float(span), 1),
                    int((i * 19 + j * 97) % 127),
                ]
            )
    # Isolate actual classified above-ground boardwalk surfaces and rails. The platform groups and their separate upstream crossings remain distinct.
    pts = np.c_[x[cl == 13], z[cl == 13]]
    e = alt[cl == 13]
    from scipy.ndimage import label, binary_dilation

    px = 0.30
    ix = np.rint((pts[:, 0] - L) / px).astype("i")
    iz = np.rint((pts[:, 1] - T) / px).astype("i")
    sx = int((R - L) / px) + 2
    sz = int((B - T) / px) + 2
    inside = (ix >= 0) & (ix < sx) & (iz >= 0) & (iz < sz)
    pts = pts[inside]
    e = e[inside]
    ix = ix[inside]
    iz = iz[inside]
    mask = np.zeros((sz, sx), bool)
    mask[iz, ix] = 1
    lab, _ = label(binary_dilation(mask, iterations=4))
    ids = lab[iz, ix]
    decks = []

    def extracted(points):
        simplices = Delaunay(points).simplices
        a, b, c = (
            points[simplices[:, 0]],
            points[simplices[:, 1]],
            points[simplices[:, 2]],
        )
        edges = np.maximum.reduce(
            [
                np.linalg.norm(a - b, axis=1),
                np.linalg.norm(a - c, axis=1),
                np.linalg.norm(b - c, axis=1),
            ]
        )
        poly = union_all([Polygon(v) for v in points[simplices[edges < 3.2]]])
        # Grain-level gaps in the horizontal sampling should not become holes in a solid walkway.
        poly = largest_component(poly.buffer(0.38, join_style="round")).buffer(
            -0.30, join_style="round"
        )
        return Polygon(largest_component(poly).exterior).simplify(
            0.27, preserve_topology=True
        )

    for k in np.unique(ids):
        sel = ids == k
        p = pts[sel]
        y = e[sel]
        if len(p) < 90 or np.max(p[:, 1]) < 1860:
            continue
        hist, edges = np.histogram(y, bins=np.arange(1.3, 7.6, 0.06))
        level = float(np.median(y[np.abs(y - (edges[np.argmax(hist)] + 0.03)) < 0.16]))
        slice = np.abs(y - level) < 0.22
        subset = p[slice]
        if len(subset) < 45:
            continue
        poly = extracted(subset)
        outline = np.asarray(poly.exterior.coords)[:-1]
        if poly.area < 5.0:
            continue
        rail = (
            float(np.percentile(y[np.abs(y - level) > 0.65], 70) - level)
            if np.sum(np.abs(y - level) > 0.65) > 8
            else 1.06
        )
        # Gate ends are where the measured deck meets its approach. Only attach railing to exposed edges.
        decks.append(
            dict(
                level=round(level, 2),
                rail=round(np.clip(rail, 0.85, 1.13), 2),
                outline=plain(outline),
                points=int(sel.sum()),
                deckPoints=int(slice.sum()),
                width=float(round(poly.area, 1)),
            )
        )
    # The slim classified return line from the north boardwalk to the lot is a
    # measured one-sided guard. Its top climbs smoothly at 3–4 percent while the
    # east, paved side follows the dry grade. The creek side drops below its rail.
    ramp = []
    for zz in np.arange(1914.0, 1944.1, 2.0):
        sel = (cl == 13) & (abs(z - zz) < 1.16) & (x > -100) & (x < -77)
        if sel.sum() < 2:
            continue
        railTop = float(np.percentile(alt[sel], 71))
        xx = float(np.median(x[sel]))
        ramp.append([xx, zz, railTop - 1.08])
    ramp = np.array(ramp)
    ramp[:, 2] = (
        np.linspace(2.68, 3.94, len(ramp))
        if len(ramp) < 5
        else np.maximum.accumulate(savgol_filter(ramp[:, 2], 5, 2))
    )
    ramp[0, 2] = 2.67
    ramp[-1, 2] = 3.94
    # Positions of the discrete, stationary vehicles in the return classification. Use for measured parking openings.
    cars = []
    candidate = (cl == 19) & (x > -96) & (x < 24) & (z > 1862) & (z < 1983)
    cc = np.c_[x[candidate], z[candidate]]
    if len(cc):
        ci = np.rint((cc[:, 0] - L) * 2).astype("i")
        cj = np.rint((cc[:, 1] - T) * 2).astype("i")
        cm = np.zeros((H * 2, W * 2), bool)
        valid = (ci >= 0) & (ci < cm.shape[1]) & (cj >= 0) & (cj < cm.shape[0])
        ci, cj, cc = ci[valid], cj[valid], cc[valid]
        cm[cj, ci] = 1
        labels, _ = nd.label(nd.binary_dilation(cm, iterations=1))
        ids = labels[cj, ci]
        for key in np.unique(ids):
            pts = cc[ids == key]
            if len(pts) < 12:
                continue
            cen = pts.mean(0)
            values, axes = np.linalg.eigh(np.cov(pts.T))
            ax = axes[:, -1]
            proj = (pts - cen) @ axes
            size = np.ptp(proj, axis=0)
            if 2.2 < size[1] < 6.3 and 0.75 < size[0] < 2.9:
                cars.append(
                    [
                        *plain(cen),
                        round(float(np.arctan2(ax[1], ax[0])), 3),
                        round(float(size[1]), 2),
                    ]
                )
    # Choose a naturally broad holding pocket near the platform in a measured, connected part of the stream.
    fish = []
    for loc in [(-128, 1884), (-105, 1951), (-153, 1857)]:
        d = np.hypot(X - loc[0], Z - loc[1])
        interior = nd.distance_transform_edt(wet)
        score = np.where(
            (d < 18) & (depth > 0.11), np.minimum(5, interior) - d * 0.10, -100
        )
        ii, jj = np.unravel_index(score.argmax(), score.shape)
        fish.append([int(X[ii, jj]), int(Z[ii, jj])])
    data = dict(
        rect=[L, T, R, B],
        dem=encode(np.rint(dem * 100).astype("<i2")),
        surface=encode(np.rint(grd * 100).astype("<i2")),
        depth=encode(maskQ),
        trees=crowns,
        brush=brush,
        gravel=gravel,
        herbs=encode(packed_herbs),
        openGround=encode(np.packbits(civic | trailT, axis=None, bitorder="little")),
        paving=encode(np.packbits(civic, axis=None, bitorder="little")),
        decks=decks,
        ramp=plain(ramp),
        cars=cars,
        stations=plain(center[::4], 1),
        fish=fish,
    )
    (out / "alaska-steep-survey.js").write_text(
        "window.aerieSteepCreekSurvey="
        + json.dumps(data, separators=(",", ":"))
        + ";\n"
    )
    print(
        "rect",
        data["rect"],
        "ground cells",
        int(X.size),
        "measured crowns",
        len(crowns),
        "ground thickets",
        len(brush),
        "wet area",
        int(wet.sum()),
        "structures",
        [(d["width"], d["level"], d["points"]) for d in decks],
        "cars",
        len(cars),
        "fish",
        fish,
        "ponds",
        ponds,
        flush=True,
    )
    np.savez_compressed(
        cache / "steep-design.npz",
        dem=dem,
        depth=depth,
        stage=grd,
        target=center,
        stations=sta,
        crowns=crowns,
        rect=[L, T, R, B],
        ponds=np.array([[p["x"], p["z"], p["water"], p["area"]] for p in ponds]),
    )


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cache", type=Path)
    ap.add_argument("site", type=Path)
    ap.add_argument("out", type=Path)
    a = ap.parse_args()
    main(a.cache, a.site, a.out)
