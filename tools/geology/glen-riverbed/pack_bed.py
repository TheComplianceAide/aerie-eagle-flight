"""Pack Glen Canyon sonar into unused channels of the canyon bank-distance map.

The red channel keeps the original 6.4 km bank projection. Green and blue use
an independent 2550 x 3850 m reach projection at 1.66 x 2.51 metres per pixel.
RGB PNG avoids the premultiplication and color conversion of a transparent mask.
"""
from pathlib import Path
import argparse
import numpy as np
from PIL import Image
from scipy import ndimage as nd

def bake(crop, bank_path, out):
    inputs = np.load(crop)
    left, top, right, bottom = inputs["rect"]
    spacing = inputs["sample_spacing"]
    shape = ((bottom - top) // spacing + 1, (right - left) // spacing + 1)
    sample = np.ones(shape, bool)
    depth = inputs["stage"] - inputs["bed_navd88"]
    # Source 5 is photogrammetric dry land or interpolated. Keep that area
    # in the existing river shader. Valid sonar data include true deep pools.
    mask = np.isin(inputs["source"], [1, 2, 3]) & (inputs["uncertainty"] > 0) & (inputs["uncertainty"] <= .55) & (depth > -.25)
    j, i = inputs["wet_j"][mask], inputs["wet_i"][mask]
    sample[j, i] = False
    distance, nearest = nd.distance_transform_edt(sample, return_indices=True)
    metres = np.zeros(shape, np.float32)
    metres[j, i] = np.maximum(0., depth[mask])
    metres = metres[tuple(nearest)]
    # Separate fractional fields avoid inventing intermediate sediment classes
    # at a survey boundary. A two-metre Gaussian approximates mixed substrate
    # within a camera footprint. Missing bed-class data remains neutral.
    support = np.clip(1. - (distance * spacing - .8) / 5.5, 0., 1.)
    support = support * support * (3. - 2. * support)
    observed = np.zeros(shape, np.float32)
    observed[j, i] = 1
    observed = nd.gaussian_filter(observed, 1.15)
    coverage = [support * 255.]
    for observed_class in (1, 2, 3):
        field = np.zeros(shape, np.float32)
        field[j,i] = inputs["material"][mask] == observed_class
        field = nd.gaussian_filter(field, 1.15) / np.maximum(.003, observed)
        # A small gap between valid sounding lines can inherit its closest
        # actual mixed class. Beyond the soundings, support fades to zero.
        coverage.append(255. * field[tuple(nearest)])
    depth_code = np.clip(np.sqrt(np.clip(metres, 0., 24.) / 24.) * 255., 0., 255.)
    depth_code[distance * spacing > 27] = 0.
    bank = np.asarray(Image.open(bank_path).convert("RGB"))
    height, width = bank.shape[:2]
    x = ((np.arange(width) + .5) / width) * (shape[1] - 1)
    z = ((np.arange(height) + .5) / height) * (shape[0] - 1)
    xy = np.meshgrid(z, x, indexing="ij")
    output = np.empty_like(bank)
    output[:, :, 0] = bank[:, :, 0]
    output[:, :, 1] = np.rint(nd.map_coordinates(depth_code, xy, order=1, mode="nearest")).astype("u1")
    # In blue, the four half-size quadrants store confidence and vegetation,
    # sand and coarse rock fractions. The fixed red shoreline keeps its old UV.
    # Leave material fractions independent, including at mip distances.
    qw, qh = width // 2, height // 2
    mx = ((np.arange(qw) + .5) / qw) * (shape[1] - 1)
    mz = ((np.arange(qh) + .5) / qh) * (shape[0] - 1)
    small = np.meshgrid(mz, mx, indexing="ij")
    for slot, field in enumerate(coverage):
        x0, y0 = (slot % 2) * qw, (slot // 2) * qh
        output[y0:y0+qh, x0:x0+qw, 2] = np.rint(nd.map_coordinates(field, small, order=1, mode="nearest")).astype("u1")
    Image.fromarray(output).save(out, optimize=True)
    assert np.array_equal(np.asarray(Image.open(out))[:, :, 0], bank[:, :, 0])
    print(f"{len(j):,} accepted 2 m cells; native bank distance unchanged across {width*height:,} pixels; bed depth max {metres.max():.2f} m")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    for arg in ["crop", "bank", "out"]:
        parser.add_argument(arg, type=Path)
    args = parser.parse_args()
    bake(args.crop, args.bank, args.out)
