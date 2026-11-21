"""Read one 51.2 m study specimen through byte ranges in the 5 cm Arctic Data Center ortho."""

from argparse import ArgumentParser
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import io
import numpy as np
from PIL import Image
import requests
import tifffile

URL = "https://arcticdata.io/metacat/d1/mn/v2/object/urn:uuid:a6adf413-f6e3-4c65-a789-c91f7ef3dbd7"
LENGTH = 2217863363


class RangedTIFF(io.RawIOBase):
    def __init__(self):
        self.position = 0
        self.cache = {}

    def seekable(self):
        return True

    def readable(self):
        return True

    def tell(self):
        return self.position

    def seek(self, offset, whence=0):
        self.position = (
            self.position if whence == 1 else LENGTH if whence == 2 else 0
        ) + offset
        return self.position

    def read(self, size=-1):
        if size < 0 or size > 11000000:
            raise ValueError("A tiled range is required")
        if size == 0:
            return b""
        first = self.position
        last = min(LENGTH - 1, first + size - 1)
        lo = first // 16384 * 16384
        hi = min(LENGTH - 1, (last // 16384 + 1) * 16384 - 1)
        if (lo, hi) not in self.cache:
            self.cache[lo, hi] = get_range(lo, hi)
        self.position = last + 1
        return self.cache[lo, hi][first - lo : first - lo + size]


def get_range(lo, hi):
    r = requests.get(URL, headers={"Range": f"bytes={lo}-{hi}"}, timeout=50)
    r.raise_for_status()
    if r.status_code != 206:
        raise ValueError("Arctic Data Center did not return the requested byte range")
    return r.content


parser = ArgumentParser()
parser.add_argument("cache", type=Path)
q = parser.parse_args().cache
q.mkdir(parents=True, exist_ok=True)
with tifffile.TiffFile(RangedTIFF()) as src:
    page = src.series[0].levels[0].pages[0]
    left, top, right, bottom = 6784, 11008, 7808, 12032
    cols = (page.imagewidth + 255) // 256
    data = np.empty((1024, 1024, 4), np.uint8)

    def tile(xy):
        i, j = xy
        k = j * cols + i
        off = page.dataoffsets[k]
        length = page.databytecounts[k]
        chip = page.decode(get_range(off, off + length - 1), k)[0][0]
        return i, j, chip

    tiles = [
        (i, j)
        for j in range(top // 256, (bottom - 1) // 256 + 1)
        for i in range(left // 256, (right - 1) // 256 + 1)
    ]
    with ThreadPoolExecutor(max_workers=4) as pool:
        for i, j, chip in pool.map(tile, tiles):
            x0 = max(left, i * 256)
            x1 = min(right, (i + 1) * 256)
            y0 = max(top, j * 256)
            y1 = min(bottom, (j + 1) * 256)
            data[y0 - top : y1 - top, x0 - left : x1 - left] = chip[
                y0 - j * 256 : y1 - j * 256, x0 - i * 256 : x1 - i * 256
            ]
assert np.min(data[:, :, 3]) == 255
Image.fromarray(data).save(q / "suicide-114-180.png")
