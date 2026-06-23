import { test, expect } from '@playwright/test';

// A grid across (motion × material × shape) plus a couple of pattern/flow combos.
// Each renders at a fixed seek time with grain=0 and cursor off (see golden.ts),
// so the screenshot is deterministic and any GLSL/uniform regression shows up.
const SAMPLES: Array<{ name: string; cfg: Record<string, unknown> }> = [
  { name: 'classic-smooth-free', cfg: { motion: 'Classic', material: 'Smooth', shape: 'Free' } },
  { name: 'vortex-neon-spiral', cfg: { motion: 'Vortex', material: 'Neon Gel', shape: 'Spiral' } },
  { name: 'marble-oilslick-mirror', cfg: { motion: 'Marble', material: 'Oil Slick', shape: 'Mirror' } },
  { name: 'liquid-aurora-circle', cfg: { motion: 'Liquid', material: 'Aurora', shape: 'Circle' } },
  { name: 'electric-holographic-angular', cfg: { motion: 'Electric', material: 'Holographic', shape: 'Angular' } },
  { name: 'kaleidoscope-chromatic-polar', cfg: { motion: 'Kaleidoscope', material: 'Chromatic', shape: 'Polar' } },
  {
    name: 'classic-smooth-flow',
    cfg: { motion: 'Classic', material: 'Smooth', shape: 'Free', swirl: 0.4, turbulence: 1.4, flow: { angleDeg: 90, amount: 0.4 } },
  },
  {
    name: 'overlay-radial-multiply',
    cfg: {
      motion: 'Classic', material: 'Smooth', shape: 'Free',
      overlay: { type: 'radial', blend: 'multiply', opacity: 0.9, colorA: '#ffffff', alphaA: 0,
        colorB: '#000010', alphaB: 1, angleDeg: 0, center: [0.5, 0.5], radius: 0.8 },
    },
  },
  // Post-effects: one per effect over the same base look, plus a stacked combo.
  {
    name: 'fx-bloom',
    cfg: { motion: 'Classic', material: 'Smooth', shape: 'Free', effects: { bloom: { on: true, threshold: 0.45, intensity: 0.9, radius: 0.7 } } },
  },
  {
    name: 'fx-blur',
    cfg: { motion: 'Classic', material: 'Smooth', shape: 'Free', effects: { blur: { on: true, strength: 0.7 } } },
  },
  {
    name: 'fx-glass',
    cfg: { motion: 'Classic', material: 'Smooth', shape: 'Free', effects: { glass: { on: true, strength: 0.5, tint: 0.5 } } },
  },
  {
    name: 'fx-pixelate',
    cfg: { motion: 'Classic', material: 'Smooth', shape: 'Free', effects: { pixelate: { on: true, size: 16 } } },
  },
  {
    name: 'fx-stacked-blur-bloom-overlay',
    cfg: {
      motion: 'Classic', material: 'Smooth', shape: 'Free',
      effects: { blur: { on: true, strength: 0.4 }, bloom: { on: true, threshold: 0.5, intensity: 0.7, radius: 0.6 } },
      overlay: { type: 'radial', blend: 'multiply', opacity: 0.9, colorA: '#ffffff', alphaA: 0,
        colorB: '#000010', alphaB: 1, angleDeg: 0, center: [0.5, 0.5], radius: 0.8 },
    },
  },
];

const SEEK_T = 12.5;

test.describe('video export', () => {
  test('exports a real MP4 (ftyp box) via WebCodecs', async ({ page }) => {
    await page.goto('/golden.html');
    await page.waitForFunction(() => typeof window.exportMp4Probe === 'function');
    const res = await page.evaluate(() => window.exportMp4Probe());
    expect(res.type).toBe('video/mp4');
    expect(res.size).toBeGreaterThan(0);
    expect(res.ftyp).toBe('ftyp'); // MP4 signature at byte offset 4
  });
});

test.describe('timeline', () => {
  test('renders a deterministic 2-keyframe midpoint morph', async ({ page }) => {
    await page.goto('/golden.html');
    await page.waitForFunction(() => typeof window.renderTimelineMidpoint === 'function');
    await page.evaluate(() => window.renderTimelineMidpoint());
    await page.waitForTimeout(120);
    await expect(page.locator('canvas')).toHaveScreenshot('timeline-midpoint.png');
  });
});

test.describe('plasma visual goldens', () => {
  for (const s of SAMPLES) {
    test(s.name, async ({ page }) => {
      await page.goto('/golden.html');
      await page.waitForFunction(() => typeof window.renderGolden === 'function');
      await page.evaluate(([cfg, t]) => window.renderGolden(cfg as never, t as number), [s.cfg, SEEK_T] as const);
      // let the GL draw settle before capture
      await page.waitForTimeout(120);
      await expect(page.locator('canvas')).toHaveScreenshot(`${s.name}.png`);
    });
  }
});
