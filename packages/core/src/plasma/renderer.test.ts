import { describe, it, expect } from 'vitest';
import { PlasmaRenderer } from './renderer.js';
import { defaultConfig } from './config.js';

// No real WebGL in node/vitest — these are import + graceful-failure smoke tests.
// Pixel-level parity is verified by the Playwright goldens in Task 8.

describe('PlasmaRenderer (smoke)', () => {
  it('is exported as a constructable class', () => {
    expect(typeof PlasmaRenderer).toBe('function');
  });

  it('throws a clear error when WebGL1 is unavailable', () => {
    const stub = {
      getContext: () => null,
      addEventListener: () => {},
      removeEventListener: () => {},
      width: 0,
      height: 0,
      clientWidth: 0,
      clientHeight: 0,
    } as unknown as HTMLCanvasElement;
    expect(() => new PlasmaRenderer(stub)).toThrow(/WebGL1 not available/);
  });

  it('defaultConfig is a valid look the renderer can consume', () => {
    // applyConfigInternal indexes by name — guard against a renamed enum drifting from the config.
    expect(defaultConfig.motion).toBeTypeOf('string');
    expect(defaultConfig.material).toBeTypeOf('string');
    expect(defaultConfig.shape).toBeTypeOf('string');
    expect(defaultConfig.palette.length).toBeGreaterThan(0);
  });
});
