import { describe, it, expect } from 'vitest';
import { defaultConfig, type CoreConfig, type Timeline } from '@effects/core';
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

describe('PlasmaController.animateTo', () => {
  it('tweens current → target over the duration and resolves at u=1', async () => {
    const r = fakeRenderer();
    const env = fakeEnv();
    const c = new PlasmaController(r, defaultConfig, env);
    const p = c.animateTo({ speed: defaultConfig.speed + 2 }, { duration: 1, easing: 'linear' });

    env.tick(0);    // start frame, u=0
    expect(r.applied.at(-1)!.speed).toBeCloseTo(defaultConfig.speed, 6);
    env.tick(500);  // u=0.5
    expect(r.applied.at(-1)!.speed).toBeCloseTo(defaultConfig.speed + 1, 6);
    env.tick(1000); // u=1, resolves
    await p;
    expect(c.getConfig().speed).toBeCloseTo(defaultConfig.speed + 2, 6);
    expect(env.pending).toBe(0);
  });

  it('under reduced-motion, snaps to target without scheduling a frame', async () => {
    const r = fakeRenderer();
    const env = fakeEnv(true);
    const c = new PlasmaController(r, defaultConfig, env);
    await c.animateTo({ speed: 5 }, { duration: 1 });
    expect(c.getConfig().speed).toBe(5);
    expect(env.pending).toBe(0);
  });

  it('starting a second animateTo cancels the first (mutual exclusion)', () => {
    const env = fakeEnv();
    const c = new PlasmaController(fakeRenderer(), defaultConfig, env);
    c.animateTo({ speed: 2 }, { duration: 1 });
    expect(env.pending).toBe(1);
    c.animateTo({ speed: 8 }, { duration: 1 });
    expect(env.pending).toBe(1); // old frame cancelled, one new frame queued
  });
});

function twoKf(): Timeline {
  return {
    duration: 10,
    keyframes: [
      { id: 'a', t: 0, easing: 'linear', config: { ...defaultConfig, speed: 1 } },
      { id: 'b', t: 10, easing: 'linear', config: { ...defaultConfig, speed: 3 } },
    ],
  };
}

describe('PlasmaController timeline', () => {
  it('seek is stateless: samples + applies without scheduling a frame', () => {
    const r = fakeRenderer();
    const env = fakeEnv();
    const c = new PlasmaController(r, defaultConfig, env);
    c.timeline(twoKf());
    c.seek(5); // midpoint
    expect(r.applied.at(-1)!.speed).toBeCloseTo(2, 6);
    expect(c.progress).toBe(5);
    expect(env.pending).toBe(0);
  });

  it('seek clamps progress to duration when t exceeds it', () => {
    const r = fakeRenderer();
    const env = fakeEnv();
    const c = new PlasmaController(r, defaultConfig, env);
    c.timeline(twoKf()); // duration = 10
    c.seek(999);
    expect(c.progress).toBe(10);
    expect(r.applied.at(-1)!.speed).toBeCloseTo(3, 6); // last keyframe
    expect(env.pending).toBe(0);
  });

  it('seek clamps progress to 0 when t is negative', () => {
    const r = fakeRenderer();
    const env = fakeEnv();
    const c = new PlasmaController(r, defaultConfig, env);
    c.timeline(twoKf()); // duration = 10
    c.seek(-5);
    expect(c.progress).toBe(0);
    expect(r.applied.at(-1)!.speed).toBeCloseTo(1, 6); // first keyframe
    expect(env.pending).toBe(0);
  });

  it('play advances progress each frame', () => {
    const r = fakeRenderer();
    const env = fakeEnv();
    const c = new PlasmaController(r, defaultConfig, env);
    c.timeline(twoKf());
    c.play();
    env.tick(0);     // prev=0, progress 0
    env.tick(2000);  // +2s → progress 2
    expect(c.progress).toBeCloseTo(2, 6);
    expect(r.applied.at(-1)!.speed).toBeCloseTo(1 + (3 - 1) * 0.2, 6);
  });

  it('play loops past the end by default', () => {
    const env = fakeEnv();
    const c = new PlasmaController(fakeRenderer(), defaultConfig, env);
    c.timeline(twoKf());
    c.play();
    env.tick(0);
    env.tick(12000); // +12s on a 10s timeline → wraps to 2
    expect(c.progress).toBeCloseTo(2, 6);
  });

  it('pause stops the driver but keeps progress', () => {
    const env = fakeEnv();
    const c = new PlasmaController(fakeRenderer(), defaultConfig, env);
    c.timeline(twoKf());
    c.play();
    env.tick(0);
    env.tick(3000);
    c.pause();
    expect(env.pending).toBe(0);
    expect(c.progress).toBeCloseTo(3, 6);
  });

  it('under reduced-motion, play renders the first keyframe still and does not loop', () => {
    const r = fakeRenderer();
    const env = fakeEnv(true);
    const c = new PlasmaController(r, defaultConfig, env);
    c.timeline(twoKf());
    c.play();
    expect(r.applied.at(-1)!.speed).toBeCloseTo(1, 6); // first keyframe
    expect(env.pending).toBe(0);
  });
});
