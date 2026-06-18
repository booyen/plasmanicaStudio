import { describe, it, expect } from 'vitest';
import { parseConfig, defaultConfig, PlasmaConfig } from './config.js';

describe('PlasmaConfig', () => {
  it('defaultConfig matches the legacy initial state', () => {
    expect(defaultConfig.motion).toBe('Classic');
    expect(defaultConfig.material).toBe('Smooth');
    expect(defaultConfig.shape).toBe('Free');
    expect(defaultConfig.speed).toBe(1);
    expect(defaultConfig.scalePct).toBe(100);
    expect(defaultConfig.bg).toBe('#06060c');
    expect(defaultConfig.cursor.on).toBe(true);
    expect(defaultConfig.cursor.modes).toEqual(['fluid']);
  });

  it('round-trips a valid config', () => {
    const parsed = parseConfig(defaultConfig);
    expect(parsed).toEqual(defaultConfig);
  });

  it('is lenient: {} fills defaults instead of throwing', () => {
    expect(parseConfig({})).toEqual(defaultConfig);
    expect(parseConfig(null)).toEqual(defaultConfig);
    expect(parseConfig('garbage')).toEqual(defaultConfig);
  });

  it('clamps out-of-range numerics', () => {
    expect(parseConfig({ scalePct: 99999 }).scalePct).toBe(250);
    expect(parseConfig({ scalePct: -50 }).scalePct).toBe(10);
    expect(parseConfig({ coverage: 5 }).coverage).toBe(1);
    expect(parseConfig({ gravity: -9 }).gravity).toBe(-1);
  });

  it('rejects invalid enum values back to defaults', () => {
    expect(parseConfig({ motion: 'NotAField' }).motion).toBe('Classic');
    expect(parseConfig({ shape: 'Hexagon' }).shape).toBe('Free');
  });

  it('normalizes hex colors (adds missing #)', () => {
    expect(parseConfig({ bg: 'ff0000' }).bg).toBe('#ff0000');
    expect(parseConfig({ bg: 'nothex' }).bg).toBe('#06060c');
  });

  it('drops unknown cursor modes, keeps valid ones', () => {
    expect(parseConfig({ cursor: { modes: ['fluid', 'bogus', 'spotlight'] } }).cursor.modes).toEqual(['fluid', 'spotlight']);
  });

  it('strict schema still surfaces structure', () => {
    expect(PlasmaConfig.safeParse(defaultConfig).success).toBe(true);
  });
});
