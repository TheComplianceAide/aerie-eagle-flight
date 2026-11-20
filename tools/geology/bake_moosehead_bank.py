"""Pack four licensed ground photographs with mirrored gutters for mipmapping."""
from PIL import Image
import argparse
import numpy as np
parser=argparse.ArgumentParser()
parser.add_argument('texture',nargs=4,help='Mud and gravel, forest moss and twigs, lake cobble, and pebbles.')
parser.add_argument('output')
args=parser.parse_args()
size=1152; pad=12
sheet=Image.new('RGB',(size*2,size*2))
for i,name in enumerate(args.texture):
    source=Image.open(name).convert('RGB').resize((size-2*pad,size-2*pad),Image.Resampling.LANCZOS)
    tile=np.pad(np.array(source),((pad,pad),(pad,pad),(0,0)),mode='reflect')
    sheet.paste(Image.fromarray(tile),((i%2)*size,(i//2)*size))
sheet.save(args.output,quality=91,method=5)
