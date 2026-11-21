"""Rebuild the two Crater Lake surveyed places using the recorded public field inputs."""
from pathlib import Path
from urllib.request import urlopen
from shutil import copyfileobj
import argparse, hashlib, json, subprocess, sys, tarfile, zipfile
import numpy as np
import laspy
from pyproj import Transformer

HERE = Path(__file__).resolve().parent
MANIFEST = json.loads((HERE / 'sources.json').read_text())
ORIGIN = (571464, 4755190)

def digest(path):
    with path.open('rb') as file:
        return hashlib.file_digest(file, 'sha256').hexdigest()

def fetch(directory):
    directory.mkdir(parents=True, exist_ok=True)
    for name, info in MANIFEST['inputs'].items():
        target = directory / name
        if target.is_file() and digest(target) == info['sha256']:
            continue
        partial = target.with_suffix(target.suffix + '.part')
        with urlopen(info['url'], timeout=120) as response, partial.open('wb') as out:
            copyfileobj(response, out, 1024 * 1024)
        if digest(partial) != info['sha256']:
            raise ValueError(f'The provider returned a different source revision for {name}')
        partial.replace(target)

def extract_points(work, site, bounds):
    source_crs = Transformer.from_crs(32610, 3717, always_xy=True)
    game_crs = Transformer.from_crs(3717, 32610, always_xy=True)
    l,t,r,b = bounds
    low = source_crs.transform(ORIGIN[0]+l, ORIGIN[1]-b)
    high = source_crs.transform(ORIGIN[0]+r, ORIGIN[1]-t)
    crops = {k: [] for k in ('x','z','y','c','i')}
    for name in MANIFEST['lidar'][site]:
        with laspy.CopcReader.open(work/'source'/name) as src:
            pts = src.query(bounds=laspy.Bounds(np.array(low), np.array(high)))
            if not len(pts):
                continue
            easting,northing = game_crs.transform(pts.x,pts.y)
            arrays = [(easting-ORIGIN[0]).astype('f4'),(ORIGIN[1]-northing).astype('f4'),
                      np.asarray(pts.z,'f4'),np.asarray(pts.classification,'u1'),np.asarray(pts.intensity,'u2')]
            for column,data in zip(crops.values(),arrays):
                column.append(data)
    name = 'watchman-field' if site=='watchman' else 'cleetwood-points'
    np.savez_compressed(work/(name+'.npz'), **{k:np.concatenate(v) for k,v in crops.items()})

def unwrap_sonar(work):
    source=work/'source'
    # The USGS .tgz is a ZIP containing one named tar archive.
    with zipfile.ZipFile(source/'bathy.tgz') as wrapper,wrapper.open('bathy.tar') as stream,tarfile.open(fileobj=stream,mode='r|') as tar:
        for entry in tar:
            if not entry.isfile():
                continue
            name=Path(entry.name)
            if name.is_absolute() or '..' in name.parts:
                raise ValueError('Unexpected archive path')
            target=source/'sonar'/name
            target.parent.mkdir(parents=True,exist_ok=True)
            with target.open('wb') as out:copyfileobj(tar.extractfile(entry),out)
    return next((source/'sonar').rglob('bathyg/hdr.adf'))

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('work',type=Path);ap.add_argument('game',type=Path)
    a=ap.parse_args();root=a.work.resolve();game=a.game.resolve();game.mkdir(parents=True,exist_ok=True)
    fetch(root/'source')
    extract_points(root,'watchman',(-4112,252,-3808,536))
    extract_points(root,'cleetwood',(2300,-3860,3330,-3100))
    sonar=unwrap_sonar(root)
    for tool,args in [('bake.py',[root,sonar,game]),('optics.py',[root,game]),('cut-parent.py',[root/'source/original-crater.bin',game/'landform-crater.bin'])]:
        subprocess.run([sys.executable,HERE/tool,*args],check=True)

if __name__=='__main__':main()
