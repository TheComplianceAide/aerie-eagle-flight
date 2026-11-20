"""Prepare sourced field recordings for the game.

For each manifest entry chosen in PLAN: decode (afconvert), trim to the
selected excerpt, remove sub-audio rumble, fold point sources to mono, match
loudness, fade or crossfade the loop seam, and encode AAC (afconvert).
Writes game/scape-<world>-<role>.m4a and soundscape-credits.txt.
"""
import json, os, subprocess, sys, tempfile
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SRC = sys.argv[1]          # audio-src directory
GAME = sys.argv[2]         # game directory
PLAN = json.load(open(sys.argv[3]))  # {world: {role: {file, start, end, loop, mono, hp, gain_db}}}
FS = 44100

def decode(path):
    tmp = tempfile.mktemp(suffix='.wav')
    subprocess.run(['afconvert', '-f', 'WAVE', '-d', f'LEI16@{FS}', path, tmp], check=True, capture_output=True)
    fs, x = wavfile.read(tmp); os.remove(tmp)
    x = x.astype(np.float64) / 32768.0
    if x.ndim == 1: x = x[:, None]
    return fs, x

def encode(x, out, stereo):
    tmp = tempfile.mktemp(suffix='.wav')
    wavfile.write(tmp, FS, (np.clip(x, -1, 1) * 32767).astype(np.int16))
    subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', '128000' if stereo else '80000', tmp, out], check=True, capture_output=True)
    os.remove(tmp)

def process(world, role, cfg):
    fs, x = decode(os.path.join(SRC, world, cfg['file']))
    a = int(cfg.get('start', 0) * fs); b = int(cfg['end'] * fs) if cfg.get('end') else len(x)
    x = x[a:b]
    if 'channel' in cfg:   # out-of-phase stereo: take one channel instead of summing
        x = x[:, [min(cfg['channel'], x.shape[1] - 1)]]
    if cfg.get('mono', not cfg.get('loop')):
        x = x.mean(axis=1, keepdims=True)
    elif x.shape[1] == 1:
        x = np.repeat(x, 2, axis=1)
    hp = cfg.get('hp', 45)
    x = sosfilt(butter(4, hp, 'highpass', fs=fs, output='sos'), x, axis=0)
    if cfg.get('lp'):
        x = sosfilt(butter(4, cfg['lp'], 'lowpass', fs=fs, output='sos'), x, axis=0)
    loop = cfg.get('loop', False)
    if loop:
        # Equal-power crossfade of the last `xf` seconds into the start.
        xf = int(min(1.5, len(x) / fs / 6) * fs)
        head, tail = x[:xf], x[-xf:]
        t = np.linspace(0, 1, xf)[:, None]
        x = np.concatenate([tail * np.cos(t * np.pi / 2) + head * np.sin(t * np.pi / 2), x[xf:-xf]])
        rms = np.sqrt(np.mean(x ** 2)); x *= 10 ** (-22 / 20) / max(rms, 1e-6)
    else:
        f = int(.012 * fs); x[:f] *= np.linspace(0, 1, f)[:, None]
        f = int(.08 * fs); x[-f:] *= np.linspace(1, 0, f)[:, None]
        peak = np.max(np.abs(x)); x *= 10 ** (-2 / 20) / max(peak, 1e-6)
    x *= 10 ** (cfg.get('gain_db', 0) / 20)
    peak = np.max(np.abs(x))
    if peak > .98: x *= .98 / peak
    out = os.path.join(GAME, f'scape-{world}-{role}.m4a')
    encode(x, out, x.shape[1] == 2)
    return out, len(x) / fs

credits = []
for world, roles in PLAN.items():
    manifest = {e['file']: e for e in json.load(open(os.path.join(SRC, world, 'manifest.json'))) if e.get('file')}
    for role, cfg in roles.items():
        out, dur = process(world, role, cfg)
        m = manifest.get(cfg['file'], {})
        span = f"{cfg.get('start', 0):.2f} to {cfg['end']:.2f} seconds" if cfg.get('end') else 'full length'
        credits.append((world, f"{os.path.basename(out)} — “{m.get('title','')}.” {m.get('author','')}. {m.get('location','')}. {m.get('license','')}.\n"
                               f"{m.get('source_url','')}\n{m.get('license_url','')}\nExcerpt: {span}; {'loop seam crossfaded' if cfg.get('loop') else 'faded'}; rumble removed; level matched.\n"))
        print(f'{world:14} {role:28} {dur:6.1f}s  {os.path.getsize(out)//1024} KB')
names = {'alaska': 'MENDENHALL GLACIER', 'canyon': 'HORSESHOE BEND', 'swiss': 'OESCHINEN LAKE', 'yosemite': 'YOSEMITE VALLEY',
         'winnipesaukee': 'LAKE WINNIPESAUKEE', 'surry': 'SURRY MOUNTAIN DAM & KEENE', 'dixville': 'DIXVILLE NOTCH',
         'moosehead': 'MOOSEHEAD LAKE', 'crater': 'CRATER LAKE', 'lofoten': 'LOFOTEN ISLANDS', 'milford': 'MILFORD SOUND', 'labrador': 'LAC BERTÉ'}
with open(os.path.join(GAME, 'soundscape-credits.txt'), 'w') as f:
    f.write('AERIE REGIONAL SOUNDSCAPES\n\nField recordings placed in 3D in each world. Excerpts were trimmed, filtered below 45 Hz, level-matched and faded or loop-crossfaded. '
            'Thunder strikes and close raindrops are synthesised physically in the game. Reverberation is simulated per world with pyroomacoustics (MIT). '
            'Binaural rendering uses Omnitone 2.0 (Google, Apache-2.0; see omnitone-LICENSE.txt) with SADIE HRIRs.\n')
    for w in names:
        rows = [c for (ww, c) in credits if ww == w]
        if rows: f.write(f'\n{names[w]}\n\n' + '\n'.join(rows))
    f.write('\nACOUSTICS, HEADS AND LIVE AIR\n\nBinaural rendering: Omnitone 2.0 (Google, Apache-2.0; omnitone-LICENSE.txt). Its built-in SADIE KU100 decoder is the default head.\nHead profiles hrir-fabian, -small, -small-medium, -medium, -large-medium, -large: HUTUBS HRTF database, Audio Communication Group, Technische Universität Berlin (subjects pp1, pp27, pp2, pp8, pp5, pp36). CC BY 4.0. Converted to third-order decoders (least squares below 1.5 kHz, magnitude least squares above) by tools/acoustics/make_hrirs.py.\nhttps://sofacoustics.org/data/database/hutubs/\nhttps://creativecommons.org/licenses/by/4.0/\nhrir-eagle: rigid-sphere head model (Duda & Martens 1998) with a 4 cm radius and ears at 100 degrees azimuth, -10 degrees elevation.\nEagle Ears hearing curve follows diurnal raptor audiograms (Dooling 1980; Dooling, Lohr & Dent 2000): most sensitive near 1-4 kHz, falling above about 6 kHz.\nWorld reverberation: ir-*.m4a simulated with pyroomacoustics (MIT) by tools/acoustics/make_irs.py.\nAir absorption: ISO 9613-1. Live air: Open-Meteo forecast API (CC BY 4.0), NOAA GFS/HRRR for US worlds; https://open-meteo.com/\n')
