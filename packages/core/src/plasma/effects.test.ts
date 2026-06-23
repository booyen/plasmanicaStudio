import { describe, it, expect } from 'vitest';
import {
  planPasses,
  bloomBrightWeight,
  PIXELATE_FRAG,
  BLUR_FRAG,
  BLOOM_BRIGHT_FRAG,
  BLOOM_COMBINE_FRAG,
} from './effects.js';
import { defaultConfig } from './config-defaults.js';

const FX = defaultConfig.effects;
const on = (over: Partial<typeof FX>) => ({ ...FX, ...over });

describe('planPasses (fixed order, skip-disabled)', () => {
  it('all-off → no passes', () => {
    expect(planPasses(FX)).toEqual([]);
  });

  it('keeps the fixed order pixelate → blur → bloom regardless of config order', () => {
    const fx = on({
      bloom: { on: true, threshold: 0.5, intensity: 0.6, radius: 0.5 },
      pixelate: { on: true, size: 8 },
      blur: { on: true, strength: 0.5 },
    });
    expect(planPasses(fx).map((p) => p.type)).toEqual(['pixelate', 'blur', 'bloom']);
  });

  it('glass becomes a tinted blur step; blur+glass run blur (untinted) then glass', () => {
    const fx = on({
      blur: { on: true, strength: 0.5 },
      glass: { on: true, strength: 0.4, tint: 0.6 },
    });
    const steps = planPasses(fx);
    expect(steps.map((p) => p.type)).toEqual(['blur', 'blur']);
    expect((steps[0] as any).tint).toBe(0); // plain blur
    expect((steps[1] as any).tint).toBe(0.6); // glass tint
  });

  it('a disabled effect contributes nothing', () => {
    expect(planPasses(on({ glass: { on: true, strength: 0.3, tint: 0.2 } })).map((p) => p.type)).toEqual(['blur']);
  });
});

describe('bloomBrightWeight (soft-knee threshold, JS mirror of the GLSL)', () => {
  it('is 0 at/below threshold and 1 well above', () => {
    expect(bloomBrightWeight(0.5, 0.7)).toBe(0);
    expect(bloomBrightWeight(0.7, 0.7)).toBe(0);
    expect(bloomBrightWeight(1.0, 0.7)).toBe(1);
  });
  it('rises monotonically through the knee', () => {
    const a = bloomBrightWeight(0.72, 0.7);
    const b = bloomBrightWeight(0.74, 0.7);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThanOrEqual(1);
  });
});

describe('effect shaders', () => {
  it('pixelate snaps to a grid', () => {
    expect(PIXELATE_FRAG).toContain('u_cell');
    expect(PIXELATE_FRAG).toContain('void main');
  });
  it('blur is separable (direction uniform) and supports a tint', () => {
    expect(BLUR_FRAG).toContain('u_dir');
    expect(BLUR_FRAG).toContain('u_tint');
    expect(BLUR_FRAG).toContain('void main');
  });
  it('bloom has a bright-pass and an additive combine', () => {
    expect(BLOOM_BRIGHT_FRAG).toContain('u_threshold');
    expect(BLOOM_COMBINE_FRAG).toContain('u_intensity');
  });
});
