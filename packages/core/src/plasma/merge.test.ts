import { describe, it, expect } from 'vitest';
import { mergeConfigPatch } from './merge.js';
import { defaultConfig } from './config-defaults.js';

describe('mergeConfigPatch', () => {
  it('replaces a top-level scalar, leaves the rest untouched', () => {
    const out = mergeConfigPatch(defaultConfig, { speed: 7 });
    expect(out.speed).toBe(7);
    expect(out.coverage).toBe(defaultConfig.coverage);
  });

  it('deep-merges nested blocks without dropping siblings', () => {
    const out = mergeConfigPatch(defaultConfig, { flow: { amount: 0.42 } });
    expect(out.flow.amount).toBe(0.42);
    expect(out.flow.angleDeg).toBe(defaultConfig.flow.angleDeg);
  });

  it('replaces arrays/tuples wholesale (no element merge)', () => {
    const out = mergeConfigPatch(defaultConfig, { palette: ['#abcdef'], center: [0.1, 0.2] });
    expect(out.palette).toEqual(['#abcdef']);
    expect(out.center).toEqual([0.1, 0.2]);
  });

  it('merges deeply nested effect blocks', () => {
    const out = mergeConfigPatch(defaultConfig, { effects: { bloom: { intensity: 0.9 } } });
    expect(out.effects.bloom.intensity).toBe(0.9);
    expect(out.effects.bloom.threshold).toBe(defaultConfig.effects.bloom.threshold);
    expect(out.effects.blur.on).toBe(defaultConfig.effects.blur.on);
  });

  it('empty patch is a deep-equal identity', () => {
    expect(mergeConfigPatch(defaultConfig, {})).toEqual(defaultConfig);
  });

  it('does not mutate the base', () => {
    const before = JSON.stringify(defaultConfig);
    mergeConfigPatch(defaultConfig, { flow: { amount: 1 } });
    expect(JSON.stringify(defaultConfig)).toBe(before);
  });
});
