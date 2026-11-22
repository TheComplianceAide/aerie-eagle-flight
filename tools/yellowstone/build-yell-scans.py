"""Convert the four NPS Yellowstone photogrammetry downloads to compact mesh packs."""
import argparse
from pathlib import Path
import io
import re
import struct
import zipfile
import numpy as np
from PIL import Image

def obj(source, name):
    with zipfile.ZipFile(source/name) as archive:
        fn=next(x for x in archive.namelist() if x.lower().endswith('.obj'))
        vertices,texcoords,faces=[],[],[]
        with archive.open(fn) as text:
            for raw in text:
                if raw.startswith(b'v '):vertices.append([float(t) for t in raw.split()[1:4]])
                elif raw.startswith(b'vt '):texcoords.append([float(t) for t in raw.split()[1:3]])
                elif raw.startswith(b'f '):
                    face=[tuple(int(t) if t else 0 for t in s.split(b'/')[:2]) for s in raw.split()[1:]]
                    for j in range(1,len(face)-1):faces.append([face[0],face[j],face[j+1]])
        tiffs=sorted(x for x in archive.namelist() if x.lower().endswith('.tif'))
        maps=Image.new('RGB',(4096,2048))
        for i,f in enumerate(tiffs[:2]):
            with archive.open(f) as data:
                im=Image.open(io.BytesIO(data.read())).convert('RGB').resize((2048,2048),Image.Resampling.LANCZOS)
                maps.paste(im,(i*2048,0))
    pos=np.asarray(vertices,np.float64)
    absolute=np.median(pos[:,0])>10000
    if absolute:pos[:,:2]-=[514000,4923000]
    pos[:,2]-=2100
    xyz=np.ascontiguousarray(pos[:,[0,2,1]]*[1,1,-1],dtype=np.float32)
    uv=np.asarray(texcoords,np.float32)
    uv[:,0]*=.5
    faces=np.asarray(faces,np.int32).reshape(-1,3,2)-1
    print(name,'abs',bool(absolute),'xyz',xyz.min(0),xyz.max(0),'mesh faces',len(faces),'uv',uv.min(0),uv.max(0),flush=True)
    return xyz,uv,faces,maps,bool(absolute)

def convert_stl(src):
    with src.open('rb') as content:
        count=struct.unpack_from('<I',content.read(84),80)[0]
    dtype=np.dtype([('normal','<f4',3),('tri','<f4',(3,3)),('a','<u2')])
    faces=np.memmap(src,dtype=dtype,offset=84,shape=count)['tri']
    xyz = np.ascontiguousarray(faces[::2].reshape(-1,3),dtype=np.float32)
    print('Lone Star input',xyz.min(0),xyz.max(0),len(faces),flush=True)
    # The STL stores UTM East/North and survey height at the source datum.
    if np.median(xyz[:,0])>10000:
        xyz-=np.array([514000,4923000,2100],np.float32)
        absolute=True
    else:
        absolute=False
        if np.median(xyz[:,2])>1500:xyz[:,2]-=2100
    xyz=np.ascontiguousarray(xyz[:,[0,2,1]]*[1,1,-1],dtype=np.float32)
    grid=np.rint(xyz/.12).astype(np.int32)
    _, old, id=np.unique(grid,axis=0,return_index=True,return_inverse=True)
    vertices=xyz[old]
    tri=id.reshape(-1,3)
    valid=(tri[:,0]!=tri[:,1])&(tri[:,1]!=tri[:,2])&(tri[:,0]!=tri[:,2])
    unique=np.unique(np.sort(tri[valid],axis=1),axis=0,return_index=True)[1]
    return vertices,tri[valid][unique],absolute

def pack(out,name,xyz,texcoords,faces,image,absolute):
    # Raw relative metre coordinates preserve the original scan. Use an
    # approximately 8 cm cluster for Castle's full photogrammetry surface.
    if len(faces)>250000:
        grid=np.rint(xyz/.082).astype(np.int32)
        faces=faces[::1]
        valid_grid=np.any(grid[faces[:,0,0]]!=grid[faces[:,1,0]],axis=1)&np.any(grid[faces[:,1,0]]!=grid[faces[:,2,0]],axis=1)&np.any(grid[faces[:,0,0]]!=grid[faces[:,2,0]],axis=1)
        faces=faces[valid_grid]
        flattened=faces.reshape(-1,2)
        use=flattened[:,0]; mapped=np.rint(texcoords[flattened[:,1]]*2500).astype(np.int32)
        joined=np.column_stack((grid[use],mapped))
        _,selected,id=np.unique(joined,axis=0,return_index=True,return_inverse=True)
        compact=flattened[selected]
        tri=id.reshape(-1,3)
        _,differ=np.unique(np.sort(tri,axis=1),axis=0,return_index=True)
        id=tri[differ].ravel()
    else:
        compact,id=np.unique(faces.reshape(-1,2),axis=0,return_inverse=True)
    flat=np.column_stack((xyz[compact[:,0]],texcoords[compact[:,1]])).astype('<f4')
    bytes_data=struct.pack('<4sIII',b'Y3DP',len(flat),len(id),int(absolute))+flat.tobytes()+np.asarray(id,dtype='<u4').tobytes()
    (out/(name+'.mesh')).write_bytes(bytes_data)
    image.save(out/(name+'-scan.webp'),'WEBP',quality=83,method=4)
    print('packed',name,len(bytes_data),flush=True)

if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('source',type=Path);ap.add_argument('out',type=Path)
    args=ap.parse_args()
    for name in ['old-faithful','giant','castle']:
        pack(args.out,name,*obj(args.source,name+'.zip'))
    xyz,tri,absolute=convert_stl(args.source/'lone-star.stl')
    uv=(xyz[:,[0,2]]-(xyz[:,[0,2]].min(0)))*.11
    flat=np.column_stack([xyz,uv]).astype('<f4')
    dest=args.out/'lone-star.mesh'
    dest.write_bytes(struct.pack('<4sIII',b'Y3DP',len(flat),tri.size,int(absolute))+flat.tobytes()+np.asarray(tri,dtype='<u4').tobytes())
    print('packed Lone Star untextured survey',dest.stat().st_size,flush=True)
