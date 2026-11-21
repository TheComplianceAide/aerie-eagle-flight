"""Extract Cascade stone fabric and a measured Cleetwood water column from the source survey."""
from pathlib import Path
import argparse,struct
import numpy as np
from scipy.ndimage import gaussian_filter,map_coordinates
from PIL import Image,ImageDraw,ImageOps
from bake import registered_image,SURVEYS,LEVEL

def texture_from_face(source,box,game,name):
    # Form an opposing edge from the adjacent overlapping photograph without a mirrored axial seam.
    rgb=np.asarray(Image.open(source).convert('RGB').crop(box),'f4')
    lum=rgb@np.array([.24,.65,.11])
    light=gaussian_filter(lum,13)
    strength=np.clip(117/np.maximum(36,light),.74,1.65)
    rgb*=strength[:,:,None]**.7
    for axis in (0,1):
        a=np.moveaxis(rgb,axis,0);k=min(18,max(7,a.shape[0]//7));w=np.linspace(0,1,k)[:,None,None];w=w*w*(3-2*w)
        rgb=np.moveaxis(np.concatenate((a[-k:]*(1-w)+a[:k]*w,a[k:-k])),0,axis)
    Image.fromarray(np.clip(rgb,0,255).astype('u1')).save(game/name,quality=96,method=6)

def make(input,game):
    s=input/'source';texture_from_face(s/'tower-face.jpg',(333,257,460,303),game,'crater-rim-masonry.webp')
    texture_from_face(s/'lookout-photo.jpg' if (s/'lookout-photo.jpg').exists() else s/'watchman-nps-0.jpg',(31,223,175,309),game,'crater-rim-andesite.webp')
    # Rectify the front of the National Park Service's documented stone museum wing.
    # Pillow QUAD takes the source points in the order upper left, lower left, lower right, upper right.
    face=Image.open(s/'tower-face.jpg').convert('RGB').transform((512,210),Image.Transform.QUAD,
        (296,174,267,233,483,270,466,204),Image.Resampling.BICUBIC)
    palette=np.asarray(face,'f4');palette=np.minimum(255,8+palette*np.array([1.58,1.51,1.44]))
    Image.fromarray(palette.astype('u1')).save(game/'crater-rim-museum.webp',quality=96,method=6)
    # NPS's public-domain image records the presentation and colours of the two waysides.
    # The crop is confined to the sign face; visitors and the surrounding landscape are outside it.
    sign=Image.open(s/'stone-parapet.jpg').convert('RGB');w,h=sign.size
    sign=sign.transform((144,58),Image.Transform.QUAD,tuple(v*(w if i%2==0 else h) for i,v in enumerate([.246,.626,.240,.647,.366,.660,.374,.638])),Image.Resampling.BICUBIC)
    sign.save(game/'crater-rim-interpretation.webp',quality=95)
    blob=(game/'landform-cleetwood.bin').read_bytes();_,_,su,l,t,r,b,nx,nz,datum,scale,_=struct.unpack_from('<4sHH4iHHffI',blob)
    step=su*.25;grid=np.frombuffer(blob,'<i2',nx*nz,40).reshape(nz,nx)*scale+datum
    z,x=np.mgrid[t:b+1,l:r+1];height=map_coordinates(grid,[(z-t)/step,(x-l)/step],order=1,mode='nearest')
    depth=np.clip(LEVEL-height,0,28)
    photo=np.asarray(registered_image(s/'cleetwood-ortho.jpg',SURVEYS['cleetwood'][1],(l,t,r,b),(r-l+1,b-t+1)),dtype='f4')/255
    # Near-shore variations come from the mapped littoral bottom. Back out a bounded amount of attenuation from the colour composite.
    water=np.array([.018,.155,.232]);trans=np.exp(-np.minimum(depth[:,:,None],6.5)*np.array([.30,.14,.082]));est=(photo-water*(1-trans))/np.maximum(.27,trans)
    stone=np.array([.45,.47,.435]);intensity=np.clip(.42+np.log(np.maximum(.02,est@np.array([.22,.63,.15]))/.22)*.19,.21,.71)
    bed=np.clip((stone*.42+intensity[:,:,None]*.58)*(1.09+np.clip((est-est.mean(2)[:,:,None])*.75,-.13,.10)),0,1)
    rgba=np.uint8(np.rint(255*np.dstack((bed,np.sqrt(depth/28)))))
    Image.fromarray(rgba,'RGBA').save(game/'crater-cleetwood-optics.webp',lossless=True,method=6)
if __name__=='__main__':
    a=argparse.ArgumentParser();a.add_argument('input',type=Path);a.add_argument('game',type=Path);o=a.parse_args();make(o.input,o.game)
