"""Recover the local slab surface and exposed fracture from NPS inventory Figure 17."""
from pathlib import Path
import numpy as np
from PIL import Image, ImageOps, ImageFilter
from pypdf import PdfReader


def material(source, destination):
    # Page 79 in the printed inventory, PDF page 84. OCLP, 2008, looking west.
    im=PdfReader(source).pages[83].images[0].image.convert('RGB')
    def sample(points, scale):
        a,b,c,d=points
        patch=im.transform(scale, Image.Transform.QUAD, a+d+c+b, Image.Resampling.BICUBIC)
        # Remove the daylight exposure gradient. Keep lichen, mineral vein
        # texture and the natural warmer feldspar in the broken face.
        a=np.asarray(patch,dtype='f4')
        low=np.asarray(patch.filter(ImageFilter.GaussianBlur(19)),dtype='f4')
        normalized=np.clip(a*112/np.maximum(low.mean(axis=2,keepdims=True),40),0,255)
        return Image.fromarray(normalized.astype('u1'))
    top=sample([(146,475),(607,463),(854,626),(48,664)],(512,256))
    face=sample([(787,456),(979,438),(991,480),(793,491)],(256,96))
    wet=sample([(118,444),(397,427),(437,468),(93,486)],(256,128))
    panel=Image.new('RGB',(1024,512))
    for i,patch in enumerate([top,face,wet]):
        tw,th=(512,256) if not i else (256,256)
        patch=patch.resize((tw,th),Image.Resampling.LANCZOS)
        x=0 if not i else 512+(i-1)*256
        panel.paste(patch,(x,0));panel.paste(ImageOps.flip(patch),(x,256))
    panel.save(destination,quality=94,method=6)
