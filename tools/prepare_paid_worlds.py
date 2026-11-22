#!/usr/bin/env python3
"""Split the private flight entry files out of a generated Azure deployment."""

import argparse
from pathlib import Path
from shutil import copyfile


ENTRIES = {
    'alaska': 'alaska-world.js',
    'canyon': 'canyon.js',
    'swiss': 'world.js',
    'yellowstone': 'yellowstone-world.js',
    **{world: f'atlas-{world}-survey.js' for world in (
        'acadia', 'crater', 'dixville', 'labrador', 'lofoten', 'moosehead', 'surry', 'yosemite'
    )},
}


def prepare(public, private):
    public, private = public.resolve(), private.resolve()
    if public.name != 'dist' or public in private.parents or private in public.parents or public == private:
        raise ValueError('Provide a generated dist folder and a separate empty private asset folder.')
    if private.exists() and any(private.iterdir()):
        raise ValueError('Use an empty private asset folder for each build.')
    index = public / 'index.html'
    page = index.read_text()
    if '<head>' not in page or 'aerie-access' in page or not (public/'access-pass.js').is_file():
        raise ValueError('The generated game must include the current access-pass script.')
    paths = [(public / filename, private / world / filename) for world, filename in ENTRIES.items()]
    missing = [source.name for source, _ in paths if not source.is_file() or source.is_symlink()]
    if missing:
        raise FileNotFoundError('Paid entry files are missing: ' + ', '.join(missing))
    for source, target in paths:
        target.parent.mkdir(parents=True, exist_ok=True)
        copyfile(source, target)

    changed = []
    pending = index.with_name('index.with-passes.html')
    head = '<head><meta name="aerie-access" content="required"><meta name="aerie-monitor" content="/api/aerie/telemetry">'
    pending.write_text(page.replace('<head>', head, 1))
    try:
        for source, target in paths:
            source.unlink()
            changed.append((source, target))
        pending.replace(index)
    except OSError:
        for source, target in changed:
            copyfile(target, source)
        pending.unlink(missing_ok=True)
        raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('dist', type=Path, help='generated public game folder')
    parser.add_argument('private', type=Path, help='empty upload folder for the private asset container')
    args = parser.parse_args()
    prepare(args.dist, args.private)
    print(f'Prepared {len(ENTRIES)} paid entries. Upload the private tree before deploying the public game.')
