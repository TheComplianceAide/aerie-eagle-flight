"""Project the frozen OSM Hamnøy footprint extract into the game's local frame."""
import argparse
import gzip
import json
import math
from pathlib import Path
from xml.etree import ElementTree as ET

from pyproj import Transformer
from shapely.geometry import Polygon

HERE = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--source", type=Path, default=HERE / "source/hamnoy-footprints.osm.gz")
parser.add_argument("--game-file", type=Path, default=HERE.parents[2] / "game/lofoten-hamnoy.js")
parser.add_argument("--output", type=Path, help="Output JS file. Defaults to --game-file.")
args = parser.parse_args()
with gzip.open(args.source) as file:
    root = ET.parse(file).getroot()
project = Transformer.from_crs(4326, 32633, always_xy=True)
origin_x, origin_y = project.transform(13.038, 67.972)
nodes = {}
for node in root.findall("node"):
    east, north = project.transform(float(node.get("lon")), float(node.get("lat")))
    nodes[node.get("id")] = (east - origin_x, origin_y - north)

buildings = []
roads = []
crossing = None
uses = {"cabin":"c", "house":"h", "residential":"h", "garage":"g", "garages":"g",
        "warehouse":"w", "industrial":"w", "retail":"h", "hotel":"c"}
for way in root.findall("way"):
    tags = {entry.get("k"):entry.get("v") for entry in way.findall("tag")}
    points = [nodes[node.get("ref")] for node in way.findall("nd")]
    if tags.get("highway") == "trunk":
        line = [[round(x,1), round(z,1)] for x,z in points]
        if way.get("id") == "75118310":
            crossing = line
        else:
            roads.append(line)
    if "building" in tags:
        rectangle = Polygon(points).minimum_rotated_rectangle
        x, z = rectangle.centroid.coords[0]
        corners = list(rectangle.exterior.coords)
        edges = [(corners[i+1][0]-corners[i][0], corners[i+1][1]-corners[i][1]) for i in (0,1)]
        edges.sort(key=lambda edge:-math.hypot(*edge))
        dx, dz = edges[0]
        row = [round(x,1), round(z,1), round(math.hypot(*edges[0]),1), round(math.hypot(*edges[1]),1),
               round(math.atan2(dz,dx),4), uses.get(tags["building"],"u")]
        buildings.append((int(way.get("id")),row))
if crossing is None or not roads or not buildings:
    raise ValueError("Incomplete Hamnøy extract")
encode = lambda value: json.dumps(value,separators=(",",":"))
prefix = args.game_file.read_text()
start = prefix.index("  const buildings=")
end = prefix.index("  window.addHamnoyHarbor=",start)
rows = ",\n    ".join(encode(row) for _,row in sorted(buildings))
table = f"  const buildings=[\n    {rows}\n  ];\n  const crossing={encode(crossing)};\n  const approaches={encode(roads)};\n\n"
(args.output or args.game_file).write_text(prefix[:start]+table+prefix[end:])
print(f"Wrote {len(buildings)} building axes, {len(crossing)} bridge stations and {len(roads)} road approaches")
