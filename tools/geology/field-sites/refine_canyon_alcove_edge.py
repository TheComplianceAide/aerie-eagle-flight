"""Split the inner boundary of the existing Horseshoe Bend USGS terrain.

The native alcove is drawn on a 5 m grid. One-metre stations include every
perimeter crossing of these grid edges and their diagonals. At runtime each
station is set to the actual native triangle height. The operation is idempotent.
"""

from argparse import ArgumentParser
from pathlib import Path
import struct

# The native carved wall occupies this opening in the surrounding 3DEP TIN.
RECT = (-592, -336, -456, -240)


def refine(source):
    assert source[:4] == b'ARF1'
    xl,zl,_,_=struct.unpack_from('<4i',source,8)
    nx,nz=struct.unpack_from('<HH',source,24)
    parts=struct.unpack_from('<I',source,36)[0]
    at=40+nx*nz*2
    data=bytearray(source[:at]); faces_added=0; points_added=0
    l,t,r,b=RECT
    def perimeter(a,c):
        ax,az,_=a;bx,bz,_=c
        if ax==bx and ax+xl in (l,r) and min(az,bz)+zl>=t and max(az,bz)+zl<=b:
            return abs(az-bz)
        if az==bz and az+zl in (t,b) and min(ax,bx)+xl>=l and max(ax,bx)+xl<=r:
            return abs(ax-bx)
        return 0
    for _ in range(parts):
        nv,nt=struct.unpack_from('<II',source,at);at+=8
        pts=list(struct.iter_unpack('<3H',source[at:at+nv*6]));at+=nv*6
        flux=list(struct.iter_unpack('<4B',source[at:at+nv*4]));at+=nv*4
        tris=list(struct.iter_unpack('<3H',source[at:at+nt*6]));at+=nt*6
        indices=[]
        for tri in tris:
            edges=[perimeter(pts[tri[i]],pts[tri[(i+1)%3]]) for i in range(3)]
            if max(edges)<2:
                indices.append(tri);continue
            def add(values,exposure):
                pts.append(tuple(map(round,values)));flux.append(tuple(map(round,exposure)));return len(pts)-1
            ring=[]
            for i,steps in enumerate(edges):
                a,other=tri[i],tri[(i+1)%3];ring.append(a)
                for k in range(1,steps):
                    u=k/steps
                    ring.append(add([v+(w-v)*u for v,w in zip(pts[a],pts[other])], [v+(w-v)*u for v,w in zip(flux[a],flux[other])]))
            # A fan off the original opposite point retains the original plane
            # and introduces no interior samples for the usual single edge.
            if sum(s>1 for s in edges)==1:
                side=next(i for i,n in enumerate(edges) if n>1);a=tri[(side+2)%3]
                start=ring.index(a);ring=ring[start:]+ring[:start]
                indices.extend((a,ring[j],ring[j+1]) for j in range(1,len(ring)-1))
            else:
                mid=add([sum(pts[q][j] for q in tri)/3 for j in range(3)], [sum(flux[q][j] for q in tri)/3 for j in range(4)])
                indices.extend((mid,q,ring[(j+1)%len(ring)]) for j,q in enumerate(ring))
        assert len(pts)<65536
        data.extend(struct.pack('<II',len(pts),len(indices)))
        for q in pts:data.extend(struct.pack('<3H',*q))
        for c in flux:data.extend(struct.pack('<4B',*c))
        for tri in indices:data.extend(struct.pack('<3H',*tri))
        faces_added+=len(indices)-nt;points_added+=len(pts)-nv
    data.extend(source[at:])
    return bytes(data),faces_added,points_added


if __name__=='__main__':
    cli=ArgumentParser();cli.add_argument('terrain',type=Path);p=cli.parse_args().terrain
    src=p.read_bytes();out,faces,vertices=refine(src)
    assert refine(out)[0]==out
    if out!=src:p.write_bytes(out)
    print(f'{vertices} added boundary vertices, {faces} extra triangles')
