"""Reconstruct the boulder reach, active water and riparian tree crowns at Lower Yosemite Fall.

Coordinates in the runtime data are metres east and south of UTM 11N (268678,4179436).
See sources.json for dated inputs, coordinate system, and hydrological assumptions.
"""
import argparse, base64, json
from pathlib import Path
import numpy as np
from scipy import ndimage as nd
from scipy.spatial import cKDTree,ConvexHull,QhullError
from skimage.segmentation import watershed
from skimage.feature import peak_local_max
from PIL import Image,ImageDraw
from shapely.geometry import LineString
from shapely.ops import substring

L,T,R,B=2480,-1960,2744,-1680
# Downvalley sequence traced on USDA's 2022 60 cm orthophoto, adjusted to the
# actual low channel in 2019 bare earth, not the generalized 1:24,000 line.
guide=np.array([[2532,-1889],[2539,-1876],[2551,-1865],[2565,-1854],
 [2580,-1847],[2596,-1839],[2606,-1833],[2617,-1824],[2632,-1816],
 [2645,-1807],[2656,-1797],[2665,-1786],[2670,-1773],[2678,-1764],
 [2692,-1751],[2697,-1737],[2711,-1729]],float)
def rounded(a,dec=2):return np.array(a).round(dec).tolist()
def bake(cache,out,diagnostics=None):
 src=np.load(cache/'creek-sources.npz')
 dem=src['elevation'];aerial=src['aerial'].astype('f')/255
 def source(a,x,z,step,offset):
  a0,b0=np.broadcast_arrays(np.asarray(z),np.asarray(x))
  coordinates=np.stack(((a0.ravel()-T)/step-offset,(b0.ravel()-L)/step-offset))
  return nd.map_coordinates(a,coordinates,order=1,mode='nearest').reshape(a0.shape)
 def h(x,z):return source(dem,x,z,1,0)
 red,green,blue,nir=aerial
 ndvi=(nir-red)/np.maximum(.02,nir+red);first=LineString(guide);distance=np.arange(0,first.length+.1,1.)
 stations=np.array([first.interpolate(s).coords[0] for s in distance])
 def cross(pts):
  tangent=np.gradient(pts,axis=0);tangent/=np.maximum(.01,np.linalg.norm(tangent,axis=1,keepdims=True));return np.column_stack((-tangent[:,1],tangent[:,0]))
 perp=cross(stations);offset=np.arange(-11,11.01,.5);lane=stations[:,None,:]+perp[:,None,:]*offset[None,:,None]
 small=nd.gaussian_filter(dem,1.1); sampled=source(small,lane[:,:,0],lane[:,:,1],1,0)
 cost=np.minimum(6,sampled-sampled.min(axis=1)[:,None])+.0019*offset**2
 prev=cost[0]+.12*abs(offset);pointers=np.zeros(cost.shape,'i2')
 for i,row in enumerate(cost[1:],1):
  travel=prev[:,None]+.83*(offset[:,None]-offset[None,:])**2
  pointers[i]=np.argmin(travel,axis=0);prev=row+travel.min(axis=0)
 selected=[int(np.argmin(prev))]
 for i in range(len(stations)-1,0,-1):selected.append(int(pointers[i,selected[-1]]))
 selected=nd.gaussian_filter1d(offset[selected[::-1]],2.2)
 # Keep both ends in the existing named fall and regional hydrography.
 selected*=np.clip(distance/10,0,1)*np.clip((distance[-1]-distance)/15,0,1)
 stations+=perp*selected[:,None]; stations=nd.gaussian_filter1d(stations,1.05,axis=0,mode='nearest')
 perp=cross(stations); lane=stations[:,None,:]+perp[:,None,:]*np.arange(-5,5.01,.5)[None,:,None]
 sample=h(lane[:,:,0],lane[:,:,1])
 floor=np.percentile(sample,12,axis=1)
 # A water surface spans pools and pitches, and can pass below intervening
 # granite tops.  Relative high-flow stage is modeled, not a gauge reading.
 level=nd.gaussian_filter1d(floor,1.4)+.66
 level=np.maximum.accumulate(level[::-1])[::-1]
 stage=nd.gaussian_filter1d(level,.70)
 fst=stage.copy()
 for i in range(8):stage[i]+=(floor[0]+.18-stage[0])*(1-i/8)
 for i in range(12):stage[-1-i]+=(h(*stations[-1])+.14-fst[-1])*(1-i/12)
 tree=cKDTree(stations)
 def local(x,z):
  d,idx=tree.query(np.stack([x,z],axis=-1)); return d,idx
 spec=json.loads(Path(__file__).with_name('sources.json').read_text())
 vintages=spec['modeledReturnYears']
 pieces=[];classes=[]
 for year in vintages:
  raw=np.load(cache/(str(year)+'-crop.npz'))
  x0,z0,dy=spec['returns'+str(year)]['registeredOffsetXZY']
  center=np.array([[2400+x0],[-2000+z0],[1100+dy]],dtype='f')
  pieces.append(raw['xyz'].astype('f')*.01+center);classes.append(raw['attr'][0])
 x,z,y=np.concatenate(pieces,axis=1);cl=np.concatenate(classes);ground=h(x,z);hag=y-ground;dist,ids=local(x,z)
 sdeck=(x-2637.21)*.7492-(z+1808.90)*.6624;wdeck=(x-2637.21)*.6624+(z+1808.90)*.7492
 onbridge=(sdeck>-17)&(sdeck<23)&(abs(wdeck+1.55)<2.6)&(abs(y-1225.64)<.95)
 hs=.50; zs,xs=np.mgrid[T:B+hs/2:hs,L:R+hs/2:hs]; terrain=h(xs,zs);D,I=local(xs,zs);mineral=source(ndvi,xs,zs,.60,.5);hue=source((red+green+blue)/3,xs,zs,.60,.5)
 # Actual low laser facets, excluding live canopy, deck and high returns. The
 # 3DEP classified earth already captures some of the largest exposed blocks.
 ix=np.clip(np.round((x-L)/hs).astype(int),0,xs.shape[1]-1);iz=np.clip(np.round((z-T)/hs).astype(int),0,zs.shape[0]-1)
 dry=(dist<25)&(np.abs(hag)<3.1)&~onbridge
 leaf=source(ndvi,x,z,.6,.5);dry&=(leaf<.23)&(cl!=5)
 peak=np.full(xs.shape,-50.,dtype='f');ct=np.zeros(xs.shape,'i2');np.maximum.at(peak,(iz[dry],ix[dry]),hag[dry]);np.add.at(ct,(iz[dry],ix[dry]),1)
 valid=ct>0;num=nd.gaussian_filter(np.where(valid,np.clip(peak,-.27,2.5),0.),1.05);den=nd.gaussian_filter(valid.astype('f'),1.05)
 relief=np.where(den>.12,np.maximum(0,num/np.maximum(.01,den)-.085),0)
 surface=terrain+relief
 localbed=nd.gaussian_filter(surface,6.5)
 convex=(surface-localbed)
 gradz,gradx=np.gradient(nd.gaussian_filter(surface,3),hs)
 bare=(D<21)&(mineral<.23)&((hue>.11)|(D<11))&(xs>2495)&(zs>-1903)
 # Orthophoto / survey footprint under the bridge is water and stone. Its
 # perfectly level first returns belong to wood, not to a 36 m granite slab.
 bridge=(abs((xs-2637.21)*.6624+(zs+1808.9)*.7492+1.55)<2.95)&(abs((xs-2637.21)*.7492-(zs+1808.9)*.6624)<24)
 rough=nd.gaussian_filter(convex,.84)
 seeds=peak_local_max(rough,min_distance=2,threshold_abs=.125,labels=bare.astype('u1'),exclude_border=True)
 marker=np.zeros(xs.shape,int); marker[tuple(seeds.T)]=np.arange(1,len(seeds)+1)
 segments=watershed(-rough,marker,mask=(rough>-.055)&bare)
 labels=nd.find_objects(segments);stoneverts=[];faces=[];stones=[];localReturns=cKDTree(np.column_stack((x[dry],z[dry])));rockX=x[dry];rockZ=z[dry];rockH=y[dry];optical=[]
 rng=np.random.default_rng(4179436)
 for k,obj in enumerate(labels,1):
  if obj is None:continue
  yy,xx=np.where(segments[obj]==k); yy+=obj[0].start;xx+=obj[1].start
  if len(yy)<4:continue
  peakidx=np.argmax(rough[yy,xx]);py,px=yy[peakidx],xx[peakidx]
  if D[py,px]>22 or rough[py,px]<.19 or bridge[py,px] and ct[py,px]<2:continue
  # Segment near the top; preserve an elongated fracture instead of making
  # anything accidentally joined by the watershed into a huge oval.
  radius=np.hypot(xx-px,yy-py)*hs;keep=(radius<4.8)&(rough[yy,xx]>rough[py,px]*.07-.024)
  yy,xx=yy[keep],xx[keep]
  if len(xx)<4:continue
  # A local rock plane comes from the published ground gradient. All dimensions
  # are measured from this individual positive-relief facet.
  X=xs[yy,xx];Z=zs[yy,xx];cx=np.mean(X);cz=np.mean(Z)
  A=np.stack([X-cx,Z-cz],axis=1);cov=np.cov(A.T)+np.diag([.09,.09]);w,V=np.linalg.eigh(cov)
  radii=np.sqrt(w)*1.94; radii=np.clip(radii,.33,4.55)
  if np.max(radii)/np.min(radii)>4.7:continue
  htop=float(surface[py,px]);height=np.clip(rough[py,px]*1.54+.18,.28,3.8)
  # Ring orientation and plan extents follow the observed footprint.
  n=7 if radii.max()<1.05 else 9
  phase=rng.uniform(0,2*np.pi);angle=np.arange(n)*2*np.pi/n+phase
  taper=rng.uniform(.84,1.14,n);A=(np.stack([np.cos(angle),np.sin(angle)],axis=1)*radii*taper[:,None])@V.T
  top=np.array([xs[py,px],zs[py,px]]);base=np.array([cx,cz])
  topXY=top*.44+base*.56
  cloud=[]; colors=[]
  for j,(dx,dz) in enumerate(A):
   xx0=cx+dx;zz0=cz+dz;slope=dx*gradx[py,px]+dz*gradz[py,px]
   hbase=min(float(h(xx0,zz0))-.31,htop+.7*slope-height*.72)
   cloud.append([xx0,hbase,zz0])
   sh=rng.uniform(.45,.73);xx1,zz1=topXY+A[j]*sh
   hg=float(source(surface,xx1,zz1,hs,0))
   cloud.append([xx1,max(hg+.06,htop+slope*.44-height*rng.uniform(.11,.31)),zz1])
  # Retain the measured upper face. Additional perimeter samples soften
  # exposed fracture edges without turning angular talus into rounded spheres.
  near=localReturns.query_ball_point(base,max(radii)*1.11)
  if near:
   near=np.asarray(near);offsets=np.column_stack((rockX[near]-cx,rockZ[near]-cz))@V
   inside=np.sum((offsets/np.maximum(.40,radii))**2,axis=1)<.78
   near=near[inside&(rockH[near]<htop+.31)&(rockH[near]>htop-height*1.13)]
   if len(near)>35:near=near[np.linspace(0,len(near)-1,35).astype(int)]
   for li in near:cloud.append([rockX[li],rockH[li]+.055,rockZ[li]])
  cloud.append([top[0],htop+.07,top[1]])
  cloud=np.array(cloud)
  try:hull=ConvexHull(cloud)
  except QhullError:continue
  start=len(stoneverts);shade=np.clip(0.53+.18*(np.median(hue[yy,xx])-.23)+rng.uniform(-.045,.075),.42,.76)
  # Wetted lower faces and contact shade are per-vertex, based on this
  # measured block's elevation and the cross-section's modeled snowmelt stage.
  stoneverts.extend([[*p0,shade] for p0 in cloud])
  localDist,section=local(cloud[:,0],cloud[:,2]);above=cloud[:,1]-stage[section]
  wet=np.clip((.72-above)/.80,0,1)*np.clip((17.-localDist)/5.,0,1)
  bottom=np.clip((htop-cloud[:,1])/max(.24,height*.92),0,1)
  optical.extend(np.stack((wet,bottom),axis=1))
  for tri,eq in zip(hull.simplices,hull.equations):
   a,b,c=tri;ab=cloud[b]-cloud[a];ac=cloud[c]-cloud[a]
   if np.dot(np.cross(ab,ac),eq[:3])<0:b,c=c,b
   if eq[1]>-.48:faces.extend([start+a,start+b,start+c])
  stones.append([cx,cz,height,*radii])
 # Smaller blocks are optically inferred at 60 cm and constrained by measured
 # local positive relief. They are recorded separately from the surveyed
 # large-rock facets. Empty forest and high bank receive no generic scatter.
 bigCount=len(stones);occupied=np.zeros(xs.shape,bool)
 for bx,bz,ht,aa,bb in stones:
  ci=int(round((bx-L)/hs));ri=int(round((bz-T)/hs));rr=int(np.ceil(bb/hs))
  y0=max(0,ri-rr);y1=min(xs.shape[0],ri+rr+1);x0=max(0,ci-rr);x1=min(xs.shape[1],ci+rr+1)
  occupied[y0:y1,x0:x1]|=(xs[y0:y1,x0:x1]-bx)**2+(zs[y0:y1,x0:x1]-bz)**2<(.66*max(aa,bb))**2
 detail=nd.gaussian_filter(surface,.55)-nd.gaussian_filter(surface,2.15)
 luminanceResidual=hue-nd.gaussian_filter(hue,2.4)
 index=detail+.50*luminanceResidual
 sites=peak_local_max(index,min_distance=1,threshold_abs=.043,labels=((D<19)&~occupied&(mineral<.30)&(zs>-1905)).astype('u1'))
 smallCount=0
 for i,j in sites:
  val=index[i,j];xx=xs[i,j];zz=zs[i,j];radius=np.clip(.31+.68*val+rng.uniform(-.08,.14),.25,1.06)
  ht=np.clip(.18+.46*val+rng.uniform(-.045,.12),.16,.85); ground=float(surface[i,j]); thin=radius*rng.uniform(.53,.96)
  theta=rng.uniform(0,2*np.pi); frac=rng.uniform(.74,1.1,6);ang=np.arange(6)*np.pi/3+rng.uniform(-.19,.19,6)
  X=radius*np.cos(ang)*frac;Z=thin*np.sin(ang)*frac;xd=X*np.cos(theta)-Z*np.sin(theta);zd=X*np.sin(theta)+Z*np.cos(theta)
  crown=np.array([xx,ground+ht,zz]);cloud=[crown]
  for a,b in zip(xd,zd):
   grade=gradx[i,j]*a+gradz[i,j]*b
   cloud.extend([[xx+a,ground+grade-.15,zz+b],[xx+a*.84,ground+grade*.70+ht*rng.uniform(.30,.71),zz+b*.84]])
  cloud=np.asarray(cloud)
  hull=ConvexHull(cloud);start=len(stoneverts);shade=float(np.clip(.42+.57*(hue[i,j]-.21)+rng.uniform(-.06,.10),.32,.72))
  stoneverts.extend([[*value,shade] for value in cloud]);d,si=local(cloud[:,0],cloud[:,2]);wet=np.clip((.69-cloud[:,1]+stage[si])/.82,0,1)*np.clip((16.-d)/4.,0,1)
  optical.extend(np.column_stack((wet,np.clip((ground+ht-cloud[:,1])/max(.24,ht+.08),0,1))))
  for tri,eq in zip(hull.simplices,hull.equations):
   a,b,c=tri
   if np.dot(np.cross(cloud[b]-cloud[a],cloud[c]-cloud[a]),eq[:3])<0:b,c=c,b
   if eq[1]>-.48:faces.extend([start+a,start+b,start+c])
  smallCount+=1
 # Individual living crowns require a 2006/2019 high return with a nearby
 # positive-NIR 2022 canopy; the bridge, stream and open granite remain clear.
 tops=np.zeros(xs.shape,'f'); woody=(hag>3.8)&(hag<58)&~onbridge
 np.maximum.at(tops,(iz[woody],ix[woody]),hag[woody])
 dom=nd.maximum_filter(tops,size=5); canopy=nd.gaussian_filter(dom,2.1)
 spectral=nd.maximum_filter(mineral,size=9)
 peaks=peak_local_max(canopy,min_distance=5,threshold_abs=5.4,labels=((spectral>.22)&(D>4)).astype('u1'))
 seen=[];crowns=[]
 for i,j in sorted(peaks,key=lambda ij:-canopy[tuple(ij)]):
  xx=xs[i,j];zz=zs[i,j];height=canopy[i,j]
  if min(xx-L,R-xx,zz-T,B-zz)<3:continue
  bound=2.5+height*.105
  if any((xx-a)**2+(zz-b)**2<max(bound,radius)**2 for a,b,radius in seen):continue
  nearby=(np.abs(x-xx)<1.7)&(np.abs(z-zz)<1.7)&woody
  if not nearby.any():continue
  height=float(np.percentile(hag[nearby],92));width=np.clip(height*(.28 if height>14 else .44),2.2,11.7)
  crowns.append([round(xx,1),round(zz,1),round(height,1),round(width,1)]);seen.append((xx,zz,bound))
 opticalShoulder=np.clip((24-D)/6,0,1)*np.clip((.31-mineral)/.15,0,1)*np.clip((hue+.035)/.17,0,1)
 # Directly beneath the creek, late-summer canopy shadow and snowmelt reflect
 # differently. Keep the actual rocky inner bed continuous in the game's flow.
 inner=np.clip((17.25-D)/4.25,0,1)*np.clip((stage[I]+3.8-terrain)/2.1,0,1)
 shoulders=np.maximum(opticalShoulder,.94*inner)

 # RGB holds the actual summer bed, relit from shadowed, near-nadir imagery.
 # Alpha follows the optically classified wash. Outside the corridor the terrain
 # program leaves its parent material completely untouched.
 zy,xx=np.indices(red.shape);xx=L+(xx+.5)*.6;zy=T+(zy+.5)*.6
 cover=source(shoulders,xx,zy,hs,0);mean=nd.gaussian_filter(red*.27+green*.58+blue*.15,9)
 balanced=np.clip(np.moveaxis(aerial[:3],0,2)*(np.clip(.43/np.maximum(.085,mean),.94,2.2)**.68)[...,None],0,1)
 left=Image.fromarray(np.dstack((np.uint8(255*balanced),np.rint(1+254*cover).astype('u1'))))
 donor=out/'shore-cobble.webp'
 if not donor.exists():donor=cache/'shore-cobble.webp'
 cobbles=np.asarray(Image.open(donor).convert('RGB').resize(left.size,Image.Resampling.LANCZOS)).astype('f')/255
 quartz=cobbles@np.array([.26,.58,.16]);stonesRGB=np.clip(.11+.85*(.19*cobbles+.81*quartz[...,None]),0,1)
 tile=Image.fromarray(np.uint8(stonesRGB*255));bank=Image.new('RGBA',(2*left.width,left.height))
 bank.paste(left);bank.paste(tile,(left.width,0));bank.save(out/'yosemite-creek-bank.webp',quality=94,method=6)

 if not (cache/'nps-lower-cascade-2400.jpg').is_file():raise FileNotFoundError('Required NPS/C. Jacoby crop source; run acquire.py')
 if (cache/'nps-lower-cascade-2400.jpg').is_file():
  fieldPhoto=Image.open(cache/'nps-lower-cascade-2400.jpg').convert('RGB')
  # A clean patch inside the large foreground granodiorite block from the NPS
  # trail photograph. No trees, water, silhouettes, edge or headwall are copied.
  face=np.asarray(fieldPhoto.crop((136,1095,323,1345)).resize((256,320),Image.Resampling.LANCZOS)).astype('f')/255
  lum=face@np.array([.27,.58,.15]);low=nd.gaussian_filter(lum,27);mid=nd.gaussian_filter(lum,3)
  natural=np.clip(.53+(lum-np.median(lum))*.92+(lum-low)*.57,.14,.86)
  photograph=np.stack((natural,np.clip(.5+(mid-low)*3.0,.0,1.),np.clip(.5+(lum-mid)*4.1,.0,1.)),axis=2)
  Image.fromarray(np.uint8(photograph*255)).save(out/'yosemite-creek-granite.webp',quality=96,method=6)
 vertices=np.array(stoneverts);vertices[:,:3]=(vertices[:,:3]-np.array([2480,1180,-1960]))*100
 xyz=np.rint(vertices[:,:3]).astype('<i2');shade=np.rint(vertices[:,3]*255).astype('u1')
 faces=np.array(faces,dtype='<u2' if len(vertices)<65536 else '<u4')
 def code(a):return base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()
 stream=[]
 for i,(pt,nrm,lev) in enumerate(zip(stations,perp,stage)):
  if i%2 and i!=len(stations)-1:continue
  stream.append(rounded([*pt,*nrm,lev],3))
 wakes=[]
 for bx,bz,height,minor,major in stones:
  dis,at=local(np.array([bx]),np.array([bz]));i=int(at[0])
  if dis[0]<14 and height>.30 and stage[i]>h(bx,bz)-height*.64 and stage[i]<h(bx,bz)+height+1.4:
   wakes.append(rounded([bx,bz,minor,major,perp[i,1],-perp[i,0],stage[i]],3))
 data=dict(stations=stream,crowns=crowns,wakes=wakes,stones=dict(xyz=code(xyz),tone=code(shade),surface=code(np.rint(255*np.asarray(optical)).astype("u1")),faces=code(faces),wide=len(vertices)>=65536),
           sourceYears=vintages)
 (out/'yosemite-creek-survey.js').write_text('// Lower Yosemite Fall field survey. Rebuild from tools/geology/yosemite-creek.\nwindow.yosemiteCreekSurvey='+json.dumps(data,separators=(',',':'))+';\n')
 if diagnostics:
  im=Image.fromarray((np.moveaxis(aerial[:3],0,2)*255).astype('u1')).resize((792,840));d=ImageDraw.Draw(im)
  def pix(p):return (round((p[0]-L)*3),round((p[1]-T)*3))
  d.line([pix(p) for p in stations],fill='#58e5ff',width=2)
  for a,b,ht,small,big in stones:
   u,v=pix((a,b));d.ellipse((u-small*3,v-big*3,u+small*3,v+big*3),outline='#f3b649')
  for a,b,ht,diam in crowns:
   u,v=pix((a,b));d.ellipse((u-2,v-2,u+2,v+2),outline='#98e359')
  im.save(diagnostics/'creek-registration.jpg');np.savez_compressed(diagnostics/'survey-inspect.npz',stations=stations,stage=stage,stoneVerts=vertices,centres=np.array(stones))
 stats=dict(stones=len(stones),smallerInferred=smallCount,vertices=len(vertices),triangles=len(faces)//3,crowns=len(crowns),stageElevation=rounded([stage[0],stage[-1]]),length=round(first.length,2),lidar=vintages)
 print(json.dumps(stats))
if __name__=='__main__':
 a=argparse.ArgumentParser(description=__doc__);a.add_argument('cache',type=Path);a.add_argument('out',type=Path);a.add_argument('--diagnostics',type=Path);n=a.parse_args();bake(n.cache,n.out,n.diagnostics)
