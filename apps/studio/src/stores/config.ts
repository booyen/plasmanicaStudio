// The single source of truth for the studio. Holds the validated CoreConfig and
// the lock map (consumed by Task 6b's lock-and-randomize). The renderer subscribes
// to this store OUTSIDE React (see App.tsx), so control edits never re-render the tree.
import { create } from 'zustand';
import { type CoreConfig, defaultConfig, parseConfig, pathIsLocked } from '@effects/core';
import { setByPath } from '../lib/path.js';

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

export const useConfigStore = create<ConfigStore>((set, get) => ({
  config: defaultConfig,
  locks: {},
  setConfig: (cfg) => set({ config: parseConfig(cfg) }),
  set: (path, value) => set((s) => ({ config: parseConfig(setByPath(s.config, path, value)) })),
  toggleLock: (key) => set((s) => ({ locks: { ...s.locks, [key]: !s.locks[key] } })),
  // Group-aware: a path reports locked if its own key OR its containing group is.
  isLocked: (key) => pathIsLocked(key, get().locks),
}));
