#!/usr/bin/env python3
"""Render-safe display data and deterministic candidate trees from verified zonal sources."""
import array, base64, collections, gzip, hashlib, json, math, struct, sys, zlib
from pathlib import Path
from PIL import Image

world,optical_path,canopy_path=sys.argv[1:4]
assert world in ('acadia','lofoten')
out=Path(__file__).resolve().parents[1]/'game'
stem=world+'-fused-preview'
opt=json.loads(Path(optical_path).read_text()); veg=json.loads(Path(canopy_path).read_text())
origin=opt.get('origin') or opt.get('utmOrigin'); rect=opt.get('localRect'); crs=opt['epsg']
assert rect==veg['localRect'] and all(abs(a-b)<.001 for a,b in zip(origin,veg.get('utmOrigin') or veg.get('origin')))
w,h,s=opt['width'],opt['height'],opt['step']
l,t,r,b=rect
def decode(e):
    raw=zlib.decompress(base64.b64decode(next(v for k,v in e.items() if 'base64' in k.lower())))
    assert hashlib.sha256(raw).hexdigest()==(e.get('sha256') or e.get('rawSha256'))
    return raw
obs={k:decode(v) for k,v in opt['layers'].items()}
Image.frombytes('RGB',(w,h),obs['rgb']).save(out/(stem+'-color.jpg'),quality=91,subsampling=0,optimize=True)
ndsi=array.array('b',obs['ndsi']);ndwi=array.array('b',obs['ndwi'])
mat=bytearray(w*h*4)
for i,c in enumerate(obs['material']):
    if c==1:mat[i*4]=233
    elif c==2:mat[i*4+2]=219
    elif c==3 and ndwi[i]>-128:mat[i*4+3]=min(255,max(143,190+ndwi[i]))
    elif c==4 and world=='lofoten' and ndsi[i]>-128:mat[i*4+1]=min(255,max(84,120+2*ndsi[i]))
(out/(stem+'-material.bin')).write_bytes(gzip.compress(mat,compresslevel=9,mtime=0))
layers={k:decode(v) for k,v in veg['layers'].items() if k in ('canopy','red','nir','scl')}
def band(k,x,z):
    m=veg['layers'][k]; g=m['step'];i=math.floor((x-l)/g);j=math.floor((z-t)/g)
    if i<0 or j<0 or i>=m['width'] or j>=m['height']:return m.get('nodata',255 if k=='canopy' else 0)
    idx=j*m['width']+i
    return struct.unpack_from('<H',layers[k],idx*2)[0] if m['dtype']=='<u2' else layers[k][idx]
def random(i,j,k):
    h=((i+5711)*73856093 ^ (j+3167)*19349663 ^ (k+103)*83492791)&0xffffffff
    h=((h^(h>>13))*1274126177)&0xffffffff
    return (h^(h>>16))/4294967296
pitch=10 if world=='acadia' else 9
cap=6200 if world=='acadia' else 3000
tile={}
st=veg['layers']['canopy']['step']
def good(q):return 0<q<255
for j in range(math.ceil((b-t)/pitch)):
    for i in range(math.ceil((r-l)/pitch)):
        x=round(2*(l+(i+.2+.6*random(i,j,2))*pitch))/2
        z=round(2*(t+(j+.2+.6*random(i,j,3))*pitch))/2
        if min(x-l,r-x,z-t,b-z)<25 or band('scl',x,z)!=4 or not good(band('canopy',x,z)):continue
        R,N=band('red',x,z),band('nir',x,z)
        if not R or not N or (N-R)/(N+R)<(.44 if world=='acadia' else .47):continue
        hs=sorted(q for a,b0 in ((0,0),(st,0),(-st,0),(0,st),(0,-st),(st,st),(-st,-st)) if good(q:=band('canopy',x+a,z+b0)))
        if len(hs)<4 or hs[int(len(hs)*.64)]<(5 if world=='acadia' else 2.8):continue
        model=min(24 if world=='acadia' else 7.6,hs[int(len(hs)*.64)]*(.83+.28*random(i,j,4)))
        width=model*(.32+.20*random(i,j,5) if world=='acadia' else .63+.23*random(i,j,5))
        k=math.floor(x/128),math.floor(z/128)
        tile.setdefault(k,[]).append((random(i,j,6),x,z,model,width,random(i,j,7)))
for a in tile.values():a.sort(reverse=True)
packed=bytearray()
for i in range(60):
    for k in sorted(tile,key=lambda k:random(k[0],k[1],i+11)):
        if len(packed)//7>=cap:break
        ls=tile[k]
        if len(ls)<=i:continue
        _,x,z,hh,ww,seed=ls[i]
        packed.extend(struct.pack('<hhBBB',round(x*2),round(z*2),round(hh*8),round(ww*16),int(seed*255)))
    if len(packed)//7>=cap:break
(out/(stem+'-canopy.bin')).write_bytes(gzip.compress(packed,compresslevel=9,mtime=0))
meta=dict(world=world,epsg=crs,bounds=rect,origin=origin,width=w,height=h,step=s,
          source=opt['source'],opticalRules=opt.get('rules'),opticalHashes={k:m.get('sha256') or m.get('rawSha256') for k,m in opt['layers'].items()},
          masks=collections.Counter(obs['material']),canopy={'count':len(packed)//7,'tiles':len(tile),'source':{k:v for k,v in veg['layers']['canopy'].items() if 'base64' not in k.lower()},'rule':'Optical positive NDVI and SCL 4, height-model agreement; stock plants and terrain protected.'})
(out/(stem+'.json')).write_text(json.dumps(meta,indent=2)+'\n')
print(world,rect,meta['masks'],len(packed)//7,len(tile))
