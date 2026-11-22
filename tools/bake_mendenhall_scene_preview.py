#!/usr/bin/env python3
"""Bake the verified Sentinel scene to bounded color and soft class weights."""
import array
import base64
import collections
import gzip
import hashlib
import json
from pathlib import Path
import sys
import zlib
from PIL import Image

root = Path(__file__).resolve().parents[1] / "game"
source = json.loads(Path(sys.argv[1]).read_text())
if (source["epsg"], source["localRect"], source["origin"]) != (
    6337, [-4201, -4001, 4799, 4499], [526511, 6477009]
):
    raise ValueError("Unexpected native Mendenhall registration")
w, h = source["width"], source["height"]

def unpack(entry):
    raw = zlib.decompress(base64.b64decode(next(v for k, v in entry.items() if "base64" in k.lower())))
    if hashlib.sha256(raw).hexdigest() != entry["sha256"]:
        raise ValueError("Incorrect input digest")
    return raw

fields = {k: unpack(v) for k, v in source["layers"].items()}
image = Image.frombytes("RGB", (w, h), fields["rgb"])
image.save(root / "mendenhall-scene-rgb.jpg", quality=94, subsampling=0, optimize=True)
ice = array.array("b", fields["ndsi"])
wet = array.array("b", fields["ndwi"])
out = bytearray(w*h*4)
for i, c in enumerate(fields["material"]):
    if c == 1:
        out[4*i] = 232
    elif c == 2:
        out[4*i+2] = 220
    elif c == 3:
        # The class, not the index sign alone, defines observed water.
        q = wet[i]
        if q > -128:
            out[4*i+3] = min(255, max(135, 186+q))
    elif c == 4:
        # NDSI weights the SCL snow/ice observation, not the physical boundary.
        q = ice[i]
        if q > -128:
            out[4*i+1] = min(255, max(85, 112+2*q))
compressed = gzip.compress(out, compresslevel=9, mtime=0)
(root / "mendenhall-scene-material.bin").write_bytes(compressed)
meta = dict(
    bounds=source["localRect"], origin=source["origin"],
    epsg=source["epsg"], width=w, height=h, step=source["step"],
    source=source["source"], inputs={k: v["sha256"] for k,v in source["layers"].items()},
    rawClassPixels=collections.Counter(fields["material"]),
    rgbSha256=hashlib.sha256((root / "mendenhall-scene-rgb.jpg").read_bytes()).hexdigest(),
    materialSha256=hashlib.sha256(compressed).hexdigest(),
    rules=source["rules"], terrainPolicy="No elevation changes in this optical stage."
)
(root / "mendenhall-scene-preview.json").write_text(json.dumps(meta, indent=2)+"\n")
print(meta["rawClassPixels"], len(compressed))
