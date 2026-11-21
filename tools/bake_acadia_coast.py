"""Bake a narrow surf mesh from the Ocean Path 2 m USGS 3DEP grid.

Input is a north-up 1451 × 1451 float TIFF, centered at (564651, 4907768)
in EPSG:32619, with 2 m sample spacing. Pass the file followed by the output.
"""
import argparse
import struct
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, gaussian_filter

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('survey', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()

height = np.asarray(Image.open(args.survey), dtype=np.float32)
assert height.shape == (1451, 1451)
water = height < .16
distance = 2 * (distance_transform_edt(water) - distance_transform_edt(~water))
distance = gaussian_filter(distance, .72)
# Use four-metre spacing across the active surf zone. Distance is positive
# seaward. The southern inlet beyond Otter Cliffs is a separate, sheltered bay.
stride = 2
z, x = np.mgrid[-1450:1451:4, -1450:1451:4]
h = height[::stride, ::stride]
d = distance[::stride, ::stride]
vis = (x > -300) & (d > -18) & (d < 87) & (h < 14)
# Keep the near corners of cells that touch the surf, including the outer
# transparent margin which lets the open ocean and foam overlap smoothly.
cells = vis[:-1, :-1] | vis[:-1, 1:] | vis[1:, :-1] | vis[1:, 1:]
corners = np.zeros_like(vis)
for row in (0, 1):
    for col in (0, 1):
        corners[row:row+cells.shape[0], col:col+cells.shape[1]] |= cells
ids = np.full(vis.shape, -1, np.int32)
ids[corners] = np.arange(np.count_nonzero(corners))
vertices = np.stack([x[corners], z[corners], np.clip(h[corners], -20, 45)*100, d[corners]*10], axis=1).round().astype('<i2')
q00, q10 = ids[:-1, :-1][cells], ids[:-1, 1:][cells]
q01, q11 = ids[1:, :-1][cells], ids[1:, 1:][cells]
triangles = np.stack([q00, q01, q10, q10, q01, q11], axis=1).astype('<u2')
assert len(vertices) < 65536 and triangles.max() < len(vertices)
args.output.write_bytes(struct.pack('<4sII', b'ACS1', len(vertices), triangles.size) + vertices.tobytes() + triangles.tobytes())
print(len(vertices), 'vertices,', triangles.size//3, 'triangles,', args.output.stat().st_size, 'bytes')
