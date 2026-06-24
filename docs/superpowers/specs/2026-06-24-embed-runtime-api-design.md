# Embed runtime API (`<plasma-bg>`) — design

> M5 second half (part 1 of 2; engine #2 remains). Exposes a programmatic
> animation API on the `<plasma-bg>` custom element so external code — GSAP,
> ScrollTrigger, or hand-rolled scroll handlers — can morph the look over time,
> both self-driven (autoplay tweens/timelines) and externally-driven (scrubbing).
> Date: 2026-06-24.

## Goal

Today `<plasma-bg>` ([packages/embed/src/plasma-bg.ts](../../../packages/embed/src/plasma-bg.ts))
renders one static config and never changes. This adds a runtime API on the
element instance so a page can animate the background:

```js
const bg = document.querySelector('plasma-bg');

// instant
bg.set({ speed: 2, turbulence: 0.8 });

// self-driven tween
await bg.animateTo({ coverage: 0.9 }, { duration: 1.2, easing: 'ease-in-out' });

// self-driven timeline (loops by default)
bg.timeline({ duration: 8, keyframes: [...] });
bg.play();

// externally-driven scrub (e.g. GSAP ScrollTrigger onUpdate)
bg.seek(scrollProgress * 8);
```

The roadmap's M3/M5 line item: *"embed runtime API (`plasmaBG.animateTo / timeline /
play / seek`)"* and *"GSAP scroll demo scrubs `animateTo`"*.

## Constraints

- **Bundle budget is a hard gate:** the embed must stay **< 15 KB gzip**
  (currently 13.58 KB, ~1.4 KB headroom). zod must NOT reach the embed.
- **No duplicated interpolation math.** The studio already morphs configs via
  `lerpConfig`/`sampleTimeline` in `packages/core`. The embed reuses that code,
  not a re-implementation (gotcha #10: the legacy string-built embed duplicated
  the runtime and drifted out of sync repeatedly — do not regress to that).
- **Two clocks preserved:** plasma motion time keeps running; the API morphs only
  the *look*. Same split the studio uses
  ([apps/studio/src/lib/timelinePlayback.ts](../../../apps/studio/src/lib/timelinePlayback.ts)).
- **Accessibility:** honor `prefers-reduced-motion` for programmatic animation,
  consistent with the element's existing reduced-motion handling.

## The zod problem

The natural building block, `lerpConfig`
([packages/core/src/plasma/timeline.ts:40](../../../packages/core/src/plasma/timeline.ts#L40)),
ends with `parseConfig(...)` — a zod parse. `sampleTimeline` calls `lerpConfig`,
so it transitively pulls zod too. Importing either into the embed as-is drags
zod into the bundle and blows the budget. The embed deliberately avoids zod
("config is trusted JSON, not re-validated").

Resolution: extract zod-free `*Raw` variants in core (see Core changes). Both
interpolation endpoints are already validated `CoreConfig`s, and a field-by-field
lerp of two in-range values stays in range; discrete enum fields hard-switch
between two valid values. So the `parseConfig` re-clamp is redundant for
interpolation output — the studio/exporter paths keep it for safety, the embed
skips it.

## Core changes (`packages/core`, zero new deps, zod-free)

In [packages/core/src/plasma/timeline.ts](../../../packages/core/src/plasma/timeline.ts):

- `lerpConfigRaw(a, b, t): CoreConfig` — the current `lerpConfig` body **minus**
  the `parseConfig` wrap (returns the plain interpolated object).
- `lerpConfig` becomes `parseConfig(lerpConfigRaw(a, b, t))` — byte-identical
  output for existing callers, no behavior change.
- `sampleTimelineRaw(tl, time): CoreConfig` — `sampleTimeline` rewritten to call
  `lerpConfigRaw`; endpoint returns (`ks[0].config`, `last.config`) are already
  valid configs. `sampleTimeline` either delegates to it (endpoints already
  valid, interior values in range → no re-parse needed) or keeps its current body
  — chosen during implementation so existing `sampleTimeline` output is unchanged.

In a new `packages/core/src/plasma/merge.ts` (or appended to config helpers):

- `mergeConfigPatch(base: CoreConfig, patch: DeepPartial<CoreConfig>): CoreConfig`
  — typed deep-merge for the nested blocks (`flow`, `cursor`, `overlay`,
  `effects`). Scalars and arrays (palette, center, modes) replace; nested objects
  merge. Plain TS, no zod. Exported from `@effects/core`.

All three exported via [packages/core/src/plasma/index.ts](../../../packages/core/src/plasma/index.ts)
(and the package root) so the embed can import them.

## Embed internals

A `PlasmaController` (new file `packages/embed/src/controller.ts`) wraps the
`PlasmaRenderer` and owns the morph state. `PlasmaBg` constructs one in
`connectedCallback`, delegates the public methods to it, and disposes it in
`disconnectedCallback`.

State:
- `currentCfg: CoreConfig` — the resolved look (starts at the element's config).
- `timeline: Timeline | null`, `progress: number` (seconds).
- one private rAF handle for the **morph driver** (separate from the renderer's
  own motion-loop rAF).

Public methods (mirrored onto the `<plasma-bg>` element):

| Method | Behavior |
|---|---|
| `set(patch)` | `currentCfg = mergeConfigPatch(currentCfg, patch)`; `renderer.setConfig`; cancel any driver. |
| `animateTo(patch, opts) → Promise<void>` | target = `mergeConfigPatch(currentCfg, patch)`. Tween `u:0→1` over `opts.duration` (default 0.6s); each frame `renderer.setConfig(lerpConfigRaw(from, target, ease(u)))`. On end set `currentCfg = target`, resolve. Cancels prior driver. |
| `timeline(tl)` | store `tl`, reset `progress = 0`. |
| `play({ loop = true })` | start the morph driver advancing `progress`; each frame `renderer.setConfig(sampleTimelineRaw(tl, progress))`; at `progress >= tl.duration` loop to 0 or stop. Cancels a running tween. |
| `pause()` | stop the morph driver; keep `progress`. |
| `seek(t)` | `progress = t`; `renderer.setConfig(sampleTimelineRaw(tl, t))`. **Stateless** — does not start the driver. Cancels a running tween/play (external owner is now in control). |
| `getConfig()` | return `currentCfg`. |
| `progress` (getter) | return `progress`. |

`easing` accepts a named `Easing` (reuses `applyEasing`) or a custom
`(u: number) => number`.

Driver invariants:
- `animateTo`, `play`, and `seek` are mutually exclusive drivers; entering one
  cancels the others (single rAF handle, cleared before reuse).
- The renderer's motion loop is untouched — `renderer.start()` keeps animating
  the plasma; the controller only calls `setConfig`.

Reduced-motion (`prefers-reduced-motion: reduce`):
- `animateTo` snaps to the target immediately (no tween), resolves next tick.
- `play` renders the first keyframe still (no autoplay loop).
- `set` and `seek` behave normally (they're explicit/user-driven, not autoplay).

## Demo page

`packages/embed/demo/index.html` (served via a `pnpm --filter @effects/embed demo`
preview, or opened directly against the built `dist/plasma-bg.js`):
- A hero section that autoplays a `timeline()` (2–3 keyframes, looped).
- A tall scroll section wiring GSAP ScrollTrigger `onUpdate` → `bg.seek(progress * duration)`.
- A few buttons calling `set` / `animateTo` to show instant vs tweened changes.

Doubles as manual proof and future README/launch material. GSAP loaded from a CDN
in the demo only — never bundled into the embed.

## Testing

- **Unit (core):** `lerpConfigRaw` output equals `lerpConfig` for representative
  pairs; `sampleTimelineRaw` parity with `sampleTimeline`; `mergeConfigPatch`
  cases — nested partial merge, scalar/array replace, untouched fields preserved,
  empty patch is identity.
- **Unit (embed, jsdom + fake renderer):** `animateTo` reaches target and resolves;
  starting a second driver cancels the first; `seek` is stateless (no rAF
  scheduled); reduced-motion snaps `animateTo` and stills `play`; `set`/`seek`
  merge correctly.
- **Playwright (real Chromium):** load the demo; `animateTo(target)` end-state
  matches a pixel golden; `seek(t_fixed)` matches a deterministic golden.
- **Budget:** add an automated assertion (test or build step) that the gzipped
  `dist/plasma-bg.js` is **< 15 KB**. This is the acceptance gate; if the new
  imports push it over, the fallback is a lighter color-mix path in
  `lerpConfigRaw` (flagged, not silently shipped).

## Out of scope

- Audio reactivity (own spec; roadmap §6.3).
- Crossfading discrete motion/material changes instead of hard-cut at t=0.5.
- Engine #2 (mesh gradient) — the other half of M5.
- A real bundler-published npm package / versioning of the embed API.

## Acceptance criteria

1. `set`, `animateTo`, `timeline`, `play`, `pause`, `seek`, `getConfig`,
   `progress` work on a `<plasma-bg>` element instance.
2. Partial patches deep-merge correctly over the current look.
3. `animateTo` tweens and resolves; `seek` scrubs statelessly; drivers are
   mutually exclusive.
4. Reduced-motion honored as specified.
5. Plasma motion keeps running through morphs (two clocks).
6. Demo page autoplays a timeline and scrubs via scroll.
7. Full unit + Playwright suites green; **embed gzip < 15 KB** asserted
   automatically.
8. No zod in the embed bundle.
