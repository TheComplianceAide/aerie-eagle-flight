"""Verify the shipped observation grids, source registration and payload bounds."""
import base64
import gzip
import hashlib
import json
from pathlib import Path
import re
import struct

GAME = Path(__file__).resolve().parents[1] / "game"
PACK_BUDGET = 7_000_000


def sha(value):
    return hashlib.sha256(value).hexdigest()


def metadata(stem):
    return json.loads((GAME / (stem + ".json")).read_text())


def binary(stem):
    return (GAME / (stem + ".bin")).read_bytes()


def grid(meta, size):
    left, top, right, bottom = meta["bounds"]
    width, height, step = (meta[key] for key in ("width", "height", "step"))
    assert abs(right - left - width * step) < .02
    assert abs(bottom - top - height * step) < .02
    return width * height * size


def main():
    cover = metadata("canyon-worldcover-2021")
    classes = base64.b64decode(cover["classesBase64"])
    assert len(classes) == 19_600 and sha(classes) == cover["sha256ClassBytes"]
    assert set(classes) <= {0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100}

    worlds = {"alaska", "acadia", "lofoten"}
    payload = (GAME / "canyon-worldcover-2021.json").stat().st_size
    for path in (GAME / "geodata").glob("*-spectral.json"):
        stem = f"geodata/{path.stem}"
        meta = metadata(stem)
        worlds.add(meta["world"])
        assert meta["step"] == 20 and meta["schema"] == 1
        compressed = binary(stem)
        raw = gzip.decompress(compressed)
        assert len(raw) == grid(meta, 4)
        assert sha(compressed) == meta["compressedSha256"]
        assert sha(raw) == meta["rawSha256"]
        mask = raw[2::4]
        assert set(mask) <= {0, 1, 2, 3, 4} and sum(mask.count(i) for i in range(1, 5)) > len(mask) / 2
        assert meta["layers"]["canopy"]["sources"] and meta["layers"]["optical"]["assets"]["swir16"]
        payload += len(compressed) + path.stat().st_size

    for name in ("acadia", "lofoten"):
        stem = name + "-fused-preview"
        meta = metadata(stem)
        assert meta["world"] == name and meta["step"] == 10
        packed = gzip.decompress(binary(stem + "-material"))
        assert len(packed) == grid(meta, 4)
        assert len(gzip.decompress(binary(stem + "-canopy"))) == 7 * meta["canopy"]["count"]
        if "terrain" in meta:
            assert meta["terrain"]["verticalVerified"]
            assert len(gzip.decompress(binary(stem + "-terrain"))) == grid(meta["terrain"], 2)
            assert sha((GAME / (stem + "-ortho.jpg")).read_bytes()) == meta["ortho"]["imageSha256"]
        payload += sum(p.stat().st_size for p in GAME.glob(stem + "*"))

    for name in ("alaska", "moosehead"):
        stem = name + "-canopy-preview"
        meta = metadata(stem)
        raw = gzip.decompress(binary(stem))
        total, tiles, step = struct.unpack_from("<IHH", raw, 4)
        assert raw[:4] == b"NCP1" and step == 128 and total <= 8500
        assert len(raw) == 20 + 4 * tiles + 7 * total
        assert list(struct.unpack_from("<hhhh", raw, 12)) == meta["localRect"]
        payload += len(binary(stem)) + (GAME / (stem + ".json")).stat().st_size

    alpine = gzip.decompress(binary("oeschinen-canopy"))
    total, tiles, step = struct.unpack_from("<IHH", alpine, 4)
    assert alpine[:4] == b"OEC1" and step == 128 and total <= 10000
    assert len(alpine) == 12 + 4 * tiles + 7 * total
    payload += sum(p.stat().st_size for p in GAME.glob("oeschinen-canopy*"))

    mendenhall = metadata("mendenhall-scene-preview")
    assert len(gzip.decompress(binary("mendenhall-scene-material"))) == grid(mendenhall, 4)
    assert sha(binary("mendenhall-scene-material")) == mendenhall["materialSha256"]
    assert sha((GAME / "mendenhall-scene-rgb.jpg").read_bytes()) == mendenhall["rgbSha256"]
    assert len(gzip.decompress(binary("mendenhall-inland-dtm"))) == grid(mendenhall["terrain"], 2)
    assert sha(binary("mendenhall-inland-dtm")) == mendenhall["terrain"]["packSha256"]
    payload += sum(p.stat().st_size for p in GAME.glob("mendenhall-scene-*"))
    payload += len(binary("mendenhall-inland-dtm"))

    swiss = metadata("geodata/swiss-lidar")
    assert swiss["nativeMeters"] == .5 and swiss["step"] == 1 and swiss["holdout"]["count"] >= 70
    assert sha(binary("geodata/swiss-lidar")) == swiss["compressedSha256"]
    assert len(gzip.decompress(binary("geodata/swiss-lidar"))) == grid(swiss, 2)
    payload += sum(p.stat().st_size for p in (GAME / "geodata").glob("swiss-lidar.*"))

    catalog = (GAME / "world-menu.js").read_text()
    assert worlds == set(re.findall(r"^    (\w+):\s*\{\s*name:", catalog, re.M))
    assert payload <= PACK_BUDGET
    print(f"Validated {len(worlds)} selectable worlds and {payload:,} bytes of observation data")


if __name__ == "__main__":
    main()
