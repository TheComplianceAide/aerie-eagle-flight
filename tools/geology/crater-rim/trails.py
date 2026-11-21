"""Fit NPS trail centre lines to the local lidar bench; retain the trail surface inside each survey."""
import json
import numpy as np
from scipy.ndimage import gaussian_filter1d, map_coordinates
from scipy.spatial import cKDTree
from shapely.geometry import box,LineString
from PIL import Image,ImageDraw,ImageFilter

def build_trail(sources,name,bounds,h,x,z,step,photo):
    code='Watchman Peak Trail' if name=='watchman' else 'Cleetwood Cove Trail'
    data=json.loads((sources/'nps-trails.json').read_text())['features']
    item=next(f for f in data if f['attributes']['TRLNAME']==code)
    xy=np.array(item['geometry']['paths'][0]);line=LineString(np.c_[xy[:,0]-571464,4755190-xy[:,1]])
    l,t,r,b=bounds
    clipped=line.intersection(box(l+3,t+3,r-3,b-3))
    paths=list(clipped.geoms) if clipped.geom_type=='MultiLineString' else [clipped]
    w,ph=photo.size;mask=Image.new('L',(w,ph),255);draw=ImageDraw.Draw(mask);crib=[];length=0
    den=(r-l)/(w-1)
    def height(a,zz):return map_coordinates(h,[(zz-t)/step,(a-l)/step],order=1,mode='nearest')
    for path in paths:
        if path.length<7:continue
        distance=np.linspace(0,path.length,1+int(np.ceil(path.length/.8)))
        xy=np.array([[p.x,p.y] for p in [path.interpolate(d) for d in distance]])
        vel=np.gradient(xy,axis=0);vel/=np.maximum(.001,np.linalg.norm(vel,axis=1))[:,None]
        normal=np.c_[-vel[:,1],vel[:,0]];cx,cz=xy.T;nx,nz=normal.T
        # The GPS line can fall just beside an actual bench. In a +/-3 m normal section,
        # favour a genuinely flat tread and penalize offset; smooth shifts along the path.
        offsets=np.linspace(-3,3,25);cols=[]
        for s in offsets:
            def xs(o):return height(cx+nx*(s+o),cz+nz*(s+o))
            cols.append(np.abs(xs(.67)-xs(-.67))*.9+np.abs(xs(.3)-xs(-.3))*.45+abs(s)*.095)
        shift=gaussian_filter1d(offsets[np.argmin(cols,axis=0)],2.6)
        xy+=normal*shift[:,None];cx,cz=xy.T
        target=gaussian_filter1d(height(cx,cz),1.15)
        # Width is constrained by the park's five-to-six-foot specification at Cleetwood.
        half=.84 if name=='cleetwood' else .69
        points=np.column_stack((x.ravel(),z.ravel()));nearest=cKDTree(xy);rad,key=nearest.query(points,distance_upper_bound=2.6)
        take=np.isfinite(rad);dx=x.ravel()[take]-cx[key[take]];dz=z.ravel()[take]-cz[key[take]]
        j=key[take];along=dx*vel[j,0]+dz*vel[j,1];grade=np.gradient(target,distance)
        blend=1-np.clip((rad[take]-half*.74)/(1.68-half*.74),0,1);blend=blend*blend*(3-2*blend)
        blend*=np.clip((np.minimum.reduce([cx[j]-l,r-cx[j],cz[j]-t,b-cz[j]])-3)/12,0,1)
        if name=='watchman':blend*=np.clip((np.hypot(cx[j]+3942.83,cz[j]-379.27)-8)/7,0,1)
        initial=h.ravel()[take];h.ravel()[take]=initial+np.clip(target[j]+along*grade[j]-initial,-.65,.65)*blend
        p=[((a-l)/den,(c-t)/den) for a,c in xy]
        draw.line(p,fill=130,width=max(2,round(2*half/den)),joint='curve');length+=path.length
        if name=='cleetwood':
            # Render old supporting timbers on steep, exposed outer bench sections near the shore.
            for j in range(2,len(xy)-5,4):
                a=xy[j];end=xy[j+4]
                if np.linalg.norm(a-[2877,-3420])>185 or abs(end[0]-a[0])+abs(end[1]-a[1])<1.8:continue
                left,right=[height(np.array([a[0]+sign*nx[j]*2.30]),np.array([a[1]+sign*nz[j]*2.30]))[0] for sign in [-1,1]]
                down=-1 if left<right else 1
                relief=target[j]-min(left,right)
                if relief<.86:continue
                p0=a+down*normal[j]*.95;p1=end+down*normal[j+4]*.95
                a3=np.r_[p0,target[j]];b3=np.r_[p1,target[j+4]]
                segments=max(1,int(np.ceil(np.linalg.norm(p1-p0)/4.)))
                for k in range(segments):
                    start=a3+(b3-a3)*k/segments;end=a3+(b3-a3)*(k+1)/segments
                    crib.append([round(float(f),2) for f in (*start,*end,min(1.5,relief))])
    photo=photo.convert('RGBA');photo.putalpha(mask.filter(ImageFilter.GaussianBlur(.63)))
    return h,photo,crib,round(length,1)
