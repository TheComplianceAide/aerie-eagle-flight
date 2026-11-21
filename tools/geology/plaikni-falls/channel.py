"""Register the local Plaikni crest and receiving ledge to September 2022 NAIP."""

from argparse import ArgumentParser
from pathlib import Path
import json, re
import numpy as np
from scipy.ndimage import label

if __name__ == "__main__":
    p = ArgumentParser()
    p.add_argument("cache", type=Path)
    p.add_argument("game", type=Path)
    args = p.parse_args()
    site = json.loads(Path(__file__).with_name("site.json").read_text())
    img = np.load(args.cache / "plaikni-naip.npz")["color"].astype("f")
    r, g, b, n = img
    rr, cc = np.indices(r.shape)
    x = 6009 + (cc + 0.5) * 0.5
    z = 3852 + (rr + 0.5) * 0.5
    # The crown-free source exposure retains the bright aerated snowmelt
    # against dark andesite. Select the connected sheet on the actual scarp.
    candidates = (
        (abs(x - 6163) < 5.4)
        & (abs(z - 4013) < 3.2)
        & (b > 145)
        & (g > 150)
        & (r > 130)
        & ((n - r) / np.maximum(1, n + r) < 0.13)
    )
    component, total = label(candidates)
    sizes = np.bincount(component[candidates])
    dominant = 1 + np.argmax(sizes[1:])
    inside = component == dominant
    rows = np.unique(z[inside])
    center = []
    for zz in rows:
        xx = x[inside & (z == zz)]
        center.append([round(float(np.median(xx)), 2), float(zz)])
    trace = [
        [6148.8, 4002],
        [6152.1, 4005.3],
        [6155.9, 4007.7],
        [6158.8, 4009.4],
        *center,
        [6165.3, 4017.9],
        [6166.5, 4020],
        [6169, 4022],
    ]
    rail = (
        [p for p in site["rail"] if p[1] < 4002]
        + trace
        + [p for p in site["rail"] if p[1] > 4022]
    )
    channel = (
        [p for p in site["channel"] if p[1] < 4002]
        + trace
        + [p for p in site["channel"] if p[1] > 4022]
    )
    line = lambda a: json.dumps(a, separators=(",", ":"))
    replacement = (
        "crater:{channel:"
        + line(channel)
        + ",foot:"
        + line(center[-1])
        + ',name:"Plaikni Falls",width:3.3,rail:'
        + line(rail)
        + "}"
    )
    out = args.game / "regional-waterfalls.js"
    s = out.read_text()
    s, n = re.subn(
        r'crater:\{channel:\[\[.*?\]\],foot:\[.*?\],name:"Plaikni Falls",width:[\d.]+,rail:\[\[.*?\]\]\}',
        replacement,
        s,
    )
    assert n == 1
    out.write_text(s)
    receipt = dict(
        observedCells=int(np.count_nonzero(inside)),
        observedCenters=center,
        feature="Connected bright water across registered 2022 aerial, at 0.5 m resampling. Upstream transition and foot reconnection inferred from existing 3DEP channel.",
    )
    (args.cache / "plaikni-flow.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(receipt)
