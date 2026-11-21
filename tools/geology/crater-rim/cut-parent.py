"""Cut the measured Watchman inset out of the existing Wizard Island and west rim TIN."""
from pathlib import Path
import argparse,struct,numpy as np

def clip(poly,axis,limit,sign,inside):
    kept=[]
    if not len(poly):return kept
    a=poly[-1];da=(a[axis]-limit)*sign
    for b in poly:
        db=(b[axis]-limit)*sign;ina=da>=0 if inside else da<=0;inb=db>=0 if inside else db<=0
        if ina!=inb:
            p=a+(b-a)*(da/(da-db));p[axis]=limit;kept.append(p)
        if inb:kept.append(b)
        a=b;da=db
    return kept

def main(source,target):
    data=source.read_bytes();sig,ver,step,l,t,r,b,nx,nz,datum,scale,count=struct.unpack_from('<4sHH4iHHffI',data)
    assert sig==b'ARF1' and ver==1
    ptr=40+2*nx*nz;out=bytearray(data[:ptr])
    bounds=(0,-4112-l,1),(0,-3808-l,-1),(1,252-t,1),(1,536-t,-1)
    touched=removed=0
    for _ in range(count):
        start=ptr;n,nt=struct.unpack_from('<2I',data,ptr);ptr+=8
        v=np.frombuffer(data,'<u2',n*3,ptr).reshape(-1,3);ptr+=n*6
        light=np.frombuffer(data,'u1',n*4,ptr).reshape(-1,4);ptr+=4*n
        tri=np.frombuffer(data,'<u2',nt*3,ptr).reshape(-1,3);ptr+=6*nt
        if v[:,0].max()<=bounds[0][1] or v[:,0].min()>=bounds[1][1] or v[:,1].max()<=bounds[2][1] or v[:,1].min()>=bounds[3][1]:
            out.extend(data[start:ptr]);continue
        touching=np.all([np.max((v[tri,axis].astype(float)-limit)*sign,axis=1)>0 for axis,limit,sign in bounds],axis=0)
        if not touching.any():out.extend(data[start:ptr]);continue
        whole=np.hstack((v,light)).astype('f8');verts=[tuple(row) for row in whole];pool={p:i for i,p in enumerate(verts)}
        indices=tri[~touching].tolist()
        for face in tri[touching]:
            p=list(whole[face])
            for axis,limit,sign in bounds:
                outer=clip(p,axis,limit,sign,False)
                if len(outer)>=3:
                    ids=[]
                    for vertex in outer:
                        pt=tuple(np.rint(vertex).astype(int));ix=pool.get(pt)
                        if ix is None:ix=len(verts);pool[pt]=ix;verts.append(pt)
                        ids.append(ix)
                    for j in range(1,len(ids)-1):
                        a,c,d=ids[0],ids[j],ids[j+1];ax,az=verts[a][:2];cx,cz=verts[c][:2];dx,dz=verts[d][:2]
                        if abs((cx-ax)*(dz-az)-(cz-az)*(dx-ax))>.1:indices.append([a,c,d])
                p=clip(p,axis,limit,sign,True)
                if len(p)<3:break
        touched+=1;removed+=nt-len(indices)
        if not indices:
            # Keep the section valid when the entire input falls inside the replacement.
            raise ValueError('A complete input section is inside the cut; omit it and revise the count')
        ids,local=np.unique(np.asarray(indices).ravel(),return_inverse=True);verts=np.asarray(verts)[ids];assert len(ids)<65536
        out.extend(struct.pack('<II',len(verts),len(indices)));out.extend(verts[:,:3].astype('<u2').tobytes());out.extend(verts[:,3:].astype('u1').tobytes());out.extend(local.astype('<u2').tobytes())
    out.extend(data[ptr:]);target.write_bytes(out)
    print(touched,'sections clipped,',removed,'parent faces removed')
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('target',type=Path);a=p.parse_args();main(a.source,a.target)
