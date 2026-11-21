"""Rectify the USFWS photograph and NPS station plate into native surface materials."""
import argparse, subprocess
from pathlib import Path
from PIL import Image, ImageOps, ImageEnhance

def extract(im, quad, size, reference_width):
    scale=im.width/reference_width
    pts=[(x*scale,y*scale) for x,y in quad]
    # PIL QUAD uses upper left, lower left, lower right, upper right.
    return im.transform(size,Image.Transform.QUAD,pts[0]+pts[3]+pts[2]+pts[1],Image.Resampling.BICUBIC)

def tile(im, size):
    w,h=size
    out=Image.new('RGB',(w,h))
    for j in range(0,h,im.height):
        for i in range(0,w,im.width):
            tex=ImageOps.mirror(im) if i//im.width%2 else im
            if j//im.height%2:tex=ImageOps.flip(tex)
            out.paste(tex,(i,j))
    return out

def bake(cache,game):
    egg=Image.open(cache/'source/egg-usfws.jpg').convert('RGB')
    plate=cache/'baker-tower-large.jpg'
    if not plate.exists():
        subprocess.run(['pdftoppm','-f','105','-l','105','-r','210','-singlefile','-jpeg',cache/'source/baker-station.pdf',str(plate.with_suffix(''))],check=True)
    baker=Image.open(plate).convert('RGB')
    facade=extract(egg,[(357,505),(817,501),(822,605),(357,609)],(1536,384),1100)
    facade.save(game/'acadia-egg-west-front.webp',quality=93,method=6)
    dormer=extract(egg,[(463,423),(706,420),(708,480),(463,483)],(768,208),1100)
    dormer.save(game/'acadia-egg-dormer.webp',quality=92,method=6)
    masonry=extract(baker,[(242,266),(282,268),(283,367),(243,372)],(128,300),695)
    paint=tile(masonry,(512,600))
    # The site has been maintained since the 2012 inspection. Retain the
    # photographed brick relief while softening the extent of historic spalls.
    paint=Image.blend(paint,Image.new('RGB',paint.size,(222,218,205)),.24)
    paint.save(game/'acadia-baker-masonry.webp',quality=92,method=6)
    boards=extract(egg,[(631,522),(688,521),(689,595),(631,596)],(156,226),1100)
    tile(boards,(624,452)).save(game/'acadia-keeper-clapboards.webp',quality=91,method=6)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('cache',type=Path);p.add_argument('game',type=Path);a=p.parse_args();bake(a.cache,a.game)
