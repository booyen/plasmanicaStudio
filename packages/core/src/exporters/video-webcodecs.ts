// WebCodecs MP4 backend: encodes VideoFrames with VideoEncoder and muxes H.264
// chunks into MP4 via mp4-muxer. No realtime pacing — faster than realtime.

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
