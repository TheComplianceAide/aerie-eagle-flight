"""Build a seamless sky and optical-depth field from a registered CC0 photograph.
The three sets of chromatic anchors were sampled from the supplied lake photos.
The source panoramas are Industrial Sunset 02 (Moosehead), Kloppenheim 06
(Winnipesaukee), and Belfast Sunset (Lofoten), all Pure Sky editions from Poly Haven.
"""
from pathlib import Path
import argparse
import numpy as np
from PIL import Image

configs = {
 'moosehead': ('moosehead-dawn', .599, 2.0, -84., 5.5, 6144),
 'winnipesaukee': ('winnipesaukee-dusk', .600, 1.7, -112., 4.2, 4096),
 'lofoten': ('lofoten-dusk', .613, 1.15, -115., 4.3, 4096)}
angles=[0, 3, 8, 16, 28, 48, 70, 90]
# Sunward clear air, opposing clear air, and sunward and lee cloud surfaces, sRGB.
colors={
 'moosehead': (
 ['ffc070','ffd181','ffd293','f7cba9','ddbcc1','c5b6c6','a7a6bf','9a9bb4'],
 ['e8a15e','e8a56d','dda892','c7a5b4','aba4bc','9197b4','8792af','888fa7'],
 ['ffb566','ffc978','ffd294','f1c3a4','dfb8bb','b9aec2','9e9eb6','9597ae'],
 ['ac756d','b58074','c09288','b998a7','aa96aa','968fa6','898b9f','81889e']),
 'winnipesaukee': (
 ['bd84a7','c68dab','a7a5c0','5899ba','2f8caf','2a749d','1e6592','286795'],
 ['8f6194','a275a3','9990b5','4e7da3','256e9a','1c678e','14557b','215d84'],
 ['ffb490','ffac95','ffab9b','ffa094','ff9a87','f89784','e9a09e','c1a0b0'],
 ['aa799a','aa7896','a67694','ad809c','b47a92','af7791','997d98','9e8eaa']),
 'lofoten': (
 ['d5a183','ddad8a','cfaa9c','9d8b96','837d99','72718d','70758b','6a728c'],
 ['b58885','b68685','ae858d','998394','887f95','77778e','6b738d','68718a'],
 ['dba27a','edb283','e0a18b','b0868e','867990','7c728c','757691','747b99'],
 ['665969','72616d','786375','675a73','655d79','5a5b75','595f79','5f6780'])}
def rgb(s): return [int(s[i:i+2],16) for i in (0,2,4)]
def ramp(points, y):
 vals = np.asarray([rgb(s) for s in points])
 return np.asarray([np.interp(y,angles,vals[:,c]) for c in range(3)],np.float32)
def mix(a,b,t): return a+(b-a)*t
def smooth(a,b,x):
 t=np.clip((x-a)/(b-a),0,1)
 return t*t*(3-2*t)
def build(region, src, out):
 name,oldU,oldElev,az,sunAlt,width=configs[region]; height=width//2
 # Fractional panorama rotation and elevation remap through the measured solar ray.
 photo = np.asarray(Image.open(src).convert('RGB').resize((width,height),Image.Resampling.LANCZOS))
 x=(np.arange(width,dtype=np.float32)+.5)/width
 bearings=(x-.5)*360
 originalX=((x+oldU-(.5+az/360))%1)*width-.5
 nearestX=np.floor(originalX).astype(int); fx=(originalX-nearestX).astype('f')[:,None]
 originalX0=nearestX%width; originalX1=(nearestX+1)%width
 angle=np.deg2rad(bearings-az); sa=np.deg2rad(sunAlt)
 photoStats=[]
 for deg in np.linspace(0,90,31):
  y=min(height-1,max(0,round((.5-deg/180)*height)))
  sample=photo[max(0,y-3):y+4,::4,:].reshape(-1,3).astype('f')
  lum=sample@np.array([.24,.63,.13],dtype='f'); rb=sample[:,0]-sample[:,2]
  photoStats.append((*np.percentile(lum,[12,45,90]),*np.percentile(rb,[10,80])))
 photoStats=np.asarray(photoStats); degrees=np.linspace(0,90,31)
 render=np.empty((height//2,width,3),np.uint8); density=np.empty((height//2,width),np.uint8)
 hemisphere=region!='lofoten'
 for row in range(height//2):
  alt=90-(row+.5)*180/height; ar=np.deg2rad(alt)
  sunDot=np.sin(sa)*np.sin(ar)+np.cos(sa)*np.cos(ar)*np.cos(angle)
  # The original horizon and zenith remain stationary under registration.
  srcAlt=np.interp(alt,[0,sunAlt,sunAlt+32,90],[.12,oldElev,sunAlt+32,90])
  yy=(.5-srcAlt/180)*height-.5; i=max(0,int(yy)); fy=yy-i
  srcRow=mix(photo[i].astype('f'),photo[min(i+1,height-1)].astype('f'),fy)
  pixels=mix(srcRow[originalX0],srcRow[originalX1],fx)
  r,g,b=pixels.T;luma=r*.24+g*.63+b*.13
  low,med,high,cool,neutral=[np.interp(srcAlt,degrees,s) for s in photoStats.T]
  clearCloud=smooth(cool+5,cool+max(23,(neutral-cool)*.91),r-b)
  shape=np.clip((luma-med)/max(34,high-low),-.9,1.45)
  lamp=np.clip((r+g-b-110)/140,0,1)
  aspect=.19+.81*((1+np.cos(angle))/2)**.93
  aspect=aspect*np.cos(ar)**.68+.48*(1-np.cos(ar)**.68)
  direct=smooth(.3,1.,sunDot)*np.cos(ar)
  if hemisphere:
   body=np.clip(clearCloud*(.97 if region=='winnipesaukee' else .85)+.14*np.maximum(shape,0),0,1)
   illumination=np.clip(.44+.51*shape+.18*direct+.13*lamp,0,1)
   # At low elevations airglow contributes more chroma than the optical cloud mask.
   body*= (.35+.65*smooth(1,18,alt))
   if region=='winnipesaukee':
    # Wide-band circumsolar haze shares the cloud field's pale chroma. Remove
    # that smooth component when resolving individual lit cloud edges.
    radius=max(5,int(width*.044))
    pad=np.pad(r-b,(radius,radius),mode='wrap')
    acc=np.r_[0.,np.cumsum(pad,dtype=np.float64)]
    background=(acc[2*radius+1:]-acc[:-2*radius-1])/(2*radius+1)
    cloudFeature=smooth(1,26,(r-b)-background)+.62*smooth(.04,.84,shape)
    body*=.20+.80*np.clip(cloudFeature,0,1)
    # Open blue air shows through the thin veil beyond the brightest warm banks.
    body*=.78+.20*np.tanh(np.maximum(0,shape))
   optical=np.clip(clearCloud+.24*(.4-shape)-.22,0,1)
  else:
   # Belfast's near-continuous cloud sheet darkens against its low solar opening.
   body=np.clip(.65-.45*shape-.45*lamp+.27*smooth(5,30,alt),.02,1)
   illumination=np.clip(.4+.48*shape+.14*direct,0,1)
   optical=np.clip(.68-.36*shape-.40*lamp+.22*smooth(4,28,alt),.02,1)
  clearSun,clearLee,cloudSun,cloudLee=[ramp(rowColors,alt) for rowColors in colors[region]]
  air=mix(clearLee,clearSun,aspect[:,None])
  light=mix(cloudLee,cloudSun,illumination[:,None])
  result=mix(air,light,body[:,None])
  # Keep photographic fine cloud extinction and silver-lining texture. A warmer
  # optical colour does not erase overcast banks or smooth out cirrus filaments.
  gain={'moosehead':34,'winnipesaukee':36,'lofoten':40}[region]
  detail=.63*(luma-med)+.37*gain*shape
  if region=='lofoten': detail=np.where(detail>0,detail*.59,detail)
  result+=detail[:,None]*([.52,.48,.47] if region=='moosehead' else [.68,.66,.63])
  glow=np.exp((sunDot-1)*72)*(.18 if region=='moosehead' else .12)*lamp
  result=mix(result,np.array([255,231,173] if region!='winnipesaukee' else [255,204,171]),glow[:,None])
  if region=='winnipesaukee':
   # Sun illuminates the underside of the broken bank beyond the sunset horizon.
   lit=clearCloud*smooth(5,28,alt)*(.74+.26*direct)
   result+=lit[:,None]*[11,-6,-8]
  if region=='lofoten':
   # Low, back-lit gap beneath the bank is small in azimuth; keep the reverse
   # horizon cool so that the copper patch in the fjord has a real direction.
   glow=np.maximum(0,lamp-.19)*np.exp(-((alt-5.4)/10)**2)*np.maximum(0,np.cos(angle))**2*.34
   result=mix(result,np.array([255,204,143]),glow[:,None])
   # The fjord sees the underside of a bank moving across the last light.
   # Its uneven edge follows the original oblique front and its bright gaps.
   edgeAltitude=13.+11.*np.sin(angle-.04)+2.*np.sin(3.*angle+.5)
   edge=alt-edgeAltitude-3.8*shape-1.4*(lamp-.5)
   solarSector=smooth(.02,.92,np.cos(angle))
   shadow=smooth(-1.8,6.8,edge)*(.66+.32*body)*(.69+.31*solarSector)
   coolShade=np.stack([92+16*shape,83+14*shape,108+15*shape],axis=-1)
   result=mix(result,coolShade,shadow[:,None]*.59)
   optical=np.maximum(optical,shadow*.88)
   rim=np.exp(-(edge/3.65)**2)*solarSector
   rim*=.51+.35*smooth(-.65,.82,shape)+.14*lamp
   copper=np.stack([237+9*shape,134+12*shape,103+11*shape],axis=-1)
   result=mix(result,copper,rim[:,None]*.84)
   # Golden light fills the thin visible opening but stops at the cloud rim.
   openLight=np.exp(-((edge+4.0)/5.8)**2)*solarSector
   result=mix(result,np.array([242.,179.,133.]),openLight[:,None]*.27)
  optical*=1-.90*np.exp((sunDot-1)*470)
  render[row]=np.uint8(np.clip(result,0,255)+.001)
  density[row]=np.uint8(np.clip(optical,0,1)*255)
 sky=Image.fromarray(np.concatenate([render,render[::-1]]))
 (out/'mobile').mkdir(parents=True,exist_ok=True)
 sky.save(out/(name+'-sky.webp'),quality=91,method=5)
 sky.resize((2048,1024),Image.Resampling.LANCZOS).save(out/'mobile'/(name+'-sky.webp'),quality=87,method=5)
 optical=Image.fromarray(np.concatenate([density,density[::-1]])).resize((512,256),Image.Resampling.LANCZOS)
 optical.save(out/(name+'-cloud.webp'),quality=90,method=5)
 print(name,width,'desktop', (out/(name+'-sky.webp')).stat().st_size,'mobile', (out/'mobile'/(name+'-sky.webp')).stat().st_size,flush=True)
if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('region', choices=tuple(configs))
    parser.add_argument('source', type=Path, help='Corresponding 2:1 sRGB panorama, with its original horizontal orientation')
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1]/'game')
    args = parser.parse_args()
    build(args.region, args.source, args.output)
