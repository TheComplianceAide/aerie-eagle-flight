// The night panorama contains catalogued stars in local east/up/south coordinates.
// Terrain receives starlight and a weak western key. Reflections retain the sky's
// exposure; only the water body and unresolved surface highlights need relighting.
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
          .replace('vec3 sunlight=vec3(1.,.77,.47)*spec', 'vec3 sunlight=vec3(.030,.044,.065)*spec')
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
  const sky = scene.children.find(o => o.renderOrder === -1000);
  if (!sky) return;
  const airglow = {value:1};
  sky.material.uniforms.acadiaAirglow = airglow;
  sky.material.fragmentShader = 'uniform float acadiaAirglow;\n' + sky.material.fragmentShader.replace(
    'gl_FragColor=vec4(texture2D(map,uv).rgb,1.);',
    'vec3 stars=texture2D(map,uv).rgb;float band=exp(-pow((d.y-.115)/.105,2.));\n' +
    'gl_FragColor=vec4(stars+acadiaAirglow*vec3(.0018,.006,.0035)*band,1.);');
  world.atmosphericOptics = {phenomenon:'Coastal airglow beneath the Milky Way',
    setEnabled(enabled){airglow.value=enabled?1:0;}};
};
