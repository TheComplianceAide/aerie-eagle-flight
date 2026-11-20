"""Trim, register and decontaminate the sixteen photographed foliage mattes."""
from pathlib import Path
from PIL import Image
import argparse
import numpy as np
from scipy.ndimage import distance_transform_edt, binary_closing, label
parser=argparse.ArgumentParser();parser.add_argument('input',type=Path);parser.add_argument('output',type=Path)
args=parser.parse_args()
source=Image.open(args.input).convert('RGBA')
plate=Image.new('RGBA',(1280,1280))
for index in range(16):
    j,i=divmod(index,4)
    box=tuple(round(v) for v in (i*source.width/4,j*source.height/4,(i+1)*source.width/4,(j+1)*source.height/4))
    rgba=np.array(source.crop(box))
    r,g,b,a=rgba.astype(float).transpose(2,0,1)
    chroma=(g>r*1.58)&(g>b*2.20)|(r>190)&(g>185)&(b<.31*g)
    matte=(a>=60)&~chroma
    components,count=label(binary_closing(matte,iterations=2))
    if not count:raise ValueError('Empty specimen '+str(index))
    main=1+np.argmax(np.bincount(components.ravel())[1:])
    core=(components==main)
    near=distance_transform_edt(~core)<3
    good=matte&near
    nearest=distance_transform_edt(~good,return_distances=False,return_indices=True)
    rgba[~good,:3]=rgba[nearest[0][~good],nearest[1][~good],:3]
    rgba[~near|chroma,3]=0
    yy,xx=np.where(good)
    crop=Image.fromarray(rgba).crop((xx.min(),yy.min(),xx.max()+1,yy.max()+1))
    crop=crop.resize((296,298),Image.Resampling.LANCZOS)
    plate.paste(crop,(i*320+12,j*320+11))
plate.save(args.output,quality=93,method=6,alpha_quality=97,exact=True)
