// WebCodecs MP4 backend: encodes VideoFrames with VideoEncoder and muxes H.264
// chunks into MP4 via mp4-muxer. No realtime pacing — faster than realtime.
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type { PlasmaRenderer } from '../plasma/renderer.js';
import { QUALITY, videoFrameTimes, renderFrameToCanvas, type VideoOpts } from './video.js';

const H264_CANDIDATES = ['avc1.640028', 'avc1.4d4028', 'avc1.42e01e']; // High > Main > Baseline

type ConfigProbe = (cfg: VideoEncoderConfig) => Promise<{ supported?: boolean }>;

/** First H.264 codec string the probe reports supported for this output, else null. */
export async function pickH264Codec(
  W: number, H: number, fps: number, bitrate: number,
  probe: ConfigProbe = (cfg) => VideoEncoder.isConfigSupported(cfg),
): Promise<string | null> {
  for (const codec of H264_CANDIDATES) {
    const res = await probe({ codec, width: W, height: H, framerate: fps, bitrate });
    if (res?.supported) return codec;
  }
  return null;
}

const yieldToEncoder = () => new Promise<void>((res) => setTimeout(res, 0));

/**
 * WebCodecs MP4 export. Renders each scheduled frame, encodes H.264 via
 * VideoEncoder, muxes into MP4 with mp4-muxer. No realtime pacing → faster than
 * realtime. `codec` is the resolved string from pickH264Codec().
 */
export async function exportVideoWebCodecs(
  r: PlasmaRenderer, opts: VideoOpts, codec: string,
): Promise<{ blob: Blob; ext: 'mp4' }> {
  const { durationS: L, mode } = opts;
  const fps = opts.fps ?? 30;
  const { w: W, h: H, bitrate } = QUALITY[opts.quality];
  const base = r.time;

  r.beginExport(W, H);
  let encoder: VideoEncoder | undefined;
  try {
    const ex = document.createElement('canvas');
    ex.width = W;
    ex.height = H;
    const ctx = ex.getContext('2d')!;

    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      // 'avc' is correct only while every entry in H264_CANDIDATES is an AVC
      // profile (avc1.*). If a non-AVC candidate (e.g. HEVC hvc1.*) is ever
      // added to pickH264Codec, derive this from the chosen `codec` instead.
      video: { codec: 'avc', width: W, height: H },
      fastStart: 'in-memory',
    });
    let encErr: unknown = null;
    encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => { encErr = e; },
    });
    encoder.configure({ codec, width: W, height: H, bitrate, framerate: fps });

    const times = videoFrameTimes(L, fps);
    const usPerFrame = 1_000_000 / fps;
    const kf = Math.max(1, Math.round(fps * 2)); // keyframe ~every 2s
    for (let i = 0; i < times.length; i++) {
      if (encErr) throw encErr;
      renderFrameToCanvas(r, ctx, base, times[i]!, L, mode, W, H);
      const frame = new VideoFrame(ex, { timestamp: Math.round(i * usPerFrame), duration: Math.round(usPerFrame) });
      try {
        encoder.encode(frame, { keyFrame: i % kf === 0 });
      } finally {
        frame.close();
      }
      opts.onProgress?.((i + 1) / times.length);
      // Backpressure: keep the encoder queue (and memory) bounded on long clips.
      while (encoder.encodeQueueSize > 2) await yieldToEncoder();
    }
    await encoder.flush();
    if (encErr) throw encErr;
    muxer.finalize();
    const { buffer } = muxer.target as ArrayBufferTarget;
    return { blob: new Blob([buffer], { type: 'video/mp4' }), ext: 'mp4' };
  } finally {
    if (encoder && encoder.state !== 'closed') encoder.close();
    r.endExport();
  }
}
