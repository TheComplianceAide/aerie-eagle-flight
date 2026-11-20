// Both sides of Mendenhall's waterline sample the same metre-scaled glacial deposit.
window.mendenhallSedimentGLSL=`
#ifndef AERIE_MENDENHALL_SEDIMENT
#define AERIE_MENDENHALL_SEDIMENT
  vec4 depositGrain(sampler2D sheet,vec2 uv,float slot){
    vec2 scale=vec2(.492,.984);
    vec2 st=vec2(.5*slot+.004,.008)+fract(uv)*scale;
    #if __VERSION__ >= 300
      return textureGrad(sheet,st,dFdx(uv)*scale,dFdy(uv)*scale);
    #else
      return texture2D(sheet,st);
    #endif
  }
  vec3 mendenhallDeposit(sampler2D sheet,vec2 xz,float h,vec3 lightDir){
    mat2 axis=mat2(.966,.259,-.259,.966);
    vec2 q=axis*xz,uv=q/1.12;
    vec2 alt=mat2(.60,.80,-.80,.60)*uv+vec2(.37,.73);
    float swale=.21*sin(q.x*.57+sin(q.y*.32))+.12*sin(q.y*.84+.28*q.x);
    float orientation=smoothstep(-.22,.22,sin(q.x*.78+sin(q.y*.62))+.56*cos(q.y*.93+q.x*.31));
    vec4 g=mix(depositGrain(sheet,uv,0.),depositGrain(sheet,alt,0.),orientation);
    vec3 silt=depositGrain(sheet,q*vec2(.74,1.02)+.05*vec2(sin(q.y),cos(q.x)),1.).rgb;
    float damp=(1.-smoothstep(-.09,.91,h+swale))*.84;
    float pocket=(1.-smoothstep(.08,.83,h+swale+.34*sin(q.x*.97-q.y*.38)))*(.34+.46*smoothstep(-.18,.22,swale));
    vec3 coarse=clamp((g.rgb-.33)*1.13+vec3(.35,.344,.328),.025,.92);
    vec3 color=mix(coarse,silt,pocket);
    color*=mix(vec3(1.),vec3(.70,.76,.80),damp);
    // The small height signal describes grain-scale texture, separate from the
    // measured rocky terrain and the solid cobbles projecting from its surface.
    vec2 screenDir=vec2(dFdx(xz.x)*lightDir.x+dFdx(xz.y)*lightDir.z,dFdy(xz.x)*lightDir.x+dFdy(xz.y)*lightDir.z);
    float grain=dot(vec2(dFdx(g.a),dFdy(g.a)),screenDir/max(length(screenDir),.001));
    return color*(1.+clamp(grain*.82,-.085,.085)*(1.-pocket));
  }
#endif
`;
