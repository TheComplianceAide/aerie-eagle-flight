"""Verify both render resolutions, source identity, PBR atlases and survey payloads."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import struct

import numpy as np
from PIL import Image

DATA = Path(__file__).resolve().parents[2] / 'game' / 'geology-data'


def validate_form(raw, offset, cell, expected):
    vertex_count, index_count = struct.unpack_from('<HH', raw, offset)
    offset += 4
    vertex = np.frombuffer(raw, '<i2', vertex_count * 8, offset).reshape(-1, 8)
    offset += vertex_count * 16
    index = np.frombuffer(raw, '<u2', index_count, offset)
    offset += index_count * 2
    assert index_count == expected * 3 and index.max() < vertex_count
    points = vertex[:, :3] / 16000
    normals = np.linalg.norm(vertex[:, 3:6] / 32767, axis=1)
    assert np.all(np.abs(normals - 1) < .001), 'invalid tangent frame'
    uv = vertex[:, 6:] / 32767
    col, row = cell % 4, cell // 4
    assert np.all((col < 4 * uv[:, 0]) & (4 * uv[:, 0] < col + 1))
    assert np.all((row < 4 * (1 - uv[:, 1])) & (4 * (1 - uv[:, 1]) < row + 1))
    a, b, c = points[index.reshape(-1, 3)].transpose(1, 0, 2)
    face_normals = np.cross(b - a, c - a)
    assert (a * face_normals).sum() > .01 and face_normals[:, 1].max() > .0001
    tris = index.reshape(-1, 3)
    edges = np.concatenate([tris[:, [0, 1]], tris[:, [1, 2]], tris[:, [2, 0]]])
    _, valence = np.unique(np.sort(edges, axis=1), axis=0, return_counts=True)
    assert np.all(valence % 2 == 0), 'open contour'
    signature = sha256(vertex[:, :3].tobytes() + index.tobytes()).hexdigest()
    return offset, np.ptp(points, axis=0), signature


def survey_assets():
    for path in sorted(DATA.glob('kineo-*.glb')):
        raw = path.read_bytes()
        magic, version, length, json_size, json_type = struct.unpack_from('<4s4I', raw)
        assert (magic, version, length, json_type) == (b'glTF', 2, len(raw), 0x4E4F534A)
        doc = json.loads(raw[20:20 + json_size])
        primitive = doc['meshes'][0]['primitives'][0]
        assert set(['POSITION', 'NORMAL', 'TEXCOORD_0', 'TEXCOORD_1']) <= primitive['attributes'].keys()
        assert len(doc['images']) == 3 and len(doc['materials']) == 1
        yield path.stem


def check(production, expected):
    known, sources, forms = set(), set(), set()
    roster = None
    if production:
        plan = production / 'expansion' / 'plans' / 'sheets.json'
        roster = {r['id']: r for r in json.loads(plan.read_text()) if r['pipeline'] == 'geology'}
    for file in sorted(DATA.glob('*.json')):
        manifest = json.loads(file.read_text())
        sheets = manifest.get('sheets', [])
        if not sheets:
            continue
        print(file.stem, len(sheets) * 16, 'specimens')
        for sheet in sheets:
            key = sheet['id']
            assert sheet['region'] == file.stem and key not in known
            known.add(key)
            signature = sheet['sourceSHA256']
            assert signature not in sources and len(signature) == 64
            sources.add(signature)
            if roster:
                base = production if roster[key]['legacy'] else production / 'expansion'
                assert sha256((base / 'generated' / (key + '.png')).read_bytes()).hexdigest() == signature
            for suffix in ['-color.webp', '-normal.webp']:
                with Image.open(DATA / (key + suffix)) as atlas:
                    assert atlas.size == (1024, 1024) and atlas.mode == 'RGB'
                    atlas.load()
            raw = (DATA / (key + '.bin')).read_bytes()
            assert raw[:4] == b'ARG1' and len(sheet['specimens']) == 16
            offset = 4
            for cell, specimen in enumerate(sheet['specimens']):
                try:
                    lod = specimen['triangles']
                    assert 0 < lod[1] < lod[0] and specimen['length'] > 0
                    offset, ext, digest = validate_form(raw, offset, cell, lod[0])
                    assert np.max(np.abs(ext - specimen['extent'])) <= .00051
                    assert digest not in forms, 'duplicate specimen mesh'
                    forms.add(digest)
                    offset, _, _ = validate_form(raw, offset, cell, lod[1])
                except AssertionError as reason:
                    raise ValueError(f'{key} cell {cell + 1}: {reason}') from reason
            assert offset == len(raw), 'trailing or incomplete geometry'
    if expected is not None:
        assert len(known) == expected, f'expected {expected} sheets, got {len(known)}'
    if roster:
        assert known <= roster.keys()
        if expected == len(roster):
            assert known == roster.keys()
    survey = list(survey_assets())
    assert len(survey) == 4
    print(len(known), 'sheets;', len(forms), 'distinct 3D forms;', len(survey), 'survey and scan models')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--production', type=Path, help='verify original source hashes and roster')
    parser.add_argument('--expect', type=int, help='required total sheet count')
    args = parser.parse_args()
    check(args.production, args.expect)
