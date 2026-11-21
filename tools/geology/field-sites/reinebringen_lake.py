"""Measure the real reflected skyline and rock on Reinevatnet from four water-level viewpoints."""
from pathlib import Path
from PIL import Image
import json,sys
import numpy as np,rasterio
from scipy.ndimage import map_coordinates,gaussian_filter
from bake_reinebringen import WALL
def bake(cache,game):
    l,t,r,b=WALL
    photo=np.asarray(Image.open(game/'landform-reinebringen-aerial.webp').convert('RGB'),dtype='f4')
    with rasterio.open(cache/'reine-west-face-2m.tif')as s:h=s.read(1)
    gz,gx=np.gradient(h,2);xw=[800,1060];zw=[4250,4440];level=json.loads((game/'lofoten-reinevatnet-data.js').read_text().split('=',1)[1].split(';',1)[0])['level']
    width=700;height=177
    rgba=Image.new('RGBA',(width*2,height*2));angles=np.linspace(-np.pi,np.pi,width,dtype='f4')
    d=np.r_[np.arange(3,190,1.65),np.arange(190,650,2.7),np.arange(650,2190,6.8)].astype('f4')
    for j,z0 in enumerate(zw):
        for i,x0 in enumerate(xw):
            x=x0+np.cos(angles)[:,None]*d;z=z0+np.sin(angles)[:,None]*d
            def sample(a,x,z):return map_coordinates(a,[(z-3272)/2,(x+600)/2],order=1,mode='nearest')
            loc=sample(h,x,z);dz=sample(gz,x,z);dx=sample(gx,x,z)
            limit=np.maximum(.0,(loc-(level+.74))/d)
            ang=np.arctan(limit);surfaces=np.zeros((height,width,4),dtype='u1')
            az=np.arange(width);unit=1/np.sqrt(dx*dx+dz*dz+1)
            nx=-dx*unit;ny=unit;nz=-dz*unit
            # At this hour the walls block the low WSW sun from most of the basin.
            skyExposure=np.clip(.55+.31*ny+.10*np.maximum(.0,-nx*.42-nz*.9),.30,.95)
            color=np.stack([map_coordinates(photo[:,:,k],[(z-t)/2,(x-l)/2],order=1,mode='nearest') for k in range(3)],axis=2)
            rgb=np.clip(color*skyExposure[:,:,None]*np.array([.76,.75,.84]),0,255)
            for row,elev in enumerate(np.linspace(np.pi*.504,-.043,height)):
                eligible=(ang>max(.001,elev))&(loc>level+.80)
                ix=np.argmax(eligible,axis=1);valid=np.any(eligible,axis=1)
                surfaces[row,:,:3]=np.where(valid[:,None],rgb[az,ix],np.array([40,45,48]))
                surfaces[row,:,3]=valid*255
            rgba.paste(Image.fromarray(surfaces),(i*width,j*height))
    rgba.save(game/'reinevatnet-reflected-walls.webp',quality=92,method=6)
