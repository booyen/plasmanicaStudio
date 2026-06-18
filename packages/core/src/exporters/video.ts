// Video export, carrying the already-fixed two-mode logic from the legacy file:
//   • Continuous — a single crisp playhead, no ghosting.
//   • Seamless loop — only the final B seconds crossfade into the start, so the
//     end melts into the beginning (B = min(0.7, 0.25·L)), NOT a full-duration
//     dissolve. Do not regress this.
import type { PlasmaRenderer } from '../plasma/renderer.js';

export type VideoMode = 'cont' | 'loop';
export type VideoQuality = 'lite' | 'hd';
export type VideoOpts = {
  durationS: number;
  mode: VideoMode;
  quality: VideoQuality;
  fps?: number;
  onProgress?: (p: number) => void;
};

const QUALITY: Record<VideoQuality, { w: number; h: number; bitrate: number }> = {
  lite: { w: 1280, h: 720, bitrate: 2_500_000 },
  hd: { w: 1920, h: 1080, bitrate: 6_000_000 },
};

/** Seamless crossfade window length (s): the final B seconds only, capped at 0.7. */
export function crossfadeWindow(durationS: number): number {
  return Math.min(0.7, durationS * 0.25);
}

/**
 * Seamless-loop crossfade weight at phase `tau` of an `L`-second clip: 0 for the
 * whole crisp body, smoothstep-ramping to 1 only across the final B seconds so the
 * end melts into the start. NOT a full-duration dissolve — guards the legacy fix.
 */
export function seamlessWeight(tau: number, L: number): number {
  const B = crossfadeWindow(L);
  if (tau <= L - B) return 0;
  let w = (tau - (L - B)) / B;
  w = w * w * (3.0 - 2.0 * w); // smoothstep
  return w;
}

function pickMime(): string {
  const o = ['video/mp4;codecs=h264', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  for (const m of o) if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  return 'video/webm';
}

export async function exportVideo(
  r: PlasmaRenderer,
  opts: VideoOpts,
): Promise<{ blob: Blob; ext: string }> {
  if (typeof MediaRecorder === 'undefined') throw new Error('MediaRecorder not supported in this browser');
  const { durationS: L, mode, quality } = opts;
  const fps = opts.fps ?? 30;
  const { w: W, h: H, bitrate } = QUALITY[quality];
  const base = r.time; // start from the current live phase

  r.beginExport(W, H);
  const ex = document.createElement('canvas');
  ex.width = W;
  ex.height = H;
  const ctx = ex.getContext('2d')!;
  const mime = pickMime();
  const stream = ex.captureStream(fps);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise<void>((res) => {
    rec.onstop = () => res();
  });
  rec.start();
  const start = performance.now();
  await new Promise<void>((res) => {
    function step() {
      const elapsed = (performance.now() - start) / 1000;
      const p = elapsed / L;
      if (p >= 1) {
        res();
        return;
      }
      const tau = p * L;
      // crisp body: single playhead, no ghosting
      r.renderAt(base + tau);
      ctx.globalAlpha = 1;
      ctx.drawImage(r.element, 0, 0, W, H);
      // seamless: short boundary crossfade only in the final B seconds
      const w = mode === 'loop' ? seamlessWeight(tau, L) : 0;
      if (w > 0) {
        r.renderAt(base + tau - L);
        ctx.globalAlpha = w;
        ctx.drawImage(r.element, 0, 0, W, H);
      }
      opts.onProgress?.(p);
      requestAnimationFrame(step);
    }
    step();
  });
  rec.stop();
  await stopped;
  r.endExport();
  const ext = mime.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
  return { blob: new Blob(chunks, { type: mime }), ext };
}
