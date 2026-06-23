# WebCodecs MP4 video export — design

> Completes Milestone 4 (post pipeline + WebCodecs MP4 export). The post-effects
> pipeline shipped in `898a316`; this is the remaining half.

## Goal

`exportVideo` produces real H.264 **MP4** in browsers with WebCodecs, rendered
*faster than realtime* (capture decoupled from wall-clock). Everywhere WebCodecs
is unavailable it falls back to today's MediaRecorder **WebM** path, unchanged.

Purely additive: the WebM path is preserved, not replaced. No change to the export
modes (continuous / seamless loop), durations, or quality tiers (720p / 1080p).

## Non-goals

- No 4K tier (deferred; faster-than-realtime makes it feasible later).
- No user-facing format toggle — selection is automatic and transparent.
- No embed changes (the embed never imports exporters).

## Architecture

### Backend dispatch (public API unchanged)

`exportVideo(r, opts)` remains the single public entry and keeps its
`Promise<{ blob: Blob; ext: string }>` contract. Internally it dispatches:

- `supportsWebCodecs()` → `VideoEncoder` and `VideoFrame` exist **and** a probed
  H.264 config reports supported → **WebCodecs MP4 path** (`exportVideoWebCodecs`).
- otherwise → **MediaRecorder path** (`exportVideoMediaRecorder`) — the current
  implementation moved verbatim, logic untouched.

The studio modal ([VideoExportModal.tsx](../../../apps/studio/src/panels/export/VideoExportModal.tsx))
and its call site need **zero functional change**: the downloaded filename
extension already derives from the returned `ext`.

### Shared frame compositing (extracted once)

Both backends render frames identically — a crisp single playhead plus, in loop
mode, the seamless-loop boundary crossfade (final `B = min(0.7, 0.25·L)` seconds
only; guards the legacy fix). This is extracted into one helper so the
compositing logic lives and is reasoned about once:

```ts
function renderFrameToCanvas(
  r: PlasmaRenderer, ctx: CanvasRenderingContext2D,
  base: number, tau: number, L: number, mode: VideoMode, W: number, H: number,
): void
```

It calls `r.renderAt(base + tau)` → `drawImage`, and when `mode === 'loop'` and
`seamlessWeight(tau, L) > 0`, composites the wrap frame `r.renderAt(base + tau - L)`
at that alpha. Reuses `videoFrameTimes` / `seamlessWeight` / `crossfadeWindow` /
`QUALITY` verbatim. The two backends differ only in capture + pacing.

### WebCodecs path — `exportVideoWebCodecs` (new `video-webcodecs.ts`)

- `mp4-muxer` `Muxer` + `ArrayBufferTarget`; a `VideoEncoder` whose `output`
  callback feeds `muxer.addVideoChunk(chunk, meta)`.
- Codec chosen by `pickH264Codec()` — probes a candidate list
  (High → Main → Baseline, at a level covering 1080p, e.g. `avc1.640028`) via
  `VideoEncoder.isConfigSupported`, returns the first supported string (or null).
  No hardcoded guess.
- Per frame `i` at `tau = i/fps`:
  - `renderFrameToCanvas(...)` composites to the offscreen 2D canvas.
  - `new VideoFrame(canvas, { timestamp: i*1e6/fps, duration: 1e6/fps })`.
  - `encoder.encode(frame, { keyFrame: i % (fps*2) === 0 })`.
  - `frame.close()`.
  - Backpressure: yield (await a resolved microtask / `requestAnimationFrame`-free
    `await Promise.resolve()` loop) while `encoder.encodeQueueSize` exceeds a small
    cap, so memory stays bounded on long clips.
  - `opts.onProgress?.((i+1)/total)`.
- Finish: `await encoder.flush()` → `muxer.finalize()` →
  `new Blob([target.buffer], { type: 'video/mp4' })`, return `{ blob, ext: 'mp4' }`.
- **No realtime `delay()`** — renders as fast as GPU + encoder allow. This is the
  faster-than-realtime win the milestone calls for.

### Robustness

- `r.endExport()` runs in a `finally` so a renderer can never get stuck in export
  mode if encoding throws.
- `frame.close()` is guaranteed per frame (try/finally around encode) so
  `VideoFrame`s never leak.
- The `VideoEncoder` `error` callback rejects the export promise with a clear
  message rather than letting `finalize()` emit a truncated file.

## Dependency & bundle budget

Add `mp4-muxer` to `packages/core` dependencies. It is small and tree-shakeable
and is imported **only** by the exporters, so it reaches the **studio** bundle
but **not** the `<plasma-bg>` embed (the embed does not import exporters). The
15 KB gzip embed budget is therefore untouched — confirmed by a build that
re-checks the embed gzip size.

## Module layout

```
packages/core/src/exporters/
  video.ts            # types, QUALITY, schedule helpers, supportsWebCodecs(),
                      # renderFrameToCanvas(), exportVideo() dispatcher,
                      # exportVideoMediaRecorder() (today's path, moved verbatim)
  video-webcodecs.ts  # pickH264Codec(), exportVideoWebCodecs()
  video.test.ts       # existing helper tests + new unit tests below
```

`index.ts` keeps `export * from './video.js'`; `video-webcodecs.ts` is an
internal module re-exported through `video.ts` as needed (public surface stays
`exportVideo` + the existing types).

## UI (minimal)

- Progress wording becomes backend-neutral: "rendering X%" (was "recording X%").
- The modal caption shows the active container — "MP4 · H.264" when WebCodecs is
  available, else "WebM" — via `supportsWebCodecs()`. No new controls.

## Testing (TDD)

**Unit (jsdom — `video.test.ts`):**

- `pickH264Codec(candidates, probeFn)` — returns the first candidate the probe
  reports supported; returns `null` when none are.
- `supportsWebCodecs()` — true/false across stubbed-global branches (no
  `VideoEncoder`; `VideoEncoder` present but probe unsupported; both present).
- `exportVideo` dispatches to `exportVideoMediaRecorder` when WebCodecs is absent
  (stub globals; assert the MediaRecorder path runs and yields `ext: 'webm'`).
- Existing schedule-helper and `buildEmbed` tests stay green.

The encode loop itself cannot run under jsdom (no real `VideoEncoder`), so its
real coverage is the Playwright test below.

**Playwright (real Chromium — has WebCodecs):**

- Drive `exportVideo` in-page on a mounted renderer and assert: blob is
  non-empty, `blob.type === 'video/mp4'`, and the bytes begin with an `ftyp` box
  (`....ftyp` at offset 4). This is the M4 "mp4 downloads" done-criterion,
  verified end-to-end.

## Done when

- `exportVideo` returns a valid, playable `.mp4` in Chromium (ftyp-checked) and
  still returns `.webm` when WebCodecs is stubbed out.
- Both modes (cont / loop) and both quality tiers work on the MP4 path.
- Studio build green; embed gzip size still under 15 KB.
- All unit tests + the new Playwright assertion pass.
