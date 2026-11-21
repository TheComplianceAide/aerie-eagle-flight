"""Rectify the lake end and prepare clay roof tiles for the Balsams."""

import argparse
from pathlib import Path
import numpy as np
import requests
from PIL import Image
from scipy.ndimage import map_coordinates
from scipy.ndimage import gaussian_filter
from PIL import ImageDraw

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--cache", type=Path, required=True)
parser.add_argument(
    "--game", type=Path, default=Path(__file__).resolve().parents[3] / "game"
)
args = parser.parse_args()
p = args.cache
p.mkdir(parents=True, exist_ok=True)


def download(dest, url):
    file = p / dest
    if not file.is_file():
        response = requests.get(url, timeout=60)
        response.raise_for_status()
        file.write_bytes(response.content)
    return file


source = download(
    "front-source.jpg",
    "https://tile.loc.gov/image-services/iiif/master:pnp:highsm:13700:13788a/3993,1556,1167,1289/full/0/default.jpg",
)
image = np.asarray(Image.open(source).convert("RGB"), dtype=np.float32)
# Physical front plane expressed on the 850px catalog inspection. A small
# shear corrects perspective, and the open right bay supplies the part of the
# left bay obscured by one spruce and the historic play structure.
y, x = np.meshgrid(
    np.linspace(180, 893, 1000), np.linspace(315, 650, 512), indexing="ij"
)
mirror = 965 - x
weight = np.clip((355 - x) / 6, 0, 1) * np.clip((y - 347) / 35, 0, 1)


def sample(ax, ay):
    ay = np.clip(ay, 0, 886)
    ax = ax + (ay - 345) * 0.0105
    scale = image.shape[1] / 850
    return np.stack(
        [
            map_coordinates(band, [ay * scale, ax * scale], order=1, mode="nearest")
            for band in image.transpose(2, 0, 1)
        ],
        axis=2,
    )


face = sample(x, y) * (1 - weight[:, :, None]) + sample(mirror, y) * weight[:, :, None]
# These are the actual stepped and curved Flemish gables. Everything beyond
# the facade's outline is neutral. Forest, sky and playground are excluded.
mask = Image.new("L", (512, 1000))
draw = ImageDraw.Draw(mask)


def px(row):
    return [((a - 315) * 511 / 335, (b - 180) * 999 / 713) for a, b in row]


draw.polygon(px([(315, 280), (650, 279), (650, 893), (315, 893)]), fill=255)
profiles = [
    [
        (337, 346),
        (337, 286),
        (342, 282),
        (342, 254),
        (350, 244),
        (353, 240),
        (353, 231),
        (361, 229),
        (362, 224),
        (367, 221),
        (369, 214),
        (375, 209),
        (378, 196),
        (384, 192),
        (391, 197),
        (395, 211),
        (402, 217),
        (402, 223),
        (408, 229),
        (412, 230),
        (412, 236),
        (420, 242),
        (426, 247),
        (430, 253),
        (430, 282),
        (437, 284),
        (437, 346),
    ],
    [
        (510, 346),
        (510, 282),
        (516, 280),
        (516, 254),
        (525, 244),
        (529, 241),
        (530, 232),
        (538, 228),
        (539, 221),
        (546, 218),
        (550, 211),
        (553, 197),
        (560, 191),
        (566, 194),
        (571, 208),
        (578, 214),
        (582, 219),
        (583, 224),
        (589, 229),
        (593, 230),
        (594, 238),
        (601, 244),
        (607, 248),
        (613, 253),
        (613, 279),
        (620, 282),
        (620, 346),
    ],
]
for loop in profiles:
    draw.polygon(px(loop), fill=255)
draw.polygon(
    px([(440, 253), (440, 216), (448, 211), (505, 211), (513, 216), (513, 253)]),
    fill=255,
)
opacity = np.asarray(mask) / 255
face = face * opacity[:, :, None] + np.array([163, 155, 147]) * (
    1 - opacity[:, :, None]
)
# Lift the diffuse response out of the transparency's magenta cast and film grain.
face = face * 0.93 + gaussian_filter(face, [0.7, 0.7, 0]) * 0.07
face = face * np.array([1.11, 1.13, 1.08])
atlas = Image.new("RGB", (1024, 1000))
atlas.paste(Image.fromarray(np.clip(face, 0, 255).astype("u1")), (0, 0))
# Side and tower openings are narrower and more widely spaced than the three-
# light lake-front bays. Keep the photographed sash and plaster as separate
# parts of each panel so the back walls do not turn into banks of glass.
panelRows = [
    (546, 539, 590, 591),
    (549, 620, 593, 674),
    (547, 699, 593, 757),
    (547, 455, 593, 509),
    (531, 539, 550, 592),
    (597, 620, 616, 674),
    (548, 369, 592, 429),
    (548, 780, 593, 865),
]
rng = np.random.default_rng(1918)
plaster = sample(np.full((250, 256), 507.0), np.full((250, 256), 565.0))[0, 0]
for i, (x0, y0, x1, y1) in enumerate(panelRows):
    grit = (
        gaussian_filter(rng.normal(0, 1, (250, 256)), 1.25) * 4
        + gaussian_filter(rng.normal(0, 1, (250, 256)), 12) * 36
    )
    pigment = (np.array([172.0, 169.0, 159.0]) + (plaster - np.mean(plaster)) * 0.34)[
        None, None, :
    ] + grit[:, :, None]
    tone = np.array([1.0, 0.983, 0.958])
    panel = Image.fromarray(np.uint8(np.clip(pigment * tone, 0, 255)))
    glassW = 68 if i in (4, 5) else 83
    glassH = 154 if i < 6 else 140
    py, px = np.meshgrid(
        np.linspace(y0, y1, glassH), np.linspace(x0, x1, glassW), indexing="ij"
    )
    opening = sample(px, py) * [1.10, 1.12, 1.07]
    opening = Image.fromarray(np.uint8(np.clip(opening, 0, 255)))
    if i >= 6:
        pair = opening.resize((61, glassH), Image.Resampling.LANCZOS)
        panel.paste(pair, (48, 55))
        panel.paste(pair, (146, 55))
    else:
        panel.paste(opening, ((256 - glassW) // 2, 55))
    atlas.paste(panel, (512 + 256 * (i % 2), 250 * (i // 2)))
atlas.save(args.game / "hampshire-frontage.webp", quality=94, method=6)
asset = "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/roof_tiles/roof_tiles_"
for channel in ["diffuse", "nor_gl"]:
    key = "Diffuse" if channel == "diffuse" else channel
    suffix = "diff" if channel == "diffuse" else "nor_gl"
    path = download("roof-tiles-" + key + ".jpg", asset + suffix + "_1k.jpg")
    im = Image.open(path).convert("RGB")
    if channel == "diffuse":
        pix = np.array(im, dtype="f4")
        avg = np.median(pix.reshape(-1, 3), axis=0)
        # Match clear terracotta slates in the registered New Hampshire ortho.
        pix *= np.array([166, 114, 96]) / avg
        im = Image.fromarray(np.clip(pix, 0, 255).astype("u1"))
    im.resize((640, 640), Image.Resampling.LANCZOS).save(
        args.game
        / ("hampshire-tile" + ("-normal" if channel == "nor_gl" else "") + ".webp"),
        quality=86,
        method=6,
    )
