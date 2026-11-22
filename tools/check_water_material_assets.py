"""Verify coverage, decoded dimensions and provenance for the runtime water atlas."""
import hashlib
import json
from pathlib import Path
import re
import struct

GAME = Path(__file__).resolve().parents[1] / 'game'
registry = json.loads((GAME / 'water-opacity-registry.json').read_text())
menu = (GAME / 'world-menu.js').read_text()
worlds = set(re.findall(r'^    (\w+):\s*\{\s*name:', menu, re.M))
assert set(registry['pages']) == set(registry['worlds']) == worlds | {'freshwater'}
coasts = {'acadia', 'lofoten'}
packed = set()


def png_size(data):
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    return struct.unpack('>II', data[16:24])


for world, page in registry['pages'].items():
    raw = (GAME / page['file']).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == page['sha256'], world
    width, height = png_size(raw)
    assert (width, height) == tuple(page['size']) and width == 1024 and height % 128 == 0, world
    assert raw[24] == 8 and raw[25] == 0, f'{world} should be an 8-bit grayscale PNG'
    slots = page['slots']
    assert slots and sorted(slots.values()) == list(range(len(slots))) and len(slots) <= 8 * (height // 128), world
    packed.update(slots)
    roles = registry['worlds'][world]
    assert roles and (world in coasts or not any(r.startswith('ocean_') for r in roles)), world
    for role in roles:
        variants = registry['selectors'][role]['variants'][:4]
        assert len(variants) == len(set(variants)) == 4 and set(variants) <= slots.keys(), (world, role)
    for role, variants in registry['photoOverrides'].get(world, {}).items():
        assert role in roles and set(variants) <= slots.keys(), (world, role)
        for variant in variants:
            assert variant in registry['photoProvenance'], variant
    if page['storage'] == 'bank-alpha':
        assert world == 'canyon'
        native_w, native_h = png_size((GAME / 'canyon-surveyed-banks.png').read_bytes())
        assert width <= native_w and height <= native_h

for variant, meta in registry['photoProvenance'].items():
    assert variant in packed
    assert meta['photoReferences'] and all(r['credit'] and r['url'].startswith('https://')
        and r['license'] in {'CC0','public domain','CC BY 2.0'} for r in meta['photoReferences']), variant
for name in ('granite', 'sandstone'):
    raw = (GAME / f'close-rock-{name}-analog.png').read_bytes()
    assert png_size(raw) == (512, 512) and raw[24:26] == bytes([8,6]), name
print(f'Verified {len(worlds)} world pages, {len(packed)} distinct opacity masks, two rock packs and all photo-derived source notices.')
