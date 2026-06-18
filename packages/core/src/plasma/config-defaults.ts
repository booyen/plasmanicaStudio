// Zero-dependency config defaults + the cursor-mode list. Split out of config.ts
// so the renderer and the embed can import them WITHOUT pulling in zod (the schema
// stays out of the embed path). config.ts re-exports these for back-compat.
import type { CoreConfig } from './config.js'; // type-only — erased at runtime

export const CURSOR_MODES = ['fluid', 'pixels', 'spotlight', 'light', 'contrast'] as const;
export type CursorMode = (typeof CURSOR_MODES)[number];

// Must equal parseConfig({}) — guarded by a test in config.test.ts.
export const defaultConfig: CoreConfig = {
  version: 1,
  motion: 'Classic',
  material: 'Smooth',
  shape: 'Free',
  palette: ['#2b5fff', '#00e0d0', '#36e07a', '#ffd24a', '#ff7a3c', '#ff3c9e'],
  bg: '#06060c',
  speed: 1,
  scalePct: 100,
  swirl: 1,
  turbulence: 1,
  detail: 1,
  flow: { angleDeg: 0, amount: 0 },
  coverage: 1,
  contrast: 1,
  visibility: 1,
  gravity: 0,
  grain: 0,
  rotateDeg: 0,
  center: [0, 0],
  cursor: { on: true, modes: ['fluid'], strength: 1, size: 0.4, trail: 0.4, turbulence: 0.5, lag: 0.4 },
  seed: 1,
  overlay: {
    type: 'none',
    blend: 'normal',
    opacity: 1,
    colorA: '#000000',
    alphaA: 0.5,
    colorB: '#000000',
    alphaB: 0,
    angleDeg: 0,
    center: [0.5, 0.5],
    radius: 0.75,
  },
};
