#!/usr/bin/env python3
"""Attach exact observed dry backing and qualified dry inland height source."""
import base64, gzip, hashlib, json, sys, zlib
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'game'
p=root/'acadia-fused-preview.json';m=json.loads(p.read_text())
o=json.loads(Path(sys.argv[1]).read_text())
rgb=base64.b64decode(o.pop('imageBase64'));valid=zlib.decompress(base64.b64decode(o.pop('validMaskBase64Zlib')))
assert hashlib.sha256(rgb).hexdigest()==o['imageSha256'] and o['validPixels']==o['width']*o['height']
assert len(valid)==(o['validPixels']+7)//8
(root/'acadia-fused-preview-ortho.jpg').write_bytes(rgb);m['ortho']=o
t=json.loads(Path(sys.argv[2]).read_text()); cal=json.loads(Path(sys.argv[3]).read_text())['stats']
raw=zlib.decompress(base64.b64decode(t.pop('dataBase64Zlib')))
assert hashlib.sha256(raw).hexdigest()==t['sha256'] and len(raw)==400*400*2 and t['localRect']==[-700,500,-300,900]
assert cal['holdout']>=1700 and abs(cal['holdoutDelta'][3])<.04 and abs(cal['holdoutDelta'][1])<.18 and abs(cal['holdoutDelta'][5])<.18
(root/'acadia-fused-preview-terrain.bin').write_bytes(gzip.compress(raw,compresslevel=9,mtime=0))
m['terrain']={'bounds':t['localRect'],'width':t['width'],'height':t['height'],'step':1,'scale':.01,'offset':0,
  'verticalVerified':True,'minDryM':6,'fullResidualM':.22,'maxResidualM':.62,'source':t,'holdout':{k:v for k,v in cal.items() if 'holdout' in k},
  'rule':'Tiny dry local refinement; shared geometric and clearance height; no shift of any water, shoreline, wet or existing coastal survey terrain.'}
p.write_text(json.dumps(m,indent=2)+'\n')
