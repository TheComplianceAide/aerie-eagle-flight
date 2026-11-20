// Physical outdoor propagation and binaural rendering for every sound in a world.
//
// Each source is encoded into 3rd-order ambisonics (ACN/SN3D, 16 channels)
// relative to the eagle's head and rendered binaurally by Omnitone 2.0
// (Google, Apache-2.0) with the SADIE HRIR set. Between source and ears:
//   - propagation delay (distance / speed of sound). Because the delay line
//     follows the changing distance, approaching and receding sources carry a
//     true Doppler shift;
//   - spherical spreading (point sources) or cylindrical spreading (rivers);
//   - ISO 9613-1 atmospheric absorption for the world's temperature and
//     humidity, applied as a distance-dependent low-pass;
//   - terrain diffraction from the survey's ridge screening;
//   - a send into the world's simulated reverberation (pyroomacoustics IRs);
//   - refraction by the wind gradient (louder downwind, a shadow upwind) and,
//     in calm dawn air, by a temperature inversion that bends sound back down;
//   - turbulent scintillation: distant sources waver by a few decibels;
//   - real-time echoes: loud sources are mirrored across the cliff faces found
//     around the listener (image sources), so each echo arrives from the actual
//     wall with the correct extra delay, direction, Doppler and air loss.
// Distances are survey metres; listener and sources use world coordinates.
window.makeSpatialAudio = function makeSpatialAudio(context, world, options = {}) {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const order = options.order || (coarse ? 1 : 3);
  const channels = (order + 1) * (order + 1);
  const climate = Object.assign({tempC: 15, humidity: 70, pressure: 101.325, inversion: 0, windRefract: 1}, options.climate);
  let SPEED = 331.3 * Math.sqrt(1 + climate.tempC / 273.15);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const output = context.createGain();
  const bus = context.createGain();
  bus.channelCount = channels; bus.channelCountMode = 'explicit'; bus.channelInterpretation = 'discrete';
  // Head profiles: Omnitone's built-in SADIE KU100 set, six measured HUTUBS
  // heads (CC BY 4.0) and an eagle-sized rigid sphere, each converted to
  // 3rd-order decoders by tools/acoustics/make_hrirs.py.
  let renderer = null, rendererReady = false, profile = 'default';
  function buildRenderer(name) {
    const config = {ambisonicOrder: order};
    if (name && name !== 'default' && order === 3)
      config.hrirPathList = [0, 1, 2, 3, 4, 5, 6, 7].map(k => { const f = 'hrir-' + name + '-' + k + '.wav'; return window.aerieAssetURL?.(f) || f; });
    const next = order > 1 ? Omnitone.createHOARenderer(context, config) : Omnitone.createFOARenderer(context);
    return next.initialize().then(() => {
      const previous = renderer;
      bus.connect(next.input); next.output.connect(output);
      if (previous) { try { bus.disconnect(previous.input); previous.output.disconnect(); } catch (e) {} }
      renderer = next; rendererReady = true; profile = name || 'default';
    });
  }
  function setHeadProfile(name) {
    return buildRenderer(name).catch(error => { console.warn('Aerie head profile unavailable', name, error); if (!renderer) return buildRenderer('default'); });
  }
  let storedProfile = 'default';
  try { storedProfile = localStorage.getItem('aerie-head-profile') || 'default'; } catch (e) {}
  try { setHeadProfile(storedProfile); } catch (error) { console.warn('Aerie spatial renderer unavailable', error); }
  // Raptor hearing (Eagle Ears): diurnal raptor audiograms are most sensitive
  // near 1-4 kHz and fall steeply above ~6 kHz (Dooling 1980; Dooling,
  // Lohr & Dent 2000). Bypassed for normal listening.
  const final = context.createGain(), hearing = [];
  for (const [type, f, g, q] of [['highpass', 160, 0, .7], ['peaking', 2200, 5, .9], ['highshelf', 6000, -12, .7], ['lowpass', 9500, 0, .7]]) {
    const b = context.createBiquadFilter(); b.type = type; b.frequency.value = f; b.gain.value = g; b.Q.value = q; hearing.push(b);
  }
  hearing.reduce((a, b) => (a.connect(b), b));
  output.connect(final);
  let raptor = false;
  function setRaptorHearing(on) {
    if (on === raptor) return; raptor = on;
    try { output.disconnect(); } catch (e) {}
    if (on) { output.connect(hearing[0]); hearing[hearing.length - 1].connect(final); }
    else { try { hearing[hearing.length - 1].disconnect(final); } catch (e) {} output.connect(final); }
  }

  // Reverberation: a stereo convolution of a world-specific impulse response.
  const reverbIn = context.createGain(), convolver = context.createConvolver(), reverbOut = context.createGain();
  convolver.normalize = false;
  reverbIn.connect(convolver).connect(reverbOut).connect(output);
  reverbOut.gain.value = 1;
  function setImpulse(buffer, level = 1) { if (buffer) { convolver.buffer = buffer; reverbOut.gain.value = level; } }

  // ---- ISO 9613-1 atmospheric absorption ------------------------------------
  function absorption(f) { // dB per metre
    const T = climate.tempC + 273.15, T0 = 293.15, T01 = 273.16, pa = climate.pressure, pr = 101.325;
    const psat = Math.pow(10, -6.8346 * Math.pow(T01 / T, 1.261) + 4.6151);
    const h = climate.humidity * psat * (pr / pa);
    const frO = (pa / pr) * (24 + 4.04e4 * h * (0.02 + h) / (0.391 + h));
    const frN = (pa / pr) * Math.pow(T / T0, -0.5) * (9 + 280 * h * Math.exp(-4.170 * (Math.pow(T / T0, -1 / 3) - 1)));
    return 8.686 * f * f * (1.84e-11 * (pr / pa) * Math.sqrt(T / T0) + Math.pow(T / T0, -2.5) *
      (0.01275 * Math.exp(-2239.1 / T) / (frO + f * f / frO) + 0.1068 * Math.exp(-3352 / T) / (frN + f * f / frN)));
  }
  // Frequency at which a path loses 3 dB to the air, tabulated on a log scale.
  const cutoffTable = [];
  function buildCutoffs() {
  cutoffTable.length = 0;
  for (let i = 0; i <= 64; i++) {
    const d = 10 * Math.pow(2000, i / 64); // 10 m .. 20 km
    let lo = Math.log(80), hi = Math.log(22000);
    for (let n = 0; n < 24; n++) { const m = (lo + hi) / 2; if (absorption(Math.exp(m)) * d > 3) hi = m; else lo = m; }
    cutoffTable.push(Math.exp((lo + hi) / 2));
  }
  }
  buildCutoffs();
  function airCutoff(d) {
    if (d <= 10) return 20000;
    const x = clamp(Math.log(d / 10) / Math.log(2000) * 64, 0, 64), i = Math.floor(Math.min(63, x)), t = x - i;
    return Math.min(20000, Math.exp(Math.log(cutoffTable[i]) * (1 - t) + Math.log(cutoffTable[i + 1]) * t));
  }
  let loss1k = absorption(1000);
  // Live air (soundscapes.js fetches current conditions): re-derive the
  // speed of sound and the absorption table.
  function setClimate(next) {
    Object.assign(climate, next);
    SPEED = 331.3 * Math.sqrt(1 + climate.tempC / 273.15);
    buildCutoffs(); loss1k = absorption(1000);
  }

  // ---- 3rd-order real spherical harmonics (ACN, SN3D) -------------------------
  const s3 = Math.sqrt(3), s58 = Math.sqrt(5 / 8), s152 = Math.sqrt(15) / 2, s38 = Math.sqrt(3 / 8);
  function harmonics(x, y, z, out) { // x front, y lateral (Omnitone's sign), z up
    out[0] = 1; if (channels === 1) return out;
    out[1] = y; out[2] = z; out[3] = x; if (channels === 4) return out;
    out[4] = s3 * x * y; out[5] = s3 * y * z; out[6] = .5 * (3 * z * z - 1); out[7] = s3 * x * z; out[8] = s3 / 2 * (x * x - y * y);
    if (channels === 9) return out;
    out[9] = s58 * y * (3 * x * x - y * y); out[10] = s152 * 2 * x * y * z; out[11] = s38 * y * (5 * z * z - 1);
    out[12] = .5 * z * (5 * z * z - 3); out[13] = s38 * x * (5 * z * z - 1); out[14] = s152 * z * (x * x - y * y);
    out[15] = s58 * x * (x * x - 3 * y * y);
    return out;
  }

  // ---- listener --------------------------------------------------------------
  const ear = {x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0};
  const inverse = new THREE.Quaternion(), temp = new THREE.Vector3();
  let surveyPath = null;
  function setListener(camera, dt) {
    const p = camera.position;
    if (dt > 0) { ear.vx = (p.x - ear.x) / dt; ear.vy = (p.y - ear.y) / dt; ear.vz = (p.z - ear.z) / dt; }
    ear.x = p.x; ear.y = p.y; ear.z = p.z;
    inverse.copy(camera.quaternion).invert();
  }

  // ---- sources ---------------------------------------------------------------
  const live = new Set();
  const scratch = new Float32Array(16);
  // spread: 'point' (1/r), 'line' (1/sqrt r) or 'none' (diffuse, head-locked level)
  function createSource(node, opt = {}) {
    const s = {
      x: opt.x || 0, y: opt.y || 0, z: opt.z || 0, gain: opt.gain ?? 1, ref: opt.ref ?? 12, reach: opt.reach ?? 2000,
      spread: opt.spread || 'point', occlude: opt.occlude ?? true, wet: opt.wet ?? .35, doppler: opt.doppler ?? true,
      maxDelay: Math.min(179, (opt.reach ?? 2000) * (opt.echo ? 1.8 : 1) / SPEED + 1), lastShield: 0, nextShield: 0, alive: true, onUpdate: opt.onUpdate
    };
    s.delay = context.createDelay(s.maxDelay);
    s.air = context.createBiquadFilter(); s.air.type = 'lowpass'; s.air.Q.value = .5;
    s.shade = context.createBiquadFilter(); s.shade.type = 'lowpass'; s.shade.Q.value = .6; s.shade.frequency.value = 20000;
    s.level = context.createGain(); s.level.gain.value = 0;
    s.send = context.createGain(); s.send.gain.value = 0;
    s.merger = context.createChannelMerger(channels);
    s.coeffs = [];
    node.connect(s.delay); s.delay.connect(s.air).connect(s.shade).connect(s.level);
    for (let i = 0; i < channels; i++) { const g = context.createGain(); g.gain.value = 0; s.level.connect(g); g.connect(s.merger, 0, i); s.coeffs.push(g); }
    s.merger.connect(bus);
    s.level.connect(s.send).connect(reverbIn);
    s.input = node;
    s.images = [];
    s.release = () => {
      if (!s.alive) return; s.alive = false; live.delete(s);
      for (const im of s.images) im.release();
      try { node.disconnect(); } catch (e) {}
      for (const n of [s.delay, s.air, s.shade, s.level, s.send, s.merger, ...s.coeffs]) try { n.disconnect(); } catch (e) {}
    };
    // Prime the delay so a source starts at its true distance (no Doppler sweep from zero).
    const d0 = Math.hypot(s.x - ear.x, s.y - ear.y, s.z - ear.z);
    s.delay.delayTime.value = s.doppler ? Math.min(s.maxDelay - .01, d0 / SPEED) : 0;
    live.add(s);
    updateSource(s, context.currentTime, true);
    if (opt.echo && !opt.image) attachEchoes(s, node, opt);
    return s;
  }

  // ---- real-time cliff echoes -------------------------------------------------
  // Probe the terrain around the listener for steep faces that rise above it.
  let walls = [], wallAt = {x: Infinity, z: Infinity}, wallTime = -1;
  function probeWalls(now) {
    if (now - wallTime < .5 && Math.hypot(ear.x - wallAt.x, ear.z - wallAt.z) < 30) return;
    wallTime = now; wallAt = {x: ear.x, z: ear.z};
    const h = (x, z) => (world.elevation || world.height)(x, z), found = [];
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
      let prev = 0;
      for (const r of [15, 25, 40, 60, 85, 120, 165, 225, 300, 400, 520, 680, 880, 1150, 1500]) {
        const x = ear.x + dx * r, z = ear.z + dz * r, y = h(x, z);
        if (y > ear.y - 60) {
          // Refine to the face and read its slope and outward normal.
          let lo = prev, hi = r;
          for (let n = 0; n < 6; n++) { const m = (lo + hi) / 2; if (h(ear.x + dx * m, ear.z + dz * m) > ear.y - 60) hi = m; else lo = m; }
          const px = ear.x + dx * hi, pz = ear.z + dz * hi, py = Math.min(ear.y, h(px, pz));
          const gx = (h(px + 4, pz) - h(px - 4, pz)) / 8, gz = (h(px, pz + 4) - h(px, pz - 4)) / 8, slope = Math.hypot(gx, gz);
          if (slope > .7) {
            const nx = -gx / slope, nz = -gz / slope; // horizontal normal pointing out of the face
            if (nx * -dx + nz * -dz > .35) {
              const cover = world.groundCover?.(px, pz) || 0;
              const reflect = clamp((slope - .5) / 1.5, .25, 1) * (1 - .55 * clamp(cover, 0, 1));
              found.push({x: px, y: py, z: pz, nx, nz, r: hi, reflect});
            }
          }
          break;
        }
        prev = r;
      }
    }
    // Keep strong, distinct faces: reflectivity over distance, at least 40 degrees apart.
    found.sort((a, b) => b.reflect / (1 + b.r / 400) - a.reflect / (1 + a.r / 400));
    walls = [];
    for (const w of found) if (walls.length < 4 && walls.every(o => o.nx * w.nx + o.nz * w.nz < .77)) walls.push(w);
  }
  function mirror(s, w) {
    const k = (s.x - w.x) * w.nx + (s.z - w.z) * w.nz;
    return {x: s.x - 2 * k * w.nx, y: s.y, z: s.z - 2 * k * w.nz, valid: k > 5};
  }
  function attachEchoes(parent, node, opt) {
    for (let i = 0; i < 2; i++) {
      const image = createSource(node, {x: parent.x, y: parent.y, z: parent.z, gain: 0, ref: parent.ref, reach: parent.reach * 1.8,
        wet: 0, occlude: false, doppler: true, image: true});
      image.slot = i;
      image.onUpdate = () => {
        const w = walls[image.slot];
        const m = w && parent.alive ? mirror(parent, w) : null;
        if (!m || !m.valid) { image.gain = 0; return; }
        image.x = m.x; image.y = m.y; image.z = m.z;
        // Specular return off the face; rough rock and canopy keep less.
        image.gain = parent.gain * w.reflect * .8;
      };
      parent.images.push(image);
    }
  }
  function updateSource(s, now, immediate = false) {
    s.onUpdate?.(s, now);
    const dx = s.x - ear.x, dy = s.y - ear.y, dz = s.z - ear.z;
    const d = Math.max(.5, Math.hypot(dx, dy, dz));
    temp.set(dx, dy, dz).applyQuaternion(inverse); // camera space: +x right, +y up, -z forward
    const n = 1 / Math.max(1e-6, temp.length());
    harmonics(-temp.z * n, temp.x * n, temp.y * n, scratch);
    const tau = immediate ? 0 : .03;
    for (let i = 0; i < channels; i++) {
      if (immediate) s.coeffs[i].gain.value = scratch[i]; else s.coeffs[i].gain.setTargetAtTime(scratch[i], now, tau);
    }
    let spread = 1;
    if (s.spread === 'point') spread = s.ref / Math.max(s.ref, d);
    else if (s.spread === 'line') spread = Math.sqrt(s.ref / Math.max(s.ref, d));
    const fade = s.spread === 'none' ? 1 : 1 - clamp((d / s.reach - .8) / .2, 0, 1);
    // Broadband share of the air loss (the low-pass carries the frequency slope).
    const air = Math.pow(10, -loss1k * d / 20 * .5);
    if (s.occlude && surveyPath && now >= s.nextShield) {
      s.lastShield = surveyPath(world, ear, s); s.nextShield = now + .12;
    }
    const shield = s.occlude ? s.lastShield : 0;
    // Wind gradient: downwind paths refract toward the ground, upwind paths away.
    let refract = 1;
    const wind = world.windField;
    if (wind && d > 120) {
      const along = (-dx * wind.direction.x - dz * wind.direction.z) / Math.max(1, Math.hypot(dx, dz));
      const reachFactor = clamp((d - 120) / 900, 0, 1);
      refract *= 1 + .32 * climate.windRefract * along * reachFactor * (along < 0 ? 1.6 : 1);
      // Calm inversion (dawn over lakes) lifts distant levels.
      refract *= 1 + climate.inversion * clamp((d - 300) / 2500, 0, 1);
    }
    // Scintillation: a slow random walk whose depth grows with path length.
    if (d > 250) {
      // ~1 s correlation time; about 2 dB standard deviation at long range.
      s.wobble = (s.wobble || 0) * .985 + (Math.random() - .5) * .45;
      refract *= Math.pow(10, clamp(s.wobble, -1, 1) * clamp((d - 250) / 2000, 0, 1) * 3 / 20);
    }
    const level = s.gain * spread * air * fade * (1 - .62 * shield) * Math.max(.2, refract);
    const cutoff = Math.min(airCutoff(d), 20000 * Math.exp(-3.1 * shield));
    if (immediate) {
      s.level.gain.value = level; s.air.frequency.value = cutoff; s.shade.frequency.value = 20000;
    } else {
      s.level.gain.setTargetAtTime(level, now, .08);
      s.air.frequency.setTargetAtTime(cutoff, now, .12);
      if (s.doppler) s.delay.delayTime.setTargetAtTime(Math.min(s.maxDelay - .01, d / SPEED), now, .06);
    }
    // Direct-to-reverberant ratio falls with distance; enclosed walls return more.
    const wet = s.wet * clamp(.18 + d / 450, .18, 1.6) * (s.spread === 'none' ? .5 : 1);
    if (immediate) s.send.gain.value = wet * s.gain * .5; else s.send.gain.setTargetAtTime(wet * s.gain * .5 * (1 - .4 * shield), now, .2);
    s.distance = d;
  }

  // One-shot recording at a world position; released after it has fully arrived.
  function play(buffer, position, opt = {}) {
    if (!buffer) return null;
    const src = context.createBufferSource(); src.buffer = buffer;
    src.playbackRate.value = opt.rate || 1;
    const s = createSource(src, Object.assign({}, opt, position));
    const end = (opt.offset ? buffer.duration - opt.offset : buffer.duration) / src.playbackRate.value;
    src.start(context.currentTime + (opt.when || 0), opt.offset || 0, opt.duration);
    s.source = src;
    src.onended = () => setTimeout(() => s.release(), (s.maxDelay + .5) * 1000);
    s.endsAt = context.currentTime + (opt.when || 0) + end;
    return s;
  }
  // Continuous recording at a (possibly moving) position.
  function loop(buffer, position, opt = {}) {
    if (!buffer) return null;
    const src = context.createBufferSource(); src.buffer = buffer; src.loop = true;
    src.playbackRate.value = opt.rate || 1;
    const s = createSource(src, Object.assign({}, opt, position));
    src.start(context.currentTime, opt.offset ?? Math.random() * buffer.duration);
    s.source = src;
    s.stop = (fade = .6) => {
      const now = context.currentTime;
      s.level.gain.cancelScheduledValues(now); s.level.gain.setTargetAtTime(0, now, fade / 3);
      s.send.gain.setTargetAtTime(0, now, fade / 3);
      s.gain = 0;
      try { src.stop(now + fade + .1); } catch (e) {}
      src.onended = () => s.release();
    };
    return s;
  }
  function update(camera, dt) {
    if (!camera) return;
    setListener(camera, dt);
    const now = context.currentTime;
    probeWalls(now);
    for (const s of live) updateSource(s, now);
  }
  function setSurveyPath(fn) { surveyPath = fn; }
  return {
    context, output: final, play, loop, setHeadProfile, setRaptorHearing, get profile() { return profile; }, update, setImpulse, setSurveyPath, absorption, airCutoff, setClimate, climate,
    get speed() { return SPEED; }, ear, order, get walls() { return walls; }, get ready() { return rendererReady; }, get count() { return live.size; }
  };
};
