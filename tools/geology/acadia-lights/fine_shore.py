"""Refine selected exposed coast with actual NOAA returns and a constrained mesh."""
from pathlib import Path
import numpy as np
from scipy.ndimage import map_coordinates, distance_transform_edt, gaussian_filter
from scipy.spatial import cKDTree
from shapely import contains_xy, polygons, union_all
from pydelatin import Delatin
import triangle as cdt

# Whole metres in the park's native UTM 19N frame. The west side of Egg
# Rock and the flat south-shore ledges at Baker are distinct rock exposures.
AREAS = {'egg':(3970,-3920,4054,-3780),'baker':(-563,9166,-382,9254)}
PITCH = .25


def measure(cache, key, native, bounds, cover):
    west, north, east, south = box = AREAS[key]
    xx = np.arange(west,east+PITCH/2,PITCH)
    zz = np.arange(north,south+PITCH/2,PITCH)
    X,Z=np.meshgrid(xx,zz)
    origin=np.array([bounds[0],bounds[1]])
    def regional(grid,x,z):
        return map_coordinates(grid,[z-origin[1],x-origin[0]],order=1,mode='nearest')
    reference=regional(native,X,Z); samples=[]
    for file in sorted((cache/'point-crops'/key).glob('*.npz')):
        with np.load(file) as data:
            if 'land_x' not in data:continue
            x,z=data['land_x'],data['land_z']
            selected=(x>=west-2)&(x<=east+2)&(z>=north-2)&(z<=south+2)
            if not selected.any():continue
            x,z,y,kind=x[selected],z[selected],data['land_y'][selected],data['land_c'][selected]
            local=regional(native,x,z)
            # Exclude the water surface, foam, canopy and outliers. Class 1 is
            # retained only for short, exposed rock relief with nearby ground.
            good=np.isin(kind,[1,2,40])&(abs(y-local)<2.4)&(local>.06)&(regional(cover,x,z)<.16)
            if good.any():samples.append(np.column_stack([x[good],z[good],y[good]]))
    pts=np.concatenate(samples)
    # Spatially distributed holdout for a comparison against the unrefined
    # survey. Use the same mask for each source and both prediction methods.
    ids=np.arange(len(pts));test=(ids%13)==4;train=pts[~test]
    def surface(data,queries,coarse):
        tree=cKDTree(data[:,:2]);dist,idx=tree.query(queries,k=10,workers=2)
        values=data[idx,2]
        # Preserve a break in slope when two faces meet at a fracture. Distance
        # and local elevation determine which returns belong to the same face.
        anchor=np.median(values[:,:3],axis=1)
        weights=np.exp(-.5*(dist/.34)**2-.5*((values-anchor[:,None])/.31)**2)
        observed=np.sum(values*weights,axis=1)/np.maximum(1e-10,weights.sum(axis=1))
        trust=np.clip((.85-dist[:,2])/.50,0,1)*np.clip((coarse+.03)/.56,0,1)
        return coarse+trust*(observed-coarse),dist[:,2]
    hold=pts[test];coarse=regional(native,hold[:,0],hold[:,1]);pred,d=surface(train,hold[:,:2],coarse)
    ok=(d<.68)&(coarse>.55)
    metric=lambda a:round(float(np.sqrt(np.mean(a**2))),4)
    metrics=dict(points=len(pts),holdout=int(ok.sum()),sourceDtmRmse=metric(coarse[ok]-hold[ok,2]),fineRmse=metric(pred[ok]-hold[ok,2]))
    q=np.column_stack([X.ravel(),Z.ravel()]);flat=reference.ravel()
    field=np.empty(len(q),'f4')
    for start in range(0,len(q),65536):
        sl=slice(start,start+65536);field[sl]=surface(pts,q[sl],flat[sl])[0]
    fine=field.reshape(X.shape)
    edge=np.minimum.reduce([X-west,east-X,Z-north,south-Z])
    mix=np.clip((edge-2.)/4.,0,1);mix=mix*mix*(3-2*mix)
    fine=reference+mix*(fine-reference)
    return box,np.ascontiguousarray(fine,dtype='f4'),metrics


def refine(xz, y, triangles, bounds, inset):
    box,grid,_=inset;west,north,east,south=box
    offset=np.array(bounds[:2])
    locations=xz+offset
    inside=(locations[:,0]>=west)&(locations[:,0]<=east)&(locations[:,1]>=north)&(locations[:,1]<=south)
    replace=np.all(inside[triangles],axis=1)
    cavity=triangles[replace];fixed=triangles[~replace]
    edges=np.sort(np.concatenate([cavity[:,[0,1]],cavity[:,[1,2]],cavity[:,[2,0]]]),axis=1)
    unique,count=np.unique(edges,axis=0,return_counts=True);outer=unique[count==1]
    border,index=np.unique(outer,return_inverse=True);segments=index.reshape(-1,2)
    # The boundary follows the old TIN edges, including holes around upright
    # terrain that crosses the survey window. Reusing their original vertices
    # keeps both the position and the straight edge identical on each side.
    footprint=union_all(polygons(locations[cavity]))
    new=Delatin(grid,max_error=.065)
    px=new.vertices[:,0].astype(int);pz=grid.shape[0]-1-new.vertices[:,1].astype(int)
    pts=np.column_stack([west+px*PITCH,north+pz*PITCH])
    # Stay clear of existing constrained edges. Edges outside the cavity
    # can have a different grain from the inset's quarter-metre sample grid.
    keep=contains_xy(footprint.buffer(-.42),pts[:,0],pts[:,1])
    pts=pts[keep];py=grid[pz[keep],px[keep]]
    verts=np.vstack([locations[border],pts])
    result=cdt.triangulate({'vertices':verts,'segments':segments},'pQ')
    if len(result['vertices'])!=len(verts):raise ValueError('Invalid shoreline constraint intersections')
    t=result['triangles'];center=verts[t].mean(axis=1)
    t=t[contains_xy(footprint,center[:,0],center[:,1])]
    ids=np.r_[border,np.arange(len(locations),len(locations)+len(pts))]
    combined=np.vstack([fixed,ids[t[:,::-1]]])
    v=np.vstack([xz,pts-offset])
    p=v[combined];ab=p[:,1]-p[:,0];ac=p[:,2]-p[:,0]
    flip=ab[:,0]*ac[:,1]>ab[:,1]*ac[:,0];combined[flip]=combined[flip,::-1]
    return v,np.r_[y,py],combined
