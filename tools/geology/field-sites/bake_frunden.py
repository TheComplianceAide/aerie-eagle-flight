"""Rebuild Fründenhütte, the moraine lakes and the head of the Fründen glacier from Swiss federal surveys."""
from pathlib import Path
import argparse
import json
import sys
import zipfile
from xml.etree import ElementTree
from urllib.parse import urlencode

import numpy as np
import rasterio
from rasterio.features import shapes
from rasterio.transform import Affine
from scipy.ndimage import binary_closing, binary_fill_holes, gaussian_filter, label, distance_transform_edt
from shapely.geometry import Point, shape
from PIL import Image
from bake import fetch, sample, survey

ROOT = "https://data.geo.admin.ch/"
BASE_LEVEL = 1574.9
BOUNDS = (992,1712,1680,2388)
BUILDINGS = ["ID_B1EFD338-72C9-496A-B51B-4C64DD88E0FD","ID_E3680C20-869B-4445-AABE-94D30135FB34"]


def ortho(cache,name,bounds,size):
    url="https://wms.geo.admin.ch/?"+urlencode(dict(SERVICE="WMS",REQUEST="GetMap",VERSION="1.1.1",
        LAYERS="ch.swisstopo.swissimage",STYLES="",SRS="EPSG:2056",BBOX=",".join(map(str,bounds)),
        WIDTH=size[0],HEIGHT=size[1],FORMAT="image/jpeg"))
    return Image.open(fetch(cache,name,url)).convert("RGB")


def write_survey(cache,game):
    l,t,r,b = BOUNDS
    z,x=np.mgrid[t:b+2:2,l:r+2:2]
    heights=np.zeros_like(x,dtype="f4")
    for sheet in ("2622-1147","2622-1148","2623-1147","2623-1148"):
        prefix="swissalti3d_2025_"+sheet
        url=ROOT+"ch.swisstopo.swissalti3d/"+prefix+"/"+prefix+"_2_2056_5728.tif"
        with rasterio.open(fetch(cache,sheet+".tif",url)) as src:
            e,n=2622000+x,1150000-z
            inside=(e>=src.bounds.left)&(e<src.bounds.right)&(n>src.bounds.bottom)&(n<=src.bounds.top)
            sample_x=(e[inside]-src.transform.c)/2-.5
            sample_y=(src.transform.f-n[inside])/2-.5
            heights[inside]=sample(src.read(1),sample_y,sample_x)-BASE_LEVEL
    if np.min(heights)<650:raise ValueError("Missing survey coverage")
    photo=ortho(cache,"knoll-orthophoto.jpg",(2622990,1147610,2623680,1148290),(2070,2040))
    image=photo.crop(((l-990)*3,(t-1710)*3,(r-990)*3,(b-1710)*3))
    # Preserve the photographed glacier cracks. A registered alpha channel stores bare ice versus moraine.
    grid=np.asarray(image,dtype="f4")
    px,pz=np.meshgrid(l+(np.arange(image.width)+.5)/3,t+(np.arange(image.height)+.5)/3)
    # The summer terminus and lateral moraine follow these control vertices in the source.
    edge=np.array([[992,2420],[1220,2420],[1283,2355],[1315,2300],[1336,2214],[1355,2153],
                   [1371,2128],[1390,2129],[1431,2153],[1472,2163],[1500,2178],[1524,2194],
                   [1556,2173],[1572,2159],[1584,2108],[1605,2050],[1626,2011],[1655,1959],[1680,1928]])
    # Interpolate a single valued north boundary of the active ice within this footprint.
    front=np.interp(px,edge[:,0],edge[:,1])
    ice=np.clip((pz-front+2)/7,0,1)
    # A few-metre bare strip in front is glacial debris, snow remnants are read from their image values.
    # Blend image acquisition dates at the seam with the original game orthophoto.
    # The new area reaches across two 2-km Swiss image tiles at z=2000 m.
    distance=np.minimum(np.minimum(px-l,r-px),np.minimum(pz-t,b-pz))
    fade=np.clip((distance-2)/55,0,1);fade=fade*fade*(3-2*fade)
    rim=distance<58
    composite=grid.copy()
    for j in (2,3):
        mask=rim&(np.floor((pz+4000)/2000)==j)
        source=np.asarray(Image.open(game/("alpine-%d-2.jpg"%j)).convert("RGB"),dtype="f4")
        row=(pz[mask]-(-4000+j*2000))*source.shape[0]/2000-.5
        col=px[mask]*source.shape[1]/2000-.5
        prior=np.stack([sample(source[:,:,channel],row,col) for channel in range(3)],axis=1)
        composite[mask]=prior+(grid[mask]-prior)*fade[mask,None]
    # Keep every texel opaque to the image decoder; alpha encodes the ice class only.
    rgba=np.dstack([composite,32+ice*222+.5]).astype("u1")
    Image.fromarray(rgba).save(game/"landform-frunden-aerial.webp",quality=91,method=6)
    # Use the observed colour of open water and a connected shoreline within each source feature.
    # A seeded component excludes vegetation along the spur and shadowed rock beyond the ponds.
    red,green,blue=grid.transpose(2,0,1)
    wet=(green-red>1.5)&(green-blue>11)&(red-blue>5)&(green<163)
    lakes=[]
    for cx,cz,rx,rz in [(1289.8,1997.3,19,10),(1435.0,2028.0,17,9),(1276.2,2010.4,6,6)]:
        sub=wet&(((px-cx)/rx)**2+((pz-cz)/rz)**2<1)
        components,count=label(binary_fill_holes(binary_closing(sub,iterations=2)))
        if not count:continue
        areas=np.bincount(components.ravel());areas[0]=0
        mask=components==np.argmax(areas)
        outline=max((shape(g) for g,v in shapes(mask.astype("u1"),mask,
                        transform=Affine(1/3,0,l,0,1/3,t)) if v),key=lambda g:g.area)
        outline=outline.simplify(.34)
        if outline.area<2.5:continue
        rows,cols=np.nonzero(mask)
        wet_y=sample(heights,(pz[rows,cols]-t)/2,(px[rows,cols]-l)/2)
        level=float(np.percentile(wet_y,32))
        lakes.append(dict(level=round(level,3),outline=np.round(outline.exterior.coords[:-1],2).tolist()))
        # The official 2 m DTM samples mix bank and water in these shallow pools.
        # Lower only water-interior survey vertices under the separately modeled surface.
        for rr in range(max(0,int((cz-rz-t)/2)),min(len(z),int((cz+rz-t)/2)+2)):
            for cc in range(max(0,int((cx-rx-l)/2)),min(z.shape[1],int((cx+rx-l)/2)+2)):
                pt=Point(x[rr,cc],z[rr,cc])
                if outline.buffer(.18).contains(pt):
                    depth=min(.78,.08+pt.distance(outline.exterior)*.23)
                    heights[rr,cc]=min(heights[rr,cc],level-depth)
        print("Observed meltwater area and elevation",round(outline.area,1),round(level+BASE_LEVEL,2),np.percentile(wet_y,[5,95])+BASE_LEVEL)
    survey(heights,np.zeros_like(heights[::2,::2]),BOUNDS,172,.29,640,1/42,
           [4,8,14,23,36,58,95,150,220,340],(-.91,.414),1.539,game/"landform-frunden.bin")
    roof=ortho(cache,"hut-vertical.jpg",(2623240,1148040,2623320,1148120),(800,800))
    # Use the 10 cm image for the actual boulder apron. Remove the photographic
    # roof silhouettes and their midday shadows under the independently lit 3D structures.
    from PIL import ImageDraw
    mask_im=Image.new("L",roof.size);stroke=ImageDraw.Draw(mask_im)
    for polygon in [[(284,350),(462,242),(532,370),(342,478)],[(195,344),(276,290),(328,370),(243,429)]]:
        stroke.polygon(polygon,fill=255)
    mask=np.array(mask_im)>0
    src=np.asarray(roof,dtype="f4");N=distance_transform_edt(mask,return_distances=False,return_indices=True)
    fill=gaussian_filter(src[tuple(N)],sigma=(2.1,2.1,0))
    alpha=gaussian_filter(mask.astype("f4"),1.9)[:,:,None]
    apron=np.uint8(np.clip(src*(1-alpha)+fill*alpha,0,255))
    Image.fromarray(apron).save(game/"frunden-apron.webp",quality=93,method=6)
    roof.crop((220,300,565,515)).save(game/"frunden-roofs.webp",quality=94,method=6)
    # Actual 2008 hut wall: rectified shutter, upper window, doorway and masonry.
    # Caumasee's released public-domain photograph is 860 x 645; coordinates are image pixels.
    facade_source="https://upload.wikimedia.org/wikipedia/commons/1/16/Fr%C3%BCndenh%C3%BCtte_gegen_Doldenhorn.jpg"
    archived=Path(__file__).parent/"source/frunden-gable.jpg"
    facade=Image.open(archived if archived.exists() else fetch(cache,"hut-north-gable.jpg",facade_source)).convert("RGB")
    if facade.size!=(860,645):facade=facade.resize((860,645),Image.Resampling.LANCZOS)
    rects=[((733,317),(736,350),(751,347),(749,313)),((635,275),(635,303),(650,296),(648,269)),
           ((634,339),(634,403),(666,398),(665,330)),((769,294),(771,327),(803,313),(801,286))]
    atlas=Image.new("RGB",(256,96))
    for i,quad in enumerate(rects):
        patch=facade.transform((64,96),Image.Transform.QUAD,tuple(v for xy in quad for v in xy),Image.Resampling.BICUBIC)
        atlas.paste(patch,(i*64,0))
    # The field view was acquired in mountain shade. Recover surface reflectance
    # before the play scene applies its own sun and skylight a second time.
    raw=np.asarray(atlas,dtype="f4")/255
    balanced=np.uint8(np.clip((.048+1.41*raw**.82)*255,0,255))
    Image.fromarray(balanced).save(game/"frunden-facade.webp",quality=94,method=6)
    return lakes


def write_buildings(cache,game,lakes):
    name="swissbuildings3d_3_0_2021_1248-33"
    url=ROOT+"ch.swisstopo.swissbuildings3d_3_0/"+name+"/"+name+"_2056_5728.citygml.zip"
    with zipfile.ZipFile(fetch(cache,"frunden-citygml.zip",url)) as z:
        data=ElementTree.fromstring(z.read(z.namelist()[0]))
    out=[]
    for ident in BUILDINGS:
        building=next(b for b in data.findall(".//{*}Building") if ident in b.attrib.values())
        faces={}
        for name in ("Roof","Wall"):
            attr=building.findall(".//{*}"+name+"Surface/{*}lod2MultiSurface/{*}MultiSurface/{*}surfaceMember/{*}Polygon/{*}exterior/{*}LinearRing/{*}posList")
            rings=[]
            for pos in attr:
                pts=np.array(list(map(float,pos.text.split()))).reshape(-1,3)[:-1]
                pts=np.stack([pts[:,0]-2622000,pts[:,2]-BASE_LEVEL,1150000-pts[:,1]],axis=1)
                assert len(pts)==3
                rings.append(np.round(pts,3).tolist())
            faces[name.lower()]=rings
        out.append(faces)
    result={"hut":out,"ponds":lakes}
    (game/"swiss-frunden-data.js").write_text("// swissBUILDINGS3D 3.0, swissALTI3D and SWISSIMAGE, Federal Office of Topography swisstopo.\nwindow.aerieFrundenSurvey="+json.dumps(result,separators=(",",":"))+";\n")


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache",type=Path,required=True);parser.add_argument("--game",type=Path,required=True)
    args=parser.parse_args();args.cache.mkdir(exist_ok=True,parents=True)
    write_buildings(args.cache,args.game,write_survey(args.cache,args.game))
