"""Simulate outdoor impulse responses for each Aerie world with pyroomacoustics.

Each world is approximated by a shoebox whose dimensions follow the surveyed
landform (wall-to-wall width, wall height, reach along the valley). Open sky,
open valley mouths and sea are fully absorbing; rock walls, water and forest
take published-range energy absorption coefficients. ISO 9613-1 air absorption
uses the world's temperature and humidity. The receiver is a spaced omni pair
(AB, 2 m), and a hybrid image-source + ray-tracing model adds the scattered tail.
"""
import json, sys
import numpy as np
import pyroomacoustics as pra
from pyroomacoustics.directivities import Cardioid, DirectionVector
from scipy.io import wavfile

FS = 24000
# name: room [length, width, height], absorption per face, mic, source, temp, humidity, max order, seconds
WORLDS = {
  # Horseshoe Bend: ~280 m between 300 m Navajo sandstone walls along the river.
  'canyon':  dict(dim=[1400, 280, 300], a=dict(east=.95, west=.95, north=.04, south=.04, floor=.06, ceiling=1.), mic=[700, 95, 120], src=[640, 205, 3], t=30, h=15, order=16, sec=7.0),
  # Reinefjorden: ~1.1 km wide between 600-700 m faces; open sea at one end.
  'lofoten': dict(dim=[6000, 1100, 700], a=dict(east=.9, west=.9, north=.06, south=.06, floor=.02, ceiling=1.), mic=[3000, 400, 260], src=[2900, 760, 2], t=9, h=85, order=7, sec=9.0),
  # Milford Sound: ~1.5 km wide, 1.2 km walls draped in rainforest.
  'milford': dict(dim=[8000, 1500, 1200], a=dict(east=.9, west=.9, north=.22, south=.22, floor=.02, ceiling=1.), mic=[4000, 600, 320], src=[3800, 1040, 2], t=12, h=95, order=6, sec=9.0),
  # Yosemite Valley: ~1.6 km wide, 1 km granite walls, forested floor.
  'yosemite': dict(dim=[6000, 1600, 1000], a=dict(east=.9, west=.9, north=.03, south=.03, floor=.45, ceiling=1.), mic=[3000, 700, 220], src=[2800, 1040, 2], t=24, h=30, order=7, sec=8.0),
  # Oeschinen cirque: ~1.5 km bowl under 800 m limestone cliffs, open toward Kandersteg.
  'swiss':   dict(dim=[1800, 1500, 900], a=dict(east=1., west=.05, north=.05, south=.05, floor=.10, ceiling=1.), mic=[900, 700, 300], src=[780, 620, 2], t=15, h=60, order=10, sec=6.0),
  # Dixville Notch: ~350 m between 150-250 m schist cliffs, forested.
  'dixville': dict(dim=[1500, 350, 220], a=dict(east=.95, west=.95, north=.16, south=.16, floor=.40, ceiling=1.), mic=[750, 150, 80], src=[700, 250, 2], t=4, h=85, order=14, sec=5.0),
  # Mendenhall valley: glacier face at one end, forested walls, lake floor.
  'alaska':  dict(dim=[5000, 2200, 900], a=dict(east=.03, west=1., north=.22, south=.22, floor=.02, ceiling=1.), mic=[2500, 1000, 250], src=[2380, 1320, 2], t=12, h=85, order=7, sec=7.0),
  # Crater Lake caldera: rim 300-600 m above the lake, 8 km across.
  'crater':  dict(dim=[8000, 8000, 600], a=dict(east=.12, west=.12, north=.12, south=.12, floor=.02, ceiling=1.), mic=[400, 4000, 430], src=[700, 4100, 2], t=10, h=60, order=4, sec=7.0),
  # Forest-ringed lakes (Moosehead, Winnipesaukee, Surry, Lac Berte).
  'lake':    dict(dim=[5000, 3000, 1500], a=dict(east=.6, west=.6, north=.6, south=.6, floor=.02, ceiling=1.), mic=[2500, 1500, 120], src=[2400, 1250, 2], t=20, h=70, order=6, sec=4.0),
}

def simulate(name, cfg):
    # Scattering: rough rock and canopy diffuse much of the reflected energy;
    # open sky/sea faces are perfect absorbers so their scattering is moot.
    scatter = cfg.get('scatter', .45)
    mats = {k: pra.Material(energy_absorption=v, scattering=(0. if v >= .95 else scatter)) for k, v in cfg['a'].items()}
    room = pra.ShoeBox(cfg['dim'], fs=FS, materials=mats, max_order=min(cfg['order'], 6),
                       air_absorption=True, temperature=cfg['t'], humidity=cfg['h'], ray_tracing=True)
    # Hybrid model: image sources for the early, specular echoes and a
    # stochastic ray tracer for the scattered late field.
    room.set_ray_tracing(n_rays=cfg.get('rays', 60000), receiver_radius=cfg.get('radius', 6.), energy_thres=1e-7, time_thres=cfg['sec'], hist_bin_size=.004)
    room.add_source(cfg['src'])
    mic = np.array(cfg['mic'], dtype=float)
    # Spaced omni pair (AB, 2 m): decorrelated late field for a wide tail.
    room.add_microphone_array(np.c_[mic + [0, -1., 0], mic + [0, 1., 0]])
    room.compute_rir()
    n = int(cfg['sec'] * FS)
    ir = np.zeros((n, 2))
    for c in range(2):
        r = np.asarray(room.rir[c][0])[:n]
        ir[:len(r), c] = r
    # Remove the direct path: the engine renders it spatially. Keep reflections.
    direct = np.linalg.norm(mic - np.array(cfg['src'])) / pra.constants.get('c')
    start = int((direct + .012) * FS)
    ir[:start] = 0
    # Rough rock, scree and canopy smear every specular arrival into a short
    # diffuse cluster whose length grows with path length (more bounces, more
    # scattering). Convolve time slices with energy-normalised decaying noise.
    rng = np.random.default_rng(len(name) * 7919)
    seg = int(.05 * FS)
    out = np.zeros((n + int(4 * FS), 2))
    for s0 in range(0, n, seg):
        block = ir[s0:s0 + seg]
        if not np.any(block):
            continue
        t = s0 / FS
        tau = cfg.get('smear', .018) + .045 * t           # seconds
        L = int(tau * 5 * FS)
        for c in range(2):
            k = rng.standard_normal(L) * np.exp(-np.arange(L) / (tau * FS))
            k /= np.sqrt(np.sum(k ** 2))
            y = np.convolve(block[:, c], k)
            m = min(len(y), len(out) - s0)
            out[s0:s0 + m, c] += y[:m]
    ir = out[:n]
    # Gentle fade on the truncated end.
    fade = int(.25 * FS)
    ir[-fade:] *= np.linspace(1, 0, fade)[:, None]
    peak = np.max(np.abs(ir)) or 1
    energy = float(np.sqrt(np.sum(ir ** 2)))
    ir = ir / peak * .5
    wavfile.write(f'ir-{name}.wav', FS, (ir * 32767).astype(np.int16))
    # Report the echo structure: strongest arrivals after the direct sound.
    env = np.abs(ir).max(axis=1)
    idx = np.argsort(env)[::-1][:5]
    # Engine level: a source of gain g at reference distance ref drives the
    # reverb with g*ref; the file's raw scale is restored and 4*pi*r converts
    # the simulator's 1/(4 pi r) spreading to the engine's ref/r convention.
    return dict(name=name, seconds=cfg['sec'], energy=round(energy, 6), level=round(4 * np.pi * peak / .5, 6),
                first_reflection_ms=round((np.argmax(env > 1e-3) / FS) * 1000, 1),
                strongest_ms=sorted(round(i / FS * 1000) for i in idx))

if __name__ == '__main__':
    names = sys.argv[1:] or list(WORLDS)
    out = [simulate(n, WORLDS[n]) for n in names]
    print(json.dumps(out, indent=1))
