"""Register the Watchman and Cleetwood to USGS terrain, Oregon lidar, NAIP, and USGS two-metre multibeam bathymetry."""
import argparse, json, struct
from pathlib import Path
import numpy as np
import rasterio
from scipy.ndimage import map_coordinates, gaussian_filter, median_filter, maximum_filter, distance_transform_edt, label
from scipy.spatial import cKDTree
from skimage.measure import find_contours
from shapely.geometry import LineString
from PIL import Image
from pydelatin import Delatin
from trails import build_trail

ORIGIN=(571464,4755190)
LEVEL=1880.78
SURVEYS={'watchman':((-4112,252,-3808,536),(-3940,375,320),.5,.13),'cleetwood':((2460,-3736,3080,-3224),(2736,-3495,660),1.,.24)}

def surface_height(path,x,z):
    with rasterio.open(path) as dataset:
        row=(ORIGIN[1]-z-dataset.transform.f)/dataset.transform.e-.5
        col=(ORIGIN[0]+x-dataset.transform.c)/dataset.transform.a-.5
        raw=dataset.read(1)
    # Fit the local DTM to independent bare-ground returns. Signed optical and geometry offsets are measured separately.
    dx,dz,dy=(-1.046,-.685,.052) if path.name.startswith('watchman') else (-1.171,-.509,.078)
    return map_coordinates(raw,[row+dz,col+dx],order=1,mode='nearest')+dy

def registered_image(path,source_box,bounds,size):
    cx,cz,half=source_box
    l,t,r,b=bounds
    im=Image.open(path).convert('RGB')
    stride=2*half/im.width
    box=((l-cx+half)/stride,(t-cz+half)/stride,(r-cx+half)/stride,(b-cz+half)/stride)
    return im.resize(size,Image.Resampling.LANCZOS,box=box)

def observed_forests(p,source,box,name):
    l,t,r,b=box
    x,z,y=p['x'],p['z'],p['y']
    keep=(x>=l)&(x<r)&(z>=t)&(z<b)
    x,z,y=x[keep],z[keep],y[keep]
    above=y-surface_height(source,x,z)
    canopy=np.zeros((b-t,r-l),dtype='f4')
    row=np.int32(z-t);col=np.int32(x-l)
    np.maximum.at(canopy,(row,col),above)
    canopy=np.maximum(0,canopy)
    if name=='watchman':
        # The 1932 lookout and the retaining wall are the highest returns on the bare summit.
        iz,ix=np.indices(canopy.shape);lx=ix+l+3942.84;lz=iz+t-379.27
        u=.831*lx-.556*lz;v=.556*lx+.831*lz
        canopy[(np.abs(u)<11)&(np.abs(v)<11)]=0
    else:
        iz,ix=np.indices(canopy.shape);canopy[(ix+l>2841)&(ix+l<2876)&(iz+t>-3438)&(iz+t<-3375)]=0
    sm=gaussian_filter(maximum_filter(canopy,3),1.45)
    peaks=(sm==maximum_filter(sm,7))&(sm>(3.2 if name=='watchman' else 5))&(canopy>2.)
    pj,pi=np.where(peaks)
    ordered=np.argsort(sm[pj,pi])[::-1];trees=[];bins={}
    for ix in ordered:
        xx,zz=int(pi[ix]),int(pj[ix]);hh=float(canopy[max(0,zz-2):zz+3,max(0,xx-2):xx+3].max())
        if xx<3 or xx>=r-l-3 or zz<3 or zz>=b-t-3:continue
        width=min(12,max(1.8,float(np.sqrt(np.count_nonzero(canopy[zz-5:zz+6,xx-5:xx+6]>hh*.54))*1.13)))
        key=(xx//9,zz//9)
        if any((xx-a)**2+(zz-d)**2<(min(width,w)*.56)**2 for izz in range(key[1]-1,key[1]+2) for ixx in range(key[0]-1,key[0]+2) for a,d,w in bins.get((ixx,izz),[])):continue
        bins.setdefault(key,[]).append((xx,zz,width));trees.append([l+xx,t+zz,round(hh,1),round(width,1)])
    return canopy,trees

def summit_detail(h,x,z,p,step):
    # Use returns from the exposed andesite faces. Preserve the independent bare-earth data beneath tree crowns and buildings.
    px,pz,py=p['x'],p['z'],p['y']
    use=(px>-3997)&(px<-3900)&(pz>337)&(pz<423)
    pc=p['c'][use];px,pz,py=px[use],pz[use],py[use]
    g=map_coordinates(h,[(pz-z.min())/step,(px-x.min())/step],order=1,mode='nearest')
    u=.831*(px+3942.84)-.556*(pz-379.27);v=.556*(px+3942.84)+.831*(pz-379.27)
    building=((np.abs(u)<4.20)&(np.abs(v)<4.20))|((u>-1.1)&(u<5.8)&(v>2.2)&(v<7.3))
    # Classified soil and rock can deviate from a smoothed DTM, especially at the base of this exposed crest.
    bare=~building
    use=(py-g>-.95)&((py-g<1.32)|((pc==2)&(py-g<3.7)))&bare
    grid=cKDTree(np.c_[px[use],pz[use]])
    area=(x>-3995)&(x<-3902)&(z>339)&(z<421)
    d,i=grid.query(np.c_[x[area],z[area]],k=5)
    weights=1/np.maximum(.15,d)**2
    measured=(py[use][i]*weights).sum(1)/weights.sum(1)
    d0=d[:,0];w=np.clip((1.22-d0)/.84,0,1)
    h[area]+=(measured-h[area])*w
    return h

def lake_bed(h,x,z,sonar,bounds):
    wet=h<1880.75
    # The shoreline follows the hydroflattened 1 m lake margin. Registration of the 2000 sonar uses the measured 1882.6 m acoustic datum.
    footprint=wet&((z>-3460)|(x>2850)) # exclude isolated flats beyond the caldera
    groups,n=label(footprint)
    regions=np.bincount(groups.ravel());regions[0]=0
    lake=groups==np.argmax(regions)
    lake_distance=distance_transform_edt(lake)
    with rasterio.open(sonar) as ds:
        from rasterio.windows import from_bounds,Window
        left,top,right,bottom=bounds;e,n=ORIGIN
        raw_window=from_bounds(e+left-10,n-bottom-10,e+right+10,n-top+10,ds.transform).round_offsets().round_lengths()
        bed=ds.read(1,window=raw_window);tr=ds.window_transform(raw_window)
        valid=bed>-1000
        index=distance_transform_edt(~valid,return_distances=False,return_indices=True);continuous=bed[tuple(index)]
        row=(n-z-tr.f)/tr.e-.5;col=(e+x-tr.c)/tr.a-.5
        sample=map_coordinates(continuous,[row,col],order=1,mode='nearest');distance=map_coordinates(distance_transform_edt(~valid)*2,[row,col],order=1,mode='nearest')
    depth=np.maximum(0,1882.6-sample)
    constrained=np.clip((lake_distance-.2)/5,0,1)
    shore=np.minimum(lake_distance*.28,4.8)
    w=np.clip(1-distance/11,0,1)*constrained
    h[lake]=LEVEL-.095-(shore*(1-w)+depth*w)[lake]
    contours=find_contours(lake.astype('f4'),.5)
    c=max(contours,key=len);shoreline=LineString(np.c_[x[0,0]+c[:,1],z[0,0]+c[:,0]]).simplify(.62)
    return h,lake,[[round(a,1),round(b,1)] for a,b in shoreline.coords]

def pack(name,bounds,h,step,error,cover,target):
    l,t,r,b=bounds;stride=2 if step==.5 else 2
    coarse=h[::stride,::stride];nz,nx=coarse.shape;ground_step=step*stride
    zz,xx=np.indices(coarse.shape);samples=(3,7,14,27,48,80,125,190)
    def horizon(dx,dz):
        grades=np.zeros_like(coarse)
        for distance in samples:
            sx=np.clip(xx+round(dx*distance/ground_step),0,nx-1);sz=np.clip(zz+round(dz*distance/ground_step),0,nz-1)
            grades=np.maximum(grades,(coarse[sz,sx]-coarse)/distance)
        return np.arctan(grades)
    sky=1-np.mean([np.sin(horizon(np.cos(a),np.sin(a)))**2 for a in np.arange(8)*np.pi/4],axis=0)
    terrain_sun=np.deg2rad(-70);shade=horizon(np.cos(terrain_sun),np.sin(terrain_sun))/1.539
    mesh=Delatin(np.ascontiguousarray(h,'f4'),max_error=error)
    hrow=h.shape[0]-1-mesh.vertices[:,1].astype(int);hcol=mesh.vertices[:,0].astype(int)
    datum=float(np.floor(h.min())-1);scale=.022 # Covers 720 metres of relief in the signed flight grid.
    tri=np.asarray(mesh.triangles,'i4');coords=np.stack([hcol,hrow],axis=1)
    a,bb,c=coords[tri[0]];ab=bb-a;ac=c-a
    if ab[0]*ac[1]-ab[1]*ac[0]>0:tri=tri[:,::-1]
    xyz=np.stack([np.rint(hcol*step*4),np.rint(hrow*step*4),np.rint((h[hrow,hcol]-datum)/scale)],axis=1).astype('<u2')
    shade_points=[hrow/stride,hcol/stride];vg=map_coordinates(cover,[(hrow*step),(hcol*step)],order=1,mode='nearest')
    light=np.clip(np.rint(255*np.stack([map_coordinates(sky,shade_points,order=1),map_coordinates(shade,shade_points,order=1),vg,np.ones_like(vg)],axis=1)),0,255).astype('u1')
    # The TIN is continuous. Partition its finished triangles, sharing identical boundary vertices between frustum sectors.
    center=coords[tri].mean(1)*step;part=(center[:,0]//150+16*(center[:,1]//150)).astype(int)
    parts=np.unique(part);assert (coarse.max()-datum)/scale<32767
    with target.open('wb') as f:
        f.write(struct.pack('<4sHH4iHHffI',b'ARF1',2,round(ground_step*4),*bounds,nx,nz,datum,scale,len(parts)));f.write(np.rint((coarse-datum)/scale).astype('<i2').tobytes())
        for k in parts:
            ids,local=np.unique(tri[part==k].ravel(),return_inverse=True);indices=local.astype('<u2')
            assert len(ids)<65536;f.write(struct.pack('<II',len(ids),len(indices)//3));f.write(xyz[ids].tobytes());f.write(light[ids].tobytes());f.write(indices.tobytes())
    return len(tri)

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('input',type=Path);ap.add_argument('sonar',type=Path);ap.add_argument('game',type=Path);a=ap.parse_args()
    rt=a.input;source=rt/'source';data={};index={}
    for name,(bounds,source_box,step,error) in SURVEYS.items():
        l,t,r,b=bounds;z,x=np.mgrid[t:b+step*.1:step,l:r+step*.1:step]
        dem=source/(name+'-ground.tif');h=surface_height(dem,x,z);points=np.load(rt/('watchman-field.npz' if name=='watchman' else 'cleetwood-points.npz'));canopy,trees=observed_forests(points,dem,bounds,name)
        shore=None
        if name=='watchman':h=summit_detail(h,x,z,points,step)
        else:h,water,shore=lake_bed(h,x,z,a.sonar,bounds)
        photo=registered_image(source/(name+'-ortho.jpg'),source_box,bounds,((r-l)*2,(b-t)*2));rgb=np.asarray(photo,'f4');shade=rgb@np.array([.24,.64,.12])
        # Aerial shadows represent a different time of day. Recover local stone colour while retaining the small-scale exposure visible in the photograph.
        low=gaussian_filter(shade,8);blend=np.clip((84-low)/65,0,1)
        de_shaded=np.clip(rgb*np.minimum(1.68,1+blend*.64)[:,:,None],0,255);photo=Image.fromarray(de_shaded.astype('u1'))
        h,photo,crib,trailLength=build_trail(source,name,bounds,h,x,z,step,photo)
        photo.save(a.game/('landform-'+name+'-aerial.webp'),quality=93,method=6,exact=True)
        cover=gaussian_filter(np.clip(canopy/5,0,1),2)
        n=pack(name,bounds,h,step,error,cover,a.game/('landform-'+name+'.bin'))
        data[name]={'rect':bounds,'trees':trees}
        if crib:data[name]['crib']=crib
        if shore:data[name]['shore']=shore
        index[name]=dict(triangles=n,trees=len(trees),trailMetres=trailLength,cribSegments=len(crib),shorePoints=len(shore or []),min=float(h.min()),max=float(h.max()))
        print(name,index[name],flush=True)
    (a.game/'crater-rim-data.js').write_text('// USGS terrain and multibeam, DOGAMI airborne returns, USDA NAIP. Distances in game metres.\nwindow.craterRimSurvey='+json.dumps(data,separators=(',',':'))+';\n')
    (rt/'rim-bake.json').write_text(json.dumps(index,indent=2))
if __name__=='__main__':main()
