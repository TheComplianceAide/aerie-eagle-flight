"""Package and verify Aerie's commerce Function App with the existing Azure CLI login."""
import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[2]
APP = 'func-playaerie-prod'
AZURE = ['--subscription', 'Azure subscription 1', '--resource-group', 'rg-aerie-prod', '--name', APP, '--only-show-errors']
ORIGINS = ('https://playaerie.com', 'https://www.playaerie.com')
REQUIRED = {'host.json', 'package.json', 'package-lock.json', 'src/functions.mjs'}
TRIGGERS = {'aerie-' + name: 'httpTrigger' for name in (
    'config', 'status', 'checkout', 'checkout-complete', 'stripe-webhook', 'gift-redeem',
    'signup', 'restore', 'restore-confirm', 'share-claim', 'share-friends', 'asset', 'purchase-help', 'telemetry')}
TRIGGERS['aerie-purchase-confirmations'] = 'timerTrigger'


class ReleaseError(Exception):
    pass


def run(args, description, *, cwd=ROOT, timeout=60):
    try:
        return subprocess.run(args, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              timeout=timeout, check=True).stdout
    except (subprocess.SubprocessError, OSError):
        raise ReleaseError(description + ' failed. Review the command or service logs privately.') from None


def snapshot(sha):
    if not re.fullmatch('[0-9a-f]{40}', sha):
        raise ReleaseError('Use the full merged Git commit SHA.')
    raw = run(['git', 'archive', '--format=tar', sha + ':commerce'], 'Reading committed commerce source')
    files = {}
    with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
        for entry in archive:
            if entry.isdir():
                continue
            path = PurePosixPath(entry.name)
            if not entry.isfile() or path.is_absolute() or '..' in path.parts:
                raise ReleaseError('Unexpected file type or path in committed commerce source.')
            files[entry.name] = archive.extractfile(entry).read()
    if not REQUIRED.issubset(files):
        raise ReleaseError('Committed commerce source is missing runtime files.')
    return files


def package(files, sha, output):
    runtime = {k: v for k, v in files.items() if k in REQUIRED or k.startswith('src/')}
    manifest = json.loads(runtime['package.json'])
    manifest['aerieReleaseRevision'] = sha
    runtime['package.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    directories = {str(p) + '/' for k in runtime for p in PurePosixPath(k).parents if str(p) != '.'}
    with ZipFile(output, 'w') as z:
        for name in sorted(directories | set(runtime)):
            directory = name in directories
            record = ZipInfo(name)  # Fixed DOS epoch; independent of checkout time and umask.
            record.create_system = 3
            record.external_attr = ((stat.S_IFDIR | 0o755) << 16 | 0x10) if directory else (stat.S_IFREG | 0o644) << 16
            z.writestr(record, b'' if directory else runtime[name],
                       compress_type=ZIP_STORED if directory else ZIP_DEFLATED)
    verify_package(output, sha, directories | set(runtime))


def verify_package(path, sha, expected):
    with ZipFile(path) as z:
        if sorted(z.namelist()) != sorted(expected) or z.testzip() is not None:
            raise ReleaseError('Incomplete or corrupt Functions package.')
        for entry in z.infolist():
            mode = (stat.S_IFDIR | 0o755) if entry.is_dir() else (stat.S_IFREG | 0o644)
            if entry.create_system != 3 or entry.external_attr >> 16 != mode:
                raise ReleaseError('Wrong Linux ZIP entry permissions for ' + entry.filename)
        if json.loads(z.read('package.json')).get('aerieReleaseRevision') != sha:
            raise ReleaseError('The package revision differs from the selected commit.')


def public_json(origin, route):
    url = origin + '/api/aerie/' + route
    request = Request(url, headers={'Accept': 'application/json', 'Cache-Control': 'no-cache'})
    try:
        with urlopen(request, timeout=6) as response:
            if response.status != 200 or response.geturl() != url or response.headers.get_content_type() != 'application/json':
                raise ReleaseError(url + ' did not return a direct JSON response.')
            data = json.loads(response.read(32768))
            if not isinstance(data, dict):
                raise ReleaseError(url + ' returned unexpected JSON.')
            return data
    except HTTPError as error:
        raise ReleaseError(url + ' returned HTTP ' + str(error.code)) from None
    except (URLError, TimeoutError, ValueError, OSError):
        raise ReleaseError(url + ' was unavailable or did not return valid JSON.') from None


def verify_health(sha, mode):
    for origin in ORIGINS:
        config = public_json(origin, 'config')
        if (config.get('releaseRevision') != sha or config.get('checkoutMode') != mode or
                config.get('checkout') is not True or config.get('restore') is not True or
                config.get('priceAmount') != 199 or config.get('priceCurrency') != 'usd'):
            raise ReleaseError(origin + ' does not serve the expected revision, payment mode and $1.99 offer.')
        status = public_json(origin, 'status')
        if status.get('authenticated') is not False or status.get('fullAccess') is not False or status.get('worlds') != ['winnipesaukee']:
            raise ReleaseError(origin + ' returned unexpected anonymous player access.')
    data = run(['az', 'functionapp', 'function', 'list', *AZURE, '--query',
                '[].{name:name,types:config.bindings[].type}', '-o', 'json'], 'Reading indexed Function triggers')
    available = {r['name'].rsplit('/', 1)[-1]: r['types'] or [] for r in json.loads(data)}
    missing = sorted(n for n, kind in TRIGGERS.items() if kind not in available.get(n, []))
    if missing:
        raise ReleaseError('Missing indexed Function triggers: ' + ', '.join(missing))


def wait_healthy(sha, mode, timeout=300):
    end = time.monotonic() + timeout
    while True:
        try:
            verify_health(sha, mode)
            return
        except ReleaseError as error:
            if time.monotonic() >= end:
                raise ReleaseError('Release health verification failed. ' + str(error)) from None
        time.sleep(5)


def ensure_current(sha):
    run(['git', 'fetch', '--quiet', 'origin', 'main'], 'Fetching main')
    run(['git', 'merge-base', '--is-ancestor', sha, 'origin/main'], 'Confirming merged source')
    run(['git', 'diff', '--exit-code', '--quiet', sha, 'origin/main', '--', 'commerce'], 'Comparing commerce with current main')


def deploy(sha, mode, directory):
    ensure_current(sha)
    files = snapshot(sha)
    source = directory / 'commerce'
    for name, content in files.items():
        target = source / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
    run(['npm', 'ci', '--no-audit', '--no-fund'], 'Installing locked commerce dependencies', cwd=source, timeout=240)
    run(['npm', 'test'], 'Testing committed commerce source', cwd=source, timeout=240)
    run([sys.executable, '-m', 'unittest', 'discover', '-s', 'test', '-p', 'test_deploy_functions.py'],
        'Testing the release packager', cwd=source)
    archive = directory / 'commerce.zip'
    package(files, sha, archive)
    print('Verified package:', sha, hashlib.sha256(archive.read_bytes()).hexdigest(), flush=True)
    ensure_current(sha)
    # The CLI's non-Flex Linux zip path can edit app settings to enable a remote build.
    sku = run(['az', 'resource', 'show', *AZURE, '--resource-type', 'Microsoft.Web/sites',
               '--query', 'properties.sku', '-o', 'tsv'], 'Checking the Aerie hosting plan')
    if sku.strip().lower() != b'flexconsumption':
        raise ReleaseError('Recheck the deployment method for this hosting plan before publishing.')
    run(['az', 'functionapp', 'deployment', 'source', 'config-zip', *AZURE, '--src', str(archive),
         '--build-remote', 'true', '--timeout', '540', '-o', 'none'], 'Azure ZIP deployment', timeout=660)
    wait_healthy(sha, mode)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='action', required=True)
    pack = commands.add_parser('package', help='build and validate locally')
    pack.add_argument('sha')
    pack.add_argument('output', type=Path)
    for name in ('verify', 'deploy'):
        sub = commands.add_parser(name)
        sub.add_argument('sha')
        sub.add_argument('--mode', required=True, choices=('test', 'live'), help='expected public mode')
    args = parser.parse_args()
    if args.action == 'package':
        package(snapshot(args.sha), args.sha, args.output)
        print('Verified package:', args.sha, hashlib.sha256(args.output.read_bytes()).hexdigest())
    else:
        if args.action == 'deploy':
            with tempfile.TemporaryDirectory() as tmp:
                deploy(args.sha, args.mode, Path(tmp))
        else:
            verify_health(args.sha, args.mode)
        print('Both public hosts verified for', args.sha, 'in', args.mode, 'mode;', len(TRIGGERS), 'triggers indexed.')


if __name__ == '__main__':
    try:
        main()
    except (ReleaseError, ValueError, OSError) as error:
        print('Release failed:', str(error) if isinstance(error, ReleaseError) else type(error).__name__, file=sys.stderr)
        sys.exit(1)
