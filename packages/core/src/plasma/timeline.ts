// Pure, zero-dependency keyframe interpolation over CoreConfig. Two clocks:
// motion time lives in the renderer; this module only morphs the *look*.

import { hex2rgb } from './gl.js';
import { oklabMix } from './overlay.js';
import { rgb2hex } from './palette.js';
import { parseConfig, type CoreConfig } from './config.js';

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

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const hexMix = (a: string, b: string, t: number) => rgb2hex(oklabMix(hex2rgb(a), hex2rgb(b), t));

/** Element-wise OKLab palette mix; shorter side padded with its last color. */
function lerpPalette(a: string[], b: string[], t: number): string[] {
  const n = Math.max(a.length, b.length);
  const at = (p: string[], i: number) => p[Math.min(i, p.length - 1)]!;
  return Array.from({ length: n }, (_, i) => hexMix(at(a, i), at(b, i), t));
}

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
  return lerpConfig(kA.config, kB.config, applyEasing(kA.easing, u));
}
