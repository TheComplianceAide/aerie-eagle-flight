"""Build Aerie's measured Nugget Falls terrain, optical material and canopy field.

Run after fetch_surface.py, fetch_canopy.py and fetch_entwine.py. The inputs
also include the registered AOI's Sentinel-2 bands 3, 4, 8 (10 m), the regional
aerial mosaic and the existing waterfall flow line in world east/south metres.
"""

import argparse, json, struct
from pathlib import Path
import numpy as np
from pydelatin import Delatin
from scipy.ndimage import (
    gaussian_filter as blur,
    map_coordinates,
    maximum_filter,
    uniform_filter,
    distance_transform_edt,
)
from PIL import Image

LOCAL = (160, -272, 1520, 1456)


def ramp(low, high, v):
    k = np.clip((v - low) / (high - low), 0, 1)
    return k * k * (3 - 2 * k)


def smooth_observed(a, valid, sigma):
    den = blur(valid.astype("f"), sigma)
    return blur(np.where(valid, a, 0).astype("f"), sigma) / np.maximum(den, 0.007), den


def bake(cache, sentinel, game):
    lidar = [
        np.load(cache / f"nugget-{year}-return-grids.npz") for year in (2012, 2013)
    ]
    tile = np.load(cache / "nugget-d22-ground.npz")
    left, top, right, bottom = LOCAL
    sl, st, _, _ = tile["bounds"]
    win = (slice(top - st, bottom - st + 1), slice(left - sl, right - sl + 1))
    land = tile["ground"][win].astype("f") - 18
    assert np.isfinite(land).all()
    zz, xx = np.mgrid[top : bottom + 1, left : right + 1].astype("f")

    def bands(id):
        img = np.load(sentinel / f"b{id}.npy", mmap_mode="r")
        return map_coordinates(
            img,
            [(zz + 18000) / 10 - 0.5, (xx + 18000) / 10 - 0.5],
            order=1,
            mode="nearest",
        ).astype("f")

    r, g, b, nir = [bands(n) for n in (4, 3, 2, 8)]
    ndvi = (nir - r) / np.maximum(nir + r, 1)
    # Local canopy heights are first-surface minus classified ground. Smooth
    # within each source, with a gradual edge between the two acquisitions.
    measured = np.zeros_like(land)
    height = measured.copy()
    power = measured.copy()
    for ds in lidar:
        first = ds["height"][win].astype("f")
        valid = np.isfinite(first) & (ds["groundDistance"][win] < 11)
        first = np.where(valid, first, 0)
        values, count = smooth_observed(first, valid, 1.0)
        maxh = maximum_filter(first, size=3)
        crowns = 0.75 * values + 0.25 * maxh
        brightness, _ = smooth_observed(ds["intensity"][win], valid, 0.72)
        # Different sensors' return intensities are not comparable in absolute
        # units. Their locally centered logarithmic contrast is comparable.
        radiance = np.log1p(brightness)
        detail = radiance - blur(radiance, 8)
        f = ramp(0.035, 0.38, blur(count, 2))
        data = measured < 0.005
        take = np.where(data, (f > 0.01).astype("f"), f)
        height = height * (1 - take) + crowns * take
        power = power * (1 - take) + np.clip(detail, -0.92, 0.92) * take
        measured = np.maximum(measured, f)
    # The dated colorized lidar resolves both sides of the lower cataract.
    # Outside its footprint wet_channel.py preserves the existing world route.
    stations = json.loads((cache / "nugget-wet-channel.json").read_text())["stations"]
    course = [point[:2] for point in stations]
    waterdist = np.full_like(land, 1e5)
    bed = land.copy()
    thals = []
    for x, z in course:
        thals.append(
            min(
                thals[-1] if thals else 1e5,
                max(-0.38, land[round(z - top), round(x - left)] - 0.72),
            )
        )
    for i, ((x0, z0), (x1, z1)) in enumerate(zip(course, course[1:])):
        dx, dz = x1 - x0, z1 - z0
        f = np.clip(((xx - x0) * dx + (zz - z0) * dz) / (dx * dx + dz * dz), 0, 1)
        dd = np.hypot(xx - x0 - f * dx, zz - z0 - f * dz)
        bed = np.where(dd < waterdist, thals[i] + f * (thals[i + 1] - thals[i]), bed)
        waterdist = np.minimum(waterdist, dd)
    dem = land - (
        land - np.minimum(land, bed + np.maximum(0, waterdist - 5) * 0.18)
    ) * (1 - ramp(7, 21, waterdist))
    # Submerged hydroflat cells are water-surface elevations from the survey.
    # Ease the terrain change through the measured shallow foreshore so it
    # meets the game lake level without a discontinuous half-metre lip.
    hydroflat = (1 - ramp(0.06, 0.57, land)) * ramp(30, 43, waterdist)
    dem -= hydroflat * np.maximum(0, dem + 0.46)
    dem = blur(dem, 0.35)
    dz, dx = np.gradient(blur(dem, 0.75))
    slope = np.hypot(dx, dz)
    # Recent open-water elevations and the exact drainage trace take
    # precedence over 2012–2013 shoreline returns.
    hydro = ramp(0.45, 2.9, land) * ramp(7.5, 14, waterdist)
    # Reject isolated first returns grazing through a sheer, unvegetated wall.
    consistency = ramp(0.6, 2.6, blur(height, 2))
    shrubs = ramp(0.85, 3.2, height) * consistency * hydro
    canopy = ramp(3.5, 12, height) * hydro
    optical = ramp(0.31, 0.68, ndvi) * ramp(300, 835, nir)
    # A slanted rock slab can return an apparent height where the scan was
    # oblique. Exclude low returns on steep facets without optical vegetation.
    stableRoots = 1 - ramp(0.68, 1.5, slope) * (1 - ramp(0.35, 0.68, ndvi)) * (
        1 - ramp(6, 16, height)
    )
    measuredPlant = np.maximum(shrubs * 0.85, canopy) * stableRoots
    forest = measuredPlant * measured + optical * (1 - measured) * hydro
    # Surface color uses registered Sentinel (not a randomly repeated alpine
    # wall). For exposed rock, observed D22 facet/curvature and contiguous
    # mineral-lidar reflectance supply the missing sub-Sentinel spatial scale.
    rgb = np.clip(np.stack([r, g, b], axis=-1) / 3400, 0, 1) ** 0.60
    yg, xg = np.gradient(blur(dem, 0.9))
    nn = np.sqrt(1 + xg * xg + yg * yg)
    leftSky = (0.30 * xg - 0.50 * yg + 0.79) / nn
    highpass = leftSky - blur(leftSky, 4)
    ridges = leftSky - blur(leftSky, 20)
    convex = dem - blur(dem, 2.7)
    concave = dem - blur(dem, 11)
    relief = np.clip(
        0.18 * highpass + 0.29 * ridges + 0.065 * convex + 0.018 * concave, -0.37, 0.29
    )
    rockLight = np.clip(
        0.43 + 0.26 * (rgb.mean(2) - 0.44) + 0.70 * relief + 0.17 * power, 0.145, 0.74
    )
    rock = np.stack([rockLight * 1.029, rockLight * 1.013, rockLight * 0.977], axis=-1)
    # Color and crown self-shading follow measured height, shape and edges.
    coverSky = np.clip((height - blur(height, 6)) / 8, -1, 1)
    tall = ramp(9, 23, height)
    green = (
        np.array([0.245, 0.314, 0.184])[None, None, :] * (1 - tall[..., None])
        + np.array([0.125, 0.213, 0.177])[None, None, :] * tall[..., None]
    )
    green *= np.clip(
        0.96 + 0.32 * coverSky + 0.19 * power + 0.38 * (rgb.mean(2) - 0.39), 0.49, 1.43
    )[..., None]
    field = rock * (1 - forest[..., None]) + green * forest[..., None]
    dryFan = (
        ramp(-0.12, 1.15, land)
        * (1 - ramp(3.2, 8.0, land))
        * (1 - ramp(0.20, 0.74, slope))
    )
    # The sandbar is resolved by the measured relief and a fine sediment
    # material. The water and the active channel have their own render mesh.
    gravel = np.stack(
        [0.48 + 0.047 * power, 0.444 + 0.042 * power, 0.37 + 0.036 * power], axis=-1
    )
    field = field * (1 - dryFan[..., None]) + gravel * dryFan[..., None]
    # The 2013 LAS retains the orthomosaic RGB at each first return. Only
    # short, supported holes between returns are filled. Preserve forest
    # margins, fractured stone and deposits in geographic coordinates.
    laserPhoto = np.load(cache / "nugget-2013-color.npz")
    observed = laserPhoto["count"][win] > 0
    pixels = laserPhoto["rgb"][:, win[0], win[1]].transpose(1, 2, 0)
    gap, nearest = distance_transform_edt(~observed, return_indices=True)
    trueRGB = pixels[tuple(nearest)].astype("f") / 255
    strength = (1 - ramp(1.4, 5.1, gap)) * ramp(
        0.06, 0.42, blur(observed.astype("f"), 2.2)
    )
    measure = float(np.sum(strength > 0.5))
    # Never bake historical whitewater onto the modern bed. Use a scoured
    # mineral surface there; leave visible water and its movement to the mesh.
    wetInfo = json.loads((cache / "nugget-wet-channel.json").read_text())
    wl, wt, wr, wb = wetInfo["bounds"]
    wetMask = np.zeros_like(land)
    wc = np.asarray(Image.open(game / "alaska-nugget-current.webp")).astype("f") / 255
    wetMask[wt - top : wb - top, wl - left : wr - left] = wc[:, :, 0] * wc[:, :, 1]
    sourceLuma = trueRGB @ np.array([0.25, 0.61, 0.14], dtype="f")
    white = ramp(0.58, 0.78, sourceLuma) * (
        1 - ramp(0.031, 0.11, abs(trueRGB[:, :, 0] - trueRGB[:, :, 2]))
    )
    removeWater = np.maximum(wetMask, white * (1 - ramp(1.0, 35.0, waterdist)))
    drySample = strength * (1 - removeWater)
    # Restore features in the original mosaic's shadow, leaving the
    # directional relief and moving sunlight to the world renderer.
    localMean, den = smooth_observed(sourceLuma, drySample > 0.18, 12)
    corrected = np.clip((0.037 + sourceLuma) / (0.12 + 0.76 * localMean), 0.55, 1.39)
    castFill = (1 - ramp(0.11, 0.43, sourceLuma)) * 0.088
    real = trueRGB + castFill[..., None]
    # Low alpine brush and moss cover many slabs without producing treetop
    # returns. Preserve that optical cover where the photographed greens and
    # Sentinel near-infrared both distinguish it from bare gray stone.
    excessGreen = trueRGB[:, :, 1] - 0.58 * trueRGB[:, :, 0] - 0.42 * trueRGB[:, :, 2]
    lowCover = ramp(0.014, 0.068, excessGreen) * (0.54 + 0.46 * optical) * hydro
    forest = np.maximum(forest, lowCover * drySample)
    sourceGrey = real @ np.array([0.25, 0.61, 0.14], dtype="f")
    # Keep the measured relative brightness of dark/pale bands; aggressively
    # normalizing the exposure would turn the south-bank slabs into chalk.
    bare = np.clip(0.037 + 0.93 * sourceGrey, 0.095, 0.80) * np.clip(
        0.93 + 0.14 * (corrected - 0.97) + 0.18 * relief, 0.77, 1.085
    )
    hue = np.clip(real - sourceGrey[..., None], -0.12, 0.12)
    rockPhoto = bare[..., None] * np.array([1.012, 1.00, 0.987], dtype="f") + hue * 0.82
    grove = (
        real
        * np.array([0.95, 0.985, 0.93], dtype="f")
        * (0.90 + 0.14 * corrected)[..., None]
    )
    place = rockPhoto * (1 - forest[..., None]) + grove * forest[..., None]
    place = (
        place * (1 - dryFan[..., None])
        + np.clip(real * 0.94 + 0.027, 0, 1) * dryFan[..., None]
    )
    field = field * (1 - 0.90 * drySample[..., None]) + place * (
        0.90 * drySample[..., None]
    )
    # Beneath the live cascade the bed is dark wet rock. The adjacent
    # polished gray shelves stay dry wherever the photograph records them.
    field = field * (1 - 0.74 * (strength * removeWater)[..., None]) + np.array(
        [0.222, 0.251, 0.236], dtype="f"
    ) * (0.74 * (strength * removeWater)[..., None])
    feature = np.maximum((measured * 0.75 + 0.25), strength) * ramp(-1.4, 0.40, land)
    color = rgb * (1 - feature[..., None]) + field * feature[..., None]
    # Confidence in understory is encoded in alpha. Keep a nonzero floor so
    # WebP transparent-pixel dropping cannot damage dry bedrock RGB.
    image = np.uint8(
        np.clip(np.dstack([color, 0.25 + 0.75 * forest]), 0, 1) * 255 + 0.5
    )
    Image.fromarray(image).save(
        game / "landform-alaska-aerial.webp", quality=92, alpha_quality=88, method=6
    )
    # A topographic laser cannot see through the opaque glacier-fed lake.
    # Infer an optical depth from the surveyed exposed gravel margin. Give
    # the receiving water its actual photographed land tone near that edge.
    l, t, r, b = (348, 532, 636, 1012)
    shoreCut = np.s_[t-top:b-top+1, l-left:r-left+1]
    beachDEM = dem[shoreCut]
    dry = beachDEM >= 0.18
    shoreDistance, indices = distance_transform_edt(~dry, return_indices=True)
    gravelPhoto = color[shoreCut]
    fineTone = (gravelPhoto @ np.array([0.25, 0.59, 0.16], dtype="f"))[tuple(indices)]
    fineTone = blur(fineTone, 1.5)
    opticalDepth = np.clip(np.minimum(np.maximum(0, 0.18 - beachDEM), 0.087 * shoreDistance) + 0.018 * shoreDistance, 0, 4)
    # The old regional shoreline polygon predates this outwash surface.
    # Match the lake shader's signed distance convention on both sides.
    signedDistance = np.clip(shoreDistance - distance_transform_edt(dry), -56, 56)
    signedCode = .5 + .5 * np.sign(signedDistance) * np.sqrt(np.abs(signedDistance) / 56)
    shoal = np.stack([fineTone, opticalDepth / 4, signedCode], axis=2)
    Image.fromarray(np.uint8(np.clip(shoal*255+0.5,0,255))).save(game / "alaska-nugget-shoal.webp", lossless=True, method=6)
    # Extract local maxima across physically plausible crown widths. The same
    # treetop cannot be reintroduced by another scale in a dense stand.
    canopySurface = blur(height, 1.15)
    candidates = []
    for lo, hi, width in [(3.1, 8.8, 9), (8.8, 17, 11), (17, 26, 13), (26, 58, 15)]:
        peaks = (
            (canopySurface == maximum_filter(canopySurface, size=width))
            & (canopySurface >= lo)
            & (canopySurface < hi)
        )
        peaks &= (
            (hydro > 0.94) & (measured > 0.8) & (slope < 2.65) & (stableRoots > 0.68)
        )
        for j, i in zip(*np.where(peaks)):
            local = height[max(0, j - 4) : j + 5, max(0, i - 4) : i + 5]
            h = float(np.percentile(local, 90))
            if h < 3.5:
                continue
            # Inspect the shoulder around the top in eight directions. The
            # first drop below two-thirds of its top estimates crown diameter.
            radius = []
            for angle in np.arange(8) * np.pi / 4:
                for m in range(2, 15):
                    iz = int(
                        np.clip(round(j + m * np.sin(angle)), 0, height.shape[0] - 1)
                    )
                    ix = int(
                        np.clip(round(i + m * np.cos(angle)), 0, height.shape[1] - 1)
                    )
                    if height[iz, ix] < 0.63 * h:
                        break
                radius.append(m)
            width = float(
                np.clip(
                    2 * np.quantile(radius, 0.40),
                    max(2.8, 0.19 * h),
                    min(20.0, 2.1 * h),
                )
            )
            candidates.append([i + left, j + top, h, width])
    candidates.sort(key=lambda a: -a[2])
    occupied = {}
    roots = []
    for x, z, h, w in candidates:
        cell = (x // 20, z // 20)
        adjacent = [
            tr
            for u in range(cell[0] - 1, cell[0] + 2)
            for v in range(cell[1] - 1, cell[1] + 2)
            for tr in occupied.get((u, v), ())
        ]
        if any(
            (x - u) ** 2 + (z - v) ** 2 < (0.33 * (w + diam)) ** 2
            for u, v, diam in adjacent
        ):
            continue
        occupied.setdefault(cell, []).append((x, z, w))
        packed = round(h * 2) + 128 * round(w * 2)
        roots.append((x, z, -packed if h < 9 else packed))
    # Geometry follows the new original-resolution survey. One metre DEM
    # samples are simplified to a bounded metric error in independent sectors.
    step = 4
    source = dem[::step, ::step]
    nz, nx = source.shape
    assert source.shape == ((bottom - top) // 4 + 1, (right - left) // 4 + 1)
    datum = float(np.floor(dem.min()))
    scale = float(max(1 / 48, (dem.max() - datum + 1) / 30000))
    grid = np.rint((source - datum) / scale).astype("<i2")
    zj, xi = np.indices(source.shape)

    def horizon(sx, sz):
        high = np.zeros_like(source)
        for m in [4, 8, 18, 28, 44, 70, 103, 159, 235, 357, 530, 768]:
            iz = np.clip(zj + round(sz * m / step), 0, nz - 1)
            ix = np.clip(xi + round(sx * m / step), 0, nx - 1)
            high = np.maximum(high, (source[iz, ix] - source) / m)
        return np.arctan(high)

    sky = 1 - np.mean(
        [np.sin(horizon(np.cos(a), np.sin(a))) for a in np.arange(8) * np.pi / 4],
        axis=0,
    )
    az = np.radians(-132.1)
    flux = np.stack(
        [
            sky,
            horizon(np.cos(az), np.sin(az)) / 1.539,
            forest[::4, ::4],
            np.ones_like(sky),
        ],
        axis=-1,
    )
    sections = []
    for l in range(left, right, 248):
        for t in range(top, bottom, 248):
            ri = min(right, l + 248)
            bo = min(bottom, t + 248)
            sec = dem[t - top : bo - top + 1, l - left : ri - left + 1]
            if sec.max() < 0.11:
                continue
            # The half-metre source is retained at 1 m sample spacing. Select
            # more vertices at the fractured abutment of the observed falls.
            central = t < 880 and bo > 535 and l < 860 and ri > 430
            nearApproach = l < 910 and ri > 375 and t < 1260 and bo > 390
            mesh = Delatin(
                sec, max_error=0.34 if central else 0.82 if nearApproach else 1.58
            )
            pts = mesh.vertices.astype("i4")
            ix = pts[:, 0]
            iz = sec.shape[0] - 1 - pts[:, 1]
            x = ix + l - left
            z = iz + t - top
            geom = np.stack(
                [x, z, np.rint((sec[iz, ix] - datum) / scale)], axis=1
            ).astype("<u2")
            light = np.clip(
                np.stack(
                    [
                        map_coordinates(
                            flux[:, :, k], [z / step, x / step], order=1, mode="nearest"
                        )
                        for k in range(4)
                    ],
                    axis=1,
                )
                * 255
                + 0.5,
                0,
                255,
            ).astype("u1")
            faces = mesh.triangles.astype("<u2")
            a, b, c = geom[faces[0], :2].astype("i4")
            if np.linalg.det(np.array([b - a, c - a])) > 0:
                faces = faces[:, ::-1].copy()
            sections.append((geom, light, faces))
    out = bytearray(
        struct.pack(
            "<4sHH4iHHffI",
            b"ARF1",
            1,
            step,
            *LOCAL,
            nx,
            nz,
            datum,
            scale,
            len(sections),
        )
    )
    out += grid.tobytes()
    for points, vlight, indices in sections:
        out += (
            struct.pack("<II", len(points), len(indices))
            + points.tobytes()
            + vlight.tobytes()
            + indices.tobytes()
        )
    out += struct.pack("<II", 0x31525446, len(roots)) + np.array(roots, "<i2").tobytes()
    coverage = uniform_filter(measured, 16)[8::16, 8::16] > 0.50
    rows, cols = coverage.shape
    out += (
        struct.pack("<4sHHH", b"CBJ1", 16, cols, rows)
        + np.packbits(coverage.ravel(), bitorder="little").tobytes()
    )
    out += struct.pack("<4sH", b"FLW1", len(stations))
    for x, z, w in stations:
        out += struct.pack("<hhh", x, round(z * 10), round(w * 10))
    (game / "landform-alaska.bin").write_bytes(out)
    stats = dict(
        bounds=LOCAL,
        originalDemMetres=0.5,
        collisionSampleM=step,
        materialSamples=list(image.shape[:2][::-1]),
        triangles=sum(len(i) for _, _, i in sections),
        crownTops=len(roots),
        lowBroadCrownTops=sum(h < 0 for _, _, h in roots),
        treeHeightPercentiles=[
            round(float(n), 1)
            for n in np.percentile(
                [abs(s) % 128 / 2 for _, _, s in roots], [10, 50, 90, 99]
            )
        ],
        areaWithCanopyLidarInSquareMetres=int(np.sum(measured > 0.50)),
        colorCoverageSquareMetres=int(measure),
        watercourseStations=len(stations),
        noData=int(np.sum(~np.isfinite(land))),
        bytes=len(out),
    )
    (cache / "nugget-field-receipt.json").write_text(json.dumps(stats, indent=2) + "\n")
    print(stats)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    for key in ["cache", "sentinel", "game"]:
        p.add_argument(key, type=Path)
    ar = p.parse_args()
    bake(ar.cache, ar.sentinel, ar.game)
