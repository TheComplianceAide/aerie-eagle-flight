"""Public New Hampshire GRANIT 2021–22 six-inch leaf-off orthophotography."""

from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import hashlib, json, requests
from PIL import Image
from sources import sites, origins
import argparse

source = "https://granit24a.sr.unh.edu/image/rest/services/ImageServices/NH_2021_2022_6in_RGB/ImageServer/exportImage"


def get(item):
    name, i, j, root = item
    _, cx, cz, h = sites[name]
    e, n = origins["winnipesaukee"]
    x = cx - h + i * h
    z = cz - h + j * h
    path = root / (name + "-tile-" + str(i) + str(j) + ".jpg")
    meta = path.with_suffix(".json")
    if path.exists() and meta.exists():
        return
    pixels = 3 * h
    params = dict(
        bbox=",".join(map(str, (e + x, n - z - h, e + x + h, n - z))),
        bboxSR=32619,
        imageSR=32619,
        size=f"{pixels},{pixels}",
        format="jpg",
        compressionQuality=95,
        f="image",
        interpolation="RSP_BilinearInterpolation",
    )
    for attempt in range(3):
        try:
            reply = requests.get(source, params=params, timeout=(10, 75))
            reply.raise_for_status()
            image = Image.open(BytesIO(reply.content))
            assert image.size == (pixels, pixels)
            break
        except (requests.RequestException, OSError):
            if attempt == 2:
                raise
    path.write_bytes(reply.content)
    meta.write_text(
        json.dumps(
            dict(
                source=reply.url,
                left=x,
                top=z,
                step=h / pixels,
                sha256=hashlib.sha256(reply.content).hexdigest(),
            ),
            indent=2,
        )
    )
    print(name, i, j, len(reply.content), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", required=True, type=Path)
    args = parser.parse_args()
    folder = args.cache / "photos"
    folder.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(3) as pool:
        list(
            pool.map(
                get,
                [
                    (k, i, j, folder)
                    for k, v in sites.items()
                    if v[0] == "winnipesaukee"
                    for j in range(2)
                    for i in range(2)
                ],
            )
        )
