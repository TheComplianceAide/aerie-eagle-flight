"""Transfer the contiguous lidar tongue into Aerie's existing elevation arrays."""

from argparse import ArgumentParser
from pathlib import Path
import base64, json
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, map_coordinates

parser = ArgumentParser()
parser.add_argument("cache", type=Path)
parser.add_argument("regional_base", type=Path)
parser.add_argument("game", type=Path)
args = parser.parse_args()
x0, z0 = -1200, -4800
survey = json.loads(args.regional_base.read_text().split("=", 1)[1].rstrip(";\n"))


def data(name, dtype, shape):
    return np.frombuffer(base64.b64decode(survey[name]), dtype=dtype).reshape(shape)


def encode(a):
    return base64.b64encode(a.tobytes()).decode("ascii")


base = data("inner", "<i2", (961, 961)).copy()
oldIce = data("iceRelief", "u1", (881, 801)).copy()
regional = data("relief8", "i1", (1801, 1801)).astype("f") * 0.5


def ease(a, b, value):
    t = np.clip((value - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def triangulated(field, step, half, x, z):
    u = (x + half) / step
    v = (z + half) / step
    col = u.astype(int)
    row = v.astype(int)
    a = u - col
    b = v - row
    m, n = field.shape
    col = np.clip(col, 0, n - 2)
    row = np.clip(row, 0, m - 2)
    return np.where(
        a + b < 1,
        field[row, col] * (1 - a - b)
        + field[row, col + 1] * a
        + field[row + 1, col] * b,
        field[row + 1, col + 1] * (a + b - 1)
        + field[row + 1, col] * (1 - a)
        + field[row, col + 1] * (1 - b),
    )


x, z = np.meshgrid(np.arange(-1200, 2801, 5), np.arange(-4800, -399, 5))
check = np.load(args.cache / "tongue-survey.npz")
l, t, r, b = check["bounds"]
elev = check["elev"]
valid = np.isfinite(elev)
dist = 5 * distance_transform_edt(np.pad(valid, 1))[1:-1, 1:-1]
rows = (z - t) / 5
cols = (x - l) / 5
weight = map_coordinates(
    ease(17, 340, dist), (rows, cols), order=1, mode="constant", cval=0
)
mask = np.asarray(Image.open(args.game / "alaska-ice-relief.webp"))[:, :, 2] / 255
inside = distance_transform_edt(mask > 0.55) * 5
# Keep the established calving front. Across the valley and at the top of the
# local terrain domain, transition over several hundred metres: the original
# ArcticDEM and the later summer survey describe different ice elevations.
weight *= ease(5, 215, inside) * ease(1390, 1910, -z) * ease(-4780, -4360, z)
field = (
    elev[
        tuple(
            distance_transform_edt(~valid, return_distances=False, return_indices=True)
        )
    ]
    - 18
)
real = map_coordinates(field, (rows, cols), order=1, mode="nearest")
oldBase = triangulated(base.astype("f") * 0.125, 10, 4800, x, z)
fine = triangulated(regional, 8, 7200, x, z)
old = oldBase + (oldIce.astype("f") - 128) / 7 + fine
target = old + weight * (real - old)
# The regular ten-metre grid holds the broad height change; existing five-metre
# ice cells retain its narrow lips and restore the eight-metre DSM residual.
# Both visible terrain and flight clearance continue using the original sampler.
x10 = x[::2, ::2]
z10 = z[::2, ::2]
dx = np.rint((target - old)[::2, ::2] * 8).astype("i2")
row = (z10 + 4800) // 10
col = (x10 + 4800) // 10
base[row, col] += dx
updated = triangulated(base.astype("f") * 0.125, 10, 4800, x, z)
ideal = np.round(128 + 7 * (target - updated - fine))
newIce = np.clip(ideal, 0, 255).astype("u1")
active = (weight > 0) | (np.abs(updated - oldBase) > 0.001)
newIce = np.where(active, newIce, oldIce).astype("u1")
result = updated + fine + (newIce.astype("f") - 128) / 7
survey["inner"] = encode(base)
survey["iceRelief"] = encode(newIce)
(args.game / "alaska-survey.js").write_text(
    "window.ALASKA_SURVEY=" + json.dumps(survey, separators=(",", ":")) + ";\n"
)
report = {
    "active5m": int(active.sum()),
    "changed10m": int((dx != 0).sum()),
    "changed5mResiduals": int(np.count_nonzero(newIce != oldIce)),
    "cappedResiduals": int(((ideal < 0) | (ideal > 255))[active].sum()),
    "meanAbsoluteFitM": float(
        np.abs(result[weight > 0.995] - real[weight > 0.995]).mean()
    ),
    "p99fitM": float(
        np.percentile(np.abs(result[weight > 0.995] - real[weight > 0.995]), 99)
    ),
    "maxFitM": float(np.max(np.abs(result[weight > 0.995] - real[weight > 0.995]))),
    "points": [],
}
for name, xx, zz in [
    ("Upper crevasse field", 1500, -4130),
    ("Medial moraine", 630, -2450),
    ("Mendenhall Glacier", 40, -1400),
    ("Blue Ice Passage", -115, -1010),
]:
    j = (zz - z0) // 5
    i = (xx - x0) // 5
    report["points"].append(
        dict(
            name=name,
            coords=[xx, zz],
            old=round(old[j, i], 3),
            new=round(result[j, i], 3),
            survey=round(float(real[j, i]), 3),
            weight=round(weight[j, i], 4),
        )
    )
(args.cache / "contiguous-fit.json").write_text(json.dumps(report, indent=2) + "\n")
print(report)
