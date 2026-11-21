"""Register Poly Haven's Scythian Tombs Pure Sky photograph to the Mendenhall sun."""
import argparse
import hashlib
import json
import math
from pathlib import Path
from urllib.request import Request, urlopen

import numpy as np
from PIL import Image, ImageFilter

ASSET = "scythian_tombs_puresky"
GAME = Path(__file__).resolve().parents[1] / "game"
# Maximum solar radiance in the source's unclipped 1K RGBE, at the pixel centre.
SOURCE_U = 0.59912109375
SOURCE_ALTITUDE = 13.18359375
SUN = (-.67, .32, -.74)

def request(url):
    with urlopen(Request(url, headers={"User-Agent": "Aerie game scenery build"}), timeout=60) as response:
        return response.read()

def register(photo, width):
    height = width // 2
    destination_u = .5 + math.atan2(SUN[2], SUN[0]) / math.tau
    destination_altitude = math.degrees(math.atan2(SUN[1], math.hypot(SUN[0], SUN[2])))
    resized = np.asarray(photo.resize((width, height), Image.Resampling.LANCZOS))
    angles = 90 - (np.arange(height) + .5) * 180 / height
    source_angle = np.interp(abs(angles), [0, destination_altitude, 65, 90], [0, SOURCE_ALTITUDE, 65, 90])
    y = np.clip((90 - np.sign(angles) * source_angle) * height / 180 - .5, 0, height - 1)
    low = np.floor(y).astype(int)
    dest = np.empty_like(resized)
    for j in range(0, height, 64):
        rows = low[j:j+64]
        fraction = (y[j:j+64] - rows).astype('f')[:, None, None]
        dest[j:j+64] = np.rint(resized[rows] * (1-fraction) + resized[np.minimum(rows+1, height-1)] * fraction)
    return Image.fromarray(np.roll(dest, round((destination_u - SOURCE_U) * width), axis=1))

def cloud_density(photo):
    # Measure cloud colour relative to clear sky at each elevation. The variation
    # with latitude removes the bright horizon from the moving shadow field.
    low = np.asarray(photo.resize((1024, 512), Image.Resampling.LANCZOS)).astype(np.float32) / 255
    r, g, b = np.moveaxis(low, -1, 0)
    ratio=(r+.65*g)/(1.65*np.maximum(b,.05))
    clear=np.percentile(ratio,12,axis=1)
    clear=np.asarray(Image.fromarray(clear.astype('f')[None,:]).resize((64,1),Image.Resampling.BOX).resize((512,1),Image.Resampling.BILINEAR))[0]
    whiten=np.clip((ratio-clear[:,None]-.015)/.28,0,1)
    # Above the photographed disk, very bright clear air is not cloud opacity.
    xx=(np.arange(1024)+.5)/1024
    zz=np.deg2rad(90-(np.arange(512)+.5)*180/512)
    az=(xx-.5)*math.tau
    normal=np.asarray(SUN)/np.linalg.norm(SUN)
    align=np.cos(zz)[:,None]*(normal[0]*np.cos(az)+normal[2]*np.sin(az))+normal[1]*np.sin(zz)[:,None]
    whiten*=np.clip((1-align)/.0018,0,1)
    opacity=Image.fromarray(np.uint8(np.rint(whiten*255)),'L').filter(ImageFilter.GaussianBlur(1.1))
    return opacity

if __name__ == '__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('--photo',type=Path,help='Existing checksum-verified original JPG')
    ap.add_argument('--out',type=Path,default=GAME)
    args=ap.parse_args()
    meta=json.loads(request('https://api.polyhaven.com/files/'+ASSET))['tonemapped']
    cache=args.photo or Path(ASSET+'.jpg')
    if not cache.exists():cache.write_bytes(request(meta['url']))
    assert hashlib.md5(cache.read_bytes()).hexdigest()==meta['md5']
    with Image.open(cache) as source:
        source=source.convert('RGB')
        desktop=register(source,7168)
    args.out.mkdir(parents=True,exist_ok=True);(args.out/'mobile').mkdir(exist_ok=True)
    desktop.save(args.out/'alaska-evening.jpg',quality=93,subsampling=0,optimize=True)
    desktop.resize((3072,1536),Image.Resampling.LANCZOS).save(args.out/'mobile/alaska-evening.jpg',quality=91,subsampling=0,optimize=True)
    cloud_density(desktop).save(args.out/'alaska-cirrus-density.webp',quality=91,method=5)
