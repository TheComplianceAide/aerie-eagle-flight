"""Estimate the exposed edges of Baker's granite plates from the fitted lidar elevations."""
from pathlib import Path
import numpy as np
import struct
from scipy.ndimage import gaussian_filter, map_coordinates
from skimage.measure import find_contours

def bake(source, destination):
    raw=source.read_bytes();tail=raw.rindex(b'SRF1')
    west,north,east,south,nx,nz=struct.unpack_from('<4i2H',raw,tail+4)
    datum,scale=struct.unpack_from('<ff',raw,28)
    field=datum+scale*np.frombuffer(raw,'<i2',nx*nz,tail+24).reshape(nz,nx)
    smooth=gaussian_filter(field,.85)
    dz,dx=np.gradient(smooth,.25,.25);slope=np.hypot(dx,dz)
    def at(arr,x,z):
        return map_coordinates(arr,[z,x],order=1,mode='nearest')
    def outline(row):
        z,x=row[:,0],row[:,1];n=np.maximum(.001,at(slope,x,z))
        ux,uz=at(dx,x,z)/n,at(dz,x,z)/n;h=at(field,x,z)
        # A break in a slab has a gentle upper surface and a steep exposed face.
        # Exclude vegetation, narrow spikes and underwater breaks.
        upper=at(field,x+ux*3.2,z+uz*3.2)-h
        drop=h-at(field,x-ux*5.4,z-uz*5.4)
        valid=(upper>-.11)&(upper<.36)&(drop>.62)&(drop<2.75)&(h>.28)&(h<8.8)&(x>14)&(z>14)&(x<nx-15)&(z<nz-15)
        edges=[]
        for section in np.split(np.arange(len(x)),np.flatnonzero(valid[1:]!=valid[:-1])+1):
            if len(section)<6 or not valid[section[0]]:continue
            chord=np.hypot(np.diff(x[section]),np.diff(z[section]))*.25
            arc=np.r_[0,np.cumsum(chord)]
            if not 1.2<arc[-1]<84:continue
            samples=np.unique(np.r_[0,np.searchsorted(arc,np.arange(.34,arc[-1],.34)),len(arc)-1]);k=section[samples]
            # Direction changes faster than the source grid in tight corners.
            # Normalizing after smoothing keeps the modeled underside attached.
            blend=np.minimum(np.minimum(arc[samples],arc[-1]-arc[samples])/.68,1)
            n=np.maximum(.01,np.hypot(ux[k],uz[k]))
            segment=np.c_[west+x[k]*.25,north+z[k]*.25,h[k],ux[k]/n,uz[k]/n,drop[k],blend]
            edges.append(segment)
        return edges
    bands=[]
    for row in find_contours(slope,.55):
        if len(row)>6:bands.extend(outline(row))
    with destination.open('wb') as f:
        f.write(struct.pack('<4sI',b'BSL1',len(bands)))
        for segment in bands:
            # x/z offsets, surveyed upper elevation, unit uphill direction, local relief and tip taper.
            enc=np.rint((segment-np.array([-474,9213,0,0,0,0,0]))*np.array([64,64,128,4096,4096,1024,1024])).astype('<i2')
            f.write(struct.pack('<H',len(enc)));f.write(enc.tobytes())
    return [(len(s),float(np.hypot(*np.diff(s[:,:2],axis=0).T).sum())) for s in bands]
if __name__=='__main__':
    import sys
    a=bake(Path(sys.argv[1]),Path(sys.argv[2]));print(len(a),'measured break lines;',round(sum(x[1] for x in a),1),'m;',sum(x[0] for x in a),'samples')
