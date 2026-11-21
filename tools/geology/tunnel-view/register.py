"""Register NPS/C. Jacoby's field photograph to the USGS Tunnel View skyline."""

from pathlib import Path
import json, argparse
import numpy as np
import rasterio
from scipy.ndimage import map_coordinates
from scipy.optimize import least_squares
from PIL import Image, ImageDraw

# Pixel coordinates in a 900-wide copy of NPS's 16:9 original. No tree-covered
# edge at left and no fog-obscured edge east of Bridalveil are used in the fit.
TRACES = np.array(
    [
        (34, 190),
        (57, 190),
        (83, 187),
        (107, 187),
        (122, 183),
        (139, 184),
        (158, 191),
        (184, 204),
        (207, 212),
        (218, 217),
        (223, 254),
        (237, 270),
        (251, 288),
        (266, 301),
        (278, 296),
        (292, 296),
        (305, 300),
        (320, 303),
        (330, 294),
        (336, 290),
        (348, 295),
        (366, 292),
        (380, 278),
        (402, 273),
        (432, 264),
        (447, 259),
        (461, 261),
        (471, 264),
        (482, 255),
        (488, 237),
        (495, 224),
        (504, 219),
        (517, 220),
        (528, 223),
        (539, 229),
        (543, 217),
        (554, 218),
        (568, 224),
        (583, 229),
        (599, 234),
        (606, 228),
        (616, 226),
        (627, 227),
        (640, 221),
        (657, 215),
        (674, 215),
        (684, 208),
        (694, 204),
        (759, 157),
        (778, 147),
        (799, 139),
        (819, 130),
        (833, 122),
        (850, 103),
        (866, 76),
        (880, 66),
        (897, 60),
    ],
    float,
)


def matrix(q):
    _, _, _, az, el, roll, _, _ = q
    a, b, r = np.radians([az, el, roll])
    forward = np.array([np.sin(a) * np.cos(b), np.sin(b), -np.cos(a) * np.cos(b)])
    right = np.array([np.cos(a), 0, np.sin(a)])
    up = np.cross(right, forward)
    return np.stack(
        [
            right * np.cos(r) + up * np.sin(r),
            up * np.cos(r) - right * np.sin(r),
            forward,
        ]
    )


def read_grid(cache):
    with rasterio.open(cache / "yosemite-tunnel-dem.tif") as f:
        grid = f.read(1).astype("f")
        assert f.width == 2526 and f.height == 1451
        return grid


def project(q, points):
    right, up, view = matrix(q)
    dx = points - np.array(q[:3])
    depth = dx @ view
    xx = dx @ right / np.maximum(depth, 1)
    yy = dx @ up / np.maximum(depth, 1)
    factor = 1 + q[-1] * (xx**2 + yy**2)
    return np.stack(
        [450 + q[6] * xx * factor, 253.125 - q[6] * yy * factor], axis=1
    ), depth


def horizon(grid, x0, y0, z0):
    az = np.arange(39, 128, 0.026)
    dist = np.arange(65, 20650, 11, dtype="f")
    xs = x0 + np.sin(np.radians(az))[:, None] * dist
    zs = z0 - np.cos(np.radians(az))[:, None] * dist
    zz = (zs + 6400) / 8
    xx = (xs + 5000) / 8
    y = map_coordinates(grid, [zz, xx], order=1, mode="nearest")
    tan = (y - y0) / dist
    tan[(zz < 0) | (xx < 0) | (xx >= grid.shape[1]) | (zz >= grid.shape[0])] = -5
    idx = np.argmax(tan, axis=1)
    ii = np.arange(len(idx))
    return np.stack([xs[ii, idx], y[ii, idx], zs[ii, idx]], axis=1)


def main():
    cli = argparse.ArgumentParser()
    cli.add_argument("cache", type=Path)
    cache = cli.parse_args().cache
    grid = read_grid(cache)
    best = None
    for x, z in [
        (-4654, 1788),
        (-4636, 1794),
        (-4670, 1790),
        (-4652, 1804),
        (-4640, 1809),
        (-4628, 1787),
        (-4668, 1807),
    ]:
        ground = float(
            map_coordinates(grid, [[(z + 6400) / 8], [(x + 5000) / 8]], order=1)[0]
        )
        y = ground + 2
        line = horizon(grid, x, y, z)

        def residual(v):
            q = np.array([x, y, z, *v])
            uv, along = project(q, line)
            use = along > 0
            ix = np.argsort(uv[use, 0])
            mapped = np.interp(TRACES[:, 0], uv[use, 0][ix], uv[use, 1][ix])
            return np.r_[mapped - TRACES[:, 1], v[2] * 0.8, v[4] * 38]

        optimum = None
        for focal in (650, 845, 1080):
            rs = least_squares(
                residual,
                [75.8, 7.7, 0, focal, 0],
                bounds=([64, 0, -4, 450, -0.18], [95, 21, 4, 1700, 0.18]),
                loss="soft_l1",
                f_scale=3,
                max_nfev=110,
            )
            if optimum is None or rs.cost < optimum.cost:
                optimum = rs
        q = np.array([x, y, z, *optimum.x])
        score = np.median(abs(residual(optimum.x)[:-2]))
        print(
            "station",
            x,
            z,
            "median pixel",
            round(score, 2),
            "cost",
            round(optimum.cost),
            q[3:],
            flush=True,
        )
        if best is None or optimum.cost < best[0]:
            best = optimum.cost, q, line
    _, q, line = best
    uv, along = project(q, line)
    img = Image.open(cache / "tunnel-field.jpg").convert("RGB").resize((900, 506))
    p = ImageDraw.Draw(img)
    pts = [
        (float(x), float(y)) for (x, y), d in zip(uv, along) if d > 0 and -4 < x < 904
    ]
    p.line(pts, fill=(72, 247, 176), width=2)
    for x, y in TRACES:
        p.ellipse((x - 1, y - 1, x + 1, y + 1), fill=(255, 130, 55))
    img.save(cache / "tunnel-skyline-fit.jpg", quality=93)
    (cache / "tunnel-camera.json").write_text(json.dumps(q.tolist()) + "\n")


if __name__ == "__main__":
    main()
