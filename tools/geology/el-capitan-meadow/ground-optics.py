"""Pack the local vegetation survey and a two-metre dry grass material in one sampler."""

from argparse import ArgumentParser
from pathlib import Path
import base64
import json
import hashlib
import requests
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

parser = ArgumentParser()
parser.add_argument("cache", type=Path)
parser.add_argument("game", type=Path)
args = parser.parse_args()
source = "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/withered_grass/withered_grass_"
inputs = [
    ("Diffuse", "diff"),
    ("nor_gl", "nor_gl"),
]
for label, part in inputs:
    dest = args.cache / ("withered_grass-" + label + ".jpg")
    if not dest.exists():
        resp = requests.get(source + part + "_1k.jpg", timeout=45)
        resp.raise_for_status()
        dest.write_bytes(resp.content)
    # Compare with current, publisher-supplied digest for the exact source.
    listed = requests.get("https://api.polyhaven.com/files/withered_grass", timeout=25)
    listed.raise_for_status()
    digest = listed.json()[label]["1k"]["jpg"]["md5"]
    assert hashlib.md5(dest.read_bytes()).hexdigest() == digest

size = 1024


def read(label):
    return (
        np.array(
            Image.open(args.cache / ("withered_grass-" + label + ".jpg"))
            .convert("RGB")
            .resize((size, size), Image.Resampling.LANCZOS),
            dtype="f",
        )
        / 255
    )


rgb, normal = read("Diffuse"), read("nor_gl") * 2 - 1
brightness = rgb @ np.array([0.24, 0.57, 0.19], dtype="f")
# Preserve both the chaff-scale surface and the broader hummocks in a
# photometrically balanced scan. GGX's grain-scale vector is integrated into
# these low-angle directional and cavity samples before normal mips are built.
broad = gaussian_filter(brightness, 23, mode="wrap")
tone = np.clip(
    0.51 + 1.72 * (brightness - broad) + 1.5 * (broad - brightness.mean()), 0, 1
)
relief = np.clip(
    0.5
    + 0.46 * (normal[:, :, 1] * 0.79 + normal[:, :, 0] * 0.61)
    - 0.24 * (1 - normal[:, :, 2]),
    0,
    1,
)
runs = base64.b64decode(
    json.loads(
        (args.game / "yosemite-meadow-field.js")
        .read_text()
        .split("=", 1)[1]
        .rstrip(";\n")
    )
)
field = np.repeat(
    np.frombuffer(runs, dtype=np.uint8)[1::2], np.frombuffer(runs, dtype=np.uint8)[::2]
).reshape(140, 260)
data = np.empty((size, size, 4), np.uint8)
for channel, bits in enumerate([field >> 4, field & 15]):
    # WebGL TextureLoader flips a conventional image, while the RLE rows
    # advance north to south in the game's +z projection.
    data[:, :, channel] = np.asarray(
        Image.fromarray(np.flipud(bits * 17)).resize(
            (size, size), Image.Resampling.BILINEAR
        )
    )
data[:, :, 2] = np.rint(tone * 255).astype("u1")
data[:, :, 3] = np.rint((0.06 + 0.93 * relief) * 255).astype("u1")
Image.fromarray(data).save(
    args.game / "yosemite-meadow-sward.webp", method=6, quality=93, exact=True
)
print("bytes", (args.game / "yosemite-meadow-sward.webp").stat().st_size)
