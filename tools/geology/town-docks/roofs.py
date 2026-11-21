"""Survey the commercial roof blocks under the Wolfeboro facade photograph."""

import base64
import math
import numpy as np
from scipy import ndimage as nd
from scipy.spatial import Delaunay
from shapely.geometry import Polygon
from shapely import contains_xy
from facets import clean_planes


def encode(v):
    return base64.b64encode(v.tobytes()).decode()


def roof_scans(sites, cache, buildings):
    _, cx, cz, half = sites["wolfeboro"]
    left = cx - half
    top = cz - half
    d = np.load(cache / "wolfeboro-ept.npz")
    late = np.load(cache / "wolfeboro-last-ept.npz")["roof"]
    first = d["roof"]
    ground = d["floor"]
    iy, ix = nd.distance_transform_edt(
        ground == -32768, return_distances=False, return_indices=True
    )
    floor = nd.gaussian_filter(ground[iy, ix].astype("f4") * 0.05, 0.9)
    bs = buildings
    scans = {}
    for roof in bs:
        poly = Polygon(roof["p"])
        x, z = roof["center"]
        minx, minz, maxx, maxz = poly.bounds
        if not (7225 <= minx and -350 <= minz and maxx <= 7429.8 and maxz <= -196.4):
            continue
        u0, v0 = int(math.floor(minx)) - 2, int(math.floor(minz)) - 2
        u1, v1 = int(math.ceil(maxx)) + 2, int(math.ceil(maxz)) + 2
        yy, xx = np.indices((v1 - v0 + 1, u1 - u0 + 1))
        sx = xx + u0 + 0.5
        sz = yy + v0 + 0.5
        gx = sx.astype(int) if u0 >= 0 else np.floor(sx).astype(int)
        gz = np.floor(sz).astype(int)
        ground = floor[gz - top, gx - left]
        firstField = first[gz - top, gx - left].astype("f4") * 0.05
        lastField = late[gz - top, gx - left].astype("f4") * 0.05
        within = contains_xy(poly, sx, sz)
        local = float(np.percentile(ground[within], 80))
        observed = firstField - local
        last = lastField - local
        # Prefer the lower of the two non-ground returns under a branch, retaining
        # the upper hit when the last echo was on the ground or behind a porch.
        base = np.where((last > 1.65) & (last < 23), last, observed)
        valid = within & (base > 1.65) & (base < 22)
        if valid.sum() < max(20, within.sum() * 0.58):
            continue
        iy, ix = nd.distance_transform_edt(
            ~valid, return_distances=False, return_indices=True
        )
        filled = base[iy, ix]
        median = nd.median_filter(filled, 3)
        clean = valid & (abs(filled - median) < 2.3)
        iy, ix = nd.distance_transform_edt(
            ~clean, return_distances=False, return_indices=True
        )
        field = nd.gaussian_filter(base[iy, ix], 0.46)
        key = str(round(x * 10)) + "," + str(round(z * 10))
        field = clean_planes(key, sx, sz, within, base, field)
        coords = []
        step = 1.4
        for a, b in zip(roof["p"], roof["p"][1:] + roof["p"][:1]):
            a = np.array(a)
            b = np.array(b)
            n = max(1, math.ceil(np.linalg.norm(b - a) / step))
            coords.extend((a + (b - a) * k / n).tolist() for k in range(n))
        xx, zz = np.meshgrid(
            np.arange(u0, u1 + 0.01, step), np.arange(v0, v1 + 0.01, step)
        )
        mask = contains_xy(poly.buffer(-0.45), xx, zz)
        coords.extend(np.c_[xx[mask], zz[mask]].tolist())
        coords = np.array(coords)
        tris = Delaunay(coords).simplices
        inside = poly.buffer(0.012)
        tris = np.array(
            [s for s in tris if inside.covers(Polygon(coords[s]))], dtype="<u2"
        )
        vals = nd.map_coordinates(
            field,
            [(coords[:, 1] - v0 - 0.5), (coords[:, 0] - u0 - 0.5)],
            order=1,
            mode="nearest",
        )
        verts = np.c_[
            np.rint((coords[:, 0] - u0) * 50),
            np.rint(100 * vals),
            np.rint((coords[:, 1] - v0) * 50),
        ].astype("<i2")
        key = str(round(x * 10)) + "," + str(round(z * 10))
        scans[key] = dict(
            origin=[u0 + 0.5, v0 + 0.5],
            size=[field.shape[1], field.shape[0]],
            grid=encode(np.rint(field * 100).astype("<i2")),
            vertices=encode(verts),
            triangles=encode(tris),
        )
        print(
            key,
            len(tris),
            "triangles; eave/ridge field",
            round(np.min(vals), 1),
            round(np.max(vals), 1),
            flush=True,
        )
    return scans
