"""Summarize a typical regulated-release scenario without geolocating rounded XY.

Usage: python calibrate_velocity.py Result_10kcfs.csv velocity-calibration.json
"""
from pathlib import Path
import argparse
import hashlib
import json
import numpy as np

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('table',type=Path)
p.add_argument('output',type=Path)
args=p.parse_args()
# Model input: ~5x5 m curvilinear cells. Published CSV XY are rounded to
# kilometre or greater intervals. A local arrow overlay would imply false
# precision. Retain the current's surveyed direction and use reach-wide
# median speed within each optical depth class.
table=np.loadtxt(args.table,delimiter=',',skiprows=1,usecols=[2,3,4,6,12])
wet=(table[:,2]==1)&(table[:,3]>.03)
d,v=table[wet,3],table[wet,4]
edges=np.array([0.,.3,.75,1.5,3.,5.,8.,12.,30.])
result=[]
for a,b in zip(edges[:-1],edges[1:]):
    use=(d>=a)&(d<b)
    result.append(dict(depth_interval_m=[float(a),float(b)],count=int(use.sum()),
                       depth_m=round(float(np.median(d[use])),3),
                       velocity_p10_p50_p90_m_s=np.round(np.percentile(v[use],[10,50,90]),3).tolist()))
out=dict(source="Wright, Kaplinski & Grams (2024), DOI 10.5066/P1QTRNEB",
         scenario_cfs=10000,source_file=args.table.name,csv_sha256=hashlib.sha256(args.table.read_bytes()).hexdigest(),
         reach_length_miles=15.8,valid_wet_model_cells=int(wet.sum()),table_rows=len(table),
         distinct_published_coordinate_values_xy=[len(np.unique(table[:,0])),len(np.unique(table[:,1]))],
         limits="Depth-conditioned reach medians are for visual flow speed; the scientific output CSV rounds X/Y, precluding per-cell lookup at a surveyed shoal. The color and 3-D movement of individual wavelets are reconstructed.",
         classes=result)
args.output.write_text(json.dumps(out,indent=2)+'\n')
print([(r['depth_m'],r['velocity_p10_p50_p90_m_s'][1]) for r in result],flush=True)
