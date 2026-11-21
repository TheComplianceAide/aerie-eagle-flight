"""Bake both Lake Winnipesaukee municipal landings from their registered source data."""

import argparse
import hashlib
import json
import sys
from pathlib import Path

import requests
from frontages import bake_frontages
from roofs import roof_scans
from streets import bake_streets

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "lake-banks"))
from sources import sites


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--cache", required=True, type=Path, help="Prepared lake-banks lidar cache"
    )
    parser.add_argument("--photos", type=Path, help="Input photograph directory")
    parser.add_argument("--game", type=Path, default=HERE.parents[2] / "game")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    directory = args.output or args.game
    directory.mkdir(parents=True, exist_ok=True)
    photo_dir = args.photos or args.cache / "town-docks"
    photo_dir.mkdir(parents=True, exist_ok=True)
    refs = json.loads((HERE / "sources.json").read_text())
    for file, row in refs.items():
        frame = photo_dir / file
        if not frame.exists():
            response = requests.get(
                row["source"], timeout=110, headers={"User-Agent": "Aerie-Scenery/1.0"}
            )
            response.raise_for_status()
            if hashlib.sha256(response.content).hexdigest() != row["sha256"]:
                raise ValueError(f"Upstream photograph changed: {file}")
            frame.write_bytes(response.content)
        if hashlib.sha256(frame.read_bytes()).hexdigest() != row["sha256"]:
            raise ValueError(f"Photograph does not match surveyed revision: {file}")
    source = (args.game / "lake-habitat-winnipesaukee.js").read_text()
    lake = json.JSONDecoder().raw_decode(
        source.split('window.aerieLakeHabitatData["winnipesaukee"]=')[1]
    )[0]
    features = json.loads((HERE / "piers.json").read_text())
    features["wolfeboro"]["roofScans"] = roof_scans(
        sites, args.cache, lake["wolfeboro"]["buildings"]
    )
    bake_frontages(photo_dir, directory, refs)
    bake_streets(photo_dir, directory, features)
    filename = directory / "winnipesaukee-town-docks-data.js"
    filename.write_text(
        "// Surveyed waterfronts, recorded roof heights and dock axes, in local east/south metres.\n"
        "window.winniTownDocks=" + json.dumps(features, separators=(",", ":")) + ";\n"
    )


if __name__ == "__main__":
    main()
