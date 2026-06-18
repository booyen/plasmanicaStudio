// Hand-written overlay composite (the legacy has no overlay). The OKLab helpers
// here (JS, unit-tested) MIRROR the GLSL below — keep them in sync. Ottosson
// constants (https://bottosson.github.io/posts/oklab/). The GLSL transcription
// is covered by a visual golden.
export const OVERLAY_TYPE_INDEX: Record<string, number> = { none: 0, color: 1, linear: 2, radial: 3 };
export const OVERLAY_BLEND_INDEX: Record<string, number> = { normal: 0, multiply: 1, screen: 2, overlay: 3 };

type RGB = [number, number, number];
const s2l = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const l2s = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

export function srgbToOklab([r, g, b]: RGB): RGB {
  r = s2l(r); g = s2l(g); b = s2l(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToSrgb([L, A, B]: RGB): RGB {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return [
    Math.min(1, Math.max(0, l2s(r))),
    Math.min(1, Math.max(0, l2s(g))),
    Math.min(1, Math.max(0, l2s(b))),
  ];
}

export function oklabMix(c0: RGB, c1: RGB, t: number): RGB {
  const a = srgbToOklab(c0), b = srgbToOklab(c1);
  return oklabToSrgb([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
}

export const COMPOSITE_FRAG = `precision highp float;
varying vec2 v_uv;
uniform sampler2D u_plasma;
uniform int u_ovType; uniform int u_ovBlend; uniform float u_ovOpacity;
uniform vec3 u_ovColA; uniform float u_ovAlphaA;
uniform vec3 u_ovColB; uniform float u_ovAlphaB;
uniform float u_ovAngle; uniform vec2 u_ovCenter; uniform float u_ovRadius;
vec3 s2l(vec3 c){ return mix(c/12.92, pow((c+0.055)/1.055, vec3(2.4)), step(0.04045,c)); }
vec3 l2s(vec3 c){ return mix(c*12.92, 1.055*pow(max(c,0.0), vec3(1.0/2.4))-0.055, step(0.0031308,c)); }
vec3 lin2oklab(vec3 c){
  float l=0.4122214708*c.r+0.5363325363*c.g+0.0514459929*c.b;
  float m=0.2119034982*c.r+0.6806995451*c.g+0.1073969566*c.b;
  float s=0.0883024619*c.r+0.2817188376*c.g+0.6299787005*c.b;
  vec3 q=pow(max(vec3(l,m,s),0.0), vec3(1.0/3.0));
  return vec3(0.2104542553*q.x+0.7936177850*q.y-0.0040720468*q.z,
              1.9779984951*q.x-2.4285922050*q.y+0.4505937099*q.z,
              0.0259040371*q.x+0.7827717662*q.y-0.8086757660*q.z); }
vec3 oklab2lin(vec3 c){
  float l_=c.x+0.3963377774*c.y+0.2158037573*c.z;
  float m_=c.x-0.1055613458*c.y-0.0638541728*c.z;
  float s_=c.x-0.0894841775*c.y-1.2914855480*c.z;
  vec3 q=vec3(l_,m_,s_); q=q*q*q;
  return vec3(4.0767416621*q.x-3.3077115913*q.y+0.2309699292*q.z,
             -1.2684380046*q.x+2.6097574011*q.y-0.3413193965*q.z,
             -0.0041960863*q.x-0.7034186147*q.y+1.7076147010*q.z); }
vec3 oklabMix(vec3 a, vec3 b, float t){ return clamp(l2s(oklab2lin(mix(lin2oklab(s2l(a)), lin2oklab(s2l(b)), t))), 0.0, 1.0); }
vec3 blendMode(vec3 base, vec3 ov, int mode){
  if(mode==1) return base*ov;
  if(mode==2) return 1.0-(1.0-base)*(1.0-ov);
  if(mode==3) return mix(2.0*base*ov, 1.0-2.0*(1.0-base)*(1.0-ov), step(0.5, base));
  return ov; }
void main(){
  vec3 base = texture2D(u_plasma, v_uv).rgb;
  if(u_ovType==0){ gl_FragColor=vec4(base,1.0); return; }
  float t=0.0;
  if(u_ovType==2){ vec2 d=vec2(cos(u_ovAngle),sin(u_ovAngle)); t=clamp(dot(v_uv-0.5,d)+0.5,0.0,1.0); }
  else if(u_ovType==3){ t=clamp(distance(v_uv,u_ovCenter)/max(u_ovRadius,1e-4),0.0,1.0); }
  vec3 ovc = (u_ovType==1) ? u_ovColA : oklabMix(u_ovColA, u_ovColB, t);
  float a = ((u_ovType==1) ? u_ovAlphaA : mix(u_ovAlphaA,u_ovAlphaB,t)) * u_ovOpacity;
  gl_FragColor = vec4(mix(base, blendMode(base, ovc, u_ovBlend), a), 1.0);
}`;
