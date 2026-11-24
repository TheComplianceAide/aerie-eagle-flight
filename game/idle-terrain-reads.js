// The ground shader reads its rock-fracture texture four times for every pixel
// of land: twice to shift the rock coordinates by a small parallax, twice for
// fine relief on the normal. Both results are multiplied by a weight that is
// exactly zero over most of the view: the parallax beyond 170 m and on level
// ground, the relief on level or vegetated ground and beyond 2.9 km. Those
// reads are now made only where the weight is not zero. Where it is zero the
// old arithmetic added nothing, and where it is not the same texels are read:
// the gradients are taken outside the branch and passed in, so each read
// resolves exactly as it did. The picture is the same to the last bit.
//
// The edits are made to the compiled copy, after every other module has made
// its own, and only where the exact statements are still there. The material's
// source text, which other modules search and replace, is left as it was.
window.skipIdleTerrainReads=function skipIdleTerrainReads(scene){
  if(window.aerieIdleTerrainReads===false)return null;
  const exact=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  // Statements as written in the ground shader, whatever the indentation between them.
  const pattern=(...statements)=>new RegExp(statements.map(exact).join('\\s*'));
  const parallax=['vec2 parA=(texture2D(fracture,uva).b-.5)*viewDir.zy*(.062*closeRelief);','vec2 parB=(texture2D(fracture,uvb).b-.5)*viewDir.xy*(.062*closeRelief);','uva+=parA;uvb+=parB;'];
  const relief=['vec3 microX=texture2D(fracture,uva).rgb*2.-1.;','vec3 microZ=texture2D(fracture,uvb).rgb*2.-1.;','vec3 micro=mix(vec3(microZ.x,microZ.y,0.),vec3(0.,microX.y,microX.x),axis);',
    'vec3 relieved=normalize(normal+micro*(.68*face*(1.-veg))*(1.-smoothstep(350.,2900.,d)));'];
  const edits=[
    // Both offsets are scaled by closeRelief, so without it the coordinates do not move.
    [pattern(...parallax),'{vec2 idleAx=dFdx(uva),idleAy=dFdy(uva),idleBx=dFdx(uvb),idleBy=dFdy(uvb);if(closeRelief!=0.){'+
      'vec2 parA=(textureGrad(fracture,uva,idleAx,idleAy).b-.5)*viewDir.zy*(.062*closeRelief);vec2 parB=(textureGrad(fracture,uvb,idleBx,idleBy).b-.5)*viewDir.xy*(.062*closeRelief);uva+=parA;uvb+=parB;}}'],
    // With either factor zero the fine relief adds nothing to the normal before it is normalised.
    [pattern(...relief),'vec3 relieved=normalize(normal);{vec2 idleAx=dFdx(uva),idleAy=dFdy(uva),idleBx=dFdx(uvb),idleBy=dFdy(uvb);if((.68*face*(1.-veg))*(1.-smoothstep(350.,2900.,d))!=0.){'+
      'vec3 microX=textureGrad(fracture,uva,idleAx,idleAy).rgb*2.-1.;vec3 microZ=textureGrad(fracture,uvb,idleBx,idleBy).rgb*2.-1.;'+
      'vec3 micro=mix(vec3(microZ.x,microZ.y,0.),vec3(0.,microX.y,microX.x),axis);relieved=normalize(normal+micro*(.68*face*(1.-veg))*(1.-smoothstep(350.,2900.,d)));}}']
  ];
  const rewrite=source=>{for(const [from,to] of edits)source=source.replace(from,()=>to);return source;};
  const seen=new Set();let changed=0;
  scene.traverse(object=>{
    for(const material of Array.isArray(object.material)?object.material:[object.material]){
      if(!material?.isShaderMaterial||seen.has(material))continue;
      seen.add(material);
      // Ground materials only, and only those that still hold one of the statements.
      if(!material.uniforms?.shoreLevel||!edits.some(([from])=>from.test(material.fragmentShader)))continue;
      const prior=material.onBeforeCompile,key=material.customProgramCacheKey();
      material.onBeforeCompile=function(shader,renderer){
        prior.call(this,shader,renderer);
        shader.fragmentShader=rewrite(shader.fragmentShader);
      };
      material.customProgramCacheKey=()=>key+'|idle terrain reads';
      material.needsUpdate=true;changed++;
    }
  });
  return changed?{materials:changed}:null;
};
