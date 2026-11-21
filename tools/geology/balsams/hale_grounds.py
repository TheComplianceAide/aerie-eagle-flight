"""Put the mapped Hale House drive and its measured crowns in the park texture atlas."""

import argparse, json
from pathlib import Path
import numpy as np
import rasterio
from affine import Affine
from scipy import ndimage as ndi
from shapely.geometry import Polygon, LineString
from skimage.segmentation import watershed
from PIL import Image
from rasterio.features import rasterize

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--cache", type=Path, required=True)
parser.add_argument(
    "--game", type=Path, default=Path(__file__).resolve().parents[3] / "game"
)
args = parser.parse_args()
x0, z0, x1, z1 = -68, -304, 112, -179
width, height = x1 - x0, z1 - z0
photo = Image.open(args.cache / "hale-ortho.jpg").convert("RGB")
# The field stops at the lakeward tree line, before the shoreline water.
area = [
    (-48, -288),
    (-39, -286),
    (-22, -273),
    (1, -259),
    (27, -246),
    (63, -226),
    (83, -210),
    (81, -202),
    (62, -200),
    (61, -186),
    (53, -181),
    (19, -181),
    (4, -187),
    (-12, -194),
    (-23, -205),
    (-28, -220),
    (-41, -229),
    (-48, -246),
    (-51, -264),
]
structures = [
    [
        (-10.8, -220.6),
        (-3.1, -237.2),
        (22.4, -224.9),
        (17.6, -214),
        (11, -216),
        (8.6, -209.7),
    ],
    [(37.7, -194.2), (43.9, -201), (51.3, -194.5), (44.7, -187.8)],
    [(-30.8, -265.7), (-22.1, -271.2), (-20.5, -268.1), (-28.9, -262.9)],
]


def mask(shapes, scale):
    return rasterize(
        [(Polygon(i), 1) for i in shapes],
        out_shape=(height * scale, width * scale),
        transform=Affine(1 / scale, 0, x0, 0, 1 / scale, z0),
        fill=0,
        dtype="u1",
    ).astype(bool)


c = np.load(args.cache / "hale-points.npz")["points"]
c = c[(c[:, 4] == 1) & (c[:, 3] == 1)]
floor = rasterio.open(args.cache / "hale-terrain.tiff").read(1)
ix = np.floor(c[:, 0] - x0).astype(int)
iz = np.floor(c[:, 1] - z0).astype(int)
top = np.zeros((height, width), "f4")
np.maximum.at(top, (iz, ix), c[:, 2] - floor[iz, ix])
build = mask(structures, 1)
region = mask([area], 1)
veg = ndi.binary_closing((top > 3.6) & ~build, iterations=1) & ~build & region
smooth = ndi.gaussian_filter(np.where(veg, top, 0), 1.05)
peaks, _ = ndi.label((smooth == ndi.maximum_filter(smooth, 8)) & veg & (smooth > 3.1))
labels = watershed(-smooth, peaks, mask=veg)
rgb = np.array(photo.resize((width, height), Image.Resampling.BOX), dtype="f4")
crowns = []
for i in range(1, labels.max() + 1):
    rz, rx = np.where(labels == i)
    if len(rx) < 10:
        continue
    h = float(np.percentile(top[rz, rx], 94))
    if h < 4 or h > 37:
        continue
    w = np.maximum(0, smooth[rz, rx] - 0.40 * h) ** 2 + 0.001
    x = float(np.average(rx + 0.5, weights=w)) + x0
    z = float(np.average(rz + 0.5, weights=w)) + z0
    r, g, b = np.median(rgb[rz, rx, :], axis=0)
    fir = bool(g - r > -4 and g > b * 1.15 and 0.24 * r + 0.56 * g + 0.2 * b < 99)
    crowns.append(
        [
            round(x, 2),
            round(z, 2),
            round(h, 2),
            round(
                float(
                    np.clip(
                        2 * np.sqrt(len(rx) / np.pi) * 1.08,
                        2.8,
                        h * (0.64 if fir else 0.89),
                    )
                ),
                2,
            ),
            int(fir),
        ]
    )
scale = 3
W, H = width * scale, height * scale
raw = np.array(photo.resize((W, H), Image.Resampling.LANCZOS), dtype="f4")
r, g, b = raw.transpose(2, 0, 1)
lum = 0.24 * r + 0.56 * g + 0.2 * b
road = (lum > 115) & (np.maximum.reduce([r, g, b]) - np.minimum.reduce([r, g, b]) < 19)
road = ndi.binary_closing(road, iterations=2)
# The two visible gravel edges cross cast tree shadows and the castellation.
# Register a continuous strip between the sunlit edges on either side.
drive_pixels = [
    (162, 138),
    (203, 169),
    (232, 192),
    (257, 215),
    (282, 244),
    (301, 278),
    (332, 326),
    (363, 364),
    (392, 392),
    (430, 411),
    (477, 432),
    (516, 451),
    (557, 470),
    (589, 491),
    (612, 517),
    (629, 550),
    (647, 577),
    (674, 602),
    (706, 620),
    (752, 633),
    (801, 637),
    (845, 627),
    (888, 614),
    (917, 609),
    (945, 610),
    (967, 615),
]
drive_path = [
    (x0 + x * width / photo.width, z0 + y * height / photo.height)
    for x, y in drive_pixels
]
drive = mask(
    [list(LineString(drive_path).buffer(1.76, cap_style=2).exterior.coords)], scale
)
lane_pixels = [
    (8, 26),
    (123, 120),
    (211, 176),
    (293, 223),
    (397, 277),
    (499, 331),
    (607, 394),
    (710, 453),
    (812, 508),
    (914, 575),
    (1014, 633),
    (1116, 711),
    (1172, 765),
]
lane_path = [
    (x0 + x * width / photo.width, z0 + y * height / photo.height)
    for x, y in lane_pixels
]
lane = mask(
    [list(LineString(lane_path).buffer(2.75, cap_style=2).exterior.coords)], scale
)
road |= drive | lane
woods = ndi.zoom(
    ndi.binary_dilation(veg, iterations=1).astype("u1"), scale, order=0
).astype(bool)
bad = (lum < 53) | woods | mask(structures, scale)
diff = np.clip(lum - ndi.gaussian_filter(lum, 3), -28, 28)
color = (
    np.where(road[:, :, None], np.array([151, 149, 139]), np.array([116, 122, 88]))
    + 0.58 * diff[:, :, None]
    + (raw - lum[:, :, None]) * 0.37
)
color[bad] = [114, 120, 88]
# Restore the drive underneath the portal's aerial shadow. Its fine stones
# resolve at runtime from the registered ground scan.
patched = (drive | lane) & bad
color[patched] = np.array([147, 146, 137]) + 0.19 * diff[patched, None]

ramp = mask([area], scale)
alpha = np.uint8(np.minimum(1, ndi.distance_transform_edt(ramp) / 12) * 255)
img = Image.fromarray(np.dstack([np.uint8(np.clip(color, 0, 255)), alpha]))
park = args.game / "hampshire-parkland.webp"
original = Image.open(args.cache / "hotel-park-pixels.png").convert("RGBA")
if original.size != (936, 780):
    raise ValueError("Rebuild the main park with park.py first")
# Single terrain sampler for both campuses, including on 16-unit mobile GPUs.
packed = Image.new("RGBA", (936, 1160))
packed.paste(original)
packed.paste(img, (0, 784))
packed.save(park, quality=92, method=6)
js = args.game / "dixville-resort-park.js"
with js.open("a") as f:
    f.write(
        "window.dixvilleHalePark="
        + json.dumps(dict(boundary=area, crowns=crowns), separators=(",", ":"))
        + ";\n"
    )
print("Hale grounds", len(crowns), "crowns", packed.size)
