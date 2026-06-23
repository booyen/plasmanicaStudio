# Keyframe Timeline (M5 v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An in-studio keyframe timeline that morphs whole-look snapshots over time (numeric/palette interpolation, discrete fields hard-switch at midpoint), with live preview and video export of the morph.

**Architecture:** A pure, zero-dependency core layer (`lerpConfig` / `applyEasing` / `sampleTimeline` in `plasma/timeline.ts`) interpolates `CoreConfig`s using the existing OKLab color math. A studio zustand store holds keyframes; a rAF playback loop samples the timeline and drives the renderer directly (outside React). The video exporter gains an optional `timeline` that re-samples the config per frame in the shared frame step.

**Tech Stack:** TypeScript (strict), zod-validated `CoreConfig`, existing `oklabMix`/`hex2rgb` color helpers, zustand, React, Vitest (unit), Playwright (visual).

## Global Constraints

- TypeScript strict everywhere.
- Core `plasma/timeline.ts` is zero-dependency and framework-free (no React/zustand/zod imports beyond the `CoreConfig` type). It must be importable by both studio and exporters.
- Interpolation rules (verbatim from the spec):
  - numbers + numeric tuples (`center`, `overlay.center`) → linear lerp `a+(b-a)*t`.
  - hex colors (`bg`, `overlay.colorA`, `overlay.colorB`) → OKLab mix via `hexMix`.
  - `palette` → element-wise `hexMix`; if lengths differ, pad the shorter by repeating its LAST color to the longer length; result length = the LONGER length.
  - discrete fields → take side `a` while `t < 0.5`, else side `b`. Discrete fields are EXACTLY: `version`, `motion`, `material`, `shape`, `seed`, `cursor.on`, `cursor.modes`, `overlay.type`, `overlay.blend`, `effects.pixelate.on`, `effects.blur.on`, `effects.glass.on`, `effects.bloom.on`.
- Easing set is EXACTLY: `linear`, `ease-in` (`u*u`), `ease-out` (`u*(2-u)`), `ease-in-out` (`u*u*(3-2*u)`). Easing is stored on the keyframe LEAVING a segment (the `from` keyframe).
- Timeline invariants: `duration > 0`; keyframes sorted by `t`; first at `t=0`, last at `t=duration`; length 2..6.
- Playback drives the renderer via `rendererRef` directly; it must NOT write the sampled config into `useConfigStore` (no history step, no per-frame canvas re-render through React). Pausing restores the store look once.
- Timeline code must NOT reach the `<plasma-bg>` embed bundle. (Core `timeline.ts` is allowed in core, but the embed entry must not import it; the embed does not import exporters or the studio.) Embed `plasma-bg.js` stays < 15 KB gzip.
- Commands: core tests `cd packages/core && pnpm test`; studio tests `cd apps/studio && pnpm test`; everything `pnpm test`; build `pnpm build` (tsc type-checks `*.test.ts` — always run build for any test-touching task); visual `pnpm test:visual`.

---

### Task 1: `rgb2hex` color formatter

**Files:**
- Modify: `packages/core/src/plasma/palette.ts`
- Test: `packages/core/src/plasma/palette.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `rgb2hex(rgb: [number, number, number]): string` — formats an RGB tuple (each channel 0..1) to `#rrggbb`, clamping to [0,1]. Mirrors the existing private `to2` digit helper.

- [ ] **Step 1: Write the failing test**

```ts
// append to packages/core/src/plasma/palette.test.ts
import { rgb2hex } from './palette.js';

describe('rgb2hex', () => {
  it('formats 0..1 channels to #rrggbb', () => {
    expect(rgb2hex([0, 0, 0])).toBe('#000000');
    expect(rgb2hex([1, 1, 1])).toBe('#ffffff');
    expect(rgb2hex([1, 0, 0])).toBe('#ff0000');
  });
  it('clamps out-of-range channels', () => {
    expect(rgb2hex([-0.5, 2, 0.5])).toBe('#00ff80');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test -- palette.test`
Expected: FAIL — `rgb2hex` is not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/plasma/palette.ts — add after the `to2` helper (reuse it)
/** RGB tuple (each channel 0..1, clamped) → #rrggbb. */
export function rgb2hex([r, g, b]: [number, number, number]): string {
  return '#' + to2(r) + to2(g) + to2(b);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm test -- palette.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/plasma/palette.ts packages/core/src/plasma/palette.test.ts
git commit -m "feat(core): rgb2hex color formatter"
```

---

### Task 2: `applyEasing` + `Easing` type

**Files:**
- Create: `packages/core/src/plasma/timeline.ts`
- Test: `packages/core/src/plasma/timeline.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Easing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'`
  - `applyEasing(easing: Easing, u: number): number` — remaps `u∈[0,1]`; endpoints map to 0 and 1; monotonic non-decreasing.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/plasma/timeline.test.ts
import { describe, it, expect } from 'vitest';
import { applyEasing } from './timeline.js';

describe('applyEasing', () => {
  const eases = ['linear', 'ease-in', 'ease-out', 'ease-in-out'] as const;

  it('maps endpoints 0->0 and 1->1 for every easing', () => {
    for (const e of eases) {
      expect(applyEasing(e, 0)).toBeCloseTo(0, 9);
      expect(applyEasing(e, 1)).toBeCloseTo(1, 9);
    }
  });

  it('is monotonic non-decreasing on a sampled grid', () => {
    for (const e of eases) {
      let prev = -1;
      for (let u = 0; u <= 1.0001; u += 0.05) {
        const v = applyEasing(e, u);
        expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = v;
      }
    }
  });

  it('ease-in-out is symmetric around 0.5', () => {
    expect(applyEasing('ease-in-out', 0.25) + applyEasing('ease-in-out', 0.75)).toBeCloseTo(1, 9);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test -- timeline.test`
Expected: FAIL — cannot import from `./timeline.js` (file does not exist).

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/plasma/timeline.ts
// Pure, zero-dependency keyframe interpolation over CoreConfig. Two clocks:
// motion time lives in the renderer; this module only morphs the *look*.

export type Easing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

/** Remap u in [0,1] by the named easing. Endpoints stay 0 and 1. */
export function applyEasing(easing: Easing, u: number): number {
  switch (easing) {
    case 'ease-in':
      return u * u;
    case 'ease-out':
      return u * (2 - u);
    case 'ease-in-out':
      return u * u * (3 - 2 * u);
    default:
      return u;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm test -- timeline.test`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/plasma/timeline.ts packages/core/src/plasma/timeline.test.ts
git commit -m "feat(core): applyEasing + Easing type (timeline interp)"
```

---

### Task 3: `lerpConfig` + color/palette helpers

**Files:**
- Modify: `packages/core/src/plasma/timeline.ts`
- Test: `packages/core/src/plasma/timeline.test.ts`

**Interfaces:**
- Consumes: `hex2rgb` (from `./gl.js`), `oklabMix` (from `./overlay.js`), `rgb2hex` (Task 1, from `./palette.js`), `CoreConfig` + `parseConfig` (from `./config.js`).
- Produces: `lerpConfig(a: CoreConfig, b: CoreConfig, t: number): CoreConfig` — interpolated config per the Global Constraints rules. Discrete fields picked from `a` (t<0.5) or `b`. Output is `parseConfig`-clamped.

**Implementation note (deviation from the spec's "structural recursion"):** because the
config schema is fixed and known, build the result with an EXPLICIT field-by-field
constructor rather than a generic recursive walker. This is more robust (an enum string
can never be mistaken for a lerpable number) and equally satisfies the spec's intent.

- [ ] **Step 1: Write the failing test**

```ts
// append to packages/core/src/plasma/timeline.test.ts
import { lerpConfig } from './timeline.js';
import { hex2rgb } from './gl.js';
import { oklabMix } from './overlay.js';
import { rgb2hex } from './palette.js';
import { parseConfig } from './config.js';

const cfg = (over: Record<string, unknown>) => parseConfig(over);

describe('lerpConfig', () => {
  it('lerps numeric fields linearly', () => {
    const a = cfg({ speed: 0, scalePct: 100 });
    const b = cfg({ speed: 4, scalePct: 200 });
    const m = lerpConfig(a, b, 0.5);
    expect(m.speed).toBeCloseTo(2, 6);
    expect(m.scalePct).toBeCloseTo(150, 6);
  });

  it('lerps numeric tuples (center) component-wise', () => {
    const a = cfg({ center: [0, 0] });
    const b = cfg({ center: [1, 2] });
    const m = lerpConfig(a, b, 0.5);
    expect(m.center[0]).toBeCloseTo(0.5, 6);
    expect(m.center[1]).toBeCloseTo(1, 6);
  });

  it('interpolates palette in OKLab; endpoints are the inputs', () => {
    const a = cfg({ palette: ['#ff0000'] });
    const b = cfg({ palette: ['#0000ff'] });
    expect(lerpConfig(a, b, 0).palette[0].toLowerCase()).toBe('#ff0000');
    expect(lerpConfig(a, b, 1).palette[0].toLowerCase()).toBe('#0000ff');
    const midExpected = rgb2hex(oklabMix(hex2rgb('#ff0000'), hex2rgb('#0000ff'), 0.5));
    expect(lerpConfig(a, b, 0.5).palette[0].toLowerCase()).toBe(midExpected.toLowerCase());
  });

  it('pads the shorter palette with its last color; result takes the longer length', () => {
    const a = cfg({ palette: ['#ff0000'] });
    const b = cfg({ palette: ['#0000ff', '#00ff00'] });
    const m = lerpConfig(a, b, 0.5);
    expect(m.palette.length).toBe(2);
    // index 1 mixes a's LAST (#ff0000) with b[1] (#00ff00)
    const expect1 = rgb2hex(oklabMix(hex2rgb('#ff0000'), hex2rgb('#00ff00'), 0.5));
    expect(m.palette[1].toLowerCase()).toBe(expect1.toLowerCase());
  });

  it('switches discrete fields at the t=0.5 boundary', () => {
    const a = cfg({ motion: 'Classic', cursor: { on: true, modes: ['fluid'] }, effects: { bloom: { on: false } } });
    const b = cfg({ motion: 'Vortex', cursor: { on: false, modes: ['pixels'] }, effects: { bloom: { on: true } } });
    const lo = lerpConfig(a, b, 0.49);
    const hi = lerpConfig(a, b, 0.5);
    expect(lo.motion).toBe('Classic');
    expect(hi.motion).toBe('Vortex');
    expect(lo.cursor.on).toBe(true);
    expect(hi.cursor.on).toBe(false);
    expect(lo.cursor.modes).toEqual(['fluid']);
    expect(hi.cursor.modes).toEqual(['pixels']);
    expect(lo.effects.bloom.on).toBe(false);
    expect(hi.effects.bloom.on).toBe(true);
  });

  it('recurses into nested numeric fields', () => {
    const a = cfg({ flow: { angleDeg: 0, amount: 0 }, effects: { bloom: { on: true, intensity: 0 } } });
    const b = cfg({ flow: { angleDeg: 100, amount: 1 }, effects: { bloom: { on: true, intensity: 1 } } });
    const m = lerpConfig(a, b, 0.5);
    expect(m.flow.angleDeg).toBeCloseTo(50, 6);
    expect(m.flow.amount).toBeCloseTo(0.5, 6);
    expect(m.effects.bloom.intensity).toBeCloseTo(0.5, 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test -- timeline.test`
Expected: FAIL — `lerpConfig` is not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/plasma/timeline.ts — add imports at top
import { hex2rgb } from './gl.js';
import { oklabMix } from './overlay.js';
import { rgb2hex } from './palette.js';
import { parseConfig, type CoreConfig } from './config.js';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const hexMix = (a: string, b: string, t: number) => rgb2hex(oklabMix(hex2rgb(a), hex2rgb(b), t));

/** Element-wise OKLab palette mix; shorter side padded with its last color. */
function lerpPalette(a: string[], b: string[], t: number): string[] {
  const n = Math.max(a.length, b.length);
  const at = (p: string[], i: number) => p[Math.min(i, p.length - 1)]!;
  return Array.from({ length: n }, (_, i) => hexMix(at(a, i), at(b, i), t));
}

/**
 * Interpolate two looks. Numbers/tuples lerp; hex colors + palette mix in OKLab;
 * discrete fields take side `a` while t<0.5 else `b`. Explicit field-by-field
 * construction (the schema is fixed) — output is parseConfig-clamped.
 */
export function lerpConfig(a: CoreConfig, b: CoreConfig, t: number): CoreConfig {
  const d = t < 0.5 ? a : b; // discrete source
  return parseConfig({
    version: 1,
    motion: d.motion,
    material: d.material,
    shape: d.shape,
    seed: d.seed,
    palette: lerpPalette(a.palette, b.palette, t),
    bg: hexMix(a.bg, b.bg, t),
    speed: lerp(a.speed, b.speed, t),
    scalePct: lerp(a.scalePct, b.scalePct, t),
    swirl: lerp(a.swirl, b.swirl, t),
    turbulence: lerp(a.turbulence, b.turbulence, t),
    detail: lerp(a.detail, b.detail, t),
    flow: {
      angleDeg: lerp(a.flow.angleDeg, b.flow.angleDeg, t),
      amount: lerp(a.flow.amount, b.flow.amount, t),
    },
    coverage: lerp(a.coverage, b.coverage, t),
    contrast: lerp(a.contrast, b.contrast, t),
    visibility: lerp(a.visibility, b.visibility, t),
    gravity: lerp(a.gravity, b.gravity, t),
    grain: lerp(a.grain, b.grain, t),
    rotateDeg: lerp(a.rotateDeg, b.rotateDeg, t),
    center: [lerp(a.center[0], b.center[0], t), lerp(a.center[1], b.center[1], t)],
    cursor: {
      on: d.cursor.on,
      modes: d.cursor.modes,
      strength: lerp(a.cursor.strength, b.cursor.strength, t),
      size: lerp(a.cursor.size, b.cursor.size, t),
      trail: lerp(a.cursor.trail, b.cursor.trail, t),
      turbulence: lerp(a.cursor.turbulence, b.cursor.turbulence, t),
      lag: lerp(a.cursor.lag, b.cursor.lag, t),
    },
    overlay: {
      type: d.overlay.type,
      blend: d.overlay.blend,
      opacity: lerp(a.overlay.opacity, b.overlay.opacity, t),
      colorA: hexMix(a.overlay.colorA, b.overlay.colorA, t),
      alphaA: lerp(a.overlay.alphaA, b.overlay.alphaA, t),
      colorB: hexMix(a.overlay.colorB, b.overlay.colorB, t),
      alphaB: lerp(a.overlay.alphaB, b.overlay.alphaB, t),
      angleDeg: lerp(a.overlay.angleDeg, b.overlay.angleDeg, t),
      center: [lerp(a.overlay.center[0], b.overlay.center[0], t), lerp(a.overlay.center[1], b.overlay.center[1], t)],
      radius: lerp(a.overlay.radius, b.overlay.radius, t),
    },
    effects: {
      pixelate: { on: d.effects.pixelate.on, size: lerp(a.effects.pixelate.size, b.effects.pixelate.size, t) },
      blur: { on: d.effects.blur.on, strength: lerp(a.effects.blur.strength, b.effects.blur.strength, t) },
      glass: {
        on: d.effects.glass.on,
        strength: lerp(a.effects.glass.strength, b.effects.glass.strength, t),
        tint: lerp(a.effects.glass.tint, b.effects.glass.tint, t),
      },
      bloom: {
        on: d.effects.bloom.on,
        threshold: lerp(a.effects.bloom.threshold, b.effects.bloom.threshold, t),
        intensity: lerp(a.effects.bloom.intensity, b.effects.bloom.intensity, t),
        radius: lerp(a.effects.bloom.radius, b.effects.bloom.radius, t),
      },
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm test -- timeline.test`
Expected: PASS (applyEasing + lerpConfig tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/plasma/timeline.ts packages/core/src/plasma/timeline.test.ts
git commit -m "feat(core): lerpConfig — OKLab palette/color + discrete-switch interp"
```

---

### Task 4: `Timeline`/`Keyframe` types + `sampleTimeline`; export from index

**Files:**
- Modify: `packages/core/src/plasma/timeline.ts`
- Modify: `packages/core/src/plasma/index.ts`
- Test: `packages/core/src/plasma/timeline.test.ts`

**Interfaces:**
- Consumes: `lerpConfig`, `applyEasing` (same file); `CoreConfig`.
- Produces:
  - `interface Keyframe { id: string; t: number; config: CoreConfig; easing: Easing }`
  - `interface Timeline { duration: number; keyframes: Keyframe[] }`
  - `sampleTimeline(tl: Timeline, time: number): CoreConfig`

- [ ] **Step 1: Write the failing test**

```ts
// append to packages/core/src/plasma/timeline.test.ts
import { sampleTimeline, type Timeline } from './timeline.js';

const kf = (id: string, t: number, over: Record<string, unknown>, easing = 'linear' as const) =>
  ({ id, t, easing, config: parseConfig(over) });

describe('sampleTimeline', () => {
  const tl: Timeline = {
    duration: 10,
    keyframes: [kf('a', 0, { speed: 0 }), kf('b', 10, { speed: 4 })],
  };

  it('clamps time outside [0,duration] to the end keyframes', () => {
    expect(sampleTimeline(tl, -5).speed).toBeCloseTo(0, 6);
    expect(sampleTimeline(tl, 99).speed).toBeCloseTo(4, 6);
  });

  it('interpolates within a segment', () => {
    expect(sampleTimeline(tl, 5).speed).toBeCloseTo(2, 6);
  });

  it('selects the correct bracket with 3 keyframes', () => {
    const tl3: Timeline = {
      duration: 10,
      keyframes: [kf('a', 0, { speed: 0 }), kf('b', 5, { speed: 10 }), kf('c', 10, { speed: 0 })],
    };
    expect(sampleTimeline(tl3, 2.5).speed).toBeCloseTo(5, 6); // first segment midpoint
    expect(sampleTimeline(tl3, 7.5).speed).toBeCloseTo(5, 6); // second segment midpoint
  });

  it('applies the leaving keyframe easing', () => {
    const eased: Timeline = {
      duration: 10,
      keyframes: [kf('a', 0, { speed: 0 }, 'ease-in'), kf('b', 10, { speed: 10 })],
    };
    // ease-in at u=0.5 -> 0.25 -> speed 2.5
    expect(sampleTimeline(eased, 5).speed).toBeCloseTo(2.5, 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test -- timeline.test`
Expected: FAIL — `sampleTimeline` / `Timeline` not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/plasma/timeline.ts — add after lerpConfig
export interface Keyframe {
  id: string;
  t: number;
  config: CoreConfig;
  easing: Easing;
}

export interface Timeline {
  duration: number;
  keyframes: Keyframe[];
}

/** The morphed look at `time` seconds. Keyframes assumed sorted by t. */
export function sampleTimeline(tl: Timeline, time: number): CoreConfig {
  const ks = tl.keyframes;
  const clamped = Math.min(tl.duration, Math.max(0, time));
  if (clamped <= ks[0]!.t) return ks[0]!.config;
  const last = ks[ks.length - 1]!;
  if (clamped >= last.t) return last.config;
  let i = 0;
  while (i < ks.length - 1 && !(ks[i]!.t <= clamped && clamped < ks[i + 1]!.t)) i++;
  const kA = ks[i]!;
  const kB = ks[i + 1]!;
  if (kB.t === kA.t) return kB.config;
  const u = (clamped - kA.t) / (kB.t - kA.t);
  return lerpConfig(kA.config, kB.config, applyEasing(kA.easing, u));
}
```

```ts
// packages/core/src/plasma/index.ts — add the export line (keep existing lines)
export * from './timeline.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm test -- timeline.test && cd ../.. && pnpm --filter @effects/core build`
Expected: PASS; clean tsc.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/plasma/timeline.ts packages/core/src/plasma/index.ts packages/core/src/plasma/timeline.test.ts
git commit -m "feat(core): Timeline/Keyframe types + sampleTimeline; export from index"
```

---

### Task 5: Core midpoint Playwright golden

**Files:**
- Modify: `apps/studio/src/golden.ts`
- Modify: `tests/visual/plasma.spec.ts`

**Interfaces:**
- Consumes: `sampleTimeline`, `parseConfig`, `type Timeline` from `@effects/core`; the existing `renderer`.
- Produces: `window.renderTimelineMidpoint(): void` — builds a fixed 2-keyframe timeline, samples its midpoint, and renders it deterministically (grain off, cursor off).

- [ ] **Step 1: Write the failing test**

```ts
// append a new describe block to tests/visual/plasma.spec.ts
test.describe('timeline', () => {
  test('renders a deterministic 2-keyframe midpoint morph', async ({ page }) => {
    await page.goto('/golden.html');
    await page.waitForFunction(() => typeof window.renderTimelineMidpoint === 'function');
    await page.evaluate(() => window.renderTimelineMidpoint());
    await page.waitForTimeout(120);
    await expect(page.locator('canvas')).toHaveScreenshot('timeline-midpoint.png');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:visual -- -g "2-keyframe midpoint"`
Expected: FAIL — `window.renderTimelineMidpoint` undefined (waitForFunction times out).

- [ ] **Step 3: Extend the harness**

```ts
// apps/studio/src/golden.ts — extend imports and globals
import { PlasmaRenderer, parseConfig, exportVideo, sampleTimeline, type CoreConfig, type Timeline } from '@effects/core';

declare global {
  interface Window {
    renderGolden: (cfg: Partial<CoreConfig>, t: number) => void;
    exportMp4Probe: () => Promise<{ type: string; size: number; ftyp: string }>;
    renderTimelineMidpoint: () => void;
  }
}

// append after the existing assignments
window.renderTimelineMidpoint = () => {
  const base = { grain: 0, cursor: { on: false, modes: [] as string[] } };
  const tl: Timeline = {
    duration: 10,
    keyframes: [
      { id: 'a', t: 0, easing: 'linear', config: parseConfig({ ...base, motion: 'Classic', palette: ['#2b5fff', '#00e0d0'] }) },
      { id: 'b', t: 10, easing: 'linear', config: parseConfig({ ...base, motion: 'Classic', palette: ['#ff7a3c', '#ff3c9e'] }) },
    ],
  };
  const mid = sampleTimeline(tl, 5);
  canvas.width = W;
  canvas.height = H;
  renderer.setConfig(mid);
  renderer.seek(12.5);
  renderer.renderAt(12.5);
};
```

(Both keyframes use `motion: 'Classic'` so the discrete switch at t=0.5 produces no pop — the golden captures the color/numeric morph.)

- [ ] **Step 4: Run to verify it passes (creates the golden)**

Run: `pnpm test:visual -- -g "2-keyframe midpoint"`
Expected: PASS — a new snapshot `timeline-midpoint.png` is written and matched.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/golden.ts tests/visual/plasma.spec.ts tests/visual/plasma.spec.ts-snapshots/
git commit -m "test(visual): deterministic 2-keyframe timeline midpoint golden"
```

---

### Task 6: `useTimelineStore` (zustand)

**Files:**
- Create: `apps/studio/src/stores/timeline.ts`
- Test: `apps/studio/src/stores/timeline.test.ts`

**Interfaces:**
- Consumes: `useConfigStore` (for `captureKeyframe`); `type Keyframe`, `type Easing`, `type Timeline` from `@effects/core`.
- Produces: `useTimelineStore` with state `{ duration, keyframes, playhead, isPlaying, selectedId }` and actions below; plus pure helper `advancePlayhead(playhead, dt, duration): number` (wraps at duration, returns 0 if duration<=0).

  Actions: `captureKeyframe()`, `deleteKeyframe(id)`, `moveKeyframe(id, t)`, `setEasing(id, easing)`, `setDuration(s)`, `select(id|null)`, `play()`, `pause()`, `seek(t)`, `setPlayhead(t)`, `timeline(): Timeline`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/studio/src/stores/timeline.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useTimelineStore, advancePlayhead } from './timeline.js';
import { useConfigStore } from './config.js';

const reset = () => useTimelineStore.setState({ duration: 10, keyframes: [], playhead: 0, isPlaying: false, selectedId: null });

describe('advancePlayhead', () => {
  it('advances by dt and wraps at duration', () => {
    expect(advancePlayhead(0, 1, 10)).toBeCloseTo(1, 6);
    expect(advancePlayhead(9.5, 1, 10)).toBeCloseTo(0.5, 6); // wraps
  });
  it('returns 0 for non-positive duration', () => {
    expect(advancePlayhead(3, 1, 0)).toBe(0);
  });
});

describe('useTimelineStore', () => {
  beforeEach(reset);

  it('captureKeyframe snapshots the current config and keeps keyframes sorted', () => {
    const s = useTimelineStore.getState();
    s.seek(8);
    s.captureKeyframe();
    s.seek(2);
    s.captureKeyframe();
    const ks = useTimelineStore.getState().keyframes;
    expect(ks.map((k) => k.t)).toEqual([2, 8]);
    expect(ks[0]!.config).toEqual(useConfigStore.getState().config);
  });

  it('caps keyframes at 6', () => {
    const s = useTimelineStore.getState();
    for (let i = 0; i < 8; i++) { s.seek(i); s.captureKeyframe(); }
    expect(useTimelineStore.getState().keyframes.length).toBe(6);
  });

  it('deleteKeyframe removes by id', () => {
    const s = useTimelineStore.getState();
    s.seek(3); s.captureKeyframe();
    const id = useTimelineStore.getState().keyframes[0]!.id;
    s.deleteKeyframe(id);
    expect(useTimelineStore.getState().keyframes).toHaveLength(0);
  });

  it('moveKeyframe clamps to [0,duration] and re-sorts', () => {
    const s = useTimelineStore.getState();
    s.seek(1); s.captureKeyframe();
    s.seek(9); s.captureKeyframe();
    const first = useTimelineStore.getState().keyframes[0]!.id;
    s.moveKeyframe(first, 50);
    expect(useTimelineStore.getState().keyframes.map((k) => k.t)).toEqual([9, 10]);
  });

  it('setEasing updates a keyframe easing', () => {
    const s = useTimelineStore.getState();
    s.seek(0); s.captureKeyframe();
    const id = useTimelineStore.getState().keyframes[0]!.id;
    s.setEasing(id, 'ease-in');
    expect(useTimelineStore.getState().keyframes[0]!.easing).toBe('ease-in');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/studio && pnpm test -- timeline`
Expected: FAIL — module `./timeline.js` does not exist.

- [ ] **Step 3: Write the store**

```ts
// apps/studio/src/stores/timeline.ts
// Studio-only keyframe timeline state. Keyframes hold whole-look CoreConfig
// snapshots; playback samples them and drives the renderer outside React.
import { create } from 'zustand';
import type { Keyframe, Easing, Timeline } from '@effects/core';
import { useConfigStore } from './config.js';

const MAX_KEYS = 6;
let idSeq = 0;
const nextId = () => `k${++idSeq}`;

/** Advance a playhead by dt seconds, wrapping at duration. */
export function advancePlayhead(playhead: number, dt: number, duration: number): number {
  if (duration <= 0) return 0;
  let p = playhead + dt;
  while (p >= duration) p -= duration;
  if (p < 0) p = 0;
  return p;
}

const sortByT = (ks: Keyframe[]) => [...ks].sort((a, b) => a.t - b.t);

export type TimelineStore = {
  duration: number;
  keyframes: Keyframe[];
  playhead: number;
  isPlaying: boolean;
  selectedId: string | null;

  captureKeyframe: () => void;
  deleteKeyframe: (id: string) => void;
  moveKeyframe: (id: string, t: number) => void;
  setEasing: (id: string, easing: Easing) => void;
  setDuration: (s: number) => void;
  select: (id: string | null) => void;
  play: () => void;
  pause: () => void;
  seek: (t: number) => void;
  setPlayhead: (t: number) => void;
  timeline: () => Timeline;
};

export const useTimelineStore = create<TimelineStore>((set, get) => ({
  duration: 10,
  keyframes: [],
  playhead: 0,
  isPlaying: false,
  selectedId: null,

  captureKeyframe: () =>
    set((s) => {
      if (s.keyframes.length >= MAX_KEYS) return s;
      const kf: Keyframe = { id: nextId(), t: Math.min(s.duration, Math.max(0, s.playhead)), easing: 'linear', config: useConfigStore.getState().config };
      return { keyframes: sortByT([...s.keyframes, kf]), selectedId: kf.id };
    }),

  deleteKeyframe: (id) =>
    set((s) => ({ keyframes: s.keyframes.filter((k) => k.id !== id), selectedId: s.selectedId === id ? null : s.selectedId })),

  moveKeyframe: (id, t) =>
    set((s) => ({
      keyframes: sortByT(s.keyframes.map((k) => (k.id === id ? { ...k, t: Math.min(s.duration, Math.max(0, t)) } : k))),
    })),

  setEasing: (id, easing) => set((s) => ({ keyframes: s.keyframes.map((k) => (k.id === id ? { ...k, easing } : k)) })),
  setDuration: (sec) => set({ duration: Math.max(0.1, sec) }),
  select: (selectedId) => set({ selectedId }),
  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  seek: (t) => set((s) => ({ playhead: Math.min(s.duration, Math.max(0, t)) })),
  setPlayhead: (t) => set({ playhead: t }),
  timeline: () => ({ duration: get().duration, keyframes: get().keyframes }),
}));
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/studio && pnpm test -- timeline`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/stores/timeline.ts apps/studio/src/stores/timeline.test.ts
git commit -m "feat(studio): useTimelineStore + advancePlayhead"
```

---

### Task 7: Playback loop wired to the renderer

**Files:**
- Create: `apps/studio/src/lib/timelinePlayback.ts`
- Modify: `apps/studio/src/App.tsx`

**Interfaces:**
- Consumes: `sampleTimeline` (`@effects/core`), `useTimelineStore`, `advancePlayhead`, `useConfigStore`, `PlasmaRenderer`.
- Produces: `bindTimelinePlayback(renderer: PlasmaRenderer): () => void` — subscribes to the timeline store; while `isPlaying`, runs a rAF loop that advances the playhead, samples the timeline, and calls `renderer.setConfig(...)` directly. On pause it restores the config-store look once. Returns an unsubscribe.

No new automated test (rAF + renderer side effects); verified by build + the store unit tests (`advancePlayhead`). Do NOT add a test that fakes rAF.

- [ ] **Step 1: Write the module**

```ts
// apps/studio/src/lib/timelinePlayback.ts
// Timeline playback drives the renderer DIRECTLY (outside React/config-store) so
// the morph never pollutes history or re-renders the tree per frame. The config
// store remains the authoring source; pausing restores it.
import { sampleTimeline, type PlasmaRenderer } from '@effects/core';
import { useTimelineStore, advancePlayhead } from '../stores/timeline.js';
import { useConfigStore } from '../stores/config.js';

export function bindTimelinePlayback(renderer: PlasmaRenderer): () => void {
  let raf = 0;
  let last = 0;

  const tick = (now: number) => {
    const st = useTimelineStore.getState();
    const dt = (now - last) / 1000;
    last = now;
    if (st.keyframes.length >= 1) {
      const playhead = advancePlayhead(st.playhead, dt, st.duration);
      st.setPlayhead(playhead);
      if (st.keyframes.length >= 2) renderer.setConfig(sampleTimeline(st.timeline(), playhead));
    }
    raf = requestAnimationFrame(tick);
  };

  const unsub = useTimelineStore.subscribe((s, prev) => {
    if (s.isPlaying && !prev.isPlaying) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    } else if (!s.isPlaying && prev.isPlaying) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      renderer.setConfig(useConfigStore.getState().config); // restore authoring look
    }
  });

  return () => {
    if (raf) cancelAnimationFrame(raf);
    unsub();
  };
}
```

- [ ] **Step 2: Wire it into App.tsx**

```tsx
// apps/studio/src/App.tsx — add import
import { bindTimelinePlayback } from './lib/timelinePlayback.js';
```

In `onReady`, add the binding and include it in the returned cleanup:

```tsx
    const unsubCfg = useConfigStore.subscribe((s) => renderer.setConfig(s.config));
    const unsubPause = useStageStore.subscribe((s) => renderer.setPaused(s.paused));
    const unsubTl = bindTimelinePlayback(renderer);
    return () => {
      unsubCfg();
      unsubPause();
      unsubTl();
      if (rendererRef.current === renderer) rendererRef.current = null;
    };
```

- [ ] **Step 3: Build to verify types + wiring**

Run: `pnpm --filter studio build`
Expected: clean tsc + vite build.

- [ ] **Step 4: Run the studio unit suite (unchanged green)**

Run: `cd apps/studio && pnpm test`
Expected: PASS (timeline store tests + existing).

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/lib/timelinePlayback.ts apps/studio/src/App.tsx
git commit -m "feat(studio): timeline playback loop drives the renderer directly"
```

---

### Task 8: Timeline strip UI

**Files:**
- Create: `apps/studio/src/panels/timeline/TimelineStrip.tsx`
- Modify: `apps/studio/src/App.tsx` (mount `<TimelineStrip />`)

**Interfaces:**
- Consumes: `useTimelineStore`, `type Easing` (`@effects/core`), `Button` (`components/ui/button.js`), `Select` (`components/ui/select.js`), lucide icons.
- Produces: a bottom-center timeline strip. Renders a track with keyframe pips (click to select, drag to move), a draggable playhead, play/pause, a duration input, "capture look", delete-selected, and an easing `Select` for the selected keyframe.

No unit test (presentational); verified by build. Follow the existing HUD dock styling (see `BottomDock.tsx`): `pointer-events-auto`, `onPointerDown` stop-propagation, `hud-panel` card classes.

- [ ] **Step 1: Write the component**

```tsx
// apps/studio/src/panels/timeline/TimelineStrip.tsx
// Bottom timeline strip: keyframe track + playhead + transport. Drives the
// timeline store; playback (App's bindTimelinePlayback) does the rendering.
import { useRef } from 'react';
import { Play, Pause, Plus, Trash2 } from 'lucide-react';
import type { Easing } from '@effects/core';
import { useTimelineStore } from '../../stores/timeline.js';
import { Button } from '../../components/ui/button.js';
import { Select } from '../../components/ui/select.js';

const EASINGS: Easing[] = ['linear', 'ease-in', 'ease-out', 'ease-in-out'];

export function TimelineStrip() {
  const { duration, keyframes, playhead, isPlaying, selectedId } = useTimelineStore();
  const { play, pause, seek, captureKeyframe, deleteKeyframe, moveKeyframe, setEasing, setDuration, select } =
    useTimelineStore();
  const trackRef = useRef<HTMLDivElement>(null);

  const xToT = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.min(duration, Math.max(0, ((clientX - r.left) / r.width) * duration));
  };
  const pct = (t: number) => `${(t / duration) * 100}%`;

  const onTrackPointerDown = (e: React.PointerEvent) => {
    if (e.target !== trackRef.current) return; // ignore clicks on pips
    seek(xToT(e.clientX));
  };

  const dragPlayhead = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => seek(xToT(ev.clientX));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const dragPip = (id: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    select(id);
    (e.target as Element).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => moveKeyframe(id, xToT(ev.clientX));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const selected = keyframes.find((k) => k.id === selectedId) ?? null;

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className="hud-panel pointer-events-auto absolute bottom-20 left-1/2 z-10 flex w-[min(680px,80vw)] -translate-x-1/2 flex-col gap-2 rounded-[12px] border border-border bg-card/85 px-3 py-2 shadow-[0_24px_60px_-15px_rgba(0,0,0,0.75)] backdrop-blur-xl"
    >
      <div className="flex items-center gap-2">
        <Button size="icon" variant="default" title={isPlaying ? 'pause' : 'play'} onClick={() => (isPlaying ? pause() : play())}>
          {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </Button>
        <Button size="sm" title="capture current look as a keyframe" onClick={captureKeyframe} disabled={keyframes.length >= 6}>
          <Plus className="h-3.5 w-3.5" /> capture
        </Button>
        <Button size="sm" variant="ghost" title="delete selected keyframe" onClick={() => selected && deleteKeyframe(selected.id)} disabled={!selected}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        <div className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {selected && (
            <Select value={selected.easing} onChange={(e) => setEasing(selected.id, e.target.value as Easing)} className="w-[110px] py-1">
              {EASINGS.map((e) => (<option key={e} value={e}>{e}</option>))}
            </Select>
          )}
          <label className="flex items-center gap-1">
            dur
            <input
              type="number" min={0.1} step={0.5} value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-14 rounded-md border border-border bg-secondary px-1.5 py-1 text-[11px] tabular-nums text-foreground"
            />
            s
          </label>
          <span className="w-10 text-right tabular-nums text-foreground">{playhead.toFixed(1)}s</span>
        </div>
      </div>

      <div
        ref={trackRef}
        onPointerDown={onTrackPointerDown}
        className="relative h-8 w-full cursor-pointer rounded-md border border-border bg-secondary/60"
      >
        {keyframes.map((k) => (
          <div
            key={k.id}
            onPointerDown={dragPip(k.id)}
            title={`${k.t.toFixed(1)}s · ${k.easing}`}
            style={{ left: pct(k.t) }}
            className={
              'absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 cursor-grab rounded-[2px] border ' +
              (k.id === selectedId ? 'border-primary bg-primary' : 'border-border bg-foreground/70')
            }
          />
        ))}
        <div
          onPointerDown={dragPlayhead}
          style={{ left: pct(playhead) }}
          className="absolute top-0 h-full w-0.5 -translate-x-1/2 cursor-ew-resize bg-primary"
        >
          <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-primary" />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Mount in App.tsx**

```tsx
// apps/studio/src/App.tsx — add import
import { TimelineStrip } from './panels/timeline/TimelineStrip.js';
```

Add `<TimelineStrip />` to the render tree, next to the other docks:

```tsx
      <BottomDock />
      <ExportDock />
      <TimelineStrip />
```

- [ ] **Step 3: Build to verify**

Run: `pnpm --filter studio build`
Expected: clean tsc + vite build.

- [ ] **Step 4: Commit**

```bash
git add apps/studio/src/panels/timeline/TimelineStrip.tsx apps/studio/src/App.tsx
git commit -m "feat(studio): keyframe timeline strip UI"
```

---

### Task 9: Video export along the timeline

**Files:**
- Modify: `packages/core/src/exporters/video.ts` (add `timeline?` to `VideoOpts`; sample per frame in `renderFrameToCanvas`)
- Modify: `apps/studio/src/panels/export/VideoExportModal.tsx` (pass the timeline + loop hint)

**Interfaces:**
- Consumes: `sampleTimeline`, `type Timeline` (`@effects/core`); `useTimelineStore`.
- Produces: `VideoOpts.timeline?: Timeline`. When set, `renderFrameToCanvas` calls `r.setConfig(sampleTimeline(timeline, tau))` before rendering each frame (applies to both backends, which share it). When `timeline` is set and the caller passes no `durationS`, callers default it to `timeline.duration` (the modal does this).

- [ ] **Step 1: Thread `timeline` into the shared frame step**

In `packages/core/src/exporters/video.ts`:

Add to the `VideoOpts` type:
```ts
  timeline?: import('../plasma/timeline.js').Timeline;
```

Add the import near the top:
```ts
import { sampleTimeline } from '../plasma/timeline.js';
```

Extend `renderFrameToCanvas` to accept an optional timeline and sample it first:
```ts
export function renderFrameToCanvas(
  r: PlasmaRenderer, ctx: CanvasRenderingContext2D,
  base: number, tau: number, L: number, mode: VideoMode, W: number, H: number,
  timeline?: import('../plasma/timeline.js').Timeline,
): void {
  if (timeline) r.setConfig(sampleTimeline(timeline, tau));
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

Pass `opts.timeline` at BOTH call sites. In `exportVideoMediaRecorder`'s loop:
```ts
    renderFrameToCanvas(r, ctx, base, tau, L, mode, W, H, opts.timeline);
```

And in `packages/core/src/exporters/video-webcodecs.ts`'s loop:
```ts
      renderFrameToCanvas(r, ctx, base, times[i]!, L, mode, W, H, opts.timeline);
```

- [ ] **Step 2: Build core to verify types**

Run: `pnpm --filter @effects/core build`
Expected: clean tsc.

- [ ] **Step 3: Wire the modal**

In `apps/studio/src/panels/export/VideoExportModal.tsx`, import the timeline store:
```tsx
import { useTimelineStore } from '../../stores/timeline.js';
```

Inside the component, read whether a timeline exists and an opt-in toggle:
```tsx
  const tlKeys = useTimelineStore((s) => s.keyframes.length);
  const tlDuration = useTimelineStore((s) => s.duration);
  const [useTl, setUseTl] = useState(true);
  const hasTimeline = tlKeys >= 2;
```

In `save`, when `hasTimeline && useTl`, pass the timeline and default the duration to the timeline's:
```ts
      const tl = hasTimeline && useTl ? useTimelineStore.getState().timeline() : undefined;
      const { blob, ext } = await exportVideo(r, {
        durationS: tl ? tlDuration : dur,
        mode,
        quality: qual,
        timeline: tl,
        onProgress: (p) => setStatus(`rendering ${Math.round(p * 100)}%`),
      });
```

Add, below the existing format caption `<p>`, a timeline control shown only when `hasTimeline`:
```tsx
          {hasTimeline && (
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <input type="checkbox" checked={useTl} onChange={(e) => setUseTl(e.target.checked)} />
              Animate timeline ({tlKeys} keys, {tlDuration}s)
            </label>
          )}
          {hasTimeline && useTl && mode === 'loop' && (
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              For a seamless loop, make the first and last keyframes the same look — otherwise the look jumps at the wrap.
            </p>
          )}
```

- [ ] **Step 4: Build the studio**

Run: `pnpm --filter studio build`
Expected: clean tsc + vite build.

- [ ] **Step 5: Verify the existing MP4 export test still passes (no timeline → unchanged)**

Run: `pnpm test:visual -- -g "exports a real MP4"`
Expected: PASS (the probe passes no timeline, so behavior is unchanged).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/exporters/video.ts packages/core/src/exporters/video-webcodecs.ts apps/studio/src/panels/export/VideoExportModal.tsx
git commit -m "feat: export video along the keyframe timeline (both backends)"
```

---

### Task 10: Full-suite verification + docs

**Files:**
- Modify: `CONTINUE.md`
- Modify: `PLASMA_STUDIO_ROADMAP.md` (mark M5 keyframe-timeline half done)

- [ ] **Step 1: Full unit suite**

Run: `pnpm test`
Expected: PASS — core (incl. `timeline.test.ts`, `palette.test.ts`) + studio (incl. `timeline.test.ts`).

- [ ] **Step 2: Full build + embed budget**

Run: `pnpm build`
Expected: clean tsc; `@effects/embed` `plasma-bg.js` gzip < 15 KB (timeline code must not have leaked into the embed).

- [ ] **Step 3: Full visual suite**

Run: `pnpm test:visual`
Expected: PASS — existing goldens + MP4 ftyp + the new `timeline-midpoint`.

- [ ] **Step 4: Update CONTINUE.md**

Add a "Done — keyframe timeline (M5 v1)" section: core `lerpConfig`/`applyEasing`/`sampleTimeline` (OKLab palette/color morph, discrete switch at midpoint); `useTimelineStore` + playback loop driving the renderer directly; bottom timeline strip UI; video export along the timeline (both backends); covered by unit + a midpoint golden. Note out-of-scope follow-ups (embed runtime API, audio reactivity, discrete crossfade, second engine). Update the M5 line.

- [ ] **Step 5: Commit**

```bash
git add CONTINUE.md PLASMA_STUDIO_ROADMAP.md
git commit -m "docs: keyframe timeline (M5 v1) done — handoff + roadmap"
```

---

## Self-Review

**Spec coverage:**
- Two clocks / live morph → Tasks 7 (playback) + design honored in 9 (export motion via renderAt, look via setConfig). ✓
- Data model (`Keyframe`/`Timeline`) → Task 4. ✓
- `lerpConfig` rules (numeric/tuple/hex/palette/discrete) → Task 3 (+ `rgb2hex` Task 1). ✓
- `applyEasing` → Task 2. ✓
- `sampleTimeline` (clamp/bracket/easing) → Task 4. ✓
- `useTimelineStore` (capture/delete/move/easing/duration/seek; sort; 2..6 cap) → Task 6. ✓
- Playback drives renderer directly, pause restores → Task 7. ✓
- Timeline strip UI (pips/playhead/transport/easing) → Task 8. ✓
- Video export along timeline (both backends; default duration; loop hint) → Task 9. ✓
- Tests: lerp/easing/sample unit + midpoint golden → Tasks 2/3/4/5; store unit → Task 6. ✓
- Embed budget unaffected → Task 10 step 2. ✓
- Done-when criteria → Task 10. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows real code. ✓

**Type consistency:** `rgb2hex([r,g,b])` (T1) used in T3. `applyEasing(Easing, u)` (T2) used in T4. `lerpConfig(a,b,t)` (T3) used in T4. `Keyframe`/`Timeline`/`sampleTimeline` (T4) used in T5/6/7/9. `useTimelineStore` shape + `advancePlayhead` (T6) used in T7/8/9. `renderFrameToCanvas(...,timeline?)` (T9) — both backend call sites updated in the same task. `timeline()` store method returns `Timeline` and is used in T7/T9. ✓
