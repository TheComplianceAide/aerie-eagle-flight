"""Integrate Yosemite's cloud optical depth through the evening solar column."""

from pathlib import Path
import argparse, numpy as np
from scipy.ndimage import gaussian_filter, shift
from PIL import Image


def main():
    p = argparse.ArgumentParser()
    p.add_argument("game", type=Path)
    game = p.parse_args().game
    base = (
        np.asarray(Image.open(game / "cloud-field.png").convert("L"), dtype="f") / 255
    )
    # Match wind-field.js and the atlas sun. The cloud texture is rotated to
    # downwind/crosswind coordinates. A ~360 m thick field projects a long
    # path through the deck at 12.4 degrees and stays broad at the surface.
    seed = 0
    for c in "yosemite":
        seed = (31 * seed + ord(c)) % (2**32)
    angle = -0.48 + 0.65 * np.sin(seed % 997 / 997 * 2 * np.pi)
    az = np.radians(157)
    solar = np.array([np.cos(az), np.sin(az)])
    along = np.array([np.cos(angle), np.sin(angle)])
    across = np.array([-along[1], along[0]])
    du = solar @ along
    dv = solar @ across * 0.96
    span = 360 / np.tan(np.radians(12.4))
    # Source rows are opposite uploaded texture v. Thick clouds transmit
    # less direct light. Integrate transmission, not RGB.
    sigma = 70 * 512 / 5100
    coverage = gaussian_filter(base, sigma=sigma, mode="wrap")
    positions = np.linspace(-0.5, 0.5, 25)
    weights = np.exp(-4 * positions**2)
    weights /= weights.sum()
    cover = sum(
        w
        * shift(
            coverage,
            (d * dv * span * 512 / 5100, -d * du * span * 512 / 5100),
            order=1,
            mode="grid-wrap",
            prefilter=False,
        )
        for d, w in zip(positions, weights)
    )
    im = Image.fromarray(np.uint8(np.clip(cover, 0, 1) * 255 + 0.5)).resize(
        (192, 192), Image.Resampling.LANCZOS
    )
    im.save(game / "yosemite-cloud-penumbra.webp", lossless=True, method=6)


if __name__ == "__main__":
    main()
