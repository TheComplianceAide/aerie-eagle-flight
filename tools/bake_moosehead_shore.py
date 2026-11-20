"""Rebuild the Moosehead bog and south-bank shoreline from Maine GeoLibrary's USDA NAIP 2018 near-infrared aerials.

Requires numpy, scipy, scikit-image, rasterio, pyproj and requests. The original map survey is part of the game.
Example: python tools/bake_moosehead_shore.py --cache /tmp/aerie-naip
"""

from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from pyproj import Transformer
from scipy.ndimage import gaussian_filter, map_coordinates, median_filter
from skimage.measure import approximate_polygon
import argparse
import tempfile
import time
import numpy as np, rasterio, requests, json

root = Path(__file__).resolve().parents[1] / "game"
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument(
    "--cache",
    type=Path,
    default=Path(tempfile.gettempdir()) / "aerie-moosehead-naip2018",
    help="Reusable directory for twelve official GeoTIFF tiles",
)
parser.add_argument("--output", type=Path, default=root / "moosehead-shore-survey.js")
parser.add_argument(
    "--stats", type=Path, help="Optional JSON of per-reach fit statistics"
)
args = parser.parse_args()
p = args.cache
p.mkdir(parents=True, exist_ok=True)
source = json.loads(
    (root / "atlas-moosehead-survey.js")
    .read_text()
    .splitlines()[1]
    .split("]=", 1)[1]
    .strip()
    .rstrip(";")
)
cx, cy = Transformer.from_crs(4326, 32619, always_xy=True).transform(-69.735, 45.692)
service = "https://gis.maine.gov/image/rest/services/NAIP/orthoNaip2018/ImageServer/exportImage"
x0, z0 = -1750, -2580
L = 1024
NX, NZ = 3, 4


def fetch(k):
    x = x0 + k % NX * L
    z = z0 + k // NX * L
    f = p / f"survey-shore-tile-{k}.tif"
    if not f.exists():
        params = dict(
            f="image",
            bbox=",".join(map(str, (cx + x, cy - z - L, cx + x + L, cy - z))),
            bboxSR="32619",
            imageSR="32619",
            size=f"{L},{L}",
            format="tiff",
            bandIds="0,1,2,3",
            pixelType="U8",
            interpolation="RSP_BilinearInterpolation",
        )
        for attempt in range(4):
            try:
                r = requests.get(service, params=params, timeout=120)
                r.raise_for_status()
                break
            except (requests.Timeout, requests.ConnectionError, requests.HTTPError):
                if attempt == 3:
                    raise
                time.sleep(2**attempt)
        if "image" not in r.headers.get("content-type", ""):
            raise ValueError(r.text[:256])
        temp = f.with_suffix(".tmp")
        temp.write_bytes(r.content)
        temp.rename(f)
    print("ready", k, f.stat().st_size, flush=True)
    with rasterio.open(f) as ds:
        # Wet open water absorbs near-infrared. Shadowed foliage still scatters it.
        nir = ds.read(4).astype("float32")
        blue = ds.read(3)
        return np.clip((nir - 13) * 0.046 + (nir - blue * 0.50) * 0.013, 0, 1)


with ThreadPoolExecutor(4) as ex:
    tiles = list(ex.map(fetch, range(NX * NZ)))
a = gaussian_filter(
    np.vstack([np.hstack(tiles[i : i + NX]) for i in range(0, len(tiles), NX)]), 1.05
).astype("float32")
dist = np.arange(-27, 27.25, 0.5)
del tiles
regions = []
stats = []
for rk, ring in enumerate([source["shore"], *source["shoreHoles"]]):
    r = np.array(ring, dtype=float)
    rr = np.roll(r, -1, 0)
    delta = rr - r
    length = np.linalg.norm(delta, axis=1)
    n = np.maximum(1, length)
    # Shore material and water must agree on which side is land, for exterior and islands.
    ccw = np.sign(np.sum(r[:, 0] * rr[:, 1] - rr[:, 0] * r[:, 1]))
    norm = np.c_[delta[:, 1], -delta[:, 0]] / n[:, None] * ccw * (1 if rk == 0 else -1)
    valid = (
        (r[:, 0] > x0 + 65)
        & (r[:, 0] < x0 + NX * L - 65)
        & (r[:, 1] > z0 + 65)
        & (r[:, 1] < z0 + NZ * L - 65)
    )
    use = valid & np.roll(valid, -1) & (length > 0)
    if not use.any():
        continue
    # Segment-run outputs use original start/end indices. Keep endpoints of each
    # run exactly anchored where the local orthophoto gives way to the base survey.
    ids = np.where(use)[0]
    runs = np.split(ids, np.flatnonzero(np.diff(ids) > 1) + 1)
    patches = []
    for run in runs:
        if len(run) == 0:
            continue
        points = []
        norms = []
        for i in run:
            steps = max(1, int(np.ceil(length[i] / 3)))
            for j in range(steps):
                points.append(r[i] + delta[i] * (j / steps))
                blend = min(0.5, 0.5 * (1 - j / steps) ** 3)
                normal = (1 - 2 * blend) * norm[i] + blend * (norm[i - 1] + norm[i])
                norms.append(normal / max(1e-6, np.linalg.norm(normal)))
        if len(points) < 5:
            continue
        end = (int(run[-1]) + 1) % len(r)
        points = np.array(points + [r[end]])
        norms = np.array(norms + [norm[int(run[-1])]])
        along = np.r_[0.0, np.cumsum(np.linalg.norm(np.diff(points, axis=0), axis=1))]
        coords = points[:, None, :] + dist[None, :, None] * norms[:, None, :]
        sample = map_coordinates(
            a,
            [coords[:, :, 1] - z0 - 0.5, coords[:, :, 0] - x0 - 0.5],
            order=1,
            mode="nearest",
        )
        # Require a sustained open-water to land transition, and favor the nearest
        # coherent edge in marshes where a second reed/forest edge can occur.
        candidates = np.arange(10, len(dist) - 11)
        wet = np.stack(
            [np.mean(sample[:, i - 9 : i - 2], axis=1) for i in candidates], axis=1
        )
        dry = np.stack(
            [np.mean(sample[:, i + 2 : i + 10], axis=1) for i in candidates], axis=1
        )
        cost = dry - wet - abs(dist[candidates]) * 0.003
        order = np.argmax(cost, axis=1)
        ri = np.arange(len(points))
        off = dist[candidates[order]].copy()
        credible = (
            (dry[ri, order] > 0.54)
            & (wet[ri, order] < 0.55)
            & (dry[ri, order] - wet[ri, order] > 0.37)
        )
        anchors = np.flatnonzero(credible)
        if len(anchors) < 4:
            continue
        interp = np.interp(along, along[anchors], off[anchors])
        nearest = np.searchsorted(along[anchors], along)
        distGood = np.minimum(
            np.abs(along - along[anchors[np.clip(nearest, 0, len(anchors) - 1)]]),
            np.abs(along - along[anchors[np.clip(nearest - 1, 0, len(anchors) - 1)]]),
        )
        off = median_filter(interp, 3) * np.clip(1 - distGood / 24, 0, 1)
        off = gaussian_filter(off, 0.74)
        # Fade the first/last ten metres into the measured input polygon.
        off *= np.minimum(1, np.minimum(along, along[-1] - along) / 12)
        xy = points + off[:, None] * norms
        simplified = approximate_polygon(xy, tolerance=0.52)
        if len(simplified) < 3:
            continue
        xz = np.rint(simplified[1:-1] * 10).astype(int).flatten().tolist()
        patches.append([int(run[0]), int(run[-1]) + 1, xz])
        stats.append(
            [
                rk,
                int(run[0]),
                int(run[-1]) + 1,
                len(points),
                len(simplified),
                round(float(np.max(np.abs(off))), 2),
                round(float(credible.mean()), 3),
            ]
        )
    if patches:
        regions.append([rk, patches])
dest = args.output
text = (
    """// Central Moosehead shoreline traced from Maine GeoLibrary's USDA NAIP 2018
// near-infrared imagery in EPSG:32619. Points are decimetres east/south of
// the local map origin. Each run preserves its two original chart endpoints.
// https://gis.maine.gov/image/rest/services/NAIP/orthoNaip2018/ImageServer
window.refineMooseheadShore=survey=>{
  if(survey.reedShoreMapped)return;
  for(const [island,runs] of shoreline()){
    const ring=island?survey.shoreHoles[island-1]:survey.shore;
    for(let i=runs.length-1;i>=0;i--){
      const [first,end,coords]=runs[i],points=[];
      for(let k=0;k<coords.length;k+=2)points.push([coords[k]/10,coords[k+1]/10]);
      ring.splice(first+1,end-first-1,...points);
    }
  }
  survey.reedShoreMapped=true;
  function shoreline(){return """
    + json.dumps(regions, separators=(",", ":"))
    + """;}
};
"""
)
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(text)
if args.stats:
    args.stats.write_text(json.dumps(stats))
print(
    "wrote",
    len(regions),
    "rings",
    len(stats),
    "runs",
    sum(len(p[2]) // 2 for _, rs in regions for p in rs),
    dest.stat().st_size,
    flush=True,
)
