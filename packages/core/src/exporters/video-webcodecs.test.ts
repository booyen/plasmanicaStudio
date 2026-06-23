import { describe, it, expect, vi } from 'vitest';
import { pickH264Codec } from './video-webcodecs.js';

describe('pickH264Codec', () => {
  it('returns the first candidate the probe reports supported', async () => {
    const probe = vi.fn(async (cfg: { codec: string }) => ({ supported: cfg.codec === 'avc1.4d4028' }));
    const codec = await pickH264Codec(1920, 1080, 30, 6_000_000, probe);
    expect(codec).toBe('avc1.4d4028');
    // tried High first, then Main
    expect(probe.mock.calls[0]![0].codec).toBe('avc1.640028');
  });

  it('returns null when no candidate is supported', async () => {
    const probe = vi.fn(async () => ({ supported: false }));
    expect(await pickH264Codec(1280, 720, 30, 2_500_000, probe)).toBeNull();
  });

  it('passes width/height/bitrate/framerate through to the probe', async () => {
    const probe = vi.fn(async () => ({ supported: true }));
    await pickH264Codec(1280, 720, 24, 1_234_000, probe);
    const cfg = probe.mock.calls[0]![0];
    expect(cfg).toMatchObject({ width: 1280, height: 720, framerate: 24, bitrate: 1_234_000 });
  });
});
