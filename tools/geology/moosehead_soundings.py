"""Use Maine DEP lake soundings to remove the DEM's false dry surface over water."""
import json
import numpy as np
from rasterio.features import rasterize
from rasterio.transform import Affine
from scipy.ndimage import distance_transform_edt
from scipy.spatial import cKDTree

def apply_soundings(core, source, game):
    chart = (game/'atlas-moosehead-survey.js').read_text()
    lake = json.JSONDecoder().raw_decode(chart.split('window.ATLAS_SURVEYS["moosehead"]=', 1)[1])[0]
    rings = [lake['shore'], *lake.get('shoreHoles', [])]
    step = 64000 / (core.shape[0] - 1)
    transform = Affine(step, 0, -32000-step/2, 0, step, -32000-step/2)
    polygon = {'type':'Polygon', 'coordinates':rings}
    wet = rasterize([(polygon, 1)], core.shape, transform=transform, dtype='uint8')
    coast = distance_transform_edt(wet) * step
    returns = json.loads((source/'depths-numeric.json').read_text())['features']
    samples = [(row['geometry']['x']-442772, 5060090-row['geometry']['y'], row['attributes']['DEPTHM'])
               for row in returns if row['attributes']['DEPTHM']>0]
    obs = np.asarray(samples)
    tree = cKDTree(obs[:,:2])
    z, x = np.where(wet)
    for i in range(0, len(x), 65536):
        cut = slice(i, i+65536)
        coordinates = np.column_stack([x[cut]*step-32000, z[cut]*step-32000])
        distance, neighbor = tree.query(coordinates, k=8)
        weights = 1/np.maximum(distance, 3)**2
        depth = np.sum(weights * obs[neighbor,2], axis=1)/np.sum(weights, axis=1)
        # The unmeasured shallows grade to the actual mapped waterline.
        depth = np.minimum(depth, coast[z[cut], x[cut]]*.24)
        row, col = z[cut], x[cut]
        core[row,col] = np.minimum(core[row,col], 312.39-depth)
    print('Maine DEP lake soundings used:', len(samples), flush=True)
