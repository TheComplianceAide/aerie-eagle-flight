"""Build Reinebringen, Hammarskaftet and the hanging basin of Reinevatnet from Norway's DTM and Sentinel-2."""
from pathlib import Path
from urllib.parse import urlencode
import argparse,struct,json,hashlib
import numpy as np,rasterio
from rasterio.windows import Window
from rasterio.features import shapes
from affine import Affine
from shapely.geometry import shape,Polygon
from scipy.ndimage import gaussian_filter,distance_transform_edt,label,binary_fill_holes
from pyproj import Transformer
from PIL import Image
from bake import fetch,sample,survey

WALL=(-424,3448,1896,5536)
SATELLITE='https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/32/W/PA/2025/7/S2C_32WPA_20250716_1_L2A/'
origin=Transformer.from_crs(4326,25833,always_xy=True).transform(13.038,67.972)

def band(cache,name,x,z):
    local=cache/('mountain-'+name+'.tif')
    if not local.exists():
        with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',GDAL_HTTP_TIMEOUT='30',GDAL_HTTP_MAX_RETRY='2'):
            with rasterio.open(SATELLITE+name+'.tif')as src:
                target=Transformer.from_crs(25833,src.crs,always_xy=True)
                px,pn=target.transform(origin[0]+x[[0,0,-1,-1],[0,-1,0,-1]],origin[1]-z[[0,0,-1,-1],[0,-1,0,-1]])
                col=(px-src.transform.c)/src.transform.a;row=(pn-src.transform.f)/src.transform.e
                left,top=int(col.min())-4,int(row.min())-4
                roi=Window(left,top,int(col.max())-left+5,int(row.max())-top+5)
                array=src.read(window=roi);tr=src.window_transform(roi)
                with rasterio.open(local,'w',driver='GTiff',width=array.shape[2],height=array.shape[1],count=array.shape[0],dtype=array.dtype,crs=src.crs,transform=tr)as ds:ds.write(array)
    with rasterio.open(local)as src:
        target=Transformer.from_crs(25833,src.crs,always_xy=True);px,pn=target.transform(origin[0]+x,origin[1]-z)
        return np.stack([sample(a.astype('f4'),(pn-src.transform.f)/src.transform.e-.5,(px-src.transform.c)/src.transform.a-.5)for a in src.read()],axis=-1)

def clip_town_bin(file):
    # The 232 m bake partitions are deliberately aligned on all of Reine's
    # retained town boundaries. Remove complete triangles from that inset.
    data=file.read_bytes();nx,nz=struct.unpack_from('<HH',data,24);n=struct.unpack_from('<I',data,36)[0]
    at=40+2*nx*nz;header=bytearray(data[:at]);kept=[];count=0
    for i in range(n):
        start=at;nv,nt=struct.unpack_from('<II',data,at);at+=8
        vs=np.frombuffer(data,dtype='<u2',count=nv*3,offset=at).reshape(-1,3)
        x=vs[:,0].astype('i4')+WALL[0];z=vs[:,1].astype('i4')+WALL[1]
        at+=nv*10+nt*6
        if np.min(x)>=1432 and np.min(z)>=3912 and np.max(z)<=4840:continue
        assert not(np.min(x)<1432<np.max(x) and np.max(z)>3912 and np.min(z)<4840)
        kept.append(data[start:at]);count+=nt
    assert at==len(data)
    struct.pack_into('<I',header,36,len(kept));file.write_bytes(bytes(header)+b''.join(kept));return count

def generate(cache,game):
    cache.mkdir(parents=True,exist_ok=True);game.mkdir(parents=True,exist_ok=True)
    l,t,r,b=WALL;z,x=np.mgrid[t:b+2:2,l:r+2:2]
    bbox=','.join(f'{v:.3f}' for v in [origin[0]-601,origin[1]-5661,origin[0]+1905,origin[1]-3271])
    q=urlencode(dict(bbox=bbox,bboxSR=25833,imageSR=25833,size='1253,1195',format='tiff',pixelType='F32',interpolation='RSP_BilinearInterpolation',f='image',adjustAspectRatio='false'))
    path=fetch(cache,'reine-west-face-2m.tif','https://hoydedata.no/arcgis/rest/services/DTM/ImageServer/exportImage?'+q)
    with rasterio.open(path)as src:h=src.read(1)[(t-3272)//2:(b-3272)//2+1,(l+600)//2:(r+600)//2+1]
    if hashlib.sha256(path.read_bytes()).hexdigest()!='e995895020027fae93b5dcf4914404e88e4be6f9744ad5369dbdd810cf30fe5d':
        raise ValueError('The archived Kartverket terrain input has changed; recheck shoreline and ridge controls.')
    wet=h<.071
    h=np.where(wet,-.23-np.minimum(6.3,.49*distance_transform_edt(wet)),h)
    gz,gx=np.gradient(h,2);slope=np.hypot(gx,gz)
    levels,number=label((np.abs(h-66.0)<1.12)&(slope<.26))
    level=levels[(4340-t)//2,(920-l)//2];mask=binary_fill_holes(levels==level)
    shore=distance_transform_edt(mask)*2.;lakeLevel=float(np.median(h[mask]))
    outline=shape(next(s for s,v in shapes(mask.astype('u1'),mask=mask,transform=Affine(2,0,l-1,0,2,t-1))if v==1)).simplify(2)
    lake=Polygon(outline.exterior)
    # Only the surface and its shore were surveyed. Use an illustrative bank below the observed water line.
    h=np.where(mask,lakeLevel-.15-np.minimum(8.5,.18*shore),h)
    data={'level':round(lakeLevel,2),'outline':np.rint(np.array(lake.exterior.coords[:-1])).astype(int).tolist(),'area':int(mask.sum()*4)}
    (game/'lofoten-reinevatnet-data.js').write_text('// Reinevatnet surface from Kartverket; see field-site credits.\nwindow.aerieReinevatnet='+json.dumps(data,separators=(',',':'))+';\n')
    rgb=band(cache,'TCI',x,z);nr=band(cache,'B08',x,z)[:,:,0];rd=band(cache,'B04',x,z)[:,:,0];ndvi=(nr-rd)/np.maximum(1,nr+rd)
    growth=np.clip((ndvi-.12)/.51,0,1)*np.clip((1.75-slope)/.86,0,1)*np.clip((h-.35)/3.3,0,1)
    growth=np.where(mask,0,growth)
    # The narrow gullies and water-polished buttresses span less than a Sentinel pixel. Restore their two-metre rock expression from the actual terrain.
    minor=np.clip((h-gaussian_filter(h,3.1))*.048,-.26,.22);channel=np.clip((gaussian_filter(h,8.)-h)*.036,0,.32)
    exposure=np.clip((slope-.38)/.98,0,1)*(1-.75*growth)
    # TCI records a daytime cast shadow on the north wall. Estimate mineral and
    # growing-cover albedos before the real dusk light illuminates the mesh.
    # In deep cast shadow local relative reflectance is more reliable than its absolute brightness.
    blue=band(cache,'B02',x,z)[:,:,0];green=band(cache,'B03',x,z)[:,:,0]
    visible=np.stack([rd,green,blue],2)
    scalar=visible@np.array([.244,.593,.163])
    # STAC S2C_32WPA_20250716_1_L2A: sun 175.8818 degrees true, elevation 43.2527.
    # The projected grid is UTM 33N; rotate true north into the local x/z axes.
    from pyproj import Proj
    convergence=Proj('EPSG:25833').get_factors(13.0715,67.9279).meridian_convergence
    az=np.radians(175.8817585-convergence);el=np.radians(43.2526628)
    sx=np.cos(el)*np.sin(az);sz=-np.cos(el)*np.cos(az)
    slopeLight=np.clip((np.sin(el)-sx*gx-sz*gz)/np.sqrt(1+gx*gx+gz*gz),0,1)
    intrinsic=scalar/(.36+.64*slopeLight)
    typical=gaussian_filter(intrinsic,13)
    grain=np.clip(np.sqrt((intrinsic+88)/(typical+88)),.73,1.35)
    muted=visible/np.maximum(170.,scalar)[:,:,None]
    bedrock=np.array([138,139,136])*(.92+.085*np.clip((intrinsic-650)/1250,-1.4,1.2))[:,:,None]
    bedrock*=np.clip(.89+.11*muted,.85,1.10)
    scrub=np.array([76,89,67])*(.95+.10*np.clip((ndvi-.46)*2.,-.7,.8))[:,:,None]
    mineral=1.-growth
    local=(bedrock*mineral[:,:,None]+scrub*growth[:,:,None])*grain[:,:,None]
    local*=np.clip(1.+minor-channel*.45,.67,1.24)[:,:,None]
    # Patches of late snow remain only where red, blue and green bands all reflect strongly.
    snow=np.clip((np.min(visible,axis=2)-2000)/850,0,1)*np.clip((h-135)/120,0,1)
    local=local*(1-snow[:,:,None])+np.array([192,197,200])*snow[:,:,None]
    local=rgb*(1-np.clip((h+.2)/3.,0,1)[:,:,None])+local*np.clip((h+.2)/3.,0,1)[:,:,None]
    # Dark, sheltered mineral soil below the actual water surface.
    local=np.where(mask[:,:,None],np.array([39,49,45]),local)
    rgba=np.dstack([np.uint8(np.clip(local,0,255)),np.uint8(24+np.clip(exposure,0,1)*230)])
    Image.fromarray(rgba).save(game/'landform-reinebringen-aerial.webp',quality=91,method=6)
    fn=game/'landform-reinebringen.bin'
    survey(h,growth[::2,::2],WALL,232,1.52,-7,1/36,[4,10,18,28,45,70,110,165,230,325,460,625,870,1200,1620],(-.423,-.906),1.539,fn)
    print('registered triangles',clip_town_bin(fn),'lake',data['area'],data['level'],'vertices',len(data['outline']),'summit',h.max())
    from reinebringen_crowns import crowns
    from reinebringen_photographs import build
    from reinebringen_mineral import make
    from reinebringen_lake import bake
    count=crowns(cache,game)
    build(cache,game);make(cache,game);bake(cache,game)
    print('Surveyed crown maxima:',count)
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--cache',type=Path,required=True);p.add_argument('--game',type=Path,required=True);a=p.parse_args();generate(a.cache,a.game)
