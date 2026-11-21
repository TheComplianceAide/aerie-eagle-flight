"""Join measured granite bulkheads to the dry side of each lake chart."""

import json
from pathlib import Path
import numpy as np
from scipy.spatial import cKDTree
from shapely.geometry import LinearRing, LineString

SOURCE = Path(__file__).resolve().parents[1] / "town-docks" / "quays.json"


def fit_quay(site, rings, changes):
    if site not in ("wolfeboro", "hesky"):
        return
    points = np.asarray(json.loads(SOURCE.read_text())[site])
    return apply_one(rings, changes, points)


def apply_one(rings, changes, points):
    best = None
    for k, r in enumerate(changes):
        if r["ring"] or r["closed"]:
            continue
        a = np.array(
            [
                r["start"],
                *(np.asarray(r["points"]).reshape(-1, 2) / 5).tolist(),
                r["end"],
            ]
        )
        dist, idx = cKDTree(a).query([points[0], points[-1]])
        if max(dist) > 40 or idx[0] == idx[1]:
            continue
        if best is None or sum(dist) < best[0]:
            best = (sum(dist), k, a, idx)
    if not best:
        raise Exception("No fit anchors")
    _, k, a, idx = best
    i, j = idx
    pts = points
    if i > j:
        i, j = j, i
        pts = points[::-1]
    # Keep the run's original endpoints. They are stable chart coordinates
    # used by aircraft, shoreline particles and the visible water triangles.
    merged = np.vstack([a[: max(1, i)], pts, a[min(j + 1, len(a) - 1) :]])
    r = changes[k]
    minseg = np.hypot(*(np.diff(merged, axis=0).T))
    merged = merged[np.r_[True, minseg > 0.22]]
    r["points"] = np.rint(merged[1:-1] * 5).astype(int).ravel().tolist()
    ring = rings[r["ring"]]
    p = np.where(np.all(ring == r["start"], axis=1))[0][0]
    q = np.where(np.all(ring == r["end"], axis=1))[0][0]
    adjusted = (
        np.vstack([ring[:p], merged, ring[q + 1 :]])
        if p < q
        else np.vstack([ring[q : p + 1], merged[1:-1]])
    )
    assert LinearRing(adjusted).is_simple, (k, i, j, len(ring), len(adjusted))
    rings[r["ring"]] = adjusted
    return {
        "chartJoin": r["start"],
        "chartEnd": r["end"],
        "newCopingVertices": len(points),
        "surveyedMetres": LineString(points).length,
    }
