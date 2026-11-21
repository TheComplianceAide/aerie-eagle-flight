"""Acquire the open field data and register the cropped footprint for bake.py.

Run `python acquire.py CACHE` and `python bake.py CACHE GAME`. With default
settings the 2006 and 2010 point tiles total 30.4 MB. Pass --usgs-returns to inspect the 2019
full-density 498 MB laser tile as an additional independent observation.
"""
import argparse
import hashlib
from importlib.util import spec_from_file_location,module_from_spec
from pathlib import Path
import json
import laspy
import numpy as np
import requests
SOURCES=json.loads(Path(__file__).with_name('sources.json').read_text())
def download(url,path,expected):
 if not path.exists():
  with requests.get(url,stream=True,timeout=(30,120)) as response,path.with_suffix('.part').open('wb') as f:
   response.raise_for_status()
   for part in response.iter_content(1024*1024):f.write(part)
  path.with_suffix('.part').replace(path)
 if expected:
  sha=hashlib.sha256()
  with path.open('rb') as f:
   for part in iter(lambda:f.read(1024*1024),b''):sha.update(part)
  if sha.hexdigest()!=expected:raise ValueError('Unexpected archive digest '+str(path))
def clip(folder,vintage):
 target=folder/(vintage+'-crop.npz');pieces=[]
 with laspy.open(folder/(vintage+'-returns.laz')) as reader:
  for cloud in reader.chunk_iterator(500000):
   x=np.asarray(cloud.x)-268678;z=4179436-np.asarray(cloud.y)
   keep=(x>=2479)&(x<=2744)&(z>=-1971)&(z<=-1683)&~np.isin(cloud.classification,[7,18])
   if not keep.any():continue
   xyz=np.array([x[keep],z[keep],np.asarray(cloud.z)[keep]],dtype='f4')
   attr=np.stack([np.array(f)[keep] for f in (cloud.classification,cloud.return_number,cloud.intensity)]).astype('u2')
   pieces.append((np.rint((xyz-np.array([[2400],[-2000],[1100]],dtype='f4'))*100).astype('u2'),attr))
 np.savez_compressed(target,xyz=np.concatenate([v[0] for v in pieces],axis=1),attr=np.concatenate([v[1] for v in pieces],axis=1))
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('cache',type=Path);parser.add_argument('--usgs-returns',action='store_true');arg=parser.parse_args()
 cache=arg.cache;cache.mkdir(parents=True,exist_ok=True);years=SOURCES['modeledReturnYears']+([2019] if arg.usgs_returns else [])
 for y in years:
  year=str(y);dataset=SOURCES['returns'+year];download(dataset['url'],cache/(year+'-returns.laz'),dataset.get('sha256'));clip(cache,year)
 tool=Path(__file__).resolve().parents[1]/'yosemite-falls/terrain.py'
 spec=spec_from_file_location('terrain',tool);mod=module_from_spec(spec);spec.loader.exec_module(mod)
 photo=SOURCES['localMineralPhoto'];download(photo['url'],cache/'nps-lower-cascade-2400.jpg',photo['sha256'])
 mod.BOUNDS=(2480,-1960,2744,-1680);mod.acquire(cache);(cache/'yosemite-falls-sources.npz').replace(cache/'creek-sources.npz')
