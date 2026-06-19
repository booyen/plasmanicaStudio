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

/**
 * The frame schedule: `L·fps` content timestamps spaced by exactly `1/fps`,
 * starting at 0. Capture advances by this FIXED timestep — never by wall-clock —
 * so every frame lands on an even time offset. (The old loop keyed `tau` to
 * `performance.now()`, so the auto-sampler grabbed unevenly-spaced frames → judder.)
 */
export function videoFrameTimes(durationS: number, fps: number): number[] {
  const n = Math.max(1, Math.round(durationS * fps));
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = i / fps;
  return out;
}

const delay = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

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
  // Manual frame control (captureStream(0) + track.requestFrame) pushes EXACTLY
  // the frame we just drew — one render, one captured frame, evenly spaced. Fall
  // back to auto-sampling only if the track lacks requestFrame.
  let stream = ex.captureStream(0);
  let track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
  const manual = typeof track.requestFrame === 'function';
  if (!manual) {
    stream = ex.captureStream(fps);
    track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
  }
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise<void>((res) => {
    rec.onstop = () => res();
  });
  rec.start();

  // Fixed timestep: render frame i at tau = i/fps, push it, then pace to realtime
  // so MediaRecorder timestamps stay even (output duration ≈ L, no judder).
  const times = videoFrameTimes(L, fps);
  const frameMs = 1000 / fps;
  const start = performance.now();
  for (let i = 0; i < times.length; i++) {
    const tau = times[i]!;
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
    if (manual) track.requestFrame();
    opts.onProgress?.((i + 1) / times.length);
    // Pace capture to realtime so frame timestamps are evenly spaced; if a frame
    // overran its slot, just yield (slower-than-realtime, but still even content).
    const wait = start + (i + 1) * frameMs - performance.now();
    await delay(wait > 0 ? wait : 0);
  }
  rec.stop();
  await stopped;
  r.endExport();
  const ext = mime.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
  return { blob: new Blob(chunks, { type: mime }), ext };
}
