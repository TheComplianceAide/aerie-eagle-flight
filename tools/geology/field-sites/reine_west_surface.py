"""Reine harbor terrain classes and the wind exposure along the western fishing quay."""
import io,struct
import numpy as np
from PIL import Image,ImageDraw
from scipy.ndimage import map_coordinates,gaussian_filter
from bake_hamnoy_shelter import pack,chunks,smooth
from bake_reinebringen import band
from bake_reine_west import geometry

def make(cache,game):
    dtm,dom,ways=geometry(cache);l,t,r,b=1110,3750,1800,4850
    z,x=np.mgrid[t:b,l:r];x=x+.5;z=z+.5
    def sample(a,col,row):return map_coordinates(a,[row,col],order=1,mode='nearest')
    h=sample(dtm,(x+600)/2,(z-3272)/2);dsm=sample(dom,x-900-.5,z-3790-.5);canopy=np.clip(dsm-h,0,11)
    dz,dx=np.gradient(h);slope=np.hypot(dz,dx)
    R=band(cache,'B04',x,z)[:,:,0];G=band(cache,'B03',x,z)[:,:,0];B=band(cache,'B02',x,z)[:,:,0];N=band(cache,'B08',x,z)[:,:,0];ndvi=(N-R)/np.maximum(1,N+R)
    rad=R*.24+G*.61+B*.15;local=np.clip(np.sqrt((rad+120)/(gaussian_filter(rad,17)+120)),.78,1.30)
    # Summer heath, low birch and willow on the upland have directional shade even under an overcast sky.
    scrub=smooth(.20,.64,ndvi)*(1.-smooth(.86,1.55,slope))
    bedrock=np.array([115,118,115]);heath=np.array([76,87,66]);moss=np.array([64,79,60]);
    veg=heath[None,None,:]*(1.-smooth(1.7,7.7,canopy)[:,:,None])+moss*smooth(1.7,7.7,canopy)[:,:,None]
    base=bedrock*(1.-scrub[:,:,None])+veg*scrub[:,:,None]
    detail=np.clip((h-gaussian_filter(h,4.5))*.033,-.18,.15)
    # The small differences between canopy top and ground relief supply localized small-scale shade, without baking identifiable crowns onto bare roads.
    veil=np.clip(.99+.035*(canopy-gaussian_filter(canopy,4.2)),.87,1.07);base*=np.clip(local*(1.+detail)*veil,.70,1.35)[:,:,None]
    roads=Image.new('L',(r-l,b-t));build=Image.new('L',roads.size);rd=ImageDraw.Draw(roads);houses=ImageDraw.Draw(build);quay=Image.new('L',roads.size);qd=ImageDraw.Draw(quay)
    for uid,tags,line in ways:
        xy=[(round(a-l),round(c-t))for a,c in line]
        if tags.get('building') and len(xy)>3:houses.polygon(xy,fill=255)
        if tags.get('highway'):
            kind=tags['highway'];width={'trunk':7,'residential':5,'tertiary':6,'service':3,'unclassified':5}.get(kind,1)
            rd.line(xy,fill=250 if width>2 else 130,width=width+1,joint='curve')
    # Surveyed fish houses front a continuous flat, working apron. Include only the documented concrete/timber landing and service yards.
    for poly in [[(1458,4318),(1482,4310),(1492,4334),(1485,4346),(1465,4352)],[(1471,4350),(1485,4343),(1508,4368),(1493,4381),(1473,4378)],[(1478,4383),(1495,4382),(1508,4386),(1499,4428),(1484,4428),(1477,4414)]]:
        qd.polygon([(round(q-l),round(s-t))for q,s in poly],fill=255)
    asphalt=gaussian_filter(np.array(roads,dtype='f4')/255,.51)
    apron=gaussian_filter(np.array(quay,dtype='f4')/255,1.6);edifice=gaussian_filter(np.array(build,dtype='f4')/255,1.45)
    wet=smooth(.25,1.20,h);apron*=wet*(1.-edifice)
    paving=np.array([106,104,98])*(.94+.060*np.sin(x*.58-z*.18)+.035*np.sin(z*.83+x*.23))[:,:,None]
    base=base*(1-apron[:,:,None])+paving*apron[:,:,None]
    base=base*(1-asphalt[:,:,None])+np.array([93,96,98])*(.98+.029*np.sin(z*.72-x*.48))[:,:,None]*asphalt[:,:,None]
    fringe=np.minimum.reduce([x-l,r-x,z-t,b-z]);area=smooth(3,59,fringe)*smooth(.1,1.1,h)
    # Preserve the separately registered roofs and green directly across the eastern harbor.
    area*=1.-smooth(1630,1796,x)
    area*=1.-smooth(120,230,h)
    pixels=np.dstack([np.uint8(np.clip(base,0,255)),np.uint8(255*area)])
    Image.fromarray(pixels).save(game/'reine-west-surface.webp',quality=88,method=6)
    # Cast a fan upwind through both modern 2/1 m surveyed local fields.
    # Closed harbor directions leave short wind ripples and no ocean breaker train.
    source=(game/'atlas-lofoten-shore.webp').read_bytes();image=Image.open(io.BytesIO(source));width,height=image.size
    alpha=np.array(image.getchannel('A'));zz,xx=np.mgrid[0:height,0:width];xx=((xx+.5)/width*2-1)*4600;zz=((zz+.5)/height*2-1)*4600
    inset=(xx>1100)&(xx<2590)&(zz>3595)&(zz<4550);wx=xx[inset];wz=zz[inset]
    # The existing village's DTM resolves the outer skerries in front of the fishing town.
    village=(game/'landform-reine.bin').read_bytes();_,_,st,x0,z0,x1,z1,nx,nz,datum,unit,_=struct.unpack_from('<4sHH4iHHffI',village)
    fjord=np.frombuffer(village,'<i2',offset=40,count=nx*nz).reshape(nz,nx)*unit+datum
    val=np.zeros_like(wx)
    for offset in np.linspace(-52,52,13):
        ray=np.arctan2(-.475,-.88)+np.radians(offset);first=np.full(len(wx),1700.)
        for d in np.geomspace(3,1700,60):
            px=wx+np.cos(ray)*d;pz=wz+np.sin(ray)*d
            local=sample(dtm,(px+600)/2,(pz-3272)/2);town=sample(fjord,(px-x0)/st,(pz-z0)/st)
            ground=np.where((px>x0)&(px<x1)&(pz>z0)&(pz<z1),town,local)
            first=np.where(ground>.42,np.minimum(first,d),first)
        val+=smooth(120,1450,first)/13
    edge=np.minimum.reduce([wx-1100,2590-wx,wz-3595,4550-wz])
    shade=np.ones_like(xx);shade[inset]=1.-(1.-val)*smooth(1,90,edge);shade=gaussian_filter(shade,.68)
    alpha=np.minimum(alpha,np.uint8(np.rint(128+127*np.clip(shade,0,1))))
    tmp=Image.new('RGBA',image.size,(140,140,140,255));tmp.putalpha(Image.fromarray(alpha));raw=io.BytesIO();tmp.save(raw,format='WEBP',quality=80)
    transpar=next(v for k,v in chunks(raw.getvalue()) if k==b'ALPH');color=next(v for k,v in chunks(source)if k==b'VP8 ')
    ext=b'\x10\0\0\0'+(width-1).to_bytes(3,'little')+(height-1).to_bytes(3,'little');parts=b'WEBP'+pack(b'VP8X',ext)+pack(b'ALPH',transpar)+pack(b'VP8 ',color)
    out=game/'atlas-lofoten-shore.webp'
    out.write_bytes(b'RIFF'+struct.pack('<I',len(parts))+parts)
