// Single source of truth for a plasma look. zod-validated so untrusted input
// (share links / imports) is clamped, never trusted (roadmap §2, §5.2).
import { z } from 'zod';
import { FIELD_NAMES, MATERIAL_NAMES } from './shaders.js';
import { SHAPE_NAMES } from './data.js';
import { CURSOR_MODES, type CursorMode } from './config-defaults.js';

export { CURSOR_MODES, type CursorMode };
// Pure re-export (not a new binding) so importers resolve straight to the zero-dep
// config-defaults module — keeps zod out of the embed/renderer path. A test asserts
// `defaultConfig === parseConfig({})`.
export { defaultConfig } from './config-defaults.js';

// Numeric field: missing/invalid → default; valid → clamped to [min,max].
const num = (def: number, min: number, max: number) =>
  z.preprocess(
    (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def),
    z.number(),
  );

// Hex color, tolerant of a missing leading '#'.
const HEX = /^#?[0-9a-fA-F]{6}$/;
const hex = (def: string) =>
  z.preprocess(
    (v) => (typeof v === 'string' && HEX.test(v.trim()) ? (v.trim()[0] === '#' ? v.trim() : '#' + v.trim()) : def),
    z.string(),
  );

// Membership-validated string (enum over a runtime list); invalid → default.
const inList = (list: readonly string[], def: string) =>
  z.preprocess((v) => (typeof v === 'string' && list.includes(v) ? v : def), z.string());

// Boolean field with an explicit default; non-boolean → default.
const bool = (def: boolean) =>
  z.preprocess((v) => (typeof v === 'boolean' ? v : def), z.boolean());

const cursorModes = z.preprocess(
  (v) => (Array.isArray(v) ? v.filter((m) => (CURSOR_MODES as readonly string[]).includes(m)) : ['fluid']),
  z.array(z.enum(CURSOR_MODES)),
);

export const OVERLAY_TYPES = ['none', 'color', 'linear', 'radial'] as const;
export const OVERLAY_BLENDS = ['normal', 'multiply', 'screen', 'overlay'] as const;

const OVERLAY_DEFAULT = {
  type: 'none',
  blend: 'normal',
  opacity: 1,
  colorA: '#000000',
  alphaA: 0.5,
  colorB: '#000000',
  alphaB: 0,
  angleDeg: 0,
  center: [0.5, 0.5] as [number, number],
  radius: 0.75,
};

const EFFECTS_DEFAULT = {
  pixelate: { on: false, size: 8 },
  blur: { on: false, strength: 0.5 },
  glass: { on: false, strength: 0.5, tint: 0.3 },
  bloom: { on: false, threshold: 0.7, intensity: 0.6, radius: 0.5 },
};

export const PlasmaConfig = z.object({
  version: z.literal(1).catch(1),
  motion: inList(FIELD_NAMES, 'Classic'),
  material: inList(MATERIAL_NAMES, 'Smooth'),
  shape: inList(SHAPE_NAMES, 'Free'),

  palette: z.preprocess(
    (v) => (Array.isArray(v) && v.length ? v.slice(0, 8) : ['#2b5fff', '#00e0d0', '#36e07a', '#ffd24a', '#ff7a3c', '#ff3c9e']),
    z.array(hex('#2b5fff')).min(1).max(8),
  ),
  bg: hex('#06060c'),

  speed: num(1.0, 0, 4),
  scalePct: num(100, 10, 250),
  swirl: num(1.0, 0, 2),
  turbulence: num(1.0, 0, 2),
  detail: num(1.0, 0.1, 4),
  flow: z
    .object({ angleDeg: num(0, 0, 360), amount: num(0, 0, 1) })
    .catch({ angleDeg: 0, amount: 0 })
    .default({ angleDeg: 0, amount: 0 }),
  coverage: num(1.0, 0, 1),
  contrast: num(1.0, 0.2, 2.2),
  visibility: num(1.0, 0, 1),
  gravity: num(0, -1, 1),
  grain: num(0, 0, 1),
  rotateDeg: num(0, -180, 180),
  center: z.preprocess(
    (v) => (Array.isArray(v) && v.length === 2 ? v : [0, 0]),
    z.tuple([num(0, -2, 2), num(0, -2, 2)]),
  ),

  cursor: z
    .object({
      on: z.preprocess((v) => (typeof v === 'boolean' ? v : true), z.boolean()),
      modes: cursorModes,
      strength: num(1.0, 0, 2),
      size: num(0.4, 0.1, 1.2),
      trail: num(0.4, 0, 1),
      turbulence: num(0.5, 0, 1.5),
      lag: num(0.4, 0, 1),
    })
    .catch({ on: true, modes: ['fluid'], strength: 1, size: 0.4, trail: 0.4, turbulence: 0.5, lag: 0.4 })
    .default({ on: true, modes: ['fluid'], strength: 1, size: 0.4, trail: 0.4, turbulence: 0.5, lag: 0.4 }),

  seed: z.preprocess(
    (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 1),
    z.number(),
  ),
  overlay: z
    .object({
      type: inList(OVERLAY_TYPES, 'none'),
      blend: inList(OVERLAY_BLENDS, 'normal'),
      opacity: num(1, 0, 1),
      colorA: hex('#000000'),
      alphaA: num(0.5, 0, 1),
      colorB: hex('#000000'),
      alphaB: num(0, 0, 1),
      angleDeg: num(0, 0, 360),
      center: z.preprocess(
        (v) => (Array.isArray(v) && v.length === 2 ? v : [0.5, 0.5]),
        z.tuple([num(0.5, -1, 2), num(0.5, -1, 2)]),
      ),
      radius: num(0.75, 0.05, 2),
    })
    .catch({ ...OVERLAY_DEFAULT })
    .default({ ...OVERLAY_DEFAULT }),

  // Stackable post-process image filters (Bloom/Blur/Glass/Pixelate). All-off by
  // default → zero visual change. Each effect is independent; the renderer runs the
  // enabled passes in fixed order (pixelate → blur/glass → bloom) before the
  // gradient composite. Round-trips through share links like any other block.
  effects: z
    .object({
      pixelate: z
        .object({ on: bool(false), size: num(8, 2, 64) })
        .catch({ ...EFFECTS_DEFAULT.pixelate })
        .default({ ...EFFECTS_DEFAULT.pixelate }),
      blur: z
        .object({ on: bool(false), strength: num(0.5, 0, 1) })
        .catch({ ...EFFECTS_DEFAULT.blur })
        .default({ ...EFFECTS_DEFAULT.blur }),
      glass: z
        .object({ on: bool(false), strength: num(0.5, 0, 1), tint: num(0.3, 0, 1) })
        .catch({ ...EFFECTS_DEFAULT.glass })
        .default({ ...EFFECTS_DEFAULT.glass }),
      bloom: z
        .object({ on: bool(false), threshold: num(0.7, 0, 1), intensity: num(0.6, 0, 1), radius: num(0.5, 0, 1) })
        .catch({ ...EFFECTS_DEFAULT.bloom })
        .default({ ...EFFECTS_DEFAULT.bloom }),
    })
    .catch({ ...EFFECTS_DEFAULT })
    .default({ ...EFFECTS_DEFAULT }),
});

export type CoreConfig = z.infer<typeof PlasmaConfig>;

/** Lenient parse for untrusted input: fills defaults + clamps, never throws. */
export function parseConfig(input: unknown): CoreConfig {
  const obj = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return PlasmaConfig.parse(obj);
}
