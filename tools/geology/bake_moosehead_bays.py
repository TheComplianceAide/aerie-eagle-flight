"""Georeferenced USDA NAIP two-bay orthophotos for the eastern lake approaches."""
from concurrent.futures import ThreadPoolExecutor
import argparse, io
from pathlib import Path
import requests
from PIL import Image, ImageDraw, ImageFilter, ImageChops
import struct
import numpy as np
parser=argparse.ArgumentParser()
parser.add_argument('cache',type=Path);parser.add_argument('output',type=Path)
args=parser.parse_args()
def bay(spec):
    name,x,z=spec
    file=args.cache/(name+'-naip.jpg')
    if not file.exists():
        east,north=442772+x,5060090-z
        half=1900
        url='https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage'
        response=requests.get(url,params={'bbox':','.join(str(n) for n in [east-half,north-half,east+half,north+half]),'bboxSR':32619,'imageSR':32619,'size':'2048,2048','f':'image','format':'jpg','bandIds':'0,1,2','compressionQuality':94},timeout=90)
        response.raise_for_status();assert Image.open(io.BytesIO(response.content)).size==(2048,2048)
        file.write_bytes(response.content)
    return Image.open(file).convert('RGB')
with ThreadPoolExecutor(2) as pool:
    photos=list(pool.map(bay,[('spencer-bay',11425,199),('lily-bay',15205,9651)]))
# The remote forest uses stable rooted geometry. Its cast-shadow footprint
# can be baked once at the actual regional solar altitude rather than drawing
# tens of thousands of extra shadow meshes into both main and reflected views.
data=(args.output.parent/'moosehead-woodland.bin').read_bytes()
magic,res,n=struct.unpack_from('<4sII',data)
assert magic==b'MWC1'
roots=np.frombuffer(data,offset=12+res*res,dtype=[('x','<i2'),('z','<i2'),('h','u1'),('w','u1'),('fir','u1'),('seed','u1')])
scale=2048/3800
def shade(cx,cz):
    cast=Image.new('L',(2048,2048),255);contact=cast.copy()
    paint=ImageDraw.Draw(cast);ao=ImageDraw.Draw(contact)
    nearby=roots[(abs(roots['x'].astype(float)-cx)<1980)&(abs(roots['z'].astype(float)-cz)<1980)]
    for stem in nearby:
        x,z=(int(stem['x'])-cx+1900)*scale,(int(stem['z'])-cz+1900)*scale
        h,w=stem['h']/8*scale,stem['w']/8*scale
        # Solar azimuth -84 degrees, altitude 15.5 degrees. Taper the needle
        # crowns toward their leaders and retain shorter, wider hardwood lobes.
        lift=h*3.60
        shape=[]
        for frac,girth in ((.11,.12),(.31,.38),(.53,.53),(.74,.38),(.92,.18),(1.,0)):
            r=girth*w*(.78 if stem['fir'] and frac>.65 else 1.)
            shape.append((x-.1045*lift*frac,z+.9945*lift*frac,r))
        paint.polygon([(px+r,py) for px,py,r in shape]+[(px-r,py) for px,py,r in reversed(shape)],fill=95)
        ao.ellipse((x-w*.51,z-w*.49,x+w*.51,z+w*.49),fill=159)
    return ImageChops.multiply(cast.filter(ImageFilter.GaussianBlur(1.75)),contact.filter(ImageFilter.GaussianBlur(1.35)))
atlas=Image.new('RGBA',(4096,2048))
for i,photo in enumerate(photos):
    photo=photo.copy();photo.putalpha(shade(*[(11425,199),(15205,9651)][i]));atlas.paste(photo,(2048*i,0))
atlas.save(args.output,quality=90,method=5)
