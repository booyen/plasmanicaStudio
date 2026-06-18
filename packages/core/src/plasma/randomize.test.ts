import { describe, it, expect } from 'vitest';
import { randomizeConfig, pathIsLocked, LOCK_GROUPS } from './randomize.js';
import { defaultConfig, parseConfig } from './config.js';

describe('lock-and-randomize', () => {
  it('LOCK_GROUPS covers every documented group', () => {
    const keys = LOCK_GROUPS.map((g) => g.key);
    expect(keys).toEqual(
      expect.arrayContaining(['color', 'motion', 'material', 'shape', 'pattern', 'cursor']),
    );
  });

  it('pathIsLocked: true for the path itself or its containing group', () => {
    expect(pathIsLocked('palette', { color: true })).toBe(true);
    expect(pathIsLocked('bg', { color: true })).toBe(true);
    expect(pathIsLocked('cursor.lag', { cursor: true })).toBe(true); // group
    expect(pathIsLocked('cursor.lag', { 'cursor.lag': true })).toBe(true); // own path
    expect(pathIsLocked('speed', { color: true })).toBe(false);
  });

  it('locked color preserves palette+bg but re-rolls unlocked fields', () => {
    const cur = parseConfig({ ...defaultConfig, palette: ['#123456', '#abcdef'], bg: '#010203' });
    let changed = false;
    for (let i = 0; i < 40; i++) {
      const out = randomizeConfig(cur, { color: true });
      expect(out.palette).toEqual(cur.palette);
      expect(out.bg).toBe(cur.bg);
      if (
        out.motion !== cur.motion ||
        out.speed !== cur.speed ||
        out.swirl !== cur.swirl ||
        out.contrast !== cur.contrast
      )
        changed = true;
    }
    expect(changed).toBe(true);
  });

  it('all groups locked → output deep-equals current', () => {
    const cur = parseConfig({ ...defaultConfig, speed: 0.5, scalePct: 130, palette: ['#abcdef'], bg: '#111111' });
    const locks = Object.fromEntries(LOCK_GROUPS.map((g) => [g.key, true]));
    expect(randomizeConfig(cur, locks)).toEqual(cur);
  });
});
