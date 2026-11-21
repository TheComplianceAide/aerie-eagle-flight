"""Measure the main whitewater thread and its occupied gravel-and-rock bed."""

from argparse import ArgumentParser
from pathlib import Path
import json
import numpy as np
from scipy.ndimage import (
    binary_closing,
    binary_opening,
    distance_transform_edt,
    gaussian_filter,
    gaussian_filter1d,
    label,
    map_coordinates,
)
from PIL import Image, ImageDraw

# Texture pixel centers begin 0.5 m inside the southwest/northeast rectangle.
RECT = (448, 572, 1104, 932)


def wet_survey(cache, legacy):
    data = np.load(cache / "nugget-2013-color.npz")
    l, t, r, b = RECT
    ll, tt, _, _ = data["bounds"]
    sl = np.s_[t - tt : b - tt, l - ll : r - ll]
    valid = data["count"][sl] > 0
    color = data["rgb"][:, sl[0], sl[1]].transpose(1, 2, 0).astype("f")
    support = gaussian_filter(valid.astype("f"), 1.8)
    dist, idx = distance_transform_edt(~valid, return_indices=True)
    rgb = color[tuple(idx)]
    # Whitewater is very bright, nearly neutral and continuous through the
    # fall. Bright sand at its foot is warmer. Bound the search to this stream.
    red, green, blue = rgb.transpose(2, 0, 1)
    bright = red * 0.22 + green * 0.61 + blue * 0.17
    seeds = np.asarray(legacy)[::-1]
    x = np.arange(l, r) + 0.5
    z = np.arange(t, b) + 0.5
    spine = np.interp(x, seeds[:, 0], seeds[:, 1])
    corridor = abs(z[:, None] - spine) < 58
    white = (
        (bright > 176) & (blue > red - 8) & (green > red - 7) & (dist < 5) & corridor
    )
    white = binary_opening(binary_closing(white, iterations=2), iterations=1)
    tag, n = label(white)
    counts = np.bincount(tag[white])
    riverTags = np.where(counts > 22)[0]
    wet = np.isin(tag, riverTags) & (tag > 0)
    # Ignore bright mineral fragments disconnected laterally from the current.
    center = spine.copy()
    limits = np.zeros((len(x), 2))
    for i, base in enumerate(spine):
        zi = np.flatnonzero(wet[:, i] & (abs(z - base) < 52))
        if len(zi) < 4:
            continue
        middle = np.median(zi)
        near = zi[abs(zi - middle) < 29]
        if len(near) < 3:
            continue
        low, high = np.quantile(near, [0.015, 0.985])
        center[i] = t + 0.5 + (low + high) / 2
        limits[i] = (t + 0.5 + low, t + 0.5 + high)
    mapped = limits[:, 1] > 0
    confidence = gaussian_filter1d(mapped.astype("f"), 7)
    corrections = gaussian_filter1d((center - spine) * mapped, 4) / np.maximum(
        0.12, gaussian_filter1d(mapped.astype("f"), 4)
    )
    center = spine + corrections * np.clip((confidence - 0.30) / 0.45, 0, 1)
    grad = np.gradient(gaussian_filter1d(center, 3))
    # Width is measured perpendicular to local flow. Avoid letting isolated
    # rocks split the width, or fill a rock island into the opacity texture.
    widths = np.zeros(len(x))
    offsets = np.arange(-43.0, 43.1, 0.5)
    for i in range(len(x)):
        nz = 1 / np.hypot(1, grad[i])
        nx = -grad[i] * nz
        ix = x[i] + offsets * nx - l - 0.5
        iz = center[i] + offsets * nz - t - 0.5
        hit = (
            map_coordinates(
                wet.astype("u1"), [iz, ix], order=0, mode="constant", cval=0
            )
            > 0
        )
        stripe = offsets[hit]
        if stripe.size < 4:
            continue
        widths[i] = np.ptp(stripe) + 1.3
    good = (widths > 4) & mapped
    sampleWidth = gaussian_filter1d(widths * good, 3.2) / np.maximum(
        0.12, gaussian_filter1d(good.astype("f"), 3.2)
    )
    cover = np.clip((confidence - 0.29) / 0.47, 0, 1)
    widths = (12 + 5.5 * (x < 660)) * (1 - cover) + sampleWidth * cover
    # The old centre line at the foot extends into the plume of its lake.
    # Stop the ribbon at the last robust bright dense cross-section.
    stations = np.r_[np.arange(1080, 473, -8), 473]
    records = []
    for xx in stations:
        j = int(np.clip(xx - l, 0, len(x) - 1))
        records.append(
            [
                int(xx),
                round(float(center[j]), 1),
                round(float(np.clip(widths[j], 6, 66)), 1),
            ]
        )
    envelope = abs(z[:, None] - center[None, :]) < np.minimum(51, widths * 0.83 + 4)
    wet = wet & envelope
    # Preserve small rock islands within the current and leave unsupported
    # stretches to the live water sheet. Transitions occupy a few true metres.
    dWet = distance_transform_edt(wet) - distance_transform_edt(~wet)
    edge = np.clip(0.52 + dWet / 3.8, 0, 1)
    film = np.minimum(1, support * 1.6) * cover[None, :] * corridor
    return rgb, edge, film, records


def main():
    p = ArgumentParser()
    p.add_argument("cache", type=Path)
    p.add_argument("game", type=Path)
    a = p.parse_args()
    a.cache.mkdir(parents=True, exist_ok=True)
    path = Path(__file__).with_name("flow.json")
    original = json.loads(path.read_text())["flow"]
    rgb, edge, film, records = wet_survey(a.cache, original)
    # R is the mapped whitewater fraction and G is spatial confidence.
    # A missing old photograph means the current remains modeled normally.
    mask = np.uint8(np.stack([edge, film, np.zeros_like(film)], axis=-1) * 255 + 0.5)
    Image.fromarray(mask).save(
        a.game / "alaska-nugget-current.webp", lossless=True, method=6
    )
    doc = {
        "bounds": RECT,
        "survey": "NOAA Juneau 2013, May 22 acquisition tiles 911–917",
        "columns": ["worldX", "worldZ", "activeWidthM"],
        "stations": records,
    }
    (a.cache / "nugget-wet-channel.json").write_text(json.dumps(doc, indent=2) + "\n")
    out = Image.fromarray(
        np.uint8(np.clip(rgb * 0.62 + edge[..., None] * np.array([110, 65, 0]), 0, 255))
    )
    d = ImageDraw.Draw(out)
    l, t, _, _ = RECT
    d.line([(x - l, z - t) for x, z, w in records], fill=(255, 58, 161), width=1)
    out.resize((984, 540)).save(a.cache / "nugget-observed-channel.jpg", quality=94)
    print(
        "Trace",
        [(x, z, w) for x, z, w in records if (x % 32 == 0 or x < 507)],
        flush=True,
    )


if __name__ == "__main__":
    main()
