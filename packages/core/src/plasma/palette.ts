// Perceptual palette generator in OKLCH (OKLab in cylindrical L,C,H). Produces
// smoother, more evenly-saturated harmonies than the legacy HSL generator (no
// muddy mid-tones). Reuses the OKLab→sRGB transform from overlay.ts.
import { oklabToSrgb } from './overlay.js';

export type HarmonyMode = 'analogous' | 'complementary' | 'triadic' | 'mono' | 'random';

const to2 = (v: number) => ('0' + Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16)).slice(-2);

/** OKLCH (L 0..1, C chroma, H degrees) → #rrggbb (gamut-clamped). */
export function oklchToHex(L: number, C: number, H: number): string {
  const h = (H * Math.PI) / 180;
  const [r, g, b] = oklabToSrgb([L, C * Math.cos(h), C * Math.sin(h)]);
  return '#' + to2(r) + to2(g) + to2(b);
}

/** Generate a harmonious palette in OKLCH. Hues wrap; chroma kept mostly in-gamut. */
export function generatePaletteOklch(mode: HarmonyMode | string): string[] {
  const base = Math.random() * 360;
  const C = 0.1 + Math.random() * 0.07; // moderate chroma → stays in sRGB at most hues
  const mk = (dh: number, L: number, c = C) => oklchToHex(L, c, base + dh);

  switch (mode) {
    case 'analogous':
      return [-40, -20, 0, 20, 40].map((dh, i) => mk(dh, 0.45 + i * 0.09));
    case 'complementary':
      return [mk(0, 0.5), mk(0, 0.72), mk(180, 0.55), mk(180, 0.78)];
    case 'triadic':
      return [mk(0, 0.58), mk(120, 0.62), mk(240, 0.56)];
    case 'mono':
      return [0.34, 0.52, 0.7, 0.86].map((L) => mk(0, L));
    default: {
      // random — a few free hues at varied lightness
      const n = 3 + Math.floor(Math.random() * 3);
      return Array.from({ length: n }, () => oklchToHex(0.45 + Math.random() * 0.4, C, Math.random() * 360));
    }
  }
}
