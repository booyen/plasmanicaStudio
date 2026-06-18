import { describe, it, expect } from 'vitest';
import { oklabMix, srgbToOklab, oklabToSrgb, OVERLAY_TYPE_INDEX, OVERLAY_BLEND_INDEX, COMPOSITE_FRAG } from './overlay.js';

const close = (a: number[], b: number[], eps = 1e-3) => a.every((v, i) => Math.abs(v - b[i]) < eps);

describe('OKLab', () => {
  it('round-trips sRGB through OKLab', () => {
    for (const c of [[0.2, 0.5, 0.9], [1, 0, 0], [0, 0, 0], [1, 1, 1]] as [number, number, number][]) {
      expect(close([...oklabToSrgb(srgbToOklab(c))], c)).toBe(true);
    }
  });
  it('mix endpoints are exact', () => {
    const a: [number, number, number] = [1, 0, 0], b: [number, number, number] = [0, 0, 1];
    expect(close([...oklabMix(a, b, 0)], a)).toBe(true);
    expect(close([...oklabMix(a, b, 1)], b)).toBe(true);
  });
  it('OKLab midpoint of a complementary pair is more saturated than the sRGB midpoint', () => {
    const a: [number, number, number] = [0, 0.6, 1], b: [number, number, number] = [1, 0.5, 0];
    const ok = oklabMix(a, b, 0.5);
    const rgb = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const chroma = (c: number[]) => Math.max(...c) - Math.min(...c);
    expect(chroma([...ok])).toBeGreaterThan(chroma(rgb));
  });
});

describe('overlay constants', () => {
  it('index maps', () => {
    expect(OVERLAY_TYPE_INDEX).toEqual({ none: 0, color: 1, linear: 2, radial: 3 });
    expect(OVERLAY_BLEND_INDEX).toEqual({ normal: 0, multiply: 1, screen: 2, overlay: 3 });
  });
  it('composite shader samples plasma + has overlay uniforms', () => {
    expect(COMPOSITE_FRAG).toContain('u_plasma');
    expect(COMPOSITE_FRAG).toContain('u_ovType');
    expect(COMPOSITE_FRAG).toContain('void main');
  });
});
