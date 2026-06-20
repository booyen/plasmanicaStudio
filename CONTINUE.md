# Continue here

> Handoff note for picking up on another machine. Last updated 2026-06-20.

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

## Next task — implement the post-effects pipeline

The design spec is written but **not yet implemented**:
[docs/superpowers/specs/2026-06-19-post-effects-design.md](docs/superpowers/specs/2026-06-19-post-effects-design.md)

Four effects (bloom / blur / glass / pixelate) as a post-process chain feeding the
always-on gradient composite. Spec covers:

- **Core:** `effects` config schema + defaults, GLSL passes, added to `LOCK_GROUPS`
  ("Effects" group) in `packages/core/src/plasma/randomize.ts`.
- **UI:** new collapsible "Effects" section + `apps/studio/src/panels/controls/EffectsControls.tsx`,
  new `PARAMS` entries in `controls/spec.ts`.
- **Exports:** PNG/video get effects for free; embed deliberately excludes them (bundle budget).
- **Tests:** `config.test.ts` round-trip, `effects.test.ts` pass-order/math, Playwright goldens.

Suggested starting point: core config schema + GLSL passes first, then wire the UI, then goldens.

See [PLASMA_STUDIO_ROADMAP.md](PLASMA_STUDIO_ROADMAP.md) for the broader milestone plan.
