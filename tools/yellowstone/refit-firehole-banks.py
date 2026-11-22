"""Refit the NHD bank transects to the river-edge tone in the 2022 NAIP image."""
from functools import lru_cache
from pathlib import Path
from PIL import Image
from scipy.ndimage import gaussian_filter1d, median_filter
import json
import numpy as np
import sys

source, game=map(Path,sys.argv[1:]);meta_path=game/'terrain.json'
meta=json.loads(meta_path.read_text())
rows=np.array(meta['river'],dtype=float)
details=meta['details']
@lru_cache(maxsize=16)
def image(name):
    with Image.open(source/f'ortho-{name}.jpg') as im:
        return np.asarray(im.convert('RGB'),dtype=np.uint8)
def tone(x,z):
    x=max(-5999.9,min(5999.9,x));z=max(-11999.9,min(5999.9,z))
    for name,west,north in details:
        if west+3<x<west+997 and north+3<z<north+997:
            a=image(name);h=a.shape[0]
            rgb=a[int((z-north)*h/1000),int((x-west)*h/1000)]
            break
    else:
        west=int(x//2000)*2000;north=int(z//2000)*2000
        a=image(f'{west}-{north}');h=a.shape[0]
        rgb=a[min(h-1,max(0,int((z-north)*h/2000))),min(h-1,max(0,int((x-west)*h/2000)))]
    r,g,b=map(float,rgb)
    return .28*r+.58*g+.14*b
bank=rows[:,2:4].copy()
changed=[0,0]
for i,(x,z,left,right,y) in enumerate(rows):
    prior=rows[max(0,i-2),:2];after=rows[min(len(rows)-1,i+2),:2]
    direction=(after-prior)/(np.linalg.norm(after-prior) or 1.)
    normal=np.array([direction[1],-direction[0]])
    for side,expected in enumerate([left,right]):
        max_d=min(46.,expected+19.)
        dist=np.arange(0,max_d,.7)
        values=gaussian_filter1d([tone(x+(-1+2*side)*normal[0]*d,z+(-1+2*side)*normal[1]*d) for d in dist],1.5)
        best=None
        for k in range(5,len(dist)-6):
            d=dist[k]
            if d<max(4.,expected*.47) or d>expected*1.85+4:continue
            inn=float(np.median(values[k-4:k]));outer=float(np.median(values[k+2:k+6]))
            contrast=(outer-inn)
            if contrast<10:continue
            edge_score=contrast-1.1*abs(d-expected)-.22*max(0,inn-110)
            if best is None or edge_score>best[0]:best=(edge_score,d)
        if best and best[0]>=7:
            bank[i,side]=.25*expected+.75*best[1]
            changed[side]+=1
rows[:,2:4]=gaussian_filter1d(median_filter(bank,size=(3,1)),.70,axis=0)
meta['river']=np.round(rows,2).tolist()
meta['bankAlignment']={'transects':len(rows),'leftBankRefit':changed[0],'rightBankRefit':changed[1]}
part=meta_path.with_suffix('.json.part');part.write_text(json.dumps(meta,separators=(',',':'))+'\n');part.replace(meta_path)
print(meta['bankAlignment'])
