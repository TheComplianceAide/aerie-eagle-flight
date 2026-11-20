"""Build Omnitone 3rd-order binaural decoders (head profiles).

Each profile is 16 left-ear filters in the spherical-harmonic domain (ACN,
SN3D), stored as 8 stereo 48 kHz WAVs exactly like Omnitone's built-in set;
the right ear follows from left/right symmetry inside Omnitone.

Measured heads come from the HUTUBS database (TU Berlin, CC BY 4.0). Each
head's 440 measured directions are fitted by least squares below 1.5 kHz and
by magnitude least squares (MagLS, Schoerkhuber et al. 2018) above, where an
order-3 fit cannot hold the phase. The eagle head is a rigid sphere (Duda &
Martens 1998) with an eagle's head radius and ear placement.

Fitted in AmbiX axes (y = left), which reproduces Omnitone's built-in set when
fed by the game's encoder; checked by rendering test directions offline.
"""
import sys, json, glob
import numpy as np, h5py
from scipy.io import wavfile
from scipy.signal import resample_poly
from scipy.special import spherical_jn, spherical_yn, eval_legendre

FS, NFFT, TAPS, FC = 48000, 512, 256, 1500.0

def sh3(x, y, z):
    s3, s58, s152, s38 = np.sqrt(3), np.sqrt(5 / 8), np.sqrt(15) / 2, np.sqrt(3 / 8)
    return np.stack([np.ones_like(x), y, z, x, s3 * x * y, s3 * y * z, .5 * (3 * z * z - 1), s3 * x * z, s3 / 2 * (x * x - y * y),
                     s58 * y * (3 * x * x - y * y), s152 * 2 * x * y * z, s38 * y * (5 * z * z - 1), .5 * z * (5 * z * z - 3),
                     s38 * x * (5 * z * z - 1), s152 * z * (x * x - y * y), s58 * x * (x * x - 3 * y * y)], axis=-1)

def directions(az, el):  # SOFA: azimuth counter-clockwise (left positive), degrees
    a, e = np.radians(az), np.radians(el)
    return np.cos(e) * np.cos(a), np.cos(e) * np.sin(a), np.sin(e)   # x front, y left (AmbiX), z up

def fit(H, Y):
    """H: (M, F) complex left-ear HRTFs; Y: (M, 16). Returns (16, F)."""
    freqs = np.fft.rfftfreq(NFFT, 1 / FS)
    reg = 1e-3 * np.trace(Y.T @ Y) / Y.shape[1]
    P = np.linalg.solve(Y.T @ Y + reg * np.eye(Y.shape[1]), Y.T)
    D = np.zeros((Y.shape[1], H.shape[1]), complex)
    for k, f in enumerate(freqs):
        if f < FC:
            D[:, k] = P @ H[:, k]
        else:
            phase = np.angle(Y @ D[:, k - 1])
            D[:, k] = P @ (np.abs(H[:, k]) * np.exp(1j * phase))
    return D

def to_filters(D):
    h = np.fft.irfft(D, n=NFFT, axis=1)[:, :TAPS]
    fade = 32
    h[:, -fade:] *= np.linspace(1, 0, fade)
    return h

def measured(path):
    f = h5py.File(path)
    ir = f['Data.IR'][:]; pos = f['SourcePosition'][:]; fs = float(f['Data.SamplingRate'][0])
    left = resample_poly(ir[:, 0, :], 160, 147, axis=1) if round(fs) == 44100 else ir[:, 0, :]
    H = np.fft.rfft(left, n=NFFT, axis=1)
    x, y, z = directions(pos[:, 0], pos[:, 1])
    return H, sh3(x, y, z), pos

def sphere(pos, radius, ear_az, ear_el, c=343.0, terms=60):
    """Rigid-sphere HRTF for a far source (Duda & Martens 1998), left ear."""
    freqs = np.fft.rfftfreq(NFFT, 1 / FS)
    x, y, z = directions(pos[:, 0], pos[:, 1])
    ex, ey, ez = directions(np.array([ear_az]), np.array([ear_el]))
    cos_t = np.clip(x * ex + y * ey + z * ez, -1, 1)
    H = np.ones((len(x), len(freqs)), complex)
    m = np.arange(terms)[:, None]
    P = np.stack([eval_legendre(n, cos_t) for n in range(terms)])          # (terms, M)
    for k, f in enumerate(freqs):
        if f == 0: continue
        mu = 2 * np.pi * f * radius / c
        dh = spherical_jn(m[:, 0], mu, derivative=True) - 1j * spherical_yn(m[:, 0], mu, derivative=True)
        coef = ((1j) ** (m[:, 0] - 1)) * (2 * m[:, 0] + 1) / dh / mu ** 2
        H[:, k] = (coef[:, None] * P).sum(0)
    # Fold in a gentle pinna-free high roll-off so the sphere is not brighter than measured heads.
    H *= 1 / (1 + (freqs / 14000.0) ** 2)
    return H, sh3(x, y, z)

def write(name, h, scale):
    peak = np.max(np.abs(h * scale))
    if peak > .98: scale *= .98 / peak
    for k in range(8):
        pair = np.stack([h[2 * k], h[2 * k + 1]], axis=1) * scale
        wavfile.write(f'hrir-{name}-{k}.wav', FS, (pair * 32767).astype(np.int16))
    return scale

if __name__ == '__main__':
    src, out = sys.argv[1], sys.argv[2]
    import os; os.chdir(out)
    ref = np.zeros((16, TAPS))
    for k in range(8):
        _, w = wavfile.read(f'{src}/omni/omni-{k}.wav'); ref[2 * k], ref[2 * k + 1] = w[:, 0] / 32768, w[:, 1] / 32768
    ref_rms = np.sqrt((ref ** 2).sum(1))
    # Diffuse-field energy of a decoder (SN3D: each order n weighted 1/(2n+1)).
    order_w = np.array([1] + [1 / 3] * 3 + [1 / 5] * 5 + [1 / 7] * 7)
    diffuse = lambda h: float(np.sqrt((order_w * (h ** 2).sum(1)).sum()))
    ref_diffuse = diffuse(ref)
    report = {}
    profiles = {'fabian': 'pp1', 'small': 'pp27', 'small-medium': 'pp2', 'medium': 'pp8', 'large-medium': 'pp5', 'large': 'pp36'}
    for name, pp in profiles.items():
        H, Y, pos = measured(f'{src}/{pp}.sofa')
        h = to_filters(fit(H, Y))
        # Match the built-in set's overall level on the omnidirectional channel.
        scale = write(name, h, ref_diffuse / diffuse(h))
        corr = [float(np.dot(h[i], ref[i]) / (np.linalg.norm(h[i]) * np.linalg.norm(ref[i]) + 1e-12)) for i in range(4)]
        report[name] = dict(subject=pp, scale=round(float(scale), 4), corr_w_y_z_x=[round(c, 2) for c in corr])
    # Eagle: ~4 cm acoustic head radius; ears behind and slightly below the eyes.
    _, _, pos = measured(f'{src}/pp1.sofa')
    H, Y = sphere(pos, .04, 100.0, -10.0)
    h = to_filters(fit(H, Y))
    scale = write('eagle', h, ref_diffuse / diffuse(h))
    report['eagle'] = dict(model='rigid sphere a=4 cm, ears at 100 deg az, -10 deg el', scale=round(float(scale), 4))
    print(json.dumps(report, indent=1))
