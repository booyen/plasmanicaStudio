import { describe, it, expect } from 'vitest';
import { paletteGradientCss } from './fallback.js';

describe('never-black fallback gradient', () => {
  it('builds a linear-gradient from the palette', () => {
    const g = paletteGradientCss(['#ff0000', '#00ff00', '#0000ff'], '#000');
    expect(g).toContain('linear-gradient');
    expect(g).toContain('#ff0000');
    expect(g).toContain('#0000ff');
  });
  it('guarantees ≥2 stops for a single-colour palette (uses bg)', () => {
    const g = paletteGradientCss(['#abcdef'], '#101020');
    expect(g).toContain('#abcdef');
    expect(g).toContain('#101020');
  });
  it('never empty even with an empty palette', () => {
    expect(paletteGradientCss([], '#070707')).toContain('#070707');
  });
});
