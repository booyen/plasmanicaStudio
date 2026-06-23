# WebCodecs MP4 Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `exportVideo` produce faster-than-realtime H.264 MP4 via WebCodecs, falling back to today's MediaRecorder WebM when WebCodecs is unavailable.

**Architecture:** `exportVideo` stays the single public entry and dispatches between two backends. A shared `renderFrameToCanvas` helper does the crisp-playhead + seamless-loop compositing for both. The WebCodecs backend (`exportVideoWebCodecs`) encodes `VideoFrame`s with `VideoEncoder` and muxes H.264 chunks into MP4 with `mp4-muxer`, with no realtime pacing.

**Tech Stack:** TypeScript (strict), WebCodecs `VideoEncoder`/`VideoFrame`, `mp4-muxer`, Vitest (unit), Playwright (Chromium e2e).

## Global Constraints

- The seamless-loop crossfade is the final `B = min(0.7, 0.25·L)` seconds ONLY — never a full-duration dissolve. Reuse `seamlessWeight`/`crossfadeWindow` verbatim; do not reimplement.
- Capture advances by a FIXED timestep `tau = i/fps` (from `videoFrameTimes`), never by wall-clock.
- The WebM/MediaRecorder path must be preserved with identical behavior (it is the fallback).
- `mp4-muxer` may be added to `packages/core` only. It must NOT reach the `<plasma-bg>` embed bundle (embed budget < 15 KB gzip). The embed does not import exporters — keep it that way.
- Public surface stays `exportVideo` plus existing exported types/helpers from `video.ts`. `index.ts` keeps `export * from './video.js'`.
- Package name is `@effects/core`. Core unit tests run with `pnpm --filter @effects/core test` (or `cd packages/core && pnpm test`). Repo build: `pnpm build`. Visual/e2e: `pnpm test:visual`.

---

### Task 1: `pickH264Codec` — codec probe (pure, injectable)

**Files:**
- Create: `packages/core/src/exporters/video-webcodecs.ts`
- Test: `packages/core/src/exporters/video-webcodecs.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `pickH264Codec(W: number, H: number, fps: number, bitrate: number, probe?: (cfg: VideoEncoderConfig) => Promise<{ supported?: boolean }>): Promise<string | null>` — returns the first candidate codec string the probe reports supported, else `null`. Candidate order: `['avc1.640028', 'avc1.4d4028', 'avc1.42e01e']` (High → Main → Baseline). `probe` defaults to `VideoEncoder.isConfigSupported`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/exporters/video-webcodecs.test.ts
import { describe, it, expect, vi } from 'vitest';
import { pickH264Codec } from './video-webcodecs.js';

describe('pickH264Codec', () => {
  it('returns the first candidate the probe reports supported', async () => {
    const probe = vi.fn(async (cfg: { codec: string }) => ({ supported: cfg.codec === 'avc1.4d4028' }));
    const codec = await pickH264Codec(1920, 1080, 30, 6_000_000, probe);
    expect(codec).toBe('avc1.4d4028');
    // tried High first, then Main
    expect(probe.mock.calls[0]![0].codec).toBe('avc1.640028');
  });

  it('returns null when no candidate is supported', async () => {
    const probe = vi.fn(async () => ({ supported: false }));
    expect(await pickH264Codec(1280, 720, 30, 2_500_000, probe)).toBeNull();
  });

  it('passes width/height/bitrate/framerate through to the probe', async () => {
    const probe = vi.fn(async () => ({ supported: true }));
    await pickH264Codec(1280, 720, 24, 1_234_000, probe);
    const cfg = probe.mock.calls[0]![0];
    expect(cfg).toMatchObject({ width: 1280, height: 720, framerate: 24, bitrate: 1_234_000 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test -- video-webcodecs`
Expected: FAIL — cannot import `pickH264Codec` (module/file does not exist).

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/exporters/video-webcodecs.ts
// WebCodecs MP4 backend: encodes VideoFrames with VideoEncoder and muxes H.264
// chunks into MP4 via mp4-muxer. No realtime pacing — faster than realtime.

const H264_CANDIDATES = ['avc1.640028', 'avc1.4d4028', 'avc1.42e01e']; // High > Main > Baseline

type ConfigProbe = (cfg: VideoEncoderConfig) => Promise<{ supported?: boolean }>;

/** First H.264 codec string the probe reports supported for this output, else null. */
export async function pickH264Codec(
  W: number, H: number, fps: number, bitrate: number,
  probe: ConfigProbe = (cfg) => VideoEncoder.isConfigSupported(cfg),
): Promise<string | null> {
  for (const codec of H264_CANDIDATES) {
    const res = await probe({ codec, width: W, height: H, framerate: fps, bitrate });
    if (res?.supported) return codec;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm test -- video-webcodecs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/exporters/video-webcodecs.ts packages/core/src/exporters/video-webcodecs.test.ts
git commit -m "feat(core): pickH264Codec — probe H.264 codecs for WebCodecs export"
```

---

### Task 2: `supportsWebCodecs()` — synchronous capability gate

**Files:**
- Modify: `packages/core/src/exporters/video.ts` (add export near top, after imports)
- Test: `packages/core/src/exporters/video.test.ts` (add a `describe` block)

**Interfaces:**
- Consumes: nothing.
- Produces: `supportsWebCodecs(): boolean` — true iff `VideoEncoder` and `VideoFrame` are both defined globals. Synchronous (the async codec probe lives in `pickH264Codec`).

- [ ] **Step 1: Write the failing test**

```ts
// append to packages/core/src/exporters/video.test.ts
import { supportsWebCodecs } from './video.js';

describe('supportsWebCodecs', () => {
  const g = globalThis as Record<string, unknown>;
  afterEach(() => { delete g.VideoEncoder; delete g.VideoFrame; });

  it('false when VideoEncoder is missing', () => {
    delete g.VideoEncoder; g.VideoFrame = class {};
    expect(supportsWebCodecs()).toBe(false);
  });

  it('false when VideoFrame is missing', () => {
    g.VideoEncoder = class {}; delete g.VideoFrame;
    expect(supportsWebCodecs()).toBe(false);
  });

  it('true when both are present', () => {
    g.VideoEncoder = class {}; g.VideoFrame = class {};
    expect(supportsWebCodecs()).toBe(true);
  });
});
```

Also add `afterEach` to the existing vitest import at the top of the file if not present:
`import { describe, it, expect, vi, afterEach } from 'vitest';` (add `vi, afterEach`).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test -- video.test`
Expected: FAIL — `supportsWebCodecs` is not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/exporters/video.ts — add after the existing imports
/** True iff the browser exposes the WebCodecs video encoder API (sync gate). */
export function supportsWebCodecs(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm test -- video.test`
Expected: PASS (existing tests + 3 new).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/exporters/video.ts packages/core/src/exporters/video.test.ts
git commit -m "feat(core): supportsWebCodecs capability gate"
```

---

### Task 3: Extract `renderFrameToCanvas` shared compositor (refactor)

**Files:**
- Modify: `packages/core/src/exporters/video.ts` (extract helper; rewire the existing loop to call it)

**Interfaces:**
- Consumes: `PlasmaRenderer` (`renderAt`, `element`), `seamlessWeight` (existing).
- Produces: `renderFrameToCanvas(r: PlasmaRenderer, ctx: CanvasRenderingContext2D, base: number, tau: number, L: number, mode: VideoMode, W: number, H: number): void` — renders the crisp playhead at `base+tau` and, when `mode === 'loop'` and `seamlessWeight(tau, L) > 0`, composites the wrap frame `base+tau-L` at that alpha onto `ctx`. Pure compositing; no capture, no pacing.

This is a behavior-preserving refactor: the MediaRecorder loop must produce identical output. Existing tests are the regression guard.

- [ ] **Step 1: Run the existing suite to capture the green baseline**

Run: `cd packages/core && pnpm test -- video.test`
Expected: PASS. (No new test — this task is guarded by the existing tests plus the unchanged WebM behavior.)

- [ ] **Step 2: Add the helper**

```ts
// packages/core/src/exporters/video.ts — add above exportVideo
/**
 * Draw one frame onto `ctx`: the crisp single playhead at base+tau, plus — in
 * loop mode within the final crossfade window — the wrap frame at base+tau-L
 * composited at seamlessWeight() alpha. Shared by both capture backends.
 */
export function renderFrameToCanvas(
  r: PlasmaRenderer, ctx: CanvasRenderingContext2D,
  base: number, tau: number, L: number, mode: VideoMode, W: number, H: number,
): void {
  r.renderAt(base + tau);
  ctx.globalAlpha = 1;
  ctx.drawImage(r.element, 0, 0, W, H);
  const w = mode === 'loop' ? seamlessWeight(tau, L) : 0;
  if (w > 0) {
    r.renderAt(base + tau - L);
    ctx.globalAlpha = w;
    ctx.drawImage(r.element, 0, 0, W, H);
  }
}
```

- [ ] **Step 3: Rewire the existing loop to call it**

In `exportVideo` (current implementation), replace the inline render+composite block (the `r.renderAt(base + tau)` … crossfade … `ctx.drawImage` lines, currently lines ~106–115) with a single call, keeping the `manual`/`requestFrame` and pacing lines intact:

```ts
  for (let i = 0; i < times.length; i++) {
    const tau = times[i]!;
    renderFrameToCanvas(r, ctx, base, tau, L, mode, W, H);
    if (manual) track.requestFrame();
    opts.onProgress?.((i + 1) / times.length);
    const wait = start + (i + 1) * frameMs - performance.now();
    await delay(wait > 0 ? wait : 0);
  }
```

- [ ] **Step 4: Run tests + typecheck**

Run: `cd packages/core && pnpm test && pnpm build`
Expected: PASS — same green suite, clean tsc.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/exporters/video.ts
git commit -m "refactor(core): extract renderFrameToCanvas shared by both video backends"
```

---

### Task 4: `exportVideoWebCodecs` — the MP4 encode loop

**Files:**
- Modify: `packages/core/package.json` (add `mp4-muxer` dependency)
- Modify: `packages/core/src/exporters/video-webcodecs.ts` (add the export function + imports)

**Interfaces:**
- Consumes: `pickH264Codec` (Task 1, same file); `renderFrameToCanvas`, `videoFrameTimes`, `QUALITY`, `VideoOpts`, `VideoMode`, `VideoQuality` from `./video.js`; `PlasmaRenderer`.
- Produces: `exportVideoWebCodecs(r: PlasmaRenderer, opts: VideoOpts, codec: string): Promise<{ blob: Blob; ext: 'mp4' }>` — renders every scheduled frame, encodes to H.264, muxes MP4, returns the blob. No realtime pacing.

The encode loop needs real WebCodecs + canvas, so it is NOT unit-tested here; its end-to-end coverage is the Playwright test in Task 6. This task's deliverable is "compiles, dep installed, function exported".

- [ ] **Step 1: Add the dependency**

Run: `pnpm add mp4-muxer --filter @effects/core`
Expected: `mp4-muxer` appears under `dependencies` in `packages/core/package.json`; lockfile updated.

- [ ] **Step 2: Write the implementation**

```ts
// packages/core/src/exporters/video-webcodecs.ts — add imports at top
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type { PlasmaRenderer } from '../plasma/renderer.js';
import { QUALITY, videoFrameTimes, renderFrameToCanvas, type VideoOpts } from './video.js';

const yieldToEncoder = () => new Promise<void>((res) => setTimeout(res, 0));

/**
 * WebCodecs MP4 export. Renders each scheduled frame, encodes H.264 via
 * VideoEncoder, muxes into MP4 with mp4-muxer. No realtime pacing → faster than
 * realtime. `codec` is the resolved string from pickH264Codec().
 */
export async function exportVideoWebCodecs(
  r: PlasmaRenderer, opts: VideoOpts, codec: string,
): Promise<{ blob: Blob; ext: 'mp4' }> {
  const { durationS: L, mode } = opts;
  const fps = opts.fps ?? 30;
  const { w: W, h: H, bitrate } = QUALITY[opts.quality];
  const base = r.time;

  r.beginExport(W, H);
  const ex = document.createElement('canvas');
  ex.width = W;
  ex.height = H;
  const ctx = ex.getContext('2d')!;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: W, height: H },
    fastStart: 'in-memory',
  });
  let encErr: unknown = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encErr = e; },
  });
  encoder.configure({ codec, width: W, height: H, bitrate, framerate: fps });

  try {
    const times = videoFrameTimes(L, fps);
    const usPerFrame = 1_000_000 / fps;
    const kf = Math.max(1, Math.round(fps * 2)); // keyframe ~every 2s
    for (let i = 0; i < times.length; i++) {
      if (encErr) throw encErr;
      renderFrameToCanvas(r, ctx, base, times[i]!, L, mode, W, H);
      const frame = new VideoFrame(ex, { timestamp: Math.round(i * usPerFrame), duration: Math.round(usPerFrame) });
      try {
        encoder.encode(frame, { keyFrame: i % kf === 0 });
      } finally {
        frame.close();
      }
      opts.onProgress?.((i + 1) / times.length);
      // Backpressure: keep the encoder queue (and memory) bounded on long clips.
      while (encoder.encodeQueueSize > 2) await yieldToEncoder();
    }
    await encoder.flush();
    if (encErr) throw encErr;
    muxer.finalize();
    const { buffer } = muxer.target as ArrayBufferTarget;
    return { blob: new Blob([buffer], { type: 'video/mp4' }), ext: 'mp4' };
  } finally {
    if (encoder.state !== 'closed') encoder.close();
    r.endExport();
  }
}
```

- [ ] **Step 3: Typecheck + full core suite**

Run: `cd packages/core && pnpm build && pnpm test`
Expected: PASS — clean tsc (mp4-muxer types resolve), existing tests still green.

- [ ] **Step 4: Commit**

```bash
git add packages/core/package.json packages/core/src/exporters/video-webcodecs.ts pnpm-lock.yaml
git commit -m "feat(core): exportVideoWebCodecs — faster-than-realtime MP4 encode loop"
```

---

### Task 5: Wire `exportVideo` dispatcher (WebCodecs → fallback)

**Files:**
- Modify: `packages/core/src/exporters/video.ts` (rename current body to `exportVideoMediaRecorder`; make `exportVideo` dispatch)
- Test: `packages/core/src/exporters/video.test.ts` (dispatch tests)

**Interfaces:**
- Consumes: `supportsWebCodecs` (Task 2), `pickH264Codec` + `exportVideoWebCodecs` (Tasks 1/4), `QUALITY`.
- Produces: unchanged public `exportVideo(r, opts): Promise<{ blob: Blob; ext: string }>`; new internal `exportVideoMediaRecorder` (the old body); dispatch: WebCodecs when supported AND a codec is found, else MediaRecorder.

- [ ] **Step 1: Write the failing dispatch tests**

```ts
// append to packages/core/src/exporters/video.test.ts
import { exportVideo } from './video.js';

vi.mock('./video-webcodecs.js', () => ({
  pickH264Codec: vi.fn(async () => 'avc1.640028'),
  exportVideoWebCodecs: vi.fn(async () => ({ blob: new Blob(['mp4'], { type: 'video/mp4' }), ext: 'mp4' })),
}));

describe('exportVideo backend dispatch', () => {
  const g = globalThis as Record<string, unknown>;
  const fakeR = { time: 0, beginExport() {}, endExport() {}, renderAt() {}, get element() { return {}; } } as never;
  afterEach(() => { delete g.VideoEncoder; delete g.VideoFrame; });

  it('uses WebCodecs MP4 when supported and a codec is found', async () => {
    g.VideoEncoder = class {}; g.VideoFrame = class {};
    const { ext } = await exportVideo(fakeR, { durationS: 1, mode: 'cont', quality: 'lite', fps: 10 });
    expect(ext).toBe('mp4');
  });

  it('falls back to MediaRecorder (rejects in jsdom) when WebCodecs is absent', async () => {
    delete g.VideoEncoder; delete g.VideoFrame;
    // jsdom has no MediaRecorder, so the fallback path throws its guard — proving dispatch chose it.
    await expect(exportVideo(fakeR, { durationS: 1, mode: 'cont', quality: 'lite', fps: 10 }))
      .rejects.toThrow(/MediaRecorder/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/core && pnpm test -- video.test`
Expected: FAIL — first test fails because `exportVideo` does not yet route to the (mocked) WebCodecs path.

- [ ] **Step 3: Refactor `exportVideo` into dispatcher + named fallback**

Rename the existing `export async function exportVideo(...)` to `export async function exportVideoMediaRecorder(...)` (body unchanged). Add the new dispatcher and import the WebCodecs module:

```ts
// packages/core/src/exporters/video.ts — add near the top imports
import { pickH264Codec, exportVideoWebCodecs } from './video-webcodecs.js';

// new public entry — replaces the old exportVideo signature site
export async function exportVideo(
  r: PlasmaRenderer, opts: VideoOpts,
): Promise<{ blob: Blob; ext: string }> {
  if (supportsWebCodecs()) {
    const fps = opts.fps ?? 30;
    const { w: W, h: H, bitrate } = QUALITY[opts.quality];
    const codec = await pickH264Codec(W, H, fps, bitrate);
    if (codec) return exportVideoWebCodecs(r, opts, codec);
  }
  return exportVideoMediaRecorder(r, opts);
}
```

Note: `video.ts` imports `video-webcodecs.ts` which imports back from `video.ts` (`QUALITY`, helpers). This cycle is fine for ESM function-level references (no top-level use of the cyclic bindings at module-eval time). Keep `QUALITY`, `videoFrameTimes`, `renderFrameToCanvas`, `VideoOpts`, `VideoMode`, `VideoQuality` exported from `video.ts`.

- [ ] **Step 4: Run tests + build**

Run: `cd packages/core && pnpm test && pnpm build`
Expected: PASS — dispatch tests green, existing suite green, clean tsc.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/exporters/video.ts packages/core/src/exporters/video.test.ts
git commit -m "feat(core): exportVideo dispatches WebCodecs MP4 with MediaRecorder fallback"
```

---

### Task 6: Playwright e2e — real MP4 with ftyp box

**Files:**
- Modify: `apps/studio/src/golden.ts` (expose `window.exportMp4Probe`)
- Modify: `tests/visual/plasma.spec.ts` (add the MP4 test)

**Interfaces:**
- Consumes: `exportVideo` from `@effects/core`, `parseConfig` (already imported in golden.ts), the existing `renderer`.
- Produces: `window.exportMp4Probe(): Promise<{ type: string; size: number; ftyp: string }>` — runs a tiny export and reports the blob container + size + the 4-char box type at byte offset 4.

- [ ] **Step 1: Write the failing test**

```ts
// append a test inside tests/visual/plasma.spec.ts (new describe block)
test.describe('video export', () => {
  test('exports a real MP4 (ftyp box) via WebCodecs', async ({ page }) => {
    await page.goto('/golden.html');
    await page.waitForFunction(() => typeof window.exportMp4Probe === 'function');
    const res = await page.evaluate(() => window.exportMp4Probe());
    expect(res.type).toBe('video/mp4');
    expect(res.size).toBeGreaterThan(0);
    expect(res.ftyp).toBe('ftyp'); // MP4 signature at byte offset 4
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:visual -- -g "exports a real MP4"`
Expected: FAIL — `window.exportMp4Probe` is undefined (times out on `waitForFunction`).

- [ ] **Step 3: Expose the probe in `golden.ts`**

```ts
// apps/studio/src/golden.ts — extend imports and the global block
import { PlasmaRenderer, parseConfig, exportVideo, type CoreConfig } from '@effects/core';

declare global {
  interface Window {
    renderGolden: (cfg: Partial<CoreConfig>, t: number) => void;
    exportMp4Probe: () => Promise<{ type: string; size: number; ftyp: string }>;
  }
}

// append after the renderGolden assignment
window.exportMp4Probe = async () => {
  renderer.setConfig(parseConfig({ grain: 0, cursor: { on: false, modes: [] } }));
  const { blob } = await exportVideo(renderer, { durationS: 0.3, mode: 'cont', quality: 'lite', fps: 10 });
  const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  const ftyp = String.fromCharCode(head[4]!, head[5]!, head[6]!, head[7]!);
  return { type: blob.type, size: blob.size, ftyp };
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test:visual -- -g "exports a real MP4"`
Expected: PASS — Chromium has WebCodecs, so the blob is `video/mp4` with an `ftyp` box.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/golden.ts tests/visual/plasma.spec.ts
git commit -m "test(visual): assert exportVideo yields a real MP4 (ftyp) in Chromium"
```

---

### Task 7: UI — backend-neutral wording + format caption

**Files:**
- Modify: `apps/studio/src/panels/export/VideoExportModal.tsx`

**Interfaces:**
- Consumes: `supportsWebCodecs` from `@effects/core`.
- Produces: no API change. Progress text reads "rendering N%"; a caption shows "MP4 · H.264" when WebCodecs is available, else "WebM".

- [ ] **Step 1: Update import and progress wording**

In `VideoExportModal.tsx`, extend the core import and change the progress string:

```tsx
import { exportVideo, supportsWebCodecs, type VideoMode, type VideoQuality } from '@effects/core';
```

Change the `onProgress` line from `recording ${...}%` to:

```tsx
        onProgress: (p) => setStatus(`rendering ${Math.round(p * 100)}%`),
```

And the busy button fallback label from `'recording…'` to `'rendering…'`:

```tsx
            {busy ? status || 'rendering…' : 'save video'}
```

- [ ] **Step 2: Add the format caption**

Add, just below the existing mode/loop helper `<p>` (the one explaining cont vs loop), a small format line:

```tsx
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Format: {supportsWebCodecs() ? 'MP4 · H.264' : 'WebM'}
          </p>
```

- [ ] **Step 3: Build the studio + re-check the embed budget**

Run: `pnpm build`
Expected: PASS. Confirm in the output that `@effects/embed` `plasma-bg.js` gzip is still **< 15 KB** (mp4-muxer must NOT appear in the embed bundle — it is only imported by exporters, which the embed does not use).

- [ ] **Step 4: Commit**

```bash
git add apps/studio/src/panels/export/VideoExportModal.tsx
git commit -m "feat(studio): backend-neutral export wording + MP4/WebM format caption"
```

---

### Task 8: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Run the complete unit suite**

Run: `pnpm test`
Expected: PASS — all packages green (core includes pickH264Codec, supportsWebCodecs, dispatch tests).

- [ ] **Step 2: Run the full build**

Run: `pnpm build`
Expected: PASS — clean tsc; embed `plasma-bg.js` gzip < 15 KB.

- [ ] **Step 3: Run the full visual/e2e suite**

Run: `pnpm test:visual`
Expected: PASS — all existing goldens + the new MP4 export test.

- [ ] **Step 4: Update CONTINUE.md handoff**

Add a short "Done — WebCodecs MP4 export (2026-06-23)" section noting: `exportVideo` now emits H.264 MP4 via WebCodecs (faster-than-realtime), MediaRecorder WebM preserved as automatic fallback; `mp4-muxer` added to core only (embed budget unaffected); covered by unit tests + a Playwright ftyp check. Mark M4 complete.

```bash
git add CONTINUE.md
git commit -m "docs: CONTINUE handoff — WebCodecs MP4 export done, M4 complete"
```

---

## Self-Review

**Spec coverage:**
- Backend dispatch (spec §Architecture) → Task 5. ✓
- Shared compositing `renderFrameToCanvas` (spec §2) → Task 3. ✓
- `exportVideoWebCodecs` + `pickH264Codec` + mp4-muxer (spec §3) → Tasks 1, 4. ✓
- Robustness (endExport/frame.close in finally, encoder error → reject) (spec §4) → Task 4 (try/finally around encode and around the loop; `encErr` checked). ✓
- Dependency & budget (spec §5) → Task 4 (add dep) + Tasks 7/8 (re-check embed gzip). ✓
- Module layout (spec §Module layout) → Tasks 1/4 (`video-webcodecs.ts`), 3/5 (`video.ts`). ✓
- UI wording + caption (spec §6) → Task 7. ✓
- Unit tests: pickH264Codec / supportsWebCodecs / dispatch (spec §7) → Tasks 1, 2, 5. ✓
- Playwright ftyp check (spec §7) → Task 6. ✓
- Done-when criteria (spec §Done when) → Task 8. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases" — every code step shows real code. ✓

**Type consistency:** `pickH264Codec(W,H,fps,bitrate,probe?)` defined in Task 1, called identically in Task 5. `exportVideoWebCodecs(r,opts,codec)` defined in Task 4, called identically in Task 5. `renderFrameToCanvas(r,ctx,base,tau,L,mode,W,H)` defined in Task 3, consumed in Task 4. `supportsWebCodecs()` defined Task 2, used Tasks 5, 7. `window.exportMp4Probe` typed in Task 6 global block and used in the same task's test. ✓
