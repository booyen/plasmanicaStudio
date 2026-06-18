// The single source of truth for the studio. Holds the validated CoreConfig, the
// lock map (lock-and-randomize), and a snapshot history for ◀ ▶ undo/redo over
// generated looks. The renderer subscribes to this store OUTSIDE React (see
// App.tsx), so control edits never re-render the tree.
import { create } from 'zustand';
import { type CoreConfig, defaultConfig, parseConfig, pathIsLocked } from '@effects/core';
import { setByPath } from '../lib/path.js';

const HISTORY_CAP = 50;

export type ConfigStore = {
  config: CoreConfig;
  /** Lock keys = group keys (e.g. `color`, `motion`) and param paths (e.g. `cursor.lag`). */
  locks: Record<string, boolean>;
  /** Snapshot stack of generated looks; `histIndex` points at the current one. */
  history: CoreConfig[];
  histIndex: number;

  /** Replace the current look in place (no new history step) — share restore / reset-current. */
  setConfig: (cfg: CoreConfig) => void;
  /** Set one value by dotted path — folds into the current history entry (a tweak, not a step). */
  set: (path: string, value: unknown) => void;
  /** Push a NEW generated look as a history step (surprise / vibe / seed). Truncates any redo branch. */
  commit: (cfg: CoreConfig) => void;
  /** Step to the previous / next look. No-ops at the ends. */
  back: () => void;
  forward: () => void;

  toggleLock: (key: string) => void;
  isLocked: (key: string) => boolean;
};

export const useConfigStore = create<ConfigStore>((set, get) => ({
  config: defaultConfig,
  locks: {},
  history: [defaultConfig],
  histIndex: 0,

  setConfig: (cfg) =>
    set((s) => {
      const config = parseConfig(cfg);
      const history = s.history.slice();
      history[s.histIndex] = config; // replace current entry, no new step
      return { config, history };
    }),

  set: (path, value) =>
    set((s) => {
      const config = parseConfig(setByPath(s.config, path, value));
      const history = s.history.slice();
      history[s.histIndex] = config; // a tweak folds into the current look
      return { config, history };
    }),

  commit: (cfg) =>
    set((s) => {
      const config = parseConfig(cfg);
      let history = s.history.slice(0, s.histIndex + 1); // drop any redo branch
      history.push(config);
      let histIndex = history.length - 1;
      if (history.length > HISTORY_CAP) {
        history = history.slice(history.length - HISTORY_CAP);
        histIndex = history.length - 1;
      }
      return { config, history, histIndex };
    }),

  back: () =>
    set((s) => (s.histIndex > 0 ? { histIndex: s.histIndex - 1, config: s.history[s.histIndex - 1] } : s)),

  forward: () =>
    set((s) =>
      s.histIndex < s.history.length - 1
        ? { histIndex: s.histIndex + 1, config: s.history[s.histIndex + 1] }
        : s,
    ),

  toggleLock: (key) => set((s) => ({ locks: { ...s.locks, [key]: !s.locks[key] } })),
  // Group-aware: a path reports locked if its own key OR its containing group is.
  isLocked: (key) => pathIsLocked(key, get().locks),
}));
