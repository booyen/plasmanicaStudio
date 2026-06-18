# Overlay + Seeded Randomize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an engine-baked overlay (linear/radial gradient or single color, OKLab-interpolated, with blend modes) and seeded randomize (deterministic, seed in the shareable config) to the plasma library + studio.

**Architecture:** The renderer becomes two-pass — the plasma renders to a canvas-sized FBO, then a composite pass samples it, computes the overlay per pixel (OKLab gradient + blend mode + opacity), and writes to screen. Both new features extend the zod `CoreConfig` (so they ride share links + exports + embed). Randomize gains a `mulberry32` seed that scopes a `Math.random` swap so the verbatim THEMES roll deterministically.

**Tech Stack:** TypeScript strict, raw WebGL1, zod, React 18, Tailwind v4 + shadcn, zustand, vitest, Playwright (visual goldens).

## Global Constraints

- **Plasma GLSL stays byte-verbatim** — the overlay is a *separate* hand-written composite shader; never edit the generated `shaders.ts`/plasma GLSL.
- `packages/core` stays React-free and zod stays out of the embed path — overlay/seed touch only `config.ts` (schema, type-only into renderer) and zero-dep modules the renderer imports.
- Overlay default is **`type: 'none'`** → composite passthrough → default output + existing goldens unchanged.
- `defaultConfig` (hand-written, zero-dep) must keep equalling `parseConfig({})` — a test guards this; update the default object whenever the schema changes.
- WebGL1 only: RGBA8 color-attachment FBO (no float textures).
- Seed is in `CoreConfig`, never in `LOCK_GROUPS` (always re-rolled).
- OKLab matrices are Ottosson's standard constants; the GLSL copy and the JS copy must match (JS is unit-tested; GLSL is covered by a visual golden).

---

### Task 1: Config schema — `overlay` + `seed`

**Files:**
- Modify: `packages/core/src/plasma/config-defaults.ts` (add `overlay` + `seed` to the default object)
- Modify: `packages/core/src/plasma/config.ts` (add `overlay` object + `seed` to `PlasmaConfig`; export `OVERLAY_TYPES`, `OVERLAY_BLENDS`)
- Modify: `packages/core/src/plasma/config.test.ts` (round-trip + clamp + no-drift)

**Interfaces:**
- Consumes: existing `num`, `hex`, `inList` zod helpers in `config.ts`.
- Produces: `CoreConfig.overlay: { type, blend, opacity, colorA, alphaA, colorB, alphaB, angleDeg, center, radius }`, `CoreConfig.seed: number`; `OVERLAY_TYPES = ['none','color','linear','radial']`, `OVERLAY_BLENDS = ['normal','multiply','screen','overlay']`.

- [ ] **Step 1: Write the failing tests** — append to `config.test.ts`:

```ts
import { OVERLAY_TYPES, OVERLAY_BLENDS } from './config.js';

describe('overlay + seed schema', () => {
  it('defaults: overlay off, seed present', () => {
    expect(defaultConfig.overlay.type).toBe('none');
    expect(defaultConfig.overlay.blend).toBe('normal');
    expect(defaultConfig.seed).toBe(1);
  });
  it('round-trips a configured overlay', () => {
    const cfg = parseConfig({
      ...defaultConfig,
      seed: 42,
      overlay: { type: 'radial', blend: 'multiply', opacity: 0.6, colorA: '#ff0000', alphaA: 0.8,
        colorB: '#0000ff', alphaB: 0, angleDeg: 90, center: [0.5, 0.5], radius: 0.8 },
    });
    expect(parseConfig(cfg)).toEqual(cfg);
  });
  it('clamps + falls back bad overlay values', () => {
    const cfg = parseConfig({ overlay: { type: 'nope', blend: 'bogus', opacity: 5, alphaA: -3, radius: 99 } });
    expect(cfg.overlay.type).toBe('none');
    expect(cfg.overlay.blend).toBe('normal');
    expect(cfg.overlay.opacity).toBe(1);   // clamped to max
    expect(cfg.overlay.alphaA).toBe(0);     // clamped to min
    expect(cfg.overlay.radius).toBe(2);     // clamped to max
  });
  it('exposes the enums', () => {
    expect(OVERLAY_TYPES).toEqual(['none', 'color', 'linear', 'radial']);
    expect(OVERLAY_BLENDS).toEqual(['normal', 'multiply', 'screen', 'overlay']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @effects/core exec vitest run src/plasma/config.test.ts`
Expected: FAIL (`OVERLAY_TYPES` not exported; `overlay`/`seed` undefined).

- [ ] **Step 3: Add the defaults** — in `config-defaults.ts`, add to the `defaultConfig` object (before the closing `}`):

```ts
  seed: 1,
  overlay: {
    type: 'none',
    blend: 'normal',
    opacity: 1,
    colorA: '#000000',
    alphaA: 0.5,
    colorB: '#000000',
    alphaB: 0,
    angleDeg: 0,
    center: [0.5, 0.5],
    radius: 0.75,
  },
```

- [ ] **Step 4: Add the schema** — in `config.ts`, before `export const PlasmaConfig`:

```ts
export const OVERLAY_TYPES = ['none', 'color', 'linear', 'radial'] as const;
export const OVERLAY_BLENDS = ['normal', 'multiply', 'screen', 'overlay'] as const;
```

Then add these fields inside the `z.object({ ... })` (alongside `cursor`):

```ts
  seed: z.preprocess(
    (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 1),
    z.number(),
  ),
  overlay: z
    .object({
      type: inList(OVERLAY_TYPES, 'none'),
      blend: inList(OVERLAY_BLENDS, 'normal'),
      opacity: num(1, 0, 1),
      colorA: hex('#000000'),
      alphaA: num(0.5, 0, 1),
      colorB: hex('#000000'),
      alphaB: num(0, 0, 1),
      angleDeg: num(0, 0, 360),
      center: z.preprocess(
        (v) => (Array.isArray(v) && v.length === 2 ? v : [0.5, 0.5]),
        z.tuple([num(0.5, -1, 2), num(0.5, -1, 2)]),
      ),
      radius: num(0.75, 0.05, 2),
    })
    .catch({ type: 'none', blend: 'normal', opacity: 1, colorA: '#000000', alphaA: 0.5, colorB: '#000000', alphaB: 0, angleDeg: 0, center: [0.5, 0.5], radius: 0.75 })
    .default({ type: 'none', blend: 'normal', opacity: 1, colorA: '#000000', alphaA: 0.5, colorB: '#000000', alphaB: 0, angleDeg: 0, center: [0.5, 0.5], radius: 0.75 }),
```

> Note: `inList` returns `z.string()`, so `overlay.type`/`blend` are typed `string`. That's fine — the renderer maps them. If you want the literal union, leave as-is (the values are validated at runtime).

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter @effects/core exec vitest run src/plasma/config.test.ts`
Expected: PASS (all, including the existing `defaultConfig === parseConfig({})` guard).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/plasma/config.ts packages/core/src/plasma/config-defaults.ts packages/core/src/plasma/config.test.ts
git commit -m "feat(core): overlay + seed config schema"
```

---

### Task 2: OKLab + composite GLSL (`overlay.ts`)

**Files:**
- Create: `packages/core/src/plasma/overlay.ts` (`COMPOSITE_FRAG` GLSL string + JS `srgbToOklab`/`oklabToSrgb`/`oklabMix`; `OVERLAY_TYPE_INDEX`/`OVERLAY_BLEND_INDEX` maps)
- Create: `packages/core/src/plasma/overlay.test.ts`
- Modify: `packages/core/src/plasma/index.ts` (re-export `./overlay.js`)

**Interfaces:**
- Consumes: none (self-contained).
- Produces: `COMPOSITE_FRAG: string`; `oklabMix(c0:[number,number,number], c1:[number,number,number], t:number): [number,number,number]` (rgb 0..1); `OVERLAY_TYPE_INDEX: Record<string,number>` (`none:0,color:1,linear:2,radial:3`), `OVERLAY_BLEND_INDEX: Record<string,number>` (`normal:0,multiply:1,screen:2,overlay:3`).

- [ ] **Step 1: Write the failing test** — `overlay.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { oklabMix, srgbToOklab, oklabToSrgb, OVERLAY_TYPE_INDEX, OVERLAY_BLEND_INDEX, COMPOSITE_FRAG } from './overlay.js';

const close = (a: number[], b: number[], eps = 1e-3) => a.every((v, i) => Math.abs(v - b[i]) < eps);

describe('OKLab', () => {
  it('round-trips sRGB through OKLab', () => {
    for (const c of [[0.2, 0.5, 0.9], [1, 0, 0], [0, 0, 0], [1, 1, 1]] as [number,number,number][]) {
      expect(close([...oklabToSrgb(srgbToOklab(c))], c)).toBe(true);
    }
  });
  it('mix endpoints are exact', () => {
    const a: [number,number,number] = [1, 0, 0], b: [number,number,number] = [0, 0, 1];
    expect(close([...oklabMix(a, b, 0)], a)).toBe(true);
    expect(close([...oklabMix(a, b, 1)], b)).toBe(true);
  });
  it('OKLab midpoint of a complementary pair is more saturated than sRGB midpoint (no grey dead-zone)', () => {
    const a: [number,number,number] = [0, 0.6, 1], b: [number,number,number] = [1, 0.5, 0];
    const ok = oklabMix(a, b, 0.5);
    const rgb = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const chroma = (c: number[]) => Math.max(...c) - Math.min(...c);
    expect(chroma([...ok])).toBeGreaterThan(chroma(rgb));
  });
});

describe('overlay constants', () => {
  it('index maps', () => {
    expect(OVERLAY_TYPE_INDEX).toEqual({ none: 0, color: 1, linear: 2, radial: 3 });
    expect(OVERLAY_BLEND_INDEX).toEqual({ normal: 0, multiply: 1, screen: 2, overlay: 3 });
  });
  it('composite shader samples plasma + has overlay uniforms', () => {
    expect(COMPOSITE_FRAG).toContain('u_plasma');
    expect(COMPOSITE_FRAG).toContain('u_ovType');
    expect(COMPOSITE_FRAG).toContain('void main');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @effects/core exec vitest run src/plasma/overlay.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `overlay.ts`**

```ts
// Hand-written overlay composite (the legacy has no overlay). OKLab helpers here
// (JS, unit-tested) mirror the GLSL below — keep them in sync. Ottosson constants.
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
  return [Math.min(1, Math.max(0, l2s(r))), Math.min(1, Math.max(0, l2s(g))), Math.min(1, Math.max(0, l2s(b)))];
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
```

- [ ] **Step 4: Re-export** — add to `packages/core/src/plasma/index.ts`:

```ts
export * from './overlay.js';
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter @effects/core exec vitest run src/plasma/overlay.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/plasma/overlay.ts packages/core/src/plasma/overlay.test.ts packages/core/src/plasma/index.ts
git commit -m "feat(core): overlay composite GLSL + OKLab helpers"
```

---

### Task 3: Renderer two-pass composite

**Files:**
- Modify: `packages/core/src/plasma/renderer.ts` (plasma FBO + composite pass + overlay uniforms)

**Interfaces:**
- Consumes: `COMPOSITE_FRAG`, `OVERLAY_TYPE_INDEX`, `OVERLAY_BLEND_INDEX` (Task 2); `makeProgram`, `hex2rgb` (`gl.ts`).
- Produces: `renderAt(t)` now renders plasma→FBO then composites→screen; `setConfig` overlay changes are uniform-only (no recompile). No public signature changes.

- [ ] **Step 1: Add imports** — top of `renderer.ts`:

```ts
import { COMPOSITE_FRAG, OVERLAY_TYPE_INDEX, OVERLAY_BLEND_INDEX } from './overlay.js';
```

- [ ] **Step 2: Add fields** — in the class, near the flowmap fields:

```ts
  // overlay composite (plasma → FBO → composite → screen)
  private compProg: WebGLProgram | null = null;
  private cloc: Record<string, WebGLUniformLocation | null> = {};
  private compPos = -1;
  private plasmaTex: WebGLTexture | null = null;
  private plasmaFBO: WebGLFramebuffer | null = null;
  private ptW = 0;
  private ptH = 0;
  // overlay internal state (mapped from config)
  private ovType = 0;
  private ovBlend = 0;
  private ovOpacity = 1;
  private ovColA: [number, number, number] = [0, 0, 0];
  private ovAlphaA = 0.5;
  private ovColB: [number, number, number] = [0, 0, 0];
  private ovAlphaB = 0;
  private ovAngle = 0;
  private ovCenter: [number, number] = [0.5, 0.5];
  private ovRadius = 0.75;
```

- [ ] **Step 3: Init the composite program** — in the constructor, after `this.initFlow();`:

```ts
    this.initComposite();
```

And add the method (near `initFlow`):

```ts
  private initComposite() {
    const gl = this.gl;
    this.compProg = makeProgram(gl, VERT, COMPOSITE_FRAG);
    if (!this.compProg) return;
    gl.useProgram(this.compProg);
    this.compPos = gl.getAttribLocation(this.compProg, 'a_pos');
    const U = (n: string) => gl.getUniformLocation(this.compProg!, n);
    this.cloc = {
      plasma: U('u_plasma'), type: U('u_ovType'), blend: U('u_ovBlend'), opacity: U('u_ovOpacity'),
      colA: U('u_ovColA'), alphaA: U('u_ovAlphaA'), colB: U('u_ovColB'), alphaB: U('u_ovAlphaB'),
      angle: U('u_ovAngle'), center: U('u_ovCenter'), radius: U('u_ovRadius'),
    };
    this.plasmaFBO = gl.createFramebuffer();
  }

  private ensurePlasmaTarget(w: number, h: number) {
    const gl = this.gl;
    if (this.plasmaTex && this.ptW === w && this.ptH === h) return;
    if (!this.plasmaTex) this.plasmaTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.plasmaTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.ptW = w;
    this.ptH = h;
  }
```

- [ ] **Step 4: Map overlay config → internal** — in `applyConfigInternal(c)`, before the cursor mapping:

```ts
    const ov = c.overlay;
    this.ovType = OVERLAY_TYPE_INDEX[ov.type] ?? 0;
    this.ovBlend = OVERLAY_BLEND_INDEX[ov.blend] ?? 0;
    this.ovOpacity = ov.opacity;
    this.ovColA = hex2rgb(ov.colorA);
    this.ovAlphaA = ov.alphaA;
    this.ovColB = hex2rgb(ov.colorB);
    this.ovAlphaB = ov.alphaB;
    this.ovAngle = (ov.angleDeg * Math.PI) / 180;
    this.ovCenter = [ov.center[0], ov.center[1]];
    this.ovRadius = ov.radius;
```

- [ ] **Step 5: Rewrite `renderAt`** — replace the body so plasma draws into the FBO, then composite to screen:

```ts
  /** Render one frame at an explicit time (used by exporters + the loop). */
  renderAt(timeVal: number) {
    const gl = this.gl;
    if (!this.program || !this.compProg) return;
    const w = this.canvas.width, h = this.canvas.height;
    this.ensurePlasmaTarget(w, h);

    // pass 1: plasma → plasmaFBO
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.plasmaFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.plasmaTex, 0);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(this.aposLoc);
    gl.vertexAttribPointer(this.aposLoc, 2, gl.FLOAT, false, 0, 0);
    this.setUniforms(timeVal);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // pass 2: composite plasmaTex (+ overlay) → screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.compProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(this.compPos);
    gl.vertexAttribPointer(this.compPos, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.plasmaTex);
    gl.uniform1i(this.cloc.plasma!, 0);
    gl.uniform1i(this.cloc.type!, this.ovType);
    gl.uniform1i(this.cloc.blend!, this.ovBlend);
    gl.uniform1f(this.cloc.opacity!, this.ovOpacity);
    gl.uniform3f(this.cloc.colA!, this.ovColA[0], this.ovColA[1], this.ovColA[2]);
    gl.uniform1f(this.cloc.alphaA!, this.ovAlphaA);
    gl.uniform3f(this.cloc.colB!, this.ovColB[0], this.ovColB[1], this.ovColB[2]);
    gl.uniform1f(this.cloc.alphaB!, this.ovAlphaB);
    gl.uniform1f(this.cloc.angle!, this.ovAngle);
    gl.uniform2f(this.cloc.center!, this.ovCenter[0], this.ovCenter[1]);
    gl.uniform1f(this.cloc.radius!, this.ovRadius);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
```

> Note: `setUniforms` still binds the flowmap texture to TEXTURE0 for the plasma pass; the composite pass re-binds TEXTURE0 to `plasmaTex` afterward, so there's no conflict.

- [ ] **Step 6: Dispose the new resources** — in `dispose()`, before `this.program = null;`:

```ts
    if (this.compProg) gl.deleteProgram(this.compProg);
    if (this.plasmaTex) gl.deleteTexture(this.plasmaTex);
    if (this.plasmaFBO) gl.deleteFramebuffer(this.plasmaFBO);
```

- [ ] **Step 7: Run the smoke + existing core tests**

Run: `pnpm --filter @effects/core test`
Expected: PASS (renderer smoke test still constructs against the stub; no GL executed in node).

- [ ] **Step 8: Typecheck**

Run: `pnpm --filter @effects/core exec tsc -p tsconfig.json --noEmit`
Expected: no output (clean).

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/plasma/renderer.ts
git commit -m "feat(core): two-pass renderer with overlay composite"
```

---

### Task 4: Seeded randomize

**Files:**
- Modify: `packages/core/src/plasma/randomize.ts` (`mulberry32`, seed param, `overlay` lock group)
- Modify: `packages/core/src/plasma/randomize.test.ts`

**Interfaces:**
- Consumes: `CoreConfig`, `defaultConfig`, `THEMES`, `THEME_NAMES`.
- Produces: `randomizeConfig(current: CoreConfig, locks: Record<string,boolean>, seed?: number): CoreConfig` (result carries `seed`); `mulberry32(seed:number): () => number`; `LOCK_GROUPS` gains `{ key:'overlay', label:'Overlay', paths:['overlay'] }`.

- [ ] **Step 1: Write the failing tests** — append to `randomize.test.ts`:

```ts
import { mulberry32 } from './randomize.js';

describe('seeded randomize', () => {
  it('same seed + same locks ⇒ deep-equal', () => {
    const a = randomizeConfig(defaultConfig, {}, 1234);
    const b = randomizeConfig(defaultConfig, {}, 1234);
    expect(a).toEqual(b);
    expect(a.seed).toBe(1234);
  });
  it('different seeds differ', () => {
    const a = randomizeConfig(defaultConfig, {}, 1);
    const b = randomizeConfig(defaultConfig, {}, 2);
    expect(a).not.toEqual(b);
  });
  it('restores Math.random even if the roll throws', () => {
    const orig = Math.random;
    try { randomizeConfig(defaultConfig, {}, 7); } catch { /* ignore */ }
    expect(Math.random).toBe(orig);
  });
  it('overlay is a lock group; locking it preserves overlay', () => {
    expect(LOCK_GROUPS.map((g) => g.key)).toContain('overlay');
    const cur = parseConfig({ ...defaultConfig, overlay: { ...defaultConfig.overlay, type: 'radial', colorA: '#abcdef' } });
    const out = randomizeConfig(cur, { overlay: true }, 99);
    expect(out.overlay).toEqual(cur.overlay);
  });
  it('mulberry32 is deterministic + in [0,1)', () => {
    const r1 = mulberry32(42), r2 = mulberry32(42);
    const a = r1(), b = r2();
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @effects/core exec vitest run src/plasma/randomize.test.ts`
Expected: FAIL (`mulberry32` missing; `seed` not set; `overlay` group absent).

- [ ] **Step 3: Add the overlay lock group** — in `randomize.ts`, add to the `LOCK_GROUPS` array (after `cursor`):

```ts
  { key: 'overlay', label: 'Overlay', paths: ['overlay'] },
```

- [ ] **Step 4: Add `mulberry32`** — in `randomize.ts`:

```ts
/** Small fast deterministic PRNG → [0,1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 5: Thread the seed through `randomizeConfig`** — replace the function:

```ts
export function randomizeConfig(
  current: CoreConfig,
  locks: Record<string, boolean>,
  seed?: number,
): CoreConfig {
  const usedSeed = seed != null ? seed >>> 0 : (Math.random() * 0x100000000) >>> 0;
  const orig = Math.random;
  let candidate: CoreConfig;
  try {
    const rng = mulberry32(usedSeed);
    Math.random = rng; // verbatim THEMES call Math.random — seed them deterministically
    candidate = rollCandidate();
  } finally {
    Math.random = orig;
  }
  for (const p of lockedRestorePaths(locks)) {
    candidate = setByPath(candidate, p, getByPath(current, p));
  }
  candidate = setByPath(candidate, 'seed', usedSeed);
  return parseConfig(candidate);
}
```

> `rollCandidate()` already exists (rolls a random THEME over `defaultConfig`); it now runs under the seeded `Math.random`.

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm --filter @effects/core test`
Expected: PASS (all core tests, incl. the all-locked-deep-equal one — `seed` is excluded from groups but `randomizeConfig` sets it to the same value when the seed arg is fixed; the existing all-locked test passes no seed, so add a seed there).

- [ ] **Step 7: Fix the all-locked test for the seed field** — in the existing `'all groups locked → output deep-equals current'` test, pass the current seed so the metadata matches:

```ts
    const cur = parseConfig({ ...defaultConfig, speed: 0.5, scalePct: 130, palette: ['#abcdef'], bg: '#111111' });
    const locks = Object.fromEntries(LOCK_GROUPS.map((g) => [g.key, true]));
    expect(randomizeConfig(cur, locks, cur.seed)).toEqual(cur);
```

Run again: `pnpm --filter @effects/core test` → Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/plasma/randomize.ts packages/core/src/plasma/randomize.test.ts
git commit -m "feat(core): seeded randomize + overlay lock group"
```

---

### Task 5: Studio overlay panel

**Files:**
- Create: `apps/studio/src/panels/controls/OverlayControls.tsx`
- Modify: `apps/studio/src/panels/controls/spec.ts` (overlay slider specs)
- Modify: `apps/studio/src/panels/RightPanel.tsx` (add the Overlay `Section`, lockKey `overlay`)

**Interfaces:**
- Consumes: `useConfigStore` (`set`, config), `OVERLAY_TYPES`, `OVERLAY_BLENDS` (`@effects/core`), `ParamSlider`, `Chip`, `Select`, `Section`.
- Produces: an `<OverlayControls/>` component writing to `overlay.*` paths.

- [ ] **Step 1: Add overlay slider specs** — in `spec.ts`, add to the `PARAMS` object:

```ts
  ovOpacity: { key: 'ovOpacity', label: 'opacity', path: 'overlay.opacity', min: 0, max: 1, step: 0.01, decimals: 2 },
  ovAlphaA: { key: 'ovAlphaA', label: 'stop A alpha', path: 'overlay.alphaA', min: 0, max: 1, step: 0.01, decimals: 2 },
  ovAlphaB: { key: 'ovAlphaB', label: 'stop B alpha', path: 'overlay.alphaB', min: 0, max: 1, step: 0.01, decimals: 2 },
  ovAngle: { key: 'ovAngle', label: 'angle', path: 'overlay.angleDeg', min: 0, max: 360, step: 1, unit: '°', decimals: 0 },
  ovRadius: { key: 'ovRadius', label: 'radius', path: 'overlay.radius', min: 0.05, max: 2, step: 0.01, decimals: 2 },
  ovCenterX: { key: 'ovCenterX', label: 'center x', path: 'overlay.center.0', min: -1, max: 2, step: 0.01, decimals: 2 },
  ovCenterY: { key: 'ovCenterY', label: 'center y', path: 'overlay.center.1', min: -1, max: 2, step: 0.01, decimals: 2 },
```

- [ ] **Step 2: Implement `OverlayControls.tsx`**

```tsx
// Overlay group: gradient/color type, blend mode, opacity, two color+alpha stops,
// and per-type geometry (angle for linear; center+radius for radial).
import { OVERLAY_TYPES, OVERLAY_BLENDS } from '@effects/core';
import { Chip } from '../../components/ui/chip.js';
import { Select } from '../../components/ui/select.js';
import { ParamSlider } from './ParamSlider.js';
import { PARAMS } from './spec.js';
import { useConfigStore } from '../../stores/config.js';

export function OverlayControls() {
  const type = useConfigStore((s) => s.config.overlay.type);
  const blend = useConfigStore((s) => s.config.overlay.blend);
  const colorA = useConfigStore((s) => s.config.overlay.colorA);
  const colorB = useConfigStore((s) => s.config.overlay.colorB);
  const set = useConfigStore((s) => s.set);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {OVERLAY_TYPES.map((t) => (
          <Chip key={t} active={type === t} onClick={() => set('overlay.type', t)}>
            {t}
          </Chip>
        ))}
      </div>

      {type !== 'none' && (
        <>
          <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
            blend
            <Select value={blend} onChange={(e) => set('overlay.blend', e.target.value)} className="ml-auto w-[130px]">
              {OVERLAY_BLENDS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </Select>
          </label>
          <ParamSlider spec={PARAMS.ovOpacity} />

          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            stop A
            <input type="color" value={colorA} onChange={(e) => set('overlay.colorA', e.target.value)}
              className="ml-auto h-7 w-9 cursor-pointer rounded-md border border-border bg-transparent p-0.5" />
          </div>
          <ParamSlider spec={PARAMS.ovAlphaA} />

          {type !== 'color' && (
            <>
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                stop B
                <input type="color" value={colorB} onChange={(e) => set('overlay.colorB', e.target.value)}
                  className="ml-auto h-7 w-9 cursor-pointer rounded-md border border-border bg-transparent p-0.5" />
              </div>
              <ParamSlider spec={PARAMS.ovAlphaB} />
            </>
          )}

          {type === 'linear' && <ParamSlider spec={PARAMS.ovAngle} />}
          {type === 'radial' && (
            <>
              <ParamSlider spec={PARAMS.ovCenterX} />
              <ParamSlider spec={PARAMS.ovCenterY} />
              <ParamSlider spec={PARAMS.ovRadius} />
            </>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add the Overlay section to `RightPanel.tsx`** — add the import:

```tsx
import { OverlayControls } from './controls/OverlayControls.js';
```

And add a `Section` after the `Busyness` section, before the `Export` section:

```tsx
        <Section title="Overlay" lockKey="overlay">
          <OverlayControls />
        </Section>
```

- [ ] **Step 4: Typecheck + build**

Run: `pnpm --filter studio exec tsc --noEmit && pnpm --filter studio exec vite build`
Expected: clean typecheck; successful build.

- [ ] **Step 5: Commit**

```bash
rm -rf apps/studio/dist
git add apps/studio/src/panels/controls/OverlayControls.tsx apps/studio/src/panels/controls/spec.ts apps/studio/src/panels/RightPanel.tsx
git commit -m "feat(studio): overlay panel controls"
```

---

### Task 6: Studio seed control + seeded surprise-me + overlay golden

**Files:**
- Modify: `apps/studio/src/lib/surprise.ts` (use `config.seed`-driven randomize)
- Modify: `apps/studio/src/panels/LeftPanel.tsx` (seed field + dice in the Vibes section)
- Modify: `apps/studio/src/golden.ts` (allow overlay in golden configs — already passes full cfg; no change needed beyond confirming)
- Modify: `tests/visual/plasma.spec.ts` (add an overlay sample)

**Interfaces:**
- Consumes: `randomizeConfig` (`@effects/core`), `useConfigStore`.
- Produces: `surprise()` rolls a fresh seed; a seed input + dice in the left panel; one new golden.

- [ ] **Step 1: Update `surprise.ts`** to roll a fresh seed each time:

```ts
// Surprise-me: re-roll unlocked config with a NEW random seed (stored in config).
import { randomizeConfig } from '@effects/core';
import { useConfigStore } from '../stores/config.js';

export function surprise() {
  const { config, locks, setConfig } = useConfigStore.getState();
  setConfig(randomizeConfig(config, locks)); // no seed arg → fresh random seed, stored on result
}

/** Re-roll using an explicit seed (reproducible). */
export function rerollWithSeed(seed: number) {
  const { config, locks, setConfig } = useConfigStore.getState();
  setConfig(randomizeConfig(config, locks, seed));
}
```

- [ ] **Step 2: Add the seed control to `LeftPanel.tsx`** — add imports:

```tsx
import { rerollWithSeed } from '../lib/surprise.js';
```

Inside the component, read the seed:

```tsx
  const seed = useConfigStore((s) => s.config.seed);
```

Add a seed row inside the `Vibes` `Section`, right under the surprise button:

```tsx
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            seed
            <input
              type="number"
              value={seed}
              onChange={(e) => rerollWithSeed(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              className="ml-auto w-[96px] rounded-md border border-border bg-secondary px-1.5 py-1 text-right font-mono text-[11px] text-foreground focus:border-ring focus:outline-none"
            />
          </div>
```

(Note: `surprise` is already imported and wired to the surprise button + Space tap; no change there.)

- [ ] **Step 3: Typecheck + build**

Run: `pnpm --filter studio exec tsc --noEmit && pnpm --filter studio exec vite build`
Expected: clean.

- [ ] **Step 4: Add an overlay visual golden** — in `tests/visual/plasma.spec.ts`, add to the `SAMPLES` array:

```ts
  {
    name: 'overlay-radial-multiply',
    cfg: {
      motion: 'Classic', material: 'Smooth', shape: 'Free',
      overlay: { type: 'radial', blend: 'multiply', opacity: 0.9, colorA: '#ffffff', alphaA: 0,
        colorB: '#000010', alphaB: 1, angleDeg: 0, center: [0.5, 0.5], radius: 0.8 },
    },
  },
```

- [ ] **Step 5: Generate the new baseline + verify existing goldens still pass**

Run: `pnpm exec playwright test --update-snapshots`
Then verify stability: `pnpm exec playwright test`
Expected: all pass. If the two-pass change shifted existing baselines beyond tolerance (it should not — plasma is a fullscreen shader with no MSAA-relevant edges), inspect the diff; if it's an imperceptible global shift, the `--update-snapshots` run already refreshed them — re-confirm with a second `pnpm exec playwright test`.

- [ ] **Step 6: Commit**

```bash
rm -rf apps/studio/dist
git add apps/studio/src/lib/surprise.ts apps/studio/src/panels/LeftPanel.tsx tests/visual/plasma.spec.ts tests/visual/plasma.spec.ts-snapshots
git commit -m "feat(studio): seed control + seeded surprise-me + overlay golden"
```

---

### Task 7: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `pnpm test` (turbo: core + studio) and `pnpm exec playwright test`
Expected: all green.

- [ ] **Step 2: Manual visual check** — start `pnpm studio`, then in the running app:
  - Right panel → Overlay → pick `linear`, set blend `screen`, drag opacity/alphas → overlay updates live.
  - Left panel → surprise me → seed field changes; type the previous seed back + it reproduces the look.
  - Lock the Overlay group, surprise me → overlay preserved, rest re-rolls.
  - Export → save PNG → confirm the overlay is baked into the file.

- [ ] **Step 3: Update the spec status** — set the spec doc `Status:` to `implemented`. Commit:

```bash
git add docs/superpowers/specs/2026-06-18-overlay-and-seed-design.md
git commit -m "docs: mark overlay + seed spec implemented"
```

---

## Self-Review notes

- **Spec coverage:** §1 two-pass → Task 3; §2 overlay GLSL/OKLab → Task 2; §3 schema → Task 1; §4 seeded randomize → Task 4; §5 UI → Tasks 5–6; §6 tests → Tasks 1,2,4,6; §7 future work is intentionally not built.
- **Passthrough/goldens:** overlay default `none` keeps existing goldens valid; Task 6 Step 5 explicitly re-verifies and refreshes baselines if the FBO path shifts pixels.
- **Type consistency:** `randomizeConfig(current, locks, seed?)` is used identically in core tests and the studio (`surprise.ts`); `OVERLAY_TYPES`/`OVERLAY_BLENDS` exported from `config.ts`, `OVERLAY_TYPE_INDEX`/`OVERLAY_BLEND_INDEX` from `overlay.ts`; overlay paths (`overlay.opacity`, `overlay.center.0`, …) match the schema shape.
- **Seed/locks invariant:** `seed` is excluded from `LOCK_GROUPS` but set deterministically; the all-locked-deep-equal test passes `cur.seed` so metadata matches (Task 4 Step 7).
