import { describe, it, expect } from 'vitest';
import { encodeShare, decodeShare } from './share.js';
import { defaultConfig, parseConfig } from '@effects/core';

describe('share links', () => {
  it('round-trips a config through the #s= hash', () => {
    const cfg = parseConfig({ ...defaultConfig, motion: 'Vortex', speed: 0.3, palette: ['#112233', '#445566'] });
    expect(decodeShare('#s=' + encodeShare(cfg))).toEqual(cfg);
  });

  it('returns null for a missing or corrupt hash', () => {
    expect(decodeShare('')).toBeNull();
    expect(decodeShare('#foo=bar')).toBeNull();
    expect(decodeShare('#s=@@@notvalid@@@')).toBeNull();
  });

  it('decoded config is always valid (zod-clamped)', () => {
    const out = decodeShare('#s=' + encodeShare(defaultConfig));
    expect(out).toEqual(parseConfig(out));
  });
});
