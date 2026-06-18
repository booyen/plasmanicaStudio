import { describe, it, expect, beforeEach } from 'vitest';
import { defaultConfig, parseConfig } from '@effects/core';
import { useConfigStore } from './config.js';

const reset = () =>
  useConfigStore.setState({ config: defaultConfig, history: [defaultConfig], histIndex: 0, locks: {} });

const look = (seed: number) => parseConfig({ ...defaultConfig, seed });

describe('config store history (◀ ▶ over generated looks)', () => {
  beforeEach(reset);

  it('commit pushes a step and advances the index', () => {
    const s = useConfigStore.getState();
    s.commit(look(2));
    s.commit(look(3));
    const st = useConfigStore.getState();
    expect(st.history.map((c) => c.seed)).toEqual([1, 2, 3]);
    expect(st.histIndex).toBe(2);
    expect(st.config.seed).toBe(3);
  });

  it('back / forward step through looks', () => {
    const s = useConfigStore.getState();
    s.commit(look(2));
    s.commit(look(3));
    useConfigStore.getState().back();
    expect(useConfigStore.getState().config.seed).toBe(2);
    useConfigStore.getState().back();
    expect(useConfigStore.getState().config.seed).toBe(1);
    useConfigStore.getState().back(); // no-op at the start
    expect(useConfigStore.getState().histIndex).toBe(0);
    useConfigStore.getState().forward();
    expect(useConfigStore.getState().config.seed).toBe(2);
  });

  it('committing after stepping back truncates the redo branch', () => {
    const s = useConfigStore.getState();
    s.commit(look(2));
    s.commit(look(3));
    useConfigStore.getState().back(); // at seed 2
    useConfigStore.getState().commit(look(9));
    const st = useConfigStore.getState();
    expect(st.history.map((c) => c.seed)).toEqual([1, 2, 9]);
    expect(st.config.seed).toBe(9);
    expect(st.histIndex).toBe(2);
  });

  it('a tweak (set) folds into the current entry — back/forward returns the tweaked look', () => {
    const s = useConfigStore.getState();
    s.commit(look(2));
    useConfigStore.getState().set('speed', 0.42); // tweak the current look
    expect(useConfigStore.getState().history[1].speed).toBe(0.42);
    useConfigStore.getState().back();
    useConfigStore.getState().forward();
    expect(useConfigStore.getState().config.speed).toBe(0.42);
  });

  it('caps history length', () => {
    const s = useConfigStore.getState();
    for (let i = 0; i < 80; i++) s.commit(look(i + 2));
    const st = useConfigStore.getState();
    expect(st.history.length).toBeLessThanOrEqual(50);
    expect(st.histIndex).toBe(st.history.length - 1);
  });
});
