// The night panorama contains catalogued stars in local east/up/south coordinates.
// Moon direction is shared with terrain, eagle and water. The existing night
// panorama stays dark away from the moon and its narrow reflection.
window.lightAcadiaNight = function lightAcadiaNight(T, scene, world) {
  const seen = new Set();
  scene.traverse(object => {
    if (!object.isMesh || object.renderOrder === -1000) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material?.isShaderMaterial || seen.has(material)) continue;
      seen.add(material);
      if (object.isWater) {
        material.fragmentShader = material.fragmentShader
          .replace('vec3 skyVeil=vec3(.41,.53,.64);', 'vec3 skyVeil=vec3(.012,.022,.036);')
          .replace('vec3 sunlight=vec3(1.,.77,.47)*spec*daylight*(.27+.71*fresnel);', `
            // The wave normal and view half-vector put the glint under the
            // disk; the daylight survey mask is unrelated to this moon.
            vec3 sunlight=vec3(.064,.085,.125)*spec*(.10+.90*fresnel)*(1. /* direct terrain visibility */);`)
          .replace('vec3 radiance=mix(body*', 'vec3 radiance=mix(body*vec3(.20,.29,.40)*')
          .replace('vec3(.67,.77,.78)*(.53+.47*daylight)', 'vec3(.095,.14,.19)*(.64+.36*daylight)');
        continue;
      }
      // These survey surfaces already receive night irradiance. Foliage and
      // understory shaders contain their own baked daylight and need adaptation.
      if (material.uniforms?.terrainLight && material.uniforms?.aerial) continue;
      if (material.userData.acadiaNight) continue;
      if (material.fragmentShader.includes('#include <colorspace_fragment>')) {
        material.fragmentShader = material.fragmentShader.replace('#include <colorspace_fragment>',
          'gl_FragColor.rgb*=vec3(.10,.14,.21);\n#include <colorspace_fragment>');
      }
    }
  });
  world.acadiaLights?.lightWater();
  const sky = scene.children.find(o => o.renderOrder === -1000);
  if (!sky) return;
  const airglow = {value:1};
  sky.material.uniforms.acadiaAirglow = airglow;
  sky.material.uniforms.acadiaMoonDirection = {value:world.sunDirection};
  sky.material.fragmentShader = 'uniform float acadiaAirglow;uniform vec3 acadiaMoonDirection;\n' +
    sky.material.fragmentShader.replace('gl_FragColor=vec4(texture2D(map,uv).rgb,1.);', `
      vec3 stars=texture2D(map,uv).rgb;
      float band=exp(-pow((d.y-.115)/.105,2.));
      // Chord distance approximates angular distance here without acos.
      // 0.0045 rad is a lunar radius of about 0.26 degrees.
      float moonDistance=length(d-acadiaMoonDirection);
      float edge=min(fwidth(moonDistance),.003);
      float disk=1.-smoothstep(.0045-edge,.0045+max(edge,.0001),moonDistance);
      float glow=exp(-moonDistance*moonDistance/.00072);
      vec3 airglow=acadiaAirglow*vec3(.0018,.006,.0035)*band;
      vec3 halo=glow*vec3(.020,.027,.040);
      vec3 moonColor=vec3(.84,.88,.94);
      gl_FragColor=vec4(mix(stars*(1.-.22*glow)+airglow+halo,moonColor,disk),1.);
    `);
  world.atmosphericOptics = {phenomenon:'Coastal airglow beneath the Milky Way',
    setEnabled(enabled){airglow.value=enabled?1:0;}};
};
