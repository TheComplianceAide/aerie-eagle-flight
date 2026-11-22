"""Build the Aerie Yellowstone terrain pack from local source surveys."""
import argparse
import concurrent.futures
import json
from pathlib import Path
import re

import numpy as np
from PIL import Image
import rasterio
from rasterio.windows import Window
from scipy.ndimage import gaussian_filter, maximum_filter, map_coordinates
from pyproj import Transformer
from shapely.geometry import shape, LineString, MultiPoint, box
from shapely.ops import linemerge, transform, unary_union
from shapely import contains_xy

EAST, NORTH, DATUM = 514000, 4923000, 2100
STEP, TILE = 8, 2000
DETAILS = {
    'faithful': (-710, -510), 'upper': (-2200, -1650),
    'biscuit': (-2230, -3690), 'midway': (-1720, -7600),
}
TIERS = [('faithful', 44.46046, -110.82815), ('prismatic',44.52505,-110.83819),
         ('excelsior',44.52611,-110.838105), ('morning',44.47212,-110.84312),
         ('sapphire',44.48436,-110.85542), ('fairy',44.52529,-110.87189),
         ('fountain',44.55021,-110.80648), ('black-sand',44.46378,-110.85323),
         ('runoff',44.52534,-110.83585)]
BBOX = (-6000, -12000, 6000, 4000)
WGS = Transformer.from_crs(4326,32612,always_xy=True)

def local(lon, lat):
    e,n = WGS.transform(lon,lat)
    return np.asarray(e)-EAST,NORTH-np.asarray(n)

def compact_point(x,z):
    return [round(float(x),2),round(float(z),2)]

def spatial(local_source):
    landmarks = {key:compact_point(*local(lon,lat)) for key,lat,lon in TIERS}
    thermal_path = local_source/'thermal-utm-1.json'
    if thermal_path.exists():
        for feat in json.loads(thermal_path.read_text()).get('features',[]):
            prop,geom=feat['attributes'],feat.get('geometry',{})
            if 'x' in geom:
                landmarks[prop['NAME']]=compact_point(geom['x']-EAST,NORTH-geom['y'])
    r = []
    for feat in json.loads((local_source/'hydro-1.geojson').read_text())['features']:
        if feat['properties'].get('GNIS_NAME') != 'Firehole River': continue
        g = transform(local, shape(feat['geometry']))
        if g.geom_type=='MultiLineString':r.extend(g.geoms)
        elif g.geom_type=='LineString': r.append(g)
    joined=linemerge(unary_union(r))
    if joined.geom_type=='LineString':joined=[joined]
    else:joined=list(joined.geoms)
    joined.sort(key=lambda v:v.length,reverse=True)
    firehole=max(joined, key=lambda w: w.intersection(box(-3500,-8200,1500,1000)).length)
    if firehole.coords[0][1]<firehole.coords[-1][1]:
        firehole=LineString(list(firehole.coords)[::-1])
    area_paths=[]
    for i in ['nhd-9.geojson','nhd-12.geojson']:
        if not (local_source/i).exists(): continue
        for feat in json.loads((local_source/i).read_text()).get('features',[]):
            geom=feat.get('geometry')
            if not geom:continue
            polygon=transform(local,shape(geom)).intersection(box(*BBOX))
            if polygon.is_empty or polygon.area<9: continue
            if polygon.geom_type=='MultiPolygon': ps=polygon.geoms
            elif polygon.geom_type=='Polygon': ps=[polygon]
            else: continue
            name=feat['properties'].get('gnis_name',feat['properties'].get('GNIS_NAME')) or ''
            for part in ps:
                if part.area<=9:continue
                simple=part.simplify(.65)
                area_paths.append({'name':name,'source':i,'rings':[
                    [compact_point(x,z) for x,z in ring.coords[:-1]]
                    for ring in [simple.exterior,*simple.interiors]]})
    features, paths, buildings = [],[],[]
    for path in sorted(local_source.glob('osm-*.json')):
        data=json.loads(path.read_text()).get('elements',[])
        if not data:continue
        for item in data:
            tags=item.get('tags',{})
            coords=item.get('geometry')
            if not coords and 'lon' in item:coords=[item]
            if not coords:continue
            point=[compact_point(*local(c['lon'],c['lat'])) for c in coords]
            if 'building' in tags and len(point)>3:
                buildings.append([tags.get('name',''),point[:-1] if point[0]==point[-1] else point])
            elif tags.get('natural')=='hot_spring' and tags.get('name'):
                features.append([tags['name'],point[0]])
                if len(point)>=8 and point[0]==point[-1]:
                    area_paths.append({'name':tags['name'],'source':'osm','rings':[point[:-1]]})
            elif tags.get('surface')=='wood' or tags.get('bridge')=='boardwalk' or tags.get('highway')=='footway':
                kind='boardwalk' if tags.get('surface')=='wood' or tags.get('bridge')=='boardwalk' else 'path'
                paths.append([kind,point])
        break
    for name,point in features: landmarks.setdefault(name,point)
    route=[]
    for p in range(0,int(firehole.length),12):
        v=firehole.interpolate(p);route.append(compact_point(v.x,v.y))
    return landmarks,route,area_paths,paths,buildings

def locate_dem(source):
    datasets=[]
    for path in sorted(source.glob('dem-*.tif')):
        with rasterio.open(path) as data:
            bounds=data.bounds
            datasets.append((path,bounds))
    return datasets

def read_dem(datasets, x, z, span, step):
    cells=int(span/step)+1
    u=EAST+x+np.arange(cells)*step
    v=NORTH-z-np.arange(cells)*step
    h=np.full((cells,cells),np.nan,np.float32)
    for path,b in datasets:
        cols=np.where((u>b.left+.6)&(u<b.right-.6))[0]
        rows=np.where((v>b.bottom+.6)&(v<b.top-.6))[0]
        if not len(cols) or not len(rows):continue
        with rasterio.open(path) as data:
            ys=(data.transform.f-v[rows])-.5
            xs=(u[cols]-data.transform.c)-.5
            c0,r0=max(0,int(xs.min())),max(0,int(ys.min()))
            w=min(data.width-c0,int(np.ceil(xs.max()))-c0+2)
            d=min(data.height-r0,int(np.ceil(ys.max()))-r0+2)
            raw=data.read(1,window=Window(c0,r0,w,d))
            yy,xx=np.meshgrid(ys-r0,xs-c0,indexing='ij')
            values=map_coordinates(raw,[yy,xx],order=1,mode='nearest')
            valid=values>1600
            pos=np.ix_(rows,cols)
            h[pos]=np.where(valid,values,h[pos])
    if not np.isfinite(h).all():
        count=np.count_nonzero(~np.isfinite(h))
        raise ValueError(f'{x}, {z} span {span}, missing {count} elevation samples')
    return h

def export_image(src,dest):
    im=Image.open(src).convert('RGB')
    im.save(dest, 'WEBP', quality=87,method=4)
    return np.asarray(im)

def build(source,out):
    out.mkdir(parents=True,exist_ok=True)
    datasets=locate_dem(source)
    landmarks,river,polys,paths,buildings=spatial(source)
    print('landmarks',landmarks,'river:',len(river),river[::70],'water shapes',len(polys),flush=True)
    line=LineString(river)
    tiles=[]
    for x in range(BBOX[0],BBOX[2],TILE):
        for z in range(BBOX[1],BBOX[3],TILE):
            if not (source/f'ortho-{x}-{z}.jpg').exists():continue
            near=line.distance(box(x,z,x+TILE,z+TILE))<600
            step=STEP if near else 20
            tiles.append((x,z,step))
    def tile_job(tile):
        x,z,step=tile
        geo=f'{x}_{z}'
        measured=read_dem(datasets,x,z,TILE,step)
        np.rint((measured-DATUM)*32).astype('<u2').tofile(out/f'{geo}.bin')
        photo=export_image(source/f'ortho-{x}-{z}.jpg',out/f'{geo}.webp')
        print(geo,step,float(measured.min()),float(measured.max()),flush=True)
        return [x,z,step]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        tiles=list(pool.map(tile_job,tiles))
    details=[]
    for name,(x,z) in DETAILS.items():
        path=source/f'ortho-{name}.jpg'
        if not path.exists():continue
        export_image(path,out/f'{name}.webp')
        # Centred metres retain the berms, sinter terraces and thermal shelves.
        ht=read_dem(datasets,x,z,1000,2)
        np.rint((ht-DATUM)*32).astype('<u2').tofile(out/f'{name}.bin')
        details.append([name,x,z])
    meta=dict(tiles=tiles,details=details,landmarks=landmarks,river=river,water=polys,paths=paths,buildings=buildings)
    (out/'terrain.json').write_text(json.dumps(meta,separators=(',',':'))+'\n')

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path)
    parser.add_argument('output',type=Path)
    opts=parser.parse_args()
    build(opts.source,opts.output)
