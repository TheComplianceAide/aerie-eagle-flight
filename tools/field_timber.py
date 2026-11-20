"""Closed, photographed deadwood and hand-cut camp joinery for Aerie."""
import math
import struct
import numpy as np
from PIL import Image
from scipy import ndimage
from skimage.measure import marching_cubes
from skimage.morphology import medial_axis

BRANCH_SPANS = [1.35,.64,1.23,1.05,2.12,1.75,1.37,.65,.95,2.8,1.32,1.14,.98,1.45,1.10,1.27]


def encode(vertices, faces, uv, manifold=False):
    p = np.asarray(vertices, dtype=float)
    f = np.asarray(faces, dtype=np.uint16)
    # Marching cubes sometimes emits two rim samples within the final 1/16000
    # quantisation unit. Weld in the delivered coordinate system so those faces
    # do not become zero-area triangles after packing.
    quantised,first,remap=np.unique(np.rint(p*16000).astype(np.int32),axis=0,return_index=True,return_inverse=True)
    p=quantised/16000
    uv=np.asarray(uv)[first]
    f=remap[f].astype(np.uint16)
    cross = np.cross(p[f[:,1]]-p[f[:,0]], p[f[:,2]]-p[f[:,0]])
    keep=np.linalg.norm(cross,axis=1)>1e-9
    f=f[keep];cross=cross[keep]
    if (p[f[:,0]]*cross).sum() < 0:
        f = f[:,[0,2,1]].copy()
        cross = -cross
    normal = np.zeros_like(p)
    for j in range(3):
        np.add.at(normal,f[:,j],cross)
    normal /= np.maximum(1e-9,np.linalg.norm(normal,axis=1,keepdims=True))
    if manifold:
        edges=np.sort(np.concatenate([f[:,[0,1]],f[:,[1,2]],f[:,[2,0]]]),axis=1)
        _,counts=np.unique(edges,axis=0,return_counts=True)
        if np.any(counts%2) or np.min(np.linalg.norm(normal[np.unique(f)],axis=1))<.99:
            return None
    v = np.column_stack([p*16000,normal*32767,np.asarray(uv)*32767])
    return (struct.pack('<II',len(v),f.size)+np.rint(v).clip(-32767,32767).astype('<i2').tobytes()+f.astype('<u2').tobytes(),len(f))


def deadwood(tile, cell, high, rect):
    # A medial branch with a 4 cm radius makes a round 8 cm limb, including
    # its underside. This does not extrude a flat silhouette along straight edges.
    res = 34 if high else 17
    w,h = [max(6,round(k*res/max(tile.size))) for k in tile.size]
    image = np.asarray(tile.resize((w,h),Image.Resampling.LANCZOS))
    mask = np.pad(image[:,:,3]>100,3)
    skeleton,distance = medial_axis(mask,return_distance=True,rng=np.random.default_rng(241+cell))
    yy,xx = np.nonzero(skeleton)
    shape = np.full((35,*mask.shape),-5.,np.float32)
    yrange,xrange = np.mgrid[0:mask.shape[0],0:mask.shape[1]]
    for y,x in zip(yy,xx):
        radius = min(12.6,max(.71,distance[y,x]-.27))
        # Let fork crotches lift and crushed bark settle with root diameter.
        centre = 1.3+radius*.84+(.65+.56*np.sin(x*.26+y*.13+cell))*radius*.19
        radial = (yrange-y)**2+(xrange-x)**2
        for z in range(max(0,int(centre-radius)-1),min(len(shape),math.ceil(centre+radius+2))):
            value = radius-np.sqrt(radial+((z-centre)*1.09)**2)
            np.maximum(shape[z],value,out=shape[z])
    shape[0]=shape[-1]=-5.
    # At a grid-aligned ridge, a small fraction of one reconstruction sample
    # resolves a quantised zero-normal tip without cutting an open seam.
    for level in [0,.0137,.0441,-.0223,.0619,-.047]:
        pts,faces,_,_ = marching_cubes(shape,level,allow_degenerate=False)
        z,y,x=pts.T
        u=np.clip((x-3+.5)/w,0,1); v=np.clip((y-3+.5)/h,0,1)
        # Keep antialias pixels just outside the photographed contour from
        # becoming a bright pale fringe around the underside of a narrow twig.
        solid=image[:,:,3]>205
        inward=ndimage.distance_transform_edt(~solid,return_distances=False,return_indices=True)
        ix=np.clip(np.floor(u*w).astype(int),0,w-1);iy=np.clip(np.floor(v*h).astype(int),0,h-1)
        u=(inward[1,iy,ix]+.5)/w;v=(inward[0,iy,ix]+.5)/h
        uv=np.column_stack([rect[0]+u*rect[2],1-rect[1]-v*rect[3]])
        p=np.column_stack([(x-3+.5-w*.5)/res,(z-z.min())/res,(y-3+.5-h*.5)/res])
        result=encode(p,faces,uv,manifold=True)
        if result:return result
    raise ValueError("Cannot obtain closed quantised timber geometry")


# Local joinery viewed from the porch. Each piece is (start, end, breadth,
# depth, rounded). Square beams retain sawn corners; rounds have bark sections.
def joinery(tile,cell,high,rect):
    def xbeam(x,y,z,length,r,rounded=False):
        return ([x-length/2,y,z],[x+length/2,y,z],r,r*.85,rounded)
    def post(x,y,z,height,r,rounded=False):
        return ([x,y,z],[x,y+height,z],r,r*.92,rounded)
    def tie(x,y,z,length,r):
        return ([x,y,z-length/2],[x,y,z+length/2],r,r*.9,True)
    recipes=[
        [xbeam(0,.18,.06,.94,.16,True),tie(.27,.12,0,.52,.13)],
        [xbeam(0,.12,0,.82,.13),xbeam(.03,.31,.02,.87,.13,True)],
        [xbeam(0,.09,0,.94,.12),xbeam(.10,.19,-.08,.63,.10)],
        [xbeam(-.16,.16,0,.56,.14,True),xbeam(.17,.27,0,.61,.12)],
        [post(-.34,0,0,.35,.12,True),post(.31,0,0,.35,.13,True),xbeam(0,.40,0,.96,.11,True)],
        [post(-.31,0,0,.56,.18),xbeam(.12,.46,-.04,.72,.13),xbeam(.12,.10,-.06,.72,.12)],
        [post(0,0,0,.34,.25),xbeam(0,.40,0,.81,.115)],
        [post(.30,0,0,.36,.11),([-.44,.08,0],[.29,.36,0],.14,.09,False)],
        [post(-.34,0,0,.49,.085),post(.31,0,0,.49,.085),xbeam(0,.54,0,.86,.10,True),xbeam(0,.06,0,.70,.07)],
        [xbeam(-.22,.17,0,.50,.145,True),xbeam(.17,.17,0,.46,.155,True),tie(.04,.18,.03,.39,.071)],
        [post(-.20,0,0,.23,.17),xbeam(.03,.275,0,.75,.13,True)],
        [xbeam(-.244,.12,0,.45,.15),xbeam(.244,.12,0,.45,.15)],
        [xbeam(-.17,.17,.04,.53,.14,True),xbeam(.18,.15,-.035,.51,.11)],
        [xbeam(0,.105,0,.96,.17),xbeam(-.25,.22,-.12,.39,.09)],
        [post(.29,0,0,.48,.105),xbeam(0,.54,0,.86,.11),([-.36,.04,0],[.20,.44,0],.081,.065,False)],
        [xbeam(-.04,.11,0,.81,.11,True),xbeam(.02,.28,.01,.93,.105,True),xbeam(.04,.44,-.02,.82,.10,True)]
    ]
    a=np.asarray(tile)[:,:,3]
    dist=ndimage.distance_transform_edt(a>210); work=dist.copy();patches=[]
    for _ in range(4):
        y,x=np.unravel_index(work.argmax(),work.shape);radius=max(1.,dist[y,x]*.67)
        patches.append(((x+.5)/tile.width,(y+.5)/tile.height,radius/tile.width,radius/tile.height))
        h,w=np.ogrid[:tile.height,:tile.width];work[(h-y)**2+(w-x)**2<(max(5,radius*2))**2]=0
    positions=[];faces=[];uv=[]
    for j,(aa,bb,r,d,isround) in enumerate(recipes[cell]):
        a,b=np.asarray(aa),np.asarray(bb);axis=(b-a)/np.linalg.norm(b-a)
        u=np.cross(axis,[0.,0.,1.] if abs(axis[2])<.8 else [0.,1.,0.]);u/=np.linalg.norm(u);v=np.cross(axis,u)
        if isround:
            sides=12 if high else 8
            shape=[(math.cos(i*2*math.pi/sides),math.sin(i*2*math.pi/sides)) for i in range(sides)]
        else:
            shape=[(-1,-.84),(-.84,-1),(.84,-1),(1,-.84),(1,.84),(.84,1),(-.84,1),(-1,.84)]
            if not high:shape=[(-1,-1),(1,-1),(1,1),(-1,1)]
        origin=len(positions);n=len(shape);step=[0,.045,.53,.96,1] if high else [0,.08,.93,1]
        tx,ty,rx,ry=patches[j%len(patches)]
        for k,t in enumerate(step):
            for i,(c,s) in enumerate(shape):
                edge=(.89 if k==0 or k==len(step)-1 else 1.)*(1+.023*math.sin(i*2.1+cell+j)+(.011 if isround else .004)*math.cos(k*1.2+i))
                positions.append((1-t)*a+t*b+u*c*r*edge+v*s*d*edge)
                uv.append((rect[0]+rect[2]*(tx+(t-.5)*1.85*rx),1-rect[1]-rect[3]*(ty+(.75*s+.12*c)*ry)))
        for k in range(len(step)-1):
            for i in range(n):
                p=origin+k*n+i;q=origin+k*n+(i+1)%n
                faces.extend([(p,q,q+n),(p,q+n,p+n)])
        for side in range(2):
            base=origin+side*(len(step)-1)*n
            for i in range(1,n-1):faces.append((base,base+i+1,base+i) if side==0 else (base,base+i,base+i+1))
    p=np.asarray(positions);p[:,1]-=p[:,1].min()
    return encode(p,faces,uv)
