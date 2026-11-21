"""Make the Reine harbour waterfront from Kartverket 1m DTM/DOM, OSM and Cappo80's CC BY 4.0 oblique."""
from pathlib import Path
from urllib.parse import urlencode
from xml.etree import ElementTree as ET
import argparse,gzip,hashlib,json
import numpy as np
import rasterio
from scipy.ndimage import distance_transform_edt,gaussian_filter
from shapely import contains_xy
from shapely.geometry import Polygon,box,LineString
from pyproj import Transformer
from PIL import Image,ImageDraw
from bake import fetch,sample,survey
from village_surfaces import roof_geometry,canopy_and_ground

HASHES={
    'reinebringen-full.jpg':'d8075155489c833f898e01b7e9bb656d8febbaa3284dde98f435056a4ea82de3',
    'reine-dtm.tif':'3bf0908857f7b98152f7689f070f3fdacbd02bd9dd2f4c1f599bd487e973a458',
    'reine-dom.tif':'da1ed4ca223d9d22659179ff9d7ae6df227587720e4e80b0ba63b2a2842a1655',
}
def verified(cache,name,url):
    path=fetch(cache,name,url)
    if hashlib.sha256(path.read_bytes()).hexdigest()!=HASHES[name]:
        raise ValueError('Source changed: '+name)
    return path

BOUNDS=(1432,3912,2600,4840)
ORIGIN=Transformer.from_crs(4326,25833,always_xy=True).transform(13.038,67.972)
PHOTO="https://upload.wikimedia.org/wikipedia/commons/2/27/Reine_vista_dal_Reinebringen.JPG"
LOOKOUT=(1438.04435,430.1084,4953.93421,.48774291,.270132244,.0445492461,807.714585)


def project(x,y,z):
    # Camera fit in the municipal EPSG:25833 survey frame. The roof faces are less
    # than a few photograph pixels wide near the northern limit.
    px,py,pz,az,down,roll,f=LOOKOUT
    dx,dy,dz=x-px,y-py,z-pz
    side=dx*np.cos(az)+dz*np.sin(az)
    horiz=dx*np.sin(az)-dz*np.cos(az)
    forward=horiz*np.cos(down)-dy*np.sin(down)
    below=-horiz*np.sin(down)-dy*np.cos(down)
    u=(640+f*(np.cos(roll)*side+np.sin(roll)*below)/forward)*3776/1280
    v=(427+f*(-np.sin(roll)*side+np.cos(roll)*below)/forward)*2520/854
    return u,v,forward


def extract_maps(cache):
    x0,z0,x1,z1=1430,3910,2600,4840
    e,n=ORIGIN
    bbox=','.join(f'{a:.3f}' for a in (e+x0,n-z1,e+x1,n-z0))
    params=urlencode(dict(bbox=bbox,bboxSR=25833,imageSR=25833,size='1170,930',format='tiff',pixelType='F32',interpolation='RSP_BilinearInterpolation',f='image',adjustAspectRatio='false'))
    fields=[]
    for table in ('DTM','DOM'):
        url='https://hoydedata.no/arcgis/rest/services/'+table+'/ImageServer/exportImage?'+params
        with rasterio.open(verified(cache,'reine-'+table.lower()+'.tif',url)) as ds:fields.append(ds.read(1))
    path=Path(__file__).parent/'source/reine-2026.osm.gz'
    xml=gzip.open(path,'rb').read() if path.exists() else (cache/'reine-map.osm').read_bytes()
    source=ET.fromstring(xml);to=Transformer.from_crs(4326,25833,always_xy=True)
    xy={}
    for node in source.findall('node'):
        ex,no=to.transform(float(node.get('lon')),float(node.get('lat')));xy[node.get('id')]=(ex-e,n-no)
    ways=[]
    for way in source.findall('way'):
        line=[xy[i.get('ref')] for i in way.findall('nd') if i.get('ref') in xy]
        if len(line)<2:continue
        tags={i.get('k'):i.get('v') for i in way.findall('tag')}
        cx,cz=np.mean(line,axis=0)
        if not(BOUNDS[0]<cx<BOUNDS[2] and BOUNDS[1]<cz<BOUNDS[3]):continue
        ways.append((int(way.get('id')),tags,line))
    return *fields,ways


def encode(cache,game):
    bare,surface,ways=extract_maps(cache)
    l,t,r,b=BOUNDS
    z,x=np.mgrid[t:b+2:2,l:r+2:2]
    def h(field,a,c):return sample(field,np.asarray(c)-3910.5,np.asarray(a)-1430.5)
    elev=h(bare,x,z);marine=(elev<.073)
    elev=np.where(marine,-.25-np.minimum(distance_transform_edt(marine)*.23,2.75),elev)
    photo=np.asarray(Image.open(verified(cache,'reinebringen-full.jpg',PHOTO)).convert('RGB'),dtype='f4')
    def color_at(px,py,pz):
        u,v,_=project(px,py,pz)
        return np.stack([sample(photo[:,:,i],v,u) for i in range(3)],axis=-1)
    def small(a):return np.round(np.array(a,dtype=float),2).tolist()
    buildings=[];racks=[];piers=[];zones=[];other=[];streets=[]
    ground_mask=Image.new('1',(r-l,b-t),0);draw=ImageDraw.Draw(ground_mask)
    for i,tags,line in ways:
        pts=np.asarray(line);closed=np.allclose(pts[0],pts[-1])
        if tags.get('building') and closed and len(pts)>=4:
            poly=Polygon(line).buffer(0).simplify(.16)
            if poly.geom_type!='Polygon' or poly.area<4 or not box(l,t,r,b).contains(poly):continue
            left,top,right,bottom=poly.bounds
            ez,ex=np.mgrid[int(top):int(bottom)+2,int(left):int(right)+2];valid=contains_xy(poly.buffer(-.72),ex,ez)
            if np.sum(valid)<4:valid=contains_xy(poly,ex,ez)
            if not np.any(valid):continue
            xv,zv=ex[valid],ez[valid];ground=h(bare,xv,zv);tops=h(surface,xv,zv)
            base=max(1.0,np.percentile(ground,42));roofHeight=np.percentile(tops,87)-base
            if tags['building']!='roof' and roofHeight<1.65:continue
            rect=poly.minimum_rotated_rectangle;corn=np.asarray(rect.exterior.coords[:-1]);edges=np.roll(corn,-1,axis=0)-corn
            along=edges[np.argmax(np.linalg.norm(edges,axis=1))];along/=np.linalg.norm(along)
            ctr=(corn.max(0)+corn.min(0))/2
            basis=np.stack([along,[-along[1],along[0]]]);local=(np.stack([xv,zv],1)-ctr)@basis.T
            truth=tops-base;shape_solutions=[]
            for axis in [0,1]:
                side=local[:,axis];edge=max(np.max(np.abs((np.asarray(poly.exterior.coords)-ctr)@basis[axis])),.5)
                best=(1e6,0,0,0,0)
                for shift in [-.16,0,.16]:
                    tent=np.maximum(0,1-np.abs(side-shift*edge)/edge)
                    mask=(truth>.8)&(truth<np.percentile(truth,97)+.4)
                    if mask.sum()<3:mask=np.ones_like(truth,dtype=bool)
                    A=np.stack([np.ones(mask.sum()),tent[mask]],axis=1)
                    eave,rise=np.linalg.lstsq(A,truth[mask],rcond=None)[0]
                    rise=max(0,min(rise,9));eave=max(1.8,min(eave,24))
                    err=np.median(np.abs(eave+rise*tent[mask]-truth[mask]))
                    if err<best[0]:best=(err,eave,rise,shift,edge)
                shape_solutions.append((best,axis))
            best,axis=min(shape_solutions,key=lambda a:a[0][0]);_,eave,rise,shift,half=best
            if rise<.74:rise=0;eave=np.percentile(truth,62)
            if tags['building']=='church':eave=5.6;rise=3.6;axis=1;shift=0
            ring=np.asarray(poly.exterior.coords[:-1])
            norm=basis[axis];origin=np.array(ctr)+norm*shift*half
            colors=color_at(xv,tops,zv)
            # Trim deep screen occlusions, spires, walls, reflected water and burnt white pixels.
            inner=np.abs(local[:,axis]-shift*half)<max(1,.63*half)
            if np.count_nonzero(inner)>3:colors=colors[inner]
            rgb=np.percentile(colors,50,axis=0);rgb=np.maximum(rgb,26)
            buildings.append(dict(kind=tags['building'],ring=small(ring),base=round(base,2),eave=round(eave,2),
                rise=round(rise,2),ridge=small([origin[0],origin[1],*norm,half]),roof=np.uint8(rgb).tolist()))
            if tags['building']!='church' and poly.area>58:
                measured=roof_geometry(poly,xv,zv,tops,base)
                if measured:buildings[-1]['mesh']=measured
            draw.polygon([(round(a-l),round(c-t)) for a,c in poly.buffer(2.8).exterior.coords],fill=1)
        elif tags.get('man_made')=='fish_flake':
            if closed:line=line[:-1]
            racks.append(small(line));draw.line([(round(a-l),round(c-t))for a,c in line],fill=1,width=4)
        elif tags.get('man_made')=='pier':
            piers.append(small(line))
        elif tags.get('landuse') in ('fish_drying','cemetery') or tags.get('leisure')=='pitch' or tags.get('amenity')=='parking':
            if closed:zones.append([tags.get('landuse') or tags.get('leisure') or 'parking',small(line[:-1])])
        elif tags.get('highway'):
            other.append((tags,line))
    # Ground colour is an inverse perspective lookup in the actual open oblique photo.
    # Disoccluded / built / upright vegetation pixels are replaced with nearby observed open ground.
    zz,xx=np.mgrid[t:b,l:r];xx=xx+.5;zz=zz+.5
    floor=h(bare,xx,zz);roof=h(surface,xx,zz)
    u,v,depth=project(xx,roof,zz)
    scale=.72;w0,h0=int(photo.shape[1]*scale+2),int(photo.shape[0]*scale+2)
    ui=np.clip(np.rint(u*scale).astype(int),0,w0-1);vi=np.clip(np.rint(v*scale).astype(int),0,h0-1)
    depths=np.full(w0*h0,np.inf,dtype='f4');np.minimum.at(depths,(vi*w0+ui).ravel(),depth.ravel());depths=depths.reshape(h0,w0)
    from scipy.ndimage import minimum_filter
    depths=minimum_filter(depths,size=5)
    ug,vg,dg=project(xx,floor,zz)
    visible=dg<=depths[np.clip(np.rint(vg*scale).astype(int),0,h0-1),np.clip(np.rint(ug*scale).astype(int),0,w0-1)]+7
    cover=np.asarray(ground_mask).astype(bool)|(roof-floor>2.5)|(~visible)
    ground_rgb=color_at(xx,floor,zz)
    dry=floor>.38
    if not np.any(~cover&dry):raise ValueError('No visible ground')
    nearest=distance_transform_edt(cover|~dry,return_distances=False,return_indices=True)
    repaired=ground_rgb[tuple(nearest)]
    alpha=gaussian_filter((cover|~dry).astype('f4'),1.1)
    rgb=ground_rgb*(1-alpha[:,:,None])+repaired*alpha[:,:,None]
    # At the southeast bottom corner the photographer's foreground grass masks this coast.
    # Leave the existing wider Sentinel mosaic outside the observed harbor.
    satellite=np.asarray(Image.open(game/'atlas-lofoten-photo.webp').convert('RGB'),dtype='f4')
    s=9200/satellite.shape[0]
    original=np.stack([sample(satellite[:,:,i],(zz+4600)/s-.5,(xx+4600)/s-.5) for i in range(3)],axis=2)
    edge=np.minimum(np.minimum(xx-l,r-xx),np.minimum(zz-t,b-zz))
    geom=np.clip((edge-7)/64,0,1)
    visibility=np.clip((728-vg*854/2520)/42,0,1)*np.clip((ug*1280/3776-587)/46,0,1)
    mix=geom*visibility*np.clip((floor+.3)/1.6,0,1)
    rgb=original+(rgb-original)*mix[:,:,None]
    # Dark slate photographed water isn't applied to the sea floor. Paths anchor the survey to real curbs/road widths.
    rgb,state,crowns=canopy_and_ground(bare,surface,ways,l,t,r,b,ground_rgb,cover,visible,rgb,mix,original)
    art=Image.fromarray(np.uint8(np.clip(rgb,0,255)));d=ImageDraw.Draw(art,'RGBA')
    for tags,line in other:
        kind=tags['highway'];wide={'trunk':8,'residential':5,'tertiary':6,'service':3,'living_street':4,'unclassified':5,'cycleway':2,'footway':1,'track':2}.get(kind,1)
        coords=[(round(a-l),round(c-t)) for a,c in line]
        streets.append([wide*.5,small(LineString(line).simplify(.30).coords)])
        if kind in ('path','footway','track'):d.line(coords,fill=(145,139,119,116),width=wide,joint='curve')
        else:
            d.line(coords,fill=(151,144,132,130),width=wide+2,joint='curve')
            d.line(coords,fill=(98,101,103,210),width=wide,joint='curve')
    art.putalpha(Image.fromarray(state));art.save(game/'landform-reine-aerial.webp',quality=91,method=6)
    vegetation=np.clip((rgb[:,:,1]-.82*rgb[:,:,0]-.18*rgb[:,:,2]-2.3)/15,0,1)
    vk=h(vegetation,x[::2,::2]-(l-1430),z[::2,::2]-(t-3910))
    survey(elev,vk,BOUNDS,220,.21,-3,1/48,[4,8,14,24,37,64,96,144,220,340],(-.42,-.908),1.539,game/'landform-reine.bin')
    compact=dict(buildings=buildings,racks=racks,piers=piers,zones=zones,streets=streets,crowns=crowns)
    (game/'lofoten-reine-data.js').write_text('// Mapped village database © OpenStreetMap contributors, ODbL-1.0. Height: © Kartverket; roof colour: Cappo80 (CC BY 4.0). See game/credits.txt.\nwindow.aerieReineHarbor='+json.dumps(compact,separators=(',',':'),default=float)+';\n')
    print('baked',len(buildings),'buildings;',len(racks),'fish flake lines;',len(piers),'piers;',len(zones),'mapped open grounds')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache',type=Path,required=True);parser.add_argument('--game',type=Path,required=True)
    args=parser.parse_args();args.cache.mkdir(exist_ok=True,parents=True);encode(args.cache,args.game)
