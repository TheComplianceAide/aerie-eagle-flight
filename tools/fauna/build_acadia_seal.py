"""Bake a fur atlas for the Egg Rock harbor seals from three public domain New England photos.

The four atlas quadrants supply individual coat patterns. Body UVs
wrap continuously from belly to back to belly. The animal is built separately
in three dimensions, so photographic eyes, noses and background pixels are not
wrapped around the sides of the head. Requires pillow, numpy and scipy.
"""
import argparse
from pathlib import Path
from urllib.request import urlopen
from io import BytesIO
import numpy as np
from scipy.ndimage import gaussian_filter, map_coordinates
from PIL import Image

sources = {
    'matinicus': 'https://www.fws.gov/sites/default/files/2022-03/DSC00619.JPG',
    'nantucket': 'https://www.fws.gov/sites/default/files/images/2024-03-5/13204.jpg',
    'dorsal': 'https://media.fisheries.noaa.gov/dam-migration-miss/1280_EgyZuhzl4Ix7.jpg',
}
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--cache', type=Path, required=True)
parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[2]/'game/acadia-seal-pelts.webp')
args=parser.parse_args()
args.cache.mkdir(exist_ok=True,parents=True)
def photo(name,refWidth):
    f=args.cache/(name+'-original.jpg')
    if not f.exists():f.write_bytes(urlopen(sources[name],timeout=45).read())
    im=Image.open(BytesIO(f.read_bytes())).convert('RGB')
    a=np.asarray(im).astype(float)
    # Very broad illumination from the source is removed before assigning fur.
    broad=gaussian_filter(a,[24,24,0])
    return (a*.62+(a-broad)*.38+broad.mean((0,1))*.38,im.width/refWidth)
def sample(source,x,y):
    a,s=source
    return np.stack([map_coordinates(a[:,:,k],[y*s,x*s],order=1,mode='nearest') for k in range(3)],2)
def smooth(lo,hi,x):
    a=np.clip((x-lo)/(hi-lo),0,1);return a*a*(3-2*a)
P,Q,R=photo('matinicus',827),photo('nantucket',798),photo('dorsal',800)
W,H=512,384
u,v=np.meshgrid((np.arange(W)+.5)/W,(np.arange(H)+.5)/H)
theta=(v-.5)*2*np.pi;dorsal=(np.cos(theta)+1)*.5
# All rectangles are strictly inside the flank. No eyelid, flipper seam,
# sand or seaweed is repeated as a dorsal marking. A soft overlap blends
# large patches without stretching a row of skin around the animal.
patches=[(248,280,290,322),(282,258,327,305),(320,238,362,288),
         (356,238,394,286),(381,244,423,285),(414,252,454,298),
         (218,290,256,329),(474,256,513,295),(297,290,331,326)]
def quilt(index):
    rng=np.random.default_rng(3814+67*index)
    accum=np.zeros((H,W,3));weights=np.zeros((H,W))
    step=82;size=134
    row,col=np.mgrid[0:size,0:size]
    weight=np.maximum(.0001,(np.sin(np.pi*(row+.5)/size)*np.sin(np.pi*(col+.5)/size))**1.65)
    for py in range(-size+step,H,step):
        for px in range(-size+step,W,step):
            left,top,right,bottom=patches[rng.integers(len(patches))]
            a,b=col/(size-1),row/(size-1)
            if rng.random()>.5:a=1-a
            if rng.random()>.5:b=1-b
            if rng.random()>.5:a,b=b,a
            body=sample(P,left+(right-left)*a,top+(bottom-top)*b)
            sx=650.5+17*a;sy=200+15*b
            spots=sample(R,sx,sy)
            detail=spots@np.array([.24,.57,.19])
            flecks=np.clip(detail-gaussian_filter(detail,9),-32,29)
            fur=body-body.mean((0,1))+(flecks*[.82,1.19,.56,1.05][index])[:,:,None]
            x0,y0=max(0,px),max(0,py);x1,y1=min(W,px+size),min(H,py+size)
            if x0>=x1 or y0>=y1:continue
            cut=np.s_[y0-py:y1-py,x0-px:x1-px]
            accum[y0:y1,x0:x1]+=fur[cut]*weight[cut][:,:,None]
            weights[y0:y1,x0:x1]+=weight[cut]
    return accum/weights[:,:,None]
panel=[]
for index in range(4):
    fur=quilt(index)
    center=np.array([[173,166,151],[132,123,107],[191,186,170],[148,147,142]])[index]
    target=center+((.5-dorsal)*[31,37,20,30][index])[:,:,None]
    base=target+fur*(.60+.56*dorsal[:,:,None])
    # Use gently mottled real forehead material on the skull. Eyes, muzzle
    # follicles, nostrils and vibrissae are separate geometry.
    fx=268+45*np.clip((u-.72)/.28,0,1)+8*np.sin(theta)
    fy=173+29*(1-dorsal)+3*np.sin(u*5+theta)
    face=sample(Q,fx,fy);face-=face.mean((0,1));face+=target+7
    faceTint=smooth(.77,.94,u)[:,:,None]
    base=base*(1-faceTint)+face*faceTint
    out=np.clip(base,15,230).astype('uint8')
    out[:5,:,:]=255
    panel.append(out)
atlas=np.concatenate([np.concatenate(panel[:2],1),np.concatenate(panel[2:],1)],0)
args.output.parent.mkdir(exist_ok=True,parents=True)
Image.fromarray(atlas).save(args.output,'WEBP',quality=91,method=6)
