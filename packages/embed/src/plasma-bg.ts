// <plasma-bg> — a framework-free custom element that runs the core PlasmaRenderer
// from a `config` attribute (JSON). No React, no zod (config is trusted JSON, not
// re-validated), so the bundle stays small enough to drop onto any page.
import { PlasmaRenderer, paletteGradientCss, defaultConfig, type CoreConfig } from '@effects/core';
import { PlasmaController, type AnimateOpts } from './controller.js';
import type { Timeline, DeepPartial } from '@effects/core';

export { PlasmaController } from './controller.js';
export type { ControllerEnv, AnimateOpts, MorphTarget } from './controller.js';

export class PlasmaBg extends HTMLElement {
  private renderer: PlasmaRenderer | null = null;
  private controller: PlasmaController | null = null;

  /** Trusted config from the `config` attribute (merged over defaults), or defaults. */
  private readConfig(): CoreConfig {
    const raw = this.getAttribute('config');
    if (raw) {
      try {
        return { ...defaultConfig, ...(JSON.parse(raw) as CoreConfig) };
      } catch {
        // fall through to defaults on malformed attribute
      }
    }
    return defaultConfig;
  }

  connectedCallback() {
    if (this.renderer) return;
    const cfg = this.readConfig();
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:100%;height:100%;display:block';
    this.appendChild(canvas);

    let renderer: PlasmaRenderer;
    try {
      renderer = new PlasmaRenderer(canvas);
    } catch {
      // never-black: WebGL unavailable → static CSS gradient from the palette
      this.removeChild(canvas);
      this.style.background = paletteGradientCss(cfg.palette, cfg.bg);
      return;
    }
    renderer.setConfig(cfg);
    renderer.resize();
    this.controller = new PlasmaController(renderer, cfg);
    const onResize = () => renderer.resize();
    window.addEventListener('resize', onResize);

    // prefers-reduced-motion: render one still frame instead of animating.
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const applyMotion = () => {
      if (mq?.matches) {
        renderer.stop();
        renderer.renderAt(renderer.time);
      } else {
        renderer.start();
      }
    };
    applyMotion();
    mq?.addEventListener?.('change', applyMotion);

    this.cleanup = () => {
      window.removeEventListener('resize', onResize);
      mq?.removeEventListener?.('change', applyMotion);
    };
    this.renderer = renderer;
  }

  private cleanup: (() => void) | null = null;

  disconnectedCallback() {
    this.controller?.dispose();
    this.controller = null;
    this.cleanup?.();
    this.cleanup = null;
    this.renderer?.dispose();
    this.renderer = null;
  }

  set(patch: DeepPartial<CoreConfig>): void {
    this.controller?.set(patch);
  }

  animateTo(patch: DeepPartial<CoreConfig>, opts?: AnimateOpts): Promise<void> {
    return this.controller?.animateTo(patch, opts) ?? Promise.resolve();
  }

  timeline(tl: Timeline): void {
    this.controller?.timeline(tl);
  }

  play(opts?: { loop?: boolean }): void {
    this.controller?.play(opts);
  }

  pause(): void {
    this.controller?.pause();
  }

  seek(t: number): void {
    this.controller?.seek(t);
  }

  getConfig(): CoreConfig | null {
    return this.controller?.getConfig() ?? null;
  }

  get progress(): number {
    return this.controller?.progress ?? 0;
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('plasma-bg')) {
  customElements.define('plasma-bg', PlasmaBg);
}
