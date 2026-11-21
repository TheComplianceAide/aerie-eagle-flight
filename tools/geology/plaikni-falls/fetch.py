"""Download the NPS Plaikni field plate and a registered NAIP red-NIR window."""

import argparse, hashlib, json
from pathlib import Path
from urllib.request import urlopen
import numpy as np
import rasterio
from rasterio.transform import from_origin
from rasterio.warp import reproject, Resampling
import requests

REPORT = "https://irma.nps.gov/DataStore/FileSource/Get/2299081?filename=2022+CRLA+Rehabiltiate+Plaikni+Falls+Trail+Landscape+Annual+Report.pdf"
ORIGIN = (571464, 4755190)
BOUNDS = (6009, 3852, 6301, 4144)

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("cache", type=Path)
    dest = p.parse_args().cache
    dest.mkdir(exist_ok=True, parents=True)
    report = dest / "plaikni-nps-2022.pdf"
    if not report.exists():
        with urlopen(REPORT, timeout=45) as reply:
            report.write_bytes(reply.read())
    q = {
        "collections": "naip",
        "bbox": "-122.051,42.907,-122.047,42.911",
        "datetime": "2022-01-01T00:00:00Z/2022-12-31T23:59:59Z",
        "limit": 12,
    }
    api = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
    lookup = requests.get(api, params=q, timeout=25)
    lookup.raise_for_status()
    im = np.zeros((4, 584, 584), "u1")
    tiles = []
    left, top, right, bottom = BOUNDS
    x, y = ORIGIN
    aff = from_origin(x + left, y - top, 0.5, 0.5)
    for item in sorted(lookup.json()["features"], key=lambda r: r["id"]):
        href = item["assets"]["image"]["href"]
        sign = requests.get(
            "https://planetarycomputer.microsoft.com/api/sas/v1/sign",
            params={"href": href},
            timeout=20,
        )
        sign.raise_for_status()
        with rasterio.Env(
            GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MAX_RETRY="3"
        ):
            with rasterio.open("/vsicurl/" + sign.json()["href"]) as ds:
                for i in range(4):
                    reproject(
                        rasterio.band(ds, i + 1),
                        im[i],
                        src_transform=ds.transform,
                        src_crs=ds.crs,
                        dst_transform=aff,
                        dst_crs="EPSG:32610",
                        src_nodata=0,
                        dst_nodata=0,
                        init_dest_nodata=False,
                        resampling=Resampling.bilinear,
                    )
        tiles.append(
            dict(
                id=item["id"],
                acquired=item["properties"]["datetime"],
                href=href,
                sourceResolution=abs(ds.transform.a),
            )
        )
    assert np.count_nonzero(im[0]) > 0.985 * im[0].size
    np.savez_compressed(dest / "plaikni-naip.npz", color=im, bounds=BOUNDS)
    (dest / "plaikni-inputs.json").write_text(
        json.dumps(
            dict(
                report=REPORT,
                reportSHA256=hashlib.sha256(report.read_bytes()).hexdigest(),
                credits="Carrie Wyler / National Park Service, 2022. NPS Crater Lake field photograph.",
                tiles=tiles,
                orthoGridMeters=0.5,
                crs=32610,
            ),
            indent=2,
        )
        + "\n"
    )
    print(tiles)
