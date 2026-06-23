// Pure, zero-dependency keyframe interpolation over CoreConfig. Two clocks:
// motion time lives in the renderer; this module only morphs the *look*.

export type Easing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

/** Remap u in [0,1] by the named easing. Endpoints stay 0 and 1. */
export function applyEasing(easing: Easing, u: number): number {
  switch (easing) {
    case 'ease-in':
      return u * u;
    case 'ease-out':
      return u * (2 - u);
    case 'ease-in-out':
      return u * u * (3 - 2 * u);
    default:
      return u;
  }
}
