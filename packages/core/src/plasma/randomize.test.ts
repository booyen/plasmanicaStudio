import { describe, it, expect } from 'vitest';
import { randomizeConfig, pathIsLocked, LOCK_GROUPS, mulberry32 } from './randomize.js';
import { defaultConfig, parseConfig } from './config.js';

describe('seeded randomize', () => {
  it('same seed + same locks ⇒ deep-equal', () => {
    const a = randomizeConfig(defaultConfig, {}, 1234);
    const b = randomizeConfig(defaultConfig, {}, 1234);
    expect(a).toEqual(b);
    expect(a.seed).toBe(1234);
  });
  it('different seeds differ', () => {
    expect(randomizeConfig(defaultConfig, {}, 1)).not.toEqual(randomizeConfig(defaultConfig, {}, 2));
  });
  it('restores Math.random even if the roll throws', () => {
    const orig = Math.random;
    try {
      randomizeConfig(defaultConfig, {}, 7);
    } catch {
      /* ignore */
    }
    expect(Math.random).toBe(orig);
  });
  it('overlay is a lock group; locking it preserves overlay', () => {
    expect(LOCK_GROUPS.map((g) => g.key)).toContain('overlay');
    const cur = parseConfig({ ...defaultConfig, overlay: { ...defaultConfig.overlay, type: 'radial', colorA: '#abcdef' } });
    const out = randomizeConfig(cur, { overlay: true }, 99);
    expect(out.overlay).toEqual(cur.overlay);
  });
  it('effects is a lock group; locking it preserves effects', () => {
    expect(LOCK_GROUPS.map((g) => g.key)).toContain('effects');
    const cur = parseConfig({
      ...defaultConfig,
      effects: { ...defaultConfig.effects, bloom: { on: true, threshold: 0.4, intensity: 0.8, radius: 0.6 } },
    });
    const out = randomizeConfig(cur, { effects: true }, 99);
    expect(out.effects).toEqual(cur.effects);
  });
  it('explores the full space — many distinct fields + procedural palettes across seeds', () => {
    const motions = new Set<string>();
    const firstColors = new Set<string>();
    for (let s = 1; s <= 50; s++) {
      const c = randomizeConfig(defaultConfig, {}, s);
      motions.add(c.motion);
      firstColors.add(c.palette[0]);
    }
    expect(motions.size).toBeGreaterThan(5); // not stuck cycling a few themes
    expect(firstColors.size).toBeGreaterThan(20); // procedural palettes → lots of colors
  });

  it('mulberry32 is deterministic + in [0,1)', () => {
    const a = mulberry32(42)(), b = mulberry32(42)();
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
  });
});

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
    expect(randomizeConfig(cur, locks, cur.seed)).toEqual(cur);
  });
});
