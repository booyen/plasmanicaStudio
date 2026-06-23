import { describe, it, expect, afterEach, vi } from 'vitest';
import { seamlessWeight, crossfadeWindow, videoFrameTimes, supportsWebCodecs, exportVideo } from './video.js';
import { buildEmbed } from './embed.js';
import { defaultConfig } from '../plasma/config-defaults.js';

describe('seamless two-mode crossfade', () => {
  it('window is min(0.7, 0.25·L) — short boundary, never a full-duration dissolve', () => {
    expect(crossfadeWindow(10)).toBe(0.7); // capped
    expect(crossfadeWindow(2)).toBe(0.5); // 0.25·2
    expect(crossfadeWindow(20)).toBe(0.7);
  });

  it('weight is 0 across the whole crisp body, only ramping in the final window', () => {
    const L = 10;
    expect(seamlessWeight(0, L)).toBe(0);
    expect(seamlessWeight(L - crossfadeWindow(L) - 0.01, L)).toBe(0); // just before window
    expect(seamlessWeight(L - crossfadeWindow(L), L)).toBe(0); // window start
    expect(seamlessWeight(L, L)).toBeCloseTo(1, 5); // melts fully into the start
  });

  it('ramps monotonically (smoothstep) inside the window', () => {
    const L = 8;
    const B = crossfadeWindow(L);
    let prev = -1;
    for (let tau = L - B; tau <= L; tau += B / 10) {
      const w = seamlessWeight(tau, L);
      expect(w).toBeGreaterThanOrEqual(prev);
      prev = w;
    }
  });
});

describe('videoFrameTimes — fixed timestep, not wall-clock', () => {
  it('emits exactly L·fps frames spaced by 1/fps, starting at 0', () => {
    const t = videoFrameTimes(2, 30);
    expect(t.length).toBe(60);
    expect(t[0]).toBe(0);
    expect(t[1] - t[0]).toBeCloseTo(1 / 30, 9);
    expect(t[t.length - 1]).toBeCloseTo(59 / 30, 9);
  });

  it('is perfectly evenly spaced (the property the choppy wall-clock loop violated)', () => {
    const fps = 30;
    const t = videoFrameTimes(5, fps);
    for (let i = 1; i < t.length; i++) {
      expect(t[i] - t[i - 1]).toBeCloseTo(1 / fps, 9);
    }
  });

  it('never returns an empty schedule', () => {
    expect(videoFrameTimes(0, 30).length).toBeGreaterThanOrEqual(1);
  });
});

describe('buildEmbed', () => {
  it('emits a <plasma-bg> with the round-trippable config and a script tag', () => {
    const html = buildEmbed(defaultConfig);
    expect(html).toContain('<plasma-bg');
    expect(html).toContain('<script type="module"');
    const m = html.match(/config='([^']*)'/);
    expect(m).toBeTruthy();
    const json = m![1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    expect(JSON.parse(json)).toEqual(defaultConfig);
  });

  it('honors a custom script URL', () => {
    expect(buildEmbed(defaultConfig, { scriptUrl: 'https://x.example/p.js' })).toContain(
      'src="https://x.example/p.js"',
    );
  });
});

describe('supportsWebCodecs', () => {
  const g = globalThis as Record<string, unknown>;
  afterEach(() => { delete g.VideoEncoder; delete g.VideoFrame; });

  it('false when VideoEncoder is missing', () => {
    delete g.VideoEncoder; g.VideoFrame = class {};
    expect(supportsWebCodecs()).toBe(false);
  });

  it('false when VideoFrame is missing', () => {
    g.VideoEncoder = class {}; delete g.VideoFrame;
    expect(supportsWebCodecs()).toBe(false);
  });

  it('true when both are present', () => {
    g.VideoEncoder = class {}; g.VideoFrame = class {};
    expect(supportsWebCodecs()).toBe(true);
  });
});

vi.mock('./video-webcodecs.js', () => ({
  pickH264Codec: vi.fn(async () => 'avc1.640028'),
  exportVideoWebCodecs: vi.fn(async () => ({ blob: new Blob(['mp4'], { type: 'video/mp4' }), ext: 'mp4' })),
}));

describe('exportVideo backend dispatch', () => {
  const g = globalThis as Record<string, unknown>;
  const fakeR = { time: 0, beginExport() {}, endExport() {}, renderAt() {}, get element() { return {}; } } as never;
  afterEach(() => { delete g.VideoEncoder; delete g.VideoFrame; });

  it('uses WebCodecs MP4 when supported and a codec is found', async () => {
    g.VideoEncoder = class {}; g.VideoFrame = class {};
    const { ext } = await exportVideo(fakeR, { durationS: 1, mode: 'cont', quality: 'lite', fps: 10 });
    expect(ext).toBe('mp4');
  });

  it('falls back to MediaRecorder (rejects in jsdom) when WebCodecs is absent', async () => {
    delete g.VideoEncoder; delete g.VideoFrame;
    // jsdom has no MediaRecorder, so the fallback path throws its guard — proving dispatch chose it.
    await expect(exportVideo(fakeR, { durationS: 1, mode: 'cont', quality: 'lite', fps: 10 }))
      .rejects.toThrow(/MediaRecorder/);
  });
});
