# Keyframe timeline (M5, v1) — design

> Milestone 5, first half: an in-studio keyframe timeline that morphs the *look*
> over time, with live preview and video export of the morph. The embed runtime
> API, audio reactivity, and a second engine are separate later specs.

## Goal

Let a user keyframe 2–6 whole-look snapshots along a timeline and smoothly morph
between them — numeric params and palette interpolate, discrete fields hard-switch
at the segment midpoint — previewed live in the studio and rendered by the video
exporter.

## Core concepts

### Two clocks

- **Motion time** — the plasma's internal animation clock (`renderer.tAccum`,
  advanced by `speed`). Keeps the plasma alive (drifting/churning).
- **Timeline time** — a separate clock in `[0, duration]` that selects *which look*
  to show by interpolating between keyframes.

Both advance during playback: the plasma keeps moving while its look morphs. They
are independent — the timeline never touches motion time.

### Data model

```ts
type Easing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

interface Keyframe {
  id: string;          // stable id for UI selection/drag
  t: number;           // seconds in [0, duration]
  config: CoreConfig;  // a full look snapshot
  easing: Easing;      // easing applied on the segment LEAVING this keyframe
}

interface Timeline {
  duration: number;        // seconds (> 0)
  keyframes: Keyframe[];   // sorted by t; first at 0, last at duration; length 2..6
}
```

A keyframe captures a **whole `CoreConfig`** (like a history entry). The first
keyframe sits at `t=0`, the last at `t=duration`.

## Core — pure interpolation (`packages/core/src/plasma/timeline.ts`)

Zero-dependency, framework-free, fully unit-tested. Exported from
`packages/core/src/plasma/index.ts`.

### `lerpConfig(a: CoreConfig, b: CoreConfig, t: number): CoreConfig`

Structural recursion over the config, by value type:

- **numbers** → linear lerp `a + (b - a) * t`.
- **arrays of numbers / tuples** (e.g. `center`, overlay `center`) → component-wise
  lerp (assume equal length; tuples are fixed-length in the schema).
- **hex colors** → OKLCH mix. `oklabMix(c0, c1, t)` from
  [overlay.ts](../../../packages/core/src/plasma/overlay.ts) operates on RGB tuples,
  so wrap it: `hexMix(ha, hb, t) = rgb2hex(oklabMix(hex2rgb(ha), hex2rgb(hb), t))`.
  `hex2rgb` is already exported from [gl.ts](../../../packages/core/src/plasma/gl.ts);
  a small `rgb2hex` formatter is added (mirroring the private `to2` digit helper in
  palette.ts) and exported. Apply `hexMix` to single-color fields (`bg`, overlay
  `colorA`/`colorB`).
- **`palette` (array of hex strings)** → element-wise `hexMix`. If the two palettes
  differ in length, pad the shorter by repeating its **last** color to the longer
  length; the result takes the **longer** length.
- **booleans, enum strings (`motion`/`material`/`shape`), and string arrays
  (`cursor.modes`)** → **discrete**: take `a`'s value while `t < 0.5`, else `b`'s.
- **nested objects** (`flow`, `cursor`, `effects`, `overlay`) → recurse field-by-field
  with the same rules.
- The result is `parseConfig`-valid (clamped); callers may `parseConfig` the output
  for safety, but `lerpConfig` itself produces in-range values because inputs are
  already valid and lerp/mix stay within `[min,max]`.

Field classification is driven by a small explicit map of discrete paths, NOT by
guessing from runtime types alone (so an enum string is never mistaken for a
lerpable value). The map lists: `motion`, `material`, `shape`, every boolean path,
`cursor.modes`. Everything else numeric/array/hex follows the rules above.

### `applyEasing(easing: Easing, u: number): number`

Pure remap of `u ∈ [0,1]`:

- `linear` → `u`
- `ease-in` → `u*u`
- `ease-out` → `u*(2-u)`
- `ease-in-out` → `u*u*(3-2*u)` (smoothstep)

Endpoints map to 0 and 1 for all easings; monotonic non-decreasing.

### `sampleTimeline(tl: Timeline, time: number): CoreConfig`

1. Clamp `time` to `[0, tl.duration]`.
2. If `time <= keyframes[0].t` → return `keyframes[0].config`.
   If `time >= last.t` → return `last.config`.
3. Find the bracketing pair `(kA, kB)` with `kA.t <= time < kB.t`.
4. `u = (time - kA.t) / (kB.t - kA.t)` (guard `kB.t === kA.t` → return `kB.config`).
5. `eased = applyEasing(kA.easing, u)`.
6. return `lerpConfig(kA.config, kB.config, eased)`.

Pure; keyframes assumed sorted by `t` (the store guarantees this).

## Studio — timeline store + UI

### `useTimelineStore` (zustand, `apps/studio/src/stores/timeline.ts`)

State: `duration`, `keyframes: Keyframe[]`, `playhead: number`, `isPlaying: boolean`,
`selectedId: string | null`.

Actions:
- `captureKeyframe()` — snapshot the current `useConfigStore` look as a new keyframe
  at the current playhead (or appended); keeps `keyframes` sorted, length capped 2..6.
- `deleteKeyframe(id)`, `moveKeyframe(id, t)` (re-sorts; clamps endpoints),
  `setEasing(id, easing)`, `setDuration(s)`, `select(id)`.
- `play()`, `pause()`, `seek(t)`.

### Playback drives the renderer directly (transient)

Playback runs its own `requestAnimationFrame` loop (started in `App.tsx`, outside
React render, like the existing renderer subscription). Each frame it:
1. advances `playhead` by real elapsed time (wrapping at `duration` if looping the
   preview; v1 preview loops),
2. computes `sampleTimeline(timeline, playhead)`,
3. calls `rendererRef.current.setConfig(sampled)` **directly**.

It does **not** write the sampled config into `useConfigStore` — no history step, no
per-frame React re-render. When not playing, the existing config-store→renderer path
is the source of truth. Scrubbing the playhead samples one frame the same way.
Stopping playback leaves `useConfigStore` (the authoring look) untouched.

Conflict avoidance: while `isPlaying`, the timeline loop is the only writer to the
renderer; the normal config-store subscription's writes are effectively overridden
each frame by the loop (and the user is not editing controls mid-playback). Pausing
restores the store look by calling `setConfig(useConfigStore.getState().config)` once.

### UI — bottom timeline strip (`apps/studio/src/panels/timeline/`)

A collapsible strip below the artboard:
- a horizontal **track** with keyframe **pips** at their `t` positions (drag to move,
  click to select; selected pip shows its easing selector),
- a draggable **playhead**,
- **play/pause** toggle and a **duration** control (seconds),
- a **"capture look"** button (adds a keyframe from the current look),
- a **delete** action for the selected keyframe.

Follows existing studio UI tokens/components (shadcn-style primitives already in
`components/ui`). No changes to the right-panel controls.

## Video export integration

Extend `VideoOpts` (in [video.ts](../../../packages/core/src/exporters/video.ts)) with
an optional `timeline?: Timeline`. In the shared frame loop, when `timeline` is set,
call `r.setConfig(sampleTimeline(timeline, tau))` **before** rendering each frame
(`tau` is the existing per-frame timeline-second from `videoFrameTimes`). `setConfig`
is cheap for uniform-only changes and recompiles only when a discrete field flips at
a midpoint. When `timeline` is set and no explicit `durationS` is given, default
`durationS = timeline.duration`.

This applies to both backends (WebCodecs MP4 and MediaRecorder WebM) because they
share `renderFrameToCanvas` — the `setConfig` call is added in the shared per-frame
step, not per backend.

**Loop caveat:** seamless-loop export (`mode: 'loop'`) only truly loops if the first
and last keyframes are the **same look**; otherwise the config jumps at the wrap. The
export UI shows a one-line hint when a timeline is present and `mode === 'loop'`; it
does not auto-enforce equality.

## Testing

### Unit (`packages/core/src/plasma/timeline.test.ts`)

- `lerpConfig`:
  - numeric lerp at t=0/0.5/1 (e.g. `speed`, `scalePct`).
  - tuple lerp (`center`) component-wise.
  - palette OKLCH: endpoints equal inputs; midpoint equals `oklabMix(c0,c1,0.5)`
    per channel.
  - mismatched palette lengths: shorter padded with its last color; result length
    = longer.
  - discrete switch at the t=0.5 boundary for `motion`, a boolean, and `cursor.modes`.
  - nested object recursion (`flow.amount`, `effects.bloom.intensity`).
- `applyEasing`: each easing maps 0→0 and 1→1; `ease-in-out` is symmetric around 0.5;
  all monotonic non-decreasing on a sampled grid.
- `sampleTimeline`: clamps out-of-range time; before-first/after-last return the end
  keyframe configs; correct bracket selection with 3 keyframes; easing applied
  (compare against `lerpConfig(..., applyEasing(...))`).

### Playwright (`tests/visual/plasma.spec.ts`)

- A golden that builds a 2-keyframe timeline (two distinct looks) in the `golden.ts`
  harness, samples the midpoint via `sampleTimeline`, renders it, and screenshots —
  a deterministic morph frame.

## Done when

- `lerpConfig` / `applyEasing` / `sampleTimeline` are exported from core, pure, and
  unit-tested per above.
- The studio shows a working timeline strip: capture 2–6 looks, scrub, play/pause,
  per-segment easing — the live preview morphs (plasma stays in motion).
- Video export with a timeline renders the morph (both MP4 and WebM paths); without a
  timeline, export behaves exactly as today.
- The midpoint golden passes; full unit + visual suites green; build clean; embed
  bundle unchanged (timeline code is studio/core-exporter only — it must not reach
  the `<plasma-bg>` embed bundle).

## Out of scope (later specs)

- Embed runtime API (`plasmaBG.animateTo/timeline/play/pause/seek`) for GSAP/scroll.
- Audio reactivity (WebAudio band-mapping to config paths).
- Crossfading discrete (motion/material/shape) changes instead of hard-cut.
- A second engine (mesh gradient / reaction-diffusion).
