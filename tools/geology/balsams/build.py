"""Rebuild the Balsams materials and two grounds surveys. Requires numpy, scipy,
Pillow, requests, rasterio, shapely, scikit-image, pyproj and laspy[lazrs]."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from itertools import product
from pathlib import Path
import io
import json
import subprocess
import sys

import laspy
import numpy as np
from pyproj import Transformer
import requests
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--cache", type=Path, required=True)
parser.add_argument(
    "--game", type=Path, default=Path(__file__).resolve().parents[3] / "game"
)
parser.add_argument(
    "--boards",
    type=Path,
    help="Location of building-boards.webp when rebuilding outside a full game checkout",
)
parser.add_argument(
    "--survey",
    type=Path,
    help="Location of atlas-dixville-survey.js when writing to an empty output folder",
)
args = parser.parse_args()
args.cache.mkdir(parents=True, exist_ok=True)
args.game.mkdir(parents=True, exist_ok=True)
ORTHO = "https://granit24a.sr.unh.edu/image/rest/services/ImageServices/NH_2021_2022_6in_RGB/ImageServer"
HEIGHT = (
    "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer"
)
LAS = "https://s3-us-west-2.amazonaws.com/usgs-lidar-public/USGS_LPC_CT_River_Lot6_Winnipesaulee_2015_LAS_2017/"
EAST, NORTH = 318030, 4970779
fields = {
    "park": ((-380, -432, -68, -172), (-380, -432, -68, -175)),
    "hale": ((-68, -304, 112, -179), (-64, -288, 80, -179)),
}
forward = Transformer.from_crs(32619, 3857, always_xy=True)
back = Transformer.from_crs(3857, 32619, always_xy=True)


def content(url, params=None):
    for attempt in range(3):
        try:
            response = requests.get(url, params=params, timeout=60)
            response.raise_for_status()
            return response.content
        except requests.RequestException:
            if attempt == 2:
                raise


def raster(name, rect, photo):
    x, z, r, b = rect
    filename = args.cache / (name + ("-ortho.jpg" if photo else "-terrain.tiff"))
    if filename.exists():
        return
    step = 0.1524 if photo else 1
    params = dict(
        f="image",
        bbox=f"{EAST + x},{NORTH - b},{EAST + r},{NORTH - z}",
        bboxSR=32619,
        imageSR=32619,
        size=f"{round((r - x) / step)},{round((b - z) / step)}",
        format="jpg" if photo else "tiff",
    )
    if photo:
        params["compressionQuality"] = 97
    else:
        params.update(pixelType="F32", renderingRule='{"rasterFunction":"None"}')
    data = content((ORTHO if photo else HEIGHT) + "/exportImage", params)
    with Image.open(io.BytesIO(data)) as img:
        img.verify()
    filename.write_bytes(data)


def point_cloud(name, rect):
    filename = args.cache / (name + ".npz")
    if filename.exists():
        return
    x, z, r, b = rect
    info = json.loads(content(LAS + "ept.json"))
    low = np.array(info["bounds"][:3])
    span = np.array(info["bounds"][3:]) - low
    xy = np.array(
        [forward.transform(EAST + i, NORTH - j) for i, j in product([x, r], [z, b])]
    )
    minimum = np.r_[xy.min(0), 508]
    maximum = np.r_[xy.max(0), 687]
    nodes = {}

    def inspect(key):
        for child, count in json.loads(
            content(LAS + "ept-hierarchy/" + key + ".json")
        ).items():
            level, i, j, k = map(int, child.split("-"))
            size = span / 2**level
            corner = low + size * [i, j, k]
            if np.any(maximum < corner) or np.any(minimum > corner + size):
                continue
            if count == -1 and child != key:
                inspect(child)
            elif count > 0:
                nodes[child] = count

    inspect("0-0-0-0")

    def extract(key):
        las = laspy.read(io.BytesIO(content(LAS + "ept-data/" + key + ".laz")))
        e, n = back.transform(np.asarray(las.x), np.asarray(las.y))
        cx = e - EAST
        cz = NORTH - n
        use = (
            (cx >= x)
            & (cx <= r)
            & (cz >= z)
            & (cz <= b)
            & ~np.asarray(las.withheld, bool)
        )
        return np.column_stack(
            [
                cx[use],
                cz[use],
                np.asarray(las.z)[use],
                las.classification[use],
                las.return_number[use],
                las.number_of_returns[use],
                las.intensity[use],
            ]
        ).astype("f4")

    with ThreadPoolExecutor(4) as pool:
        parts = list(pool.map(extract, sorted(nodes)))
    np.savez_compressed(filename, points=np.vstack(parts))


for name, (rect, clip) in fields.items():
    raster(name, rect, True)
    raster(name, rect, False)
    point_cloud(name + "-points", clip)
point_cloud("points", (-367, -455, -116, -270))
common = ["--cache", str(args.cache), "--game", str(args.game)]
here = Path(__file__).parent
for tool, params in [
    ("materials.py", common),
    ("hale.py", common + (["--boards", str(args.boards)] if args.boards else [])),
    (
        "park.py",
        common
        + ["--survey", str(args.survey or args.game / "atlas-dixville-survey.js")],
    ),
    ("hale_grounds.py", common),
    ("fit_roof.py", ["--cache", str(args.cache)]),
]:
    subprocess.run([sys.executable, str(here / tool), *params], check=True)
