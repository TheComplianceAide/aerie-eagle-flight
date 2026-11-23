"""Add immutable aliases for large images from an already vetted public build."""

import argparse
from hashlib import sha256
import json
from pathlib import Path
import re
from shutil import copyfile


# Leave space for game and canopy updates in the 500 MB production environment.
MAX_ALIAS_BYTES = 70_000_000
MOBILE_ALIAS_BYTES = 15_000_000
MAX_BUILD_BYTES = 480_000_000
ASSET_ROOT = "aerie-cache"
SCRIPT = "public-asset-cache.js"
IMAGE = re.compile(r"(?:[a-z0-9_-]+/)*[a-z0-9_-]+\.(?:avif|jpg|png|webp)\Z", re.I)
LAKE_LAUNCH_IMAGES = re.compile(r"winnipesaukee|moosehead|fir-crown")
TEMPLATE = "/* immutable public files */ {}"


def digest(path):
    with path.open("rb") as stream:
        return sha256(stream.read()).hexdigest()


def install_cache(public, template):
    """Use only the packaged public images; never read alternate or private assets."""
    files = [path for path in public.rglob("*") if path.is_file() and not path.is_symlink()]
    candidates = []
    for path in files:
        name = path.relative_to(public).as_posix()
        if name.startswith(("api/", "join/", ASSET_ROOT + "/")) or not IMAGE.fullmatch(name):
            continue
        size = path.stat().st_size
        if size >= 750_000:
            candidates.append((name, size))
    candidates.sort(key=lambda item: (not LAKE_LAUNCH_IMAGES.search(item[0]), -item[1], item[0]))

    available = MAX_BUILD_BYTES - sum(path.stat().st_size for path in files)
    quota = {"mobile": MOBILE_ALIAS_BYTES, "desktop": MAX_ALIAS_BYTES - MOBILE_ALIAS_BYTES}
    paths = {}
    written = 0
    for name, size in candidates:
        source = public / name
        target = f"{ASSET_ROOT}/{digest(source)}/{name}"
        destination = public / target
        group = "mobile" if name.startswith("mobile/") else "desktop"
        if size > quota[group]:
            continue
        if destination.exists():
            if destination.is_symlink() or digest(destination) != digest(source):
                raise ValueError(f"Immutable asset does not match its source: {name}")
        elif size <= available:
            destination.parent.mkdir(parents=True, exist_ok=True)
            copyfile(source, destination)
            written += size
            available -= size
        else:
            continue
        quota[group] -= size
        paths[name] = "/" + target

    code = template.read_text(encoding="utf-8")
    if code.count(TEMPLATE) != 1:
        raise ValueError("Expected one public asset map in the cache script")
    (public / SCRIPT).write_text(code.replace(TEMPLATE, json.dumps(paths, separators=(",", ":"))), encoding="utf-8")
    return paths, written


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("public", type=Path, help="directory containing the vetted public release")
    parser.add_argument("template", type=Path, help="path to the tracked public-asset-cache.js")
    args = parser.parse_args()
    paths, written = install_cache(args.public, args.template)
    print(json.dumps({"files": len(paths), "newBytes": written}))
