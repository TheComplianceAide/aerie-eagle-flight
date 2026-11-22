// Shared material recordings eligible for playback, independent of the local
// wildlife inventory. Weather, the actual support, and its leaves gate use.
window.aeriePerchRecordingIds = function aeriePerchRecordingIds(region) {
  if (region === 'canyon') return ['perch-grit'];
  const ids = ['perch-stone', 'perch-wet', 'perch-bark', 'perch-creak-a', 'perch-creak-b'];
  if (region !== 'lofoten') ids.push('perch-needle');
  if (region !== 'swiss' && region !== 'crater') ids.push('perch-leaf');
  if (region === 'alaska') ids.push('perch-ice');
  if (region === 'acadia') ids.push('perch-sand');
  if (region === 'moosehead') ids.push('perch-grit');
  return ids;
};

// Close, world-space Foley follows the load and toe motion in perch-flight.js.
window.makePerchAcoustics = function makePerchAcoustics(context, engine, world, region, load, buffers) {
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const contactClips = {bark: 'perch-bark', stone: 'perch-stone', grit: 'perch-grit', sand: 'perch-sand', ice: 'perch-ice'};
  const coniferRegion = ['alaska', 'crater', 'labrador', 'moosehead', 'swiss', 'yosemite', 'acadia'].includes(region);
  const active = new Set(), requested = new Set();
  let seen = 0, warmed = null, canopySite = null, canopySource = null, nextCanopy = 0, rearmCanopy = true;

  function materialOf(site) {
    return site.substrate || (site.type === 'branch' ? 'bark' : region === 'canyon' ? 'grit' : 'stone');
  }

  function canopyClip(site) {
    const tree = site.tree;
    const needle = tree?.aerieSpecies?.family ? tree.aerieSpecies.family === 'needle' : tree?.conifer ?? coniferRegion;
    return needle ? 'perch-needle' : 'perch-leaf';
  }

  function warm(id) {
    if (requested.has(id)) return;
    requested.add(id);
    if (!buffers.has(id)) load(id);
  }

  function warmSite(site) {
    if (!site || warmed === site) return;
    warmed = site;
    const material = materialOf(site);
    warm(contactClips[material]);
    if (material === 'bark') {
      warm('perch-creak-a');
      warm('perch-creak-b');
      warm(canopyClip(site));
    } else if (material !== 'ice') warm('perch-wet');
  }

  function play(id, position, options) {
    const buffer = buffers.get(id);
    if (!buffer || active.size >= 6) return null;
    const source = engine.play(buffer, position, {label: id, occlude: false, doppler: false, ...options});
    if (source) active.add(source);
    return source;
  }

  function contact(cue, ctx) {
    const {kind, site, position, strength, id, foot} = cue;
    const material = materialOf(site);
    const variation = Math.sin(id * 2.39996 + (site.seed || 0) * 16) * .075;
    if (kind === 'strain') {
      const creak = id % 2 ? 'perch-creak-a' : 'perch-creak-b';
      if (!buffers.has(creak)) return false;
      // A longer limb flexes more and settles at a lower pitch.
      const rate = clamp(1.08 - ((site.length || 3.1) - 3.1) * .09 + variation, .80, 1.21);
      play(creak, position, {gain: .10 + .27 * strength, ref: 3.2, reach: 24, wet: .10, rate, masking: .48});
      return true;
    }
    const idContact = contactClips[material];
    if (!buffers.has(idContact)) return false;
    const level = world.waterLevel;
    const splashZone = site.splashZone || (Number.isFinite(level) && Math.abs(site.y - level) < 1.45 && ctx.shoreRange < 7);
    const wetness = clamp(Math.max(ctx.wetness || 0, (ctx.rain || 0) * .68, splashZone ? .8 : 0), 0, 1);
    const release = kind === 'release', step = kind === 'step';
    const spread = release ? .61 : step ? .80 : 1;
    const rate = (release ? 1.34 : step ? 1.14 : .98) + variation - wetness * .11 + foot * .025;
    play(idContact, position, {gain: strength * spread * (.33 - .07 * wetness), ref: 2.65, reach: 20, wet: .08, rate, masking: .4});
    // The damp layer belongs to loose material at a wet bank or in sustained
    // rain. A wet hard ledge keeps its short stone tick unless surf reaches it.
    if (wetness > .42 && (material === 'sand' || material === 'grit' || (material === 'stone' && splashZone))) {
      play('perch-wet', position, {gain: .16 * strength * wetness * spread, ref: 2.5, reach: 16, wet: .07, rate: rate + .13, masking: .45});
    }
    return true;
  }

  function canopy(site, ctx, now) {
    if (site !== canopySite) {
      canopySource?.stop(.22);
      canopySource = null;
      canopySite = site;
      nextCanopy = now + .85;
      rearmCanopy = true;
    }
    if (!site?.tree || now < nextCanopy) return;
    const motion = clamp((ctx.canopyMotion || 0) * .76 + (ctx.gust || 0) * .24, 0, 1);
    if (motion < .17) rearmCanopy = true;
    if (motion < .36 || !rearmCanopy && motion < .61) return;
    const tree = site.tree, seed = site.seed || .5;
    const wind = world.windField?.direction;
    const drift = Math.min(tree.width || 4, 8) * .19;
    const position = {x: tree.x + (wind?.x ?? .3) * drift, z: tree.z + (wind?.z ?? 0) * drift, y: tree.y + tree.height * .81};
    const leaf = canopyClip(site);
    const gain = (.045 + .18 * motion) * (1 - .28 * (ctx.wetness || 0));
    canopySource = play(leaf, position, {gain, ref: 3.3, reach: 32, wet: .15, masking: .66, rate: .90 + .22 * seed});
    if (canopySource) {
      rearmCanopy = false;
      nextCanopy = now + 4.8 + seed * 2.3;
    }
  }

  function update(s, ctx) {
    const now = context.currentTime;
    if (ctx.perchStage === 'approach' || ctx.perchStage === 'flare') warmSite(ctx.perch);
    for (const source of active) if (!source.alive || source.endsAt + .4 < now) active.delete(source);
    for (const cue of s.perchSound || []) {
      if (cue.id <= seen) continue;
      warmSite(cue.site);
      if (s.elapsed - cue.at < .32 && !contact(cue, ctx)) break;
      seen = cue.id;
    }
    canopy(s.perchSoundSite, ctx, now);
  }

  function reset() {
    for (const source of active) source.stop(.1);
    active.clear();
    canopySource = canopySite = warmed = null;
  }

  return {update, reset};
};
