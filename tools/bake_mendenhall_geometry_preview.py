#!/usr/bin/env python3
"""Extract the qualified inland 1 m crop; keep the larger LiDAR source offline."""
from pathlib import Path
import argparse
import base64
import gzip
import hashlib
import json
import zlib

p = argparse.ArgumentParser()
p.add_argument("terrain"); p.add_argument("calibration")
a=p.parse_args()
d=json.loads(Path(a.terrain).read_text())
cal=json.loads(Path(a.calibration).read_text())
raw=zlib.decompress(base64.b64decode(d["dataBase64Zlib"]))
assert hashlib.sha256(raw).hexdigest()==d["sha256"]
assert d["localRect"]==[370,1550,770,1950] and d["epsg"]==6337 and len(raw)==400*400*2
l,t,r,b=420,1635,550,1750
stable=[s for s in cal["rows"] if l<=s["x"]<=r and t<=s["z"]<=b and s["stock"]>4 and s["real"]>4 and s["grade"]<.17 and s["slope"]<.17]
def limits(a):
    a=sorted(a)
    return [round(a[round((len(a)-1)*s)],3) for s in (.05,.25,.50,.75,.95)]
train=[s for s in stable if (int(s["x"]//5)+int(s["z"]//5))%2==0]
hold=[s for s in stable if s not in train]
check={k:{"n":len(v),"residualP05P25P50P75P95M":limits([s["delta"] for s in v])}
       for k,v in (("allStable",stable),("training",train),("holdout",hold))}
assert len(hold)>50 and abs(check["holdout"]["residualP05P25P50P75P95M"][2])<2
out=b"".join(raw[2*((z-1550)*400+l-370):2*((z-1550)*400+r-370)] for z in range(t,b))
root=Path(__file__).resolve().parents[1]/"game"
pack=gzip.compress(out,compresslevel=9,mtime=0)
(root/"mendenhall-inland-dtm.bin").write_bytes(pack)
meta_file=root/"mendenhall-scene-preview.json"
meta=json.loads(meta_file.read_text())
meta["terrainPolicy"]="Only qualified inland crop; at disagreements and padding use stock."
meta["terrain"]={"bounds":[l,t,r,b],"width":r-l,"height":b-t,"step":1,
  "vertical":"NAVD88 minus established 18 m Aerie reference; no fitted shift.",
  "source":{k:v for k,v in d.items() if k!="dataBase64Zlib"}, "calibration":check,
  "packSha256":hashlib.sha256(pack).hexdigest(),
  "rule":"Same measured terrain in ground and clearance. 18m edge feather; residual magnitudes above 1.7m fade out completely by 3.2m. Original water/ice/high-resolution features are outside this validated crop."}
meta_file.write_text(json.dumps(meta,indent=2)+"\n")
print(check,len(pack))
