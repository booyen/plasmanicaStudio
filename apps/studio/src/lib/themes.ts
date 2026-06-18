// Studio-facing re-exports of the engine's palette/theme data, so panels import
// from one place (and we can swap sources later without touching every panel).
export {
  GRADIENTS,
  THEMES,
  THEME_NAMES,
  generatePalette,
  generatePaletteOklch,
  FIELD_NAMES,
  MATERIAL_NAMES,
  SHAPE_NAMES,
  CURSOR_MODES,
} from '@effects/core';

export const HARMONY_MODES = ['random', 'analogous', 'complementary', 'triadic', 'mono'] as const;
export type HarmonyMode = (typeof HARMONY_MODES)[number];
