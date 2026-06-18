import { describe, it, expect } from 'vitest';
import { seamlessWeight, crossfadeWindow } from './video.js';
import { buildEmbed } from './embed.js';
import { defaultConfig } from '../plasma/config-defaults.js';

describe('seamless two-mode crossfade', () => {
  it('window is min(0.7, 0.25·L) — short boundary, never a full-duration dissolve', () => {
    expect(crossfadeWindow(10)).toBe(0.7); // capped
    expect(crossfadeWindow(2)).toBe(0.5); // 0.25·2
    expect(crossfadeWindow(20)).toBe(0.7);
  });

  it('weight is 0 across the whole crisp body, only ramping in the final window', () => {
    const L = 10;
    expect(seamlessWeight(0, L)).toBe(0);
    expect(seamlessWeight(L - crossfadeWindow(L) - 0.01, L)).toBe(0); // just before window
    expect(seamlessWeight(L - crossfadeWindow(L), L)).toBe(0); // window start
    expect(seamlessWeight(L, L)).toBeCloseTo(1, 5); // melts fully into the start
  });

  it('ramps monotonically (smoothstep) inside the window', () => {
    const L = 8;
    const B = crossfadeWindow(L);
    let prev = -1;
    for (let tau = L - B; tau <= L; tau += B / 10) {
      const w = seamlessWeight(tau, L);
      expect(w).toBeGreaterThanOrEqual(prev);
      prev = w;
    }
  });
});

describe('buildEmbed', () => {
  it('emits a <plasma-bg> with the round-trippable config and a script tag', () => {
    const html = buildEmbed(defaultConfig);
    expect(html).toContain('<plasma-bg');
    expect(html).toContain('<script type="module"');
    const m = html.match(/config='([^']*)'/);
    expect(m).toBeTruthy();
    const json = m![1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    expect(JSON.parse(json)).toEqual(defaultConfig);
  });

  it('honors a custom script URL', () => {
    expect(buildEmbed(defaultConfig, { scriptUrl: 'https://x.example/p.js' })).toContain(
      'src="https://x.example/p.js"',
    );
  });
});
