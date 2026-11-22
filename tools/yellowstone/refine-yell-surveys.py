"""Register GNIS sites, NAIP pool outlines and NHD bank sections to Aerie terrain."""
import argparse
from pathlib import Path
import json
import zipfile
import xml.etree.ElementTree as ET
from importlib.util import spec_from_file_location, module_from_spec

import numpy as np
from PIL import Image
from scipy.ndimage import median_filter, gaussian_filter1d
from shapely.geometry import shape, LineString, Point
from shapely.ops import transform

spec = spec_from_file_location('terrain', Path(__file__).with_name('build-yell-terrain.py'))
terrain = module_from_spec(spec)
spec.loader.exec_module(terrain)
KEYS = {'Old Faithful Geyser':'faithful', 'Excelsior Geyser Crater':'excelsior',
        'Grand Prismatic Spring':'prismatic', 'Morning Glory Pool':'morning', 'Sapphire Pool':'sapphire',
        'Fountain Paint Pot':'fountain', 'Fairy Falls':'fairy', 'Black Sand Pool':'black-sand'}
NAMES = ('Lone Star Geyser', 'Kepler Cascades', 'Castle Geyser', 'Grand Geyser', 'Giant Geyser',
         'Anemone Geyser', 'Beehive Geyser', 'Sawmill Geyser', 'Geyser Hill', 'Cliff Geyser',
         'Riverside Geyser', 'Great Fountain Geyser', 'White Dome Geyser')
DETAIL = {'faithful':(-710,-510), 'upper':(-2200,-1650), 'biscuit-survey':(-2930,-3320),
          'black-sand':(-2910,-912), 'morning':(-2020,-2150), 'midway':(-1720,-7600),
          'fairy':(-4280,-7600), 'fountain':(920,-10500), 'lone':(880,4130), 'kepler':(870,1100)}

def coord(lon, lat):
    x,z=terrain.local(lon,lat)
    return [round(float(x),2),round(float(z),2)]

def structures(source,meta):
    seen=set()
    for asset in sorted(source.glob('osm-*.source')):
        points,ways={},[]
        for _,el in ET.iterparse(asset,events=('end',)):
            if el.tag=='node':
                points[el.get('id')]=coord(float(el.get('lon')),float(el.get('lat')))
                el.clear()
            if el.tag=='way':
                ways.append((el.get('id'),[r.get('ref') for r in el.findall('nd')],
                             {r.get('k'):r.get('v') for r in el.findall('tag')}))
                el.clear()
        for key,refs,tags in ways:
            if key in seen or not refs or not all(ref in points for ref in refs):continue
            ring=[points[ref] for ref in refs]
            x,z=ring[0]
            if not (-4400<x<2400 and -8100<z<5100):continue
            seen.add(key)
            if tags.get('building') and len(ring)>3 and ring[0]==ring[-1]:
                name=tags.get('name','')
                meta['buildings'].append([name,ring[:-1]])
            if tags.get('surface') in ('wood','boardwalk') or tags.get('bridge')=='boardwalk' or tags.get('highway')=='boardwalk':
                meta['paths'].append(['boardwalk',ring])
            elif tags.get('highway') in ('footway','path'):
                meta['paths'].append(['path',ring])
    print('building footprints',len(meta['buildings']),'trails and boardwalks',len(meta['paths']),flush=True)

def setup_heights(source,out,meta):
    datasets=terrain.locate_dem(source)
    for x in range(-6000,6000,2000):
        z=4000
        stem=out/f'{x}_{z}'
        if not stem.with_suffix('.bin').exists():
            height=terrain.read_dem(datasets,x,z,2000,20)
            np.rint((height-2100)*32).astype('<u2').tofile(stem.with_suffix('.bin'))
            terrain.export_image(source/f'ortho-{x}-{z}.jpg',stem.with_suffix('.webp'))
        if [x,z,20] not in meta['tiles']:meta['tiles'].append([x,z,20])
    meta['details']=[]
    for name,(x,z) in DETAIL.items():
        dest=out/(name+'.bin')
        if not dest.exists() or name=='black-sand':
            height=terrain.read_dem(datasets,x,z,1000,2)
            np.rint((height-2100)*32).astype('<u2').tofile(dest)
            terrain.export_image(source/f'ortho-{name}.jpg',out/(name+'.webp'))
        meta['details'].append([name,x,z])
    payload={}
    for x,z,step in meta['tiles']:
        n=2000//step+1
        payload[x,z]=(np.fromfile(out/f'{x}_{z}.bin',dtype='<u2').reshape(n,n)/32,step)
    for name,x,z in meta['details']:
        payload[name]=(np.fromfile(out/f'{name}.bin',dtype='<u2').reshape(501,501)/32,2)
    def elevation(x,z):
        x=np.clip(x,-5999.99,5999.99);z=np.clip(z,-11999.99,5999.99)
        for key,u,v in meta['details']:
            if u+20<x<u+980 and v+20<z<v+980:break
        else:
            u=int(x//2000)*2000;v=int(z//2000)*2000;key=(u,v)
        values,step=payload[key]
        a,b=(x-u)/step,(z-v)/step
        i,j=int(a),int(b);s=a-i;t=b-j
        return ((1-s)*values[j,i]+s*values[j,i+1])*(1-t)+((1-s)*values[j+1,i]+s*values[j+1,i+1])*t
    return elevation

def align_river(source, meta, elevation):
    data=json.loads((source/'nhd-9.geojson').read_text())['features'][0]['geometry']
    area=transform(terrain.local,shape(data)).buffer(0)
    path=np.array([p[:2] for p in meta['river'] if -5960<p[0]<5960 and -11970<p[1]<5970])
    measured=[]
    matched=0
    for i,(x,z) in enumerate(path):
        a=path[max(i-1,0)];b=path[min(i+1,len(path)-1)]
        dx,dz=(b-a)/(np.linalg.norm(b-a) or 1)
        normal=np.array([dz,-dx])
        ray=LineString([path[i]-84*normal,path[i]+84*normal])
        section=area.intersection(ray)
        parts=[g for g in getattr(section,'geoms',[section]) if g.geom_type=='LineString' and not g.is_empty]
        point=Point(x,z)
        nearest=min(parts,key=lambda p:p.distance(point),default=None)
        if nearest and 4<nearest.length<75 and nearest.distance(point)<22:
            low,high=sorted(float(np.dot(np.array(p)-path[i],normal)) for p in [nearest.coords[0],nearest.coords[-1]])
            center=path[i]+normal*(low+high)*.5
            width=(high-low)*.5;matched+=1
        else:
            center=path[i];width=9 if z>-1900 else 12
        samples=[elevation(*(center+normal*w)) for w in np.linspace(-width*.68,width*.68,9)]
        water=float(np.quantile(samples,.60))+.25
        measured.append([*center,width,width,water])
    data=np.array(measured)
    data[:,2:4]=gaussian_filter1d(median_filter(data[:,2:4],size=(3,1)),.65,axis=0)
    data[:,4]=gaussian_filter1d(median_filter(data[:,4],size=5),.88)
    meta['river']=np.round(data,2).tolist()
    print('bank cross sections',matched,len(data),flush=True)

def align_pools(source,meta):
    meta['poolOutlines']={}
    for key,photo,reach,minimum in [('prismatic','midway',72,8),('excelsior','midway',54,10),
                                      ('morning','morning',10,3),('sapphire','biscuit-survey',17,3)]:
        x,z=meta['landmarks'][key]
        west,north=DETAIL[photo]
        colors=np.asarray(Image.open(source/f'ortho-{photo}.jpg')).astype(float)
        size=colors.shape[0]
        def pixel(a,b):
            i=min(size-1,max(0,int((a-west)*size/1000)))
            j=min(size-1,max(0,int((b-north)*size/1000)))
            return colors[j,i]
        weighted=[]
        for dx in np.linspace(-reach*.36,reach*.36,25):
            for dz in np.linspace(-reach*.36,reach*.36,25):
                r,g,b=pixel(x+dx,z+dz)
                weight=max(0,b-r-23)*max(0,g-r-23)
                if weight:weighted.append([x+dx,z+dz,weight])
        if weighted:
            a=np.array(weighted)
            x,z=np.average(a[:,:2],axis=0,weights=a[:,2])
            meta['landmarks'][key]=[round(float(x),2),round(float(z),2)]
        angles=np.linspace(0,2*np.pi,96,endpoint=False)
        radii=[]
        for t in angles:
            u,v=np.cos(t),np.sin(t)
            miss=0;last=minimum
            for rr in np.arange(minimum,reach,.56):
                r,g,b=pixel(x+rr*u,z+rr*v)
                wet=(g>r+17 and b>r+11)
                miss=0 if wet else miss+1
                if wet:last=rr
                if miss>3:break
            radii.append(last)
        radius=gaussian_filter1d(median_filter(radii,size=5,mode='wrap'),1.3,mode='wrap')
        outline=np.column_stack((x+radius*np.cos(angles),z+radius*np.sin(angles)))
        meta['poolOutlines'][key]=np.round(outline,2).tolist()
        print(key,meta['landmarks'][key],round(min(radius),1),round(max(radius),1),flush=True)

def refine(source,out):
    tile_file=out/'terrain.json'
    meta=json.loads(tile_file.read_text())
    with zipfile.ZipFile(source/'gnis-wy.zip') as archive:
        for row in archive.read('Text/DomesticNames_WY.txt').decode().splitlines():
            fields=row.split('|')
            name=fields[1]
            if name in KEYS or name in NAMES:
                meta['landmarks'][KEYS.get(name,name)]=coord(float(fields[16]),float(fields[15]))
    meta['buildings']=[];meta['paths']=[]
    structures(source,meta)
    height=setup_heights(source,out,meta)
    align_river(source,meta,height)
    align_pools(source,meta)
    meta.pop('water',None)
    tile_file.write_text(json.dumps(meta,separators=(',',':'))+'\n')

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('source',type=Path);p.add_argument('out',type=Path);a=p.parse_args()
    refine(a.source,a.out)
