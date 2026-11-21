"""Project two CC BY-SA 3.0 field photographs from Reinevågen to the measured walls."""
from pathlib import Path
from urllib.request import Request,urlopen
from PIL import Image,ImageDraw
import hashlib,sys
import numpy as np,rasterio
from scipy.ndimage import minimum_filter,maximum_filter,distance_transform_edt,gaussian_filter
Q39=[1840.83263,.5,4199.23631,-110.92891,7.76639,.290390,1931.80954]
Q47=[1842.89273,2.9,4186.10249,-65.91144,10.88115,-.039326,688.025787]
SOURCES={
 '45328139':('https://upload.wikimedia.org/wikipedia/commons/d/dc/Marken_V_in_Reine%2C_Lofoten%2C_Norway%2C_2015_September.jpg','f69ecd0a2d89e3af33b7b790f3c3ca0aa5993d50a4c979fd9c8872b4b157e05d',1150,767,Q39),
 '45328147':('https://upload.wikimedia.org/wikipedia/commons/2/2f/Hammarskaftet_at_Reine%2C_Lofoten%2C_Norway%2C_2015_September.jpg','97d2ebd79f41317455d51bd910e5a53edcfddab9d88ef4e35210f51ea3a63785',900,391,Q47),
}
def rgb_source(cache,key):
    url,digest,*_=SOURCES[key];path=cache/f'source-{key}.jpg'
    if not path.exists():
        with urlopen(Request(url,headers={'User-Agent':'Aerie field site producer/1.0'}),timeout=90)as r:path.write_bytes(r.read())
    if hashlib.sha256(path.read_bytes()).hexdigest()!=digest:raise ValueError('Reine source photograph changed: '+key)
    return Image.open(path).convert('RGB')

def film(x,y,z,q,w,h):
    ox,oy,oz,az,pit,roll,f=q;az,pit,roll=np.radians([az,pit,roll]);dx=x-ox;dy=y-oy;dz=z-oz
    side=dx*np.cos(az)+dz*np.sin(az);horizontal=dx*np.sin(az)-dz*np.cos(az);fwd=horizontal*np.cos(pit)+dy*np.sin(pit)
    below=horizontal*np.sin(pit)-dy*np.cos(pit)
    return .5+f/w*(side*np.cos(roll)+below*np.sin(roll))/np.maximum(fwd,.1),.5+f/h*(below*np.cos(roll)-side*np.sin(roll))/np.maximum(fwd,.1),fwd

def build(cache,game):
    with rasterio.open(cache/'reine-west-face-2m.tif')as src:dtm=src.read(1)
    z,x=np.mgrid[3272:5662:2,-600:1906:2];atlas=Image.new('RGBA',(2304,768))
    metadata='''<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:cc="http://creativecommons.org/ns#"><dc:creator>Simo Räsänen (Ximonic)</dc:creator><dc:rights>Photographs © Simo Räsänen, 20 September 2015. Derived terrain field texture licensed CC BY-SA 3.0.</dc:rights><cc:license rdf:resource="https://creativecommons.org/licenses/by-sa/3.0/"/><dc:source><rdf:Bag><rdf:li>https://commons.wikimedia.org/wiki/File:Marken_V_in_Reine,_Lofoten,_Norway,_2015_September.jpg</rdf:li><rdf:li>https://commons.wikimedia.org/wiki/File:Hammarskaftet_at_Reine,_Lofoten,_Norway,_2015_September.jpg</rdf:li></rdf:Bag></dc:source><dc:description>Registered to coast-building and ridgeline controls, cropped, balanced daylight and autumn colour, and packed with geographic visibility derived from Kartverket terrain.</dc:description></rdf:Description></rdf:RDF></x:xmpmeta>'''
    for k,(name,(_,_,W,H,q))in enumerate(SOURCES.items()):
        pic=rgb_source(cache,name);w,h=1152,768
        source=pic.resize((w,h),Image.Resampling.LANCZOS);rgb=np.asarray(source,dtype='f4')/255
        u,v,dep=film(x,dtm,z,q,W,H);target=(dep>270)&(dep<2500)&(dtm>14)&(u>0)&(u<1)&(v>0)&(v<1)
        sw,sh=576,384;col=np.clip((u[target]*sw).astype(int),0,sw-1);row=np.clip((v[target]*sh).astype(int),0,sh-1)
        buf=np.full(sw*sh,np.inf,dtype='f4');np.minimum.at(buf,row*sw+col,dep[target]);buf=buf.reshape(sh,sw)
        # A sample facing away from the camera returns only when it is genuinely the nearest visible wall.
        near=minimum_filter(buf,size=5);good=np.isfinite(near);ds,idx=distance_transform_edt(~good,return_indices=True)
        near=near[tuple(idx)]
        depth=np.array(Image.fromarray(near).resize((w,h),Image.Resampling.BILINEAR))
        valid=np.asarray(Image.fromarray(np.uint8(255*(ds<2.7))).resize((w,h),Image.Resampling.NEAREST))>0
        if k==0:
            mask=Image.new('L',(W,H));dk=ImageDraw.Draw(mask);dk.polygon([(0,0),(W,0),(W,492),(865,504),(680,507),(526,506),(325,523),(115,534),(0,545)],fill=255)
        else:
            mask=Image.new('L',(W,H));dk=ImageDraw.Draw(mask)
            dk.polygon([(0,95),(60,92),(92,104),(143,128),(208,140),(248,139),(279,130),(301,112),(318,91),(332,80),(340,87),(351,108),(370,149),(390,180),(400,202),(432,209),(448,221),(457,240),(466,264),(491,282),(508,288),(565,296),(602,308),(637,321),(650,330),(601,327),(535,319),(485,312),(418,309),(351,306),(284,304),(219,302),(156,307),(83,306),(0,317)],fill=255)
        mask=np.asarray(mask.resize((w,h),Image.Resampling.NEAREST))>0
        confidence=distance_transform_edt(mask&valid)
        # Record only the sampled wall. Its depth prevents the nearby spur's photograph appearing on the farther skyline.
        encoded=np.uint8(np.clip(.10+.86*np.log(np.maximum(depth,250)/250)/np.log(2600/250),.10,.96)*255)
        A=np.where(confidence>2,encoded,0).astype('u1')
        L=rgb@np.array([.245,.59,.165]);broad=gaussian_filter(L,32);middle=gaussian_filter(L,4.)
        # Pack local rock contrast separately from source lighting. A cloud edge
        # from the September image must not paint a bright rectangle at dusk.
        detail=np.clip(.50+.26*np.log2((L+.06)/(broad+.06))+.045*np.log2((middle+.06)/(broad+.06)),.12,.87)
        plant=np.clip((np.minimum(rgb[:,:,0],rgb[:,:,1])-rgb[:,:,2]-.025)/.14,0,1)
        feather=np.clip((confidence-2)/36,0,1);feather=feather*feather*(3.-2.*feather)
        surface=Image.fromarray(np.dstack([np.uint8(255*detail),np.uint8(255*plant),np.uint8(255*feather),A]))
        atlas.paste(surface,(k*1152,0))
    atlas.save(game/'reinebringen-obliques.webp',quality=91,method=6,xmp=metadata.encode())
