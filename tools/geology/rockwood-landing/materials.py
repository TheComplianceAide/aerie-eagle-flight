"""Color the CC0 timber and draw independent shuttle material details referenced from operator imagery."""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import gaussian_filter

root = Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--cache", type=Path, required=True)
parser.add_argument("--game", type=Path, default=root / "game")
parser.add_argument(
    "--font", default="/System/Library/Fonts/Supplemental/Arial Bold.ttf"
)
args = parser.parse_args()
p = args.cache
g = args.game
rgb = np.asarray(Image.open(p / "wood_planks.jpg")).astype("f4")
lum = rgb @ [0.28, 0.58, 0.14]
weathered = rgb * 0.32 + lum[:, :, None] * 0.68
weathered += np.array([161.0, 152.0, 132.0]) - np.median(
    weathered.reshape(-1, 3), axis=0
)
Image.fromarray(np.uint8(np.clip(weathered, 0, 255))).save(
    g / "rockwood-dock-timber.webp", quality=88, method=6
)
# The hull lettering and stitched canopy are drawn independently. The name
# follows the operator reference while the panel art is original.
rng = np.random.default_rng(543)
w = 1024
h = 256
base = np.empty((h, w, 3), np.float32)
yy, xx = np.mgrid[0:h, 0:w]
m = (
    gaussian_filter(rng.normal(0, 1, (h, w)), (0.45, 10)) * 3
    + rng.normal(0, 0.8, (h, w))
    + 2.2 * np.sin(yy * 1.17)
)
base[:, :, :] = np.array([218, 220, 208]) + m[:, :, None]
base += np.clip((175 - yy) / 187, 0, 1)[:, :, None] * 8
paint = Image.fromarray(np.uint8(np.clip(base, 0, 255)))
d = ImageDraw.Draw(paint)
font = ImageFont.truetype(args.font, 38)
d.text(
    (521, 103),
    "MOUNT KINEO GOLF & SHUTTLE",
    font=font,
    anchor="mm",
    fill=(36, 65, 50),
    stroke_width=0,
)
d.rectangle((19, 131, 1005, 134), fill=(79, 95, 81))
for x in [13, 179, 337, 513, 690, 863, 1009]:
    for y in [10, 242]:
        d.ellipse((x - 1, y, x + 2, y + 2), fill=(148, 153, 146))
        d.point((x, y), fill=(247, 247, 226))
paint.resize((768, 192), Image.Resampling.LANCZOS).save(
    g / "rockwood-shuttle-panel.webp", quality=91, method=6
)
y, x = np.mgrid[:192, :768]
r = np.random.default_rng(67).normal(0, 1, (192, 768))
grain = 0.72 * r + 1.4 * gaussian_filter(r, (1, 14))
width = np.minimum(x % 96, 96 - (x % 96))
seam = 10 * np.exp(-((width / 1.4) ** 2)) - 6 * np.exp(-(((width - 2.8) / 0.95) ** 2))
wrinkle = 5 * np.sin(x * 0.024 + 0.8 * np.sin(y * 0.017)) + 4 * np.sin(
    y * 0.047 + np.sin(x * 0.05)
)
fall = (np.abs(y - 95) / 95) ** 2 * 5
fabric = np.array([55, 98, 72]) + (grain + wrinkle + seam - fall)[:, :, None]
Image.fromarray(np.uint8(np.clip(fabric, 0, 255))).save(
    g / "rockwood-shuttle-canopy.webp", quality=84, method=6
)

# Fine aggregate measured against the spring ortho's north-end turnout.
gravel = np.asarray(Image.open(p / "gravel_floor.jpg").resize((768, 768))).astype("f4")
light = gravel @ [0.26, 0.62, 0.12]
gravel = gravel * 0.18 + light[:, :, None] * 0.82
gravel += np.array([163.0, 159.0, 147.0]) - np.median(gravel.reshape(-1, 3), axis=0)
Image.fromarray(np.uint8(np.clip(gravel, 0, 255))).save(
    g / "rockwood-wharf-aggregate.webp", quality=84, method=5
)
