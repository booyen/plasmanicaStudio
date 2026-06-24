// Owns the morph state for a <plasma-bg>. One rAF "morph driver" powers
// animateTo()/play(); seek() is stateless for external scrubbing (GSAP). The
// renderer's own motion loop is untouched — we only call setConfig (two clocks).
import {
  mergeConfigPatch,
  lerpConfigRaw,
  sampleTimelineRaw,
  applyEasing,
  type CoreConfig,
  type Timeline,
  type Easing,
  type DeepPartial,
} from '@effects/core';

export interface MorphTarget {
  setConfig(cfg: CoreConfig): void;
}

export interface ControllerEnv {
  raf: (cb: (ms: number) => void) => number;
  caf: (id: number) => void;
  reducedMotion: () => boolean;
}

export interface AnimateOpts {
  duration?: number; // seconds, default 0.6
  /**
   * Named easing or a custom function.
   *
   * A custom function should map [0,1] → [0,1]. Easings that overshoot
   * (returning values outside that range, e.g. elastic or back curves) can
   * drive config fields out of their valid range, because the embed path
   * interpolates raw — without a zod re-clamp.
   */
  easing?: Easing | ((u: number) => number); // default 'ease-in-out'
}

export const defaultEnv: ControllerEnv = {
  raf: (cb) => (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(cb) : 0),
  caf: (id) => { if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(id); },
  reducedMotion: () =>
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
};

export class PlasmaController {
  private cfg: CoreConfig;
  private tl: Timeline | null = null;
  private prog = 0;
  private raf = 0;

  constructor(
    private readonly renderer: MorphTarget,
    initial: CoreConfig,
    private readonly env: ControllerEnv = defaultEnv,
  ) {
    this.cfg = initial;
  }

  getConfig(): CoreConfig {
    return this.cfg;
  }

  get progress(): number {
    return this.prog;
  }

  /** Stop the morph driver (animateTo/play). seek and set call this first. */
  private cancel(): void {
    if (this.raf) this.env.caf(this.raf);
    this.raf = 0;
  }

  /** Instantly apply a partial patch over the current look. */
  set(patch: DeepPartial<CoreConfig>): void {
    this.cancel();
    this.cfg = mergeConfigPatch(this.cfg, patch);
    this.renderer.setConfig(this.cfg);
  }

  /** Tween the current look toward a merged target. Resolves on completion. */
  animateTo(patch: DeepPartial<CoreConfig>, opts: AnimateOpts = {}): Promise<void> {
    this.cancel();
    const from = this.cfg;
    const target = mergeConfigPatch(this.cfg, patch);
    const duration = opts.duration ?? 0.6;
    const ease =
      typeof opts.easing === 'function'
        ? opts.easing
        : (u: number) => applyEasing((opts.easing as Easing) ?? 'ease-in-out', u);

    if (this.env.reducedMotion() || duration <= 0) {
      this.cfg = target;
      this.renderer.setConfig(target);
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      let start = -1;
      const tick = (ms: number) => {
        if (start < 0) start = ms;
        const u = Math.min(1, (ms - start) / (duration * 1000));
        this.renderer.setConfig(lerpConfigRaw(from, target, ease(u)));
        if (u >= 1) {
          this.cfg = target;
          this.raf = 0;
          resolve();
        } else {
          this.raf = this.env.raf(tick);
        }
      };
      this.raf = this.env.raf(tick);
    });
  }

  /** Load a timeline; resets progress to 0. Does not start playback. */
  timeline(tl: Timeline): void {
    this.tl = tl;
    this.prog = 0;
  }

  /** Self-drive the loaded timeline. Loops by default. */
  play(opts: { loop?: boolean } = {}): void {
    this.cancel();
    if (!this.tl) return;
    const loop = opts.loop ?? true;
    const tl = this.tl;

    if (this.env.reducedMotion()) {
      this.renderer.setConfig(sampleTimelineRaw(tl, 0)); // first keyframe still
      return;
    }

    let prev = -1;
    const tick = (ms: number) => {
      if (prev < 0) prev = ms;
      const dt = (ms - prev) / 1000;
      prev = ms;
      this.prog += dt;
      if (this.prog >= tl.duration) {
        if (loop) {
          this.prog = tl.duration > 0 ? this.prog % tl.duration : 0;
        } else {
          this.prog = tl.duration;
          this.renderer.setConfig(sampleTimelineRaw(tl, this.prog));
          this.raf = 0;
          return;
        }
      }
      this.renderer.setConfig(sampleTimelineRaw(tl, this.prog));
      this.raf = this.env.raf(tick);
    };
    this.raf = this.env.raf(tick);
  }

  /** Stop self-driven playback; keep progress. */
  pause(): void {
    this.cancel();
  }

  /** Sample the loaded timeline at absolute time `t` and apply. Stateless —
   * for external scrubbing (GSAP/ScrollTrigger). Cancels any running driver. */
  seek(t: number): void {
    this.cancel();
    if (!this.tl) return;
    this.prog = Math.min(this.tl.duration, Math.max(0, t));
    this.renderer.setConfig(sampleTimelineRaw(this.tl, this.prog));
  }

  /** Tear down (called on element disconnect). */
  dispose(): void {
    this.cancel();
  }
}
