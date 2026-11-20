"""Place the woody base of each RGBA branch on its native mesh attachment."""
import argparse
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt
parser=argparse.ArgumentParser()
parser.add_argument('source');parser.add_argument('output')
args=parser.parse_args()
photo=Image.open(args.source).convert('RGBA')
roots=[(.53,.96),(.59,.96),(.58,.96),(.40,.96),
      (.35,.96),(.29,.97),(.065,.965),(.32,.96),
      (.93,.92),(.93,.10),(.07,.93),(.35,.92),
      (.24,.95),(.53,.95),(.28,.95),(.33,.95)]
tile=352
sheet=Image.new('RGBA',(tile*4,tile*4))
for i,(rx,ry) in enumerate(roots):
    col,row=i%4,i//4
    bounds=(round(col*photo.width/4),round(row*photo.height/4),round((col+1)*photo.width/4),round((row+1)*photo.height/4))
    raw=np.array(photo.crop(bounds));alpha=raw[:,:,3]
    inside=alpha>48
    yy,xx=np.nonzero(inside);x0=rx*(raw.shape[1]-1);y0=ry*(raw.shape[0]-1)
    mass=np.maximum(0.,alpha[yy,xx].astype('f')-48);mass/=mass.sum()
    dx=(xx-x0)@mass;dy=(yy-y0)@mass;length=np.hypot(dx,dy)
    up=np.array([dx,dy])/length;right=np.array([-up[1],up[0]])
    ext=np.c_[xx-x0,yy-y0];across=ext@right;along=ext@up
    scale=min(.468*tile/max(abs(across.min()),across.max()),.89*tile/max(1,along.max()),.065*tile/max(1,-along.min()))
    # Remove sub-visible chroma outside the matte and bleed actual surviving leaf
    # colour under the transparent gutter for a clean mip chain from the water.
    garbage=alpha<12
    nearest=distance_transform_edt(garbage,return_distances=False,return_indices=True)
    raw[garbage,:3]=raw[nearest[0][garbage],nearest[1][garbage],:3]
    raw[garbage,3]=0
    origin=np.array([x0,y0])-right*.5*tile/scale+up*.92*tile/scale
    transform=(right[0]/scale,-up[0]/scale,origin[0],right[1]/scale,-up[1]/scale,origin[1])
    image=Image.fromarray(raw).transform((tile,tile),Image.Transform.AFFINE,transform,Image.Resampling.BICUBIC)
    sheet.paste(image,(col*tile,row*tile))
sheet.save(args.output,quality=92,method=5,alpha_quality=97,exact=True)
