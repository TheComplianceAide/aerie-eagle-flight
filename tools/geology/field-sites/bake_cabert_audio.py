import argparse
import subprocess
from pathlib import Path

import numpy as np
import requests
from scipy.io import wavfile
from scipy.signal import butter, sosfiltfilt

parser = argparse.ArgumentParser(
    description="Rebuild two mono AAC spatial beds from MarleneAyni’s CC0 Mont-Bélair stream."
)
parser.add_argument("--cache", type=Path, required=True)
parser.add_argument("--game", type=Path, required=True)
args = parser.parse_args()
p = args.cache
p.mkdir(parents=True, exist_ok=True)
args.game.mkdir(parents=True, exist_ok=True)
source = p / "belair-580324.mp3"
# Freesound's published high quality preview corresponds to the file on the
# credited recording page. Fast-start AAC is encoded with Apple's Audio Toolbox.
if not source.exists():
    response = requests.get(
        "https://cdn.freesound.org/previews/580/580324_929621-hq.mp3", timeout=60
    )
    response.raise_for_status()
    source.write_bytes(response.content)
decoded = p / "belair.wav"
if not decoded.exists():
    subprocess.run(
        ["afconvert", "-f", "WAVE", "-d", "LEI16", str(source), str(decoded)],
        check=True,
    )
rate, m = wavfile.read(decoded)
if m.dtype.kind == "i":
    m = m.astype("f4") / float(2 ** (m.dtype.itemsize * 8 - 1))
m = m.mean(axis=1)
for name, begin, end, low, hi in [
    ("brook", 1.65, 21.3, 70, 12500),
    ("sill", 25.1, 47.8, 64, 15600),
]:
    a = sosfiltfilt(
        butter(3, (low, hi), "bandpass", fs=rate, output="sos"),
        m[int(rate * begin) : int(rate * end)],
    )
    fade = int(0.76 * rate)
    theta = np.linspace(0, np.pi / 2, fade)
    a[:fade] = a[:fade] * np.sin(theta) + a[-fade:] * np.cos(theta)
    a = a[:-fade]
    a *= 0.135 / max(0.01, np.sqrt(np.mean(a * a)))
    if np.max(np.abs(a)) > 0.95:
        a *= 0.95 / np.max(np.abs(a))
    scratch = p / f"{name}-loop.wav"
    target = args.game / f"scape-cabert-{name}.m4a"
    wavfile.write(scratch, rate, np.int16(a * 32767))
    target.unlink(missing_ok=True)
    subprocess.run(
        [
            "afconvert",
            "-f",
            "m4af",
            "-d",
            "aac",
            "-b",
            "88000",
            str(scratch),
            str(target),
        ],
        check=True,
    )
    print(name, len(a) / rate, target.stat().st_size)
