// Lock-and-randomize: surprise-me rolls a fresh look but preserves any locked
// group or individual param. Lives in core so the engine, studio, and embed can
// all randomize consistently. Theme mapping mirrors the legacy applyConfig.
import { type CoreConfig, defaultConfig, parseConfig } from './config.js';
import { THEMES, THEME_NAMES } from './themes.js';

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

/** A fresh random look: a random vibe applied over the defaults. */
function rollCandidate(): CoreConfig {
  const make = (THEMES as Record<string, () => ThemeOutput>)[randomThemeName()];
  return themeToConfig(make(), defaultConfig);
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
