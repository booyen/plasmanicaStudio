// <plasma-bg> — a framework-free custom element that runs the core PlasmaRenderer
// from a `config` attribute (JSON). No React, no zod (config is trusted JSON, not
// re-validated), so the bundle stays small enough to drop onto any page.
import { PlasmaRenderer, paletteGradientCss, defaultConfig, type CoreConfig } from '@effects/core';

export class PlasmaBg extends HTMLElement {
  private renderer: PlasmaRenderer | null = null;

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
    const onResize = () => renderer.resize();
    window.addEventListener('resize', onResize);
    this.cleanup = () => window.removeEventListener('resize', onResize);
    renderer.resize();
    renderer.start();
    this.renderer = renderer;
  }

  private cleanup: (() => void) | null = null;

  disconnectedCallback() {
    this.cleanup?.();
    this.cleanup = null;
    this.renderer?.dispose();
    this.renderer = null;
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('plasma-bg')) {
  customElements.define('plasma-bg', PlasmaBg);
}
