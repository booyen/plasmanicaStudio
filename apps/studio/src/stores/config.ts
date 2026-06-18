// The single source of truth for the studio. Holds the validated CoreConfig and
// the lock map (consumed by Task 6b's lock-and-randomize). The renderer subscribes
// to this store OUTSIDE React (see App.tsx), so control edits never re-render the tree.
import { create } from 'zustand';
import { type CoreConfig, defaultConfig, parseConfig } from '@effects/core';

export type ConfigStore = {
  config: CoreConfig;
  /** Lock keys = group keys (e.g. `color`, `motion`) and param paths (e.g. `cursor.lag`). */
  locks: Record<string, boolean>;
  /** Replace the whole config (share-link restore, surprise-me, presets). */
  setConfig: (cfg: CoreConfig) => void;
  /** Set one value by dotted path (e.g. `cursor.lag`, `flow.amount`, `center.0`). */
  set: (path: string, value: unknown) => void;
  toggleLock: (key: string) => void;
  isLocked: (key: string) => boolean;
};

/** Immutable nested set by dotted path. Arrays are indexed by numeric string keys. */
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

export const useConfigStore = create<ConfigStore>((set, get) => ({
  config: defaultConfig,
  locks: {},
  setConfig: (cfg) => set({ config: parseConfig(cfg) }),
  set: (path, value) => set((s) => ({ config: parseConfig(setByPath(s.config, path, value)) })),
  toggleLock: (key) => set((s) => ({ locks: { ...s.locks, [key]: !s.locks[key] } })),
  isLocked: (key) => !!get().locks[key],
}));
