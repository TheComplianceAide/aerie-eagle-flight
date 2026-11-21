"""Register the six-inch NH park image and isolate surveyed crowns on the historic resort lawns."""

from pathlib import Path
import argparse, json
import numpy as np
from affine import Affine
import rasterio
from rasterio.features import rasterize
from scipy import ndimage as ndi
from shapely.geometry import Polygon
from skimage.segmentation import watershed
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--cache", type=Path, required=True)
parser.add_argument(
    "--game", type=Path, default=Path(__file__).resolve().parents[3] / "game"
)
parser.add_argument("--survey", type=Path, required=True)
args = parser.parse_args()
p = args.cache
rect = (-380, -432, -68, -172)
x0, z0, x1, z1 = rect
estate = [
    (-351, -360),
    (-335, -389),
    (-329, -419),
    (-305, -431),
    (-204, -431),
    (-175, -422),
    (-143, -398),
    (-104, -364),
    (-72, -331),
    (-69, -310),
    (-78, -300),
    (-90, -297),
    (-84, -266),
    (-75, -240),
    (-85, -235),
    (-119, -241),
    (-143, -235),
    (-160, -226),
    (-181, -206),
    (-196, -204),
    (-211, -200),
    (-226, -190),
    (-234, -177),
    (-259, -177),
    (-279, -198),
    (-300, -204),
    (-320, -213),
    (-328, -227),
    (-353, -225),
    (-373, -227),
    (-378, -233),
    (-378, -271),
    (-353, -274),
    (-335, -271),
    (-337, -296),
    (-347, -325),
]
parking = [
    (-330, -409),
    (-325, -428),
    (-287, -432),
    (-208, -432),
    (-181, -420),
    (-157, -402),
    (-198, -372),
    (-214, -370),
    (-256, -380),
    (-290, -385),
]
rear = [
    (-300, -407),
    (-259, -408),
    (-250, -380),
    (-242, -375),
    (-244, -357),
    (-297, -358),
]
natural = [
    (-139, -335),
    (-119, -338),
    (-101, -305),
    (-87, -256),
    (-81, -241),
    (-90, -236),
    (-107, -267),
    (-120, -310),
]
source = args.survey.read_text()
survey = json.JSONDecoder().raw_decode(
    source.split('window.ATLAS_SURVEYS["dixville"]=')[1]
)[0]
houses = [
    Polygon(r).buffer(4.5 if i == 0 else 1.4)
    for i, r in enumerate(survey["sites"]["houses"])
    if len(r) > 2
]
houses.extend(
    [
        Polygon(rear).buffer(2.5),
        Polygon([(-300, -381), (-245, -381), (-242, -350), (-300, -352)]),
        Polygon([(-220, -343), (-184, -347), (-182, -333), (-220, -326)]),
    ]
)
grid = (z1 - z0, x1 - x0)
transform = Affine(1, 0, x0, 0, 1, z0)


def mask(shapes, shape=grid, trans=transform):
    return rasterize(
        [(a, 1) for a in shapes], out_shape=shape, transform=trans, fill=0, dtype="u1"
    ).astype(bool)


photo = np.array(Image.open(p / "park-ortho.jpg").convert("RGB"), dtype="f4")
raw = np.load(p / "park-points.npz")["points"]
floor = rasterio.open(p / "park-terrain.tiff").read(1)
pts = raw[(raw[:, 4] == 1) & (raw[:, 3] == 1)]
ix = np.floor(pts[:, 0] - x0).astype(int)
iz = np.floor(pts[:, 1] - z0).astype(int)
good = (ix >= 0) & (iz >= 0) & (ix < grid[1]) & (iz < grid[0])
ix, iz, pts = ix[good], iz[good], pts[good]
top = np.zeros(grid, "f4")
height = pts[:, 2] - floor[iz, ix]
np.maximum.at(top, (iz, ix), height)
occupied = mask(houses)
area = mask([Polygon(estate)])
vegetation = (top > 3.6) & area & ~occupied
vegetation = ndi.binary_closing(vegetation, iterations=1) & ~occupied & area
soft = ndi.gaussian_filter(np.where(vegetation, top, 0), 1.1)
local = soft == ndi.maximum_filter(soft, 9)
peaks, _ = ndi.label(local & (soft > 3.1) & vegetation)
zones = watershed(-soft, peaks, mask=vegetation)
crowns = []
small = np.array(
    Image.fromarray(photo.astype("u1")).resize((grid[1], grid[0]), Image.Resampling.BOX)
)
for i in range(1, zones.max() + 1):
    rz, rx = np.where(zones == i)
    if len(rx) < 10:
        continue
    h90 = float(np.percentile(top[rz, rx], 94))
    if not 4 < h90 < 38:
        continue
    weight = np.maximum(0, soft[rz, rx] - 0.40 * h90) ** 2 + 0.0001
    x = float(np.average(rx + 0.5, weights=weight)) + x0
    z = float(np.average(rz + 0.5, weights=weight)) + z0
    red, green, blue = np.median(small[rz, rx, :].astype("f4"), axis=0)
    evergreen = bool(
        (green - red) > -4
        and green > blue * 1.15
        and 0.24 * red + 0.56 * green + 0.20 * blue < 99
    )
    width = float(
        np.clip(
            2 * np.sqrt(len(rz) / np.pi) * 1.08,
            2.8,
            h90 * (0.64 if evergreen else 0.89),
        )
    )
    crowns.append(
        [round(x, 2), round(z, 2), round(h90, 2), round(width, 2), int(evergreen)]
    )
# Mown lawn, carriage loop, parterre, courts and pool keep their surveyed
# positions. Shade cast by tall roofs and crowns is removed before dynamic light.
scale = 3
shape = (grid[0] * scale, grid[1] * scale)
raw = np.array(
    Image.fromarray(photo.astype("u1")).resize(
        (shape[1], shape[0]), Image.Resampling.LANCZOS
    ),
    dtype="f4",
)
trans = Affine(1 / scale, 0, x0, 0, 1 / scale, z0)
grounds = mask([Polygon(estate)], shape, trans)
road = mask([Polygon(parking)], shape, trans)
building = mask(houses, shape, trans)
woods = ndi.zoom(
    ndi.binary_dilation(vegetation, iterations=1).astype("u1"), scale, order=0
).astype(bool)
r, g, b = raw.transpose(2, 0, 1)
lum = 0.26 * r + 0.55 * g + 0.19 * b
road |= (lum > 120) & (abs(r - g) < 16) & (abs(g - b) < 17)
special = mask(
    [
        Polygon([(-289, -267), (-234, -270), (-233, -229), (-287, -224)]),
        Polygon([(-214, -256), (-193, -268), (-165, -231), (-183, -216)]),
        Polygon([(-379, -268), (-335, -271), (-333, -233), (-377, -230)]),
    ],
    shape,
    trans,
)
texture = raw.copy()
invalid = (lum < 62) | woods | building
for condition, base in [
    (~road, np.array([120, 125, 92.0])),
    (road, np.array([146, 144, 137.0])),
]:
    original = condition & ~invalid & ~special
    num = ndi.gaussian_filter(np.where(original, lum, 0), 9)
    denom = ndi.gaussian_filter(original.astype("f4"), 9)
    mean = np.where(denom > 0.08, num / np.maximum(0.08, denom), base.mean())
    grain = np.clip((lum - mean) / np.maximum(72, mean), -0.35, 0.31)
    coarse = np.clip(
        (ndi.gaussian_filter(lum, 2) - mean) / np.maximum(72, mean), -0.13, 0.16
    )
    hue = np.clip((r - b) / 68, -0.4, 0.75)
    chroma = (raw - lum[:, :, None]) * 0.38
    paint = (
        base * (1.0 + grain[:, :, None] * 0.68 + coarse[:, :, None] * 0.35)
        + chroma
        + np.stack([hue * 4, hue * 2, -hue * 2], 2)
    )
    paint[invalid] = base
    texture[condition] = paint[condition]
# The circular four-bed planting and curving lawn walks remain legible as real
# ground pigment. Retain the clay, turf and unused pool basin inside these sites.
keep = special & ~woods & ~building
texture[keep] = raw[keep] * 0.80 + np.array([22, 22, 20])
# Four individual planted beds and their clipped turf cross appear on the
# state image. Retain the measured outlines instead of coloring the entire
# circle as generic grass. The references show dormant soil at this date.
beds = [
    [
        (210, 352),
        (211, 297),
        (218, 266),
        (234, 242),
        (260, 221),
        (280, 212),
        (284, 215),
        (315, 280),
        (313, 292),
        (298, 320),
        (284, 337),
        (222, 358),
    ],
    [
        (304, 198),
        (329, 189),
        (363, 188),
        (394, 198),
        (423, 215),
        (445, 239),
        (456, 258),
        (367, 300),
        (354, 295),
        (335, 281),
        (323, 256),
    ],
    [
        (379, 322),
        (464, 280),
        (472, 289),
        (477, 318),
        (474, 345),
        (467, 372),
        (456, 396),
        (432, 417),
        (412, 429),
        (400, 429),
        (368, 357),
        (368, 343),
    ],
    [
        (225, 380),
        (301, 350),
        (329, 349),
        (354, 357),
        (368, 379),
        (379, 427),
        (375, 445),
        (346, 453),
        (316, 451),
        (281, 439),
        (254, 420),
        (235, 398),
    ],
]
bedRings = [
    [[round(-224 + a / 12, 2), round(-329 + b / 12, 2)] for a, b in ring]
    for ring in beds
]
bedPhoto = mask([Polygon(r) for r in bedRings], shape, trans)
soilHi = np.clip((lum - ndi.gaussian_filter(lum, 2)) * 0.38, -13, 13)
soil = np.array([110, 89, 73]) + soilHi[:, :, None] + 0.20 * (raw - lum[:, :, None])
texture[bedPhoto] = soil[bedPhoto]
rng = np.random.default_rng(1918)
texture += rng.normal(0, 1.7, shape)[:, :, None]
alpha = ndi.distance_transform_edt(grounds) / 12
alpha = np.minimum(alpha, 1)
water = mask(
    [
        Polygon(
            [
                (-70, -239),
                (-85, -236),
                (-112, -240),
                (-125, -241),
                (-142, -236),
                (-158, -228),
                (-176, -210),
                (-193, -199),
                (-205, -202),
                (-220, -196),
                (-235, -184),
                (-245, -172),
                (-68, -172),
            ]
        )
    ],
    shape,
    trans,
)
alpha[water] = 0
rgba = np.dstack((np.uint8(np.clip(texture, 0, 255)), np.uint8(alpha * 255)))
Image.fromarray(rgba).save(p / "hotel-park-pixels.png")
js = (
    "// NH GRANIT park boundary and 2015 USGS crown envelopes in local metres.\nwindow.dixvilleResortPark="
    + json.dumps(
        dict(boundary=estate, crowns=crowns, beds=bedRings), separators=(",", ":")
    )
    + ";\n"
)
(args.game / "dixville-resort-park.js").write_text(js)
(p / "park-crowns.json").write_text(
    json.dumps(
        {"count": len(crowns), "conifers": sum(c[-1] for c in crowns), "trees": crowns},
        indent=2,
    )
)
print(
    "recovered",
    len(crowns),
    "planting positions,",
    sum(c[-1] for c in crowns),
    "evergreen candidates; RGB image",
    rgba.shape,
)
