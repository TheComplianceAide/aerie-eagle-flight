"""Pack the two CC0 bark materials into linear-data textures for canopy-stream."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from hashlib import md5
from io import BytesIO
import json
from pathlib import Path
from urllib.request import Request, urlopen

from PIL import Image, ImageStat


def download(url):
    request = Request(url, headers={"User-Agent": "Aerie close forest material compiler"})
    with urlopen(request, timeout=45) as response:
        return response.read()


def bake(specimen, name, destination):
    files = json.loads(download("https://api.polyhaven.com/files/" + specimen))

    def image(channel):
        asset = files[channel]["1k"]["jpg"]
        payload = download(asset["url"])
        if md5(payload).hexdigest() != asset["md5"]:
            raise ValueError("Source checksum mismatch on " + specimen + "/" + channel)
        return Image.open(BytesIO(payload)).convert("RGB").resize((512, 512), Image.Resampling.LANCZOS)

    nx, ny, _ = image("nor_gl").split()
    luminance = image("Diffuse").convert("L")
    mid = ImageStat.Stat(luminance).median[0]
    contrast = luminance.point(lambda value: 128 + 1.45 * (value - mid))
    packed = Image.merge("RGB", (nx, ny, contrast))
    path = destination / ("close-bark-" + name + ".webp")
    # Lossless compression keeps the two signed normal channels independent.
    packed.save(path, lossless=True, method=6)
    return path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "game" / "canopy-data")
    destination = parser.parse_args().output
    destination.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=2) as workers:
        jobs = [workers.submit(bake, source, name, destination)
                for source, name in [("pine_bark", "pine"), ("trident_maple_bark", "hardwood")]]
        for job in jobs:
            print(job.result())
