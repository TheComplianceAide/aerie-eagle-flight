"""Build urban ground classes, lidar roof planes, and individual crown returns for Reine."""
import numpy as np
from PIL import Image,ImageDraw
from scipy.ndimage import maximum_filter,distance_transform_edt,gaussian_filter
from scipy.spatial import cKDTree
from shapely import contains_xy
import triangle


def roof_geometry(poly,x,z,raw,base):
    # Interior DSM samples support the roof while footprint corners pin the eaves.
    # Exterior returns and treetops are suppressed before fitting each roof.
    bounds=poly.bounds;X,Z=np.floor(np.array(bounds[:2])).astype(int);w,h=np.ceil(np.array(bounds[2:])-np.array([X,Z])).astype(int)+1
    if min(w,h)<3:return None
    ring=np.asarray(poly.exterior.coords[:-1]);inside=np.ones_like(raw,dtype=bool)
    low,high=np.percentile(raw,[10,90]);inside&=(raw>=max(low-2.1,base+1))&(raw<=high+2.5)
    xy=np.stack([x[inside],z[inside]],1);hh=raw[inside]
    if len(xy)<5:return None
    # A local plane fitted to nearby valid DSM returns reaches facade vertices
    # without dragging the adjacent gutter, grass or water up into the roof.
    tree=cKDTree(xy);zz,xx=np.mgrid[Z:Z+h,X:X+w];p=np.stack([xx.ravel(),zz.ravel()],1)
    def value(q):
        ds,idx=tree.query(q,k=min(len(xy),12));v=xy[idx]-q[:,None,:];y=hh[idx];weights=1/(.8+ds)
        out=[]
        for l in range(len(q)):
            mat=np.column_stack([np.ones(idx.shape[1]),v[l]])
            c=np.linalg.lstsq(mat*weights[l,:,None],y[l]*weights[l],rcond=None)[0]
            out.append(np.clip(c[0],max(base+1,low-1.4),high+1.2))
        return np.array(out)
    grid=value(p).reshape(h,w)
    # Approximate broad industrial breaks and residential hips at 1.5-2 m while keeping indoor footprint seams.
    edge=poly.buffer(-1.1)
    step=2 if poly.area<1000 else 2.8
    ins=[]
    for z0 in np.arange(Z+.7,Z+h-.3,step):
        for x0 in np.arange(X+.7,X+w-.3,step):
            if contains_xy(edge,x0,z0):ins.append([x0,z0])
    verts=np.vstack([ring,np.array(ins).reshape(-1,2)])
    coords=verts-[X,Z]
    # Linear interpolation of the fitted surface over the compact mesh.
    from scipy.ndimage import map_coordinates
    levels=map_coordinates(grid,[coords[:,1],coords[:,0]],order=1,mode='nearest')
    geom=triangle.triangulate({'vertices':verts,'segments':np.array([[k,(k+1)%len(ring)]for k in range(len(ring))],dtype='i4')},'pQ')
    if 'triangles'not in geom or len(geom['vertices'])!=len(verts):return None
    quant=np.rint(np.column_stack([coords[:,0]*10,(levels-base)*10,coords[:,1]*10])).astype(int)
    return [[int(X),int(Z)],quant.ravel().tolist(),np.asarray(geom['triangles']).ravel().tolist(),len(ring)]


def canopy_and_ground(bare,surface,ways,l,t,r,b,ground_rgb,cover,visible,photo_rgb,mix,original):
    # Site-specific exclusion and physical terrain material are generated in the same 1m municipal frame.
    size=(r-l,b-t);roads=Image.new('L',size);buildings=Image.new('L',size);lots=Image.new('L',size)
    rd=ImageDraw.Draw(roads);bd=ImageDraw.Draw(buildings);ld=ImageDraw.Draw(lots)
    for _,tags,line in ways:
        coords=[(round(x-l),round(z-t)) for x,z in line]
        if tags.get('building') and len(coords)>2:bd.polygon(coords,fill=255);bd.line(coords,fill=255,width=5)
        if tags.get('highway'):
            k=tags['highway'];w={'trunk':8,'tertiary':6,'residential':5,'unclassified':5,'service':3,'living_street':4,'cycleway':2,'footway':1,'path':1,'track':2}.get(k,1)
            rd.line(coords,fill=208 if k in ('path','track','footway')else 255,width=w+2,joint='curve')
        if tags.get('leisure')=='pitch':ld.polygon(coords,fill=210)
        elif tags.get('amenity')=='parking' and len(coords)>3:ld.polygon(coords,fill=160)
        elif tags.get('landuse')=='fish_drying' and len(coords)>3:ld.polygon(coords,fill=120)
        elif tags.get('landuse')=='cemetery' and len(coords)>3:ld.polygon(coords,fill=80)
    road=np.asarray(roads);building=np.asarray(buildings).astype(bool);lot=np.asarray(lots)
    floor=bare[t-3910:b-3910,l-1430:r-1430];dsm=surface[t-3910:b-3910,l-1430:r-1430]
    h=np.clip(dsm-floor,0,23);smooth=gaussian_filter(h,.71)
    # Distinguish dark Norwegian coastal birch from cars/roofs by lidar crown height,
    # local canopy width, exterior footprint, and green photographed foliage where visible.
    grass=(ground_rgb[:,:,1]-ground_rgb[:,:,0]*.83-ground_rgb[:,:,2]*.17)>1.1
    mask=(floor>.30)&(smooth>1.82)&~building&(road<100)&(lot!=120)&(lot!=160)&(lot!=210)
    mask&=gaussian_filter(grass.astype('f4'),2.2)>.26
    peaks=mask&(smooth==maximum_filter(np.where(mask,smooth,0),size=6))&(smooth<17.5)
    rain=distance_transform_edt(mask)
    crowns=[]
    for j,i in zip(*np.nonzero(peaks)):
        H=float(smooth[j,i]);crown=min(7.5,max(1.15,2*rain[j,i]),H*.88+.95)
        if crown<1.5 or (rain[j,i]<1.35 and H<3):continue
        crowns.append([int(i+l),int(j+t),round(H,1),round(crown,1)])
    rgb=photo_rgb.copy()
    # No oblique camera can see the ground directly under a house; use neighboring
    # damp grass or verge materials, not projected roofs or repeated nearest-color polygons.
    anchor=(floor>.29)&visible&~building&(road==0)&(lot==0)&grass
    if np.any(anchor):
        dist,idx=distance_transform_edt(~anchor,return_indices=True)
        neighbor=gaussian_filter(ground_rgb[tuple(idx)],sigma=(3.5,3.5,0))
        neighbor=np.minimum(neighbor,np.array([123,139,111]))
        neighbor=neighbor*.75+np.array([67,81,58])*.25
        observer=np.clip((dist-1)/7,0,1)
        bad=gaussian_filter((cover|building).astype('f4'),1.75)
        weight=bad*np.clip((floor-.05)/.5,0,1)*mix*np.maximum(.48,observer)
        rgb=rgb*(1-weight[:,:,None])+neighbor*weight[:,:,None]
    # Hard surfaces have a distinct BRDF and mineral base. This channel is not a new terrain sampler.
    paved=np.maximum(road.astype('f4')/255,np.where(lot==160,.9,0))
    paving=gaussian_filter(paved,.42)
    rgb=rgb*(1-.86*paving[:,:,None])+np.array([111,111,104])*.86*paving[:,:,None]
    pitch=(lot==210).astype('f4')*.85
    rgb=rgb*(1-pitch[:,:,None])+np.array([56,83,55])*pitch[:,:,None]
    # Background and areas hidden by the photographer's foreground return to the native mosaic.
    rgb=original+(rgb-original)*np.clip(mix*1.38,0,1)[:,:,None]
    state=32+np.uint8(np.clip(paving,0,1)*222)
    return rgb,state,crowns
