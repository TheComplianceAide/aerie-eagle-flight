"""Download the small surveyed Rockwood inputs, including the intersecting EPT nodes."""

import argparse
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lake-banks"))
import returns

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--cache", type=Path, required=True)
target = parser.parse_args().cache
target.mkdir(parents=True, exist_ok=True)

sources = {
    "naip2018.tif": (
        "https://gis.maine.gov/image/rest/services/NAIP/orthoNaip2018/ImageServer/exportImage",
        {
            "bbox": "442347.5,5058257.5,442668.5,5058578.5",
            "bboxSR": 32619,
            "imageSR": 32619,
            "size": "642,642",
            "bandIds": "0,1,2,3",
            "f": "image",
            "format": "tiff",
            "pixelType": "U8",
            "renderingRule": '{"rasterFunction":"None"}',
        },
    ),
    "dem.tif": (
        "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage",
        {
            "bbox": "442287,5058238,442687,5058598",
            "bboxSR": 32619,
            "imageSR": 32619,
            "size": "401,361",
            "format": "tiff",
            "f": "image",
            "compressionQuality": 95,
            "pixelType": "F32",
            "renderingRule": '{"rasterFunction":"None"}',
        },
    ),
}
for texture in ["wood_planks", "gravel_floor"]:
    sources[texture + ".jpg"] = (
        f"https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/{texture}/{texture}_diff_1k.jpg",
        {},
    )
for name, (url, params) in sources.items():
    f = target / name
    if f.exists():
        continue
    response = requests.get(url, params=params, timeout=(15, 90))
    response.raise_for_status()
    f.write_bytes(response.content)
returns.sites["rockwood"] = ("moosehead", -285, 1672, 180)
returns.run("rockwood", target)
