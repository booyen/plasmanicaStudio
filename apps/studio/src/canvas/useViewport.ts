// Infinite-canvas viewport transform: { x, y, zoom } applied as a CSS transform
// to the centered artboard frame. Zoom is anchored at the cursor; pan is driven
// by the caller (space-drag / middle-drag). The frame's layout box is unchanged
// by zoom, so the renderer's backing store only resizes on aspect change.
import { useCallback, useRef, useState, type RefObject } from 'react';

export type Viewport = { x: number; y: number; zoom: number };

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export function useViewport(
  containerRef: RefObject<HTMLElement | null>,
  frameSize: () => { w: number; h: number },
) {
  const [vp, setVp] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });

  // The frame is centered in the container, transform-origin center, so a frame
  // point at offset f from its center renders at: containerCenter + (x,y) + zoom*f.
  // Holding f under the cursor while zooming gives: (x,y)' = s(1 - z'/z) + (x,y)(z'/z).
  const zoomAt = useCallback(
    (screenX: number, screenY: number, factor: number) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const sx = screenX - (rect.left + rect.width / 2);
      const sy = screenY - (rect.top + rect.height / 2);
      setVp((p) => {
        const z2 = clampZoom(p.zoom * factor);
        if (z2 === p.zoom) return p;
        const k = z2 / p.zoom;
        return { zoom: z2, x: sx * (1 - k) + p.x * k, y: sy * (1 - k) + p.y * k };
      });
    },
    [containerRef],
  );

  // Pan: caller calls startPan on a qualifying pointerdown, then movePan/endPan.
  const pan = useRef({ active: false, px: 0, py: 0 });
  const startPan = useCallback((clientX: number, clientY: number) => {
    pan.current = { active: true, px: clientX, py: clientY };
  }, []);
  const movePan = useCallback((clientX: number, clientY: number) => {
    if (!pan.current.active) return;
    const dx = clientX - pan.current.px;
    const dy = clientY - pan.current.py;
    pan.current.px = clientX;
    pan.current.py = clientY;
    setVp((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
  }, []);
  const endPan = useCallback(() => {
    pan.current.active = false;
  }, []);

  const reset = useCallback(() => setVp({ x: 0, y: 0, zoom: 1 }), []);

  /** Center the frame and scale it to fit the container with padding. */
  const fit = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const { w, h } = frameSize();
    const pad = 64;
    const z = clampZoom(Math.min((rect.width - pad) / w, (rect.height - pad) / h));
    setVp({ x: 0, y: 0, zoom: z });
  }, [containerRef, frameSize]);

  return { vp, zoomAt, startPan, movePan, endPan, reset, fit };
}
