// Map between a normalized point in the artboard frame (0..1) and the engine's
// shape-center coords (asp() space), mirroring the legacy setCenterFromScreen /
// placeHandle math. The aspect ratio comes from the selected export frame.
import { ASPECTS, type AspectKey } from '../stores/stage.js';

export function fracToCenter(fx: number, fy: number, aspect: AspectKey): [number, number] {
  const ar = ASPECTS[aspect].w / ASPECTS[aspect].h;
  return [(fx * 2 - 1) * ar, (1 - fy) * 2 - 1];
}

export function centerToFrac(cx: number, cy: number, aspect: AspectKey): [number, number] {
  const ar = ASPECTS[aspect].w / ASPECTS[aspect].h;
  return [(cx / ar + 1) / 2, 1 - (cy + 1) / 2];
}

/** Legacy shape-center presets, in frame fractions. */
export const CENTER_PRESETS: Record<string, [number, number]> = {
  tl: [0.14, 0.16],
  tr: [0.86, 0.16],
  c: [0.5, 0.5],
  bl: [0.14, 0.84],
  br: [0.86, 0.84],
};
