// Deterministic render harness for the Playwright visual goldens. A fixed-size
// canvas (no artboard, no DPR scaling), grain + cursor forced off, and an explicit
// seek time — so the same config always yields the same pixels. Driven from the
// spec via window.renderGolden().
import { PlasmaRenderer, parseConfig, exportVideo, sampleTimeline, type CoreConfig, type Timeline } from '@effects/core';

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
    exportMp4Probe: () => Promise<{ type: string; size: number; ftyp: string }>;
    renderTimelineMidpoint: () => void;
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

window.renderTimelineMidpoint = () => {
  const base = { grain: 0, cursor: { on: false, modes: [] as string[] } };
  const tl: Timeline = {
    duration: 10,
    keyframes: [
      { id: 'a', t: 0, easing: 'linear', config: parseConfig({ ...base, motion: 'Classic', palette: ['#2b5fff', '#00e0d0'] }) },
      { id: 'b', t: 10, easing: 'linear', config: parseConfig({ ...base, motion: 'Classic', palette: ['#ff7a3c', '#ff3c9e'] }) },
    ],
  };
  const mid = sampleTimeline(tl, 5);
  canvas.width = W;
  canvas.height = H;
  renderer.setConfig(mid);
  renderer.seek(12.5);
  renderer.renderAt(12.5);
};

window.exportMp4Probe = async () => {
  renderer.setConfig(parseConfig({ grain: 0, cursor: { on: false, modes: [] } }));
  const { blob } = await exportVideo(renderer, { durationS: 0.3, mode: 'cont', quality: 'lite', fps: 10 });
  const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  const ftyp = String.fromCharCode(head[4]!, head[5]!, head[6]!, head[7]!);
  return { type: blob.type, size: blob.size, ftyp };
};
