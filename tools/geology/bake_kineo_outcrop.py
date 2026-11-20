"""Rectify an exposed-rock crop of S. S. Vose's public-domain Kineo stereograph.
Use the first exposure, mask the trees and sky, and remove the albumen print tint.
The result is a regional surface texture, not an image of a game camera or sky.
"""
import argparse
import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates, gaussian_filter
p=argparse.ArgumentParser();p.add_argument('photograph');p.add_argument('output')
args=p.parse_args()
photo=np.asarray(Image.open(args.photograph).convert('RGB'),dtype='f')/255
# These coordinates are in the inspected 920x489 crop of the first 1147x610 image.
anchors=[0,45,100,160,215,270,330,380,430,485,535,570,595,620,637,650,660,675,692,712]
top=[101,108,105,98,88,90,94,95,95,101,111,128,138,150,167,208,235,270,309,338]
bottom=[244,242,243,252,267,284,300,301,309,317,321,333,342,346,350,354,358,366,371,378]
u,v=np.meshgrid(np.linspace(0,712,1024),np.linspace(0,1,320))
t=np.interp(u,anchors,top);b=np.interp(u,anchors,bottom)
x=298+u*1147/920
y=90+(t+(b-t)*v)*610/489
lum=photo@np.array([.29,.61,.10],dtype='f')
# Uniform faded paper/patina is filtered at a scale much wider than weathered joints.
reflectance=map_coordinates(lum,[y,x],order=1)
low=gaussian_filter(reflectance,(31,62))
relief=(reflectance-low)/(low+.06)
broad=(low-np.median(low))/max(.1,np.median(low))
rock=np.clip(.47+1.08*relief+.47*broad,.16,.73)
rgb=rock[:,:,None]*np.array([1.007,.999,.979])[None,None,:]
Image.fromarray(np.uint8(np.clip(rgb,0,1)*255)).save(args.output,quality=95,method=6)
