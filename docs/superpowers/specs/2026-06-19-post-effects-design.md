# Post-Effects Pipeline — Design Spec

**Date:** 2026-06-19
**Status:** Implemented 2026-06-22. One deviation from this spec — see "Implementation note" below.
**Scope:** Add stackable image-filter effects (Bloom/"Shining", Blur, Glass, Pixelate) to the Plasma/Effects Studio, separate from the existing gradient Overlay. Works in the studio + PNG/video export. The `<plasma-bg>` embed stays lean (gradient overlay only).

## Implementation note (2026-06-22)

The spec assumed the embed could stay effect-free because "the effects module is
not imported in the embed path." That premise was wrong: the embed instantiates
the **same `PlasmaRenderer`** ([packages/embed/src/plasma-bg.ts](../../../packages/embed/src/plasma-bg.ts)),
which owns the effect chain — so the effect code (and behaviour) is reachable from
the embed no matter what. Rather than add a DI seam to strip it back out, effects
now run **everywhere** (studio, export, **and** `<plasma-bg>`). The embed gains
effects for free; the bundle grew from 10.67 KB → **13.58 KB gzip**, still under
the < 15 KB budget. The "Embed support … out of scope" item below is therefore
superseded. Effect GLSL lives in [packages/core/src/plasma/effects.ts](../../../packages/core/src/plasma/effects.ts)
as the `EffectChain` class (not a free `applyEffects(gl, …, ctx)` function as the
spec sketched — the class owns the ping-pong pool + programs and keeps the
renderer lean).

## Goal

The studio currently has a single-select **Overlay** (none / color / linear / radial gradient), applied as a post-process composite pass over the rendered plasma. This adds a new **Effects** group of *independent, stackable* image filters — each toggleable with its own adjustable parameters — that layer on top of the plasma and compose with the gradient overlay.

## Decisions (locked in brainstorm 2026-06-19)

- **Structure:** A new **Effects** section, separate from Overlay. Each effect toggles independently and they stack (e.g. blur + gradient + bloom together). Not folded into the single overlay `type` dropdown.
- **Effect set & params:**
  - **Bloom** (labelled "Shining") — bright areas of the plasma bleed a soft glow. Params: `threshold`, `intensity`, `radius`. Static (follows the plasma).
  - **Blur** — plain gaussian softening. Param: `strength`.
  - **Glass** — frosted blur **plus a milky bright tint** (frosted-pane look). Params: `strength`, `tint`. Independent of Blur (enabling both just blurs more).
  - **Pixelate** — snap sampling to a grid. Param: `size` (cell size).
- **Reach:** Studio + exported PNG/video only. Embed keeps gradient-overlay-only to protect the <15KB gzip budget.
- **Pass order (fixed):** `pixelate → blur/glass → bloom → gradient composite → screen`. Bloom glows the already-blurred image; enabling pixelate + blur softens the blocks (by design).
- **Default state:** all effects off → zero visual change until enabled.

## Architecture — Approach A: multi-pass ping-pong chain

The plasma already renders to an FBO texture (`u_plasma`) consumed by the gradient composite pass ([packages/core/src/plasma/overlay.ts](../../../packages/core/src/plasma/overlay.ts)). Insert an optional effect chain between the plasma FBO and the composite.

```
plasma → plasmaFBO
   → [pixelate]    1 pass,  single-tap UV snap (cheap)
   → [blur/glass]  2 separable passes (H then V); glass adds milky tint in the V pass
   → [bloom]       bright-pass → separable blur (H+V) → additive combine
   → composite     existing gradient overlay
   → screen
```

- **Two reusable ping-pong FBOs** (`postA` / `postB`), canvas-sized, RGBA8 (matches existing). Each enabled effect reads the previous result texture and writes to the next FBO.
- **A disabled effect is skipped entirely — zero cost.** Only the gradient composite always runs (it already does).
- Blur and bloom use **separable gaussian** (horizontal then vertical) for quality at a bounded tap count.

### New module: `packages/core/src/plasma/effects.ts`

- Holds pass fragment shaders: `PIXELATE_FRAG`, `BLUR_FRAG` (separable, direction uniform), `GLASS_FRAG` (separable blur + tint), `BLOOM_BRIGHT_FRAG`, `BLOOM_COMBINE_FRAG` (bloom reuses `BLUR_FRAG` for its blur stage).
- Exposes `applyEffects(gl, srcTex, cfg, ctx): WebGLTexture` — runs the enabled passes in fixed order against the ping-pong FBOs in `ctx` and returns the final texture for the composite pass. Pure orchestration; owns no long-lived state beyond the FBOs passed in.
- Renderer (`renderer.ts`) owns the two ping-pong FBOs + the effect programs, calls `applyEffects` between the plasma draw and the composite draw. Keeps the renderer lean; each effect is independently testable.

## Config schema (`packages/core/src/plasma/config.ts`)

New `effects` block (zod-validated, clamped, defaults all-off):

```ts
effects: {
  pixelate: { on: false, size: 8 },                  // cell px, clamp 2–64
  blur:     { on: false, strength: 0.5 },            // 0–1 → tap radius
  glass:    { on: false, strength: 0.5, tint: 0.3 }, // strength 0–1; tint 0–1 (milky white)
  bloom:    { on: false, threshold: 0.7, intensity: 0.6, radius: 0.5 }, // all 0–1
}
```

- Defaults transcribed into `config-defaults.ts`.
- Round-trips through share links (lz-string + zod validate on load) with no special handling.
- Added to lock-and-randomize `LOCK_GROUPS` ([packages/core/src/plasma/randomize.ts](../../../packages/core/src/plasma/randomize.ts)) as a new **"Effects"** group: `effects` paths grouped so surprise-me can roll them and the group/per-param padlocks work.

## UI (`apps/studio/src/panels/RightPanel.tsx` + controls)

- New collapsible **"Effects"** `Section` (lockKey `effects`), placed below the Overlay section.
- One sub-row per effect: a toggle chip/button (`blur: on/off`, like the cursor on/off button) that reveals that effect's `ParamSlider`s only when on — mirroring how `OverlayControls` hides geometry until a type is selected.
- New file `apps/studio/src/panels/controls/EffectsControls.tsx`. Reuses existing `ParamSlider`, `Chip`, `Button`, `Section` — no new primitives.
- New `PARAMS` entries in `controls/spec.ts` for each effect slider (label/min/max/step/decimals).

## Exports & embed

- **PNG / video:** free — they drive the same `PlasmaRenderer` (`renderAt` / `beginExport`), so the effect chain runs automatically and lands in the exported pixels.
- **Embed (`packages/embed`):** continues to use only the gradient composite; the `effects` module is not imported in the embed path, so the bundle and <15KB gzip budget are untouched. If an embed config carries `effects`, they're ignored.

## Testing

- **Unit:**
  - `config.test.ts` — `effects` parse / clamp / round-trip; `parseConfig(defaultConfig)` still round-trips with effects all-off.
  - `effects.test.ts` — fixed pass-order helper; any JS-mirrored math (e.g. bloom bright-pass threshold/knee).
- **Visual goldens (Playwright):** add fixed-seed/fixed-time samples — bloom on, blur on, pixelate on, glass on, and one stacked (blur + bloom + gradient) — compared to committed baselines.
- **Perf:** separable blur, capped tap count, disabled-pass skip. Export is offline, so 4K bloom/blur cost is acceptable; the renderer's existing adaptive render-scale still applies live.

## Out of scope

- Embed support for effects (deliberately excluded to protect bundle budget).
- WebGL2 / float FBOs (effects use the existing RGBA8 WebGL1 path).
- Additional effects beyond the four above (e.g. chromatic aberration, vignette) — backlog.
- Per-effect presets (just toggle + sliders, consistent with existing controls).

## Risks / notes

- Stacking blur + glass + bloom is GPU-heavier; mitigated by disabled passes being free and capped taps. Live perf protected by existing adaptive scale.
- Pixelate-then-blur softens the blocks — documented as intended; users wanting crisp pixels just leave blur off.
- The gradient composite remains the always-on final pass; the effect chain feeds its `u_plasma` input instead of the raw plasma FBO.
