# Continue here

> Handoff note for picking up on another machine. Last updated 2026-06-22.

## How to resume

```bash
git pull
npm install          # in case deps changed
# launch the studio (see PLASMA_STUDIO_ROADMAP.md / package.json scripts)
```

## Where things stand

All work through **M2 hardening** is done and pushed: core `PlasmaRenderer` at WebGL1
parity, the studio app (artboard, docks, dropdowns, export modals, OKLCH), overlay +
seeded randomize, history nav, share links, exporters (PNG / two-mode video / embed),
Playwright visual goldens, and the recent fluid-displacement and still-image/video-export
fixes.

Last commit: `645c526 docs: post-effects pipeline design spec`.

## Done — post-effects pipeline (2026-06-22)

Bloom ("Shining") / Blur / Glass / Pixelate now ship as a stackable post-process
chain between the plasma FBO and the gradient composite. Implemented test-first:

- **Core:** `effects` config block (zod, clamped, all-off default) in
  [config.ts](packages/core/src/plasma/config.ts) + [config-defaults.ts](packages/core/src/plasma/config-defaults.ts);
  new [effects.ts](packages/core/src/plasma/effects.ts) (`EffectChain` class + GLSL
  passes + `planPasses`/`bloomBrightWeight` helpers); "Effects" lock group in
  [randomize.ts](packages/core/src/plasma/randomize.ts) (surprise-me rolls them lightly);
  chain wired into [renderer.ts](packages/core/src/plasma/renderer.ts).
- **UI:** [EffectsControls.tsx](apps/studio/src/panels/controls/EffectsControls.tsx) +
  `PARAMS` in [spec.ts](apps/studio/src/panels/controls/spec.ts) + Effects section in
  [RightPanel.tsx](apps/studio/src/panels/RightPanel.tsx).
- **Reach:** effects run in studio, PNG/video export, AND the `<plasma-bg>` embed
  (they share `PlasmaRenderer`). Embed bundle 13.58 KB gzip, under the 15 KB budget.
  This deviates from the spec's "embed out of scope" — see the spec's Implementation note.
- **Tests:** unit (config round-trip/clamp, effects pass-order/bloom math, lock group)
  + 5 new Playwright goldens (one per effect + a stacked combo). Full suite + build green.

> Heads-up: the embed budget now has only ~1.4 KB gzip headroom. Watch it if you add
> more effect shaders.

## Next ideas (backlog)

Effects extensions noted as out-of-scope in the spec: chromatic aberration, vignette,
per-effect presets, WebGL2/float FBOs. See [PLASMA_STUDIO_ROADMAP.md](PLASMA_STUDIO_ROADMAP.md).
