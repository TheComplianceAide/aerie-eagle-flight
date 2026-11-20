"""Stitch the actual Kineo GLB sidewalls to their one-metre survey in game coordinates.

Pass the directory containing source/kineo-usgs-b24-1m.tif and assets/*.glb.
The native terrain is removed only in these two small rectangles. The inner
boundaries below are literal exported GLB vertices, including the inferred
near-vertical joints. A blend on the outer edges meets the native height field.
"""
from pathlib import Path
import argparse,base64,json,struct,shutil
import numpy as np,rasterio
from scipy.ndimage import map_coordinates
from scipy.spatial import Delaunay,cKDTree
import fast_simplification
from pyproj import Transformer
ROOT=Path(__file__).resolve().parents[2]
DEST=ROOT/'game/geology-data'
origin=np.round(Transformer.from_crs(4326,32619,always_xy=True).transform(-69.735,45.692))
def geometry(path):
    b=path.read_bytes();n=struct.unpack_from('<I',b,12)[0]
    doc=json.loads(b[20:20+n]);data=b[28+n:]
    a=doc['accessors'][doc['meshes'][0]['primitives'][0]['attributes']['POSITION']];v=doc['bufferViews'][a['bufferView']]
    p=np.frombuffer(data,'<f4',a['count']*3,v['byteOffset']).reshape(-1,3).astype('d')
    a=doc['accessors'][doc['meshes'][0]['primitives'][0]['indices']];v=doc['bufferViews'][a['bufferView']]
    ix=np.frombuffer(data,'<u2',a['count'],v['byteOffset']).reshape(-1,3)
    return p,ix
def smooth(x):
    t=np.clip(x,0,1);return t*t*(3-2*t)
def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('study',type=Path);args=parser.parse_args()
    survey=rasterio.open(args.study/'source/kineo-usgs-b24-1m.tif');height=survey.read(1);aff=survey.transform
    def dem(x,z):
        x,z=np.broadcast_arrays(np.asarray(x),np.asarray(z))
        i=(origin[0]+x-aff.c)/aff.a-.5;j=(origin[1]-z-aff.f)/aff.e-.5
        return map_coordinates(height,[j.reshape(-1),i.reshape(-1)],order=1,mode='nearest').reshape(x.shape)
    records=json.loads((args.study/'assets/manifest.json').read_text());areas=[];parts=[]
    co=[];lod=bytearray(b'AKL1')
    for rec in records:
        f=args.study/'assets'/rec['file'];shutil.copyfile(f,DEST/f.name)
        positions,faces=geometry(f)
        if 'origin' in rec:
            rows=len(np.unique(positions[:,2]));cols=len(positions)//rows
            jj,ii=np.indices((rows,cols));step=5 if rows>100 else 3
            keep=(jj==0)|(jj==rows-1)|(ii==0)|(ii==cols-1)|((ii%step==0)&(jj%step==0))
            ids=np.flatnonzero(keep);uv=np.stack([ii.ravel()[ids],jj.ravel()[ids]],axis=1)
            ix=ids[Delaunay(uv).simplices];raw=faces[0]
            original=np.stack([raw%cols,raw//cols],axis=1)
            if np.linalg.det(original[1:]-original[0])<0:ix=ix[:,::-1]
        else:
            points,index=fast_simplification.simplify(positions,np.ascontiguousarray(faces,dtype='i'),target_count=190 if 'block' in f.name else 540)
            _,nearest=cKDTree(positions).query(points);ix=nearest[index]
            ix=ix[(ix[:,0]!=ix[:,1])&(ix[:,1]!=ix[:,2])&(ix[:,0]!=ix[:,2])]
        ix=np.ascontiguousarray(ix,dtype='<u2')
        lod.extend(struct.pack('<I',ix.size));lod.extend(ix.tobytes());lod+=bytes((-len(lod))%4)
        if 'origin' not in rec:continue
        o=rec['origin'];offset=np.array([o['easting']-origin[0],o['elevation_m'],origin[1]-o['northing']]);pos=positions+offset
        n=len(np.unique(pos[:,2]));profile=pos.reshape(n,-1,3)[:,::-1,:];levels=profile.shape[1]
        raw=profile.reshape(-1,3)
        xmin,zmin=np.floor((raw[:,[0,2]].min(axis=0)-18)/4).astype(int)*4
        xmax,zmax=np.ceil((raw[:,[0,2]].max(axis=0)+18)/4).astype(int)*4
        # Each interior row includes the complete edge of the survey GLB, so
        # the one-metre terrain meets every contour even along tall cliff ends.
        near=np.linspace(zmin,profile[0,0,2],9)[:-1];far=np.linspace(profile[-1,0,2],zmax,9)[1:]
        zs=np.r_[near,profile[:,0,2],far];nw,ne=18,18;rows=[]
        for row,z in enumerate(zs):
            inside=8<=row<n+8
            q=profile[np.clip(row-8,0,n-1)].copy();px=q[:,0]
            if not inside:
                dist=max(profile[0,0,2]-z,z-profile[-1,0,2]);blend=smooth(dist/10)
                px=px*(1-blend)+np.linspace(px[0],px[-1],levels)*blend
                h=dem(px,z)
                q[:,1]=q[:,1]*(1-blend)+h*blend
            xwest=np.linspace(xmin,px[0],nw+1)[:-1];xeast=np.linspace(px[-1],xmax,ne+1)[1:]
            xx=np.r_[xwest,px,xeast];hh=np.r_[dem(xwest,z),q[:,1],dem(xeast,z)]
            # Relieve the first metre against the GLB's literal filtered edge.
            hh[nw-1]+=(q[0,1]-dem(px[0],z))*.42
            hh[nw+levels]+=(q[-1,1]-dem(px[-1],z))*.42
            rows.append(np.stack([xx,hh,np.full_like(xx,z)],axis=1))
        vertices=np.array(rows);indices=[]
        cols=vertices.shape[1]
        for j in range(len(zs)-1):
            for i in range(cols-1):
                if 8<=j<n+7 and nw<=i<nw+levels-1:continue
                a=j*cols+i;b=a+cols;indices.extend([a,b,a+1,a+1,b,b+1])
        indices=np.array(indices,'<u2')
        flat=vertices.reshape(-1,3);used,reverse=np.unique(indices,return_inverse=True)
        flat=flat[used];ii=reverse.astype('<u2')
        parts.append((flat.astype('<f4'),ii))
        # 1 m surface for physical ray height. Reduce steep-face DEM aliasing
        # with a height envelope from the actual displaced GLB cross-sections.
        XX,ZZ=np.meshgrid(np.arange(xmin,xmax+1),np.arange(zmin,zmax+1));H=dem(XX,ZZ)
        for j,pz in enumerate(ZZ[:,0]):
            if pz<profile[0,0,2] or pz>profile[-1,0,2]:continue
            f=(pz-profile[0,0,2])/(profile[-1,0,2]-profile[0,0,2])*(n-1);a=min(n-2,int(f))
            line=profile[a]*(1-(f-a))+profile[a+1]*(f-a)
            for i in range(len(line)-1):
                x0,hh0=line[i,:2];x1,hh1=line[i+1,:2]
                if abs(x1-x0)<1e-6:continue
                lo,hi=int(np.ceil(min(x0,x1))),int(np.floor(max(x0,x1)))
                if hi>=lo:
                    x=np.arange(lo,hi+1); h=hh0+(hh1-hh0)*(x-x0)/(x1-x0)
                    H[j,x-xmin]=h
        encoded=base64.b64encode(np.rint((H-300)*128).clip(-32768,32767).astype('<i2').tobytes()).decode()
        areas.append(dict(rect=[int(xmin),int(zmin),int(xmax),int(zmax)],heights=encoded))
        co.append(dict(file=rec['file'],position=offset.round(5).tolist()))
    packed=bytearray(b'AKN1')
    for vert,idx in parts:
        packed.extend(struct.pack('<II',len(vert),len(idx)));packed.extend(vert.tobytes());packed.extend(idx.tobytes())
        packed+=bytes((-len(packed))%4)
    (DEST/'kineo-seams.bin').write_bytes(packed)
    (DEST/'kineo-lod.bin').write_bytes(lod)
    # The native Three runtime loads the two tiny physical patches up front.
    src=(ROOT/'tools/geology/kineo-terrain.template.js').read_text().replace('/*AREA_DATA*/[]',json.dumps(areas,separators=(',',':'))).replace('/*ORIGINS*/[]',json.dumps(co,separators=(',',':')))
    (ROOT/'game/kineo-terrain.js').write_text(src)
    print('areas',[(a['rect'],len(p[0]),len(p[1])//3) for a,p in zip(areas,parts)],'origins',co)
if __name__=='__main__':main()
