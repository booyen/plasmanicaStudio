// Apply a legacy THEME "vibe" over the current config. THEMES emit legacy keys
// (field/mat/turb/grav/noise/rot…) and only touch a subset — detail/visibility/
// cursor are preserved. Mirrors the legacy applyConfig mapper (incl. noise*0.25).
import { parseConfig, type CoreConfig } from '@effects/core';
import { THEMES, THEME_NAMES } from './themes.js';

export function randomThemeName(): string {
  return THEME_NAMES[Math.floor(Math.random() * THEME_NAMES.length)];
}

type ThemeOutput = Record<string, any>;

export function themeToConfig(o: ThemeOutput, base: CoreConfig): CoreConfig {
  return parseConfig({
    ...base,
    motion: o.field,
    material: o.mat,
    shape: o.shape,
    palette: o.palette,
    bg: o.bg,
    speed: o.speed,
    scalePct: o.scalePct,
    swirl: o.swirl,
    turbulence: o.turb,
    flow: { angleDeg: o.flowAng ?? base.flow.angleDeg, amount: o.flowAmt ?? base.flow.amount },
    coverage: o.cover,
    contrast: o.contrast,
    gravity: o.grav,
    grain: (o.noise ?? 0) * 0.25,
    rotateDeg: o.rot ?? base.rotateDeg,
    center: o.center ?? base.center,
  });
}

export function applyTheme(name: string, base: CoreConfig): CoreConfig {
  const make = (THEMES as Record<string, () => ThemeOutput>)[name];
  return make ? themeToConfig(make(), base) : base;
}
