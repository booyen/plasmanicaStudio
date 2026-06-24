// Owns the morph state for a <plasma-bg>. One rAF "morph driver" powers
// animateTo()/play(); seek() is stateless for external scrubbing (GSAP). The
// renderer's own motion loop is untouched — we only call setConfig (two clocks).
import {
  mergeConfigPatch,
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

  /** Tear down (called on element disconnect). */
  dispose(): void {
    this.cancel();
  }
}
