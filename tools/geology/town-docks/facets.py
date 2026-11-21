"""Fit roof planes between ridge and annex breaks visible on the municipal ortho."""

import numpy as np
from scipy import ndimage as nd


def clean_planes(key, x, z, inside, observed, field):
    if key not in ("73223,-2801", "72894,-2358", "73586,-2787"):
        return field
    if key == "73223,-2801":
        # Avery's cornice hides a shallow membrane roof, with a single compact
        # rooftop air handler. Low returns at the gutter belong to the wall.
        parts = np.zeros_like(x, dtype=int)
        margin = 2.2
    elif key == "72894,-2358":
        # The west wing and north service extension are lower than the two
        # intersecting slopes over the dining room.
        parts = np.where(
            x < 7285.2, 0, np.where(z < -238.9, 1, np.where(z < -232.65, 2, 3))
        )
        margin = 0.95
    else:
        # Main gable opens toward the lake, with a lower, stepped east annex.
        parts = np.where(
            x < 7349.7, 0, np.where(x < 7356.6, 1, np.where(x < 7364.65, 2, 3))
        )
        margin = 1.05

    ground_truth = inside & (nd.distance_transform_edt(inside) > margin)
    result = field.copy()
    for idx in np.unique(parts):
        target = parts == idx
        good = ground_truth & target & np.isfinite(observed) & (observed > 1.9)
        if good.sum() < 8:
            continue
        x0, z0 = np.mean(x[good]), np.mean(z[good])
        A = np.stack([x - x0, z - z0, np.ones_like(z)], axis=-1)
        design, levels = A[good], observed[good]
        weights = np.ones(len(levels))
        for _ in range(5):
            co, *_ = np.linalg.lstsq(
                design * weights[:, None], levels * weights, rcond=None
            )
            residual = np.abs(design @ co - levels)
            weights = np.minimum(1, 0.26 / np.maximum(residual, 0.01))
        plane = A @ co
        result[target] = plane[target]
    return result
