"""Fit a level eave and two pitched planes to roof returns, even under deciduous crowns."""

import numpy as np
from scipy.ndimage import gaussian_filter1d


def fit_roof(xs, ys, first, last, floor, center, axis, halfspan, longspan):
    design = np.c_[xs - center[0], ys - center[1]]
    # The roof itself is level along its ridge. Ground slopes through hundreds
    # of footprints here, so fit planes in the vertical datum, not above each
    # laser pixel's local floor. Anchor the dimensions at the upper foundation.
    ground = np.percentile(floor, 80)
    y = np.vstack([first, last]) - ground
    valid = np.isfinite(y) & (y > 0.9) & (y < 25)
    if valid.sum() < 10:
        return None
    # A single-return pulse occurs in both grids. Assign that pixel one vote.
    valid[0] &= ~valid[1] | (abs(y[0] - y[1]) > 0.18)
    n = len(xs)
    weights = valid / np.maximum(1, valid.sum(axis=0))
    best = None
    long = design @ axis
    short = design @ np.array([-axis[1], axis[0]])
    # Compare a flat plane with both possible ridge directions. Record only
    # supported slopes; many small boathouses have very shallow pitches.
    for swapped, transverse, half in [(False, short, halfspan), (True, long, longspan)]:
        for grade in np.arange(0, 1.12, 0.075):
            if (swapped and grade == 0) or grade * half > 7.4:
                continue
            fac = np.maximum(0, half - abs(transverse))
            residual = (y - fac * grade)[valid]
            votes, edges = np.histogram(
                residual, bins=np.arange(0.65, 21, 0.16), weights=weights[valid]
            )
            if not votes.any():
                continue
            peaks = gaussian_filter1d(votes.astype(float), 1.65)
            b = peaks.argmax()
            eave = (edges[b] + edges[b + 1]) * 0.5
            error = abs(y - eave - fac * grade)
            distance = np.where(valid, error, np.inf).min(axis=0)
            matched = distance < 0.59
            if matched.sum() < 8:
                continue
            # A tree crown can contain a few points on nearly any plane. Roof
            # support must extend across the plan and both sides of the ridge.
            bins = (transverse[matched] / max(half, 1)).clip(-0.99, 0.99)
            spread = len(np.unique(np.floor((bins + 1) * 2.5).astype(int))) / 5
            weight = np.clip(1 - distance / 0.75, 0, 1).sum() * (0.72 + 0.28 * spread)
            if best is None or weight > best[0]:
                best = (weight, swapped, eave, half * grade, matched)
    if best is None:
        return None
    score, swapped, eave, rise, inliers = best
    take = valid.any(axis=0)
    support = inliers.sum() / max(1, take.sum())
    if support < 0.28 or inliers.sum() < max(8, min(25, n * 0.16)):
        return None
    return dict(
        eave=float(eave),
        rise=float(rise),
        swapped=swapped,
        matched=inliers,
        support=float(support),
    )
