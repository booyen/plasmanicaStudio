import { describe, it, expect } from 'vitest';
import { applyEasing } from './timeline.js';

describe('applyEasing', () => {
  const eases = ['linear', 'ease-in', 'ease-out', 'ease-in-out'] as const;

  it('maps endpoints 0->0 and 1->1 for every easing', () => {
    for (const e of eases) {
      expect(applyEasing(e, 0)).toBeCloseTo(0, 9);
      expect(applyEasing(e, 1)).toBeCloseTo(1, 9);
    }
  });

  it('is monotonic non-decreasing on a sampled grid', () => {
    for (const e of eases) {
      let prev = -1;
      for (let u = 0; u <= 1.0001; u += 0.05) {
        const v = applyEasing(e, u);
        expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = v;
      }
    }
  });

  it('ease-in-out is symmetric around 0.5', () => {
    expect(applyEasing('ease-in-out', 0.25) + applyEasing('ease-in-out', 0.75)).toBeCloseTo(1, 9);
  });
});
