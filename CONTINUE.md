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

Latest work: WebCodecs MP4 export (M4 complete) — see the section below.

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

## Done — WebCodecs MP4 export (2026-06-23) → M4 complete

`exportVideo` now emits real H.264 **MP4** via WebCodecs, rendered *faster than
realtime*, and transparently falls back to the existing MediaRecorder **WebM**
path where WebCodecs is unavailable. This completes **Milestone 4** (post pipeline
+ WebCodecs MP4). Implemented test-first per
[the plan](docs/superpowers/plans/2026-06-23-webcodecs-mp4-export.md):

- **Core:** new backend in [video-webcodecs.ts](packages/core/src/exporters/video-webcodecs.ts)
  (`pickH264Codec` probes High→Main→Baseline via `isConfigSupported`;
  `exportVideoWebCodecs` encodes `VideoFrame`s and muxes MP4 with `mp4-muxer`,
  no realtime pacing, `encodeQueueSize` backpressure, `endExport`/`frame.close`
  in `finally`). [video.ts](packages/core/src/exporters/video.ts) gains
  `supportsWebCodecs()`, a shared `renderFrameToCanvas` compositor, and an
  `exportVideo` dispatcher; the old body is preserved as `exportVideoMediaRecorder`.
- **UI:** [VideoExportModal.tsx](apps/studio/src/panels/export/VideoExportModal.tsx)
  — backend-neutral "rendering N%" wording + a read-only "MP4 · H.264 / WebM"
  caption. No new controls; format selection is automatic.
- **Reach & budget:** `mp4-muxer` is in `packages/core` only and imported solely by
  the exporters, so it does NOT reach the `<plasma-bg>` embed — embed still 13.58 KB
  gzip. (Studio bundle grew ~10 KB gzip, which is fine — only the embed is budgeted.)
- **Tests:** unit (`pickH264Codec` selection, `supportsWebCodecs` branches, dispatch
  routing) + a Playwright check that drives `exportVideo` in real Chromium and
  asserts a `video/mp4` blob with an `ftyp` box. Full suite green: 81 unit, 14 visual.

> Heads-up: `mp4-muxer@5.2.2` is npm-deprecated (successor: `mediabunny`) — it works
> and its API is intact, but consider migrating. It also pulls `@types/dom-webcodecs`
> as a transitive runtime dep.

## Next ideas (backlog)

Effects extensions noted as out-of-scope in the post-effects spec: chromatic
aberration, vignette, per-effect presets, WebGL2/float FBOs. Plus: migrate the MP4
muxer off deprecated `mp4-muxer` to `mediabunny`; optional 4K export tier (now cheap
with faster-than-realtime WebCodecs). See [PLASMA_STUDIO_ROADMAP.md](PLASMA_STUDIO_ROADMAP.md).
