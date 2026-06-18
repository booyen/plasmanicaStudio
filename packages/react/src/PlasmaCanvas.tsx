// Thin React wrapper that owns a framework-free PlasmaRenderer for the canvas'
// lifetime. The renderer runs entirely outside React — config flows in via the
// optional `config` prop (controlled use) or via `onReady` (store-driven studio,
// which subscribes the renderer to a store so slider drags never re-render).
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { PlasmaRenderer, paletteGradientCss, defaultConfig, type CoreConfig } from '@effects/core';

export type PlasmaCanvasProps = {
  /** Controlled config. Omit to drive the renderer entirely via `onReady`. */
  config?: CoreConfig;
  paused?: boolean;
  /**
   * Called once with the renderer when it mounts. Return a cleanup function
   * (e.g. a store unsubscribe) and it runs when the renderer is disposed.
   */
  onReady?: (renderer: PlasmaRenderer) => void | (() => void);
  className?: string;
  style?: CSSProperties;
};

export function PlasmaCanvas({ config, paused, onReady, className, style }: PlasmaCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<PlasmaRenderer | null>(null);
  // Read latest config/onReady from the mount effect without re-running it.
  const configRef = useRef(config);
  configRef.current = config;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const [failed, setFailed] = useState(false);

  // Mount: own the renderer for the canvas' lifetime. StrictMode double-invokes
  // this effect; dispose() is idempotent so the throwaway first renderer is safe.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return; // fallback branch rendered a div, not the canvas
    let renderer: PlasmaRenderer;
    try {
      renderer = new PlasmaRenderer(canvas);
    } catch {
      setFailed(true); // never-black: WebGL unavailable → CSS gradient fallback
      return;
    }
    rendererRef.current = renderer;
    if (configRef.current) renderer.setConfig(configRef.current);
    renderer.resize();
    renderer.start();
    const cleanup = onReadyRef.current?.(renderer);

    const ro = new ResizeObserver(() => renderer.resize());
    ro.observe(canvas);

    return () => {
      if (typeof cleanup === 'function') cleanup();
      ro.disconnect();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  // Controlled-config updates (store-driven studio leaves `config` undefined).
  useEffect(() => {
    if (config) rendererRef.current?.setConfig(config);
  }, [config]);

  useEffect(() => {
    rendererRef.current?.setPaused(!!paused);
  }, [paused]);

  if (failed) {
    const cfg = configRef.current ?? defaultConfig;
    return (
      <div
        className={className}
        style={{ ...style, background: paletteGradientCss(cfg.palette, cfg.bg) }}
        role="img"
        aria-label="plasma background (static fallback)"
      />
    );
  }

  return <canvas ref={canvasRef} className={className} style={style} />;
}
