"""Extract tree crown roots and heights from the public USGS Yellowstone lidar EPT."""
import argparse
import concurrent.futures
import io
import json
from pathlib import Path
import urllib.request
import numpy as np
from scipy.ndimage import maximum_filter, gaussian_filter
from scipy.spatial import cKDTree
from pyproj import Transformer
import laspy

URL='https://usgs-lidar-public.s3.amazonaws.com/WY_YellowstoneNP_3_2020'
X0,X1,Z0,Z1=-6000,6000,-12000,6000
SCALE=2
WIDTH=(X1-X0)//SCALE
HEIGHT=(Z1-Z0)//SCALE

def build(source,out):
    root=json.loads((source/'ept.json').read_text())
    tx=Transformer.from_crs(32612,3857,always_xy=True)
    utm=Transformer.from_crs(3857,32612,always_xy=True)
    corners=[tx.transform(514000+x,4923000-z) for x in (X0,X1) for z in (Z0,Z1)]
    bx,bn=min(q[0] for q in corners),min(q[1] for q in corners)
    ex,en=max(q[0] for q in corners),max(q[1] for q in corners)
    lo_x,lo_y,_,hi_x,hi_y,_=root['bounds']
    count=0
    def read(path):
        with urllib.request.urlopen(URL+'/'+path,timeout=20) as r:return r.read()
    def hull(key):
        d,x,y,z=map(int,key.split('-'))
        u=(hi_x-lo_x)/2**d; v=(hi_y-lo_y)/2**d
        west,south=lo_x+x*u,lo_y+y*v
        if west>ex or west+u<bx or south>en or south+v<bn:return 0
        # Depth 9 around the entire watershed, depth 10 within the flight's
        # geyser basins and measured river-adjacent forest.
        xutm,yutm=utm.transform(west+u/2,south+v/2)
        local_x,local_z=xutm-514000,4923000-yutm
        near_route=-3200<local_x<1060 and -8650<local_z<420
        near_lone=250<local_x<2300 and 4000<local_z<5350
        return 10 if near_route or near_lone else 9
    root_h=json.loads((source/'0-0-0-0.json').read_text())
    selected=[]
    next_shards=[]
    def collect(h):
        for k,n in h.items():
            d=int(k.split('-')[0])
            target=hull(k)
            if not target or d>target:continue
            if n<0: next_shards.append(k)
            elif d>=5 and n>0:selected.append(k)
    collect(root_h)
    with concurrent.futures.ThreadPoolExecutor(max_workers=14) as pool:
        while next_shards:
            pending=list(dict.fromkeys(next_shards));next_shards.clear()
            for h in pool.map(lambda k:json.loads(read('ept-hierarchy/'+k+'.json')),pending):collect(h)
        ground_tiles={}
        terrain=json.loads((out/'terrain.json').read_text())
        for x,z,step in terrain['tiles']:
            n=2000//step+1
            ground_tiles[x,z]=(np.fromfile(out/f'{x}_{z}.bin',dtype='<u2').reshape(n,n).astype('f4')/32+2100,step)
        limit=(HEIGHT,WIDTH)
        max_h=np.zeros(limit,np.float32); support=np.zeros(limit,np.uint8)
        print('EPT releases',len(selected),flush=True)
        def layer(key):
            for tries in range(3):
                try:
                    payload=read('ept-data/'+key+'.laz')
                    co=laspy.read(io.BytesIO(payload))
                    x,z=utm.transform(co.x,co.y)
                    return x-514000,4923000-z,np.asarray(co.z),np.asarray(co.classification)
                except Exception as exc:
                    if tries==2:print(key,str(exc),flush=True)
            return None
        # Read in bounded groups so verified decoded strips do not accumulate.
        for begin in range(0,len(selected),80):
            for record in pool.map(layer,selected[begin:begin+80]):
                if record is None:continue
                x,z,y,c=record
                good=(x>=X0)&(x<X1)&(z>=Z0)&(z<Z1)&((c==1)|(c==3)|(c==4)|(c==5))
                if not np.any(good):continue
                x,z,y,c=x[good],z[good],y[good],c[good]
                txs=(np.floor(x/2000)*2000).astype('i4')
                tzs=(np.floor(z/2000)*2000).astype('i4')
                ground=np.full_like(y,9999)
                for a,b in set(zip(txs,tzs)):
                    m=(txs==a)&(tzs==b)
                    data,step=ground_tiles[a,b]
                    ix,iz=(x[m]-a)/step,(z[m]-b)/step
                    i,j=ix.astype('i4'),iz.astype('i4')
                    ax,az=ix-i,iz-j
                    ground[m]=((1-ax)*data[j,i]+ax*data[j,i+1])*(1-az)+((1-ax)*data[j+1,i]+ax*data[j+1,i+1])*az
                relief=y-ground
                use=(relief>=2.6)&(relief<40)
                rows=((z[use]-Z0)/SCALE).astype('i4')
                cols=((x[use]-X0)/SCALE).astype('i4')
                np.maximum.at(max_h,(rows,cols),relief[use])
                np.maximum.at(support,(rows,cols),np.where(c[use]>1,2,1))
                count+=len(x)
            print('EPT',begin,min(begin+80,len(selected)),count,flush=True)
    # Optical footprints exclude roofs, bare ash and open water when first
    # returns have a generic class. Classified vegetation remains eligible.
    from PIL import Image
    for x,z,step in terrain['tiles']:
        im=np.asarray(Image.open(source/f'ortho-{x}-{z}.jpg').convert('RGB').resize((1000,1000),Image.Resampling.BILINEAR),dtype=np.float32)
        b,a=(z-Z0)//2,(x-X0)//2
        base=max_h[b:b+1000,a:a+1000]
        red,green,blue=im[:,:,0],im[:,:,1],im[:,:,2]
        eligible=(green>red*.91)&(green>blue*1.04)&(red<167)&(green<186)
        base[(support[b:b+1000,a:a+1000]<2)&~eligible]=0
    score=gaussian_filter(max_h,.64)+.27*max_h
    for _,ring in terrain.get('buildings',[]):
        xy=np.asarray(ring)
        c=np.mean(xy,axis=0)
        radius=np.linalg.norm(xy-c,axis=1).max()+4
        i,j=int((c[0]-X0)/SCALE),int((c[1]-Z0)/SCALE)
        r=int(radius/SCALE)+1
        xlo,xhi=max(0,i-r),min(WIDTH,i+r+1)
        zlo,zhi=max(0,j-r),min(HEIGHT,j+r+1)
        yy,xx=np.ogrid[zlo:zhi,xlo:xhi]
        strip=score[zlo:zhi,xlo:xhi]
        strip[(xx-i)**2+(yy-j)**2<=r*r]=0
    rows,cols=np.nonzero((score==maximum_filter(score,size=5))&(score>2.8)&(max_h>3.4))
    y=max_h[rows,cols]
    x,z=X0+cols*SCALE+1,Z0+rows*SCALE+1
    width=np.clip(y*.37,1.45,8.8)
    packed=np.column_stack((x*2,z*2,y*10,width*10)).astype('<i2')
    bank_distance,_=cKDTree([p[:2] for p in terrain['river']]).query(packed[:,:2]*.5,workers=3)
    upper=(bank_distance<210)&(z>-8950)&(z<575)
    other=(bank_distance<550)|(np.hypot(x+1149,z+7219)<2300)
    rate=np.where(upper,95,np.where(other,64,20))
    rate=np.where(z>=4000,np.where(np.hypot(x-1385,z-4640)<1050,80,20),rate)
    code=((packed[:,0].astype('u4')*2654435761)^(packed[:,1].astype('u4')*2246822519))%100
    accepted=packed[code<rate]
    accepted.tofile(out/'crowns.bin')
    print('Recorded crowns',len(accepted),flush=True)
    (out/'canopy-source.json').write_text(json.dumps({
        'archive':URL+'/ept.json','crownCount':len(accepted),'pointsRead':count,
        'cellM':SCALE,'detectedPeaks':len(packed)
    },indent=2)+'\n')

if __name__=='__main__':
    a=argparse.ArgumentParser(description=__doc__)
    a.add_argument('source',type=Path);a.add_argument('out',type=Path)
    args=a.parse_args()
    build(args.source,args.out)
