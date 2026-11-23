"""Build the byte-for-byte compressed copy of the Yellowstone height tiles."""

import argparse
import gzip
import json
from pathlib import Path


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("data", type=Path)
args = parser.parse_args()
manifest = json.loads((args.data / "terrain.json").read_text())
names = [f"{x}_{z}" for x, z, _ in manifest["tiles"]]
names.extend(item[0] for item in manifest["details"])
raw = b"".join((args.data / f"{name}.bin").read_bytes() for name in names)
(args.data / "heights-v1.bin").write_bytes(gzip.compress(raw, compresslevel=9, mtime=0))
