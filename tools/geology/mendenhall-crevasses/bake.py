"""Register USGS lidar elevations, crevasse facets and ice-margin distance."""

from pathlib import Path
from argparse import ArgumentParser
import json, base64
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, map_coordinates, distance_transform_edt

parser = ArgumentParser()
parser.add_argument("cache", type=Path)
parser.add_argument("game", type=Path)
args = parser.parse_args()


def encode(v):
    return base64.b64encode(v.tobytes()).decode("ascii")


def ease(lo, hi, v):
    t = np.clip((v - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


outline = np.asarray(Image.open(args.game / "alaska-ice-relief.webp"))[:, :, 2] / 255
margin = 5 * distance_transform_edt(outline > 0.55)
fields = []
# The historic optical outline governs the ecological boundary. Lidar
# overrides only co-located natural ice/shallow debris within this outline.
for name in ["upper", "moraine"]:
    src = np.load(args.cache / (name + "-survey.npz"))
    measured = src["elev"]
    left, top, right, bottom = map(int, src["bounds"])
    n, m = measured.shape
    known = np.isfinite(measured)
    jj, ii = np.indices((n, m), dtype="f")
    sample = (jj + 0.5 + top + 4800) / 5, (ii + 0.5 + left + 1200) / 5
    interior = map_coordinates(margin, sample, order=1, mode="constant", cval=0)
    pad = np.zeros((n + 2, m + 2), bool)
    pad[1:-1, 1:-1] = known
    distance = distance_transform_edt(pad)[1:-1, 1:-1]
    alpha = ease(2, 146, distance) * ease(7, 78, interior)
    filled = measured[
        tuple(
            distance_transform_edt(~known, return_distances=False, return_indices=True)
        )
    ]
    # NAVD88 metres to local flight height above Mendenhall Lake's datum.
    ground = filled - 18
    # Independent local slopes retain faces less than a five-metre terrain
    # cell across. Gaussian σ=.90 m integrates genuine 0.5 m source returns.
    local = gaussian_filter(ground, 0.90, mode="nearest")
    dz, dx = np.gradient(local)
    normal = np.stack([-dx, np.ones_like(dx), -dz], axis=2)
    normal /= np.maximum(0.001, np.linalg.norm(normal, axis=2)[:, :, None])
    hollow = gaussian_filter(local, 7.0) - local
    # Store a continuous physical concavity/depth, not fixed photographic light.
    chamber = np.clip(0.47 + hollow / 17, 0, 1)
    data = np.dstack(
        [normal[:, :, 0] * 0.5 + 0.5, normal[:, :, 2] * 0.5 + 0.5, chamber, alpha]
    )
    data = np.rint(np.clip(data, 0, 1) * 255).astype("u1")
    data[alpha <= 0] = [128, 128, 120, 0]
    # Store both one-metre windows with mirrored gutters to avoid bleeding
    # between distinct geography at highly minified texture levels.
    im = Image.fromarray(np.pad(data, ((10, 10), (10, 10), (0, 0)), mode="edge"))
    if name == "upper":
        atlas = Image.new("RGBA", (2240, 1120))
    atlas.paste(im, (0 if name == "upper" else 1120, 0))
    report = dict(
        name=name,
        valid=float(known.mean()),
        iceCoverage=float((alpha > 0).mean()),
        cellMeters=5,
        surfacePixelsPerM=1,
        heightP01P99=np.percentile(ground[alpha > 0.2], [1, 99]).round(2).tolist(),
    )
    print(report)
atlas.save(
    args.game / "alaska-surveyed-crevasses.webp", method=6, quality=92, exact=True
)
# One distance quantization step=4 m. Used solely for clipping the existing
# large margin specimens; floating calved blocks have a separate native model.
x, z = np.meshgrid(np.arange(-1200, 2801, 20), np.arange(-4800, -399, 20))
dist = map_coordinates(
    margin, ((z + 4800) / 5, (x + 1200) / 5), order=1, mode="constant", cval=0
)
(args.game / "alaska-ice-survey.js").write_text(
    "// 20 m sampled glacier-interior distance. See tools/geology/mendenhall-crevasses.\nwindow.mendenhallIceMargin="
    + json.dumps(encode(np.rint(np.clip(dist / 4, 0, 255)).astype("u1")))
    + ";\n"
)
