"""Download and verify the public island survey, then bake Aerie's native scenery."""
import argparse
import hashlib
import json
from pathlib import Path
import tempfile

import laspy
import numpy as np
from pyproj import Transformer
import requests

import surf_field
import slab_edges
import baker_granite
import materials
import terrain

HERE = Path(__file__).resolve().parent
MANIFEST = json.loads((HERE / 'sources.json').read_text())
FORWARD = Transformer.from_crs(32619, 6348, always_xy=True)
BACK = Transformer.from_crs(6348, 32619, always_xy=True)


def fetch(name, folder):
    file = folder / name
    receipt = MANIFEST['inputs'][name]
    if not file.exists():
        with requests.get(receipt['url'], stream=True, timeout=(15, 180)) as response:
            response.raise_for_status()
            with tempfile.NamedTemporaryFile(dir=folder, delete=False) as output:
                temp = Path(output.name)
                for chunk in response.iter_content(1024 * 1024):
                    output.write(chunk)
        if temp.stat().st_size != receipt['bytes']:
            temp.unlink()
            raise ValueError('Incomplete download of ' + name)
        with temp.open('rb') as source:
            digest = hashlib.file_digest(source, 'sha256').hexdigest()
        if digest != receipt['sha256']:
            temp.unlink()
            raise ValueError('Upstream survey has changed: ' + name)
        temp.replace(file)
    else:
        with file.open('rb') as source:
            if hashlib.file_digest(source, 'sha256').hexdigest() != receipt['sha256']:
                raise ValueError('Local source differs from the survey: ' + name)
    return file


def crop(path, data, target):
    east, north = terrain.ORIGIN
    left, top, right, bottom = data['bounds']
    low = FORWARD.transform(east + left, north - bottom)
    high = FORWARD.transform(east + right, north - top)
    with laspy.CopcReader.open(path) as reader:
        hit = reader.query(bounds=laspy.Bounds(np.array(low), np.array(high)), resolution=.76)
        if not len(hit):
            np.savez_compressed(target)
            return
        valid = (hit.z >= -.7) & (hit.z < 100) & (hit.classification != 7) & (hit.classification != 18)
        e, n = BACK.transform(hit.x[valid], hit.y[valid])
        inside = (e >= east+left) & (e <= east+right) & (n >= north-bottom) & (n <= north-top)
        np.savez_compressed(target, land_x=(e-east).astype('f4')[inside],
                            land_z=(north-n).astype('f4')[inside],
                            land_y=np.asarray(hit.z[valid], 'f4')[inside],
                            land_c=np.asarray(hit.classification[valid], 'u1')[inside])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('cache', type=Path, help='external working directory for public source rasters and crops')
    parser.add_argument('game', type=Path, help='game directory with atlas-acadia-survey.js')
    args = parser.parse_args()
    sources = args.cache / 'source'
    sources.mkdir(parents=True, exist_ok=True)
    for name in MANIFEST['inputs']:
        if not name.endswith('.copc.laz'):
            fetch(name, sources)
    # Repeat the same COPC sampling in both the fracture-zone and crown surveys.
    # Keep caller-owned downloads. Temporary verified tiles can be released
    # after the crop has been saved.
    with tempfile.TemporaryDirectory(dir=args.cache) as scratch:
        for site, data in MANIFEST['sites'].items():
            directory = args.cache / 'point-crops' / site
            directory.mkdir(parents=True, exist_ok=True)
            for name in sorted(data['lidar']):
                folder = sources if (sources/name).is_file() else Path(scratch)
                path = fetch(name, folder)
                crop(path, data, directory/(name+'.npz'))
                if folder == Path(scratch):
                    path.unlink()
    terrain.bake(args.cache, args.game)
    surf_field.bake(args.game/"acadia-island-tides.png",args.game/"acadia-surf-field.bin")
    slab_edges.bake(args.game/"landform-bakerisland.bin",args.game/"acadia-baker-slab-edges.bin")
    materials.bake(args.cache, args.game)
    baker_granite.material(sources/"baker-inventory.pdf", args.game/"acadia-baker-dance-granite.webp")


if __name__ == '__main__':
    main()
