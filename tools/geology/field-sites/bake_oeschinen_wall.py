"""Register summer field photographs to the Oeschinensee east wall.

Usage: python bake_oeschinen_wall.py --cache /path/to/cache --output /path/to/output.
The cropped photo and its terrain visibility share one RGBA texture.
"""
import argparse
import base64
import json
from pathlib import Path
from urllib.request import Request, urlopen

import numpy as np
from PIL import Image, ImageDraw
from scipy.interpolate import LinearNDInterpolator
from scipy.ndimage import distance_transform_edt, gaussian_filter, map_coordinates
from scipy.spatial import Delaunay, cKDTree

HERE = Path(__file__).resolve().parent
GAME = HERE.parents[2] / "game"
DRONE = ("https://upload.wikimedia.org/wikipedia/commons/1/1a/"
         "Oeschinen_Lake_%28Oeschinensee%29_panorama_from_above_140622.jpg")
SHORE = ("https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/"
         "Oeschinensee_panorama_view_with_turquoise_water.jpg/"
         "3840px-Oeschinensee_panorama_view_with_turquoise_water.jpg")
# The first camera was fitted in LV95 against the game survey silhouette and
# far waterline. Its effective projection altitude accounts for panorama stitching.
CX, CZ, CY = -1104.492216, 350.411864, 1839.932841
HEADING, SPAN = 87.1353882, 229.6404732
MID, FOCAL = 267.4484402, 6.9704107
BEND, ROLL, CURVE = -.00564685, .00761974, -.03737476
FIELD_METADATA = b"""<x:xmpmeta xmlns:x="adobe:ns:meta/">
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:cc="http://creativecommons.org/ns#">
<dc:title>Oeschinensee east limestone wall, Aerie adaptation</dc:title>
<dc:creator><rdf:Seq><rdf:li>Bob Tan</rdf:li><rdf:li>Deralpinbergsteiger</rdf:li></rdf:Seq></dc:creator>
<dc:rights>Photographs (c) Bob Tan and Deralpinbergsteiger. Derived field texture licensed CC BY-SA 4.0.</dc:rights>
<cc:license rdf:resource="https://creativecommons.org/licenses/by-sa/4.0/"/>
<dc:source><rdf:Bag>
<rdf:li>https://commons.wikimedia.org/wiki/File:Oeschinen_Lake_(Oeschinensee)_panorama_from_above_140622.jpg</rdf:li>
<rdf:li>https://commons.wikimedia.org/wiki/File:Oeschinensee_panorama_view_with_turquoise_water.jpg</rdf:li>
</rdf:Bag></dc:source>
<dc:description>June and July 2022 summer views cropped, matched to the surveyed wall, exposure-balanced, blended and packed with a terrain visibility channel from swisstopo. Mobile edition resampled.</dc:description>
</rdf:Description></rdf:RDF></x:xmpmeta>"""
CROP = (3100, 420, 5780, 1950)
WIDTH, HEIGHT = 2100, 1199


def fetch(cache, name, url):
    path = cache / name
    if not path.exists():
        query = Request(url, headers={"User-Agent":"Aerie terrain source bake/1.0"})
        with urlopen(query, timeout=90) as stream:
            data = stream.read()
        path.write_bytes(data)
    return Image.open(path).convert("RGB")


def smooth(lo, hi, values):
    t = np.clip((values-lo)/(hi-lo), 0, 1)
    return t*t*(3-2*t)


def game_survey(game):
    js = (game / "alpine-survey.js").read_text()
    data = json.loads(js[js.index("{"):js.rfind("}")+1])
    def decode(key, n):
        return np.frombuffer(base64.b64decode(data[key]),dtype="<i2").reshape(n,n)/8 + data["heightOffset"]
    return decode("elevation",1001), decode("region",513)


def observed_depth(game, photo_x, photo_y):
    local, regional = game_survey(game)
    u = photo_x/8192-.5
    angle = np.deg2rad(HEADING + u*SPAN*(1+BEND*u*u))
    rad = np.r_[np.arange(50,1100,2), np.arange(1100,4200,3.5), np.arange(4200,6800,9)][:,None]
    x = CX + rad*np.sin(angle)
    z = CZ - rad*np.cos(angle)
    h = map_coordinates(regional,[(z+16000)/62.5,(x+16000)/62.5],order=1,mode="nearest")
    near = (abs(x)<3980) & (abs(z)<3980)
    h[near] = map_coordinates(local,[(z[near]+4000)/8,(x[near]+4000)/8],order=1,mode="nearest")
    # For each azimuth, the visible rays end where their slope first meets the
    # terrain. The distance channel rejects hidden slopes behind that surface.
    rows = MID-FOCAL*np.rad2deg((h-CY)/rad) + ROLL*u*1600 + CURVE*u*u*1600
    depth = np.zeros((HEIGHT,WIDTH),dtype="f4")
    for col, curve in enumerate(rows.T):
        visible = np.flatnonzero(curve<=np.minimum.accumulate(curve))[::-1]
        depth[:,col] = np.interp(photo_y*(1600/8192),curve[visible],rad[visible,0],left=0,right=0)
    return depth


def brighter_survey(image):
    src = np.asarray(image,dtype="f4")/255
    luma = .26*src[:,:,0]+.60*src[:,:,1]+.14*src[:,:,2]
    nearby, broad = gaussian_filter(luma,16), gaussian_filter(luma,66)
    relative = np.clip(luma/np.maximum(.12,broad),.18,2.6)
    value = np.clip(.49*relative**.54*(.90+.21*broad)+.09*(luma-nearby),.17,.90)
    return value[:,:,None]*(np.array([1.,.995,.986])+np.clip(src-luma[:,:,None],-.20,.20)*.26)


def shore_detail(photo, reference, photo_x, photo_y):
    anchors = np.load(HERE / "source/oeschinen-paired-landmarks.npz")
    first, second = anchors["first"], anchors["second"]
    transform = LinearNDInterpolator(Delaunay(first),second)
    x,y = np.meshgrid((photo_x-3160)/2.4,(photo_y-470)/2.4)
    query = np.c_[x.ravel(),y.ravel()]
    uv = transform(query).reshape(HEIGHT,WIDTH,2)
    unknown = ~np.isfinite(uv[:,:,0])
    uv[unknown] = 0
    nearest = cKDTree(first).query(query)[0].reshape(HEIGHT,WIDTH)
    confidence = (1-smooth(22,54,nearest))*smooth(0,30,distance_transform_edt(~unknown))
    # Cloud above the summit, foreground trees, and the lake cannot be
    # projected onto the stone. Feather the field-photo polygon at these margins.
    contour = [(1,188),(72,152),(145,123),(215,76),(242,55),(280,120),(342,171),(398,139),
               (442,144),(462,170),(552,159),(595,157),(675,151),(741,147),(791,107),
               (848,118),(950,86),(967,149),(868,200),(774,254),(624,305),(556,355),(4,360)]
    mask = Image.new("L",(1000,440))
    ImageDraw.Draw(mask).polygon(contour,fill=255)
    mask = gaussian_filter(np.asarray(mask,dtype="f4")/255,4.3)
    confidence *= map_coordinates(mask,[uv[:,:,1],uv[:,:,0]],order=1,mode="nearest")
    src = np.asarray(photo,dtype="f4")/255
    sample = [uv[:,:,1]*src.shape[0]/440,uv[:,:,0]*src.shape[1]/1000]
    rgb = np.stack([map_coordinates(src[:,:,i],sample,order=1,mode="nearest") for i in range(3)],axis=2)
    luma = .25*rgb[:,:,0]+.60*rgb[:,:,1]+.15*rgb[:,:,2]
    reflected = rgb*(.52/np.maximum(.17,gaussian_filter(luma,49)))[:,:,None]**.31
    gray = (.25*reflected[:,:,0]+.60*reflected[:,:,1]+.15*reflected[:,:,2])[:,:,None]
    corrected = np.clip((gray*.35+reflected*.65)*1.04,0,1)
    return reference*(1-confidence[:,:,None])+corrected*confidence[:,:,None]


def main(cache, game, output):
    cache.mkdir(parents=True,exist_ok=True)
    output.mkdir(parents=True,exist_ok=True)
    drone = fetch(cache,"oeschinen-drone-june-2022.jpg",DRONE)
    shore = fetch(cache,"oeschinen-shore-july-2022-3840.jpg",SHORE)
    if drone.size!=(8192,3320) or shore.size!=(3840,1689):
        raise ValueError("Unexpected dimensions for the registered source photograph")
    photo_x = CROP[0]+(np.arange(WIDTH)+.5)*(CROP[2]-CROP[0])/WIDTH
    photo_y = CROP[1]+(np.arange(HEIGHT)+.5)*(CROP[3]-CROP[1])/HEIGHT
    detail = brighter_survey(drone.crop(CROP).resize((WIDTH,HEIGHT),Image.Resampling.LANCZOS))
    color = shore_detail(shore,detail,photo_x,photo_y)
    depth = observed_depth(game,photo_x,photo_y)
    channel = np.where(depth>0,1+np.minimum(254,np.rint(depth/7000*254)),0)
    image = Image.fromarray(np.dstack([np.uint8(np.clip(color*255,0,255)),np.uint8(channel)]))
    image.save(output/"oeschinen-east-limestone.webp",quality=90,method=6,exact=True,xmp=FIELD_METADATA)
    # Scale independent data channels so the photograph cannot premultiply the
    # packed ray range. Alpha stores a distance, not a transparency percentage.
    phone = Image.merge("RGBA",[c.resize((1050,600),Image.Resampling.LANCZOS) for c in image.split()])
    phone.save(output/"oeschinen-east-limestone-mobile.webp",quality=89,method=6,exact=True,xmp=FIELD_METADATA)


if __name__=="__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache",type=Path,default=Path.home()/".cache/aerie-field-sites")
    parser.add_argument("--game",type=Path,default=GAME)
    parser.add_argument("--output",type=Path,default=GAME)
    args=parser.parse_args()
    main(args.cache,args.game,args.output)
