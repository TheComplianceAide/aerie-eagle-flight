"""Calibrate the public-domain Yosemite Historic Photo Collection plate RL_00603.

The photographed south face and northwest visor of Half Dome preserve visible
joint patterns. Nearest ray depth rejects projection behind the mountain.
"""

import argparse, json, hashlib, tempfile, subprocess, ctypes
from pathlib import Path
from io import BytesIO
import requests, numpy as np
from scipy.ndimage import map_coordinates, gaussian_filter
from scipy.optimize import least_squares
from PIL import Image, ImageDraw
from register import read_grid, matrix

ID = "9f6b5a3917f4484ba494a6bc548352a6"
URL = "https://npgallery.nps.gov/YOSE/GetAsset/" + ID + "/compressed.jpg"
MARKS = np.array(
    [
        (207, 137),
        (211, 133),
        (217, 136),
        (226, 136),
        (239, 134),
        (256, 130),
        (272, 127),
        (282, 126),
        (299, 127),
        (313, 131),
        (324, 135),
        (336, 142),
        (345, 151),
        (355, 166),
        (366, 184),
        (377, 201),
        (380, 210),
        (388, 223),
        (396, 242),
        (404, 264),
        (413, 290),
        (422, 311),
        (431, 335),
        (440, 360),
        (451, 386),
        (458, 402),
    ],
    float,
)


def read_plate(cache):
    f = cache / "half-dome-archive-original.jpg"
    if not f.exists():
        reply = requests.get(URL, timeout=30)
        reply.raise_for_status()
        Image.open(BytesIO(reply.content)).verify()
        f.write_bytes(reply.content)
    return Image.open(f).convert("L")


def ridge(dtm, x, y, z):
    az = np.arange(46, 88, 0.012)
    dist = np.arange(3020, 5110, 6, dtype="f")
    X = x + np.sin(np.radians(az))[:, None] * dist
    Z = z - np.cos(np.radians(az))[:, None] * dist
    H = map_coordinates(dtm, [(Z + 6400) / 8, (X + 5000) / 8], order=1, mode="nearest")
    tan = (H - y) / dist
    iz = np.argmax(tan, axis=1)
    k = np.arange(len(az))
    return np.stack([X[k, iz], H[k, iz], Z[k, iz]], axis=1)


def fit(cache, dtm):
    best = None
    for X, Z in [
        (4513, 448),
        (4540, 410),
        (4490, 475),
        (4546, 380),
        (4460, 515),
        (4490, 410),
        (4455, 445),
        (4530, 450),
    ]:
        y = map_coordinates(dtm, [[(Z + 6400) / 8], [(X + 5000) / 8]], order=1)[0] + 2
        line = ridge(dtm, X, y, Z)
        delta = line - [X, y, Z]

        def view(v):
            R, U, F = matrix([X, y, Z, *v])
            depth = delta @ F
            nx = delta @ R / depth
            ny = delta @ U / depth
            rad = 1.0 + v[-1] * (nx * nx + ny * ny)
            return np.stack([285.5 + v[3] * nx * rad, 400.0 - v[3] * ny * rad], axis=1)

        def res(v):
            xy = view(v)
            i = np.argsort(xy[:, 0])
            curve = np.interp(MARKS[:, 0], xy[i, 0], xy[i, 1])
            # Trees over the right flank do not identify the mineral edge exactly.
            w = np.where(MARKS[:, 0] > 393, 0.65, 1.0)
            return np.r_[w * (curve - MARKS[:, 1]), 2 * v[2], v[4] * 28]

        bestOpt = None
        for f in (1120, 1420, 1770):
            fit = least_squares(
                res,
                [66.7, 1.6, 0, f, 0],
                bounds=([59, -8, -3, 650, -0.15], [75, 12, 3, 2200, 0.15]),
                f_scale=2.9,
                loss="soft_l1",
                max_nfev=180,
            )
            if bestOpt is None or fit.cost < bestOpt.cost:
                bestOpt = fit
        v = bestOpt.x
        out = np.array([X, y, Z, *v])
        xy = view(v)
        score = np.median(abs(res(v)[:-2]))
        print(
            "dome",
            X,
            Z,
            "median pixels",
            round(score, 2),
            "cost",
            round(bestOpt.cost),
            "lens",
            round(v[3]),
            flush=True,
        )
        if best is None or bestOpt.cost < best[0]:
            best = bestOpt.cost, out, xy
    _, q, curve = best
    im = read_plate(cache).resize((571, 800)).convert("RGB")
    d = ImageDraw.Draw(im)
    d.line(
        [(float(x), float(y)) for x, y in curve if 0 < x < 571 and abs(y) < 2100],
        fill=(45, 233, 170),
        width=2,
    )
    for x, y in MARKS:
        d.ellipse((x - 1, y - 1, x + 1, y + 1), fill=(255, 121, 59))
    im.save(cache / "dome-archive-fit.jpg", quality=92)
    return q


def main():
    p = argparse.ArgumentParser()
    p.add_argument("cache", type=Path)
    aa = p.parse_args()
    cache = aa.cache
    field = read_plate(cache)
    dtm = read_grid(cache)
    q = fit(cache, dtm)
    # Keep the actual mountain's small image only; the sky, forest, railing
    # and rest of the documentary photograph do not enter the game.
    image = (
        np.asarray(field.resize((1142, 1600), Image.Resampling.LANCZOS), dtype="f")
        / 255
    )
    # Restrict the CPU raster to immediate site plus surrounding mountains.
    # The historical photo's focal length is expressed at a 571-pixel width.
    projection = q.copy()
    projection[6] *= 900 / 571
    with tempfile.TemporaryDirectory() as folder:
        lib = Path(folder) / "dem.so"
        subprocess.run(
            [
                "c++",
                "-O3",
                "-std=c++17",
                "-fPIC",
                "-shared",
                str(Path(__file__).with_name("terrain_depth.cpp")),
                "-o",
                str(lib),
            ],
            check=True,
        )
        stage = ctypes.CDLL(str(lib)).raster
        f32 = np.ctypeslib.ndpointer(dtype="f", flags="C_CONTIGUOUS")
        f64 = np.ctypeslib.ndpointer(dtype="d", flags="C_CONTIGUOUS")
        stage.argtypes = [
            f32,
            ctypes.c_int,
            ctypes.c_int,
            ctypes.c_float,
            ctypes.c_float,
            ctypes.c_float,
            f64,
            ctypes.c_int,
            ctypes.c_int,
            f32,
            f32,
        ]
        depth = np.full(image.shape, 1e6, "f")
        world = np.zeros((*image.shape, 3), "f")
        # The photo was made from the old Glacier Point lookout. The current
        # 3DEP contains new lookout ground/structures immediately around the
        # historic station. Project only the target slopes in the documented
        # mountain plate; the traced rock outline excludes the near subjects.
        l, t, r, b = 6800, -2856, 9352, -400
        target = dtm[
            (t + 6400) // 8 : (b + 6400) // 8 + 1, (l + 5000) // 8 : (r + 5000) // 8 + 1
        ]
        stage(
            np.ascontiguousarray(target, "f"),
            target.shape[1],
            target.shape[0],
            l,
            t,
            8,
            projection,
            1142,
            1600,
            depth,
            world,
        )
    mask = Image.new("L", (1142, 1600))
    d = ImageDraw.Draw(mask)
    # Explicit dry granite boundaries in the archival plate, including the
    # front visor and its turn under the broad south wall. Exclude trees.
    poly = [
        (211, 138),
        (224, 141),
        (240, 139),
        (260, 134),
        (282, 130),
        (301, 132),
        (321, 139),
        (337, 149),
        (351, 168),
        (369, 193),
        (383, 221),
        (402, 275),
        (420, 318),
        (441, 374),
        (455, 398),
        (437, 376),
        (416, 365),
        (392, 355),
        (365, 346),
        (342, 342),
        (321, 335),
        (306, 337),
        (293, 335),
        (280, 324),
        (265, 317),
        (253, 315),
        (244, 307),
        (231, 318),
        (217, 313),
        (200, 308),
        (189, 310),
        (178, 314),
        (167, 325),
        (160, 338),
        (146, 348),
        (132, 367),
        (127, 372),
        (135, 318),
        (140, 275),
        (149, 245),
        (158, 230),
        (175, 224),
        (186, 206),
        (196, 195),
        (202, 176),
    ]
    d.polygon([(x * 2, y * 2) for x, y in poly], fill=255)
    keep = (
        (np.array(mask) > 0) & (depth > 3230) & (depth < 4950) & (world[:, :, 1] > 2100)
    )
    assert keep.sum() > 30000, (
        "Missing Half Dome rock footprint",
        np.percentile(depth[np.array(mask) > 0], [0, 10, 50, 90, 100]),
    )
    sig = keep.astype("f")
    local = gaussian_filter(image * sig, 24) / np.maximum(
        0.002, gaussian_filter(sig, 24)
    )
    contrast = (image - local) / (0.12 + 0.60 * local)
    # The historic exposure separates the two faces by direct light. Recover
    # crack contrast within each facet; defer the directional key to the game.
    intensity = np.clip(0.526 + 0.42 * contrast + 0.10 * (image - 0.4), 0.18, 0.81)
    # Crop to the rock envelope. Preserve the complete UV camera transform
    # in JSON for the live projected same-place material.
    crop = (234, 235, 950, 847)
    sx, sy, rx, by = crop
    alpha = (
        np.clip(
            0.12
            + 0.82 * np.log(np.maximum(3200.0, depth) / 3200.0) / np.log(5100 / 3200),
            0.12,
            0.95,
        )
        * keep
    )
    rgba = np.uint8(
        np.clip(
            np.dstack([intensity * 1.02, intensity, intensity * 0.971, alpha]), 0, 1
        )
        * 255
        + 0.5
    )
    out = Image.fromarray(rgba).crop(crop)
    out.save(cache / "half-dome-field.png")
    basis = matrix(q)
    record = dict(
        camera=q.tolist(),
        basis=basis.tolist(),
        crop=crop,
        sourceSize=[1142, 1600],
        focalPixelsAtWidth571=q[6],
        photo=URL,
        rights="Public domain. Ralph H. Anderson, October 6, 1938. NPS Yosemite Historic Photo Collection RL_00603",
        photoDigest=hashlib.sha256(
            (cache / "half-dome-archive-original.jpg").read_bytes()
        ).hexdigest(),
        pixels=int(keep.sum()),
    )
    (cache / "half-dome-field.json").write_text(json.dumps(record, indent=2) + "\n")
    print(record, flush=True)


if __name__ == "__main__":
    main()
