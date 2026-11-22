"""Build the single linear runtime opacity texture from screened PNG cells."""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageOps
from public_domain import read_studies

def sha(data):
    return hashlib.sha256(data).hexdigest()

def read_payloads(root):
    manifest=json.loads((root/'manifest.json').read_text())
    images={}
    for filename,attrs in manifest['atlases'].items():
        source=root/filename
        assert sha(source.read_bytes())==attrs['sha256']
        images[filename]=Image.open(source).convert('L')
    payloads={}
    for tile in manifest['tiles']:
        x,y,w,h=tile['payloadRectPx']
        crop=images[tile['atlas']].crop((x,y,x+w,y+h))
        assert sha(crop.tobytes())==tile['sha256Payload'], tile['id']
        assert crop.getextrema()[1]>0
        payloads[tile['id']]=crop
    return manifest,payloads

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path)
    parser.add_argument('destination',type=Path)
    parser.add_argument('--photo',type=Path,required=True)
    parser.add_argument('--public-domain',type=Path,required=True)
    args=parser.parse_args()
    source,payloads=read_payloads(args.source)
    sheet_path=args.photo/'manifest.json' if args.photo else None
    scopes={};provenance={}
    site_selectors={
        'cleetwood':{'gentle_lap':'lake_gentle'},
        'horseshoe':{'shear_lines':'river_bank','bank_contact':'river_bank'},
    }
    if sheet_path and sheet_path.is_file():
        extras=json.loads(sheet_path.read_text())
        sheet=args.photo/'aerie-water-opacity-photo-guided.png'
        assert sha(sheet.read_bytes())==extras['atlasSha256']
        image=Image.open(sheet).convert('L')
        rows={row['id']:row for row in extras['tiles']}
        for ident,row in rows.items():
            x,y,w,h=row['payloadRectPx']
            crop=image.crop((x,y,x+w,y+h))
            assert sha(crop.tobytes())==row['payloadSha256'],ident
            assert crop.getextrema()[1]>0
        for site_name,site in extras['sites'].items():
            if site_name not in site_selectors:
                continue
            if any(ref['license'] not in {'CC0','CC BY 2.0','public domain'} for ref in site['photoReferences']):
                raise ValueError(f'Uncleared photography for {site_name}')
            for label,record in site['selectors'].items():
                selector=site_selectors[site_name].get(label)
                if selector is None:
                    continue
                for ident in record['variants']:
                    row=rows[ident]
                    x,y,w,h=row['payloadRectPx']
                    assert ident not in payloads
                    payloads[ident]=image.crop((x,y,x+w,y+h))
                    scopes.setdefault(site['world'],{}).setdefault(selector,[]).append(ident)
                    provenance[ident]={'site':site_name,'selector':label,'photoReferences':site['photoReferences'],
                        'generatedSheetSha256':site['sourceSha256'],'payloadSha256':row['payloadSha256']}
    for ident,world,role,asset,references in read_studies(args.public_domain,sha):
        payloads[ident]=asset
        scopes.setdefault(world,{}).setdefault(role,[]).append(ident)
        provenance[ident]={'site':world,'selector':role,'photoReferences':references,
            'method':'feathered opacity study extracted by tools/water-opacity/public_domain.py',
            'payloadSha256':sha(asset.tobytes())}
    active={'lake_gentle','lake_windy','river_bank','falls_curtain','falls_impact','falls_plume',
        'ocean_crest','ocean_rebound','ocean_wash','ocean_backwash','wildlife_paddle','wildlife_fish'}
    worlds={key:[role for role in roles if role in active] for key,roles in source['worldSelectors'].items()}
    worlds['yellowstone']=['river_bank','falls_curtain','falls_impact','falls_plume']
    # Only the inland lakes with a mapped lake plane use the directional bow shader.
    for world,roles in worlds.items():
        if world not in ('winnipesaukee','moosehead') and 'wildlife_paddle' in roles:
            roles.remove('wildlife_paddle')
    registry={'worlds':worlds,'pages':{},'selectors':{k:source['practicalSelectors'][k] for k in sorted(active)},
        'photoOverrides':scopes,'photoProvenance':provenance,'sourceAtlases':source['atlases']}
    # A new factory can use the native chutes without ever assuming it has a coast.
    registry['worlds']['freshwater']=['falls_curtain','falls_impact','falls_plume']
    all_packed=set()
    for region,available in registry['worlds'].items():
        ids=set()
        for key in available:
            record=registry['selectors'][key]
            if record['status']!='stock_hook_candidate':
                continue
            ids.update(record['variants'][:4])
            ids.update(scopes.get(region,{}).get(key,[]))
        ordered=sorted(ids)
        all_packed.update(ordered)
        # Each world fetches one page, with only its permitted semantic roles.
        columns=8
        page=Image.new('L',(columns*128,((len(ordered)+columns-1)//columns)*128))
        filename=f'water-opacity-{region}.png'
        slots={}
        for index,ident in enumerate(ordered):
            crop=payloads[ident]
            resized=ImageOps.contain(crop,(112,112),Image.Resampling.LANCZOS)
            slot=Image.new('L',(112,112))
            slot.paste(resized,((112-resized.width)//2,(112-resized.height)//2))
            x=128*(index%columns)+8
            y=128*(index//columns)+8
            page.paste(slot,(x,y))
            slots[ident]=index
        page.save(args.destination/filename,optimize=True)
        registry['pages'][region]={'file':filename,'size':list(page.size),'slots':slots,
            'storage':'bank-alpha' if region=='canyon' else 'red','sha256':sha((args.destination/filename).read_bytes())}
    out=args.destination/'water-opacity-registry.json'
    out.write_text(json.dumps(registry,indent=2)+'\n')
    print('Validated',len(source['tiles']),'generic and',len(extras['tiles']) if sheet_path and sheet_path.is_file() else 0,
          'photo payloads; packed',len(all_packed),'unique IDs in',len(registry['pages']),'world pages')

if __name__=='__main__':main()
