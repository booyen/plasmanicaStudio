// Lock-and-randomize: surprise-me rolls a fresh look but preserves any locked
// group or individual param. Lives in core so the engine, studio, and embed can
// all randomize consistently. Theme mapping mirrors the legacy applyConfig.
import { type CoreConfig, defaultConfig, parseConfig } from './config.js';
import { FIELD_NAMES, MATERIAL_NAMES } from './shaders.js';
import { SHAPE_NAMES } from './data.js';
import { THEMES, THEME_NAMES, generatePalette, hsl2hex } from './themes.js';

export type LockGroup = { key: string; label: string; paths: string[] };

// Every CoreConfig field lives in exactly one group (incl. scalePct under Motion,
// matching the legacy "Motion controls" grouping), so locking all groups freezes
// the whole config.
export const LOCK_GROUPS: LockGroup[] = [
  { key: 'color', label: 'Color', paths: ['palette', 'bg'] },
  { key: 'motion', label: 'Motion', paths: ['motion', 'speed', 'scalePct', 'swirl', 'detail'] },
  { key: 'material', label: 'Material', paths: ['material'] },
  { key: 'shape', label: 'Shape', paths: ['shape', 'center', 'rotateDeg'] },
  {
    key: 'pattern',
    label: 'Pattern & flow',
    paths: ['turbulence', 'flow', 'coverage', 'contrast', 'visibility', 'grain', 'gravity'],
  },
  { key: 'cursor', label: 'Cursor', paths: ['cursor'] },
  { key: 'overlay', label: 'Overlay', paths: ['overlay'] },
  { key: 'effects', label: 'Effects', paths: ['effects'] },
];

const GROUP_KEYS = new Set(LOCK_GROUPS.map((g) => g.key));

function getByPath(root: unknown, path: string): unknown {
  return path.split('.').reduce<any>((acc, k) => (acc == null ? acc : acc[k]), root);
}

function setByPath<T>(root: T, path: string, value: unknown): T {
  const keys = path.split('.');
  const clone: any = Array.isArray(root) ? [...(root as any)] : { ...(root as any) };
  let cur = clone;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    const child = cur[k];
    cur[k] = Array.isArray(child) ? [...child] : { ...child };
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
  return clone;
}

/** True if `path` is locked by its own key or by the group that contains it. */
export function pathIsLocked(path: string, locks: Record<string, boolean>): boolean {
  if (locks[path]) return true;
  for (const g of LOCK_GROUPS) {
    if (!locks[g.key]) continue;
    if (g.paths.some((gp) => path === gp || path.startsWith(gp + '.'))) return true;
  }
  return false;
}

/** The set of leaf/subtree paths to restore from current (locked groups + locked params). */
function lockedRestorePaths(locks: Record<string, boolean>): string[] {
  const out = new Set<string>();
  for (const g of LOCK_GROUPS) if (locks[g.key]) g.paths.forEach((p) => out.add(p));
  for (const k of Object.keys(locks)) if (locks[k] && !GROUP_KEYS.has(k)) out.add(k);
  return [...out];
}

type ThemeOutput = Record<string, any>;

/** Map a legacy THEME output over a base config (noise*0.25; untouched fields kept). */
export function themeToConfig(o: ThemeOutput, base: CoreConfig): CoreConfig {
  return parseConfig({
    ...base,
    motion: o.field,
    material: o.mat,
    shape: o.shape,
    palette: o.palette,
    bg: o.bg,
    speed: o.speed,
    scalePct: o.scalePct,
    swirl: o.swirl,
    turbulence: o.turb,
    flow: { angleDeg: o.flowAng ?? base.flow.angleDeg, amount: o.flowAmt ?? base.flow.amount },
    coverage: o.cover,
    contrast: o.contrast,
    gravity: o.grav,
    grain: (o.noise ?? 0) * 0.25,
    rotateDeg: o.rot ?? base.rotateDeg,
    center: o.center ?? base.center,
  });
}

export function randomThemeName(): string {
  return THEME_NAMES[Math.floor(Math.random() * THEME_NAMES.length)];
}

const RR = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const choose = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
const HARMONIES = ['analogous', 'complementary', 'triadic', 'mono', 'random'] as const;

/**
 * A full-spectrum random look: any field/material/shape from the complete lists,
 * a procedural *harmonious* palette (OKLCH-ish via generatePalette), and wide but
 * tasteful parameter ranges. Far more varied than cycling the 8 curated vibes —
 * the vibes stay available as the LeftPanel chips.
 */
/** Mostly-off, occasionally-on post effects with gentle params — surprise-me
 *  surfaces them now and then without overwhelming the base plasma. */
function randomEffects(): CoreConfig['effects'] {
  return {
    pixelate: { on: Math.random() < 0.1, size: Math.round(RR(6, 28)) },
    blur: { on: Math.random() < 0.12, strength: RR(0.15, 0.5) },
    glass: { on: Math.random() < 0.12, strength: RR(0.2, 0.5), tint: RR(0.15, 0.5) },
    bloom: { on: Math.random() < 0.3, threshold: RR(0.45, 0.75), intensity: RR(0.3, 0.7), radius: RR(0.3, 0.7) },
  };
}

function randomLook(): CoreConfig {
  const palette = generatePalette(choose(HARMONIES));
  const bg = hsl2hex(Math.floor(RR(0, 360)), RR(0.3, 0.7), RR(0.02, 0.07)); // dark tinted
  return parseConfig({
    ...defaultConfig,
    motion: choose(FIELD_NAMES),
    material: choose(MATERIAL_NAMES),
    shape: Math.random() < 0.6 ? 'Free' : choose(SHAPE_NAMES), // bias to Free, allow others
    palette,
    bg,
    speed: RR(0.1, 0.6),
    scalePct: RR(70, 180),
    swirl: RR(0.2, 1.2),
    turbulence: RR(0.3, 1.4),
    detail: RR(0.6, 1.8),
    flow: { angleDeg: RR(0, 360), amount: Math.random() < 0.5 ? 0 : RR(0.05, 0.35) },
    coverage: RR(0.35, 1.0),
    contrast: RR(0.9, 1.7),
    gravity: RR(-0.4, 0.4),
    grain: RR(0, 0.12),
    rotateDeg: Math.random() < 0.5 ? 0 : RR(-180, 180),
    effects: randomEffects(),
  });
}

/** A fresh random look for surprise-me. Occasionally (~25%) a curated vibe, else
 *  full-spectrum random — variety with the odd hand-tuned gem. */
function rollCandidate(): CoreConfig {
  if (Math.random() < 0.25) {
    const make = (THEMES as Record<string, () => ThemeOutput>)[randomThemeName()];
    return themeToConfig(make(), defaultConfig);
  }
  return randomLook();
}

/** Small fast deterministic PRNG → [0,1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Roll a new look, then restore every locked path from `current`. Unlocked fields
 * are re-rolled (or reset to defaults if the vibe doesn't set them); locked ones
 * are preserved. A `seed` makes it deterministic (same seed + same locks + same
 * locked values ⇒ deep-equal); omit it for a fresh random seed. The result always
 * carries the seed that produced it. Always parseConfig'd, so it's valid + clamped.
 */
export function randomizeConfig(
  current: CoreConfig,
  locks: Record<string, boolean>,
  seed?: number,
): CoreConfig {
  const usedSeed = seed != null ? seed >>> 0 : (Math.random() * 0x100000000) >>> 0;
  const orig = Math.random;
  let candidate: CoreConfig;
  try {
    Math.random = mulberry32(usedSeed); // verbatim THEMES call Math.random — seed them
    candidate = rollCandidate();
  } finally {
    Math.random = orig;
  }
  for (const p of lockedRestorePaths(locks)) {
    candidate = setByPath(candidate, p, getByPath(current, p));
  }
  candidate = setByPath(candidate, 'seed', usedSeed);
  return parseConfig(candidate);
}
