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
];

const SEEK_T = 12.5;

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
