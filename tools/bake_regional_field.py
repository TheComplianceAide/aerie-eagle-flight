"""Bake an RGBA specimen sheet into native field meshes and a mip-safe color atlas.

Use --art for the expansion directory containing plans/sheets.json and generated/.
The relief behind each single source view is reconstructed. The source outline,
holes, color, aspect and materials are kept independently for each of 16 cells.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import struct

import numpy as np
from PIL import Image
from scipy import ndimage

REVISION = 4
DEST = Path(__file__).resolve().parents[1] / "game" / "field-data"
SPAN = dict(wood=7.8, herb=1.5, grass=1.05, ground=3.5, sign=1.35,
            water=5.2, ice=11., structure=2.1)


def linear_color(rgb):
    return np.asarray(rgb, dtype=float) / 255.


def separate_sheet(im):
    pixels = np.asarray(im.convert("RGBA")).copy()
    a = pixels[:, :, 3]
    if np.mean(a < 32) >= .12:
        return Image.fromarray(pixels)
    # Only remove a demonstrably uniform exterior matte. Preserve enclosed
    # highlights and whites on timber, ice and reflective wet surfaces.
    edge = np.concatenate([pixels[0], pixels[-1], pixels[:, 0], pixels[:, -1]])
    matte = np.median(edge[:, :3].astype(float), axis=0)
    dist = np.max(np.abs(pixels[:, :, :3].astype(float) - matte), axis=2)
    edge_dev = np.median(np.max(np.abs(edge[:, :3].astype(float) - matte), axis=1))
    if edge_dev > 13:
        raise ValueError("Backdrop is not sufficiently uniform for edge isolation")
    background = dist < max(13, edge_dev * 3 + 6)
    seeds = np.zeros_like(background)
    seeds[0] = background[0]; seeds[-1] = background[-1]
    seeds[:, 0] = background[:, 0]; seeds[:, -1] = background[:, -1]
    outer = ndimage.binary_propagation(seeds, mask=background)
    if np.mean(outer) < .14:
        raise ValueError("External matte did not separate from the silhouettes")
    a[outer] = 0
    return Image.fromarray(pixels)


def isolate(im, cell):
    col, row = cell % 4, cell // 4
    box = (round(col*im.width/4), round(row*im.height/4),
           round((col+1)*im.width/4), round((row+1)*im.height/4))
    tile = im.crop(box)
    alpha = np.asarray(tile.getchannel("A")) > 75
    labels, count = ndimage.label(alpha, np.ones((3, 3)))
    areas = np.bincount(labels.ravel())
    if not count or areas[1:].max() < 70:
        raise ValueError("Empty cell " + str(cell+1))
    # Avoid adopting a neighboring plant tip that barely enters this grid cell.
    keep = areas > max(8, areas[1:].max()*.002)
    keep[0] = False
    h,w = alpha.shape
    for label, bounds in enumerate(ndimage.find_objects(labels), 1):
        if not bounds or not keep[label]:continue
        sy,sx = bounds
        if (min(sy.stop,h-sy.start)<h*.09 or min(sx.stop,w-sx.start)<w*.09) and areas[label]<.24*areas[1:].max():
            keep[label] = False
    mask = keep[labels]
    coords = np.argwhere(mask)
    y,x = coords.min(axis=0); yy,xx = coords.max(axis=0)
    exterior = ndimage.binary_dilation(mask, iterations=2)
    rgba = np.asarray(tile).copy()
    rgba[:, :, 3][~exterior] = 0
    return Image.fromarray(rgba).crop((max(0,x-2), max(0,y-2),
                                       min(w,xx+3), min(h,yy+3)))


def sampled_mesh(tile, kind, cell, high, rect, special):
    # Reconstruct closed bodies. Two surfaces follow an eroded silhouette;
    # connecting sides wrap the photographic UV along the real physical edge.
    size = (38 if high else 17) if kind in ("wood","herb","grass","structure") else (28 if high else 13)
    scale = size/max(tile.size)
    iw,ih = max(5,round(tile.width*scale)), max(5,round(tile.height*scale))
    thumbnail = tile.resize((iw, ih), Image.Resampling.LANCZOS)
    data = np.asarray(thumbnail)
    coverage = data[:,:,3]
    mask = coverage > (27 if kind in ("grass","herb","wood") else 60)
    if not mask.any():raise ValueError("Empty LOD")
    thickness = ndimage.distance_transform_edt(np.pad(mask,1))[1:-1,1:-1]/size
    luma = linear_color(data[:,:,:3]) @ [ .2126,.7152,.0722 ]
    coarse = ndimage.gaussian_filter(luma, .9 if high else .55)
    yy,xx=np.indices(mask.shape)
    nx=(xx+.5)/iw-.5; ny=.5-(yy+.5)/ih
    px=nx*tile.width/max(tile.size); py=ny*tile.height/max(tile.size)
    hull = np.minimum(1,thickness*9)
    seed=(cell+1)*.7557
    shape = np.sin(5*nx+seed)*np.cos(4*ny-seed)
    # Surface material variation is low amplitude. White paint and ice glare
    # therefore cannot become towering bumps.
    micro=np.clip(luma-coarse,-.22,.22)
    plane = kind in ("ground","water","sign","wood","ice") or special=="lily"
    if plane:
        vx=px.copy(); vz=-py.copy()
        if kind == "wood":
            base=.085*hull + .045*np.sin(nx*5+seed)*hull
            thick=.008+np.minimum(.12,thickness*1.05)
        elif kind == "ice":
            base=.07*hull+.15*np.maximum(0,coarse-.12)*hull
            thick=.02+.065*hull
        elif kind == "water":
            base=.006*hull + .012*micro
            thick=.002+.005*hull
        elif special=="lily":
            base=.013*hull+.018*shape
            thick=.004+.004*hull
        else:
            base=.008+.032*hull*(.24+coarse)+micro*.045
            thick=.002+.008*hull
        vy=base
        d=(np.zeros_like(vx),thick,np.zeros_like(vx))
    else:
        vx=px.copy(); vy=py-py[mask].min()
        if kind=="structure":
            # End/side returns, posts and masonry maintain usable thickness.
            vz=.11*nx+.07*shape*hull+.025*micro
            thick=.012+np.minimum(.18,thickness*.91)+.035*hull
        else:
            # Reconstruct an open, crown-shaped fan around the basal axis.
            # Fold separate stems outward around the crown. The vertical profile
            # and negative space come from the individual source specimen.
            side=np.arctan2(nx,.17+ny-ny.min())
            bend=.17*np.sin(4.4*side+seed)*(.18+vy)
            vz=bend+.055*shape+.055*coarse*hull
            thick=.006+np.minimum(.064,thickness*.53)
        d=(np.zeros_like(vx),np.zeros_like(vx),thick)
    positions=[];uvs=[];faces=[];indices={}
    # Use the actual alpha for texture edges while supporting thin source tips
    # and fine material holes at full atlas resolution.
    for y,x in np.argwhere(mask):
        key=(int(y),int(x))
        indices[key]=len(positions)
        for side in (1,-1):
            positions.append((vx[y,x]+side*d[0][y,x],vy[y,x]+side*d[1][y,x],vz[y,x]+side*d[2][y,x]))
            uvs.append((rect[0]+(x+.5)/iw*rect[2],1-rect[1]-(y+.5)/ih*rect[3]))
    for (y,x),p in indices.items():
        b=indices.get((y,x+1));c=indices.get((y+1,x));e=indices.get((y+1,x+1))
        if b is not None and c is not None:faces.append((p,c,b))
        if b is not None and e is not None and c is not None:faces.append((b,c,e))
        elif e is not None:
            if c is not None and b is None:faces.append((p,c,e))
            if b is not None and c is None:faces.append((p,e,b))
    if not faces:raise ValueError("No solid source area, cell "+str(cell+1))
    # Correct outward face order in both planar coordinate systems.
    outer=list(faces);edge={}
    for a,b,c in outer:
        for k in ((a,b),(b,c),(c,a)):
            pair=tuple(sorted(k))
            edge[pair]=None if pair in edge else k
        faces.append((a+1,c+1,b+1))
    for k in edge.values():
        if k:
            a,b=k;faces.extend([(b,a,a+1),(b,a+1,b+1)])
    pos=np.asarray(positions); f=np.asarray(faces,dtype=np.uint16)
    cross=np.cross(pos[f[:,1]]-pos[f[:,0]],pos[f[:,2]]-pos[f[:,0]])
    normal=np.zeros_like(pos)
    for j in range(3):np.add.at(normal,f[:,j],cross)
    normal/=np.maximum(1e-9,np.linalg.norm(normal,axis=1,keepdims=True))
    v=np.column_stack([pos*16000,normal*32767,np.asarray(uvs)*32767])
    buf=struct.pack("<II",len(v),f.size)+np.rint(v).clip(-32767,32767).astype("<i2").tobytes()+f.astype("<u2").tobytes()
    return buf,len(f)


def cook(s, art):
    key = s["id"]
    timber=s["kind"]=="wood" or key=="labrador-camp"
    surface=s["kind"] in ("ground","water","sign")
    revision=8 if surface else 9 if timber else REVISION
    source = art/"generated"/(key+".png")
    if not source.exists():return
    manifest = DEST/(key+".json")
    sha = hashlib.sha256(source.read_bytes()).hexdigest()
    if manifest.exists():
        prior=json.loads(manifest.read_text())
        if prior.get("sha")==sha and prior.get("revision")==revision:return prior
    im=separate_sheet(Image.open(source))
    names=json.loads((art/"written"/(key+".json")).read_text())
    atlas=Image.new("RGBA",(1024,1024))
    body=bytearray(b"AFS1")
    forms=[]
    special="lily" if key=="winnipesaukee-lily" else ""
    for i in range(16):
        tile=isolate(im,i)
        painted=tile
        if surface:
            from field_surfaces import surface_marks,shape_tile
            painted,backing,alpha=surface_marks(tile,s["kind"],i)
            tile=shape_tile(painted,backing,alpha)
        thumb=painted.copy();thumb.thumbnail((244,244),Image.Resampling.LANCZOS)
        x=i%4*256+(256-thumb.width)//2;y=i//4*256+(256-thumb.height)//2
        atlas.paste(thumb,(x,y))
        rect=(x/1024,y/1024,thumb.width/1024,thumb.height/1024)
        triangles=[]
        for high in (True,False):
            if timber:
                from field_timber import deadwood, joinery
                generator=deadwood if s["kind"]=="wood" else joinery
                packed,count=generator(tile,i,high,rect)
            else:
                packed,count=sampled_mesh(tile,s["kind"],i,high,rect,special)
            body.extend(packed);triangles.append(count)
        forms.append({"name":names[i]["name"],"triangles":triangles})
    # Transparent atlas texels retain nearest edge colors through mipmaps.
    arr=np.asarray(atlas).copy(); transparent=arr[:,:,3]<8
    ind=ndimage.distance_transform_edt(transparent,return_distances=False,return_indices=True)
    arr[:,:,:3][transparent]=arr[ind[0][transparent],ind[1][transparent],:3]
    atlas_tmp=DEST/(key+".tmp.webp")
    Image.fromarray(arr).save(atlas_tmp,quality=86,method=4,exact=True)
    os.replace(atlas_tmp,DEST/(key+".webp"))
    bin_tmp=DEST/(key+".tmp.bin");bin_tmp.write_bytes(body);os.replace(bin_tmp,DEST/(key+".bin"))
    record={k:s[k] for k in ("id","kind","habitat","region")}
    record.update(sha=sha,revision=revision,span=SPAN[s["kind"]],specimens=forms)
    if special:record["special"]=special
    if s["kind"]=="ground":record["span"]=.90 if "outwash" in key or "scree" in key else .78
    if s["kind"]=="sign":record["span"]=.64
    if s["kind"]=="water":record["span"]=4.5
    if s["kind"]=="wood":
        from field_timber import BRANCH_SPANS
        source_size={"alaska":1.55,"swiss":1.05,"canyon":1.,"moosehead":1.20,"winnipesaukee":1.45,
                     "surry":1.25,"dixville":1.34,"labrador":1.1,"yosemite":1.62,"crater":1.5,
                     "lofoten":.87,"milford":1.62}[s["region"]]
        record["specimenSpans"]=[round(n*source_size,3) for n in BRANCH_SPANS]
    if key=="milford-treefern":record["span"]=4.7
    tmp=manifest.with_suffix(".tmp.json");tmp.write_text(json.dumps(record,separators=(",",":")));os.replace(tmp,manifest)
    return record


if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("--art",type=Path,required=True)
    parser.add_argument("--regions",nargs="*");args=parser.parse_args()
    sheets=json.loads((args.art/"plans/sheets.json").read_text())
    DEST.mkdir(exist_ok=True)
    for reg in dict.fromkeys(s["region"] for s in sheets):
        basename=DEST/(reg+".json")
        if args.regions and reg not in args.regions:continue
        records=[]
        for s in sheets:
            if s["pipeline"]!="field" or s["region"]!=reg:continue
            try:
                entry=cook(s,args.art)
                if entry:records.append(entry)
            except (ValueError,OSError) as err:print(s["id"],str(err),flush=True)
        tmp=basename.with_suffix(".tmp");tmp.write_text(json.dumps({"sheets":records},separators=(",",":")));os.replace(tmp,basename)
        print(reg,len(records),"sheets",flush=True)
