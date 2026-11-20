// Regional soundscapes: every world's water, weather, human presence and
// wildlife events, placed in survey space and rendered by makeSpatialAudio.
// Recordings are credited in soundscape-credits.txt. Thunder and close rain
// are synthesised physically from the storm geometry shown on screen.
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
    lofoten: {tempC: 9, humidity: 84, ir: 'lofoten'},    milford: {tempC: 12, humidity: 96, ir: 'milford'}
  };
  const irLevel = {canyon: .020, lofoten: .016, milford: .011, yosemite: .0013, swiss: .019, dixville: .088, alaska: .017, crater: .011, lake: .00012};

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
  function nearestWater(world, x, z, maxR = 1600) {
    if (isWet(world, x, z)) return {x, z, d: 0};
    for (const r of [15, 30, 55, 90, 140, 210, 300, 420, 600, 850, 1200, 1600]) {
      if (r > maxR) break;
      let best = null;
      for (let i = 0; i < 24; i++) {
        const a = i / 24 * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (isWet(world, px, pz)) { best = {x: px, z: pz, d: r}; break; }
      }
      if (best) return best;
    }
    return null;
  }
  // Two more water points about `span` metres either side of p (a river reach).
  function waterReach(world, p, span) {
    const out = [];
    for (let i = 0; i < 16 && out.length < 2; i++) {
      const a = i / 16 * Math.PI * 2, px = p.x + Math.cos(a) * span, pz = p.z + Math.sin(a) * span;
      if (isWet(world, px, pz) && !out.some(o => Math.hypot(o.x - px, o.z - pz) < span)) out.push({x: px, z: pz});
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
    while (y > strike.y) {
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
        const radiate = Math.pow(1 - cos * cos, 1.5);
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
    const fs = context.sampleRate, len = Math.floor(seconds * fs);
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
    const fs = context.sampleRate, len = Math.floor(6 * fs), buf = context.createBuffer(2, len, fs);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch); let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) { // pink-ish (Kellet) noise
        const w = Math.random() * 2 - 1; b0 = .99765 * b0 + w * .099046; b1 = .963 * b1 + w * .2965164; b2 = .57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * .1848) * .12;
      }
      for (let i = 0; i < 4096; i++) d[len - 4096 + i] = d[len - 4096 + i] * (1 - i / 4096) + d[i] * (i / 4096);
    }
    const src = context.createBufferSource(); src.buffer = buf; src.loop = true;
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
      update(s, gust, now) {
        const v = Math.max(0, (s.indicatedAirspeed ?? s.airspeed) || 0);
        const level = clamp(Math.pow(v / 22, 2.4) * .42, 0, .9);
        const slip = clamp((s.yawSlip || 0) * 2.2 + (s.bank || 0) * .45, -1, 1);
        burst = burst * .9 + (Math.random() < (.02 + .08 * gust) ? rand(.3, .9) * gust : 0);
        const turb = 1 + .55 * burst + .25 * (gust - .5);
        ears.forEach((e, i) => {
          const side = i === 0 ? -slip : slip; // positive: this ear faces the airflow
          e.g.gain.setTargetAtTime(level * turb * (1 + .38 * side), now, .06);
          e.lp.frequency.setTargetAtTime(280 + 55 * v * (1 + .3 * side) + 900 * burst, now, .08);
        });
        const flap = smooth(26, 42, v);
        flutter.gain.setTargetAtTime(.32 * flap, now, .1); // AM around this base: 0 to 2x
        depth.gain.setTargetAtTime(.32 * flap, now, .1);
        lfo.frequency.setTargetAtTime(20 + .35 * v, now, .2);
        band.frequency.setTargetAtTime(180 + 6 * v, now, .2);
        out.gain.setTargetAtTime(.55, now, .2);
      },
      stop(now) { out.gain.setTargetAtTime(0, now, .1); }
    };
  }

  // ---- regional definitions -----------------------------------------------------
  // Events: clip, every [min,max] seconds, where(ctx) -> position or path,
  // gain at ref metres, reach in metres, optional when(ctx) condition.
  const at = (re, dy = 0, jitter = 0) => c => {
    const p = landmark(c.world, re); if (!p) return null;
    const x = p.x + rand(-jitter, jitter), z = p.z + rand(-jitter, jitter);
    return {x, y: ground(c.world, x, z) + dy, z};
  };
  const onWater = (r0, r1, dy = .6) => c => {
    const p = randomWaterNear(c.world, c.ear.x, c.ear.z, r0, r1); if (!p) return null;
    return {x: p.x, y: (waterLevel(c.world) ?? ground(c.world, p.x, p.z)) + dy, z: p.z};
  };
  const onCliff = (r0, r1) => c => steepNear(c.world, c.ear.x, c.ear.z, r0, r1);
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
  const inTrees = (r0, r1, frac = .6) => c => {
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(r0, r1), x = c.ear.x + Math.cos(a) * r, z = c.ear.z + Math.sin(a) * r;
      const t = c.world.habitat?.nearestTree?.(x, z, 40);
      if (t) return {x: t.x, y: t.y + t.height * frac, z: t.z};
    }
    return null;
  };
  const onGround = (r0, r1) => c => {
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(r0, r1), x = c.ear.x + Math.cos(a) * r, z = c.ear.z + Math.sin(a) * r;
      if (!isWet(c.world, x, z)) return {x, y: ground(c.world, x, z) + .5, z};
    }
    return null;
  };

  const scapes = {
    alaska: {
      falls: {clip: 'scape-alaska-nugget-falls', ref: 70, reach: 3200, gain: .95},
      water: [{clip: 'scape-alaska-meltwater', kind: 'stream', ref: 18, reach: 500, gain: .55, maxR: 350}],
      events: [
        // Calving at the terminus; booms carry across the lake with a delay.
        {clip: ['scape-alaska-calving', 'scape-alaska-calving-alt'], every: [38, 95], ref: 450, reach: 9000, gain: .9, wet: .9,
          where: c => { const g = landmark(c.world, /Mendenhall Glacier/); const p = landmark(c.world, /Blue Ice/);
            if (!g) return null; const t = Math.random(); const x = (p ? p.x : g.x) + rand(-520, 520), z = (p ? p.z : g.z) + rand(-120, 160);
            return {x, y: (waterLevel(c.world) ?? 0) + rand(8, 40), z}; }},
        {clip: 'scape-alaska-varied-thrush', every: [14, 30], ref: 20, reach: 650, gain: .6, where: inTrees(60, 420, .7)},
        {clip: 'scape-alaska-pacific-wren', every: [18, 40], ref: 12, reach: 320, gain: .55, where: inTrees(40, 250, .1)},
        {clip: 'scape-alaska-arctic-tern', every: [22, 55], ref: 25, reach: 700, gain: .55, where: onWater(80, 600, 6)}
      ]
    },
    canyon: {
      water: [{clip: 'scape-canyon-colorado-river', kind: 'river', ref: 35, reach: 1600, gain: .9, maxR: 1200, span: 140}],
      beds: [{clip: 'scape-canyon-canyon-wind', ref: 1, gain: c => .10 + .38 * c.exposure * (.6 + .5 * c.gust)}],
      events: [
        {clip: 'scape-canyon-swifts', every: [9, 22], ref: 15, reach: 500, gain: .65, moving: true,
          where: c => { const path = passPath(c.ear, {offset: [20, 160], length: 420, speed: 28}); return {path: {...path, y: c.ear.y + rand(-40, 40)}}; }},
        {clip: 'scape-canyon-swallows', every: [16, 34], ref: 10, reach: 280, gain: .5, where: onCliff(40, 300)},
        {clip: 'scape-canyon-rockfall', every: [70, 160], ref: 30, reach: 1400, gain: .7, where: onCliff(120, 700)},
        {clip: 'scape-canyon-ravens-canyon', every: [40, 90], ref: 25, reach: 900, gain: .55, where: onCliff(100, 600)}
      ]
    },
    swiss: {
      falls: {clip: 'scape-swiss-alpine-falls', ref: 45, reach: 2400, gain: .85},
      beds: [{clip: 'scape-swiss-alpine-wind', ref: 1, gain: c => .06 + .32 * c.exposure * (.6 + .5 * c.gust)}],
            events: [
        {clip: 'scape-swiss-black-redstart', every: [16, 34], ref: 12, reach: 320, gain: .55, where: onCliff(40, 300)},
        {clip: 'scape-swiss-water-pipit', every: [18, 40], ref: 10, reach: 260, gain: .5, where: onGround(40, 250)},
        {clip: 'scape-swiss-rockfall-alps', every: [110, 260], ref: 60, reach: 4000, gain: .7, wet: .9, where: onCliff(400, 1800)}
      ]
    },
    yosemite: {
      falls: {clip: 'scape-yosemite-yosemite-falls', ref: 150, reach: 6000, gain: .95},
      water: [{clip: 'scape-yosemite-merced-river', kind: 'river', ref: 28, reach: 1200, gain: .75, maxR: 900, span: 120}],
      events: [
        {clip: 'scape-yosemite-coyote', every: [80, 200], ref: 90, reach: 3500, gain: .6, wet: .8, where: onGround(500, 1600)},
        {clip: 'scape-yosemite-brewers-blackbird', every: [16, 36], ref: 12, reach: 300, gain: .5, where: at(/El Capitan Meadow/, 1, 250)},
        {clip: 'scape-yosemite-steller-jay-yosemite', every: [26, 60], ref: 18, reach: 450, gain: .5, where: inTrees(50, 350, .7)},
        {clip: 'scape-yosemite-rockfall-granite', every: [200, 420], ref: 120, reach: 6000, gain: .6, wet: 1, where: onCliff(600, 2500)}
      ]
    },
    crater: {
      storm: {front: [.948683, .316228], speed: 17, head: -2590, period: 18000, cloudY: 3000},
      beds: [{clip: 'scape-crater-rim-wind', ref: 1, gain: c => .08 + .36 * c.exposure * (.6 + .5 * c.gust)}],
      events: [
        {clip: 'scape-crater-canada-jay', every: [24, 55], ref: 15, reach: 380, gain: .5, where: inTrees(40, 260, .6)}
      ]
    },
    lofoten: {
      water: [{clip: 'scape-lofoten-waves-rocks', kind: 'shore', ref: 25, reach: 900, gain: .8, maxR: 700, span: 160}],
      events: [
        {clip: 'scape-lofoten-white-tailed-eagle', every: [60, 140], ref: 40, reach: 1600, gain: .6, wet: .7, where: onCliff(200, 900)},
        {clip: 'scape-lofoten-herring-gull', every: [14, 32], ref: 25, reach: 700, gain: .55, where: onWater(60, 500, 3)},
        {clip: 'scape-lofoten-arctic-tern-colony', every: [30, 70], ref: 30, reach: 800, gain: .55, where: onWater(100, 600, 4)}
      ]
    },
    milford: {
      falls: {clip: 'scape-milford-big-waterfall', ref: 160, reach: 7000, gain: 1},
      beds: [{clip: 'scape-milford-rainforest-rain', ref: 1, gain: c => .16 * (1 - smooth(60, 260, c.agl)) + .05}],
      events: [
        {clip: 'scape-milford-weka', every: [30, 70], ref: 18, reach: 450, gain: .5, where: onGround(40, 300)},
        {clip: 'scape-milford-kaka', every: [50, 120], ref: 30, reach: 800, gain: .5, where: inTrees(80, 500, .8)},
        {clip: 'scape-milford-fiordland-penguin', every: [80, 180], ref: 18, reach: 400, gain: .5, where: onWater(40, 300, .4)}
      ]
    },
    winnipesaukee: {
      events: [
        {clip: 'scape-winnipesaukee-dock-creak', every: [30, 70], ref: 8, reach: 220, gain: .5,
          where: c => { const d = [landmark(c.world, /Weirs Beach Boardwalk/), landmark(c.world, /Alton Bay Water Bandstand/)].filter(Boolean)
            .map(p => ({p, d: Math.hypot(p.x - c.ear.x, p.z - c.ear.z)})).sort((a, b) => a.d - b.d)[0];
            return d && d.d < 260 ? {x: d.p.x + rand(-25, 25), y: (waterLevel(c.world) ?? 153) + .8, z: d.p.z + rand(-25, 25)} : null; }},
        {clip: 'scape-winnipesaukee-veery', every: [18, 40], ref: 15, reach: 400, gain: .55, where: inTrees(40, 300, .2)},
        {clip: 'scape-winnipesaukee-wood-thrush', every: [20, 45], ref: 18, reach: 450, gain: .55, where: inTrees(40, 300, .4)},
        {clip: 'scape-winnipesaukee-chipmunk', every: [35, 80], ref: 6, reach: 150, gain: .45, where: onGround(20, 120)}
      ]
    },
    surry: {
      water: [{clip: 'scape-surry-ashuelot-riffles', kind: 'river', ref: 16, reach: 600, gain: .65, maxR: 500, span: 90}],
      loops: [{clip: 'scape-surry-dam-outlet', ref: 55, reach: 2400, gain: .85, where: at(/Surry Mountain Dam/, 4, 0)}],
      beds: [{clip: 'scape-surry-dog-day-cicada', ref: 1, gain: c => .22 * (1 - smooth(40, 220, c.agl)) * (1 - c.town)}],
      events: [
        {clip: 'scape-surry-town-church-bell', every: [120, 260], ref: 220, reach: 7000, gain: .6, wet: .7, where: c => ({x: 1860, y: ground(c.world, 1860, 4290) + 24, z: 4290})},
        {clip: 'scape-surry-gray-catbird', every: [20, 45], ref: 12, reach: 300, gain: .5, where: inTrees(30, 220, .25)},
        {clip: 'scape-surry-song-sparrow', every: [16, 38], ref: 12, reach: 320, gain: .5, where: onGround(30, 250)},
        {clip: 'scape-surry-gray-treefrog', every: [40, 90], ref: 12, reach: 280, gain: .45, where: inTrees(20, 200, .15)}
      ]
    },
    dixville: {
      water: [{clip: 'scape-dixville-notch-brook', kind: 'stream', ref: 14, reach: 450, gain: .6, maxR: 380, span: 70}],
      beds: [{clip: 'scape-dixville-dry-leaves', ref: 1, gain: c => (.06 + .22 * c.gust) * c.canopy}],
      events: [
        {clip: 'scape-dixville-white-throated-sparrow', every: [14, 30], ref: 16, reach: 420, gain: .6, where: inTrees(40, 300, .2)},
        {clip: 'scape-dixville-ruffed-grouse-drum', every: [60, 140], ref: 25, reach: 700, gain: .55, where: onGround(80, 500)},
        {clip: 'scape-dixville-canada-geese-migrating', every: [120, 280], ref: 60, reach: 2500, gain: .55, moving: true, where: inSky([150, 380], [50, 600], 3000, 18)},
        {clip: 'scape-dixville-pileated-woodpecker', every: [50, 120], ref: 30, reach: 900, gain: .55, where: inTrees(80, 500, .6)},
        {clip: 'scape-dixville-blue-jay', every: [24, 55], ref: 20, reach: 500, gain: .55, where: inTrees(40, 350, .7)}
      ]
    },
    labrador: {
      shower: true,
      events: [
        {clip: 'scape-labrador-swainsons-thrush', every: [16, 34], ref: 16, reach: 420, gain: .6, where: inTrees(40, 300, .4)},
        {clip: 'scape-labrador-boreal-chickadee', every: [24, 55], ref: 10, reach: 250, gain: .5, where: inTrees(30, 220, .5)},
        {clip: 'scape-labrador-white-throated-sparrow-qc', every: [18, 42], ref: 16, reach: 420, gain: .55, where: inTrees(40, 320, .2)},
        {clip: 'scape-labrador-black-flies', every: [30, 70], ref: 1.5, reach: 25, gain: .35, when: c => c.agl < 25,
          where: c => ({x: c.ear.x + rand(-1.5, 1.5), y: c.ear.y + rand(-.5, .8), z: c.ear.z + rand(-1.5, 1.5)})}
      ]
    },
    moosehead: {
      events: [
        {clip: 'scape-moosehead-ovenbird', every: [16, 36], ref: 16, reach: 420, gain: .55, where: inTrees(40, 300, .15)},
        {clip: 'scape-moosehead-black-throated-green', every: [20, 45], ref: 12, reach: 300, gain: .5, where: inTrees(40, 260, .8)},
        {clip: 'scape-moosehead-red-breasted-nuthatch', every: [24, 55], ref: 8, reach: 200, gain: .45, where: inTrees(30, 200, .7)},
        {clip: 'scape-moosehead-loon-tremolo', every: [60, 140], ref: 120, reach: 4000, gain: .6, wet: .8, where: onWater(300, 2000, .4)}
      ]
    }
  };
  window.aerieSoundscapes = scapes;

  window.makeSoundscape = function makeSoundscape(context, world, region, destination) {
    const spec = scapes[region] || {}, air = climate[region] || {};
    const engine = window.makeSpatialAudio(context, world, {climate: air});
    engine.setSurveyPath(window.aerieSoundPath);
    engine.output.connect(destination);
    const buffers = new Map(), loading = new Map();
    function load(id) {
      if (buffers.has(id)) return Promise.resolve(buffers.get(id));
      if (loading.has(id)) return loading.get(id);
      const name = id + '.m4a';
      const task = fetch(window.aerieAssetURL?.(name) || name)
        .then(r => { if (!r.ok) throw Error('missing ' + name); return r.arrayBuffer(); })
        .then(d => context.decodeAudioData(d))
        .then(b => { buffers.set(id, b); return b; })
        .catch(() => { buffers.set(id, null); return null; })
        .finally(() => loading.delete(id));
      loading.set(id, task); return task;
    }
    const ids = new Set();
    const listClips = c => Array.isArray(c) ? c : [c];
    for (const e of spec.events || []) listClips(e.clip).forEach(id => ids.add(id));
    for (const g of [spec.falls, ...(spec.water || []), ...(spec.beds || []), ...(spec.loops || [])]) if (g) ids.add(g.clip);
    for (const id of ids) load(id);
    load('ir-' + (air.ir || 'lake')).then(b => engine.setImpulse(b, (irLevel[air.ir || 'lake'] || .0002) * 7.5));
    if (spec.shower || spec.storm) { load('scape-' + region + '-rain-on-lake'); load('scape-' + region + '-rain-on-spruce'); load('scape-' + region + '-rain-approach'); }
    if (spec.storm) { load('scape-crater-thunder-near'); load('scape-crater-thunder-far'); }

    // Existing regional beds handed over by field-audio.js become 3D sources.
    // A world's own recording takes priority; the generic bed is the fallback.
    const fallback = {}, extraWater = [], extraBeds = [];
    const clipOf = g => g.buffer || buffers.get(g.clip) || null;
    function adopt(role, buffer) {
      if (!buffer) return false;
      if (role === 'lake' || role === 'surf' || role === 'inlet') {
        if ((spec.water || []).some(w => w.kind === 'shore')) return true;
        if (!extraWater.some(w => w.role === role)) extraWater.push({role, buffer, kind: 'shore', ref: role === 'lake' ? 16 : 28, reach: role === 'lake' ? 650 : 1000, gain: role === 'lake' ? .7 : .85, maxR: 700, span: 150});
        // Small wavelets directly below when skimming open water.
        if (role === 'lake' && !extraBeds.some(b => b.role === 'wavelets'))
          extraBeds.push({role: 'wavelets', buffer, height: -8, gain: c => c.overWater ? .26 * (1 - smooth(6, 45, c.agl)) * (.7 + .4 * c.gust) : 0});
        return true;
      }
      if (role === 'cascade') { fallback.falls = buffer; return true; }
      if (role === 'river') {
        if ((spec.water || []).some(w => w.kind === 'river')) { fallback.river = buffer; return true; }
        if (!extraWater.some(w => w.role === role)) extraWater.push({role, buffer, kind: 'river', ref: 20, reach: 900, gain: .65, maxR: 700, span: 110});
        return true;
      }
      if (role === 'canopy') {
        if (!extraBeds.some(b => b.role === role)) extraBeds.push({role, buffer, gain: c => (.20 + .45 * c.gust) * c.canopy});
        return true;
      }
      return false;
    }
    let enabled = false;
    const state = {falls: new Map(), water: [], beds: [], loops: [], movers: new Set(), rain: null, due: new Map()};
    const rainTex = {};
    function rainTexture(surface, density) {
      const key = surface + density;
      return rainTex[key] || (rainTex[key] = synthRain(context, surface, density));
    }
    function stopAll() {
      for (const s of state.falls.values()) s.stop(.4);
      for (const w of state.water) w.emitters.forEach(s => s.stop(.4));
      for (const b of state.beds) b.emitters.forEach(s => s.stop(.4));
      for (const l of state.loops) l.source?.stop(.4);
      for (const m of state.movers) m.source.stop(.3);
      if (state.rain) state.rain.emitters.forEach(s => s.stop(.4));
      state.falls.clear(); state.water = []; state.beds = []; state.loops = []; state.movers.clear(); state.rain = null;
    }
    function setEnabled(value) {
      if (enabled === value) return; enabled = value;
      if (!enabled) { stopAll(); airflow?.stop(context.currentTime); return; }
      const now = context.currentTime;
      for (const [i, e] of (spec.events || []).entries()) state.due.set(i, now + rand(2, Math.min(25, e.every[0])));
    }

    // Four decorrelated emitters 18 m around the listener form a diffuse bed.
    function makeBed(clip, gain, height = 4) {
      const b = typeof clip === 'string' ? buffers.get(clip) : clip; if (!b) return null;
      const emitters = [];
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4;
        const s = engine.loop(b, {x: engine.ear.x, y: engine.ear.y, z: engine.ear.z}, {gain: 0, ref: 18, spread: 'none', occlude: false, doppler: false, wet: .25, offset: (i * .27 * b.duration) % b.duration});
        s.angle = a; s.height = height; emitters.push(s);
      }
      return {clip, emitters, gainFn: gain};
    }
    function placeBed(bed, level, now) {
      for (const s of bed.emitters) {
        s.x = engine.ear.x + Math.cos(s.angle) * 18; s.z = engine.ear.z + Math.sin(s.angle) * 18; s.y = engine.ear.y + s.height;
        s.gain = level * .5;
      }
    }

    let thunderDue = 0, ctx = null, ticks = null, airflow = null;
    function stormDepth(storm, x, z, t) {
      const [ax, az] = storm.front, sx = -az, sz = ax, side = x * sx + z * sz;
      const edge = 175 * Math.sin(side * .00073) + 112 * Math.sin(side * .00181 + .7) + 43 * Math.sin(side * .0031);
      const raw = x * ax + z * az - (storm.head - t * storm.speed) - edge;
      return ((raw + 7000) % storm.period + storm.period) % storm.period - 7000;
    }
    function strike(storm, t) {
      // Search the rain bank for a cell 1.5-12 km away.
      for (let i = 0; i < 60; i++) {
        const a = Math.random() * Math.PI * 2, r = rand(1500, 12000), x = engine.ear.x + Math.cos(a) * r, z = engine.ear.z + Math.sin(a) * r;
        const d = stormDepth(storm, x, z, t);
        if (d > 400 && d < 4200) return {x, y: ground(world, x, z), z};
      }
      return null;
    }
    function thunder(storm, t) {
      const s = strike(storm, t); if (!s) return;
      const synth = synthThunder(context, s, storm.cloudY + rand(-300, 300), engine.ear, engine.absorption);
      const pos = {x: s.x, y: (s.y + storm.cloudY) / 2, z: s.z};
      engine.play(synth.buffer, pos, {gain: .9, ref: 900, reach: 30000, wet: .9, occlude: false});
      // Recorded rumble tail adds the cloud-to-cloud body the channel model lacks.
      const far = buffers.get('scape-crater-thunder-far');
      if (far && Math.random() < .55) engine.play(far, pos, {gain: .45, ref: 1500, reach: 30000, wet: 1, occlude: false, when: rand(.6, 2.2)});
      window.dispatchEvent(new CustomEvent('aerie-lightning', {detail: {x: s.x, z: s.z, cloudY: storm.cloudY, distance: synth.nearest}}));
    }
    function rainLevel(s, t) {
      if (spec.shower) {
        const mark = landmark(world, /rainbow|shower|arc-en-ciel/i); if (!mark || !world.windField) return 0;
        const f = world.windField, shift = 240 * Math.sin(t * f.advection / 240);
        const cx = mark.x + f.direction.x * shift, cz = mark.z + f.direction.z * shift;
        const sun = world.sunDirection, ax = -sun.x, az = -sun.z, al = Math.hypot(ax, az) || 1;
        const axisX = ax / al, axisZ = az / al, sideX = -axisZ, sideZ = axisX;
        const dx = s.x - cx, dz = s.z - cz, across = dx * sideX + dz * sideZ, along = dx * axisX + dz * axisZ;
        return (1 - smooth(140, 470, Math.abs(along))) * (1 - smooth(650, 1600, Math.abs(across)));
      }
      if (spec.storm) { const d = stormDepth(spec.storm, s.x, s.z, t); return smooth(-310, 330, d) * (1 - smooth(4700, 7400, d)); }
      return 0;
    }

    let nextScan = 0, shore = null;
    function update(s, camera, dt, extras = {}) {
      if (!enabled) return;
      engine.update(camera, dt);
      const now = context.currentTime, t = s.elapsed || 0, ear = engine.ear;
      airflow = airflow || makeAirflow(context, destination);
      airflow.update(s, extras.gust ?? .5, now);
      const agl = Math.max(0, ear.y - ground(world, ear.x, ear.z));
      ctx = {world, ear, agl, exposure: extras.exposure ?? clamp(agl / 200, 0, 1), gust: extras.gust ?? .5, canopy: extras.canopy ?? 0,
        shore: extras.shore, town: 0, t, overWater: isWet(world, ear.x, ear.z)};
      const keene = landmark(world, /Central Square/);
      if (keene) ctx.town = 1 - smooth(300, 1400, Math.hypot(ear.x - keene.x, ear.z - keene.z));
      if (now < nextScan) { tickEvents(now); return; }
      nextScan = now + .25;

      // Waterfalls: keep the nearest three impacts as looping 3D sources.
      const fallsClip = spec.falls ? (buffers.get(spec.falls.clip) || fallback.falls) : fallback.falls;
      const fallsSpec = spec.falls || {ref: 40, reach: 2200, gain: .8};
      if (fallsClip) {
        const impacts = world.waterfalls?.impacts || world.spraySources || (world.landmarks || []).filter(p => /fall|cascade|forsen|flume/i.test(p.name));
        const ranked = impacts.map((p, i) => ({p, i, d: Math.hypot(p.x - ear.x, p.z - ear.z)})).sort((a, b) => a.d - b.d).slice(0, 3)
          .filter(o => o.d < fallsSpec.reach);
        const keep = new Set(ranked.map(o => o.i));
        for (const [i, src] of state.falls) if (!keep.has(i)) { src.stop(1.5); state.falls.delete(i); }
        for (const {p, i} of ranked) if (!state.falls.has(i)) {
          const y = (p.y ?? ground(world, p.x, p.z)) + Math.min(14, 3 + .2 * (p.drop || 20));
          const size = clamp(.55 + (p.drop || 40) / 160 + (p.width || 10) / 80, .5, 1.25);
          state.falls.set(i, engine.loop(fallsClip, {x: p.x, y, z: p.z}, {gain: fallsSpec.gain * size, ref: fallsSpec.ref * size, reach: fallsSpec.reach, wet: .6, rate: clamp(1.08 - (p.drop || 40) / 900, .9, 1.08)}));
        }
      }
      // Rivers, streams and rocky shores: three emitters on the nearest water.
      [...(spec.water || []), ...extraWater].forEach((w, k) => {
        const b = clipOf(w) || (w.kind === 'river' ? fallback.river : null); if (!b) return;
        let entry = state.water[k];
        if (!entry) entry = state.water[k] = {emitters: []};
        // Lapping belongs on the nearest shoreline, never under the bird mid-lake.
        let p = w.kind === 'shore' && ctx.shore ? {x: ctx.shore.x, z: ctx.shore.z, d: Math.hypot(ctx.shore.x - ear.x, ctx.shore.z - ear.z)} : nearestWater(world, ear.x, ear.z, w.maxR);
        if (p && p.d > w.maxR) p = null;
        if (!p) { entry.emitters.forEach(e => e.stop(1.2)); entry.emitters = []; return; }
        const pts = [p, ...waterReach(world, p, w.span || 100)];
        while (entry.emitters.length < pts.length) entry.emitters.push(engine.loop(b, {x: p.x, y: 0, z: p.z}, {gain: w.gain, ref: w.ref, reach: w.reach, spread: w.kind === 'river' ? 'line' : 'point', wet: .45}));
        entry.emitters.forEach((e, i) => {
          const q = pts[i] || p, gy = waterLevel(world);
          // Emitters glide along the water instead of jumping.
          e.x += (q.x - e.x) * (e.y === 0 ? 1 : .35); e.z += (q.z - e.z) * (e.y === 0 ? 1 : .35);
          e.y = (w.kind === 'river' ? ground(world, e.x, e.z) : (gy ?? ground(world, e.x, e.z))) + .5;
          e.gain = w.gain * (i === 0 ? 1 : .7);
        });
      });
      // Fixed loops at modeled structures (the Surry dam outlet).
      (spec.loops || []).forEach((l, k) => {
        const b = buffers.get(l.clip); if (!b) return;
        let entry = state.loops[k];
        if (!entry) { const pos = l.where({...ctx}); if (!pos) return; entry = state.loops[k] = {pos}; }
        const d = Math.hypot(entry.pos.x - ear.x, entry.pos.z - ear.z);
        if (d < l.reach && !entry.source) entry.source = engine.loop(b, entry.pos, {gain: l.gain, ref: l.ref, reach: l.reach, wet: .5});
        else if (d > l.reach * 1.1 && entry.source) { entry.source.stop(1); entry.source = null; }
      });
      // Diffuse beds driven by local conditions.
      [...(spec.beds || []), ...extraBeds].forEach((b, k) => {
        if (!state.beds[k]) { const bed = makeBed(b.buffer || b.clip, b.gain, b.height ?? 4); if (!bed) return; state.beds[k] = bed; }
        placeBed(state.beds[k], clamp(b.gain(ctx), 0, 1.2), now);
      });
      // Rain at the eagle: recorded rain plus synthesised near drops on the surface below.
      const rain = rainLevel(ear, t);
      if (rain > .01 && !state.rain) {
        const below = isWet(world, ear.x, ear.z) ? 'water' : (world.habitat?.nearestTree?.(ear.x, ear.z, 25) ? 'leaves' : 'rock');
        const rec = buffers.get('scape-' + region + (below === 'water' ? '-rain-on-lake' : '-rain-on-spruce')) || buffers.get('scape-' + region + '-rain-approach');
        const emitters = [];
        const tex = rainTexture(below, region === 'crater' ? 900 : 420);
        for (let i = 0; i < 4; i++) {
          const opt = {gain: 0, ref: 18, spread: 'none', occlude: false, doppler: false, wet: .2, offset: i * .9};
          const e = engine.loop(i % 2 && rec ? rec : tex, {x: ear.x, y: ear.y, z: ear.z}, opt);
          e.angle = i * Math.PI / 2 + Math.PI / 4; e.height = i % 2 ? -12 : -4; emitters.push(e);
        }
        state.rain = {emitters};
      }
      if (state.rain && rain > .2) {
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
      if (spec.storm && now >= thunderDue) {
        thunderDue = now + rand(14, 42);
        if (enabled) thunder(spec.storm, t);
      }
      tickEvents(now);
    }
    function tickEvents(now) {
      const ear = engine.ear;
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
        state.due.set(i, now + rand(e.every[0], e.every[1]));
        if (e.when && !e.when(ctx)) return;
        const clip = Array.isArray(e.clip) ? pick(e.clip.filter(id => buffers.get(id))) : e.clip;
        const b = clip && buffers.get(clip); if (!b) return;
        const where = e.where(ctx); if (!where) return;
        if (where.path) {
          const p = where.path;
          const src = engine.loop(b, {x: p.ax, y: p.y, z: p.az}, {gain: 0, ref: e.ref, reach: e.reach, wet: e.wet ?? .5});
          state.movers.add({source: src, path: p, start: now, gain: e.gain});
        } else {
          if (Math.hypot(where.x - ear.x, where.y - ear.y, where.z - ear.z) > e.reach) return;
          engine.play(b, where, {gain: e.gain, ref: e.ref, reach: e.reach, wet: e.wet ?? .45, rate: rand(.985, 1.015)});
        }
      });
    }
    return {engine, setEnabled, update, load, buffers, adopt};
  };
})();
