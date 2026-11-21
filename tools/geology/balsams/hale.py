"""Prepare the photographed stone entrance and weathered wooden shakes at Hale House."""

import argparse
from pathlib import Path
import numpy as np
from PIL import Image
import requests
from scipy import ndimage as ndi

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--cache", type=Path, required=True)
parser.add_argument(
    "--game", type=Path, default=Path(__file__).resolve().parents[3] / "game"
)
parser.add_argument(
    "--boards",
    type=Path,
    help="existing licensed building-boards.webp in a sparse checkout",
)
args = parser.parse_args()
source = args.cache / "gate-source.jpg"
if not source.exists():
    response = requests.get(
        "https://tile.loc.gov/image-services/iiif/service:pnp:highsm:15800:15884/full/pct:25/0/default.jpg",
        timeout=45,
    )
    response.raise_for_status()
    source.write_bytes(response.content)
photo = np.asarray(Image.open(source).convert("RGB"), dtype=float)
# This crop retains the original dark masonry and radial arch stones. All faces
# using it in the game are bounded by the registered arch outline, and both
# the large aperture and high narrow aperture are physically open.
N = 768
yy, xx = np.mgrid[:N, :N]
px = 32 + (xx + 0.5) * 425 / N
py = 207 + (yy + 0.5) * 413 / N
scale = photo.shape[1] / 520


def sample(x, y):
    return np.stack(
        [
            ndi.map_coordinates(band, [y * scale, x * scale], order=1, mode="nearest")
            for band in photo.transpose(2, 0, 1)
        ],
        -1,
    )


color = sample(px, py)
# Mask leaves and a narrow branch draped over the lower right pier. Restore
# those stones from another unoccluded part of the same portal at matching scale.
green = (
    (color[:, :, 1] > color[:, :, 0] * 1.06)
    & (color[:, :, 1] > color[:, :, 2] * 1.2)
    & (px > 364)
    & (py > 414)
    & (py < 541)
)
replace = ndi.gaussian_filter(
    ndi.binary_dilation(green, iterations=4).astype(float), 1.3
)
stone = sample(112 + np.mod(px - 364, 61), 396 + np.mod(py - 414, 120))
color = color * (1 - replace[:, :, None]) + stone * replace[:, :, None]
lum = color @ [0.28, 0.55, 0.17]
low = ndi.gaussian_filter(lum, 9)
# The transparency was exposed for the sky. Recover legible albedo and remove
# the blue cast before the game's existing dawn light falls on the stone.
light = np.clip(34 + 1.62 * lum + (lum - low) * 0.17 + 4.8 * np.sqrt(lum + 1), 40, 173)
color = light[:, :, None] + (color - lum[:, :, None]) * 0.49 + np.array([3, 1, -2])
Image.fromarray(np.uint8(np.clip(color, 0, 255))).save(
    args.game / "hale-portal.webp", quality=94, method=6
)
# Separate rays need a fully occupied patch of the real rubble for the deep
# side jambs and vault. It has an actual stone face on every texel.
img = Image.fromarray(np.uint8(np.clip(color, 0, 255)))
box = tuple(
    int(t)
    for t in [
        (92 - 32) * N / 425,
        (381 - 207) * N / 413,
        (176 - 32) * N / 425,
        (556 - 207) * N / 413,
    ]
)
tile = img.crop(box).resize((192, 384), Image.Resampling.LANCZOS)
mirror = Image.new("RGB", (384, 768))
mirror.paste(tile)
mirror.paste(tile.transpose(Image.Transpose.FLIP_LEFT_RIGHT), (192, 0))
mirror.paste(
    mirror.crop((0, 0, 384, 384)).transpose(Image.Transpose.FLIP_TOP_BOTTOM), (0, 384)
)
mirror.save(args.game / "hale-rubble.webp", quality=89, method=6)
board = Image.open(args.boards or args.game / "building-boards.webp").convert("RGB")
board = np.array(board, dtype="f4")
size = 640
course = 40
rng = np.random.default_rng(1902)
shake = np.zeros((size, size, 3), "f4")
for row in range(size // course):
    widths = rng.uniform(0.76, 1.4, 8)
    cuts = np.rint(np.r_[0, np.cumsum(widths)] / sum(widths) * size).astype(int)
    offset = int(rng.integers(0, 110))
    first = row * course
    for left, right in zip(cuts, cuts[1:]):
        w = right - left
        v, u = np.mgrid[:course, :w]
        grain = board[
            (int(rng.integers(30, board.shape[0] - 45)) + u * 0.39).astype(int)
            % board.shape[0],
            (int(rng.integers(25, board.shape[1] - 120)) + v * 2.2).astype(int)
            % board.shape[1],
        ]
        grain = grain.mean(2)
        grain = (grain - grain.mean()) * 0.52
        tone = rng.uniform(0.90, 1.09)
        face = np.array([92, 68, 53]) * tone + grain[:, :, None]
        face[:2] *= 0.65
        face[-2:] *= 1.09
        face[:, :2] *= 0.64
        face[:, -1:] *= 0.79
        shake[first : first + course, (offset + np.arange(left, right)) % size, :] = (
            face
        )
Image.fromarray(np.uint8(np.clip(shake, 0, 255))).save(
    args.game / "hale-shakes.webp", quality=91, method=6
)
