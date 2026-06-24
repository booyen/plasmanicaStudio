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
