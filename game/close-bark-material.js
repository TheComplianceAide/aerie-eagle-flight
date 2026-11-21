// Close wood keeps the regional bark's colour and gains metre-scaled surface
// relief from a separate pine or hardwood scan. No new UVs in the tree meshes.
(() => {
  async function load(photo, T) {
    async function texture(family) {
      try {
        const map = await photo('close-bark-' + family + '.webp');
        map.wrapS = map.wrapT = T.RepeatWrapping;
        map.needsUpdate = true;
        return map;
      } catch {
        // The existing regional wood and its derived normals work independently.
        return null;
      }
    }
    const [pine, hardwood] = await Promise.all([texture('pine'), texture('hardwood')]);
    return {pine, hardwood};
  }

  const pars = `
    #if defined(CLOSE_SCANNED_BARK) && !defined(CLOSE_NEEDLE_SHOOT)
    uniform sampler2D closeBark;
    #endif`;
  const apply = `
    #if defined(CLOSE_SCANNED_BARK) && !defined(CLOSE_NEEDLE_SHOOT)
    if(abs(barkUV.z - 3.) < .1) {
      // Tangent-space normal XY in RG. B is the scan's median-centred
      // luminance. The triplanar projection stays attached as the tree moves.
      vec3 lx = dFdx(localMetres), ly = dFdy(localMetres);
      vec3 face = abs(cross(lx, ly));
      face /= max(max(face.x, face.y), max(face.z, .0000001));
      vec3 weights = face * face * face * face;
      weights /= max(dot(weights, vec3(1.)), .000001);
      #ifdef REGIONAL_BROADLEAF
      const float tilesPerMetre = 1. / 1.8;
      #else
      const float tilesPerMetre = 1. / 2.;
      #endif
      vec3 p = localMetres * tilesPerMetre;
      vec2 offset = lighting.z * vec2(3.73, 7.19);
      vec3 yz = texture2D(closeBark, vec2(p.z, -p.y) + offset).rgb;
      vec3 xz = texture2D(closeBark, p.xz + offset).rgb;
      vec3 xy = texture2D(closeBark, vec2(p.x, -p.y) + offset).rgb;
      // All packed normal maps are OpenGL Y-up, while the loader keeps image
      // row zero at V=0. Negating the bitangent slope restores that convention.
      vec2 a = (yz.rg * 2. - 1.) * vec2(1., -1.);
      vec2 b = (xz.rg * 2. - 1.) * vec2(1., -1.);
      vec2 d = (xy.rg * 2. - 1.) * vec2(1., -1.);
      vec3 slope = weights.x * vec3(0., -a.y, a.x)
                 + weights.y * vec3(b.x, 0., b.y)
                 + weights.z * vec3(d.x, -d.y, 0.);
      vec3 px = dFdx(wp), py = dFdy(wp);
      vec3 across = cross(py, n), along = cross(n, px);
      float det = dot(px, across);
      vec3 perturbation = (across * dot(slope, lx) + along * dot(slope, ly))
                        * sign(det) / max(abs(det), .0000001);
      float wood = (1. - smoothstep(15., 42., length(cameraPosition - wp)))
                 * (1. - .65 * smoothstep(.34, .94, lighting.y));
      #ifdef CLOSE_BIRCH_BARK
      wood *= .27;
      #endif
      n = normalize(n + .78 * wood * perturbation / max(1., length(perturbation)));
      float grain = dot(weights, vec3(yz.b, xz.b, xy.b)) - .5;
      c *= 1. + 1.15 * wood * grain;
    }
    #endif`;

  window.aerieCloseBark = {load, pars, apply};
})();
