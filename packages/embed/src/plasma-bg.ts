// <plasma-bg> — a framework-free custom element that runs the core PlasmaRenderer
// from a `config` attribute (JSON). No React, no zod (config is trusted JSON, not
// re-validated), so the bundle stays small enough to drop onto any page.
import { PlasmaRenderer, type CoreConfig } from '@effects/core';

export class PlasmaBg extends HTMLElement {
  private renderer: PlasmaRenderer | null = null;

  connectedCallback() {
    if (this.renderer) return;
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:100%;height:100%;display:block';
    this.appendChild(canvas);

    const renderer = new PlasmaRenderer(canvas);
    const raw = this.getAttribute('config');
    if (raw) {
      try {
        renderer.setConfig(JSON.parse(raw) as CoreConfig);
      } catch {
        // keep engine defaults on a malformed attribute
      }
    }
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
