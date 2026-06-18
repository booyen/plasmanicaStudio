# Effects Studio Migration (M0 → M1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the single-file `plasma_studio (4).html` into a pnpm monorepo with a framework-free WebGL engine core and a React/shadcn studio shell at feature parity, with an artboard/stage canvas (zoom + pan) and left/right panels.

**Architecture:** `packages/core` holds a zero-dependency TS engine (raw WebGL1, GLSL extracted *verbatim* from the HTML) exposing a `PlasmaRenderer` class driven by a single zod-validated config object. `apps/studio` is a Vite + React + shadcn app: a zustand store holds the config, the renderer subscribes outside React (no per-frame re-render), and the canvas lives on an infinite pan/zoom stage. Exporters (png/video/embed) are browser-only modules in core.

**Tech Stack:** pnpm workspaces + Turborepo, TypeScript strict, Vite, React 18, Tailwind v4 + shadcn/ui + lucide-react, zustand + zod, Playwright (visual goldens). WebGL1 first (matches legacy); WebGL2 is a later milestone.

## Global Constraints

- **Never retype GLSL** — extract programmatically from `plasma_studio (4).html`. Transcription bugs are invisible until render.
- `packages/core` has **zero React/Next dependencies** — it must also power the embed.
- WebGL1 semantics preserved exactly (gotchas §4): GLSL declaration order (`asp()` after `noise/fbm`); array uniform location is `u_cm[0]`; flowmap sampler is `u_fmap`; flowmap textures LINEAR-filtered; `scale = 100/valuePct` (inverted); speed change rescales `tAccum *= old/new`; cursor color-mode order contrast→light→spotlight.
- Renderer core stays React-free; React only mounts/unmounts it; `dispose()` idempotent (StrictMode double-mount).
- Legacy `plasma_studio (4).html` kept as reference until parity verified, then deletable.
- The video exporter carries the **already-fixed two-mode logic** (Continuous default + Seamless short boundary crossfade) — port it, do not regress to the full-duration crossfade.
- Canvas UX = artboard/stage on infinite canvas: fixed export-size frame (16:9 / 1:1 / 9:16) that pans + zooms.

---

### Task 0: Monorepo scaffold

**Files:**
- Create: `package.json` (root, `private`, workspaces), `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.gitignore`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/index.ts`
- Create: `apps/studio/package.json`, `apps/studio/tsconfig.json`, `apps/studio/vite.config.ts`, `apps/studio/index.html`, `apps/studio/src/main.tsx`, `apps/studio/src/App.tsx`

**Interfaces:**
- Produces: workspace packages `@effects/core` and `studio`; `pnpm -w install` succeeds; `pnpm --filter studio dev` serves a blank app.

- [ ] **Step 1:** `git init` (project is not yet a repo) so work is tracked.
- [ ] **Step 2:** Write root `package.json` + `pnpm-workspace.yaml` (`packages: ['packages/*','apps/*']`) + `turbo.json` (pipeline: `dev`, `build`, `test`) + `tsconfig.base.json` (strict, `moduleResolution: bundler`).
- [ ] **Step 3:** Scaffold `packages/core` (no deps; `zod` as the only runtime dep, kept out of the embed path) and `apps/studio` (Vite React TS).
- [ ] **Step 4:** Run `pnpm install`; expected: lockfile created, no errors.
- [ ] **Step 5:** Run `pnpm --filter studio dev` and confirm a blank page serves on localhost.
- [ ] **Step 6:** Commit `chore: scaffold pnpm monorepo (core + studio)`.

---

### Task 1: GLSL + constants extraction (the critical, no-retype task)

**Files:**
- Create: `scripts/extract-glsl.mjs` (reads the HTML, pulls the template-literal blocks verbatim, emits TS)
- Create: `packages/core/src/plasma/shaders.ts` (generated: `VERT`, `FLOW_FRAG`, `PRE_A`, `PRE_B`, `MAIN`, `GRAD_MAIN`, `FIELDS`, `MATERIALS`, name arrays, `buildFrag()`)
- Create: `packages/core/src/plasma/data.ts` (generated: `GRADIENTS`, `THEMES`, `NUMCFG`, shape list)

**Interfaces:**
- Produces: `buildFrag(fieldIdx, matIdx)`, `FIELD_NAMES`, `MATERIAL_NAMES`, `SHAPE_NAMES`, `GRADIENTS`, `THEMES` — all byte-identical GLSL/data to the legacy file.

- [ ] **Step 1:** Write `extract-glsl.mjs` that locates each `const NAME=` backtick block in the HTML and the `FIELDS`/`MATERIALS`/`GRADIENTS`/`THEMES` array/object literals, and writes them into `shaders.ts`/`data.ts` as exported consts — **copying the string contents byte-for-byte** (no manual edits).
- [ ] **Step 2:** Run the script; expected: `shaders.ts` + `data.ts` written.
- [ ] **Step 3:** Verification test `packages/core/src/plasma/shaders.test.ts`: assert `FIELDS.length`/`MATERIALS.length` match legacy counts (12 fields incl. ramps, 14 materials) and that `buildFrag(0,0)` contains `PRE_A` then a `plasma(` then `PRE_B` then `effect(` then `void main`. Run with vitest; expected PASS.
- [ ] **Step 4:** Commit `feat(core): extract GLSL + data verbatim from legacy HTML`.

---

### Task 2: Config schema (the P0 refactor — single source of truth)

**Files:**
- Create: `packages/core/src/plasma/config.ts` (zod `PlasmaConfig`, `defaultConfig`, `CoreConfig` type)
- Test: `packages/core/src/plasma/config.test.ts`

**Interfaces:**
- Consumes: `FIELD_NAMES`, `MATERIAL_NAMES`, `SHAPE_NAMES` (Task 1).
- Produces: `PlasmaConfig` (zod), `defaultConfig: CoreConfig`, `parseConfig(unknown): CoreConfig` (validates + clamps).

- [ ] **Step 1:** Write failing test: `parseConfig(defaultConfig)` round-trips; `parseConfig({})` throws; out-of-range numeric is clamped/rejected per schema.
- [ ] **Step 2:** Run test; expected FAIL (module missing).
- [ ] **Step 3:** Implement `config.ts` per roadmap §5.2 schema (version literal 1; motion/material/shape enums; palette hex[1..8]; bg; speed/scalePct/swirl/turbulence/coverage/contrast/visibility/gravity/grain/rotateDeg/detail; flow{angleDeg,amount}; center tuple; cursor{on,modes[],strength,size,trail,turbulence,lag}). Defaults transcribed from the legacy initial slider values.
- [ ] **Step 4:** Run test; expected PASS.
- [ ] **Step 5:** Commit `feat(core): zod config schema + defaults`.

---

### Task 3: PlasmaRenderer port (engine core renders at parity)

**Files:**
- Create: `packages/core/src/plasma/renderer.ts` (`PlasmaRenderer` class)
- Create: `packages/core/src/plasma/gl.ts` (program/FBO helpers ported from HTML)
- Test: `packages/core/src/plasma/renderer.test.ts` (smoke: constructs against a mock/again real canvas in Playwright later)

**Interfaces:**
- Consumes: `buildFrag`, `PlasmaConfig`, `defaultConfig`.
- Produces: `new PlasmaRenderer(canvas)`, `.setConfig(cfg)` (diffs → recompile only when motion/material/shape change, else uniforms only), `.start()/.stop()/.seek(t)`, `.renderAt(t)`, `.dispose()` (idempotent), pointer handling internal (owns lag/velocity/flowmap ping-pong).

- [x] **Step 1:** Port GL setup, 256×256 RGBA8 ping-pong flowmap FBO (LINEAR filter), `FLOW_FRAG` stamp/decay pass, `setUniforms`, `recompile`, `renderAt`, the rAF loop, adaptive render scale, dirty-flag, DPR≤2 — all from the HTML, preserving §4 gotchas.
- [x] **Step 2:** Port the `asp()` coordinate pipeline + speed-change `tAccum` rescale + center-handle/gravity semantics (data only; UI later).
- [x] **Step 3:** `dispose()` deletes programs/textures/FBOs; calling twice is safe.
- [x] **Step 4:** vitest smoke test (no real GL): importing the module and constructing with a stub that throws on `getContext` fails gracefully; real render verified in Task 8 goldens.
- [x] **Step 5:** Commit `feat(core): PlasmaRenderer class at WebGL1 parity`.

---

### Task 4: React wrapper + studio renders at parity (M0 done)

**Files:**
- Create: `packages/react/package.json`, `packages/react/src/PlasmaCanvas.tsx`
- Modify: `apps/studio/src/App.tsx` (mount full-bleed canvas with defaultConfig)
- Create: `apps/studio/src/stores/config.ts` (zustand store of `CoreConfig`)

**Interfaces:**
- Consumes: `PlasmaRenderer`, `defaultConfig`.
- Produces: `<PlasmaCanvas config? />` (renderer in `useRef`, created in `useEffect`, disposed on unmount); `useConfigStore` with `set(path, value)` transient updates; renderer subscribes via `store.subscribe` (no per-frame React render). Store ALSO holds `locks: Record<string, boolean>` (lock keys = group keys like `color`/`motion` and param paths like `cursor.lag`) plus `toggleLock(key)` and `isLocked(path)` — consumed by Task 6b.

- [x] **Step 1:** Implement `PlasmaCanvas` — create renderer in effect, `setConfig` on store change via `subscribe`, `dispose` on cleanup.
- [x] **Step 2:** Studio `App.tsx` renders `<PlasmaCanvas/>` full-bleed; confirm the default plasma animates identically to legacy (side-by-side).
- [x] **Step 3:** Commit `feat(studio): live canvas at parity via core + zustand`. **← M0 complete.**

---

### Task 5: Artboard / stage canvas (zoom + pan)

**Files:**
- Create: `apps/studio/src/canvas/Stage.tsx` (infinite canvas viewport: pan with space-drag/middle-drag, zoom to cursor with wheel, fit/100% controls)
- Create: `apps/studio/src/canvas/useViewport.ts` (pan/zoom transform state)
- Modify: `apps/studio/src/App.tsx`

**Interfaces:**
- Produces: a stage frame sized to the selected export aspect (16:9 / 1:1 / 9:16 / custom) centered on an infinite canvas; the `PlasmaCanvas` renders inside the frame; viewport transform (pan x/y, zoom) applied via CSS transform on the frame wrapper, canvas backing-store sized to frame, not viewport.

- [x] **Step 1:** `useViewport` — `{x,y,zoom}`, wheel-zoom anchored at cursor, drag-pan, `fit()` and `reset()`.
- [x] **Step 2:** `Stage` renders a centered frame (aspect from store) with the canvas inside; checkerboard/dim backdrop around it.
- [x] **Step 3:** Aspect selector updates frame + canvas backing size; renderer `resize()` called.
- [x] **Step 4:** Commit `feat(studio): artboard stage with zoom/pan`.

---

### Task 6: Left + right panels wired to the store

**Files:**
- Create: `apps/studio/src/panels/LeftPanel.tsx` (engine picker [plasma only now], presets/vibes, gradient presets)
- Create: `apps/studio/src/panels/RightPanel.tsx` (properties: motion/material/shape tabs, sliders, color, cursor multi-select, center handle)
- Create: `apps/studio/src/panels/controls/*` (shadcn Slider with editable value box + center tick; tab chips; multi-select chips) — porting legacy CSS tokens into Tailwind
- Create: `apps/studio/src/lib/themes.ts` (re-export `THEMES`/`GRADIENTS`/palette + harmony generator from core)

**Interfaces:**
- Consumes: `useConfigStore`, `FIELD_NAMES`/`MATERIAL_NAMES`/`SHAPE_NAMES`, `THEMES`, `GRADIENTS`.
- Produces: every legacy control, writing straight to the store (slider drag → store → renderer subscribe, no React re-render per drag).

- [x] **Step 1:** Build the `Slider` control (editable value box, center tick, inverted-scale awareness) and chip/tab primitives with shadcn + Tailwind, matching legacy look.
- [x] **Step 2:** RightPanel: motion/material/shape tabs + all sliders (speed, detail/busyness, swirl, turbulence, coverage, contrast, visibility, gravity, grain, rotate, scale) + color (palette, bg hex, harmony, gradient presets) + cursor (on, multi-select modes, strength/size/trail/turbulence/lag) + draggable center handle on the stage.
- [x] **Step 3:** LeftPanel: 8 theme "vibes", surprise-me (Space), engine list (plasma).
- [x] **Step 4:** Hide-UI (H) and keyboard shortcuts.
- [x] **Step 5:** Commit `feat(studio): left/right panels at control parity`.

---

### Task 6b: Lock-and-randomize (surprise-me respects locks)

**Files:**
- Create: `packages/core/src/plasma/randomize.ts` (`LOCK_GROUPS`, `pathIsLocked`, `randomizeConfig`)
- Test: `packages/core/src/plasma/randomize.test.ts`
- Modify: `apps/studio/src/panels/RightPanel.tsx` + `LeftPanel.tsx` (group padlocks + expand-to-per-param; surprise-me button)

**Interfaces:**
- Consumes: `CoreConfig`, `THEMES`, `defaultConfig`, store `locks`.
- Produces:
  - `LOCK_GROUPS: { key: string; label: string; paths: string[] }[]` — Color (`palette`,`bg`), Motion (`motion`,`speed`,`swirl`,`detail`), Material (`material`), Shape (`shape`,`center`,`rotateDeg`), Pattern/Flow (`turbulence`,`flow`,`coverage`,`contrast`,`visibility`,`grain`,`gravity`), Cursor (`cursor`).
  - `pathIsLocked(path: string, locks: Record<string, boolean>): boolean` — true if the path's own key OR its containing group key is locked.
  - `randomizeConfig(current: CoreConfig, locks: Record<string, boolean>): CoreConfig` — generate a candidate (random THEME applied over defaults), then **restore every locked path from `current`**, then `parseConfig` the result. Unlocked → re-rolled; locked → preserved.

- [ ] **Step 1:** Write failing test: with `{ color: true }` locked, `randomizeConfig` keeps `palette`+`bg` identical to current but changes at least one unlocked field across N rolls; with ALL groups locked, output deep-equals current.
- [ ] **Step 2:** Run test; expected FAIL (module missing).
- [ ] **Step 3:** Implement `randomize.ts` (group map + path-restore via a small get/set-by-path helper).
- [ ] **Step 4:** Run test; expected PASS.
- [ ] **Step 5:** UI — group padlock chips on each panel section, a disclosure (▸) to reveal per-param padlocks, and a 🎲 Surprise-me button (Space shortcut) calling `randomizeConfig(config, locks)` → store.
- [ ] **Step 6:** Commit `feat(studio): lock-and-randomize (group locks + per-param expand)`.

---

### Task 7: Exporters (png, video two-mode, embed)

**Files:**
- Create: `packages/core/src/exporters/png.ts`, `packages/core/src/exporters/video.ts`, `packages/core/src/exporters/embed.ts`
- Create: `packages/embed/package.json`, `packages/embed/src/plasma-bg.ts` (`<plasma-bg>` custom element, no React, target <15KB gz)
- Modify: studio panels to call exporters

**Interfaces:**
- Produces: `exportPng(renderer, w, h): Promise<Blob>`; `exportVideo(renderer, {durationS, mode:'cont'|'loop', quality}): Promise<Blob>` carrying the fixed crossfade logic; `buildEmbed(config): string` consuming `packages/embed` (replaces the string-built drift-prone snippet).

- [ ] **Step 1:** Port PNG exporter (offscreen resize → toBlob).
- [ ] **Step 2:** Port video exporter **with the already-fixed two-mode logic** (Continuous straight; Seamless final-`B` smoothstep crossfade, `B=min(0.7,0.25*L)`); MediaRecorder for now (WebCodecs is M4).
- [ ] **Step 3:** `packages/embed` custom element wrapping core; `buildEmbed` emits `<script>`+`<plasma-bg config>`; verify gz size budget.
- [ ] **Step 4:** Commit `feat: exporters (png, two-mode video, embed package)`.

---

### Task 8: Playwright visual goldens (verification backbone)

**Files:**
- Create: `tests/visual/plasma.spec.ts`, `playwright.config.ts`
- Create: `tests/visual/goldens/*` (committed baselines)

**Interfaces:**
- Produces: a goldens grid over (motion × material × shape) samples + scripted cursor moves on the flowmap; deterministic renderer (fixed seed/time, grain masked), per-pixel tolerance + SSIM threshold, pinned headless GPU (SwiftShader) to avoid cross-machine flakiness.

- [ ] **Step 1:** `playwright.config.ts` with a single pinned headless Chromium/SwiftShader project and screenshot tolerance.
- [ ] **Step 2:** Spec renders each (motion×material×shape) sample at a fixed `seek(t)` with grain=0, captures the stage frame, compares to golden.
- [ ] **Step 3:** Generate baselines from the parity build; commit them.
- [ ] **Step 4:** Commit `test: playwright visual goldens for plasma engine`.

---

### Task 9: Share links + parity sign-off

**Files:**
- Create: `apps/studio/src/share.ts` (lz-string compress config → `/#s=…`, zod-validate on load)
- Modify: `apps/studio/src/App.tsx` (restore from hash on mount)

**Interfaces:**
- Produces: `encodeShare(cfg): string`, `decodeShare(hash): CoreConfig` (zod-validated); hash route works on static hosting.

- [ ] **Step 1:** Implement encode/decode with lz-string + zod validation + clamp.
- [ ] **Step 2:** On mount, if `#s=` present, restore config into the store.
- [ ] **Step 3:** Parity checklist pass: every legacy feature works; config round-trips; goldens green → legacy HTML deletable.
- [ ] **Step 4:** Commit `feat(studio): share links + M1 parity sign-off`.

---

## Self-Review notes
- Spec coverage: roadmap §5 port order maps to Tasks 0–9; §6 engine-abstraction interface is introduced lightly in Task 4's `PlasmaCanvas`/store but the full `EffectEngine<C>` registry is deferred to the M5 second-engine plan (noted, not a gap for M1 parity).
- The video two-mode fix is pinned in Global Constraints + Task 7 so the migration cannot regress it.
- WebGL2 (roadmap §6.1) intentionally deferred — M1 preserves WebGL1 parity to keep the port byte-faithful; WebGL2 is its own milestone plan.
