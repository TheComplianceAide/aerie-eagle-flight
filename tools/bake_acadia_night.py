"""Orient NASA SVS Deep Star Maps 2020 for Mount Desert Island on a summer night.

Input: starmap_2020_8k.exr, celestial ICRF/J2000, with RA increasing to the left.
A local sidereal time of 17h50m puts Sagittarius above the southern coast.
"""

import argparse
from pathlib import Path

import numpy as np
import OpenEXR
from PIL import Image
from scipy.ndimage import gaussian_filter


def bake(source, destination):
    stars = OpenEXR.File(str(source)).channels()["RGB"].pixels
    source_height, source_width = stars.shape[:2]
    width, height = 6144, 3072
    latitude = np.deg2rad(44.31)
    sidereal = np.deg2rad((17 + 50 / 60) * 15)
    bearing = ((np.arange(width) + 0.5) / width - 0.5) * (2 * np.pi)
    diffuse = gaussian_filter(
        stars[::4, ::4].astype(np.float32),
        (1.1, 1.1, 0),
        mode=("nearest", "wrap", "nearest"),
    )
    output = np.empty((height, width, 3), dtype=np.uint8)

    def sample(data, u, v):
        h, w = data.shape[:2]
        x = u * w - 0.5
        y = np.clip(v * h - 0.5, 0, h - 1.001)
        i, j = np.floor(x).astype(int), np.floor(y).astype(int)
        fx, fy = (x - i)[:, None], (y - j)[:, None]
        a = data[j, i % w] * (1 - fx) + data[j, (i + 1) % w] * fx
        b = data[j + 1, i % w] * (1 - fx) + data[j + 1, (i + 1) % w] * fx
        return a * (1 - fy) + b * fy

    for row in range(height):
        altitude = (0.5 - (row + 0.5) / height) * np.pi
        above = max(0.0, altitude)
        east = np.cos(above) * np.cos(bearing)
        north = -np.cos(above) * np.sin(bearing)
        up = np.sin(above)
        dec = np.arcsin(
            np.clip(up * np.sin(latitude) + north * np.cos(latitude), -1, 1)
        )
        hour = np.arctan2(-east, up * np.cos(latitude) - north * np.sin(latitude))
        u = (0.5 - (sidereal - hour) / (2 * np.pi)) % 1.0
        v = 0.5 - dec / np.pi
        field = sample(stars, u, v)
        dust = sample(diffuse, u, v)
        # Long optical paths mute stars near the water. Coastal airglow stays
        # below the galactic bulge, with the faintest light at the zenith.
        transmission = (1 - np.exp(-max(0.0, np.rad2deg(altitude) + 0.2) / 6.5)) * 0.93
        band = np.exp(-(((np.rad2deg(altitude) - 7.0) / 14.0) ** 2))
        glow = np.array([15.0, 21.0, 33.0]) + band * np.array([13.0, 27.0, 24.0])
        if altitude < 0:
            glow *= 0.36 + 0.64 * np.exp(altitude * 5)
        stellar = np.maximum(0.0, field - 0.15 * dust)
        light = (1.0 - np.exp(-3.7 * stellar)) ** 0.55 * np.array([205.0, 209.0, 218.0])
        light += (1.0 - np.exp(-5.4 * dust)) ** 0.76 * np.array([98.0, 93.0, 78.0])
        output[row] = np.clip(glow + transmission * light, 0, 255).astype("uint8")
    image = Image.fromarray(output)
    destination.mkdir(exist_ok=True, parents=True)
    (destination / "mobile").mkdir(exist_ok=True)
    image.save(destination / "acadia-night-sky.webp", quality=94, method=5)
    image.resize((3072, 1536), Image.Resampling.LANCZOS).save(
        destination / "mobile/acadia-night-sky.webp", quality=92, method=5
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument(
        "--output", type=Path, default=Path(__file__).resolve().parents[1] / "game"
    )
    args = parser.parse_args()
    bake(args.source, args.output)
