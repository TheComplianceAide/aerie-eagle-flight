"""Fetch USGS terrain and NPS/C. Jacoby's original public reference."""

import argparse, json, hashlib, re
from pathlib import Path
from urllib.parse import urljoin
import requests, rasterio
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_origin
from PIL import Image


def main():
    p = argparse.ArgumentParser()
    p.add_argument("cache", type=Path)
    cache = p.parse_args().cache
    # Eight-meter projected DEM centered on pixel coordinates. Covers both
    # side walls, the distant Half Dome ridge and the intervening Cathedral Rocks.
    left, top, right, bottom = -5000, -6400, 15200, 5200
    cx, cy = 268678, 4179436
    # Windowed range reads from the 1/3 arcsecond 3DEP COG avoid the dynamic
    # ImageServer's export timeout and a download of the whole one-degree tile.
    cog = "https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/13/TIFF/current/n38w120/USGS_13_n38w120.tif"
    profile = dict(
        driver="GTiff",
        width=(right - left) // 8 + 1,
        height=(bottom - top) // 8 + 1,
        count=1,
        dtype="float32",
        crs="EPSG:32611",
        transform=from_origin(cx + left - 4, cy - top + 4, 8, 8),
        nodata=-9999,
        compress="deflate",
        tiled=True,
    )
    if not (cache / "yosemite-tunnel-dem.tif").exists():
        with rasterio.Env(
            GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
            CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
        ):
            with (
                rasterio.open("/vsicurl/" + cog) as src,
                rasterio.open(cache / "yosemite-tunnel-dem.tif", "w", **profile) as dst,
            ):
                reproject(
                    rasterio.band(src, 1),
                    rasterio.band(dst, 1),
                    src_transform=src.transform,
                    src_crs=src.crs,
                    dst_transform=dst.transform,
                    dst_crs=dst.crs,
                    resampling=Resampling.bilinear,
                )
    page = "https://www.nps.gov/places/000/tunnel-view.htm"
    response = requests.get(page, timeout=20)
    response.raise_for_status()
    hero = re.search(
        r'<img\s+class="Place__HeroImage"[^>]+src="([^"]+)"', response.text, re.I
    )
    image = urljoin(page, hero.group(1).replace("&amp;", "&"))
    source = requests.get(image, timeout=30)
    source.raise_for_status()
    (cache / "tunnel-field.jpg").write_bytes(source.content)
    assert Image.open(cache / "tunnel-field.jpg").size == (1600, 900)
    (cache / "tunnel-survey-sources.json").write_text(
        json.dumps(
            {
                "dem": cog,
                "croppedDemSha256": hashlib.sha256(
                    (cache / "yosemite-tunnel-dem.tif").read_bytes()
                ).hexdigest(),
                "field": page,
                "image": image,
                "imageSha256": hashlib.sha256(source.content).hexdigest(),
            },
            indent=2,
        )
        + "\n"
    )


if __name__ == "__main__":
    main()
