"""Original DHC-3 paint/aluminium material. No source-photograph pixels are used."""
from pathlib import Path
import argparse, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont

def make(file):
    width,height=2048,1024
    rng=np.random.default_rng(23081952)
    yy,xx=np.mgrid[:height,:width]
    skin=np.zeros((height,width,3),float)
    base=np.array([207.,202.,183.])
    grain=rng.normal(0,1.22,(height,width))+.54*np.sin(xx*.35+np.sin(yy*.039))+.54*np.cos(yy*.945)
    s=(xx-4)*12.8/2040
    y=4.62-(yy-4)*3.9/496
    # The outer enamel belt tapers toward the rudder. The cowl ring wraps the engine.
    belt=2.62-.12*np.minimum(1,s/12.63)
    thick=.132-.092*np.minimum(1,s/12.63)
    belly=np.clip((1.65+.51*s/12.7-y)*3.,0,1)
    skin[:]=base
    skin+=belly[:,:,None]*np.array([-52,-43,-29])
    lower=(s<1.06+.11*np.minimum(1,np.maximum(0,(y-2.1)*3))) | (abs(y-belt)<thick)
    edge=abs(y-belt)<thick+.031
    skin[edge]=[68,52,43]
    skin[lower]=[184,77,27]
    skin[:,:,:]+=grain[:,:,None]
    # The lower sheet is a lightly oxidized generic wing/float sheet with real-scale lap seams.
    skin[512:]=np.array([215.,212.,196.])+grain[512:,:,None]
    image=Image.fromarray(np.clip(skin,0,255).astype('uint8'),'RGB')
    d=ImageDraw.Draw(image,'RGBA')
    px=lambda st:int(4+st/12.8*2040)
    py=lambda h:int(4+(4.62-h)/3.9*496)
    def mark(st,el,color,r=.8):
        x,y=px(st),py(el);d.ellipse([x-r,y-r,x+r,y+r],fill=color)
    for n,st in enumerate([1.03,1.58,2.06,2.52,3.20,3.86,4.55,5.23,5.91,6.62,7.36,8.07,8.8,9.55,10.31,11.06,11.84,12.37]):
        top=4.34 if n>14 else 3.7
        d.line((px(st),py(top),px(st),py(.94)),fill=(58,51,40,63),width=1)
        d.line((px(st)+1,py(top),px(st)+1,py(.94)),fill=(250,243,220,112),width=1)
        for el in np.arange(1,top,.089):
            mark(st-.021,el,(69,60,47,80))
            mark(st-.021,el+.009,(244,233,208,85))
    for low in [1.34,1.52,1.84,2.99,3.25]:
        pts=[(px(v),py(low+.55*(v/12.75)**2)) for v in np.arange(.5,12.78,.06)]
        d.line(pts,fill=(75,68,52,42))
        for st in np.arange(.53,12.65,.081):mark(st,low+.55*(st/12.75)**2+.015,(64,59,48,68),.68)
    # Rounded front and split cargo doors with pressed flanges, seals and understated handles.
    for st0,st1,bot,top,rad in [(2.01,3.18,1.78,3.57,15),(5.63,6.55,1.61,3.52,11),(6.56,7.38,1.61,3.52,11)]:
        rect=(px(st0),py(top),px(st1),py(bot))
        d.rounded_rectangle(rect,radius=rad,outline=(42,47,42,166),width=2)
        d.rounded_rectangle((rect[0]+3,rect[1]+3,rect[2]-3,rect[3]-3),radius=rad-3,outline=(252,235,208,110),width=1)
        x,y=px(st1-.15),py(2.38);d.rounded_rectangle((x-6,y-2,x+5,y+2),radius=2,fill=(63,63,55,240))
        for el in [1.74,2.84]:d.rectangle((px(st0)-2,py(el)-3,px(st0)+2,py(el)+3),fill=(104,103,91,230))
    # Hand-drawn period-style operator livery based on the family print and historical type images.
    # The operator name is factual. No registration has been inferred.
    org=(px(7.66),py(3.18));ox,oy=org
    emblem=(164,79,31,255); dark=(76,59,37,255)
    d.polygon([(ox,oy+17),(ox+10,oy+12),(ox+17,oy+9),(ox+25,oy+13),(ox+13,oy+19),(ox+8,oy+29)],fill=dark)
    for coords in [[(13,11),(10,4),(11,-3),(7,-8)],[(15,10),(18,2),(24,0),(28,-7)],[(12,5),(6,1),(4,-5)],[(18,3),(17,-4)],[(23,0),(22,-6)]]:
        d.line([(ox+x,oy+y) for x,y in coords],fill=dark,width=2)
    for i in range(3):
        d.polygon([(ox+23-i*2,oy+8+i*4),(ox+73-i*4,oy+8+i*4),(ox+70-i*4,oy+10+i*4),(ox+19-i*2,oy+10+i*4)],fill=emblem)
    for i,word in enumerate(['LABRADOR','AIR SAFARI']):
        d.text((ox+20,oy+19+i*10),word,font=ImageFont.load_default(size=10),fill=dark,stroke_width=0)
    for color,offset in [((73,68,59,81),0),((248,244,222,112),1)]:
        for a in range(40,2035,159):
            d.line((a+offset,526,a+offset,1009),fill=color)
            for b in range(534,1005,10):
                d.ellipse((a+3+offset,b+offset,a+4+offset,b+1+offset),fill=color)
        for a in [558,665,862,944,996]:
            d.line((4,a+offset,2044,a+offset),fill=color)
            for b in range(6,2041,12):
                d.ellipse((b+offset,a+4+offset,b+1+offset,a+5+offset),fill=color)
    image.save(file,'WEBP',quality=89,method=5)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('output',type=Path);make(p.parse_args().output)
