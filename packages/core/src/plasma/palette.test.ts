import { describe, it, expect } from 'vitest';
import { generatePaletteOklch, oklchToHex, rgb2hex } from './palette.js';

const HEX = /^#[0-9a-f]{6}$/;

describe('OKLCH palette generator', () => {
  it('oklchToHex returns a valid hex', () => {
    expect(oklchToHex(0.6, 0.12, 200)).toMatch(HEX);
    expect(oklchToHex(0, 0, 0)).toMatch(HEX);
  });
  it('each harmony yields valid hex colors of the expected count', () => {
    expect(generatePaletteOklch('analogous')).toHaveLength(5);
    expect(generatePaletteOklch('complementary')).toHaveLength(4);
    expect(generatePaletteOklch('triadic')).toHaveLength(3);
    expect(generatePaletteOklch('mono')).toHaveLength(4);
    for (const m of ['analogous', 'complementary', 'triadic', 'mono', 'random'] as const) {
      for (const c of generatePaletteOklch(m)) expect(c).toMatch(HEX);
    }
  });
  it('triadic spans distinct hues (not all the same color)', () => {
    const p = generatePaletteOklch('triadic');
    expect(new Set(p).size).toBe(3);
  });
});

describe('rgb2hex', () => {
  it('formats 0..1 channels to #rrggbb', () => {
    expect(rgb2hex([0, 0, 0])).toBe('#000000');
    expect(rgb2hex([1, 1, 1])).toBe('#ffffff');
    expect(rgb2hex([1, 0, 0])).toBe('#ff0000');
  });
  it('clamps out-of-range channels', () => {
    expect(rgb2hex([-0.5, 2, 0.5])).toBe('#00ff80');
  });
});
