"""Rectify the nearby measured Lofoten lithology from Simo Räsänen’s detailed shoreline photograph."""
from pathlib import Path
import sys
import numpy as np
from scipy.ndimage import gaussian_filter
from PIL import Image
from reinebringen_photographs import rgb_source
p=Path(__file__).parent
def make(cache,game):
    raw=rgb_source(cache,'45328139').crop((1580,22,3540,975))
    rgb=np.asarray(raw,dtype='f4')/255;luma=rgb@np.array([.245,.59,.165])
    broad=gaussian_filter(luma,63);fissure=(luma+.035)/(broad+.035)
    chroma=rgb/(luma[:,:,None]+.014)
    # Recover mineral grain and joint shadows while removing the photograph's muted daylight gradient.
    signal=np.clip(.53*np.power(np.clip(fissure,.28,2.),.84)[:,:,None]*np.clip(.87+.13*chroma,.85,1.13),.20,.85)
    def wrap(vals,axis,n):
        a=np.moveaxis(vals,axis,0);f=np.linspace(0,1,n,dtype='f4')[:,None,None];f=f*f*(3-2*f);j=a[-n:]*(1-f)+a[:n]*f
        return np.moveaxis(np.concatenate([j,a[n:-n]],axis=0),0,axis)
    tile=Image.fromarray(np.uint8(wrap(wrap(signal,1,212),0,94)*255)).resize((1024,512),Image.Resampling.LANCZOS)
    meta=b'<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:cc="http://creativecommons.org/ns#"><dc:creator>Simo Ras anen (Ximonic)</dc:creator><dc:rights>Adapted from Marken V in Reine, Lofoten, Norway, 2015 September. Original and repeating field texture are CC BY-SA 3.0.</dc:rights><cc:license rdf:resource="https://creativecommons.org/licenses/by-sa/3.0/"/><dc:source>https://commons.wikimedia.org/wiki/File:Marken_V_in_Reine,_Lofoten,_Norway,_2015_September.jpg</dc:source><dc:description>Cropped local rock, corrected illumination and blended seams.</dc:description></rdf:Description></rdf:RDF></x:xmpmeta>'
    meta=meta.replace(b'Ras anen','Räsänen'.encode());tile.save(game/'reinebringen-jointed-rock.webp',quality=91,method=6,xmp=meta)
