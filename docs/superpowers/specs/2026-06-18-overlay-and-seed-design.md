# Overlay + Seeded Randomize — Design Spec

**Status:** approved (design forks confirmed 2026-06-18)
**Depends on:** the M1 engine/studio (Tasks 0–9, committed).

## Goal

Add two engine-level features to the plasma library + studio:

1. **Overlay** — a gradient (linear / radial) or single-color layer composited *on top of*
   the plasma, baked into the render so it appears in live preview, PNG/video exports, and
   the website embed. Blend modes (normal/multiply/screen/overlay) + opacity. Gradient stops
   interpolated in **OKLab** for perceptually smooth color.
2. **Seeded randomize** — a deterministic seed (stored in the shareable config) drives
   "surprise me", so the same seed + same locks ⇒ the same look. Visible + editable.

## Decisions (confirmed)

- Overlay is **engine-baked** (two-pass render), not a CSS layer — so it exports + embeds.
- Gradient is **2 stops**, each color + alpha; single-color uses stop A only.
- **Blend modes** included: `normal | multiply | screen | overlay`, plus an overall opacity.
- Gradient color interpolation in **OKLab** (perceptually uniform; no muddy sRGB midpoints).
- Seed lives **in `CoreConfig`** (carried by share links, visible, editable).

---

## 1. Engine: two-pass render

Today `renderAt(t)` draws the plasma straight to the screen. Blend modes need the plasma
color as an input, so we render to an offscreen texture first.

**New flow inside `renderAt(t)`:**
1. (existing) flowmap ping-pong pass → 256² FBO.
2. Plasma pass → **plasma FBO** (canvas-sized RGBA8 texture) instead of the default framebuffer.
3. **Composite pass** → default framebuffer (screen): sample the plasma texture, compute the
   overlay color/alpha at the screen UV, blend, write final pixels.

**Resources (renderer.ts):**
- `plasmaTex` (RGBA8), `plasmaFBO` — sized to the canvas; (re)allocated in `resize()` and
  `beginExport()` whenever canvas dimensions change. NEAREST filtering (1:1 sample).
- `compositeProgram` — `VERT` (reused, already emits `v_uv`) + new `COMPOSITE_FRAG`.
- Overlay uniforms cached like the plasma uniforms.

**Passthrough:** when `overlay.type === 'none'`, the composite shader outputs the plasma color
unchanged (overlay alpha forced to 0). Default output and existing visual goldens are
unaffected. (We still go through the FBO+composite for a single code path; cost is one
fullscreen blit — negligible.)

**Export/size:** `beginExport(w,h)` and `resize()` both reallocate the plasma FBO to match.
`dispose()` deletes `plasmaTex`/`plasmaFBO`/`compositeProgram`.

## 2. Overlay GLSL (`COMPOSITE_FRAG`)

Authored as a new GLSL constant in a new **hand-written** `packages/core/src/plasma/overlay.ts`
(the legacy has no overlay, so nothing to extract). The generated `shaders.ts` and all plasma
GLSL stay byte-verbatim and untouched. `overlay.ts` exports `COMPOSITE_FRAG` + the OKLab
helpers; `index.ts` re-exports it.

```
uniform sampler2D u_plasma;
uniform int   u_ovType;     // 0 none, 1 color, 2 linear, 3 radial
uniform int   u_ovBlend;    // 0 normal, 1 multiply, 2 screen, 3 overlay
uniform float u_ovOpacity;  // 0..1
uniform vec3  u_ovColA; uniform float u_ovAlphaA;
uniform vec3  u_ovColB; uniform float u_ovAlphaB;
uniform float u_ovAngle;    // radians (linear)
uniform vec2  u_ovCenter;   // 0..1 (radial)
uniform float u_ovRadius;   // radial extent
```

- **t (gradient position):** color → `0`; linear → `clamp(dot(uv-0.5, dir)+0.5, 0,1)` with
  `dir=vec2(cos,sin)(angle)`; radial → `clamp(distance(uv,center)/radius, 0,1)`.
- **stop color:** `oklabMix(colA, colB, t)` — sRGB→linear→OKLab, mix, →linear→sRGB.
  Single color skips the mix.
- **alpha:** `mix(alphaA, alphaB, t) * opacity` (color uses `alphaA`).
- **blend(base, ov):** normal=`ov`; multiply=`base*ov`; screen=`1-(1-base)*(1-ov)`;
  overlay=per-channel `base<0.5 ? 2·base·ov : 1-2(1-base)(1-ov)`.
- **out:** `mix(base, blend(base, ovColor), effAlpha)`.

OKLab helpers (`linear_srgb_to_oklab` / inverse) are the standard Ottosson matrices.

## 3. Config schema (`config.ts`)

Add to `PlasmaConfig` (and `config-defaults.ts` default object — keep the
`defaultConfig === parseConfig({})` guard test green):

```
overlay: {
  type:   'none' | 'color' | 'linear' | 'radial'   (default 'none')
  blend:  'normal' | 'multiply' | 'screen' | 'overlay'  (default 'normal')
  opacity: num 0..1     (default 1)
  colorA: hex           (default '#000000')
  alphaA:  num 0..1     (default 0.5)
  colorB: hex           (default '#000000')
  alphaB:  num 0..1     (default 0)
  angleDeg: num 0..360  (default 0)
  center:  [num -1..2, num -1..2]  (default [0.5, 0.5])
  radius:  num 0.05..2  (default 0.75)
}
seed: int >= 0          (default 1)   // uint32 range; never clamped away
```

All zod-validated/clamped, so old/tampered share links stay safe. Overlay defaults to a no-op.

## 4. Seeded randomize (`randomize.ts`)

- `mulberry32(seed): () => number` — small, fast, well-distributed 32-bit PRNG.
- `randomizeConfig(current, locks, seed?)`:
  - `usedSeed = seed ?? (Math.random()*2³² | 0)`.
  - Save `Math.random`; set `Math.random = mulberry32(usedSeed)`; roll the candidate (the
    verbatim THEMES call `Math.random` internally — this makes them deterministic); restore in
    a `finally`.
  - Restore locked paths from `current` (as today), set `result.seed = usedSeed`, `parseConfig`.
- `seed` is **never** part of `LOCK_GROUPS` (it always updates to the seed that was used).
- Determinism contract: same `seed` + same `locks` + same locked values in `current`
  ⇒ deep-equal result. (Unlocked fields fully determined by the seed.)

## 5. UI (studio)

- **Right panel — new "Overlay" `Section`** (lockable group key `overlay`, added to
  `LOCK_GROUPS`): type chips; blend `Select`; `opacity` slider; two stop rows (color picker +
  alpha slider); `angle` slider (linear); `center` X/Y + `radius` (radial). Controls show/hide
  per type. Bound to `overlay.*` paths via the existing `ParamSlider`/store machinery.
- **Left panel — seed control** near surprise-me: an editable numeric field showing
  `config.seed` and a dice button. Surprise-me rolls a fresh seed; editing the seed + re-roll
  reproduces. `LOCK_GROUPS` gains `overlay`; pattern/etc unchanged.
- Lock-group coverage stays total (every field in a group) so "all locked ⇒ unchanged" holds;
  `seed` is intentionally excluded (metadata, always re-rolled).

## 6. Tests

- **config.test:** overlay + seed round-trip; clamps (bad blend/type → default; alpha clamp);
  `defaultConfig === parseConfig({})` still holds.
- **randomize.test:** `randomizeConfig(base, {}, 1234)` deep-equals itself across repeat calls
  (determinism); different seeds differ; locked group preserved; `Math.random` restored after
  (and after a thrown roll); seed stored on the result.
- **visual golden:** one new sample with an overlay (e.g. radial multiply vignette) at fixed
  seek — proves the composite pass renders; existing goldens unchanged (overlay none).
- **oklab:** unit-check `oklab(srgb)` round-trips and a mid-mix isn't a grey dead-zone
  (sanity: OKLab midpoint chroma ≥ sRGB midpoint chroma for a complementary pair).

## 7. Out of scope / future engine + library (captured, not built now)

These are proven, high-value additions noted for later milestones — not in this spec:

- **Domain warping** (IQ: `fbm(p+fbm(p+fbm(p)))`) — new motion field / global "warp depth".
- **Curl noise** (Bridson 2007) — divergence-free flow field for flow + cursor.
- **Critically-damped spring / SmoothDamp** — replace the cursor's exponential lerp.
- **IQ cosine palettes** (`a+b·cos(2π(c·t+d))`) — palette generator.
- **Incommensurate sine sums / golden-ratio frequencies** — non-repeating motion.
- **Golden angle (137.507°)** — radial/phyllotaxis placement.
- OKLab is introduced here for the overlay; reusing it for palette/harmony interpolation is a
  natural follow-up.

## Risks

- Two-pass adds a plasma FBO (canvas-sized RGBA, DPR≤2) + one blit — minor VRAM/fill cost.
- WebGL1: RGBA8 color-attachment FBO is universally supported; no float texture needed.
- Goldens are SwiftShader-pinned; the new overlay golden inherits the same tolerance.
