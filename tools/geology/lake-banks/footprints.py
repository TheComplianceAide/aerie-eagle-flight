"""Select the six study rectangles from Microsoft's ODbL footprint release."""

from pathlib import Path
import io, json, zipfile, tempfile, hashlib
import requests
from pyproj import Transformer
from sources import sites, origins
import argparse

utm = Transformer.from_crs(4326, 32619, always_xy=True)
inverse = Transformer.from_crs(32619, 4326, always_xy=True)


def features(stream):
    decoder = json.JSONDecoder()
    fd = io.TextIOWrapper(stream, encoding="utf-8-sig")
    data = fd.read(65536)
    data = data[data.index("[", data.index('"features"')) + 1 :]
    while True:
        data = data.lstrip(" \r\n\t,")
        if data.startswith("]"):
            break
        try:
            v, k = decoder.raw_decode(data)
        except json.JSONDecodeError:
            chunk = fd.read(65536)
            if not chunk:
                raise
            data += chunk
            continue
        yield v
        data = data[k:]


def select(w, state, out):
    url = (
        "https://minedbuildings.z5.web.core.windows.net/legacy/usbuildings-v2/"
        + state
        + ".geojson.zip"
    )
    boxes = {
        k: [
            *inverse.transform(origins[w][0] + x - h, origins[w][1] - z - h),
            *inverse.transform(origins[w][0] + x + h, origins[w][1] - z + h),
        ]
        for k, (world, x, z, h) in sites.items()
        if w == world
    }
    selected = {k: [] for k in boxes}
    sha = hashlib.sha256()
    with tempfile.TemporaryFile() as tmp:
        with requests.get(url, stream=True, timeout=90) as r:
            r.raise_for_status()
            for chunk in r.iter_content(1 << 20):
                tmp.write(chunk)
                sha.update(chunk)
        with (
            zipfile.ZipFile(tmp) as arc,
            arc.open(
                next(n for n in arc.namelist() if n.lower().endswith(".geojson"))
            ) as f,
        ):
            for feature in features(f):
                g = feature["geometry"]
                poly = g["coordinates"][0]
                lon, lat = poly[0]
                for name, (a, b, c, d) in boxes.items():
                    if a <= lon <= c and b <= lat <= d:
                        xy = [utm.transform(*pt) for pt in poly]
                        selected[name].append(
                            [
                                [
                                    round(ex - origins[w][0], 2),
                                    round(origins[w][1] - n, 2),
                                ]
                                for ex, n in xy
                            ]
                        )
    for k, rows in selected.items():
        print(k, len(rows), flush=True)
        (out / (k + "-footprints.json")).write_text(
            json.dumps(
                dict(
                    credit="Microsoft Maps, Open Database License 1.0",
                    url=url,
                    source_sha256=sha.hexdigest(),
                    polygons=rows,
                ),
                separators=(",", ":"),
            )
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", required=True, type=Path)
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    select("winnipesaukee", "NewHampshire", args.cache)
    select("moosehead", "Maine", args.cache)
