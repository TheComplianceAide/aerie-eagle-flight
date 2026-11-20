"""Extract surface marks from a source photographed against an isolated backing."""
import numpy as np
from PIL import Image
from scipy import ndimage


def smooth(a,b,x):
    f=np.clip((x-a)/(b-a),0,1)
    return f*f*(3.-2.*f)


def surface_marks(tile,kind,cell):
    a=np.asarray(tile.convert('RGBA')).copy()
    rgb=a[:,:,:3].astype(float)/255.
    original=a[:,:,3]/255.
    valid=original>.65
    size=max(tile.size)
    # Interior colour extensions keep artificial matte fringes out of gradient
    # filters around the original camera cutout.
    src=ndimage.distance_transform_edt(~valid,return_distances=False,return_indices=True)
    rgb=rgb[src[0],src[1]]
    r,g,b=rgb.transpose(2,0,1)
    light=.2126*r+.7152*g+.0722*b
    micro=light-ndimage.gaussian_filter(light,size*.012)
    feature=light-ndimage.gaussian_filter(light,size*.048)
    border=ndimage.distance_transform_edt(np.pad(valid,1))[1:-1,1:-1]/size
    yy,xx=np.indices(valid.shape)
    u=(xx+.5)/tile.width;v=(yy+.5)/tile.height
    # The original square was an illustration of a material sample. No boundary
    # of that illustration is an edge in the real soil or water.
    edge=smooth(.045,.19,border)
    if kind=='water':
        # Silver ripple crests and aerated flow have coherent, elongated edges.
        # Leave the actual lake able to supply the reflected sky, bottom and hue.
        gx=ndimage.sobel(light,axis=1)/8;gy=ndimage.sobel(light,axis=0)/8
        jx=ndimage.gaussian_filter(gx*gx,2.);jy=ndimage.gaussian_filter(gy*gy,2.);jxy=ndimage.gaussian_filter(gx*gy,2.)
        coherence=np.sqrt((jx-jy)**2+4*jxy**2)/(jx+jy+1e-6)
        watery=smooth(-.045,.026,(b-r)*.72+(g-r)*.32)
        relief=smooth(.014,.125,.70*micro+.55*feature)
        strength=relief*(.14+.86*smooth(.18,.81,coherence))*watery
        alpha=(.03+.97*strength)*edge*original
        tint=np.array([.71,.78,.81])[None,None,:]*(.62+.38*smooth(.30,.79,light))[:,:,None]
    else:
        # Leaf blades, needles, root crests, pebbles and hoof marks carry the
        # source texture. Fine organic shadows give way to the native soil.
        ridges=smooth(.008,.13,.65*np.abs(micro)+.69*np.abs(feature))
        colour=smooth(.018,.17,np.abs(r-g)+np.abs(b-g))
        field=(.56+.44*np.sin(10*u-14*v+cell+.9*np.sin(v*17)))
        mask=smooth(.20,.69,ridges+colour*.14+field*.13)
        # Sliced soil cores have a visible side wall at their lower perimeter.
        # Sample only the undisturbed top face.
        top=1.-smooth(.56,.92,v)
        alpha=edge*top*original*mask
        tint=np.clip(rgb*(.67+.20*smooth(.12,.63,light))[:,:,None],0,1)
    a[:,:,:3]=np.rint(255*tint).astype('uint8')
    a[:,:,3]=np.rint(255*np.clip(alpha,0,1)).astype('uint8')
    return Image.fromarray(a), original, alpha


def shape_tile(tile,base_mask,alpha):
    # Low LOD geometry follows the same irregular groups as the full texture.
    # A wider reconstruction kernel keeps sub-pixel crests sampled at distance.
    src=np.asarray(tile).copy();side=max(tile.size)
    ridges=ndimage.gaussian_filter(alpha,side*.017)
    positive=ridges[ridges>.012]
    level=np.quantile(positive,.23) if positive.size else .02
    sites=(ridges>max(.012,level))&(base_mask>.30)
    sites=ndimage.binary_dilation(sites,iterations=max(1,int(side*.014)))
    src[:,:,3]=np.where(sites,255,0).astype('uint8')
    return Image.fromarray(src)
