"""Pack USGS LANDFIRE 2025 EVT and EVC exports in the Firehole UTM grid."""

import argparse
import csv
from pathlib import Path

from PIL import Image


def plant_form(code):
    if code == 7011:
        return 3  # Aspen
    if code in (7055, 7056):
        return 2  # Spruce-fir
    if code == 7166:
        return 4  # Douglas-fir
    if code in (9019, 9022):
        return 5  # Riparian broadleaf
    if code in (7046, 7049, 7057):
        return 6  # Open subalpine pine
    return 1  # Lodgepole-dominant woodland


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("evt", type=Path)
    parser.add_argument("evc", type=Path)
    parser.add_argument("classes", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    sources = [Image.open(path) for path in (args.evt, args.evc)]
    if any(image.size != (400, 600) or image.mode not in ("I;16", "I") for image in sources):
        raise ValueError("Both LANDFIRE exports must be raw 400 × 600 categorical grids")
    with args.classes.open(encoding="utf-8-sig") as table:
        rows = {int(row["VALUE"]): row for row in csv.DictReader(table) if row["VALUE"].isdigit()}
    classes = {"Tree": 1, "Shrub": 2, "Herb": 3, "Agriculture": 4, "Developed": 5, "Sparse": 6,
               "Snow-Ice": 7, "Water": 8}
    marsh = {9011, 9017, 9829}
    packed = bytearray()
    for code, cover in zip(sources[0].getdata(), sources[1].getdata()):
        kind = 9 if code in marsh else classes.get(rows[code]["EVT_LF"], 0)
        packed.extend((kind, plant_form(code) if kind == 1 else 0, min(100, cover % 100) if cover >= 100 else 0))
    args.output.write_bytes(packed)


if __name__ == "__main__":
    main()
