"""Read the two public May 2013 Juneau colorized LiDAR tiles covering the Steep Creek visitor loop."""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryFile
import argparse, hashlib, json
import numpy as np
import laspy, requests

BOUNDS = (-260, 1640, 110, 2140)
ORIGIN = (526511, 6477009)
BASE = "https://noaa-nos-coastal-lidar-pds.s3.amazonaws.com/laz/mllw/4813/"
TILES = [f"20130522_AK_Juneau_2013-2014_{n:06}.copc.laz" for n in (866, 917)]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("cache", type=Path)
    out = parser.parse_args().cache
    l, t, r, b = BOUNDS

    def extract(name):
        url = BASE + name
        h = hashlib.sha256()
        parts = []
        with TemporaryFile() as fd:
            with requests.get(url, stream=True, timeout=(10, 75)) as resp:
                resp.raise_for_status()
                for block in resp.iter_content(1048576):
                    h.update(block)
                    fd.write(block)
            fd.seek(0)
            with laspy.open(fd, closefd=False) as f:
                for a in f.chunk_iterator(400000):
                    x = np.asarray(a.x) - ORIGIN[0]
                    z = ORIGIN[1] - np.asarray(a.y)
                    ok = (
                        (x >= l)
                        & (x <= r)
                        & (z >= t)
                        & (z <= b)
                        & ~np.asarray(a.withheld, dtype=bool)
                    )
                    if not np.any(ok):
                        continue
                    data = dict(
                        x=x[ok].astype("f4"),
                        z=z[ok].astype("f4"),
                        alt=np.asarray(a.z)[ok].astype("f4"),
                        cl=np.asarray(a.classification)[ok],
                        rank=np.asarray(a.return_number)[ok],
                        rgb=np.stack(
                            [
                                np.asarray(getattr(a, c))[ok] // 256
                                for c in ["red", "green", "blue"]
                            ],
                            1,
                        ).astype("u1"),
                    )
                    parts.append(data)
        data = {k: np.concatenate([p[k] for p in parts]) for k in parts[0]}
        print(name, len(data["x"]), flush=True)
        return data, dict(url=url, sha256=h.hexdigest(), count=len(data["x"]))

    with ThreadPoolExecutor(2) as pool:
        result = list(pool.map(extract, TILES))
    data = {k: np.concatenate([a[k] for a, _ in result]) for k in result[0][0]}
    np.savez_compressed(out / "steep-returns.npz", **data)
    (out / "steep-lidar-sources.json").write_text(
        json.dumps([rec for _, rec in result], indent=2) + "\n"
    )


if __name__ == "__main__":
    main()
