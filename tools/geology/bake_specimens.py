"""Build sealed, relightable relief models from isolated regional specimen sheets.

Each source silhouette is a measured constraint from a single generated view.
Hidden surfaces and depth are inferred. Two independent geometry resolutions
retain the front profile, split rocks and through-holes; no view-facing cards.
Usage: bake_specimens.py production_root [--sheet id ...] [--plans roster.json]
"""
import argparse
import hashlib
import json
import re
import struct
from pathlib import Path
import fast_simplification as fs
import numpy as np
from PIL import Image
from scipy import ndimage as nd
from scipy.optimize import linear_sum_assignment
from skimage.measure import marching_cubes

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / 'game/geology-data'
TILE = 240
PAD = 8
DIM = 4 * (TILE + 2 * PAD)

def extract_sheet(path):
    rgba = np.asarray(Image.open(path).convert('RGBA'))
    h, w = rgba.shape[:2]
    alpha=rgba[:,:,3]
    if np.mean(alpha<10)<.13: raise ValueError(f'{path.name}: source backing remains visible')
    occupied = alpha > 110
    labels, _ = nd.label(occupied)
    sizes = np.bincount(labels.ravel())
    groups = np.flatnonzero(sizes > .00036*w*h)[1:]
    if len(groups) < 16:
        raise ValueError(f'{path.name}: only {len(groups)} connected groups')
    centers = np.array(nd.center_of_mass(occupied, labels, groups)) / [h,w]
    grid = np.array([((i//4+.5)/4,(i%4+.5)/4) for i in range(16)])
    block_distance = np.linalg.norm(grid[:,None,:]-centers[None,:,:],axis=2)
    # Prefer a substantial main body when a cell also has detached shards.
    cost = block_distance + .025*np.maximum(0,np.log(.013*w*h/sizes[groups]))[None,:]
    _, idx = linear_sum_assignment(cost)
    available = {i:[int(groups[j])] for i,j in enumerate(idx)}
    for j in set(range(len(groups)))-set(idx):
        i = np.linalg.norm(centers[j]-centers[idx],axis=1).argmin()
        available[i].append(int(groups[j]))
    for i in range(16):
        use = np.isin(labels,available[i]);y,x=np.where(use)
        x0,x1,y0,y1=x.min(),x.max()+1,y.min(),y.max()+1
        mask=use[y0:y1,x0:x1]
        rgb=rgba[y0:y1,x0:x1,:3].copy()
        # Clamp all empty pixels to the closest genuine mineral colour. This
        # dilates the atlas gutters and late mip levels without a pale halo.
        nearest=nd.distance_transform_edt(~mask,return_distances=False,return_indices=True)
        yield rgb[tuple(nearest)],mask

def appearance(rgb,mask):
    rgb=np.asarray(Image.fromarray(rgb).resize((TILE,TILE),Image.Resampling.LANCZOS),dtype=np.float32)/255
    lum=rgb@np.array([.26,.57,.17])
    broad=nd.gaussian_filter(lum,18)
    valid=np.asarray(Image.fromarray(mask).resize((TILE,TILE)),bool)
    mid=np.median(lum[valid])
    rgb*=np.clip(((mid+.16)/(broad+.16))**.44,.76,1.26)[:,:,None]
    # Weak tangent detail leaves room for the actual scene light to cross each ridge.
    fine=(lum-nd.gaussian_filter(lum,5))*.86
    dy,dx=np.gradient(nd.gaussian_filter(fine,.65))
    n=np.stack([-dx*2.4,-dy*2.4,np.ones_like(dx)],axis=2)
    n/=np.linalg.norm(n,axis=2,keepdims=True)
    return (np.uint8(np.clip(rgb,0,1)*255),np.uint8((n*.5+.5)*255))

def mesh(rgb,mask,cell):
    h,w=mask.shape
    sy=max(14,round(70*h/max(h,w)));sx=max(14,round(70*w/max(h,w)))
    shape=np.asarray(Image.fromarray(mask).resize((sx,sy),Image.Resampling.NEAREST))
    raw=np.asarray(Image.fromarray(rgb).convert('L').resize((sx,sy),Image.Resampling.BILINEAR),dtype=np.float64)/255
    shape=np.pad(shape,3);raw=np.pad(raw,3,mode='edge')
    distance=nd.distance_transform_edt(shape)-nd.distance_transform_edt(~shape)
    yy,xx=np.indices(shape.shape);rng=np.random.default_rng(cell+417)
    peak=max(np.max(distance),1)
    norm_dist=np.maximum(distance/peak,0)
    # The source is an oblique view. Build a different front and rear section
    # through each contour, with a range of hull thicknesses and relief guided
    # by visible broad planes. The geometric silhouette remains view-stable.
    planes=nd.gaussian_filter(raw,1.8)-nd.gaussian_filter(raw,8)
    bow=(.63+.14*np.sin(xx*.064+cell*.69)+.09*np.cos(yy*.082+cell))*np.sqrt(norm_dist)
    broad=.10*np.sin(xx*.041+yy*.090+cell*1.31)+.05*np.cos(xx*.1-yy*.049)
    thick=14.5+rng.uniform(0,5)
    front=1.+thick*(bow+np.clip(planes,-.35,.35)*norm_dist*.85)
    rear=1.+thick*(.54+.11*np.cos(yy*.084-xx*.053+cell))*norm_dist**.58
    center=broad*thick
    zz=np.arange(-32,33)[:,None,None]
    sdf=np.minimum(distance[None,:,:],np.minimum(front[None,:,:]+center[None,:,:]-zz,zz+rear[None,:,:]-center[None,:,:]))
    pts,faces,_,_=marching_cubes(sdf,0,allow_degenerate=False)
    # Model coordinates x east, y up and z toward the source viewer. The
    # oblique plane recedes toward its crown, so a top view also has depth.
    z,y,x=pts.T;z=z-32;X=(x-3)/max(1,sx-1)*w;Y=(sy+2-y)/max(1,sy-1)*h;Z=z*max(w,h)/70
    tilt=.59+.04*np.sin(cell)
    p=np.column_stack((X,(Y*np.cos(tilt)+Z*np.sin(tilt)),(-Y*np.sin(tilt)+Z*np.cos(tilt))))
    p-=np.array([np.ptp(p[:,0])/2+p[:,0].min(),p[:,1].min(),(p[:,2].min()+p[:,2].max())/2])
    length=max(w,h)
    p/=length
    # Winding is calibrated in final 3-space rather than depending on the
    # marching-cubes axis convention.
    tri=p[faces]
    volume=np.einsum('ij,ij->',tri[:,0],np.cross(tri[:,1],tri[:,2]))
    faces=faces.copy() if volume>0 else faces[:,::-1].copy()
    result=[]
    for target in [640,90]:
        coords,index=fs.simplify(np.ascontiguousarray(p,dtype=np.float64),np.ascontiguousarray(faces,dtype=np.int32),target_count=min(len(faces),target),agg=5)
        # Recover each simplified point's projected UV through the inverse of
        # the rigid viewing transform. The rear retains the local mineral
        # fabric and a quieter, slightly offset view of the specimen.
        from scipy.spatial import cKDTree
        _, nearest=cKDTree(p).query(coords,k=1)
        U=np.clip((x[nearest]-3)/max(1,sx-1),0,1)
        V=np.clip((y[nearest]-3)/max(1,sy-1),0,1)
        u=(cell%4*(TILE+2*PAD)+PAD+.5+U*(TILE-1))/DIM
        v=1-(cell//4*(TILE+2*PAD)+PAD+.5+V*(TILE-1))/DIM
        norms=np.zeros_like(coords)
        a,b,c=coords[index[:,0]],coords[index[:,1]],coords[index[:,2]]
        for j in range(3): np.add.at(norms,index[:,j],np.cross(b-a,c-a))
        magnitude=np.linalg.norm(norms,axis=1)
        defined=magnitude>1e-9
        norms[defined]/=magnitude[defined,None]
        if not defined.all():
            # Decimation occasionally leaves opposite, coincident faces in a
            # thin slot. Borrow the closest valid surface normal at that seam.
            _,neighbor=cKDTree(coords[defined]).query(coords[~defined])
            norms[~defined]=norms[defined][neighbor]
        # Quantized vertices have a declared 16-byte stride. Coordinates are
        # in longest-image-dimension units and always within +/- 1.25.
        data=np.zeros((len(coords),8),'<i2')
        data[:,:3]=np.rint(coords*16000).astype('<i2');data[:,3:6]=np.rint(norms*32767)
        data[:,6:]=np.rint(np.column_stack((u,v))*32767)
        result.append((data,index.reshape(-1).astype('<u2')))
    return result

def model_sizes(name,kind):
    s=name.lower()
    if kind=='pebbles':
        return .11 if any(k in s for k in ['cobble','fist','block']) else .072
    if kind in ('beach','gravel','sediment','littoral'):
        return .58 if any(k in s for k in ['bedrock','ledge','boulder','pocket','scatter','bank','cluster','ridge']) else .21
    if any(k in s for k in ['cobble','chip','shingle','shard']):return .36
    if any(k in s for k in ['fin','buttress','shoulder','cliff','shelf','spur','alcove','prow','outcrop','stair','bed','fan','ledge']):return 3.8
    return 1.5

def bake(record,art,manifestdir):
    key=record['id'];target=DEST/key
    entries=json.loads((manifestdir/(key+'.json')).read_text()) if (manifestdir/(key+'.json')).exists() else record.get('specimens',[])
    if isinstance(entries,dict): entries=entries.get('specimens',entries.get('entries',[]))
    if len(entries)!=16: raise ValueError(f'{key}: sixteen specimen identities required')
    chunk=bytearray(b'ARG1');tiles=[Image.new('RGB',(DIM,DIM)) for _ in range(2)];specs=[]
    for i,(rgb,mask) in enumerate(extract_sheet(art)):
        name=entries[i]['name'];lods=mesh(rgb,mask,i);sizes=[]
        for verts,indices in lods:
            chunk.extend(struct.pack('<HH',len(verts),len(indices)));chunk.extend(verts.tobytes());chunk.extend(indices.tobytes())
            sizes.append(len(indices)//3)
        for atlas,img in zip(tiles,appearance(rgb,mask)):
            atlas.paste(Image.fromarray(np.pad(img,((PAD,PAD),(PAD,PAD),(0,0)),mode='edge')),(i%4*256,i//4*256))
        ext=lods[0][0][:,:3].astype(np.float64)/16000
        specs.append(dict(name=name,extent=np.ptp(ext,axis=0).round(3).tolist(),length=model_sizes(name,record['kind']),triangles=sizes))
    binary=target.with_suffix('.bin')
    temporary=binary.with_suffix('.bin.tmp')
    temporary.write_bytes(chunk)
    temporary.replace(binary)
    for img,suffix,q in [(tiles[0],'-color.webp',84),(tiles[1],'-normal.webp',78)]:
        atlas=target.with_name(key+suffix)
        temporary=atlas.with_suffix('.webp.tmp')
        img.save(temporary,format='WEBP',quality=q,method=5)
        temporary.replace(atlas)
    rec=dict(id=key,region=record['region'],kind=record['kind'],habitat=record.get('habitat',''),specimens=specs,
             sourceSHA256=hashlib.sha256(art.read_bytes()).hexdigest())
    return rec

def main():
    cmd=argparse.ArgumentParser(description=__doc__)
    cmd.add_argument('production',type=Path);cmd.add_argument('--sheet',nargs='+');cmd.add_argument('--plans',type=Path)
    args=cmd.parse_args();production=args.production.resolve();DEST.mkdir(exist_ok=True)
    plans=args.plans or production/'expansion/plans/sheets.json'
    roster=json.loads(plans.read_text()) if plans.exists() else []
    known={r['id']:r for r in roster if r.get('pipeline')=='geology'}
    for f in (production/'generated').glob('*.png'):
        region,kind=f.stem.split('-',1)
        if kind in ('rock','pebbles'):known.setdefault(f.stem,dict(id=f.stem,region=region,kind=kind))
    keys=args.sheet or sorted(known);updates={}
    for key in keys:
        rec=dict(known[key]);
        if rec.get('legacy'):rec['kind']='pebbles' if key.endswith('-pebbles') else 'rock'
        art=next((d/(key+'.png') for d in [production/'expansion/generated',production/'generated'] if (d/(key+'.png')).exists()),None)
        if art is None:continue
        dirs=[production/'written',production/'expansion/written',production/'expansion/plans']
        manifest=next((p for p in dirs if (p/(key+'.json')).exists()),dirs[0])
        result=bake(rec,art,manifest)
        updates.setdefault(result['region'],{})[key]=result
        print(key, len(result['specimens']),flush=True)
    for region,adds in updates.items():
        target=DEST/(region+'.json')
        old=json.loads(target.read_text()) if target.exists() else {'version':1,'sheets':[]}
        sheets={s['id']:s for s in old['sheets']};sheets.update(adds);old['sheets']=[sheets[k] for k in sorted(sheets)]
        old['distribution']=json.loads((Path(__file__).parent/'fields.json').read_text())[region]
        habitat_data=json.loads((Path(__file__).parent/'habitats.json').read_text())[region]
        old['habitats']=[dict(name=n,habitat=h,x=x,z=z,radius=r) for n,h,x,z,r in habitat_data]
        temp=target.with_suffix('.tmp');temp.write_text(json.dumps(old,separators=(',',':'),ensure_ascii=False)+'\n');temp.replace(target)
if __name__=='__main__':main()
