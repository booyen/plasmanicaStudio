// Post-process effect chain (Bloom/Blur/Glass/Pixelate). A multi-pass ping-pong
// run inserted between the plasma FBO and the gradient composite. Disabled effects
// are skipped entirely (zero cost). Fixed pass order: pixelate → blur → glass →
// bloom. The pure helpers (planPasses, bloomBrightWeight) + shader sources are
// unit-tested; the GL orchestration (EffectChain) is covered by visual goldens.
import { VERT } from './shaders.js';
import { makeProgram } from './gl.js';
import type { CoreConfig } from './config.js';

type Fx = CoreConfig['effects'];

export type EffectStep =
  | { type: 'pixelate'; size: number }
  | { type: 'blur'; strength: number; tint: number }
  | { type: 'bloom'; threshold: number; intensity: number; radius: number };

/** The ordered list of passes to run for a config. Order is fixed regardless of
 *  which effects are on; glass is a tinted blur, so blur+glass run as two blur
 *  steps (plain then tinted). All-off → []. */
export function planPasses(fx: Fx): EffectStep[] {
  const out: EffectStep[] = [];
  if (fx.pixelate.on) out.push({ type: 'pixelate', size: fx.pixelate.size });
  if (fx.blur.on) out.push({ type: 'blur', strength: fx.blur.strength, tint: 0 });
  if (fx.glass.on) out.push({ type: 'blur', strength: fx.glass.strength, tint: fx.glass.tint });
  if (fx.bloom.on) out.push({ type: 'bloom', threshold: fx.bloom.threshold, intensity: fx.bloom.intensity, radius: fx.bloom.radius });
  return out;
}

/** Soft-knee bright-pass weight — JS mirror of the GLSL in BLOOM_BRIGHT_FRAG.
 *  Keep BLOOM_KNEE in sync with the shader. */
export const BLOOM_KNEE = 0.0625;
export function bloomBrightWeight(luma: number, threshold: number): number {
  const t = Math.min(1, Math.max(0, (luma - threshold) / BLOOM_KNEE));
  return t * t * (3 - 2 * t); // smoothstep
}

// strength 0–1 → gaussian tap-offset multiplier (in texels).
const blurRadiusPx = (strength: number) => 0.5 + strength * 5.5;

// ---- shader sources (WebGL1 GLSL ES 1.00) ----

export const PIXELATE_FRAG = `precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex; uniform vec2 u_res; uniform float u_cell;
void main(){
  vec2 cells = max(u_res / max(u_cell, 1.0), vec2(1.0));
  vec2 uv = (floor(v_uv * cells) + 0.5) / cells;
  gl_FragColor = texture2D(u_tex, uv);
}`;

// Separable 9-tap gaussian (run H then V via u_dir). The V pass of glass passes
// u_tint > 0 to fold in a milky-white frost.
export const BLUR_FRAG = `precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex; uniform vec2 u_texel; uniform vec2 u_dir;
uniform float u_radius; uniform float u_tint;
void main(){
  vec2 s = u_texel * u_dir * u_radius;
  vec3 c = texture2D(u_tex, v_uv).rgb * 0.227027;
  c += texture2D(u_tex, v_uv + s * 1.0).rgb * 0.1945946;
  c += texture2D(u_tex, v_uv - s * 1.0).rgb * 0.1945946;
  c += texture2D(u_tex, v_uv + s * 2.0).rgb * 0.1216216;
  c += texture2D(u_tex, v_uv - s * 2.0).rgb * 0.1216216;
  c += texture2D(u_tex, v_uv + s * 3.0).rgb * 0.0540540;
  c += texture2D(u_tex, v_uv - s * 3.0).rgb * 0.0540540;
  c += texture2D(u_tex, v_uv + s * 4.0).rgb * 0.0162162;
  c += texture2D(u_tex, v_uv - s * 4.0).rgb * 0.0162162;
  vec3 milk = mix(c, vec3(1.0), 0.5);
  c = mix(c, milk, clamp(u_tint, 0.0, 1.0));
  gl_FragColor = vec4(c, 1.0);
}`;

export const BLOOM_BRIGHT_FRAG = `precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex; uniform float u_threshold;
void main(){
  vec3 c = texture2D(u_tex, v_uv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float w = smoothstep(u_threshold, u_threshold + ${BLOOM_KNEE}, l);
  gl_FragColor = vec4(c * w, 1.0);
}`;

export const BLOOM_COMBINE_FRAG = `precision highp float;
varying vec2 v_uv;
uniform sampler2D u_base; uniform sampler2D u_bloom; uniform float u_intensity;
void main(){
  vec3 b = texture2D(u_base, v_uv).rgb;
  vec3 g = texture2D(u_bloom, v_uv).rgb;
  gl_FragColor = vec4(b + g * u_intensity, 1.0);
}`;

type Prog = { p: WebGLProgram; pos: number; u: Record<string, WebGLUniformLocation | null> };

/** Owns the effect programs + a small pool of canvas-sized RGBA8 ping-pong
 *  textures (one shared FBO, attachment rebound per draw). `apply` runs the
 *  enabled passes and returns the final texture for the composite; with no
 *  enabled effects it returns the source texture untouched (zero GPU work). */
export class EffectChain {
  private gl: WebGLRenderingContext;
  private buf: WebGLBuffer;
  private fbo: WebGLFramebuffer | null;
  private pool: WebGLTexture[] = [];
  private w = 0;
  private h = 0;
  private pixelate: Prog | null;
  private blur: Prog | null;
  private bright: Prog | null;
  private combine: Prog | null;

  constructor(gl: WebGLRenderingContext, buf: WebGLBuffer) {
    this.gl = gl;
    this.buf = buf;
    this.fbo = gl.createFramebuffer();
    this.pixelate = this.build(PIXELATE_FRAG, ['u_tex', 'u_res', 'u_cell']);
    this.blur = this.build(BLUR_FRAG, ['u_tex', 'u_texel', 'u_dir', 'u_radius', 'u_tint']);
    this.bright = this.build(BLOOM_BRIGHT_FRAG, ['u_tex', 'u_threshold']);
    this.combine = this.build(BLOOM_COMBINE_FRAG, ['u_base', 'u_bloom', 'u_intensity']);
  }

  private build(frag: string, uniforms: string[]): Prog | null {
    const gl = this.gl;
    const p = makeProgram(gl, VERT, frag);
    if (!p) return null;
    const u: Record<string, WebGLUniformLocation | null> = {};
    for (const n of uniforms) u[n] = gl.getUniformLocation(p, n);
    return { p, pos: gl.getAttribLocation(p, 'a_pos'), u };
  }

  private makeTex(): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.w, this.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private ensureSize(w: number, h: number) {
    if (this.w === w && this.h === h && this.pool.length) return;
    const gl = this.gl;
    this.w = w;
    this.h = h;
    for (const t of this.pool) gl.deleteTexture(t);
    this.pool = [];
    for (let i = 0; i < 3; i++) this.pool.push(this.makeTex());
  }

  /** A pool texture not in `except` (so a pass never writes its own input). */
  private acquire(except: WebGLTexture[]): WebGLTexture {
    for (const t of this.pool) if (!except.includes(t)) return t;
    const t = this.makeTex(); // grow if a pass ever needs more live textures
    this.pool.push(t);
    return t;
  }

  private draw(prog: Prog, out: WebGLTexture, setU: () => void, textures: { tex: WebGLTexture; unit: number; loc: WebGLUniformLocation | null }[]) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, out, 0);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(prog.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(prog.pos);
    gl.vertexAttribPointer(prog.pos, 2, gl.FLOAT, false, 0, 0);
    for (const { tex, unit, loc } of textures) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(loc, unit);
    }
    setU();
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Run the enabled passes against `srcTex` (w×h). Returns the final texture
   *  (== srcTex if nothing is enabled). Leaves FBO bound to the last target — the
   *  caller rebinds for the composite. */
  apply(srcTex: WebGLTexture, w: number, h: number, fx: Fx): WebGLTexture {
    const passes = planPasses(fx);
    if (!passes.length || !this.pixelate || !this.blur || !this.bright || !this.combine) return srcTex;
    this.ensureSize(w, h);
    const texel: [number, number] = [1 / w, 1 / h];
    const gl = this.gl;
    let cur = srcTex;

    for (const pass of passes) {
      if (pass.type === 'pixelate') {
        const out = this.acquire([cur]);
        this.draw(this.pixelate, out, () => {
          gl.uniform2f(this.pixelate!.u.u_res, w, h);
          gl.uniform1f(this.pixelate!.u.u_cell, pass.size);
        }, [{ tex: cur, unit: 0, loc: this.pixelate.u.u_tex }]);
        cur = out;
      } else if (pass.type === 'blur') {
        const r = blurRadiusPx(pass.strength);
        const tmp = this.acquire([cur]);
        this.draw(this.blur, tmp, () => {
          gl.uniform2f(this.blur!.u.u_texel, texel[0], texel[1]);
          gl.uniform2f(this.blur!.u.u_dir, 1, 0);
          gl.uniform1f(this.blur!.u.u_radius, r);
          gl.uniform1f(this.blur!.u.u_tint, 0);
        }, [{ tex: cur, unit: 0, loc: this.blur.u.u_tex }]);
        const out = this.acquire([cur, tmp]);
        this.draw(this.blur, out, () => {
          gl.uniform2f(this.blur!.u.u_texel, texel[0], texel[1]);
          gl.uniform2f(this.blur!.u.u_dir, 0, 1);
          gl.uniform1f(this.blur!.u.u_radius, r);
          gl.uniform1f(this.blur!.u.u_tint, pass.tint);
        }, [{ tex: tmp, unit: 0, loc: this.blur.u.u_tex }]);
        cur = out;
      } else {
        // bloom: bright-pass → separable blur (H+V) → additive combine with base
        const r = blurRadiusPx(pass.radius);
        const bright = this.acquire([cur]);
        this.draw(this.bright, bright, () => {
          gl.uniform1f(this.bright!.u.u_threshold, pass.threshold);
        }, [{ tex: cur, unit: 0, loc: this.bright.u.u_tex }]);
        const tmp = this.acquire([cur, bright]);
        this.draw(this.blur, tmp, () => {
          gl.uniform2f(this.blur!.u.u_texel, texel[0], texel[1]);
          gl.uniform2f(this.blur!.u.u_dir, 1, 0);
          gl.uniform1f(this.blur!.u.u_radius, r);
          gl.uniform1f(this.blur!.u.u_tint, 0);
        }, [{ tex: bright, unit: 0, loc: this.blur.u.u_tex }]);
        this.draw(this.blur, bright, () => {
          gl.uniform2f(this.blur!.u.u_texel, texel[0], texel[1]);
          gl.uniform2f(this.blur!.u.u_dir, 0, 1);
          gl.uniform1f(this.blur!.u.u_radius, r);
          gl.uniform1f(this.blur!.u.u_tint, 0);
        }, [{ tex: tmp, unit: 0, loc: this.blur.u.u_tex }]);
        const out = this.acquire([cur, bright]);
        this.draw(this.combine, out, () => {
          gl.uniform1f(this.combine!.u.u_intensity, pass.intensity);
        }, [
          { tex: cur, unit: 0, loc: this.combine.u.u_base },
          { tex: bright, unit: 1, loc: this.combine.u.u_bloom },
        ]);
        cur = out;
      }
    }
    return cur;
  }

  dispose() {
    const gl = this.gl;
    for (const t of this.pool) gl.deleteTexture(t);
    this.pool = [];
    for (const pr of [this.pixelate, this.blur, this.bright, this.combine]) {
      if (pr) gl.deleteProgram(pr.p);
    }
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    this.fbo = null;
  }
}
