// Regional soundscapes: every world's water, weather, human presence and
// wildlife events, placed in survey space and rendered by makeSpatialAudio.
// Recordings are credited in soundscape-credits.txt. Thunder combines the
// moving squall's geometry with recordings of Pacific Northwest storms.
(() => {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = (a, b) => a + (b - a) * Math.random();
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const smooth = (a, b, x) => { const v = clamp((x - a) / (b - a), 0, 1); return v * v * (3 - 2 * v); };

  // Air the sound travels through (ISO 9613-1 inputs) and the simulated
  // reverberation class for each world (see ir-*.m4a, pyroomacoustics).
  const climate = {
    alaska: {tempC: 12, humidity: 85, ir: 'alaska'},     canyon: {tempC: 31, humidity: 14, ir: 'canyon'},
    swiss: {tempC: 14, humidity: 62, ir: 'swiss'},       winnipesaukee: {tempC: 23, humidity: 72, ir: 'lake', inversion: .15},
    surry: {tempC: 28, humidity: 74, ir: 'lake'},        dixville: {tempC: 3, humidity: 88, ir: 'dixville', inversion: .45},
    labrador: {tempC: 14, humidity: 90, ir: 'lake', inversion: .2}, moosehead: {tempC: 21, humidity: 70, ir: 'lake', inversion: .15},
    yosemite: {tempC: 25, humidity: 28, ir: 'yosemite'}, crater: {tempC: 9, humidity: 68, ir: 'crater'},
    lofoten: {tempC: 9, humidity: 84, ir: 'lofoten'},    acadia: {tempC: 16, humidity: 84, ir: 'lake', inversion: .24}
  };
  // Real coordinates for live air from Open-Meteo (CC BY 4.0). US worlds ask
  // for NOAA GFS/HRRR; others use the provider's best regional model.
  const site = {
    alaska: [58.418, -134.565, 'us'], canyon: [36.879, -111.510, 'us'], swiss: [46.498, 7.727], winnipesaukee: [43.585, -71.330, 'us'],
    surry: [43.006, -72.311, 'us'], dixville: [44.867, -71.305, 'us'], labrador: [50.747, -68.500], moosehead: [45.700, -69.730, 'us'],
    yosemite: [37.723, -119.637, 'us'], crater: [42.944, -122.109, 'us'], lofoten: [67.932, 13.089], acadia: [44.321, -68.187, 'us']
  };
  async function liveAir(region) {
    const key = 'aerie-air-' + region;
    try { const c = JSON.parse(localStorage.getItem(key) || 'null'); if (c && Date.now() - c.at < 30 * 60e3) return c.air; } catch (e) {}
    const [lat, lon, us] = site[region] || [];
    if (lat === undefined || !navigator.onLine) return null;
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
      '&current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m&hourly=temperature_80m,temperature_120m,wind_speed_80m,wind_speed_120m' +
      '&forecast_hours=1&wind_speed_unit=ms' + (us ? '&models=gfs_seamless' : '');
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const d = await (await fetch(url, {signal: ctrl.signal})).json(), c = d.current, h = d.hourly || {};
      const t2 = c.temperature_2m, tHigh = h.temperature_120m?.[0] ?? h.temperature_80m?.[0], zHigh = h.temperature_120m?.[0] != null ? 120 : 80;
      const wHigh = h.wind_speed_120m?.[0] ?? h.wind_speed_80m?.[0];
      // Lapse rate: stable air (warmer aloft than the standard -6.5 K/km) bends sound down.
      const lapse = tHigh != null ? (tHigh - t2) / (zHigh - 2) : -.0065;
      const air = {tempC: t2, humidity: c.relative_humidity_2m, pressure: c.surface_pressure / 10,
        inversion: clamp((lapse + .0065) / .015, 0, 1) * .6,
        windRefract: wHigh != null ? clamp((wHigh - c.wind_speed_10m) / (zHigh - 10) / .02, .3, 2.2) : 1,
        source: 'Open-Meteo ' + (us ? 'NOAA GFS/HRRR' : 'best match') + ' ' + c.time, lapse};
      try { localStorage.setItem(key, JSON.stringify({at: Date.now(), air})); } catch (e) {}
      return air;
    } catch (e) { return null; } finally { clearTimeout(timer); }
  }
  const irLevel = {canyon: .020, lofoten: .016, yosemite: .0013, swiss: .019, dixville: .088, alaska: .017, crater: .011, lake: .00012};

  // Two slow envelopes keep wave groups and canopy gusts from cycling together.
  function swell(t, phase) {
    return clamp(.5 + .29 * Math.sin(t * .53 + phase) + .20 * Math.sin(t * .21 - phase * 1.7), 0, 1);
  }

  // ---- placement helpers ------------------------------------------------------
  function ground(world, x, z) { return (world.elevation || world.height)(x, z); }
  function waterLevel(world) { return world.waterLevel ?? world.lakeLevel ?? null; }
  function isWet(world, x, z) {
    const g = ground(world, x, z);
    if (world.habitat?.wet) return world.habitat.wet(x, z, g);
    const w = waterLevel(world); return w != null && g <= w + .2;
  }
  function landmark(world, re) { return (world.landmarks || []).find(p => re.test(p.name)); }
  // Nearest water to a point, searched on rings (rivers have no polyline).
  function nearestWater(world, x, z, maxR = 1600, wet = (px, pz) => isWet(world, px, pz)) {
    if (wet(x, z)) return {x, z, d: 0};
    for (const r of [15, 30, 55, 90, 140, 210, 300, 420, 600, 850, 1200, 1600]) {
      if (r > maxR) break;
      let best = null;
      for (let i = 0; i < 24; i++) {
        const a = i / 24 * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (wet(px, pz)) { best = {x: px, z: pz, d: r}; break; }
      }
      if (best) return best;
    }
    return null;
  }
  // Find the waterline from either side when the world has no surveyed edge nearby.
  function nearestWaterline(world, x, z, maxR) {
    const wet = isWet(world, x, z);
    let previous = 0;
    for (const r of [10, 22, 38, 64, 100, 165, 285, 420, 600, maxR]) {
      if (r > maxR || r <= previous) continue;
      for (let i = 0; i < 16; i++) {
        const a = i * Math.PI / 8, dx = Math.cos(a), dz = Math.sin(a);
        if (isWet(world, x + dx * r, z + dz * r) === wet) continue;
        let lo = previous, hi = r;
        for (let j = 0; j < 7; j++) {
          const m = (lo + hi) / 2;
          if (isWet(world, x + dx * m, z + dz * m) === wet) lo = m; else hi = m;
        }
        const d = wet ? lo : hi;
        return {x: x + dx * d, z: z + dz * d, d};
      }
      previous = r;
    }
    return null;
  }
  // Two more water points about `span` metres either side of p (a river reach).
  function waterReach(world, p, span, wet = (px, pz) => isWet(world, px, pz)) {
    const out = [];
    for (let i = 0; i < 16 && out.length < 2; i++) {
      const a = i / 16 * Math.PI * 2, px = p.x + Math.cos(a) * span, pz = p.z + Math.sin(a) * span;
      if (wet(px, pz) && !out.some(o => Math.hypot(o.x - px, o.z - pz) < span)) out.push({x: px, z: pz});
    }
    return out;
  }
  function randomWaterNear(world, x, z, r0, r1) {
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(r0, r1), px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (isWet(world, px, pz)) return {x: px, z: pz};
    }
    return null;
  }
  function steepNear(world, x, z, r0, r1) {
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(r0, r1), px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      const g = ground(world, px, pz), slope = Math.hypot(ground(world, px + 4, pz) - g, ground(world, px, pz + 4) - g) / 4;
      if (slope > 1.1 && !isWet(world, px, pz)) return {x: px, y: g + 2, z: pz};
    }
    return null;
  }
  // A straight path that passes the listener at a chosen offset (flying birds).
  function passPath(ear, opt) {
    const heading = Math.random() * Math.PI * 2, dx = Math.cos(heading), dz = Math.sin(heading);
    const offset = rand(opt.offset[0], opt.offset[1]) * (Math.random() < .5 ? -1 : 1);
    const cx = ear.x - dz * offset, cz = ear.z + dx * offset;
    const half = opt.length / 2;
    return {ax: cx - dx * half, az: cz - dz * half, bx: cx + dx * half, bz: cz + dz * half, speed: opt.speed};
  }

  // ---- physical thunder ---------------------------------------------------------
  // A tortuous return-stroke channel radiates N-waves perpendicular to each
  // segment (Few 1969). Arrival times follow from distance; air absorption and
  // nonlinear stretching lengthen distant pulses; a ground image adds the
  // reflection. The result is mono, timed from the nearest point of the channel.
  function synthThunder(context, strike, cloudY, ear, absorption) {
    const fs = 22050, c = 343;
    const pts = [];
    let x = strike.x, y = cloudY, z = strike.z;
    const branches = [];
    while (y > strike.y && pts.length < 768) {
      const tx = strike.x - x, ty = strike.y - y, tz = strike.z - z, tl = Math.hypot(tx, ty, tz) || 1;
      // Mean tortuosity ~16 degrees between 5-15 m steps.
      let ux = tx / tl + rand(-.55, .55), uy = ty / tl + rand(-.25, .25), uz = tz / tl + rand(-.55, .55);
      const ul = Math.hypot(ux, uy, uz), step = rand(5, 15);
      x += ux / ul * step; y += uy / ul * step; z += uz / ul * step;
      pts.push([x, y, z, ux / ul, uy / ul, uz / ul]);
      if (Math.random() < .004 && branches.length < 4) branches.push([x, y, z, Math.floor(rand(60, 220))]);
    }
    for (const [bx, by, bz, n] of branches) {
      let px = bx, py = by, pz = bz, hx = rand(-1, 1), hz = rand(-1, 1);
      for (let i = 0; i < n; i++) {
        let ux = hx + rand(-.6, .6), uy = -.55 + rand(-.3, .3), uz = hz + rand(-.6, .6);
        const ul = Math.hypot(ux, uy, uz), step = rand(5, 12);
        px += ux / ul * step; py += uy / ul * step; pz += uz / ul * step;
        if (py < strike.y) break;
        pts.push([px, py, pz, ux / ul, uy / ul, uz / ul, .45]);
      }
    }
    const groundY = strike.y;
    let tmin = Infinity, tmax = 0;
    const arrivals = [];
    for (const p of pts) {
      for (const mirror of [0, 1]) {
        const ly = mirror ? 2 * groundY - ear.y : ear.y;
        const dx = p[0] - ear.x, dy = p[1] - ly, dz = p[2] - ear.z, r = Math.max(30, Math.hypot(dx, dy, dz));
        const cos = (dx * p[3] + dy * p[4] + dz * p[5]) / r;
        const radiate = Math.pow(Math.max(0, 1 - cos * cos), 1.5);
        const t = r / c;
        arrivals.push([t, (p[6] || 1) * radiate / r * (mirror ? .55 : 1), r]);
        tmin = Math.min(tmin, t); tmax = Math.max(tmax, t);
      }
    }
    const len = Math.ceil((tmax - tmin + 2.5) * fs);
    const buffer = context.createBuffer(1, len, fs), out = buffer.getChannelData(0);
    const cut1 = r => { // frequency where air takes 6 dB over this path
      let lo = Math.log(40), hi = Math.log(9000);
      for (let n = 0; n < 14; n++) { const m = (lo + hi) / 2; if (absorption(Math.exp(m)) * r > 6) hi = m; else lo = m; }
      return Math.exp((lo + hi) / 2);
    };
    for (const [t, a, r] of arrivals) {
      // N-wave half-duration grows with distance (weak-shock stretching).
      const T = .0035 * Math.pow(r / 100, .25);
      const n = Math.max(4, Math.round(2 * T * fs));
      const blur = Math.max(1, Math.round(fs / (2 * Math.PI * cut1(r))));
      const start = Math.round((t - tmin) * fs);
      for (let i = -blur * 2; i < n + blur * 2; i++) {
        let v = 0;
        // N-wave (+1 to -1 ramp) convolved with a short Gaussian (absorption).
        for (let k = -2; k <= 2; k++) {
          const j = i + k * blur * .5;
          if (j >= 0 && j < n) v += (1 - 2 * j / n) * Math.exp(-k * k / 2);
        }
        const idx = start + i;
        if (idx >= 0 && idx < len) out[idx] += a * v / 3.5;
      }
    }
    // Low rumble: thousands of arrivals plus the caldera's own reflections.
    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
    const s = .9 / (peak || 1);
    let lp = 0;
    for (let i = 0; i < len; i++) { lp += (out[i] * s - lp) * .35; out[i] = lp; }
    // Fade out the tail.
    const f = Math.floor(.4 * fs);
    for (let i = 0; i < f; i++) out[len - 1 - i] *= i / f;
    return {buffer, nearest: tmin * c};
  }

  // ---- procedural rain textures -----------------------------------------------
  // Drops on water excite a Minnaert bubble (rising chirp around 1-3 kHz);
  // drops on needles and leaves give short noisy ticks; on rock, a dry click.
  function synthRain(context, surface, density, seconds = 4) {
    const fs = Math.min(24000, context.sampleRate), len = Math.floor(seconds * fs);
    const buffer = context.createBuffer(2, len, fs);
    for (let ch = 0; ch < 2; ch++) {
      const out = buffer.getChannelData(ch);
      const count = Math.floor(density * seconds);
      for (let n = 0; n < count; n++) {
        const at = Math.floor(Math.random() * len), amp = Math.pow(Math.random(), 2.2) * .5 + .02;
        if (surface === 'water') {
          const f0 = rand(900, 3200), decay = rand(.006, .022), m = Math.floor(decay * 5 * fs);
          let ph = 0;
          for (let i = 0; i < m && at + i < len; i++) {
            const t = i / fs, f = f0 * (1 + 2.2 * t / decay * .1);
            ph += 2 * Math.PI * f / fs;
            out[at + i] += amp * .55 * Math.sin(ph) * Math.exp(-t / decay) + (i < 12 ? amp * (Math.random() - .5) * .6 : 0);
          }
        } else {
          const decay = surface === 'rock' ? .0012 : rand(.002, .006), m = Math.floor(decay * 6 * fs);
          let lp = 0, prev = 0;
          for (let i = 0; i < m && at + i < len; i++) {
            const w = Math.random() * 2 - 1; lp += (w - lp) * (surface === 'leaves' ? .55 : .8);
            const hp = lp - prev; prev = lp;
            out[at + i] += amp * hp * Math.exp(-i / fs / decay) * (surface === 'rock' ? 1.6 : 1);
          }
        }
      }
      // Diffuse hiss of distant drops underneath the near impacts.
      let b = 0;
      for (let i = 0; i < len; i++) { b += ((Math.random() * 2 - 1) - b) * .25; out[i] += b * .012 * Math.sqrt(density / 400); }
      const x = 2048; for (let i = 0; i < x; i++) out[len - x + i] = out[len - x + i] * (1 - i / x) + out[i] * (i / x);
    }
    return buffer;
  }

  // Single drops striking feathers right at the eagle's head: 3-9 ms ticks.
  function synthTicks(context, count = 8) {
    const fs = context.sampleRate, out = [];
    for (let n = 0; n < count; n++) {
      const len = Math.floor(rand(.004, .012) * fs), b = context.createBuffer(1, len, fs), d = b.getChannelData(0);
      let lp = 0, prev = 0; const k = rand(.35, .75), decay = rand(.0015, .004);
      for (let i = 0; i < len; i++) { lp += ((Math.random() * 2 - 1) - lp) * k; const hp = lp - prev; prev = lp; d[i] = hp * Math.exp(-i / fs / decay) * .8; }
      out.push(b);
    }
    return out;
  }

  // Airflow at the eagle's head: independent turbulence at each ear. The
  // upwind ear (sideslip, bank) is louder and brighter; gusts arrive as
  // turbulent bursts; above ~26 m/s the contour feathers flutter (AM noise).
  function makeAirflow(context, destination) {
    // The wind is a recording of air rushing over a cyclist's microphones on
    // a fast descent, shaped and levelled by airspeed. Until it has loaded,
    // shaped noise stands in for it.
    const fs = context.sampleRate, len = Math.floor(6 * fs), buf = context.createBuffer(2, len, fs);
    let rms = .1, real = false;
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch); let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) { // pink-ish (Kellet) noise
        const w = Math.random() * 2 - 1; b0 = .99765 * b0 + w * .099046; b1 = .963 * b1 + w * .2965164; b2 = .57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * .1848) * .12;
      }
      if (ch === 0) { let sum = 0; for (let i = 0; i < len; i++) sum += d[i] * d[i]; rms = Math.sqrt(sum / len); }
      for (let i = 0; i < 4096; i++) d[len - 4096 + i] = d[len - 4096 + i] * (1 - i / 4096) + d[i] * (i / 4096);
    }
    let src = context.createBufferSource(); src.buffer = buf; src.loop = true;
    const split = context.createChannelSplitter(2), merge = context.createChannelMerger(2), out = context.createGain();
    out.gain.value = 0;
    const ears = [0, 1].map(i => {
      const lp = context.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; lp.Q.value = .4;
      const g = context.createGain(); g.gain.value = 0;
      split.connect(lp, i); lp.connect(g).connect(merge, 0, i);
      return {lp, g};
    });
    src.connect(split); merge.connect(out).connect(destination);
    // Feather flutter: band-limited noise amplitude-modulated at 20-34 Hz.
    const band = context.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 260; band.Q.value = 1.6;
    const flutter = context.createGain(); flutter.gain.value = 0;
    const lfo = context.createOscillator(), depth = context.createGain(); lfo.frequency.value = 24; depth.gain.value = 0;
    lfo.connect(depth).connect(flutter.gain); src.connect(band).connect(flutter).connect(out);
    src.start(); lfo.start();
    let burst = 0;
    return {
      get real() { return real; },
      // Swap the stand-in noise for the recording once it has been decoded.
      adopt(recording) {
        if (real || !recording || recording.numberOfChannels < 2) return;
        const d = recording.getChannelData(0); let sum = 0, n = 0;
        for (let i = 0; i < d.length; i += 3) { sum += d[i] * d[i]; n++; }
        const next = context.createBufferSource(); next.buffer = recording; next.loop = true;
        next.connect(split); next.connect(band); next.start(0, Math.random() * recording.duration);
        try { src.stop(); src.disconnect(); } catch (e) {}
        src = next; rms = Math.sqrt(sum / n) || .1; real = true;
      },
      update(s, gust, now, v = Math.max(0, (s.indicatedAirspeed ?? s.airspeed) || 0)) {
        // Wind at the ears is the loudest thing in flight. Flow noise grows as
        // about the sixth power of airspeed in sound power (measured on
        // cyclists: 85 dBA at 6.7 m/s, 120 dBA at 27 m/s), so its amplitude
        // follows v^2.6: a whisper at 8 m/s, level with a loud call close by
        // at 15 m/s (about -23 dBFS), and held from 19 m/s so a dive cannot clip.
        const level = .068 * Math.pow(clamp(v, 0, 19) / 15, 2.6) * (real ? 1 : 1.35) / (rms * .32 * .86);
        // The recording was made at about cruising speed: slower air loses its
        // hiss, faster air keeps all of it.
        const reach = real ? clamp(1500 * Math.pow(2, (v - 8) / 3), 700, 12000) : 280 + 55 * v;
        const slip = clamp((s.yawSlip || 0) * 2.2 + (s.bank || 0) * .45, -1, 1);
        burst = burst * .9 + (Math.random() < (.02 + .08 * gust) ? rand(.3, .9) * gust : 0);
        // Each downstroke drives air past the head: the rush swells with it
        // and falls back on the upstroke, in time with the wings on screen.
        const swell = clamp(s.effort || 0, 0, 1.2) * Math.max(0, Math.sin((s.phase || 0) - .25)) ** 1.5;
        const turb = (1 + .3 * burst + .15 * (gust - .5)) * (1 + 1.5 * swell);
        ears.forEach((e, i) => {
          const side = i === 0 ? -slip : slip; // positive: this ear faces the airflow
          e.g.gain.setTargetAtTime(level * turb * (1 + .25 * side), now, .035);
          e.lp.frequency.setTargetAtTime(reach * (1 + .3 * side) + 900 * burst + 260 * swell, now, .08);
        });
        const flap = smooth(26, 42, v);
        flutter.gain.setTargetAtTime(.16 * flap, now, .1); // AM around this base: 0 to 2x
        depth.gain.setTargetAtTime(.16 * flap, now, .1);
        lfo.frequency.setTargetAtTime(20 + .35 * v, now, .2);
        band.frequency.setTargetAtTime(180 + 6 * v, now, .2);
        out.gain.setTargetAtTime(.32, now, .2);
      },
      stop(now) { out.gain.setTargetAtTime(0, now, .1); }
    };
  }

  // Small movement sounds of animals that are on the map: steps in grass and
  // litter, and swirls/splashes of fish at the surface.
  function synthRustle(context) {
    const fs = context.sampleRate, len = Math.floor(1.4 * fs), b = context.createBuffer(1, len, fs), d = b.getChannelData(0);
    let t = rand(.02, .1);
    while (t < 1.2) {
      const at = Math.floor(t * fs), n = Math.floor(rand(.025, .07) * fs), amp = rand(.25, .7);
      let lp = 0, prev = 0; const k = rand(.25, .55);
      for (let i = 0; i < n && at + i < len; i++) { lp += ((Math.random() * 2 - 1) - lp) * k; const hp = lp - prev; prev = lp; d[at + i] += amp * hp * Math.exp(-i / n * 4); }
      t += rand(.16, .38);
    }
    return b;
  }
  function synthSplash(context) {
    const fs = context.sampleRate, len = Math.floor(.7 * fs), b = context.createBuffer(1, len, fs), d = b.getChannelData(0);
    for (let i = 0; i < .03 * fs; i++) d[i] += (Math.random() * 2 - 1) * Math.exp(-i / fs / .008) * .6;
    for (let n = 0; n < 4; n++) {
      const at = Math.floor(rand(.01, .25) * fs), f0 = rand(700, 2100), dec = rand(.02, .05); let ph = 0;
      for (let i = 0; i < dec * 5 * fs && at + i < len; i++) { const tt = i / fs; ph += 2 * Math.PI * f0 * (1 + 1.5 * tt / dec * .1) / fs; d[at + i] += .4 * Math.sin(ph) * Math.exp(-tt / dec); }
    }
    return b;
  }
  function synthBlip(context) {
    const fs = context.sampleRate, len = Math.floor(.28 * fs), b = context.createBuffer(1, len, fs), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) { const t = i / fs; d[i] = (Math.random() * 2 - 1) * .5 * Math.exp(-t / .05) * (1 - Math.exp(-t / .002)); }
    return b;
  }
  const headProfiles = [['default', 'Dummy head (KU100, Omnitone default)'], ['fabian', 'Dummy head (FABIAN)'], ['small', 'Small head'],
    ['small-medium', 'Small to medium head'], ['medium', 'Medium head'], ['large-medium', 'Medium to large head'], ['large', 'Large head']];

  // ---- regional definitions -----------------------------------------------------
  // Events: clip, every [min,max] seconds, where(ctx) -> position or path,
  // gain at ref metres, reach in metres, optional when(ctx) condition.
  // Intervals follow what is known of each sound by day: an ovenbird sings
  // 0.5 to 1.7 songs a minute, a grouse drums every few minutes, a coyote
  // seldom howls before dusk, and rock does not fall every other minute.
  const at = (re, dy = 0, jitter = 0) => c => {
    const p = landmark(c.world, re); if (!p) return null;
    const x = p.x + rand(-jitter, jitter), z = p.z + rand(-jitter, jitter);
    return {x, y: ground(c.world, x, z) + dy, z};
  };
  const atWater = re => c => {
    const p = landmark(c.world, re); if (!p) return null;
    return {x: p.x, z: p.z, y: (waterLevel(c.world) ?? ground(c.world, p.x, p.z)) + .65};
  };
  // Placements marked stable name a habitat. Their callers keep fixed posts
  // in the world (see stablePost), so a bird heard on the approach is the
  // same bird, in the same tree, on the way back.
  const stable = fn => { fn.stable = true; return fn; };
  const onWater = (r0, r1, dy = .6) => stable(c => {
    const p = randomWaterNear(c.world, c.ear.x, c.ear.z, r0, r1); if (!p) return null;
    return {x: p.x, y: (waterLevel(c.world) ?? ground(c.world, p.x, p.z)) + dy, z: p.z};
  });
  const onCliff = (r0, r1) => stable(c => steepNear(c.world, c.ear.x, c.ear.z, r0, r1));
  const inSky = (above, offset, length, speed) => c => {
    const path = passPath(c.ear, {offset, length, speed});
    const y = Math.max(c.ear.y, ground(c.world, c.ear.x, c.ear.z)) + rand(above[0], above[1]);
    return {path: {...path, y}};
  };
  const acrossWater = (offset, length, speed) => c => {
    const p = randomWaterNear(c.world, c.ear.x, c.ear.z, offset[0], offset[1]); if (!p) return null;
    const h = Math.random() * Math.PI * 2, dx = Math.cos(h), dz = Math.sin(h);
    const y = (waterLevel(c.world) ?? ground(c.world, p.x, p.z)) + 1;
    return {path: {ax: p.x - dx * length / 2, az: p.z - dz * length / 2, bx: p.x + dx * length / 2, bz: p.z + dz * length / 2, speed, y}};
  };
  const fixed = (x, y, z) => c => ({x, y: y ?? ground(c.world, x, z) + 2, z});
  const inTrees = (r0, r1, frac = .6) => stable(c => {
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(r0, r1), x = c.ear.x + Math.cos(a) * r, z = c.ear.z + Math.sin(a) * r;
      const t = c.world.habitat?.nearestTree?.(x, z, 40);
      if (t) return {x: t.x, y: t.y + t.height * frac, z: t.z};
    }
    return null;
  });
  const onGround = (r0, r1, maxSlope = Infinity) => stable(c => {
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(r0, r1), x = c.ear.x + Math.cos(a) * r, z = c.ear.z + Math.sin(a) * r;
      if (isWet(c.world, x, z)) continue;
      const g = ground(c.world, x, z);
      if (Number.isFinite(maxSlope) && Math.hypot(ground(c.world, x + 5, z) - g, ground(c.world, x, z + 5) - g) > 5 * maxSlope) continue;
      return {x, y: g + .5, z};
    }
    return null;
  });

  const regionalHabitats = {
    canopy: {where: inTrees(15, 115, .68), ref: 14, reach: 270},
    understory: {where: inTrees(15, 110, .2), ref: 12, reach: 225},
    meadow: {where: onGround(12, 100, .7), ref: 10, reach: 210},
    cliff: {where: onCliff(18, 150), ref: 20, reach: 430},
    water: {where: onWater(20, 150, .8), ref: 25, reach: 480},
    shore: {where: stable(c => {
      const p = nearestWaterline(c.world, c.ear.x, c.ear.z, 160);
      return p && {x: p.x, z: p.z, y: (waterLevel(c.world) ?? ground(c.world, p.x, p.z)) + .5};
    }), ref: 16, reach: 330}
  };

  // ---- directional logic shared with the checks ---------------------------------
  // Songbirds and frogs fall silent when a raptor is close; jays, chickadees,
  // squirrels, waterfowl and corvids do not (they scold or sound the alarm).
  function hushRadius(name) {
    if (/frog|peeper|toad/.test(name)) return 60;
    if (/sparrow|thrush|veery|vireo|warbler|ovenbird|wren|kinglet|catbird|junco|robin|pipit|dunnock|accentor|wagtail|bluebird|bellbird|tomtit|fantail|black-throated|apapane|poorwill|grouse/.test(name)) return 45;
    return 0;
  }
  // How deep the eagle sits in the wind shadow of terrain: 0 in the open, 1 in
  // deep lee. The skyline is measured upwind from the eagle's own height, so
  // the rock that shelters a bird low against its face does nothing for one
  // above the summit.
  function leeShelter(world, x, y, z) {
    const wind = world.windField?.direction; if (!wind) return 0;
    let skyline = -1;
    for (const r of [45, 110, 220, 400, 650]) skyline = Math.max(skyline, (ground(world, x - wind.x * r, z - wind.z * r) - y) / r);
    return smooth(.03, .42, skyline);
  }
  // Wind noise at the ears, as a level comparable to a source's arriving level:
  // it grows steeply with airspeed, more in gusts and in the open, and falls
  // away in the lee of terrain. At cruising speed it covers all but loud,
  // close calls, as the wind does for anything that flies; a slow glide or a
  // perch lets the world back in.
  function windMasker(airspeed, gust = .5, exposure = 1, lee = 0) {
    const open = clamp(exposure, 0, 1) * (1 - .8 * clamp(lee, 0, 1));
    return .29 * Math.pow(clamp(airspeed / 17.5, 0, 3), 2.6) * (1 + .6 * clamp(gust, 0, 1) * (1 - .7 * clamp(lee, 0, 1))) * (.35 + .65 * open);
  }
  // A repeatable random stream for one world cell, so a post is always found in the same place.
  function seededRandom(a, b, c) {
    let h = (Math.imul(a + 374761393, 668265263) ^ Math.imul(b + 1274126177, 2246822519) ^ Math.imul(c + 3266489917, 3266489917)) >>> 0;
    return () => { h = (Math.imul(h ^ (h >>> 15), 2246822519) + 374761393) >>> 0; h ^= h >>> 13; return (((Math.imul(h, 3266489917) >>> 0) ^ (h >>> 16)) >>> 0) / 4294967296; };
  }
  const POST_CELL = 160;      // metres; one post per caller kind per cell
  function postFor(where, index, ix, iz, context, cell = POST_CELL) {
    const centre = {x: (ix + .5) * cell, y: context.ear.y, z: (iz + .5) * cell};
    const random = Math.random;
    Math.random = seededRandom(index, ix, iz);
    try { return where(Object.assign({}, context, {ear: centre})); } finally { Math.random = random; }
  }
  window.aerieSoundLogic = {hushRadius, windMasker, leeShelter, postFor, POST_CELL};

  const nearEar = (r = 1.6) => c => ({x: c.ear.x + rand(-r, r), y: c.ear.y + rand(-.4, .7), z: c.ear.z + rand(-r, r)});
  const lowAndLeafy = c => c.agl < 18 && !c.overWater;
  // Short bouts from real ground posts; never carry these small animals high
  // into the flight mix. The quieter eastern and Yosemite recordings need
  // extra presence, rather than bringing up the whole regional bed.
  const chipmunk = (clip, every, gain) => ({
    clip, every, gain, ref: 22, reach: 150, wet: .22, masking: .32,
    echo: false, nearest: 105, cell: 96, initial: [3, 8], retry: [1.5, 3.5],
    when: c => c.agl < 85, where: onGround(8, 40, 1.15)
  });
  // Levels were set against real recordings of each kind of place (a minute
  // from a perch in every world, compared band by band): the Sierra cicadas
  // stood 20 dB above anything in a real Sierra valley at 8 kHz. Singers of
  // the night (katydids, tree crickets, dusk crickets) keep quiet under a
  // high sun.
  // Insect choruses: several emitters seeded in the right habitat around the
  // eagle (canopy for cicadas and katydids, grass for crickets and
  // grasshoppers), re-seeded as the bird moves on.
  const scapes = {
    alaska: {
      falls: {clip: 'scape-alaska-nugget-falls', ref: 70, reach: 3200, gain: .95},
      beds: [{clip: 'landscape-alaska-rainforest-chorus', gain: c => .18 * c.canopy * (1 - smooth(24, 120, c.agl))}],
      loops: [
        {clip: 'landscape-alaska-glacier-shore-drips', ref: 8, reach: 240, gain: .54, where: atWater(/Blue Ice Passage/)},
        {clip: 'landscape-alaska-bergy-seltzer', ref: 4, reach: 95, gain: .39, where: atWater(/Mendenhall Glacier/)},
        {clip: 'landscape-alaska-alder-drip', ref: 9, reach: 235, gain: .42, where: at(/Steep Creek salmon boardwalk/, 1)}
      ],
      events: [
        // Calving at the terminus; booms carry across the lake with a delay.
        {clip: ['scape-alaska-calving', 'scape-alaska-calving-alt'], every: [120, 320], ref: 450, reach: 9000, gain: .9, wet: .9,
          where: c => { const g = landmark(c.world, /Mendenhall Glacier/); const p = landmark(c.world, /Blue Ice/);
            if (!g) return null; const t = Math.random(); const x = (p ? p.x : g.x) + rand(-520, 520), z = (p ? p.z : g.z) + rand(-120, 160);
            return {x, y: (waterLevel(c.world) ?? 0) + rand(8, 40), z}; }},
        {clip: 'scape-alaska-pacific-wren', every: [18, 40], ref: 12, reach: 320, gain: .55, where: inTrees(40, 250, .1)},
        {clip: 'landscape-alaska-steep-creek-salmon', every: [28, 80], initial: [3, 8], ref: 11, reach: 190, gain: .58,
          when: c => c.agl < 90 && !!c.world.steepCreek?.fish?.length,
          where: c => { const p = c.world.steepCreek?.landmark; return p && {x: p.approach[2], z: p.approach[3], y: ground(c.world, p.approach[2], p.approach[3]) + .65}; }},
        {clip: 'scape-alaska-arctic-tern', every: [22, 55], ref: 25, reach: 700, gain: .55, where: onWater(80, 600, 6)}
      ]
    },
    canyon: {
      // Riffles at the sandbars; the Glen Canyon tailwater is otherwise smooth and quiet.
      water: [{clip: 'scape-canyon-colorado-river', kind: 'river', ref: 20, reach: 900, gain: .7, maxR: 800, span: 140}],
      beds: [{clip: 'scape-canyon-canyon-wind', ref: 1, gain: c => .10 + .38 * c.exposure * (.6 + .5 * c.gust)}],
      choruses: [{clip: 'scape-canyon-apache-cicada', habitat: 'trees', count: 3, r: [25, 160], ref: 14, reach: 600, gain: .5},
                 {clip: 'scape-canyon-desert-crickets', night: true, habitat: 'grass', count: 4, r: [15, 120], ref: 10, reach: 380, gain: .45}],
      events: [
        {clip: 'scape-canyon-swifts', every: [9, 22], ref: 15, reach: 500, gain: .65, moving: true,
          where: c => { const path = passPath(c.ear, {offset: [20, 160], length: 420, speed: 28}); return {path: {...path, y: c.ear.y + rand(-40, 40)}}; }},
        {clip: 'scape-canyon-swallows', every: [16, 34], ref: 10, reach: 280, gain: .5, where: onCliff(40, 300)},
        {clip: 'scape-canyon-rockfall', every: [600, 1500], ref: 30, reach: 1400, gain: .7, where: onCliff(120, 700)}
      ]
    },
    swiss: {
      falls: {clip: 'scape-swiss-alpine-falls', ref: 45, reach: 2400, gain: .85},
      fallTakes: [{clip: 'landscape-swiss-isenthal-riffles', where: /tributary/i}],
      beds: [{clip: 'scape-swiss-alpine-wind', ref: 1, gain: c => .06 + .32 * c.exposure * (.6 + .5 * c.gust)}],
            choruses: [{clip: 'scape-swiss-alpine-grasshoppers', habitat: 'grass', count: 4, r: [12, 110], ref: 8, reach: 300, gain: .45}],
      events: [
        {clip: 'scape-swiss-black-redstart', every: [16, 34], ref: 12, reach: 320, gain: .55, where: onCliff(40, 300)},
        {clip: 'scape-swiss-water-pipit', every: [18, 40], ref: 10, reach: 260, gain: .5, where: onGround(40, 250)},
        {clip: 'scape-swiss-rockfall-alps', every: [480, 1200], ref: 60, reach: 4000, gain: .7, wet: .9, where: onCliff(400, 1800)}
      ]
    },
    yosemite: {
      falls: {clip: 'scape-yosemite-yosemite-falls', ref: 150, reach: 6000, gain: .95},
      fallTakes: [{clip: 'landscape-yosemite-sentinel-waterfall', where: /Lower Yosemite|Middle Cascades/i}],
      beds: [{clip: 'landscape-yosemite-sentinel-wind', gain: c => .27 * c.exposure * (.4 + .6 * c.gust)}],
      water: [{clip: 'scape-yosemite-merced-river', kind: 'river', ref: 28, reach: 1200, gain: .75, maxR: 900, span: 120}],
      choruses: [{clip: 'scape-yosemite-sierra-cicada', habitat: 'trees', count: 2, r: [25, 170], ref: 12, reach: 500, gain: .15},
                 {clip: 'scape-yosemite-dusk-crickets', night: true, habitat: 'grass', count: 4, r: [15, 120], ref: 10, reach: 380, gain: .4}],
      events: [
        {clip: 'scape-yosemite-coyote', every: [600, 1500], ref: 90, reach: 3500, gain: .6, wet: .8, where: onGround(500, 1600)},
        {clip: 'scape-yosemite-brewers-blackbird', every: [16, 36], ref: 12, reach: 300, gain: .5, where: at(/El Capitan Meadow/, 1, 250)},
        {clip: 'scape-yosemite-steller-jay-yosemite', every: [26, 60], ref: 18, reach: 450, gain: .5, where: inTrees(50, 350, .7)},
        chipmunk('scape-yosemite-chipmunk', [36, 75], .85),
        {clip: 'landscape-yosemite-rockslide', every: [900, 2400], ref: 120, reach: 6000, gain: .6, wet: 1, where: onCliff(600, 2500)},
        {clip: 'landscape-yosemite-branch-snap', every: [100, 320], ref: 14, reach: 280, gain: .56,
          when: c => c.agl < 125 && c.gust > .55, where: inTrees(25, 165, .76)}
      ]
    },
    crater: {
      storm: {cloudY: 3000},
      beds: [{clip: 'scape-crater-rim-wind', ref: 1, gain: c => .08 + .36 * c.exposure * (.6 + .5 * c.gust)}],
      events: [
        chipmunk('scape-crater-chipmunk', [43, 90], .66)
      ]
    },
    lofoten: {
      water: [{clip: 'landscape-lofoten-fredvang-surf', alternates: ['landscape-lofoten-nusfjord-lap'], kind: 'shore', ref: 25, reach: 900, gain: .68, maxR: 700, span: 160,
        select: c => {
          const harbor = landmark(c.world, /Reine fishing quay/);
          return harbor && Math.hypot(c.ear.x - harbor.x, c.ear.z - harbor.z) < 650
            ? 'landscape-lofoten-nusfjord-lap' : 'landscape-lofoten-fredvang-surf';
        }}],
      loops: [{clip: 'scape-lofoten-waves-rocks', ref: 22, reach: 400, gain: .42, where: atWater(/^Hamnøy$/)}],
      events: [
        {clip: 'scape-lofoten-white-tailed-eagle', every: [300, 800], ref: 40, reach: 1600, gain: .6, wet: .7, where: onCliff(200, 900)},
        {clip: 'scape-lofoten-arctic-tern-colony', every: [30, 70], ref: 30, reach: 800, gain: .55, where: onWater(100, 600, 4)}
      ]
    },
    acadia: {
      // A soft, enclosed cove, an exposed Atlantic headland, and a cobble bank
      // have different scale and reach. The fixed emitters use acoustic
      // path length, cliff occlusion, marine humidity and wind masking.
      loops: [
        {clip: 'scape-acadia-cove', ref: 15, reach: 460, gain: .70, where: fixed(600, .45, -979)},
        {clip: 'scape-acadia-ledge', ref: 36, reach: 1250, gain: .85, where: fixed(68, .55, 1072)},
        {clip: 'landscape-acadia-storm-surf', ref: 34, reach: 1000, gain: .62, where: fixed(93, .5, 985),
          level: c => smooth(.42, .78, c.gust) * (.4 + .6 * (c.world.acadiaCoast?.surge(c.t) ?? 0))},
        {clip: 'scape-acadia-cobbles', ref: 12, reach: 275, gain: .67, where: fixed(-84, 1.4, 490)},
        {clip: 'scape-acadia-cove', ref: 11, reach: 360, gain: .38, where: fixed(61, .7, -26)},
        // Extend the park recordings to measured tidal edges around the two
        // offshore stations. Each source fades in by distance from real surf.
        {clip: 'scape-acadia-cobbles', ref: 12, reach: 275, gain: .53, where: fixed(3976.5, .5, -3788.5)},
        {clip: 'scape-acadia-ledge', ref: 29, reach: 840, gain: .63, where: fixed(4101.5, .6, -3814.5)},
        {clip: 'scape-acadia-cove', ref: 14, reach: 290, gain: .57, where: fixed(-1066.5, .5, 8407.5)},
        {clip: 'scape-acadia-ledge', ref: 30, reach: 960, gain: .67, where: fixed(-544.5, .6, 9284.5)},
        {clip: 'scape-acadia-cobbles', ref: 12, reach: 225, gain: .55, where: fixed(-208.5, .5, 9022.5)}
      ],
      surge: {clip: 'scape-acadia-chamber', where: c => c.world.acadiaCoast.thunder, ref: 40, reach: 1150},
      choruses: [{clip: 'scape-acadia-spruce', foliage: true, habitat: 'trees', count: 3, r: [18,145], ref: 12, reach: 235, gain: .43}]
    },
    winnipesaukee: {
      choruses: [{clip: 'scape-winnipesaukee-snowy-tree-cricket', night: true, rate: 1.11 /* Dolbear's law: recorded at 21 C, sung at 23 C */, habitat: 'trees', count: 3, r: [15, 140], ref: 9, reach: 350, gain: .45},
                 {clip: 'scape-winnipesaukee-true-katydid', night: true, habitat: 'trees', count: 3, r: [20, 160], ref: 12, reach: 450, gain: .45}],
      // Creaking boards and moored hulls at the modeled Weirs Beach and Alton Bay docks.
      loops: [{clip: 'scape-winnipesaukee-dock-creak', ref: 7, reach: 260, gain: .55, where: at(/Weirs Beach Boardwalk/, 1, 0)},
              {clip: 'scape-winnipesaukee-dock-creak', ref: 7, reach: 260, gain: .5, where: at(/Alton Bay Water Bandstand/, 1, 0)},
              {clip: 'scape-winnipesaukee-dock-creak', ref: 7, reach: 180, gain: .42, where: at(/Cate Park town docks/, 1, 0)},
              {clip: 'scape-winnipesaukee-dock-creak', ref: 7, reach: 180, gain: .42, where: at(/Hesky Park town docks/, 1, 0)}],
      events: [
        {clip: 'scape-winnipesaukee-veery', every: [18, 40], ref: 15, reach: 400, gain: .55, where: inTrees(40, 300, .2)},
        {clip: 'scape-winnipesaukee-wood-thrush', every: [20, 45], ref: 18, reach: 450, gain: .55, where: inTrees(40, 300, .4)},
        chipmunk('scape-winnipesaukee-chipmunk', [29, 64], .86)
      ]
    },
    surry: {
      water: [{clip: 'scape-surry-ashuelot-riffles', kind: 'river', ref: 16, reach: 600, gain: .65, maxR: 500, span: 90}],
      loops: [{clip: 'scape-surry-dam-outlet', ref: 55, reach: 2400, gain: .85, where: at(/Surry Mountain Dam/, 4, 0)}],
      choruses: [{clip: 'scape-surry-dog-day-cicada', habitat: 'trees', count: 4, r: [20, 170], ref: 16, reach: 650, gain: .5},
                 {clip: 'scape-surry-meadow-katydid', habitat: 'grass', count: 3, r: [12, 110], ref: 8, reach: 300, gain: .4}],
      events: [
        {clip: 'scape-surry-town-church-bell', repeat: [3, 7], spacing: 3.4, every: [900, 1800], ref: 220, reach: 7000, gain: .6, wet: .7, where: c => ({x: 1860, y: ground(c.world, 1860, 4290) + 24, z: 4290})},
        {clip: 'scape-surry-gray-catbird', every: [20, 45], ref: 12, reach: 300, gain: .5, where: inTrees(30, 220, .25)},
        {clip: 'scape-surry-song-sparrow', every: [16, 38], ref: 12, reach: 320, gain: .5, where: onGround(30, 250)},
        {clip: 'scape-surry-gray-treefrog', every: [120, 300], ref: 12, reach: 280, gain: .45, where: inTrees(20, 200, .15)},
        chipmunk('scape-winnipesaukee-chipmunk', [29, 64], .86)
      ]
    },
    dixville: {
      falls: {clip: 'landscape-dixville-nh-brook', ref: 13, reach: 520, gain: .65},
      beds: [{clip: 'scape-dixville-dry-leaves', ref: 1, gain: c => (.06 + .22 * c.gust) * c.canopy}],
      events: [
        {clip: 'scape-dixville-white-throated-sparrow', every: [14, 30], ref: 16, reach: 420, gain: .6, where: inTrees(40, 300, .2)},
        {clip: 'scape-dixville-ruffed-grouse-drum', every: [180, 360], ref: 25, reach: 700, gain: .55, where: onGround(80, 500)},
        {clip: 'scape-dixville-canada-geese-migrating', every: [400, 1000], ref: 60, reach: 2500, gain: .55, moving: true, where: inSky([150, 380], [50, 600], 3000, 18)},
        {clip: 'scape-dixville-pileated-woodpecker', every: [150, 400], ref: 30, reach: 900, gain: .55, where: inTrees(80, 500, .6)},
        {clip: 'scape-dixville-blue-jay', every: [24, 55], ref: 20, reach: 500, gain: .55, where: inTrees(40, 350, .7)},
        // Eastern chipmunks are still above ground in late autumn, but call less.
        chipmunk('scape-winnipesaukee-chipmunk', [55, 110], .78)
      ]
    },
    labrador: {
      shower: true, rainSurfaces: ['lake', 'spruce'],
      // GRHQ line and lidar profile put these emitters on three separate short sills.
      loops: [
        {clip: 'scape-cabert-brook', ref: 9, reach: 145, gain: .48, where: fixed(-3718.6, 379.9, 1330.8)},
        {clip: 'scape-cabert-sill', ref: 13, reach: 190, gain: .67, where: fixed(-3661.7, 375.1, 1364.2)},
        {clip: 'scape-cabert-brook', ref: 13, reach: 180, gain: .65, where: fixed(-3523.1, 367.3, 1450.2)},
        {clip: 'scape-labrador-cabin-rain', ref: 9, reach: 145, gain: .58, where: at(/South Camp cabin/, 3.4),
          level: (c, p) => c.world.windField?.weatherAt?.(p.x, p.y, p.z, c.t)?.rain ?? c.rain}
      ],
      events: [
        {clip: 'scape-labrador-mosquitoes', every: [16, 36], ref: 1.2, reach: 20, gain: .35, when: lowAndLeafy, where: nearEar()},
        {clip: 'scape-labrador-swainsons-thrush', every: [16, 34], ref: 16, reach: 420, gain: .6, where: inTrees(40, 300, .4)},
        {clip: 'scape-labrador-boreal-chickadee', every: [24, 55], ref: 10, reach: 250, gain: .5, where: inTrees(30, 220, .5)},
        {clip: 'scape-labrador-white-throated-sparrow-qc', every: [18, 42], ref: 16, reach: 420, gain: .55, where: inTrees(40, 320, .2)}
      ]
    },
    moosehead: {
      choruses: [{clip: 'scape-moosehead-field-crickets', habitat: 'grass', count: 4, r: [15, 120], ref: 10, reach: 380, gain: .3}],
      events: [
        {clip: 'scape-moosehead-ovenbird', every: [30, 70], ref: 16, reach: 420, gain: .55, where: inTrees(40, 300, .15)},
        {clip: 'scape-moosehead-black-throated-green', every: [20, 45], ref: 12, reach: 300, gain: .5, where: inTrees(40, 260, .8)},
        {clip: 'scape-moosehead-red-breasted-nuthatch', every: [24, 55], ref: 8, reach: 200, gain: .45, where: inTrees(30, 200, .7)},
        chipmunk('scape-winnipesaukee-chipmunk', [29, 64], .86)
      ]
    }
  };
  window.aerieSoundscapes = scapes;

  // Rain at a point, 0 to 1: inside the Lac Berte sun shower or the Crater
  // Lake storm bank. The eagle's motion uses this too, with or without sound.
  window.aerieRainAt = function aerieRainAt(world, region, x, z, t) {
    const spec = scapes[region] || {};
    if (spec.shower) {
      const mark = landmark(world, /rainbow|shower|arc-en-ciel/i); if (!mark || !world.windField) return 0;
      const f = world.windField, shift = 240 * Math.sin(t * f.advection / 240);
      const cx = mark.x + f.direction.x * shift, cz = mark.z + f.direction.z * shift;
      const sun = world.sunDirection, ax = -sun.x, az = -sun.z, al = Math.hypot(ax, az) || 1;
      const axisX = ax / al, axisZ = az / al, sideX = -axisZ, sideZ = axisX;
      const dx = x - cx, dz = z - cz, across = dx * sideX + dz * sideZ, along = dx * axisX + dz * axisZ;
      return (1 - smooth(140, 470, Math.abs(along))) * (1 - smooth(650, 1600, Math.abs(across)));
    }
    if (spec.storm) { const d = window.aerieCalderaStormDepth?.(x, z, t) ?? -7000; return smooth(-310, 330, d) * (1 - smooth(4700, 7400, d)); }
    return 0;
  };

  window.makeSoundscape = function makeSoundscape(context, world, region, destination) {
    const spec = scapes[region] || {}, air = climate[region] || {};
    const banks = (window.aerieRegionalRecordings?.[region] || []).map(bank => ({...regionalHabitats[bank.habitat], ...bank}));
    const engine = window.makeSpatialAudio(context, world, {climate: air});
    engine.setSurveyPath(window.aerieSoundPath);
    // The 3D field carries the world; the head-locked wind layers step back ~4 dB.
    window.aerieWindTrim = .62;
    // Today's air at the real location, when reachable; the stored climate otherwise.
    liveAir(region).then(airNow => { if (airNow) { engine.setClimate(airNow); engine.live = airNow; } });
    engine.output.connect(destination);
    const buffers = new Map(), loading = new Map(), recentRegional = new Set();
    // Regional wildlife streams on demand. Holding the most recent eight decoded
    // recordings bounds RAM even on a long mobile flight through many habitats.
    function regionalBuffer(id) {
      recentRegional.delete(id); recentRegional.add(id);
      if (recentRegional.size > 8) {
        const oldest = recentRegional.values().next().value;
        recentRegional.delete(oldest); buffers.delete(oldest);
      }
      return load(id);
    }
    function load(id) {
      if (buffers.has(id)) return Promise.resolve(buffers.get(id));
      if (loading.has(id)) return loading.get(id);
      const name = id + '.m4a';
      // A hosted build short of space may leave recordings out; fetch those
      // from the public repository instead (offline builds embed them all).
      const mirror = 'https://raw.githubusercontent.com/TheComplianceAide/aerie-eagle-flight/main/game/' + name;
      const get = url => fetch(url).then(r => { if (!r.ok) throw Error('missing ' + name); return r.arrayBuffer(); });
      const local = window.aerieAssetURL?.(name) || name;
      const task = get(local).catch(e => local.startsWith('blob:') || location.protocol === 'file:' ? Promise.reject(e) : get(mirror))
        .then(d => context.decodeAudioData(d))
        .then(b => { buffers.set(id, b); return b; })
        .catch(() => { buffers.set(id, null); return null; })
        .finally(() => loading.delete(id));
      loading.set(id, task); return task;
    }
    const ids = new Set();
    const listClips = c => Array.isArray(c) ? c : [c];
    for (const e of spec.events || []) listClips(e.clip).forEach(id => ids.add(id));
    for (const g of [spec.falls, spec.surge, ...(spec.fallTakes || []), ...(spec.water || []), ...(spec.beds || []), ...(spec.loops || []), ...(spec.choruses || [])]) if (g) ids.add(g.clip);
    for (const w of spec.water || []) for (const id of w.alternates || []) ids.add(id);
    for (const id of ids) load(id);
    load('ir-' + (air.ir || 'lake')).then(b => engine.setImpulse(b, (irLevel[air.ir || 'lake'] || .0002) * 7.5));
    for (const surface of spec.rainSurfaces || []) load('scape-' + region + '-rain-on-' + surface);
    if (spec.rainAmbience) load(spec.rainAmbience);
    if (spec.storm) load('scape-' + region + '-rain-approach');
    if (spec.storm) load('rain-steady');
    if (spec.storm) { load('scape-crater-thunder-near'); load('scape-crater-thunder-far'); }

    // Existing regional beds handed over by field-audio.js become 3D sources.
    // A world's own recording takes priority; the generic bed is the fallback.
    const fallback = {}, extraWater = [], extraBeds = [];
    const clipOf = g => g.buffer || buffers.get(g.clip) || null;
    function adopt(role, buffer) {
      if (!buffer) return false;
      if (role === 'lake' || role === 'surf' || role === 'inlet') {
        // A world's own shore recording wins; the existing bed is its fallback.
        if ((spec.water || []).some(w => w.kind === 'shore')) { fallback.shore = fallback.shore || buffer; return true; }
        if (!extraWater.some(w => w.role === role)) extraWater.push({role, buffer, kind: 'shore', ref: role === 'lake' ? 16 : 28, reach: role === 'lake' ? 650 : 1000, gain: role === 'lake' ? .7 : .85, maxR: 700, span: 150});
        // Small wavelets directly below when skimming open water.
        if (role === 'lake' && !extraBeds.some(b => b.role === 'wavelets'))
          extraBeds.push({role: 'wavelets', buffer, height: -8, gain: c => c.overWater ? .20 * (1 - smooth(5, 38, c.waterClearance)) * (.45 + .45 * c.gust + .35 * swell(c.t, 3.2)) * (.5 + .5 * smooth(8, 95, c.shoreRange)) : 0});
        return true;
      }
      if (role === 'cascade') { fallback.falls = buffer; return true; }
      if (role === 'river') {
        if ((spec.water || []).some(w => w.kind === 'river')) { fallback.river = buffer; return true; }
        if (!extraWater.some(w => w.role === role)) extraWater.push({role, buffer, kind: 'river', ref: 20, reach: 900, gain: .65, maxR: 700, span: 110});
        return true;
      }
      if (role === 'canopy') {
        if (!extraBeds.some(b => b.role === role)) extraBeds.push({role, buffer, height: -4, gain: c =>
          (.035 + .22 * c.gust + .48 * c.canopyMotion) * c.canopy * (1 - .55 * c.lee)});
        return true;
      }
      return false;
    }
    // Insect patches are fixed in the world like the callers' posts: one per
    // chorus kind in each 60 m cell with the right habitat, each with its own
    // pitch and level, so the crickets left behind are the crickets found
    // again on the way back.
    const PATCH = 60;
    function chorusPatch(ch, k, sounding) {
      const ear = engine.ear, ix0 = Math.floor(ear.x / PATCH), iz0 = Math.floor(ear.z / PATCH), span = Math.ceil(ch.r[1] / PATCH), free = [];
      for (let ix = ix0 - span; ix <= ix0 + span; ix++) for (let iz = iz0 - span; iz <= iz0 + span; iz++) {
        const key = 'chorus' + k + ':' + ix + ':' + iz;
        let patch = state.posts.get(key);
        if (patch === undefined) {
          if (state.posts.size > 1500) state.posts.clear();
          const random = seededRandom(1000 + k, ix, iz), x = (ix + random()) * PATCH, z = (iz + random()) * PATCH;
          patch = null;
          if (!isWet(world, x, z)) {
            if (ch.habitat === 'forest-edge') {
              const y = ground(world, x, z);
              if (y > (waterLevel(world) ?? 0) + 3 && world.habitat?.nearestTree?.(x, z, 30)) patch = {x, y: y + .3, z};
            } else if (ch.habitat !== 'trees') patch = {x, y: ground(world, x, z) + .3, z};
            else { const t = world.habitat?.nearestTree?.(x, z, 30); if (t) patch = {x: t.x, y: t.y + t.height * (.4 + .45 * random()), z: t.z}; }
          }
          if (patch) Object.assign(patch, {key, gain: .7 + .45 * random(), rate: .97 + .06 * random(), phase: random() * Math.PI * 2});
          state.posts.set(key, patch);
        }
        if (!patch || sounding.some(e => e.patch === key)) continue;
        const d = Math.hypot(patch.x - ear.x, patch.z - ear.z);
        if (d >= ch.r[0] && d <= ch.r[1]) free.push(patch);
      }
      return free.length ? free[Math.floor(Math.random() * free.length)] : null;
    }
    let enabled = false;
    const state = {falls: new Map(), water: [], beds: [], loops: [], choruses: [], movers: new Set(), rain: null, due: new Map(),
      posts: new Map(), singers: new Map(), voices: new Set(), thunder: new Set()};
    let foreground = null, foregroundUntil = 0, perchSince = -Infinity, perched = false;
    // All three wildlife schedulers share this gate. Visible alarms bypass it
    // and push an incidental phrase into the background while they answer.
    function canVoice(now = context.currentTime) {
      return now >= foregroundUntil && (ctx?.rain ?? 0) < .72;
    }
    function noteVoice(source, tail = 1.1, priority = false) {
      const now = context.currentTime;
      if (priority && foreground?.source !== source && foreground?.source.alive && !foreground.priority) {
        const quieted = foreground.source;
        quieted.gain *= .22;
      }
      if (source) foreground = {source, tail, priority};
      foregroundUntil = Math.max(foregroundUntil, (source?.endsAt ?? now) + tail);
    }

    const perchAudio = window.makePerchAcoustics?.(context, engine, world, region, load, buffers);
    const rainTex = {};
    function rainTexture(surface, density) {
      const key = surface + density;
      return rainTex[key] || (rainTex[key] = synthRain(context, surface, density));
    }
    function stopAll() {
      for (const s of state.falls.values()) s.stop(.4);
      // Audio clips can decode out of order, leaving holes at earlier indexes.
      // Stop every emitter already created when opening Explore or muting.
      state.water.forEach(w => w.emitters.forEach(s => s.stop(.4)));
      state.beds.forEach(b => b.emitters.forEach(s => s.stop(.4)));
      state.loops.forEach(l => l.source?.stop(.4));
      state.choruses.forEach(c => c.forEach(e => e.stop(.4)));
      for (const m of state.movers) m.source.stop(.3);
      for (const v of state.voices) v.source.stop?.(.3);
      state.voices.clear();
      for (const source of state.thunder) source.stop(.2);
      state.thunder.clear();
      if (state.rain) state.rain.emitters.forEach(s => s.stop(.4));
      state.rainFront?.stop(.4);
      state.rainFront = null; nextRainScan = 0; state.dripDue = 0;
      state.falls.clear(); state.water = []; state.beds = []; state.loops = []; state.choruses = []; state.movers.clear(); state.rain = null; regionalCall = null; foreground = null; foregroundUntil = 0; perched = false; perchSince = -Infinity; perchAudio?.reset();
    }
    function setEnabled(value) {
      if (enabled === value) return; enabled = value;
      if (!enabled) { stopAll(); airflow?.stop(context.currentTime); return; }
      const now = context.currentTime;
      nextScan = now; nextRegional = now + rand(4, 8);
      for (const [i, e] of (spec.events || []).entries()) {
        if (!state.due.has(i)) state.due.set(i, now + rand(...(e.initial || [3, Math.min(25, e.every[0])])));
        // An expired cooldown doesn't unleash a stack of calls when unmuting.
        else if (state.due.get(i) < now) state.due.set(i, now + rand(2, 6));
      }
      if (spec.storm && thunderDue < now + 1) thunderDue = now + rand(1.5, 4);
    }

    // Four decorrelated emitters 18 m around the listener form a diffuse bed.
    function makeBed(clip, gain, height = 4, label) {
      const b = typeof clip === 'string' ? buffers.get(clip) : clip; if (!b) return null;
      const emitters = [], family = {seed: Math.random() * 997, size: 4};   // four copies round the listener, each kept to its own part of the recording
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4;
        const s = engine.loop(b, {x: engine.ear.x, y: engine.ear.y, z: engine.ear.z}, {gain: 0, label, ref: 18, spread: 'none', occlude: false, doppler: false, wet: .25, offset: (i * .27 * b.duration) % b.duration, family, member: i});
        s.angle = a; s.height = height; emitters.push(s);
      }
      return {clip, emitters, gainFn: gain};
    }
    function placeBed(bed, level, now) {
      for (const s of bed.emitters) {
        s.x = engine.ear.x + Math.cos(s.angle) * 18; s.z = engine.ear.z + Math.sin(s.angle) * 18; s.y = engine.ear.y + s.height;
        s.gain = level * .5 * (s.mix ?? 1);
      }
    }

    let surgeHigh = false;
    let thunderDue = 0, ctx = null, ticks = null, airflow = null;
    // ---- Eagle Ears (L): eagle head, raptor hearing, audible prey ------------
    let eagleEars = false, humanProfile = engine.profile, rustles = null, splash = null, nextCue = 0;
    const cueDue = new WeakMap();
    function setEagleEars(on) {
      eagleEars = on;
      if (on) { humanProfile = engine.profile === 'eagle' ? humanProfile : engine.profile; engine.setHeadProfile('eagle'); }
      else engine.setHeadProfile(humanProfile || 'default');
      engine.setRaptorHearing(on);
      const b = document.getElementById('earsToggle'); if (b) b.setAttribute('aria-pressed', String(on));
    }
    // Small movement cues are synthesised, not recorded, so they belong to
    // Eagle Ears only: with ordinary hearing nothing is played that was not
    // recorded from the animal itself.
    function preyCues(now) {
      const wl = world.wildlife; if (!eagleEars || !wl?.nearby || now < nextCue) return;
      nextCue = now + .3;
      rustles = rustles || [0, 1, 2, 3].map(() => synthRustle(context)); splash = splash || [0, 1, 2].map(() => synthSplash(context));
      const radius = eagleEars ? 170 : 70;
      let played = 0;
      for (const a of wl.nearby(engine.ear, radius)) {
        if (played >= 2) break;
        if (!a.actor || now < (cueDue.get(a.actor) ?? 0) || a.kind === 'Bird') continue;
        const moving = a.behavior && !/rest|perch|sleep/i.test(a.behavior);
        cueDue.set(a.actor, now + rand(moving ? 1.1 : 3, moving ? 2.6 : 7));
        const fish = a.kind === 'Fish';
        if (fish && Number.isFinite(a.actor.level) && a.actor.level - a.y > .6) continue; // deep fish are silent
        const pos = {x: a.x, y: fish ? (a.actor.level ?? a.y) : a.y + .2, z: a.z};
        engine.play(pick(fish ? splash : rustles), pos, {gain: (eagleEars ? .55 : .16) * (fish ? .8 : 1), ref: 4, reach: radius, wet: .15, rate: rand(.9, 1.1)});
        played++;
      }
    }
    // Controls: an Eagle Ears toggle beside Game Vision, and a head-profile
    // chooser with a short 3D sweep in the Flight controls dialog.
    function installControls() {
      if (!document.getElementById('aerieEarsStyle')) {
        const st = document.createElement('style'); st.id = 'aerieEarsStyle';
        st.textContent = '#earsToggle[aria-pressed=true]{background:#efe0b9;color:#192720;border-color:#fff1ca}' +
          '.headProfile{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 0;font-size:13px}.headProfile select{max-width:100%}';
        document.head.appendChild(st);
      }
      const vision = document.getElementById('visionToggle');
      if (vision && !document.getElementById('earsToggle')) {
        const b = document.createElement('button');
        b.className = 'icon flightOnly'; b.id = 'earsToggle'; b.setAttribute('aria-pressed', 'false'); b.title = 'Eagle Ears (L)';
        b.setAttribute('aria-label', 'Toggle Eagle Ears (L)');
        b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 18c0 2 1.5 3 3 3s3-1.5 3-3.2c0-1.6 1.2-2.3 2.2-3.4A6.5 6.5 0 1 0 6 9.5"/><path d="M10 10.5a2.5 2.5 0 1 1 4 2"/></svg>';
        vision.after(b);
      }
      const box = document.getElementById('instructions');
      if (box && !document.getElementById('headProfile')) {
        const wrap = document.createElement('div'); wrap.className = 'headProfile';
        wrap.innerHTML = '<label for="headProfile">3D audio head</label><select id="headProfile"></select><button type="button" id="headTest" class="secondary">Play 3D test</button>';
        const sel = wrap.querySelector('select');
        for (const [v, label] of headProfiles) sel.add(new Option(label, v));
        box.insertBefore(wrap, box.querySelector('.references'));
        const refs = box.querySelector('.references');
        if (refs && !document.getElementById('soundscapeCredits')) {
          const link = document.createElement('a'); link.id = 'soundscapeCredits'; link.target = '_blank'; link.rel = 'noopener';
          link.href = window.aerieAssetURL?.('soundscape-credits.txt') || 'soundscape-credits.txt'; link.textContent = 'Regional soundscapes, heads and live air ↗';
          refs.insertBefore(link, refs.querySelector('strong'));
        }
      }
      window.aerieSoundscapeControls = {setEagleEars, test: sweep, setProfile: name => { if (eagleEars) humanProfile = name; else engine.setHeadProfile(name); }};
      const sel = document.getElementById('headProfile');
      if (sel) sel.value = engine.profile === 'eagle' ? humanProfile : engine.profile;
    }
    let blip = null;
    function sweep() {
      blip = blip || synthBlip(context);
      // Front, right, behind, left, above, 3 m from the head in the camera frame.
      const steps = [[0, 0, -3], [3, 0, 0], [0, 0, 3], [-3, 0, 0], [0, 3, 0]];
      steps.forEach(([x, y, z], i) => {
        const v = new THREE.Vector3(x, y, z).applyQuaternion(lastCamera?.quaternion || new THREE.Quaternion());
        engine.play(blip, {x: engine.ear.x + v.x, y: engine.ear.y + v.y, z: engine.ear.z + v.z}, {gain: .9, ref: 1, reach: 50, wet: .1, occlude: false, doppler: false, when: i * .55});
      });
    }
    let lastCamera = null;
    if (!window.__aerieEarsKeys) {
      window.__aerieEarsKeys = true;
      window.addEventListener('keydown', e => {
        if (e.code === 'KeyL' && !e.repeat && document.getElementById('app')?.dataset.mode === 'flight') {
          const c = window.aerieSoundscapeControls; if (c) { e.preventDefault(); c.setEagleEars(!document.getElementById('earsToggle')?.getAttribute('aria-pressed')?.includes('true')); }
        }
      });
      document.addEventListener('click', e => {
        const c = window.aerieSoundscapeControls; if (!c) return;
        if (e.target.closest?.('#earsToggle')) c.setEagleEars(document.getElementById('earsToggle').getAttribute('aria-pressed') !== 'true');
        if (e.target.closest?.('#headTest')) c.test();
      });
      document.addEventListener('change', e => {
        if (e.target.id !== 'headProfile') return;
        try { localStorage.setItem('aerie-head-profile', e.target.value); } catch (err) {}
        window.aerieSoundscapeControls?.setProfile(e.target.value);
      });
    }
    installControls();
    // ---- the eagle's own body ---------------------------------------------------
    // eagle-motion.js announces rouses, shakes, tail wags and landings. Each is a
    // short burst of band-passed noise shaped by the shake's own rhythm (feathers
    // rattling); a landing adds a soft thump as the feet take the weight.
    let bodyNoise = null;
    function bodySound(d) {
      // Synthesised, so heard with Eagle Ears only (see preyCues).
      if (!enabled || !d || !eagleEars) return;
      const now = context.currentTime, strength = clamp(d.strength ?? 1, 0, 1.5);
      if (!bodyNoise) {
        bodyNoise = context.createBuffer(1, Math.round(context.sampleRate * 1.5), context.sampleRate);
        const x = bodyNoise.getChannelData(0); for (let i = 0; i < x.length; i++) x[i] = Math.random() * 2 - 1;
      }
      // duration (s), shake rate (Hz), band centre (Hz), Q, level
      const [dur, rate, f, q, level] = {rouse: [.9, 9, 3400, .7, .16], airshake: [.55, 11, 3000, .7, .14], shake: [.38, 9, 4800, 1, .06],
        wag: [.45, 7, 2600, .8, .045], land: [.5, 14, 1800, .6, .12]}[d.kind] || [.3, 8, 3000, .8, .03];
      const src = context.createBufferSource(), hp = context.createBiquadFilter(), band = context.createBiquadFilter(), g = context.createGain();
      src.buffer = bodyNoise; src.loop = true; hp.type = 'highpass'; hp.frequency.value = 700;
      band.type = 'bandpass'; band.frequency.value = f; band.Q.value = q; g.gain.value = 0;
      src.connect(hp).connect(band).connect(g).connect(destination);
      const n = Math.ceil(dur * 120), curve = new Float32Array(n);
      for (let i = 0; i < n; i++) { const u = i / (n - 1); curve[i] = level * strength * Math.sin(Math.PI * u) ** .8 * (.35 + .65 * Math.sin(Math.PI * rate * u * dur) ** 2); }
      g.gain.setValueCurveAtTime(curve, now, dur);
      src.start(now, Math.random()); src.stop(now + dur + .05);
      src.onended = () => { for (const node of [src, hp, band, g]) try { node.disconnect(); } catch (e) {} };
      if (d.kind === 'land') {
        const osc = context.createOscillator(), og = context.createGain();
        osc.frequency.setValueAtTime(95, now); osc.frequency.exponentialRampToValueAtTime(52, now + .16);
        og.gain.setValueAtTime(.22 * strength, now); og.gain.exponentialRampToValueAtTime(.0005, now + .2);
        osc.connect(og).connect(destination); osc.start(now); osc.stop(now + .22);
        osc.onended = () => { try { osc.disconnect(); og.disconnect(); } catch (e) {} };
      }
    }
    // The eagle's own wings. Each downstroke is heard twice over: the wind at
    // the ears swells with it (see makeAirflow), and a recording of a bald
    // eagle's wing stroke plays under it, clearest on a take-off or a slow
    // climb where the wind does not cover it.
    const strokes = ['eagle-wing-a', 'eagle-wing-b', 'eagle-wing-c'];
    strokes.forEach(id => load(id));
    load('wind-at-ears');
    let strokeAt = null, lastStroke = '';
    function wingStroke(s, now) {
      // A stroke begins as the wingbeat passes a quarter radian. The phase
      // wraps every beat, so compare where it is with where it was: a frame
      // need not land in any particular part of the beat for it to be heard.
      const at = (((s.phase || 0) - .25) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI), began = strokeAt !== null && at < strokeAt;
      strokeAt = at;
      const effort = clamp(s.effort || 0, 0, 1.2);
      if (!began || effort < .2) return;
      const ready = strokes.filter(id => id !== lastStroke && buffers.get(id)); if (!ready.length) return;
      const id = lastStroke = pick(ready), v = (s.indicatedAirspeed ?? s.airspeed) || 0;
      const src = context.createBufferSource(), g = context.createGain(), pan = context.createStereoPanner?.();
      src.buffer = buffers.get(id); src.playbackRate.value = rand(.9, 1.1) * (.92 + .16 * effort);
      // Loud on a take-off, half covered by the wind at cruising speed.
      g.gain.value = .7 * effort * clamp(1.3 - v / 45, .55, 1) * (id === 'eagle-wing-c' ? .6 : 1) * rand(.8, 1.1);
      src.connect(g);
      if (pan) { pan.pan.value = rand(-.3, .3); g.connect(pan).connect(destination); } else g.connect(destination);
      src.start(now);
      src.onended = () => { for (const node of [src, g, pan]) try { node?.disconnect(); } catch (e) {} };
    }
    if (window.aerieBodySoundHandler) window.removeEventListener('aerie-eagle-body', window.aerieBodySoundHandler);
    window.aerieBodySoundHandler = e => bodySound(e.detail);
    window.addEventListener('aerie-eagle-body', window.aerieBodySoundHandler);
    function strike(storm, t) {
      const depth = window.aerieCalderaStormDepth;
      if (!depth) return null;
      const ear = engine.ear;
      const candidate = (angle, distance) => {
        const x = ear.x + Math.cos(angle) * distance, z = ear.z + Math.sin(angle) * distance;
        const d = depth(x, z, t);
        if (d <= 400 || d >= 4700) return null;
        const level = waterLevel(world);
        const y = isWet(world, x, z) && Number.isFinite(level) ? level : ground(world, x, z);
        if (Number.isFinite(y) && y < storm.cloudY - 300) return {x, y, z};
        return null;
      };
      // The closest appreciable cell gets first chance, but every bolt is
      // still inside the moving bank. A ring scan backs up the random search.
      for (let i = 0; i < 48; i++) {
        const s = candidate(rand(0, 2 * Math.PI), 1400 + 9000 * Math.random() ** 2);
        if (s) return s;
      }
      for (const d of [1900, 3000, 4700, 6900, 9900]) {
        for (let i = 0; i < 16; i++) {
          const s = candidate(i * Math.PI / 8, d);
          if (s) return s;
        }
      }
      return null;
    }
    function thunder(storm, t) {
      const s = strike(storm, t); if (!s) return null;
      const cloudY = storm.cloudY + rand(-165, 235);
      const synth = synthThunder(context, s, cloudY, engine.ear, engine.absorption);
      const pos = {x: s.x, y: (s.y + cloudY) / 2, z: s.z};
      // The channel buffer is timed from its first pressure arrival; adding
      // a propagating point-source delay here would count the distance twice.
      const when = synth.nearest / 343;
      const play = (buffer, position, opts) => {
        if (!buffer) return;
        const source = engine.play(buffer, position, {reach: 24000, occlude: false,
          doppler: false, masking: .20, ...opts});
        if (source) state.thunder.add(source);
      };
      const near = buffers.get('scape-crater-thunder-near');
      const far = buffers.get('scape-crater-thunder-far');
      const close = synth.nearest < 3600;
      const recording = close ? near || far : far || near;
      play(synth.buffer, pos, {gain: recording ? .62 : .98, ref: 2100, wet: .67, when, label: 'thunder-channel'});
      // Layer one corresponding recording so the transient rolls and breaks
      // up naturally; the simulated channel can stand alone if it is absent.
      if (recording === near && near) {
        play(near, pos, {gain: .82, ref: 1580, wet: .68, when, offset: .32, label: 'thunder-crack'});
      } else if (far) {
        play(far, pos, {gain: .82, ref: 2450, wet: .78, when: when + .45, label: 'thunder-rumble'});
      }
      window.dispatchEvent(new CustomEvent('aerie-lightning', {detail: {x: s.x, y: s.y, z: s.z, cloudY, distance: synth.nearest, delay: when}}));
      return when;
    }
    const weatherSample = {};
    let listenerWeather = null, sampledField = null, lastWeatherTime = -Infinity;
    let sampledX = 0, sampledY = 0, sampledZ = 0;

    let nextScan = 0, nextRainScan = 0;
    const rainProbe = {};
    function updatePassingRain(now) {
      if ((!spec.storm && !spec.shower && !world.rainCellAt) || now < nextRainScan) return;
      nextRainScan = now + .7;
      const {ear, t, rain, wetness, canopy} = ctx;
      const recording = buffers.get(spec.storm ? 'scape-' + region + '-rain-approach' : 'scape-' + region + '-rain-on-lake');
      if (rain < .25) {
        let best = null;
        // The front is audible where rain is already striking a surface.
        // Sample the same precipitation field that draws the visible cell.
        for (let i = 0; i < 8; i++) {
          const a = Math.PI * i / 4;
          const x = ear.x + 225 * Math.cos(a), z = ear.z + 225 * Math.sin(a);
          const y = Math.max(ground(world, x, z), waterLevel(world) ?? -Infinity) + 3;
          const drops = world.windField?.weatherAt?.(x, y, z, t, rainProbe)?.rain ?? 0;
          if (drops > (best?.drops ?? .20)) best = {x, y, z, drops};
        }
        if (best) {
          const surface = isWet(world, best.x, best.z) ? 'water' : 'rock';
          const texture = recording || rainTexture(surface, 420);
          if (!state.rainFront) state.rainFront = engine.loop(texture, best, {label: 'rain front', switchable: true, gain: 0, ref: 66, reach: 700, wet: .35});
          const source = state.rainFront;
          source.replaceBuffer(texture);
          source.x += .38 * (best.x - source.x);
          source.y += .38 * (best.y - source.y);
          source.z += .38 * (best.z - source.z);
          source.gain = best.drops * .52 * (1 - smooth(.02, .25, rain));
        } else if (state.rainFront) state.rainFront.gain = 0;
      } else if (state.rainFront) state.rainFront.gain = 0;
      const drip = buffers.get('scape-' + region + '-rain-on-spruce');
      if (drip && wetness > .12 && rain < .07 && canopy > .25 && now >= (state.dripDue ?? 0)) {
        state.dripDue = now + rand(3.5, 8) / wetness;
        const tree = world.habitat?.nearestTree?.(ear.x, ear.z, 32);
        if (tree) {
          const part = engine.excerpt(drip, Math.random, true);
          const source = engine.play(drip, {x: tree.x, y: tree.y + tree.height * .72, z: tree.z},
            {label: 'wet canopy drips', gain: .46 * wetness, ref: 6, reach: 58, offset: part?.offset, duration: Math.min(3.5, part?.duration ?? drip.duration)});
          if (source) state.voices.add({source, hush: 0});
        }
      }
    }
    function update(s, camera, dt, extras = {}) {
      if (!enabled) return;
      engine.update(camera, dt); lastCamera = camera;
      const now = context.currentTime, t = s.elapsed || 0, ear = engine.ear;
      const field = world.windField;
      if (field !== sampledField || t < lastWeatherTime || t - lastWeatherTime >= .10 ||
          (ear.x-sampledX)**2 + (ear.y-sampledY)**2 + (ear.z-sampledZ)**2 > 64) {
        listenerWeather = field?.weatherAt?.(ear.x, ear.y, ear.z, t, weatherSample);
        sampledField = field; lastWeatherTime = t; sampledX = ear.x; sampledY = ear.y; sampledZ = ear.z;
      }
      const gust = listenerWeather?.gust ?? extras.gust ?? .5;
      airflow = airflow || makeAirflow(context, destination);
      if (!airflow.real && buffers.get('wind-at-ears')) airflow.adopt(buffers.get('wind-at-ears'));
      // Indicated airspeed already includes the air velocity relative to the
      // moving bird. The local pressure pulse adds independent ear turbulence.
      const stage = extras.perchStage ?? 'free';
      const velocity = Math.max(0, (stage === 'free' ? s.indicatedAirspeed : s.airspeed) ?? s.airspeed ?? 0);
      airflow.update(s, gust, now, velocity);
      wingStroke(s, now);
      const sheltered = lee(s);
      const agl = Math.max(0, ear.y - ground(world, ear.x, ear.z));
      const elevationGain = extras.exposure ?? clamp(agl / 200, 0, 1);
      const exposure = listenerWeather ? listenerWeather.exposure * (.34 + .66 * elevationGain) : elevationGain;
      const rain = listenerWeather?.rain ?? window.aerieRainAt(world, region, ear.x, ear.z, t);
      if (stage === 'perched' && !perched) perchSince = now;
      perched = stage === 'perched';
      const shoreRange = extras.shore ? Math.hypot(ear.x - extras.shore.x, ear.z - extras.shore.z) : Infinity;
      const masker = windMasker(velocity, gust, listenerWeather?.exposure ?? extras.open ?? exposure, sheltered);
      engine.setMasker(masker);
      ctx = {world, ear, agl, exposure, gust, rain, lee: sheltered, wetness: listenerWeather?.wetness ?? 0, canopy: extras.canopy ?? 0,
        shore: extras.shore, shoreRange, town: 0, t, masker, speed: velocity, overWater: isWet(world, ear.x, ear.z),
        waterClearance: Math.max(0, ear.y - (waterLevel(world) ?? ear.y - agl)),
        canopyMotion: smooth(.3, .78, .66 * gust + .34 * swell(t, ear.x * .012 + ear.z * .009)),
        perchStage: stage, perch: extras.perch, settledFor: perched ? now - perchSince : 0};
      perchAudio?.update(s, ctx);
      const keene = landmark(world, /Central Square/);
      if (keene) ctx.town = 1 - smooth(300, 1400, Math.hypot(ear.x - keene.x, ear.z - keene.z));
      // Air is squeezed out of Thunder Hole only as the visual pulse rises.
      // A single pressure transient arrives from the chamber after propagation.
      if (spec.surge && world.acadiaCoast) {
        const pulse = world.acadiaCoast.surge(t), high = pulse > .37;
        if (high && !surgeHigh) {
          const q = spec.surge, pos = q.where(ctx), b = buffers.get(q.clip);
          if (b && Math.hypot(ear.x-pos.x, ear.y-pos.y, ear.z-pos.z) < q.reach)
            engine.play(b, pos, {label:q.clip, gain:.95, ref:q.ref, reach:q.reach, wet:.65, echo:true, rate:rand(.96,1.03)});
        }
        surgeHigh = high;
      }
      preyCues(now);
      if (now < nextScan) { tickEvents(now); return; }
      nextScan = now + .25;
      updatePassingRain(now);

      // Waterfalls: keep the nearest three impacts as looping 3D sources.
      const fallsClip = spec.falls ? (buffers.get(spec.falls.clip) || fallback.falls) : fallback.falls;
      const fallsSpec = spec.falls || {ref: 40, reach: 2200, gain: .8};
      if (fallsClip) {
        const impacts = world.waterfalls?.impacts || world.spraySources || (world.landmarks || []).filter(p => /fall|cascade|forsen|flume/i.test(p.name));
        const ranked = impacts.map((p, i) => ({p, i, d: Math.hypot(p.x - ear.x, p.z - ear.z)})).sort((a, b) => a.d - b.d).slice(0, 3)
          .filter(o => o.d < fallsSpec.reach);
        const keep = new Set(ranked.map(o => o.i));
        for (const [i, src] of state.falls) if (!keep.has(i)) { src.stop(1.5); state.falls.delete(i); }
        for (const {p, i} of ranked) {
          const take = spec.fallTakes?.find(o => o.where.test(p.name || ''));
          const clip = (take && buffers.get(take.clip)) || fallsClip;
          const y = (p.y ?? ground(world, p.x, p.z)) + Math.min(14, 3 + .2 * (p.drop || 20));
          const size = clamp(.55 + (p.drop || 40) / 160 + (p.width || 10) / 80, .5, 1.25);
          const plunge = window.aerieChutePulse?.(p.x, p.z, t) ?? .5;
          const gain = fallsSpec.gain * size * (.78 + .3 * plunge + .13 * rain);
          const current = state.falls.get(i);
          if (current) { current.replaceBuffer(clip); current.gain = gain; continue; }
          state.falls.set(i, engine.loop(clip, {x: p.x, y, z: p.z}, {label: 'falls', switchable: true, gain, ref: fallsSpec.ref * size, reach: fallsSpec.reach, wet: .6, echo: true, rate: clamp(1.08 - (p.drop || 40) / 900, .9, 1.08)}));
        }
      }
      // Rivers, streams and rocky shores: spread the sound along the water.
      [...(spec.water || []), ...extraWater].forEach((w, k) => {
        const b = (w.select && buffers.get(w.select(ctx))) || clipOf(w) || (w.kind === 'river' ? fallback.river : w.kind === 'shore' ? fallback.shore : null); if (!b) return;
        let entry = state.water[k];
        if (!entry) entry = state.water[k] = {emitters: []};
        const emitters = entry.emitters;
        const river = w.kind === 'river' ? world.riverSurfaceAt : null;
        const withinRiver = river ? (x, z) => Number.isFinite(river(x, z)) : undefined;
        const p = w.kind === 'shore'
          ? ctx.shore || nearestWaterline(world, ear.x, ear.z, w.maxR)
          : nearestWater(world, ear.x, ear.z, w.maxR, withinRiver);
        if (!p || Math.hypot(p.x - ear.x, p.z - ear.z) > w.maxR) {
          emitters.forEach(e => e.stop(1.2)); emitters.length = 0; return;
        }
        const pts = [p, ...waterReach(world, p, w.span || 100, withinRiver)];
        const waterY = waterLevel(world);
        const yAt = (x, z) => {
          const level = river ? river(x, z) : w.kind === 'shore' ? waterY : null;
          return (Number.isFinite(level) ? level : ground(world, x, z)) + .5;
        };
        pts.forEach((q, i) => {
          const wave = swell(t, k * 2.9 + i * 2.27);
          const wash = w.kind === 'river' ? .70 + .26 * wave + .16 * rain
            : .30 + wave * (.29 + .23 * gust) + .28 * gust * (1 - .6 * sheltered);
          const gain = w.gain * wash * (i === 0 ? 1 : .46);
          const e = emitters[i];
          if (!e) {
            emitters[i] = engine.loop(b, {x: q.x, y: yAt(q.x, q.z), z: q.z}, {label: w.kind, switchable: true, gain, ref: w.ref, reach: w.reach, spread: w.kind === 'river' ? 'line' : 'point', wet: .45});
            return;
          }
          e.replaceBuffer(b);
          // Emitters glide along the water instead of jumping.
          e.x += (q.x - e.x) * .35; e.z += (q.z - e.z) * .35;
          e.y = yAt(e.x, e.z); e.gain = gain;
        });
        // At a narrow stretch keep the spare sources quiet, ready to follow the next bend.
        for (let i = pts.length; i < emitters.length; i++) emitters[i].gain = 0;
      });
      // Fixed loops at modeled structures (the Surry dam outlet).
      (spec.loops || []).forEach((l, k) => {
        const b = buffers.get(l.clip); if (!b) return;
        let entry = state.loops[k];
        if (!entry) { const pos = l.where({...ctx}); if (!pos) return; entry = state.loops[k] = {pos}; }
        const d = Math.hypot(entry.pos.x - ear.x, entry.pos.z - ear.z);
        const wave = swell(t, k * 1.57);
        const activity = /dock/.test(l.clip) ? .10 + .75 * wave ** 3 + .25 * gust
          : /acadia-(?:cove|ledge|cobbles)/.test(l.clip) ? .43 + .52 * wave + .23 * gust
          : 1;
        const gain = d < l.reach * 1.1 ? l.gain * (l.level?.(ctx, entry.pos) ?? 1) * activity : 0;
        if (d < l.reach && gain > .02 && !entry.source) entry.source = engine.loop(b, entry.pos, {label: l.clip, gain, ref: l.ref, reach: l.reach, wet: .5});
        else if (entry.source && d > l.reach * 1.1) { entry.source.stop(1); entry.source = null; }
        else if (entry.source) entry.source.gain = gain;
      });
      // Insect choruses seeded in habitat around the eagle.
      const daylight = clamp(((world.sunDirection?.y ?? .4) - .05) / .2, 0, 1);
      (spec.choruses || []).forEach((ch, k) => {
        const b = buffers.get(ch.clip); if (!b) return;
        const entry = state.choruses[k] || (state.choruses[k] = []);
        if (ch.night && daylight > .5) { entry.forEach(e => e.stop(2.5)); entry.length = 0; return; }
        for (let i = entry.length - 1; i >= 0; i--) {
          const e = entry[i];
          const d = Math.hypot(e.x - ear.x, e.y - ear.y, e.z - ear.z);
          if (d > ch.r[1] * 1.8) { e.stop(2.5); entry.splice(i, 1); continue; }
          const patch = e.habitatPatch;
          const calling = smooth(.28, .81, swell(t * .67, patch.phase));
          const weather = (1 - .88 * smooth(.08, .64, rain)) * (1 - .58 * smooth(.36, .86, gust));
          // A nearby patch quiets during an approach, then resumes in its own phase.
          const disturbed = stage === 'approach' || stage === 'flare' || velocity > 6 || perched && ctx.settledFor < 7;
          const cover = disturbed ? .3 + .7 * smooth(14, 50, d) : 1;
          const leaves = (.10 + .32 * gust + .54 * ctx.canopyMotion) * (1 - .32 * rain);
          e.gain = ch.gain * patch.gain * (ch.foliage ? leaves : calling * weather * cover);
        }
        if (entry.length < Math.min(2, ch.count) && agl < ch.r[1] && Math.random() < .5) {
          const patch = chorusPatch(ch, k, entry);
          const source = patch && engine.loop(b, {x: patch.x, y: patch.y, z: patch.z}, {label: ch.clip, id: ch.clip + ' patch ' + patch.key.split(':').slice(1).join(','),
            gain: 0, ref: ch.ref, reach: ch.reach, wet: .3, rate: (ch.rate || 1) * patch.rate});
          if (source) { source.patch = patch.key; source.habitatPatch = patch; entry.push(source); }
        }
      });
      // Diffuse beds driven by local conditions.
      [...(spec.beds || []), ...extraBeds].forEach((b, k) => {
        if (!state.beds[k]) { const bed = makeBed(b.buffer || b.clip, b.gain, b.height ?? 4, b.role || b.clip); if (!bed) return; state.beds[k] = bed; }
        placeBed(state.beds[k], clamp(b.gain(ctx), 0, 1.2), now);
      });
      // Rain at the eagle: recorded rain plus synthesised near drops on the surface below.
      if (rain > .01 || (state.rain && rain >= .005)) {
        const below = ctx.overWater ? 'water' : (world.habitat?.nearestTree?.(ear.x, ear.z, 25) ? 'leaves' : 'rock');
        const surfaceClip = below === 'water' ? 'rain-on-lake' : below === 'leaves' ? 'rain-on-spruce' : 'rain-on-rock';
        const texture = buffers.get('scape-' + region + '-' + surfaceClip) || rainTexture(below, region === 'crater' ? 900 : 420);
        // Distant rainfall keeps its character while the close impacts follow the surface below.
        const localRain = below === 'leaves' && agl < 30 ? buffers.get(spec.rainAmbience) : null;
        const diffuse = localRain || buffers.get('scape-' + region + '-rain-approach') || (spec.storm && buffers.get('rain-steady')) || texture;
        if (!state.rain) {
          const emitters = [];
          for (let i = 0; i < 4; i++) {
            const opt = {gain: 0, label: i % 2 ? 'rain surface' : 'rain ambience', switchable: true, ref: 18, spread: 'none', occlude: false, doppler: false, wet: .2, offset: i * .49};
            const e = engine.loop(i % 2 ? texture : diffuse, ear, opt);
            e.angle = i * Math.PI / 2 + Math.PI / 4; e.height = i % 2 ? -12 : -4; emitters.push(e);
          }
          state.rain = {emitters};
        } else {
          state.rain.emitters.forEach((e, i) => e.replaceBuffer(i % 2 ? texture : diffuse));
        }
        state.rain.emitters.forEach((e, i) => { e.mix = i % 2 ? 1 - .75 * smooth(30, 260, agl) : 1; });
      }
      if (state.rain && rain > .2 && eagleEars) {      // synthesised drops on the eagle: Eagle Ears only
        ticks = ticks || synthTicks(context);
        const n = Math.floor(rain * rand(1, 6));
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, r = rand(.12, .5);
          engine.play(pick(ticks), {x: ear.x + Math.cos(a) * r, y: ear.y + rand(-.1, .35), z: ear.z + Math.sin(a) * r},
            {gain: rand(.08, .28) * rain, ref: .3, reach: 4, wet: 0, occlude: false, doppler: false, when: rand(0, .24)});
        }
      }
      if (state.rain) {
        if (rain < .005) { state.rain.emitters.forEach(e => e.stop(2)); state.rain = null; }
        else placeBed(state.rain, clamp(rain * 1.4, 0, 1.2) * (1 - .55 * smooth(80, 600, agl)), now);
      }
      // Thunder from the real storm bank (Crater Lake).
      if (spec.storm) {
        for (const source of state.thunder) if (!source.alive) state.thunder.delete(source);
        if (now >= thunderDue) {
          const delay = thunder(spec.storm, t);
          thunderDue = now + (delay === null ? rand(3, 7) : delay + rand(28, 48));
        }
      }
      tickEvents(now);
    }
    // Callers placed by habitat keep fixed posts: one per caller kind in each
    // 160 m cell of the world, found once by a repeatable search and remembered.
    // A bird sings in bouts: the one heard last goes on from the same post
    // while the eagle stays in earshot, now and then answered by a neighbour,
    // and a new singer is one of the nearest. No post inside its hush radius
    // is used.
    function stablePost(e, index, hush) {
      const ear = engine.ear, cell = e.cell || POST_CELL, ix0 = Math.floor(ear.x / cell), iz0 = Math.floor(ear.z / cell), near = [];
      const singer = state.singers.get(index), ring = e.cell ? 1 : 2;
      for (let ix = ix0 - ring; ix <= ix0 + ring; ix++) for (let iz = iz0 - ring; iz <= iz0 + ring; iz++) {
        const key = index + ':' + ix + ':' + iz;
        let post = state.posts.get(key);
        if (post === undefined) {
          if (state.posts.size > 1500) state.posts.clear();
          post = postFor(e.where, index, ix, iz, ctx, cell) || null;
          if (post) post.key = key;
          state.posts.set(key, post);
        }
        if (!post) continue;
        const d = Math.hypot(post.x - ear.x, post.y - ear.y, post.z - ear.z);
        if (d > hush && d < (e.nearest ?? e.reach * (singer?.key === key ? 1 : .9))) near.push({post, d});
      }
      if (!near.length) return null;
      near.sort((a, b) => a.d - b.d);
      if (e.nearest) return near[0].post;
      const going = singer && singer.left > 0 && near.find(n => n.post.key === singer.key);
      if (going && Math.random() < .8) { singer.left--; return going.post; }
      const u = Math.random(), chosen = near[Math.min(near.length - 1, u < .6 ? 0 : u < .85 ? 1 : 2)];
      // A neighbour answering does not end the bout; otherwise this bird takes over.
      if (!going) state.singers.set(index, {key: chosen.post.key, left: 3 + Math.floor(Math.random() * 5)});
      return chosen.post;
    }
    let nextRegional = Infinity, regionalCall = null;
    const regionalHistory = new Map(), lastRegional = new Map();
    function historyFor(index) {
      let history = regionalHistory.get(index);
      if (!history?.size) { history = new Set(banks[index].clips); regionalHistory.set(index, history); }
      return history;
    }
    function regionalWildlife(now) {
      if (!banks.length) return;
      const ear = engine.ear;
      if (regionalCall) {
        const {bank, id, where, until} = regionalCall;
        const gap = Math.hypot(where.x - ear.x, where.y - ear.y, where.z - ear.z);
        if (now > until || gap < bank.hush || gap > bank.reach || ctx.agl > 340) regionalCall = null;
        else if (canVoice(now) && buffers.has(id)) {
          const b = buffers.get(id); regionalCall = null;
          if (b) {
            const index = banks.indexOf(bank);
            historyFor(index).delete(id);
            lastRegional.set(index, now);
            const part = engine.excerpt(b, Math.random, true);
            const source = engine.play(b, where, {label: id, id: bank.name + ' post ' + where.key,
              gain: bank.gain ?? .48, ref: bank.ref, reach: bank.reach, wet: .4, masking: .68, offset: part?.offset, duration: part?.duration});
            quiet(source, bank.hush);
            noteVoice(source, rand(1.4, 3.4));
          }
        }
      }
      if (regionalCall || now < nextRegional) return;
      nextRegional = now + rand(8, 17);
      if (!canVoice(now) || ctx.agl > 340 || ctx.rain > .58) return;
      const night = region === 'acadia' || (world.sunDirection?.y ?? .4) < -.025;
      const start = Math.floor(Math.random() * banks.length);
      for (let i = 0; i < banks.length; i++) {
        const k = (start + i) % banks.length, bank = banks[k];
        if (bank.period !== 'any' && (bank.period === 'night') !== night) continue;
        if (now - (lastRegional.get(k) ?? -Infinity) < (bank.rest ?? 48)) continue;
        const where = stablePost(bank, k + 1000, bank.hush);
        if (!where) continue;
        const id = pick([...historyFor(k)]);
        regionalCall = {bank, id, where, until: now + 5};
        regionalBuffer(id);
        return;
      }
    }
    function tickEvents(now) {
      const ear = engine.ear;
      // A songbird or frog stops mid-phrase if the eagle closes within its hush radius.
      for (const v of state.voices) {
        const s0 = v.source;
        if (!s0.alive) { state.voices.delete(v); continue; }
        if (v.hush > 0 && Math.hypot(s0.x - ear.x, s0.y - ear.y, s0.z - ear.z) < v.hush) {
          s0.stop(.35);
          state.voices.delete(v);
          if (foreground?.source === s0) {
            foregroundUntil = now + Math.max(2, foreground.tail);
            foreground = null;
          }
        }
      }
      regionalWildlife(now);
      // Moving sources follow their paths.
      for (const m of state.movers) {
        const p = m.path, u = clamp((now - m.start) * p.speed / Math.hypot(p.bx - p.ax, p.bz - p.az), 0, 1);
        m.source.x = p.ax + (p.bx - p.ax) * u; m.source.z = p.az + (p.bz - p.az) * u; m.source.y = p.y;
        const fadeIn = smooth(0, .12, u), fadeOut = 1 - smooth(.88, 1, u);
        m.source.gain = m.gain * fadeIn * fadeOut;
        if (u >= 1) { m.source.stop(.5); state.movers.delete(m); }
      }
      (spec.events || []).forEach((e, i) => {
        if (now < (state.due.get(i) ?? Infinity)) return;
        state.due.set(i, now + rand(...e.every));
        const clip = Array.isArray(e.clip) ? pick(e.clip.filter(id => buffers.get(id))) : e.clip;
        const isWildlife = !e.repeat && !/calving|rockfall|church-bell/.test(clip || '');
        const retry = () => {
          const wait = e.retry || (isWildlife && e.every[0] < 90 ? [5, 10] : null);
          if (wait) state.due.set(i, now + rand(...wait));
        };
        if (e.when && !e.when(ctx)) { retry(); return; }
        if (isWildlife && !e.moving && !canVoice(now)) {
          state.due.set(i, Math.max(now + .5, foregroundUntil) + rand(1, 3));
          return;
        }
        const b = clip && buffers.get(clip); if (!b) { if (loading.has(clip)) retry(); return; }
        const hush = hushRadius(clip);
        const where = e.where.stable ? stablePost(e, i, hush) : e.where(ctx);
        if (!where) { retry(); return; }
        // Gusts still partly mask a call, and terrain and distance still apply.
        const masking = e.masking ?? (isWildlife ? .62 : 1);
        if (where.path) {
          const p = where.path;
          const src = engine.loop(b, {x: p.ax, y: p.y, z: p.az}, {gain: 0, ref: e.ref, reach: e.reach,
            wet: e.wet ?? .5, masking, label: clip});
          if (src) state.movers.add({source: src, path: p, start: now, gain: e.gain});
        } else {
          if (Math.hypot(where.x - ear.x, where.y - ear.y, where.z - ear.z) > e.reach) { retry(); return; }
          const strikes = e.repeat ? Math.round(rand(...e.repeat)) : 1;
          for (let k = 0; k < strikes; k++) {
            const part = e.repeat || e.whole ? null : engine.excerpt(b, Math.random, true);
            const source = engine.play(b, where, {gain: e.gain, ref: e.ref, reach: e.reach, wet: e.wet ?? .45,
              masking, rate: e.repeat ? 1 : rand(.965, 1.035), when: k * (e.spacing || 0), echo: e.echo ?? e.ref >= 20, label: clip,
              offset: part?.offset, duration: part?.duration,
              id: where.key ? clip + ' post ' + where.key.split(':').slice(1).join(',') : ''});
            if (source) {
              state.voices.add({source, hush});
              if (isWildlife) noteVoice(source, rand(1.1, 2.7));
            }
          }
        }
      });
    }
    // Wind shadow at the eagle, sampled five times a second and eased so the
    // wind falls away over about a second as the bird slips behind a rock.
    const shelter = {value: 0, target: 0, next: 0, at: 0};
    function lee(s) {
      const now = context.currentTime;
      if (now >= shelter.next) { shelter.target = leeShelter(world, s.x, s.y, s.z); shelter.next = now + .2; }
      const dt = clamp(now - shelter.at, 0, .5); shelter.at = now;
      shelter.value += (shelter.target - shelter.value) * (1 - Math.exp(-dt / .9));
      return shelter.value;
    }
    // A voice that should stop if the eagle comes within `radius` metres of it.
    function quiet(source, radius) { if (source && radius > 0) state.voices.add({source, hush: radius}); }
    // Every live positioned source: what it is, which individual (a fixed post,
    // a fixed site or a visible animal it follows), where it is, how much
    // terrain shades it, the level arriving at the ears and the level left
    // after wind masking. For checks and captures; nothing in the game reads it.
    function trace() {
      return [...engine.sources].filter(s => s.alive && s.label).map(s => ({label: s.label, id: s.id || s.label + ' at ' + Math.round(s.x) + ',' + Math.round(s.z), follows: s.follows,
        x: +s.x.toFixed(1), y: +s.y.toFixed(1), z: +s.z.toFixed(1),
        distance: Math.round(s.distance || 0), shield: +(s.shield || 0).toFixed(2), arrived: +(s.arrived || 0).toFixed(4), heard: +(s.heard || 0).toFixed(4)}));
    }
    function acousticState() {
      return ctx && {stage: ctx.perchStage, agl: ctx.agl, overWater: ctx.overWater, speed: ctx.speed, masker: ctx.masker,
        rain: ctx.rain, gust: ctx.gust, lee: ctx.lee, canopy: ctx.canopy, shoreRange: ctx.shoreRange,
        settle: ctx.settledFor, foreground: foreground?.source.alive ? foreground.source.label : null, spacing: Math.max(0, foregroundUntil - context.currentTime)};
    }
    return {engine, setEnabled, update, load, buffers, adopt, canVoice, noteVoice, acousticState, setEagleEars, get eagleEars() { return eagleEars; }, trace, lee, hush: quiet, get shelter() { return shelter.value; }, get posts() { return state.posts; }};
  };
})();
