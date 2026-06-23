import { describe, it, expect } from 'vitest';
import { applyEasing, lerpConfig } from './timeline.js';
import { hex2rgb } from './gl.js';
import { oklabMix } from './overlay.js';
import { rgb2hex } from './palette.js';
import { parseConfig } from './config.js';

const cfg = (over: Record<string, unknown>) => parseConfig(over);

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

describe('lerpConfig', () => {
  it('lerps numeric fields linearly', () => {
    const a = cfg({ speed: 0, scalePct: 100 });
    const b = cfg({ speed: 4, scalePct: 200 });
    const m = lerpConfig(a, b, 0.5);
    expect(m.speed).toBeCloseTo(2, 6);
    expect(m.scalePct).toBeCloseTo(150, 6);
  });

  it('lerps numeric tuples (center) component-wise', () => {
    const a = cfg({ center: [0, 0] });
    const b = cfg({ center: [1, 2] });
    const m = lerpConfig(a, b, 0.5);
    expect(m.center[0]).toBeCloseTo(0.5, 6);
    expect(m.center[1]).toBeCloseTo(1, 6);
  });

  it('interpolates palette in OKLab; endpoints are the inputs', () => {
    const a = cfg({ palette: ['#ff0000'] });
    const b = cfg({ palette: ['#0000ff'] });
    expect(lerpConfig(a, b, 0).palette[0].toLowerCase()).toBe('#ff0000');
    expect(lerpConfig(a, b, 1).palette[0].toLowerCase()).toBe('#0000ff');
    const midExpected = rgb2hex(oklabMix(hex2rgb('#ff0000'), hex2rgb('#0000ff'), 0.5));
    expect(lerpConfig(a, b, 0.5).palette[0].toLowerCase()).toBe(midExpected.toLowerCase());
  });

  it('pads the shorter palette with its last color; result takes the longer length', () => {
    const a = cfg({ palette: ['#ff0000'] });
    const b = cfg({ palette: ['#0000ff', '#00ff00'] });
    const m = lerpConfig(a, b, 0.5);
    expect(m.palette.length).toBe(2);
    // index 1 mixes a's LAST (#ff0000) with b[1] (#00ff00)
    const expect1 = rgb2hex(oklabMix(hex2rgb('#ff0000'), hex2rgb('#00ff00'), 0.5));
    expect(m.palette[1].toLowerCase()).toBe(expect1.toLowerCase());
  });

  it('switches discrete fields at the t=0.5 boundary', () => {
    const a = cfg({ motion: 'Classic', cursor: { on: true, modes: ['fluid'] }, effects: { bloom: { on: false } } });
    const b = cfg({ motion: 'Vortex', cursor: { on: false, modes: ['pixels'] }, effects: { bloom: { on: true } } });
    const lo = lerpConfig(a, b, 0.49);
    const hi = lerpConfig(a, b, 0.5);
    expect(lo.motion).toBe('Classic');
    expect(hi.motion).toBe('Vortex');
    expect(lo.cursor.on).toBe(true);
    expect(hi.cursor.on).toBe(false);
    expect(lo.cursor.modes).toEqual(['fluid']);
    expect(hi.cursor.modes).toEqual(['pixels']);
    expect(lo.effects.bloom.on).toBe(false);
    expect(hi.effects.bloom.on).toBe(true);
  });

  it('recurses into nested numeric fields', () => {
    const a = cfg({ flow: { angleDeg: 0, amount: 0 }, effects: { bloom: { on: true, intensity: 0 } } });
    const b = cfg({ flow: { angleDeg: 100, amount: 1 }, effects: { bloom: { on: true, intensity: 1 } } });
    const m = lerpConfig(a, b, 0.5);
    expect(m.flow.angleDeg).toBeCloseTo(50, 6);
    expect(m.flow.amount).toBeCloseTo(0.5, 6);
    expect(m.effects.bloom.intensity).toBeCloseTo(0.5, 6);
  });
});

import { sampleTimeline, type Timeline, type Easing } from './timeline.js';

const kf = (id: string, t: number, over: Record<string, unknown>, easing: Easing = 'linear') =>
  ({ id, t, easing, config: parseConfig(over) });

describe('sampleTimeline', () => {
  const tl: Timeline = {
    duration: 10,
    keyframes: [kf('a', 0, { speed: 0 }), kf('b', 10, { speed: 4 })],
  };

  it('clamps time outside [0,duration] to the end keyframes', () => {
    expect(sampleTimeline(tl, -5).speed).toBeCloseTo(0, 6);
    expect(sampleTimeline(tl, 99).speed).toBeCloseTo(4, 6);
  });

  it('interpolates within a segment', () => {
    expect(sampleTimeline(tl, 5).speed).toBeCloseTo(2, 6);
  });

  it('selects the correct bracket with 3 keyframes', () => {
    const tl3: Timeline = {
      duration: 10,
      keyframes: [kf('a', 0, { speed: 0 }), kf('b', 5, { speed: 4 }), kf('c', 10, { speed: 0 })],
    };
    expect(sampleTimeline(tl3, 2.5).speed).toBeCloseTo(2, 6); // first segment midpoint
    expect(sampleTimeline(tl3, 7.5).speed).toBeCloseTo(2, 6); // second segment midpoint
  });

  it('applies the leaving keyframe easing', () => {
    const eased: Timeline = {
      duration: 10,
      keyframes: [kf('a', 0, { speed: 0 }, 'ease-in'), kf('b', 10, { speed: 4 })],
    };
    // ease-in at u=0.5 -> 0.25 -> speed 1
    expect(sampleTimeline(eased, 5).speed).toBeCloseTo(1, 6);
  });

  it('throws on an empty timeline', () => {
    expect(() => sampleTimeline({ duration: 10, keyframes: [] }, 5)).toThrow(/no keyframes/);
  });
});
