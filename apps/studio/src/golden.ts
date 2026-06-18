// Deterministic render harness for the Playwright visual goldens. A fixed-size
// canvas (no artboard, no DPR scaling), grain + cursor forced off, and an explicit
// seek time — so the same config always yields the same pixels. Driven from the
// spec via window.renderGolden().
import { PlasmaRenderer, parseConfig, type CoreConfig } from '@effects/core';

const W = 480;
const H = 270;

const canvas = document.createElement('canvas');
canvas.width = W;
canvas.height = H;
canvas.style.cssText = `width:${W}px;height:${H}px;display:block`;
document.body.appendChild(canvas);

const renderer = new PlasmaRenderer(canvas);
renderer.setPaused(true);

declare global {
  interface Window {
    renderGolden: (cfg: Partial<CoreConfig>, t: number) => void;
  }
}

window.renderGolden = (cfg, t) => {
  // Force determinism: no per-pixel grain, no cursor/flowmap.
  const full = parseConfig({ ...cfg, grain: 0, cursor: { on: false, modes: [] } });
  canvas.width = W;
  canvas.height = H;
  renderer.setConfig(full);
  renderer.seek(t);
  renderer.renderAt(t);
};
