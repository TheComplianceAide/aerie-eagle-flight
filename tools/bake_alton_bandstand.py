"""Painted timber and diffuse shelter occlusion for the Alton water bandstand."""
from pathlib import Path
import math
import numpy as np
from PIL import Image

game = Path(__file__).resolve().parents[1] / "game"
scan = np.asarray(Image.open(game / "building-boards.webp").convert("L"), dtype=float) / 255
n = 896
roof = np.array([[5110.97,11925.35],[5104.56,11926.71],[5103.26,11920.64],[5109.67,11919.29]])
deck = np.array([[5103.74,11929.04],[5101.61,11919.79],[5110.73,11917.72],[5112.86,11926.96]])

def frame(footprint):
    center = footprint.mean(axis=0)
    a = footprint[1] - footprint[0]
    b = footprint[3] - footprint[0]
    axis = (a if np.linalg.norm(a) > np.linalg.norm(b) else b)
    axis = axis / np.linalg.norm(axis)
    return center, axis, np.array([-axis[1],axis[0]]), max(np.linalg.norm(a),np.linalg.norm(b)), min(np.linalg.norm(a),np.linalg.norm(b))

c, u, v, L, W = frame(deck)
r, ru, rv, rL, rW = frame(roof)
s,t = np.meshgrid(np.linspace(-L/2,L/2,n),np.linspace(-W/2,W/2,n))
x,z = c[0]+s*u[0]+t*v[0]-r[0], c[1]+s*u[1]+t*v[1]-r[1]
along,across = x*ru[0]+z*ru[1], x*rv[0]+z*rv[1]
# View factor of the open shelter on a horizontal deck. Fourteen square
# patches resolve the gradual penumbra at the edge of the platform.
sky_block = np.zeros_like(s)
dw,dl = (rW+.32)/14, (rL+.32)/14
for i in range(14):
    for j in range(14):
        da = along-((i+.5)/14-.5)*(rL+.32)
        db = across-((j+.5)/14-.5)*(rW+.32)
        h=2.50+1.36*max(0,1-max(abs(2*(i+.5)/14-1),abs(2*(j+.5)/14-1)))
        sky_block += h*h*dl*dw/(math.pi*(h*h+da*da+db*db)**2)
# Worn painted floorboards derive their close grain from the project's CC0
# Weathered Plank Siding scan rather than tiles of flat gray.
rng=np.random.default_rng(1928)
width=.161
board=np.floor((t+W/2)/width).astype(int)
phase=(t+W/2)/width-board
grain_shift=rng.integers(0,scan.shape[1],size=board.max()+1)
sy=np.mod(((board*.156+phase*.145)*scan.shape[0]/2.4).astype(int),scan.shape[0])
sx=np.mod(((s+L/2)*scan.shape[1]/2.65).astype(int)+grain_shift[board],scan.shape[1])
grit=scan[sy,sx]
variation=(grit-.77)*.13 + rng.uniform(-.013,.013,size=board.max()+1)[board]
seam=np.minimum(phase,1-phase)
wear=np.exp(-((seam/.040)**2))*.074
# Localized shadow from plank lips behind the splashboards.
a=np.abs(along)-rL*.447;b=np.abs(across)-rW*.447
panel_distance=np.where((a<0)&(b<0),-np.maximum(a,b),np.hypot(np.maximum(a,0),np.maximum(b,0)))
foot_shadow=.108*np.exp(-panel_distance/.21)
illum=np.clip(1-.45*sky_block-foot_shadow,.52,1)
base=.858+variation-wear
result=base[:,:,None]*illum[:,:,None]**.72*np.array([1.005,1.008,.984])
Image.fromarray(np.uint8(np.clip(result,0,1)*255)).save(game/'alton-bandstand-deck.webp',quality=89,method=6)
