"""Rectify Reine Church's photographed timber nave, belfry, porch and one Gothic window. Lukas Beck, CC BY 4.0."""
from pathlib import Path
import argparse,hashlib
import numpy as np
from PIL import Image,ImageOps
from bake import fetch

SOURCE="https://upload.wikimedia.org/wikipedia/commons/9/95/Reine_Kirche_lub_2025-07-21_img01.jpg"
def build(cache,output):
 path=fetch(cache,"church-173640379.jpg",SOURCE)
 if hashlib.sha256(path.read_bytes()).hexdigest()!="adc8f96a7ae85f1950e6eb5f4d5fab9bcec93cfce559eb9cff9b8058fe46a552":
  raise ValueError("Unexpected Reine nave photograph")
 photo=ImageOps.exif_transpose(Image.open(path)).convert("RGB")
 sx,sy=photo.width/920,photo.height/690
 # Remove the foreground flagpole crossing the nave; the pole is modeled separately in the scene.
 a=np.asarray(photo).copy()
 for y in range(int(423*sy),int(565*sy)):
  center=int((263.8+(y/sy-423)*(-.042))*sx);w=int(1.65*sx)
  if 0<center-w-2<center+w+2<a.shape[1]:
   f=np.linspace(0,1,2*w+1)[:,None];a[y,center-w:center+w+1]=np.uint8(a[y,center-w-2]*(1-f)+a[y,center+w+2]*f)
 photo=Image.fromarray(a)
 # Quad points are top left, bottom left, bottom right, top right on the source facade.
 # Four separate UV regions avoid any blue sky or neighboring modern buildings.
 sheets=[
  ((0,0,1024,336),[(215,433),(211,557),(529,564),(527,395)]),
  ((0,336,384,1016),[(569,249),(585,553),(722,561),(687,219)]),
  ((384,336,635,1016),[(688,221),(720,557),(757,553),(726,259)]),
  ((635,336,899,731),[(452,417),(453,516),(497,515),(496,413)]),
  ((899,336,1024,731),[(308,421),(303,550),(315,550),(318,419)]),
  ((635,731,1024,1016),[(583,474),(590,472),(694,467),(628,418)])]
 atlas=Image.new('RGB',(1024,1024),(172,171,165))
 for area,quad in sheets[:-1]:
  region=photo.transform((area[2]-area[0],area[3]-area[1]),Image.Transform.QUAD,tuple(v for i,j in quad for v in (i*sx,j*sy)),Image.Resampling.BICUBIC)
  # The outdoor photograph has strong blue sky fill on white boards. Recover
  # a neutral, lightly weathered albedo for the dusk lighting.
  q=np.asarray(region,dtype='f4')/255;lum=q@np.array([.27,.59,.14]);balanced=np.clip((q*.46+lum[:,:,None]*.54)*1.29+.055,0,1)
  atlas.paste(Image.fromarray(np.uint8(balanced*255)),area[:2])
 atlas.save(output/'reine-church-siding.webp',quality=93,method=6)
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--cache',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();build(a.cache,a.output)
