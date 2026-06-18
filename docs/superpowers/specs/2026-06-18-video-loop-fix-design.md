# Video Engine Fix — Design Spec

**Date:** 2026-06-18
**Scope:** Surgical fix to the seamless-loop video exporter in `plasma_studio (4).html`.
**Status:** Approved, ready to implement.

## Problem

The "save loop video" exporter cross-blends **two full playheads across the entire
duration** (`renderAt(tA)` over `renderAt(tA−L)`, alpha ramping `0→1` over the whole clip).
For most of the clip you see two different animation frames composited on top of each
other → constant **double-exposure / ghosting**. There is also no option to export a
plain continuous clip, and no genuinely seamless loop.

## Root cause (honest)

A mathematically perfect, zero-ghost seamless loop is **not achievable** for these shaders
as-built. Each field sums sines of **incommensurate frequencies** (1.0, 0.7, 0.04, 0.03…)
plus **linear flow/rotation drift** (`uv += u_flow * t`, line 305). The image at `t` and
`t+L` never exactly matches, so any single-clock loop has a seam. The current code hides the
seam with a full-duration crossfade — trading the seam for permanent ghosting.

True periodic looping needs frequency-quantized time / per-field shader rewrites. That belongs
in the **migration's animation runtime (roadmap §6.3)**, NOT this hotfix.

## Solution — two modes via a toggle in the Export panel

### Continuous (default)
Record the live animation straight: `renderAt(τ)`, one draw per frame, no crossfade.
Perfectly crisp, zero ghosting. UI surfaces the honest caveat: a visible jump if the file is
set to loop.

### Seamless loop
Replace the full-duration crossfade with a **short boundary crossfade**:
- For virtual time `τ ∈ [0, L−B)`: draw `F(τ)` only (crisp body).
- For `τ ∈ [L−B, L)`: blend `F(τ)` (fading out) with `F(τ−L)` (fading in), weight
  `w = smoothstep((τ−(L−B))/B)` on `F(τ−L)`.
- As `τ → L⁻`, output → `F(0⁻) ≈ F(0)`; the video's first frame is `F(0)` → seamless wrap.
- Only the final `B` seconds contain any blend; ~90%+ of the clip is crisp.

`B` = fixed **0.7s**, clamped to ≤ 25% of duration. A one-line UI note explains the seam
mechanism (per gotcha #14: honest notes when approximating).

## Robustness fixes (in-scope, while here)
- Render exactly up to `τ = L` and stop on a clean boundary (no overshoot/undershoot).
- Mode + duration/quality controls grouped in the existing Export panel, current styling.
- Filename/status reflect mode (`_loop` vs `_cont`).

## Explicitly out of scope
- WebCodecs / MP4 deterministic "render-faster-than-realtime" export — already roadmapped at
  **M4**. Stay on MediaRecorder for this hotfix.
- Any studio-layout / UI-architecture change — that is the **M1 migration**.

## Verification
Manual (WebGL canvas export can't be meaningfully unit-tested here):
1. Continuous export → no ghosting anywhere; plays crisp.
2. Seamless export → crisp body; brief blend only near the end; loops without a hard seam.
3. Both honor duration (5/10/20/30s) and quality (720p/1080p).
4. Live view restores correctly after export (resolution, cursor, timing).

---

## Next sub-project (separate spec): M0 + M1 migration

Locked decisions feeding it:
- Monorepo + framework-free WebGL2 core per roadmap §5; video logic ports into
  `packages/core/exporters/video.ts` carrying the fixed two-mode logic.
- **Studio shell = artboard/stage on an infinite canvas** (Figma/Spline-style): fixed
  export-size frame (16:9 / 1:1 / 9:16…) on a pannable + zoomable canvas.
- **Left panel** = navigation (engines / presets / layers later); **right panel** =
  properties (the motion/material/shape controls + sliders); top toolbar = export/undo/modes.
- Built in React + shadcn; gets its own brainstorm → spec → plan.
