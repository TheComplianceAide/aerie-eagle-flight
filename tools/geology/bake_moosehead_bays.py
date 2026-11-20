"""Georeferenced USDA NAIP two-bay orthophotos for the eastern lake approaches."""
from concurrent.futures import ThreadPoolExecutor
import argparse, io
from pathlib import Path
import requests
from PIL import Image
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
atlas=Image.new('RGB',(4096,2048))
for i,photo in enumerate(photos):
    atlas.paste(photo,(2048*i,0))
atlas.save(args.output,quality=90,method=5)
