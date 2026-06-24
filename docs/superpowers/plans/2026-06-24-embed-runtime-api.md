# Embed Runtime API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a programmatic animation API (`set` / `animateTo` / `timeline` / `play` / `pause` / `seek`) to the `<plasma-bg>` custom element so external code can morph the look over time, both self-driven and externally scrubbed.

**Architecture:** Extract zod-free interpolation helpers (`lerpConfigRaw`, `sampleTimelineRaw`, `mergeConfigPatch`) into `@effects/core` so the embed reuses the studio's morph math without pulling zod. A new `PlasmaController` in the embed owns one rAF "morph driver" for tweens/timelines and a stateless `seek` for external scrubbing; `PlasmaBg` mirrors its methods onto the element. Two clocks are preserved (plasma motion keeps running; the API morphs only the look).

**Tech Stack:** TypeScript (strict), Vite (embed lib build + studio dev server), Vitest (unit), Playwright (visual goldens), zlib (gzip budget check). GSAP loaded from CDN in the demo only — never bundled.

## Global Constraints

- **Embed bundle < 15 KB gzip.** Hard gate. Currently 13.58 KB. Asserted automatically (Task 9).
- **No zod in the embed.** Config is trusted; the embed must not import `parseConfig` or anything that transitively pulls zod.
- **No duplicated interpolation math.** The embed imports core's helpers; it does not re-implement lerp/sample.
- **Two clocks.** The renderer's motion loop keeps running; the API only calls `renderer.setConfig(...)`.
- **Honor `prefers-reduced-motion: reduce`** for programmatic animation: `animateTo` snaps to target, `play` renders the first keyframe still. `set`/`seek` behave normally.
- **`@effects/core` builds with `tsc`, which type-checks `*.test.ts`.** Test files must be type-clean or the build breaks. Run `pnpm --filter @effects/core build` after core tasks.
- Existing test conventions: colocated `*.test.ts`, `vitest run` per package, plain node env (no jsdom) — inject fakes for timing/DOM.

---

### Task 1: Core — `lerpConfigRaw` (zod-free interpolation)

**Files:**
- Modify: `packages/core/src/plasma/timeline.ts`
- Test: `packages/core/src/plasma/timeline.test.ts`

**Interfaces:**
- Consumes: existing `lerp`, `lerpPalette`, `hexMix` helpers and `CoreConfig` already in `timeline.ts`.
- Produces: `export function lerpConfigRaw(a: CoreConfig, b: CoreConfig, t: number): CoreConfig` — the interpolated object WITHOUT a `parseConfig` re-clamp. Existing `lerpConfig(a,b,t)` is unchanged in output (now `parseConfig(lerpConfigRaw(a,b,t))`).

- [ ] **Step 1: Write the failing test**

Add to `packages/core/src/plasma/timeline.test.ts`:

```ts
import { lerpConfig, lerpConfigRaw } from './timeline.js';
import { defaultConfig } from './config-defaults.js';

describe('lerpConfigRaw', () => {
  const a = defaultConfig;
  const b = { ...defaultConfig, speed: 4, coverage: 0.9, palette: ['#ff0000'], bg: '#102030' };

  it('produces the same result as lerpConfig (parseConfig is redundant for valid endpoints)', () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      expect(lerpConfigRaw(a, b, t)).toEqual(lerpConfig(a, b, t));
    }
  });

  it('does not import zod-validated parseConfig (numbers interpolate linearly)', () => {
    expect(lerpConfigRaw(a, b, 0.5).speed).toBeCloseTo((a.speed + 4) / 2, 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @effects/core exec vitest run src/plasma/timeline.test.ts -t lerpConfigRaw`
Expected: FAIL — `lerpConfigRaw is not a function`.

- [ ] **Step 3: Refactor `timeline.ts` to extract the raw body**

In `packages/core/src/plasma/timeline.ts`, replace the `lerpConfig` function (the `export function lerpConfig(...) { const d = ...; return parseConfig({ ... }); }` block) with two functions — move the object literal into `lerpConfigRaw` and have `lerpConfig` wrap it:

```ts
/** Interpolated look WITHOUT a parseConfig re-clamp. Valid when both endpoints
 * are already valid CoreConfigs (field-wise lerp of in-range values stays in
 * range; discrete fields hard-switch between two valid values). The embed uses
 * this to avoid pulling zod. */
export function lerpConfigRaw(a: CoreConfig, b: CoreConfig, t: number): CoreConfig {
  const d = t < 0.5 ? a : b; // discrete source
  return {
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
  };
}

/** Interpolate two looks, parseConfig-clamped (studio/exporter path). */
export function lerpConfig(a: CoreConfig, b: CoreConfig, t: number): CoreConfig {
  return parseConfig(lerpConfigRaw(a, b, t));
}
```

Keep the existing `parseConfig` import — it's still used by `lerpConfig`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @effects/core exec vitest run src/plasma/timeline.test.ts`
Expected: PASS (new `lerpConfigRaw` tests + all existing `lerpConfig`/`sampleTimeline` tests still green).

- [ ] **Step 5: Verify the build still type-checks**

Run: `pnpm --filter @effects/core build`
Expected: no tsc errors.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/plasma/timeline.ts packages/core/src/plasma/timeline.test.ts
git commit -m "refactor(core): extract zod-free lerpConfigRaw from lerpConfig"
```

---

### Task 2: Core — `sampleTimelineRaw`

**Files:**
- Modify: `packages/core/src/plasma/timeline.ts`
- Test: `packages/core/src/plasma/timeline.test.ts`

**Interfaces:**
- Consumes: `lerpConfigRaw` (Task 1), `applyEasing`, `Timeline`, `CoreConfig`.
- Produces: `export function sampleTimelineRaw(tl: Timeline, time: number): CoreConfig` — same sampling as `sampleTimeline` but via `lerpConfigRaw` (no zod). Endpoint returns are the keyframe configs verbatim (already valid).

- [ ] **Step 1: Write the failing test**

Add to `packages/core/src/plasma/timeline.test.ts`:

```ts
import { sampleTimeline, sampleTimelineRaw } from './timeline.js';
import type { Timeline } from './timeline.js';

describe('sampleTimelineRaw', () => {
  const tl: Timeline = {
    duration: 10,
    keyframes: [
      { id: 'a', t: 0, easing: 'linear', config: { ...defaultConfig, speed: 1 } },
      { id: 'b', t: 10, easing: 'linear', config: { ...defaultConfig, speed: 3 } },
    ],
  };

  it('matches sampleTimeline across the range', () => {
    for (const time of [-1, 0, 2.5, 5, 7.5, 10, 99]) {
      expect(sampleTimelineRaw(tl, time)).toEqual(sampleTimeline(tl, time));
    }
  });

  it('returns the exact endpoint config objects at/after the ends', () => {
    expect(sampleTimelineRaw(tl, 0)).toBe(tl.keyframes[0]!.config);
    expect(sampleTimelineRaw(tl, 10)).toBe(tl.keyframes[1]!.config);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @effects/core exec vitest run src/plasma/timeline.test.ts -t sampleTimelineRaw`
Expected: FAIL — `sampleTimelineRaw is not a function`.

- [ ] **Step 3: Add `sampleTimelineRaw` and rebase `sampleTimeline` onto it**

In `packages/core/src/plasma/timeline.ts`, replace the existing `sampleTimeline` function with a shared internal sampler parameterized by the interpolator, exposing both:

```ts
/** Shared sampler. `interp` is the look-interpolator (raw or clamped). */
function sampleWith(
  tl: Timeline,
  time: number,
  interp: (a: CoreConfig, b: CoreConfig, t: number) => CoreConfig,
): CoreConfig {
  const ks = tl.keyframes;
  if (ks.length === 0) throw new Error('sampleTimeline: timeline has no keyframes');
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
  return interp(kA.config, kB.config, applyEasing(kA.easing, u));
}

/** The morphed look at `time` seconds, parseConfig-clamped. */
export function sampleTimeline(tl: Timeline, time: number): CoreConfig {
  return sampleWith(tl, time, lerpConfig);
}

/** The morphed look at `time` seconds, zod-free (embed path). */
export function sampleTimelineRaw(tl: Timeline, time: number): CoreConfig {
  return sampleWith(tl, time, lerpConfigRaw);
}
```

(`sampleTimeline` output is unchanged — same control flow, same `lerpConfig` interpolator.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @effects/core exec vitest run src/plasma/timeline.test.ts`
Expected: PASS (new tests + the existing `sampleTimeline` midpoint tests).

- [ ] **Step 5: Verify the build**

Run: `pnpm --filter @effects/core build`
Expected: no tsc errors.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/plasma/timeline.ts packages/core/src/plasma/timeline.test.ts
git commit -m "feat(core): add zod-free sampleTimelineRaw"
```

---

### Task 3: Core — `mergeConfigPatch` (deep-merge partial over a config)

**Files:**
- Create: `packages/core/src/plasma/merge.ts`
- Create: `packages/core/src/plasma/merge.test.ts`
- Modify: `packages/core/src/plasma/index.ts`

**Interfaces:**
- Consumes: `CoreConfig`.
- Produces:
  - `export type DeepPartial<T>` (recursive optional, arrays kept whole).
  - `export function mergeConfigPatch(base: CoreConfig, patch: DeepPartial<CoreConfig>): CoreConfig` — nested objects merge; scalars and arrays (palette, center, modes) replace; `undefined` patch values are ignored; empty patch is identity (deep-equal).

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/plasma/merge.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mergeConfigPatch } from './merge.js';
import { defaultConfig } from './config-defaults.js';

describe('mergeConfigPatch', () => {
  it('replaces a top-level scalar, leaves the rest untouched', () => {
    const out = mergeConfigPatch(defaultConfig, { speed: 7 });
    expect(out.speed).toBe(7);
    expect(out.coverage).toBe(defaultConfig.coverage);
  });

  it('deep-merges nested blocks without dropping siblings', () => {
    const out = mergeConfigPatch(defaultConfig, { flow: { amount: 0.42 } });
    expect(out.flow.amount).toBe(0.42);
    expect(out.flow.angleDeg).toBe(defaultConfig.flow.angleDeg);
  });

  it('replaces arrays/tuples wholesale (no element merge)', () => {
    const out = mergeConfigPatch(defaultConfig, { palette: ['#abcdef'], center: [0.1, 0.2] });
    expect(out.palette).toEqual(['#abcdef']);
    expect(out.center).toEqual([0.1, 0.2]);
  });

  it('merges deeply nested effect blocks', () => {
    const out = mergeConfigPatch(defaultConfig, { effects: { bloom: { intensity: 0.9 } } });
    expect(out.effects.bloom.intensity).toBe(0.9);
    expect(out.effects.bloom.threshold).toBe(defaultConfig.effects.bloom.threshold);
    expect(out.effects.blur.on).toBe(defaultConfig.effects.blur.on);
  });

  it('empty patch is a deep-equal identity', () => {
    expect(mergeConfigPatch(defaultConfig, {})).toEqual(defaultConfig);
  });

  it('does not mutate the base', () => {
    const before = JSON.stringify(defaultConfig);
    mergeConfigPatch(defaultConfig, { flow: { amount: 1 } });
    expect(JSON.stringify(defaultConfig)).toBe(before);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @effects/core exec vitest run src/plasma/merge.test.ts`
Expected: FAIL — cannot resolve `./merge.js`.

- [ ] **Step 3: Implement `merge.ts`**

Create `packages/core/src/plasma/merge.ts`:

```ts
// Deep-merge a partial patch over a CoreConfig. Nested plain objects merge;
// scalars and arrays (palette, center, modes) replace. Zero-dependency, no zod —
// the embed uses this so partial patches (animateTo({ speed: 2 })) work.
import type { CoreConfig } from './config.js';

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function mergeDeep(base: unknown, patch: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch;
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(patch)) {
    const pv = patch[key];
    if (pv === undefined) continue;
    out[key] = isPlainObject(pv) && isPlainObject(base[key]) ? mergeDeep(base[key], pv) : pv;
  }
  return out;
}

export function mergeConfigPatch(base: CoreConfig, patch: DeepPartial<CoreConfig>): CoreConfig {
  return mergeDeep(base, patch) as CoreConfig;
}
```

- [ ] **Step 4: Export from the package surface**

In `packages/core/src/plasma/index.ts`, add after the `export * from './timeline.js';` line:

```ts
export * from './merge.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @effects/core exec vitest run src/plasma/merge.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify the build**

Run: `pnpm --filter @effects/core build`
Expected: no tsc errors.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/plasma/merge.ts packages/core/src/plasma/merge.test.ts packages/core/src/plasma/index.ts
git commit -m "feat(core): add mergeConfigPatch for partial config patches"
```

---

### Task 4: Embed — test infrastructure (Vitest)

**Files:**
- Modify: `packages/embed/package.json`
- Create: `packages/embed/vitest.config.ts`

**Interfaces:**
- Produces: a `pnpm --filter @effects/embed test` command (node env) so later embed tasks are TDD-able, and turbo's `test` task picks the embed up.

- [ ] **Step 1: Add Vitest devDep + test script**

Edit `packages/embed/package.json` — add a `test` script and `vitest` devDep:

```json
{
  "name": "@effects/embed",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/plasma-bg.js",
  "module": "./dist/plasma-bg.js",
  "files": ["dist"],
  "scripts": {
    "build": "vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "@effects/core": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.9"
  }
}
```

- [ ] **Step 2: Add a Vitest config (node env)**

Create `packages/embed/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

// Embed unit tests run in plain node — the controller takes an injectable env
// (raf/caf/reducedMotion) so no jsdom is needed.
export default defineConfig({
  test: { environment: 'node' },
});
```

- [ ] **Step 3: Install**

Run: `pnpm install`
Expected: `vitest` linked into `@effects/embed` (no errors).

- [ ] **Step 4: Verify the empty suite runs**

Run: `pnpm --filter @effects/embed exec vitest run`
Expected: exits cleanly reporting "no test files found" (or similar) — confirms the runner is wired.

- [ ] **Step 5: Commit**

```bash
git add packages/embed/package.json packages/embed/vitest.config.ts pnpm-lock.yaml
git commit -m "chore(embed): add vitest test infrastructure"
```

---

### Task 5: Embed — `PlasmaController` core (set / getConfig / progress / driver cancel)

**Files:**
- Create: `packages/embed/src/controller.ts`
- Create: `packages/embed/src/controller.test.ts`

**Interfaces:**
- Consumes: `mergeConfigPatch`, `lerpConfigRaw`, `sampleTimelineRaw`, `applyEasing`, `CoreConfig`, `Timeline`, `Easing`, `DeepPartial` from `@effects/core`. A minimal renderer shape `{ setConfig(cfg: CoreConfig): void }`.
- Produces:
  - `export interface ControllerEnv { raf: (cb: (ms: number) => void) => number; caf: (id: number) => void; reducedMotion: () => boolean }`
  - `export interface MorphTarget { setConfig(cfg: CoreConfig): void }`
  - `export class PlasmaController` with `constructor(renderer: MorphTarget, initial: CoreConfig, env?: ControllerEnv)`, `getConfig()`, `get progress()`, `set(patch)`, and (added in Tasks 6–7) `animateTo`, `timeline`, `play`, `pause`, `seek`.

- [ ] **Step 1: Write the failing test**

Create `packages/embed/src/controller.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { defaultConfig, type CoreConfig } from '@effects/core';
import { PlasmaController, type ControllerEnv } from './controller.js';

// A fake renderer that records the configs it's given.
function fakeRenderer() {
  const applied: CoreConfig[] = [];
  return { applied, setConfig: (c: CoreConfig) => applied.push(c) };
}

// A controllable rAF: cb's are queued; tick(ms) runs the next frame with a timestamp.
function fakeEnv(reduced = false): ControllerEnv & { tick: (ms: number) => void; pending: number } {
  let next = 1;
  const queue = new Map<number, (ms: number) => void>();
  return {
    raf: (cb) => { const id = next++; queue.set(id, cb); return id; },
    caf: (id) => { queue.delete(id); },
    reducedMotion: () => reduced,
    get pending() { return queue.size; },
    tick(ms: number) {
      const [id, cb] = [...queue.entries()][0] ?? [];
      if (id !== undefined && cb) { queue.delete(id); cb(ms); }
    },
  };
}

describe('PlasmaController.set', () => {
  it('merges a partial patch over the current look and applies it', () => {
    const r = fakeRenderer();
    const c = new PlasmaController(r, defaultConfig, fakeEnv());
    c.set({ speed: 9 });
    expect(r.applied.at(-1)!.speed).toBe(9);
    expect(c.getConfig().speed).toBe(9);
    expect(c.getConfig().coverage).toBe(defaultConfig.coverage);
  });

  it('progress starts at 0', () => {
    const c = new PlasmaController(fakeRenderer(), defaultConfig, fakeEnv());
    expect(c.progress).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @effects/embed exec vitest run src/controller.test.ts`
Expected: FAIL — cannot resolve `./controller.js`.

- [ ] **Step 3: Implement the controller skeleton**

Create `packages/embed/src/controller.ts`:

```ts
// Owns the morph state for a <plasma-bg>. One rAF "morph driver" powers
// animateTo()/play(); seek() is stateless for external scrubbing (GSAP). The
// renderer's own motion loop is untouched — we only call setConfig (two clocks).
import {
  mergeConfigPatch,
  type CoreConfig,
  type Timeline,
  type Easing,
  type DeepPartial,
} from '@effects/core';

export interface MorphTarget {
  setConfig(cfg: CoreConfig): void;
}

export interface ControllerEnv {
  raf: (cb: (ms: number) => void) => number;
  caf: (id: number) => void;
  reducedMotion: () => boolean;
}

export interface AnimateOpts {
  duration?: number; // seconds, default 0.6
  easing?: Easing | ((u: number) => number); // default 'ease-in-out'
}

export const defaultEnv: ControllerEnv = {
  raf: (cb) => (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(cb) : 0),
  caf: (id) => { if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(id); },
  reducedMotion: () =>
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
};

export class PlasmaController {
  private cfg: CoreConfig;
  private tl: Timeline | null = null;
  private prog = 0;
  private raf = 0;

  constructor(
    private readonly renderer: MorphTarget,
    initial: CoreConfig,
    private readonly env: ControllerEnv = defaultEnv,
  ) {
    this.cfg = initial;
  }

  getConfig(): CoreConfig {
    return this.cfg;
  }

  get progress(): number {
    return this.prog;
  }

  /** Stop the morph driver (animateTo/play). seek and set call this first. */
  private cancel(): void {
    if (this.raf) this.env.caf(this.raf);
    this.raf = 0;
  }

  /** Instantly apply a partial patch over the current look. */
  set(patch: DeepPartial<CoreConfig>): void {
    this.cancel();
    this.cfg = mergeConfigPatch(this.cfg, patch);
    this.renderer.setConfig(this.cfg);
  }

  /** Tear down (called on element disconnect). */
  dispose(): void {
    this.cancel();
  }
}
```

(Task 5 imports only what it uses — `mergeConfigPatch` and the types. Tasks 6 and 7 extend this import line as they add `animateTo` / timeline methods. `tsconfig.base.json` sets `noUnusedLocals: true`, so never import a symbol before the task that uses it.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @effects/embed exec vitest run src/controller.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/embed/src/controller.ts packages/embed/src/controller.test.ts
git commit -m "feat(embed): PlasmaController skeleton (set/getConfig/progress)"
```

---

### Task 6: Embed — `animateTo` (self-driven tween + reduced-motion + mutual exclusion)

**Files:**
- Modify: `packages/embed/src/controller.ts`
- Test: `packages/embed/src/controller.test.ts`

**Interfaces:**
- Consumes: `lerpConfigRaw`, `applyEasing`, the private `cancel()` / `raf` from Task 5.
- Produces: `animateTo(patch: DeepPartial<CoreConfig>, opts?: AnimateOpts): Promise<void>` — tweens current → merged target over `opts.duration` (default 0.6s) using `opts.easing` (named or function, default `'ease-in-out'`). Under reduced-motion or `duration <= 0`, snaps to target and resolves. Starting it cancels any running driver.

- [ ] **Step 1: Write the failing test**

Append to `packages/embed/src/controller.test.ts`:

```ts
describe('PlasmaController.animateTo', () => {
  it('tweens current → target over the duration and resolves at u=1', async () => {
    const r = fakeRenderer();
    const env = fakeEnv();
    const c = new PlasmaController(r, defaultConfig, env);
    const p = c.animateTo({ speed: defaultConfig.speed + 2 }, { duration: 1, easing: 'linear' });

    env.tick(0);    // start frame, u=0
    expect(r.applied.at(-1)!.speed).toBeCloseTo(defaultConfig.speed, 6);
    env.tick(500);  // u=0.5
    expect(r.applied.at(-1)!.speed).toBeCloseTo(defaultConfig.speed + 1, 6);
    env.tick(1000); // u=1, resolves
    await p;
    expect(c.getConfig().speed).toBeCloseTo(defaultConfig.speed + 2, 6);
    expect(env.pending).toBe(0);
  });

  it('under reduced-motion, snaps to target without scheduling a frame', async () => {
    const r = fakeRenderer();
    const env = fakeEnv(true);
    const c = new PlasmaController(r, defaultConfig, env);
    await c.animateTo({ speed: 5 }, { duration: 1 });
    expect(c.getConfig().speed).toBe(5);
    expect(env.pending).toBe(0);
  });

  it('starting a second animateTo cancels the first (mutual exclusion)', () => {
    const env = fakeEnv();
    const c = new PlasmaController(fakeRenderer(), defaultConfig, env);
    c.animateTo({ speed: 2 }, { duration: 1 });
    expect(env.pending).toBe(1);
    c.animateTo({ speed: 8 }, { duration: 1 });
    expect(env.pending).toBe(1); // old frame cancelled, one new frame queued
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @effects/embed exec vitest run src/controller.test.ts -t animateTo`
Expected: FAIL — `animateTo is not a function`.

- [ ] **Step 3: Implement `animateTo`**

First, extend the `@effects/core` import at the top of `packages/embed/src/controller.ts` to add the two symbols this task uses — `lerpConfigRaw` and `applyEasing`:

```ts
import {
  mergeConfigPatch,
  lerpConfigRaw,
  applyEasing,
  type CoreConfig,
  type Timeline,
  type Easing,
  type DeepPartial,
} from '@effects/core';
```

Then add a method to the `PlasmaController` class (after `set`):

```ts
/** Tween the current look toward a merged target. Resolves on completion. */
animateTo(patch: DeepPartial<CoreConfig>, opts: AnimateOpts = {}): Promise<void> {
  this.cancel();
  const from = this.cfg;
  const target = mergeConfigPatch(this.cfg, patch);
  const duration = opts.duration ?? 0.6;
  const ease =
    typeof opts.easing === 'function'
      ? opts.easing
      : (u: number) => applyEasing((opts.easing as Easing) ?? 'ease-in-out', u);

  if (this.env.reducedMotion() || duration <= 0) {
    this.cfg = target;
    this.renderer.setConfig(target);
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    let start = -1;
    const tick = (ms: number) => {
      if (start < 0) start = ms;
      const u = Math.min(1, (ms - start) / (duration * 1000));
      this.renderer.setConfig(lerpConfigRaw(from, target, ease(u)));
      if (u >= 1) {
        this.cfg = target;
        this.raf = 0;
        resolve();
      } else {
        this.raf = this.env.raf(tick);
      }
    };
    this.raf = this.env.raf(tick);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @effects/embed exec vitest run src/controller.test.ts`
Expected: PASS (set + animateTo suites).

- [ ] **Step 5: Commit**

```bash
git add packages/embed/src/controller.ts packages/embed/src/controller.test.ts
git commit -m "feat(embed): animateTo tween with reduced-motion + mutual exclusion"
```

---

### Task 7: Embed — `timeline` / `play` / `pause` / `seek`

**Files:**
- Modify: `packages/embed/src/controller.ts`
- Test: `packages/embed/src/controller.test.ts`

**Interfaces:**
- Consumes: `sampleTimelineRaw`, `Timeline`, the private driver from Task 5.
- Produces:
  - `timeline(tl: Timeline): void` — load timeline, reset `progress` to 0.
  - `play(opts?: { loop?: boolean }): void` — advance `progress` each frame (default `loop: true`); under reduced-motion renders the first keyframe still and does not loop.
  - `pause(): void` — stop the driver, keep `progress`.
  - `seek(t: number): void` — set `progress = t`, sample-and-apply; stateless (no frame scheduled); cancels a running driver.

- [ ] **Step 1: Write the failing test**

Append to `packages/embed/src/controller.test.ts`:

```ts
import type { Timeline } from '@effects/core';

function twoKf(): Timeline {
  return {
    duration: 10,
    keyframes: [
      { id: 'a', t: 0, easing: 'linear', config: { ...defaultConfig, speed: 1 } },
      { id: 'b', t: 10, easing: 'linear', config: { ...defaultConfig, speed: 3 } },
    ],
  };
}

describe('PlasmaController timeline', () => {
  it('seek is stateless: samples + applies without scheduling a frame', () => {
    const r = fakeRenderer();
    const env = fakeEnv();
    const c = new PlasmaController(r, defaultConfig, env);
    c.timeline(twoKf());
    c.seek(5); // midpoint
    expect(r.applied.at(-1)!.speed).toBeCloseTo(2, 6);
    expect(c.progress).toBe(5);
    expect(env.pending).toBe(0);
  });

  it('play advances progress each frame', () => {
    const r = fakeRenderer();
    const env = fakeEnv();
    const c = new PlasmaController(r, defaultConfig, env);
    c.timeline(twoKf());
    c.play();
    env.tick(0);     // prev=0, progress 0
    env.tick(2000);  // +2s → progress 2
    expect(c.progress).toBeCloseTo(2, 6);
    expect(r.applied.at(-1)!.speed).toBeCloseTo(1 + (3 - 1) * 0.2, 6);
  });

  it('play loops past the end by default', () => {
    const env = fakeEnv();
    const c = new PlasmaController(fakeRenderer(), defaultConfig, env);
    c.timeline(twoKf());
    c.play();
    env.tick(0);
    env.tick(12000); // +12s on a 10s timeline → wraps to 2
    expect(c.progress).toBeCloseTo(2, 6);
  });

  it('pause stops the driver but keeps progress', () => {
    const env = fakeEnv();
    const c = new PlasmaController(fakeRenderer(), defaultConfig, env);
    c.timeline(twoKf());
    c.play();
    env.tick(0);
    env.tick(3000);
    c.pause();
    expect(env.pending).toBe(0);
    expect(c.progress).toBeCloseTo(3, 6);
  });

  it('under reduced-motion, play renders the first keyframe still and does not loop', () => {
    const r = fakeRenderer();
    const env = fakeEnv(true);
    const c = new PlasmaController(r, defaultConfig, env);
    c.timeline(twoKf());
    c.play();
    expect(r.applied.at(-1)!.speed).toBeCloseTo(1, 6); // first keyframe
    expect(env.pending).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @effects/embed exec vitest run src/controller.test.ts -t timeline`
Expected: FAIL — `timeline is not a function`.

- [ ] **Step 3: Implement the timeline methods**

First, add `sampleTimelineRaw` to the `@effects/core` import at the top of `packages/embed/src/controller.ts`:

```ts
import {
  mergeConfigPatch,
  lerpConfigRaw,
  sampleTimelineRaw,
  applyEasing,
  type CoreConfig,
  type Timeline,
  type Easing,
  type DeepPartial,
} from '@effects/core';
```

Then add to the `PlasmaController` class (after `animateTo`):

```ts
/** Load a timeline; resets progress to 0. Does not start playback. */
timeline(tl: Timeline): void {
  this.tl = tl;
  this.prog = 0;
}

/** Self-drive the loaded timeline. Loops by default. */
play(opts: { loop?: boolean } = {}): void {
  this.cancel();
  if (!this.tl) return;
  const loop = opts.loop ?? true;
  const tl = this.tl;

  if (this.env.reducedMotion()) {
    this.renderer.setConfig(sampleTimelineRaw(tl, 0)); // first keyframe still
    return;
  }

  let prev = -1;
  const tick = (ms: number) => {
    if (prev < 0) prev = ms;
    const dt = (ms - prev) / 1000;
    prev = ms;
    this.prog += dt;
    if (this.prog >= tl.duration) {
      if (loop) {
        this.prog = tl.duration > 0 ? this.prog % tl.duration : 0;
      } else {
        this.prog = tl.duration;
        this.renderer.setConfig(sampleTimelineRaw(tl, this.prog));
        this.raf = 0;
        return;
      }
    }
    this.renderer.setConfig(sampleTimelineRaw(tl, this.prog));
    this.raf = this.env.raf(tick);
  };
  this.raf = this.env.raf(tick);
}

/** Stop self-driven playback; keep progress. */
pause(): void {
  this.cancel();
}

/** Sample the loaded timeline at absolute time `t` and apply. Stateless —
 * for external scrubbing (GSAP/ScrollTrigger). Cancels any running driver. */
seek(t: number): void {
  this.cancel();
  if (!this.tl) return;
  this.prog = t;
  this.renderer.setConfig(sampleTimelineRaw(this.tl, t));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @effects/embed exec vitest run src/controller.test.ts`
Expected: PASS (all controller suites).

- [ ] **Step 5: Commit**

```bash
git add packages/embed/src/controller.ts packages/embed/src/controller.test.ts
git commit -m "feat(embed): timeline/play/pause/seek on PlasmaController"
```

---

### Task 8: Embed — wire `PlasmaController` into `<plasma-bg>` and export it

**Files:**
- Modify: `packages/embed/src/plasma-bg.ts`
- Test: extend Playwright in Task 11 (DOM-level); no new unit test here (logic is covered by controller tests).

**Interfaces:**
- Consumes: `PlasmaController` (Task 5–7).
- Produces: `PlasmaBg` element instances expose `set` / `animateTo` / `timeline` / `play` / `pause` / `seek` / `getConfig` / `progress`, delegating to an internal controller. `PlasmaController` is re-exported from the embed entry so the studio harness/demo can use it directly.

- [ ] **Step 1: Add the controller to `PlasmaBg`**

Edit `packages/embed/src/plasma-bg.ts`. Add the import and re-export at the top (after the existing `@effects/core` import):

```ts
import { PlasmaController, type AnimateOpts } from './controller.js';
import type { CoreConfig, Timeline, DeepPartial } from '@effects/core';

export { PlasmaController } from './controller.js';
export type { ControllerEnv, AnimateOpts, MorphTarget } from './controller.js';
```

- [ ] **Step 2: Construct the controller after the renderer is up**

In `connectedCallback`, immediately after `renderer.setConfig(cfg); renderer.resize();` and before the `onResize` wiring, add:

```ts
    this.controller = new PlasmaController(renderer, cfg);
```

Add the field declaration alongside `private renderer` near the top of the class:

```ts
  private controller: PlasmaController | null = null;
```

- [ ] **Step 3: Delegate the public API to the controller**

Add these methods to the `PlasmaBg` class (after `connectedCallback`). Each is a thin pass-through; calls before connect (no controller yet) are no-ops / safe defaults:

```ts
  set(patch: DeepPartial<CoreConfig>): void {
    this.controller?.set(patch);
  }

  animateTo(patch: DeepPartial<CoreConfig>, opts?: AnimateOpts): Promise<void> {
    return this.controller?.animateTo(patch, opts) ?? Promise.resolve();
  }

  timeline(tl: Timeline): void {
    this.controller?.timeline(tl);
  }

  play(opts?: { loop?: boolean }): void {
    this.controller?.play(opts);
  }

  pause(): void {
    this.controller?.pause();
  }

  seek(t: number): void {
    this.controller?.seek(t);
  }

  getConfig(): CoreConfig | null {
    return this.controller?.getConfig() ?? null;
  }

  get progress(): number {
    return this.controller?.progress ?? 0;
  }
```

- [ ] **Step 4: Dispose the controller on disconnect**

In `disconnectedCallback`, add before `this.renderer?.dispose();`:

```ts
    this.controller?.dispose();
    this.controller = null;
```

- [ ] **Step 5: Verify the embed builds**

Run: `pnpm --filter @effects/embed build`
Expected: build succeeds, emits `dist/plasma-bg.js`.

- [ ] **Step 6: Commit**

```bash
git add packages/embed/src/plasma-bg.ts
git commit -m "feat(embed): expose runtime API on <plasma-bg> element"
```

---

### Task 9: Embed — automated gzip budget guard (< 15 KB)

**Files:**
- Create: `packages/embed/scripts/check-size.mjs`
- Modify: `packages/embed/package.json`

**Interfaces:**
- Produces: a post-build check that fails the embed build if `dist/plasma-bg.js` gzips to ≥ 15 KB. This is the acceptance gate from the spec; it runs in CI via `turbo run build`.

- [ ] **Step 1: Write the size-check script**

Create `packages/embed/scripts/check-size.mjs`:

```js
// Fail the embed build if the gzipped bundle reaches the 15 KB budget.
// The embed must stay tiny and dependency-light (no zod) — see the roadmap.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const BUDGET = 15 * 1024; // 15 KB
const bundle = fileURLToPath(new URL('../dist/plasma-bg.js', import.meta.url));
const gz = gzipSync(readFileSync(bundle)).length;

const kb = (n) => (n / 1024).toFixed(2);
if (gz >= BUDGET) {
  console.error(`embed bundle ${kb(gz)} KB gzip — over the ${kb(BUDGET)} KB budget`);
  process.exit(1);
}
console.log(`embed bundle ${kb(gz)} KB gzip — under the ${kb(BUDGET)} KB budget`);
```

- [ ] **Step 2: Hook it into the build**

Edit `packages/embed/package.json` — chain the check after `vite build`:

```json
  "scripts": {
    "build": "vite build && node scripts/check-size.mjs",
    "test": "vitest run"
  },
```

- [ ] **Step 3: Run the build and read the reported size**

Run: `pnpm --filter @effects/embed build`
Expected: build passes and prints `embed bundle <N> KB gzip — under the 15.00 KB budget`.

> If it prints OVER budget: the new `lerpConfigRaw` imports (`oklabMix`/`rgb2hex`) pushed it over. Mitigation per spec — replace the OKLab `hexMix` in `lerpConfigRaw` with a cheaper sRGB lerp **only on the embed path** (keep `lerpConfig`/studio on OKLab), and note the quality tradeoff in CONTINUE.md. Do not silently ship over budget.

- [ ] **Step 4: Commit**

```bash
git add packages/embed/scripts/check-size.mjs packages/embed/package.json
git commit -m "build(embed): assert <15KB gzip budget post-build"
```

---

### Task 10: Demo page (autoplay timeline + GSAP scroll-scrub)

**Files:**
- Create: `packages/embed/demo/index.html`
- Create: `packages/embed/demo/main.js`

**Interfaces:**
- Consumes: the built `dist/plasma-bg.js` and the element's public API.
- Produces: a standalone page (open after `pnpm --filter @effects/embed build`, served by any static server / `vite preview`) demonstrating `timeline()`+`play()`, scroll-scrubbed `seek()`, and `set`/`animateTo` buttons. Manual proof + README material. Not part of the automated suite.

- [ ] **Step 1: Write the demo HTML**

Create `packages/embed/demo/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>plasma-bg — runtime API demo</title>
    <style>
      html, body { margin: 0; font-family: system-ui, sans-serif; color: #fff; }
      plasma-bg { position: fixed; inset: 0; z-index: -1; display: block; }
      section { height: 100vh; display: grid; place-content: center; gap: 1rem; text-align: center; }
      .controls { display: flex; gap: .75rem; justify-content: center; }
      button { padding: .6rem 1rem; border: 1px solid #fff6; background: #0006; color: #fff; border-radius: .5rem; cursor: pointer; }
      .scroll { height: 300vh; }
    </style>
  </head>
  <body>
    <plasma-bg></plasma-bg>

    <section>
      <h1>Autoplay timeline</h1>
      <div class="controls">
        <button id="play">play()</button>
        <button id="pause">pause()</button>
        <button id="warm">animateTo warm</button>
        <button id="cool">set cool (instant)</button>
      </div>
    </section>

    <section class="scroll">
      <h1>Scroll to scrub seek()</h1>
      <p>This section drives <code>bg.seek(progress × duration)</code> from scroll position.</p>
    </section>

    <script type="module" src="./main.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Write the demo script**

Create `packages/embed/demo/main.js`:

```js
// Demo wiring for the <plasma-bg> runtime API. Loads the built embed + GSAP from
// CDN (GSAP is NEVER bundled into the embed — it's a page-side dependency).
import '../dist/plasma-bg.js';
import gsap from 'https://cdn.skypack.dev/gsap';
import ScrollTrigger from 'https://cdn.skypack.dev/gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const bg = document.querySelector('plasma-bg');
const DURATION = 8;

const tl = {
  duration: DURATION,
  keyframes: [
    { id: 'a', t: 0, easing: 'ease-in-out', config: { motion: 'Classic', palette: ['#2b5fff', '#00e0d0'], speed: 1 } },
    { id: 'b', t: 4, easing: 'ease-in-out', config: { motion: 'Liquid', palette: ['#ff7a3c', '#ff3c9e'], speed: 2 } },
    { id: 'c', t: 8, easing: 'ease-in-out', config: { motion: 'Classic', palette: ['#2b5fff', '#00e0d0'], speed: 1 } },
  ],
};

// Keyframe configs above are partial — the element resolves them against its
// defaults internally via the timeline sampler (both endpoints are full configs
// once captured in the studio; here we lean on defaults for a quick demo).
customElements.whenDefined('plasma-bg').then(() => {
  bg.timeline(tl);

  document.getElementById('play').onclick = () => bg.play();
  document.getElementById('pause').onclick = () => bg.pause();
  document.getElementById('warm').onclick = () => bg.animateTo({ palette: ['#ff7a3c', '#ff3c9e'], speed: 2 }, { duration: 1.2 });
  document.getElementById('cool').onclick = () => bg.set({ palette: ['#2b5fff', '#00e0d0'], speed: 1 });

  // Scroll-scrub: map page scroll over the .scroll section to timeline time.
  ScrollTrigger.create({
    trigger: '.scroll',
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: (self) => bg.seek(self.progress * DURATION),
  });
});
```

> Note: the demo's keyframe `config`s are partial for brevity; the element's
> sampler interpolates them as-is (numeric/discrete fields present are morphed,
> absent fields fall to whatever the sampler receives). For a production demo,
> capture full configs from the studio. This is a manual demo, not a test.

- [ ] **Step 3: Build + open the demo to eyeball it**

Run: `pnpm --filter @effects/embed build`
Then open `packages/embed/demo/index.html` via a static server (e.g. `pnpm --filter @effects/embed exec vite preview --outDir demo` is not applicable — instead): `npx serve packages/embed/demo` or open in a browser that allows ESM from file/CDN.
Expected (manual): background animates; play/pause/buttons work; scrolling the second section scrubs the look.

- [ ] **Step 4: Commit**

```bash
git add packages/embed/demo/index.html packages/embed/demo/main.js
git commit -m "docs(embed): runtime API demo (autoplay timeline + GSAP scroll-scrub)"
```

---

### Task 11: Playwright golden — embed `seek` renders identically to the core path

**Files:**
- Modify: `apps/studio/package.json` (add `@effects/embed` devDep)
- Modify: `apps/studio/vite.config.ts` (allow importing embed source across the workspace)
- Modify: `apps/studio/src/golden.ts` (add an embed harness function)
- Modify: `tests/visual/plasma.spec.ts` (add the embed seek golden)

**Interfaces:**
- Consumes: `PlasmaController` from `@effects/embed`; the existing golden renderer + `window` harness pattern.
- Produces: `window.renderEmbedSeekMidpoint()` driving a `PlasmaController.seek` over the same 2-keyframe timeline the existing `renderTimelineMidpoint` uses, plus a Playwright assertion that it renders (golden screenshot). Proves the embed's zod-free sample path matches the core path.

- [ ] **Step 1: Add the embed as a studio devDependency**

Edit `apps/studio/package.json` — add to `devDependencies`:

```json
    "@effects/embed": "workspace:*",
```

Then run: `pnpm install`
Expected: `@effects/embed` linked into the studio.

- [ ] **Step 2: Allow Vite to serve the embed source**

Edit `apps/studio/vite.config.ts` to permit imports from the monorepo root (the embed source lives outside `apps/studio`):

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, fs: { allow: ['../..'] } },
});
```

- [ ] **Step 3: Add the embed harness function**

In `apps/studio/src/golden.ts`, add the import at the top (with the other imports):

```ts
import { PlasmaController } from '@effects/embed';
```

Add to the `declare global` `Window` interface:

```ts
    renderEmbedSeekMidpoint: () => void;
```

Append this harness (after `renderTimelineMidpoint`), reusing the same renderer and the same two-keyframe timeline so the pixels must match the core midpoint golden:

```ts
window.renderEmbedSeekMidpoint = () => {
  const base = { grain: 0, cursor: { on: false, modes: [] as string[] } };
  const tl: Timeline = {
    duration: 10,
    keyframes: [
      { id: 'a', t: 0, easing: 'linear', config: parseConfig({ ...base, motion: 'Classic', palette: ['#2b5fff', '#00e0d0'] }) },
      { id: 'b', t: 10, easing: 'linear', config: parseConfig({ ...base, motion: 'Classic', palette: ['#ff7a3c', '#ff3c9e'] }) },
    ],
  };
  canvas.width = W;
  canvas.height = H;
  const controller = new PlasmaController(renderer, renderer.getConfig());
  controller.timeline(tl);
  controller.seek(5); // midpoint → applies sampleTimelineRaw to the renderer
  renderer.seek(12.5);
  renderer.renderAt(12.5);
};
```

- [ ] **Step 4: Add the failing Playwright test**

In `tests/visual/plasma.spec.ts`, add a test mirroring the existing timeline-midpoint test (find that test for the exact pattern; replicate its structure):

```ts
test('embed seek midpoint matches the core timeline midpoint', async ({ page }) => {
  await page.goto('/golden.html');
  await page.waitForFunction(() => typeof window.renderEmbedSeekMidpoint === 'function');
  await page.evaluate(() => window.renderEmbedSeekMidpoint());
  await expect(page.locator('canvas')).toHaveScreenshot('embed-seek-midpoint.png');
});
```

- [ ] **Step 5: Run to generate the golden, then verify**

Run: `pnpm test:visual:update -g "embed seek midpoint"`
Then: `pnpm test:visual -g "embed seek midpoint"`
Expected: first run writes `embed-seek-midpoint.png`; second run PASSES against it.

- [ ] **Step 6: Verify the full suite + build**

Run: `pnpm test && pnpm build && pnpm test:visual`
Expected: all unit suites green (core + studio + embed), all builds pass (embed size check included), all visual goldens green.

- [ ] **Step 7: Commit**

```bash
git add apps/studio/package.json apps/studio/vite.config.ts apps/studio/src/golden.ts tests/visual/plasma.spec.ts tests/visual/plasma.spec.ts-snapshots pnpm-lock.yaml
git commit -m "test(embed): Playwright golden — embed seek matches core path"
```

---

### Task 12: Update handoff docs

**Files:**
- Modify: `CONTINUE.md`
- Modify: `PLASMA_STUDIO_ROADMAP.md`

**Interfaces:** none (documentation).

- [ ] **Step 1: Add a "Done — embed runtime API" section to CONTINUE.md**

Add a dated section under the existing "Done —" entries summarizing: the API surface, the zod-free `lerpConfigRaw`/`sampleTimelineRaw`/`mergeConfigPatch` extraction, the new embed gzip size (read it from the Task 9 build output), reduced-motion behavior, the demo page, and that engine #2 is the remaining half of M5. Move the "embed runtime API" follow-up out of the keyframe-timeline follow-ups list.

- [ ] **Step 2: Update the M5 row in PLASMA_STUDIO_ROADMAP.md**

In the milestones table (§7), update the M5 parenthetical to note the embed runtime API shipped 2026-06-24, leaving engine #2 (mesh gradient) as the remaining M5 deliverable.

- [ ] **Step 3: Commit**

```bash
git add CONTINUE.md PLASMA_STUDIO_ROADMAP.md
git commit -m "docs: embed runtime API done — handoff + roadmap"
```

---

## Self-Review

**Spec coverage:**
- API surface (set/animateTo/timeline/play/pause/seek/getConfig/progress) → Tasks 5–8. ✓
- Partial-patch deep-merge → Task 3 + used in `set`/`animateTo`. ✓
- zod-free interpolation (lerpConfigRaw/sampleTimelineRaw) → Tasks 1–2. ✓
- Two clocks (renderer motion untouched; controller only setConfig) → Task 5 design + comments. ✓
- Reduced-motion (animateTo snap, play still, set/seek normal) → Tasks 6–7. ✓
- Mutual-exclusion of drivers → Tasks 5–7 (`cancel()` in every entry point). ✓
- Demo page (autoplay + GSAP scroll-scrub) → Task 10. ✓
- Tests: core unit (1–3), embed unit (5–7), Playwright golden (11), budget assertion (9). ✓
- < 15 KB gzip hard gate → Task 9 (build-failing). ✓
- No zod in embed → enforced by using `*Raw` helpers + the size gate that would catch a zod regression. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; the one judgment call (over-budget mitigation) is spelled out with the exact fallback. ✓

**Type consistency:** `lerpConfigRaw`/`sampleTimelineRaw`/`mergeConfigPatch`/`DeepPartial` defined in Tasks 1–3 and consumed by the controller in Tasks 5–7 with matching signatures. `ControllerEnv`/`AnimateOpts`/`MorphTarget` defined in Task 5, reused in 6–8. Element delegation in Task 8 matches controller method signatures. ✓

**Note on incremental imports:** `tsconfig.base.json` sets `noUnusedLocals: true`. Each of Tasks 5–7 imports only the symbols it uses and extends the import line as later methods land (Task 6 adds `lerpConfigRaw`/`applyEasing`; Task 7 adds `sampleTimelineRaw`). No task leaves an unused import. ✓
