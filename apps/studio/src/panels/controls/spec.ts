// Slider control specs. Values are in the same units the store holds (which
// match the legacy on-screen display units), so toConfig/toDisplay are identity
// for everything except `grain` (legacy noise = slider/100*0.25, shown as 0..1).
export type ParamSpec = {
  key: string;
  label: string;
  path: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  decimals?: number;
  /** Draw a center tick at this value (for bipolar / 1.0-neutral sliders). */
  center?: number;
  toConfig?: (display: number) => number;
  toDisplay?: (config: number) => number;
};

export const PARAMS = {
  speed: { key: 'speed', label: 'speed', path: 'speed', min: 0, max: 1, step: 0.01, decimals: 2 },
  scale: { key: 'scale', label: 'scale', path: 'scalePct', min: 10, max: 250, step: 1, unit: '%', decimals: 0 },
  swirl: { key: 'swirl', label: 'swirl', path: 'swirl', min: 0, max: 1, step: 0.01, decimals: 2 },
  turb: { key: 'turb', label: 'turbulence', path: 'turbulence', min: 0, max: 1, step: 0.01, decimals: 2 },
  flowAng: { key: 'flowAng', label: 'flow dir', path: 'flow.angleDeg', min: 0, max: 360, step: 1, unit: '°', decimals: 0 },
  rotate: { key: 'rotate', label: 'rotate', path: 'rotateDeg', min: -180, max: 180, step: 1, unit: '°', decimals: 0, center: 0 },
  flowAmt: { key: 'flowAmt', label: 'flow amount', path: 'flow.amount', min: 0, max: 1, step: 0.01, decimals: 2 },
  detail: { key: 'detail', label: 'detail', path: 'detail', min: 0.1, max: 4, step: 0.05, decimals: 2, center: 1 },
  gravity: { key: 'gravity', label: 'gravity', path: 'gravity', min: -1, max: 1, step: 0.01, decimals: 2, center: 0 },
  cover: { key: 'cover', label: 'coverage', path: 'coverage', min: 0, max: 1, step: 0.01, decimals: 2 },
  contrast: { key: 'contrast', label: 'contrast', path: 'contrast', min: 0.2, max: 2.2, step: 0.01, decimals: 2, center: 1 },
  vis: { key: 'vis', label: 'visibility', path: 'visibility', min: 0, max: 1, step: 0.01, decimals: 2 },
  grain: {
    key: 'grain',
    label: 'noise',
    path: 'grain',
    min: 0,
    max: 1,
    step: 0.01,
    decimals: 2,
    toConfig: (d: number) => d * 0.25,
    toDisplay: (c: number) => c / 0.25,
  },
  curStr: { key: 'curStr', label: 'strength', path: 'cursor.strength', min: 0, max: 2, step: 0.01, decimals: 2, center: 1 },
  curSize: { key: 'curSize', label: 'size', path: 'cursor.size', min: 0.1, max: 1.2, step: 0.01, decimals: 2 },
  curTrail: { key: 'curTrail', label: 'trail', path: 'cursor.trail', min: 0, max: 1, step: 0.01, decimals: 2 },
  curChurn: { key: 'curChurn', label: 'turbulence', path: 'cursor.turbulence', min: 0, max: 1.5, step: 0.01, decimals: 2 },
  curLag: { key: 'curLag', label: 'lag', path: 'cursor.lag', min: 0, max: 1, step: 0.01, decimals: 2 },
  ovOpacity: { key: 'ovOpacity', label: 'opacity', path: 'overlay.opacity', min: 0, max: 1, step: 0.01, decimals: 2 },
  ovAlphaA: { key: 'ovAlphaA', label: 'stop A alpha', path: 'overlay.alphaA', min: 0, max: 1, step: 0.01, decimals: 2 },
  ovAlphaB: { key: 'ovAlphaB', label: 'stop B alpha', path: 'overlay.alphaB', min: 0, max: 1, step: 0.01, decimals: 2 },
  ovAngle: { key: 'ovAngle', label: 'angle', path: 'overlay.angleDeg', min: 0, max: 360, step: 1, unit: '°', decimals: 0 },
  ovRadius: { key: 'ovRadius', label: 'radius', path: 'overlay.radius', min: 0.05, max: 2, step: 0.01, decimals: 2 },
  ovCenterX: { key: 'ovCenterX', label: 'center x', path: 'overlay.center.0', min: -1, max: 2, step: 0.01, decimals: 2 },
  ovCenterY: { key: 'ovCenterY', label: 'center y', path: 'overlay.center.1', min: -1, max: 2, step: 0.01, decimals: 2 },
} satisfies Record<string, ParamSpec>;

export type ParamKey = keyof typeof PARAMS;
