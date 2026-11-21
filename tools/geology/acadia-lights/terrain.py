"""Bake Acadia's offshore islands from NOAA topobathymetry, USGS 3DEP and USDA NAIP."""
import argparse
import base64
import re
import json
import struct
from pathlib import Path

import numpy as np
from PIL import Image
from pydelatin import Delatin
import rasterio
from rasterio.transform import Affine
from rasterio.warp import reproject, Resampling
from scipy.ndimage import distance_transform_edt, gaussian_filter, maximum_filter, map_coordinates

ORIGIN = (564651, 4907768)
SITES = {
    'egg': ('eggrock', (3490, -4320, 4490, -3320), '2022_565000e_4915000n_dem.tif', .11),
    'baker': ('bakerisland', (-1359, 8086, -43, 9412), '2022_560000e_4900000n_dem.tif', .19),
}

def grid(path, bounds):
    l, t, r, b = bounds
    result = np.full((b-t+1, r-l+1), np.nan, 'f4')
    transform = Affine(1, 0, ORIGIN[0]+l-.5, 0, -1, ORIGIN[1]-t+.5)
    with rasterio.open(path) as source:
        reproject(rasterio.band(source, 1), result, dst_transform=transform, dst_crs='EPSG:32619',
                  dst_nodata=np.nan, resampling=Resampling.bilinear)
    return result

def island_surface(source, key, bounds, dem):
    topo = grid(source / dem, bounds)
    land = grid(source / (key+'-full-ground.tiff'), bounds)
    valid = np.isfinite(topo)
    distance, nearest = distance_transform_edt(~valid, return_indices=True)
    # The NGS survey ends in deep water. Use the nearest recorded depth close
    # to that edge. Beyond it, the submerged backing is only a rendering floor.
    dry = np.nan_to_num(land, nan=-4)
    fallback = np.where(dry > -.5, dry, -14)
    weight = np.clip(1-distance/28, 0, 1)
    result = np.where(valid, topo, fallback+(topo[tuple(nearest)]-fallback)*weight)
    return result.astype('f4'), valid

def forest_heights(cache, key, bounds, dtm):
    l, t, r, b = bounds
    surface = dtm.copy()
    for file in sorted((cache/'point-crops'/key).glob('*.npz')):
        with np.load(file) as records:
            if 'land_x' not in records: continue
            i = np.rint(records['land_x']-l).astype('i4')
            j = np.rint(records['land_z']-t).astype('i4')
            ok = (i>=0)&(i<surface.shape[1])&(j>=0)&(j<surface.shape[0])
            np.maximum.at(surface, (j[ok],i[ok]), records['land_y'][ok])
    canopy = np.maximum(0, surface-dtm)
    # Interpret crown apices only in mapped forest. Omit keepers' roofs, stone
    # walls and outbuildings in the station and the northern landing clearing.
    # A sparse aerial return from a roof must not make a tree. Crown height,
    # continuity on all sides and the source's summer forest classification
    # preserve conifers that look purple in the leaf-off federal RGB sample.
    summer = np.asarray(Image.open(cache/'source'/(key+'-full-coast.jpg')).resize(
        (dtm.shape[1],dtm.shape[0]), Image.Resampling.BILINEAR), dtype='f4')
    green = (summer[:,:,1]>summer[:,:,0]*1.06)&(summer[:,:,1]>summer[:,:,2]*.92)
    field = gaussian_filter(canopy, 1.0)
    tree = (field==maximum_filter(field, size=7))&(canopy>3.7)&(dtm>1.)
    tree &= (gaussian_filter(green.astype('f4'),1.5)>.45)&(gaussian_filter((canopy>2.7).astype('f4'),2.0)>.60)
    z,x = np.where(tree)
    roots = []
    for i,j in zip(x,z):
        X,Z=i+l,j+t
        if -701<X< -666 and 8774<Z<8805 or -735<X< -719 and 8790<Z<8823: continue
        height = float(canopy[j,i])
        ridge = field[max(0,j-7):j+8,max(0,i-7):i+8]
        radius = np.clip(np.sqrt(np.count_nonzero(ridge>height*.73)/np.pi),1.05,min(5.5,height*.35))
        roots.append([int(X),int(Z),round(height*4),round(float(radius)*2*8)])
    return np.clip(gaussian_filter((canopy>2.9).astype('f4'),2.1),0,1), roots, surface

def mesh(path, bounds, y, cover, tolerance):
    # One continuous triangulation; then split along shared vertices for culling.
    # Deep bottom relief is preserved in the flight grid and optical depth
    # field. Submerged triangles outside the visible shoal can be much coarser.
    relief_y = np.where(y < -2, -2 + .09*(y+2), y).astype('f4')
    mesh = Delatin(np.ascontiguousarray(relief_y), max_error=tolerance)
    col = mesh.vertices[:,0].astype('i4')
    row = y.shape[0]-1-mesh.vertices[:,1].astype('i4')
    zz = np.c_[col,row]; triangles = np.array(mesh.triangles,dtype='i4')
    a,b,c = zz[triangles[0]]
    if (b[0]-a[0])*(c[1]-a[1])>(b[1]-a[1])*(c[0]-a[0]): triangles=triangles[:,::-1]
    datum = float(np.floor(y.min())-1)
    scale = .01
    xyz = np.c_[col*4,row*4,np.rint((y[row,col]-datum)/scale)].astype('<u2')
    relief = np.maximum(0,gaussian_filter(y,5)-y)
    light = np.c_[np.clip(255-10*relief[row,col],130,255),np.zeros(len(col)),255*cover[row,col],np.full(len(col),255)].astype('u1')
    bucket = (zz[triangles].mean(1)//220).astype(int)
    bucket = bucket[:,0]+16*bucket[:,1]
    sections = np.unique(bucket)
    sampled = y[::2,::2]
    nz,nx = sampled.shape
    with path.open('wb') as out:
        out.write(struct.pack('<4sHH4iHHffI',b'ARF1',2,8,*bounds,nx,nz,datum,scale,len(sections)))
        out.write(np.rint((sampled-datum)/scale).astype('<i2').tobytes())
        for k in sections:
            verts,indices = np.unique(triangles[bucket==k],return_inverse=True)
            assert len(verts)<65536
            out.write(struct.pack('<II',len(verts),indices.size//3))
            for data in (xyz[verts],light[verts],indices.astype('<u2')):out.write(data.tobytes())
        # A sub-pixel horizon approximation keeps both remote islands inexpensive
        # when flying the mainland. Positions and lighting use the same source grid.
        far = Delatin(np.ascontiguousarray(relief_y),max_error=.84)
        fx=far.vertices[:,0].astype(int);fz=y.shape[0]-1-far.vertices[:,1].astype(int)
        fp=np.c_[fx*4,fz*4,np.rint((y[fz,fx]-datum)/scale)].astype('<u2')
        fc=np.c_[np.clip(255-10*relief[fz,fx],130,255),np.zeros(len(fx)),255*cover[fz,fx],np.full(len(fx),255)].astype('u1')
        ft=np.asarray(far.triangles,'i4')
        a,b,c=np.c_[fx,fz][ft[0]]
        if (b[0]-a[0])*(c[1]-a[1])>(b[1]-a[1])*(c[0]-a[0]):ft=ft[:,::-1]
        assert len(fp)<65536
        out.write(struct.pack('<4sII',b'LOD1',len(fp),len(ft)))
        for data in (fp,fc,ft.astype('<u2')):out.write(data.tobytes())
    return len(triangles),len(ft)

def horizon_field(key,bounds,dtm,surface,game):
    l,t,r,b=bounds
    lamp=(4038.74,22.10,-3787.06) if key=='egg' else (-693.13,40.03,8792.34)
    source=(game/'atlas-acadia-survey.js').read_text()
    outer=np.frombuffer(base64.b64decode(re.search(r'"outer":"([^"]+)"',source)[1]),'<i2')*.25
    n=round(np.sqrt(len(outer)));outer=outer.reshape(n,n);half=float(re.search(r'"farHalf":([0-9.]+)',source)[1])
    bearings=(np.arange(1024)+.5)*2*np.pi/1024-np.pi
    directions=np.c_[np.cos(bearings),np.sin(bearings)]
    pixels=np.geomspace(4.0,18000,129);high=np.full(1024,-1.48);result=[]
    effective=dtm+.82*gaussian_filter(np.maximum(0,surface-dtm),.65)
    for j in range(128):
        for dist in np.linspace(pixels[j],pixels[j+1],5):
            x=lamp[0]+dist*directions[:,0];z=lamp[2]+dist*directions[:,1]
            y=map_coordinates(outer,[(z/half*.5+.5)*(n-1),(x/half*.5+.5)*(n-1)],order=1,mode='nearest')
            inside=(x>l)&(x<r)&(z>t)&(z<b)
            y[inside]=map_coordinates(effective,[z[inside]-t,x[inside]-l],order=1,mode='nearest')
            if dist> (7.5 if key=='egg' else 3.2):
                high=np.maximum(high,np.arctan2(y-lamp[1],dist))
        result.append(high.copy())
    angle=np.array(result);encoded=np.rint(np.clip((angle+1.50)/2.,0,1)*65535).astype('u2')
    return Image.fromarray(np.stack([encoded>>8,encoded&255,np.zeros_like(encoded),np.full_like(encoded,255)],-1).astype('u1'))


def tide_field(ground, measured):
    sea=.16
    land=ground>sea
    # Retain the sign and gradient at low shoals, including isolated ridges.
    sea_dist=distance_transform_edt(~land)
    distance=sea_dist-distance_transform_edt(land)
    smooth=gaussian_filter(distance,2.5)
    dz,dx=np.gradient(smooth)
    norm=np.maximum(.001,np.hypot(dx,dz))
    rgb=np.stack([np.clip((distance+12)/116,0,1),dx/norm*.5+.5,dz/norm*.5+.5],axis=-1)
    depth=np.sqrt(np.clip((sea-ground)/22,0,1))
    alpha=np.where(measured,.5+.495*depth,.49)
    return Image.fromarray(np.rint(np.dstack([rgb,alpha])*255).astype('u1'))

def station_ground(image, key, bounds):
    # Replace orthographic roofs and their daytime cast shadows under the
    # modeled stations with undisturbed ground from the same clearing.
    # The donor areas are real island turf/lichen, sampled at the original GSD.
    regions = {
        'egg': [(4029,-3788,18,11,3,-25), (4035,-3764,11,7,3,-48)],
        'baker': [(-692,8787,11.5,10,-1,22), (-703.5,8786,13,6.5,0,19)],
    }
    w,h=image.size;left,top,right,bottom=bounds
    sx=w/(right-left);sz=h/(bottom-top);result=image.copy()
    for x,z,rx,rz,dx,dz in regions[key]:
        px=(x-left)*sx;py=(z-top)*sz
        box=(int(px-rx*sx-3),int(py-rz*sz-3),int(px+rx*sx+4),int(py+rz*sz+4))
        cols,rows=np.meshgrid(np.arange(box[0],box[2]),np.arange(box[1],box[3]))
        radius=np.maximum(abs(cols+.5-px)/(rx*sx),abs(rows+.5-py)/(rz*sz))
        alpha=np.clip((1.08-radius)/.24,0,1);alpha=alpha*alpha*(3-2*alpha)
        donor=(box[0]+round(dx*sx),box[1]+round(dz*sz),box[2]+round(dx*sx),box[3]+round(dz*sz))
        result.paste(image.crop(donor),(box[0],box[1]),Image.fromarray(np.uint8(alpha*255)))
    return result

def bake(cache, game):
    source=cache/'source'
    shore=Image.new('RGBA',(2048,1152));results={}
    for idx,(key,(name,bounds,dem,tolerance)) in enumerate(SITES.items()):
        y,measured=island_surface(source,key,bounds,dem)
        cover,roots,surface=forest_heights(cache,key,bounds,y) if key=='baker' else (np.zeros_like(y),[],y)
        img=Image.open(source/(key+'-full-naip.jpg')).convert('RGB')
        station_ground(img,key,bounds).save(game/('landform-'+name+'-aerial.webp'),quality=91,method=6)
        triangles,distant=mesh(game/('landform-'+name+'.bin'),bounds,y,cover,tolerance)
        tidal=tide_field(y,measured).resize((1024,1024),Image.Resampling.BILINEAR)
        shore.paste(tidal,(idx*1024,0))
        shore.paste(horizon_field(key,bounds,y,surface,game),(idx*1024,1024))
        if roots:
            arr=np.asarray(roots,dtype='<i2')
            (game/'acadia-baker-crowns.bin').write_bytes(arr.tobytes())
        results[key]=dict(bounds=bounds,triangles=triangles,distantFaces=distant,retainedCrowns=len(roots),measuredBedFraction=float(measured.mean()))
        print(key,results[key],flush=True)
    shore.save(game/'acadia-island-tides.png',optimize=True)
    return results

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('cache',type=Path);p.add_argument('game',type=Path);args=p.parse_args()
    results=bake(args.cache,args.game)
    (args.cache/'island-bake.json').write_text(json.dumps(results,indent=2)+'\n')
