"""Fetch the publicly released park vegetation classifications and NAIP spectra."""

from pathlib import Path
from argparse import ArgumentParser
import json
import requests
import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_origin
from pyproj import Transformer

ORIGIN = (268678, 4179436)
# Cover all four connected polygons of El Capitan Meadow and a small surrounding margin.
SITE = (-1520, 800, -480, 1360)
VEGETATION = "https://services2.arcgis.com/Uq9r85Potqm3MfRV/arcgis/rest/services/biosds200_fpu/FeatureServer/0"
NAIP = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
if __name__ == "__main__":
    p = ArgumentParser()
    p.add_argument("cache", type=Path)
    c = p.parse_args().cache
    c.mkdir(parents=True, exist_ok=True)
    x, y = ORIGIN
    l, t, r, b = SITE
    toGeo = Transformer.from_crs(32611, 4326, always_xy=True)
    bounds = toGeo.transform_bounds(x + l, y - b, x + r, y - t)
    q = dict(
        geometry=",".join(map(str, bounds)),
        geometryType="esriGeometryEnvelope",
        inSR=4326,
        spatialRel="esriSpatialRelIntersects",
        outFields="OBJECTID,MapCode,MapClass,SCI_NAME,DENSITY,MCVGroup,UID",
        returnGeometry="true",
        outSR=32611,
        f="json",
    )
    rsp = requests.get(VEGETATION + "/query", params=q, timeout=50)
    rsp.raise_for_status()
    vegetation = rsp.json()
    assert "features" in vegetation
    (c / "meadow-vegetation.json").write_text(
        json.dumps(vegetation, separators=(",", ":"))
    )
    rsp = requests.get(
        NAIP,
        params=dict(
            collections="naip",
            bbox=",".join(map(str, bounds)),
            datetime="2022-01-01T00:00:00Z/2022-12-31T23:59:59Z",
            limit=12,
        ),
        timeout=35,
    )
    rsp.raise_for_status()
    items = rsp.json()["features"]
    assert items
    step = 0.50
    aff = from_origin(x + l, y - t, step, step)
    ortho = np.zeros((4, round((b - t) / step), round((r - l) / step)), np.uint8)
    sources = []
    for item in items:
        href = item["assets"]["image"]["href"]
        sig = requests.get(
            "https://planetarycomputer.microsoft.com/api/sas/v1/sign",
            params={"href": href},
            timeout=25,
        )
        sig.raise_for_status()
        with rasterio.Env(
            GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MAX_RETRY="3"
        ):
            with rasterio.open("/vsicurl/" + sig.json()["href"]) as ds:
                for band in range(4):
                    reproject(
                        rasterio.band(ds, band + 1),
                        ortho[band],
                        src_transform=ds.transform,
                        src_crs=ds.crs,
                        dst_transform=aff,
                        dst_crs="EPSG:32611",
                        src_nodata=0,
                        dst_nodata=0,
                        init_dest_nodata=False,
                        resampling=Resampling.bilinear,
                    )
                resolution = abs(ds.transform.a)
        sources.append(
            dict(
                href=href,
                id=item["id"],
                date=item["properties"]["datetime"],
                nativeMetres=resolution,
            )
        )
    assert (ortho[:3].sum(axis=0) > 0).all()
    np.savez_compressed(
        c / "meadow-spectra.npz", image=ortho, bounds=SITE, nativeSamples=step
    )
    observed = dict(
        naip=sources,
        site=SITE,
        originUTM11N=ORIGIN,
        vegetation=VEGETATION,
        count=len(vegetation["features"]),
        report="https://www.nps.gov/yose/learn/nature/vegetation-map.htm",
    )
    (c / "meadow-inputs.json").write_text(json.dumps(observed, indent=2) + "\n")
    print(observed, flush=True)
