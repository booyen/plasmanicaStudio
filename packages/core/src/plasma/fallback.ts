// Never-black: when WebGL is unavailable, hosts paint a static CSS gradient built
// from the look's palette instead of a black box. Zero-dep so the embed uses it too.
import type { CoreConfig } from './config.js';

/** A CSS linear-gradient across the palette over the background — always ≥2 stops. */
export function paletteGradientCss(palette: string[], bg: string): string {
  const stops = palette.length >= 2 ? palette : [bg, ...(palette.length ? palette : ['#222'])];
  return `linear-gradient(135deg, ${stops.join(', ')})`;
}

export function fallbackGradient(cfg: Pick<CoreConfig, 'palette' | 'bg'>): string {
  return paletteGradientCss(cfg.palette, cfg.bg);
}
