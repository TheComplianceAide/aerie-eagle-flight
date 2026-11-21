"""Build Reinevågen’s western wharves from Norwegian lidar, OSM and the 2015 quay photograph."""
from pathlib import Path
import argparse,gzip,hashlib,json
from urllib.parse import urlencode
from xml.etree import ElementTree as ET
import numpy as np,rasterio
from PIL import Image,ImageDraw
from scipy.ndimage import map_coordinates,gaussian_filter,distance_transform_edt
from shapely import contains_xy
from shapely.geometry import Polygon,LineString,box
from pyproj import Transformer
from bake import fetch
from village_surfaces import roof_geometry
from reinebringen_photographs import rgb_source

# These rectified facade strips come from the photograph. The undepicted faces use modeled weatherboard.
PANEL=[
    ((171949602,),[(278,619),(368,618),(368,632),(278,632)]),
    ((172703066,),[(409,623),(453,622),(453,631),(409,631)]),
    ((171949598,),[(555,602),(641,600),(641,626),(555,627)]),
    ((171949600,),[(796,566),(852,566),(852,588),(796,588)]),
    ((172703057,),[(702,563),(735,562),(735,579),(702,579)]),
    ((172703087,),[(633,566),(659,565),(659,578),(633,579)]),
    ((172703069,),[(790,619),(807,617),(806,629),(789,631)]),
    ((172703092,),[(974,616),(998,616),(998,626),(974,626)]),
]
def geometry(cache):
    e=Transformer.from_crs(4326,25833,always_xy=True);ex,no=e.transform(13.038,67.972)
    bbox=','.join(f'{v:.3f}'for v in (ex+900,no-5260,ex+1840,no-3790))
    q=urlencode(dict(bbox=bbox,bboxSR=25833,imageSR=25833,size='940,1470',format='tiff',pixelType='F32',interpolation='RSP_BilinearInterpolation',f='image',adjustAspectRatio='false'))
    path=fetch(cache,'western-dom.tif','https://hoydedata.no/arcgis/rest/services/DOM/ImageServer/exportImage?'+q)
    if hashlib.sha256(path.read_bytes()).hexdigest()!='93413562c53aeb4ec275784d194cc236cfd778e830d221cbea83c2010fc34546':raise ValueError('West Reine surface returns changed')
    with rasterio.open(path)as src:dom=src.read(1)
    with rasterio.open(cache/'reine-west-face-2m.tif')as src:dtm=src.read(1)
    archive=Path(__file__).parent/'source/reine-west-2026.osm.gz';xml=gzip.decompress(archive.read_bytes()) if archive.exists()else(cache/'western-ways.osm').read_bytes()
    if hashlib.sha256(xml).hexdigest()!='40e5a4b1e9fde71ffd9375512e1c8fde01a182bc9d2ace9698292f7d962782c6':raise ValueError('The packaged OSM source extract changed')
    root=ET.fromstring(xml);nodes={}
    for n in root.findall('node'):
        x,y=e.transform(float(n.get('lon')),float(n.get('lat')));nodes[n.get('id')]=(x-ex,no-y)
    ways=[]
    for w in root.findall('way'):
        pts=[nodes[v.get('ref')] for v in w.findall('nd') if v.get('ref') in nodes]
        if len(pts)>1:ways.append((int(w.get('id')),{k.get('k'):k.get('v')for k in w.findall('tag')},pts))
    return dtm,dom,ways
def make(cache,game):
    dtm,dom,ways=geometry(cache);pic=rgb_source(cache,'45328139')
    panels={osmid:j for j,(ids,_)in enumerate(PANEL) for osmid in ids}
    # Quantities below use field-image pixel controls in a 1150 by 767 survey print.
    kx,ky=pic.width/1150,pic.height/767
    atlas=Image.new('RGB',(1024,512));palette=[]
    for j,(_,v)in enumerate(PANEL):
        pts=np.array(v)*[kx,ky];quad=tuple(pts[[0,3,2,1]].ravel())
        image=pic.transform((248,112),Image.Transform.QUAD,quad,Image.Resampling.BICUBIC)
        rgb=np.asarray(image).astype('f4');brightness=rgb@np.array([.24,.61,.15]);paint=np.median(rgb[(brightness>np.percentile(brightness,30))&(brightness<np.percentile(brightness,78))],axis=0)
        palette.append(np.rint(np.clip(paint,12,240)).astype(int).tolist())
        # The low sunlight will illuminate the actual walls; remove uniform source cast but retain the window and planking.
        neutral=(rgb*.94+np.mean(rgb,axis=2,keepdims=True)*.06)*1.10
        tile=np.pad(np.uint8(np.clip(neutral,0,255)),((8,8),(4,4),(0,0)),mode='edge')
        atlas.paste(Image.fromarray(tile),((j%4)*256,(j//4)*128))
    # A broadside crop from the documented 2015 vessel. Distinct hull and bridge strips avoid burning the original shore into its silhouette.
    for idx,v in enumerate([[(87,633),(204,633),(204,655),(94,655)],[(110,627),(171,625),(171,637),(110,637)],[(135,616),(157,614),(157,624),(135,626)],[(785,637),(812,637),(814,641),(786,643)]]):
        pts=np.array(v)*[kx,ky];image=pic.transform((248,104),Image.Transform.QUAD,tuple(pts[[0,3,2,1]].ravel()),Image.Resampling.BICUBIC)
        if idx==0:
            # Straighten the real sheer and waterline independently. A rectangular crop otherwise streaks
            # the red band and white boot stripe diagonally down the side of the hull.
            bow=np.array([[43,257],[95,268],[166,277],[250,273],[328,258],[410,258]])
            keel=np.array([[78,324],[113,325],[176,324],[250,324],[325,321],[409,318]])
            along=np.linspace(0,1,248);marks=[0,.16,.35,.58,.80,1.];depth=np.linspace(0,1,104)[:,None]
            top=np.stack([np.interp(along,marks,bow[:,k])for k in range(2)],1)
            bot=np.stack([np.interp(along,marks,keel[:,k])for k in range(2)],1)
            uv=top[None,:,:]*(1-depth[:,:,None])+bot[None,:,:]*depth[:,:,None]
            scale=345/360
            px=210+uv[:,:,0]/scale;py=1720+uv[:,:,1]/scale;full=np.asarray(pic)
            image=Image.fromarray(np.uint8(np.stack([map_coordinates(full[:,:,k], [py,px],order=1,mode='nearest')for k in range(3)],2)))
        atlas.paste(Image.fromarray(np.pad(np.asarray(image),((12,12),(4,4),(0,0)),mode='edge')),(idx*256,256))
    xmp='''<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:cc="http://creativecommons.org/ns#"><dc:creator>Simo Räsänen (Ximonic)</dc:creator><dc:rights>Field photograph and resulting rectified waterfront and vessel materials, CC BY-SA 3.0.</dc:rights><cc:license rdf:resource="https://creativecommons.org/licenses/by-sa/3.0/"/><dc:source>https://commons.wikimedia.org/wiki/File:Marken_V_in_Reine,_Lofoten,_Norway,_2015_September.jpg</dc:source><dc:description>Rectified and color-balanced siding, windows, fishing vessel hull and bridge observed on the western quay in September 2015.</dc:description></rdf:Description></rdf:RDF></x:xmpmeta>'''
    atlas.save(game/'reine-west-quay-material.webp',quality=93,method=6,xmp=xmp.encode())
    houses=[];piers=[];streets=[]
    existing=json.loads((game/'lofoten-reine-data.js').read_text().split('=',1)[1].strip()[:-1]);occupied=[Polygon(b['ring'])for b in existing['buildings']]
    oldroads=[LineString(a)for _,a in existing['streets']];oldpiers=[LineString(a)for a in existing['piers']]
    district=box(1160,3760,1560,4580)
    gray=lambda a:np.round(np.asarray(a,dtype='f8'),2).tolist()
    def height(field,X,Z):return map_coordinates(field,[Z,X],order=1,mode='nearest')
    for osm,t,pts in ways:
        a=np.asarray(pts);line=LineString(pts)
        if not line.intersects(district):continue
        if t.get('building') and np.allclose(a[0],a[-1]):
            poly=Polygon(pts).buffer(0)
            if poly.geom_type!='Polygon' or any(poly.intersection(q).area>min(poly.area,q.area)*.22 for q in occupied):continue
            ctr=poly.centroid
            if not 965<ctr.x<1700 or not 3800<ctr.y<4910:continue
            poly=poly.simplify(.14);low,top,right,bottom=poly.bounds
            zz,xx=np.mgrid[np.floor(top):np.ceil(bottom)+1,np.floor(low):np.ceil(right)+1];mask=contains_xy(poly.buffer(-.8),xx,zz)
            if mask.sum()<4:continue
            xv,zv=xx[mask],zz[mask];base=float(np.percentile(height(dtm,(xv+600)/2,(zv-3272)/2),42));raw=height(dom,xv-900-.5,zv-3790-.5)
            if np.percentile(raw,90)-base<1.5:continue
            ring=np.array(poly.exterior.coords[:-1]);corn=np.asarray(poly.minimum_rotated_rectangle.exterior.coords[:-1]);d=np.roll(corn,-1,axis=0)-corn;d=d[np.argmax(np.linalg.norm(d,axis=1))];d/=np.linalg.norm(d);normal=np.array([-d[1],d[0]])
            mid=corn.mean(0);half=np.max(np.abs((ring-mid)@normal));tent=np.maximum(0,1-np.abs((np.stack([xv,zv],1)-mid)@normal)/half)
            eave,rise=np.linalg.lstsq(np.stack([np.ones_like(tent),tent],1),raw-base,rcond=None)[0]
            eave=np.clip(eave,1.6,17);rise=np.clip(rise,0,8)
            h=dict(kind=t['building'],ring=gray(ring),base=round(base,2),ridge=gray([*mid,*normal,half]),eave=round(float(eave),2),rise=round(float(rise),2),roof=[79,83,85],oid=osm)
            tab=panels.get(osm)
            if tab is not None:
                h['siding']=palette[tab];h['tab']=tab
                # Find the long wall that faces the source photographer, excluding end gables.
                edge=np.roll(ring,-1,axis=0)-ring;center=(np.roll(ring,-1,axis=0)+ring)*.5
                sign=1 if poly.exterior.is_ccw else -1
                out=np.stack([edge[:,1],-edge[:,0]],1)*sign
                toward=np.array([1840.83,4199.24])-center;toward/=np.linalg.norm(toward,axis=1)[:,None]
                score=np.sum(out*toward,axis=1);h['front']=int(np.argmax(score))
                h['roof']=[73,75,72] if tab<3 or tab>5 else [114,89,72]
            measured=roof_geometry(poly,xv,zv,raw,base)
            if measured:h['mesh']=measured
            houses.append(h)
        elif t.get('highway'):
            clipped=line.intersection(district)
            for g in ([clipped] if clipped.geom_type=='LineString' else getattr(clipped,'geoms',[])):
                if g.geom_type!='LineString' or g.length<1 or any(old.distance(g.interpolate(.5,normalized=True))<.65 for old in oldroads):continue
                width={'trunk':7.4,'residential':5.1,'tertiary':5.8,'service':3.0,'unclassified':4.8}.get(t['highway'],1.45)
                streets.append([width*.5,gray(g.simplify(.25).coords)])
        elif t.get('man_made')=='pier' and not any(old.hausdorff_distance(line)<.9 for old in oldpiers):piers.append(gray(a))
    data=dict(buildings=houses,piers=piers,streets=streets)
    (game/'lofoten-reinewest-data.js').write_text('// © OpenStreetMap contributors (ODbL); surveyed heights © Kartverket; colors Simo Räsänen (CC BY-SA 3.0).\nwindow.aerieReineWest='+json.dumps(data,separators=(',',':'),default=float)+';\n')
    print('West village',len(houses),'buildings',sum('mesh'in h for h in houses),'measured roofs;',len(piers),'piers',len(streets),'street/path segments.')
if __name__=='__main__':
    a=argparse.ArgumentParser();a.add_argument('--cache',type=Path,required=True);a.add_argument('--game',type=Path,required=True);v=a.parse_args();make(v.cache,v.game)
    from reine_west_surface import make as build_ground
    build_ground(v.cache,v.game)
