// Apply a legacy THEME "vibe" by name, merged over the CURRENT config (vibe
// chips). The mapping itself lives in core (themeToConfig) so randomize + studio
// stay in sync. randomizeConfig (surprise-me) rolls over defaults instead.
import { type CoreConfig, themeToConfig, randomThemeName, THEMES } from '@effects/core';

export { randomThemeName };

export function applyTheme(name: string, base: CoreConfig): CoreConfig {
  const make = (THEMES as Record<string, () => Record<string, unknown>>)[name];
  return make ? themeToConfig(make(), base) : base;
}
