import { describe, it, expect } from 'vitest';
import { defaultConfig, type CoreConfig } from '@effects/core';
import { PlasmaController, type ControllerEnv } from './controller.js';

// A fake renderer that records the configs it's given.
function fakeRenderer() {
  const applied: CoreConfig[] = [];
  return { applied, setConfig: (c: CoreConfig) => applied.push(c) };
}

// A controllable rAF: cb's are queued; tick(ms) runs the next frame with a timestamp.
function fakeEnv(reduced = false): ControllerEnv & { tick: (ms: number) => void; pending: number } {
  let next = 1;
  const queue = new Map<number, (ms: number) => void>();
  return {
    raf: (cb) => { const id = next++; queue.set(id, cb); return id; },
    caf: (id) => { queue.delete(id); },
    reducedMotion: () => reduced,
    get pending() { return queue.size; },
    tick(ms: number) {
      const [id, cb] = [...queue.entries()][0] ?? [];
      if (id !== undefined && cb) { queue.delete(id); cb(ms); }
    },
  };
}

describe('PlasmaController.set', () => {
  it('merges a partial patch over the current look and applies it', () => {
    const r = fakeRenderer();
    const c = new PlasmaController(r, defaultConfig, fakeEnv());
    c.set({ speed: 9 });
    expect(r.applied.at(-1)!.speed).toBe(9);
    expect(c.getConfig().speed).toBe(9);
    expect(c.getConfig().coverage).toBe(defaultConfig.coverage);
  });

  it('progress starts at 0', () => {
    const c = new PlasmaController(fakeRenderer(), defaultConfig, fakeEnv());
    expect(c.progress).toBe(0);
  });
});
