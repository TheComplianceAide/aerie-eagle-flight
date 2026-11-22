"""Extract small, feathered opacity studies from rights-clear source photographs."""
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps, ImageFilter


REFERENCES = {
    'schoodic-nps.jpg': {
        'credit': 'Victoria Stauffenberg / National Park Service, Schoodic Point',
        'license': 'public domain',
        'url': 'https://npgallery.nps.gov/AssetDetail/4a9c4786-1356-44be-aa0b-b2556b27b753',
        'sha256': '5a8379a5cd8c9a01d7f20a33b8209cb0150182b39ffc19cc888f82c0428ce364',
    },
    'thunder-usgs.jpg': {
        'credit': 'Alex Demas / USGS, Thunder Hole (location context only)',
        'license': 'public domain',
        'url': 'https://www.usgs.gov/media/images/acadia-national-park-12',
        'sha256': '4b2c7841d9fbb42ff9153757442c898c4e9173059b5b63501c643641be831554',
    },
    'nugget-benson.jpg': {
        'credit': 'Aubree Benson / USDA Forest Service, Nugget Falls',
        'license': 'CC0',
        'url': 'https://www.flickr.com/photos/alaska_region/52503184720',
        'sha256': 'f534212f81e7bf186b12b52143629086c520c9cf6583efa4aaec7755bf5319be',
    },
}

# Only cropped water/spray enters the atlases. The separate Thunder Hole site
# photograph explains the rock channel context and is not read as a mask.
STUDIES = [
    ('acadia', 'ocean_crest', 'schoodic-nps.jpg', (.30,.49,.65,.65), 0),
    ('acadia', 'ocean_crest', 'schoodic-nps.jpg', (.39,.52,.64,.66), -12),
    ('acadia', 'ocean_rebound', 'schoodic-nps.jpg', (.32,.30,.65,.68), 0),
    ('acadia', 'ocean_rebound', 'schoodic-nps.jpg', (.41,.30,.61,.67), 13),
    ('acadia', 'ocean_wash', 'schoodic-nps.jpg', (.40,.55,.65,.68), -21),
    ('acadia', 'ocean_backwash', 'schoodic-nps.jpg', (.29,.52,.58,.66), 16),
    ('alaska', 'falls_curtain', 'nugget-benson.jpg', (.51,.46,.91,.73), 36),
    ('alaska', 'falls_curtain', 'nugget-benson.jpg', (.27,.58,.71,.80), 36),
    ('alaska', 'falls_impact', 'nugget-benson.jpg', (.06,.74,.68,.87), 0),
    ('alaska', 'falls_impact', 'nugget-benson.jpg', (.10,.78,.79,.88), -9),
    ('alaska', 'falls_plume', 'nugget-benson.jpg', (.01,.65,.35,.86), -9),
    ('alaska', 'falls_plume', 'nugget-benson.jpg', (.17,.68,.43,.86), 18),
]


def mat(source, box, turn, crest):
    area = tuple(round(v * source.size[i % 2]) for i, v in enumerate(box))
    crop = source.crop(area).resize((104, 104), Image.Resampling.LANCZOS)
    rgb = np.asarray(crop, dtype=np.float32) / 255
    lum = rgb @ np.array([.24, .61, .15])
    broad = np.asarray(crop.convert('L').filter(ImageFilter.GaussianBlur(4)), dtype=np.float32) / 255
    low, high = np.quantile(lum, [.25, .94])
    strength = np.clip((lum - low) / max(.10, high-low),0,1)
    fine = np.clip(.35 + (lum - broad)*5.2,0,1)
    spread = np.max(rgb,axis=2)-np.min(rgb,axis=2)
    strength *= (1 - np.clip((spread-.14)*5.,0,1)) * (.42+.58*fine)
    if crest:
        # Remove most calm background from the coastal photo; retain the rising burst.
        strength *= .29+.71*np.clip((lum-broad)*9,0,1)
    mask = Image.fromarray(np.rint(strength*255).astype(np.uint8)).rotate(turn, Image.Resampling.BICUBIC)
    mask = ImageOps.autocontrast(mask, cutoff=.8)
    y,x=np.mgrid[-1:1:104j,-1:1:104j]
    screen = np.clip((1.-np.sqrt(x*x+y*y))/.32,0,1)
    return Image.fromarray(np.rint(np.asarray(mask)*screen).astype(np.uint8))


def read_studies(root: Path, sha):
    sources={}
    for name, meta in REFERENCES.items():
        raw=(root/name).read_bytes()
        if sha(raw)!=meta['sha256']:
            raise ValueError(f'Unexpected source digest for {name}')
        sources[name]=ImageOps.exif_transpose(Image.open(root/name)).convert('RGB')
    for i,(world, role, name, box, turn) in enumerate(STUDIES):
        patch=mat(sources[name],box,turn,world=='acadia')
        credited=[REFERENCES[name]]+([REFERENCES['thunder-usgs.jpg']] if world=='acadia' else [])
        yield f'public_domain/{world}/{role}/{i:02}', world, role, patch, credited
