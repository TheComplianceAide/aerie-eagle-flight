"""Acquire Steep Creek source crops from the 2013 Juneau and 2023 USGS surveys.

Use the optional --vectors-only flag to refresh the catalog geometry alone.
"""

from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import sys
import requests

HERE = Path(__file__).resolve().parent
TRAIL = "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_TrailNFSPublish_01/MapServer/0/query"
AWC = "https://gis.adfg.alaska.gov/mapping/rest/services/sf_public/AWC_2026/MapServer"
ORIGIN = (526511, 6477009)


def features(url, **params):
    response = requests.get(
        url,
        params=dict(
            f="json", outFields="*", returnGeometry="true", outSR=32608, **params
        ),
        timeout=(10, 60),
    )
    response.raise_for_status()
    data = response.json()
    if "error" in data or not data.get("features"):
        raise ValueError(f"No matching features at {response.url}: {str(data)[:200]}")
    return data


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("cache", type=Path)
    parser.add_argument("--vectors-only", action="store_true")
    args = parser.parse_args()
    cache = args.cache
    cache.mkdir(parents=True, exist_ok=True)
    trail = features(
        TRAIL,
        where="TRAIL_NO='33744'",
        geometry="-134.58,58.41,-134.535,58.432",
        geometryType="esriGeometryEnvelope",
        inSR=4326,
        spatialRel="esriSpatialRelIntersects",
    )
    route = next(
        f
        for f in trail["features"]
        if f["attributes"]["trail_name"].upper() == "STEEP CREEK TRAIL"
    )
    local = [
        [round(x - ORIGIN[0], 1), round(ORIGIN[1] - y, 1)]
        for x, y in route["geometry"]["paths"][0]
    ]
    (cache / "boardwalk.json").write_text(json.dumps(local))
    for layer in (10, 12):
        data = features(f"{AWC}/{layer}/query", where="AWC_CODE='111-50-10500-2006'")
        (cache / f"awc-{layer}.json").write_text(json.dumps(data))
    if args.vectors_only:
        return
    sources = json.loads((HERE / "sources.json").read_text())
    for crop, download, receipt, id_key, source_key in [
        (
            "steep-d22-ground.npz",
            "fetch_surface.py",
            "steep-surface-sources.json",
            "terrain_2023",
            "source",
        ),
        (
            "steep-returns.npz",
            "fetch_returns.py",
            "steep-lidar-sources.json",
            "point_cloud_2013",
            "url",
        ),
    ]:
        if not (cache / crop).is_file() or not (cache / receipt).is_file():
            subprocess.run(
                [sys.executable, str(HERE / download), str(cache)], check=True
            )
        expected = {r[source_key]: r["sha256"] for r in sources[id_key]["tiles"]}
        got = {
            r[source_key]: r["sha256"]
            for r in json.loads((cache / receipt).read_text())
        }
        if expected != got:
            raise ValueError(
                f"{receipt} does not match the recorded public archive checksums"
            )
        hashed = hashlib.sha256((cache / crop).read_bytes()).hexdigest()
        print(crop, hashed)


if __name__ == "__main__":
    main()
