"""Fit sharp hipped roof planes directly to the 2015 survey, using roof identity from the state image."""

from pathlib import Path
import json
import numpy as np
from scipy.optimize import least_squares
from math import cos, sin
import argparse

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--cache", type=Path, required=True)
p = parser.parse_args().cache
q = np.load(p / "points.npz")["points"]
a = np.deg2rad(55)
co, si = np.cos(a), np.sin(a)
u = (q[:, 0] + 178) * co + (q[:, 1] + 336) * si
v = -(q[:, 0] + 178) * si + (q[:, 1] + 336) * co
towers = [
    ("Northwest crown", -13.2, -2.8, 26, 594.0, 596.53),
    ("Rear west", -19.0, 6.5, 26, 591.72, 594.36),
    ("Rear south", -9.9, 11.5, 26, 591.72, 594.36),
    ("West court tower", 1.3, -9.1, 0, 591.76, 594.18),
    ("Lawn court tower", 1.3, 3.0, 0, 591.76, 594.16),
    ("East court tower", 22.7, -7.1, 0, 591.76, 594.20),
    ("Lawn terrace tower", 22.5, 1.2, 0, 591.76, 594.20),
    ("Lake crown", 32.8, -3.8, 0, 594.35, 595.99),
]


def roof_fit(t):
    name, x, z, angle, eave, top = t
    win = (
        (np.abs(u - x) < 5.2)
        & (np.abs(v - z) < 5.2)
        & (q[:, 2] > eave + 0.20)
        & (q[:, 2] < top + 0.7)
        & (q[:, 4] == 1)
    )
    xx, zz, yy = u[win], v[win], q[win, 2]

    def residual(f):
        cx, cz, heading, halfU, halfV, ridge = f
        dx = xx - cx
        dz = zz - cz
        i = abs(cos(heading) * dx + sin(heading) * dz)
        j = abs(-sin(heading) * dx + cos(heading) * dz)
        return ridge - (ridge - eave) * np.maximum(i / halfU, j / halfV) - yy

    angle = np.deg2rad(angle)
    s = least_squares(
        residual,
        [x, z, angle, 4.2, 4.2, top],
        bounds=(
            [x - 1.6, z - 1.6, angle - 0.55, 2.2, 2.2, top - 0.8],
            [x + 1.6, z + 1.6, angle + 0.55, 5.4, 5.4, top + 0.8],
        ),
        loss="soft_l1",
        f_scale=0.065,
    )
    cx, cz, heading, hU, hV, ridge = s.x
    er = np.abs(residual(s.x))
    rec = dict(
        name=name,
        u=round(cx, 3),
        v=round(cz, 3),
        angle=round(heading, 5),
        width=round(2 * hU, 3),
        depth=round(2 * hV, 3),
        eave=eave,
        peak=round(ridge, 3),
        returnCount=len(er),
        medianError=round(float(np.median(er)), 3),
        p90=round(float(np.quantile(er, 0.9)), 3),
    )
    return rec


out = [roof_fit(t) for t in towers]
(p / "hip-fits.json").write_text(json.dumps(out, indent=2))
for data in out:
    print(data)
